'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleCheck, Eye, Radar, ShieldAlert, Sun } from 'lucide-react';
import type { HazardId, Site, TierId } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useT, type Key } from '@/lib/i18n';
import { siteStatus } from '@/lib/select';
import { CITY, PEOPLE, SITE } from '@/lib/catalog';
import { watchToday } from '@/lib/engine';
import { whenText } from '@/lib/advisory';
import { cn, hoursBetween } from '@/lib/utils';
import { Meter, Segmented } from '@/components/ui';
import { FollowButton, PublicTierBadge } from '@/components/observe/public';
import { RiskCurve } from '@/components/observe/risk-curve';

const CARD: Record<TierId, { cls: string; icon: typeof Eye }> = {
  advisory: { cls: 'border-[#EDB7C0] bg-[#F7DCE0]/70 text-[#A11C3A]', icon: ShieldAlert },
  signal: { cls: 'border-[#F1C3A2] bg-[#FBE2D0]/70 text-[#A83E16]', icon: Radar },
  watch: { cls: 'border-[#EED79E] bg-[#FBEFD2]/80 text-[#8F520A]', icon: Eye },
  resolved: { cls: 'border-[#A9DACB] bg-[#D6EEE7]/70 text-[#0F6A60]', icon: CircleCheck },
  quiet: { cls: 'border-line bg-paper text-ink-2', icon: Sun },
};

export default function PublicSitePage() {
  const { siteId } = useParams<{ siteId: string }>();
  const { t } = useT();
  const site = SITE[(siteId ?? '').toUpperCase()];
  if (!site) {
    return (
      <div className="py-16 text-center">
        <p className="display text-3xl">{t('siteNotFound')}</p>
        <Link href="/observe" className="btn btn-primary mt-6"><ArrowLeft className="h-4 w-4" />{t('navStreams')}</Link>
      </div>
    );
  }
  return <SiteView site={site} />;
}

function SiteView({ site }: { site: Site }) {
  const d = useWD((s) => s.d);
  const { t, locale } = useT();
  const st = useMemo(() => siteStatus(d, site), [d, site]);
  const [picked, setPicked] = useState<HazardId | null>(null);
  const hz = picked ?? st.hazard;
  const w = watchToday(site, hz, d.now);
  const tz = CITY[site.cityId].tz;
  const resolved = useMemo(() => d.advisories.filter((a) => a.siteId === site.id && a.status === 'resolved').sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))[0], [d, site.id]);
  const recent = d.observations.filter((o) => o.siteId === site.id && o.signs.length > 0 && hoursBetween(d.now, o.createdAt) <= 72).length;
  const card = CARD[st.tier], Icon = card.icon, adv = st.advisory;

  return (
    <div className="space-y-5">
      <Link href="/observe" className="inline-flex items-center gap-1 text-sm font-bold text-ink-2 hover:text-ink"><ArrowLeft className="h-4 w-4" />{t('navStreams')}</Link>

      <header className="animate-rise">
        <p className="mono text-xs text-ink-3">{site.id} · {CITY[site.cityId].name}</p>
        <h1 className="display mt-1 text-[2.3rem] leading-[1.02]">{site.stream}</h1>
        <p className="text-sm text-ink-2">{site.reach}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-xs font-bold text-ink-3">{t('status')}</span><PublicTierBadge tier={st.tier} /></div>
      </header>

      <section className={cn('rounded-3xl border p-4', card.cls)} aria-live="polite">
        <p className="flex items-center gap-2 font-bold"><Icon className="h-5 w-5" />
          {st.tier === 'advisory' ? t('advisoryTitle') : st.tier === 'signal' ? t('checkingTitle') : st.tier === 'watch' ? t('watchTitle', { hazard: t(`hz_${hz}` as Key) }) : st.tier === 'resolved' ? t('resolvedTitle') : t('quietTitle')}
        </p>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">
          {adv ? (adv.text[locale] ?? adv.text.en)
            : st.tier === 'signal' ? t('checkingBody')
            : st.tier === 'watch' ? t(`watchBody_${st.watch?.hazard ?? hz}` as Key)
            : st.tier === 'resolved' && resolved?.closedAt ? t('resolvedBody', { when: whenText(resolved.closedAt, site, locale) })
            : t('quietBody')}
        </p>
        {adv && (
          <div className="mt-3 space-y-0.5 border-t border-current/15 pt-2 text-xs font-bold">
            <p>{t('validUntil', { when: whenText(adv.validUntil, site, locale) })}</p>
            {adv.approvedBy && <p className="font-normal text-ink-2">{t('approvedBy', { name: adv.approvedBy })}</p>}
          </div>
        )}
        {(st.tier === 'watch' || st.tier === 'signal') && <p className="mt-2 text-xs text-ink-2">{t('notTest')}</p>}
      </section>

      <div className="grid gap-2">
        <Link href={`/observe/sites/${site.id}/report`} className="btn btn-primary btn-lg w-full">{t('reportCta')}<ArrowRight className="h-4 w-4" /></Link>
        <FollowButton siteId={site.id} full />
      </div>

      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="eyebrow !text-ink-2">{t('forecastTitle')}</h2>
          <Segmented size="sm" label={t('hazardSwitch')} value={hz} onChange={(v) => setPicked(v)} options={[{ value: 'H1' as HazardId, label: t('hz_H1') }, { value: 'H2' as HazardId, label: t('hz_H2') }]} />
        </div>
        <div className="mt-3"><RiskCurve site={site} hazard={hz} now={d.now} /></div>
      </section>

      <section className="card p-4">
        <h2 className="eyebrow !text-ink-2">{t('conditions')}</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {(hz === 'H1'
            ? [[t('maxTemp'), `${w.weather.tmax.toFixed(1)}°C`], [t('rain14'), `${w.weather.rain14.toFixed(1)} mm`], [t('flow'), `${Math.round(w.weather.flowRatio * 100)}%`]]
            : [[t('rainToday'), `${w.weather.rain.toFixed(1)} mm`], [t('rain72'), `${w.weather.rain72.toFixed(1)} mm`], [t('flow'), `${Math.round(w.weather.flowRatio * 100)}%`]]
          ).map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-sand/60 p-3"><dt className="text-[0.7rem] leading-tight text-ink-2">{k}</dt><dd className="mt-1 text-lg font-bold tabular-nums text-ink">{v}</dd></div>
          ))}
        </dl>
      </section>

      <section className="card p-4">
        <h2 className="eyebrow !text-ink-2">{t('whyTitle')}</h2>
        <div className="mt-3 space-y-3">
          {([[t('whyShade'), site.habitat.shadeCover, 'resolved'], [t('whyChannel'), site.habitat.channelModification, 'watch'], [t('whySealing'), site.habitat.soilSealing, 'watch']] as const).map(([k, v, tone]) => (
            <div key={k}>
              <div className="flex justify-between text-sm"><span className="text-ink-2">{k}</span><span className="font-bold tabular-nums text-ink">{Math.round(v * 100)}%</span></div>
              <Meter value={v} max={1} tone={tone} className="mt-1.5" label={k} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-ink-3">{t('whyNote')}</p>
      </section>

      <p className="text-center text-sm text-ink-2">{t('community', { n: recent })}</p>
      <a href="https://www.oneaquahealth.eu/2026/05/11/oneaquahealth-resilience-map-exploring-environmental-health-through-data/" target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 text-sm font-bold text-plum">
        {t('resilienceMap')}<ArrowUpRight className="h-4 w-4" />
      </a>
    </div>
  );
}
