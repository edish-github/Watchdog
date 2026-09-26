import { NextResponse } from 'next/server';
import { getDb } from '@/lib/server/db';
import { RULES } from '@/lib/engine';
import { FHIR_BASE } from '@/lib/fhir-canonical';
import { noStore } from '@/lib/server/http';
import { configIssues } from '@/lib/server/env';
import { aiFeatures } from '@/lib/server/ai/llm';
import { ADVISORY_PROMPT_VERSION } from '@/lib/server/ai/advisory-draft';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const t0 = Date.now();
  const f = aiFeatures();
  const ai = { drafting: f.aiDrafting, provider: f.provider, model: f.model, prompt: ADVISORY_PROMPT_VERSION };
  const build = { transport: process.env.NEXT_PUBLIC_BACKEND === 'remote' ? 'remote' : 'local', fhirCanonical: FHIR_BASE, commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null };
  const issues = configIssues();
  const config = { ok: issues.length === 0, issues };
  try {
    const c = await getDb();
    const rs = await c.batch(['SELECT id FROM schema_migrations ORDER BY id', "SELECT kind, COUNT(*) AS n FROM workspaces GROUP BY kind"], 'read');
    const counts = Object.fromEntries(rs[1].rows.map((r) => [String(r.kind), Number(r.n)]));
    return NextResponse.json({
      ok: true, db: 'ok', latencyMs: Date.now() - t0, migrations: rs[0].rows.map((r) => String(r.id)),
      workspaces: { demo: counts.demo ?? 0, live: counts.live ?? 0 }, rules: { version: RULES.version, sha: RULES.sha }, ai, build, config, time: new Date().toISOString(),
    }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ ok: false, db: 'error', ai, build, config, detail: e instanceof Error ? e.message : String(e) }, { status: 503, headers: noStore });
  }
}
