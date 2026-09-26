/**
 * Google Gemini generateContent with a JSON response schema. The key travels in the x-goog-api-key header, never in
 * the URL (URLs end up in logs). Set GEMINI_AUTH=query only if your key type is refused in the header.
 */
import { LlmError, postJson, type LlmDeps, type LlmJsonRequest, type LlmResult } from './types';

/** JSON Schema → Gemini's OpenAPI-style schema: upper-case types, no additionalProperties, stable property order. */
export function toGeminiSchema(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(toGeminiSchema);
  if (!s || typeof s !== 'object') return s;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
    if (k === 'additionalProperties' || k === '$schema') continue;
    if (k === 'type' && typeof v === 'string') out.type = v.toUpperCase();
    else if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
      out.propertyOrdering = Object.keys(v as Record<string, unknown>);
    } else out[k] = toGeminiSchema(v);
  }
  return out;
}

const DONE = new Set(['STOP', 'FINISH_REASON_UNSPECIFIED']);

export async function geminiJson<T>(req: LlmJsonRequest, deps: LlmDeps = {}): Promise<LlmResult<T>> {
  const apiKey = deps.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new LlmError('no_key', 'GEMINI_API_KEY is not set.');
  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json', responseSchema: toGeminiSchema(req.schema), maxOutputTokens: req.maxTokens ?? 1024 };
  if (/2\.5-flash/.test(req.model)) generationConfig.thinkingConfig = { thinkingBudget: 0 }; // short text: no thinking, lower latency
  const inQuery = process.env.GEMINI_AUTH === 'query';
  const base = deps.baseUrl ?? process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com';
  const url = `${base}/v1beta/models/${encodeURIComponent(req.model)}:generateContent${inQuery ? `?key=${encodeURIComponent(apiKey)}` : ''}`;
  const t0 = Date.now();
  const { status, raw } = await postJson(
    url,
    inQuery ? {} : { 'x-goog-api-key': apiKey },
    { systemInstruction: { parts: [{ text: req.system }] }, contents: [{ role: 'user', parts: [{ text: req.user }] }], generationConfig },
    req.timeoutMs ?? 12_000,
    deps.fetch ?? fetch,
  );
  let body: {
    modelVersion?: string; error?: { code?: number; message?: string; status?: string };
    promptFeedback?: { blockReason?: string };
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  try { body = JSON.parse(raw); } catch { throw new LlmError('parse', `Unreadable response (HTTP ${status}).`, status); }
  if (status < 200 || status >= 300) throw new LlmError('http', `HTTP ${status} ${body.error?.status ?? ''}: ${body.error?.message ?? 'request failed'}`.replace(/\s+/g, ' '), status);
  if (body.promptFeedback?.blockReason) throw new LlmError('refusal', `Gemini blocked the request (${body.promptFeedback.blockReason}).`);
  const cand = body.candidates?.[0];
  if (!cand) throw new LlmError('parse', 'The response had no candidates.');
  if (cand.finishReason === 'MAX_TOKENS') throw new LlmError('truncated', 'The draft was cut off (MAX_TOKENS).');
  if (cand.finishReason && !DONE.has(cand.finishReason)) throw new LlmError('refusal', `Gemini stopped: ${cand.finishReason}.`);
  const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text).join('');
  if (!text) throw new LlmError('parse', 'The response had no text.');
  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new LlmError('parse', 'The draft was not valid JSON.'); }
  return {
    data, model: body.modelVersion ?? req.model, provider: 'gemini', latencyMs: Date.now() - t0,
    usage: { input_tokens: body.usageMetadata?.promptTokenCount, output_tokens: body.usageMetadata?.candidatesTokenCount },
  };
}
