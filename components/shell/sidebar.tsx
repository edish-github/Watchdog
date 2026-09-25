'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Bell, ChevronsUpDown, ClipboardCheck, Database, Eye, Inbox, LayoutDashboard, LogOut, MapPin, Radar, Scale, Send, Settings, ShieldAlert, Smartphone, Sprout, X } from 'lucide-react';
import { useWD } from '@/lib/store';
import { counts, type Counts } from '@/lib/select';
import { ROLE_LABEL, useActor, useClickAway } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { LogoMark, type IconType } from '../icons';
import { Avatar } from '../ui';

type Item = { href: string; label: string; icon: IconType; badge?: keyof Counts; urgent?: boolean };
const NAV: { section: string; items: Item[] }[] = [
  { section: 'Network', items: [
    { href: '/app/overview', label: 'Overview', icon: LayoutDashboard },
    { href: '/app/sites', label: 'Sites', icon: MapPin },
    { href: '/app/watches', label: 'Watches', icon: Eye },
  ] },
  { section: 'Response', items: [
    { href: '/app/observations', label: 'Observations', icon: Inbox, badge: 'pendingObs' },
    { href: '/app/signals', label: 'Signals', icon: Radar, badge: 'review', urgent: true },
    { href: '/app/verification', label: 'Verification', icon: ClipboardCheck, badge: 'looksOpen' },
    { href: '/app/advisories', label: 'Advisories', icon: ShieldAlert, badge: 'drafts' },
  ] },
  { section: 'Handoff', items: [{ href: '/app/fhir', label: 'FHIR Outbox', icon: Send, badge: 'bundlesQueued' }] },
  { section: 'Learning', items: [{ href: '/app/ledger', label: 'Season Ledger', icon: Sprout }] },
  { section: 'System', items: [
    { href: '/app/rules', label: 'Rules', icon: Scale },
    { href: '/app/sources', label: 'Data Sources', icon: Database },
    { href: '/app/settings', label: 'Settings', icon: Settings },
  ] },
];

function Indicator({ active }: { active: boolean }) {
  return (
    <span aria-hidden className={cn('grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-[1.5px] transition', active ? 'border-plum' : 'border-line-strong')}>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-plum" />}
    </span>
  );
}

export function Sidebar({ onNotifications, onClose }: { onNotifications: () => void; onClose?: () => void }) {
  const d = useWD((s) => s.d);
  const c = useMemo(() => counts(d), [d]);
  const pathname = usePathname();
  return (
    <aside className="flex h-full w-[264px] flex-col border-r border-line bg-paper/85 backdrop-blur-xl">
      <div className="flex items-center justify-between px-5 pb-4 pt-5">
        <Link href="/app/overview" onClick={onClose} className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-espresso text-paper shadow-card"><LogoMark className="h-6 w-6" /></span>
          <span className="leading-tight"><span className="block text-[15px] font-bold tracking-[0.2em] text-ink">WATCHDOG</span><span className="block text-[11px] text-ink-3">Environmental Early Warning</span></span>
        </Link>
        {onClose && <button onClick={onClose} aria-label="Close navigation" className="rounded-full p-1.5 text-ink-3 hover:bg-sand"><X className="h-4 w-4" /></button>}
      </div>
      <div className="mx-5 h-px bg-line" />
      <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 pb-3">
        {NAV.map((sec) => (
          <div key={sec.section} className="mt-3">
            <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-3">{sec.section}</p>
            <ul className="space-y-0.5">
              {sec.items.map((it) => {
                const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
                const n = it.badge ? c[it.badge] : 0;
                const Icon = it.icon;
                return (
                  <li key={it.href}>
                    <Link href={it.href} onClick={onClose} aria-current={active ? 'page' : undefined}
                      className={cn('group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] transition', active ? 'bg-paper text-ink shadow-card ring-1 ring-line' : 'text-ink-2 hover:bg-sand/70 hover:text-ink')}>
                      <Indicator active={active} />
                      <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-plum' : 'text-ink-3 group-hover:text-ink-2')} />
                      <span className={cn('flex-1 truncate', active && 'font-bold')}>{it.label}</span>
                      {n > 0 && <span className={cn('min-w-[20px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums', it.urgent ? 'bg-plum text-paper' : 'bg-sand text-ink-2')}>{n}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="mx-5 h-px bg-line" />
      <div className="space-y-1 p-3">
        <button onClick={onNotifications} className="group flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[14px] text-ink-2 transition hover:bg-sand/70 hover:text-ink">
          <Indicator active={false} /><Bell className="h-4 w-4 text-ink-3 group-hover:text-ink-2" /><span className="flex-1 text-left">Notifications</span>
          {c.unread > 0 && <span className="min-w-[20px] rounded-full bg-plum px-1.5 py-0.5 text-center text-[11px] font-bold tabular-nums text-paper">{c.unread}</span>}
        </button>
        <Profile />
      </div>
    </aside>
  );
}

function Profile() {
  const person = useActor();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickAway(ref, () => setOpen(false), open);
  if (!person) return null;
  const out = (to: string) => { setOpen(false); useWD.getState().logout(); router.push(to); };
  const row = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-ink-2 hover:bg-sand hover:text-ink';
  return (
    <div ref={ref} className="relative">
      {open && (
        <div className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-50 animate-rise rounded-2xl border border-line bg-paper p-1.5 shadow-lift">
          <div className="px-3 py-2"><p className="text-sm font-bold text-ink">{person.name}</p><p className="truncate text-xs text-ink-3">{person.email}</p><p className="mt-1 text-xs text-ink-2">{person.title}</p></div>
          <div className="my-1 h-px bg-line" />
          <Link href="/observe" target="_blank" className={row} onClick={() => setOpen(false)}><Smartphone className="h-4 w-4" />Open public app</Link>
          <Link href="/app/settings" className={row} onClick={() => setOpen(false)}><Settings className="h-4 w-4" />Console settings</Link>
          <button className={row} onClick={() => out('/login')}><ArrowLeftRight className="h-4 w-4" />Switch account</button>
          <button className={row} onClick={() => out('/')}><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      )}
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-sand/70">
        <Avatar name={person.name} size={34} status />
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink">{person.short}</span><span className="block truncate text-xs text-ink-3">{ROLE_LABEL[person.role]}</span></span>
        <ChevronsUpDown className="h-4 w-4 text-ink-3" />
      </button>
    </div>
  );
}
