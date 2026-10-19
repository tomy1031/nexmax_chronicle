// ホーム画面のアプリ（PWA）としての動き：Service Worker の登録と更新、インストールの案内に使う情報。
// Service Worker（sw/sw.ts → 書き出しの sw.js）は、ファイルごとに内容のハッシュを持ち、
// 更新のときは変わったファイルだけダウンロードする（src/pwa/swPlan.ts）。
// 新しい版はすぐには切り替えない（遊んでいる途中でファイルが入れ替わらないように）。
// 次に開いたとき（タイトルが出る前）か、タイトル画面の「更新する」で切り替えて再読み込みする。

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
    reg.addEventListener('updatefound', () => {
      const w = reg.installing
      if (!w) return
      w.addEventListener('statechange', () => {
        // 前の版が動いている（controller がある）ときだけ「更新」。初めて入れたときは何もしない
        if (w.state === 'installed' && this.hadController && navigator.serviceWorker.controller) this.setUpdate({ phase: 'ready', bytes: this.lastBytes })
      })
    })
    return 'ok'
  }

  /** 待っている新しい版に切り替えて読み込み直す */
  applyUpdate(): void {
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
  }
}
