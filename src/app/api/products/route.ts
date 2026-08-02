import { NextRequest, NextResponse } from 'next/server';
import { verifyRequest } from '@/lib/api-auth';
import { listAllProducts, listProducts, createProduct } from '@/lib/actions/products';

// GET /api/products
// ?all=1 Return all (Including deactivation + ownerOnly), for owner For management page
// Return without parameters enabled=true, viewer filter ownerOnly
export async function GET(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    const showAll = req.nextUrl.searchParams.get('all') === '1' && role === 'owner';

    if (showAll) {
      const rows = await listAllProducts();
      return NextResponse.json(rows);
    }

    // viewer filter ownerOnly;owner Can see all enabled
    const rows = await listProducts({
      ownerOnly: role === 'owner' ? undefined : false,
    });
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 401 });
  }
}

// POST /api/products — Add new product (owner only)
export async function POST(req: NextRequest) {
  try {
    const { role } = await verifyRequest(req);
    if (role !== 'owner') {
      return NextResponse.json({ error: 'No write permission' }, { status: 403 });
    }

    const body = await req.json();
    const { symbol, name, name_zh, tick_size, point_value, price_step, owner_only, enabled, sort_order } = body;

    if (!symbol || typeof symbol !== 'string' || symbol.trim() === '') {
      return NextResponse.json({ error: 'Product code cannot be empty' }, { status: 400 });
    }
    if (!name || !name_zh) {
      return NextResponse.json({ error: 'Product name cannot be empty' }, { status: 400 });
    }
    if (typeof tick_size !== 'number' || typeof point_value !== 'number' || typeof price_step !== 'number') {
      return NextResponse.json({ error: 'tick_size / point_value / price_step Must be a number' }, { status: 400 });
    }

    const result = await createProduct({ symbol, name, name_zh, tick_size, point_value, price_step, owner_only, enabled, sort_order });
    if (!result.success) {
      const status = result.error?.includes('Already exists') ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'No write permission') return NextResponse.json({ error: msg }, { status: 403 });
    if (msg === 'Not logged in' || msg === 'No permission') return NextResponse.json({ error: msg }, { status: 401 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
