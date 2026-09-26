import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { respondError, safePath } from '@/lib/server/http';
import { limitIp, tooMany } from '@/lib/server/ratelimit';
import { WS_COOKIE, sign, wsCookieOptions } from '@/lib/server/session';
import { findByJoinCode } from '@/lib/server/workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The QR-code link: /join/K4P9TX[?to=/app] → attach this browser to the sandbox → redirect (default /observe). */
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  try {
    const limit = limitIp(req, 'join');
    if (!limit.ok) return tooMany(limit.retryAfter);
    const { code } = await ctx.params;
    const meta = await findByJoinCode(await getDb(), code);
    if (!meta) return NextResponse.redirect(new URL('/observe?join=invalid', req.url));
    const res = NextResponse.redirect(new URL(safePath(req.nextUrl.searchParams.get('to')) ?? '/observe', req.url));
    res.cookies.set(WS_COOKIE, sign(meta.id), wsCookieOptions());
    return res;
  } catch (e) {
    return respondError(e);
  }
}
