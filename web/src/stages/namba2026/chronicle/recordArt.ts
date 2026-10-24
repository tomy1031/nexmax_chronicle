// 物語 v7 の 2026年の絵（キャンバス）。
// ・社長の絵（6 章）：小さな青いロボット（ネクマックスの公式の絵）と社長の書き込み。すみに手書きで小さく「NEXTMAKE 001」。青い石はかいていない
// ・かんばんの記録の絵（IDO 検索の 3 本）：時計屋の看板（昭和のはじめの写真）・駅の大時計（100年前の写真）・
//   古い路地（源兵衛の書の一ページ：青い刃のかけら。claw=true で 8 章の「時を裂く爪」のページも足せる）
// ・IDO 検索の画面の小さな町の地図
// ・江戸の朝の路地（9 章の映し出し）：朝日の町家の並び
// 幅 720 前後の絵は IdoPanelFx（../idoPanelFx.ts）でそのまま組み上げられる。
import { mulberry32, range } from '../../../render/noise'
import { makeCanvas } from '../../../render/textures'
import { drawNexmaxSketch } from '../artwork'
import { brandImages } from './brandArt'

const HAND = '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Yu Gothic",sans-serif'
const GOTHIC = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif'
const BRUSH = '"Yuji Boku","Hiragino Mincho ProN","Yu Mincho",serif'
const BRUSH2 = '"Yuji Syuku","Yuji Boku","Hiragino Mincho ProN",serif'
const INK = '#1d2a4a'

function hand(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = INK, align: CanvasTextAlign = 'left', weight = 800): void {
  g.font = `${weight} ${px}px ${HAND}`
  g.fillStyle = color
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillText(text, x, y)
}

// ------------------------------------------------------------------ 社長の絵

/**
 * 社長の絵（画用紙）を (x,y,w,h) に描く。ロボットは、ネクマックスの公式の絵（brandArt.ts。読めなければ手描きのスケッチ）。
 * 右下のすみに、社長の手書きで小さく「NEXTMAKE 001」
 */
