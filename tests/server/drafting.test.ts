import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Client } from '@libsql/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DRAFTER } from '@/lib/advisory';
import type { Action } from '@/lib/sim';
import type { AnyAction } from '@/lib/transport';
import { CLOSING, type DraftBrief, type DraftOutcome } from '@/lib/server/ai/advisory-draft';
import type { Drafter } from '@/lib/server/ai/enrich';
import { executeCommand, validateEnvelope } from '@/lib/server/commands';
import { openDb } from '@/lib/server/db';
import { migrate } from '@/lib/server/migrations';
import type { Principal } from '@/lib/server/principal';
import { createSandbox } from '@/lib/server/workspaces';

let dir = '', c: Client;
beforeAll(async () => { for (const k of ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'LLM_PROVIDER']) delete process.env[k]; dir = mkdtempSync(join(tmpdir(), 'watchdog-draft-')); c = openDb(`file:${join(dir, 'draft.db')}`); await migrate(c); });
afterAll(() => { c?.close(); rmSync(dir, { recursive: true, force: true }); });

let n = 0;
const rid = () => `draft-${process.pid}-${Date.now()}-${n++}`;
const as = (workspaceId: string): Principal => ({ kind: 'sandbox', workspaceId });
const run = (id: string, action: AnyAction, drafter?: Drafter) => executeCommand(c, as(id), validateEnvelope({ requestId: rid(), baseVersion: null, action }), { drafter });
const ana: Action = { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-8f92', displayName: 'Ana', role: 'walker', signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' }, source: 'pwa' } };

async function sandboxWithSignal() {
  const { meta } = await createSandbox(c, 'day2');
  const r = await run(meta.id, ana);
  const sig = r.projection.signals.find((s) => s.siteId === 'COI-03' && ['open', 'look_requested', 'advisory'].includes(s.status))!;
  return { id: meta.id, sig };
}
const claudeText = (b: DraftBrief) => ({
  en: `Heat and low water at ${b.site.stream}, ${b.site.city}. Keep dogs out of the water ${b.validity.en}. ${CLOSING.en}`,
  pt: `Calor e água baixa em ${b.site.stream}, ${b.site.city}. Mantenha os cães fora da água ${b.validity.pt}. ${CLOSING.pt}`,
});
const counting = () => {
  const box = { calls: 0 };
  const drafter: Drafter = async (b): Promise<DraftOutcome> => {
    box.calls++;
    return { ok: true, text: claudeText(b), model: 'claude-sonnet-5', attempts: 1, latencyMs: 1234, usage: {}, promptVersion: 'advisory-v1', inputHash: 'a'.repeat(64), outputHash: 'b'.repeat(64), warnings: [] };
  };
  return { box, drafter };
};

describe('Claude drafting on the server', () => {
  it('swaps the template for Claude’s text, marks the origin, and audits model and latency', async () => {
    const { id, sig } = await sandboxWithSignal();
    const { drafter } = counting();
    const r = await run(id, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' }, drafter);
    const adv = r.projection.advisories.find((a) => a.id === r.created)!;
    expect(adv.draft?.by).toBe('claude-sonnet-5 (advisory-v1)');
    expect(adv.text.en).toContain(CLOSING.en);
    expect(adv.text.pt).toContain(CLOSING.pt);
    expect(adv.edited).toBe(false);
    expect(r.projection.audit.find((e) => e.target === adv.id && e.action === 'Advisory draft generated')?.detail).toMatch(/claude-sonnet-5 \(advisory-v1\) · EN\/PT · 1\.2 s/);
  });

  it('keeps the template when Claude fails, and records why', async () => {
    const { id, sig } = await sandboxWithSignal();
    const failing: Drafter = async () => ({ ok: false, reason: 'timeout', detail: 'no answer', attempts: 1, latencyMs: 12_000, promptVersion: 'advisory-v1', inputHash: 'a'.repeat(64) });
    const r = await run(id, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' }, failing);
    const adv = r.projection.advisories.find((a) => a.id === r.created)!;
    expect(adv.draft?.by).toBe(DRAFTER);
    expect(r.projection.audit.find((e) => e.target === adv.id)?.detail).toMatch(/(?:Claude|AI draft) unavailable \(timeout\)/);
  });

  it('does not call Claude again when the same draft is reopened', async () => {
    const { id, sig } = await sandboxWithSignal();
    const { box, drafter } = counting();
    const first = await run(id, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' }, drafter);
    await run(id, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' }, drafter);
    expect(box.calls).toBe(1);
    expect(first.created).toMatch(/^ADV-/);
  });

  it('uses the template silently when no API key is configured', async () => {
    const { id, sig } = await sandboxWithSignal();
    const r = await run(id, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' });
    expect(r.projection.advisories.find((a) => a.id === r.created)?.draft?.by).toBe(DRAFTER);
  });
});

describe('publishing, enforced by the server', () => {
  it('refuses text that fails a blocking guardrail, whatever the browser sent, then accepts the fixed text', async () => {
    const { id, sig } = await sandboxWithSignal();
    const drafted = await run(id, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' });
    const advId = drafted.created!;
    const original = drafted.projection.advisories.find((a) => a.id === advId)!.text;
    await run(id, { type: 'advisory/edit', id: advId, text: { en: `${original.en} The water is toxic.` } });
    await expect(run(id, { type: 'advisory/publish', id: advId, actor: 'Sofia Silva', escalate: false })).rejects.toMatchObject({ status: 422, code: 'guardrail_failed' });
    await run(id, { type: 'advisory/edit', id: advId, text: original });
    const ok = await run(id, { type: 'advisory/publish', id: advId, actor: 'Sofia Silva', escalate: false });
    expect(ok.projection.advisories.find((a) => a.id === advId)?.status).toBe('live');
  });
});
