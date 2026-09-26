import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as cron } from '@/app/api/cron/[job]/route';
import { validateBundle } from '@/lib/fhir';
import type { Action } from '@/lib/sim';
import type { AnyAction } from '@/lib/transport';
import { executeCommand, validateEnvelope } from '@/lib/server/commands';
import { getDb } from '@/lib/server/db';
import { deliverBundle, isAllowedEndpoint } from '@/lib/server/fhir-outbox';
import { runRetention } from '@/lib/server/jobs';
import type { Principal } from '@/lib/server/principal';
import { readWorkspace } from '@/lib/server/repo';
import { importLiveWeather, loadWeather, readLiveImport, revertLiveWeather } from '@/lib/server/weather';
import { createSandbox, resetSandbox, workspaceInfo } from '@/lib/server/workspaces';

const dir = mkdtempSync(join(tmpdir(), 'watchdog-b5-'));
let c: Client;
beforeAll(async () => {
  for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'LLM_PROVIDER']) delete process.env[k];
  process.env.DATABASE_URL = `file:${join(dir, 'b5.db')}`;
  c = await getDb();
});
afterAll(() => { c?.close(); rmSync(dir, { recursive: true, force: true }); });

let n = 0;
const rid = () => `b5-${process.pid}-${Date.now()}-${n++}`;
const as = (workspaceId: string): Principal => ({ kind: 'sandbox', workspaceId });
const run = (id: string, action: AnyAction) => executeCommand(c, as(id), validateEnvelope({ requestId: rid(), baseVersion: null, action }));
const ana: Action = { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-8f92', displayName: 'Ana', role: 'walker', signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' }, source: 'pwa' } };

const days = Array.from({ length: 108 }, (_, i) => new Date(Date.UTC(2026, 5, 20) + i * 86_400_000).toISOString().slice(0, 10));
const meteo = { daily: { time: days, temperature_2m_max: days.map((_, i) => 30 + (i % 5)), precipitation_sum: days.map(() => 0) } };
const fakeMeteo = (async () => new Response(JSON.stringify(meteo), { status: 200 })) as unknown as typeof fetch;

