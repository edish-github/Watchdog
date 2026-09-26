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
