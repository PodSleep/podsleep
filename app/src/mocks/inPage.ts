// PodSleep preview: answers API calls inside the page (no service worker),
// so the demo can run as a hosted preview.
import { getResponse } from 'msw';
import type { AxiosAdapter, AxiosResponse } from 'axios';
import axiosInstance from '@api/api';
import { handlers } from './handlers';

const adapter: AxiosAdapter = async (config) => {
  const joined = `${(config.baseURL || '').replace(/\/+$/, '')}/${(config.url || '').replace(/^\/+/, '')}`;
  const url = new URL(joined, window.location.origin);
  Object.entries(config.params || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const method = (config.method || 'get').toUpperCase();
  const body = config.data && method !== 'GET' ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : undefined;
  const request = new Request(url.toString(), { method, body, headers: { 'Content-Type': 'application/json' } });
  const res = await getResponse(handlers, request);
  const status = res?.status ?? 404;
  const text = res ? await res.text() : '';
  let data: unknown = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* plain text */ }
  const response: AxiosResponse = { data, status, statusText: res?.statusText ?? '', headers: {}, config, request: {} };
  if (status >= 400) {
    const err = Object.assign(new Error(`Request failed with status ${status}`), { response, isAxiosError: true });
    throw err;
  }
  return response;
};

export const startInPageMocks = async () => {
  axiosInstance.defaults.adapter = adapter;
  // Show the preview in Celsius and the viewer's own time zone.
  await axiosInstance.post('/settings', { temperatureFormat: 'celsius', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
};
