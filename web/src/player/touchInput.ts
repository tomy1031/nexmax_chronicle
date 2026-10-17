// スマホのタッチ操作の層：画面の左側をなぞるとスティック（移動・大きく倒すとダッシュ）、右側をなぞるとカメラ。
// 右下に「つかむ」「ジャンプ」と、使えるときだけ「話す」「切替」、右上に「装備・記録」「一時停止」。
// 押した内容は input.ts と同じ状態（down/pressed/analog/mouseDX）へ 'touch:…' の control として書き込むだけで、
// ゲーム処理は inputActions.ts の TOUCH_BINDINGS を通したアクションしか見ない。
import type { InputState } from './input'
import { CAMERA_TUNING } from './cameraRig'
import { TOUCH_TUNING, stickVector, touchHintView, type TouchButtonId, type TouchHintContext } from './touchLogic'
import { CLAW_SVG, type Hint } from '../ui/hud'

const BUTTONS: Array<{ id: TouchButtonId; control: string }> = [
  { id: 'claw', control: 'touch:claw' },
  { id: 'jump', control: 'touch:jump' },
  { id: 'interact', control: 'touch:interact' },
  { id: 'lock', control: 'touch:lock' },
]

/** 指が要素の外へそれても up を受け取れるようにする（対応していない環境では何もしない） */
const capture = (el: HTMLElement, id: number) => {
  try {
    el.setPointerCapture(id)
  } catch {
    // 取れなくても押した・離したは受け取れる
  }
}

const MENU_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>`
const PAUSE_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6v12M15 6v12" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`

export class TouchControls {
  readonly root: HTMLDivElement
  private readonly input: InputState
  private readonly surface: HTMLDivElement
  private readonly stickBase: HTMLDivElement
  private readonly stickKnob: HTMLDivElement
  private readonly buttons = {} as Record<TouchButtonId, HTMLButtonElement>
  private readonly labels = {} as Record<TouchButtonId, HTMLSpanElement>
  private readonly releasers: Array<() => void> = []
  private stick: { id: number; x: number; y: number } | null = null
  private lookPtr: { id: number; x: number; y: number } | null = null
  private playing = true
  private viewKey = ''

