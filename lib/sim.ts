import type { Advisory, BundleRecord, Domain, HazardId, Lang, LookResult, ObservationInput, Photo, Signal, SignalStatus, SignCode, Watch } from './types';
import { CHECKLIST, CITY, HAZARDS, HZ, PEOPLE, SIGNS, SITE, SITES } from './catalog';
import { RULES, dailyWatch, hazardFor, snapshot, tzOf } from './engine';
import { DRAFTER, defaultValidity, draftText } from './advisory';
import { DEFAULT_ENDPOINT, buildBundle, validateBundle } from './fhir';
import { HOUR, addH, dayAdd, fmtDay, hoursBetween, localDate, minIso, pad, sha256, uniq, zonedToUtc } from './utils';

export type Action =
  | { type: 'advance'; to: string }
  | { type: 'observation/submit'; input: ObservationInput }
  | { type: 'observation/discard'; id: string; reason: string; actor: string }
  | { type: 'signal/dismiss'; id: string; reason: string; actor: string }
  | { type: 'signal/escalate'; id: string; actor: string }
  | { type: 'look/request'; siteId: string; hazard: HazardId; purpose: 'verify' | 'resolve'; assignee: string; actor: string; signalId?: string; advisoryId?: string; note?: string }
  | { type: 'look/accept'; id: string }
  | { type: 'look/respond'; id: string; result: LookResult; observed: SignCode[]; notes?: string; photo?: Photo }
  | { type: 'advisory/draft'; signalId: string; actor: string }
  | { type: 'advisory/create'; siteId: string; hazard: HazardId; signalId?: string; langs: Lang[]; text: Partial<Record<Lang, string>>; validUntil: string; actor: string }
  | { type: 'advisory/edit'; id: string; text?: Partial<Record<Lang, string>>; validUntil?: string }
  | { type: 'advisory/publish'; id: string; actor: string; escalate: boolean }
  | { type: 'advisory/withdraw'; id: string; actor: string; reason: string }
  | { type: 'bundle/status'; id: string; status: BundleRecord['status']; http?: number; receipt?: string; error?: string }
  | { type: 'notices/read'; id?: string };

export const ACTIVE: SignalStatus[] = ['open', 'look_requested', 'advisory'];
const ENGINE = 'Watchdog engine';
export const SCENARIO_START = '2026-09-24T00:00:00.000Z';

// ── helpers ──
function nid(d: Domain, k: keyof Domain['seq'], prefix: string, w = 2) { d.seq[k] += 1; return `${prefix}-${pad(d.seq[k], w)}`; }
function audit(d: Domain, actor: string, action: string, target: string, detail = '', kind: 'system' | 'human' | 'report' = 'human', at = d.now) {
  d.audit.unshift({ id: nid(d, 'evt', 'EV', 4), at, actor, action, target, detail, kind });
  if (d.audit.length > 500) d.audit.length = 500;
}
function notice(d: Domain, kind: Domain['notices'][number]['kind'], title: string, body: string, href: string, at = d.now) {
  d.notices.unshift({ id: nid(d, 'ntc', 'N', 4), at, kind, title, body, href, read: false });
  if (d.notices.length > 150) d.notices.length = 150;
}
export const activeSignal = (d: Domain, siteId: string, hz: HazardId) => d.signals.find((s) => s.siteId === siteId && s.hazard === hz && ACTIVE.includes(s.status));
export const openWatch = (d: Domain, siteId: string, hz?: HazardId) => d.watches.find((w) => w.siteId === siteId && (!hz || w.hazard === hz) && !w.closedAt);
export const signalObs = (d: Domain, s: Signal) => d.observations.filter((o) => o.signalId === s.id && o.status === 'fused');

function refresh(d: Domain, s: Signal, force: boolean) {
  const site = SITE[s.siteId];
  const snap = snapshot(site, s.hazard, signalObs(d, s), d.now, !!openWatch(d, s.siteId, s.hazard));
  if (!force && snap.watch.date === s.snapshot.watch.date && snap.watchActive === s.snapshot.watchActive) return;
  const changed = snap.score !== s.snapshot.score || snap.evidence.reporters !== s.snapshot.evidence.reporters;
  s.snapshot = snap;
  if (changed || force) {
    s.history.push({ at: d.now, score: snap.score, evidence: snap.evidence.value, watch: snap.watch.score, n: snap.evidence.reporters });
    if (s.history.length > 60) s.history.shift();
  }
}

