// 2026年 なんばの絵（キャンバス）：看板の一覧、IDO の QR の板、NEXTMAKE の室内の掲示物・画面、
// ホワイトボードのネクマックスの構想スケッチ（丸い頭・上辺がくぼむ顔プレート・アンテナなし）、IDO パネルの昔の町の絵。
import { mulberry32, range } from '../../render/noise'
import { makeCanvas } from '../../render/textures'
import { SignAtlas, drawNextmakeMark, type SignDef } from './signs'

const HAND = '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Yu Gothic",sans-serif'
const GOTHIC = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif'

/** 外の看板（id → 定義） */
export const STREET_SIGNS: SignDef[] = [
  { id: 'nm_logo', text: 'NEXTMAKE', w: 1024, h: 168, bg: '#0f1d3a', bg2: '#16294f', fg: '#ffffff', deco: 'logo', font: 'gothic' },
  { id: 'lab_sign', text: 'LAB  ラボ', w: 384, h: 96, bg: '#14223f', fg: '#ffd56a', font: 'gothic' },
  { id: 'tako_main', text: 'たこ焼', w: 640, h: 224, bg: '#d22a1e', bg2: '#b01c14', fg: '#ffe14a', outline: '#5a0a06', border: '#ffe14a', font: 'brush' },
  { id: 'tako_v', text: 'たこ焼', vertical: true, w: 160, h: 512, bg: '#e8321f', fg: '#ffffff', border: '#ffd84a', deco: 'dots', font: 'gothic' },
  { id: 'tako_lantern', text: 'たこ焼', vertical: true, w: 192, h: 288, bg: '#d8261a', fg: '#1a0a06', deco: 'lantern', font: 'brush' },
  { id: 'tako_noren', text: 'たこ', w: 512, h: 192, bg: '#c91f17', fg: '#ffffff', font: 'brush', deco: 'none' },
  { id: 'tako_menu', text: 'たこ焼 8コ 600円\nねぎ・ソース・しお', w: 320, h: 200, bg: '#1d1a17', fg: '#fff3d0', font: 'round', border: '#c9932a' },
  { id: 'kushi_main', text: '串カツ', w: 640, h: 224, bg: '#ffd21f', bg2: '#f2b90f', fg: '#1a1208', outline: '#ffffff', border: '#1a1208', font: 'gothic' },
  { id: 'kushi_v', text: '串カツ', vertical: true, w: 160, h: 448, bg: '#1a1208', fg: '#ffd21f', border: '#ffd21f', deco: 'dots', font: 'gothic' },
  { id: 'kushi_lantern', text: '串カツ', vertical: true, w: 192, h: 288, bg: '#f4f0e6', fg: '#c01818', deco: 'lantern', font: 'brush' },
  { id: 'udon_main', text: 'うどん', w: 640, h: 224, bg: '#f7f2e6', fg: '#1a1410', border: '#c41e1e', font: 'brush' },
  { id: 'udon_v', text: 'うどん', vertical: true, w: 160, h: 448, bg: '#c41e1e', fg: '#ffffff', border: '#ffffff', font: 'brush' },
  { id: 'okonomi_main', text: 'お好み焼', w: 768, h: 224, bg: '#f08a1c', bg2: '#d86a10', fg: '#ffffff', outline: '#6a2a04', border: '#ffffff', font: 'round' },
  { id: 'okonomi_v', text: 'お好み焼', vertical: true, w: 160, h: 560, bg: '#ffffff', fg: '#d8501a', border: '#d8501a', deco: 'dots', font: 'round' },
  { id: 'namba_big', text: 'なんば', sub: 'NAMBA', w: 640, h: 320, bg: '#1d4fb8', bg2: '#163f96', fg: '#ffffff', border: '#ffffff', font: 'round' },
  { id: 'osaka_v', text: '大阪', vertical: true, w: 224, h: 512, bg: '#ffffff', fg: '#d01c1c', border: '#d01c1c', font: 'brush' },
  { id: 'osaka_red', text: '大阪', vertical: true, w: 192, h: 448, bg: '#d01c1c', fg: '#ffffff', border: '#ffd84a', deco: 'dots', font: 'gothic' },
  { id: 'ramen_v', text: 'ラーメン', vertical: true, w: 160, h: 560, bg: '#c81c1c', fg: '#ffe14a', border: '#ffe14a', font: 'gothic' },
  { id: 'izakaya_v', text: '居酒屋', vertical: true, w: 160, h: 448, bg: '#2a1a12', fg: '#ffffff', border: '#e8a030', font: 'brush' },
  { id: 'sushi_v', text: 'すし', vertical: true, w: 160, h: 320, bg: '#f7f2e6', fg: '#1a3a7a', border: '#1a3a7a', font: 'brush' },
  { id: 'kissa_v', text: '喫茶', vertical: true, w: 160, h: 320, bg: '#5a3a22', fg: '#fff0d0', border: '#e0c090', font: 'mincho' },
  { id: 'karaoke', text: 'カラオケ', w: 512, h: 160, bg: '#e8288a', bg2: '#b81c6a', fg: '#ffffff', border: '#ffe0f0', deco: 'dots', font: 'round' },
  { id: 'hotel', text: 'HOTEL', w: 384, h: 128, bg: '#14243f', fg: '#9fe0ff', border: '#9fe0ff', font: 'gothic' },
  { id: 'gourmet', text: 'なにわグルメ横丁', w: 896, h: 176, bg: '#1a1410', fg: '#ffcf4a', border: '#ffcf4a', deco: 'dots', font: 'gothic' },
  { id: 'cafe', text: 'CAFE', w: 320, h: 128, bg: '#2a5a3a', fg: '#ffffff', border: '#f0e0c0', font: 'gothic' },
  { id: 'drug', text: 'くすり', w: 448, h: 160, bg: '#ffe23a', fg: '#1a3a9a', border: '#1a3a9a', font: 'gothic' },
  { id: 'gyoza_v', text: 'ぎょうざ', vertical: true, w: 160, h: 448, bg: '#f2f2f2', fg: '#c81c1c', border: '#c81c1c', font: 'round' },
  { id: 'takoyaki_red_v', text: '名物たこ焼', vertical: true, w: 176, h: 640, bg: '#d81e1e', fg: '#ffffff', border: '#ffffff', font: 'brush' },
  { id: 'osaka_wide', text: 'ようこそ大阪', w: 896, h: 192, bg: '#ffffff', fg: '#d01c1c', border: '#d01c1c', font: 'round' },
]

