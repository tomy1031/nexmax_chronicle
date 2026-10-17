// キャンバスで手続き的にテクスチャを描く（外部ダウンロードなし）。
// 各ペインタは color（sRGB）と height（0..1）を作り、height から法線・ラフネスを導く。
import * as THREE from 'three'
import { TileNoise, mulberry32, range, type Rng } from './noise'

export type Painted = {
  color: HTMLCanvasElement
  normal?: HTMLCanvasElement
  rough?: HTMLCanvasElement
  emissive?: HTMLCanvasElement
}

const noiseA = new TileNoise(11)
const noiseB = new TileNoise(23)

export function makeCanvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D
  return [c, ctx]
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

/** グレースケールのキャンバスを 0..1 の配列へ */
function readGray(c: HTMLCanvasElement): Float32Array {
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const out = new Float32Array(c.width * c.height)
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255
  return out
}

/** 高さ→法線マップ（端はラップ）。 */
export function heightToNormal(h: Float32Array, w: number, hh: number, strength: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, hh)
  const img = ctx.createImageData(w, hh)
  const d = img.data
  for (let y = 0; y < hh; y++) {
    const ym = ((y - 1 + hh) % hh) * w
    const yp = ((y + 1) % hh) * w
    const yr = y * w
    for (let x = 0; x < w; x++) {
      const xm = (x - 1 + w) % w
      const xp = (x + 1) % w
      const dx = (h[yr + xp] - h[yr + xm]) * strength
      const dy = (h[yp + x] - h[ym + x]) * strength
      // canvas の y は下向き・テクスチャ v は上向き（flipY）なので dy の符号はそのまま +
      let nx = -dx
      let ny = dy
      let nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l
      ny /= l
      nz /= l
      const i = (yr + x) * 4
      d[i] = (nx * 0.5 + 0.5) * 255
      d[i + 1] = (ny * 0.5 + 0.5) * 255
      d[i + 2] = (nz * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

function grayCanvas(values: Float32Array, w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h)
  const img = ctx.createImageData(w, h)
  for (let i = 0; i < values.length; i++) {
    const v = clamp01(values[i]) * 255
    img.data[i * 4] = v
    img.data[i * 4 + 1] = v
    img.data[i * 4 + 2] = v
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

/** 色キャンバスに画素単位の処理をかける */
function perPixel(c: HTMLCanvasElement, fn: (u: number, v: number, rgb: number[], i: number) => void): void {
  const ctx = c.getContext('2d') as CanvasRenderingContext2D
  const img = ctx.getImageData(0, 0, c.width, c.height)
  const d = img.data
  const w = c.width
  const h = c.height
  const rgb = [0, 0, 0]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      rgb[0] = d[i * 4]
      rgb[1] = d[i * 4 + 1]
      rgb[2] = d[i * 4 + 2]
      fn(x / w, y / h, rgb, i)
      d[i * 4] = rgb[0]
      d[i * 4 + 1] = rgb[1]
      d[i * 4 + 2] = rgb[2]
    }
  }
  ctx.putImageData(img, 0, 0)
}

function hsl(h: number, s: number, l: number, a = 1): string {
  return `hsla(${h.toFixed(1)},${(s * 100).toFixed(1)}%,${(l * 100).toFixed(1)}%,${a})`
}

/** 画像の縁をまたぐ図形を 2 回描いてタイル化する */
function wrapDraw(size: number, x: number, w: number, draw: (ox: number) => void): void {
  draw(0)
  if (x + w > size) draw(-size)
  if (x < 0) draw(size)
}

// ------------------------------------------------------------------ 木の板（デッキ）

export function paintPlanks(S = 1024, seed = 3): Painted {
  const rng = mulberry32(seed)
  const [c, ctx] = makeCanvas(S)
  const [hc, hctx] = makeCanvas(S)
  ctx.fillStyle = '#2a1709'
  ctx.fillRect(0, 0, S, S)
  hctx.fillStyle = '#000'
  hctx.fillRect(0, 0, S, S)
  const rows = 8
  const rh = S / rows
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh
    let x = range(rng, 0, S)
    const end = x + S
    while (x < end - 40) {
      const len = Math.min(range(rng, S * 0.35, S * 0.9), end - x)
      const segSeed = Math.floor(rng() * 1e9)
      const hue = range(rng, 24, 33)
      const sat = range(rng, 0.42, 0.62)
      const lig = range(rng, 0.36, 0.52)
      const drawSeg = (ox: number) => {
        const sr = mulberry32(segSeed)
        const sx = ((x % S) + S) % S + ox
        ctx.save()
        ctx.beginPath()
        ctx.rect(sx + 1.5, y0 + 2.5, len - 3, rh - 5)
        ctx.clip()
        const g = ctx.createLinearGradient(0, y0, 0, y0 + rh)
        g.addColorStop(0, hsl(hue, sat, lig + 0.05))
        g.addColorStop(0.5, hsl(hue, sat, lig))
        g.addColorStop(1, hsl(hue - 2, sat, lig - 0.06))
        ctx.fillStyle = g
        ctx.fillRect(sx, y0, len, rh)
        // 木目
        for (let k = 0; k < 34; k++) {
          const gy = y0 + range(sr, 0, rh)
          const amp = range(sr, 1, 5)
          const per = range(sr, 120, 420)
          const ph = range(sr, 0, 6.28)
          ctx.strokeStyle = hsl(hue - 4, sat + 0.05, lig - range(sr, 0.08, 0.2), range(sr, 0.12, 0.35))
          ctx.lineWidth = range(sr, 0.8, 2.6)
          ctx.beginPath()
          for (let t = 0; t <= len; t += 12) {
            const yy = gy + Math.sin((t / per) * 6.28 + ph) * amp
            if (t === 0) ctx.moveTo(sx + t, yy)
            else ctx.lineTo(sx + t, yy)
          }
          ctx.stroke()
        }
        // 節
        if (sr() < 0.45) {
          const kx = sx + range(sr, 40, len - 40)
          const ky = y0 + range(sr, 25, rh - 25)
          for (let ring = 5; ring > 0; ring--) {
            ctx.strokeStyle = hsl(hue - 6, sat, lig - 0.12 - ring * 0.02, 0.5)
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.ellipse(kx, ky, ring * 5.5, ring * 2.6, 0, 0, Math.PI * 2)
            ctx.stroke()
          }
          ctx.fillStyle = hsl(hue - 8, sat, lig - 0.25)
          ctx.beginPath()
          ctx.ellipse(kx, ky, 4, 2, 0, 0, Math.PI * 2)
          ctx.fill()
        }
        // 端の色むら・釘
        const eg = ctx.createLinearGradient(sx, 0, sx + len, 0)
        eg.addColorStop(0, 'rgba(40,20,5,0.35)')
        eg.addColorStop(0.06, 'rgba(40,20,5,0)')
        eg.addColorStop(0.94, 'rgba(40,20,5,0)')
        eg.addColorStop(1, 'rgba(40,20,5,0.35)')
        ctx.fillStyle = eg
        ctx.fillRect(sx, y0, len, rh)
        ctx.fillStyle = 'rgba(30,22,18,0.85)'
        for (const nx of [sx + 14, sx + len - 14]) {
          for (const ny of [y0 + rh * 0.25, y0 + rh * 0.75]) {
            ctx.beginPath()
            ctx.arc(nx, ny, 3.2, 0, Math.PI * 2)
            ctx.fill()
          }
        }
        ctx.restore()
        // 高さ：面取りした板
        const steps: Array<[number, number]> = [
          [0, 70],
          [2, 130],
          [4, 175],
          [7, 205],
          [11, 215],
        ]
        for (const [inset, val] of steps) {
          hctx.fillStyle = `rgb(${val},${val},${val})`
          hctx.fillRect(sx + 1.5 + inset, y0 + 2.5 + inset, len - 3 - inset * 2, rh - 5 - inset * 2)
        }
      }
      wrapDraw(S, ((x % S) + S) % S, len, drawSeg)
      x += len
    }
  }
  hctx.filter = 'blur(1.2px)'
  hctx.drawImage(hc, 0, 0)
  hctx.filter = 'none'
  const H = readGray(hc)
  const R = new Float32Array(S * S)
  perPixel(c, (u, v, rgb, i) => {
    const n = noiseA.fbm(u, v, 6, 4, 0.55, 48)
    const f = 0.88 + 0.24 * n
    rgb[0] *= f
    rgb[1] *= f
    rgb[2] *= f
    H[i] += (n - 0.5) * 0.06
    R[i] = 0.62 + 0.25 * noiseB.fbm(u, v, 8, 3) + (H[i] < 0.3 ? 0.15 : 0)
  })
  return { color: c, normal: heightToNormal(H, S, S, 3.2), rough: grayCanvas(R, S, S) }
}

// ------------------------------------------------------------------ 角材の木目

export function paintWoodGrain(S = 512, seed = 5): Painted {
  const rng = mulberry32(seed)
  const [c, ctx] = makeCanvas(S)
  const H = new Float32Array(S * S)
  const img = ctx.createImageData(S, S)
  const d = img.data
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const warp = noiseA.fbm(u, v, 2, 3, 0.5, 6) * 2.2 + noiseB.fbm(u, v, 6, 2, 0.5, 18) * 0.4
      const t = v * 18 + warp
      const f = t - Math.floor(t)
      const line = smooth(0.0, 0.12, f) * (1 - smooth(0.55, 0.95, f))
      const late = 1 - line
      const band = noiseB.fbm(u, v, 1, 3, 0.5, 4)
      const fine = noiseA.fbm(u, v, 32, 2, 0.5, 128)
      const l = 0.78 + 0.22 * band - late * 0.22 - fine * 0.08
      // 暖かい茶
      d[(y * S + x) * 4] = clamp01(l * 0.68) * 255
      d[(y * S + x) * 4 + 1] = clamp01(l * 0.48) * 255
      d[(y * S + x) * 4 + 2] = clamp01(l * 0.32) * 255
      d[(y * S + x) * 4 + 3] = 255
      H[y * S + x] = 0.5 + line * 0.06 - fine * 0.05
    }
  }
  ctx.putImageData(img, 0, 0)
  // ひび割れ
  for (let k = 0; k < 10; k++) {
    const y = range(rng, 0, S)
    const x = range(rng, 0, S)
    const len = range(rng, 60, 220)
    ctx.strokeStyle = 'rgba(35,18,6,0.65)'
    ctx.lineWidth = range(rng, 1, 2.2)
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let t = 0; t < len; t += 10) ctx.lineTo(x + t, y + Math.sin(t * 0.05 + k) * 2)
    ctx.stroke()
    for (let t = 0; t < len; t++) {
      const px = Math.floor(x + t) % S
      const py = Math.floor(y + Math.sin(t * 0.05 + k) * 2 + S) % S
      H[py * S + px] -= 0.25
    }
  }
  return { color: c, normal: heightToNormal(H, S, S, 4) }
}

