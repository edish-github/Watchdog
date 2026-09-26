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
