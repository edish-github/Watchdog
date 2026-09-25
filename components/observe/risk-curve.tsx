'use client';

import { useId, useMemo } from 'react';
import type { HazardId, Site } from '@/lib/types';
import { CITY } from '@/lib/catalog';
import { forecastSeries } from '@/lib/engine';
import { useT } from '@/lib/i18n';
import { smooth } from '@/lib/svg';
import { dayAdd, daysBetween, fmtClock, fmtDay, hoursBetween, localDate, zonedToUtc } from '@/lib/utils';
import { riskLevel } from './public';

/** Plain-language 72 h curve with Low / Moderate / High bands and an uncertainty ribbon. */
export function RiskCurve({ site, hazard, now }: { site: Site; hazard: HazardId; now: string }) {
  const { t, locale } = useT();
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tz = CITY[site.cityId].tz;
  const series = useMemo(() => forecastSeries(site, hazard, now, 0, 72, 3), [site, hazard, now]);
  const W = 360, H = 176, Lg = 70, R = 8, T = 8, B = 26, band = (H - T - B) / 3, base = H - B;
  const Y = (s: number) => (s < 40 ? base - band * (s / 40) : s < 50 ? base - band - band * ((s - 40) / 10) : base - 2 * band - band * Math.min(1, (s - 50) / 50));
  const X = (h: number) => Lg + (h / 72) * (W - Lg - R);
  const line = smooth(series.map((p) => [X(p.h), Y(p.score)]));
  const ribbon = `${smooth(series.map((p) => [X(p.h), Y(p.hi)]))} ${smooth([...series].reverse().map((p) => [X(p.h), Y(p.lo)])).replace(/^M/, 'L')} Z`;
  const today = localDate(now, tz);
  const dayLabel = (iso: string) => { const i = daysBetween(today, localDate(iso, tz)); return i === 0 ? t('today') : i === 1 ? t('tomorrow') : fmtDay(iso, tz, locale).split(' ')[0]; };
  const days = [0, 1, 2, 3].map((i) => { const date = dayAdd(today, i); return { date, mid: hoursBetween(zonedToUtc(date, 0, 0, tz), now), noonIso: zonedToUtc(date, 12, 0, tz) }; });
  const peak = series.reduce((m, p) => (p.score > m.score ? p : m), series[0]);
  const summary = t('forecastPeak', { level: t(riskLevel(peak.score)), when: `${dayLabel(peak.t)} ${fmtClock(peak.t, tz)}` });
  const bands = [
    { k: 'high' as const, y: T, fill: '#FBE0AE' },
    { k: 'moderate' as const, y: T + band, fill: '#F6ECD6' },
    { k: 'low' as const, y: T + 2 * band, fill: '#ECE7DE' },
  ];

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${t('forecastTitle')}. ${summary}`}>
        <defs><linearGradient id={`${u}r`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgb(var(--plum))" stopOpacity=".12" /><stop offset="1" stopColor="rgb(var(--plum))" stopOpacity=".26" /></linearGradient></defs>
        {bands.map((b) => (
          <g key={b.k}>
            <rect x={Lg} y={b.y} width={W - Lg - R} height={band} fill={b.fill} opacity=".7" />
            <text x={Lg - 8} y={b.y + band / 2 + 4} textAnchor="end" className="fill-ink-2" style={{ fontSize: 11, fontWeight: 700 }}>{t(b.k)}</text>
          </g>
        ))}
        {days.filter((x) => x.mid > 1 && x.mid < 71).map((x) => <line key={x.date} x1={X(x.mid)} x2={X(x.mid)} y1={T} y2={base} stroke="rgb(var(--paper))" strokeWidth="2" />)}
        {days.map((x) => { const h = hoursBetween(x.noonIso, now); return h > 5 && h < 67 ? <text key={`l${x.date}`} x={X(h)} y={H - 8} textAnchor="middle" className="fill-ink-2" style={{ fontSize: 11, fontWeight: 700 }}>{dayLabel(x.noonIso)}</text> : null; })}
        <path d={ribbon} fill={`url(#${u}r)`} />
        <path d={line} fill="none" stroke="rgb(var(--plum))" strokeWidth="3" strokeLinecap="round" />
        <circle cx={X(0)} cy={Y(series[0].score)} r="5" fill="rgb(var(--ink))" stroke="rgb(var(--paper))" strokeWidth="2" />
        <circle cx={X(peak.h)} cy={Y(peak.score)} r="4.5" fill="rgb(var(--paper))" stroke="rgb(var(--plum))" strokeWidth="2.5" />
      </svg>
      <figcaption className="mt-1 text-sm font-bold text-ink">{summary}</figcaption>
      <p className="mt-0.5 text-xs text-ink-3">{t('uncertainty')}</p>
      <table className="sr-only">
        <caption>{t('forecastTitle')}</caption>
        <tbody>{series.map((p) => <tr key={p.t}><td>{dayLabel(p.t)} {fmtClock(p.t, tz)}</td><td>{t(riskLevel(p.score))}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
