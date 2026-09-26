import { randomBytes } from 'node:crypto';
import type { Client, InStatement } from '@libsql/client';
import type { Domain } from '../types';
import { ApiProblem } from './errors';

export const PHOTO_URL = /\/api\/photos\/([A-Za-z0-9_-]{22})/g;
export const PHOTO_KEY = /^[A-Za-z0-9_-]{22}$/;
const DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,/i;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
export const PHOTO_RETENTION_DAYS = 90;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SharpFn = (input?: Buffer, options?: Record<string, unknown>) => any;
let sharpP: Promise<SharpFn> | null = null;
/** Loaded on first use, so routes without photos never pay for the native module. */
const loadSharp = () => (sharpP ??= import('sharp').then((m) => ((m as unknown as { default?: SharpFn }).default ?? (m as unknown as SharpFn))));

/** Auto-orients, fits within 1600 px, re-encodes to JPEG. sharp drops EXIF, GPS, XMP and ICC unless asked to keep them. */
export async function reencode(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const sharp = await loadSharp();
  try {
    const { data, info } = await sharp(input, { failOn: 'error', limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new ApiProblem(422, 'invalid_action', 'A photo could not be read as an image.');
  }
}

export interface PhotoEntry { key: string; stmt: InStatement }
export interface Extracted<T> { value: T; entries: PhotoEntry[] }

/**
 * Replaces every data:image string inside `value` with /api/photos/<key>, returning the INSERTs to run in the same
 * transaction as the change. Key order of objects is preserved (domain hashes stay stable).
 */
export async function extractPhotos<T>(value: T, ctx: { workspaceId: string; deviceId: string | null }): Promise<Extracted<T>> {
  const entries: PhotoEntry[] = [];
  const created = new Date();
  const deleteAfter = new Date(created.getTime() + PHOTO_RETENTION_DAYS * 86_400_000).toISOString();
  async function walk(v: unknown): Promise<unknown> {
    if (typeof v === 'string') {
      if (!DATA_URL.test(v)) return v;
      const raw = Buffer.from(v.slice(v.indexOf(',') + 1), 'base64');
      if (raw.length > MAX_PHOTO_BYTES) throw new ApiProblem(413, 'payload_too_large', 'A photo is larger than 12 MB.');
      const img = await reencode(raw);
      const key = randomBytes(16).toString('base64url');
      entries.push({
        key,
        stmt: {
          sql: 'INSERT INTO photos (key, workspace_id, token_hash, device_id, width, height, bytes, mime, body, created_at, delete_after) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [key, ctx.workspaceId, ctx.deviceId, img.width, img.height, img.data.length, 'image/jpeg', img.data, created.toISOString(), deleteAfter],
        },
      });
      return `/api/photos/${key}`;
    }
    if (Array.isArray(v)) { const out: unknown[] = []; for (const x of v) out.push(await walk(x)); return out; }
    if (v && typeof v === 'object') { const out: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) out[k] = await walk(x); return out; }
    return v;
  }
  return { value: (await walk(value)) as T, entries };
}

/** Photo keys the domain still points at (reports, look responses, advisories). */
export const photoKeys = (d: Domain) => new Set([...JSON.stringify([d.observations, d.looks, d.advisories]).matchAll(PHOTO_URL)].map((m) => m[1]));

export const deletePhotos = (workspaceId: string, keys: string[]): InStatement => ({
  sql: `DELETE FROM photos WHERE workspace_id = ? AND key IN (${keys.map(() => '?').join(', ')})`, args: [workspaceId, ...keys],
});

export async function readPhoto(c: Client, key: string): Promise<{ mime: string; body: ArrayBuffer; workspaceId: string } | null> {
  if (!PHOTO_KEY.test(key)) return null;
  const rs = await c.execute({ sql: 'SELECT mime, body, workspace_id FROM photos WHERE key = ? AND body IS NOT NULL', args: [key] });
  const r = rs.rows[0];
  return r ? { mime: String(r.mime ?? 'image/jpeg'), body: r.body as ArrayBuffer, workspaceId: String(r.workspace_id) } : null;
}
