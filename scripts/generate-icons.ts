import sharp from 'sharp'
import { encode } from 'sharp-ico'
import { resolve, dirname } from 'path'
import { writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const LOGOMARK = resolve(__dirname, '../assets/feelr-logomark.svg')

const SIZES = {
  favicon: [32, 16] as const,
  apple: 180,
  manifest192: 192,
  manifest512: 512,
}

/** App targets with their directory structures */
const TARGETS = [
  {
    name: 'dashboard',
    appDir: resolve(__dirname, '../apps/dashboard/src/app'),
    publicDir: resolve(__dirname, '../apps/dashboard/public'),
  },
  {
    name: 'docs',
    appDir: resolve(__dirname, '../apps/docs/app'),
    publicDir: resolve(__dirname, '../apps/docs/public'),
  },
]

async function generatePng(inputSvg: string, size: number): Promise<Buffer> {
  return sharp(inputSvg)
    .resize(size, size)
    .png()
    .toBuffer()
}

async function generateIco(inputSvg: string, sizes: readonly number[]): Promise<Buffer> {
  const pngBuffers = await Promise.all(
    sizes.map(size => generatePng(inputSvg, size))
  )
  return encode(pngBuffers)
}

async function main() {
  console.log('Generating Feelr icon assets from', LOGOMARK)
  console.log()

  // Generate all assets once
  const faviconBuf = await generateIco(LOGOMARK, SIZES.favicon)
  const appleBuf = await generatePng(LOGOMARK, SIZES.apple)
  const icon192Buf = await generatePng(LOGOMARK, SIZES.manifest192)
  const icon512Buf = await generatePng(LOGOMARK, SIZES.manifest512)

  for (const target of TARGETS) {
    // Ensure directories exist
    mkdirSync(target.appDir, { recursive: true })
    mkdirSync(target.publicDir, { recursive: true })

    // Write favicon.ico to app dir
    const faviconPath = resolve(target.appDir, 'favicon.ico')
    writeFileSync(faviconPath, faviconBuf)
    console.log(`  wrote ${faviconPath} (${faviconBuf.length} bytes)`)

    // Write apple-icon.png to app dir
    const applePath = resolve(target.appDir, 'apple-icon.png')
    writeFileSync(applePath, appleBuf)
    console.log(`  wrote ${applePath} (${appleBuf.length} bytes)`)

    // Write manifest PNGs to public dir
    const icon192Path = resolve(target.publicDir, 'icon-192.png')
    writeFileSync(icon192Path, icon192Buf)
    console.log(`  wrote ${icon192Path} (${icon192Buf.length} bytes)`)

    const icon512Path = resolve(target.publicDir, 'icon-512.png')
    writeFileSync(icon512Path, icon512Buf)
    console.log(`  wrote ${icon512Path} (${icon512Buf.length} bytes)`)

    console.log()
  }

  console.log('Done! Generated 8 icon files for 2 apps.')
}

main().catch((err) => {
  console.error('Icon generation failed:', err)
  process.exit(1)
})