/** A sandbox where Ana's signal has a live advisory and an escalated, queued bundle. */
async function withQueuedBundle() {
  const { meta } = await createSandbox(c, 'day2');
  const r1 = await run(meta.id, ana);
  const sig = r1.projection.signals.find((s) => s.siteId === 'COI-03' && ['open', 'look_requested', 'advisory'].includes(s.status))!;
  const r2 = await run(meta.id, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' });
  const r3 = await run(meta.id, { type: 'advisory/publish', id: r2.created!, actor: 'Sofia Silva', escalate: true });
  const bundle = r3.projection.bundles.find((b) => b.siteId === 'COI-03' && b.advisoryId === r2.created)!;
  return { id: meta.id, bundle };
}

describe('live weather snapshots per sandbox', () => {
  it('imports on the server, bumps the version, and scores with exactly that snapshot', async () => {
    const { meta } = await createSandbox(c, 'day2');
    const { imp, version } = await importLiveWeather(c, meta, 'coimbra', fakeMeteo);
    expect(version).toBe(meta.version + 1);
    expect(imp.days).toBe(108);
    const after = (await readWorkspace(c, meta.id))!;
    expect(workspaceInfo(after).weather.coimbra).toBe(imp.fetchedAt);
    const wx = await loadWeather(c, after);
    expect(wx.id).toMatch(/^live:/);
    expect(wx.raw('coimbra', days[10])).toEqual({ tmax: 30, rain: 0 });
    expect((await readLiveImport(c, after, 'coimbra'))?.days).toBe(108);
    await resetSandbox(c, meta.id, 'day2'); // replays the preset on the live snapshot
    const reverted = await revertLiveWeather(c, (await readWorkspace(c, meta.id))!, 'coimbra');
    expect(reverted).toBeGreaterThan(version);
    expect((await loadWeather(c, (await readWorkspace(c, meta.id))!)).id).toBe('synthetic');
  });
});

describe('FHIR builder v2', () => {
  it('adds a safety Flag, an alert Communication, conditional-create Location and Provenance sources', async () => {
    const { bundle } = await withQueuedBundle();
    const entries = bundle.bundle.entry;
    const types = entries.map((e) => e.resource.resourceType);
    expect(types).toEqual(expect.arrayContaining(['Location', 'Observation', 'Patient', 'Flag', 'Communication', 'Provenance']));
    expect(entries.find((e) => e.resource.resourceType === 'Location')?.request.ifNoneExist).toContain('|COI-03');
    const comm = entries.find((e) => e.resource.resourceType === 'Communication')!.resource as unknown as { category: { coding: { code: string }[] }[] };
    expect(comm.category[0].coding[0].code).toBe('alert');
    const prov = entries.find((e) => e.resource.resourceType === 'Provenance')!.resource as unknown as { entity?: unknown[] };
    expect(prov.entity?.length).toBeGreaterThan(0);
    expect(validateBundle(bundle.bundle).errors).toEqual([]);
  });
});

describe('server-side FHIR delivery', () => {
  it('sends to an allow-listed endpoint, records the receipt and the attempt', async () => {
    const { id, bundle } = await withQueuedBundle();
    const seen: { url: string; type: string | null; body: { resourceType: string } }[] = [];
    const hapi = (async (url: string, init: RequestInit) => {
      seen.push({ url, type: new Headers(init.headers).get('content-type'), body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ resourceType: 'Bundle', type: 'transaction-response', entry: [{ response: { status: '201 Created', location: 'Location/1/_history/1' } }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await deliverBundle(c, id, bundle.id, 'https://hapi.fhir.org/baseR4', { fetch: hapi });
    expect(r).toMatchObject({ ok: true, http: 200, attempts: 1, nextAttemptAt: null });
    expect(seen[0]).toMatchObject({ url: 'https://hapi.fhir.org/baseR4', type: 'application/fhir+json', body: { resourceType: 'Bundle' } });
    const s = await run(id, { type: 'notices/read' });
    expect(s.projection.bundles.find((b) => b.id === bundle.id)?.status).toBe('sent');
  });

  it('records a failure with a retry time', async () => {
    const { id, bundle } = await withQueuedBundle();
    const down = (async () => new Response(JSON.stringify({ issue: [{ diagnostics: 'Service unavailable' }] }), { status: 503 })) as unknown as typeof fetch;
    const r = await deliverBundle(c, id, bundle.id, 'https://hapi.fhir.org/baseR4', { fetch: down });
    expect(r).toMatchObject({ ok: false, http: 503, attempts: 1 });
    expect(r.nextAttemptAt).not.toBeNull();
  });

  it('refuses endpoints off the allow-list (no SSRF) and client-written receipts', async () => {
    expect(isAllowedEndpoint('https://hapi.fhir.org/baseR4')).toBe(true);
    expect(isAllowedEndpoint('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedEndpoint('https://evil.example/fhir')).toBe(false);
    expect(isAllowedEndpoint('https://user:pw@hapi.fhir.org/baseR4')).toBe(false);
    const { id, bundle } = await withQueuedBundle();
    await expect(deliverBundle(c, id, bundle.id, 'https://evil.example/fhir')).rejects.toMatchObject({ status: 403 });
    await expect(run(id, { type: 'bundle/status', id: bundle.id, status: 'sent', http: 201 })).rejects.toMatchObject({ status: 403 });
  });
});

describe('scheduled jobs', () => {
  it('retention deletes sandboxes idle past the TTL', async () => {
    const { meta } = await createSandbox(c, 'day1');
    await c.execute({ sql: "UPDATE workspaces SET last_seen_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", args: [meta.id] });
    const r = await runRetention(c);
    expect(r.sandboxes).toBeGreaterThanOrEqual(1);
    expect(await readWorkspace(c, meta.id)).toBeNull();
  });

  it('cron endpoints are disabled without CRON_SECRET and need the exact bearer token', async () => {
    const call = (auth?: string) => cron(new NextRequest('http://localhost:3000/api/cron/retention', { headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ job: 'retention' }) });
    delete process.env.CRON_SECRET;
    expect((await call()).status).toBe(503);
    process.env.CRON_SECRET = 'test-cron-secret-0123456789';
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    const ok = await call('Bearer test-cron-secret-0123456789');
    expect(ok.status).toBe(200);
    expect((await ok.json()).job).toBe('retention');
    delete process.env.CRON_SECRET;
  });
});
