'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/ui/loading';
import TradeTimelineChart from '@/components/ui/trade-timeline-chart';
import PnLDistributionChart from '@/components/ui/pnl-distribution-chart';
import { DashboardStats, Trade } from '@/types';
import { getDashboardStats } from '@/lib/actions/trades';
import { formatPnL, formatPnLAmount, getPnLColor, formatTime } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface DashboardOverviewProps {
  date: string;
}

export function DashboardOverview({ date }: DashboardOverviewProps) {
  const { isViewer } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true);
        const data = await getDashboardStats(date, isViewer);
        setStats(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [date, isViewer]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center space-y-2">
            <p className="text-destructive">載入失敗: {error}</p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              重新載入
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">今日還沒有交易數據</p>
        {!isViewer && (
          <div className="space-x-2">
            <Link href="/trades">
              <Button>新增交易</Button>
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總盈虧 (點數)</CardTitle>
            <span className="h-4 w-4 text-muted-foreground">📊</span>
          </CardHeader>
          <CardContent>
            <div className={`text-xl md:text-2xl font-bold ${getPnLColor(stats.totalPnL)}`}>
              {formatPnL(stats.totalPnL)}
            </div>
            <p className="text-xs text-muted-foreground">
              基於 {stats.tradeCount} 筆交易
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">總盈虧 (金額)</CardTitle>
            <span className="h-4 w-4 text-muted-foreground">💰</span>
          </CardHeader>
          <CardContent>
            <div className={`text-xl md:text-2xl font-bold ${getPnLColor(stats.totalPnLAmount)}`}>
              {formatPnLAmount(stats.totalPnLAmount)}
            </div>
            <p className="text-xs text-muted-foreground">
              每點 $2 計算
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均每口</CardTitle>
            <span className="h-4 w-4 text-muted-foreground">📈</span>
          </CardHeader>
          <CardContent>
            <div className={`text-xl md:text-2xl font-bold ${getPnLColor(stats.avgPnL)}`}>
              {formatPnL(stats.avgPnL)}
            </div>
            <p className="text-xs text-muted-foreground">
              點數/口
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">策略勝率</CardTitle>
            <span className="h-4 w-4 text-muted-foreground">🎯</span>
          </CardHeader>
          <CardContent>
            {(() => {
              const closedTrades = stats.trades.filter((t: Trade) => t.exit_price !== undefined && t.exit_price !== null);
              const strategyMap = new Map<string, { wins: number; total: number }>();
              for (const t of closedTrades) {
                const strat = t.strategy;
                if (!strat) continue;
                const pnl = t.side === 'LONG'
                  ? (t.exit_price! - t.entry_price) * t.qty
                  : (t.entry_price - t.exit_price!) * t.qty;
                if (!strategyMap.has(strat)) strategyMap.set(strat, { wins: 0, total: 0 });
                const entry = strategyMap.get(strat)!;
                entry.total += 1;
                if (pnl > 0) entry.wins += 1;
              }
              const strategies = Array.from(strategyMap.entries());
              if (strategies.length === 0) {
                return (
                  <>
                    <div className="text-xl md:text-2xl font-bold text-muted-foreground">--</div>
                    <p className="text-xs text-muted-foreground">今日尚無策略交易</p>
                  </>
                );
              }
              return (
                <div className="space-y-1.5 mt-1">
                  {strategies.map(([strat, { wins, total }]) => {
                    const wr = (wins / total) * 100;
                    const color = wr >= 60 ? 'text-green-400' : wr >= 50 ? 'text-yellow-400' : 'text-red-400';
                    return (
                      <div key={strat} className="flex items-center justify-between">
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-[#5E6AD2]/20 text-[#A5B4FC]">
                          {strat}
                        </span>
                        <span className={`text-sm font-semibold ${color}`}>
                          {wr.toFixed(0)}%
                          <span className="text-xs text-muted-foreground ml-1">({wins}/{total})</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Recent Trades */}
      {stats.trades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>今日交易</CardTitle>
            <CardDescription>
              最近的交易紀錄
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.trades.slice(0, 5).map((trade, index) => {
                const pnl = trade.exit_price && trade.entry_price
                  ? trade.side === 'LONG'
                    ? (trade.exit_price - trade.entry_price) * trade.qty
                    : (trade.entry_price - trade.exit_price) * trade.qty
                  : 0;

                return (
                  <div key={trade.id || index} className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-1 rounded text-xs font-medium ${trade.side === 'LONG'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          }`}>
                          {trade.side}
                        </div>
                        <div className={`px-2 py-1 rounded text-xs font-medium ${trade.symbol === 'NQ'
                          ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                          }`}>
                          {trade.symbol || 'MNQ'}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium">
                          {trade.entry_price} → {trade.exit_price || '未平倉'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {trade.qty} 口 • {formatTime(trade.entry_time)}
                        </div>
                      </div>
                    </div>
                    <div className={`font-medium ${getPnLColor(pnl)}`}>
                      {formatPnL(pnl)}
                    </div>
                  </div>
                );
              })}
            </div>

            {stats.trades.length > 5 && (
              <div className="mt-4 pt-4 border-t">
                <Link href="/trades">
                  <Button variant="outline" size="sm">
                    查看全部 {stats.trades.length} 筆交易
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Advanced Charts */}
      {stats.trades.length > 0 && (
        <div className="space-y-6">
          {/* Trade Timeline Chart */}
          <TradeTimelineChart date={date} />

          {/* P&L Distribution Chart */}
          <PnLDistributionChart date={date} />
        </div>
      )}

      {/* Quick Actions - 對 Viewer 隱藏 */}
      {!isViewer && (
        <Card>
          <CardHeader>
            <CardTitle>快速操作</CardTitle>
            <CardDescription>
              常用功能快速入口
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-3">
              <Link href="/trades">
                <Button className="w-full">新增交易</Button>
              </Link>
              <Link href="/review">
                <Button variant="outline" className="w-full">回顧分析</Button>
              </Link>
              <Link href="/calendar">
                <Button variant="outline" className="w-full">交易日曆</Button>
              </Link>

            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
