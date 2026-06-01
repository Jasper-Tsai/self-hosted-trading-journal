import { describe, it, expect } from 'vitest';
import {
  BREAKEVEN_POINTS_PER_CONTRACT,
  classifyByPointsPerContract,
  computeWinRate,
  isBreakevenByPoints,
} from '@/lib/win-rate';

describe('win-rate helpers', () => {
  it('breakeven threshold is 5 points per contract', () => {
    expect(BREAKEVEN_POINTS_PER_CONTRACT).toBe(5);
  });

  describe('classifyByPointsPerContract', () => {
    it('classifies > +5 per contract as win', () => {
      expect(classifyByPointsPerContract(6, 1)).toBe('win');
      expect(classifyByPointsPerContract(11, 2)).toBe('win'); // 5.5/c
    });

    it('classifies < -5 per contract as loss', () => {
      expect(classifyByPointsPerContract(-6, 1)).toBe('loss');
      expect(classifyByPointsPerContract(-12, 2)).toBe('loss'); // -6/c
    });

    it('classifies |x| ≤ 5 per contract as breakeven (boundary inclusive)', () => {
      expect(classifyByPointsPerContract(5, 1)).toBe('breakeven');
      expect(classifyByPointsPerContract(-5, 1)).toBe('breakeven');
      expect(classifyByPointsPerContract(0, 1)).toBe('breakeven');
      expect(classifyByPointsPerContract(10, 2)).toBe('breakeven'); // 5/c
      expect(classifyByPointsPerContract(-10, 2)).toBe('breakeven');
      expect(classifyByPointsPerContract(4.99, 1)).toBe('breakeven');
    });

    it('treats qty <= 0 or non-finite as breakeven (safe fallback)', () => {
      expect(classifyByPointsPerContract(100, 0)).toBe('breakeven');
      expect(classifyByPointsPerContract(100, -1)).toBe('breakeven');
      expect(classifyByPointsPerContract(NaN, 1)).toBe('breakeven');
      expect(classifyByPointsPerContract(10, NaN)).toBe('breakeven');
    });

    it('uses every-contract average, not totals', () => {
      // 30 points across 10 contracts = 3/c → breakeven
      expect(classifyByPointsPerContract(30, 10)).toBe('breakeven');
      // 60 points across 10 contracts = 6/c → win
      expect(classifyByPointsPerContract(60, 10)).toBe('win');
    });
  });

  describe('isBreakevenByPoints', () => {
    it('matches classify result', () => {
      expect(isBreakevenByPoints(0, 1)).toBe(true);
      expect(isBreakevenByPoints(5, 1)).toBe(true);
      expect(isBreakevenByPoints(6, 1)).toBe(false);
      expect(isBreakevenByPoints(-6, 1)).toBe(false);
    });
  });

  describe('computeWinRate', () => {
    it('returns wins / (wins + losses) * 100', () => {
      expect(computeWinRate(7, 3)).toBe(70);
      expect(computeWinRate(1, 1)).toBe(50);
      expect(computeWinRate(0, 5)).toBe(0);
      expect(computeWinRate(5, 0)).toBe(100);
    });

    it('returns 0 when both wins and losses are 0', () => {
      expect(computeWinRate(0, 0)).toBe(0);
    });

    it('excludes breakeven from denominator (call-site responsibility)', () => {
      // 7 wins, 3 losses, 100 breakevens → still 70% (caller does not pass BE)
      expect(computeWinRate(7, 3)).toBe(70);
    });
  });
});
