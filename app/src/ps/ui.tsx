import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from './store';

const P: Record<string, string> = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  clock: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8v4l3 2',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1',
  power: 'M12 3v9M6.3 6.8a8 8 0 1 0 11.4 0',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  snow: 'M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7',
  flame: 'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-9z',
  bag: 'M5 7h14v13H5zM9 7V4h6v3M9 11v5M15 11v5',
  drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  x: 'M6 6l12 12M18 6L6 18',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  copy: 'M8 8h12v12H8zM16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
  alarm: 'M12 20a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM12 10v3l2 2M5 4L3 6M19 4l2 2',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1',
  check: 'M5 12l5 5L19 7',
  wave: 'M4 12h3l3-8 4 16 3-8h3',
  thermo: 'M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z',
  tap: 'M9 11V6a2 2 0 0 1 4 0v5M13 10a2 2 0 0 1 4 0v4a6 6 0 0 1-12 0v-2a2 2 0 0 1 4 0',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  restart: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
};

export const Icon = ({ name, size = 20, width = 2 }: { name: keyof typeof P | string; size?: number; width?: number }) => (
  <svg width={ size } height={ size } viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={ width }
       strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={ P[name] }/>
  </svg>
);

export const Switch = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button type="button" role="switch" aria-checked={ on } aria-label={ label } className="switch" onClick={ () => onChange(!on) }>
    { on ? 'On' : 'Off' }
  </button>
);

// Outlined circle, the same as the icons on the Home tiles. `bg` is kept for callers but unused.
export const Tile = ({ icon, fg }: { icon: string; bg?: string; fg: string }) => (
  <span style={ { width: 36, height: 36, borderRadius: 99, border: `1px solid ${fg}59`, background: `radial-gradient(${fg}14, transparent 70%)`, color: fg,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } }>
    <Icon name={ icon } size={ 17 }/>
  </span>
);

export const TILES = {
  // Softer than before so the icons sit quietly with the lit-bed palette.
  blue: ['', '#8fd3ea'], warm: ['', '#f0a597'], gold: ['', '#dcbd78'],
  violet: ['', '#bdb0f5'], green: ['', '#8fd9b6'], grey: ['', '#b0acb5'],
} as const;

export const Card = ({ children, label, style }: { children: ReactNode; label?: string; style?: React.CSSProperties }) => (
  <section className="card" aria-label={ label } style={ style }>{ children }</section>
);

export const BottomNav = () => (
  <nav className="nav" aria-label="Main">
    { [['/', 'Home', 'home'], ['/schedule', 'Schedule', 'clock'], ['/sleep', 'Sleep', 'moon'], ['/settings', 'Settings', 'gear']].map(([to, label, icon]) => (
      <NavLink key={ to } to={ to } end={ to === '/' } className={ ({ isActive }) => isActive ? 'active' : '' }>
        <Icon name={ icon }/>{ label }
      </NavLink>
    )) }
  </nav>
);

export const Toast = () => {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return <div className="toast" role="status"><Icon name="check" size={ 16 } width={ 2.4 }/>{ toast }</div>;
};

export const SideSwitch = () => {
  const side = useApp((s) => s.side);
  const setSide = useApp((s) => s.setSide);
  return (
    <div className="seg" role="group" aria-label="Side">
      <button type="button" aria-pressed={ side === 'left' } onClick={ () => setSide('left') }>Left</button>
      <button type="button" aria-pressed={ side === 'right' } onClick={ () => setSide('right') }>Right</button>
    </div>
  );
};

export const Loading = () => <div className="muted small" style={ { padding: 24, textAlign: 'center' } }>Connecting to the Pod…</div>;
