import { create } from 'zustand';
import { local, type Side } from './lib';

try { localStorage.removeItem('podsleep.boost'); } catch { /* not available */ }

export type NightPrefs = { enabled: boolean; start: string; end: string };

type State = {
  mode: 'solo' | 'dual';
  side: Side;
  showLevel: boolean;
  night: NightPrefs;
  toast: string;
  setMode: (m: 'solo' | 'dual') => void;
  setSide: (s: Side) => void;
  setShowLevel: (v: boolean) => void;
  setNight: (n: Partial<NightPrefs>) => void;
  say: (msg: string) => void;
};

let toastTimer: number | undefined;

export const useApp = create<State>((set, get) => ({
  mode: local.get('mode', 'dual'),
  side: local.get('side', 'left'),
  showLevel: local.get('showLevel', false),
  night: local.get('night', { enabled: true, start: '21:00', end: '07:00' }),
  toast: '',
  setMode: (mode) => { local.set('mode', mode); set({ mode }); },
  setSide: (side) => { local.set('side', side); set({ side }); },
  setShowLevel: (showLevel) => { local.set('showLevel', showLevel); set({ showLevel }); },
  setNight: (n) => { const night = { ...get().night, ...n }; local.set('night', night); set({ night }); },
  say: (toast) => {
    window.clearTimeout(toastTimer);
    set({ toast });
    toastTimer = window.setTimeout(() => set({ toast: '' }), 3000);
  },
}));
