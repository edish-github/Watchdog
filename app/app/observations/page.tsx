'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Dog, Droplets, Fish, Inbox, ShieldCheck, Smile, TriangleAlert } from 'lucide-react';
import type { ObsStatus, Observation } from '@/lib/types';
import { useWD } from '@/lib/store';
import { openWatch } from '@/lib/select';
import { FEELINGS, SIGNS, SITES, SYMPTOMS } from '@/lib/catalog';
import { obsWeight } from '@/lib/engine';
import { cn, fmtClock, fmtDay, hoursBetween, uniq } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, PageHeader } from '@/components/ui';
import type { IconType } from '@/components/icons';
import { Pager, SearchInput, Select, StatusPill, Tabs, usePaged } from '@/components/console/kit';

type Cat = 'water' | 'wildlife' | 'animal' | 'context';
const CAT: Record<Cat, { label: string; icon: IconType; cls: string }> = {
  water: { label: 'Water', icon: Droplets, cls: 'bg-[#E3ECEE] text-river' },
  wildlife: { label: 'Wildlife', icon: Fish, cls: 'bg-[#FBEFD2] text-[#8F520A]' },
  animal: { label: 'Animals', icon: Dog, cls: 'bg-[#F7DCE0] text-[#A11C3A]' },
  context: { label: 'Wellbeing', icon: Smile, cls: 'bg-plum-soft text-plum-2' },
};
const catsOf = (o: Observation): Cat[] => (o.signs.length ? uniq(o.signs.map((s) => SIGNS[s].cat as Cat)) : ['context']);
const who = (o: Observation) => (o.verified ? 'verified' : o.role === 'citizen_scientist' ? 'citizen sci.' : 'walker');

export default function ObservationsPage() {
  return <Suspense fallback={null}><Inbox_ /></Suspense>;
}

