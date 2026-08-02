/**
 * Tests for POST /api/trade-groups/batch
 *
 * Covers:
 *   - server-generated group_id (client value ignored)
 *   - validation rejections: empty array, bad side, bad symbol, empty broker,
 *     non-positive prices, non-integer qty, bad date, cross-trade inconsistency
 *   - happy path: returns success + server-generated group_id
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────────

const { mockTransaction, mockInsert, mockSelect } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    transaction: mockTransaction,
    insert: mockInsert,
    select: mockSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  trades: {},
  trade_groups: {},
  trade_legs: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  gte: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  verifyRequest: vi.fn().mockResolvedValue({ role: 'owner', uid: 'u1' }),
}));

vi.mock('@/lib/actions/trade-group-sync', () => ({
  rebuildTradeGroup: vi.fn().mockResolvedValue(undefined),
}));

import { POST } from '../batch/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/trade-groups/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Request;
}

const VALID_TRADE = {
  date: '2026-04-28',
  symbol: 'MNQ',
  side: 'LONG',
  entry_time: '2026-04-28T14:00:00',
  entry_price: 20000,
  exit_time: '2026-04-28T14:30:00',
  exit_price: 20050,
  qty: 1,
  broker: 'IB',
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: transaction calls the callback with a mock tx
  mockTransaction.mockImplementation((cb: (tx: unknown) => void) => {
    const mockTx = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 1 }) }),
      }),
    };
    cb(mockTx);
  });
});

// ─── Validation rejection tests ───────────────────────────────────────────────

describe('POST /api/trade-groups/batch — validation', () => {
  it('rejects when trades is not an array', async () => {
    const res = await POST(makeRequest({ trades: 'bad' }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Array/);
  });

  it('rejects empty trades array', async () => {
    const res = await POST(makeRequest({ trades: [] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot be empty/);
  });

  it('rejects invalid side', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, side: 'BUY' }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/side/);
  });

  it('rejects invalid symbol', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, symbol: 'AAPL' }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/symbol/);
  });

  it('rejects empty broker', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, broker: '' }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/broker/);
  });

  it('rejects non-positive entry_price', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, entry_price: -1 }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/entry_price/);
  });

  it('rejects non-positive exit_price when provided', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, exit_price: 0 }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exit_price/);
  });

  it('rejects non-integer qty', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, qty: 1.5 }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/qty/);
  });

  it('rejects zero qty', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, qty: 0 }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/qty/);
  });

  it('rejects malformed date', async () => {
    const res = await POST(makeRequest({ trades: [{ ...VALID_TRADE, date: '28-04-2026' }] }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/date/);
  });

  it('rejects cross-trade symbol mismatch', async () => {
    const trades = [
      { ...VALID_TRADE, symbol: 'MNQ' },
      { ...VALID_TRADE, symbol: 'NQ' },
    ];
    const res = await POST(makeRequest({ trades }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/symbol/);
  });

  it('rejects cross-trade side mismatch', async () => {
    const trades = [
      { ...VALID_TRADE, side: 'LONG' },
      { ...VALID_TRADE, side: 'SHORT' },
    ];
    const res = await POST(makeRequest({ trades }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/side/);
  });

  it('rejects cross-trade date mismatch', async () => {
    const trades = [
      { ...VALID_TRADE, date: '2026-04-28' },
      { ...VALID_TRADE, date: '2026-04-29' },
    ];
    const res = await POST(makeRequest({ trades }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/date/);
  });

  it('rejects cross-trade broker mismatch', async () => {
    const trades = [
      { ...VALID_TRADE, broker: 'IB' },
      { ...VALID_TRADE, broker: 'Manual' },
    ];
    const res = await POST(makeRequest({ trades }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/broker/);
  });

  // ─── Strict datetime validation (Bug 2 fix) ───────────────────────────────

  it('rejects Feb 31 (normalizes to Mar 03 without strict check)', async () => {
    const res = await POST(makeRequest({
      trades: [{ ...VALID_TRADE, entry_time: '2026-02-31T14:00:00' }],
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/entry_time/);
  });

  it('rejects month 13 (invalid month)', async () => {
    const res = await POST(makeRequest({
      trades: [{ ...VALID_TRADE, entry_time: '2026-13-01T14:00:00' }],
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/entry_time/);
  });

  it('rejects Apr 31 (April has only 30 days)', async () => {
    const res = await POST(makeRequest({
      trades: [{ ...VALID_TRADE, entry_time: '2026-04-31T14:00:00' }],
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/entry_time/);
  });

  it('rejects Feb 29 in non-leap year 2026', async () => {
    const res = await POST(makeRequest({
      trades: [{ ...VALID_TRADE, entry_time: '2026-02-29T14:00:00' }],
    }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/entry_time/);
  });

  it('accepts Feb 28 in non-leap year 2026', async () => {
    const res = await POST(makeRequest({
      trades: [{ ...VALID_TRADE, entry_time: '2026-02-28T14:00:00', date: '2026-02-28' }],
    }) as never);
    expect(res.status).toBe(200);
  });
});

// ─── Happy path ───────────────────────────────────────────────────────────────

describe('POST /api/trade-groups/batch — happy path', () => {
  it('returns success with server-generated group_id', async () => {
    const res = await POST(makeRequest({ trades: [VALID_TRADE] }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.group_id).toMatch(/^MANUAL_MNQ_2026-04-28_[a-f0-9]{32}$/);
    expect(Array.isArray(body.ids)).toBe(true);
    expect(body.ids).toHaveLength(1);
  });

  it('ignores client-supplied shared_group_id and generates server id', async () => {
    const res = await POST(makeRequest({
      trades: [VALID_TRADE],
      shared_group_id: 'CLIENT_SUPPLIED_ID',
    }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.group_id).not.toBe('CLIENT_SUPPLIED_ID');
    expect(body.group_id).toMatch(/^MANUAL_MNQ_/);
  });

  it('accepts null exit_price (open position)', async () => {
    const openTrade = { ...VALID_TRADE, exit_price: null, exit_time: null };
    const res = await POST(makeRequest({ trades: [openTrade] }) as never);
    expect(res.status).toBe(200);
  });
});
