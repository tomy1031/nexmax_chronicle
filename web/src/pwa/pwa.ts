// ホーム画面のアプリ（PWA）としての動き：Service Worker の登録と更新、インストールの案内に使う情報。
// Service Worker（sw/sw.ts → 書き出しの sw.js）は、ファイルごとに内容のハッシュを持ち、
// 更新のときは変わったファイルだけダウンロードする（src/pwa/swPlan.ts）。
// 遊んでいる途中では切り替えない（ファイルが入れ替わらないように）。次に開いたとき（タイトルが出る前）に切り替える。
// タイトル画面では、新しい版が見つかったら、その場でダウンロードして切り替える（autoApply）。
// 公開した直後に開くと、Service Worker はまず前の版を出すので、タイトルを出す前に新しい版が無いか確かめる（checkForUpdate）。

/** Chrome・Edge・Samsung Internet のインストールの合図（標準の型には無い） */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type UpdateState =
  | { phase: 'idle' }
  /** 新しい版のファイルをダウンロード中（done / total はバイト数） */
  | { phase: 'downloading'; done: number; total: number }
  /** 新しい版の準備ができた（bytes：今回ダウンロードした量） */
  | { phase: 'ready'; bytes: number }

/** Service Worker からのお知らせ（sw/sw.ts と同じ形） */
type SwMessage =
  | { type: 'nx-sw'; phase: 'download'; done: number; total: number; version: string }
  | { type: 'nx-sw'; phase: 'installed'; bytes: number; version: string }

export function isStandalone(): boolean {
  try {
    if (matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches) return true
  } catch {
    // matchMedia が無い環境
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export class Pwa {
  private deferred: BeforeInstallPromptEvent | null = null
  private reg: ServiceWorkerRegistration | null = null
  private update: UpdateState = { phase: 'idle' }
  private lastBytes = 0
  private reloading = false
  /** このページを開いたとき、すでに Service Worker が動いていたか（初めて入れるときの進み具合は「更新」として見せない） */
  private hadController = false
  /** 見守っている、入れている途中の新しい版 */
  private watching: ServiceWorker | null = null
  /** 新しい版の準備ができたら、すぐ切り替えて読み込み直す（タイトル画面を出している間だけ true） */
  autoApply = false
  /** インストールの合図が来た・使った（ボタンの出し分けに） */
  onInstallAvailability: ((canPrompt: boolean) => void) | null = null
  onUpdate: ((s: UpdateState) => void) | null = null
  /** ホーム画面に追加された */
  onInstalled: (() => void) | null = null

  /** できるだけ早く呼ぶ（beforeinstallprompt はページの読み込み直後に来ることがある） */
  listen(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      this.deferred = e as BeforeInstallPromptEvent
      this.onInstallAvailability?.(true)
    })
    window.addEventListener('appinstalled', () => {
      this.deferred = null
      this.onInstallAvailability?.(false)
      this.onInstalled?.()
    })
  }

  get canPrompt(): boolean {
    return this.deferred !== null
  }

  get updateState(): UpdateState {
    return this.update
  }

  /** ブラウザのインストールの画面を出す。追加されたら true */
  async promptInstall(): Promise<boolean> {
    const e = this.deferred
    if (!e) return false
    this.deferred = null
    this.onInstallAvailability?.(false)
    try {
      await e.prompt()
      const c = await e.userChoice
      return c.outcome === 'accepted'
    } catch {
      return false
    }
  }

  /**
   * Service Worker を登録する。前に開いたときに新しい版の準備ができていたら、すぐ切り替えて再読み込みし、
   * 'reloading' を返す（呼んだ側はタイトルを出さずに待つ）。
   * 開発中（vite dev）と、Service Worker が使えないブラウザでは何もしない。
   */
  async register(applyWaitingNow: boolean): Promise<'ok' | 'reloading' | 'unsupported'> {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return 'unsupported'
    let reg: ServiceWorkerRegistration
    try {
      reg = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' })
    } catch (e) {
      console.warn('[pwa] Service Worker を登録できませんでした', e)
      return 'unsupported'
    }
    this.reg = reg
    this.hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.addEventListener('message', (ev: MessageEvent) => this.onMessage(ev.data as SwMessage))
    // addEventListener だけでは届かないブラウザがあるので、お知らせの受け取りを始める
    navigator.serviceWorker.startMessages()
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // 切り替えを頼んだときだけ読み込み直す（初めて入れたときの claim では読み込み直さない）
      if (this.reloading) location.reload()
    })
    if (reg.waiting && navigator.serviceWorker.controller) {
      if (applyWaitingNow) {
        this.applyUpdate()
        return 'reloading'
      }
      this.setUpdate({ phase: 'ready', bytes: 0 })
    }
    // ページを開いたときにブラウザが始めた確認で、もう入れている途中のことがある
    this.watch(reg.installing)
    reg.addEventListener('updatefound', () => this.watch(reg.installing))
    return 'ok'
  }

  /**
   * 新しい版が出ていないか、いま確かめる（タイトルを出す前に呼ぶ）。
   * 見つかれば、入れ始めたところで返る（updateState が 'downloading' になる）。オフライン・時間切れなら何もしない。
   */
  async checkForUpdate(timeoutMs = 4000): Promise<void> {
    const reg = this.reg
    if (!reg || !this.hadController) return
    try {
      await Promise.race([reg.update(), new Promise((r) => setTimeout(r, timeoutMs))])
    } catch {
      // オフラインなど。いまの版で続ける
    }
    this.watch(reg.installing)
  }

  /** 入れている途中の新しい版を見守る：入れ終わったら 'ready'、失敗したら 'idle' */
  private watch(w: ServiceWorker | null): void {
    // 前の版が動いている（controller がある）ときだけ「更新」。初めて入れたときは何もしない
    if (!w || w === this.watching || !this.hadController) return
    this.watching = w
    if (this.update.phase === 'idle') this.setUpdate({ phase: 'downloading', done: 0, total: 0 })
    const check = () => {
      if (w !== this.watching) return
      if (w.state === 'installed' && navigator.serviceWorker.controller) {
        this.watching = null
        this.setUpdate({ phase: 'ready', bytes: this.lastBytes })
      } else if (w.state === 'redundant') {
        // ダウンロードできなかった（オフラインになった など）。次に開いたときにもう一度
        this.watching = null
        if (this.update.phase === 'downloading') this.setUpdate({ phase: 'idle' })
      }
    }
    w.addEventListener('statechange', check)
    check()
  }

  /** 待っている新しい版に切り替えて読み込み直す */
  applyUpdate(): void {
    if (this.reloading) return
    const w = this.reg?.waiting
    if (!w) {
      location.reload()
      return
    }
    this.reloading = true
    w.postMessage({ type: 'nx-skip-waiting' })
    // 念のため：切り替えの知らせが来なければ 4 秒後に読み込み直す
    setTimeout(() => location.reload(), 4000)
  }

  private onMessage(m: SwMessage): void {
    if (!m || m.type !== 'nx-sw') return
    // 初めて入れるとき（開いたときに controller が無かった）の進み具合は「更新」として見せない
    if (!this.hadController) return
    if (m.phase === 'download') {
      this.lastBytes = m.total
      if (this.update.phase !== 'ready') this.setUpdate({ phase: 'downloading', done: m.done, total: m.total })
    } else if (m.phase === 'installed') {
      this.lastBytes = m.bytes
    }
  }

  private setUpdate(s: UpdateState): void {
    this.update = s
    this.onUpdate?.(s)
    if (s.phase === 'ready' && this.autoApply) this.applyUpdate()
  }
}
