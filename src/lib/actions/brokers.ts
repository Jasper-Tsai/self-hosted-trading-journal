import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api-client';

// ─── Types ───────────────────────────────────────────────────

export interface BrokerFee {
  symbol: string;
  fee_per_contract: number;
}

export interface Broker {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  fees: Record<string, number>; // symbol → fee_per_contract
  created_at?: string;
  updated_at?: string;
}

export interface CreateBrokerInput {
  name: string;
  enabled?: boolean;
  sort_order?: number;
  fees?: Record<string, number>;
}

export interface UpdateBrokerInput {
  name?: string;
  enabled?: boolean;
  sort_order?: number;
  fees?: Record<string, number>;
}

// ─── Read ────────────────────────────────────────────────────

export async function listBrokers(): Promise<Broker[]> {
  try {
    return await apiGet<Broker[]>('/api/brokers');
  } catch {
    return [];
  }
}

export async function getBrokerByName(name: string): Promise<Broker | null> {
  try {
    const brokers = await listBrokers();
    return brokers.find(b => b.name === name) ?? null;
  } catch {
    return null;
  }
}

export async function getFee(brokerName: string, symbol: string): Promise<number | null> {
  try {
    const broker = await getBrokerByName(brokerName);
    if (!broker) return null;
    return broker.fees[symbol] ?? null;
  } catch {
    return null;
  }
}

// ─── Write ───────────────────────────────────────────────────

export async function createBroker(
  input: CreateBrokerInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiPost('/api/brokers', input);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unable to add a new brokerage firm' };
  }
}

export async function updateBroker(
  id: string,
  input: UpdateBrokerInput
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiPatch(`/api/brokers/${encodeURIComponent(id)}`, input);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unable to update brokerage' };
  }
}

export async function deleteBroker(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiDelete(`/api/brokers/${encodeURIComponent(id)}`);
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unable to delete brokerage' };
  }
}