/** IDO の広告（北岸のビル） */
function paintIdoAd(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const gr = g.createLinearGradient(x, y, x, y + h)
  gr.addColorStop(0, '#2a62d8')
  gr.addColorStop(1, '#5fb4ff')
  g.fillStyle = gr
  g.fillRect(x, y, w, h)
  // 大阪城のシルエットと波
  g.fillStyle = 'rgba(255,255,255,0.18)'
  const cx = x + w * 0.72
  const by = y + h * 0.78
  for (let k = 0; k < 4; k++) {
    const ww = w * (0.24 - k * 0.045)
    g.fillRect(cx - ww / 2, by - h * (0.12 + k * 0.12), ww, h * 0.1)
    g.beginPath()
    g.moveTo(cx - ww / 2 - w * 0.03, by - h * (0.12 + k * 0.12))
    g.lineTo(cx, by - h * (0.2 + k * 0.12))
    g.lineTo(cx + ww / 2 + w * 0.03, by - h * (0.12 + k * 0.12))
    g.fill()
  }
  g.fillStyle = 'rgba(255,255,255,0.25)'
  for (let i = 0; i < 3; i++) {
    g.beginPath()
    for (let px = 0; px <= w; px += 8) {
      const py = by + i * h * 0.06 + Math.sin(px / 30 + i) * 6
      if (px === 0) g.moveTo(x + px, py)
      else g.lineTo(x + px, py)
    }
    g.lineTo(x + w, y + h)
    g.lineTo(x, y + h)
    g.fill()
  }
  g.fillStyle = '#ffffff'
  g.font = `900 ${h * 0.34}px ${GOTHIC}`
  g.textBaseline = 'middle'
  g.textAlign = 'left'
  g.fillText('IDO', x + w * 0.07, y + h * 0.3)
  g.font = `800 ${h * 0.13}px ${HAND}`
  g.fillText('時を旅する大阪', x + w * 0.07, y + h * 0.58)
  g.font = `700 ${h * 0.085}px ${GOTHIC}`
  g.fillText('QRで、まちの歴史を見よう', x + w * 0.07, y + h * 0.74)
  g.strokeStyle = '#ffffff'
  g.lineWidth = h * 0.03
  g.strokeRect(x + h * 0.03, y + h * 0.03, w - h * 0.06, h - h * 0.06)
}

/** QR らしい模様（3 つの位置決めの四角＋ランダムなセル） */
export function drawQR(g: CanvasRenderingContext2D, x: number, y: number, s: number, seed = 7, ink = '#151515', paper = '#f4f1e8'): void {
  const n = 25
  const cell = s / n
  const rng = mulberry32(seed)
  g.fillStyle = paper
  g.fillRect(x - cell * 2, y - cell * 2, s + cell * 4, s + cell * 4)
  const finder = (fx: number, fy: number) => {
    g.fillStyle = ink
    g.fillRect(x + fx * cell, y + fy * cell, cell * 7, cell * 7)
    g.fillStyle = paper
    g.fillRect(x + (fx + 1) * cell, y + (fy + 1) * cell, cell * 5, cell * 5)
    g.fillStyle = ink
    g.fillRect(x + (fx + 2) * cell, y + (fy + 2) * cell, cell * 3, cell * 3)
  }
  const inFinder = (i: number, j: number) => (i < 8 && j < 8) || (i >= n - 8 && j < 8) || (i < 8 && j >= n - 8)
  g.fillStyle = ink
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (inFinder(i, j)) continue
      const timing = (i === 6 || j === 6) && (i + j) % 2 === 0
      if (timing || rng() < 0.47) g.fillRect(x + i * cell, y + j * cell, cell + 0.4, cell + 0.4)
    }
  }
  finder(0, 0)
  finder(n - 7, 0)
  finder(0, n - 7)
  // 右下の小さな位置合わせ
  g.fillStyle = ink
  g.fillRect(x + (n - 9) * cell, y + (n - 9) * cell, cell * 5, cell * 5)
  g.fillStyle = paper
  g.fillRect(x + (n - 8) * cell, y + (n - 8) * cell, cell * 3, cell * 3)
  g.fillStyle = ink
  g.fillRect(x + (n - 7) * cell, y + (n - 7) * cell, cell, cell)
}

