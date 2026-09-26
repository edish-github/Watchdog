import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { noStore, problem, respondError } from '@/lib/server/http';
import { limitIp, tooMany } from '@/lib/server/ratelimit';
import { WS_COOKIE, sign, wsCookieOptions } from '@/lib/server/session';
import { createSandbox, isPreset } from '@/lib/server/workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Creates a private demo sandbox from a preset and attaches this browser to it. */
export async function POST(req: NextRequest) {
  try {
    if (!env.demoMode()) return problem(403, 'forbidden', 'Sandboxes are disabled (DEMO_MODE=false).');
    const limit = limitIp(req, 'sandboxCreate');
    if (!limit.ok) return tooMany(limit.retryAfter);
    let preset: unknown = 'day2';
    try { const body = await req.json(); if (body && typeof body === 'object' && 'preset' in body) preset = (body as { preset: unknown }).preset; } catch { /* empty body → default preset */ }
    if (!isPreset(preset)) return problem(400, 'invalid_action', `Unknown preset "${String(preset)}".`);
    const { meta, d } = await createSandbox(await getDb(), preset);
    const res = NextResponse.json({ id: meta.id, kind: meta.kind, joinCode: meta.joinCode, preset: meta.preset, version: meta.version, now: d.now }, { status: 201, headers: noStore });
    res.cookies.set(WS_COOKIE, sign(meta.id), wsCookieOptions());
    return res;
  } catch (e) {
    return respondError(e);
  }
}
