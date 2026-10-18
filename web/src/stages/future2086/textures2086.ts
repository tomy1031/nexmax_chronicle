// 2086年の会場のテクスチャ（キャンバスで描く）。文字は M PLUS Rounded 1c（未来の丸ゴシック）と、
// 祭りの提灯・のれんだけ筆文字（Yuji Boku）。フォントが無ければヒラギノなどへ落ちる。
// ・幟・横断幕・テント・のれんは 1 枚のアトラス（布のマテリアル 1 つ＝ドローコール 1）
// ・ホログラムの看板も 1 枚のアトラス（昼夜とも表示する祭りの看板、夜だけの緊急表示）
// ・IDO の展示画面（昔の大阪のホログラム）、提灯、窓、木箱の印刷
import * as THREE from 'three'
import { mulberry32, range } from '../../render/noise'

export const ROUNDED = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif'
export const MINCHO = '"Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif'
export const BRUSH = '"Yuji Boku", "Hiragino Mincho ProN", "Yu Mincho", serif'

/** 2086年のテクスチャに出てくる文字（フォントの先読み用） */
export const FUTURE_TEXT =
  '時代博覧祭なんばタウンNANBATOWNEXPO2086OSAKAIDO時を旅する大阪TIMEEXPERIENCEつなぎ、未来へ記憶次の時代へ。NEXMAX緊急事態正体不明の存在を確認避難ゲート展示たこ焼そばりんご飴金魚すくい個円大坂万博1726197020262086ナンバタウン取扱注意FRAGILEかき氷わたあめ本日STAGE→←0123456789'

export type UVRect = { u0: number; v0: number; u1: number; v1: number }

/** 1 枚のキャンバスに領域を詰めて描くアトラス（行ごとに左から） */
export class CanvasAtlas {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly rects = new Map<string, UVRect>()
  private x = 0
  private y = 0
  private rowH = 0
  private readonly pad = 8
  readonly W: number
  readonly H: number

  constructor(W: number, H: number) {
    this.W = W
    this.H = H
    this.canvas = document.createElement('canvas')
    this.canvas.width = W
    this.canvas.height = H
    this.ctx = this.canvas.getContext('2d')!
  }

  /** at を渡すとその位置（左上 px）に置く。無ければ行ごとに左から詰める */
  add(name: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, at?: [number, number]): UVRect {
    if (at) {
      this.x = at[0]
      this.y = at[1]
    } else if (this.x + w > this.W) {
      this.x = 0
      this.y += this.rowH + this.pad
      this.rowH = 0
    }
    if (this.y + h > this.H || this.x + w > this.W) console.warn(`[atlas] ${name} がはみ出しました`)
    const ctx = this.ctx
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    paint(ctx, w, h)
    ctx.restore()
    // CanvasTexture は flipY（キャンバスの上が v=1）
    const r: UVRect = { u0: this.x / this.W, u1: (this.x + w) / this.W, v0: 1 - (this.y + h) / this.H, v1: 1 - this.y / this.H }
    this.rects.set(name, r)
    this.x += w + this.pad
    this.rowH = Math.max(this.rowH, h)
    return r
  }

  get(name: string): UVRect {
    const r = this.rects.get(name)
    if (!r) throw new Error(`[atlas] ${name} がありません`)
    return r
  }

  texture(aniso = 8): THREE.CanvasTexture {
    const t = new THREE.CanvasTexture(this.canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = aniso
    t.generateMipmaps = true
    return t
  }
}

/** w×h の板（中心が原点、+Z 向き）の UV をアトラスの領域へ */
export function atlasPlane(w: number, h: number, r: UVRect, segX = 1, segY = 1): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h, segX, segY)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + (r.u1 - r.u0) * uv.getX(i), r.v0 + (r.v1 - r.v0) * uv.getY(i))
  return g
}

// ------------------------------------------------------------------ 描画の部品

function font(weight: number | string, px: number, family = ROUNDED): string {
  return `${weight} ${Math.round(px)}px ${family}`
}

/** 横幅に収まるよう文字の大きさを縮めて中央に描く */
export function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, weight: number | string = 800, family = ROUNDED, spacing = 0): void {
  let size = px
  ctx.font = font(weight, size, family)
  const measure = () => ctx.measureText(text).width + spacing * (text.length - 1)
  while (measure() > maxW && size > 8) {
    size *= 0.94
    ctx.font = font(weight, size, family)
  }
  if (spacing === 0) {
    ctx.fillText(text, x, y)
    return
  }
  const total = measure()
  let cx = x - total / 2
  const align = ctx.textAlign
  ctx.textAlign = 'left'
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + spacing
  }
  ctx.textAlign = align
}

