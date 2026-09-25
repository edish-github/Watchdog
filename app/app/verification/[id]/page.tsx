'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, Camera, ClipboardCheck, Clock, Scale, ShieldCheck } from 'lucide-react';
import type { LookRequest } from '@/lib/types';
import { useWD } from '@/lib/store';
import { CITY, PEOPLE, SITE } from '@/lib/catalog';
import { RULES, obsWeight } from '@/lib/engine';
import { addH, cn, fmtSpan, fmtWhen, hoursBetween } from '@/lib/utils';
import { ActionList, Avatar, Card, CardHead, Empty, KV, Meter, type ActionItem } from '@/components/ui';
import { DetailHeader, StatusPill } from '@/components/console/kit';
import { PhotoView } from '@/components/console/photo-view';
import { RequestLookModal } from '@/components/console/request-look';

export default function MissionPage() {
  const { id } = useParams<{ id: string }>();
  const d = useWD((s) => s.d);
  const l = d.looks.find((x) => x.id === (id ?? '').toUpperCase());
  if (!l) return <Card><Empty icon={ClipboardCheck} title="Mission not found" body="It may belong to another replay scenario." action={<Link href="/app/verification" className="btn btn-primary btn-sm">All missions</Link>} /></Card>;
  return <Mission l={l} />;
}

