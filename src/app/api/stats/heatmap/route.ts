import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { trades } from '@/lib/db/schema';
import { gte, lte, and } from 'drizzle-orm';
import { getPointValue } from '@/lib/utils';
import { getActualFee, formatChicagoDate } from '@/lib/trade-utils';
import { filterTradesForViewer, getViewerStartDate } from '@/lib/user-filters';
import { Trade } from '@/types';
import { classifyByPointsPerContract, computeWinRate } from '@/lib/win-rate';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';



export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const isViewerMode = role === 'viewer';

    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    const endDate = new Date();

    const queryStartDate = isViewerMode ? getViewerStartDate() : formatChicagoDate(startDate);
    const queryEndDate = formatChicagoDate(endDate);

    const allTradesRaw = await selectTradesWithGroupAttrs()
      .where(and(gte(trades.date, queryStartDate), lte(trades.date, queryEndDate)));

    let allTrades = allTradesRaw as unknown as Trade[];
    if (isViewerMode) allTrades = filterTradesForViewer(allTrades);

    const dailyPnL = new Map<string, number>();
    const dailyAmount = new Map<string, number>();
    const monthlyStrategyStats = new Map<string, { trades: number; wins: number; losses: number }>();
    const yearlyAllTradesStats = new Map<number, { trades: number; wins: number; losses: number }>();

    // Step 1: Accumulate daily P&L and group-level P&L
    const groupPnL = new Map<string, { amount: number; points: number; qty: number; strategy: string | null; year: number; monthKey: string }>();

    allTrades
      .filter(t => t.exit_price != null)
      .forEach(t => {
        const pnl = t.side === 'LONG'
          ? (t.exit_price! - t.entry_price) * t.qty
          : (t.entry_price - t.exit_price!) * t.qty;
        const amount = (pnl * getPointValue(t.symbol)) - getActualFee(t);

        dailyPnL.set(t.date, (dailyPnL.get(t.date) || 0) + pnl);
        dailyAmount.set(t.date, (dailyAmount.get(t.date) || 0) + amount);

        const groupKey = t.trade_group_id ?? t.id ?? `ungrouped_${t.date}_${t.entry_time}`;
        const g = groupPnL.get(groupKey) || {
          amount: 0, points: 0, qty: 0, strategy: null,
          year: parseInt(t.date.substring(0, 4), 10),
          monthKey: t.date.substring(0, 7),
        };
        g.amount += amount;
        g.points += pnl;
        g.qty += t.qty;
        // SPEC §4.1：重構後同群組每筆 t.strategy 已一致，此 fallback 恆取同值（保留不影響結果）
        if (!g.strategy && t.strategy) g.strategy = t.strategy;
        groupPnL.set(groupKey, g);
      });

    // Step 2: Count wins/trades at group level
    for (const g of groupPnL.values()) {
      const outcome = classifyByPointsPerContract(g.points, g.qty);
      const yearStats = yearlyAllTradesStats.get(g.year) || { trades: 0, wins: 0, losses: 0 };
      yearStats.trades += 1;
      if (outcome === 'win') yearStats.wins += 1;
      else if (outcome === 'loss') yearStats.losses += 1;
      yearlyAllTradesStats.set(g.year, yearStats);

      if (g.strategy) {
        const mStats = monthlyStrategyStats.get(g.monthKey) || { trades: 0, wins: 0, losses: 0 };
        mStats.trades += 1;
        if (outcome === 'win') mStats.wins += 1;
        else if (outcome === 'loss') mStats.losses += 1;
        monthlyStrategyStats.set(g.monthKey, mStats);
      }
    }

    const heatmapData = Array.from(dailyPnL.entries()).map(([date, pnl]) => ({
      date,
      pnl: Math.round(pnl * 100) / 100,
      amount: Math.round((dailyAmount.get(date) || 0) * 100) / 100,
      intensity: Math.min(Math.abs(pnl) / 10, 5),
    }));

    const strategyStats = Array.from(monthlyStrategyStats.entries()).map(([monthKey, s]) => ({
      monthKey,
      strategicTrades: s.trades,
      strategicWins: s.wins,
      strategyWinRate: computeWinRate(s.wins, s.losses),
    }));

    const yearlyWinRateStats = Array.from(yearlyAllTradesStats.entries()).map(([year, s]) => ({
      year,
      totalTrades: s.trades,
      totalWins: s.wins,
      winRate: computeWinRate(s.wins, s.losses),
    }));

    return NextResponse.json({ heatmapData, strategyStats, yearlyWinRateStats });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
