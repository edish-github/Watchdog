'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useWD } from '@/lib/store';
import { useActor } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { LogoMark } from '../icons';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { NotificationsDrawer } from './notifications';

function Splash() {
  return (
    <div className="dot-grid grid min-h-screen place-items-center">
      <div className="flex flex-col items-center gap-3"><LogoMark className="h-10 w-10 animate-pulse text-ink" /><p className="eyebrow">Loading console</p></div>
    </div>
  );
}

/** Auth gate + the immutable console frame: sidebar, top bar, notifications. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const hydrated = useWD((s) => s.hydrated);
  const person = useActor();
  const router = useRouter();
  const pathname = usePathname();
  const [nav, setNav] = useState(false);
  const [notes, setNotes] = useState(false);
  const staff = !!person && person.role !== 'citizen_scientist';

  useEffect(() => {
    if (!hydrated) return;
    if (!person) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (!staff) router.replace('/observe/requests');
  }, [hydrated, person, staff, pathname, router]);
  useEffect(() => setNav(false), [pathname]);

  if (!hydrated || !staff) return <Splash />;
  return (
    <div className="dot-grid min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:shadow-lift">Skip to content</a>
      <div className="lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
        <div className="hidden lg:block"><div className="sticky top-0 h-screen"><Sidebar onNotifications={() => setNotes(true)} /></div></div>
        <div className="min-w-0">
          <Topbar onMenu={() => setNav(true)} onNotifications={() => setNotes(true)} />
          <main id="main" className="mx-auto w-full max-w-[1480px] px-4 pb-20 pt-7 sm:px-6 lg:px-10">{children}</main>
        </div>
      </div>
      <div className={cn('fixed inset-0 z-[60] lg:hidden', !nav && 'pointer-events-none')} inert={!nav}>
        <div onClick={() => setNav(false)} className={cn('absolute inset-0 bg-espresso/30 transition-opacity', nav ? 'opacity-100' : 'opacity-0')} aria-hidden />
        <div className={cn('absolute inset-y-0 left-0 transition-transform duration-300', nav ? 'translate-x-0' : '-translate-x-full')}>
          <Sidebar onNotifications={() => { setNav(false); setNotes(true); }} onClose={() => setNav(false)} />
        </div>
      </div>
      <NotificationsDrawer open={notes} onClose={() => setNotes(false)} />
    </div>
  );
}
