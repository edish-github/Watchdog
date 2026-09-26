import { randomUUID } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';
import type { AnyAction } from '../transport';
import { DEFAULT_ENDPOINT } from '../fhir';
import { executeCommand } from './commands';
import { ApiProblem } from './errors';
import { loadDomain } from './repo';

/** Minutes to wait after attempt n fails (1-based); after the last one the bundle stays "failed" for a person. */
export const RETRY_MINUTES = [1, 5, 15, 60, 60, 60, 60, 60];

export const allowedEndpoints = () =>
  [DEFAULT_ENDPOINT, process.env.FHIR_DEFAULT_ENDPOINT, ...(process.env.FHIR_ALLOWED_ENDPOINTS ?? '').split(',')]
    .map((s) => (s ?? '').trim().replace(/\/+$/, ''))
    .filter(Boolean);

/** HTTPS and on the allow-list only: the server must not become a proxy into private networks (SSRF). */
export function isAllowedEndpoint(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const n = url.trim().replace(/\/+$/, '');
  return allowedEndpoints().some((a) => n === a || n.startsWith(`${a}/`));
}

type TxResponse = { entry?: { response?: { status?: string; location?: string } }[]; issue?: { diagnostics?: string; details?: { text?: string } }[] };
export interface Delivery { ok: boolean; message: string; http?: number; attempts: number; nextAttemptAt: string | null; version: number }

/**
 * POSTs one bundle to a FHIR R4 base URL from the server, then records the outcome through the reducer
 * (bundle/status, audit event) together with the attempt counter and next retry time — one transaction.
 */
export async function deliverBundle(c: Client, workspaceId: string, bundleId: string, endpoint: string, opts: { fetch?: typeof fetch; timeoutMs?: number } = {}): Promise<Delivery> {
  const target = endpoint.trim().replace(/\/+$/, '');
  if (!isAllowedEndpoint(target)) throw new ApiProblem(403, 'forbidden', `The server only sends to allow-listed HTTPS FHIR endpoints (${allowedEndpoints().join(', ')}). Add others with FHIR_ALLOWED_ENDPOINTS.`);
  const loaded = await loadDomain(c, workspaceId);
  if (!loaded) throw new ApiProblem(404, 'not_found', 'This sandbox no longer exists.');
  const b = loaded.d.bundles.find((x) => x.id === bundleId.toUpperCase());
  if (!b) throw new ApiProblem(404, 'not_found', `Bundle ${bundleId} not found.`);

  let ok = false, http: number | undefined, message = 'Not attempted';
  let action: AnyAction = { type: 'bundle/status', id: b.id, status: 'failed', error: message };
  if (b.validation.errors.length) {
    message = 'The bundle has validation errors and was not sent.';
    action = { type: 'bundle/status', id: b.id, status: 'failed', error: `Blocked on the server: ${b.validation.errors.length} validation error(s)` };
  } else {
    const timeoutMs = opts.timeoutMs ?? 20_000;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const t0 = Date.now();
    try {
      const res = await (opts.fetch ?? fetch)(target, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/fhir+json', Accept: 'application/fhir+json' }, body: JSON.stringify(b.bundle) });
      const ms = Date.now() - t0;
      http = res.status;
      const body = (await res.json().catch(() => null)) as TxResponse | null;
      if (res.ok) {
        const entries = (body?.entry ?? []).map((e) => ({ status: e.response?.status ?? '', location: e.response?.location }));
        ok = true;
        message = `HTTP ${res.status} · ${entries.length} resources created in ${ms} ms`;
        action = { type: 'bundle/status', id: b.id, status: 'sent', http: res.status, receipt: JSON.stringify({ http: res.status, ms, endpoint: target, entries }) };
      } else {
        const issue = body?.issue?.[0]?.diagnostics ?? body?.issue?.[0]?.details?.text ?? res.statusText;
        message = `HTTP ${res.status}: ${issue}`;
        action = { type: 'bundle/status', id: b.id, status: 'failed', http: res.status, error: message };
      }
    } catch (e) {
      message = `${ctrl.signal.aborted ? `No answer within ${timeoutMs / 1000} s` : e instanceof Error ? e.message : 'Network error'} — endpoint unreachable`;
      action = { type: 'bundle/status', id: b.id, status: 'failed', error: message };
    } finally {
      clearTimeout(timer);
    }
  }

  const prior = await c.execute({ sql: 'SELECT attempts FROM fhir_outbox WHERE workspace_id = ? AND id = ?', args: [workspaceId, b.id] });
  const attempts = Number(prior.rows[0]?.attempts ?? 0) + 1;
  const nextAttemptAt = ok || attempts >= RETRY_MINUTES.length ? null : new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000).toISOString();
  const extra: InStatement[] = [{
    sql: 'UPDATE fhir_outbox SET attempts = ?, next_attempt_at = ?, idempotency_key = ? WHERE workspace_id = ? AND id = ?',
    args: [attempts, nextAttemptAt, b.hash, workspaceId, b.id],
  }];
  const r = await executeCommand(c, { kind: 'sandbox', workspaceId }, { requestId: `fhir-${randomUUID()}`, baseVersion: null, action }, { internal: true, extra });
  return { ok, message, http, attempts, nextAttemptAt, version: r.version };
}
