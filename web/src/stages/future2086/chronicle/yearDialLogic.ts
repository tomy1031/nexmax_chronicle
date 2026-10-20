// 年代ダイヤルの遊び（物語 v7 の 8・10 章）：左右でダイヤルを回して年をえらぶ。石の音（波形）と記録の音（波形）が
// そろった年で F → 道がひらく。純粋なロジック（tests/chronicle2086Additions.test.ts）。
// ・押し続けると速くなる（1 → 8 → 40 → 160 年／秒）。目当ての年の近く（30 年以内）では 8 年／秒より速くならない
// ・そろい具合 match：ずれ 0 で 1。ずれ 6 年で約 0.37（波が少しずれて見える）
// ・detune：記録の波の「ずれ」（-1..1）。画面の波の速さ・位相に使う

export type YearDialOptions = { start: number; target: number; min?: number; max?: number }

export const DIAL_SPEEDS = [
  { after: 0, rate: 1 },
  { after: 0.45, rate: 8 },
  { after: 1.3, rate: 40 },
  { after: 2.4, rate: 160 },
] as const

export class YearDialLogic {
  year: number
  target: number
  readonly min: number
  readonly max: number
  private holdT = 0
  private holdDir = 0
  private frac = 0

  constructor(o: YearDialOptions) {
    this.min = o.min ?? 1100
    this.max = o.max ?? 2086
    this.year = clamp(Math.round(o.start), this.min, this.max)
    this.target = o.target
  }

  /** 1 年だけ回す（タップ・左右キーの押した瞬間） */
  step(dir: -1 | 1): void {
    this.year = clamp(this.year + dir, this.min, this.max)
  }

  /**
   * 押し続けている間、毎フレーム呼ぶ（dir：-1 左・+1 右・0 離した）。押した瞬間は 1 年、そのあと速くなる。
   * 年が変わったら true
   */
  hold(dir: -1 | 0 | 1, dt: number): boolean {
    if (dir === 0) {
      this.holdT = 0
      this.holdDir = 0
      this.frac = 0
      return false
    }
    const before = this.year
    if (dir !== this.holdDir) {
      this.holdDir = dir
      this.holdT = 0
      this.frac = 0
      this.step(dir)
      return this.year !== before
    }
    this.holdT += dt
    let rate = 0
    for (const s of DIAL_SPEEDS) if (this.holdT >= s.after) rate = s.rate
    if (this.holdT < DIAL_SPEEDS[1].after) rate = 0
    if (Math.abs(this.year - this.target) <= 30) rate = Math.min(rate, 8)
    this.frac += rate * dt
    const n = Math.floor(this.frac)
    if (n > 0) {
      this.frac -= n
      this.year = clamp(this.year + dir * n, this.min, this.max)
    }
    return this.year !== before
  }

  /** 目当ての年とのずれ（年） */
  get offset(): number {
    return this.year - this.target
  }

  /** そろい具合 0..1 */
  get match(): number {
    const d = this.offset / 6
    return Math.exp(-d * d)
  }

  /** 波のずれ -1..1（そろうと 0） */
  get detune(): number {
    return clamp(this.offset / 40, -1, 1)
  }

  /** ぴったりそろった（F で決められる） */
  get locked(): boolean {
    return this.offset === 0
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x
}
