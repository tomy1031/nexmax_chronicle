// 1186年 クメールの都のテクスチャ（キャンバスで描く。外部の画像は使わない）。
// ・砂岩の切り石（横に段を重ねた石積み）・ラテライト（赤い穴あきの石）
// ・浮き彫り：物語の絵（人の背より大きな青い石・黒い輪の怪物・刃を持った女の子）と、踊り子の行列のくり返し
// ・ヤシの葉の屋根・竹の編み壁・クロマー（チェックの布）・ヤシの葉（カード）・地面の色分け（赤土の道・草・砂）
import { heightToNormal, makeCanvas } from '../../render/textures'
import { TileNoise, mulberry32, range, type Rng } from '../../render/noise'
import { K, LAND_HOUSES, WATER_HOUSES, WALK_RAMP, type Rect } from './layout'

const noise = new TileNoise(1186)
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export type PaintedKhmer = { color: HTMLCanvasElement; normal?: HTMLCanvasElement }

/** グレーのキャンバス（高さ）を配列へ */
function readHeight(c: HTMLCanvasElement): Float32Array {
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const out = new Float32Array(c.width * c.height)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255
  return out
}

/** 高さから陰影を焼きこむ（左上から光。浮き彫りを遠くからでも読めるように） */
function bakeShade(color: HTMLCanvasElement, h: Float32Array, strength: number, ao = 0.35): void {
  const w = color.width
  const hh = color.height
  const ctx = color.getContext('2d') as CanvasRenderingContext2D
  const img = ctx.getImageData(0, 0, w, hh)
  const d = img.data
  for (let y = 0; y < hh; y++) {
    const ym = Math.max(0, y - 1) * w
    const yp = Math.min(hh - 1, y + 1) * w
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const i = y * w + x
      const dx = (h[y * w + xp] - h[y * w + xm]) * strength
      const dy = (h[yp + x] - h[ym + x]) * strength
      // 左上からの光：左上を向く面が明るい
      const lit = clamp01(0.62 - dx * 0.55 - dy * 0.55)
      const k = (0.62 + lit * 0.62) * (1 - ao + ao * h[i])
      d[i * 4] = Math.min(255, d[i * 4] * k)
      d[i * 4 + 1] = Math.min(255, d[i * 4 + 1] * k)
      d[i * 4 + 2] = Math.min(255, d[i * 4 + 2] * k)
    }
  }
  ctx.putImageData(img, 0, 0)
}

/** 図形を描く（ふちのぼかしは、最後に blurInPlace でまとめて 1 回かける。図形ごとにぼかすと重い） */
function softFill(_ctx: CanvasRenderingContext2D, _blur: number, draw: () => void): void {
  draw()
}

/** キャンバス全体を 1 回だけぼかす（高さのふちをなだらかに） */
function blurInPlace(c: HTMLCanvasElement, px: number): void {
  const [t, tg] = makeCanvas(c.width, c.height)
  tg.filter = `blur(${px}px)`
  tg.drawImage(c, 0, 0)
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.clearRect(0, 0, c.width, c.height)
  g.drawImage(t, 0, 0)
}

// ------------------------------------------------------------------ 砂岩の切り石

/** 砂岩の切り石：段（高さ 1/6）ごとに長さのちがう石を並べる。色むら・すり減った角・こけの筋 */
export function paintAshlar(S = 1024, seed = 7): PaintedKhmer {
  const rng = mulberry32(seed)
  const [c, g] = makeCanvas(S)
  const [hc, hg] = makeCanvas(S)
  hg.fillStyle = '#000'
  hg.fillRect(0, 0, S, S)
  const rows = 6
  const rh = S / rows
  for (let r = 0; r < rows; r++) {
    let x = -range(rng, 0, rh * 1.5)
    const y = r * rh
    while (x < S) {
      const w = range(rng, rh * 1.1, rh * 2.6)
      const l = range(rng, 0.62, 0.78)
      const hue = range(rng, 28, 42)
      const sat = range(rng, 0.1, 0.22)
      // 石（ラップして描く）
      for (const ox of [0, -S, S]) {
        const x0 = x + ox
        if (x0 + w < 0 || x0 > S) continue
        g.fillStyle = `hsl(${hue},${(sat * 100).toFixed(0)}%,${(l * 100).toFixed(0)}%)`
        g.fillRect(x0, y, w, rh)
        // 石の中の筋（砂岩の層）
        for (let k = 0; k < 5; k++) {
          g.fillStyle = `rgba(${rng() < 0.5 ? '255,240,220' : '90,70,50'},${range(rng, 0.03, 0.08)})`
          g.fillRect(x0, y + range(rng, 0, rh), w, range(rng, 1, 4))
        }
        // 高さ：石は 1、角を丸く
        hg.fillStyle = '#fff'
        softFill(hg, 2.5, () => hg.fillRect(x0 + 3, y + 3, w - 6, rh - 6))
      }
      x += w
    }
  }
  // 細かいざらつき・欠け・こけの筋
  for (let i = 0; i < 9000; i++) {
    const x = rng() * S
    const y = rng() * S
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,250,235' : '50,40,30'},${range(rng, 0.03, 0.09)})`
    g.fillRect(x, y, range(rng, 1, 3), range(rng, 1, 3))
  }
  for (let i = 0; i < 160; i++) {
    const x = rng() * S
    const y = rng() * S
    hg.fillStyle = `rgba(0,0,0,${range(rng, 0.2, 0.6)})`
    hg.beginPath()
    hg.arc(x, y, range(rng, 1.5, 6), 0, Math.PI * 2)
    hg.fill()
  }
  for (let i = 0; i < 26; i++) {
    const x = rng() * S
    const grad = g.createLinearGradient(x, 0, x, S)
    grad.addColorStop(0, 'rgba(40,46,30,0.0)')
    grad.addColorStop(0.5, `rgba(40,46,30,${range(rng, 0.06, 0.16)})`)
    grad.addColorStop(1, 'rgba(40,46,30,0)')
    g.fillStyle = grad
    const y0 = rng() * S
    g.fillRect(x, y0, range(rng, 6, 22), range(rng, S * 0.2, S * 0.6))
  }
  blurInPlace(hc, 2.5)
  const H = readHeight(hc)
  bakeShade(c, H, 2.2, 0.28)
  return { color: c, normal: heightToNormal(H, S, S, 3.2) }
}

