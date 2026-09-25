import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { CityId } from './types';
import { CITY } from './catalog';
import { setWeatherOverrides } from './weather';

export type DailyMap = Record<string, { tmax: number; rain: number }>;
export interface LiveImport { data: DailyMap; fetchedAt: string; from: string; to: string; days: number; ms: number; url: string }

/** Imported live weather per city. Applied as overrides to the synthetic weather on rehydrate and on save. */
export const useLiveWeather = create<{ imports: Partial<Record<CityId, LiveImport>>; save: (c: CityId, v: LiveImport | null) => void }>()(
  persist(
    (set) => ({
      imports: {},
      save: (c, v) => {
        setWeatherOverrides(c, v ? v.data : null);
        set((s) => { const imports = { ...s.imports }; if (v) imports[c] = v; else delete imports[c]; return { imports }; });
      },
    }),
    {
      name: 'watchdog-weather', storage: createJSONStorage(() => localStorage), skipHydration: true,
      onRehydrateStorage: () => (state) => { if (state) for (const [c, v] of Object.entries(state.imports)) if (v) setWeatherOverrides(c as CityId, v.data); },
    },
  ),
);

/** Daily max temperature + precipitation: past 92 days and a 16-day forecast (Open-Meteo, CC BY 4.0). */
export async function fetchOpenMeteo(city: CityId): Promise<LiveImport> {
  const c = CITY[city];
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=temperature_2m_max,precipitation_sum&past_days=92&forecast_days=16&timezone=${encodeURIComponent(c.tz)}`;
  const t0 = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const j = (await res.json()) as { daily?: { time: string[]; temperature_2m_max: (number | null)[]; precipitation_sum: (number | null)[] } };
  const dd = j.daily;
  if (!dd?.time?.length) throw new Error('Open-Meteo returned no daily data');
  const data: DailyMap = {};
  dd.time.forEach((t, i) => {
    const tmax = dd.temperature_2m_max[i], rain = dd.precipitation_sum[i];
    if (tmax != null && rain != null) data[t] = { tmax: Math.round(tmax * 10) / 10, rain: Math.round(rain * 10) / 10 };
  });
  const keys = Object.keys(data).sort();
  if (!keys.length) throw new Error('Open-Meteo returned only empty values');
  return { data, fetchedAt: new Date().toISOString(), from: keys[0], to: keys[keys.length - 1], days: keys.length, ms: Math.round(performance.now() - t0), url };
}

/** GloFAS river discharge (m³/s) at the city's 5 km grid cell via the Open-Meteo Flood API. Informational. */
export async function fetchGlofas(city: CityId) {
  const c = CITY[city];
  const url = `https://flood-api.open-meteo.com/v1/flood?latitude=${c.lat}&longitude=${c.lon}&daily=river_discharge&past_days=14&forecast_days=7`;
  const t0 = performance.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Flood API HTTP ${res.status}`);
  const j = (await res.json()) as { daily?: { time: string[]; river_discharge: (number | null)[] } };
  const days = (j.daily?.time ?? []).map((date, i) => ({ date, q: j.daily!.river_discharge[i] })).filter((x): x is { date: string; q: number } => x.q != null);
  if (!days.length) throw new Error('No discharge values at this grid cell');
  return { days, ms: Math.round(performance.now() - t0), url };
}
