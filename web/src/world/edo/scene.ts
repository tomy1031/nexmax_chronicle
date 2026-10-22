// 1726年 大坂・仕掛け横丁（水門まわり）の組み立て。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import type { MaterialLibrary } from '../../render/materials'
import { mulberry32, range, pick } from '../../render/noise'
import type { QualitySettings } from '../../render/quality'
import { ColliderList } from '../colliders'
import { L } from './layout'
import { WOOD, banner, barrel, crate, deck, lantern, post, railing, ropeCoil, ropeWrap, standLantern, woodBox, woodTint, barrelSide, type Ctx, type LightSpot } from './kit'
import { buildGate, type GateParts } from './gate'
import { coveredWarehouse, gatehouse, genbeiWorkshop, kura, machiya, type Frame } from './buildings'
import { Foliage, createPetals, groundPetals } from './nature'
import { archBridge, castle, farHouse, floatingIsland, mountains, pagoda, terrace, torii, waterWheel } from './backdrop'
import { buildWater, createWaterMaterial, createFallMaterial, createFoamPatchMaterial, createSpray, fallSheet, type WaterRect } from './water'
import { buildClawTargets, type ClawWorld } from './clawTargets'

export type EdoScene = {
  root: THREE.Group
  water: THREE.Mesh
  colliders: ColliderList
  lights: LightSpot[]
  gate: GateParts
  /** つかむNMClaw の対象（引き寄せる物・金具・吊り輪・大歯車）と協力パズルの舟 */
  claw: ClawWorld
  update(dt: number, t: number): void
}

/** 組み立ての選び方（既定は導入編の町そのまま） */
export type EdoSceneOptions = {
  /**
   * 物語 v7（7 章）の町：源兵衛の工房は stages/edo1726/chronicle が「中に入れる形」で建てるので、ここでは建てない。
   * 工房と団子屋のあいだに路地をあける（団子屋の間口を詰める）
   */
  chronicle?: boolean
  /** 遠景の家・木を置かない範囲（広場・路地のおく・朝日の通り道） */
  keepOut?: ReadonlyArray<{ x0: number; x1: number; z0: number; z1: number }>
  /** 町の静的な部品を足す（同じバッチに積むので、描画の回数が増えない）。near は影あり・far は遠景 */
  extend?: (near: Ctx, far: Ctx, foliage: Foliage) => void
}

/** 7 章の町で、南の通りの店の並び（工房の西の端〜団子屋）。stages/edo1726/chronicle/layout.ts と合わせる */
export const CHRONICLE_ROW = {
  /** 源兵衛の工房（中に入れる）：x0〜x1、正面 z=STREET_Z1 */
  workshop: { x0: -21, x1: -12.2 },
  /** 路地：工房と団子屋のあいだ */
  alley: { x0: -12.2, x1: -9.6 },
  /** 団子屋（間口を詰めた） */
  dango: { cx: -6.3, width: 6.6 },
} as const

const inRange = (v: number, a: number, b: number, soft = 0.4) => {
  const k1 = Math.min(1, Math.max(0, (v - a) / soft + 0.5))
  const k2 = Math.min(1, Math.max(0, (b - v) / soft + 0.5))
  return k1 * k2
}

export function buildEdoScene(m: MaterialLibrary, quality: QualitySettings, opts: EdoSceneOptions = {}): EdoScene {
  const root = new THREE.Group()
  root.name = 'edo'
  const c: Ctx = {
    b: new Batch(),
    bf: new Batch(),
    m,
    col: new ColliderList(),
    rng: mulberry32(1726),
    lights: [],
    root,
    updaters: [],
    quality,
  }
  const foliage = new Foliage(c)
  // 遠景：別バッチ（影なし）
  const cf: Ctx = { ...c, b: c.bf }
  const farFoliage = new Foliage(cf)

  buildGround(c)
  const water = buildWaterSurfaces(root)
  const gate = buildGate(c, root)
  const keep = opts.keepOut ?? []
  const kept = (x: number, z: number) => keep.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1)
  buildStreet(c, foliage, opts.chronicle ?? false)
  buildNorthBank(c, foliage)
  buildPier(c)
  buildUpstream(c, cf, root, foliage, kept)
  buildFar(c, cf, root, farFoliage, kept)
  const claw = buildClawTargets(c, gate)
  opts.extend?.(c, cf, foliage)

  root.add(c.b.build('static'))
  const far = c.bf.build('far')
  far.traverse((o) => (o.castShadow = false))
  root.add(far)
  root.add(foliage.build())
  const farF = farFoliage.build()
  farF.traverse((o) => (o.castShadow = false))
  root.add(farF)
  root.add(
    groundPetals(c, [
      { x0: -45, x1: 4, z0: 7.6, z1: 14, y: 0, n: 900 },
      { x0: -40, x1: 30, z0: -11, z1: -7.6, y: 0, n: 500 },
      { x0: L.PIER.x0, x1: L.PIER.x1, z0: L.PIER.z0, z1: L.PIER.z1, y: L.PIER.y, n: 90 },
      { x0: L.PLATFORM.x0, x1: L.PLATFORM.x1, z0: L.PLATFORM.z0, z1: L.PLATFORM.z1, y: L.PLATFORM.y, n: 60 },
    ]),
  )
  root.add(createPetals(quality.petals, new THREE.Vector3(-8, 4.5, 2), new THREE.Vector3(56, 9, 30)))

  return {
    root,
    water,
    colliders: c.col,
    lights: c.lights,
    gate,
    claw,
    update(dt: number, t: number) {
      for (const u of c.updaters) u(dt, t)
    },
  }
}

