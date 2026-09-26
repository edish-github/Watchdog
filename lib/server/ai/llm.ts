import { anthropicJson } from './anthropic';
import { geminiJson } from './gemini';
import type { Effort, LlmDeps, LlmJsonRequest, LlmResult, Provider } from './types';

export * from './types';

const geminiKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const DEFAULT_MODEL: Record<Provider, string> = { anthropic: 'claude-sonnet-5', gemini: 'gemini-2.5-flash' };
const FAMILY: Record<Provider, RegExp> = { anthropic: /^claude-/i, gemini: /^gemini-/i };

/** LLM_PROVIDER picks when set; otherwise whichever key is present (Anthropic first). null = template only. */
export function activeProvider(): Provider | null {
  const forced = process.env.LLM_PROVIDER;
  if (forced === 'anthropic') return process.env.ANTHROPIC_API_KEY ? 'anthropic' : null;
  if (forced === 'gemini') return geminiKey() ? 'gemini' : null;
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (geminiKey()) return 'gemini';
  return null;
}

/** ANTHROPIC_MODEL / GEMINI_MODEL win; a legacy LLM_MODEL only applies if it belongs to the same family. */
export function modelFor(p: Provider): string {
  const specific = p === 'anthropic' ? process.env.ANTHROPIC_MODEL : process.env.GEMINI_MODEL;
  if (specific) return specific;
  const legacy = process.env.LLM_MODEL;
  if (legacy && FAMILY[p].test(legacy)) return legacy;
  return DEFAULT_MODEL[p];
}

export const defaultTimeoutMs = () => Number(process.env.LLM_TIMEOUT_MS || 12_000);
/** Effort exists on current Claude models except Haiku; Gemini ignores it. */
export const effortFor = (model: string): Effort | null => {
  if (!/^claude-/i.test(model) || /haiku/i.test(model)) return null;
  const e = process.env.LLM_EFFORT;
  return e === 'medium' || e === 'high' || e === 'low' ? e : 'low';
};

export const aiFeatures = () => {
  const provider = activeProvider();
  return { aiDrafting: !!provider, provider, model: provider ? modelFor(provider) : null };
};

export function llmJson<T>(provider: Provider, req: LlmJsonRequest, deps: LlmDeps = {}): Promise<LlmResult<T>> {
  return provider === 'anthropic' ? anthropicJson<T>(req, deps) : geminiJson<T>(req, deps);
}
