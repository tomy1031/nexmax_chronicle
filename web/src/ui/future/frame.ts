// ホログラムの枠（角を落としたガラスのパネル＋光る細い線）を SVG で描く。
// 要素の大きさが変わったら（ResizeObserver）その大きさで描き直すので、角の形がゆがまない。
// 色は CSS 変数（--nx-line / --nx-line-hi / --nx-line-dim）で変えられる（話者ごとの色など）。
// 光のにじみ・ガラスの塗り・走査線は、HUD に 1 つだけ置く <defs>（frameDefs()）を共有する。

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
  /** 角の明るく太い線 */
  accents?: boolean
  /** 下の内側の小さな目盛り */
  ticks?: boolean
  /** ガラスの塗り（既定 true） */
  fill?: boolean
  /** 走査線（既定 true） */
  scan?: boolean
}

export const FRAME_SPECS: Record<string, FrameSpec> = {
  // 会話ウィンドウ：四隅を落とした大きなパネル
  dialog: { cuts: [16, 16, 16, 16], outer: true, inner: true, accents: true, ticks: true },
  // 目的のパネル：左をとがらせる
  objective: { cuts: [14, 14, 14, 14], pointL: 18, outer: true, inner: true, accents: true },
  // 時代と場所の札・名札・キー案内：両端をとがらせた細長い六角形
  plate: { cuts: [0, 0, 0, 0], pointL: 14, pointR: 14, inner: false, accents: true },
  plateSmall: { cuts: [0, 0, 0, 0], pointL: 10, pointR: 10, accents: false },
  // 体力・エネルギーの帯：右端を矢印のようにとがらせる
  bar: { cuts: [0, 0, 0, 0], pointL: 0, pointR: 16, inner: true, accents: true },
  // コンパス：両端を深くとがらせる
  compass: { cuts: [0, 0, 0, 0], pointL: 22, pointR: 22, outer: true, inner: true, accents: true },
  // 汎用のパネル（一時停止・メニュー・水門・IDO）
  panel: { cuts: [18, 18, 18, 18], outer: true, inner: true, accents: true, ticks: true },
  card: { cuts: [12, 12, 12, 12], inner: true, accents: true },
  // お知らせ
  toast: { cuts: [10, 10, 10, 10], pointL: 0, pointR: 0, accents: true },
}

const NS = 'http://www.w3.org/2000/svg'

