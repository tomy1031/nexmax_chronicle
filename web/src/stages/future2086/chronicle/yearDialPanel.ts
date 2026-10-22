// 年代ダイヤルの画面（DOM。ui/ は触らずにここで作る）。見た目は yearDialPanel.css。
// 年の数字・左右の矢印・波形 2 本（石の音＝青、記録の音＝金）・そろい具合のメーター・「← → で回す　F で決める」。
// 入力は持たない：ステージが YearDialLogic を動かして、setYear・setMatch・setDetune・press を呼ぶ。毎フレーム update(dt)。
import './yearDialPanel.css'

export class YearDialPanel {
  private readonly el: HTMLDivElement
  private readonly num: HTMLDivElement
  private readonly left: HTMLDivElement
  private readonly right: HTMLDivElement
  private readonly meter: HTMLElement
  private readonly hint: HTMLDivElement
  private readonly sub: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private t = 0
  private match = 0
  private detune = 1
  private shown = false

  constructor(host: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'ydial'
    this.el.innerHTML = `
      <div class="yd-title"><span>年代ダイヤル</span><small></small></div>
      <div class="yd-year"><div class="yd-arrow">◀</div><div class="yd-num">2086年</div><div class="yd-arrow">▶</div></div>
      <canvas width="1040" height="192"></canvas>
      <div class="yd-legend"><span><i style="background:#5fd8ff"></i>石の音</span><span><i style="background:#ffd36a"></i>記録の音</span></div>
      <div class="yd-meter"><b></b></div>
      <div class="yd-hint">← → で回す　　F で決める</div>`
    host.appendChild(this.el)
    this.num = this.el.querySelector('.yd-num') as HTMLDivElement
    const arrows = this.el.querySelectorAll('.yd-arrow')
    this.left = arrows[0] as HTMLDivElement
    this.right = arrows[1] as HTMLDivElement
    this.meter = this.el.querySelector('.yd-meter b') as HTMLElement
    this.hint = this.el.querySelector('.yd-hint') as HTMLDivElement
    this.sub = this.el.querySelector('.yd-title small') as HTMLElement
    this.canvas = this.el.querySelector('canvas') as HTMLCanvasElement
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D
  }

  get open(): boolean {
    return this.shown
  }

  /** 開く（sub：右上の小さな文字。例「NEXTMAKE 前のかんばん」） */
  show(o: { year: number; sub?: string; hint?: string } = { year: 2086 }): void {
    this.shown = true
    this.el.classList.add('on')
    this.sub.textContent = o.sub ?? ''
    if (o.hint) this.hint.textContent = o.hint
    this.setYear(o.year)
  }

  hide(): void {
    this.shown = false
    this.el.classList.remove('on', 'lock')
  }

  setYear(y: number): void {
    this.num.textContent = `${Math.round(y)}年`
  }

  /** そろい具合 0..1（1 でぴったり：枠が金色になり「F で決める」が光る） */
  setMatch(k: number): void {
    this.match = Math.max(0, Math.min(1, k))
    this.meter.style.width = `${Math.round(this.match * 100)}%`
    this.el.classList.toggle('lock', this.match > 0.97)
  }

  /** 記録の波のずれ（-1..1） */
  setDetune(d: number): void {
    this.detune = Math.max(-1, Math.min(1, d))
  }

  /** 矢印の押した見た目（-1 左・0 なし・+1 右） */
  press(dir: -1 | 0 | 1): void {
    this.left.classList.toggle('press', dir < 0)
    this.right.classList.toggle('press', dir > 0)
  }

  setHint(text: string): void {
    this.hint.textContent = text
  }

  update(dt: number): void {
    if (!this.shown) return
    this.t += dt
    const { g, canvas } = this
    const W = canvas.width
    const H = canvas.height
    g.clearRect(0, 0, W, H)
    // 目もりの線
    g.strokeStyle = 'rgba(143, 230, 255, 0.12)'
    g.lineWidth = 2
    for (let x = 0; x <= W; x += W / 12) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, H)
      g.stroke()
    }
    g.beginPath()
    g.moveTo(0, H / 2)
    g.lineTo(W, H / 2)
    g.stroke()
    // 石の音：コチ、コチ（いつも同じ速さ）。記録の音：ずれているほど速さ・位相が違う
    const wave = (freq: number, phase: number, amp: number, color: string, width: number) => {
      g.strokeStyle = color
      g.lineWidth = width
      g.shadowColor = color
      g.shadowBlur = 14
      g.beginPath()
      for (let i = 0; i <= 200; i++) {
        const x = (i / 200) * W
        const u = i / 200
        const tick = Math.pow(Math.abs(Math.sin(u * Math.PI * freq + phase)), 6)
        const y = H / 2 - (Math.sin(u * Math.PI * 2 * freq + phase) * 0.55 + tick * 0.45) * amp * (H * 0.4)
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.stroke()
      g.shadowBlur = 0
    }
    const t = this.t
    const stoneF = 3
    const recF = stoneF * (1 + this.detune * 0.9)
    const recPhase = (1 - this.match) * 2.2 + this.detune * t * 2.5
    wave(recF, t * 3 + recPhase, 0.85, '#ffd36a', 5)
    wave(stoneF, t * 3, 0.85 + this.match * 0.15, '#5fd8ff', 6)
    if (this.match > 0.97) {
      g.fillStyle = `rgba(255, 230, 150, ${0.12 + 0.08 * Math.sin(t * 8)})`
      g.fillRect(0, 0, W, H)
    }
  }

  dispose(): void {
    this.el.remove()
  }
}
