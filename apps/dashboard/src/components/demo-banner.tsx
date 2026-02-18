'use client';

import { Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/lib/demo-context';

export function DemoBanner() {
  const { isDemo, exitDemo } = useDemo();
  const router = useRouter();

  if (!isDemo) return null;

  function handleExit() {
    exitDemo();
    router.push('/login');
  }

  return (
    <div className="flex items-center justify-between bg-blue-900/40 border-b border-blue-800/50 px-4 py-2">
      <div className="flex items-center gap-2">
        <Info className="h-4 w-4 text-blue-400" />
        <span className="text-sm text-blue-200">
          You are viewing the dashboard in demo mode. Data shown is simulated.
        </span>
      </div>
      <button
        onClick={handleExit}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-800/50 hover:text-blue-100"
      >
        Exit Demo
      </button>
    </div>
  );
}
