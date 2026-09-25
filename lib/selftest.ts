import type { DayWeather, Habitat, Observation, SignCode } from './types';
import { CITY, HZ, SIGNS, SITE, SITES } from './catalog';
import { RULES, dailyWatch, fuse, ruleCheck, snapshot, trigger, vulnerability } from './engine';
import { canPublish, defaultValidity, draftText, guardrails } from './advisory';
import { buildBundle, validateBundle } from './fhir';
import { buildScenario, reduce } from './sim';
import { dayAdd, hash01, sha256 } from './utils';

export interface TestResult { id: string; group: string; name: string; pass: boolean; cases: number; ms: number; detail: string }

const NOW = '2026-09-25T13:00:00.000Z';
const CODES = Object.keys(SIGNS) as SignCode[];
const r = (seed: string, lo = 0, hi = 1) => lo + hash01(seed) * (hi - lo);
const wx = (p: Partial<DayWeather>): DayWeather => ({ date: '2026-09-25', tmax: 30, rain: 0, rain14: 5, rain72: 0, flowRatio: 0.3, discharge: 0.3, ...p });
let seq = 0;
const obs = (p: Partial<Observation> & { signs: SignCode[] }): Observation => { seq++; return { id: `OB-T${seq}`, siteId: 'COI-03', deviceId: `dev-${seq}`, role: 'walker', source: 'pwa', createdAt: NOW, status: 'pending', ...p }; };
const randSigns = (seed: string) => Array.from({ length: 1 + Math.floor(r(`${seed}n`) * 3) }, (_, k) => CODES[Math.floor(r(`${seed}${k}`) * CODES.length)]).filter((v, i, a) => a.indexOf(v) === i);
function ok(cond: boolean, msg: string): asserts cond { if (!cond) throw new Error(msg); }

