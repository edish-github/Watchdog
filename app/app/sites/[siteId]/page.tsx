'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowUpRight, BookOpen, ClipboardCheck, CloudRain, History, Inbox, MapPin, Thermometer, Trees, Users, Waves } from 'lucide-react';
import type { HazardId, Site } from '@/lib/types';
import { useWD } from '@/lib/store';
import { siteStatus } from '@/lib/select';
import { CITY, HAZARDS, PEOPLE, SIGNS, SITE } from '@/lib/catalog';
import { RULES, dailyWatch, forecastSeries, watchToday } from '@/lib/engine';
import { cn, dayAdd, fmtDay, fmtWhen, localDate } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, HazardTag, KV, Segmented, TierBadge, type ActionItem } from '@/components/ui';
import { ForecastChart } from '@/components/charts';
import { DetailHeader, Fact, StatusPill } from '@/components/console/kit';
import { FactorTable, Formula, normalTmax, triggerFactors, vulnFactors } from '@/components/console/explain';
import { RequestLookModal } from '@/components/console/request-look';

export default function SiteDetailPage() {
  const { siteId } = useParams<{ siteId: string }>();
  const site = SITE[(siteId ?? '').toUpperCase()];
  if (!site) return <Card><Empty icon={MapPin} title="Unknown site" body={`No monitored site has the id ${siteId}.`} action={<Link href="/app/sites" className="btn btn-primary btn-sm">All sites</Link>} /></Card>;
  return <SiteDetail site={site} />;
}

const DOT: Record<string, string> = { watch: 'bg-[#D99A2B]', signal: 'bg-[#E0672E]', advisory: 'bg-[#C8344F]', look: 'bg-river' };

