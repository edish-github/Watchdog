'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Download, FlaskConical, Scale, Sigma, SlidersHorizontal } from 'lucide-react';
import type { DayWeather, HazardId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { HAZARDS, SITE } from '@/lib/catalog';
import { RULES, dailyWatch, trigger, vulnerability, watchToday } from '@/lib/engine';
import { download } from '@/lib/download';
import { cn } from '@/lib/utils';
import { Card, CardHead, Empty, KV, Meter, TierBadge } from '@/components/ui';
import { DetailHeader } from '@/components/console/kit';

export default function RulePage() {
  const { id } = useParams<{ id: string }>();
  const key = (id ?? '').toUpperCase();
  if (key === 'RULE-03') {
    return (
      <>
        <DetailHeader back="/app/rules" backLabel="Hazard Rules" eyebrow="RULE-03 · roadmap" title="H3 · Vector habitat" sub="Warm, stagnant pools that favour mosquito breeding. OneAquaHealth work package 2 studies how urbanisation affects disease vectors." />
        <Card><Empty icon={Scale} title="Not in the MVP" body="H3 will reuse the same Watch = 100 × T × V pattern with temperature-days above a breeding threshold and a stagnation index, once OAH vector data can calibrate it." /></Card>
      </>
    );
  }
  const hz: HazardId | null = key === 'RULE-01' ? 'H1' : key === 'RULE-02' ? 'H2' : null;
  if (!hz) return <Card><Empty icon={Scale} title="Unknown rule" action={<Link href="/app/rules" className="btn btn-primary btn-sm">Hazard rules</Link>} /></Card>;
  return <RuleDetail id={key} hz={hz} />;
}

function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-sm"><span className="text-ink-2">{label}</span><span className="mono font-bold text-ink">{show}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-plum" />
    </label>
  );
}

