// 1970年 千里丘陵・万国博覧会（架空の会場）の配置。docs/中盤シナリオとワールド構成_v1.md §3。
// 北は -Z。地面は y=0。区画どうしはロード無しでつながる（セミオープン）。
//   中央広場（到着・大屋根）／東：電気の館（ミチの作業台）／西：空中ロープウェイ（池の上を振り子で渡る）／
//   南西：日本庭園の竹林（池の小島）／北東：工事中の展示区画（欠けの群れ）／北：未来の塔（頂上に錨）
import * as THREE from 'three'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type Rect = { x0: number; x1: number; z0: number; z1: number }

export const X = {
  /** 歩ける範囲（見えない壁） */
  BOUNDS: { x0: -86, x1: 74, z0: -88, z1: 54 } as Rect,

  // ---------------------------------------------------------------- 中央広場
  PLAZA: { x0: -26, x1: 26, z0: -22, z1: 24 } as Rect,
  /** 大屋根（鉄骨の立体トラス）。下弦 y0・上弦 y1 */
  ROOF: { x0: -22, x1: 22, z0: -15, z1: 15, y0: 15, y1: 17.2, step: 4 },
  /** 大屋根を支える柱（x, z） */
  COLUMNS: [
    [-14, -8],
    [14, -8],
    [-14, 8],
    [14, 8],
  ] as Array<[number, number]>,
  /** 到着地点（広場の南。北の塔と黒い輪が正面に見える） */
  ARRIVE: v(0, 0, 18),
  /** 大屋根から吊られた展示カプセル（上に乗れる。時のかけら） */
  CAPSULE: { x: -8, z: 2, top: 6.8, r: 2.6 },
  /** 最初の欠け（広場の北東のすみ：ふしぎな家電の展示台） */
  FIRST_FIGHT: v(9, 0, -7),
  /** 帰りの光の輪 */
  RETURN_RING: v(0, 0, 6),

  // ---------------------------------------------------------------- 電気の館（東）
  PAVILION: { x: 54, z: 0, r: 10, h: 9.5 },
  /** ミチの作業台（館の入口の前の、ひさしの下） */
  WORKBENCH: v(37, 0, 6),
  MICHI_BENCH: v(36.2, 0, 4.6),
  /** 館の裏の倉庫（ひび割れた壁の奥に時のかけら） */
  STORE: { x0: 48, x1: 58, z0: 13, z1: 20 } as Rect,
  /** 倉庫の西の壁（広場の側）のひび割れ */
  STORE_WALL: v(48, 1.4, 16.5),
  /** 広場から館への動く歩道（屋根付き） */
  WALKWAY: { x0: 26, x1: 44, z: -4 },

  // ---------------------------------------------------------------- 空中ロープウェイ（西）
  ROPE: {
    /** 鉄塔（x, z）と乗り場の高さ・端 */
    t1: v(-41, 0, 0),
    t2: v(-64, 0, 0),
    platY: 8,
    /** 乗り場の床の範囲（鉄塔 1：x0〜edge1／鉄塔 2：edge2〜x1） */
    plat1: { x0: -44, x1: -47, z0: -2.6, z1: 2.6 },
    plat2: { x0: -57, x1: -62.4, z0: -3, z1: 3 },
    /** 鉄塔 2 の機械室の屋根（乗り場の上） */
    machine: { x0: -66, x1: -62.2, z0: -2.4, z1: 2.4, y: 12.5 },
    /** 鉄塔 1 の乗り場へ飛びつく金具（床の南のふちの下） */
    hook: { point: v(-45.2, 7.45, 2.95), landing: v(-45.4, 8, 1.3), via: v(-45.2, 9.4, 3.2) },
    /** 鉄塔 2 の機械室の屋根へ飛びつく金具 */
    hook2: { point: v(-61.85, 11.95, 0), landing: v(-63.6, 12.5, 0.4), via: v(-61.7, 13.8, 0) },
    /** ゴンドラの吊り輪（振り子） */
    anchor: v(-52, 14.3, 0),
    rope: 5,
    /** 係員の帽子（鉄塔 1 の横桁に引っかかっている） */
    hat: v(-38.6, 5.2, -1.4),
  },
  /** ロープウェイの下の池（落ちると最後に立っていた所へ） */
  POND_W: { x0: -57, x1: -47, z0: -13, z1: 13 } as Rect,
  ROPE_STAFF: v(-34, 0, 5.5),

  // ---------------------------------------------------------------- 日本庭園の竹林（南西）
  GARDEN: { x0: -54, x1: -18, z0: 24, z1: 52 } as Rect,
  POND_G: { x0: -45, x1: -29, z0: 29, z1: 43 } as Rect,
  ISLAND: { x: -37, z: 35.5, r: 3.1, y: 0.3 },
  /** 小島の石灯籠（飛びつく）と、南の岸の石灯籠（帰り） */
  LANTERN: v(-36.3, 0.3, 35.0),
  LANTERN_SHORE: v(-37.4, 0, 45.2),
  /** 迷子の子ども（竹林の入口で欠けに囲まれている）と親（広場の南） */
  CHILD: v(-24, 0, 31),
  PARENTS: v(-8, 0, 21.5),
  /** 竹やぶの奥の隠し場所 */
  BAMBOO_SECRET: v(-50.5, 0, 48.5),

  // ---------------------------------------------------------------- 工事中の展示区画（北東）
  SWARM: v(30, 0, -38),
  SWARM_AREA: { x0: 20, x1: 42, z0: -48, z1: -28 } as Rect,

  // ---------------------------------------------------------------- 未来の塔（北）
  TOWER: { x: 0, z: -62, r: 4.6, h: 33, deckY: 28, deckR: 9, balconies: [7, 14, 21] as number[], balconyR: 6.6 },
  /** 塔の囲い（欠けた鉄骨）の半径と、正面のひび割れた壁 */
  FENCE_R: 17,
  TOWER_WALL: v(0, 1.6, -45),
  /** 錨（黒い輪）と錨の糸の結び目 */
  ANCHOR_RING: v(0, 42, -62),
  ANCHOR_KNOT: v(0, 31.6, -62),
  /** ミチが合図を送る場所（塔の前の広場） */
  MICHI_SIGNAL: v(-3.2, 0, -41.5),
} as const

