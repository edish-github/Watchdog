'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { FilePenLine, Radar, TriangleAlert } from 'lucide-react';
import type { HazardId, Lang } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useActorName } from '@/lib/hooks';
import { ACTIVE, siteStatus } from '@/lib/select';
import { CITY, HAZARDS, SITE, SITES } from '@/lib/catalog';
import { watchToday } from '@/lib/engine';
import { defaultValidity, draftText } from '@/lib/advisory';
import { Card, CardHead, Field, PageHeader, Segmented, TierBadge } from '@/components/ui';
import { Select, StatusPill } from '@/components/console/kit';
import { LANG_LABEL, useOpenDraft } from '@/components/console/advisory-bits';

export default function NewAdvisoryPage() {
  return <Suspense fallback={null}><NewAdvisory /></Suspense>;
}

function NewAdvisory() {
  const params = useSearchParams();
  const router = useRouter();
  const d = useWD((s) => s.d);
  const actor = useActorName();
  const openDraft = useOpenDraft();
  const first = params.get('site')?.toUpperCase();
  const [siteId, setSiteId] = useState(first && SITE[first] ? first : 'COI-03');
  const [hz, setHz] = useState<HazardId>(params.get('hazard') === 'H2' ? 'H2' : 'H1');
  const signals = useMemo(() => d.signals.filter((s) => s.siteId === siteId && ACTIVE.includes(s.status)), [d, siteId]);
  const [signalId, setSignalId] = useState<string>(() => params.get('signal')?.toUpperCase() ?? signals[0]?.id ?? 'none');
  const [hours, setHours] = useState('72');
  const site = SITE[siteId], city = CITY[site.cityId], st = siteStatus(d, site);
  const langs: Lang[] = city.lang === 'pt' ? ['en', 'pt'] : ['en'];
  const sig = signals.find((s) => s.id === signalId);
  const pickSite = (id: string) => { setSiteId(id); setSignalId(d.signals.find((s) => s.siteId === id && ACTIVE.includes(s.status))?.id ?? 'none'); };

  const create = () => {
    if (sig) { openDraft(sig.id); return; }
    const validUntil = defaultValidity(d.now, Number(hours));
    const id = useWD.getState().dispatch({ type: 'advisory/create', siteId, hazard: hz, langs, text: draftText(site, hz, validUntil, [], langs), validUntil, actor });
    if (id) router.push(`/app/advisories/${id}`);
  };

  return (
    <>
      <PageHeader eyebrow="Advisories · New" title={<>Start a <span className="text-ink-3">precaution</span></>}
        sub="Pick the site and, ideally, the signal that justifies it. The draft opens in the editor — nothing is public until you approve it there." />
      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHead title="Draft setup" icon={FilePenLine} />
          <div className="space-y-5 p-5">
            <Field label="Site"><Select label="Site" value={siteId} onChange={pickSite} options={SITES.map((s) => ({ value: s.id, label: `${s.id} · ${s.stream}, ${CITY[s.cityId].name}` }))} /></Field>
            <div>
              <p className="mb-1.5 text-[13px] font-bold text-ink">Linked signal</p>
              {signals.length ? (
                <div className="space-y-1.5">
                  {signals.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-3 has-[:checked]:border-plum has-[:checked]:bg-plum-soft/50">
                      <input type="radio" name="sig" className="accent-plum" checked={signalId === s.id} onChange={() => { setSignalId(s.id); setHz(s.hazard); }} />
                      <span className="flex-1 text-sm"><b className="mono text-ink">{s.id}</b> · {HAZARDS[s.hazard].name} · score {s.snapshot.score} · {s.snapshot.evidence.reporters} reporters</span>
                      <StatusPill kind="signal" status={s.status} />
                    </label>
                  ))}
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-line p-3 has-[:checked]:border-plum">
                    <input type="radio" name="sig" className="accent-plum" checked={signalId === 'none'} onChange={() => setSignalId('none')} />
                    <span className="text-sm text-ink-2">No signal — staff-written precaution</span>
                  </label>
                </div>
              ) : <p className="flex gap-2 rounded-2xl bg-[#FBEFD2] p-3 text-sm text-[#8F520A]"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />No active signal at {siteId}. A staff-written precaution is allowed, but it cannot be handed off as FHIR without a signal.</p>}
            </div>
            {!sig && (
              <div className="flex flex-wrap gap-6">
                <div><p className="mb-1.5 text-[13px] font-bold text-ink">Hazard</p><Segmented size="sm" value={hz} onChange={setHz} options={[{ value: 'H1', label: 'H1 · Heat & low flow' }, { value: 'H2', label: 'H2 · Wet weather' }]} /></div>
                <div><p className="mb-1.5 text-[13px] font-bold text-ink">Validity</p><Segmented size="sm" value={hours} onChange={setHours} options={[{ value: '24', label: '24 h' }, { value: '48', label: '48 h' }, { value: '72', label: '72 h' }]} /></div>
              </div>
            )}
            <p className="text-sm text-ink-2">Languages: <b className="text-ink">{langs.map((l) => LANG_LABEL[l]).join(' + ')}</b>{city.lang !== 'pt' && city.lang !== 'en' && <span className="text-ink-3"> · {LANG_LABEL[city.lang]} drafting is on the roadmap; you can type it yourself in the editor.</span>}</p>
            <button className="btn btn-primary btn-lg" onClick={create}>{sig ? `Draft from ${sig.id}` : 'Create staff draft'}</button>
          </div>
        </Card>
        <Card className="xl:col-span-5">
          <CardHead title="Site context" icon={Radar} />
          <div className="space-y-3 p-5 text-sm">
            <div className="flex items-center justify-between"><span className="font-bold text-ink">{site.id} · {site.stream}</span><TierBadge tier={st.tier} size="sm" /></div>
            <p className="text-ink-2">{site.reach}, {city.name}</p>
            <p className="text-ink-2">Watch score today: <b className="text-ink">{watchToday(site, hz, d.now).score}</b>/100 for {HAZARDS[hz].name}</p>
            {st.advisory && <p className="rounded-2xl bg-[#F7DCE0]/70 p-3 text-xs text-[#A11C3A]">{st.advisory.id} is already live here. Publishing a new advisory for the same hazard supersedes it.</p>}
            <Link href={`/app/sites/${site.id}`} className="inline-block text-xs font-bold text-plum hover:underline">Open site telemetry →</Link>
          </div>
        </Card>
      </div>
    </>
  );
}
