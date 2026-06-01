import { describe, it, expect } from 'vitest';
import {
  getFeeByBroker,
  getPointValue,
  calculatePnL,
  calculatePnLAmount,
  calculateHoldTime,
  calculateRMultiple,
  formatPnL,
  formatPnLAmount,
  isValidPrice,
  isValidQuantity,
} from './utils';
import { Trade } from '@/types';

describe('getFeeByBroker', () => {
  describe('default public edition fees', () => {
    it('Manual broker defaults to zero fees', () => {
      expect(getFeeByBroker('Manual', 'MNQ')).toBe(0);
      expect(getFeeByBroker('Manual', 'NQ')).toBe(0);
      expect(getFeeByBroker('Manual')).toBe(0);
    });

    it('unknown brokers default to zero fees', () => {
      expect(getFeeByBroker('Custom', 'MNQ')).toBe(0);
      expect(getFeeByBroker('Custom', 'NQ')).toBe(0);
    });
  });
});

describe('getPointValue', () => {
  it('MNQ 每點價值 $2', () => {
    expect(getPointValue('MNQ')).toBe(2);
  });

  it('NQ 每點價值 $20', () => {
    expect(getPointValue('NQ')).toBe(20);
  });

  it('未指定商品時預設為 MNQ ($2)', () => {
    expect(getPointValue()).toBe(2);
  });
});

describe('calculatePnL', () => {
  it('LONG 獲利計算正確', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21010,
      qty: 2,
      broker: 'Manual',
    };
    // (21010 - 21000) * 2 = 20 點
    expect(calculatePnL(trade)).toBe(20);
  });

  it('LONG 虧損計算正確', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 20990,
      qty: 2,
      broker: 'Manual',
    };
    // (20990 - 21000) * 2 = -20 點
    expect(calculatePnL(trade)).toBe(-20);
  });

  it('SHORT 獲利計算正確', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'SHORT',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 20990,
      qty: 2,
      broker: 'Manual',
    };
    // (21000 - 20990) * 2 = 20 點
    expect(calculatePnL(trade)).toBe(20);
  });

  it('SHORT 虧損計算正確', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'SHORT',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21010,
      qty: 2,
      broker: 'Manual',
    };
    // (21000 - 21010) * 2 = -20 點
    expect(calculatePnL(trade)).toBe(-20);
  });

  it('未平倉（無出場價）應回傳 0', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      qty: 2,
      broker: 'Manual',
    };
    expect(calculatePnL(trade)).toBe(0);
  });
});

describe('calculatePnLAmount', () => {
  it('MNQ 獲利金額計算正確 (含手續費)', () => {
    // 10 點 * $2/點 - $4 手續費 = $16
    expect(calculatePnLAmount(10, 4, 'MNQ')).toBe(16);
  });

  it('NQ 獲利金額計算正確 (含手續費)', () => {
    // 10 點 * $20/點 - $9 手續費 = $191
    expect(calculatePnLAmount(10, 9, 'NQ')).toBe(191);
  });

  it('虧損金額計算正確 (含手續費)', () => {
    // -10 點 * $2/點 - $4 手續費 = -$24
    expect(calculatePnLAmount(-10, 4, 'MNQ')).toBe(-24);
  });

  it('無手續費時計算正確', () => {
    // 10 點 * $2/點 - $0 手續費 = $20
    expect(calculatePnLAmount(10, 0, 'MNQ')).toBe(20);
  });
});

describe('calculateHoldTime', () => {
  it('計算持倉時間（分鐘）', () => {
    const entryTime = '2025-01-01T10:00:00';
    const exitTime = '2025-01-01T10:30:00';
    expect(calculateHoldTime(entryTime, exitTime)).toBe(30);
  });

  it('跨小時持倉計算正確', () => {
    const entryTime = '2025-01-01T10:00:00';
    const exitTime = '2025-01-01T12:15:00';
    expect(calculateHoldTime(entryTime, exitTime)).toBe(135); // 2小時15分
  });

  it('未出場時回傳 0', () => {
    const entryTime = '2025-01-01T10:00:00';
    expect(calculateHoldTime(entryTime, undefined)).toBe(0);
  });
});

