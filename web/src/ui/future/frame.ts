// ホログラムの枠（角を落としたガラスのパネル＋光る細い線）を SVG で描く。
// 要素の大きさが変わったら（ResizeObserver）その大きさで描き直すので、角の形がゆがまない。
// 色は CSS 変数（--nx-line / --nx-line-hi / --nx-line-dim / --nx-acc など、テーマで変わる）。
// 光のにじみ・ガラスの塗り・走査線・時代の模様は、HUD に 1 つだけ置く <defs>（frameDefs()）を共有する。
// 立体的な傾き（パース）は付けない（スマホで操作しにくくなるため）。すべて平らで画面に平行。
import { PATTERNS, tileMarkup, type PatternName } from './themes'

/** 枠の形（数値はデザイン上の px。画面の大きさに合わせて scale 倍する） */
export type FrameSpec = {
  /** 角の切り落とし [左上, 右上, 右下, 左下] */
  cuts: [number, number, number, number]
  /** 左右の端をとがらせる深さ（0 = とがらせない） */
  pointL?: number
  pointR?: number
  /** 外側に少し離した細い線（一部だけ） */
  outer?: boolean
  /** 内側の細い線 */
  inner?: boolean
  /** 角の明るい線（白いハイライト）と端の光の点 */
  accents?: boolean
  /** 下の内側の小さな目盛り */
  ticks?: boolean
  /** ガラスの塗り（既定 true） */
  fill?: boolean
  /** 走査線（既定 true） */
  scan?: boolean
  /** 時代の模様を入れる場所の種類（CSS がテーマごとに模様を決める） */
  pattern?: 'panel' | 'band' | 'bar' | 'plate'
  /** 模様が見える側（r = 右ほど濃い、l = 左、b = 下、tr = 右上、all = 全体） */
  patMask?: 'r' | 'l' | 'b' | 'tr' | 'all'
  /** さし色（2086 はマゼンタの斜線、1726 は朱のひし形） */
  mark?: boolean
  /** 外側の角の括弧（区切りのある細い線） */
  brackets?: boolean
  /** 小さな技術ラベル（飾り。読ませる文字ではない） */
  code?: string
}

export const FRAME_SPECS: Record<string, FrameSpec> = {
  // 会話ウィンドウ：四隅を落とした大きなパネル
  dialog: { cuts: [14, 14, 14, 14], outer: true, inner: true, accents: true, ticks: true, pattern: 'band', patMask: 'r', mark: true, code: 'VOICE-LINK 02' },
  // 会話の顔の枠
  face: { cuts: [14, 4, 14, 4], inner: true, accents: true, scan: true, brackets: true },
  // 目的のパネル：左をとがらせる
  objective: { cuts: [12, 12, 12, 12], pointL: 18, outer: true, inner: true, accents: true, pattern: 'panel', patMask: 'r', brackets: true, mark: true, code: 'MISSION 01' },
  // 時代と場所の札・名札：両端をとがらせた細長い六角形
  plate: { cuts: [0, 0, 0, 0], pointL: 13, pointR: 13, accents: true, pattern: 'plate', patMask: 'r' },
  plateSmall: { cuts: [0, 0, 0, 0], pointL: 10, pointR: 10, accents: true, pattern: 'plate', patMask: 'r' },
  // キー案内の札
  chip: { cuts: [0, 0, 0, 0], pointL: 12, pointR: 12, accents: false, scan: false },
  // 腕の名札
  armPlate: { cuts: [0, 0, 0, 0], pointL: 14, pointR: 14, accents: true, inner: true, pattern: 'plate', patMask: 'r', mark: true, outer: true },
  // 体力・エネルギーの帯：右端を矢印のようにとがらせる
  bar: { cuts: [0, 0, 0, 0], pointL: 0, pointR: 16, inner: true, accents: true, pattern: 'bar', patMask: 'r' },
  // コンパス：両端を深くとがらせる
  compass: { cuts: [0, 0, 0, 0], pointL: 24, pointR: 24, outer: true, inner: true, accents: true },
  // 汎用のパネル（一時停止・水門・IDO）
  panel: { cuts: [16, 16, 16, 16], outer: true, inner: true, accents: true, ticks: true, pattern: 'panel', patMask: 'tr', brackets: true, mark: true, code: 'NX-SYS 07' },
  card: { cuts: [10, 10, 10, 10], inner: true, accents: true, pattern: 'panel', patMask: 'tr' },
  // タブ（一時停止パネルの切り替え）
  tab: { cuts: [8, 0, 0, 0], pointR: 10, accents: false, scan: false },
  // お知らせ
  toast: { cuts: [9, 9, 9, 9], accents: true, pattern: 'plate', patMask: 'r', mark: true },
}

