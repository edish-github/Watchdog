'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ClipboardCheck, Eye, Fingerprint, Radio, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import type { Advisory, Lang } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useActorName } from '@/lib/hooks';
import { CITY, HAZARDS, PEOPLE, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { defaultValidity, whenText } from '@/lib/advisory';
import { addH, cn, fmtSpan, fmtWhen, hoursBetween, sha256 } from '@/lib/utils';
import { ActionList, Card, CardHead, KV, Meter, Segmented, type ActionItem } from '../ui';
import { toast } from '../toast';
import { DetailHeader, StatusPill } from './kit';
import { AdvisoryPreview, LANG_LABEL } from './advisory-bits';
import { ReasonModal } from './reason-modal';
import { RequestLookModal } from './request-look';

export function AdvisoryView({ adv }: { adv: Advisory }) {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const actor = useActorName();
  const router = useRouter();
  const site = SITE[adv.siteId], city = CITY[site.cityId];
  const sig = adv.signalId ? d.signals.find((s) => s.id === adv.signalId) : undefined;
  const bundle = useMemo(() => d.bundles.filter((b) => b.advisoryId === adv.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [d, adv.id]);
  const [lang, setLang] = useState<Lang>(adv.langs.includes(city.lang) ? city.lang : adv.langs[0]);
  const [withdraw, setWithdraw] = useState(false);
  const [look, setLook] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const live = adv.status === 'live';
  const eligibleAt = adv.publishedAt ? addH(adv.publishedAt, RULES.resolution.minHours) : undefined;
  const eligible = !!eligibleAt && d.now >= eligibleAt;
  const resLooks = d.looks.filter((l) => l.advisoryId === adv.id);
  const approver = Object.values(PEOPLE).find((p) => p.name === adv.approvedBy);

  const verify = () => {
    const h = sha256(JSON.stringify({ id: adv.id, text: adv.text, validUntil: adv.validUntil, approvedBy: adv.approvedBy, at: adv.publishedAt, rules: RULES.sha }));
    setVerified(h === adv.auditHash);
  };
  const modify = () => {
    const id = useWD.getState().dispatch({ type: 'advisory/create', siteId: adv.siteId, hazard: adv.hazard, signalId: adv.signalId, langs: adv.langs, text: adv.text, validUntil: adv.validUntil > addH(d.now, 1) ? adv.validUntil : defaultValidity(d.now), actor });
    if (id) { toast(`${id} opened as a revision`, `Publishing it supersedes ${adv.id}.`, 'info'); router.push(`/app/advisories/${id}`); }
  };
  const escalate = () => {
    if (!sig) return;
    const id = useWD.getState().dispatch({ type: 'signal/escalate', id: sig.id, actor });
    toast(`${id} built and queued`, `One Health bundle for ${city.health}`);
  };
  const controls: ActionItem[] = [
    { key: 'pub', href: `/observe/sites/${site.id}`, title: 'View public walker presentation', meta: 'The site page on the public app' },
    ...(live ? [
      { key: 'res', tier: 'resolved' as const, onClick: () => setLook(true), title: 'Send a resolution check', meta: eligible ? 'Clear answers count now' : `Clear answers count from ${eligibleAt ? fmtWhen(eligibleAt, tz) : '—'}` },
      { key: 'mod', tier: 'advisory' as const, onClick: modify, title: 'Modify (new revision)', meta: `Opens an editable copy; publishing it supersedes ${adv.id}` },
      { key: 'wd', onClick: () => setWithdraw(true), title: 'Withdraw immediately', meta: 'Written rationale required · logged' },
    ] : []),
    ...(sig ? [{ key: 'sig', tier: 'signal' as const, href: `/app/signals/${sig.id}`, title: `Open ${sig.id}`, meta: `${sig.status.replace('_', ' ')} · score ${sig.snapshot.score}` }] : []),
  ];

  return (
    <>
      <DetailHeader back="/app/advisories" backLabel="Advisories" eyebrow={`${live ? 'Live advisory' : 'Advisory record'}${adv.publishedAt ? ` · published ${fmtWhen(adv.publishedAt, tz)}` : ''}`}
        title={<>{adv.id} <span className="text-ink-3">· {site.id}</span></>} sub={`${site.stream}, ${city.name} · ${HAZARDS[adv.hazard].long}`}
        badges={<><StatusPill kind="advisory" status={adv.status} /><span className="chip">{adv.edited ? 'Staff edited' : 'Unedited draft'}</span><span className="chip mono">{adv.langs.join(' / ').toUpperCase()}</span></>}
        actions={<Link href={`/observe/sites/${site.id}`} target="_blank" className="btn btn-outline"><Eye className="h-4 w-4" />Public view</Link>} />

      {!live && (
        <p className="mb-5 rounded-2xl border border-line bg-sand/60 px-4 py-3 text-sm text-ink-2">
          <b className="text-ink">{adv.status === 'resolved' ? 'Resolved' : adv.status === 'expired' ? 'Expired' : 'Withdrawn'}</b>{adv.closedAt && ` · ${fmtWhen(adv.closedAt, tz)}`}{adv.closeReason && ` — ${adv.closeReason}`}
        </p>
      )}

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHead title="Published text" icon={Radio} action={adv.langs.length > 1 ? <Segmented size="sm" label="Language" value={lang} onChange={setLang} options={adv.langs.map((l) => ({ value: l, label: l.toUpperCase() }))} /> : undefined} />
          <div className="p-5">
            <p className="text-xs font-bold text-ink-3">{LANG_LABEL[lang]}</p>
            <p lang={lang} className="mt-1 text-[17px] leading-relaxed text-ink">{adv.text[lang] ?? '—'}</p>
            <p className="mt-3 text-sm font-bold text-[#A11C3A]">Valid until {whenText(adv.validUntil, site, 'en')} · {fmtWhen(adv.validUntil, city.tz)} {city.name} time</p>
          </div>
        </Card>
        <Card className="xl:col-span-5">
          <CardHead title="As walkers see it" icon={Eye} />
          <div className="bg-canvas/50 p-5"><AdvisoryPreview site={site} text={adv.text[lang] ?? ''} lang={lang} validUntil={adv.validUntil} approvedBy={adv.approvedBy} /></div>
        </Card>

        <Card className="xl:col-span-6">
          <CardHead title="Publication audit" icon={Fingerprint} />
          <KV rows={[
            ['Approved by', adv.approvedBy ?? '—'], ['Role', approver?.title ?? '—'],
            ['Published', adv.publishedAt ? fmtWhen(adv.publishedAt, tz) : 'Never published'],
            ['Rules version', `v${adv.ruleVersion} · ${RULES.sha}`],
            ['Draft origin', adv.draft ? adv.draft.by : 'Staff-written'], ['Staff edited', adv.edited ? 'Yes' : 'No'],
          ]} />
          {adv.auditHash && (
            <div className="border-t border-line px-5 py-3">
              <p className="text-xs font-bold text-ink-2">Audit SHA-256</p>
              <p className="mono mt-1 break-all text-[11px] text-ink">{adv.auditHash}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button className="btn btn-outline btn-sm" onClick={verify}><ShieldCheck className="h-3.5 w-3.5" />Verify integrity</button>
                {verified !== null && <span className={cn('text-xs font-bold', verified ? 'text-[#0F6A60]' : 'text-[#A11C3A]')}>{verified ? '✓ Hash matches the published text, expiry and approver' : '✗ Mismatch — the record was altered after approval'}</span>}
              </div>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-6">
          <CardHead title="Broadcast targets" icon={Radio} />
          <ul className="divide-y divide-line/70 text-sm">
            <li className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="text-ink-2">Public app followers</span><span className="font-bold text-ink">{live ? `${site.followers} alerted` : 'Banner removed'}</span></li>
            <li className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="text-ink-2">Public site page</span><Link href={`/observe/sites/${site.id}`} target="_blank" className="font-bold text-plum hover:underline">{live ? 'Showing this advisory' : 'Back to forecast tier'}</Link></li>
            <li className="flex items-center justify-between gap-3 px-5 py-2.5">
              <span className="text-ink-2">Health liaison · FHIR</span>
              {bundle ? <Link href={`/app/fhir/${bundle.id}`} className="flex items-center gap-2"><span className="mono text-xs font-bold text-plum">{bundle.id}</span><StatusPill kind="bundle" status={bundle.status} /></Link>
                : sig && live ? <button className="btn btn-outline btn-sm" onClick={escalate}>Escalate now</button> : <span className="text-ink-3">{sig ? 'Not escalated' : 'No linked signal'}</span>}
            </li>
            <li className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="text-ink-2">Surveillance endpoint</span><span className="font-bold text-ink">{city.health}</span></li>
          </ul>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Advisory resolution protocol" icon={ClipboardCheck} />
          <KV rows={[
            ['Minimum duration', `${RULES.resolution.minHours} h from publication · ${!eligibleAt ? '—' : eligible ? 'met' : `from ${fmtWhen(eligibleAt, tz)}`}`],
            ['Required field input', `${RULES.resolution.checks} independent “no signs” checks`],
            ['Progress', `${adv.clearChecks.length} / ${RULES.resolution.checks} clear checks`],
            ['Validity', live ? `until ${fmtWhen(adv.validUntil, tz)} · ${fmtSpan(hoursBetween(adv.validUntil, d.now))} left` : fmtWhen(adv.validUntil, tz)],
          ]} />
          <div className="border-t border-line px-5 py-4">
            <Meter value={adv.clearChecks.length} max={RULES.resolution.checks} tone="resolved" label="Clear checks" />
            {adv.clearChecks.length > 0 && <ul className="mt-3 space-y-1 text-xs text-ink-2">{adv.clearChecks.map((c) => <li key={c.lookId}>✓ {PEOPLE[c.by]?.name ?? c.by} · {fmtWhen(c.at, tz)} · <Link href={`/app/verification/${c.lookId}`} className="mono font-bold text-plum hover:underline">{c.lookId}</Link></li>)}</ul>}
          </div>
          {resLooks.length > 0 && (
            <ul className="divide-y divide-line border-t border-line">
              {resLooks.map((l) => (
                <li key={l.id}><Link href={`/app/verification/${l.id}`} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm hover:bg-sand/50">
                  <span className="mono w-16 text-xs font-bold text-plum">{l.id}</span>
                  <span className="flex-1 text-ink-2">{PEOPLE[l.assignee]?.name}{l.response ? ` · ${l.response.result.replace('_', ' ')}${l.response.counted ? ' · counted' : l.response.result === 'no_signs' ? ' · not counted' : ''}` : ''}</span>
                  <StatusPill kind="look" status={l.status} />
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Controls" icon={SlidersHorizontal} />
          <ActionList items={controls} />
        </Card>
      </div>

      <ReasonModal open={withdraw} onClose={() => setWithdraw(false)} title={`Withdraw ${adv.id}`} sub="The public banner is removed immediately and the signal is closed." confirmLabel="Withdraw advisory"
        presets={['Laboratory sample came back clear', 'Issued for the wrong site', 'Conditions changed after heavy rain']}
        onConfirm={(reason) => { useWD.getState().dispatch({ type: 'advisory/withdraw', id: adv.id, actor, reason }); toast(`${adv.id} withdrawn`, 'Logged with your rationale.', 'info'); }} />
      <RequestLookModal open={look} onClose={() => setLook(false)} siteId={site.id} hazard={adv.hazard} signalId={sig?.id} purpose="resolve" />
    </>
  );
}
