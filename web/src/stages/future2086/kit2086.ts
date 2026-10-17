// 2086年の会場の部品：角の丸い箱、ネオンの帯、光る手すり、細い柱、植え込み、つる草、提灯と電球の連なり、
// フライトケース（木箱の未来版）、属性付きの結合（布・ホログラム）。
// 静的なものは Batch（マテリアルごとに 1 メッシュ）へ積む。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { Batch, M, rbox } from '../../render/batch'
import { range, type Rng } from '../../render/noise'
import { orientAB, type Ctx } from '../../world/edo/kit'
import type { Foliage } from '../../world/edo/nature'
import type { FutureMaterials } from './fmaterials'
import { atlasPlane, type UVRect } from './textures2086'

/** 2086年の組み立ての文脈（江戸の Ctx に、未来のマテリアルと属性付きの結合を足したもの） */
export type FCtx = Ctx & {
  fm: FutureMaterials
  /** 布（幟・横断幕・のれん・テント） */
  cloth: AttrBatch
  /** 昼夜とも見えるホログラム */
  holo: AttrBatch
  /** 夜だけの緊急表示 */
  holoN: AttrBatch
  foliage: Foliage
}

/** 頂点ごとの追加属性を持てる結合（Batch は position/normal/uv しか残さないため） */
export class AttrBatch {
  private geos: THREE.BufferGeometry[] = []
  private readonly attrNames: string[]

  constructor(attrNames: string[] = []) {
    this.attrNames = attrNames
  }

  /** attr は結合前（ローカル座標）の頂点位置から値を返す */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, attr?: Record<string, (p: THREE.Vector3) => number>): void {
    let g = geo.clone()
    if (g.index) g = g.toNonIndexed()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    const p = new THREE.Vector3()
    for (const name of this.attrNames) {
      const f = attr?.[name]
      const arr = new Float32Array(g.attributes.position.count)
      for (let i = 0; i < arr.length; i++) {
        p.fromBufferAttribute(g.attributes.position, i)
        arr[i] = f ? f(p) : 0
      }
      g.setAttribute(name, new THREE.BufferAttribute(arr, 1))
    }
    g.applyMatrix4(matrix)
    this.geos.push(g)
  }

  get count(): number {
    return this.geos.length
  }

  build(mat: THREE.Material, name: string): THREE.Mesh | null {
    if (!this.geos.length) return null
    const merged = mergeGeometries(this.geos, false)
    for (const g of this.geos) g.dispose()
    this.geos = []
    if (!merged) return null
    merged.computeBoundingSphere()
    const m = new THREE.Mesh(merged, mat)
    m.name = name
    m.matrixAutoUpdate = false
    m.updateMatrix()
    return m
  }
}

// ------------------------------------------------------------------ 箱・帯

export type FBoxOpts = { rotY?: number; rotX?: number; rotZ?: number; tint?: THREE.ColorRepresentation; r?: number; texM?: number; cast?: boolean; uAxis?: 0 | 1 | 2; far?: boolean }

/** 角の丸い箱（任意のマテリアル） */
export function fbox(c: FCtx, mat: THREE.Material, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, o: FBoxOpts = {}): void {
  const r = o.r ?? Math.min(0.06, Math.min(sx, sy, sz) * 0.2)
  ;(o.far ? c.bf : c.b).add(rbox(sx, sy, sz, r), mat, M(cx, cy, cz, o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0), {
    tint: o.tint ?? '#ffffff',
    texM: o.texM ?? 2,
    cast: o.cast,
    uAxis: o.uAxis,
  })
}

/** a→b の棒（Y 方向のジオメトリを向ける） */
export function rod(b: Batch, mat: THREE.Material, a: THREE.Vector3, e: THREE.Vector3, r: number, tint: THREE.ColorRepresentation = '#ffffff', seg = 8, cast = true): void {
  const len = a.distanceTo(e)
  if (len < 1e-4) return
  b.add(new THREE.CylinderGeometry(r, r, len, seg, 1), mat, orientAB(a, e), { tint, uv: 'scale', uvScale: [1, len], cast })
}

