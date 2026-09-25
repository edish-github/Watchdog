'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IconType } from '../icons';

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={cn('relative block', className)}>
      <span className="sr-only">{placeholder}</span>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input !rounded-full !py-2 !pl-10 !pr-9 text-sm" />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-3 hover:bg-sand hover:text-ink"><X className="h-3.5 w-3.5" /></button>}
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <label className={cn('relative inline-block', className)}>
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="input !w-auto appearance-none !rounded-full !py-2 !pl-4 !pr-9 text-sm font-bold">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
    </label>
  );
}

export function Tabs<T extends string>({ items, value, onChange, className }: { items: { value: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {items.map((it) => (
        <button key={it.value} type="button" role="tab" aria-selected={value === it.value} onClick={() => onChange(it.value)}
          className={cn('-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-bold transition', value === it.value ? 'border-plum text-ink' : 'border-transparent text-ink-3 hover:text-ink')}>
          {it.label}
          {it.count !== undefined && <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums', value === it.value ? 'bg-plum text-paper' : 'bg-sand text-ink-2')}>{it.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function usePaged<T>(rows: T[], size = 10) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(page, pages - 1);
  return { page: p, pages, setPage, slice: rows.slice(p * size, p * size + size), from: rows.length ? p * size + 1 : 0, to: Math.min(rows.length, p * size + size), total: rows.length };
}

export function Pager({ page, pages, from, to, total, setPage, noun = 'rows' }: { page: number; pages: number; from: number; to: number; total: number; setPage: (p: number) => void; noun?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-ink-2">
      <span>Displaying {from}–{to} of {total} {noun}</span>
      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost btn-sm !px-2" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" />Prev</button>
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} onClick={() => setPage(i)} aria-current={i === page ? 'page' : undefined} className={cn('h-8 min-w-[2rem] rounded-full text-xs font-bold', i === page ? 'bg-espresso text-paper' : 'text-ink-2 hover:bg-sand')}>{i + 1}</button>
          ))}
          <button className="btn btn-ghost btn-sm !px-2" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

export function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 1 | -1; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn('inline-flex items-center gap-1 uppercase tracking-[0.12em] transition hover:text-ink', active && 'text-ink')}>
      {label}{active && (dir === 1 ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
    </button>
  );
}

export function DetailHeader({ back, backLabel, eyebrow, title, sub, badges, actions }: { back: string; backLabel: string; eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; badges?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 animate-rise">
      <Link href={back} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-3 transition hover:text-ink"><ArrowLeft className="h-4 w-4" />{backLabel}</Link>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="display mt-1.5 text-[2.3rem] leading-[1.04] sm:text-5xl">{title}</h1>
          {sub && <p className="mt-2 max-w-3xl text-[15px] text-ink-2">{sub}</p>}
          {badges && <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Fact({ label, value, sub, icon: Icon, className }: { label: string; value: ReactNode; sub?: ReactNode; icon?: IconType; className?: string }) {
  return (
    <div className={cn('card p-4', className)}>
      <p className="flex items-center gap-1.5 text-xs text-ink-3">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-2">{sub}</p>}
    </div>
  );
}

const C = {
  amber: 'bg-[#FBEFD2] text-[#8F520A]', orange: 'bg-[#FBE2D0] text-[#A83E16]', rose: 'bg-[#F7DCE0] text-[#A11C3A]',
  teal: 'bg-[#D6EEE7] text-[#0F6A60]', grey: 'bg-[#ECE7DE] text-[#555B57]', plum: 'bg-plum-soft text-plum-2',
};
type PillKind = 'obs' | 'signal' | 'look' | 'advisory' | 'bundle' | 'watch';
const PILL: Record<PillKind, Record<string, [string, keyof typeof C]>> = {
  obs: { pending: ['Pending', 'amber'], fused: ['Fused', 'orange'], discarded: ['Discarded', 'grey'], context: ['Context', 'plum'], archived: ['Archived', 'grey'] },
  signal: { open: ['Open', 'orange'], look_requested: ['Look requested', 'amber'], advisory: ['Advisory live', 'rose'], dismissed: ['Dismissed', 'grey'], closed: ['Closed', 'teal'] },
  look: { queued: ['Queued', 'grey'], accepted: ['In progress', 'amber'], completed: ['Completed', 'teal'], expired: ['Expired', 'grey'] },
  advisory: { draft: ['Draft', 'plum'], live: ['Live', 'rose'], expired: ['Expired', 'grey'], withdrawn: ['Withdrawn', 'grey'], resolved: ['Resolved', 'teal'] },
  bundle: { queued: ['Queued', 'amber'], sending: ['Sending', 'plum'], sent: ['Sent', 'teal'], failed: ['Failed', 'rose'] },
  watch: { active: ['Active', 'amber'], closed: ['Closed', 'grey'] },
};
export function StatusPill({ kind, status, className }: { kind: PillKind; status: string; className?: string }) {
  const [label, tone] = PILL[kind][status] ?? [status, 'grey'];
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold', C[tone], className)}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{label}</span>;
}
