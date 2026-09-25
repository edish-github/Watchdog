import type { Advisory, City, FhirBundle, FhirEntry, FhirResource, HazardId, Observation, ScoreSnapshot, Site, Validation } from './types';
import { HAZARDS, SIGNS, SYMPTOMS } from './catalog';
import { RULES } from './engine';
import { sha256, uniq } from './utils';

export const CS_SIGN = 'http://example.org/fhir/watchdog/CodeSystem/sentinel-sign';
export const CS_WATCH = 'http://example.org/fhir/watchdog/CodeSystem/watch-indicator';
export const DEFAULT_ENDPOINT = 'https://hapi.fhir.org/baseR4';

const uuid = (seed: string) => { const h = sha256(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

export interface BundleInput { id: string; site: Site; city: City; hazard: HazardId; observations: Observation[]; snap: ScoreSnapshot; advisory?: Advisory; actor: string; now: string }

/** HL7 FHIR R4 transaction bundle: Location, sentinel Observations, watch indicator, animal Patient, Communication, Provenance. */
export function buildBundle(x: BundleInput): FhirBundle {
  const entries: FhirEntry[] = [];
  const add = (resource: FhirResource) => { const u = `urn:uuid:${uuid(`${x.id}|${entries.length}|${resource.resourceType}`)}`; entries.push({ fullUrl: u, resource, request: { method: 'POST', url: resource.resourceType } }); return u; };
  const tag = { tag: [{ system: 'http://example.org/fhir/watchdog/tags', code: 'synthetic-demo', display: 'Synthetic demo data' }] };

  const loc = add({
    resourceType: 'Location', meta: tag, status: 'active', mode: 'instance',
    identifier: [{ system: 'http://example.org/fhir/watchdog/sid/site', value: x.site.id }],
    name: `${x.site.id} ${x.site.stream}`, description: x.site.reach,
    physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'si', display: 'Site' }] },
    address: { city: x.city.name, country: x.city.cc }, position: { latitude: x.site.lat, longitude: x.site.lon },
  });

  const w = x.snap.watch;
  add({
    resourceType: 'Observation', meta: tag, status: 'final',
    category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
    code: { coding: [{ system: CS_WATCH, code: `watch-score-${x.hazard.toLowerCase()}`, display: `Watch score — ${HAZARDS[x.hazard].long}` }] },
    subject: { reference: loc }, effectiveDateTime: x.now,
    valueQuantity: { value: w.score, unit: 'score', system: 'http://unitsofmeasure.org', code: '{score}' },
    component: [
      { code: { text: 'Daily maximum air temperature' }, valueQuantity: { value: w.weather.tmax, unit: '°C', system: 'http://unitsofmeasure.org', code: 'Cel' } },
      { code: { text: '14-day precipitation' }, valueQuantity: { value: w.weather.rain14, unit: 'mm', system: 'http://unitsofmeasure.org', code: 'mm' } },
      { code: { text: 'Flow ratio to seasonal normal' }, valueQuantity: { value: w.weather.flowRatio, unit: 'ratio', system: 'http://unitsofmeasure.org', code: '1' } },
      { code: { text: 'Site vulnerability V(s) from OAH habitat answers' }, valueQuantity: { value: w.vulnerability, unit: 'index', system: 'http://unitsofmeasure.org', code: '1' } },
    ],
    note: [{ text: `Rules ${RULES.version} (${RULES.sha}). Forecast indicator, not a measurement of toxins.` }],
  });

  const signs = uniq(x.observations.flatMap((o) => o.signs)).filter((s) => s !== 'dog_unwell');
  for (const s of signs) {
    const first = x.observations.filter((o) => o.signs.includes(s)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    add({
      resourceType: 'Observation', meta: tag, status: 'preliminary',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
      code: { coding: [{ system: CS_SIGN, code: s, display: SIGNS[s].en }] },
      subject: { reference: loc }, effectiveDateTime: first.createdAt, valueBoolean: true,
      note: [{ text: `Reported by ${x.observations.filter((o) => o.signs.includes(s)).length} pseudonymous reporter(s). Community observation, not a laboratory result.` }],
    });
  }

  for (const o of x.observations.filter((o) => o.animal)) {
    const a = o.animal!;
    const pat = add({
      resourceType: 'Patient', meta: tag, active: true,
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/patient-animal', extension: [{ url: 'species', valueCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '448771007', display: 'Canis lupus subsp. familiaris (organism)' }] } }] }],
      name: a.name ? [{ text: a.name }] : undefined,
    });
    add({
      resourceType: 'Observation', meta: tag, status: 'preliminary',
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
      code: { coding: [{ system: CS_SIGN, code: 'dog_unwell', display: SIGNS.dog_unwell.en }] },
      subject: { reference: pat }, focus: [{ reference: loc }], effectiveDateTime: o.createdAt, valueBoolean: true,
      component: [
        { code: { text: 'Onset after water contact' }, valueString: a.onset === 'lt2h' ? 'Under 2 hours' : 'Over 2 hours' },
        ...a.symptoms.map((s) => ({ code: { text: 'Owner-observed sign' }, valueString: SYMPTOMS[s].en })),
      ],
      note: [{ text: 'Owner observation. Not a veterinary diagnosis.' }],
    });
  }

  if (x.advisory && x.advisory.status === 'live') {
    add({
      resourceType: 'Communication', meta: tag, status: 'completed',
      category: [{ text: 'Public precaution advisory' }], about: [{ reference: loc }], sent: x.advisory.publishedAt,
      payload: x.advisory.langs.map((l) => ({ contentString: `[${l}] ${x.advisory!.text[l] ?? ''}` })),
      note: [{ text: `Approved by ${x.advisory.approvedBy}. Valid until ${x.advisory.validUntil}. Audit ${x.advisory.auditHash?.slice(0, 16)}.` }],
    });
  }

  add({
    resourceType: 'Provenance', meta: tag, target: entries.map((e) => ({ reference: e.fullUrl })), recorded: x.now,
    policy: [`urn:watchdog:rules:${RULES.version}:${RULES.sha}`],
    activity: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-DataOperation', code: 'CREATE', display: 'create' }] },
    agent: [
      { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'verifier', display: 'Verifier' }] }, who: { display: x.actor } },
      { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'assembler', display: 'Assembler' }] }, who: { display: `Watchdog rules engine ${RULES.version} (${RULES.sha})` } },
    ],
  });

  return { resourceType: 'Bundle', id: x.id.toLowerCase(), type: 'transaction', timestamp: x.now, meta: tag, entry: entries };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const OBS_STATUS = ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'];

