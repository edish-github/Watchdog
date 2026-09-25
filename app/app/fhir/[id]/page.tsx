'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowUpRight, Boxes, Braces, Copy, Download, Fingerprint, LoaderCircle, Send, ShieldCheck } from 'lucide-react';
import type { BundleRecord } from '@/lib/types';
import { useWD } from '@/lib/store';
import { parseReceipt, sendBundle, useOutbox } from '@/lib/outbox';
import { copyText, download } from '@/lib/download';
import { SITE } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { cn, fmtWhen, sha256 } from '@/lib/utils';
import { Card, CardHead, Empty, KV } from '@/components/ui';
import { toast } from '@/components/toast';
import { DetailHeader, StatusPill } from '@/components/console/kit';
import { JsonView } from '@/components/console/json-view';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;
function describe(r: R): string {
  switch (r.resourceType) {
    case 'Location': return `${r.name} · ${r.address?.city ?? ''}`;
    case 'Observation': { const c = r.code?.coding?.[0]; const v = r.valueQuantity ? ` = ${r.valueQuantity.value} ${r.valueQuantity.unit ?? ''}` : r.valueBoolean ? ' · present' : ''; return `${c?.display ?? c?.code ?? 'Observation'}${v}`; }
    case 'Patient': return `Animal patient · ${r.name?.[0]?.text ?? 'unnamed'} · Canis lupus familiaris`;
    case 'Communication': return `Approved public advisory · ${r.payload?.length ?? 0} language(s)`;
    case 'Provenance': return `Signed: ${(r.agent ?? []).map((a: R) => a.who?.display).filter(Boolean).join(' · ')}`;
    default: return String(r.resourceType);
  }
}
const TYPE_TONE: Record<string, string> = { Location: 'bg-[#E3ECEE] text-river', Observation: 'bg-[#FBEFD2] text-[#8F520A]', Patient: 'bg-[#F7DCE0] text-[#A11C3A]', Communication: 'bg-plum-soft text-plum-2', Provenance: 'bg-[#D6EEE7] text-[#0F6A60]' };

export default function BundlePage() {
  const { id } = useParams<{ id: string }>();
  const b = useWD((s) => s.d.bundles.find((x) => x.id === (id ?? '').toUpperCase()));
  if (!b) return <Card><Empty icon={Boxes} title="Bundle not found" body="It may belong to another replay scenario." action={<Link href="/app/fhir" className="btn btn-primary btn-sm">FHIR outbox</Link>} /></Card>;
  return <BundleDetail b={b} />;
}

