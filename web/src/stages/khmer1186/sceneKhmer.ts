// 1186年 クメールの都・アルンの寺と村（11章）の組み立て。配置は layout.ts、形の部品は kitKhmer.ts。
// 静的な物は区画（村・水の上の村・北の塔への道・寺・南）ごとの Batch でまとめ、動く物（アルン・鏡・回る鏡の台・大階段の段・
// 落ちてくる石・象・火・空のひび）は個別に作って、外から動かせる API（KhmerScene）にする。
// 物語の進行（会話・フラグ・ボス）はここでは持たない（フェーズ 2 の KhmerStage）。
import * as THREE from 'three'
import { Batch, M } from '../../render/batch'
import { mulberry32 } from '../../render/noise'
import type { QualitySettings } from '../../render/quality'
import { ColliderList } from '../../world/colliders'
import { buildWater } from '../../world/edo/water'
import type { LightSpot } from '../../world/edo/kit'
import type { ClawTargetDef } from '../../player/clawLogic'
import type { MovableInput } from '../../player/clawSystem'
import type { Physics } from '../../player/physics'
import type { PlayerController } from '../../player/controller'
import { cellsWithHoles } from '../expo1970/kit1970'
import {
  ELEPHANT_DOCK,
  ELEPHANT_PATHS,
  K,
  KHMER_CLAW_IDS,
  LAND_HOUSES,
  NPC,
  ROUTE_N,
  ROUTE_RANGE,
  SMALL_TOWER,
  SPAWNS,
  TOWERS,
  TOWER_IDS,
  WALKWAYS,
  WALK_RAMP,
  WATER_HOUSES,
  arunCenter,
  mirrorCenter,
  towerPoint,
  type Rect,
  type TimeOfDay,
  type TowerId,
} from './layout'
import { createKhmerMaterials, KC, type KhmerMaterials } from './materialsKhmer'
import {
  basket,
  bigTree,
  box,
  boxAB,
  boat,
  collideCylinder,
  collideRamp,
  cyl,
  hearth,
  jar,
  leafCrown,
  lion,
  lotusPatch,
  nagaHead,
  nagaRail,
  palm,
  prasatSpire,
  shade,
  smallPrasat,
  stiltHouse,
  strut,
  tier,
  torchPost,
  zone,
  type KCtx,
} from './kitKhmer'
import { KhmerBodies, PlatformRider, type KinematicBox } from './physKhmer'
import { Arun } from './arun'
import { MirrorStand, Turntable, type Freezable } from './mirrors'
import { BigStairs, FallingStone, buildFlight, stonePath } from './stairs'
import { StoneFallLogic, PingPongWalker } from './khmerLogic'
import { ElephantHerd, type Elephant } from './elephant'
import { Burst, Drift, Moon, SkyCrack, Torches } from './fxKhmer'
import { PlaceholderPerson, Villagers } from './people'
import { SUN_AFTERNOON, SUN_DAWN } from './environment'
import { SwallowTargets } from './swallow'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type KhmerScene = {
  root: THREE.Group
  colliders: ColliderList
  lights: LightSpot[]
  claw: { targets: ClawTargetDef[]; movables: MovableInput[] }
  materials: KhmerMaterials
  // ---------------------------------------------------------------- 仕掛け
  arun: Arun
  mirrors: Record<TowerId, MirrorStand>
  turntable: Turntable
  stairs: BigStairs
  /** 南の塔のくずれた階段で落ちてくる石 */
  towerStones: FallingStone[]
  elephants: ElephantHerd
  /** 夜に空の口が飲みこむ、村の古い石像と家 */
  swallow: SwallowTargets
  /** 池をわたる象（北の塔への道の足場）と、象の道の象 */
  elephant: { baray: Elephant; road: Elephant }
  // ---------------------------------------------------------------- 物理（後から足す当たり判定）
  bodies: KhmerBodies
  rider: PlatformRider
  // ---------------------------------------------------------------- 光・空
  torches: Torches
  embers: Torches
  skyCrack: SkyCrack
  moon: Moon
  mist: Drift
  fireflies: Drift
  burst: Burst
  /** 光のつぶ（足し算の粒子。光の演出に） */
  sparks: Burst
  // ---------------------------------------------------------------- 人（仮の箱）
  villagers: Villagers
  chanda: PlaceholderPerson
  grandma: PlaceholderPerson
  /** 今の時間 */
  readonly time: TimeOfDay
  /** 時間の切り替え（シーン側：松明・月・空のひび・霧の粒・回る鏡の日ざし・点光源の強さ）。空や太陽は environment.ts の applyKhmerTime */
  setTimeOfDay(time: TimeOfDay): void
  /** 物理ができた後に 1 回（begin(rt) で rt.phys を渡す） */
  attachPhysics(phys: Physics): void
  /** 動く足場にプレイヤーを乗せて運ぶ（ステージの update で、プレイヤーの更新の後に） */
  carryPlayer(player: PlayerController): KinematicBox | null
  /** 「止める」で狙えるもの（回る鏡の台・落ちてくる石） */
  freezables(): Freezable[]
  /** 塔の上に鏡を立てる・光の筋をアルンへ（夜明け） */
  placeMirror(which: TowerId, instant?: boolean): void
  beamOn(which: TowerId, instant?: boolean): void
  beamOff(which: TowerId, instant?: boolean): void
  /** 大階段の区切り i がくずれる */
  collapseStep(i: number, instant?: boolean): void
  update(dt: number, t: number, camera?: THREE.Camera): void
  dispose(): void
}

export async function buildKhmerScene(q: QualitySettings, aniso: number, progress: (p: number, msg: string) => void, yieldFrame: () => Promise<void>): Promise<KhmerScene> {
  progress(0.16, '砂岩と浮き彫りを描いています…')
  await yieldFrame()
  const m = await createKhmerMaterials(aniso)
  const root = new THREE.Group()
  root.name = 'khmer1186'
  const bodies = new KhmerBodies()
  const c: KCtx = {
    b: new Batch(),
    bf: new Batch(),
    zones: new Map(),
    m,
    col: new ColliderList(),
    bodies,
    lights: [],
    root,
    updaters: [],
    rng: mulberry32(1186),
    q,
    torches: [],
    embers: [],
    cloths: [],
  }
  const targets: ClawTargetDef[] = []
  const movables: MovableInput[] = []
  const ground = new Batch()

  progress(0.3, '池と水路に水を張っています…')
  await yieldFrame()
  buildGround(c, ground)
  zone(c, 'water')
  buildWaterVillage(c)
  zone(c, 'route')
  buildRoute(c, targets)
  progress(0.4, '村を組み立て中…')
  await yieldFrame()
  zone(c, 'village')
  buildVillage(c, targets, movables)
  buildBridge(c)
  progress(0.5, 'アルンの寺を組み立て中…')
  await yieldFrame()
  zone(c, 'temple')
  buildTemple(c)
  zone(c, 'south')
  buildSouth(c)
  progress(0.58, '森と象の道を組み立て中…')
  await yieldFrame()
  const scar = buildFar(c)

  // ---------------------------------------------------------------- 動く物
  const burst = new Burst(180, false)
  const sparks = new Burst(80, true)
  // 夜に空の口が飲みこむ、村の古い石像と家
  zone(c, 'village')
  const swallow = new SwallowTargets(c, burst)
  // 大階段の段・落ちる石：砂岩と同じ色の打ち消しと、弱めの凹凸
  const stoneMat = () => new THREE.MeshStandardMaterial({ map: m.sandstone.map, normalMap: m.sandstone.normalMap, normalScale: m.sandstone.normalScale.clone(), color: m.sandstone.color.clone(), roughness: 0.9, vertexColors: true })
  zone(c, 'temple')
  const stairs = new BigStairs(c, stoneMat, burst)
  const arun = new Arun(K.ARUN.clone().setY(K.ARUN.y + K.ARUN_PEDESTAL), K.ARUN_HEIGHT)
  c.lights.push(arun.light)
  const sunDawn = SUN_DAWN.clone()
  const mirrors = {} as Record<TowerId, MirrorStand>
  for (const id of TOWER_IDS) {
    const t = TOWERS[id]
    const S = SMALL_TOWER
    const center = mirrorCenter(id)
    const top = towerPoint(t, S.stand.front, 0, S.top + S.stand.h)
    const face = arunCenter().sub(center).normalize()
    mirrors[id] = new MirrorStand(id, center, top, face, S.stand.mirrorR)
  }
  const turntable = new Turntable(K.TURNTABLE, mirrors.e, SUN_AFTERNOON)
  // 南の塔：くずれた区切りの前で落ちてくる石
  const towerStones: FallingStone[] = []
  for (const w of southWalls) {
    const logic = new StoneFallLogic({ path: stonePath(w.foot, w.up, SMALL_TOWER.stairs.rise, SMALL_TOWER.stairs.run), speed: 1.6, wobble: 1.1, gap: 1.4, window: { y0: w.y0 + 0.4, y1: w.y0 + 0.9 }, half: 0.31, delay: towerStones.length * 2.1 })
    towerStones.push(new FallingStone(`south_${w.seg}`, logic, stoneMat(), bodies, burst))
  }
  // 象
  const herd = new ElephantHerd({ skin: m.clay, load: m.fabric })
  const road = herd.add(new PingPongWalker(ELEPHANT_PATHS.road.points, ELEPHANT_PATHS.road.speed, ELEPHANT_PATHS.road.wait, 30), bodies)
  const baray = herd.add(new PingPongWalker(ELEPHANT_PATHS.baray.points, ELEPHANT_PATHS.baray.speed, ELEPHANT_PATHS.baray.wait, 0), bodies)
  // 火・空
  const torches = new Torches(c.torches, 0.62)
  const embers = new Torches(c.embers, 0.34, '#ff6a20')
  const skyCrack = new SkyCrack(K.SKY_CRACK.pos, K.SKY_CRACK.size, v(26, 10, -4))
  const moon = new Moon(K.MOON, 30)
  const fireflyBase: THREE.Vector3[] = []
  const fr = mulberry32(44)
  for (let i = 0; i < 90; i++) {
    const zoneK = fr()
    const p = zoneK < 0.5 ? v(-88 + fr() * 60, 0.6 + fr() * 1.6, -38 + fr() * 70) : zoneK < 0.8 ? v(-90 + fr() * 70, 0.2 + fr() * 1.2, -42 - fr() * 30) : v(-10 + fr() * 70, 0.6 + fr() * 1.6, 40 + fr() * 14)
    fireflyBase.push(p)
  }
  const fireflies = new Drift(fireflyBase, { size: 0.35, rise: 1.2, color: '#d8ff7a', opacity: 0, additive: true, speed: 0.08, seed: 12 })
  // 人（仮）
  const villagers = new Villagers()
  const chanda = new PlaceholderPerson('chanda')
  chanda.setSpot(NPC.chanda.arrive)
  const grandma = new PlaceholderPerson('grandma')
  grandma.setSpot(NPC.grandma.altar)

  // ---------------------------------------------------------------- まとめる
  for (const [id, b] of c.zones) {
    const g = b.build(`khmer_${id}`)
    root.add(g)
  }
  const groundMesh = ground.build('khmer_ground')
  groundMesh.traverse((o) => {
    o.castShadow = false
    o.receiveShadow = true
  })
  root.add(groundMesh)
  const far = c.bf.build('khmer_far')
  far.traverse((o) => (o.castShadow = false))
  root.add(far)
  root.add(stairs.group, arun.group, turntable.group, herd.group, torches.mesh, embers.mesh, skyCrack.mesh, moon.group, scar.mist.points, fireflies.points, burst.points, sparks.points)
  for (const id of TOWER_IDS) root.add(mirrors[id].group)
  for (const s of towerStones) root.add(s.mesh)
  root.add(villagers.mesh, chanda.group, grandma.group)
  root.add(...swallow.objects)

  const rider = new PlatformRider()
  const torchLights = c.lights.filter((l) => l.color === '#ffa04a')
  const emberLights = c.lights.filter((l) => l.color === '#ff9a4a')
  let time: TimeOfDay = 'afternoon'

  const scene: KhmerScene = {
    root,
    colliders: c.col,
    lights: c.lights,
    claw: { targets, movables },
    materials: m,
    arun,
    mirrors,
    turntable,
    stairs,
    towerStones,
    elephants: herd,
    elephant: { baray, road },
    swallow,
    bodies,
    rider,
    torches,
    embers,
    skyCrack,
    moon,
    mist: scar.mist,
    fireflies,
    burst,
    sparks,
    villagers,
    chanda,
    grandma,
    get time() {
      return time
    },
    setTimeOfDay(t: TimeOfDay) {
      time = t
      const night = t === 'night'
      const dawn = t === 'dawn'
      torches.setOn(night ? 1 : dawn ? 0.6 : 0)
      embers.setOn(night ? 1 : dawn ? 0.8 : 0.35)
      for (const l of torchLights) l.intensity = night ? 2.6 : dawn ? 1.0 : 0
      for (const l of emberLights) l.intensity = night ? 1.4 : dawn ? 0.8 : 0
      moon.setOn(night)
      skyCrack.setCrack(night ? Math.max(skyCrack.crack, 0.55) : 0)
      if (!night) skyCrack.setOpen(0)
      fireflies.setOpacity(night ? 0.9 : 0)
      scar.mist.setColor(night ? '#2a1640' : '#120e18')
      scar.mist.setOpacity(night ? 0.8 : 0.68)
      turntable.setSunlight(t === 'afternoon')
    },
    attachPhysics(phys: Physics) {
      bodies.attach(phys)
    },
    carryPlayer(player: PlayerController) {
      return rider.carry(player, herd.decks)
    },
    freezables() {
      return [turntable.freezable(), ...towerStones.map((s) => s.freezable()), ...stairs.stones.map((s) => s.freezable())]
    },
    placeMirror(which: TowerId, instant = false) {
      mirrors[which].placeMirror(instant)
    },
    beamOn(which: TowerId, instant = false) {
      mirrors[which].beamOn(arunCenter(), sunDawn, instant)
    },
    beamOff(which: TowerId, instant = false) {
      mirrors[which].beamOff(instant)
    },
    collapseStep(i: number, instant = false) {
      stairs.collapseStep(i, instant)
    },
    update(dt: number, t: number, camera?: THREE.Camera) {
      for (const u of c.updaters) u(dt, t)
      arun.update(dt)
      for (const id of TOWER_IDS) mirrors[id].update(dt)
      turntable.update(dt)
      stairs.update(dt)
      for (const s of towerStones) s.update(dt)
      herd.update(dt)
      burst.update(dt, 3)
      sparks.update(dt, 0)
      if (camera) {
        moon.update(camera)
        swallow.update(dt, camera, t)
      }
    },
    dispose() {
      bodies.detach()
    },
  }
  scene.setTimeOfDay('afternoon')
  return scene
}

