import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem, respondError } from '@/lib/server/http';
import { principalFromRequest } from '@/lib/server/principal';
import { syncWorkspace } from '@/lib/server/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/sync?since=<version> → 304 when unchanged, else { version, role, workspace, projection }. */
export async function GET(req: NextRequest) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser.');
    const raw = req.nextUrl.searchParams.get('since');
    const since = raw !== null && /^\d{1,12}$/.test(raw) ? Number(raw) : null;
    const r = await syncWorkspace(await getDb(), p, since);
    const headers = { ...noStore, ETag: `W/"${p.workspaceId}:${r.version}"`, 'X-Workspace-Version': String(r.version) };
    if (r.notModified) return new NextResponse(null, { status: 304, headers });
    const { notModified: _unused, ...body } = r;
    return NextResponse.json(body, { headers });
  } catch (e) {
    return respondError(e);
  }
}
