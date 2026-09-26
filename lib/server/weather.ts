import { createHash } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';
import type { CityId } from '../types';
import { CITY } from '../catalog';
import { fetchOpenMeteo, type DailyMap, type LiveImport } from '../openmeteo-api';
import { overlayWeather, syntheticWeather, type WeatherProvider } from '../weather';
import { ApiProblem } from './errors';
import { withWriteLock } from './lock';
import type { WorkspaceMeta } from './repo';

/** One Open-Meteo import = one immutable snapshot in weather_daily, so a sandbox's scores never drift silently. */
export const liveSource = (fetchedAt: string) => `open-meteo:${fetchedAt}`;
export const isCity = (c: unknown): c is CityId => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CITY, c);

const liveCities = (meta: WorkspaceMeta) =>
  Object.entries(meta.weatherMode ?? {}).filter(([c, at]) => isCity(c) && typeof at === 'string' && at).sort(([a], [b]) => a.localeCompare(b)) as [CityId, string][];

async function readDaily(c: Client, city: CityId, fetchedAt: string): Promise<DailyMap> {
  const rs = await c.execute({ sql: 'SELECT date, tmax, rain FROM weather_daily WHERE city_id = ? AND source = ? ORDER BY date', args: [city, liveSource(fetchedAt)] });
  return Object.fromEntries(rs.rows.map((r) => [String(r.date), { tmax: Number(r.tmax), rain: Number(r.rain) }]));
}

const providers = new Map<string, WeatherProvider>();
/** Synthetic weather, overlaid with this sandbox's live snapshots. The id changes whenever the snapshots do. */
export async function loadWeather(c: Client, meta: WorkspaceMeta): Promise<WeatherProvider> {
  const live = liveCities(meta);
  if (!live.length) return syntheticWeather;
  const id = `live:${createHash('sha256').update(JSON.stringify(live)).digest('hex').slice(0, 16)}`;
  const hit = providers.get(id);
  if (hit) return hit;
  const data: Partial<Record<CityId, DailyMap>> = {};
  for (const [city, at] of live) data[city] = await readDaily(c, city, at);
  const p = overlayWeather(id, data);
  if (providers.size > 100) providers.clear();
  providers.set(id, p);
  return p;
}

export async function readLiveImport(c: Client, meta: WorkspaceMeta, city: CityId): Promise<LiveImport | null> {
  const fetchedAt = meta.weatherMode?.[city];
  if (!fetchedAt) return null;
  const data = await readDaily(c, city, fetchedAt);
  const keys = Object.keys(data).sort();
  if (!keys.length) return null;
  return { data, fetchedAt, from: keys[0], to: keys[keys.length - 1], days: keys.length, ms: 0, url: 'server snapshot' };
}

/** Writes the mode (and any rows) and bumps the version so every joined browser picks the change up. */
async function setMode(c: Client, meta: WorkspaceMeta, mode: Record<string, string>, rows: InStatement[] = []): Promise<number> {
  return withWriteLock(c, async () => {
    await c.batch([...rows, { sql: 'UPDATE workspaces SET weather_mode = ?, version = version + 1 WHERE id = ?', args: [JSON.stringify(mode), meta.id] }], 'write');
    const rs = await c.execute({ sql: 'SELECT version FROM workspaces WHERE id = ?', args: [meta.id] });
    return Number(rs.rows[0]?.version ?? 0);
  });
}

export async function importLiveWeather(c: Client, meta: WorkspaceMeta, city: CityId, doFetch?: typeof fetch): Promise<{ imp: LiveImport; version: number }> {
  let imp: LiveImport;
  try { imp = await fetchOpenMeteo(city, doFetch); } catch (e) { throw new ApiProblem(502, 'upstream_unavailable', e instanceof Error ? e.message : 'Open-Meteo request failed'); }
  const source = liveSource(imp.fetchedAt);
  const rows: InStatement[] = Object.entries(imp.data).map(([date, v]) => ({
    sql: 'INSERT INTO weather_daily (city_id, date, source, tmax, rain, discharge, fetched_at) VALUES (?, ?, ?, ?, ?, NULL, ?) ON CONFLICT (city_id, date, source) DO UPDATE SET tmax = excluded.tmax, rain = excluded.rain, fetched_at = excluded.fetched_at',
    args: [city, date, source, v.tmax, v.rain, imp.fetchedAt],
  }));
  const version = await setMode(c, meta, { ...(meta.weatherMode ?? {}), [city]: imp.fetchedAt }, rows);
  return { imp, version };
}

export async function revertLiveWeather(c: Client, meta: WorkspaceMeta, city: CityId): Promise<number> {
  const mode = { ...(meta.weatherMode ?? {}) };
  delete mode[city];
  return setMode(c, meta, mode);
}
