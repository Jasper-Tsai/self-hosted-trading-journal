'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { getTimePatterns } from '@/lib/actions/trades';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { formatPnLAmountWithTwd } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

interface TimePatternsProps {
  usdTwdRate?: number;
  className?: string;
}

type ViewMode = 'points' | 'amount';

interface TimePatternData {
  hour: number;
  count: number;
  totalPnL: number;
  totalAmount: number;
  wins: number;
  losses: number;
  winRate: number;
  avgPnL: number;
}

export function TimePatterns({ className, usdTwdRate = 31.5 }: TimePatternsProps) {
  const { isViewer } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('amount');
  const [days, setDays] = useState(30);
  const [timePatterns, setTimePatterns] = useState<TimePatternData[]>([]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getTimePatterns(days, isViewer);
      const patterns = response.timePatterns as TimePatternData[];
      setTimePatterns(patterns);
    } catch (err) {
      setError('Loading period analysis failed');
      console.error('Error fetching time patterns:', err);
    } finally {
      setLoading(false);
    }
  }, [days, isViewer]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatValue = (value: number): string => {
    if (viewMode === 'points') {
      return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
    } else {
      return formatPnLAmountWithTwd(value, usdTwdRate);
    }
  };

  const getValueColor = (value: number): string => {
    if (value > 0) return 'text-green-600 dark:text-green-400';
    if (value < 0) return 'text-red-600 dark:text-red-400';
    return 'text-gray-600 dark:text-gray-400';
  };

  const formatHour = (hour: number): string => {
    return `${hour.toString().padStart(2, '0')}:00`;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Time-of-day analysis</CardTitle>
            <CardDescription>
              Trading performance statistics for each time window ({days} days)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-2">
          <Button
            variant={days === 7 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDays(7)}
          >
            7 days
          </Button>
          <Button
            variant={days === 30 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDays(30)}
          >
            30 days
          </Button>
          <Button
            variant={days === 90 ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDays(90)}
          >
            90 days
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="h-40 flex items-center justify-center">
            <div className="text-muted-foreground">loading...</div>
          </div>
        )}

        {error && (
          <div className="h-40 flex items-center justify-center">
            <div className="text-red-500">{error}</div>
          </div>
        )}

        {!loading && !error && timePatterns.length === 0 && (
          <div className="h-40 flex items-center justify-center">
            <div className="text-muted-foreground">No time period information yet</div>
          </div>
        )}

        {!loading && !error && (
          <div>
            {/* Statistics Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left pb-2 font-medium">Time window</th>
                    <th className="text-center pb-2 font-medium">Trades</th>
                    <th className="text-center pb-2 font-medium">Win rate</th>
                    <th className="text-right pb-2 font-medium">Total profit and loss</th>
                    <th className="text-right pb-2 font-medium">average</th>
                  </tr>
                </thead>
                <tbody>
                  {timePatterns
                    .sort((a, b) => (viewMode === 'points' ? b.totalPnL : b.totalAmount) - (viewMode === 'points' ? a.totalPnL : a.totalAmount))
                    .map((pattern) => (
                      <tr key={pattern.hour} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-3">
                          <span className="font-medium">
                            {formatHour(pattern.hour)} - {formatHour(pattern.hour + 1)}
                          </span>
                        </td>
                        <td className="py-3 text-center">
                          <div>{pattern.count}</div>
                          <div className="text-xs text-muted-foreground">
                            {pattern.wins} wins, {pattern.losses} losses
                          </div>
                        </td>
                        <td className="py-3 text-center">
                          <span className={`font-medium ${pattern.winRate >= 60
                              ? 'text-green-600 dark:text-green-400'
                              : pattern.winRate >= 40
                                ? 'text-yellow-600 dark:text-yellow-400'
                                : 'text-red-600 dark:text-red-400'
                            }`}>
                            {pattern.winRate}%
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`font-medium ${getValueColor(
                            viewMode === 'points' ? pattern.totalPnL : pattern.totalAmount
                          )}`}>
                            {formatValue(
                              viewMode === 'points' ? pattern.totalPnL : pattern.totalAmount
                            )}
                          </span>
                        </td>
                        <td className="py-3 text-right">
                          <span className={`${getValueColor(pattern.avgPnL)}`}>
                            {formatValue(pattern.avgPnL)}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Best/Worst Time Periods */}
            {timePatterns.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">
                    best time
                  </h4>
                  {(() => {
                    const best = timePatterns.reduce((prev, current) => {
                      const prevValue = viewMode === 'points' ? prev.totalPnL : prev.totalAmount;
                      const currentValue = viewMode === 'points' ? current.totalPnL : current.totalAmount;
                      return currentValue > prevValue ? current : prev;
                    });

                    return (
                      <div>
                        <div className="font-medium">
                          {formatHour(best.hour)} - {formatHour(best.hour + 1)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatValue(viewMode === 'points' ? best.totalPnL : best.totalAmount)} | winning rate {best.winRate}%
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <h4 className="font-medium text-red-800 dark:text-red-200 mb-2">
                    worst time
                  </h4>
                  {(() => {
                    const worst = timePatterns.reduce((prev, current) => {
                      const prevValue = viewMode === 'points' ? prev.totalPnL : prev.totalAmount;
                      const currentValue = viewMode === 'points' ? current.totalPnL : current.totalAmount;
                      return currentValue < prevValue ? current : prev;
                    });

                    return (
                      <div>
                        <div className="font-medium">
                          {formatHour(worst.hour)} - {formatHour(worst.hour + 1)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {formatValue(viewMode === 'points' ? worst.totalPnL : worst.totalAmount)} | winning rate {worst.winRate}%
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TimePatterns;
