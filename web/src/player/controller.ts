// 三人称のプレイヤー操作：KinematicCharacterController（段差の自動乗り越え・接地吸着）。
// 入力はキーではなくアクション（move はカメラ基準、jump、dash）で受け取る。
// ワイヤー移動（引き寄せ・振り子）の間は外部制御：重力と KCC の移動を止め、決められた位置へ置く。
// 離脱時は launch() で速度を引き継ぎ、空中では勢いを保つ。
import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { Physics } from './physics'
import type { Axis2 } from './inputActions'

const RADIUS = 0.27
const HALF = 0.25
const FOOT = HALF + RADIUS

export const MOVE_TUNING = {
  walk: 3.3,
  dash: 6.4,
  jump: 5.6,
  gravity: 17,
  groundAccel: 14,
  airAccel: 5,
  /** ワイヤーから離脱した後の空中：入力が無ければ勢いを保ち、入力はゆるやかに効く */
  momentumAirAccel: 1.6,
  momentumDrag: 0.08,
  /** これより低く落ちたら最後に立っていた場所へ戻す */
  killY: -1.3,
}

export type MoveIntent = {
  move: Axis2
  jump: boolean
  dash: boolean
}

export class PlayerController {
  readonly collider: RAPIER.Collider
  private readonly body: RAPIER.RigidBody
  private readonly cc: RAPIER.KinematicCharacterController
  private readonly phys: Physics
  readonly position = new THREE.Vector3()
  readonly velocity = new THREE.Vector3()
  facing = 0
  grounded = false
  speed = 0
  /** false のときは移動入力を受けない（仕掛けを支えている間など）。重力は効く */
  enabled = true
  /** true の間は外部（ワイヤー）が位置を決める */
  private external = false
  /** ワイヤー離脱後、着地するまで勢いを保つ */
  private momentum = false
  private jumpBuffer = 0
  private coyote = 0
  private readonly lastSafe = new THREE.Vector3()
  /** 水などに落ちて戻したとき */
  onRespawn: (() => void) | null = null
  /** 回避・踏み込み・吹き飛ばされ（combat/）：t 秒のあいだ水平の速さを固定する */
  private readonly burst = { x: 0, z: 0, t: 0 }