// ------------------------------------------------------------------ 漆喰

export function paintPlaster(S = 512): Painted {
  const [c, ctx] = makeCanvas(S)
  const H = new Float32Array(S * S)
  ctx.fillStyle = '#efe7d6'
  ctx.fillRect(0, 0, S, S)
  perPixel(c, (u, v, rgb, i) => {
    const n = noiseA.fbm(u, v, 4, 5, 0.55)
    const stain = smooth(0.58, 0.78, noiseB.fbm(u, v, 3, 4, 0.6))
    const fine = noiseB.fbm(u, v, 48, 2)
    const f = 0.95 + 0.07 * n - fine * 0.04
    rgb[0] = rgb[0] * f - stain * 22
    rgb[1] = rgb[1] * f - stain * 26
    rgb[2] = rgb[2] * f - stain * 36
    H[i] = n * 0.3 + fine * 0.25
  })
  return { color: c, normal: heightToNormal(H, S, S, 1.6) }
}

// ------------------------------------------------------------------ 瓦

export function paintRoofTiles(S = 1024): Painted {
  const cols = 8
  const rows = 8
  const tw = S / cols
  const th = S / rows
  const rng = mulberry32(77)
  const tint: number[] = []
  for (let i = 0; i < cols * rows; i++) tint.push(range(rng, -0.09, 0.09))
  const [c, ctx] = makeCanvas(S)
  const img = ctx.createImageData(S, S)
  const d = img.data
  const H = new Float32Array(S * S)
  const R = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    const ry = (y % th) / th // 0=上（棟側） 1=下端（唇）
    const row = Math.floor(y / th)
    for (let x = 0; x < S; x++) {
      const cx = (x % tw) / tw
      const col = Math.floor(x / tw)
      const u = x / S
      const v = y / S
      const across = Math.sin(Math.PI * cx) // 丸瓦の断面
      const along = 0.25 + 0.75 * ry
      const lip = ry > 0.9 ? 1 - smooth(0.9, 1.0, ry) * 0.6 : 1
      let h = across * 0.55 + along * 0.45
      h *= lip
      const valley = 1 - across
      const n = noiseA.fbm(u, v, 16, 3)
      h += (n - 0.5) * 0.05
      H[y * S + x] = h
      const t = tint[row * cols + col]
      const shadowUnder = (1 - smooth(0.0, 0.22, ry)) * 0.35
      let l = 0.36 + t + across * 0.1 - valley * 0.12 - shadowUnder + (n - 0.5) * 0.08
      l = clamp01(l)
      d[(y * S + x) * 4] = clamp01(l * 0.86) * 255
      d[(y * S + x) * 4 + 1] = clamp01(l * 0.93) * 255
      d[(y * S + x) * 4 + 2] = clamp01(l * 1.1) * 255
      d[(y * S + x) * 4 + 3] = 255
      R[y * S + x] = 0.35 + valley * 0.35 + n * 0.2
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color: c, normal: heightToNormal(H, S, S, 9), rough: grayCanvas(R, S, S) }
}