// ── engine passes ──
function nextCycle(after: string) {
  let ms = Math.floor(Date.parse(after) / HOUR) * HOUR + HOUR;
  for (;;) { if ((RULES.cycleHoursUtc as readonly number[]).includes(new Date(ms).getUTCHours())) return new Date(ms).toISOString(); ms += HOUR; }
}
function evaluateWatches(d: Domain, at: string) {
  for (const site of SITES) for (const hz of HZ) {
    const today = localDate(at, tzOf(site));
    const days = [0, 1, 2].map((i) => dailyWatch(site, hz, dayAdd(today, i)));
    const best = days.reduce((m, x) => (x.score > m.score ? x : m), days[0]);
    const open = openWatch(d, site.id, hz);
    if (open) {
      if (best.score > open.peak) { open.peak = best.score; open.peakDate = best.date; }
      if (days.every((x) => x.score < RULES.tiers.watchClose)) {
        open.closedAt = at;
        audit(d, ENGINE, 'Watch window closed', open.id, `${site.id} · every horizon day below ${RULES.tiers.watchClose}`, 'system', at);
        notice(d, 'watch', `Watch closed at ${site.id}`, `${HAZARDS[hz].name} conditions eased.`, `/app/watches/${open.id}`, at);
      }
    } else if (best.score >= RULES.tiers.watchOpen) {
      const base = `W-2026-${site.id.replace('-', '')}-${hz}`, n = d.watches.filter((w) => w.id.startsWith(base)).length;
      const w: Watch = { id: n ? `${base}-${n + 1}` : base, siteId: site.id, hazard: hz, openedAt: at, peak: best.score, peakDate: best.date };
      d.watches.unshift(w);
      audit(d, ENGINE, 'Watch window opened', w.id, `${site.id} · ${HAZARDS[hz].name} · peak ${best.score} forecast`, 'system', at);
      notice(d, 'watch', `Watch opened at ${site.id}`, `${HAZARDS[hz].name}. Peak ${best.score}/100 on ${fmtDay(`${best.date}T12:00:00Z`, 'UTC')}.`, `/app/watches/${w.id}`, at);
    }
  }
}
function runCycles(d: Domain) {
  for (let c = nextCycle(d.lastCycle ?? d.start); c <= d.now; c = nextCycle(c)) { evaluateWatches(d, c); d.lastCycle = c; }
}

function fuseAll(d: Domain) {
  for (const site of SITES) {
    for (const o of d.observations) {
      if (o.siteId === site.id && o.status === 'pending' && hoursBetween(d.now, o.createdAt) > RULES.fusion.windowHours) { o.status = 'archived'; o.statusNote = 'No corroboration within 72 h'; }
    }
    const pref = openWatch(d, site.id)?.hazard;
    const pending = d.observations.filter((o) => o.siteId === site.id && o.status === 'pending');
    for (const hz of HZ) {
      const group = pending.filter((o) => hazardFor(o, pref) === hz);
      const active = activeSignal(d, site.id, hz);
      if (active) {
        if (group.length) {
          group.forEach((o) => { o.status = 'fused'; o.signalId = active.id; active.observationIds.push(o.id); });
          refresh(d, active, true);
          audit(d, ENGINE, 'Signal updated', active.id, `${group.map((o) => o.id).join(', ')} fused · score ${active.snapshot.score}`, 'system');
          notice(d, 'signal', `New evidence on ${active.id}`, `${site.id} · ${active.snapshot.evidence.reporters} reporters · score ${active.snapshot.score}/100`, `/app/signals/${active.id}`);
        } else refresh(d, active, false);
        continue;
      }
      if (!group.length) continue;
      const watchActive = !!openWatch(d, site.id, hz);
      const snap = snapshot(site, hz, group, d.now, watchActive);
      if (!snap.rule.met) continue;
      const id = nid(d, 'sig', 'SIG');
      group.forEach((o) => { o.status = 'fused'; o.signalId = id; });
      d.signals.unshift({ id, siteId: site.id, hazard: hz, openedAt: d.now, openReason: snap.rule.reason, status: 'open', observationIds: group.map((o) => o.id), snapshot: snap, history: [{ at: d.now, score: snap.score, evidence: snap.evidence.value, watch: snap.watch.score, n: snap.evidence.reporters }], decisions: [] });
      audit(d, ENGINE, 'Signal opened', id, `${site.id} · ${snap.rule.reason} · score ${snap.score}`, 'system');
      notice(d, 'signal', `Signal opened at ${site.id}`, `${snap.rule.reason}. Score ${snap.score}/100 — awaiting a coordinator.`, `/app/signals/${id}`);
    }
  }
}

