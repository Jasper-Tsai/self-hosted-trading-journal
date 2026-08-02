import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Trade, Symbol } from '@/types';
import { getProductConfig } from '@/lib/products';

const CHICAGO_TIME_ZONE = 'America/Chicago';
const TAIPEI_TIME_ZONE = 'Asia/Taipei';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function parseDateString(dateString: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseDateTimeString(dateTime: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/.exec(dateTime);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: match[6] ? Number(match[6]) : 0,
  };
}

export function parseTaipeiDateTime(dateTime: string): Date | null {
  const parts = parseDateTimeString(dateTime);
  if (!parts) return null;
  return new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour - 8,
    parts.minute,
    parts.second,
  ));
}

export function getTaipeiTimeParts(dateTime: string): { hour: number; minute: number } | null {
  const parts = parseDateTimeString(dateTime);
  if (!parts) return null;
  return { hour: parts.hour, minute: parts.minute };
}

// Symbol-related utilities (source of truth: DB products table, with local cache fallback)
export function getPointValue(symbol?: Symbol): number {
  return getProductConfig(symbol || 'MNQ').pointValue;
}

/**
 * Obtain fee per contracts (Synchronous version, use hardcoded fallback)
 * Notice: The correct rate should be from broker_fees surface (DB)Query.
 * This function is only used as client component fast fallback,
 * like broker_fees Table has settings, should be used first trade.fee field.
 */
export function getFeeByBroker(broker: string, symbol?: Symbol): number {
  // fallback fees map — and broker_fees DB Data should be consistent
  const FALLBACK_FEES: Record<string, Record<string, number>> = {
    Manual: { MNQ: 0, NQ: 0, SIL: 0 },
  };
  return FALLBACK_FEES[broker]?.[symbol || 'MNQ'] ?? 0;
}

export function getSymbolLabel(symbol?: Symbol): string {
  if (symbol === 'NQ') return 'NQ';
  if (symbol === 'SIL') return 'SIL';
  return 'MNQ';
}

// Date formatting utilities
export function formatDate(date: string | Date): string {
  if (typeof date === 'string') {
    const parts = parseDateString(date);
    if (parts) {
      const month = String(parts.month).padStart(2, '0');
      const day = String(parts.day).padStart(2, '0');
      return `${parts.year}/${month}/${day}`;
    }
  }

  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function formatTime(time: string | Date): string {
  const d = typeof time === 'string' ? (parseTaipeiDateTime(time) ?? new Date(time)) : time;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function formatDateTime(dateTime: string | Date): string {
  const d = typeof dateTime === 'string' ? (parseTaipeiDateTime(dateTime) ?? new Date(dateTime)) : dateTime;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

export function getTodayString(): string {
  return formatDateInTimeZone(new Date(), CHICAGO_TIME_ZONE);
}

export function getYesterdayString(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return formatDateInTimeZone(now, CHICAGO_TIME_ZONE);
}

export function getCurrentTaipeiDateTime(): string {
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TAIPEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
  return formatted.replace(' ', 'T');
}

export function getChicagoDateString(daysOffset: number = 0): string {
  const now = new Date();
  if (daysOffset !== 0) {
    now.setDate(now.getDate() + daysOffset);
  }
  return formatDateInTimeZone(now, CHICAGO_TIME_ZONE);
}

export function getWeekdayLabel(date: Date | string): string {
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (typeof date === 'string') {
    const parts = parseDateString(date);
    if (parts) {
      const utcDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
      return weekdays[utcDay];
    }
    return weekdays[new Date(date).getDay()];
  }
  return weekdays[date.getDay()];
}

// Trading calculations
export function calculatePnL(trade: Trade): number {
  if (!trade.exit_price || !trade.entry_price) {
    return 0;
  }

  const pnl = trade.side === 'LONG'
    ? (trade.exit_price - trade.entry_price) * trade.qty
    : (trade.entry_price - trade.exit_price) * trade.qty;

  return Math.round(pnl * 100) / 100; // Round to 2 decimal places
}

export function calculatePnLAmount(pnL: number, fee: number = 0, symbol?: Symbol): number {
  const pointValue = getPointValue(symbol);
  const grossAmount = pnL * pointValue; // Points * value per point
  const netAmount = grossAmount - fee; // Deduction of fee
  return Math.round(netAmount * 100) / 100; // Round to two decimal places
}

export function calculateHoldTime(entryTime: string, exitTime?: string): number {
  if (!exitTime) return 0;

  const entryDate = parseTaipeiDateTime(entryTime) ?? new Date(entryTime);
  const exitDate = parseTaipeiDateTime(exitTime) ?? new Date(exitTime);

  const entry = entryDate.getTime();
  const exit = exitDate.getTime();

  return Math.floor((exit - entry) / (1000 * 60)); // minutes
}

export function formatHoldTime(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}point`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0
    ? `${hours}h ${remainingMinutes}m`
    : `${hours}h`;
}

export function calculateRMultiple(trade: Trade): number | null {
  if (!trade.sl_price || !trade.exit_price) {
    return null;
  }

  const risk = trade.side === 'LONG'
    ? Math.abs(trade.entry_price - trade.sl_price)
    : Math.abs(trade.sl_price - trade.entry_price);

  const reward = Math.abs(calculatePnL(trade) / trade.qty);

  return risk > 0 ? Math.round((reward / risk) * 100) / 100 : null;
}

// Price formatting
export function formatPrice(price: number): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatPnL(pnl: number): string {
  const formatted = pnl.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: 'always'
  });

  return formatted;
}

export function formatPnLAmount(amount: number): string {
  const formatted = amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: 'always'
  });

  return formatted;
}

/**
 * Format USD amount with TWD conversion in parentheses
 * @param usdAmount - Amount in USD (net of fees)
 * @param usdTwdRate - USD to TWD exchange rate
 * @returns Formatted string like "$100 (NT$3,150)"
 */
export function formatPnLAmountWithTwd(usdAmount: number, usdTwdRate: number): string {
  const usd = formatPnLAmount(usdAmount);
  const twd = Math.round(Math.abs(usdAmount) * usdTwdRate);
  const twdFormatted = twd.toLocaleString('en-US', {
    signDisplay: 'never' // Do not show +/- in parentheses
  });
  const twdSign = usdAmount < 0 ? '-' : '';

  return `${usd} (${twdSign}NT$${twdFormatted})`;
}

// Validation utilities
export function isValidPrice(price: number): boolean {
  return price > 0 && price < 100000; // Reasonable range for MNQ
}

export function isValidQuantity(qty: number): boolean {
  return qty > 0 && qty <= 100; // Max 100 contracts
}

// Array utilities for JSON fields
export function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function stringifyArray(value: string[]): string {
  return JSON.stringify(value);
}

// Color utilities for PnL display
export function getPnLColor(pnl: number): string {
  if (pnl > 0) return 'text-green-600 dark:text-green-400';
  if (pnl < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-600 dark:text-gray-400';
}

export function getPnLBgColor(pnl: number): string {
  if (pnl > 0) return 'bg-green-50 dark:bg-green-900/20';
  if (pnl < 0) return 'bg-red-50 dark:bg-red-900/20';
  return 'bg-gray-50 dark:bg-gray-900/20';
}

// File utilities
export function isValidImageFile(file: File): boolean {
  const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
  const maxSize = 10 * 1024 * 1024; // 10MB

  return validTypes.includes(file.type) && file.size <= maxSize;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
