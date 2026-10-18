// 時代ごとの HUD の見た目（テーマ）。DOM を使わない部分（テストあり：tests/hudFutureTheme.test.ts）。
// ・2086：ホログラム（水色＋マゼンタ＋白、細かな六角の模様）＝ 既定
// ・2026：いまの技術の会社（NEXTMAKE の研究室）。水色〜青緑＋白、うすい方眼、演出は少なめ
// ・1726：江戸の大坂。藍＋金、朱のさし色。麻の葉・青海波・格子・七宝の模様（ネクマックスの投影のまま）
// ・1970：万博の「未来」。夕焼けのオレンジ＋クリーム、青緑のさし色。七宝（円）と方眼
// 色そのものは hudFuture.css の .nx-theme-* の CSS 変数。ここは名前の決まりと模様の形だけ。

export type HudTheme = '1726' | '1970' | '2026' | '2086'

export const HUD_THEMES: readonly HudTheme[] = ['1726', '1970', '2026', '2086']

/** setTheme が一度も呼ばれないときのテーマ */
export const DEFAULT_THEME: HudTheme = '2086'

/** ルート要素に付けるクラス名（例：nx-theme-1726） */
export function themeClass(t: HudTheme): string {
  return `nx-theme-${t}`
}

/** 文の中の年（「1726年　大坂・仕掛け横丁」など）からテーマを決める。見つからなければ null */
export function themeFromText(text: string | null | undefined): HudTheme | null {
  if (!text) return null
  const m = /(1726|1970|2026|2086)/.exec(text)
  return m ? (m[1] as HudTheme) : null
}

/** setTheme に渡された値をテーマに直す（'1726' / 'edo' / 年を含む文。わからなければ既定） */
export function normalizeTheme(key: string | null | undefined): HudTheme {
  if (!key) return DEFAULT_THEME
  const k = String(key).trim().toLowerCase()
  if (k === 'edo') return '1726'
  if (k === 'expo') return '1970'
  if (k === 'present' || k === 'now') return '2026'
  if (k === 'future') return '2086'
  return themeFromText(k) ?? DEFAULT_THEME
}

// ------------------------------------------------------------------ 模様（1 枚分のタイル）

/** 模様のタイル。数値はデザイン上の px（画面の大きさに合わせて HUD 側で拡大縮小する） */
export type PatternTile = {
  w: number
  h: number
  /** 線（stroke）の path の d。色は使う側で決める */
  lines?: string
  /** 順番のある要素（青海波：塗りで下の段を隠す）。class="pt-line"（線）と class="pt-fill"（塗り） */
  markup?: string
  /** 線の太さ（デザイン px） */
  stroke: number
}

const r1 = (v: number) => (Math.round(v * 100) / 100).toString()
const seg = (x0: number, y0: number, x1: number, y1: number) => `M${r1(x0)} ${r1(y0)}L${r1(x1)} ${r1(y1)}`

/** 麻の葉：正三角形の格子＋各三角形の重心から頂点への線 */
export function asanohaTile(a = 22): PatternTile {
  const H = (a * Math.sqrt(3)) / 2
  const p: string[] = []
  // 三角形の辺
  for (const y of [0, H, 2 * H]) p.push(seg(0, y, a, y))
  p.push(seg(0, 0, a / 2, H), seg(a, 0, a / 2, H), seg(a / 2, H, 0, 2 * H), seg(a / 2, H, a, 2 * H))
  // 重心への線
  const tri = (pts: Array<[number, number]>) => {
    const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3
    const cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3
    for (const [x, y] of pts) p.push(seg(x, y, cx, cy))
  }
  tri([[0, 0], [a, 0], [a / 2, H]])
  tri([[a / 2, H], [0, 2 * H], [a, 2 * H]])
  tri([[0, 0], [a / 2, H], [-a / 2, H]])
  tri([[a, 0], [a / 2, H], [1.5 * a, H]])
  tri([[0, 2 * H], [a / 2, H], [-a / 2, H]])
  tri([[a, 2 * H], [a / 2, H], [1.5 * a, H]])
  return { w: a, h: 2 * H, lines: p.join(''), stroke: 0.8 }
}

