/**
 * trades-read.ts
 *
 * 策略與備注歸屬模型（SPEC §4.1 + §4.2）的核心讀取 helper。
 *
 * selectTradesWithGroupAttrs() 回傳一個 drizzle query builder，
 * 把每筆 trade 的 strategy 與 notes 同時解析為「所屬 trade_groups 的屬性」，
 * 讓呼叫端的 .where() / .orderBy() 等鏈式呼叫仍可正常使用。
 *
 * 解析規則（strategy 與 notes 相同模式）：
 *   CASE WHEN trade_groups.id IS NOT NULL
 *        THEN trade_groups.<attr>
 *        ELSE trades.<attr>
 *   END
 * （無 group row 的極少數舊資料 fallback 回 trades.<attr>）
 *
 * ⚠️ 維護注意：下方 select 為手動列舉 trades 全欄位；schema.ts 的 trades table
 *    若新增欄位，務必同步加進此 select，否則所有讀取 API 會靜默漏該欄位。
 */

import { db } from '@/lib/db';
import { trades, trade_groups } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

/**
 * 回傳 drizzle query builder（已 LEFT JOIN trade_groups）。
 * select 欄位與 trades row 相容，但 strategy 與 notes 均已解析為群組屬性。
 * 呼叫端可接 .where(...) / .orderBy(...) 後再 .all() / .get() / await。
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
      // 備注解析自所屬群組（SPEC §4.2）：群組存在時取 trade_groups.notes，否則 fallback 回 trades.notes
      notes: sql<string | null>`CASE WHEN ${trade_groups.id} IS NOT NULL THEN ${trade_groups.notes} ELSE ${trades.notes} END`,
      // 策略解析自所屬群組（SPEC §4.1）：群組存在時取 trade_groups.strategy，否則 fallback 回 trades.strategy
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
