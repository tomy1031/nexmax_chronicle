// HUD（操作マニュアル v1.1 §7）。コンセプトの濃紺の半透明パネル・金のアクセントに合わせる。
// ・左上：体力 5 目盛り、時代と場所（筆文字があれば筆文字）、必要なときだけ特殊エネルギー、目的
// ・中央：照準。対象が無いときは小さな点、対象には種類ごとの形と色で吸い付き、輪郭の枠を出す
// ・右下：選択中の NMClaw（右腕）と、つかんでいる対象　・左下：左腕の装備枠（初期は「装備なし」）
// ・画面下：必要なときだけキー案内（キーボードのみ。マウスやコントローラーの表記は出さない）
// ・台詞（源兵衛・おはる）、短いお知らせ、水門パズルの進み具合、一時停止（操作一覧）、装備・記録メニュー

export type HudStats = { fps: number; ms: number; calls: number; tris: number; ratio: number; quality: string; textures: number; programs: number }

export type ReticleCategory = 'light' | 'anchor' | 'mechanism'

export type ReticleState =
  | { mode: 'idle' }
  | { mode: 'target' | 'far'; x: number; y: number; r: number; category: ReticleCategory; label: string; candidates: number; locked: boolean; connected: boolean }

export type Hint = { key: string; label: string }

export type ArmView = {
  right: { name: string; holding: string | null; selected: boolean; active: boolean }
  left: { name: string | null; selected: boolean }
}

export type GateView = {
  progress: number
  signal: 'watch' | 'wait' | 'go' | 'done'
  signalText: string
  adjusting: boolean
}

/** 操作一覧（一時停止画面）。マニュアル §2 の表と同じ並び */
export const CONTROL_LIST: Array<[string, string]> = [
  ['W／A／S／D', '移動（カメラの向きが基準）'],
  ['↑／↓／←／→', 'カメラ・照準の向き'],
  ['Space', 'ジャンプ／ワイヤーから離脱'],
  ['Shift', 'ダッシュ（押している間）'],
  ['F', '話す・調べる'],
  ['J', 'NMClaw を射出／もう一度で解除'],
  ['K', '基本攻撃（戦闘の実装後）'],
  ['R', '狙う対象を切り替える'],
  ['Q／E', '左腕／右腕の装備を選ぶ'],
  ['G', '異次元空間を開く（安全地点のみ）'],
  ['Tab', '装備・記録'],
  ['Esc', '一時停止・操作一覧'],
]

const CLAW_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 44 L26 30 M22 26 l8 8 M30 22 c6-8 18-8 22 0 M30 22 c2 10 10 14 20 12 M36 40 l8 8" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/></svg>`
const HAND_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M22 46 V26 M30 44 V20 M38 44 V22 M46 44 V28 M22 46 c0 8 6 12 12 12 s14-4 14-12 V30" stroke="currentColor" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`

const RETICLE_SHAPES: Record<ReticleCategory, string> = {
  // 軽い物：丸
  light: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="13" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="20" cy="20" r="3" fill="currentColor"/></svg>`,
  // 固定支点：ひし形
  anchor: `<svg viewBox="0 0 40 40"><path d="M20 4 L36 20 L20 36 L4 20 Z" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/><circle cx="20" cy="20" r="3" fill="currentColor"/></svg>`,
  // 協力装置：歯車
  mechanism: `<svg viewBox="0 0 40 40"><path d="M17 3h6l1 5 4 2 4-3 4 4-3 4 2 4 5 1v6l-5 1-2 4 3 4-4 4-4-3-4 2-1 5h-6l-1-5-4-2-4 3-4-4 3-4-2-4-5-1v-6l5-1 2-4-3-4 4-4 4 3 4-2z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><circle cx="20" cy="20" r="5" fill="none" stroke="currentColor" stroke-width="2.6"/></svg>`,
}

const el = <T extends HTMLElement = HTMLDivElement>(root: HTMLElement, sel: string) => root.querySelector(sel) as T

