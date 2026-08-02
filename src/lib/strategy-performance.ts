/**
 * Strategy performance calculation logic — for /api/stats/strategy and /api/stats/strategy/[name] share
 */
import { Trade } from '@/types';
import { getPointValue } from '@/lib/utils';
import { getActualFee, formatChicagoDate } from '@/lib/trade-utils';
import {
  StrategyPerformanceRow,
  StrategyTradeGroup,
  StrategyMonthlyAgg,
} from '@/types/strategy-performance';
import {
  classifyByPointsPerContract,
  computeWinRate,
} from '@/lib/win-rate';

// ---------------------------------------------------------------------------
// Filter helpers
// ---------------------------------------------------------------------------

export interface TradeFilter {
  days?: number | 'all';
  from?: string;      // YYYY-MM-DD
  to?: string;        // YYYY-MM-DD
  symbols?: string[]; // e.g. ['MNQ', 'NQ']
  sides?: string[];   // e.g. ['LONG', 'SHORT']
  brokers?: string[]; // e.g. ['IB', 'Manual']
}

export function applyTradeFilter(trades: Trade[], filter: TradeFilter): Trade[] {
  let result = trades;

  // Date range: from/to take precedence over days
  if (filter.from || filter.to) {
    if (filter.from) result = result.filter(t => t.date >= filter.from!);
    if (filter.to)   result = result.filter(t => t.date <= filter.to!);
  } else if (filter.days && filter.days !== 'all') {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - filter.days);
    const cutoffStr = formatChicagoDate(cutoff);
    result = result.filter(t => t.date >= cutoffStr);
  }

  if (filter.symbols && filter.symbols.length > 0) {
    result = result.filter(t => t.symbol && filter.symbols!.includes(t.symbol));
  }
  if (filter.sides && filter.sides.length > 0) {
    result = result.filter(t => filter.sides!.includes(t.side));
  }
  if (filter.brokers && filter.brokers.length > 0) {
    result = result.filter(t => t.broker && filter.brokers!.includes(t.broker));
  }

  return result;
}

export function buildRangeLabel(filter: TradeFilter): string {
  if (filter.from || filter.to) {
    const f = filter.from ?? '';
    const t = filter.to ?? '';
    if (f && t) return `${f} → ${t}`;
    if (f) return `${f} rise`;
    return `to ${t}`;
  }
  if (!filter.days || filter.days === 'all') return 'all';
  return `Closed trades, last ${filter.days} days`;
}

// ---------------------------------------------------------------------------
// Group aggregation
// ---------------------------------------------------------------------------

interface TradeGroup {
  groupKey: string;
  date: string;
  entry_time: string;
  exit_time: string | null;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;      // qty-weighted average
  exit_price: number | null;
  qty: number;              // total qty
  sl_price: number | null;
  pnl_points: number | null;
  pnl_usd: number | null;
  strategy: string | null;
  notes: string | null;
}

