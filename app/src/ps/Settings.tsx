import { useState, type ReactNode } from 'react';
import axios from '@api/api';
import { postAlarm } from '@api/alarm';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Settings as PodSettings } from '@api/settingsSchema';
import type { Schedules } from '@api/schedulesSchema.ts';
import { useDeviceStatus, useSave, useSchedules, useSettings, useUnit } from './data';
import { useApp } from './store';
import { DAYS, DEFAULT_FEEL, fmtTime, toMin, type AlarmFeel } from './lib';
import { Icon, Loading, Switch, Tile, TILES } from './ui';

type Gesture = 'doubleTap' | 'tripleTap' | 'quadTap';
type Tap = PodSettings['left']['taps']['doubleTap'];
const GESTURES: [Gesture, string][] = [['doubleTap', 'Double tap'], ['tripleTap', 'Triple tap'], ['quadTap', 'Four taps']];

const tapName = (t: Tap) => {
  if (t.type === 'temperature') {
    if (!t.amount) return 'Nothing';
    return t.change === 'increment' ? 'Warmer by 1°' : 'Cooler by 1°';
  }
  return t.behavior === 'snooze' ? 'Snooze alarm' : 'Dismiss alarm';
};
const tapFor = (name: string, snooze: number): Tap => {
  switch (name) {
    case 'Warmer by 1°': return { type: 'temperature', change: 'increment', amount: 1 };
    case 'Cooler by 1°': return { type: 'temperature', change: 'decrement', amount: 1 };
    case 'Snooze alarm': return { type: 'alarm', behavior: 'snooze', snoozeDuration: snooze, inactiveAlarmBehavior: 'none' };
    case 'Dismiss alarm': return { type: 'alarm', behavior: 'dismiss', snoozeDuration: snooze, inactiveAlarmBehavior: 'none' };
    default: return { type: 'temperature', change: 'increment', amount: 0 };
  }
};

const useServices = () => useQuery<{ biometrics: { enabled: boolean } }>({
  queryKey: ['psServices'],
  queryFn: async () => (await axios.get('/services')).data,
});

