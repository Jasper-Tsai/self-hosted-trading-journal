/**
 * trades-read.ts
 *
 * Strategy and Note Attribution Model (SPEC §4.1 + §4.2)The core reads helper.
 *
 * selectTradesWithGroupAttrs() Send back a drizzle query builder,
 * put every trade of strategy and notes At the same time, it is resolved asBelong trade_groups properties,
 * Let the caller .where() / .orderBy() Waiting for chained calls can still be used normally.
 *
 * parsing rules (strategy and notes same pattern):
 *   CASE WHEN trade_groups.id IS NOT NULL
 *        THEN trade_groups.<attr>
 *        ELSE trades.<attr>
 *   END
 *  (none group row very little old information fallback return trades.<attr>)
 *
 * ⚠️ Maintenance precautions: below select for manual enumeration trades full field;schema.ts of trades table
 *    If a new field is added, Be sure to add this simultaneously select, Otherwise all reads API This field will be silently leaked.
 */

import { db } from '@/lib/db';
import { trades, trade_groups } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

/**
 * return drizzle query builder (already LEFT JOIN trade_groups).
 * select fields with trades row compatible, but strategy and notes have been parsed into group attributes.
 * The caller can receive .where(...) / .orderBy(...) Later .all() / .get() / await.
 */
export function selectTradesWithGroupAttrs() {
  return db
    .select({
      id: trades.id,
      date: trades.date,
      symbol: trades.symbol,
      side: trades.side,
      entry_time: trades.entry_time,
      entry_price: trades.entry_price,
      exit_time: trades.exit_time,
      exit_price: trades.exit_price,
      qty: trades.qty,
      fuel_top: trades.fuel_top,
      fuel_bottom: trades.fuel_bottom,
      fuel: trades.fuel,
      sl_price: trades.sl_price,
      tp1: trades.tp1,
      tp2: trades.tp2,
      tp3: trades.tp3,
      broker: trades.broker,
      fee: trades.fee,
      // Notes are parsed from the group they belong to. (SPEC §4.2): Taken when the group exists trade_groups.notes, otherwise fallback return trades.notes
      notes: sql<string | null>`CASE WHEN ${trade_groups.id} IS NOT NULL THEN ${trade_groups.notes} ELSE ${trades.notes} END`,
      // Resolve the strategy from the group when available; otherwise use trades.strategy.
      strategy: sql<string | null>`CASE WHEN ${trade_groups.id} IS NOT NULL THEN ${trade_groups.strategy} ELSE ${trades.strategy} END`,
      trade_group_id: trades.trade_group_id,
      external_trade_ids: trades.external_trade_ids,
      external_account_id: trades.external_account_id,
      created_at: trades.created_at,
      updated_at: trades.updated_at,
    })
    .from(trades)
    .leftJoin(
      trade_groups,
      sql`${trade_groups.id} = COALESCE(${trades.trade_group_id}, ${trades.id})`,
    );
}