// ------------------------------------------------------------------ 地面・池・水路

/** 池・水路の外の地面（色分けの絵）と、床の当たり判定・岸 */
function buildGround(c: KCtx, ground: Batch): void {
  const B = K.BOUNDS
  const canal: Rect = { x0: K.CANAL.x0, x1: K.CANAL.x1, z0: K.CANAL.z0, z1: 700 }
  const scarRect = SCAR_RECT
  const big: Rect = { x0: -700, x1: 700, z0: -700, z1: 700 }
  for (const r of cellsWithHoles(big, [K.BARAY, canal, scarRect])) {
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0, Math.max(1, Math.round((r.x1 - r.x0) / 40)), Math.max(1, Math.round((r.z1 - r.z0) / 40)))
    g.rotateX(-Math.PI / 2)
    ground.add(g, c.m.ground, M((r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2), { cast: false, uv: 'keep' })
    // 床の当たり判定（歩ける範囲の近くだけ）
    const x0 = Math.max(r.x0, B.x0 - 6)
    const x1 = Math.min(r.x1, B.x1 + 6)
    const z0 = Math.max(r.z0, B.z0 - 6)
    const z1 = Math.min(r.z1, B.z1 + 6)
    if (x1 > x0 && z1 > z0) c.col.floor(x0, x1, z0, z1, 0, 2)
  }
  // 池と水路の底（暗い）と、岸の壁
  const bottom = -2.4
  for (const r of [K.BARAY, { ...canal, z1: 220 }]) {
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0)
    g.rotateX(-Math.PI / 2)
    ground.add(g, c.m.plain, M((r.x0 + r.x1) / 2, bottom, (r.z0 + r.z1) / 2), { tint: '#2c3a2e', cast: false })
  }
  const bank = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const g = new THREE.PlaneGeometry(len, -bottom + 0.05)
    const ang = Math.atan2(bz - az, bx - ax)
    ground.add(g, c.m.laterite, M((ax + bx) / 2, bottom / 2, (az + bz) / 2, 0, -ang, 0), { tint: '#7a5a44', cast: false, texM: 2 })
  }
  // 池の岸（内側を向く面）。南の岸は水路の口であける
  const P = K.BARAY
  bank(P.x0, P.z0, P.x1, P.z0)
  bank(P.x1, P.z1, K.CANAL.x1, P.z1)
  bank(K.CANAL.x0, P.z1, P.x0, P.z1)
  bank(P.x0, P.z1, P.x0, P.z0)
  bank(P.x1, P.z0, P.x1, P.z1)
  bank(canal.x0, 220, canal.x0, canal.z0)
  bank(canal.x1, canal.z0, canal.x1, 220)
  // 岸のふちの石（南の岸・水路の両岸）：歩ける低い段
  const curb = (x0: number, x1: number, z0: number, z1: number) => {
    boxAB(c, x0, x1, -0.5, 0.12, z0, z1, c.m.sandstone, { tint: KC.sandGrey, texM: 2, cast: false })
  }
  zone(c, 'village')
  curb(P.x0, K.GHAT.x0, P.z1 - 0.1, P.z1 + 0.5)
  curb(K.GHAT.x1, K.CANAL.x0, P.z1 - 0.1, P.z1 + 0.5)
  curb(K.CANAL.x1, P.x1, P.z1 - 0.1, P.z1 + 0.5)
  for (const z0 of [P.z1, 50]) {
    const z1 = z0 === P.z1 ? K.ROAD.z0 - 0.5 : B.z1 + 4
    curb(K.CANAL.x0 - 0.5, K.CANAL.x0 + 0.1, z0, z1)
    curb(K.CANAL.x1 - 0.1, K.CANAL.x1 + 0.5, z0, z1)
  }
  // 岸の石段（到着地点の前：池へおりる）
  const G = K.GHAT
  for (let i = 0; i < G.steps; i++) {
    const y = -0.2 - i * 0.22
    const z0 = G.z - i * 0.6
    boxAB(c, G.x0, G.x1, y - 0.6, y, z0 - 0.6, z0, c.m.sandstone, { tint: shade(KC.sandGrey, 1 - i * 0.05), texM: 2, collide: true })
  }
  // 水
  const water = buildWater(
    [
      { x0: P.x0, x1: P.x1, z0: P.z0, z1: P.z1, y: K.WATER_Y, cell: 2.6, flow: () => [0.02, 0.012], foam: () => 0 },
      { x0: canal.x0, x1: canal.x1, z0: canal.z0, z1: 220, y: K.WATER_Y, cell: 2, flow: () => [0, 0.05], foam: () => 0 },
    ],
    c.m.water,
  )
  water.receiveShadow = true
  water.name = 'khmer_water'
  c.root.add(water)
  // 見えない壁（歩ける範囲）
  c.col.wall(B.x0, B.z0, B.x1, B.z0, -3, 8)
  c.col.wall(B.x1, B.z0, B.x1, B.z1, -3, 8)
  c.col.wall(B.x1, B.z1, B.x0, B.z1, -3, 8)
  c.col.wall(B.x0, B.z1, B.x0, B.z0, -3, 8)
}

/** 食べられた森のあとの範囲（地面の絵の代わりに、えぐれた地形のメッシュ） */
const SCAR_RECT: Rect = { x0: 24, x1: 156, z0: -150, z1: -94 }

// ------------------------------------------------------------------ 水の上の村