describe('calculateRMultiple', () => {
  it('計算 R 倍數 (獲利)', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21020, // 獲利 20 點
      sl_price: 20990,   // 風險 10 點
      qty: 1,
      broker: 'Manual',
    };
    // R = 20 / 10 = 2
    expect(calculateRMultiple(trade)).toBe(2);
  });

  it('計算 R 倍數 (虧損)', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 20995, // 虧損 5 點
      sl_price: 20990,   // 風險 10 點
      qty: 1,
      broker: 'Manual',
    };
    // R = 5 / 10 = 0.5
    expect(calculateRMultiple(trade)).toBe(0.5);
  });

  it('無止損價時回傳 null', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21020,
      qty: 1,
      broker: 'Manual',
    };
    expect(calculateRMultiple(trade)).toBeNull();
  });

  it('未平倉時回傳 null', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      sl_price: 20990,
      qty: 1,
      broker: 'Manual',
    };
    expect(calculateRMultiple(trade)).toBeNull();
  });
});

describe('formatPnL', () => {
  it('正數顯示正號', () => {
    const result = formatPnL(10);
    expect(result).toContain('+');
    expect(result).toContain('10');
  });

  it('負數顯示負號', () => {
    const result = formatPnL(-10);
    expect(result).toContain('-');
    expect(result).toContain('10');
  });
});

describe('formatPnLAmount', () => {
  it('正數顯示貨幣格式', () => {
    const result = formatPnLAmount(100);
    expect(result).toContain('100');
    expect(result).toContain('$');
  });

  it('負數顯示貨幣格式', () => {
    const result = formatPnLAmount(-100);
    expect(result).toContain('100');
  });
});

describe('isValidPrice', () => {
  it('有效價格', () => {
    expect(isValidPrice(21000)).toBe(true);
    expect(isValidPrice(0.25)).toBe(true);
    expect(isValidPrice(99999)).toBe(true);
  });

  it('無效價格', () => {
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(-100)).toBe(false);
    expect(isValidPrice(100000)).toBe(false);
    expect(isValidPrice(100001)).toBe(false);
  });
});

describe('isValidQuantity', () => {
  it('有效口數', () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(50)).toBe(true);
    expect(isValidQuantity(100)).toBe(true);
  });

  it('無效口數', () => {
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(-1)).toBe(false);
    expect(isValidQuantity(101)).toBe(false);
  });
});

// 整合測試：完整交易流程計算
describe('完整交易計算流程', () => {
  it('MNQ Manual LONG 獲利計算', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21015, // 獲利 15 點
      qty: 2,
      broker: 'Manual',
    };

    const pnl = calculatePnL(trade);
    expect(pnl).toBe(30); // 15 點 * 2 口 = 30 點

    const fee = getFeeByBroker('Manual', 'MNQ') * trade.qty;
    expect(fee).toBe(0);

    const amount = calculatePnLAmount(pnl, fee, 'MNQ');
    expect(amount).toBe(60); // 30 點 * $2
  });

  it('NQ Custom SHORT 虧損計算', () => {
    const trade: Trade = {
      id: '2',
      date: '2025-01-01',
      symbol: 'NQ',
      side: 'SHORT',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21005, // 虧損 5 點
      qty: 1,
      broker: 'Custom',
    };

    const pnl = calculatePnL(trade);
    expect(pnl).toBe(-5); // SHORT: (21000 - 21005) = -5 點

    const fee = getFeeByBroker('Custom', 'NQ') * trade.qty;
    expect(fee).toBe(0);

    const amount = calculatePnLAmount(pnl, fee, 'NQ');
    expect(amount).toBe(-100); // -5 點 * $20
  });
});
