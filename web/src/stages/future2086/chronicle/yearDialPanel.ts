// 年代ダイヤルの画面（DOM。ui/ は触らずにここで作る）。見た目は yearDialPanel.css。
// 画面いっぱいの手前の層（うしろのゲームには、指もマウスもとどかない）：
// ・左に大きな丸いダイヤル：年の目もり（昔が左・今が右）と、2026・1726・1186・2086 の印（行ける年だけ光る）、針、まん中に今の年と石
// ・右に「年代ダイヤル」・ひとこと・操作の案内・ぴったり合ったときだけ出る大きな「この年へ行く」ボタン。右上に「もどる」
// ・指・マウス：ダイヤルをなぞって回す／光る印をタップでそこへ。キー（← →・F・Esc）はステージが読む（Esc と Enter だけここで）
// 遊びのロジック（YearDialLogic）はステージが動かし、毎フレーム setState(...) と update(dt) を呼ぶ。入力は takeInput() で受け取る。
import './yearDialPanel.css'
import { DIAL_ANCHORS, angleToYear, yearToAngle } from './yearDialLogic'
import { DialSound } from './yearDialSound'

/** ダイヤルの印（open：今そこへ行ける＝光る） */
export type DialMark = { year: number; sub: string; open: boolean }

export type DialOpen = {
  year: number
  /** 右上の小さな文字（例「NEXTMAKE 前のかんばん」） */
  sub: string
  marks: readonly DialMark[]
  touch: boolean
}

export type DialInput = {
  /** 指・マウスでなぞっている年（なぞっていなければ null） */
  drag: number | null
  /** 光る印をタップした年（1 回だけ） */
  tap: number | null
  /** 「この年へ行く」（ボタン・Enter） */
  go: boolean
  /** 「もどる」（ボタン・Esc） */
  back: boolean
}

const SVG_NS = 'http://www.w3.org/2000/svg'
/** 目もりの輪の半径（viewBox は -100..100） */
const R_TICK = 80
/** 目もりの間かく（°） */
const TICK_DEG = 4

const pol = (deg: number, r: number) => {
  const a = (deg * Math.PI) / 180
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r }
}

function arcPath(a0: number, a1: number, r: number): string {
  const p0 = pol(a0, r)
  const p1 = pol(a1, r)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  return `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`
}

