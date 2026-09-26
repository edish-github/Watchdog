import { createHash } from 'node:crypto';
import type { Client, InStatement, InValue, Row } from '@libsql/client';
import type { AuditEvent, Domain } from '../types';
import { withWriteLock } from './lock';

export type Collection = 'watches' | 'observations' | 'signals' | 'looks' | 'advisories' | 'bundles' | 'notices';
type Entity = { id: string } & Record<string, unknown>;
type Columns = Record<string, (x: Entity) => InValue>;
const txt = (v: unknown): InValue => (v === undefined || v === null ? null : String(v));

/** Domain collection → table, and the indexed columns derived from each entity. */
export const COLLECTIONS: Record<Collection, { table: string; columns: Columns }> = {
  watches: { table: 'watches', columns: { site_id: (x) => txt(x.siteId), hazard: (x) => txt(x.hazard), status: (x) => (x.closedAt ? 'closed' : 'open') } },
  observations: { table: 'observations', columns: { site_id: (x) => txt(x.siteId), status: (x) => txt(x.status), device_id: (x) => txt(x.deviceId), signal_id: (x) => txt(x.signalId), created_at: (x) => txt(x.createdAt) } },
  signals: { table: 'signals', columns: { site_id: (x) => txt(x.siteId), hazard: (x) => txt(x.hazard), status: (x) => txt(x.status), opened_at: (x) => txt(x.openedAt) } },
  looks: { table: 'looks', columns: { site_id: (x) => txt(x.siteId), assignee: (x) => txt(x.assignee), status: (x) => txt(x.status), due_at: (x) => txt(x.dueAt) } },
  advisories: { table: 'advisories', columns: { site_id: (x) => txt(x.siteId), hazard: (x) => txt(x.hazard), status: (x) => txt(x.status), valid_until: (x) => txt(x.validUntil) } },
  bundles: { table: 'fhir_outbox', columns: { site_id: (x) => txt(x.siteId), status: (x) => txt(x.status), created_at: (x) => txt(x.createdAt) } },
  notices: { table: 'notices', columns: { at: (x) => txt(x.at), is_read: (x) => (x.read ? 1 : 0) } },
};
export const COLLECTION_ORDER = Object.keys(COLLECTIONS) as Collection[];
/** The domain keeps the newest 500 audit events in memory; the table keeps all of them. */
export const AUDIT_WINDOW = 500;

export interface WorkspaceMeta {
  id: string; kind: 'demo' | 'live'; preset: string; joinCode: string | null;
  start: string; now: string; autopilot: boolean; cursor: number; lastCycle: string | null; seq: Domain['seq'];
  version: number; posSeq: number; auditSeq: number; auditHead: string; weatherMode: Record<string, string>;
  createdAt: string; lastSeenAt: string; expiresAt: string | null;
}
export interface Loaded { meta: WorkspaceMeta; d: Domain }
export interface DiffPlan { stmts: InStatement[]; posSeq: number; auditSeq: number; auditHead: string; changed: boolean }

export class VersionConflictError extends Error {
  constructor(public readonly expected: number) { super(`workspace version ${expected} is stale`); this.name = 'VersionConflictError'; }
}

/** hash_n = sha256(hash_{n-1} + "\n" + canonical JSON of event n); the first prevHash is "". */
export const auditHash = (prev: string, e: AuditEvent) => createHash('sha256').update(`${prev}\n${JSON.stringify(e)}`).digest('hex');

/** Drops fields that only exist between a reduce() and the response. */
export function stripTransient(d: Domain): Domain {
  const { lastCreated: _transient, ...rest } = d;
  return rest as Domain;
}
/** Same scalars, no records: the "before" of a first persist. */
export const emptyLike = (d: Domain): Domain => ({ ...stripTransient(d), watches: [], observations: [], signals: [], looks: [], advisories: [], bundles: [], audit: [], notices: [] });