/** 塔の外側の金具（pull_player）。下から順に。床のふちの下に吊ってある（下の段から見上げて狙える）。landing は手すりの内側 */
export function towerHooks(): Array<{ point: THREE.Vector3; landing: THREE.Vector3; via: THREE.Vector3; facing: THREE.Vector3 }> {
  const T = X.TOWER
  const out: Array<{ point: THREE.Vector3; landing: THREE.Vector3; via: THREE.Vector3; facing: THREE.Vector3 }> = []
  // 南 → 西 → 北 → 東（一段ごとに塔をまわる）
  const dirs: Array<[number, number]> = [
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 0],
  ]
  const levels = [...T.balconies, T.deckY]
  for (let i = 0; i < levels.length; i++) {
    const [dx, dz] = dirs[i]
    const R = i === levels.length - 1 ? T.deckR : T.balconyR
    const y = levels[i]
    out.push({
      point: v(T.x + dx * (R + 0.35), y - 0.55, T.z + dz * (R + 0.35)),
      landing: v(T.x + dx * (R - 1.1), y, T.z + dz * (R - 1.1)),
      via: v(T.x + dx * (R + 0.45), y + 1.3, T.z + dz * (R + 0.45)),
      facing: v(dx * 0.25, -1, dz * 0.25).normalize(),
    })
  }
  return out
}

/** 部品（はじくNMClaw の材料）・時のかけら */
export const PARTS = {
  ropeway: { pos: v(-60, 8, 1.4), name: '放電コイル', flag: 'expo_part_ropeway' },
  bamboo: { pos: v(-37.8, 0.3, 34.4), name: '共鳴ばね', flag: 'expo_part_bamboo' },
  swarm: { pos: v(30, 0, -40), name: '試作の爪', flag: 'expo_part_swarm' },
} as const
export type PartId = keyof typeof PARTS
export const PART_IDS: readonly PartId[] = ['ropeway', 'bamboo', 'swarm']

export const SHARDS = {
  capsule: { pos: v(-8, 6.8, 2), flag: 'expo_shard_capsule' },
  ropeway: { pos: v(-64.8, 12.5, -1.2), flag: 'expo_shard_ropeway' },
  bamboo: { pos: X.BAMBOO_SECRET.clone(), flag: 'expo_shard_bamboo' },
  store: { pos: v(53, 0, 17.5), flag: 'expo_shard_store' },
  tower: { pos: v(0, 14, -68.2), flag: 'expo_shard_tower' },
} as const
export type ShardId = keyof typeof SHARDS
export const SHARD_IDS: readonly ShardId[] = ['capsule', 'ropeway', 'bamboo', 'store', 'tower']

/** 到着地点（ID → 位置と向き） */
export const SPAWNS: Record<string, { pos: THREE.Vector3; facing: number; camYaw: number; camPitch: number }> = {
  arrive: { pos: X.ARRIVE.clone(), facing: 0, camYaw: 0, camPitch: 0.16 },
  plaza: { pos: v(0, 0, 12), facing: 0, camYaw: 0, camPitch: 0.18 },
  workbench: { pos: v(33.5, 0, 6), facing: -Math.PI / 2, camYaw: -Math.PI / 2, camPitch: 0.2 },
  tower: { pos: v(0, 0, -40), facing: 0, camYaw: 0, camPitch: 0.3 },
  deck: { pos: v(0, X.TOWER.deckY, -62 + 6.5), facing: 0, camYaw: 0, camPitch: 0.25 },
  return: { pos: v(0, 0, 10.5), facing: 0, camYaw: 0, camPitch: 0.2 },
}
