// 1970年 万国博覧会（架空の会場）の組み立て。配置は layout.ts、道具は kit1970.ts。
// 実在のパビリオン・芸術作品の名前や形は使わない（docs/中盤シナリオとワールド構成_v1.md §6）。
// 静的な物は Batch で結合し、壊れる壁・吊り展示・帽子など動く物だけを個別のメッシュにする。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import { mulberry32 } from '../../render/noise'
import type { QualitySettings } from '../../render/quality'
import { ColliderList, type BoxCollider } from '../../world/colliders'
import { buildWater } from '../../world/edo/water'
import type { ClawTargetDef } from '../../player/clawLogic'
import type { MovableInput } from '../../player/clawSystem'
import { createNambaMaterials } from '../namba2026/materials'
import { PARTS, SHARDS, X, towerHooks, type Rect } from './layout'
import {
  EXPO,
  bamboo,
  bench,
  box,
  buildFlags,
  boxAB,
  cellsWithHoles,
  collideCylinder,
  cyl,
  expoLamp,
  farDome,
  flagPole,
  floorWithHoles,
  latticeTower,
  pondEdge,
  ringFloor,
  ringRail,
  roundTree,
  stoneLantern,
  strut,
  type ECtx,
} from './kit1970'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** はじくで壊れる壁（見た目と当たり判定。壊れたら隠して当たり判定を外す） */
export type CrackedWall = { id: string; group: THREE.Group; colliders: BoxCollider[]; pos: THREE.Vector3; radius: number }

export const CLAW_IDS = {
  ropeHook: 'expo_rope_hook',
  ropeHook2: 'expo_rope_hook2',
  ropeSwing: 'expo_rope_swing',
  capsuleHook: 'expo_capsule_hook',
  lantern: 'expo_island_lantern',
  lanternShore: 'expo_shore_lantern',
  hat: 'expo_staff_hat',
  knot: 'expo_anchor_knot',
  tower: (i: number) => `expo_tower_hook_${i}`,
} as const

export type ExpoScene = {
  root: THREE.Group
  colliders: ColliderList
  lights: ExpoLight[]
  claw: { targets: ClawTargetDef[]; movables: MovableInput[] }
  towerHooks: ClawTargetDef[]
  knot: ClawTargetDef
  hat: MovableInput
  walls: { tower: CrackedWall; store: CrackedWall }
  /** 作業台の試作の腕（組み上げたら消す） */
  protoArm: THREE.Group
  update(dt: number, t: number): void
}

type ExpoLight = { pos: THREE.Vector3; color: string; intensity: number; dist: number }

/** 看板（キャンバスに文字を描いた板。両面ではない） */
function textSign(text: string, w: number, h: number, o: { bg: string; fg: string; sub?: string; font?: string } = { bg: EXPO.white, fg: EXPO.navy }): THREE.Mesh {
  const W = 512
  const H = Math.round((W * h) / w)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = o.bg
  g.fillRect(0, 0, W, H)
  g.fillStyle = o.fg
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  const fs = Math.min(H * (o.sub ? 0.46 : 0.62), (W * 0.86) / Math.max(1, text.length))
  g.font = o.font ?? `800 ${fs}px "M PLUS Rounded 1c", "Hiragino Sans", sans-serif`
  g.fillText(text, W / 2, o.sub ? H * 0.4 : H / 2)
  if (o.sub) {
    g.font = `700 ${H * 0.2}px "M PLUS Rounded 1c", "Hiragino Sans", sans-serif`
    g.fillText(o.sub, W / 2, H * 0.8)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))
  mesh.castShadow = false
  return mesh
}

/** ひびの入った壁のテクスチャ（コンクリートに光るひび。上下に工事の黄と黒の帯） */
function crackedTexture(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const S = 512
  const [c, g] = canvas(S)
  const [e, ge] = canvas(S)
  g.fillStyle = '#d2cbbd'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,36,30'},${0.04 + Math.random() * 0.07})`
    g.fillRect(Math.random() * S, Math.random() * S, 3, 3)
  }
  ge.fillStyle = '#000'
  ge.fillRect(0, 0, S, S)
  // 上下の帯
  for (const y0 of [0, S - 44]) {
    for (let x = -60; x < S + 60; x += 44) {
      g.fillStyle = '#f2c230'
      g.beginPath()
      g.moveTo(x, y0)
      g.lineTo(x + 22, y0)
      g.lineTo(x + 44, y0 + 44)
      g.lineTo(x + 22, y0 + 44)
      g.fill()
      g.fillStyle = '#222'
      g.beginPath()
      g.moveTo(x + 22, y0)
      g.lineTo(x + 44, y0)
      g.lineTo(x + 66, y0 + 44)
      g.lineTo(x + 44, y0 + 44)
      g.fill()
    }
  }
  // ひび：中央から放射状に広がる太い割れ目（色の絵には黒い溝、光の絵にはオレンジの光）
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const paths: Array<Array<[number, number]>> = []
  for (let k = 0; k < 14; k++) {
    let x = S / 2 + (rnd() - 0.5) * 60
    let y = S / 2 + (rnd() - 0.5) * 60
    let a = (k / 14) * Math.PI * 2 + rnd() * 0.4
    const pts: Array<[number, number]> = [[x, y]]
    for (let n = 0; n < 9; n++) {
      a += (rnd() - 0.5) * 0.9
      x += Math.cos(a) * (14 + rnd() * 22)
      y += Math.sin(a) * (14 + rnd() * 22)
      pts.push([x, y])
    }
    paths.push(pts)
  }
  const stroke = (ctx: CanvasRenderingContext2D, color: string, w: number) => {
    ctx.strokeStyle = color
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    for (const pts of paths) {
      ctx.beginPath()
      ctx.moveTo(pts[0][0], pts[0][1])
      for (const [x, y] of pts) ctx.lineTo(x, y)
      ctx.stroke()
    }
  }
  stroke(g, '#2a2420', 9)
  stroke(ge, '#ff7a20', 12)
  stroke(ge, '#ffe0a0', 4)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  const glow = new THREE.CanvasTexture(e)
  glow.colorSpace = THREE.SRGBColorSpace
  return { map, glow }
}

