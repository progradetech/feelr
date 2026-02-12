import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Github,
  MessageSquare,
  CreditCard,
  Gamepad2,
} from 'lucide-react';
import { LandingRedirect } from '@/components/landing-redirect';
import { CopyButton } from '@/components/copy-button';
import { TerminalDemo } from '@/components/terminal-demo/terminal-demo';

export const metadata: Metadata = {
  title: { absolute: 'Feelr - Agent-Friendly API Simplification' },
  description:
    'One CLI, one API key, every integration. Connect GitHub, Slack, Stripe, and Discord in seconds.',
  openGraph: {
    title: 'Feelr - Agent-Friendly API Simplification',
    description:
      'One CLI, one API key, every integration. Connect GitHub, Slack, Stripe, and Discord in seconds.',
    url: 'https://app.feelr.dev',
    siteName: 'Feelr',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Feelr - Agent-Friendly API Simplification',
    description: 'One CLI, one API key, every integration.',
  },
};

const connectors = [
  {
    icon: Github,
    title: 'GitHub',
    description:
      'Issues, PRs, repos \u2014 10 actions. List, create, and manage repositories without parsing GraphQL.',
  },
  {
    icon: MessageSquare,
    title: 'Slack',
    description:
      'Messages, channels, search \u2014 6 actions. Send notifications and search conversations in one call.',
  },
  {
    icon: CreditCard,
    title: 'Stripe',
    description:
      'Payments, customers, invoices \u2014 8 actions. Manage billing without Stripe SDK complexity.',
  },
  {
    icon: Gamepad2,
    title: 'Discord',
    description:
      'Messages, channels, roles \u2014 7 actions. Moderate and manage servers programmatically.',
  },
];

const capabilities = [
  {
    title: 'Composable Chains',
    description:
      'Chain actions across connectors. GitHub issue \u2192 Slack notification \u2192 Stripe invoice, all in one command.',
  },
  {
    title: 'Agent-Optimized',
    description:
      '\u007E50 tokens of context per action. Built for Claude, GPT, and every AI agent framework.',
  },
  {
    title: 'Self-Hostable',
    description:
      'MIT licensed. Run on your own infrastructure with Docker Compose. Full feature parity.',
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-zinc-950">
      <LandingRedirect />

      {/* Hero */}
      <section className="px-4 py-16 md:px-6 md:py-24">
        <div className="mx-auto max-w-6xl text-center">
          <img
            src="/feelr-logo.svg"
            alt="Feelr"
            width={96}
            height={96}
            className="mx-auto mb-8"
          />
          <h1 className="font-heading text-4xl font-bold text-white md:text-5xl lg:text-6xl">
            One CLI. One API key.
            <br />
            Every integration.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400 md:text-xl">
            Feelr simplifies complex APIs into agent-friendly endpoints. Connect
            GitHub, Slack, Stripe, and Discord in seconds&nbsp;&mdash; not
            hours.
          </p>
          <div className="mt-10">
            <Link
              href="/login"
              className="inline-block rounded-lg bg-white px-6 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* Install */}
      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto max-w-xl space-y-4 text-center">
          <p className="text-sm font-medium uppercase tracking-wider text-zinc-500">
            Get started in seconds
          </p>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <code className="font-mono text-sm text-zinc-300">
                brew install andrewprograde/feelr/feelr
              </code>
              <CopyButton text="brew install andrewprograde/feelr/feelr" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3">
              <code className="font-mono text-sm text-zinc-300">
                feelr init
              </code>
              <CopyButton text="feelr init" />
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Demo */}
      <TerminalDemo />

      {/* Connectors */}
      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-heading text-center text-2xl font-bold text-white md:text-3xl">
            Connect Everything
          </h2>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {connectors.map((connector) => (
              <div
                key={connector.title}
                className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900 p-6"
              >
                <connector.icon className="mb-2 h-8 w-8 text-white" />
                <h3 className="text-lg font-semibold text-white">
                  {connector.title}
                </h3>
                <p className="text-sm text-zinc-400">
                  {connector.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="px-4 py-16 md:px-6">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-3">
          {capabilities.map((cap) => (
            <div
              key={cap.title}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6"
            >
              <h3 className="font-semibold text-white">{cap.title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{cap.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 text-center">
        <p className="text-sm text-zinc-600">
          Built with{' '}
          <a
            href="https://github.com/progradetech/feelr"
            className="text-zinc-500 transition-colors hover:text-zinc-300"
            target="_blank"
            rel="noopener noreferrer"
          >
            Feelr
          </a>
        </p>
      </footer>
    </main>
  );
}
