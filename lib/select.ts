import type { Advisory, Domain, HazardId, Signal, Site, TierId, Watch } from './types';
import { HZ, PEOPLE, SITE, SITES, SIGNS } from './catalog';
import { watchToday } from './engine';
import { ACTIVE, openWatch } from './sim';
import { fmtSpan, hoursBetween, localDate } from './utils';

export const personName = (id: string) => PEOPLE[id]?.name ?? id;
export { signalObs, activeSignal, openWatch, ACTIVE } from './sim';

export interface SiteStatus { site: Site; tier: TierId; hazard: HazardId; score: number; watch?: Watch; signal?: Signal; advisory?: Advisory }

export function siteStatus(d: Domain, site: Site): SiteStatus {
  const advisory = d.advisories.find((a) => a.siteId === site.id && a.status === 'live');
  const signal = d.signals.find((s) => s.siteId === site.id && ACTIVE.includes(s.status));
  const watch = openWatch(d, site.id);
  const resolved = d.advisories.find((a) => a.siteId === site.id && a.status === 'resolved' && a.closedAt && hoursBetween(d.now, a.closedAt) < 24);
  const scores = HZ.map((hz) => ({ hz, s: watchToday(site, hz, d.now).score }));
  const best = scores.reduce((m, x) => (x.s > m.s ? x : m), scores[0]);
  const hazard = advisory?.hazard ?? signal?.hazard ?? watch?.hazard ?? best.hz;
  const tier: TierId = advisory ? 'advisory' : signal && signal.status !== 'advisory' ? 'signal' : watch ? 'watch' : resolved ? 'resolved' : 'quiet';
  return { site, tier, hazard, score: watchToday(site, hazard, d.now).score, watch, signal, advisory };
}
export const siteTier = (d: Domain, siteId: string) => siteStatus(d, SITE[siteId]).tier;
export const allStatuses = (d: Domain) => SITES.map((s) => siteStatus(d, s));

export function counts(d: Domain) {
  const today = localDate(d.now, 'Europe/Lisbon');
  return {
    watches: d.watches.filter((w) => !w.closedAt).length,
    review: d.signals.filter((s) => s.status === 'open').length,
    activeSignals: d.signals.filter((s) => ACTIVE.includes(s.status)).length,
    live: d.advisories.filter((a) => a.status === 'live').length,
    drafts: d.advisories.filter((a) => a.status === 'draft').length,
    pendingObs: d.observations.filter((o) => o.status === 'pending').length,
    reportsToday: d.observations.filter((o) => localDate(o.createdAt, 'Europe/Lisbon') === today).length,
    looksOpen: d.looks.filter((l) => l.status === 'queued' || l.status === 'accepted').length,
    bundlesQueued: d.bundles.filter((b) => b.status === 'queued' || b.status === 'failed').length,
    unread: d.notices.filter((n) => !n.read).length,
  };
}
export type Counts = ReturnType<typeof counts>;

export interface Priority { key: string; title: string; meta: string; href: string; tier: TierId }
export function priorities(d: Domain): Priority[] {
  const out: Priority[] = [];
  d.signals.filter((s) => s.status === 'open').sort((a, b) => b.snapshot.score - a.snapshot.score).forEach((s) =>
    out.push({ key: s.id, title: `Review ${s.siteId} signal`, meta: `${s.snapshot.evidence.reporters} reporter${s.snapshot.evidence.reporters > 1 ? 's' : ''} · ${s.snapshot.evidence.categories.length} sign type${s.snapshot.evidence.categories.length > 1 ? 's' : ''} · score ${s.snapshot.score}${s.snapshot.gate ? ' · advisory gate met' : ''}`, href: `/app/signals/${s.id}`, tier: 'signal' }));
  d.signals.filter((s) => s.status === 'look_requested').forEach((s) => {
    const done = d.looks.find((l) => l.signalId === s.id && l.status === 'completed' && l.purpose === 'verify');
    if (done) out.push({ key: `v-${s.id}`, title: `Verification returned at ${s.siteId}`, meta: `${done.id} · ${personName(done.assignee)} · score now ${s.snapshot.score}${s.snapshot.gate ? ' · gate met' : ''}`, href: `/app/signals/${s.id}`, tier: 'signal' });
  });
  d.advisories.filter((a) => a.status === 'draft').forEach((a) => out.push({ key: a.id, title: `Finish advisory draft ${a.id}`, meta: `${a.siteId} · ${a.edited ? 'staff edits in progress' : 'unedited draft'} · human approval required`, href: `/app/advisories/${a.id}`, tier: 'advisory' }));
  d.bundles.filter((b) => b.status === 'queued' || b.status === 'failed').forEach((b) => out.push({ key: b.id, title: `${b.status === 'failed' ? 'Retry' : 'Send'} FHIR bundle ${b.id}`, meta: `${b.resourceCount} resources → ${b.target}`, href: `/app/fhir/${b.id}`, tier: 'advisory' }));
  d.looks.filter((l) => l.status === 'queued' || l.status === 'accepted').forEach((l) => out.push({ key: l.id, title: `${l.purpose === 'resolve' ? 'Resolution check' : 'Field look'} ${l.id} at ${l.siteId}`, meta: `${personName(l.assignee)} · ${l.status === 'accepted' ? 'in progress' : 'queued'} · due in ${fmtSpan(hoursBetween(l.dueAt, d.now))}`, href: `/app/verification/${l.id}`, tier: 'watch' }));
  d.observations.filter((o) => o.status === 'pending').forEach((o) => out.push({ key: o.id, title: `Corroborate ${o.id} at ${o.siteId}`, meta: `${o.signs.map((s) => SIGNS[s].tag).join(', ')} · single report`, href: `/app/observations/${o.id}`, tier: 'quiet' }));
  return out;
}

export const feed = (d: Domain, n = 10) => [...d.audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, n);