const NS = 'http://www.w3.org/2000/svg'

/** デザインの基準（1600×900）。HUD 全体はこれを画面に合わせて一律に拡大縮小する */
export const DESIGN_W = 1600
export const DESIGN_H = 900

/**
 * 画面の大きさに合わせた拡大率。幅・高さの小さいほうに合わせ、上限・下限は付けない
 * （どの画面でも配置の比率が同じになる。CSS の --u と同じ式）。
 */
export function hudScale(w = window.innerWidth, h = window.innerHeight): number {
  if (!(w > 0) || !(h > 0)) return 1
  return Math.min(w / DESIGN_W, h / DESIGN_H)
}

type Pt = [number, number]

/** 角を落とした多角形（inset だけ内側へ） */
export function framePolygon(w: number, h: number, spec: FrameSpec, s: number, inset = 0): Pt[] {
  const d = inset
  const x0 = d
  const y0 = d
  const x1 = w - d
  const y1 = h - d
  const k = d * 0.414
  const c = spec.cuts.map((v) => Math.max(0, v * s - k)) as [number, number, number, number]
  const pl = Math.max(0, (spec.pointL ?? 0) * s - d * 0.5)
  const pr = Math.max(0, (spec.pointR ?? 0) * s - d * 0.5)
  const ym = (y0 + y1) / 2
  const pts: Pt[] = []
  // 上の辺（左 → 右）
  pts.push([x0 + (pl > 0 ? pl : c[0]), y0])
  pts.push([x1 - (pr > 0 ? pr : c[1]), y0])
  // 右の辺
  if (pr > 0) pts.push([x1, ym])
  else {
    if (c[1] > 0) pts.push([x1, y0 + c[1]])
    if (c[2] > 0) pts.push([x1, y1 - c[2]])
    else pts.push([x1, y1])
  }
  if (pr > 0) pts.push([x1 - pr, y1])
  else if (c[2] > 0) pts.push([x1 - c[2], y1])
  // 下の辺（右 → 左）
  if (pl > 0) pts.push([x0 + pl, y1])
  else {
    if (c[3] > 0) pts.push([x0 + c[3], y1])
    else pts.push([x0, y1])
  }
  // 左の辺
  if (pl > 0) pts.push([x0, ym])
  else {
    if (c[3] > 0) pts.push([x0, y1 - c[3]])
    if (c[0] > 0) pts.push([x0, y0 + c[0]])
    else pts.push([x0, y0])
  }
  return pts
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toString()
const pathOf = (pts: Pt[], close = true) => `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}${close ? 'Z' : ''}`

/** 線の太さ（デザイン px × s。細すぎて消えないよう下限だけ付ける） */
export function lineWidth(design: number, s: number, min = 0.75): number {
  return Math.max(min, design * s)
}

/** 枠の SVG の中身（文字列）。w, h は CSS px */
export function frameMarkup(w: number, h: number, spec: FrameSpec, s: number): string {
  const lw = lineWidth(1.25, s, 0.9)
  const main = framePolygon(w, h, spec, s, lw / 2)
  const parts: string[] = []
  const fillD = pathOf(framePolygon(w, h, spec, s, lw))
  const filled = spec.fill !== false
  if (filled) {
    parts.push(`<path class="nx-f-fill" d="${fillD}"/>`)
    parts.push(`<path class="nx-f-sheen" d="${fillD}"/>`)
    if (spec.scan !== false) parts.push(`<path class="nx-f-scan" d="${fillD}"/>`)
    if (spec.pattern) parts.push(`<path class="nx-f-pat" data-slot="${spec.pattern}"${spec.patMask && spec.patMask !== 'all' ? ` mask="url(#nxm-${spec.patMask})"` : ''} d="${fillD}"/>`)
  }
  if (spec.inner) parts.push(`<path class="nx-f-inner" d="${pathOf(framePolygon(w, h, spec, s, 4.5 * s))}" stroke-width="${f1(lineWidth(0.75, s, 0.6))}"/>`)
  // 光る線（にじみ付き）
  // ふちのにじみ（太くうすい線をぼかす＝ガラスの縁に光がしみ出す）→ 細い線 → 角の白いハイライトと光の点
  const glow: string[] = [`<path class="nx-f-edge" d="${pathOf(main)}" stroke-width="${f1(7 * s)}"/>`, `<path class="nx-f-line" d="${pathOf(main)}" stroke-width="${f1(lw)}"/>`]
  if (spec.accents) {
    const acc = accentPath(w, h, spec, s, lw)
    glow.push(`<path class="nx-f-acc" d="${acc.d}" stroke-width="${f1(lineWidth(2.2, s, 1.2))}"/>`)
    const r = lineWidth(1.6, s, 0.9)
    glow.push(acc.dots.map(([x, y]) => `<circle class="nx-f-flare" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 3.4)}"/><circle class="nx-f-dot" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}"/>`).join(''))
  }
  if (spec.outer) glow.push(`<path class="nx-f-outer-hi" d="${outerHighlight(w, h, spec, s)}" stroke-width="${f1(lineWidth(1.4, s, 0.9))}"/>`)
  parts.push(`<g class="nx-f-glow" filter="url(#nxf-glow)">${glow.join('')}</g>`)
  const thin = f1(lineWidth(0.85, s, 0.6))
  if (spec.outer) parts.push(`<path class="nx-f-outer" d="${outerPath(w, h, spec, s)}" stroke-width="${thin}"/>`)
  if (spec.brackets) parts.push(bracketMarkup(w, h, spec, s, thin))
  if (spec.ticks) parts.push(`<path class="nx-f-ticks" d="${ticksPath(w, h, spec, s)}" stroke-width="${thin}"/>`)
  if (spec.mark) parts.push(markMarkup(w, h, spec, s))
  if (spec.code && w > 160 * s) {
    const cbr = Math.max(spec.cuts[2] * s, (spec.pointR ?? 0) * s)
    parts.push(`<text class="nx-f-code" x="${f1(w - cbr - (spec.ticks ? 58 : 14) * s)}" y="${f1(h - 6 * s)}" font-size="${f1(7 * s)}" text-anchor="end">${spec.code}</text>`)
  }
  return parts.join('')
}

/** 角の明るい線：左上と右下（とがった端ならその斜め）と、線の端の光の点 */
function accentPath(w: number, h: number, spec: FrameSpec, s: number, lw: number): { d: string; dots: Pt[] } {
  const d = lw / 2
  const out: string[] = []
  const dots: Pt[] = []
  const pl = (spec.pointL ?? 0) * s
  const pr = (spec.pointR ?? 0) * s
  const [ctl, , cbr] = spec.cuts.map((v) => v * s)
  const len = Math.min(w * 0.16, 40 * s)
  if (pl > 0) {
    out.push(`M${f1(d + pl * 0.2)} ${f1(h / 2 - (h / 2 - d) * 0.2)}L${f1(d + pl)} ${f1(d)}L${f1(d + pl + len * 0.7)} ${f1(d)}`)
    dots.push([d + pl + len * 0.7, d])
  } else if (ctl > 0) {
    out.push(`M${f1(d)} ${f1(d + ctl + len * 0.3)}L${f1(d)} ${f1(d + ctl)}L${f1(d + ctl)} ${f1(d)}L${f1(d + ctl + len)} ${f1(d)}`)
    dots.push([d + ctl + len, d])
  } else {
    out.push(`M${f1(d)} ${f1(d + len * 0.4)}L${f1(d)} ${f1(d)}L${f1(d + len)} ${f1(d)}`)
    dots.push([d + len, d])
  }
  if (pr > 0) {
    out.push(`M${f1(w - d - pr - len * 0.7)} ${f1(h - d)}L${f1(w - d - pr)} ${f1(h - d)}L${f1(w - d - pr * 0.2)} ${f1(h / 2 + (h / 2 - d) * 0.2)}`)
    dots.push([w - d - pr - len * 0.7, h - d])
  } else if (cbr > 0) {
    out.push(`M${f1(w - d)} ${f1(h - d - cbr - len * 0.3)}L${f1(w - d)} ${f1(h - d - cbr)}L${f1(w - d - cbr)} ${f1(h - d)}L${f1(w - d - cbr - len)} ${f1(h - d)}`)
    dots.push([w - d - cbr - len, h - d])
  } else {
    out.push(`M${f1(w - d)} ${f1(h - d - len * 0.4)}L${f1(w - d)} ${f1(h - d)}L${f1(w - d - len)} ${f1(h - d)}`)
    dots.push([w - d - len, h - d])
  }
  return { d: out.join(''), dots }
}

/** 外側に少し離した細い線（上の右寄りと、下の左寄り） */
function outerPath(w: number, h: number, spec: FrameSpec, s: number): string {
  const o = 5 * s
  const [, ctr, , cbl] = spec.cuts.map((v) => v * s)
  const pr = (spec.pointR ?? 0) * s
  const pl = (spec.pointL ?? 0) * s
  const out: string[] = []
  const rTop = pr > 0 ? w - pr : w - ctr
  out.push(`M${f1(w * 0.58)} ${f1(-o)}L${f1(rTop + o * 0.4)} ${f1(-o)}L${f1(pr > 0 ? w + o * 0.2 - pr * 0.45 : w + o)} ${f1(pr > 0 ? h * 0.22 - o : ctr - o * 0.4)}`)
  const lBot = pl > 0 ? pl : cbl
  out.push(`M${f1(pl > 0 ? pl * 0.45 - o * 0.2 : -o)} ${f1(pl > 0 ? h * 0.78 + o : h - cbl + o * 0.4)}L${f1(lBot - o * 0.4)} ${f1(h + o)}L${f1(Math.max(lBot + 20 * s, w * 0.32))} ${f1(h + o)}`)
  return out.join('')
}

/** 外側の細い線の上を光る短い区間（上の線の右端・下の線の左端） */
function outerHighlight(w: number, h: number, spec: FrameSpec, s: number): string {
  const o = 5 * s
  const [, ctr, , cbl] = spec.cuts.map((v) => v * s)
  const pr = (spec.pointR ?? 0) * s
  const pl = (spec.pointL ?? 0) * s
  const rTop = (pr > 0 ? w - pr : w - ctr) + o * 0.4
  const lBot = (pl > 0 ? pl : cbl) - o * 0.4
  const L = Math.min(24 * s, w * 0.08)
  return `M${f1(rTop - L - 4 * s)} ${f1(-o)}H${f1(rTop - 4 * s)}M${f1(lBot + 6 * s)} ${f1(h + o)}H${f1(lBot + 6 * s + L * 0.7)}`
}

/** 外側の角の括弧（左上と右下。線＋小さな四角） */
function bracketMarkup(w: number, h: number, spec: FrameSpec, s: number, sw: string): string {
  const o = 9 * s
  const L = Math.min(26 * s, h * 0.35)
  const q = Math.max(1.2, 2.4 * s)
  const pl = (spec.pointL ?? 0) * s
  const tlx = pl > 0 ? pl * 0.6 : -o
  const d = `M${f1(tlx)} ${f1(-o + L)}V${f1(-o)}H${f1(tlx + L)}M${f1(w + o)} ${f1(h + o - L)}V${f1(h + o)}H${f1(w + o - L)}`
  const sq = `<rect class="nx-f-brk-sq" x="${f1(tlx + L + 3 * s)}" y="${f1(-o - q / 2)}" width="${f1(q * 2.2)}" height="${f1(q)}"/><rect class="nx-f-brk-sq" x="${f1(w + o - q / 2)}" y="${f1(h + o - L - 3 * s - q * 2.2)}" width="${f1(q)}" height="${f1(q * 2.2)}"/>`
  return `<path class="nx-f-brk" d="${d}" stroke-width="${sw}"/>${sq}`
}

/** さし色：上の辺の右寄りに斜線 4 本（2086）／ひし形（1726）、下の外側に短い線 */
function markMarkup(w: number, h: number, spec: FrameSpec, s: number): string {
  const pr = Math.max((spec.pointR ?? 0) * s, spec.cuts[1] * s)
  const x0 = w - pr - 46 * s
  const y0 = 4.5 * s
  const hh = Math.min(5 * s, h * 0.12)
  const sl: string[] = []
  for (let i = 0; i < 4; i++) {
    const x = x0 + i * 4.2 * s
    sl.push(`M${f1(x)} ${f1(y0 + hh)}L${f1(x + 2.4 * s)} ${f1(y0)}`)
  }
  const dm = 2.6 * s
  const cx = x0 + 7 * s
  const cy = y0 + hh / 2
  const dia = `M${f1(cx)} ${f1(cy - dm)}L${f1(cx + dm)} ${f1(cy)}L${f1(cx)} ${f1(cy + dm)}L${f1(cx - dm)} ${f1(cy)}ZM${f1(cx + 7 * s)} ${f1(cy - dm * 0.6)}L${f1(cx + 7 * s + dm * 0.6)} ${f1(cy)}L${f1(cx + 7 * s)} ${f1(cy + dm * 0.6)}L${f1(cx + 7 * s - dm * 0.6)} ${f1(cy)}Z`
  const pl = (spec.pointL ?? 0) * s
  const bx = Math.max(pl, spec.cuts[3] * s) + 10 * s
  const bottom = `M${f1(bx)} ${f1(h + 5 * s)}H${f1(bx + 14 * s)}`
  return `<g class="nx-f-mark"><path class="nx-f-mark-sl" d="${sl.join('')}" stroke-width="${f1(lineWidth(1.3, s, 0.8))}"/><path class="nx-f-mark-dia" d="${dia}"/><path class="nx-f-mark-bt" d="${bottom}" stroke-width="${f1(lineWidth(1.6, s, 0.9))}"/></g>`
}

/** 下の内側の小さな目盛り（右寄り） */
function ticksPath(w: number, h: number, spec: FrameSpec, s: number): string {
  const cbr = spec.cuts[2] * s
  const gap = 5 * s
  const n = 7
  const x1 = w - cbr - 14 * s
  const y = h - 6.5 * s
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const x = x1 - i * gap
    out.push(`M${f1(x)} ${f1(y)}L${f1(x)} ${f1(y - (i % 3 === 0 ? 5 : 2.5) * s)}`)
  }
  return out.join('')
}

