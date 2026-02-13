'use client';

import {
  Github,
  MessageSquare,
  CreditCard,
  Gamepad2,
  type LucideIcon,
} from 'lucide-react';

interface ConnectorCardProps {
  name: string;
  status: 'connected' | 'needs_reauth' | 'not_connected';
  authCommand: string;
}

const CONNECTOR_ICONS: Record<string, LucideIcon> = {
  github: Github,
  slack: MessageSquare,
  stripe: CreditCard,
  discord: Gamepad2,
};

const DISPLAY_NAMES: Record<string, string> = {
  github: 'GitHub',
  slack: 'Slack',
  stripe: 'Stripe',
  discord: 'Discord',
};

const STATUS_CONFIG = {
  connected: {
    label: 'Connected',
    dotColor: 'bg-emerald-400',
    badgeBg: 'bg-emerald-400/10',
    badgeText: 'text-emerald-400',
  },
  needs_reauth: {
    label: 'Needs Re-auth',
    dotColor: 'bg-amber-400',
    badgeBg: 'bg-amber-400/10',
    badgeText: 'text-amber-400',
  },
  not_connected: {
    label: 'Not Connected',
    dotColor: 'bg-zinc-500',
    badgeBg: 'bg-zinc-500/10',
    badgeText: 'text-zinc-500',
  },
} as const;

export function ConnectorCard({ name, status, authCommand }: ConnectorCardProps) {
  const Icon = CONNECTOR_ICONS[name] ?? Gamepad2;
  const displayName = DISPLAY_NAMES[name] ?? name;
  const config = STATUS_CONFIG[status];
  const isActionable = status !== 'connected';

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5 transition-colors hover:bg-zinc-800/50">
      {/* Header: icon + name */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-zinc-800">
          <Icon className="h-5 w-5 text-zinc-300" />
        </div>
        <h3 className="text-lg font-semibold text-white">{displayName}</h3>
      </div>

      {/* Status badge */}
      <div className="mt-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.badgeBg} ${config.badgeText}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${config.dotColor}`} />
          {config.label}
        </span>
      </div>

      {/* CLI auth command */}
      <div className="mt-4">
        {isActionable ? (
          <div className="rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2">
            <p className="mb-1 text-xs font-medium text-zinc-400">
              Connect via CLI:
            </p>
            <code className="text-sm font-mono text-blue-400">{authCommand}</code>
          </div>
        ) : (
          <p className="text-xs font-mono text-zinc-500">{authCommand}</p>
        )}
      </div>
    </div>
  );
}
