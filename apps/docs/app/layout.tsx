import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import 'nextra-theme-docs/style.css'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  title: {
    default: 'Feelr Docs',
    template: '%s - Feelr Docs',
  },
  description: 'Agent-friendly API simplification layer',
}

export const viewport: Viewport = {
  themeColor: '#E85D3A',
}

const navbar = (
  <Navbar
    logo={<b>Feelr</b>}
    projectLink="https://github.com/andrewprograde/feelr"
  />
)

const footer = <Footer>MIT {new Date().getFullYear()} Feelr</Footer>

export default async function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/andrewprograde/feelr/tree/main/apps/docs"
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
