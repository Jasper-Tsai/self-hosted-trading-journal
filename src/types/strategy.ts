export interface Strategy {
  id: number;
  name: string;
  enabled: boolean;
  sort_order: number;
  color: string;
  is_default: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}