function SiteDetail({ site }: { site: Site }) {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const city = CITY[site.cityId];
  const st = useMemo(() => siteStatus(d, site), [d, site]);
  const [picked, setPicked] = useState<HazardId | null>(null);
  const [look, setLook] = useState(false);
  const hz = picked ?? st.hazard;
  const w = watchToday(site, hz, d.now);
  const series = useMemo(() => forecastSeries(site, hz, d.now), [site, hz, d.now]);
  const today = localDate(d.now, city.tz);
  const trace = useMemo(() => Array.from({ length: 10 }, (_, i) => dailyWatch(site, hz, dayAdd(today, i - 7))), [site, hz, today]);
  const obs = useMemo(() => d.observations.filter((o) => o.siteId === site.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8), [d, site.id]);
  const history = useMemo(() => {
    const ev: { at: string; label: string; id: string; href: string; kind: string }[] = [];
    for (const x of d.watches.filter((x) => x.siteId === site.id)) {
      ev.push({ at: x.openedAt, label: `Watch opened · ${HAZARDS[x.hazard].name} · peak ${x.peak}`, id: x.id, href: `/app/watches/${x.id}`, kind: 'watch' });
      if (x.closedAt) ev.push({ at: x.closedAt, label: 'Watch closed', id: x.id, href: `/app/watches/${x.id}`, kind: 'watch' });
    }
    for (const s of d.signals.filter((s) => s.siteId === site.id)) ev.push({ at: s.openedAt, label: `Signal opened · ${s.openReason}`, id: s.id, href: `/app/signals/${s.id}`, kind: 'signal' });
    for (const a of d.advisories.filter((a) => a.siteId === site.id)) {
      if (a.publishedAt) ev.push({ at: a.publishedAt, label: `Advisory published by ${a.approvedBy}`, id: a.id, href: `/app/advisories/${a.id}`, kind: 'advisory' });
      if (a.closedAt) ev.push({ at: a.closedAt, label: `Advisory ${a.status} · ${a.closeReason ?? ''}`, id: a.id, href: `/app/advisories/${a.id}`, kind: 'advisory' });
    }
    for (const l of d.looks.filter((l) => l.siteId === site.id)) ev.push({ at: l.createdAt, label: `${l.purpose === 'resolve' ? 'Resolution check' : 'Look request'} → ${PEOPLE[l.assignee]?.name ?? l.assignee}`, id: l.id, href: `/app/verification/${l.id}`, kind: 'look' });
    return ev.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 10);
  }, [d, site.id]);

  const normal = normalTmax(site.cityId, w.date);
  const actions: ActionItem[] = [
    ...(st.signal ? [{ key: 'sig', tier: 'signal' as const, href: `/app/signals/${st.signal.id}`, title: `Review ${st.signal.id}`, meta: `${st.signal.snapshot.evidence.reporters} reporters · score ${st.signal.snapshot.score} · ${st.signal.status.replace('_', ' ')}` }] : []),
    { key: 'adv', tier: 'advisory', href: `/app/advisories/new?site=${site.id}&hazard=${hz}${st.signal ? `&signal=${st.signal.id}` : ''}`, title: 'Issue precaution', meta: 'Draft a bilingual advisory — nothing publishes without your approval' },
    { key: 'look', tier: 'watch', onClick: () => setLook(true), title: 'Request look', meta: `Send ${PEOPLE[city.volunteers[0]]?.name ?? 'a volunteer'} with a ${hz} checklist` },
    { key: 'obs', href: `/app/observations?site=${site.id}`, title: 'View observations', meta: `${d.observations.filter((o) => o.siteId === site.id).length} reports at this site` },
    { key: 'oah', href: '/app/ledger', title: 'OAH measures plan', meta: 'Season ledger · restoration candidates' },
  ];

  return (
    <>
      <DetailHeader back="/app/sites" backLabel="Sites" eyebrow={`${site.id} · ${city.name}, ${city.country}`} title={site.stream}
        sub={`${site.reach} · ${site.lat.toFixed(4)}° N, ${Math.abs(site.lon).toFixed(4)}° ${site.lon < 0 ? 'W' : 'E'}`}
        badges={<><TierBadge tier={st.tier} /><HazardTag hazard={hz} long />{st.watch && <StatusPill kind="watch" status="active" />}</>}
        actions={<><Link href={`/observe/sites/${site.id}`} target="_blank" className="btn btn-outline"><ArrowUpRight className="h-4 w-4" />Public page</Link><button className="btn btn-primary" onClick={() => setLook(true)}><ClipboardCheck className="h-4 w-4" />Request look</button></>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Fact icon={Thermometer} label="Max air temperature" value={`${w.weather.tmax.toFixed(1)} °C`} sub={`${w.weather.tmax - normal >= 0 ? '+' : ''}${(w.weather.tmax - normal).toFixed(1)} °C vs ${normal.toFixed(1)} normal`} />
        <Fact icon={CloudRain} label="Rain, 14 days" value={`${w.weather.rain14.toFixed(1)} mm`} sub={`${w.weather.rain72.toFixed(1)} mm in 72 h · ${w.weather.rain.toFixed(1)} today`} />
        <Fact icon={Waves} label="River flow vs normal" value={`${Math.round(w.weather.flowRatio * 100)}%`} sub={`${w.weather.discharge} m³/s · normal ${site.baselineFlow}`} />
        <Fact icon={Trees} label="Shade cover" value={`${Math.round(site.habitat.shadeCover * 100)}%`} sub="OAH riparian vegetation answer" />
        <Fact icon={Users} label="Public followers" value={site.followers} sub="Receive in-app alerts" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHead title="72-hour hazard trajectory & uncertainty band" icon={Waves} action={<Segmented size="sm" label="Hazard" value={hz} onChange={setPicked} options={[{ value: 'H1', label: 'H1 · Heat & low flow' }, { value: 'H2', label: 'H2 · Wet weather' }]} />} />
          <div className="px-5 pb-2 pt-4">
            <ForecastChart series={series} tz={city.tz} />
            <p className="pb-2 text-xs text-ink-3">Grey = observed (last 24 h) · plum = forecast · shaded band = uncertainty, widening with lead time. Times in {city.name} local time.</p>
          </div>
        </Card>
        <Card className="xl:col-span-4">
          <CardHead title="Coordinator actions" />
          <ActionList items={actions} />
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title={`Why the score is ${w.score} / 100`} sub={`${HAZARDS[hz].long} · ${fmtDay(`${w.date}T12:00:00Z`, 'UTC')}`} />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <FactorTable title="Trigger T(d) · weather & flow" factors={triggerFactors(w)} totalLabel="T(d)" total={w.trigger} />
            <FactorTable title="Vulnerability V(s) · OAH habitat" factors={vulnFactors(w, site)} totalLabel="V(s)" total={w.vulnerability} />
          </div>
          <div className="px-5 pb-5"><Formula w={w} /></div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Daily trace · 7 days back, 2 ahead" icon={History} />
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Day</th><th>Tmax</th>{hz === 'H1' ? <><th>Rain 14 d</th><th>Flow</th></> : <><th>Rain</th><th>Rain 72 h</th></>}<th>T</th><th>Score</th></tr></thead>
              <tbody>
                {trace.map((x) => (
                  <tr key={x.date} className={cn(x.date === today && 'bg-plum-soft/40', x.date > today && 'italic text-ink-2')}>
                    <td className="whitespace-nowrap font-bold">{fmtDay(`${x.date}T12:00:00Z`, 'UTC')}{x.date === today ? ' · today' : x.date > today ? ' · fc' : ''}</td>
                    <td className="tabular-nums">{x.weather.tmax.toFixed(1)}°</td>
                    {hz === 'H1' ? <><td className="tabular-nums">{x.weather.rain14.toFixed(1)}</td><td className="tabular-nums">{Math.round(x.weather.flowRatio * 100)}%</td></> : <><td className="tabular-nums">{x.weather.rain.toFixed(1)}</td><td className="tabular-nums">{x.weather.rain72.toFixed(1)}</td></>}
                    <td className="mono text-xs">{x.trigger.toFixed(2)}</td>
                    <td><span className={cn('inline-block min-w-[2.2rem] rounded-full px-2 py-0.5 text-center text-xs font-bold tabular-nums', x.score >= RULES.tiers.watchOpen ? 'bg-[#FBEFD2] text-[#8F520A]' : x.score >= RULES.tiers.watchClose ? 'bg-sand text-ink' : 'text-ink-3')}>{x.score}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHead title="OAH habitat answers" icon={Trees} />
          <KV rows={[
            ['Riparian shade cover', `${Math.round(site.habitat.shadeCover * 100)}%`],
            ['Channel modification', `${Math.round(site.habitat.channelModification * 100)}%`],
            ['Soil sealing (catchment)', `${Math.round(site.habitat.soilSealing * 100)}%`],
            ['Baseline discharge', `${site.baselineFlow} m³/s`],
            ['V(s) · H1 heat & low flow', dailyWatch(site, 'H1', today).vulnerability.toFixed(2)],
            ['V(s) · H2 wet weather', dailyWatch(site, 'H2', today).vulnerability.toFixed(2)],
          ]} />
          <div className="border-t border-line px-5 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-ink-2"><BookOpen className="h-3.5 w-3.5" />Evidence label</p>
            <p className="mt-1 text-xs text-ink-2">{HAZARDS[hz].evidence}.</p>
            <p className="mt-1 text-[11px] text-ink-3">Precedent: {HAZARDS[hz].precedent}</p>
          </div>
        </Card>

        <Card className="xl:col-span-4">
          <CardHead title="Activity at this site" icon={History} />
          {history.length ? (
            <ol className="space-y-3 p-5">
              {history.map((e, i) => (
                <li key={`${e.id}-${i}`} className="flex gap-3">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[e.kind])} />
                  <div className="min-w-0"><p className="text-sm text-ink"><Link href={e.href} className="mono text-xs font-bold text-plum hover:underline">{e.id}</Link> {e.label}</p><p className="text-[11px] text-ink-3">{fmtWhen(e.at, tz)}</p></div>
                </li>
              ))}
            </ol>
          ) : <Empty title="No activity yet" body="Watches, signals, looks and advisories at this site appear here." />}
        </Card>

        <Card className="xl:col-span-4">
          <CardHead title="Recent observations" icon={Inbox} action={<Link href={`/app/observations?site=${site.id}`} className="text-xs font-bold text-plum hover:underline">All</Link>} />
          {obs.length ? (
            <ul className="divide-y divide-line">
              {obs.map((o) => (
                <li key={o.id}>
                  <Link href={`/app/observations/${o.id}`} className="block px-5 py-3 transition hover:bg-sand/50">
                    <div className="flex items-center justify-between gap-2"><span className="mono text-xs font-bold text-ink">{o.id}</span><StatusPill kind="obs" status={o.status} /></div>
                    <p className="mt-0.5 truncate text-xs text-ink-2">{o.signs.map((s) => SIGNS[s].tag).join(', ') || 'Wellbeing note'} · {o.displayName ?? 'anonymous'}</p>
                    <p className="text-[11px] text-ink-3">{fmtWhen(o.createdAt, tz)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <Empty title="No reports here yet" body="Reports from the public app appear here." />}
        </Card>
      </div>

      <RequestLookModal open={look} onClose={() => setLook(false)} siteId={site.id} hazard={hz} signalId={st.signal?.id} />
    </>
  );
}
