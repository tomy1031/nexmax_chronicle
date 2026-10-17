// 2026年 なんばの組み立ての道具（Batch に積む箱・円柱・看板・提灯・街灯など）。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import type { Rng } from '../../render/noise'
import type { QualitySettings } from '../../render/quality'
import type { ColliderList } from '../../world/colliders'
import type { LightSpot } from '../../world/edo/kit'
import type { NambaMaterials } from './materials'
import { SignAtlas, mapUV, signPanel, type UVRect } from './signs'

export type NCtx = {
  /** 影を落とす静的な物 */
  b: Batch
  /** 遠景（影なし） */
  bf: Batch
  m: NambaMaterials
  col: ColliderList
  lights: LightSpot[]
  root: THREE.Group
  updaters: Array<(dt: number, t: number) => void>
  rng: Rng
  q: QualitySettings
  /** 外の看板のアトラスとマテリアル（昼の看板・光る看板） */
  signs: SignAtlas
  signMat: THREE.MeshStandardMaterial
  signGlow: THREE.MeshStandardMaterial
  /** 室内の掲示物・画面のアトラス */
  inner: SignAtlas
  innerMat: THREE.MeshStandardMaterial
  innerGlow: THREE.MeshStandardMaterial
}

export type BoxOpts = {
  rotY?: number
  rotX?: number
  rotZ?: number
  tint?: THREE.ColorRepresentation
  /** box 投影でテクスチャ 1 枚が覆う m（無ければ UV そのまま） */
  texM?: number
  /** 角の丸み */
  r?: number
  cast?: boolean
  far?: boolean
  /** 当たり判定も登録 */
  collide?: boolean
}

export function box(c: NCtx, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: THREE.Material, o: BoxOpts = {}): void {
  const r = o.r ?? Math.min(0.02, Math.min(sx, sy, sz) * 0.15)
  ;(o.far ? c.bf : c.b).add(rbox(sx, sy, sz, r), mat, M(cx, cy, cz, o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0), { tint: o.tint ?? '#ffffff', texM: o.texM, cast: o.far ? false : o.cast })
  if (o.collide) c.col.box(cx, cy, cz, sx, sy, sz, o.rotY ?? 0)
}

/** x0..x1 / y0..y1 / z0..z1 で箱 */
export function boxAB(c: NCtx, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, o: BoxOpts = {}): void {
  box(c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), mat, o)
}

export function cyl(c: NCtx, x: number, y0: number, y1: number, z: number, r0: number, mat: THREE.Material, o: { r1?: number; tint?: THREE.ColorRepresentation; seg?: number; cast?: boolean; far?: boolean } = {}): void {
  const h = y1 - y0
  ;(o.far ? c.bf : c.b).add(new THREE.CylinderGeometry(o.r1 ?? r0, r0, h, o.seg ?? 12), mat, M(x, (y0 + y1) / 2, z), { tint: o.tint ?? '#ffffff', cast: o.far ? false : o.cast })
}

/** 看板（正面 +Z が rotY だけ回る）。glow=true なら光る看板 */
export function sign(c: NCtx, id: string, x: number, y: number, z: number, rotY: number, w: number, h: number, o: { glow?: boolean; depth?: number; far?: boolean; inner?: boolean } = {}): void {
  const atlas = o.inner ? c.inner : c.signs
  const mat = o.inner ? (o.glow ? c.innerGlow : c.innerMat) : o.glow ? c.signGlow : c.signMat
  const g = signPanel(w, h, atlas.get(id), o.depth ?? 0.08)
  ;(o.far ? c.bf : c.b).add(g, mat, M(x, y, z, 0, rotY, 0), { uv: 'keep', cast: o.far ? false : (o.depth ?? 0.08) > 0.05 })
}

/** 薄い板（両面ではない）に UV 矩形を貼る */
export function decal(c: NCtx, r: UVRect, x: number, y: number, z: number, rotY: number, w: number, h: number, mat: THREE.Material, far = false): void {
  const g = mapUV(new THREE.PlaneGeometry(w, h), r)
  ;(far ? c.bf : c.b).add(g, mat, M(x, y, z, 0, rotY, 0), { uv: 'keep', cast: false })
}

