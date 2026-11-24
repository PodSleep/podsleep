import type { DailySchedule, DayOfWeek, Side } from '@api/schedulesSchema.ts';

export type Unit = 'C' | 'F' | 'L';
export type { Side, DayOfWeek };

export const MIN_F = 55;
export const MAX_F = 110;

export const DAYS: { key: DayOfWeek; short: string; full: string; chip: string }[] = [
  { key: 'monday', short: 'Mon', full: 'Monday', chip: 'Mo' },
  { key: 'tuesday', short: 'Tue', full: 'Tuesday', chip: 'Tu' },
  { key: 'wednesday', short: 'Wed', full: 'Wednesday', chip: 'We' },
  { key: 'thursday', short: 'Thu', full: 'Thursday', chip: 'Th' },
  { key: 'friday', short: 'Fri', full: 'Friday', chip: 'Fr' },
  { key: 'saturday', short: 'Sat', full: 'Saturday', chip: 'Sa' },
  { key: 'sunday', short: 'Sun', full: 'Sunday', chip: 'Su' },
];

export const todayKey = (d = new Date()): DayOfWeek => {
  const js = d.getDay(); // 0 Sunday
  return DAYS[(js + 6) % 7].key;
};

// ---------- temperature ----------
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const fToC = (f: number) => (f - 32) * 5 / 9;
export const cToF = (c: number) => c * 9 / 5 + 32;
export const roundHalf = (v: number) => Math.round(v * 2) / 2;
export const fToLevel = (f: number) => Math.round((f - 82.5) / 27.5 * 10);

export const tempNumber = (f: number, unit: Unit): string => {
  if (unit === 'F') return `${Math.round(f)}`;
  if (unit === 'L') {
    const l = fToLevel(f);
    return l > 0 ? `+${l}` : `${l}`;
  }
  const c = roundHalf(fToC(f));
  return c % 1 === 0 ? c.toFixed(0) : c.toFixed(1);
};

export const fmtTemp = (f: number, unit: Unit) => unit === 'L' ? tempNumber(f, unit) : `${tempNumber(f, unit)}°`;

/** One press of − or +. In °C that is half a degree, otherwise one step. */
export const stepTemp = (f: number, dir: 1 | -1, unit: Unit): number => {
  let next: number;
  if (unit === 'C') {
    const c = roundHalf(fToC(f)) + dir * 0.5;
    next = Math.round(cToF(c));
    if (next === f) next = f + dir;
  } else {
    next = f + dir;
  }
  return clamp(next, MIN_F, MAX_F);
};

// Temperature colour scale (°C stops): cold blue, cool cyan, neutral soft lavender, warm coral, hot coral-red.
export const SCALE: [number, [number, number, number]][] = [
  [13, [63, 111, 240]], [20, [60, 198, 238]], [27, [176, 172, 226]], [34, [238, 154, 134]], [43.5, [228, 104, 90]],
];
const scaleAt = (c: number): [number, number, number] => {
  if (c <= SCALE[0][0]) return SCALE[0][1];
  for (let i = 1; i < SCALE.length; i++) {
    if (c <= SCALE[i][0]) {
      const [a, ca] = SCALE[i - 1];
      const [b, cb] = SCALE[i];
      const k = (c - a) / (b - a);
      return ca.map((v, j) => Math.round(v + (cb[j] - v) * k)) as [number, number, number];
    }
  }
  return SCALE[SCALE.length - 1][1];
};
/** "r,g,b" for a temperature in °F. */
export const tempRgb = (f: number): string => scaleAt(fToC(f)).join(',');
export const tempColor = (f: number) => `rgb(${tempRgb(f)})`;
/** The scale colour at a given opacity, for fills and borders. */
export const tempTint = (f: number, a: number) => `rgba(${tempRgb(f)},${a})`;
/** The scale colour lifted towards white, for text on dark backgrounds. */
export const tempSoft = (f: number) => `rgb(${scaleAt(fToC(f)).map((v) => Math.round(v + (255 - v) * 0.45)).join(',')})`;
/** The whole scale as a CSS gradient, coolest to warmest. */
export const scaleGradient = (dir = '90deg') => {
  const lo = SCALE[0][0];
  const span = SCALE[SCALE.length - 1][0] - lo;
  return `linear-gradient(${dir}, ${SCALE.map(([c, rgb]) => `rgb(${rgb.join(',')}) ${(((c - lo) / span) * 100).toFixed(1)}%`).join(', ')})`;
};
/** Where a °F temperature sits on the Pod's range, 0 to 1. */
export const tempFrac = (f: number) => Math.min(1, Math.max(0, (f - MIN_F) / (MAX_F - MIN_F)));

