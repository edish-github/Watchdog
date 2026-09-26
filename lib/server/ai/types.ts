export type Provider = 'anthropic' | 'gemini';
export type Effort = 'low' | 'medium' | 'high';
export type LlmErrorKind = 'no_key' | 'timeout' | 'network' | 'http' | 'refusal' | 'truncated' | 'parse';

export class LlmError extends Error {
  constructor(readonly kind: LlmErrorKind, message: string, readonly status?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmDeps { fetch?: typeof fetch; apiKey?: string; baseUrl?: string }
export interface LlmJsonRequest {
  system: string; user: string; schema: Record<string, unknown>; model: string;
  effort?: Effort | null; maxTokens?: number; timeoutMs?: number;
}
export interface LlmUsage { input_tokens?: number; output_tokens?: number }
/** `model` is what the provider's API reported it used — the only value we ever put on a label. */
export interface LlmResult<T> { data: T; model: string; provider: Provider; latencyMs: number; usage: LlmUsage }

/** POST with a timeout; returns HTTP status and raw body text, or throws a typed timeout/network error. */
export async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number, doFetch: typeof fetch): Promise<{ status: number; raw: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(url, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: res.status, raw: await res.text() };
  } catch (e) {
    if (ctrl.signal.aborted) throw new LlmError('timeout', `No answer within ${timeoutMs} ms.`);
    throw new LlmError('network', e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
