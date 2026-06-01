'use client';

import { useState } from 'react';
import { DashboardOverview } from '@/components/dashboard-overview';
import { DatePicker } from '@/components/ui/date-picker';
import { getTodayString, parseDateString } from '@/lib/utils';

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(getTodayString());

  const formatDateTitle = (dateString: string) => {
    const today = getTodayString();

    if (dateString === today) {
      return '今日總覽';
    }

    const parts = parseDateString(dateString);
    if (!parts) return dateString;
    const month = parts.month;
    const day = parts.day;
    return `${month}月${day}日總覽`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
            {formatDateTitle(selectedDate)}
          </h1>
          <p className="text-muted-foreground">
            查看交易表現與統計數據
          </p>
        </div>
        <DatePicker
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      </div>

      <DashboardOverview date={selectedDate} />
    </div>
  );
}
