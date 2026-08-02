/**
 * Server-only: from DB broker_fees Table query fee
 * replace PRODUCTS[symbol].fees[brokerName] static query
 * can only be server components, API routes, server actions mid call
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
