'use client';

import EquityCurve from '@/components/ui/equity-curve';
import { MonthlyPerformance } from '@/components/ui/monthly-performance';
import { StrategyStats } from '@/components/ui/strategy-stats';
import DailyPnLSummary from '@/components/ui/daily-pnl-summary';
import TimePatterns from '@/components/ui/time-patterns';
import BestWorstTrades from '@/components/ui/best-worst-trades';
import { getTodayString } from '@/lib/utils';
import { useExchangeRate } from '@/lib/useExchangeRate';
import { useLanguage } from '@/contexts/LanguageContext';

export default function ReviewPage() {
  const endDate = getTodayString();
  const { usdTwd } = useExchangeRate();
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
            {t('reviewTitle')}
          </h1>
          <p className="text-muted-foreground">
            {t('reviewDescription')}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Equity Curve - Full Width */}
        <EquityCurve key={`equity-${endDate}`} usdTwdRate={usdTwd} />

        {/* Monthly Performance - Full Width */}
        <MonthlyPerformance key={`monthly-${endDate}`} usdTwdRate={usdTwd} />

        {/* Strategy Win Rate Stats - Full Width */}
        <StrategyStats key={`strategy-${endDate}`} />

        {/* Daily PnL Summary - Full Width */}
        <DailyPnLSummary key={`daily-pnl-${endDate}`} usdTwdRate={usdTwd} />


        {/* Time Patterns - Full Width */}
        <TimePatterns key={`time-${endDate}`} usdTwdRate={usdTwd} />

        {/* Best/Worst Trades - Two Column Grid */}
        <BestWorstTrades key={`best-worst-${endDate}`} usdTwdRate={usdTwd} />
      </div>
    </div>
  );
}
