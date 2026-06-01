/**
 * products.ts
 *
 * 商品設定的統一入口。
 *
 * - Server side (actions / API routes)：改用 src/lib/actions/products.ts
 * - Client side：
 *   - getProductConfig() 仍保留為同步，使用本地 fallback 快取，
 *     讓 trade-form 等 client component 在 priceStep / pointValue 取值時不需要 await
 *   - 動態商品清單請改用 /api/products（SWR/fetch）
 */

// ─── Types ───────────────────────────────────────────────────

/** @deprecated fees 欄位已移至 broker_fees 表，此欄位僅保留型別相容 */
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
// 這個 map 作為 getProductConfig() 的同步 fallback，
// 當 /api/products 回傳後可透過 updateProductCache() 更新

const _cache = new Map<string, ProductConfig>([
  ['MNQ', { symbol: 'MNQ', name: 'Micro E-mini NASDAQ', nameZh: '微型那斯達克', tickSize: 0.25, pointValue: 2, priceStep: 0.25, ownerOnly: false }],
  ['NQ',  { symbol: 'NQ',  name: 'E-mini NASDAQ',        nameZh: '那斯達克',     tickSize: 0.25, pointValue: 20, priceStep: 0.25, ownerOnly: false }],
  ['SIL', { symbol: 'SIL', name: 'Micro Silver',          nameZh: '微白銀',       tickSize: 0.5,  pointValue: 10, priceStep: 0.5,  ownerOnly: true  }],
]);

/**
 * 更新 client-side 快取（在 /api/products 回傳後呼叫）
 * 供 trade-form 或其他 client component 注入最新資料
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

// ─── Sync helpers（client component 使用）────────────────────

/** 同步取得商品配置，未找到時回傳 MNQ fallback */
export function getProductConfig(symbol: string): ProductConfig {
  return _cache.get(symbol) ?? _cache.get('MNQ')!;
}

/** 同步取得所有 symbol（快取版，client component 用） */
export function getAllSymbolsCached(): string[] {
  return Array.from(_cache.keys());
}

/** 同步取得 viewer symbol（快取版，排除 ownerOnly） */
export function getViewerSymbolsCached(): string[] {
  return Array.from(_cache.values()).filter(p => !p.ownerOnly).map(p => p.symbol);
}

// ─── NOTE ─────────────────────────────────────────────────────
// Async / server-side helpers (getAllSymbols, listProducts, etc.)
// 請直接 import from '@/lib/actions/products'（server component / API route 專用）
// 此檔案只包含 client-safe 的同步工具，不可 import server-only modules。
