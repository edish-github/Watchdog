import { randomInt, randomUUID } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';
import type { Domain } from '../types';
import { CITIES, PEOPLE, SITES } from '../catalog';
import { PRESETS, buildScenario } from '../sim';
import { syntheticWeather, withWeather } from '../weather';
import { aiFeatures } from './ai/llm';
import { env } from './env';
import { ApiProblem, backoff, isRetryable, sleep } from './errors';
import { withWriteLock } from './lock';
import { COLLECTIONS, COLLECTION_ORDER, commitPlan, emptyLike, persistDiff, planDiff, readWorkspace, stripTransient, type WorkspaceMeta } from './repo';
import { loadWeather } from './weather';

// No 0/O, 1/I/L: codes are read aloud and typed on phones.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const makeJoinCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const normalizeJoinCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isPreset = (p: unknown): p is string => typeof p === 'string' && PRESETS.some((x) => x.id === p);

export interface WorkspaceFeatures { aiDrafting: boolean; provider: 'anthropic' | 'gemini' | null; model: string | null }
export interface WorkspaceInfo {
  id: string; kind: 'demo' | 'live'; joinCode: string | null; preset: string; version: number;
  features: WorkspaceFeatures; weather: Record<string, string>;
}
export const workspaceInfo = (m: WorkspaceMeta): WorkspaceInfo => ({
  id: m.id, kind: m.kind, joinCode: m.joinCode, preset: m.preset, version: m.version, features: aiFeatures(), weather: { ...(m.weatherMode ?? {}) },
});

const seeded = new WeakSet<Client>();
/** Mirrors the static catalog (cities, sites, people) into the database once per client. */
export async function ensureCatalog(c: Client) {
  if (seeded.has(c)) return;
  await withWriteLock(c, () => c.batch([
    ...CITIES.map((x) => ({ sql: 'INSERT INTO cities (id, data) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data', args: [x.id, JSON.stringify(x)] })),
    ...SITES.map((x) => ({ sql: 'INSERT INTO sites (id, city_id, data) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET city_id = excluded.city_id, data = excluded.data', args: [x.id, x.cityId, JSON.stringify(x)] })),
    ...Object.values(PEOPLE).map((p) => ({ sql: 'INSERT INTO people (id, role, city_id, data) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET role = excluded.role, city_id = excluded.city_id, data = excluded.data', args: [p.id, p.role, p.cityId ?? null, JSON.stringify(p)] })),
  ], 'write'));
  seeded.add(c);
}

const scenario = (preset: string): Domain => stripTransient(withWeather(syntheticWeather, () => buildScenario(preset)));

/** A private demo world: the preset replayed on synthetic weather, persisted with its audit chain. */
export async function createSandbox(c: Client, preset = 'day2'): Promise<{ meta: WorkspaceMeta; d: Domain }> {
  if (!isPreset(preset)) throw new ApiProblem(400, 'invalid_action', `Unknown preset "${preset}".`);
  await ensureCatalog(c);
  const d = scenario(preset);
  const id = randomUUID();
  const stamp = new Date().toISOString();
  const expires = new Date(Date.now() + env.sandboxTtlDays() * 86_400_000).toISOString();
  for (let attempt = 0; ; attempt++) {
    try {
      await withWriteLock(c, () => c.execute({
        sql: `INSERT INTO workspaces (id, kind, preset, join_code, start, now, autopilot, cursor, last_cycle, seq, version, pos_seq, audit_seq, audit_head, weather_mode, created_at, last_seen_at, expires_at)
              VALUES (?, 'demo', ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, '', '{}', ?, ?, ?)`,
        args: [id, d.preset, makeJoinCode(), d.start, d.start, d.autopilot ? 1 : 0, 0, null, JSON.stringify(d.seq), stamp, stamp, expires],
      }));
      break;
    } catch (e) {
      if (attempt < 5 && String(e).includes('UNIQUE') && String(e).includes('join_code')) continue;
      throw e;
    }
  }
  const meta0 = await readWorkspace(c, id);
  if (!meta0) throw new Error('workspace insert did not persist');
  const meta = await persistDiff(c, meta0, emptyLike(d), d);
  return { meta, d };
}

/**
 * Replaces a sandbox's whole world IN PLACE, in one transaction: same id and join code (joined phones stay attached),
 * version keeps rising (pollers see it), audit chain restarts, old photos go. `after` rides in the same transaction.
 */
async function replaceWorld(c: Client, id: string, d: Domain, after: InStatement[] = []): Promise<{ meta: WorkspaceMeta; d: Domain }> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const meta = await readWorkspace(c, id);
    if (!meta) throw new ApiProblem(404, 'not_found', 'This sandbox no longer exists.');
    if (meta.kind !== 'demo') throw new ApiProblem(403, 'forbidden', 'Only demo sandboxes can be replaced.');
    const base: WorkspaceMeta = { ...meta, posSeq: 0, auditSeq: 0, auditHead: '' };
    const wipe: InStatement[] = [