function canvas(S: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = S
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

export async function buildExpoScene(q: QualitySettings, aniso: number, progress: (p: number, msg: string) => void, yieldFrame: () => Promise<void>): Promise<ExpoScene> {
  const m = await createNambaMaterials(aniso)
  // 池は少し青い（空を映す庭の池）
  const baseCompile = m.water.onBeforeCompile
  m.water.onBeforeCompile = (shader, r) => {
    baseCompile.call(m.water, shader, r)
    ;(shader.uniforms.uShallow.value as THREE.Color).set('#3c8a8a')
    ;(shader.uniforms.uDeep.value as THREE.Color).set('#123c4a')
  }
  m.water.envMapIntensity = 0.5
  m.water.customProgramCacheKey = () => 'expo-water'
  const root = new THREE.Group()
  root.name = 'expo1970'
  const c: ECtx = { b: new Batch(), bf: new Batch(), m, col: new ColliderList(), lights: [], root, updaters: [], rng: mulberry32(1970), q, flags: [] }
  const targets: ClawTargetDef[] = []
  const movables: MovableInput[] = []

  progress(0.3, '会場の地面を敷いています…')
  await yieldFrame()
  buildGround(c)
  progress(0.38, '大屋根を組み立て中…')
  await yieldFrame()
  buildPlaza(c, targets)
  progress(0.46, '電気の館を組み立て中…')
  await yieldFrame()
  const protoArm = buildPavilion(c)
  const store = buildStore(c)
  progress(0.52, 'ロープウェイを組み立て中…')
  await yieldFrame()
  const hat = buildRopeway(c, targets, movables)
  progress(0.58, '日本庭園と竹林を組み立て中…')
  await yieldFrame()
  buildGarden(c, targets)
  buildSwarmArea(c)
  progress(0.64, '未来の塔を組み立て中…')
  await yieldFrame()
  const tower = buildTower(c, targets)
  buildFar(c)
  buildFlags(c)
  root.add(c.b.build('expo_static'))
  const far = c.bf.build('expo_far')
  far.traverse((o) => (o.castShadow = false))
  root.add(far)
  return {
    root,
    colliders: c.col,
    lights: c.lights,
    claw: { targets, movables },
    towerHooks: tower.hooks,
    knot: tower.knot,
    hat,
    walls: { tower: tower.wall, store },
    protoArm,
    update(dt: number, t: number) {
      for (const u of c.updaters) u(dt, t)
    },
  }
}

// ------------------------------------------------------------------ 地面

function buildGround(c: ECtx): void {
  const B = X.BOUNDS
  const holes = [X.POND_W, X.POND_G]
  floorWithHoles(c, B, holes, 0)
  // 芝生（全体）
  for (const r of cellsWithHoles(B, holes)) boxAB(c, r.x0, r.x1, -0.3, 0, r.z0, r.z1, c.m.fabric, { tint: EXPO.lawn, texM: 6, cast: false })
  // 遠くまで続く芝生（影なし）
  const far = new THREE.PlaneGeometry(420, 420)
  far.rotateX(-Math.PI / 2)
  c.bf.add(far, c.m.fabric, M(0, -0.04, -10), { tint: '#7f9e52', texM: 8 })
  // 舗装（広場・大通り・小道）。床より少しだけ上
  const pave = (r: Rect, tint: string, texM = 3) => boxAB(c, r.x0, r.x1, 0, 0.02, r.z0, r.z1, c.m.paving, { tint, texM, cast: false })
  pave(X.PLAZA, '#ede4d2')
  pave({ x0: -5.5, x1: 5.5, z0: -46, z1: -22 }, EXPO.path)
  pave({ x0: 26, x1: 46, z0: -9, z1: 12 }, EXPO.path)
  pave({ x0: -46, x1: -26, z0: -8, z1: 10 }, EXPO.path)
  pave({ x0: -30, x1: -22, z0: 22, z1: 30 }, '#e6dcc6')
  pave({ x0: 14, x1: 22, z0: -40, z1: -22 }, EXPO.path)
  pave({ x0: X.SWARM_AREA.x0, x1: X.SWARM_AREA.x1, z0: X.SWARM_AREA.z0, z1: X.SWARM_AREA.z1 }, '#c9bfae', 2)
  pave({ x0: -70, x1: -57, z0: -8, z1: 8 }, EXPO.path)
  // 塔の前の広場（円）
  const disc = new THREE.CircleGeometry(X.FENCE_R + 2, 48)
  disc.rotateX(-Math.PI / 2)
  c.b.add(disc, c.m.paving, M(X.TOWER.x, 0.025, X.TOWER.z), { tint: '#e8e0d0', texM: 3, cast: false })
  // 池
  for (const r of [X.POND_W, X.POND_G]) {
    pondEdge(c, r)
    const water = buildWater([{ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y: -0.35, cell: 1.2, flow: () => [0.04, 0.02], foam: () => 0 }], c.m.water)
    water.receiveShadow = true
    c.root.add(water)
  }
  // 見えない壁（会場の外へ出ない）と、外周の植え込み
  c.col.wall(B.x0, B.z0, B.x1, B.z0, -1, 6)
  c.col.wall(B.x1, B.z0, B.x1, B.z1, -1, 6)
  c.col.wall(B.x1, B.z1, B.x0, B.z1, -1, 6)
  c.col.wall(B.x0, B.z1, B.x0, B.z0, -1, 6)
  const hedge = (x0: number, x1: number, z0: number, z1: number) => boxAB(c, x0, x1, 0, 1.1, z0, z1, c.m.fabric, { tint: '#4e7a34', texM: 2, r: 0.3 })
  hedge(B.x0, B.x1, B.z0 - 1.2, B.z0)
  hedge(B.x0, B.x1, B.z1, B.z1 + 1.2)
  hedge(B.x0 - 1.2, B.x0, B.z0, B.z1)
  hedge(B.x1, B.x1 + 1.2, B.z0, B.z1)
}

// ------------------------------------------------------------------ 中央広場・大屋根

function buildPlaza(c: ECtx, targets: ClawTargetDef[]): void {
  const R = X.ROOF
  const steel = c.m.metal
  // 柱
  for (const [x, z] of X.COLUMNS) {
    cyl(c, x, 0, R.y0, z, 1.15, c.m.concrete, { tint: EXPO.white, r1: 0.95, seg: 20, collide: true })
    cyl(c, x, R.y0 - 1.4, R.y0, z, 0.95, c.m.concrete, { tint: EXPO.white, r1: 2.0, seg: 20 })
    cyl(c, x, 0, 0.5, z, 1.6, c.m.concrete, { tint: '#e2ddd2', seg: 20 })
  }
  // 立体トラス：下弦は step ごとの格子、上弦は半分ずらした格子。その間を斜めの材でつなぐ
  const s = R.step
  const nx = Math.round((R.x1 - R.x0) / s)
  const nz = Math.round((R.z1 - R.z0) / s)
  const lo = (i: number, j: number) => v(R.x0 + i * s, R.y0, R.z0 + j * s)
  const hi = (i: number, j: number) => v(R.x0 + (i + 0.5) * s, R.y1, R.z0 + (j + 0.5) * s)
  for (let i = 0; i <= nx; i++) strut(c, lo(i, 0), lo(i, nz), 0.09, steel, EXPO.silver)
  for (let j = 0; j <= nz; j++) strut(c, lo(0, j), lo(nx, j), 0.09, steel, EXPO.silver)
  for (let i = 0; i < nx; i++) strut(c, hi(i, 0), hi(i, nz - 1), 0.08, steel, EXPO.silver)
  for (let j = 0; j < nz; j++) strut(c, hi(0, j), hi(nx - 1, j), 0.08, steel, EXPO.silver)
  const node = new THREE.IcosahedronGeometry(0.2, 0)
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const h = hi(i, j)
      for (const [a, b] of [
        [i, j],
        [i + 1, j],
        [i, j + 1],
        [i + 1, j + 1],
      ])
        strut(c, h, lo(a, b), 0.05, steel, EXPO.steel)
      c.b.add(node, steel, M(h.x, h.y, h.z), { tint: EXPO.silver, cast: false })
    }
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) c.b.add(node, steel, M(lo(i, j).x, R.y0, lo(i, j).z), { tint: EXPO.silver, cast: false })
  // 屋根の膜（半透明）
  const film = new THREE.PlaneGeometry(R.x1 - R.x0 + 1, R.z1 - R.z0 + 1)
  film.rotateX(-Math.PI / 2)
  const filmMesh = new THREE.Mesh(film, c.m.glassFrost)
  filmMesh.position.set((R.x0 + R.x1) / 2, R.y1 + 0.12, (R.z0 + R.z1) / 2)
  filmMesh.renderOrder = 2
  c.root.add(filmMesh)

  // 吊り展示：空飛ぶ円盤の形のカプセル（上に乗れる）
  const C = X.CAPSULE
  const top = C.top
  cyl(c, C.x, top - 0.6, top, C.z, C.r, c.m.plastic, { tint: EXPO.white, seg: 32 })
  c.b.add(new THREE.SphereGeometry(C.r, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), c.m.plastic, M(C.x, top - 0.6, C.z, 0, 0, 0, 1, 0.42, 1), { tint: EXPO.white })
  c.b.add(new THREE.TorusGeometry(C.r, 0.09, 8, 48), c.m.paint, M(C.x, top - 0.3, C.z, Math.PI / 2, 0, 0), { tint: EXPO.orange })
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    c.b.add(new THREE.SphereGeometry(0.12, 10, 8), c.m.lightWarm, M(C.x + Math.cos(a) * (C.r - 0.25), top - 0.95, C.z + Math.sin(a) * (C.r - 0.25)), { cast: false })
  }
  ringRail(c, C.x, C.z, C.r - 0.12, top, 0.9, c.m.metal, EXPO.silver, 16, Math.PI / 2 - 0.42, Math.PI / 2 + 0.42)
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    strut(c, v(C.x + dx * C.r * 0.6, top + 0.9, C.z + dz * C.r * 0.6), v(C.x + dx * 1.5, R.y0, C.z + dz * 1.5), 0.025, c.m.metal, EXPO.steel)
  collideCylinder(c, C.x, top - 0.6, top, C.z, C.r)
  targets.push({
    id: CLAW_IDS.capsuleHook,
    type: 'pull_player',
    label: '展示カプセルのふち',
    point: v(C.x, top - 0.55, C.z + C.r + 0.3),
    radius: 0.3,
    enabled: true,
    facing: v(0, -1, 0.3).normalize(),
    landing: v(C.x, top, C.z + C.r - 1.1),
    via: v(C.x, top + 1.5, C.z + C.r + 0.4),
  })

  // 広場の街灯・旗・ベンチ・木
  for (const [x, z] of [
    [-20, 18],
    [20, 18],
    [-20, -18],
    [20, -18],
    [-24, 0],
    [24, 0],
    [-8, -20],
    [8, -20],
  ])
    expoLamp(c, x, z)
  const flagColors = [EXPO.red, EXPO.orange, EXPO.yellow, EXPO.sky, EXPO.teal, EXPO.white, '#8a4ac8', '#2a7ad8']
  for (let i = 0; i < 9; i++) {
    flagPole(c, -16 + i * 4, 23, flagColors[i % flagColors.length])
    flagPole(c, -5.5 - (i % 2) * 0.01, -24 - i * 2.6, flagColors[(i + 3) % flagColors.length], 7)
    flagPole(c, 5.5, -24 - i * 2.6, flagColors[(i + 5) % flagColors.length], 7)
  }
  for (const [x, z, r] of [
    [-18, 12, 0],
    [18, 12, 0],
    [-18, -12, Math.PI],
    [18, -12, Math.PI],
    [-6, 20, 0],
    [6, 20, 0],
  ])
    bench(c, x, z, r)
  for (const [x, z] of [
    [-30, 18],
    [30, 18],
    [-30, -18],
    [30, -18],
    [-32, 6],
    [32, 14],
    [12, 30],
    [-4, 32],
    [22, 30],
  ])
    roundTree(c, x, z, 0.9 + c.rng() * 0.3)
  // 最初の欠け：ふしぎな家電の展示台
  const F = X.FIRST_FIGHT
  cyl(c, F.x, 0, 0.28, F.z, 3.2, c.m.plastic, { tint: EXPO.white, seg: 32 })
  collideCylinder(c, F.x, -0.5, 0.28, F.z, 3.2)
  box(c, F.x - 1.2, 0.88, F.z - 0.6, 1.0, 1.2, 0.7, c.m.plastic, { tint: EXPO.cream, r: 0.12 })
  box(c, F.x - 1.2, 1.1, F.z - 0.24, 0.8, 0.6, 0.02, c.m.paint, { tint: '#28323a' })
  cyl(c, F.x + 1.1, 0.28, 1.4, F.z - 0.4, 0.42, c.m.plastic, { tint: EXPO.sky, seg: 20 })
  cyl(c, F.x + 0.2, 0.28, 0.45, F.z + 1.1, 0.5, c.m.plastic, { tint: EXPO.orange, seg: 20 })
  const sign = textSign('くらしの未来', 3, 0.7, { bg: EXPO.orange, fg: '#fff', sub: 'ふしぎな家電の展示' })
  sign.position.set(F.x, 2.1, F.z + 2.2)
  c.root.add(sign)
  cyl(c, F.x - 1.3, 0.28, 1.9, F.z + 2.2, 0.04, c.m.metal, { tint: EXPO.silver })
  cyl(c, F.x + 1.3, 0.28, 1.9, F.z + 2.2, 0.04, c.m.metal, { tint: EXPO.silver })
  // 噴水（到着地点の東）
  const fx = 11
  const fz = 13
  cyl(c, fx, 0, 0.5, fz, 2.6, c.m.concrete, { tint: '#e6e0d4', seg: 28 })
  c.col.box(fx, 0.25, fz, 4.6, 0.5, 4.6)
  c.col.box(fx, 0.25, fz, 4.6, 0.5, 4.6, Math.PI / 4)
  const pool = new THREE.CircleGeometry(2.35, 28)
  pool.rotateX(-Math.PI / 2)
  c.b.add(pool, c.m.plastic, M(fx, 0.46, fz), { tint: '#4ab0d8', cast: false })
  const jets: THREE.Mesh[] = []
  const jetMat = new THREE.MeshStandardMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false })
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    const j = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 1, 8, 1, true), jetMat)
    j.position.set(fx + Math.cos(a) * 1.2, 0.5, fz + Math.sin(a) * 1.2)
    jets.push(j)
    c.root.add(j)
  }
  const center = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 1, 8, 1, true), jetMat)
  center.position.set(fx, 0.5, fz)
  jets.push(center)
  c.root.add(center)
  c.updaters.push((_dt, t) => {
    jets.forEach((j, i) => {
      const h = i === jets.length - 1 ? 2.6 + Math.sin(t * 1.7) * 0.5 : 1.1 + Math.sin(t * 2.2 + i) * 0.35
      j.scale.y = h
      j.position.y = 0.5 + h / 2
    })
  })
  // 大通りの入口の看板
  const tw = textSign('未来の塔', 3.2, 0.9, { bg: EXPO.navy, fg: '#fff', sub: 'THE TOWER OF TOMORROW' })
  tw.position.set(0, 4.2, -22.4)
  c.root.add(tw)
  box(c, -1.7, 2.3, -22.45, 0.12, 4.6, 0.12, c.m.metal, { tint: EXPO.silver, collide: true })
  box(c, 1.7, 2.3, -22.45, 0.12, 4.6, 0.12, c.m.metal, { tint: EXPO.silver, collide: true })
}

