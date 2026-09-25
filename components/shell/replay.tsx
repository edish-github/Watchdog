'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
import { ChevronDown, Circle, CircleCheck, Pause, Play } from 'lucide-react';
import type { Domain } from '@/lib/types';
import { useWD } from '@/lib/store';
import { PRESETS } from '@/lib/sim';
import { useClickAway } from '@/lib/hooks';
import { cn, fmtClock, fmtDay } from '@/lib/utils';
import { Segmented } from '../ui';
import { toast } from '../toast';

const SPEEDS = [{ value: '60', label: '1 min/s' }, { value: '600', label: '10 min/s' }, { value: '3600', label: '1 h/s' }];
const STEPS = [{ m: 15, label: '+15 min' }, { m: 60, label: '+1 h' }, { m: 360, label: '+6 h' }, { m: 1440, label: '+1 day' }];

/** Progress of the Coimbra golden path, computed from real state. */
export function goldenPath(d: Domain) {
  const w = d.watches.find((x) => x.siteId === 'COI-03' && x.hazard === 'H1');
  const ana = d.observations.find((o) => o.siteId === 'COI-03' && o.signs.includes('dog_unwell'));
  const sig = d.signals.find((s) => s.siteId === 'COI-03');
  const look = d.looks.find((l) => l.siteId === 'COI-03' && l.purpose === 'verify');
  const adv = d.advisories.find((a) => a.siteId === 'COI-03' && !!a.publishedAt);
  const fhir = d.bundles.find((b) => b.siteId === 'COI-03');
  const res = d.advisories.find((a) => a.siteId === 'COI-03' && a.status === 'resolved');
  return [
    { label: 'Watch opens at COI-03', done: !!w, href: w ? `/app/watches/${w.id}` : '/app/watches' },
    { label: 'Ana reports dark mats and an unwell dog', done: !!ana, href: '/observe/sites/COI-03/report' },
    { label: 'Signal fused for review', done: !!sig, href: sig ? `/app/signals/${sig.id}` : '/app/signals' },
    { label: 'Tiago answers the look request', done: look?.status === 'completed', href: look ? `/app/verification/${look.id}` : '/app/verification' },
    { label: 'Sofia approves the advisory', done: !!adv, href: adv ? `/app/advisories/${adv.id}` : '/app/advisories' },
    { label: 'FHIR bundle delivered', done: fhir?.status === 'sent', href: fhir ? `/app/fhir/${fhir.id}` : '/app/fhir' },
    { label: 'Two clear checks resolve it', done: !!res, href: res ? `/app/advisories/${res.id}` : '/app/advisories' },
  ];
}

export function ReplayClock() {
  const d = useWD((s) => s.d);
  const running = useWD((s) => s.running);
  const speed = useWD((s) => s.speed);
  const tz = useWD((s) => s.prefs.consoleTz);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false), open);
  const steps = useMemo(() => goldenPath(d), [d]);
  const done = steps.filter((s) => s.done).length;
  const next = steps.findIndex((s) => !s.done);
  const { setRunning, setSpeed, advance, reset } = useWD.getState();
  const place = tz.split('/').pop()?.replace(/_/g, ' ');

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center rounded-full border border-line bg-paper/85 p-1 shadow-card backdrop-blur">
        <button onClick={() => setRunning(!running)} aria-label={running ? 'Pause replay clock' : 'Play replay clock'}
          className={cn('grid h-8 w-8 place-items-center rounded-full transition', running ? 'bg-plum text-paper' : 'bg-sand text-ink hover:bg-line')}>
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 translate-x-[1px]" />}
        </button>
        <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" className="flex items-center gap-2 rounded-full px-2.5 py-1 hover:bg-sand/60">
          <span className="relative flex h-2 w-2">{running && <span className="absolute inset-0 animate-ping2 rounded-full bg-plum" />}<span className={cn('relative h-2 w-2 rounded-full', running ? 'bg-plum' : 'bg-ink-3')} /></span>
          <span className="text-[13px] font-bold tabular-nums text-ink">{fmtDay(d.now, tz)} · {fmtClock(d.now, tz)}</span>
          <span className="hidden text-xs text-ink-3 sm:inline">{place}</span>
          <ChevronDown className={cn('h-3.5 w-3.5 text-ink-3 transition', open && 'rotate-180')} />
        </button>
      </div>

      {open && (
        <div role="dialog" aria-label="Demo replay clock" className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(390px,calc(100vw-2rem))] animate-rise rounded-3xl border border-line bg-paper p-4 shadow-lift">
          <p className="eyebrow">Demo replay clock</p>
          <p className="display mt-1 text-[1.7rem] leading-tight">{fmtDay(d.now, tz)} · {fmtClock(d.now, tz)}</p>
          <p className="text-xs text-ink-3">{place} time · weather, watches and reports all run on this clock</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button className="btn btn-primary btn-sm" onClick={() => setRunning(!running)}>{running ? <><Pause className="h-3.5 w-3.5" />Pause</> : <><Play className="h-3.5 w-3.5" />Play</>}</button>
            <Segmented size="sm" label="Replay speed" value={String(speed)} onChange={(v) => setSpeed(Number(v))} options={SPEEDS} />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {STEPS.map((s) => <button key={s.m} className="btn btn-outline btn-sm !px-2" onClick={() => advance(s.m)}>{s.label}</button>)}
          </div>

          <div className="mt-4 rounded-2xl bg-sand/55 p-3">
            <div className="flex items-center justify-between"><p className="text-xs font-bold text-ink">Coimbra golden path</p><span className="mono text-[11px] text-ink-2">{done}/{steps.length}</span></div>
            <p className="mt-0.5 text-[11px] text-ink-3">{d.autopilot ? 'Autopilot is playing the golden path.' : 'Presenter mode — you make Ana’s report and Sofia’s decisions.'}</p>
            <ol className="mt-2 space-y-0.5">
              {steps.map((s, i) => (
                <li key={s.label}>
                  <Link href={s.href} onClick={() => setOpen(false)} className={cn('flex items-center gap-2 rounded-lg px-2 py-1 text-[12.5px] transition hover:bg-paper', s.done ? 'text-ink-2' : i === next ? 'font-bold text-ink' : 'text-ink-3')}>
                    {s.done ? <CircleCheck className="h-3.5 w-3.5 text-[#1F9483]" /> : <Circle className={cn('h-3.5 w-3.5', i === next && 'text-plum')} />}
                    <span className="flex-1">{s.label}</span>
                    {i === next && <span className="rounded-full bg-plum px-1.5 text-[10px] font-bold text-paper">NEXT</span>}
                  </Link>
                </li>
              ))}
            </ol>
          </div>

          <p className="eyebrow mb-1.5 mt-4">Jump to a scenario moment</p>
          <div className="grid gap-1">
            {PRESETS.map((p) => (
              <button key={p.id} onClick={() => { reset(p.id); setOpen(false); toast('Scenario re-seeded', `${p.label} — ${p.title}`, 'info'); }}
                className={cn('flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition', d.preset === p.id ? 'border-plum/40 bg-plum-soft/60' : 'border-line hover:border-ink-3')}>
                <span><span className="block font-bold text-ink">{p.label}</span><span className="block text-xs text-ink-2">{p.title}</span></span>
                {p.autopilot && <span className="chip !text-[10px]">autopilot</span>}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-ink-3">Jumping re-seeds the synthetic scenario and replaces actions taken since the last jump.</p>
        </div>
      )}
    </div>
  );
}
