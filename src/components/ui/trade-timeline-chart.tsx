'use client';

import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { getTradesByDate } from '@/lib/actions/trades';
import { formatTime, getTaipeiTimeParts, parseTaipeiDateTime } from '@/lib/utils';

interface Trade {
  id: string;
  entry_time: string;
  exit_time?: string;
  entry_price: number;
  exit_price?: number;
  qty: number;
  side: 'LONG' | 'SHORT';
  pnl?: number;
  strategies?: string[];
}

interface TradeTimelineChartProps {
  date: string;
  className?: string;
}

/**
 * Determine whether the specified date is in U.S. Daylight Savings Time (DST)
 * USA DST: 3second sunday of month 02:00 ~ 11first sunday of month 02:00 (Eastern Time)
 * Since the trading day is the night before Taipei time, it corresponds to U.S. time, We use the Trade date to judge
 */
function isUSDST(dateStr: string): boolean {
  const [year, month, day] = dateStr.split('-').map(Number);

  // try to find3second sunday of month
  const marchFirst = new Date(year, 2, 1); // March 1st
  const marchFirstDow = marchFirst.getDay(); // 0=Sun
  const secondSunday = marchFirstDow === 0 ? 8 : (14 - marchFirstDow + 1);
  const dstStartMonth = 3;
  const dstStartDay = secondSunday;

  // try to find11first sunday of month
  const novFirst = new Date(year, 10, 1); // November 1st
  const novFirstDow = novFirst.getDay();
  const firstSunday = novFirstDow === 0 ? 1 : (7 - novFirstDow + 1);
  const dstEndMonth = 11;
  const dstEndDay = firstSunday;

  // Simplify judgment: month in [3/DSTstart date ~ 11/DSTend day) is between DST
  if (month > dstStartMonth && month < dstEndMonth) return true;
  if (month < dstStartMonth || month > dstEndMonth) return false;
  if (month === dstStartMonth) return day >= dstStartDay;
  if (month === dstEndMonth) return day < dstEndDay;
  return false;
}

