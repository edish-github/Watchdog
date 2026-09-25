'use client';

import Link from 'next/link';
import { Star } from 'lucide-react';
import type { HazardId, Site, TierId } from '@/lib/types';
import type { SiteStatus } from '@/lib/select';
import { CITY, TIERS } from '@/lib/catalog';
import { RULES, horizon } from '@/lib/engine';
import { useT, type Key } from '@/lib/i18n';
import { useWD } from '@/lib/store';
import { fmtDistance } from '@/lib/geo';
import { cn, fmtDay } from '@/lib/utils';
import { TIER_ICON } from '../ui';
import { toast } from '../toast';

export type Level = 'low' | 'moderate' | 'high';
export const riskLevel = (s: number): Level => (s >= RULES.tiers.watchOpen ? 'high' : s >= RULES.tiers.watchClose ? 'moderate' : 'low');
export const LEVEL_CLS: Record<Level, string> = {
  low: 'bg-[#ECE7DE] text-[#555B57]',
  moderate: 'bg-[#F6ECD6] text-[#7D5F22]',
  high: 'bg-[#FBE0AE] text-[#8F520A] ring-1 ring-inset ring-[#EED79E]',
};

/** Public-facing tier badge: a Signal reads “Being checked”. Always icon + word. */
export function PublicTierBadge({ tier, size = 'md', className }: { tier: TierId; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { t } = useT();
  const Icon = TIER_ICON[tier];
  const sz = size === 'sm' ? 'gap-1 px-2 py-0.5 text-[0.7rem]' : size === 'lg' ? 'gap-2 px-3.5 py-1.5 text-sm' : 'gap-1.5 px-2.5 py-1 text-xs';
  return (
    <span className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-bold ring-1 ring-inset', TIERS[tier].cls, sz, className)}>
      <Icon className={size === 'lg' ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={2.4} aria-hidden />{t(`tier_${tier}` as Key)}
    </span>
  );
}

export function DayStrip({ site, hazard, now, className }: { site: Site; hazard: HazardId; now: string; className?: string }) {
  const { t, locale } = useT();
  const tz = CITY[site.cityId].tz;
  const days = horizon(site, hazard, now, 3);
  return (
    <div className={cn('grid grid-cols-3 gap-1.5', className)}>
      {days.map((w, i) => {
        const lvl = riskLevel(w.score);
        return (
          <span key={w.date} className={cn('rounded-xl px-2 py-1.5 text-center', LEVEL_CLS[lvl])}>
            <span className="block text-[0.62rem] font-bold uppercase tracking-wide">{i === 0 ? t('today') : i === 1 ? t('tomorrow') : fmtDay(`${w.date}T12:00:00Z`, tz, locale).split(' ')[0]}</span>
            <span className="block text-xs font-bold">{t(lvl)}</span>
          </span>
        );
      })}
    </div>
  );
}

export function FollowButton({ siteId, full }: { siteId: string; full?: boolean }) {
  const { t } = useT();
  const follows = useWD((s) => s.follows);
  const on = follows.includes(siteId);
  const click = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    useWD.getState().toggleFollow(siteId);
    if (on) toast(t('unfollowed', { site: siteId }), undefined, 'info');
    else toast(t('followed', { site: siteId }), t('followedBody'), 'success');
  };
  if (full) return <button onClick={click} aria-pressed={on} className={cn('btn btn-lg w-full', on ? 'btn-soft' : 'btn-outline')}><Star className={cn('h-4 w-4', on && 'fill-plum text-plum')} />{on ? t('followingCta') : t('followCta')}</button>;
  return (
    <button onClick={click} aria-pressed={on} aria-label={on ? t('unfollowLabel') : t('follow')}
      className={cn('relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border transition', on ? 'border-plum/30 bg-plum-soft text-plum' : 'border-line bg-paper text-ink-3 hover:text-ink')}>
      <Star className={cn('h-4 w-4', on && 'fill-current')} />
    </button>
  );
}

export function SiteCard({ st, now, distanceKm }: { st: SiteStatus; now: string; distanceKm?: number }) {
  return (
    <div className="card relative flex items-start gap-3 p-4 transition hover:shadow-lift">
      <Link href={`/observe/sites/${st.site.id}`} className="absolute inset-0 rounded-2xl" aria-label={`${st.site.stream}, ${st.site.id}`} />
      <div className="pointer-events-none relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-xs text-ink-3">{st.site.id}</span>
          <PublicTierBadge tier={st.tier} size="sm" />
          {distanceKm !== undefined && <span className="text-xs text-ink-3">{fmtDistance(distanceKm)}</span>}
        </div>
        <p className="mt-1 text-base font-bold text-ink">{st.site.stream}</p>
        <p className="truncate text-sm text-ink-2">{st.site.reach}</p>
        <DayStrip site={st.site} hazard={st.hazard} now={now} className="mt-3" />
      </div>
      <FollowButton siteId={st.site.id} />
    </div>
  );
}
