import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'data/db.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const sqlite = new Database(DB_PATH);

sqlite.exec(`
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  symbol TEXT DEFAULT 'MNQ',
  side TEXT NOT NULL,
  entry_time TEXT NOT NULL,
  entry_price REAL NOT NULL,
  exit_time TEXT,
  exit_price REAL,
  qty INTEGER NOT NULL,
  fuel_top REAL,
  fuel_bottom REAL,
  fuel REAL,
  sl_price REAL,
  tp1 REAL,
  tp2 REAL,
  tp3 REAL,
  broker TEXT DEFAULT 'Manual',
  fee REAL,
  notes TEXT,
  strategy TEXT,
  external_trade_ids TEXT,
  trade_group_id TEXT,
  external_account_id TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS trades_date_idx ON trades(date);
CREATE INDEX IF NOT EXISTS trades_entry_time_idx ON trades(entry_time);
CREATE INDEX IF NOT EXISTS trades_date_entry_time_idx ON trades(date, entry_time);
CREATE INDEX IF NOT EXISTS trades_group_id_idx ON trades(trade_group_id);

CREATE TABLE IF NOT EXISTS market_events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT,
  severity TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS market_events_start_date_idx ON market_events(start_date);
CREATE INDEX IF NOT EXISTS market_events_end_date_idx ON market_events(end_date);

CREATE TABLE IF NOT EXISTS strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#5E6AD2',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS strategies_enabled_sort_idx ON strategies(enabled, sort_order);

CREATE TABLE IF NOT EXISTS brokers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS brokers_enabled_sort_idx ON brokers(enabled, sort_order);

CREATE TABLE IF NOT EXISTS broker_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  broker_id TEXT NOT NULL REFERENCES brokers(id),
  symbol TEXT NOT NULL,
  fee_per_contract REAL NOT NULL,
  created_at TEXT,
  updated_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS broker_fees_broker_symbol_uidx ON broker_fees(broker_id, symbol);

CREATE TABLE IF NOT EXISTS products (
  symbol TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_zh TEXT NOT NULL,
  tick_size REAL NOT NULL,
  point_value REAL NOT NULL,
  price_step REAL NOT NULL,
  owner_only INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS products_enabled_sort_idx ON products(enabled, sort_order);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  original_name TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  url_path TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  uploaded_by TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS trade_groups (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_time_first TEXT NOT NULL,
  entry_time_last TEXT NOT NULL,
  entry_price_min REAL NOT NULL,
  entry_price_max REAL NOT NULL,
  entry_price_avg REAL NOT NULL,
  total_qty INTEGER NOT NULL,
  exit_time_first TEXT,
  exit_time_last TEXT,
  exit_price_min REAL,
  exit_price_max REAL,
  exit_price_avg REAL,
  total_exit_qty INTEGER,
  is_closed INTEGER NOT NULL DEFAULT 0,
  sl_price REAL,
  tp1 REAL,
  tp2 REAL,
  tp3 REAL,
  fuel_top REAL,
  fuel_bottom REAL,
  fuel REAL,
  broker TEXT,
  fee_total REAL,
  notes TEXT,
  strategy TEXT,
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS trade_groups_date_idx ON trade_groups(date);
CREATE INDEX IF NOT EXISTS trade_groups_symbol_side_idx ON trade_groups(symbol, side);
CREATE INDEX IF NOT EXISTS trade_groups_strategy_idx ON trade_groups(strategy);

CREATE TABLE IF NOT EXISTS trade_legs (
  id TEXT PRIMARY KEY,
  trade_group_id TEXT NOT NULL REFERENCES trade_groups(id) ON DELETE CASCADE,
  leg_type TEXT NOT NULL,
  fill_time TEXT NOT NULL,
  fill_price REAL NOT NULL,
  qty INTEGER NOT NULL,
  fee REAL DEFAULT 0,
  external_trade_id TEXT,
  external_order_id TEXT,
  matched_entry_leg_id TEXT,
  pnl_points REAL,
  pnl_amount REAL,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS trade_legs_group_idx ON trade_legs(trade_group_id);
CREATE INDEX IF NOT EXISTS trade_legs_external_trade_idx ON trade_legs(external_trade_id);
CREATE INDEX IF NOT EXISTS trade_legs_external_order_idx ON trade_legs(external_order_id);
CREATE INDEX IF NOT EXISTS trade_legs_fill_time_idx ON trade_legs(fill_time);
`);

const now = new Date().toISOString();
sqlite.prepare(`
  INSERT OR IGNORE INTO products
    (symbol, name, name_zh, tick_size, point_value, price_step, owner_only, enabled, sort_order, created_at, updated_at)
  VALUES
    ('MNQ', 'Micro E-mini Nasdaq-100', 'Micro E-mini Nasdaq-100', 0.25, 2, 0.25, 0, 1, 1, @now, @now),
    ('NQ', 'E-mini Nasdaq-100', 'E-mini Nasdaq-100', 0.25, 20, 0.25, 0, 1, 2, @now, @now),
    ('SIL', 'Micro Silver', 'Micro Silver', 0.5, 10, 0.5, 0, 1, 3, @now, @now)
`).run({ now });
sqlite.prepare(`
  INSERT OR IGNORE INTO brokers (id, name, enabled, sort_order, created_at, updated_at)
  VALUES ('manual', 'Manual', 1, 1, @now, @now)
`).run({ now });
for (const symbol of ['MNQ', 'NQ', 'SIL']) {
  sqlite.prepare(`
    INSERT OR IGNORE INTO broker_fees (broker_id, symbol, fee_per_contract, created_at, updated_at)
    VALUES ('manual', @symbol, 0, @now, @now)
  `).run({ symbol, now });
}
sqlite.prepare(`
  INSERT OR IGNORE INTO strategies (name, enabled, sort_order, color, is_default, created_at, updated_at)
  VALUES ('Default', 1, 1, '#5E6AD2', 1, @now, @now)
`).run({ now });

// All areas singleton, avoid Next.js dev mode Repeated connections during hot reload
const globalForDb = global as unknown as { _db?: ReturnType<typeof drizzle> };

export const db = globalForDb._db ?? drizzle(sqlite, { schema });
if (process.env.NODE_ENV !== 'production') globalForDb._db = db;
