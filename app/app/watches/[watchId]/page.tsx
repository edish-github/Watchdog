'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ClipboardCheck, CloudSun, Eye, Link2, Sigma, Trees } from 'lucide-react';
import type { Watch } from '@/lib/types';
import { useWD } from '@/lib/store';
import { CITY, HAZARDS, PEOPLE, SITE } from '@/lib/catalog';
import { RULES, dailyWatch, expectedEnd } from '@/lib/engine';
import { cn, dayAdd, daysBetween, fmtDay, fmtSpan, fmtWhen, hoursBetween, localDate } from '@/lib/utils';
import { Card, CardHead, Empty, HazardTag, KV } from '@/components/ui';
import { DetailHeader, StatusPill } from '@/components/console/kit';
import { FactorTable, Formula, normalTmax, triggerFactors, vulnFactors } from '@/components/console/explain';
import { RequestLookModal } from '@/components/console/request-look';

export default function WatchDetailPage() {
  const { watchId } = useParams<{ watchId: string }>();
  const d = useWD((s) => s.d);
  const w = d.watches.find((x) => x.id === decodeURIComponent(watchId ?? ''));
  if (!w) return <Card><Empty icon={Eye} title="Watch window not found" body="It may belong to a different replay scenario." action={<Link href="/app/watches" className="btn btn-primary btn-sm">All watches</Link>} /></Card>;
  return <WatchDetail watch={w} />;
}