export function drawPresidentSketch(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.save()
  g.beginPath()
  g.rect(x, y, w, h)
  g.clip()
  // 画用紙（少しクリーム色。紙のつぶつぶ）
  g.fillStyle = '#fbf6ea'
  g.fillRect(x, y, w, h)
  const rng = mulberry32(2026001)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(150,130,100,${range(rng, 0.03, 0.07)})`
    g.fillRect(x + rng() * w, y + rng() * h, 1.5, 1.5)
  }
  // ふちの少しの汚れ
  const vg = g.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.35, x + w / 2, y + h / 2, Math.max(w, h) * 0.7)
  vg.addColorStop(0, 'rgba(200,180,140,0)')
  vg.addColorStop(1, 'rgba(200,180,140,0.25)')
  g.fillStyle = vg
  g.fillRect(x, y, w, h)
  // 見出し（社長の字）
  hand(g, 'いつか、こんなロボットを つくりたい！', x + w * 0.05, y + h * 0.09, h * 0.058)
  g.strokeStyle = '#c0392b'
  g.lineWidth = Math.max(2, h * 0.006)
  g.beginPath()
  g.moveTo(x + w * 0.05, y + h * 0.145)
  g.quadraticCurveTo(x + w * 0.35, y + h * 0.16, x + w * 0.66, y + h * 0.14)
  g.stroke()
  // ロボット（公式の絵。紙になじむよう、少しだけ紙の色をかぶせる）
  const img = brandImages().sketch
  if (img) {
    const ih = h * 0.78
    const iw = ih * (img.naturalWidth / Math.max(1, img.naturalHeight))
    const ix = x + w * 0.3 - iw / 2
    const iy = y + h * 0.18
    g.drawImage(img, ix, iy, iw, ih)
    g.fillStyle = 'rgba(251,246,234,0.08)'
    g.fillRect(ix, iy, iw, ih)
  } else drawNexmaxSketch(g, x + w * 0.3, y + h * 0.58, h * 0.66)
  // 書き込み（矢じるしでロボットを指す）
  const arrow = (tx: number, ty: number, hx: number, hy: number, col: string) => {
    g.strokeStyle = col
    g.lineWidth = Math.max(2, h * 0.005)
    g.beginPath()
    g.moveTo(x + w * tx, y + h * ty)
    g.quadraticCurveTo(x + w * ((tx + hx) / 2), y + h * (Math.min(ty, hy) - 0.04), x + w * hx, y + h * hy)
    g.stroke()
    g.beginPath()
    g.arc(x + w * hx, y + h * hy, Math.max(2.5, h * 0.007), 0, Math.PI * 2)
    g.fillStyle = col
    g.fill()
  }
  hand(g, 'まるい あたま', x + w * 0.6, y + h * 0.27, h * 0.042, '#2a6fd0')
  arrow(0.59, 0.27, 0.45, 0.32, '#2a6fd0')
  hand(g, 'やさしい 手', x + w * 0.62, y + h * 0.5, h * 0.042, '#2a6fd0')
  arrow(0.61, 0.5, 0.465, 0.77, '#2a6fd0')
  hand(g, '人と いっしょに', x + w * 0.6, y + h * 0.7, h * 0.042, '#c0392b')
  hand(g, 'つくる・あそぶ', x + w * 0.6, y + h * 0.77, h * 0.042, '#c0392b')
  hand(g, '2026.10  マツイ', x + w * 0.05, y + h * 0.95, h * 0.032, '#7a8090', 'left', 700)
  // 右下のすみに、社長の手書きで小さく「NEXTMAKE 001」（えんぴつの字。少しかたむける）
  const k = SKETCH_CORNER
  g.save()
  g.translate(x + w * (k.x + k.w / 2), y + h * (k.y + k.h / 2))
  g.rotate(-0.04)
  hand(g, 'NEXTMAKE 001', 0, 0, h * 0.036, '#3a4250', 'center', 800)
  g.strokeStyle = 'rgba(58,66,80,0.75)'
  g.lineWidth = Math.max(1.2, h * 0.0028)
  g.beginPath()
  g.moveTo(-w * k.w * 0.46, h * k.h * 0.36)
  g.quadraticCurveTo(0, h * k.h * 0.5, w * k.w * 0.47, h * k.h * 0.3)
  g.stroke()
  g.restore()
  g.restore()
}

/** 「NEXTMAKE 001」の欄の位置（絵の中の割合。アップで目印を出す） */
export const SKETCH_CORNER = { x: 0.79, y: 0.885, w: 0.18, h: 0.075 }

/** 社長の絵だけのキャンバス（F で調べたときのアップ・3D の紙の両方に使う） */
export function paintPresidentSketch(W = 1024, H = 724): HTMLCanvasElement {
  const [c, g] = makeCanvas(W, H)
  drawPresidentSketch(g, 0, 0, W, H)
  return c
}

/** ラボの構想ボード（v7）：ホワイトボードに社長の絵の紙をマグネットで留め、まわりに書き込み */
export function paintV7ConceptBoard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#f7f8f6'
  g.fillRect(x, y, w, h)
  const rng = mulberry32(81)
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(80,100,140,${range(rng, 0.02, 0.05)})`
    g.fillRect(x + rng() * w, y + rng() * h, range(rng, 40, 160), range(rng, 6, 20))
  }
  g.strokeStyle = '#b8bec6'
  g.lineWidth = 10
  g.strokeRect(x + 5, y + 5, w - 10, h - 10)
  // 紙（少し傾けて貼る）
  const pw = w * 0.62
  const ph = pw * (724 / 1024)
  const px = x + w * 0.05
  const py = y + h * 0.1
  g.save()
  g.translate(px + pw / 2, py + ph / 2)
  g.rotate(-0.015)
  g.fillStyle = 'rgba(0,0,0,0.12)'
  g.fillRect(-pw / 2 + 6, -ph / 2 + 8, pw, ph)
  drawPresidentSketch(g, -pw / 2, -ph / 2, pw, ph)
  // マグネット
  for (const [mx, my, col] of [
    [-0.46, -0.45, '#e24a3a'],
    [0.46, -0.45, '#3a8ae2'],
    [-0.46, 0.45, '#f2c84b'],
    [0.46, 0.45, '#4ab86a'],
  ] as const) {
    g.fillStyle = col
    g.beginPath()
    g.arc(mx * pw, my * ph, h * 0.025, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
  // 右の書き込み
  hand(g, 'NEXTMAKE の', x + w * 0.71, y + h * 0.16, h * 0.05)
  hand(g, '1 台目の夢', x + w * 0.71, y + h * 0.24, h * 0.05, '#c0392b')
  hand(g, '・人とつくる', x + w * 0.71, y + h * 0.38, h * 0.042)
  hand(g, '・こわくない', x + w * 0.71, y + h * 0.47, h * 0.042)
  hand(g, '・やさしい手', x + w * 0.71, y + h * 0.56, h * 0.042)
  hand(g, 'IDO の次は', x + w * 0.71, y + h * 0.72, h * 0.042, '#2a6fd0')
  hand(g, 'これや！', x + w * 0.71, y + h * 0.8, h * 0.05, '#2a6fd0')
  // 付箋
  g.fillStyle = '#ffe680'
  g.fillRect(x + w * 0.72, y + h * 0.86, w * 0.18, h * 0.1)
  hand(g, 'いつか、きっと', x + w * 0.81, y + h * 0.91, h * 0.034, '#3a2a10', 'center')
}

// ------------------------------------------------------------------ 古い写真の仕上げ

function photoFinish(g: CanvasRenderingContext2D, W: number, H: number, seed: number): void {
  const rng = mulberry32(seed)
  // セピアの色調へ（全体に重ねる）
  g.globalCompositeOperation = 'multiply'
  g.fillStyle = '#e8c89a'
  g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'source-over'
  for (let i = 0; i < 4200; i++) {
    g.fillStyle = rng() < 0.5 ? 'rgba(255,240,210,0.08)' : 'rgba(30,20,10,0.1)'
    g.fillRect(rng() * W, rng() * H, 1.5, 1.5)
  }
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.62)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(60,36,18,0.5)')
  g.fillStyle = vg
  g.fillRect(0, 0, W, H)
  g.strokeStyle = 'rgba(255,248,230,0.25)'
  g.lineWidth = 1
  for (let i = 0; i < 5; i++) {
    const x = rng() * W
    g.beginPath()
    g.moveTo(x, rng() * H * 0.3)
    g.lineTo(x + (rng() - 0.5) * 12, H * (0.6 + rng() * 0.4))
    g.stroke()
  }
  g.strokeStyle = '#f6f0e2'
  g.lineWidth = 10
  g.strokeRect(5, 5, W - 10, H - 10)
}

