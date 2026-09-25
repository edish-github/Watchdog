'use client';

import type { Signal } from '@/lib/types';
import { RULES } from '@/lib/engine';
import { fmtClock, fmtDay } from '@/lib/utils';

/** Signal score, community evidence and watch score over the life of a signal. */
export function ScoreHistory({ history, tz }: { history: Signal['history']; tz: string }) {
  const W = 560, H = 176, P = { l: 30, r: 14, t: 14, b: 28 };
  const t0 = Date.parse(history[0].at), t1 = Date.parse(history[history.length - 1].at), span = t1 - t0 || 1;
  const X = (at: string) => (history.length === 1 ? W / 2 : P.l + ((Date.parse(at) - t0) / span) * (W - P.l - P.r));
  const Y = (v: number) => P.t + (1 - Math.min(100, v) / 100) * (H - P.t - P.b);
  const path = (f: (h: Signal['history'][number]) => number) => history.map((h, i) => `${i ? 'L' : 'M'}${X(h.at).toFixed(1)} ${Y(f(h)).toFixed(1)}`).join(' ');
  const gate = RULES.tiers.advisoryGate;
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Score history: ${history.map((h) => `${fmtClock(h.at, tz)} score ${h.score} with ${h.n} reporters`).join('; ')}`}>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="rgb(var(--line))" /><text x={P.l - 6} y={Y(v) + 3.5} textAnchor="end" className="fill-ink-3" style={{ fontSize: 10 }}>{v}</text></g>)}
        <line x1={P.l} x2={W - P.r} y1={Y(gate)} y2={Y(gate)} stroke="#C8344F" strokeDasharray="6 4" />
        <text x={W - P.r} y={Y(gate) - 5} textAnchor="end" fill="#A11C3A" style={{ fontSize: 10, fontWeight: 700 }}>Advisory gate · {gate}</text>
        <path d={path((h) => h.watch)} fill="none" stroke="#D99A2B" strokeWidth="2" strokeDasharray="5 4" />
        <path d={path((h) => h.evidence * 100)} fill="none" stroke="rgb(var(--river))" strokeWidth="2" />
        <path d={path((h) => h.score)} fill="none" stroke="rgb(var(--plum))" strokeWidth="3" strokeLinejoin="round" />
        {history.map((h, i) => (
          <g key={i}>
            <circle cx={X(h.at)} cy={Y(h.score)} r="5" fill="rgb(var(--paper))" stroke="rgb(var(--plum))" strokeWidth="2.5" />
            <text x={X(h.at)} y={Y(h.score) - 9} textAnchor="middle" className="fill-ink" style={{ fontSize: 10, fontWeight: 700 }}>{h.score} · {h.n}r</text>
          </g>
        ))}
        <text x={P.l} y={H - 8} className="fill-ink-3" style={{ fontSize: 10 }}>{fmtDay(history[0].at, tz)} {fmtClock(history[0].at, tz)}</text>
        {history.length > 1 && <text x={W - P.r} y={H - 8} textAnchor="end" className="fill-ink-3" style={{ fontSize: 10 }}>{fmtDay(history[history.length - 1].at, tz)} {fmtClock(history[history.length - 1].at, tz)}</text>}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-4 text-xs text-ink-2">
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-plum" />Signal score</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-river" />Community evidence × 100</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-[#D99A2B]" />Watch score</span>
        <span className="text-ink-3">“3r” = reporters at that update</span>
      </figcaption>
    </figure>
  );
}
