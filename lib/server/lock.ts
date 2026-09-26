import type { Client } from '@libsql/client';

const chains = new WeakMap<Client, Promise<unknown>>();

/**
 * Serialises writes per client inside this process. SQLite has a single writer; queuing here means BEGIN IMMEDIATE
 * never races within a process (and avoids a @libsql/client quirk where a failed BEGIN leaves the connection busy).
 * Never call withWriteLock from inside withWriteLock on the same client: it would wait for itself.
 */
export function withWriteLock<T>(c: Client, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(c) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  chains.set(c, run.catch(() => undefined));
  return run;
}
