// Service Worker の差分ダウンロードの計画（src/pwa/swPlan.ts）と、書き出しの precache の選び方（scripts/vite-pwa-plugin.ts）。
import { describe, expect, it } from 'vitest'
import { fetchUrl, formatBytes, pathInScope, planInstall, type BuildInfo, type FileMap } from '../src/pwa/swPlan'
import { precacheFromManifest, sourcesFromManifest } from '../scripts/vite-pwa-plugin'

const SCOPE = 'https://tomy1031.github.io/nexmax_chronicle/'

function build(files: FileMap, precache: string[], version = 'v2'): BuildInfo {
  return { version, files, precache }
}

describe('planInstall：更新のときは変わったファイルだけダウンロード', () => {
  const v1: FileMap = {
    'index.html': ['h-index-1', 1000, 500],
    'assets/index-a.js': ['h-a', 20000, 7000],
    'assets/vendor-rapier-r.js': ['h-r', 4_000_000, 1_600_000],
    'models/sora.glb': ['h-sora-1', 300000],
    'textures/edo.jpg': ['h-edo', 900000],
  }

  it('初めて（前の版なし）：最初に要るファイルだけダウンロード。まだ使っていない時代のファイルは落とさない', () => {
    const p = planInstall(build(v1, ['index.html', 'assets/index-a.js', 'assets/vendor-rapier-r.js']), [])
    expect(p.copy).toEqual([])
    expect(p.fetch.map((f) => f.path).sort()).toEqual(['assets/index-a.js', 'assets/vendor-rapier-r.js', 'index.html'])
    // 通信の見積もりは gzip 後の大きさ
    expect(p.bytes).toBe(500 + 7000 + 1_600_000)
  })

  it('ゲームのコードだけ変わった：変わったファイルだけ。物理（Rapier）・モデルは手元から写す（通信なし）', () => {
    const v2: FileMap = {
      ...v1,
      'index.html': ['h-index-2', 1000, 500],
      'assets/index-b.js': ['h-b', 21000, 7200],
    }
    delete (v2 as Record<string, unknown>)['assets/index-a.js']
    const prev = [{ name: 'nexmax-v-v1', files: v1, cached: new Set(['index.html', 'assets/index-a.js', 'assets/vendor-rapier-r.js', 'models/sora.glb']) }]
    const p = planInstall(build(v2, ['index.html', 'assets/index-b.js', 'assets/vendor-rapier-r.js']), prev)
    expect(p.fetch.map((f) => f.path).sort()).toEqual(['assets/index-b.js', 'index.html'])
    expect(p.copy.map((c) => c.path).sort()).toEqual(['assets/vendor-rapier-r.js', 'models/sora.glb'])
    expect(p.bytes).toBe(500 + 7200)
    // 一度も使っていない時代のテクスチャは、写しもダウンロードもしない
    expect([...p.fetch, ...p.copy].some((x) => x.path === 'textures/edo.jpg')).toBe(false)
  })

  it('同じ名前のファイル（モデルなど）の中身が変わった：前にダウンロードしていた人だけ取り直す', () => {
    const v2: FileMap = { ...v1, 'models/sora.glb': ['h-sora-2', 310000] }
    const had = planInstall(build(v2, ['index.html']), [{ name: 'old', files: v1, cached: new Set(['index.html', 'models/sora.glb']) }])
    expect(had.fetch.map((f) => f.path)).toEqual(['models/sora.glb'])
    const never = planInstall(build(v2, ['index.html']), [{ name: 'old', files: v1, cached: new Set(['index.html']) }])
    expect(never.fetch).toEqual([])
  })

  it('名前（ハッシュ入り）が変わった JS でも、元のソースが同じで前に使っていたなら先にダウンロードする', () => {
    const old: FileMap = { 'assets/stage-OLD.js': ['h1', 90000, 30000, 'src/stages/namba2026/stage.ts'], 'assets/stage-EDO.js': ['h2', 90000, 30000, 'src/stages/edo1726/stage.ts'] }
    const next: FileMap = { 'assets/stage-NEW.js': ['h3', 91000, 30500, 'src/stages/namba2026/stage.ts'], 'assets/stage-EDO2.js': ['h4', 90000, 30000, 'src/stages/edo1726/stage.ts'] }
    // 2026年だけ遊んだことがある
    const p = planInstall(build(next, []), [{ name: 'old', files: old, cached: new Set(['assets/stage-OLD.js']) }])
    expect(p.fetch.map((f) => f.path)).toEqual(['assets/stage-NEW.js'])
    expect(p.bytes).toBe(30500)
  })

  it('前の版が複数あるときは、同じ中身を持っている新しい方から写す', () => {
    const newer = { name: 'newer', files: v1, cached: new Set(['models/sora.glb']) }
    const older = { name: 'older', files: v1, cached: new Set(['models/sora.glb']) }
    const p = planInstall(build(v1, []), [newer, older])
    expect(p.copy).toEqual([{ path: 'models/sora.glb', from: 'newer' }])
  })
})

