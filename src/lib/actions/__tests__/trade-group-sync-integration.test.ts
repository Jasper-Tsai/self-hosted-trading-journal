/**
 * trade-group-sync-integration.test.ts
 *
 * Real better-sqlite3 :memory: DB — exercises the actual sync constraint that
 * the mocked unit test cannot catch.
 *
 * 1. Insert 2 trades sharing a trade_group_id, then call
 *    db.transaction((tx) => { rebuildTradeGroup(tx, gid); }).
 *    Assert trade_groups row has correct total_qty / entry_price_avg
 *    and trade_legs has 2 entry legs.
 *
 * 2. Regression guard: wrapping the callback in `async` throws
 *    "Transaction function cannot return a promise".
 */

import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { describe, it, expect, beforeAll } from 'vitest';

// ─── Minimal DDL (3 tables only) ─────────────────────────────────────────────

const DDL = `
PRAGMA foreign_keys = ON;

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
  fuel_top REAL, fuel_bottom REAL, fuel REAL,
  sl_price REAL, tp1 REAL, tp2 REAL, tp3 REAL,
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
  sl_price REAL, tp1 REAL, tp2 REAL, tp3 REAL,
  fuel_top REAL, fuel_bottom REAL, fuel REAL,
  broker TEXT,
  fee_total REAL,
  notes TEXT,
  strategy TEXT,
  created_at TEXT,
  updated_at TEXT
);

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
`;

// ─── Build the test DB once for this suite ────────────────────────────────────

const sqlite = new Database(':memory:');
sqlite.exec(DDL);
const testDb = drizzle(sqlite);

// ─── Import rebuildTradeGroup directly — it only uses the `tx` argument ──────
// We do NOT mock @/lib/db here: rebuildTradeGroup receives `tx` as a parameter
// and never imports db itself, so no module mock is needed.

import { rebuildTradeGroup } from '@/lib/actions/trade-group-sync';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('rebuildTradeGroup — real SQLite integration', () => {
  const gid = 'group-integration-1';
  const now = new Date().toISOString();

  beforeAll(() => {
    // Insert 2 trades sharing gid via raw SQL (avoids importing schema module
    // which would pull in local app setup that isn't available in test env)
    sqlite.prepare(
      `INSERT INTO trades
         (id, date, symbol, side, entry_time, entry_price, qty, broker, fee, strategy, trade_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('t-int-1', '2026-04-29', 'MNQ', 'LONG', '2026-04-29T14:00:00', 20000, 1, 'IB', 1.70, 'STAR', gid, now, now);

    sqlite.prepare(
      `INSERT INTO trades
         (id, date, symbol, side, entry_time, entry_price, qty, broker, fee, strategy, trade_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('t-int-2', '2026-04-29', 'MNQ', 'LONG', '2026-04-29T14:05:00', 20010, 1, 'IB', 1.70, 'STAR', gid, now, now);
  });

  it('rebuilds group inside sync transaction: total_qty=2, entry_price_avg=20005, 2 entry legs', () => {
    // This is the critical test: db.transaction with a SYNC callback must not throw.
    testDb.transaction((tx) => {
      rebuildTradeGroup(tx, gid);
    });

    // Verify trade_groups row
    const group = sqlite.prepare('SELECT * FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(group, 'trade_groups row should exist').toBeDefined();
    expect(group.total_qty).toBe(2);
    // VWAP = (1×20000 + 1×20010) / 2 = 20005
    expect(group.entry_price_avg).toBe(20005);
    expect(group.entry_price_min).toBe(20000);
    expect(group.entry_price_max).toBe(20010);
    expect(group.is_closed).toBe(0); // no exits → open

    // Verify trade_legs: 2 entry legs (different time+price → not deduplicated)
    const legs = sqlite
      .prepare('SELECT * FROM trade_legs WHERE trade_group_id = ?')
      .all(gid) as Record<string, unknown>[];
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.leg_type === 'entry')).toBe(true);
  });

  it('regression guard: async callback throws "Transaction function cannot return a promise"', () => {
    const guardSqlite = new Database(':memory:');
    guardSqlite.exec(DDL);
    const guardDb = drizzle(guardSqlite);

    expect(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (guardDb as any).transaction(async () => {});
    }).toThrow(/cannot return a promise/i);
  });
});

// ─── 備注保留不變式 integration 測試 ────────────────────────────────────────────

