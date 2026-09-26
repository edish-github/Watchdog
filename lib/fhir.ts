import { FHIR_BASE } from './fhir-canonical';
import type { Advisory, City, FhirBundle, FhirEntry, FhirResource, HazardId, Observation, ScoreSnapshot, Site, Validation } from './types';
import { HAZARDS, SIGNS, SYMPTOMS } from './catalog';
import { RULES } from './engine';
import { sha256, uniq } from './utils';

export const CS_SIGN = `${FHIR_BASE}/CodeSystem/sentinel-sign`;
export const CS_WATCH = `${FHIR_BASE}/CodeSystem/watch-indicator`;
export const SID_SITE = `${FHIR_BASE}/sid/site/v2`;
export const DEFAULT_ENDPOINT = 'https://hapi.fhir.org/baseR4';

const uuid = (seed: string) => { const h = sha256(seed); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };

export interface BundleInput { id: string; site: Site; city: City; hazard: HazardId; observations: Observation[]; snap: ScoreSnapshot; advisory?: Advisory; actor: string; now: string }

/**
 * HL7 FHIR R4 transaction bundle: Location (conditional create), watch indicator, sentinel Observations, animal Patient,
 * and — once an advisory is live — a safety Flag and an alert Communication; Provenance ties it to its sources.
 */
