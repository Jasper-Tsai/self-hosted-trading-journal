/**
 * Trade Group Sync — rebuildTradeGroup pattern
 *
 * Every time trades are written (insert / update / delete), call
 * rebuildTradeGroup(tx, groupId) inside the same transaction.
 *
 * The function is idempotent: it deletes the existing group (cascade drops
 * legs via FK) then re-aggregates from the current set of trades that share
 * the same trade_group_id.
 */

import { db } from '@/lib/db';
import { trades, trade_groups, trade_legs } from '@/lib/db/schema';
import { eq, or, and, isNull } from 'drizzle-orm';

// ─── Transaction type ────────────────────────────────────────────────────────
// drizzle-orm/better-sqlite3 does not export its transaction type publicly,
// so we derive it from the db.transaction callback parameter.
type TxType = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Tx = TxType | typeof db;

// ─── rebuildTradeGroup ───────────────────────────────────────────────────────

/**
 * Rebuild trade_groups + trade_legs for a single groupId from scratch.
 *
 * Must be called inside the same db.transaction() as the trades write, so
 * that both writes are atomic.
 *
 * @param tx   - The drizzle transaction (or db itself for non-transactional use)
 * @param groupId - The trade_group_id (= trade.id for trades without a group)
 */
export function rebuildTradeGroup(tx: Tx, groupId: string): void {
  // 1. Fetch all trades belonging to this group
  //    Defense: also match trades where trade_group_id IS NULL but trade.id = groupId
  //    (legacy NULL rows before backfill; groupId is set to trade.id as fallback on edit)
  const matched = tx
    .select()
    .from(trades)
    .where(
      or(
        eq(trades.trade_group_id, groupId),
        and(isNull(trades.trade_group_id), eq(trades.id, groupId)),
      ),
    )
    .all();

  // 2. Before deleting, read the existing group of strategy and notes (Keep user edits)
  //    Notice: undefined express group row does not exist (Created for the first time), null express group Exists but the field is empty
  const existingGroup: { strategy: string | null; notes: string | null } | undefined = tx
    .select({ strategy: trade_groups.strategy, notes: trade_groups.notes })
    .from(trade_groups)
    .where(eq(trade_groups.id, groupId))
    .limit(1)
    .all()[0];

  // Delete existing group row (CASCADE drops all legs via FK)
  tx.delete(trade_groups).where(eq(trade_groups.id, groupId)).run();

  // Group was orphaned (all its trades deleted) — leave deleted
  if (matched.length === 0) return;

  // 3. Aggregate group fields from trades (mirrors migration SQL step 1)
  const first = matched[0];
  const exits = matched.filter((t) => t.exit_price != null);
  const totalQty = matched.reduce((s, t) => s + t.qty, 0);
  const totalExitQty = exits.reduce((s, t) => s + t.qty, 0);

  const entryVwap =
    matched.reduce((s, t) => s + t.qty * t.entry_price, 0) / totalQty;

  const exitVwap =
    exits.length > 0
      ? exits.reduce((s, t) => s + t.qty * t.exit_price!, 0) / totalExitQty
      : null;

  const entryTimeFirst = matched.reduce(
    (m, t) => (t.entry_time < m ? t.entry_time : m),
    first.entry_time,
  );
  const entryTimeLast = matched.reduce(
    (m, t) => (t.entry_time > m ? t.entry_time : m),
    first.entry_time,
  );

  const exitTimeFirst =
    exits.length > 0
      ? exits.reduce(
          (m, t) => (t.exit_time! < m ? t.exit_time! : m),
          exits[0].exit_time!,
        )
      : null;
  const exitTimeLast =
    exits.length > 0
      ? exits.reduce(
          (m, t) => (t.exit_time! > m ? t.exit_time! : m),
          exits[0].exit_time!,
        )
      : null;

  const now = new Date().toISOString();

  tx.insert(trade_groups).values({
    id: groupId,
    date: first.date,
    symbol: first.symbol ?? 'MNQ',
    side: first.side,
    entry_time_first: entryTimeFirst,
    entry_time_last: entryTimeLast,
    entry_price_min: Math.min(...matched.map((t) => t.entry_price)),
    entry_price_max: Math.max(...matched.map((t) => t.entry_price)),
    entry_price_avg: Math.round(entryVwap * 10000) / 10000,
    total_qty: totalQty,
    exit_time_first: exitTimeFirst,
    exit_time_last: exitTimeLast,
    exit_price_min: exits.length > 0 ? Math.min(...exits.map((t) => t.exit_price!)) : null,
    exit_price_max: exits.length > 0 ? Math.max(...exits.map((t) => t.exit_price!)) : null,
    exit_price_avg:
      exitVwap != null ? Math.round(exitVwap * 10000) / 10000 : null,
    total_exit_qty: exits.length > 0 ? totalExitQty : null,
    is_closed: totalQty === totalExitQty && totalExitQty > 0,
    sl_price: first.sl_price ?? null,
    tp1: first.tp1 ?? null,
    tp2: first.tp2 ?? null,
    tp3: first.tp3 ?? null,
    fuel_top: first.fuel_top ?? null,
    fuel_bottom: first.fuel_bottom ?? null,
    fuel: first.fuel ?? null,
    broker: first.broker ?? null,
    fee_total: Math.round(matched.reduce((s, t) => s + (t.fee ?? 0), 0) * 100) / 100,
    // If the group already exists, keep the existing notes. (User edit results), Only created for the first time (none group row)brought in from seeds (SPEC §4.2)
    notes: existingGroup !== undefined ? existingGroup.notes : (first.notes ?? null),
    // Preserve a user-edited group strategy; seed it only when the group is first created (SPEC §4.1).
    strategy: existingGroup !== undefined ? existingGroup.strategy : (first.strategy ?? null),
    created_at: now,
    updated_at: now,
  }).run();

  // 4. Build entry + exit legs, deduped by (fill_time, fill_price, external_trade_id)
  //    This mirrors migration SQL steps 3-4.

  // ── Entry legs ──────────────────────────────────────────────────────────────
  const entryDedup = new Map<
    string,
    { fill_time: string; fill_price: number; qty: number; fee: number; external_trade_id: string | null }
  >();

  for (const t of matched) {
    const tid =
      t.external_trade_ids?.split(',')[0]?.trim() || null;
    // For manual trades with no external_trade_ids, key on trade.id to avoid merging
    const key = `${t.entry_time}_${t.entry_price}_${tid ?? '_manual_' + t.id}`;
    const existing = entryDedup.get(key);
    if (existing) {
      existing.qty += t.qty;
      existing.fee += (t.fee ?? 0) / 2;
    } else {
      entryDedup.set(key, {
        fill_time: t.entry_time,
        fill_price: t.entry_price,
        qty: t.qty,
        fee: (t.fee ?? 0) / 2,
        external_trade_id: tid,
      });
    }
  }

  // ── Exit legs ───────────────────────────────────────────────────────────────
  const exitDedup = new Map<
    string,
    { fill_time: string; fill_price: number; qty: number; fee: number; external_trade_id: string | null }
  >();

  for (const t of exits) {
    const ids = t.external_trade_ids?.split(',') ?? [];
    const tid = ids.length >= 2 ? ids[1].trim() : null;
    const key = `${t.exit_time}_${t.exit_price}_${tid ?? '_manual_' + t.id}`;
    const existing = exitDedup.get(key);
    if (existing) {
      existing.qty += t.qty;
      existing.fee += (t.fee ?? 0) / 2;
    } else {
      exitDedup.set(key, {
        fill_time: t.exit_time!,
        fill_price: t.exit_price!,
        qty: t.qty,
        fee: (t.fee ?? 0) / 2,
        external_trade_id: tid,
      });
    }
  }

  // ── Build leg rows ──────────────────────────────────────────────────────────
  const legRows: (typeof trade_legs.$inferInsert)[] = [];
  let counter = 0;

  for (const [, e] of entryDedup) {
    legRows.push({
      id: `${groupId}_e_${counter++}`,
      trade_group_id: groupId,
      leg_type: 'entry',
      fill_time: e.fill_time,
      fill_price: e.fill_price,
      qty: e.qty,
      fee: Math.round(e.fee * 10000) / 10000,
      external_trade_id: e.external_trade_id,
      external_order_id: null,
      matched_entry_leg_id: null,
      pnl_points: null,
      pnl_amount: null,
      created_at: now,
    });
  }

  for (const [, e] of exitDedup) {
    legRows.push({
      id: `${groupId}_x_${counter++}`,
      trade_group_id: groupId,
      leg_type: 'exit',
      fill_time: e.fill_time,
      fill_price: e.fill_price,
      qty: e.qty,
      fee: Math.round(e.fee * 10000) / 10000,
      external_trade_id: e.external_trade_id,
      external_order_id: null,
      matched_entry_leg_id: null,
      pnl_points: null,
      pnl_amount: null,
      created_at: now,
    });
  }

  if (legRows.length > 0) {
    tx.insert(trade_legs).values(legRows).run();
  }
}
