// 1186年の仕掛けの純粋な計算（描画・物理に依存しない。tests/khmer1186.test.ts）。
// ・回る鏡の台（TurntableLogic）：ゆっくり回り続け、止める（setFrozen）と今の角度で止まる。正しい角度か（aligned）
// ・落ちてくる石（StoneFallLogic）：上で少しゆれてから道すじにそって落ち、下で消えてまた上から。止めるとその場で止まる
// ・道すじの往復（PingPongWalker）：象が道を行ったり来たりする（端で少し待つ）
// ・大階段の区切り（stairSegment）・線分と箱の交わり（segmentHitsBox）
import * as THREE from 'three'
import { K } from './layout'

const TAU = Math.PI * 2

/** -π..π に収める */
export function wrapAngle(a: number): number {
  let x = (a + Math.PI) % TAU
  if (x < 0) x += TAU
  return x - Math.PI
}

/** a から b への角度の差（-π..π） */
export function angleDiff(a: number, b: number): number {
  return wrapAngle(b - a)
}

// ------------------------------------------------------------------ 回る鏡の台

export class TurntableLogic {
  /** 今の角度（rad、上から見て反時計回り） */
  angle: number
  /** 回る速さ（rad/s） */
  speed: number
  /** 正しい角度（光の筋が塔の上の台へ届く） */
  readonly correct: number
  /** 正しいとみなす幅（±rad） */
  tolerance: number
  frozen = false

  constructor(correct: number, opts: { start?: number; speed?: number; tolerance?: number } = {}) {
    this.correct = correct
    this.angle = wrapAngle(opts.start ?? correct + Math.PI * 0.8)
    this.speed = opts.speed ?? 0.42
    this.tolerance = opts.tolerance ?? (9 * Math.PI) / 180
  }

  update(dt: number): void {
    if (this.frozen) return
    this.angle = wrapAngle(this.angle + this.speed * dt)
  }

  /** 正しい角度からのずれ（rad、-π..π） */
  get error(): number {
    return angleDiff(this.correct, this.angle)
  }

  /** 今の角度が正しい幅の中か */
  get aligned(): boolean {
    return Math.abs(this.error) <= this.tolerance
  }

  /** 次に正しい角度を通るまでの秒数（止めるタイミングの案内用。止まっていれば Infinity） */
  secondsToAligned(): number {
    if (this.frozen || this.speed === 0) return Infinity
    let d = angleDiff(this.angle, this.correct)
    if (this.speed > 0 && d < 0) d += TAU
    if (this.speed < 0 && d > 0) d -= TAU
    return d / this.speed
  }
}

// ------------------------------------------------------------------ 落ちてくる石

export type StonePhase = 'hidden' | 'wobble' | 'fall' | 'fade'

export type StoneFallOptions = {
  /** 道すじ（石の中心）。最初が上（現れる所）、最後が下（消える所） */
  path: readonly THREE.Vector3[]
  /** 落ちる速さ（m/s、道すじにそって） */
  speed?: number
  /** 上でゆれる秒数 */
  wobble?: number
  /** 下で消える秒数 */
  fade?: number
  /** 次に現れるまでの秒数 */
  gap?: number
  /** 止めると足場になる高さの範囲（石の上面の y）。この中で止めれば「ちょうどいい」 */
  window?: { y0: number; y1: number }
  /** 石の高さの半分（上面 = 中心 + half） */
  half?: number
  /** くり返す（false なら 1 回落ちて消えたら終わり） */
  loop?: boolean
  /** 始まりの遅れ（秒）。複数の石をずらす */
  delay?: number
  /**
   * 下に着いた所（道すじの 2 つめの点）で止まっている秒数。足場にちょうどいい高さで少し休むので、
   * 子どもでも止める（J）のが間に合う。0 なら休まずに転がり落ちる
   */
  rest?: number
}

export class StoneFallLogic {
  readonly path: THREE.Vector3[]
  speed: number
  wobble: number
  fade: number
  gap: number
  window: { y0: number; y1: number } | null
  half: number
  loop: boolean
  rest: number
  phase: StonePhase = 'hidden'
  /** 今の段階の経過秒 */
  t = 0
  /** 道すじにそった距離（m） */
  s = 0
  frozen = false
  /** 動いているか（false：止めた／隠れている） */
  active = true
  readonly pos = new THREE.Vector3()
  private readonly lengths: number[] = []
  readonly total: number
  /** 下で休んでいる残りの秒（休みは 1 回の落下で 1 度だけ） */
  private restLeft = 0
  private rested = false

