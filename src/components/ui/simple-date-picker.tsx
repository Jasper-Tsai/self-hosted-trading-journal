'use client';

import { Button } from './button';
import { getTodayString, getYesterdayString, getWeekdayInChinese, parseDateString } from '@/lib/utils';

interface SimpleDatePickerProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  className?: string;
}

export function SimpleDatePicker({ selectedDate, onDateChange, className }: SimpleDatePickerProps) {
  const today = getTodayString();
  const yesterday = getYesterdayString();
  
  const formatDisplayDate = (dateString: string) => {
    const parts = parseDateString(dateString);
    if (!parts) return dateString;

    const month = parts.month;
    const day = parts.day;
    const dayName = getWeekdayInChinese(dateString).replace('週', '');
    
    if (dateString === today) {
      return `今天 ${month}/${day} (週${dayName})`;
    }
    
    if (dateString === yesterday) {
      return `昨天 ${month}/${day} (週${dayName})`;
    }
    
    return `${month}/${day} (週${dayName})`;
  };

  const handleTodayClick = () => {
    onDateChange(today);
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <input
        type="date"
        value={selectedDate}
        onChange={(e) => onDateChange(e.target.value)}
        className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
      />
      <Button
        onClick={handleTodayClick}
        variant="outline"
        size="sm"
        disabled={selectedDate === today}
      >
        {selectedDate === today ? '今天' : '回到今天'}
      </Button>
      <div className="text-sm text-muted-foreground">
        {formatDisplayDate(selectedDate)}
      </div>
    </div>
  );
}
