import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mock drizzle db ─────────────────────────────────────────────────────────
// vi.hoisted ensures mockSelect is initialised before the hoisted vi.mock factory runs

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: { select: mockSelect },
}));

// Mock schema so imports resolve (actual values not needed by mock)
vi.mock('@/lib/db/schema', () => ({
  trade_groups: { date: 'date', symbol: 'symbol', strategy: 'strategy', side: 'side', entry_time_first: 'entry_time_first' },
  trade_legs: { trade_group_id: 'trade_group_id', fill_time: 'fill_time', leg_type: 'leg_type' },
}));

// drizzle-orm operators — not used in mock chains, just need to not throw on import
vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
}));

import {
  listTradeGroups,
  getTradeGroupWithLegs,
  getTradeGroupStats,
} from '@/lib/actions/trade-groups';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type AnyChain = Record<string, () => AnyChain>;

/** Build a drizzle-like fluent chain that resolves to `rows` at the end. */
function makeChain(rows: unknown[]): AnyChain {
  const chain: AnyChain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    // Make the chain itself thenable so `await chain` works
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  } as unknown as AnyChain;
  return chain;
}

function stubSelect(rowSets: unknown[][]) {
  let call = 0;
  mockSelect.mockImplementation(() => makeChain(rowSets[call++] ?? []));
}

// Sample fixtures
const GROUP_ROW = {
  id: 'g1',
  date: '2026-04-28',
  symbol: 'MNQ',
  side: 'LONG',
  entry_time_first: '2026-04-28T14:00:00',
  entry_time_last: '2026-04-28T14:00:01',
  entry_price_min: 20000,
  entry_price_max: 20005,
  entry_price_avg: 20002.5,
  total_qty: 2,
  exit_time_first: '2026-04-28T14:30:00',
  exit_time_last: '2026-04-28T14:30:00',
  exit_price_min: 20050,
  exit_price_max: 20050,
  exit_price_avg: 20050,
  total_exit_qty: 2,
  is_closed: true,
  sl_price: 19980,
  tp1: 20050,
  tp2: null,
  tp3: null,
  fuel_top: null,
  fuel_bottom: null,
  fuel: null,
  broker: 'IB',
  fee_total: 3.4,
  notes: null,
  strategy: 'STAR',
  created_at: '2026-04-28T14:30:01Z',
  updated_at: '2026-04-28T14:30:01Z',
};

const LEG_ENTRY: typeof import('@/lib/db/schema').trade_legs.$inferSelect = {
  id: 'l1',
  trade_group_id: 'g1',
  leg_type: 'entry',
  fill_time: '2026-04-28T14:00:00',
  fill_price: 20000,
  qty: 1,
  fee: 0.85,
  external_trade_id: 'external-001',
  external_order_id: 'ord-001',
  matched_entry_leg_id: null,
  pnl_points: null,
  pnl_amount: null,
  created_at: '2026-04-28T14:00:01Z',
};

