/** npm run db:migrate — applies pending migrations to DATABASE_URL. Runs automatically on Vercel (vercel-build). */
import { existsSync, readFileSync } from 'node:fs';

if (!process.env.VERCEL) {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

async function main() {
  const { env, configIssues } = await import('../lib/server/env');
  const { openDb } = await import('../lib/server/db');
  const { migrate } = await import('../lib/server/migrations');
  const url = env.databaseUrl();
  if (env.onVercel() && url.startsWith('file:')) {
    console.error('✗ DATABASE_URL is not set to a Turso libsql:// URL for this Vercel environment. See DEPLOY.md, step 3.');
    process.exit(1);
  }
  const c = openDb(url, env.databaseAuthToken());
  await migrate(c);
  const rs = await c.execute('SELECT id FROM schema_migrations ORDER BY id');
  console.log(`✓ database ${url.startsWith('file:') ? url : url.replace(/\/\/([^.]+)/, '//$1')} · migrations: ${rs.rows.map((r) => String(r.id)).join(', ')}`);
  for (const issue of configIssues()) console.warn(`! ${issue}`);
  c.close();
}
main().catch((e) => { console.error(`✗ ${e instanceof Error ? e.message : e}`); process.exit(1); });