// ------------------------------------------------------------------ 石畳

function stonePoly(ctx: CanvasRenderingContext2D, pts: Array<[number, number]>, ox: number): void {
  ctx.beginPath()
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + ox, y) : ctx.lineTo(x + ox, y)))
  ctx.closePath()
}

function insetPoly(pts: Array<[number, number]>, inset: number): Array<[number, number]> {
  let cx = 0
  let cy = 0
  for (const [x, y] of pts) {
    cx += x
    cy += y
  }
  cx /= pts.length
  cy /= pts.length
  return pts.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const l = Math.hypot(dx, dy) || 1
    const k = Math.max(0, (l - inset) / l)
    return [cx + dx * k, cy + dy * k] as [number, number]
  })
}

type StoneOpts = {
  rows: number
  minW: number
  maxW: number
  gap: number
  hue: [number, number]
  sat: [number, number]
  lig: [number, number]
  jitter: number
  corners: number
  mortar: string
  seed: number
  moss?: number
}

function paintStones(S: number, o: StoneOpts): Painted {
  const rng = mulberry32(o.seed)
  const [c, ctx] = makeCanvas(S)
  const [hc, hctx] = makeCanvas(S)
  ctx.fillStyle = o.mortar
  ctx.fillRect(0, 0, S, S)
  hctx.fillStyle = '#141414'
  hctx.fillRect(0, 0, S, S)
  const rh = S / o.rows
  for (let r = 0; r < o.rows; r++) {
    const y0 = r * rh
    let x = range(rng, 0, S)
    const end = x + S
    while (x < end - o.minW * 0.6) {
      const w = Math.min(range(rng, o.minW, o.maxW), end - x)
      const pts: Array<[number, number]> = []
      const j = o.jitter
      const g = o.gap / 2
      const x0 = x + g
      const x1 = x + w - g
      const ya = y0 + g
      const yb = y0 + rh - g
      // 角を落とした多角形
      const k = o.corners
      pts.push([x0 + k + range(rng, -j, j), ya + range(rng, -j, j)])
      pts.push([x1 - k + range(rng, -j, j), ya + range(rng, -j, j)])
      pts.push([x1 + range(rng, -j, j), ya + k + range(rng, -j, j)])
      pts.push([x1 + range(rng, -j, j), yb - k + range(rng, -j, j)])
      pts.push([x1 - k + range(rng, -j, j), yb + range(rng, -j, j)])
      pts.push([x0 + k + range(rng, -j, j), yb + range(rng, -j, j)])
      pts.push([x0 + range(rng, -j, j), yb - k + range(rng, -j, j)])
      pts.push([x0 + range(rng, -j, j), ya + k + range(rng, -j, j)])
      const hue = range(rng, o.hue[0], o.hue[1])
      const sat = range(rng, o.sat[0], o.sat[1])
      const lig = range(rng, o.lig[0], o.lig[1])
      const tilt = range(rng, -0.06, 0.06)
      const sx = ((x % S) + S) % S
      const draw = (ox: number) => {
        const base = x - sx
        const p = pts.map(([px, py]) => [px - base, py] as [number, number])
        ctx.lineJoin = 'round'
        const grd = ctx.createLinearGradient(0, y0, 0, y0 + rh)
        grd.addColorStop(0, hsl(hue, sat, lig + 0.04))
        grd.addColorStop(1, hsl(hue, sat, lig - 0.05))
        ctx.fillStyle = grd
        stonePoly(ctx, p, ox)
        ctx.fill()
        const levels: Array<[number, number]> = [
          [0, 90],
          [2.5, 150],
          [5, 190],
          [9, 212],
          [14, 222],
        ]
        for (const [inset, val] of levels) {
          const vv = Math.round(val * (1 + tilt))
          hctx.fillStyle = `rgb(${vv},${vv},${vv})`
          stonePoly(hctx, insetPoly(p, inset), ox)
          hctx.fill()
        }
      }
      wrapDraw(S, sx, w, draw)
      x += w
    }
  }
  hctx.filter = 'blur(1.5px)'
  hctx.drawImage(hc, 0, 0)
  hctx.filter = 'none'
  const H = readGray(hc)
  const R = new Float32Array(S * S)
  perPixel(c, (u, v, rgb, i) => {
    const n = noiseA.fbm(u, v, 10, 5, 0.55)
    const sp = noiseB.value(u * 256, v * 256, 256, 256)
    const f = 0.84 + 0.3 * n + (sp > 0.93 ? 0.08 : 0) - (sp < 0.05 ? 0.1 : 0)
    rgb[0] *= f
    rgb[1] *= f
    rgb[2] *= f
    if (o.moss) {
      const m = smooth(0.55, 0.8, noiseB.fbm(u, v, 5, 4)) * o.moss * (H[i] < 0.5 ? 1 : 0.35)
      rgb[0] = rgb[0] * (1 - m) + 70 * m
      rgb[1] = rgb[1] * (1 - m) + 105 * m
      rgb[2] = rgb[2] * (1 - m) + 45 * m
    }
    H[i] += (n - 0.5) * 0.12
    R[i] = 0.7 + 0.25 * n - (H[i] > 0.7 ? 0.08 : 0)
  })
  return { color: c, normal: heightToNormal(H, S, S, 4.5), rough: grayCanvas(R, S, S) }
}

