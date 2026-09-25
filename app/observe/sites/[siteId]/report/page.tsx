'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CircleCheck, ExternalLink, LocateFixed, MapPin, Siren, Timer } from 'lucide-react';
import type { Feeling, ObservationInput, SignCode, SymptomCode } from '@/lib/types';
import { useWD } from '@/lib/store';
import { feelingText, signText, symptomText, useT, type Key } from '@/lib/i18n';
import { allStatuses } from '@/lib/select';
import { FEELINGS, SITE, SYMPTOMS } from '@/lib/catalog';
import { fmtDistance, nearestSites, useGeo } from '@/lib/geo';
import { toPhoto, type ProcessedPhoto } from '@/lib/photo';
import { cn } from '@/lib/utils';
import { SignGrid } from '@/components/observe/sign-grid';
import { PhotoInput } from '@/components/observe/photo-input';
import { SitePicker } from '@/components/observe/site-picker';
import { PublicTierBadge } from '@/components/observe/public';

function BottomBar({ children }: { children: React.ReactNode }) {
  return <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur">{children}</div>;
}

export default function ReportPage() {
  const params = useParams<{ siteId: string }>();
  const router = useRouter();
  const d = useWD((s) => s.d);
  const device = useWD((s) => s.device);
  const hydrated = useWD((s) => s.hydrated);
  const me = useGeo((s) => s.me);
  const { t, locale } = useT();
  const statuses = useMemo(() => allStatuses(d), [d]);
  const initial = (params.siteId ?? '').toUpperCase();
  const [siteId, setSiteId] = useState(SITE[initial] ? initial : 'COI-03');
  const site = SITE[siteId];
  const status = statuses.find((s) => s.site.id === siteId) ?? statuses[0];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [signs, setSigns] = useState<SignCode[]>([]);
  const [contextOnly, setContextOnly] = useState(false);
  const [onset, setOnset] = useState<'lt2h' | 'gt2h' | null>(null);
  const [symptoms, setSymptoms] = useState<SymptomCode[]>([]);
  const [dogName, setDogName] = useState('');
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(null);
  const [feeling, setFeeling] = useState<Feeling | undefined>();
  const [picker, setPicker] = useState(false);
  const [tried, setTried] = useState(false);
  const [started] = useState(() => Date.now());
  const [result, setResult] = useState<{ id: string; seconds: number } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    setDogName((v) => v || device.pet || '');
    setName((v) => v || device.name || '');
  }, [hydrated, device.pet, device.name]);

  const pick = (id: string) => { setSiteId(id); window.history.replaceState(null, '', `/observe/sites/${id}/report`); };
  const near = me ? nearestSites(me)[0] : undefined;
  const suggest = near && near.km < 1 && near.site.id !== siteId ? near : undefined;
  const hasDog = !contextOnly && signs.includes('dog_unwell');
  const needOnset = hasDog && !onset;
  const needSomething = contextOnly && !feeling && !photo;

  const submit = () => {
    setTried(true);
    if (needOnset || needSomething) return;
    const input: ObservationInput = {
      siteId, deviceId: device.id, displayName: name.trim() || undefined, role: 'walker', signs: contextOnly ? [] : signs,
      animal: hasDog && onset ? { species: 'dog', name: dogName.trim() || undefined, symptoms, onset } : undefined,
      feeling, photo: photo ? toPhoto(photo) : undefined, source: 'pwa',
    };
    const store = useWD.getState();
    const id = store.dispatch({ type: 'observation/submit', input });
    store.setDevice({ ...(name.trim() ? { name: name.trim() } : {}), ...(hasDog && dogName.trim() ? { pet: dogName.trim() } : {}) });
    setResult({ id: id ?? '', seconds: Math.max(1, Math.round((Date.now() - started) / 1000)) });
    setStep(3);
  };

  if (step === 3 && result) {
    const obs = d.observations.find((o) => o.id === result.id);
    const sig = obs?.signalId ? d.signals.find((s) => s.id === obs.signalId) : undefined;
    const acute = !!obs?.signs.includes('dog_unwell') && obs.animal?.onset === 'lt2h';
    const message = !obs ? '' : obs.status === 'context' ? t('contextSaved') : obs.status === 'fused' ? (sig?.observationIds[0] === obs.id ? t('startedCheck') : t('joinedCheck')) : t('waiting');
    const label = obs ? (sig ? t(`out_${sig.status}` as Key) : t(`os_${obs.status}` as Key)) : '';
    const vet = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locale === 'pt' ? 'veterinário 24 horas' : '24 hour emergency vet')}`;
    return (
      <div className="space-y-4 pb-4">
        <p className="eyebrow">{t('r3Title')}</p>
        {acute && (
          <section className="animate-rise rounded-3xl border-2 border-[#C8344F] bg-[#F7DCE0] p-4" role="alert">
            <p className="flex items-center gap-2 text-lg font-bold text-[#A11C3A]"><Siren className="h-5 w-5" />{t('vetTitle')}</p>
            <p className="mt-2 text-ink">{t('vetBody')}</p>
            <a href={vet} target="_blank" rel="noreferrer" className="btn btn-lg mt-3 w-full bg-[#A11C3A] text-paper hover:bg-[#8a1631]">{t('vetFind')}<ExternalLink className="h-4 w-4" /></a>
          </section>
        )}
        {obs?.signs.includes('dog_unwell') && !acute && <p className="rounded-2xl bg-[#FBEFD2] p-3 text-sm text-[#8F520A]">{t('vetLater')}</p>}
        <section className="card animate-rise p-6 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#D6EEE7] text-[#0F6A60]"><CircleCheck className="h-7 w-7" /></span>
          <h1 className="display mt-4 text-3xl">{obs?.displayName ? t('thanks', { name: obs.displayName }) : t('thanksAnon')}</h1>
          <p className="mt-2 text-ink-2">{message}</p>
          <dl className="mt-5 grid grid-cols-2 gap-2 text-left">
            <div className="rounded-2xl bg-sand/60 p-3"><dt className="text-xs text-ink-3">{t('reportId')}</dt><dd className="mono mt-0.5 font-bold text-ink">#{result.id}</dd></div>
            <div className="rounded-2xl bg-sand/60 p-3"><dt className="text-xs text-ink-3">{t('statusL')}</dt><dd className="mt-0.5 text-sm font-bold text-ink">{label}</dd></div>
          </dl>
          <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-ink-3"><Timer className="h-3.5 w-3.5" />{t('reportTime', { s: result.seconds })}</p>
        </section>
        <div className="grid gap-2">
          <Link href="/observe/observations" className="btn btn-primary btn-lg">{t('trackStatus')}</Link>
          <Link href={`/observe/sites/${siteId}`} className="btn btn-outline btn-lg">{t('returnStream')}</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <button onClick={() => (step === 2 ? setStep(1) : router.push(`/observe/sites/${siteId}`))} className="btn btn-ghost btn-sm !px-2"><ArrowLeft className="h-4 w-4" />{step === 2 ? t('back') : t('cancel')}</button>
        <span className="text-sm font-bold text-ink-2">{t('stepOf', { n: step })}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-label={t('stepOf', { n: step })} aria-valuemin={1} aria-valuemax={3} aria-valuenow={step}>
        <div className="h-full rounded-full bg-plum transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }} />
      </div>

      {step === 1 && (
        <>
          <section className="card mt-4 flex items-center gap-3 p-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sand text-ink-2"><MapPin className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-xs font-bold text-ink-3">{t('where')}</p><p className="truncate font-bold text-ink">{site.stream} <span className="mono text-xs font-normal text-ink-3">{site.id}</span></p></div>
            <PublicTierBadge tier={status.tier} size="sm" />
            <button className="btn btn-soft btn-sm" onClick={() => setPicker(true)}>{t('change')}</button>
          </section>
          {suggest && (
            <button onClick={() => pick(suggest.site.id)} className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-plum-soft/70 px-3 py-2.5 text-left text-sm font-bold text-plum-2">
              <LocateFixed className="h-4 w-4 shrink-0" />{t('nearestSuggest', { site: suggest.site.id, d: fmtDistance(suggest.km) })}
            </button>
          )}
          <h1 className="display mt-6 text-[2rem] leading-tight">{t('r1Title')}</h1>
          <p className="mt-1 text-sm text-ink-2">{t('r1Sub')}</p>
          <div className="mt-4"><SignGrid value={signs} onChange={(v) => { setSigns(v); setContextOnly(false); }} /></div>
          <button className="mt-5 text-left text-sm text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink" onClick={() => { setContextOnly(true); setSigns([]); setStep(2); }}>{t('nothingUnusual')}</button>
          <BottomBar>
            <span className="flex-1 text-sm font-bold text-ink-2">{t('selected', { n: signs.length })}</span>
            <button disabled={!signs.length} onClick={() => { setContextOnly(false); setStep(2); }} className="btn btn-primary btn-lg">{t('next')}<ArrowRight className="h-4 w-4" /></button>
          </BottomBar>
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="display mt-5 text-[2rem] leading-tight">{contextOnly ? t('r2TitleCtx') : t('r2Title')}</h1>
          {!contextOnly && <div className="mt-2 flex flex-wrap gap-1.5">{signs.map((s) => <span key={s} className="chip">{signText(s, locale)}</span>)}</div>}
          <div className="mt-5 space-y-5">
            {hasDog && (
              <section className="card space-y-4 p-4">
                <fieldset>
                  <legend className="font-bold text-ink">{t('onsetQ')}</legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {(['lt2h', 'gt2h'] as const).map((o) => (
                      <button key={o} type="button" aria-pressed={onset === o} onClick={() => setOnset(o)}
                        className={cn('rounded-2xl border px-3 py-3 text-sm font-bold transition', onset === o ? 'border-plum bg-plum text-paper' : 'border-line bg-paper text-ink hover:border-ink-3')}>{t(o)}</button>
                    ))}
                  </div>
                  {tried && needOnset && <p role="alert" className="mt-1.5 text-xs text-[#A11C3A]">{t('needOnset')}</p>}
                </fieldset>
                <fieldset>
                  <legend className="font-bold text-ink">{t('symptomsQ')}</legend>
                  <div className="mt-2 space-y-1.5">
                    {(Object.keys(SYMPTOMS) as SymptomCode[]).map((s) => (
                      <label key={s} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm', symptoms.includes(s) ? 'border-plum bg-plum-soft/60' : 'border-line bg-paper')}>
                        <input type="checkbox" className="h-5 w-5 accent-plum" checked={symptoms.includes(s)} onChange={() => setSymptoms((v) => (v.includes(s) ? v.filter((x) => x !== s) : [...v, s]))} />
                        {symptomText(s, locale)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <label className="block"><span className="text-sm font-bold text-ink">{t('dogName')}</span><input className="input mt-1.5" value={dogName} onChange={(e) => setDogName(e.target.value)} maxLength={30} /></label>
              </section>
            )}
            <section><p className="mb-2 text-sm font-bold text-ink">{t('photo')}</p><PhotoInput value={photo} onChange={setPhoto} /></section>
            <section>
              <p className="text-sm font-bold text-ink">{t('feelingQ')}</p>
              <p className="text-xs text-ink-3">{t('feelingNote')}</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {(Object.keys(FEELINGS) as Feeling[]).map((f) => (
                  <button key={f} type="button" aria-pressed={feeling === f} onClick={() => setFeeling(feeling === f ? undefined : f)}
                    className={cn('flex flex-col items-center gap-1 rounded-2xl border py-3 transition', feeling === f ? 'border-plum bg-plum-soft/70' : 'border-line bg-paper hover:border-ink-3')}>
                    <span className="text-2xl" aria-hidden>{FEELINGS[f].emoji}</span><span className="text-xs font-bold text-ink">{feelingText(f, locale)}</span>
                  </button>
                ))}
              </div>
              {tried && needSomething && <p role="alert" className="mt-1.5 text-xs text-[#A11C3A]">{t('needFeeling')}</p>}
            </section>
            <label className="block">
              <span className="text-sm font-bold text-ink">{t('signAs')}</span>
              <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} autoComplete="given-name" />
              <span className="mt-1 block text-xs text-ink-3">{t('signAsHint')}</span>
            </label>
          </div>
          <BottomBar>
            <button className="btn btn-outline btn-lg" onClick={() => setStep(1)}>{t('back')}</button>
            <button className="btn btn-primary btn-lg flex-1" onClick={submit}>{t('submit')}</button>
          </BottomBar>
        </>
      )}

      <SitePicker open={picker} onClose={() => setPicker(false)} value={siteId} onPick={pick} statuses={statuses} />
    </div>
  );
}