/** IDO マーカーの板（ブロンズ。上に IDO の文字、中央に QR、下に案内） */
function paintIdoPlate(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const gr = g.createLinearGradient(x, y, x + w, y + h)
  gr.addColorStop(0, '#9a7a4a')
  gr.addColorStop(0.5, '#7a5a32')
  gr.addColorStop(1, '#5a4024')
  g.fillStyle = gr
  g.fillRect(x, y, w, h)
  const rng = mulberry32(3)
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,230,180' : '30,20,10'},${range(rng, 0.03, 0.1)})`
    g.fillRect(x + rng() * w, y + rng() * h, range(rng, 1, 3), range(rng, 1, 3))
  }
  // 緑青
  for (let i = 0; i < 14; i++) {
    const rg = g.createRadialGradient(x + rng() * w, y + rng() * h, 0, x + rng() * w, y + rng() * h, w * 0.18)
    rg.addColorStop(0, 'rgba(90,150,120,0.22)')
    rg.addColorStop(1, 'rgba(90,150,120,0)')
    g.fillStyle = rg
    g.fillRect(x, y, w, h)
  }
  g.strokeStyle = '#3a2814'
  g.lineWidth = w * 0.025
  g.strokeRect(x + w * 0.03, y + w * 0.03, w - w * 0.06, h - w * 0.06)
  // ネジ
  for (const [px, py] of [
    [0.08, 0.06],
    [0.92, 0.06],
    [0.08, 0.94],
    [0.92, 0.94],
  ]) {
    g.fillStyle = '#c9a870'
    g.beginPath()
    g.arc(x + w * px, y + h * py, w * 0.025, 0, Math.PI * 2)
    g.fill()
  }
  // 太陽と波のしるし
  g.strokeStyle = '#2a1c0c'
  g.lineWidth = w * 0.018
  g.beginPath()
  g.arc(x + w * 0.5, y + h * 0.13, w * 0.07, Math.PI, 0)
  g.stroke()
  for (let i = 0; i < 2; i++) {
    g.beginPath()
    for (let px = -0.12; px <= 0.12; px += 0.01) {
      const py = 0.155 + i * 0.03 + Math.sin(px * 50) * 0.006
      if (px === -0.12) g.moveTo(x + w * (0.5 + px), y + h * py)
      else g.lineTo(x + w * (0.5 + px), y + h * py)
    }
    g.stroke()
  }
  // QR（白い紙＋光る枠）
  const qs = w * 0.62
  drawQR(g, x + (w - qs) / 2, y + h * 0.24, qs, 11)
  g.fillStyle = '#20140a'
  g.font = `900 ${h * 0.1}px ${GOTHIC}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('IDO', x + w / 2, y + h * 0.82)
  g.font = `700 ${h * 0.04}px ${GOTHIC}`
  g.fillText('歴史案内 ― なんば・水の町の記憶', x + w / 2, y + h * 0.9)
}

export function registerStreetArt(a: SignAtlas): void {
  // 背の高い順に棚へ詰める（アトラスの無駄を減らす）。看板は 0.82 倍の解像度で十分
  const list = [...STREET_SIGNS].map((d) => ({ ...d, w: Math.round(d.w * 0.82), h: Math.round(d.h * 0.82) })).sort((p, q) => q.h - p.h)
  a.addCustom('ido_plate', 384, 512, paintIdoPlate)
  a.addCustom('ido_ad', 640, 320, paintIdoAd)
  for (const d of list) a.add(d)
  // 店の中（ガラス越しに見える暖かい店内：奥の壁の棚と品物・カウンター・品書き・吊り下げの照明・人影）
  a.addCustom('shop_inside', 384, 192, (g, x, y, w, h) => {
    const rng = mulberry32(5)
    const wall = g.createLinearGradient(x, y, x, y + h)
    wall.addColorStop(0, '#ffe2b0')
    wall.addColorStop(0.6, '#e8a868')
    wall.addColorStop(1, '#a8603a')
    g.fillStyle = wall
    g.fillRect(x, y, w, h)
    // 棚（3 段）と品物
    for (let r = 0; r < 3; r++) {
      const sy = y + h * (0.18 + r * 0.15)
      g.fillStyle = '#7a4a2a'
      g.fillRect(x + w * 0.04, sy + h * 0.1, w * 0.92, h * 0.018)
      for (let px = x + w * 0.05; px < x + w * 0.94; px += range(rng, 5, 11)) {
        const bh = h * range(rng, 0.04, 0.095)
        g.fillStyle = `hsl(${range(rng, 0, 360)},${range(rng, 35, 70)}%,${range(rng, 40, 70)}%)`
        g.fillRect(px, sy + h * 0.1 - bh, range(rng, 3, 7), bh)
      }
    }
    // 品書きの札
    for (let i = 0; i < 7; i++) {
      g.fillStyle = i % 3 === 0 ? '#c8281c' : '#fff6e0'
      g.fillRect(x + w * (0.08 + i * 0.12), y + h * 0.04, w * 0.08, h * 0.12)
      g.fillStyle = i % 3 === 0 ? '#fff6e0' : '#3a2010'
      for (let k = 0; k < 3; k++) g.fillRect(x + w * (0.1 + i * 0.12), y + h * (0.06 + k * 0.03), w * 0.04, h * 0.012)
    }
    // 吊り下げの照明
    for (let i = 0; i < 4; i++) {
      const lx = x + w * (0.15 + i * 0.23)
      const rg = g.createRadialGradient(lx, y + h * 0.6, 0, lx, y + h * 0.6, w * 0.12)
      rg.addColorStop(0, 'rgba(255,240,200,0.55)')
      rg.addColorStop(1, 'rgba(255,240,200,0)')
      g.fillStyle = rg
      g.fillRect(lx - w * 0.12, y + h * 0.45, w * 0.24, h * 0.35)
    }
    // カウンター
    g.fillStyle = '#6a3a1e'
    g.fillRect(x, y + h * 0.74, w, h * 0.26)
    g.fillStyle = '#b07a4a'
    g.fillRect(x, y + h * 0.72, w, h * 0.04)
    // 人影（客と店員）
    for (let i = 0; i < 4; i++) {
      const px = x + range(rng, 0.1, 0.9) * w
      g.fillStyle = `rgba(${Math.round(range(rng, 40, 90))},30,20,0.55)`
      g.beginPath()
      g.arc(px, y + h * 0.56, w * 0.028, 0, Math.PI * 2)
      g.fill()
      g.fillRect(px - w * 0.04, y + h * 0.6, w * 0.08, h * 0.16)
    }
  })
}

// ------------------------------------------------------------------ NEXTMAKE の室内

/** ネクマックスの構想スケッチ（マツイ社長の手描き風）。原画のパステルの主人公：アンテナなし */
export function drawNexmaxSketch(g: CanvasRenderingContext2D, cx: number, cy: number, s: number, ink = '#1d2a4a'): void {
  g.save()
  g.translate(cx, cy)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const wob = (k: number) => Math.sin(k * 12.9898) * s * 0.004
  // パステルの水色（マーカーでざっと塗った感じ）
  const fill = (path: () => void, color: string) => {
    g.fillStyle = color
    path()
    g.fill()
  }
  const line = (w: number) => {
    g.strokeStyle = ink
    g.lineWidth = s * w
  }
  const head = () => {
    g.beginPath()
    g.ellipse(0, -s * 0.36, s * 0.42, s * 0.32, 0, 0, Math.PI * 2)
  }
  const body = () => {
    g.beginPath()
    g.moveTo(-s * 0.12, -s * 0.02)
    g.quadraticCurveTo(-s * 0.17, s * 0.16, -s * 0.1, s * 0.22)
    g.lineTo(s * 0.1, s * 0.22)
    g.quadraticCurveTo(s * 0.17, s * 0.16, s * 0.12, -s * 0.02)
    g.closePath()
  }
  fill(body, 'rgba(140,200,245,0.75)')
  fill(head, 'rgba(140,200,245,0.8)')
  // 耳パッド
  for (const e of [-1, 1]) {
    g.beginPath()
    g.ellipse(e * s * 0.42, -s * 0.36, s * 0.06, s * 0.09, 0, 0, Math.PI * 2)
    g.fillStyle = 'rgba(120,185,240,0.9)'
    g.fill()
    line(0.012)
    g.stroke()
  }
  line(0.016)
  head()
  g.stroke()
  // 顔プレート：上辺の中央がくぼむ
  g.beginPath()
  const T = -s * 0.5
  g.moveTo(-s * 0.3, T + s * 0.06)
  g.quadraticCurveTo(-s * 0.3, T, -s * 0.24, T)
  g.lineTo(-s * 0.07, T)
  g.quadraticCurveTo(0, T + s * 0.06, s * 0.07, T)
  g.lineTo(s * 0.24, T)
  g.quadraticCurveTo(s * 0.3, T, s * 0.3, T + s * 0.06)
  g.lineTo(s * 0.3, -s * 0.22)
  g.quadraticCurveTo(s * 0.29, -s * 0.12, s * 0.12, -s * 0.11)
  g.quadraticCurveTo(0, -s * 0.1, -s * 0.12, -s * 0.11)
  g.quadraticCurveTo(-s * 0.29, -s * 0.12, -s * 0.3, -s * 0.22)
  g.closePath()
  g.fillStyle = '#ffffff'
  g.fill()
  line(0.014)
  g.stroke()
  // 目と口
  g.fillStyle = ink
  for (const e of [-1, 1]) {
    g.beginPath()
    g.ellipse(e * s * 0.1 + wob(e), -s * 0.32, s * 0.035, s * 0.045, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.beginPath()
  g.moveTo(-s * 0.035, -s * 0.21)
  g.quadraticCurveTo(0, -s * 0.2, s * 0.035, -s * 0.21)
  g.quadraticCurveTo(0, -s * 0.15, -s * 0.035, -s * 0.21)
  g.fillStyle = '#f07a5a'
  g.fill()
  line(0.008)
  g.stroke()
  // 眉（ヘルメットに描いた短い弧）
  line(0.012)
  for (const e of [-1, 1]) {
    g.beginPath()
    g.arc(e * s * 0.12, -s * 0.5, s * 0.05, Math.PI * 1.15, Math.PI * 1.85)
    g.stroke()
  }
  // 胴と胸の山形ロゴ
  line(0.014)
  body()
  g.stroke()
  g.fillStyle = 'rgba(40,110,200,0.9)'
  g.beginPath()
  g.moveTo(-s * 0.05, s * 0.1)
  g.lineTo(-s * 0.02, s * 0.03)
  g.lineTo(s * 0.01, s * 0.1)
  g.lineTo(s * 0.05, s * 0.02)
  g.lineTo(s * 0.06, s * 0.1)
  g.closePath()
  g.fill()
  // 玉をつないだ腕と脚
  const beads = (pts: Array<[number, number, number]>) => {
    for (const [px, py, r] of pts) {
      g.beginPath()
      g.arc(px * s, py * s, r * s, 0, Math.PI * 2)
      g.fillStyle = 'rgba(140,200,245,0.85)'
      g.fill()
      line(0.01)
      g.stroke()
    }
  }
  beads([
    [-0.15, 0.0, 0.03],
    [-0.19, 0.06, 0.028],
    [-0.21, 0.12, 0.02],
    [-0.23, 0.18, 0.032],
  ])
  beads([
    [0.15, 0.0, 0.03],
    [0.19, 0.06, 0.028],
    [0.21, 0.12, 0.02],
    [0.23, 0.18, 0.034],
  ])
  beads([
    [-0.06, 0.25, 0.025],
    [-0.06, 0.3, 0.022],
  ])
  beads([
    [0.06, 0.25, 0.025],
    [0.06, 0.3, 0.022],
  ])
  // 半球の足
  for (const e of [-1, 1]) {
    g.beginPath()
    g.ellipse(e * s * 0.065, s * 0.36, s * 0.06, s * 0.035, 0, Math.PI, 0)
    g.closePath()
    g.fillStyle = 'rgba(140,200,245,0.9)'
    g.fill()
    line(0.012)
    g.stroke()
  }
  g.restore()
}

function hand(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color = '#1d2a4a', align: CanvasTextAlign = 'left'): void {
  g.font = `800 ${px}px ${HAND}`
  g.fillStyle = color
  g.textAlign = align
  g.textBaseline = 'middle'
  g.fillText(text, x, y)
}

function whiteboardBase(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#f7f8f6'
  g.fillRect(x, y, w, h)
  const gr = g.createLinearGradient(x, y, x + w, y + h)
  gr.addColorStop(0, 'rgba(255,255,255,0.4)')
  gr.addColorStop(0.6, 'rgba(255,255,255,0)')
  gr.addColorStop(1, 'rgba(150,160,170,0.12)')
  g.fillStyle = gr
  g.fillRect(x, y, w, h)
  // 消し残し
  const rng = mulberry32(8)
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `rgba(80,100,140,${range(rng, 0.02, 0.05)})`
    g.fillRect(x + rng() * w, y + rng() * h, range(rng, 40, 160), range(rng, 6, 20))
  }
  g.strokeStyle = '#b8bec6'
  g.lineWidth = 10
  g.strokeRect(x + 5, y + 5, w - 10, h - 10)
}

/** ラボの構想ボード：ネクマックスのスケッチと書き込み */
function paintConceptBoard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  whiteboardBase(g, x, y, w, h)
  hand(g, 'NEXMAX 構想スケッチ', x + w * 0.05, y + h * 0.09, h * 0.075)
  g.strokeStyle = '#1d2a4a'
  g.lineWidth = 4
  g.beginPath()
  g.moveTo(x + w * 0.05, y + h * 0.15)
  g.lineTo(x + w * 0.5, y + h * 0.15)
  g.stroke()
  drawNexmaxSketch(g, x + w * 0.36, y + h * 0.58, h * 0.78)
  const notes: Array<[string, number, number, string]> = [
    ['名前：ネクマックス', 0.66, 0.24, '#1d2a4a'],
    ['人と一緒につくるロボット', 0.66, 0.34, '#c0392b'],
    ['丸い頭・白い顔プレート', 0.66, 0.46, '#1d2a4a'],
    ['（上のふちが少しへこむ）', 0.66, 0.54, '#1d2a4a'],
    ['アンテナなし！', 0.66, 0.66, '#2a6fd0'],
    ['手足は玉つなぎ', 0.66, 0.76, '#1d2a4a'],
    ['2026.10  マツイ', 0.66, 0.9, '#7a8090'],
  ]
  for (const [t, nx, ny, col] of notes) hand(g, t, x + w * nx, y + h * ny, h * 0.05, col)
  // 矢印
  g.strokeStyle = '#c0392b'
  g.lineWidth = 3
  g.beginPath()
  g.moveTo(x + w * 0.64, y + h * 0.46)
  g.quadraticCurveTo(x + w * 0.56, y + h * 0.4, x + w * 0.47, y + h * 0.36)
  g.stroke()
  g.beginPath()
  g.moveTo(x + w * 0.64, y + h * 0.66)
  g.quadraticCurveTo(x + w * 0.55, y + h * 0.6, x + w * 0.43, y + h * 0.17)
  g.stroke()
  // 付箋
  const sticky = (sx: number, sy: number, col: string, text: string) => {
    g.fillStyle = col
    g.fillRect(x + w * sx, y + h * sy, w * 0.11, h * 0.13)
    hand(g, text, x + w * (sx + 0.055), y + h * (sy + 0.065), h * 0.035, '#3a2a10', 'center')
  }
  sticky(0.6, 0.015, '#ffe680', 'かわいく')
  sticky(0.735, 0.015, '#9fe0b0', 'やさしく')
}

/** 会議室のホワイトボード（IDO 2026 の計画） */
function paintMeetingBoard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  whiteboardBase(g, x, y, w, h)
  hand(g, 'IDO 2026', x + w * 0.06, y + h * 0.12, h * 0.1)
  hand(g, '大阪から世界へ！', x + w * 0.56, y + h * 0.16, h * 0.07, '#c0392b')
  // ドームと街のスケッチ
  g.strokeStyle = '#2a6fd0'
  g.lineWidth = 3
  g.beginPath()
  g.arc(x + w * 0.3, y + h * 0.55, h * 0.2, Math.PI, 0)
  g.stroke()
  for (let i = -3; i <= 3; i++) {
    g.beginPath()
    g.moveTo(x + w * 0.3 + i * h * 0.05, y + h * 0.55)
    g.lineTo(x + w * 0.3 + i * h * 0.05, y + h * (0.48 - Math.abs(i) * 0.01 + (i % 2) * 0.03))
    g.stroke()
  }
  g.beginPath()
  g.moveTo(x + w * 0.08, y + h * 0.55)
  g.lineTo(x + w * 0.52, y + h * 0.55)
  g.stroke()
  const items = ['□ 試作機 v1', '□ フィールドテスト', '□ IDO 出展', '□ 社会実装']
  items.forEach((t, i) => hand(g, t, x + w * 0.58, y + h * (0.36 + i * 0.13), h * 0.065))
  hand(g, 'QR → 歴史の写真・映像', x + w * 0.08, y + h * 0.75, h * 0.055, '#1d2a4a')
  hand(g, 'なんば・道の記憶をつなぐ', x + w * 0.08, y + h * 0.86, h * 0.055, '#1d2a4a')
}

/** モニターの画面（kind：0 CAD・1 コード・2 IDO アプリ・3 表） */
function paintScreen(kind: number) {
  return (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const rng = mulberry32(100 + kind)
    g.fillStyle = kind === 2 ? '#eef3fa' : '#0f1a2a'
    g.fillRect(x, y, w, h)
    if (kind === 0) {
      g.strokeStyle = 'rgba(80,160,255,0.25)'
      g.lineWidth = 1
      for (let i = 0; i < w; i += 16) {
        g.beginPath()
        g.moveTo(x + i, y)
        g.lineTo(x + i, y + h)
        g.stroke()
      }
      for (let i = 0; i < h; i += 16) {
        g.beginPath()
        g.moveTo(x, y + i)
        g.lineTo(x + w, y + i)
        g.stroke()
      }
      g.strokeStyle = '#7fd4ff'
      g.lineWidth = 2.5
      // 腕の部品の図面
      g.strokeRect(x + w * 0.2, y + h * 0.3, w * 0.35, h * 0.2)
      g.beginPath()
      g.arc(x + w * 0.62, y + h * 0.4, h * 0.14, 0, Math.PI * 2)
      g.stroke()
      g.beginPath()
      g.arc(x + w * 0.62, y + h * 0.4, h * 0.05, 0, Math.PI * 2)
      g.stroke()
      g.strokeRect(x + w * 0.3, y + h * 0.55, w * 0.4, h * 0.12)
      g.fillStyle = '#7fd4ff'
      g.font = `700 ${h * 0.06}px ${GOTHIC}`
      g.fillText('ARM_JOINT_v3', x + w * 0.05, y + h * 0.12)
    } else if (kind === 1) {
      g.font = `600 ${h * 0.05}px Menlo, monospace`
      for (let i = 0; i < 16; i++) {
        const ind = Math.floor(rng() * 4) * w * 0.04
        g.fillStyle = ['#7fd4ff', '#ffcf6a', '#9fe08a', '#f08aa8', '#c8d0e0'][Math.floor(rng() * 5)]
        g.fillRect(x + w * 0.05 + ind, y + h * (0.06 + i * 0.058), w * range(rng, 0.15, 0.6), h * 0.028)
      }
    } else if (kind === 2) {
      // IDO アプリ：地図とピン
      g.fillStyle = '#cfe2f5'
      g.fillRect(x + w * 0.04, y + h * 0.18, w * 0.6, h * 0.76)
      g.strokeStyle = '#ffffff'
      g.lineWidth = 6
      for (let i = 0; i < 5; i++) {
        g.beginPath()
        g.moveTo(x + w * 0.04, y + h * (0.25 + i * 0.15))
        g.lineTo(x + w * 0.64, y + h * (0.2 + i * 0.16))
        g.stroke()
      }
      g.strokeStyle = '#6aa8e8'
      g.lineWidth = 10
      g.beginPath()
      g.moveTo(x + w * 0.04, y + h * 0.56)
      g.bezierCurveTo(x + w * 0.2, y + h * 0.5, x + w * 0.4, y + h * 0.62, x + w * 0.64, y + h * 0.55)
      g.stroke()
      for (let i = 0; i < 5; i++) {
        g.fillStyle = '#e8453a'
        g.beginPath()
        g.arc(x + w * range(rng, 0.1, 0.6), y + h * range(rng, 0.25, 0.85), h * 0.03, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#2f6fe0'
      g.fillRect(x, y, w, h * 0.12)
      g.fillStyle = '#ffffff'
      g.font = `900 ${h * 0.08}px ${GOTHIC}`
      g.fillText('IDO', x + w * 0.04, y + h * 0.085)
      for (let i = 0; i < 4; i++) {
        g.fillStyle = '#ffffff'
        g.fillRect(x + w * 0.68, y + h * (0.18 + i * 0.19), w * 0.28, h * 0.16)
        g.fillStyle = '#b8c4d6'
        g.fillRect(x + w * 0.7, y + h * (0.2 + i * 0.19), w * 0.08, h * 0.12)
        g.fillRect(x + w * 0.8, y + h * (0.22 + i * 0.19), w * 0.14, h * 0.02)
      }
    } else {
      g.fillStyle = '#ffffff'
      g.fillRect(x + w * 0.04, y + h * 0.06, w * 0.92, h * 0.88)
      g.strokeStyle = '#c8d0dc'
      for (let i = 0; i < 12; i++) {
        g.beginPath()
        g.moveTo(x + w * 0.04, y + h * (0.12 + i * 0.07))
        g.lineTo(x + w * 0.96, y + h * (0.12 + i * 0.07))
        g.stroke()
      }
      g.fillStyle = '#4a9a5a'
      for (let i = 0; i < 6; i++) g.fillRect(x + w * (0.55 + i * 0.065), y + h * (0.85 - (i + 1) * 0.08), w * 0.04, h * (i + 1) * 0.08)
    }
  }
}

/** ロゴの壁（受付の後ろ） */
function paintLogoWall(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#f4f2ee'
  g.fillRect(x, y, w, h)
  drawNextmakeMark(g, x + w * 0.5, y + h * 0.32, h * 0.32, '#16294f', '#f2c84b')
  g.fillStyle = '#16294f'
  g.font = `900 ${h * 0.16}px ${GOTHIC}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('NEXTMAKE', x + w / 2, y + h * 0.62)
  g.font = `700 ${h * 0.07}px ${HAND}`
  g.fillStyle = '#3a4a6a'
  g.fillText('つくることで、まだ見ぬ未来へ。', x + w / 2, y + h * 0.8)
}

