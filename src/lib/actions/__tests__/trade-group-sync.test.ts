/**
 * trade-group-sync.test.ts
 *
 * Tests for rebuildTradeGroup — uses a mock db/tx to verify:
 *   1. Single trade (no group) → group + 1 entry leg + 1 exit leg
 *   2. Multi-trade same group → aggregate entry/exit, dedup by time+price
 *   3. Empty group (last trade deleted) → delete group, no legs inserted
 *   4. Open trade (no exit) → group with no exit fields, no exit legs
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────
const {
  mockSelect,
  mockDelete,
  mockInsert,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockDelete: vi.fn(),
  mockInsert: vi.fn(),
}));

// ─── Mock @/lib/db ────────────────────────────────────────────────────────────
vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
    delete: mockDelete,
    insert: mockInsert,
    transaction: vi.fn(),
  },
}));

// ─── Mock schema ──────────────────────────────────────────────────────────────
vi.mock('@/lib/db/schema', () => ({
  trades: { trade_group_id: 'trade_group_id' },
  trade_groups: { id: 'id' },
  trade_legs: {},
}));

// ─── Mock drizzle-orm ─────────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ _col: col, _eq: val })),
  or: vi.fn((...args) => ({ _or: args })),
  and: vi.fn((...args) => ({ _and: args })),
  isNull: vi.fn((col) => ({ _col: col, _isNull: true })),
}));

import { rebuildTradeGroup } from '@/lib/actions/trade-group-sync';

// ─── Fluent chain builder ─────────────────────────────────────────────────────
type AnyChain = Record<string, unknown>;

function makeSelectChain(rows: unknown[]): AnyChain {
  const chain: AnyChain = {};
  const methods = ['from', 'where', 'orderBy', 'limit'];
  for (const m of methods) {
    chain[m] = () => chain;
  }
  // sync terminator methods used by the new sync code
  chain['all'] = () => rows;
  chain['get'] = () => rows[0];
  // legacy async terminator (kept for backward compat)
  chain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

function makeWriteChain(): AnyChain {
  const chain: AnyChain = {};
  const methods = ['from', 'where', 'values'];
  for (const m of methods) {
    chain[m] = () => chain;
  }
  // sync terminator methods used by the new sync code
  chain['run'] = () => ({ changes: 1 });
  // legacy async terminator (kept for backward compat)
  chain['then'] = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(undefined).then(resolve);
  return chain;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<{
  id: string;
  trade_group_id: string | null;
  date: string;
  symbol: string;
  side: string;
  entry_time: string;
  entry_price: number;
  exit_time: string | null;
  exit_price: number | null;
  qty: number;
  fee: number | null;
  external_trade_ids: string | null;
  sl_price: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  fuel_top: number | null;
  fuel_bottom: number | null;
  fuel: number | null;
  broker: string | null;
  notes: string | null;
  strategy: string | null;
}> = {}) {
  return {
    id: 'trade1',
    trade_group_id: 'group1',
    date: '2026-04-28',
    symbol: 'MNQ',
    side: 'LONG',
    entry_time: '2026-04-28T14:00:00',
    entry_price: 20000,
    exit_time: '2026-04-28T14:30:00',
    exit_price: 20050,
    qty: 1,
    fee: 1.70,
    external_trade_ids: 'external-e1,external-x1',
    sl_price: null,
    tp1: null,
    tp2: null,
    tp3: null,
    fuel_top: null,
    fuel_bottom: null,
    fuel: null,
    broker: 'IB',
    notes: null,
    strategy: 'STAR',
    created_at: '2026-04-28T14:30:01Z',
    updated_at: '2026-04-28T14:30:01Z',
    ...overrides,
  };
}

// ─── Captured insert values helper ───────────────────────────────────────────

let capturedGroupValues: unknown = null;
let capturedLegValues: unknown = null;

function buildTxMock(selectedTrades: unknown[]) {
  capturedGroupValues = null;
  capturedLegValues = null;

  let insertCallCount = 0;

  const tx = {
    select: vi.fn(() => makeSelectChain(selectedTrades)),
    delete: vi.fn(() => makeWriteChain()),
    insert: vi.fn(() => {
      insertCallCount++;
      const callIndex = insertCallCount;
      return {
        values: (vals: unknown) => {
          if (callIndex === 1) capturedGroupValues = vals;
          else capturedLegValues = vals;
          return {
            run: () => ({ changes: 1 }),
            // legacy async terminator kept for compat
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve),
          };
        },
      };
    }),
  };

  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('rebuildTradeGroup', () => {

  it('single closed trade → inserts group + entry + exit legs', async () => {
    const trade = makeTrade();
    const tx = buildTxMock([trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    // group insert was called
    expect(capturedGroupValues).toBeTruthy();
    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.id).toBe('group1');
    expect(group.symbol).toBe('MNQ');
    expect(group.side).toBe('LONG');
    expect(group.total_qty).toBe(1);
    expect(group.entry_price_avg).toBe(20000);
    expect(group.exit_price_avg).toBe(20050);
    expect(group.is_closed).toBe(true);
    expect(group.fee_total).toBeCloseTo(1.70, 2);

    // legs inserted
    expect(capturedLegValues).toBeTruthy();
    const legs = capturedLegValues as unknown[];
    // 1 entry + 1 exit
    expect(legs).toHaveLength(2);
    const entryLeg = (legs as Record<string, unknown>[]).find((l) => l.leg_type === 'entry');
    const exitLeg = (legs as Record<string, unknown>[]).find((l) => l.leg_type === 'exit');
    expect(entryLeg).toBeDefined();
    expect(exitLeg).toBeDefined();
    expect(entryLeg!.fill_price).toBe(20000);
    expect(exitLeg!.fill_price).toBe(20050);
    expect(entryLeg!.external_trade_id).toBe('external-e1');
    expect(exitLeg!.external_trade_id).toBe('external-x1');
  });

  it('multi-trade same group (2 FIFO pairs) → aggregates qty and VWAP, deduplicates entry+exit', async () => {
    // Two trades with different entry/exit prices
    const t1 = makeTrade({ id: 'trade1', entry_price: 20000, exit_price: 20050, qty: 1, fee: 1.70, external_trade_ids: 'e1,x1' });
    const t2 = makeTrade({ id: 'trade2', entry_price: 20010, exit_price: 20060, qty: 1, fee: 1.70, external_trade_ids: 'e2,x2' });
    const tx = buildTxMock([t1, t2]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.total_qty).toBe(2);
    // entry VWAP = (1*20000 + 1*20010) / 2 = 20005
    expect(group.entry_price_avg).toBe(20005);
    // exit VWAP = (1*20050 + 1*20060) / 2 = 20055
    expect(group.exit_price_avg).toBe(20055);
    expect(group.entry_price_min).toBe(20000);
    expect(group.entry_price_max).toBe(20010);
    expect(group.fee_total).toBeCloseTo(3.40, 2);

    const legs = capturedLegValues as Record<string, unknown>[];
    // 2 entry legs (different time+price+external_id) + 2 exit legs
    const entryLegs = legs.filter((l) => l.leg_type === 'entry');
    const exitLegs = legs.filter((l) => l.leg_type === 'exit');
    expect(entryLegs).toHaveLength(2);
    expect(exitLegs).toHaveLength(2);
  });

  it('empty group (all trades deleted) → deletes group, no insert', async () => {
    const tx = buildTxMock([]); // no trades in group

    await rebuildTradeGroup(tx as never, 'group1');

    // delete was called to remove the group
    expect(tx.delete).toHaveBeenCalled();
    // no insert calls
    expect(tx.insert).not.toHaveBeenCalled();
    expect(capturedGroupValues).toBeNull();
    expect(capturedLegValues).toBeNull();
  });

  it('open trade (no exit) → group inserted without exit fields, no exit leg', async () => {
    const trade = makeTrade({ exit_time: null, exit_price: null });
    const tx = buildTxMock([trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.exit_price_avg).toBeNull();
    expect(group.exit_time_first).toBeNull();
    expect(group.total_exit_qty).toBeNull();
    expect(group.is_closed).toBe(false);

    const legs = capturedLegValues as Record<string, unknown>[];
    const exitLegs = legs.filter((l) => l.leg_type === 'exit');
    expect(exitLegs).toHaveLength(0);
    const entryLegs = legs.filter((l) => l.leg_type === 'entry');
    expect(entryLegs).toHaveLength(1);
  });

  it('deduplicates entry legs with same time+price+external_id (sums qty)', async () => {
    // Two trades with identical entry fill → should merge into 1 entry leg
    const t1 = makeTrade({ id: 'trade1', entry_time: '14:00', entry_price: 20000, qty: 1, external_trade_ids: 'e1,x1' });
    const t2 = makeTrade({ id: 'trade2', entry_time: '14:00', entry_price: 20000, qty: 1, external_trade_ids: 'e1,x2' });
    const tx = buildTxMock([t1, t2]);

    await rebuildTradeGroup(tx as never, 'group1');

    const legs = capturedLegValues as Record<string, unknown>[];
    const entryLegs = legs.filter((l) => l.leg_type === 'entry');
    // Both share entry external_id 'e1', same time+price → merged to 1 leg
    expect(entryLegs).toHaveLength(1);
    expect(entryLegs[0].qty).toBe(2);
  });

  it('NULL trade_group_id trade matched by trade.id (legacy pre-backfill defense) → group rebuilt correctly', async () => {
    // Simulates a trade where trade_group_id IS NULL but trade.id === groupId
    // The or(eq(trade_group_id, groupId), and(isNull(trade_group_id), eq(id, groupId))) clause
    // ensures this trade is still matched and the group is rebuilt
    const trade = makeTrade({ id: 'trade-null-group', trade_group_id: null });
    const tx = buildTxMock([trade]);

    await rebuildTradeGroup(tx as never, 'trade-null-group');

    // Group should be rebuilt (not orphaned), even though trade_group_id is NULL
    expect(capturedGroupValues).toBeTruthy();
    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.id).toBe('trade-null-group');
    expect(group.total_qty).toBe(1);
    expect(group.is_closed).toBe(true);

    // Legs should be inserted
    expect(capturedLegValues).toBeTruthy();
    const legs = capturedLegValues as Record<string, unknown>[];
    expect(legs.length).toBeGreaterThan(0);
  });

  it('manual trade (no external_trade_ids) → leg ids use _manual_ key, no merge across trades', async () => {
    const t1 = makeTrade({ id: 'trade1', external_trade_ids: null, broker: 'Manual' });
    const tx = buildTxMock([t1]);

    await rebuildTradeGroup(tx as never, 'group1');

    const legs = capturedLegValues as Record<string, unknown>[];
    const entryLeg = (legs as Record<string, unknown>[]).find((l) => l.leg_type === 'entry');
    expect(entryLeg).toBeDefined();
    expect(entryLeg!.external_trade_id).toBeNull();
  });

});

// ─── Strategy Preserving Invariant Testing ────────────────────────────────────────────────────────

/**
 * buildTxMockWithGroup: support rebuildTradeGroup twice select:
 *   1st call → check trades (matched)
 *   2nd call → check trade_groups (existingGroup.strategy)
 */
