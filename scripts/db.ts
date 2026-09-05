// Dev/test database helper using embedded PostgreSQL.
// Starts a project-local Postgres instance (binaries inside node_modules,
// data inside .local/postgres-data). No system-wide install required.
//
// Usage:
//   npm run db:start            -> start and keep running (default)
//   npm run db:start -- --once  -> start, create databases, then exit
import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = Number(process.env.DB_PORT ?? 5433);
const ROOT = resolve(import.meta.dirname, '..');
const DATA_DIR = join(ROOT, '.local', 'postgres-data');
const DB_USER = process.env.DB_USER ?? 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
const DATABASES = ['egopay_bank', 'egopay_bank_test'];

mkdirSync(join(ROOT, '.local'), { recursive: true });

async function main() {
  console.log(`[db] starting embedded PostgreSQL on 127.0.0.1:${PORT} (data: ${DATA_DIR})`);
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: DB_USER,
    password: DB_PASSWORD,
    port: PORT,
    persistent: true,
    // Force UTF8 + C locale: without this, initdb on a Windows machine picks
    // the OS locale (e.g. WIN1252), which cannot store non-Latin-1 characters
    // such as the naira sign used in notification messages.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  if (!existsSync(join(DATA_DIR, 'PG_VERSION'))) {
    console.log('[db] initialising data directory (first run)...');
    await pg.initialise();
  } else {
    console.log('[db] data directory already initialised');
  }

  await pg.start();
  console.log('[db] postgres is up');

  // Create application databases if missing (createDatabase is a no-op when the db exists).
  for (const db of DATABASES) {
    try {
      await pg.createDatabase(db);
      console.log(`[db] ensured database '${db}'`);
    } catch (err) {
      // "database already exists" is fine; anything else is fatal
      const msg = String(err);
      if (!/already exists/i.test(msg)) throw err;
      console.log(`[db] database '${db}' already exists`);
    }
  }

  console.log('[db] databases ready:', DATABASES.join(', '));

  if (process.argv.includes('--once')) {
    await pg.stop();
    console.log('[db] stopped (--once)');
    process.exit(0);
  }

  console.log(`[db] running. Press Ctrl+C to stop. Connect with postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/egopay_bank`);

  const stop = async () => {
    console.log('\n[db] stopping...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error('[db] failed:', err);
  process.exit(1);
});