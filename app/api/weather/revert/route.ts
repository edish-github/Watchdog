import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem, respondError } from '@/lib/server/http';
import { principalFromRequest } from '@/lib/server/principal';
import { readWorkspace } from '@/lib/server/repo';
import { isCity, revertLiveWeather } from '@/lib/server/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Data Sources → Synthetic: this sandbox goes back to the synthetic weather for one city. */
export async function POST(req: NextRequest) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser.');
    let city: unknown;
    try { city = ((await req.json()) as { city?: unknown } | null)?.city; } catch { /* missing */ }
    if (!isCity(city)) return problem(400, 'invalid_action', 'Send { "city": "coimbra" } (a pilot city id).');
    const c = await getDb();
    const meta = await readWorkspace(c, p.workspaceId);
    if (!meta) return problem(404, 'not_found', 'This sandbox no longer exists.');
    const version = await revertLiveWeather(c, meta, city);
    return NextResponse.json({ version }, { headers: { ...noStore, 'X-Workspace-Version': String(version) } });
  } catch (e) {
    return respondError(e);
  }
}
