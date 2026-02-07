'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { getAdminToken, setAdminToken } from '@/lib/auth';
import { GATEWAY_URL } from '@/config';

export default function LoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getAdminToken()) {
      router.replace('/overview');
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      // Validate token by making a test request to the gateway
      const res = await fetch(GATEWAY_URL + '/admin/keys', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + trimmed,
        },
      });
      const body = await res.json();

      if (!body.ok) {
        throw new Error(body.error?.message || 'Invalid admin token');
      }

      setAdminToken(trimmed);
      router.push('/overview');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to authenticate',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Feelr
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Sign in to your dashboard
          </p>
        </div>

        {/* Login card */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="admin-token"
                className="text-sm font-medium text-zinc-300"
              >
                Admin Token
              </label>
              <input
                id="admin-token"
                type="password"
                placeholder="fga_..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full rounded-md bg-white px-3 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-zinc-500">
            Get your admin token from{' '}
            <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-zinc-400">
              feelr init
            </code>{' '}
            in the CLI.
          </p>
        </div>
      </div>
    </div>
  );
}
