import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { brokers, broker_fees } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { randomUUID } from 'crypto';

// GET /api/brokers — 回傳券商（含 fees map）
// ?all=1 時回傳全部（含停用），供 owner 管理頁用
export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const showAll = req.nextUrl.searchParams.get('all') === '1' && role === 'owner';

    const brokerRows = await db
      .select()
      .from(brokers)
      .where(showAll ? undefined : eq(brokers.enabled, true))
      .orderBy(asc(brokers.sort_order));

    const feeRows = await db.select().from(broker_fees);

    // 建立 fees map：broker_id → { symbol: fee }
    const feesMap = new Map<string, Record<string, number>>();
    for (const f of feeRows) {
      if (!feesMap.has(f.broker_id)) feesMap.set(f.broker_id, {});
      feesMap.get(f.broker_id)![f.symbol] = f.fee_per_contract;
    }

    const result = brokerRows.map(b => ({
      ...b,
      fees: feesMap.get(b.id) ?? {},
    }));

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}

// POST /api/brokers — 新增券商
export async function POST(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: '無寫入權限' }, { status: 403 });
    }

    const body = await req.json();
    const { name, enabled = true, sort_order = 0, fees = {} } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: '券商名稱不得為空' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const id = randomUUID().slice(0, 8);

    try {
      await db.insert(brokers).values({
        id,
        name: name.trim(),
        enabled,
        sort_order,
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return NextResponse.json({ error: '券商名稱已存在' }, { status: 409 });
      }
      throw err;
    }

    // 插入 fees
    for (const [symbol, fee] of Object.entries(fees)) {
      if (typeof fee === 'number' && fee >= 0) {
        await db.insert(broker_fees).values({
          broker_id: id,
          symbol,
          fee_per_contract: fee,
          created_at: now,
          updated_at: now,
        });
      }
    }

    const [inserted] = await db.select().from(brokers).where(eq(brokers.id, id));
    return NextResponse.json({ ...inserted, fees }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === '無寫入權限') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === '未登入' || msg === '無權限') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
