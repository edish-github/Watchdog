'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { BookOpen, Braces, Camera, History, Radar, Sigma, X } from 'lucide-react';
import type { Signal } from '@/lib/types';
import { useWD } from '@/lib/store';
import { signalObs } from '@/lib/select';
import { CATEGORY, HAZARDS, SIGNS, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { cn, fmtWhen } from '@/lib/utils';
import { FactorTable, Formula, triggerFactors, vulnFactors } from './explain';

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Sigma; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-6 py-5">
      <h3 className="eyebrow flex items-center gap-2 !text-ink-2"><Icon className="h-3.5 w-3.5" />{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function WhyDrawer({ signal, open, onClose }: { signal: Signal; open: boolean; onClose: () => void }) {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  const snap = signal.snapshot, ev = snap.evidence, w = snap.watch, site = SITE[signal.siteId];
  const obs = signalObs(d, signal);
  const evPart = RULES.fusion.community * ev.value * 100, wPart = RULES.fusion.watch * w.score;
  const mult = (role: string, verified: boolean) => (verified ? RULES.roles.verified : role === 'citizen_scientist' ? RULES.roles.citizen_scientist : RULES.roles.walker);

  return (
    <div className={cn('fixed inset-0 z-[70]', !open && 'pointer-events-none')} inert={!open}>
      <div onClick={onClose} className={cn('absolute inset-0 bg-espresso/30 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} aria-hidden />
      <aside role="dialog" aria-label={`Why drawer for ${signal.id}`} className={cn('absolute inset-y-0 right-0 flex w-full max-w-[660px] flex-col bg-paper shadow-lift transition-transform duration-300', open ? 'translate-x-0' : 'translate-x-full')}>
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <p className="eyebrow">Why drawer · auditable deterministic reasoning</p>
            <h2 className="display mt-1 text-3xl leading-tight">{signal.id} scored {snap.score} / 100</h2>
            <p className="mt-1 text-xs text-ink-2">Snapshot {fmtWhen(snap.at, tz)} · rules v{snap.ruleVersion} ({snap.ruleSha}) · pure TypeScript, no learned weights</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-ink-3 hover:bg-sand hover:text-ink"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 overflow-y-auto">
          <Section title="Score composition" icon={Sigma}>
            <div className="grain relative overflow-hidden rounded-2xl bg-espresso px-4 py-3 text-paper">
              <p className="mono relative z-[2] text-[11px] text-paper/60">Signal = {RULES.fusion.community} × 100 × Evidence + {RULES.fusion.watch} × Watch</p>
              <p className="mono relative z-[2] mt-1 text-sm">{RULES.fusion.community} × 100 × {ev.value.toFixed(3)} + {RULES.fusion.watch} × {w.score} = {evPart.toFixed(1)} + {wPart.toFixed(1)} = <b className="text-lg">{snap.score}</b></p>
            </div>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li className="flex justify-between gap-3"><span className="text-ink-2">Signal rule</span><span className={cn('font-bold', snap.rule.met ? 'text-[#0F6A60]' : 'text-ink-3')}>{snap.rule.met ? '✓ ' : ''}{snap.rule.reason}</span></li>
              <li className="flex justify-between gap-3"><span className="text-ink-2">Advisory gate (≥ {RULES.tiers.advisoryGate})</span><span className={cn('font-bold', snap.gate ? 'text-[#A11C3A]' : 'text-ink-3')}>{snap.gate ? 'Met — a person still decides' : 'Not met'}</span></li>
              <li className="flex justify-between gap-3"><span className="text-ink-2">Watch active for {signal.hazard}</span><span className="font-bold text-ink">{snap.watchActive ? 'Yes' : 'No'}</span></li>
            </ul>
          </Section>

          <Section title={`Community evidence · ${Math.round(RULES.fusion.community * 100)}%`} icon={Radar}>
            <table className="tbl">
              <thead><tr><th>Reporter</th><th>Signs</th><th>Weight</th></tr></thead>
              <tbody>
                {ev.items.map((i) => (
                  <tr key={i.deviceId}>
                    <td><Link href={`/app/observations/${i.obsId}`} className="font-bold text-ink hover:text-plum">{i.label}</Link><p className="text-xs text-ink-3">{i.verified ? 'verified' : i.role.replace('_', ' ')} × {mult(i.role, i.verified)}{i.acute ? ' · acute animal' : ''}</p></td>
                    <td className="text-xs text-ink-2">{i.signs.map((s) => SIGNS[s].tag).join(', ')}<p className="text-ink-3">{i.categories.map((c) => CATEGORY[c].en).join(' + ')}</p></td>
                    <td className="mono text-xs font-bold">{i.weight.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mono mt-3 space-y-1 rounded-2xl bg-sand/60 p-3 text-xs text-ink">
              <li>base = 1 − ∏(1 − wᵢ) = {ev.base.toFixed(3)}</li>
              <li>synergy = {RULES.fusion.synergy} × ({ev.categories.length} categories − 1) = +{ev.synergy.toFixed(3)}</li>
              <li><b>Evidence = min(1, base + synergy) = {ev.value.toFixed(3)}</b></li>
            </ul>
            <p className="mt-2 text-xs text-ink-3">Several reports from one device count as one reporter. Per-reporter weight is capped at {RULES.fusion.cap}; people’s feelings are never scored.</p>
          </Section>

          <Section title={`Watch condition · ${Math.round(RULES.fusion.watch * 100)}%`} icon={Sigma}>
            <div className="space-y-5">
              <FactorTable title="Trigger T(d)" factors={triggerFactors(w)} totalLabel="T(d)" total={w.trigger} />
              <FactorTable title="Vulnerability V(s) from OAH habitat answers" factors={vulnFactors(w, site)} totalLabel="V(s)" total={w.vulnerability} />
              <Formula w={w} />
            </div>
          </Section>

          <Section title="Reports and photos" icon={Camera}>
            <ul className="grid gap-2 sm:grid-cols-2">
              {obs.map((o) => (
                <li key={o.id}>
                  <Link href={`/app/observations/${o.id}`} className="flex gap-3 rounded-2xl border border-line p-2.5 transition hover:border-ink-3">
                    {o.photo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={o.photo.dataUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
                      : <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-sand text-[10px] text-ink-3">no photo</span>}
                    <span className="min-w-0"><span className="mono block text-xs font-bold text-ink">{o.id}</span><span className="block truncate text-xs text-ink-2">{o.signs.map((s) => SIGNS[s].tag).join(', ')}</span><span className="block text-[11px] text-ink-3">{fmtWhen(o.createdAt, tz)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Evidence label" icon={BookOpen}>
            <p className="text-sm text-ink">{HAZARDS[signal.hazard].evidence}.</p>
            <p className="mt-1 text-xs text-ink-2">Precedent: {HAZARDS[signal.hazard].precedent}</p>
            <p className="mt-2 text-xs text-ink-3">Watchdog never detects toxins or diagnoses animals. A signal means a professional should look.</p>
          </Section>

          <Section title="Decision log" icon={History}>
            {signal.decisions.length ? (
              <ol className="space-y-2">{signal.decisions.map((x, i) => <li key={i} className="text-sm"><b className="text-ink">{x.kind.replace('_', ' ')}</b> · {x.actor}{x.note && <span className="text-ink-2"> — {x.note}</span>}<span className="block text-[11px] text-ink-3">{fmtWhen(x.at, tz)}</span></li>)}</ol>
            ) : <p className="text-sm text-ink-3">No human decision yet.</p>}
          </Section>

          <Section title="Raw snapshot" icon={Braces}>
            <details className="rounded-2xl border border-line">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-bold text-ink">Show the saved explanation snapshot (JSON)</summary>
              <pre className="mono max-h-80 overflow-auto border-t border-line bg-sand/40 p-4 text-[11px] leading-relaxed text-ink">{JSON.stringify(snap, null, 2)}</pre>
            </details>
          </Section>
        </div>
      </aside>
    </div>
  );
}
