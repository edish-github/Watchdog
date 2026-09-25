'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, Camera, Dog, History, Inbox, Radar, Scale, Siren } from 'lucide-react';
import type { Observation } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useActorName } from '@/lib/hooks';
import { openWatch } from '@/lib/select';
import { CATEGORY, CITY, FEELINGS, HAZARDS, PEOPLE, SIGNS, SITE, SYMPTOMS } from '@/lib/catalog';
import { RULES, hazardFor, obsWeight, snapshot } from '@/lib/engine';
import { cn, fmtWhen, hoursBetween } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, KV, type ActionItem } from '@/components/ui';
import { SIGN_ICON } from '@/components/icons';
import { toast } from '@/components/toast';
import { DetailHeader, StatusPill } from '@/components/console/kit';
import { PhotoView } from '@/components/console/photo-view';
import { ReasonModal } from '@/components/console/reason-modal';
import { RequestLookModal } from '@/components/console/request-look';

export default function ObservationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const d = useWD((s) => s.d);
  const o = d.observations.find((x) => x.id === (id ?? '').toUpperCase());
  if (!o) return <Card><Empty icon={Inbox} title="Report not found" body="It may have been erased at the reporter’s request, or belong to another replay scenario." action={<Link href="/app/observations" className="btn btn-primary btn-sm">Observation inbox</Link>} /></Card>;
  return <ObservationDetail o={o} />;
}

