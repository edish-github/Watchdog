'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, Camera, Gavel, History, PanelRightOpen, Radar, Send, Sigma } from 'lucide-react';
import type { Signal } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useActorName } from '@/lib/hooks';
import { ACTIVE, signalObs } from '@/lib/select';
import { CITY, HAZARDS, PEOPLE, SIGNS, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { cn, fmtWhen } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, KV, TierBadge, type ActionItem } from '@/components/ui';
import { toast } from '@/components/toast';
import { DetailHeader, StatusPill } from '@/components/console/kit';
import { ScoreHistory } from '@/components/console/score-history';
import { WhyDrawer } from '@/components/console/why-drawer';
import { ReasonModal } from '@/components/console/reason-modal';
import { RequestLookModal } from '@/components/console/request-look';
import { useOpenDraft } from '@/components/console/advisory-bits';

export default function SignalDetailPage() {
  const { signalId } = useParams<{ signalId: string }>();
  const d = useWD((s) => s.d);
  const s = d.signals.find((x) => x.id === (signalId ?? '').toUpperCase());
  if (!s) return <Card><Empty icon={Radar} title="Signal not found" body="It may belong to another replay scenario." action={<Link href="/app/signals" className="btn btn-primary btn-sm">Signal inbox</Link>} /></Card>;
  return <SignalDetail s={s} />;
}

const BANNER: Record<Signal['status'], [string, string]> = {
  open: ['Awaiting coordinator', 'bg-[#FBE2D0] text-[#A83E16] border-[#F1C3A2]'],
  look_requested: ['Look requested — waiting for field evidence', 'bg-[#FBEFD2] text-[#8F520A] border-[#EED79E]'],
  advisory: ['Advisory approved and live', 'bg-[#F7DCE0] text-[#A11C3A] border-[#EDB7C0]'],
  dismissed: ['Dismissed by a coordinator', 'bg-sand text-ink-2 border-line'],
  closed: ['Closed', 'bg-[#D6EEE7] text-[#0F6A60] border-[#A9DACB]'],
};

