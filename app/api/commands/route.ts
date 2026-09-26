import { NextResponse, type NextRequest } from 'next/server';
import { MAX_BODY_BYTES, executeCommand, validateEnvelope } from '@/lib/server/commands';
import { getDb } from '@/lib/server/db';
import { ApiProblem } from '@/lib/server/errors';
import { noStore, problem, respondError } from '@/lib/server/http';
import { principalFromRequest } from '@/lib/server/principal';
import { LIMITS, rateLimit, tooMany } from '@/lib/server/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Applies one action to the caller's workspace and returns the new projection. */
export async function POST(req: NextRequest) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser. POST /api/workspaces or open a join link first.');
    const limit = rateLimit(`cmd:${p.workspaceId}`, LIMITS.commands);
    if (!limit.ok) return tooMany(limit.retryAfter);
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return problem(413, 'payload_too_large', 'The command is larger than 4 MB.');
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return problem(413, 'payload_too_large', 'The command is larger than 4 MB.');
    if (text.includes('data:image/')) {
      const photos = rateLimit(`photo:${p.workspaceId}`, LIMITS.photos);
      if (!photos.ok) return tooMany(photos.retryAfter);
    }
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new ApiProblem(400, 'invalid_action', 'The body is not valid JSON.'); }
    const result = await executeCommand(await getDb(), p, validateEnvelope(body));
    return NextResponse.json(result, { headers: { ...noStore, 'X-Workspace-Version': String(result.version) } });
  } catch (e) {
    return respondError(e);
  }
}
