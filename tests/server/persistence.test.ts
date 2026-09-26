import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Domain } from '@/lib/types';
import { openDb } from '@/lib/server/db';
import { migrate } from '@/lib/server/migrations';
import { VersionConflictError, loadDomain, persistDiff, stripTransient, verifyAuditChain } from '@/lib/server/repo';
import { createSandbox, deleteWorkspace, findByJoinCode } from '@/lib/server/workspaces';
import { PRESETS, buildScenario, reduce, type Action } from '@/lib/sim';
import { sha256 } from '@/lib/utils';
import { syntheticWeather, withWeather } from '@/lib/weather';

// A temp FILE database: @libsql/client reopens connections after transactions, which would empty a :memory: db.
let dir = '', c: Client;
beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), 'watchdog-')); c = openDb(`file:${join(dir, 'test.db')}`); await migrate(c); });
afterAll(() => { c?.close(); rmSync(dir, { recursive: true, force: true }); });

const hash = (d: Domain) => sha256(JSON.stringify(stripTransient(d)));
const ana: Action = { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-test', displayName: 'Test', role: 'walker', signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' }, source: 'pwa' } };
const run = (d: Domain, a: Action) => withWeather(syntheticWeather, () => reduce(d, a));

describe('persistence round trip', () => {
  for (const p of PRESETS) {
    it(`${p.id}: buildScenario → persist → load is byte-identical`, async () => {
      const expected = hash(withWeather(syntheticWeather, () => buildScenario(p.id)));
      const t0 = performance.now();
      const { meta } = await createSandbox(c, p.id);
      const ms = performance.now() - t0;
      const loaded = await loadDomain(c, meta.id);
      expect(loaded).not.toBeNull();
      expect(hash(loaded!.d)).toBe(expected);
      expect(meta.version).toBe(1);
      expect(ms).toBeLessThan(5000); // budget is 1.5 s locally; generous for CI runners
    });
  }
});

describe('commands persisted as diffs', () => {
  it('stores exactly the reduced state and bumps the version', async () => {
    const { meta } = await createSandbox(c, 'day2');
    const loaded = (await loadDomain(c, meta.id))!;
    const next = run(loaded.d, ana);
    expect(next.signals.length).toBeGreaterThan(loaded.d.signals.length); // Ana's acute report opens a signal
    const m2 = await persistDiff(c, loaded.meta, loaded.d, next);
    const again = (await loadDomain(c, meta.id))!;
    expect(m2.version).toBe(loaded.meta.version + 1);
    expect(again.meta.version).toBe(m2.version);
    expect(hash(again.d)).toBe(hash(next));
    // The reduced state from the database equals the reduced state in memory, one more step on.
    const advanced = run(again.d, { type: 'advance', to: new Date(Date.parse(again.d.now) + 6 * 3_600_000).toISOString() });
    await persistDiff(c, again.meta, again.d, advanced);
    expect(hash((await loadDomain(c, meta.id))!.d)).toBe(hash(advanced));
  });

  it('refuses a write based on a stale version', async () => {
    const { meta } = await createSandbox(c, 'day2');
    const loaded = (await loadDomain(c, meta.id))!;
    await persistDiff(c, loaded.meta, loaded.d, run(loaded.d, ana));
    await expect(persistDiff(c, loaded.meta, loaded.d, run(loaded.d, { type: 'notices/read' }))).rejects.toBeInstanceOf(VersionConflictError);
  });
});

describe('audit trail', () => {
  it('is hash-chained end to end', async () => {
    const { meta } = await createSandbox(c, 'day4');
    const loaded = (await loadDomain(c, meta.id))!;
    await persistDiff(c, loaded.meta, loaded.d, run(loaded.d, ana));
    const chain = await verifyAuditChain(c, meta.id);
    expect(chain.ok).toBe(true);
    expect(chain.count).toBeGreaterThan(10);
  });
  it('cannot be edited', async () => {
    const { meta } = await createSandbox(c, 'day2');
    await expect(c.execute({ sql: "UPDATE audit_events SET actor = 'someone else' WHERE workspace_id = ?", args: [meta.id] })).rejects.toThrow(/append-only/);
  });
});

describe('sandboxes', () => {
  it('can be found by join code and deleted', async () => {
    const { meta } = await createSandbox(c, 'day1');
    expect(meta.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect((await findByJoinCode(c, meta.joinCode!.toLowerCase()))?.id).toBe(meta.id);
    await deleteWorkspace(c, meta.id);
    expect(await loadDomain(c, meta.id)).toBeNull();
  });
});
