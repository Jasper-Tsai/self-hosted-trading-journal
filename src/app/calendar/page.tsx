'use client';

import TradingCalendar from '@/components/ui/trading-calendar';
import { useExchangeRate } from '@/lib/useExchangeRate';
import { useLanguage } from '@/contexts/LanguageContext';

export default function CalendarPage() {
    const { usdTwd } = useExchangeRate();
    const { t } = useLanguage();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">{t('calendarTitle')}</h1>
                <p className="text-muted-foreground">
                    {t('calendarDescription')}
                </p>
            </div>

            <TradingCalendar usdTwdRate={usdTwd} />
        </div>
    );
}
