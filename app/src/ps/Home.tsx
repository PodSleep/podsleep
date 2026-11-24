import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { DeepPartial } from 'ts-essentials';
import type { DeviceStatus } from '@api/deviceStatusSchema';
import { useBoost, useBoostActions, useDeviceStatus, useSave, useSchedules, useSettings, useUnit, type Boost } from './data';
import { useApp } from './store';
import { clamp, cToF, fmtTemp, fmtTime, fToC, MAX_F, MIN_F, roundHalf, stepTemp, tempColor, tempFrac, tempSoft, tempTint, todayKey, toMin, type Side, type Unit } from './lib';
import { Icon, Loading } from './ui';
import BedHero from './BedHero';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const useNow = (active: boolean) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
};

// Dial: a 270° arc, coloured along the temperature scale, with a dot at the target.
const R = 52;
const CX = 64;
const CY = 62;
const at = (f: number) => {
  const a = (135 + 270 * f) * Math.PI / 180;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
};
// Where a point on the dial sits along the arc (0 = coolest, 1 = warmest). The gap at the
// bottom snaps to whichever end you came from.
const fracAt = (el: SVGSVGElement, x: number, y: number, last: number) => {
  const r = el.getBoundingClientRect();
  const px = (x - r.left) / r.width * 128;
  const py = (y - r.top) / r.height * 112;
  const deg = Math.atan2(py - CY, px - CX) * 180 / Math.PI;
  const rel = ((deg - 135) % 360 + 360) % 360;
  if (rel > 270) return last > 0.5 ? 1 : 0;
  return rel / 270;
};

const Dial = ({ value, frac, colourF, label, onDrag, onDrop, onKey }: {
  value: string; frac: number; colourF: number; label: string;
  onDrag: (frac: number) => void; onDrop: () => void; onKey: (dir: 1 | -1) => void;
}) => {
  const [x0, y0] = at(0);
  const [x1, y1] = at(1);
  const [kx, ky] = at(frac);
  const [dragging, setDragging] = useState(false);
  const move = (e: React.PointerEvent<SVGSVGElement>) => onDrag(fracAt(e.currentTarget, e.clientX, e.clientY, frac));
  return (
    <div style={ { position: 'relative', width: '100%', maxWidth: 122, aspectRatio: '128 / 112', justifySelf: 'center' } }>
      <svg viewBox="0 0 128 112" width="100%" height="100%"
           role="slider" tabIndex={ 0 } aria-label={ label } aria-valuetext={ value }
           aria-valuemin={ 0 } aria-valuemax={ 100 } aria-valuenow={ Math.round(frac * 100) }
           onPointerDown={ (e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); move(e); } }
           onPointerMove={ (e) => { if (dragging) move(e); } }
           onPointerUp={ () => { if (dragging) { setDragging(false); onDrop(); } } }
           onPointerCancel={ () => { if (dragging) { setDragging(false); onDrop(); } } }
           onKeyDown={ (e) => {
             if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onKey(1); }
             if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onKey(-1); }
           } }
           style={ { display: 'block', overflow: 'visible', touchAction: 'none', cursor: 'pointer', outline: 'none' } }>
        { /* wide invisible stroke so the whole ring is easy to grab */ }
        <path d={ `M${x0} ${y0} A${R} ${R} 0 1 1 ${x1} ${y1}` } fill="none" stroke="transparent" strokeWidth="30" strokeLinecap="round"/>
        <path d={ `M${x0} ${y0} A${R} ${R} 0 1 1 ${x1} ${y1}` } fill="none" stroke="#34323a" strokeWidth="5" strokeLinecap="round" style={ { pointerEvents: 'none' } }/>
        { frac > 0.004 && (
          <path d={ `M${x0} ${y0} A${R} ${R} 0 ${frac * 270 > 180 ? 1 : 0} 1 ${kx} ${ky}` } fill="none" stroke={ tempColor(colourF) } strokeWidth="5" strokeLinecap="round"
                style={ { filter: `drop-shadow(0 0 5px ${tempTint(colourF, .55)})`, pointerEvents: 'none', transition: 'stroke .4s' } }/>
        ) }
        <circle cx={ kx } cy={ ky } r={ dragging ? 9 : 6.5 } fill="#fff" style={ { filter: `drop-shadow(0 0 6px ${tempColor(colourF)})`, transition: 'r .15s', pointerEvents: 'none' } }/>
      </svg>
      <div aria-live="polite" style={ { position: 'absolute', left: 0, right: 0, top: '30%', textAlign: 'center', pointerEvents: 'none' } }>
        <div className="num" style={ { fontSize: 'clamp(30px, 10vw, 38px)', fontWeight: 600, letterSpacing: -1, lineHeight: 1 } }>{ value }</div>
        <div style={ { marginTop: 6, fontSize: 11, color: 'var(--muted)' } }>Target</div>
      </div>
    </div>
  );
};

