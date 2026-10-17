// ワイヤー式「つかむNMClaw」の純粋なロジック（操作マニュアル v1.1 §1.1・§2.1・§2.2・§8.3〜8.4）。
// ・対象の種類（データ）：pull_object / pull_player / swing_anchor / hold_mechanism
// ・中央照準の自動選択（スコア）と R によるロック切り替え
// ・J で射出 → 接続 → もう一度 J で解除（長押し不要）。Space はぶら下がり・引き寄せ中の離脱
// ・引き寄せは決められた曲線、振り子は許可した支点だけで軽量に（ロープの物理演算はしない）
// 描画・物理エンジン・DOM には依存しない（THREE.Vector3 は数学のためだけに使う）。
import * as THREE from 'three'
import { ClawEvent, ClawStateMachine } from '../core/clawStateMachine'

export type ClawTargetType = 'pull_object' | 'pull_player' | 'swing_anchor' | 'hold_mechanism'

/** 照準の見た目の分類（マニュアル §7：軽い物／固定支点／協力装置） */
export type TargetCategory = 'light' | 'anchor' | 'mechanism'

export const TARGET_CATEGORY: Record<ClawTargetType, TargetCategory> = {
  pull_object: 'light',
  pull_player: 'anchor',
  swing_anchor: 'anchor',
  hold_mechanism: 'mechanism',
}

export type ClawTargetDef = {
  id: string
  type: ClawTargetType
  /** HUD に出す名前（「木箱」「金具」「大歯車」など） */
  label: string
  /** 爪が接続する点（ワールド）。pull_object は物と一緒に動く */
  point: THREE.Vector3
  /** 見た目のおおよその半径（照準の枠・視線チェックの許容） */
  radius: number
  enabled: boolean
  /** この向きの側からだけ狙える（壁の裏から金具を狙えないように） */
  facing?: THREE.Vector3
  /** 視線（遮蔽）チェックをしない大きな仕掛け */
  noLineOfSight?: boolean
  /** 射程の上書き（m） */
  range?: number
  /** pull_player：着地点（足元） */
  landing?: THREE.Vector3
  /** pull_player：途中で必ず通る点（手すりや屋根を越えるため） */
  via?: THREE.Vector3
  /** swing_anchor：ぶら下がるワイヤーの長さ（m） */
  ropeLength?: number
  /** 飛び移りに失敗して落ちたときの復帰地点（近い方を使う） */
  checkpoints?: THREE.Vector3[]
}

/** 調整値（プレイテストで調整する試作値） */
export const CLAW_TUNING = {
  /** 射程（m）。胸の高さから接続点まで */
  range: 10,
  /** ワイヤーが伸びる速さ（m/s） */
  wireSpeed: 34,
  /** 戻る速さ（m/s） */
  retractSpeed: 40,
  /** 軽い物が手元へ飛んでくる速さ（m/s） */
  pullSpeed: 11,
  /** 自分が支点へ引き寄せられる速さ（m/s、経路長に対して） */
  zipSpeed: 11,
  /** 照準の吸い付き範囲（画面中央からの正規化座標。1 = 画面端） */
  coneX: 0.42,
  coneY: 0.62,
  /** スコアの重み：中央からの近さ と 距離 */
  centerWeight: 0.75,
  distanceWeight: 0.25,
}

// ------------------------------------------------------------------ 照準（自動選択とロック）

/** カメラの基底（中央照準の向き）。tanHalfX/Y は水平・垂直の半画角の tan */
export type ViewBasis = {
  origin: THREE.Vector3
  forward: THREE.Vector3
  right: THREE.Vector3
  up: THREE.Vector3
  tanHalfX: number
  tanHalfY: number
}

export type TargetView = {
  def: ClawTargetDef
  /** 画面上の位置（-1〜1、中央が 0） */
  ndcX: number
  ndcY: number
  /** 胸から接続点までの距離 */
  distance: number
  inCone: boolean
  inRange: boolean
  facingOk: boolean
  visible: boolean
  /** 狙える（すべての条件を満たす） */
  valid: boolean
  /** 小さいほど優先 */
  score: number
}

const tmp = new THREE.Vector3()

