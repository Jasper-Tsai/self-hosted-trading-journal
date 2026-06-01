import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

// 交易記錄
export const trades = sqliteTable('trades', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),          // "YYYY-MM-DD" Taipei wall-clock，與 entry_time 同源
  symbol: text('symbol').default('MNQ'),
  side: text('side').notNull(),          // 'LONG' | 'SHORT'
  entry_time: text('entry_time').notNull(),
  entry_price: real('entry_price').notNull(),
  exit_time: text('exit_time'),
  exit_price: real('exit_price'),
  qty: integer('qty').notNull(),
  fuel_top: real('fuel_top'),
  fuel_bottom: real('fuel_bottom'),
  fuel: real('fuel'),
  sl_price: real('sl_price'),
  tp1: real('tp1'),
  tp2: real('tp2'),
  tp3: real('tp3'),
  broker: text('broker').default('Manual'),
  fee: real('fee'),
  notes: text('notes'),
  strategy: text('strategy'),                 // 策略標籤：'STAR' | 'PO3' | '夜星' | NULL（無）
  external_trade_ids: text('external_trade_ids'),    // Optional external broker execution IDs for dedupe
  trade_group_id: text('trade_group_id'),    // 同一開倉事件的交易群組 ID
  external_account_id: text('external_account_id'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
}, (t) => ([
  index('trades_date_idx').on(t.date),
  index('trades_entry_time_idx').on(t.entry_time),
  index('trades_date_entry_time_idx').on(t.date, t.entry_time),
  index('trades_group_id_idx').on(t.trade_group_id),
]));

// 市場事件（黑天鵝、地緣政治等重大事件標記）
export const market_events = sqliteTable('market_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description'),
  start_date: text('start_date').notNull(),   // YYYY-MM-DD
  end_date: text('end_date'),                  // YYYY-MM-DD, null = 進行中
  severity: text('severity').notNull(),        // 'danger' | 'warning' | 'info'
  created_by: text('created_by').notNull(),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
}, (t) => ([
  index('market_events_start_date_idx').on(t.start_date),
  index('market_events_end_date_idx').on(t.end_date),
]));

// 策略管理
export const strategies = sqliteTable('strategies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  color: text('color').notNull().default('#5E6AD2'),
  is_default: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
}, (t) => ([
  index('strategies_enabled_sort_idx').on(t.enabled, t.sort_order),
]));

// 券商管理
export const brokers = sqliteTable('brokers', {
  id: text('id').primaryKey(),              // 自訂短 ID，e.g. 'manual'
  name: text('name').notNull().unique(),    // 顯示名稱，e.g. 'Manual'
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
}, (t) => ([
  index('brokers_enabled_sort_idx').on(t.enabled, t.sort_order),
]));

// 券商×商品手續費
export const broker_fees = sqliteTable('broker_fees', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  broker_id: text('broker_id').notNull().references(() => brokers.id),
  symbol: text('symbol').notNull(),         // 'MNQ' | 'NQ' | 'SIL' | ...
  fee_per_contract: real('fee_per_contract').notNull(),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
}, (t) => ([
  index('broker_fees_broker_symbol_uidx').on(t.broker_id, t.symbol),
]));

// 商品管理
export const products = sqliteTable('products', {
  symbol: text('symbol').primaryKey(),
  name: text('name').notNull(),
  name_zh: text('name_zh').notNull(),
  tick_size: real('tick_size').notNull(),
  point_value: real('point_value').notNull(),
  price_step: real('price_step').notNull(),
  owner_only: integer('owner_only', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
}, (t) => ([
  index('products_enabled_sort_idx').on(t.enabled, t.sort_order),
]));

// 上傳檔案記錄
export const uploads = sqliteTable('uploads', {
  id: text('id').primaryKey(),
  original_name: text('original_name').notNull(),
  stored_path: text('stored_path').notNull(),  // Local/NAS volume path
  url_path: text('url_path').notNull(),         // /api/uploads/xxx
  content_type: text('content_type'),
  size: integer('size'),
  uploaded_by: text('uploaded_by'),
  created_at: text('created_at'),
});

// 交易群組 (top-level「一單」)
export const trade_groups = sqliteTable('trade_groups', {
  id: text('id').primaryKey(),
  date: text('date').notNull(),  // Chicago tz YYYY-MM-DD
  symbol: text('symbol').notNull(),
  side: text('side').notNull(),  // 'LONG' | 'SHORT'
  entry_time_first: text('entry_time_first').notNull(),
  entry_time_last: text('entry_time_last').notNull(),
  entry_price_min: real('entry_price_min').notNull(),
  entry_price_max: real('entry_price_max').notNull(),
  entry_price_avg: real('entry_price_avg').notNull(),
  total_qty: integer('total_qty').notNull(),
  exit_time_first: text('exit_time_first'),
  exit_time_last: text('exit_time_last'),
  exit_price_min: real('exit_price_min'),
  exit_price_max: real('exit_price_max'),
  exit_price_avg: real('exit_price_avg'),
  total_exit_qty: integer('total_exit_qty'),
  is_closed: integer('is_closed', { mode: 'boolean' }).notNull().default(false),
  sl_price: real('sl_price'),
  tp1: real('tp1'),
  tp2: real('tp2'),
  tp3: real('tp3'),
  fuel_top: real('fuel_top'),
  fuel_bottom: real('fuel_bottom'),
  fuel: real('fuel'),
  broker: text('broker'),
  fee_total: real('fee_total'),
  notes: text('notes'),
  strategy: text('strategy'),
  created_at: text('created_at'),
  updated_at: text('updated_at'),
}, (t) => ([
  index('trade_groups_date_idx').on(t.date),
  index('trade_groups_symbol_side_idx').on(t.symbol, t.side),
  index('trade_groups_strategy_idx').on(t.strategy),
]));

// 交易腳 (細部 fills)
export const trade_legs = sqliteTable('trade_legs', {
  id: text('id').primaryKey(),
  trade_group_id: text('trade_group_id').notNull().references(() => trade_groups.id, { onDelete: 'cascade' }),
  leg_type: text('leg_type').notNull(),  // 'entry' | 'exit'
  fill_time: text('fill_time').notNull(),
  fill_price: real('fill_price').notNull(),
  qty: integer('qty').notNull(),
  fee: real('fee').default(0),
  external_trade_id: text('external_trade_id'),
  external_order_id: text('external_order_id'),
  matched_entry_leg_id: text('matched_entry_leg_id'),
  pnl_points: real('pnl_points'),
  pnl_amount: real('pnl_amount'),
  created_at: text('created_at'),
}, (t) => ([
  index('trade_legs_group_idx').on(t.trade_group_id),
  index('trade_legs_external_trade_idx').on(t.external_trade_id),
  index('trade_legs_external_order_idx').on(t.external_order_id),
  index('trade_legs_fill_time_idx').on(t.fill_time),
]));
