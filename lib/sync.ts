/**
 * Remote transport (NEXT_PUBLIC_BACKEND=remote). The browser keeps reducing locally for an instant UI; this engine
 * sends each action to the server in order, adopts the server's state, and replays whatever is not yet acknowledged.
 * Replay-clock ticks are coalesced (at most one `advance` every 5 s). Offline → keep the queue and retry with
 * backoff. Rejected → drop it, tell the user, resync. Expired sandbox → start a fresh one. The unsent queue survives a
 * reload (localStorage) and is resent with the same requestIds, which the server applies exactly once.
 */
import { create } from 'zustand';
import type { Domain } from './types';
import { applyAction } from './apply';
import { ApiError, api as httpApi, backendMode, newRequestId, type AnyAction, type CommandResponse, type Snapshot, type WorkspaceInfo } from './transport';

export type SyncStatus = 'local' | 'connecting' | 'online' | 'offline';
export interface SyncState { status: SyncStatus; version: number | null; workspace: WorkspaceInfo | null; pending: number; lastSyncAt: number | null; lastError: string | null }
export interface SyncNotice { title: string; body: string }
interface Pending { id: string; action: AnyAction }
export interface PersistedQueue { workspaceId: string; items: Pending[] }
type Timer = unknown;
export interface SyncDeps {
  api: Pick<typeof httpApi, 'current' | 'createSandbox' | 'sync' | 'command' | 'reset' | 'importDomain'>;
  get: () => Domain | null;
  set: (d: Domain) => void;
  notify: (n: SyncNotice) => void;
  state: { get: () => SyncState; set: (p: Partial<SyncState>) => void };
  storage?: { load: () => PersistedQueue | null; save: (q: PersistedQueue | null) => void };
  timers?: { set: (fn: () => void, ms: number) => Timer; clear: (t: Timer) => void };
  now?: () => number;
  visible?: () => boolean;
}

export const ADVANCE_EVERY_MS = 5_000;
export const POLL_VISIBLE_MS = 4_000;
export const POLL_HIDDEN_MS = 30_000;

const asApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(0, 'network', e instanceof Error ? e.message : String(e)));

export function createSyncEngine(deps: SyncDeps) {
  const timers = deps.timers ?? { set: (fn: () => void, ms: number): Timer => setTimeout(fn, ms), clear: (t: Timer) => clearTimeout(t as ReturnType<typeof setTimeout>) };
  const now = deps.now ?? (() => Date.now());
  const visible = deps.visible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const st = deps.state;

  let queue: Pending[] = [];
  let inFlight: Pending | null = null;
  let restored: PersistedQueue | null = null;
  let ready = false, started = false, resetting = false, connecting = false;
  let pumpTimer: Timer | null = null, pollTimer: Timer | null = null, connectTimer: Timer | null = null;
  let lastAdvanceSent = Number.NEGATIVE_INFINITY;
  let failures = 0, offlineNoticeShown = false, epoch = 0;
  let pendingReplace: { kind: 'reset'; preset: string } | { kind: 'import'; d: Domain } | null = null;

  function persist() {
    if (!deps.storage) return;
    const items = [...(restored?.items ?? []), ...(inFlight ? [inFlight] : []), ...queue];
    try { deps.storage.save(items.length ? { workspaceId: st.get().workspace?.id ?? restored?.workspaceId ?? '', items } : null); }
    catch { /* storage full or blocked: the queue stays in memory */ }
  }
  const updatePending = () => { st.set({ pending: queue.length + (inFlight ? 1 : 0) }); persist(); };
  const retryDelay = () => Math.min(30_000, 1_000 * 2 ** Math.min(failures, 5));