function groupTrades(tradeList: Trade[]): TradeGroup[] {
  // Map: groupKey → accumulated data
  const map = new Map<string, {
    date: string;
    entry_time: string;
    exit_times: string[];
    symbol: string;
    side: 'LONG' | 'SHORT';
    entryPriceQtySum: number;
    qtySum: number;
    exit_price_sum: number;
    exit_price_qty: number;
    hasMissingExit: boolean;
    sl_price: number | null;
    sl_entry_time: string | null;
    pnl_points: number;
    pnl_usd: number;
    strategy: string | null;
    notes: string | null;
  }>();

  // First pass: all trades (including no-exit, for drill-down listing)
  tradeList.forEach(t => {
    const groupKey = t.trade_group_id ?? t.id ?? `${t.date}_${t.entry_time}`;
    const existing = map.get(groupKey);

    if (!existing) {
      map.set(groupKey, {
        date: t.date,
        entry_time: t.entry_time,
        exit_times: t.exit_time ? [t.exit_time] : [],
        symbol: t.symbol ?? 'MNQ',
        side: t.side,
        entryPriceQtySum: t.entry_price * t.qty,
        qtySum: t.qty,
        exit_price_sum: t.exit_price != null ? t.exit_price * t.qty : 0,
        exit_price_qty: t.exit_price != null ? t.qty : 0,
        hasMissingExit: t.exit_price == null,
        sl_price: t.sl_price ?? null,
        sl_entry_time: t.sl_price != null ? t.entry_time : null,
        pnl_points: 0,
        pnl_usd: 0,
        strategy: t.strategy ?? null,
        notes: t.notes ?? null,
      });
    } else {
      // Keep earliest entry_time
      if (t.entry_time < existing.entry_time) {
        existing.entry_time = t.entry_time;
      }
      if (t.exit_time) existing.exit_times.push(t.exit_time);
      existing.entryPriceQtySum += t.entry_price * t.qty;
      existing.qtySum += t.qty;
      if (t.exit_price != null) {
        existing.exit_price_sum += t.exit_price * t.qty;
        existing.exit_price_qty += t.qty;
      } else {
        existing.hasMissingExit = true;
      }
      // sl_price: first trade by entry_time that has sl_price
      if (t.sl_price != null) {
        if (existing.sl_price === null || t.entry_time < (existing.sl_entry_time ?? '')) {
          existing.sl_price = t.sl_price;
          existing.sl_entry_time = t.entry_time;
        }
      }
      if (!existing.strategy && t.strategy) existing.strategy = t.strategy;
      if (!existing.notes && t.notes) existing.notes = t.notes;
    }
  });

  // Second pass: compute pnl for trades with exit_price
  tradeList
    .filter(t => t.exit_price != null)
    .forEach(t => {
      const groupKey = t.trade_group_id ?? t.id ?? `${t.date}_${t.entry_time}`;
      const g = map.get(groupKey)!;
      const pnlPoints = t.side === 'LONG'
        ? (t.exit_price! - t.entry_price) * t.qty
        : (t.entry_price - t.exit_price!) * t.qty;
      g.pnl_points += pnlPoints;
      g.pnl_usd += (pnlPoints * getPointValue(t.symbol)) - getActualFee(t);
    });

  return Array.from(map.entries()).map(([groupKey, g]) => {
    const hasFullExit = !g.hasMissingExit && g.exit_price_qty > 0;
    const avgEntry = g.qtySum > 0 ? g.entryPriceQtySum / g.qtySum : 0;
    const avgExit = g.exit_price_qty > 0 ? g.exit_price_sum / g.exit_price_qty : null;
    const latestExit = g.exit_times.length > 0
      ? g.exit_times.sort().at(-1) ?? null
      : null;

    return {
      groupKey,
      date: g.date,
      entry_time: g.entry_time,
      exit_time: latestExit,
      symbol: g.symbol,
      side: g.side,
      entry_price: avgEntry,
      exit_price: hasFullExit ? avgExit : null,
      qty: g.qtySum,
      sl_price: g.sl_price,
      pnl_points: hasFullExit ? g.pnl_points : null,
      pnl_usd: hasFullExit ? g.pnl_usd : null,
      strategy: g.strategy,
      notes: g.notes,
    };
  });
}

// ---------------------------------------------------------------------------
// Metrics computation
// ---------------------------------------------------------------------------

