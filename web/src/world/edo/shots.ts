// コンセプト画との比較用の固定カメラ（?shot=05 / 04 / overview、P キーで切替）。
import * as THREE from 'three'
import type { Pose } from '../characters'
import { L } from './layout'

export type Placement = { pos: THREE.Vector3; face: THREE.Vector3 | number; pose: Pose }

export type Shot = {
  id: string
  label: string
  cam: THREE.Vector3
  target: THREE.Vector3
  fov: number
  nexmax: Placement
  genbei: Placement
  oharu: Placement
  claw: boolean
  focus: THREE.Vector3
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 水門のパズル中の源兵衛・おはるの定位置 */
export const GATE_GENBEI: Placement = { pos: v(L.GENBEI.x, L.GENBEI.y, L.GENBEI.z), face: v(L.GENBEI_WHEEL.x, 0, L.GENBEI_WHEEL.z), pose: 'crank' }
export const GATE_OHARU: Placement = { pos: v(L.OHARU.x, L.OHARU.y, L.OHARU.z), face: v(0.35, 0, -5.8), pose: 'wave' }

export const SHOTS: Shot[] = [
  {
    id: '05',
    label: 'SHOT 05 ― 源兵衛と協力して水門修理',
    cam: v(0.35, 1.22, -5.8),
    target: v(9.0, 0.6, -0.8),
    fov: 52,
    nexmax: { pos: v(3.35, L.PIER.y, -5.45), face: v(2.4, 0, -2.6), pose: 'hold' },
    genbei: GATE_GENBEI,
    oharu: GATE_OHARU,
    claw: true,
    focus: v(5.5, 0.5, -1.5),
  },
  {
    id: '04',
    label: 'SHOT 04 ― 仕掛け横丁で源兵衛と出会う',
    cam: v(-25.8, 1.35, 10.5),
    target: v(-6, 3.0, 9.6),
    fov: 56,
    nexmax: { pos: v(-21.9, 0, 10.4), face: v(-15, 0, 12.0), pose: 'walk' },
    genbei: { pos: v(-17.2, 0, 12.6), face: v(-22, 0, 10.6), pose: 'idle' },
    oharu: { pos: v(-16.2, 0, 12.3), face: v(-22, 0, 10.6), pose: 'idle' },
    claw: false,
    focus: v(-18, 0, 10),
  },
  {
    id: 'overview',
    label: 'OVERVIEW',
    cam: v(-30, 30, -26),
    target: v(6, 0, 3),
    fov: 48,
    nexmax: { pos: v(3.35, L.PIER.y, -5.45), face: v(6.6, 0, -2.6), pose: 'hold' },
    genbei: GATE_GENBEI,
    oharu: GATE_OHARU,
    claw: true,
    focus: v(0, 0, 2),
  },
]

/** プレイ開始位置（?spawn=street|boat|balcony|swing|genbei|gear。開発・検証用。既定は street） */
export type Spawn = { pos: THREE.Vector3; facing: number; camYaw: number; camPitch: number }

export const SPAWNS: Record<string, Spawn> = {
  // 仕掛け横丁の通り（水門を望む）
  street: { pos: v(-11.5, 0, 9.8), facing: -Math.PI / 2 - 0.3, camYaw: -Math.PI / 2 + 0.45, camPitch: 0.28 },
  // 舟の上の木箱と小さな歯車の前（南岸）
  boat: { pos: v(-11.2, 0, 8.4), facing: 0.78, camYaw: 0.74, camPitch: 0.5 },
  // 水門番の家の前のボードウォーク（おはるの朱のバルコニーの金具を見上げる）
  balcony: { pos: v(3.0, 0.15, 4.3), facing: -2.06, camYaw: -2.06, camPitch: -0.28 },
  // 渡し梁の北岸（吊り輪を見上げる）
  swing: { pos: v(-26.6, 0, -8.0), facing: 2.97, camYaw: 2.97, camPitch: -0.22 },
  // 源兵衛の作業台（F で話す）
  genbei: { pos: v(4.1, L.PLATFORM.y, -1.9), facing: 2.18, camYaw: 2.18, camPitch: 0.3 },
  // ショット 05 の桟橋（大歯車を支える位置）
  gear: { pos: v(3.35, L.PIER.y, -5.45), facing: -2.39, camYaw: -2.25, camPitch: 0.12 },
}

export function faceYaw(from: THREE.Vector3, face: THREE.Vector3 | number): number {
  if (typeof face === 'number') return face
  return Math.atan2(-(face.x - from.x), -(face.z - from.z))
}