export function metaFromRow(r: Row): WorkspaceMeta {
  return {
    id: String(r.id), kind: r.kind === 'live' ? 'live' : 'demo', preset: String(r.preset), joinCode: r.join_code == null ? null : String(r.join_code),
    start: String(r.start), now: String(r.now), autopilot: Number(r.autopilot) === 1, cursor: Number(r.cursor),
    lastCycle: r.last_cycle == null ? null : String(r.last_cycle), seq: JSON.parse(String(r.seq)),
    version: Number(r.version), posSeq: Number(r.pos_seq), auditSeq: Number(r.audit_seq), auditHead: String(r.audit_head ?? ''),
    weatherMode: JSON.parse(String(r.weather_mode ?? '{}')), createdAt: String(r.created_at), lastSeenAt: String(r.last_seen_at),
    expiresAt: r.expires_at == null ? null : String(r.expires_at),
  };
}

export async function readWorkspace(c: Client, id: string): Promise<WorkspaceMeta | null> {
  const rs = await c.execute({ sql: 'SELECT * FROM workspaces WHERE id = ?', args: [id] });
  return rs.rows[0] ? metaFromRow(rs.rows[0]) : null;
}

/** Cheap: what sync checks before deciding between 304 and a full projection. */
export async function readVersion(c: Client, id: string): Promise<number | null> {
  const rs = await c.execute({ sql: 'SELECT version FROM workspaces WHERE id = ?', args: [id] });
  return rs.rows[0] ? Number(rs.rows[0].version) : null;
}

/** One read round trip: the workspace row, every collection newest-first, and the newest audit window. */
export async function loadDomain(c: Client, id: string): Promise<Loaded | null> {
  const stmts: InStatement[] = [
    { sql: 'SELECT * FROM workspaces WHERE id = ?', args: [id] },
    ...COLLECTION_ORDER.map((k) => ({ sql: `SELECT data FROM ${COLLECTIONS[k].table} WHERE workspace_id = ? ORDER BY pos DESC`, args: [id] })),
    { sql: 'SELECT data FROM audit_events WHERE workspace_id = ? ORDER BY seq DESC LIMIT ?', args: [id, AUDIT_WINDOW] },
  ];
  const rs = await c.batch(stmts, 'read');
  const row = rs[0].rows[0];
  if (!row) return null;
  const meta = metaFromRow(row);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const col = (i: number): any[] => rs[i].rows.map((r) => JSON.parse(String(r.data)));
  const at = (k: Collection) => 1 + COLLECTION_ORDER.indexOf(k);
  // Key order matches buildScenario(), so JSON of a loaded domain equals JSON of the original.
  const d: Domain = {
    start: meta.start, now: meta.now, preset: meta.preset, autopilot: meta.autopilot, cursor: meta.cursor, lastCycle: meta.lastCycle, seq: meta.seq,
    watches: col(at('watches')), observations: col(at('observations')), signals: col(at('signals')), looks: col(at('looks')),
    advisories: col(at('advisories')), bundles: col(at('bundles')), audit: col(COLLECTION_ORDER.length + 1), notices: col(at('notices')),
  };
  return { meta, d };
}

