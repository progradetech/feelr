'use client';

import { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

interface KeyRevealProps {
  fullKey: string;
  onDismiss: () => void;
}

export function KeyReveal({ fullKey, onDismiss }: KeyRevealProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullKey);
      setCopied(true);
      toast.success('API key copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }

  return (
    <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-5">
      {/* Warning header */}
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-300">
            Make sure to copy your API key now. You won't be able to see it
            again.
          </p>
        </div>
      </div>

      {/* Key display */}
      <div className="mt-4 flex items-center gap-2">
        <div className="flex-1 overflow-x-auto rounded-md bg-zinc-900 px-4 py-3">
          <code className="font-mono text-sm text-emerald-400 select-all">
            {fullKey}
          </code>
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 rounded-md border border-zinc-700 bg-zinc-800 p-2.5 text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Dismiss button */}
      <div className="mt-4 flex justify-end">
        <button
          onClick={onDismiss}
          className="rounded-md px-4 py-2 text-sm font-medium text-amber-400 transition-colors hover:bg-amber-950/50 hover:text-amber-300"
        >
          I've copied my key
        </button>
      </div>
    </div>
  );
}
