// あとから足せる・動かせる当たり判定の箱（ステージの load の後に。動く足場・止めた石・閉じる扉など）。
// ColliderList（world/colliders.ts）は読み込み時に固まるので、物語の途中で出し入れする当たり判定はこれで作る。
// 物理の作り方は player/clawSystem.ts の movables と同じ（kinematicPositionBased の剛体＋箱の collider）。
import * as THREE from 'three'
import type { Physics } from '../../player/physics'
import type RAPIER from '@dimforge/rapier3d-compat'

export class KinematicBox {
  private readonly phys: Physics
  private readonly body: RAPIER.RigidBody
  private readonly collider: RAPIER.Collider
  private on = true
  private removed = false
  private readonly q = new THREE.Quaternion()

  /** half：箱の半分の大きさ。pos：箱の中心 */
  constructor(phys: Physics, half: THREE.Vector3, pos: THREE.Vector3, yaw = 0) {
    this.phys = phys
    const R = phys.R
    this.q.setFromEuler(new THREE.Euler(0, yaw, 0))
    this.body = phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z).setRotation({ x: this.q.x, y: this.q.y, z: this.q.z, w: this.q.w }))
    this.collider = phys.world.createCollider(R.ColliderDesc.cuboid(half.x, half.y, half.z).setFriction(0.9), this.body)
  }

  /** 中心と向きを動かす（次の物理の一歩で効く） */
  setPose(pos: THREE.Vector3, quat?: THREE.Quaternion): void {
    if (this.removed) return
    this.body.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z })
    if (quat) this.body.setNextKinematicRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w })
  }

  /** すぐにその場へ（瞬間移動） */
  teleport(pos: THREE.Vector3, quat?: THREE.Quaternion): void {
    if (this.removed) return
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true)
    if (quat) this.body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true)
  }

  /** 当たり判定を出し入れする（消えている間は通り抜けられる） */
  setEnabled(on: boolean): void {
    if (this.removed || on === this.on) return
    this.on = on
    this.collider.setEnabled(on)
  }

  get enabled(): boolean {
    return this.on
  }

  remove(): void {
    if (this.removed) return
    this.removed = true
    this.phys.world.removeRigidBody(this.body)
  }
}