function closeSignal(d: Domain, sigId: string | undefined, actor: string, note: string) {
  const s = d.signals.find((x) => x.id === sigId);
  if (!s || !ACTIVE.includes(s.status)) return;
  s.status = 'closed'; s.closedAt = d.now; s.decisions.push({ at: d.now, actor, kind: 'close', note });
}
function finishAdvisory(d: Domain, a: Advisory, status: 'resolved' | 'expired' | 'withdrawn', reason: string, actor: string) {
  a.status = status; a.closedAt = d.now; a.closeReason = reason;
  closeSignal(d, a.signalId, actor, reason);
  audit(d, actor, `Advisory ${status}`, a.id, `${a.siteId} · ${reason}`, actor === ENGINE ? 'system' : 'human');
  notice(d, 'advisory', `${a.id} ${status} at ${a.siteId}`, reason, `/app/advisories/${a.id}`);
}
function lifecycle(d: Domain) {
  for (const l of d.looks) if ((l.status === 'queued' || l.status === 'accepted') && d.now > l.dueAt) { l.status = 'expired'; audit(d, ENGINE, 'Look request expired', l.id, `${l.siteId} · no answer in 24 h`, 'system'); }
  for (const a of d.advisories) if (a.status === 'live' && d.now >= a.validUntil) finishAdvisory(d, a, 'expired', 'Validity window ended', ENGINE);
}
function settle(d: Domain) { runCycles(d); fuseAll(d); lifecycle(d); }

function escalate(d: Domain, s: Signal, actor: string) {
  const site = SITE[s.siteId], city = CITY[site.cityId];
  const adv = d.advisories.find((a) => a.id === s.advisoryId);
  const id = nid(d, 'fhir', 'FHIR', 3);
  const bundle = buildBundle({ id, site, city, hazard: s.hazard, observations: signalObs(d, s), snap: s.snapshot, advisory: adv, actor, now: d.now });
  const validation = validateBundle(bundle);
  d.bundles.unshift({ id, siteId: s.siteId, signalId: s.id, advisoryId: adv?.id, target: city.health, endpoint: DEFAULT_ENDPOINT, createdAt: d.now, createdBy: actor, status: 'queued', bundle, validation, hash: sha256(JSON.stringify(bundle)), resourceCount: bundle.entry.length });
  s.escalatedAt = d.now; s.decisions.push({ at: d.now, actor, kind: 'escalate', note: `${id} → ${city.health}` });
  audit(d, actor, 'Escalated to health liaison', id, `${bundle.entry.length} FHIR resources · ${validation.errors.length} errors`);
  notice(d, 'fhir', `${id} queued`, `${s.siteId} One Health bundle for ${city.health}.`, `/app/fhir/${id}`);
  return id;
}

