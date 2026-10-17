// 三人称カメラのスプリングアーム：マウスで回し、壁に当たったら手前に縮む（Rapier のレイ）。
import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Physics } from './physics'
import type { InputState } from './input'

export class CameraRig {
  yaw = 0
  pitch = 0.32
  distance = 4.4
  private current = 4.4
  private readonly target = new THREE.Vector3()
  private readonly smoothTarget = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private initialized = false
  private readonly camera: THREE.PerspectiveCamera
  private readonly phys: Physics
  private readonly exclude: RAPIER.Collider

  constructor(camera: THREE.PerspectiveCamera, phys: Physics, exclude: RAPIER.Collider) {
    this.camera = camera
    this.phys = phys
    this.exclude = exclude
  }

  update(dt: number, input: InputState, focusFeet: THREE.Vector3): void {
    const sens = 0.0024
    this.yaw -= input.mouseDX * sens
    this.pitch += input.mouseDY * sens
    if (input.keys.has('KeyQ')) this.yaw += dt * 1.8
    if (input.keys.has('KeyE')) this.yaw -= dt * 1.8
    this.pitch = Math.min(1.2, Math.max(-0.35, this.pitch))
    this.target.copy(focusFeet).add(new THREE.Vector3(0, 0.95, 0))
    if (!this.initialized) {
      this.smoothTarget.copy(this.target)
      this.initialized = true
    }
    this.smoothTarget.lerp(this.target, 1 - Math.exp(-dt * 14))
    this.dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
    const hit = this.phys.raycast(this.smoothTarget, this.dir, this.distance + 0.3, this.exclude)
    const want = hit !== null ? Math.max(0.6, hit - 0.3) : this.distance
    // 縮むときは速く、伸びるときはゆっくり
    const k = want < this.current ? 20 : 3
    this.current += (want - this.current) * Math.min(1, k * dt)
    this.camera.position.copy(this.smoothTarget).addScaledVector(this.dir, this.current)
    this.camera.lookAt(this.smoothTarget.x, this.smoothTarget.y + 0.25, this.smoothTarget.z)
  }

  /** 現在のカメラから yaw/pitch を逆算（ショットからプレイへ戻るとき） */
  syncFrom(camera: THREE.Camera, focusFeet: THREE.Vector3): void {
    const off = new THREE.Vector3().subVectors(camera.position, focusFeet.clone().add(new THREE.Vector3(0, 0.95, 0)))
    this.yaw = Math.atan2(off.x, off.z)
    this.pitch = Math.min(1.0, Math.max(0.05, Math.asin(off.y / Math.max(0.01, off.length()))))
    this.initialized = false
  }
}
