import { http, HttpResponse } from 'msw/http';
import { delay } from 'msw/utils/delay';
import { sse } from 'msw/sse';
import type { SleepRecord } from '@api/sleepSchema.ts';
import type { Jobs } from '@api/jobs.ts';
import {
  getServices,
  updateServices,
  getSchedules,
  updateSchedules,
  getSettings,
  updateSettings,
  getDeviceStatus,
  updateDeviceStatus,
  getServerStatus,
  listSleepRecords,
  setSleepRecords,
  listMovementRecords,
  listVitalsRecords,
  filterByQuery,
  listLogs,
  getLogFiles,
  handleJobs,
} from './mockData';

type Side = 'left' | 'right';

type Filters = {
  startTime?: string;
  endTime?: string;
  side?: Side;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const toFilters = (request: Request): Filters => {
  const url = new URL(request.url);
  const startTime = url.searchParams.get('startTime') ?? undefined;
  const endTime = url.searchParams.get('endTime') ?? undefined;
  const sideParam = url.searchParams.get('side') ?? undefined;
  const side = sideParam === 'left' || sideParam === 'right' ? sideParam : undefined;
  return { startTime, endTime, side };
};

const notFound = (message: string) => HttpResponse.json({ message }, { status: 404 });

// PodSleep: demo version of the Pod's boost route.
let demoBoost: any = null;
let demoBoostTimer: ReturnType<typeof setTimeout> | undefined;
const endDemoBoost = (restore: boolean) => {
  clearTimeout(demoBoostTimer);
  if (demoBoost && restore) updateDeviceStatus(demoBoost.previous);
  demoBoost = null;
};

export const handlers = [
  http.get('/api/boost', async () => HttpResponse.json(demoBoost)),
  http.post('/api/boost', async ({ request }) => {
    const { kind, sides, minutes = 15 } = (await request.json()) as { kind: 'cold' | 'heat'; sides: ('left' | 'right')[]; minutes?: number };
    const status = getDeviceStatus() as any;
    const previous = { ...(demoBoost?.previous ?? {}) };
    sides.forEach((s) => { previous[s] ??= { targetTemperatureF: status[s].targetTemperatureF, isOn: status[s].isOn }; });
    const target = kind === 'cold' ? 55 : 110;
    updateDeviceStatus(Object.fromEntries(sides.map((s) => [s, { targetTemperatureF: target, isOn: true }])) as any);
    demoBoost = { kind, sides: Array.from(new Set([...(demoBoost?.sides ?? []), ...sides])), until: Date.now() + minutes * 60_000, previous };
    clearTimeout(demoBoostTimer);
    demoBoostTimer = setTimeout(() => endDemoBoost(true), minutes * 60_000);
    return HttpResponse.json(demoBoost);
  }),
  http.delete('/api/boost', async ({ request }) => {
    endDemoBoost(new URL(request.url).searchParams.get('restore') !== 'false');
    return HttpResponse.json(null);
  }),
  http.get('/api/services', async () => {
    await delay(120);
    return HttpResponse.json(deepClone(getServices()));
  }),
  http.post('/api/services', async ({ request }) => {
    const body = (await request.json()) as Partial<ReturnType<typeof getServices>>;
    const updated = updateServices(body);
    await delay(120);
    return HttpResponse.json(deepClone(updated));
  }),
  http.get('/api/schedules', async () => {
    await delay(120);
    return HttpResponse.json(deepClone(getSchedules()));
  }),
  http.post('/api/schedules', async ({ request }) => {
    const body = (await request.json()) as Partial<ReturnType<typeof getSchedules>>;
    const updated = updateSchedules(body);
    await delay(120);
    return HttpResponse.json(deepClone(updated));
  }),
  http.get('/api/settings', async () => {
    await delay(120);
    return HttpResponse.json(deepClone(getSettings()));
  }),
  http.post('/api/settings', async ({ request }) => {
    const body = (await request.json()) as Partial<ReturnType<typeof getSettings>>;
    const updated = updateSettings(body);
    await delay(120);
    return HttpResponse.json(deepClone(updated));
  }),
  http.get('/api/deviceStatus', async () => {
    // Demo: each side drifts towards its target, so colours and Cold Shot / Heat Boost visibly move.
    const ds = getDeviceStatus();
    for (const s of ['left', 'right'] as const) {
      const d = ds[s];
      if (!d.isOn) continue;
      const gap = d.targetTemperatureF - d.currentTemperatureF;
      if (Math.abs(gap) >= 0.5) updateDeviceStatus({ [s]: { currentTemperatureF: Math.round((d.currentTemperatureF + Math.sign(gap) * Math.min(Math.abs(gap), 4)) * 10) / 10 } } as never);
    }
    await delay(120);
    return HttpResponse.json(deepClone(getDeviceStatus()));
  }),
  http.post('/api/deviceStatus', async ({ request }) => {
    const body = (await request.json()) as Partial<ReturnType<typeof getDeviceStatus>>;
    updateDeviceStatus(body);
    await delay(120);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/serverStatus', async () => {
    await delay(150);
    return HttpResponse.json(deepClone(getServerStatus()));
  }),
  http.get('/api/metrics/sleep', async ({ request }) => {
    const filters = toFilters(request);
    const records = listSleepRecords();
    // @ts-expect-error
    const filtered = filterByQuery(records, filters, (record: SleepRecord) => Date.parse(record.entered_bed_at));
    await delay(150);
    return HttpResponse.json(deepClone(filtered));
  }),
  http.delete('/api/metrics/sleep/:id', async ({ params }) => {
    const id = Number(params.id);
    const records = listSleepRecords();
    const next = records.filter((record) => record.id !== id);
    if (next.length === records.length) {
      return notFound('Sleep record not found');
    }
    setSleepRecords(next);
    await delay(80);
    return new HttpResponse(null, { status: 204 });
  }),
  http.put('/api/metrics/sleep/:id', async ({ params, request }) => {
    const id = Number(params.id);
    const updates = (await request.json()) as Partial<SleepRecord>;
    const records = deepClone(listSleepRecords());
    const index = records.findIndex((record) => record.id === id);
    if (index === -1) {
      return notFound('Sleep record not found');
    }
    const updatedRecord = { ...records[index], ...updates } satisfies SleepRecord;
    records[index] = updatedRecord;
    setSleepRecords(records);
    await delay(80);
    return HttpResponse.json(updatedRecord);
  }),
  http.get('/api/metrics/movement', async () => {
    // const filters = toFilters(request);
    const records = listMovementRecords();
    // const filtered = filterByQuery(records, filters, (record: MovementRecord) => record.timestamp * 1000);
    await delay(120);
    return HttpResponse.json(records);
  }),
  http.get('/api/metrics/vitals', async () => {
    // const filters = toFilters(request);
    const records = listVitalsRecords();
    // const filtered = filterByQuery(records, filters, (record: VitalsRecord) => record.timestamp * 1000);
    await delay(120);
    return HttpResponse.json(records);
  }),
  http.get('/api/metrics/vitals/summary', async () => {
    await delay(120);
    return HttpResponse.json({
      avgHeartRate: 55,
      minHeartRate: 45,
      maxHeartRate: 68,
      avgHRV: 63,
      avgBreathingRate: 12,
    });
  }),
  http.post('/api/jobs', async ({ request }) => {
    const jobs = (await request.json()) as Jobs;
    handleJobs(jobs);
    await delay(150);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get('/api/logs', async () => {
    await delay(120);
    return HttpResponse.json({ logs: getLogFiles() });
  }),
  // Stream existing and newly appended demo log entries until the viewer disconnects.
  sse('/api/logs/:filename', ({ params, request, client }) => {
    const filename = String(params.filename);
    const logStore = listLogs();
    const initialLogs = deepClone(logStore[filename] ?? []);
    if (!logStore[filename]) {
      client.send({ data: JSON.stringify({ message: 'Log file not found' }) });
      client.close();
      return;
    }

    initialLogs.forEach((entry) => {
      client.send({ data: JSON.stringify({ message: entry }) });
    });
    let lastIndex = initialLogs.length;
    const interval = setInterval(() => {
      const latest = listLogs()[filename] ?? [];
      if (latest.length > lastIndex) {
        latest.slice(lastIndex).forEach((entry) => {
          client.send({ data: JSON.stringify({ message: entry }) });
        });
        lastIndex = latest.length;
      }
    }, 2000);
    request.signal.addEventListener('abort', () => clearInterval(interval), { once: true });
  }),
];
