// 江戸の街の部品（角材・板張り・欄干・提灯・木箱・樽・縄・暖簾・幟・看板・瓦屋根・階段）。
// すべて Batch に積み、マテリアルごとに結合される。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import { TEX_METERS, type MaterialLibrary } from '../../render/materials'
import type { FabricDesign, SignSpec } from '../../render/textures'
import { range, type Rng } from '../../render/noise'
import type { ColliderList } from '../colliders'
import type { QualitySettings } from '../../render/quality'

export type LightSpot = { pos: THREE.Vector3; color: string; intensity: number; dist: number }

export type Ctx = {
  b: Batch
  /** 遠景用（影を落とさない） */
  bf: Batch
  m: MaterialLibrary
  col: ColliderList
  rng: Rng
  lights: LightSpot[]
  root: THREE.Group
  updaters: Array<(dt: number, t: number) => void>
  quality: QualitySettings
}

export const WOOD = {
  fresh: '#ffffff',
  warm: '#f3d9bf',
  honey: '#ffd9a8',
  aged: '#c9a88a',
  dark: '#8c6a52',
  veryDark: '#5e4433',
} as const

export function woodTint(rng: Rng, base: THREE.ColorRepresentation = WOOD.warm, spread = 0.12): THREE.Color {
  const c = new THREE.Color(base)
  const k = 1 + range(rng, -spread, spread)
  c.multiplyScalar(k)
  c.offsetHSL(range(rng, -0.01, 0.01), range(rng, -0.04, 0.04), 0)
  return c
}

const Y = new THREE.Vector3(0, 1, 0)

/** a→b に沿った棒の行列（ジオメトリは Y 方向に長い前提、拡大なし） */
export function orientAB(a: THREE.Vector3, b: THREE.Vector3, roll = 0): THREE.Matrix4 {
  const dir = new THREE.Vector3().subVectors(b, a).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(Y, dir)
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(Y, roll))
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  return new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))
}

// ------------------------------------------------------------------ 木組み

export type BoxOpts = { rotY?: number; rotX?: number; rotZ?: number; tint?: THREE.ColorRepresentation; mat?: THREE.Material; r?: number; texM?: number; cast?: boolean; uAxis?: 0 | 1 | 2 }

export function woodBox(c: Ctx, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, o: BoxOpts = {}): void {
  const r = o.r ?? Math.min(0.05, Math.min(sx, sy, sz) * 0.18)
  c.b.add(rbox(sx, sy, sz, r), o.mat ?? c.m.wood, M(cx, cy, cz, o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0), {
    tint: o.tint ?? woodTint(c.rng),
    texM: o.texM ?? TEX_METERS.wood,
    cast: o.cast,
    uAxis: o.uAxis,
  })
}

export function post(c: Ctx, x: number, z: number, y0: number, y1: number, w = 0.26, tint?: THREE.ColorRepresentation, mat?: THREE.Material): void {
  woodBox(c, x, (y0 + y1) / 2, z, w, y1 - y0, w, { tint, mat })
}

export function beamAB(c: Ctx, a: THREE.Vector3, b: THREE.Vector3, w = 0.2, h = 0.2, tint?: THREE.ColorRepresentation, mat?: THREE.Material): void {
  const len = a.distanceTo(b)
  c.b.add(rbox(w, len, h, Math.min(0.04, w * 0.18)), mat ?? c.m.wood, orientAB(a, b), {
    tint: tint ?? woodTint(c.rng),
    texM: TEX_METERS.wood,
  })
}

