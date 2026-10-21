// 1186年 クメールの都・アルンの寺と村（11章）の配置。座標・到着地点・仕掛けの位置は全部ここ。
// 北は -Z、東は +X。地面は y=0。水面は WATER_Y（池の底には当たり判定が無い＝落ちると最後に立っていた所へ）。
//   北：大きな四角い池（バライ）。西側に水の上の村（板の道でつながる高床の家）、その東に漁師の小屋がとびとびに並び、
//       池の中の島に北の塔。
//   西：村（高床の家・かまど・かご・布・舟・子どもの広場）。村と寺のあいだに南北の水路と、ナーガの手すりの石の橋。
//   中央〜東：アルンの寺（西の門と浮き彫りの回廊、中央の大きな塔の山と大階段、東の塔、南の塔）。
//   南：象の道（赤土）と水田。遠くの北東に、オルムに食べられた森のあと。
import * as THREE from 'three'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type Rect = { x0: number; x1: number; z0: number; z1: number }
export type TowerId = 'n' | 'e' | 's'
export type TimeOfDay = 'afternoon' | 'night' | 'dawn'

/** 小さな塔（北・東・南）の形。front は中央の塔を向く面（階段と鏡の台がある） */
export type SmallTowerDef = {
  id: TowerId
  x: number
  z: number
  /** 塔が立つ地面の高さ（北の塔は島の上） */
  baseY: number
  /** 正面の向き（中央の塔へ向かう水平の単位ベクトル） */
  front: [number, number]
  /** 階段のくずれた段（下から 0 始まり）。南の塔だけ */
  broken: number[]
}

/** 小さな塔の寸法（3 段の基壇。上の台の上に小さな祠堂と鏡の台） */
export const SMALL_TOWER = {
  tiers: [
    { half: 5, h: 2.4 },
    { half: 4, h: 2.4 },
    { half: 3.1, h: 2.4 },
  ],
  /** 上の台の高さ（baseY から） */
  top: 7.2,
  /** 上の台の祠堂（後ろ半分に置く）：中心のずれ・半分の幅・高さ */
  shrine: { back: 1.25, half: 1.15, h: 6.2 },
  /** 鏡の台：正面からのずれ・台の半分の幅・台の高さ・鏡の中心の高さ（上の台から） */
  stand: { front: 1.45, half: 0.42, h: 0.85, mirrorY: 1.75, mirrorR: 0.72 },
  /** 階段：幅・段の区切り（1 区切り＝3 段）・区切りの高さ */
  stairs: { width: 2.4, segs: 6, rise: 1.2, run: 1.3 },
} as const