// ------------------------------------------------------------------ 電気の館（東）

function buildPavilion(c: ECtx): THREE.Group {
  const P = X.PAVILION
  // 白い胴とオレンジの帯、銀の丸屋根、上の輪のアンテナ
  cyl(c, P.x, 0, P.h, P.z, P.r, c.m.paint, { tint: EXPO.white, seg: 40, collide: true })
  cyl(c, P.x, 2.6, 3.6, P.z, P.r + 0.06, c.m.paint, { tint: EXPO.orange, seg: 40 })
  cyl(c, P.x, 6.0, 6.5, P.z, P.r + 0.06, c.m.paint, { tint: EXPO.sky, seg: 40 })
  c.b.add(new THREE.SphereGeometry(P.r * 0.98, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), c.m.metal, M(P.x, P.h, P.z, 0, 0, 0, 1, 0.38, 1), { tint: EXPO.silver })
  for (let k = 0; k < 3; k++) {
    const y = P.h + 4.2 + k * 1.6
    c.b.add(new THREE.TorusGeometry(2.6 - k * 0.6, 0.14, 8, 40), c.m.paint, M(P.x, y, P.z, Math.PI / 2, 0, 0), { tint: [EXPO.red, EXPO.yellow, EXPO.teal][k] })
  }
  cyl(c, P.x, P.h + 3.2, P.h + 9, P.z, 0.12, c.m.metal, { tint: EXPO.silver })
  c.b.add(new THREE.SphereGeometry(0.4, 16, 10), c.m.lightWarm, M(P.x, P.h + 9.3, P.z), { cast: false })
  // 胴の丸窓
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2
    if (Math.abs(Math.cos(a) + 1) < 0.3) continue
    c.b.add(new THREE.CircleGeometry(0.55, 20), c.m.lightCool, M(P.x + Math.cos(a) * (P.r + 0.03), 4.8, P.z + Math.sin(a) * (P.r + 0.03), 0, -a + Math.PI / 2, 0), { tint: '#cfeaff', cast: false })
  }
  // 入口（西）とひさし
  const ex = P.x - P.r
  boxAB(c, ex - 1.8, ex + 0.6, 0, 4.4, -3.2, 3.2, c.m.paint, { tint: EXPO.white, collide: true })
  boxAB(c, ex - 1.85, ex - 1.8, 0.2, 3.6, -2.4, 2.4, c.m.glass, { tint: '#9fc8e0' })
  boxAB(c, ex - 1.9, ex - 1.8, 3.7, 4.3, -3.2, 3.2, c.m.paint, { tint: EXPO.orange })
  const sign = textSign('電気の館', 4.4, 0.95, { bg: EXPO.white, fg: EXPO.orange, sub: 'ELECTRIC PAVILION' })
  sign.position.set(ex - 1.92, 5.2, 0)
  sign.rotation.y = -Math.PI / 2
  c.root.add(sign)
  // ミチの作業台のひさし
  boxAB(c, 32, 42.6, 3.55, 3.75, 1.5, 10.5, c.m.paint, { tint: EXPO.yellow })
  for (const [x, z] of [
    [32.3, 1.8],
    [32.3, 10.2],
    [42.2, 10.2],
  ])
    cyl(c, x, 0, 3.55, z, 0.07, c.m.metal, { tint: EXPO.silver, collide: true })
  // 作業台・工具・ラジオ
  const W = X.WORKBENCH
  boxAB(c, W.x - 1.3, W.x + 1.3, 0.86, 0.94, W.z - 0.2, W.z + 0.8, c.m.woodPlain, { tint: '#b98a58' })
  for (const [dx, dz] of [
    [-1.2, -0.1],
    [1.2, -0.1],
    [-1.2, 0.7],
    [1.2, 0.7],
  ])
    boxAB(c, W.x + dx - 0.04, W.x + dx + 0.04, 0, 0.86, W.z + dz - 0.04, W.z + dz + 0.04, c.m.metal, { tint: '#5a5e66' })
  c.col.box(W.x, 0.45, W.z + 0.3, 2.6, 0.9, 1.0)
  box(c, W.x + 0.9, 1.08, W.z + 0.5, 0.42, 0.28, 0.2, c.m.plastic, { tint: '#c84a2a', r: 0.04 })
  cyl(c, W.x + 0.9, 1.22, 1.5, W.z + 0.5, 0.008, c.m.metal, { tint: EXPO.silver })
  box(c, W.x - 0.8, 0.98, W.z + 0.3, 0.5, 0.06, 0.3, c.m.metal, { tint: '#8a8e96' })
  box(c, W.x - 0.4, 1.0, W.z + 0.55, 0.06, 0.06, 0.32, c.m.paint, { tint: EXPO.red })
  // 道具の棚
  boxAB(c, 40.6, 42.2, 0, 2.0, 7.6, 8.4, c.m.woodPlain, { tint: '#a87a4a', collide: true })
  for (let k = 0; k < 4; k++) box(c, 41.4, 0.5 + k * 0.45, 7.6, 1.4, 0.04, 0.02, c.m.paint, { tint: [EXPO.orange, EXPO.sky, EXPO.yellow, EXPO.teal][k] })
  // 試作の腕（作業台の上。組み上げたら消える）
  const arm = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#c9ced4', roughness: 0.35, metalness: 0.7 })
  const acc = new THREE.MeshStandardMaterial({ color: '#2f8ad8', roughness: 0.4, metalness: 0.2, emissive: new THREE.Color('#1a6ad8'), emissiveIntensity: 0.4 })
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.62, 14), mat)
  tube.rotation.z = Math.PI / 2
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 6, 20), acc)
  ring.rotation.y = Math.PI / 2
  ring.position.x = 0.2
  arm.add(tube, ring)
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mat)
    f.position.set(0.4, s * 0.08, 0)
    f.rotation.z = s * 0.3
    arm.add(f)
  }
  arm.position.set(W.x - 0.1, 1.08, W.z + 0.3)
  arm.rotation.y = 0.4
  arm.traverse((o) => ((o as THREE.Mesh).castShadow = true))
  c.root.add(arm)
  // 館の前の列（ロープの柵）
  for (let k = 0; k < 6; k++) cyl(c, 40, 0, 0.9, -6 - k * 1.4, 0.05, c.m.metal, { tint: EXPO.silver })
  // 動く歩道（屋根付き）
  const Wk = X.WALKWAY
  boxAB(c, Wk.x0, Wk.x1, 0, 0.18, Wk.z - 1.0, Wk.z + 1.0, c.m.rubber, { tint: '#3a3e44' })
  boxAB(c, Wk.x0, Wk.x1, 0, 0.9, Wk.z - 1.15, Wk.z - 1.0, c.m.paint, { tint: EXPO.white })
  boxAB(c, Wk.x0, Wk.x1, 0, 0.9, Wk.z + 1.0, Wk.z + 1.15, c.m.paint, { tint: EXPO.white })
  const hood = new THREE.CylinderGeometry(1.6, 1.6, Wk.x1 - Wk.x0, 24, 1, true, 0, Math.PI)
  hood.rotateZ(Math.PI / 2)
  hood.rotateX(Math.PI / 2)
  c.b.add(hood, c.m.glassFrost, M((Wk.x0 + Wk.x1) / 2, 1.2, Wk.z), { cast: false })
  for (let x = Wk.x0; x <= Wk.x1; x += 3) {
    const arc = new THREE.TorusGeometry(1.6, 0.05, 6, 20, Math.PI)
    arc.rotateY(Math.PI / 2)
    c.b.add(arc, c.m.paint, M(x, 1.2, Wk.z), { tint: EXPO.orange })
  }
  c.col.box((Wk.x0 + Wk.x1) / 2, 0.45, Wk.z - 1.08, Wk.x1 - Wk.x0, 0.9, 0.15)
  c.col.box((Wk.x0 + Wk.x1) / 2, 0.45, Wk.z + 1.08, Wk.x1 - Wk.x0, 0.9, 0.15)
  for (const [x, z] of [
    [30, 12],
    [44, 14],
    [44, -14],
    [30, -14],
  ])
    expoLamp(c, x, z)
  return arm
}

