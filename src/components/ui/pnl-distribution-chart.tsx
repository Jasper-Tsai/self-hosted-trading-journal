'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { getTradesByDate } from '@/lib/actions/trades';

interface Trade {
  id: string;
  entry_price: number;
  exit_price?: number;
  qty: number;
  side: 'LONG' | 'SHORT';
  pnl?: number;
  strategies?: string[];
}

interface PnLDistribution {
  range: string;
  count: number;
  percentage: number;
  totalPnL: number;
  color: string;
}

interface PnLDistributionChartProps {
  date: string;
  className?: string;
}

export function PnLDistributionChart({ date, className }: PnLDistributionChartProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'points' | 'amount'>('amount');
  const [bucketSize, setBucketSize] = useState<number>(50); // 每個區間的點數範圍

  // 金額模式的區間大小選項 (對應點數 30/50/100)
  const amountBuckets = { 30: 600, 50: 1000, 100: 2000 } as const;

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const trades = await getTradesByDate(date);
      const tradesWithPnL = trades
        .filter(trade => trade.exit_price) // 只顯示已平倉的交易
        .map(trade => ({
          ...trade,
          pnl: trade.side === 'LONG'
            ? ((trade.exit_price || 0) - trade.entry_price) * trade.qty
            : (trade.entry_price - (trade.exit_price || 0)) * trade.qty
        }));
      setTrades(tradesWithPnL as unknown as Trade[]);
    } catch (err) {
      setError('載入交易資料失敗');
      console.error('Error fetching trades:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // 計算盈虧分布
  const calculateDistribution = (): PnLDistribution[] => {
    if (trades.length === 0) return [];

    const pnlValues = trades.map(trade => viewMode === 'points' ? trade.pnl! : (trade.pnl! * 2));
    const minPnL = Math.min(...pnlValues);
    const maxPnL = Math.max(...pnlValues);

    // 使用使用者選擇的bucketSize來建立區間
    // 金額模式使用自定義的區間大小
    const actualBucketSize = viewMode === 'points' ? bucketSize : (amountBuckets[bucketSize as keyof typeof amountBuckets] || bucketSize * 20);
    const buckets: { [key: string]: { count: number; totalPnL: number; min: number; max: number } } = {};

    // 根據數據範圍與bucketSize建立區間
    const startBucket = Math.floor(minPnL / actualBucketSize) * actualBucketSize;
    const endBucket = Math.ceil(maxPnL / actualBucketSize) * actualBucketSize;

    // 初始化區間，使用固定的bucketSize
    for (let i = startBucket; i < endBucket; i += actualBucketSize) {
      const min = i;
      const max = i + actualBucketSize;
      const key = `${min.toFixed(1)}_${max.toFixed(1)}`;
      buckets[key] = { count: 0, totalPnL: 0, min, max };
    }

    // 分配交易到各區間
    pnlValues.forEach(pnl => {
      for (const [, bucket] of Object.entries(buckets)) {
        if (pnl >= bucket.min && pnl <= bucket.max) {
          bucket.count++;
          bucket.totalPnL += pnl;
          break;
        }
      }
    });

    const distribution: PnLDistribution[] = Object.entries(buckets).map(([, bucket]) => {
      const percentage = (bucket.count / trades.length) * 100;
      const avg = (bucket.min + bucket.max) / 2;

      // 根據平均值決定顏色
      const getColor = (avgPnL: number) => {
        // 根據顯示模式調整閥值：點數模式用點數，金額模式用金額(1點=2元)
        const threshold = viewMode === 'points' ? {
          bigProfit: 30,
          smallProfit: 15,
          smallLoss: -30,
          bigLoss: -50
        } : {
          bigProfit: 60,  // 30點 * 2
          smallProfit: 30, // 15點 * 2
          smallLoss: -60,  // -30點 * 2
          bigLoss: -100    // -50點 * 2
        };

        if (avgPnL > threshold.bigProfit) return 'bg-green-600';
        if (avgPnL > threshold.smallProfit) return 'bg-green-500';
        if (avgPnL > 0) return 'bg-green-400';
        if (avgPnL > threshold.smallLoss) return 'bg-yellow-400';
        if (avgPnL > threshold.bigLoss) return 'bg-orange-500';
        return 'bg-red-600';
      };

      const formatRange = (min: number, max: number) => {
        if (viewMode === 'points') {
          return `${min.toFixed(1)} ~ ${max.toFixed(1)}`;
        } else {
          return `$${Math.abs(min).toFixed(0)} ~ $${Math.abs(max).toFixed(0)}`;
        }
      };

      return {
        range: formatRange(bucket.min, bucket.max),
        count: bucket.count,
        percentage,
        totalPnL: bucket.totalPnL,
        color: getColor(avg)
      };
    }).filter(item => item.count > 0)
      .sort((a, b) => {
        // 按照範圍排序（從負到正）
        const aMin = parseFloat(a.range.split(' ~ ')[0].replace('$', ''));
        const bMin = parseFloat(b.range.split(' ~ ')[0].replace('$', ''));
        return aMin - bMin;
      });

    return distribution;
  };

  const distribution = calculateDistribution();
  const maxCount = Math.max(...distribution.map(d => d.count), 1);
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
  const losingTrades = trades.filter(t => (t.pnl || 0) < 0).length;
  const breakEvenTrades = trades.filter(t => (t.pnl || 0) === 0).length;

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">載入中...</div>
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
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base sm:text-lg">盈虧分布 P&L Distribution</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                交易盈虧區間分布統計（已平倉交易）
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant={viewMode === 'points' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('points')}
                className="text-xs px-3 h-8"
              >
                點數
              </Button>
              <Button
                variant={viewMode === 'amount' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('amount')}
                className="text-xs px-3 h-8"
              >
                金額
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs sm:text-sm text-muted-foreground shrink-0">區間大小:</span>
            <Button
              variant={bucketSize === 30 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setBucketSize(30)}
              className="text-xs h-8"
            >
              {viewMode === 'points' ? '30點' : '600元'}
            </Button>
            <Button
              variant={bucketSize === 50 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setBucketSize(50)}
              className="text-xs h-8"
            >
              {viewMode === 'points' ? '50點' : '1000元'}
            </Button>
            <Button
              variant={bucketSize === 100 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setBucketSize(100)}
              className="text-xs h-8"
            >
              {viewMode === 'points' ? '100點' : '2000元'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {distribution.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <div className="text-muted-foreground">暫無已平倉交易資料</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 柱狀圖 */}
            <div className="space-y-2">
              {distribution.map((item, index) => {
                const height = (item.count / maxCount) * 200;
                return (
                  <div key={index} className="flex items-end gap-2">
                    {/* Y軸標籤（盈虧區間） */}
                    <div className="w-24 text-xs text-right text-muted-foreground flex-shrink-0">
                      {item.range}
                    </div>

                    {/* 柱狀圖條 */}
                    <div className="flex-1 flex items-end">
                      <div
                        className={`${item.color} rounded-r-md transition-all duration-300 hover:opacity-80 cursor-pointer relative group`}
                        style={{ width: `${height}px`, height: '24px' }}
                        title={`${item.range}: ${item.count}筆交易 (${item.percentage.toFixed(1)}%)`}
                      >
                        {/* 懸停資訊 */}
                        <div className="absolute left-full ml-2 top-1/2 transform -translate-y-1/2 bg-black text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                          {item.count}筆 ({item.percentage.toFixed(1)}%)
                          <br />
                          合計: {viewMode === 'points'
                            ? `${item.totalPnL > 0 ? '+' : ''}${item.totalPnL.toFixed(1)}點`
                            : `${item.totalPnL > 0 ? '+' : ''}$${Math.abs(item.totalPnL).toFixed(2)}`
                          }
                        </div>
                      </div>

                      {/* 數量標籤 */}
                      <span className="ml-2 text-sm font-medium min-w-8">
                        {item.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X軸標籤 */}
            <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
              <span>0</span>
              <span className="text-center">交易次數</span>
              <span>{maxCount}</span>
            </div>

            {/* 統計摘要 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="font-bold text-green-600">
                  {winningTrades}
                </div>
                <div className="text-green-700 dark:text-green-400">
                  獲利交易
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0}%
                </div>
              </div>

              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="font-bold text-red-600">
                  {losingTrades}
                </div>
                <div className="text-red-700 dark:text-red-400">
                  虧損交易
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalTrades > 0 ? ((losingTrades / totalTrades) * 100).toFixed(1) : 0}%
                </div>
              </div>

              <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="font-bold">
                  {breakEvenTrades}
                </div>
                <div className="text-muted-foreground">
                  損益平衡
                </div>
                <div className="text-xs text-muted-foreground">
                  {totalTrades > 0 ? ((breakEvenTrades / totalTrades) * 100).toFixed(1) : 0}%
                </div>
              </div>

              <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="font-bold text-blue-600">
                  {winningTrades > 0 && losingTrades > 0
                    ? (winningTrades / losingTrades).toFixed(2)
                    : '--'
                  }
                </div>
                <div className="text-blue-700 dark:text-blue-400">
                  盈虧比
                </div>
                <div className="text-xs text-muted-foreground">
                  Win/Loss Ratio
                </div>
              </div>
            </div>

            {/* 圖例 */}
            <div className="flex items-center justify-center gap-4 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-600 rounded"></div>
                <span>大幅虧損 (&lt;-{viewMode === 'points' ? '30點' : '60元'})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-yellow-400 rounded"></div>
                <span>小幅損益 ({viewMode === 'points' ? '-30~+30點' : '-60~+60元'})</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-600 rounded"></div>
                <span>大幅獲利 (&gt;+{viewMode === 'points' ? '30點' : '60元'})</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PnLDistributionChart;
