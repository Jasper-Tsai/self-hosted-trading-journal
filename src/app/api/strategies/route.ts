import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { strategies } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const enabledParam = req.nextUrl.searchParams.get('enabled');

    if (enabledParam === '1') {
      const rows = await db
        .select()
        .from(strategies)
        .where(eq(strategies.enabled, true))
        .orderBy(asc(strategies.sort_order));
      return NextResponse.json(rows);
    }

    const rows = await db.select().from(strategies).orderBy(asc(strategies.sort_order));
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: '無寫入權限' }, { status: 403 });
    }

    const body = await req.json();
    const { name, color, sort_order, is_default } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: '策略名稱不得為空' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 若設為 default，先清掉其他筆的 is_default
    if (is_default) {
      await db
        .update(strategies)
        .set({ is_default: false, updated_at: now })
        .where(eq(strategies.is_default, true));
    }

    try {
      const [inserted] = await db
        .insert(strategies)
        .values({
          name: name.trim(),
          color: color ?? '#5E6AD2',
          sort_order: sort_order ?? 0,
          is_default: is_default ?? false,
          enabled: true,
          created_at: now,
          updated_at: now,
        })
        .returning();

      return NextResponse.json(inserted, { status: 201 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return NextResponse.json({ error: '策略名稱已存在' }, { status: 409 });
      }
      throw err;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === '無寫入權限') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === '未登入' || msg === '無權限') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
