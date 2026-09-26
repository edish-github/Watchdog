'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Boxes, LoaderCircle, Send, ShieldCheck } from 'lucide-react';
import { useWD } from '@/lib/store';
import { sendBundle, useOutbox } from '@/lib/outbox';
import { download } from '@/lib/download';
import { SITE } from '@/lib/catalog';
import { fmtWhen } from '@/lib/utils';
import { ActionList, Card, CardHead, Empty, KV, PageHeader } from '@/components/ui';
import { toast } from '@/components/toast';
import { Fact, StatusPill, Tabs } from '@/components/console/kit';

type TabKey = 'all' | 'queued' | 'sent' | 'failed';

export default function FhirOutboxPage() {
  const d = useWD((s) => s.d);
  const tz = useWD((s) => s.prefs.consoleTz);
  const endpoint = useOutbox((s) => s.endpoint);
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('all');
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => [...d.bundles].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [d]);
  const inTab = (s: string, t: TabKey) => t === 'all' || (t === 'queued' ? s === 'queued' || s === 'sending' : s === t);
  const shown = rows.filter((b) => inTab(b.status, tab));
  const pending = rows.filter((b) => b.status === 'queued' || b.status === 'failed');
  const resources = useMemo(() => { const m: Record<string, number> = {}; for (const b of rows) for (const e of b.bundle.entry) m[e.resource.resourceType] = (m[e.resource.resourceType] ?? 0) + 1; return m; }, [rows]);
  const errors = rows.reduce((n, b) => n + b.validation.errors.length, 0), warnings = rows.reduce((n, b) => n + b.validation.warnings.length, 0);
  const checks = rows.reduce((n, b) => n + b.validation.checked, 0);
  const host = endpoint.replace(/^https?:\/\//, '');
  const count = (t: TabKey) => rows.filter((b) => inTab(b.status, t)).length;

  const flush = async () => {
    setBusy(true);
    let delivered = 0;
    for (const b of pending) if ((await sendBundle(b, endpoint)).ok) delivered++;
    setBusy(false);
    toast('Outbox flushed', `${delivered} of ${pending.length} bundle(s) delivered to ${host}`, delivered === pending.length ? 'success' : 'warn');
  };

  return (
    <>
      <PageHeader eyebrow="Handoff · FHIR Outbox" title={<>HL7 FHIR R4 <span className="text-ink-3">outbox</span></>}
        sub="One Health transaction bundles — site, sentinel observations, the dog as an animal patient, the approved advisory and its provenance — for health services."
        actions={<button className="btn btn-primary" disabled={busy || !pending.length} onClick={flush}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Flush outbox ({pending.length})</button>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Bundles" value={rows.length} sub={`${count('queued')} queued · ${count('failed')} failed`} />
        <Fact label="Delivered" value={count('sent')} sub={`to ${host}`} />
        <Fact label="Validation errors" value={errors} sub={`${warnings} warnings · ${checks} checks run`} />
        <Fact label="Resources" value={Object.values(resources).reduce((a, b) => a + b, 0)} sub={`${resources.Patient ?? 0} animal patients`} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <Tabs className="px-3 pt-1" value={tab} onChange={setTab} items={[{ value: 'all', label: 'All', count: rows.length }, { value: 'queued', label: 'Queued', count: count('queued') }, { value: 'sent', label: 'Sent', count: count('sent') }, { value: 'failed', label: 'Failed', count: count('failed') }]} />
          {shown.length === 0 ? <Empty icon={Boxes} title="No bundles here" body="Bundles are built when a coordinator escalates a signal or publishes an advisory with “escalate” on." /> : (
            <div className="overflow-x-auto">
              <table className="tbl min-w-[820px]">
                <thead><tr><th>Bundle</th><th>Target</th><th>Site</th><th>Resources</th><th>Validation</th><th>Built</th><th>Status</th><th>HTTP</th></tr></thead>
                <tbody>
                  {shown.map((b) => (
                    <tr key={b.id} className="cursor-pointer" onClick={() => router.push(`/app/fhir/${b.id}`)}>
                      <td><Link href={`/app/fhir/${b.id}`} onClick={(e) => e.stopPropagation()} className="mono font-bold text-ink hover:text-plum">{b.id}</Link></td>
                      <td className="max-w-[200px] truncate text-xs">{b.target}</td>
                      <td className="mono text-xs">{b.siteId}<p className="font-sans text-ink-3">{SITE[b.siteId].stream}</p></td>
                      <td className="tabular-nums">{b.resourceCount}</td>
                      <td className="text-xs">{b.validation.errors.length ? <span className="font-bold text-[#A11C3A]">{b.validation.errors.length} errors</span> : <span className="font-bold text-[#0F6A60]">R4 valid</span>}{b.validation.warnings.length > 0 && <span className="text-ink-3"> · {b.validation.warnings.length} warn</span>}</td>
                      <td className="whitespace-nowrap text-xs">{fmtWhen(b.createdAt, tz)}</td>
                      <td><StatusPill kind="bundle" status={b.status} /></td>
                      <td className="mono text-xs">{b.http ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5 xl:col-span-4">
          <Card>
            <CardHead title="Validation" icon={ShieldCheck} />
            <KV rows={[['Local R4 structural checks', `${checks} run`], ['Errors', errors], ['Warnings', warnings], ['Profiles', 'R4 core + patient-animal extension'], ['HL7 Java validator', 'CI · npm run fhir:validate']]} />
          </Card>
          <Card>
            <CardHead title="Resource count" icon={Boxes} />
            {Object.keys(resources).length ? <KV rows={Object.entries(resources).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, v])} /> : <p className="px-5 py-4 text-sm text-ink-3">No resources yet.</p>}
          </Card>
          <Card>
            <CardHead title="Outbox queue controls" />
            <ActionList items={[
              ...(rows[0] ? [{ key: 'insp', tier: 'advisory' as const, href: `/app/fhir/${rows[0].id}`, title: `Inspect ${rows[0].id}`, meta: `${rows[0].resourceCount} resources · ${rows[0].status}` }] : []),
              { key: 'flush', onClick: flush, disabled: busy || !pending.length, title: `Flush ${pending.length} pending bundle(s)`, meta: `POST to ${host}` },
              { key: 'dl', onClick: () => download(`watchdog-fhir-outbox-${d.now.slice(0, 10)}.json`, JSON.stringify(rows.map((b) => b.bundle), null, 2)), disabled: !rows.length, title: 'Download all bundles (JSON)', meta: 'Array of R4 transaction bundles' },
              { key: 'ep', href: '/app/sources', title: 'Change endpoint or check the server', meta: endpoint },
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}
