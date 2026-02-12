import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import { CfAnalytics } from '@/components/cf-analytics';
import { inter, spaceGrotesk, jetbrainsMono } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'Feelr',
    template: '%s | Feelr',
  },
  description:
    'Agent-friendly API simplification. One CLI, one API key, every integration.',
  openGraph: {
    siteName: 'Feelr',
    locale: 'en_US',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#E85D3A',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="bg-zinc-950 font-sans text-zinc-50 antialiased">
        <Providers>{children}</Providers>
        <Toaster theme="dark" />
        {process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN && (
          <CfAnalytics token={process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN} />
        )}
      </body>
    </html>
  );
}
