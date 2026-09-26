import type { Domain } from '../types';
import { ApiProblem } from './errors';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const iso = (v: unknown) => typeof v === 'string' && Number.isFinite(Date.parse(v));
const fail = (detail: string): never => { throw new ApiProblem(400, 'invalid_action', `Import refused: ${detail}`); };
const COLLECTIONS = ['watches', 'observations', 'signals', 'looks', 'advisories', 'bundles', 'audit', 'notices'] as const;

/** Structural check of an exported state file, rebuilt in canonical key order. */
export function validateDomain(v: unknown): Domain {
  if (!isObj(v)) return fail('the file does not contain a Watchdog state.');
  if (!iso(v.start) || !iso(v.now)) fail('"start" and "now" must be ISO times.');
  if (typeof v.preset !== 'string' || v.preset.length > 40) fail('"preset" is missing.');
  if (typeof v.autopilot !== 'boolean') fail('"autopilot" must be true or false.');
  if (!Number.isInteger(v.cursor) || (v.cursor as number) < 0) fail('"cursor" must be a whole number.');
  if (!(v.lastCycle === null || iso(v.lastCycle))) fail('"lastCycle" must be an ISO time or null.');
  const seq = v.seq;
  if (!isObj(seq) || !('evt' in seq) || !('ntc' in seq) || !Object.values(seq).every((n) => Number.isInteger(n) && (n as number) >= 0)) fail('"seq" counters are missing.');
  for (const k of COLLECTIONS) {
    const arr = v[k];
    if (!Array.isArray(arr) || arr.length > 5000) fail(`"${k}" must be a list of at most 5000 records.`);
    const ids = new Set<string>();
    for (const x of arr as unknown[]) {
      if (!isObj(x) || typeof x.id !== 'string' || !x.id || x.id.length > 40 || ids.has(x.id)) fail(`"${k}" has a missing, long or duplicate id.`);
      ids.add((x as { id: string }).id);
    }
  }
  return {
    start: v.start, now: v.now, preset: v.preset, autopilot: v.autopilot, cursor: v.cursor, lastCycle: v.lastCycle, seq,
    watches: v.watches, observations: v.observations, signals: v.signals, looks: v.looks, advisories: v.advisories, bundles: v.bundles, audit: v.audit, notices: v.notices,
  } as unknown as Domain;
}