/** 板張りのデッキ（1 枚ずつ面取りした板）。支柱・根太・当たり判定付き。 */
export function deck(
  c: Ctx,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  y: number,
  o: { alongX?: boolean; posts?: boolean; postBottom?: number; tint?: THREE.ColorRepresentation; plankW?: number; collider?: boolean } = {},
): void {
  const alongX = o.alongX ?? x1 - x0 >= z1 - z0
  const pw = o.plankW ?? 0.32
  const th = 0.09
  const across0 = alongX ? z0 : x0
  const across1 = alongX ? z1 : x1
  const along0 = alongX ? x0 : z0
  const along1 = alongX ? x1 : z1
  const n = Math.max(1, Math.round((across1 - across0) / pw))
  const w = (across1 - across0) / n
  for (let i = 0; i < n; i++) {
    const a = across0 + (i + 0.5) * w
    let s = along0 - range(c.rng, 0, 1.2)
    while (s < along1) {
      const len = range(c.rng, 1.6, 3.2)
      const p0 = Math.max(s, along0)
      const p1 = Math.min(s + len, along1)
      if (p1 - p0 > 0.15) {
        const mid = (p0 + p1) / 2
        const L = p1 - p0 - 0.012
        const yy = y - th / 2 + range(c.rng, -0.008, 0.008)
        const tint = woodTint(c.rng, o.tint ?? WOOD.warm, 0.14)
        if (alongX) c.b.add(rbox(L, th, w - 0.018, 0.025), c.m.wood, M(mid, yy, a, 0, 0, range(c.rng, -0.004, 0.004)), { tint, texM: TEX_METERS.wood, uAxis: 0 })
        else c.b.add(rbox(w - 0.018, th, L, 0.025), c.m.wood, M(a, yy, mid, range(c.rng, -0.004, 0.004), 0, 0), { tint, texM: TEX_METERS.wood, uAxis: 2 })
      }
      s += len
    }
  }
  // 根太
  const joistY = y - th - 0.09
  const nj = Math.max(2, Math.round((along1 - along0) / 1.4) + 1)
  for (let j = 0; j < nj; j++) {
    const p = along0 + ((along1 - along0) * j) / (nj - 1)
    const pp = Math.min(along1 - 0.1, Math.max(along0 + 0.1, p))
    if (alongX) woodBox(c, pp, joistY, (z0 + z1) / 2, 0.16, 0.18, z1 - z0 - 0.05, { tint: WOOD.dark })
    else woodBox(c, (x0 + x1) / 2, joistY, pp, x1 - x0 - 0.05, 0.18, 0.16, { tint: WOOD.dark })
  }
  if (o.posts ?? true) {
    const bottom = o.postBottom ?? -1.6
    for (let j = 0; j < nj; j += 1) {
      const p = along0 + ((along1 - along0) * j) / (nj - 1)
      const pp = Math.min(along1 - 0.15, Math.max(along0 + 0.15, p))
      for (const q of [across0 + 0.15, across1 - 0.15]) {
        const px = alongX ? pp : q
        const pz = alongX ? q : pp
        c.b.add(new THREE.CylinderGeometry(0.13, 0.15, joistY - bottom, 10), c.m.wood, M(px, (joistY + bottom) / 2, pz), {
          tint: woodTint(c.rng, WOOD.dark),
          uv: 'scale',
          uvScale: [0.6, (joistY - bottom) / TEX_METERS.wood],
        })
      }
    }
  }
  if (o.collider ?? true) c.col.floor(x0, x1, z0, z1, y, 0.4)
}

/** 欄干。red=true で朱塗り＋擬宝珠。 */
export function railing(
  c: Ctx,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  y: number,
  o: { red?: boolean; h?: number; spacing?: number; collider?: boolean; rope?: boolean } = {},
): void {
  const h = o.h ?? 0.85
  const red = o.red ?? false
  const mat = red ? c.m.lacquerRed : c.m.wood
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  const n = Math.max(1, Math.round(len / (o.spacing ?? 1.6)))
  const rot = -Math.atan2(dz, dx)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const x = ax + dx * t
    const z = az + dz * t
    const tint = red ? '#ffffff' : woodTint(c.rng, WOOD.aged)
    woodBox(c, x, y + h / 2 + 0.05, z, 0.14, h + 0.1, 0.14, { tint, mat })
    if (red) {
      c.b.add(new THREE.SphereGeometry(0.085, 12, 8), c.m.gold, M(x, y + h + 0.17, z, 0, 0, 0, 1, 1.3, 1), { tint: '#ffffff' })
      c.b.add(new THREE.CylinderGeometry(0.08, 0.09, 0.06, 12), c.m.gold, M(x, y + h + 0.1, z))
    } else {
      c.b.add(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 10), c.m.darkLacquer, M(x, y + h + 0.11, z))
    }
  }
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  const railTint = red ? '#ffffff' : woodTint(c.rng, WOOD.warm)
  woodBox(c, mx, y + h, mz, len + 0.1, 0.09, 0.12, { rotY: rot, tint: railTint, mat })
  woodBox(c, mx, y + h * 0.45, mz, len, 0.07, 0.08, { rotY: rot, tint: railTint, mat })
  if (o.rope) {
    // たるんだ縄
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 8; k++) {
        const t = t0 + ((t1 - t0) * k) / 8
        const sag = Math.sin((k / 8) * Math.PI) * 0.12
        pts.push(new THREE.Vector3(ax + dx * t, y + h * 0.7 - sag, az + dz * t))
      }
      c.b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.025, 6), c.m.rope, undefined, { uv: 'scale', uvScale: [6, 1] })
    }
  }
  if (o.collider ?? true) c.col.box(mx, y + 0.6, mz, len, 1.2, 0.2, rot)
}