/** 点を画面座標へ（カメラの後ろなら null） */
export function viewOf(basis: ViewBasis, p: THREE.Vector3): { x: number; y: number; depth: number } | null {
  tmp.subVectors(p, basis.origin)
  const depth = tmp.dot(basis.forward)
  if (depth <= 0.05) return null
  return { x: tmp.dot(basis.right) / depth / basis.tanHalfX, y: tmp.dot(basis.up) / depth / basis.tanHalfY, depth }
}

/**
 * 1 つの対象を評価する。los は「胸から接続点まで遮るものが無いか」を外から渡す関数
 * （物理エンジン側の仕事）。画面外・カメラの後ろは null。
 */
export function evaluateTarget(
  def: ClawTargetDef,
  basis: ViewBasis,
  chest: THREE.Vector3,
  los: (def: ClawTargetDef, distance: number) => boolean = () => true,
  tuning = CLAW_TUNING,
): TargetView | null {
  if (!def.enabled) return null
  const v = viewOf(basis, def.point)
  if (!v) return null
  const ex = v.x / tuning.coneX
  const ey = v.y / tuning.coneY
  const ell = Math.hypot(ex, ey)
  const inCone = ell <= 1
  if (Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) return null
  const distance = chest.distanceTo(def.point)
  const range = def.range ?? tuning.range
  const inRange = distance <= range
  let facingOk = true
  if (def.facing) {
    tmp.subVectors(chest, def.point)
    facingOk = tmp.dot(def.facing) > 0
  }
  const visible = inCone && inRange && facingOk && (def.noLineOfSight ? true : los(def, distance))
  const valid = inCone && inRange && facingOk && visible
  const score = ell * tuning.centerWeight + (distance / range) * tuning.distanceWeight
  return { def, ndcX: v.x, ndcY: v.y, distance, inCone, inRange, facingOk, visible, valid, score }
}

/** 狙える対象をスコア順に並べる */
export function rankTargets(views: ReadonlyArray<TargetView | null>): TargetView[] {
  return views.filter((v): v is TargetView => v !== null && v.valid).sort((a, b) => a.score - b.score || a.def.id.localeCompare(b.def.id))
}

/** ロック中の対象が狙えるならそれ、なければ最もスコアの良い対象（自動照準） */
export function chooseTarget(ranked: readonly TargetView[], lockedId: string | null): TargetView | null {
  if (lockedId) {
    const locked = ranked.find((v) => v.def.id === lockedId)
    if (locked) return locked
  }
  return ranked[0] ?? null
}

/** R：今の対象の次（スコア順）にロックを移す。候補が 1 つ以下なら変えない */
export function cycleLock(ranked: readonly TargetView[], currentId: string | null): string | null {
  if (ranked.length === 0) return null
  if (ranked.length === 1) return ranked[0].def.id
  const i = ranked.findIndex((v) => v.def.id === currentId)
  return ranked[(i + 1) % ranked.length].def.id
}

/** 画面内にあるが射程外の対象（「遠い」表示用）。狙える対象が無いときだけ使う。遠すぎるものは出さない */
export function nearestOutOfRange(views: ReadonlyArray<TargetView | null>, maxDistance = CLAW_TUNING.range * 1.6): TargetView | null {
  let best: TargetView | null = null
  for (const v of views) {
    if (!v || v.valid || !v.inCone || v.inRange || !v.facingOk || v.distance > maxDistance) continue
    if (!best || v.score < best.score) best = v
  }
  return best
}

// ------------------------------------------------------------------ ワイヤーの状態

export type WirePhase =
  | 'idle'
  | 'firing' // ワイヤーが対象へ伸びている
  | 'miss' // 空振り（伸びて戻る）
  | 'reeling' // pull_object：物が手元へ飛んでくる
  | 'carrying' // pull_object：手元で持っている（J で置く）
  | 'zipping' // pull_player：支点へ引き寄せられている
  | 'swinging' // swing_anchor：ぶら下がっている
  | 'holding' // hold_mechanism：仕掛けを支えている
  | 'retracting' // 爪を外して戻している

export type WireEvent =
  | { kind: 'fired'; target: ClawTargetDef }
  | { kind: 'missed' }
  | { kind: 'connected'; target: ClawTargetDef }
  | { kind: 'object_arrived'; target: ClawTargetDef }
  | { kind: 'dropped'; target: ClawTargetDef }
  | { kind: 'arrived'; target: ClawTargetDef }
  | { kind: 'detached'; target: ClawTargetDef; byJump: boolean }
  | { kind: 'released'; target: ClawTargetDef }
  | { kind: 'retracted' }