/** 館の裏の倉庫（西の壁がひび割れている。奥に時のかけら） */
function buildStore(c: ECtx): CrackedWall {
  const S = X.STORE
  const t = 0.3
  boxAB(c, S.x0, S.x1, 0, 3.4, S.z1 - t, S.z1, c.m.concrete, { tint: '#d8d0c2', texM: 2, collide: true })
  boxAB(c, S.x0, S.x1, 0, 3.4, S.z0, S.z0 + t, c.m.concrete, { tint: '#d8d0c2', texM: 2, collide: true })
  boxAB(c, S.x1 - t, S.x1, 0, 3.4, S.z0, S.z1, c.m.concrete, { tint: '#d8d0c2', texM: 2, collide: true })
  boxAB(c, S.x0 - 0.2, S.x1 + 0.2, 3.4, 3.65, S.z0 - 0.2, S.z1 + 0.2, c.m.paint, { tint: '#8a8e96', collide: true })
  // 西の壁：ひびの入ったところ以外
  const W = X.STORE_WALL
  boxAB(c, S.x0, S.x0 + t, 0, 3.4, S.z0, W.z - 1.6, c.m.concrete, { tint: '#d8d0c2', texM: 2, collide: true })
  boxAB(c, S.x0, S.x0 + t, 0, 3.4, W.z + 1.6, S.z1, c.m.concrete, { tint: '#d8d0c2', texM: 2, collide: true })
  // 中の箱
  for (const [x, z, s] of [
    [55.5, 18.5, 1.0],
    [56.6, 15.2, 0.8],
    [50.6, 19.2, 0.7],
  ])
    box(c, x, s / 2, z, s, s, s, c.m.woodPlain, { tint: '#b08a5a', collide: true })
  const sign = textSign('関係者以外 立入禁止', 2.2, 0.4, { bg: EXPO.yellow, fg: '#222' })
  sign.position.set(S.x0 - 0.02, 2.9, W.z + 2.4)
  sign.rotation.y = -Math.PI / 2
  c.root.add(sign)
  return crackedWall(c, 'store_wall', W.clone(), 3.2, 2.8, Math.PI / 2)
}

