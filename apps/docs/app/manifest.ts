import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Feelr Docs',
    short_name: 'Feelr Docs',
    description:
      'Documentation for Feelr — agent-friendly API simplification layer.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090b',
    theme_color: '#E85D3A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
