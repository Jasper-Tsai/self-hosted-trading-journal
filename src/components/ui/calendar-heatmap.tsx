'use client';

import React, { useEffect, useState } from 'react';
import { getCalendarHeatmap } from '@/lib/actions/trades';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { formatDate, getTodayString, parseDateString } from '@/lib/utils';

interface CalendarHeatmapProps {
  className?: string;
}

type ViewMode = 'points' | 'amount';

interface HeatmapData {
  date: string;
  pnl: number;
  amount: number;
  intensity: number;
}

export function CalendarHeatmap({ className }: CalendarHeatmapProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('amount');
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getCalendarHeatmap();
      setHeatmapData(response.heatmapData as HeatmapData[]);
    } catch (err) {
      setError('Failed to load heat map');
      console.error('Error fetching calendar heatmap:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Generate calendar grid for the past year
  const generateCalendarGrid = () => {
    const todayParts = parseDateString(getTodayString());
    if (!todayParts) return [];

    const endDate = new Date(Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day));
    const startDate = new Date(endDate);
    startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);

    const dataMap = new Map(heatmapData.map(d => [d.date, d]));
    const weeks: Array<Array<{ date: string; data?: HeatmapData }>> = [];

    // Start from the first Sunday of the range
    const current = new Date(startDate);
    const dayOfWeek = current.getUTCDay();
    current.setUTCDate(current.getUTCDate() - dayOfWeek);

    while (current <= endDate) {
      const week: Array<{ date: string; data?: HeatmapData }> = [];

      for (let i = 0; i < 7; i++) {
        const cellDate = new Date(current);
        const year = cellDate.getUTCFullYear();
        const month = String(cellDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(cellDate.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const data = dataMap.get(dateStr);

        week.push({
          date: dateStr,
          data
        });

        current.setUTCDate(current.getUTCDate() + 1);
      }

      weeks.push(week);
    }

    return weeks;
  };

  // Get color Based on P&L value
  const getHeatmapColor = (data?: HeatmapData): string => {
    if (!data) return 'bg-gray-100 dark:bg-gray-800';

    const value = viewMode === 'points' ? data.pnl : data.amount;

    if (value > 0) {
      // Positive values - green shades
      if (value >= 20) return 'bg-green-600';
      if (value >= 10) return 'bg-green-500';
      if (value >= 5) return 'bg-green-400';
      if (value > 0) return 'bg-green-300';
    } else if (value < 0) {
      // Negative values - red shades
      if (value <= -20) return 'bg-red-600';
      if (value <= -10) return 'bg-red-500';
      if (value <= -5) return 'bg-red-400';
      if (value < 0) return 'bg-red-300';
    }

    return 'bg-gray-200 dark:bg-gray-700'; // Zero
  };

  const formatTooltip = (data?: HeatmapData): string => {
    if (!data) return 'no deal';

    const value = viewMode === 'points' ? data.pnl : data.amount;
    return viewMode === 'points'
      ? `${value >= 0 ? '+' : ''}${value.toFixed(2)} point`
      : `${value >= 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
  };

  const weeks = generateCalendarGrid();
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const weekdays = ['day', 'one', 'two', 'three', 'Four', 'five', 'six'];

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Calendar Heatmap</CardTitle>
            <CardDescription>
              Daily profit and loss distribution in the past year
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

        {!loading && !error && (
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              {/* Month labels */}
              <div className="flex mb-2">
                <div className="w-6"></div> {/* Space for weekday labels */}
                {months.map((month) => (
                  <div key={month} className="text-xs text-muted-foreground px-2">
                    {month}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="flex">
                {/* Weekday labels */}
                <div className="flex flex-col mr-2">
                  {weekdays.map((day, index) => (
                    <div
                      key={day}
                      className="w-6 h-3 flex items-center justify-center text-xs text-muted-foreground"
                      style={{ marginBottom: '1px' }}
                    >
                      {index % 2 === 1 ? day : ''}
                    </div>
                  ))}
                </div>

                {/* Calendar cells */}
                <div className="flex flex-wrap" style={{ maxWidth: '800px' }}>
                  {weeks.map((week, weekIndex) => (
                    <div key={weekIndex} className="flex flex-col mr-1">
                      {week.map((cell, dayIndex) => (
                        <div
                          key={`${weekIndex}-${dayIndex}`}
                          className={`w-3 h-3 mb-1 rounded-sm border border-gray-200 dark:border-gray-600 ${getHeatmapColor(cell.data)}`}
                          title={`${formatDate(cell.date)}: ${formatTooltip(cell.data)}`}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
                <span>less</span>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 bg-gray-200 dark:bg-gray-700 rounded-sm"></div>
                  <div className="w-3 h-3 bg-red-300 rounded-sm"></div>
                  <div className="w-3 h-3 bg-red-400 rounded-sm"></div>
                  <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                  <div className="w-3 h-3 bg-red-600 rounded-sm"></div>
                  <div className="w-3 h-3 bg-green-300 rounded-sm"></div>
                  <div className="w-3 h-3 bg-green-400 rounded-sm"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                  <div className="w-3 h-3 bg-green-600 rounded-sm"></div>
                </div>
                <span>More</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default CalendarHeatmap;