function buildWaterVillage(c: KCtx): void {
  const Y = K.WALK_Y
  // 板の道（杭の上）
  for (const w of WALKWAYS) {
    const [ax, az] = w.a
    const [bx, bz] = w.b
    const len = Math.hypot(bx - ax, bz - az)
    const ang = Math.atan2(bz - az, bx - ax)
    const cx = (ax + bx) / 2
    const cz = (az + bz) / 2
    box(c, cx, Y - 0.08, cz, len + w.w * 0.5, 0.16, w.w, c.m.planks, { rotY: -ang, texM: 2 })
    c.col.box(cx, Y - 0.3, cz, len + w.w * 0.5, 0.6, w.w, -ang)
    const n = Math.max(1, Math.round(len / 2.4))
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const px = ax + (bx - ax) * t
      const pz = az + (bz - az) * t
      const ox = Math.sin(ang) * (w.w / 2 - 0.1)
      const oz = -Math.cos(ang) * (w.w / 2 - 0.1)
      for (const s of [-1, 1]) cyl(c, px + ox * s, -2.2, Y - 0.12, pz + oz * s, 0.08, c.m.wood, { tint: KC.woodDark, seg: 5, cast: false })
    }
  }
  // 岸から板の道へ上がる坂
  const R = WALK_RAMP
  const a = v(R.x, 0, R.z0)
  const b = v(R.x, Y, R.z1)
  const mid = a.clone().lerp(b, 0.5)
  const ang = Math.atan2(Y, Math.abs(R.z1 - R.z0))
  box(c, mid.x, mid.y - 0.06, mid.z, R.w, 0.14, Math.hypot(Y, R.z1 - R.z0), c.m.planks, { rotX: -ang, texM: 2 })
  collideRamp(c, a, b, R.w, 0.4)
  // 家
  for (const h of WATER_HOUSES) {
    if (h.id.startsWith('h')) continue
    stiltHouse(c, h)
  }
  // 舟（板の道のそば）と、はす
  boat(c, -56.5, K.WATER_Y - 0.25, -53, 1.4, 5)
  boat(c, -64, K.WATER_Y - 0.25, -70, 1.7, 4.4, '#7a5636')
  boat(c, -42, K.WATER_Y - 0.25, -62, 0.2, 4.6)
  lotusPatch(c, -46, -44, 5, 28, K.WATER_Y)
  lotusPatch(c, -78, -60, 6, 30, K.WATER_Y)
  lotusPatch(c, -26, -50, 5, 24, K.WATER_Y)
  lotusPatch(c, 36, -48, 7, 34, K.WATER_Y)
  lotusPatch(c, 0, -80, 6, 26, K.WATER_Y)
  // 水の上の村の松明・かご・つぼ
  torchPost(c, -58.6, Y, -58.9)
  torchPost(c, -40.6, Y, -56.9)
  basket(c, -50.2, Y, -47.4, 0.9, KC.basket, true)
  jar(c, -47.6, Y, -47.6, 0.9)
  basket(c, -73, Y, -61.6, 0.8)
}

// ------------------------------------------------------------------ 北の塔への道（漁師の小屋・網の木組み・島・北の塔）

function buildRoute(c: KCtx, targets: ClawTargetDef[]): void {
  for (const h of WATER_HOUSES) if (h.id.startsWith('h')) stiltHouse(c, h)
  // 金具（軒につるした光る輪）
  for (const hk of ROUTE_N.hooks) {
    const p = hk.point
    c.b.add(new THREE.TorusGeometry(0.2, 0.045, 8, 18), c.m.hookGlow, M(p.x, p.y, p.z, 0, Math.atan2(hk.facing.x, hk.facing.z), 0), { tint: '#ffffff', cast: false })
    strut(c, v(p.x, p.y + 0.2, p.z), v(p.x, p.y + 0.62, p.z), 0.025, c.m.bronze, KC.bronze, { cast: false })
    targets.push({ id: hk.id, type: 'pull_player', label: hk.label, point: p.clone(), radius: 0.3, enabled: true, range: ROUTE_RANGE, facing: hk.facing.clone(), landing: hk.landing.clone(), via: hk.via.clone() })
  }
  // 魚をとる網の大きな木組み（h1 と h2 のあいだ）：ぶら下がってこぐ
  const S = ROUTE_N.swing
  const A = S.point
  for (const dz of [-2.6, 2.6]) {
    strut(c, v(A.x - 2.2, -2.2, A.z + dz), v(A.x, A.y + 0.5, A.z + dz * 0.4), 0.13, c.m.bark, '#a89070')
    strut(c, v(A.x + 2.2, -2.2, A.z + dz), v(A.x, A.y + 0.5, A.z + dz * 0.4), 0.13, c.m.bark, '#a89070')
  }
  strut(c, v(A.x, A.y + 0.45, A.z - 1.4), v(A.x, A.y + 0.45, A.z + 1.4), 0.12, c.m.bark, '#a89070')
  strut(c, v(A.x, A.y + 0.4, A.z), v(A.x, A.y + 0.08, A.z), 0.03, c.m.wood, KC.woodDark, { cast: false })
  c.b.add(new THREE.TorusGeometry(0.34, 0.06, 8, 22), c.m.hookGlow, M(A.x, A.y, A.z, 0, Math.PI / 2, 0), { tint: '#ffffff', cast: false })
  // 網（たたんだもの）
  c.b.add(new THREE.ConeGeometry(1.1, 1.4, 8, 1, true), c.m.fabric, M(A.x + 2.6, A.y - 3.2, A.z + 1.8, 0.4, 0, 0.3), { tint: '#c8b890', cast: false })
  targets.push({ id: KHMER_CLAW_IDS.swing, type: 'swing_anchor', label: '網の木組みの輪', point: A.clone(), radius: 0.4, enabled: true, ropeLength: S.rope, checkpoints: S.checkpoints.map((p) => p.clone()) })
  // 島（北の塔）
  const I = K.ISLAND
  boxAB(c, I.x0, I.x1, -2.4, I.y - 0.05, I.z0, I.z1, c.m.laterite, { tint: KC.laterite, texM: 2, collide: true })
  boxAB(c, I.x0 + 0.3, I.x1 - 0.3, I.y - 0.06, I.y, I.z0 + 0.3, I.z1 - 0.3, c.m.paving, { tint: '#ffffff', texM: 3 })
  boxAB(c, I.x0, I.x1, I.y - 0.32, I.y - 0.02, I.z0 - 0.15, I.z0 + 0.25, c.m.sandstone, { tint: KC.sandGrey, texM: 2 })
  boxAB(c, I.x0, I.x1, I.y - 0.32, I.y - 0.02, I.z1 - 0.25, I.z1 + 0.15, c.m.sandstone, { tint: KC.sandGrey, texM: 2 })
  // 島の柱（金具をつるす腕）
  const post = v(18.5, I.y, -67.2)
  box(c, post.x, post.y + 1.15, post.z, 0.5, 2.3, 0.5, c.m.sandstone, { tint: KC.sand, texM: 1, collide: true })
  box(c, post.x - 0.1, post.y + 2.35, post.z + 0.55, 0.25, 0.22, 1.4, c.m.sandstone, { tint: shade(KC.sand, 1.05), texM: 1 })
  nagaHeadSmall(c, post.x, post.y + 2.3, post.z, -Math.PI / 2)
  smallTower(c, 'n')
  palm(c, 32.5, -56, 9, 'coco', I.y)
  palm(c, 19.4, -73, 8, 'coco', I.y)
  torchPost(c, 22.6, I.y, -55.4)
  torchPost(c, 29.4, I.y, -55.4)
  // 寺の北の岸の石段と、こわれた土手道のあと（水にしずんだ石）
  for (let i = 0; i < 3; i++) boxAB(c, 22, 30, -0.3 - i * 0.25, -0.05 - i * 0.25, -40 - i * 0.6 - 0.6, -40 - i * 0.6, c.m.sandstone, { tint: KC.sandGrey, texM: 2, collide: true })
  for (const z of [-44.5, -48.5, -52.5]) {
    box(c, 24.2, -0.95, z, 1.1, 1.4, 1.2, c.m.sandstone, { tint: KC.sandDark, rotY: 0.2, texM: 1 })
    box(c, 27.6, -1.05, z + 0.6, 1.0, 1.3, 1.1, c.m.sandstone, { tint: KC.sandDark, rotY: -0.3, texM: 1 })
  }
  // 象のりば（寺の北西の岸。上がって、象の背中へ跳び移る）
  const D = ELEPHANT_DOCK
  boxAB(c, D.x - D.w / 2, D.x + D.w / 2, D.y - 0.18, D.y, D.z - D.d / 2, D.z + D.d / 2, c.m.planks, { texM: 2, collide: true })
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    cyl(c, D.x + (dx * D.w) / 2.2, 0, D.y, D.z + (dz * D.d) / 2.2, 0.12, c.m.wood, { tint: KC.woodDark, seg: 6 })
  // 手すり（象の側はあける）
  strut(c, v(D.x + D.w / 2, D.y + 0.7, D.z - D.d / 2), v(D.x + D.w / 2, D.y + 0.7, D.z + D.d / 2), 0.04, c.m.wood, KC.wood, { cast: false })
  c.col.wall(D.x + D.w / 2, D.z - D.d / 2, D.x + D.w / 2, D.z + D.d / 2, D.y, D.y + 0.9, 0.12)
  strut(c, v(D.x - D.w / 2, D.y + 0.7, D.z - D.d / 2), v(D.x + D.w / 2, D.y + 0.7, D.z - D.d / 2), 0.04, c.m.wood, KC.wood, { cast: false })
  c.col.wall(D.x - D.w / 2, D.z - D.d / 2, D.x + D.w / 2, D.z - D.d / 2, D.y, D.y + 0.9, 0.12)
  // 上がる段（南から）
  const sb = v(D.x, 0, D.z + D.d / 2 + 3.4)
  const st = v(D.x, D.y, D.z + D.d / 2)
  for (let i = 0; i < 8; i++) {
    const t = (i + 1) / 8
    box(c, D.x, (D.y * t) / 2, sb.z + (st.z - sb.z) * (i + 0.5) / 8, D.w - 0.4, D.y * t, 3.4 / 8 + 0.02, c.m.planks, { texM: 1 })
  }
  collideRamp(c, sb, st, D.w - 0.4, 0.4)
  torchPost(c, D.x + 1.5, 0, D.z + D.d / 2 + 3.8)
}

/** 小さなナーガの頭（柱の上の飾り） */
function nagaHeadSmall(c: KCtx, x: number, y: number, z: number, rotY: number): void {
  const fx = -Math.sin(rotY)
  const fz = -Math.cos(rotY)
  for (let k = -2; k <= 2; k++) {
    const a = (k / 2) * 1.0
    const p = v(x + fx * 0.15 + Math.cos(rotY) * Math.sin(a) * 0.35, y + 0.35 + Math.cos(a) * 0.3, z + fz * 0.15 - Math.sin(rotY) * Math.sin(a) * 0.35)
    c.b.add(new THREE.SphereGeometry(0.11, 7, 5), c.m.sandstone, M(p.x, p.y, p.z), { tint: KC.sand })
  }
}

// ------------------------------------------------------------------ 村（陸）

