'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronRight, LoaderCircle, LocateFixed, ShieldAlert } from 'lucide-react';
import type { CityId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { fmtDistance, nearestSites, useGeo } from '@/lib/geo';
import { allStatuses } from '@/lib/select';
import { CITIES, CITY, SITE, TIER_ORDER } from '@/lib/catalog';
import { whenText } from '@/lib/advisory';
import { cn } from '@/lib/utils';
import { CityMap } from '@/components/observe/city-map';
import { PublicTierBadge, SiteCard } from '@/components/observe/public';

export default function ObserveHome() {
  const d = useWD((s) => s.d);
  const follows = useWD((s) => s.follows);
  const device = useWD((s) => s.device);
  const me = useGeo((s) => s.me);
  const geo = useGeo((s) => s.status);
  const request = useGeo((s) => s.request);
  const { t, locale } = useT();
  const statuses = useMemo(() => allStatuses(d), [d]);
  const [city, setCity] = useState<CityId | null>(null);

  const near = useMemo(() => (me ? nearestSites(me) : []), [me]);
  const local = !!near[0] && near[0].km < 50;
  const cityId: CityId = city ?? (local ? near[0].site.cityId : SITE[follows[0]]?.cityId ?? 'coimbra');
  const dist = (id: string) => (local ? near.find((n) => n.site.id === id)?.km : undefined);
  const rank = (tier: (typeof TIER_ORDER)[number]) => TIER_ORDER.indexOf(tier);
  const alerts = statuses.filter((s) => follows.includes(s.site.id) && s.advisory);
  const followed = statuses.filter((s) => follows.includes(s.site.id)).sort((a, b) => rank(a.tier) - rank(b.tier));
  const inCity = statuses.filter((s) => s.site.cityId === cityId && !follows.includes(s.site.id))
    .sort((a, b) => (local ? (dist(a.site.id) ?? 0) - (dist(b.site.id) ?? 0) : rank(a.tier) - rank(b.tier) || b.score - a.score));

  return (
    <div className="space-y-6">
      <section className="animate-rise">
        <p className="text-sm font-bold text-ink-2">{device.name ? t('hello', { name: device.name }) : t('helloAnon')}</p>
        <h1 className="display mt-1 text-[2.4rem] leading-[1.02]">{t('homeTitle')}</h1>
        <p className="mt-2 text-sm text-ink-2">{t('homeSub')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => request()} disabled={geo === 'busy'} className="btn btn-outline btn-sm">
            {geo === 'busy' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}{geo === 'busy' ? t('locating') : t('useLocation')}
          </button>
          {local && <p className="text-xs text-ink-2">{t('nearYou', { site: near[0].site.id, d: fmtDistance(near[0].km) })}</p>}
        </div>
        {me && !local && near[0] && <p className="mt-2 text-xs text-ink-3">{t('farAway', { d: fmtDistance(near[0].km) })}</p>}
        {(geo === 'denied' || geo === 'unavailable') && <p className="mt-2 text-xs text-ink-3">{t('locDenied')}</p>}
      </section>

      {alerts.map((s) => {
        const a = s.advisory!;
        return (
          <Link key={a.id} href={`/observe/sites/${s.site.id}`} className="block rounded-3xl border border-[#EDB7C0] bg-[#F7DCE0]/70 p-4 transition hover:shadow-lift">
            <p className="flex items-center gap-2 text-sm font-bold text-[#A11C3A]"><ShieldAlert className="h-4 w-4" />{t('alertAt', { site: `${s.site.stream} (${s.site.id})` })}</p>
            <p className="mt-1.5 line-clamp-3 text-sm text-ink">{a.text[locale] ?? a.text.en}</p>
            <p className="mt-2 flex items-center justify-between text-xs font-bold text-[#A11C3A]">{t('validUntil', { when: whenText(a.validUntil, s.site, locale) })}<ChevronRight className="h-4 w-4" /></p>
          </Link>
        );
      })}

      <section>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="City">
          {CITIES.map((c) => (
            <button key={c.id} role="tab" aria-selected={cityId === c.id} onClick={() => setCity(c.id)}
              className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-bold transition', cityId === c.id ? 'border-espresso bg-espresso text-paper' : 'border-line bg-paper text-ink-2 hover:border-ink-3')}>{c.name}</button>
          ))}
        </div>
        <div className="card mt-3 overflow-hidden p-1.5">
          <CityMap cityId={cityId} statuses={statuses} me={me} follows={follows} />
          <p className="px-2.5 pb-1.5 pt-2 text-xs text-ink-3">{t('mapHint')}</p>
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-2">{t('following')}</h2>
        {followed.length ? (
          <div className="space-y-2.5">{followed.map((s) => <SiteCard key={s.site.id} st={s} now={d.now} distanceKm={dist(s.site.id)} />)}</div>
        ) : <p className="rounded-2xl border border-dashed border-line-strong p-4 text-sm text-ink-2">{t('noFollows')}</p>}
      </section>

      {inCity.length > 0 && (
        <section>
          <h2 className="eyebrow mb-2">{t('allIn', { city: CITY[cityId].name })}</h2>
          <div className="space-y-2.5">{inCity.map((s) => <SiteCard key={s.site.id} st={s} now={d.now} distanceKm={dist(s.site.id)} />)}</div>
        </section>
      )}

      <section className="flex flex-wrap gap-1.5">
        {(['quiet', 'watch', 'signal', 'advisory', 'resolved'] as const).map((tier) => <PublicTierBadge key={tier} tier={tier} size="sm" />)}
      </section>
    </div>
  );
}