// ------------------------------------------------------------------ 地面・石垣

function buildGround(c: Ctx): void {
  const slab = (x0: number, x1: number, z0: number, z1: number, top: number, mat: THREE.Material, texM: number, tint = '#ffffff') => {
    c.b.add(rbox(x1 - x0, 0.3, z1 - z0, 0.06), mat, M((x0 + x1) / 2, top - 0.15, (z0 + z1) / 2), { texM, tint })
    c.col.floor(x0, x1, z0, z1, top, 1)
  }
  // 石垣（水路の両岸）
  const wall = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number) =>
    c.b.add(rbox(x1 - x0, y1 - y0, z1 - z0, 0.05), c.m.stoneWall, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), { texM: 3, tint: '#f2ebe0' })
  // 南岸（通り）
  slab(-120, 12.5, L.BANK_S, 30, 0, c.m.paving, 4)
  wall(-120, 12.5, L.BANK_S, L.BANK_S + 2, -2.2, -0.29)
  // 北岸（遊歩道）
  slab(-120, 75, -22, L.BANK_N, 0, c.m.paving, 4, '#f4eadc')
  c.col.floor(-120, 75, -40, -22, 0, 1)
  wall(-120, 75, L.BANK_N - 2, L.BANK_N, -2.2, -0.29)
  // 縁石
  for (let x = -60; x < 12; x += 0.95) {
    if (x > 2.1 && x < 3.9) continue
    c.b.add(rbox(0.9, 0.2, 0.5, 0.06), c.m.stoneWall, M(x, -0.02, L.BANK_S + 0.25), { texM: 1.5, tint: woodTint(c.rng, '#e8e0d4', 0.08) })
  }
  for (let x = -60; x < 60; x += 0.95) {
    if (x > L.PIER.x0 - 0.2 && x < L.PIER.x1 + 0.2) continue
    c.b.add(rbox(0.9, 0.2, 0.5, 0.06), c.m.stoneWall, M(x, -0.02, L.BANK_N - 0.25), { texM: 1.5, tint: woodTint(c.rng, '#e8e0d4', 0.08) })
  }
  // 水路の底（暗い）
  c.b.add(new THREE.PlaneGeometry(400, 16), c.m.plain, M(0, -1.9, 0, -Math.PI / 2, 0, 0), { tint: '#1b3a40', cast: false })
  // 導水路の仕切り（石垣）と南の台地
  wall(L.GATE_X + 0.3, 64, L.DIVIDER_Z0, L.DIVIDER_Z1, -2.2, L.TERRACE_Y)
  c.b.add(rbox(64 - L.GATE_X - 0.3, 0.16, 0.9, 0.05), c.m.stoneWall, M((L.GATE_X + 64) / 2, L.TERRACE_Y + 0.08, (L.DIVIDER_Z0 + L.DIVIDER_Z1) / 2), { texM: 1.5, tint: '#e2dacd' })
  terrace(c, 12.5, 64, L.BANK_S, 40, L.TERRACE_Y, -2.2)
  c.col.floor(12.5, 64, L.BANK_S, 40, L.TERRACE_Y, 2)
  c.col.box(12.5, 1.3, 20, 0.4, 2.6, 25)
  // 見えない壁（プレイ範囲）
  c.col.wall(-46, L.BANK_N - 4, -46, L.STREET_Z1 + 1, -2, 8)
  c.col.wall(-46, L.BANK_N - 4, 30, L.BANK_N - 4, -2, 8)
  // 水への落下防止（岸辺）
  c.col.wall(-46, L.BANK_S, -9.4, L.BANK_S, 0, 1.2, 0.2)
  c.col.wall(-6.6, L.BANK_S, 2.2, L.BANK_S, 0, 1.2, 0.2)
  c.col.wall(3.8, L.BANK_S, 4.6, L.BANK_S, 0, 1.2, 0.2)
  c.col.wall(-46, L.BANK_N, -9.4, L.BANK_N, 0, 1.2, 0.2)
  c.col.wall(-6.6, L.BANK_N, L.PIER.x0, L.BANK_N, 0, 1.2, 0.2)
  c.col.wall(L.PIER.x1, L.BANK_N, 30, L.BANK_N, 0, 1.2, 0.2)
}