function SignalDetail({ s }: { s: Signal }) {
  const d = useWD((st) => st.d);
  const tz = useWD((st) => st.prefs.consoleTz);
  const actor = useActorName();
  const openDraft = useOpenDraft();
  const [why, setWhy] = useState(false);
  const [dismiss, setDismiss] = useState(false);
  const [look, setLook] = useState(false);
  const site = SITE[s.siteId], city = CITY[site.cityId], snap = s.snapshot, ev = snap.evidence, w = snap.watch;
  const active = ACTIVE.includes(s.status);
  const obs = signalObs(d, s);
  const adv = s.advisoryId ? d.advisories.find((a) => a.id === s.advisoryId) : undefined;
  const looks = d.looks.filter((l) => l.signalId === s.id);
  const bundles = d.bundles.filter((b) => b.signalId === s.id);
  const evPart = RULES.fusion.community * ev.value * 100, wPart = RULES.fusion.watch * w.score;
  const dismissReason = s.decisions.find((x) => x.kind === 'dismiss')?.note;

  const escalate = () => {
    const id = useWD.getState().dispatch({ type: 'signal/escalate', id: s.id, actor });
    const b = useWD.getState().d.bundles.find((x) => x.id === id);
    toast(`${id} built and queued`, b ? `${b.resourceCount} FHIR resources · ${b.validation.errors.length} validation errors · for ${b.target}` : undefined);
  };
  const decisions: ActionItem[] = active ? [
    { key: 'adv', tier: 'advisory', onClick: () => openDraft(s.id), title: adv?.status === 'live' ? `View live advisory ${adv.id}` : adv?.status === 'draft' ? `Continue draft ${adv.id}` : 'Draft precaution advisory', meta: snap.gate ? `Score ${snap.score} ≥ ${RULES.tiers.advisoryGate} gate · bilingual draft, you approve` : `Below the ${RULES.tiers.advisoryGate} gate — your judgement` },
    { key: 'look', tier: 'watch', onClick: () => setLook(true), title: 'Dispatch look request to verify', meta: `${PEOPLE[city.volunteers[0]]?.name ?? 'A volunteer'} · ${HAZARDS[s.hazard].name} checklist` },
    { key: 'esc', tier: 'signal', onClick: escalate, title: s.escalatedAt ? 'Escalate again (new FHIR bundle)' : 'Escalate to health liaison', meta: `Build & validate a One Health FHIR R4 bundle for ${city.health}` },
    { key: 'dis', onClick: () => setDismiss(true), title: 'Dismiss signal', meta: 'Requires a written rationale · logged' },
  ] : [];

  return (
    <>
      <DetailHeader back="/app/signals" backLabel="Signals" eyebrow={`Signal · opened ${fmtWhen(s.openedAt, tz)}`} title={<>{s.id} <span className="text-ink-3">· {site.id}</span></>}
        sub={`${site.stream}, ${city.name} · ${HAZARDS[s.hazard].long} · ${s.openReason}`}
        badges={<><StatusPill kind="signal" status={s.status} /><span className="chip">Score {snap.score}/100</span><span className={cn('chip', snap.gate && '!border-[#EDB7C0] !bg-[#F7DCE0] !text-[#A11C3A]')}>{snap.gate ? 'Advisory gate met' : `Gate ${RULES.tiers.advisoryGate}`}</span><span className="chip mono">rules v{snap.ruleVersion} · {snap.ruleSha}</span></>}
        actions={<><Link href={`/observe/sites/${site.id}`} target="_blank" className="btn btn-outline"><ArrowUpRight className="h-4 w-4" />Public view</Link><button className="btn btn-dark" onClick={() => setWhy(true)}><PanelRightOpen className="h-4 w-4" />Open Why drawer</button></>} />

      <p className={cn('mb-5 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold', BANNER[s.status][1])}>
        {BANNER[s.status][0]}{s.status === 'dismissed' && dismissReason && <span className="font-normal">— “{dismissReason}”</span>}
        {s.status === 'advisory' && adv && <Link href={`/app/advisories/${adv.id}`} className="mono underline">{adv.id}</Link>}
      </p>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-6">
          <CardHead title={`Community evidence · ${Math.round(RULES.fusion.community * 100)}%`} icon={Radar} action={<span className="mono text-sm font-bold">{ev.value.toFixed(2)}</span>} />
          <ul className="divide-y divide-line/70">
            {ev.items.map((i) => (
              <li key={i.deviceId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0"><Link href={`/app/observations/${i.obsId}`} className="font-bold text-ink hover:text-plum">{i.label}</Link> <span className="text-xs text-ink-3">({i.verified ? 'verified' : i.role.replace('_', ' ')}{i.acute ? ' · acute' : ''})</span><span className="block truncate text-xs text-ink-2">{i.signs.map((x) => SIGNS[x].tag).join(', ')}</span></span>
                <span className="mono shrink-0 text-xs">w={i.weight.toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <KV className="border-t border-line" rows={[['Combined base', ev.base.toFixed(3)], [`Synergy (${ev.categories.length} categories)`, `+${ev.synergy.toFixed(3)}`], ['Fused evidence', `${ev.value.toFixed(3)} / 1`]]} />
        </Card>

        <Card className="xl:col-span-6">
          <CardHead title={`Watch condition · ${Math.round(RULES.fusion.watch * 100)}%`} icon={Sigma} action={<TierBadge tier={snap.watchActive ? 'watch' : 'quiet'} size="sm" />} />
          <KV rows={[
            ['Hazard', `${s.hazard} · ${HAZARDS[s.hazard].name}`],
            ['Trigger base T(d)', w.trigger.toFixed(3)],
            ['Vulnerability V(s)', w.vulnerability.toFixed(3)],
            ['Watch score', `${w.score} / 100`],
            ['Fused signal score', `${snap.score} / 100`],
          ]} />
          <div className="border-t border-line p-5">
            <p className="text-xs font-bold text-ink-2">Score composition</p>
            <div className="relative mt-2 flex h-4 overflow-hidden rounded-full bg-sand" role="img" aria-label={`Evidence ${evPart.toFixed(0)} plus watch ${wPart.toFixed(0)} equals ${snap.score}`}>
              <div className="h-full bg-river" style={{ width: `${evPart}%` }} />
              <div className="h-full bg-[#D99A2B]" style={{ width: `${wPart}%` }} />
              <span className="absolute inset-y-0 w-0.5 bg-[#A11C3A]" style={{ left: `${RULES.tiers.advisoryGate}%` }} />
            </div>
            <p className="mono mt-2 text-xs text-ink-2">{evPart.toFixed(1)} evidence + {wPart.toFixed(1)} watch = <b className="text-ink">{snap.score}</b> · gate at {RULES.tiers.advisoryGate}</p>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Score history" icon={History} sub={`${s.history.length} update${s.history.length === 1 ? '' : 's'} since opening`} />
          <div className="px-5 pb-4 pt-3"><ScoreHistory history={s.history} tz={tz} /></div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Human oversight — a person decides" icon={Gavel} />
          {active ? <ActionList items={decisions} /> : <p className="px-5 py-4 text-sm text-ink-2">This signal is {s.status}. {s.closedAt && `Closed ${fmtWhen(s.closedAt, tz)}.`}</p>}
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">No advisory or FHIR bundle leaves Watchdog without one of these explicit actions. Each is logged with your name and the rule version.</p>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Fused reports" icon={Camera} sub={`${obs.length} report${obs.length === 1 ? '' : 's'} · open the Why drawer for photos and weights`} />
          <ul className="divide-y divide-line">
            {obs.map((o) => (
              <li key={o.id}>
                <Link href={`/app/observations/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-sand/50">
                  {o.photo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={o.photo.dataUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                    : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sand text-[10px] text-ink-3">—</span>}
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink">{o.id} · {o.displayName ?? 'Anonymous'}{o.verified && <span className="ml-1.5 text-xs font-normal text-[#0F6A60]">verified</span>}</span><span className="block truncate text-xs text-ink-2">{o.signs.map((x) => SIGNS[x].tag).join(', ')}{o.animal ? ` · dog, onset ${o.animal.onset === 'lt2h' ? '< 2 h' : '> 2 h'}` : ''}</span></span>
                  <span className="shrink-0 text-xs text-ink-3">{fmtWhen(o.createdAt, tz)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Decision log & hand-offs" icon={Send} />
          <ol className="space-y-3 p-5">
            {s.decisions.map((x, i) => <li key={i} className="text-sm"><b className="text-ink">{x.kind.replace('_', ' ')}</b> · {x.actor}{x.note && <span className="text-ink-2"> — {x.note}</span>}<span className="block text-[11px] text-ink-3">{fmtWhen(x.at, tz)}</span></li>)}
            {!s.decisions.length && <li className="text-sm text-ink-3">No human decision yet.</li>}
          </ol>
          {(looks.length > 0 || bundles.length > 0) && (
            <ul className="divide-y divide-line border-t border-line">
              {looks.map((l) => <li key={l.id}><Link href={`/app/verification/${l.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-sand/50"><span><span className="mono font-bold text-plum">{l.id}</span> · {PEOPLE[l.assignee]?.name}</span><StatusPill kind="look" status={l.status} /></Link></li>)}
              {bundles.map((b) => <li key={b.id}><Link href={`/app/fhir/${b.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-sand/50"><span><span className="mono font-bold text-plum">{b.id}</span> · {b.resourceCount} resources</span><StatusPill kind="bundle" status={b.status} /></Link></li>)}
            </ul>
          )}
        </Card>
      </div>

      <WhyDrawer signal={s} open={why} onClose={() => setWhy(false)} />
      <ReasonModal open={dismiss} onClose={() => setDismiss(false)} title={`Dismiss ${s.id}`} sub="The public page returns to its forecast tier. Reports stay in the record." confirmLabel="Dismiss signal"
        presets={['Verified on site: no signs present', 'Explained by upstream works notified by the city', 'Photos show normal leaf litter, not mats', 'Duplicate of an existing signal']}
        onConfirm={(reason) => { useWD.getState().dispatch({ type: 'signal/dismiss', id: s.id, reason, actor }); toast(`${s.id} dismissed`, 'Logged with your rationale.', 'info'); }} />
      <RequestLookModal open={look} onClose={() => setLook(false)} siteId={site.id} hazard={s.hazard} signalId={s.id} />
    </>
  );
}