  constructor(o: StoneFallOptions) {
    this.path = o.path.map((p) => p.clone())
    this.speed = o.speed ?? 1.6
    this.wobble = o.wobble ?? 1.2
    this.fade = o.fade ?? 0.6
    this.gap = o.gap ?? 1.2
    this.window = o.window ?? null
    this.half = o.half ?? 0.32
    this.loop = o.loop ?? true
    this.rest = o.rest ?? 0
    let total = 0
    for (let i = 0; i < this.path.length - 1; i++) {
      const l = this.path[i].distanceTo(this.path[i + 1])
      this.lengths.push(l)
      total += l
    }
    this.total = total
    this.t = -(o.delay ?? 0)
    this.pos.copy(this.path[0])
  }

  /** 道すじの距離 s の点 */
  sample(s: number, out = new THREE.Vector3()): THREE.Vector3 {
    let d = Math.max(0, Math.min(this.total, s))
    for (let i = 0; i < this.lengths.length; i++) {
      const l = this.lengths[i]
      if (d <= l || i === this.lengths.length - 1) return out.lerpVectors(this.path[i], this.path[i + 1], l > 1e-6 ? Math.min(1, d / l) : 1)
      d -= l
    }
    return out.copy(this.path[this.path.length - 1])
  }

  /** 石の上面の高さ */
  get top(): number {
    return this.pos.y + this.half
  }

  /** 見えていて、止められる（ゆれている・落ちている）か */
  get catchable(): boolean {
    return this.active && (this.phase === 'wobble' || this.phase === 'fall')
  }

  /** 今止めれば足場にちょうどいい高さか */
  get inWindow(): boolean {
    if (!this.window || this.phase !== 'fall') return false
    const y = this.top
    return y >= this.window.y0 && y <= this.window.y1
  }

  /** 下で休んでいるか */
  get resting(): boolean {
    return this.restLeft > 0
  }

  /** 最初から（上でゆれるところから）やり直す */
  restart(delay = 0): void {
    this.phase = 'hidden'
    this.t = -delay
    this.s = 0
    this.restLeft = 0
    this.rested = false
    this.frozen = false
    this.active = true
    this.pos.copy(this.path[0])
  }

  /** 止める（止めている間は動かない） */
  setFrozen(on: boolean): void {
    this.frozen = on
  }

  /** 進める。段階が変わったら新しい段階を返す */
  update(dt: number): StonePhase | null {
    if (this.frozen || !this.active) return null
    const before = this.phase
    this.t += dt
    switch (this.phase) {
      case 'hidden':
        if (this.t >= 0) this.enter('wobble')
        break
      case 'wobble':
        if (this.t >= this.wobble) this.enter('fall')
        break
      case 'fall': {
        if (this.restLeft > 0) {
          this.restLeft = Math.max(0, this.restLeft - dt)
          break
        }
        // 落ちはじめはゆっくり（足場にしやすい）
        const k = Math.min(1, this.t / 0.6)
        const s0 = this.s
        this.s += this.speed * (0.35 + 0.65 * k) * dt
        // 下に着いたら、少し休む
        const at = this.lengths[0] ?? 0
        if (this.rest > 0 && !this.rested && s0 < at && this.s >= at) {
          this.s = at
          this.rested = true
          this.restLeft = this.rest
          break
        }
        if (this.s >= this.total) {
          this.s = this.total
          this.enter('fade')
        }
        break
      }
      case 'fade':
        if (this.t >= this.fade) {
          if (this.loop) {
            this.phase = 'hidden'
            this.t = -this.gap
            this.s = 0
            this.rested = false
          } else {
            this.active = false
          }
        }
        break
    }
    this.sample(this.s, this.pos)
    return this.phase !== before ? this.phase : null
  }

  private enter(p: StonePhase): void {
    this.phase = p
    this.t = 0
  }
}

// ------------------------------------------------------------------ 道すじの往復（象）