/** 画面の大きさに合わせた拡大率（CSS の --nx-px と同じ式：1600×900 を基準） */
export function hudScale(w = window.innerWidth, h = window.innerHeight): number {
  return Math.min(1.2, Math.max(0.7, Math.min(w / 1600, h / 900)))
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

/** 枠の SVG の中身（文字列）。w, h は CSS px */
export function frameMarkup(w: number, h: number, spec: FrameSpec, s: number): string {
  const lw = Math.max(1.4, 2.1 * s)
  const main = framePolygon(w, h, spec, s, lw / 2)
  const parts: string[] = []
  const fillD = pathOf(framePolygon(w, h, spec, s, lw))
  if (spec.fill !== false) parts.push(`<path class="nx-f-fill" d="${fillD}"/>`)
  if (spec.scan !== false && spec.fill !== false) parts.push(`<path class="nx-f-scan" d="${fillD}"/>`)
  if (spec.inner) parts.push(`<path class="nx-f-inner" d="${pathOf(framePolygon(w, h, spec, s, 4.5 * s))}" stroke-width="${f1(Math.max(0.8, 0.9 * s))}"/>`)
  // 光る線（にじみ付き）
  const glow: string[] = [`<path class="nx-f-line" d="${pathOf(main)}" stroke-width="${f1(lw)}"/>`]
  if (spec.accents) glow.push(`<path class="nx-f-acc" d="${accentPath(w, h, spec, s, lw)}" stroke-width="${f1(Math.max(2, 3 * s))}"/>`)
  parts.push(`<g class="nx-f-glow" filter="url(#nxf-glow)">${glow.join('')}</g>`)
  if (spec.outer) parts.push(`<path class="nx-f-outer" d="${outerPath(w, h, spec, s)}" stroke-width="${f1(Math.max(0.8, 1 * s))}"/>`)
  if (spec.ticks) parts.push(`<path class="nx-f-ticks" d="${ticksPath(w, h, spec, s)}" stroke-width="${f1(Math.max(1, 1.2 * s))}"/>`)
  return parts.join('')
}

/** 角の明るい線：左上と右下（とがった端ならその斜め） */
function accentPath(w: number, h: number, spec: FrameSpec, s: number, lw: number): string {
  const d = lw / 2
  const out: string[] = []
  const pl = (spec.pointL ?? 0) * s
  const pr = (spec.pointR ?? 0) * s
  const [ctl, , cbr] = spec.cuts.map((v) => v * s)
  const len = Math.min(w * 0.18, 46 * s)
  if (pl > 0) {
    // 左のとがり：上半分の斜め＋上の辺へ少し
    out.push(`M${f1(d + pl * 0.15)} ${f1(h / 2 - (h / 2 - d) * 0.15)}L${f1(d + pl)} ${f1(d)}L${f1(d + pl + len * 0.6)} ${f1(d)}`)
  } else if (ctl > 0) {
    out.push(`M${f1(d)} ${f1(d + ctl + len * 0.35)}L${f1(d)} ${f1(d + ctl)}L${f1(d + ctl)} ${f1(d)}L${f1(d + ctl + len)} ${f1(d)}`)
  } else {
    out.push(`M${f1(d)} ${f1(d + len * 0.5)}L${f1(d)} ${f1(d)}L${f1(d + len)} ${f1(d)}`)
  }
  if (pr > 0) {
    out.push(`M${f1(w - d - pr - len * 0.6)} ${f1(h - d)}L${f1(w - d - pr)} ${f1(h - d)}L${f1(w - d - pr * 0.15)} ${f1(h / 2 + (h / 2 - d) * 0.15)}`)
  } else if (cbr > 0) {
    out.push(`M${f1(w - d)} ${f1(h - d - cbr - len * 0.35)}L${f1(w - d)} ${f1(h - d - cbr)}L${f1(w - d - cbr)} ${f1(h - d)}L${f1(w - d - cbr - len)} ${f1(h - d)}`)
  } else {
    out.push(`M${f1(w - d)} ${f1(h - d - len * 0.5)}L${f1(w - d)} ${f1(h - d)}L${f1(w - d - len)} ${f1(h - d)}`)
  }
  return out.join('')
}

/** 外側に少し離した細い線（上の右寄りと、下の左寄り） */
function outerPath(w: number, h: number, spec: FrameSpec, s: number): string {
  const o = 5 * s
  const [, ctr, , cbl] = spec.cuts.map((v) => v * s)
  const pr = (spec.pointR ?? 0) * s
  const pl = (spec.pointL ?? 0) * s
  const out: string[] = []
  const rTop = pr > 0 ? w - pr : w - ctr
  out.push(`M${f1(w * 0.56)} ${f1(-o)}L${f1(rTop + o * 0.4)} ${f1(-o)}L${f1(pr > 0 ? w + o * 0.2 - pr * 0.45 : w + o)} ${f1(pr > 0 ? h * 0.22 - o : ctr - o * 0.4)}`)
  const lBot = pl > 0 ? pl : cbl
  out.push(`M${f1(pl > 0 ? pl * 0.45 - o * 0.2 : -o)} ${f1(pl > 0 ? h * 0.78 + o : h - cbl + o * 0.4)}L${f1(lBot - o * 0.4)} ${f1(h + o)}L${f1(Math.max(lBot + 20 * s, w * 0.3))} ${f1(h + o)}`)
  return out.join('')
}

/** 下の内側の小さな目盛り（右寄り） */
function ticksPath(w: number, h: number, spec: FrameSpec, s: number): string {
  const cbr = spec.cuts[2] * s
  const gap = 6 * s
  const n = 6
  const x1 = w - cbr - 14 * s
  const y = h - 7 * s
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const x = x1 - i * gap
    out.push(`M${f1(x)} ${f1(y)}L${f1(x)} ${f1(y - (i % 3 === 0 ? 5 : 3) * s)}`)
  }
  return out.join('')
}

/** HUD に 1 つだけ置く共有の定義（光のにじみ・ガラス・走査線） */
export function frameDefs(): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'nx-defs')
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = `
    <defs>
      <filter id="nxf-glow" x="-10%" y="-60%" width="120%" height="220%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="2.6" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="nxf-glow-soft" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3.2" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <linearGradient id="nxf-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#1767c0" stop-opacity="0.70"/>
        <stop offset="0.5" stop-color="#0d4c9c" stop-opacity="0.74"/>
        <stop offset="1" stop-color="#083274" stop-opacity="0.82"/>
      </linearGradient>
      <linearGradient id="nxf-glass-deep" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#0f3f80" stop-opacity="0.86"/>
        <stop offset="1" stop-color="#071f4c" stop-opacity="0.92"/>
      </linearGradient>
      <pattern id="nxf-scan" width="6" height="3" patternUnits="userSpaceOnUse">
        <rect width="6" height="1" fill="#9fe8ff" fill-opacity="0.055"/>
      </pattern>
      <radialGradient id="nxf-disk" cx="0.5" cy="0.42" r="0.6">
        <stop offset="0" stop-color="#14498f" stop-opacity="0.92"/>
        <stop offset="1" stop-color="#071d48" stop-opacity="0.9"/>
      </radialGradient>
      <linearGradient id="nxf-heart" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ff9fb4"/>
        <stop offset="0.55" stop-color="#ff5c80"/>
        <stop offset="1" stop-color="#e8325e"/>
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
    </defs>`
  return svg
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

  /** 画面の大きさが変わったとき（拡大率が変わる）に全部描き直す */
  rescale(): void {
    const s = hudScale()
    if (Math.abs(s - this.scale) < 1e-3) return
    this.scale = s
    for (const h of this.hosts.keys()) this.draw(h, true)
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
