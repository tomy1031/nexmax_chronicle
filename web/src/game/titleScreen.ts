// タイトル画面の表示（DOM）。決まりは titleLogic.ts。キーボード（↑↓・Enter など）とクリック・タップの両方で選べる。
// 最初のキー・タップで onPress（音を出せるようにして、タイトルの曲を始める）。決まったら done が解決する。
import './title.css'
import { TITLE_ITEMS, itemEnabled, titleActivate, titleConfirm, titleInit, titleKey, type TitleChoice, type TitleState } from './titleLogic'

export type TitleSaveInfo = { place: string; savedAt: string } | null

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export class TitleScreen {
  readonly done: Promise<TitleChoice>
  /** 最初のキー・タップ（メニューが出る瞬間） */
  onPress: (() => void) | null = null
  private readonly el: HTMLDivElement
  private s: TitleState
  private resolve!: (c: TitleChoice) => void
  /** メニューが出た直後のタップで、そのまま項目を決めないように */
  private menuAt = 0
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.repeat) return
    this.set(titleKey(this.s, e.code))
  }

  constructor(ui: HTMLElement, save: TitleSaveInfo, opts: { touch: boolean; version: string }) {
    this.s = titleInit(save !== null)
    this.el = document.createElement('div')
    this.el.className = `nx-title${opts.touch ? ' touch' : ''}`
    const items: Record<TitleChoice, { label: string; desc: string }> = {
      new: { label: 'はじめから', desc: '2086年 ナンバタウンの朝から' },
      continue: { label: 'つづきから', desc: save ? `${save.place}${save.savedAt ? `　${save.savedAt}` : ''}` : '記録がありません' },
    }
    this.el.innerHTML = `
      <div class="tt-shade"></div>
      <div class="tt-logo">
        <div class="tt-kicker">TIME LINK ACTION</div>
        <div class="tt-name"><span class="tt-nex">NEXMAX</span><span class="tt-chr">CHRONICLE</span></div>
        <div class="tt-sub">― はじまりの未来 ―</div>
      </div>
      <div class="tt-press">${opts.touch ? '画面をタップしてください' : 'PRESS ANY KEY'}<small>${opts.touch ? 'TAP TO START' : 'キーを押してください'}</small></div>
      <div class="tt-menu" role="menu">
        ${TITLE_ITEMS.map(
          (it, i) => `<div class="tt-item" role="menuitem" data-i="${i}"><span class="tt-mark"></span><span class="tt-label">${items[it].label}</span><span class="tt-desc">${esc(items[it].desc)}</span></div>`,
        ).join('')}
      </div>
      <div class="tt-confirm" role="dialog">
        <div class="tt-box">
          <div class="tt-q">いまの記録を消して、はじめから遊びますか？</div>
          <div class="tt-btns"><span class="tt-btn" data-yes="0">いいえ</span><span class="tt-btn" data-yes="1">はい</span></div>
        </div>
      </div>
      <div class="tt-foot"><span class="tt-keys">${opts.touch ? '' : '↑↓ 選ぶ　Enter 決定'}</span><span class="tt-ver">v${esc(opts.version)}</span></div>
      <div class="tt-fade"></div>`
    ui.appendChild(this.el)
    ui.classList.add('nx-title-on')
    this.done = new Promise((r) => (this.resolve = r))
    window.addEventListener('keydown', this.onKey)
    // どこかを触ったらメニューへ（「PRESS ANY KEY」の間だけ）
    this.el.addEventListener('pointerdown', () => {
      if (this.s.mode === 'press') this.set(titleKey(this.s, 'Tap'))
    })
    this.el.querySelectorAll<HTMLElement>('.tt-item').forEach((item) => {
      const i = Number(item.dataset.i)
      item.addEventListener('pointerenter', () => {
        if (this.s.mode === 'menu' && itemEnabled(this.s, i)) this.set({ ...this.s, sel: i })
      })
      item.addEventListener('click', () => {
        if (performance.now() - this.menuAt < 350) return
        this.set(titleActivate(this.s, i))
      })
    })
    this.el.querySelectorAll<HTMLElement>('.tt-btn').forEach((b) => {
      const yes = b.dataset.yes === '1'
      b.addEventListener('pointerenter', () => {
        if (this.s.mode === 'confirm') this.set({ ...this.s, confirmSel: yes ? 1 : 0 })
      })
      b.addEventListener('click', () => this.set(titleConfirm(this.s, yes)))
    })
    this.render()
    // 少し遅れてロゴから出す
    requestAnimationFrame(() => this.el.classList.add('in'))
  }

  /** いまの段階（確かめ用） */
  get mode(): TitleState['mode'] {
    return this.s.mode
  }

  private set(n: TitleState): void {
    if (n === this.s) return
    const prev = this.s
    this.s = n
    if (prev.mode === 'press' && n.mode !== 'press') {
      this.menuAt = performance.now()
      this.onPress?.()
    }
    this.render()
    if (n.mode === 'done' && n.result) {
      window.removeEventListener('keydown', this.onKey)
      this.resolve(n.result)
    }
  }

  private render(): void {
    const s = this.s
    this.el.dataset.mode = s.mode
    this.el.querySelectorAll<HTMLElement>('.tt-item').forEach((item) => {
      const i = Number(item.dataset.i)
      item.classList.toggle('sel', i === s.sel)
      item.classList.toggle('off', !itemEnabled(s, i))
      item.classList.toggle('chosen', s.mode === 'done' && i === s.sel)
    })
    this.el.querySelectorAll<HTMLElement>('.tt-btn').forEach((b) => b.classList.toggle('sel', Number(b.dataset.yes) === s.confirmSel))
  }

  /** 画面を暗くしてから消える（秒） */
  fadeOut(sec = 0.7): Promise<void> {
    this.el.style.setProperty('--tt-fade', `${sec}s`)
    this.el.classList.add('leaving')
    return new Promise((r) => setTimeout(r, sec * 1000))
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey)
    this.el.parentElement?.classList.remove('nx-title-on')
    this.el.remove()
  }
}
