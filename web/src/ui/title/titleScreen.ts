// タイトル画面：「つづきから」「はじめから」と、ホーム画面への追加の案内・新しい版への切り替え。
// 背景は一枚絵（titleArt.ts：IDO のわっかの向こうに 4 つの時代、手をふるネクマックスとソラ）。左に絵、右の夜空にロゴとボタン。
// 絵の上の少しの動き：ゆっくり寄るカメラ・時の輪をめぐる光・輪の中の明るさ・星のまたたき・舞う花びら（どれも CSS。WebGL は使わない）。
// 新しい版が見つかったら、ボタンの代わりに進み具合を出し、ダウンロードが終わったら読み込み直す（前の版で遊び始めないように）。
// 選んだら resolve して片付ける。ゲームの読み込みは main.ts がその後に始める。
// 操作：タップ／クリック、または ↑↓（W・S）で選んで Enter・Space・F。Esc で確認・案内を閉じる。
import './title.css'
import { STAGE_INFO } from '../../game/registry'
import type { Pwa, UpdateState } from '../../pwa/pwa'
import { formatBytes } from '../../pwa/swPlan'
import { INSTALL_ICON, installGuideHtml, installedHtml } from './installGuide'
import { artFrame, currentTitleArtUrl, isPortrait } from './titleArt'
import { formatSavedAt, type InstallPlatform, type SaveSummary, type TitleChoice } from './titleLogic'

declare const __APP_VERSION__: string

export type TitleOptions = {
  save: SaveSummary | null
  pwa: Pwa
  platform: InstallPlatform
  standalone: boolean
  /** 最初の起動で、ホーム画面への追加の案内を自動で開く */
  autoGuide: boolean
  /** 案内を「あとで」で閉じた（次から自動で開かない） */
  onGuideDismissed: () => void
  /** タイトルの「ホーム画面に追加」を出すか */
  offerInstall: () => boolean
  now?: number
}

/** 夜空の星（絵の幅・高さに対する %。右の夜空だけ。ゆっくりまたたく） */
const STARS: Array<[number, number, number]> = [
  [63, 7, 0],
  [71, 16, 1.7],
  [78, 4, 3.1],
  [85.5, 12, 0.8],
  [93, 5, 2.4],
  [97.5, 17, 4.2],
  [74, 26, 2.9],
  [89, 22, 1.2],
  [66.5, 33, 3.7],
  [81, 36, 0.4],
]

/** 舞う桜の花びら（画面の左上の桜から右下へ）。[左 %, 秒, 遅れ秒, 大きさ, 横に流れる vw] */
const PETALS: Array<[number, number, number, number, number]> = [
  [2, 13, 0, 1, 34],
  [9, 16, 5.5, 0.8, 42],
  [15, 12, 9, 1.15, 26],
  [22, 18, 2.5, 0.7, 48],
  [4, 15, 11.5, 0.9, 38],
  [30, 14, 7, 0.75, 30],
  [12, 19, 14, 1.05, 52],
  [38, 17, 3.8, 0.65, 40],
]

/** 一枚絵と、その上の少しの動き（時の輪をめぐる光・輪の中の明るさ・星・花びら） */
function artHtml(): string {
  const stars = STARS.map(([x, y, d]) => `<i style="left:${x}%;top:${y}%;animation-delay:${-d}s"></i>`).join('')
  const petals = PETALS.map(
    ([x, sec, delay, s, drift]) => `<i style="left:${x}%;--s:${s};--drift:${drift}vw;animation-duration:${sec}s;animation-delay:${-delay}s"></i>`,
  ).join('')
  return `<div class="nt-art" aria-hidden="true">
      <div class="nt-frame">
        <div class="nt-cam">
          <img class="nt-art-img" alt="" decoding="async" draggable="false">
          <div class="nt-core"></div>
          <div class="nt-orbit"><div class="nt-orbit-spin"></div></div>
          <div class="nt-stars">${stars}</div>
        </div>
      </div>
      <div class="nt-petals">${petals}</div>
      <div class="nt-shade"></div>
    </div>`
}

