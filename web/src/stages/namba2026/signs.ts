// 2026年 なんばの看板：1 枚の大きなキャンバス（アトラス）に全部の看板を描き、メッシュは UV でその一部を使う。
// 実在の商標・ロゴは描かない（「たこ焼」「串カツ」「うどん」「お好み焼」「大阪」「なんば」などの一般的な文字だけ）。
// NEXTMAKE / NEXMAX / IDO はこのゲームの作者のもの。現代の看板は左→右の横書き（setLettering の江戸の規則は使わない）。
import * as THREE from 'three'
import { makeCanvas, tex } from '../../render/textures'

export type SignFont = 'gothic' | 'brush' | 'round' | 'mincho'

export type SignDef = {
  id: string
  /** 文字（\n で改行） */
  text: string
  /** 小さな副題（ローマ字など） */
  sub?: string
  vertical?: boolean
  /** アトラス上の大きさ（px） */
  w: number
  h: number
  bg: string
  /** 2 色目（縦のグラデーション） */
  bg2?: string
  fg: string
  /** 縁取りの色（無ければ縁なし） */
  border?: string
  /** 文字の縁取り */
  outline?: string
  font?: SignFont
  /** 飾り：dots（電球の縁）、stripe（上下の帯）、lantern（提灯の骨）、logo（NEXTMAKE の三角マーク） */
  deco?: 'dots' | 'stripe' | 'lantern' | 'logo' | 'none'
  /** 文字の大きさの上限（px） */
  maxSize?: number
}

export type UVRect = { u0: number; v0: number; u1: number; v1: number }

const FAMILY: Record<SignFont, string> = {
  gothic: '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif',
  brush: '"Yuji Boku","Hiragino Mincho ProN","Yu Mincho",serif',
  round: '"M PLUS Rounded 1c","Hiragino Maru Gothic ProN",sans-serif',
  mincho: '"Hiragino Mincho ProN","Yu Mincho",serif',
}
const WEIGHT: Record<SignFont, string> = { gothic: '900', brush: '400', round: '800', mincho: '900' }

function font(f: SignFont, px: number): string {
  return `${WEIGHT[f]} ${px}px ${FAMILY[f]}`
}

/** 横書きで (x,y,w,h) に収まるように 1 行ずつ描く */
function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, f: SignFont, fill: string, outline?: string, maxSize = 1e9): void {
  const lines = text.split('\n')
  const lh = h / lines.length
  lines.forEach((line, i) => {
    let size = Math.min(lh * 0.86, maxSize)
    g.font = font(f, size)
    const mw = g.measureText(line).width
    if (mw > w) {
      size *= w / mw
      g.font = font(f, size)
    }
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    const cy = y + lh * (i + 0.5) + size * 0.04
    if (outline) {
      g.lineJoin = 'round'
      g.lineWidth = size * 0.14
      g.strokeStyle = outline
      g.strokeText(line, x + w / 2, cy)
    }
    g.fillStyle = fill
    g.fillText(line, x + w / 2, cy)
  })
}

/** 縦書き（1 列。長音などは回す） */
function fitVertical(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, f: SignFont, fill: string, outline?: string, maxSize = 1e9): void {
  const chars = [...text.replace(/\n/g, '')]
  const step = h / chars.length
  const size = Math.min(w * 0.86, step * 0.92, maxSize)
  g.font = font(f, size)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  chars.forEach((ch, i) => {
    const cx = x + w / 2
    const cy = y + step * (i + 0.5)
    g.save()
    g.translate(cx, cy)
    if ('ー〜～…'.includes(ch)) g.rotate(Math.PI / 2)
    if (outline) {
      g.lineJoin = 'round'
      g.lineWidth = size * 0.14
      g.strokeStyle = outline
      g.strokeText(ch, 0, size * 0.04)
    }
    g.fillStyle = fill
    g.fillText(ch, 0, size * 0.04)
    g.restore()
  })
}

/** NEXTMAKE の三角マーク（山形に切れ込みのある三角） */
export function drawNextmakeMark(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string, accent: string): void {
  g.save()
  g.translate(cx, cy)
  g.fillStyle = color
  g.beginPath()
  g.moveTo(0, -s * 0.55)
  g.lineTo(s * 0.55, s * 0.45)
  g.lineTo(-s * 0.55, s * 0.45)
  g.closePath()
  g.fill()
  g.fillStyle = accent
  g.beginPath()
  g.moveTo(-s * 0.08, -s * 0.05)
  g.lineTo(s * 0.26, s * 0.45)
  g.lineTo(-s * 0.42, s * 0.45)
  g.closePath()
  g.fill()
  g.restore()
}