/** A dial position to a temperature, on the same steps as − and + (half a degree in °C). */
const fracToF = (frac: number, unit: Unit) => {
  const f = MIN_F + frac * (MAX_F - MIN_F);
  const snapped = unit === 'C' ? Math.round(cToF(roundHalf(fToC(f)))) : Math.round(f);
  return clamp(snapped, MIN_F, MAX_F);
};

export default function Home() {
  const { data: ds } = useDeviceStatus();
  const { data: settings } = useSettings();
  const { data: schedules } = useSchedules();
  const unit = useUnit();
  const save = useSave();
  const { side, setSide } = useApp();
  const { data: boost = null } = useBoost();
  const boostApi = useBoostActions();
  const qc = useQueryClient();
  const now = useNow(!!boost);
  const [dragF, setDragF] = useState<number | null>(null);

  if (!ds || !settings) return <div className="page"><Loading/></div>;

  const st = ds[side];
  const on = st.isOn;
  const t = dragF ?? st.targetTemperatureF;
  const cur = st.currentTemperatureF;
  const boostHere = !!boost && boost.sides.includes(side);
  const heating = on && t - cur >= 1;
  const cooling = on && cur - t >= 1;
  const mins = Math.max(4, Math.round(Math.abs(t - cur) * 5));
  const secsLeft = boost ? Math.max(0, Math.ceil((boost.until - now) / 1000)) : 0;
  const clock = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}`;
  const status = !on ? 'Off'
    : boostHere ? `${boost!.kind === 'cold' ? 'Cold Shot' : 'Heat Boost'} · ${clock}`
      : heating ? `↑ ${fmtTemp(t, unit)} · ~${mins}m` : cooling ? `↓ ${fmtTemp(t, unit)} · ~${mins}m` : 'Holding';
  // The colour a side shows everywhere (bed, dial, chip, tiles): what it's set to, so a change
  // shows at once. During a Cold Shot or Heat Boost it follows the bed's actual temperature, so
  // the colour moves as the bed cools or warms.
  const colourOf = (s: Side) => {
    if (s === side && dragF !== null) return dragF;
    const d = ds[s];
    return boost && boost.sides.includes(s) && d.isOn ? d.currentTemperatureF : d.targetTemperatureF;
  };
  const colourF = { left: colourOf('left'), right: colourOf('right') };
  const cf = colourF[side];
  const chip = !on ? { background: '#2e2d33', color: '#a29ea8' }
    : { background: tempTint(cf, .16), color: tempSoft(cf) };

  const patch = (v: Partial<DeviceStatus['left']>) => ({ [side]: v }) as DeepPartial<DeviceStatus>;

  // Tapping the bed: an off side turns on and is selected; an unselected side is selected;
  // the selected side turns off.
  const tapSide = async (s: Side) => {
    if (!ds[s].isOn) {
      setSide(s);
      void save.device({ [s]: { isOn: true } } as DeepPartial<DeviceStatus>);
      return;
    }
    if (s !== side) { setSide(s); return; }
    if (boost?.sides.includes(s)) await boostApi.stop(false);
    void save.device({ [s]: { isOn: false } } as DeepPartial<DeviceStatus>);
  };

  // Changing the temperature yourself ends a boost and keeps your change.
  const setTarget = async (f: number) => {
    if (boostHere) await boostApi.stop(false);
    void save.device(patch(on ? { targetTemperatureF: f } : { targetTemperatureF: f, isOn: true }));
  };
  const step = (dir: 1 | -1) => setTarget(stepTemp(t, dir, unit));
  const dropDial = () => {
    if (dragF !== null && dragF !== st.targetTemperatureF) void setTarget(dragF);
    setDragF(null);
  };

  const startBoost = (kind: Boost['kind']) => {
    if (boostHere && boost!.kind === kind) { void boostApi.stop(); return; }
    qc.setQueryData<DeviceStatus>(['useDeviceStatus'], (old) => old
      ? { ...old, [side]: { ...old[side], isOn: true, targetTemperatureF: kind === 'cold' ? MIN_F : MAX_F } }
      : old);
    void boostApi.start(kind, [side]);
  };

  const away = settings[side].awayMode;
  const toggleAway = () => { void save.settings({ [side]: { awayMode: !away } }); };

  const tonight = schedules?.[side]?.[todayKey()];
  const plan = tonight?.power.enabled
    ? `Bed on at ${fmtTime(toMin(tonight.power.on))}${tonight.alarm.enabled ? ` · alarm ${fmtTime(toMin(tonight.alarm.time))}` : ''}`
    : 'No schedule tonight';
  const waterOk = ds.waterLevel === 'true';

  const tile = (kind: 'cold' | 'heat' | 'away') => {
    const cold = kind === 'cold';
    const heat = kind === 'heat';
    const active = kind === 'away' ? away : boostHere && boost!.kind === kind;
    const name = cold ? 'Cold Shot' : heat ? 'Heat Boost' : 'Away';
    // Each boost tile wears its temperature's colour; while running, the bed's live colour.
    const tf = active ? cf : cold ? MIN_F : MAX_F;
    const col = (a: number) => kind === 'away' ? `rgba(183,166,255,${a})` : tempTint(tf, a);
    const tint = kind === 'away' ? '#b7a6ff' : tempColor(tf);
    const soft = kind === 'away' ? 'var(--muted)' : tempSoft(tf);
    const sub = kind === 'away' ? (away ? 'On' : 'Off')
      : active ? `${clock} · Stop` : `${fmtTemp(cold ? MIN_F : MAX_F, unit)} · 15 min`;
    return (
      <button key={ kind } type="button" aria-pressed={ active }
              onClick={ kind === 'away' ? toggleAway : () => startBoost(kind) }
              aria-label={ kind === 'away' ? `Away, ${away ? 'on' : 'off'}` : active ? `Stop ${name}, ${clock} left` : `${name}: ${cold ? 'coolest' : 'warmest'} for 15 minutes on the ${side} side` }
              style={ { minHeight: 88, borderRadius: 18, padding: '8px 4px', color: 'var(--text)',
                background: 'var(--card)', border: `1px solid ${active ? tint : 'var(--line)'}`,
                boxShadow: active ? `0 0 18px ${col(.22)}` : 'none', transition: 'border-color .4s, box-shadow .4s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 } }>
        <span style={ { width: 38, height: 38, borderRadius: 99, marginBottom: 4, display: 'grid', placeItems: 'center',
          border: `1px solid ${kind === 'away' ? '#43414a' : col(.45)}`, color: kind === 'away' ? '#b0acb5' : soft,
          background: active ? `radial-gradient(${col(.35)}, ${col(.1)})` : 'transparent', boxShadow: active ? `0 0 16px ${col(.5)}` : 'none' } }>
          <Icon name={ cold ? 'snow' : heat ? 'flame' : 'bag' } size={ 20 }/>
        </span>
        <span style={ { fontSize: 14, fontWeight: 600 } }>{ name }</span>
        <span style={ { fontSize: 12, color: soft } }>{ sub }</span>
      </button>
    );
  };

  return (
    <div className="page" style={ { paddingTop: 0 } }>
      <BedHero ds={ ds } unit={ unit } selected={ side } colourF={ colourF } onTap={ tapSide }>
        <h1 className="num" style={ { margin: 0, fontSize: 15, fontWeight: 600, letterSpacing: -.2, lineHeight: 1, color: '#bcb8c0' } }>PodSleep</h1>
        <div style={ { marginTop: 10, fontSize: 20, fontWeight: 600 } }>{ greeting() }</div>
        <div style={ { marginTop: 4, fontSize: 13, color: '#bcb8c0' } }>{ plan }</div>
      </BedHero>

      { (!waterOk || ds.isPriming) && (
        <div role="status" className="row" style={ { gap: 10, padding: '10px 14px', borderRadius: 16, background: 'rgba(240,180,90,.10)', border: '1px solid rgba(240,180,90,.25)', color: 'var(--gold)', fontSize: 14 } }>
          <Icon name="drop" size={ 16 }/>{ !waterOk ? 'Water is low. Top up the Pod.' : 'Priming. The Pod may be noisy for a while.' }
        </div>
      ) }

      <section className="card" aria-label="Temperature" style={ { borderRadius: 24, padding: '12px 14px 12px', gap: 4 } }>
        <div className="between">
          <h2 style={ { margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--muted)' } }>{ side === 'left' ? 'Left side' : 'Right side' }</h2>
          <span style={ { flex: 'none', whiteSpace: 'nowrap', padding: '5px 12px', borderRadius: 999, fontSize: 12.5, ...chip } }>{ status }</span>
        </div>
        <div style={ { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,122px) minmax(0,1fr)', alignItems: 'center', gap: 10 } }>
          <button type="button" aria-label="Cooler" onClick={ () => step(-1) }
                  style={ { height: 56, borderRadius: 99, border: '1.5px solid #3a6f90', background: 'rgba(40,90,120,.15)', color: '#6fd0ef', display: 'grid', placeItems: 'center', padding: 0 } }>
            <Icon name="minus" size={ 26 } width={ 2.2 }/>
          </button>
          <Dial value={ fmtTemp(t, unit) } frac={ tempFrac(t) } colourF={ on ? cf : t } label={ `${side === 'left' ? 'Left' : 'Right'} side target temperature` }
                onDrag={ (fr) => setDragF(fracToF(fr, unit)) } onDrop={ dropDial } onKey={ step }/>
          <button type="button" aria-label="Warmer" onClick={ () => step(1) }
                  style={ { height: 56, borderRadius: 99, border: '1.5px solid #a85a50', background: 'rgba(150,60,50,.15)', color: '#ff9f90', display: 'grid', placeItems: 'center', padding: 0 } }>
            <Icon name="plus" size={ 26 } width={ 2.2 }/>
          </button>
        </div>
      </section>

      <div style={ { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 } }>
        { tile('cold') }{ tile('heat') }{ tile('away') }
      </div>
    </div>
  );
}