function Inbox_() {
  const params = useSearchParams();
  const router = useRouter();
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const [cat, setCat] = useState<'all' | Cat>('all');
  const [status, setStatus] = useState<'all' | ObsStatus>('all');
  const [site, setSite] = useState<string>(() => params.get('site')?.toUpperCase() ?? 'all');
  const [q, setQ] = useState('');
  const all = useMemo(() => [...d.observations].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [d]);
  const base = useMemo(() => {
    const n = q.trim().toLowerCase();
    return all.filter((o) => (site === 'all' || o.siteId === site) && (status === 'all' || o.status === status)
      && (!n || `${o.id} ${o.siteId} ${o.displayName ?? ''} ${o.deviceId} ${o.signs.map((s) => SIGNS[s].tag).join(' ')}`.toLowerCase().includes(n)));
  }, [all, site, status, q]);
  const rows = useMemo(() => (cat === 'all' ? base : base.filter((o) => catsOf(o).includes(cat))), [base, cat]);
  const paged = usePaged(rows, 12);
  const { setPage } = paged;
  useEffect(() => setPage(0), [cat, status, site, q, setPage]);
  const count = (c: Cat) => base.filter((o) => catsOf(o).includes(c)).length;

  const urgent = useMemo(() => {
    const recent = all.filter((o) => hoursBetween(d.now, o.createdAt) <= 72 && o.status !== 'discarded');
    const tags = (o: Observation) => o.signs.map((s) => SIGNS[s].tag).join(', ');
    return [
      ...recent.filter((o) => o.animal?.onset === 'lt2h').map((o) => ({ key: `a${o.id}`, tier: 'advisory' as const, href: `/app/observations/${o.id}`, title: `${o.id} · ${o.displayName ?? 'Walker'} · acute dog signs (< 2 h)`, meta: `${o.siteId} · ${o.animal!.symptoms.map((s) => SYMPTOMS[s].en.toLowerCase()).join(', ') || 'no symptoms listed'}` })),
      ...recent.filter((o) => o.verified).map((o) => ({ key: `v${o.id}`, tier: 'signal' as const, href: `/app/observations/${o.id}`, title: `${o.id} · ${o.displayName ?? 'Volunteer'} · verified field finding`, meta: `${o.siteId} · ${tags(o)}` })),
      ...recent.filter((o) => o.status === 'pending' && openWatch(d, o.siteId)).map((o) => ({ key: `p${o.id}`, tier: 'watch' as const, href: `/app/observations/${o.id}`, title: `${o.id} · single report during a Watch`, meta: `${o.siteId} · ${tags(o)} · awaiting corroboration` })),
    ].slice(0, 6);
  }, [all, d]);

  return (
    <>
      <PageHeader eyebrow="Response · Observations" title={<>Sentinel <span className="text-ink-3">inbox</span></>}
        sub="Crowdsourced sightings from walkers, dog owners and citizen scientists. Reports fuse into Signals automatically by rule — you decide what happens next." />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-9">
          <Tabs className="px-3 pt-1" value={cat} onChange={setCat} items={[{ value: 'all', label: 'All', count: base.length }, ...(Object.keys(CAT) as Cat[]).map((c) => ({ value: c, label: CAT[c].label, count: count(c) }))]} />
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search ID, site, reporter or sign…" className="min-w-[220px] flex-1" />
            <Select label="Site" value={site} onChange={setSite} options={[{ value: 'all', label: 'All sites' }, ...SITES.map((s) => ({ value: s.id, label: `${s.id} · ${s.stream}` }))]} />
            <Select label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Any status' }, { value: 'pending', label: 'Pending' }, { value: 'fused', label: 'Fused' }, { value: 'context', label: 'Context' }, { value: 'discarded', label: 'Discarded' }, { value: 'archived', label: 'Archived' }]} />
          </div>
          {rows.length === 0 ? <Empty icon={Inbox} title="No reports match" body="Change the filters, or file one from the public app at /observe." /> : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl min-w-[900px]">
                  <thead><tr><th>ID</th><th>Time</th><th>Site</th><th>Category</th><th>Signs reported</th><th>Reporter</th><th>Weight</th><th>Status</th></tr></thead>
                  <tbody>
                    {paged.slice.map((o) => (
                      <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/app/observations/${o.id}`)}>
                        <td><Link href={`/app/observations/${o.id}`} onClick={(e) => e.stopPropagation()} className="mono font-bold text-ink hover:text-plum">{o.id}</Link>{o.photo && <span className="ml-1.5 text-[10px] font-bold text-ink-3">📷</span>}</td>
                        <td className="whitespace-nowrap text-xs"><b className="text-ink">{fmtClock(o.createdAt, tz)}</b><p className="text-ink-3">{fmtDay(o.createdAt, tz)}</p></td>
                        <td className="mono text-xs">{o.siteId}</td>
                        <td><div className="flex gap-1">{catsOf(o).map((c) => { const I = CAT[c].icon; return <span key={c} title={CAT[c].label} className={cn('grid h-6 w-6 place-items-center rounded-lg', CAT[c].cls)}><I className="h-3.5 w-3.5" /></span>; })}</div></td>
                        <td className="max-w-[240px]"><p className="truncate text-sm text-ink">{o.signs.map((s) => SIGNS[s].tag).join(', ') || (o.feeling ? `${FEELINGS[o.feeling].emoji} ${FEELINGS[o.feeling].en}` : '—')}</p>{o.animal && <p className="truncate text-xs text-[#A11C3A]">dog · onset {o.animal.onset === 'lt2h' ? '< 2 h' : '> 2 h'}</p>}</td>
                        <td className="text-sm">{o.displayName ?? 'Anonymous'}<p className="text-xs text-ink-3">{who(o)} · <span className="mono">{o.deviceId}</span></p></td>
                        <td className="mono text-xs">{obsWeight(o).weight.toFixed(2)}</td>
                        <td><StatusPill kind="obs" status={o.status} />{o.signalId && <Link href={`/app/signals/${o.signalId}`} onClick={(e) => e.stopPropagation()} className="mono mt-1 block text-[11px] font-bold text-plum hover:underline">{o.signalId}</Link>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager {...paged} noun="reports" />
            </>
          )}
        </Card>

        <div className="space-y-5 xl:col-span-3">
          <Card>
            <CardHead title="Urgent sentinel reports" icon={TriangleAlert} />
            <ActionList items={urgent} empty={<Empty title="Nothing urgent" body="No acute animal reports, verified findings or uncorroborated reports during a Watch in the last 72 h." className="py-8" />} />
          </Card>
          <div className="rounded-2xl border border-dashed border-line-strong p-4 text-xs text-ink-2">
            <p className="flex items-center gap-1.5 font-bold text-ink"><ShieldCheck className="h-4 w-4 text-[#1F9483]" />Privacy safeguards</p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>Walkers have no accounts — device IDs are random.</li>
              <li>Photos are re-encoded on the reporter’s device; EXIF and GPS never arrive.</li>
              <li>Location is kept only as the nearest monitored site.</li>
              <li>Reporters can erase their data from the public app at any time.</li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