function RuleDetail({ id, hz }: { id: string; hz: HazardId }) {
  const now = useWD((s) => s.d.now);
  const coi = SITE['COI-03'];
  const init = watchToday(coi, hz, now);
  const [w, setW] = useState({ tmax: init.weather.tmax, rain: init.weather.rain, rain14: init.weather.rain14, rain72: init.weather.rain72, flowRatio: init.weather.flowRatio });
  const [h, setH] = useState({ ...coi.habitat });
  const [ev, setEv] = useState(0.88);
  const load = (siteId: string, date?: string) => {
    const s = SITE[siteId], b = date ? dailyWatch(s, hz, date) : watchToday(s, hz, now);
    setW({ tmax: b.weather.tmax, rain: b.weather.rain, rain14: b.weather.rain14, rain72: b.weather.rain72, flowRatio: b.weather.flowRatio });
    setH({ ...s.habitat });
  };
  const weather: DayWeather = { date: 'simulation', discharge: 0, ...w };
  const t = trigger(hz, weather), v = vulnerability({ ...coi, habitat: h }, hz);
  const watch = Math.round(100 * t.value * v.value);
  const signal = Math.round(100 * RULES.fusion.community * ev + RULES.fusion.watch * watch);
  const r1 = RULES.h1, r2 = RULES.h2;
  const lines = hz === 'H1'
    ? [`T₁(d) = ${r1.w.heat}·heat(d) + ${r1.w.dry}·dry(d) + ${r1.w.flow}·flow(d)`, `heat(d) = clamp((Tmax − ${r1.tBase}) / ${r1.tSpan})`, `dry(d)  = clamp((${r1.rainRef} − rain14d) / ${r1.rainRef})`, `flow(d) = clamp((${r1.flowRef} − flow_ratio) / ${r1.flowSpan})`]
    : [`T₂(d) = ${r2.w.storm}·storm(d) + ${r2.w.burst}·burst(d)`, `storm(d) = clamp((rain24h − ${r2.rainBase}) / ${r2.rainSpan})`, `burst(d) = clamp((rain72h − ${r2.r72Base}) / ${r2.r72Span})`];
  const vw = RULES.vuln[hz] as Record<string, number>;

  return (
    <>
      <DetailHeader back="/app/rules" backLabel="Hazard Rules" eyebrow={`${id} · v${RULES.version} · ${RULES.sha} · ${RULES.file}`} title={<>{hz} · <span className="text-ink-3">{HAZARDS[hz].name}</span></>}
        sub={`Target hazard: ${HAZARDS[hz].long}. Evidence label: ${HAZARDS[hz].evidence}.`}
        badges={<span className="chip">Deterministic · pure · active</span>}
        actions={<button className="btn btn-outline" onClick={() => download(`watchdog-${id.toLowerCase()}.json`, JSON.stringify({ id, hazard: hz, version: RULES.version, sha: RULES.sha, trigger: hz === 'H1' ? RULES.h1 : RULES.h2, vulnerability: RULES.vuln[hz], tiers: RULES.tiers, fusion: RULES.fusion, roles: RULES.roles, resolution: RULES.resolution }, null, 2))}><Download className="h-4 w-4" />Export rule (JSON)</button>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHead title="Mathematical trigger specification" icon={Sigma} />
          <div className="space-y-1.5 p-5">
            {lines.map((l) => <p key={l} className="mono rounded-xl bg-sand/60 px-3 py-2 text-xs text-ink">{l}</p>)}
            <p className="mono rounded-xl bg-espresso px-3 py-2 text-xs text-paper">Watch score = 100 × T(d) × V(s) · opens ≥ {RULES.tiers.watchOpen} on any of {RULES.tiers.horizonDays} days · closes when all &lt; {RULES.tiers.watchClose}</p>
          </div>
        </Card>
        <div className="space-y-5 xl:col-span-5">
          <Card>
            <CardHead title="Vulnerability weights" icon={Scale} />
            <KV rows={Object.entries(vw).map(([k, x]): [string, string] => [k === 'shadeDeficit' ? 'Missing shade (1 − cover)' : k === 'channel' ? 'Channel modification' : 'Soil sealing', x.toFixed(2)])} />
          </Card>
          <Card>
            <CardHead title="Fusion coefficients" />
            <KV rows={[['Community evidence', RULES.fusion.community.toFixed(2)], ['Watch base', RULES.fusion.watch.toFixed(2)], ['Synergy per extra category', `+${RULES.fusion.synergy}`], ['Weight cap per reporter', RULES.fusion.cap.toFixed(2)], ['Walker · citizen sci. · verified', `×${RULES.roles.walker} · ×${RULES.roles.citizen_scientist} · ×${RULES.roles.verified}`], ['Advisory gate', `≥ ${RULES.tiers.advisoryGate}`]]} />
          </Card>
        </div>

        <Card className="xl:col-span-12">
          <CardHead title="Simulate the rule" icon={SlidersHorizontal} sub="Same functions the engine uses — move a slider and every number updates"
            action={<div className="flex flex-wrap gap-1.5"><button className="btn btn-outline btn-sm" onClick={() => load('COI-03')}>COI-03 today</button><button className="btn btn-outline btn-sm" onClick={() => load('COI-03', '2026-09-26')}>COI-03 · 26 Sep peak</button><button className="btn btn-outline btn-sm" onClick={() => load('COI-01')}>COI-01 shaded</button>{hz === 'H2' && <button className="btn btn-outline btn-sm" onClick={() => load('GNT-07', '2026-09-24')}>GNT-07 · storm</button>}</div>} />
          <div className="grid gap-6 p-5 lg:grid-cols-3">
            <div className="space-y-4">
              <p className="eyebrow">Weather & flow</p>
              {hz === 'H1' ? <>
                <Slider label="Max air temperature" value={w.tmax} min={12} max={42} step={0.1} show={`${w.tmax.toFixed(1)} °C`} onChange={(x) => setW({ ...w, tmax: x })} />
                <Slider label="Rain, last 14 days" value={w.rain14} min={0} max={40} step={0.1} show={`${w.rain14.toFixed(1)} mm`} onChange={(x) => setW({ ...w, rain14: x })} />
                <Slider label="Flow ratio to normal" value={w.flowRatio} min={0.05} max={1.5} step={0.01} show={`${Math.round(w.flowRatio * 100)}%`} onChange={(x) => setW({ ...w, flowRatio: x })} />
              </> : <>
                <Slider label="Rain, last 24 h" value={w.rain} min={0} max={60} step={0.1} show={`${w.rain.toFixed(1)} mm`} onChange={(x) => setW({ ...w, rain: x })} />
                <Slider label="Rain, last 72 h" value={w.rain72} min={0} max={120} step={0.1} show={`${w.rain72.toFixed(1)} mm`} onChange={(x) => setW({ ...w, rain72: Math.max(x, w.rain) })} />
              </>}
            </div>
            <div className="space-y-4">
              <p className="eyebrow">OAH habitat answers</p>
              {hz === 'H1' && <Slider label="Riparian shade cover" value={h.shadeCover} min={0} max={1} step={0.01} show={`${Math.round(h.shadeCover * 100)}%`} onChange={(x) => setH({ ...h, shadeCover: x })} />}
              <Slider label="Channel modification" value={h.channelModification} min={0} max={1} step={0.01} show={`${Math.round(h.channelModification * 100)}%`} onChange={(x) => setH({ ...h, channelModification: x })} />
              <Slider label="Soil sealing" value={h.soilSealing} min={0} max={1} step={0.01} show={`${Math.round(h.soilSealing * 100)}%`} onChange={(x) => setH({ ...h, soilSealing: x })} />
              <Slider label="Community evidence (for the signal)" value={ev} min={0} max={1} step={0.01} show={ev.toFixed(2)} onChange={setEv} />
            </div>
            <div className="space-y-3">
              <p className="eyebrow">Outcome</p>
              {Object.entries(t.parts).map(([k, p]) => (
                <div key={k}><div className="flex justify-between text-xs"><span className="text-ink-2">{k}</span><span className="mono text-ink">{p.toFixed(2)}</span></div><Meter value={p} max={1} tone="watch" className="mt-1 !h-1.5" label={k} /></div>
              ))}
              <KV className="rounded-2xl border border-line" rows={[['T(d)', t.value.toFixed(3)], ['V(s)', v.value.toFixed(3)], ['Watch score', `${watch} / 100`], ['Signal score', `${signal} / 100`]]} />
              <div className="flex flex-wrap gap-2">
                <TierBadge tier={watch >= RULES.tiers.watchOpen ? 'watch' : 'quiet'} />
                <span className={cn('chip', signal >= RULES.tiers.advisoryGate && '!border-[#EDB7C0] !bg-[#F7DCE0] !text-[#A11C3A]')}>{signal >= RULES.tiers.advisoryGate ? 'Advisory gate met' : `Gate ${RULES.tiers.advisoryGate} not met`}</span>
              </div>
              <p className="flex gap-2 text-xs text-ink-3"><FlaskConical className="h-3.5 w-3.5 shrink-0" />A met gate still needs a coordinator’s approval — the simulator never publishes anything.</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
