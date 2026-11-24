import { useMemo, useState } from 'react';
import type { DailySchedule } from '@api/schedulesSchema.ts';
import { useSave, useSchedules, useUnit } from './data';
import { useApp } from './store';
import {
  buildNight, clamp, DAYS, DEFAULT_DRAFT, DEFAULT_FEEL, dailyToDraft, draftToDaily, fmtTemp, fmtTime, local, nightState,
  savedPhases, suggested, todayKey, toMin, type AlarmFeel, type DayOfWeek, type Draft, type Side, type Unit, MIN_F, MAX_F, EXTRA_NAME, MAX_EXTRA, after, scaleGradient, tempColor, tempSoft, tempTint } from './lib';
import { Icon, Loading, SideSwitch, Switch, Tile, TILES } from './ui';

const SLIDER_LO = MIN_F; // the Pod's coolest, 13 °C
const SLIDER_HI = MAX_F; // the Pod's warmest, 43.5 °C
const metaKey = (side: Side, day: DayOfWeek) => `meta.${side}.${day}`;
// Each temperature is shown in its colour on the scale, the same colour the bed lights up in.
const warmOrCool = (f: number, _mid?: number) => tempSoft(f);

// Nights before a work day.
const WEEKNIGHTS: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];

const timeOptions = (from: number, to: number, current: number) => {
  const list: number[] = [];
  for (let m = from; m <= to; m += 30) list.push(m % 1440);
  if (!list.includes(current)) list.push(current);
  return list.sort((a, b) => ((a - from + 1440) % 1440) - ((b - from + 1440) % 1440));
};

const DayStrip = ({ day, setDay, states }: { day: DayOfWeek; setDay: (d: DayOfWeek) => void; states: Record<string, ReturnType<typeof nightState>> }) => (
  <div role="tablist" aria-label="Night of the week"
       style={ { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, padding: 6, borderRadius: 22, background: 'var(--card)', border: '1px solid var(--line)' } }>
    { DAYS.map((d) => {
      const s = states[d.key];
      const sel = d.key === day;
      return (
        <button key={ d.key } type="button" role="tab" aria-selected={ sel } onClick={ () => setDay(d.key) }
                aria-label={ `${d.full}, ${s === 'on' ? 'schedule on' : s === 'off' ? 'schedule off' : 'not set'}` }
                style={ { minHeight: 58, borderRadius: 16, border: 0, padding: '6px 0', background: sel ? '#2d2b32' : 'transparent', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 } }>
          <span style={ { fontSize: 13, fontWeight: 600, color: s === 'on' ? '#6fd0ef' : s === 'off' ? '#85818b' : '#6f7789' } }>{ d.short }</span>
          <span style={ { width: 6, height: 6, borderRadius: 99, boxSizing: 'border-box', background: s === 'on' ? 'var(--cool)' : 'transparent', border: s === 'off' ? '1.5px solid #85818b' : 0 } }/>
        </button>
      );
    }) }
  </div>
);

const Stepper = ({ value, onDown, onUp, label, color }: { value: string; onDown: () => void; onUp: () => void; label: string; color: string }) => (
  <div className="row" style={ { gap: 2, padding: 3, borderRadius: 999, background: 'var(--card-2)', border: '1px solid #34323a', flex: 'none' } }>
    <button type="button" aria-label={ `${label} cooler` } onClick={ onDown } style={ { width: 44, height: 36, borderRadius: 999, border: '1.5px solid #3a6f90', background: 'rgba(40,90,120,.15)', color: '#6fd0ef', fontSize: 18, padding: 0 } }>−</button>
    <span className="num" style={ { minWidth: 54, textAlign: 'center', fontSize: 16, fontWeight: 600, color } }>{ value }</span>
    <button type="button" aria-label={ `${label} warmer` } onClick={ onUp } style={ { width: 44, height: 36, borderRadius: 999, border: '1.5px solid #a85a50', background: 'rgba(150,60,50,.15)', color: '#ff9f90', fontSize: 18, padding: 0 } }>+</button>
  </div>
);

