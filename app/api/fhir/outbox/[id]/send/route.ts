import { NextResponse, type NextRequest } from 'next/server';
import { DEFAULT_ENDPOINT } from '@/lib/fhir';
import { getDb } from '@/lib/server/db';
import { deliverBundle } from '@/lib/server/fhir-outbox';
import { noStore, problem, respondError } from '@/lib/server/http';
import { principalFromRequest } from '@/lib/server/principal';
import { rateLimit, tooMany } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** "Send to sandbox": the server POSTs the bundle (no CORS, no credentials in the browser) and records the receipt. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser.');
    const limit = rateLimit(`fhir:${p.workspaceId}`, { limit: 30, windowMs: 3_600_000 });
    if (!limit.ok) return tooMany(limit.retryAfter);
    const { id } = await ctx.params;
    let endpoint = DEFAULT_ENDPOINT;
    try { const b = await req.json(); if (b && typeof b === 'object' && typeof (b as { endpoint?: unknown }).endpoint === 'string') endpoint = (b as { endpoint: string }).endpoint; } catch { /* default endpoint */ }
    const r = await deliverBundle(await getDb(), p.workspaceId, id, endpoint);
    return NextResponse.json(r, { headers: { ...noStore, 'X-Workspace-Version': String(r.version) } });
  } catch (e) {
    return respondError(e);
  }
}
