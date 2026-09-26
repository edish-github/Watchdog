import { VersionConflictError } from './repo';

export type ProblemCode =
  | 'invalid_action' | 'forbidden' | 'version_conflict' | 'guardrail_failed' | 'rate_limited' | 'not_found'
  | 'unauthenticated' | 'upstream_unavailable' | 'payload_too_large' | 'internal_error';

/** An error that maps to a JSON problem response. Anything else becomes a 500. */
export class ApiProblem extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, detail: string, readonly extra: Record<string, unknown> = {}) {
    super(detail);
    this.name = 'ApiProblem';
  }
}

const text = (e: unknown): string => {
  if (!(e instanceof Error)) return String(e);
  const cause = (e as { cause?: unknown }).cause;
  return `${e.message} ${cause instanceof Error ? cause.message : cause ? String(cause) : ''}`;
};
/** SQLite's single writer: another transaction holds the lock. */
export const isBusy = (e: unknown) => /SQLITE_BUSY|database is locked/i.test(text(e));
export const isRetryable = (e: unknown) => e instanceof VersionConflictError || isBusy(e);
/** A second request with the same requestId lost the race to the first. */
export const isDuplicateRequest = (e: unknown) => /UNIQUE constraint failed: command_log/i.test(text(e));
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const backoff = (attempt: number) => 15 * 2 ** attempt + Math.floor(Math.random() * 15);
