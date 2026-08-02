/**
 * products.ts
 *
 * Unified entrance for product settings.
 *
 * - Server side (actions / API routes): Use instead src/lib/actions/products.ts
 * - Client side:
 *   - getProductConfig() remain in sync, Use local fallback cache,
 *     let trade-form wait client component exist priceStep / pointValue Not required when taking the value await
 *   - Please use dynamic product list instead /api/products (SWR/fetch)
 */

// ─── Types ───────────────────────────────────────────────────

/** @deprecated fees Field moved to broker_fees surface, This field only retains type compatibility */
export interface ProductConfig {
  symbol: string;
  name: string;
  nameZh: string;
  tickSize: number;
  pointValue: number;
  priceStep: number;
  ownerOnly: boolean;
}

// ─── Client-side fallback cache ───────────────────────────────
// this map as getProductConfig() synchronization fallback,
// when /api/products You can pass the updateProductCache() renew

const _cache = new Map<string, ProductConfig>([
  ['MNQ', { symbol: 'MNQ', name: 'Micro E-mini NASDAQ', nameZh: 'Miniature Nasdaq', tickSize: 0.25, pointValue: 2, priceStep: 0.25, ownerOnly: false }],
  ['NQ',  { symbol: 'NQ',  name: 'E-mini NASDAQ',        nameZh: 'Nasdaq',     tickSize: 0.25, pointValue: 20, priceStep: 0.25, ownerOnly: false }],
  ['SIL', { symbol: 'SIL', name: 'Micro Silver',          nameZh: 'Microsilver',       tickSize: 0.5,  pointValue: 10, priceStep: 0.5,  ownerOnly: true  }],
]);

/**
 * renew client-side cache (exist /api/products Call after postback)
 * for trade-form or other client component Inject the latest information
 */
export function updateProductCache(rows: Array<{
  symbol: string; name: string; name_zh: string;
  tick_size: number; point_value: number; price_step: number;
  owner_only: boolean;
}>) {
  for (const r of rows) {
    _cache.set(r.symbol, {
      symbol: r.symbol,
      name: r.name,
      nameZh: r.name_zh,
      tickSize: r.tick_size,
      pointValue: r.point_value,
      priceStep: r.price_step,
      ownerOnly: r.owner_only,
    });
  }
}

// ─── Sync helpers (client component use)────────────────────

/** Get product configuration synchronously, Return when not found MNQ fallback */
export function getProductConfig(symbol: string): ProductConfig {
  return _cache.get(symbol) ?? _cache.get('MNQ')!;
}

/** Get all synchronously symbol (cache version, client component use) */
export function getAllSymbolsCached(): string[] {
  return Array.from(_cache.keys());
}

/** Get synchronously viewer symbol (cache version, exclude ownerOnly) */
export function getViewerSymbolsCached(): string[] {
  return Array.from(_cache.values()).filter(p => !p.ownerOnly).map(p => p.symbol);
}

// ─── NOTE ─────────────────────────────────────────────────────
// Async / server-side helpers (getAllSymbols, listProducts, etc.)
// Please direct import from '@/lib/actions/products' (server component / API route dedicated)
// This file only contains client-safe sync tool, No import server-only modules.