  constructor(ui: HTMLElement, input: InputState) {
    this.input = input
    this.root = document.createElement('div')
    this.root.className = 'touch-layer'
    this.root.innerHTML = `
      <div class="touch-surface"></div>
      <div class="touch-stick"><div class="touch-knob"></div></div>
      <div class="touch-actions">
        <button class="tbtn tbtn-claw" type="button"><span class="tbtn-icon">${CLAW_SVG}</span><span class="tbtn-label"></span></button>
        <button class="tbtn tbtn-jump" type="button"><span class="tbtn-label"></span></button>
        <button class="tbtn tbtn-interact" type="button" hidden><span class="tbtn-label"></span></button>
        <button class="tbtn tbtn-lock" type="button" hidden><span class="tbtn-label"></span></button>
      </div>
      <div class="touch-sys">
        <button class="tbtn tbtn-sys tbtn-menu" type="button" aria-label="装備・記録">${MENU_SVG}</button>
        <button class="tbtn tbtn-sys tbtn-pause" type="button" aria-label="一時停止">${PAUSE_SVG}</button>
      </div>`
    ui.appendChild(this.root)
    this.surface = this.root.querySelector('.touch-surface') as HTMLDivElement
    this.stickBase = this.root.querySelector('.touch-stick') as HTMLDivElement
    this.stickKnob = this.root.querySelector('.touch-knob') as HTMLDivElement
    this.stickBase.style.setProperty('--stick', `${TOUCH_TUNING.stickRadius * 2}px`)
    for (const b of BUTTONS) {
      const el = this.root.querySelector(`.tbtn-${b.id}`) as HTMLButtonElement
      this.buttons[b.id] = el
      this.labels[b.id] = el.querySelector('.tbtn-label') as HTMLSpanElement
      this.bindButton(el, b.control)
    }
    this.bindButton(this.root.querySelector('.tbtn-menu') as HTMLElement, 'touch:menu')
    this.bindButton(this.root.querySelector('.tbtn-pause') as HTMLElement, 'touch:pause')
    this.bindSurface()
    // 長押しのメニュー・ピンチでの拡大・ダブルタップでの拡大を止める
    this.root.addEventListener('contextmenu', (e) => e.preventDefault())
    document.addEventListener('gesturestart', (e) => e.preventDefault())
    window.addEventListener('blur', () => this.releaseAll())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll()
    })
    window.addEventListener('resize', () => this.placeStick(null))
    this.placeStick(null)
    this.applyHints([], { canInteract: false, canSwitch: false })
    this.setClawState(false, false)
  }

  /** 要素を押している間だけ control を down にする（離す・指がそれる・取り消しで up） */
  bindButton(el: HTMLElement, control: string): void {
    let id: number | null = null
    const up = () => {
      if (id === null) return
      id = null
      this.input.down.delete(control)
      el.classList.remove('down')
    }
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (id !== null) return
      id = e.pointerId
      capture(el, e.pointerId)
      if (!this.input.down.has(control)) this.input.pressed.add(control)
      this.input.down.add(control)
      el.classList.add('down')
    })
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('lostpointercapture', up)
    this.releasers.push(up)
  }

  private bindSurface(): void {
    const s = this.surface
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      if (!this.playing) return
      const left = e.clientX < window.innerWidth * TOUCH_TUNING.stickZone
      if (left && !this.stick) {
        this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY }
        this.placeStick(this.stick)
      } else if (!left && !this.lookPtr) {
        this.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY }
      } else return
      capture(s, e.pointerId)
    })
    s.addEventListener('pointermove', (e) => {
      if (this.stick && e.pointerId === this.stick.id) {
        this.updateStick(e.clientX - this.stick.x, e.clientY - this.stick.y)
      } else if (this.lookPtr && e.pointerId === this.lookPtr.id) {
        // カメラはマウスと同じ経路（マウス換算の移動量）で渡す。右へなぞると右を向き、上へなぞると上を見る
        this.input.mouseDX += ((e.clientX - this.lookPtr.x) * TOUCH_TUNING.lookYawPerPx) / CAMERA_TUNING.mouseSensitivity
        this.input.mouseDY += ((e.clientY - this.lookPtr.y) * TOUCH_TUNING.lookPitchPerPx) / CAMERA_TUNING.mouseSensitivity
        this.lookPtr.x = e.clientX
        this.lookPtr.y = e.clientY
      }
    })
    const end = (e: PointerEvent) => {
      if (this.stick && e.pointerId === this.stick.id) this.endStick()
      if (this.lookPtr && e.pointerId === this.lookPtr.id) this.lookPtr = null
    }
    s.addEventListener('pointerup', end)
    s.addEventListener('pointercancel', end)
    s.addEventListener('lostpointercapture', end)
  }

  private updateStick(dx: number, dy: number): void {
    const st = stickVector(dx, dy)
    this.input.analog.set('touch:moveX', st.move.x)
    this.input.analog.set('touch:moveY', st.move.y)
    if (st.dash) this.input.down.add('touch:dash')
    else this.input.down.delete('touch:dash')
    this.stickKnob.style.transform = `translate(${st.knobX.toFixed(1)}px, ${st.knobY.toFixed(1)}px)`
    this.stickBase.classList.toggle('dash', st.dash)
  }

  private endStick(): void {
    this.stick = null
    this.input.analog.delete('touch:moveX')
    this.input.analog.delete('touch:moveY')
    this.input.down.delete('touch:dash')
    this.stickKnob.style.transform = ''
    this.stickBase.classList.remove('dash')
    this.placeStick(null)
  }

  /** スティックの中心を指の位置へ（null なら待機位置＝左下）。画面からはみ出さないよう寄せる */
  private placeStick(at: { x: number; y: number } | null): void {
    const R = TOUCH_TUNING.stickRadius
    const w = window.innerWidth
    const h = window.innerHeight
    const x = at ? Math.max(R + 8, at.x) : Math.max(R + 40, w * 0.16)
    const y = at ? Math.min(h - R - 8, Math.max(R + 8, at.y)) : h - R - Math.max(36, h * 0.12)
    this.stickBase.style.transform = `translate(${(x - R).toFixed(0)}px, ${(y - R).toFixed(0)}px)`
    this.stickBase.classList.toggle('active', at !== null)
  }

  private releaseAll(): void {
    if (this.stick) this.endStick()
    this.lookPtr = null
    for (const r of this.releasers) r()
  }

  /** プレイ中だけスティック・カメラ・アクションのボタンを出す（一時停止・メニュー・ショット中は隠す） */
  setPlaying(on: boolean): void {
    if (on === this.playing) return
    this.playing = on
    this.root.classList.toggle('idle', !on)
    if (!on) {
      if (this.stick) this.endStick()
      this.lookPtr = null
    }
  }

  /** キー案内からボタンの文字・表示を決め、画面下に出す案内（タッチ用の言い方）を返す */
  applyHints(hints: readonly Hint[], ctx: TouchHintContext): Hint[] {
    const v = touchHintView(hints, ctx)
    const key = JSON.stringify(v.labels)
    if (key !== this.viewKey) {
      this.viewKey = key
      for (const b of BUTTONS) {
        const label = v.labels[b.id]
        this.buttons[b.id].hidden = label === null
        if (label !== null && this.labels[b.id].textContent !== label) {
          this.labels[b.id].textContent = label
          this.labels[b.id].classList.toggle('long', label.length > 4)
        }
      }
    }
    return v.hud
  }

  /** 「つかむ」の光り方：照準が対象に合っている（金）・ワイヤーを使っている（強い水色） */
  setClawState(ready: boolean, active: boolean): void {
    this.buttons.claw.classList.toggle('ready', ready && !active)
    this.buttons.claw.classList.toggle('active', active)
  }
}