/** 縦書き（1 文字ずつ下へ） */
function verticalText(ctx: CanvasRenderingContext2D, text: string, x: number, y0: number, px: number, weight: number | string, family: string, lead = 1.04): void {
  ctx.font = font(weight, px, family)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let y = y0 + px / 2
  for (const ch of text) {
    // 句読点は右上へ寄せる
    if (ch === '、' || ch === '。') ctx.fillText(ch, x + px * 0.55, y - px * 0.45)
    else if (ch === 'ー') {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(Math.PI / 2)
      ctx.fillText(ch, 0, 0)
      ctx.restore()
    } else ctx.fillText(ch, x, y)
    y += px * lead
  }
}

/** 桜の花（5 枚の花びら、先に切れ込み） */
export function drawSakura(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, center = '#ffffff', rot = 0): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rot)
  ctx.fillStyle = color
  for (let i = 0; i < 5; i++) {
    ctx.save()
    ctx.rotate((i / 5) * Math.PI * 2)
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.bezierCurveTo(-r * 0.55, -r * 0.25, -r * 0.5, -r * 0.92, -r * 0.14, -r)
    ctx.lineTo(0, -r * 0.84)
    ctx.lineTo(r * 0.14, -r)
    ctx.bezierCurveTo(r * 0.5, -r * 0.92, r * 0.55, -r * 0.25, 0, 0)
    ctx.fill()
    ctx.restore()
  }
  ctx.fillStyle = center
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** EXPO 2086 の花の紋（8 つの円の輪） */
export function drawExpoEmblem(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string): void {
  ctx.save()
  ctx.fillStyle = color
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    ctx.beginPath()
    ctx.arc(cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.36, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** 大阪城のシルエット（反りのある屋根を重ねる）。baseY は石垣の下、w は全体の幅 */
export function drawCastle(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, color: string, accent?: string): void {
  ctx.save()
  ctx.fillStyle = color
  const s = w / 100
  // 石垣
  ctx.beginPath()
  ctx.moveTo(cx - 50 * s, baseY)
  ctx.quadraticCurveTo(cx - 44 * s, baseY - 10 * s, cx - 40 * s, baseY - 18 * s)
  ctx.lineTo(cx + 40 * s, baseY - 18 * s)
  ctx.quadraticCurveTo(cx + 44 * s, baseY - 10 * s, cx + 50 * s, baseY)
  ctx.closePath()
  ctx.fill()
  // 各層：壁＋反った屋根
  const tiers: Array<[number, number, number]> = [
    [34, 12, 46],
    [27, 11, 38],
    [21, 10, 31],
    [15, 9.5, 24],
    [10, 9, 17],
  ]
  let y = baseY - 18 * s
  for (let i = 0; i < tiers.length; i++) {
    const [hw, h, rw] = tiers[i]
    ctx.fillStyle = color
    ctx.fillRect(cx - hw * s, y - h * s, hw * 2 * s, h * s)
    if (accent) {
      ctx.fillStyle = accent
      for (let k = -2; k <= 2; k++) ctx.fillRect(cx + k * hw * 0.32 * s - 1.6 * s, y - h * 0.62 * s, 3.2 * s, 3.6 * s)
    }
    // 屋根
    ctx.fillStyle = color
    const ry = y - h * s
    ctx.beginPath()
    ctx.moveTo(cx - rw * s, ry + 1 * s)
    ctx.quadraticCurveTo(cx - rw * 0.75 * s, ry - 1.5 * s, cx - hw * 0.6 * s, ry - 5.5 * s)
    ctx.lineTo(cx + hw * 0.6 * s, ry - 5.5 * s)
    ctx.quadraticCurveTo(cx + rw * 0.75 * s, ry - 1.5 * s, cx + rw * s, ry + 1 * s)
    ctx.closePath()
    ctx.fill()
    // 千鳥破風（中央の三角）
    if (i % 2 === 0) {
      ctx.beginPath()
      ctx.moveTo(cx - 6 * s, ry - 2 * s)
      ctx.lineTo(cx, ry - 9 * s)
      ctx.lineTo(cx + 6 * s, ry - 2 * s)
      ctx.fill()
    }
    y = ry - 5.5 * s
  }
  // 鯱
  ctx.fillRect(cx - 7 * s, y - 3 * s, 2 * s, 3 * s)
  ctx.fillRect(cx + 5 * s, y - 3 * s, 2 * s, 3 * s)
  ctx.restore()
}

/** 青海波（波の文様） */
function drawWaves(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, r: number, c1: string, c2: string): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x0, y0, w, h)
  ctx.clip()
  const rows = Math.ceil(h / (r * 0.5)) + 2
  for (let row = 0; row < rows; row++) {
    const y = y0 + row * r * 0.5
    const off = row % 2 ? r : 0
    for (let x = x0 - r * 2 + off; x < x0 + w + r * 2; x += r * 2) {
      for (let k = 4; k >= 1; k--) {
        ctx.beginPath()
        ctx.arc(x, y, (r * k) / 4, Math.PI, 0)
        ctx.fillStyle = k % 2 ? c1 : c2
        ctx.fill()
      }
    }
  }
  ctx.restore()
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// ------------------------------------------------------------------ 布（幟・横断幕・テント・のれん）

export type FabricAtlas = { atlas: CanvasAtlas }

export function paintFabricAtlas(): CanvasAtlas {
  const A = new CanvasAtlas(2048, 2048)

  // なんばタウンの横断幕（濃紺、白抜きの文字、左に桜）
  A.add('nanba_long', 2040, 360, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#2a3586')
    g.addColorStop(1, '#1b2462')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#d9b75a'
    c.fillRect(0, 10, w, 6)
    c.fillRect(0, h - 16, w, 6)
    drawSakura(c, 230, h / 2, 120, '#ff8fb8', '#ffe1ec', 0.2)
    drawSakura(c, w - 210, h / 2 + 10, 80, '#ff8fb8', '#ffe1ec', -0.3)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    fitText(c, 'なんばタウン', w / 2 + 40, h * 0.43, w * 0.62, 210, 800)
    c.fillStyle = '#cfe0ff'
    fitText(c, 'NANBA TOWN', w / 2 + 40, h * 0.82, w * 0.4, 62, 800, ROUNDED, 22)
  }, [0, 0])

  // EXPO 2086 の幟（紫→青のグラデーション、白い花の紋）
  A.add('expo_v', 360, 1000, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#5a3fb6')
    g.addColorStop(0.55, '#3a4ec8')
    g.addColorStop(1, '#2b62cf')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    c.strokeStyle = 'rgba(255,255,255,0.55)'
    c.lineWidth = 6
    c.strokeRect(16, 16, w - 32, h - 32)
    drawExpoEmblem(c, w / 2, h * 0.26, 118, '#ffffff')
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    fitText(c, 'EXPO', w / 2, h * 0.53, w * 0.8, 120, 800)
    fitText(c, '2086', w / 2, h * 0.66, w * 0.8, 130, 800)
    c.fillStyle = '#ffd4e6'
    fitText(c, 'OSAKA NANBA', w / 2, h * 0.86, w * 0.8, 40, 800, ROUNDED, 6)
  }, [530, 370])

  // 大阪の幟（生成りの地に城と桜と青海波、縦書きの標語）
  A.add('osaka_v', 520, 1300, (c, w, h) => {
    c.fillStyle = '#f7f2e6'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#161a2c'
    verticalText(c, '大阪', w * 0.62, 50, 190, 700, MINCHO, 1.0)
    // 赤い印
    c.fillStyle = '#d23a3a'
    roundRect(c, w * 0.2, 80, 70, 70, 8)
    c.fill()
    c.fillStyle = '#fff'
    c.font = font(800, 40, MINCHO)
    c.textAlign = 'center'
    c.fillText('祭', w * 0.2 + 35, 128)
    // 城と桜
    drawCastle(c, w * 0.52, h * 0.7, w * 0.86, '#2c3f8f', '#f7f2e6')
    for (let i = 0; i < 9; i++) {
      const rng = mulberry32(40 + i)
      drawSakura(c, range(rng, 30, w - 30), range(rng, h * 0.42, h * 0.72), range(rng, 16, 34), i % 2 ? '#f39bb9' : '#ef7fa6', '#fff', rng() * 3)
    }
    drawWaves(c, 0, h * 0.7, w, h * 0.16, 46, '#2c4fa8', '#f7f2e6')
    c.fillStyle = '#161a2c'
    verticalText(c, '時をつなぎ、未来へ', w * 0.17, 230, 44, 700, MINCHO, 1.08)
    c.fillStyle = '#23347e'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    fitText(c, 'IDO', w / 2, h * 0.915, w * 0.6, 96, 800)
    fitText(c, 'EXPO 2086', w / 2, h * 0.968, w * 0.7, 46, 800, ROUNDED, 4)
  }, [0, 370])

  // IDO の幟（濃紺）
  A.add('ido_v', 360, 1000, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#16205a')
    g.addColorStop(1, '#22348a')
    c.fillStyle = g
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    fitText(c, 'IDO', w / 2, h * 0.14, w * 0.85, 150, 800)
    c.fillStyle = '#7fd8ff'
    c.fillRect(w * 0.2, h * 0.22, w * 0.6, 6)
    c.fillStyle = '#ffffff'
    verticalText(c, '時を旅する大阪', w / 2, h * 0.27, 84, 800, ROUNDED, 1.05)
    drawSakura(c, w / 2, h * 0.92, 40, '#ff9cc2', '#fff')
  }, [900, 370])

  // 時代博覧祭の幟（朱）
  A.add('matsuri_v', 360, 1000, (c, w, h) => {
    c.fillStyle = '#d5333b'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#ffffff'
    verticalText(c, '時代博覧祭', w / 2, h * 0.05, 150, 800, MINCHO, 1.02)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    fitText(c, 'EXPO 2086', w / 2, h * 0.9, w * 0.8, 46, 800, ROUNDED, 4)
  }, [1270, 370])

  // IDO 展示のテントの垂れ幕（白地に紺）
  A.add('tent_ido', 1100, 280, (c, w, h) => {
    c.fillStyle = '#fbfbf8'
    c.fillRect(0, 0, w, h)
    c.fillStyle = '#25358a'
    c.fillRect(0, h - 26, w, 26)
    drawExpoEmblem(c, 150, h * 0.46, 92, '#2b47b0')
    c.fillStyle = '#1f2f7c'
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    c.font = font(800, 170)
    c.fillText('IDO', 270, h * 0.44)
    c.font = font(800, 92)
    c.fillText('EXPO 2086', 620, h * 0.47)
  }, [530, 1380])

  // 屋台ののれん（筆文字）
  const noren = (name: string, text: string, bg: string, fg: string, at: [number, number]) =>
    A.add(name, 500, 290, (c, w, h) => {
      c.fillStyle = bg
      c.fillRect(0, 0, w, h)
      // 白い縁取りと上の帯
      c.fillStyle = 'rgba(255,255,255,0.18)'
      c.fillRect(0, 0, w, 26)
      c.fillStyle = fg
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      fitText(c, text, w / 2, h * 0.56, w * 0.86, 150, 400, BRUSH)
      // のれんの切れ目（透明）
      c.clearRect(w / 3 - 4, h * 0.3, 8, h)
      c.clearRect((2 * w) / 3 - 4, h * 0.3, 8, h)
    }, at)
  noren('noren_tako', 'たこ焼', '#c8322f', '#ffffff', [0, 1680])
  noren('noren_soba', '焼そば', '#23357a', '#ffffff', [510, 1680])
  noren('noren_ame', 'りんご飴', '#e8e0d0', '#c8322f', [1020, 1680])
  noren('noren_kingyo', '金魚すくい', '#3d9ad6', '#ffffff', [1530, 1680])

  // 屋台の屋根（紅白のストライプ／紺白）
  A.add('awning_red', 400, 200, (c, w, h) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fdfaf3' : '#d8343a'
      c.fillRect((i * w) / 8, 0, w / 8 + 1, h)
    }
  }, [1640, 370])
  A.add('awning_blue', 400, 200, (c, w, h) => {
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#fdfaf3' : '#2a4ea8'
      c.fillRect((i * w) / 8, 0, w / 8 + 1, h)
    }
  }, [1640, 580])
  return A
}

