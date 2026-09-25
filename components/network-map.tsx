'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CityId, TierId } from '@/lib/types';
import type { SiteStatus } from '@/lib/select';
import { CITIES, CITY, HAZARDS, TIERS } from '@/lib/catalog';
import { cn } from '@/lib/utils';
import { TIER_ICON, TierBadge } from './ui';

const VW = 760, VH = 440, SPREAD = 1.5;
export const project = (lat: number, lon: number) => ({ x: 70 + ((lon + 8.4) / 23.2) * 610, y: 60 + ((59.9 - lat) / 19.7) * 330 });
const LABEL: Record<CityId, { dx: number; dy: number; anchor: 'start' | 'end' }> = {
  coimbra: { dx: 52, dy: 14, anchor: 'start' }, toulouse: { dx: 50, dy: 30, anchor: 'start' }, ghent: { dx: 50, dy: -28, anchor: 'start' },
  oslo: { dx: 50, dy: 4, anchor: 'start' }, benevento: { dx: -50, dy: 30, anchor: 'end' },
};
const ROUTES: [CityId, CityId, number][] = [['oslo', 'ghent', 60], ['ghent', 'toulouse', -34], ['toulouse', 'coimbra', -40], ['toulouse', 'benevento', 46]];
const RANK: TierId[] = ['advisory', 'signal', 'watch', 'resolved'];

