// Rapier の世界：シーンが登録した箱の当たり判定（固定）とプレイヤーのカプセル。
import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { ColliderList } from '../world/colliders'

export type Physics = {
  R: typeof RAPIER
  world: RAPIER.World
  /** start→end の線分で最初に当たる距離（無ければ null） */
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, exclude?: RAPIER.Collider): number | null
}

export async function createPhysics(list: ColliderList): Promise<Physics> {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  for (const c of list.items) {
    e.set(c.rotX ?? 0, c.rotY, c.rotZ ?? 0, 'YXZ')
    q.setFromEuler(e)
    const d = RAPIER.ColliderDesc.cuboid(c.half.x, c.half.y, c.half.z)
      .setTranslation(c.center.x, c.center.y, c.center.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setFriction(0.8)
    world.createCollider(d, body)
  }
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
  return {
    R: RAPIER,
    world,
    raycast(origin, dir, maxDist, exclude) {
      ray.origin = { x: origin.x, y: origin.y, z: origin.z }
      ray.dir = { x: dir.x, y: dir.y, z: dir.z }
      const hit = world.castRay(ray, maxDist, true, undefined, undefined, exclude)
      return hit ? hit.timeOfImpact : null
    },
  }
}
