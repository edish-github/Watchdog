'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Menu, Smartphone } from 'lucide-react';
import { useWD } from '@/lib/store';
import { cn } from '@/lib/utils';
import { SyntheticBadge } from '../ui';
import { ReplayClock } from './replay';
import { ShareSandbox } from './share-sandbox';

const SECTION: Record<string, [string, string]> = {
  overview: ['Network', 'Overview'], sites: ['Network', 'Sites'], watches: ['Network', 'Watches'],
  observations: ['Response', 'Observations'], signals: ['Response', 'Signals'], verification: ['Response', 'Verification'], advisories: ['Response', 'Advisories'],
  fhir: ['Handoff', 'FHIR Outbox'], ledger: ['Learning', 'Season Ledger'], rules: ['System', 'Hazard Rules'], sources: ['System', 'Data Sources'], settings: ['System', 'Settings'],
};
function crumbsFor(path: string): { label: string; href?: string }[] {
  const [, , top, id] = path.split('/');
  const s = top ? SECTION[top] : undefined;
  if (!s) return [{ label: 'Console', href: '/app/overview' }];
  if (!id) return [{ label: s[0] }, { label: s[1] }];
  return [{ label: s[1], href: `/app/${top}` }, { label: id === 'new' ? 'Editor' : decodeURIComponent(id) }];
}

export function Topbar({ onMenu, onNotifications }: { onMenu: () => void; onNotifications: () => void }) {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);
  const notices = useWD((s) => s.d.notices);
  const unread = notices.filter((n) => !n.read).length;
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:px-6 lg:px-10">
        <button onClick={onMenu} className="btn btn-ghost btn-sm !px-2 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex items-center gap-2 text-sm">
            {crumbs.map((c, i) => (
              <li key={i} className="flex min-w-0 items-center gap-2">
                {i > 0 && <span className="text-ink-3">/</span>}
                {c.href ? <Link href={c.href} className="truncate text-ink-3 hover:text-ink">{c.label}</Link>
                  : <span className={cn('truncate', i === crumbs.length - 1 ? 'font-bold text-ink' : 'text-ink-3')}>{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
        <SyntheticBadge className="hidden md:inline-flex" />
        <Link href="/observe" target="_blank" className="btn btn-ghost btn-sm hidden xl:inline-flex"><Smartphone className="h-4 w-4" />Public app</Link>
        <ShareSandbox />
        <ReplayClock />
        <button onClick={onNotifications} className="relative grid h-9 w-9 place-items-center rounded-full text-ink-2 hover:bg-sand lg:hidden" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="h-[18px] w-[18px]" />{unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-plum ring-2 ring-canvas" />}
        </button>
      </div>
    </header>
  );
}