function buildTxMockWithGroup(
  existingGroupStrategy: string | null | undefined,
  selectedTrades: unknown[],
) {
  capturedGroupValues = null;
  capturedLegValues = null;

  let selectCallCount = 0;
  let insertCallCount = 0;

  const tx = {
    select: vi.fn(() => {
      selectCallCount++;
      const callIndex = selectCallCount;
      // rebuildTradeGroup call sequence:
      //   1st select = check trades (matched)
      //   2nd select = check trade_groups (existingGroup.strategy + existingGroup.notes)
      if (callIndex === 1) {
        return makeSelectChain(selectedTrades);
      }
      // 2nd select = check existingGroup (make up notes: null make sure schema consistent)
      const groupRow = existingGroupStrategy !== undefined
        ? [{ strategy: existingGroupStrategy, notes: null }]
        : [];
      return makeSelectChain(groupRow);
    }),
    delete: vi.fn(() => makeWriteChain()),
    insert: vi.fn(() => {
      insertCallCount++;
      const callIndex = insertCallCount;
      return {
        values: (vals: unknown) => {
          if (callIndex === 1) capturedGroupValues = vals;
          else capturedLegValues = vals;
          return {
            run: () => ({ changes: 1 }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve),
          };
        },
      };
    }),
  };

  return tx;
}