const lanternGeoCache = new Map<string, THREE.BufferGeometry>()
/** 提灯（アトラスの矩形を胴に巻く）。y は中心 */
export function lantern(c: NCtx, id: string, x: number, y: number, z: number, s = 1, rotY = 0): void {
  const key = id
  let g = lanternGeoCache.get(key)
  if (!g) {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      pts.push(new THREE.Vector2(0.17 + 0.12 * Math.pow(Math.sin(Math.PI * t), 0.7), -0.32 + 0.64 * t))
    }
    g = mapUV(new THREE.LatheGeometry(pts, 16), c.signs.get(id))
    lanternGeoCache.set(key, g)
  }
  c.b.add(g, c.signGlow, M(x, y, z, 0, rotY, 0, s), { uv: 'keep', cast: false })
  c.b.add(new THREE.CylinderGeometry(0.19 * s, 0.2 * s, 0.07 * s, 12), c.m.paint, M(x, y + 0.34 * s, z), { tint: '#1a1410', cast: false })
  c.b.add(new THREE.CylinderGeometry(0.2 * s, 0.19 * s, 0.07 * s, 12), c.m.paint, M(x, y - 0.34 * s, z), { tint: '#1a1410', cast: false })
  c.lights.push({ pos: new THREE.Vector3(x, y, z), color: '#ff8a50', intensity: 2.6 * s, dist: 6 })
}

/** 街灯（遊歩道の黒い柱と丸い灯り） */
export function streetLamp(c: NCtx, x: number, z: number, h = 4.2): void {
  cyl(c, x, 0, 0.35, z, 0.16, c.m.metal, { tint: '#2a2d33', r1: 0.12, seg: 10 })
  cyl(c, x, 0.35, h, z, 0.06, c.m.metal, { tint: '#2a2d33', seg: 8 })
  c.b.add(new THREE.SphereGeometry(0.17, 16, 10), c.m.lampGlow, M(x, h + 0.16, z), { cast: false, tint: '#fff4e0' })
  cyl(c, x, h + 0.3, h + 0.37, z, 0.15, c.m.metal, { tint: '#2a2d33', r1: 0.05, seg: 10 })
  c.col.box(x, h / 2, z, 0.3, h, 0.3)
  c.lights.push({ pos: new THREE.Vector3(x, h, z), color: '#ffcf8a', intensity: 2.2, dist: 8 })
}

/** ベンチ（木の座面と黒い脚）。rotY=0 で座面が +Z 向き */
export function bench(c: NCtx, x: number, z: number, rotY = 0, w = 1.8): void {
  const cs = Math.cos(rotY)
  const sn = Math.sin(rotY)
  const P = (lx: number, lz: number): [number, number] => [x + lx * cs + lz * sn, z - lx * sn + lz * cs]
  for (const k of [-0.18, 0, 0.18]) {
    const [px, pz] = P(0, k)
    box(c, px, 0.45, pz, w, 0.05, 0.14, c.m.woodPlain, { rotY, tint: '#b07a4a' })
  }
  for (const k of [0.25, 0.42]) {
    const [px, pz] = P(0, -0.3)
    box(c, px, 0.45 + k, pz, w, 0.12, 0.05, c.m.woodPlain, { rotY, tint: '#a86f40' })
  }
  for (const s of [-1, 1]) {
    const [px, pz] = P(s * (w / 2 - 0.15), 0)
    box(c, px, 0.22, pz, 0.08, 0.44, 0.55, c.m.metal, { rotY, tint: '#25282e' })
  }
  c.col.box(x, 0.3, z, w, 0.6, 0.6, rotY)
}