function paintSign(g: CanvasRenderingContext2D, d: SignDef, x: number, y: number): void {
  const { w, h } = d
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  if (d.bg2) {
    const gr = g.createLinearGradient(0, y, 0, y + h)
    gr.addColorStop(0, d.bg)
    gr.addColorStop(1, d.bg2)
    g.fillStyle = gr
  } else g.fillStyle = d.bg
  g.fillRect(x, y, w, h)
  const b = Math.min(w, h) * 0.06
  if (d.deco === 'lantern') {
    // 提灯：縦の骨と上下の黒い枠
    g.strokeStyle = 'rgba(0,0,0,0.22)'
    g.lineWidth = Math.max(2, h * 0.012)
    for (let k = 1; k < 9; k++) {
      g.beginPath()
      g.moveTo(x, y + (h * k) / 9)
      g.lineTo(x + w, y + (h * k) / 9)
      g.stroke()
    }
    g.fillStyle = '#1b1410'
    g.fillRect(x, y, w, h * 0.06)
    g.fillRect(x, y + h * 0.94, w, h * 0.06)
  }
  if (d.deco === 'stripe') {
    g.fillStyle = d.border ?? '#000'
    g.fillRect(x, y, w, h * 0.1)
    g.fillRect(x, y + h * 0.9, w, h * 0.1)
  }
  const pad = d.deco === 'dots' ? b * 2.2 : b * 1.4
  let tx = x + pad
  let tw = w - pad * 2
  const ty = y + pad + (d.deco === 'stripe' ? h * 0.08 : 0)
  let th = h - pad * 2 - (d.deco === 'stripe' ? h * 0.16 : 0)
  if (d.deco === 'logo') {
    const ms = h * 0.62
    drawNextmakeMark(g, x + pad + ms * 0.55, y + h / 2, ms, d.fg, '#f2c84b')
    tx += ms * 1.15
    tw -= ms * 1.15
  }
  const f = d.font ?? 'gothic'
  if (d.sub) {
    const subH = th * (d.vertical ? 0.12 : 0.26)
    if (d.vertical) {
      fitVertical(g, d.text, tx, ty, tw, th - subH, f, d.fg, d.outline, d.maxSize)
      fitText(g, d.sub, tx, ty + th - subH, tw, subH, 'gothic', d.fg)
    } else {
      fitText(g, d.text, tx, ty, tw, th - subH, f, d.fg, d.outline, d.maxSize)
      fitText(g, d.sub, tx, ty + th - subH, tw, subH * 0.9, 'gothic', d.fg)
    }
  } else if (d.vertical) fitVertical(g, d.text, tx, ty, tw, th, f, d.fg, d.outline, d.maxSize)
  else fitText(g, d.text, tx, ty, tw, th, f, d.fg, d.outline, d.maxSize)
  if (d.border && d.deco !== 'stripe' && d.deco !== 'lantern') {
    g.strokeStyle = d.border
    g.lineWidth = b
    g.strokeRect(x + b / 2, y + b / 2, w - b, h - b)
  }
  if (d.deco === 'dots') {
    // 縁の電球
    const r = b * 0.42
    g.fillStyle = '#fff6d0'
    const n = Math.max(4, Math.round((w + h) / (b * 2.4)))
    const per = (2 * (w + h)) / n
    for (let i = 0; i < n; i++) {
      let s = i * per
      let px: number
      let py: number
      if (s < w) {
        px = x + s
        py = y + b
      } else if ((s -= w) < h) {
        px = x + w - b
        py = y + s
      } else if ((s -= h) < w) {
        px = x + w - s
        py = y + h - b
      } else {
        s -= w
        px = x + b
        py = y + h - s
      }
      g.beginPath()
      g.arc(px, py, r, 0, Math.PI * 2)
      g.fill()
    }
  }
  // 少しの汚れ・つや
  const gl = g.createLinearGradient(x, y, x + w, y + h)
  gl.addColorStop(0, 'rgba(255,255,255,0.10)')
  gl.addColorStop(0.5, 'rgba(255,255,255,0)')
  gl.addColorStop(1, 'rgba(0,0,0,0.10)')
  g.fillStyle = gl
  g.fillRect(x, y, w, h)
  g.restore()
}

