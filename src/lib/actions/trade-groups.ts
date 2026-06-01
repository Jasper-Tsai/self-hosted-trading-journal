import { db } from '@/lib/db';
import { trade_groups, trade_legs } from '@/lib/db/schema';
import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';

export interface TradeGroupWithLegs {
  group: typeof trade_groups.$inferSelect;
  entries: (typeof trade_legs.$inferSelect)[];
  exits: (typeof trade_legs.$inferSelect)[];
}

// List groups with optional date range / symbol / strategy filter
export async function listTradeGroups(opts?: {
  fromDate?: string;
  toDate?: string;
  symbol?: string;
  strategy?: string;
}): Promise<(typeof trade_groups.$inferSelect)[]> {
  const conditions = [];
  if (opts?.fromDate) conditions.push(gte(trade_groups.date, opts.fromDate));
  if (opts?.toDate) conditions.push(lte(trade_groups.date, opts.toDate));
  if (opts?.symbol) conditions.push(eq(trade_groups.symbol, opts.symbol));
  if (opts?.strategy) conditions.push(eq(trade_groups.strategy, opts.strategy));

  const where = conditions.length ? and(...conditions) : undefined;
  return db
    .select()
    .from(trade_groups)
    .where(where)
    .orderBy(desc(trade_groups.date), desc(trade_groups.entry_time_first));
}

// Get single group with legs eager-loaded
export async function getTradeGroupWithLegs(id: string): Promise<TradeGroupWithLegs | null> {
  const groupRows = await db
    .select()
    .from(trade_groups)
    .where(eq(trade_groups.id, id))
    .limit(1);
  if (groupRows.length === 0) return null;

  const group = groupRows[0];
  const allLegs = await db
    .select()
    .from(trade_legs)
    .where(eq(trade_legs.trade_group_id, id))
    .orderBy(asc(trade_legs.fill_time));

  return {
    group,
    entries: allLegs.filter((l) => l.leg_type === 'entry'),
    exits: allLegs.filter((l) => l.leg_type === 'exit'),
  };
}

// Aggregate stats across groups
export async function getTradeGroupStats(opts?: {
  fromDate?: string;
  toDate?: string;
}): Promise<{
  total_groups: number;
  total_qty: number;
  total_pnl_points: number;
  total_fee: number;
}> {
  const conditions = [];
  if (opts?.fromDate) conditions.push(gte(trade_groups.date, opts.fromDate));
  if (opts?.toDate) conditions.push(lte(trade_groups.date, opts.toDate));
  const where = conditions.length ? and(...conditions) : undefined;

  const groups = await db.select().from(trade_groups).where(where);

  let totalPnl = 0;
  let totalFee = 0;
  let totalQty = 0;

  for (const g of groups) {
    // Only count groups that have at least one exit fill
    if (g.exit_price_avg == null || g.total_exit_qty == null || g.total_exit_qty === 0) continue;
    const direction = g.side === 'LONG' ? 1 : -1;
    // Use total_exit_qty (not total_qty) so partial exits are counted correctly
    totalPnl += direction * (g.exit_price_avg - g.entry_price_avg) * g.total_exit_qty;
    // Prorate fee by closed ratio: partial groups only apportion the realized share.
    // For fully-closed groups total_exit_qty === total_qty → closedRatio = 1 → full fee.
    const closedRatio = g.total_qty > 0 ? g.total_exit_qty / g.total_qty : 1;
    totalFee += (g.fee_total ?? 0) * closedRatio;
    totalQty += g.total_exit_qty;
  }

  return {
    total_groups: groups.length,
    total_qty: totalQty,
    total_pnl_points: Math.round(totalPnl * 100) / 100,
    total_fee: Math.round(totalFee * 100) / 100,
  };
}
