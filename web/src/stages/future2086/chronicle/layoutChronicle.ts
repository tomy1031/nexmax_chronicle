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

/** 足場（上面の高さ・範囲）。rail：手すり付き */
export type Ledge = { id: string; y: number; x0: number; x1: number; z0: number; z1: number; rail?: boolean }

/** 塔の西の壁の足場（下から）。l2 = 針の橋の向こう（C。ここから通りの向こうへぶら下がってわたる）、l4 = 時計の部分の下をぐるりと回る回廊（E） */
const LEDGES: Ledge[] = [
  // 針の橋の向こうの、手すり付きのバルコニー（C）。西の手すりは、まん中を空けておく（光る輪へ飛びつく所）
  { id: 'l2', y: 7.4, x0: 4.2, x1: TX0, z0: TZ0, z1: TZ1, rail: true },
  // 時計の部分の下をぐるりと回る回廊（E。西の側を、がれきをよけて南へ）
  { id: 'l4', y: CK.y0, x0: 4.2, x1: CK.x0, z0: -25.2, z1: -18.6, rail: true },
]

/** 金具（pull_player）：壁の金具の位置と着地点。下から上へ */
export type HookSpec = { id: string; point: THREE.Vector3; landing: THREE.Vector3; via?: THREE.Vector3 }

const HOOKS: HookSpec[] = [
  { id: 'clock_hook_top', point: v(4.68, 22.85, -22.4), landing: v(6.0, DECK_Y, -22.4), via: v(4.6, 23.9, -22.4) },
]

/**
 * 4 章の時計台のぼり（アクション）。通りの両側のビル（西の段々のビル・東の段々のビル）とつないで、通りの上をぐるりと回りながらのぼる。下から：
 * (1) 回る大歯車（3 枚。乗ると一緒に回る）を Space でとびうつって、北の足場 A へ
 * (2) 回る歯車のふちの金具：上に回ってきて金色に光った時だけ J → 渡り廊下 B へ
 * (3) 渡り廊下 B：壁から黒い手がふりおろす（赤い輪）→ 輪の外へよけながら、南の端へ
 * (4) 大きな針（長い分針。軸は C の北の端）：北で止まると B の南の端へかかる橋になる。止まったらわたって C へ
 * (5) C → 光る輪①にぶら下がって、通りの向こう（西のビルのかんばんの足場 W1）へ
 * (6) W1 → 光る輪②にぶら下がって、西のビルの壁ぞいに北の足場 W2 へ
 * (7) W2 → 光る輪③にぶら下がって、通りをこえて東のビルの足場 N1 へ
 * (8) N1 → 東のビルの壁の回る歯車の金具（金色に光った時だけ J）→ 時計の下の回廊 E
 * (9) 回廊 E：赤い輪にがれきが落ちてくる → よけながら南へ　(10) てっぺんの金具（J）→ 屋上
 * 段ごとにやり直しの位置（CHECKPOINTS）。落ちたら、着いたことのあるいちばん上の位置へ
 */
export type GearSpec = { c: THREE.Vector3; r: number; w: number }
export type GearHookSpec = {
  id: string
  /** 歯車の中心（壁の面に立つ。軸は X） */
  c: THREE.Vector3
  r: number
  /** 回る速さ（rad/s） */
  w: number
  /** 金具が「上」にいるとみなす角度の幅（てっぺんを 0 として ±） */
  window: number
  landing: THREE.Vector3
  via: THREE.Vector3
  /** 待つ所（ここから見上げる） */
  wait: THREE.Vector3
}

/**
 * ぶら下がりの輪（swing_anchor）：通りの上の電線、ビルの壁の腕から下がる。from の足場の端で J → こいで → to の足場の上で Space。
 * 輪は、わたる先の足場の手前 0.6m より手前で、高すぎない所（見上げる角 54° まで・とどく 8.6m まで）に置く（swingsim で、Space をおしてよい時間が長い所）
 */
export type SwingRingSpec = {
  id: string
  /** 輪（ぶら下がる点） */
  anchor: THREE.Vector3
  rope: number
  /** わたる向き（水平の単位） */
  dir: THREE.Vector3
  /** 飛びつく所（from の足場の端）と、着く所（to の足場のまん中） */
  start: THREE.Vector3
  land: THREE.Vector3
  /** 向こうの足場のうしろの壁（わたる向きの座標。こぎすぎて壁に入りそうになったら、手をはなして足場へ落とす） */
  wall?: number
  /** 吊る物：通りをまたぐ電線（両はしの x）／壁から出た腕（壁の x） */
  hang: { kind: 'cable'; x0: number; x1: number; y: number; y1?: number } | { kind: 'arm'; wallX: number; y: number }
}

