'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { ArrowRight, Circle, CircleCheck, Eye, FlaskConical, Radar, ShieldAlert, Sparkles, X } from 'lucide-react';
import type { HazardId, TierId } from '@/lib/types';
import { HAZARDS, TIERS } from '@/lib/catalog';
import { clamp, cn, hash01, pad } from '@/lib/utils';
import type { IconType } from './icons';

export const TIER_ICON: Record<TierId, IconType> = { quiet: Circle, watch: Eye, signal: Radar, advisory: ShieldAlert, resolved: CircleCheck };
export const TONE = {
  plum: 'rgb(var(--plum))', ink: 'rgb(var(--ink))', river: 'rgb(var(--river))',
  quiet: TIERS.quiet.hex, watch: TIERS.watch.hex, signal: TIERS.signal.hex, advisory: TIERS.advisory.hex, resolved: TIERS.resolved.hex,
} as const;
export type Tone = keyof typeof TONE;

export function TierBadge({ tier, lang = 'en', size = 'md', className }: { tier: TierId; lang?: 'en' | 'pt'; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = TIERS[tier];
  const Icon = TIER_ICON[tier];
  const sz = size === 'sm' ? 'gap-1 px-2 py-0.5 text-[11px]' : size === 'lg' ? 'gap-2 px-3.5 py-1.5 text-sm' : 'gap-1.5 px-2.5 py-1 text-xs';
  return (
    <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-bold ring-1 ring-inset', t.cls, sz, className)}>
      <Icon className={size === 'lg' ? 'h-4 w-4' : size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={2.4} aria-hidden />
      {lang === 'pt' ? t.pt : t.label}
    </span>
  );
}

export function TierDot({ tier, pulse, className }: { tier: TierId; pulse?: boolean; className?: string }) {
  const t = TIERS[tier];
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5 shrink-0', className)} aria-hidden>
      {pulse && <span className={cn('absolute inset-0 animate-ping2 rounded-full', t.dot)} />}
      <span className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', t.dot)} />
    </span>
  );
}

export function HazardTag({ hazard, long, className }: { hazard: HazardId; long?: boolean; className?: string }) {
  return <span className={cn('chip', className)}><span className="mono text-[10px] text-ink-3">{hazard}</span>{long ? HAZARDS[hazard].long : HAZARDS[hazard].name}</span>;
}

export function Card({ className, children, id }: { className?: string; children: ReactNode; id?: string }) {
  return <section id={id} className={cn('card overflow-hidden', className)}>{children}</section>;
}

export function CardHead({ title, icon: Icon, action, sub }: { title: ReactNode; icon?: IconType; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card-head">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-sand text-ink-2"><Icon className="h-3.5 w-3.5" /></span>}
        <div className="min-w-0"><h2 className="eyebrow truncate !text-ink-2">{title}</h2>{sub && <p className="truncate text-xs text-ink-3">{sub}</p>}</div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, sub, actions }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex animate-rise flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="display mt-1.5 text-[2.35rem] leading-[1.04] sm:text-5xl">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[15px] text-ink-2">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export interface ActionItem { key: string; title: ReactNode; meta?: ReactNode; href?: string; onClick?: () => void; tier?: TierId; disabled?: boolean }
export function ActionList({ items, start = 1, empty }: { items: ActionItem[]; start?: number; empty?: ReactNode }) {
  if (!items.length) return <>{empty ?? null}</>;
  return (
    <ol className="divide-y divide-line">
      {items.map((it, i) => {
        const inner = (
          <>
            <span className="mono w-6 shrink-0 text-xs text-ink-3">{pad(start + i)}</span>
            {it.tier && <TierDot tier={it.tier} />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold text-ink">{it.title}</span>
              {it.meta && <span className="block truncate text-xs text-ink-2">{it.meta}</span>}
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-plum" aria-hidden />
          </>
        );
        const cls = 'group flex w-full items-center gap-3 px-5 py-3.5 text-left transition hover:bg-sand/50 disabled:cursor-not-allowed disabled:opacity-50';
        return <li key={it.key}>{it.href ? <Link href={it.href} className={cls}>{inner}</Link> : <button type="button" onClick={it.onClick} disabled={it.disabled} className={cls}>{inner}</button>}</li>;
      })}
    </ol>
  );
}

export function Meter({ value, max = 100, marker, tone = 'plum', className, label }: { value: number; max?: number; marker?: number; tone?: Tone; className?: string; label?: string }) {
  return (
    <div className={cn('relative h-2 rounded-full bg-sand', className)} role="meter" aria-label={label} aria-valuenow={Math.round(value * 100) / 100} aria-valuemin={0} aria-valuemax={max}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${clamp(value / max) * 100}%`, background: TONE[tone] }} />
      {marker !== undefined && <span className="absolute top-1/2 h-3.5 w-[2px] -translate-y-1/2 rounded bg-ink/60" style={{ left: `${clamp(marker / max) * 100}%` }} />}
    </div>
  );
}

export function Empty({ icon: Icon = Sparkles, title, body, action, className }: { icon?: IconType; title: ReactNode; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-sand text-ink-3"><Icon className="h-5 w-5" /></span>
      <p className="mt-4 font-bold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SyntheticBadge({ className }: { className?: string }) {
  return (
    <span title="All telemetry and reports in this demo are synthetic and labelled as such." className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-dashed border-line-strong bg-paper/70 px-2.5 py-1 text-[11px] font-bold text-ink-2', className)}>
      <FlaskConical className="h-3 w-3" aria-hidden />Synthetic data
    </span>
  );
}

const AV = [['#6E5575', '#C98BA6'], ['#0B3C49', '#3F8C8C'], ['#B4532A', '#E9A06A'], ['#4E5F8E', '#9BA7D9'], ['#5B6B3A', '#B8C27A']];
export function Avatar({ name, size = 32, status = false }: { name: string; size?: number; status?: boolean }) {
  const [a, b] = AV[Math.floor(hash01(name) * AV.length)];
  const init = name.replace(/^Dr\.?\s+/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="relative inline-grid shrink-0 place-items-center rounded-full font-bold text-paper" style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${a}, ${b})` }} aria-hidden>
      {init}
      {status && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-paper bg-[#1F9483]" />}
    </span>
  );
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md', className, label }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md'; className?: string; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex flex-wrap rounded-full border border-line bg-sand/60 p-1', className)}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={cn('rounded-full font-bold transition', size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3.5 py-1.5 text-xs', value === o.value ? 'bg-paper text-ink shadow-card' : 'text-ink-2 hover:text-ink')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-[13px] font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

export function KV({ rows, className }: { rows: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('divide-y divide-line/70', className)}>
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm"><dt className="text-ink-2">{k}</dt><dd className="text-right font-bold text-ink tabular-nums">{v}</dd></div>
      ))}
    </dl>
  );
}

export function Modal({ open, onClose, title, sub, children, footer, className }: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-espresso/35 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" className={cn('relative w-full max-w-lg animate-rise rounded-3xl border border-line bg-paper shadow-lift', className)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div><h2 className="display text-2xl leading-tight">{title}</h2>{sub && <p className="mt-0.5 text-sm text-ink-2">{sub}</p>}</div>
          <button onClick={onClose} className="rounded-full p-1.5 text-ink-3 hover:bg-sand hover:text-ink" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
