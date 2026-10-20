// あとから出し入れする当たり判定（シェルの物理は load の ColliderList から作る固定の箱だけで、足す手段が無いため）。
// ・組（set）：名前を付けた箱の集まり。setEnabled で一度に出し入れする（NEXTMAKE 新館 ⇔ 古い建物と中庭、裏側の足場など）
// ・動く箱（mover）：つり板・落ちる物など。毎フレーム位置を渡す（キネマティック。プレイヤーは上に乗れる）
// 箱の記述は load のときに作り、Rapier の当たり判定はステージの begin で attach(rt.phys) したときに作る
// （player/clawSystem.ts の動かせる物と同じやり方）。ワールドは時空移動のときシェルがまとめて解放する。
import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { Physics } from '../../../player/physics'
import type { BoxCollider, ColliderList } from '../../../world/colliders'

type SetEntry = { boxes: BoxCollider[]; enabled: boolean; colliders: RAPIER.Collider[] }

export type Mover = {
  readonly id: string
  readonly half: THREE.Vector3
  /** 箱の中心の位置と向き（Y 回り）。attach 前でも呼べる（attach のときにその位置で作る） */
  set(center: THREE.Vector3, rotY?: number): void
  enabled: boolean
}

type MoverEntry = Mover & { center: THREE.Vector3; rotY: number; body: RAPIER.RigidBody | null; collider: RAPIER.Collider | null; on: boolean }

const q = new THREE.Quaternion()
const e = new THREE.Euler()

export class SwitchColliders {
  private readonly sets = new Map<string, SetEntry>()
  private readonly movers: MoverEntry[] = []
  private phys: Physics | null = null

  /** 名前付きの組に箱を足す（同じ名前なら追加）。enabled は最初の状態 */
  addSet(name: string, boxes: ColliderList | readonly BoxCollider[], enabled = true): void {
    const list = 'items' in boxes ? boxes.items : boxes
    let s = this.sets.get(name)
    if (!s) {
      s = { boxes: [], enabled, colliders: [] }
      this.sets.set(name, s)
    }
    s.boxes.push(...list)
    if (this.phys) for (const b of list) s.colliders.push(this.create(b, s.enabled))
  }

  setEnabled(name: string, on: boolean): void {
    const s = this.sets.get(name)
    if (!s) return
    s.enabled = on
    for (const c of s.colliders) c.setEnabled(on)
  }

  isEnabled(name: string): boolean {
    return this.sets.get(name)?.enabled ?? false
  }

  /** 組の箱（デバッグ・テスト用） */
  boxes(name: string): readonly BoxCollider[] {
    return this.sets.get(name)?.boxes ?? []
  }

  /** 動く箱を足す。half は半分の大きさ */
  addMover(id: string, half: THREE.Vector3, center: THREE.Vector3, enabled = true): Mover {
    const self = this
    const m: MoverEntry = {
      id,
      half: half.clone(),
      center: center.clone(),
      rotY: 0,
      body: null,
      collider: null,
      on: enabled,
      get enabled() {
        return m.on
      },
      set enabled(v: boolean) {
        m.on = v
        m.collider?.setEnabled(v)
      },
      set(c: THREE.Vector3, rotY = 0) {
        m.center.copy(c)
        m.rotY = rotY
        if (m.body) {
          m.body.setNextKinematicTranslation({ x: c.x, y: c.y, z: c.z })
          q.setFromEuler(e.set(0, rotY, 0))
          m.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        }
      },
    }
    this.movers.push(m)
    if (this.phys) self.createMover(m)
    return m
  }

  /** ステージの begin で 1 回（rt.phys）。それまでに足した箱の当たり判定を作る */
  attach(phys: Physics): void {
    if (this.phys === phys) return
    this.phys = phys
    for (const s of this.sets.values()) s.colliders = s.boxes.map((b) => this.create(b, s.enabled))
    for (const m of this.movers) this.createMover(m)
  }

  /** 参照を手放す（ワールドはシェルが解放する。Rapier の呼び出しはしない） */
  detach(): void {
    this.phys = null
    for (const s of this.sets.values()) s.colliders = []
    for (const m of this.movers) {
      m.body = null
      m.collider = null
    }
  }

  private fixed: RAPIER.RigidBody | null = null

  private create(b: BoxCollider, enabled: boolean): RAPIER.Collider {
    const phys = this.phys as Physics
    const R = phys.R
    if (!this.fixed || !phys.world.getRigidBody(this.fixed.handle)) this.fixed = phys.world.createRigidBody(R.RigidBodyDesc.fixed())
    q.setFromEuler(e.set(b.rotX ?? 0, b.rotY, b.rotZ ?? 0, 'YXZ'))
    const d = R.ColliderDesc.cuboid(b.half.x, b.half.y, b.half.z)
      .setTranslation(b.center.x, b.center.y, b.center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.8)
    const c = phys.world.createCollider(d, this.fixed)
    c.setEnabled(enabled)
    return c
  }

  private createMover(m: MoverEntry): void {
    const phys = this.phys as Physics
    const R = phys.R
    q.setFromEuler(e.set(0, m.rotY, 0))
    m.body = phys.world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(m.center.x, m.center.y, m.center.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    )
    m.collider = phys.world.createCollider(R.ColliderDesc.cuboid(m.half.x, m.half.y, m.half.z).setFriction(0.9), m.body)
    m.collider.setEnabled(m.on)
  }
}
