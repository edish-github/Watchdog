/**
 * Claude Messages API with JSON outputs (output_config.format) and effort (output_config.effort).
 * Docs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs · .../build-with-claude/effort
 */
import { LlmError, postJson, type LlmDeps, type LlmJsonRequest, type LlmResult, type LlmUsage } from './types';

export async function anthropicJson<T>(req: LlmJsonRequest, deps: LlmDeps = {}): Promise<LlmResult<T>> {
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new LlmError('no_key', 'ANTHROPIC_API_KEY is not set.');
  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: req.schema } };
  if (req.effort) outputConfig.effort = req.effort;
  const t0 = Date.now();
  const { status, raw } = await postJson(
    `${deps.baseUrl ?? process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com'}/v1/messages`,
    { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    { model: req.model, max_tokens: req.maxTokens ?? 2048, system: req.system, messages: [{ role: 'user', content: req.user }], output_config: outputConfig },
    req.timeoutMs ?? 12_000,
    deps.fetch ?? fetch,
  );
  let body: { model?: string; stop_reason?: string; usage?: LlmUsage; content?: { type: string; text?: string }[]; error?: { type?: string; message?: string } };
  try { body = JSON.parse(raw); } catch { throw new LlmError('parse', `Unreadable response (HTTP ${status}).`, status); }
  if (status < 200 || status >= 300) throw new LlmError('http', `HTTP ${status} ${body.error?.type ?? ''}: ${body.error?.message ?? 'request failed'}`.replace(/\s+/g, ' '), status);
  if (body.stop_reason === 'refusal') throw new LlmError('refusal', 'Claude declined to write this draft.');
  if (body.stop_reason === 'max_tokens') throw new LlmError('truncated', 'The draft was cut off (max_tokens).');
  const text = body.content?.find((b) => b.type === 'text')?.text;
  if (!text) throw new LlmError('parse', 'The response had no text block.');
  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new LlmError('parse', 'The draft was not valid JSON.'); }
  return { data, model: body.model ?? req.model, provider: 'anthropic', latencyMs: Date.now() - t0, usage: body.usage ?? {} };
}
