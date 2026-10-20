// 物語 v7「ネクマックスと、時を裂く爪」の 2086年ナンバタウンに足す舞台の配置（m）。X=東、Z=南、Y=上（layout.ts の F と同じ）。
// 向き：人・ネクマックスの yaw はモデルの正面 -Z を回す角（faceYaw）。建物の yaw（shrine・kanban）は正面の法線 (sin, 0, cos)。
// 歩く流れ：広場（ソラのブース・屋台）→ 北の通りの入口（アーチの先）の東の角に時計台、西に地下通路の入口 →
// さらに北、通りの東側に NEXTMAKE の跡地（はじめの歴史＝新館のビル／社長がほこらを守った歴史＝古い建物と中庭）。
// ブースから時計台まで約 25m、跡地の門まで約 40m（走って 10 秒ほど）。
// ・時計台：北東の段々のビルの角に食いこんで立つ（高さ約 20m）。広場の中央から見ると、夜空のオルム（北北東）のすぐ手前に
//   てっぺんのトワが立つ。のぼるのは通りに面した西の壁（金具 6 個＋とちゅうの足場）
// ・地下通路：通りの西側の入口（ガラスの屋根）から階段で 4.4m 下へ。通路の奥の小さな部屋にかくれる
// ・ベンチ：広場の南西のすみ（人のいない静かな所）　・星のキーホルダーの屋台：東の屋台の列のいちばん南
import * as THREE from 'three'
import type { GroundRect } from '../groundHoles'
import { F } from '../layout'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 向き（モデルの正面 -Z を from → to へ） */
export function faceYaw(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z))
}

// ------------------------------------------------------------------ 時計台

const TX0 = 5.6
const TX1 = 9.4
const TZ0 = -23.8
const TZ1 = -20.0
/** 時計の部分（胴より少し太い） */
const CK = { x0: 5.1, x1: 9.9, z0: -24.3, z1: -19.5, y0: 16.0, y1: 21.6 }
const DECK_Y = 22.4

/** 西の壁の足場（上面の高さ・範囲）。ネクマックスがのぼる順 */
export type Ledge = { id: string; y: number; x0: number; x1: number; z0: number; z1: number; rail?: boolean }

const LEDGES: Ledge[] = [
  { id: 'l1', y: 3.6, x0: 4.4, x1: TX0, z0: -21.9, z1: -20.3 },
  // とちゅうの足場（手すり付きのバルコニー。チェックポイント）
  { id: 'l2', y: 7.4, x0: 4.2, x1: TX0, z0: TZ0, z1: TZ1, rail: true },
  { id: 'l3', y: 11.2, x0: 4.4, x1: TX0, z0: -23.6, z1: -22.0 },
  // 時計の部分の下をぐるりと回る回廊（西の側に着く。2 つ目のとちゅうの足場）
  { id: 'l4', y: CK.y0, x0: 4.2, x1: CK.x0, z0: -25.2, z1: -18.6, rail: true },
  // 北西の角の柱の小さな足場
  { id: 'l5', y: 19.2, x0: 4.2, x1: CK.x0, z0: -24.5, z1: -23.62 },
]

/** 金具（pull_player）：壁の金具の位置と着地点。下から上へ */
export type HookSpec = { id: string; point: THREE.Vector3; landing: THREE.Vector3; via?: THREE.Vector3 }

const HOOKS: HookSpec[] = [
  { id: 'clock_hook_1', point: v(TX0 - 0.17, 5.1, -21.1), landing: v(5.0, 3.6, -21.1) },
  { id: 'clock_hook_2', point: v(TX0 - 0.17, 8.85, -22.7), landing: v(4.95, 7.4, -22.7) },
  { id: 'clock_hook_3', point: v(TX0 - 0.17, 12.65, -22.8), landing: v(5.0, 11.2, -22.8), via: v(4.6, 12.8, -22.6) },
  { id: 'clock_hook_4', point: v(CK.x0 - 0.17, 17.4, -19.86), landing: v(4.65, 16.0, -20.2), via: v(4.3, 17.3, -21.3) },
  { id: 'clock_hook_5', point: v(CK.x0 - 0.17, 20.6, -24.06), landing: v(4.65, 19.2, -24.06), via: v(4.3, 20.4, -23.7) },
  { id: 'clock_hook_top', point: v(4.68, 22.85, -22.9), landing: v(6.0, DECK_Y, -22.9), via: v(4.6, 23.9, -22.9) },
]

