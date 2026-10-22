// 源兵衛の書（ひらいた本）のページの絵。和紙に墨の線と藍の色。日本の本なので、1 ページ目が右、2 ページ目が左。
// ・1 ページ目「青い刃のかけら」：源兵衛の家に伝わる、青い刃のかけらの絵（2026年のかんばんの記録にうつっているページ）
// ・2 ページ目「時を裂く爪」：7 章で源兵衛があとから、さらさらと描く絵（小さな青いからくりが、爪で空に切れ目を入れている）
//   t（0〜1）で描きかけを描ける（線を順に引き、色をのせ、最後に字と印）
// 2026年・2086年の記録の画面（IDO の記録）にも同じ絵を使えるよう、ページ 1 枚のキャンバスも作れる（makePageCanvas）。
import { drawLettering, makeCanvas } from '../../../render/textures'

export type PageKind = 'fragment' | 'claw'

const INK = '#1e1a18'
const AI = 'rgba(46,110,196,'
const SHU = '#c8392b'

type Pt = [number, number]

/** 筆の線：点列（ページの 0〜1 の座標）を、太さを少し変えながら途中（p）まで引く */
function brush(g: CanvasRenderingContext2D, pts: Pt[], x: number, y: number, w: number, h: number, width: number, p: number, ink = INK): void {
  if (p <= 0 || pts.length < 2) return
  const n = pts.length - 1
  const upto = Math.min(n, p * n)
  g.strokeStyle = ink
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (let i = 0; i < upto; i++) {
    const k = Math.min(1, upto - i)
    const a = pts[i]
    const b = pts[i + 1]
    // 入りと抜きは細く、まんなかは太く
    const s = i / n
    g.lineWidth = Math.max(0.6, width * (0.45 + 0.75 * Math.sin(Math.PI * Math.min(1, s * 1.15 + 0.05))))
    g.beginPath()
    g.moveTo(x + a[0] * w, y + a[1] * h)
    g.lineTo(x + (a[0] + (b[0] - a[0]) * k) * w, y + (a[1] + (b[1] - a[1]) * k) * h)
    g.stroke()
  }
}

/** 楕円の点列 */
function ellipse(cx: number, cy: number, rx: number, ry: number, a0 = 0, a1 = Math.PI * 2, n = 28): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry])
  }
  return out
}

/** 2 次ベジェの点列 */
function quad(a: Pt, c: Pt, b: Pt, n = 14): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]])
  }
  return out
}

function line(a: Pt, b: Pt, n = 6): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n])
  return out
}

/** 塗り（藍のにじみ）。alpha は 0〜1 */
function wash(g: CanvasRenderingContext2D, pts: Pt[], x: number, y: number, w: number, h: number, color: string, alpha: number): void {
  if (alpha <= 0) return
  g.beginPath()
  pts.forEach((p, i) => (i ? g.lineTo(x + p[0] * w, y + p[1] * h) : g.moveTo(x + p[0] * w, y + p[1] * h)))
  g.closePath()
  g.fillStyle = color + (0.55 * alpha).toFixed(3) + ')'
  g.fill()
  // ふちのにじみ（少し濃く）
  g.lineWidth = Math.max(1, w * 0.012)
  g.strokeStyle = color + (0.35 * alpha).toFixed(3) + ')'
  g.stroke()
}

/** 落款（朱の四角い印に白抜きの「源」） */
function seal(g: CanvasRenderingContext2D, x: number, y: number, s: number, alpha = 1): void {
  if (alpha <= 0) return
  g.save()
  g.globalAlpha = alpha * 0.92
  g.fillStyle = SHU
  g.fillRect(x, y, s, s)
  g.globalAlpha = alpha
  drawLettering(g, { text: '源', vertical: true, x: x + s * 0.08, y: y + s * 0.06, w: s * 0.84, h: s * 0.88, ink: '#fbeee0', face: 'kaisho', bold: 0 })
  g.restore()
}

