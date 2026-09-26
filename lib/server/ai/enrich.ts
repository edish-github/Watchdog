import type { Domain } from '../../types';
import { DRAFTER } from '../../advisory';
import type { AnyAction } from '../../transport';
import { rateLimit } from '../ratelimit';
import { buildBrief, draftAdvisory, type DraftBrief, type DraftLang, type DraftOutcome } from './advisory-draft';
import { activeProvider } from './llm';

export type Drafter = (brief: DraftBrief) => Promise<DraftOutcome>;
export type DraftCache = Map<string, DraftOutcome>;
export const DRAFTS_PER_HOUR = 20;

export const aiDraftingOn = () => activeProvider() !== null;

/**
 * After the reducer has created a template draft for `advisory/draft`, ask the configured model for the text and swap
 * it in. ids, validity, languages and the audit event come from the reducer; only text, draft origin and the audit
 * detail change. The label is always the model the provider's API reported. Cached across commit retries.
 */
export async function enrichDraft(prev: Domain, next: Domain, action: AnyAction, ctx: { workspaceId: string; cache: DraftCache; drafter?: Drafter }): Promise<Domain> {
  if (action.type !== 'advisory/draft') return next;
  const id = next.lastCreated;
  if (!id || prev.advisories.some((a) => a.id === id)) return next; // an existing draft was reopened
  const adv = next.advisories.find((a) => a.id === id);
  if (!adv || adv.status !== 'draft' || adv.draft?.by !== DRAFTER || !adv.signalId) return next;
  const langs = adv.langs.filter((l): l is DraftLang => l === 'en' || l === 'pt');
  if (!langs.length || langs.length !== adv.langs.length) return next;
  if (!ctx.drafter && !aiDraftingOn()) return next;
  const event = next.audit.find((e) => e.target === id && e.action === 'Advisory draft generated');
  const key = `${adv.signalId}|${adv.validUntil}|${langs.join(',')}`;
  let r = ctx.cache.get(key);
  if (!r) {
    const limit = rateLimit(`draft:${ctx.workspaceId}`, { limit: DRAFTS_PER_HOUR, windowMs: 3_600_000 });
    if (!limit.ok) {
      if (event) event.detail = `${event.detail ?? ''} · AI skipped: ${DRAFTS_PER_HOUR} drafts per hour reached`;
      return next;
    }
    r = await (ctx.drafter ?? ((b: DraftBrief) => draftAdvisory(b)))(buildBrief(next, adv.signalId, { langs, validUntil: adv.validUntil }));
    ctx.cache.set(key, r);
  }
  if (!r.ok) {
    if (event) event.detail = `${event.detail ?? ''} · AI draft unavailable (${r.reason})`;
    return next;
  }
  const by = `${r.model} (${r.promptVersion})`;
  adv.text = { ...r.text };
  adv.draft = { by, at: adv.draft.at, text: { ...r.text } };
  adv.edited = false;
  if (event) event.detail = `${adv.siteId} · ${by} · ${langs.join('/').toUpperCase()} · ${(r.latencyMs / 1000).toFixed(1)} s · ${r.attempts} attempt(s) · brief ${r.inputHash.slice(0, 10)} → text ${r.outputHash.slice(0, 10)}`;
  return next;
}
