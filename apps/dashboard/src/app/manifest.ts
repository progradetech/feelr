import type { MetadataRoute } from 'next'

export const dynamic = 'force-static'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Feelr',
    short_name: 'Feelr',
    description:
      'Agent-friendly API simplification. One CLI, one API key, every integration.',
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