export class TitleScreen {
  private readonly root: HTMLDivElement
  private readonly opts: TitleOptions
  private readonly frame: HTMLElement
  private readonly img: HTMLImageElement
  private resolve: ((c: TitleChoice) => void) | null = null
  private readonly onKey = (e: KeyboardEvent) => this.key(e)
  private readonly onResize = () => this.layout()
  private ro: ResizeObserver | null = null
  private guideOpen = false
  private confirmOpen = false
  private lastFocus: HTMLElement | null = null
  /** 新しい版を入れている（ボタンを出さない） */
  private updating = false

  constructor(parent: HTMLElement, opts: TitleOptions) {
    this.opts = opts
    const save = opts.save
    const root = document.createElement('div')
    root.className = 'nt-root'
    const saveMeta = save
      ? `<span class="nt-btn-meta"><span>${save.stage ? STAGE_INFO[save.stage].label : '異次元拠点'}</span><span>${formatSavedAt(save.savedAt, opts.now ?? Date.now())}</span></span>`
      : ''
    root.innerHTML = `
      ${artHtml()}
      <main class="nt-side">
        <h1 class="nt-logo" aria-label="NEXMAX CHRONICLE ― はじまりの未来 ―">
          <span class="nt-logo-main">NEXMAX</span>
          <span class="nt-logo-sub">CHRONICLE</span>
          <span class="nt-logo-tag">― はじまりの未来 ―</span>
        </h1>
        <nav class="nt-menu" aria-label="メニュー">
          ${save ? `<button class="nt-btn primary" data-act="continue"><span class="nt-btn-label">つづきから</span>${saveMeta}</button>` : ''}
          <button class="nt-btn${save ? '' : ' primary'}" data-act="new"><span class="nt-btn-label">はじめから</span>${save ? '' : '<span class="nt-btn-meta"><span>2086年　ナンバタウン</span></span>'}</button>
        </nav>
        <div class="nt-updating" role="status" hidden></div>
        <button class="nt-install" data-act="install" hidden>${INSTALL_ICON}<span>ホーム画面に追加</span></button>
      </main>
      <footer class="nt-foot">
        <span class="nt-ver">v${__APP_VERSION__}</span>
      </footer>
      <div class="nt-modal nt-confirm" role="dialog" aria-modal="true" aria-labelledby="nt-confirm-title" hidden>
        <div class="nt-sheet">
          <h2 class="nt-guide-title" id="nt-confirm-title">はじめから遊びますか？</h2>
          <p class="nt-guide-lead">いまの記録（${save ? (save.stage ? STAGE_INFO[save.stage].label : '異次元拠点') : ''}）は消えます。</p>
          <div class="nt-confirm-actions">
            <button class="nt-btn" data-act="confirm-cancel"><span class="nt-btn-label">やめる</span></button>
            <button class="nt-btn danger" data-act="confirm-new"><span class="nt-btn-label">記録を消して、はじめから</span></button>
          </div>
        </div>
      </div>
      <div class="nt-modal nt-guide" role="dialog" aria-modal="true" aria-labelledby="nt-guide-title" hidden>
        <div class="nt-sheet nt-sheet-wide"></div>
      </div>`
    parent.appendChild(root)
    this.root = root
    this.frame = root.querySelector<HTMLElement>('.nt-frame')!
    this.img = root.querySelector<HTMLImageElement>('.nt-art-img')!

    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
      if (b) this.act(b.dataset.act ?? '')
    })
    // 一枚絵（main.ts が先に読み込み始めている）。描けるようになってから、ふわっと出す（読めなければ紺の夜空のまま）
    this.img.src = currentTitleArtUrl()
    const shown = () => root.classList.add('art')
    if (this.img.complete && this.img.naturalWidth > 0) shown()
    else {
      this.img.addEventListener('load', shown, { once: true })
      this.img.addEventListener('error', () => console.warn('[title] タイトルの絵を読めませんでした'), { once: true })
    }
    this.renderInstallEntry()
    opts.pwa.onInstallAvailability = () => {
      this.renderInstallEntry()
      if (this.guideOpen) this.fillGuide()
    }
    opts.pwa.onInstalled = () => {
      this.renderInstallEntry()
      if (this.guideOpen) this.root.querySelector('.nt-guide .nt-sheet')!.innerHTML = installedHtml()
    }
    // タイトルを出している間は、新しい版の準備ができたら、すぐ切り替える
    opts.pwa.autoApply = true
    opts.pwa.onUpdate = (s) => this.renderUpdate(s)
    this.renderUpdate(opts.pwa.updateState)
  }

  /** 表示して、選ばれるのを待つ */
  run(): Promise<TitleChoice> {
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.onResize)
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.layout())
      this.ro.observe(this.root)
      this.ro.observe(this.root.querySelector('.nt-side')!)
    }
    this.layout()
    requestAnimationFrame(() => this.root.classList.add('in'))
    if (import.meta.env.DEV) (window as unknown as { __title?: TitleScreen }).__title = this
    if (this.opts.autoGuide) setTimeout(() => this.openGuide(), 900)
    else this.focusFirst()
    return new Promise((r) => (this.resolve = r))
  }

  /** 片付ける（フェードアウトしてから DOM を外す） */
  async close(): Promise<void> {
    window.removeEventListener('keydown', this.onKey)
    window.removeEventListener('resize', this.onResize)
    this.ro?.disconnect()
    this.opts.pwa.onInstallAvailability = null
    this.opts.pwa.onInstalled = null
    this.opts.pwa.onUpdate = null
    this.opts.pwa.autoApply = false
    this.root.classList.add('out')
    await new Promise((r) => setTimeout(r, 380))
    if (import.meta.env.DEV) delete (window as unknown as { __title?: TitleScreen }).__title
    this.root.remove()
  }

  // ---------------------------------------------------------------- 操作

  private act(a: string): void {
    switch (a) {
      case 'continue':
        this.choose('continue')
        break
      case 'new':
        if (this.opts.save) this.openConfirm()
        else this.choose('new')
        break
      case 'confirm-cancel':
        this.closeConfirm()
        break
      case 'confirm-new':
        this.choose('new')
        break
      case 'install':
        this.openGuide()
        break
      case 'guide-prompt':
        void this.opts.pwa.promptInstall().then(() => this.renderInstallEntry())
        break
      case 'guide-close':
        this.closeGuide(true)
        break
    }
  }

  private choose(c: TitleChoice): void {
    if (!this.resolve || this.updating) return
    // 遊び始めたら、もう切り替えない（次に開いたときに切り替える）
    this.opts.pwa.autoApply = false
    const r = this.resolve
    this.resolve = null
    r(c)
  }

  private key(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.confirmOpen) this.closeConfirm()
      else if (this.guideOpen) this.closeGuide(true)
      return
    }
    const k = e.key.toLowerCase()
    if (k === 'arrowdown' || k === 'arrowup' || k === 's' || k === 'w') {
      e.preventDefault()
      this.moveFocus(k === 'arrowdown' || k === 's' ? 1 : -1)
    } else if (k === 'f') {
      const a = document.activeElement as HTMLElement | null
      if (a && this.root.contains(a) && a.matches('button')) {
        e.preventDefault()
        a.click()
      }
    }
  }

  /** いま操作できるボタン（確認・案内が開いていれば、その中だけ） */
  private buttons(): HTMLElement[] {
    const scope = this.confirmOpen ? this.root.querySelector('.nt-confirm')! : this.guideOpen ? this.root.querySelector('.nt-guide')! : this.root.querySelector('.nt-side')!
    const list = [...scope.querySelectorAll<HTMLElement>('button')].filter((b) => !b.hidden && b.offsetParent !== null)
    return list
  }

  private moveFocus(d: number): void {
    const list = this.buttons()
    if (!list.length) return
    const i = list.indexOf(document.activeElement as HTMLElement)
    const next = list[(i < 0 ? (d > 0 ? 0 : list.length - 1) : (i + d + list.length) % list.length)]
    next.focus()
  }

  /** キーボードで操作する端末か（タッチの端末では、開いたときにボタンへ枠を出さない） */
  private readonly keyboard = typeof matchMedia !== 'function' || !matchMedia('(pointer: coarse)').matches

  private focus(el: HTMLElement | null | undefined): void {
    if (el && this.keyboard) el.focus({ preventScroll: true })
  }

  private focusFirst(): void {
    this.focus(this.buttons()[0])
  }

  private openConfirm(): void {
    this.confirmOpen = true
    this.lastFocus = document.activeElement as HTMLElement
    const m = this.root.querySelector<HTMLElement>('.nt-confirm')!
    m.hidden = false
    this.focus(m.querySelector<HTMLElement>('[data-act="confirm-cancel"]'))
  }

  private closeConfirm(): void {
    this.confirmOpen = false
    this.root.querySelector<HTMLElement>('.nt-confirm')!.hidden = true
    this.focus(this.lastFocus ?? this.buttons()[0])
  }

  private fillGuide(): void {
    this.root.querySelector('.nt-guide .nt-sheet')!.innerHTML = installGuideHtml(this.opts.platform, this.opts.pwa.canPrompt)
  }

  private openGuide(): void {
    if (this.guideOpen || this.confirmOpen || this.updating) return
    this.guideOpen = true
    this.lastFocus = document.activeElement as HTMLElement
    this.fillGuide()
    const m = this.root.querySelector<HTMLElement>('.nt-guide')!
    m.hidden = false
    this.focus(m.querySelector<HTMLElement>('.nt-guide-prompt') ?? m.querySelector<HTMLElement>('button'))
  }

  private closeGuide(dismissed: boolean): void {
    if (!this.guideOpen) return
    this.guideOpen = false
    this.root.querySelector<HTMLElement>('.nt-guide')!.hidden = true
    if (dismissed) this.opts.onGuideDismissed()
    const back = this.lastFocus && this.root.contains(this.lastFocus) && this.lastFocus.offsetParent !== null ? this.lastFocus : null
    this.focus(back ?? this.buttons()[0])
  }

  private renderInstallEntry(): void {
    const b = this.root.querySelector<HTMLElement>('.nt-install')!
    b.hidden = this.updating || !this.opts.offerInstall()
  }

  /** 新しい版を入れている間は、ボタンの代わりに進み具合を出す（終わったら Pwa が読み込み直す） */
  private renderUpdate(s: UpdateState): void {
    const busy = s.phase !== 'idle'
    const was = this.updating
    this.updating = busy
    this.root.querySelector<HTMLElement>('.nt-menu')!.hidden = busy
    const box = this.root.querySelector<HTMLElement>('.nt-updating')!
    box.hidden = !busy
    if (busy !== was) this.renderInstallEntry()
    if (!busy) {
      if (was) this.focusFirst()
      return
    }
    if (this.confirmOpen) {
      this.confirmOpen = false
      this.root.querySelector<HTMLElement>('.nt-confirm')!.hidden = true
    }
    let meta = 'じゅんびしています……'
    let pct = 0
    if (s.phase === 'downloading' && s.total > 0) {
      pct = Math.min(100, Math.round((s.done / s.total) * 100))
      meta = `${formatBytes(s.done)} / ${formatBytes(s.total)}`
    } else if (s.phase === 'ready') {
      pct = 100
      meta = '読みこみなおしています……'
    }
    box.innerHTML = `<span class="nt-updating-title">ゲームを新しくしています</span><i class="nt-updating-bar"><b style="width:${pct}%"></b></i><span class="nt-updating-meta">${meta}</span>`
  }

  // ---------------------------------------------------------------- 大きさ

  /** 絵の枠：画面をおおい、ソラより右の夜空がロゴとボタンの後ろに来るように置く（titleArt.ts） */
  private layout(): void {
    const vw = this.root.clientWidth
    const vh = this.root.clientHeight
    if (vw <= 0 || vh <= 0) return
    // ロゴ・ボタンの左の端（ここより右に、ソラがかからないように）
    const left = this.root.querySelector<HTMLElement>('.nt-logo')!.getBoundingClientRect().left
    const f = artFrame(vw, vh, left, isPortrait(vw, vh))
    const s = this.frame.style
    s.left = `${f.x.toFixed(1)}px`
    s.top = `${f.y.toFixed(1)}px`
    s.width = `${f.w.toFixed(1)}px`
    s.height = `${f.h.toFixed(1)}px`
  }
}
