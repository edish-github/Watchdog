import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem, respondError } from '@/lib/server/http';
import { principalFromRequest } from '@/lib/server/principal';
import { isPreset, resetSandbox, workspaceInfo } from '@/lib/server/workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Replaces this sandbox's world with a preset. Same id and join code, so joined phones stay attached. */
export async function POST(req: NextRequest) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser.');
    let preset: unknown = 'day2';
    try { const b = await req.json(); if (b && typeof b === 'object' && 'preset' in b) preset = (b as { preset: unknown }).preset; } catch { /* default */ }
    if (!isPreset(preset)) return problem(400, 'invalid_action', `Unknown preset "${String(preset)}".`);
    const { meta, d } = await resetSandbox(await getDb(), p.workspaceId, preset);
    return NextResponse.json({ version: meta.version, workspace: workspaceInfo(meta), projection: d }, { headers: { ...noStore, 'X-Workspace-Version': String(meta.version) } });
  } catch (e) {
    return respondError(e);
  }
}