/** ラテライト（赤茶色の、穴の多い石）。塀・基礎に */
export function paintLaterite(S = 512, seed = 11): PaintedKhmer {
  const rng = mulberry32(seed)
  const [c, g] = makeCanvas(S)
  const [hc, hg] = makeCanvas(S)
  hg.fillStyle = '#000'
  hg.fillRect(0, 0, S, S)
  const rows = 4
  const rh = S / rows
  for (let r = 0; r < rows; r++) {
    let x = -range(rng, 0, rh)
    while (x < S) {
      const w = range(rng, rh * 1.0, rh * 1.8)
      for (const ox of [0, -S, S]) {
        const x0 = x + ox
        g.fillStyle = `hsl(${range(rng, 10, 22)},${range(rng, 38, 52)}%,${range(rng, 36, 46)}%)`
        g.fillRect(x0, r * rh, w, rh)
        hg.fillStyle = '#ddd'
        softFill(hg, 2, () => hg.fillRect(x0 + 3, r * rh + 3, w - 6, rh - 6))
      }
      x += w
    }
  }
  // 穴（ラテライトのぶつぶつ）
  for (let i = 0; i < 2600; i++) {
    const x = rng() * S
    const y = rng() * S
    const rr = range(rng, 0.8, 3.2)
    g.fillStyle = `rgba(40,16,8,${range(rng, 0.35, 0.7)})`
    g.beginPath()
    g.arc(x, y, rr, 0, Math.PI * 2)
    g.fill()
    hg.fillStyle = 'rgba(0,0,0,0.7)'
    hg.beginPath()
    hg.arc(x, y, rr, 0, Math.PI * 2)
    hg.fill()
  }
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(255,${180 + rng() * 60},120,${range(rng, 0.04, 0.12)})`
    g.fillRect(rng() * S, rng() * S, 2, 2)
  }
  blurInPlace(hc, 2)
  const H = readHeight(hc)
  bakeShade(c, H, 1.6, 0.2)
  return { color: c, normal: heightToNormal(H, S, S, 2.6) }
}

// ------------------------------------------------------------------ 浮き彫り

type Pose = 'pray' | 'dance' | 'reach' | 'blade' | 'walk' | 'carry' | 'kneel'

/** 人の形（浮き彫りの人物）。x, y は足もと、s は背の高さ（px）、dir は向き（1：右向き） */
function figure(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, pose: Pose, dir = 1, crown = true): void {
  const u = s / 10
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(dir, 1)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const kneel = pose === 'kneel'
  const hipY = kneel ? -3.4 * u : -4.6 * u
  // 足
  ctx.lineWidth = 1.05 * u
  ctx.beginPath()
  if (pose === 'dance') {
    ctx.moveTo(-0.4 * u, hipY)
    ctx.lineTo(-0.9 * u, -2.2 * u)
    ctx.lineTo(-0.6 * u, 0)
    ctx.moveTo(0.4 * u, hipY)
    ctx.lineTo(2.1 * u, -3.0 * u)
    ctx.lineTo(1.2 * u, -1.6 * u)
  } else if (pose === 'walk' || pose === 'carry' || pose === 'blade') {
    ctx.moveTo(-0.3 * u, hipY)
    ctx.lineTo(-1.4 * u, 0)
    ctx.moveTo(0.3 * u, hipY)
    ctx.lineTo(1.5 * u, -0.2 * u)
  } else if (kneel) {
    ctx.moveTo(-0.3 * u, hipY)
    ctx.lineTo(-1.8 * u, -1.6 * u)
    ctx.lineTo(-2.4 * u, 0)
    ctx.moveTo(0.3 * u, hipY)
    ctx.lineTo(1.3 * u, 0)
  } else {
    ctx.moveTo(-0.4 * u, hipY)
    ctx.lineTo(-0.6 * u, 0)
    ctx.moveTo(0.4 * u, hipY)
    ctx.lineTo(0.6 * u, 0)
  }
  ctx.stroke()
  // 腰布（サンポット）
  ctx.beginPath()
  ctx.moveTo(-1.2 * u, hipY - 0.8 * u)
  ctx.lineTo(1.2 * u, hipY - 0.8 * u)
  ctx.lineTo(1.7 * u, hipY + 1.3 * u)
  ctx.lineTo(-1.7 * u, hipY + 1.3 * u)
  ctx.closePath()
  ctx.fill()
  // 胴
  const shY = hipY - 3.0 * u
  ctx.beginPath()
  ctx.moveTo(-1.3 * u, shY)
  ctx.lineTo(1.3 * u, shY)
  ctx.lineTo(0.9 * u, hipY - 0.6 * u)
  ctx.lineTo(-0.9 * u, hipY - 0.6 * u)
  ctx.closePath()
  ctx.fill()
  // 腕
  ctx.lineWidth = 0.8 * u
  ctx.beginPath()
  switch (pose) {
    case 'pray':
    case 'kneel':
      ctx.moveTo(-1.1 * u, shY + 0.3 * u)
      ctx.lineTo(-0.4 * u, shY + 1.6 * u)
      ctx.lineTo(0.2 * u, shY - 0.4 * u)
      ctx.moveTo(1.1 * u, shY + 0.3 * u)
      ctx.lineTo(0.6 * u, shY + 1.6 * u)
      ctx.lineTo(0.3 * u, shY - 0.4 * u)
      break
    case 'dance':
      ctx.moveTo(-1.1 * u, shY + 0.2 * u)
      ctx.quadraticCurveTo(-3.2 * u, shY - 0.4 * u, -2.6 * u, shY - 2.0 * u)
      ctx.moveTo(1.1 * u, shY + 0.2 * u)
      ctx.quadraticCurveTo(3.0 * u, shY + 1.6 * u, 3.0 * u, shY - 0.2 * u)
      break
    case 'reach':
      ctx.moveTo(-1.1 * u, shY + 0.3 * u)
      ctx.lineTo(-1.6 * u, shY + 2.4 * u)
      ctx.moveTo(1.1 * u, shY + 0.2 * u)
      ctx.lineTo(2.2 * u, shY - 2.4 * u)
      break
    case 'blade':
      ctx.moveTo(-1.1 * u, shY + 0.3 * u)
      ctx.lineTo(-2.4 * u, shY + 1.0 * u)
      ctx.moveTo(1.1 * u, shY + 0.2 * u)
      ctx.lineTo(2.0 * u, shY - 2.2 * u)
      break
    case 'carry':
      ctx.moveTo(-1.1 * u, shY + 0.3 * u)
      ctx.lineTo(-0.9 * u, shY - 1.6 * u)
      ctx.moveTo(1.1 * u, shY + 0.3 * u)
      ctx.lineTo(0.9 * u, shY - 1.6 * u)
      break
    default:
      ctx.moveTo(-1.1 * u, shY + 0.3 * u)
      ctx.lineTo(-1.8 * u, hipY)
      ctx.moveTo(1.1 * u, shY + 0.3 * u)
      ctx.lineTo(1.9 * u, hipY + 0.2 * u)
  }
  ctx.stroke()
  // 頭と冠（とがった冠）
  ctx.beginPath()
  ctx.arc(0, shY - 1.25 * u, 1.05 * u, 0, Math.PI * 2)
  ctx.fill()
  if (crown) {
    ctx.beginPath()
    ctx.moveTo(-0.9 * u, shY - 1.9 * u)
    ctx.lineTo(0, shY - 4.0 * u)
    ctx.lineTo(0.9 * u, shY - 1.9 * u)
    ctx.closePath()
    ctx.fill()
  }
  if (pose === 'carry') {
    // 頭の上のかご
    ctx.fillRect(-1.6 * u, shY - 3.6 * u, 3.2 * u, 1.4 * u)
  }
  ctx.restore()
}

/** 刃（女の子の持つ、光る刃）：腕の先から上へ */
function blade(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, w: number, ang: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.beginPath()
  ctx.moveTo(-w / 2, 0)
  ctx.lineTo(0, -len)
  ctx.lineTo(w / 2, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 大きな青い石（アルン）：細長い六角の結晶 */
function crystal(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath()
  ctx.moveTo(x - w * 0.5, y)
  ctx.lineTo(x - w * 0.55, y - h * 0.62)
  ctx.lineTo(x, y - h)
  ctx.lineTo(x + w * 0.55, y - h * 0.62)
  ctx.lineTo(x + w * 0.5, y)
  ctx.closePath()
  ctx.fill()
}

/** 黒い輪の怪物：太い輪・内側の歯・のびる手 3 本 */
function ringMonster(ctx: CanvasRenderingContext2D, hctx: CanvasRenderingContext2D | null, x: number, y: number, r: number): void {
  const draw = (g: CanvasRenderingContext2D, mode: 'h' | 'p') => {
    g.save()
    g.lineCap = 'round'
    g.lineJoin = 'round'
    // 輪
    g.lineWidth = r * 0.42
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.stroke()
    // 歯
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2
      const ix = x + Math.cos(a) * r * 0.78
      const iy = y + Math.sin(a) * r * 0.78
      const tx = x + Math.cos(a) * r * 0.48
      const ty = y + Math.sin(a) * r * 0.48
      const px = -Math.sin(a) * r * 0.09
      const py = Math.cos(a) * r * 0.09
      g.beginPath()
      g.moveTo(ix + px, iy + py)
      g.lineTo(tx, ty)
      g.lineTo(ix - px, iy - py)
      g.closePath()
      g.fill()
    }
    // 手（下へのびる 3 本の腕と、指）
    g.lineWidth = r * 0.16
    for (const [ex, ey] of [
      [-1.25, 1.55],
      [0.05, 1.95],
      [1.35, 1.5],
    ]) {
      const sx = x + ex * r * 0.4
      const sy = y + r * 0.7
      const tx = x + ex * r
      const ty = y + ey * r
      g.beginPath()
      g.moveTo(sx, sy)
      g.quadraticCurveTo((sx + tx) / 2 + ex * r * 0.3, (sy + ty) / 2, tx, ty)
      g.stroke()
      g.lineWidth = r * 0.07
      for (let f = -2; f <= 2; f++) {
        g.beginPath()
        g.moveTo(tx, ty)
        g.lineTo(tx + f * r * 0.09, ty + r * 0.26)
        g.stroke()
      }
      g.lineWidth = r * 0.16
    }
    g.restore()
    void mode
  }
  draw(ctx, 'p')
  if (hctx) draw(hctx, 'h')
}

/** 物語の浮き彫り（左から：青い石をおがむ人々 → 空がわれて黒い輪の怪物 → 刃を持った女の子が光の扉へ） */
export function paintStoryRelief(W = 2048, H = 320): PaintedKhmer {
  const rng = mulberry32(1186)
  const [c, g] = makeCanvas(W, H)
  const [hc, hg] = makeCanvas(W, H)
  const [pc, pg] = makeCanvas(W, H)
  pg.clearRect(0, 0, W, H)
  // 地（彫りこんだ面）
  hg.fillStyle = 'rgb(70,70,70)'
  hg.fillRect(0, 0, W, H)
  g.fillStyle = '#c3ad8c'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,245,225' : '60,48,34'},${range(rng, 0.03, 0.08)})`
    g.fillRect(rng() * W, rng() * H, 2, 2)
  }
  // 上下の帯（はすの花びら）
  const band = (y0: number, y1: number, up: boolean) => {
    hg.fillStyle = 'rgb(200,200,200)'
    hg.fillRect(0, y0, W, y1 - y0)
    hg.fillStyle = 'rgb(120,120,120)'
    for (let x = 0; x < W; x += 22) {
      hg.beginPath()
      const yb = up ? y1 : y0
      const yt = up ? y0 + 2 : y1 - 2
      hg.moveTo(x + 2, yb)
      hg.quadraticCurveTo(x + 11, yt - (up ? 4 : -4), x + 20, yb)
      hg.closePath()
      hg.fill()
    }
  }
  band(0, 26, false)
  band(H - 30, H, true)
  // 場面のしきり（柱）
  hg.fillStyle = 'rgb(190,190,190)'
  for (const x of [W * 0.33, W * 0.67]) hg.fillRect(x - 5, 26, 10, H - 56)

  const ground = H - 34
  hg.fillStyle = 'rgb(235,235,235)'
  // --- 場面 1：青い石（アルン）と、おがむ人々
  const s1 = W * 0.165
  // 祠堂の塔（つぼみの形）
  hg.beginPath()
  hg.moveTo(s1 - 90, ground)
  hg.lineTo(s1 - 90, ground - 120)
  hg.quadraticCurveTo(s1 - 70, ground - 250, s1, ground - 268)
  hg.quadraticCurveTo(s1 + 70, ground - 250, s1 + 90, ground - 120)
  hg.lineTo(s1 + 90, ground)
  hg.closePath()
  hg.fillStyle = 'rgb(150,150,150)'
  hg.fill()
  // 石
  hg.fillStyle = 'rgb(250,250,250)'
  softFill(hg, 1.5, () => crystal(hg, s1, ground - 18, 70, 170))
  hg.fillRect(s1 - 52, ground - 20, 104, 20)
  pg.fillStyle = 'rgba(40,140,235,0.95)'
  crystal(pg, s1, ground - 18, 70, 170)
  // 光の線
  pg.strokeStyle = 'rgba(120,200,255,0.55)'
  pg.lineWidth = 4
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (k - 4) * 0.28
    pg.beginPath()
    pg.moveTo(s1 + Math.cos(a) * 100, ground - 110 + Math.sin(a) * 100)
    pg.lineTo(s1 + Math.cos(a) * 150, ground - 110 + Math.sin(a) * 150)
    pg.stroke()
  }
  hg.fillStyle = 'rgb(235,235,235)'
  const prayers: Array<[number, Pose, number]> = [
    [-300, 'kneel', 1],
    [-235, 'pray', 1],
    [-170, 'kneel', 1],
    [175, 'kneel', -1],
    [240, 'pray', -1],
    [305, 'kneel', -1],
  ]
  for (const [dx, pose, dir] of prayers) softFill(hg, 1.2, () => figure(hg, s1 + dx, ground, 150, pose, dir))
  // --- 場面 2：空がわれて、黒い輪の怪物
  const s2 = W * 0.5
  // 空のひび
  hg.strokeStyle = 'rgb(120,120,120)'
  hg.lineWidth = 4
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + rng()
    let x = s2
    let y = 118
    hg.beginPath()
    hg.moveTo(x, y)
    for (let n = 0; n < 5; n++) {
      x += Math.cos(a + (rng() - 0.5)) * 26
      y += Math.sin(a + (rng() - 0.5)) * 18
      hg.lineTo(x, y)
    }
    hg.stroke()
  }
  hg.strokeStyle = 'rgb(240,240,240)'
  hg.fillStyle = 'rgb(240,240,240)'
  pg.strokeStyle = 'rgba(24,18,32,0.92)'
  pg.fillStyle = 'rgba(24,18,32,0.92)'
  softFill(hg, 1.5, () => ringMonster(hg, null, s2, 118, 70))
  ringMonster(pg, null, s2, 118, 70)
  // 逃げる人々
  hg.fillStyle = 'rgb(225,225,225)'
  for (const [dx, dir] of [
    [-250, -1],
    [-190, -1],
    [205, 1],
    [270, 1],
  ] as Array<[number, number]>)
    softFill(hg, 1.2, () => figure(hg, s2 + dx, ground, 140, 'walk', dir))
  // 食べられる木
  for (const dx of [-120, 130]) {
    hg.fillStyle = 'rgb(200,200,200)'
    hg.fillRect(s2 + dx - 6, ground - 70, 12, 70)
    hg.beginPath()
    hg.arc(s2 + dx, ground - 86, 30, 0, Math.PI * 2)
    hg.fill()
  }
  // --- 場面 3：刃を持った女の子が、光の扉へ
  const s3 = W * 0.835
  // 光の扉（縦長）と朝日
  hg.fillStyle = 'rgb(185,185,185)'
  hg.beginPath()
  hg.roundRect(s3 + 70, 50, 110, ground - 50, 50)
  hg.fill()
  pg.fillStyle = 'rgba(255,214,110,0.75)'
  pg.beginPath()
  pg.roundRect(s3 + 70, 50, 110, ground - 50, 50)
  pg.fill()
  pg.strokeStyle = 'rgba(255,220,130,0.55)'
  pg.lineWidth = 5
  for (let k = 0; k < 10; k++) {
    const a = Math.PI + (k / 9) * Math.PI
    pg.beginPath()
    pg.moveTo(s3 + 125 + Math.cos(a) * 80, 112 + Math.sin(a) * 80)
    pg.lineTo(s3 + 125 + Math.cos(a) * 118, 112 + Math.sin(a) * 118)
    pg.stroke()
  }
  // 女の子（とびあがって、刃を上へ）
  hg.fillStyle = 'rgb(250,250,250)'
  softFill(hg, 1.2, () => figure(hg, s3 - 40, ground - 26, 175, 'blade', 1, false))
  // 髪のたば
  hg.beginPath()
  hg.arc(s3 - 40 - 12, ground - 26 - 155, 13, 0, Math.PI * 2)
  hg.fill()
  // 刃
  softFill(hg, 1, () => blade(hg, s3 - 40 + 35, ground - 26 - 128, 92, 16, 0.55))
  pg.fillStyle = 'rgba(80,190,255,0.9)'
  blade(pg, s3 - 40 + 35, ground - 26 - 128, 92, 16, 0.55)
  // 見送る人
  hg.fillStyle = 'rgb(225,225,225)'
  for (const [dx, pose] of [
    [-230, 'pray'],
    [-170, 'reach'],
  ] as Array<[number, Pose]>)
    softFill(hg, 1.2, () => figure(hg, s3 + dx, ground, 140, pose, 1))
  // 色と陰影
  blurInPlace(hc, 1.3)
  const Hh = readHeight(hc)
  bakeShade(c, Hh, 3.2, 0.45)
  // 顔料（青い石・黒い輪・光の扉）を重ねる
  g.globalAlpha = 0.72
  g.drawImage(pc, 0, 0)
  g.globalAlpha = 1
  return { color: c, normal: heightToNormal(Hh, W, H, 3.0) }
}

