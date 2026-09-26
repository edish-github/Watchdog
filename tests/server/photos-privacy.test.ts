import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@libsql/client';
import type { Domain } from '@/lib/types';
import { GET as getPhoto } from '@/app/api/photos/[key]/route';
import { executeCommand, validateEnvelope } from '@/lib/server/commands';
import { getDb } from '@/lib/server/db';
import { validateDomain } from '@/lib/server/domain-shape';
import { ApiProblem } from '@/lib/server/errors';
import { PHOTO_URL, extractPhotos, readPhoto } from '@/lib/server/photos';
import type { Principal } from '@/lib/server/principal';
import { rateLimit } from '@/lib/server/ratelimit';
import { loadDomain, stripTransient, verifyAuditChain } from '@/lib/server/repo';
import { createSandbox, importSandbox } from '@/lib/server/workspaces';
import { buildScenario, type Action } from '@/lib/sim';
import type { AnyAction } from '@/lib/transport';
import { sha256 } from '@/lib/utils';
import { syntheticWeather, withWeather } from '@/lib/weather';

const dir = mkdtempSync(join(tmpdir(), 'watchdog-photos-'));
let c: Client;
beforeAll(async () => { process.env.DATABASE_URL = `file:${join(dir, 'photos.db')}`; c = await getDb(); });
afterAll(() => { c?.close(); rmSync(dir, { recursive: true, force: true }); });

let n = 0;
const rid = () => `photo-${process.pid}-${Date.now()}-${n++}`;
const as = (workspaceId: string): Principal => ({ kind: 'sandbox', workspaceId });
const run = (id: string, action: AnyAction) => executeCommand(c, as(id), validateEnvelope({ requestId: rid(), baseVersion: null, action }));
const keysIn = (v: unknown) => [...JSON.stringify(v).matchAll(PHOTO_URL)].map((m) => m[1]);
const hash = (d: Domain) => sha256(JSON.stringify(stripTransient(d)));

/** A small JPEG that carries EXIF, the way a phone camera's would. */
const jpegWithExif = () =>
  sharp({ create: { width: 96, height: 64, channels: 3, background: { r: 40, g: 120, b: 90 } } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: 'WatchdogTest', Model: 'Phone with GPS' } } })
    .toBuffer();
const dataUrl = (b: Buffer) => `data:image/jpeg;base64,${b.toString('base64')}`;
const report = (deviceId: string, signs: string[], photo?: string) =>
  ({ type: 'observation/submit', input: { siteId: 'COI-03', deviceId, displayName: 'Photo test', role: 'walker', signs, source: 'pwa', ...(photo ? { photo: { dataUrl: photo, width: 96, height: 64 } } : {}) } }) as unknown as Action;

describe('photos', () => {
  it('re-encodes a report photo on the server: no EXIF, stored outside the projection', async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const { meta } = await createSandbox(c, 'day2');
    const r = await run(meta.id, report('anon-photo', ['floating_scum'], dataUrl(input)));
    expect(JSON.stringify(r.projection)).not.toContain('data:image');
    const [key] = keysIn(r.projection);
    expect(key).toBeTruthy();
    const stored = await readPhoto(c, key);
    expect(stored?.mime).toBe('image/jpeg');
    expect((await sharp(Buffer.from(stored!.body)).metadata()).exif).toBeUndefined();

    const res = await getPhoto(new NextRequest(`http://localhost:3000/api/photos/${key}`), { params: Promise.resolve({ key }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect((await getPhoto(new NextRequest('http://localhost:3000/api/photos/nope'), { params: Promise.resolve({ key: 'nope' }) })).status).toBe(404);
  });

  it('refuses a data URL that is not an image', async () => {
    const { meta } = await createSandbox(c, 'day2');
    await expect(run(meta.id, report('anon-junk', ['floating_scum'], `data:image/jpeg;base64,${Buffer.from('not an image').toString('base64')}`))).rejects.toMatchObject({ status: 422 });
  });
});

describe('device erasure on the server', () => {
  it('removes the device from every report and deletes photos nothing points at any more', async () => {
    const { meta } = await createSandbox(c, 'day2');
    const r = await run(meta.id, report('anon-erase', ['oily_sheen'], dataUrl(await jpegWithExif())));
    const [key] = keysIn(r.projection);
    expect(await readPhoto(c, key)).not.toBeNull();
    const erased = await run(meta.id, { type: 'device/erase', deviceId: 'anon-erase', names: [] });
    expect(erased.applied).toBe(true);
    expect(erased.projection.observations.some((o) => o.deviceId === 'anon-erase')).toBe(false);
    if (!keysIn(erased.projection).includes(key)) expect(await readPhoto(c, key)).toBeNull();
  });

  it('validates the erase request', () => {
    expect(() => validateEnvelope({ requestId: rid(), action: { type: 'device/erase', deviceId: '../../etc', names: [] } })).toThrow(ApiProblem);
    expect(() => validateEnvelope({ requestId: rid(), action: { type: 'device/erase', deviceId: 'anon-1', names: ['a', 'b', 'c', 'd', 'e', 'f'] } })).toThrow(ApiProblem);
  });
});

describe('import', () => {
  it('replaces the world exactly, moves photos out, and rebuilds the audit chain', async () => {
    const { meta } = await createSandbox(c, 'day2');
    const raw = JSON.parse(JSON.stringify(withWeather(syntheticWeather, () => buildScenario('day3'))));
    raw.observations[0].photo = { dataUrl: dataUrl(await jpegWithExif()), width: 96, height: 64 };
    const photos = await extractPhotos(validateDomain(raw), { workspaceId: meta.id, deviceId: null });
    const { meta: after } = await importSandbox(c, meta.id, photos.value, photos.entries.map((x) => x.stmt));
    expect(after.joinCode).toBe(meta.joinCode);
    const loaded = (await loadDomain(c, meta.id))!;
    expect(hash(loaded.d)).toBe(hash(photos.value));
    expect(JSON.stringify(loaded.d)).not.toContain('data:image');
    expect(await readPhoto(c, keysIn(loaded.d)[0])).not.toBeNull();
    expect((await verifyAuditChain(c, meta.id)).ok).toBe(true);
  });

  it('refuses files that are not a Watchdog state', () => {
    expect(() => validateDomain({ hello: 'world' })).toThrow(/Import refused/);
    const dup = JSON.parse(JSON.stringify(buildScenario('day1')));
    dup.watches = [...dup.watches, ...dup.watches.slice(0, 1)];
    if (dup.watches.length > 1) expect(() => validateDomain(dup)).toThrow(/duplicate/);
  });
});

describe('rate limits', () => {
  it('allows up to the limit in a window, then refuses with a retry time', () => {
    const rule = { limit: 2, windowMs: 1_000 };
    const k = `test-${Date.now()}`;
    expect(rateLimit(k, rule, 0).ok).toBe(true);
    expect(rateLimit(k, rule, 100).ok).toBe(true);
    const third = rateLimit(k, rule, 200);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
    expect(rateLimit(k, rule, 1_200).ok).toBe(true);
  });
});