describe('rebuildTradeGroup — 備注保留不變式 (real SQLite, SPEC §4.2)', () => {
  const now = new Date().toISOString();

  it('重建保留既有 trade_groups.notes：不被 first.notes 覆蓋', () => {
    const s_notes = new Database(':memory:');
    s_notes.exec(DDL);
    const testDbNotes = drizzle(s_notes);

    const gid = 'notes-preserve-test';

    // 插入 trade（notes = '種子備注'）
    s_notes.prepare(
      `INSERT INTO trades (id, date, symbol, side, entry_time, entry_price, qty, broker, fee, notes, trade_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('t-np-1', '2026-05-21', 'MNQ', 'LONG', '2026-05-21T14:00:00', 21000, 1, 'IB', 1.70, '種子備注', gid, now, now);

    // 第一次 rebuild → 從 first.notes 種子建立
    testDbNotes.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    const afterFirst = s_notes.prepare('SELECT notes FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(afterFirst.notes).toBe('種子備注');

    // 模擬使用者在卡片上編輯備注
    s_notes.prepare('UPDATE trade_groups SET notes=? WHERE id=?').run('使用者手動改的備注', gid);

    // 第二次 rebuild（模擬 trade 被更新觸發 rebuild）→ 應保留使用者編輯的備注
    testDbNotes.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    const afterSecond = s_notes.prepare('SELECT notes FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(afterSecond.notes).toBe('使用者手動改的備注');
  });

  it('群組 notes 為 null 時：重建後保留 null，不被 first.notes 覆蓋', () => {
    const s_notes2 = new Database(':memory:');
    s_notes2.exec(DDL);
    const testDbNotes2 = drizzle(s_notes2);

    const gid = 'notes-null-preserve-test';

    s_notes2.prepare(
      `INSERT INTO trades (id, date, symbol, side, entry_time, entry_price, qty, broker, fee, notes, trade_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('t-nn-1', '2026-05-21', 'MNQ', 'LONG', '2026-05-21T15:00:00', 21100, 1, 'IB', 1.70, '有種子備注', gid, now, now);

    // 第一次 rebuild → 從 first.notes 種子建立
    testDbNotes2.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    // 模擬使用者把備注清空（設為 null）
    s_notes2.prepare('UPDATE trade_groups SET notes=NULL WHERE id=?').run(gid);

    // 第二次 rebuild → 應保留 null，不被 first.notes='有種子備注' 蓋回來
    testDbNotes2.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    const afterSecond = s_notes2.prepare('SELECT notes FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(afterSecond.notes).toBeNull();
  });

  it('首次建立（無既有 group row）：從 first.notes 種子帶入', () => {
    const s_notes3 = new Database(':memory:');
    s_notes3.exec(DDL);
    const testDbNotes3 = drizzle(s_notes3);

    const gid = 'notes-seed-test';

    s_notes3.prepare(
      `INSERT INTO trades (id, date, symbol, side, entry_time, entry_price, qty, broker, fee, notes, trade_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('t-ns-1', '2026-05-21', 'MNQ', 'LONG', '2026-05-21T16:00:00', 21200, 1, 'IB', 1.70, '首次種子備注', gid, now, now);

    // 首次 rebuild（無既有 group row）→ 應從 first.notes 帶入
    testDbNotes3.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    const row = s_notes3.prepare('SELECT notes FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(row.notes).toBe('首次種子備注');
  });
});

// ─── 策略保留不變式 integration 測試 ────────────────────────────────────────────

describe('rebuildTradeGroup — 策略保留不變式 (real SQLite)', () => {
  const now = new Date().toISOString();

  it('重建保留既有 trade_groups.strategy：不被 first.strategy 覆蓋', () => {
    // 用獨立 :memory: DB 避免與其他 suite 衝突
    const s2 = new Database(':memory:');
    s2.exec(DDL);
    const testDb2 = drizzle(s2);

    const gid = 'strategy-preserve-test';

    // 插入 trade（strategy = 'STAR'）
    s2.prepare(
      `INSERT INTO trades (id, date, symbol, side, entry_time, entry_price, qty, broker, fee, strategy, trade_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('t-sp-1', '2026-05-20', 'MNQ', 'LONG', '2026-05-20T14:00:00', 21000, 1, 'IB', 1.70, 'STAR', gid, now, now);

    // 第一次 rebuild → 從 first.strategy 種子建立，strategy='STAR'
    testDb2.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    const afterFirst = s2.prepare('SELECT strategy FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(afterFirst.strategy).toBe('STAR');

    // 模擬使用者編輯策略為 'COW'
    s2.prepare('UPDATE trade_groups SET strategy=? WHERE id=?').run('COW', gid);

    // 第二次 rebuild（模擬 trade 被更新觸發 rebuild）→ 應保留 'COW'
    testDb2.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    const afterSecond = s2.prepare('SELECT strategy FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(afterSecond.strategy).toBe('COW');
  });

  it('首次建立（無既有 group row）：從 first.strategy 種子帶入', () => {
    const s3 = new Database(':memory:');
    s3.exec(DDL);
    const testDb3 = drizzle(s3);

    const gid = 'strategy-seed-test';

    s3.prepare(
      `INSERT INTO trades (id, date, symbol, side, entry_time, entry_price, qty, broker, fee, strategy, trade_group_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('t-ss-1', '2026-05-20', 'MNQ', 'LONG', '2026-05-20T15:00:00', 21100, 1, 'IB', 1.70, 'COW', gid, now, now);

    // 首次 rebuild（無既有 group row）
    testDb3.transaction((tx) => { rebuildTradeGroup(tx, gid); });

    const row = s3.prepare('SELECT strategy FROM trade_groups WHERE id = ?').get(gid) as Record<string, unknown>;
    expect(row.strategy).toBe('COW');
  });
});