/** 青海波：重なった同心円の扇（下の段が上の段を隠す） */
export function seigaihaTile(R = 13): PatternTile {
  const circle = (cx: number, cy: number, r: number) => `M${r1(cx - r)} ${r1(cy)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0Z`
  const rows: Array<[number, number[]]> = [
    [-R / 2, [R]],
    [0, [0, 2 * R]],
    [R / 2, [R]],
    [R, [0, 2 * R]],
    [1.5 * R, [R]],
    [2 * R, [0, 2 * R]],
  ]
  // 1 つの扇＝塗り＋同心円 3 本。上の段から順に（後に描いたものが前）
  const parts: string[] = []
  for (const [cy, xs] of rows) {
    for (const cx of xs) {
      parts.push(`<path class="pt-fill" d="${circle(cx, cy, R)}"/>`)
      parts.push(`<path class="pt-line" d="${circle(cx, cy, R * 0.97)}${circle(cx, cy, R * 0.7)}${circle(cx, cy, R * 0.43)}"/>`)
    }
  }
  return { w: 2 * R, h: R, markup: parts.join(''), stroke: 0.9 }
}

/** 格子（障子の組子のような縦長の格子） */
export function koshiTile(w = 12, h = 20): PatternTile {
  return { w, h, lines: `${seg(0.5, 0, 0.5, h)}${seg(0, 0.5, w, 0.5)}`, stroke: 0.8 }
}

/** 七宝：円が 4 分の 1 ずつ重なる */
export function shippoTile(r = 10): PatternTile {
  const c = (cx: number, cy: number) => `M${r1(cx - r)} ${r1(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`
  return { w: 2 * r, h: 2 * r, lines: `${c(0, 0)}${c(2 * r, 0)}${c(0, 2 * r)}${c(2 * r, 2 * r)}${c(r, r)}`, stroke: 0.8 }
}

/** 六角の細かな網（2086） */
export function hexTile(r = 7): PatternTile {
  const w = Math.sqrt(3) * r
  const hex = (cx: number, cy: number) => {
    const pts: string[] = []
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2
      pts.push(`${r1(cx + r * Math.cos(a))} ${r1(cy + r * Math.sin(a))}`)
    }
    return `M${pts.join('L')}Z`
  }
  const centers: Array<[number, number]> = [
    [w / 2, r],
    [0, 2.5 * r],
    [w, 2.5 * r],
    [0, -0.5 * r],
    [w, -0.5 * r],
    [w / 2, 4 * r],
  ]
  return { w, h: 3 * r, lines: centers.map(([x, y]) => hex(x, y)).join(''), stroke: 0.7 }
}

/** 方眼（2026） */
export function gridTile(step = 16): PatternTile {
  return { w: step, h: step, lines: `${seg(0, 0.5, step, 0.5)}${seg(0.5, 0, 0.5, step)}`, stroke: 0.8 }
}

export type PatternName = 'hex' | 'grid' | 'asanoha' | 'seigaiha' | 'koshi' | 'shippo'

export const PATTERNS: Record<PatternName, () => PatternTile> = {
  hex: () => hexTile(),
  grid: () => gridTile(),
  asanoha: () => asanohaTile(),
  seigaiha: () => seigaihaTile(),
  koshi: () => koshiTile(),
  shippo: () => shippoTile(),
}

/** タイルの中身（SVG の要素の文字列）。線は class="pt-line"、塗りは class="pt-fill" */
export function tileMarkup(t: PatternTile): string {
  return t.markup ?? `<path class="pt-line" d="${t.lines ?? ''}"/>`
}

/**
 * CSS の背景に使える data URI（読み込み画面など SVG の defs が無い所用）。
 * 色はここで焼き込む。size はタイルの拡大率。
 */
export function patternDataUri(name: PatternName, color: string, opacity = 1, fill = 'none'): string {
  const t = PATTERNS[name]()
  const body = tileMarkup(t)
    .replace(/class="pt-line"/g, `fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${t.stroke}"`)
    .replace(/class="pt-fill"/g, `fill="${fill}" stroke="none"`)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r1(t.w)}" height="${r1(t.h)}" viewBox="0 0 ${r1(t.w)} ${r1(t.h)}">${body}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
