'use client';

import { DemoProvider } from '@/lib/demo-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return <DemoProvider>{children}</DemoProvider>;
}