/** くり返しの浮き彫り：踊り子（アプサラ）と、荷を運ぶ人・象の行列 */
export function paintProcessionRelief(W = 1024, H = 256): PaintedKhmer {
  const rng = mulberry32(42)
  const [c, g] = makeCanvas(W, H)
  const [hc, hg] = makeCanvas(W, H)
  hg.fillStyle = 'rgb(70,70,70)'
  hg.fillRect(0, 0, W, H)
  g.fillStyle = '#c1aa88'
  g.fillRect(0, 0, W, H)
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,245,225' : '60,48,34'},${range(rng, 0.03, 0.08)})`
    g.fillRect(rng() * W, rng() * H, 2, 2)
  }
  hg.fillStyle = 'rgb(200,200,200)'
  hg.fillRect(0, 0, W, 18)
  hg.fillRect(0, H - 22, W, 22)
  hg.fillStyle = 'rgb(130,130,130)'
  for (let x = 0; x < W; x += 16) {
    hg.beginPath()
    hg.arc(x + 8, 9, 5, 0, Math.PI * 2)
    hg.fill()
    hg.beginPath()
    hg.arc(x + 8, H - 11, 5, 0, Math.PI * 2)
    hg.fill()
  }
  const ground = H - 26
  hg.fillStyle = 'rgb(235,235,235)'
  // 踊り子 3 人
  for (let k = 0; k < 3; k++) softFill(hg, 1.1, () => figure(hg, 70 + k * 110, ground, 170, 'dance', k % 2 ? -1 : 1))
  // 荷を運ぶ人
  for (let k = 0; k < 2; k++) softFill(hg, 1.1, () => figure(hg, 430 + k * 80, ground, 150, 'carry', 1))
  // 象（背中に荷）
  const ex = 760
  softFill(hg, 1.4, () => {
    hg.beginPath()
    hg.ellipse(ex, ground - 70, 95, 55, 0, 0, Math.PI * 2)
    hg.fill()
    hg.beginPath()
    hg.ellipse(ex + 95, ground - 85, 40, 38, 0, 0, Math.PI * 2)
    hg.fill()
    hg.lineWidth = 16
    hg.lineCap = 'round'
    hg.strokeStyle = 'rgb(235,235,235)'
    hg.beginPath()
    hg.moveTo(ex + 125, ground - 80)
    hg.quadraticCurveTo(ex + 150, ground - 40, ex + 135, ground - 12)
    hg.stroke()
    for (const lx of [-60, -25, 30, 62]) hg.fillRect(ex + lx - 13, ground - 40, 26, 40)
    hg.fillRect(ex - 50, ground - 150, 90, 34)
  })
  softFill(hg, 1.1, () => figure(hg, 930, ground, 150, 'walk', -1))
  blurInPlace(hc, 1.2)
  const Hh = readHeight(hc)
  bakeShade(c, Hh, 3.0, 0.42)
  return { color: c, normal: heightToNormal(Hh, W, H, 2.8) }
}