/** ポスター */
function paintPoster(kind: number) {
  return (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    if (kind === 0) {
      const gr = g.createLinearGradient(x, y, x, y + h)
      gr.addColorStop(0, '#0e1e48')
      gr.addColorStop(1, '#2a5ab8')
      g.fillStyle = gr
      g.fillRect(x, y, w, h)
      g.fillStyle = 'rgba(160,220,255,0.35)'
      g.beginPath()
      g.arc(x + w / 2, y + h * 0.45, w * 0.32, Math.PI, 0)
      g.fill()
      g.fillStyle = '#ffffff'
      g.font = `900 ${w * 0.22}px ${GOTHIC}`
      g.textAlign = 'center'
      g.fillText('IDO', x + w / 2, y + h * 0.72)
      g.font = `800 ${w * 0.075}px ${HAND}`
      g.fillText('時を旅する大阪', x + w / 2, y + h * 0.84)
    } else {
      g.fillStyle = '#f2c84b'
      g.fillRect(x, y, w, h)
      g.fillStyle = '#16294f'
      g.font = `900 ${w * 0.11}px ${GOTHIC}`
      g.textAlign = 'center'
      g.fillText('はじまりは、', x + w / 2, y + h * 0.4)
      g.fillText('つくることから', x + w / 2, y + h * 0.55)
      drawNextmakeMark(g, x + w / 2, y + h * 0.78, w * 0.22, '#16294f', '#ffffff')
    }
  }
}

