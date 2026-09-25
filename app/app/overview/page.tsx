'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Activity, ArrowRight, ArrowUpRight, CloudRain, Droplets, Eye, Inbox, Layers, MapPin, Radar, ShieldAlert, Thermometer, Trees, Waves } from 'lucide-react';
import type { HazardId, TierId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useActor } from '@/lib/hooks';
import { allStatuses, feed, personName, priorities } from '@/lib/select';
import { CITIES, CITY, HAZARDS, PEOPLE, SITE, TIERS } from '@/lib/catalog';
import { expectedEnd, forecastSeries, watchToday } from '@/lib/engine';
import { cn, fmtClock, fmtDay, fmtSpan, hoursBetween, localDate, localHours, pad } from '@/lib/utils';
import { hrefFor } from '@/lib/links';
import type { IconType } from '@/components/icons';
import { ActionList, Card, CardHead, Empty, Meter, PageHeader, Segmented, TierBadge, TierDot } from '@/components/ui';
import { ForecastChart } from '@/components/charts';
import { MapLegend, NetworkMap, citySummary } from '@/components/network-map';

function StatCard({ href, icon: Icon, label, value, tone, children }: { href: string; icon: IconType; label: string; value: number; tone: TierId; children: React.ReactNode }) {
  return (
    <Link href={href} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-center justify-between"><span className="eyebrow">{label}</span><span className="grid h-8 w-8 place-items-center rounded-xl" style={{ background: TIERS[tone].soft, color: TIERS[tone].hex }}><Icon className="h-4 w-4" /></span></div>
      <p className="display mt-3 text-[3.2rem] leading-none tabular-nums">{pad(value)}</p>
      <div className="mt-4 flex-1 space-y-1.5 text-[13px] text-ink-2">{children}</div>
      <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-plum transition group-hover:text-plum-2">Open<ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" /></span>
    </Link>
  );
}

const KIND_DOT = { system: 'bg-river', human: 'bg-plum', report: 'bg-[#D99A2B]' } as const;