const PATTERN_NAMES = Object.keys(PATTERNS) as PatternName[]

/** 模様の <pattern>。id の頭が nxp-（枠：画面の px で描く → 拡大率を掛ける）と nxpd-（デザイン px の SVG 用） */
function patternDefs(): string {
  return PATTERN_NAMES.map((n) => {
    const t = PATTERNS[n]()
    const body = tileMarkup(t)
    const a = `width="${t.w.toFixed(3)}" height="${t.h.toFixed(3)}" patternUnits="userSpaceOnUse"`
    return `<pattern id="nxp-${n}" ${a} data-scaled="1" style="--pt-sw:${t.stroke}">${body}</pattern><pattern id="nxpd-${n}" ${a} style="--pt-sw:${t.stroke}">${body}</pattern>`
  }).join('')
}

/** 模様をどちら側で見せるかのマスク（要素の大きさに合わせる） */
function maskDefs(): string {
  const m = (id: string, grad: string) =>
    `<mask id="nxm-${id}" maskContentUnits="objectBoundingBox" x="-0.1" y="-0.1" width="1.2" height="1.2"><rect width="1" height="1" fill="url(#nxmg-${id})"/></mask>${grad}`
  const lin = (id: string, x1: number, y1: number, x2: number, y2: number, a: number) =>
    `<linearGradient id="nxmg-${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="${a}" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>`
  return [m('r', lin('r', 0, 0, 1, 0, 0.3)), m('l', lin('l', 1, 0, 0, 0, 0.3)), m('b', lin('b', 0, 0, 0, 1, 0.25)), m('tr', lin('tr', 0.1, 1, 1, 0, 0.35))].join('')
}

