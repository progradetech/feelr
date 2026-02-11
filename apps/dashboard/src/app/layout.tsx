import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Feelr Dashboard',
  description: 'Manage your Feelr gateway',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-zinc-950 text-zinc-50 antialiased">
        <Providers>{children}</Providers>
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
