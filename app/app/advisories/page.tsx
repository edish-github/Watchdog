'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Plus, Radio, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Advisory } from '@/lib/types';
import { useWD } from '@/lib/store';
import { CITY, HAZARDS, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { addH, fmtSpan, fmtWhen, hoursBetween } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, KV, Meter, PageHeader, type ActionItem } from '@/components/ui';
import { StatusPill, Tabs } from '@/components/console/kit';

type TabKey = 'live' | 'draft' | 'closed' | 'all';
const inTab = (a: Advisory, t: TabKey) => t === 'all' || (t === 'closed' ? ['expired', 'withdrawn', 'resolved'].includes(a.status) : a.status === t);

export default function AdvisoriesPage() {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const router = useRouter();
  const sorted = useMemo(() => [...d.advisories].sort((a, b) => (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt)), [d]);
  const [tab, setTab] = useState<TabKey>(() => (d.advisories.some((a) => a.status === 'draft') ? 'draft' : 'live'));
  const rows = sorted.filter((a) => inTab(a, tab));
  const live = sorted.filter((a) => a.status === 'live');
  const drafts = sorted.filter((a) => a.status === 'draft');
  const reach = live.reduce((n, a) => n + SITE[a.siteId].followers, 0);
  const delivered = d.bundles.filter((b) => b.advisoryId && b.status === 'sent').length;
  const count = (t: TabKey) => d.advisories.filter((a) => inTab(a, t)).length;
  const lifecycle: ActionItem[] = [
    ...drafts.map((a) => ({ key: a.id, tier: 'advisory' as const, href: `/app/advisories/${a.id}`, title: `Open editor for ${a.id} (${a.siteId})`, meta: `${a.edited ? 'Staff edited' : 'Unedited draft'} · human approval required` })),
    ...live.map((a) => ({ key: `r${a.id}`, tier: 'resolved' as const, href: `/app/advisories/${a.id}`, title: `Review resolution of ${a.id}`, meta: `${a.clearChecks.length}/${RULES.resolution.checks} clear checks · ${fmtSpan(hoursBetween(a.validUntil, d.now))} of validity left` })),
    { key: 'new', href: '/app/advisories/new', title: 'Write a new advisory', meta: 'From a signal or staff-written for a site' },
    { key: 'pub', href: '/observe', title: 'View the public map', meta: 'What walkers see right now' },
  ];

  return (
    <>
      <PageHeader eyebrow="Response · Advisories" title={<>Advisory <span className="text-ink-3">center</span></>}
        sub="Human-reviewed public precautions. Every public word passes guardrails and an explicit coordinator approval, and resolves only after two independent clear checks."
        actions={<Link href="/app/advisories/new" className="btn btn-primary"><Plus className="h-4 w-4" />New advisory</Link>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <Tabs className="px-3 pt-1" value={tab} onChange={setTab} items={[{ value: 'live', label: 'Live', count: count('live') }, { value: 'draft', label: 'Drafts', count: count('draft') }, { value: 'closed', label: 'Closed', count: count('closed') }, { value: 'all', label: 'All', count: d.advisories.length }]} />
          {rows.length === 0 ? <Empty icon={ShieldAlert} title="No advisories here" body="Draft one from a signal’s decision panel, or write a staff advisory for a site." action={<Link href="/app/advisories/new" className="btn btn-primary btn-sm">New advisory</Link>} /> : (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[860px]">
                <thead><tr><th>ID</th><th>Site</th><th>Hazard</th><th>Lang</th><th>Published</th><th>Valid until</th><th>Approved by</th><th>Resolution</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="cursor-pointer" onClick={() => router.push(`/app/advisories/${a.id}`)}>
                      <td><Link href={`/app/advisories/${a.id}`} onClick={(e) => e.stopPropagation()} className="mono font-bold text-ink hover:text-plum">{a.id}</Link></td>
                      <td className="mono text-xs">{a.siteId}<p className="font-sans text-ink-3">{CITY[SITE[a.siteId].cityId].name}</p></td>
                      <td className="text-xs">{a.hazard} · {HAZARDS[a.hazard].name}</td>
                      <td className="mono text-xs uppercase">{a.langs.join('/')}</td>
                      <td className="whitespace-nowrap text-xs">{a.publishedAt ? fmtWhen(a.publishedAt, tz) : <span className="text-ink-3">Drafting…</span>}</td>
                      <td className="whitespace-nowrap text-xs">{fmtWhen(a.validUntil, tz)}</td>
                      <td className="text-xs">{a.approvedBy ?? '—'}</td>
                      <td className="text-xs tabular-nums">{a.status === 'draft' ? '—' : `${a.clearChecks.length}/${RULES.resolution.checks}`}</td>
                      <td><StatusPill kind="advisory" status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5 xl:col-span-4">
          <Card>
            <CardHead title="Broadcast coverage" icon={Radio} />
            <KV rows={[['Live advisories', live.length], ['Public app followers reached', reach], ['FHIR bundles delivered', delivered], ['Drafts awaiting approval', drafts.length]]} />
          </Card>
          <Card>
            <CardHead title="Resolution status" icon={ShieldCheck} sub={`${RULES.resolution.checks} independent clear checks, ≥ ${RULES.resolution.minHours} h after publication`} />
            {live.length ? (
              <ul className="space-y-3 p-5">
                {live.map((a) => {
                  const eligible = a.publishedAt ? addH(a.publishedAt, RULES.resolution.minHours) : a.createdAt;
                  return (
                    <li key={a.id}>
                      <div className="flex justify-between text-sm"><Link href={`/app/advisories/${a.id}`} className="mono font-bold text-plum hover:underline">{a.id}</Link><span className="text-xs text-ink-2">{a.clearChecks.length}/{RULES.resolution.checks}</span></div>
                      <Meter value={a.clearChecks.length} max={RULES.resolution.checks} tone="resolved" className="mt-1.5" label={`${a.id} clear checks`} />
                      <p className="mt-1 text-[11px] text-ink-3">{d.now >= eligible ? 'Clear checks count now' : `Checks count from ${fmtWhen(eligible, tz)}`}</p>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="px-5 py-4 text-sm text-ink-3">No live advisories.</p>}
          </Card>
          <Card>
            <CardHead title="Advisory life-cycle actions" />
            <ActionList items={lifecycle} />
          </Card>
        </div>
      </div>
    </>
  );
}
