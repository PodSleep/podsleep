import { Fragment, type ReactNode } from 'react';
import type { DeviceStatus } from '@api/deviceStatusSchema';
import { fmtTemp, lightTables, tempColor, tempSoft, tempTint, type Side, type Unit } from './lib';
import bed from './assets/bed.webp';
import bedMaskL from './assets/bed-mask-L.png';
import bedMaskR from './assets/bed-mask-R.png';
import headMaskL from './assets/head-mask-L.png';
import headMaskR from './assets/head-mask-R.png';

// The bed photo is 1696 × 1622; the masks and outlines are drawn in that space.
const IMG_W = 1696;
const IMG_H = 1622;
const OUTLINE: Record<Side, string> = {
  left: 'M324 1025 L856 1015 L856 1413 L186 1406 L180 1266 Z',
  right: 'M1387 1025 L856 1015 L856 1413 L1529 1406 L1527 1276 Z',
};
const MASK: Record<Side, string> = { left: bedMaskL, right: bedMaskR };
const HEAD: Record<Side, string> = { left: headMaskL, right: headMaskR };

type Look = 'selected' | 'on' | 'off';

const layer = { position: 'absolute', inset: 0, width: '100%', height: '100%' } as const;
const masked = (url: string) => ({
  ...layer, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`,
  WebkitMaskSize: '100% 100%', maskSize: '100% 100%',
});

/** The bed photo with each side lit by its temperature. Tap a side to select it, turn it on, or turn it off. */
export default function BedHero({ ds, unit, selected, colourF, onTap, children }: {
  ds: DeviceStatus; unit: Unit; selected: Side; colourF: Record<Side, number>; onTap: (s: Side) => void; children?: ReactNode;
}) {
  const look = (s: Side): Look => (!ds[s].isOn ? 'off' : s === selected ? 'selected' : 'on');

  const filterDefs = (['left', 'right'] as Side[]).map((s) => {
    const [r, g, b] = lightTables(colourF[s], look(s) === 'on');
    return (
      <filter key={ s } id={ `ps-light-${s}` } colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0.21 0.41 0.08 0 0  0.21 0.41 0.08 0 0  0.21 0.41 0.08 0 0  0 0 0 1 0"/>
        <feComponentTransfer>
          <feFuncR type="table" tableValues={ r }/>
          <feFuncG type="table" tableValues={ g }/>
          <feFuncB type="table" tableValues={ b }/>
        </feComponentTransfer>
      </filter>
    );
  });

  const side = (s: Side) => {
    const l = look(s);
    // Colour follows what the side is set to, so a change shows at once.
    const col = tempColor(colourF[s]);
    return (
      <Fragment key={ s }>
        <div style={ masked(MASK[s]) }>
          <img src={ bed } alt="" style={ { ...layer, filter: l === 'off' ? 'grayscale(1) brightness(.4) contrast(1.1)' : `url(#ps-light-${s})`, transition: 'filter .4s' } }/>
        </div>
        { l !== 'off' && (
          <div style={ { ...masked(HEAD[s]), background: col, mixBlendMode: 'color', opacity: l === 'selected' ? 0.12 : 0.05 } }/>
        ) }
        { l !== 'off' && (
          <svg viewBox={ `0 0 ${IMG_W} ${IMG_H}` } preserveAspectRatio="none" style={ { ...layer, pointerEvents: 'none' } } aria-hidden="true">
            <path d={ OUTLINE[s] } fill="none" strokeLinejoin="round"
                  stroke={ l === 'selected' ? tempSoft(colourF[s]) : col }
                  strokeWidth={ l === 'selected' ? 4 : 3 } opacity={ l === 'selected' ? 0.9 : 0.3 }
                  style={ l === 'selected' ? { filter: `drop-shadow(0 0 6px ${col}) drop-shadow(0 0 12px ${col})` } : undefined }/>
          </svg>
        ) }
      </Fragment>
    );
  };

  // Positions inside each tap area (which covers the bed from 38% down): the number sits in the
  // middle of that side's duvet, the hint on the front of the bed base.
  const NUM_X: Record<Side, string> = { left: '61%', right: '41%' };
  const BASE_X: Record<Side, string> = { left: '54%', right: '46%' };
  const label = (s: Side) => {
    const l = look(s);
    const st = ds[s];
    const diff = st.targetTemperatureF - st.currentTemperatureF;
    const moving = st.isOn && Math.abs(diff) >= 1;
    const name = s === 'left' ? 'Left' : 'Right';
    const aria = `${name} side, ${fmtTemp(st.currentTemperatureF, unit)}, `
      + (l === 'off' ? 'off. Tap to turn on.' : l === 'on' ? 'on. Tap to select.' : `selected${moving ? `, ${diff > 0 ? 'warming' : 'cooling'} to ${fmtTemp(st.targetTemperatureF, unit)}` : ''}. Tap to turn off.`);
    const cf = colourF[s];
    return (
      <button key={ s } type="button" onClick={ () => onTap(s) } aria-label={ aria } aria-pressed={ l === 'selected' }
              style={ { position: 'absolute', top: '38%', bottom: 0, [s]: 0, width: '50%', border: 0, padding: 0, background: 'transparent', color: 'inherit' } }>
        <span className="num" style={ { position: 'absolute', left: NUM_X[s], top: '46%', transform: 'translate(-50%, -50%)', fontSize: 'clamp(32px, 11vw, 44px)', fontWeight: 500, letterSpacing: -1.5, lineHeight: 1, whiteSpace: 'nowrap',
          color: l === 'selected' ? '#fff' : l === 'on' ? '#a9a9ad' : '#77737c', textShadow: '0 2px 16px rgba(0,0,0,.5)', transition: 'color .3s' } }>
          { fmtTemp(st.currentTemperatureF, unit) }
        </span>
        <span style={ { position: 'absolute', left: BASE_X[s], top: '91.5%', transform: 'translate(-50%, -50%)', fontSize: 10.5, lineHeight: 1.25, letterSpacing: .3, whiteSpace: 'nowrap',
          ...(l === 'selected'
            ? { padding: '2px 9px', borderRadius: 99, border: `1px solid ${tempTint(cf, .8)}`, color: tempSoft(cf),
              background: 'rgba(12,11,14,.55)', boxShadow: `0 0 10px ${tempTint(cf, .35)}` }
            : { color: l === 'on' ? '#a29ea8' : '#85818b', padding: '3px 0' }) } }>
          { l === 'selected' ? (moving ? `${diff > 0 ? '↑' : '↓'} ${fmtTemp(st.targetTemperatureF, unit)}` : 'Active') : l === 'on' ? 'Tap to select' : 'Off · tap to turn on' }
        </span>
      </button>
    );
  };

  return (
    <div style={ { position: 'relative', margin: '0 -20px', aspectRatio: '720 / 525', overflow: 'hidden' } }>
      <svg width="0" height="0" style={ { position: 'absolute' } } aria-hidden="true"><defs>{ filterDefs }</defs></svg>
      <div aria-hidden="true" style={ { position: 'absolute', left: 0, top: '-27.4%', width: '100%', aspectRatio: `${IMG_W} / ${IMG_H}`,
        WebkitMaskImage: 'linear-gradient(#000 95.5%, transparent 98%)', maskImage: 'linear-gradient(#000 95.5%, transparent 98%)' } }>
        <img src={ bed } alt="" style={ layer }/>
        { side('left') }{ side('right') }
      </div>
      <div aria-hidden="true" style={ { position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(rgba(29,28,33,.5) 0%, rgba(29,28,33,0) 22%, rgba(24,23,27,0) 100%)' } }/>
      <div style={ { position: 'absolute', left: 20, right: 20, top: 'max(16px, env(safe-area-inset-top))', zIndex: 2 } }>{ children }</div>
      <div role="group" aria-label="Bed" style={ { position: 'absolute', inset: 0 } }>
        { label('left') }{ label('right') }
      </div>
    </div>
  );
}