function buildVillage(c: KCtx, targets: ClawTargetDef[], movables: MovableInput[]): void {
  for (const h of LAND_HOUSES) stiltHouse(c, h)
  // かまど
  hearth(c, -64.6, -18.4, 0.6)
  hearth(c, -43.2, -18.2, -0.4)
  hearth(c, -71, 11, 1.4)
  hearth(c, -39.6, 15.6, -1.2)
  hearth(c, -69, 33.6, 2.0)
  // かご・つぼ・米の山
  const rng = c.rng
  const clusters: Array<[number, number]> = [
    [-67, -20],
    [-48.5, -20.8],
    [-74.5, 8],
    [-37, 13],
    [-72, 31],
    [-45, 33],
    [-58.6, 37.5],
    [-31, -35],
  ]
  for (const [x, z] of clusters) {
    for (let k = 0; k < 4; k++) {
      const px = x + (rng() - 0.5) * 2.2
      const pz = z + (rng() - 0.5) * 2.2
      if (k % 2 === 0) basket(c, px, 0, pz, 0.8 + rng() * 0.5, rng() < 0.5 ? KC.basket : '#b8945a', rng() < 0.4)
      else jar(c, px, 0, pz, 0.8 + rng() * 0.6, rng() < 0.5 ? KC.clay : KC.clayDark)
    }
    c.col.box(x, 0.4, z, 2.6, 0.8, 2.6)
  }
  // 布を干す竿（クロマー）
  const cloth = (ax: number, az: number, bx: number, bz: number, n: number) => {
    for (const [px, pz] of [
      [ax, az],
      [bx, bz],
    ]) {
      cyl(c, px, 0, 2.1, pz, 0.05, c.m.wood, { tint: KC.wood, seg: 5 })
      c.col.box(px, 1, pz, 0.15, 2, 0.15)
    }
    strut(c, v(ax, 2.0, az), v(bx, 2.0, bz), 0.02, c.m.wood, KC.woodDark, { cast: false })
    const len = Math.hypot(bx - ax, bz - az)
    const ang = Math.atan2(bz - az, bx - ax)
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const w = (len / n) * 0.85
      const h = 0.9 + rng() * 0.5
      const g = new THREE.PlaneGeometry(w, h)
      // アトラスの 1 区画（v は内側に少しよせて、区画ごとの上端を固定に）
      const tile = Math.floor(rng() * 4)
      const u0 = (tile % 2) * 0.5
      const v0 = Math.floor(tile / 2) * 0.5
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + 0.01 + uv.getX(k) * 0.48, v0 + 0.01 + uv.getY(k) * 0.48)
      c.b.add(g, c.m.krama, M(ax + (bx - ax) * t, 2.0 - h / 2, az + (bz - az) * t, 0, -ang, 0), { cast: false, uv: 'keep' })
    }
  }
  cloth(-69, -28.6, -63.6, -29.6, 4)
  cloth(-50, -30.6, -44.8, -31.2, 3)
  cloth(-85, 9, -85.4, 14, 3)
  cloth(-38.6, 24, -34, 26.4, 3)
  cloth(-73.6, 35, -68.4, 36.6, 4)
  // 舟（岸に上げた舟）
  boat(c, -46, 0, -37.4, 0.1, 5.2)
  boat(c, -52, 0, -36.6, -0.15, 4.4, '#7a5636')
  boat(c, -24.6, 0, 18, Math.PI / 2 + 0.1, 4.8)
  // 子どもの広場：大きな木・遊び道具（輪・竹馬・地面の遊びの線）
  const P = K.PLAZA
  bigTree(c, P.x - 4.2, P.z - 5.6, 1.35)
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1
    c.b.add(new THREE.TorusGeometry(0.35, 0.03, 5, 18), c.m.wood, M(P.x + 3 + Math.cos(a) * 1.2, 0.04, P.z + 3.4 + Math.sin(a) * 1.2, Math.PI / 2, 0, 0), { tint: '#c8a060', cast: false })
  }
  for (const s of [-1, 1]) strut(c, v(P.x - 2.4 + s * 0.3, 0, P.z + 4.6), v(P.x - 2.2 + s * 0.3, 1.6, P.z + 4.9), 0.03, c.m.wood, KC.wood)
  // 地面の遊びの線（石けりのます目）
  for (let i = 0; i < 6; i++) box(c, P.x + 1.2, 0.012, P.z - 1 + i * 0.7, 0.62, 0.012, 0.62, c.m.plain, { tint: i % 2 ? '#e8d8b8' : '#d8c8a8', cast: false })
  // 竹の柵（広場のまわりを一部）
  for (let k = 0; k < 14; k++) {
    const a = 0.4 + (k / 14) * 1.8
    const x = P.x + Math.cos(a) * (P.r + 0.6)
    const z = P.z + Math.sin(a) * (P.r + 0.6)
    cyl(c, x, 0, 1.0 + (k % 3) * 0.1, z, 0.05, c.m.bark, { tint: '#b8a068', seg: 5, cast: false })
  }
  // 木の上に引っかかったまり（籐のまり）：クローで取ってあげられる
  const ballPos = v(P.x - 3.4, 6.3, P.z - 4.4)
  const ball = new THREE.Group()
  const ballMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshStandardMaterial({ color: '#d8b060', roughness: 0.85, wireframe: false }))
  const ballWeave = new THREE.Mesh(new THREE.IcosahedronGeometry(0.175, 1), new THREE.MeshStandardMaterial({ color: '#8a6a30', wireframe: true }))
  ballMesh.position.y = 0.17
  ballWeave.position.y = 0.17
  ball.add(ballMesh, ballWeave)
  ball.position.copy(ballPos)
  ballMesh.castShadow = true
  c.root.add(ball)
  const ballDef: ClawTargetDef = { id: KHMER_BALL_ID, type: 'pull_object', label: '籐のまり', point: ballPos.clone().add(v(0, 0.17, 0)), radius: 0.3, enabled: true }
  targets.push(ballDef)
  movables.push({ def: ballDef, object: ball, half: v(0.17, 0.17, 0.17), home: ballPos.clone() })
  // ヤシ・大きな木
  const palms: Array<[number, number, number, 'sugar' | 'coco']> = [
    [-80, -34, 11, 'sugar'],
    [-66, -35, 9, 'coco'],
    [-54, -33.6, 10, 'coco'],
    [-38, -33, 9.5, 'coco'],
    [-27, -37, 8.6, 'coco'],
    [-86, -12, 12, 'sugar'],
    [-60, -12, 11, 'sugar'],
    [-36, -6, 10, 'sugar'],
    [-85, 20, 10.5, 'coco'],
    [-66, 18, 12, 'sugar'],
    [-46, 20, 9, 'coco'],
    [-28, 30, 11, 'sugar'],
    [-56, 26, 10, 'coco'],
    [-88, 38, 11, 'sugar'],
    [-30, -18, 9, 'coco'],
  ]
  for (const [x, z, h, k] of palms) palm(c, x, z, h, k)
  bigTree(c, -82, -20, 1.1)
  bigTree(c, -30, 38, 1.0)
  bigTree(c, -66, 44, 1.1)
  // 村の松明
  torchPost(c, -56, 0, 0.6)
  torchPost(c, -48.6, 0, 15)
  torchPost(c, -60.8, 0, 15.6)
  torchPost(c, -37, 0, -24)
  torchPost(c, -27, 0, -8)
}

/** 木の上のまり（つかむNMClaw） */
export const KHMER_BALL_ID = 'khmer_rattan_ball'

// ------------------------------------------------------------------ 石の橋（ナーガの手すり）

/** 主な道（池のほとり → 石の橋 → 門 → 大階段）の舗装の色と、まん中の帯 */
const ROUTE_TINT = '#fff0d0'
const ROUTE_BAND = { w: 0.16, tint: '#ffd894' }

/** 主な道のまん中の細い帯（x0〜x1、高さ y の床の上） */
function routeBand(c: KCtx, x0: number, x1: number, y: number, zc: number): void {
  box(c, (x0 + x1) / 2, y + 0.006, zc, x1 - x0, 0.012, ROUTE_BAND.w, c.m.route, { tint: ROUTE_BAND.tint, cast: false })
}

function buildBridge(c: KCtx): void {
  const B = K.BRIDGE
  const y = B.deckY
  const zc = (B.z0 + B.z1) / 2
  // 石の道（盛り土）と、水路の上の橋。西の端に坂、東の端は門の基壇へ
  boxAB(c, B.x0, B.x1, y - 0.5, y, B.z0, B.z1, c.m.route, { tint: ROUTE_TINT, texM: 3, collide: true })
  boxAB(c, B.x0 - 0.1, B.x1, -0.1, y - 0.1, B.z0 - 0.12, B.z1 + 0.12, c.m.laterite, { tint: KC.laterite, texM: 2, cast: false })
  boxAB(c, K.CANAL.x0, K.CANAL.x1, -2.2, y - 0.5, B.z0 + 0.4, B.z1 - 0.4, c.m.sandstone, { tint: KC.sandGrey, texM: 3 })
  // 橋の下のアーチ（持ち送りの穴）
  for (const x of [-19.6, -14.4]) box(c, x, -0.9, zc, 2.2, 1.9, B.z1 - B.z0 + 0.1, c.m.plain, { tint: '#1a2420', cast: false })
  const a = v(B.x0 - B.ramp, 0, zc)
  const b = v(B.x0, y, zc)
  collideRamp(c, a, b, B.z1 - B.z0, 0.4)
  box(c, B.x0 - B.ramp / 2, y / 2 - 0.12, zc, Math.hypot(B.ramp, y), 0.3, B.z1 - B.z0, c.m.route, { rotZ: Math.atan2(y, B.ramp), tint: ROUTE_TINT, texM: 3 })
  // ナーガの手すり（両側）と、両端の七つの頭
  for (const z of [B.z0 - 0.05, B.z1 + 0.05]) nagaRail(c, B.nagaWest + 1.15, z, B.nagaEast - 1.15, z, y, y + 0.72)
  for (const z of [B.z0 - 0.05, B.z1 + 0.05]) {
    // 頭は外を向く（西のたもとは西、東のたもとは東）
    nagaHead(c, B.nagaWest, y, z, Math.PI / 2, 0.9)
    nagaHead(c, B.nagaEast, y, z, -Math.PI / 2, 0.9)
  }
  // 橋へ来る石の道
  boxAB(c, -40, B.x0 - B.ramp, 0, 0.03, B.z0 + 0.6, B.z1 - 0.6, c.m.route, { tint: ROUTE_TINT, texM: 3, cast: false })
  // 道のまん中の細い帯（池のほとり → 坂 → 橋 → 門。次に通る入口へ目を運ぶ）
  routeBand(c, -40, B.x0 - B.ramp, 0.03, zc)
  box(c, B.x0 - B.ramp / 2, y / 2 + 0.035, zc, Math.hypot(B.ramp, y), 0.012, ROUTE_BAND.w, c.m.route, { rotZ: Math.atan2(y, B.ramp), tint: ROUTE_BAND.tint, cast: false })
  routeBand(c, B.x0, B.x1, y, zc)
  // 松明（西のたもと）
  for (const z of [B.z0 - 1.1, B.z1 + 1.1]) torchPost(c, B.nagaWest - 1.6, 0, z)
  // 道ばたの獅子
  lion(c, -34.2, 0, B.z0 - 0.6, Math.PI / 2, 0.9)
  lion(c, -34.2, 0, B.z1 + 0.6, Math.PI / 2, 0.9)
}