export class Hud {
  private readonly root: HTMLDivElement
  private readonly stats: HTMLDivElement
  private readonly objTitle: HTMLDivElement
  private readonly objSub: HTMLDivElement
  private readonly shotLabel: HTMLDivElement
  private readonly hearts: HTMLDivElement
  private readonly energy: HTMLDivElement
  private readonly era: HTMLDivElement
  private readonly reticle: HTMLDivElement
  private readonly retDot: HTMLDivElement
  private readonly retTarget: HTMLDivElement
  private readonly retShape: HTMLDivElement
  private readonly retBox: HTMLDivElement
  private readonly retLabel: HTMLDivElement
  private readonly hints: HTMLDivElement
  private readonly toastEl: HTMLDivElement
  private readonly barks: HTMLDivElement
  private readonly armR: HTMLDivElement
  private readonly armL: HTMLDivElement
  private readonly armRHold: HTMLDivElement
  private readonly armLName: HTMLDivElement
  private readonly gate: HTMLDivElement
  private readonly gateFill: HTMLDivElement
  private readonly gatePct: HTMLDivElement
  private readonly gateSignal: HTMLDivElement
  private readonly gateGenbei: HTMLDivElement
  private readonly bannerEl: HTMLDivElement
  private readonly flashEl: HTMLDivElement
  private readonly pause: HTMLDivElement
  private readonly menu: HTMLDivElement
  private statsVisible = false
  private hintKey = ''
  private retCategory: ReticleCategory | null = null
  private retLabelKey = ''
  private toastTimer = 0
  private bannerTimer = 0
  private armKey = ''
  private gateKey = ''