// ------------------------------------------------------------------ 村

/** ヤシの葉でふいた屋根（横に重なる段と、たれた葉先） */
export function paintThatch(S = 512, seed = 5): PaintedKhmer {
  const rng = mulberry32(seed)
  const [c, g] = makeCanvas(S)
  const [hc, hg] = makeCanvas(S)
  g.fillStyle = '#8a6a3a'
  g.fillRect(0, 0, S, S)
  hg.fillStyle = '#000'
  hg.fillRect(0, 0, S, S)
  const rows = 8
  const rh = S / rows
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh
    for (let i = 0; i < 260; i++) {
      const x = rng() * S
      const len = range(rng, rh * 0.8, rh * 1.25)
      const l = range(rng, 34, 58)
      g.strokeStyle = `hsl(${range(rng, 32, 44)},${range(rng, 35, 55)}%,${l}%)`
      g.lineWidth = range(rng, 1.5, 3.5)
      g.beginPath()
      g.moveTo(x, y0)
      g.lineTo(x + range(rng, -4, 4), y0 + len)
      g.stroke()
      hg.strokeStyle = `rgba(255,255,255,${range(rng, 0.25, 0.6)})`
      hg.lineWidth = g.lineWidth
      hg.beginPath()
      hg.moveTo(x, y0)
      hg.lineTo(x, y0 + len)
      hg.stroke()
    }
    // 段の影
    const grad = g.createLinearGradient(0, y0, 0, y0 + rh)
    grad.addColorStop(0, 'rgba(30,20,8,0.45)')
    grad.addColorStop(0.25, 'rgba(30,20,8,0)')
    g.fillStyle = grad
    g.fillRect(0, y0, S, rh)
  }
  const H = readHeight(hc)
  return { color: c, normal: heightToNormal(H, S, S, 2.0) }
}

