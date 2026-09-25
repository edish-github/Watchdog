'use client';

import { useRouter } from 'next/navigation';
import { useId } from 'react';
import type { CityId } from '@/lib/types';
import type { SiteStatus } from '@/lib/select';
import { CITY, TIERS } from '@/lib/catalog';
import { km, type LatLon } from '@/lib/geo';
import { useT } from '@/lib/i18n';

/** A true-scale stylised map of one city's monitored reaches, with a scale bar and your position if nearby. */
export function CityMap({ cityId, statuses, me, follows }: { cityId: CityId; statuses: SiteStatus[]; me: LatLon | null; follows: string[] }) {
  const router = useRouter();
  const { t } = useT();
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const sites = statuses.filter((s) => s.site.cityId === cityId);
  const W = 360, H = 240, PAD = 46;
  const meIn = !!me && sites.some((s) => km(me, s.site) < 5);
  const pts: LatLon[] = sites.map((s) => s.site);
  if (meIn && me) pts.push(me);
  const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2, midLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  const kx = 111.32 * Math.cos((midLat * Math.PI) / 180), ky = 110.57;
  const spanX = Math.max((Math.max(...lons) - Math.min(...lons)) * kx, 1.2), spanY = Math.max((Math.max(...lats) - Math.min(...lats)) * ky, 1.2);
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY);
  const P = (p: LatLon) => ({ x: W / 2 + (p.lon - midLon) * kx * scale, y: H / 2 - (p.lat - midLat) * ky * scale });
  const bar = [0.25, 0.5, 1, 2, 5].find((k) => k * scale >= 44) ?? 5;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="group" aria-label={`${CITY[cityId].name} — ${t('mapHint')}`}>
        <defs>
          <pattern id={`${u}d`} width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1" fill="rgb(var(--line-strong))" opacity=".7" /></pattern>
          <radialGradient id={`${u}w`} cx="50%" cy="50%" r="55%"><stop offset="0" stopColor="#CFE3E6" stopOpacity=".75" /><stop offset="1" stopColor="#CFE3E6" stopOpacity="0" /></radialGradient>
          <radialGradient id={`${u}p`} cx="30%" cy="70%" r="50%"><stop offset="0" stopColor="#EADCEB" stopOpacity=".8" /><stop offset="1" stopColor="#EADCEB" stopOpacity="0" /></radialGradient>
        </defs>
        <rect width={W} height={H} rx="18" fill="rgb(var(--paper))" />
        <rect width={W} height={H} rx="18" fill={`url(#${u}d)`} />
        <ellipse cx={W * 0.55} cy={H * 0.45} rx={W * 0.45} ry={H * 0.38} fill={`url(#${u}w)`} />
        <ellipse cx={W * 0.25} cy={H * 0.75} rx={W * 0.35} ry={H * 0.3} fill={`url(#${u}p)`} />
        <g transform={`translate(${W - 26} 24)`} className="fill-ink-3"><path d="M0 -10 L5 4 L0 1 L-5 4 Z" /><text y="17" textAnchor="middle" style={{ fontSize: 9, fontWeight: 700 }}>N</text></g>
        <g transform={`translate(16 ${H - 18})`}>
          <line x1="0" x2={bar * scale} y1="0" y2="0" stroke="rgb(var(--ink-2))" strokeWidth="2" />
          <line x1="0" x2="0" y1="-4" y2="4" stroke="rgb(var(--ink-2))" strokeWidth="2" />
          <line x1={bar * scale} x2={bar * scale} y1="-4" y2="4" stroke="rgb(var(--ink-2))" strokeWidth="2" />
          <text x={bar * scale + 6} y="4" className="fill-ink-2" style={{ fontSize: 10, fontWeight: 700 }}>{bar < 1 ? `${bar * 1000} m` : `${bar} km`}</text>
        </g>
        {sites.map((s, i) => {
          const { x, y } = P(s.site), T = TIERS[s.tier], hot = s.tier === 'signal' || s.tier === 'advisory', right = x < W - 110 ? i % 2 === 0 || x < 110 : false;
          const go = () => router.push(`/observe/sites/${s.site.id}`);
          return (
            <g key={s.site.id} role="link" tabIndex={0} aria-label={`${s.site.id} ${s.site.stream}`} className="cursor-pointer outline-none" onClick={go} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
              {hot && <circle cx={x} cy={y} r="11" fill={T.hex} opacity=".45" className="animate-ping2" style={{ transformBox: 'fill-box', transformOrigin: 'center' }} />}
              <circle cx={x} cy={y} r="20" fill="transparent" />
              {follows.includes(s.site.id) && <circle cx={x} cy={y} r="14.5" fill="none" stroke="rgb(var(--plum))" strokeWidth="2" strokeDasharray="3 3" />}
              <circle cx={x} cy={y} r="10" fill={T.hex} stroke="rgb(var(--paper))" strokeWidth="3" />
              <text x={right ? x + 18 : x - 18} y={y + 4} textAnchor={right ? 'start' : 'end'} className="fill-ink" style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{s.site.id}</text>
            </g>
          );
        })}
        {meIn && me && (() => {
          const p = P(me);
          return <g><circle cx={p.x} cy={p.y} r="12" fill="#3B82F6" opacity=".18" /><circle cx={p.x} cy={p.y} r="5.5" fill="#3B82F6" stroke="#fff" strokeWidth="2" /><text x={p.x} y={p.y - 12} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700 }} fill="#1D4ED8">{t('you')}</text></g>;
        })()}
      </svg>
    </div>
  );
}
