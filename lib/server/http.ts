import { NextResponse } from 'next/server';
import { ApiProblem, type ProblemCode } from './errors';

export type { ProblemCode } from './errors';
export const noStore = { 'Cache-Control': 'no-store' };

/** JSON problem details — the only error shape the API returns. */
export function problem(status: number, code: ProblemCode, detail: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ status, code, detail, ...extra }, { status, headers: noStore });
}

export function respondError(e: unknown) {
  if (e instanceof ApiProblem) return problem(e.status, e.code, e.message, e.extra);
  console.error('[watchdog api]', e);
  return problem(500, 'internal_error', 'Unexpected server error. Nothing was changed.');
}

/** Only same-site relative paths, so /join links cannot redirect elsewhere. */
export const safePath = (p: string | null | undefined): string | null =>
  p && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') ? p : null;