const COURSE_A: Ledge = { id: 'A', y: 2.75, x0: 2.4, x1: 6.2, z0: -32.4, z1: -29.7 }
const COURSE_B: Ledge = { id: 'B', y: 7.4, x0: 4.6, x1: 6.2, z0: -33.0, z1: -28.6, rail: true }
/** 西の段々のビルの東の面の、かんばんの足場（W1：南・低い／W2：北・高い）と、東の段々のビルの西の面の足場（N1：B の上） */
/** C の西へ張り出したバルコニー（光る輪①へ飛びつく所。塔の壁から 2.5m はなれて、カメラがうしろに下がれるように） */
const LEDGE_C2: Ledge = { id: 'C2', y: 7.4, x0: 2.0, x1: 4.2, z0: -22.6, z1: -20.0 }
const LEDGE_W1: Ledge = { id: 'W1', y: 8.2, x0: -6.0, x1: -3.6, z0: -24.4, z1: -20.6 }
const LEDGE_W2: Ledge = { id: 'W2', y: 9.8, x0: -6.0, x1: -2.6, z0: -33.4, z1: -29.6 }
const LEDGE_N1: Ledge = { id: 'N1', y: 11.6, x0: 3.6, x1: 6.0, z0: -33.4, z1: -29.6 }
const LEDGE_E: Ledge = { id: 'E', y: CK.y0, x0: 4.2, x1: CK.x0, z0: -25.2, z1: -18.6 }

export const COURSE = {
  /** 大歯車（上面の中心・半径・回る速さ）。乗っている間は一緒に回る */
  // すき間は 0.3m ほど（落ちても、すき間にはまらない）。高さは 0.7m ずつ（とべる高さ 0.92m）
  gears: [
    { c: v(2.1, 0.7, -22.95), r: 1.15, w: 0.5 },
    { c: v(2.55, 1.4, -25.53), r: 1.15, w: -0.55 },
    { c: v(3.0, 2.05, -28.1), r: 1.15, w: 0.6 },
  ] as GearSpec[],
  A: COURSE_A,
  /** 北の足場 A の上の、建物の壁の大歯車の金具 → B */
  hook1: { id: 'gear_hook_1', c: v(6.12, 4.9, -31.0), r: 1.7, w: 0.75, window: 0.85, landing: v(5.4, 7.4, -32.4), via: v(4.2, 8.7, -32.0), wait: v(3.1, 2.75, -31.0) } as GearHookSpec,
  B: COURSE_B,
  /** 黒い手がはらう帯（B の上、建物の壁ぞい） */
  sweep: { x: 6.15, y: 7.4, z0: COURSE_B.z0, z1: COURSE_B.z1 },
  /** 大きな針：軸（C の北の端。上面の高さ）・長さ・幅。北で dwell 秒止まって B へかかる → 西（通りの上）へ回って away 秒 → もどる */
  hand: { pivot: v(5.0, 7.4, -23.45), len: 5.25, width: 1.1, dwell: 3.2, away: 2.0, travel: 2.4 },
  /** 通りの上の、ぶら下がりの輪（C → W1 → W2 → N1） */
  C2: LEDGE_C2,
  W1: LEDGE_W1,
  W2: LEDGE_W2,
  N1: LEDGE_N1,
  swings: [
    { id: 'swing_ring_1', anchor: v(-2.9, 14.8, -21.3), rope: 4.5, dir: v(-1, 0, 0), start: v(2.25, 7.4, -21.3), land: v(-4.6, LEDGE_W1.y, -21.3), wall: -6.0, hang: { kind: 'cable', x0: -6.9, x1: TX0, y: 16.3, y1: 15.3 } },
    { id: 'swing_ring_2', anchor: v(-4.7, 15.6, -29.0), rope: 4.5, dir: v(0, 0, -1), start: v(-4.7, LEDGE_W1.y, -24.1), land: v(-4.7, LEDGE_W2.y, -31.6), hang: { kind: 'arm', wallX: -6.0, y: 16.8 } },
    { id: 'swing_ring_3', anchor: v(2.7, 17.4, -31.5), rope: 4.5, dir: v(1, 0, 0), start: v(-2.8, LEDGE_W2.y, -31.5), land: v(4.6, LEDGE_N1.y, -31.5), wall: 6.0, hang: { kind: 'cable', x0: -6.0, x1: 6.0, y: 18.8 } },
  ] as SwingRingSpec[],
  /** 東のビルの西の壁の、回る歯車の金具（N1 の南の上）→ E（時計の下の回廊の北西のすみ） */
  hook2: { id: 'gear_hook_2', c: v(6.12, 15.0, -27.2), r: 1.25, w: -0.75, window: 0.85, landing: v(4.65, CK.y0, -24.6), via: v(3.9, 17.6, -25.9), wait: v(4.8, LEDGE_N1.y, -29.95) } as GearHookSpec,
  /** がれきが落ちる所（E の西の帯） */
  debris: { x0: 4.25, x1: CK.x0 - 0.05, z0: -25.0, z1: -19.0, y: CK.y0 },
  /** てっぺんの金具をねらえる所（E の西の帯の、この z より南） */
  topFromZ: -21.4,
} as const