function BundleDetail({ b }: { b: BundleRecord }) {
  const tz = useWD((s) => s.prefs.consoleTz);
  const endpoint = useOutbox((s) => s.endpoint);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  const receipt = parseReceipt(b.receipt);
  const site = SITE[b.siteId];
  const send = async () => {
    setBusy(true);
    const r = await sendBundle(b, endpoint);
    setBusy(false);
    toast(r.ok ? `${b.id} delivered` : `${b.id} not delivered`, r.message, r.ok ? 'success' : 'warn');
  };
  const copy = async () => toast((await copyText(JSON.stringify(b.bundle, null, 2))) ? 'Bundle JSON copied' : 'Copy failed — use Download', undefined, 'info');
  const v = b.validation;

  return (
    <>
      <DetailHeader back="/app/fhir" backLabel="FHIR Outbox" eyebrow={`One Health bundle · built ${fmtWhen(b.createdAt, tz)} by ${b.createdBy}`} title={b.id}
        sub={<>Target: {b.target} · {site.id} {site.stream}{b.signalId && <> · from <Link href={`/app/signals/${b.signalId}`} className="font-bold text-plum hover:underline">{b.signalId}</Link></>}{b.advisoryId && <> · <Link href={`/app/advisories/${b.advisoryId}`} className="font-bold text-plum hover:underline">{b.advisoryId}</Link></>}</>}
        badges={<><StatusPill kind="bundle" status={b.status} /><span className="chip">transaction · {b.resourceCount} resources</span><span className={cn('chip', v.errors.length ? '!bg-[#F7DCE0] !text-[#A11C3A]' : '!bg-[#D6EEE7] !text-[#0F6A60]')}>{v.errors.length ? `${v.errors.length} errors` : 'R4 valid'}</span>{b.http && <span className="chip mono">HTTP {b.http}</span>}</>}
        actions={<>
          <button className="btn btn-outline" onClick={copy}><Copy className="h-4 w-4" />Copy JSON</button>
          <button className="btn btn-outline" onClick={() => download(`${b.id.toLowerCase()}.json`, JSON.stringify(b.bundle, null, 2), 'application/fhir+json')}><Download className="h-4 w-4" />Download</button>
          <button className="btn btn-primary" disabled={busy || b.status === 'sending'} onClick={send}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{b.status === 'sent' ? 'Resend to sandbox' : 'Send to sandbox'}</button>
        </>} />

      {b.error && <p className="mb-5 rounded-2xl border border-[#EDB7C0] bg-[#F7DCE0]/70 px-4 py-3 text-sm text-[#A11C3A]"><b>Delivery failed:</b> {b.error}</p>}
      <p className="mb-5 text-xs text-ink-3">Sends go to <span className="mono">{endpoint}</span> — a public test server. The bundle is tagged <span className="mono">synthetic-demo</span>; never send real personal data there.</p>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHead title="HL7 FHIR R4 resource composition" icon={Boxes} sub="Click a resource to inspect its JSON" />
          <ol className="divide-y divide-line/70">
            <li><button onClick={() => setSel(null)} className={cn('flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition hover:bg-sand/50', sel === null && 'bg-plum-soft/40')}><span className="mono w-5 text-xs text-ink-3">0</span><span className="rounded-md bg-espresso px-2 py-0.5 text-[11px] font-bold text-paper">Bundle</span><span className="text-ink-2">type transaction · id {b.bundle.id}</span></button></li>
            {b.bundle.entry.map((e, i) => (
              <li key={e.fullUrl}>
                <button onClick={() => setSel(i)} className={cn('flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm transition hover:bg-sand/50', sel === i && 'bg-plum-soft/40')}>
                  <span className="mono w-5 text-xs text-ink-3">{i + 1}</span>
                  <span className={cn('rounded-md px-2 py-0.5 text-[11px] font-bold', TYPE_TONE[e.resource.resourceType] ?? 'bg-sand text-ink')}>{e.resource.resourceType}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-2">{describe(e.resource as R)}</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Validation report" icon={ShieldCheck} action={<span className="mono text-xs text-ink-3">{v.checked} checks</span>} />
          <div className="space-y-3 p-5 text-sm">
            <p className={cn('font-bold', v.errors.length ? 'text-[#A11C3A]' : 'text-[#0F6A60]')}>{v.errors.length ? `${v.errors.length} error(s) — delivery is blocked` : '0 errors · structure, references and required elements pass'}</p>
            {v.errors.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-[#A11C3A]">{v.errors.map((x) => <li key={x}>{x}</li>)}</ul>}
            {v.warnings.length > 0 && <div><p className="text-xs font-bold text-[#8F520A]">Warnings</p><ul className="list-disc space-y-1 pl-5 text-xs text-ink-2">{v.warnings.map((x) => <li key={x}>{x}</li>)}</ul></div>}
            <div><p className="text-xs font-bold text-ink-2">Notes</p><ul className="list-disc space-y-1 pl-5 text-xs text-ink-2">{v.notes.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <p className="text-[11px] text-ink-3">Local structural R4 checks. The HL7 Java validator against the OAH implementation guide runs in CI with the backend.</p>
          </div>
        </Card>

        <Card className="xl:col-span-5">
          <CardHead title="Cryptographic provenance" icon={Fingerprint} />
          <KV rows={[['Author', b.createdBy], ['Rules', `v${RULES.version} · ${RULES.sha}`], ['Built', fmtWhen(b.createdAt, tz)], ['Sent', b.sentAt ? fmtWhen(b.sentAt, tz) : '—']]} />
          <div className="border-t border-line px-5 py-3">
            <p className="text-xs font-bold text-ink-2">SHA-256 of the bundle as built</p>
            <p className="mono mt-1 break-all text-[11px] text-ink">{b.hash}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button className="btn btn-outline btn-sm" onClick={() => setVerified(sha256(JSON.stringify(b.bundle)) === b.hash)}><ShieldCheck className="h-3.5 w-3.5" />Verify integrity</button>
              {verified !== null && <span className={cn('text-xs font-bold', verified ? 'text-[#0F6A60]' : 'text-[#8F520A]')}>{verified ? '✓ Unchanged since it was built' : 'Changed since built — e.g. a reporter erased their pet’s name'}</span>}
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-7">
          <CardHead title="Delivery receipt" icon={Send} />
          {receipt ? (
            <div className="p-5">
              <p className="text-sm text-ink"><b>HTTP {receipt.http}</b> from <span className="mono text-xs">{receipt.endpoint}</span> in {receipt.ms} ms · {receipt.entries.length} entries</p>
              <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto">
                {receipt.entries.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-sand/50 px-3 py-1.5 text-xs">
                    <span className="mono text-ink-2">{e.status}</span>
                    {e.location ? <a href={`${receipt.endpoint}/${e.location.split('/_history')[0]}`} target="_blank" rel="noreferrer" className="mono inline-flex items-center gap-1 font-bold text-plum hover:underline">{e.location.split('/_history')[0]}<ArrowUpRight className="h-3 w-3" /></a> : <span className="text-ink-3">—</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-3">Links open the created resources on the server.</p>
            </div>
          ) : <p className="px-5 py-4 text-sm text-ink-2">{b.receipt ?? 'Not delivered yet. “Send to sandbox” POSTs this transaction to the endpoint and records the server’s response here.'}</p>}
        </Card>

        <Card className="xl:col-span-12">
          <CardHead title={sel === null ? 'Bundle JSON' : `${b.bundle.entry[sel].resource.resourceType} · entry ${sel + 1}`} icon={Braces} action={sel !== null ? <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>Show whole bundle</button> : undefined} />
          <div className="p-5"><JsonView value={sel === null ? b.bundle : b.bundle.entry[sel]} className="max-h-[560px]" /></div>
        </Card>
      </div>
    </>
  );
}