  constructor(phys: Physics, start: THREE.Vector3) {
    const R = phys.R
    this.phys = phys
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + FOOT, start.z))
    this.collider = phys.world.createCollider(R.ColliderDesc.capsule(HALF, RADIUS), this.body)
    this.cc = phys.world.createCharacterController(0.02)
    this.cc.enableAutostep(0.32, 0.15, false)
    this.cc.enableSnapToGround(0.3)
    this.cc.setMaxSlopeClimbAngle((52 * Math.PI) / 180)
    this.cc.setMinSlopeSlideAngle((60 * Math.PI) / 180)
    this.cc.setSlideEnabled(true)
    this.position.copy(start)
    this.lastSafe.copy(start)
  }

  get isExternal(): boolean {
    return this.external
  }

  /** 足元の位置へ瞬間移動 */
  teleport(p: THREE.Vector3, facing?: number): void {
    this.body.setTranslation({ x: p.x, y: p.y + FOOT, z: p.z }, true)
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + FOOT, z: p.z })
    this.position.copy(p)
    this.velocity.set(0, 0, 0)
    this.momentum = false
    this.burst.t = 0
    if (facing !== undefined) this.facing = facing
  }

  /** 回避・踏み込み・吹き飛ばされ：seconds 秒のあいだ水平の速さを (vx, vz) にする（移動の入力より優先。重力と壁は効く） */
  burstMove(vx: number, vz: number, seconds: number): void {
    this.burst.x = vx
    this.burst.z = vz
    this.burst.t = seconds
    this.momentum = false
  }

  /** 回避・踏み込みの途中か */
  get bursting(): boolean {
    return this.burst.t > 0
  }

  /** 最後に立っていた安全な場所を上書き（チェックポイント） */
  setCheckpoint(p: THREE.Vector3): void {
    this.lastSafe.copy(p)
  }

  /** ワイヤー移動の開始：重力と KCC の移動を止める */
  beginExternal(): void {
    this.external = true
    this.momentum = false
    this.jumpBuffer = 0
  }

  /** ワイヤー移動中：足元を p へ置く（衝突は見ない。決められた曲線・支点の上だけで使う） */
  moveExternal(p: THREE.Vector3, dt: number): void {
    if (dt > 1e-6) this.velocity.subVectors(p, this.position).multiplyScalar(1 / dt)
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + FOOT, z: p.z })
    this.phys.world.step()
    this.position.copy(p)
    this.grounded = false
    this.speed = Math.hypot(this.velocity.x, this.velocity.z)
    this.turnToward(this.velocity.x, this.velocity.z, dt, 8)
  }

  /** ワイヤー移動の終了。velocity を引き継いで空中へ（勢いを保つ） */
  endExternal(velocity?: THREE.Vector3): void {
    this.external = false
    if (velocity) {
      this.velocity.copy(velocity)
      this.momentum = true
    } else {
      this.velocity.set(0, 0, 0)
    }
    this.coyote = 0
  }

  update(dt: number, intent: MoveIntent, camYaw: number): void {
    if (this.external) return
    const step = Math.min(dt, 1 / 30)
    const T = MOVE_TUNING
    const mx = this.enabled ? intent.move.x : 0
    const mf = this.enabled ? intent.move.y : 0
    const len = Math.hypot(mx, mf)
    const target = len > 0 ? (intent.dash ? T.dash : T.walk) : 0
    // カメラ基準の方向（前 = カメラの向き）
    const fwdX = -Math.sin(camYaw)
    const fwdZ = -Math.cos(camYaw)
    const rgtX = Math.cos(camYaw)
    const rgtZ = -Math.sin(camYaw)
    let dx = 0
    let dz = 0
    if (len > 0) {
      dx = (fwdX * mf + rgtX * mx) / Math.max(1, len)
      dz = (fwdZ * mf + rgtZ * mx) / Math.max(1, len)
    }
    if (this.burst.t > 0) {
      this.burst.t -= step
      this.velocity.x = this.burst.x
      this.velocity.z = this.burst.z
    } else if (this.momentum && !this.grounded) {
      // 離脱の勢いを保つ：入力があるときだけゆるやかに向きを変える
      const drag = Math.max(0, 1 - T.momentumDrag * step)
      this.velocity.x *= drag
      this.velocity.z *= drag
      if (len > 0) {
        this.velocity.x += dx * T.walk * T.momentumAirAccel * step
        this.velocity.z += dz * T.walk * T.momentumAirAccel * step
      }
    } else {
      const accel = this.grounded ? T.groundAccel : T.airAccel
      this.velocity.x += (dx * target - this.velocity.x) * Math.min(1, accel * step)
      this.velocity.z += (dz * target - this.velocity.z) * Math.min(1, accel * step)
    }
    // ジャンプ（着地直前の先行入力とコヨーテタイム）
    if (this.enabled && intent.jump) this.jumpBuffer = 0.15
    this.jumpBuffer -= step
    this.coyote = this.grounded ? 0.12 : this.coyote - step
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.velocity.y = T.jump
      this.jumpBuffer = 0
      this.coyote = 0
    }
    this.velocity.y -= T.gravity * step
    if (this.velocity.y < -20) this.velocity.y = -20
    const desired = { x: this.velocity.x * step, y: this.velocity.y * step, z: this.velocity.z * step }
    this.cc.computeColliderMovement(this.collider, desired)
    const mv = this.cc.computedMovement()
    const t = this.body.translation()
    const next = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }
    this.body.setNextKinematicTranslation(next)
    this.phys.world.step()
    this.grounded = this.cc.computedGrounded()
    if (this.grounded) {
      if (this.velocity.y < 0) this.velocity.y = -0.5
      this.momentum = false
    }
    if (!this.grounded && mv.y > desired.y + 1e-4 && this.velocity.y > 0) this.velocity.y = 0
    // 壁に当たったら勢いを失う
    if (this.momentum && step > 0) {
      if (Math.abs(mv.x) < Math.abs(desired.x) * 0.5) this.velocity.x = mv.x / step
      if (Math.abs(mv.z) < Math.abs(desired.z) * 0.5) this.velocity.z = mv.z / step
    }
    this.position.set(next.x, next.y - FOOT, next.z)
    this.speed = Math.hypot(this.velocity.x, this.velocity.z)
    if (this.burst.t > 0) {
      // 向きは攻撃・回避の側（combat/）が決める
    } else if (this.speed > 0.2 && len > 0) this.turnToward(this.velocity.x, this.velocity.z, step, 12)
    else if (this.speed > 0.2 && this.momentum) this.turnToward(this.velocity.x, this.velocity.z, step, 6)
    if (this.grounded) this.lastSafe.copy(this.position)
    if (this.position.y < T.killY) {
      this.teleport(this.lastSafe.clone().add(new THREE.Vector3(0, 0.3, 0)))
      this.onRespawn?.()
    }
  }

  /** 向きを (vx, vz) の方向へ回す */
  turnToward(vx: number, vz: number, dt: number, rate: number): void {
    if (Math.hypot(vx, vz) < 0.2) return
    const want = Math.atan2(-vx, -vz)
    let d = want - this.facing
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    this.facing += d * Math.min(1, rate * dt)
  }
}
