'use client';

import React from 'react';
import { Button } from './button';
import { getTodayString, getChicagoDateString } from '@/lib/utils';

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onRangeChange: (startDate: string, endDate: string) => void;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onRangeChange
}) => {
  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRangeChange(e.target.value, endDate);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onRangeChange(startDate, e.target.value);
  };

  const handleQuickSelect = (days: number) => {
    const today = getTodayString();
    const startDateStr = getChicagoDateString(-days);
    onRangeChange(startDateStr, today);
  };

  const handleSelectAll = () => {
    // Set a very early start date to include all records
    const earliestDate = '2020-01-01';
    const today = getTodayString();
    onRangeChange(earliestDate, today);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            start date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={handleStartDateChange}
            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-foreground"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            end date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={handleEndDateChange}
            className="w-full px-3 py-2 bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent text-foreground"
          />
        </div>
      </div>

      {/* Quick Select Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleQuickSelect(0)}
        >
          today
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleQuickSelect(7)}
        >
          Last 7 days
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleQuickSelect(30)}
        >
          Last 30 days
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleQuickSelect(90)}
        >
          Last 90 days
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
        >
          All information
        </Button>
      </div>
    </div>
  );
};
