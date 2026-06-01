/**
 * Tests for DELETE /api/trade-groups/[id]
 *
 * Covers:
 *   - 401 when auth fails
 *   - 403 for viewer role
 *   - deletes trade_group + member trades (atomic, grouped trade)
 *   - deletes standalone trade (NULL trade_group_id, groupKey = trade.id)
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Mocks (hoisted) ──────────────────────────────────────────────────────────

const { mockVerifyRequest } = vi.hoisted(() => ({
  mockVerifyRequest: vi.fn(),
}));

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  verifyRequest: mockVerifyRequest,
}));

vi.mock('@/lib/db', () => ({
  db: { transaction: mockTransaction },
}));

vi.mock('@/lib/db/schema', () => ({
  trades: { id: 'id', trade_group_id: 'trade_group_id' },
  trade_groups: { id: 'id' },
  trade_legs: {},
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ __eq: val })),
  and: vi.fn((...args) => ({ __and: args })),
  or: vi.fn((...args) => ({ __or: args })),
  isNull: vi.fn((col) => ({ __isNull: col })),
  gte: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
}));

vi.mock('@/lib/actions/trade-groups', () => ({
  getTradeGroupWithLegs: vi.fn(),
}));

import { DELETE } from '../[id]/route';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeDeleteRequest(id: string): Request {
  return new Request(`http://localhost/api/trade-groups/${id}`, {
    method: 'DELETE',
  }) as unknown as Request;
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// Build a mock tx that tracks which tables were deleted.
// groupExists=true  → trade_groups row found, no standalone trade row (normal grouped delete)
// groupExists=false → no trade_groups row, standalone trade row found
function makeMockTx(groupExists: boolean) {
  const deleted: string[] = [];
  let selectCallCount = 0;
  // The new DELETE handler calls select() twice:
  //   1st call → trade_groups (check if group row exists)
  //   2nd call → trades WHERE id=? AND trade_group_id IS NULL (check standalone)
  const makeSelectChain = (result: unknown[]) => {
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      // sync terminators (used by the new sync route code)
      all: () => result,
      get: () => result[0],
      // legacy async terminator kept for compat
      then: (resolve: (v: unknown[]) => void) => Promise.resolve(result).then(resolve),
    };
    return chain;
  };
  const deleteResult = { changes: groupExists ? 2 : 1 };
  const makeDeleteChain = () => {
    const chain = {
      where: () => chain,
      // sync terminator
      run: () => deleteResult,
      // legacy async terminator kept for compat
      then: (resolve: (v: unknown) => void) => Promise.resolve(deleteResult).then(resolve),
    };
    return chain;
  };
  const tx = {
    select: vi.fn(() => {
      const call = ++selectCallCount;
      // 1st select = trade_groups lookup
      if (call === 1) return makeSelectChain(groupExists ? [{ id: 'g1' }] : []);
      // 2nd select = standalone trades lookup (opposite of groupExists)
      return makeSelectChain(groupExists ? [] : [{ id: 'standalone-id' }]);
    }),
    delete: vi.fn((table: unknown) => {
      deleted.push(String(table));
      return makeDeleteChain();
    }),
    _deleted: deleted,
  };
  return tx;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockVerifyRequest.mockResolvedValue({ role: 'owner', uid: 'u1' });
  mockTransaction.mockImplementation((cb: (tx: unknown) => void) => {
    const tx = makeMockTx(true);
    cb(tx);
  });
});

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe('DELETE /api/trade-groups/[id] — auth', () => {
  it('returns 401 when verifyRequest throws', async () => {
    mockVerifyRequest.mockRejectedValue(new Error('Unauthorized'));
    const res = await DELETE(makeDeleteRequest('g1') as never, makeParams('g1') as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 for viewer role', async () => {
    mockVerifyRequest.mockResolvedValue({ role: 'viewer', uid: 'u2' });
    const res = await DELETE(makeDeleteRequest('g1') as never, makeParams('g1') as never);
    expect(res.status).toBe(403);
  });
});

// ─── Delete logic tests ───────────────────────────────────────────────────────

describe('DELETE /api/trade-groups/[id] — grouped trade', () => {
  it('runs inside a transaction', async () => {
    await DELETE(makeDeleteRequest('g1') as never, makeParams('g1') as never);
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it('returns success:true when group exists', async () => {
    const res = await DELETE(makeDeleteRequest('g1') as never, makeParams('g1') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('calls db.delete on trades and trade_groups tables', async () => {
    let capturedTx: ReturnType<typeof makeMockTx> | null = null;
    mockTransaction.mockImplementation((cb: (tx: unknown) => void) => {
      const tx = makeMockTx(true);
      capturedTx = tx;
      cb(tx);
    });
    await DELETE(makeDeleteRequest('g1') as never, makeParams('g1') as never);
    expect(capturedTx!.delete).toHaveBeenCalledTimes(2); // trades + trade_groups
  });
});

describe('DELETE /api/trade-groups/[id] — standalone trade (NULL group)', () => {
  it('deletes standalone trade when no trade_group row found', async () => {
    let capturedTx: ReturnType<typeof makeMockTx> | null = null;
    mockTransaction.mockImplementation((cb: (tx: unknown) => void) => {
      const tx = makeMockTx(false); // no group row found
      capturedTx = tx;
      cb(tx);
    });
    const res = await DELETE(makeDeleteRequest('standalone-id') as never, makeParams('standalone-id') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Only one delete call (the standalone trade)
    expect(capturedTx!.delete).toHaveBeenCalledTimes(1);
  });
});
