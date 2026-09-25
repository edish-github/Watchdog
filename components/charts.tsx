'use client';

import { useId, useMemo, useRef, useState } from 'react';
import type { SeriesPoint } from '@/lib/types';
import { RULES } from '@/lib/engine';
import { addH, cn, dayAdd, fmtDay, fmtWhen, hoursBetween, localDate, zonedToUtc } from '@/lib/utils';

type Pt = [number, number];
/** Catmull-Rom → cubic Bézier. */
function smooth(pts: Pt[]) {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

export function Sparkline({ values, width = 200, height = 48, color = 'rgb(var(--plum))', threshold, className }: { values: number[]; width?: number; height?: number; color?: string; threshold?: number; className?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (values.length < 2) return null;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => height - 3 - (Math.max(0, Math.min(100, v)) / 100) * (height - 6);
  const d = smooth(values.map((v, i) => [x(i), y(v)]));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={className} aria-hidden>
      <defs><linearGradient id={u} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".3" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {threshold !== undefined && <line x1="0" x2={width} y1={y(threshold)} y2={y(threshold)} stroke="currentColor" strokeOpacity=".3" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#${u})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** 72-hour hazard trajectory: observed line, forecast line, widening uncertainty ribbon, thresholds, hover, table fallback. */
export function ForecastChart({ series, tz, threshold = RULES.tiers.watchOpen, closeAt = RULES.tiers.watchClose, height = 250, title = 'Watch score', className }: { series: SeriesPoint[]; tz: string; threshold?: number; closeAt?: number; height?: number; title?: string; className?: string }) {
  const u = useId().replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const [hi, setHi] = useState<number | null>(null);
  const W = 720, H = height, P = { l: 34, r: 14, t: 18, b: 30 };
  const h0 = series[0]?.h ?? 0, h1 = series[series.length - 1]?.h ?? 1;
  const nowIso = series.length ? addH(series[0].t, -h0) : '';
  const days = useMemo(() => {
    if (!series.length) return [];
    const first = localDate(series[0].t, tz);
    return Array.from({ length: 6 }, (_, i) => {
      const date = dayAdd(first, i), noonIso = zonedToUtc(date, 12, 0, tz);
      return { date, mid: hoursBetween(zonedToUtc(date, 0, 0, tz), nowIso), noon: hoursBetween(noonIso, nowIso), noonIso };
    });
  }, [series, tz, nowIso]);
  if (series.length < 2) return null;

  const X = (h: number) => P.l + ((h - h0) / Math.max(1, h1 - h0)) * (W - P.l - P.r);
  const Y = (v: number) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const past = series.filter((p) => p.h <= 0), fut = series.filter((p) => p.h >= 0);
  const pastD = smooth(past.map((p) => [X(p.h), Y(p.score)]));
  const futD = smooth(fut.map((p) => [X(p.h), Y(p.score)]));
  const bandD = fut.length > 1 ? `${smooth(fut.map((p) => [X(p.h), Y(p.hi)]))} ${smooth(fut.slice().reverse().map((p) => [X(p.h), Y(p.lo)])).replace(/^M/, 'L')} Z` : '';
  const current = series.find((p) => p.h === 0) ?? series[0];
  const peak = (fut.length ? fut : series).reduce((m, p) => (p.score > m.score ? p : m));
  const summary = `${title} now ${Math.round(current.score)} of 100. Forecast peak ${Math.round(peak.score)} on ${fmtWhen(peak.t, tz)}. A Watch opens at ${threshold}.`;
  const hp = hi !== null ? series[hi] : null;
  const move = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    series.forEach((p, i) => { const dd = Math.abs(X(p.h) - px); if (dd < bd) { bd = dd; best = i; } });
    setHi(best);
  };

  return (
    <figure className={cn('relative', className)}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full touch-none select-none" role="img" aria-label={summary} onPointerMove={(e) => move(e.clientX)} onPointerLeave={() => setHi(null)}>
        <defs>
          <linearGradient id={`${u}band`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgb(var(--plum))" stopOpacity=".22" /><stop offset="1" stopColor="rgb(var(--plum))" stopOpacity=".07" /></linearGradient>
          <linearGradient id={`${u}fut`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9A78A3" /><stop offset="1" stopColor="rgb(var(--plum))" /></linearGradient>
        </defs>
        <rect x={P.l} y={Y(100)} width={W - P.l - P.r} height={Y(threshold) - Y(100)} fill="#FBEFD2" opacity=".5" rx="4" />
        {[0, 20, 40, 60, 80, 100].map((v) => (
          <g key={v}><line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--line))" /><text x={P.l - 8} y={Y(v) + 3.5} textAnchor="end" className="fill-ink-3" style={{ fontSize: 10 }}>{v}</text></g>
        ))}
        {days.filter((x) => x.mid > h0 && x.mid < h1).map((x) => <line key={`m${x.date}`} x1={X(x.mid)} x2={X(x.mid)} y1={P.t} y2={H - P.b} stroke="rgb(var(--line-strong))" strokeDasharray="2 4" />)}
        {days.filter((x) => x.noon > h0 + 2 && x.noon < h1 - 2).map((x) => <text key={`n${x.date}`} x={X(x.noon)} y={H - 9} textAnchor="middle" className="fill-ink-2" style={{ fontSize: 11, fontWeight: 700 }}>{fmtDay(x.noonIso, tz)}</text>)}
        <line x1={P.l} x2={W - P.r} y1={Y(threshold)} y2={Y(threshold)} stroke="#D99A2B" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={W - P.r - 4} y={Y(threshold) - 6} textAnchor="end" fill="#8F520A" style={{ fontSize: 10, fontWeight: 700 }}>Watch opens · {threshold}</text>
        <line x1={P.l} x2={W - P.r} y1={Y(closeAt)} y2={Y(closeAt)} stroke="rgb(var(--ink-3))" strokeOpacity=".6" strokeDasharray="1 4" />
        <text x={W - P.r - 4} y={Y(closeAt) + 13} textAnchor="end" className="fill-ink-3" style={{ fontSize: 9.5 }}>closes below {closeAt}</text>
        {bandD && <path d={bandD} fill={`url(#${u}band)`} />}
        {pastD && <path d={pastD} fill="none" stroke="rgb(var(--ink-2))" strokeWidth="2.2" strokeLinecap="round" />}
        {futD && <path d={futD} fill="none" stroke={`url(#${u}fut)`} strokeWidth="2.8" strokeLinecap="round" />}
        {h0 < 0 && (
          <g>
            <line x1={X(0)} x2={X(0)} y1={P.t} y2={H - P.b} stroke="rgb(var(--ink))" strokeOpacity=".45" />
            <rect x={X(0) - 18} y={P.t - 12} width="36" height="16" rx="8" fill="rgb(var(--ink))" />
            <text x={X(0)} y={P.t - 1} textAnchor="middle" fill="rgb(var(--paper))" style={{ fontSize: 9.5, fontWeight: 700 }}>NOW</text>
          </g>
        )}
        {hp && (
          <g>
            <line x1={X(hp.h)} x2={X(hp.h)} y1={P.t} y2={H - P.b} stroke="rgb(var(--plum))" strokeOpacity=".4" />
            <circle cx={X(hp.h)} cy={Y(hp.score)} r="5" fill="rgb(var(--paper))" stroke="rgb(var(--plum))" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      {hp && (
        <div className="pointer-events-none absolute top-6 z-10 -translate-x-1/2 whitespace-nowrap rounded-xl border border-line bg-paper/95 px-3 py-2 text-xs shadow-lift backdrop-blur" style={{ left: `${Math.min(86, Math.max(14, (X(hp.h) / W) * 100))}%` }}>
          <p className="font-bold text-ink">{fmtWhen(hp.t, tz)}</p>
          <p className="text-ink-2">{hp.h <= 0 ? 'Observed' : 'Forecast'} · <b className="text-ink">{Math.round(hp.score)}</b>{hp.h > 0 && ` (range ${Math.round(hp.lo)}–${Math.round(hp.hi)})`}</p>
        </div>
      )}
      <figcaption className="sr-only">{summary}</figcaption>
      <table className="sr-only">
        <caption>{title} by time</caption>
        <thead><tr><th>Time</th><th>Score</th><th>Low</th><th>High</th></tr></thead>
        <tbody>{series.map((p) => <tr key={p.t}><td>{fmtWhen(p.t, tz)}</td><td>{Math.round(p.score)}</td><td>{Math.round(p.lo)}</td><td>{Math.round(p.hi)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}