// ------------------------------------------------------------------ 提灯

const lanternBodies = new Map<string, THREE.BufferGeometry>()
function lanternGeo(low = false): THREE.BufferGeometry {
  const key = low ? 'low' : 'high'
  let g = lanternBodies.get(key)
  if (!g) {
    const pts: THREE.Vector2[] = []
    const N = low ? 4 : 10
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const bulge = Math.sin(Math.PI * t)
      pts.push(new THREE.Vector2(0.11 + 0.11 * Math.pow(bulge, 0.7), -0.24 + 0.48 * t))
    }
    g = new THREE.LatheGeometry(pts, low ? 7 : 14)
    lanternBodies.set(key, g)
  }
  return g
}

/** 吊り提灯（y は提灯の中心）。low=true は遠景用の軽い形（上下の枠・紐なし）。 */
export function lantern(c: Ctx, x: number, y: number, z: number, o: { kind?: 'cream' | 'red'; s?: number; cord?: number; light?: boolean; rotY?: number; low?: boolean } = {}): void {
  const s = o.s ?? 1
  const mat = o.kind === 'red' ? c.m.paperRed : c.m.paperCream
  if (o.low) {
    c.b.add(lanternGeo(true), mat, M(x, y, z, 0, o.rotY ?? range(c.rng, 0, 6.28), 0, s), { cast: false })
    if (o.light ?? true) c.lights.push({ pos: new THREE.Vector3(x, y - 0.05, z), color: o.kind === 'red' ? '#ff7a40' : '#ffae5a', intensity: 3.5 * s, dist: 7 })
    return
  }
  c.b.add(lanternGeo(), mat, M(x, y, z, 0, o.rotY ?? range(c.rng, 0, 6.28), 0, s), { cast: false })
  c.b.add(new THREE.CylinderGeometry(0.13 * s, 0.14 * s, 0.06 * s, 10), c.m.darkLacquer, M(x, y + 0.255 * s, z), { cast: false })
  c.b.add(new THREE.CylinderGeometry(0.14 * s, 0.13 * s, 0.06 * s, 10), c.m.darkLacquer, M(x, y - 0.255 * s, z), { cast: false })
  const cord = o.cord ?? 0.25
  if (cord > 0) c.b.add(new THREE.CylinderGeometry(0.008, 0.008, cord, 4), c.m.darkLacquer, M(x, y + 0.28 * s + cord / 2, z), { cast: false })
  if (o.light ?? true) c.lights.push({ pos: new THREE.Vector3(x, y - 0.05, z), color: o.kind === 'red' ? '#ff7a40' : '#ffae5a', intensity: 3.5 * s, dist: 7 })
}

/** 柱に掛ける角行灯（置き型） */
export function standLantern(c: Ctx, x: number, z: number, y = 0): void {
  woodBox(c, x, y + 0.55, z, 0.1, 1.1, 0.1, { tint: WOOD.dark })
  c.b.add(rbox(0.36, 0.46, 0.36, 0.02), c.m.shoji, M(x, y + 1.32, z), { cast: false, texM: 0.36 })
  woodBox(c, x, y + 1.6, z, 0.46, 0.06, 0.46, { tint: WOOD.dark })
  woodBox(c, x, y + 1.08, z, 0.42, 0.05, 0.42, { tint: WOOD.dark })
  c.lights.push({ pos: new THREE.Vector3(x, y + 1.3, z), color: '#ffb066', intensity: 2.5, dist: 6 })
}

// ------------------------------------------------------------------ 小物