function ObservationDetail({ o }: { o: Observation }) {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const actor = useActorName();
  const [discard, setDiscard] = useState(false);
  const [look, setLook] = useState(false);
  const site = SITE[o.siteId], city = CITY[site.cityId];
  const w = obsWeight(o);
  const pref = openWatch(d, o.siteId)?.hazard;
  const hz = hazardFor(o, pref) ?? pref ?? 'H1';
  const sig = o.signalId ? d.signals.find((s) => s.id === o.signalId) : undefined;
  const group = o.status === 'pending' ? d.observations.filter((x) => x.siteId === o.siteId && x.status === 'pending' && hazardFor(x, pref) === hz) : [];
  const pendingSnap = o.status === 'pending' ? snapshot(site, hz, group, d.now, !!openWatch(d, o.siteId, hz)) : undefined;
  const others = d.observations.filter((x) => x.siteId === o.siteId && x.id !== o.id && Math.abs(hoursBetween(x.createdAt, o.createdAt)) <= 72).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sameDevice = d.observations.filter((x) => x.deviceId === o.deviceId).length;
  const trail = d.audit.filter((e) => e.target === o.id || (e.detail ?? '').includes(o.id)).sort((a, b) => b.at.localeCompare(a.at));
  const lookReq = o.lookId ? d.looks.find((l) => l.id === o.lookId) : undefined;
  const rows = o.signs.map((s) => ({ s, w: s === 'dog_unwell' ? (o.animal?.onset === 'lt2h' ? RULES.fusion.dogAcute : RULES.fusion.dogLate) : SIGNS[s].w }));
  const combined = 1 - rows.reduce((k, r) => k * (1 - r.w), 1);
  const mult = o.verified ? RULES.roles.verified : RULES.roles[o.role];
  const acute = o.animal?.onset === 'lt2h';
  const trust = o.verified ? 'Verified field finding' : o.role === 'citizen_scientist' ? 'Citizen scientist' : 'Walker (unverified)';

  const decide = (reason: string) => {
    useWD.getState().dispatch({ type: 'observation/discard', id: o.id, reason, actor });
    toast(`${o.id} marked false positive`, sig ? `Removed from ${sig.id}; the signal was re-scored.` : 'Logged to the audit trail.', 'info');
  };
  const actions: ActionItem[] =
    o.status === 'fused' && sig ? [
      { key: 'sig', tier: 'signal', href: `/app/signals/${sig.id}`, title: `Open ${sig.id} and the Why drawer`, meta: `Fused by rule: ${sig.openReason} · score ${sig.snapshot.score}` },
      { key: 'look', tier: 'watch', onClick: () => setLook(true), title: 'Dispatch a verification look', meta: `Checklist for ${HAZARDS[sig.hazard].name}` },
      { key: 'fp', onClick: () => setDiscard(true), title: 'Mark as false positive', meta: 'Removes it from the signal · written rationale required' },
    ] : o.status === 'pending' ? [
      { key: 'look', tier: 'watch', onClick: () => setLook(true), title: 'Request a look to corroborate', meta: 'A verified finding fuses with this report automatically' },
      { key: 'fp', onClick: () => setDiscard(true), title: 'Mark as false positive', meta: 'Written rationale required' },
    ] : [];

  return (
    <>
      <DetailHeader back="/app/observations" backLabel="Observations" eyebrow={`Report detail · ${fmtWhen(o.createdAt, tz)}`} title={o.id}
        sub={<>{o.displayName ?? 'Anonymous reporter'} · device <span className="mono">{o.deviceId}</span> (pseudonymous · {sameDevice} report{sameDevice === 1 ? '' : 's'}) · <Link href={`/app/sites/${site.id}`} className="font-bold text-plum hover:underline">{site.id}</Link> {site.stream}, {city.name}</>}
        badges={<><StatusPill kind="obs" status={o.status} /><span className="chip">{trust}</span><span className="chip">{o.source === 'mission' ? `Mission ${o.lookId}` : 'Public app'}</span>{o.photo && <span className="chip"><Camera className="h-3 w-3" />Photo</span>}</>}
        actions={<Link href={`/observe/sites/${site.id}`} target="_blank" className="btn btn-outline"><ArrowUpRight className="h-4 w-4" />Public site</Link>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-7">
          <Card>
            <CardHead title="Reported signs" icon={Inbox} sub={o.signs.length ? `${o.signs.length} sign${o.signs.length > 1 ? 's' : ''} · ${w.categories.length} categor${w.categories.length > 1 ? 'ies' : 'y'}` : 'No signs — wellbeing context only'} />
            <ul className="grid gap-2 p-5 sm:grid-cols-2">
              {o.signs.map((s) => { const I = SIGN_ICON[s]; return (
                <li key={s} className="flex items-start gap-3 rounded-2xl border border-line p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sand text-ink-2"><I className="h-4 w-4" /></span>
                  <span className="min-w-0"><span className="block text-sm font-bold text-ink">{SIGNS[s].en}</span><span className="block text-xs text-ink-3">{CATEGORY[SIGNS[s].cat].en} · {SIGNS[s].hz.join(' / ')}</span></span>
                </li>
              ); })}
              {o.feeling && <li className="flex items-center gap-3 rounded-2xl bg-plum-soft/50 p-3 text-sm sm:col-span-2"><span className="text-2xl">{FEELINGS[o.feeling].emoji}</span><span><b className="text-ink">Feeling: {FEELINGS[o.feeling].en}</b><span className="block text-xs text-ink-2">OAH perception item · wellbeing context, never scored</span></span></li>}
            </ul>
            {o.note && <p className="mx-5 mb-5 rounded-2xl bg-sand/60 p-3 text-sm italic text-ink">“{o.note}”</p>}
          </Card>

          {o.animal && (
            <Card>
              <CardHead title="Companion-animal triage" icon={Dog} action={acute ? <span className="chip !border-[#EDB7C0] !bg-[#F7DCE0] !text-[#A11C3A]">High · acute</span> : <span className="chip">Delayed onset</span>} />
              <KV rows={[
                ['Animal', `Dog${o.animal.name ? ` · ${o.animal.name}` : ''}`],
                ['Onset after water contact', acute ? 'Under 2 hours' : 'Over 2 hours'],
                ['Owner-observed signs', o.animal.symptoms.map((s) => SYMPTOMS[s].en).join(', ') || 'None listed'],
                ['Vet guidance shown to owner', acute ? 'Yes — “Contact a vet now”, before the thank-you screen' : 'Yes — call a vet if it gets worse'],
                ['Evidence weight of this sign', (acute ? RULES.fusion.dogAcute : RULES.fusion.dogLate).toFixed(2)],
              ]} />
              <p className="flex gap-2 border-t border-line px-5 py-3 text-xs text-ink-2"><Siren className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#A11C3A]" />Owner report, not a diagnosis. Drooling and tremors appear in published dog cases near benthic mats (Toxicon 2005); only a vet or laboratory can confirm exposure.</p>
            </Card>
          )}

          {o.photo && (
            <Card>
              <CardHead title="Field photo evidence inspector" icon={Camera} />
              <div className="p-5"><PhotoView photo={o.photo} /></div>
            </Card>
          )}

          <Card>
            <CardHead title="Other reports at this site · ±72 h" icon={History} />
            {others.length ? (
              <ul className="divide-y divide-line">
                {others.slice(0, 8).map((x) => (
                  <li key={x.id}><Link href={`/app/observations/${x.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sand/50">
                    <span className="mono w-14 text-xs font-bold text-ink">{x.id}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-2">{x.signs.map((s) => SIGNS[s].tag).join(', ') || 'wellbeing note'} · {x.displayName ?? 'anonymous'}{x.deviceId === o.deviceId ? ' · same device' : ''}</span>
                    <span className="text-xs text-ink-3">{fmtWhen(x.createdAt, tz)}</span>
                    <StatusPill kind="obs" status={x.status} />
                  </Link></li>
                ))}
              </ul>
            ) : <Empty title="No other reports nearby in time" body="Corroboration from a second, independent reporter would open a Signal." className="py-8" />}
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-5">
          <Card>
            <CardHead title="Evidence weight" icon={Scale} action={<span className="mono text-sm font-bold text-ink">{w.weight.toFixed(2)}</span>} />
            <ul className="divide-y divide-line/70 px-5">
              {rows.map((r) => <li key={r.s} className="flex justify-between py-2 text-sm"><span className="text-ink-2">{SIGNS[r.s].en}</span><span className="mono text-ink">{r.w.toFixed(2)}</span></li>)}
            </ul>
            <KV className="border-t border-line" rows={[
              ['Combined 1 − ∏(1 − wᵢ)', combined.toFixed(3)],
              [`Reporter multiplier (${trust.toLowerCase()})`, `× ${mult.toFixed(1)}`],
              ['Cap per reporter', RULES.fusion.cap.toFixed(2)],
              ['Weight used in fusion', w.weight.toFixed(2)],
            ]} />
          </Card>

          <Card>
            <CardHead title="Fusion" icon={Radar} />
            <div className="space-y-3 p-5 text-sm">
              {sig ? (
                <>
                  <p className="text-ink">Fused into <Link href={`/app/signals/${sig.id}`} className="mono font-bold text-plum hover:underline">{sig.id}</Link> — {sig.openReason.toLowerCase()}.</p>
                  <div className="flex flex-wrap items-center gap-2"><StatusPill kind="signal" status={sig.status} /><span className="chip">Score {sig.snapshot.score}/100</span><span className="chip">{sig.snapshot.evidence.reporters} reporters</span><span className="chip">{sig.snapshot.evidence.categories.length} categories</span></div>
                </>
              ) : pendingSnap ? (
                <>
                  <p className="text-ink">Not fused yet. <span className="text-ink-2">{pendingSnap.rule.reason}.</span></p>
                  <p className="text-xs text-ink-3">If fused now: score {pendingSnap.score}/100 with {pendingSnap.evidence.reporters} reporter{pendingSnap.evidence.reporters === 1 ? '' : 's'} · Watch {pendingSnap.watchActive ? 'active' : 'not active'} for {hz}. Archived after {RULES.fusion.windowHours} h without corroboration.</p>
                </>
              ) : <p className="text-ink-2">{o.status === 'context' ? 'Wellbeing context only — never scored or fused.' : o.statusNote ?? 'Closed.'}</p>}
              {lookReq && <p className="text-xs text-ink-2">Submitted for mission <Link href={`/app/verification/${lookReq.id}`} className="mono font-bold text-plum hover:underline">{lookReq.id}</Link> requested by {lookReq.createdBy}.</p>}
            </div>
          </Card>

          <Card>
            <CardHead title="Coordinator decision" />
            <ActionList items={actions} empty={<p className="px-5 py-4 text-sm text-ink-2">{o.status === 'discarded' ? `Marked false positive: ${o.statusNote ?? ''}` : 'No decision needed for this report.'}</p>} />
          </Card>

          <Card>
            <CardHead title="Audit trail" icon={History} />
            <ol className="space-y-3 p-5">
              {trail.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', e.kind === 'system' ? 'bg-river' : e.kind === 'human' ? 'bg-plum' : 'bg-[#D99A2B]')} />
                  <div className="min-w-0"><p className="text-sm text-ink"><b>{e.action}</b> · {e.actor}</p>{e.detail && <p className="truncate text-xs text-ink-2">{e.detail}</p>}<p className="text-[11px] text-ink-3">{fmtWhen(e.at, tz)} · <span className="mono">{e.id}</span></p></div>
                </li>
              ))}
              {!trail.length && <li className="text-sm text-ink-3">No audit events.</li>}
            </ol>
          </Card>
        </div>
      </div>

      <ReasonModal open={discard} onClose={() => setDiscard(false)} title={`Mark ${o.id} as false positive`} sub={sig ? `It will be removed from ${sig.id} and the signal re-scored.` : undefined} confirmLabel="Mark false positive"
        presets={['Photo shows normal leaf litter, not mats', 'Duplicate of an earlier report', 'Prank or test submission', 'Reported at the wrong site']} onConfirm={decide} />
      <RequestLookModal open={look} onClose={() => setLook(false)} siteId={site.id} hazard={sig?.hazard ?? hz} signalId={sig?.id} />
    </>
  );
}
