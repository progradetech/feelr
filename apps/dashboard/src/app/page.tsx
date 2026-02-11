'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/auth';
import { useDemo } from '@/lib/demo-context';

export default function RootPage() {
  const router = useRouter();
  const { isDemo } = useDemo();

  useEffect(() => {
    if (isDemo) {
      router.replace('/overview');
      return;
    }
    const token = getAdminToken();
    if (token) {
      router.replace('/overview');
    } else {
      router.replace('/login');
    }
  }, [router, isDemo]);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
    </div>
  );
}