function paintBooks(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const rng = mulberry32(21)
  g.fillStyle = '#3a2a1a'
  g.fillRect(x, y, w, h)
  let px = x
  while (px < x + w) {
    const bw = range(rng, 10, 26)
    const bh = h * range(rng, 0.72, 0.98)
    g.fillStyle = `hsl(${range(rng, 0, 360)},${range(rng, 25, 60)}%,${range(rng, 30, 65)}%)`
    g.fillRect(px, y + h - bh, bw - 1.5, bh)
    g.fillStyle = 'rgba(255,255,255,0.5)'
    g.fillRect(px + bw * 0.25, y + h - bh * 0.8, bw * 0.4, bh * 0.25)
    px += bw
  }
}

function paintPegboard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#c9a77c'
  g.fillRect(x, y, w, h)
  g.fillStyle = 'rgba(60,40,20,0.55)'
  for (let i = 10; i < w; i += 18) for (let j = 10; j < h; j += 18) g.fillRect(x + i, y + j, 3, 3)
  // 工具のシルエット
  g.fillStyle = '#3a3f46'
  const rng = mulberry32(4)
  for (let i = 0; i < 9; i++) {
    const tx = x + w * (0.06 + i * 0.105)
    const ty = y + h * 0.18
    const k = i % 3
    if (k === 0) {
      g.fillRect(tx, ty, w * 0.02, h * 0.5)
      g.fillStyle = '#c0392b'
      g.fillRect(tx - w * 0.01, ty + h * 0.45, w * 0.04, h * 0.25)
      g.fillStyle = '#3a3f46'
    } else if (k === 1) {
      g.beginPath()
      g.arc(tx + w * 0.02, ty + h * 0.1, w * 0.025, 0, Math.PI * 2)
      g.fill()
      g.fillRect(tx + w * 0.012, ty + h * 0.1, w * 0.016, h * 0.55)
    } else {
      g.fillRect(tx, ty + h * range(rng, 0, 0.1), w * 0.05, h * 0.08)
      g.fillRect(tx + w * 0.018, ty + h * 0.08, w * 0.014, h * 0.45)
    }
  }
}

