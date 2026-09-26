import { problem } from './http';

/**
 * Sliding-window limits kept in this process's memory. On serverless each instance counts separately, so limits are
 * approximate there — enough to stop brute-forcing join codes and runaway clients, not a billing guarantee.
 */
const hits = new Map<string, number[]>();

export const LIMITS = {
  sandboxCreate: { limit: 60, windowMs: 3_600_000 }, // per IP
  join: { limit: 30, windowMs: 600_000 }, // per IP — 31^6 codes make guessing hopeless at this rate
  commands: { limit: 180, windowMs: 60_000 }, // per sandbox (the replay clock sends ≤ 12/min)
  photos: { limit: 60, windowMs: 3_600_000 }, // per sandbox
  imports: { limit: 10, windowMs: 3_600_000 }, // per sandbox
} as const;

export function rateLimit(key: string, rule: { limit: number; windowMs: number }, now = Date.now()): { ok: boolean; retryAfter: number } {
  const recent = (hits.get(key) ?? []).filter((t) => t > now - rule.windowMs);
  if (recent.length >= rule.limit) {
    hits.set(key, recent);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + rule.windowMs - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 20_000) for (const [k, v] of hits) if (!v.length || v[v.length - 1] < now - 3_600_000) hits.delete(k);
  return { ok: true, retryAfter: 0 };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'local']);
export function clientIp(req: { headers: Headers }): string {
  const xf = req.headers.get('x-forwarded-for');
  return (xf ? xf.split(',')[0].trim() : req.headers.get('x-real-ip')) || 'local';
}
/** Per-IP limits skip loopback, so local development and CI never trip them. */
export function limitIp(req: { headers: Headers }, name: 'sandboxCreate' | 'join') {
  const ip = clientIp(req);
  return LOOPBACK.has(ip) ? { ok: true, retryAfter: 0 } : rateLimit(`${name}:${ip}`, LIMITS[name]);
}

export function tooMany(retryAfter: number) {
  const res = problem(429, 'rate_limited', `Too many requests. Try again in ${retryAfter} s.`, { retryAfterSeconds: retryAfter });
  res.headers.set('Retry-After', String(retryAfter));
  return res;
}
