'use client';

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useKeys } from '@/lib/hooks/use-keys';
import { KeyCreateDialog } from '@/components/key-create-dialog';
import { KeyReveal } from '@/components/key-reveal';
import { KeyRevokeDialog } from '@/components/key-revoke-dialog';
import type { ApiKey } from '@/lib/types';

export default function KeysPage() {
  const { data: keys, error, isLoading, mutate } = useKeys();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  function handleCreated(fullKey: string) {
    setRevealedKey(fullKey);
    setShowCreateDialog(false);
    mutate();
  }

  function handleRevoked() {
    setRevokeTarget(null);
    mutate();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Create and manage API keys for gateway access.
          </p>
        </div>
        <button
          onClick={() => setShowCreateDialog(true)}
          className="inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          Create Key
        </button>
      </div>

      {/* One-time key reveal */}
      {revealedKey && (
        <KeyReveal
          fullKey={revealedKey}
          onDismiss={() => setRevealedKey(null)}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg bg-zinc-800/50"
            />
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-800/50 bg-red-950/30 p-4 text-sm text-red-400">
          Failed to load API keys. Please try again.
        </div>
      )}

      {/* Empty state */}
      {keys && keys.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900/50 py-16">
          <p className="text-zinc-400">No API keys yet.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create one to get started.
          </p>
          <button
            onClick={() => setShowCreateDialog(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            Create Key
          </button>
        </div>
      )}

      {/* Key list table */}
      {keys && keys.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Token</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Last Used</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {keys.map((key) => (
                <tr
                  key={key.short_token}
                  className="transition-colors hover:bg-zinc-900/30"
                >
                  <td className="px-4 py-3">
                    {key.label ? (
                      <span className="text-sm font-medium text-zinc-200">
                        {key.label}
                      </span>
                    ) : (
                      <span className="text-sm italic text-zinc-500">
                        Unnamed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-400">
                      fk_..._{key.short_token}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-400">
                    {formatDistanceToNow(new Date(key.created_at), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {key.last_used_at ? (
                      <span className="text-zinc-400">
                        {formatDistanceToNow(new Date(key.last_used_at), {
                          addSuffix: true,
                        })}
                      </span>
                    ) : (
                      <span className="text-zinc-600">Never</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setRevokeTarget(key)}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-950/50 hover:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create dialog */}
      <KeyCreateDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleCreated}
      />

      {/* Revoke dialog */}
      {revokeTarget && (
        <KeyRevokeDialog
          keyLabel={revokeTarget.label}
          shortToken={revokeTarget.short_token}
          open={!!revokeTarget}
          onOpenChange={(open) => {
            if (!open) setRevokeTarget(null);
          }}
          onConfirm={handleRevoked}
        />
      )}
    </div>
  );
}