// ------------------------------------------------------------------ 寺

/** 南の塔のくずれた区切り（石の道すじに使う） */
const southWalls: Array<{ seg: number; foot: THREE.Vector3; up: THREE.Vector3; y0: number }> = []

function buildTemple(c: KCtx): void {
  southWalls.length = 0
  const C = K.COURT
  const G = K.GALLERY
  // 境内の舗装：西の門から大階段への参道・中央の山のまわり・東西南北の門から塔への道（ほかは草）
  const Pyr = K.PYRAMID
  const p1 = Pyr.tiers[0]
  const garden: Rect = { x0: K.SHARD_GROUND.x - 2.2, x1: K.SHARD_GROUND.x + 2.2, z0: K.SHARD_GROUND.z - 2.2, z1: K.SHARD_GROUND.z + 2.2 }
  const pave = (x0: number, x1: number, z0: number, z1: number) => boxAB(c, x0, x1, 0, 0.03, z0, z1, c.m.paving, { tint: '#f2e2c4', texM: 3.2, cast: false })
  const ax0 = Pyr.cx - p1.half - 2.2
  const ax1 = Pyr.cx + p1.half + 2.2
  const az0 = Pyr.cz - p1.half - 2.2
  const az1 = Pyr.cz + p1.half + 2.2
  // 山のまわり（帯）
  pave(ax0, ax1, az0, Pyr.cz - p1.half + 0.2)
  pave(ax0, ax1, Pyr.cz + p1.half - 0.2, az1)
  pave(ax0, Pyr.cx - p1.half + 0.2, az0, az1)
  pave(Pyr.cx + p1.half - 0.2, ax1, az0, az1)
  // 参道（西の門 → 大階段）：主な道なので、ほかの舗装と材質を分けて明るく・なめらかに。まん中に細い帯
  boxAB(c, G.xWall + 0.6, ax0, 0, 0.03, -7.4, -0.6, c.m.route, { tint: ROUTE_TINT, texM: 3.2, cast: false })
  routeBand(c, K.GOPURA.x + 4.2, K.STAIRS.x0, 0.03, K.GOPURA.z)
  // 東：東の塔と回る鏡の台へ・東の門へ
  pave(ax1, C.x1, -7.4, -0.6)
  pave(K.TURNTABLE.x - 2.6, K.TURNTABLE.x + 2.6, az1, K.TURNTABLE.z + 2.6)
  // 南：南の塔へ・南の門へ
  pave(Pyr.cx - 3.4, Pyr.cx + 3.4, az1, C.z1)
  // 北：北の門（池の岸の石段）へ
  pave(Pyr.cx - 3.4, Pyr.cx + 3.4, C.z0, az0)
  // 回廊ぞいの道（南北）
  pave(G.xWall + 0.6, G.xWall + 3.4, C.z0 + 1, C.z1 - 1)
  // 土の庭（アルンのかけらが落ちる土）：ふちの石と、小さな木
  for (const [x0, x1, z0, z1] of [
    [garden.x0, garden.x1, garden.z0, garden.z0 + 0.3],
    [garden.x0, garden.x1, garden.z1 - 0.3, garden.z1],
    [garden.x0, garden.x0 + 0.3, garden.z0, garden.z1],
    [garden.x1 - 0.3, garden.x1, garden.z0, garden.z1],
  ])
    boxAB(c, x0, x1, 0, 0.18, z0, z1, c.m.sandstone, { tint: KC.sandGrey, texM: 1, cast: false })
  boxAB(c, garden.x0 + 0.3, garden.x1 - 0.3, 0, 0.03, garden.z0 + 0.3, garden.z1 - 0.3, c.m.plain, { tint: '#6a4a30', cast: false })
  cyl(c, garden.x0 + 1.0, 0, 1.8, garden.z1 - 1.0, 0.09, c.m.bark, { tint: '#8a7a68', r1: 0.06, seg: 6 })
  c.b.add(new THREE.IcosahedronGeometry(0.9, 1), c.m.canopy, M(garden.x0 + 1.0, 2.2, garden.z1 - 1.0, 0, 0, 0, 1, 0.7, 1), { tint: '#4f8a3a' })
  for (let k = 0; k < 6; k++) c.b.add(new THREE.SphereGeometry(0.09, 6, 5), c.m.plain, M(garden.x0 + 1.0 + Math.cos(k) * 0.7, 2.4 + Math.sin(k * 3) * 0.2, garden.z1 - 1.0 + Math.sin(k) * 0.7), { tint: '#fff4e0', cast: false })
  // ラテライトの低い塀（北・東・南）。門のところはあける
  const H = K.WALL_H
  const wall = (x0: number, x1: number, z0: number, z1: number) => {
    boxAB(c, x0, x1, 0, H, z0, z1, c.m.laterite, { tint: KC.laterite, texM: 2, collide: true })
    boxAB(c, x0 - 0.08, x1 + 0.08, H, H + 0.18, z0 - 0.08, z1 + 0.08, c.m.sandstone, { tint: KC.sandGrey, texM: 2 })
  }
  wall(C.x0, 21, C.z0 - 0.8, C.z0)
  wall(31, C.x1 + 0.8, C.z0 - 0.8, C.z0)
  wall(C.x0, 21, C.z1, C.z1 + 0.8)
  wall(31, C.x1 + 0.8, C.z1, C.z1 + 0.8)
  wall(C.x1, C.x1 + 0.8, C.z0, -8.5)
  wall(C.x1, C.x1 + 0.8, 0.5, C.z1)
  wall(C.x0 - 0.8, C.x0, C.z0, G.z0)
  wall(C.x0 - 0.8, C.x0, G.z1, C.z1)
  // 門の柱（南・北・東の入口）
  for (const [x, z] of [
    [21, C.z0 - 0.4],
    [31, C.z0 - 0.4],
    [21, C.z1 + 0.4],
    [31, C.z1 + 0.4],
    [C.x1 + 0.4, -8.5],
    [C.x1 + 0.4, 0.5],
  ])
    box(c, x, 1.2, z, 1.0, 2.4, 1.0, c.m.sandstone, { tint: KC.sand, texM: 1, collide: true })
  buildGallery(c)
  buildPyramid(c)
  smallTower(c, 'e')
  smallTower(c, 's')
  // 回る鏡の台の石の太鼓
  const T = K.TURNTABLE
  cyl(c, T.x, 0, 0.8, T.z, 1.5, c.m.sandstone, { tint: KC.sand, seg: 20, collide: true, r1: 1.4 })
  cyl(c, T.x, 0, 0.2, T.z, 1.75, c.m.sandstone, { tint: KC.sandGrey, seg: 20 })
  // 境内の木（根が回廊の北の端をのみこむ大きな木）
  rootTree(c, 0.6, -30.6)
  bigTree(c, 54, 28, 1.0)
  bigTree(c, 48, -30, 0.9)
  palm(c, 8, 30, 10, 'sugar')
  palm(c, 40, -32, 11, 'sugar')
  palm(c, 58, 14, 9.5, 'coco')
  // 境内の松明
  torchPost(c, 36, 0, 6)
  torchPost(c, 44, 0, 14)
  torchPost(c, 22, 0, 14)
  torchPost(c, 30, 0, 14)
}