/** HUD に 1 つだけ置く共有の定義（光のにじみ・ガラス・走査線・模様） */
export function frameDefs(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'nx-defs')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = `
    <defs>
      <filter id="nxf-glow" x="-20%" y="-60%" width="140%" height="220%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="5.5" data-sd="5.5" result="w"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.3" data-sd="1.3" result="b"/>
        <feMerge><feMergeNode in="w"/><feMergeNode in="w"/><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="nxf-glow-d" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.6" result="w"/>
        <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b"/>
        <feMerge><feMergeNode in="w"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="nxf-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="g-glass-a"/>
        <stop offset="1" class="g-glass-b"/>
      </linearGradient>
      <linearGradient id="nxf-glass-deep" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="g-deep-a"/>
        <stop offset="1" class="g-deep-b"/>
      </linearGradient>
      <linearGradient id="nxf-sheen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" class="g-sheen" stop-opacity="0.12"/>
        <stop offset="0.22" class="g-sheen" stop-opacity="0.03"/>
        <stop offset="0.8" class="g-sheen" stop-opacity="0"/>
        <stop offset="1" class="g-sheen" stop-opacity="0.07"/>
      </linearGradient>
      <pattern id="nxf-scan" width="6" height="3" patternUnits="userSpaceOnUse">
        <rect width="6" height="1" class="g-scan"/>
      </pattern>
      <radialGradient id="nxf-disk" cx="0.5" cy="0.42" r="0.62">
        <stop offset="0" class="g-disk-a"/>
        <stop offset="1" class="g-disk-b"/>
      </radialGradient>
      <radialGradient id="nxf-rim" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.7" class="g-rim" stop-opacity="0"/>
        <stop offset="0.93" class="g-rim" stop-opacity="0.16"/>
        <stop offset="1" class="g-rim" stop-opacity="0.42"/>
      </radialGradient>
      <linearGradient id="nxf-heart" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffc2d6"/>
        <stop offset="0.5" stop-color="#ff5f97"/>
        <stop offset="1" stop-color="#e3266a"/>
      </linearGradient>
      <linearGradient id="nxf-crystal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e6fdff"/>
        <stop offset="0.45" stop-color="#6fe9ff"/>
        <stop offset="1" stop-color="#1d9fd8"/>
      </linearGradient>
      <linearGradient id="nxf-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffbe0"/>
        <stop offset="1" stop-color="#ffd23f"/>
      </linearGradient>
      ${patternDefs()}
      ${maskDefs()}
    </defs>`
  return svg
}