export function paintPaving(S = 1024): Painted {
  return paintStones(S, {
    rows: 8,
    minW: 150,
    maxW: 280,
    gap: 7,
    hue: [26, 38],
    sat: [0.16, 0.3],
    lig: [0.5, 0.66],
    jitter: 4,
    corners: 9,
    mortar: '#5c4c3c',
    seed: 91,
  })
}

export function paintStoneWall(S = 1024): Painted {
  return paintStones(S, {
    rows: 7,
    minW: 110,
    maxW: 250,
    gap: 9,
    hue: [28, 44],
    sat: [0.06, 0.16],
    lig: [0.42, 0.6],
    jitter: 9,
    corners: 22,
    mortar: '#3a342c',
    seed: 37,
    moss: 0.65,
  })
}

// ------------------------------------------------------------------ 縄

export function paintRope(S = 256): Painted {
  const [c, ctx] = makeCanvas(S)
  const H = new Float32Array(S * S)
  const img = ctx.createImageData(S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const t = u * 3 + v * 6
      const f = t - Math.floor(t)
      const prof = Math.sin(Math.PI * f)
      const fib = noiseA.fbm(u, v, 24, 2, 0.5, 64)
      const l = 0.45 + prof * 0.45 - fib * 0.15
      const i = (y * S + x) * 4
      img.data[i] = clamp01(l * 0.86) * 255
      img.data[i + 1] = clamp01(l * 0.72) * 255
      img.data[i + 2] = clamp01(l * 0.5) * 255
      img.data[i + 3] = 255
      H[y * S + x] = prof * 0.8 + fib * 0.2
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color: c, normal: heightToNormal(H, S, S, 5) }
}

// ------------------------------------------------------------------ 樹皮

export function paintBark(S = 512): Painted {
  const [c, ctx] = makeCanvas(S)
  const H = new Float32Array(S * S)
  const img = ctx.createImageData(S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const fis = noiseA.fbm(u, v, 6, 4, 0.5, 2)
      const len = noiseB.fbm(u, v, 3, 2, 0.5, 40)
      const lent = smooth(0.62, 0.7, len)
      const l = 0.3 + fis * 0.25 - lent * 0.12
      const i = (y * S + x) * 4
      img.data[i] = clamp01(l * 1.05) * 255
      img.data[i + 1] = clamp01(l * 0.7) * 255
      img.data[i + 2] = clamp01(l * 0.6) * 255
      img.data[i + 3] = 255
      H[y * S + x] = fis * 0.8 - lent * 0.2
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color: c, normal: heightToNormal(H, S, S, 6) }
}

// ------------------------------------------------------------------ 家紋・図案

export function drawTomoe(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.strokeStyle = color
  ctx.lineWidth = r * 0.09
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.fillStyle = color
  for (let k = 0; k < 3; k++) {
    ctx.save()
    ctx.rotate((k * Math.PI * 2) / 3)
    ctx.beginPath()
    const hr = r * 0.3
    ctx.arc(0, -r * 0.36, hr, 0, Math.PI * 2)
    ctx.fill()
    // 尾
    ctx.beginPath()
    ctx.moveTo(hr, -r * 0.36)
    ctx.quadraticCurveTo(r * 0.55, r * 0.15, -r * 0.05, r * 0.62)
    ctx.quadraticCurveTo(r * 0.35, r * 0.05, -hr * 0.2, -r * 0.36 + hr * 0.95)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

export function drawGear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, teeth = 10): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = color
  ctx.beginPath()
  const n = teeth * 4
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const q = i % 4
    const rr = q === 0 || q === 1 ? r : r * 0.78
    const x = Math.cos(a) * rr
    const y = Math.sin(a) * rr
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function drawWaveCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.lineWidth = r * 0.12
  ctx.lineCap = 'round'
  for (let k = 0; k < 3; k++) {
    const yy = -r * 0.35 + k * r * 0.36
    ctx.beginPath()
    ctx.moveTo(-r * 0.75, yy + r * 0.1)
    ctx.bezierCurveTo(-r * 0.4, yy - r * 0.3, -r * 0.1, yy + r * 0.25, r * 0.15, yy - r * 0.05)
    ctx.bezierCurveTo(r * 0.35, yy - r * 0.28, r * 0.6, yy - r * 0.1, r * 0.78, yy + r * 0.08)
    ctx.stroke()
  }
  ctx.restore()
}

// ------------------------------------------------------------------ 提灯

