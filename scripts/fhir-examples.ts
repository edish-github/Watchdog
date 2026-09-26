/** npm run fhir:examples — writes every distinct bundle the scenario produces (and a fresh golden-path one) to fhir/examples/. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { BundleRecord } from '../lib/types';
import { ACTIVE, PRESETS, buildScenario, reduce, type Action } from '../lib/sim';
import { syntheticWeather, withWeather } from '../lib/weather';

const out = 'fhir/examples';
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const seen = new Set<string>();
let n = 0;
const keep = (label: string, bundles: BundleRecord[]) => {
  for (const b of bundles) {
    if (seen.has(b.hash)) continue;
    seen.add(b.hash);
    writeFileSync(`${out}/${label}-${b.id.toLowerCase()}.json`, JSON.stringify(b.bundle, null, 2) + '\n');
    n++;
  }
};
for (const p of PRESETS) keep(p.id, withWeather(syntheticWeather, () => buildScenario(p.id)).bundles);

const ana: Action = { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-8f92', displayName: 'Ana', role: 'walker', signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' }, source: 'pwa' } };
const golden = withWeather(syntheticWeather, () => {
  let d = reduce(buildScenario('day2'), ana);
  const sig = d.signals.find((s) => s.siteId === 'COI-03' && ACTIVE.includes(s.status));
  if (!sig) return d;
  d = reduce(d, { type: 'advisory/draft', signalId: sig.id, actor: 'Sofia Silva' });
  if (d.lastCreated) d = reduce(d, { type: 'advisory/publish', id: d.lastCreated, actor: 'Sofia Silva', escalate: true });
  return d;
});
keep('golden', golden.bundles);
console.log(`${n} example bundle(s) written to ${out}/`);