// ─── Note: Preserve invariant testing ────────────────────────────────────────────────────────

/**
 * buildTxMockWithGroupAttrs: support rebuildTradeGroup twice select:
 *   1st call → check trades (matched)
 *   2nd call → check trade_groups (existingGroup.strategy + existingGroup.notes)
 */
function buildTxMockWithGroupAttrs(
  existingGroup: { strategy: string | null; notes: string | null } | undefined,
  selectedTrades: unknown[],
) {
  capturedGroupValues = null;
  capturedLegValues = null;

  let selectCallCount = 0;
  let insertCallCount = 0;

  const tx = {
    select: vi.fn(() => {
      selectCallCount++;
      const callIndex = selectCallCount;
      if (callIndex === 1) {
        return makeSelectChain(selectedTrades);
      }
      // 2nd select = check existingGroup (strategy + notes)
      const groupRow = existingGroup !== undefined
        ? [{ strategy: existingGroup.strategy, notes: existingGroup.notes }]
        : [];
      return makeSelectChain(groupRow);
    }),
    delete: vi.fn(() => makeWriteChain()),
    insert: vi.fn(() => {
      insertCallCount++;
      const callIndex = insertCallCount;
      return {
        values: (vals: unknown) => {
          if (callIndex === 1) capturedGroupValues = vals;
          else capturedLegValues = vals;
          return {
            run: () => ({ changes: 1 }),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve),
          };
        },
      };
    }),
  };

  return tx;
}