export const TOWER = {
  /** 胴（四角い塔）の足元 */
  x0: TX0,
  x1: TX1,
  z0: TZ0,
  z1: TZ1,
  cx: (TX0 + TX1) / 2,
  cz: (TZ0 + TZ1) / 2,
  clock: CK,
  /** 文字盤の中心の高さと半径（4 面） */
  faceY: 18.8,
  faceR: 1.5,
  /** てっぺんの足場（屋上）の高さと範囲 */
  deckY: DECK_Y,
  deck: { x0: 4.8, x1: 10.2, z0: -24.6, z1: -19.2 },
  ledges: LEDGES,
  hooks: HOOKS,
  /** トワが立つ所（屋上の南の縁。広場の方を向く） */
  towa: { pos: v(7.5, DECK_Y, -19.95), yaw: Math.PI },
  /** 12章：時計台の上の大きなゆらぎ（空を大きく裂く所） */
  seamTop: v(7.5, 28.8, -21.9),
  /** のぼり始める所（通りの上） */
  foot: v(3.3, 0, -21.6),
  /** 黒い手が壁をなでる所（西の壁の帯。y はその帯の高さ。予告の光をここに出す） */
  sweeps: [5.6, 9.4, 13.8, 17.6, 20.9].map((y, i) => ({ id: `sweep_${i + 1}`, y, x: TX0 - 0.03, z0: CK.z0, z1: CK.z1 })),
} as const

// ------------------------------------------------------------------ 地下通路（祭りの地下通路「なんばウォーク」の一部）

const UFLOOR = -4.4
const UCEIL = -1.0
export const UNDER = {
  floorY: UFLOOR,
  /** 天井（＝通りの床の当たり判定の下の面） */
  ceilY: UCEIL,
  /** 地面の穴（階段の吹き抜け）。階段は南（z1・地上）から北（z0・地下）へ下る */
  hole: { x0: -5.6, x1: -3.2, z0: -31.4, z1: -24.0 } as GroundRect,
  /** 入口のガラスの屋根（階段を囲む） */
  kiosk: { x0: -5.8, x1: -3.0, z0: -31.6, z1: -23.4, h: 2.9 },
  /** 通路（階段の下から北へ。奥は通行止めのシャッター） */
  passage: { x0: -6.4, x1: -0.6, z0: -43.4, z1: -31.4 },
  /** 小さな部屋（通路の西の壁の戸口から入る。ネクマックスがかくれる） */
  room: { x0: -11.8, x1: -6.4, z0: -41.8, z1: -35.8 },
  door: { z0: -39.6, z1: -38.0 },
  /** 階段の上（地上）と下（地下） */
  stairsTop: v(-4.4, 0, -23.6),
  stairsBottom: v(-4.4, UFLOOR, -32.2),
  /** かくれる所（部屋の奥の箱のかげ）と向き */
  hide: { pos: v(-10.5, UFLOOR, -40.5), yaw: faceYaw({ x: -10.5, z: -40.5 }, { x: -6.4, z: -38.8 }) },
  /** ソラが立ち止まる所（階段を下りてすぐ） */
  sora: { pos: v(-3.6, UFLOOR, -34.2), yaw: Math.PI * 0 },
  /** 黒い手がやぶって出てくる天井の穴（中心）。地上では同じ x,z の通りの床 */
  handHole: v(-2.7, UCEIL, -36.4),
  /** 地下にいるかどうかの判定の範囲（y < -0.6 で使う） */
  region: { x0: -12.2, x1: 0.0, z0: -44.0, z1: -23.4 } as GroundRect,
  /**
   * 地下にいる間の落下の下限（player/controller.ts の MOVE_TUNING.killY。既定 -1.3 では通路に下りたとたん戻されるので、
   * 地下の範囲にいる間だけステージが下げる。chronicleKillY() を毎フレーム使う）
   */
  killY: -6.2,
} as const

/** その位置で使う落下の下限（地下の範囲にいれば UNDER.killY、それ以外は既定 -1.3） */
export function chronicleKillY(p: { x: number; z: number }, normal = -1.3): number {
  const r = UNDER.region
  return p.x >= r.x0 && p.x <= r.x1 && p.z >= r.z0 && p.z <= r.z1 ? UNDER.killY : normal
}

// ------------------------------------------------------------------ NEXTMAKE の跡地（路地のあと）