export const K = {
  /** 歩ける範囲（見えない壁） */
  BOUNDS: { x0: -92, x1: 78, z0: -96, z1: 62 } as Rect,
  /** 水面の高さ（池・水路） */
  WATER_Y: -0.4,

  // ---------------------------------------------------------------- 水
  /** 大きな四角い池（バライ） */
  BARAY: { x0: -90, x1: 54, z0: -94, z1: -40 } as Rect,
  /** 村と寺のあいだの水路（池から南へ） */
  CANAL: { x0: -22, x1: -12, z0: -40, z1: 62 } as Rect,
  /** 岸の石段（到着地点の前で、池へおりる） */
  GHAT: { x0: -42, x1: -26, z: -40, steps: 4 },

  // ---------------------------------------------------------------- 到着
  /** IDO で来た光の輪が開く所（池のほとり） */
  ARRIVE_RING: v(-31, 0, -33.5),

  // ---------------------------------------------------------------- 石の橋（ナーガの手すり）
  /** 水路を東西にわたる石の道（盛り土の上）。x0〜x1 は deckY の高さ、西の端に ramp m の坂、東の端は門の基壇（0.25）へ */
  BRIDGE: { x0: -29.6, x1: -3.8, z0: -6.6, z1: -1.4, deckY: 0.5, ramp: 3, nagaWest: -28.6, nagaEast: -5.6 },

  // ---------------------------------------------------------------- 寺
  /** 寺の境内（石の舗装と、ラテライトの低い塀） */
  COURT: { x0: -2, x1: 62, z0: -38, z1: 38 } as Rect,
  WALL_H: 1.4,
  /** 西の門（ゴープラ）と、浮き彫りの回廊 */
  GOPURA: { x: 0.4, z: -4, halfZ: 4.2, door: 1.6 },
  GALLERY: { xPillar: -1.25, xWall: 2.0, z0: -34, z1: 32, floorY: 0.25, wallH: 3.2, ridge: 4.7 },
  /** 浮き彫り（物語の絵）：回廊の壁の西の面。z の範囲 */
  RELIEF_STORY: { z0: 1.0, z1: 19.0 },
  /** 中央の塔の山（3 段）。cx, cz は中心 */
  PYRAMID: { cx: 26, cz: -4, tiers: [
    { half: 12, y0: 0, y1: 3.2 },
    { half: 9.5, y0: 3.2, y1: 6.4 },
    { half: 7, y0: 6.4, y1: 9.6 },
  ] },
  /** 上の台の高さ */
  TOP_Y: 9.6,
  /** 大階段（西の面）。8 区切り × 3 段。x0 は下の端、x1 は上の台のふち */
  STAIRS: { x0: 6.2, x1: 19, z0: -6.5, z1: -1.5, segs: 8, steps: 3, rise: 1.2, run: 1.6 },
  /** 中央の祠堂（十字形の部屋。四方に入口）。half は本体の半分の幅、porch は入口の張り出し */
  SANCTUARY: { half: 3.5, wall: 0.7, h: 3.4, porch: 1.8, porchHalf: 1.5, door: 1.0, doorH: 2.8, towerTop: 27.5 },
  /** アルン（人の背より大きな青い石）：台座の上の中心 */
  ARUN: v(26, 9.6, -4),
  ARUN_HEIGHT: 2.5,
  ARUN_PEDESTAL: 0.5,
  /** 小さな土の庭（アルンの最後の光が、小さなかけらになって落ちていく土） */
  SHARD_GROUND: v(8.6, 0, 13.2),
  /** 回る鏡の台（東の塔の仕掛け） */
  TURNTABLE: v(40, 0, 10),
  /** 夜明けの光の扉（中央の塔の上の空）と、裏側へ入る場所（扉の真下：上の台の西のふち） */
  DAWN_DOOR: { pos: v(26, 33, -4), normal: v(-1, 0, 0), width: 7, height: 11 },
  URA_ENTRY: v(20.6, 9.6, -4),
  /** 裏側の空間（別担当の buildUraArena）を組み立てる場所。ここは空けておく */
  URA_ORIGIN: v(3000, 0, 0),

  // ---------------------------------------------------------------- 北の塔の島
  ISLAND: { x0: 17, x1: 35, z0: -75, z1: -53, y: 0.8 } as Rect & { y: number },

  // ---------------------------------------------------------------- 村
  VILLAGE: { x0: -90, x1: -24, z0: -38, z1: 40 } as Rect,
  PLAZA: { x: -54, z: 8, r: 9 },
  /** 子どもに「星の形」を教える所（寄り道） */
  STAR_SPOT: v(-51.5, 0, 11.5),
  /** 水の上の村：板の道の高さと、岸からの坂 */
  WALK_Y: 1.4,

  // ---------------------------------------------------------------- 象の道
  ROAD: { z0: 42, z1: 50, x0: -92, x1: 78 },
  /** 水路をわたる石の橋（象の道） */
  ROAD_BRIDGE: { x0: -24, x1: -10, deckY: 0.5 },
  /** 水田（道の南） */
  PADDY: { x0: -88, x1: 74, z0: 52, z1: 62 } as Rect,

  // ---------------------------------------------------------------- 遠景
  /** オルムに「食べられた」森のあと（北東の遠く）：弧の中心・半径・幅・角度の範囲 */
  SCAR: { cx: 92, cz: -46, r: 78, width: 24, a0: -2.25, a1: -1.05, depth: 2.6 },
  /** 夜の空のひび（北東の高い空） */
  SKY_CRACK: { pos: v(120, 150, -330), size: 300 },
  MOON: v(-220, 300, 200),
} as const

/** 小さな塔（北・東・南） */
export const TOWERS: Record<TowerId, SmallTowerDef> = {
  n: { id: 'n', x: 26, z: -66, baseY: K.ISLAND.y, front: [0, 1], broken: [] },
  e: { id: 'e', x: 56, z: -4, baseY: 0, front: [-1, 0], broken: [] },
  s: { id: 's', x: 26, z: 25, baseY: 0, front: [0, -1], broken: [2, 4] },
}
export const TOWER_IDS: readonly TowerId[] = ['n', 'e', 's']