export function crate(c: Ctx, x: number, y: number, z: number, s = 0.7, rotY = 0, tint?: THREE.ColorRepresentation): void {
  const t = tint ?? woodTint(c.rng, WOOD.honey, 0.15)
  c.b.add(rbox(s, s, s, 0.03), c.m.planks, M(x, y + s / 2, z, 0, rotY, 0), { tint: t, texM: 1.2 })
  // 枠
  const e = 0.07
  const d = new THREE.Color(t).multiplyScalar(0.72)
  const half = s / 2
  const cs = Math.cos(rotY)
  const sn = Math.sin(rotY)
  const P = (lx: number, lz: number) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs] as const
  for (const [lx, lz] of [
    [-half, -half],
    [half, -half],
    [-half, half],
    [half, half],
  ] as const) {
    const [px, pz] = P(lx * 0.97, lz * 0.97)
    woodBox(c, px, y + s / 2, pz, e, s + 0.01, e, { rotY, tint: d })
  }
  for (const yy of [y + 0.04, y + s - 0.04]) {
    for (const [lx, lz, sx, sz] of [
      [0, -half, s, e],
      [0, half, s, e],
      [-half, 0, e, s],
      [half, 0, e, s],
    ] as const) {
      const [px, pz] = P(lx * 0.97, lz * 0.97)
      woodBox(c, px, yy, pz, sx, e, sz, { rotY, tint: d })
    }
  }
  c.col.box(x, y + s / 2, z, s, s, s, rotY)
}

let barrelGeo: THREE.BufferGeometry | null = null
export function barrel(c: Ctx, x: number, y: number, z: number, s = 1, collider = true): void {
  if (!barrelGeo) {
    const pts: THREE.Vector2[] = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      pts.push(new THREE.Vector2(0.27 + 0.05 * Math.sin(Math.PI * t), 0.8 * t))
    }
    barrelGeo = new THREE.LatheGeometry(pts, 20)
  }
  c.b.add(barrelGeo, c.m.wood, M(x, y, z, 0, range(c.rng, 0, 6.28), 0, s), { tint: woodTint(c.rng, WOOD.honey), uv: 'scale', uvScale: [1.2, 0.5] })
  c.b.add(new THREE.CircleGeometry(0.27, 20), c.m.wood, M(x, y + 0.8 * s, z, -Math.PI / 2, 0, 0, s), { tint: woodTint(c.rng, WOOD.aged) })
  for (const h of [0.13, 0.67]) {
    c.b.add(new THREE.TorusGeometry(0.3, 0.018, 6, 24), c.m.iron, M(x, y + h * s, z, Math.PI / 2, 0, 0, s))
  }
  if (collider) c.col.box(x, y + 0.4 * s, z, 0.6 * s, 0.8 * s, 0.6 * s)
}

/** 樽を横倒し */
export function barrelSide(c: Ctx, x: number, y: number, z: number, rotY: number, s = 1): void {
  if (!barrelGeo) barrel(c, -9999, -9999, -9999, 0.001, false)
  c.b.add(barrelGeo as THREE.BufferGeometry, c.m.wood, M(x, y + 0.3 * s, z, 0, rotY, Math.PI / 2, s), { tint: woodTint(c.rng, WOOD.honey), uv: 'scale', uvScale: [1.2, 0.5] })
}

export function ropeCoil(c: Ctx, x: number, y: number, z: number, r = 0.32): void {
  for (let i = 0; i < 4; i++) {
    c.b.add(new THREE.TorusGeometry(r - i * 0.012, 0.045, 8, 24), c.m.rope, M(x, y + 0.045 + i * 0.075, z, Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [12, 1] })
  }
}

/** 柱に巻いた太縄 */
export function ropeWrap(c: Ctx, x: number, y: number, z: number, postR: number, turns = 4): void {
  for (let i = 0; i < turns; i++) {
    c.b.add(new THREE.TorusGeometry(postR + 0.04, 0.05, 8, 20), c.m.rope, M(x, y + i * 0.095, z, Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [10, 1] })
  }
}

// ------------------------------------------------------------------ 布・看板

export function noren(c: Ctx, x: number, y: number, z: number, w: number, h: number, rotY: number, design: FabricDesign): void {
  const g = new THREE.PlaneGeometry(w, h, 6, 6)
  c.b.add(g, c.m.fabric(design), M(x, y - h / 2, z, 0, rotY, 0), { cast: true })
  c.b.add(new THREE.CylinderGeometry(0.025, 0.025, w + 0.2, 6), c.m.wood, M(x, y + 0.02, z, 0, rotY, Math.PI / 2), { tint: WOOD.dark })
}

