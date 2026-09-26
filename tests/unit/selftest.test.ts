import { describe, expect, it } from 'vitest';
import { TEST_COUNT, runSelfTests } from '@/lib/selftest';

// The same 17 deterministic and property-based checks that /app/rules runs in the browser.
const results = runSelfTests();

describe('engine, reducer, guardrails, FHIR and replay self-tests', () => {
  it(`runs all ${TEST_COUNT} cases`, () => expect(results).toHaveLength(TEST_COUNT));
  for (const r of results) it(`${r.id} · ${r.name}`, () => expect(r.pass, r.detail).toBe(true));
});
