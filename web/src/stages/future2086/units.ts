// 会場で働く量産型ネクマックス（2086年の最新型・アンテナ付き）。屋台の店番、展示の組み立て、案内、見回り。
// 簡単なループの動き（ポーズ＋歩く道すじ）だけ。主人公と同じ部品のリグの量産型（createNexmax の variant: 'production'）。
import * as THREE from 'three'
import { createNexmax, type NexmaxCharacter, type NexmaxPose } from '../../world/nexmax/nexmaxModel'
import { F } from './layout'

export type UnitSpec = {
  id: string
  serial: number
  pos: THREE.Vector3
  /** モデルの向き（0 = -Z 向き） */
  yaw: number
  pose: NexmaxPose
  /** 歩く道すじ（閉じた輪）。あれば pos・yaw は無視 */
  loop?: { center: THREE.Vector3; rx: number; rz: number; speed: number; phase?: number }
  /** 夜（オルム）のときのポーズ */
  nightPose?: NexmaxPose
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const WEST = Math.PI / 2

/** 量産型の背の高さ（主人公 1.05m より少し高い） */
export const UNIT_HEIGHT = 1.12

export const UNIT_SPECS: UnitSpec[] = [
  // たこ焼きの屋台（鉄板を返す）
  { id: 'unit_takoyaki', serial: 112, pos: v(F.STALLS.x + 0.15, 0.38, F.STALLS.zs[0] - 0.4), yaw: WEST, pose: 'crank', nightPose: 'wave' },
  // りんご飴の屋台（呼び込み）
  { id: 'unit_ame', serial: 87, pos: v(F.STALLS.x + 0.15, 0.38, F.STALLS.zs[2] + 0.3), yaw: WEST - 0.2, pose: 'wave', nightPose: 'wave' },
  // 展示のリングの組み立て
  { id: 'unit_booth', serial: 64, pos: v(F.PORTAL.x - 2.75, F.BOOTH.h, F.PORTAL.z + 1.45), yaw: -2.2, pose: 'crank', nightPose: 'idle' },
  // 広場の見回り（中央の円をまわる）
  { id: 'unit_patrol', serial: 120, pos: v(0, 0, 0), yaw: 0, pose: 'walk', loop: { center: v(1.5, 0, 1.5), rx: 8.6, rz: 8.6, speed: 0.14 } },
  // 南の入口の案内（夜は避難の誘導）
  { id: 'unit_guide', serial: 33, pos: v(3.6, 0, 16.4), yaw: Math.PI - 0.3, pose: 'idle', nightPose: 'wave' },
]

export type Units = {
  list: Array<{ spec: UnitSpec; ch: NexmaxCharacter }>
  update(dt: number): void
  setNight(on: boolean): void
  dispose(): void
}

export function buildUnits(root: THREE.Group, specs: UnitSpec[] = UNIT_SPECS): Units {
  const list = specs.map((spec) => {
    const ch = createNexmax(UNIT_HEIGHT, { variant: 'production', serial: spec.serial })
    ch.autoExpression = false
    ch.root.name = spec.id
    ch.root.position.copy(spec.pos)
    ch.root.rotation.y = spec.yaw
    ch.setPose(spec.pose)
    // 影は体の大きな部品だけ（腕・手・すねの影は小さいので省いてドローコールを減らす）
    ch.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && /upperArm|forearm|hand|shin|claw|eyeballs|antenna/.test(o.name)) o.castShadow = false
    })
    root.add(ch.root)
    return { spec, ch, t: spec.loop?.phase ?? spec.serial * 0.37 }
  })
  let night = false
  return {
    list,
    update(dt: number) {
      for (const u of list) {
        const L = u.spec.loop
        let speed = 0
        if (L && !night) {
          u.t += dt * L.speed
          const a = u.t * Math.PI * 2
          u.ch.root.position.set(L.center.x + Math.cos(a) * L.rx, L.center.y, L.center.z + Math.sin(a) * L.rz)
          // 進む向き（反時計回り）
          const dx = -Math.sin(a) * L.rx
          const dz = Math.cos(a) * L.rz
          u.ch.root.rotation.y = Math.atan2(-dx, -dz)
          speed = Math.hypot(dx, dz) * L.speed * Math.PI * 2
        }
        u.ch.update(dt, speed)
      }
    },
    setNight(on: boolean) {
      night = on
      for (const u of list) {
        const pose = on ? (u.spec.nightPose ?? (u.spec.loop ? 'idle' : u.spec.pose)) : u.spec.pose
        u.ch.setPose(pose)
      }
    },
    dispose() {
      for (const u of list) u.ch.dispose()
    },
  }
}
