'use client';

import { AuthGuard } from '@/components/auth-guard';
import { DemoBanner } from '@/components/demo-banner';
import { Sidebar } from '@/components/sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-screen flex-col">
        <DemoBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
