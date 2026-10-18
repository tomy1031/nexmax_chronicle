// 導入編の画面の重ね物（DOM）：1-0 の回想・4章③の白いかすみ・4章の試みの一覧。見た目は introOverlay2086.css。
// 回想の絵は public/textures/story/flashback_2071.webp（リードが用意。読めるまで・無いときはキャンバスで描いた仮の絵）。
import './introOverlay2086.css'
import { mulberry32 } from '../../render/noise'
import type { AttemptItem } from './intro2086Story'

export const FLASHBACK_IMAGE = './textures/story/flashback_2071.webp'

/** 回想の時間（秒） */
export const FLASHBACK_TIMING = { fadeIn: 0.9, place: 1.6, quote: 3.4, white: 9.4, whiteDur: 1.3, out: 10.9, outDur: 1.3 } as const

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** 仮の絵：薄暗い地下の回収施設。古いロボットの山の中で、8歳のソラが小さな青いロボットを見つける */
function paintFlashback(c: HTMLCanvasElement): void {
  const W = (c.width = 1280)
  const H = (c.height = 720)
  const g = c.getContext('2d') as CanvasRenderingContext2D
  const rng = mulberry32(2071)
  const bg = g.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#0b1622')
  bg.addColorStop(0.6, '#13222e')
  bg.addColorStop(1, '#070c12')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // 天井の格子と、上から差す光
  g.strokeStyle = 'rgba(120,150,170,0.12)'
  g.lineWidth = 3
  for (let x = 0; x < W; x += 90) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x + 60, H * 0.28)
    g.stroke()
  }
  const shaft = g.createLinearGradient(W * 0.55, 0, W * 0.5, H)
  shaft.addColorStop(0, 'rgba(190,220,255,0.35)')
  shaft.addColorStop(1, 'rgba(190,220,255,0)')
  g.fillStyle = shaft
  g.beginPath()
  g.moveTo(W * 0.5, 0)
  g.lineTo(W * 0.64, 0)
  g.lineTo(W * 0.74, H)
  g.lineTo(W * 0.3, H)
  g.fill()
  // 古いロボットの山（影絵）
  const junk = (cx: number, base: number, spread: number, n: number, tone: number) => {
    for (let i = 0; i < n; i++) {
      const x = cx + (rng() - 0.5) * spread
      const y = base - rng() * rng() * H * 0.35
      const s = 20 + rng() * 60
      const k = Math.round(tone + rng() * 18)
      g.fillStyle = `rgb(${k},${k + 8},${k + 14})`
      if (rng() < 0.4) {
        g.beginPath()
        g.arc(x, y, s * 0.5, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = 'rgba(0,0,0,0.5)'
        g.beginPath()
        g.arc(x - s * 0.15, y - s * 0.05, s * 0.08, 0, Math.PI * 2)
        g.arc(x + s * 0.15, y - s * 0.05, s * 0.08, 0, Math.PI * 2)
        g.fill()
      } else {
        g.save()
        g.translate(x, y)
        g.rotate((rng() - 0.5) * 1.2)
        g.fillRect(-s * 0.5, -s * 0.3, s, s * 0.6)
        g.fillRect(s * 0.4, -s * 0.06, s * 0.6, s * 0.12)
        g.restore()
      }
    }
  }
  junk(W * 0.2, H * 0.98, W * 0.5, 160, 22)
  junk(W * 0.85, H * 0.98, W * 0.4, 120, 18)
  junk(W * 0.5, H * 1.02, W * 1.1, 120, 30)
  // 小さな青いロボット（主人公）：丸い頭と、ぼんやり光る目
  const rx = W * 0.4
  const ry = H * 0.66
  g.fillStyle = '#3d78b8'
  g.beginPath()
  g.arc(rx, ry, 46, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#2a5a94'
  g.beginPath()
  g.ellipse(rx, ry + 70, 34, 30, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#d8f0ff'
  g.beginPath()
  g.ellipse(rx - 16, ry - 2, 11, 14, 0, 0, Math.PI * 2)
  g.ellipse(rx + 16, ry - 2, 11, 14, 0, 0, Math.PI * 2)
  g.fill()
  const eye = g.createRadialGradient(rx, ry, 0, rx, ry, 120)
  eye.addColorStop(0, 'rgba(130,220,255,0.45)')
  eye.addColorStop(1, 'rgba(130,220,255,0)')
  g.fillStyle = eye
  g.fillRect(rx - 120, ry - 120, 240, 240)
  // 8歳のソラ（しゃがんで手をのばす。手もとの小さなライト）
  const sx = W * 0.6
  const sy = H * 0.7
  g.fillStyle = '#1c2430'
  g.beginPath()
  g.arc(sx, sy - 120, 34, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.ellipse(sx - 4, sy - 132, 40, 26, -0.1, Math.PI, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(sx - 40, sy - 86)
  g.lineTo(sx + 36, sy - 86)
  g.lineTo(sx + 50, sy + 10)
  g.lineTo(sx - 60, sy + 10)
  g.fill()
  g.lineWidth = 16
  g.lineCap = 'round'
  g.strokeStyle = '#1c2430'
  g.beginPath()
  g.moveTo(sx - 30, sy - 70)
  g.lineTo(sx - 110, sy - 40)
  g.stroke()
  const lamp = g.createRadialGradient(sx - 118, sy - 38, 0, sx - 118, sy - 38, 160)
  lamp.addColorStop(0, 'rgba(255,236,190,0.75)')
  lamp.addColorStop(1, 'rgba(255,236,190,0)')
  g.fillStyle = lamp
  g.fillRect(sx - 280, sy - 200, 320, 320)
  // ほこり
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(220,235,255,${0.08 + rng() * 0.25})`
    g.beginPath()
    g.arc(W * 0.3 + rng() * W * 0.45, rng() * H, 0.8 + rng() * 2, 0, Math.PI * 2)
    g.fill()
  }
}

export class Flashback {
  private readonly el: HTMLDivElement
  private readonly photo: HTMLDivElement
  private readonly place: HTMLDivElement
  private readonly quote: HTMLDivElement
  private readonly white: HTMLDivElement
  private t = 0
  private done = false
  onDone: (() => void) | null = null

  constructor(speaker: string, line: string) {
    const touch = document.documentElement.classList.contains('touch-ui')
    const el = document.createElement('div')
    el.className = 'intro-flashback'
    el.innerHTML =
      '<div class="ifb-photo"><canvas></canvas><img alt=""></div><div class="ifb-tint"></div><div class="ifb-tone"></div><div class="ifb-grain"></div>' +
      '<div class="ifb-place"><b>15年前</b>旧なんば地下・ロボット回収施設</div>' +
      `<div class="ifb-quote"><span class="who">${escapeHtml(speaker)}</span><span class="line">「${escapeHtml(line)}」</span></div>` +
      `<div class="ifb-white"></div><div class="ifb-skip">${touch ? 'タップでスキップ' : 'F：スキップ'}</div>`
    // タッチ：画面をタップで飛ばす
    if (touch) {
      el.style.pointerEvents = 'auto'
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        this.skip()
      })
    }
    document.body.appendChild(el)
    this.el = el
    this.photo = el.querySelector('.ifb-photo') as HTMLDivElement
    this.place = el.querySelector('.ifb-place') as HTMLDivElement
    this.quote = el.querySelector('.ifb-quote') as HTMLDivElement
    this.white = el.querySelector('.ifb-white') as HTMLDivElement
    paintFlashback(el.querySelector('canvas') as HTMLCanvasElement)
    const img = el.querySelector('img') as HTMLImageElement
    img.onload = () => img.classList.add('on')
    img.onerror = () => img.remove()
    img.src = FLASHBACK_IMAGE
  }

  get playing(): boolean {
    return !this.done
  }

  /** 白へ飛ばす */
  skip(): void {
    if (this.t < FLASHBACK_TIMING.white) this.t = FLASHBACK_TIMING.white
  }

  update(dt: number): void {
    if (this.done) return
    this.t += dt
    const T = FLASHBACK_TIMING
    const t = this.t
    const k = Math.min(1, t / T.white)
    // ゆっくり寄る（Ken Burns）
    this.photo.style.transform = `scale(${(1.14 - k * 0.12).toFixed(4)}) translate(${(-k * 1.6).toFixed(3)}%, ${(k * 0.8).toFixed(3)}%)`
    this.photo.style.opacity = String(Math.min(1, t / T.fadeIn))
    this.place.classList.toggle('on', t > T.place && t < T.white)
    this.quote.classList.toggle('on', t > T.quote && t < T.white + 0.4)
    this.white.style.opacity = String(Math.min(1, Math.max(0, (t - T.white) / T.whiteDur)))
    this.el.style.opacity = String(1 - Math.min(1, Math.max(0, (t - T.out) / T.outDur)))
    if (t >= T.out + T.outDur) {
      this.done = true
      this.el.remove()
      this.onDone?.()
    }
  }

  dispose(): void {
    this.done = true
    this.el.remove()
  }
}

/** 白くかすむ：かすみ切ったら onWhite、晴れたら onDone */
export class Whiteout {
  private readonly el: HTMLDivElement
  private t = -1
  private fired = false
  private onWhite: (() => void) | null = null
  private onDone: (() => void) | null = null

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'intro-whiteout'
    document.body.appendChild(this.el)
  }

  play(onWhite: () => void, onDone: () => void): void {
    this.t = 0
    this.fired = false
    this.onWhite = onWhite
    this.onDone = onDone
  }

  get playing(): boolean {
    return this.t >= 0
  }

  update(dt: number): void {
    if (this.t < 0) return
    this.t += dt
    const t = this.t
    const op = t < 2.2 ? (t / 2.2) ** 1.5 : t < 3.0 ? 1 : Math.max(0, 1 - (t - 3.0) / 1.6)
    this.el.style.opacity = op.toFixed(3)
    if (t >= 2.4 && !this.fired) {
      this.fired = true
      this.onWhite?.()
    }
    if (t >= 4.6) {
      this.t = -1
      this.el.style.opacity = '0'
      const d = this.onDone
      this.onDone = null
      d?.()
    }
  }

  dispose(): void {
    this.el.remove()
  }
}

/** 試みの一覧（右上） */
export class AttemptsPanel {
  private readonly el: HTMLDivElement
  private key = ''

  constructor(host: HTMLElement | null) {
    this.el = document.createElement('div')
    this.el.className = 'intro-attempts'
    ;(host ?? document.body).appendChild(this.el)
  }

  set(items: readonly AttemptItem[] | null): void {
    const key = items ? items.map((i) => `${i.id}${i.done ? 1 : 0}${i.active ? 1 : 0}`).join('|') : ''
    if (key === this.key) return
    this.key = key
    this.el.classList.toggle('on', !!items)
    if (!items) return
    this.el.innerHTML =
      '<div class="ia-title">試せること（順番は自由）</div>' +
      items.map((i) => `<div class="ia-item${i.done ? ' done' : ''}${i.active ? ' active' : ''}"><span class="ia-box">${i.done ? '✓' : ''}</span><span class="ia-label">${escapeHtml(i.label)}</span></div>`).join('')
  }

  /** 演出中は隠す（一覧の中身はそのまま） */
  setHidden(hidden: boolean): void {
    this.el.style.visibility = hidden ? 'hidden' : ''
  }

  dispose(): void {
    this.el.remove()
  }
}