/** ネオンの帯（a→b、幅 w・厚み h）。color は HDR（1 を超えてよい） */
export function neon(c: FCtx, a: THREE.Vector3, b: THREE.Vector3, w: number, color: THREE.Color, far = false): void {
  const len = a.distanceTo(b)
  if (len < 1e-4) return
  ;(far ? c.bf : c.b).add(new THREE.BoxGeometry(w, len, w), far ? c.fm.farGlow : c.fm.glow, orientAB(a, b), { tint: color, cast: false, receive: false })
}

export const NEON = {
  cyan: new THREE.Color(0.35, 1.6, 2.4),
  blue: new THREE.Color(0.3, 0.75, 2.6),
  pink: new THREE.Color(2.6, 0.6, 1.5),
  warm: new THREE.Color(2.6, 1.5, 0.6),
  white: new THREE.Color(2.0, 2.1, 2.3),
  red: new THREE.Color(2.8, 0.25, 0.3),
  green: new THREE.Color(0.5, 2.4, 1.2),
}

// ------------------------------------------------------------------ 手すり・柱・床

/**
 * 未来の手すり：細い支柱、白い笠木、その下に光る帯、中段の細い横棒。
 * collider=true でプレイヤーを止める（高さ 1.2m の箱）
 */
export function glowRailing(c: FCtx, ax: number, az: number, bx: number, bz: number, y: number, o: { color?: THREE.Color; spacing?: number; collider?: boolean; h?: number } = {}): void {
  const h = o.h ?? 1.0
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 0.05) return
  const n = Math.max(1, Math.round(len / (o.spacing ?? 1.5)))
  const rot = -Math.atan2(dz, dx)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    fbox(c, c.fm.metal, ax + dx * t, y + h / 2, az + dz * t, 0.06, h, 0.06, { r: 0.02 })
  }
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  fbox(c, c.fm.plastic, mx, y + h, mz, len + 0.08, 0.08, 0.14, { rotY: rot, r: 0.035, tint: '#f2f5f8' })
  neon(c, new THREE.Vector3(ax, y + h - 0.07, az), new THREE.Vector3(bx, y + h - 0.07, bz), 0.035, o.color ?? NEON.cyan)
  fbox(c, c.fm.metal, mx, y + h * 0.5, mz, len, 0.035, 0.035, { rotY: rot, r: 0.01 })
  fbox(c, c.fm.metal, mx, y + h * 0.18, mz, len, 0.035, 0.035, { rotY: rot, r: 0.01 })
  if (o.collider ?? true) c.col.box(mx, y + 0.6, mz, len, 1.2, 0.2, rot)
}

/** 細い柱（白）に光る輪 */
export function column(c: FCtx, x: number, z: number, y0: number, y1: number, r = 0.22, ring: THREE.Color = NEON.cyan): void {
  const h = y1 - y0
  c.b.add(new THREE.CylinderGeometry(r, r * 1.08, h, 18), c.fm.panel, M(x, (y0 + y1) / 2, z), { tint: '#f6f8fa', uv: 'scale', uvScale: [1.2, h / 2] })
  c.b.add(new THREE.CylinderGeometry(r * 1.25, r * 1.3, 0.25, 18), c.fm.metal, M(x, y0 + 0.125, z))
  for (const yy of [y0 + 0.9, y1 - 0.5]) c.b.add(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.06, 18), c.fm.glow, M(x, yy, z), { tint: ring, cast: false })
  c.col.box(x, (y0 + y1) / 2, z, r * 2, h, r * 2)
}

// ------------------------------------------------------------------ 緑

/** 白い植え込みの箱（縁が光る）＋ 植え込み */
export function planter(c: FCtx, x: number, z: number, w: number, d: number, y = 0, h = 0.55, seed = 1, rotY = 0): void {
  fbox(c, c.fm.plastic, x, y + h / 2, z, w, h, d, { rotY, r: 0.08, tint: '#eef2f5' })
  c.b.add(new THREE.BoxGeometry(w - 0.16, 0.06, d - 0.16), c.m.grass, M(x, y + h - 0.02, z, 0, rotY, 0), { tint: '#6f5a40', uv: 'scale', uvScale: [w, d] })
  const n = Math.max(1, Math.round((w * d) / 1.1))
  const cs = Math.cos(rotY)
  const sn = Math.sin(rotY)
  for (let i = 0; i < n; i++) {
    const lx = ((i + 0.5) / n - 0.5) * (w - 0.5)
    const lz = (((i * 7) % 3) / 2 - 0.5) * (d - 0.5) * 0.5
    c.foliage.bush(x + lx * cs + lz * sn, y + h - 0.25, z - lx * sn + lz * cs, Math.min(0.55, d * 0.42), seed * 13 + i, 0.8)
  }
  c.col.box(x, y + h / 2, z, w, h, d, rotY)
}