/** オシロスコープ・3D プリンタの小さな画面 */
function paintScope(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#04120a'
  g.fillRect(x, y, w, h)
  g.strokeStyle = 'rgba(80,255,140,0.25)'
  g.lineWidth = 1
  for (let i = 1; i < 10; i++) {
    g.beginPath()
    g.moveTo(x + (w * i) / 10, y)
    g.lineTo(x + (w * i) / 10, y + h)
    g.stroke()
  }
  for (let i = 1; i < 8; i++) {
    g.beginPath()
    g.moveTo(x, y + (h * i) / 8)
    g.lineTo(x + w, y + (h * i) / 8)
    g.stroke()
  }
  g.strokeStyle = '#6dff9a'
  g.lineWidth = 3
  g.beginPath()
  for (let i = 0; i <= w; i += 2) {
    const py = y + h * 0.5 + Math.sin(i / 14) * h * 0.22 + Math.sin(i / 3.7) * h * 0.03
    if (i === 0) g.moveTo(x + i, py)
    else g.lineTo(x + i, py)
  }
  g.stroke()
  g.strokeStyle = '#ffd04a'
  g.beginPath()
  for (let i = 0; i <= w; i += 2) {
    const py = y + h * 0.3 + (Math.floor(i / 30) % 2 === 0 ? -h * 0.08 : h * 0.08)
    if (i === 0) g.moveTo(x + i, py)
    else g.lineTo(x + i, py)
  }
  g.stroke()
}

