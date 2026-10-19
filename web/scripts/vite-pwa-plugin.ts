// 書き出し（vite build）の最後に、Service Worker（dist/sw.js）を作る Vite のプラグイン。
// ・dist のすべてのファイルの内容のハッシュとバイト数を表にして、sw.js の先頭に埋め込む（__NX_BUILD__）
//   → どれか 1 つでも変われば sw.js の中身が変わり、ブラウザが新しい版に気づく。
//     新しい版は「ハッシュが変わったファイル」だけダウンロードする（src/pwa/swPlan.ts）
// ・最初に要るファイル（index.html・入口の JS/CSS とその静的な import・アイコン・manifest）を precache に入れる
// ・sw/sw.ts を rolldown で 1 ファイル（iife）にまとめる
// ・Vite のビルドマニフェスト（.vite/manifest.json）は読んだら消す（公開しない）
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin, ResolvedConfig } from 'vite'
import { build as rolldownBuild } from 'rolldown'

type ManifestChunk = { file: string; css?: string[]; imports?: string[]; dynamicImports?: string[]; isEntry?: boolean }
type ViteManifest = Record<string, ManifestChunk>
type FileMap = Record<string, [hash: string, size: number, transfer?: number, source?: string]>

/** 配信側（GitHub Pages）が gzip して送る文字のファイル。通信量の見積もりに使う */
const TEXT_RE = /\.(js|css|html|json|webmanifest|svg|txt|hdr)$/i

/** 表に入れない（Service Worker が受け持たない）ファイル */
const EXCLUDE: RegExp[] = [/^sw\.js$/, /^\.nojekyll$/, /^\.vite\//, /^dev\//]

/** 最初に要る、公開フォルダ（public/）のファイル */
const PRECACHE_STATIC: RegExp[] = [/^index\.html$/, /^manifest\.webmanifest$/, /^favicon\.svg$/, /^icons\//]

const here = fileURLToPath(new URL('.', import.meta.url))

function walk(dir: string, root: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, root, out)
    else out.push(relative(root, p).split(sep).join('/'))
  }
}

/** 書き出したファイル → 元のソースの名前（CSS は「元の名前#css」）。ハッシュ入りの名前が変わっても同じ */
export function sourcesFromManifest(m: ViteManifest): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [raw, c] of Object.entries(m)) {
    // 共有のチャンクのキー（例 _storyDirector-D8aGglPE.js）はハッシュ入りなので、ハッシュを外す
    const key = raw.startsWith('_') ? raw.replace(/-[\w-]{8}(\.\w+)$/, '$1') : raw
    out[c.file] = key
    ;(c.css ?? []).forEach((css, i) => (out[css] ??= `${key}#css${i}`))
  }
  return out
}

/** 入口から静的にたどれるファイル（JS と CSS）。入口が動的に読む最初の段（ゲームのシェル）も入れる */
export function precacheFromManifest(m: ViteManifest): string[] {
  const out = new Set<string>()
  const visit = (key: string, seen: Set<string>) => {
    if (seen.has(key)) return
    seen.add(key)
    const c = m[key]
    if (!c) return
    out.add(c.file)
    for (const css of c.css ?? []) out.add(css)
    for (const k of c.imports ?? []) visit(k, seen)
  }
  for (const [key, c] of Object.entries(m)) {
    if (!c.isEntry) continue
    const seen = new Set<string>()
    visit(key, seen)
    for (const d of c.dynamicImports ?? []) visit(d, seen)
  }
  return [...out]
}

export function nexmaxPwa(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'nexmax-pwa',
    apply: 'build',
    configResolved(c) {
      config = c
    },
    async closeBundle() {
      const outDir = resolve(config.root, config.build.outDir)
      const manifestPath = join(outDir, '.vite', 'manifest.json')
      let viteManifest: ViteManifest = {}
      try {
        viteManifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ViteManifest
      } catch {
        this.warn('Vite のビルドマニフェストが見つかりません（build.manifest: true が必要）')
      }
      rmSync(join(outDir, '.vite'), { recursive: true, force: true })

      const paths: string[] = []
      walk(outDir, outDir, paths)
      const files: FileMap = {}
      const sources = sourcesFromManifest(viteManifest)
      for (const p of paths.sort()) {
        if (EXCLUDE.some((re) => re.test(p))) continue
        const buf = readFileSync(join(outDir, p))
        const hash = createHash('sha256').update(buf).digest('hex').slice(0, 16)
        const entry: FileMap[string] = TEXT_RE.test(p) ? [hash, buf.length, Math.min(buf.length, gzipSync(buf, { level: 6 }).length)] : [hash, buf.length]
        if (sources[p]) entry[3] = sources[p]
        files[p] = entry
      }
      const precache = new Set(precacheFromManifest(viteManifest))
      for (const p of Object.keys(files)) if (PRECACHE_STATIC.some((re) => re.test(p))) precache.add(p)
      const version = createHash('sha256')
        .update(JSON.stringify(Object.entries(files)))
        .digest('hex')
        .slice(0, 12)
      const build = { version, files, precache: [...precache].filter((p) => p in files).sort() }

      const out = await rolldownBuild({
        input: resolve(here, '../sw/sw.ts'),
        write: false,
        platform: 'browser',
        output: { format: 'iife', minify: true },
      })
      const code = out.output[0].code
      writeFileSync(join(outDir, 'sw.js'), `const __NX_BUILD__=${JSON.stringify(build)};\n${code}`)
      const total = Object.values(files).reduce((s, [, n]) => s + n, 0)
      const preBytes = build.precache.reduce((s, p) => s + (files[p][2] ?? files[p][1]), 0)
      config.logger.info(
        `[nexmax-pwa] sw.js 版 ${version}：${Object.keys(files).length} ファイル（${(total / 1048576).toFixed(1)} MB）、最初に入れるのは ${build.precache.length} ファイル（通信 約 ${(preBytes / 1048576).toFixed(1)} MB）`,
      )
    },
  }
}