/** 自動販売機（rotY=0 で正面が +Z） */
export function vending(c: NCtx, x: number, z: number, rotY: number, color: string): void {
  const cs = Math.cos(rotY)
  const sn = Math.sin(rotY)
  const P = (lz: number): [number, number] => [x + lz * sn, z + lz * cs]
  box(c, x, 0.92, z, 1.0, 1.84, 0.75, c.m.paint, { rotY, tint: color, r: 0.04, collide: true })
  // 正面：商品の窓（光る）と取り出し口
  const [wx, wz] = P(0.38)
  box(c, wx, 1.28, wz, 0.86, 0.72, 0.02, c.m.lightCool, { rotY, tint: '#eef6ff', cast: false })
  for (let r = 0; r < 3; r++) {
    for (let k = 0; k < 5; k++) {
      const [px, pz] = P(0.395)
      const lx = -0.32 + k * 0.16
      c.b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 8), c.m.plastic, M(px + lx * cs, 1.02 + r * 0.24, pz - lx * sn), { tint: ['#e24a3a', '#3a8ae2', '#f2c84b', '#4ab86a', '#f0f0f0'][(k + r) % 5], cast: false })
    }
  }
  const [bx, bz] = P(0.38)
  box(c, bx, 0.32, bz, 0.7, 0.18, 0.03, c.m.paint, { rotY, tint: '#1a1c20', cast: false })
}

/** 植え込みの木（ケヤキ風：幹と葉のカード）。s=1 で高さ約 5m */
export function tree(c: NCtx, x: number, z: number, s = 1, seed = 1): void {
  const rng = mulberry(seed)
  // 植え込み（石の縁と土）
  boxAB(c, x - 0.75, x + 0.75, 0, 0.42, z - 0.75, z + 0.75, c.m.stone, { tint: '#d8d2c8', texM: 1.2, collide: true })
  boxAB(c, x - 0.62, x + 0.62, 0.42, 0.45, z - 0.62, z + 0.62, c.m.rubber, { tint: '#4a3a2a' })
  // 幹と枝
  const trunk = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
    const len = a.distanceTo(b)
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))
    c.b.add(new THREE.CylinderGeometry(r1, r0, len, 7, 1, true), c.m.bark, m, { tint: '#8a7660' })
  }
  const base = new THREE.Vector3(x, 0.4, z)
  const top = new THREE.Vector3(x + (rng() - 0.5) * 0.3, 2.4 * s, z + (rng() - 0.5) * 0.3)
  trunk(base, top, 0.14 * s, 0.1 * s)
  const blobs: THREE.Vector3[] = []
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + rng()
    const e = top.clone().add(new THREE.Vector3(Math.cos(a) * 1.0 * s, (0.7 + rng() * 0.8) * s, Math.sin(a) * 1.0 * s))
    trunk(top, e, 0.08 * s, 0.04 * s)
    blobs.push(e)
  }
  blobs.push(top.clone().add(new THREE.Vector3(0, 1.7 * s, 0)))
  // 葉のカード（交差する板）
  for (const p of blobs) {
    for (let k = 0; k < 7; k++) {
      const off = new THREE.Vector3((rng() - 0.5) * 1.2 * s, (rng() - 0.5) * 0.9 * s, (rng() - 0.5) * 1.2 * s)
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI))
      const m = new THREE.Matrix4().compose(p.clone().add(off), q, new THREE.Vector3(1, 1, 1).multiplyScalar((1.1 + rng() * 0.5) * s))
      const g = new THREE.PlaneGeometry(1, 1)
      // 球状の法線（やわらかい陰影）
      const n = g.attributes.normal as THREE.BufferAttribute
      const pos = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < n.count; i++) n.setXYZ(i, pos.getX(i), 0.6, pos.getY(i))
      c.b.add(g, c.m.leaf, m, { tint: new THREE.Color().setHSL(0.24 + rng() * 0.05, 0.45, 0.42 + rng() * 0.1), uv: 'keep' })
    }
  }
  c.col.box(x, 1.5, z, 0.3, 3, 0.3)
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 柵の鎖・電線などの垂れた線（チューブ） */
export function sag(c: NCtx, a: THREE.Vector3, b: THREE.Vector3, drop: number, r: number, mat: THREE.Material, tint: THREE.ColorRepresentation): void {
  const mid = a.clone().lerp(b, 0.5)
  mid.y -= drop
  const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
  c.b.add(new THREE.TubeGeometry(curve, 8, r, 4, false), mat, undefined, { tint, cast: false })
}
