import './ps/styles.css';
import { StrictMode, lazy, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, MemoryRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from './ps/Home';
import { useBoostNotice } from './ps/data';
import { BottomNav, Loading, Toast } from './ps/ui';
import { useApp } from './ps/store';
import { useSchedules } from './ps/data';
import { toMin, todayKey, after } from './ps/lib';

const Schedule = lazy(() => import('./ps/Schedule'));
const Sleep = lazy(() => import('./ps/Sleep'));
const Settings = lazy(() => import('./ps/Settings'));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, refetchOnWindowFocus: true } } });

/** Night mode: dims and warms the screen between the chosen times. */
const useNightMode = () => {
  const night = useApp((s) => s.night);
  const side = useApp((s) => s.side);
  const { data: schedules } = useSchedules();
  if (!night.enabled) return false;
  const today = schedules?.[side]?.[todayKey()];
  const start = night.start === 'bed' && today ? toMin(today.power.on) : toMin(night.start === 'bed' ? '21:00' : night.start);
  const end = night.end === 'alarm' && today ? toMin(today.alarm.time) : toMin(night.end === 'alarm' ? '07:00' : night.end);
  const d = new Date();
  const nowMin = d.getHours() * 60 + d.getMinutes();
  return after(start, nowMin) < after(start, end);
};

const Layout = () => {
  useBoostNotice();
  const night = useNightMode();
  return (
    <div className={ `app${night ? ' night' : ''}` }>
      <Suspense fallback={ <div className="page"><Loading/></div> }>
        <Outlet/>
      </Suspense>
      <Toast/>
      <BottomNav/>
    </div>
  );
};

const isPreview = import.meta.env.VITE_ENV === 'artifact';
const Router = ({ children }: { children: ReactNode }) => isPreview
  ? <MemoryRouter>{ children }</MemoryRouter>
  : <BrowserRouter basename="/">{ children }</BrowserRouter>;

const App = (): ReactNode => (
  <QueryClientProvider client={ queryClient }>
    <Router>
      <Routes>
        <Route path="/" element={ <Layout/> }>
          <Route index element={ <Home/> }/>
          <Route path="schedule" element={ <Schedule/> }/>
          <Route path="sleep" element={ <Sleep/> }/>
          <Route path="settings" element={ <Settings/> }/>
          <Route path="*" element={ <Navigate to="/" replace/> }/>
        </Route>
      </Routes>
    </Router>
  </QueryClientProvider>
);

async function enableMocking() {
  if (isPreview) {
    const { startInPageMocks } = await import('./mocks/inPage');
    await startInPageMocks();
    return;
  }
  if (import.meta.env.VITE_ENV !== 'demo') return;
  const { worker } = await import('./mocks/browser');
  return worker.start();
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
});