// ------------------------------------------------------------------ ホログラム看板

/** 光る文字（影ぼかしで発光のにじみを描く） */
export function glowText(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, px: number, color: string, glow: string, blur = 22, family = ROUNDED, spacing = 0): void {
  c.save()
  c.shadowColor = glow
  c.shadowBlur = blur
  c.fillStyle = color
  fitText(c, text, x, y, maxW, px, 800, family, spacing)
  c.shadowBlur = blur * 0.4
  fitText(c, text, x, y, maxW, px, 800, family, spacing)
  c.restore()
}

/** ホロの板（半透明の濃い地＋光る縁）。看板が昼の空でも読めるように */
export function holoPanel(c: CanvasRenderingContext2D, w: number, h: number, fill: string, edge: string, r = 26): void {
  c.save()
  roundRect(c, 10, 10, w - 20, h - 20, r)
  c.fillStyle = fill
  c.fill()
  c.shadowColor = edge
  c.shadowBlur = 16
  c.strokeStyle = edge
  c.lineWidth = 5
  c.stroke()
  c.restore()
  // 走査線
  c.save()
  c.globalAlpha = 0.12
  c.fillStyle = '#ffffff'
  for (let y = 14; y < h - 14; y += 6) c.fillRect(14, y, w - 28, 1)
  c.restore()
}