const SX0 = 6.4
const SX1 = 28.0
const SZ0 = -54.6
const SZ1 = -36.4
export const SITE = {
  x0: SX0,
  x1: SX1,
  z0: SZ0,
  z1: SZ1,
  /** 通りの東側でビルを建てない範囲（buildDistrict の streetEastGap） */
  gap: { z0: -55.0, z1: -36.2 },
  /** 60 年前から立つ古い石のかんばん（通りに面して西を向く） */
  kanban: { pos: v(5.15, 0, -39.1), yaw: -Math.PI / 2 },
  /** 中庭の門（通りに面した塀のすき間） */
  gate: { x0: SX0, x1: 6.95, z0: -41.0, z1: -37.4 },
  /** はじめの歴史：NEXTMAKE 新館 */
  tower: { x0: 7.0, x1: 27.6, z0: -54.2, z1: -36.8, h: 38 },
  /** ほこらを守った歴史：古い建物（東の棟・北の棟）と中庭 */
  oldEast: { x0: 20.6, x1: SX1, z0: SZ0, z1: SZ1, h: 11.4 },
  oldNorth: { x0: SX0, x1: 20.6, z0: SZ0, z1: -49.8, h: 7.8 },
  yard: { x0: 6.95, x1: 20.6, z0: -49.8, z1: SZ1 },
  /** 時の神さまのほこら（東を向く）：台石の中心 */
  shrine: { pos: v(9.6, 0, -46.0), yaw: Math.PI / 2 },
  /**
   * ほこらの屋根の上のからくり時計：ほこらの後ろに立てた木組みの足場（上面 ledgeY）と、その上の時計の箱（文字盤は東向き）。
   * 練習のゴール（止めた歯車の歯からとび移る）
   */
  karakuri: { face: v(7.83, 4.85, -46.0), ledgeY: 3.8, ledge: { x0: 7.15, x1: 8.85, z0: -48.7, z1: -44.95 } },
  /** 北の棟の 2 階の縁側（からくり飾りの見物台）。裏側の足場からしか上がれない */
  balcony: { x0: 11.6, x1: 19.6, z0: -49.8, z1: -48.4, y: 3.0 },
  /**
   * からくり飾りの大歯車（北の棟の壁の前。軸は南北、8 枚の大きな歯）。止めると一番上の歯が足場になり、
   * 縁側 → 歯 → からくり時計の足場 と渡れる（歯の上面は止めたとき約 y=3.4）
   */
  gear: { axle: v(10.3, 2.0, -49.1), r: 1.4, teeth: 8, width: 0.6 },
  /** ゆらぎ（裂くと裏側の足場が見える） */
  seam: v(18.1, 1.5, -46.5),
  /** 裏側の足場（上面の中心。ゆらぎを裂いているあいだだけ乗れる）：地面 → 縁側の東の端 */
  ura: [v(17.6, 0.8, -46.2), v(18.3, 1.6, -47.0), v(18.9, 2.4, -47.75)],
  /** ソラの工具箱：古い建物の縁側（台）の上で、ソラの手から落ちる */
  toolbox: { hand: v(19.05, 1.32, -41.2), deck: { x0: 19.3, x1: 20.6, z0: -48.4, z1: -37.6, h: 0.62 } },
  /** 中庭の古い桜 */
  tree: v(16.6, 0, -39.4),
} as const

// ------------------------------------------------------------------ 広場の小物

/** 4章の終わりにネクマックスがすわりこむベンチ（広場の南西のすみ。噴水の方を向く） */
export const BENCH = (() => {
  const pos = v(-13.1, 0, 15.5)
  return { pos, yaw: faceYaw(pos, { x: 1.5, z: 1.5 }), seatY: 0.46 }
})()

/** 星のキーホルダーの屋台（東の屋台の列のいちばん南。西を向く） */
export const KEY_STALL = { x: F.STALLS.x, z: 11.75, w: 3.2, d: F.STALLS.d, buy: v(F.STALLS.x - F.STALLS.d / 2 - 0.75, 0, 11.75) } as const

// ------------------------------------------------------------------ まとめ（buildFutureScene に渡す変更）

/** 人・通りの植え込みを置かない所（時計台の足元・地下の入口・跡地の門の前） */
export const CLEAR_AREAS: GroundRect[] = [
  { x0: -6.0, x1: -2.8, z0: -32.0, z1: -23.0 },
  { x0: 2.4, x1: 6.2, z0: -25.0, z1: -19.6 },
  { x0: 3.2, x1: 6.4, z0: -43.0, z1: -35.6 },
]

/** 北の通りの行き止まり（跡地の先） */
export const STREET_END_Z = -56.0

/** 地面の穴（地下の階段） */
export const GROUND_HOLES: GroundRect[] = [UNDER.hole]

/** 到着地点・カメラの位置の候補（物語 v7 の場面用） */
export const CHRONICLE_SPOTS = {
  clock_foot: { pos: TOWER.foot.clone(), yaw: faceYaw(TOWER.foot, { x: TOWER.cx, z: TOWER.cz }) },
  clock_mid: { pos: v(4.9, 7.4, -21.2), yaw: -Math.PI / 2 },
  clock_top: { pos: v(7.5, DECK_Y, -22.4), yaw: Math.PI },
  under_top: { pos: v(-4.4, 0, -22.4), yaw: 0 },
  under_room: { pos: v(-9.4, UFLOOR, -38.8), yaw: -Math.PI / 2 },
  site_front: { pos: v(2.2, 0, -40.2), yaw: -Math.PI / 2 },
  courtyard: { pos: v(13.4, 0, -40.0), yaw: faceYaw({ x: 13.4, z: -40.0 }, { x: 9.6, z: -46.0 }) },
  bench: { pos: v(-11.6, 0, 13.9), yaw: faceYaw({ x: -11.6, z: 13.9 }, BENCH.pos) },
  key_stall: { pos: KEY_STALL.buy.clone(), yaw: -Math.PI / 2 },
} as const
