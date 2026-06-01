import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { getTradeGroupWithLegs } from '@/lib/actions/trade-groups';
import { db } from '@/lib/db';
import { trades, trade_groups } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { rebuildTradeGroup } from '@/lib/actions/trade-group-sync';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await verifyRequest(req);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }

  const { id } = await params;
  const result = await getTradeGroupWithLegs(id);
  if (!result) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: '無寫入權限' }, { status: 403 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }

  const { id } = await params;

  let statusCode = 200;

  try {
    db.transaction((tx) => {
      // Check both namespaces for the id
      const groupRows = tx.select({ id: trade_groups.id })
        .from(trade_groups)
        .where(eq(trade_groups.id, id))
        .limit(1)
        .all();

      const standaloneRows = tx.select({ id: trades.id })
        .from(trades)
        .where(and(eq(trades.id, id), isNull(trades.trade_group_id)))
        .limit(1)
        .all();

      // Ambiguous: id matches both a trade_group AND a standalone trade
      if (groupRows.length > 0 && standaloneRows.length > 0) {
        statusCode = 409;
        throw new Error('AMBIGUOUS_ID');
      }

      if (groupRows.length > 0) {
        // Has a trade_group row — delete all trades sharing this group id
        const tradeResult = tx.delete(trades).where(eq(trades.trade_group_id, id)).run();
        const groupResult = tx.delete(trade_groups).where(eq(trade_groups.id, id)).run();
        if ((tradeResult.changes ?? 0) === 0 && (groupResult.changes ?? 0) === 0) {
          statusCode = 404;
          throw new Error('NOT_FOUND');
        }
      } else {
        // Standalone trade (manual NULL group, groupKey = trade.id)
        const result = tx.delete(trades)
          .where(and(eq(trades.id, id), isNull(trades.trade_group_id)))
          .run();
        if ((result.changes ?? 0) === 0) {
          statusCode = 404;
          throw new Error('NOT_FOUND');
        }
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'AMBIGUOUS_ID') {
      return NextResponse.json({ error: 'ambiguous_id' }, { status: 409 });
    }
    if (msg === 'NOT_FOUND') {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: statusCode || 500 });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') return NextResponse.json({ error: '無寫入權限' }, { status: 403 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }

  const { id } = await params;

  let body: { strategy?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '無效的 JSON body' }, { status: 400 });
  }

  // 必須至少提供其中一個 key（用 'in' 判斷是否出現，而非看值是否 truthy）
  const hasStrategy = 'strategy' in body;
  const hasNotes = 'notes' in body;
  if (!hasStrategy && !hasNotes) {
    return NextResponse.json({ error: '需提供 strategy 或 notes' }, { status: 400 });
  }

  // 驗證 strategy 欄位（若有提供）
  let strategy: string | null | undefined;
  if (hasStrategy) {
    const rawStrategy = body.strategy;
    if (rawStrategy !== undefined && rawStrategy !== null && typeof rawStrategy !== 'string') {
      return NextResponse.json({ error: 'strategy 必須是字串或 null' }, { status: 400 });
    }
    if (typeof rawStrategy === 'string' && rawStrategy.length > 100) {
      return NextResponse.json({ error: 'strategy 長度上限 100 字元' }, { status: 400 });
    }
    // 空字串正規化為 null
    strategy =
      typeof rawStrategy === 'string' && rawStrategy.trim() !== ''
        ? rawStrategy.trim()
        : null;
  }

  // 驗證 notes 欄位（若有提供）
  let notes: string | null | undefined;
  if (hasNotes) {
    const rawNotes = body.notes;
    if (rawNotes !== undefined && rawNotes !== null && typeof rawNotes !== 'string') {
      return NextResponse.json({ error: 'notes 必須是字串或 null' }, { status: 400 });
    }
    if (typeof rawNotes === 'string' && rawNotes.length > 2000) {
      return NextResponse.json({ error: 'notes 長度上限 2000 字元' }, { status: 400 });
    }
    // 空字串正規化為 null
    notes =
      typeof rawNotes === 'string' && rawNotes.trim() !== ''
        ? rawNotes.trim()
        : null;
  }

  // 動態組 setObj：只更新 body 中實際出現的 key，避免覆蓋未提供的欄位
  const buildSetObj = (now: string) => {
    const setObj: Record<string, unknown> = { updated_at: now };
    if (hasStrategy) setObj.strategy = strategy;
    if (hasNotes) setObj.notes = notes;
    return setObj;
  };

  try {
    let found = false;

    db.transaction((tx) => {
      const now = new Date().toISOString();
      const setObj = buildSetObj(now);

      // 嘗試直接更新 trade_groups
      const updateResult = tx
        .update(trade_groups)
        .set(setObj)
        .where(eq(trade_groups.id, id))
        .run();

      if ((updateResult.changes ?? 0) > 0) {
        found = true;
        return;
      }

      // group row 不存在（舊資料）— 先 rebuild 建立，再 UPDATE（同一份 setObj）
      rebuildTradeGroup(tx, id);

      const retryResult = tx
        .update(trade_groups)
        .set(setObj)
        .where(eq(trade_groups.id, id))
        .run();

      if ((retryResult.changes ?? 0) > 0) {
        found = true;
      }
      // 若仍 0 rows 表示此 id 根本無對應 trades，found 維持 false
    });

    if (!found) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
