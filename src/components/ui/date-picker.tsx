'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from './button';
import { getTodayString, getYesterdayString, getWeekdayLabel, getChicagoDateString, parseDateString } from '@/lib/utils';

interface DatePickerProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  className?: string;
}

export function DatePicker({ selectedDate, onDateChange, className }: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempDate, setTempDate] = useState(selectedDate);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dropdownContentRef = useRef<HTMLDivElement>(null);
  const today = getTodayString();

  useEffect(() => {
    setTempDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setTempDate(selectedDate);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, selectedDate]);

  const adjustDropdownPosition = useCallback(() => {
    if (!dropdownContentRef.current) return;
    const el = dropdownContentRef.current;
    const isMobile = window.innerWidth < 640;
    if (isMobile) {
      // On mobile: fixed center positioning
      el.style.position = 'fixed';
      el.style.left = '1rem';
      el.style.right = '1rem';
      el.style.top = '';
      el.style.width = 'auto';
      // Vertically position below the trigger button
      const parent = dropdownRef.current;
      if (parent) {
        const parentRect = parent.getBoundingClientRect();
        el.style.top = `${parentRect.bottom + 8}px`;
      }
    } else {
      // On desktop: keep absolute, adjust with left/right offset to stay in viewport
      el.style.position = '';
      el.style.left = '';
      el.style.right = '';
      el.style.width = '';
      el.style.top = '';
      const rect = el.getBoundingClientRect();
      const margin = 16;
      if (rect.left < margin) {
        el.style.right = 'auto';
        el.style.left = '0';
      } else if (rect.right > window.innerWidth - margin) {
        // default right-0 is fine
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(adjustDropdownPosition);
    }
  }, [isOpen, adjustDropdownPosition]);

  const getQuickDateOptions = () => {
    const options: { label: string; date: string; isToday: boolean }[] = [];

    // Today
    options.push({
      label: 'today',
      date: getTodayString(),
      isToday: true
    });

    // Yesterday
    options.push({
      label: 'yesterday',
      date: getYesterdayString(),
      isToday: false
    });

    // Calculate this week's Monday to determine "last week" prefix
    const todayParts = parseDateString(getTodayString());
    let thisMonday: Date | null = null;
    if (todayParts) {
      const todayDate = new Date(todayParts.year, todayParts.month - 1, todayParts.day);
      const dow = todayDate.getDay(); // 0=Sun, 1=Mon, ...
      const diffToMonday = dow === 0 ? 6 : dow - 1;
      thisMonday = new Date(todayDate);
      thisMonday.setDate(todayDate.getDate() - diffToMonday);
    }

    // Recent days, excluding weekends (CME futures don't trade on weekends)
    let count = 0;
    let i = 2;
    while (count < 5) {
      const dateString = getChicagoDateString(-i);
      const dateObj = parseDateString(dateString);
      if (dateObj) {
        const d = new Date(dateObj.year, dateObj.month - 1, dateObj.day);
        const dayOfWeek = d.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          const weekday = getWeekdayLabel(dateString);
          const isPreviousWeek = thisMonday && d < thisMonday;
          options.push({
            label: isPreviousWeek ? `Previous ${weekday}` : `${weekday}`,
            date: dateString,
            isToday: false
          });
          count++;
        }
      }
      i++;
    }

    // Filter out weekends from today/yesterday as well
    return options.filter((opt) => {
      const parts = parseDateString(opt.date);
      if (!parts) return true;
      const d = new Date(parts.year, parts.month - 1, parts.day);
      const dayOfWeek = d.getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6;
    });
  };

  const formatDisplayDate = (dateString: string) => {
    const parts = parseDateString(dateString);
    if (!parts) return dateString;

    const month = parts.month;
    const day = parts.day;
    const weekday = getWeekdayLabel(dateString);

    if (dateString === today) {
      return `Today ${month}/${day} ${weekday}`;
    }

    return `${month}/${day} ${weekday}`;
  };

  const handleDateSelect = () => {
    onDateChange(tempDate);
    setIsOpen(false);
  };

  const handleTodayClick = () => {
    const todayStr = getTodayString();
    setTempDate(todayStr);
    onDateChange(todayStr);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Main Date Display Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        variant={selectedDate === today ? "default" : "secondary"}
        className="flex items-center space-x-2 min-w-[160px] justify-between"
      >
        <span>{formatDisplayDate(selectedDate)}</span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown Content */}
          <div ref={dropdownContentRef} className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/[0.06] bg-[#0a0a0c]/95 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_40px_rgba(0,0,0,0.5)] z-50 animate-scale-in" style={{ animationDuration: '200ms' }}>
            <div className="p-4 space-y-4">

              {/* Quick Date Options */}
              <div>
                <h3 className="text-xs font-mono tracking-widest text-[#8A8F98] uppercase mb-2">Quick selection</h3>
                <div className="grid grid-cols-3 gap-1">
                  {getQuickDateOptions().map((option) => (
                    <button
                      key={option.date}
                      onClick={() => {
                        setTempDate(option.date);
                        onDateChange(option.date);
                        setIsOpen(false);
                      }}
                      className={`px-2 py-1.5 text-xs rounded-lg text-center transition-all duration-200 ${selectedDate === option.date
                        ? 'bg-[#5E6AD2] text-white shadow-[0_0_0_1px_rgba(94,106,210,0.5),0_2px_8px_rgba(94,106,210,0.3)]'
                        : 'text-[#8A8F98] hover:bg-white/[0.05] hover:text-[#EDEDEF]'
                        }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

              {/* Custom Date Selector */}
              <div>
                <h3 className="text-xs font-mono tracking-widest text-[#8A8F98] uppercase mb-2">Custom date</h3>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={tempDate}
                    onChange={(e) => setTempDate(e.target.value)}
                    className="flex-1 px-3 py-2 bg-[#0F0F12] border border-white/[0.10] text-gray-100 rounded-lg text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#5E6AD2]/50 focus:border-[#5E6AD2]/40"
                  />
                  <Button
                    onClick={handleDateSelect}
                    size="sm"
                    disabled={tempDate === selectedDate}
                  >
                    Sure
                  </Button>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />

              {/* Quick Actions */}
              <div className="flex justify-between">
                <Button
                  onClick={handleTodayClick}
                  variant="outline"
                  size="sm"
                  disabled={selectedDate === today}
                >
                  Back to today
                </Button>
                <Button
                  onClick={() => setIsOpen(false)}
                  variant="ghost"
                  size="sm"
                >
                  closure
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
