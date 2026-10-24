// 年代ダイヤルの遊び（物語 v7 の 8・10 章）：ダイヤルを回して、行ける年（光る目もり）に合わせる → 「この年へ行く」。
// 純粋なロジック（tests/chronicle2086Additions.test.ts）。画面は yearDialPanel.ts、音は yearDialSound.ts。
// ・キー（← →）：押した瞬間は 1 年、押し続けると速くなる（1 → 12 → 80 → 260 年／秒）。目当ての年に近づくと、ゆっくりになる
// ・目当ての年を通りこしそうになったら、そこでぴたりと止まる（いったん離すまで、その向きには動かない）＝子どもでも合わせられる
// ・指でなぞる（setYear）：目当ての年の近く（角度で 7° 以内）なら、すいつく
// ・目もりの角度：ダイヤルは上が 0°、時計回りが +。昔が左、今が右（年の間かくは、行ける年が見やすいように区切りごとに変える）

export type YearDialOptions = { start: number; target: number; min?: number; max?: number }

export const DIAL_SPEEDS = [
  { after: 0, rate: 1 },
  { after: 0.3, rate: 12 },
  { after: 0.9, rate: 80 },
  { after: 1.6, rate: 260 },
] as const

/** 目もりの角度の区切り（年 → 角度°）。間は直線で結ぶ */
export const DIAL_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [1100, -130],
  [1186, -100],
  [1726, 0],
  [2026, 85],
  [2086, 130],
]

/** 指でなぞったとき、目当ての年にすいつく角度（°） */
export const DIAL_SNAP_DEG = 7

/** 年 → ダイヤルの角度（°。上が 0、時計回りが +） */
export function yearToAngle(year: number): number {
  const A = DIAL_ANCHORS
  if (year <= A[0][0]) return A[0][1]
  for (let i = 1; i < A.length; i++) {
    const [y1, a1] = A[i]
    const [y0, a0] = A[i - 1]
    if (year <= y1) return a0 + ((year - y0) / (y1 - y0)) * (a1 - a0)
  }
  return A[A.length - 1][1]
}

/** ダイヤルの角度（°）→ 年（整数）。はしは止まる */
export function angleToYear(deg: number): number {
  const A = DIAL_ANCHORS
  if (deg <= A[0][1]) return A[0][0]
  for (let i = 1; i < A.length; i++) {
    const [y1, a1] = A[i]
    const [y0, a0] = A[i - 1]
    if (deg <= a1) return Math.round(y0 + ((deg - a0) / (a1 - a0)) * (y1 - y0))
  }
  return A[A.length - 1][0]
}

export class YearDialLogic {
  year: number
  target: number
  readonly min: number
  readonly max: number
  private holdT = 0
  private holdDir = 0
  private frac = 0
  /** 目当ての年でぴたりと止まった向き（離すまで、この向きには動かない） */
  private stopDir = 0

  constructor(o: YearDialOptions) {
    this.min = o.min ?? 1100
    this.max = o.max ?? 2086
    this.year = clamp(Math.round(o.start), this.min, this.max)
    this.target = o.target
  }

  /** 1 年だけ回す */
  step(dir: -1 | 1): void {
    this.year = clamp(this.year + dir, this.min, this.max)
  }

  /**
   * 押し続けている間、毎フレーム呼ぶ（dir：-1 左＝昔へ・+1 右＝今へ・0 離した）。押した瞬間は 1 年、そのあと速くなる。
   * 目当ての年を通りこすときは、そこで止まる。年が変わったら true
   */
  hold(dir: -1 | 0 | 1, dt: number): boolean {
    if (dir === 0) {
      this.holdT = 0
      this.holdDir = 0
      this.frac = 0
      this.stopDir = 0
      return false
    }
    if (dir === this.stopDir) return false
    this.stopDir = 0
    const before = this.year
    if (dir !== this.holdDir) {
      this.holdDir = dir
      this.holdT = 0
      this.frac = 0
      this.moveBy(dir, 1)
      return this.year !== before
    }
    this.holdT += dt
    let rate = 0
    for (const s of DIAL_SPEEDS) if (this.holdT >= s.after) rate = s.rate
    if (this.holdT < DIAL_SPEEDS[1].after) rate = 0
    // 目当ての年へ近づくときは、だんだんゆっくり（見ていて「もうすぐ」がわかる）
    const off = this.offset
    if (off !== 0 && Math.sign(off) === -dir) rate = Math.min(rate, 16 + Math.abs(off) * 3)
    this.frac += rate * dt
    const n = Math.floor(this.frac)
    if (n > 0) {
      this.frac -= n
      this.moveBy(dir, n)
    }
    return this.year !== before
  }

  /** 指でなぞった・タップした年へ（目当ての年の近くなら、すいつく）。年が変わったら true */
  setYear(y: number, snap = true): boolean {
    const before = this.year
    let next = clamp(Math.round(y), this.min, this.max)
    if (snap && Math.abs(yearToAngle(next) - yearToAngle(this.target)) <= DIAL_SNAP_DEG) next = this.target
    this.year = next
    return this.year !== before
  }

  /** 目当ての年とのずれ（年） */
  get offset(): number {
    return this.year - this.target
  }

  /** 目当ての年への近さ 0..1（ダイヤルの角度で。石の音の速さ・目もりの光に使う） */
  get near(): number {
    const d = Math.abs(yearToAngle(this.year) - yearToAngle(this.target))
    const k = Math.max(0, 1 - d / 120)
    return k * k
  }

  /** そろい具合 0..1（ずれ 0 で 1。3D のダイヤルの光） */
  get match(): number {
    const d = this.offset / 6
    return Math.exp(-d * d)
  }

  /** ぴったり合った（「この年へ行く」が押せる） */
  get locked(): boolean {
    return this.offset === 0
  }

  /** dir の向きに n 年。目当ての年を通りこすなら、そこで止める */
  private moveBy(dir: -1 | 1, n: number): void {
    const from = this.year
    let to = clamp(from + dir * n, this.min, this.max)
    const t = this.target
    if (from !== t && (from - t) * (to - t) <= 0) {
      to = t
      this.stopDir = dir
      this.frac = 0
    }
    this.year = to
  }
}

function clamp(x: number, a: number, b: number): number {
  return x < a ? a : x > b ? b : x
}
