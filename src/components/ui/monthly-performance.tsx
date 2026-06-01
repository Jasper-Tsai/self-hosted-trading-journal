'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getCalendarHeatmap } from '@/lib/actions/trades';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { formatPnLAmountWithTwd, parseDateString } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
// Removed lucide-react dependency for simpler design

interface MonthlyPerformanceProps {
  usdTwdRate?: number;
  className?: string;
}

type ViewMode = 'points' | 'amount';

interface HeatmapData {
  date: string;
  pnl: number;
  amount: number;
  intensity: number;
}

interface YearlySummary {
  year: number;
  totalAmountUsd: number;
  totalTrades: number;
  totalWins: number;
  winRate: number;
}

interface MonthlyData {
  month: string;
  year: number;
  totalPnL: number;
  totalAmount: number;
  tradingDays: number;
  winDays: number;
  lossDays: number;
  winRate: number;
  strategyWinRate?: number;  // 策略勝率（逐筆交易計算）
  strategyTrades?: number;   // 策略交易數
  strategyWins?: number;     // 策略獲利交易數
  avgDailyPoints: number;
  avgDailyAmount: number;
}

export function MonthlyPerformance({ className, usdTwdRate = 31.5 }: MonthlyPerformanceProps) {
  const { isViewer } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('amount');
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [yearlyData, setYearlyData] = useState<YearlySummary[]>([]);
  const [yearlyMaxDrawdown, setYearlyMaxDrawdown] = useState<Record<number, number>>({});

  // Fetch and process data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getCalendarHeatmap(isViewer);
      const heatmapData = response.heatmapData as HeatmapData[];
      const strategyStats = response.strategyStats as Array<{
        monthKey: string;
        strategicTrades: number;
        strategicWins: number;
        strategyWinRate: number;
      }> || [];
      const yearlyWinRateStats = response.yearlyWinRateStats as Array<{
        year: number;
        totalTrades: number;
        totalWins: number;
        winRate: number;
      }> || [];

      // Process data into monthly summaries
      const monthlyMap = new Map<string, MonthlyData>();

      heatmapData.forEach((item) => {
        const parts = parseDateString(item.date);
        if (!parts) return;
        const monthIndex = parts.month - 1;
        const monthKey = `${parts.year}-${String(parts.month).padStart(2, '0')}`;
        const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];

        if (!monthlyMap.has(monthKey)) {
          monthlyMap.set(monthKey, {
            month: monthNames[monthIndex],
            year: parts.year,
            totalPnL: 0,
            totalAmount: 0,
            tradingDays: 0,
            winDays: 0,
            lossDays: 0,
            winRate: 0,
            strategyWinRate: undefined,
            strategyTrades: undefined,
            strategyWins: undefined,
            avgDailyPoints: 0,
            avgDailyAmount: 0
          });
        }

        const monthData = monthlyMap.get(monthKey)!;
        monthData.totalPnL += item.pnl;
        monthData.totalAmount += item.amount;
        monthData.tradingDays += 1;

        // 以金額（amount）判斷獲利/虧損，而不是點數
        if (item.amount > 0) {
          monthData.winDays += 1;
        } else if (item.amount < 0) {
          monthData.lossDays += 1;
        }
      });

      // Calculate derived metrics
      monthlyMap.forEach((monthData, monthKey) => {
        monthData.winRate = monthData.tradingDays > 0 ? (monthData.winDays / monthData.tradingDays) * 100 : 0;
        monthData.avgDailyPoints = monthData.tradingDays > 0 ? monthData.totalPnL / monthData.tradingDays : 0;
        monthData.avgDailyAmount = monthData.tradingDays > 0 ? monthData.totalAmount / monthData.tradingDays : 0;

        // Merge strategy stats from API response
        const strategyStat = strategyStats.find(s => s.monthKey === monthKey);
        if (strategyStat) {
          monthData.strategyTrades = strategyStat.strategicTrades;
          monthData.strategyWins = strategyStat.strategicWins;
          monthData.strategyWinRate = strategyStat.strategyWinRate;
        }
      });

      // Convert to array and sort by date (newest first)
      const sortedData = Array.from(monthlyMap.values()).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        const monthOrder = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
        return monthOrder.indexOf(b.month) - monthOrder.indexOf(a.month);
      });

      setMonthlyData(sortedData);

      // Calculate yearly summaries for annualized return
      const yearMap = new Map<number, number>();
      sortedData.forEach((m) => {
        yearMap.set(m.year, (yearMap.get(m.year) || 0) + m.totalAmount);
      });
      const yearSummaries: YearlySummary[] = Array.from(yearMap.entries())
        .map(([year, totalAmountUsd]) => {
          const winRateStat = yearlyWinRateStats.find(s => s.year === year);
          return {
            year,
            totalAmountUsd,
            totalTrades: winRateStat?.totalTrades ?? 0,
            totalWins: winRateStat?.totalWins ?? 0,
            winRate: winRateStat?.winRate ?? 0,
          };
        })
        .sort((a, b) => b.year - a.year);
      setYearlyData(yearSummaries);

      // 計算每年度最大回撤 (USD)
      // 將每日金額按年分組，年內按日期排序，追蹤累計高峰與最大回落
      const yearlyDailyAmounts = new Map<number, Array<{ date: string; amount: number }>>();
      heatmapData.forEach((item) => {
        const parts = parseDateString(item.date);
        if (!parts) return;
        const year = parts.year;
        if (!yearlyDailyAmounts.has(year)) {
          yearlyDailyAmounts.set(year, []);
        }
        yearlyDailyAmounts.get(year)!.push({ date: item.date, amount: item.amount });
      });

      const maxDrawdownMap: Record<number, number> = {};
      yearlyDailyAmounts.forEach((days, year) => {
        days.sort((a, b) => a.date.localeCompare(b.date));
        let cumulative = 0;
        let peak = 0;
        let maxDrawdown = 0;
        for (const day of days) {
          cumulative += day.amount;
          if (cumulative > peak) peak = cumulative;
          const drawdown = peak - cumulative;
          if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        }
        maxDrawdownMap[year] = maxDrawdown;
      });
      setYearlyMaxDrawdown(maxDrawdownMap);
    } catch (err) {
      setError('載入月度績效失敗');
      console.error('Error fetching monthly performance:', err);
    } finally {
      setLoading(false);
    }
  }, [isViewer]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatNumber = (value: number, isAmount = false) => {
    if (isAmount) {
      return formatPnLAmountWithTwd(value, usdTwdRate);
    }
    return value > 0 ? `+${value.toFixed(2)}` : `${value.toFixed(2)}`;
  };

  const getPnLColor = (value: number) => {
    if (value > 0) return 'text-green-400';
    if (value < 0) return 'text-red-400';
    return 'text-muted-foreground';
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>
            📊 月度交易績效
          </CardTitle>
          <CardDescription>過去一年每月交易表現總覽</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">載入中...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>
            📊 月度交易績效
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-400 py-8">{error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>
              📊 月度交易績效
            </CardTitle>
            <CardDescription>過去一年每月交易表現總覽</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'points' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('points')}
            >
              點數
            </Button>
            <Button
              variant={viewMode === 'amount' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('amount')}
            >
              金額
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {monthlyData.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">尚無交易資料</div>
        ) : (
          <div className="space-y-6">
            {yearlyData.map((yearSummary) => {
              const yearMonths = monthlyData.filter((m) => m.year === yearSummary.year);

              const maxDrawdownUsd = yearlyMaxDrawdown[yearSummary.year] || 0;

              return (
                <div key={yearSummary.year}>
                  {/* Year Header with Annualized Return & Win Rate */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 px-1">
                    <h3 className="text-lg font-semibold">{yearSummary.year}年</h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:items-center sm:gap-4">
                      {yearSummary.totalTrades > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm text-muted-foreground">勝率</span>
                          <span className={`text-sm sm:text-lg font-bold ${yearSummary.winRate >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                            {yearSummary.winRate.toFixed(1)}%
                          </span>
                        </div>
                      )}
                      {maxDrawdownUsd > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs sm:text-sm text-muted-foreground">最大回撤</span>
                          <span className="text-sm sm:text-lg font-bold text-red-400">
                            {formatPnLAmountWithTwd(-maxDrawdownUsd, usdTwdRate)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Monthly Cards for this year */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {yearMonths.map((month, index) => {
                      const value = viewMode === 'points' ? month.totalPnL : month.totalAmount;
                      const avgValue = viewMode === 'points' ? month.avgDailyPoints : month.avgDailyAmount;

                      return (
                        <Card key={index} className="border bg-card/50">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">
                                {month.year}年 {month.month}
                              </CardTitle>
                              <div className={`${getPnLColor(value)} text-lg`}>
                                {value > 0 ? '📈' : value < 0 ? '📉' : '⚪'}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {/* 總盈虧 */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">總盈虧</span>
                              <span className={`font-semibold ${getPnLColor(value)}`}>
                                {formatNumber(value, viewMode === 'amount')}
                                {viewMode === 'points' && ' 點'}
                              </span>
                            </div>

                            {/* 交易天數 */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">交易天數</span>
                              <span className="font-medium">{month.tradingDays} 天</span>
                            </div>

                            {/* 勝率 - 只有 Owner 可以看到（按天計算） */}
                            {!isViewer && (
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">勝率</span>
                                <span className={`font-medium ${month.winRate >= 50 ? 'text-green-400' : 'text-yellow-400'
                                  }`}>
                                  {month.winRate.toFixed(1)}%
                                </span>
                              </div>
                            )}

                            {/* 策略勝率（按逐筆交易計算） */}
                            {month.strategyTrades && month.strategyTrades > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-muted-foreground">{isViewer ? '勝率' : '策略勝率'}</span>
                                <span className={`font-medium ${(month.strategyWinRate ?? 0) >= 50 ? 'text-green-400' : 'text-yellow-400'}`}>
                                  {month.strategyWinRate?.toFixed(1)}%
                                </span>
                              </div>
                            )}

                            {/* 獲利/虧損天數 - 只有 Owner 可以看到 */}
                            {!isViewer && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-muted-foreground">獲利/虧損</span>
                                <span>
                                  <span className="text-green-400">{month.winDays}</span>
                                  <span className="text-muted-foreground"> / </span>
                                  <span className="text-red-400">{month.lossDays}</span>
                                </span>
                              </div>
                            )}

                            {/* 日均盈虧 */}
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">日均</span>
                              <span className={`text-sm ${getPnLColor(avgValue)}`}>
                                {formatNumber(avgValue, viewMode === 'amount')}
                                {viewMode === 'points' && ' 點'}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
