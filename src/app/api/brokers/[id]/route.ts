import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { brokers, broker_fees, trades } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// PATCH /api/brokers/[id] — 更新券商（含 fees）
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: '無寫入權限' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const now = new Date().toISOString();

    // 確認券商存在
    const [existing] = await db.select().from(brokers).where(eq(brokers.id, id));
    if (!existing) {
      return NextResponse.json({ error: '找不到券商' }, { status: 404 });
    }

    // 更新券商基本資料
    const updateData: Record<string, unknown> = { updated_at: now };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;

    try {
      await db.update(brokers).set(updateData).where(eq(brokers.id, id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return NextResponse.json({ error: '券商名稱已存在' }, { status: 409 });
      }
      throw err;
    }

    // 更新 fees（若有提供）
    if (body.fees && typeof body.fees === 'object') {
      for (const [symbol, fee] of Object.entries(body.fees)) {
        if (typeof fee !== 'number') continue;
        if (fee < 0) {
          // 負值視為刪除該筆
          await db
            .delete(broker_fees)
            .where(and(eq(broker_fees.broker_id, id), eq(broker_fees.symbol, symbol)));
        } else {
          // upsert：先刪後插
          await db
            .delete(broker_fees)
            .where(and(eq(broker_fees.broker_id, id), eq(broker_fees.symbol, symbol)));
          await db.insert(broker_fees).values({
            broker_id: id,
            symbol,
            fee_per_contract: fee,
            created_at: now,
            updated_at: now,
          });
        }
      }
    }

    const [updated] = await db.select().from(brokers).where(eq(brokers.id, id));
    const feeRows = await db
      .select()
      .from(broker_fees)
      .where(eq(broker_fees.broker_id, id));
    const feesMap: Record<string, number> = {};
    for (const f of feeRows) feesMap[f.symbol] = f.fee_per_contract;

    return NextResponse.json({ ...updated, fees: feesMap });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === '無寫入權限') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === '未登入' || msg === '無權限') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/brokers/[id] — 刪除券商（若有 trades 指向此券商 name 則阻擋）
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: '無寫入權限' }, { status: 403 });
    }

    const { id } = await params;

    // 確認券商存在
    const [existing] = await db.select().from(brokers).where(eq(brokers.id, id));
    if (!existing) {
      return NextResponse.json({ error: '找不到券商' }, { status: 404 });
    }

    // 檢查是否有 trades 使用此券商 name
    const usedTrades = await db
      .select({ id: trades.id })
      .from(trades)
      .where(eq(trades.broker, existing.name))
      .limit(1);

    if (usedTrades.length > 0) {
      return NextResponse.json(
        { error: `無法刪除：已有交易紀錄使用券商「${existing.name}」，請先修改相關交易` },
        { status: 409 }
      );
    }

    // 刪除 fees 再刪 broker
    await db.delete(broker_fees).where(eq(broker_fees.broker_id, id));
    await db.delete(brokers).where(eq(brokers.id, id));

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === '無寫入權限') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === '未登入' || msg === '無權限') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
