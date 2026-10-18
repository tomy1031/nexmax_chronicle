// IDO のパネルの絵が「組み上がる」演出（QR を読み取った直後）。2086年の展示の QR と同じ考え方：
// 最初は粗いモザイクの絵が現れ、上から光の線が走って、線の通ったところから本物の絵（くっきり）に置き換わっていく。
// HUD の showIdo には表示用のキャンバス（1 枚を使い回す）を渡し、毎フレームこのキャンバスに描き直す。
// 毎フレームの割り当ては無い（キャンバスは最初に作って使い回す）。元の絵の大きさ（720×300 の手描き、または
// 生成した写真を幅 720 に縮めたもの）に合わせて表示用のキャンバスの大きさを変える。

const TW = 36
const TH = 15

export class IdoPanelFx {
  /** HUD に渡す表示用のキャンバス */
  readonly canvas: HTMLCanvasElement
  private readonly g: CanvasRenderingContext2D
  private readonly tiny: HTMLCanvasElement
  private readonly tg: CanvasRenderingContext2D
  private src: HTMLCanvasElement | null = null
  private t = 0
  private done = true
  /** 組み上がるまでの秒数 */
  duration = 1.15

  constructor() {
    this.canvas = document.createElement('canvas')
    this.canvas.width = 720
    this.canvas.height = 300
    this.g = this.canvas.getContext('2d') as CanvasRenderingContext2D
    this.tiny = document.createElement('canvas')
    this.tiny.width = TW
    this.tiny.height = TH
    this.tg = this.tiny.getContext('2d') as CanvasRenderingContext2D
  }

  /** 絵を組み上げ始める（src は元の絵。幅 720 前後） */
  start(src: HTMLCanvasElement): void {
    this.src = src
    if (this.canvas.width !== src.width || this.canvas.height !== src.height) {
      this.canvas.width = src.width
      this.canvas.height = src.height
    }
    this.t = 0
    this.done = false
    this.tg.imageSmoothingEnabled = true
    this.tg.clearRect(0, 0, TW, TH)
    this.tg.drawImage(src, 0, 0, TW, TH)
    this.draw()
  }

  get finished(): boolean {
    return this.done
  }

  update(dt: number): void {
    if (this.done || !this.src) return
    this.t += dt
    this.draw()
    if (this.t >= this.duration) this.done = true
  }

  private draw(): void {
    const src = this.src
    if (!src) return
    const g = this.g
    const W = this.canvas.width
    const H = this.canvas.height
    const k = Math.min(1, this.t / this.duration)
    // 下地：暗い紺の方眼（まだ何も読めていない）
    g.globalAlpha = 1
    g.fillStyle = '#06142a'
    g.fillRect(0, 0, W, H)
    // 粗いモザイク（少しずつ現れる）
    const mosaicA = Math.min(1, k * 3.2)
    g.globalAlpha = mosaicA * 0.85
    g.imageSmoothingEnabled = false
    g.drawImage(this.tiny, 0, 0, W, H)
    g.imageSmoothingEnabled = true
    // 光の線が上から下へ。線より上はくっきりした本物の絵
    const ease = k < 0.25 ? 0 : Math.min(1, (k - 0.25) / 0.7)
    const lineY = ease * (H + 24)
    if (lineY > 0) {
      g.globalAlpha = 1
      const h = Math.min(H, lineY)
      g.drawImage(src, 0, 0, W, h, 0, 0, W, h)
    }
    // 走る光の線と、その下の細い格子
    if (k < 1) {
      g.globalAlpha = 0.9
      const gr = g.createLinearGradient(0, lineY - 18, 0, lineY + 4)
      gr.addColorStop(0, 'rgba(110,230,255,0)')
      gr.addColorStop(0.8, 'rgba(150,240,255,0.65)')
      gr.addColorStop(1, 'rgba(230,252,255,1)')
      g.fillStyle = gr
      g.fillRect(0, lineY - 18, W, 22)
      g.globalAlpha = 0.18 * (1 - k)
      g.fillStyle = '#7fe8ff'
      for (let x = 0; x < W; x += 20) g.fillRect(x, lineY, 1, H - lineY)
      for (let y = Math.ceil(lineY / 20) * 20; y < H; y += 20) g.fillRect(0, y, W, 1)
    }
    g.globalAlpha = 1
  }
}