/** 幟（のぼり）：柱＋横棒＋縦長の布 */
export function banner(c: Ctx, x: number, z: number, y: number, h: number, rotY: number, design: FabricDesign, w = 0.7): void {
  woodBox(c, x, y + (h + 0.6) / 2, z, 0.08, h + 0.6, 0.08, { tint: WOOD.dark })
  const cs = Math.cos(rotY)
  const sn = -Math.sin(rotY)
  const ox = cs * (w / 2 + 0.05)
  const oz = sn * (w / 2 + 0.05)
  woodBox(c, x + ox, y + h + 0.45, z + oz, w + 0.1, 0.05, 0.05, { rotY, tint: WOOD.dark })
  c.b.add(new THREE.PlaneGeometry(w, h, 4, 10), c.m.fabric(design), M(x + ox, y + h / 2 + 0.45, z + oz, 0, rotY, 0))
}

/** 看板：木の板＋文字面 */
export function signboard(c: Ctx, spec: SignSpec, x: number, y: number, z: number, rotY: number, w: number, h: number, depth = 0.08): void {
  woodBox(c, x, y, z, w + 0.1, h + 0.1, depth, { rotY, tint: WOOD.dark })
  const nx = Math.sin(rotY)
  const nz = Math.cos(rotY)
  c.b.add(new THREE.PlaneGeometry(w, h), c.m.sign(spec), M(x + nx * (depth / 2 + 0.004), y, z + nz * (depth / 2 + 0.004), 0, rotY, 0), { tint: '#ffffff' })
}

// ------------------------------------------------------------------ 瓦屋根

/**
 * 切妻屋根。棟が X 方向（axis='x'）または Z 方向。eaveY は軒先の高さ、rise は棟までの立ち上がり。
 * 瓦テクスチャ＋軒先の丸瓦の列＋棟瓦＋鬼瓦。
 */
export function gableRoof(
  c: Ctx,
  cx: number,
  cz: number,
  length: number,
  width: number,
  eaveY: number,
  rise: number,
  axis: 'x' | 'z' = 'x',
  o: { tint?: THREE.ColorRepresentation; mat?: THREE.Material; endTiles?: boolean } = {},
): void {
  const half = width / 2
  const slopeLen = Math.hypot(half, rise)
  const ang = Math.atan2(rise, half)
  const th = 0.16
  const mat = o.mat ?? c.m.roof
  const tint = o.tint ?? '#ffffff'
  const rotY = axis === 'x' ? 0 : Math.PI / 2
  const cs = Math.cos(rotY)
  const sn = Math.sin(rotY)
  const W = (lx: number, lz: number) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs] as const
  for (const side of [-1, 1]) {
    const lz = (side * half) / 2
    const [px, pz] = W(0, lz)
    const yy = eaveY + rise / 2
    // ローカル：X=棟方向、Z=勾配方向
    c.b.add(rbox(length, th, slopeLen + 0.05, 0.05), mat, M(px, yy, pz, side * ang, rotY, 0), {
      tint,
      texM: 2.0,
      uAxis: 0,
      flipV: side > 0,
    })
    // 軒先の丸瓦
    if (o.endTiles ?? true) {
      const n = Math.floor(length / 0.25)
      for (let i = 0; i < n; i++) {
        const lx = -length / 2 + (i + 0.5) * (length / n)
        const [ex, ez] = W(lx, side * (half + 0.02))
        c.b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.08, 7, 1), c.m.roof, M(ex, eaveY + 0.02, ez, Math.PI / 2, rotY + (side < 0 ? Math.PI : 0), 0), {
          tint: '#9aa3b4',
          uv: 'scale',
          uvScale: [0.1, 0.1],
        })
      }
    }
    // 破風板の代わりに軒の木口
    const [fx, fz] = W(0, side * (half - 0.05))
    woodBox(c, fx, eaveY - 0.1, fz, length + 0.05, 0.12, 0.1, { rotY, tint: WOOD.dark })
  }
  // 棟
  const [rx, rz] = W(0, 0)
  c.b.add(rbox(length + 0.15, 0.22, 0.3, 0.08), mat, M(rx, eaveY + rise + 0.08, rz, 0, rotY, 0), { tint: '#8d96a6', texM: 1.0 })
  c.b.add(new THREE.CylinderGeometry(0.11, 0.11, length + 0.25, 10), mat, M(rx, eaveY + rise + 0.22, rz, 0, rotY, Math.PI / 2), { tint: '#9aa3b4', uv: 'scale', uvScale: [0.3, 3] })
  for (const e of [-1, 1]) {
    const [ox, oz] = W((e * (length + 0.25)) / 2, 0)
    c.b.add(rbox(0.12, 0.42, 0.42, 0.08), mat, M(ox, eaveY + rise + 0.2, oz, 0, rotY, 0), { tint: '#7c8596', texM: 0.6 })
  }
  // 妻側の三角（漆喰）
  const tri = new THREE.Shape()
  tri.moveTo(-half + 0.2, 0)
  tri.lineTo(half - 0.2, 0)
  tri.lineTo(0, rise - 0.1)
  tri.closePath()
  const triGeo = new THREE.ShapeGeometry(tri)
  for (const e of [-1, 1]) {
    const [ox, oz] = W((e * (length / 2 - 0.25)) , 0)
    c.b.add(triGeo, c.m.plaster, M(ox, eaveY, oz, 0, rotY + Math.PI / 2 + (e > 0 ? 0 : Math.PI), 0), { texM: 3, cast: false })
  }
}