export class YearDialPanel {
  private readonly el: HTMLDivElement
  private readonly host: HTMLElement
  private readonly svg: SVGSVGElement
  private readonly needle: SVGGElement
  private readonly yearText: SVGTextElement
  private readonly hub: SVGGElement
  private readonly marksG: SVGGElement
  private readonly ticks: SVGLineElement[] = []
  private readonly tickDeg: number[] = []
  private readonly msg: HTMLDivElement
  private readonly keys: HTMLDivElement
  private readonly sub: HTMLElement
  private readonly goBtn: HTMLButtonElement
  private readonly backBtn: HTMLButtonElement
  private readonly pitta: HTMLDivElement
  readonly sound = new DialSound()
  private shown = false
  private touch = false
  private marks: DialMark[] = []
  private target = 2026
  private angle = 0
  private shownAngle = 0
  private locked = false
  private near = 0
  private nearDrawn = -1
  private nudgeT = 0
  private dragId: number | null = null
  private input: DialInput = { drag: null, tap: null, go: false, back: false }
  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.shown || this.el.classList.contains('frozen')) return
    this.sound.wake()
    if (e.code === 'Escape') {
      // 一時停止より先に「もどる」（ダイヤルの間だけ）
      e.preventDefault()
      e.stopPropagation()
      this.input.back = true
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault()
      this.input.go = true
    }
  }

  constructor(host: HTMLElement) {
    this.host = host
    this.el = document.createElement('div')
    this.el.className = 'ydial'
    this.el.innerHTML = `
      <button class="yd-back" type="button"><span>もどる</span><kbd>Esc</kbd></button>
      <div class="yd-wrap">
        <div class="yd-dial"><div class="yd-pitta">ぴったり！</div></div>
        <div class="yd-side">
          <div class="yd-title">年代ダイヤル<small></small></div>
          <div class="yd-msg"></div>
          <div class="yd-keys"></div>
          <button class="yd-go" type="button"><span>この年へ行く</span><kbd>F</kbd></button>
        </div>
      </div>`
    host.appendChild(this.el)
    this.msg = this.el.querySelector('.yd-msg') as HTMLDivElement
    this.keys = this.el.querySelector('.yd-keys') as HTMLDivElement
    this.sub = this.el.querySelector('.yd-title small') as HTMLElement
    this.goBtn = this.el.querySelector('.yd-go') as HTMLButtonElement
    this.backBtn = this.el.querySelector('.yd-back') as HTMLButtonElement
    this.pitta = this.el.querySelector('.yd-pitta') as HTMLDivElement
    // ---- ダイヤル（SVG）
    const svg = document.createElementNS(SVG_NS, 'svg')
    svg.setAttribute('viewBox', '-100 -100 200 200')
    svg.innerHTML = `
      <defs>
        <radialGradient id="yd-face" cx="50%" cy="42%" r="60%"><stop offset="0" stop-color="#1d3d86"/><stop offset="0.75" stop-color="#0b1a46"/><stop offset="1" stop-color="#071131"/></radialGradient>
        <radialGradient id="yd-stone" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="#dffbff"/><stop offset="0.35" stop-color="#5fd8ff"/><stop offset="1" stop-color="#1557b8"/></radialGradient>
        <linearGradient id="yd-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6f8fb"/><stop offset="1" stop-color="#b9c6d8"/></linearGradient>
      </defs>
      <circle class="yd-rim" r="98" fill="url(#yd-rim)"/>
      <circle class="yd-face" r="91" fill="url(#yd-face)"/>
      <path class="yd-track" d="${arcPath(DIAL_ANCHORS[0][1], DIAL_ANCHORS[DIAL_ANCHORS.length - 1][1], R_TICK)}"/>
      <g class="yd-ticks"></g>
      <g class="yd-marks"></g>
      <g class="yd-needle"><path d="M -3.2 -30 L 0 -${R_TICK + 9} L 3.2 -30 Z"/><circle cy="-${R_TICK + 3}" r="4.2"/></g>
      <g class="yd-hub"><circle class="yd-hub-glow" r="34"/><circle class="yd-hub-ring" r="30"/><circle class="yd-stone" r="9" cy="-12" fill="url(#yd-stone)"/></g>
      <text class="yd-year" y="14">2086</text><text class="yd-nen" y="25">年</text>`
    this.svg = svg
    ;(this.el.querySelector('.yd-dial') as HTMLDivElement).prepend(svg)
    this.needle = svg.querySelector('.yd-needle') as SVGGElement
    this.yearText = svg.querySelector('.yd-year') as SVGTextElement
    this.hub = svg.querySelector('.yd-hub') as SVGGElement
    this.marksG = svg.querySelector('.yd-marks') as SVGGElement
    const ticksG = svg.querySelector('.yd-ticks') as SVGGElement
    const a0 = DIAL_ANCHORS[0][1]
    const a1 = DIAL_ANCHORS[DIAL_ANCHORS.length - 1][1]
    for (let a = a0; a <= a1 + 0.01; a += TICK_DEG) {
      const p = pol(a, R_TICK - 1)
      const q = pol(a, R_TICK + 6)
      const l = document.createElementNS(SVG_NS, 'line')
      l.setAttribute('x1', p.x.toFixed(2))
      l.setAttribute('y1', p.y.toFixed(2))
      l.setAttribute('x2', q.x.toFixed(2))
      l.setAttribute('y2', q.y.toFixed(2))
      ticksG.appendChild(l)
      this.ticks.push(l)
      this.tickDeg.push(a)
    }
    // ---- 入力（指・マウス）
    svg.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.sound.wake()
      const mark = (e.target as Element).closest('.yd-mark.open') as SVGGElement | null
      if (mark) {
        this.input.tap = Number(mark.dataset.year)
        return
      }
      this.dragId = e.pointerId
      try {
        svg.setPointerCapture(e.pointerId)
      } catch {
        // 取れなくてもよい
      }
      this.input.drag = this.yearAt(e)
    })
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.dragId) return
      e.preventDefault()
      this.input.drag = this.yearAt(e)
    })
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.dragId) return
      this.dragId = null
      this.input.drag = null
    }
    svg.addEventListener('pointerup', end)
    svg.addEventListener('pointercancel', end)
    svg.addEventListener('lostpointercapture', end)
    const press = (btn: HTMLButtonElement, fn: () => void) =>
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.sound.wake()
        fn()
      })
    press(this.goBtn, () => (this.input.go = true))
    press(this.backBtn, () => (this.input.back = true))
    // うしろのゲーム（スティック・カメラ）へ指を通さない
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.sound.wake()
    })
    this.el.addEventListener('contextmenu', (e) => e.preventDefault())
    document.addEventListener('keydown', this.onKey, true)
  }

  get open(): boolean {
    return this.shown
  }

  show(o: DialOpen): void {
    this.shown = true
    this.touch = o.touch
    this.marks = o.marks.map((m) => ({ ...m }))
    this.target = this.marks.find((m) => m.open)?.year ?? 2026
    this.sub.textContent = o.sub
    this.keys.textContent = o.touch ? 'ダイヤルをなぞって回す　光る年をタップ' : '← → で回す（クリックでもえらべる）'
    this.el.classList.toggle('touch', o.touch)
    this.buildMarks()
    this.input = { drag: null, tap: null, go: false, back: false }
    this.dragId = null
    this.locked = false
    this.nearDrawn = -1
    this.nudgeT = 0
    this.angle = this.shownAngle = yearToAngle(o.year)
    this.setState({ year: o.year, locked: false, near: 0 })
    this.el.classList.remove('lock', 'going', 'frozen')
    this.el.classList.add('on')
    this.host.classList.add('ydial-open')
    // マウスを画面にもどす（ボタンを押せるように）
    if (document.pointerLockElement) document.exitPointerLock?.()
    this.sound.wake()
  }

  /** 決めた：ボタンが光ってから閉じる（sec 秒） */
  async leave(go: boolean, sec = 0.45): Promise<void> {
    if (go) {
      this.el.classList.add('going')
      this.sound.go()
      await new Promise((r) => setTimeout(r, sec * 1000))
    }
    this.hide()
  }

  hide(): void {
    this.shown = false
    this.dragId = null
    this.el.classList.remove('on', 'lock', 'going', 'frozen')
    this.host.classList.remove('ydial-open')
  }

  /** 一時停止・メニューの間は隠す（その画面を前に出す） */
  setFrozen(on: boolean): void {
    if (!this.shown) return
    this.el.classList.toggle('frozen', on)
    this.host.classList.toggle('ydial-open', !on)
  }

  /** 入力を受け取る（tap・go・back は 1 回で消える） */
  takeInput(): DialInput {
    const i = this.input
    this.input = { drag: i.drag, tap: null, go: false, back: false }
    return i
  }

  /** いまの年・ぴったりか・目当ての年への近さ（0..1） */
  setState(s: { year: number; locked: boolean; near: number }): void {
    this.angle = yearToAngle(s.year)
    this.yearText.textContent = String(Math.round(s.year))
    if (s.locked !== this.locked) {
      this.locked = s.locked
      this.el.classList.toggle('lock', s.locked)
      if (s.locked) {
        this.sound.lock()
        // ぴったり！（ぽんと出て、少しして消える）
        this.pitta.animate?.(
          [
            { opacity: 0, transform: 'translate(-50%, -50%) scale(0.4)' },
            { opacity: 1, transform: 'translate(-50%, -50%) scale(1.15)', offset: 0.25 },
            { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.7 },
            { opacity: 0, transform: 'translate(-50%, -50%) scale(1)' },
          ],
          { duration: 1400, easing: 'ease-out' },
        )
      }
    }
    this.near = s.near
  }

  /** まだ合っていないのに決めようとした */
  nudge(): void {
    this.nudgeT = 1.6
    this.sound.buzz()
    this.msg.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }], { duration: 320 })
  }

  /** 目もりを 1 つ以上こえた（カチ） */
  click(): void {
    this.sound.click()
  }

  update(dt: number): void {
    if (!this.shown) return
    // 針はすっと追いかける（タップで飛んだときも回って見える）
    this.shownAngle += (this.angle - this.shownAngle) * Math.min(1, dt * 18)
    this.needle.setAttribute('transform', `rotate(${this.shownAngle.toFixed(2)})`)
    // 石の音（コチ、コチ）と、まん中の石の脈
    if (this.sound.tick(dt, this.near, this.locked)) {
      const s = 1.08 + this.near * 0.1
      this.hub.animate?.([{ transform: `scale(${s.toFixed(3)})` }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' })
    }
    this.svg.style.setProperty('--near', this.near.toFixed(3))
    // 目当ての年のまわりの目もりが、近づくほど光る
    if (Math.abs(this.near - this.nearDrawn) > 0.015) {
      this.nearDrawn = this.near
      const ta = yearToAngle(this.target)
      for (let i = 0; i < this.ticks.length; i++) {
        const d = Math.abs(this.tickDeg[i] - ta)
        const g = Math.max(0, 1 - d / 26) * this.near
        this.ticks[i].style.opacity = (0.45 + g * 0.55).toFixed(2)
        this.ticks[i].style.stroke = g > 0.05 ? `rgba(255, ${Math.round(236 - g * 30)}, ${Math.round(160 - g * 90)}, 1)` : ''
      }
    }
    // ひとこと
    this.nudgeT = Math.max(0, this.nudgeT - dt)
    const text = this.locked
      ? this.touch
        ? 'ぴったり！　ボタンをタップ'
        : 'ぴったり！　F で出発'
      : this.nudgeT > 0
        ? 'まだ、ぴったりじゃないよ'
        : this.near > 0.55
          ? '石の音が、速くなってきた！'
          : '光る年に、ダイヤルを合わせよう'
    if (this.msg.textContent !== text) this.msg.textContent = text
  }

  dispose(): void {
    document.removeEventListener('keydown', this.onKey, true)
    this.host.classList.remove('ydial-open')
    this.sound.dispose()
    this.el.remove()
  }

  // ---- 中

  private buildMarks(): void {
    const g = this.marksG
    while (g.firstChild) g.removeChild(g.firstChild)
    for (const m of this.marks) {
      const a = yearToAngle(m.year)
      const grp = document.createElementNS(SVG_NS, 'g')
      grp.setAttribute('class', `yd-mark ${m.open ? 'open' : 'dim'}${m.year === 2086 ? ' now' : ''}`)
      grp.dataset.year = String(m.year)
      const p = pol(a, R_TICK + 2)
      // 押しやすい広さ（見えない丸）
      const hit = document.createElementNS(SVG_NS, 'circle')
      hit.setAttribute('class', 'yd-hit')
      hit.setAttribute('cx', p.x.toFixed(2))
      hit.setAttribute('cy', p.y.toFixed(2))
      hit.setAttribute('r', '17')
      grp.appendChild(hit)
      const gem = document.createElementNS(SVG_NS, 'circle')
      gem.setAttribute('class', 'yd-gem')
      gem.setAttribute('cx', p.x.toFixed(2))
      gem.setAttribute('cy', p.y.toFixed(2))
      gem.setAttribute('r', m.open ? '7.5' : '5')
      grp.appendChild(gem)
      // 年の字（ダイヤルの内側。字は立てたまま）
      const lp = pol(a, 55)
      const t = document.createElementNS(SVG_NS, 'text')
      t.setAttribute('class', 'yd-label')
      t.setAttribute('x', lp.x.toFixed(2))
      t.setAttribute('y', (lp.y + 1).toFixed(2))
      t.textContent = m.year === 2086 ? 'いま' : `${m.year}`
      grp.appendChild(t)
      const s = document.createElementNS(SVG_NS, 'text')
      s.setAttribute('class', 'yd-label-sub')
      s.setAttribute('x', lp.x.toFixed(2))
      s.setAttribute('y', (lp.y + 10).toFixed(2))
      s.textContent = m.sub
      grp.appendChild(s)
      g.appendChild(grp)
    }
  }

  /** 指の位置の年（ダイヤルのまん中からの角度。下のすき間は、近いほうのはしへ） */
  private yearAt(e: PointerEvent): number {
    const r = this.svg.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    const a0 = DIAL_ANCHORS[0][1]
    const a1 = DIAL_ANCHORS[DIAL_ANCHORS.length - 1][1]
    if (deg < a0 || deg > a1) deg = deg < 0 ? a0 : a1
    return angleToYear(deg)
  }
}
