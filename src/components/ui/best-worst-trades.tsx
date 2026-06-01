'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getBestWorstTrades } from '@/lib/actions/trades';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { Badge } from './badge';
import { formatDate, formatTime, formatPnLAmountWithTwd, getPnLColor } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface BestWorstTradesProps {
  className?: string;
  usdTwdRate?: number;
}

type ViewMode = 'points' | 'amount';

interface TradeWithPnL {
  id?: string;
  date: string;
  symbol?: 'MNQ' | 'NQ';
  side: 'LONG' | 'SHORT';
  entry_time: string;
  entry_price: number;
  exit_time?: string;
  exit_price?: number;
  qty: number;
  notes?: string;
  pnl: number;
  amount: number;
}

export function BestWorstTrades({ className, usdTwdRate = 31.5 }: BestWorstTradesProps) {
  const { isViewer } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('amount');
  const [days, setDays] = useState(30);
  const [bestTrades, setBestTrades] = useState<TradeWithPnL[]>([]);
  const [worstTrades, setWorstTrades] = useState<TradeWithPnL[]>([]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getBestWorstTrades(days, 5, isViewer); // Top 5 each
      setBestTrades(response.bestTrades as TradeWithPnL[]);
      setWorstTrades(response.worstTrades as TradeWithPnL[]);
    } catch (err) {
      setError('載入交易排行失敗');
      console.error('Error fetching best/worst trades:', err);
    } finally {
      setLoading(false);
    }
  }, [days, isViewer]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatValue = (trade: TradeWithPnL): string => {
    const value = viewMode === 'points' ? trade.pnl : trade.amount;
    if (viewMode === 'points') {
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)} 點`;
    } else {
      return formatPnLAmountWithTwd(value, usdTwdRate);
    }
  };

  const TradeCard = ({ trade, rank }: { trade: TradeWithPnL; rank: number }) => {
    const value = viewMode === 'points' ? trade.pnl : trade.amount;

    return (
      <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center justify-center w-6 h-6 bg-gray-200 dark:bg-gray-700 rounded-full text-xs font-bold">
          {rank}
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant={trade.side === 'LONG' ? 'default' : 'secondary'}>
              {trade.side === 'LONG' ? '多' : '空'}
            </Badge>
            <div className={`px-2 py-0.5 rounded text-xs font-medium ${trade.symbol === 'NQ'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
              }`}>
              {trade.symbol || 'MNQ'}
            </div>
            <span className="text-sm font-medium">
              {trade.entry_price} → {trade.exit_price}
            </span>
            <span className="text-xs text-muted-foreground">
              × {trade.qty}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{formatDate(trade.date)}</span>
            <span>
              {formatTime(trade.entry_time)}
              {trade.exit_time && ` - ${formatTime(trade.exit_time)}`}
            </span>
          </div>


          {trade.notes && (
            <div className="text-xs text-muted-foreground mt-1 truncate">
              {trade.notes}
            </div>
          )}
        </div>

        <div className="text-right">
          <div className={`text-lg font-bold ${getPnLColor(value)}`}>
            {formatValue(trade)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`grid gap-6 md:grid-cols-2 ${className}`}>
      {/* Best Trades */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-green-600 dark:text-green-400">
                🏆 最佳交易 Best Trades
              </CardTitle>
              <CardDescription>
                表現最好的交易記錄 ({days}天)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            <Button
              variant={days === 7 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(7)}
            >
              7天
            </Button>
            <Button
              variant={days === 30 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(30)}
            >
              30天
            </Button>
            <Button
              variant={days === 90 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(90)}
            >
              90天
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="h-40 flex items-center justify-center">
              <div className="text-muted-foreground">載入中...</div>
            </div>
          )}

          {error && (
            <div className="h-40 flex items-center justify-center">
              <div className="text-red-500">{error}</div>
            </div>
          )}

          {!loading && !error && bestTrades.length === 0 && (
            <div className="h-40 flex items-center justify-center">
              <div className="text-muted-foreground">暫無獲利交易</div>
            </div>
          )}

          {!loading && !error && bestTrades.length > 0 && (
            <div className="space-y-3">
              {bestTrades.map((trade, index) => (
                <TradeCard key={trade.id} trade={trade} rank={index + 1} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Worst Trades */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-red-600 dark:text-red-400">
                📉 最差交易 Worst Trades
              </CardTitle>
              <CardDescription>
                需要改進的交易記錄 ({days}天)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
          <div className="flex items-center gap-2">
            <Button
              variant={days === 7 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(7)}
            >
              7天
            </Button>
            <Button
              variant={days === 30 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(30)}
            >
              30天
            </Button>
            <Button
              variant={days === 90 ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(90)}
            >
              90天
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="h-40 flex items-center justify-center">
              <div className="text-muted-foreground">載入中...</div>
            </div>
          )}

          {error && (
            <div className="h-40 flex items-center justify-center">
              <div className="text-red-500">{error}</div>
            </div>
          )}

          {!loading && !error && worstTrades.length === 0 && (
            <div className="h-40 flex items-center justify-center">
              <div className="text-muted-foreground">暫無虧損交易</div>
            </div>
          )}

          {!loading && !error && worstTrades.length > 0 && (
            <div className="space-y-3">
              {worstTrades.map((trade, index) => (
                <TradeCard key={trade.id} trade={trade} rank={index + 1} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BestWorstTrades;