/** 片流れの庇（ひさし）。front は軒が向く方向の単位ベクトル（XZ）。 */
export function shedRoof(c: Ctx, cx: number, cz: number, length: number, depth: number, y: number, rotY: number, drop = 0.45): void {
  const ang = Math.atan2(drop, depth)
  const sl = Math.hypot(depth, drop)
  c.b.add(rbox(length, 0.12, sl, 0.04), c.m.roof, M(cx, y - drop / 2, cz, ang, rotY, 0), { texM: 2.0, uAxis: 0, flipV: true })
  const cs = Math.cos(rotY)
  const sn = Math.sin(rotY)
  const n = Math.floor(length / 0.25)
  for (let i = 0; i < n; i++) {
    const lx = -length / 2 + (i + 0.5) * (length / n)
    const lz = depth / 2 + 0.03
    c.b.add(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 7, 1), c.m.roof, M(cx + lx * cs + lz * sn, y - drop + 0.02, cz - lx * sn + lz * cs, Math.PI / 2, rotY, 0), {
      tint: '#9aa3b4',
      uv: 'scale',
      uvScale: [0.1, 0.1],
    })
  }
  // 垂木の木口
  woodBox(c, cx + (depth / 2 - 0.05) * sn, y - drop - 0.06, cz + (depth / 2 - 0.05) * cs, length, 0.1, 0.1, { rotY, tint: WOOD.dark })
}

// ------------------------------------------------------------------ 階段

/** 階段：(x,z) から dir（ラジアン、XZ で +X が 0）方向へ上る。 */
export function stairs(c: Ctx, x: number, z: number, y0: number, y1: number, width: number, rotY: number, stone = false): void {
  const rise = y1 - y0
  const n = Math.max(2, Math.round(rise / 0.2))
  const tread = 0.32
  const cs = Math.cos(rotY)
  const sn = -Math.sin(rotY)
  for (let i = 0; i < n; i++) {
    const d = (i + 0.5) * tread
    const top = y0 + (i + 1) * (rise / n)
    const px = x + cs * d
    const pz = z + sn * d
    if (stone) c.b.add(rbox(tread + 0.02, top - y0 + 0.1, width, 0.04), c.m.stoneWall, M(px, (top + y0 - 0.1) / 2, pz, 0, rotY, 0), { texM: 3, tint: '#e8e0d4' })
    else woodBox(c, px, top - 0.05, pz, tread + 0.04, 0.1, width, { rotY, tint: woodTint(c.rng, WOOD.warm) })
  }
  const run = n * tread
  const ang = Math.atan2(rise, run)
  const len = Math.hypot(run, rise)
  c.col.box(x + (cs * run) / 2, y0 + rise / 2 - 0.12, z + (sn * run) / 2, len, 0.2, width, rotY, 0, ang)
}
