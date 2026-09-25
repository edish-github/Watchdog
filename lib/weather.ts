import type { CityId, DayWeather, Site } from './types';
import { clamp, dayAdd, dayOfYear, daysBetween, hash01, round } from './utils';

/**
 * Synthetic, deterministic weather. Climatology + seeded noise + named heatwaves for the whole season,
 * with an explicit replay window (1 Sep – 3 Oct 2026) for the golden path. Every value is labelled synthetic
 * in the UI. `setWeatherOverrides` lets the Data Sources screen swap in live Open-Meteo archive values.
 */
interface Clim { tMean: number; tAmp: number; peakDoy: number; wetP: number; wetMm: number; flowBase: number; heat: [string, string, number][] }
export const CLIMATE: Record<CityId, Clim> = {
  coimbra: { tMean: 22.4, tAmp: 7.6, peakDoy: 210, wetP: 0.09, wetMm: 5, flowBase: 0.27, heat: [['2026-06-26', '2026-07-03', 5.5], ['2026-07-15', '2026-07-23', 6.5], ['2026-08-05', '2026-08-14', 7]] },
  ghent: { tMean: 15.2, tAmp: 7.2, peakDoy: 205, wetP: 0.34, wetMm: 5.5, flowBase: 0.58, heat: [['2026-07-18', '2026-07-24', 8]] },
  oslo: { tMean: 12.2, tAmp: 9.5, peakDoy: 200, wetP: 0.36, wetMm: 6, flowBase: 0.72, heat: [['2026-07-10', '2026-07-16', 8]] },
  toulouse: { tMean: 21, tAmp: 8.4, peakDoy: 212, wetP: 0.16, wetMm: 7, flowBase: 0.33, heat: [['2026-07-01', '2026-07-06', 6], ['2026-08-10', '2026-08-18', 7]] },
  benevento: { tMean: 22.6, tAmp: 8.2, peakDoy: 212, wetP: 0.13, wetMm: 8, flowBase: 0.45, heat: [['2026-07-20', '2026-07-28', 6]] },
};

const SCN_START = '2026-09-01';
const SCN: Partial<Record<CityId, { tmax: number[]; rain: number[] }>> = {
  coimbra: {
    tmax: [28.9, 29.6, 28.2, 27, 26.4, 27.3, 28.1, 28.7, 27.5, 27.8, 28.4, 27.1, 26.5, 27.9, 28.8, 29.5, 28.9, 29.8, 30.6, 30.1, 31, 31.8, 32.6, 33.4, 34.8, 35.3, 34.1, 31.2, 27.4, 24.9, 23.6, 23.1, 24],
    rain: [0, 0, 1.2, 3.4, 0.8, 0, 0, 0, 0, 0.6, 0, 0.8, 0, 0, 0, 0, 0, 0, 0.4, 0, 0, 0, 0, 0, 0, 0, 0, 2.1, 9.6, 14.2, 6, 3.1, 0],
  },
  ghent: {
    tmax: [21.4, 22, 20.3, 19.6, 20.8, 21.9, 22.4, 21.1, 19.8, 18.9, 19.4, 20.2, 21, 20.6, 19.3, 18.7, 19.9, 20.4, 21.2, 19.8, 20.5, 19.1, 17.6, 16.2, 17, 18.3, 18.9, 17.5, 16.8, 16, 15.4, 15.9, 16.3],
    rain: [0, 2.1, 5.4, 0, 0, 0.3, 1.8, 0, 0, 4.2, 0.6, 0, 0, 0, 2.3, 0, 0, 0.9, 0, 0, 0, 0, 3.2, 31.5, 11.8, 1.2, 0.4, 0, 2.6, 5.1, 0.8, 0, 1.4],
  },
  toulouse: {
    tmax: [29.8, 30.4, 28.6, 27.2, 25.9, 26.8, 27.9, 28.5, 29.1, 28, 27.4, 26.9, 27.8, 28.6, 29, 28.2, 27.5, 28.1, 28.9, 28.4, 29.1, 29.5, 30.8, 33, 34.2, 33.6, 30.1, 27, 24.8, 23.5, 22.9, 23.8, 24.6],
    rain: [0, 0, 0, 0, 6.2, 1.1, 0, 0, 0, 0, 0, 0, 1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 4.8, 12.3, 3, 0.5, 0, 0],
  },
};

type Raw = { tmax: number; rain: number };
let version = 0;
const overrides: Partial<Record<CityId, Record<string, Raw>>> = {};
const cache = new Map<string, Raw>();

export const getWeatherVersion = () => version;
export function setWeatherOverrides(city: CityId, days: Record<string, Raw> | null) {
  if (days) overrides[city] = days; else delete overrides[city];
  version++; cache.clear();
}
export const hasOverride = (city: CityId) => !!overrides[city];

function synth(city: CityId, date: string): Raw {
  const c = CLIMATE[city], doy = dayOfYear(date);
  let t = c.tMean + c.tAmp * Math.cos((2 * Math.PI * (doy - c.peakDoy)) / 365);
  t += 1.7 * Math.sin(doy * 0.83 + hash01(city) * 6.283) + 1.1 * Math.sin(doy * 0.31 + hash01(city + 'b') * 6.283) + (hash01(city + date) - 0.5) * 1.6;
  let hot = false;
  for (const [a, b, amp] of c.heat) {
    const i = daysBetween(a, date), n = daysBetween(a, b);
    if (i >= 0 && i <= n) { t += amp * Math.sin((Math.PI * (i + 0.5)) / (n + 1)); hot = true; }
  }
  const wet = hash01(city + date + 'r') < c.wetP * (hot ? 0.2 : 1);
  return { tmax: round(t, 1), rain: wet ? round(c.wetMm * (0.25 + 2.2 * hash01(city + date + 'm') ** 2), 1) : 0 };
}

export function rawDay(city: CityId, date: string): Raw {
  const o = overrides[city]?.[date];
  if (o) return o;
  const k = city + date, hit = cache.get(k);
  if (hit) return hit;
  const s = SCN[city], i = daysBetween(SCN_START, date);
  const v = s && i >= 0 && i < s.tmax.length ? { tmax: s.tmax[i], rain: s.rain[i] } : synth(city, date);
  cache.set(k, v);
  return v;
}

export function dayWeather(site: Site, date: string): DayWeather {
  const today = rawDay(site.cityId, date);
  let rain14 = 0, rain72 = 0;
  for (let i = 0; i < 14; i++) { const r = rawDay(site.cityId, dayAdd(date, -i)).rain; rain14 += r; if (i < 3) rain72 += r; }
  const base = CLIMATE[site.cityId].flowBase;
  const flowRatio = clamp((base + rain14 / 30 - Math.max(0, today.tmax - 30) * 0.006) * site.flowFactor, 0.08, 3);
  return { date, tmax: today.tmax, rain: today.rain, rain14: round(rain14, 1), rain72: round(rain72, 1), flowRatio: round(flowRatio, 3), discharge: round(flowRatio * site.baselineFlow, 2) };
}
