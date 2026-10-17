// 2086年 ナンバタウン「時代博覧祭」の会場の配置（m）。X=東、Z=南、Y=上。
// 広場は約 40×40m（x・z とも -20〜20）。南の入口から北を向くと、正面に博覧祭のアーチと北へ延びる通り、
// その先の遠景にリングをまとった中央タワーと浮島、左奥に大阪城の丘が見える。
// ・西：ソラの IDO 展示ブース（リング型のポータル）と、その上の空中回廊（西ウイング）
// ・東：屋台の列（量産型ネクマックスが店番）
// ・北東：祭りのステージ　・北：空中回廊（北ウイング）。通りの真上は山車を通すため橋が上がっていて途切れている
import * as THREE from 'three'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export const F = {
  /** 広場（床の高さ 0） */
  PLAZA: { x0: -20, x1: 20, z0: -20, z1: 20 },
  /** 北へ延びる通り（遠景のビューの軸） */
  STREET: { x0: -6, x1: 6, z1: -20, z0: -70 },
  /** 空中回廊の床の高さ */
  WALK_Y: 4.5,
  /** 西ウイング（ブースの上） */
  WALK_W: { x0: -19.5, x1: -15, z0: -19.5, z1: 10 },
  /** 北ウイング。x が GAP の間は途切れている（振り子で渡る） */
  WALK_N: { x0: -19.5, x1: 19.5, z0: -19.5, z1: -15 },
  GAP: { x0: -3.6, x1: 3.6 },
  /** ソラの IDO 展示ブース（台座の中心と半径） */
  BOOTH: { x: -8.6, z: -1.6, r: 3.6, h: 0.18 },
  /** リング型ポータル：中心・半径・向き（正面の法線の yaw。0 = +Z 向き） */
  PORTAL: { x: -9.4, y: 2.45, z: -2.6, r: 2.0, yaw: 0.42 },
  /** 部品の作業台 */
  PARTS_TABLE: { x: -4.3, z: -3.9, rot: 1.05 },
  /** ソラの操作卓 */
  CONSOLE: { x: -5.9, z: -2.25, rot: -2.5 },
  /** 届かない所に積んだ部品箱（pull_object）の山 */
  CRATE_STACK: { x: -12.4, z: -6.6, h: 3.0 },
  /** 屋台の列（東）：中心の z と幅 */
  STALLS: { x: 15.2, zs: [-6.2, -1.6, 3.0, 7.6], w: 4.0, d: 2.6 },
  /** 祭りのステージ（北東） */
  STAGE: { x0: 7.5, x1: 17.5, z0: -13.6, z1: -8.4, h: 1.0 },
  /** 通りの上のアーチ（振り子の支点を吊る） */
  ARCH: { z: -17.2, x: 7.2, top: 12.2 },
  /** 南の入口の避難ゲート（夜の目的地） */
  SOUTH_GATE: { x0: -5, x1: 5, z0: 16.5, z1: 20 },
  /** 遠景の中央タワー（リング付き） */
  TOWER: { x: 6, z: -240, h: 165 },
  /** 大阪城の丘（遠景・左奥） */
  CASTLE: { x: -118, y: -2, z: -262 },
  /** オルム（夜空の黒い環）：中心と半径。広場の中心を向く */
  ORUM: { x: 62, y: 178, z: -345, r: 92 },
} as const

/** 振り子の支点（アーチの梁から下がる輪） */
export const SWING = {
  anchor: v(0, F.WALK_Y + 6.3, F.ARCH.z),
  rope: 5.0,
  /** 落ちたときの復帰地点（両側の回廊の端） */
  checkpoints: [v(-5.2, F.WALK_Y, F.ARCH.z), v(5.2, F.WALK_Y, F.ARCH.z)],
}

/** 西ウイングの縁の街灯に付いた金具（pull_player） */
export const HOOK = {
  point: v(-14.72, F.WALK_Y + 1.6, 2.2),
  landing: v(-16.4, F.WALK_Y, 2.2),
  via: v(-15.2, F.WALK_Y + 1.5, 2.2),
}

/** 話しかけられる・調べられる場所（F）。reach は水平距離 */
export type Interactable = { id: 'sora' | 'ido_exhibit' | 'parts_table'; pos: THREE.Vector3; reach: number; label: string }

/**
 * 物語のきっかけになる範囲（足元の位置で判定。y は床の高さの目安）。
 * シェルは「地面に立っている（ワイヤー移動中・振り子中でない）」ときだけ判定すること（振り子の途中で向こう岸の上を通っても進まないように）
 */
export type Zone = { id: ZoneId; x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }
export type ZoneId = 'booth' | 'upper_walkway' | 'far_platform' | 'south_gate' | 'plaza_center'

export const ZONES: Zone[] = [
  { id: 'booth', x0: F.BOOTH.x - 5.2, x1: F.BOOTH.x + 5.2, z0: F.BOOTH.z - 5, z1: F.BOOTH.z + 5, y0: -1, y1: 2 },
  { id: 'upper_walkway', x0: F.WALK_W.x0, x1: F.WALK_W.x1, z0: F.WALK_N.z0, z1: F.WALK_W.z1, y0: F.WALK_Y - 0.3, y1: F.WALK_Y + 0.8 },
  { id: 'far_platform', x0: F.GAP.x1 + 0.4, x1: F.WALK_N.x1, z0: F.WALK_N.z0, z1: F.WALK_N.z1, y0: F.WALK_Y - 0.3, y1: F.WALK_Y + 0.8 },
  { id: 'south_gate', x0: F.SOUTH_GATE.x0, x1: F.SOUTH_GATE.x1, z0: F.SOUTH_GATE.z0, z1: F.SOUTH_GATE.z1, y0: -1, y1: 3 },
  { id: 'plaza_center', x0: -6, x1: 6, z0: -6, z1: 8, y0: -1, y1: 2 },
]

export function zoneAt(p: THREE.Vector3): ZoneId | null {
  for (const z of ZONES) {
    if (p.x >= z.x0 && p.x <= z.x1 && p.z >= z.z0 && p.z <= z.z1 && p.y >= z.y0 && p.y <= z.y1) return z.id
  }
  return null
}

/** 向き（モデルの正面 -Z を from → to へ） */
export function yawTo(from: THREE.Vector3, to: THREE.Vector3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}
