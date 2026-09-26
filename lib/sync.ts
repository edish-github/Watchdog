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

  function markOnline() {
    if (st.get().status === 'offline' && offlineNoticeShown) deps.notify({ title: 'Back online', body: 'Your changes are synced with the sandbox.' });
    offlineNoticeShown = false;
    failures = 0;
    st.set({ status: 'online', lastError: null, lastSyncAt: now() });
  }
  function markOffline(e: ApiError) {
    failures++;
    st.set({ status: 'offline', lastError: e.message });
    if (!offlineNoticeShown) {
      offlineNoticeShown = true;
      deps.notify({ title: 'Working offline', body: 'Changes stay on this device and will sync when the connection returns.' });
    }
  }

  /** Server truth plus our unsent actions, replayed in order. Never steps back to an older version of the same sandbox. */
  function adopt(snap: Snapshot, force = false) {
    const cur = st.get();
    const same = !cur.workspace || cur.workspace.id === snap.workspace.id;
    if (!force && same && cur.version !== null && snap.version < cur.version) return;
    let d = snap.projection;
    for (const p of queue) { try { d = applyAction(d, p.action); } catch { /* the server decides */ } }
    deps.set(d);
    st.set({ version: snap.version, workspace: snap.workspace });
    markOnline();
  }

  function schedulePump(ms: number) {
    if (pumpTimer !== null) timers.clear(pumpTimer);
    pumpTimer = timers.set(() => { pumpTimer = null; void pump(); }, ms);
  }
  function schedulePoll(ms?: number) {
    if (pollTimer !== null) timers.clear(pollTimer);
    pollTimer = timers.set(() => { pollTimer = null; void poll(); }, ms ?? (visible() ? POLL_VISIBLE_MS : POLL_HIDDEN_MS));
  }

  async function onCommandError(sent: Pending, err: ApiError) {
    if (err.network || err.status >= 500) { queue.unshift(sent); markOffline(err); schedulePump(retryDelay()); return; }
    if (err.status === 409 || err.status === 429) { queue.unshift(sent); schedulePump(err.status === 429 ? 5_000 : 1_500); return; }
    if (err.status === 401 || err.status === 404) { queue.unshift(sent); ready = false; await connect(err.status === 404); return; }
    deps.notify({ title: 'Change not saved', body: err.message });
    await refresh(true);
  }

  async function pump() {
    if (!ready || resetting || inFlight || !queue.length) return;
    const head = queue[0];
    if (head.action.type === 'advance' && queue.length === 1) {
      const wait = ADVANCE_EVERY_MS - (now() - lastAdvanceSent);
      if (wait > 0) { schedulePump(wait); return; }
    }
    const sending = queue.shift()!;
    inFlight = sending;
    if (sending.action.type === 'advance') lastAdvanceSent = now();
    updatePending();
    const myEpoch = epoch;
    let result: CommandResponse | null = null, error: ApiError | null = null;
    try { result = await deps.api.command(sending.action, st.get().version, sending.id); } catch (e) { error = asApiError(e); }
    inFlight = null;
    if (myEpoch === epoch) {
      if (result) adopt(result);
      else if (error) await onCommandError(sending, error);
    }
    updatePending();
    if (ready && !resetting && queue.length && pumpTimer === null) schedulePump(0);
  }

  async function refresh(force = false) {
    if (!ready || inFlight || resetting) return;
    try {
      const r = await deps.api.sync(force ? null : st.get().version);
      if (inFlight || resetting) return;
      if (r.changed) adopt(r, force);
      else markOnline();
    } catch (e) {
      const err = asApiError(e);
      if (err.status === 401 || err.status === 404) { ready = false; await connect(err.status === 404); }
      else markOffline(err);
    }
  }

  async function poll() {
    await refresh(false);
    if (started) schedulePoll();
  }

  async function connect(expired = false) {
    if (connecting) return;
    connecting = true;
    if (connectTimer !== null) { timers.clear(connectTimer); connectTimer = null; }
    st.set({ status: 'connecting' });
    try {
      let created = false;
      try {
        await deps.api.current();
      } catch (e) {
        const err = asApiError(e);
        if (err.status !== 401 && err.status !== 404) throw err;
        await deps.api.createSandbox(deps.get()?.preset ?? 'day2');
        created = true;
      }
      const r = await deps.api.sync(null);
      if (!r.changed) throw new ApiError(500, 'sync_empty', 'The server returned no state.');
      if (restored) {
        // Actions queued before a reload go back in front, if they belong to this sandbox.
        if (!restored.workspaceId || restored.workspaceId === r.workspace.id) {
          const have = new Set(queue.map((q) => q.id));
          queue = [...restored.items.filter((i) => !have.has(i.id)), ...queue];
        }
        restored = null;
      }
      ready = true;
      adopt(r, true);
      updatePending();
      if (created && expired) deps.notify({ title: 'Started a fresh demo sandbox', body: 'The previous sandbox expired, so this one starts from the scenario again.' });
      connecting = false;
      if (pendingReplace) {
        const next = pendingReplace;
        pendingReplace = null;
        if (next.kind === 'reset') await reset(next.preset); else await importDomain(next.d);
      }
      schedulePump(0);
    } catch (e) {
      connecting = false;
      markOffline(asApiError(e));
      connectTimer = timers.set(() => { connectTimer = null; void connect(expired); }, retryDelay());
    }
  }

  function send(a: AnyAction) {
    const tail = queue[queue.length - 1];
    if (a.type === 'advance' && tail && tail.action.type === 'advance') tail.action = a; // not sent yet: keep only the latest tick
    else queue.push({ id: newRequestId(), action: a });
    updatePending();
    if (ready && !resetting) schedulePump(0);
  }

  /** Replaces the sandbox's world (preset reset or imported file). Everything queued before it is dropped. */
  async function replace(op: { kind: 'reset'; preset: string } | { kind: 'import'; d: Domain }) {
    epoch++; // responses to anything sent before this are ignored
    queue = [];
    restored = null;
    updatePending();
    if (!ready) { pendingReplace = op; return; }
    resetting = true;
    try {
      const r = op.kind === 'reset' ? await deps.api.reset(op.preset) : await deps.api.importDomain(op.d);
      resetting = false;
      adopt(r, true);
    } catch (e) {
      resetting = false;
      const err = asApiError(e);
      if (err.status === 401 || err.status === 404) { pendingReplace = op; ready = false; await connect(true); }
      else if (err.status >= 400 && err.status < 500 && !err.network) { deps.notify({ title: op.kind === 'reset' ? 'Reset refused' : 'Import refused', body: err.message }); await refresh(true); }
      else { markOffline(err); deps.notify({ title: op.kind === 'reset' ? 'Reset not synced' : 'Import not synced', body: 'The change applies on this device only. Try again when the connection returns.' }); }
    } finally {
      if (ready && queue.length) schedulePump(0);
    }
  }
  const reset = (preset: string) => replace({ kind: 'reset', preset });
  const importDomain = (d: Domain) => replace({ kind: 'import', d });

  const onVisible = () => { if (started && visible()) schedulePoll(0); };

  function start() {
    if (started) return;
    started = true;
    const saved = deps.storage?.load() ?? null;
    restored = saved && Array.isArray(saved.items) && saved.items.length ? saved : null;
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible);
    void connect(false).finally(() => { if (started) schedulePoll(); });
  }

  function stop() {
    started = false;
    for (const t of [pumpTimer, pollTimer, connectTimer]) if (t !== null) timers.clear(t);
    pumpTimer = pollTimer = connectTimer = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible);
  }

  return { start, stop, send, reset, importDomain, refresh: (force = true) => refresh(force) };
}