export function computeStrategyStats(
  tradeList: Trade[],
  dbStrategies: { name: string; color: string; sort_order: number }[]
): StrategyPerformanceRow[] {
  const colorMap = new Map<string, string>(dbStrategies.map(s => [s.name, s.color]));

  // Accumulator per strategy
  interface StratAcc {
    // groups with exit (for PnL metrics)
    closedGroups: Array<{ pnl_usd: number; pnl_points: number; qty: number; sl_price: number | null; entry_price: number; entry_time: string }>;
    // all groups (for rrTotal)
    totalGroupCount: number;
  }

  const accMap = new Map<string, StratAcc>();

  // Pre-initialize DB strategies
  accMap.set('none', { closedGroups: [], totalGroupCount: 0 });
  for (const s of dbStrategies) accMap.set(s.name, { closedGroups: [], totalGroupCount: 0 });

  const groups = groupTrades(tradeList);

  for (const g of groups) {
    const key = g.strategy ?? 'none';
    if (!accMap.has(key)) accMap.set(key, { closedGroups: [], totalGroupCount: 0 });
    const acc = accMap.get(key)!;
    acc.totalGroupCount += 1;

    if (g.pnl_usd !== null && g.pnl_points !== null) {
      acc.closedGroups.push({
        pnl_usd: g.pnl_usd,
        pnl_points: g.pnl_points,
        qty: g.qty,
        sl_price: g.sl_price,
        entry_price: g.entry_price,
        entry_time: g.entry_time,
      });
    }
  }

  const dbOrder = dbStrategies.map(s => s.name);

  const result: StrategyPerformanceRow[] = Array.from(accMap.entries()).map(([strategy, acc]) => {
    // Sort closed groups by entry_time ascending for streak/equity calculations
    const sorted = [...acc.closedGroups].sort((a, b) => a.entry_time.localeCompare(b.entry_time));

    let wins = 0, losses = 0, breakeven = 0;
    let sumWinPoints = 0, sumLossPoints = 0;
    let sumWinUsd = 0, sumLossUsd = 0;
    let sumRR = 0, rrSamples = 0;
    let totalPnLPoints = 0, totalPnLUsd = 0;

    // Streak tracking
    let curWin = 0, curLoss = 0;
    let maxWinStreak = 0, maxLossStreak = 0;

    // Equity curve for max drawdown
    let equity = 0;
    let peak = 0;
    let maxDrawdownUsd = 0;

    for (const g of sorted) {
      const outcome = classifyByPointsPerContract(g.pnl_points, g.qty);
      const isWin = outcome === 'win';
      const isLoss = outcome === 'loss';

      totalPnLPoints += g.pnl_points;
      totalPnLUsd += g.pnl_usd;

      if (isWin) {
        wins++;
        sumWinPoints += g.pnl_points;
        sumWinUsd += g.pnl_usd;
        curWin++;
        curLoss = 0;
        maxWinStreak = Math.max(maxWinStreak, curWin);
      } else if (isLoss) {
        losses++;
        sumLossPoints += g.pnl_points;
        sumLossUsd += g.pnl_usd;
        curLoss++;
        curWin = 0;
        maxLossStreak = Math.max(maxLossStreak, curLoss);
      } else {
        breakeven++;
        // breakeven resets both streaks
        curWin = 0;
        curLoss = 0;
      }

      // R:R calculation
      if (g.sl_price !== null) {
        const riskPoints = Math.abs(g.entry_price - g.sl_price);
        if (riskPoints > 1e-6) {
          const rr = g.pnl_points / riskPoints;
          sumRR += rr;
          rrSamples++;
        }
      }

      // Equity / drawdown
      equity += g.pnl_usd;
      if (equity > peak) peak = equity;
      const drawdown = peak - equity;
      if (drawdown > maxDrawdownUsd) maxDrawdownUsd = drawdown;
    }

    const trades = wins + losses + breakeven;
    const winRate = Math.round(computeWinRate(wins, losses) * 10) / 10;
    const avgWinPoints = wins > 0 ? sumWinPoints / wins : 0;
    const avgLossPoints = losses > 0 ? sumLossPoints / losses : 0;
    const avgWinUsd = wins > 0 ? sumWinUsd / wins : 0;
    const avgLossUsd = losses > 0 ? sumLossUsd / losses : 0;
    const profitFactor = losses > 0 ? sumWinUsd / Math.abs(sumLossUsd) : null;
    const expectancyUsd = trades > 0 ? totalPnLUsd / trades : 0;
    const avgRR = rrSamples > 0 ? sumRR / rrSamples : null;

    return {
      strategy,
      color: colorMap.get(strategy) ?? '#8A8F98',
      trades,
      wins,
      losses,
      breakeven,
      winRate,
      totalPnLPoints: Math.round(totalPnLPoints * 100) / 100,
      totalPnLUsd: Math.round(totalPnLUsd * 100) / 100,
      avgWinPoints: Math.round(avgWinPoints * 100) / 100,
      avgLossPoints: Math.round(avgLossPoints * 100) / 100,
      avgWinUsd: Math.round(avgWinUsd * 100) / 100,
      avgLossUsd: Math.round(avgLossUsd * 100) / 100,
      profitFactor: profitFactor !== null ? Math.round(profitFactor * 1000) / 1000 : null,
      lossSampleCount: losses,
      expectancyUsd: Math.round(expectancyUsd * 100) / 100,
      avgRR: avgRR !== null ? Math.round(avgRR * 1000) / 1000 : null,
      rrSampleCount: rrSamples,
      rrTotal: acc.totalGroupCount,
      maxWinStreak,
      maxLossStreak,
      maxDrawdownUsd: Math.round(maxDrawdownUsd * 100) / 100,
    };
  });

  // Sort: DB order → unknown strategies → 'none' last
  result.sort((a, b) => {
    if (a.strategy === 'none') return 1;
    if (b.strategy === 'none') return -1;
    const ai = dbOrder.indexOf(a.strategy);
    const bi = dbOrder.indexOf(b.strategy);
    return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
  });

  return result;
}