export function TradeTimelineChart({ date, className }: TradeTimelineChartProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'entry' | 'exit' | 'both'>('both');
  const [timeRange, setTimeRange] = useState<'all' | 'market' | 'extended'>('market');

  // Dynamically calculate transaction time Based on date
  const isDST = useMemo(() => isUSDST(date), [date]);

  // DST (summer): Taipei time 21:30~04:15 / extend 21:00~05:00
  // Standard (winter): Taipei time 22:30~05:15 / extend 22:00~06:00
  const marketOpen = isDST ? { hour: 21, minute: 30 } : { hour: 22, minute: 30 };
  const marketClose = isDST ? { hour: 4, minute: 15 } : { hour: 5, minute: 15 };
  const extendedOpen = isDST ? { hour: 21, minute: 0 } : { hour: 22, minute: 0 };
  const extendedClose = isDST ? { hour: 5, minute: 0 } : { hour: 6, minute: 0 };

  const formatHM = (h: number, m: number) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  const marketOpenStr = formatHM(marketOpen.hour, marketOpen.minute);
  const marketCloseStr = formatHM(marketClose.hour, marketClose.minute);

  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const trades = await getTradesByDate(date);
      const tradesWithPnL = trades.map(trade => ({
        ...trade,
        pnl: trade.exit_price && trade.entry_price
          ? trade.side === 'LONG'
            ? (trade.exit_price - trade.entry_price) * trade.qty
            : (trade.entry_price - trade.exit_price) * trade.qty
          : 0
      }));
      setTrades(tradesWithPnL as unknown as Trade[]);
    } catch (err) {
      setError('Failed to load trade data');
      console.error('Error fetching trades:', err);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  // Generate timeline markers
  const generateTimeLabels = () => {
    const labels: string[] = [];

    if (timeRange === 'market') {
      // market time
      labels.push(marketOpenStr);
      const startHourFull = marketOpen.minute > 0 ? marketOpen.hour + 1 : marketOpen.hour;
      // From the next hour after opening to midnight
      for (let hour = startHourFull; hour <= 23; hour++) {
        labels.push(`${hour}:00`);
      }
      // From midnight to close
      for (let hour = 0; hour <= marketClose.hour; hour++) {
        labels.push(`${hour.toString().padStart(2, '0')}:00`);
      }
      if (marketClose.minute > 0) {
        labels.push(marketCloseStr);
      }
    } else if (timeRange === 'extended') {
      // extend time
      labels.push(formatHM(extendedOpen.hour, extendedOpen.minute));
      const startHourFull = extendedOpen.minute > 0 ? extendedOpen.hour + 1 : extendedOpen.hour;
      for (let hour = startHourFull; hour <= 23; hour++) {
        labels.push(`${hour}:00`);
      }
      for (let hour = 0; hour <= extendedClose.hour; hour++) {
        labels.push(`${hour.toString().padStart(2, '0')}:00`);
      }
    } else {
      // all day24Hour
      for (let hour = 0; hour <= 23; hour++) {
        labels.push(`${hour.toString().padStart(2, '0')}:00`);
      }
    }
    return labels;
  };

  // Convert time to percent position on axis (Handle cross-day market time)
  const timeToPosition = (timeString: string) => {
    let hour: number;
    let minute: number;

    if (timeString.includes('T') || timeString.includes(' ')) {
      const timeParts = getTaipeiTimeParts(timeString);
      if (!timeParts) {
        const fallback = new Date(timeString);
        hour = fallback.getHours();
        minute = fallback.getMinutes();
      } else {
        hour = timeParts.hour;
        minute = timeParts.minute;
      }
    } else {
      const [hours, minutes] = timeString.split(':').map(Number);
      hour = hours;
      minute = minutes || 0;
    }

    const totalMinutes = hour * 60 + minute;
    if (Number.isNaN(totalMinutes)) {
      return -1;
    }

    if (timeRange === 'market') {
      const startMinutes = marketOpen.hour * 60 + marketOpen.minute;
      const endMinutes = marketClose.hour * 60 + marketClose.minute;
      const totalRangeMinutes = (24 * 60 - startMinutes) + endMinutes;

      let positionMinutes;
      if (totalMinutes >= startMinutes) {
        positionMinutes = totalMinutes - startMinutes;
      } else if (totalMinutes <= endMinutes) {
        positionMinutes = (24 * 60 - startMinutes) + totalMinutes;
      } else {
        return -1;
      }

      return (positionMinutes / totalRangeMinutes) * 100;
    } else if (timeRange === 'extended') {
      const startMinutes = extendedOpen.hour * 60 + extendedOpen.minute;
      const endMinutes = extendedClose.hour * 60 + extendedClose.minute;
      const totalRangeMinutes = (24 * 60 - startMinutes) + endMinutes;

      let positionMinutes;
      if (totalMinutes >= startMinutes) {
        positionMinutes = totalMinutes - startMinutes;
      } else if (totalMinutes <= endMinutes) {
        positionMinutes = (24 * 60 - startMinutes) + totalMinutes;
      } else {
        return -1;
      }

      return (positionMinutes / totalRangeMinutes) * 100;
    } else {
      // all day24Hour
      return (totalMinutes / (24 * 60)) * 100;
    }
  };

  // Get the color of the trading point
  const getTradeColor = (trade: Trade, type: 'entry' | 'exit') => {
    if (type === 'entry') {
      return trade.side === 'LONG' ? 'bg-green-500' : 'bg-red-500';
    } else {
      const pnl = trade.pnl || 0;
      if (pnl > 0) return 'bg-green-600';
      if (pnl < 0) return 'bg-red-600';
      return 'bg-gray-500';
    }
  };

  // Filter displayed trading points (cross day market time)
  const getVisibleTrades = () => {
    return trades.filter(trade => {
      const timeParts = getTaipeiTimeParts(trade.entry_time);
      const entryTime = timeParts ?? {
        hour: new Date(trade.entry_time).getHours(),
        minute: new Date(trade.entry_time).getMinutes(),
      };
      const hour = entryTime.hour;
      const minute = entryTime.minute;
      const totalMinutes = hour * 60 + minute;

      if (timeRange === 'market') {
        const startMinutes = marketOpen.hour * 60 + marketOpen.minute;
        const endMinutes = marketClose.hour * 60 + marketClose.minute;
        return (totalMinutes >= startMinutes) || (totalMinutes <= endMinutes);
      } else if (timeRange === 'extended') {
        const startMinutes = extendedOpen.hour * 60 + extendedOpen.minute;
        const endMinutes = extendedClose.hour * 60 + extendedClose.minute;
        return (totalMinutes >= startMinutes) || (totalMinutes <= endMinutes);
      }
      // all day: 00:00-24:00
      return true;
    });
  };

  const timeLabels = generateTimeLabels();
  const visibleTrades = getVisibleTrades();

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
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base sm:text-lg">Trade Timeline</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Trading time distribution and entry and exit points of the day{isDST ? ' (daylight saving time)' : ' (winter time)'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex border rounded-md">
                <Button
                  variant={viewMode === 'entry' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('entry')}
                  className="rounded-r-none text-xs px-2 h-8"
                >
                  Entry
                </Button>
                <Button
                  variant={viewMode === 'exit' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('exit')}
                  className="rounded-none border-x-0 text-xs px-2 h-8"
                >
                  Exit
                </Button>
                <Button
                  variant={viewMode === 'both' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('both')}
                  className="rounded-l-none text-xs px-2 h-8"
                >
                  all
                </Button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant={timeRange === 'market' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('market')}
              className="text-xs h-8"
            >
              market time
            </Button>
            <Button
              variant={timeRange === 'extended' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('extended')}
              className="text-xs h-8"
            >
              extend time
            </Button>
            <Button
              variant={timeRange === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTimeRange('all')}
              className="text-xs h-8"
            >
              all day
            </Button>
            <span className="text-xs text-muted-foreground ml-1">
              {marketOpenStr}–{marketCloseStr}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visibleTrades.length === 0 ? (
          <div className="h-32 flex items-center justify-center">
            <div className="text-muted-foreground">There is no trade data during this period</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* timeline */}
            <div className="relative">
              {/* background timeline */}
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full relative overflow-hidden">
                {/* Market time background highlight (Display across days)*/}
                {timeRange !== 'market' && (
                  <>
                    {/* That night part */}
                    <div
                      className="absolute h-full bg-blue-100 dark:bg-blue-900/30"
                      style={{
                        left: `${timeToPosition(marketOpenStr)}%`,
                        width: `${timeToPosition('23:59') - timeToPosition(marketOpenStr)}%`
                      }}
                    />
                    {/* The early morning part of the next day */}
                    <div
                      className="absolute h-full bg-blue-100 dark:bg-blue-900/30"
                      style={{
                        left: `${timeToPosition('00:00')}%`,
                        width: `${timeToPosition(marketCloseStr) - timeToPosition('00:00')}%`
                      }}
                    />
                  </>
                )}
              </div>

              {/* trading point - Entry */}
              {(viewMode === 'entry' || viewMode === 'both') && visibleTrades
                .filter(trade => timeToPosition(trade.entry_time) >= 0)
                .map((trade, index) => (
                  <div
                    key={`entry-${trade.id}-${index}`}
                    className={`absolute w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 transform -translate-x-2 -translate-y-1 cursor-pointer hover:scale-125 transition-transform ${getTradeColor(trade, 'entry')}`}
                    style={{
                      left: `${timeToPosition(trade.entry_time)}%`,
                      top: '0px'
                    }}
                    title={`Entry: ${formatTime(trade.entry_time)} | ${trade.side} ${trade.qty}contracts @${trade.entry_price}`}
                  />
                ))}

              {/* trading point - Exit */}
              {(viewMode === 'exit' || viewMode === 'both') && visibleTrades
                .filter(trade => trade.exit_time && timeToPosition(trade.exit_time) >= 0)
                .map((trade, exitIndex) => (
                  <div
                    key={`exit-${trade.id}-${exitIndex}`}
                    className={`absolute w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 transform -translate-x-2 translate-y-1 cursor-pointer hover:scale-125 transition-transform ${getTradeColor(trade, 'exit')}`}
                    style={{
                      left: `${timeToPosition(trade.exit_time!)}%`,
                      top: '12px'
                    }}
                    title={`Exit: ${formatTime(trade.exit_time!)} | @${trade.exit_price} | P&L: ${trade.pnl?.toFixed(2)}point`}
                  />
                ))}
            </div>

            {/* time tag */}
            <div className="relative">
              <div className="flex justify-between text-xs text-muted-foreground">
                {timeLabels.filter((_, index) => index % 2 === 0).map((label) => (
                  <div key={label} className="text-center">
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Statistics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center p-2 bg-muted rounded-lg">
                <div className="font-semibold">{visibleTrades.length}</div>
                <div className="text-muted-foreground">Trades</div>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <div className="font-semibold">
                  {visibleTrades.length > 0
                    ? formatTime(visibleTrades[0].entry_time)
                    : '--'}
                </div>
                <div className="text-muted-foreground">first entry</div>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <div className="font-semibold">
                  {visibleTrades.filter(t => t.exit_time).length > 0
                    ? formatTime(
                      visibleTrades
                        .filter(t => t.exit_time)
                        .sort((a, b) => {
                          const exitA = parseTaipeiDateTime(a.exit_time!) ?? new Date(a.exit_time!);
                          const exitB = parseTaipeiDateTime(b.exit_time!) ?? new Date(b.exit_time!);
                          return exitB.getTime() - exitA.getTime();
                        })[0]
                        .exit_time!
                    )
                    : '--'}
                </div>
                <div className="text-muted-foreground">Last exit</div>
              </div>
              <div className="text-center p-2 bg-muted rounded-lg">
                <div className="font-semibold">
                  {visibleTrades.filter(t => t.exit_time).length} / {visibleTrades.length}
                </div>
                <div className="text-muted-foreground">Position closed</div>
              </div>
            </div>

            {/* legend */}
            <div className="flex items-center justify-center gap-6 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span>Long orders enter the market</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span>Short order entry</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                <span>Take profit</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                <span>stop loss exit</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TradeTimelineChart;
