import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { direct_pnl_trades } from '@/lib/db/schema';
import { directPnlSchema, nullIfBlank } from '@/lib/journal-record-contracts';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const parsed = directPnlSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid manual P&L record' }, { status: 400 });
  const { id } = await params;
  const changes = { ...parsed.data, strategy: nullIfBlank(parsed.data.strategy), notes: nullIfBlank(parsed.data.notes), updated_at: new Date().toISOString() };
  const result = await db.update(direct_pnl_trades).set(changes).where(eq(direct_pnl_trades.id, id));
  return result.changes ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const { id } = await params;
  const result = await db.delete(direct_pnl_trades).where(eq(direct_pnl_trades.id, id));
  return result.changes ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
