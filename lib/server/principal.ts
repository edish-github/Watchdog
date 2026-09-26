import { WS_COOKIE, unsign } from './session';

/** Who is calling. B3 adds devices (walkers, volunteers); B6 adds signed-in staff. */
export type Principal = { kind: 'sandbox'; workspaceId: string };

export function sandboxPrincipal(cookie: string | undefined | null): Principal | null {
  const id = unsign(cookie);
  return id ? { kind: 'sandbox', workspaceId: id } : null;
}

type CookieJar = { cookies: { get(name: string): { value: string } | undefined } };
export const principalFromRequest = (req: CookieJar) => sandboxPrincipal(req.cookies.get(WS_COOKIE)?.value);
