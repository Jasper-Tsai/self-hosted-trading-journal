/**
 * Server-only: 從 DB broker_fees 表查詢手續費
 * 取代 PRODUCTS[symbol].fees[brokerName] 的靜態查詢
 * 只能在 server components、API routes、server actions 中呼叫
 */
import { db } from '@/lib/db';
import { brokers, broker_fees } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function getFeeForBroker(brokerName: string, symbol: string): Promise<number | null> {
  try {
    const [broker] = await db
      .select({ id: brokers.id })
      .from(brokers)
      .where(eq(brokers.name, brokerName))
      .limit(1);

    if (!broker) return null;

    const [fee] = await db
      .select({ fee_per_contract: broker_fees.fee_per_contract })
      .from(broker_fees)
      .where(and(
        eq(broker_fees.broker_id, broker.id),
        eq(broker_fees.symbol, symbol)
      ))
      .limit(1);

    return fee?.fee_per_contract ?? null;
  } catch {
    return null;
  }
}