export function citySummary(statuses: SiteStatus[], city: CityId) {
  const sites = statuses.filter((x) => x.site.cityId === city);
  const parts = RANK.map((t) => ({ tier: t, n: sites.filter((x) => x.tier === t).length })).filter((p) => p.n > 0);
  const top: TierId = parts[0]?.tier ?? 'quiet';
  const text = parts.map((p) => `${p.n} ${TIERS[p.tier].label}`).join(' · ') || 'Quiet baseline';
  return { sites, parts, top, text };
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${(mx - (dy / len) * bend).toFixed(1)} ${(my + (dx / len) * bend).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}

export function NetworkMap({ statuses, hrefBase = '/app/sites/', className }: { statuses: SiteStatus[]; hrefBase?: string; className?: string }) {
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const pos = (st: SiteStatus) => { const c = CITY[st.site.cityId], p = project(c.lat, c.lon); return { x: p.x + st.site.map.dx * SPREAD, y: p.y + st.site.map.dy * SPREAD }; };
  const hovered = statuses.find((s) => s.site.id === hover);
  const go = (id: string) => router.push(`${hrefBase}${id}`);

  return (
    <div className={cn('relative', className)}>
      <svg viewBox={`0 0 ${VW} ${VH}`} className="h-auto w-full" role="group" aria-label="Poster map of monitored stream sites across five pilot cities">
        <defs>
          <radialGradient id="wd-map-glow" cx="50%" cy="55%" r="60%"><stop offset="0" stopColor="#EDE6EE" stopOpacity=".9" /><stop offset="1" stopColor="#EDE6EE" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="400" cy="250" rx="360" ry="190" fill="url(#wd-map-glow)" />
        {ROUTES.map(([a, b, bend]) => {
          const A = project(CITY[a].lat, CITY[a].lon), B = project(CITY[b].lat, CITY[b].lon), d = curve(A, B, bend);
          return (
            <g key={`${a}-${b}`}>
              <path d={d} fill="none" stroke="rgb(var(--line-strong))" strokeWidth="1.2" />
              <path d={d} fill="none" stroke="rgb(var(--ink-3))" strokeWidth="2.6" strokeDasharray="0 14" strokeLinecap="round" opacity=".5" />
            </g>
          );
        })}
        {CITIES.map((c) => {
          const p = project(c.lat, c.lon), L = LABEL[c.id], sum = citySummary(statuses, c.id);
          return (
            <g key={c.id}>
              <circle cx={p.x} cy={p.y} r={46} fill="rgb(var(--paper))" fillOpacity=".65" stroke="rgb(var(--line-strong))" strokeDasharray="2 5" />
              <text x={p.x + L.dx} y={p.y + L.dy} textAnchor={L.anchor} className="fill-ink" style={{ fontFamily: 'var(--font-serif)', fontSize: 23 }}>{c.name}</text>
              <text x={p.x + L.dx} y={p.y + L.dy + 16} textAnchor={L.anchor} fill={sum.top === 'quiet' ? 'rgb(var(--ink-3))' : TIERS[sum.top].hex} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', fontFamily: 'var(--font-mono)' }}>
                {c.cc} · {sum.text.toUpperCase()}
              </text>
            </g>
          );
        })}
        {statuses.map((st) => {
          const { x, y } = pos(st), t = TIERS[st.tier], active = hover === st.site.id, hot = st.tier === 'signal' || st.tier === 'advisory';
          return (
            <g key={st.site.id} role="link" tabIndex={0} aria-label={`${st.site.id} ${st.site.stream}, ${t.label}`} className="cursor-pointer outline-none"
              onMouseEnter={() => setHover(st.site.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(st.site.id)} onBlur={() => setHover(null)}
              onClick={() => go(st.site.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(st.site.id); } }}>
              {hot && <circle cx={x} cy={y} r={10} fill={t.hex} opacity=".45" className="animate-ping2" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
              <circle cx={x} cy={y} r={18} fill="transparent" />
              <circle cx={x} cy={y} r={active ? 11.5 : 9} fill={t.hex} stroke="rgb(var(--paper))" strokeWidth={3} style={{ transition: 'r .2s' }} />
              {st.tier === 'quiet' && <circle cx={x} cy={y} r={2.6} fill="rgb(var(--paper))" />}
              {st.tier !== 'quiet' && <text x={x} y={y - 16} textAnchor="middle" className="fill-ink-2" style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{st.site.id}</text>}
            </g>
          );
        })}
      </svg>
      {hovered && (() => {
        const p = pos(hovered), below = p.y < 150;
        const tx = p.x > VW * 0.75 ? '-86%' : p.x < VW * 0.2 ? '-14%' : '-50%';
        return (
          <div className="pointer-events-none absolute z-20 w-64 rounded-2xl border border-line bg-paper/95 p-3 shadow-lift backdrop-blur"
            style={{ left: `${(p.x / VW) * 100}%`, top: `${(p.y / VH) * 100}%`, transform: `translate(${tx}, ${below ? '20px' : 'calc(-100% - 20px)'})` }}>
            <div className="flex items-center justify-between gap-2"><span className="mono text-xs font-bold text-ink">{hovered.site.id}</span><TierBadge tier={hovered.tier} size="sm" /></div>
            <p className="mt-1.5 text-sm font-bold text-ink">{hovered.site.stream}</p>
            <p className="text-xs text-ink-2">{hovered.site.reach} · {CITY[hovered.site.cityId].name}</p>
            <div className="mt-2 flex items-center justify-between border-t border-line pt-2 text-xs text-ink-2"><span>{HAZARDS[hovered.hazard].name}</span><span className="font-bold tabular-nums text-ink">{hovered.score}/100</span></div>
          </div>
        );
      })()}
      <ul className="sr-only">{statuses.map((st) => <li key={st.site.id}><a href={`${hrefBase}${st.site.id}`}>{st.site.id} {st.site.stream}, {CITY[st.site.cityId].name}: {TIERS[st.tier].label}</a></li>)}</ul>
    </div>
  );
}

export function MapLegend({ className }: { className?: string }) {
  const order: TierId[] = ['quiet', 'watch', 'signal', 'advisory', 'resolved'];
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2', className)}>
      {order.map((t) => {
        const Icon = TIER_ICON[t];
        return <li key={t} className="inline-flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: TIERS[t].soft, color: TIERS[t].hex }}><Icon className="h-3 w-3" strokeWidth={2.5} /></span>{TIERS[t].label}</li>;
      })}
    </ul>
  );
}