export function paintHoloAtlas(): CanvasAtlas {
  const A = new CanvasAtlas(2048, 2048)

  A.add('matsuri_logo', 1240, 440, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(8,26,72,0.55)', '#6fe6ff', 40)
    drawExpoEmblem(c, 170, h * 0.47, 110, '#ff8fc4')
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, '時代博覧祭', w * 0.58, h * 0.42, w * 0.66, 200, '#ffffff', '#5fdcff', 30)
    glowText(c, 'EXPO 2086 ・ NANBA TOWN', w * 0.58, h * 0.78, w * 0.62, 52, '#b8f4ff', '#5fdcff', 14, ROUNDED, 6)
  }, [0, 0])

  A.add('emergency', 1100, 440, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(70,0,8,0.62)', '#ff3b4e', 24)
    // 上下の警告ストライプ
    for (const y of [24, h - 70]) {
      c.save()
      c.beginPath()
      c.rect(24, y, w - 48, 46)
      c.clip()
      for (let x = -60; x < w; x += 56) {
        c.fillStyle = '#ff2f45'
        c.beginPath()
        c.moveTo(x, y + 46)
        c.lineTo(x + 28, y)
        c.lineTo(x + 56, y)
        c.lineTo(x + 28, y + 46)
        c.fill()
      }
      c.restore()
    }
    // 警告の三角
    c.save()
    c.shadowColor = '#ff2a40'
    c.shadowBlur = 20
    c.strokeStyle = '#ffd0d6'
    c.lineWidth = 12
    c.lineJoin = 'round'
    c.beginPath()
    c.moveTo(150, h * 0.3)
    c.lineTo(230, h * 0.68)
    c.lineTo(70, h * 0.68)
    c.closePath()
    c.stroke()
    c.fillStyle = '#ffd0d6'
    c.fillRect(144, h * 0.4, 12, 46)
    c.fillRect(144, h * 0.58, 12, 12)
    c.restore()
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, '緊急事態', w * 0.6, h * 0.43, w * 0.6, 170, '#ffe3e6', '#ff2f45', 30)
    glowText(c, '正体不明の存在を確認', w * 0.6, h * 0.69, w * 0.6, 58, '#ffc2c9', '#ff2f45', 14)
  }, [0, 450])

  A.add('nanba_holo', 1000, 260, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(10,30,70,0.45)', '#7fe9ff', 30)
    drawSakura(c, 120, h / 2, 70, '#ff9cc8', '#fff')
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, 'なんばタウン', w * 0.56, h * 0.42, w * 0.68, 120, '#ffffff', '#5fdcff', 22)
    glowText(c, 'NANBA TOWN', w * 0.56, h * 0.78, w * 0.4, 40, '#bff5ff', '#5fdcff', 10, ROUNDED, 10)
  }, [0, 900])

  A.add('timeline', 1000, 280, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(10,30,70,0.45)', '#7fe9ff', 24)
    const items: Array<[string, string, boolean]> = [
      ['1726', '大坂', false],
      ['1970', '万博', false],
      ['2026', 'なんば', true],
      ['2086', 'ナンバタウン', false],
    ]
    const tw = (w - 80) / 4
    items.forEach(([y, p, hot], i) => {
      const x = 40 + i * tw
      c.save()
      roundRect(c, x + 8, 40, tw - 16, h - 80, 14)
      c.fillStyle = hot ? 'rgba(120,220,255,0.28)' : 'rgba(120,220,255,0.10)'
      c.fill()
      c.strokeStyle = hot ? '#bff6ff' : 'rgba(150,230,255,0.6)'
      c.lineWidth = hot ? 5 : 2
      c.stroke()
      c.restore()
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      glowText(c, y, x + tw / 2, h * 0.42, tw - 30, 74, '#ffffff', '#5fdcff', 14)
      glowText(c, p, x + tw / 2, h * 0.7, tw - 30, 38, '#c9f6ff', '#5fdcff', 8)
    })
  }, [1010, 900])

  A.add('emblem', 420, 420, (c, w, h) => {
    c.save()
    c.shadowColor = '#ff7fc0'
    c.shadowBlur = 30
    drawExpoEmblem(c, w / 2, h / 2, 170, '#ffd2ea')
    c.restore()
  }, [1110, 450])

  A.add('menu_tako', 340, 420, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(60,20,8,0.5)', '#ffb36a', 20)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, 'たこ焼', w / 2, h * 0.22, w * 0.8, 80, '#fff2e0', '#ff9a4a', 16, BRUSH)
    glowText(c, '8個', w / 2, h * 0.5, w * 0.8, 70, '#ffe0b8', '#ff9a4a', 12)
    glowText(c, '500円', w / 2, h * 0.76, w * 0.8, 70, '#ffffff', '#ff9a4a', 12)
  }, [1250, 0])

  A.add('menu_ame', 340, 420, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(70,8,30,0.5)', '#ff7fb0', 20)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, 'りんご飴', w / 2, h * 0.24, w * 0.86, 70, '#fff0f6', '#ff5f9a', 16, BRUSH)
    glowText(c, 'かき氷', w / 2, h * 0.52, w * 0.8, 62, '#ffe0ee', '#ff5f9a', 12)
    glowText(c, 'わたあめ', w / 2, h * 0.76, w * 0.8, 62, '#ffffff', '#ff5f9a', 12)
  }, [1600, 0])

  A.add('ido_arrow', 620, 200, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(10,30,70,0.5)', '#7fe9ff', 20)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, '← IDO 展示', w / 2, h / 2, w * 0.86, 96, '#ffffff', '#5fdcff', 16)
  }, [0, 1190])

  A.add('stage', 900, 300, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(50,10,70,0.5)', '#ff8ff0', 26)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, '本日のSTAGE', w / 2, h * 0.36, w * 0.8, 92, '#ffffff', '#ff6fe0', 18)
    glowText(c, '時代博覧祭  EXPO 2086', w / 2, h * 0.72, w * 0.8, 52, '#ffd8fa', '#ff6fe0', 10)
  }, [630, 1190])

  A.add('shelter', 760, 220, (c, w, h) => {
    holoPanel(c, w, h, 'rgba(0,50,30,0.55)', '#5dffb0', 20)
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    glowText(c, '避難ゲート ↓', w / 2, h / 2, w * 0.86, 100, '#eafff4', '#3dff9a', 18)
  }, [0, 1500])
  return A
}

