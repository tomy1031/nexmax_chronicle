// 会話のきろく（過去のセリフを見返す）と、セリフの AUTO の ON/OFF。
// ・画面の上（コンパスの下）に「ログ」「AUTO」の 2 つのボタン。マウス・タップで押せる（キーは L でログ）。
// ・ログは、会話ウィンドウに出たセリフを新しい順に並べたパネル（ゲームは止まる）。
// ・AUTO は、会話の場面（操作が止まっている間）のセリフを、時間で進めるか、F（タップ）を待つか。どちらでも F で早送りできる。
// 何を止めるか・進めるかは game.ts が決める（ここは表示と、押されたことを知らせるだけ）。

export type TalkLogEntry = { speaker: string; text: string }

/** セリフのきろく（新しいものほど後ろ）。同じセリフが続けて来たら 1 つにする。古いものから捨てる */
export class TalkLogStore {
  readonly entries: TalkLogEntry[] = []
  readonly max: number
  constructor(max = 300) {
    this.max = max
  }

  push(speaker: string, text: string): void {
    const last = this.entries[this.entries.length - 1]
    if (last && last.speaker === speaker && last.text === text) return
    this.entries.push({ speaker, text })
    if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max)
  }

  clear(): void {
    this.entries.length = 0
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

export class TalkLogPanel {
  readonly store = new TalkLogStore()
  readonly bar: HTMLDivElement
  readonly modal: HTMLDivElement
  private readonly list: HTMLDivElement
  private readonly autoBtn: HTMLButtonElement
  private readonly foot: HTMLDivElement
  private readonly colorOf: (speaker: string) => string
  private auto = false
  /** ボタンが押されたとき（game.ts がつなぐ） */
  onLog: () => void = () => {}
  onAuto: () => void = () => {}
  onClose: () => void = () => {}

  constructor(host: HTMLElement, colorOf: (speaker: string) => string) {
    this.colorOf = colorOf
    this.bar = document.createElement('div')
    this.bar.className = 'nx-talkbar'
    this.bar.innerHTML = '<button type="button" class="nx-tb nx-tb-log"><span>ログ</span></button><button type="button" class="nx-tb nx-tb-auto"><span>AUTO</span><b>OFF</b></button>'
    this.autoBtn = this.bar.querySelector('.nx-tb-auto') as HTMLButtonElement
    const press = (sel: string, fn: () => void) => {
      const b = this.bar.querySelector(sel) as HTMLButtonElement
      // タッチの層より先に受け取る（pointerdown で決める。ゲームの入力には渡さない）
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        fn()
      })
      b.addEventListener('click', (e) => e.preventDefault())
    }
    press('.nx-tb-log', () => this.onLog())
    press('.nx-tb-auto', () => this.onAuto())
    this.modal = document.createElement('div')
    this.modal.className = 'nx-modal nx-log'
    this.modal.hidden = true
    this.modal.innerHTML = `<div class="nx-log-panel">
        <div class="nx-log-head"><span class="nx-log-tag">LOG</span><span class="nx-log-title">会話のきろく</span><button type="button" class="nx-log-close">とじる</button></div>
        <div class="nx-log-list"></div>
        <div class="nx-log-foot"></div>
      </div>`
    this.list = this.modal.querySelector('.nx-log-list') as HTMLDivElement
    this.foot = this.modal.querySelector('.nx-log-foot') as HTMLDivElement
    const close = this.modal.querySelector('.nx-log-close') as HTMLButtonElement
    close.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.onClose()
    })
    // パネルの中のスクロール・タップはゲームへ渡さない
    for (const ev of ['pointerdown', 'pointermove', 'touchstart', 'touchmove', 'wheel'] as const) this.modal.addEventListener(ev, (e) => e.stopPropagation(), { passive: true })
    host.appendChild(this.bar)
    host.appendChild(this.modal)
  }

  get isOpen(): boolean {
    return !this.modal.hidden
  }

  push(speaker: string, text: string): void {
    this.store.push(speaker, text)
  }

  setAuto(on: boolean): void {
    this.auto = on
    this.autoBtn.classList.toggle('on', on)
    ;(this.autoBtn.querySelector('b') as HTMLElement).textContent = on ? 'ON' : 'OFF'
  }

  get autoOn(): boolean {
    return this.auto
  }

  /** ボタンを出す・隠す（タイトル・移動中・撮影用は隠す） */
  setBarVisible(on: boolean): void {
    this.bar.hidden = !on
  }

  open(touch: boolean): void {
    const e = this.store.entries
    this.list.innerHTML = e.length
      ? e.map((l) => `<div class="nx-log-row"><span class="nx-log-who" style="--c:${this.colorOf(l.speaker)}">${esc(l.speaker)}</span><span class="nx-log-text">${esc(l.text)}</span></div>`).join('')
      : '<div class="nx-log-empty">まだ、会話はありません</div>'
    this.foot.textContent = touch ? '上下になぞって見る' : '↑↓・マウスのホイールで見る　L・Esc でとじる'
    this.modal.hidden = false
    // いちばん新しいセリフ（下）から
    this.list.scrollTop = this.list.scrollHeight
  }

  close(): void {
    this.modal.hidden = true
  }

  /** キーでのスクロール（dir: 1 で下、-1 で上） */
  scroll(dir: number): void {
    this.list.scrollTop += dir * 48
  }
}