// ------------------------------------------------------------------ 水面

function buildWaterSurfaces(root: THREE.Group): THREE.Mesh {
  const G = L.GEAR
  const down = (x: number, z: number): number => {
    let f = 0
    const fallZ = inRange(z, -0.3, 4.6, 0.8)
    f += Math.exp(-Math.max(0, 8.3 - x) / 1.6) * fallZ * 1.0
    f += 0.28 * Math.exp(-Math.max(0, 8.0 - x) / 5.0) * inRange(z, -1.5, 5.5, 2.0) * (x < 8.3 ? 1 : 0)
    f += Math.exp(-Math.max(0, 9.3 - x) / 0.9) * inRange(z, 5.0, 7.3, 0.6) * 0.85
    const dg = Math.hypot(x - G.x, z - G.z)
    f += Math.max(0, 1 - dg / 2.2) * 0.85
    const bank = Math.min(Math.abs(z - L.BANK_S), Math.abs(z - L.BANK_N))
    f += Math.max(0, 1 - bank / 0.5) * 0.18
    if (x > 9.6) f = Math.max(f, 0.9)
    return f
  }
  const downFlow = (x: number, z: number): [number, number] => {
    const k = Math.exp(-Math.max(0, 10 - x) / 3.5) * inRange(z, -0.8, 7.6, 1.2)
    return [-0.3 - 1.4 * k, (z - 2) * 0.05 * k]
  }
  const rects: WaterRect[] = [
    { x0: -600, x1: -40, z0: L.BANK_N, z1: L.BANK_S, y: L.WL_DOWN, cell: 8, flow: () => [-0.3, 0], foam: () => 0 },
    { x0: -40, x1: -6, z0: L.BANK_N, z1: L.BANK_S, y: L.WL_DOWN, cell: 1.0, flow: () => [-0.3, 0], foam: (_x, z) => Math.max(0, 1 - Math.min(Math.abs(z - L.BANK_S), Math.abs(z - L.BANK_N)) / 0.6) * 0.3 },
    { x0: -6, x1: L.GATE_X + 0.05, z0: L.BANK_N, z1: L.BANK_S, y: L.WL_DOWN, cell: 0.33, flow: downFlow, foam: down },
    { x0: L.GATE_X - 0.1, x1: 40, z0: L.BANK_N, z1: L.DIVIDER_Z0, y: L.WL_DOWN, cell: 1.0, flow: () => [-0.35, 0], foam: (_x, z) => Math.max(0, 1 - Math.min(Math.abs(z - L.BANK_N), Math.abs(z - L.DIVIDER_Z0)) / 0.5) * 0.25 },
    { x0: 40, x1: 220, z0: L.BANK_N, z1: L.DIVIDER_Z0, y: L.WL_DOWN, cell: 4, flow: () => [-0.35, 0], foam: () => 0 },
    {
      x0: L.GATE_X + 0.2,
      x1: 64,
      z0: L.DIVIDER_Z1,
      z1: L.BANK_S,
      y: L.WL_UP,
      cell: 1.0,
      flow: () => [-0.6, 0],
      foam: (x, z) => (x < 11.2 ? 0.35 : 0) + (x > 61 ? 0.9 : 0) + Math.max(0, 1 - Math.min(Math.abs(z - L.BANK_S), Math.abs(z - L.DIVIDER_Z1)) / 0.4) * 0.25,
    },
  ]
  const mesh = buildWater(rects, createWaterMaterial())
  root.add(mesh)
  return mesh
}

// ------------------------------------------------------------------ 南の通り（仕掛け横丁）

