'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Radar, Siren } from 'lucide-react';
import type { Signal } from '@/lib/types';
import { useWD } from '@/lib/store';
import { signalObs } from '@/lib/select';
import { CATEGORY, HAZARDS, SIGNS, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { fmtAgo, fmtSpan, hoursBetween } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, Meter, PageHeader } from '@/components/ui';
import { StatusPill, Tabs } from '@/components/console/kit';
import { useOpenDraft } from '@/components/console/advisory-bits';

type TabKey = 'review' | 'progress' | 'closed' | 'all';
const inTab = (s: Signal, t: TabKey) => t === 'all' || (t === 'review' ? s.status === 'open' : t === 'progress' ? s.status === 'look_requested' || s.status === 'advisory' : s.status === 'closed' || s.status === 'dismissed');

export default function SignalsPage() {
  const d = useWD((s) => s.d);
  const router = useRouter();
  const openDraft = useOpenDraft();
  const [tab, setTab] = useState<TabKey>(() => (d.signals.some((s) => s.status === 'open') ? 'review' : 'all'));
  const sorted = useMemo(() => [...d.signals].sort((a, b) => Number(b.status === 'open') - Number(a.status === 'open') || b.snapshot.score - a.snapshot.score || b.openedAt.localeCompare(a.openedAt)), [d]);
  const rows = sorted.filter((s) => inTab(s, tab));
  const spot = sorted.find((s) => s.status === 'open') ?? sorted.find((s) => s.status === 'look_requested' || s.status === 'advisory');
  const spotObs = spot ? signalObs(d, spot) : [];
  const spotSpan = spotObs.length > 1 ? hoursBetween(spotObs.map((o) => o.createdAt).sort().pop()!, spotObs.map((o) => o.createdAt).sort()[0]) : 0;
  const count = (t: TabKey) => d.signals.filter((s) => inTab(s, t)).length;

  return (
    <>
      <PageHeader eyebrow="Response · Signals" title={<>Signal <span className="text-ink-3">inbox</span></>}
        sub="Independent sentinel reports fused by deterministic rules. Nothing here is public — the public sees “being checked” until a coordinator decides." />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <Tabs className="px-3 pt-1" value={tab} onChange={setTab} items={[
            { value: 'review', label: 'Needs review', count: count('review') }, { value: 'progress', label: 'In progress', count: count('progress') },
            { value: 'closed', label: 'Closed', count: count('closed') }, { value: 'all', label: 'All', count: d.signals.length },
          ]} />
          {rows.length === 0 ? <Empty icon={Radar} title="No signals here" body="Signals open when two independent people report signs, an animal reacts acutely, or a strong report arrives during a Watch." /> : (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[820px]">
                <thead><tr><th>ID</th><th>Site</th><th>Hazard</th><th>Score</th><th>Reporters</th><th>Types</th><th>Opened</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id} className="cursor-pointer" onClick={() => router.push(`/app/signals/${s.id}`)}>
                      <td><Link href={`/app/signals/${s.id}`} onClick={(e) => e.stopPropagation()} className="mono font-bold text-ink hover:text-plum">{s.id}</Link></td>
                      <td className="mono text-xs">{s.siteId}<p className="font-sans text-ink-3">{SITE[s.siteId].stream}</p></td>
                      <td className="text-xs">{s.hazard} · {HAZARDS[s.hazard].name}</td>
                      <td className="w-40"><div className="flex items-center gap-2"><span className="w-7 font-bold tabular-nums">{s.snapshot.score}</span><Meter value={s.snapshot.score} marker={RULES.tiers.advisoryGate} tone={s.snapshot.gate ? 'advisory' : 'signal'} className="flex-1" label={`Signal score ${s.snapshot.score}`} /></div></td>
                      <td className="tabular-nums">{s.snapshot.evidence.reporters} indep.</td>
                      <td><div className="flex flex-wrap gap-1">{s.snapshot.evidence.categories.map((c) => <span key={c} className="chip !px-1.5 !py-0 !text-[10px]">{CATEGORY[c].en}</span>)}</div></td>
                      <td className="whitespace-nowrap text-xs text-ink-2">{fmtAgo(s.openedAt, d.now)}</td>
                      <td><StatusPill kind="signal" status={s.status} />{s.advisoryId && <Link href={`/app/advisories/${s.advisoryId}`} onClick={(e) => e.stopPropagation()} className="mono mt-1 block text-[11px] font-bold text-plum hover:underline">{s.advisoryId}</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5 xl:col-span-4">
          {spot ? (
            <Card>
              <CardHead title={`${spot.status === 'open' ? 'Critical signal' : 'Signal in progress'} · ${spot.siteId} (${spot.snapshot.score}/100)`} icon={Siren} />
              <div className="space-y-3 p-5 text-sm">
                <p className="text-ink"><b>Hazard:</b> {HAZARDS[spot.hazard].long}</p>
                <p className="text-ink"><b>Evidence fusion:</b> {spot.snapshot.evidence.reporters} independent reporter{spot.snapshot.evidence.reporters > 1 ? 's' : ''}{spotSpan > 0 ? ` within ${fmtSpan(spotSpan)}` : ''} · {spot.snapshot.evidence.categories.length} sign categor{spot.snapshot.evidence.categories.length > 1 ? 'ies' : 'y'}</p>
                <ul className="space-y-1.5">
                  {spot.snapshot.evidence.items.map((i) => (
                    <li key={i.deviceId} className="rounded-xl bg-sand/50 px-3 py-2 text-xs"><b className="text-ink">{i.label}</b> <span className="text-ink-3">({i.verified ? 'verified' : i.role.replace('_', ' ')})</span>: {i.signs.map((s) => SIGNS[s].tag).join(', ')} <span className="mono text-ink-3">w={i.weight.toFixed(2)}</span></li>
                  ))}
                </ul>
                <p className="text-xs text-ink-2">Watch context: {spot.snapshot.watchActive ? 'active' : 'no'} Watch ({spot.snapshot.watch.score}) · synergy +{spot.snapshot.evidence.synergy.toFixed(3)} · {spot.snapshot.gate ? 'advisory gate met' : `below the ${RULES.tiers.advisoryGate} gate`}</p>
              </div>
              <ActionList items={[
                { key: 'why', tier: 'signal', href: `/app/signals/${spot.id}`, title: `Open decision & Why drawer for ${spot.id}`, meta: 'Every input, weight and rule' },
                { key: 'rules', href: `/app/rules/${HAZARDS[spot.hazard].rule}`, title: `Inspect rule ${HAZARDS[spot.hazard].rule} · v${RULES.version}`, meta: `Git ${RULES.sha} · deterministic` },
                { key: 'draft', tier: 'advisory', onClick: () => openDraft(spot.id), title: spot.advisoryId ? `Continue advisory ${spot.advisoryId}` : 'Draft a precaution advisory', meta: 'Bilingual draft · you edit and approve' },
              ]} />
            </Card>
          ) : <Card><Empty icon={Radar} title="No open signals" body="The network is quiet. Reports from the public app will fuse here." /></Card>}
          <Card>
            <CardHead title="When does a signal open?" />
            <ul className="space-y-2 p-5 text-sm text-ink-2">
              <li>• Two or more independent reporters at one site within {RULES.fusion.windowHours} h</li>
              <li>• One acute animal report (onset under 2 h)</li>
              <li>• One strong report (weight ≥ {RULES.fusion.strong}) during an active Watch</li>
              <li className="pt-1 text-xs text-ink-3">Score = {RULES.fusion.community} × community evidence + {RULES.fusion.watch} × watch. Advisory gate at {RULES.tiers.advisoryGate} is guidance — a person always decides.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
