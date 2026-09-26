import type { Client } from '@libsql/client';

/**
 * Versioned, append-only schema migrations. Never edit a shipped migration — add a new one.
 * Domain tables keep indexed columns for queries plus `data`: the full entity as JSON in its lib/types.ts shape.
 * `pos` preserves the domain's newest-first order exactly, so load → reduce → persist is byte-identical.
 */
const domain = (table: string, cols: string) =>
  `CREATE TABLE IF NOT EXISTS ${table} (workspace_id TEXT NOT NULL, id TEXT NOT NULL, pos INTEGER NOT NULL, ${cols}, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (workspace_id, id))`;

export const MIGRATIONS: { id: string; statements: string[] }[] = [
  {
    id: '0001_init',
    statements: [
      `CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('demo', 'live')), preset TEXT NOT NULL, join_code TEXT UNIQUE,
        start TEXT NOT NULL, now TEXT NOT NULL, autopilot INTEGER NOT NULL DEFAULT 0, cursor INTEGER NOT NULL DEFAULT 0,
        last_cycle TEXT, seq TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, pos_seq INTEGER NOT NULL DEFAULT 0,
        audit_seq INTEGER NOT NULL DEFAULT 0, audit_head TEXT NOT NULL DEFAULT '', weather_mode TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, expires_at TEXT)`,
      'CREATE INDEX IF NOT EXISTS workspaces_kind_seen ON workspaces (kind, last_seen_at)',
      'CREATE TABLE IF NOT EXISTS cities (id TEXT PRIMARY KEY, data TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, city_id TEXT NOT NULL, data TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, role TEXT NOT NULL, city_id TEXT, data TEXT NOT NULL)',
      'CREATE TABLE IF NOT EXISTS staff (clerk_user_id TEXT PRIMARY KEY, person_id TEXT NOT NULL, role TEXT NOT NULL, city_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL)',
      domain('watches', 'site_id TEXT, hazard TEXT, status TEXT'),
      domain('observations', 'site_id TEXT, status TEXT, device_id TEXT, signal_id TEXT, created_at TEXT'),
      'CREATE INDEX IF NOT EXISTS observations_site_status ON observations (workspace_id, site_id, status)',
      domain('signals', 'site_id TEXT, hazard TEXT, status TEXT, opened_at TEXT'),
      'CREATE INDEX IF NOT EXISTS signals_status ON signals (workspace_id, status)',
      domain('looks', 'site_id TEXT, assignee TEXT, status TEXT, due_at TEXT'),
      'CREATE INDEX IF NOT EXISTS looks_assignee_status ON looks (workspace_id, assignee, status)',
      domain('advisories', 'site_id TEXT, hazard TEXT, status TEXT, valid_until TEXT'),
      domain('fhir_outbox', 'site_id TEXT, status TEXT, created_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT, idempotency_key TEXT'),
      'CREATE INDEX IF NOT EXISTS fhir_outbox_due ON fhir_outbox (status, next_attempt_at)',
      domain('notices', 'at TEXT, is_read INTEGER NOT NULL DEFAULT 0'),
      `CREATE TABLE IF NOT EXISTS audit_events (workspace_id TEXT NOT NULL, id TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT NOT NULL,
        actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL,
        prev_hash TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (workspace_id, id))`,
      'CREATE UNIQUE INDEX IF NOT EXISTS audit_events_seq ON audit_events (workspace_id, seq)',
      `CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events
        BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END`,
      `CREATE TRIGGER IF NOT EXISTS audit_events_no_delete_live BEFORE DELETE ON audit_events
        WHEN (SELECT kind FROM workspaces WHERE id = OLD.workspace_id) = 'live'
        BEGIN SELECT RAISE(ABORT, 'audit_events is append-only in the live workspace'); END`,
      'CREATE TABLE IF NOT EXISTS reporters (workspace_id TEXT NOT NULL, token_hash TEXT NOT NULL, device_label TEXT NOT NULL, display_name TEXT, pet_name TEXT, role TEXT NOT NULL, person_id TEXT, locale TEXT, created_at TEXT NOT NULL, erased_at TEXT, PRIMARY KEY (workspace_id, token_hash))',
      'CREATE TABLE IF NOT EXISTS follows (workspace_id TEXT NOT NULL, token_hash TEXT NOT NULL, site_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (workspace_id, token_hash, site_id))',
      'CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, person_id TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT)',
      'CREATE TABLE IF NOT EXISTS photos (key TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, token_hash TEXT, width INTEGER, height INTEGER, bytes INTEGER, created_at TEXT NOT NULL, delete_after TEXT NOT NULL, advisory_id TEXT)',
      'CREATE TABLE IF NOT EXISTS weather_daily (city_id TEXT NOT NULL, date TEXT NOT NULL, source TEXT NOT NULL, tmax REAL, rain REAL, discharge REAL, fetched_at TEXT NOT NULL, PRIMARY KEY (city_id, date, source))',
      'CREATE TABLE IF NOT EXISTS command_log (workspace_id TEXT NOT NULL, request_id TEXT NOT NULL, action_type TEXT NOT NULL, actor TEXT, version_after INTEGER, response TEXT, created_at TEXT NOT NULL, PRIMARY KEY (workspace_id, request_id))',
      'CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start TEXT NOT NULL, count INTEGER NOT NULL)',
    ],
  },
  {
    id: '0002_photos',
    statements: [
      'ALTER TABLE photos ADD COLUMN device_id TEXT',
      'ALTER TABLE photos ADD COLUMN mime TEXT',
      'ALTER TABLE photos ADD COLUMN body BLOB',
      'CREATE INDEX IF NOT EXISTS photos_workspace_device ON photos (workspace_id, device_id)',
    ],
  },
];

export async function migrate(c: Client) {
  // Local files: WAL lets reads continue while a command commits. Remote databases manage their own journal.
  try { await c.execute('PRAGMA journal_mode = WAL'); } catch { /* not supported remotely */ }
  await c.execute('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set((await c.execute('SELECT id FROM schema_migrations')).rows.map((r) => String(r.id)));
  for (const m of MIGRATIONS) {
    if (done.has(m.id)) continue;
    await c.batch([...m.statements, { sql: 'INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)', args: [m.id, new Date().toISOString()] }], 'write');
  }
}
