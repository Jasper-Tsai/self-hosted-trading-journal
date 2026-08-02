export const STRATEGY_COLOR_PALETTE = [
  '#5E6AD2', // indigo (STAR default)
  '#10B981', // green (PO3 default)
  '#F59E0B', // amber (night star preset)
  '#EF4444', // red
  '#EC4899', // pink
  '#8B5CF6', // purple
  '#06B6D4', // green
  '#F97316', // Orange
] as const;

export type StrategyColor = typeof STRATEGY_COLOR_PALETTE[number];
