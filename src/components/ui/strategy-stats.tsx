'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { apiGet } from '@/lib/api-client';

interface StrategyStat {
  strategy: string;
  trades: number;
  wins: number;
  winRate: number;
  color: string;
}

interface StrategyStatsData {
  allTimeStats: StrategyStat[];
  rangeStats: StrategyStat[];
}

type RangeDays = 30 | 90 | 180 | 'all';

const RANGE_OPTIONS: { label: string; value: RangeDays }[] = [
  { label: '30天', value: 30 },
  { label: '90天', value: 90 },
  { label: '180天', value: 180 },
  { label: '全部', value: 'all' },
];

export function StrategyStats({ className }: { className?: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<StrategyStatsData | null>(null);
  const [rangeDays, setRangeDays] = useState<RangeDays>(90);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await apiGet<StrategyStatsData>(
          `/api/stats/strategy?days=${rangeDays}`
        );
        setData(result);
      } catch {
        setError('載入策略勝率失敗');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [rangeDays]);

  const getWinRateColor = (winRate: number, trades: number) => {
    if (trades === 0) return 'text-muted-foreground';
    if (winRate >= 60) return 'text-green-400';
    if (winRate >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>策略勝率統計</CardTitle>
            <CardDescription>各策略歷史勝率與近期區間勝率</CardDescription>
          </div>
          <div className="flex gap-2">
            {RANGE_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={rangeDays === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRangeDays(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="flex items-center justify-center h-32">
            <span className="text-muted-foreground">載入中...</span>
          </div>
        )}
        {error && (
          <div className="text-center text-red-400 py-8">{error}</div>
        )}
        {!loading && !error && data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">策略</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">歷史筆數</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">歷史勝率</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">
                    近 {rangeDays === 'all' ? '全部' : `${rangeDays}天`} 筆數
                  </th>
                  <th className="text-right py-2 pl-3 text-muted-foreground font-medium">
                    近 {rangeDays === 'all' ? '全部' : `${rangeDays}天`} 勝率
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.allTimeStats.map((row) => {
                  const rangeRow = data.rangeStats.find(r => r.strategy === row.strategy);
                  return (
                    <tr key={row.strategy} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-3 pr-4 font-medium">
                        {row.strategy === '無' ? (
                          <span className="text-muted-foreground">無</span>
                        ) : (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold"
                            style={{
                              backgroundColor: `${row.color}33`,
                              color: row.color,
                            }}
                          >
                            {row.strategy}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        {row.trades > 0 ? `${row.wins}/${row.trades}` : '—'}
                      </td>
                      <td className={`py-3 px-3 text-right font-semibold ${getWinRateColor(row.winRate, row.trades)}`}>
                        {row.trades > 0 ? `${row.winRate.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-muted-foreground">
                        {rangeRow && rangeRow.trades > 0 ? `${rangeRow.wins}/${rangeRow.trades}` : '—'}
                      </td>
                      <td className={`py-3 pl-3 text-right font-semibold ${rangeRow ? getWinRateColor(rangeRow.winRate, rangeRow.trades) : 'text-muted-foreground'}`}>
                        {rangeRow && rangeRow.trades > 0 ? `${rangeRow.winRate.toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
