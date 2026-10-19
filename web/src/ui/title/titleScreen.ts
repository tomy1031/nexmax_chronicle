// タイトル画面：「つづきから」「はじめから」と、ホーム画面への追加の案内・更新の知らせ。
// 選んだら resolve して片付ける（3D のネクマックスの WebGL も手放す）。ゲームの読み込みは main.ts がその後に始める。
// 操作：タップ／クリック、または ↑↓（W・S）で選んで Enter・Space・F。Esc で確認・案内を閉じる。
import './title.css'
import { STAGE_INFO } from '../../game/registry'
import type { StageKey } from '../../game/travel'
import type { Pwa, UpdateState } from '../../pwa/pwa'
import { formatBytes } from '../../pwa/swPlan'
import { INSTALL_ICON, installGuideHtml, installedHtml } from './installGuide'
import { formatSavedAt, type InstallPlatform, type SaveSummary, type TitleChoice } from './titleLogic'
import { TitleNexmax } from './titleNexmax'

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

/** 時の輪の 4 つの時代（左下から時計回りに古い順） */
const ERAS: Array<{ key: StageKey; year: string; place: string; cls: string }> = [
  { key: '1726', year: '1726', place: '仕掛け横丁', cls: 'edo' },
  { key: '1970', year: '1970', place: '万国博覧会', cls: 'expo' },
  { key: '2026', year: '2026', place: 'なんば', cls: 'now' },
  { key: '2086', year: '2086', place: 'ナンバタウン', cls: 'future' },
]

/** 円弧の道。角度は度で、0° が真上・時計回り。a0 から a1 へ（a1 < a0 なら反時計回り） */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = (a: number) => {
    const t = ((a - 90) * Math.PI) / 180
    return `${(cx + r * Math.cos(t)).toFixed(2)} ${(cy + r * Math.sin(t)).toFixed(2)}`
  }
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 >= a0 ? 1 : 0
  return `M ${p(a0)} A ${r} ${r} 0 ${large} ${sweep} ${p(a1)}`
}

/** 時の輪（SVG）。active の時代の弧だけ明るく太い（つづきから再開する時代／はじめての人は 2086 年） */
function ringSvg(active: StageKey): string {
  const cx = 200
  const cy = 200
  const span = 78
  const gap = 12
  const start = 210 // 左下から
  let arcs = ''
  ERAS.forEach((e, i) => {
    const a0 = start + i * (span + gap)
    const a1 = a0 + span
    const on = e.key === active
    // 文字は弧の外側。下半分の弧は文字が逆さにならないよう、向きを逆にした道に載せる
    const mid = ((((a0 + a1) / 2) % 360) + 360) % 360
    const bottom = mid > 90 && mid < 270
    const textPath = bottom ? arcPath(cx, cy, 186, a1, a0) : arcPath(cx, cy, 176, a0, a1)
    arcs += `<g class="nt-era ${e.cls}${on ? ' on' : ''}">
      <path class="nt-arc-glow" d="${arcPath(cx, cy, 160, a0, a1)}" pathLength="100"/>
      <path class="nt-arc" d="${arcPath(cx, cy, 160, a0, a1)}" pathLength="100"/>
      <path id="nt-tp-${e.key}" d="${textPath}" fill="none" stroke="none"/>
      <text class="nt-arc-label"><textPath href="#nt-tp-${e.key}" startOffset="50%" text-anchor="middle"><tspan class="nt-arc-year">${e.year}</tspan><tspan dx="6">${e.place}</tspan></textPath></text>
    </g>`
  })
  return `<svg class="nt-ring" viewBox="0 0 400 400" aria-hidden="true">
    <circle class="nt-ring-track" cx="${cx}" cy="${cy}" r="160"/>
    <circle class="nt-ring-inner" cx="${cx}" cy="${cy}" r="136"/>
    <g class="nt-ring-ticks">${Array.from({ length: 60 }, (_, i) => `<line x1="200" y1="${i % 5 === 0 ? 46 : 50}" x2="200" y2="54" transform="rotate(${i * 6} 200 200)"/>`).join('')}</g>
    ${arcs}
  </svg>`
}

