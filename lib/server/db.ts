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

/** The shared client, migrated on first use in this process. */
export async function getDb(): Promise<Client> {
  const url = env.databaseUrl();
  if (env.onVercel() && url.startsWith('file:')) throw new Error('On Vercel, DATABASE_URL must be a Turso libsql:// URL (a local file would be lost on every cold start).');
  if (!g.__wdDb || g.__wdDb.url !== url) {
    const client = openDb(url, env.databaseAuthToken());
    const ready = migrate(client).catch((e) => { g.__wdDb = undefined; throw e; });
    g.__wdDb = { url, client, ready };
  }
  await g.__wdDb.ready;
  return g.__wdDb.client;
}
