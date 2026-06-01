'use client';

interface ExchangeRateData {
  usdTwd: number;
  loading: boolean;
  error: string | null;
}

export function useExchangeRate(): ExchangeRateData {
  const configuredRate = Number(process.env.NEXT_PUBLIC_USD_TWD_RATE);
  return {
    usdTwd: Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 31.5,
    loading: false,
    error: null,
  };
}

export function convertUsdToTwd(usdAmount: number, usdTwdRate: number): number {
  return Math.round(usdAmount * usdTwdRate);
}