function upsert(table: string, columns: Columns, wsId: string, x: Entity, json: string, pos: number, stamp: string): InStatement {
  const names = Object.keys(columns);
  const cols = ['workspace_id', 'id', 'pos', ...names, 'data', 'updated_at'];
  const set = [...names, 'data', 'updated_at'].map((n) => `${n} = excluded.${n}`).join(', ');
  return {
    sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT (workspace_id, id) DO UPDATE SET ${set}`,
    args: [wsId, x.id, pos, ...names.map((n) => columns[n](x)), json, stamp],
  };
}

const scalars = (d: Domain) => JSON.stringify([d.now, d.preset, d.autopilot, d.cursor, d.lastCycle, d.seq]);

/**
 * The statements that turn `prev` into `next`. New records get increasing positions (oldest first) so the
 * newest-first order survives a reload. Audit events are append-only and hash-chained.
 */
export function planDiff(meta: WorkspaceMeta, prev: Domain, next: Domain): DiffPlan {
  const stamp = new Date().toISOString();
  const stmts: InStatement[] = [];
  let pos = meta.posSeq;
  for (const k of COLLECTION_ORDER) {
    const { table, columns } = COLLECTIONS[k];
    const before = new Map((prev[k] as unknown as Entity[]).map((x) => [x.id, JSON.stringify(x)]));
    const after = next[k] as unknown as Entity[];
    for (let i = after.length - 1; i >= 0; i--) {
      const x = after[i], json = JSON.stringify(x), old = before.get(x.id);
      if (old === json) continue;
      if (old === undefined) pos++;
      stmts.push(upsert(table, columns, meta.id, x, json, old === undefined ? pos : 0, stamp));
    }
    const kept = new Set(after.map((x) => x.id));
    const gone = [...before.keys()].filter((id) => !kept.has(id));
    if (gone.length) stmts.push({ sql: `DELETE FROM ${table} WHERE workspace_id = ? AND id IN (${gone.map(() => '?').join(', ')})`, args: [meta.id, ...gone] });
  }
  const known = new Set(prev.audit.map((e) => e.id));
  const fresh = next.audit.filter((e) => !known.has(e.id)).reverse();
  let seq = meta.auditSeq, head = meta.auditHead;
  for (const e of fresh) {
    seq++;
    const hash = auditHash(head, e);
    stmts.push({
      sql: 'INSERT INTO audit_events (workspace_id, id, seq, at, actor, action, target, kind, data, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [meta.id, e.id, seq, e.at, e.actor, e.action, e.target, e.kind, JSON.stringify(e), head, hash],
    });
    head = hash;
  }
  return { stmts, posSeq: pos, auditSeq: seq, auditHead: head, changed: stmts.length > 0 || scalars(prev) !== scalars(next) };
}

/** Applies a plan in ONE transaction, guarded by the workspace version. `before`/`after` ride in the same transaction. */
export function commitPlan(c: Client, meta: WorkspaceMeta, next: Domain, plan: DiffPlan, opts: { before?: InStatement[]; after?: InStatement[] } = {}): Promise<WorkspaceMeta> {
  return withWriteLock(c, async () => {
    const stamp = new Date().toISOString();
    const tx = await c.transaction('write');
    try {
      const r = await tx.execute({
        sql: `UPDATE workspaces SET now = ?, preset = ?, autopilot = ?, cursor = ?, last_cycle = ?, seq = ?, version = version + 1,
              pos_seq = ?, audit_seq = ?, audit_head = ?, last_seen_at = ? WHERE id = ? AND version = ?`,
        args: [next.now, next.preset, next.autopilot ? 1 : 0, next.cursor, next.lastCycle, JSON.stringify(next.seq), plan.posSeq, plan.auditSeq, plan.auditHead, stamp, meta.id, meta.version],
      });
      if (r.rowsAffected !== 1) throw new VersionConflictError(meta.version);
      const all = [...(opts.before ?? []), ...plan.stmts, ...(opts.after ?? [])];
      if (all.length) await tx.batch(all);
      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch { /* already closed */ }
      throw e;
    } finally {
      tx.close();
    }
    return {
      ...meta, now: next.now, preset: next.preset, autopilot: next.autopilot, cursor: next.cursor, lastCycle: next.lastCycle, seq: next.seq,
      version: meta.version + 1, posSeq: plan.posSeq, auditSeq: plan.auditSeq, auditHead: plan.auditHead, lastSeenAt: stamp,
    };
  });
}

/** Writes the difference between two domains in one version-guarded transaction. */
export async function persistDiff(c: Client, meta: WorkspaceMeta, prev: Domain, next: Domain, extra: InStatement[] = []): Promise<WorkspaceMeta> {
  return commitPlan(c, meta, next, planDiff(meta, prev, next), { after: extra });
}

/** Recomputes the whole chain; any edited, removed or reordered event breaks it. */
export async function verifyAuditChain(c: Client, id: string): Promise<{ ok: boolean; count: number; brokenAt?: string }> {
  const rs = await c.execute({ sql: 'SELECT id, data, prev_hash, hash FROM audit_events WHERE workspace_id = ? ORDER BY seq ASC', args: [id] });
  let head = '';
  for (const r of rs.rows) {
    const e = JSON.parse(String(r.data)) as AuditEvent;
    if (String(r.prev_hash) !== head || auditHash(head, e) !== String(r.hash)) return { ok: false, count: rs.rows.length, brokenAt: String(r.id) };
    head = String(r.hash);
  }
  const ws = await readWorkspace(c, id);
  return ws && ws.auditHead !== head ? { ok: false, count: rs.rows.length, brokenAt: 'workspace.audit_head' } : { ok: true, count: rs.rows.length };
}
