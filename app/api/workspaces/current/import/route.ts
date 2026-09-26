import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { validateDomain } from '@/lib/server/domain-shape';
import { ApiProblem } from '@/lib/server/errors';
import { noStore, problem, respondError } from '@/lib/server/http';
import { extractPhotos } from '@/lib/server/photos';
import { principalFromRequest } from '@/lib/server/principal';
import { LIMITS, rateLimit, tooMany } from '@/lib/server/ratelimit';
import { importSandbox, workspaceInfo } from '@/lib/server/workspaces';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_IMPORT_BYTES = 4_000_000;

/** Settings → Import: replaces this sandbox's world with an exported state file. */
export async function POST(req: NextRequest) {
  try {
    const p = principalFromRequest(req);
    if (!p) return problem(401, 'unauthenticated', 'No sandbox attached to this browser.');
    const limit = rateLimit(`import:${p.workspaceId}`, LIMITS.imports);
    if (!limit.ok) return tooMany(limit.retryAfter);
    const text = await req.text();
    if (text.length > MAX_IMPORT_BYTES) return problem(413, 'payload_too_large', 'The state file is larger than 4 MB.');
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new ApiProblem(400, 'invalid_action', 'The body is not valid JSON.'); }
    const domain = validateDomain((body as { domain?: unknown } | null)?.domain);
    const photos = await extractPhotos(domain, { workspaceId: p.workspaceId, deviceId: null });
    const { meta, d } = await importSandbox(await getDb(), p.workspaceId, photos.value, photos.entries.map((x) => x.stmt));
    return NextResponse.json({ version: meta.version, workspace: workspaceInfo(meta), projection: d }, { headers: { ...noStore, 'X-Workspace-Version': String(meta.version) } });
  } catch (e) {
    return respondError(e);
  }
}
