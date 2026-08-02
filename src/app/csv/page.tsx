'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// CSV Admin functionality temporarily disabled, Automatically redirect back to home page
export default function CsvPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-muted-foreground">Redirecting...</p>
      </div>
    </div>
  );
}