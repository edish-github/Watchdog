import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as postCommand } from '@/app/api/commands/route';
import { POST as postJoin } from '@/app/api/join/route';
import { GET as getSync } from '@/app/api/sync/route';
import { POST as postReset } from '@/app/api/workspaces/current/reset/route';
import { POST as postWorkspace } from '@/app/api/workspaces/route';
import { GET as joinByLink } from '@/app/join/[code]/route';

// The real route handlers, end to end, against a temp database (getDb reads DATABASE_URL at call time).
const dir = mkdtempSync(join(tmpdir(), 'watchdog-routes-'));
beforeAll(() => { process.env.DATABASE_URL = `file:${join(dir, 'routes.db')}`; });
afterAll(() => {
  (globalThis as unknown as { __wdDb?: { client: { close(): void } } }).__wdDb?.client.close();
  rmSync(dir, { recursive: true, force: true });
});

const url = (p: string) => `http://localhost:3000${p}`;
const req = (path: string, o: { method?: string; body?: unknown; raw?: string; cookie?: string } = {}) =>
  new NextRequest(url(path), {
    method: o.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(o.cookie ? { cookie: `wd_ws=${o.cookie}` } : {}) },
    body: o.raw ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
  });
const report = { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-route', displayName: 'Route test', role: 'walker', signs: ['floating_scum'], source: 'pwa' } };

let cookie = '', code = '', id = '';

describe('HTTP API', () => {
  it('POST /api/workspaces creates a sandbox and sets a signed cookie', async () => {
    const res = await postWorkspace(req('/api/workspaces', { method: 'POST', body: { preset: 'day2' } }));
    expect(res.status).toBe(201);
    const body = await res.json();
    id = body.id; code = body.joinCode; cookie = res.cookies.get('wd_ws')!.value;
    expect(cookie.startsWith(`${id}.`)).toBe(true);
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('GET /api/sync returns the projection, then 304 at the same version', async () => {
    const full = await getSync(req('/api/sync', { cookie }));
    expect(full.status).toBe(200);
    const body = await full.json();
    expect(body.version).toBe(1);
    expect(body.workspace.id).toBe(id);
    expect(Array.isArray(body.projection.signals)).toBe(true);
    expect((await getSync(req('/api/sync?since=1', { cookie }))).status).toBe(304);
  });

  it('POST /api/commands applies an action and moves the version', async () => {
    const res = await postCommand(req('/api/commands', { method: 'POST', cookie, body: { requestId: 'route-test-0001', baseVersion: 1, action: report } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applied).toBe(true);
    expect(body.version).toBe(2);
    expect(res.headers.get('x-workspace-version')).toBe('2');
    expect((await getSync(req('/api/sync?since=1', { cookie }))).status).toBe(200);
  });

  it('refuses callers without a valid cookie, and malformed bodies', async () => {
    expect((await postCommand(req('/api/commands', { method: 'POST', body: { requestId: 'route-test-0002', action: report } }))).status).toBe(401);
    const tampered = cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA');
    expect((await getSync(req('/api/sync', { cookie: tampered }))).status).toBe(401);
    const bad = await postCommand(req('/api/commands', { method: 'POST', cookie, raw: '{not json' }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe('invalid_action');
  });

  it('POST /api/workspaces/current/reset keeps the join code and returns the new state', async () => {
    const res = await postReset(req('/api/workspaces/current/reset', { method: 'POST', cookie, body: { preset: 'day1' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.workspace.joinCode).toBe(code);
    expect(body.version).toBeGreaterThan(2);
    expect(body.projection.preset).toBe('day1');
  });

  it('GET /join/[code] attaches another browser and redirects to a safe path', async () => {
    const res = await joinByLink(req(`/join/${code.toLowerCase()}?to=/app`), { params: Promise.resolve({ code: code.toLowerCase() }) });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(url('/app'));
    expect(res.cookies.get('wd_ws')?.value).toBe(cookie);
    const evil = await joinByLink(req(`/join/${code}?to=//evil.example`), { params: Promise.resolve({ code }) });
    expect(evil.headers.get('location')).toBe(url('/observe'));
  });

  it('POST /api/join refuses an unknown code', async () => {
    const res = await postJoin(req('/api/join', { method: 'POST', body: { code: 'ZZZZZZ' } }));
    expect(res.status).toBe(404);
  });
});