function buildStreet(c: Ctx, f: Foliage, chronicle: boolean): void {
  const z = L.STREET_Z1
  const R = CHRONICLE_ROW
  const shops: Array<[number, number, Parameters<typeof machiya>[2]]> = [
    [-62.25, 7.5, { width: 7.5, depth: 7, noren: 'redCrest', lanterns: 'red' }],
    [-54.75, 7.5, { width: 7.5, depth: 7, shop: 'closed', lanterns: 'cream' }],
    [-47.25, 7.5, { width: 7.5, depth: 7, noren: 'waveIndigo', lanterns: 'mixed', sign: { text: '小間物' } }],
    [-39.75, 7.5, { width: 7.5, depth: 7, noren: 'gearIndigo', lanterns: 'red', balcony: true }],
    [-32.25, 7.5, { width: 7.5, depth: 7, noren: 'whiteTea', shop: 'tea', lanterns: 'red', sign: { text: '茶屋' } }],
    [-24.75, 7.5, { width: 7.5, depth: 7, noren: 'waveIndigo', lanterns: 'mixed', sign: { text: '細工' }, vsign: '仕掛け' }],
    chronicle
      ? [R.dango.cx, R.dango.width, { width: R.dango.width, depth: 7, noren: 'redCrest', lanterns: 'red', sign: { text: '団子' }, balcony: true }]
      : [-7.0, 8, { width: 8, depth: 7, noren: 'redCrest', lanterns: 'red', sign: { text: '団子' }, balcony: true }],
    [0.7, 7.4, { width: 7.4, depth: 7, noren: 'gearIndigo', lanterns: 'cream', h1: 3.2 }],
  ]
  for (const [cx, , o] of shops) machiya(c, { ox: cx, oz: z, rot: 0, y: 0 } as Frame, o)
  // 7 章の町では、源兵衛の工房は chronicle/workshop.ts が中に入れる形で建てる
  if (!chronicle) genbeiWorkshop(c, { ox: -16, oz: z, rot: 0, y: 0 })
  gatehouse(c, { ox: 8.55, oz: L.BANK_S, rot: 0, y: 0 })

  // 水路沿いの柵
  const ry = 0
  railing(c, -46, L.BANK_S + 0.12, -9.5, L.BANK_S + 0.12, ry, { spacing: 1.8, rope: true, collider: false })
  railing(c, -6.5, L.BANK_S + 0.12, 2.15, L.BANK_S + 0.12, ry, { spacing: 1.8, rope: true, collider: false })
  railing(c, -60, L.BANK_S + 0.12, -46.2, L.BANK_S + 0.12, ry, { spacing: 1.8, collider: false })
  // 桜並木と行灯
  for (const [x, s, sd] of [
    [-55, 1.0, 1],
    [-44, 1.1, 2],
    [-36.5, 0.95, 3],
    [-31.5, 1.0, 4],
    [-12.5, 1.15, 5],
    [-1.5, 0.95, 6],
  ] as const) {
    f.cherry(x, 0, L.BANK_S + 1.2, s, sd)
  }
  for (const x of [-50, -39, -31, -20, -10.2, -4.2, 1.6]) standLantern(c, x, L.BANK_S + 0.9)
  // 「仕掛け横丁」の幟
  banner(c, -21.8, L.BANK_S + 0.55, 0, 2.9, -Math.PI / 2 + 0.4, 'redBannerText', 0.85)
  banner(c, -13.5, L.BANK_S + 0.8, 0, 2.4, -Math.PI / 2 + 0.3, 'gearBanner', 0.7)
  banner(c, -42, L.BANK_S + 0.8, 0, 2.4, 0, 'waveBanner', 0.7)
  // 店先の小物
  const rng = c.rng
  for (let i = 0; i < 26; i++) {
    const x = range(rng, -58, 3)
    if (x > -21.5 && x < (chronicle ? -9.2 : -10.5)) continue
    const zz = range(rng, z - 1.4, z - 0.6)
    const k = rng()
    if (k < 0.45) crate(c, x, 0, zz, range(rng, 0.45, 0.7), range(rng, -0.4, 0.4))
    else if (k < 0.75) barrel(c, x, 0, zz, range(rng, 0.8, 1.0))
    else ropeCoil(c, x, 0, zz, 0.28)
  }
  // 舟
  boat(c, -30, 5.2, 0.15)
  boat(c, -48, -5.0, -0.1)
  boat(c, -14, 5.4, 3.2)
  // 舟着き場の小さな桟橋
  deck(c, -33, -27, 5.9, L.BANK_S, -0.15, { alongX: true, postBottom: -1.6 })
}

