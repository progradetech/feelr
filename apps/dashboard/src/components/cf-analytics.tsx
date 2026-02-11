'use client';

import Script from 'next/script';

export function CfAnalytics({ token }: { token: string }) {
  return (
    <Script
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
      strategy="afterInteractive"
    />
  );
}