describe('pathInScope・fetchUrl', () => {
  const files: FileMap = { 'index.html': ['h', 1], 'assets/a.js': ['h', 1], 'textures/japanese_stone_wall/diff_1k.jpg': ['h', 1] }

  it('スコープそのもの・クエリ付きのページは index.html', () => {
    expect(pathInScope(SCOPE, SCOPE, files)).toBe('index.html')
    expect(pathInScope(SCOPE, `${SCOPE}?quality=low`, files)).toBe('index.html')
    expect(pathInScope(SCOPE, `${SCOPE}index.html#x`, files)).toBe('index.html')
  })

  it('表にあるファイルだけ。スコープの外・表に無いものは null', () => {
    expect(pathInScope(SCOPE, `${SCOPE}assets/a.js?v=1`, files)).toBe('assets/a.js')
    expect(pathInScope(SCOPE, `${SCOPE}textures/japanese_stone_wall/diff_1k.jpg`, files)).toBe('textures/japanese_stone_wall/diff_1k.jpg')
    expect(pathInScope(SCOPE, `${SCOPE}assets/old.js`, files)).toBeNull()
    expect(pathInScope(SCOPE, 'https://fonts.gstatic.com/x.woff2', files)).toBeNull()
  })

  it('ダウンロードの URL はハッシュをクエリに付ける（配信側の古いキャッシュをつかまない）', () => {
    expect(fetchUrl(SCOPE, 'assets/a.js', 'abc')).toBe(`${SCOPE}assets/a.js?v=abc`)
  })

  it('バイト数の表示', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(340 * 1024)).toBe('340 KB')
    expect(formatBytes(1.24 * 1024 * 1024)).toBe('1.2 MB')
    expect(formatBytes(25 * 1024 * 1024)).toBe('25 MB')
  })
})

describe('precacheFromManifest：入口から静的にたどれるファイルと、入口が最初に動的に読むシェル', () => {
  it('ステージ（シェルがさらに動的に読むもの）は入れない', () => {
    const m = {
      'index.html': { file: 'assets/index.js', css: ['assets/index.css'], imports: ['_shared.js'], dynamicImports: ['src/game/game.ts'], isEntry: true },
      '_shared.js': { file: 'assets/shared.js' },
      'src/game/game.ts': { file: 'assets/game.js', css: ['assets/game.css'], imports: ['_vendor-rapier.js'], dynamicImports: ['src/stages/edo1726/stage.ts'] },
      '_vendor-rapier.js': { file: 'assets/vendor-rapier.js' },
      'src/stages/edo1726/stage.ts': { file: 'assets/stage.js' },
    }
    expect(precacheFromManifest(m).sort()).toEqual(['assets/game.css', 'assets/game.js', 'assets/index.css', 'assets/index.js', 'assets/shared.js', 'assets/vendor-rapier.js'])
  })
})

describe('sourcesFromManifest：書き出したファイル → 元のソース', () => {
  it('JS は manifest のキー、CSS は「キー#css番号」', () => {
    const m = { 'src/game/game.ts': { file: 'assets/game-x.js', css: ['assets/game-y.css'] }, '_storyDirector-D8aGglPE.js': { file: 'assets/storyDirector-D8aGglPE.js' } }
    // 共有のチャンクはキーにもハッシュが入るので外す（中身が変わっても同じ名前になるように）
    expect(sourcesFromManifest(m)).toEqual({ 'assets/game-x.js': 'src/game/game.ts', 'assets/game-y.css': 'src/game/game.ts#css0', 'assets/storyDirector-D8aGglPE.js': '_storyDirector.js' })
  })
})
