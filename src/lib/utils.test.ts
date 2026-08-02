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
  it('MNQ value per point $2', () => {
    expect(getPointValue('MNQ')).toBe(2);
  });

  it('NQ value per point $20', () => {
    expect(getPointValue('NQ')).toBe(20);
  });

  it('When no product is specified, the default is MNQ ($2)', () => {
    expect(getPointValue()).toBe(2);
  });
});

describe('calculatePnL', () => {
  it('LONG Profit calculation correct', () => {
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
    // (21010 - 21000) * 2 = 20 point
    expect(calculatePnL(trade)).toBe(20);
  });

  it('LONG Loss calculation is correct', () => {
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
    // (20990 - 21000) * 2 = -20 point
    expect(calculatePnL(trade)).toBe(-20);
  });

  it('SHORT Profit calculation correct', () => {
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
    // (21000 - 20990) * 2 = 20 point
    expect(calculatePnL(trade)).toBe(20);
  });

  it('SHORT Loss calculation is correct', () => {
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
    // (21000 - 21010) * 2 = -20 point
    expect(calculatePnL(trade)).toBe(-20);
  });

  it('Open position (No exit price)Should be returned 0', () => {
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
  it('MNQ The profit amount is calculated correctly (Including fee)', () => {
    // 10 point * $2/point - $4 fee = $16
    expect(calculatePnLAmount(10, 4, 'MNQ')).toBe(16);
  });

  it('NQ The profit amount is calculated correctly (Including fee)', () => {
    // 10 point * $20/point - $9 fee = $191
    expect(calculatePnLAmount(10, 9, 'NQ')).toBe(191);
  });

  it('The loss amount is calculated correctly (Including fee)', () => {
    // -10 point * $2/point - $4 fee = -$24
    expect(calculatePnLAmount(-10, 4, 'MNQ')).toBe(-24);
  });

  it('Calculated correctly when there is no fee', () => {
    // 10 point * $2/point - $0 fee = $20
    expect(calculatePnLAmount(10, 0, 'MNQ')).toBe(20);
  });
});

describe('calculateHoldTime', () => {
  it('Calculate position holding time (minute)', () => {
    const entryTime = '2025-01-01T10:00:00';
    const exitTime = '2025-01-01T10:30:00';
    expect(calculateHoldTime(entryTime, exitTime)).toBe(30);
  });

  it('Cross-hour positions are calculated correctly', () => {
    const entryTime = '2025-01-01T10:00:00';
    const exitTime = '2025-01-01T12:15:00';
    expect(calculateHoldTime(entryTime, exitTime)).toBe(135); // 2Hour15point
  });

  it('Return when not on the field 0', () => {
    const entryTime = '2025-01-01T10:00:00';
    expect(calculateHoldTime(entryTime, undefined)).toBe(0);
  });
});

describe('calculateRMultiple', () => {
  it('calculate R multiple (profit)', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21020, // profit 20 point
      sl_price: 20990,   // risk 10 point
      qty: 1,
      broker: 'Manual',
    };
    // R = 20 / 10 = 2
    expect(calculateRMultiple(trade)).toBe(2);
  });

  it('calculate R multiple (Loss)', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 20995, // Loss 5 point
      sl_price: 20990,   // risk 10 point
      qty: 1,
      broker: 'Manual',
    };
    // R = 5 / 10 = 0.5
    expect(calculateRMultiple(trade)).toBe(0.5);
  });

  it('Return when there is no stop loss price null', () => {
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

  it('Return when the position is not closed null', () => {
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
  it('Positive number shows positive sign', () => {
    const result = formatPnL(10);
    expect(result).toContain('+');
    expect(result).toContain('10');
  });

  it('Negative numbers show minus sign', () => {
    const result = formatPnL(-10);
    expect(result).toContain('-');
    expect(result).toContain('10');
  });
});

describe('formatPnLAmount', () => {
  it('Positive number display currency format', () => {
    const result = formatPnLAmount(100);
    expect(result).toContain('100');
    expect(result).toContain('$');
  });

  it('Negative number display currency format', () => {
    const result = formatPnLAmount(-100);
    expect(result).toContain('100');
  });
});

describe('isValidPrice', () => {
  it('effective price', () => {
    expect(isValidPrice(21000)).toBe(true);
    expect(isValidPrice(0.25)).toBe(true);
    expect(isValidPrice(99999)).toBe(true);
  });

  it('Invalid price', () => {
    expect(isValidPrice(0)).toBe(false);
    expect(isValidPrice(-100)).toBe(false);
    expect(isValidPrice(100000)).toBe(false);
    expect(isValidPrice(100001)).toBe(false);
  });
});

describe('isValidQuantity', () => {
  it('Valid number of contractss', () => {
    expect(isValidQuantity(1)).toBe(true);
    expect(isValidQuantity(50)).toBe(true);
    expect(isValidQuantity(100)).toBe(true);
  });

  it('Invalid contracts count', () => {
    expect(isValidQuantity(0)).toBe(false);
    expect(isValidQuantity(-1)).toBe(false);
    expect(isValidQuantity(101)).toBe(false);
  });
});

// Integration testing: Complete trade calculation flow
describe('Complete trade calculation flow', () => {
  it('MNQ Manual LONG Profit calculation', () => {
    const trade: Trade = {
      id: '1',
      date: '2025-01-01',
      symbol: 'MNQ',
      side: 'LONG',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21015, // profit 15 point
      qty: 2,
      broker: 'Manual',
    };

    const pnl = calculatePnL(trade);
    expect(pnl).toBe(30); // 15 point * 2 contracts = 30 point

    const fee = getFeeByBroker('Manual', 'MNQ') * trade.qty;
    expect(fee).toBe(0);

    const amount = calculatePnLAmount(pnl, fee, 'MNQ');
    expect(amount).toBe(60); // 30 point * $2
  });

  it('NQ Custom SHORT Loss calculation', () => {
    const trade: Trade = {
      id: '2',
      date: '2025-01-01',
      symbol: 'NQ',
      side: 'SHORT',
      entry_time: '2025-01-01T10:00:00',
      entry_price: 21000,
      exit_price: 21005, // Loss 5 point
      qty: 1,
      broker: 'Custom',
    };

    const pnl = calculatePnL(trade);
    expect(pnl).toBe(-5); // SHORT: (21000 - 21005) = -5 point

    const fee = getFeeByBroker('Custom', 'NQ') * trade.qty;
    expect(fee).toBe(0);

    const amount = calculatePnLAmount(pnl, fee, 'NQ');
    expect(amount).toBe(-100); // -5 point * $20
  });
});