/** 垂れ下がるつる草（葉のカードを縦に重ねる） */
export function vine(c: FCtx, x: number, y: number, z: number, len: number, rng: Rng): void {
  const n = Math.max(2, Math.round(len / 0.32))
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const s = 0.62 * (1 - t * 0.55)
    const px = x + range(rng, -0.08, 0.08)
    const pz = z + range(rng, -0.08, 0.08)
    const py = y - t * len
    for (let k = 0; k < 2; k++) {
      c.b.add(new THREE.PlaneGeometry(s, s), c.m.leaf, M(px, py, pz, range(rng, -0.4, 0.4), range(rng, 0, Math.PI) + k * 1.4, range(rng, -0.3, 0.3)), {
        tint: new THREE.Color(range(rng, 0.85, 1.05), range(rng, 0.9, 1.1), range(rng, 0.8, 0.95)),
        cast: i % 2 === 0,
      })
    }
  }
}

// ------------------------------------------------------------------ 提灯・電球

let chochinGeo: THREE.BufferGeometry | null = null
let chochinGeoLow: THREE.BufferGeometry | null = null
function chochinBody(low: boolean): THREE.BufferGeometry {
  if (low && chochinGeoLow) return chochinGeoLow
  if (!low && chochinGeo) return chochinGeo
  const pts: THREE.Vector2[] = []
  const N = low ? 5 : 8
  for (let i = 0; i <= N; i++) {
    const t = i / N
    const bulge = Math.sin(Math.PI * t)
    pts.push(new THREE.Vector2(0.1 + 0.13 * Math.pow(bulge, 0.65), -0.27 + 0.54 * t))
  }
  const g = new THREE.LatheGeometry(pts, low ? 8 : 12)
  if (low) chochinGeoLow = g
  else chochinGeo = g
  return g
}

/** 提灯（kind：red=「祭」、white=「なんば」）。y は提灯の中心 */
export function chochin(c: FCtx, x: number, y: number, z: number, kind: 'red' | 'white', s = 1, o: { light?: boolean; low?: boolean; rotY?: number } = {}): void {
  const g = chochinBody(!!o.low).clone()
  // テクスチャの左半分＝赤、右半分＝白
  const uv = g.attributes.uv as THREE.BufferAttribute
  const off = kind === 'red' ? 0 : 0.5
  for (let i = 0; i < uv.count; i++) uv.setX(i, off + uv.getX(i) * 0.5)
  c.b.add(g, c.fm.lantern, M(x, y, z, 0, o.rotY ?? range(c.rng, 0, 6.28), 0, s), { cast: false })
  if (!o.low) {
    c.b.add(new THREE.CylinderGeometry(0.12 * s, 0.13 * s, 0.06 * s, 10), c.m.darkLacquer, M(x, y + 0.285 * s, z), { cast: false })
    c.b.add(new THREE.CylinderGeometry(0.13 * s, 0.12 * s, 0.06 * s, 10), c.m.darkLacquer, M(x, y - 0.285 * s, z), { cast: false })
  }
  if (o.light) c.lights.push({ pos: new THREE.Vector3(x, y - 0.05, z), color: kind === 'red' ? '#ff7a48' : '#ffb466', intensity: 3.2 * s, dist: 8 })
}

/** 垂れ下がる曲線（懸垂線の近似）上の点 */
export function sagPoints(a: THREE.Vector3, b: THREE.Vector3, sag: number, n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = a.clone().lerp(b, t)
    p.y -= Math.sin(Math.PI * t) * sag
    out.push(p)
  }
  return out
}

/** 提灯の連なり（紐＋交互の赤と白） */
export function lanternString(c: FCtx, a: THREE.Vector3, b: THREE.Vector3, sag: number, spacing = 1.25, s = 0.9, lightEvery = 4): void {
  const len = a.distanceTo(b)
  const n = Math.max(2, Math.round(len / spacing))
  const pts = sagPoints(a, b, sag, n * 3)
  for (let i = 0; i < pts.length - 1; i++) rod(c.b, c.fm.rubber, pts[i], pts[i + 1], 0.012, '#ffffff', 4, false)
  for (let i = 1; i < n; i++) {
    const p = pts[i * 3]
    chochin(c, p.x, p.y - 0.36 * s, p.z, i % 2 ? 'red' : 'white', s, { light: i % lightEvery === 2 })
    rod(c.b, c.fm.rubber, p, new THREE.Vector3(p.x, p.y - 0.07 * s, p.z), 0.008, '#ffffff', 3, false)
  }
}

