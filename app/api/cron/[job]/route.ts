import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { noStore, problem, respondError } from '@/lib/server/http';
import { runCycle, runOutbox, runRetention, runWeatherRefresh } from '@/lib/server/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOBS = { retention: runRetention, cycle: runCycle, outbox: runOutbox, weather: runWeatherRefresh } as const;

/**
 * Scheduled jobs. Vercel Cron sends "Authorization: Bearer $CRON_SECRET" automatically; GitHub Actions sends the same
 * header (see .github/workflows/cron.yml). Without CRON_SECRET the jobs are disabled.
 */
async function handle(req: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return problem(503, 'upstream_unavailable', 'Scheduled jobs are disabled: set CRON_SECRET.');
    const got = Buffer.from(req.headers.get('authorization') ?? ''), want = Buffer.from(`Bearer ${secret}`);
    if (got.length !== want.length || !timingSafeEqual(got, want)) return problem(401, 'unauthenticated', 'Missing or wrong cron secret.');
    const { job } = await ctx.params;
    const run = JOBS[job as keyof typeof JOBS];
    if (!run) return problem(404, 'not_found', `Unknown job "${job}". Jobs: ${Object.keys(JOBS).join(', ')}.`);
    const t0 = Date.now();
    const result = await run(await getDb());
    const body = { job, ok: true, ms: Date.now() - t0, ...result };
    if (process.env.NODE_ENV !== 'test') console.info(JSON.stringify({ evt: 'cron', ...body }));
    return NextResponse.json(body, { headers: noStore });
  } catch (e) {
    return respondError(e);
  }
}
export const GET = handle;
export const POST = handle;
