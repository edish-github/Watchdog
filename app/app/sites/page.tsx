'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Activity, LayoutList, Map as MapIcon, MapPin } from 'lucide-react';
import type { CityId, TierId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { allStatuses, type SiteStatus } from '@/lib/select';
import { CITIES, CITY, HAZARDS, TIERS, TIER_ORDER } from '@/lib/catalog';
import { expectedEnd, forecastSeries, vulnerability, watchToday } from '@/lib/engine';
import { fmtAgo, fmtSpan, hoursBetween } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, Meter, PageHeader, Segmented, SyntheticBadge, TierBadge } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { MapLegend, NetworkMap } from '@/components/network-map';
import { Pager, SearchInput, Select, SortHeader, usePaged } from '@/components/console/kit';
import { driverText } from '@/components/console/explain';

type SortKey = 'site' | 'city' | 'tier' | 'score' | 'reports';
const rank = (t: TierId) => TIER_ORDER.indexOf(t);

function condition(st: SiteStatus, now: string) {
  if (st.advisory) return `${st.advisory.id} live · ${fmtSpan(hoursBetween(st.advisory.validUntil, now))} left`;
  if (st.signal && st.tier === 'signal') return `${st.signal.id} · score ${st.signal.snapshot.score} · ${st.signal.snapshot.evidence.reporters} reporter${st.signal.snapshot.evidence.reporters === 1 ? '' : 's'}`;
  if (st.watch) return `${HAZARDS[st.watch.hazard].name} · ${fmtSpan(hoursBetween(expectedEnd(st.site, st.watch.hazard, now), now))} left`;
  if (st.tier === 'resolved') return 'Resolved in the last 24 h';
  return 'Normal baseline';
}