function Mission({ l }: { l: LookRequest }) {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const [again, setAgain] = useState(false);
  const site = SITE[l.siteId], city = CITY[site.cityId], person = PEOPLE[l.assignee];
  const r = l.response;
  const finding = d.observations.find((o) => o.lookId === l.id);
  const sig = l.signalId ? d.signals.find((s) => s.id === l.signalId) : undefined;
  const adv = l.advisoryId ? d.advisories.find((a) => a.id === l.advisoryId) : undefined;
  const before = r && sig ? sig.history.filter((h) => h.at < r.at).pop() : undefined;
  const after = r && sig ? sig.history.find((h) => h.at >= r.at) : undefined;
  const credited = d.looks.filter((x) => x.assignee === l.assignee && x.status === 'completed' && x.response?.result !== 'no_access').length;
  const eligibleAt = adv?.publishedAt ? addH(adv.publishedAt, RULES.resolution.minHours) : undefined;

  const actions: ActionItem[] = [
    ...(sig ? [{ key: 'sig', tier: 'signal' as const, href: `/app/signals/${sig.id}`, title: `Return to ${sig.id} and decide`, meta: `Score ${sig.snapshot.score} · ${sig.status.replace('_', ' ')}` }] : []),
    ...(adv ? [{ key: 'adv', tier: 'advisory' as const, href: `/app/advisories/${adv.id}`, title: `Open advisory ${adv.id}`, meta: `${adv.clearChecks.length}/${RULES.resolution.checks} clear checks · ${adv.status}` }] : []),
    { key: 'vol', onClick: () => { useWD.getState().setVolunteer(l.assignee); window.open('/observe/requests', '_blank'); }, title: `Open ${person?.short ?? 'volunteer'}’s mission view`, meta: 'The public app, as the volunteer sees it' },
    { key: 'again', tier: 'watch', onClick: () => setAgain(true), title: 'Request another look', meta: 'Same site · any volunteer' },
  ];

  return (
    <>
      <DetailHeader back="/app/verification" backLabel="Verification" eyebrow={`Mission evidence · dispatched ${fmtWhen(l.createdAt, tz)} by ${l.createdBy}`} title={<>{l.id} <span className="text-ink-3">· {site.id}</span></>}
        sub={`${l.purpose === 'resolve' ? 'Resolution check' : `Verification look for ${l.hazard}`} · ${site.stream}, ${city.name}`}
        badges={<><StatusPill kind="look" status={l.status} />{r && <span className="chip">{r.result === 'signs_present' ? 'Signs present' : r.result === 'no_signs' ? 'No signs' : 'No access'}</span>}{finding && <span className="chip">Evidence level {obsWeight(finding).weight.toFixed(2)}</span>}</>}
        actions={<Link href={`/app/sites/${site.id}`} className="btn btn-outline"><ArrowUpRight className="h-4 w-4" />Site</Link>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHead title={r ? 'Field verification checklist submitted' : 'Checklist sent'} icon={ClipboardCheck} />
          <ul className="divide-y divide-line/70">
            {l.checklist.map((c) => {
              const seen = r?.observed.includes(c.sign);
              return (
                <li key={c.sign} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md text-xs font-bold', !r ? 'bg-sand text-ink-3' : seen ? 'bg-[#FBE2D0] text-[#A83E16]' : 'bg-[#D6EEE7] text-[#0F6A60]')}>{!r ? '·' : seen ? '✓' : '✗'}</span>
                  <span className="flex-1 text-ink">{c.label}</span>
                  <span className="text-xs text-ink-3">{!r ? 'pending' : seen ? 'present' : 'not seen'}</span>
                </li>
              );
            })}
          </ul>
          {r?.notes && <p className="border-t border-line px-5 py-3 text-sm italic text-ink">“{r.notes}” <span className="not-italic text-ink-3">— {person?.name}</span></p>}
          {l.note && <p className="border-t border-line px-5 py-3 text-xs text-ink-2"><b>Task note:</b> {l.note}</p>}
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Volunteer & timing" icon={Clock} />
          <div className="flex items-center gap-3 px-5 pt-4"><Avatar name={person?.name ?? l.assignee} size={40} /><div><p className="font-bold text-ink">{person?.name}</p><p className="text-xs text-ink-3">{person?.title} · {credited} credited visits</p></div></div>
          <KV className="mt-2" rows={[
            ['Dispatched', fmtWhen(l.createdAt, tz)],
            ['Accepted', l.acceptedAt ? fmtWhen(l.acceptedAt, tz) : '—'],
            [r ? 'Answered' : 'Due', r ? `${fmtWhen(r.at, tz)} (${fmtSpan(hoursBetween(r.at, l.createdAt))})` : `${fmtWhen(l.dueAt, tz)}${l.status !== 'expired' ? ` · in ${fmtSpan(hoursBetween(l.dueAt, d.now))}` : ''}`],
            ['Reporter weight', `×${RULES.roles.verified} (verified)`],
          ]} />
        </Card>

        {r?.photo && (
          <Card className="xl:col-span-7">
            <CardHead title="Photo verification" icon={Camera} />
            <div className="p-5"><PhotoView photo={r.photo} /></div>
          </Card>
        )}

        <Card className={cn(r?.photo ? 'xl:col-span-5' : 'xl:col-span-7')}>
          <CardHead title={l.purpose === 'resolve' ? 'Resolution impact' : 'Engine impact'} icon={Scale} />
          {!r ? <p className="px-5 py-4 text-sm text-ink-2">Waiting for {person?.short ?? 'the volunteer'}. The answer fuses into the signal automatically — no one needs to copy it across.</p>
            : l.purpose === 'resolve' ? (
              <div className="space-y-3 p-5 text-sm">
                <p className="text-ink">{r.result === 'no_signs' ? (r.counted ? '✓ Counted as an independent “no signs” check.' : 'Not counted — answered before the 24-hour minimum or by a volunteer who already counted.') : r.result === 'signs_present' ? 'Signs still present — the advisory stays in force.' : 'Could not access the site — no effect on resolution.'}</p>
                {adv && <>
                  <Meter value={adv.clearChecks.length} max={RULES.resolution.checks} tone="resolved" label="Clear checks" />
                  <p className="text-xs text-ink-2">{adv.clearChecks.length} / {RULES.resolution.checks} clear checks · eligible from {eligibleAt ? fmtWhen(eligibleAt, tz) : '—'} · {adv.id} is {adv.status}</p>
                </>}
              </div>
            ) : finding ? (
              <KV rows={[
                ['Verified finding', finding.id],
                ['Evidence weight', obsWeight(finding).weight.toFixed(2)],
                ['Signal evidence', before && after ? `${before.evidence.toFixed(2)} → ${after.evidence.toFixed(2)}` : sig ? sig.snapshot.evidence.value.toFixed(2) : '—'],
                ['Signal score', before && after ? `${before.score} → ${after.score}` : sig ? String(sig.snapshot.score) : '—'],
                ['Advisory gate', sig ? (sig.snapshot.gate ? `Met (≥ ${RULES.tiers.advisoryGate})` : `Not met (< ${RULES.tiers.advisoryGate})`) : '—'],
              ]} />
            ) : <p className="px-5 py-4 text-sm text-ink-2">{r.result === 'no_signs' ? 'No signs found — nothing was added to the signal. Consider dismissing it with this as the rationale.' : 'The volunteer could not reach the site.'}</p>}
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Next procedural action" icon={ShieldCheck} />
          <ActionList items={actions} />
        </Card>
      </div>

      <RequestLookModal open={again} onClose={() => setAgain(false)} siteId={site.id} hazard={l.hazard} signalId={sig?.id} />
    </>
  );
}
