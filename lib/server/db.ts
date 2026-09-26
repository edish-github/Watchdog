import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient, type Client } from '@libsql/client';
import { env } from './env';
import { migrate } from './migrations';

/** Opens a libSQL client; for local files, makes sure the folder exists. */
export function openDb(url: string, authToken?: string): Client {
  if (url.startsWith('file:') && !url.includes(':memory:')) {
    const path = url.slice('file:'.length);
    const dir = dirname(path);
    if (dir && dir !== '.') mkdirSync(dir, { recursive: true });
  }
  return createClient({ url, authToken });
}

// Cached on globalThis so Next's dev hot-reload does not open a new client per edit.
const g = globalThis as unknown as { __wdDb?: { url: string; client: Client; ready: Promise<void> } };
