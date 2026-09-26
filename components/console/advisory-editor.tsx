'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeCheck, CalendarClock, ClipboardCheck, Eye, FileText, Loader2, RotateCcw, ShieldAlert, ShieldCheck, Sparkles, Trash2 } from 'lucide-react';
import type { Advisory, Lang } from '@/lib/types';
import { useWD } from '@/lib/store';
import { useSync } from '@/lib/sync';
import { useActorName } from '@/lib/hooks';
import { CITY, HAZARDS, SIGNS, SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { DRAFTER, canPublish, guardrails } from '@/lib/advisory';
import { signalObs } from '@/lib/select';
import { addH, cn, fmtWhen, hoursBetween } from '@/lib/utils';
import { defaultValidity } from '@/lib/advisory';
import { Card, CardHead, KV, Modal, Segmented } from '../ui';
import { toast } from '../toast';
import { DetailHeader, StatusPill } from './kit';
import { AdvisoryPreview, GuardrailList, LANG_LABEL, fromLocalInput, nextWeekdayAt, retime, toLocalInput } from './advisory-bits';
import { ReasonModal } from './reason-modal';
import { RequestLookModal } from './request-look';

const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length;

export function AdvisoryEditor({ adv }: { adv: Advisory }) {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const actor = useActorName();
  const site = SITE[adv.siteId], city = CITY[site.cityId];
  const sig = adv.signalId ? d.signals.find((s) => s.id === adv.signalId) : undefined;
  const obs = sig ? signalObs(d, sig) : [];
  const [text, setText] = useState<Partial<Record<Lang, string>>>(adv.text);
  const [validUntil, setValidUntil] = useState(adv.validUntil);
  const [escalate, setEscalate] = useState(!!sig);
  const [lang, setLang] = useState<Lang>(adv.langs.includes(city.lang) ? city.lang : adv.langs[0]);
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [look, setLook] = useState(false);

  // Remote mode: the server swaps the template for a Claude draft a few seconds after the draft is created. Adopt it
  // only while the coordinator has not typed; never overwrite their edits.
  const claudeOn = useSync((s) => !!s.workspace?.features?.aiDrafting);
  const aiModel = useSync((s) => s.workspace?.features?.model ?? null);
  const syncing = useSync((s) => s.pending > 0);
  const [awaitingClaude, setAwaitingClaude] = useState(() => !!useSync.getState().workspace?.features?.aiDrafting && adv.draft?.by === DRAFTER && !adv.edited);
  const baseDraft = useRef(JSON.stringify(adv.draft?.text ?? {}));
  const incoming = JSON.stringify(adv.draft?.text ?? {});
  useEffect(() => {
    if (incoming === baseDraft.current) return;
    const untouched = JSON.stringify(text) === baseDraft.current;
    baseDraft.current = incoming;
    if (untouched && adv.draft) setText({ ...adv.draft.text });
  }, [incoming]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (adv.draft?.by !== DRAFTER) setAwaitingClaude(false); }, [adv.draft?.by]);
  useEffect(() => {
    if (!awaitingClaude) return;
    const t = window.setTimeout(() => setAwaitingClaude(false), 20_000);
    return () => window.clearTimeout(t);
  }, [awaitingClaude]);

  // Debounced autosave: the store (and audit) only sees settled edits.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const cur = useWD.getState().d.advisories.find((a) => a.id === adv.id);
      if (!cur || cur.status !== 'draft') return;
      if (JSON.stringify(cur.text) !== JSON.stringify(text) || cur.validUntil !== validUntil) useWD.getState().dispatch({ type: 'advisory/edit', id: adv.id, text, validUntil });
    }, 450);
    return () => window.clearTimeout(t);
  }, [text, validUntil, adv.id]);

  const checks = useMemo(() => guardrails(text, adv.langs, validUntil, site), [text, adv.langs, validUntil, site]);
  const future = validUntil > addH(d.now, 1);
  const ok = canPublish(checks) && future;
  const blocking = checks.filter((c) => !c.pass && c.blocking).length + (future ? 0 : 1);
  const edited = adv.draft ? adv.langs.some((l) => (text[l] ?? '') !== (adv.draft!.text[l] ?? '')) : true;
  const drafting = claudeOn && awaitingClaude && syncing;
  const setWhen = (iso: string) => { setText((t) => retime(t, adv.langs, site, validUntil, iso)); setValidUntil(iso); };
  const presets = [
    { label: '+24 h', iso: defaultValidity(d.now, 24) }, { label: '+48 h', iso: defaultValidity(d.now, 48) }, { label: '+72 h', iso: defaultValidity(d.now, 72) },
    { label: 'Fri 18:00', iso: nextWeekdayAt(d.now, city.tz, 5, 18) }, { label: 'Sun 18:00', iso: nextWeekdayAt(d.now, city.tz, 0, 18) },
  ];
  const publish = () => {
    const st = useWD.getState();
    st.dispatch({ type: 'advisory/edit', id: adv.id, text, validUntil });
    st.dispatch({ type: 'advisory/publish', id: adv.id, actor, escalate: escalate && !!sig });
    setConfirm(false);
    toast(`${adv.id} is live`, `${site.followers} followers of ${site.id} see it now${escalate && sig ? ` · FHIR bundle queued for ${city.health}` : ''}.`);
  };

  return (
    <>
      <DetailHeader back="/app/advisories" backLabel="Advisories" eyebrow={`Advisory editor · started ${fmtWhen(adv.createdAt, tz)} by ${adv.createdBy}`} title={<>{adv.id} <span className="text-ink-3">· {site.id}</span></>}
        sub={`${site.stream}, ${city.name} · ${HAZARDS[adv.hazard].long}`}
        badges={<>
          <StatusPill kind="advisory" status="draft" />
          <span className={cn('chip', adv.draft && !edited && '!border-plum/30 !bg-plum-soft !text-plum-2')}>{adv.draft ? (edited ? <><BadgeCheck className="h-3 w-3" />Staff edited</> : <><Sparkles className="h-3 w-3" />{adv.draft.by === DRAFTER ? 'Template draft' : adv.draft.by.startsWith('claude') ? 'Claude draft' : adv.draft.by.startsWith('gemini') ? 'Gemini draft' : 'AI draft'} · {adv.draft.by}</>) : <><BadgeCheck className="h-3 w-3" />Staff-written</>}</span>
          {sig && <Link href={`/app/signals/${sig.id}`} className="chip hover:border-ink-3">From {sig.id} · score {sig.snapshot.score}</Link>}
        </>}
        actions={<button className="btn btn-primary btn-lg" disabled={!ok || drafting} onClick={() => setConfirm(true)}><ShieldCheck className="h-4 w-4" />Approve and publish</button>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <Card>
            <CardHead title="Bilingual advisory text" icon={FileText} action={drafting ? <span className="chip !border-plum/30 !bg-plum-soft !text-plum-2" role="status"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Drafting with {aiModel ?? 'AI'}…</span> : undefined} sub="Say what to avoid · never “safe” · always the validity window · under 20 words a sentence" />
            <div className="divide-y divide-line">
              {adv.langs.map((l) => {
                const v = text[l] ?? '';
                const changed = !!adv.draft && v !== (adv.draft.text[l] ?? '');
                return (
                  <div key={l} className="p-5">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor={`adv-${l}`} className="text-sm font-bold text-ink"><span className="mono mr-2 rounded bg-sand px-1.5 py-0.5 text-xs uppercase">{l}</span>{LANG_LABEL[l]}</label>
                      <div className="flex items-center gap-3 text-xs text-ink-3">
                        <span>{words(v)} words · {sentences(v)} sentences</span>
                        {changed && <button type="button" className="inline-flex items-center gap-1 font-bold text-plum hover:underline" onClick={() => setText((t) => ({ ...t, [l]: adv.draft!.text[l] }))}><RotateCcw className="h-3 w-3" />Reset to draft</button>}
                      </div>
                    </div>
                    <textarea id={`adv-${l}`} lang={l} readOnly={drafting} aria-busy={drafting} className={cn('input min-h-[150px] text-[15px] leading-relaxed', drafting && 'opacity-60')} value={v} onChange={(e) => { const nv = e.target.value; setText((t) => ({ ...t, [l]: nv })); }} />
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHead title="Validity window" icon={CalendarClock} sub={`${city.name} local time · changing it rewrites the time in every language`} />
            <div className="flex flex-wrap items-center gap-3 p-5">
              <div className="flex flex-wrap gap-1.5">{presets.map((p) => <button key={p.label} type="button" onClick={() => setWhen(p.iso)} className={cn('btn btn-sm', p.iso === validUntil ? 'btn-dark' : 'btn-outline')}>{p.label}</button>)}</div>
              <label><span className="sr-only">Valid until</span><input type="datetime-local" className="input !w-auto !py-2" value={toLocalInput(validUntil, city.tz)} onChange={(e) => { if (e.target.value) setWhen(fromLocalInput(e.target.value, city.tz)); }} /></label>
              <p className={cn('text-sm', future ? 'text-ink-2' : 'font-bold text-[#A11C3A]')}>{future ? `Valid for ${Math.round(hoursBetween(validUntil, d.now))} h · until ${fmtWhen(validUntil, city.tz)}` : 'Expiry must be at least one hour from now.'}</p>
            </div>
          </Card>

          {sig && (
            <Card>
              <CardHead title="Evidence behind this draft" icon={Eye} sub={`${sig.id} · ${sig.snapshot.evidence.reporters} reporters · ${sig.snapshot.evidence.categories.length} sign categories · rule: ${sig.openReason}`} />
              <ul className="flex flex-wrap gap-1.5 p-5">{[...new Set(obs.flatMap((o) => o.signs))].map((s) => <li key={s} className="chip">{SIGNS[s].en}</li>)}</ul>
            </Card>
          )}
        </div>

        <div className="space-y-5 xl:col-span-4">
          <Card>
            <CardHead title="Guardrail checks" icon={ShieldCheck} action={<span className={cn('chip', ok ? '!bg-[#D6EEE7] !text-[#0F6A60]' : '!bg-[#F7DCE0] !text-[#A11C3A]')}>{ok ? 'Ready to approve' : `${blocking} blocking`}</span>} />
            <GuardrailList checks={checks} />
          </Card>
          <Card>
            <CardHead title="Public preview" icon={Eye} action={adv.langs.length > 1 ? <Segmented size="sm" label="Preview language" value={lang} onChange={setLang} options={adv.langs.map((l) => ({ value: l, label: l.toUpperCase() }))} /> : undefined} />
            <div className="bg-canvas/50 p-5"><AdvisoryPreview site={site} text={text[lang] ?? ''} lang={lang} validUntil={validUntil} /></div>
          </Card>
          <Card>
            <CardHead title="Audit & dispatch" icon={ClipboardCheck} />
            <KV rows={[['Author', adv.createdBy], ['Draft origin', adv.draft ? `${adv.draft.by} · ${fmtWhen(adv.draft.at, tz)}` : 'Staff-written'], ['Approver', `${actor} (on publish)`], ['Rules', `v${RULES.version} · ${RULES.sha}`]]} />
            <label className={cn('flex items-start gap-3 border-t border-line px-5 py-3 text-sm', !sig && 'opacity-50')}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-plum" checked={escalate && !!sig} disabled={!sig} onChange={(e) => setEscalate(e.target.checked)} />
              <span><b className="text-ink">Escalate on publish</b><span className="block text-xs text-ink-2">{sig ? `Build and validate a FHIR One Health bundle for ${city.health}` : 'Needs a linked signal'}</span></span>
            </label>
            <p className="border-t border-line px-5 py-3 text-xs text-ink-3">{adv.draft?.by && adv.draft.by !== DRAFTER ? `Drafted by ${adv.draft.by} from a name-free brief (site, hazard, sign counts, validity), then checked by these same guardrails.` : adv.draft?.by === DRAFTER ? 'Drafted by the bounded template (template-v1).' : 'Written by staff.'} AI never scores, decides or publishes.</p>
          </Card>
          <Card>
            <CardHead title="Other actions" />
            <div className="grid gap-2 p-5">
              <button className="btn btn-outline" onClick={() => setLook(true)}><ClipboardCheck className="h-4 w-4" />Request further field sampling</button>
              <button className="btn border border-[#EDB7C0] bg-paper text-[#A11C3A] hover:bg-[#F7DCE0]" onClick={() => setDiscard(true)}><Trash2 className="h-4 w-4" />Discard draft</button>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title={`Approve and publish ${adv.id}?`} sub="This is the human-in-the-loop gate."
        footer={<><button className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button><button className="btn btn-primary" onClick={publish}><ShieldCheck className="h-4 w-4" />Approve and publish</button></>}>
        <ul className="space-y-2 text-sm text-ink">
          <li>• Goes live on the public app for <b>{site.followers}</b> followers of {site.id} and on its public site page.</li>
          <li>• Valid until <b>{fmtWhen(validUntil, city.tz)}</b> ({city.name} time). Resolves after {RULES.resolution.checks} independent “no signs” checks at least {RULES.resolution.minHours} h after publication.</li>
          {escalate && sig && <li>• Builds and validates a FHIR R4 bundle for <b>{city.health}</b> and queues it in the outbox.</li>}
          <li>• Recorded with your name (<b>{actor}</b>), the time, rules v{RULES.version} and a SHA-256 audit hash.</li>
        </ul>
      </Modal>
      <ReasonModal open={discard} onClose={() => setDiscard(false)} title={`Discard ${adv.id}`} sub={sig ? `${sig.id} stays open for another decision.` : undefined} confirmLabel="Discard draft"
        presets={['Field check found no signs', 'Superseded by a newer draft', 'Evidence too weak for a public precaution']}
        onConfirm={(reason) => { useWD.getState().dispatch({ type: 'advisory/withdraw', id: adv.id, actor, reason }); toast(`${adv.id} discarded`, 'Logged with your rationale.', 'info'); }} />
      <RequestLookModal open={look} onClose={() => setLook(false)} siteId={site.id} hazard={adv.hazard} signalId={sig?.id} />
    </>
  );
}