function boat(c: Ctx, x: number, z: number, rot: number): void {
  const hull = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  c.b.add(hull, c.m.wood, M(x, L.WL_DOWN + 0.22, z, 0, rot, 0, 2.6, 0.5, 0.75), { tint: woodTint(c.rng, WOOD.aged), uv: 'scale', uvScale: [4, 1] })
  c.b.add(new THREE.TorusGeometry(1, 0.05, 6, 28), c.m.wood, M(x, L.WL_DOWN + 0.22, z, Math.PI / 2, rot, 0, 2.6, 0.75, 1), { tint: WOOD.dark, uv: 'scale', uvScale: [6, 0.2] })
  for (const lx of [-1.0, 0.2, 1.3]) {
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    woodBox(c, x + lx * cs, L.WL_DOWN + 0.2, z - lx * sn, 0.18, 0.05, 1.2, { rotY: rot, tint: WOOD.warm })
  }
  crate(c, x + 0.6 * Math.cos(rot), L.WL_DOWN + 0.05, z - 0.6 * Math.sin(rot), 0.45, rot + 0.3)
}

// ------------------------------------------------------------------ 北岸

function buildNorthBank(c: Ctx, f: Foliage): void {
  const z = L.NORTH_Z1
  const rng = mulberry32(31)
  const list: Array<'m' | 'k'> = ['m', 'm', 'k', 'm', 'm', 'k', 'm', 'm', 'k', 'm', 'm', 'm', 'k', 'm', 'm', 'k']
  let x = -66
  for (let i = 0; i < list.length; i++) {
    const w = list[i] === 'k' ? 5.0 : range(rng, 7, 8.2)
    const cx = x + w / 2
    const fr: Frame = { ox: cx, oz: z, rot: Math.PI, y: 0 }
    if (list[i] === 'k') kura(c, fr, w - 0.4, 5.5, range(rng, 4.8, 5.6))
    else
      machiya(c, fr, {
        width: w,
        depth: 7,
        noren: pick(rng, ['redCrest', 'waveIndigo', 'gearIndigo', 'whiteTea'] as const),
        lanterns: pick(rng, ['cream', 'red', 'mixed'] as const),
        shop: pick(rng, ['goods', 'tea', 'closed'] as const),
        h1: range(rng, 2.9, 3.2),
        balcony: rng() < 0.3,
        lowDetail: cx > 40 || cx < -50,
      })
    x += w + 0.3
  }
  railing(c, -46, L.BANK_N - 0.12, -9.5, L.BANK_N - 0.12, 0, { spacing: 1.8, rope: true, collider: false })
  railing(c, -6.5, L.BANK_N - 0.12, L.PIER.x0 - 0.2, L.BANK_N - 0.12, 0, { spacing: 1.8, rope: true, collider: false })
  railing(c, L.PIER.x1 + 0.2, L.BANK_N - 0.12, 30, L.BANK_N - 0.12, 0, { spacing: 1.8, rope: true, collider: false })
  for (const [x2, s, sd] of [
    [-40, 1.05, 11],
    [-25, 1.0, 12],
    [-13, 1.1, 13],
    [8.5, 1.15, 14],
    [17, 1.0, 15],
    [27, 1.2, 16],
    [39, 1.1, 17],
    [50, 1.05, 18],
  ] as const) {
    f.cherry(x2, 0, L.BANK_N - 1.6, s, sd)
  }
  for (const x2 of [-30, -18, -4, 12, 22, 33]) standLantern(c, x2, L.BANK_N - 0.9)
}

// ------------------------------------------------------------------ ネクマックスの桟橋（ショット05の手前）

