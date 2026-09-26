import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem } from '@/lib/server/http';
import { readWorkspace } from '@/lib/server/repo';
import { WS_COOKIE, unsign } from '@/lib/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = unsign(req.cookies.get(WS_COOKIE)?.value);
  if (!id) return problem(401, 'unauthenticated', 'No sandbox attached to this browser. POST /api/workspaces to create one.');
  const meta = await readWorkspace(await getDb(), id);
  if (!meta) return problem(404, 'not_found', 'This sandbox no longer exists (expired or deleted).');
  return NextResponse.json({ id: meta.id, kind: meta.kind, joinCode: meta.joinCode, preset: meta.preset, version: meta.version, now: meta.now, lastSeenAt: meta.lastSeenAt, expiresAt: meta.expiresAt }, { headers: noStore });
}
