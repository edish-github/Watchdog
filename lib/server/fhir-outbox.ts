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
