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

function checkShape(v: unknown, depth: number): void {
  if (depth > 12) throw new ApiProblem(400, 'invalid_action', 'The action is nested too deeply.');
  if (Array.isArray(v)) {
    if (v.length > 1000) throw new ApiProblem(400, 'invalid_action', 'An array in the action is too long.');
    for (const x of v) checkShape(x, depth + 1);
    return;
  }
  if (isObj(v)) {
    for (const [k, x] of Object.entries(v)) {
      if (FORBIDDEN_KEYS.has(k)) throw new ApiProblem(400, 'invalid_action', `The key "${k}" is not allowed.`);
      checkShape(x, depth + 1);
    }
    return;
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new ApiProblem(400, 'invalid_action', 'Numbers must be finite.');
}

/** Structural checks on the request. The reducer itself is the domain validator: it ignores what it cannot apply. */
export function validateEnvelope(body: unknown): Envelope {
  if (!isObj(body)) throw new ApiProblem(400, 'invalid_action', 'The body must be a JSON object.');
  const { requestId, baseVersion, action } = body;
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw new ApiProblem(400, 'invalid_action', '"requestId" must be 8–64 characters of letters, digits, "-" or "_".');
  if (baseVersion !== undefined && baseVersion !== null && !(typeof baseVersion === 'number' && Number.isInteger(baseVersion) && baseVersion >= 0)) {
    throw new ApiProblem(400, 'invalid_action', '"baseVersion" must be a non-negative integer or null.');
  }
  if (!isObj(action) || typeof action.type !== 'string' || !/^[a-z]+(\/[a-z-]+)?$/.test(action.type)) throw new ApiProblem(400, 'invalid_action', '"action" must be an object with a "type" such as "observation/submit".');
  checkShape(action, 0);
  if (action.type === 'device/erase') {
    const names = action.names;
    if (typeof action.deviceId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(action.deviceId)) throw new ApiProblem(400, 'invalid_action', '"device/erase" needs a device id.');
    if (!Array.isArray(names) || names.length > 5 || !names.every((n) => typeof n === 'string' && n.length <= 60)) throw new ApiProblem(400, 'invalid_action', '"names" must be up to 5 short strings.');
  }
  return { requestId, baseVersion: typeof baseVersion === 'number' ? baseVersion : null, action: action as unknown as AnyAction };
}

function authorize(p: Principal, meta: WorkspaceMeta, a: AnyAction, d: Domain, internal: boolean) {
  if (p.workspaceId !== meta.id) throw new ApiProblem(403, 'forbidden', 'This session belongs to another workspace.');
  if (internal) return;
  if (SERVER_ONLY_ACTIONS.has(a.type)) throw new ApiProblem(403, 'forbidden', `"${a.type}" can only be written by the server.`);
  if (p.kind !== 'sandbox' || meta.kind !== 'demo') throw new ApiProblem(403, 'forbidden', 'Only demo sandboxes accept commands in this build.');
  if (a.type === 'advance') {
    const to = Date.parse(String(a.to));
    if (!Number.isFinite(to)) throw new ApiProblem(400, 'invalid_action', '"advance" needs an ISO time in "to".');
    if (to - Date.parse(d.now) > MAX_ADVANCE_MS) throw new ApiProblem(422, 'invalid_action', 'The replay clock can move at most 14 days per command.');
  }
}

/**
 * The human gate, enforced where it cannot be bypassed: the stored text must pass every blocking guardrail and the
 * expiry must be at least an hour away — the same rules the editor shows — or publishing is refused.
 */
function checkPublish(d: Domain, a: AnyAction) {
  if (a.type !== 'advisory/publish') return;
  const adv = d.advisories.find((x) => x.id === a.id);
  if (!adv || adv.status !== 'draft') return; // the reducer ignores these
  const checks = guardrails(adv.text, adv.langs, adv.validUntil, SITE[adv.siteId]);
  const future = Date.parse(adv.validUntil) > Date.parse(d.now) + 3_600_000;
  if (canPublish(checks) && future) return;
  const failing = checks.filter((c) => !c.pass && c.blocking);
  const reasons = [...failing.map((c) => `${c.label} (${c.detail})`), ...(future ? [] : ['Expiry must be at least one hour from now'])];
  throw new ApiProblem(422, 'guardrail_failed', `Publishing refused: ${reasons.join('; ')}.`, { checks: failing });
}

const deviceOf = (a: AnyAction): string | null =>
  a.type === 'observation/submit' ? String((a.input as { deviceId?: unknown }).deviceId ?? '') || null : a.type === 'device/erase' ? a.deviceId : null;
const actorOf = (a: AnyAction): string | null => { const v = (a as { actor?: unknown }).actor; return typeof v === 'string' ? v : null; };

const logStatement = (ws: string, env: Envelope, versionAfter: number, s: Summary): InStatement => ({
  sql: 'INSERT INTO command_log (workspace_id, request_id, action_type, actor, version_after, response, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  args: [ws, env.requestId, env.action.type, actorOf(env.action), versionAfter, JSON.stringify(s), new Date().toISOString()],
});

async function findReplay(c: Client, p: Principal, requestId: string): Promise<CommandResult | null> {
  const rs = await c.execute({ sql: 'SELECT response FROM command_log WHERE workspace_id = ? AND request_id = ?', args: [p.workspaceId, requestId] });
  const row = rs.rows[0];
  if (!row) return null;
  const loaded = await loadDomain(c, p.workspaceId);
  if (!loaded) throw new ApiProblem(404, 'not_found', 'This sandbox no longer exists.');
  const s = JSON.parse(String(row.response)) as Summary;
  return { version: loaded.meta.version, ...s, replayed: true, workspace: workspaceInfo(loaded.meta), projection: project(loaded.d, p) };
}

const log = (fields: Record<string, unknown>) => { if (process.env.NODE_ENV !== 'test') console.info(JSON.stringify({ evt: 'command', ...fields })); };

/**
 * load → apply (on the workspace's own weather) → enrich → diff → persist. Exactly-once per requestId; a stale
 * baseVersion is rebased; version races are retried. Photos are stored in the same transaction; AI drafts are fetched
 * outside any lock and cached across retries.
 */
export async function executeCommand(c: Client, p: Principal, env: Envelope, opts: CommandOptions = {}): Promise<CommandResult> {
  const t0 = Date.now();
  const earlier = await findReplay(c, p, env.requestId);
  if (earlier) return earlier;
  const photos = await extractPhotos(env.action, { workspaceId: p.workspaceId, deviceId: deviceOf(env.action) });
  const action = photos.value;
  const drafts: DraftCache = new Map();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const loaded = await loadDomain(c, p.workspaceId);
      if (!loaded) throw new ApiProblem(404, 'not_found', 'This sandbox no longer exists.');
      authorize(p, loaded.meta, action, loaded.d, !!opts.internal);
      checkPublish(loaded.d, action);
      const wx = await loadWeather(c, loaded.meta);
      let next: Domain;
      try {
        next = withWeather(wx, () => applyAction(loaded.d, action));
      } catch (e) {
        throw new ApiProblem(422, 'invalid_action', `The action could not be applied: ${e instanceof Error ? e.message : String(e)}`);
      }
      if (!next) throw new ApiProblem(422, 'invalid_action', `"${action.type}" produced no state.`);
      next = await enrichDraft(loaded.d, next, action, { workspaceId: p.workspaceId, cache: drafts, drafter: opts.drafter });
      const plan = planDiff(loaded.meta, loaded.d, next);
      const created = plan.changed && typeof next.lastCreated === 'string' ? next.lastCreated : null;
      const summary: Summary = { created, applied: plan.changed, rebased: env.baseVersion !== null && env.baseVersion !== loaded.meta.version };
      const extra: InStatement[] = [logStatement(p.workspaceId, env, plan.changed ? loaded.meta.version + 1 : loaded.meta.version, summary)];
      if (plan.changed) {
        const before = photoKeys(loaded.d), after = photoKeys(next);
        extra.push(...photos.entries.filter((x) => after.has(x.key)).map((x) => x.stmt));
        const gone = [...before].filter((k) => !after.has(k));
        if (gone.length) extra.push(deletePhotos(p.workspaceId, gone));
        if (opts.extra) extra.push(...opts.extra);
      }
      let meta = loaded.meta;
      if (plan.changed) meta = await commitPlan(c, loaded.meta, next, plan, { after: extra });
      else await withWriteLock(c, () => c.execute(extra[0]));
      log({ ws: p.workspaceId.slice(0, 8), type: action.type, applied: plan.changed, rebased: summary.rebased, internal: !!opts.internal, photos: photos.entries.length, version: meta.version, attempt, ms: Date.now() - t0 });
      return { version: meta.version, ...summary, replayed: false, workspace: workspaceInfo(meta), projection: project(plan.changed ? stripTransient(next) : loaded.d, p) };
    } catch (e) {
      if (isDuplicateRequest(e)) {
        const r = await findReplay(c, p, env.requestId);
        if (r) return r;
      }
      if (isRetryable(e)) { lastError = e; await sleep(backoff(attempt)); continue; }
      throw e;
    }
  }
  throw new ApiProblem(409, 'version_conflict', 'The workspace was busy and the command was not applied. Try again.', { cause: String(lastError) });
}
