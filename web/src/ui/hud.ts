// 最小限の HUD：時代ラベル・目的・操作ヒント・クローボタン・F3 で FPS/ドローコール。
// コンセプトの HUD（濃紺の半透明パネル・金のひし形）に合わせる。

export type HudStats = { fps: number; ms: number; calls: number; tris: number; ratio: number; quality: string; textures: number; programs: number }

export class Hud {
  private readonly root: HTMLDivElement
  private readonly stats: HTMLDivElement
  private readonly objTitle: HTMLDivElement
  private readonly objSub: HTMLDivElement
  private readonly shotLabel: HTMLDivElement
  private readonly claw: HTMLDivElement
  private statsVisible = false

  constructor(ui: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'hud'
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-status">
          <div class="hud-portrait"><div class="pf-face"><i></i><i></i><b></b></div></div>
          <div class="hud-bars">
            <div class="hud-hearts">${'<span class="heart"></span>'.repeat(5)}</div>
            <div class="hud-energy"><span class="bolt"></span><div class="bar"><div class="fill"></div></div></div>
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
      <div class="hud-controls">
        <span><kbd>WASD</kbd>移動</span><span><kbd>マウス</kbd>視点</span><span><kbd>Space</kbd>ジャンプ</span><span><kbd>Shift</kbd>ダッシュ</span><span><kbd>G</kbd>クロー</span><span><kbd>P</kbd>ショット</span><span><kbd>F3</kbd>情報</span>
      </div>
      <div class="hud-claw"><div class="claw-ring"><svg viewBox="0 0 64 64" aria-hidden="true"><path d="M10 44 L26 30 M22 26 l8 8 M30 22 c6-8 18-8 22 0 M30 22 c2 10 10 14 20 12 M36 40 l8 8" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/></svg></div><div class="claw-key">G</div><div class="claw-label">NMCクロー</div></div>
      <div class="hud-stats"></div>
    `
    ui.appendChild(this.root)
    this.stats = this.root.querySelector('.hud-stats') as HTMLDivElement
    this.objTitle = this.root.querySelector('.obj-title') as HTMLDivElement
    this.objSub = this.root.querySelector('.obj-sub') as HTMLDivElement
    this.shotLabel = this.root.querySelector('.hud-shot') as HTMLDivElement
    this.claw = this.root.querySelector('.hud-claw') as HTMLDivElement
    this.setObjective('歯車を動かないように支えよう', 'ゲンベエが水門を調整中')
  }

  setObjective(title: string, sub: string): void {
    this.objTitle.textContent = title
    this.objSub.textContent = sub
  }

  setShot(label: string | null): void {
    this.shotLabel.textContent = label ?? ''
    this.shotLabel.style.display = label ? 'block' : 'none'
  }

  setClawActive(on: boolean): void {
    this.claw.classList.toggle('active', on)
  }

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