/**
 * Colour-map tables for lighting the bed photo: shadows stay dark, the fabric takes the colour,
 * highlights lift towards white. Muted is for a side that is on but not selected.
 */
export const lightTables = (f: number, muted = false) => {
  const rgb = scaleAt(fToC(f)).map((v) => v / 255);
  const grey = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return rgb.map((v0) => {
    // Selected: 60% of the scale colour, so it reads as a lit bed rather than a dyed one.
    const v = muted ? v0 * 0.55 + grey * 0.45 : v0 * 0.6 + grey * 0.4;
    const pts = [0, v * 0.18, v * 0.5, v * 0.82, v + (1 - v) * 0.35, v + (1 - v) * 0.6];
    return pts.map((p) => (p * (muted ? 0.5 : 1)).toFixed(3)).join(' ');
  }) as [string, string, string];
};

// ---------- time ----------
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return ((h || 0) * 60 + (m || 0)) % 1440;
};
export const fromMin = (m: number) => {
  const d = ((Math.round(m) % 1440) + 1440) % 1440;
  return `${String(Math.floor(d / 60)).padStart(2, '0')}:${String(d % 60).padStart(2, '0')}`;
};
export const fmtTime = (m: number) => {
  const d = ((Math.round(m) % 1440) + 1440) % 1440;
  const h24 = Math.floor(d / 60);
  const mm = d % 60;
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'am' : 'pm'}`;
};
export const fmtClock = (iso: string | number) => {
  const d = new Date(iso);
  return fmtTime(d.getHours() * 60 + d.getMinutes());
};
export const fmtDuration = (seconds: number) => {
  const m = Math.round(seconds / 60);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
};
/** minutes after `start`, wrapping past midnight */
export const after = (start: number, t: number) => ((t - start) % 1440 + 1440) % 1440;

// ---------- nights ----------
export type Draft = {
  min: number; // °F
  max: number; // °F
  on: number; // minutes, in bed by
  wake: number; // minutes
  deltas: number[]; // °F nudges per phase
  precool: boolean;
  warmWake: boolean;
  alarmOn: boolean;
  extra?: { t: number; f: number }[]; // changes you add yourself (minutes, °F)
};

export const EXTRA_NAME = 'Your change';
export const MAX_EXTRA = 8;

export const PHASE_NAMES = ['Getting into bed', 'Deep sleep', 'Later in the night', 'Before waking', 'Warm wake-up'];
const q15 = (m: number) => Math.round(m / 15) * 15;

export const suggested = (d: Pick<Draft, 'min' | 'max'>) => {
  const mid = Math.round((d.min + d.max) / 2);
  return [mid, d.min, Math.round(d.min + (d.max - d.min) * 0.25), mid, d.max];
};

export const buildNight = (d: Draft) => {
  const night = after(d.on, d.wake) || 1440;
  const auto = suggested(d);
  const temps = auto.map((v, i) => clamp(v + (d.deltas[i] || 0), d.min, d.max));
  const times = [
    d.precool ? d.on - 30 : d.on,
    q15(d.on + Math.min(90, night * 0.2)),
    q15(d.on + night * 0.55),
    d.wake - 60,
    d.wake - 30,
  ].map((m) => ((m % 1440) + 1440) % 1440);
  const phases = PHASE_NAMES.map((name, i) => ({ i, name, t: times[i], f: temps[i] }))
    .filter((p) => p.i !== 4 || d.warmWake);
  const extras = (d.extra || []).map((x, k) => ({ i: 100 + k, name: EXTRA_NAME, t: ((x.t % 1440) + 1440) % 1440, f: clamp(x.f, d.min, d.max) }));
  return { phases, extras, mid: Math.round((d.min + d.max) / 2), off: (d.wake + 30) % 1440, auto };
};

export const DEFAULT_DRAFT: Draft = {
  min: 73, max: 84, on: 21 * 60 + 30, wake: 7 * 60, deltas: [0, 0, 0, 0, 0], precool: true, warmWake: true, alarmOn: true,
};

export type AlarmFeel = { vibrationPattern: 'rise' | 'double'; vibrationIntensity: number; duration: number };
export const DEFAULT_FEEL: AlarmFeel = { vibrationPattern: 'rise', vibrationIntensity: 60, duration: 120 };

export const draftToDaily = (d: Draft, feel: AlarmFeel): DailySchedule => {
  const { phases, extras, off } = buildNight(d);
  const temperatures: Record<string, number> = {};
  phases.slice(1).forEach((p) => { temperatures[fromMin(p.t)] = p.f; });
  extras.forEach((p) => { if (p.t !== phases[0].t) temperatures[fromMin(p.t)] = p.f; }); // yours win on a clash
  return {
    power: { on: fromMin(phases[0].t), off: fromMin(off), onTemperature: phases[0].f, enabled: true },
    temperatures,
    alarm: {
      time: fromMin(d.wake),
      enabled: d.alarmOn,
      alarmTemperature: d.warmWake ? d.max : phases[phases.length - 1].f,
      ...feel,
    },
  };
};

/** Read a saved night back into the editor. Uses what PodSleep remembered if it still matches. */
export const dailyToDraft = (daily: DailySchedule, meta?: Draft): Draft => {
  const onSaved = toMin(daily.power.on);
  if (meta && fromMin(buildNight(meta).phases[0].t) === daily.power.on) return { ...meta, alarmOn: daily.alarm.enabled };
  const temps = [daily.power.onTemperature, ...Object.values(daily.temperatures)];
  const wake = daily.alarm?.time ? toMin(daily.alarm.time) : (toMin(daily.power.off) - 30 + 1440) % 1440;
  return {
    min: clamp(Math.min(...temps), MIN_F, MAX_F - 2),
    max: clamp(Math.max(...temps), MIN_F + 2, MAX_F),
    on: onSaved, wake, deltas: [0, 0, 0, 0, 0], precool: false, warmWake: false, alarmOn: daily.alarm?.enabled ?? true,
  };
};

export type NightState = 'on' | 'off' | 'empty';
export const nightState = (daily?: DailySchedule): NightState => {
  if (!daily) return 'empty';
  if (daily.power.enabled) return 'on';
  if (Object.keys(daily.temperatures || {}).length || daily.alarm?.enabled) return 'off';
  return 'empty';
};

/** Phases of a saved night in time order, starting at bed-on. */
export const savedPhases = (daily: DailySchedule) => {
  const on = toMin(daily.power.on);
  const list = [{ t: on, f: daily.power.onTemperature }].concat(
    Object.entries(daily.temperatures || {}).map(([k, f]) => ({ t: toMin(k), f })),
  );
  return list.sort((a, b) => after(on, a.t) - after(on, b.t));
};

// ---------- local memory (this phone only) ----------
export const local = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = window.localStorage.getItem(`podsleep.${key}`);
      return raw ? JSON.parse(raw) as T : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      window.localStorage.setItem(`podsleep.${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  },
};
