'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { getTradesInRange } from '@/lib/actions/trades';
import { formatPnL, formatPnLAmountWithTwd, getPnLColor, getPointValue, getFeeByBroker, getTodayString, getWeekdayLabel, parseDateString } from '@/lib/utils';
import { classifyByPointsPerContract, computeWinRate } from '@/lib/win-rate';

interface DailyPnL {
  date: string;
  totalPnL: number;
  totalPnLAmount: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
}

interface DailyPnLSummaryProps {
  usdTwdRate?: number;
  className?: string;
}

export function DailyPnLSummary({ className, usdTwdRate = 31.5 }: DailyPnLSummaryProps) {
  const [dailyData, setDailyData] = useState<DailyPnL[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'points' | 'amount'>('amount');
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getTodayString().slice(0, 7));

  const fetchDailyData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all trade data for this month
      const year = parseInt(selectedMonth.split('-')[0]);
      const month = parseInt(selectedMonth.split('-')[1]);

      const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const trades = await getTradesInRange(startDateStr, endDateStr);

      // Group by date and calculate daily profit and loss (group Hierarchy)
      const dailyMap = new Map<string, DailyPnL>();
      // Accumulate each group of P&L
      const groupPnL = new Map<string, { date: string; amount: number; points: number; qty: number }>();

      trades.forEach(trade => {
        const date = trade.date;
        const pnl = trade.exit_price && trade.entry_price
          ? trade.side === 'LONG'
            ? (trade.exit_price - trade.entry_price) * trade.qty
            : (trade.entry_price - trade.exit_price) * trade.qty
          : 0;

        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            totalPnL: 0,
            totalPnLAmount: 0,
            tradeCount: 0,
            winCount: 0,
            lossCount: 0,
            winRate: 0
          });
        }

        const dayData = dailyMap.get(date)!;
        const pointValue = getPointValue(trade.symbol);
        // force recalculationManualfee, Because it may have been stored with the wrong rate before
        const broker = trade.broker || 'Manual';
        const actualFee = broker === 'Manual'
          ? getFeeByBroker(broker, trade.symbol) * trade.qty
          : (trade.fee ?? (getFeeByBroker(broker, trade.symbol) * trade.qty));
        const amount = (pnl * pointValue) - actualFee; // Calculate the amount Based on the product and deduct the fee

        dayData.totalPnL += pnl;
        dayData.totalPnLAmount += amount;

        // Group-level P&L aggregation
        const groupKey = trade.trade_group_id ?? trade.id ?? `${trade.date}_${trade.entry_time}`;
        const g = groupPnL.get(groupKey) || { date, amount: 0, points: 0, qty: 0 };
        g.amount += amount;
        g.points += (trade.exit_price && trade.entry_price) ? pnl : 0;
        g.qty += (trade.exit_price && trade.entry_price) ? trade.qty : 0;
        groupPnL.set(groupKey, g);
      });

      // Count wins/losses at group level (|Average points per bite| ≤ 5 Calculate a draw, Tie excludes denominator)
      for (const g of groupPnL.values()) {
        const dayData = dailyMap.get(g.date);
        if (!dayData) continue;
        if (g.qty <= 0) continue; // Not yet available group Not counted
        dayData.tradeCount += 1;
        const outcome = classifyByPointsPerContract(g.points, g.qty);
        if (outcome === 'win') dayData.winCount += 1;
        else if (outcome === 'loss') dayData.lossCount += 1;
        dayData.winRate = computeWinRate(dayData.winCount, dayData.lossCount);
      }

      // Convert to array and sort
      const sortedData = Array.from(dailyMap.values()).sort((a, b) =>
        b.date.localeCompare(a.date)
      );

      setDailyData(sortedData);
    } catch (err) {
      setError('Failed to load daily profit and loss data');
      console.error('Error fetching daily PnL:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchDailyData();
  }, [fetchDailyData]);

  const formatDate = (dateString: string) => {
    const parts = parseDateString(dateString);
    if (!parts) return dateString;
    const month = parts.month;
    const day = parts.day;
    const weekday = getWeekdayLabel(dateString);
    return `${month}/${day} (${weekday})`;
  };

  const generateMonthOptions = () => {
    const options: { value: string; label: string }[] = [];
    const todayParts = parseDateString(getTodayString());
    if (!todayParts) return options;

    // generate past12month options
    for (let i = 0; i < 12; i++) {
      const date = new Date(Date.UTC(todayParts.year, todayParts.month - 1 - i, 1));
      const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const label = `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}`;
      options.push({ value, label });
    }

    return options;
  };

  const monthOptions = generateMonthOptions();
  const totalPnL = dailyData.reduce((sum, day) => sum + day.totalPnL, 0);
  const totalPnLAmount = dailyData.reduce((sum, day) => sum + day.totalPnLAmount, 0);
  const totalTrades = dailyData.reduce((sum, day) => sum + day.tradeCount, 0);
  const tradingDays = dailyData.filter(day => day.tradeCount > 0).length;
  const profitableDays = dailyData.filter(day => day.totalPnL > 0).length;

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="h-64 flex items-center justify-center">
          <div className="text-red-500">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Daily profit and loss overview</CardTitle>
            <CardDescription>
              Trading profit and loss statistics displayed by date
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
            >
              {monthOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button
              variant={viewMode === 'points' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('points')}
            >
              Points
            </Button>
            <Button
              variant={viewMode === 'amount' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('amount')}
            >
              Amount
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {dailyData.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <div className="text-muted-foreground">There is no trade data for this month</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Monthly Statistics Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-muted rounded-lg">
              <div className="text-center">
                <div className={`text-lg font-bold ${getPnLColor(viewMode === 'points' ? totalPnL : totalPnLAmount)}`}>
                  {viewMode === 'points' ? formatPnL(totalPnL) : formatPnLAmountWithTwd(totalPnLAmount, usdTwdRate)}
                </div>
                <div className="text-xs text-muted-foreground">Total monthly profit and loss</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{totalTrades}</div>
                <div className="text-xs text-muted-foreground">Total trades</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">{tradingDays}</div>
                <div className="text-xs text-muted-foreground">Trading days</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{profitableDays}</div>
                <div className="text-xs text-muted-foreground">profit days</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold">
                  {tradingDays > 0 ? ((profitableDays / tradingDays) * 100).toFixed(1) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">Profitable days ratio</div>
              </div>
            </div>

            {/* Daily profit and loss list */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {dailyData.map((dayData, index) => {
                const displayPnL = viewMode === 'points' ? dayData.totalPnL : dayData.totalPnLAmount;

                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-sm font-medium min-w-[80px]">
                        {formatDate(dayData.date)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {dayData.tradeCount} trades
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-xs text-muted-foreground">
                        {dayData.winCount} wins, {dayData.lossCount} losses ({dayData.winRate.toFixed(0)}%)
                      </div>
                      <div className={`text-sm font-bold text-right min-w-[80px] ${getPnLColor(displayPnL)}`}>
                        {viewMode === 'points' ? formatPnL(displayPnL) : formatPnLAmountWithTwd(displayPnL, usdTwdRate)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default DailyPnLSummary;
