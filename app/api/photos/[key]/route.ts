import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/server/db';
import { problem, respondError } from '@/lib/server/http';
import { PHOTO_KEY, readPhoto } from '@/lib/server/photos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves a stored, re-encoded photo. The 128-bit key is the capability (unguessable, never listed publicly).
 * B6 adds a staff check for photos in the live workspace.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    if (!PHOTO_KEY.test(key)) return problem(404, 'not_found', 'No such photo.');
    const photo = await readPhoto(await getDb(), key);
    if (!photo) return problem(404, 'not_found', 'No such photo (it may have been erased or expired).');
    return new NextResponse(photo.body, {
      headers: {
        'Content-Type': photo.mime,
        'Content-Length': String(photo.body.byteLength),
        'Cache-Control': 'private, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
      },
    });
  } catch (e) {
    return respondError(e);
  }
}
