'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getAdminToken } from '@/lib/auth';
import { useDemo } from '@/lib/demo-context';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isDemo } = useDemo();
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    const token = getAdminToken();
    if (!token) {
      router.replace('/login');
    } else {
      setIsAuthed(true);
    }
  }, [router, isDemo]);

  if (isDemo) return <>{children}</>;

  if (!isAuthed) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" />
      </div>
    );
  }

  return <>{children}</>;
}
