import { useMemo, useState } from 'react';
import { useSleepRecords } from '@api/sleep';
import { useVitalsRecords, useVitalsSummary } from '@api/vitals';
import { useMovementRecords } from '@api/movement';
import { useApp } from './store';
import { fmtClock, fmtDuration } from './lib';
import { Icon, SideSwitch } from './ui';

const DAY = 24 * 3600 * 1000;
const toMs = (t: number | string) => typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t);
const iso = (ms: number) => new Date(ms).toISOString();
type Measure = 'hr' | 'hrv' | 'br' | 'mv';
const MEASURES: Record<Measure, { label: string; unit: string; color: string }> = {
  hr: { label: 'Heart', unit: 'bpm', color: '#ee8a78' },
  hrv: { label: 'HRV', unit: 'ms', color: '#b69cff' },
  br: { label: 'Breath', unit: '/min', color: '#47c5e7' },
  mv: { label: 'Move', unit: '', color: '#6ee7b7' },
};

// A night to show: a detected sleep record or, when the Pod's sleep detection found none,
// one estimated from when heart-rate readings were being recorded.
type Night = {
  entered_bed_at: string; left_bed_at: string; sleep_period_seconds: number;
  times_exited_bed: number; not_present_intervals: [string, string][]; estimated?: boolean;
};

// Without detected sleep, a night is the span of readings between 7 pm and noon. Readings on
// this Pod are patchy, so this is shown as readings only, never as time in bed.
const estimateNights = (vitals: { timestamp: number | string }[]): Night[] => {
  const byNight = new Map<string, number[]>();
  for (const t of vitals.map((v) => toMs(v.timestamp)).filter(Number.isFinite).sort((x, y) => x - y)) {
    const d = new Date(t);
    if (d.getHours() >= 12 && d.getHours() < 19) continue;
    if (d.getHours() < 12) d.setDate(d.getDate() - 1);
    const k = d.toDateString();
    byNight.set(k, [...(byNight.get(k) || []), t]);
  }
  return [...byNight.values()].filter((g) => g.length >= 10).map((g) => ({
    entered_bed_at: iso(g[0]), left_bed_at: iso(g[g.length - 1]),
    sleep_period_seconds: Math.round((g[g.length - 1] - g[0]) / 1000),
    times_exited_bed: 0, not_present_intervals: [], estimated: true,
  }));
};

const useNights = (side: 'left' | 'right', start: number, end: number) => {
  const { data: records, isSuccess } = useSleepRecords({ side, startTime: iso(start), endTime: iso(end) });
  const none = isSuccess && (records || []).length === 0;
  const { data: vitals } = useVitalsRecords({ side, startTime: iso(start), endTime: iso(end) }, none);
  const nights: Night[] = none ? estimateNights(vitals || []) : (records || []) as unknown as Night[];
  return nights;
};

