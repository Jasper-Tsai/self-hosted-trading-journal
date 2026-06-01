import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { trades } from '@/lib/db/schema';
import { gte, lte, and } from 'drizzle-orm';
import { selectTradesWithGroupAttrs } from '@/lib/db/trades-read';
import { getPointValue } from '@/lib/utils';
import { getActualFee } from '@/lib/trade-utils';
import { filterTradesForViewer, getViewerStartDate } from '@/lib/user-filters';
import { Trade } from '@/types';
import { classifyByPointsPerContract, computeWinRate } from '@/lib/win-rate';


export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const year = parseInt(req.nextUrl.searchParams.get('year') ?? '0', 10);
    const month = parseInt(req.nextUrl.searchParams.get('month') ?? '0', 10);
    if (!year || !month) return NextResponse.json({ error: '缺少 year/month' }, { status: 400 });

    const isViewerMode = role === 'viewer';
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const viewerStartDate = getViewerStartDate();
    const queryStartDate = isViewerMode && startDate < viewerStartDate ? viewerStartDate : startDate;

    const allTradesRaw = await selectTradesWithGroupAttrs()
      .where(and(gte(trades.date, queryStartDate), lte(trades.date, endDate)));

    let allTrades = allTradesRaw as unknown as Trade[];
    if (isViewerMode) allTrades = filterTradesForViewer(allTrades);

    // Step 1: Accumulate P&L per group per day
    const dailyPointsAmount = new Map<string, { points: number; amount: number }>();
    const groupPnL = new Map<string, { date: string; amount: number; points: number; qty: number; strategy: string | null }>();

    allTrades
      .filter(t => t.exit_price != null)
      .forEach(t => {
        const pnl = t.side === 'LONG'
          ? (t.exit_price! - t.entry_price) * t.qty
          : (t.entry_price - t.exit_price!) * t.qty;
        const amount = (pnl * getPointValue(t.symbol)) - getActualFee(t);

        const cur = dailyPointsAmount.get(t.date) || { points: 0, amount: 0 };
        cur.points += pnl;
        cur.amount += amount;
        dailyPointsAmount.set(t.date, cur);

        // Group-level aggregation
        const groupKey = t.trade_group_id ?? t.id ?? `${t.entry_time}`;
        const g = groupPnL.get(groupKey) || { date: t.date, amount: 0, points: 0, qty: 0, strategy: null };
        g.amount += amount;
        g.points += pnl;
        g.qty += t.qty;
        // SPEC §4.1：重構後同群組每筆 t.strategy 已一致，此 fallback 恆取同值（保留不影響結果）
        if (!g.strategy && t.strategy) g.strategy = t.strategy;
        groupPnL.set(groupKey, g);
      });

    // Step 2: Count wins/trades at group level per day
    const dailyStatsMap = new Map<string, {
      points: number; amount: number; totalTrades: number; wins: number; losses: number;
      strategicTrades: number; strategicWins: number; strategicLosses: number;
    }>();

    for (const [date, pa] of dailyPointsAmount) {
      dailyStatsMap.set(date, { points: pa.points, amount: pa.amount, totalTrades: 0, wins: 0, losses: 0, strategicTrades: 0, strategicWins: 0, strategicLosses: 0 });
    }

    for (const g of groupPnL.values()) {
      const cur = dailyStatsMap.get(g.date)!;
      cur.totalTrades += 1;
      const outcome = classifyByPointsPerContract(g.points, g.qty);
      if (outcome === 'win') cur.wins += 1;
      else if (outcome === 'loss') cur.losses += 1;
      if (g.strategy) {
        cur.strategicTrades += 1;
        if (outcome === 'win') cur.strategicWins += 1;
        else if (outcome === 'loss') cur.strategicLosses += 1;
      }
    }

    const dailyPnL = Array.from(dailyStatsMap.entries()).map(([date, s]) => ({
      date,
      points: Math.round(s.points * 100) / 100,
      amount: Math.round(s.amount * 100) / 100,
      totalTrades: s.totalTrades,
      wins: s.wins,
      winRate: Math.round(computeWinRate(s.wins, s.losses)),
      strategicTrades: s.strategicTrades,
      strategicWins: s.strategicWins,
      strategicWinRate: Math.round(computeWinRate(s.strategicWins, s.strategicLosses)),
    }));

    const monthlyTotal = dailyPnL.reduce((sum, d) => sum + d.amount, 0);
    return NextResponse.json({ dailyPnL, monthlyTotal: Math.round(monthlyTotal * 100) / 100 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