export class WireClaw {
  /** 基本の状態遷移（core の ClawStateMachine：GRABBING＝伸びている、HOLDING＝接続中、RELEASING＝戻り） */
  readonly base = new ClawStateMachine()
  phase: WirePhase = 'idle'
  target: ClawTargetDef | null = null
  /** 射出時の距離（m） */
  distance = 0
  /** 時間で進む段階（reeling / zipping）の経過と長さ */
  elapsed = 0
  duration = 0
  private readonly tuning: typeof CLAW_TUNING

  constructor(tuning = CLAW_TUNING) {
    this.tuning = tuning
  }

  /** 接続中（対象につながっている） */
  isConnected(): boolean {
    return this.phase === 'reeling' || this.phase === 'carrying' || this.phase === 'zipping' || this.phase === 'swinging' || this.phase === 'holding'
  }

  /** ワイヤーで自分が移動中（異次元拠点を開けない・通常の移動を止める） */
  isWireMoving(): boolean {
    return this.phase === 'zipping' || this.phase === 'swinging'
  }

  /** 段階の進み具合 0〜1（reeling / zipping / firing / retracting / miss） */
  get progress(): number {
    if (this.phase === 'reeling' || this.phase === 'zipping') return this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1
    if (this.phase === 'firing' || this.phase === 'retracting' || this.phase === 'miss') {
      const total = this.duration
      return total > 0 ? Math.min(1, Math.max(0, 1 - this.base.timer / total)) : 1
    }
    return this.isConnected() ? 1 : 0
  }

  /** ワイヤーの伸び具合 0〜1（見た目用） */
  get wireOut(): number {
    switch (this.phase) {
      case 'firing':
        return this.progress
      case 'retracting':
        return 1 - this.progress
      case 'miss': {
        const p = this.progress
        return p < 0.5 ? p * 2 : (1 - p) * 2
      }
      case 'idle':
        return 0
      default:
        return 1
    }
  }

  /**
   * J（claw_fire）。待機中なら射出（対象が無ければ空振り）、接続中なら解除。
   * 伸びている途中・戻っている途中は無視する（連打で状態が壊れない）。
   */
  press(target: ClawTargetDef | null, distance: number): WireEvent[] {
    switch (this.phase) {
      case 'idle': {
        if (target) {
          this.target = target
          this.distance = distance
          this.duration = Math.max(0.06, distance / this.tuning.wireSpeed)
          this.base.fire(true, this.duration)
          this.phase = 'firing'
          return [{ kind: 'fired', target }]
        }
        this.target = null
        this.distance = 0
        this.duration = this.base.fire(false) ? this.base.timer : 0
        this.phase = 'miss'
        return [{ kind: 'missed' }]
      }
      case 'carrying':
        return this.detach('dropped')
      case 'holding':
        return this.detach('released')
      case 'zipping':
      case 'swinging':
        return this.detach('detached', false)
      case 'reeling':
        // 飛んでくる途中で離すと、その場に落とす
        return this.detach('dropped')
      default:
        return []
    }
  }

  /** Space（jump）。ぶら下がり・引き寄せ中なら勢いを残して離脱し true（ジャンプには使わない） */
  jump(): { consumed: boolean; events: WireEvent[] } {
    if (this.phase === 'swinging' || this.phase === 'zipping') return { consumed: true, events: this.detach('detached', true) }
    return { consumed: false, events: [] }
  }

  /** 強制的に外す（復帰・ショット切り替えなど）。イベントは出さず、すぐ待機に戻る */
  reset(): void {
    this.base.reset()
    this.phase = 'idle'
    this.target = null
    this.elapsed = 0
    this.duration = 0
  }

