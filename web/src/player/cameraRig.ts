// 三人称カメラのスプリングアーム：方向キー（look アクション）で回す。押し始めはゆっくり、
// 押し続けると加速（inputActions.stepLook）。壁に当たったら手前に縮む（Rapier のレイ。まん中と四隅の 5 本で、
// カメラの画面のはしが壁に入るのも防ぐ。縮むときはそのフレームで安全な距離まで縮める）。
// マウスは任意（ポインタロック中だけ加算）。
import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Physics } from './physics'
import { createLookState, stepLook, type Axis2 } from './inputActions'

export const CAMERA_TUNING = {
  /** カメラの高さ角（rad）。小さいほど低い位置から見上げる */
  pitchMin: -0.55,
  pitchMax: 1.2,
  mouseSensitivity: 0.0024,
}

/** 四隅のレイのずらし（m）：横 ±0.22、縦 ±0.14（近い面の大きさのめやす） */
const CORNERS: ReadonlyArray<readonly [number, number]> = [
  [0.22, 0.14],
  [-0.22, 0.14],
  [0.22, -0.14],
  [-0.22, -0.14],
]

export class CameraRig {
  yaw = 0
  pitch = 0.32
  distance = 4.4
  private current = 4.4
  private readonly target = new THREE.Vector3()
  private readonly smoothTarget = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly upv = new THREE.Vector3()
  private readonly origin = new THREE.Vector3()
  private readonly up = new THREE.Vector3(0, 0.95, 0)
  private readonly look = createLookState()
  private initialized = false
  /** 自動で向きを変える目標（到着時など）。方向キーを押すと取り消す */
  private auto: { yaw: number; pitch: number } | null = null
  private readonly camera: THREE.PerspectiveCamera
  private readonly phys: Physics
  private readonly exclude: RAPIER.Collider

  constructor(camera: THREE.PerspectiveCamera, phys: Physics, exclude: RAPIER.Collider) {
    this.camera = camera
    this.phys = phys
    this.exclude = exclude
  }

  /**
   * look.x：右へ回す（+）、look.y：上を見る（+）。mouseDX/DY は任意の追加入力。
   * pitch はカメラの高さ角なので、上を見る = pitch を下げる。
   */
  update(dt: number, look: Axis2, focusFeet: THREE.Vector3, mouseDX = 0, mouseDY = 0): void {
    if (this.auto && (look.x !== 0 || look.y !== 0 || mouseDX !== 0 || mouseDY !== 0)) this.auto = null
    if (this.auto) {
      let d = this.auto.yaw - this.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      const k = Math.min(1, dt * 5)
      const dp = this.auto.pitch - this.pitch
      this.yaw += d * k
      this.pitch += dp * k
      if (Math.abs(d) < 0.01 && Math.abs(dp) < 0.01) this.auto = null
    }
    const { dYaw, dPitch } = stepLook(this.look, look, dt)
    this.yaw -= dYaw
    this.pitch -= dPitch
    this.yaw -= mouseDX * CAMERA_TUNING.mouseSensitivity
    this.pitch += mouseDY * CAMERA_TUNING.mouseSensitivity
    this.pitch = Math.min(CAMERA_TUNING.pitchMax, Math.max(CAMERA_TUNING.pitchMin, this.pitch))
    this.target.copy(focusFeet).add(this.up)
    if (!this.initialized) {
      this.smoothTarget.copy(this.target)
      this.initialized = true
    }
    this.smoothTarget.lerp(this.target, 1 - Math.exp(-dt * 14))
    this.dir.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch))
    const want = this.safeDistance()
    // 縮むときはそのフレームで（壁の中を映さない）、伸びるときはゆっくり
    if (want < this.current) this.current = want
    else this.current += (want - this.current) * Math.min(1, 3 * dt)
    this.camera.position.copy(this.smoothTarget).addScaledVector(this.dir, this.current)
    this.camera.lookAt(this.smoothTarget.x, this.smoothTarget.y + 0.25, this.smoothTarget.z)
  }

  /** 壁に入らない距離：まん中と、画面の四隅に当たる 4 本のレイのうち、いちばん近い当たり */
  private safeDistance(): number {
    const len = this.distance + 0.3
    let best = this.phys.raycast(this.smoothTarget, this.dir, len, this.exclude, true) ?? Infinity
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    this.upv.crossVectors(this.right, this.dir).normalize()
    for (const [sx, sy] of CORNERS) {
      this.origin.copy(this.smoothTarget).addScaledVector(this.right, sx).addScaledVector(this.upv, sy)
      const h = this.phys.raycast(this.origin, this.dir, len, this.exclude, true)
      if (h !== null && h < best) best = h
    }
    return best === Infinity ? this.distance : Math.max(0.35, best - 0.25)
  }

  /** なめらかに向きを変える（yaw はカメラが置かれる側の向き。方向キーで取り消せる） */
  turnTo(yaw: number, pitch: number): void {
    this.auto = { yaw, pitch }
  }

  /** 現在のカメラから yaw/pitch を逆算（ショットからプレイへ戻るとき） */
  syncFrom(camera: THREE.Camera, focusFeet: THREE.Vector3): void {
    const off = new THREE.Vector3().subVectors(camera.position, focusFeet.clone().add(this.up))
    this.yaw = Math.atan2(off.x, off.z)
    this.pitch = Math.min(1.0, Math.max(0.05, Math.asin(off.y / Math.max(0.01, off.length()))))
    this.initialized = false
  }
}