/** 塔の名前（台詞・目標の文言用） */
export const TOWER_NAMES: Record<TowerId, string> = { n: '北の塔', e: '東の塔', s: '南の塔' }

/** 塔のローカル（front 方向を +f、右手を +r）からワールドへ */
export function towerPoint(t: SmallTowerDef, f: number, r: number, y: number): THREE.Vector3 {
  const [fx, fz] = t.front
  // 右手 = front を時計回りに 90°（上から見て）
  const rx = -fz
  const rz = fx
  return v(t.x + fx * f + rx * r, t.baseY + y, t.z + fz * f + rz * r)
}

/** 鏡の台の上の、鏡の中心（ワールド） */
export function mirrorCenter(id: TowerId): THREE.Vector3 {
  const t = TOWERS[id]
  const S = SMALL_TOWER
  return towerPoint(t, S.stand.front, 0, S.top + S.stand.mirrorY)
}

/** アルンの中心（光の筋が集まる所） */
export function arunCenter(): THREE.Vector3 {
  return K.ARUN.clone().setY(K.ARUN.y + K.ARUN_PEDESTAL + K.ARUN_HEIGHT * 0.5)
}

// ------------------------------------------------------------------ 水の上の家

/** 高床の家。deck は家のまわりの縁台（床と同じ高さ）。hooks は軒の金具（そこへ飛びつく） */
export type StiltHouseDef = {
  id: string
  x: number
  z: number
  /** 部屋の幅（x）・奥行き（z） */
  w: number
  d: number
  /** 縁台の張り出し（部屋のまわり） */
  porch: number
  floorY: number
  /** 屋根の色の系統（0..1） */
  hue: number
  /** 水の上か（柱が水へ入る） */
  water: boolean
}

/** 水の上の村（板の道でつながる）と、とびとびの漁師の小屋（クローで飛び移る） */
export const WATER_HOUSES: StiltHouseDef[] = [
  { id: 'v1', x: -70, z: -49, w: 4.2, d: 3.6, porch: 1.2, floorY: K.WALK_Y, hue: 0.1, water: true },
  { id: 'v2', x: -49, z: -50, w: 4.6, d: 3.8, porch: 1.2, floorY: K.WALK_Y, hue: 0.6, water: true },
  { id: 'v3', x: -72, z: -64, w: 4.0, d: 3.6, porch: 1.2, floorY: K.WALK_Y, hue: 0.35, water: true },
  { id: 'v4', x: -49, z: -67, w: 4.4, d: 3.6, porch: 1.2, floorY: K.WALK_Y, hue: 0.8, water: true },
  { id: 'v5', x: -82, z: -74, w: 4.0, d: 3.4, porch: 1.2, floorY: K.WALK_Y, hue: 0.5, water: true },
  { id: 'v6', x: -66, z: -84.5, w: 4.6, d: 3.8, porch: 1.2, floorY: K.WALK_Y, hue: 0.2, water: true },
  // 板の道のいちばん東の家（ここから先はクロー）
  { id: 'va', x: -37, z: -58, w: 3.8, d: 3.4, porch: 1.6, floorY: K.WALK_Y, hue: 0.45, water: true },
  // 漁師の小屋（北の塔への道）
  { id: 'h1', x: -25, z: -64, w: 3.2, d: 3.0, porch: 1.5, floorY: 1.6, hue: 0.15, water: true },
  { id: 'h2', x: -11, z: -66, w: 3.4, d: 3.0, porch: 1.6, floorY: 1.6, hue: 0.7, water: true },
  { id: 'h3', x: -1, z: -71, w: 3.2, d: 3.0, porch: 1.5, floorY: 1.6, hue: 0.4, water: true },
  { id: 'h4', x: 9, z: -66, w: 3.2, d: 3.0, porch: 1.5, floorY: 1.6, hue: 0.9, water: true },
]