  tick(dt: number): WireEvent[] {
    const out: WireEvent[] = []
    const ev = this.base.tick(dt, false)
    switch (this.phase) {
      case 'firing':
        if (ev === ClawEvent.HOLD_STARTED && this.target) {
          out.push({ kind: 'connected', target: this.target })
          this.connect(this.target)
        }
        break
      case 'reeling':
        this.elapsed += dt
        if (this.elapsed >= this.duration && this.target) {
          this.phase = 'carrying'
          out.push({ kind: 'object_arrived', target: this.target })
        }
        break
      case 'zipping':
        this.elapsed += dt
        if (this.elapsed >= this.duration && this.target) {
          out.push({ kind: 'arrived', target: this.target })
          this.startRetract(0.6)
        }
        break
      case 'retracting':
      case 'miss':
        if (ev === ClawEvent.RELEASE_FINISHED) {
          this.phase = 'idle'
          this.target = null
          out.push({ kind: 'retracted' })
        }
        break
    }
    return out
  }

  private connect(t: ClawTargetDef): void {
    this.elapsed = 0
    switch (t.type) {
      case 'pull_object':
        this.phase = 'reeling'
        this.duration = Math.max(0.28, this.distance / this.tuning.pullSpeed)
        break
      case 'pull_player':
        this.phase = 'zipping'
        // 経路は直線より長い（手すり越えの山なり）ので 1.25 倍で見積もる
        this.duration = Math.max(0.45, (this.distance * 1.25) / this.tuning.zipSpeed)
        break
      case 'swing_anchor':
        this.phase = 'swinging'
        this.duration = 0
        break
      case 'hold_mechanism':
        this.phase = 'holding'
        this.duration = 0
        break
    }
  }

  private detach(kind: 'dropped' | 'released' | 'detached', byJump = false): WireEvent[] {
    const t = this.target
    if (!t) return []
    const ev: WireEvent = kind === 'detached' ? { kind, target: t, byJump } : { kind, target: t }
    // 戻る長さ：手元で持っている物は短く、遠くの支点は長く
    const len = this.phase === 'carrying' ? 0.6 : this.distance
    this.startRetract(len)
    return [ev]
  }

  private startRetract(length: number): void {
    this.base.release()
    this.duration = Math.max(0.12, length / this.tuning.retractSpeed)
    this.base.timer = this.duration
    this.phase = 'retracting'
  }
}

// ------------------------------------------------------------------ 決まった曲線（引き寄せ）