/** 西の門（ゴープラ）と、浮き彫りの回廊 */
function buildGallery(c: KCtx): void {
  const G = K.GALLERY
  const P = K.GOPURA
  const gz0 = P.z - P.halfZ
  const gz1 = P.z + P.halfZ
  const fy = G.floorY
  // 回廊の床（低い基壇）
  for (const [z0, z1] of [
    [G.z0, gz0],
    [gz1, G.z1],
  ]) {
    boxAB(c, G.xPillar - 0.5, G.xWall + 0.6, 0, fy, z0, z1, c.m.sandstone, { tint: KC.sandGrey, texM: 3, collide: true })
    // 柱
    for (let z = z0 + 1.0; z < z1 - 0.5; z += 3) {
      box(c, G.xPillar, fy + G.wallH / 2, z, 0.5, G.wallH, 0.5, c.m.sandstone, { tint: KC.sand, texM: 1, collide: true })
      box(c, G.xPillar, fy + 0.15, z, 0.66, 0.3, 0.66, c.m.sandstone, { tint: shade(KC.sand, 0.92), texM: 1 })
      box(c, G.xPillar, fy + G.wallH - 0.12, z, 0.7, 0.24, 0.7, c.m.sandstone, { tint: shade(KC.sand, 1.05), texM: 1 })
    }
    // 浮き彫りの壁（西の面が浮き彫り）
    boxAB(c, G.xWall, G.xWall + 0.6, fy, fy + G.wallH, z0, z1, c.m.sandstone, { tint: KC.sand, texM: 3, collide: true })
    // 屋根（持ち送りのアーチ：2 枚の傾いた石の板）
    const xa = G.xPillar - 0.45
    const xb = G.xWall + 0.65
    const xr = (xa + xb) / 2
    const ys = fy + G.wallH
    const run = (xb - xa) / 2
    const rise = G.ridge - ys
    const slope = Math.hypot(run, rise)
    const ang = Math.atan2(rise, run)
    const len = z1 - z0
    box(c, xa + run / 2, ys + rise / 2, (z0 + z1) / 2, slope, 0.32, len, c.m.sandstone, { rotZ: ang, tint: shade(KC.sand, 0.95), texM: 2 })
    box(c, xb - run / 2, ys + rise / 2, (z0 + z1) / 2, slope, 0.32, len, c.m.sandstone, { rotZ: -ang, tint: shade(KC.sand, 0.95), texM: 2 })
    box(c, xr, G.ridge + 0.05, (z0 + z1) / 2, 0.42, 0.3, len, c.m.sandstone, { tint: shade(KC.sand, 1.04), texM: 2 })
    box(c, xa + 0.1, ys + 0.05, (z0 + z1) / 2, 0.5, 0.32, len, c.m.sandstone, { tint: shade(KC.sand, 1.06), texM: 2 })
  }
  // 浮き彫りの板（壁の西の面に貼る）。h は板の高さ、y0 は下の端
  const relief = (z0: number, z1: number, mat: THREE.Material, uvScale: [number, number], h = G.wallH - 0.7, y0 = fy + 0.35, dx = 0) => {
    if (z1 - z0 < 1) return
    const g = new THREE.PlaneGeometry(z1 - z0, h)
    g.rotateY(-Math.PI / 2)
    c.b.add(g, mat, M(G.xWall - 0.012 - dx, y0 + h / 2, (z0 + z1) / 2), { tint: '#ffffff', uv: 'scale', uvScale, cast: false })
  }
  // 物語の浮き彫り（16:9 の一枚絵）：門を入ってすぐ南。少し浮かせた額の中に
  const RS = K.RELIEF_STORY
  const storyH = G.wallH - 0.2
  const storyW = storyH * (16 / 9) * (c.m.art.story ? 1 : 2.2)
  const sz = (RS.z0 + RS.z1) / 2
  boxAB(c, G.xWall - 0.12, G.xWall, fy + 0.02, fy + G.wallH - 0.02, sz - storyW / 2 - 0.25, sz + storyW / 2 + 0.25, c.m.sandstone, { tint: shade(KC.sand, 1.06), texM: 2 })
  relief(sz - storyW / 2, sz + storyW / 2, c.m.reliefStory, [1, 1], storyH, fy + 0.1, 0.12)
  // 物語の浮き彫りを照らす、あたたかい補助灯（回廊の屋根の下は暗く、絵が黒くつぶれるため）
  c.lights.push({ pos: v(G.xWall - 1.7, fy + 2.3, sz), color: '#ffe4bf', intensity: 1.5, dist: 5 })
  // 帯の浮き彫り（アプサラ・はす・ナーガ）
  const bandH = G.wallH - 0.7
  const bandLen = bandH * 2
  const band = (z0: number, z1: number) => relief(z0, z1, c.m.reliefBand, [(z1 - z0) / bandLen, 1], bandH)
  band(G.z0 + 0.6, gz0 - 0.4)
  band(gz1 + 0.4, sz - storyW / 2 - 0.4)
  band(sz + storyW / 2 + 0.4, G.z1 - 0.6)
  // 門（ゴープラ）：通り抜けの道・両わきの壁・上の段と小さな塔
  const x0 = P.x - 3.6
  const x1 = P.x + 3.6
  const doorZ0 = P.z - P.door
  const doorZ1 = P.z + P.door
  const wallTop = 4.2
  boxAB(c, x0 - 0.6, x1 + 0.6, 0, fy, gz0, gz1, c.m.sandstone, { tint: KC.sandGrey, texM: 3, collide: true })
  routeBand(c, x0 - 0.6, x1 + 0.6, fy, P.z)
  boxAB(c, x0, x1, fy, wallTop, gz0, doorZ0, c.m.sandstone, { tint: KC.sand, texM: 3, collide: true })
  boxAB(c, x0, x1, fy, wallTop, doorZ1, gz1, c.m.sandstone, { tint: KC.sand, texM: 3, collide: true })
  boxAB(c, x0, x1, fy + 3.1, wallTop, doorZ0, doorZ1, c.m.sandstone, { tint: shade(KC.sand, 1.03), texM: 3 })
  // 門の上の段と塔
  tier(c, P.x, P.z, 3.9, P.halfZ + 0.3, wallTop, wallTop + 0.9, { tint: KC.sand })
  tier(c, P.x, P.z, 3.1, P.halfZ - 0.6, wallTop + 0.9, wallTop + 1.7, { tint: shade(KC.sand, 1.03) })
  prasatSpire(c, P.x, wallTop + 1.7, P.z, 3.4, 6.2, { tint: KC.sand, tiers: 6 })
  // 入口の枠（西と東）
  for (const sx of [-1, 1]) {
    const fx = sx < 0 ? x0 : x1
    for (const z of [doorZ0 - 0.18, doorZ1 + 0.18]) box(c, fx + sx * 0.12, fy + 1.6, z, 0.3, 3.2, 0.36, c.m.sandstone, { tint: shade(KC.sand, 1.06), texM: 1 })
    box(c, fx + sx * 0.14, fy + 3.3, P.z, 0.32, 0.36, P.door * 2 + 0.9, c.m.sandstone, { tint: shade(KC.sand, 1.08), texM: 1 })
    const tri = new THREE.ConeGeometry(P.door * 1.6, 1.3, 3, 1)
    tri.rotateY(Math.PI / 6)
    tri.scale(0.2, 1, 1)
    c.b.add(tri, c.m.sandstone, M(fx + sx * 0.14, fy + 4.1, P.z), { tint: shade(KC.sand, 1.04) })
  }
  // 門の前の獅子と松明
  lion(c, x0 - 1.0, 0, doorZ0 - 0.9, Math.PI / 2, 0.85)
  lion(c, x0 - 1.0, 0, doorZ1 + 0.9, Math.PI / 2, 0.85)
  torchPost(c, x0 - 0.7, 0, gz0 - 0.6)
  torchPost(c, x0 - 0.7, 0, gz1 + 0.6)
  torchPost(c, x1 + 0.7, 0, gz0 - 0.6)
  torchPost(c, x1 + 0.7, 0, gz1 + 0.6)
}

