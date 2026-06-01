'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loading } from '@/components/ui/loading';
import { useAuth } from '@/contexts/AuthContext';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { loading, isAllowedUser } = useAuth();
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (!loading && !isAllowedUser && !isLoginPage) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isAllowedUser, isLoginPage, loading, pathname, router]);

  if (isLoginPage) return <>{children}</>;

  if (loading || !isAllowedUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading />
      </div>
    );
  }

  return <>{children}</>;
}
