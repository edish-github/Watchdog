'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronDown, Fingerprint, Plus } from 'lucide-react';
import type { Advisory, Domain, Observation } from '@/lib/types';
import { useWD } from '@/lib/store';
import { signText, useT, type Key } from '@/lib/i18n';
import { CITY, FEELINGS, SITE } from '@/lib/catalog';
import { cn, fmtClock, fmtDay } from '@/lib/utils';
import { ForgetDevice } from '@/components/observe/forget-device';

function trace(d: Domain, o: Observation) {
  const sig = o.signalId ? d.signals.find((s) => s.id === o.signalId) : undefined;
  const adv = sig?.advisoryId ? d.advisories.find((a) => a.id === sig.advisoryId) : undefined;
  const look = sig ? d.looks.find((l) => l.signalId === sig.id && l.purpose === 'verify') : undefined;
  return { sig, adv, look };
}
const TONE: Record<string, string> = {
  open: 'bg-[#FBE2D0] text-[#A83E16]', look_requested: 'bg-[#FBE2D0] text-[#A83E16]', advisory: 'bg-[#F7DCE0] text-[#A11C3A]', closed: 'bg-[#D6EEE7] text-[#0F6A60]',
  dismissed: 'bg-[#ECE7DE] text-[#555B57]', pending: 'bg-[#FBEFD2] text-[#8F520A]', discarded: 'bg-[#ECE7DE] text-[#555B57]', context: 'bg-plum-soft text-plum-2', archived: 'bg-[#ECE7DE] text-[#555B57]',
};

export default function MyObservations() {
  const d = useWD((s) => s.d);
  const device = useWD((s) => s.device);
  const follows = useWD((s) => s.follows);
  const { t, locale } = useT();
  const [open, setOpen] = useState<string | null>(null);
  const mine = useMemo(() => d.observations.filter((o) => o.deviceId === device.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [d, device.id]);
  const promoted = mine.filter((o) => !!trace(d, o).adv?.publishedAt).length;
  const reached = useMemo(() => {
    const m = new Map<string, Advisory>();
    for (const o of mine) { const a = trace(d, o).adv; if (a?.publishedAt) m.set(a.id, a); }
    return [...m.values()].reduce((n, a) => n + SITE[a.siteId].followers, 0);
  }, [d, mine]);

  return (
    <div className="space-y-5">
      <header className="animate-rise">
        <h1 className="display text-[2.3rem] leading-[1.02]">{t('myTitle')}</h1>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-1 text-xs text-ink-2"><Fingerprint className="h-3.5 w-3.5" />{t('deviceId')}: <b className="mono text-ink">{device.id}</b> ({t('private')})</p>
      </header>

      <section className="grain relative overflow-hidden rounded-3xl bg-espresso p-5 text-paper">
        <p className="eyebrow !text-paper/60">{t('contrib')}</p>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          {[[mine.length, t('submitted')], [promoted, t('promoted')], [reached, t('reached')]].map(([v, k]) => (
            <div key={String(k)}><dd className="display text-4xl leading-none text-paper">{v}</dd><dt className="mt-1.5 text-xs leading-tight text-paper/70">{k}</dt></div>
          ))}
        </dl>
      </section>

      <Link href={`/observe/sites/${follows[0] ?? mine[0]?.siteId ?? 'COI-03'}/report`} className="btn btn-primary btn-lg w-full"><Plus className="h-4 w-4" />{t('newReport')}</Link>

      <section>
        <h2 className="eyebrow mb-2">{t('recent')}</h2>
        {!mine.length && <p className="rounded-2xl border border-dashed border-line-strong p-4 text-sm text-ink-2">{t('none')}</p>}
        <ul className="space-y-2.5">
          {mine.map((o) => {
            const { sig, adv, look } = trace(d, o), site = SITE[o.siteId], tz = CITY[site.cityId].tz, expanded = open === o.id;
            const key = sig ? sig.status : o.status;
            const label = sig ? t(`out_${sig.status}` as Key) : t(`os_${o.status}` as Key);
            const steps: { label: string; at: string }[] = [{ label: t('tl_reported'), at: o.createdAt }];
            if (sig) steps.push({ label: t('tl_fused', { id: sig.id }), at: sig.openedAt > o.createdAt ? sig.openedAt : o.createdAt });
            if (look) steps.push({ label: t('tl_look'), at: look.createdAt });
            if (adv?.publishedAt) steps.push({ label: t('tl_advisory'), at: adv.publishedAt });
            if (adv?.status === 'resolved' && adv.closedAt) steps.push({ label: t('tl_resolved'), at: adv.closedAt });
            if (sig?.status === 'dismissed' && sig.closedAt) steps.push({ label: t('tl_dismissed'), at: sig.closedAt });
            return (
              <li key={o.id} className="card overflow-hidden">
                <button onClick={() => setOpen(expanded ? null : o.id)} aria-expanded={expanded} className="flex w-full items-start gap-3 p-4 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-ink-3">{fmtDay(o.createdAt, tz, locale)} · {fmtClock(o.createdAt, tz)} · <span className="mono">{o.id}</span></p>
                    <p className="mt-0.5 font-bold text-ink">{site.id} · {site.stream}</p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-ink-2">{o.signs.length ? o.signs.map((s) => signText(s, locale)).join(' · ') : o.feeling ? `${FEELINGS[o.feeling].emoji} ${FEELINGS[o.feeling][locale]}` : '—'}</p>
                    <span className={cn('mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold', TONE[key])}>{label}</span>
                  </div>
                  <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-ink-3 transition', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <div className="border-t border-line bg-sand/30 p-4">
                    {o.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={o.photo.dataUrl} alt="" className="mb-3 max-h-44 w-full rounded-xl object-cover" />
                    )}
                    {o.statusNote && <p className="mb-3 text-xs text-ink-2">{o.statusNote}</p>}
                    <p className="eyebrow mb-2">{t('timeline')}</p>
                    <ol className="relative space-y-3 border-l-2 border-line pl-4">
                      {steps.map((s, i) => (
                        <li key={i} className="relative">
                          <span className={cn('absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full ring-4 ring-sand', i === steps.length - 1 ? 'bg-plum' : 'bg-ink-3')} />
                          <p className="text-sm font-bold text-ink">{s.label}</p>
                          <p className="text-xs text-ink-3">{fmtDay(s.at, tz, locale)} · {fmtClock(s.at, tz)}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <ForgetDevice />
    </div>
  );
}
