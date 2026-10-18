// Rapier の世界：シーンが登録した箱の当たり判定（固定）とプレイヤーのカプセル。
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { BoxCollider, ColliderList } from '../world/colliders'

/** 当たり判定のグループ（上位 16bit = 所属、下位 16bit = 相手にするグループ）。既定はすべて 0xffff */
const GROUP_INVISIBLE = 0x0002
/** 見えない壁：所属は INVISIBLE、相手はすべて（プレイヤーは止める） */
const INVISIBLE_WALL_GROUPS = (GROUP_INVISIBLE << 16) | 0xffff
/** 見えるものだけに当たるレイ（視線・カメラ・置く場所の地面） */
const VISIBLE_RAY_GROUPS = (0xffff << 16) | (0xffff & ~GROUP_INVISIBLE)

export type Physics = {
  R: typeof RAPIER
  world: RAPIER.World
  /**
   * origin から dir 方向で最初に当たる距離（無ければ null）。
   * visibleOnly=true なら見えない壁（水への落下防止など）を無視する。
   */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, exclude?: RAPIER.Collider, visibleOnly?: boolean): number | null
  /** 登録した箱を取り除く（壊れた壁など）。もう無ければ何もしない */
  remove(item: BoxCollider): void
}

export async function createPhysics(list: ColliderList): Promise<Physics> {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const byItem = new Map<BoxCollider, RAPIER.Collider>()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (const c of list.items) {
    e.set(c.rotX ?? 0, c.rotY, c.rotZ ?? 0, 'YXZ')
    q.setFromEuler(e)
    const d = RAPIER.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z)
      .setTranslation(c.center.x, c.center.y, c.center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.8)
    if (c.invisible) d.setCollisionGroups(INVISIBLE_WALL_GROUPS)
    byItem.set(c, world.createCollider(d, body))
  }
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
  return {
    R: RAPIER,
    world,
    raycast(origin, dir, maxDist, exclude, visibleOnly = false) {
      ray.origin = { x: origin.x, y: origin.y, z: origin.z }
      ray.dir = { x: dir.x, y: dir.y, z: dir.z }
      const hit = world.castRay(ray, maxDist, true, undefined, visibleOnly ? VISIBLE_RAY_GROUPS : undefined, exclude)
      return hit ? hit.timeOfImpact : null
    },
    remove(item) {
      const c = byItem.get(item)
      if (!c) return
      byItem.delete(item)
      world.removeCollider(c, false)
    },
  }
}
