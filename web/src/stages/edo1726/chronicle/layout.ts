// 物語 v7 の 7 章「江戸の時計師（1726年）」で足す舞台の配置（m）。X=東、Z=南、Y=上（world/edo/layout.ts と同じ）。
// 南の通り（仕掛け横丁）の店の並びに、源兵衛の工房（中に入れる）と路地をあけ、店の裏に次の 3 つを足す。
//   ・路地 → 路地のおく（小さな庭）：西の端に東を向いた「時の神さま」のほこら。2026年の路地のかんばん（石標 C）と同じ場所の 300 年前
//   ・広場：工房の裏。南に大きなからくり時計「時の鐘人形」。まわりは蔵・土塀・家の裏でかこむ（夜のボス戦の場所）
//   ・朝日の通り道：路地のおくから東（上流の台地・城の方）へ、遠景の家を置かない
import * as THREE from 'three'
import type { SpawnPoint } from '../../../game/stage'
import { CHRONICLE_ROW } from '../../../world/edo/scene'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 方角（ヨー：モデルは -Z 向き。atan2(-dx, -dz)） */
export const YAW = { north: 0, south: Math.PI, east: -Math.PI / 2, west: Math.PI / 2 } as const

export const C = {
  /** 南の通りの店の正面（world/edo/layout.ts の STREET_Z1） */
  STREET_Z: 14,
  /** 源兵衛の工房（正面＝北の通り。裏口＝南の広場） */
  WORKSHOP: {
    x0: CHRONICLE_ROW.workshop.x0,
    x1: CHRONICLE_ROW.workshop.x1,
    z0: 14,
    z1: 21.6,
    /** 1 階の天井の高さ（梁の下） */
    h1: 3.7,
    h2: 2.2,
    /** 表の戸口（暖簾） */
    door: { x0: -17.5, x1: -15.7 },
    /** 裏口（広場へ） */
    backDoor: { x0: -15.0, x1: -13.5 },
  },
  /** 路地（工房と団子屋のあいだ。通りから南へ） */
  ALLEY: { x0: CHRONICLE_ROW.alley.x0, x1: CHRONICLE_ROW.alley.x1, z0: 14, z1: 22.4 },
  /** 路地のおく（小さな庭）。西の板塀の向こうが広場、東は低い垣根で朝日がさしこむ */
  COURT: { x0: -13.2, x1: 2.0, z0: 22.4, z1: 30.4 },
  /** 庭から広場へ抜ける木戸（西の板塀） */
  COURT_GATE: { x: -13.2, z0: 28.7, z1: 30.2 },
  /** 時の神さまのほこら（正面の中心・地面。東を向く） */
  SHRINE: { x: -11.2, z: 26.2, yaw: YAW.east },
  /** 広場（工房の裏）。北は店の裏、西は土塀、南は家並み、東は蔵の並びと板塀 */
  PLAZA: { x0: -44, x1: -13.2, z0: 21.2, z1: 48, y: 0.03 },
  /** 時の鐘人形の台座（中心・地面。北＝工房の方を向く） */
  DOLL: { x: -28.6, z: 41.2, yaw: YAW.north },
  /** ボス戦で人形が歩ける範囲（台座の前の広い所） */
  DOLL_ROAM: { x0: -40, x1: -17.5, z0: 25.5, z1: 39 },
} as const

/** 到着の光の輪（路地の南の端。2026年の石標 C と同じ場所） */
export const ARRIVE_RING = v(-10.9, 0, 22.9)
/** 帰還の光の輪（路地のおく。ほこらの前の朝日の中） */
export const RETURN_RING = v(-7.4, 0, 26.4)
/** 工房の中の要所 */
export const WORKSHOP_SPOTS = {
  /** 作業台（からくりのうで）の前 */
  bench: v(-17.2, 0, 17.6),
  /** 書（ひらいた本）の台 */
  book: v(-14.4, 0, 16.9),
  /** 奥の木の箱（青い刃のかけら） */
  box: v(-16.6, 0, 20.6),
  /** 源兵衛の定位置（作業台の東。戸口から奥の箱が見えるよう、まんなかはあける） */
  genbei: v(-15.1, 0, 18.7),
  /** おはるの定位置（書のそば） */
  oharu: v(-13.6, 0, 17.6),
}

/** 到着地点（?spawn= と時空移動の要求）。camYaw はカメラが置かれる側の向き（0 = プレイヤーの南） */
export const CHRONICLE_SPAWNS: Record<string, SpawnPoint> = {
  // 2026年の路地のかんばんから：路地の南の端で、北（通り）を向く
  v7_alley: { pos: v(-10.9, 0, 22.4), facing: YAW.north, camYaw: 0.15, camPitch: 0.2 },
  // 通り（工房の前）
  v7_street: { pos: v(-16.6, 0, 11.2), facing: YAW.south, camYaw: YAW.north + 0.25, camPitch: 0.22 },
  // 工房の中（表の戸口を入ったところ）
  v7_workshop: { pos: v(-16.6, 0, 15.2), facing: YAW.south, camYaw: 0.0, camPitch: 0.42 },
  // 広場（工房の裏口の前。時の鐘人形を見上げる）
  v7_plaza: { pos: v(-20.5, 0.03, 25.0), facing: Math.atan2(-(-28.6 + 20.5), -(41.2 - 25.0)), camYaw: 0.3, camPitch: -0.05 },
  // 路地のおく（ほこらの前）
  v7_shrine: { pos: v(-7.6, 0, 26.2), facing: YAW.west, camYaw: YAW.east, camPitch: 0.2 },
  // 帰還の光の輪の前
  v7_return: { pos: v(-5.6, 0, 27.2), facing: Math.atan2(-(RETURN_RING.x + 5.6), -(RETURN_RING.z - 27.2)), camYaw: -1.1, camPitch: 0.2 },
}

/** 夜明けの太陽の向き（地面 → 太陽）。路地のおくから東の城の方。el は高さ（度） */
export function dawnSunDir(elDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const el = (elDeg * Math.PI) / 180
  // 真東から少しだけ南（城の上）
  const az = 0.06
  return out.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize()
}

/** 遠景の家を置かない範囲（world/edo/scene.ts の keepOut） */
export const KEEP_OUT = [
  // 広場と路地のおく（店の裏〜南の家並みの少し先）
  { x0: -52, x1: 14, z0: 20, z1: 58 },
  // 朝日の通り道（上流の台地の家）
  { x0: 12, x1: 75, z0: 19, z1: 34 },
] as const
