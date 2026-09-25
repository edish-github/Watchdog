'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CircleCheck, CircleX, FlaskConical, LoaderCircle, Play, Scale, ShieldCheck } from 'lucide-react';
import { RULES } from '@/lib/engine';
import { TEST_COUNT, runSelfTests, type TestResult } from '@/lib/selftest';
import { download } from '@/lib/download';
import { cn } from '@/lib/utils';
import { ActionList, Card, CardHead, KV, PageHeader } from '@/components/ui';

const ROWS = [
  { id: 'RULE-01', hz: 'H1', name: 'Heat & low-flow benthic mats', trigger: `${RULES.h1.w.heat}·heat + ${RULES.h1.w.dry}·dry + ${RULES.h1.w.flow}·flow`, active: true },
  { id: 'RULE-02', hz: 'H2', name: 'Wet-weather sewage & run-off', trigger: `${RULES.h2.w.storm}·storm + ${RULES.h2.w.burst}·burst72`, active: true },
  { id: 'RULE-03', hz: 'H3', name: 'Vector habitat (warm stagnant pools)', trigger: 'roadmap — OAH work package 2', active: false },
];

export default function RulesPage() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const run = () => { setBusy(true); window.setTimeout(() => { setResults(runSelfTests()); setBusy(false); }, 30); };
  const passed = results?.filter((r) => r.pass).length ?? 0;
  const cases = results?.reduce((n, r) => n + r.cases, 0) ?? 0;
  const ms = results?.reduce((n, r) => n + r.ms, 0) ?? 0;

  return (
    <>
      <PageHeader eyebrow="System · Hazard Rules" title={<>Hazard rules <span className="text-ink-3">matrix</span></>}
        sub={`Deterministic, versioned, pure TypeScript — v${RULES.version} (${RULES.sha}). No learned weights: every number a coordinator sees can be traced to a line here.`}
        actions={<button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run self-test suite</button>} />

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHead title="Active hazard rules" icon={Scale} />
          <div className="overflow-x-auto">
            <table className="tbl min-w-[720px]">
              <thead><tr><th>Rule</th><th>Hazard</th><th>Trigger T(d)</th><th>Opens · closes</th><th>Status</th></tr></thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/app/rules/${r.id}`} className="mono font-bold text-ink hover:text-plum">{r.id}</Link></td>
                    <td className="text-sm"><b>{r.hz}</b> · {r.name}</td>
                    <td className="mono text-xs text-ink-2">{r.trigger}</td>
                    <td className="mono text-xs">{r.active ? `≥ ${RULES.tiers.watchOpen} · < ${RULES.tiers.watchClose}` : '—'}</td>
                    <td><span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', r.active ? 'bg-[#D6EEE7] text-[#0F6A60]' : 'bg-sand text-ink-2')}>{r.active ? 'Active' : 'Roadmap'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-5 py-3 text-xs text-ink-3">Watch = 100 × T(d) × V(s). Signal = {RULES.fusion.community} × community evidence + {RULES.fusion.watch} × watch. Evaluated at {RULES.cycleHoursUtc.map((h) => `${String(h).padStart(2, '0')}:00`).join(' and ')} UTC over a {RULES.tiers.horizonDays}-day horizon.</p>
        </Card>

        <div className="space-y-5 xl:col-span-4">
          <Card>
            <CardHead title="Audit governance" icon={ShieldCheck} />
            <KV rows={[['Version', `v${RULES.version}`], ['Git SHA', RULES.sha], ['Rules file', RULES.file], ['Engine I/O', 'Pure functions · no network'], ['Learned weights', 'None'], ['Public output', 'Human sign-off required'], ['Changes', 'Two-person review → new version']]} />
          </Card>
          <Card>
            <CardHead title="Rules engine administration" />
            <ActionList items={[
              { key: 'r1', href: '/app/rules/RULE-01', title: 'Inspect RULE-01 and simulate', meta: 'H1 heat & low-flow formulation' },
              { key: 'r2', href: '/app/rules/RULE-02', title: 'Inspect RULE-02 and simulate', meta: 'H2 wet-weather formulation' },
              { key: 'dl', onClick: () => download(`watchdog-rules-v${RULES.version}.json`, JSON.stringify(RULES, null, 2)), title: 'Export rules in open JSON', meta: `${RULES.file} · ${RULES.sha}` },
            ]} />
          </Card>
        </div>

        <Card className="xl:col-span-12">
          <CardHead title="Test verification" icon={FlaskConical}
            sub={results ? `${passed}/${results.length} passing · ${cases.toLocaleString('en')} cases · ${Math.round(ms)} ms in this browser` : `${TEST_COUNT} deterministic and property-based tests run against the live engine, reducer, guardrails and FHIR builder`}
            action={results && <span className={cn('chip', passed === results.length ? '!bg-[#D6EEE7] !text-[#0F6A60]' : '!bg-[#F7DCE0] !text-[#A11C3A]')}>{passed === results.length ? 'All green' : `${results.length - passed} failing`}</span>} />
          {results ? (
            <ul className="divide-y divide-line/70">
              {results.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                  {r.pass ? <CircleCheck className="h-4 w-4 shrink-0 text-[#1F9483]" /> : <CircleX className="h-4 w-4 shrink-0 text-[#C8344F]" />}
                  <span className="mono w-10 text-xs text-ink-3">{r.id}</span>
                  <span className="w-20 text-xs font-bold text-ink-2">{r.group}</span>
                  <span className="min-w-[240px] flex-1 text-sm text-ink">{r.name}<span className={cn('block text-xs', r.pass ? 'text-ink-3' : 'text-[#A11C3A]')}>{r.detail}</span></span>
                  <span className="mono text-xs text-ink-3">{r.cases} cases · {r.ms.toFixed(1)} ms</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="max-w-lg text-sm text-ink-2">Checks score bounds on every site-day of the season, monotonicity of every trigger, order-independent fusion, device de-duplication, guardrails, FHIR validity, replay determinism, reducer purity and the golden path.</p>
              <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}Run {TEST_COUNT} tests</button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