const LEG_EXIT: typeof import('@/lib/db/schema').trade_legs.$inferSelect = {
  id: 'l2',
  trade_group_id: 'g1',
  leg_type: 'exit',
  fill_time: '2026-04-28T14:30:00',
  fill_price: 20050,
  qty: 1,
  fee: 0.85,
  external_trade_id: 'external-002',
  external_order_id: 'ord-002',
  matched_entry_leg_id: 'l1',
  pnl_points: 50,
  pnl_amount: 100,
  created_at: '2026-04-28T14:30:01Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── listTradeGroups ──────────────────────────────────────────────────────────

describe('listTradeGroups', () => {
  it('returns rows from db.select chain', async () => {
    stubSelect([[GROUP_ROW]]);
    const result = await listTradeGroups();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g1');
  });

  it('returns empty array when no rows', async () => {
    stubSelect([[]]);
    const result = await listTradeGroups({ fromDate: '2026-01-01', toDate: '2026-01-31' });
    expect(result).toEqual([]);
  });
});

// ─── getTradeGroupWithLegs ────────────────────────────────────────────────────

describe('getTradeGroupWithLegs', () => {
  it('returns null when group not found', async () => {
    stubSelect([[]]);
    const result = await getTradeGroupWithLegs('nonexistent');
    expect(result).toBeNull();
  });

  it('returns group with entries and exits split correctly', async () => {
    stubSelect([[GROUP_ROW], [LEG_ENTRY, LEG_EXIT]]);
    const result = await getTradeGroupWithLegs('g1');
    expect(result).not.toBeNull();
    expect(result!.group.id).toBe('g1');
    expect(result!.entries).toHaveLength(1);
    expect(result!.entries[0].leg_type).toBe('entry');
    expect(result!.exits).toHaveLength(1);
    expect(result!.exits[0].leg_type).toBe('exit');
  });

  it('handles group with no legs (open position)', async () => {
    stubSelect([[GROUP_ROW], []]);
    const result = await getTradeGroupWithLegs('g1');
    expect(result).not.toBeNull();
    expect(result!.entries).toHaveLength(0);
    expect(result!.exits).toHaveLength(0);
  });
});

// ─── getTradeGroupStats ───────────────────────────────────────────────────────

describe('getTradeGroupStats', () => {
  it('returns zeros for empty group set', async () => {
    stubSelect([[]]);
    const stats = await getTradeGroupStats();
    expect(stats.total_groups).toBe(0);
    expect(stats.total_qty).toBe(0);
    expect(stats.total_pnl_points).toBe(0);
    expect(stats.total_fee).toBe(0);
  });

  it('correctly calculates LONG PnL: (exit_avg - entry_avg) * qty', async () => {
    // GROUP_ROW: LONG, entry_avg=20002.5, exit_avg=20050, qty=2
    // pnl = 1 * (20050 - 20002.5) * 2 = 95 pts
    stubSelect([[GROUP_ROW]]);
    const stats = await getTradeGroupStats();
    expect(stats.total_groups).toBe(1);
    expect(stats.total_qty).toBe(2);
    expect(stats.total_pnl_points).toBeCloseTo(95, 1);
    expect(stats.total_fee).toBeCloseTo(3.4, 2);
  });

  it('correctly calculates SHORT PnL: (entry_avg - exit_avg) * qty', async () => {
    const shortGroup = {
      ...GROUP_ROW,
      side: 'SHORT',
      entry_price_avg: 20050,
      exit_price_avg: 20002.5,
      total_qty: 2,
      fee_total: 3.4,
    };
    stubSelect([[shortGroup]]);
    const stats = await getTradeGroupStats();
    // pnl = -1 * (20002.5 - 20050) * 2 = -1 * (-47.5) * 2 = 95
    expect(stats.total_pnl_points).toBeCloseTo(95, 1);
  });

  it('skips groups with no exit data (open positions)', async () => {
    const openGroup = { ...GROUP_ROW, exit_price_avg: null, total_exit_qty: null };
    stubSelect([[openGroup]]);
    const stats = await getTradeGroupStats();
    expect(stats.total_groups).toBe(1);
    expect(stats.total_pnl_points).toBe(0);
    expect(stats.total_qty).toBe(0); // skipped in loop
  });

  // ─── Bug 1 fix: partial fee proration ────────────────────────────────────

  it('prorates fee by closed ratio for partial exit (total_qty=4, total_exit_qty=2, fee_total=4.0)', async () => {
    // closedRatio = 2/4 = 0.5 → proratedFee = 4.0 * 0.5 = 2.0
    const partialGroup = {
      ...GROUP_ROW,
      total_qty: 4,
      total_exit_qty: 2,
      fee_total: 4.0,
      is_closed: false,
    };
    stubSelect([[partialGroup]]);
    const stats = await getTradeGroupStats();
    expect(stats.total_fee).toBeCloseTo(2.0, 4);
  });

  it('fully-closed group: closedRatio=1 → fee unchanged (regression check)', async () => {
    // GROUP_ROW: total_qty=2, total_exit_qty=2, fee_total=3.4 → closedRatio=1 → fee=3.4
    stubSelect([[GROUP_ROW]]);
    const stats = await getTradeGroupStats();
    expect(stats.total_fee).toBeCloseTo(3.4, 4);
  });

  it('prorates fee for 1/4 closed: total_exit_qty=1, total_qty=4, fee_total=4.0 → proratedFee=1.0', async () => {
    const quarterClosedGroup = {
      ...GROUP_ROW,
      total_qty: 4,
      total_exit_qty: 1,
      fee_total: 4.0,
      is_closed: false,
    };
    stubSelect([[quarterClosedGroup]]);
    const stats = await getTradeGroupStats();
    expect(stats.total_fee).toBeCloseTo(1.0, 4);
  });
});
