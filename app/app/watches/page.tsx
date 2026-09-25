'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Activity, Eye, Sigma } from 'lucide-react';
import type { HazardId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { activeSignal } from '@/lib/select';
import { CITY, HAZARDS, SITE, SITES } from '@/lib/catalog';
import { RULES, expectedEnd, forecastSeries, watchToday } from '@/lib/engine';
import { fmtDay, fmtSpan, fmtWhen, hoursBetween } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, KV, PageHeader, Segmented } from '@/components/ui';
import { Sparkline } from '@/components/charts';
import { StatusPill, Tabs } from '@/components/console/kit';

export default function WatchesPage() {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const [tab, setTab] = useState<'active' | 'past'>('active');
  const [hz, setHz] = useState<'all' | HazardId>('all');
  const match = (h: HazardId) => hz === 'all' || h === hz;

  const active = useMemo(() => d.watches.filter((w) => !w.closedAt && match(w.hazard)).map((w) => {
    const site = SITE[w.siteId];
    return {
      w, site, today: watchToday(site, w.hazard, d.now), end: expectedEnd(site, w.hazard, d.now), sig: activeSignal(d, site.id, w.hazard),
      pending: d.observations.filter((o) => o.siteId === site.id && o.status === 'pending').length,
      spark: forecastSeries(site, w.hazard, d.now, 0, 72, 6).map((p) => p.score),
    };
  }).sort((a, b) => b.today.score - a.today.score), [d, hz]); // eslint-disable-line react-hooks/exhaustive-deps
  const past = useMemo(() => d.watches.filter((w) => !!w.closedAt && match(w.hazard)).sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')), [d, hz]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalActive = d.watches.filter((w) => !w.closedAt).length;

  return (
    <>
      <PageHeader eyebrow="Network · Watches" title={<>Watch <span className="text-ink-3">windows</span></>}
        sub="Automated 72-hour predictive risk windows. A Watch opens when conditions and a site’s vulnerability make a hazard plausible — before anyone reports anything."
        actions={<Segmented label="Hazard" value={hz} onChange={setHz} options={[{ value: 'all', label: 'All hazards' }, { value: 'H1', label: 'H1 · Heat & low flow' }, { value: 'H2', label: 'H2 · Wet weather' }]} />} />

      <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: 'active', label: 'Active', count: active.length }, { value: 'past', label: 'Past', count: past.length }]} />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="xl:col-span-8">
          {tab === 'active' ? (
            active.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {active.map((x) => (
                  <Link key={x.w.id} href={`/app/watches/${x.w.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="eyebrow truncate">{x.site.id} · {x.site.stream}</p><p className="truncate text-xs text-ink-3">{CITY[x.site.cityId].name} · <span className="mono">{x.w.id}</span></p></div>
                      {x.sig ? <StatusPill kind="signal" status={x.sig.status} /> : <StatusPill kind="watch" status="active" />}
                    </div>
                    <div className="mt-4 flex items-end justify-between gap-4">
                      <div><p className="display text-5xl leading-none tabular-nums">{x.today.score}<span className="text-lg text-ink-3">/100</span></p><p className="mt-1 text-xs text-ink-3">today · peak {x.w.peak} on {fmtDay(`${x.w.peakDate}T12:00:00Z`, 'UTC')}</p></div>
                      <Sparkline values={x.spark} threshold={RULES.tiers.watchOpen} className="h-12 w-32 text-ink" />
                    </div>
                    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-xs">
                      <div><dt className="text-ink-3">Hazard</dt><dd className="font-bold text-ink">{x.w.hazard} · {HAZARDS[x.w.hazard].name}</dd></div>
                      <div><dt className="text-ink-3">Expires in</dt><dd className="font-bold tabular-nums text-ink">{fmtSpan(hoursBetween(x.end, d.now))}</dd></div>
                      <div><dt className="text-ink-3">V(s)</dt><dd className="mono font-bold text-ink">{x.today.vulnerability.toFixed(2)}</dd></div>
                    </dl>
                  </Link>
                ))}
              </div>
            ) : <Card><Empty icon={Eye} title="No active watch windows" body="Every monitored site is below the opening threshold for the next 72 hours. Play the replay clock to watch conditions change." /></Card>
          ) : (
            <Card>
              {past.length ? (
                <div className="overflow-x-auto">
                  <table className="tbl min-w-[720px]">
                    <thead><tr><th>Watch</th><th>Site</th><th>Hazard</th><th>Opened</th><th>Closed</th><th>Duration</th><th>Peak</th></tr></thead>
                    <tbody>
                      {past.map((w) => (
                        <tr key={w.id}>
                          <td><Link href={`/app/watches/${w.id}`} className="mono text-xs font-bold text-plum hover:underline">{w.id}</Link></td>
                          <td>{w.siteId}<p className="text-xs text-ink-3">{SITE[w.siteId].stream}</p></td>
                          <td className="text-xs">{w.hazard} · {HAZARDS[w.hazard].name}</td>
                          <td className="whitespace-nowrap text-xs">{fmtWhen(w.openedAt, tz)}</td>
                          <td className="whitespace-nowrap text-xs">{fmtWhen(w.closedAt!, tz)}</td>
                          <td className="tabular-nums">{fmtSpan(hoursBetween(w.closedAt!, w.openedAt))}</td>
                          <td className="font-bold tabular-nums">{w.peak}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty icon={Eye} title="No closed windows yet" body="Watches close when every day in the 72-hour horizon drops below 40. Advance the replay clock past the heatwave to see them close." />}
            </Card>
          )}
        </div>

        <div className="space-y-5 xl:col-span-4">
          <Card>
            <CardHead title="Watch window computation logic" icon={Sigma} />
            <div className="space-y-2 px-5 pt-4">
              <p className="mono rounded-xl bg-sand/60 px-3 py-2 text-xs text-ink">T₁(d) = {RULES.h1.w.heat}·heat + {RULES.h1.w.dry}·dry + {RULES.h1.w.flow}·flow</p>
              <p className="mono rounded-xl bg-sand/60 px-3 py-2 text-xs text-ink">T₂(d) = {RULES.h2.w.storm}·storm + {RULES.h2.w.burst}·burst72</p>
              <p className="mono rounded-xl bg-espresso px-3 py-2 text-xs text-paper">Watch = 100 × T(d) × V(s)</p>
            </div>
            <KV className="mt-2" rows={[
              ['Opens when', `any day in 72 h ≥ ${RULES.tiers.watchOpen}`],
              ['Closes when', `every day in 72 h < ${RULES.tiers.watchClose}`],
              ['Evaluated', `${RULES.cycleHoursUtc.map((h) => `${String(h).padStart(2, '0')}:00`).join(' & ')} UTC`],
              ['Last evaluation', d.lastCycle ? fmtWhen(d.lastCycle, tz) : '—'],
              ['Status', `${totalActive} active across ${SITES.length} sites`],
            ]} />
          </Card>
          <Card>
            <CardHead title="Watch escalation triggers" icon={Activity} />
            <ActionList
              items={active.map((x) => ({
                key: x.w.id, tier: x.sig ? 'signal' as const : 'watch' as const, href: x.sig ? `/app/signals/${x.sig.id}` : `/app/sites/${x.site.id}`,
                title: `${x.site.id} · ${x.sig ? `${x.sig.snapshot.evidence.reporters} reports fused · ${x.sig.id}` : x.pending ? `${x.pending} report${x.pending > 1 ? 's' : ''} awaiting corroboration` : 'No reports yet'}`,
                meta: x.sig ? `Score ${x.sig.snapshot.score} · review the signal` : x.pending ? 'Request a look to corroborate' : `Watch ${x.today.score} · consider a look request`,
              }))}
              empty={<Empty title="Nothing to escalate" body="No active watch windows." className="py-8" />}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
