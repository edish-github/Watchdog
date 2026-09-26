import type { CityId } from './types';
import { CITY } from './catalog';

export type DailyMap = Record<string, { tmax: number; rain: number }>;
export interface LiveImport { data: DailyMap; fetchedAt: string; from: string; to: string; days: number; ms: number; url: string }

const TIMEOUT_MS = 10_000;
// Wrapped, not passed bare: browsers throw "Illegal invocation" when window.fetch is called unbound.
const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

async function getJson(url: string, doFetch: typeof fetch) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await doFetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as unknown;
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`No answer within ${TIMEOUT_MS / 1000} s`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Daily max temperature + precipitation: past 92 days and a 16-day forecast (Open-Meteo, CC BY 4.0). */
export async function fetchOpenMeteo(city: CityId, doFetch: typeof fetch = defaultFetch): Promise<LiveImport> {
  const c = CITY[city];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=temperature_2m_max,precipitation_sum&past_days=92&forecast_days=16&timezone=${encodeURIComponent(c.tz)}`;
  const t0 = performance.now();
  const j = (await getJson(url, doFetch).catch((e) => { throw new Error(`Open-Meteo: ${e instanceof Error ? e.message : e}`); })) as { daily?: { time: string[]; temperature_2m_max: (number | null)[]; precipitation_sum: (number | null)[] } };
  const dd = j.daily;
  if (!dd?.time?.length) throw new Error('Open-Meteo returned no daily data');
  const data: DailyMap = {};
  dd.time.forEach((t, i) => {
    const tmax = dd.temperature_2m_max[i], rain = dd.precipitation_sum[i];
    if (tmax != null && rain != null) data[t] = { tmax: Math.round(tmax * 10) / 10, rain: Math.round(rain * 10) / 10 };
  });
  const keys = Object.keys(data).sort();
  if (!keys.length) throw new Error('Open-Meteo returned only empty values');
