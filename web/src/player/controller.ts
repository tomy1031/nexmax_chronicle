// 三人称のプレイヤー操作：KinematicCharacterController（段差の自動乗り越え・接地吸着）、
// WASD（カメラ基準）、Space ジャンプ（着地直前の先行入力あり）、Shift ダッシュ。
import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { Physics } from './physics'
import type { InputState } from './input'

const RADIUS = 0.27
const HALF = 0.25
const FOOT = HALF + RADIUS

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
  enabled = true
  private jumpBuffer = 0
  private coyote = 0
  private readonly lastSafe = new THREE.Vector3()

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

  /** 足元の位置へ瞬間移動 */
  teleport(p: THREE.Vector3, facing?: number): void {
    this.body.setTranslation({ x: p.x, y: p.y + FOOT, z: p.z }, true)
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + FOOT, z: p.z })
    this.position.copy(p)
    this.velocity.set(0, 0, 0)
    if (facing !== undefined) this.facing = facing
  }

  update(dt: number, input: InputState, camYaw: number): void {
    const step = Math.min(dt, 1 / 30)
    let mx = 0
    let mz = 0
    if (this.enabled) {
      if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) mz -= 1
      if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) mz += 1
      if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) mx -= 1
      if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) mx += 1
    }
    const len = Math.hypot(mx, mz)
    const dash = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight')
    const target = len > 0 ? (dash ? 6.4 : 3.3) : 0
    // カメラ基準の方向
    const fwdX = -Math.sin(camYaw)
    const fwdZ = -Math.cos(camYaw)
    const rgtX = Math.cos(camYaw)
    const rgtZ = -Math.sin(camYaw)
    let dx = 0
    let dz = 0
    if (len > 0) {
      dx = (fwdX * -mz + rgtX * mx) / len
      dz = (fwdZ * -mz + rgtZ * mx) / len
    }
    const accel = this.grounded ? 14 : 5
    const desiredVX = dx * target
    const desiredVZ = dz * target
    this.velocity.x += (desiredVX - this.velocity.x) * Math.min(1, accel * step)
    this.velocity.z += (desiredVZ - this.velocity.z) * Math.min(1, accel * step)
    // ジャンプ
    if (this.enabled && input.pressed.has('Space')) this.jumpBuffer = 0.15
    this.jumpBuffer -= step
    this.coyote = this.grounded ? 0.12 : this.coyote - step
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      this.velocity.y = 5.6
      this.jumpBuffer = 0
      this.coyote = 0
    }
    this.velocity.y -= 17 * step
    if (this.velocity.y < -20) this.velocity.y = -20
    const desired = { x: this.velocity.x * step, y: this.velocity.y * step, z: this.velocity.z * step }
    this.cc.computeColliderMovement(this.collider, desired)
    const mv = this.cc.computedMovement()
    const t = this.body.translation()
    const next = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }
    this.body.setNextKinematicTranslation(next)
    this.phys.world.step()
    this.grounded = this.cc.computedGrounded()
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -0.5
    if (!this.grounded && mv.y > desired.y + 1e-4 && this.velocity.y > 0) this.velocity.y = 0
    this.position.set(next.x, next.y - FOOT, next.z)
    this.speed = Math.hypot(this.velocity.x, this.velocity.z)
    if (this.speed > 0.2) {
      const want = Math.atan2(-this.velocity.x, -this.velocity.z)
      let d = want - this.facing
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.facing += d * Math.min(1, 12 * step)
    }
    if (this.grounded) this.lastSafe.copy(this.position)
    if (this.position.y < -1.3) this.teleport(this.lastSafe.clone().add(new THREE.Vector3(0, 0.3, 0)))
  }
}
