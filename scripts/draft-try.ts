/**
 * npm run draft:try — real EN/PT drafts for every active signal in the Day-2 scenario after Ana's report, with the
 * provider and model the API reports. Languages follow the app's rule: English, plus Portuguese for Portuguese cities.
 * Reads ANTHROPIC_API_KEY / GEMINI_API_KEY / LLM_* from the environment or .env.local.
 */
import { existsSync, readFileSync } from 'node:fs';
import { CITY, SITE } from '../lib/catalog';
import { ACTIVE, buildScenario, reduce, type Action } from '../lib/sim';
import { syntheticWeather, withWeather } from '../lib/weather';
import { defaultValidity } from '../lib/advisory';
import { buildBrief, draftAdvisory, type DraftLang } from '../lib/server/ai/advisory-draft';
import { activeProvider, modelFor } from '../lib/server/ai/llm';

for (const file of ['.env.local', '.env']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

async function main() {
  const ana: Action = { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-8f92', displayName: 'Ana', role: 'walker', signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' }, source: 'pwa' } };
  const d = withWeather(syntheticWeather, () => reduce(buildScenario('day2'), ana));
  const signals = d.signals.filter((s) => ACTIVE.includes(s.status));
  const provider = activeProvider();
  console.log(`provider ${provider ?? 'none (template only)'} · configured model ${provider ? modelFor(provider) : '—'} · ${signals.length} active signal(s) · scenario clock ${d.now}\n`);
  for (const s of signals) {
    const site = SITE[s.siteId];
    const langs: DraftLang[] = CITY[site.cityId].lang === 'pt' ? ['en', 'pt'] : ['en'];
    const brief = buildBrief(d, s.id, { langs, validUntil: defaultValidity(d.now, 72) });
    const r = await draftAdvisory(brief);
    console.log(`── ${s.id} · ${s.siteId} · ${s.hazard} · ${brief.site.stream}, ${brief.site.city} · ${langs.join('/').toUpperCase()}`);
    console.log(`   signs: ${brief.signs.map((x) => `${x.code}×${x.count}`).join(', ') || '—'} · dogs ${brief.dogReports.total} (${brief.dogReports.rapidOnset} rapid)`);
    if (r.ok) {
      console.log(`   ✓ ${r.provider} reported model ${r.model} · ${r.latencyMs} ms · ${r.attempts} attempt(s) · ${r.usage.input_tokens ?? '?'} in / ${r.usage.output_tokens ?? '?'} out tokens${r.warnings.length ? ` · warnings: ${r.warnings.join('; ')}` : ''}`);
      for (const l of langs) console.log(`   ${l.toUpperCase()}: ${r.text[l]}`);
      console.log('');
    } else {
      console.log(`   ✗ ${r.reason} after ${r.attempts} attempt(s), ${r.latencyMs} ms: ${r.detail}\n`);
      if (r.reason !== 'no_key') process.exitCode = 1;
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