// ── reducer ──
function apply(d: Domain, a: Action): void {
  switch (a.type) {
    case 'advance': {
      let t = d.now;
      while (t < a.to) {
        const next = minIso(addH(t, 1), a.to);
        while (d.cursor < SCRIPT.length && SCRIPT[d.cursor].at <= next) {
          const s = SCRIPT[d.cursor++];
          if (s.golden && !d.autopilot) continue;
          if (s.at > d.now) d.now = s.at;
          const act = s.run(d);
          if (act) { apply(d, act); settle(d); }
        }
        d.now = next; settle(d); t = next;
      }
      return;
    }
    case 'observation/submit': {
      const i = a.input, id = nid(d, 'obs', 'OB');
      d.observations.unshift({ ...i, id, createdAt: d.now, status: i.signs.length ? 'pending' : 'context' });
      const who = i.displayName ? `${i.displayName} · ${i.deviceId}` : i.deviceId;
      audit(d, who, i.source === 'mission' ? 'Field verification submitted' : 'Sentinel report submitted', id, `${i.siteId} · ${i.signs.map((s) => SIGNS[s].tag).join(', ') || 'feeling only'}`, 'report');
      notice(d, 'report', `New ${i.source === 'mission' ? 'verified' : 'sentinel'} report at ${i.siteId}`, i.signs.map((s) => SIGNS[s].en).join(' · ') || 'Wellbeing context only', `/app/observations/${id}`);
      d.lastCreated = id;
      return;
    }
    case 'observation/discard': {
      const o = d.observations.find((x) => x.id === a.id);
      if (!o) return;
      const sig = d.signals.find((s) => s.id === o.signalId);
      o.status = 'discarded'; o.statusNote = a.reason;
      audit(d, a.actor, 'Report marked false positive', o.id, a.reason);
      if (sig && ACTIVE.includes(sig.status)) {
        sig.observationIds = sig.observationIds.filter((x) => x !== o.id);
        if (!signalObs(d, sig).length) { sig.status = 'dismissed'; sig.closedAt = d.now; sig.decisions.push({ at: d.now, actor: a.actor, kind: 'dismiss', note: 'All reports discarded' }); }
        else refresh(d, sig, true);
      }
      return;
    }
    case 'signal/dismiss': {
      const s = d.signals.find((x) => x.id === a.id);
      if (!s || !ACTIVE.includes(s.status)) return;
      s.status = 'dismissed'; s.closedAt = d.now; s.decisions.push({ at: d.now, actor: a.actor, kind: 'dismiss', note: a.reason });
      d.advisories.filter((x) => x.signalId === s.id && x.status === 'draft').forEach((x) => { x.status = 'withdrawn'; x.closedAt = d.now; x.closeReason = 'Signal dismissed'; });
      audit(d, a.actor, 'Signal dismissed', s.id, a.reason);
      return;
    }
    case 'signal/escalate': {
      const s = d.signals.find((x) => x.id === a.id);
      if (s) d.lastCreated = escalate(d, s, a.actor);
      return;
    }
    case 'look/request': {
      const id = nid(d, 'look', 'LR', 3), person = PEOPLE[a.assignee];
      d.looks.unshift({ id, siteId: a.siteId, hazard: a.hazard, signalId: a.signalId, advisoryId: a.advisoryId, purpose: a.purpose, assignee: a.assignee, createdBy: a.actor, createdAt: d.now, dueAt: resolveDue(d, a.purpose, a.advisoryId), note: a.note, checklist: CHECKLIST[a.hazard], status: 'queued' });
      const s = d.signals.find((x) => x.id === a.signalId);
      if (s) { if (s.status === 'open') s.status = 'look_requested'; s.decisions.push({ at: d.now, actor: a.actor, kind: 'request_look', note: `${id} → ${person?.name ?? a.assignee}` }); }
      audit(d, a.actor, a.purpose === 'resolve' ? 'Resolution check requested' : 'Look request dispatched', id, `${a.siteId} → ${person?.name ?? a.assignee} · due in 24 h`);
      d.lastCreated = id;
      return;
    }
    case 'look/accept': {
      const l = d.looks.find((x) => x.id === a.id);
      if (!l || l.status !== 'queued') return;
      l.status = 'accepted'; l.acceptedAt = d.now;
      audit(d, PEOPLE[l.assignee]?.name ?? l.assignee, 'Look request accepted', l.id, l.siteId);
      return;
    }
    case 'look/respond': {
      const l = d.looks.find((x) => x.id === a.id);
      if (!l || l.status === 'completed' || l.status === 'expired') return;
      const person = PEOPLE[l.assignee];
      l.status = 'completed';
      l.response = { at: d.now, result: a.result, observed: a.observed, notes: a.notes, photo: a.photo };
      const label = { signs_present: 'Signs present', no_signs: 'No signs', no_access: 'Could not access' }[a.result];
      audit(d, person?.name ?? l.assignee, 'Look request answered', l.id, `${l.siteId} · ${label}`);
      notice(d, 'look', `${l.id} answered: ${label}`, `${person?.name} at ${l.siteId}`, `/app/verification/${l.id}`);
      if (a.result === 'signs_present' && a.observed.length) {
        apply(d, { type: 'observation/submit', input: { siteId: l.siteId, deviceId: `vol-${l.assignee}`, displayName: person?.name, role: 'citizen_scientist', verified: true, lookId: l.id, signs: a.observed, note: a.notes, photo: a.photo, source: 'mission' } });
      }
      const adv = d.advisories.find((x) => x.id === l.advisoryId);
      if (l.purpose === 'resolve' && adv?.status === 'live' && a.result === 'no_signs' && adv.publishedAt) {
        const eligible = hoursBetween(d.now, adv.publishedAt) >= RULES.resolution.minHours;
        if (eligible && !adv.clearChecks.some((c) => c.by === l.assignee)) { adv.clearChecks.push({ lookId: l.id, by: l.assignee, at: d.now }); l.response.counted = true; }
        if (adv.clearChecks.length >= RULES.resolution.checks) finishAdvisory(d, adv, 'resolved', 'Two independent “no signs” checks, 24 h or more after publication', ENGINE);
      }
      return;
    }
    case 'advisory/draft': {
      const s = d.signals.find((x) => x.id === a.signalId);
      if (!s) return;
      const existing = d.advisories.find((x) => x.signalId === s.id && x.status === 'draft');
      if (existing) { d.lastCreated = existing.id; return; }
      const site = SITE[s.siteId], langs: Lang[] = CITY[site.cityId].lang === 'pt' ? ['en', 'pt'] : ['en'];
      const validUntil = defaultValidity(d.now, RULES.advisory.validityHours);
      const text = draftText(site, s.hazard, validUntil, uniq(signalObs(d, s).flatMap((o) => o.signs)), langs);
      const id = nid(d, 'adv', 'ADV');
      d.advisories.unshift({ id, siteId: s.siteId, hazard: s.hazard, signalId: s.id, langs, text, draft: { by: DRAFTER, at: d.now, text: { ...text } }, edited: false, status: 'draft', createdAt: d.now, createdBy: a.actor, validUntil, ruleVersion: RULES.version, clearChecks: [] });
      s.advisoryId = id; s.decisions.push({ at: d.now, actor: a.actor, kind: 'draft', note: id });
      audit(d, a.actor, 'Advisory draft generated', id, `${s.siteId} · ${DRAFTER} · ${langs.join('/').toUpperCase()}`);
      d.lastCreated = id;
      return;
    }
    case 'advisory/create': {
      const id = nid(d, 'adv', 'ADV');
      d.advisories.unshift({ id, siteId: a.siteId, hazard: a.hazard, signalId: a.signalId, langs: a.langs, text: a.text, edited: true, status: 'draft', createdAt: d.now, createdBy: a.actor, validUntil: a.validUntil, ruleVersion: RULES.version, clearChecks: [] });
      const s = d.signals.find((x) => x.id === a.signalId);
      if (s) { s.advisoryId = id; s.decisions.push({ at: d.now, actor: a.actor, kind: 'draft', note: `${id} (staff-written)` }); }
      audit(d, a.actor, 'Advisory written by staff', id, a.siteId);
      d.lastCreated = id;
      return;
    }
    case 'advisory/edit': {
      const x = d.advisories.find((v) => v.id === a.id);
      if (!x || x.status !== 'draft') return;
      if (a.text) x.text = { ...x.text, ...a.text };
      if (a.validUntil) x.validUntil = a.validUntil;
      x.edited = !x.draft || x.langs.some((l) => (x.text[l] ?? '') !== (x.draft!.text[l] ?? ''));
      return;
    }
    case 'advisory/publish': {
      const x = d.advisories.find((v) => v.id === a.id);
      if (!x || x.status !== 'draft') return;
      d.advisories.filter((v) => v.siteId === x.siteId && v.hazard === x.hazard && v.status === 'live').forEach((v) => finishAdvisory(d, v, 'withdrawn', `Superseded by ${x.id}`, a.actor));
      x.status = 'live'; x.publishedAt = d.now; x.approvedBy = a.actor;
      x.auditHash = sha256(JSON.stringify({ id: x.id, text: x.text, validUntil: x.validUntil, approvedBy: a.actor, at: d.now, rules: RULES.sha }));
      const s = d.signals.find((v) => v.id === x.signalId);
      if (s) { s.status = 'advisory'; s.closedAt = undefined; s.advisoryId = x.id; s.decisions.push({ at: d.now, actor: a.actor, kind: 'approve', note: x.id }); }
      audit(d, a.actor, 'Advisory approved and published', x.id, `${x.siteId} · ${x.edited ? 'staff-edited' : 'unedited draft'} · audit ${x.auditHash.slice(0, 10)}`);
      notice(d, 'advisory', `${x.id} live at ${x.siteId}`, `Valid until ${fmtDay(x.validUntil, tzOf(SITE[x.siteId]))}.`, `/app/advisories/${x.id}`);
      if (a.escalate && s) escalate(d, s, a.actor);
      d.lastCreated = x.id;
      return;
    }
    case 'advisory/withdraw': {
      const x = d.advisories.find((v) => v.id === a.id);
      if (x?.status === 'live') finishAdvisory(d, x, 'withdrawn', a.reason, a.actor);
      else if (x?.status === 'draft') {
        x.status = 'withdrawn'; x.closedAt = d.now; x.closeReason = a.reason;
        const sg = d.signals.find((v) => v.id === x.signalId);
        if (sg) { if (sg.advisoryId === x.id) sg.advisoryId = undefined; sg.decisions.push({ at: d.now, actor: a.actor, kind: 'withdraw', note: x.id + ' draft discarded' }); }
        audit(d, a.actor, 'Advisory draft discarded', x.id, a.reason);
      }
      return;
    }
    case 'bundle/status': {
      const b = d.bundles.find((v) => v.id === a.id);
      if (!b) return;
      b.status = a.status; if (a.http !== undefined) b.http = a.http; if (a.receipt) b.receipt = a.receipt; b.error = a.error;
      if (a.status === 'sent') { b.sentAt = d.now; audit(d, ENGINE, 'FHIR bundle delivered', b.id, `${b.target} · HTTP ${a.http ?? '—'}`, 'system'); }
      if (a.status === 'failed') audit(d, ENGINE, 'FHIR delivery failed', b.id, a.error ?? 'unknown error', 'system');
      return;
    }
    case 'notices/read': {
      d.notices.forEach((n) => { if (!a.id || n.id === a.id) n.read = true; });
      return;
    }
  }
}

