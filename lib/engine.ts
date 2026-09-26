import RULES_V1 from '../rules/v1.0.0.json';
import type { EvidenceBreakdown, EvidenceItem, HazardId, Observation, ScoreSnapshot, SeriesPoint, Site, SignCategory, WatchBreakdown, DayWeather } from './types';
import { CITY, SIGNS } from './catalog';
import { dayWeather, getWeatherVersion } from './weather';
import { addH, clamp, dayAdd, lerp, localDate, localHours, round, uniq, zonedToUtc } from './utils';

/** Deterministic, versioned rules. Everything the Why drawer shows comes from here. */
/** Deterministic, versioned rules. Loaded from rules/v1.0.0.json; every decision records RULES.version and RULES.sha. */
export const RULES = RULES_V1;

export function trigger(hz: HazardId, w: DayWeather) {
  if (hz === 'H1') {
    const r = RULES.h1;
    const parts = { heat: clamp((w.tmax - r.tBase) / r.tSpan), dry: clamp((r.rainRef - w.rain14) / r.rainRef), flow: clamp((r.flowRef - w.flowRatio) / r.flowSpan) };
    return { value: r.w.heat * parts.heat + r.w.dry * parts.dry + r.w.flow * parts.flow, parts };
  }
  const r = RULES.h2;
  const parts = { storm: clamp((w.rain - r.rainBase) / r.rainSpan), burst: clamp((w.rain72 - r.r72Base) / r.r72Span) };
  return { value: r.w.storm * parts.storm + r.w.burst * parts.burst, parts };
}

export function vulnerability(site: Site, hz: HazardId) {
  const h = site.habitat;
  if (hz === 'H1') {
    const w = RULES.vuln.H1, parts = { shadeDeficit: 1 - h.shadeCover, channel: h.channelModification, sealing: h.soilSealing };
    return { value: w.shadeDeficit * parts.shadeDeficit + w.channel * parts.channel + w.sealing * parts.sealing, parts };
  }
  const w = RULES.vuln.H2, parts = { sealing: h.soilSealing, channel: h.channelModification };
  return { value: w.sealing * parts.sealing + w.channel * parts.channel, parts };
}

const memo = new Map<string, WatchBreakdown>();
export function dailyWatch(site: Site, hz: HazardId, date: string): WatchBreakdown {
  const h = site.habitat;
  const key = `${getWeatherVersion()}|${site.id}|${hz}|${date}|${h.shadeCover}|${h.channelModification}|${h.soilSealing}`;
  const hit = memo.get(key);
  if (hit) return hit;
  const weather = dayWeather(site, date), t = trigger(hz, weather), v = vulnerability(site, hz);
  const out: WatchBreakdown = {
    hazard: hz, date, weather, trigger: round(t.value, 3), parts: mapRound(t.parts), vulnerability: round(v.value, 3),
    vulnParts: mapRound(v.parts), score: Math.round(100 * t.value * v.value),
  };
  if (memo.size > 20000) memo.clear();
  memo.set(key, out);
  return out;
}
const mapRound = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, round(x, 3)]));

export const tzOf = (site: Site) => CITY[site.cityId].tz;
export const watchToday = (site: Site, hz: HazardId, now: string) => dailyWatch(site, hz, localDate(now, tzOf(site)));

/** Scores for today and the following days (default: the 72-hour horizon, i.e. today + 2). */
export function horizon(site: Site, hz: HazardId, now: string, days: number = RULES.tiers.horizonDays) {
  const today = localDate(now, tzOf(site));
  return Array.from({ length: days }, (_, i) => dailyWatch(site, hz, dayAdd(today, i)));
}

/** Expected end of a Watch: midnight after the last consecutive day ≥ close threshold (looks 5 days ahead). */
export function expectedEnd(site: Site, hz: HazardId, now: string): string {
  const days = horizon(site, hz, now, 5);
  let last = -1;
  for (let i = 0; i < days.length; i++) { if (days[i].score >= RULES.tiers.watchClose) last = i; else if (last >= 0) break; }
  const d = days[Math.max(0, last)].date;
  return zonedToUtc(dayAdd(d, 1), 0, 0, tzOf(site));
}

