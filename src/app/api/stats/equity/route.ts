import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { trades } from '@/lib/db/schema';
import { gte, lte, and } from 'drizzle-orm';
import { getPointValue } from '@/lib/utils';
import { getActualFee, formatChicagoDate } from '@/lib/trade-utils';
import { filterTradesForViewer, getViewerStartDate } from '@/lib/user-filters';
import { Trade } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const daysParam = req.nextUrl.searchParams.get('days') ?? '30';
    const isAll = daysParam === 'all';
    const isViewerMode = role === 'viewer';

    const endDate = new Date();
    const endDateStr = formatChicagoDate(endDate);

    let startDateStr: string;
    if (isAll) {
      startDateStr = isViewerMode ? getViewerStartDate() : '2000-01-01';
    } else {
      const days = parseInt(daysParam, 10);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDateStr = formatChicagoDate(startDate);
    }
    const queryStartDate = isViewerMode ? getViewerStartDate() : '2000-01-01';

    const allTradesRaw = await db.select().from(trades)
      .where(and(gte(trades.date, queryStartDate), lte(trades.date, endDateStr)));

    let allTrades = allTradesRaw as unknown as Trade[];
    if (isViewerMode) allTrades = filterTradesForViewer(allTrades);

    const completedTrades = allTrades.filter(t => t.exit_price != null);
    const dailyPnLMap = new Map<string, { pnl: number; amount: number }>();

    completedTrades.forEach(t => {
      const pnl = t.side === 'LONG'
        ? (t.exit_price! - t.entry_price) * t.qty
        : (t.entry_price - t.exit_price!) * t.qty;
      const amount = (pnl * getPointValue(t.symbol)) - getActualFee(t);
      const cur = dailyPnLMap.get(t.date) || { pnl: 0, amount: 0 };
      dailyPnLMap.set(t.date, { pnl: cur.pnl + pnl, amount: cur.amount + amount });
    });

    const sortedDays = Array.from(dailyPnLMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    let cumulativePnL = 0, cumulativeAmount = 0;
    let startCumulativePnL = 0, startCumulativeAmount = 0, foundStart = false;

    const allEquityData = sortedDays.map(([date, daily]) => {
      if (!foundStart && date >= startDateStr) {
        startCumulativePnL = cumulativePnL;
        startCumulativeAmount = cumulativeAmount;
        foundStart = true;
      }
      cumulativePnL += daily.pnl;
      cumulativeAmount += daily.amount;

      return {
        date, time: '16:00',
        cumulativePnL: Math.round(cumulativePnL * 100) / 100,
        cumulativeAmount: Math.round(cumulativeAmount * 100) / 100,
        tradePnL: Math.round(daily.pnl * 100) / 100,
        tradeAmount: Math.round(daily.amount * 100) / 100,
        accountEquity: Math.round(cumulativeAmount * 100) / 100,
      };
    });

    const equityData = allEquityData.filter(d => d.date >= startDateStr && d.date <= endDateStr);

    // --- Linear Regression + ±1σ channel ---
    const n = equityData.length;
    let regressionLine: Array<{ date: string; value: number; valuePts: number }> = [];
    let regressionUpper: typeof regressionLine = [];
    let regressionLower: typeof regressionLine = [];

    if (n >= 5) {
      const computeLR = (key: 'cumulativeAmount' | 'cumulativePnL') => {
        const ys = equityData.map(d => d[key]);
        const sumX = (n - 1) * n / 2;
        const sumX2 = (n - 1) * n * (2 * n - 1) / 6;
        const sumY = ys.reduce((s, y) => s + y, 0);
        const sumXY = ys.reduce((s, y, i) => s + i * y, 0);
        const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const a = (sumY - b * sumX) / n;
        const fits = ys.map((_, i) => a + b * i);
        const residuals = ys.map((y, i) => y - fits[i]);
        const variance = residuals.reduce((s, r) => s + r * r, 0) / n;
        const sigma = Math.sqrt(variance);
        return { fits, sigma };
      };
      const lrAmt = computeLR('cumulativeAmount');
      const lrPnL = computeLR('cumulativePnL');

      regressionLine = equityData.map((d, i) => ({
        date: d.date,
        value: Math.round(lrAmt.fits[i] * 100) / 100,
        valuePts: Math.round(lrPnL.fits[i] * 100) / 100,
      }));
      regressionUpper = equityData.map((d, i) => ({
        date: d.date,
        value: Math.round((lrAmt.fits[i] + lrAmt.sigma) * 100) / 100,
        valuePts: Math.round((lrPnL.fits[i] + lrPnL.sigma) * 100) / 100,
      }));
      regressionLower = equityData.map((d, i) => ({
        date: d.date,
        value: Math.round((lrAmt.fits[i] - lrAmt.sigma) * 100) / 100,
        valuePts: Math.round((lrPnL.fits[i] - lrPnL.sigma) * 100) / 100,
      }));
    }

    // --- Rolling 30-trade Win Rate + Profit Factor ---
    const sortedTrades = [...completedTrades].sort((a, b) =>
      a.date.localeCompare(b.date) || (a.id ?? '').localeCompare(b.id ?? '')
    );
    const W = 30;
    const tradePnLs = sortedTrades.map(t => {
      const pnl = t.side === 'LONG'
        ? (t.exit_price! - t.entry_price) * t.qty
        : (t.entry_price - t.exit_price!) * t.qty;
      return (pnl * getPointValue(t.symbol)) - getActualFee(t);
    });
    const rollingByDate = new Map<string, { wr: number; pf: number }>();
    for (let i = W - 1; i < sortedTrades.length; i++) {
      const window = tradePnLs.slice(i - W + 1, i + 1);
      const wins = window.filter(p => p > 0).length;
      const sumWin = window.filter(p => p > 0).reduce((s, p) => s + p, 0);
      const sumLoss = Math.abs(window.filter(p => p < 0).reduce((s, p) => s + p, 0));
      const wr = wins / W * 100;
      const pf = sumLoss > 0 ? sumWin / sumLoss : (sumWin > 0 ? 99 : 0);
      rollingByDate.set(sortedTrades[i].date, { wr, pf });
    }
    const rollingCurve = equityData.map(d => ({
      date: d.date,
      winRate: rollingByDate.get(d.date)?.wr ?? null,
      profitFactor: rollingByDate.get(d.date)?.pf ?? null,
    }));
    const overallWinRate = sortedTrades.length > 0
      ? sortedTrades.filter((_, i) => tradePnLs[i] > 0).length / sortedTrades.length * 100
      : 0;

    // --- Drawdown calculations (Based on cumulativeAmount, all-time) ---
    let peak = 0;
    let peakDate = '';
    let peakAmount = 0;
    let maxDrawdownPct = 0;
    let maxDrawdownAmt = 0;
    let maxDrawdownDate = '';
    let maxDrawdownStartDate = '';
    let maxDrawdownRecoveryDate: string | null = null;
    let maxDrawdownDays = 0;
    let currentDrawdownStartDate = '';

    let maxDrawdownPeakVal = 0; // the peak value when max drawdown occurred
    const allDrawdownCurve: { date: string; drawdownPct: number; drawdownAmt: number }[] = [];

    allEquityData.forEach((d) => {
      const val = d.accountEquity;
      if (val > peak) {
        peak = val;
        peakDate = d.date;
        peakAmount = val;
        currentDrawdownStartDate = '';
      }

      const ddAmt = peak > 0 ? Math.round((peak - val) * 100) / 100 : 0;
      const ddPct = peak > 0 ? Math.round(((peak - val) / peak) * 10000) / 100 : 0;

      allDrawdownCurve.push({ date: d.date, drawdownPct: ddPct, drawdownAmt: ddAmt });

      if (ddAmt > 0 && !currentDrawdownStartDate) {
        currentDrawdownStartDate = d.date;
      }

      if (ddPct > maxDrawdownPct) {
        maxDrawdownPct = ddPct;
        maxDrawdownAmt = ddAmt;
        maxDrawdownDate = d.date;
        maxDrawdownStartDate = currentDrawdownStartDate || d.date;
        maxDrawdownPeakVal = peak;
        maxDrawdownRecoveryDate = null;
      }
    });

    // Determine recovery: first date after max drawdown where equity >= peak that caused it
    if (maxDrawdownDate && maxDrawdownPeakVal > 0) {
      for (const d of allEquityData) {
        if (d.date <= maxDrawdownDate) continue;
        if (d.accountEquity >= maxDrawdownPeakVal) {
          maxDrawdownRecoveryDate = d.date;
          break;
        }
      }
    }

    // Calculate max drawdown days
    if (maxDrawdownDate && maxDrawdownStartDate) {
      const endDDDate = maxDrawdownRecoveryDate ?? allEquityData[allEquityData.length - 1]?.date ?? maxDrawdownDate;
      const startMs = new Date(maxDrawdownStartDate).getTime();
      const endMs = new Date(endDDDate).getTime();
      maxDrawdownDays = Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
    }

    // Current drawdown status
    const lastEquity = allEquityData.length > 0 ? allEquityData[allEquityData.length - 1].accountEquity : 0;
    const currentDrawdownAmt = peak > 0 ? Math.round((peak - lastEquity) * 100) / 100 : 0;
    const currentDrawdownPct = peak > 0 && lastEquity < peak
      ? Math.round(((peak - lastEquity) / peak) * 10000) / 100
      : 0;
    const isInDrawdown = currentDrawdownAmt > 0;

    // Filter drawdownCurve by days param (same as equityData)
    const drawdownCurve = allDrawdownCurve.filter(d => d.date >= startDateStr && d.date <= endDateStr);

    const allTimeStats = {
      maxDrawdownPct,
      maxDrawdownAmt,
      maxDrawdownDate: maxDrawdownDate || null,
      maxDrawdownRecoveryDate,
      maxDrawdownDays,
      currentDrawdownPct,
      currentDrawdownAmt,
      isInDrawdown,
      peakDate: peakDate || null,
      peakAmount: Math.round(peakAmount * 100) / 100,
    };

    return NextResponse.json({
      equityData,
      drawdownCurve,
      allTimeStats,
      startCumulativePnL: Math.round(startCumulativePnL * 100) / 100,
      startCumulativeAmount: Math.round(startCumulativeAmount * 100) / 100,
      regressionLine,
      regressionUpper,
      regressionLower,
      rollingCurve,
      overallWinRate: Math.round(overallWinRate * 100) / 100,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}