// ------------------------------------------------------------------ IDO の展示画面（昔の大阪のホログラム）

export function paintIdoScreen(): THREE.CanvasTexture {
  const S = 1024
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const rng = mulberry32(1726)
  // 空：深い青から地平の明るい水色
  const g = c.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, '#071a44')
  g.addColorStop(0.55, '#1c5fb0')
  g.addColorStop(0.75, '#5fb8f0')
  g.addColorStop(1, '#0b2a5c')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  // 格子（ホログラムの座標線）
  c.strokeStyle = 'rgba(140,220,255,0.12)'
  c.lineWidth = 1
  for (let i = 0; i < S; i += 32) {
    c.beginPath()
    c.moveTo(i, 0)
    c.lineTo(i, S)
    c.stroke()
    c.beginPath()
    c.moveTo(0, i)
    c.lineTo(S, i)
    c.stroke()
  }
  // 遠景の城（光る輪郭）
  c.save()
  c.shadowColor = '#9fe8ff'
  c.shadowBlur = 24
  drawCastle(c, S * 0.55, S * 0.6, S * 0.5, 'rgba(190,235,255,0.92)', 'rgba(40,90,170,0.9)')
  c.restore()
  // 桜
  for (let i = 0; i < 26; i++) drawSakura(c, range(rng, 0, S), range(rng, S * 0.35, S * 0.62), range(rng, 8, 20), 'rgba(255,170,215,0.85)', '#fff', rng() * 3)
  // 通りの町家（左右に並ぶ屋根）
  const row = (y: number, x0: number, x1: number, h: number, dir: number) => {
    for (let x = x0; x < x1; x += h * 1.6) {
      const hh = h * range(rng, 0.85, 1.15)
      c.fillStyle = 'rgba(20,60,130,0.95)'
      c.fillRect(x, y - hh, h * 1.5, hh)
      c.fillStyle = 'rgba(160,225,255,0.95)'
      c.beginPath()
      c.moveTo(x - h * 0.15, y - hh)
      c.lineTo(x + h * 0.75, y - hh - h * 0.55)
      c.lineTo(x + h * 1.65, y - hh)
      c.closePath()
      c.fill()
      // 暖簾と提灯（暖かい光の点）
      c.fillStyle = 'rgba(255,190,110,0.95)'
      c.beginPath()
      c.arc(x + h * 0.4 + dir * 4, y - hh * 0.55, h * 0.1, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = 'rgba(120,200,255,0.6)'
      c.fillRect(x + h * 0.2, y - hh * 0.38, h * 1.1, hh * 0.22)
    }
  }
  row(S * 0.8, -20, S * 0.36, 90, 1)
  row(S * 0.8, S * 0.64, S + 40, 90, -1)
  row(S * 0.92, -60, S * 0.3, 130, 1)
  row(S * 0.92, S * 0.7, S + 60, 130, -1)
  // 通り（遠近）
  c.fillStyle = 'rgba(120,200,255,0.25)'
  c.beginPath()
  c.moveTo(S * 0.45, S * 0.66)
  c.lineTo(S * 0.55, S * 0.66)
  c.lineTo(S * 0.78, S)
  c.lineTo(S * 0.22, S)
  c.closePath()
  c.fill()
  // 人影
  for (let i = 0; i < 22; i++) {
    const y = range(rng, S * 0.7, S * 0.98)
    const k = (y - S * 0.66) / (S * 0.34)
    const x = S * 0.5 + range(rng, -1, 1) * (40 + 260 * k)
    const s = 10 + 34 * k
    c.fillStyle = 'rgba(200,240,255,0.85)'
    c.beginPath()
    c.arc(x, y - s * 1.9, s * 0.32, 0, Math.PI * 2)
    c.fill()
    c.fillRect(x - s * 0.3, y - s * 1.6, s * 0.6, s * 1.6)
  }
  // 文字
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  glowText(c, 'IDO', S * 0.5, S * 0.17, S * 0.5, 190, '#ffffff', '#7fe0ff', 30)
  glowText(c, '時を旅する大阪', S * 0.5, S * 0.29, S * 0.6, 70, '#dff8ff', '#7fe0ff', 14)
  glowText(c, 'OSAKA TIME EXPERIENCE', S * 0.5, S * 0.355, S * 0.56, 34, '#bff2ff', '#7fe0ff', 8, ROUNDED, 6)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

// ------------------------------------------------------------------ 提灯（左半分：赤に「祭」、右半分：白に「なんば」）

export function paintChochin(): { color: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const W = 1024
  const H = 512
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const c = cv.getContext('2d')!
  const em = document.createElement('canvas')
  em.width = W
  em.height = H
  const e = em.getContext('2d')!
  const half = (x0: number, bg: string, fg: string, text: string, glow: string) => {
    const w = W / 2
    c.fillStyle = bg
    c.fillRect(x0, 0, w, H)
    // 骨（横の細い線）
    c.strokeStyle = 'rgba(0,0,0,0.13)'
    c.lineWidth = 3
    for (let y = 30; y < H; y += 28) {
      c.beginPath()
      c.moveTo(x0, y)
      c.lineTo(x0 + w, y)
      c.stroke()
    }
    // 上下の黒い帯
    c.fillStyle = '#1b1414'
    c.fillRect(x0, 0, w, 34)
    c.fillRect(x0, H - 34, w, 34)
    // 文字（表と裏の 2 か所）
    c.fillStyle = fg
    for (const k of [0.25, 0.75]) {
      if (text.length === 1) {
        c.font = font(400, 230, BRUSH)
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.fillText(text, x0 + w * k, H * 0.53)
      } else verticalText(c, text, x0 + w * k, H * 0.17, 110, 400, BRUSH, 0.98)
    }
    // 発光：紙の地は明るく、文字と帯は暗い
    e.fillStyle = glow
    e.fillRect(x0, 0, w, H)
    e.drawImage(cv, x0, 0, w, H, x0, 0, w, H)
    e.globalCompositeOperation = 'multiply'
    e.fillStyle = glow
    e.fillRect(x0, 0, w, H)
    e.globalCompositeOperation = 'source-over'
  }
  half(0, '#e0352f', '#1a1010', '祭', '#ff9a6a')
  half(W / 2, '#fbf3df', '#c42a24', 'なんば', '#ffd9a0')
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  const te = new THREE.CanvasTexture(em)
  te.colorSpace = THREE.SRGBColorSpace
  return { color: t, emissive: te }
}

// ------------------------------------------------------------------ 窓（ガラスの帯。夜は灯りがともる）

export function paintWindows(): { color: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const S = 512
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const c = cv.getContext('2d')!
  const em = document.createElement('canvas')
  em.width = em.height = S
  const e = em.getContext('2d')!
  const rng = mulberry32(2086)
  const g = c.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, '#3e6f9e')
  g.addColorStop(1, '#22476e')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  e.fillStyle = '#000'
  e.fillRect(0, 0, S, S)
  const cols = 8
  const rows = 4
  const cw = S / cols
  const rh = S / rows
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = i * cw
      const y = j * rh
      // 空の映り込み（斜めの明るい帯）
      const k = rng()
      c.fillStyle = `rgba(190,225,255,${0.08 + k * 0.18})`
      c.beginPath()
      c.moveTo(x + cw * 0.1, y + rh)
      c.lineTo(x + cw * 0.55, y)
      c.lineTo(x + cw * 0.85, y)
      c.lineTo(x + cw * 0.4, y + rh)
      c.fill()
      // 夜の灯り
      if (rng() < 0.45) {
        const warm = rng() < 0.7
        e.fillStyle = warm ? `rgba(255,${190 + Math.floor(rng() * 40)},${120 + Math.floor(rng() * 50)},1)` : 'rgba(160,220,255,1)'
        const inset = 4
        e.fillRect(x + inset, y + inset + rh * 0.2 * rng(), cw - inset * 2, rh * (0.6 + 0.3 * rng()) - inset)
      }
    }
  }
  // 枠
  c.fillStyle = '#e9eef3'
  e.fillStyle = '#000'
  for (let i = 0; i <= cols; i++) {
    c.fillRect(i * cw - 3, 0, 6, S)
    e.fillRect(i * cw - 3, 0, 6, S)
  }
  for (let j = 0; j <= rows; j++) {
    c.fillRect(0, j * rh - 4, S, 8)
    e.fillRect(0, j * rh - 4, S, 8)
  }
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  const te = new THREE.CanvasTexture(em)
  te.colorSpace = THREE.SRGBColorSpace
  te.wrapS = te.wrapT = THREE.RepeatWrapping
  return { color: t, emissive: te }
}

