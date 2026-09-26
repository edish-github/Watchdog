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
