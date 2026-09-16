import { eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { prop_firm_trades } from '@/lib/db/schema';
import { nullIfBlank, propFirmTradeSchema } from '@/lib/journal-record-contracts';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const parsed = propFirmTradeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid prop-firm trade' }, { status: 400 });
  const { id } = await params;
  const changes = { ...parsed.data, strategy: nullIfBlank(parsed.data.strategy), exit_reason: parsed.data.exit_reason ?? null, notes: nullIfBlank(parsed.data.notes), updated_at: new Date().toISOString() };
  const result = await db.update(prop_firm_trades).set(changes).where(eq(prop_firm_trades.id, id));
  return result.changes ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { await verifyRequest(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const { id } = await params;
  const result = await db.delete(prop_firm_trades).where(eq(prop_firm_trades.id, id));
  return result.changes ? NextResponse.json({ success: true }) : NextResponse.json({ error: 'Not found' }, { status: 404 });
}