/** 看板のアトラス（棚詰め）。add で登録してから build する */
export class SignAtlas {
  readonly size: number
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private readonly rects = new Map<string, UVRect>()
  private x = 0
  private y = 0
  private rowH = 0

  constructor(size = 2048) {
    this.size = size
    const [c, g] = makeCanvas(size, size)
    this.canvas = c
    this.g = g
    g.fillStyle = '#808080'
    g.fillRect(0, 0, size, size)
  }

  add(d: SignDef): UVRect {
    const gap = 4
    if (this.x + d.w > this.size) {
      this.x = 0
      this.y += this.rowH + gap
      this.rowH = 0
    }
    if (this.y + d.h > this.size) {
      console.warn('[signs] アトラスがいっぱいです', d.id)
      return { u0: 0, v0: 0, u1: 0.01, v1: 0.01 }
    }
    paintSign(this.g, d, this.x, this.y)
    const r = this.rectOf(this.x, this.y, d.w, d.h)
    this.rects.set(d.id, r)
    this.x += d.w + gap
    this.rowH = Math.max(this.rowH, d.h)
    return r
  }

  /** 自由に描く（描画関数は (g, x, y, w, h) を受け取る） */
  addCustom(id: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void): UVRect {
    const gap = 4
    if (this.x + w > this.size) {
      this.x = 0
      this.y += this.rowH + gap
      this.rowH = 0
    }
    if (this.y + h > this.size) {
      console.warn('[signs] アトラスがいっぱいです', id)
      return { u0: 0, v0: 0, u1: 0.01, v1: 0.01 }
    }
    this.g.save()
    this.g.beginPath()
    this.g.rect(this.x, this.y, w, h)
    this.g.clip()
    draw(this.g, this.x, this.y, w, h)
    this.g.restore()
    const r = this.rectOf(this.x, this.y, w, h)
    this.rects.set(id, r)
    this.x += w + gap
    this.rowH = Math.max(this.rowH, h)
    return r
  }

  /** 使った高さ（px。アトラスの空きを確かめる） */
  get usedHeight(): number {
    return this.y + this.rowH
  }

  get(id: string): UVRect {
    return this.rects.get(id) ?? { u0: 0, v0: 0, u1: 0.01, v1: 0.01 }
  }

  private rectOf(x: number, y: number, w: number, h: number): UVRect {
    // テクスチャは flipY（キャンバスの上 = v=1）
    const S = this.size
    return { u0: (x + 0.5) / S, u1: (x + w - 0.5) / S, v1: 1 - (y + 0.5) / S, v0: 1 - (y + h - 0.5) / S }
  }

  texture(aniso: number): THREE.CanvasTexture {
    const t = tex(this.canvas, true, aniso)
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    return t
  }
}

/** ジオメトリの UV（0〜1）をアトラスの矩形へ写す */
export function mapUV(g: THREE.BufferGeometry, r: UVRect): THREE.BufferGeometry {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0))
  uv.needsUpdate = true
  return g
}

/** 正面（+Z）だけにアトラスを貼った板（裏と縁は u0,v0 の 1 点＝枠の色） */
export function signPanel(w: number, h: number, r: UVRect, depth = 0.08): THREE.BufferGeometry {
  const front = new THREE.PlaneGeometry(w, h)
  mapUV(front, r)
  front.translate(0, 0, depth / 2 + 0.001)
  const back = new THREE.BoxGeometry(w, h, depth)
  const uv = back.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + 0.002, r.v0 + 0.002)
  const out = new THREE.BufferGeometry()
  // 結合（index を外して並べる）
  const a = front.toNonIndexed()
  const b = back.toNonIndexed()
  for (const name of ['position', 'normal', 'uv'] as const) {
    const A = a.attributes[name].array as Float32Array
    const B = b.attributes[name].array as Float32Array
    const arr = new Float32Array(A.length + B.length)
    arr.set(A)
    arr.set(B, A.length)
    out.setAttribute(name, new THREE.BufferAttribute(arr, name === 'uv' ? 2 : 3))
  }
  return out
}
