'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ClipboardCheck, Plus, Users } from 'lucide-react';
import type { LookRequest } from '@/lib/types';
import { useWD } from '@/lib/store';
import { CITY, PEOPLE, SITES, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { fmtSpan, fmtWhen, hoursBetween } from '@/lib/utils';
import { Avatar, Card, CardHead, Empty, PageHeader } from '@/components/ui';
import { Fact, Select, StatusPill, Tabs } from '@/components/console/kit';
import { RequestLookModal } from '@/components/console/request-look';

type TabKey = 'open' | 'completed' | 'expired' | 'all';
const inTab = (l: LookRequest, t: TabKey) => t === 'all' || (t === 'open' ? l.status === 'queued' || l.status === 'accepted' : l.status === t);
const RESULT: Record<string, [string, string]> = { signs_present: ['Signs present', 'text-[#A83E16]'], no_signs: ['No signs', 'text-[#0F6A60]'], no_access: ['No access', 'text-ink-3'] };
const VOLUNTEERS = Object.values(PEOPLE).filter((p) => p.role === 'citizen_scientist');

export default function VerificationPage() {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('open');
  const [site, setSite] = useState('COI-03');
  const [look, setLook] = useState(false);
  const sorted = useMemo(() => [...d.looks].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [d]);
  const rows = sorted.filter((l) => inTab(l, tab));
  const done = d.looks.filter((l) => l.response);
  const positive = done.filter((l) => l.response!.result === 'signs_present').length;
  const clear = done.filter((l) => l.response!.result === 'no_signs').length;
  const avgH = done.length ? done.reduce((n, l) => n + hoursBetween(l.response!.at, l.createdAt), 0) / done.length : 0;
  const count = (t: TabKey) => d.looks.filter((l) => inTab(l, t)).length;

  return (
    <>
      <PageHeader eyebrow="Response · Verification" title={<>Field <span className="text-ink-3">missions</span></>}
        sub="Look requests to trained citizen scientists: a four-item checklist, a 24-hour window, and evidence that fuses back into the signal as a verified finding."
        actions={<><Select label="Site" value={site} onChange={setSite} options={SITES.map((s) => ({ value: s.id, label: `${s.id} · ${s.stream}` }))} /><button className="btn btn-primary" onClick={() => setLook(true)}><Plus className="h-4 w-4" />New look request</button></>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Total dispatched" value={d.looks.length} sub={`${count('open')} open now`} />
        <Fact label="Positive checks" value={positive} sub="Signs confirmed on site" />
        <Fact label="Clear checks" value={clear} sub={`Count toward resolution after ${RULES.resolution.minHours} h`} />
        <Fact label="Average response" value={done.length ? fmtSpan(avgH) : '—'} sub="Dispatch → answer" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <Tabs className="px-3 pt-1" value={tab} onChange={setTab} items={[{ value: 'open', label: 'Open', count: count('open') }, { value: 'completed', label: 'Completed', count: count('completed') }, { value: 'expired', label: 'Expired', count: count('expired') }, { value: 'all', label: 'All', count: d.looks.length }]} />
          {rows.length === 0 ? <Empty icon={ClipboardCheck} title="No missions here" body="Dispatch a look request from a signal, a site or the button above." /> : (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[820px]">
                <thead><tr><th>Mission</th><th>Site</th><th>Volunteer</th><th>Task</th><th>Status</th><th>Due / answered</th><th>Result</th></tr></thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id} className="cursor-pointer" onClick={() => router.push(`/app/verification/${l.id}`)}>
                      <td><Link href={`/app/verification/${l.id}`} onClick={(e) => e.stopPropagation()} className="mono font-bold text-ink hover:text-plum">{l.id}</Link></td>
                      <td className="mono text-xs">{l.siteId}<p className="font-sans text-ink-3">{CITY[SITE[l.siteId].cityId].name}</p></td>
                      <td className="text-sm">{PEOPLE[l.assignee]?.name ?? l.assignee}</td>
                      <td className="max-w-[220px] text-xs"><b className="text-ink">{l.purpose === 'resolve' ? 'Resolution check' : `Verify ${l.hazard}`}</b><p className="truncate text-ink-2">{l.note ?? l.checklist.map((c) => c.label).join('; ')}</p></td>
                      <td><StatusPill kind="look" status={l.status} /></td>
                      <td className="whitespace-nowrap text-xs text-ink-2">{l.response ? fmtWhen(l.response.at, tz) : l.status === 'expired' ? `expired ${fmtWhen(l.dueAt, tz)}` : `in ${fmtSpan(hoursBetween(l.dueAt, d.now))}`}</td>
                      <td className="text-xs font-bold">{l.response ? <span className={RESULT[l.response.result][1]}>{RESULT[l.response.result][0]}{l.response.counted ? ' · counted' : ''}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-4">
          <CardHead title="Citizen scientists" icon={Users} />
          <ul className="divide-y divide-line">
            {VOLUNTEERS.map((p) => {
              const mine = d.looks.filter((l) => l.assignee === p.id);
              const open = mine.filter((l) => l.status === 'queued' || l.status === 'accepted').length;
              const credited = mine.filter((l) => l.status === 'completed' && l.response?.result !== 'no_access').length;
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={p.name} size={34} />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-ink">{p.name}</p><p className="truncate text-xs text-ink-3">{p.title}</p></div>
                  <div className="text-right text-xs"><p className="font-bold text-ink">{credited} credited</p><p className="text-ink-3">{open} open · ×{RULES.roles.verified}</p></div>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Verified findings weigh ×{RULES.roles.verified} against a walker’s ×{RULES.roles.walker}. Credit is awarded automatically for every answered visit.</p>
        </Card>
      </div>

      <RequestLookModal open={look} onClose={() => setLook(false)} siteId={site} hazard={SITE[site].cityId === 'ghent' ? 'H2' : 'H1'} onDone={(id) => id && router.push(`/app/verification/${id}`)} />
    </>
  );
}
