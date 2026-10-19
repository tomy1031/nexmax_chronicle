// ホーム画面のアプリのアイコンを作る（public/icons/*.png）。
// タイトル画面と同じ 3D のネクマックスの顔をヘッドレスの Chrome で描き、夜空の背景と「時の輪」の弧に重ねる。
//   cd web && CHROME_PATH=/path/to/chrome node scripts/make-icons.mjs
// CHROME_PATH が無ければ、よくある場所を順に探す。作った PNG はリポジトリに入れる（毎回のビルドでは作らない）。
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import sharp from 'sharp'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/icons')

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const chrome = CANDIDATES.find((p) => existsSync(p))
if (!chrome) throw new Error('Chrome が見つかりません。CHROME_PATH を指定してください')

/** 背景（夜空のグラデーションと時の輪の弧）。size 四方。safe は円の安全域（maskable は 0.8） */
function background(size, safe) {
  const c = size / 2
  const r = (size * safe) / 2 - size * 0.04
  const arc = (a0, a1, rr) => {
    const p = (a) => {
      const t = ((a - 90) * Math.PI) / 180
      return `${(c + rr * Math.cos(t)).toFixed(1)} ${(c + rr * Math.sin(t)).toFixed(1)}`
    }
    return `M ${p(a0)} A ${rr} ${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`
  }
  const w = size * 0.032
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3b7e"/><stop offset="1" stop-color="#0a1838"/></linearGradient>
      <radialGradient id="h" cx="0.5" cy="0.46" r="0.5"><stop offset="0" stop-color="#5ee6ff" stop-opacity="0.32"/><stop offset="1" stop-color="#5ee6ff" stop-opacity="0"/></radialGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)"/>
    <circle cx="${c}" cy="${c * 0.94}" r="${r}" fill="url(#h)"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#5ee6ff" stroke-opacity="0.16" stroke-width="${w * 0.4}"/>
    <path d="${arc(210, 288, r)}" fill="none" stroke="#f4a54e" stroke-width="${w}" stroke-linecap="round" stroke-opacity="0.55"/>
    <path d="${arc(300, 378, r)}" fill="none" stroke="#ff8a5c" stroke-width="${w}" stroke-linecap="round" stroke-opacity="0.55"/>
    <path d="${arc(390, 468, r)}" fill="none" stroke="#4ee6dc" stroke-width="${w}" stroke-linecap="round" stroke-opacity="0.55"/>
    <path d="${arc(120, 198, r)}" fill="none" stroke="#ff5fdc" stroke-width="${w * 1.6}" stroke-linecap="round"/>
  </svg>`)
}

const server = await createServer({ root, logLevel: 'error', server: { port: 5199, strictPort: false } })
await server.listen()
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/'
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1024, height: 1024, deviceScaleFactor: 1 })
  page.on('console', (m) => console.log('[page]', m.text()))
  page.on('pageerror', (e) => console.error('[page error]', e))
  await page.goto(`${url}icon-render.html?size=1024`, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => typeof window.__iconPng === 'string', { timeout: 60000 })
  const dataUrl = await page.evaluate(() => window.__iconPng)
  const face = Buffer.from(dataUrl.split(',')[1], 'base64')
  mkdirSync(outDir, { recursive: true })

  /** size 四方のアイコン。faceScale：顔の大きさ（四方に対する割合）。体が途中で切れないよう、顔の絵の下端を下の縁にそろえる */
  const make = async (size, safe, faceScale, file) => {
    const fs = Math.round(size * faceScale)
    const faceImg = await sharp(face).resize(fs, fs).png().toBuffer()
    await sharp(background(size, safe))
      .composite([{ input: faceImg, left: Math.round((size - fs) / 2), top: size - fs }])
      .png({ compressionLevel: 9 })
      .toFile(resolve(outDir, file))
    console.log('wrote', file)
  }
  await make(512, 1, 1.0, 'icon-512.png')
  await make(192, 1, 1.0, 'icon-192.png')
  await make(180, 1, 1.0, 'apple-touch-icon.png')
  // maskable：円の安全域（直径 80%）に収める
  await make(512, 0.8, 0.8, 'icon-maskable-512.png')
} finally {
  await browser.close()
  await server.close()
}