export type CheckpointId = 'street' | 'A' | 'B' | 'C' | 'W1' | 'W2' | 'N1' | 'E'

/** やり直しの位置（下から）。area：そこに立ったら、その位置まで進んだことにする。輪の前の段は、輪へ飛びつく所 */
export const CHECKPOINTS: ReadonlyArray<{ id: CheckpointId; pos: THREE.Vector3; area: Ledge }> = [
  { id: 'street', pos: v(0.6, 0, -21.4), area: { id: 'street', y: 0, x0: -6, x1: 6, z0: -34, z1: -19.6 } },
  { id: 'A', pos: v(3.2, COURSE_A.y, -31.0), area: COURSE_A },
  { id: 'B', pos: v(5.4, COURSE_B.y, -32.4), area: COURSE_B },
  { id: 'C', pos: v(3.0, 7.4, -21.3), area: { ...LEDGES[0], x0: LEDGE_C2.x0 } },
  { id: 'W1', pos: v(-4.7, LEDGE_W1.y, -23.6), area: LEDGE_W1 },
  { id: 'W2', pos: v(-4.2, LEDGE_W2.y, -31.5), area: LEDGE_W2 },
  { id: 'N1', pos: v(4.8, LEDGE_N1.y, -30.2), area: LEDGE_N1 },
  { id: 'E', pos: v(4.65, CK.y0, -24.6), area: LEDGE_E },
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
  /** トワが立つ所（屋上の南の縁の胸壁のすぐ内側。広場から見上げて、屋上の床に隠れないように） */
  towa: { pos: v(7.5, DECK_Y, -19.62), yaw: Math.PI },
  /** 12章：時計台の上の大きなゆらぎ（空を大きく裂く所） */
  seamTop: v(7.5, 28.8, -21.9),
  /** のぼり始める所（通りの上。最初の大歯車の南西） */
  foot: v(0.6, 0, -21.4),
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
  // 足場の北の端は、止めた歯車の一番上の歯と同じ奥行きまで、東の端は歯のそばまで（歯から西へまっすぐ跳べば乗れる。
  // 回る歯の先は y≈3.1 より下を通るので、足場の板（上面 3.8）にはぶつからない）
  karakuri: { face: v(7.83, 4.85, -46.0), ledgeY: 3.8, ledge: { x0: 7.15, x1: 9.05, z0: -49.45, z1: -44.95 } },
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
  tree: v(18.4, 0, -38.3),
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

/** 人・通りの植え込みを置かない所（時計台の足元とのぼりのコース・地下の入口・跡地の門の前・ソラのわっかと展示の台の前（リングの中の体験客も）） */
export const CLEAR_AREAS: GroundRect[] = [
  { x0: -6.0, x1: -2.8, z0: -32.0, z1: -23.0 },
  { x0: -0.2, x1: 6.4, z0: -34.0, z1: -19.6 },
  { x0: 3.2, x1: 6.4, z0: -43.0, z1: -35.6 },
  { x0: -12.4, x1: -5.0, z0: -5.6, z1: 2.2 },
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