/** 共有の定義のうち、画面の px で描くもの（枠の模様・にじみ）を拡大率に合わせる */
export function scaleDefs(defs: SVGSVGElement, s: number): void {
  defs.querySelectorAll<SVGPatternElement>('pattern[data-scaled]').forEach((p) => p.setAttribute('patternTransform', `scale(${s.toFixed(4)})`))
  defs.querySelectorAll<SVGFEGaussianBlurElement>('feGaussianBlur[data-sd]').forEach((b) => b.setAttribute('stdDeviation', (Number(b.dataset.sd) * Math.max(0.35, s)).toFixed(2)))
}

/**
 * 枠の描き直しをまとめて受け持つ。host（.nx-frame-host）を登録すると、
 * その大きさで SVG を作り、大きさが変わるたびに描き直す。
 */
export class FrameManager {
  private readonly hosts = new Map<HTMLElement, { spec: FrameSpec; svg: SVGSVGElement; w: number; h: number }>()
  private readonly ro: ResizeObserver | null
  private scale = 1

  constructor() {
    this.scale = typeof window !== 'undefined' ? hudScale() : 1
    this.ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver((entries) => {
            for (const e of entries) this.draw(e.target as HTMLElement)
          })
        : null
  }

  get currentScale(): number {
    return this.scale
  }