/** 中央の塔の山（3 段）・大階段のほお壁と獅子・上の台・中央の祠堂（十字形の部屋）とアルンの台座・四すみの小さな塔 */
function buildPyramid(c: KCtx): void {
  const Pyr = K.PYRAMID
  const tints = [shade(KC.sand, 0.94), KC.sand, shade(KC.sandWarm, 1.0)]
  Pyr.tiers.forEach((t, i) => tier(c, Pyr.cx, Pyr.cz, t.half, t.half, t.y0, t.y1, { tint: tints[i], collide: true }))
  // 段の面の飾り（にせの窓の列）
  Pyr.tiers.forEach((t) => {
    const h = t.y1 - t.y0
    for (const [nx, nz] of [
      [1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = Math.floor((t.half * 2 - 2) / 2.4)
      for (let k = 0; k < n; k++) {
        const along = -t.half + 1.6 + k * 2.4
        const x = Pyr.cx + nx * (t.half - 0.06) + (nz !== 0 ? along : 0)
        const z = Pyr.cz + nz * (t.half - 0.06) + (nx !== 0 ? along : 0)
        box(c, x, t.y0 + h * 0.5, z, nx !== 0 ? 0.14 : 1.2, h * 0.42, nz !== 0 ? 0.14 : 1.2, c.m.sandstone, { tint: shade(KC.sandDark, 1.05), cast: false })
      }
    }
  })
  // 大階段のほお壁（段ごとの箱）と獅子
  const S = K.STAIRS
  for (const z of [S.z0 - 0.3, S.z1 + 0.3]) {
    for (let i = 0; i < S.segs; i++) {
      const x = S.x0 + S.run * (i + 0.5)
      const top = S.rise * (i + 0.5) + 0.75
      box(c, x, top / 2, z, S.run + 0.02, top, 0.6, c.m.sandstone, { tint: shade(KC.sand, 0.9), texM: 3, collide: true })
    }
  }
  lion(c, S.x0 - 0.9, 0, S.z0 - 0.5, Math.PI / 2, 1.1)
  lion(c, S.x0 - 0.9, 0, S.z1 + 0.5, Math.PI / 2, 1.1)
  // 階段のわきの松明（夜の防衛で照らす）。いちばん下の区切りにも立てて、夜に「ここからのぼる」入口を見せる
  for (const i of [0, 2, 5]) for (const z of [S.z0 - 0.3, S.z1 + 0.3]) torchPost(c, S.x0 + S.run * (i + 0.5), S.rise * (i + 0.5) + 0.75, z, 1.0)
  // 松明の照り返し：大階段の下の段のまん中を照らす（夜にのぼる段が読めるように）。松明と同じ色なので、強さは松明といっしょに切りかわる
  c.lights.push({ pos: v(S.x0 + 0.5, 2.4, (S.z0 + S.z1) / 2), color: '#ffa04a', intensity: 0, dist: 9 })
  // 上の台の舗装
  const top = Pyr.tiers[2]
  const Y = K.TOP_Y
  boxAB(c, Pyr.cx - top.half + 0.1, Pyr.cx + top.half - 0.1, Y - 0.02, Y + 0.03, Pyr.cz - top.half + 0.1, Pyr.cz + top.half - 0.1, c.m.paving, { tint: '#f4e6cc', texM: 3, cast: false })
  // 上の台の四すみの小さな塔
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    smallPrasat(c, Pyr.cx + sx * (top.half - 1.25), Y, Pyr.cz + sz * (top.half - 1.25), 1.5, 5.2, KC.sand)
  // 上の台の松明（四すみの塔の内側）
  for (const [sx, sz] of [
    [-1, -1],
    [-1, 1],
  ])
    torchPost(c, Pyr.cx + sx * (top.half - 0.5), Y, Pyr.cz + sz * (top.half - 3.2), 1.2)
  buildSanctuary(c)
}

/** 中央の祠堂：十字形の部屋（四方に入口）、中にアルンの台座、上に大きな塔 */
function buildSanctuary(c: KCtx): void {
  const S = K.SANCTUARY
  const cx = K.ARUN.x
  const cz = K.ARUN.z
  const Y = K.TOP_Y
  const top = Y + S.h
  const tint = KC.sandWarm
  const h = S.half
  const w = S.wall
  // 本体の 4 つの角（入口のあいだの壁）
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    // x の面の壁（入口の外）
    boxAB(c, Math.min(cx + sx * h, cx + sx * (h - w)), Math.max(cx + sx * h, cx + sx * (h - w)), Y, top, Math.min(cz + sz * S.door, cz + sz * h), Math.max(cz + sz * S.door, cz + sz * h), c.m.sandstone, { tint, texM: 2, collide: true })
    // z の面の壁
    boxAB(c, Math.min(cx + sx * S.door, cx + sx * h), Math.max(cx + sx * S.door, cx + sx * h), Y, top, Math.min(cz + sz * h, cz + sz * (h - w)), Math.max(cz + sz * h, cz + sz * (h - w)), c.m.sandstone, { tint, texM: 2, collide: true })
  }
  // 入口の上のまぐさ
  for (const [nx, nz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const x = cx + nx * (h - w / 2)
    const z = cz + nz * (h - w / 2)
    box(c, x, Y + S.doorH + (S.h - S.doorH) / 2, z, nx !== 0 ? w : S.door * 2, S.h - S.doorH, nz !== 0 ? w : S.door * 2, c.m.sandstone, { tint: shade(tint, 1.04), texM: 1 })
    // 入口の張り出し（ポーチ）：両わきの壁・屋根・破風
    const px = cx + nx * (h + S.porch / 2)
    const pz = cz + nz * (h + S.porch / 2)
    for (const s of [-1, 1]) {
      const sx = px + (nz !== 0 ? s * (S.porchHalf - 0.22) : 0)
      const sz = pz + (nx !== 0 ? s * (S.porchHalf - 0.22) : 0)
      box(c, sx, Y + S.doorH / 2 + 0.1, sz, nx !== 0 ? S.porch : 0.44, S.doorH + 0.2, nz !== 0 ? S.porch : 0.44, c.m.sandstone, { tint: shade(tint, 0.97), texM: 1, collide: true })
    }
    box(c, px, Y + S.doorH + 0.32, pz, nx !== 0 ? S.porch + 0.2 : S.porchHalf * 2 + 0.2, 0.44, nz !== 0 ? S.porch + 0.2 : S.porchHalf * 2 + 0.2, c.m.sandstone, { tint: shade(tint, 1.05), texM: 1 })
    const tri = new THREE.ConeGeometry(S.porchHalf * 1.15, 1.5, 3, 1)
    tri.rotateY(Math.PI / 6)
    tri.scale(1, 1, 0.24)
    const ex = cx + nx * (h + S.porch - 0.1)
    const ez = cz + nz * (h + S.porch - 0.1)
    c.b.add(tri, c.m.sandstone, M(ex, Y + S.doorH + 1.25, ez, 0, Math.atan2(nx, nz), 0), { tint: shade(tint, 1.03) })
  }
  // 屋根の板と塔
  box(c, cx, top + 0.2, cz, h * 2 + 0.3, 0.4, h * 2 + 0.3, c.m.sandstone, { tint: shade(tint, 1.06), texM: 2 })
  prasatSpire(c, cx, top + 0.4, cz, h * 1.82, S.towerTop - top - 0.4, { tint, tiers: 8 })
  // 部屋の床
  boxAB(c, cx - h + w, cx + h - w, Y - 0.01, Y + 0.035, cz - h + w, cz + h - w, c.m.paving, { tint: '#d8c8b0', texM: 2, cast: false })
  // アルンの台座（はすの台）
  const A = K.ARUN
  cyl(c, A.x, Y, Y + 0.22, A.z, 1.25, c.m.sandstone, { tint: shade(tint, 0.95), seg: 8 })
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    c.b.add(new THREE.SphereGeometry(0.28, 6, 5), c.m.sandstone, M(A.x + Math.cos(a) * 1.0, Y + 0.32, A.z + Math.sin(a) * 1.0, 0, -a, 0.5, 0.6, 0.6, 1.1), { tint: shade(tint, 1.05) })
  }
  cyl(c, A.x, Y + 0.22, Y + K.ARUN_PEDESTAL, A.z, 0.95, c.m.sandstone, { tint: shade(tint, 1.08), seg: 16 })
  collideCylinder(c, A.x, Y, Y + K.ARUN_PEDESTAL + K.ARUN_HEIGHT, A.z, 1.15)
}

/** 小さな塔（北・東・南）：3 段の基壇・正面の階段・上の台・後ろ半分の小さな祠堂・鏡の台 */
function smallTower(c: KCtx, id: TowerId): void {
  const t = TOWERS[id]
  const S = SMALL_TOWER
  let y = t.baseY
  const tints = [shade(KC.sand, 0.92), KC.sand, KC.sandWarm]
  S.tiers.forEach((tr, i) => {
    tier(c, t.x, t.z, tr.half, tr.half, y, y + tr.h, { tint: tints[i], collide: true })
    y += tr.h
  })
  const topY = t.baseY + S.top
  const half = S.tiers[2].half
  // 上の台の舗装
  boxAB(c, t.x - half + 0.08, t.x + half - 0.08, topY - 0.02, topY + 0.03, t.z - half + 0.08, t.z + half - 0.08, c.m.paving, { tint: '#f4e6cc', texM: 3, cast: false })
  // 正面の階段（下 → 上の台のふち）
  const St = S.stairs
  const up = v(-t.front[0], 0, -t.front[1])
  const bottom = towerPoint(t, half + St.run * St.segs, 0, 0)
  const flight = buildFlight(c, { bottom, up, width: St.width, segs: St.segs, rise: St.rise, run: St.run, broken: t.broken, tint: KC.sand })
  for (const w of flight.walls) southWalls.push({ seg: w.seg, foot: w.foot, up, y0: w.y0 })
  // 後ろ半分の小さな祠堂
  const sh = towerPoint(t, -S.shrine.back, 0, S.top)
  smallPrasat(c, sh.x, sh.y, sh.z, S.shrine.half * 2, S.shrine.h, KC.sand)
  // 鏡の台（石の台座と、青銅の受け口）
  const st = towerPoint(t, S.stand.front, 0, S.top)
  box(c, st.x, st.y + S.stand.h / 2, st.z, S.stand.half * 2, S.stand.h, S.stand.half * 2, c.m.sandstone, { tint: shade(KC.sandWarm, 1.06), texM: 1, collide: true })
  box(c, st.x, st.y + 0.08, st.z, S.stand.half * 2 + 0.24, 0.16, S.stand.half * 2 + 0.24, c.m.sandstone, { tint: KC.sand, texM: 1 })
  c.b.add(new THREE.TorusGeometry(0.2, 0.05, 6, 16), c.m.bronze, M(st.x, st.y + S.stand.h + 0.03, st.z, Math.PI / 2, 0, 0), { tint: KC.bronze, cast: false })
  // 階段の下の松明
  const tp = towerPoint(t, half + St.run * St.segs + 0.6, St.width / 2 + 1.0, 0)
  torchPost(c, tp.x, tp.y, tp.z)
  const tp2 = towerPoint(t, half + St.run * St.segs + 0.6, -St.width / 2 - 1.0, 0)
  torchPost(c, tp2.x, tp2.y, tp2.z)
}

/** 根が回廊をのみこむ大きな木（タ・プローム風。白っぽい幹と、屋根から壁をつたって地面へ下りる根） */
function rootTree(c: KCtx, x: number, z: number): void {
  const G = K.GALLERY
  const baseY = G.ridge + 0.1
  const B = c.b
  const pale = '#e2d8c8'
  // 幹（屋根の上から）：太いねじれた束
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2
    const p0 = v(x + Math.cos(a) * 0.45, baseY, z + Math.sin(a) * 0.45)
    const p1 = v(x + Math.cos(a + 0.8) * 0.35, baseY + 3.5, z + Math.sin(a + 0.8) * 0.35)
    const p2 = v(x + Math.cos(a + 1.6) * 0.3, baseY + 7, z + Math.sin(a + 1.6) * 0.3)
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0, p1, p2]), 8, 0.38, 7, false), c.m.bark, undefined, { tint: pale })
  }
  // 根（屋根から壁の両側をつたって地面へ）
  const rng = c.rng
  for (let k = 0; k < 12; k++) {
    const side = k % 2 === 0 ? -1 : 1
    const along = (rng() - 0.5) * 4.5
    const xa = side < 0 ? G.xPillar - 0.6 : G.xWall + 0.75
    const pts = [
      v(x + side * 0.3, baseY + 0.2, z + along * 0.2),
      v(x + side * 1.4, baseY - 0.25, z + along * 0.6),
      v(xa, G.floorY + G.wallH - 0.2, z + along),
      v(xa + side * 0.15, 1.6, z + along * 1.1 + (rng() - 0.5)),
      v(xa + side * (0.5 + rng()), 0.02, z + along * 1.2 + (rng() - 0.5) * 2),
    ]
    B.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.12 + rng() * 0.1, 6, false), c.m.bark, undefined, { tint: shade(pale, 0.92 + rng() * 0.1) })
  }
  // 枝と葉（濃い緑のかたまり＋葉のカード）
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + rng() * 0.4
    const p = v(x + Math.cos(a) * 3.4, baseY + 7.5 + rng() * 2, z + Math.sin(a) * 3.4)
    strut(c, v(x, baseY + 6.2, z), p, 0.22, c.m.bark, pale, { r1: 0.12 })
    leafCrown(c, B, v(p.x, p.y + 0.8, p.z), 2.6, 0.62, 7, 1.45, new THREE.Color().setHSL(0.27, 0.46, 0.17 + rng() * 0.05))
  }
  B.add(new THREE.IcosahedronGeometry(3.4, 1), c.m.canopy, M(x, baseY + 10.5, z, 0, 0, 0, 1.3, 0.6, 1.3), { tint: '#2e5a26' })
}

// ------------------------------------------------------------------ 南（象の道・道の橋・水田）

function buildSouth(c: KCtx): void {
  const R = K.ROAD
  const RB = K.ROAD_BRIDGE
  const zc = (R.z0 + R.z1) / 2
  // 水路をわたる石の橋（象の道）
  boxAB(c, RB.x0, RB.x1, RB.deckY - 0.5, RB.deckY, R.z0 + 0.5, R.z1 - 0.5, c.m.laterite, { tint: KC.laterite, texM: 2, collide: true })
  boxAB(c, RB.x0 + 1, RB.x1 - 1, -2.2, RB.deckY - 0.5, R.z0 + 1.2, R.z1 - 1.2, c.m.laterite, { tint: shade(KC.laterite, 0.85), texM: 2 })
  for (const [x0, x1, upEast] of [
    [RB.x0 - 3, RB.x0, true],
    [RB.x1, RB.x1 + 3, false],
  ] as Array<[number, number, boolean]>) {
    collideRamp(c, v(upEast ? x0 : x1, 0, zc), v(upEast ? x1 : x0, RB.deckY, zc), R.z1 - R.z0 - 1, 0.4)
    const ang = Math.atan2(RB.deckY, 3) * (upEast ? 1 : -1)
    box(c, (x0 + x1) / 2, RB.deckY / 2 - 0.1, zc, Math.hypot(3, RB.deckY), 0.26, R.z1 - R.z0 - 1, c.m.laterite, { rotZ: ang, tint: KC.laterite, texM: 2 })
  }
  // 低い欄干
  for (const z of [R.z0 + 0.6, R.z1 - 0.6]) {
    boxAB(c, RB.x0, RB.x1, RB.deckY, RB.deckY + 0.6, z - 0.2, z + 0.2, c.m.laterite, { tint: KC.laterite, texM: 2, collide: true })
  }
  // 道ぞいのヤシ・休み小屋（サラ）
  for (let x = -84; x <= 72; x += 13) {
    if (x > -30 && x < -6) continue
    palm(c, x + c.rng() * 3, R.z0 - 2.4 - c.rng() * 1.5, 9 + c.rng() * 3, c.rng() < 0.5 ? 'sugar' : 'coco')
    if (c.rng() < 0.6) palm(c, x + 6 + c.rng() * 3, R.z1 + 2.2 + c.rng() * 1.5, 9 + c.rng() * 3, c.rng() < 0.5 ? 'sugar' : 'coco')
  }
  sala(c, 30, R.z1 + 4.6)
  torchPost(c, 26, 0, R.z0 - 1.2)
  torchPost(c, -40, 0, R.z0 - 1.2)
  // 道の石の標（象の道の目印）
  for (const x of [-70, -40, 10, 40, 66]) {
    box(c, x, 0.5, R.z0 - 0.7, 0.4, 1.0, 0.4, c.m.sandstone, { tint: KC.sandGrey, texM: 1, collide: true })
    c.b.add(new THREE.SphereGeometry(0.22, 8, 6), c.m.sandstone, M(x, 1.1, R.z0 - 0.7), { tint: KC.sand })
  }
}

