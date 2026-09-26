import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem, respondError } from '@/lib/server/http';
import { principalFromRequest } from '@/lib/server/principal';
import { rateLimit, tooMany } from '@/lib/server/ratelimit';
import { readWorkspace } from '@/lib/server/repo';
import { importLiveWeather, isCity } from '@/lib/server/weather';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Data Sources → Import live: the server fetches Open-Meteo and this sandbox scores with the snapshot from now on. */
export async function POST(req: NextRequest) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser.');
    const limit = rateLimit(`weather:${p.workspaceId}`, { limit: 20, windowMs: 3_600_000 });
    if (!limit.ok) return tooMany(limit.retryAfter);
    let city: unknown;
    try { city = ((await req.json()) as { city?: unknown } | null)?.city; } catch { /* missing */ }
    if (!isCity(city)) return problem(400, 'invalid_action', 'Send { "city": "coimbra" } (a pilot city id).');
    const c = await getDb();
    const meta = await readWorkspace(c, p.workspaceId);
    if (!meta) return problem(404, 'not_found', 'This sandbox no longer exists.');
    if (meta.kind !== 'demo') return problem(403, 'forbidden', 'Only sandboxes import weather on demand; the live workspace refreshes on schedule.');
    const { imp, version } = await importLiveWeather(c, meta, city);
    return NextResponse.json({ ...imp, version }, { headers: { ...noStore, 'X-Workspace-Version': String(version) } });
  } catch (e) {
    return respondError(e);
  }
}
