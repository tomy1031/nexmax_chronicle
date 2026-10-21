// 人の顔（キャンバスに描いた表情の並び）。頭の前の面（球の一部）に貼り、表情は UV のずらしで切りかえる。
// 1 枚に 8 つの表情（4 列 × 2 段）。同じ顔の作り（key）は 1 枚の絵を共有し、人ごとに複製（GPU の絵は共有）して使う。
import * as THREE from 'three'

export const EXPRESSIONS = ['neutral', 'smile', 'laugh', 'sad', 'cry', 'shout', 'surprised', 'closed'] as const
export type Expression = (typeof EXPRESSIONS)[number]

export type FaceStyle = {
  skin: string
  /** 目の色（ひとみ） */
  eye: string
  /** まゆ・まつげの色 */
  brow: string
  /** 目の大きさ（子どもは大きく） */
  eyeScale?: number
  /** ほおの赤み（0..1） */
  blush?: number
  /** まつげ（女の人） */
  lashes?: boolean
  /** しわ（お年寄り） */
  wrinkles?: boolean
  /** めがねの色（無ければ無し） */
  glasses?: string | null
  /** 目と目のあいだ（既定 1） */
  eyeGap?: number
  /** まゆの太さ（既定 1） */
  browW?: number
}

/** 顔の面（球の一部）の範囲。描く位置の計算と、面のジオメトリで共有する */
export const FACE_PATCH = {
  /** 横の広さ（ラジアン） */
  phiLen: 2.2,
  /** 上からの角度の始まりと広さ（ラジアン） */
  theta0: Math.PI * 0.28,
  thetaLen: Math.PI * 0.5,
}

const CELL = 192
const COLS = 4
const ROWS = 2

const sources = new Map<string, THREE.CanvasTexture>()

/** 顔の絵（同じ key は 1 枚を共有した複製）。expression で表情をえらぶ */
export function faceTexture(key: string, style: FaceStyle): THREE.CanvasTexture {
  let src = sources.get(key)
  if (!src) {
    src = new THREE.CanvasTexture(paintFaceAtlas(style))
    src.colorSpace = THREE.SRGBColorSpace
    src.anisotropy = 4
    sources.set(key, src)
  }
  const t = src.clone()
  t.repeat.set(1 / COLS, 1 / ROWS)
  setFaceExpression(t, 'neutral')
  return t
}

export function setFaceExpression(t: THREE.Texture, e: Expression): void {
  const i = Math.max(0, EXPRESSIONS.indexOf(e))
  const col = i % COLS
  const row = Math.floor(i / COLS)
  t.offset.set(col / COLS, 1 - (row + 1) / ROWS)
}