// Chart smoothing: average each reading with its neighbours within 10 minutes, thin to at most
// 90 points, then draw a smooth curve through them. Averages and ranges still use the raw readings.
const smoothSeries = (pts: { t: number; v: number }[]) => {
  const W = 10 * 60 * 1000;
  const avg = pts.map((p) => {
    let sum = 0; let n = 0;
    for (const q of pts) if (Math.abs(q.t - p.t) <= W) { sum += q.v; n++; }
    return { t: p.t, v: sum / n };
  });
  if (avg.length <= 90) return avg;
  const step = avg.length / 90;
  return Array.from({ length: 90 }, (_, i) => avg[Math.min(avg.length - 1, Math.round(i * step))]).concat(avg[avg.length - 1]);
};
const curvePath = (xy: [number, number][]) => {
  const f = (n: number) => n.toFixed(1);
  if (xy.length < 3) return xy.map(([x, y], i) => `${i ? 'L' : 'M'} ${f(x)} ${f(y)}`).join(' ');
  let d = `M ${f(xy[0][0])} ${f(xy[0][1])}`;
  for (let i = 1; i < xy.length; i++) {
    const p0 = xy[i - 2] || xy[i - 1]; const p1 = xy[i - 1]; const p2 = xy[i]; const p3 = xy[i + 1] || p2;
    d += ` C ${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
};

const LiveNow = ({ side }: { side: 'left' | 'right' }) => {
  const since = useMemo(() => iso(Date.now() - 10 * 60 * 1000), []);
  const { data } = useVitalsRecords({ side, startTime: since });
  const latest = data?.slice().sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp))[0];
  return (
    <section className="card" aria-label="Live now" style={ { gap: 12, padding: '16px 18px' } }>
      <div className="between">
        <h2 className="label">Live now</h2>
        <span className="row small" style={ { gap: 6, color: 'var(--text-2)' } }>
          <span className={ latest ? 'pulse' : '' } style={ { width: 7, height: 7, borderRadius: 99, background: latest ? 'var(--green)' : '#52525b' } }/>
          { latest ? 'In bed' : 'Not in bed' }
        </span>
      </div>
      { latest ? (
        <div style={ { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 } }>
          { [['Heart rate', latest.heart_rate, 'bpm'], ['HRV', latest.hrv, 'ms'], ['Breathing', latest.breathing_rate, '/min']].map(([l, v, u]) => (
            <div key={ l as string }>
              <div className="small muted" style={ { fontSize: 12 } }>{ l }</div>
              <div style={ { marginTop: 2 } }><span className="num" style={ { fontSize: 28 } }>{ v }</span><span className="muted" style={ { fontSize: 12 } }> { u }</span></div>
            </div>
          )) }
        </div>
      ) : <div className="small muted" style={ { fontSize: 14 } }>Readings appear a minute or two after you lie still.</div> }
    </section>
  );
};

const NightView = ({ side, offset, setMax }: { side: 'left' | 'right'; offset: number; setMax: (n: number) => void }) => {
  const [measure, setMeasure] = useState<Measure>('hr');
  const [rangeEnd] = useState(() => Date.now());
  const records = useNights(side, rangeEnd - 45 * DAY, rangeEnd);
  const nights = records.slice().sort((a, b) => Date.parse(b.entered_bed_at) - Date.parse(a.entered_bed_at));
  setMax(Math.max(0, nights.length - 1));
  const rec = nights[offset];
  const start = rec ? Date.parse(rec.entered_bed_at) : 0;
  const end = rec ? Date.parse(rec.left_bed_at) : 0;
  const { data: vitals } = useVitalsRecords({ side, startTime: iso(start), endTime: iso(end) }, !!rec && measure !== 'mv');
  const { data: moves } = useMovementRecords({ side, startTime: iso(start), endTime: iso(end) }, !!rec && measure === 'mv');

  if (!rec) return <section className="card"><div className="muted" style={ { fontSize: 14 } }>No nights recorded yet. They appear here the morning after.</div></section>;

  const span = Math.max(1, end - start);
  const gaps = rec.not_present_intervals.map(([a, b]) => [Date.parse(a), Date.parse(b)]);
  const awayMin = Math.round(gaps.reduce((s, [a, b]) => s + (b - a), 0) / 60000);
  const pts = measure === 'mv'
    ? (moves || []).map((m) => ({ t: toMs(m.timestamp), v: m.total_movement }))
    : (vitals || []).map((v) => ({ t: toMs(v.timestamp), v: measure === 'hr' ? v.heart_rate : measure === 'hrv' ? v.hrv : v.breathing_rate }));
  const series = pts.filter((p) => p.t >= start && p.t <= end).sort((a, b) => a.t - b.t);
  const values = series.map((p) => p.v);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const pad = (hi - lo) * .15 || 1;
  const X = (t: number) => ((t - start) / span) * 314;
  const Y = (v: number) => 4 + (1 - (v - (lo - pad)) / ((hi + pad) - (lo - pad))) * 104;
  const smooth = smoothSeries(series);
  const line = curvePath(smooth.map((p) => [X(p.t), Math.min(108, Math.max(2, Y(p.v)))]));
  const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const m = MEASURES[measure];

  return (
    <>
      <section className="card" aria-label="Night summary">
        <div className="between" style={ { alignItems: 'flex-end' } }>
          <div>
            <h2 className="label">{ rec.estimated ? 'Overnight readings' : 'In bed' }</h2>
            <div className="num" style={ { fontSize: rec.estimated ? 30 : 44, letterSpacing: -1, marginTop: 2 } }>{ rec.estimated ? `${fmtClock(rec.entered_bed_at)} – ${fmtClock(rec.left_bed_at)}` : fmtDuration(rec.sleep_period_seconds) }</div>
          </div>
          <div className="small muted" style={ { textAlign: 'right', lineHeight: 1.6 } }>
            { !rec.estimated && <div>{ fmtClock(rec.entered_bed_at) } → { fmtClock(rec.left_bed_at) }</div> }
            <div>{ rec.estimated ? 'First to last reading' : rec.times_exited_bed === 0 ? 'Stayed in bed' : `Up ${rec.times_exited_bed === 1 ? 'once' : rec.times_exited_bed === 2 ? 'twice' : `${rec.times_exited_bed} times`} · ${awayMin} min` }</div>
          </div>
        </div>
        { rec.estimated && (
          <div className="small muted" style={ { fontSize: 13, lineHeight: 1.45 } }>
            The Pod hasn't detected a sleep period for this night, so time in bed isn't shown. The readings below are everything it recorded overnight.
          </div>
        ) }
        { !rec.estimated && <div role="img" aria-label={ `In bed from ${fmtClock(rec.entered_bed_at)} to ${fmtClock(rec.left_bed_at)}` }
             style={ { position: 'relative', height: 12, borderRadius: 99, background: 'var(--cool)', overflow: 'hidden' } }>
          { gaps.map(([a, b], i) => (
            <div key={ i } style={ { position: 'absolute', left: `${((a - start) / span) * 100}%`, width: `${Math.max(.8, ((b - a) / span) * 100)}%`, top: 0, bottom: 0, background: 'var(--bg)' } }/>
          )) }
        </div> }
      </section>

      <section className="card" aria-label="Through the night" style={ { gap: 12 } }>
        <div role="tablist" aria-label="Measure" style={ { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4 } }>
          { (Object.keys(MEASURES) as Measure[]).map((k) => (
            <button key={ k } type="button" role="tab" aria-selected={ measure === k } onClick={ () => setMeasure(k) }
                    style={ { minHeight: 36, borderRadius: 999, fontSize: 13, fontWeight: 600, padding: '0 6px',
                      border: `1px solid ${measure === k ? MEASURES[k].color : '#34323a'}`, background: measure === k ? 'var(--raised)' : 'transparent', color: measure === k ? 'var(--text)' : 'var(--muted)' } }>
              { MEASURES[k].label }
            </button>
          )) }
        </div>
        { values.length ? (
          <>
            <div className="between" style={ { alignItems: 'baseline' } }>
              <div>
                <span className="num" style={ { fontSize: 30 } }>{ measure === 'mv' ? (avg > 200 ? 'Restless' : 'Settled') : measure === 'br' ? avg.toFixed(1) : Math.round(avg) }</span>
                { measure !== 'mv' && <span className="small muted"> { m.unit } average</span> }
              </div>
              { measure !== 'mv' && <span className="small muted">Range { Math.round(lo) }–{ Math.round(hi) }</span> }
            </div>
            <svg width="100%" viewBox="0 0 314 130" role="img" aria-label={ `${m.label} through the night` }>
              <defs><linearGradient id="mf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={ m.color } stopOpacity=".3"/><stop offset="100%" stopColor={ m.color } stopOpacity="0"/></linearGradient></defs>
              { gaps.map(([a, b], i) => <rect key={ i } x={ X(a) } y="0" width={ Math.max(3, X(b) - X(a)) } height="108" fill="#27262b"/>) }
              <line x1="0" y1="108" x2="314" y2="108" stroke="#2d2b32"/>
              { series.length > 1 && <path d={ `${line} L ${X(series[series.length - 1].t).toFixed(1)} 108 L ${X(series[0].t).toFixed(1)} 108 Z` } fill="url(#mf)"/> }
              <path d={ line } fill="none" stroke={ m.color } strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
              <text x="0" y="126" fill="#85818b" fontSize="10">{ fmtClock(rec.entered_bed_at) }</text>
              <text x="314" y="126" fill="#85818b" fontSize="10" textAnchor="end">{ fmtClock(rec.left_bed_at) }</text>
            </svg>
          </>
        ) : <div className="small muted" style={ { fontSize: 14, padding: '18px 0' } }>No { m.label.toLowerCase() } readings for this night.</div> }
      </section>
    </>
  );
};

const PeriodView = ({ side, days, offset }: { side: 'left' | 'right'; days: number; offset: number }) => {
  const end = useMemo(() => Date.now() - offset * days * DAY, [offset, days]);
  const start = end - days * DAY;
  const records = useNights(side, start, end);
  const { data: now } = useVitalsSummary({ side, startTime: iso(start), endTime: iso(end) });
  const { data: before } = useVitalsSummary({ side, startTime: iso(start - days * DAY), endTime: iso(start) });
  const nights = records.slice().sort((a, b) => Date.parse(a.entered_bed_at) - Date.parse(b.entered_bed_at));
  const estimated = nights.some((n) => n.estimated);
  const hours = estimated ? [] : nights.map((r) => r.sleep_period_seconds / 3600);
  const avg = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : 0;
  const beds = nights.map((r) => { const d = new Date(r.entered_bed_at); return ((d.getHours() + 12) % 24) * 60 + d.getMinutes(); }).sort((a, b) => a - b);
  const usual = beds.length ? beds[Math.floor(beds.length / 2)] : null;
  const delta = (a?: number, b?: number, unit = '') => {
    if (!a || !b) return { text: '', color: 'var(--faint)' };
    const d = Math.round(a - b);
    return { text: d === 0 ? 'Same' : `${d > 0 ? '+' : '−'}${Math.abs(d)}${unit} vs last`, color: 'var(--faint)' };
  };
  const rows = [
    ['Heart rate', now?.avgHeartRate, 'bpm', '#ee8a78', delta(now?.avgHeartRate, before?.avgHeartRate)],
    ['HRV', now?.avgHRV, 'ms', '#b69cff', delta(now?.avgHRV, before?.avgHRV)],
    ['Breathing', now?.avgBreathingRate, '/min', '#47c5e7', delta(now?.avgBreathingRate, before?.avgBreathingRate)],
  ] as const;

  return (
    <>
      <section className="card" aria-label="Time in bed">
        <div className="between" style={ { alignItems: 'flex-end' } }>
          <div>
            <h2 className="label">Average in bed</h2>
            <div className="num" style={ { fontSize: 40, letterSpacing: -1, marginTop: 2 } }>{ hours.length ? fmtDuration(avg * 3600) : '—' }</div>
          </div>
          <div className="small muted" style={ { textAlign: 'right', lineHeight: 1.6 } }>
            { estimated && <div>No sleep periods detected yet</div> }
            { !estimated && usual !== null && <div>Usually in bed { fmtClock(new Date(2000, 0, 1, Math.floor((usual / 60 + 12) % 24), usual % 60).getTime()) }</div> }
            <div>{ nights.length } night{ nights.length === 1 ? '' : 's' } { estimated ? 'with readings' : 'recorded' }</div>
          </div>
        </div>
        { !estimated && <div role="img" aria-label={ `Time in bed each night, average ${fmtDuration(avg * 3600)}` }
             style={ { display: 'flex', alignItems: 'flex-end', gap: days <= 7 ? 8 : 3, height: 120, borderBottom: '1px solid #2d2b32' } }>
          { nights.map((_r, i) => (
            <div key={ i } style={ { flex: 1, height: `${Math.min(100, hours[i] / 10 * 100)}%`, borderRadius: '6px 6px 2px 2px', background: hours[i] >= 7 ? 'var(--cool)' : '#33476e' } }/>
          )) }
        </div> }
        { days <= 7 && !estimated && (
          <div style={ { display: 'flex', gap: 8, marginTop: -8 } }>
            { nights.map((r, i) => <span key={ i } style={ { flex: 1, textAlign: 'center', fontSize: 11, color: 'var(--faint)' } }>{ new Date(r.entered_bed_at).toLocaleDateString('en-NZ', { weekday: 'short' }) }</span>) }
          </div>
        ) }
      </section>
      <section className="list" aria-label="Averages" style={ { padding: '0 18px' } }>
        { rows.map(([label, v, unit, color, d]) => (
          <div key={ label } className="row" style={ { minHeight: 56 } }>
            <span style={ { width: 8, height: 8, borderRadius: 99, background: color, flex: 'none' } }/>
            <span className="grow" style={ { fontSize: 15 } }>{ label }</span>
            <span className="num" style={ { fontSize: 18 } }>{ v ? Math.round(v) : '—' } <span className="small muted">{ unit }</span></span>
            <span style={ { minWidth: 72, textAlign: 'right', fontSize: 12, color: d.color } }>{ d.text }</span>
          </div>
        )) }
      </section>
    </>
  );
};

export default function Sleep() {
  const side = useApp((s) => s.side);
  const [period, setPeriod] = useState<'night' | 'week' | 'month'>('night');
  const [offset, setOffset] = useState(0);
  const [maxNight, setMaxNight] = useState(0);
  const title = period === 'night' ? (offset === 0 ? 'Last night' : offset === 1 ? 'Night before' : `${offset + 1} nights ago`)
    : period === 'week' ? (offset === 0 ? 'Last 7 nights' : `${offset * 7 + 7}–${offset * 7} nights ago`)
      : (offset === 0 ? 'Last 30 nights' : 'The 30 before');
  const canOlder = period === 'night' ? offset < maxNight : offset < 6;

  return (
    <div className="page" style={ { gap: 14 } }>
      <header className="between">
        <h1 className="h1">Sleep</h1>
        <SideSwitch/>
      </header>
      <LiveNow side={ side }/>
      <div className="tabs" role="tablist" aria-label="Period">
        { (['night', 'week', 'month'] as const).map((p) => (
          <button key={ p } type="button" role="tab" aria-selected={ period === p } onClick={ () => { setPeriod(p); setOffset(0); } }>
            { p[0].toUpperCase() + p.slice(1) }
          </button>
        )) }
      </div>
      <div className="between">
        <button type="button" className="icon-btn" aria-label="Earlier" disabled={ !canOlder } onClick={ () => setOffset(offset + 1) }
                style={ { border: '1px solid #34323a', background: 'var(--card)', color: canOlder ? 'var(--text)' : '#52525b' } }><Icon name="chevL" size={ 18 }/></button>
        <div style={ { fontSize: 16, fontWeight: 600 } }>{ title }</div>
        <button type="button" className="icon-btn" aria-label="Later" disabled={ offset === 0 } onClick={ () => setOffset(Math.max(0, offset - 1)) }
                style={ { border: `1px solid ${offset === 0 ? '#27262b' : '#34323a'}`, color: offset === 0 ? '#52525b' : 'var(--text)' } }><Icon name="chevR" size={ 18 }/></button>
      </div>
      { period === 'night'
        ? <NightView side={ side } offset={ offset } setMax={ (n) => { if (n !== maxNight) setTimeout(() => setMaxNight(n)); } }/>
        : <PeriodView side={ side } days={ period === 'week' ? 7 : 30 } offset={ offset }/> }
    </div>
  );
}
