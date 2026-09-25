'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ArrowLeft, ClipboardCheck, History, Info, Map as MapIcon, Plus, TriangleAlert } from 'lucide-react';
import { useWD } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { LogoMark } from '../icons';

/** Phone-width PWA frame: header with EN/PT + large text, scroll area, tab bar. On desktop it renders as a device. */
export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale } = useT();
  const largeText = useWD((s) => s.prefs.largeText);
  const follows = useWD((s) => s.follows);
  const storageFull = useWD((s) => s.storageFull);
  const session = useWD((s) => s.session);
  const scroller = useRef<HTMLDivElement>(null);
  const setPrefs = useWD.getState().setPrefs;

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [pathname]);
  useEffect(() => { document.documentElement.lang = locale; return () => { document.documentElement.lang = 'en'; }; }, [locale]);

  const reporting = pathname.endsWith('/report');
  const tabs = [
    { href: '/observe', label: t('navStreams'), icon: MapIcon, on: pathname === '/observe' || (pathname.startsWith('/observe/sites') && !reporting) },
    { href: '/observe/observations', label: t('navReports'), icon: History, on: pathname.startsWith('/observe/observations') },
    { href: `/observe/sites/${follows[0] ?? 'COI-03'}/report`, label: t('navReport'), icon: Plus, on: reporting, primary: true },
    { href: '/observe/requests', label: t('navMissions'), icon: ClipboardCheck, on: pathname.startsWith('/observe/requests') },
    { href: '/observe/about', label: t('navAbout'), icon: Info, on: pathname.startsWith('/observe/about') },
  ];

  return (
    <div className="dot-grid min-h-[100dvh] lg:flex lg:items-center lg:justify-center lg:gap-16 lg:px-8 lg:py-6">
      <aside className="hidden max-w-xs lg:block">
        <p className="eyebrow">{t('phoneEyebrow')}</p>
        <h1 className="display mt-2 text-5xl leading-[1.02]">{t('phoneTitle')}</h1>
        <p className="mt-4 text-ink-2">{t('phoneBody')}</p>
        <div className="mt-6 flex flex-col items-start gap-2">
          <Link href="/" className="btn btn-ghost btn-sm !px-0"><ArrowLeft className="h-4 w-4" />{t('backLanding')}</Link>
          <Link href={session ? '/app/overview' : '/login'} className="btn btn-outline btn-sm">{t('openConsole')}</Link>
        </div>
      </aside>

      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-canvas lg:mx-0 lg:h-[min(920px,calc(100dvh-3rem))] lg:rounded-[46px] lg:border-[10px] lg:border-espresso lg:shadow-lift">
        <header className="z-20 flex items-center justify-between gap-2 border-b border-line/70 bg-canvas/90 px-4 py-3 backdrop-blur">
          <Link href="/observe" className="flex min-w-0 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-espresso text-paper"><LogoMark className="h-5 w-5" /></span>
            <span className="min-w-0 leading-tight"><span className="block text-sm font-bold tracking-[0.18em] text-ink">WATCHDOG</span><span className="block truncate text-[0.7rem] text-ink-3">{t('appSub')}</span></span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5">
            <button onClick={() => setPrefs({ largeText: !largeText })} aria-pressed={largeText} aria-label={t('largeText')} title={t('largeText')}
              className={cn('grid h-8 min-w-[2.25rem] place-items-center rounded-full px-2 text-xs font-bold transition', largeText ? 'bg-espresso text-paper' : 'bg-sand text-ink hover:bg-line')}>Aa</button>
            <div className="flex rounded-full bg-sand p-0.5 text-[0.7rem] font-bold" role="group" aria-label="Language">
              {(['pt', 'en'] as const).map((l) => (
                <button key={l} onClick={() => setPrefs({ locale: l })} aria-pressed={locale === l} className={cn('rounded-full px-2.5 py-1 transition', locale === l ? 'bg-paper text-ink shadow-card' : 'text-ink-3 hover:text-ink')}>{l.toUpperCase()}</button>
              ))}
            </div>
          </div>
        </header>

        <div ref={scroller} className="relative flex-1 overflow-y-auto overscroll-contain">
          {storageFull && <p className="flex items-start gap-2 bg-[#FBEFD2] px-4 py-2 text-xs text-[#8F520A]"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t('storageFull')}</p>}
          <div className="px-4 pb-6 pt-4">{children}</div>
          <p className="pb-6 text-center text-[0.7rem] text-ink-3">{t('synthetic')}</p>
        </div>

        {!reporting && (
          <nav aria-label="App" className="z-20 grid grid-cols-5 items-end border-t border-line bg-paper/95 px-1 pb-[max(env(safe-area-inset-bottom),10px)] pt-1.5 backdrop-blur">
            {tabs.map((tb) => {
              const I = tb.icon;
              return tb.primary ? (
                <Link key="report" href={tb.href} className="flex flex-col items-center gap-1 text-[0.68rem] font-bold text-ink">
                  <span className="-mt-6 grid h-[3.25rem] w-[3.25rem] place-items-center rounded-full bg-plum text-paper shadow-lift ring-4 ring-canvas"><Plus className="h-6 w-6" /></span>{tb.label}
                </Link>
              ) : (
                <Link key={tb.href} href={tb.href} aria-current={tb.on ? 'page' : undefined} className={cn('flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.68rem] font-bold transition', tb.on ? 'text-plum' : 'text-ink-3 hover:text-ink')}>
                  <I className="h-5 w-5" />{tb.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