/** ひびの入った壁（はじくで壊れる）。rotY=0 で板が XY 面（厚さは Z） */
function crackedWall(c: ECtx, id: string, pos: THREE.Vector3, w: number, h: number, rotY: number): CrackedWall {
  const tx = crackedTexture()
  const group = new THREE.Group()
  group.name = id
  const slab = new THREE.Mesh(
    rbox(w, h, 0.45, 0.04),
    new THREE.MeshStandardMaterial({ map: tx.map, emissiveMap: tx.glow, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 2.2, roughness: 0.85 }),
  )
  slab.castShadow = true
  slab.receiveShadow = true
  group.add(slab)
  group.position.copy(pos)
  group.rotation.y = rotY
  c.root.add(group)
  const sx = Math.abs(Math.cos(rotY)) * w + Math.abs(Math.sin(rotY)) * 0.45
  const sz = Math.abs(Math.sin(rotY)) * w + Math.abs(Math.cos(rotY)) * 0.45
  const col = c.col.box(pos.x, pos.y, pos.z, sx, h + 0.2, sz)
  // ひびの光がゆっくり脈打つ
  const mat = slab.material as THREE.MeshStandardMaterial
  c.updaters.push((_dt, t) => {
    mat.emissiveIntensity = 1.8 + Math.sin(t * 2.4 + pos.x) * 0.7
  })
  return { id, group, colliders: [col], pos: pos.clone(), radius: w / 2 }
}

// ------------------------------------------------------------------ 空中ロープウェイ（西）

function buildRopeway(c: ECtx, targets: ClawTargetDef[], movables: MovableInput[]): MovableInput {
  const R = X.ROPE
  const steel = c.m.metal
  latticeTower(c, R.t1.x, R.t1.z, 3.2, 17, steel, '#d84a2a', 2.6, 0.3)
  latticeTower(c, R.t2.x, R.t2.z, 3.2, 10.4, steel, '#d84a2a', 2.6, 0.1)
  // 乗り場（鉄塔 1：池に向かって張り出す。鉄塔 2：池の向こう）
  const plat = (r: { x0: number; x1: number; z0: number; z1: number }, y: number) => {
    const x0 = Math.min(r.x0, r.x1)
    const x1 = Math.max(r.x0, r.x1)
    boxAB(c, x0, x1, y - 0.35, y, r.z0, r.z1, c.m.metal, { tint: '#9aa0a8', texM: 1.5, collide: true })
    for (const z of [r.z0, r.z1]) {
      boxAB(c, x0, x1, y + 0.95, y + 1.0, z - 0.03, z + 0.03, c.m.paint, { tint: EXPO.yellow })
      for (let x = x0; x <= x1 + 0.01; x += 1.2) cyl(c, x, y, y + 1.0, z, 0.03, c.m.paint, { tint: EXPO.yellow })
      c.col.box((x0 + x1) / 2, y + 0.75, z, x1 - x0, 1.5, 0.12)
    }
  }
  plat(R.plat1, R.platY)
  plat(R.plat2, R.platY)
  // 乗り場の下の支え
  strut(c, v(R.plat1.x1, R.platY - 0.35, 0), v(R.t1.x - 1.5, 4.5, 0), 0.08, steel, '#d84a2a')
  strut(c, v(R.plat2.x0, R.platY - 0.35, 0), v(R.t2.x + 1.5, 4.5, 0), 0.08, steel, '#d84a2a')
  // 鉄塔 2 の機械室（屋根に乗れる）とマスト
  const Mm = R.machine
  boxAB(c, Mm.x0, Mm.x1, 10.4, Mm.y, Mm.z0, Mm.z1, c.m.paint, { tint: EXPO.cream, collide: true })
  boxAB(c, Mm.x0 - 0.1, Mm.x1 + 0.1, Mm.y - 0.1, Mm.y + 0.08, Mm.z0 - 0.1, Mm.z1 + 0.1, c.m.paint, { tint: '#d84a2a' })
  boxAB(c, Mm.x1 + 0.01, Mm.x1 + 0.03, 10.8, 12.0, -1.2, 1.2, c.m.glass, { tint: '#9fc8e0' })
  cyl(c, Mm.x0 + 0.35, Mm.y, 17, 0, 0.12, steel, { tint: '#d84a2a', collide: true })
  // ケーブル（2 本）・ゴンドラ・吊り輪
  for (const dz of [-0.9, 0.9]) {
    const a = v(R.t1.x, 17, dz)
    const b = v(Mm.x0 + 0.35, 17, dz)
    const mid = a.clone().lerp(b, 0.5)
    mid.y -= 0.6
    c.b.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.045, 5, false), steel, undefined, { tint: '#3a3e44', cast: false })
    const a2 = v(R.t1.x, 17, dz)
    const b2 = v(-26, 6, dz + 30)
    c.bf.add(new THREE.TubeGeometry(new THREE.LineCurve3(a2, b2), 1, 0.04, 4, false), steel, undefined, { tint: '#3a3e44' })
  }
  const A = R.anchor
  strut(c, v(A.x, 16.75, 0), v(A.x, A.y + 0.35, 0), 0.035, steel, '#3a3e44')
  c.b.add(new THREE.TorusGeometry(0.34, 0.06, 8, 24), c.m.paint, M(A.x, A.y, 0), { tint: EXPO.orange, cast: false })
  // ゴンドラ（飾り：鉄塔 1 の手前）
  const gondola = (x: number, y: number, color: string) => {
    strut(c, v(x, 16.8, 0), v(x, y + 1.3, 0), 0.03, steel, '#3a3e44')
    c.b.add(new THREE.SphereGeometry(1.0, 20, 14), c.m.plastic, M(x, y, 0, 0, 0, 0, 1.05, 0.9, 1.05), { tint: color })
    c.b.add(new THREE.SphereGeometry(0.94, 20, 10, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.25), c.m.glass, M(x, y, 0, 0, 0, 0, 1.08, 0.92, 1.08), { tint: '#9fc8e0', cast: false })
  }
  gondola(-44.6, 14.2, EXPO.sky)
  gondola(-70, 13.4, EXPO.orange)
  // 金具（乗り場の床の南のふちの下）と、機械室の屋根の金具
  const hookMesh = (p: THREE.Vector3) => {
    c.b.add(new THREE.TorusGeometry(0.2, 0.05, 8, 18), c.m.paint, M(p.x, p.y, p.z), { tint: EXPO.orange, cast: false })
    strut(c, v(p.x, p.y + 0.2, p.z), v(p.x, p.y + 0.55, p.z), 0.03, steel, '#3a3e44')
  }
  hookMesh(R.hook.point)
  hookMesh(R.hook2.point)
  targets.push({
    id: CLAW_IDS.ropeHook,
    type: 'pull_player',
    label: '乗り場の金具',
    point: R.hook.point.clone(),
    radius: 0.3,
    enabled: true,
    range: 12.5,
    facing: v(0, -1, 0.35).normalize(),
    landing: R.hook.landing.clone(),
    via: R.hook.via.clone(),
  })
  targets.push({
    id: CLAW_IDS.ropeHook2,
    type: 'pull_player',
    label: '機械室の金具',
    point: R.hook2.point.clone(),
    radius: 0.3,
    enabled: true,
    facing: v(0.35, -1, 0).normalize(),
    landing: R.hook2.landing.clone(),
    via: R.hook2.via.clone(),
  })
  targets.push({
    id: CLAW_IDS.ropeSwing,
    type: 'swing_anchor',
    label: 'ケーブルの吊り輪',
    point: A.clone(),
    radius: 0.4,
    enabled: true,
    ropeLength: R.rope,
    checkpoints: [v(R.plat1.x1 + 0.9, R.platY, 0), v(R.plat2.x0 - 0.9, R.platY, 0)],
  })
  // 乗り場の看板と切符売り場
  const S = X.ROPE_STAFF
  boxAB(c, S.x - 1.4, S.x + 1.4, 0, 2.4, S.z + 0.8, S.z + 2.4, c.m.paint, { tint: EXPO.white, collide: true })
  boxAB(c, S.x - 1.6, S.x + 1.6, 2.4, 2.6, S.z + 0.5, S.z + 2.6, c.m.paint, { tint: EXPO.sky })
  const sg = textSign('空中ロープウェイ', 3.2, 0.7, { bg: EXPO.sky, fg: '#fff', sub: 'のりば' })
  sg.position.set(S.x, 3.2, S.z + 0.79)
  c.root.add(sg)
  // 係員の帽子（鉄塔 1 の横桁に引っかかっている）：引き寄せられる
  const hat = new THREE.Group()
  const hatMat = new THREE.MeshStandardMaterial({ color: '#2a3a6a', roughness: 0.7 })
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.12, 16), hatMat)
  crown.position.y = 0.08
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.02, 16, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.4 }))
  brim.position.set(0, 0.03, -0.1)
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshStandardMaterial({ color: '#f6c434', metalness: 0.7, roughness: 0.3 }))
  badge.position.set(0, 0.09, -0.165)
  hat.add(crown, brim, badge)
  hat.traverse((o) => ((o as THREE.Mesh).castShadow = true))
  hat.position.copy(R.hat)
  c.root.add(hat)
  box(c, R.hat.x - 0.3, R.hat.y - 0.06, R.hat.z, 1.4, 0.08, 0.08, steel, { tint: '#d84a2a' })
  const def: ClawTargetDef = { id: CLAW_IDS.hat, type: 'pull_object', label: '係員の帽子', point: R.hat.clone().add(v(0, 0.12, 0)), radius: 0.3, enabled: true }
  targets.push(def)
  const mv: MovableInput = { def, object: hat, half: v(0.17, 0.08, 0.17), home: R.hat.clone() }
  movables.push(mv)
  for (const [x, z] of [
    [-30, -6],
    [-30, 8],
    [-46, 10],
  ])
    expoLamp(c, x, z)
  return mv
}