describe('rebuildTradeGroup — Note: retain the invariant (SPEC §4.2)', () => {

  it('The group already exists and notes="Good entry position": retained after rebuilding, not be first.notes Cover it up', async () => {
    const trade = makeTrade({ notes: 'Old seed notes' });
    const tx = buildTxMockWithGroupAttrs(
      { strategy: null, notes: 'Good entry position' },
      [trade],
    );

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.notes).toBe('Good entry position');
  });

  it('The group already exists and notes=null (User clear): retained after rebuilding null, not be first.notes cover', async () => {
    const trade = makeTrade({ notes: 'There are seed notes' });
    const tx = buildTxMockWithGroupAttrs(
      { strategy: null, notes: null },
      [trade],
    );

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.notes).toBeNull();
  });

  it('Group created for the first time (existingGroup does not exist): from first.notes Bring in seeds', async () => {
    const trade = makeTrade({ notes: 'Initial remarks seed' });
    // existingGroup does not exist → undefined
    const tx = buildTxMockWithGroupAttrs(undefined, [trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.notes).toBe('Initial remarks seed');
  });

  it('The group is created for the first time and first.notes=null: notes for null', async () => {
    const trade = makeTrade({ notes: null });
    const tx = buildTxMockWithGroupAttrs(undefined, [trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.notes).toBeNull();
  });

});

describe('rebuildTradeGroup — strategy preservation invariants (SPEC §4.1)', () => {

  it('The group already exists and strategy="COW": retained after rebuilding "COW", not be first.strategy="STAR" Cover it up', async () => {
    const trade = makeTrade({ strategy: 'STAR' });
    // existingGroup.strategy = 'COW'
    const tx = buildTxMockWithGroup('COW', [trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.strategy).toBe('COW');
  });

  it('The group already exists and strategy=null (User clear): retained after rebuilding null, not be first.strategy cover', async () => {
    const trade = makeTrade({ strategy: 'STAR' });
    // existingGroup.strategy = null (User has explicitly cleared)
    const tx = buildTxMockWithGroup(null, [trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.strategy).toBeNull();
  });

  it('Group created for the first time (existingGroup does not exist): from first.strategy Bring in seeds', async () => {
    const trade = makeTrade({ strategy: 'STAR' });
    // existingGroup does not exist → select Return empty array (undefined)
    const tx = buildTxMockWithGroup(undefined, [trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.strategy).toBe('STAR');
  });

  it('The group is created for the first time and first.strategy=null: strategy for null', async () => {
    const trade = makeTrade({ strategy: null });
    const tx = buildTxMockWithGroup(undefined, [trade]);

    await rebuildTradeGroup(tx as never, 'group1');

    const group = capturedGroupValues as Record<string, unknown>;
    expect(group.strategy).toBeNull();
  });

});