/** Smoothed 3-hourly series with an uncertainty ribbon that widens with lead time. */
export function forecastSeries(site: Site, hz: HazardId, now: string, pastH = 24, aheadH = 72, step = 3): SeriesPoint[] {
  const tz = tzOf(site), out: SeriesPoint[] = [];
  for (let h = -pastH; h <= aheadH; h += step) {
    const t = addH(now, h), d = localDate(t, tz), hr = localHours(t, tz);
    const a = hr >= 12 ? d : dayAdd(d, -1), frac = hr >= 12 ? (hr - 12) / 24 : (hr + 12) / 24;
    const score = lerp(dailyWatch(site, hz, a).score, dailyWatch(site, hz, dayAdd(a, 1)).score, frac);
    const spread = h <= 0 ? 0 : 2.5 + h * 0.16;
    out.push({ t, h, score: round(score, 1), lo: round(Math.max(0, score - spread), 1), hi: round(Math.min(100, score + spread * 0.85), 1) });
  }
  return out;
}

// ── community evidence ──
export function obsWeight(o: Observation) {
  let keep = 1;
  const cats: SignCategory[] = [];
  for (const s of o.signs) {
    const def = SIGNS[s];
    const w = s === 'dog_unwell' ? (o.animal?.onset === 'lt2h' ? RULES.fusion.dogAcute : RULES.fusion.dogLate) : def.w;
    keep *= 1 - w;
    if (def.cat !== 'people') cats.push(def.cat);
  }
  const mult = o.verified ? RULES.roles.verified : RULES.roles[o.role];
  return { weight: round(Math.min(RULES.fusion.cap, (1 - keep) * mult), 3), categories: uniq(cats), acute: o.signs.includes('dog_unwell') && o.animal?.onset === 'lt2h' };
}

export function hazardFor(o: Observation, preferred?: HazardId): HazardId | null {
  let a = 0, b = 0;
  for (const s of o.signs) { const d = SIGNS[s]; if (d.hz.includes('H1')) a += d.w; if (d.hz.includes('H2')) b += d.w; }
  if (!a && !b) return null;
  if (Math.abs(a - b) < 1e-9) return preferred ?? 'H1';
  return a > b ? 'H1' : 'H2';
}

export function fuse(obs: Observation[]): EvidenceBreakdown {
  const by = new Map<string, EvidenceItem>();
  for (const o of obs) {
    const w = obsWeight(o);
    const item: EvidenceItem = { obsId: o.id, deviceId: o.deviceId, label: o.displayName ?? o.deviceId, role: o.role, verified: !!o.verified, weight: w.weight, categories: w.categories, signs: o.signs, acute: w.acute };
    const prev = by.get(o.deviceId);
    if (!prev) { by.set(o.deviceId, item); continue; }
    const best = w.weight > prev.weight ? item : prev;
    by.set(o.deviceId, { ...best, categories: uniq([...prev.categories, ...w.categories]), signs: uniq([...prev.signs, ...o.signs]), acute: prev.acute || w.acute });
  }
  const items = Array.from(by.values());
  const base = 1 - items.reduce((k, i) => k * (1 - i.weight), 1);
  const categories = uniq(items.flatMap((i) => i.categories));
  const synergy = RULES.fusion.synergy * Math.max(0, categories.length - 1);
  return { items, base: round(base, 3), synergy: round(synergy, 3), value: round(clamp(base + synergy), 3), categories, reporters: items.length };
}

export function ruleCheck(ev: EvidenceBreakdown, watchActive: boolean) {
  if (ev.reporters >= 2) return { met: true, reason: `${ev.reporters} independent reporters` };
  if (ev.items.some((i) => i.acute)) return { met: true, reason: 'Acute animal report (onset under 2 h)' };
  if (watchActive && ev.items.some((i) => i.weight >= RULES.fusion.strong)) return { met: true, reason: 'Strong report during an active Watch' };
  return { met: false, reason: watchActive ? 'Waiting for a second reporter or a stronger report' : 'Single report outside a Watch — waiting for corroboration' };
}

export function snapshot(site: Site, hz: HazardId, obs: Observation[], now: string, watchActive: boolean): ScoreSnapshot {
  const watch = watchToday(site, hz, now), evidence = fuse(obs);
  const score = Math.round(100 * RULES.fusion.community * evidence.value + RULES.fusion.watch * watch.score);
  return { at: now, ruleVersion: RULES.version, ruleSha: RULES.sha, watch, watchActive, evidence, score, gate: score >= RULES.tiers.advisoryGate, rule: ruleCheck(evidence, watchActive) };
}
