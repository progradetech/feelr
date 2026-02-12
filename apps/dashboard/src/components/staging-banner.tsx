'use client';

import { AlertTriangle } from 'lucide-react';
import { GATEWAY_URL } from '@/config';

export function StagingBanner() {
  const isStaging = GATEWAY_URL.includes('staging');
  if (!isStaging) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-900/40 border-b border-amber-800/50 px-4 py-2">
      <AlertTriangle className="h-4 w-4 text-amber-400" />
      <span className="text-sm text-amber-200">
        You are on staging
      </span>
    </div>
  );
}