// ------------------------------------------------------------------ 木箱（フライトケース）の印刷

export function paintDecalAtlas(): CanvasAtlas {
  const A = new CanvasAtlas(1024, 1024)
  A.add('ido_logo', 1000, 420, (c, w, h) => {
    // 城とビル群のシルエット＋波、IDO EXPO 2086
    c.save()
    c.translate(0, 0)
    drawCastle(c, w * 0.36, h * 0.6, w * 0.22, '#2c43a0', 'rgba(255,255,255,0.9)')
    c.fillStyle = '#2c43a0'
    c.fillRect(w * 0.52, h * 0.16, 16, h * 0.44)
    c.beginPath()
    c.moveTo(w * 0.52 - 10, h * 0.16)
    c.lineTo(w * 0.52 + 8, h * 0.02)
    c.lineTo(w * 0.52 + 26, h * 0.16)
    c.fill()
    for (let i = 0; i < 6; i++) c.fillRect(w * (0.56 + i * 0.035), h * (0.32 + ((i * 37) % 5) * 0.04), w * 0.03, h * 0.3)
    drawWaves(c, w * 0.18, h * 0.58, w * 0.62, h * 0.08, 26, '#2c43a0', 'rgba(0,0,0,0)')
    c.restore()
    c.fillStyle = '#2c43a0'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    fitText(c, 'IDO', w * 0.5, h * 0.8, w * 0.4, 130, 800)
    fitText(c, 'EXPO 2086', w * 0.5, h * 0.95, w * 0.4, 50, 800, ROUNDED, 6)
  }, [0, 0])
  A.add('nexmax', 1000, 300, (c, _w, h) => {
    c.fillStyle = '#1d2433'
    c.textAlign = 'left'
    c.textBaseline = 'middle'
    c.font = font(800, 110)
    c.fillText('NEXMAX', 30, h * 0.3)
    c.font = font(700, 64)
    c.fillText('大阪の記憶を、次の時代へ。', 30, h * 0.75)
  }, [0, 430])
  A.add('fragile', 480, 200, (c, w, h) => {
    c.fillStyle = '#d23a2c'
    roundRect(c, 6, 6, w - 12, h - 12, 18)
    c.fill()
    c.fillStyle = '#fff'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    fitText(c, '取扱注意', w / 2, h * 0.42, w * 0.8, 80, 800)
    fitText(c, 'FRAGILE', w / 2, h * 0.78, w * 0.6, 40, 800, ROUNDED, 6)
  }, [0, 740])
  A.add('panel_lines', 480, 200, (c, w, h) => {
    // 操作卓の画面（細かい表示）
    c.fillStyle = '#0a1e3a'
    c.fillRect(0, 0, w, h)
    const rng = mulberry32(5)
    for (let i = 0; i < 18; i++) {
      c.fillStyle = rng() < 0.3 ? '#ffb36a' : '#6fe6ff'
      c.fillRect(20 + rng() * (w - 140), 14 + i * 10, 30 + rng() * 120, 4)
    }
    c.strokeStyle = '#6fe6ff'
    c.lineWidth = 3
    c.beginPath()
    for (let x = 0; x < w; x += 8) c.lineTo(x, h * 0.75 + Math.sin(x * 0.05) * 18)
    c.stroke()
  }, [490, 740])
  return A
}
