const { createClient } = require('@libsql/client');

const url = process.env.DATABASE_URL || 'file:portfolios.db';
const authToken = process.env.DATABASE_AUTH_TOKEN || undefined;

const db = createClient({ url, authToken });

let migrated = false;
async function migrate() {
  if (migrated) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS portfolios (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      holdings TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  migrated = true;
}

module.exports = { db, migrate };
