import type { Habitat, HazardId, Site } from './types';
import { CITY, HZ } from './catalog';
import { RULES, dailyWatch } from './engine';
import { dayAdd, daysBetween } from './utils';

export const SEASONS = [{ id: 'summer-2026', label: 'Summer 2026', from: '2026-06-01', to: '2026-09-30' }] as const;
export type Season = (typeof SEASONS)[number];
export const seasonById = (id: string): Season | undefined => SEASONS.find((s) => s.id === id);
export const seasonUntil = (s: Season, today: string) => (today < s.to ? today : s.to);

export const FACTOR_LABEL: Record<string, string> = { shadeDeficit: 'Missing shade', channel: 'Channel modification', sealing: 'Soil sealing' };

export interface HazardLedger { hazard: HazardId; watchDays: number; peak: number; peakDate: string; mean: number; attr: Record<string, number>; daily: { date: string; score: number }[] }
export interface SiteLedger { site: Site; days: number; watchDays: number; byHazard: Record<HazardId, HazardLedger>; attr: Record<string, number>; drivers: { key: string; label: string; share: number }[] }

/** Walks every day of the season. Each Watch day's score is attributed to the site's habitat factors in proportion to weight × factor / V(s). */
export function hazardLedger(site: Site, hz: HazardId, from: string, to: string): HazardLedger {
  const n = Math.max(0, daysBetween(from, to) + 1);
  const weights = RULES.vuln[hz] as Record<string, number>;
  const daily: { date: string; score: number }[] = [];
  const attr: Record<string, number> = {};
  let watchDays = 0, peak = 0, peakDate = from, sum = 0;
  for (let i = 0; i < n; i++) {
    const date = dayAdd(from, i), w = dailyWatch(site, hz, date);
    daily.push({ date, score: w.score });
    sum += w.score;
    if (w.score > peak) { peak = w.score; peakDate = date; }
    if (w.score >= RULES.tiers.watchOpen && w.vulnerability > 0) {
      watchDays++;
      for (const [k, part] of Object.entries(w.vulnParts)) attr[k] = (attr[k] ?? 0) + (w.score * (weights[k] ?? 0) * part) / w.vulnerability;
    }
  }
  return { hazard: hz, watchDays, peak, peakDate, mean: n ? sum / n : 0, attr, daily };
}

export function siteLedger(site: Site, from: string, to: string): SiteLedger {
  const byHazard = { H1: hazardLedger(site, 'H1', from, to), H2: hazardLedger(site, 'H2', from, to) };
  const attr: Record<string, number> = {};
  for (const h of HZ) for (const [k, v] of Object.entries(byHazard[h].attr)) attr[k] = (attr[k] ?? 0) + v;
  const total = Object.values(attr).reduce((a, b) => a + b, 0);
  const drivers = Object.entries(attr).map(([key, v]) => ({ key, label: FACTOR_LABEL[key] ?? key, share: total ? v / total : 0 })).sort((a, b) => b.share - a.share);
  return { site, days: Math.max(0, daysBetween(from, to) + 1), watchDays: byHazard.H1.watchDays + byHazard.H2.watchDays, byHazard, attr, drivers };
}

export interface Measure { id: string; name: string; category: string; factor: 'shadeDeficit' | 'channel' | 'sealing'; change: string; cobenefits: string; apply: (h: Habitat) => Habitat }
/** Restoration measures mapped to OneAquaHealth Catalogue of Measures categories (codes to confirm with the consortium). */
export const MEASURES: Measure[] = [
  { id: 'M-RIP', name: 'Native riparian buffer planting (willow, alder, ash)', category: 'Riparian vegetation restoration', factor: 'shadeDeficit', change: 'Shade cover raised to at least 50%', cobenefits: 'Cooler, shaded water · bank stability · habitat for birds and pollinators', apply: (h) => ({ ...h, shadeCover: Math.max(h.shadeCover, 0.5) }) },
  { id: 'M-MOR', name: 'Riffle–pool re-profiling and re-meandering', category: 'Hydromorphological restoration', factor: 'channel', change: 'Channel modification reduced to 40% or less', cobenefits: 'Fewer stagnant backwaters · more flow diversity · fish refuges', apply: (h) => ({ ...h, channelModification: Math.min(h.channelModification, 0.4) }) },
  { id: 'M-SUD', name: 'Bio-retention swales and targeted de-sealing', category: 'Nature-based urban drainage (SuDS)', factor: 'sealing', change: 'Effective sealed area cut by 20 points', cobenefits: 'Less storm run-off and overflow · urban cooling · groundwater recharge', apply: (h) => ({ ...h, soilSealing: Math.max(0, h.soilSealing - 0.2) }) },
];

export interface Impact { measures: Measure[]; before: number; after: number; reduction: number; pct: number; byHazard: Record<HazardId, { before: number; after: number }> }
/** Re-runs the season with modified habitat answers. Weather is identical; only V(s) changes. Not a hydrological model. */
export function impact(site: Site, from: string, to: string, measures: Measure[]): Impact {
  const alt: Site = { ...site, habitat: measures.reduce((h, m) => m.apply(h), site.habitat) };
  const b = siteLedger(site, from, to), a = siteLedger(alt, from, to);
  return {
    measures, before: b.watchDays, after: a.watchDays, reduction: b.watchDays - a.watchDays, pct: b.watchDays ? (b.watchDays - a.watchDays) / b.watchDays : 0,
    byHazard: { H1: { before: b.byHazard.H1.watchDays, after: a.byHazard.H1.watchDays }, H2: { before: b.byHazard.H2.watchDays, after: a.byHazard.H2.watchDays } },
  };
}
export const rankMeasures = (site: Site, from: string, to: string) => MEASURES.map((m) => impact(site, from, to, [m])).sort((x, y) => y.reduction - x.reduction || y.pct - x.pct);

export function ledgerCsv(rows: SiteLedger[], season: Season, until: string) {
  const head = ['site_id', 'stream', 'city', 'lat', 'lon', 'shade_cover', 'channel_modification', 'soil_sealing', 'h1_watch_days', 'h1_peak', 'h1_peak_date', 'h2_watch_days', 'h2_peak', 'h2_peak_date', 'top_driver', 'top_driver_share', 'season', 'until', 'data'];
  const esc = (v: string | number) => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v));
  const lines = rows.map((r) => [r.site.id, r.site.stream, CITY[r.site.cityId].name, r.site.lat, r.site.lon, r.site.habitat.shadeCover, r.site.habitat.channelModification, r.site.habitat.soilSealing,
    r.byHazard.H1.watchDays, r.byHazard.H1.peak, r.byHazard.H1.peakDate, r.byHazard.H2.watchDays, r.byHazard.H2.peak, r.byHazard.H2.peakDate,
    r.drivers[0]?.label ?? '', r.drivers[0] ? r.drivers[0].share.toFixed(3) : '', season.id, until, 'synthetic-demo'].map(esc).join(','));
  return [head.join(','), ...lines].join('\n');
}

export function ledgerGeoJson(rows: SiteLedger[], season: Season, until: string) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [r.site.lon, r.site.lat] },
      properties: { site_id: r.site.id, stream: r.site.stream, city: CITY[r.site.cityId].name, season: season.id, until, h1_watch_days: r.byHazard.H1.watchDays, h2_watch_days: r.byHazard.H2.watchDays, h1_peak: r.byHazard.H1.peak, h2_peak: r.byHazard.H2.peak, top_driver: r.drivers[0]?.label ?? null, habitat: r.site.habitat, data: 'synthetic-demo' },
    })),
  }, null, 2);
}
