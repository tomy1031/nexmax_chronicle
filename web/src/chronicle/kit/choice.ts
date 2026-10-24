// 選択肢（W/S・↑↓ で選び、F／J で決定。スマホでは選択肢をタップすると選んで決定）。
// 2086 年のアダプタ（game/future2086Adapter.ts）の ChoiceBox を共通にしたもの。見た目は game.css の .game-choice。
import type { ActionFrame } from '../../player/inputActions'

export type ChoiceOption = { id: string; label: string }

export class ChoiceBox {
  private el: HTMLDivElement | null = null
  private opts: ChoiceOption[] = []
  private sel = 0
  private prompt = ''
  id = ''
  private lastY = 0
  private tapped = false
  private resolve: ((id: string) => void) | null = null

  get open(): boolean {
    return this.el !== null
  }

  /** 出して、決まったら選んだ id で resolve（ステージの update から input()／interact から pick() を呼ぶ） */
  ask(ui: HTMLElement, id: string, prompt: string, options: readonly ChoiceOption[]): Promise<string> {
    this.show(ui, id, prompt, options)
    return new Promise((r) => (this.resolve = r))
  }

  show(ui: HTMLElement, id: string, prompt: string, options: readonly ChoiceOption[]): void {
    this.close()
    this.id = id
    this.prompt = prompt
    this.opts = [...options]
    this.sel = 0
    this.el = document.createElement('div')
    this.el.className = 'game-choice'
    this.tapped = false
    this.el.addEventListener('pointerdown', (e) => {
      const o = (e.target as HTMLElement).closest<HTMLElement>('.gc-opt')
      if (!o) return
      e.preventDefault()
      this.sel = Number(o.dataset.i)
      this.tapped = true
      this.render()
    })
    ui.appendChild(this.el)
    this.render()
  }

  /** 毎フレーム：W/S で選ぶ・タップ・J／F で決める。決まったら id を返す（ask の Promise も解ける） */
  input(frame: ActionFrame): string | null {
    if (!this.el) return null
    const y = Math.abs(frame.move.y) > 0.5 ? frame.move.y : frame.look.y
    const dir = y > 0.5 ? 1 : y < -0.5 ? -1 : 0
    if (dir !== 0 && this.lastY === 0) {
      this.sel = (this.sel + (dir > 0 ? this.opts.length - 1 : 1)) % this.opts.length
      this.render()
    }
    this.lastY = dir
    const tap = this.tapped
    this.tapped = false
    if (tap || frame.pressed.has('claw_fire')) return this.pick()
    return null
  }

  /** いま選んでいる物で決める（F。ステージの interact から） */
  pick(): string | null {
    if (!this.el) return null
    const o = this.opts[this.sel]
    this.close()
    const r = this.resolve
    this.resolve = null
    r?.(o.id)
    return o.id
  }

  close(): void {
    this.el?.remove()
    this.el = null
  }

  private render(): void {
    if (!this.el) return
    this.el.innerHTML = `<div class="gc-title">${this.prompt}</div>${this.opts.map((o, i) => `<div class="gc-opt${i === this.sel ? ' on' : ''}" data-i="${i}">${i === this.sel ? '▶ ' : ''}${o.label}</div>`).join('')}<div class="gc-foot">W／S：選ぶ　F：決定</div><div class="gc-foot-touch">えらんでタップ</div>`
  }
}
