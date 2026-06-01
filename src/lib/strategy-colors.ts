export const STRATEGY_COLOR_PALETTE = [
  '#5E6AD2', // 靛藍（STAR 預設）
  '#10B981', // 綠（PO3 預設）
  '#F59E0B', // 琥珀（夜星預設）
  '#EF4444', // 紅
  '#EC4899', // 粉
  '#8B5CF6', // 紫
  '#06B6D4', // 青
  '#F97316', // 橘
] as const;

export type StrategyColor = typeof STRATEGY_COLOR_PALETTE[number];