/** 板の道（水の上の村。上面は WALK_Y）。幅 2.2 */
export const WALKWAYS: Array<{ a: [number, number]; b: [number, number]; w: number }> = [
  { a: [-60, -41], b: [-60, -82.6], w: 2.4 },
  { a: [-60, -49], b: [-67, -49], w: 2 },
  { a: [-60, -50], b: [-51.7, -50], w: 2 },
  { a: [-60, -64], b: [-69.4, -64], w: 2 },
  { a: [-60, -66], b: [-51.6, -66], w: 2 },
  { a: [-60, -74], b: [-79.4, -74], w: 2 },
  { a: [-60, -81.6], b: [-63.2, -81.6], w: 2 },
  // 東へのびる道（va の家まで）
  { a: [-60, -58], b: [-39.2, -58], w: 2.2 },
]
/** 岸から板の道へ上がる坂（z=-36 の地面 → z=-41 の WALK_Y） */
export const WALK_RAMP = { x: -60, z0: -35, z1: -41, w: 2.4 }

/** 村の陸の高床の家 */
export const LAND_HOUSES: StiltHouseDef[] = [
  { id: 'l1', x: -72, z: -24, w: 5, d: 4.2, porch: 1.0, floorY: 2.2, hue: 0.1, water: false },
  { id: 'l2', x: -46, z: -25, w: 5.4, d: 4.4, porch: 1.0, floorY: 2.2, hue: 0.55, water: false },
  { id: 'l3', x: -80, z: 4, w: 4.8, d: 4.0, porch: 1.0, floorY: 2.2, hue: 0.3, water: false },
  { id: 'l4', x: -34, z: 9, w: 4.6, d: 4.0, porch: 1.0, floorY: 2.2, hue: 0.75, water: false },
  { id: 'l5', x: -77, z: 27, w: 5.2, d: 4.2, porch: 1.0, floorY: 2.2, hue: 0.45, water: false },
  { id: 'l6', x: -42, z: 29, w: 5.0, d: 4.2, porch: 1.0, floorY: 2.2, hue: 0.9, water: false },
  { id: 'l7', x: -62, z: 34, w: 4.6, d: 4.0, porch: 1.0, floorY: 2.2, hue: 0.2, water: false },
]

// ------------------------------------------------------------------ 北の塔への道（クローの金具）

/** つかむNMClaw の対象 ID */
export const KHMER_CLAW_IDS = {
  hook: (id: string) => `khmer_hook_${id}`,
  swing: 'khmer_swing_net',
  islandPost: 'khmer_island_post',
  islandBack: 'khmer_island_back',
} as const

/**
 * 飛びつく金具（pull_player）。point は金具（軒の下につるした輪）、landing は着地点（縁台）、via は縁台の手すりを越える点。
 * from は「どこから狙うか」の目安（テスト：射程の中か・向きが合うか）
 */
export type HookDef = { id: string; label: string; point: THREE.Vector3; landing: THREE.Vector3; via: THREE.Vector3; facing: THREE.Vector3; from: THREE.Vector3 }

/** 北の塔への道の金具の射程（少しだけ長め：水の上で、ふちまで行かなくても届く） */
export const ROUTE_RANGE = 11.5

/** 家の部屋の壁から軒の金具までの張り出し・軒の高さ（床から） */
export const EAVE = { out: 0.55, y: 1.5, wall: 1.75, overhang: 0.75 }

const houseOf = (id: string) => WATER_HOUSES.find((h) => h.id === id) as StiltHouseDef

/** 家の軒の金具。side は家のどの面か（w=西 e=東 s=南 n=北）。along は面にそったずれ */
export function eaveHook(id: string, side: 'w' | 'e' | 's' | 'n', from: THREE.Vector3, along = 0, label = '小屋の軒の金具'): HookDef {
  const h = houseOf(id)
  const [nx, nz] = side === 'w' ? [-1, 0] : side === 'e' ? [1, 0] : side === 's' ? [0, 1] : [0, -1]
  const half = nx !== 0 ? h.w / 2 : h.d / 2
  const ax = nz !== 0 ? 1 : 0
  const az = nx !== 0 ? 1 : 0
  const at = (out: number, y: number) => v(h.x + nx * (half + out) + ax * along, y, h.z + nz * (half + out) + az * along)
  return {
    id: KHMER_CLAW_IDS.hook(id + side),
    label,
    point: at(EAVE.out, h.floorY + EAVE.y),
    landing: at(h.porch * 0.5, h.floorY),
    via: at(h.porch + 0.15, h.floorY + 1.25),
    facing: v(nx, -0.35, nz).normalize(),
    from: from.clone(),
  }
}

