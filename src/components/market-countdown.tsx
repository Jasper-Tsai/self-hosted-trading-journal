'use client';

import { useState, useEffect } from 'react';

interface MarketCountdownProps {
  isOpen: boolean;
  nextOpenTime: string;
  secondsToOpen: number;
}

export function MarketCountdown({ isOpen, nextOpenTime, secondsToOpen }: MarketCountdownProps) {
  const [remaining, setRemaining] = useState(secondsToOpen);
  const [marketOpen, setMarketOpen] = useState(isOpen);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          setMarketOpen(true);
          return 0;
        }
        return prev - 1;
      });
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsToOpen]);

  // Calculate elapsed minutes since open
  const getElapsedMinutes = () => {
    if (!nextOpenTime) return 0;
    const openTime = new Date(nextOpenTime).getTime();
    return Math.floor((now - openTime) / 60000);
  };

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Weekend / holiday: secondsToOpen is very large or negative
  const isRestDay = !marketOpen && remaining <= 0;

  if (isRestDay) {
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-gray-400">
        <span className="inline-block w-2 h-2 rounded-full bg-gray-500" />
        休市
      </div>
    );
  }

  if (marketOpen) {
    const elapsed = getElapsedMinutes();
    return (
      <div className="flex items-center gap-2 text-sm font-medium text-green-400">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        盤中 已開盤 {elapsed} 分鐘
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm font-medium text-yellow-400">
      <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
      距開盤 {formatTime(remaining)}
    </div>
  );
}