export function registerInteriorArt(a: SignAtlas): void {
  a.addCustom('concept_board', 1024, 600, paintConceptBoard)
  a.addCustom('meeting_board', 900, 520, paintMeetingBoard)
  a.addCustom('logo_wall', 768, 384, paintLogoWall)
  for (let k = 0; k < 4; k++) a.addCustom(`screen_${k}`, 320, 200, paintScreen(k))
  a.addCustom('poster_0', 256, 360, paintPoster(0))
  a.addCustom('poster_1', 256, 360, paintPoster(1))
  a.addCustom('books', 512, 96, paintBooks)
  a.addCustom('pegboard', 768, 320, paintPegboard)
  a.addCustom('scope', 256, 160, paintScope)
  a.add({ id: 'lab_door', text: 'LAB  ラボ', w: 512, h: 128, bg: '#14223f', fg: '#ffd56a', border: '#ffd56a', font: 'gothic' })
  a.add({ id: 'cafe_menu', text: 'COFFEE\nTEA  JUICE', w: 256, h: 192, bg: '#2a2622', fg: '#f4ead8', font: 'round' })
  a.add({ id: 'reception', text: 'RECEPTION  受付', w: 512, h: 96, bg: '#f4f2ee', fg: '#16294f', font: 'gothic' })
}

// ------------------------------------------------------------------ IDO パネルの絵（昔の大坂の川沿いの町）