/** 北の塔への道：va（板の道の東の端）→ h1 →（網の木組みにぶら下がる）→ h2 → h3 → h4 → 島。帰りは逆向きの金具 */
export const ROUTE_N = {
  hooks: [
    eaveHook('h1', 'w', v(-34.2, K.WALK_Y, -58.6), 0.4),
    eaveHook('h3', 'w', v(-9, 1.6, -66.6), 0.3),
    // 象の背中（池の象の道の先）から
    eaveHook('h3', 's', v(-6, 1.25, -61.6), -0.6),
    eaveHook('h4', 'w', v(1.2, 1.6, -70.6), -0.3),
    {
      id: KHMER_CLAW_IDS.islandPost,
      label: '島の石の柱の金具',
      point: v(18.2, 2.6, -66),
      landing: v(19.6, K.ISLAND.y, -66),
      via: v(17.9, 3.3, -66),
      facing: v(-1, -0.3, 0).normalize(),
      from: v(11.2, 1.6, -66),
    },
    // 帰り道（島 → h4 → h3 → h2 → va）
    eaveHook('h4', 'e', v(19.6, K.ISLAND.y, -66), 0),
    eaveHook('h3', 'e', v(7.2, 1.6, -66.6), 0.3),
    eaveHook('h2', 'e', v(-2.6, 1.6, -70.6), -0.4),
    eaveHook('va', 'e', v(-27.8, 1.6, -64.2), -0.3, '家の軒の金具'),
  ] as HookDef[],
  /** h1 と h2 のあいだの、魚をとる網の大きな木組み（ぶら下がってこぐ） */
  swing: { point: v(-18, 8.6, -65.0), rope: 5.6, checkpoints: [v(-22.9, 1.6, -64.3), v(-13.6, 1.6, -66)] },
}

// ------------------------------------------------------------------ 象

/** 象の歩く道（往復）。y は足もとの高さ（池の中では水の底を歩くように見せる） */
export const ELEPHANT_PATHS = {
  /** 象の道（南）：村の西から寺の南まで */
  road: { points: [v(-74, 0, 46), v(-40, 0, 46.5), v(-17, 0.5, 46), v(10, 0, 45.5), v(66, 0, 46)], speed: 1.15, wait: 5, bob: 0 },
  /** 池をわたる：寺の北の岸の象のりば → 池の中ほど（h2・h3 の近く）→ もどる */
  baray: { points: [v(-6.6, 0, -36.6), v(-6.8, -0.6, -41.5), v(-6.6, -1.5, -48), v(-6, -1.5, -55), v(-6, -1.5, -61.6)], speed: 1.0, wait: 7, bob: 0 },
} as const
/** 象のりば（池の象の道の、岸の端。上がって象の背中へ跳び移る） */
export const ELEPHANT_DOCK = { x: -4.3, z: -36.6, y: 2.4, w: 2.4, d: 3.4 }

// ------------------------------------------------------------------ 人の立ち位置

export type Spot = { pos: THREE.Vector3; yaw: number }
const spot = (x: number, y: number, z: number, yaw: number): Spot => ({ pos: v(x, y, z), yaw })
/** 向きの計算（モデルは -Z が正面） */
export const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z))

export const NPC = {
  chanda: {
    arrive: spot(-27.6, 0, -30.4, 2.3),
    village: spot(-51, 0, 6, 2.6),
    bridge: spot(-7, 0, -0.4, -1.4),
    temple: spot(4.6, 0, -0.4, -1.6),
    stairs: spot(17.6, 8.55, -2.1, -1.5),
    altar: spot(21.6, K.TOP_Y, -2.6, -1.9),
    tower_n: spot(-39, K.WALK_Y, -56.6, -1.5),
    tower_e: spot(37.4, 0, 9, -1.0),
    tower_s: spot(28.6, 0, 16.2, -0.4),
  },
  grandma: {
    altar: spot(24.4, K.TOP_Y, -2.2, -2.2),
    door: spot(20.9, K.TOP_Y, -5.6, -1.2),
    village: spot(-45.5, 0, -19.6, 0.4),
  },
} as const