// ---------------------------------------------------------------------------
// Drill-down helpers
// ---------------------------------------------------------------------------

export function buildTradeGroups(
  tradeList: Trade[],
  strategyName: string | null
): StrategyTradeGroup[] {
  const groups = groupTrades(tradeList);
  const targetStrategy = strategyName === null || strategyName === 'none' ? null : strategyName;

  return groups
    .filter(g => {
      if (strategyName === 'none') return g.strategy === null;
      return g.strategy === targetStrategy;
    })
    .sort((a, b) => {
      // Descending by entry_time (most recent first)
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.entry_time.localeCompare(a.entry_time);
    })
    .map(g => {
      // R:R
      let rr: number | null = null;
      if (g.sl_price !== null && g.pnl_points !== null) {
        const riskPoints = Math.abs(g.entry_price - g.sl_price);
        if (riskPoints > 1e-6) rr = Math.round((g.pnl_points / riskPoints) * 1000) / 1000;
      }

      return {
        id: g.groupKey,
        date: g.date,
        entry_time: g.entry_time,
        exit_time: g.exit_time,
        symbol: g.symbol,
        side: g.side as 'LONG' | 'SHORT',
        entry_price: g.entry_price,
        exit_price: g.exit_price,
        qty: g.qty,
        sl_price: g.sl_price,
        pnl_points: g.pnl_points !== null ? Math.round(g.pnl_points * 100) / 100 : null,
        pnl_usd: g.pnl_usd !== null ? Math.round(g.pnl_usd * 100) / 100 : null,
        rr,
        notes: g.notes,
      };
    });
}

export function buildMonthlyAgg(
  tradeList: Trade[],
  strategyName: string | null
): StrategyMonthlyAgg[] {
  const groups = groupTrades(tradeList);
  const targetStrategy = strategyName === null || strategyName === 'none' ? null : strategyName;

  const filtered = groups.filter(g => {
    if (strategyName === 'none') return g.strategy === null;
    return g.strategy === targetStrategy;
  });

  const monthMap = new Map<string, { trades: number; pnlUsd: number; pnlPoints: number; wins: number; losses: number }>();

  for (const g of filtered) {
    if (g.pnl_usd === null || g.pnl_points === null) continue;
    const month = g.date.slice(0, 7); // YYYY-MM
    const cur = monthMap.get(month) ?? { trades: 0, pnlUsd: 0, pnlPoints: 0, wins: 0, losses: 0 };
    cur.trades++;
    cur.pnlUsd += g.pnl_usd;
    cur.pnlPoints += g.pnl_points;
    const outcome = classifyByPointsPerContract(g.pnl_points, g.qty);
    if (outcome === 'win') cur.wins++;
    else if (outcome === 'loss') cur.losses++;
    monthMap.set(month, cur);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, m]) => ({
      month,
      trades: m.trades,
      pnlUsd: Math.round(m.pnlUsd * 100) / 100,
      pnlPoints: Math.round(m.pnlPoints * 100) / 100,
      winRate: Math.round(computeWinRate(m.wins, m.losses) * 10) / 10,
    }));
}
