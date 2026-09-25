'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ClipboardCheck, Clock, Info, LogOut, MapPin } from 'lucide-react';
import type { LookRequest, LookResult, SignCode } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useT, type Key } from '@/lib/i18n';
import { CITY, PEOPLE, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { siteTier } from '@/lib/select';
import { fmtDistance, km, useGeo } from '@/lib/geo';
import { toPhoto, type ProcessedPhoto } from '@/lib/photo';
import { addH, cn, fmtClock, fmtDay, fmtSpan, hoursBetween } from '@/lib/utils';
import { Avatar } from '@/components/ui';
import { toast } from '@/components/toast';
import { PhotoInput } from '@/components/observe/photo-input';
import { PublicTierBadge } from '@/components/observe/public';

const VOLUNTEERS = Object.values(PEOPLE).filter((p) => p.role === 'citizen_scientist');

function MissionCard({ look }: { look: LookRequest }) {
  const d = useWD((s) => s.d);
  const me = useGeo((s) => s.me);
  const { t, locale } = useT();
  const [checked, setChecked] = useState<SignCode[]>([]);
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const site = SITE[look.siteId], tz = CITY[site.cityId].tz, tier = siteTier(d, site.id);
  const adv = look.advisoryId ? d.advisories.find((a) => a.id === look.advisoryId) : undefined;
  const due = hoursBetween(look.dueAt, d.now);
  const high = look.purpose === 'verify' && tier !== 'quiet' && tier !== 'resolved';
  const eligibleFrom = adv?.publishedAt ? addH(adv.publishedAt, RULES.resolution.minHours) : undefined;
  const send = (result: LookResult) => {
    useWD.getState().dispatch({ type: 'look/respond', id: look.id, result, observed: result === 'signs_present' ? checked : [], notes: notes.trim() || undefined, photo: photo ? toPhoto(photo) : undefined });
    toast(t('sent'), t('sentBody'));
  };

  return (
    <article className="card overflow-hidden">
      <div className="border-b border-line bg-sand/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">{look.purpose === 'resolve' ? t('resolveCheck') : t('verifyCheck')}</span>
          {high && <span className="chip !border-[#F1C3A2] !bg-[#FBE2D0] !text-[#A83E16]">{t('priorityHigh')}</span>}
          <span className="mono ml-auto text-xs text-ink-3">{look.id}</span>
        </div>
        <p className="mt-3 flex items-start gap-2 font-bold text-ink"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-plum" />{site.id} · {site.stream}</p>
        <p className="pl-6 text-sm text-ink-2">{site.reach}, {CITY[site.cityId].name}{me ? ` · ${fmtDistance(km(me, site))}` : ''}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 pl-6 text-xs text-ink-2">
          <span className={cn('inline-flex items-center gap-1 font-bold', due <= 3 && 'text-[#A11C3A]')}><Clock className="h-3.5 w-3.5" />{due > 0 ? t('dueIn', { t: fmtSpan(due) }) : t('overdue')}</span>
          <span>{t('requestedBy', { name: look.createdBy })}</span>
          <PublicTierBadge tier={tier} size="sm" />
        </div>
        {look.note && <p className="mt-3 flex gap-2 rounded-2xl bg-paper p-3 text-sm text-ink"><ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-3" />{look.note}</p>}
      </div>
      <div className="p-4">
        {look.purpose === 'resolve' && adv && (
          <p className="mb-3 flex gap-2 rounded-2xl bg-plum-soft/60 p-3 text-xs text-plum-2"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {adv.status !== 'live' ? t('advClosed') : eligibleFrom && d.now < eligibleFrom ? t('tooEarly', { when: `${fmtDay(eligibleFrom, tz, locale)} ${fmtClock(eligibleFrom, tz)}` }) : t('countsNow')}
          </p>
        )}
        {look.status === 'queued' ? (
          <button className="btn btn-primary btn-lg w-full" onClick={() => useWD.getState().dispatch({ type: 'look/accept', id: look.id })}>{t('accept')}</button>
        ) : (
          <>
            {look.acceptedAt && <p className="text-xs text-ink-3">{t('acceptedAt', { t: fmtClock(look.acceptedAt, tz) })}</p>}
            <fieldset className="mt-3">
              <legend className="font-bold text-ink">{t('checklist')}</legend>
              <p className="text-xs text-ink-3">{t('checklistHint')}</p>
              <div className="mt-2 space-y-1.5">
                {look.checklist.map((c) => {
                  const on = checked.includes(c.sign);
                  return (
                    <label key={c.sign} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm', on ? 'border-plum bg-plum-soft/60' : 'border-line bg-paper')}>
                      <input type="checkbox" className="h-5 w-5 accent-plum" checked={on} onChange={() => setChecked((v) => (on ? v.filter((x) => x !== c.sign) : [...v, c.sign]))} />
                      {locale === 'pt' ? c.labelPt : c.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <label className="mt-4 block"><span className="text-sm font-bold text-ink">{t('notes')}</span><textarea className="input mt-1.5 min-h-[84px]" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></label>
            <div className="mt-3"><PhotoInput value={photo} onChange={setPhoto} /></div>
            <div className="mt-4 grid gap-2">
              {checked.length ? <button className="btn btn-primary btn-lg" onClick={() => send('signs_present')}>{t('sendSigns')}</button> : <button className="btn btn-dark btn-lg" onClick={() => send('no_signs')}>{t('sendClear')}</button>}
              <button className="btn btn-ghost" onClick={() => send('no_access')}>{t('noAccess')}</button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}

export default function LookRequests() {
  const d = useWD((s) => s.d);
  const session = useWD((s) => s.session);
  const volunteer = useWD((s) => s.volunteer);
  const router = useRouter();
  const { t, locale } = useT();
  const signedIn = session && PEOPLE[session]?.role === 'citizen_scientist' ? PEOPLE[session] : undefined;
  const person = signedIn ?? PEOPLE[volunteer] ?? PEOPLE.tiago;
  const mine = useMemo(() => d.looks.filter((l) => l.assignee === person.id), [d, person.id]);
  const active = mine.filter((l) => l.status === 'queued' || l.status === 'accepted').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const done = mine.filter((l) => l.status === 'completed' || l.status === 'expired').sort((a, b) => (b.response?.at ?? b.dueAt).localeCompare(a.response?.at ?? a.dueAt));
  const credited = mine.filter((l) => l.status === 'completed' && l.response?.result !== 'no_access').length;
  const others = VOLUNTEERS.filter((p) => p.id !== person.id).map((p) => ({ p, n: d.looks.filter((l) => l.assignee === p.id && (l.status === 'queued' || l.status === 'accepted')).length })).filter((x) => x.n > 0);

  return (
    <div className="space-y-5">
      <header className="animate-rise">
        <h1 className="display text-[2.3rem] leading-[1.02]">{t('mTitle')}</h1>
        <p className="mt-1 text-sm text-ink-2">{t('mSub')}</p>
      </header>

      <section className="card p-4">
        <div className="flex items-center gap-3">
          <Avatar name={person.name} size={44} status />
          <div className="min-w-0 flex-1"><p className="font-bold text-ink">{person.name}</p><p className="truncate text-xs text-ink-2">{t('verified')} · {CITY[person.cityId ?? 'coimbra'].name}</p></div>
          {signedIn && <button className="btn btn-ghost btn-sm !px-2" onClick={() => { useWD.getState().logout(); router.push('/'); }} aria-label={t('signOut')}><LogOut className="h-4 w-4" /></button>}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <p className="rounded-xl bg-sand/60 px-3 py-2 font-bold text-ink">{t('credit', { n: credited })}</p>
          <p className="rounded-xl bg-sand/60 px-3 py-2 text-ink-2">{t('weight', { w: RULES.roles.verified })}</p>
        </div>
        {signedIn ? <p className="mt-2 text-xs text-ink-3">{t('signedInAs', { name: signedIn.email })}</p> : (
          <label className="mt-3 block">
            <span className="text-xs font-bold text-ink-3">{t('demoPick')}</span>
            <select className="input mt-1 !py-2" value={person.id} onChange={(e) => useWD.getState().setVolunteer(e.target.value)}>
              {VOLUNTEERS.map((p) => <option key={p.id} value={p.id}>{p.name} — {CITY[p.cityId ?? 'coimbra'].name}</option>)}
            </select>
          </label>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-2">{t('active')}</h2>
        {active.length ? <div className="space-y-3">{active.map((l) => <MissionCard key={l.id} look={l} />)}</div> : (
          <div className="rounded-2xl border border-dashed border-line-strong p-4 text-sm text-ink-2">
            <p>{t('noMissions')}</p>
            {others.length > 0 && !signedIn && (
              <div className="mt-3"><p className="text-xs font-bold text-ink-3">{t('othersHave')}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{others.map(({ p, n }) => <button key={p.id} className="chip hover:border-ink-3" onClick={() => useWD.getState().setVolunteer(p.id)}>{p.short} · {n}</button>)}</div>
              </div>
            )}
          </div>
        )}
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="eyebrow mb-2">{t('completed')}</h2>
          <ul className="card divide-y divide-line">
            {done.map((l) => {
              const tz = CITY[SITE[l.siteId].cityId].tz, r = l.response;
              return (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold text-ink">{l.siteId} · {l.purpose === 'resolve' ? t('resolveCheck') : t('verifyCheck')}</p><span className="mono text-xs text-ink-3">{l.id}</span></div>
                  <p className="text-xs text-ink-2">{r ? `${t(`res_${r.result}` as Key)} · ${fmtDay(r.at, tz, locale)} ${fmtClock(r.at, tz)}` : t('expired')}</p>
                  {r?.notes && <p className="mt-1 text-xs italic text-ink-2">“{r.notes}”</p>}
                  {l.purpose === 'resolve' && r?.result === 'no_signs' && <p className={cn('mt-1 text-xs font-bold', r.counted ? 'text-[#0F6A60]' : 'text-ink-3')}>{r.counted ? t('counted') : t('notCounted')}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
