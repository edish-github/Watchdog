import { clsx, type ClassValue } from 'clsx';

export const cn = (...a: ClassValue[]) => clsx(a);
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const round = (x: number, d = 2) => { const p = 10 ** d; return Math.round(x * p) / p; };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const pad = (n: number, w = 2) => String(n).padStart(w, '0');
export const uniq = <T>(a: T[]): T[] => Array.from(new Set(a));

/** Deterministic hash → [0, 1). Used for synthetic weather and ids. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ── time ──
export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const addMs = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();
export const addH = (iso: string, h: number) => addMs(iso, h * HOUR);
export const hoursBetween = (later: string, earlier: string) => (Date.parse(later) - Date.parse(earlier)) / HOUR;
export const minIso = (a: string, b: string) => (a < b ? a : b);
export const maxIso = (a: string, b: string) => (a > b ? a : b);

export function dayAdd(date: string, n: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
}
export const dayOfYear = (date: string) => daysBetween(`${date.slice(0, 4)}-01-01`, date) + 1;

const fmts = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, tz: string, o: Intl.DateTimeFormatOptions) {
  const k = `${locale}|${tz}|${JSON.stringify(o)}`;
  let f = fmts.get(k);
  if (!f) { f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...o }); fmts.set(k, f); }
  return f;
}
/** YYYY-MM-DD of an instant in a time zone. */
export const localDate = (iso: string, tz: string) =>
  fmt('en-CA', tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

export function localHours(iso: string, tz: string) {
  const p = fmt('en-GB', tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === 'hour')?.value ?? 0);
  const m = Number(p.find((x) => x.type === 'minute')?.value ?? 0);
  return (h % 24) + m / 60;
}

/** Wall-clock time in a zone → UTC ISO. */
export function zonedToUtc(date: string, hh: number, mm: number, tz: string) {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, hh, mm);
  const p = fmt('en-CA', tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  return new Date(guess - (asUtc - guess)).toISOString();
}

type L = 'en' | 'pt' | 'nl';
const LOC: Record<L, string> = { en: 'en-US', pt: 'pt-PT', nl: 'nl-BE' };
export const fmtClock = (iso: string, tz: string) =>
  fmt('en-GB', tz, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
export function fmtDay(iso: string, tz: string, lang: L = 'en') {
  const d = new Date(iso), loc = LOC[lang];
  const wd = fmt(loc, tz, { weekday: 'short' }).format(d).replace('.', '');
  const day = fmt(loc, tz, { day: 'numeric' }).format(d);
  const mon = fmt(loc, tz, { month: 'short' }).format(d).replace('.', '');
  return `${wd} ${day} ${mon}`;
}
export const fmtWhen = (iso: string, tz: string, lang: L = 'en') => `${fmtDay(iso, tz, lang)} · ${fmtClock(iso, tz)}`;
export const weekdayLong = (iso: string, tz: string, lang: L = 'en') =>
  fmt(lang === 'en' ? 'en-GB' : LOC[lang], tz, { weekday: 'long' }).format(new Date(iso));

export function fmtSpan(hours: number) {
  const h = Math.max(0, Math.round(hours));
  if (h < 1) return `${Math.max(1, Math.round(hours * 60))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
export function fmtAgo(iso: string, now: string) {
  const m = Math.round((Date.parse(now) - Date.parse(iso)) / MIN);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  return `${fmtSpan(m / 60)} ago`;
}

// ── SHA-256 (sync, pure) — used for audit hashes and bundle fingerprints ──
let K: Uint32Array | null = null;
let H0: Uint32Array | null = null;
function initSha() {
  K = new Uint32Array(64); H0 = new Uint32Array(8);
  const isPrime = (x: number) => { for (let i = 2; i * i <= x; i++) if (x % i === 0) return false; return true; };
  for (let n = 2, c = 0; c < 64; n++) {
    if (!isPrime(n)) continue;
    if (c < 8) H0[c] = (Math.pow(n, 1 / 2) * 4294967296) | 0;
    K[c++] = (Math.pow(n, 1 / 3) * 4294967296) | 0;
  }
}
export function sha256(msg: string): string {
  if (!K || !H0) initSha();
  const k = K!, bytes = new TextEncoder().encode(msg), len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total); buf.set(bytes); buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = len * 8;
  dv.setUint32(total - 8, Math.floor(bits / 4294967296)); dv.setUint32(total - 4, bits >>> 0);
  const h = Array.from(H0!); const w = new Uint32Array(64);
  const r = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (w[i - 16] + (r(a, 7) ^ r(a, 18) ^ (a >>> 3)) + w[i - 7] + (r(b, 17) ^ r(b, 19) ^ (b >>> 10))) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