export const easeInOut = (t: number): number => {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

/** p0 → p2 の 2 次ベジェ曲線で、t=0.5 のとき via を通るもの */
export function quadThrough(p0: THREE.Vector3, via: THREE.Vector3, p2: THREE.Vector3, t: number, out = new THREE.Vector3()): THREE.Vector3 {
  // 制御点 c = 2*via - (p0 + p2) / 2
  const cx = 2 * via.x - (p0.x + p2.x) / 2
  const cy = 2 * via.y - (p0.y + p2.y) / 2
  const cz = 2 * via.z - (p0.z + p2.z) / 2
  const a = (1 - t) * (1 - t)
  const b = 2 * (1 - t) * t
  const c = t * t
  return out.set(a * p0.x + b * cx + c * p2.x, a * p0.y + b * cy + c * p2.y, a * p0.z + b * cz + c * p2.z)
}

/** pull_player の経路上の足元の位置（u は 0〜1 の時間割合。加減速つき） */
export function zipPosition(start: THREE.Vector3, def: ClawTargetDef, u: number, out = new THREE.Vector3()): THREE.Vector3 {
  const landing = def.landing ?? def.point
  const via = def.via ?? new THREE.Vector3().addVectors(start, landing).multiplyScalar(0.5).add(new THREE.Vector3(0, 1.2, 0))
  return quadThrough(start, via, landing, easeInOut(u), out)
}

/** pull_object の飛ぶ位置：from → to の山なり（lift はふくらみの高さ） */
export function arcPosition(from: THREE.Vector3, to: THREE.Vector3, u: number, lift: number, out = new THREE.Vector3()): THREE.Vector3 {
  const t = easeInOut(u)
  out.lerpVectors(from, to, t)
  out.y += Math.sin(Math.PI * t) * lift
  return out
}

// ------------------------------------------------------------------ 振り子（許可した支点だけ）

export const SWING_TUNING = {
  gravity: 17, // プレイヤーの重力に合わせる
  /** WASD で揺らす加速度（m/s²、接線方向だけ） */
  pumpAccel: 3.2,
  /** ワイヤーを巻き取る速さ（m/s） */
  reelSpeed: 9,
  /** 真下からの最大角（これ以上は上がらない。上げすぎると対岸を飛び越えるほど速くなる） */
  maxAngle: (72 * Math.PI) / 180,
  damping: 0.06,
  /** 離脱時：上向きに足す速さと、水平の勢いの倍率 */
  releaseUpBoost: 3.2,
  releaseHorizontalScale: 1.12,
}

/** 支点からぶら下がった点（胸の位置）の運動。剛体のロープは使わず、球面への拘束で近似する。 */
export class Pendulum {
  readonly anchor: THREE.Vector3
  readonly pos: THREE.Vector3
  readonly vel: THREE.Vector3
  length: number
  readonly ropeLength: number
  private readonly cfg: typeof SWING_TUNING
  private readonly r = new THREE.Vector3()
  private readonly t = new THREE.Vector3()

  constructor(anchor: THREE.Vector3, ropeLength: number, startPos: THREE.Vector3, startVel: THREE.Vector3, cfg = SWING_TUNING) {
    this.anchor = anchor.clone()
    this.pos = startPos.clone()
    this.vel = startVel.clone()
    this.ropeLength = ropeLength
    this.length = Math.max(0.5, startPos.distanceTo(anchor))
    this.cfg = cfg
  }

  /** 真下からの角度（rad） */
  angle(): number {
    this.r.subVectors(this.pos, this.anchor)
    const len = this.r.length()
    if (len < 1e-6) return 0
    return Math.acos(Math.min(1, Math.max(-1, -this.r.y / len)))
  }

  /** push は水平の入力方向（長さ 0〜1、ワールド座標）。接線方向の成分だけが効く */
  step(dt: number, push: THREE.Vector3): void {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)))
    const h = dt / n
    const cfg = this.cfg
    for (let i = 0; i < n; i++) {
      // 巻き取り（長いときは縮め、短いときは伸ばす）
      const dl = this.ropeLength - this.length
      const maxStep = cfg.reelSpeed * h
      this.length += Math.max(-maxStep, Math.min(maxStep, dl))
      this.vel.y -= cfg.gravity * h
      this.r.subVectors(this.pos, this.anchor)
      const rl = this.r.length()
      if (rl > 1e-6) this.r.multiplyScalar(1 / rl)
      // 入力：接線方向だけ
      this.t.copy(push).multiplyScalar(cfg.pumpAccel)
      this.t.addScaledVector(this.r, -this.t.dot(this.r))
      this.vel.addScaledVector(this.t, h)
      this.vel.multiplyScalar(1 - cfg.damping * h)
      this.pos.addScaledVector(this.vel, h)
      // ロープは伸びない（たるみは許す）
      this.r.subVectors(this.pos, this.anchor)
      const d = this.r.length()
      if (d > this.length && d > 1e-6) {
        this.r.multiplyScalar(1 / d)
        this.pos.copy(this.anchor).addScaledVector(this.r, this.length)
        const vr = this.vel.dot(this.r)
        if (vr > 0) this.vel.addScaledVector(this.r, -vr)
      }
      this.clampAngle()
    }
  }

  /** 離脱するときの速度（勢いを残す＋少し上へ） */
  releaseVelocity(out = new THREE.Vector3()): THREE.Vector3 {
    out.copy(this.vel)
    out.x *= this.cfg.releaseHorizontalScale
    out.z *= this.cfg.releaseHorizontalScale
    out.y = Math.max(out.y, 0) + this.cfg.releaseUpBoost
    return out
  }

  private clampAngle(): void {
    const max = this.cfg.maxAngle
    this.r.subVectors(this.pos, this.anchor)
    const len = this.r.length()
    if (len < 1e-6) return
    const cos = -this.r.y / len
    if (cos >= Math.cos(max)) return
    const hx = this.r.x
    const hz = this.r.z
    const hl = Math.hypot(hx, hz)
    if (hl < 1e-6) return
    const ux = hx / hl
    const uz = hz / hl
    const s = Math.sin(max)
    const c = Math.cos(max)
    this.pos.set(this.anchor.x + ux * s * len, this.anchor.y - c * len, this.anchor.z + uz * s * len)
    // 角度が増える向きの接線 t = (u*cos, sin, u*cos)
    this.t.set(ux * c, s, uz * c)
    const vt = this.vel.dot(this.t)
    if (vt > 0) this.vel.addScaledVector(this.t, -vt)
  }
}
