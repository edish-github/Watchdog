/**
 * Typed browser client for the Watchdog API. Framework-free: lib/sync.ts decides when to call it.
 * Works on plain-http LAN origins too (a phone during testing), where crypto.randomUUID does not exist.
 */
import type { Action } from './sim';
import type { Domain } from './types';
import type { LiveImport } from './openmeteo-api';

export type BackendMode = 'local' | 'remote';
export const backendMode = (): BackendMode => (process.env.NEXT_PUBLIC_BACKEND === 'remote' ? 'remote' : 'local');

/** Actions that need more than the reducer; lib/apply.ts applies them identically in the browser and on the server. */
export type ServerAction = { type: 'device/erase'; deviceId: string; names: string[] };
export type AnyAction = Action | ServerAction;

export interface WorkspaceInfo {
  id: string; kind: 'demo' | 'live'; joinCode: string | null; preset: string; version: number;
  features?: { aiDrafting: boolean; provider: 'anthropic' | 'gemini' | null; model: string | null };
  /** Cities scored with live Open-Meteo data in this sandbox → the snapshot's fetch time. */
  weather?: Record<string, string>;
}
export interface Snapshot { version: number; workspace: WorkspaceInfo; projection: Domain }
export interface CommandResponse extends Snapshot { created: string | null; applied: boolean; rebased: boolean; replayed: boolean }
export type SyncResponse = ({ changed: true; role: string } & Snapshot) | { changed: false; version: number };

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, detail: string, readonly body: unknown = null) {
    super(detail);
    this.name = 'ApiError';
  }
  /** No response at all: offline, DNS, CORS, timeout. */
  get network() { return this.status === 0; }
}

/** RFC 4122 v4 id; falls back to getRandomValues where randomUUID is unavailable (insecure origins). */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const TIMEOUT_MS = 20_000;
/** Browsers cap keepalive bodies at 64 KB in total; photos stay on normal requests. */
const KEEPALIVE_MAX = 60_000;

async function request(path: string, init: { method?: string; body?: string; keepalive?: boolean; timeoutMs?: number } = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? TIMEOUT_MS);
  try {
    return await fetch(path, {
      method: init.method ?? 'GET', body: init.body, credentials: 'same-origin', cache: 'no-store', signal: ctrl.signal,
      keepalive: init.keepalive ?? false,
      headers: init.body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
    });
  } catch (e) {
    throw new ApiError(0, 'network', e instanceof Error ? e.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  let body: { code?: string; detail?: string } | null = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  throw new ApiError(res.status, body?.code ?? `http_${res.status}`, body?.detail ?? res.statusText, body);
}

export const api = {
  createSandbox: async (preset = 'day2') => json<WorkspaceInfo & { now: string }>(await request('/api/workspaces', { method: 'POST', body: JSON.stringify({ preset }) })),
  current: async () => json<WorkspaceInfo & { now: string; lastSeenAt: string; expiresAt: string | null }>(await request('/api/workspaces/current')),
  reset: async (preset: string) => json<Snapshot>(await request('/api/workspaces/current/reset', { method: 'POST', body: JSON.stringify({ preset }) })),
  importDomain: async (domain: Domain) => json<Snapshot>(await request('/api/workspaces/current/import', { method: 'POST', body: JSON.stringify({ domain }) })),
  join: async (code: string) => json<{ workspace: WorkspaceInfo }>(await request('/api/join', { method: 'POST', body: JSON.stringify({ code }) })),
  sync: async (since: number | null): Promise<SyncResponse> => {
    const res = await request(since === null ? '/api/sync' : `/api/sync?since=${since}`);
    if (res.status === 304) return { changed: false, version: since ?? 0 };
    return { changed: true, ...(await json<{ version: number; role: string; workspace: WorkspaceInfo; projection: Domain }>(res)) };
  },
  command: async (action: AnyAction, baseVersion: number | null, requestId = newRequestId()) => {
    const body = JSON.stringify({ requestId, baseVersion, action });
    return json<CommandResponse>(await request('/api/commands', { method: 'POST', body, keepalive: body.length < KEEPALIVE_MAX }));
  },
};

/** Server-side integrations used by pages in remote mode. */
export const serverApi = {
  importWeather: async (city: string) => json<LiveImport & { version: number }>(await request('/api/weather/import', { method: 'POST', body: JSON.stringify({ city }), timeoutMs: 30_000 })),
  revertWeather: async (city: string) => json<{ version: number }>(await request('/api/weather/revert', { method: 'POST', body: JSON.stringify({ city }) })),
  weather: async (city: string) => json<LiveImport>(await request(`/api/weather/${encodeURIComponent(city)}`)),
  sendBundle: async (id: string, endpoint: string) =>
    json<{ ok: boolean; message: string; http?: number; attempts: number; nextAttemptAt: string | null; version: number }>(
      await request(`/api/fhir/outbox/${encodeURIComponent(id)}/send`, { method: 'POST', body: JSON.stringify({ endpoint }), timeoutMs: 40_000 }),
    ),
};
