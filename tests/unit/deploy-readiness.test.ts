import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as codeSystem } from '@/app/fhir/CodeSystem/[id]/route';
import { SIGNS } from '@/lib/catalog';
import { CS_SIGN, CS_WATCH } from '@/lib/fhir';
import { FHIR_BASE } from '@/lib/fhir-canonical';
import { PRESETS, buildScenario } from '@/lib/sim';
import { configIssues } from '@/lib/server/env';
import { CSP, middleware } from '@/middleware';

const ENV = ['VERCEL', 'DATABASE_URL', 'DATABASE_AUTH_TOKEN', 'SESSION_SECRET', 'CRON_SECRET', 'NEXT_PUBLIC_BACKEND', 'NEXT_PUBLIC_FHIR_CANONICAL', 'NODE_ENV'] as const;
let saved: Record<string, string | undefined> = {};
const penv = process.env as Record<string, string | undefined>;
beforeEach(() => { saved = Object.fromEntries(ENV.map((k) => [k, penv[k]])); });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete penv[k]; else penv[k] = saved[k]; } });

describe('FHIR canonical', () => {
  it('every Watchdog URI in every scenario bundle derives from FHIR_BASE — none left behind as text', () => {
    const json = JSON.stringify(PRESETS.flatMap((p) => buildScenario(p.id).bundles.map((b) => b.bundle)));
    expect(json).not.toContain('${FHIR_BASE}');
    expect(CS_SIGN.startsWith(FHIR_BASE)).toBe(true);
    expect(CS_WATCH.startsWith(FHIR_BASE)).toBe(true);
    const foreign = [...json.matchAll(/"system":"(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => !u.startsWith(FHIR_BASE) && !/hl7\.org|snomed\.info|unitsofmeasure\.org|terminology\.hl7\.org/.test(u));
    expect(foreign).toEqual([]);
  });
  it('serves the CodeSystems at their canonical URLs, covering every sign code', async () => {
    const res = await codeSystem(new NextRequest('http://localhost:3000/fhir/CodeSystem/sentinel-sign'), { params: Promise.resolve({ id: 'sentinel-sign' }) });
    expect(res.headers.get('content-type')).toContain('application/fhir+json');
    const cs = (await res.json()) as { url: string; concept: { code: string }[] };
    expect(cs.url).toBe(CS_SIGN);
    expect(cs.concept.map((c) => c.code).sort()).toEqual(Object.keys(SIGNS).sort());
    expect((await codeSystem(new NextRequest('http://localhost:3000/fhir/CodeSystem/nope'), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(404);
  });
});

describe('security headers', () => {
  it('sets CSP, framing, sniffing, referrer and permissions policies on every response', () => {
    const res = middleware(new NextRequest('http://localhost:3000/app/overview'));
    expect(res.headers.get('content-security-policy')).toBe(CSP);
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", 'https://api.open-meteo.com']) expect(CSP).toContain(d);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('permissions-policy')).toContain('camera=(self)');
  });
});

describe('production config checks', () => {
  it('flags a file database on Vercel, a missing token, a short secret and the wrong transport', () => {
    penv.VERCEL = '1'; penv.NODE_ENV = 'production';
    penv.DATABASE_URL = 'file:.data/watchdog.db'; penv.SESSION_SECRET = 'short'; delete penv.NEXT_PUBLIC_BACKEND;
    const all = configIssues().join(' ');
    expect(all).toMatch(/Turso/);
    expect(all).toMatch(/SESSION_SECRET/);
    expect(all).toMatch(/NEXT_PUBLIC_BACKEND/);
    penv.DATABASE_URL = 'libsql://watchdog-demo.turso.io'; delete penv.DATABASE_AUTH_TOKEN;
    expect(configIssues().join(' ')).toMatch(/DATABASE_AUTH_TOKEN/);
  });
  it('is clean for a complete production setup', () => {
    Object.assign(penv, {
      VERCEL: '1', NODE_ENV: 'production', DATABASE_URL: 'libsql://watchdog-demo.turso.io', DATABASE_AUTH_TOKEN: 't',
      SESSION_SECRET: 'x'.repeat(40), CRON_SECRET: 'y'.repeat(40), NEXT_PUBLIC_BACKEND: 'remote', NEXT_PUBLIC_FHIR_CANONICAL: 'https://watchdog.vercel.app/fhir',
    });
    expect(configIssues()).toEqual([]);
  });
});
