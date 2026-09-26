import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultValidity, whenText } from '@/lib/advisory';
import { SITE } from '@/lib/catalog';
import { buildScenario, reduce, type Action } from '@/lib/sim';
import { syntheticWeather, withWeather } from '@/lib/weather';
import { anthropicJson } from '@/lib/server/ai/anthropic';
import { geminiJson, toGeminiSchema } from '@/lib/server/ai/gemini';
import { activeProvider, effortFor, modelFor, LlmError } from '@/lib/server/ai/llm';
import { CLOSING, buildBrief, draftAdvisory, draftSchema, precheck, type DraftBrief } from '@/lib/server/ai/advisory-draft';

const KEYS = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY', 'LLM_PROVIDER', 'LLM_MODEL', 'ANTHROPIC_MODEL', 'GEMINI_MODEL', 'GEMINI_AUTH'] as const;
let saved: Record<string, string | undefined> = {};
beforeEach(() => { saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; });
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

const ana: Action = { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-8f92', displayName: 'Ana', role: 'walker', signs: ['dark_mats', 'dog_unwell'], animal: { species: 'dog', symptoms: ['tremors'], onset: 'lt2h' }, source: 'pwa' } };
const d = withWeather(syntheticWeather, () => reduce(buildScenario('day2'), ana));
const signal = d.signals.find((s) => s.siteId === 'COI-03')!;
const validUntil = defaultValidity(d.now, 72);
const brief: DraftBrief = buildBrief(d, signal.id, { langs: ['en', 'pt'], validUntil });
const good = (b: DraftBrief) => ({
  en: `Keep dogs out of the water at ${b.site.stream}, ${b.site.city}, ${b.validity.en}. Warm, low water can grow algal mats here. Do not touch mats on stones. Contact a vet if a pet shows symptoms after contact with the water. ${CLOSING.en}`,
  pt: `Mantenha os cães fora da água no ${b.site.stream}, em ${b.site.city}, ${b.validity.pt}. A água quente e baixa pode formar tapetes de algas. Não toque nos tapetes nas pedras. Contacte um veterinário se um animal mostrar sintomas após contacto com a água. ${CLOSING.pt}`,
});

function fakeFetch(...replies: { status?: number; body: unknown }[]) {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
    const r = replies.shift() ?? { status: 500, body: { error: { message: 'no more replies' } } };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const claudeMsg = (json: unknown, stop = 'end_turn') => ({ body: { model: 'claude-sonnet-5', stop_reason: stop, usage: { input_tokens: 500, output_tokens: 120 }, content: [{ type: 'text', text: JSON.stringify(json) }] } });
const geminiMsg = (json: unknown, finish = 'STOP', extra: Record<string, unknown> = {}) => ({ body: { modelVersion: 'gemini-2.5-flash-001', usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 110 }, candidates: [{ finishReason: finish, content: { parts: [{ text: JSON.stringify(json) }] } }], ...extra } });
const req = { system: 's', user: 'u', schema: draftSchema(['en', 'pt']), model: 'gemini-2.5-flash' };

describe('provider selection and honest model names', () => {
  it('picks the provider from the keys present, Anthropic first, LLM_PROVIDER overriding', () => {
    expect(activeProvider()).toBeNull();
    process.env.GEMINI_API_KEY = 'g';
    expect(activeProvider()).toBe('gemini');
    process.env.ANTHROPIC_API_KEY = 'a';
    expect(activeProvider()).toBe('anthropic');
    process.env.LLM_PROVIDER = 'gemini';
    expect(activeProvider()).toBe('gemini');
  });
  it('never lets a claude-* LLM_MODEL name a Gemini call (the bug this batch fixes)', () => {
    process.env.LLM_MODEL = 'claude-sonnet-5';
    expect(modelFor('gemini')).toBe('gemini-2.5-flash');
    expect(modelFor('anthropic')).toBe('claude-sonnet-5');
    process.env.GEMINI_MODEL = 'gemini-2.5-pro';
    expect(modelFor('gemini')).toBe('gemini-2.5-pro');
  });
  it('sends effort only to Claude models that support it', () => {
    expect(effortFor('claude-sonnet-5')).toBe('low');
    expect(effortFor('claude-haiku-4-5-20251001')).toBeNull();
    expect(effortFor('gemini-2.5-flash')).toBeNull();
  });
});

describe('Anthropic adapter', () => {
  it('sends JSON outputs, effort and API headers, and reports the model the API names', async () => {
    const { f, calls } = fakeFetch(claudeMsg({ en: 'x', pt: 'y' }));
    const r = await anthropicJson<{ en: string }>({ ...req, model: 'claude-sonnet-5', effort: 'low' }, { fetch: f, apiKey: 'k' });
    expect(r).toMatchObject({ data: { en: 'x' }, provider: 'anthropic', model: 'claude-sonnet-5' });
    expect(calls[0].headers).toMatchObject({ 'x-api-key': 'k', 'anthropic-version': '2023-06-01' });
    expect(calls[0].body.output_config).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
  });
  it('types its failures', async () => {
    await expect(anthropicJson(req, { apiKey: '' })).rejects.toMatchObject({ kind: 'no_key' });
    await expect(anthropicJson(req, { fetch: fakeFetch({ status: 529, body: { error: { type: 'overloaded_error', message: 'Overloaded' } } }).f, apiKey: 'k' })).rejects.toMatchObject({ kind: 'http', status: 529 });
    await expect(anthropicJson(req, { fetch: fakeFetch(claudeMsg({}, 'refusal')).f, apiKey: 'k' })).rejects.toMatchObject({ kind: 'refusal' });
    await expect(anthropicJson(req, { fetch: fakeFetch(claudeMsg({}, 'max_tokens')).f, apiKey: 'k' })).rejects.toMatchObject({ kind: 'truncated' });
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))) as unknown as typeof fetch;
    await expect(anthropicJson({ ...req, timeoutMs: 30 }, { fetch: hang, apiKey: 'k' })).rejects.toMatchObject({ kind: 'timeout' });
  });
});