export function reduce(prev: Domain, action: Action): Domain {
  const d = structuredClone(prev);
  d.lastCreated = undefined;
  apply(d, action);
  settle(d);
  return d;
}

// ── scenario script: background activity in all five cities + the Coimbra golden path (autopilot only) ──
const at = (tz: string, s: string) => { const [date, hm] = s.split(' '); const [h, m] = hm.split(':').map(Number); return zonedToUtc(date, h, m, tz); };
const L = (s: string) => at('Europe/Lisbon', s), G = (s: string) => at('Europe/Brussels', s), F = (s: string) => at('Europe/Paris', s), O = (s: string) => at('Europe/Oslo', s), I = (s: string) => at('Europe/Rome', s);
const walker = (siteId: string, deviceId: string, displayName: string | undefined, signs: SignCode[], extra: Partial<ObservationInput> = {}): Action =>
  ({ type: 'observation/submit', input: { siteId, deviceId, displayName, role: 'walker', signs, source: 'pwa', ...extra } });
const findLook = (d: Domain, siteId: string, assignee: string, purpose: 'verify' | 'resolve') =>
  d.looks.find((l) => l.siteId === siteId && l.assignee === assignee && l.purpose === purpose && (l.status === 'queued' || l.status === 'accepted'));
const liveAdv = (d: Domain, siteId: string) => d.advisories.find((x) => x.siteId === siteId && x.status === 'live');