/** 仮面の絵（白い面・目の穴・ふちの線・紫の涙のしるし） */
let maskSrc: THREE.CanvasTexture | null = null
export function maskTexture(): THREE.CanvasTexture {
  if (maskSrc) return maskSrc.clone()
  const S = 256
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.clearRect(0, 0, S, S)
  // 顔の面の UV → 仮面の形（目の上から口の下まで、少し縦長のたまご形）
  const P = facePoint(S)
  const top = P(0, -0.24)
  const bottom = P(0, 0.34)
  const cx = top[0]
  const cy = (top[1] + bottom[1]) / 2
  const ry = (bottom[1] - top[1]) / 2
  const rx = S * 0.35
  g.beginPath()
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  const grd = g.createLinearGradient(0, cy - ry, 0, cy + ry)
  grd.addColorStop(0, '#ffffff')
  grd.addColorStop(1, '#e6e4ee')
  g.fillStyle = grd
  g.fill()
  g.lineWidth = 5
  g.strokeStyle = '#2a2236'
  g.stroke()
  // 目の穴（つり上がった大きなアーモンド形。中は黒、ふちに紫）
  for (const sd of [-1, 1]) {
    const [ex, ey] = P(sd * 0.36, 0.0)
    g.save()
    g.translate(ex, ey)
    g.rotate(sd * -0.28)
    g.beginPath()
    g.moveTo(-S * 0.075, 0)
    g.quadraticCurveTo(0, -S * 0.095, S * 0.075, 0)
    g.quadraticCurveTo(0, S * 0.06, -S * 0.075, 0)
    g.closePath()
    g.fillStyle = '#07040c'
    g.fill()
    g.lineWidth = 4
    g.strokeStyle = '#5a2a9a'
    g.stroke()
    g.restore()
  }
  // 片目の下の紫の涙のしるし（太い線としずく）
  {
    const [ex, ey] = P(0.36, 0.0)
    g.strokeStyle = '#7a3cc8'
    g.lineWidth = 6
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(ex + S * 0.01, ey + S * 0.06)
    g.quadraticCurveTo(ex + S * 0.02, ey + S * 0.12, ex + S * 0.006, ey + S * 0.18)
    g.stroke()
    g.fillStyle = '#7a3cc8'
    g.beginPath()
    g.arc(ex + S * 0.006, ey + S * 0.2, S * 0.014, 0, Math.PI * 2)
    g.fill()
  }
  // 額のすじ（左右の線）
  {
    const [mx, my] = P(0, -0.15)
    g.strokeStyle = '#c8c4d4'
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(mx, my - S * 0.04)
    g.lineTo(mx, my + S * 0.05)
    g.stroke()
  }
  maskSrc = new THREE.CanvasTexture(c)
  maskSrc.colorSpace = THREE.SRGBColorSpace
  maskSrc.anisotropy = 4
  return maskSrc.clone()
}

/**
 * 顔の面の上の点（x：左右 -1..1 → 目のあいだの基準の広さ、y：目の高さを 0 とした上下）→ キャンバスの座標。
 * 目は x=±0.36、口は y≈0.2、まゆは y≈-0.12
 */
function facePoint(S: number): (x: number, y: number) => [number, number] {
  const eyeTheta = Math.PI * 0.535
  return (x: number, y: number) => {
    const phi = x // 目は ±0.36 rad（頭の幅のおよそ 3 分の 1）
    const theta = eyeTheta + y * Math.PI * 0.5
    const u = 0.5 + phi / FACE_PATCH.phiLen
    const v = (theta - FACE_PATCH.theta0) / FACE_PATCH.thetaLen
    return [u * S, v * S]
  }
}

function paintFaceAtlas(st: FaceStyle): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = CELL * COLS
  c.height = CELL * ROWS
  const g = c.getContext('2d') as CanvasRenderingContext2D
  EXPRESSIONS.forEach((e, i) => {
    g.save()
    g.translate((i % COLS) * CELL, Math.floor(i / COLS) * CELL)
    g.beginPath()
    g.rect(0, 0, CELL, CELL)
    g.clip()
    paintFace(g, CELL, st, e)
    g.restore()
  })
  return c
}

