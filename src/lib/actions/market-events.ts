import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api-client';
import type { MarketEvent } from '@/types';

export async function getMarketEvents(startDate: string, endDate: string): Promise<MarketEvent[]> {
  return apiGet<MarketEvent[]>(`/api/market-events?start=${startDate}&end=${endDate}`);
}

export async function createMarketEvent(data: Omit<MarketEvent, 'id' | 'created_by' | 'created_at' | 'updated_at'>) {
  return apiPost<{ success: boolean; id: string }>('/api/market-events', data);
}

export async function updateMarketEvent(id: string, data: Partial<MarketEvent>) {
  return apiPut<{ success: boolean }>(`/api/market-events/${id}`, data);
}

export async function deleteMarketEvent(id: string) {
  return apiDelete<{ success: boolean }>(`/api/market-events/${id}`);
}