const Row = ({ icon, color, title, value, onClick }: { icon: string; color: keyof typeof TILES; title: string; value: string; onClick: () => void }) => (
  <button type="button" onClick={ onClick } style={ { width: '100%', minHeight: 60, padding: '10px 14px', border: 0, background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' } }>
    <Tile icon={ icon } bg={ TILES[color][0] } fg={ TILES[color][1] }/>
    <span className="grow" style={ { fontSize: 15 } }>{ title }</span>
    <span className="muted" style={ { fontSize: 14 } }>{ value }</span>
    <span style={ { color: '#6f7789', display: 'flex' } }><Icon name="chevR" size={ 16 }/></span>
  </button>
);

const ToggleRow = ({ icon, color, title, on, onChange }: { icon: string; color: keyof typeof TILES; title: string; on: boolean; onChange: (v: boolean) => void }) => (
  <div style={ { minHeight: 60, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12 } }>
    <Tile icon={ icon } bg={ TILES[color][0] } fg={ TILES[color][1] }/>
    <span className="grow" style={ { fontSize: 15 } }>{ title }</span>
    <Switch on={ on } onChange={ onChange } label={ title }/>
  </div>
);

const Radios = ({ heading, options, value, onPick, dim }: { heading?: string; options: [string, string?][]; value: string; onPick: (v: string) => void; dim?: boolean }) => (
  <section style={ { display: 'flex', flexDirection: 'column', gap: 8, opacity: dim ? .45 : 1 } } aria-label={ heading || 'Options' }>
    { heading && <h2 className="label" style={ { marginLeft: 6, color: 'var(--faint)' } }>{ heading }</h2> }
    <div className="list" role="radiogroup" aria-label={ heading || 'Options' }>
      { options.map(([label, desc]) => {
        const on = label === value;
        return (
          <button key={ label } type="button" role="radio" aria-checked={ on } onClick={ () => onPick(label) }
                  style={ { width: '100%', minHeight: 56, padding: '10px 16px', border: 0, background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' } }>
            <span className="grow">
              <span style={ { display: 'block', fontSize: 15 } }>{ label }</span>
              { desc && <span style={ { display: 'block', fontSize: 12, color: 'var(--faint)', marginTop: 2 } }>{ desc }</span> }
            </span>
            <span style={ { width: 22, height: 22, borderRadius: 99, border: `2px solid ${on ? 'var(--cool)' : '#3a3a44'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' } }>
              <span style={ { width: 10, height: 10, borderRadius: 99, background: on ? 'var(--cool)' : 'transparent' } }/>
            </span>
          </button>
        );
      }) }
    </div>
  </section>
);

const Sub = ({ title, back, onBack, intro, children }: { title: string; back: string; onBack: () => void; intro?: string; children: ReactNode }) => (
  <div className="page" style={ { gap: 18 } }>
    <header style={ { display: 'flex', flexDirection: 'column', gap: 6 } }>
      <button type="button" onClick={ onBack } style={ { alignSelf: 'flex-start', minHeight: 44, padding: '0 12px 0 4px', border: 0, background: 'transparent', color: '#6fd0ef', fontSize: 15, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 } }>
        <Icon name="chevL" width={ 2.2 }/>{ back }
      </button>
      <h1 className="h1" style={ { fontSize: 26 } }>{ title }</h1>
      { intro && <p className="muted" style={ { margin: 0, fontSize: 14, lineHeight: 1.5 } }>{ intro }</p> }
    </header>
    { children }
  </div>
);

const TIME_ZONES: [string, string][] = [
  ['Australia/Sydney', 'Sydney'], ['Australia/Brisbane', 'Brisbane'], ['Australia/Adelaide', 'Adelaide'], ['Australia/Perth', 'Perth'], ['Pacific/Auckland', 'Auckland'],
];
const INTENSITY: [string, number][] = [['Gentle', 30], ['Medium', 60], ['Strong', 100]];
const LENGTH: [string, number][] = [['30 sec', 30], ['1 min', 60], ['2 min', 120], ['3 min', 180]];
const SNOOZE: [string, number][] = [['1 min', 60], ['3 min', 180], ['5 min', 300], ['9 min', 540], ['10 min', 600]];
const LIGHT: [string, number, string?][] = [['Off', 0], ['Low', 20, '20%, good for a dark bedroom'], ['Medium', 50, '50%'], ['High', 100, '100%']];
const nearest = <T,>(list: [string, number, ...T[]][], v: number) => list.reduce((best, x) => Math.abs(x[1] - v) < Math.abs(best[1] - v) ? x : best)[0];

export default function Settings() {
  const { data: settings } = useSettings();
  const { data: ds } = useDeviceStatus();
  // Free Sleep only reads taps on Pod 4 and 5 covers; a Pod 3 cover has no tap sensors.
  const hasTaps = !!ds && ds.coverVersion !== 'Pod 3';
  const { data: schedules } = useSchedules();
  const { data: services } = useServices();
  const qc = useQueryClient();
  const unit = useUnit();
  const save = useSave();
  const { side, night, setNight, setShowLevel, say } = useApp();
  const [page, setPage] = useState<string>('root');
  const [testing, setTesting] = useState(false);

  if (!settings || !ds || !schedules) return <div className="page"><Loading/></div>;

  const firstAlarm = schedules[side]?.monday?.alarm;
  const feel: AlarmFeel = firstAlarm ? { vibrationPattern: firstAlarm.vibrationPattern, vibrationIntensity: firstAlarm.vibrationIntensity, duration: firstAlarm.duration } : DEFAULT_FEEL;
  const taps = settings[side].taps;
  const snoozeTap = GESTURES.map(([g]) => taps[g]).find((t) => t.type === 'alarm');
  const snooze = snoozeTap && snoozeTap.type === 'alarm' ? snoozeTap.snoozeDuration : 300;

  const setFeel = (patch: Partial<AlarmFeel>) => {
    const next = { ...feel, ...patch };
    const all: Partial<Schedules> = {};
    (['left', 'right'] as const).forEach((s) => {
      (all as any)[s] = Object.fromEntries(DAYS.map((d) => [d.key, { alarm: { ...schedules[s][d.key].alarm, ...next } }]));
    });
    void save.schedules(all);
  };
  const setTap = (g: Gesture, name: string) => {
    const t = tapFor(name, snooze);
    void save.settings({ left: { taps: { [g]: t } }, right: { taps: { [g]: t } } });
  };
  const setSnooze = (seconds: number) => {
    const patch: any = { left: { taps: {} }, right: { taps: {} } };
    (['left', 'right'] as const).forEach((s) => GESTURES.forEach(([g]) => {
      const t = settings[s].taps[g];
      if (t.type === 'alarm') patch[s].taps[g] = { ...t, snoozeDuration: seconds };
    }));
    void save.settings(patch);
  };
  const test = async () => {
    setTesting(true);
    try {
      await postAlarm({ side, vibrationIntensity: feel.vibrationIntensity, vibrationPattern: feel.vibrationPattern, duration: Math.min(feel.duration, 10), force: true });
    } catch {
      say('Couldn’t reach the Pod. Try again.');
    }
    window.setTimeout(() => setTesting(false), 4000);
  };
  const setTracking = async (enabled: boolean) => {
    qc.setQueryData(['psServices'], { ...services, biometrics: { ...services?.biometrics, enabled } });
    try { await axios.post('/services', { biometrics: { enabled } }); } catch { say('Couldn’t reach the Pod. Try again.'); }
    qc.invalidateQueries({ queryKey: ['psServices'] });
  };

  const unitName = unit === 'L' ? 'Level' : unit === 'F' ? '°F' : '°C';
  const nightLabel = (v: string, _kind?: 'start' | 'end') => v === 'bed' ? 'At bed-on time' : v === 'alarm' ? 'At alarm time' : fmtTime(toMin(v));
  const tzName = TIME_ZONES.find(([k]) => k === settings.timeZone)?.[1] || settings.timeZone.split('/').pop()!.replace('_', ' ');
  const back = () => setPage(page.startsWith('tap-') ? 'taps' : 'root');

  if (page === 'units') return (
    <Sub title="Temperature units" back="Settings" onBack={ back }>
      <Radios value={ unitName } options={ [['°C', 'Celsius, 13° to 43.5°'], ['°F', 'Fahrenheit, 55° to 110°'], ['Level', 'Eight Sleep style, −10 to +10']] }
              onPick={ (v) => { setShowLevel(v === 'Level'); if (v !== 'Level') void save.settings({ temperatureFormat: v === '°F' ? 'fahrenheit' : 'celsius' }); } }/>
    </Sub>
  );
  if (page === 'night') return (
    <Sub title="Night mode" back="Settings" onBack={ back } intro="Dims the screen and warms its colours, so checking your phone in bed is gentler on your eyes.">
      <div className="list"><div className="row" style={ { minHeight: 60, padding: '10px 16px' } }><span className="grow" style={ { fontSize: 15 } }>Night mode</span><Switch on={ night.enabled } onChange={ (v) => setNight({ enabled: v }) } label="Night mode"/></div></div>
      <Radios heading="Turns on" dim={ !night.enabled } value={ nightLabel(night.start, 'start') } options={ [['8:30 pm'], ['9:00 pm'], ['9:30 pm'], ['At bed-on time']] }
              onPick={ (v) => setNight({ start: v === 'At bed-on time' ? 'bed' : v === '8:30 pm' ? '20:30' : v === '9:00 pm' ? '21:00' : '21:30' }) }/>
      <Radios heading="Turns off" dim={ !night.enabled } value={ nightLabel(night.end, 'end') } options={ [['6:30 am'], ['7:00 am'], ['At alarm time']] }
              onPick={ (v) => setNight({ end: v === 'At alarm time' ? 'alarm' : v === '6:30 am' ? '06:30' : '07:00' }) }/>
    </Sub>
  );
  if (page === 'taps') return (
    <Sub title="Tap the cover" back="Settings" onBack={ back } intro="Control the Pod without your phone by tapping the side of the cover.">
      <div className="list">
        { GESTURES.map(([g, name]) => (
          <button key={ g } type="button" onClick={ () => setPage(`tap-${g}`) } style={ { width: '100%', minHeight: 56, padding: '10px 16px', border: 0, background: 'transparent', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' } }>
            <span className="grow" style={ { fontSize: 15 } }>{ name }</span>
            <span className="muted" style={ { fontSize: 14 } }>{ tapName(taps[g]) }</span>
            <span style={ { color: '#6f7789', display: 'flex' } }><Icon name="chevR" size={ 16 }/></span>
          </button>
        )) }
      </div>
    </Sub>
  );
  if (page.startsWith('tap-')) {
    const g = page.slice(4) as Gesture;
    const name = GESTURES.find(([k]) => k === g)![1];
    return (
      <Sub title={ name } back="Tap the cover" onBack={ back }>
        <Radios value={ tapName(taps[g]) } options={ [['Warmer by 1°'], ['Cooler by 1°'], ['Snooze alarm'], ['Dismiss alarm'], ['Nothing']] } onPick={ (v) => setTap(g, v) }/>
      </Sub>
    );
  }
  if (page === 'alarm') return (
    <Sub title="Alarm" back="Settings" onBack={ back }>
      <Radios heading="Vibration" value={ feel.vibrationPattern === 'rise' ? 'Rise' : 'Double' } options={ [['Rise', 'Starts soft and builds'], ['Double', 'Two firm pulses, repeated']] }
              onPick={ (v) => setFeel({ vibrationPattern: v === 'Rise' ? 'rise' : 'double' }) }/>
      <Radios heading="Intensity" value={ nearest(INTENSITY, feel.vibrationIntensity) } options={ INTENSITY.map(([l, n]) => [l, `${n}%`]) }
              onPick={ (v) => setFeel({ vibrationIntensity: INTENSITY.find(([l]) => l === v)![1] }) }/>
      <Radios heading="Length" value={ nearest(LENGTH, feel.duration) } options={ LENGTH.map(([l]) => [l]) }
              onPick={ (v) => setFeel({ duration: LENGTH.find(([l]) => l === v)![1] }) }/>
      { hasTaps && <Radios heading="Snooze" value={ nearest(SNOOZE, snooze) } options={ SNOOZE.map(([l]) => [l]) }
              onPick={ (v) => setSnooze(SNOOZE.find(([l]) => l === v)![1]) }/> }
      <button type="button" className="btn fill big" onClick={ test } disabled={ testing } style={ { borderColor: testing ? 'var(--gold)' : undefined } }>
        <Icon name="wave" size={ 18 }/>{ testing ? 'Buzzing your side…' : 'Test on my side' }
      </button>
    </Sub>
  );
  if (page === 'water') return (
    <Sub title="Water and priming" back="Settings" onBack={ back } intro="Priming pushes air out of the water lines. Free Sleep only primes while the bed is empty.">
      <div className="list">
        <div className="row" style={ { minHeight: 60, padding: '10px 16px' } }><span className="grow" style={ { fontSize: 15 } }>Prime every day</span>
          <Switch on={ settings.primePodDaily.enabled } onChange={ (v) => void save.settings({ primePodDaily: { enabled: v } }) } label="Prime every day"/></div>
        <div className="row" style={ { minHeight: 52, padding: '10px 16px' } }><span className="grow" style={ { fontSize: 15, color: 'var(--text-2)' } }>Water level</span><span>{ ds.waterLevel === 'true' ? 'OK' : 'Low' }</span></div>
      </div>
      <Radios heading="Prime at" dim={ !settings.primePodDaily.enabled } value={ fmtTime(toMin(settings.primePodDaily.time)) }
              options={ [['10:00 am'], ['2:00 pm'], ['6:00 pm']] }
              onPick={ (v) => void save.settings({ primePodDaily: { time: v === '10:00 am' ? '10:00' : v === '2:00 pm' ? '14:00' : '18:00' } }) }/>
      <button type="button" className="btn fill big" disabled={ ds.isPriming } onClick={ () => { void save.device({ isPriming: true }); say('Priming started'); } }>
        { ds.isPriming ? 'Priming…' : 'Prime now' }
      </button>
    </Sub>
  );
  if (page === 'light') return (
    <Sub title="Pod light" back="Settings" onBack={ back } intro="Brightness of the light on the hub.">
      <Radios value={ nearest(LIGHT, ds.settings.ledBrightness) } options={ LIGHT.map(([l, , d]) => [l, d]) }
              onPick={ (v) => void save.device({ settings: { ledBrightness: LIGHT.find(([l]) => l === v)![1] } }) }/>
    </Sub>
  );
  if (page === 'tz') return (
    <Sub title="Time zone" back="Settings" onBack={ back } intro="Schedules and alarms run on the Pod's clock, so this must match where the bed is.">
      <Radios value={ tzName } options={ TIME_ZONES.map(([k, n]) => [n, k]) }
              onPick={ (v) => void save.settings({ timeZone: TIME_ZONES.find(([, n]) => n === v)![0] as PodSettings['timeZone'] }) }/>
    </Sub>
  );
  if (page === 'about') return (
    <Sub title="About" back="Settings" onBack={ back }>
      <div className="list">
        { [['PodSleep', '1.0.1'], ['Free Sleep', ds.freeSleep.version], ['Hub', ds.hubVersion], ['Cover', ds.coverVersion], ['Wi-Fi signal', `${ds.wifiStrength}%`]].map(([k, v]) => (
          <div key={ k } className="row" style={ { minHeight: 52, padding: '10px 16px' } }><span className="grow" style={ { fontSize: 15, color: 'var(--text-2)' } }>{ k }</span><span>{ v }</span></div>
        )) }
      </div>
    </Sub>
  );

  const groups: [string, ReactNode[]][] = [
    ['Comfort', [
      <Row key="u" icon="thermo" color="warm" title="Temperature units" value={ unitName } onClick={ () => setPage('units') }/>,
      <Row key="n" icon="moon" color="violet" title="Night mode" value={ night.enabled ? `${nightLabel(night.start, 'start').replace('At bed-on time', 'Bed on')} – ${nightLabel(night.end, 'end').replace('At alarm time', 'Alarm')}` : 'Off' } onClick={ () => setPage('night') }/>,
      ...(hasTaps ? [<Row key="t" icon="tap" color="blue" title="Tap the cover" value="3 gestures" onClick={ () => setPage('taps') }/>] : []),
      <Row key="a" icon="alarm" color="gold" title="Alarm" value={ `${feel.vibrationPattern === 'rise' ? 'Rise' : 'Double'} · ${nearest(INTENSITY, feel.vibrationIntensity)}` } onClick={ () => setPage('alarm') }/>,
    ]],
    ['Pod', [
      <Row key="w" icon="drop" color="blue" title="Water and priming" value={ settings.primePodDaily.enabled ? `Daily, ${fmtTime(toMin(settings.primePodDaily.time))}` : 'Manual' } onClick={ () => setPage('water') }/>,
      <Row key="l" icon="bulb" color="gold" title="Pod light" value={ nearest(LIGHT, ds.settings.ledBrightness) } onClick={ () => setPage('light') }/>,
      <Row key="z" icon="globe" color="grey" title="Time zone" value={ tzName } onClick={ () => setPage('tz') }/>,
    ]],
    ['System', [
      <ToggleRow key="s" icon="pulse" color="green" title="Sleep tracking" on={ !!services?.biometrics?.enabled } onChange={ (v) => void setTracking(v) }/>,
      <ToggleRow key="r" icon="restart" color="grey" title="Restart daily" on={ settings.rebootDaily } onChange={ (v) => void save.settings({ rebootDaily: v }) }/>,
      <Row key="ab" icon="info" color="grey" title="About" value="PodSleep 1.0.1" onClick={ () => setPage('about') }/>,
    ]],
  ];

  return (
    <div className="page" style={ { gap: 18 } }>
      <header className="between">
        <h1 className="h1">Settings</h1>
        <span className="row small" style={ { gap: 6, padding: '6px 12px', borderRadius: 999, border: '1px solid #34323a', color: 'var(--text-2)' } }>
          <span style={ { width: 7, height: 7, borderRadius: 99, background: 'var(--green)' } }/>Pod connected
        </span>
      </header>
      { groups.map(([h, rows]) => (
        <section key={ h } aria-label={ h } style={ { display: 'flex', flexDirection: 'column', gap: 8 } }>
          <h2 className="label" style={ { marginLeft: 6, color: 'var(--faint)' } }>{ h }</h2>
          <div className="list">{ rows }</div>
        </section>
      )) }
    </div>
  );
}