/** 竹の編み壁（あじろ編み） */
export function paintWeave(S = 256): PaintedKhmer {
  const [c, g] = makeCanvas(S)
  const n = 16
  const cs = S / n
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const horiz = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0
      const grad = horiz ? g.createLinearGradient(0, y * cs, 0, (y + 1) * cs) : g.createLinearGradient(x * cs, 0, (x + 1) * cs, 0)
      grad.addColorStop(0, '#a88a58')
      grad.addColorStop(0.5, '#dcc596')
      grad.addColorStop(1, '#9c7e4e')
      g.fillStyle = grad
      g.fillRect(x * cs, y * cs, cs, cs)
    }
  return { color: c }
}

/** クロマー（チェックの布）。2×2 のアトラス：赤・青・緑・むらさき */
export function paintKrama(S = 256): PaintedKhmer {
  const [c, g] = makeCanvas(S)
  const cols = ['#c8322c', '#2d5fae', '#2f8a4a', '#7a3a8c']
  const h = S / 2
  cols.forEach((col, k) => {
    const ox = (k % 2) * h
    const oy = Math.floor(k / 2) * h
    g.fillStyle = '#f4efe2'
    g.fillRect(ox, oy, h, h)
    const n = 8
    const cs = h / n
    g.fillStyle = col
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.55
      g.fillRect(ox + i * cs, oy, cs * 0.5, h)
      g.fillRect(ox, oy + i * cs, h, cs * 0.5)
    }
    g.globalAlpha = 1
    // ふさ（下の端）
    g.fillStyle = col
    g.fillRect(ox, oy + h - 8, h, 8)
  })
  return { color: c }
}