describe('Gemini adapter', () => {
  it('keeps the key out of the URL, converts the schema, and reports the model version the API names', async () => {
    const { f, calls } = fakeFetch(geminiMsg({ en: 'x', pt: 'y' }));
    const r = await geminiJson<{ en: string }>(req, { fetch: f, apiKey: 'secret-key' });
    expect(r).toMatchObject({ data: { en: 'x' }, provider: 'gemini', model: 'gemini-2.5-flash-001', usage: { input_tokens: 600, output_tokens: 110 } });
    expect(calls[0].url).toMatch(/\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
    expect(calls[0].url).not.toContain('secret-key');
    expect(calls[0].headers['x-goog-api-key']).toBe('secret-key');
    expect(calls[0].body.systemInstruction).toEqual({ parts: [{ text: 's' }] });
    const gc = calls[0].body.generationConfig as Record<string, unknown>;
    expect(gc).toMatchObject({ responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 }, responseSchema: { type: 'OBJECT', required: ['en', 'pt'], propertyOrdering: ['en', 'pt'] } });
    expect(JSON.stringify(gc)).not.toContain('additionalProperties');
  });
  it('converts nested JSON Schema to Gemini’s dialect', () => {
    expect(toGeminiSchema({ type: 'object', additionalProperties: false, properties: { a: { type: 'array', items: { type: 'string' } } } }))
      .toEqual({ type: 'OBJECT', properties: { a: { type: 'ARRAY', items: { type: 'STRING' } } }, propertyOrdering: ['a'] });
  });
  it('types its failures', async () => {
    await expect(geminiJson(req, { apiKey: '' })).rejects.toMatchObject({ kind: 'no_key' });
    await expect(geminiJson(req, { fetch: fakeFetch({ status: 400, body: { error: { status: 'INVALID_ARGUMENT', message: 'bad' } } }).f, apiKey: 'k' })).rejects.toMatchObject({ kind: 'http', status: 400 });
    await expect(geminiJson(req, { fetch: fakeFetch(geminiMsg({}, 'SAFETY')).f, apiKey: 'k' })).rejects.toMatchObject({ kind: 'refusal' });
    await expect(geminiJson(req, { fetch: fakeFetch(geminiMsg({}, 'MAX_TOKENS')).f, apiKey: 'k' })).rejects.toMatchObject({ kind: 'truncated' });
    await expect(geminiJson(req, { fetch: fakeFetch(geminiMsg({}, 'STOP', { promptFeedback: { blockReason: 'OTHER' } })).f, apiKey: 'k' })).rejects.toBeInstanceOf(LlmError);
  });
});

describe('brief and precheck', () => {
  it('carries no reporter identity and uses the editor’s validity phrase', () => {
    const json = JSON.stringify(brief);
    expect(json).not.toContain('anon-8f92');
    expect(json).not.toMatch(/"Ana"/);
    expect(brief.validity.en).toBe(`until ${whenText(validUntil, SITE['COI-03'], 'en')}`);
  });
  it('passes a compliant v2-shaped draft and fails a bad one on the hard checks', () => {
    expect(precheck(good(brief), brief)).toEqual({ hard: [], soft: [] });
    const { hard } = precheck({ en: 'The water is toxic and it is not safe for dogs.', pt: good(brief).pt }, brief);
    expect(hard.join(' ')).toMatch(/alarmist/i);
    expect(hard.join(' ')).toMatch(/include/);
  });
});

describe('draftAdvisory', () => {
  it('labels a Gemini draft with the Gemini model the API reported', async () => {
    const { f } = fakeFetch(geminiMsg(good(brief)));
    const r = await draftAdvisory(brief, { fetch: f, apiKey: 'k', provider: 'gemini', model: 'gemini-2.5-flash' });
    expect(r).toMatchObject({ ok: true, provider: 'gemini', model: 'gemini-2.5-flash-001', promptVersion: 'advisory-v2', attempts: 1 });
  });
  it('retries once with the problems listed (Claude)', async () => {
    const { f, calls } = fakeFetch(claudeMsg({ en: 'Unsafe water.', pt: 'Água tóxica.' }), claudeMsg(good(brief)));
    const r = await draftAdvisory(brief, { fetch: f, apiKey: 'k', provider: 'anthropic', model: 'claude-sonnet-5' });
    expect(r.ok && r.attempts).toBe(2);
    expect((calls[1].body.messages as { content: string }[])[0].content).toMatch(/Fix all of them/);
  });
  it('reports, never throws: no key, two hard failures', async () => {
    expect(await draftAdvisory(brief)).toMatchObject({ ok: false, reason: 'no_key' });
    const twice = fakeFetch(claudeMsg({ en: 'toxic', pt: 'tóxico' }), claudeMsg({ en: 'toxic', pt: 'tóxico' }));
    expect(await draftAdvisory(brief, { fetch: twice.f, apiKey: 'k', provider: 'anthropic', model: 'claude-sonnet-5' })).toMatchObject({ ok: false, reason: 'precheck', attempts: 2 });
  });
});
