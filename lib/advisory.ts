import type { HazardId, Lang, SignCode, Site } from './types';
import { CITY, SIGNS } from './catalog';
import { HOUR, addH, fmtClock, uniq, weekdayLong } from './utils';

export const DRAFTER = 'template-v1';

export function defaultValidity(now: string, hours = 72) {
  return new Date(Math.ceil(Date.parse(addH(now, hours)) / HOUR) * HOUR).toISOString();
}

export function whenText(iso: string, site: Site, lang: Lang) {
  const tz = CITY[site.cityId].tz, hm = fmtClock(iso, tz);
  if (lang === 'pt') return `${weekdayLong(iso, tz, 'pt')} às ${hm}`;
  if (lang === 'nl') return `${weekdayLong(iso, tz, 'nl')} ${hm}`;
  return `${weekdayLong(iso, tz, 'en')} ${hm}`;
}

const join = (xs: string[], lang: Lang) => (xs.length <= 1 ? xs[0] ?? '' : `${xs.slice(0, -1).join(', ')}${lang === 'pt' ? ' e ' : ' and '}${xs[xs.length - 1]}`);

/** Bounded template draft. The backend batch swaps this for a Claude call behind the same schema + guardrails. */
export function draftText(site: Site, hazard: HazardId, validUntil: string, signs: SignCode[], langs: Lang[]) {
  const out: Partial<Record<Lang, string>> = {};
  for (const lang of langs) {
    const pt = lang === 'pt';
    const tags = uniq(signs.map((s) => (pt ? SIGNS[s].tagPt : SIGNS[s].tag))).slice(0, 3);
    const when = whenText(validUntil, site, lang), place = `${site.stream} (${site.id})`;
    const seen = tags.length ? (pt ? `Hoje foram comunicados ${join(tags, lang)}.` : `Today people reported ${join(tags, lang)}.`) : '';
    const lines = hazard === 'H1'
      ? pt
        ? [`Mantenha os cães fora da água em ${place} até ${when}.`, 'A água quente e baixa favorece tapetes de algas aqui.', seen, 'Evite tocar em tapetes nas pedras ou na margem.', 'É uma precaução, não um resultado de análise.']
        : [`Keep dogs out of the water at ${place} until ${when}.`, 'Warm, low water favours algal mats here.', seen, 'Avoid touching mats on stones or at the edge.', 'This is a precaution, not a test result.']
      : pt
        ? [`Evite o contacto com a água em ${place} até ${when}.`, 'A chuva forte pode levar esgoto para a ribeira.', seen, 'Mantenha os cães fora da água e lave as mãos após a visita.', 'É uma precaução, não um resultado de análise.']
        : [`Avoid water contact at ${place} until ${when}.`, 'Heavy rain can carry sewage into the stream.', seen, 'Keep dogs out of the water and wash hands after visits.', 'This is a precaution, not a test result.'];
    out[lang] = lines.filter(Boolean).join(' ');
  }
  return out;
}

// ── guardrails: real checks, run on every keystroke in the editor and again on publish ──
export interface Check { id: string; label: string; pass: boolean; detail: string; blocking: boolean }

const ALARM: Partial<Record<Lang, RegExp>> = {
  en: /\b(deadly|lethal|toxic|poison(?:ed|ous|ing)?|catastroph\w*|contaminat\w*|outbreak|panic|disaster)\b/i,
  pt: /\b(mortal|letal|t[óo]xic[oa]s?|envenenad\w*|catastr[óo]f\w*|contaminad\w*|surto|p[âa]nico)\b/i,
  nl: /\b(dodelijk|giftig|vergiftig\w*|besmet\w*|rampzalig)\b/i,
};
const DIAG: Partial<Record<Lang, RegExp>> = {
  en: /\b(diagnos\w*|infected|infection|poisoning|intoxicat\w*|disease)\b/i,
  pt: /\b(diagn[óo]stic\w*|infetad\w*|infe[çc][ãa]o|intoxica[çc][ãa]o|doen[çc]a)\b/i,
  nl: /\b(diagnose\w*|besmetting|vergiftiging|ziekte)\b/i,
};
const SAFE: Partial<Record<Lang, RegExp>> = { en: /\bsafe(ly|ty)?\b/i, pt: /\bsegur[oa]s?\b/i, nl: /\bveilig\b/i };
const PREC: Partial<Record<Lang, RegExp>> = { en: /precaution/i, pt: /precau[çc][ãa]o/i, nl: /voorzorg/i };

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function guardrails(text: Partial<Record<Lang, string>>, langs: Lang[], validUntil: string, site: Site): Check[] {
  const hm = fmtClock(validUntil, CITY[site.cityId].tz);
  const all = langs.map((l) => ({ l, t: (text[l] ?? '').trim() }));
  const hits = (m: Partial<Record<Lang, RegExp>>) => all.flatMap(({ l, t }) => { const r = m[l]; const x = r ? t.match(r) : null; return x ? [`${l.toUpperCase()}: “${x[0]}”`] : []; });
  const alarm = hits(ALARM), diag = hits(DIAG), safe = hits(SAFE);
  const missingWhen = all.filter(({ t }) => !t.includes(hm)).map(({ l }) => l.toUpperCase());
  const missingPrec = all.filter(({ l, t }) => PREC[l] && !PREC[l]!.test(t)).map(({ l }) => l.toUpperCase());
  const empty = all.filter(({ t }) => t.length < 20).map(({ l }) => l.toUpperCase());
  const long = all.flatMap(({ l, t }) => sentences(t).filter((s) => words(s) >= 20).map(() => l.toUpperCase()));
  const sc = all.flatMap(({ t }) => sentences(t)), avg = sc.length ? sc.reduce((a, s) => a + words(s), 0) / sc.length : 0;
  return [
    { id: 'langs', label: 'Every language filled', pass: !empty.length, detail: empty.length ? `Missing: ${empty.join(', ')}` : `${langs.map((l) => l.toUpperCase()).join(' + ')} present`, blocking: true },
    { id: 'tone', label: 'No alarmist words', pass: !alarm.length, detail: alarm.length ? alarm.join(', ') : 'Clean', blocking: true },
    { id: 'diagnosis', label: 'No diagnosis or clinical claims', pass: !diag.length, detail: diag.length ? diag.join(', ') : 'Clean', blocking: true },
    { id: 'safe', label: 'Never calls a site “safe”', pass: !safe.length, detail: safe.length ? safe.join(', ') : 'Clean', blocking: true },
    { id: 'validity', label: 'States the validity window', pass: !missingWhen.length, detail: missingWhen.length ? `No “${hm}” in ${missingWhen.join(', ')}` : `Valid until ${hm} in every language`, blocking: true },
    { id: 'precaution', label: 'Says it is a precaution', pass: !missingPrec.length, detail: missingPrec.length ? `Add a precaution line in ${missingPrec.join(', ')}` : 'Present', blocking: false },
    { id: 'length', label: 'Sentences under 20 words', pass: !long.length, detail: long.length ? `${long.length} long sentence(s)` : 'All short', blocking: false },
    { id: 'reading', label: 'Plain language (≈ CEFR B1)', pass: avg <= 15, detail: `${avg.toFixed(1)} words per sentence on average`, blocking: false },
  ];
}
export const canPublish = (checks: Check[]) => checks.every((c) => c.pass || !c.blocking);
