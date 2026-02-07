'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { gatewayMutate } from '@/lib/api';

interface KeyCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (fullKey: string) => void;
}

interface CreateKeyResponse {
  key: string;
  short_token: string;
  label: string | null;
  created_at: string;
}

export function KeyCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: KeyCreateDialogProps) {
  const [label, setLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsCreating(true);

    try {
      const response = await gatewayMutate<CreateKeyResponse>(
        '/admin/keys',
        'POST',
        { label: label.trim() || undefined },
      );
      onCreated(response.key);
      setLabel('');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to create API key',
      );
    } finally {
      setIsCreating(false);
    }
  }

  function handleClose() {
    if (!isCreating) {
      setLabel('');
      onOpenChange(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100">
          Create API Key
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Create a new API key for gateway access.
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="key-label"
              className="block text-sm font-medium text-zinc-300"
            >
              Label{' '}
              <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., production-agent"
              disabled={isCreating}
              className="mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isCreating}
              className="rounded-md px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              {isCreating ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-400 border-t-zinc-700" />
                  Creating...
                </>
              ) : (
                'Create Key'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