// ------------------------------------------------------------------ 日本庭園の竹林（南西）

function buildGarden(c: ECtx, targets: ClawTargetDef[]): void {
  const G = X.GARDEN
  // 苔の地面と砂利の小道
  boxAB(c, G.x0, G.x1, 0, 0.015, G.z0, X.POND_G.z0, c.m.fabric, { tint: '#5e8a3e', texM: 3, cast: false })
  boxAB(c, G.x0, G.x1, 0, 0.015, X.POND_G.z1, G.z1, c.m.fabric, { tint: '#5e8a3e', texM: 3, cast: false })
  boxAB(c, G.x0, X.POND_G.x0, 0, 0.015, X.POND_G.z0, X.POND_G.z1, c.m.fabric, { tint: '#5e8a3e', texM: 3, cast: false })
  boxAB(c, X.POND_G.x1, G.x1, 0, 0.015, X.POND_G.z0, X.POND_G.z1, c.m.fabric, { tint: '#5e8a3e', texM: 3, cast: false })
  boxAB(c, -30, -22, 0.016, 0.03, 24, 46, c.m.paving, { tint: '#d8d2c4', texM: 1.5, cast: false })
  boxAB(c, -46, -22, 0.016, 0.03, 44.2, 47, c.m.paving, { tint: '#d8d2c4', texM: 1.5, cast: false })
  // 小島（当たり判定は円柱）
  const I = X.ISLAND
  cyl(c, I.x, -1.8, I.y, I.z, I.r, c.m.stone, { tint: '#8e8a7e', r1: I.r - 0.2, seg: 24 })
  const isl = new THREE.CircleGeometry(I.r - 0.2, 24)
  isl.rotateX(-Math.PI / 2)
  c.b.add(isl, c.m.fabric, M(I.x, I.y + 0.01, I.z), { tint: '#5e8a3e', cast: false })
  collideCylinder(c, I.x, -1.8, I.y, I.z, I.r - 0.1)
  stoneLantern(c, X.LANTERN.x, X.LANTERN.y, X.LANTERN.z, 1)
  stoneLantern(c, X.LANTERN_SHORE.x, X.LANTERN_SHORE.y, X.LANTERN_SHORE.z, 0.95)
  for (const [x, z] of [
    [-38.6, 36.8],
    [-35.4, 34.0],
  ])
    c.b.add(new THREE.DodecahedronGeometry(0.5, 0), c.m.stone, M(x, I.y + 0.2, z, 0.3, 0.6, 0, 1, 0.6, 1), { tint: '#9a968a' })
  targets.push({
    id: CLAW_IDS.lantern,
    type: 'pull_player',
    label: '小島の石灯籠',
    point: v(X.LANTERN.x, X.LANTERN.y + 1.85, X.LANTERN.z),
    radius: 0.35,
    enabled: true,
    range: 13,
    landing: v(X.LANTERN.x - 0.9, I.y, X.LANTERN.z + 1.0),
  })
  targets.push({
    id: CLAW_IDS.lanternShore,
    type: 'pull_player',
    label: '岸の石灯籠',
    point: v(X.LANTERN_SHORE.x, X.LANTERN_SHORE.y + 1.76, X.LANTERN_SHORE.z),
    radius: 0.35,
    enabled: true,
    range: 13,
    facing: v(0, 0, -1),
    landing: v(X.LANTERN_SHORE.x + 0.2, 0, X.LANTERN_SHORE.z - 0.95),
  })
  // 折れた木の橋（東の岸から少しだけ）
  boxAB(c, X.POND_G.x1 - 2.2, X.POND_G.x1 + 0.6, 0.12, 0.3, 35.0, 36.4, c.m.woodPlain, { tint: '#9a6a3c', collide: true })
  for (const z of [35.0, 36.4]) cyl(c, X.POND_G.x1 - 2.0, -1.2, 0.9, z, 0.07, c.m.woodPlain, { tint: '#7a4a2a' })
  // 竹林：西と南の帯、北の縁。隠し場所への細い道は空ける
  const secret = X.BAMBOO_SECRET
  const trail = (x: number, z: number) => {
    // (-44, 46.5) → 隠し場所 の線分からの距離
    const ax = -44.5
    const az = 46.4
    const dx = secret.x - ax
    const dz = secret.z - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
  }
  const rng = c.rng
  const place = (x0: number, x1: number, z0: number, z1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0)
      const z = z0 + rng() * (z1 - z0)
      if (trail(x, z) < 1.3 || Math.hypot(x - secret.x, z - secret.z) < 1.6) continue
      bamboo(c, x, z, 7 + rng() * 4, 0.4 + rng() * 0.6, rng() * Math.PI * 2, rng() < 0.45)
    }
  }
  place(G.x0, G.x0 + 7, G.z0, G.z1, 70)
  place(G.x0 + 7, G.x1 - 4, G.z1 - 4.5, G.z1, 70)
  place(G.x0 + 7, X.POND_G.x0 - 0.8, G.z0 + 1, X.POND_G.z1, 26)
  place(-21.5, G.x1, 30, G.z1 - 4.5, 18)
  // 竹垣（庭の北の縁）
  for (let x = G.x0; x < -30; x += 0.5) cyl(c, x, 0, 1.1, G.z0 + 0.2, 0.04, c.m.plastic, { tint: '#b8a060', seg: 6 })
  boxAB(c, G.x0, -30, 0.5, 0.56, G.z0 + 0.12, G.z0 + 0.28, c.m.plastic, { tint: '#8a7a40' })
  boxAB(c, G.x0, -30, 0.95, 1.01, G.z0 + 0.12, G.z0 + 0.28, c.m.plastic, { tint: '#8a7a40' })
  c.col.box((G.x0 - 30) / 2, 0.6, G.z0 + 0.2, -30 - G.x0, 1.2, 0.25)
  const sg = textSign('日本庭園', 1.8, 0.6, { bg: '#4a3a2a', fg: '#f4e8d0' })
  sg.position.set(-26, 2.1, 24.2)
  c.root.add(sg)
  cyl(c, -26.85, 0, 2.4, 24.2, 0.06, c.m.woodPlain, { tint: '#5a3a24' })
  cyl(c, -25.15, 0, 2.4, 24.2, 0.06, c.m.woodPlain, { tint: '#5a3a24' })
  // 隠し場所の小さな祠
  boxAB(c, secret.x - 0.6, secret.x + 0.6, 0, 0.5, secret.z + 0.6, secret.z + 1.3, c.m.stone, { tint: '#9a968a', collide: true })
  c.b.add(new THREE.ConeGeometry(0.75, 0.5, 4), c.m.woodPlain, M(secret.x, 1.1, secret.z + 0.95, 0, Math.PI / 4, 0), { tint: '#6a4a2a' })
  boxAB(c, secret.x - 0.35, secret.x + 0.35, 0.5, 0.86, secret.z + 0.75, secret.z + 1.15, c.m.woodPlain, { tint: '#8a5a34' })
}