/**
 * ヤシの葉（上下 2 段のアトラス。透明のカード）。
 * 上半分（v 0.5〜1）：扇の葉（サトウヤシ）。根もとは下のまん中（u 0.5, v 0.5）、半径いっぱいの半円。
 * 下半分（v 0〜0.5）：羽の葉（ココヤシ）。根もとは左（u 0）、軸は v 0.25 を右へ
 */
export function paintPalmLeaves(S = 512): PaintedKhmer {
  const rng = mulberry32(31)
  const [c, g] = makeCanvas(S)
  g.clearRect(0, 0, S, S)
  const h = S / 2
  // 扇の葉：ひだのある半円（くさびを交互の明るさで）
  const fx = S / 2
  const fy = h - 4
  const R = h - 10
  const n = 30
  for (let k = 0; k < n; k++) {
    const a0 = Math.PI + (k / n) * Math.PI
    const a1 = Math.PI + ((k + 1) / n) * Math.PI
    const am = (a0 + a1) / 2
    const r = R * range(rng, 0.9, 1.0)
    g.fillStyle = `hsl(${range(rng, 92, 108)},${range(rng, 40, 52)}%,${k % 2 ? range(rng, 36, 42) : range(rng, 44, 52)}%)`
    g.beginPath()
    g.moveTo(fx, fy)
    g.lineTo(fx + Math.cos(a0) * r * 0.96, fy + Math.sin(a0) * r * 0.96)
    // ぎざぎざの葉先
    g.lineTo(fx + Math.cos(am) * r * 1.03, fy + Math.sin(am) * r * 1.03)
    g.lineTo(fx + Math.cos(a1) * r * 0.96, fy + Math.sin(a1) * r * 0.96)
    g.closePath()
    g.fill()
  }
  // 葉の中心の筋
  g.strokeStyle = 'rgba(60,80,20,0.6)'
  g.lineWidth = 2
  for (let k = 0; k <= n; k++) {
    const a = Math.PI + (k / n) * Math.PI
    g.beginPath()
    g.moveTo(fx, fy)
    g.lineTo(fx + Math.cos(a) * R * 0.9, fy + Math.sin(a) * R * 0.9)
    g.stroke()
  }
  // 根もとの葉柄の付け根
  g.fillStyle = '#6a7a30'
  g.beginPath()
  g.arc(fx, fy, 14, Math.PI, Math.PI * 2)
  g.fill()
  // 羽の葉：軸（左 → 右）と小葉
  const y0 = h + h / 2
  for (let i = 0; i < 40; i++) {
    const t = (i + 0.5) / 40
    const x = 10 + t * (S - 24)
    const len = (0.35 + Math.sin(Math.min(1, t * 1.15) * Math.PI) * 0.65) * (h * 0.46)
    for (const sd of [-1, 1]) {
      g.save()
      g.translate(x, y0)
      g.rotate(sd * (0.95 + t * 0.3))
      g.fillStyle = `hsl(${range(rng, 88, 108)},${range(rng, 45, 58)}%,${range(rng, 36, 48)}%)`
      g.beginPath()
      g.ellipse(len / 2, 0, len / 2, 4.5, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
  }
  g.strokeStyle = '#7a8a3a'
  g.lineWidth = 5
  g.beginPath()
  g.moveTo(6, y0)
  g.lineTo(S - 8, y0)
  g.stroke()
  return { color: c }
}

// ------------------------------------------------------------------ 地面

/** 地面の色分けが覆う範囲（ワールドの XZ。テクスチャ 1 枚で全体） */
export const GROUND_AREA: Rect = { x0: -128, x1: 116, z0: -134, z1: 100 }

/**
 * 地面の色（1 枚の大きな絵）：草のむら・赤土の道（象の道・村の小道・広場）・岸の砂・家の下の土・水田のあぜ。
 * 細かいざらつきは材質側の小さなくり返しの模様で足す（materialsKhmer の ground）
 */
export function paintGround(S = 1024): HTMLCanvasElement {
  const rng = mulberry32(5)
  const [c, g] = makeCanvas(S)
  const A = GROUND_AREA
  const sx = S / (A.x1 - A.x0)
  const sz = S / (A.z1 - A.z0)
  const X = (x: number) => (x - A.x0) * sx
  const Z = (z: number) => (z - A.z0) * sz
  // 草（むら）：小さく描いて引きのばす（全画素でノイズを計算すると重い）
  const G = 512
  const [gc, gg] = makeCanvas(G)
  const img = gg.createImageData(G, G)
  for (let y = 0; y < G; y++)
    for (let x = 0; x < G; x++) {
      const u = x / G
      const v = y / G
      const n = noise.fbm(u, v, 9, 4)
      const n2 = noise.fbm(u + 0.37, v + 0.71, 30, 2)
      const dry = clamp01((n - 0.48) * 3.2)
      const i = (y * G + x) * 4
      img.data[i] = 104 + dry * 62 + n2 * 20
      img.data[i + 1] = 132 + dry * 30 + n2 * 20
      img.data[i + 2] = 66 + dry * 20 + n2 * 10
      img.data[i + 3] = 255
    }
  gg.putImageData(img, 0, 0)
  g.imageSmoothingEnabled = true
  g.drawImage(gc, 0, 0, S, S)
  // 道・砂・土は、別の層にくっきり描いてから、最後に 1 回だけぼかして重ねる（図形ごとにぼかすと重い）
  const [lc, lg] = makeCanvas(S)
  const base = g
  const soft = (_blur: number, draw: () => void) => draw()
  const red = '#b5643a'
  const redLight = '#c98252'
  const path = (pts: Array<[number, number]>, w: number, col: string, blur = 4) =>
    soft(blur, () => {
      lg.strokeStyle = col
      lg.lineWidth = w * sx
      lg.lineCap = 'round'
      lg.lineJoin = 'round'
      lg.beginPath()
      lg.moveTo(X(pts[0][0]), Z(pts[0][1]))
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2
        const mz = (pts[i][1] + pts[i + 1][1]) / 2
        lg.quadraticCurveTo(X(pts[i][0]), Z(pts[i][1]), X(mx), Z(mz))
      }
      const l = pts[pts.length - 1]
      lg.lineTo(X(l[0]), Z(l[1]))
      lg.stroke()
    })
  // 岸の砂（池の南の岸・水路の両岸）
  soft(6, () => {
    lg.fillStyle = '#cdb88a'
    lg.fillRect(X(K.BARAY.x0 - 4), Z(K.BARAY.z1 - 1), (K.BARAY.x1 - K.BARAY.x0 + 8) * sx, 5 * sz)
    lg.fillRect(X(K.CANAL.x0 - 2.5), Z(K.CANAL.z0), (K.CANAL.x1 - K.CANAL.x0 + 5) * sx, (A.z1 - K.CANAL.z0) * sz)
    lg.fillRect(X(K.BARAY.x0 - 4), Z(K.BARAY.z0 - 4), (K.BARAY.x1 - K.BARAY.x0 + 8) * sx, 5 * sz)
  })
  // 象の道（まっすぐな赤土の大通り）と、わだち
  soft(5, () => {
    lg.fillStyle = red
    lg.fillRect(X(A.x0), Z(K.ROAD.z0), (A.x1 - A.x0) * sx, (K.ROAD.z1 - K.ROAD.z0) * sz)
  })
  for (const dz of [-1.4, 1.4]) path([[A.x0, (K.ROAD.z0 + K.ROAD.z1) / 2 + dz], [A.x1, (K.ROAD.z0 + K.ROAD.z1) / 2 + dz]], 0.9, '#9a4f2c', 3)
  // 村の小道（広場から家々へ・岸・橋・象の道へ）
  const P = K.PLAZA
  const pw = 2.6
  path([[-31, -31], [-36, -20], [-44, -10], [P.x + 4, P.z - 4]], pw, redLight)
  path([[P.x, P.z], [-60, -10], [-72, -20.5]], pw, redLight)
  path([[P.x, P.z], [-46, -16], [-46, -21]], pw, redLight)
  path([[P.x, P.z], [-70, 6], [-77, 4]], pw, redLight)
  path([[P.x, P.z], [-40, 10], [-35, 9]], pw, redLight)
  path([[P.x, P.z], [-66, 22], [-75, 26]], pw, redLight)
  path([[P.x, P.z], [-48, 24], [-43, 27]], pw, redLight)
  path([[P.x, P.z], [-60, 26], [-62, 31]], pw, redLight)
  path([[P.x + 2, P.z + 6], [-52, 30], [-50, K.ROAD.z0 + 1]], pw, redLight)
  path([[-36, -20], [-30, -10], [-29, -4], [-26, -4]], 3.2, redLight)
  path([[WALK_RAMP.x, WALK_RAMP.z0 + 2], [-58, -28], [-54, -16], [P.x, P.z]], pw, redLight)
  path([[-31, -31], [-40, -36], [WALK_RAMP.x + 2, WALK_RAMP.z0 + 1]], pw, redLight)
  // 寺の東・南の外の道
  path([[K.COURT.x1 + 3, -40], [K.COURT.x1 + 3, K.ROAD.z0]], 3, redLight)
  path([[-8, -36], [-7, -20], [-6, -6]], 3, redLight)
  // 広場（踏み固めた赤土）
  soft(8, () => {
    lg.fillStyle = redLight
    lg.beginPath()
    lg.ellipse(X(P.x), Z(P.z), P.r * sx, P.r * 0.85 * sz, 0, 0, Math.PI * 2)
    lg.fill()
  })
  // 家の下の土
  for (const h of [...LAND_HOUSES]) {
    soft(6, () => {
      lg.fillStyle = 'rgba(150,100,60,0.85)'
      lg.beginPath()
      lg.ellipse(X(h.x), Z(h.z), (h.w / 2 + h.porch + 1.6) * sx, (h.d / 2 + h.porch + 1.6) * sz, 0, 0, Math.PI * 2)
      lg.fill()
    })
  }
  void WATER_HOUSES
  // 寺のまわりの乾いた草
  soft(14, () => {
    lg.fillStyle = 'rgba(176,170,96,0.5)'
    lg.fillRect(X(K.COURT.x0 - 6), Z(K.COURT.z0 - 3), (K.COURT.x1 - K.COURT.x0 + 12) * sx, (K.COURT.z1 - K.COURT.z0 + 6) * sz)
  })
  base.filter = 'blur(2.5px)'
  base.drawImage(lc, 0, 0)
  base.filter = 'none'
  // 水田（道の南）：明るい緑と、あぜ
  const PD = K.PADDY
  g.fillStyle = '#6fae3c'
  g.fillRect(X(PD.x0), Z(PD.z0), (PD.x1 - PD.x0) * sx, (A.z1 - PD.z0) * sz)
  g.strokeStyle = '#9c7a48'
  g.lineWidth = 0.8 * sx
  for (let x = PD.x0; x <= PD.x1; x += 12) {
    g.beginPath()
    g.moveTo(X(x), Z(PD.z0))
    g.lineTo(X(x + range(rng, -1, 1)), Z(A.z1))
    g.stroke()
  }
  for (let z = PD.z0; z <= A.z1; z += 9) {
    g.beginPath()
    g.moveTo(X(PD.x0), Z(z))
    g.lineTo(X(PD.x1), Z(z))
    g.stroke()
  }
  // 小石・落ち葉の点
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,240,200' : '50,40,20'},${range(rng, 0.05, 0.14)})`
    g.fillRect(rng() * S, rng() * S, 2, 2)
  }
  return c
}

/** 地面のこまかいざらつき（グレー。くり返して色にかける） */
export function paintGroundDetail(S = 256): HTMLCanvasElement {
  const [c, g] = makeCanvas(S)
  const img = g.createImageData(S, S)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const n = noise.fbm(x / S, y / S, 16, 4)
      const m = noise.fbm(x / S + 0.5, y / S + 0.2, 64, 2)
      const v = clamp01(0.55 + (n - 0.5) * 0.9 + (m - 0.5) * 0.5) * 255
      const i = (y * S + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = 255
    }
  g.putImageData(img, 0, 0)
  return c
}

export function rngFor(seed: number): Rng {
  return mulberry32(seed)
}