function paintFace(g: CanvasRenderingContext2D, S: number, st: FaceStyle, e: Expression): void {
  const P = facePoint(S)
  const es = st.eyeScale ?? 1
  const gap = st.eyeGap ?? 1
  g.fillStyle = st.skin
  g.fillRect(0, 0, S, S)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  // ほおの赤み
  const blush = (st.blush ?? 0.35) * (e === 'laugh' || e === 'smile' ? 1.3 : e === 'cry' ? 1.4 : 1)
  if (blush > 0) {
    for (const s of [-1, 1]) {
      const [bx, by] = P(s * 0.52 * gap, 0.12)
      const rg = g.createRadialGradient(bx, by, 0, bx, by, S * 0.06)
      rg.addColorStop(0, `rgba(255,120,130,${Math.min(0.75, blush * 0.6)})`)
      rg.addColorStop(1, 'rgba(255,120,130,0)')
      g.fillStyle = rg
      g.fillRect(bx - S * 0.08, by - S * 0.08, S * 0.16, S * 0.16)
    }
  }
  // しわ（目じり・ほうれい線をうすく）
  if (st.wrinkles) {
    g.strokeStyle = 'rgba(120,70,50,0.45)'
    g.lineWidth = S * 0.007
    for (const s of [-1, 1]) {
      const [x0, y0] = P(s * 0.58 * gap, -0.01)
      for (let k = -1; k <= 1; k++) {
        g.beginPath()
        g.moveTo(x0, y0 + k * S * 0.012)
        g.lineTo(x0 + s * S * 0.03, y0 + k * S * 0.02)
        g.stroke()
      }
      const [n0x, n0y] = P(s * 0.2, 0.1)
      const [n1x, n1y] = P(s * 0.27, 0.22)
      g.beginPath()
      g.moveTo(n0x, n0y)
      g.quadraticCurveTo(n0x + s * S * 0.025, (n0y + n1y) / 2, n1x, n1y)
      g.stroke()
    }
  }
  // 目
  for (const s of [-1, 1]) {
    const [ex, ey] = P(s * 0.36 * gap, 0)
    eye(g, S, ex, ey, s, es, st, e)
  }
  // まゆ
  brows(g, S, P, st, e, gap)
  // 鼻（小さな影）
  {
    const [nx, ny] = P(0, 0.1)
    g.strokeStyle = 'rgba(150,80,60,0.55)'
    g.lineWidth = S * 0.008
    g.beginPath()
    g.moveTo(nx - S * 0.004, ny - S * 0.008)
    g.lineTo(nx + S * 0.006, ny + S * 0.006)
    g.stroke()
  }
  // 口
  mouth(g, S, P, e)
  // 涙
  if (e === 'cry') {
    for (const s of [-1, 1]) {
      const [tx, ty] = P(s * 0.4 * gap, 0.05)
      g.fillStyle = 'rgba(150,215,255,0.95)'
      g.beginPath()
      g.moveTo(tx, ty)
      g.quadraticCurveTo(tx + S * 0.016, ty + S * 0.05, tx, ty + S * 0.065)
      g.quadraticCurveTo(tx - S * 0.016, ty + S * 0.05, tx, ty)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.9)'
      g.beginPath()
      g.arc(tx - S * 0.003, ty + S * 0.045, S * 0.005, 0, Math.PI * 2)
      g.fill()
    }
  }
  // めがね
  if (st.glasses) {
    g.strokeStyle = st.glasses
    g.lineWidth = S * 0.011
    for (const s of [-1, 1]) {
      const [ex, ey] = P(s * 0.36 * gap, 0.01)
      g.beginPath()
      g.ellipse(ex, ey, S * 0.078 * es, S * 0.064 * es, 0, 0, Math.PI * 2)
      g.stroke()
    }
    const [a] = P(-0.36 * gap + 0.26 * es, 0)
    const [b] = P(0.36 * gap - 0.26 * es, 0)
    const [, y] = P(0, -0.02)
    g.beginPath()
    g.moveTo(a, y)
    g.quadraticCurveTo((a + b) / 2, y - S * 0.012, b, y)
    g.stroke()
  }
}