export function buildBundle(x: BundleInput): FhirBundle {
  const entries: FhirEntry[] = [];
  const add = (resource: FhirResource, ifNoneExist?: string) => {
    const u = `urn:uuid:${uuid(`${x.id}|${entries.length}|${resource.resourceType}`)}`;
    const id = (resource as { identifier?: { system: string; value: string }[] }).identifier?.[0];
    const cond = ifNoneExist ?? (id ? `identifier=${id.system}|${id.value}` : undefined);
    entries.push({ fullUrl: u, resource, request: { method: 'POST', url: resource.resourceType, ...(cond ? { ifNoneExist: cond } : {}) } });
    return u;
  };
  const tag = { tag: [{ system: `${FHIR_BASE}/tags`, code: 'synthetic-demo', display: 'Synthetic demo data' }] };
  const sources: string[] = [];

  // Conditional create: re-sending a site's bundle reuses the existing Location instead of duplicating it.
  const loc = add({
    resourceType: 'Location', meta: tag, status: 'active', mode: 'instance',
    identifier: [{ system: SID_SITE, value: x.site.id }],
    name: `${x.site.id} ${x.site.stream}`, description: x.site.reach,
    physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'si', display: 'Site' }] },
    address: { city: x.city.name, country: x.city.cc }, position: { latitude: x.site.lat, longitude: x.site.lon },
  }, `identifier=${SID_SITE}|${x.site.id}`);

  const w = x.snap.watch;
  const watchUrl = add({
    resourceType: 'Observation', meta: tag, status: 'final',
    identifier: [{ system: `${CS_WATCH}/id`, value: `${x.id}|watch-score-${x.hazard.toLowerCase()}` }],
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
    sources.push(add({
      resourceType: 'Observation', meta: tag, status: 'preliminary',
      identifier: [{ system: `${CS_SIGN}/id`, value: `${x.id}|${s}` }],
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
      code: { coding: [{ system: CS_SIGN, code: s, display: SIGNS[s].en }] },
      subject: { reference: loc }, effectiveDateTime: first.createdAt, valueBoolean: true,
      note: [{ text: `Reported by ${x.observations.filter((o) => o.signs.includes(s)).length} pseudonymous reporter(s). Community observation, not a laboratory result.` }],
    }));
  }

  for (const o of x.observations.filter((o) => o.animal)) {
    const a = o.animal!;
    const pat = add({
      resourceType: 'Patient', meta: tag, active: true,
      identifier: a.name ? [{ system: `${SID_SITE}/patient`, value: `${x.site.id}|${a.name}` }] : undefined,
      extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/patient-animal', extension: [{ url: 'species', valueCodeableConcept: { coding: [{ system: 'http://snomed.info/sct', code: '448771007', display: 'Canis lupus subsp. familiaris (organism)' }] } }] }],
      name: a.name ? [{ text: a.name }] : undefined,
    }, a.name ? `identifier=${SID_SITE}/patient|${x.site.id}|${a.name}` : undefined);
    sources.push(add({
      resourceType: 'Observation', meta: tag, status: 'preliminary',
      identifier: [{ system: `${CS_SIGN}/id`, value: `${x.id}|dog_unwell` }],
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'survey' }] }],
      code: { coding: [{ system: CS_SIGN, code: 'dog_unwell', display: SIGNS.dog_unwell.en }] },
      subject: { reference: pat }, focus: [{ reference: loc }], effectiveDateTime: o.createdAt, valueBoolean: true,
      component: [
        { code: { text: 'Onset after water contact' }, valueString: a.onset === 'lt2h' ? 'Under 2 hours' : 'Over 2 hours' },
        ...a.symptoms.map((s) => ({ code: { text: 'Owner-observed sign' }, valueString: SYMPTOMS[s].en })),
      ],
      note: [{ text: 'Owner observation. Not a veterinary diagnosis.' }],
    }));
  }

  if (x.advisory && x.advisory.status === 'live') {
    const flag = add({
      resourceType: 'Flag', meta: tag, status: 'active',
      identifier: [{ system: `${SID_SITE}/flag`, value: `${x.id}|safety` }],
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/flag-category', code: 'safety', display: 'Safety' }] }],
      code: { text: `Precaution advisory: ${HAZARDS[x.hazard].long}` },
      subject: { reference: loc },
      period: { start: x.advisory.publishedAt ?? x.now, end: x.advisory.validUntil },
    });
    add({
      resourceType: 'Communication', meta: tag, status: 'completed',
      identifier: [{ system: `${SID_SITE}/advisory`, value: `${x.id}|advisory` }],
      category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/communication-category', code: 'alert', display: 'Alert' }], text: 'Public precaution advisory' }],
      about: [{ reference: flag }, { reference: loc }], sent: x.advisory.publishedAt,
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
    ...(sources.length ? { entity: sources.map((u) => ({ role: 'source', what: { reference: u } })) } : {}),
  }, `target=${watchUrl}`);

  return { resourceType: 'Bundle', id: x.id.toLowerCase(), type: 'transaction', timestamp: x.now, meta: tag, entry: entries };
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const OBS_STATUS = ['registered', 'preliminary', 'final', 'amended', 'corrected', 'cancelled', 'entered-in-error', 'unknown'];
const FLAG_STATUS = ['active', 'inactive', 'entered-in-error'];

/** Local structural R4 checks. The HL7 Java validator runs in CI (npm run fhir:validate). */
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
    if (e.request.ifNoneExist !== undefined) ok(/^[a-z-]+=.+/.test(e.request.ifNoneExist), `${p}: ifNoneExist must be a search query`);
    if (r.resourceType === 'Observation') {
      ok(OBS_STATUS.includes(String(r.status)), `${p}: status invalid`);
      const code = r.code as { coding?: unknown[] } | undefined;
      ok(!!code?.coding?.length, `${p}: code.coding required`);
      ok(typeof r.effectiveDateTime === 'string' && ISO.test(r.effectiveDateTime), `${p}: effectiveDateTime must be dateTime`);
    }
    if (r.resourceType === 'Location') ok(typeof r.name === 'string', `${p}: name required`);
    if (r.resourceType === 'Patient') ok(JSON.stringify(r.extension ?? '').includes('patient-animal'), `${p}: patient-animal extension required`);
    if (r.resourceType === 'Flag') {
      ok(FLAG_STATUS.includes(String(r.status)), `${p}: status invalid`);
      ok(!!(r.subject as { reference?: string } | undefined)?.reference, `${p}: subject required`);
      ok(!!(r.code as { text?: string } | undefined)?.text, `${p}: code required`);
    }
    if (r.resourceType === 'Communication') ok(typeof r.status === 'string', `${p}: status required`);
    if (r.resourceType === 'Provenance') { ok(Array.isArray(r.target) && (r.target as unknown[]).length > 0, `${p}: target required`); ok(Array.isArray(r.agent) && (r.agent as unknown[]).length > 0, `${p}: agent required`); }
    walk(r);
  });
  refs.forEach((ref) => ok(urls.has(ref), `Unresolved reference ${ref}`));
  if (!b.entry.some((e) => e.resource.resourceType === 'Communication')) warnings.push('No Communication: bundle sent before an advisory was approved');
  notes.push('Location uses conditional create on the site identifier, so re-sends do not duplicate sites.');
  notes.push('Sentinel sign codes use a proposed CodeSystem (extension to the OAH FHIR IG).');
  notes.push('Animal patient uses the R4 core extension patient-animal (SNOMED 448771007).');
  return { errors, warnings, notes, checked };
}