export function paintLantern(kind: 'cream' | 'red', S = 512): Painted {
  const [c, ctx] = makeCanvas(S)
  const [e, ectx] = makeCanvas(S)
  const base = kind === 'cream' ? '#fbeed3' : '#d8392c'
  ctx.fillStyle = base
  ctx.fillRect(0, 0, S, S)
  ectx.fillStyle = kind === 'cream' ? '#fff3dc' : '#ff6a3c'
  ectx.fillRect(0, 0, S, S)
  // 上下の濃淡（光源が中央）
  const g = ectx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.5, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,0.55)')
  ectx.fillStyle = g
  ectx.fillRect(0, 0, S, S)
  // 竹ひご
  for (let k = 1; k < 16; k++) {
    const y = (k / 16) * S
    for (const cx2 of [ctx, ectx]) {
      cx2.fillStyle = 'rgba(90,50,20,0.28)'
      cx2.fillRect(0, y - 1.5, S, 3)
    }
  }
  // 家紋（u=0.25 と 0.75、円周方向に約2.7倍伸びるので横を縮めて描く）
  const crest = kind === 'cream' ? '#c4302b' : '#ffffff'
  for (const u of [0.25, 0.75]) {
    for (const [cx2, col] of [
      [ctx, crest],
      [ectx, kind === 'cream' ? '#5a1a10' : '#ffe2c8'],
    ] as Array<[CanvasRenderingContext2D, string]>) {
      if (kind === 'red' && u > 0.5) {
        // 赤提灯の裏側は筆文字の「祭」
        drawLettering(cx2, { text: '祭', vertical: true, x: u * S - S * 0.1, y: S * 0.22, w: S * 0.2, h: S * 0.56, ink: col, squashX: 1 / 0.37, maxSize: S * 0.5 })
        continue
      }
      cx2.save()
      cx2.translate(u * S, S * 0.5)
      cx2.scale(0.37, 1)
      drawTomoe(cx2, 0, 0, S * 0.21, col)
      cx2.restore()
    }
  }
  return { color: c, emissive: e }
}

// ------------------------------------------------------------------ 障子（夜の灯り）

export function paintShoji(S = 256): Painted {
  const [c, ctx] = makeCanvas(S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.75)
  g.addColorStop(0, '#fff2d2')
  g.addColorStop(1, '#f2c27e')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = '#4a2c16'
  const n = 4
  for (let k = 0; k <= n; k++) {
    const p = (k / n) * S
    ctx.fillRect(p - 3, 0, 6, S)
    ctx.fillRect(0, p - 3, S, 6)
  }
  for (let k = 0; k < n; k++) {
    const p = ((k + 0.5) / n) * S
    ctx.fillRect(0, p - 1.5, S, 3)
  }
  return { color: c, emissive: c }
}

// ------------------------------------------------------------------ 暖簾・幟

export type FabricDesign = 'gearIndigo' | 'waveIndigo' | 'redCrest' | 'whiteTea' | 'waveBanner' | 'redBannerText' | 'gearBanner'

export function paintFabric(design: FabricDesign): Painted {
  const tall = design === 'waveBanner' || design === 'redBannerText' || design === 'gearBanner'
  const W = tall ? 256 : 512
  const Hh = tall ? 1024 : 512
  const [c, ctx] = makeCanvas(W, Hh)
  const indigo = '#2c3d6b'
  const bg = design === 'redCrest' || design === 'redBannerText' ? '#c23a2e' : design === 'whiteTea' ? '#efe6d2' : indigo
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, Hh)
  // 布の織り
  const fab = (alpha: number) => {
    for (let y = 0; y < Hh; y += 3) {
      ctx.fillStyle = `rgba(255,255,255,${alpha * (0.5 + 0.5 * Math.sin(y * 1.7))})`
      ctx.fillRect(0, y, W, 1)
    }
  }
  fab(0.035)
  const white = '#f3eee2'
  switch (design) {
    case 'gearIndigo':
      drawGear(ctx, W / 2, Hh * 0.52, W * 0.2, white, 10)
      break
    case 'waveIndigo':
      drawWaveCrest(ctx, W / 2, Hh * 0.52, W * 0.22, white)
      break
    case 'redCrest':
      drawTomoe(ctx, W / 2, Hh * 0.52, W * 0.2, white)
      break
    case 'whiteTea':
      drawLettering(ctx, { text: '茶', vertical: true, x: W * 0.28, y: Hh * 0.3, w: W * 0.44, h: Hh * 0.5, ink: indigo })
      break
    case 'waveBanner':
      ctx.fillStyle = white
      ctx.fillRect(0, 0, W, 34)
      drawWaveCrest(ctx, W / 2, Hh * 0.42, W * 0.36, white)
      break
    case 'gearBanner':
      ctx.fillStyle = white
      ctx.fillRect(0, 0, W, 34)
      drawGear(ctx, W / 2, Hh * 0.4, W * 0.34, white, 9)
      break
    case 'redBannerText': {
      // 乳（ちち）の白帯の下から縦書き
      ctx.fillStyle = white
      ctx.fillRect(0, 0, W, 26)
      drawLettering(ctx, { text: '仕掛け横丁', vertical: true, x: W * 0.08, y: Hh * 0.05, w: W * 0.84, h: Hh * 0.8, ink: white })
      drawGear(ctx, W / 2, Hh * 0.92, W * 0.2, white, 8)
      break
    }
  }
  // 下部の切れ込み（暖簾）は alpha で表現
  if (!tall) {
    const a = ctx.getImageData(0, 0, W, Hh)
    for (const sx of [W / 3, (2 * W) / 3]) {
      for (let y = Hh * 0.22; y < Hh; y++) {
        for (let x = Math.floor(sx - 3); x < sx + 3; x++) a.data[(Math.floor(y) * W + x) * 4 + 3] = 0
      }
    }
    ctx.putImageData(a, 0, 0)
  }
  return { color: c }
}

// ------------------------------------------------------------------ 文字（筆文字フォント・時代ごとの書字方向）

/** 看板・幟・暖簾・提灯の書体。brush=Yuji Boku（太い筆）、kaisho=Yuji Syuku（楷書の筆）、mincho=明朝 */
export type LetterFace = 'brush' | 'kaisho' | 'mincho'

export type LetteringStyle = {
  /** 横書きを右から左へ並べる（江戸時代の看板の書き方） */
  horizontalRTL: boolean
  face: LetterFace
}