function buildPier(c: Ctx): void {
  const P = L.PIER
  deck(c, P.x0, P.x1, P.z0, P.z1, P.y, { alongX: true, postBottom: -1.7 })
  // 縁の太い角材
  woodBox(c, (P.x0 + P.x1) / 2, P.y + 0.12, P.z1 + 0.05, P.x1 - P.x0, 0.24, 0.3, { tint: woodTint(c.rng, WOOD.aged) })
  woodBox(c, P.x1 + 0.05, P.y + 0.12, (P.z0 + P.z1) / 2, 0.3, 0.24, P.z1 - P.z0, { tint: woodTint(c.rng, WOOD.aged) })
  c.col.box((P.x0 + P.x1) / 2, P.y + 0.6, P.z1 + 0.1, P.x1 - P.x0, 1.2, 0.2)
  c.col.box(P.x1 + 0.1, P.y + 0.6, (P.z0 + P.z1) / 2, 0.2, 1.2, P.z1 - P.z0)
  // 係留柱（縄巻き）
  for (const [x, z, h] of [
    [P.x0 + 0.25, P.z1 - 0.1, 1.0],
    [-0.4, P.z1 - 0.1, 1.15],
    [P.x1 - 0.1, P.z0 + 1.0, 1.1],
  ] as const) {
    c.b.add(new THREE.CylinderGeometry(0.2, 0.22, h + 1.8, 14), c.m.wood, M(x, P.y + (h - 1.8) / 2, z), { tint: woodTint(c.rng, WOOD.aged), uv: 'scale', uvScale: [0.8, (h + 1.8) / 1.6] })
    c.b.add(new THREE.SphereGeometry(0.205, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), c.m.wood, M(x, P.y + h, z), { tint: WOOD.aged, uv: 'scale', uvScale: [0.5, 0.3] })
    ropeWrap(c, x, P.y + h - 0.45, z, 0.2, 4)
    c.col.box(x, P.y + h / 2, z, 0.45, h, 0.45)
  }
  // 提灯の柱と大きな幟（画面左端）
  post(c, P.x1 - 0.35, P.z0 + 0.35, P.y, 4.2, 0.26, WOOD.dark)
  ropeWrap(c, P.x1 - 0.35, P.y + 0.5, P.z0 + 0.35, 0.13, 5)
  woodBox(c, P.x1 - 0.35, 4.0, P.z0 + 0.95, 0.12, 0.12, 1.3, { tint: WOOD.dark })
  lantern(c, P.x1 - 0.35, 3.45, P.z0 + 1.45, { s: 1.35, cord: 0.25 })
  banner(c, 14.2, L.BANK_N - 0.7, 0, 4.4, -0.9, 'waveBanner', 1.1)
  banner(c, 21.0, L.BANK_N - 0.7, 0, 3.6, -0.9, 'gearBanner', 0.9)
  // 木箱・樽
  crate(c, P.x0 + 0.8, P.y, P.z0 + 0.9, 0.7, 0.15)
  crate(c, P.x0 + 1.55, P.y, P.z0 + 0.75, 0.55, -0.2)
  crate(c, P.x0 + 0.85, P.y + 0.7, P.z0 + 0.9, 0.5, 0.4)
  barrel(c, P.x0 + 2.4, P.y, P.z0 + 0.7)
  barrelSide(c, P.x0 + 1.0, P.y, P.z0 + 1.9, 0.3)
  ropeCoil(c, 3.2, P.y, P.z0 + 0.8)
}

// ------------------------------------------------------------------ 上流（導水路・屋根付き倉庫・上の町）

