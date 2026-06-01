'use client';

import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/access-denied';
import { StrategyManager } from '@/components/ui/strategy-manager';

export default function StrategiesPage() {
  const { isOwner, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-muted-foreground">載入中...</span>
      </div>
    );
  }

  if (!isOwner) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight bg-gradient-to-b from-white via-white/95 to-white/70 bg-clip-text text-transparent">
          策略管理
        </h1>
        <p className="text-[#8A8F98] mt-1">
          管理交易策略清單、顏色與預設策略設定
        </p>
      </div>

      <StrategyManager />
    </div>
  );
}