const MINCHO = '"Hiragino Mincho ProN","Yu Mincho","YuMincho","Noto Serif JP",serif'
const FACE_FAMILY: Record<LetterFace, string> = {
  brush: `"Yuji Boku",${MINCHO}`,
  kaisho: `"Yuji Syuku",${MINCHO}`,
  mincho: MINCHO,
}

/** 現在の時代の書字ルール（既定は 1726 年：右横書き・筆文字）。時代を切り替える時は setLettering で変える。 */
const lettering: LetteringStyle = { horizontalRTL: true, face: 'brush' }

export function setLettering(s: Partial<LetteringStyle>): void {
  Object.assign(lettering, s)
}

export function getLettering(): Readonly<LetteringStyle> {
  return lettering
}

let fontsPromise: Promise<boolean> | null = null

/**
 * 筆文字フォント（public/fonts、SIL OFL）を FontFace API で読み込み、document.fonts に登録する。
 * キャンバスに文字を描く前に必ず await すること。失敗・時間切れでも false を返して明朝で続行する。
 */
export function loadLetteringFonts(timeoutMs = 10000): Promise<boolean> {
  if (fontsPromise) return fontsPromise
  const faces: Array<[string, string]> = [
    ['Yuji Boku', './fonts/YujiBoku-subset.woff2'],
    ['Yuji Syuku', './fonts/YujiSyuku-subset.woff2'],
  ]
  const load = async (): Promise<boolean> => {
    if (typeof FontFace === 'undefined' || !document.fonts) return false
    const results = await Promise.allSettled(
      faces.map(async ([family, url]) => {
        const f = new FontFace(family, `url(${url}) format('woff2')`, { style: 'normal', weight: '400', display: 'block' })
        await f.load()
        document.fonts.add(f)
        return f
      }),
    )
    await document.fonts.ready
    const ok = results.every((r) => r.status === 'fulfilled')
    if (!ok) console.warn('[textures] 筆文字フォントの一部を読めませんでした（明朝で代用）', results)
    return ok
  }
  fontsPromise = Promise.race([
    load().catch((e) => {
      console.warn('[textures] 筆文字フォントを読めませんでした（明朝で代用）', e)
      return false
    }),
    new Promise<boolean>((r) => setTimeout(() => r(false), timeoutMs)),
  ])
  return fontsPromise
}

function fontCss(px: number, face: LetterFace = lettering.face): string {
  // 筆文字は 1 ウェイトのみ。明朝は太字で
  return face === 'mincho' ? `900 ${px}px ${FACE_FAMILY.mincho}` : `400 ${px}px ${FACE_FAMILY[face]}`
}

/** 縦書きで 90° 回す文字（長音・波ダッシュ・括弧） */
const ROTATE_IN_VERTICAL = new Set([...'ー〜～…‥（）「」『』()[]－-'])
/** 縦書きで右上へ寄せる小書きのかな */
const SMALL_KANA = new Set([...'ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ'])
/** 縦書きで右上へ寄せる句読点 */
const PUNCT = new Set([...'、。'])

type GlyphPaint = (ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number) => void

/** 文字を (x,y) を中心に描く（グリフの実際の外接矩形で上下中央にそろえる） */
function drawGlyph(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, size: number, vertical: boolean, paint: (dx: number, dy: number) => void): void {
  ctx.save()
  ctx.translate(x, y)
  if (vertical && ROTATE_IN_VERTICAL.has(ch)) ctx.rotate(Math.PI / 2)
  if (vertical && (SMALL_KANA.has(ch) || PUNCT.has(ch))) ctx.translate(size * 0.18, -size * 0.2)
  const m = ctx.measureText(ch)
  const asc = m.actualBoundingBoxAscent || size * 0.8
  const desc = m.actualBoundingBoxDescent || size * 0.1
  const l = m.actualBoundingBoxLeft || 0
  const r = m.actualBoundingBoxRight || m.width
  const dx = (l - r) / 2
  const dy = (asc - desc) / 2
  paint(dx, dy)
  ctx.restore()
}

export type TextBlock = {
  text: string
  /** 縦書き（列は右から左）。false なら横書き（時代の規則で右→左または左→右） */
  vertical: boolean
  /** 文字を置く範囲 */
  x: number
  y: number
  w: number
  h: number
  ink: string
  face?: LetterFace
  /** 横書きの向きを個別に上書き */
  rtl?: boolean
  /** 1 文字の最大の大きさ（px） */
  maxSize?: number
  /** 文字の後ろの薄い彫り／にじみ（木の看板用） */
  emboss?: string | null
  /** 縦方向に伸ばす（提灯の曲面の補正など、1=そのまま） */
  squashX?: number
  /** 筆の太さの上乗せ（文字の大きさに対する輪郭線の太さ、0 でフォントのまま） */
  bold?: number
}

/**
 * 書字ルールに従ってテキストを描く。複数行は '\n' で区切る。
 * 縦書き：各列は上→下、列は右→左。横書き：各行は上→下、行内は horizontalRTL なら右→左。
 */