/** Local structural R4 checks. The HL7 Java validator runs in CI in the backend batch. */
export function validateBundle(b: FhirBundle): Validation {
  const errors: string[] = [], warnings: string[] = [], notes: string[] = [];
  let checked = 0;
  const ok = (cond: boolean, msg: string) => { checked++; if (!cond) errors.push(msg); };
  ok(b.resourceType === 'Bundle' && b.type === 'transaction', 'Bundle.type must be transaction');
  ok(ISO.test(b.timestamp), 'Bundle.timestamp must be an instant');
  const urls = new Set(b.entry.map((e) => e.fullUrl));
  const refs: string[] = [];
  const walk = (v: unknown) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'reference' && typeof x === 'string') refs.push(x); else walk(x); } };
  b.entry.forEach((e, i) => {
    const r = e.resource, p = `entry[${i}] ${r.resourceType}`;
    ok(/^urn:uuid:[0-9a-f-]{36}$/.test(e.fullUrl), `${p}: fullUrl must be urn:uuid`);
    ok(e.request.method === 'POST' && e.request.url === r.resourceType, `${p}: request must POST to ${r.resourceType}`);
    if (r.resourceType === 'Observation') {
      ok(OBS_STATUS.includes(String(r.status)), `${p}: status invalid`);
      const code = r.code as { coding?: unknown[] } | undefined;
      ok(!!code?.coding?.length, `${p}: code.coding required`);
      ok(typeof r.effectiveDateTime === 'string' && ISO.test(r.effectiveDateTime), `${p}: effectiveDateTime must be dateTime`);
    }
    if (r.resourceType === 'Location') ok(typeof r.name === 'string', `${p}: name required`);
    if (r.resourceType === 'Patient') ok(JSON.stringify(r.extension ?? '').includes('patient-animal'), `${p}: patient-animal extension required`);
    if (r.resourceType === 'Communication') ok(typeof r.status === 'string', `${p}: status required`);
    if (r.resourceType === 'Provenance') { ok(Array.isArray(r.target) && (r.target as unknown[]).length > 0, `${p}: target required`); ok(Array.isArray(r.agent) && (r.agent as unknown[]).length > 0, `${p}: agent required`); }
    walk(r);
  });
  refs.forEach((ref) => ok(urls.has(ref), `Unresolved reference ${ref}`));
  if (!b.entry.some((e) => e.resource.resourceType === 'Communication')) warnings.push('No Communication: bundle sent before an advisory was approved');
  notes.push('Sentinel sign codes use a proposed CodeSystem (extension to the OAH FHIR IG).');
  notes.push('Animal patient uses the R4 core extension patient-animal (SNOMED 448771007).');
  return { errors, warnings, notes, checked };
}
