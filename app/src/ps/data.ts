import _ from 'lodash';
import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from '@api/api';
import type { DeepPartial } from 'ts-essentials';
import { postDeviceStatus, useDeviceStatus } from '@api/deviceStatus';
import { postSettings, useSettings } from '@api/settings';
import { postSchedules, useSchedules } from '@api/schedules';
import type { DeviceStatus } from '@api/deviceStatusSchema';
import type { Settings } from '@api/settingsSchema';
import type { Schedules } from '@api/schedulesSchema.ts';
import { useApp } from './store';
import type { Side, Unit } from './lib';

export { useDeviceStatus, useSettings, useSchedules };

export const useUnit = (): Unit => {
  const { data } = useSettings();
  const showLevel = useApp((s) => s.showLevel);
  if (showLevel) return 'L';
  return data?.temperatureFormat === 'fahrenheit' ? 'F' : 'C';
};

/** Writes to the Pod. Updates the screen straight away, then re-reads from the Pod. */
export const useSave = () => {
  const qc = useQueryClient();
  const say = useApp((s) => s.say);
  const fail = () => say('Couldn’t reach the Pod. Try again.');

  const device = async (patch: DeepPartial<DeviceStatus>) => {
    qc.setQueryData<DeviceStatus>(['useDeviceStatus'], (old) => old ? _.merge(_.cloneDeep(old), patch) : old);
    try {
      await postDeviceStatus(patch);
    } catch {
      fail();
    }
    window.setTimeout(() => qc.invalidateQueries({ queryKey: ['useDeviceStatus'] }), 1500);
  };

  const settings = async (patch: DeepPartial<Settings>) => {
    qc.setQueryData<Settings>(['useSettings'], (old) => old ? _.merge(_.cloneDeep(old), patch) : old);
    try {
      await postSettings(patch);
    } catch {
      fail();
    }
    qc.invalidateQueries({ queryKey: ['useSettings'] });
  };

  /** Same rules as the Pod: power is merged, temperatures and alarm are replaced. */
  const schedules = async (patch: DeepPartial<Schedules>) => {
    qc.setQueryData<Schedules>(['useSchedules'], (old) => {
      if (!old) return old;
      const next = _.cloneDeep(old);
      Object.entries(patch).forEach(([side, days]) => {
        Object.entries(days || {}).forEach(([day, s]) => {
          const target = (next as any)[side][day];
          if (s?.power) _.merge(target.power, s.power);
          if (s?.temperatures) target.temperatures = s.temperatures;
          if (s?.alarm) target.alarm = s.alarm;
        });
      });
      return next;
    });
    try {
      await postSchedules(patch);
    } catch {
      fail();
    }
    qc.invalidateQueries({ queryKey: ['useSchedules'] });
  };

  return { device, settings, schedules };
};

/** Cold Shot / Heat Boost. The Pod runs the timer and puts the bed back afterwards. */
export type Boost = {
  kind: 'cold' | 'heat';
  sides: Side[];
  until: number;
  previous: Partial<Record<Side, { targetTemperatureF: number; isOn: boolean }>>;
};

export const useBoost = () => useQuery<Boost | null>({
  queryKey: ['podsleepBoost'],
  queryFn: async () => (await axios.get<Boost | null>('/boost')).data ?? null,
  refetchInterval: 15_000,
  refetchOnWindowFocus: true,
  retry: false,
});

export const useBoostActions = () => {
  const qc = useQueryClient();
  const say = useApp((s) => s.say);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['podsleepBoost'] });
    window.setTimeout(() => qc.invalidateQueries({ queryKey: ['useDeviceStatus'] }), 1000);
  };
  const failed = (e: unknown) => {
    const missing = (e as { response?: { status?: number } })?.response?.status === 404;
    say(missing ? 'Cold Shot and Heat Boost need the PodSleep add-on on the Pod.' : 'Couldn’t reach the Pod. Try again.');
  };

  const start = async (kind: Boost['kind'], sides: Side[]) => {
    try {
      const { data } = await axios.post<Boost>('/boost', { kind, sides });
      qc.setQueryData(['podsleepBoost'], data);
      refresh();
    } catch (e) { failed(e); }
  };

  /** restore = false leaves the bed as it is (used when you change it yourself mid-boost). */
  const stop = async (restore = true) => {
    qc.setQueryData(['podsleepBoost'], null);
    try {
      await axios.delete('/boost', { params: restore ? {} : { restore: 'false' } });
    } catch (e) { failed(e); }
    refresh();
  };

  return { start, stop };
};

/** Says when the Pod finishes a boost, and refreshes the bed temperatures. */
export const useBoostNotice = () => {
  const { data } = useBoost();
  const qc = useQueryClient();
  const say = useApp((s) => s.say);
  const last = useRef<Boost | null | undefined>(undefined);
  useEffect(() => {
    const prev = last.current;
    last.current = data;
    if (prev && data === null && prev.until <= Date.now() + 5000) {
      say(prev.kind === 'cold' ? 'Cold Shot finished' : 'Heat Boost finished');
      qc.invalidateQueries({ queryKey: ['useDeviceStatus'] });
    }
  }, [data, qc, say]);
  // Check again right when it is due, rather than waiting for the next poll.
  useEffect(() => {
    if (!data) return;
    const t = window.setTimeout(() => qc.invalidateQueries({ queryKey: ['podsleepBoost'] }), Math.max(0, data.until - Date.now()) + 1500);
    return () => window.clearTimeout(t);
  }, [data, qc]);
};
