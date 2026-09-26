import type { Client } from '@libsql/client';
import type { CityId } from '../types';
import { DEFAULT_ENDPOINT } from '../fhir';
import { executeCommand } from './commands';
import { env } from './env';
import { deliverBundle } from './fhir-outbox';
import { withWriteLock } from './lock';
import { readWorkspace } from './repo';
import { importLiveWeather, isCity, liveSource } from './weather';
import { deleteWorkspace } from './workspaces';

const iso = (ms: number) => new Date(ms).toISOString();

/** Daily: expired sandboxes, photos past retention, day-old idempotency records, weather snapshots nobody uses. */
export async function runRetention(c: Client, now = Date.now()) {
  const expired = await c.execute({ sql: "SELECT id FROM workspaces WHERE kind = 'demo' AND last_seen_at < ? LIMIT 200", args: [iso(now - env.sandboxTtlDays() * 86_400_000)] });
  for (const r of expired.rows) await deleteWorkspace(c, String(r.id));
  const photos = await withWriteLock(c, () => c.execute({ sql: 'DELETE FROM photos WHERE delete_after < ? AND advisory_id IS NULL', args: [iso(now)] }));
  const log = await withWriteLock(c, () => c.execute({ sql: 'DELETE FROM command_log WHERE created_at < ?', args: [iso(now - 86_400_000)] }));
  const modes = await c.execute("SELECT weather_mode FROM workspaces WHERE weather_mode != '{}'");
  const keep = new Set<string>();
  for (const r of modes.rows) { try { for (const at of Object.values(JSON.parse(String(r.weather_mode)) as Record<string, string>)) keep.add(liveSource(at)); } catch { /* ignore bad rows */ } }
  const list = [...keep];
  const weather = await withWriteLock(c, () => c.execute({
    sql: `DELETE FROM weather_daily WHERE source LIKE 'open-meteo:%' AND fetched_at < ?${list.length ? ` AND source NOT IN (${list.map(() => '?').join(', ')})` : ''}`,
    args: [iso(now - 86_400_000), ...list],
  }));
  return { sandboxes: expired.rows.length, photos: photos.rowsAffected, commandLog: log.rowsAffected, weatherRows: weather.rowsAffected };
}

/** Every 10 min: advance each live workspace to real time (sandboxes run on their own replay clock). */
export async function runCycle(c: Client) {
  const live = await c.execute("SELECT id FROM workspaces WHERE kind = 'live'");
  const to = new Date().toISOString();
  for (const r of live.rows) {
    const workspaceId = String(r.id);
    await executeCommand(c, { kind: 'sandbox', workspaceId }, { requestId: `cycle-${workspaceId.slice(0, 8)}-${Date.now()}`, baseVersion: null, action: { type: 'advance', to } }, { internal: true });
  }
  return { advanced: live.rows.length };
}

/** Every 10 min: retry due bundles of live workspaces. Sandboxes only send when a person presses the button. */
export async function runOutbox(c: Client, now = Date.now()) {
  const due = await c.execute({
    sql: `SELECT o.workspace_id, o.id FROM fhir_outbox o JOIN workspaces w ON w.id = o.workspace_id
          WHERE w.kind = 'live' AND o.status IN ('queued', 'failed') AND o.attempts < 8 AND (o.next_attempt_at IS NULL OR o.next_attempt_at <= ?) LIMIT 20`,
    args: [iso(now)],
  });
  let sent = 0;
  for (const r of due.rows) if ((await deliverBundle(c, String(r.workspace_id), String(r.id), process.env.FHIR_DEFAULT_ENDPOINT || DEFAULT_ENDPOINT)).ok) sent++;
  return { due: due.rows.length, sent };
}

/** Every 3 h (or daily on Vercel Hobby): refresh live weather for the live workspace's cities. */
export async function runWeatherRefresh(c: Client) {
  const live = await c.execute("SELECT id FROM workspaces WHERE kind = 'live'");
  let cities = 0;
  for (const r of live.rows) {
    let meta = await readWorkspace(c, String(r.id));
    for (const city of Object.keys(meta?.weatherMode ?? {}).filter(isCity) as CityId[]) {
      if (!meta) break;
      await importLiveWeather(c, meta, city);
      meta = await readWorkspace(c, meta.id);
      cities++;
    }
  }
  return { workspaces: live.rows.length, cities };
}
