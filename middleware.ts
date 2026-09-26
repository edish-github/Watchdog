// Watchdog security headers — applied to every page and API response.
import { NextResponse, type NextRequest } from 'next/server';

const isDev = process.env.NODE_ENV !== 'production';
// Browser-side calls: Open-Meteo (local-mode import, GloFAS), the public HAPI sandbox (local-mode send, /metadata check).
// Add more with NEXT_PUBLIC_CSP_CONNECT="https://a https://b". Remote-mode FHIR delivery runs on the server instead.
const connect = ["'self'", 'https://api.open-meteo.com', 'https://flood-api.open-meteo.com', 'https://hapi.fhir.org', ...(process.env.NEXT_PUBLIC_CSP_CONNECT ?? '').split(/\s+/).filter(Boolean)];

export const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`, // Next.js inline bootstrap; nonce-based CSP is a later hardening step
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connect.join(' ')}${isDev ? ' ws: wss:' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
