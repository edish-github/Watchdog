'use client';

import type { CityId, Site, WatchBreakdown } from '@/lib/types';
import { RULES } from '@/lib/engine';
import { CLIMATE } from '@/lib/weather';
import { dayOfYear } from '@/lib/utils';
import { Meter } from '../ui';

export interface Factor { key: string; label: string; input: string; rule: string; part: number; weight: number }

export function triggerFactors(w: WatchBreakdown): Factor[] {
  const x = w.weather;
  if (w.hazard === 'H1') {
    const r = RULES.h1;
    return [
      { key: 'heat', label: 'Heat', input: `Tmax ${x.tmax.toFixed(1)} °C`, rule: `clamp((Tmax − ${r.tBase}) / ${r.tSpan})`, part: w.parts.heat, weight: r.w.heat },
      { key: 'dry', label: 'Dry spell', input: `${x.rain14.toFixed(1)} mm in 14 d`, rule: `clamp((${r.rainRef} − rain14) / ${r.rainRef})`, part: w.parts.dry, weight: r.w.dry },
      { key: 'flow', label: 'Low flow', input: `${Math.round(x.flowRatio * 100)}% of normal`, rule: `clamp((${r.flowRef} − ratio) / ${r.flowSpan})`, part: w.parts.flow, weight: r.w.flow },
    ];
  }
  const r = RULES.h2;
  return [
    { key: 'storm', label: 'Storm rain', input: `${x.rain.toFixed(1)} mm today`, rule: `clamp((rain − ${r.rainBase}) / ${r.rainSpan})`, part: w.parts.storm, weight: r.w.storm },
    { key: 'burst', label: '72-hour burst', input: `${x.rain72.toFixed(1)} mm in 72 h`, rule: `clamp((rain72 − ${r.r72Base}) / ${r.r72Span})`, part: w.parts.burst, weight: r.w.burst },
  ];
}

export function vulnFactors(w: WatchBreakdown, site: Site): Factor[] {
  const h = site.habitat, pct = (v: number) => `${Math.round(v * 100)}%`;
  if (w.hazard === 'H1') {
    const v = RULES.vuln.H1;
    return [
      { key: 'shade', label: 'Shade deficit', input: `${pct(h.shadeCover)} shaded`, rule: '1 − OAH riparian cover', part: w.vulnParts.shadeDeficit, weight: v.shadeDeficit },
      { key: 'channel', label: 'Channel modification', input: pct(h.channelModification), rule: 'OAH morphology answer', part: w.vulnParts.channel, weight: v.channel },
      { key: 'sealing', label: 'Soil sealing', input: pct(h.soilSealing), rule: 'OAH land-use answer', part: w.vulnParts.sealing, weight: v.sealing },
    ];
  }
  const v = RULES.vuln.H2;
  return [
    { key: 'sealing', label: 'Soil sealing', input: pct(h.soilSealing), rule: 'OAH land-use answer', part: w.vulnParts.sealing, weight: v.sealing },
    { key: 'channel', label: 'Channel modification', input: pct(h.channelModification), rule: 'OAH morphology answer', part: w.vulnParts.channel, weight: v.channel },
  ];
}

/** Short plain-text summary of the two strongest drivers, for triage lists. */
export function driverText(w: WatchBreakdown, site: Site) {
  const top = triggerFactors(w).sort((a, b) => b.part * b.weight - a.part * a.weight).slice(0, 2).map((f) => `${f.label.toLowerCase()} (${f.input})`);
  return [...top, w.hazard === 'H1' ? `${Math.round(site.habitat.shadeCover * 100)}% shade` : `${Math.round(site.habitat.soilSealing * 100)}% sealed`].join(' · ');
}

/** Climatological daily max for a city and date (the synthetic weather's own baseline). */
export function normalTmax(city: CityId, date: string) {
  const c = CLIMATE[city];
  return c.tMean + c.tAmp * Math.cos((2 * Math.PI * (dayOfYear(date) - c.peakDoy)) / 365);
}

export function FactorTable({ title, factors, totalLabel, total, note }: { title: string; factors: Factor[]; totalLabel: string; total: number; note?: string }) {
  return (
    <div>
      <p className="eyebrow">{title}</p>
      <ul className="mt-1 divide-y divide-line/70">
        {factors.map((f) => (
          <li key={f.key} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-2.5">
            <div className="min-w-0"><p className="text-sm font-bold text-ink">{f.label} <span className="font-normal text-ink-2">· {f.input}</span></p><p className="mono truncate text-[11px] text-ink-3">{f.rule} = {f.part.toFixed(2)}</p></div>
            <p className="mono whitespace-nowrap text-right text-xs text-ink-2">{f.weight.toFixed(2)} × {f.part.toFixed(2)} = <b className="text-ink">{(f.weight * f.part).toFixed(3)}</b></p>
            <Meter value={f.part} max={1} tone="watch" className="col-span-2 !h-1.5" label={`${f.label} factor`} />
          </li>
        ))}
      </ul>
      <p className="flex items-center justify-between border-t border-line pt-2 text-sm"><span className="font-bold text-ink">{totalLabel}</span><span className="mono font-bold text-ink">{total.toFixed(3)}</span></p>
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
    </div>
  );
}

export function Formula({ w }: { w: WatchBreakdown }) {
  return (
    <div className="grain relative overflow-hidden rounded-2xl bg-espresso px-4 py-3 text-paper">
      <p className="mono relative z-[2] text-[11px] text-paper/60">Watch score = 100 × T × V(s)</p>
      <p className="mono relative z-[2] mt-1 text-sm">100 × {w.trigger.toFixed(3)} × {w.vulnerability.toFixed(3)} = <b className="text-lg">{w.score}</b> / 100</p>
      <p className="mono relative z-[2] mt-1 text-[11px] text-paper/60">rules v{RULES.version} · {RULES.sha} · opens ≥ {RULES.tiers.watchOpen} · closes &lt; {RULES.tiers.watchClose}</p>
    </div>
  );
}