function buildUpstream(c: Ctx, cf: Ctx, root: THREE.Group, f: Foliage, kept: (x: number, z: number) => boolean): void {
  // 仕切り石垣の放水口（導水路→舟の水路へ落ちる遠くの滝）
  {
    const x = 33.5
    const z = L.DIVIDER_Z0
    for (const dx of [-1.3, 1.3]) post(c, x + dx, z - 0.1, -1.6, L.TERRACE_Y + 1.4, 0.3, WOOD.dark)
    woodBox(c, x, L.TERRACE_Y + 1.3, z - 0.1, 3.0, 0.25, 0.35, { tint: WOOD.dark })
    const fm = createFallMaterial(0.77, 1, 1.3)
    root.add(new THREE.Mesh(fallSheet(new THREE.Vector3(x, L.WL_UP + 0.05, z - 0.05), -Math.PI / 2, 2.2, L.WL_UP - L.WL_DOWN, 0.9, 12, 8), fm))
    root.add(new THREE.Mesh(fallSheet(new THREE.Vector3(x, L.WL_UP + 0.07, z - 0.1), -Math.PI / 2, 2.35, L.WL_UP - L.WL_DOWN + 0.05, 1.1, 12, 8), createFallMaterial(0.21, 0.6, 1.6)))
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4, 6, 6), createFoamPatchMaterial(0.4))
    fp.rotation.x = -Math.PI / 2
    fp.position.set(x, L.WL_DOWN + 0.04, z - 1.4)
    root.add(fp)
    root.add(createSpray([{ pos: new THREE.Vector3(x, L.WL_DOWN + 0.1, z - 1.2), spread: new THREE.Vector3(1.0, 0.1, 0.4), vel: new THREE.Vector3(0, 2.0, -1.0), velJitter: 1.0, count: 140, life: [0.5, 1.0], size: [0.2, 0.45], alpha: 0.8 }], 1.0, new THREE.Color(1.5, 1.62, 1.7), 21))
  }
  // 仕切りの上の植え込みと灯籠
  for (let i = 0; i < 9; i++) {
    const x = 12 + i * 5.6
    if (Math.abs(x - 33.5) < 2.5 || Math.abs(x - L.BRIDGE_FAR_X) < 2.5) continue
    f.bush(x, L.TERRACE_Y + 0.1, (L.DIVIDER_Z0 + L.DIVIDER_Z1) / 2, 0.55, 1700 + i, 0.8)
  }
  for (const x of [15, 26.5, 41]) standLantern(c, x, (L.DIVIDER_Z0 + L.DIVIDER_Z1) / 2, L.TERRACE_Y + 0.15)
  // 屋根付き水路倉庫は上流の奥へ（左の遠景を塞がない）
  coveredWarehouse(c, 44, 54, L.DIVIDER_Z1 - 0.1, L.BANK_S + 0.2, L.TERRACE_Y)
  const rng = mulberry32(61)
  // 台地の町家は奥（南）へ下げ、低い家並みに
  for (let i = 0; i < 16; i++) {
    const x = range(rng, 15, 62)
    const z = range(rng, 16, 38)
    const w = range(rng, 5, 7.5)
    const d = range(rng, 5, 6.5)
    const h = range(rng, 3.4, 4.6)
    const rot = pick(rng, [0, Math.PI / 2])
    if (kept(x, z)) continue
    farHouse(cf, x, L.TERRACE_Y, z, w, d, h, rot, rng)
  }
  for (let i = 0; i < 4; i++) {
    const x = 47 + i * 4
    machiya(c, { ox: x, oz: L.BANK_S + 2.2, rot: 0, y: L.TERRACE_Y }, { width: 3.8, depth: 6, lanterns: 'mixed', lowDetail: true, collider: false })
  }
  // 台地の縁の欄干
  railing(c, 13, L.BANK_S + 0.3, 63, L.BANK_S + 0.3, L.TERRACE_Y, { spacing: 2, collider: false })
  // 水車
  waterWheel(c, root, 30.2, L.TERRACE_Y + 1.6, L.BANK_S + 1.6, 2.2, 0)
  for (const [x, z, s2] of [
    [15, 9.2, 1.0],
    [21, 10.5, 1.15],
    [26, 9.0, 0.95],
    [36, 10.0, 1.1],
    [41, 9.0, 1.0],
  ] as const) {
    f.cherry(x, L.TERRACE_Y, z, s2, Math.round(x * 3 + z))
  }
  for (let i = 0; i < 8; i++) f.bush(range(rng, 14, 44), L.TERRACE_Y, range(rng, 12, 15), range(rng, 0.8, 1.2), 1500 + i)
}

// ------------------------------------------------------------------ 遠景