  /** host の data-frame（FRAME_SPECS のキー）か、渡した spec で枠を付ける */
  attach(host: HTMLElement, spec?: FrameSpec): void {
    const sp = spec ?? FRAME_SPECS[host.dataset.frame ?? 'panel'] ?? FRAME_SPECS.panel
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'nx-frame')
    svg.setAttribute('aria-hidden', 'true')
    host.appendChild(svg)
    this.hosts.set(host, { spec: sp, svg, w: 0, h: 0 })
    this.ro?.observe(host)
    this.draw(host)
  }

  /** root の中の .nx-frame-host を全部登録 */
  attachAll(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('.nx-frame-host').forEach((h) => {
      if (!this.hosts.has(h)) this.attach(h)
    })
  }

  /** 画面から外れた host（作り直したキー案内など）を手放す */
  prune(): void {
    for (const h of [...this.hosts.keys()]) {
      if (h.isConnected) continue
      this.ro?.unobserve(h)
      this.hosts.delete(h)
    }
  }

  /** 拡大率を直接指定して全部描き直す（HUD がルート要素の大きさから求めた値） */
  setScale(s: number): void {
    if (!(s > 0) || Math.abs(s - this.scale) < 1e-4) return
    this.scale = s
    for (const h of this.hosts.keys()) this.draw(h, true)
  }

  /** 画面の大きさが変わったとき（拡大率が変わる）に全部描き直す */
  rescale(): void {
    this.setScale(hudScale())
  }

  private draw(host: HTMLElement, force = false): void {
    const rec = this.hosts.get(host)
    if (!rec) return
    const w = host.clientWidth
    const h = host.clientHeight
    if (w < 2 || h < 2) return
    if (!force && Math.abs(w - rec.w) < 0.5 && Math.abs(h - rec.h) < 0.5) return
    rec.w = w
    rec.h = h
    rec.svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
    rec.svg.setAttribute('width', String(w))
    rec.svg.setAttribute('height', String(h))
    rec.svg.innerHTML = frameMarkup(w, h, rec.spec, this.scale)
  }

  dispose(): void {
    this.ro?.disconnect()
    this.hosts.clear()
  }
}
