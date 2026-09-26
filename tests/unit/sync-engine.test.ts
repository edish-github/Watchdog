import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Domain } from '@/lib/types';
import { applyAction } from '@/lib/apply';
import { buildScenario } from '@/lib/sim';
import { createSyncEngine, type PersistedQueue, type SyncDeps, type SyncState } from '@/lib/sync';
import { ApiError, type AnyAction, type Snapshot, type WorkspaceInfo } from '@/lib/transport';

const ws: WorkspaceInfo = { id: 'ws-1', kind: 'demo', joinCode: 'ABCDEF', preset: 'day2', version: 1 };

/** A fake server holding one sandbox, plus an engine wired to it. */
function harness(opts: { attached?: boolean; saved?: PersistedQueue | null } = {}) {
  let server: Domain = buildScenario('day2');
  let version = 1;
  let failNext: ApiError | null = null;
  const sent: AnyAction[] = [];
  const snap = (): Snapshot => ({ version, workspace: { ...ws, preset: server.preset, version }, projection: server });
  const api = {
    current: vi.fn(async () => {
      if (opts.attached === false) throw new ApiError(401, 'unauthenticated', 'No sandbox');
      return { ...ws, now: server.now, lastSeenAt: '', expiresAt: null };
    }),
    createSandbox: vi.fn(async () => ({ ...ws, now: server.now })),
    sync: vi.fn(async (since: number | null) => (since === version ? { changed: false as const, version } : { changed: true as const, role: 'staff', ...snap() })),
    command: vi.fn(async (a: AnyAction, _base: number | null, _requestId?: string) => {
      if (failNext) { const e = failNext; failNext = null; throw e; }
      sent.push(a);
      server = applyAction(server, a);
      version++;
      return { ...snap(), created: null, applied: true, rebased: false, replayed: false };
    }),
    reset: vi.fn(async (preset: string) => { server = buildScenario(preset); version++; return snap(); }),
    importDomain: vi.fn(async (d: Domain) => { server = d; version++; return snap(); }),
  };
  let state: SyncState = { status: 'connecting', version: null, workspace: null, pending: 0, lastSyncAt: null, lastError: null };
  let local: Domain = buildScenario('day2');
  const notices: string[] = [];
  const storage = { last: undefined as PersistedQueue | null | undefined, load: () => opts.saved ?? null, save: (q: PersistedQueue | null) => { storage.last = q; } };
  const engine = createSyncEngine({
    api: api as unknown as SyncDeps['api'],
    get: () => local,
    set: (d) => { local = d; },
    notify: (x) => notices.push(x.title),
    state: { get: () => state, set: (p) => { state = { ...state, ...p }; } },
    storage,
    visible: () => true,
  });
  return { engine, api, sent, notices, storage, state: () => state, local: () => local, failNext: (e: ApiError) => { failNext = e; } };
}

const later = (d: Domain, minutes: number): AnyAction => ({ type: 'advance', to: new Date(Date.parse(d.now) + minutes * 60_000).toISOString() });
const settle = () => vi.advanceTimersByTimeAsync(10);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-26T10:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('sync engine', () => {
  it('creates a sandbox when none is attached, then adopts the server state', async () => {
    const h = harness({ attached: false });
    h.engine.start();
    await settle();
    expect(h.api.createSandbox).toHaveBeenCalledOnce();
    expect(h.state()).toMatchObject({ status: 'online', version: 1, workspace: { joinCode: 'ABCDEF' } });
    h.engine.stop();
  });

  it('coalesces replay-clock ticks and sends at most one advance every 5 s', async () => {
    const h = harness();
    h.engine.start();
    await settle();
    const base = h.local();
    for (let m = 1; m <= 5; m++) h.engine.send(later(base, m));
    await settle();
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toEqual(later(base, 5));
    h.engine.send(later(base, 6));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(4_100);
    expect(h.sent).toHaveLength(2);
    expect(h.sent[1]).toEqual(later(base, 6));
    h.engine.stop();
  });

  it('keeps user actions in order behind a queued tick', async () => {
    const h = harness();
    h.engine.start();
    await settle();
    h.engine.send(later(h.local(), 1));
    h.engine.send({ type: 'notices/read' });
    await settle();
    expect(h.sent.map((a) => a.type)).toEqual(['advance', 'notices/read']);
    expect(h.state().pending).toBe(0);
    h.engine.stop();
  });

  it('queues through a network failure, shows it, and recovers', async () => {
    const h = harness();
    h.engine.start();
    await settle();
    h.failNext(new ApiError(0, 'network', 'offline'));
    h.engine.send({ type: 'notices/read' });
    await settle();
    expect(h.state().status).toBe('offline');
    expect(h.state().pending).toBe(1);
    expect(h.notices).toContain('Working offline');
    await vi.advanceTimersByTimeAsync(2_500);
    expect(h.sent.map((a) => a.type)).toEqual(['notices/read']);
    expect(h.state()).toMatchObject({ status: 'online', pending: 0 });
    expect(h.notices).toContain('Back online');
    h.engine.stop();
  });

  it('drops a rejected action, says so, and resyncs from the server', async () => {
    const h = harness();
    h.engine.start();
    await settle();
    h.failNext(new ApiError(422, 'invalid_action', 'nope'));
    h.engine.send({ type: 'notices/read' });
    await settle();
    expect(h.state().pending).toBe(0);
    expect(h.notices).toContain('Change not saved');
    expect(h.api.sync).toHaveBeenLastCalledWith(null);
    h.engine.stop();
  });

  it('resets and imports on the server and adopts the new world', async () => {
    const h = harness();
    h.engine.start();
    await settle();
    await h.engine.reset('day1');
    expect(h.api.reset).toHaveBeenCalledWith('day1');
    expect(h.local().preset).toBe('day1');
    await h.engine.importDomain(buildScenario('day3'));
    expect(h.local().preset).toBe('day3');
    expect(h.state().version).toBe(3);
    h.engine.stop();
  });

  it('resends the queue saved before a reload, with the same request ids, then clears it', async () => {
    const h = harness({ saved: { workspaceId: 'ws-1', items: [{ id: 'saved-before-reload-0001', action: { type: 'notices/read' } }] } });
    h.engine.start();
    await settle();
    expect(h.sent.map((a) => a.type)).toEqual(['notices/read']);
    expect(h.api.command.mock.calls[0][2]).toBe('saved-before-reload-0001');
    expect(h.storage.last).toBeNull();
    h.engine.stop();
  });

  it('drops a saved queue that belongs to another sandbox', async () => {
    const h = harness({ saved: { workspaceId: 'someone-else', items: [{ id: 'other-sandbox-0001', action: { type: 'notices/read' } }] } });
    h.engine.start();
    await settle();
    expect(h.sent).toHaveLength(0);
    h.engine.stop();
  });

  it('sends device erasure to the server', async () => {
    const h = harness();
    h.engine.start();
    await settle();
    h.engine.send({ type: 'device/erase', deviceId: 'anon-8f92', names: ['Bolota'] });
    await settle();
    expect(h.sent.map((a) => a.type)).toEqual(['device/erase']);
    h.engine.stop();
  });
});