/** 休み小屋（四本柱にヤシの葉の屋根） */
function sala(c: KCtx, x: number, z: number): void {
  for (const [dx, dz] of [
    [-1.8, -1.4],
    [1.8, -1.4],
    [-1.8, 1.4],
    [1.8, 1.4],
  ])
    cyl(c, x + dx, 0, 2.6, z + dz, 0.12, c.m.wood, { tint: KC.wood, seg: 6, collide: true })
  boxAB(c, x - 2, x + 2, 0.45, 0.6, z - 1.6, z + 1.6, c.m.planks, { texM: 2, collide: true })
  const g = new THREE.ConeGeometry(3.4, 1.6, 4, 1, true)
  c.b.add(g, c.m.thatch, M(x, 3.3, z, 0, Math.PI / 4, 0, 1, 1, 0.85), { tint: KC.thatchOld, uv: 'scale', uvScale: [3, 1] })
}

// ------------------------------------------------------------------ 遠景（森・山・食べられた森のあと）

function buildFar(c: KCtx): { mist: Drift } {
  const rng = c.rng
  const A = { x0: -128, x1: 116, z0: -134, z1: 100 }
  // 森の帯（歩ける範囲の外）：葉のかたまり
  // かたまりは 1 段だけ細かく（大きな三角の面がならんで見えないように）。外側の帯は高画質だけ細かく（スマホの標準・省電力では三角形を節約）
  const clump = (x: number, z: number, s: number, detail: number) => {
    c.bf.add(new THREE.IcosahedronGeometry(s, detail), c.m.canopy, M(x, s * 0.55 + 2 + rng() * 2, z, 0, rng() * 3, 0, 1, 0.75, 1), { tint: new THREE.Color().setHSL(0.28 + rng() * 0.05, 0.4, 0.16 + rng() * 0.07) })
    if (rng() < 0.35) c.bf.add(new THREE.CylinderGeometry(0.3, 0.5, 4, 5, 1, true), c.m.bark, M(x, 2, z), { tint: '#6a5a48' })
  }
  const inScar = (x: number, z: number) => x > SCAR_RECT.x0 && x < SCAR_RECT.x1 && z > SCAR_RECT.z0 && z < SCAR_RECT.z1
  const inWater = (x: number, z: number) => (x > K.BARAY.x0 - 3 && x < K.BARAY.x1 + 3 && z > K.BARAY.z0 - 3 && z < K.BARAY.z1 + 3) || (x > K.CANAL.x0 - 3 && x < K.CANAL.x1 + 3 && z > K.CANAL.z0)
  const ring = (inner: Rect, depth: number, step: number, detail: number) => {
    for (let x = inner.x0 - depth; x <= inner.x1 + depth; x += step)
      for (let z = inner.z0 - depth; z <= inner.z1 + depth; z += step) {
        const inside = x > inner.x0 && x < inner.x1 && z > inner.z0 && z < inner.z1
        if (inside) continue
        const px = x + (rng() - 0.5) * step
        const pz = z + (rng() - 0.5) * step
        if (inScar(px, pz) || inWater(px, pz)) continue
        clump(px, pz, step * (0.55 + rng() * 0.35), detail)
      }
  }
  // 歩ける範囲のすぐ外（池の北・村の西・寺の東・水田の南）
  ring({ x0: K.BOUNDS.x0 - 4, x1: K.BOUNDS.x1 + 4, z0: K.BARAY.z0 - 4, z1: K.PADDY.z1 + 6 }, 26, 8.5, 1)
  ring({ x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z1 }, 60, 14, c.q.level === 'high' ? 1 : 0)
  // 池の北の岸のヤシ
  for (let x = -86; x < 50; x += 7) if (!inScar(x, K.BARAY.z0 - 3)) palm(c, x + rng() * 3, K.BARAY.z0 - 2.5 - rng() * 3, 8 + rng() * 4, rng() < 0.5 ? 'sugar' : 'coco', 0, true, false)
  // 遠くの山（北：平らな台地の山。南西：てっぺんに寺のある丘）
  c.bf.add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.m.canopy, M(-80, -8, -620, 0, 0, 0, 520, 70, 120), { tint: '#4a6a72' })
  c.bf.add(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.m.canopy, M(260, -6, -560, 0, 0, 0, 300, 50, 100), { tint: '#56747a' })
  c.bf.add(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.m.canopy, M(-330, -4, 300, 0, 0, 0, 90, 46, 80), { tint: '#4e6e5a' })
  // 丘の上の寺（遠くの小さな塔）
  for (let k = 0; k < 5; k++) {
    const x = -330 + (k - 2) * 7
    c.bf.add(new THREE.ConeGeometry(2.2, 9 + (k === 2 ? 5 : 0), 6), c.m.sandstone, M(x, 44 + (k === 2 ? 2.5 : 0), 300), { tint: KC.sandGrey })
  }
  // 遠くのもう一つの寺の塔（東）
  for (let k = 0; k < 3; k++) c.bf.add(new THREE.ConeGeometry(3, 16 + k * 2, 6), c.m.sandstone, M(300 + k * 10, 8, 150 - k * 6), { tint: '#a89c88' })
  // 食べられた森のあと
  return buildScar(c)
}

/** オルムに「食べられた」森のあと：弧の形にえぐれた地面（黒い）・切り株・黒い霧 */
function buildScar(c: KCtx): { mist: Drift } {
  const S = K.SCAR
  const R = SCAR_RECT
  const nx = 66
  const nz = 32
  const g = new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0, nx, nz)
  g.rotateX(-Math.PI / 2)
  g.translate((R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2)
  const p = g.attributes.position as THREE.BufferAttribute
  const col = new Float32Array(p.count * 3)
  const grass = new THREE.Color('#5f8a3e')
  const black = new THREE.Color('#151018')
  const edge = new THREE.Color('#4a3a3a')
  const cc = new THREE.Color()
  const bandAt = (x: number, z: number) => {
    const dx = x - S.cx
    const dz = z - S.cz
    const r = Math.hypot(dx, dz)
    const a = Math.atan2(dz, dx)
    const along = a >= S.a0 && a <= S.a1 ? 1 : Math.max(0, 1 - Math.min(Math.abs(a - S.a0), Math.abs(a - S.a1)) * 6)
    const across = 1 - Math.min(1, Math.abs(r - S.r) / (S.width / 2))
    return Math.max(0, across) * along
  }
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const k = bandAt(x, z)
    const dig = Math.pow(Math.min(1, k * 1.6), 0.7)
    p.setY(i, -S.depth * dig)
    cc.copy(grass).lerp(edge, Math.min(1, k * 3)).lerp(black, Math.min(1, Math.max(0, k * 1.8 - 0.3)))
    col.set([cc.r, cc.g, cc.b], i * 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.computeVertexNormals()
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98 }))
  mesh.receiveShadow = true
  mesh.name = 'khmer_scar'
  c.root.add(mesh)
  // ふちの切り株と、半分かじられた木
  const rng = c.rng
  for (let k = 0; k < 120; k++) {
    const a = S.a0 + rng() * (S.a1 - S.a0)
    const side = rng() < 0.5 ? -1 : 1
    const r = S.r + side * (S.width * 0.5 + rng() * 3)
    const x = S.cx + Math.cos(a) * r
    const z = S.cz + Math.sin(a) * r
    const h = 0.6 + rng() * 1.6
    c.bf.add(new THREE.CylinderGeometry(0.35, 0.45, h, 6), c.m.bark, M(x, h / 2 - 0.3, z), { tint: '#4a3e36' })
    if (rng() < 0.6) {
      // 切り口が平らな、かじられた葉のかたまり
      c.bf.add(new THREE.SphereGeometry(3 + rng() * 2, 8, 5, 0, Math.PI), c.m.canopy, M(x, 5.5, z, 0, a + (side > 0 ? 0 : Math.PI), 0, 1, 0.7, 1), { tint: '#3a5a30' })
    }
  }
  // えぐれた所の中の、折れた幹
  for (let k = 0; k < 18; k++) {
    const a = S.a0 + rng() * (S.a1 - S.a0)
    const r = S.r + (rng() - 0.5) * S.width * 0.6
    const x = S.cx + Math.cos(a) * r
    const z = S.cz + Math.sin(a) * r
    c.bf.add(new THREE.CylinderGeometry(0.25, 0.3, 4 + rng() * 4, 5), c.m.bark, M(x, -S.depth + 0.4, z, Math.PI / 2, rng() * 3, 0.2), { tint: '#2a2220' })
  }
  // 黒い霧
  const base: THREE.Vector3[] = []
  for (let k = 0; k < 220; k++) {
    const a = S.a0 + rng() * (S.a1 - S.a0)
    const r = S.r + (rng() - 0.5) * S.width * 0.9
    base.push(v(S.cx + Math.cos(a) * r, -S.depth + rng() * 2, S.cz + Math.sin(a) * r))
  }
  const mist = new Drift(base, { size: 15, rise: 14, color: '#120e18', opacity: 0.68, speed: 0.035, seed: 66 })
  mist.points.name = 'khmer_scar_mist'
  return { mist }
}

export { SPAWNS }