/** 和紙の地（生成り・繊維・しみ・薄い枠） */
export function paintPaper(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed = 1): void {
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const gr = g.createLinearGradient(x, y, x + w, y + h)
  gr.addColorStop(0, '#f6ecd4')
  gr.addColorStop(1, '#efe2c4')
  g.fillStyle = gr
  g.fillRect(x, y, w, h)
  // 繊維
  for (let i = 0; i < 160; i++) {
    const px = x + rnd() * w
    const py = y + rnd() * h
    const a = rnd() * Math.PI
    const l = 4 + rnd() * 14
    g.strokeStyle = `rgba(150,120,80,${0.05 + rnd() * 0.08})`
    g.lineWidth = 0.6 + rnd()
    g.beginPath()
    g.moveTo(px, py)
    g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l)
    g.stroke()
  }
  // 古いしみ
  for (let i = 0; i < 6; i++) {
    const r = w * (0.04 + rnd() * 0.08)
    const sx = x + rnd() * w
    const sy = y + rnd() * h
    const rg = g.createRadialGradient(sx, sy, 0, sx, sy, r)
    rg.addColorStop(0, 'rgba(190,150,90,0.10)')
    rg.addColorStop(1, 'rgba(190,150,90,0)')
    g.fillStyle = rg
    g.fillRect(x, y, w, h)
  }
  // 薄い枠
  g.strokeStyle = 'rgba(60,40,30,0.35)'
  g.lineWidth = Math.max(1, w * 0.006)
  g.strokeRect(x + w * 0.06, y + h * 0.05, w * 0.88, h * 0.9)
}

// ---------------------------------------------------------------- 1 ページ目：青い刃のかけら

const SHARD: Pt[] = [
  [0.3, 0.62],
  [0.42, 0.34],
  [0.56, 0.22],
  [0.54, 0.35],
  [0.62, 0.4],
  [0.5, 0.58],
  [0.44, 0.7],
  [0.36, 0.72],
]

function paintFragment(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  // かけら（藍の塗り → 墨の輪郭 → 面の筋）
  wash(g, SHARD, x, y, w, h, AI, 1)
  brush(g, [...SHARD, SHARD[0]], x, y, w, h, w * 0.012, 1)
  brush(g, line([0.42, 0.34], [0.44, 0.7]), x, y, w, h, w * 0.006, 1)
  brush(g, line([0.56, 0.22], [0.5, 0.58]), x, y, w, h, w * 0.005, 1)
  // 光（まわりの短い線）
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 + ((i - 4) / 4) * 1.3
    const cx = 0.46
    const cy = 0.46
    brush(g, line([cx + Math.cos(a) * 0.26, cy + Math.sin(a) * 0.3], [cx + Math.cos(a) * 0.33, cy + Math.sin(a) * 0.38], 3), x, y, w, h, w * 0.006, 1)
  }
  // 音の波（コチ、コチ）
  for (let k = 0; k < 3; k++) brush(g, ellipse(0.66, 0.6, 0.05 + k * 0.035, 0.07 + k * 0.045, -0.9, 0.9, 10), x, y, w, h, w * 0.005, 1)
  // 字（右の列から：題・説明）
  drawLettering(g, { text: '青い刃のかけら', vertical: true, x: x + w * 0.76, y: y + h * 0.08, w: w * 0.14, h: h * 0.62, ink: INK, face: 'kaisho', maxSize: w * 0.12 })
  drawLettering(g, { text: '空の怪物を裂く\nコチ、コチと鳴る', vertical: true, x: x + w * 0.08, y: y + h * 0.08, w: w * 0.16, h: h * 0.5, ink: '#3a3028', face: 'kaisho', maxSize: w * 0.07, bold: 0.02 })
  seal(g, x + w * 0.1, y + h * 0.84, w * 0.08)
}

// ---------------------------------------------------------------- 2 ページ目：時を裂く爪（描きかけ t）

type Op = { at: number; dur: number; draw: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, p: number) => void }

/** ロボットの位置と大きさ（ページの座標） */
const R = { cx: 0.36, cy: 0.66, s: 0.2 }
const rp = (dx: number, dy: number): Pt => [R.cx + dx * R.s, R.cy + dy * R.s * 0.72]