export class TitleScreen {
  private readonly root: HTMLDivElement
  private readonly opts: TitleOptions
  private nexmax: TitleNexmax | null = null
  private resolve: ((c: TitleChoice) => void) | null = null
  private readonly onKey = (e: KeyboardEvent) => this.key(e)
  private readonly onResize = () => this.layout()
  private ro: ResizeObserver | null = null
  private guideOpen = false
  private confirmOpen = false
  private lastFocus: HTMLElement | null = null

  constructor(parent: HTMLElement, opts: TitleOptions) {
    this.opts = opts
    const save = opts.save
    const active: StageKey = save?.stage ?? '2086'
    const root = document.createElement('div')
    root.className = 'nt-root'
    const saveMeta = save
      ? `<span class="nt-btn-meta"><span>${save.stage ? STAGE_INFO[save.stage].label : '異次元拠点'}</span><span>${formatSavedAt(save.savedAt, opts.now ?? Date.now())}</span></span>`
      : ''
    root.innerHTML = `
      <div class="nt-sky" aria-hidden="true"></div>
      <div class="nt-stage">
        <div class="nt-ring-box">${ringSvg(active)}<div class="nt-nexmax"></div></div>
      </div>
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
        <button class="nt-install" data-act="install" hidden>${INSTALL_ICON}<span>ホーム画面に追加</span></button>
      </main>
      <footer class="nt-foot">
        <span class="nt-ver">v${__APP_VERSION__}</span>
        <div class="nt-update" role="status" hidden></div>
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

    root.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')
      if (b) this.act(b.dataset.act ?? '')
    })
    // 3D のネクマックス（作れなければ輪だけ）
    try {
      this.nexmax = new TitleNexmax('full')
      root.querySelector('.nt-nexmax')!.appendChild(this.nexmax.canvas)
    } catch (e) {
      console.warn('[title] ネクマックスを描けませんでした', e)
      this.nexmax = null
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
    opts.pwa.onUpdate = (s) => this.renderUpdate(s)
    this.renderUpdate(opts.pwa.updateState)
  }

  /** 表示して、選ばれるのを待つ */
  run(): Promise<TitleChoice> {
    window.addEventListener('keydown', this.onKey)
    window.addEventListener('resize', this.onResize)
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.layout())
      this.ro.observe(this.root.querySelector('.nt-nexmax')!)
    }
    this.layout()
    requestAnimationFrame(() => this.root.classList.add('in'))
    if (this.nexmax) {
      this.nexmax.start()
      setTimeout(() => this.nexmax?.wave(), 700)
    }
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
    this.root.classList.add('out')
    await new Promise((r) => setTimeout(r, 380))
    this.nexmax?.dispose()
    this.nexmax = null
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
      case 'update':
        this.opts.pwa.applyUpdate()
        break
    }
  }

  private choose(c: TitleChoice): void {
    if (!this.resolve) return
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
    if (!this.confirmOpen && !this.guideOpen) {
      const up = this.root.querySelector<HTMLElement>('.nt-update button')
      if (up && up.offsetParent !== null) list.push(up)
    }
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
    if (this.guideOpen || this.confirmOpen) return
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
    b.hidden = !this.opts.offerInstall()
  }

  private renderUpdate(s: UpdateState): void {
    const box = this.root.querySelector<HTMLElement>('.nt-update')!
    if (s.phase === 'idle') {
      box.hidden = true
      return
    }
    box.hidden = false
    if (s.phase === 'downloading') {
      const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0
      box.innerHTML = `<span>新しい版をダウンロード中　${formatBytes(s.done)} / ${formatBytes(s.total)}</span><i class="nt-update-bar"><b style="width:${pct}%"></b></i>`
    } else {
      const size = s.bytes > 0 ? `（${formatBytes(s.bytes)}）` : ''
      box.innerHTML = `<span>新しい版の準備ができました${size}</span><button class="nt-link" data-act="update">更新する</button>`
    }
  }

  // ---------------------------------------------------------------- 大きさ

  private layout(): void {
    const host = this.root.querySelector<HTMLElement>('.nt-nexmax')
    if (!host || !this.nexmax) return
    const r = host.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) this.nexmax.setSize(r.width, r.height)
  }
}