/** 村人の置き場所（人の形は visuals 担当の createPerson('khmerVillager')。今は仮の箱） */
export type VillagerSpot = Spot & { id: string; role: 'stand' | 'cook' | 'carry' | 'kid' | 'fish' | 'monk' | 'sit' }
export const VILLAGERS: VillagerSpot[] = [
  { id: 'cook1', ...spot(-65.2, 0, -16.8, 2.4), role: 'cook' },
  { id: 'cook2', ...spot(-42.4, 0, -16.4, -2.6), role: 'cook' },
  { id: 'carry1', ...spot(-58, 0, -6, 1.2), role: 'carry' },
  { id: 'carry2', ...spot(-36, 0, 22, -0.4), role: 'carry' },
  { id: 'kid1', ...spot(-52.4, 0, 12.4, 0.6), role: 'kid' },
  { id: 'kid2', ...spot(-50.2, 0, 10.2, 2.4), role: 'kid' },
  { id: 'kid3', ...spot(-56.8, 0, 9.6, -1.2), role: 'kid' },
  { id: 'kid4', ...spot(-54.6, 0, 14.6, 3.0), role: 'kid' },
  { id: 'elder', ...spot(-60.5, 0, 4, -1.6), role: 'sit' },
  { id: 'weaver', ...spot(-74.4, 0, 22.6, 0.2), role: 'sit' },
  { id: 'fisher1', ...spot(-30.6, -0.1, -46.2, 0.8), role: 'fish' },
  { id: 'fisher2', ...spot(-49, K.WALK_Y, -54.6, 0), role: 'stand' },
  { id: 'watch1', ...spot(-28.4, 0, -12, -2.4), role: 'stand' },
  { id: 'watch2', ...spot(-34.4, 0, -36.6, -0.6), role: 'stand' },
  { id: 'monk1', ...spot(6.6, 0, 6.4, -1.6), role: 'monk' },
  { id: 'monk2', ...spot(-4.6, 0, -9.4, -1.3), role: 'monk' },
  { id: 'temple1', ...spot(34, 0, 14, 2.2), role: 'stand' },
  { id: 'road1', ...spot(18, 0, 43.4, -1.6), role: 'carry' },
]

// ------------------------------------------------------------------ 到着地点

export type SpawnDef = { pos: THREE.Vector3; facing: number; camYaw: number; camPitch: number }
const sp = (x: number, y: number, z: number, lookX: number, lookZ: number, pitch = 0.16): SpawnDef => {
  const yaw = Math.atan2(-(lookX - x), -(lookZ - z))
  return { pos: v(x, y, z), facing: yaw, camYaw: yaw, camPitch: pitch }
}

export const SPAWNS: Record<string, SpawnDef> = {
  /** 寺の外の池のほとり（IDO で来た光の輪が開く所）。寺の中央の塔が正面に見える */
  arrive: sp(-30.4, 0, -31.2, 26, -4, 0.1),
  /** 村の広場 */
  village: sp(-46, 0, 2, -54, 8, 0.18),
  /** 石の橋の西のたもと */
  bridge: sp(-34.5, 0, -4, 26, -4, 0.12),
  /** 寺の境内（西の門を入った所、大階段の前の南）。後ろのカメラが回廊の屋根・壁に入らないよう、回廊から少しはなす */
  temple: sp(7.2, 0, 3.0, 26, -4, 0.2),
  /** 大階段の下（夜の防衛） */
  stairs: sp(4.6, 0, -4, 26, -4, 0.32),
  /** 上の台（祭壇の前） */
  altar: sp(20.2, K.TOP_Y, -1.4, 26, -4, 0.12),
  /** 北の塔へ：板の道の東の端（ここからクローで小屋を飛び移る） */
  tower_n: sp(-34.6, K.WALK_Y, -58.2, -25, -64, 0.08),
  /** 北の塔の島（着いた所） */
  tower_n_top: sp(20.6, K.ISLAND.y, -66, 26, -60, 0.15),
  /** 東の塔：回る鏡の台の前 */
  tower_e: sp(34.6, 0, 13.2, 46, 4, 0.18),
  /** 南の塔：くずれた階段の下 */
  tower_s: sp(26, 0, 13.4, 26, 22, 0.32),
  /** 象のりば */
  elephant: sp(-4.3, 0, -30.6, -6, -60, 0.15),
}
