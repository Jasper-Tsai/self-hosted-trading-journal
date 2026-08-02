'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getEquityCurve, DrawdownPoint, AllTimeStats, RegressionPoint, RollingPoint } from '@/lib/actions/trades';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Button } from './button';
import { formatPnLAmountWithTwd } from '@/lib/utils';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, AreaSeries, LineSeries, LineStyle, MouseEventParams } from 'lightweight-charts';
import { useAuth } from '@/contexts/AuthContext';

interface EquityCurveProps {
  className?: string;
  usdTwdRate?: number;
}

type ViewMode = 'points' | 'amount';

export function EquityCurve({ className, usdTwdRate = 31.5 }: EquityCurveProps) {
  const { isViewer } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('amount');
  const [days, setDays] = useState<number | 'all'>(30);
  const [equityData, setEquityData] = useState<Array<{ date: string; time: string; cumulativePnL: number; cumulativeAmount: number; tradePnL: number; tradeAmount: number }>>([]);
  const [drawdownCurve, setDrawdownCurve] = useState<DrawdownPoint[]>([]);
  const [allTimeStats, setAllTimeStats] = useState<AllTimeStats | null>(null);
  const [startCumulativePnL, setStartCumulativePnL] = useState(0);
  const [startCumulativeAmount, setStartCumulativeAmount] = useState(0);
  const [regressionLine, setRegressionLine] = useState<RegressionPoint[]>([]);
  const [regressionUpper, setRegressionUpper] = useState<RegressionPoint[]>([]);
  const [regressionLower, setRegressionLower] = useState<RegressionPoint[]>([]);
  const [rollingCurve, setRollingCurve] = useState<RollingPoint[]>([]);
  const [overallWinRate, setOverallWinRate] = useState(0);
  const [signalExpanded, setSignalExpanded] = useState(false);

  // Main chart refs
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const lrMidRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lrUpRef = useRef<ISeriesApi<'Line'> | null>(null);
  const lrLoRef = useRef<ISeriesApi<'Line'> | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Drawdown chart refs
  const ddChartContainerRef = useRef<HTMLDivElement>(null);
  const ddChartRef = useRef<IChartApi | null>(null);
  const ddSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const ddTooltipRef = useRef<HTMLDivElement>(null);

  // Rolling chart refs
  const rollingChartContainerRef = useRef<HTMLDivElement>(null);
  const rollingChartRef = useRef<IChartApi | null>(null);
  const rollingWrSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const rollingPfSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  // Ref mirrors for closure access
  const equityDataRef = useRef(equityData);
  const viewModeRef = useRef(viewMode);
  const usdTwdRateRef = useRef(usdTwdRate);

  // Fetch data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getEquityCurve(days, isViewer);
      setEquityData(response.equityData as Array<{ date: string; time: string; cumulativePnL: number; cumulativeAmount: number; tradePnL: number; tradeAmount: number }>);
      setDrawdownCurve(response.drawdownCurve ?? []);
      setAllTimeStats(response.allTimeStats ?? null);
      setStartCumulativePnL(response.startCumulativePnL ?? 0);
      setStartCumulativeAmount(response.startCumulativeAmount ?? 0);
      setRegressionLine(response.regressionLine ?? []);
      setRegressionUpper(response.regressionUpper ?? []);
      setRegressionLower(response.regressionLower ?? []);
      setRollingCurve(response.rollingCurve ?? []);
      setOverallWinRate(response.overallWinRate ?? 0);
    } catch (err) {
      setError('Failed to load equity curve');
      console.error('Error fetching equity curve:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, isViewer]);

  useEffect(() => { equityDataRef.current = equityData; }, [equityData]);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  useEffect(() => { usdTwdRateRef.current = usdTwdRate; }, [usdTwdRate]);

  const calculateGrowthPercentage = (): number | null => {
    if (equityData.length === 0) return null;
    const startValue = viewMode === 'points' ? startCumulativePnL : startCumulativeAmount;
    const endValue = viewMode === 'points'
      ? equityData[equityData.length - 1]?.cumulativePnL
      : equityData[equityData.length - 1]?.cumulativeAmount;
    const rangeGain = endValue - startValue;
    if (startValue === 0) return null;
    return (rangeGain / Math.abs(startValue)) * 100;
  };

  const currentValue = equityData.length > 0
    ? (viewMode === 'points'
      ? equityData[equityData.length - 1]?.cumulativePnL
      : equityData[equityData.length - 1]?.cumulativeAmount)
    : 0;

  const growthPercentage = calculateGrowthPercentage();

  type FailureSignal = {
    title: string;
    why: string;
    action: string;
  } | null;

  // Derive failure signal
  const failureSignal: FailureSignal = (() => {
    // Signal 1: consecutive days below regressionLower
    if (equityData.length >= 3 && regressionLower.length === equityData.length) {
      // Count consecutive days from the end where cumulativeAmount < regressionLower.value
      let consecutiveDays = 0;
      for (let i = equityData.length - 1; i >= 0; i--) {
        const equity = viewMode === 'points' ? equityData[i].cumulativePnL : equityData[i].cumulativeAmount;
        const lower = viewMode === 'points' ? regressionLower[i].valuePts : regressionLower[i].value;
        if (equity < lower) {
          consecutiveDays++;
        } else {
          break;
        }
      }
      if (consecutiveDays >= 3) {
        return {
          title: `Equity below its normal range for ${consecutiveDays} consecutive days`,
          why: `Cumulative equity is below the historical -1σ trend channel, indicating unusually weak performance.`,
          action: `1. Reduce size to 50% of normal.\n2. Stop adding risk until equity returns to the midline.\n3. Review the last ${consecutiveDays} days for a market or execution change.`,
        };
      }
    }

    const lastRolling = rollingCurve.length > 0 ? rollingCurve[rollingCurve.length - 1] : null;

    // Signal 2: rolling PF < 1.0
    if (lastRolling?.profitFactor != null && lastRolling.profitFactor < 1.0) {
      const pf = lastRolling.profitFactor;
      return {
        title: `recent 30 trades, Lose more than you earn`,
        why: `Profit Factor = ${pf.toFixed(2)}, below the 1.0 threshold. The last 30 trades lost more than they earned.`,
        action: `1. Stop live trading for 3-5 sessions.\n2. Compare the last 30 trades with the strategy spec.\n3. Identify the common failure pattern.\n4. Validate with one contract before scaling up.`,
      };
    }

    // Signal 3: rolling WR < overallWinRate - 10
    if (lastRolling?.winRate != null && lastRolling.winRate < overallWinRate - 10) {
      const wr = lastRolling.winRate;
      const delta = overallWinRate - wr;
      return {
        title: `recent 30 The win rate drops significantly`,
        why: `recent 30 win rate ${wr.toFixed(1)}%, than your long-term average (${overallWinRate.toFixed(1)}%)less ${delta.toFixed(1)} percentage points. `,
        action: `1. Review the last 30 losing trades.\n2. Look for a shared entry, time window, or market condition.\n3. Trade only the highest-confidence setups.\n4. Return to one contract until the win rate stabilizes.`,
      };
    }

    return null;
  })();

  // Initialize and update main chart
  useEffect(() => {
    if (!chartContainerRef.current || loading || equityData.length === 0) return;

    if (!chartRef.current) {
      const containerWidth = chartContainerRef.current.clientWidth;
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#9CA3AF',
        },
        width: containerWidth,
        height: 400,
        grid: {
          vertLines: { color: 'rgba(42, 46, 57, 0.1)' },
          horzLines: { color: 'rgba(42, 46, 57, 0.1)' },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
        crosshair: {
          vertLine: { width: 1, color: 'rgba(224, 227, 235, 0.5)', style: 0 },
          horzLine: { visible: false, labelVisible: false },
        },
      });

      const series = chart.addSeries(AreaSeries, {
        topColor: 'rgba(34, 197, 94, 0.56)',
        bottomColor: 'rgba(34, 197, 94, 0.04)',
        lineColor: 'rgba(34, 197, 94, 1)',
        lineWidth: 2,
      });

      const lrMid = chart.addSeries(LineSeries, {
        color: 'rgba(156, 163, 175, 0.9)',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const lrUp = chart.addSeries(LineSeries, {
        color: 'rgba(156, 163, 175, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      const lrLo = chart.addSeries(LineSeries, {
        color: 'rgba(156, 163, 175, 0.5)',
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lastValueVisible: false,
        priceLineVisible: false,
      });

      chartRef.current = chart;
      seriesRef.current = series;
      lrMidRef.current = lrMid;
      lrUpRef.current = lrUp;
      lrLoRef.current = lrLo;

      chart.subscribeCrosshairMove((param: MouseEventParams) => {
        if (
          param.point === undefined ||
          !param.time ||
          param.point.x < 0 ||
          param.point.x > chartContainerRef.current!.clientWidth ||
          param.point.y < 0 ||
          param.point.y > chartContainerRef.current!.clientHeight
        ) {
          if (tooltipRef.current) tooltipRef.current.style.display = 'none';
          return;
        }

        const dateStr = param.time as string;
        const dataPoint = equityDataRef.current.find(d => d.date === dateStr);
        const currentViewMode = viewModeRef.current;
        const currentUsdTwdRate = usdTwdRateRef.current;

        if (dataPoint && tooltipRef.current) {
          const tooltip = tooltipRef.current;
          const dailyValue = currentViewMode === 'points' ? dataPoint.tradePnL : dataPoint.tradeAmount;
          const cumulativeValue = currentViewMode === 'points' ? dataPoint.cumulativePnL : dataPoint.cumulativeAmount;
          const dailyDisplay = currentViewMode === 'points'
            ? `${dailyValue >= 0 ? '+' : ''}${dailyValue.toFixed(2)} point`
            : formatPnLAmountWithTwd(dailyValue, currentUsdTwdRate);
          const cumulativeDisplay = currentViewMode === 'points'
            ? `${cumulativeValue >= 0 ? '+' : ''}${cumulativeValue.toFixed(2)} point`
            : formatPnLAmountWithTwd(cumulativeValue, currentUsdTwdRate);
          const dailyColor = dailyValue >= 0 ? '#22c55e' : '#ef4444';
          const cumulativeColor = cumulativeValue >= 0 ? '#22c55e' : '#ef4444';

          tooltip.style.display = 'block';
          tooltip.innerHTML = `
            <div class="font-bold text-white mb-1">${dateStr}</div>
            <div class="flex justify-between gap-4 text-sm">
              <span class="text-gray-400">Profit and loss of the day:</span>
              <span style="color: ${dailyColor}">${dailyDisplay}</span>
            </div>
            <div class="flex justify-between gap-4 text-sm">
              <span class="text-gray-400">Accumulated profit and loss:</span>
              <span style="color: ${cumulativeColor}">${cumulativeDisplay}</span>
            </div>
          `;

          const tooltipWidth = 200;
          const tooltipHeight = 80;
          const chartWidth = chartContainerRef.current!.clientWidth;
          let left = param.point.x + 15;
          if (left + tooltipWidth > chartWidth) left = param.point.x - tooltipWidth - 15;
          let top = param.point.y - tooltipHeight - 10;
          if (top < 0) top = param.point.y + 20;
          tooltip.style.left = `${left}px`;
          tooltip.style.top = `${top}px`;
        }
      });
    }

    // Update main series data
    if (chartRef.current && seriesRef.current) {
      const data = equityData.map(d => ({
        time: d.date as Time,
        value: viewMode === 'points' ? d.cumulativePnL : d.cumulativeAmount,
      }));
      const isPositive = (data[data.length - 1]?.value || 0) >= 0;
      const color = isPositive ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)';
      const topColor = isPositive ? 'rgba(34, 197, 94, 0.56)' : 'rgba(239, 68, 68, 0.56)';
      const bottomColor = isPositive ? 'rgba(34, 197, 94, 0.04)' : 'rgba(239, 68, 68, 0.04)';
      seriesRef.current.applyOptions({ lineColor: color, topColor, bottomColor });
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
    }

    // Update LR series
    if (regressionLine.length > 0 && lrMidRef.current && lrUpRef.current && lrLoRef.current) {
      const toLineData = (pts: RegressionPoint[], usePoints: boolean) =>
        pts.map(p => ({ time: p.date as Time, value: usePoints ? p.valuePts : p.value }));
      const usePts = viewMode === 'points';
      lrMidRef.current.setData(toLineData(regressionLine, usePts));
      lrUpRef.current.setData(toLineData(regressionUpper, usePts));
      lrLoRef.current.setData(toLineData(regressionLower, usePts));
    } else if (lrMidRef.current && lrUpRef.current && lrLoRef.current) {
      lrMidRef.current.setData([]);
      lrUpRef.current.setData([]);
      lrLoRef.current.setData([]);
    }

  }, [equityData, loading, viewMode, usdTwdRate, regressionLine, regressionUpper, regressionLower]);

  // Initialize and update drawdown chart
  useEffect(() => {
    if (!ddChartContainerRef.current || loading || drawdownCurve.length === 0) return;

    if (!ddChartRef.current) {
      const containerWidth = ddChartContainerRef.current.clientWidth;
      const ddChart = createChart(ddChartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#9CA3AF',
        },
        width: containerWidth,
        height: 160,
        grid: {
          vertLines: { color: 'rgba(42, 46, 57, 0.1)' },
          horzLines: { color: 'rgba(42, 46, 57, 0.1)' },
        },
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false },
        crosshair: {
          vertLine: { width: 1, color: 'rgba(224, 227, 235, 0.5)', style: 0 },
          horzLine: { visible: false, labelVisible: false },
        },
      });

      const ddSeries = ddChart.addSeries(AreaSeries, {
        topColor: 'rgba(239, 68, 68, 0.04)',
        bottomColor: 'rgba(239, 68, 68, 0.56)',
        lineColor: 'rgba(239, 68, 68, 1)',
        lineWidth: 2,
        invertFilledArea: true,
      });

      ddChartRef.current = ddChart;
      ddSeriesRef.current = ddSeries;

      ddChart.subscribeCrosshairMove((param: MouseEventParams) => {
        if (
          param.point === undefined ||
          !param.time ||
          param.point.x < 0 ||
          param.point.x > ddChartContainerRef.current!.clientWidth ||
          param.point.y < 0 ||
          param.point.y > ddChartContainerRef.current!.clientHeight
        ) {
          if (ddTooltipRef.current) ddTooltipRef.current.style.display = 'none';
          return;
        }

        const dateStr = param.time as string;
        const dataPoint = drawdownCurve.find(d => d.date === dateStr);
        if (dataPoint && ddTooltipRef.current) {
          const tooltip = ddTooltipRef.current;
          tooltip.style.display = 'block';
          tooltip.innerHTML = `
            <div class="font-bold text-white mb-1">${dateStr}</div>
            <div class="flex justify-between gap-4 text-sm">
              <span class="text-gray-400">retracement%:</span>
              <span class="text-red-400">${dataPoint.drawdownPct.toFixed(2)}%</span>
            </div>
            <div class="flex justify-between gap-4 text-sm">
              <span class="text-gray-400">Drawdown amount:</span>
              <span class="text-red-400">$${dataPoint.drawdownAmt.toFixed(2)}</span>
            </div>
          `;
          const tooltipWidth = 200;
          const tooltipHeight = 80;
          const chartWidth = ddChartContainerRef.current!.clientWidth;
          let left = param.point.x + 15;
          if (left + tooltipWidth > chartWidth) left = param.point.x - tooltipWidth - 15;
          let top = param.point.y - tooltipHeight - 10;
          if (top < 0) top = param.point.y + 20;
          tooltip.style.left = `${left}px`;
          tooltip.style.top = `${top}px`;
        }
      });

      // Sync time scales: equity <-> drawdown
      if (chartRef.current) {
        chartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range && ddChartRef.current) ddChartRef.current.timeScale().setVisibleLogicalRange(range);
        });
        ddChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range && chartRef.current) chartRef.current.timeScale().setVisibleLogicalRange(range);
        });
      }
    }

    if (ddChartRef.current && ddSeriesRef.current) {
      const data = drawdownCurve.map(d => ({ time: d.date as Time, value: d.drawdownPct }));
      ddSeriesRef.current.setData(data);
      ddChartRef.current.timeScale().fitContent();
    }
  }, [drawdownCurve, loading]);

  // Initialize and update rolling chart
  useEffect(() => {
    if (!rollingChartContainerRef.current || loading || rollingCurve.length === 0) return;

    if (!rollingChartRef.current) {
      const containerWidth = rollingChartContainerRef.current.clientWidth;
      const rollingChart = createChart(rollingChartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#9CA3AF',
        },
        width: containerWidth,
        height: 160,
        grid: {
          vertLines: { color: 'rgba(42, 46, 57, 0.1)' },
          horzLines: { color: 'rgba(42, 46, 57, 0.1)' },
        },
        rightPriceScale: { borderVisible: false },
        leftPriceScale: { borderVisible: false, visible: true },
        timeScale: { borderVisible: false },
        crosshair: {
          vertLine: { width: 1, color: 'rgba(224, 227, 235, 0.5)', style: 0 },
          horzLine: { visible: false, labelVisible: false },
        },
      });

      // WR series on left price scale
      const wrSeries = rollingChart.addSeries(LineSeries, {
        color: 'rgba(96, 165, 250, 0.9)', // blue-400
        lineWidth: 2,
        priceScaleId: 'left',
        lastValueVisible: false,
        priceLineVisible: false,
      });

      // PF series on right price scale
      const pfSeries = rollingChart.addSeries(LineSeries, {
        color: 'rgba(251, 191, 36, 0.9)', // amber-400
        lineWidth: 2,
        priceScaleId: 'right',
        lastValueVisible: false,
        priceLineVisible: false,
      });

      // PF=1.0 reference line
      pfSeries.createPriceLine({
        price: 1.0,
        color: 'rgba(239, 68, 68, 0.7)',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'PF 1.0',
      });

      // WR = overallWinRate - 10 reference line
      if (overallWinRate > 0) {
        wrSeries.createPriceLine({
          price: overallWinRate - 10,
          color: 'rgba(239, 68, 68, 0.7)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'WR-10',
        });
      }

      rollingChartRef.current = rollingChart;
      rollingWrSeriesRef.current = wrSeries;
      rollingPfSeriesRef.current = pfSeries;

      // Sync time scales: rolling <-> equity
      if (chartRef.current) {
        chartRef.current.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range && rollingChartRef.current) rollingChartRef.current.timeScale().setVisibleLogicalRange(range);
        });
        rollingChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (range && chartRef.current) chartRef.current.timeScale().setVisibleLogicalRange(range);
        });
      }
    }

    if (rollingChartRef.current && rollingWrSeriesRef.current && rollingPfSeriesRef.current) {
      const wrData = rollingCurve
        .filter(d => d.winRate != null)
        .map(d => ({ time: d.date as Time, value: d.winRate! }));
      const pfData = rollingCurve
        .filter(d => d.profitFactor != null)
        .map(d => ({ time: d.date as Time, value: d.profitFactor! }));

      rollingWrSeriesRef.current.setData(wrData);
      rollingPfSeriesRef.current.setData(pfData);
      rollingChartRef.current.timeScale().fitContent();
    }
  }, [rollingCurve, loading, overallWinRate]);

  // ResizeObserver for all charts + cleanup on unmount
  useEffect(() => {
    const container = chartContainerRef.current;
    const ddContainer = ddChartContainerRef.current;
    const rollingContainer = rollingChartContainerRef.current;
    if (!container) return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = entry.contentRect.width;
        if (entry.target === container && chartRef.current && newWidth > 0) {
          chartRef.current.applyOptions({ width: newWidth });
        }
        if (entry.target === ddContainer && ddChartRef.current && newWidth > 0) {
          ddChartRef.current.applyOptions({ width: newWidth });
        }
        if (entry.target === rollingContainer && rollingChartRef.current && newWidth > 0) {
          rollingChartRef.current.applyOptions({ width: newWidth });
        }
      }
    });
    ro.observe(container);
    if (ddContainer) ro.observe(ddContainer);
    if (rollingContainer) ro.observe(rollingContainer);

    return () => {
      ro.disconnect();
      if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
      if (ddChartRef.current) { ddChartRef.current.remove(); ddChartRef.current = null; }
      if (rollingChartRef.current) { rollingChartRef.current.remove(); rollingChartRef.current = null; }
    };
  }, []);

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>Equity Curve</CardTitle>
            <CardDescription>
              Cumulative P&L trend ({days === 'all' ? 'All history' : `${days} days`})
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

        {/* Time period buttons */}
        <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-2">
          {([7, 30, 90, 180, 'all'] as const).map((d) => (
            <Button
              key={d}
              variant={days === d ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(d)}
            >
              {d === 'all' ? 'All' : `${d} days`}
            </Button>
          ))}
        </div>

        {/* Statistics display */}
        {!loading && equityData.length > 0 && (
          <>
            <div className="flex items-center gap-6 text-sm mt-2 flex-wrap">
              <div>
                <span className="text-muted-foreground">Current total: </span>
                <span className={currentValue >= 0 ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                  {viewMode === 'points'
                    ? `${currentValue >= 0 ? '+' : ''}${currentValue.toFixed(2)} point`
                    : formatPnLAmountWithTwd(currentValue, usdTwdRate)
                  }
                </span>
              </div>

              {growthPercentage !== null && (
                <div>
                  <span className="text-muted-foreground">Growth: </span>
                  <span className={growthPercentage >= 0 ? 'text-green-600 dark:text-green-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
                    {growthPercentage >= 0 ? '+' : ''}{growthPercentage.toFixed(2)}%
                  </span>
                </div>
              )}

              <div>
                <span className="text-muted-foreground">Trades: </span>
                <span className="font-semibold">{equityData.length}</span>
              </div>
            </div>

            {!isViewer && failureSignal && (
              <div className="mt-3 w-full">
                <button
                  type="button"
                  onClick={() => setSignalExpanded(s => !s)}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium border border-red-500/30 cursor-pointer transition-colors"
                >
                  <span>{signalExpanded ? '▼' : '▶'}</span>
                  <span>⚠ Strategy alert: {failureSignal.title}</span>
                </button>
                {signalExpanded && (
                  <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                    <div>
                      <div className="text-xs text-red-400/80 font-semibold mb-0.5">Why</div>
                      <div className="text-sm text-foreground/90">{failureSignal.why}</div>
                    </div>
                    <div>
                      <div className="text-xs text-red-400/80 font-semibold mb-0.5">how to do</div>
                      <div className="text-sm text-foreground/90 whitespace-pre-line">{failureSignal.action}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </CardHeader>

      <CardContent>
        {/* Drawdown KPI Cards */}
        {!loading && allTimeStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="bg-muted/10 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">maximum drawdown ($)</div>
              <div className="text-lg font-bold text-red-400">
                ${Math.abs(allTimeStats.maxDrawdownAmt).toFixed(2)}
              </div>
              {allTimeStats.maxDrawdownDate && (
                <div className="text-xs text-muted-foreground mt-0.5">{allTimeStats.maxDrawdownDate}</div>
              )}
            </div>
            <div className="bg-muted/10 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">maximum drawdown (%)</div>
              <div className="text-lg font-bold text-red-400">
                {Math.abs(allTimeStats.maxDrawdownPct).toFixed(2)}%
              </div>
              {allTimeStats.maxDrawdownRecoveryDate && (
                <div className="text-xs text-muted-foreground mt-0.5">recover: {allTimeStats.maxDrawdownRecoveryDate}</div>
              )}
            </div>
            <div className="bg-muted/10 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">Drawback days</div>
              <div className="text-lg font-bold">
                {allTimeStats.maxDrawdownDays} <span className="text-sm font-normal text-muted-foreground">days</span>
              </div>
            </div>
            <div className="bg-muted/10 rounded-lg p-3">
              <div className="text-xs text-muted-foreground mb-1">current status</div>
              {allTimeStats.isInDrawdown ? (
                <div className="text-lg font-bold text-red-400">
                  Retracement in progress -{Math.abs(allTimeStats.currentDrawdownPct).toFixed(1)}%
                </div>
              ) : (
                <div className="text-lg font-bold text-green-400">
                  all time high
                </div>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">loading...</div>
          </div>
        )}

        {error && (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-red-500">{error}</div>
          </div>
        )}

        {!loading && !error && equityData.length === 0 && (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-muted-foreground">No trade data yet</div>
          </div>
        )}

        {/* Equity Curve Chart */}
        <div className="relative overflow-hidden">
          <div
            ref={chartContainerRef}
            className={`w-full max-w-full h-[400px] ${(!loading && !error && equityData.length > 0) ? 'block' : 'hidden'}`}
          />
          <div
            ref={tooltipRef}
            className="absolute hidden pointer-events-none p-3 rounded-lg shadow-lg border border-gray-700 bg-gray-900/90 backdrop-blur-sm z-50"
            style={{ top: 0, left: 0, minWidth: '180px' }}
          />
        </div>

        {/* Drawdown Curve Chart */}
        <div className={`mt-4 ${(!loading && !error && drawdownCurve.length > 0) ? 'block' : 'hidden'}`}>
          <div className="text-sm text-muted-foreground mb-2">retracement curve Drawdown Curve</div>
          <div className="relative overflow-hidden">
            <div
              ref={ddChartContainerRef}
              className="w-full max-w-full h-[160px]"
            />
            <div
              ref={ddTooltipRef}
              className="absolute hidden pointer-events-none p-3 rounded-lg shadow-lg border border-gray-700 bg-gray-900/90 backdrop-blur-sm z-50"
              style={{ top: 0, left: 0, minWidth: '180px' }}
            />
          </div>
        </div>

        {/* Rolling 30-trade WR + PF Chart */}
        <div className={`mt-4 ${(!loading && !error && rollingCurve.some(d => d.winRate != null)) ? 'block' : 'hidden'}`}>
          <div className="text-sm text-muted-foreground mb-2 flex items-center gap-3">
            <span>Rolling 30 trades winning rate / Profit Factor</span>
            <span className="text-blue-400 text-xs">&#9644; WR% (Left)</span>
            <span className="text-amber-400 text-xs">&#9644; PF (right)</span>
          </div>
          <div className="relative overflow-hidden">
            <div
              ref={rollingChartContainerRef}
              className="w-full max-w-full h-[160px]"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default EquityCurve;