interface Step { at: string; golden?: boolean; run: (d: Domain) => Action | null }
const RAW: Step[] = [
  // Ghent — storm overflow, advisory already live by Day 2
  { at: G('2026-09-24 09:40'), run: () => walker('GNT-07', 'anon-3c71', 'Lotte', ['sewage_odour', 'grey_milky']) },
  { at: G('2026-09-24 10:05'), run: () => walker('GNT-07', 'anon-a4d2', 'Wout', ['foam', 'sanitary_litter']) },
  { at: G('2026-09-24 10:38'), run: (d) => ({ type: 'advisory/create', siteId: 'GNT-07', hazard: 'H2', signalId: activeSignal(d, 'GNT-07', 'H2')?.id, langs: ['en', 'nl'], validUntil: G('2026-09-27 18:00'), actor: 'Pieter Claes',
      text: { en: 'Avoid water contact at the Lieve (GNT-07) until Sunday 18:00. Heavy rain can carry sewage into the canal. Walkers reported a sewage smell and sanitary litter today. Keep dogs out of the water and wash hands after visits. This is a precaution, not a test result.',
              nl: 'Vermijd contact met het water aan de Lieve (GNT-07) tot zondag 18:00. Hevige regen kan rioolwater in de vaart brengen. Wandelaars meldden vandaag een rioolgeur en sanitair afval. Houd honden uit het water en was je handen na een bezoek. Dit is een voorzorg, geen testresultaat.' } }) },
  { at: G('2026-09-24 10:52'), run: (d) => { const x = d.advisories.find((v) => v.siteId === 'GNT-07' && v.status === 'draft'); return x ? { type: 'advisory/publish', id: x.id, actor: 'Pieter Claes', escalate: true } : null; } },
  { at: G('2026-09-24 10:53'), run: (d) => { const b = d.bundles.find((v) => v.siteId === 'GNT-07' && v.status === 'queued'); return b ? { type: 'bundle/status', id: b.id, status: 'sent', http: 201, receipt: 'Replay history (synthetic) — recorded as delivered' } : null; } },
  { at: G('2026-09-25 08:15'), run: (d) => { const x = liveAdv(d, 'GNT-07'); return x ? { type: 'look/request', siteId: 'GNT-07', hazard: 'H2', purpose: 'resolve', assignee: 'sara', actor: 'Pieter Claes', advisoryId: x.id, signalId: x.signalId, note: 'Resolution check: outfall and banks below the overflow.' } : null; } },
  { at: G('2026-09-25 11:30'), run: (d) => { const l = findLook(d, 'GNT-07', 'sara', 'resolve'); return l ? { type: 'look/respond', id: l.id, result: 'no_signs', observed: [], notes: 'Water clearer, no smell at the outfall.' } : null; } },
  { at: G('2026-09-25 15:40'), run: () => walker('GNT-07', 'anon-e913', undefined, ['sewage_odour']) },
  // Toulouse — heat Watch, single strong report, look in progress
  { at: F('2026-09-25 09:05'), run: () => walker('TSL-04', 'anon-71be', 'Camille', ['bird_sick', 'blue_green']) },
  { at: F('2026-09-25 09:34'), run: (d) => { const s = activeSignal(d, 'TSL-04', 'H1'); return s ? { type: 'look/request', siteId: 'TSL-04', hazard: 'H1', purpose: 'verify', assignee: 'jean', actor: 'Élise Martin', signalId: s.id, note: 'Biofilm swab and waterbird count at the footbridge.' } : null; } },
  { at: F('2026-09-25 11:15'), run: (d) => { const l = findLook(d, 'TSL-04', 'jean', 'verify'); return l ? { type: 'look/accept', id: l.id } : null; } },
  // Oslo, Benevento, Coimbra background
  { at: O('2026-09-24 17:20'), run: () => walker('OSL-03', 'anon-0d19', undefined, ['foam']) },
  { at: L('2026-09-24 18:30'), run: () => walker('COI-01', 'anon-2b44', undefined, [], { feeling: 'serenity' }) },
  { at: I('2026-09-25 10:10'), run: () => walker('BNV-02', 'anon-66fa', undefined, ['oily_sheen'], { feeling: 'anger' }) },
  { at: L('2026-09-25 14:20'), run: () => walker('COI-03', 'anon-5e03', 'Rui', ['floating_scum'], { feeling: 'fear' }) },
  // Coimbra golden path — the presenter does these live unless autopilot is on
  { at: L('2026-09-25 14:05'), golden: true, run: () => walker('COI-03', 'anon-8f92', 'Ana', ['dark_mats', 'dog_unwell'], { animal: { species: 'dog', name: 'Bolota', symptoms: ['drooling', 'tremors'], onset: 'lt2h' } }) },
  { at: L('2026-09-25 14:32'), golden: true, run: (d) => { const s = activeSignal(d, 'COI-03', 'H1'); return s ? { type: 'look/request', siteId: 'COI-03', hazard: 'H1', purpose: 'verify', assignee: 'tiago', actor: 'Sofia Silva', signalId: s.id, note: 'Check stones below the weir for mats; count dead fish in the pool.' } : null; } },
  { at: L('2026-09-25 14:41'), golden: true, run: (d) => { const l = findLook(d, 'COI-03', 'tiago', 'verify'); return l ? { type: 'look/accept', id: l.id } : null; } },
  { at: L('2026-09-25 15:10'), golden: true, run: (d) => { const l = findLook(d, 'COI-03', 'tiago', 'verify'); return l ? { type: 'look/respond', id: l.id, result: 'signs_present', observed: ['dark_mats', 'dead_fish_2_10', 'low_stagnant'], notes: 'Thick mats on stones in the unshaded stretch; three dead trout in the pool below the weir.' } : null; } },
  { at: L('2026-09-25 15:18'), golden: true, run: (d) => { const s = activeSignal(d, 'COI-03', 'H1'); return s ? { type: 'advisory/draft', signalId: s.id, actor: 'Sofia Silva' } : null; } },
  { at: L('2026-09-25 15:23'), golden: true, run: (d) => { const x = d.advisories.find((v) => v.siteId === 'COI-03' && v.status === 'draft'); return x ? { type: 'advisory/edit', id: x.id, text: { en: `${x.text.en} Please report what you see.`, pt: `${x.text.pt} Comunique o que vir.` } } : null; } },
  { at: L('2026-09-25 15:25'), golden: true, run: (d) => { const x = d.advisories.find((v) => v.siteId === 'COI-03' && v.status === 'draft'); return x ? { type: 'advisory/publish', id: x.id, actor: 'Sofia Silva', escalate: true } : null; } },
  { at: L('2026-09-25 15:31'), golden: true, run: (d) => { const x = liveAdv(d, 'COI-03'); return x ? { type: 'look/request', siteId: 'COI-03', hazard: 'H1', purpose: 'resolve', assignee: 'tiago', actor: 'Sofia Silva', advisoryId: x.id, signalId: x.signalId, note: 'Resolution check after 24 h.' } : null; } },
  { at: L('2026-09-25 15:32'), golden: true, run: (d) => { const x = liveAdv(d, 'COI-03'); return x ? { type: 'look/request', siteId: 'COI-03', hazard: 'H1', purpose: 'resolve', assignee: 'marta', actor: 'Sofia Silva', advisoryId: x.id, signalId: x.signalId, note: 'Independent resolution check after 24 h.' } : null; } },
  { at: L('2026-09-26 16:30'), golden: true, run: (d) => { const l = findLook(d, 'COI-03', 'tiago', 'resolve'); return l ? { type: 'look/respond', id: l.id, result: 'no_signs', observed: [], notes: 'Mats gone from the stones after the evening breeze; no dead fish.' } : null; } },
  { at: L('2026-09-27 09:10'), golden: true, run: (d) => { const l = findLook(d, 'COI-03', 'marta', 'resolve'); return l ? { type: 'look/respond', id: l.id, result: 'no_signs', observed: [], notes: 'No mats or scum; water still low.' } : null; } },
];
export const SCRIPT: Step[] = RAW.slice().sort((a, b) => a.at.localeCompare(b.at));

