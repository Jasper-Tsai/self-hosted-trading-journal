/**
 * Server actions for products (DB-driven CRUD)
 * replace original src/lib/products.ts of static PRODUCTS constant
 * can only be server components, API routes, server actions mid call
 */
import { db } from '@/lib/db';
import { products, trades, broker_fees } from '@/lib/db/schema';
import { eq, asc, and } from 'drizzle-orm';

// ─── Types ───────────────────────────────────────────────────

export interface ProductRow {
  symbol: string;
  name: string;
  name_zh: string;
  tick_size: number;
  point_value: number;
  price_step: number;
  owner_only: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface CreateProductInput {
  symbol: string;
  name: string;
  name_zh: string;
  tick_size: number;
  point_value: number;
  price_step: number;
  owner_only?: boolean;
  enabled?: boolean;
  sort_order?: number;
}

export interface UpdateProductInput {
  name?: string;
  name_zh?: string;
  tick_size?: number;
  point_value?: number;
  price_step?: number;
  owner_only?: boolean;
  enabled?: boolean;
  sort_order?: number;
}

// ─── Fallback (DB When empty)────────────────────────────────────

const FALLBACK_SYMBOLS = ['MNQ', 'NQ', 'SIL'];

const FALLBACK_PRODUCTS: ProductRow[] = [
  { symbol: 'MNQ', name: 'Micro E-mini NASDAQ', name_zh: 'Miniature Nasdaq', tick_size: 0.25, point_value: 2, price_step: 0.25, owner_only: false, enabled: true, sort_order: 1, created_at: null, updated_at: null },
  { symbol: 'NQ', name: 'E-mini NASDAQ', name_zh: 'Nasdaq', tick_size: 0.25, point_value: 20, price_step: 0.25, owner_only: false, enabled: true, sort_order: 2, created_at: null, updated_at: null },
  { symbol: 'SIL', name: 'Micro Silver', name_zh: 'Microsilver', tick_size: 0.5, point_value: 10, price_step: 0.5, owner_only: true, enabled: true, sort_order: 3, created_at: null, updated_at: null },
];

// ─── Read ────────────────────────────────────────────────────

/** Get all products (owner use)or filter ownerOnly (viewer use)*/
export async function listProducts({ ownerOnly }: { ownerOnly?: boolean } = {}): Promise<ProductRow[]> {
  try {
    const rows = await db
      .select()
      .from(products)
      .where(
        ownerOnly === false
          ? and(eq(products.enabled, true), eq(products.owner_only, false))
          : eq(products.enabled, true)
      )
      .orderBy(asc(products.sort_order));
    if (rows.length === 0) return FALLBACK_PRODUCTS.filter(p => ownerOnly === false ? !p.owner_only : true);
    return rows;
  } catch {
    return FALLBACK_PRODUCTS.filter(p => ownerOnly === false ? !p.owner_only : true);
  }
}

/** Get all products (Including deactivation), owner For management page */
export async function listAllProducts(): Promise<ProductRow[]> {
  try {
    const rows = await db
      .select()
      .from(products)
      .orderBy(asc(products.sort_order));
    if (rows.length === 0) return FALLBACK_PRODUCTS;
    return rows;
  } catch {
    return FALLBACK_PRODUCTS;
  }
}

export async function getProductBySymbol(symbol: string): Promise<ProductRow | null> {
  try {
    const [row] = await db
      .select()
      .from(products)
      .where(eq(products.symbol, symbol))
      .limit(1);
    return row ?? null;
  } catch {
    return FALLBACK_PRODUCTS.find(p => p.symbol === symbol) ?? null;
  }
}

/** Get all products symbol Checklist (owner use)*/
export async function getAllSymbols(): Promise<string[]> {
  try {
    const rows = await db
      .select({ symbol: products.symbol })
      .from(products)
      .where(eq(products.enabled, true))
      .orderBy(asc(products.sort_order));
    if (rows.length === 0) return FALLBACK_SYMBOLS;
    return rows.map(r => r.symbol);
  } catch {
    return FALLBACK_SYMBOLS;
  }
}

/** obtain Viewer visible symbol Checklist (exclude ownerOnly)*/
export async function getViewerSymbols(): Promise<string[]> {
  try {
    const rows = await db
      .select({ symbol: products.symbol })
      .from(products)
      .where(and(eq(products.enabled, true), eq(products.owner_only, false)))
      .orderBy(asc(products.sort_order));
    if (rows.length === 0) return FALLBACK_SYMBOLS.filter(s => s !== 'SIL');
    return rows.map(r => r.symbol);
  } catch {
    return FALLBACK_SYMBOLS.filter(s => s !== 'SIL');
  }
}

/** Check if the product is Owner dedicated */
export async function isOwnerOnlySymbol(symbol: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ owner_only: products.owner_only })
      .from(products)
      .where(eq(products.symbol, symbol))
      .limit(1);
    if (!row) return false;
    return row.owner_only;
  } catch {
    return FALLBACK_PRODUCTS.find(p => p.symbol === symbol)?.owner_only ?? false;
  }
}

// ─── Write ───────────────────────────────────────────────────

export async function createProduct(
  input: CreateProductInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    await db.insert(products).values({
      symbol: input.symbol.trim().toUpperCase(),
      name: input.name.trim(),
      name_zh: input.name_zh.trim(),
      tick_size: input.tick_size,
      point_value: input.point_value,
      price_step: input.price_step,
      owner_only: input.owner_only ?? false,
      enabled: input.enabled ?? true,
      sort_order: input.sort_order ?? 0,
      created_at: now,
      updated_at: now,
    });
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      return { success: false, error: 'Product code already exists' };
    }
    return { success: false, error: msg };
  }
}

export async function updateProduct(
  symbol: string,
  input: UpdateProductInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = { updated_at: now };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.name_zh !== undefined) updateData.name_zh = input.name_zh;
    if (input.tick_size !== undefined) updateData.tick_size = input.tick_size;
    if (input.point_value !== undefined) updateData.point_value = input.point_value;
    if (input.price_step !== undefined) updateData.price_step = input.price_step;
    if (input.owner_only !== undefined) updateData.owner_only = input.owner_only;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;

    await db.update(products).set(updateData).where(eq(products.symbol, symbol));
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Delete product
 * If so trades.symbol or broker_fees.symbol point to it, block deletion
 */
export async function deleteProduct(
  symbol: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // examine trades
    const usedTrades = await db
      .select({ id: trades.id })
      .from(trades)
      .where(eq(trades.symbol, symbol))
      .limit(1);
    if (usedTrades.length > 0) {
      return { success: false, error: `cannot be deleted: There is already a trade for using the product${symbol}` };
    }

    // examine broker_fees
    const usedFees = await db
      .select({ id: broker_fees.id })
      .from(broker_fees)
      .where(eq(broker_fees.symbol, symbol))
      .limit(1);
    if (usedFees.length > 0) {
      return { success: false, error: `cannot be deleted: There is already a brokerage fee set to use the product${symbol}, Please delete related rate settings first` };
    }

    await db.delete(products).where(eq(products.symbol, symbol));
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
