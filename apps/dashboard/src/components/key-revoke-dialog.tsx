'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { gatewayMutate } from '@/lib/api';
import { useDemo } from '@/lib/demo-context';

interface KeyRevokeDialogProps {
  keyLabel: string | null;
  shortToken: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function KeyRevokeDialog({
  keyLabel,
  shortToken,
  open,
  onOpenChange,
  onConfirm,
}: KeyRevokeDialogProps) {
  const [confirmInput, setConfirmInput] = useState('');
  const [isRevoking, setIsRevoking] = useState(false);
  const { isDemo } = useDemo();

  const confirmText = keyLabel || shortToken;
  const isConfirmed = confirmInput === confirmText;

  // Reset input text when dialog closes
  useEffect(() => {
    if (!open) {
      setConfirmInput('');
    }
  }, [open]);

  async function handleRevoke() {
    if (!isConfirmed) return;

    if (isDemo) {
      toast.success('Demo: API key revoked successfully');
      onConfirm();
      return;
    }

    setIsRevoking(true);

    try {
      await gatewayMutate(`/admin/keys/${shortToken}`, 'DELETE');
      toast.success('API key revoked successfully');
      onConfirm();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to revoke API key',
      );
    } finally {
      setIsRevoking(false);
    }
  }

  function handleClose() {
    if (!isRevoking) {
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
        {/* Warning icon and title */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-950/50">
            <AlertTriangle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Revoke API Key
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              This action cannot be undone. This will permanently revoke the API
              key and any applications using it will lose access.
            </p>
          </div>
        </div>

        {/* Confirmation input */}
        <div className="mt-5">
          <p className="text-sm text-zinc-300">
            To confirm, type{' '}
            <span className="font-semibold text-zinc-100">{confirmText}</span>{' '}
            below.
          </p>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            disabled={isRevoking}
            placeholder={confirmText}
            className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-red-700 focus:outline-none focus:ring-1 focus:ring-red-700 disabled:opacity-50"
            autoFocus
          />
        </div>

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isRevoking}
            className="rounded-md px-4 py-2 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={!isConfirmed || isRevoking}
            className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRevoking ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-red-300 border-t-red-600" />
                Revoking...
              </>
            ) : (
              'Revoke Key'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
