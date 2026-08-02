import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { getPointValue } from '@/lib/utils';
import { getViewerStartDate } from '@/lib/user-filters';
import { listTradeGroups } from '@/lib/actions/trade-groups';
import { classifyByPointsPerContract, computeWinRate } from '@/lib/win-rate';


function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const year = parseInt(req.nextUrl.searchParams.get('year') ?? '0', 10);
    const month = parseInt(req.nextUrl.searchParams.get('month') ?? '0', 10);
    if (!year || !month) return NextResponse.json({ error: 'Lack year/month' }, { status: 400 });

    const isViewerMode = role === 'viewer';
    const lastDay = new Date(year, month, 0).getDate();
    const saturdays: Date[] = [];
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(year, month - 1, day);
      if (d.getDay() === 6) saturdays.push(d);
    }
    if (saturdays.length === 0) return NextResponse.json({});

    const weekRanges = saturdays.map(sat => {
      const monday = new Date(sat);
      monday.setDate(monday.getDate() - 5);
      return { monday, saturday: sat };
    });

    const earliest = weekRanges[0].monday;
    const latest = weekRanges[weekRanges.length - 1].saturday;
    const rangeStart = fmt(earliest);
    const rangeEnd = fmt(latest);

    const viewerStartDate = getViewerStartDate();
    const queryStart = isViewerMode && rangeStart < viewerStartDate ? viewerStartDate : rangeStart;

    const groups = await listTradeGroups({ fromDate: queryStart, toDate: rangeEnd });

    // Group-level stats: each trade_group counts as one trade
    const groupStats = groups
      .filter(g => g.exit_price_avg != null && g.total_exit_qty != null && g.total_exit_qty > 0)
      .map(g => {
        const direction = g.side === 'LONG' ? 1 : -1;
        const exitQty = g.total_exit_qty!;
        const pnlPoints = direction * (g.exit_price_avg! - g.entry_price_avg) * exitQty;
        const pointValue = getPointValue(g.symbol as Parameters<typeof getPointValue>[0]);
        const closedRatio = g.total_qty > 0 ? exitQty / g.total_qty : 1;
        const proratedFee = (g.fee_total ?? 0) * closedRatio;
        const amount = pnlPoints * pointValue - proratedFee;
        const outcome = classifyByPointsPerContract(pnlPoints, exitQty);
        return { date: g.date, points: pnlPoints, amount, outcome };
      });

    const result: Record<string, unknown> = {};
    for (const { monday, saturday } of weekRanges) {
      const monStr = fmt(monday);
      const satStr = fmt(saturday);
      const weekGroups = groupStats.filter(g => g.date >= monStr && g.date <= satStr);
      const tradingDays = new Set(weekGroups.map(g => g.date)).size;
      const totalPoints = weekGroups.reduce((s, g) => s + g.points, 0);
      const totalAmount = weekGroups.reduce((s, g) => s + g.amount, 0);
      const wins = weekGroups.filter(g => g.outcome === 'win').length;
      const losses = weekGroups.filter(g => g.outcome === 'loss').length;
      result[satStr] = {
        weekStart: monStr, weekEnd: satStr,
        totalPoints: Math.round(totalPoints * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
        totalTrades: weekGroups.length,
        wins,
        winRate: Math.round(computeWinRate(wins, losses)),
        tradingDays,
      };
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
