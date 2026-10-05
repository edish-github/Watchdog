/** Server configuration, read at call time so tests can set process.env first. Never import from client code. */
export const env = {
  databaseUrl: () => process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:.data/watchdog.db',
  databaseAuthToken: () => process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined,
  isProd: () => process.env.NODE_ENV === 'production',
  onVercel: () => !!process.env.VERCEL,
  demoMode: () => (process.env.DEMO_MODE ?? 'true') !== 'false',
  sandboxTtlDays: () => Number(process.env.SANDBOX_TTL_DAYS || 7),
  sessionSecret: () => {
    const s = process.env.SESSION_SECRET;
    if (s && s.length >= 32) return s;
    if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set (32+ characters) in production');
    return 'dev-only-insecure-session-secret-change-me-0000';
  },
};

/** Deployment problems, as messages only (never values). Shown by /api/health and printed by npm run db:migrate. */
export function configIssues(): string[] {
  const issues: string[] = [];
  const url = env.databaseUrl();
  if (env.onVercel() && url.startsWith('file:')) issues.push('DATABASE_URL is a local file; on Vercel set it to your Turso libsql:// URL.');
  if (/^(libsql|https|wss?):/.test(url) && !env.databaseAuthToken() && !/authToken=/.test(url)) issues.push('DATABASE_AUTH_TOKEN is missing for the remote database.');
  if (env.isProd() && (process.env.SESSION_SECRET ?? '').length < 32) issues.push('SESSION_SECRET must be 32+ random characters.');
  if (env.isProd() && env.onVercel() && !process.env.CRON_SECRET) issues.push('CRON_SECRET is not set: scheduled jobs (retention, weather) are disabled.');
  if (process.env.NEXT_PUBLIC_BACKEND !== 'remote') issues.push('NEXT_PUBLIC_BACKEND is not "remote": this build keeps state in each browser only.');
  const canonical = process.env.NEXT_PUBLIC_FHIR_CANONICAL ?? '';
  if (env.onVercel() && (!canonical || /example\.(org|com|net)/.test(canonical))) issues.push('NEXT_PUBLIC_FHIR_CANONICAL should be https://<your-domain>/fhir so FHIR system URIs resolve.');
  return issues;
}
