// 時空移動の全画面演出（約 2 秒）：時代の色の光の渦が画面を覆い（outro）、読み込みの間は「時空移動中」の表示、
// 新しい時代では中央から渦が開いて景色が見えてくる（intro）。WebGL とは別の 2D キャンバスなので、
// 新しいステージの組み立て中（メインスレッドが忙しい間）も最後のフレームのまま画面を覆っていられる。
export type FxTint = { r: number; g: number; b: number }

export class TravelFx {
  private readonly root: HTMLDivElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly card: HTMLDivElement
  private readonly bar: HTMLDivElement
  private readonly msg: HTMLDivElement
  private readonly dest: HTMLDivElement
  private t = 0
  private tint: FxTint = { r: 0.5, g: 0.8, b: 1 }
  private from: FxTint = { r: 0.5, g: 0.8, b: 1 }
  private readonly seeds: Array<{ a: number; r: number; s: number; w: number }> = []

  constructor(ui: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'travel-fx'
    this.root.hidden = true
    this.root.innerHTML = `
      <canvas></canvas>
      <div class="travel-card" hidden>
        <div class="travel-label">時空移動中</div>
        <div class="travel-dest"></div>
        <div class="travel-bar"><div class="travel-fill"></div></div>
        <div class="travel-msg"></div>
      </div>`
    ui.appendChild(this.root)
    this.canvas = this.root.querySelector('canvas') as HTMLCanvasElement
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D
    this.card = this.root.querySelector('.travel-card') as HTMLDivElement
    this.bar = this.root.querySelector('.travel-fill') as HTMLDivElement
    this.msg = this.root.querySelector('.travel-msg') as HTMLDivElement
    this.dest = this.root.querySelector('.travel-dest') as HTMLDivElement
    for (let i = 0; i < 90; i++) this.seeds.push({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.5 + Math.random(), w: 1 + Math.random() * 3 })
  }

  /** 移動を始める（出発の時代の色 → 行き先の時代の色） */
  begin(from: FxTint, to: FxTint, destLabel: string): void {
    this.from = from
    this.tint = to
    this.dest.textContent = destLabel
    this.t = 0
  }

  /** 読み込み表示（cover=1 の間だけ出す） */
  setProgress(p: number, msg: string): void {
    this.bar.style.width = `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%`
    this.msg.textContent = msg
  }

  /**
   * 毎フレーム。cover：0〜1（覆い具合）、opening：intro（中央から開いていく）なら true
   */
  draw(dt: number, cover: number, opening: boolean, loading: boolean): void {
    if (cover <= 0.001) {
      if (!this.root.hidden) this.root.hidden = true
      this.card.hidden = true
      return
    }
    this.root.hidden = false
    this.card.hidden = !loading
    this.t += dt
    const dpr = 0.5
    const W = Math.max(2, Math.round(window.innerWidth * dpr))
    const H = Math.max(2, Math.round(window.innerHeight * dpr))
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W
      this.canvas.height = H
    }
    const g = this.ctx
    const cx = W / 2
    const cy = H / 2
    const R = Math.hypot(W, H) * 0.6
    const ease = cover * cover * (3 - 2 * cover)
    // 色は出発 → 行き先へ（覆いきった時点で行き先の色）
    const k = opening ? 1 : ease
    const mix = (a: number, b: number) => a + (b - a) * k
    const tr = mix(this.from.r, this.tint.r)
    const tg = mix(this.from.g, this.tint.g)
    const tb = mix(this.from.b, this.tint.b)
    const col = (a: number, l = 1) => `rgba(${Math.round(Math.min(1, tr * l) * 255)},${Math.round(Math.min(1, tg * l) * 255)},${Math.round(Math.min(1, tb * l) * 255)},${a})`
    g.globalCompositeOperation = 'source-over'
    g.clearRect(0, 0, W, H)
    // 背景：周囲から中心へ明るくなる光
    const bgA = opening ? ease : ease
    const bg = g.createRadialGradient(cx, cy, 0, cx, cy, R)
    bg.addColorStop(0, `rgba(255,255,255,${bgA})`)
    bg.addColorStop(0.25, col(bgA, 1.25))
    bg.addColorStop(0.7, col(bgA * 0.95, 0.55))
    bg.addColorStop(1, col(bgA * 0.9, 0.25))
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    // 渦の筋
    g.globalCompositeOperation = 'lighter'
    g.lineCap = 'round'
    const spin = this.t * 2.2
    for (const s of this.seeds) {
      const ph = (s.r + this.t * 0.55 * s.s) % 1
      const rr = (1 - ph) * R * (0.25 + ease * 0.9)
      const a = s.a + spin * s.s + ph * 4
      const len = 0.35 + 0.4 * ease
      g.strokeStyle = col(Math.min(1, ease * 1.2) * (0.25 + 0.6 * ph), 1.4)
      g.lineWidth = s.w * (0.6 + ease)
      g.beginPath()
      g.arc(cx, cy, Math.max(1, rr), a, a + len)
      g.stroke()
    }
    // 中央の裂け目（縦長）：outro で広がって画面を覆う
    const riftR = (opening ? 1 : ease) * R * 1.1
    if (riftR > 1) {
      g.globalCompositeOperation = 'source-over'
      g.save()
      g.translate(cx, cy)
      g.scale(0.55 + 0.45 * ease, 1)
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, riftR)
      rg.addColorStop(0, `rgba(255,255,255,${Math.min(1, ease * 1.4)})`)
      rg.addColorStop(0.5, col(Math.min(1, ease * 1.1), 1.6))
      rg.addColorStop(1, col(0, 1))
      g.fillStyle = rg
      g.beginPath()
      g.arc(0, 0, riftR, 0, Math.PI * 2)
      g.fill()
      g.restore()
    }
    // intro：中央から穴が開いて新しい時代が見える
    if (opening) {
      const hole = (1 - cover) * R * 1.15
      g.globalCompositeOperation = 'destination-out'
      const hg = g.createRadialGradient(cx, cy, hole * 0.55, cx, cy, Math.max(hole, 1))
      hg.addColorStop(0, 'rgba(0,0,0,1)')
      hg.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = hg
      g.beginPath()
      g.arc(cx, cy, Math.max(hole, 1), 0, Math.PI * 2)
      g.fill()
      g.globalCompositeOperation = 'source-over'
    }
  }
}