const CASES: { id: string; group: string; name: string; run: () => { cases: number; detail: string } }[] = [
  { id: 'T01', group: 'Crypto', name: 'SHA-256 matches the NIST test vectors', run: () => {
    ok(sha256('') === 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'empty-string vector');
    ok(sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', '"abc" vector');
    return { cases: 2, detail: 'empty string · "abc"' };
  } },
  { id: 'T02', group: 'Engine', name: 'Watch score stays within 0–100 for every site, hazard and season day', run: () => {
    let n = 0;
    for (const s of SITES) for (const hz of HZ) for (let i = 0; i < 122; i++) { const x = dailyWatch(s, hz, dayAdd('2026-06-01', i)).score; ok(x >= 0 && x <= 100, `${s.id} ${hz} day ${i}: ${x}`); n++; }
    return { cases: n, detail: `${n} site-hazard-days` };
  } },
  { id: 'T03', group: 'Property', name: 'H1 trigger never falls as air temperature rises', run: () => {
    for (let i = 0; i < 300; i++) { const a = wx({ tmax: r(`t${i}`, 12, 40), rain14: r(`p${i}`, 0, 30), flowRatio: r(`f${i}`, 0.05, 1.5) }); const b = { ...a, tmax: a.tmax + r(`d${i}`, 0, 8) }; ok(trigger('H1', b).value >= trigger('H1', a).value - 1e-12, `case ${i}`); }
    return { cases: 300, detail: 'random weather pairs' };
  } },
  { id: 'T04', group: 'Property', name: 'H1 trigger never rises with more rain or more river flow', run: () => {
    for (let i = 0; i < 300; i++) { const a = wx({ tmax: r(`t${i}`, 12, 40), rain14: r(`p${i}`, 0, 30), flowRatio: r(`f${i}`, 0.05, 1.5) }); const b = { ...a, rain14: a.rain14 + r(`q${i}`, 0, 10), flowRatio: a.flowRatio + r(`g${i}`, 0, 0.3) }; ok(trigger('H1', b).value <= trigger('H1', a).value + 1e-12, `case ${i}`); }
    return { cases: 300, detail: 'random weather pairs' };
  } },
  { id: 'T05', group: 'Property', name: 'H2 trigger never falls as rain rises', run: () => {
    for (let i = 0; i < 300; i++) { const a = wx({ rain: r(`r${i}`, 0, 40), rain72: r(`s${i}`, 0, 60) }); const b = { ...a, rain: a.rain + r(`u${i}`, 0, 10), rain72: a.rain72 + r(`v${i}`, 0, 15) }; ok(trigger('H2', b).value >= trigger('H2', a).value - 1e-12, `case ${i}`); }
    return { cases: 300, detail: 'random rainfall pairs' };
  } },
  { id: 'T06', group: 'Property', name: 'More shade never raises H1 vulnerability; more sealing never lowers H2', run: () => {
    for (let i = 0; i < 300; i++) {
      const h: Habitat = { shadeCover: r(`a${i}`), channelModification: r(`b${i}`), soilSealing: r(`c${i}`) };
      const s = { ...SITE['COI-03'], habitat: h };
      ok(vulnerability({ ...s, habitat: { ...h, shadeCover: Math.min(1, h.shadeCover + r(`d${i}`, 0, 0.5)) } }, 'H1').value <= vulnerability(s, 'H1').value + 1e-12, `shade case ${i}`);
      ok(vulnerability({ ...s, habitat: { ...h, soilSealing: Math.min(1, h.soilSealing + r(`e${i}`, 0, 0.5)) } }, 'H2').value >= vulnerability(s, 'H2').value - 1e-12, `sealing case ${i}`);
    }
    return { cases: 600, detail: 'random habitat pairs' };
  } },
  { id: 'T07', group: 'Fusion', name: 'Fusion does not depend on the order reports arrive in', run: () => {
    for (let i = 0; i < 100; i++) {
      const list = Array.from({ length: 2 + Math.floor(r(`n${i}`) * 4) }, (_, k) => obs({ signs: randSigns(`o${i}-${k}`), role: r(`r${i}${k}`) > 0.7 ? 'citizen_scientist' : 'walker' }));
      const shuffled = [...list].sort((x, y) => hash01(`${i}${x.id}`) - hash01(`${i}${y.id}`));
      ok(Math.abs(fuse(list).value - fuse(shuffled).value) < 0.0015, `case ${i}`);
    }
    return { cases: 100, detail: 'random report sets, shuffled' };
  } },
  { id: 'T08', group: 'Fusion', name: 'Several reports from one device count as one reporter', run: () => {
    const f = fuse([obs({ signs: ['dark_mats'], deviceId: 'same' }), obs({ signs: ['floating_scum'], deviceId: 'same' }), obs({ signs: ['foam'] })]);
    ok(f.reporters === 2, `expected 2 reporters, got ${f.reporters}`);
    return { cases: 1, detail: '3 reports · 2 devices → 2 reporters' };
  } },
  { id: 'T09', group: 'Fusion', name: 'Evidence ≤ 1, synergy = 0.075 × (categories − 1), weight capped at 0.6', run: () => {
    for (let i = 0; i < 150; i++) {
      const f = fuse(Array.from({ length: 1 + Math.floor(r(`m${i}`) * 5) }, (_, k) => obs({ signs: randSigns(`s${i}-${k}`), verified: r(`v${i}${k}`) > 0.8 })));
      ok(f.value <= 1 + 1e-9, `value ${f.value}`);
      ok(Math.abs(f.synergy - RULES.fusion.synergy * Math.max(0, f.categories.length - 1)) < 0.001, `synergy ${f.synergy}`);
      f.items.forEach((it) => ok(it.weight <= RULES.fusion.cap + 1e-9, `weight ${it.weight}`));
    }
    return { cases: 150, detail: 'random report sets' };
  } },
  { id: 'T10', group: 'Rules', name: 'Signal rule: 2 reporters or an acute animal opens; one weak report outside a Watch does not', run: () => {
    ok(!ruleCheck(fuse([obs({ signs: ['foam'] })]), false).met, 'single weak report opened a signal');
    ok(ruleCheck(fuse([obs({ signs: ['foam'] }), obs({ signs: ['foam'] })]), false).met, 'two reporters did not open');
    ok(ruleCheck(fuse([obs({ signs: ['dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' } })]), false).met, 'acute dog did not open');
    return { cases: 3, detail: 'weak · two reporters · acute animal' };
  } },
  { id: 'T11', group: 'Rules', name: 'Watch thresholds have hysteresis and the advisory gate sits above them', run: () => {
    ok(RULES.tiers.watchOpen > RULES.tiers.watchClose, 'open must exceed close');
    ok(RULES.tiers.advisoryGate > RULES.tiers.watchOpen, 'gate must exceed open');
    ok(Math.abs(RULES.fusion.community + RULES.fusion.watch - 1) < 1e-9, 'fusion weights must sum to 1');
    return { cases: 3, detail: `${RULES.tiers.watchClose} < ${RULES.tiers.watchOpen} < ${RULES.tiers.advisoryGate}` };
  } },
  { id: 'T12', group: 'Guardrails', name: 'Every template draft passes the blocking guardrails (EN + PT, all sites, both hazards)', run: () => {
    let n = 0;
    for (const s of SITES) for (const hz of HZ) { const until = defaultValidity(NOW, 72); const text = draftText(s, hz, until, ['dark_mats', 'dead_fish_2_10'], ['en', 'pt']); ok(canPublish(guardrails(text, ['en', 'pt'], until, s)), `${s.id} ${hz}`); n++; }
    return { cases: n, detail: `${n} drafts` };
  } },
  { id: 'T13', group: 'Guardrails', name: 'Guardrails block “toxic”, “safe”, diagnoses and a missing expiry', run: () => {
    const s = SITE['COI-03'], until = defaultValidity(NOW, 72);
    const bad = ['The water is toxic. Keep dogs out. This is a precaution.', 'The stream is safe again. This is a precaution.', 'Dogs here have cyanobacteria poisoning. This is a precaution.', 'Keep dogs out of the water. This is a precaution.'];
    bad.forEach((t, i) => ok(!canPublish(guardrails({ en: t }, ['en'], until, s)), `bad text ${i + 1} passed`));
    return { cases: bad.length, detail: 'alarm · safe · diagnosis · no expiry' };
  } },
  { id: 'T14', group: 'FHIR', name: 'One Health bundle validates with 0 errors and every reference resolves', run: () => {
    const site = SITE['COI-03'];
    const o = [obs({ signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', name: 'Test', symptoms: ['drooling'], onset: 'lt2h' } }), obs({ signs: ['floating_scum'] })];
    const b = buildBundle({ id: 'FHIR-TEST', site, city: CITY[site.cityId], hazard: 'H1', observations: o, snap: snapshot(site, 'H1', o, NOW, true), actor: 'Self-test', now: NOW });
    const v = validateBundle(b);
    ok(v.errors.length === 0, v.errors.join('; '));
    ok(b.entry.some((e) => e.resource.resourceType === 'Patient'), 'no animal patient');
    return { cases: v.checked, detail: `${b.entry.length} resources · ${v.checked} checks` };
  } },
  { id: 'T15', group: 'Replay', name: 'Scenario replay is deterministic', run: () => {
    const a = sha256(JSON.stringify(buildScenario('day2'))), b = sha256(JSON.stringify(buildScenario('day2')));
    ok(a === b, 'two builds differ');
    return { cases: 2, detail: `state hash ${a.slice(0, 12)}…` };
  } },
  { id: 'T16', group: 'Replay', name: 'The reducer never mutates its input state', run: () => {
    const d = buildScenario('day2'), before = sha256(JSON.stringify(d));
    reduce(d, { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'dev-x', role: 'walker', signs: ['dark_mats'], source: 'pwa' } });
    ok(sha256(JSON.stringify(d)) === before, 'input state changed');
    return { cases: 1, detail: 'hash before = hash after' };
  } },
  { id: 'T17', group: 'Replay', name: 'Golden path resolves COI-03 after two independent clear checks', run: () => {
    const d = buildScenario('day4');
    const a = d.advisories.find((x) => x.siteId === 'COI-03' && x.publishedAt);
    ok(!!a, 'no published advisory at COI-03');
    ok(a.status === 'resolved', `advisory is ${a.status}`);
    ok(new Set(a.clearChecks.map((c) => c.by)).size === 2, 'clear checks not independent');
    return { cases: 1, detail: `${a.id} resolved by ${a.clearChecks.map((c) => c.by).join(' + ')}` };
  } },
];

export const TEST_COUNT = CASES.length;
export function runSelfTests(): TestResult[] {
  return CASES.map((c) => {
    const t0 = performance.now();
    try { const res = c.run(); return { id: c.id, group: c.group, name: c.name, pass: true, cases: res.cases, ms: performance.now() - t0, detail: res.detail }; }
    catch (e) { return { id: c.id, group: c.group, name: c.name, pass: false, cases: 0, ms: performance.now() - t0, detail: e instanceof Error ? e.message : String(e) }; }
  });
}
