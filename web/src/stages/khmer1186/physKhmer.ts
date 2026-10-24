// 1186年の「後から変わる」当たり判定。シェルの当たり判定（ColliderList）は読みこみの時に固定されるので、
// 大階段の段（くずれる・もどる）・落ちてくる石（止めると乗れる）・象の背中（歩く足場）は、物理ができた後に
// attach(rt.phys) で Rapier の世界へ直接つくる（player/clawSystem.ts の movables と同じ作り方）。
// 世界ごと移動のときにシェルが free() するので、ここで消す必要はない。
import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { Physics } from '../../player/physics'
import type { PlayerController } from '../../player/controller'

const q = new THREE.Quaternion()
const e = new THREE.Euler()

/** 入れたり切ったりできる、固定の箱（大階段の段の坂など） */
export class ToggleBox {
  readonly center: THREE.Vector3
  readonly half: THREE.Vector3
  readonly rot: THREE.Euler
  private on: boolean
  collider: RAPIER.Collider | null = null

  constructor(center: THREE.Vector3, size: THREE.Vector3, rotY = 0, rotX = 0, rotZ = 0, enabled = true) {
    this.center = center.clone()
    this.half = size.clone().multiplyScalar(0.5)
    this.rot = new THREE.Euler(rotX, rotY, rotZ, 'YXZ')
    this.on = enabled
  }

  get enabled(): boolean {
    return this.on
  }

  setEnabled(on: boolean): void {
    this.on = on
    this.collider?.setEnabled(on)
  }
}

/** 動かせる箱（kinematic）。setPose で次の位置へ（物理の 1 歩でそこへ動く）。止めている石・象の背中 */
export class KinematicBox {
  readonly half: THREE.Vector3
  readonly pos = new THREE.Vector3()
  rotY = 0
  private on: boolean
  body: RAPIER.RigidBody | null = null
  collider: RAPIER.Collider | null = null
  /** 前の setPose からの動き（乗っているプレイヤーを運ぶ） */
  readonly delta = new THREE.Vector3()
  /** 前の setPose からの向きの変化 */
  deltaYaw = 0
  private placed = false

  constructor(size: THREE.Vector3, enabled = true) {
    this.half = size.clone().multiplyScalar(0.5)
    this.on = enabled
  }

  get enabled(): boolean {
    return this.on
  }

  /** 上面の高さ */
  get top(): number {
    return this.pos.y + this.half.y
  }

  setEnabled(on: boolean): void {
    this.on = on
    this.collider?.setEnabled(on)
  }

  /** 中心の位置と向き（瞬間移動ではなく、物理の次の 1 歩で動く） */
  setPose(p: THREE.Vector3, rotY: number, teleport = false): void {
    if (this.placed && !teleport) {
      this.delta.subVectors(p, this.pos)
      this.deltaYaw = rotY - this.rotY
    } else {
      this.delta.set(0, 0, 0)
      this.deltaYaw = 0
    }
    this.placed = true
    this.pos.copy(p)
    this.rotY = rotY
    if (!this.body) return
    q.setFromEuler(e.set(0, rotY, 0))
    if (teleport) {
      this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true)
      this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    } else {
      this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z })
      this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    }
  }

  /** 点 p（足もと）がこの箱の上面に乗っているか（xz が上面の中・高さが上面に近い） */
  supports(p: THREE.Vector3, margin = 0.08, up = 0.25): boolean {
    const dx = p.x - this.pos.x
    const dz = p.z - this.pos.z
    const c = Math.cos(-this.rotY)
    const s = Math.sin(-this.rotY)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    if (Math.abs(lx) > this.half.x + margin || Math.abs(lz) > this.half.z + margin) return false
    const dy = p.y - this.top
    return dy > -0.12 && dy < up
  }
}

/** 物理ができる前に記述を集め、attach で作る */
export class KhmerBodies {
  readonly toggles: ToggleBox[] = []
  readonly kinematics: KinematicBox[] = []
  private phys: Physics | null = null

  addToggle(b: ToggleBox): ToggleBox {
    this.toggles.push(b)
    if (this.phys) this.createToggle(b)
    return b
  }

  addKinematic(b: KinematicBox): KinematicBox {
    this.kinematics.push(b)
    if (this.phys) this.createKinematic(b)
    return b
  }

  get attached(): boolean {
    return this.phys !== null
  }

  /** begin(rt) で 1 回：Rapier の世界に箱を作る */
  attach(phys: Physics): void {
    if (this.phys === phys) return
    this.phys = phys
    for (const b of this.toggles) this.createToggle(b)
    for (const b of this.kinematics) this.createKinematic(b)
  }

  /** 移動などで世界が無くなるとき（参照を外すだけ） */
  detach(): void {
    this.phys = null
    for (const b of this.toggles) b.collider = null
    for (const b of this.kinematics) {
      b.body = null
      b.collider = null
    }
  }