const CLAW_OPS: Op[] = (() => {
  const ops: Op[] = []
  let t = 0
  const add = (dur: number, draw: Op['draw']) => {
    ops.push({ at: t, dur, draw })
    t += dur
  }
  const stroke = (pts: Pt[], wk: number, dur: number) => add(dur, (g, x, y, w, h, p) => brush(g, pts, x, y, w, h, w * wk, p))
  // 頭（大きな丸）と顔の板
  stroke(ellipse(R.cx, R.cy - R.s * 0.5, R.s * 0.5, R.s * 0.38, Math.PI * 0.6, Math.PI * 2.6, 30), 0.011, 1.2)
  stroke([...quad(rp(-0.34, -0.66), rp(0, -0.78), rp(0.34, -0.66)), ...quad(rp(0.34, -0.66), rp(0.36, -0.36), rp(0, -0.34)), ...quad(rp(0, -0.34), rp(-0.36, -0.36), rp(-0.34, -0.66))], 0.008, 1.0)
  // 目
  add(0.4, (g, x, y, w, h, p) => {
    g.fillStyle = INK
    for (const e of [-1, 1]) {
      g.globalAlpha = Math.min(1, p * 2)
      g.beginPath()
      g.ellipse(x + (R.cx + e * R.s * 0.13) * w, y + (R.cy - R.s * 0.38) * h, w * 0.012, h * 0.011, 0, 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
  })
  // 体と足
  stroke([...quad(rp(-0.18, 0.02), rp(-0.26, 0.4), rp(-0.14, 0.62)), ...line(rp(-0.14, 0.62), rp(0.14, 0.62), 3), ...quad(rp(0.14, 0.62), rp(0.26, 0.4), rp(0.18, 0.02))], 0.009, 0.9)
  stroke(line(rp(-0.08, 0.62), rp(-0.1, 0.92), 4), 0.008, 0.3)
  stroke(line(rp(0.08, 0.62), rp(0.1, 0.92), 4), 0.008, 0.3)
  // 左手（下へ）と、右手（上へのばしてクロー）
  stroke(quad(rp(-0.2, 0.12), rp(-0.42, 0.3), rp(-0.36, 0.52)), 0.008, 0.35)
  stroke(quad(rp(0.2, 0.1), rp(0.5, 0.0), rp(0.78, -0.42)), 0.009, 0.5)
  // クロー（3 本の爪）
  stroke(quad(rp(0.78, -0.42), rp(0.9, -0.62), rp(0.84, -0.8)), 0.008, 0.25)
  stroke(quad(rp(0.78, -0.42), rp(1.0, -0.5), rp(1.06, -0.66)), 0.008, 0.25)
  stroke(quad(rp(0.78, -0.42), rp(0.7, -0.62), rp(0.62, -0.7)), 0.008, 0.25)
  // 藍の色（頭・体）
  add(0.8, (g, x, y, w, h, p) => {
    wash(g, ellipse(R.cx, R.cy - R.s * 0.5, R.s * 0.5, R.s * 0.38, 0, Math.PI * 2, 24), x, y, w, h, AI, p * 0.9)
    wash(g, [...quad(rp(-0.18, 0.02), rp(-0.26, 0.4), rp(-0.14, 0.62)), ...quad(rp(0.14, 0.62), rp(0.26, 0.4), rp(0.18, 0.02))], x, y, w, h, AI, p * 0.8)
  })
  // 空の切れ目（爪の先から右上へ、細い裂け目）と、その向こうの黒いもの
  const slitA: Pt = [0.52, 0.42]
  const slitB: Pt = [0.86, 0.1]
  stroke(line(slitA, slitB, 16), 0.006, 0.7)
  add(0.6, (g, x, y, w, h, p) => {
    const mx = (slitA[0] + slitB[0]) / 2
    const my = (slitA[1] + slitB[1]) / 2
    const nx = -(slitB[1] - slitA[1])
    const ny = slitB[0] - slitA[0]
    const nl = Math.hypot(nx, ny)
    const k = 0.035 * p
    const lens: Pt[] = [slitA, [mx + (nx / nl) * k, my + (ny / nl) * k], slitB, [mx - (nx / nl) * k, my - (ny / nl) * k]]
    g.beginPath()
    lens.forEach((q, i) => (i ? g.quadraticCurveTo(x + q[0] * w, y + q[1] * h, x + q[0] * w, y + q[1] * h) : g.moveTo(x + q[0] * w, y + q[1] * h)))
    g.closePath()
    g.fillStyle = `rgba(20,16,24,${0.85 * p})`
    g.fill()
    // 向こうの黒いもの（うねる線）
    g.globalAlpha = p
    brush(g, quad([mx - 0.05, my + 0.02], [mx, my - 0.06], [mx + 0.06, my - 0.02], 8), x, y, w, h, w * 0.01, 1, '#000')
    g.globalAlpha = 1
  })
  // 光の線（切れ目のふち）
  add(0.5, (g, x, y, w, h, p) => {
    for (let i = 0; i < 5; i++) {
      const s = 0.15 + i * 0.17
      const px = slitA[0] + (slitB[0] - slitA[0]) * s
      const py = slitA[1] + (slitB[1] - slitA[1]) * s
      brush(g, line([px + 0.02, py + 0.03], [px + 0.05, py + 0.06], 2), x, y, w, h, w * 0.004, p)
    }
  })
  // 題の字と印
  add(0.8, (g, x, y, w, h, p) => {
    g.save()
    g.globalAlpha = Math.min(1, p * 1.4)
    drawLettering(g, { text: '時を裂く爪', vertical: true, x: x + w * 0.76, y: y + h * 0.08, w: w * 0.14, h: h * 0.5, ink: INK, face: 'kaisho', maxSize: w * 0.13 })
    g.restore()
  })
  add(0.3, (g, x, y, w, h, p) => seal(g, x + w * 0.8, y + h * 0.84, w * 0.08, p))
  // 合計を 1 に
  for (const o of ops) {
    o.at /= t
    o.dur /= t
  }
  return ops
})()

function paintClaw(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number): void {
  for (const o of CLAW_OPS) {
    const p = Math.min(1, Math.max(0, (t - o.at) / o.dur))
    if (p > 0) o.draw(g, x, y, w, h, p)
  }
}

/** ページの絵を (x,y,w,h) に描く。claw の t は描きかけの割合 */
export function paintPage(g: CanvasRenderingContext2D, kind: PageKind, x: number, y: number, w: number, h: number, t = 1): void {
  paintPaper(g, x, y, w, h, kind === 'fragment' ? 3 : 7)
  if (kind === 'fragment') paintFragment(g, x, y, w, h)
  else paintClaw(g, x, y, w, h, t)
}

/** 見開き（右＝1 ページ目、左＝2 ページ目）。clawT は 2 ページ目の描きかけ（0 なら白紙） */
export function paintSpread(g: CanvasRenderingContext2D, w: number, h: number, clawT: number): void {
  g.clearRect(0, 0, w, h)
  paintPage(g, 'claw', 0, 0, w / 2, h, clawT)
  paintPage(g, 'fragment', w / 2, 0, w / 2, h, 1)
  // のど（真ん中の影）
  const gr = g.createLinearGradient(w / 2 - w * 0.04, 0, w / 2 + w * 0.04, 0)
  gr.addColorStop(0, 'rgba(80,60,40,0)')
  gr.addColorStop(0.5, 'rgba(80,60,40,0.28)')
  gr.addColorStop(1, 'rgba(80,60,40,0)')
  g.fillStyle = gr
  g.fillRect(w / 2 - w * 0.04, 0, w * 0.08, h)
}

/** ページ 1 枚のキャンバス（IDO の記録の画面・壁の掛け軸などに） */
export function makePageCanvas(kind: PageKind, width = 512): HTMLCanvasElement {
  const h = Math.round(width * 1.4)
  const [c, g] = makeCanvas(width, h)
  paintPage(g, kind, 0, 0, width, h, 1)
  return c
}