export function drawLettering(ctx: CanvasRenderingContext2D, b: TextBlock): void {
  const lines = b.text.split('\n').map((s) => [...s])
  const nLines = lines.length
  const longest = Math.max(1, ...lines.map((l) => l.length))
  const face = b.face ?? lettering.face
  const rtl = b.rtl ?? lettering.horizontalRTL
  const sq = b.squashX ?? 1
  const bold = b.bold ?? 0.035
  const paintFn: GlyphPaint = (c, ch, x, y, size) => {
    drawGlyph(c, ch, x, y, size, b.vertical, (dx, dy) => {
      c.lineJoin = 'round'
      c.lineWidth = size * bold
      if (b.emboss) {
        c.fillStyle = b.emboss
        c.strokeStyle = b.emboss
        c.fillText(ch, dx + size * 0.025, dy + size * 0.035)
        if (bold > 0) c.strokeText(ch, dx + size * 0.025, dy + size * 0.035)
      }
      c.fillStyle = b.ink
      c.strokeStyle = b.ink
      c.fillText(ch, dx, dy)
      if (bold > 0) c.strokeText(ch, dx, dy)
    })
  }
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (b.vertical) {
    const colW = (b.w * sq) / nLines
    const cellH = b.h / longest
    const size = Math.min(colW * 0.92, cellH * 1.0, b.maxSize ?? 1e9)
    ctx.font = fontCss(size, face)
    lines.forEach((col, ci) => {
      // 右の列から
      const cx = b.x + b.w - (ci + 0.5) * (b.w / nLines)
      // 列が短い時は上寄せ（看板の慣習）
      const step = Math.min(cellH, size * 1.04)
      col.forEach((ch, i) => {
        const cy = b.y + (i + 0.5) * step + (cellH - step) * 0.5 * (longest > col.length ? 0 : 1)
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(1 / sq, 1)
        paintFn(ctx, ch, 0, 0, size)
        ctx.restore()
      })
    })
  } else {
    const rowH = b.h / nLines
    const cellW = (b.w * sq) / longest
    const size = Math.min(rowH * 0.86, cellW * 0.98, b.maxSize ?? 1e9)
    ctx.font = fontCss(size, face)
    const stepW = b.w / longest
    lines.forEach((row, ri) => {
      const cy = b.y + (ri + 0.5) * rowH
      const used = row.length * stepW
      const x0 = b.x + (b.w - used) / 2
      row.forEach((ch, i) => {
        // 右横書き：最初の文字をいちばん右に置く
        const slot = rtl ? row.length - 1 - i : i
        const cx = x0 + (slot + 0.5) * stepW
        ctx.save()
        ctx.translate(cx, cy)
        ctx.scale(1 / sq, 1)
        paintFn(ctx, ch, 0, 0, size)
        ctx.restore()
      })
    })
  }
  ctx.restore()
}

// ------------------------------------------------------------------ 看板

export type SignSpec = {
  text: string
  vertical?: boolean
  w: number
  h: number
  gear?: boolean
  color?: string
  bg?: 'wood' | 'black' | 'white'
  face?: LetterFace
  /** 横書きの向きを個別に上書き（既定は時代の規則：1726 年は右→左） */
  rtl?: boolean
}

export function paintSign(spec: SignSpec, wood: HTMLCanvasElement): Painted {
  const [c, ctx] = makeCanvas(spec.w, spec.h)
  const bg = spec.bg ?? 'wood'
  if (bg === 'wood') {
    ctx.drawImage(wood, 0, 0, spec.w * 1.2, spec.h * 1.2)
    ctx.fillStyle = 'rgba(255,220,160,0.18)'
    ctx.fillRect(0, 0, spec.w, spec.h)
  } else {
    ctx.fillStyle = bg === 'black' ? '#1e1712' : '#f2ead8'
    ctx.fillRect(0, 0, spec.w, spec.h)
  }
  // 縁取り
  const b = Math.min(spec.w, spec.h) * 0.06
  ctx.strokeStyle = 'rgba(40,22,10,0.85)'
  ctx.lineWidth = b
  ctx.strokeRect(b / 2, b / 2, spec.w - b, spec.h - b)
  ctx.strokeStyle = 'rgba(255,220,170,0.35)'
  ctx.lineWidth = b * 0.25
  ctx.strokeRect(b * 1.2, b * 1.2, spec.w - b * 2.4, spec.h - b * 2.4)
  const ink = spec.color ?? (bg === 'black' ? '#f2d38a' : '#24130a')
  const emboss = bg === 'black' ? 'rgba(0,0,0,0.55)' : 'rgba(255,232,196,0.45)'
  const area = spec.gear ? 0.78 : 1
  const pad = b * 1.9
  if (spec.vertical) {
    const h = (spec.h - pad * 2) * area
    drawLettering(ctx, { text: spec.text, vertical: true, x: pad, y: pad, w: spec.w - pad * 2, h, ink, emboss, face: spec.face })
    if (spec.gear) drawGear(ctx, spec.w / 2, spec.h - pad - (spec.h - pad * 2) * (1 - area) * 0.5, spec.w * 0.27, ink, 8)
  } else {
    const rtl = spec.rtl ?? getLettering().horizontalRTL
    const w = (spec.w - pad * 2) * area
    // 右横書きでは飾りの歯車を読み終わり側（左端）へ置き、全体を左右反転した構図にする
    const gearW = spec.w - pad * 2 - w
    const tx = spec.gear && rtl ? pad + gearW : pad
    drawLettering(ctx, { text: spec.text, vertical: false, x: tx, y: pad * 0.6, w, h: spec.h - pad * 1.2, ink, emboss, face: spec.face, rtl })
    if (spec.gear) drawGear(ctx, rtl ? pad + gearW * 0.5 : spec.w - pad - gearW * 0.5, spec.h / 2, Math.min(spec.h * 0.3, gearW * 0.42), ink, 8)
  }
  return { color: c }
}

// ------------------------------------------------------------------ 桜・葉のカード

/**
 * 桜の花房カード（2×2 のアトラス）。1 つひとつの五弁の花・つぼみ・細い小枝で房を作り、
 * 輪郭が花の形になるようにする（カードの四角が見えないよう、外周はまばらな花だけ）。
 */
