'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/auth';
import { useDemo } from '@/lib/demo-context';

export function LandingRedirect() {
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
    }
  }, [router, isDemo]);

  return null;
}
