import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem, respondError } from '@/lib/server/http';
import { limitIp, tooMany } from '@/lib/server/ratelimit';
import { WS_COOKIE, sign, wsCookieOptions } from '@/lib/server/session';
import { findByJoinCode, workspaceInfo } from '@/lib/server/workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Attaches this browser to the sandbox with the typed 6-character code. */
export async function POST(req: NextRequest) {
  try {
    const limit = limitIp(req, 'join');
    if (!limit.ok) return tooMany(limit.retryAfter);
    let code = '';
    try { const b = await req.json(); if (b && typeof b === 'object' && typeof (b as { code?: unknown }).code === 'string') code = (b as { code: string }).code; } catch { /* empty */ }
    const meta = code ? await findByJoinCode(await getDb(), code) : null;
    if (!meta) return problem(404, 'not_found', 'No sandbox has that code. Check the six characters on the console screen.');
    const res = NextResponse.json({ workspace: workspaceInfo(meta) }, { headers: noStore });
    res.cookies.set(WS_COOKIE, sign(meta.id), wsCookieOptions());
    return res;
  } catch (e) {
    return respondError(e);
  }
}