const Editor = ({ title, initial, unit, onSave, onClose, onClear }: {
  title: string; initial: Draft; unit: Unit; onSave: (d: Draft) => void; onClose: () => void; onClear: () => void;
}) => {
  const [d, setD] = useState<Draft>(initial);
  const set = (p: Partial<Draft>) => setD((old) => ({ ...old, ...p }));
  const plan = buildNight(d);
  const auto = suggested(d);
  const tweaked = d.deltas.some((x) => x !== 0);

  const W = 100; // percentages
  const centre = (f: number) => (clamp((f - SLIDER_LO) / (SLIDER_HI - SLIDER_LO), 0, 1));
  const pos = (f: number) => `calc(24px + ${centre(f) * W}% - ${centre(f) * 48}px)`;

  const phaseRow = (i: number) => {
    const p = plan.phases.find((x) => x.i === i);
    if (!p) return null;
    const bump = (dir: 1 | -1) => {
      const deltas = d.deltas.slice();
      deltas[i] = clamp(p.f + dir, d.min, d.max) - auto[i];
      set({ deltas });
    };
    return (
      <div key={ i } className="row" style={ { minHeight: 64 } }>
        <div className="grow">
          <div style={ { fontSize: 15, fontWeight: 500 } }>{ p.name }</div>
          <div className="small" style={ { color: 'var(--faint)', marginTop: 2 } }>{ i === 0 && d.precool ? 'Pod on ' : 'From ' }{ fmtTime(p.t) }</div>
        </div>
        <Stepper value={ fmtTemp(p.f, unit) } color={ warmOrCool(p.f, plan.mid) } label={ p.name } onDown={ () => bump(-1) } onUp={ () => bump(1) }/>
      </div>
    );
  };

  // Changes you add yourself: pick a time and a temperature.
  const nightTimes = (() => {
    const list: number[] = [];
    const len = after(d.on, (d.wake + 30) % 1440) || 1440;
    for (let m = 15; m < len; m += 15) list.push((d.on + m) % 1440);
    return list;
  })();
  const setExtra = (k: number, p: Partial<{ t: number; f: number }>) => {
    const extra = (d.extra || []).slice();
    extra[k] = { ...extra[k], ...p };
    set({ extra });
  };
  const addExtra = () => {
    const used = new Set([...plan.phases, ...plan.extras].map((p) => p.t));
    const start = nightTimes.indexOf(((d.on + 180) % 1440)) ;
    const order = [...nightTimes.slice(Math.max(0, start)), ...nightTimes.slice(0, Math.max(0, start))];
    const t = order.find((m) => !used.has(m)) ?? nightTimes[0];
    set({ extra: [...(d.extra || []), { t, f: plan.mid }] });
  };
  const extraRow = (p: { i: number; t: number; f: number }) => {
    const k = p.i - 100;
    return (
      <div key={ p.i } className="row" style={ { minHeight: 64, gap: 8 } }>
        <div className="grow" style={ { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 } }>
          <select className="pick" aria-label={ `${EXTRA_NAME} ${k + 1} time` } value={ p.t } onChange={ (e) => setExtra(k, { t: Number(e.target.value) }) }
                  style={ { minHeight: 40, padding: '0 10px', fontSize: 15 } }>
            { (nightTimes.includes(p.t) ? nightTimes : [p.t, ...nightTimes]).map((m) => <option key={ m } value={ m }>{ fmtTime(m) }</option>) }
          </select>
          <button type="button" onClick={ () => set({ extra: (d.extra || []).filter((_, j) => j !== k) }) }
                  style={ { alignSelf: 'flex-start', minHeight: 28, padding: 0, border: 0, background: 'transparent', color: 'var(--faint)', fontSize: 12 } }>Remove</button>
        </div>
        <Stepper value={ fmtTemp(p.f, unit) } color={ warmOrCool(p.f, plan.mid) } label={ `${EXTRA_NAME} ${k + 1}` }
                 onDown={ () => setExtra(k, { f: clamp(p.f - 1, d.min, d.max) }) } onUp={ () => setExtra(k, { f: clamp(p.f + 1, d.min, d.max) }) }/>
      </div>
    );
  };

  return (
    <section className="card" aria-label={ title } style={ { gap: 16 } }>
      <div className="between">
        <h2 style={ { margin: 0, fontSize: 18, fontWeight: 600 } }>{ title }</h2>
        <button type="button" className="icon-btn" aria-label="Close without saving" onClick={ onClose }><Icon name="x"/></button>
      </div>

      <div className="between" style={ { alignItems: 'baseline' } }>
        <h3 className="label">Temperature range</h3>
        <span className="num" style={ { fontSize: 18, fontWeight: 600 } }>
          <span style={ { color: tempSoft(d.min) } }>{ fmtTemp(d.min, unit) }</span><span style={ { color: '#6f7789' } }> – </span><span style={ { color: tempSoft(d.max) } }>{ fmtTemp(d.max, unit) }</span>
        </span>
      </div>
      <div style={ { position: 'relative', height: 48, borderRadius: 999, overflow: 'hidden', touchAction: 'none',
        background: scaleGradient() } }>
        <div aria-hidden="true" style={ { position: 'absolute', left: 0, top: 0, bottom: 0, width: pos(d.min), background: 'rgba(11,11,14,.72)' } }/>
        <div aria-hidden="true" style={ { position: 'absolute', left: pos(d.max), right: 0, top: 0, bottom: 0, background: 'rgba(11,11,14,.72)' } }/>
        { [d.min, d.max].map((v, k) => (
          <span key={ k } aria-hidden="true" style={ { position: 'absolute', top: 7, left: pos(v), transform: `translateX(${k === 0 && d.max - d.min < 6 ? '-90%' : k === 1 && d.max - d.min < 6 ? '-10%' : '-50%'})`,
            width: 48, height: 34, borderRadius: 999, background: '#131216', border: `1.5px solid ${tempColor(v)}`, boxShadow: `0 0 10px ${tempTint(v, .45)}`, color: 'var(--text)',
            fontFamily: 'var(--display)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' } }>{ fmtTemp(v, unit) }</span>
        )) }
        <input className="rng" type="range" min={ SLIDER_LO } max={ SLIDER_HI } step={ 1 } value={ d.min } aria-label="Coolest temperature" aria-valuetext={ fmtTemp(d.min, unit) }
               onChange={ (e) => set({ min: Math.min(Number(e.target.value), d.max - 2) }) }/>
        <input className="rng" type="range" min={ SLIDER_LO } max={ SLIDER_HI } step={ 1 } value={ d.max } aria-label="Warmest temperature" aria-valuetext={ fmtTemp(d.max, unit) }
               onChange={ (e) => set({ max: Math.max(Number(e.target.value), d.min + 2) }) }/>
      </div>

      <div style={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } }>
        <label className="small muted" style={ { display: 'flex', flexDirection: 'column', gap: 6 } }>In bed by
          <select className="pick" value={ d.on } onChange={ (e) => set({ on: Number(e.target.value) }) }>
            { timeOptions(20 * 60, 23 * 60 + 30, d.on).map((m) => <option key={ m } value={ m }>{ fmtTime(m) }</option>) }
          </select>
        </label>
        <label className="small muted" style={ { display: 'flex', flexDirection: 'column', gap: 6 } }>Wake up
          <select className="pick" value={ d.wake } onChange={ (e) => set({ wake: Number(e.target.value) }) }>
            { timeOptions(5 * 60, 9 * 60 + 30, d.wake).map((m) => <option key={ m } value={ m }>{ fmtTime(m) }</option>) }
          </select>
        </label>
      </div>

      <div>
        <h3 className="label" style={ { marginBottom: 4 } }>Alarm</h3>
        <div className="row" style={ { minHeight: 64 } }>
          <Tile icon="alarm" fg={ TILES.gold[1] }/>
          <div className="grow">
            <div style={ { fontSize: 15, fontWeight: 500 } }>Wake-up alarm</div>
            <div className="small" style={ { color: 'var(--faint)', marginTop: 2 } }>{ fmtTime(d.wake) }</div>
          </div>
          <Switch on={ d.alarmOn } onChange={ (v) => set({ alarmOn: v }) } label="Wake-up alarm"/>
        </div>
      </div>

      <div>
        <h3 className="label" style={ { marginBottom: 4 } }>Extras</h3>
        { ([['precool', 'Pre-cool before bed', 'Pod comes on 30 min before you get in', 'clock', TILES.blue[1]],
          ['warmWake', 'Warm wake-up', 'Warmest for the last 30 min before your alarm', 'sun', TILES.warm[1]]] as const).map(([key, t, note, icon, color]) => (
          <div key={ key } className="row" style={ { minHeight: 64 } }>
            <Tile icon={ icon } fg={ color }/>
            <div className="grow">
              <div style={ { fontSize: 15, fontWeight: 500 } }>{ t }</div>
              <div className="small" style={ { color: 'var(--faint)', marginTop: 2 } }>{ note }</div>
            </div>
            <Switch on={ d[key] } onChange={ (v) => set({ [key]: v } as Partial<Draft>) } label={ t }/>
          </div>
        )) }
      </div>

      <div>
        <div className="between" style={ { marginBottom: 4 } }>
          <h3 className="label">Through the night</h3>
          <button type="button" onClick={ () => set({ deltas: [0, 0, 0, 0, 0] }) } disabled={ !tweaked }
                  style={ { minHeight: 32, border: 0, background: 'transparent', color: tweaked ? '#6fd0ef' : '#6f7789', fontSize: 12, fontWeight: 500 } }>
            { tweaked ? 'Reset to suggested' : 'Suggested' }
          </button>
        </div>
        { [0, 1, 2, 3, 4].map(phaseRow) }
        { plan.extras.map(extraRow) }
        { (d.extra || []).length < MAX_EXTRA && (
          <button type="button" className="btn quiet" onClick={ addExtra } style={ { width: '100%', marginTop: 8 } }>
            <Icon name="plus" size={ 16 }/>Add a change
          </button>
        ) }
      </div>

      <div style={ { display: 'grid', gridTemplateColumns: '56px minmax(0,1fr)', gap: 8 } }>
        <button type="button" className="btn big quiet" aria-label="Clear this night" title="Clear" onClick={ onClear }><Icon name="trash" size={ 18 }/></button>
        <button type="button" className="btn fill big" onClick={ () => onSave(d) }>Save</button>
      </div>
    </section>
  );
};

