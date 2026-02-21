'use client';

import { AlertTriangle } from 'lucide-react';

interface UpgradePromptProps {
  percentage: number;
  onUpgrade: () => void;
}

export function UpgradePrompt({ percentage, onUpgrade }: UpgradePromptProps) {
  if (percentage < 80) {
    return null;
  }

  const isCritical = percentage >= 90;

  const borderColor = isCritical ? 'border-red-800/50' : 'border-amber-800/50';
  const bgColor = isCritical ? 'bg-red-900/20' : 'bg-amber-900/20';
  const textColor = isCritical ? 'text-red-300' : 'text-amber-300';
  const iconColor = isCritical ? 'text-red-400' : 'text-amber-400';
  const message = isCritical
    ? 'Nearing quota limit'
    : 'Approaching quota limit -- consider upgrading';

  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-4 ${borderColor} ${bgColor}`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className={`h-4 w-4 ${iconColor}`} />
        <p className={`text-sm ${textColor}`}>{message}</p>
      </div>
      <button
        type="button"
        onClick={onUpgrade}
        className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700"
      >
        Upgrade
      </button>
    </div>
  );
}