  private fixedBody: RAPIER.RigidBody | null = null

  private createToggle(b: ToggleBox): void {
    const P = this.phys as Physics
    const R = P.R
    if (!this.fixedBody) this.fixedBody = P.world.createRigidBody(R.RigidBodyDesc.fixed())
    q.setFromEuler(b.rot)
    const d = R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z)
      .setTranslation(b.center.x, b.center.y, b.center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.8)
    b.collider = P.world.createCollider(d, this.fixedBody)
    b.collider.setEnabled(b.enabled)
  }

  private createKinematic(b: KinematicBox): void {
    const P = this.phys as Physics
    const R = P.R
    q.setFromEuler(e.set(0, b.rotY, 0))
    b.body = P.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(b.pos.x, b.pos.y, b.pos.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }))
    b.collider = P.world.createCollider(R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z).setFriction(1.0), b.body)
    b.collider.setEnabled(b.enabled)
  }
}

/**
 * 動く足場にプレイヤーを乗せて運ぶ（KCC は足場の動きを拾わないので、ステージが毎フレーム運ぶ）。
 * ステージの update（プレイヤーの更新の後）で、足場を動かしてから carry() を呼ぶ。
 * ずれ止め：足場の動き・回転の分だけ運んだうえで、足場から見た足もとの位置を覚えておき、歩いていない（入力が無い）間は、
 * いつもそこへ置き直す（足場の当たり判定は物理の 1 歩おくれて動くので、坂や向きを変える所で KCC が少しずつ押し出してしまう）。
 * 歩いている間も、足場のふちからは出さない（降りるときは、ジャンプかクロー）
 */
export class PlatformRider {
  /** 今乗っている足場 */
  riding: KinematicBox | null = null
  private readonly tmp = new THREE.Vector3()
  /** ずれ止め：足場から見た足もと（x・z は足場の向きにそろえた座標） */
  private lockOn: KinematicBox | null = null
  private lockX = 0
  private lockZ = 0

  /** moving：プレイヤーが歩く入力をしている */
  carry(player: PlayerController, platforms: readonly KinematicBox[], moving = false): KinematicBox | null {
    this.riding = null
    if (player.isExternal) {
      this.lockOn = null
      return null
    }
    // 接地していなくても、跳ねた直後のわずかな浮きは乗っているとみなす。
    // ふちに体（カプセル）の丸みでのっているとき（足もとは板の外でも、体の半径 0.27 m の中）も乗っているとみなす
    for (const p of platforms) {
      if (!p.enabled) continue
      if (!p.supports(player.position, 0.3, player.grounded ? 0.3 : 0.12)) continue
      this.riding = p
      const body = player.collider.parent()
      // 体（カプセル）の中心と足もとの高さの差
      const foot = body ? body.translation().y - player.position.y : 0
      // 向きの変化：足場の中心のまわりに回す
      const t = this.tmp.subVectors(player.position, p.pos)
      if (Math.abs(p.deltaYaw) > 1e-6) {
        const c = Math.cos(p.deltaYaw)
        const s = Math.sin(p.deltaYaw)
        const x = t.x * c + t.z * s
        const z = -t.x * s + t.z * c
        t.set(x - t.x, 0, z - t.z)
      } else t.set(0, 0, 0)
      t.add(p.delta)
      player.position.add(t)
      player.facing += p.deltaYaw
      // 足場から見た位置（下の「ワールドへ」の逆。three の Y 回転と同じ向き）
      const c = Math.cos(p.rotY)
      const s = Math.sin(p.rotY)
      const dx = player.position.x - p.pos.x
      const dz = player.position.z - p.pos.z
      let lx = dx * c - dz * s
      let lz = dx * s + dz * c
      const jumping = player.velocity.y > 0.5
      if (!jumping) {
        if (this.lockOn === p && !moving) {
          // 歩いていない：覚えた所へ置き直す
          lx = this.lockX
          lz = this.lockZ
        } else {
          // 歩いている：ふちから出さない
          lx = Math.max(-p.half.x - 0.05, Math.min(p.half.x + 0.05, lx))
          lz = Math.max(-p.half.z - 0.05, Math.min(p.half.z + 0.05, lz))
        }
        this.lockOn = p
        this.lockX = lx
        this.lockZ = lz
        // 足場の向きでワールドへ（上面のすぐ上）
        const cw = Math.cos(p.rotY)
        const sw = Math.sin(p.rotY)
        player.position.set(p.pos.x + lx * cw + lz * sw, Math.max(player.position.y, p.top + 0.02), p.pos.z - lx * sw + lz * cw)
        if (player.velocity.y < -0.5) player.velocity.y = -0.5
      } else this.lockOn = null
      if (body) body.setTranslation({ x: player.position.x, y: player.position.y + foot, z: player.position.z }, true)
      break
    }
    if (!this.riding) this.lockOn = null
    return this.riding
  }
}