  constructor(ui: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'hud'
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-status">
          <div class="hud-portrait"><div class="pf-face"><i></i><i></i><b></b></div></div>
          <div class="hud-bars">
            <div class="hud-hearts" aria-label="体力">${'<span class="heart"></span>'.repeat(5)}</div>
            <div class="hud-energy" hidden><span class="bolt"></span><div class="bar"><div class="fill"></div></div></div>
          </div>
        </div>
        <div class="hud-era">1726年　大坂・仕掛け横丁</div>
        <div class="hud-objective">
          <div class="diamond"><span></span></div>
          <div class="obj-text">
            <div class="obj-title"></div>
            <div class="obj-sub"></div>
          </div>
        </div>
      </div>
      <div class="hud-shot"></div>
      <div class="hud-barks"></div>
      <div class="hud-gate" hidden>
        <div class="gate-title">水門の仕掛け</div>
        <div class="gate-row"><span class="gate-who">源兵衛</span><span class="gate-what">歯止め</span><div class="gate-bar"><div class="gate-fill"></div></div><span class="gate-pct">0%</span></div>
        <div class="gate-row"><span class="gate-who">おはる</span><div class="gate-signal">見張り中</div></div>
      </div>
      <div class="hud-reticle">
        <div class="ret-dot"></div>
        <div class="ret-target" hidden>
          <div class="ret-box"><i></i><i></i><i></i><i></i></div>
          <div class="ret-shape"></div>
          <div class="ret-label"></div>
        </div>
      </div>
      <div class="hud-banner" hidden></div>
      <div class="hud-flash"></div>
      <div class="hud-toast" hidden></div>
      <div class="hud-hints"></div>
      <div class="hud-arm hud-arm-left">
        <div class="arm-ring">${HAND_SVG}</div>
        <div class="arm-key">Q</div>
        <div class="arm-side">左腕</div>
        <div class="arm-name">装備なし</div>
      </div>
      <div class="hud-arm hud-arm-right">
        <div class="arm-ring">${CLAW_SVG}</div>
        <div class="arm-key">J</div>
        <div class="arm-side">右腕</div>
        <div class="arm-name">つかむNMClaw</div>
        <div class="arm-hold"></div>
      </div>
      <div class="hud-pause" hidden>
        <div class="panel">
          <div class="panel-title">一時停止</div>
          <div class="panel-sub">操作一覧（キーボード）</div>
          <table class="controls">${CONTROL_LIST.map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table>
          <div class="panel-note">キー設定は今後のバージョンで対応します</div>
          <div class="panel-foot"><kbd>Esc</kbd>：ゲームに戻る</div>
        </div>
      </div>
      <div class="hud-menu" hidden>
        <div class="panel">
          <div class="panel-title">装備・記録</div>
          <div class="menu-grid">
            <div class="menu-card">
              <div class="menu-head">装備</div>
              <div class="menu-slot"><span class="slot-side">右腕</span><span class="slot-part">つかむNMClaw</span></div>
              <div class="menu-desc">ワイヤーを射出して対象をつかむ。射程 約10m。軽い物は手元へ、固定された金具へは自分が移動、仕掛けはその場で保持。</div>
              <div class="menu-slot empty"><span class="slot-side">左腕</span><span class="slot-part">装備なし</span></div>
              <div class="menu-desc">装備の交換は異次元拠点の装備台で行えます。</div>
            </div>
            <div class="menu-card">
              <div class="menu-head">記録</div>
              <div class="menu-desc">IDO で見た記録：まだありません。</div>
              <div class="menu-desc">収納：0 / 8</div>
            </div>
          </div>
          <div class="panel-foot"><kbd>Tab</kbd>：閉じる</div>
        </div>
      </div>
      <div class="hud-stats"></div>
    `
    ui.appendChild(this.root)
    const r = this.root
    this.stats = el(r, '.hud-stats')
    this.objTitle = el(r, '.obj-title')
    this.objSub = el(r, '.obj-sub')
    this.shotLabel = el(r, '.hud-shot')
    this.hearts = el(r, '.hud-hearts')
    this.energy = el(r, '.hud-energy')
    this.era = el(r, '.hud-era')
    this.reticle = el(r, '.hud-reticle')
    this.retDot = el(r, '.ret-dot')
    this.retTarget = el(r, '.ret-target')
    this.retShape = el(r, '.ret-shape')
    this.retBox = el(r, '.ret-box')
    this.retLabel = el(r, '.ret-label')
    this.hints = el(r, '.hud-hints')
    this.toastEl = el(r, '.hud-toast')
    this.barks = el(r, '.hud-barks')
    this.armR = el(r, '.hud-arm-right')
    this.armL = el(r, '.hud-arm-left')
    this.armRHold = el(r, '.hud-arm-right .arm-hold')
    this.armLName = el(r, '.hud-arm-left .arm-name')
    this.gate = el(r, '.hud-gate')
    this.gateFill = el(r, '.gate-fill')
    this.gatePct = el(r, '.gate-pct')
    this.gateSignal = el(r, '.gate-signal')
    this.gateGenbei = el(r, '.gate-what')
    this.bannerEl = el(r, '.hud-banner')
    this.flashEl = el(r, '.hud-flash')
    this.pause = el(r, '.hud-pause')
    this.menu = el(r, '.hud-menu')
    this.setObjective('大歯車を支えて、水門を直そう', '桟橋から照準を歯車へ向けて J でつかむ')
    void this.useBrushTitleIfAvailable()
  }

  /**
   * 時代・場所の表示に筆文字（Yuji Boku）を使う。読み込み済みで、しかも全部の文字が収録されている
   * （サブセットのフォントで一部の字だけ書体が変わらない）ときだけ。使えなければ丸ゴシックのまま。
   */
  private async useBrushTitleIfAvailable(): Promise<void> {
    const text = this.era.textContent ?? ''
    const check = () => {
      if (brushCovers(text)) this.era.classList.add('brush')
    }
    try {
      if (!document.fonts) return
      await document.fonts.load('32px "Yuji Boku"', text)
      check()
      document.fonts.addEventListener('loadingdone', check)
    } catch {
      // フォントが無くても丸ゴシックで表示できる
    }
  }

  // ---------------------------------------------------------------- 左上

  setObjective(title: string, sub: string): void {
    if (this.objTitle.textContent !== title) this.objTitle.textContent = title
    if (this.objSub.textContent !== sub) this.objSub.textContent = sub
  }

  setEra(text: string): void {
    this.era.textContent = text
    this.era.classList.remove('brush')
    void this.useBrushTitleIfAvailable()
  }

  /** 体力（0〜5 目盛り） */
  setHp(n: number): void {
    this.hearts.querySelectorAll('.heart').forEach((h, i) => h.classList.toggle('empty', i >= n))
  }

  /** 特殊エネルギー（null で非表示。必要なときだけ出す） */
  setEnergy(v: number | null): void {
    this.energy.hidden = v === null
    if (v !== null) (this.energy.querySelector('.fill') as HTMLDivElement).style.width = `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`
  }

  setShot(label: string | null): void {
    this.shotLabel.textContent = label ?? ''
    this.shotLabel.style.display = label ? 'block' : 'none'
  }

  /** プレイ用の表示（照準・案内・腕）をまとめて隠す（ショット撮影用） */
  setPlayUiVisible(on: boolean): void {
    this.root.classList.toggle('no-play-ui', !on)
  }

  // ---------------------------------------------------------------- 照準

  setReticle(s: ReticleState): void {
    if (s.mode === 'idle') {
      this.retDot.hidden = false
      this.retTarget.hidden = true
      this.reticle.classList.remove('snapped')
      return
    }
    this.retDot.hidden = s.mode === 'target'
    this.retTarget.hidden = false
    this.reticle.classList.toggle('snapped', s.mode === 'target')
    if (this.retCategory !== s.category) {
      this.retCategory = s.category
      this.retShape.innerHTML = RETICLE_SHAPES[s.category]
      this.retTarget.dataset.cat = s.category
    }
    this.retTarget.classList.toggle('far', s.mode === 'far')
    this.retTarget.classList.toggle('connected', s.connected)
    this.retTarget.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`
    const size = Math.max(46, Math.min(260, s.r * 2.3 + 18))
    this.retBox.style.width = `${size.toFixed(0)}px`
    this.retBox.style.height = `${size.toFixed(0)}px`
    const label = s.mode === 'far' ? `${s.label}（遠い）` : s.label
    const key = `${label}|${s.candidates > 1 && !s.connected ? 1 : 0}|${s.locked ? 1 : 0}`
    if (key !== this.retLabelKey) {
      this.retLabelKey = key
      this.retLabel.innerHTML = `${escapeHtml(label)}${s.candidates > 1 && !s.connected ? ` <span class="ret-lock">${s.locked ? 'ロック中' : ''} R：切替</span>` : ''}`
    }
  }

  // ---------------------------------------------------------------- 画面下

  /** 必要なときだけのキー案内。同じ内容なら DOM を触らない */
  setHints(list: Hint[]): void {
    const key = list.map((h) => `${h.key}:${h.label}`).join('|')
    if (key === this.hintKey) return
    this.hintKey = key
    this.hints.innerHTML = list.map((h) => `<span><kbd>${escapeHtml(h.key)}</kbd>：${escapeHtml(h.label)}</span>`).join('')
  }

  /** 短いお知らせ（「左腕：装備なし」など） */
  toast(text: string, seconds = 2.2): void {
    this.toastEl.textContent = text
    this.toastEl.hidden = false
    this.toastEl.classList.remove('show')
    void this.toastEl.offsetWidth
    this.toastEl.classList.add('show')
    this.toastTimer = seconds
  }

  /** 台詞（話者名＋一言）。古いものから消える */
  say(speaker: string, text: string, seconds = 3.8): void {
    // 同じ台詞が表示中なら出し直さない（末尾へ移して時間だけ延ばす）
    const key = `${speaker}|${text}`
    for (const old of Array.from(this.barks.children) as HTMLElement[]) {
      if (old.dataset.key === key && !old.classList.contains('out')) old.remove()
    }
    const b = document.createElement('div')
    b.dataset.key = key
    b.className = `bark ${speaker === 'おはる' ? 'oharu' : speaker === '源兵衛' ? 'genbei' : 'system'}`
    b.innerHTML = `<span class="bark-who">${escapeHtml(speaker)}</span><span class="bark-text">${escapeHtml(text)}</span>`
    this.barks.appendChild(b)
    while (this.barks.children.length > 3) this.barks.firstElementChild?.remove()
    setTimeout(() => {
      b.classList.add('out')
      setTimeout(() => b.remove(), 400)
    }, seconds * 1000)
  }

  // ---------------------------------------------------------------- 腕

  setArms(a: ArmView): void {
    const key = JSON.stringify(a)
    if (key === this.armKey) return
    this.armKey = key
    this.armR.classList.toggle('active', a.right.active)
    this.armR.classList.toggle('selected', a.right.selected)
    this.armRHold.textContent = a.right.holding ?? ''
    this.armRHold.hidden = !a.right.holding
    this.armL.classList.toggle('selected', a.left.selected)
    this.armL.classList.toggle('empty', a.left.name === null)
    this.armLName.textContent = a.left.name ?? '装備なし'
  }

  /** Q／E を押したときに腕の枠を光らせる */
  pulseArm(side: 'left' | 'right'): void {
    const e = side === 'left' ? this.armL : this.armR
    e.classList.remove('pulse')
    void e.offsetWidth
    e.classList.add('pulse')
  }

  // ---------------------------------------------------------------- 水門パズル

  setGate(g: GateView | null): void {
    if (!g) {
      this.gate.hidden = true
      this.gateKey = ''
      return
    }
    this.gate.hidden = false
    const pct = Math.round(g.progress * 100)
    const key = `${pct}|${g.signal}|${g.signalText}|${g.adjusting}`
    if (key === this.gateKey) return
    this.gateKey = key
    this.gateFill.style.width = `${pct}%`
    this.gatePct.textContent = `${pct}%`
    this.gateGenbei.textContent = g.progress >= 1 ? '歯止め 完了' : g.adjusting ? '歯止めを調整中' : '歯止め'
    this.gateSignal.textContent = g.signalText
    this.gateSignal.dataset.signal = g.signal
  }

  /** 大きな文字の演出（成功・失敗） */
  banner(text: string, kind: 'success' | 'fail', seconds = 2.6): void {
    this.bannerEl.textContent = text
    this.bannerEl.dataset.kind = kind
    this.bannerEl.hidden = false
    this.bannerEl.classList.remove('show')
    void this.bannerEl.offsetWidth
    this.bannerEl.classList.add('show')
    this.bannerTimer = seconds
  }

  flash(kind: 'danger' | 'success'): void {
    this.flashEl.dataset.kind = kind
    this.flashEl.classList.remove('show')
    void this.flashEl.offsetWidth
    this.flashEl.classList.add('show')
  }

  // ---------------------------------------------------------------- 一時停止・メニュー

  setPaused(on: boolean): void {
    this.pause.hidden = !on
  }

  setMenu(on: boolean): void {
    this.menu.hidden = !on
  }

  /** 毎フレーム：お知らせ・演出の時間切れ */
  tick(dt: number): void {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt
      if (this.toastTimer <= 0) this.toastEl.hidden = true
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt
      if (this.bannerTimer <= 0) this.bannerEl.hidden = true
    }
  }

