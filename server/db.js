import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(join(DATA_DIR, "plaid.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS plaid_items (
    id          TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    institution_id   TEXT,
    institution_name TEXT,
    created_at  INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS plaid_accounts (
    plaid_account_id TEXT PRIMARY KEY,
    item_id          TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
    ft_account_id    TEXT,
    name             TEXT,
    official_name    TEXT,
    type             TEXT,
    subtype          TEXT,
    mask             TEXT
  );

  CREATE TABLE IF NOT EXISTS plaid_sync_cursors (
    item_id TEXT PRIMARY KEY REFERENCES plaid_items(id) ON DELETE CASCADE,
    cursor  TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS plaid_transactions (
    plaid_id         TEXT PRIMARY KEY,
    plaid_account_id TEXT NOT NULL REFERENCES plaid_accounts(plaid_account_id) ON DELETE CASCADE,
    ft_account_id    TEXT,
    date             TEXT NOT NULL,
    description      TEXT,
    amount           REAL NOT NULL,
    type             TEXT,
    category         TEXT,
    pending          INTEGER DEFAULT 0,
    synced_at        INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS plaid_transaction_overrides (
    plaid_id   TEXT PRIMARY KEY REFERENCES plaid_transactions(plaid_id) ON DELETE CASCADE,
    category   TEXT,
    subcategory TEXT,
    notes      TEXT,
    updated_at INTEGER DEFAULT (unixepoch())
  );
`);

// Migrations for columns added after initial release
try { db.exec(`ALTER TABLE plaid_sync_cursors ADD COLUMN last_synced_at INTEGER`); } catch {}
// reconciled in data layer = "reviewed" in the UI
try { db.exec(`ALTER TABLE plaid_transaction_overrides ADD COLUMN reconciled INTEGER DEFAULT 0`); } catch {}

export default db;