function eye(g: CanvasRenderingContext2D, S: number, x: number, y: number, side: number, es: number, st: FaceStyle, e: Expression): void {
  const w = S * 0.056 * es
  const h = S * 0.082 * es
  const line = st.brow
  if (e === 'laugh' || e === 'closed') {
    // 閉じた目：笑い（∩）・おだやか（∪）
    g.strokeStyle = line
    g.lineWidth = S * 0.022
    g.beginPath()
    if (e === 'laugh') {
      g.moveTo(x - w * 1.25, y + h * 0.2)
      g.quadraticCurveTo(x, y - h * 0.75, x + w * 1.25, y + h * 0.2)
    } else {
      g.moveTo(x - w * 1.2, y)
      g.quadraticCurveTo(x, y + h * 0.5, x + w * 1.2, y)
    }
    g.stroke()
    if (st.lashes) {
      g.lineWidth = S * 0.009
      g.beginPath()
      g.moveTo(x + side * w * 1.2, y + (e === 'laugh' ? h * 0.2 : 0))
      g.lineTo(x + side * w * 1.55, y + (e === 'laugh' ? h * 0.05 : -h * 0.15))
      g.stroke()
    }
    return
  }
  const squint = e === 'shout' ? 0.78 : e === 'smile' ? 0.88 : 1
  const round = e === 'surprised'
  const hh = h * squint
  // 白目
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(x, y, w * (round ? 1.25 : 1.32), hh * (round ? 1.08 : 1), 0, 0, Math.PI * 2)
  g.fill()
  // ひとみ
  const iw = w * (round ? 0.72 : 0.95)
  const ih = hh * (round ? 0.72 : 0.92)
  const iy = y + hh * (round ? 0.02 : 0.06)
  const grd = g.createLinearGradient(0, iy - ih, 0, iy + ih)
  grd.addColorStop(0, shade(st.eye, -0.45))
  grd.addColorStop(0.55, st.eye)
  grd.addColorStop(1, shade(st.eye, 0.35))
  g.fillStyle = grd
  g.beginPath()
  g.ellipse(x, iy, iw, ih, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = shade(st.eye, -0.7)
  g.beginPath()
  g.ellipse(x, iy + ih * 0.05, iw * 0.45, ih * 0.5, 0, 0, Math.PI * 2)
  g.fill()
  // ひかり
  const wet = e === 'cry' || e === 'sad'
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(x - iw * 0.35, iy - ih * 0.4, iw * (wet ? 0.42 : 0.32), ih * (wet ? 0.3 : 0.24), -0.4, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.arc(x + iw * 0.38, iy + ih * 0.42, iw * (wet ? 0.2 : 0.14), 0, Math.PI * 2)
  g.fill()
  if (wet) {
    // うるんだ下まぶたの水
    g.strokeStyle = 'rgba(160,220,255,0.95)'
    g.lineWidth = S * 0.01
    g.beginPath()
    g.moveTo(x - w * 1.1, y + hh * 0.85)
    g.quadraticCurveTo(x, y + hh * 1.2, x + w * 1.1, y + hh * 0.85)
    g.stroke()
  }
  // 上まぶたの線（まつげ）
  g.strokeStyle = line
  g.lineWidth = S * (st.lashes ? 0.026 : 0.021)
  g.beginPath()
  const lidY = y - hh * (round ? 1.05 : 0.92)
  g.moveTo(x - w * 1.4, y - hh * 0.25)
  g.quadraticCurveTo(x - w * 0.2, lidY - hh * 0.28, x + w * 1.4, y - hh * 0.25)
  g.stroke()
  if (st.lashes) {
    g.lineWidth = S * 0.01
    g.beginPath()
    g.moveTo(x + side * w * 1.35, y - hh * 0.3)
    g.lineTo(x + side * w * 1.75, y - hh * 0.6)
    g.stroke()
  }
  if (e === 'smile') {
    // にっこりの下まぶた
    g.strokeStyle = line
    g.lineWidth = S * 0.008
    g.beginPath()
    g.moveTo(x - w * 0.9, y + hh * 0.95)
    g.quadraticCurveTo(x, y + hh * 0.7, x + w * 0.9, y + hh * 0.95)
    g.stroke()
  }
}

function brows(g: CanvasRenderingContext2D, S: number, P: (x: number, y: number) => [number, number], st: FaceStyle, e: Expression, gap: number): void {
  g.strokeStyle = st.brow
  g.lineWidth = S * 0.018 * (st.browW ?? 1)
  for (const s of [-1, 1]) {
    // 内側（鼻に近い方）と外側の高さ
    let yi = -0.14
    let yo = -0.15
    if (e === 'sad' || e === 'cry') {
      yi = -0.19
      yo = -0.12
    } else if (e === 'shout') {
      yi = -0.09
      yo = -0.17
    } else if (e === 'surprised') {
      yi = -0.2
      yo = -0.2
    } else if (e === 'laugh' || e === 'smile') {
      yi = -0.16
      yo = -0.16
    }
    const [ax, ay] = P(s * 0.18 * gap, yi)
    const [bx, by] = P(s * 0.52 * gap, yo)
    const [mx, my] = P(s * 0.35 * gap, Math.min(yi, yo) - 0.03)
    g.beginPath()
    g.moveTo(ax, ay)
    g.quadraticCurveTo(mx, my, bx, by)
    g.stroke()
  }
}

function mouth(g: CanvasRenderingContext2D, S: number, P: (x: number, y: number) => [number, number], e: Expression): void {
  const [mx, my] = P(0, 0.205)
  const ink = '#5a2a22'
  const inside = '#a8323a'
  const tongue = '#ff8a8a'
  g.strokeStyle = ink
  g.lineWidth = S * 0.016
  const w = S * 0.052 * (e === 'laugh' ? 1.3 : 1)
  g.beginPath()
  switch (e) {
    case 'smile':
      g.moveTo(mx - w * 1.1, my - S * 0.006)
      g.quadraticCurveTo(mx, my + S * 0.03, mx + w * 1.1, my - S * 0.006)
      g.stroke()
      break
    case 'laugh': {
      g.moveTo(mx - w * 1.3, my - S * 0.012)
      g.quadraticCurveTo(mx, my - S * 0.004, mx + w * 1.3, my - S * 0.012)
      g.quadraticCurveTo(mx, my + S * 0.112, mx - w * 1.3, my - S * 0.012)
      g.fillStyle = inside
      g.fill()
      g.stroke()
      g.fillStyle = '#fff6e8'
      g.beginPath()
      g.moveTo(mx - w * 1.05, my - S * 0.006)
      g.lineTo(mx + w * 1.05, my - S * 0.006)
      g.quadraticCurveTo(mx, my + S * 0.025, mx - w * 1.05, my - S * 0.006)
      g.fill()
      g.fillStyle = tongue
      g.beginPath()
      g.ellipse(mx, my + S * 0.049, w * 0.6, S * 0.0196, 0, 0, Math.PI * 2)
      g.fill()
      break
    }
    case 'sad':
      g.moveTo(mx - w * 0.8, my + S * 0.012)
      g.quadraticCurveTo(mx, my - S * 0.012, mx + w * 0.8, my + S * 0.012)
      g.stroke()
      break
    case 'cry':
      g.moveTo(mx - w * 0.95, my + S * 0.01)
      g.quadraticCurveTo(mx - w * 0.5, my - S * 0.012, mx, my + S * 0.004)
      g.quadraticCurveTo(mx + w * 0.5, my - S * 0.012, mx + w * 0.95, my + S * 0.01)
      g.stroke()
      break
    case 'shout': {
      g.moveTo(mx - w * 1.0, my - S * 0.01)
      g.lineTo(mx + w * 1.0, my - S * 0.01)
      g.quadraticCurveTo(mx + w * 0.8, my + S * 0.06, mx, my + S * 0.062)
      g.quadraticCurveTo(mx - w * 0.8, my + S * 0.06, mx - w * 1.0, my - S * 0.01)
      g.fillStyle = inside
      g.fill()
      g.stroke()
      break
    }
    case 'surprised':
      g.ellipse(mx, my + S * 0.012, w * 0.38, S * 0.024, 0, 0, Math.PI * 2)
      g.fillStyle = inside
      g.fill()
      g.stroke()
      break
    case 'closed':
    case 'neutral':
    default:
      g.moveTo(mx - w * 0.7, my)
      g.quadraticCurveTo(mx, my + S * 0.012, mx + w * 0.7, my)
      g.stroke()
  }
}

/** 色を明るく（k>0）・暗く（k<0） */
function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex)
  if (k > 0) c.lerp(new THREE.Color('#ffffff'), k)
  else c.multiplyScalar(1 + k)
  return '#' + c.getHexString()
}

/** 顔の面（球の一部）の形。頭の球（半径 1）に合わせて少し外側に */
export function facePatchGeometry(radius = 1.012, seg = 22): THREE.BufferGeometry {
  const P = FACE_PATCH
  return new THREE.SphereGeometry(radius, seg, Math.round(seg * 0.75), -Math.PI / 2 - P.phiLen / 2, P.phiLen, P.theta0, P.thetaLen)
}