// ───────────────────────── app singleton ─────────────────────────

export const useSync = create<SyncState>(() => ({
  status: backendMode() === 'remote' ? 'connecting' : 'local', version: null, workspace: null, pending: 0, lastSyncAt: null, lastError: null,
}));

// Read-only diagnostic hook: the e2e helpers wait on status/pending through it.
if (typeof window !== 'undefined') (window as unknown as { __wdSync?: typeof useSync }).__wdSync = useSync;

const listeners = new Set<(n: SyncNotice) => void>();
export function onSyncNotice(fn: (n: SyncNotice) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

let bridge: { get: () => Domain; set: (d: Domain) => void } | null = null;
/** Called once by lib/store.ts so the engine can read and replace the domain without importing the store. */
export function bindStore(b: { get: () => Domain; set: (d: Domain) => void }) { bridge = b; }

const QUEUE_KEY = 'watchdog-sync-queue';
const engine = createSyncEngine({
  api: httpApi,
  get: () => bridge?.get() ?? null,
  set: (d) => bridge?.set(d),
  notify: (n) => listeners.forEach((l) => l(n)),
  state: { get: () => useSync.getState(), set: (p) => useSync.setState(p) },
  storage: {
    load: () => { try { const raw = localStorage.getItem(QUEUE_KEY); return raw ? (JSON.parse(raw) as PersistedQueue) : null; } catch { return null; } },
    save: (q) => { if (q) localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); else localStorage.removeItem(QUEUE_KEY); },
  },
});
const remote = () => backendMode() === 'remote' && typeof window !== 'undefined';

/** No-ops in local mode, so the store can call these unconditionally. */
export const sync = {
  start: () => { if (remote()) engine.start(); },
  send: (a: AnyAction) => { if (remote()) engine.send(a); },
  reset: (preset: string) => { if (remote()) void engine.reset(preset); },
  importDomain: (d: Domain) => { if (remote()) void engine.importDomain(d); },
  refresh: () => { if (remote()) void engine.refresh(true); },
};