function DailyBars({ days, today }: { days: { date: string; score: number }[]; today: string }) {
  const W = 720, H = 210, P = { l: 30, r: 10, t: 14, b: 36 }, n = days.length, bw = (W - P.l - P.r) / n;
  const Y = (v: number) => P.t + (1 - Math.min(100, v) / 100) * (H - P.t - P.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Daily watch scores: ${days.map((x) => `${x.date} ${x.score}`).join(', ')}`}>
      {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--line))" /><text x={P.l - 6} y={Y(v) + 3.5} textAnchor="end" className="fill-ink-3" style={{ fontSize: 10 }}>{v}</text></g>)}
      {days.map((x, i) => {
        const fc = x.date > today, fill = x.score >= RULES.tiers.watchOpen ? '#D99A2B' : x.score >= RULES.tiers.watchClose ? '#E8D3A5' : '#D8D1C4';
        const cx = P.l + i * bw;
        return (
          <g key={x.date}>
            <rect x={cx + 5} y={Y(x.score)} width={bw - 10} height={H - P.b - Y(x.score)} rx="6" fill={fill} opacity={fc ? 0.55 : 1} stroke={fc ? '#8F520A' : 'none'} strokeDasharray={fc ? '3 3' : undefined} />
            <text x={cx + bw / 2} y={Y(x.score) - 5} textAnchor="middle" className="fill-ink" style={{ fontSize: 10, fontWeight: 700 }}>{x.score}</text>
            <text x={cx + bw / 2} y={H - 18} textAnchor="middle" className={x.date === today ? 'fill-plum' : 'fill-ink-2'} style={{ fontSize: 10, fontWeight: 700 }}>{fmtDay(`${x.date}T12:00:00Z`, 'UTC').split(' ').slice(0, 2).join(' ')}</text>
            {x.date === today && <text x={cx + bw / 2} y={H - 5} textAnchor="middle" className="fill-plum" style={{ fontSize: 9, fontWeight: 700 }}>TODAY</text>}
          </g>
        );
      })}
      <line x1={P.l} x2={W - P.r} y1={Y(RULES.tiers.watchOpen)} y2={Y(RULES.tiers.watchOpen)} stroke="#D99A2B" strokeWidth="1.5" strokeDasharray="6 4" />
      <line x1={P.l} x2={W - P.r} y1={Y(RULES.tiers.watchClose)} y2={Y(RULES.tiers.watchClose)} stroke="rgb(var(--ink-3))" strokeDasharray="1 4" />
    </svg>
  );
}

function WatchDetail({ watch }: { watch: Watch }) {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const [look, setLook] = useState(false);
  const site = SITE[watch.siteId], city = CITY[site.cityId], active = !watch.closedAt;
  const today = localDate(d.now, city.tz);
  const ref = active ? today : watch.peakDate;
  const b = dailyWatch(site, watch.hazard, ref);
  const end = active ? expectedEnd(site, watch.hazard, d.now) : watch.closedAt!;
  const windowEnd = watch.closedAt ?? d.now;
  const days = useMemo(() => {
    const first = dayAdd(localDate(watch.openedAt, city.tz), -3);
    const last = active ? dayAdd(today, 2) : dayAdd(localDate(watch.closedAt!, city.tz), 1);
    return Array.from({ length: Math.min(21, daysBetween(first, last) + 1) }, (_, i) => { const date = dayAdd(first, i); return { date, score: dailyWatch(site, watch.hazard, date).score }; });
  }, [watch, site, city.tz, active, today]);
  const inWindow = (at: string) => at >= watch.openedAt && at <= windowEnd;
  const signals = d.signals.filter((s) => s.siteId === site.id && s.hazard === watch.hazard && inWindow(s.openedAt));
  const looks = d.looks.filter((l) => l.siteId === site.id && inWindow(l.createdAt));
  const advisories = d.advisories.filter((a) => a.siteId === site.id && inWindow(a.createdAt));
  const reports = d.observations.filter((o) => o.siteId === site.id && inWindow(o.createdAt));
  const normal = normalTmax(site.cityId, b.date);

  return (
    <>
      <DetailHeader back="/app/watches" backLabel="Watches" eyebrow={`Watch detail · ${watch.id}`} title={<>{site.id} · <span className="text-ink-3">{site.stream}</span></>}
        sub={`${site.reach}, ${city.name} · ${HAZARDS[watch.hazard].long}`}
        badges={<><StatusPill kind="watch" status={active ? 'active' : 'closed'} /><HazardTag hazard={watch.hazard} /><span className="chip">Elapsed {fmtSpan(hoursBetween(windowEnd, watch.openedAt))}</span>{active && <span className="chip">Remaining ≈ {fmtSpan(hoursBetween(end, d.now))}</span>}</>}
        actions={<><Link href={`/app/sites/${site.id}`} className="btn btn-outline">Site telemetry</Link>{active && <button className="btn btn-primary" onClick={() => setLook(true)}><ClipboardCheck className="h-4 w-4" />Request look</button>}</>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-6">
          <CardHead title={`Weather telemetry · ${active ? 'today' : 'at peak'}`} icon={CloudSun} sub={`${fmtDay(`${b.date}T12:00:00Z`, 'UTC')} · synthetic Open-Meteo / GloFAS equivalents`} />
          <KV rows={watch.hazard === 'H1' ? [
            ['Max air temperature', `${b.weather.tmax.toFixed(1)} °C (${b.weather.tmax - normal >= 0 ? '+' : ''}${(b.weather.tmax - normal).toFixed(1)} vs normal)`],
            ['Precipitation, 14 days', `${b.weather.rain14.toFixed(1)} mm`],
            ['Discharge', `${b.weather.discharge} m³/s`],
            ['Seasonal normal discharge', `${site.baselineFlow} m³/s`],
            ['Flow ratio', `${Math.round(b.weather.flowRatio * 100)}%`],
          ] : [
            ['Rain, 24 h', `${b.weather.rain.toFixed(1)} mm`],
            ['Rain, 72 h', `${b.weather.rain72.toFixed(1)} mm`],
            ['Precipitation, 14 days', `${b.weather.rain14.toFixed(1)} mm`],
            ['Discharge', `${b.weather.discharge} m³/s (normal ${site.baselineFlow})`],
            ['Max air temperature', `${b.weather.tmax.toFixed(1)} °C`],
          ]} />
        </Card>
        <Card className="xl:col-span-6">
          <CardHead title="OAH vulnerability V(s)" icon={Trees} sub="Fixed site modifiers from OneAquaHealth habitat answers" />
          <div className="p-5"><FactorTable title="Composite vulnerability" factors={vulnFactors(b, site)} totalLabel="V(s)" total={b.vulnerability} /></div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Triggers & threshold trace" icon={Sigma} />
          <div className="space-y-4 p-5">
            <FactorTable title="Base hazard trigger T(d)" factors={triggerFactors(b)} totalLabel="T(d)" total={b.trigger} />
            <Formula w={b} />
          </div>
        </Card>
        <Card className="xl:col-span-5">
          <CardHead title="Window policy" />
          <KV rows={[
            ['Opened', fmtWhen(watch.openedAt, tz)],
            ['Peak forecast', `${watch.peak} / 100 on ${fmtDay(`${watch.peakDate}T12:00:00Z`, 'UTC')}`],
            [active ? 'Expected end' : 'Closed', fmtWhen(end, tz)],
            ['Opening rule', `any day in 72 h ≥ ${RULES.tiers.watchOpen}`],
            ['Closing rule', `every day in 72 h < ${RULES.tiers.watchClose}`],
            ['Rules', `v${RULES.version} · ${RULES.sha}`],
            ['Dispatched missions', looks.length ? looks.map((l) => l.id).join(', ') : 'None'],
          ]} />
        </Card>

        <Card className="xl:col-span-12">
          <CardHead title="Daily score trajectory" sub="Solid = observed days · dashed = forecast · amber line = opens at 50 · dotted = closes below 40" />
          <div className="px-5 pb-4 pt-3"><DailyBars days={days} today={today} /></div>
        </Card>

        <Card className="xl:col-span-12">
          <CardHead title="Connected incidents" icon={Link2} sub={`${reports.length} community reports at ${site.id} during this window`} />
          {signals.length + looks.length + advisories.length === 0 ? <Empty title="No incidents yet" body="Signals, look requests and advisories raised during this window appear here." /> : (
            <ul className="divide-y divide-line">
              {signals.map((s) => <li key={s.id}><Link href={`/app/signals/${s.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sand/50"><span className="mono w-24 text-xs font-bold text-plum">{s.id}</span><span className="flex-1 text-sm text-ink">Signal generated from this watch window · {s.openReason} · score {s.snapshot.score}</span><StatusPill kind="signal" status={s.status} /></Link></li>)}
              {looks.map((l) => <li key={l.id}><Link href={`/app/verification/${l.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sand/50"><span className="mono w-24 text-xs font-bold text-plum">{l.id}</span><span className="flex-1 text-sm text-ink">{l.purpose === 'resolve' ? 'Resolution check' : 'Look request'} assigned to {PEOPLE[l.assignee]?.name}{l.response ? ` · answered ${l.response.result.replace('_', ' ')}` : ''}</span><StatusPill kind="look" status={l.status} /></Link></li>)}
              {advisories.map((a) => <li key={a.id}><Link href={`/app/advisories/${a.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-sand/50"><span className="mono w-24 text-xs font-bold text-plum">{a.id}</span><span className="flex-1 text-sm text-ink">Advisory {a.approvedBy ? `approved by ${a.approvedBy}` : 'in draft'}</span><StatusPill kind="advisory" status={a.status} /></Link></li>)}
            </ul>
          )}
        </Card>
      </div>

      <RequestLookModal open={look} onClose={() => setLook(false)} siteId={site.id} hazard={watch.hazard} />
    </>
  );
}
