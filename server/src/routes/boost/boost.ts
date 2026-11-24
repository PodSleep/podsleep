// PodSleep: Cold Shot / Heat boost, run on the Pod so the bed always returns
// to its previous setting, even if the phone is locked or the app is closed.
//
//   GET    /api/boost  -> current boost or null
//   POST   /api/boost  { kind: 'cold' | 'heat', sides: ['left'|'right'], minutes? }
//   DELETE /api/boost  -> stop now and restore
//   DELETE /api/boost?restore=false -> stop now, leave the bed as it is
//                       (used when you change the temperature or power mid-boost)
//
// The boost is saved to disk, so a server restart still restores the bed.
import express, { Request, Response } from 'express';
import fs from 'fs';
import { z } from 'zod';
import { connectFranken } from '../../8sleep/frankenServer.js';
import { updateDeviceStatus } from '../deviceStatus/updateDeviceStatus.js';
import logger from '../../logger.js';
import config from '../../config.js';

const MIN_F = 55;
const MAX_F = 110;
const DEFAULT_MINUTES = 15;

type Side = 'left' | 'right';
type Previous = { targetTemperatureF: number; isOn: boolean };
export type Boost = {
  kind: 'cold' | 'heat';
  sides: Side[];
  until: number; // epoch ms
  previous: Partial<Record<Side, Previous>>;
};

const BoostRequestSchema = z.object({
  kind: z.enum(['cold', 'heat']),
  sides: z.array(z.enum(['left', 'right'])).min(1).max(2),
  minutes: z.number().int().min(1).max(30).optional(),
}).strict();

const boostFile = () => `${config.lowDbFolder}podsleepBoost.json`;

let current: Boost | null = null;
let timer: NodeJS.Timeout | null = null;

const save = () => {
  try {
    if (current) fs.writeFileSync(boostFile(), JSON.stringify(current));
    else if (fs.existsSync(boostFile())) fs.unlinkSync(boostFile());
  } catch (error) {
    logger.error('PodSleep boost: could not save state', error);
  }
};

const schedule = () => {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!current) return;
  const wait = Math.max(0, current.until - Date.now());
  timer = setTimeout(() => { void restore('timer'); }, wait);
};

export const restore = async (reason: string) => {
  const boost = current;
  if (!boost) return;
  if (timer) clearTimeout(timer);
  timer = null;
  logger.info(`PodSleep boost: restoring (${reason})`);
  try {
    // Only touch power if the bed was off before, so the Pod's own timer is left alone.
    const update: Record<string, Partial<Previous>> = {};
    for (const side of boost.sides) {
      const prev = boost.previous[side];
      if (prev) update[side] = prev.isOn ? { targetTemperatureF: prev.targetTemperatureF } : prev;
    }
    await updateDeviceStatus(update);
    current = null;
    save();
  } catch (error) {
    // Keep the boost on record and try again shortly.
    logger.error('PodSleep boost: restore failed, retrying in 30s', error);
    timer = setTimeout(() => { void restore('retry'); }, 30_000);
  }
};

// Called once at start-up: finish or resume a boost that was running.
export const resumeBoost = () => {
  try {
    if (!fs.existsSync(boostFile())) return;
    current = JSON.parse(fs.readFileSync(boostFile(), 'utf8')) as Boost;
    logger.info('PodSleep boost: resuming saved boost');
    schedule();
  } catch (error) {
    logger.error('PodSleep boost: could not read saved state', error);
  }
};

const router = express.Router();

router.get('/boost', (_req: Request, res: Response) => {
  res.json(current);
});

router.post('/boost', async (req: Request, res: Response) => {
  const parsed = BoostRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request data', details: parsed.error.errors });
    return;
  }
  const { kind, sides, minutes = DEFAULT_MINUTES } = parsed.data;

  // Starting a new boost while one runs: keep the original "previous" so we
  // never restore to a boosted temperature.
  const franken = await connectFranken();
  const status = await franken.getDeviceStatus();
  const previous: Boost['previous'] = { ...(current?.previous ?? {}) };
  for (const side of sides) {
    if (!previous[side]) {
      previous[side] = {
        targetTemperatureF: status[side].targetTemperatureF,
        isOn: status[side].isOn,
      };
    }
  }
  const allSides = Array.from(new Set([...(current?.sides ?? []), ...sides])) as Side[];

  const target = kind === 'cold' ? MIN_F : MAX_F;
  const update: Record<string, { targetTemperatureF: number; isOn?: boolean }> = {};
  for (const side of sides) {
    update[side] = status[side].isOn ? { targetTemperatureF: target } : { targetTemperatureF: target, isOn: true };
  }
  await updateDeviceStatus(update);

  current = { kind, sides: allSides, until: Date.now() + minutes * 60_000, previous };
  save();
  schedule();
  res.json(current);
});

router.delete('/boost', async (req: Request, res: Response) => {
  if (req.query.restore === 'false') {
    if (timer) clearTimeout(timer);
    timer = null;
    current = null;
    save();
    logger.info('PodSleep boost: cancelled without restoring');
  } else {
    await restore('stopped');
  }
  res.json(current);
});

export default router;
