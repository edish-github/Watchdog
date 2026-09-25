'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Bell, CheckCheck, ClipboardCheck, Eye, Inbox, Radar, Send, ShieldAlert, X } from 'lucide-react';
import type { Notice } from '@/lib/types';
import { useWD } from '@/lib/store';
import { cn, fmtAgo, localDate } from '@/lib/utils';
import type { IconType } from '../icons';
import { Empty } from '../ui';

const KIND: Record<Notice['kind'], { icon: IconType; bg: string; fg: string }> = {
  watch: { icon: Eye, bg: '#FBEFD2', fg: '#8F520A' },
  signal: { icon: Radar, bg: '#FBE2D0', fg: '#A83E16' },
  look: { icon: ClipboardCheck, bg: '#E3ECEE', fg: '#0B3C49' },
  advisory: { icon: ShieldAlert, bg: '#F7DCE0', fg: '#A11C3A' },
  fhir: { icon: Send, bg: '#EDE6EE', fg: '#5A4560' },
  report: { icon: Inbox, bg: '#ECE7DE', fg: '#555B57' },
};

export function NotificationsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const notices = useWD((s) => s.d.notices);
  const now = useWD((s) => s.d.now);
  const tz = useWD((s) => s.prefs.consoleTz);
  const router = useRouter();
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  const unread = notices.filter((n) => !n.read).length;
  const today = localDate(now, tz);
  const groups = [
    { label: 'Today', items: notices.filter((n) => localDate(n.at, tz) === today) },
    { label: 'Earlier', items: notices.filter((n) => localDate(n.at, tz) !== today) },
  ].filter((g) => g.items.length);
  const openNotice = (n: Notice) => { useWD.getState().dispatch({ type: 'notices/read', id: n.id }); onClose(); router.push(n.href); };

  return (
    <div className={cn('fixed inset-0 z-[70]', !open && 'pointer-events-none')} inert={!open}>
      <div onClick={onClose} className={cn('absolute inset-0 bg-espresso/25 transition-opacity duration-300', open ? 'opacity-100' : 'opacity-0')} aria-hidden />
      <aside role="dialog" aria-label="Notifications" className={cn('absolute inset-y-0 right-0 flex w-full max-w-[420px] flex-col border-l border-line bg-paper shadow-lift transition-transform duration-300', open ? 'translate-x-0' : 'translate-x-full')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div><p className="eyebrow">Notifications</p><p className="display text-2xl leading-tight">{unread ? `${unread} unread` : 'All caught up'}</p></div>
          <div className="flex items-center gap-1">
            <button className="btn btn-ghost btn-sm" disabled={!unread} onClick={() => useWD.getState().dispatch({ type: 'notices/read' })}><CheckCheck className="h-4 w-4" />Mark all read</button>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-ink-3 hover:bg-sand hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!groups.length && <Empty icon={Bell} title="No notifications yet" body="Watch windows, signals, look requests and advisories appear here as the replay clock runs." />}
          {groups.map((g) => (
            <div key={g.label}>
              <p className="sticky top-0 z-[1] bg-paper/95 px-5 pb-1.5 pt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-3 backdrop-blur">{g.label}</p>
              <ul>
                {g.items.map((n) => {
                  const k = KIND[n.kind], Icon = k.icon;
                  return (
                    <li key={n.id}>
                      <button onClick={() => openNotice(n)} className={cn('flex w-full gap-3 px-5 py-3 text-left transition hover:bg-sand/60', !n.read && 'bg-plum-soft/25')}>
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl" style={{ background: k.bg, color: k.fg }}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-start justify-between gap-2"><span className={cn('text-sm text-ink', !n.read && 'font-bold')}>{n.title}</span>{!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-plum" />}</span>
                          <span className="block text-[13px] text-ink-2">{n.body}</span>
                          <span className="block text-[11px] text-ink-3">{fmtAgo(n.at, now)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
