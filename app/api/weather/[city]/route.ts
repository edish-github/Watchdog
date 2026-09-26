import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem, respondError } from '@/lib/server/http';
import { principalFromRequest } from '@/lib/server/principal';
import { readWorkspace } from '@/lib/server/repo';
import { isCity, readLiveImport } from '@/lib/server/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The live-weather snapshot this sandbox scores with, so every joined browser can use exactly the same data. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ city: string }> }) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser.');
    const { city } = await ctx.params;
    if (!isCity(city)) return problem(404, 'not_found', 'Unknown city.');
    const c = await getDb();
    const meta = await readWorkspace(c, p.workspaceId);
    if (!meta) return problem(404, 'not_found', 'This sandbox no longer exists.');
    const imp = await readLiveImport(c, meta, city);
    if (!imp) return problem(404, 'not_found', 'This city runs on synthetic weather in this sandbox.');
    return NextResponse.json(imp, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch (e) {
    return respondError(e);
  }
}