/** IDO のパネルに出す「昔の町」の絵（浮世絵ふうの手描き）。record=true は源兵衛の水門絵図の写し */
export function paintIdoImage(kind: 'karakuri' | 'record' | 'info'): HTMLCanvasElement {
  const W = 720
  const H = 300
  const [c, g] = makeCanvas(W, H)
  const rng = mulberry32(kind === 'record' ? 9 : 4)
  if (kind === 'record') {
    // 和紙に墨の絵図：水門・大歯車・歯止め
    g.fillStyle = '#efe2c4'
    g.fillRect(0, 0, W, H)
    for (let i = 0; i < 2000; i++) {
      g.fillStyle = `rgba(120,90,50,${range(rng, 0.02, 0.06)})`
      g.fillRect(rng() * W, rng() * H, range(rng, 1, 4), range(rng, 1, 2))
    }
    g.strokeStyle = '#2a1a10'
    g.lineWidth = 3
    // 水門の柱と堰板
    g.strokeRect(W * 0.12, H * 0.2, W * 0.08, H * 0.62)
    g.strokeRect(W * 0.42, H * 0.2, W * 0.08, H * 0.62)
    for (let i = 0; i < 5; i++) g.strokeRect(W * 0.2, H * (0.42 + i * 0.08), W * 0.22, H * 0.08)
    // 大歯車
    const gx = W * 0.68
    const gy = H * 0.45
    g.beginPath()
    g.arc(gx, gy, H * 0.22, 0, Math.PI * 2)
    g.stroke()
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      g.beginPath()
      g.moveTo(gx + Math.cos(a) * H * 0.22, gy + Math.sin(a) * H * 0.22)
      g.lineTo(gx + Math.cos(a) * H * 0.27, gy + Math.sin(a) * H * 0.27)
      g.stroke()
    }
    g.beginPath()
    g.arc(gx, gy, H * 0.05, 0, Math.PI * 2)
    g.stroke()
    // 歯止め（爪）
    g.fillStyle = '#a8321e'
    g.beginPath()
    g.moveTo(gx + H * 0.3, gy - H * 0.3)
    g.lineTo(gx + H * 0.2, gy - H * 0.16)
    g.lineTo(gx + H * 0.34, gy - H * 0.2)
    g.fill()
    g.strokeStyle = '#a8321e'
    g.beginPath()
    g.moveTo(gx + H * 0.34, gy - H * 0.2)
    g.lineTo(gx + H * 0.42, gy - H * 0.36)
    g.stroke()
    g.fillStyle = '#2a1a10'
    g.font = `400 ${H * 0.11}px "Yuji Boku","Hiragino Mincho ProN",serif`
    g.textAlign = 'center'
    g.fillText('水門絵図', W * 0.88, H * 0.85)
    g.font = `400 ${H * 0.07}px "Yuji Syuku","Hiragino Mincho ProN",serif`
    g.fillText('歯止め', gx + H * 0.5, gy - H * 0.32)
    // 朱の落款
    g.fillStyle = '#c0301e'
    g.fillRect(W * 0.04, H * 0.78, H * 0.13, H * 0.13)
    g.fillStyle = '#efe2c4'
    g.font = `400 ${H * 0.07}px "Yuji Boku",serif`
    g.fillText('源', W * 0.04 + H * 0.065, H * 0.87)
    return c
  }
  // 空と川
  const sky = g.createLinearGradient(0, 0, 0, H * 0.6)
  sky.addColorStop(0, '#9fc8e8')
  sky.addColorStop(1, '#f2e2c0')
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#e8d6b0'
  g.fillRect(0, H * 0.55, W, H * 0.45)
  g.fillStyle = '#5aa0c8'
  g.beginPath()
  g.moveTo(0, H * 0.72)
  g.quadraticCurveTo(W * 0.5, H * 0.62, W, H * 0.7)
  g.lineTo(W, H)
  g.lineTo(0, H)
  g.fill()
  g.strokeStyle = 'rgba(255,255,255,0.7)'
  g.lineWidth = 2
  for (let i = 0; i < 9; i++) {
    g.beginPath()
    const y = H * (0.76 + (i % 3) * 0.07)
    const x = rng() * W
    g.moveTo(x, y)
    g.quadraticCurveTo(x + 20, y - 6, x + 40, y)
    g.stroke()
  }
  // 遠くの城
  g.fillStyle = 'rgba(255,255,255,0.75)'
  g.fillRect(W * 0.78, H * 0.22, W * 0.08, H * 0.12)
  g.fillStyle = '#3a6a6a'
  g.beginPath()
  g.moveTo(W * 0.76, H * 0.23)
  g.lineTo(W * 0.82, H * 0.13)
  g.lineTo(W * 0.88, H * 0.23)
  g.fill()
  // 町家の並び
  for (let i = 0; i < 9; i++) {
    const x = i * W * 0.11 - 10
    const h = H * range(rng, 0.16, 0.24)
    const base = H * 0.6
    g.fillStyle = '#7a5032'
    g.fillRect(x, base - h, W * 0.1, h)
    g.fillStyle = '#4a4a50'
    g.beginPath()
    g.moveTo(x - 6, base - h)
    g.lineTo(x + W * 0.05, base - h - H * 0.07)
    g.lineTo(x + W * 0.1 + 6, base - h)
    g.fill()
    // 格子と暖簾
    g.fillStyle = '#d8b880'
    for (let k = 0; k < 6; k++) g.fillRect(x + 6 + k * 11, base - h * 0.62, 4, h * 0.5)
    g.fillStyle = i % 2 ? '#2a3a7a' : '#a8321e'
    g.fillRect(x + W * 0.02, base - h * 0.75, W * 0.06, h * 0.25)
    // 提灯
    g.fillStyle = '#ff8a4a'
    g.beginPath()
    g.ellipse(x + W * 0.09, base - h * 0.55, 6, 8, 0, 0, Math.PI * 2)
    g.fill()
  }
  // 太鼓橋
  g.strokeStyle = '#c0301e'
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(W * 0.28, H * 0.74)
  g.quadraticCurveTo(W * 0.42, H * 0.56, W * 0.56, H * 0.72)
  g.stroke()
  g.lineWidth = 2
  for (let k = 0; k < 6; k++) {
    const t = k / 5
    const bx = W * (0.3 + t * 0.24)
    const by = H * (0.73 - Math.sin(Math.PI * t) * 0.12)
    g.beginPath()
    g.moveTo(bx, by)
    g.lineTo(bx, by - H * 0.05)
    g.stroke()
  }
  // 小舟と、からくり人形（茶運び）
  g.fillStyle = '#6a4a2a'
  g.beginPath()
  g.moveTo(W * 0.62, H * 0.84)
  g.quadraticCurveTo(W * 0.7, H * 0.9, W * 0.8, H * 0.83)
  g.lineTo(W * 0.62, H * 0.84)
  g.fill()
  if (kind === 'karakuri') {
    g.fillStyle = '#c0301e'
    g.fillRect(W * 0.14, H * 0.66, 14, 18)
    g.fillStyle = '#f2d2b0'
    g.beginPath()
    g.arc(W * 0.14 + 7, H * 0.64, 7, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#2a1a10'
    g.fillRect(W * 0.14 - 2, H * 0.62 - 6, 18, 5)
    g.fillStyle = '#ffffff'
    g.fillRect(W * 0.14 + 12, H * 0.67, 10, 6)
  }
  // 紙の質感と枠
  g.fillStyle = 'rgba(240,220,180,0.18)'
  for (let i = 0; i < 1400; i++) g.fillRect(rng() * W, rng() * H, 2, 1)
  g.strokeStyle = 'rgba(60,40,20,0.6)'
  g.lineWidth = 6
  g.strokeRect(3, 3, W - 6, H - 6)
  return c
}
