'use client';

import { useConnectors, AUTH_COMMANDS } from '@/lib/hooks/use-connectors';
import { ConnectorCard } from '@/components/connector-card';

export default function ConnectorsPage() {
  const { data: connectors, error, isLoading } = useConnectors();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Connected Services</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Manage your connector integrations. Use the CLI to authenticate each service.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-800 bg-red-900/20 px-4 py-3">
          <p className="text-sm text-red-400">
            Failed to load connectors: {error.message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900"
              />
            ))
          : connectors?.map((connector) => (
              <ConnectorCard
                key={connector.name}
                name={connector.name}
                status={connector.status}
                authCommand={AUTH_COMMANDS[connector.name] ?? `feelr auth ${connector.name}`}
              />
            ))}
      </div>
    </div>
  );
}