export const PRESETS = [
  { id: 'day1', label: 'Day 1 · 08:10', title: 'Watch windows open', at: L('2026-09-24 08:10'), autopilot: false },
  { id: 'day2', label: 'Day 2 · 14:00', title: 'Ana arrives at COI-03 (live demo)', at: L('2026-09-25 14:00'), autopilot: false },
  { id: 'day2b', label: 'Day 2 · 15:40', title: 'Advisory live (autopilot)', at: L('2026-09-25 15:40'), autopilot: true },
  { id: 'day3', label: 'Day 3 · 16:00', title: 'Resolution checks due', at: L('2026-09-26 16:00'), autopilot: true },
  { id: 'day4', label: 'Day 4 · 17:00', title: 'Resolved · season ledger', at: L('2026-09-27 17:00'), autopilot: true },
] as const;
export type PresetId = (typeof PRESETS)[number]['id'];

export function buildScenario(presetId: string = 'day2'): Domain {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[1];
  const d: Domain = {
    start: SCENARIO_START, now: SCENARIO_START, preset: p.id, autopilot: p.autopilot, cursor: 0, lastCycle: null,
    seq: { obs: 79, sig: 0, look: 100, adv: 0, fhir: 900, evt: 0, ntc: 0 },
    watches: [], observations: [], signals: [], looks: [], advisories: [], bundles: [], audit: [], notices: [],
  };
  d.observations.push({ id: 'OB-41', siteId: 'COI-01', createdAt: L('2026-08-12 09:15'), deviceId: 'anon-8f92', displayName: 'Ana', role: 'walker', signs: ['low_stagnant'], source: 'pwa', status: 'archived', statusNote: 'Checked by a volunteer on 13 Aug — no signs' });
  settle(d);
  apply(d, { type: 'advance', to: p.at });
  settle(d);
  d.notices.forEach((n) => { if (n.at < addH(d.now, -6)) n.read = true; });
  return d;
}

/** A resolution check is due 24 h after it can first count (24 h after publication) — never before it could count. */
function resolveDue(d: Domain, purpose: 'verify' | 'resolve', advisoryId?: string) {
  const pub = purpose === 'resolve' ? d.advisories.find((v) => v.id === advisoryId)?.publishedAt : undefined;
  const from = pub ? addH(pub, RULES.resolution.minHours) : d.now;
  return addH(from > d.now ? from : d.now, 24);
}
