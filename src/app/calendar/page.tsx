'use client';

import TradingCalendar from '@/components/ui/trading-calendar';
import { useExchangeRate } from '@/lib/useExchangeRate';

export default function CalendarPage() {
    const { usdTwd } = useExchangeRate();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">交易日曆</h1>
                <p className="text-muted-foreground">
                    每月盈虧日曆視圖
                </p>
            </div>

            <TradingCalendar usdTwdRate={usdTwd} />
        </div>
    );
}