export default function SitesPage() {
  const d = useWD((s) => s.d);
  const router = useRouter();
  const statuses = useMemo(() => allStatuses(d), [d]);
  const [q, setQ] = useState('');
  const [city, setCity] = useState<'all' | CityId>('all');
  const [tier, setTier] = useState<'all' | TierId>('all');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'tier', dir: 1 });

  const activity = useMemo(() => {
    const m = new Map<string, { last?: string; n72: number }>();
    for (const o of d.observations) {
      const e = m.get(o.siteId) ?? { n72: 0 };
      if (!e.last || o.createdAt > e.last) e.last = o.createdAt;
      if (o.signs.length && hoursBetween(d.now, o.createdAt) <= 72) e.n72++;
      m.set(o.siteId, e);
    }
    return m;
  }, [d]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = statuses.filter((s) => (city === 'all' || s.site.cityId === city) && (tier === 'all' || s.tier === tier)
      && (!needle || `${s.site.id} ${s.site.stream} ${s.site.reach} ${CITY[s.site.cityId].name}`.toLowerCase().includes(needle)));
    const val = (s: SiteStatus): number | string => sort.key === 'site' ? s.site.id : sort.key === 'city' ? CITY[s.site.cityId].name
      : sort.key === 'score' ? -s.score : sort.key === 'reports' ? -(activity.get(s.site.id)?.n72 ?? 0) : rank(s.tier) * 1000 - s.score;
    return r.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [statuses, q, city, tier, sort, activity]);

  const paged = usePaged(rows, 8);
  const { setPage } = paged;
  useEffect(() => setPage(0), [q, city, tier, setPage]);
  const by = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const th = (label: string, key: SortKey) => <SortHeader label={label} active={sort.key === key} dir={sort.dir} onClick={() => by(key)} />;
  const triage = useMemo(() => [...statuses].sort((a, b) => rank(a.tier) - rank(b.tier) || b.score - a.score).slice(0, 3), [statuses]);
  const tierCount = (t: TierId) => statuses.filter((s) => s.tier === t).length;

  return (
    <>
      <PageHeader eyebrow="Network · Sites" title={<>Site <span className="text-ink-3">explorer</span></>}
        sub={`${statuses.length} monitored reaches across ${CITIES.length} OneAquaHealth pilot cities. Scores are recomputed live from weather, river flow and each site’s habitat answers.`}
        actions={<><SyntheticBadge /><Segmented label="View" value={view} onChange={setView} options={[{ value: 'list', label: <span className="inline-flex items-center gap-1.5"><LayoutList className="h-3.5 w-3.5" />List</span> }, { value: 'map', label: <span className="inline-flex items-center gap-1.5"><MapIcon className="h-3.5 w-3.5" />Map</span> }]} /></>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-9">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <SearchInput value={q} onChange={setQ} placeholder="Search sites, streams, reaches…" className="min-w-[220px] flex-1" />
            <Select label="City" value={city} onChange={setCity} options={[{ value: 'all', label: 'All cities' }, ...CITIES.map((c) => ({ value: c.id, label: c.name }))]} />
            <Select label="Tier" value={tier} onChange={setTier} options={[{ value: 'all', label: 'All tiers' }, ...TIER_ORDER.map((t) => ({ value: t, label: `${TIERS[t].label} (${tierCount(t)})` }))]} />
          </div>
          {view === 'map' ? (
            <div className="dot-grid bg-canvas/40 p-3"><NetworkMap statuses={rows} /><MapLegend className="px-2 pt-2" /></div>
          ) : rows.length === 0 ? (
            <Empty icon={MapPin} title="No sites match" body="Clear the search or pick another city or tier." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="tbl min-w-[980px]">
                  <thead><tr><th>{th('Site', 'site')}</th><th>{th('City', 'city')}</th><th>{th('Status', 'tier')}</th><th>Hazard condition</th><th>{th('Score today', 'score')}</th><th>Next 72 h</th><th>V(s)</th><th>Shade</th><th>{th('Reports 72 h', 'reports')}</th><th>Last report</th></tr></thead>
                  <tbody>
                    {paged.slice.map((s) => {
                      const a = activity.get(s.site.id);
                      const spark = forecastSeries(s.site, s.hazard, d.now, 0, 72, 6).map((p) => p.score);
                      return (
                        <tr key={s.site.id} className="cursor-pointer" onClick={() => router.push(`/app/sites/${s.site.id}`)}>
                          <td><Link href={`/app/sites/${s.site.id}`} onClick={(e) => e.stopPropagation()} className="mono font-bold text-ink hover:text-plum">{s.site.id}</Link><p className="max-w-[210px] truncate text-xs text-ink-2">{s.site.stream} · {s.site.reach}</p></td>
                          <td>{CITY[s.site.cityId].name}<p className="text-xs text-ink-3">{CITY[s.site.cityId].country}</p></td>
                          <td><TierBadge tier={s.tier} size="sm" /></td>
                          <td className="max-w-[230px]"><p className="text-xs font-bold text-ink">{s.hazard} · {HAZARDS[s.hazard].name}</p><p className="truncate text-xs text-ink-2">{condition(s, d.now)}</p></td>
                          <td className="w-40"><div className="flex items-center gap-2"><span className="w-7 font-bold tabular-nums">{s.score}</span><Meter value={s.score} marker={50} tone={s.score >= 50 ? 'watch' : 'quiet'} className="flex-1" label={`Watch score ${s.score}`} /></div></td>
                          <td><Sparkline values={spark} threshold={50} className="h-8 w-24 text-ink" /></td>
                          <td className="mono text-xs">{vulnerability(s.site, s.hazard).value.toFixed(2)}</td>
                          <td className="tabular-nums">{Math.round(s.site.habitat.shadeCover * 100)}%</td>
                          <td className="tabular-nums">{a?.n72 ?? 0}</td>
                          <td className="whitespace-nowrap text-xs text-ink-2">{a?.last ? fmtAgo(a.last, d.now) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager {...paged} noun="sites" />
            </>
          )}
        </Card>

        <div className="space-y-5 xl:col-span-3">
          <Card>
            <CardHead title="Quick site triage" icon={Activity} />
            <ActionList items={triage.map((s) => ({ key: s.site.id, tier: s.tier, href: `/app/sites/${s.site.id}`, title: `${s.site.id} · score ${s.score}`, meta: driverText(watchToday(s.site, s.hazard, d.now), s.site) }))} />
          </Card>
          <Card>
            <CardHead title="Tier distribution" />
            <ul className="space-y-2.5 p-5">
              {TIER_ORDER.map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <TierBadge tier={t} size="sm" className="w-[92px] justify-center" />
                  <Meter value={tierCount(t)} max={statuses.length} tone={t === 'quiet' ? 'quiet' : t} className="flex-1" label={`${TIERS[t].label} sites`} />
                  <span className="w-5 text-right text-sm font-bold tabular-nums">{tierCount(t)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
