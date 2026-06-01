'use client';

import { Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AccessDenied } from '@/components/access-denied';
import { StrategyPerformanceInner } from './inner';

export default function StrategyPerformancePage() {
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
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <span className="text-muted-foreground">載入中...</span>
      </div>
    }>
      <StrategyPerformanceInner />
    </Suspense>
  );
}