/** 丸い時計の顔（針は 10 時 10 分） */
function clockFace(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rim = '#3a2a1a', face = '#f4ead4', ink = '#2a1a0a'): void {
  g.fillStyle = rim
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = face
  g.beginPath()
  g.arc(cx, cy, r * 0.84, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = ink
  g.lineCap = 'round'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.lineWidth = Math.max(1, r * (i % 3 === 0 ? 0.08 : 0.04))
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66)
    g.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78)
    g.stroke()
  }
  const hand2 = (a: number, len: number, wd: number) => {
    g.lineWidth = wd
    g.beginPath()
    g.moveTo(cx, cy)
    g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len)
    g.stroke()
  }
  hand2((10 / 12) * Math.PI * 2 + (10 / 60) * (Math.PI / 6), r * 0.42, Math.max(1.5, r * 0.09))
  hand2((10 / 60) * Math.PI * 2, r * 0.62, Math.max(1, r * 0.06))
}

/** 人のかげ（着物・洋服） */
function person(g: CanvasRenderingContext2D, x: number, base: number, h: number, tone: string, hat = false): void {
  g.fillStyle = tone
  g.beginPath()
  g.arc(x, base - h * 0.88, h * 0.1, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(x - h * 0.13, base - h * 0.76)
  g.lineTo(x + h * 0.13, base - h * 0.76)
  g.lineTo(x + h * 0.17, base)
  g.lineTo(x - h * 0.17, base)
  g.closePath()
  g.fill()
  if (hat) {
    g.fillRect(x - h * 0.15, base - h * 0.97, h * 0.3, h * 0.03)
    g.fillRect(x - h * 0.09, base - h * 1.06, h * 0.18, h * 0.1)
  }
}

/** 時計屋の看板の記録：昭和のはじめ、橋のたもとの時計屋（店の前の大きな丸い時計） */
export function paintClockShopRecord(): HTMLCanvasElement {
  const W = 720
  const H = 330
  const [c, g] = makeCanvas(W, H)
  const rng = mulberry32(1931)
  const sky = g.createLinearGradient(0, 0, 0, H * 0.5)
  sky.addColorStop(0, '#d8d0c0')
  sky.addColorStop(1, '#efe6d2')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  // 道（石だたみ）
  g.fillStyle = '#b4a890'
  g.fillRect(0, H * 0.72, W, H * 0.28)
  g.strokeStyle = 'rgba(80,60,40,0.25)'
  for (let i = 0; i < 12; i++) {
    g.beginPath()
    g.moveTo(0, H * (0.74 + i * 0.022))
    g.lineTo(W, H * (0.74 + i * 0.024))
    g.stroke()
  }
  // となりの家（左右）
  for (const [x0, w, h] of [
    [0, 150, 0.5],
    [560, 160, 0.56],
  ] as const) {
    g.fillStyle = '#6a5a48'
    g.fillRect(x0, H * (0.72 - h), w, H * h)
    g.fillStyle = '#4a3e32'
    for (let k = 0; k < 6; k++) g.fillRect(x0 + 10 + k * (w / 6), H * (0.72 - h * 0.7), 6, H * h * 0.55)
    g.fillStyle = '#3a3430'
    g.beginPath()
    g.moveTo(x0 - 6, H * (0.72 - h))
    g.lineTo(x0 + w / 2, H * (0.72 - h - 0.07))
    g.lineTo(x0 + w + 6, H * (0.72 - h))
    g.fill()
  }
  // 時計屋（二階建ての看板建築）
  const sx = 170
  const sw = 380
  g.fillStyle = '#8a7a62'
  g.fillRect(sx, H * 0.14, sw, H * 0.58)
  g.fillStyle = '#a8987e'
  g.fillRect(sx - 8, H * 0.12, sw + 16, H * 0.05)
  // 屋号の看板「時計　ときわ堂」
  g.fillStyle = '#2e2418'
  g.fillRect(sx + 40, H * 0.2, sw - 80, H * 0.11)
  g.fillStyle = '#f2e6c8'
  g.font = `400 ${H * 0.08}px ${BRUSH}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('時計  ときわ堂', sx + sw / 2, H * 0.258)
  // ショーウインドウ（時計が並ぶ）
  g.fillStyle = '#d6cdb6'
  g.fillRect(sx + 30, H * 0.4, sw - 60, H * 0.26)
  g.fillStyle = '#5a4a36'
  g.fillRect(sx + 30, H * 0.52, sw - 60, 4)
  for (let i = 0; i < 9; i++) clockFace(g, sx + 60 + i * 34, H * 0.46, 11, '#5a4430', '#efe4cc')
  for (let i = 0; i < 6; i++) {
    g.fillStyle = '#5a4430'
    g.fillRect(sx + 70 + i * 48, H * 0.55, 18, H * 0.09)
    clockFace(g, sx + 79 + i * 48, H * 0.565, 7, '#5a4430', '#efe4cc')
  }
  // 入口ののれんと、店の前の柱の大きな丸時計（看板）
  g.fillStyle = '#4a3a2a'
  g.fillRect(sx + sw / 2 - 30, H * 0.4, 60, H * 0.32)
  g.fillStyle = '#e8dcc0'
  g.fillRect(sx + sw / 2 - 30, H * 0.4, 60, H * 0.09)
  const px = sx + sw - 26
  g.fillStyle = '#2a2018'
  g.fillRect(px - 4, H * 0.2, 8, H * 0.52)
  clockFace(g, px, H * 0.2, 42, '#2a2018', '#f6eedc')
  g.fillStyle = '#2a2018'
  g.font = `700 ${H * 0.04}px ${BRUSH}`
  g.fillText('とけい', px, H * 0.2 + 56)
  // 人（着物の人・帽子の人・子ども）と自転車
  person(g, 110, H * 0.86, 90, '#3a3028', true)
  person(g, 420, H * 0.88, 96, '#4a3a30')
  person(g, 446, H * 0.88, 58, '#5a4838')
  g.strokeStyle = '#2a2420'
  g.lineWidth = 3
  for (const wx of [600, 660]) {
    g.beginPath()
    g.arc(wx, H * 0.86, 22, 0, Math.PI * 2)
    g.stroke()
  }
  g.beginPath()
  g.moveTo(600, H * 0.86)
  g.lineTo(630, H * 0.76)
  g.lineTo(660, H * 0.86)
  g.moveTo(630, H * 0.76)
  g.lineTo(625, H * 0.7)
  g.stroke()
  void rng
  photoFinish(g, W, H, 1931)
  // 大きな丸時計のまん中の、青い石の飾り（写真に色をつけた記録。ガラスの石）
  const gem = g.createRadialGradient(px - 2, H * 0.2 - 2, 1, px, H * 0.2, 9)
  gem.addColorStop(0, '#d8f0ff')
  gem.addColorStop(0.4, '#4a90e0')
  gem.addColorStop(1, '#1d4a8a')
  g.fillStyle = gem
  g.beginPath()
  g.arc(px, H * 0.2, 8, 0, Math.PI * 2)
  g.fill()
  return c
}

/** 駅の大時計の看板の記録：100年前の駅の前（大きな時計の下は待ち合わせの場所） */
export function paintStationClockRecord(): HTMLCanvasElement {
  const W = 720
  const H = 330
  const [c, g] = makeCanvas(W, H)
  const sky = g.createLinearGradient(0, 0, 0, H * 0.6)
  sky.addColorStop(0, '#cfc6b4')
  sky.addColorStop(1, '#ece2cc')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#b8ac94'
  g.fillRect(0, H * 0.74, W, H * 0.26)
  // 駅舎（横に長い洋風の建物。真ん中の塔に大時計）
  const bx = 80
  const bw = 560
  g.fillStyle = '#9a8a70'
  g.fillRect(bx, H * 0.34, bw, H * 0.4)
  g.fillStyle = '#7a6a52'
  g.fillRect(bx - 10, H * 0.31, bw + 20, H * 0.05)
  // アーチの入口
  for (let i = 0; i < 7; i++) {
    const ax = bx + 30 + i * 74
    g.fillStyle = '#4a3e30'
    g.beginPath()
    g.moveTo(ax, H * 0.74)
    g.lineTo(ax, H * 0.52)
    g.arc(ax + 24, H * 0.52, 24, Math.PI, 0)
    g.lineTo(ax + 48, H * 0.74)
    g.fill()
  }
  // 塔と大時計
  const tx = W / 2
  g.fillStyle = '#a89878'
  g.fillRect(tx - 70, H * 0.06, 140, H * 0.3)
  g.fillStyle = '#7a6a52'
  g.beginPath()
  g.moveTo(tx - 82, H * 0.07)
  g.lineTo(tx, H * -0.02)
  g.lineTo(tx + 82, H * 0.07)
  g.fill()
  clockFace(g, tx, H * 0.2, 46, '#3a2c1c', '#f6eedc')
  g.fillStyle = '#2a1e12'
  g.font = `400 ${H * 0.055}px ${BRUSH}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('な ん ば 駅', tx, H * 0.405)
  // 待ち合わせの人たち（傘・帽子）
  const tones = ['#3a3028', '#4a3a30', '#2e2620', '#5a4a3a']
  for (let i = 0; i < 11; i++) person(g, 70 + i * 58 + (i % 2) * 12, H * (0.9 + (i % 3) * 0.02), 70 + (i % 4) * 8, tones[i % 4], i % 3 === 0)
  // 人力車
  g.strokeStyle = '#2a2420'
  g.lineWidth = 3
  g.beginPath()
  g.arc(640, H * 0.86, 26, 0, Math.PI * 2)
  g.stroke()
  g.beginPath()
  g.moveTo(640, H * 0.86)
  g.lineTo(700, H * 0.8)
  g.moveTo(615, H * 0.78)
  g.lineTo(665, H * 0.78)
  g.lineTo(660, H * 0.66)
  g.stroke()
  photoFinish(g, W, H, 1926)
  // 大時計の前の、青い石をしきつめた広場（写真に色をつけた記録。人のかげは暗いまま）
  g.save()
  g.globalCompositeOperation = 'multiply'
  g.beginPath()
  g.ellipse(tx, H * 0.88, 210, H * 0.12, 0, 0, Math.PI * 2)
  g.clip()
  for (let i = 0; i < 70; i++) {
    const sx = tx - 220 + (i % 14) * 32 + ((Math.floor(i / 14) % 2) * 16)
    const sy = H * 0.76 + Math.floor(i / 14) * H * 0.05
    g.fillStyle = i % 3 === 0 ? '#7fa6e0' : '#9cbcea'
    g.fillRect(sx, sy, 28, H * 0.042)
  }
  g.restore()
  return c
}

// ------------------------------------------------------------------ 源兵衛の書（古い路地の記録）

/** 和紙 */
function washi(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed: number): void {
  const rng = mulberry32(seed)
  g.fillStyle = '#efe2c4'
  g.fillRect(x, y, w, h)
  for (let i = 0; i < (w * h) / 60; i++) {
    g.fillStyle = `rgba(120,90,50,${range(rng, 0.02, 0.06)})`
    g.fillRect(x + rng() * w, y + rng() * h, range(rng, 1, 4), range(rng, 1, 2))
  }
  // 繊維
  g.strokeStyle = 'rgba(160,130,90,0.12)'
  g.lineWidth = 1
  for (let i = 0; i < 40; i++) {
    const px = x + rng() * w
    const py = y + rng() * h
    g.beginPath()
    g.moveTo(px, py)
    g.quadraticCurveTo(px + range(rng, -10, 10), py + range(rng, -6, 6), px + range(rng, -20, 20), py + range(rng, -8, 8))
    g.stroke()
  }
  // 古いしみ
  for (let i = 0; i < 5; i++) {
    const px = x + rng() * w
    const py = y + rng() * h
    const r = range(rng, 20, 60)
    const gr = g.createRadialGradient(px, py, 0, px, py, r)
    gr.addColorStop(0, 'rgba(150,110,60,0.12)')
    gr.addColorStop(1, 'rgba(150,110,60,0)')
    g.fillStyle = gr
    g.fillRect(px - r, py - r, r * 2, r * 2)
  }
}

/** 縦書きの筆の文字（右から左へ列を並べる） */
function brushColumns(g: CanvasRenderingContext2D, cols: string[], right: number, top: number, px: number, gap: number, color = '#1e140c', font = BRUSH): void {
  g.fillStyle = color
  g.font = `400 ${px}px ${font}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  cols.forEach((col, i) => {
    const cx = right - i * gap
    ;[...col].forEach((ch, k) => g.fillText(ch, cx, top + k * px * 1.05))
  })
}

/** 青い刃のかけら（折れた刃の先のような形。青く光る） */
function blueFragment(g: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  g.save()
  g.translate(cx, cy)
  g.rotate(-0.35)
  // 光（にじみ）
  const glow = g.createRadialGradient(0, 0, s * 0.1, 0, 0, s * 1.1)
  glow.addColorStop(0, 'rgba(110,200,255,0.55)')
  glow.addColorStop(1, 'rgba(110,200,255,0)')
  g.fillStyle = glow
  g.fillRect(-s * 1.2, -s * 1.2, s * 2.4, s * 2.4)
  // 形
  g.beginPath()
  g.moveTo(-s * 0.18, -s * 0.72)
  g.lineTo(s * 0.12, -s * 0.66)
  g.lineTo(s * 0.26, s * 0.1)
  g.lineTo(s * 0.08, s * 0.62)
  g.lineTo(-s * 0.06, s * 0.44)
  g.lineTo(-s * 0.2, s * 0.5)
  g.lineTo(-s * 0.26, -s * 0.05)
  g.closePath()
  const gr = g.createLinearGradient(-s * 0.3, -s * 0.7, s * 0.3, s * 0.6)
  gr.addColorStop(0, '#bfe9ff')
  gr.addColorStop(0.45, '#3f9be8')
  gr.addColorStop(1, '#1b4fa8')
  g.fillStyle = gr
  g.fill()
  g.strokeStyle = '#1e140c'
  g.lineWidth = Math.max(2, s * 0.035)
  g.stroke()
  // 刃のすじと、ひかり
  g.strokeStyle = 'rgba(255,255,255,0.8)'
  g.lineWidth = Math.max(1.5, s * 0.02)
  g.beginPath()
  g.moveTo(-s * 0.08, -s * 0.6)
  g.lineTo(s * 0.1, s * 0.3)
  g.stroke()
  g.restore()
  // コチ、コチの音の線（まわりに短い弧）
  g.strokeStyle = 'rgba(40,90,170,0.7)'
  g.lineWidth = Math.max(1.5, s * 0.025)
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    g.arc(cx, cy, s * (0.95 + i * 0.16), -0.9, -0.4)
    g.stroke()
    g.beginPath()
    g.arc(cx, cy, s * (0.95 + i * 0.16), Math.PI - 0.6, Math.PI - 0.1)
    g.stroke()
  }
}

/** 小さな青いからくりが、爪で空に切れ目を入れている絵（8 章で足される「時を裂く爪」のページ） */
function clawFigure(g: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  g.save()
  g.translate(cx, cy)
  g.strokeStyle = '#1e140c'
  g.lineWidth = Math.max(2, s * 0.03)
  // 体（丸い頭・小さい胴）
  g.fillStyle = 'rgba(80,150,220,0.75)'
  g.beginPath()
  g.ellipse(0, -s * 0.35, s * 0.3, s * 0.24, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = '#f6efe0'
  g.beginPath()
  g.ellipse(0, -s * 0.33, s * 0.2, s * 0.13, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.fillStyle = '#1e140c'
  for (const e of [-1, 1]) {
    g.beginPath()
    g.arc(e * s * 0.07, -s * 0.34, s * 0.025, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = 'rgba(80,150,220,0.75)'
  g.fillRect(-s * 0.13, -s * 0.12, s * 0.26, s * 0.3)
  g.strokeRect(-s * 0.13, -s * 0.12, s * 0.26, s * 0.3)
  // 腕をのばして、爪で空を切る
  g.beginPath()
  g.moveTo(s * 0.13, -s * 0.05)
  g.lineTo(s * 0.5, -s * 0.3)
  g.stroke()
  g.fillStyle = '#3f9be8'
  g.beginPath()
  g.moveTo(s * 0.5, -s * 0.3)
  g.lineTo(s * 0.62, -s * 0.42)
  g.lineTo(s * 0.58, -s * 0.24)
  g.closePath()
  g.fill()
  g.stroke()
  // 空の切れ目（黒い細い裂け目と光）
  g.strokeStyle = 'rgba(60,150,230,0.6)'
  g.lineWidth = s * 0.06
  g.beginPath()
  g.moveTo(s * 0.62, -s * 0.85)
  g.quadraticCurveTo(s * 0.72, -s * 0.4, s * 0.68, s * 0.1)
  g.stroke()
  g.strokeStyle = '#120c08'
  g.lineWidth = s * 0.025
  g.stroke()
  g.restore()
}

/**
 * 源兵衛の書の一ページ。claw=false：青い刃のかけらの絵（6 章で見る記録）。
 * claw=true：となりにもう一ページ、小さな青いからくりが爪で空を切る絵と「時を裂く爪」（8 章で見る、変わった記録）
 */
export function paintGenbeiPage(opts: { claw?: boolean } = {}): HTMLCanvasElement {
  const W = 720
  const H = 340
  const [c, g] = makeCanvas(W, H)
  g.fillStyle = '#2a2018'
  g.fillRect(0, 0, W, H)
  const two = !!opts.claw
  const pw = two ? W / 2 - 14 : W - 40
  const pages = two ? [W / 2 + 4, 10] : [20]
  pages.forEach((px, i) => washi(g, px, 12, pw, H - 24, 1726 + i))
  // 綴じ目（二ページのときは真ん中に影）
  if (two) {
    const gr = g.createLinearGradient(W / 2 - 30, 0, W / 2 + 30, 0)
    gr.addColorStop(0, 'rgba(60,40,20,0)')
    gr.addColorStop(0.5, 'rgba(60,40,20,0.35)')
    gr.addColorStop(1, 'rgba(60,40,20,0)')
    g.fillStyle = gr
    g.fillRect(W / 2 - 30, 12, 60, H - 24)
  }
  // 右のページ（または一ページ）：青い刃のかけら
  const rx = pages[0]
  const fx = rx + pw * (two ? 0.4 : 0.36)
  blueFragment(g, fx, H * 0.52, H * 0.27)
  brushColumns(g, ['空の怪物を裂く', '青き刃のかけら'], rx + pw - 34, 44, H * 0.075, 42)
  brushColumns(g, ['遠き国より伝わる', '時のごとく こちこちと鳴る'], rx + pw * (two ? 0.2 : 0.16), 50, H * 0.05, 30, '#3a2a1a', BRUSH2)
  // 朱の落款
  g.fillStyle = '#c0301e'
  const sx = rx + pw - 70
  g.fillRect(sx, H - 80, 44, 44)
  g.fillStyle = '#efe2c4'
  g.font = `400 30px ${BRUSH}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('源', sx + 22, H - 57)
  if (two) {
    // 左のページ：時を裂く爪
    const lx = pages[1]
    clawFigure(g, lx + pw * 0.45, H * 0.58, H * 0.4)
    brushColumns(g, ['時を裂く爪'], lx + pw - 36, 46, H * 0.085, 40)
    brushColumns(g, ['青きからくり', '空を裂く'], lx + 70, 60, H * 0.05, 30, '#3a2a1a', BRUSH2)
  }
  return c
}

// ------------------------------------------------------------------ IDO 検索の小さな地図

export type MapPin = { id: string; x: number; z: number; label: string; state: 'off' | 'hit' | 'done' | 'focus' }

/** 町の地図（上が北）。範囲は x -24〜24・z -13〜30 */
export function paintTownMap(c: HTMLCanvasElement, pins: readonly MapPin[], t = 0): void {
  const g = c.getContext('2d') as CanvasRenderingContext2D
  const W = c.width
  const H = c.height
  const X = (x: number) => ((x + 24) / 48) * W
  const Z = (z: number) => ((z + 13) / 43) * H
  g.clearRect(0, 0, W, H)
  g.fillStyle = 'rgba(6,24,34,0.85)'
  g.fillRect(0, 0, W, H)
  // 方眼
  g.strokeStyle = 'rgba(120,240,230,0.08)'
  g.lineWidth = 1
  for (let x = 0; x < W; x += 16) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, H)
    g.stroke()
  }
  for (let y = 0; y < H; y += 16) {
    g.beginPath()
    g.moveTo(0, y)
    g.lineTo(W, y)
    g.stroke()
  }
  // 建物の帯（北岸・南岸）
  g.fillStyle = 'rgba(160,230,225,0.16)'
  g.fillRect(0, Z(-13), W, Z(-11) - Z(-13))
  g.fillRect(0, Z(11), X(15) - X(-24), Z(20) - Z(11))
  g.fillRect(X(18), Z(11), W - X(18), Z(20) - Z(11))
  // NEXTMAKE
  g.fillStyle = 'rgba(120,240,230,0.32)'
  g.fillRect(X(-19), Z(11), X(-1) - X(-19), Z(23) - Z(11))
  g.fillStyle = 'rgba(230,255,252,0.85)'
  g.font = `700 ${Math.round(H * 0.06)}px ${GOTHIC}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('NEXTMAKE', X(-10), Z(17))
  // 水路と橋
  g.fillStyle = 'rgba(70,170,230,0.55)'
  g.fillRect(0, Z(-5), W, Z(5) - Z(-5))
  g.fillStyle = 'rgba(230,240,240,0.7)'
  g.fillRect(X(10.5), Z(-6), X(15.5) - X(10.5), Z(6) - Z(-6))
  // 路地と空き地
  g.fillStyle = 'rgba(255,214,140,0.35)'
  g.fillRect(X(15), Z(11), X(18) - X(15), Z(20) - Z(11))
  g.fillRect(X(11), Z(20), X(22.4) - X(11), Z(27.4) - Z(20))
  // ピン
  for (const p of pins) {
    const px = X(p.x)
    const py = Z(p.z)
    const on = p.state !== 'off'
    const col = p.state === 'done' ? '#7dffb0' : p.state === 'focus' ? '#ffd23f' : on ? '#ff7a4f' : 'rgba(170,200,200,0.55)'
    const r = on ? H * 0.045 : H * 0.03
    if (p.state === 'focus' || p.state === 'hit') {
      const k = 0.5 + 0.5 * Math.sin(t * 5)
      g.strokeStyle = col
      g.globalAlpha = 0.35 + 0.4 * k
      g.lineWidth = 2
      g.beginPath()
      g.arc(px, py, r * (1.6 + 0.5 * k), 0, Math.PI * 2)
      g.stroke()
      g.globalAlpha = 1
    }
    g.fillStyle = col
    g.beginPath()
    g.arc(px, py, r, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#04161e'
    g.font = `900 ${Math.round(r * 1.25)}px ${GOTHIC}`
    g.fillText(p.label, px, py + 1)
  }
}

// ------------------------------------------------------------------ 江戸の朝の路地（9 章の映し出し）

/**
 * 朝日の町家の並び（横に長い絵。上は朝の空、下は格子・のれん・からくりの看板）。
 * 光の映像として加算で重ねるので、暗い所は黒に近く、明るい所は暖かい色にする
 */
export function paintEdoMorning(W = 1024, H = 384, seed = 3): HTMLCanvasElement {
  const [c, g] = makeCanvas(W, H)
  const rng = mulberry32(seed)
  // 朝の空（下ほど明るい金色）
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62)
  sky.addColorStop(0, '#5a7ab8')
  sky.addColorStop(0.55, '#f2b070')
  sky.addColorStop(1, '#fff0c0')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  // 朝日（右上）の光の筋
  const sunX = W * 0.78
  const sunY = H * 0.36
  const sg = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.45)
  sg.addColorStop(0, 'rgba(255,250,220,1)')
  sg.addColorStop(0.15, 'rgba(255,220,150,0.7)')
  sg.addColorStop(1, 'rgba(255,200,120,0)')
  g.fillStyle = sg
  g.fillRect(0, 0, W, H)
  // 町家の並び（瓦屋根・格子・のれん・提灯）
  let x = -20
  while (x < W) {
    const w = range(rng, 110, 170)
    const h = H * range(rng, 0.42, 0.52)
    const base = H
    g.fillStyle = '#6a4a30'
    g.fillRect(x, base - h, w, h)
    // 瓦屋根
    g.fillStyle = '#3e3a40'
    g.beginPath()
    g.moveTo(x - 10, base - h)
    g.lineTo(x + w * 0.15, base - h - H * 0.08)
    g.lineTo(x + w * 0.85, base - h - H * 0.08)
    g.lineTo(x + w + 10, base - h)
    g.fill()
    g.strokeStyle = 'rgba(255,220,160,0.5)'
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(x + w * 0.15, base - h - H * 0.08)
    g.lineTo(x + w * 0.85, base - h - H * 0.08)
    g.stroke()
    // 格子（朝日を受けて明るい）
    g.fillStyle = '#e8b878'
    for (let k = 0; k < 9; k++) g.fillRect(x + 10 + k * (w - 20) / 9, base - h * 0.78, 4, h * 0.38)
    // のれん
    g.fillStyle = rng() < 0.5 ? '#2a3a7a' : '#a8321e'
    g.fillRect(x + w * 0.25, base - h * 0.36, w * 0.5, h * 0.18)
    g.fillStyle = '#f4ead2'
    g.font = `400 ${h * 0.11}px ${BRUSH}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(['からくり', '時計', '茶', '歯車', '細工'][Math.floor(rng() * 5)], x + w / 2, base - h * 0.27)
    // 提灯
    g.fillStyle = '#ffb060'
    g.beginPath()
    g.ellipse(x + w * 0.88, base - h * 0.55, 8, 11, 0, 0, Math.PI * 2)
    g.fill()
    x += w + 6
  }
  // 朝の光の帯（斜め）
  g.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 6; i++) {
    const bx = W * (0.15 + i * 0.15)
    const gr = g.createLinearGradient(bx, 0, bx - W * 0.2, H)
    gr.addColorStop(0, 'rgba(255,230,170,0.22)')
    gr.addColorStop(1, 'rgba(255,230,170,0)')
    g.fillStyle = gr
    g.beginPath()
    g.moveTo(bx, 0)
    g.lineTo(bx + 40, 0)
    g.lineTo(bx - W * 0.2 + 70, H)
    g.lineTo(bx - W * 0.2, H)
    g.fill()
  }
  g.globalCompositeOperation = 'source-over'
  // 上下のふちを透明へ（映像のふち）
  const fade = g.createLinearGradient(0, 0, 0, H)
  fade.addColorStop(0, 'rgba(0,0,0,0.85)')
  fade.addColorStop(0.12, 'rgba(0,0,0,0)')
  fade.addColorStop(0.92, 'rgba(0,0,0,0)')
  fade.addColorStop(1, 'rgba(0,0,0,0.6)')
  g.fillStyle = fade
  g.fillRect(0, 0, W, H)
  return c
}
