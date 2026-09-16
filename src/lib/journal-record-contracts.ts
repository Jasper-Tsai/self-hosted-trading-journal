import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'invalid date');
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/);
const money = z.number().finite().min(-1_000_000).max(1_000_000).multipleOf(0.01);
const positiveMoney = z.number().finite().min(0).max(1_000_000).multipleOf(0.01);
const text = z.string().trim().max(1000).nullable().optional();

export const dateRangeSchema = z.object({ start: date, end: date }).refine(({ start, end }) => start <= end, 'invalid range');

export const directPnlSchema = z.object({
  date, symbol: z.string().trim().min(1).max(16), side: z.enum(['LONG', 'SHORT']),
  entry_time: localDateTime, exit_time: localDateTime, qty: z.number().int().min(1).max(100000),
  broker: z.string().trim().min(1).max(100), gross_pnl_usd: money, fee: positiveMoney,
  point_value_snapshot: z.number().finite().positive().max(1_000_000), strategy: text, notes: text,
}).refine(({ entry_time, exit_time }) => exit_time >= entry_time, { message: 'exit must be after entry', path: ['exit_time'] });

export const propFirmTradeSchema = z.object({
  date, phase: z.enum(['evaluation', 'funded']), symbol: z.string().trim().min(1).max(16), side: z.enum(['LONG', 'SHORT']),
  entry_time: localDateTime, exit_time: localDateTime, qty: z.number().int().min(1).max(100000),
  pnl_points: z.number().finite().min(-1_000_000).max(1_000_000), pnl_usd: money, fee: positiveMoney,
  strategy: text, exit_reason: z.enum(['TP', 'SL', 'BE', 'manual', 'time', 'other']).nullable().optional(), notes: text,
}).refine(({ entry_time, exit_time }) => exit_time >= entry_time, { message: 'exit must be after entry', path: ['exit_time'] });

export const payoutSchema = z.object({ date, amount_usd: z.number().finite().min(0.01).max(1_000_000).multipleOf(0.01), notes: text });
export const dailyReviewSchema = z.object({
  status: z.enum(['draft', 'completed']), structure: text, scenario_a: text, scenario_b: text, scenario_c: text,
  rule_followed: z.boolean().nullable(), error_tags: z.array(z.string().trim().min(1).max(80)).max(20), lesson: text, next_action: text,
});

export function nullIfBlank(value: string | null | undefined) { return value?.trim() || null; }