let bulbGeo: THREE.BufferGeometry | null = null
/** 小さな電球の連なり（ネオンのマテリアル） */
export function bulbString(c: FCtx, a: THREE.Vector3, b: THREE.Vector3, sag: number, spacing: number, color: THREE.Color, far = false): void {
  if (!bulbGeo) bulbGeo = new THREE.IcosahedronGeometry(0.045, 1)
  const len = a.distanceTo(b)
  const n = Math.max(2, Math.round(len / spacing))
  const pts = sagPoints(a, b, sag, n)
  const batch = far ? c.bf : c.b
  for (let i = 0; i < pts.length - 1; i++) rod(batch, c.fm.rubber, pts[i], pts[i + 1], 0.008, '#ffffff', 3, false)
  for (const p of pts) batch.add(bulbGeo, far ? c.fm.farGlow : c.fm.glow, M(p.x, p.y - 0.04, p.z), { tint: color, cast: false, receive: false })
}

// ------------------------------------------------------------------ フライトケース・ケーブル

/** 白いフライトケース（角の金具・取っ手・印刷）。y は底 */
export function flightCase(c: FCtx, x: number, y: number, z: number, w: number, h: number, d: number, rotY = 0, decal?: UVRect, collider = true): void {
  const tint = new THREE.Color('#ffffff').multiplyScalar(range(c.rng, 0.9, 1.0))
  fbox(c, c.fm.plastic, x, y + h / 2, z, w, h, d, { rotY, r: 0.03, tint })
  const cs = Math.cos(rotY)
  const sn = Math.sin(rotY)
  const P = (lx: number, lz: number) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs] as const
  // 縁の金属（上下の枠）
  for (const yy of [y + 0.03, y + h - 0.03]) fbox(c, c.fm.darkMetal, x, yy, z, w + 0.02, 0.05, d + 0.02, { rotY, r: 0.015 })
  // 角の金具
  for (const [lx, lz] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ] as const) {
    const [px, pz] = P(lx, lz)
    for (const yy of [y + 0.06, y + h - 0.06]) fbox(c, c.fm.metal, px, yy, pz, 0.09, 0.09, 0.09, { rotY, r: 0.02 })
  }
  // 留め金（前面）
  for (const lx of [-w * 0.3, w * 0.3]) {
    const [px, pz] = P(lx, d / 2 + 0.012)
    fbox(c, c.fm.metal, px, y + h * 0.62, pz, 0.1, 0.06, 0.03, { rotY, r: 0.008 })
  }
  // 取っ手（側面）
  for (const s of [-1, 1]) {
    const [px, pz] = P((s * w) / 2 + s * 0.02, 0)
    fbox(c, c.fm.darkMetal, px, y + h * 0.7, pz, 0.04, 0.05, Math.min(0.3, d * 0.5), { rotY, r: 0.01 })
  }
  if (decal) {
    // デカールのアトラスは正方形なので、uv の比がそのまま絵の縦横比
    const aspect = (decal.u1 - decal.u0) / (decal.v1 - decal.v0)
    const dw = Math.min(w * 0.82, h * 0.62 * aspect)
    const dh = dw / aspect
    const [px, pz] = P(0, d / 2 + 0.003)
    c.b.add(atlasPlane(dw, dh, decal), c.fm.decal, M(px, y + h * 0.42, pz, 0, rotY, 0), { cast: false })
  }
  if (collider) c.col.box(x, y + h / 2, z, w, h, d, rotY)
}

/** 床を這うケーブル（点を通る管） */
export function cable(c: FCtx, pts: THREE.Vector3[], r = 0.035, tint: THREE.ColorRepresentation = '#ffffff'): void {
  const curve = new THREE.CatmullRomCurve3(pts)
  c.b.add(new THREE.TubeGeometry(curve, Math.max(8, pts.length * 8), r, 6), c.fm.rubber, undefined, { tint, cast: false })
}
