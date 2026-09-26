import type { Client } from '@libsql/client';
import { ApiProblem, backoff, isBusy, sleep } from './errors';
import type { Principal } from './principal';
import { audienceOf, project, type Audience, type Projection } from './projection';
import { loadDomain, readVersion } from './repo';
import { workspaceInfo, type WorkspaceInfo } from './workspaces';

export type SyncOutcome =
  | { notModified: true; version: number }
  | { notModified: false; version: number; role: Audience; workspace: WorkspaceInfo; projection: Projection };

/** 304 when the caller already has this version; otherwise the caller's projection of the workspace. */
export async function syncWorkspace(c: Client, p: Principal, since: number | null): Promise<SyncOutcome> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const v = await readVersion(c, p.workspaceId);
      if (v === null) throw new ApiProblem(404, 'not_found', 'This sandbox no longer exists (expired or deleted).');
      if (since !== null && since === v) return { notModified: true, version: v };
      const loaded = await loadDomain(c, p.workspaceId);
      if (!loaded) throw new ApiProblem(404, 'not_found', 'This sandbox no longer exists (expired or deleted).');
      if (p.kind === 'sandbox' && loaded.meta.kind !== 'demo') throw new ApiProblem(403, 'forbidden', 'Sandbox sessions cannot read the live workspace.');
      return { notModified: false, version: loaded.meta.version, role: audienceOf(p), workspace: workspaceInfo(loaded.meta), projection: project(loaded.d, p) };
    } catch (e) {
      if (isBusy(e) && attempt < 3) { await sleep(backoff(attempt)); continue; }
      throw e;
    }
  }
  throw new ApiProblem(503, 'upstream_unavailable', 'The database is busy; try again.');
}