// ------------------------------------------------------------------ 工事中の展示区画（北東）

function buildSwarmArea(c: ECtx): void {
  const A = X.SWARM_AREA
  // 工事の柵（入口は南西）
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const n = Math.max(1, Math.round(len / 2))
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      const x = ax + (bx - ax) * ((t0 + t1) / 2)
      const z = az + (bz - az) * ((t0 + t1) / 2)
      const rot = -Math.atan2(bz - az, bx - ax)
      box(c, x, 0.55, z, (len / n) * 0.96, 0.9, 0.08, c.m.paint, { rotY: rot, tint: i % 2 ? EXPO.white : EXPO.orange })
    }
    c.col.box((ax + bx) / 2, 0.8, (az + bz) / 2, len, 1.6, 0.2, -Math.atan2(bz - az, bx - ax))
  }
  fence(A.x0, A.z0, A.x1, A.z0)
  fence(A.x1, A.z0, A.x1, A.z1)
  fence(A.x1, A.z1, A.x0 + 6, A.z1)
  fence(A.x0, A.z0, A.x0, A.z1 - 6)
  // 建てかけの展示（立方体の鉄骨）
  const cx = 34
  const cz = -43
  const s = 6
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    strut(c, v(cx + (dx * s) / 2, 0, cz + (dz * s) / 2), v(cx + (dx * s) / 2, s, cz + (dz * s) / 2), 0.14, c.m.metal, EXPO.steel)
    c.col.box(cx + (dx * s) / 2, s / 2, cz + (dz * s) / 2, 0.3, s, 0.3)
  }
  for (const y of [s / 2, s])
    for (const [a, b] of [
      [v(-1, 0, -1), v(1, 0, -1)],
      [v(1, 0, -1), v(1, 0, 1)],
      [v(1, 0, 1), v(-1, 0, 1)],
      [v(-1, 0, 1), v(-1, 0, -1)],
    ])
      strut(c, v(cx + (a.x * s) / 2, y, cz + (a.z * s) / 2), v(cx + (b.x * s) / 2, y, cz + (b.z * s) / 2), 0.1, c.m.metal, EXPO.steel)
  // 足場と資材
  latticeTower(c, 24.5, -45, 2, 5, c.m.metal, '#c8a040', 1.6, 0)
  for (const [x, z, w, h, d] of [
    [27, -31.5, 1.6, 1.0, 1.2],
    [38.5, -33, 1.2, 1.2, 1.2],
    [40, -46, 1.4, 0.8, 2.2],
    [22.5, -36, 1.0, 1.0, 1.0],
  ])
    box(c, x, h / 2, z, w, h, d, c.m.woodPlain, { tint: '#b48a54', collide: true })
  for (let k = 0; k < 5; k++) cyl(c, 30.5 + k * 0.45, 0, 0.4, -30.5, 0.2, c.m.metal, { tint: '#6a6e76' })
  const sg = textSign('工事中', 1.6, 0.6, { bg: EXPO.yellow, fg: '#222', sub: 'ご迷惑をおかけします' })
  sg.position.set(A.x0 + 3, 1.6, A.z1 + 0.05)
  c.root.add(sg)
  // 部品の台
  const P = PARTS.swarm.pos
  cyl(c, P.x, 0, 0.7, P.z, 0.45, c.m.plastic, { tint: EXPO.white, seg: 16 })
  c.col.box(P.x, 0.35, P.z, 0.8, 0.7, 0.8)
}

// ------------------------------------------------------------------ 未来の塔（北）

function buildTower(c: ECtx, targets: ClawTargetDef[]): { hooks: ClawTargetDef[]; knot: ClawTargetDef; wall: CrackedWall } {
  const T = X.TOWER
  const silver = EXPO.silver
  // 土台（円い段）
  cyl(c, T.x, 0, 0.28, T.z, 7.4, c.m.concrete, { tint: '#e4ded2', seg: 40 })
  collideCylinder(c, T.x, -1, 0.28, T.z, 7.2)
  // 胴：銀の円柱と、オレンジの帯・窓の列
  cyl(c, T.x, 0.28, T.deckY, T.z, T.r, c.m.metal, { tint: silver, seg: 40, collide: true })
  for (const y of [3.5, 10.5, 17.5, 24.5]) {
    cyl(c, T.x, y, y + 0.5, T.z, T.r + 0.04, c.m.paint, { tint: EXPO.orange, seg: 40 })
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2
      c.b.add(new THREE.PlaneGeometry(0.5, 1.1), c.m.lightCool, M(T.x + Math.cos(a) * (T.r + 0.05), y + 1.6, T.z + Math.sin(a) * (T.r + 0.05), 0, -a + Math.PI / 2, 0), { tint: '#d8ecff', cast: false })
    }
  }
  // 段のバルコニー（輪の床と手すり）
  for (const y of T.balconies) {
    ringFloor(c, T.x, T.z, T.r, T.balconyR, y, 0.35, c.m.metal, '#b8bec6', 18)
    ringRail(c, T.x, T.z, T.balconyR - 0.12, y, 1.0, c.m.paint, EXPO.white, 28)
    // 支え
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8
      strut(c, v(T.x + Math.cos(a) * T.r, y - 2.2, T.z + Math.sin(a) * T.r), v(T.x + Math.cos(a) * (T.balconyR - 0.3), y - 0.35, T.z + Math.sin(a) * (T.balconyR - 0.3)), 0.07, c.m.metal, EXPO.steel)
    }
  }
  // 頂上の円い展望台（ボスと戦う場所）と、冠のような 4 本の弧
  ringFloor(c, T.x, T.z, 0.01, T.deckR, T.deckY, 0.6, c.m.metal, '#c8ccd2', 24)
  ringRail(c, T.x, T.z, T.deckR - 0.15, T.deckY, 1.05, c.m.paint, EXPO.white, 40)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    strut(c, v(T.x + Math.cos(a) * T.r, T.deckY - 4, T.z + Math.sin(a) * T.r), v(T.x + Math.cos(a) * (T.deckR - 0.4), T.deckY - 0.6, T.z + Math.sin(a) * (T.deckR - 0.4)), 0.09, c.m.metal, EXPO.steel)
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4
    const p0 = v(T.x + Math.cos(a) * (T.deckR - 0.4), T.deckY, T.z + Math.sin(a) * (T.deckR - 0.4))
    const p1 = v(T.x + Math.cos(a) * 5.5, T.deckY + 7, T.z + Math.sin(a) * 5.5)
    const p2 = v(T.x + Math.cos(a) * 2.2, T.deckY + 10, T.z + Math.sin(a) * 2.2)
    c.b.add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2), 14, 0.16, 8, false), c.m.metal, undefined, { tint: silver })
    c.col.box(p0.x, T.deckY + 1.2, p0.z, 0.5, 2.4, 0.5)
  }
  c.b.add(new THREE.TorusGeometry(2.2, 0.18, 10, 40), c.m.paint, M(T.x, T.deckY + 10, T.z, Math.PI / 2, 0, 0), { tint: EXPO.orange })
  // 床の灯り
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    c.b.add(new THREE.CircleGeometry(0.22, 12), c.m.lightWarm, M(T.x + Math.cos(a) * 7.6, T.deckY + 0.02, T.z + Math.sin(a) * 7.6, -Math.PI / 2, 0, 0), { cast: false })
  }
  // 外側の金具（下の段から見上げて狙う）
  const hooks: ClawTargetDef[] = []
  towerHooks().forEach((h, i) => {
    c.b.add(new THREE.TorusGeometry(0.22, 0.055, 8, 18), c.m.paint, M(h.point.x, h.point.y, h.point.z, 0, Math.atan2(h.facing.x, h.facing.z), 0), { tint: EXPO.orange, cast: false })
    strut(c, v(h.point.x, h.point.y + 0.22, h.point.z), v(h.point.x, h.point.y + 0.5, h.point.z), 0.03, c.m.metal, '#3a3e44')
    const def: ClawTargetDef = {
      id: CLAW_IDS.tower(i),
      type: 'pull_player',
      label: '塔の金具',
      point: h.point.clone(),
      radius: 0.3,
      enabled: false,
      range: 11,
      facing: h.facing.clone(),
      landing: h.landing.clone(),
      via: h.via.clone(),
    }
    hooks.push(def)
    targets.push(def)
  })
  // 錨の糸の結び目（ほどくときにつかんで支える）
  const knot: ClawTargetDef = {
    id: CLAW_IDS.knot,
    type: 'hold_mechanism',
    label: '錨の糸の結び目',
    point: X.ANCHOR_KNOT.clone(),
    radius: 0.6,
    enabled: false,
    noLineOfSight: true,
    range: 12,
  }
  targets.push(knot)
  // 囲い：欠けた鉄骨（正面だけひび割れた壁）
  const F = X.FENCE_R
  const gap = 0.23
  const n = 40
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    const am = (a0 + a1) / 2
    if (Math.abs(am - Math.PI / 2) < gap) continue
    const x0 = T.x + Math.cos(a0) * F
    const z0 = T.z + Math.sin(a0) * F
    const x1 = T.x + Math.cos(a1) * F
    const z1 = T.z + Math.sin(a1) * F
    const h = 3.2 + ((i * 37) % 7) * 0.35
    // 傾いた鉄骨と、黒い欠け
    strut(c, v(x0, 0, z0), v(x0 + (c.rng() - 0.5) * 0.6, h, z0 + (c.rng() - 0.5) * 0.6), 0.16, c.m.metal, '#4a4650')
    strut(c, v(x0, h * 0.55, z0), v(x1, h * 0.45, z1), 0.1, c.m.metal, '#4a4650')
    if (i % 3 === 0) c.b.add(new THREE.OctahedronGeometry(0.6 + c.rng() * 0.4, 0), c.m.plastic, M((x0 + x1) / 2, h * 0.7, (z0 + z1) / 2, c.rng(), c.rng(), c.rng(), 0.7, 1.6, 0.7), { tint: '#1a1424' })
    c.col.wall(x0, z0, x1, z1, -0.5, 8, 0.4)
  }
  // 正面の門柱
  for (const s of [-1, 1]) {
    const a = Math.PI / 2 + s * gap
    const x = T.x + Math.cos(a) * F
    const z = T.z + Math.sin(a) * F
    box(c, x, 2.3, z, 0.8, 4.6, 0.8, c.m.concrete, { tint: EXPO.white, collide: true })
  }
  const W = X.TOWER_WALL
  const wall = crackedWall(c, 'tower_wall', W.clone(), 7.6, 3.4, 0)
  // 塔の看板
  const sg = textSign('未来の塔', 2.6, 0.8, { bg: EXPO.white, fg: EXPO.navy, sub: '展望台は頂上' })
  sg.position.set(T.x, 2.8, T.z + T.r + 0.06)
  c.root.add(sg)
  return { hooks, knot, wall }
}

