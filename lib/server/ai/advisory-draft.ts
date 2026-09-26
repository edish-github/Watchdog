import { createHash } from 'node:crypto';
import type { Domain, Site } from '../../types';
import { CITY, SITE } from '../../catalog';
import { signalObs } from '../../sim';
import { guardrails, whenText } from '../../advisory';
import { LlmError, activeProvider, defaultTimeoutMs, effortFor, llmJson, modelFor, type LlmDeps, type LlmUsage, type Provider } from './llm';

export const ADVISORY_PROMPT_VERSION = 'advisory-v2';
export type DraftLang = 'en' | 'pt';

/**
 * Everything the model sees. Built only from structured fields: no reporter text, names, device ids or photos, so
 * nothing a member of the public typed can reach the public wording (prompt-injection stance in the architecture doc).
 */
export interface DraftBrief {
  site: { code: string; stream: string; reach: string | null; city: string };
  hazard: 'H1' | 'H2';
  hazardName: Record<DraftLang, string>;
  signs: { code: string; label: Record<DraftLang, string>; count: number }[];
  dogReports: { total: number; rapidOnset: number };
  independentReporters: number;
  validUntil: string;
  validity: Record<DraftLang, string>;
  langs: DraftLang[];
}

const HAZARD: Record<'H1' | 'H2', Record<DraftLang, string>> = {
  H1: { en: 'heat and low water (algal mats)', pt: 'calor e água baixa (tapetes de algas)' },
  H2: { en: 'heavy rain and sewage overflow', pt: 'chuva forte e descargas de esgoto' },
};
const SIGN_LABELS: Record<string, [string, string]> = {
  dark_mats: ['dark mats on stones', 'tapetes escuros nas pedras'],
  floating_scum: ['floating mats or scum', 'tapetes ou espuma a flutuar'],
  blue_green: ['blue-green colour in the water', 'água de cor verde-azulada'],
  grey_milky: ['grey or milky water', 'água cinzenta ou leitosa'],
  sewage_odour: ['sewage smell', 'cheiro a esgoto'],
  foam: ['persistent foam', 'espuma persistente'],
  sanitary_litter: ['sanitary litter', 'lixo sanitário'],
  oily_sheen: ['oily sheen', 'película oleosa'],
  low_stagnant: ['very low or still water', 'água muito baixa ou parada'],
  dead_fish_1: ['one dead fish', 'um peixe morto'],
  dead_fish_2_10: ['several dead fish', 'vários peixes mortos'],
  dead_fish_gt10: ['many dead fish', 'muitos peixes mortos'],
  bird_sick: ['a sick or dead waterbird', 'uma ave aquática doente ou morta'],
  dead_amphibians: ['dead frogs or newts', 'anfíbios mortos'],
  invertebrate_dieoff: ['many dead water insects or snails', 'muitos invertebrados aquáticos mortos'],
  dog_unwell: ['a dog became unwell after contact with the water', 'um cão ficou doente após contacto com a água'],
};
const labelFor = (code: string): Record<DraftLang, string> => {
  const l = SIGN_LABELS[code];
  return l ? { en: l[0], pt: l[1] } : { en: code.replace(/_/g, ' '), pt: code.replace(/_/g, ' ') };
};
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Built from lib/advisory.whenText — the phrase the editor's "change validity" control rewrites. */
export const validityPhrases = (iso: string, site: Site): Record<DraftLang, string> => ({
  en: `until ${whenText(iso, site, 'en')}`,
  pt: `até ${whenText(iso, site, 'pt')}`,
});

export function buildBrief(d: Domain, signalId: string, opts: { langs: DraftLang[]; validUntil: string }): DraftBrief {
  const s = d.signals.find((x) => x.id === signalId);
  if (!s) throw new Error(`Signal ${signalId} not found`);
  const site = SITE[s.siteId];
  const loose = site as unknown as Record<string, unknown>;
  const city = ((CITY as unknown as Record<string, Record<string, unknown>>)[site.cityId] ?? {}) as Record<string, unknown>;
  const obs = signalObs(d, s);
  const counts = new Map<string, number>();
  for (const o of obs) for (const g of o.signs) counts.set(g, (counts.get(g) ?? 0) + 1);
  const dogs = obs.filter((o) => (o.signs as string[]).includes('dog_unwell'));
  return {
    site: { code: s.siteId, stream: str(loose.stream) ?? s.siteId, reach: str(loose.reach), city: str(city.name) ?? site.cityId },
    hazard: s.hazard as 'H1' | 'H2',
    hazardName: HAZARD[s.hazard as 'H1' | 'H2'],
    signs: [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([code, count]) => ({ code, label: labelFor(code), count })),
    dogReports: { total: dogs.length, rapidOnset: dogs.filter((o) => (o as unknown as { animal?: { onset?: string } }).animal?.onset === 'lt2h').length },
    independentReporters: new Set(obs.map((o) => o.deviceId)).size,
    validUntil: opts.validUntil,
    validity: validityPhrases(opts.validUntil, site),
    langs: opts.langs,
  };
}

export const CLOSING: Record<DraftLang, string> = {
  en: 'This is a precaution, not a test result.',
  pt: 'É uma precaução, não um resultado de análise.',
};

export const SYSTEM_PROMPT = `You write short public precaution notices for Watchdog, an early-warning service for urban streams in Europe.
A coordinator reviews, edits and approves every notice before anyone sees it.
