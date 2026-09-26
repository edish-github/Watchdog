import { NextResponse, type NextRequest } from 'next/server';
import { HAZARDS, SIGNS } from '@/lib/catalog';
import { RULES } from '@/lib/engine';
import { CS_SIGN, CS_WATCH } from '@/lib/fhir';

export const dynamic = 'force-static';

const base = {
  resourceType: 'CodeSystem', status: 'draft', experimental: true, version: RULES.version,
  publisher: 'Watchdog — OneAquaHealth hackathon prototype', caseSensitive: true, content: 'complete',
  jurisdiction: [{ coding: [{ system: 'urn:iso:std:iso:3166', code: 'EU' }] }],
};

/** The CodeSystems our bundles reference, served at their own canonical URLs so the system URIs resolve. */
function codeSystem(id: string) {
  if (id === 'sentinel-sign') {
    const concept = Object.entries(SIGNS).map(([code, s]) => ({ code, display: (s as { en: string }).en }));
    return { ...base, id, url: CS_SIGN, name: 'WatchdogSentinelSign', title: 'Watchdog sentinel signs', description: 'Visible signs of water or wildlife stress reported by walkers and citizen scientists. Community observations, not laboratory results. Proposed extension to the OneAquaHealth FHIR IG.', count: concept.length, concept };
  }
  if (id === 'watch-indicator') {
    const concept = (Object.keys(HAZARDS) as (keyof typeof HAZARDS)[]).map((h) => ({ code: `watch-score-${String(h).toLowerCase()}`, display: `Watch score — ${HAZARDS[h].long}` }));
    return { ...base, id, url: CS_WATCH, name: 'WatchdogWatchIndicator', title: 'Watchdog watch indicators', description: `Deterministic forecast indicators from rules ${RULES.version} (${RULES.sha}). Forecasts, not measurements.`, count: concept.length, concept };
  }
  return null;
}

export function generateStaticParams() { return [{ id: 'sentinel-sign' }, { id: 'watch-indicator' }]; }

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cs = codeSystem(id.replace(/\.json$/, ''));
  if (!cs) return NextResponse.json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found', diagnostics: `No CodeSystem "${id}"` }] }, { status: 404, headers: { 'Content-Type': 'application/fhir+json' } });
  return NextResponse.json(cs, { headers: { 'Content-Type': 'application/fhir+json', 'Cache-Control': 'public, max-age=3600' } });
}