// ------------------------------------------------------------------ 遠景（ほかの館・千里の丘）

function buildFar(c: ECtx): void {
  const rng = c.rng
  // 丘
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng() * 0.2
    const r = 175 + rng() * 40
    c.bf.add(new THREE.SphereGeometry(40 + rng() * 30, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.m.fabric, M(Math.cos(a) * r, -6, Math.sin(a) * r, 0, 0, 0, 1.6, 0.35, 1), { tint: new THREE.Color().setHSL(0.26 + rng() * 0.04, 0.32, 0.36 + rng() * 0.06) })
  }
  // ほかの館（架空の形：丸屋根・空気でふくらんだ屋根・角錐・カプセルの塔・傘の屋根）
  const place = (a: number, r: number) => [Math.cos(a) * r, Math.sin(a) * r] as const
  const shapes = ['dome', 'pillow', 'pyramid', 'capsules', 'umbrella', 'cube', 'dome', 'tower'] as const
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + 0.13
    const [x, z] = place(a, 108 + (i % 3) * 14)
    const kind = shapes[i % shapes.length]
    const col = [EXPO.white, EXPO.cream, EXPO.orange, EXPO.sky, EXPO.yellow, EXPO.red, EXPO.teal][i % 7]
    switch (kind) {
      case 'dome':
        farDome(c, x, z, 12 + rng() * 6, col)
        break
      case 'pillow':
        c.bf.add(new THREE.SphereGeometry(10, 20, 12), c.m.paint, M(x, 3, z, 0, a, 0, 1.6, 0.45, 1), { tint: col })
        break
      case 'pyramid':
        c.bf.add(new THREE.ConeGeometry(12, 16, 4), c.m.paint, M(x, 8, z, 0, a, 0), { tint: col })
        break
      case 'capsules':
        cyl(c, x, 0, 30, z, 1.4, c.m.metal, { tint: EXPO.silver, far: true })
        for (let k = 0; k < 8; k++) c.bf.add(new THREE.CapsuleGeometry(1.4, 2.4, 4, 10), c.m.paint, M(x + Math.cos(k * 1.3) * 2.6, 6 + k * 3, z + Math.sin(k * 1.3) * 2.6, 0, 0, Math.PI / 2), { tint: k % 2 ? EXPO.white : col })
        break
      case 'umbrella':
        cyl(c, x, 0, 14, z, 0.8, c.m.metal, { tint: EXPO.silver, far: true })
        c.bf.add(new THREE.ConeGeometry(14, 4, 12), c.m.paint, M(x, 15, z), { tint: col })
        break
      case 'cube':
        c.bf.add(new THREE.BoxGeometry(16, 12, 16), c.m.paint, M(x, 6, z, 0, a, 0), { tint: col })
        c.bf.add(new THREE.BoxGeometry(10, 6, 10), c.m.paint, M(x, 15, z, 0, a + 0.4, 0), { tint: EXPO.white })
        break
      case 'tower':
        latticeFar(c, x, z, 38, col)
        break
    }
  }
  // 観覧車（遊園地の側）
  const wx = -120
  const wz = -70
  const wheel = new THREE.TorusGeometry(18, 0.4, 6, 48)
  c.bf.add(wheel, c.m.metal, M(wx, 22, wz, 0, 0.8, 0), { tint: EXPO.white })
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2
    const p = v(wx + Math.cos(a) * 18 * Math.cos(0.8), 22 + Math.sin(a) * 18, wz - Math.cos(a) * 18 * Math.sin(0.8))
    strut(c, v(wx, 22, wz), p, 0.15, c.m.metal, EXPO.white, true, 4)
    c.bf.add(new THREE.BoxGeometry(1.6, 1.8, 1.6), c.m.paint, M(p.x, p.y - 1.2, p.z), { tint: [EXPO.red, EXPO.yellow, EXPO.sky, EXPO.orange][k % 4] })
  }
  // 会場の外の木の帯
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2
    const r = 92 + rng() * 10
    c.bf.add(new THREE.IcosahedronGeometry(3 + rng() * 2, 0), c.m.fabric, M(Math.cos(a) * r, 3, Math.sin(a) * r, 0, rng() * 3, 0, 1, 1.2, 1), { tint: new THREE.Color().setHSL(0.27, 0.4, 0.28 + rng() * 0.06) })
  }
}

function latticeFar(c: ECtx, x: number, z: number, h: number, col: string): void {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    strut(c, v(x + Math.cos(a) * 3, 0, z + Math.sin(a) * 3), v(x, h, z), 0.3, c.m.metal, col, true, 5)
  }
  c.bf.add(new THREE.SphereGeometry(3, 16, 10), c.m.paint, M(x, h * 0.75, z), { tint: EXPO.white })
}

export { SHARDS, PARTS }