  // ---------------------------------------------------------------- 開発用の統計（F3）

  toggleStats(force?: boolean): void {
    this.statsVisible = force ?? !this.statsVisible
    this.stats.style.display = this.statsVisible ? 'block' : 'none'
  }

  get statsOn(): boolean {
    return this.statsVisible
  }

  updateStats(s: HudStats): void {
    if (!this.statsVisible) return
    this.stats.innerHTML = `FPS <b>${s.fps.toFixed(0)}</b> (${s.ms.toFixed(1)} ms)<br>Draw calls <b>${s.calls}</b><br>Triangles ${(s.tris / 1000).toFixed(0)}k<br>Pixel ratio ${s.ratio.toFixed(2)} / ${s.quality}<br>Textures ${s.textures} / Programs ${s.programs}`
  }
}

/** 各文字を「Yuji Boku → 代替」と「代替だけ」で描き比べ、全部の字で違えば収録されているとみなす */
function brushCovers(text: string): boolean {
  const chars = [...new Set([...text.replace(/\s|　/g, '')])]
  if (chars.length === 0) return false
  const cv = document.createElement('canvas')
  cv.width = cv.height = 40
  const g = cv.getContext('2d', { willReadFrequently: true })
  if (!g) return false
  const draw = (font: string, ch: string) => {
    g.clearRect(0, 0, 40, 40)
    g.font = font
    g.fillStyle = '#000'
    g.textBaseline = 'middle'
    g.fillText(ch, 4, 20)
    return g.getImageData(0, 0, 40, 40).data
  }
  for (const ch of chars) {
    const a = draw('32px "Yuji Boku", serif', ch)
    const b = draw('32px serif', ch)
    let same = true
    for (let i = 3; i < a.length; i += 4) {
      if (a[i] !== b[i]) {
        same = false
        break
      }
    }
    if (same) return false
  }
  return true
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
}

export class LoadingOverlay {
  private readonly el: HTMLDivElement
  private readonly bar: HTMLDivElement
  private readonly msg: HTMLDivElement

  constructor(ui: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'loading'
    this.el.innerHTML = `
      <div class="loading-box">
        <div class="loading-title">NEXMAX CHRONICLE</div>
        <div class="loading-sub">― はじまりの未来 ―</div>
        <div class="loading-era">1726年　大坂・仕掛け横丁</div>
        <div class="loading-bar"><div class="loading-fill"></div></div>
        <div class="loading-msg">準備中…</div>
      </div>`
    ui.appendChild(this.el)
    this.bar = this.el.querySelector('.loading-fill') as HTMLDivElement
    this.msg = this.el.querySelector('.loading-msg') as HTMLDivElement
  }

  set(progress: number, msg: string): void {
    this.bar.style.width = `${Math.round(progress * 100)}%`
    this.msg.textContent = msg
  }

  hide(): void {
    this.el.classList.add('done')
    setTimeout(() => this.el.remove(), 700)
  }
}