export function paintBlossomCard(S = 1024, seed = 9): Painted {
  const rng = mulberry32(seed)
  const [c, ctx] = makeCanvas(S)
  ctx.clearRect(0, 0, S, S)
  const Q = S / 2
  const flower = (x: number, y: number, r: number, rot: number, light: number, depth: number) => {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    // 奥の花ほど濃い桃色・少し暗い
    const hue = 340 + light * 8
    const sat = 0.55 + depth * 0.3
    const lig = 0.94 - depth * 0.14 - (1 - light) * 0.06
    for (let p = 0; p < 5; p++) {
      ctx.rotate((Math.PI * 2) / 5)
      const g = ctx.createLinearGradient(0, 0, 0, -r)
      g.addColorStop(0, hsl(hue - 6, sat + 0.15, lig - 0.12))
      g.addColorStop(0.6, hsl(hue, sat, lig))
      g.addColorStop(1, hsl(hue + 4, sat - 0.1, Math.min(0.98, lig + 0.04)))
      ctx.fillStyle = g
      // 花びら（先に切れ込み）
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.bezierCurveTo(-r * 0.55, -r * 0.25, -r * 0.5, -r * 0.95, -r * 0.14, -r * 1.0)
      ctx.lineTo(0, -r * 0.86)
      ctx.lineTo(r * 0.14, -r * 1.0)
      ctx.bezierCurveTo(r * 0.5, -r * 0.95, r * 0.55, -r * 0.25, 0, 0)
      ctx.fill()
    }
    ctx.fillStyle = hsl(338, 0.7, 0.55 - depth * 0.1)
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2)
    ctx.fill()
    // しべ
    ctx.fillStyle = 'rgba(255,214,120,0.9)'
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, r * 0.06, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * Q
    const oy = Math.floor(q / 2) * Q
    const cx = ox + Q / 2
    const cy = oy + Q / 2
    const R = Q * 0.4
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox + 4, oy + 4, Q - 8, Q - 8)
    ctx.clip()
    // 小枝（房を支える茶色の細枝）
    ctx.strokeStyle = '#7a4a3a'
    ctx.lineCap = 'round'
    for (let k = 0; k < 2; k++) {
      const a = range(rng, 0, Math.PI * 2)
      ctx.lineWidth = range(rng, 2.5, 4)
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9)
      ctx.quadraticCurveTo(cx + range(rng, -20, 20), cy + range(rng, -20, 20), cx + Math.cos(a + 2.6) * R * 0.5, cy + Math.sin(a + 2.6) * R * 0.5)
      ctx.stroke()
    }
    // 房の芯：奥の花をぎっしり（隙間を埋める）
    const n = 60 + q * 8
    const items: Array<{ x: number; y: number; r: number; d: number }> = []
    for (let k = 0; k < n; k++) {
      const a = range(rng, 0, Math.PI * 2)
      const rr = Math.pow(rng(), 0.7) * R
      // 房の形を少しいびつに
      const wob = 1 + 0.18 * Math.sin(a * 3 + q * 1.7)
      items.push({ x: cx + Math.cos(a) * rr * wob, y: cy + Math.sin(a) * rr * wob * 0.92, r: range(rng, 17, 27) * (1 - (rr / R) * 0.25), d: rr / R })
    }
    // 中心から遠い順（外側→内側）ではなく、奥（ランダムな深さ）から手前へ
    items.sort(() => rng() - 0.5)
    items.forEach((it, i) => flower(it.x, it.y, it.r, range(rng, 0, 6.28), rng(), Math.max(0, 0.7 - i / items.length) * (1 - it.d * 0.5)))
    // つぼみ（外周にまばら）
    for (let k = 0; k < 10; k++) {
      const a = range(rng, 0, Math.PI * 2)
      const rr = R * range(rng, 0.85, 1.1)
      ctx.fillStyle = hsl(338, 0.75, 0.68)
      ctx.beginPath()
      ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 6, 9, a, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  return { color: c }
}

export function paintLeafCard(S = 256, seed = 4): Painted {
  const rng = mulberry32(seed)
  const [c, ctx] = makeCanvas(S)
  ctx.clearRect(0, 0, S, S)
  for (let k = 0; k < 90; k++) {
    const a = range(rng, 0, Math.PI * 2)
    const rr = Math.sqrt(rng()) * S * 0.42
    const x = S / 2 + Math.cos(a) * rr
    const y = S / 2 + Math.sin(a) * rr
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(range(rng, 0, 6.28))
    ctx.fillStyle = hsl(range(rng, 85, 115), range(rng, 0.45, 0.65), range(rng, 0.32, 0.5))
    ctx.beginPath()
    ctx.ellipse(0, 0, range(rng, 7, 11), range(rng, 14, 22), 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  return { color: c }
}

// ------------------------------------------------------------------ 水・泡・粒子

export function paintWaterNormal(S = 512): HTMLCanvasElement {
  const H = new Float32Array(S * S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      H[y * S + x] = noiseA.fbm(u, v, 6, 5, 0.5) * 0.7 + noiseB.fbm(u, v, 3, 3, 0.5, 9) * 0.3
    }
  }
  return heightToNormal(H, S, S, 6)
}

export function paintFoam(S = 256): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(S)
  const img = ctx.createImageData(S, S)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S
      const v = y / S
      const n = noiseA.fbm(u, v, 8, 4, 0.55)
      const m = noiseB.fbm(u, v, 16, 3, 0.5)
      const f = smooth(0.42, 0.62, n) * (0.6 + 0.4 * m)
      const i = (y * S + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = f * 255
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

export function paintSoftDot(S = 64): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(S)
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return c
}

export function paintPetal(S = 64): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(S)
  ctx.clearRect(0, 0, S, S)
  const g = ctx.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, '#ffd6e4')
  g.addColorStop(1, '#f59ab8')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(S / 2, S * 0.95)
  ctx.bezierCurveTo(S * 0.05, S * 0.6, S * 0.15, S * 0.1, S * 0.42, S * 0.12)
  ctx.lineTo(S / 2, S * 0.24)
  ctx.lineTo(S * 0.58, S * 0.12)
  ctx.bezierCurveTo(S * 0.85, S * 0.1, S * 0.95, S * 0.6, S / 2, S * 0.95)
  ctx.fill()
  return c
}

export function paintNoiseNormal(S = 256, freq = 16, strength = 2): HTMLCanvasElement {
  const H = new Float32Array(S * S)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) H[y * S + x] = noiseB.fbm(x / S, y / S, freq, 4)
  return heightToNormal(H, S, S, strength)
}

// ------------------------------------------------------------------ 共通：キャンバス→テクスチャ

export function tex(c: HTMLCanvasElement, srgb: boolean, aniso = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = aniso
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
}

export function randomRng(seed: number): Rng {
  return mulberry32(seed)
}