function buildFar(near: Ctx, c: Ctx, root: THREE.Group, f: Foliage, kept: (x: number, z: number) => boolean): void {
  const rng = mulberry32(99)
  // 手前の太鼓橋（通り↔北岸）
  archBridge(near, L.BRIDGE_NEAR_X, L.BANK_N, L.BANK_S, 0, 0, 1.7, 2.8, { lanterns: true })
  // 遠くの太鼓橋（北岸↔上の台地）
  archBridge(c, L.BRIDGE_FAR_X, L.BANK_N, L.BANK_S, 0, L.TERRACE_Y, 2.4, 3.2, { lanterns: true, collider: false })
  // 上流の段（滝の源）と鳥居
  terrace(c, 64, 100, -14, 44, 6.5)
  terrace(c, 100, 140, -24, 54, 11)
  torii(c, 75, 6.5, 2.0, Math.PI / 2, 1.4)
  torii(c, 69, 6.5, 2.0, Math.PI / 2, 1.1)
  // 鳥居への石段（台地の縁から）
  for (let i = 0; i < 14; i++) {
    c.b.add(rbox(0.4, 0.33, 4, 0.04), c.m.stoneWall, M(64 - 0.4 * i - 0.2, 6.5 - 0.33 * i - 0.17, 2.0), { texM: 2, tint: '#efe6d8' })
  }
  pagoda(c, 82, 6.5, -6, 1.1)
  for (let i = 0; i < 44; i++) {
    const t2 = rng() < 0.55
    const x = t2 ? range(rng, 68, 98) : range(rng, 104, 138)
    const z = t2 ? range(rng, -12, 42) : range(rng, -22, 52)
    if (Math.hypot(x - 82, z + 6) < 6) continue
    if (t2 && Math.abs(z - 2) < 3.5 && x < 80) continue
    farHouse(c, x, t2 ? 6.5 : 11, z, range(rng, 5, 8), range(rng, 5, 7), range(rng, 3.5, 5.5), pick(rng, [0, Math.PI / 2]), rng)
  }
  for (let i = 0; i < 22; i++) {
    const t2 = rng() < 0.5
    const x = t2 ? range(rng, 66, 98) : range(rng, 102, 138)
    const z = range(rng, -14, 44)
    if (rng() < 0.4) f.cherry(x, t2 ? 6.5 : 11, z, range(rng, 1.0, 1.4), 500 + i, 0.5)
    else f.bush(x, t2 ? 6.5 : 11, z, range(rng, 1.2, 2.0), 700 + i, 1.4)
  }
  // 上流の滝（導水路の源）
  // 城と丘
  castle(c, L.CASTLE.x, L.CASTLE.y, L.CASTLE.z, f)
  // 浮島
  floatingIsland(c, root, 118, 50, 46, 9, 3, f)
  floatingIsland(c, root, 96, 44, -34, 6, 5, f)
  floatingIsland(c, root, 150, 80, -18, 7, 7, f)
  floatingIsland(c, root, 60, 52, 70, 5, 9, f)
  floatingIsland(c, root, 130, 62, 70, 6, 11, f)
  // 遠景の地面（水路の部分は空ける）
  c.b.add(new THREE.PlaneGeometry(1200, 592), c.m.grass, M(0, -0.08, -7.6 - 296, -Math.PI / 2, 0, 0), { tint: '#b9b47e', uv: 'scale', uvScale: [120, 60], cast: false })
  c.b.add(new THREE.PlaneGeometry(1200, 592), c.m.grass, M(0, -0.08, 7.6 + 296, -Math.PI / 2, 0, 0), { tint: '#b9b47e', uv: 'scale', uvScale: [120, 60], cast: false })
  // 北と南と西の遠い町並み（格子状に密に）
  for (let gx = -150; gx <= 130; gx += 9) {
    for (let gz = -118; gz <= -26; gz += 10) {
      if (rng() < 0.22) continue
      if (gz > -25 && gx > -120 && gx < 75) continue
      const x = gx + range(rng, -1.5, 1.5)
      const z = gz + range(rng, -1.5, 1.5)
      farHouse(c, x, 0, z, range(rng, 5.5, 8), range(rng, 5, 7), range(rng, 3.4, 5.2), pick(rng, [0, Math.PI / 2]), rng)
      if (rng() < 0.12) f.cherry(x + 4, 0, z + 4, range(rng, 1.0, 1.4), 2000 + gx * 7 + gz, 0.35)
    }
  }
  for (let gx = -150; gx <= 10; gx += 9) {
    for (let gz = 34; gz <= 110; gz += 10) {
      if (rng() < 0.25) continue
      const x = gx + range(rng, -1.5, 1.5)
      const z = gz + range(rng, -1.5, 1.5)
      if (kept(x, z)) continue
      farHouse(c, x, 0, z, range(rng, 5.5, 8), range(rng, 5, 7), range(rng, 3.4, 5.2), pick(rng, [0, Math.PI / 2]), rng)
    }
  }
  for (let gx = 12; gx <= 68; gx += 9) {
    for (let gz = 46; gz <= 112; gz += 10) {
      if (rng() < 0.25) continue
      const x = gx + range(rng, -1.5, 1.5)
      const z = gz + range(rng, -1.5, 1.5)
      if (kept(x, z)) continue
      farHouse(c, x, 0, z, range(rng, 5.5, 8), range(rng, 5, 7), range(rng, 3.4, 5.2), pick(rng, [0, Math.PI / 2]), rng)
      if (rng() < 0.15) f.cherry(gx + 4, 0, gz + 4, range(rng, 1.0, 1.4), 3000 + gx * 7 + gz, 0.35)
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = range(rng, -200, -125)
    const z = pick(rng, [-1, 1]) * range(rng, 10, 40)
    farHouse(c, x, 0, z, range(rng, 5, 8), range(rng, 5, 7), range(rng, 3.5, 5), pick(rng, [0, Math.PI / 2]), rng)
  }
  // 北の丘
  for (let i = 0; i < 8; i++) {
    const x = -100 + i * 28 + range(rng, -6, 6)
    const g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    c.b.add(g, c.m.grass, M(x, -1, -95 + range(rng, -10, 10), 0, range(rng, 0, 3), 0, range(rng, 26, 40), range(rng, 10, 20), range(rng, 18, 26)), { tint: '#b9d08a', uv: 'scale', uvScale: [6, 3] })
  }
  mountains(c)
}
