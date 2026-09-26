import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Domain } from '@/lib/types';
import { openDb } from '@/lib/server/db';
import { migrate } from '@/lib/server/migrations';
import { executeCommand, validateEnvelope, type Envelope } from '@/lib/server/commands';
import { ApiProblem } from '@/lib/server/errors';
import type { Principal } from '@/lib/server/principal';
import { loadDomain, readVersion, stripTransient, verifyAuditChain } from '@/lib/server/repo';
import { syncWorkspace } from '@/lib/server/sync';
import { createSandbox, resetSandbox } from '@/lib/server/workspaces';
import { buildScenario, type Action } from '@/lib/sim';
import { sha256 } from '@/lib/utils';
import { syntheticWeather, withWeather } from '@/lib/weather';

let dir = '', c: Client;
beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), 'watchdog-cmd-')); c = openDb(`file:${join(dir, 'cmd.db')}`); await migrate(c); });
afterAll(() => { c?.close(); rmSync(dir, { recursive: true, force: true }); });

let n = 0;
const rid = () => `test-${process.pid}-${Date.now()}-${n++}`;
const report = (deviceId: string): Action => ({ type: 'observation/submit', input: { siteId: 'COI-03', deviceId, displayName: 'Test walker', role: 'walker', signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' }, source: 'pwa' } });
const envelope = (action: Action, baseVersion: number | null = null, requestId = rid()): Envelope => validateEnvelope({ requestId, baseVersion, action });
const as = (workspaceId: string): Principal => ({ kind: 'sandbox', workspaceId });
const hash = (d: Domain) => sha256(JSON.stringify(stripTransient(d)));

describe('executeCommand', () => {
  it('applies a report, bumps the version and returns the full projection', async () => {
    const { meta, d } = await createSandbox(c, 'day2');
    const r = await executeCommand(c, as(meta.id), envelope(report('anon-one'), meta.version));
    expect(r.applied).toBe(true);
    expect(r.rebased).toBe(false);
    expect(r.version).toBe(meta.version + 1);
    expect(r.projection.observations.length).toBe(d.observations.length + 1);
    if (r.created) expect(r.projection.observations.some((o) => o.id === r.created)).toBe(true);
    const stored = await loadDomain(c, meta.id);
    expect(hash(stored!.d)).toBe(hash(r.projection)); // what the client receives is exactly what is stored
  });

  it('is exactly-once per requestId', async () => {
    const { meta } = await createSandbox(c, 'day2');
    const e = envelope(report('anon-twice'), meta.version);
    const first = await executeCommand(c, as(meta.id), e);
    const again = await executeCommand(c, as(meta.id), e);
    expect(again.replayed).toBe(true);
    expect(again.version).toBe(first.version);
    expect(again.created).toBe(first.created);
    expect(again.projection.observations.length).toBe(first.projection.observations.length);
  });

  it('rebases a command sent against an old version', async () => {
    const { meta } = await createSandbox(c, 'day2');
    await executeCommand(c, as(meta.id), envelope(report('anon-a'), meta.version));
    const late = await executeCommand(c, as(meta.id), envelope(report('anon-b'), meta.version));
    expect(late.applied).toBe(true);
    expect(late.rebased).toBe(true);
    expect(late.version).toBe(meta.version + 2);
  });

  it('serialises concurrent commands without losing any', async () => {
    const { meta, d } = await createSandbox(c, 'day2');
    const results = await Promise.all(['anon-x', 'anon-y', 'anon-z'].map((dev) => executeCommand(c, as(meta.id), envelope(report(dev), meta.version))));
    expect(new Set(results.map((r) => r.version)).size).toBe(3);
    const stored = (await loadDomain(c, meta.id))!;
    expect(stored.meta.version).toBe(meta.version + 3);
    expect(stored.d.observations.length).toBe(d.observations.length + 3);
    expect((await verifyAuditChain(c, meta.id)).ok).toBe(true);
  });

  it('does not bump the version when nothing changes', async () => {
    const { meta, d } = await createSandbox(c, 'day2');
    const r = await executeCommand(c, as(meta.id), envelope({ type: 'advance', to: d.now } as Action, meta.version));
    expect(r.applied).toBe(r.version !== meta.version);
  });

  it('refuses malformed envelopes and huge clock jumps', async () => {
    expect(() => validateEnvelope(null)).toThrow(ApiProblem);
    expect(() => validateEnvelope({ requestId: 'short', action: { type: 'notices/read' } })).toThrow(/requestId/);
    expect(() => validateEnvelope({ requestId: rid(), action: { type: 'DROP TABLE' } })).toThrow(/type/);
    expect(() => validateEnvelope(JSON.parse(`{"requestId":"${rid()}","action":{"type":"notices/read","__proto__":{"admin":true}}}`))).toThrow(/__proto__/);
    const { meta, d } = await createSandbox(c, 'day2');
    const far = new Date(Date.parse(d.now) + 30 * 86_400_000).toISOString();
    await expect(executeCommand(c, as(meta.id), envelope({ type: 'advance', to: far } as Action))).rejects.toMatchObject({ status: 422 });
  });

  it('answers 404 for a workspace that does not exist', async () => {
    await expect(executeCommand(c, as('00000000-0000-4000-8000-000000000000'), envelope(report('anon-ghost')))).rejects.toMatchObject({ status: 404 });
  });
});

describe('sync and reset', () => {
  it('returns 304 at the current version and the projection otherwise', async () => {
    const { meta } = await createSandbox(c, 'day2');
    expect(await syncWorkspace(c, as(meta.id), meta.version)).toEqual({ notModified: true, version: meta.version });
    const full = await syncWorkspace(c, as(meta.id), null);
    expect(full.notModified).toBe(false);
    if (!full.notModified) expect(full.workspace.joinCode).toBe(meta.joinCode);
  });

  it('resets in place: same id and join code, higher version, exact preset state, fresh audit chain', async () => {
    const { meta } = await createSandbox(c, 'day2');
    await executeCommand(c, as(meta.id), envelope(report('anon-before-reset')));
    const before = (await readVersion(c, meta.id))!;
    const { meta: after } = await resetSandbox(c, meta.id, 'day1');
    expect(after.id).toBe(meta.id);
    expect(after.joinCode).toBe(meta.joinCode);
    expect(after.version).toBeGreaterThan(before);
    const stored = (await loadDomain(c, meta.id))!;
    expect(hash(stored.d)).toBe(hash(withWeather(syntheticWeather, () => buildScenario('day1'))));
    expect((await verifyAuditChain(c, meta.id)).ok).toBe(true);
  });
});