export default function Schedule() {
  const { data: schedules } = useSchedules();
  const unit = useUnit();
  const save = useSave();
  const side = useApp((s) => s.side);
  const say = useApp((s) => s.say);
  const [day, setDayRaw] = useState<DayOfWeek>(todayKey());
  const [editing, setEditing] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [targets, setTargets] = useState<DayOfWeek[]>([]);

  const states = useMemo(() => Object.fromEntries(DAYS.map((d) => [d.key, nightState(schedules?.[side]?.[d.key])])), [schedules, side]);
  if (!schedules) return <div className="page"><Loading/></div>;

  const info = DAYS.find((d) => d.key === day)!;
  const daily = schedules[side][day];
  const state = states[day];
  const meta = local.get<Draft | undefined>(metaKey(side, day), undefined);
  const feel: AlarmFeel = daily?.alarm ? { vibrationPattern: daily.alarm.vibrationPattern, vibrationIntensity: daily.alarm.vibrationIntensity, duration: daily.alarm.duration } : DEFAULT_FEEL;

  const setDay = (k: DayOfWeek) => { setDayRaw(k); setEditing(false); setCopyOpen(false); setTargets([]); };
  const write = (k: DayOfWeek, s: Partial<DailySchedule>) => save.schedules({ [side]: { [k]: s } });

  const phases = state === 'empty' ? [] : savedPhases(daily);
  const nameAt = new Map<number, string>();
  if (meta && meta.on !== undefined) {
    const b = buildNight(meta);
    b.phases.forEach((p) => nameAt.set(p.t, p.name));
    b.extras.forEach((p) => nameAt.set(p.t, p.name));
  }
  const mid = phases.length ? Math.round((Math.min(...phases.map((p) => p.f)) + Math.max(...phases.map((p) => p.f))) / 2) : 0;
  const temps = phases.map((p) => p.f);
  const summary = state === 'on'
    ? `${fmtTime(toMin(daily.power.on))} → ${fmtTime(toMin(daily.power.off))} · ${fmtTemp(Math.min(...temps), unit)}–${fmtTemp(Math.max(...temps), unit)}`
    : state === 'off' ? 'Off. Nothing runs this night.' : 'Not set';

  const prevSet = (() => {
    const idx = DAYS.findIndex((d) => d.key === day);
    for (let i = 1; i < 7; i++) {
      const k = DAYS[(idx - i + 7) % 7].key;
      if (states[k] !== 'empty') return DAYS[(idx - i + 7) % 7];
    }
    return undefined;
  })();

  const label = (list: DayOfWeek[]) => {
    const keys = DAYS.filter((d) => list.includes(d.key)).map((d) => d.key).join(',');
    if (list.length === 7) return 'every night';
    if (keys === 'monday,tuesday,wednesday,thursday,sunday') return 'weeknights';
    if (keys === 'friday,saturday') return 'the weekend';
    return `${list.length} night${list.length === 1 ? '' : 's'}`;
  };

  const onSave = (d: Draft) => {
    void write(day, draftToDaily(d, feel));
    local.set(metaKey(side, day), d);
    setEditing(false);
    say(`${info.full} saved`);
  };

  const applyCopy = () => {
    const patch = Object.fromEntries(targets.map((k) => [k, { ...daily, power: { ...daily.power, enabled: true } }]));
    void save.schedules({ [side]: patch });
    targets.forEach((k) => local.set(metaKey(side, k), meta));
    say(`${info.short} copied to ${label(targets)}`);
    setCopyOpen(false);
    setTargets([]);
  };

  const clear = () => {
    void write(day, { power: { ...daily.power, enabled: false }, temperatures: {}, alarm: { ...daily.alarm, enabled: false } });
    local.set(metaKey(side, day), undefined);
    say(`${info.full} cleared`);
  };

  const copyFromPrev = () => {
    if (!prevSet) return;
    const src = schedules[side][prevSet.key];
    void write(day, { ...src, power: { ...src.power, enabled: true } });
    local.set(metaKey(side, day), local.get(metaKey(side, prevSet.key), undefined));
    say(`Copied from ${prevSet.full}`);
  };

  return (
    <div className="page" style={ { gap: 14 } }>
      <header className="between">
        <h1 className="h1">Schedule</h1>
        <SideSwitch/>
      </header>

      <DayStrip day={ day } setDay={ setDay } states={ states }/>

      { editing ? (
        <Editor key={ `${side}-${day}` } title={ `${state === 'empty' ? 'Set up' : 'Edit'} ${info.full}` } unit={ unit }
                initial={ state === 'empty' ? DEFAULT_DRAFT : dailyToDraft(daily, meta) } onSave={ onSave } onClose={ () => setEditing(false) }
                onClear={ () => { if (state !== 'empty') clear(); setEditing(false); } }/>
      ) : (
        <section className="card" aria-label={ `${info.full} night` }>
          <div className="row">
            <div className="grow">
              <h2 style={ { margin: 0, fontSize: 18, fontWeight: 600 } }>{ info.full } night</h2>
              <div className="small" style={ { color: state === 'on' ? 'var(--muted)' : '#85818b', marginTop: 2 } }>{ summary }</div>
            </div>
            { state !== 'empty' && (
              <Switch on={ daily.power.enabled } label={ `${info.full} schedule on` }
                      onChange={ (v) => void write(day, { power: { ...daily.power, enabled: v } }) }/>
            ) }
          </div>

          { state === 'empty' ? (
            <div style={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } }>
              <button type="button" className="btn fill" onClick={ () => setEditing(true) }>Set up night</button>
              <button type="button" className="btn" onClick={ copyFromPrev } disabled={ !prevSet }>{ prevSet ? `Copy from ${prevSet.short}` : 'Copy from…' }</button>
            </div>
          ) : (
            <>
              <div style={ { display: 'flex', flexDirection: 'column', borderTop: '1px solid #2c2b31', opacity: state === 'on' ? 1 : .45 } }>
                { phases.map((p, i) => (
                  <div key={ i } className="row" style={ { minHeight: 46, borderBottom: '1px solid #27262b', gap: 10 } }>
                    <span style={ { width: 8, height: 8, borderRadius: 99, background: tempColor(p.f), boxShadow: `0 0 6px ${tempTint(p.f, .6)}`, flex: 'none' } }/>
                    <span className="grow" style={ { fontSize: 14, color: 'var(--text-2)' } }>{ nameAt.get(p.t) || (i === 0 ? 'Bed on' : 'Then') }</span>
                    <span className="small muted" style={ { fontSize: 14 } }>{ fmtTime(p.t) }</span>
                    <span className="num" style={ { width: 52, textAlign: 'right', fontSize: 16, fontWeight: 600, color: warmOrCool(p.f, mid) } }>{ fmtTemp(p.f, unit) }</span>
                  </div>
                )) }
                <div className="row" style={ { minHeight: 46, gap: 10 } }>
                  <span style={ { width: 8, height: 8, borderRadius: 99, border: '2px solid #85818b', flex: 'none' } }/>
                  <span className="grow" style={ { fontSize: 14, color: 'var(--text-2)' } }>Bed off</span>
                  <span className="small muted" style={ { fontSize: 14 } }>{ fmtTime(toMin(daily.power.off)) }</span>
                  <span style={ { width: 52 } }/>
                </div>
              </div>

              <div className="row" style={ { padding: '10px 12px', borderRadius: 16, background: 'var(--card-2)', opacity: daily.alarm.enabled ? 1 : .5 } }>
                <div className="grow">
                  <span className="num" style={ { fontSize: 24 } }>{ fmtTime(toMin(daily.alarm.time)).split(' ')[0] }</span>
                  <span className="small muted"> { fmtTime(toMin(daily.alarm.time)).split(' ')[1] }</span>
                  <div className="small" style={ { color: 'var(--faint)', marginTop: 2, fontSize: 12 } }>Wake-up alarm</div>
                </div>
                <Switch on={ daily.alarm.enabled } label="Wake-up alarm on"
                        onChange={ (v) => void write(day, { alarm: { ...daily.alarm, enabled: v } }) }/>
              </div>

              { copyOpen ? (
                <div style={ { padding: 12, borderRadius: 16, background: 'var(--card-2)', display: 'flex', flexDirection: 'column', gap: 10 } }>
                  <div className="between">
                    <span className="small" style={ { color: 'var(--text-2)' } }>Copy { info.short } to</span>
                    <div className="row" style={ { gap: 4 } }>
                      <button type="button" className="btn" style={ { minHeight: 30, fontSize: 12, borderRadius: 999, padding: '0 10px' } }
                              onClick={ () => setTargets(WEEKNIGHTS.filter((k) => k !== day)) }>Weeknights</button>
                      <button type="button" className="btn" style={ { minHeight: 30, fontSize: 12, borderRadius: 999, padding: '0 10px' } }
                              onClick={ () => setTargets(DAYS.map((d) => d.key).filter((k) => k !== day)) }>All</button>
                    </div>
                  </div>
                  <div role="group" aria-label="Copy to nights" style={ { display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 } }>
                    { DAYS.map((d) => {
                      const self = d.key === day;
                      const sel = targets.includes(d.key);
                      return (
                        <button key={ d.key } type="button" disabled={ self } aria-pressed={ sel } aria-label={ d.full }
                                onClick={ () => setTargets(sel ? targets.filter((x) => x !== d.key) : [...targets, d.key]) }
                                style={ { minHeight: 40, borderRadius: 12, fontSize: 13, fontWeight: 600, padding: 0,
                                  border: self ? '1px dashed #34323a' : 0, background: self ? 'transparent' : sel ? 'var(--cool)' : 'var(--raised)', color: self ? '#52525b' : sel ? 'var(--bg)' : 'var(--text-2)' } }>{ d.chip }</button>
                      );
                    }) }
                  </div>
                  <div style={ { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 } }>
                    <button type="button" className="btn" onClick={ () => { setCopyOpen(false); setTargets([]); } }>Cancel</button>
                    <button type="button" className="btn fill" disabled={ !targets.length } onClick={ applyCopy } style={ { opacity: targets.length ? 1 : .5 } }>
                      { targets.length ? `Copy to ${label(targets)}` : 'Pick nights' }
                    </button>
                  </div>
                </div>
              ) : (
                <div style={ { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 } }>
                  <button type="button" className="btn fill" aria-label="Edit this night" title="Edit" onClick={ () => setEditing(true) }><Icon name="edit" size={ 18 }/></button>
                  <button type="button" className="btn" aria-label="Copy to other nights" title="Copy" onClick={ () => setCopyOpen(true) }><Icon name="copy" size={ 18 }/></button>
                  <button type="button" className="btn quiet" aria-label="Clear this night" title="Clear" onClick={ clear }><Icon name="trash" size={ 18 }/></button>
                </div>
              ) }
            </>
          ) }
        </section>
      ) }
    </div>
  );
}