export class PingPongWalker {
  readonly points: THREE.Vector3[]
  speed: number
  wait: number
  /** 道すじにそった距離 */
  s = 0
  /** 1：先へ、-1：もどる */
  dir: 1 | -1 = 1
  waitT = 0
  readonly total: number
  private readonly lengths: number[] = []
  readonly pos = new THREE.Vector3()
  /** 進む向き（水平の単位ベクトル。待っている間も最後の向き） */
  readonly heading = new THREE.Vector3(0, 0, -1)
  /** 止めている（足場として乗っている間に止めるなど。今は使わない） */
  paused = false

  constructor(points: readonly THREE.Vector3[], speed: number, wait: number, startS = 0) {
    this.points = points.map((p) => p.clone())
    this.speed = speed
    this.wait = wait
    let total = 0
    for (let i = 0; i < this.points.length - 1; i++) {
      const l = this.points[i].distanceTo(this.points[i + 1])
      this.lengths.push(l)
      total += l
    }
    this.total = total
    this.s = Math.max(0, Math.min(total, startS))
    this.sampleTo(this.s, this.pos)
    this.updateHeading()
  }

  /** 歩いているか（端で待っている間は false） */
  get moving(): boolean {
    return this.waitT <= 0 && !this.paused
  }

  sampleTo(s: number, out: THREE.Vector3): THREE.Vector3 {
    let d = Math.max(0, Math.min(this.total, s))
    for (let i = 0; i < this.lengths.length; i++) {
      const l = this.lengths[i]
      if (d <= l || i === this.lengths.length - 1) return out.lerpVectors(this.points[i], this.points[i + 1], l > 1e-6 ? Math.min(1, d / l) : 1)
      d -= l
    }
    return out.copy(this.points[this.points.length - 1])
  }

  update(dt: number): void {
    if (this.paused) return
    if (this.waitT > 0) {
      this.waitT -= dt
      if (this.waitT <= 0) this.updateHeading()
      return
    }
    this.s += this.dir * this.speed * dt
    if (this.s >= this.total) {
      this.s = this.total
      this.dir = -1
      this.waitT = this.wait
    } else if (this.s <= 0) {
      this.s = 0
      this.dir = 1
      this.waitT = this.wait
    }
    this.sampleTo(this.s, this.pos)
    if (this.waitT <= 0) this.updateHeading()
  }

  private readonly tmp = new THREE.Vector3()
  private updateHeading(): void {
    const ahead = this.sampleTo(Math.max(0, Math.min(this.total, this.s + this.dir * 0.6)), this.tmp)
    const dx = ahead.x - this.pos.x
    const dz = ahead.z - this.pos.z
    const l = Math.hypot(dx, dz)
    if (l > 1e-4) this.heading.set(dx / l, 0, dz / l)
  }
}

// ------------------------------------------------------------------ 大階段

/** 大階段の区切り i（0 が下）の範囲：x（西→東）と高さ。区切りがくずれると、上面は y0 の平らな所になる */
export function stairSegment(i: number): { x0: number; x1: number; y0: number; y1: number } {
  const S = K.STAIRS
  return { x0: S.x0 + S.run * i, x1: S.x0 + S.run * (i + 1), y0: S.rise * i, y1: S.rise * (i + 1) }
}

/** 大階段の坂の角度（rad） */
export function stairSlope(): number {
  return Math.atan2(K.STAIRS.rise, K.STAIRS.run)
}

// ------------------------------------------------------------------ 光の筋と箱（テスト・配置の確かめ）

export type AABB = { min: THREE.Vector3; max: THREE.Vector3 }

/** 線分 a→b が箱を通るか（スラブ法） */
export function segmentHitsBox(a: THREE.Vector3, b: THREE.Vector3, box: AABB): boolean {
  let t0 = 0
  let t1 = 1
  const d = [b.x - a.x, b.y - a.y, b.z - a.z]
  const o = [a.x, a.y, a.z]
  const mn = [box.min.x, box.min.y, box.min.z]
  const mx = [box.max.x, box.max.y, box.max.z]
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-9) {
      if (o[k] < mn[k] || o[k] > mx[k]) return false
      continue
    }
    let ta = (mn[k] - o[k]) / d[k]
    let tb = (mx[k] - o[k]) / d[k]
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}
