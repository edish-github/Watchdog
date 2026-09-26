import type { Client, InStatement } from '@libsql/client';
import type { Domain } from '../types';
import { canPublish, guardrails } from '../advisory';
import { applyAction } from '../apply';
import { SITE } from '../catalog';
import type { AnyAction } from '../transport';
import { withWeather } from '../weather';
import { enrichDraft, type DraftCache, type Drafter } from './ai/enrich';
import { ApiProblem, backoff, isDuplicateRequest, isRetryable, sleep } from './errors';
import { withWriteLock } from './lock';
import { deletePhotos, extractPhotos, photoKeys } from './photos';
import type { Principal } from './principal';
import { project, type Projection } from './projection';
import { commitPlan, loadDomain, planDiff, stripTransient, type WorkspaceMeta } from './repo';
import { loadWeather } from './weather';
import { workspaceInfo, type WorkspaceInfo } from './workspaces';

/** Every action the server applies: the reducer's (lib/sim.ts) plus device/erase (lib/apply.ts). */
export const KNOWN_ACTIONS = [
  'advance', 'observation/submit', 'observation/discard', 'signal/dismiss', 'signal/escalate', 'look/request', 'look/accept',
  'look/respond', 'advisory/draft', 'advisory/create', 'advisory/edit', 'advisory/publish', 'advisory/withdraw', 'bundle/status', 'notices/read',
  'device/erase',
] as const;
/** Types a client may never send: delivery receipts are written only by the server's outbox (lib/server/fhir-outbox.ts). */
export const SERVER_ONLY_ACTIONS = new Set<string>(['bundle/status']);
/** Vercel caps request bodies at 4.5 MB. Photos arrive re-encoded by the browser, typically 100–400 KB. */
export const MAX_BODY_BYTES = 4_000_000;
const MAX_ADVANCE_MS = 14 * 86_400_000;
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export interface Envelope { requestId: string; baseVersion: number | null; action: AnyAction }
export interface CommandResult {
  version: number; created: string | null; applied: boolean; rebased: boolean; replayed: boolean;
  workspace: WorkspaceInfo; projection: Projection;
}
/** internal = issued by the server itself (outbox worker, scheduled cycle); extra = statements in the same transaction. */
export interface CommandOptions { drafter?: Drafter; internal?: boolean; extra?: InStatement[] }
type Summary = Pick<CommandResult, 'created' | 'applied' | 'rebased'>;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
