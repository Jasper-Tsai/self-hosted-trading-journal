'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { TradeForm } from '@/components/trade-form';
import { TradeList } from '@/components/trade-list';
import { DatePicker } from '@/components/ui/date-picker';
import { getTodayString, parseDateString } from '@/lib/utils';
import { Trade } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/access-denied';

function TradesContent() {
  const { isViewer } = useAuth();
  const searchParams = useSearchParams();
  const dateFromUrl = searchParams.get('date');
  const [selectedDate, setSelectedDate] = useState(dateFromUrl || getTodayString());
  const [selectedTrade, setSelectedTrade] = useState<Trade | undefined>();
  const [refreshKey, setRefreshKey] = useState(0);

  // Update selectedDate when URL parameter changes
  useEffect(() => {
    if (dateFromUrl) {
      const timer = window.setTimeout(() => {
        setSelectedDate(dateFromUrl);
        setSelectedTrade(undefined);
        setRefreshKey(prev => prev + 1);
      }, 0);

      return () => window.clearTimeout(timer);
    }
  }, [dateFromUrl]);

  // Viewer 無法訪問交易紀錄頁面
  if (isViewer) {
    return <AccessDenied />;
  }

  const handleTradeSubmit = () => {
    // Clear selected trade and trigger list refresh
    setSelectedTrade(undefined);
    setRefreshKey(prev => prev + 1);
  };

  const handleEditTrade = (trade: Trade) => {
    setSelectedTrade(trade);
  };

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setSelectedTrade(undefined); // Clear selected trade when changing date
    setRefreshKey(prev => prev + 1);
  };

  const formatDateTitle = (dateString: string) => {
    const today = getTodayString();

    if (dateString === today) {
      return '交易紀錄';
    }

    const parts = parseDateString(dateString);
    if (!parts) return `交易紀錄 - ${dateString}`;
    const month = parts.month;
    const day = parts.day;
    return `交易紀錄 - ${month}月${day}日`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
            {formatDateTitle(selectedDate)}
          </h1>
          <p className="text-muted-foreground">
            新增和管理您的交易紀錄，自動計算盈虧與統計
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DatePicker
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TradeForm
          initialDate={selectedDate}
          trade={selectedTrade}
          onSubmit={handleTradeSubmit}
        />
        <TradeList
          date={selectedDate}
          key={`${selectedDate}-${refreshKey}`}
          onEdit={handleEditTrade}
          onRefresh={handleRefresh}
        />
      </div>
    </div>
  );
}

export default function TradesPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground">載入交易頁面...</div>}>
      <TradesContent />
    </Suspense>
  );
}