export default function OverviewPage() {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const me = useActor();
  const statuses = useMemo(() => allStatuses(d), [d]);
  const todo = useMemo(() => priorities(d), [d]);
  const events = useMemo(() => feed(d, 9), [d]);
  const watches = useMemo(() => d.watches.filter((w) => !w.closedAt).map((w) => {
    const site = SITE[w.siteId];
    return { w, site, score: watchToday(site, w.hazard, d.now).score, end: expectedEnd(site, w.hazard, d.now) };
  }).sort((a, b) => b.score - a.score), [d]);
  const review = useMemo(() => d.signals.filter((s) => s.status === 'open').sort((a, b) => b.snapshot.score - a.snapshot.score), [d]);
  const inField = d.signals.filter((s) => s.status === 'look_requested').length;
  const live = d.advisories.filter((a) => a.status === 'live');
  const drafts = d.advisories.filter((a) => a.status === 'draft').length;
  const today = localDate(d.now, tz);
  const reports = d.observations.filter((o) => localDate(o.createdAt, tz) === today);
  const latest = reports[0];
  const pending = d.observations.filter((o) => o.status === 'pending').length;
  const looks = d.looks.filter((l) => l.status === 'queued' || l.status === 'accepted').length;
  const hour = localHours(d.now, tz);
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const options = useMemo(() => {
    const base: { siteId: string; hz: HazardId }[] = watches.length
      ? watches.map((x) => ({ siteId: x.site.id, hz: x.w.hazard }))
      : [...statuses].sort((a, b) => b.score - a.score).slice(0, 3).map((s) => ({ siteId: s.site.id, hz: s.hazard }));
    return base.slice(0, 4).map((o) => ({ ...o, key: `${o.siteId}:${o.hz}` }));
  }, [watches, statuses]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const focus = options.find((o) => o.key === focusKey) ?? options[0];
  const fSite = SITE[focus.siteId];
  const series = useMemo(() => forecastSeries(fSite, focus.hz, d.now), [fSite, focus.hz, d.now]);
  const fw = watchToday(fSite, focus.hz, d.now);
  const factors: { icon: IconType; label: string; value: string; part: number }[] = focus.hz === 'H1'
    ? [
        { icon: Thermometer, label: 'Max air temp', value: `${fw.weather.tmax.toFixed(1)}°C`, part: fw.parts.heat },
        { icon: CloudRain, label: 'Rain, 14 days', value: `${fw.weather.rain14.toFixed(1)} mm`, part: fw.parts.dry },
        { icon: Waves, label: 'Flow vs normal', value: `${Math.round(fw.weather.flowRatio * 100)}%`, part: fw.parts.flow },
        { icon: Trees, label: 'Shade cover', value: `${Math.round(fSite.habitat.shadeCover * 100)}%`, part: fw.vulnParts.shadeDeficit },
      ]
    : [
        { icon: CloudRain, label: 'Rain today', value: `${fw.weather.rain.toFixed(1)} mm`, part: fw.parts.storm },
        { icon: Droplets, label: 'Rain, 72 h', value: `${fw.weather.rain72.toFixed(1)} mm`, part: fw.parts.burst },
        { icon: Layers, label: 'Soil sealing', value: `${Math.round(fSite.habitat.soilSealing * 100)}%`, part: fw.vulnParts.sealing },
        { icon: Waves, label: 'Channel modified', value: `${Math.round(fSite.habitat.channelModification * 100)}%`, part: fw.vulnParts.channel },
      ];

  return (
    <>
      <PageHeader
        eyebrow={`${greet}, ${me?.short ?? 'coordinator'} · ${fmtDay(d.now, tz)} · ${fmtClock(d.now, tz)}`}
        title={<>What needs attention <span className="text-ink-3">today?</span></>}
        sub="Every tile is computed live from the replay clock — weather, river flow, each site’s habitat answers and the reports people send."
        actions={
          <>
            <Link href="/app/signals" className="btn btn-primary"><Radar className="h-4 w-4" />Signal inbox{review.length > 0 && <span className="rounded-full bg-paper/25 px-1.5 text-xs">{review.length}</span>}</Link>
            <Link href="/observe" target="_blank" className="btn btn-outline"><ArrowUpRight className="h-4 w-4" />Public map</Link>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="grid gap-5 sm:grid-cols-2 xl:col-span-12 xl:grid-cols-4">
          <StatCard href="/app/watches" icon={Eye} label="Active watches" value={watches.length} tone="watch">
            {watches.slice(0, 3).map((x) => (
              <p key={x.w.id} className="flex items-center justify-between gap-2"><span className="truncate"><b className="mono text-ink">{x.site.id}</b> · {HAZARDS[x.w.hazard].name}</span><span className="shrink-0 tabular-nums text-ink-3">{fmtSpan(hoursBetween(x.end, d.now))}</span></p>
            ))}
            {!watches.length && <p>No watch windows open. Forecast is below 50 everywhere.</p>}
          </StatCard>
          <StatCard href={review[0] ? `/app/signals/${review[0].id}` : '/app/signals'} icon={Radar} label="Signals pending" value={review.length} tone="signal">
            {review[0] ? (
              <>
                <p><b className="mono text-ink">{review[0].siteId}</b> · review required</p>
                <p>{review[0].snapshot.evidence.reporters} reporters · {review[0].snapshot.evidence.categories.length} sign types</p>
                <p>Score <b className="text-ink">{review[0].snapshot.score}</b>/100{review[0].snapshot.gate && ' · advisory gate met'}</p>
              </>
            ) : <><p>No signals awaiting a decision.</p><p>{inField} awaiting field looks</p></>}
          </StatCard>
          <StatCard href="/app/observations" icon={Inbox} label="Reports today" value={reports.length} tone="quiet">
            <p>{pending} awaiting corroboration</p>
            <p>{looks} field look{looks === 1 ? '' : 's'} open</p>
            {latest && <p className="truncate">Latest <b className="mono text-ink">{latest.id}</b> at {latest.siteId} · {fmtClock(latest.createdAt, tz)}</p>}
          </StatCard>
          <StatCard href="/app/advisories" icon={ShieldAlert} label="Live advisories" value={live.length} tone="advisory">
            {live.slice(0, 2).map((a) => <p key={a.id} className="truncate"><b className="mono text-ink">{a.siteId}</b> · until {fmtDay(a.validUntil, CITY[SITE[a.siteId].cityId].tz)} {fmtClock(a.validUntil, CITY[SITE[a.siteId].cityId].tz)}</p>)}
            {!live.length && <p>No precautions in effect.</p>}
            <p>{drafts} draft{drafts === 1 ? '' : 's'} awaiting approval</p>
          </StatCard>
        </div>

        <Card className="xl:col-span-8">
          <CardHead title="Network poster stream map" icon={MapPin} sub={`${statuses.length} monitored reaches · 5 pilot cities`} action={<MapLegend className="hidden md:flex" />} />
          <div className="dot-grid bg-canvas/40 p-2 sm:p-4"><NetworkMap statuses={statuses} /></div>
          <MapLegend className="border-t border-line px-5 py-3 md:hidden" />
        </Card>

        <Card className="flex flex-col xl:col-span-4">
          <CardHead title="Priority action dispatch" icon={Activity} action={<span className="chip">{todo.length} open</span>} />
          <div className="flex-1">
            <ActionList items={todo.slice(0, 7)} empty={<Empty title="Nothing needs a decision" body="No open signals, drafts, bundles or field looks. The forecast keeps watching." className="py-16" />} />
          </div>
          {todo.length > 7 && <p className="border-t border-line px-5 py-3 text-xs text-ink-3">+{todo.length - 7} more in the inboxes</p>}
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Forecast focus · 72 hours" icon={Eye} sub={`${fSite.id} · ${fSite.stream}, ${CITY[fSite.cityId].name}`}
            action={<Link href={`/app/sites/${fSite.id}`} className="btn btn-ghost btn-sm">Open site<ArrowRight className="h-3.5 w-3.5" /></Link>} />
          <div className="px-5 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {options.length > 1 ? <Segmented size="sm" label="Focus site" value={focus.key} onChange={setFocusKey} options={options.map((o) => ({ value: o.key, label: `${o.siteId} · ${o.hz}` }))} /> : <span className="chip">{focus.siteId} · {HAZARDS[focus.hz].name}</span>}
              <p className="mono text-xs text-ink-2">T {fw.trigger.toFixed(2)} × V {fw.vulnerability.toFixed(2)} → <b className="text-ink">{fw.score}</b>/100</p>
            </div>
            <ForecastChart series={series} tz={CITY[fSite.cityId].tz} className="mt-3" />
          </div>
          <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-4">
            {factors.map((f) => {
              const I = f.icon;
              return (
                <div key={f.label} className="bg-paper px-5 py-3.5">
                  <p className="flex items-center gap-1.5 text-xs text-ink-3"><I className="h-3.5 w-3.5" />{f.label}</p>
                  <p className="mt-1 text-lg font-bold tabular-nums text-ink">{f.value}</p>
                  <Meter value={f.part} max={1} tone="watch" className="mt-2 !h-1.5" label={`${f.label} contribution`} />
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="flex flex-col xl:col-span-5">
          <CardHead title="Recent network telemetry" icon={Activity} action={<span className="inline-flex items-center gap-1.5 text-xs text-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-[#1F9483]" />Live</span>} />
          <ul className="flex-1 divide-y divide-line/80">
            {events.map((e) => {
              const href = hrefFor(e.target), sameDay = localDate(e.at, tz) === today;
              return (
                <li key={e.id} className="grid grid-cols-[52px_10px_1fr] items-start gap-3 px-5 py-3">
                  <span className="mono pt-0.5 text-xs tabular-nums text-ink-3">{fmtClock(e.at, tz)}{!sameDay && <span className="block text-[10px]">{fmtDay(e.at, tz).split(' ').slice(1).join(' ')}</span>}</span>
                  <span className={cn('mt-1.5 h-2 w-2 rounded-full', KIND_DOT[e.kind])} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm text-ink"><span className="font-bold">{e.action}</span>{' '}{href ? <Link href={href} className="mono text-xs text-plum hover:underline">{e.target}</Link> : <span className="mono text-xs text-ink-3">{e.target}</span>}</p>
                    {e.detail && <p className="truncate text-xs text-ink-2">{e.detail}</p>}
                    <p className="text-[11px] text-ink-3">{e.actor}</p>
                  </div>
                </li>
              );
            })}
            {!events.length && <li><Empty title="No activity yet" body="Play the replay clock to watch the network come alive." /></li>}
          </ul>
          <div className="flex gap-4 border-t border-line px-5 py-3 text-[11px] text-ink-3">
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-river" />Engine</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-plum" />Staff</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-[#D99A2B]" />Reports</span>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 xl:col-span-12">
          {CITIES.map((city) => {
            const sum = citySummary(statuses, city.id);
            return (
              <div key={city.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="display text-2xl leading-none">{city.name}</p><p className="mt-1 text-xs text-ink-3">{city.country} · {fmtClock(d.now, city.tz)} local</p></div>
                  <TierBadge tier={sum.top} size="sm" />
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {sum.sites.map((s) => (
                    <Link key={s.site.id} href={`/app/sites/${s.site.id}`} className="mono inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 transition hover:border-ink-3 hover:text-ink">
                      <TierDot tier={s.tier} pulse={s.tier === 'signal' || s.tier === 'advisory'} />{s.site.id}
                    </Link>
                  ))}
                </div>
                <p className="mt-3 truncate text-xs text-ink-2">{personName(city.coordinator)} · {PEOPLE[city.volunteers[0]]?.short} in the field</p>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
