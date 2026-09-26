import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';

export const WS_COOKIE = 'wd_ws';

const mac = (value: string) => createHmac('sha256', env.sessionSecret()).update(value).digest('base64url');
/** value.signature — tamper-evident, not encrypted. */
export const sign = (value: string) => `${value}.${mac(value)}`;
export function unsign(token: string | undefined | null): string | null {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const value = token.slice(0, i);
  const a = Buffer.from(token), b = Buffer.from(sign(value));
  return a.length === b.length && timingSafeEqual(a, b) ? value : null;
}
/** Secure in production; COOKIE_SECURE=false lets a phone on plain-http LAN keep the cookie while testing. */
export const wsCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : env.isProd(),
  path: '/',
  maxAge: env.sandboxTtlDays() * 86_400,
});
