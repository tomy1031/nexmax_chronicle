// 1970年 万博の組み立ての道具。素材は 2026年 なんばのマテリアル（頂点カラーで色を付ける）を使い回し、
// Batch に箱・円柱・球を積んでマテリアルごとに 1 メッシュへ結合する。
import * as THREE from 'three'
import { Batch, M, between, rbox } from '../../render/batch'
import type { Rng } from '../../render/noise'
import type { QualitySettings } from '../../render/quality'
import type { ColliderList } from '../../world/colliders'
import type { LightSpot } from '../../world/edo/kit'
import type { NambaMaterials } from '../namba2026/materials'
import type { Rect } from './layout'

export type ECtx = {
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
  /** 旗の布（buildFlags で 1 つのメッシュにまとめる） */
  flags: Array<{ x: number; y: number; z: number; color: THREE.ColorRepresentation }>
}

/** 1970年の万博の色（白い構造に、オレンジ・空色・黄・赤のさし色） */
export const EXPO = {
  white: '#f4f1ea',
  cream: '#efe4cc',
  steel: '#c9ced4',
  silver: '#dfe4ea',
  orange: '#f07a2a',
  red: '#d93a2e',
  yellow: '#f6c434',
  sky: '#3aa6d8',
  teal: '#2bb8a6',
  navy: '#24345e',
  green: '#5f9a3e',
  lawn: '#7aa64a',
  concrete: '#d6d0c4',
  path: '#e2d8c4',
}

export type BoxOpts = {
  rotY?: number
  rotX?: number
  rotZ?: number
  tint?: THREE.ColorRepresentation
  texM?: number
  r?: number
  cast?: boolean
  far?: boolean
  collide?: boolean
}

export function box(c: ECtx, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: THREE.Material, o: BoxOpts = {}): void {
  const r = o.r ?? Math.min(0.02, Math.min(sx, sy, sz) * 0.15)
  ;(o.far ? c.bf : c.b).add(rbox(sx, sy, sz, r), mat, M(cx, cy, cz, o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0), { tint: o.tint ?? '#ffffff', texM: o.texM, cast: o.far ? false : o.cast })
  if (o.collide) c.col.box(cx, cy, cz, sx, sy, sz, o.rotY ?? 0)
}

export function boxAB(c: ECtx, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, o: BoxOpts = {}): void {
  box(c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), mat, o)
}

export function cyl(c: ECtx, x: number, y0: number, y1: number, z: number, r0: number, mat: THREE.Material, o: { r1?: number; tint?: THREE.ColorRepresentation; seg?: number; cast?: boolean; far?: boolean; open?: boolean; collide?: boolean } = {}): void {
  const h = y1 - y0
  ;(o.far ? c.bf : c.b).add(new THREE.CylinderGeometry(o.r1 ?? r0, r0, h, o.seg ?? 14, 1, o.open ?? false), mat, M(x, (y0 + y1) / 2, z), { tint: o.tint ?? '#ffffff', cast: o.far ? false : o.cast })
  if (o.collide) collideCylinder(c, x, y0, y1, z, Math.max(r0, o.r1 ?? r0))
}

/** 円柱の当たり判定（向きをずらした 3 枚の箱で十二角形に近づける） */
export function collideCylinder(c: ECtx, x: number, y0: number, y1: number, z: number, r: number): void {
  const s = r * 2 * 0.93
  for (let k = 0; k < 3; k++) c.col.box(x, (y0 + y1) / 2, z, s, y1 - y0, s, (k * Math.PI) / 6)
}

/** 輪（ドーナツ型の床）：内径 r0・外径 r1・上面 top・厚さ thick。当たり判定は n 枚の箱 */
export function ringFloor(c: ECtx, x: number, z: number, r0: number, r1: number, top: number, thick: number, mat: THREE.Material, tint: THREE.ColorRepresentation, n = 16, collide = true): void {
  const g = new THREE.RingGeometry(r0, r1, 40, 1)
  g.rotateX(-Math.PI / 2)
  c.b.add(g, mat, M(x, top, z), { tint, texM: 2 })
  // 縁と裏
  c.b.add(new THREE.CylinderGeometry(r1, r1, thick, 40, 1, true), mat, M(x, top - thick / 2, z), { tint })
  const under = new THREE.RingGeometry(r0, r1, 40, 1)
  under.rotateX(Math.PI / 2)
  c.b.add(under, mat, M(x, top - thick, z), { tint, cast: true })
  if (!collide) return
  const mid = (r0 + r1) / 2
  const w = r1 - r0
  const len = ((2 * Math.PI * r1) / n) * 1.08
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    c.col.box(x + Math.cos(a) * mid, top - thick / 2, z + Math.sin(a) * mid, w, thick, len, -a)
  }
}

/** 円い手すり（見た目と見えない壁） */
export function ringRail(c: ECtx, x: number, z: number, r: number, y: number, h: number, mat: THREE.Material, tint: THREE.ColorRepresentation, posts = 24, gapFrom = -1, gapTo = -1): void {
  const inGap = (a: number) => gapFrom >= 0 && a >= gapFrom && a <= gapTo
  const t = new THREE.TorusGeometry(r, 0.045, 6, 64)
  t.rotateX(Math.PI / 2)
  c.b.add(t, mat, M(x, y + h, z), { tint, cast: false })
  const t2 = new THREE.TorusGeometry(r, 0.03, 6, 64)
  t2.rotateX(Math.PI / 2)
  c.b.add(t2, mat, M(x, y + h * 0.5, z), { tint, cast: false })
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2
    if (inGap(a)) continue
    c.b.add(new THREE.CylinderGeometry(0.035, 0.035, h, 6), mat, M(x + Math.cos(a) * r, y + h / 2, z + Math.sin(a) * r), { tint, cast: false })
  }
  const n = 20
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2
    const a1 = ((i + 1) / n) * Math.PI * 2
    if (inGap((a0 + a1) / 2)) continue
    c.col.wall(x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, y, y + h + 0.5, 0.2)
  }
}

/** 鉄骨の棒（a→b） */
export function strut(c: ECtx, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, tint: THREE.ColorRepresentation, far = false, seg = 6): void {
  ;(far ? c.bf : c.b).add(new THREE.CylinderGeometry(r, r, 1, seg, 1, true), mat, between(a, b), { tint, cast: !far })
}

/** 格子の鉄塔（4 本柱と、すじかい）。x, z は中心、w は幅、h は高さ */
export function latticeTower(c: ECtx, x: number, z: number, w: number, h: number, mat: THREE.Material, tint: THREE.ColorRepresentation, step = 2.4, taper = 0.25): void {
  const half = (y: number) => (w / 2) * (1 - (taper * y) / h)
  const corner = (i: number, y: number) => {
    const s = half(y)
    const sx = i === 0 || i === 3 ? -1 : 1
    const sz = i < 2 ? -1 : 1
    return new THREE.Vector3(x + sx * s, y, z + sz * s)
  }
  for (let i = 0; i < 4; i++) strut(c, corner(i, 0), corner(i, h), 0.11, mat, tint)
  for (let y = 0; y < h - 0.01; y += step) {
    const y1 = Math.min(h, y + step)
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4
      strut(c, corner(i, y1), corner(j, y1), 0.06, mat, tint)
      strut(c, corner(i, y), corner(j, y1), 0.045, mat, tint)
    }
  }
  collideBox(c, x, z, half(0) * 2, h)
}

function collideBox(c: ECtx, x: number, z: number, w: number, h: number): void {
  c.col.box(x, h / 2, z, w * 0.92, h, w * 0.92)
}

/** 万博の街灯（白い柱に丸い乳白の灯り 3 つ） */
export function expoLamp(c: ECtx, x: number, z: number, h = 5): void {
  cyl(c, x, 0, h, z, 0.09, c.m.paint, { tint: EXPO.white, r1: 0.07, seg: 10 })
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    const px = x + Math.cos(a) * 0.42
    const pz = z + Math.sin(a) * 0.42
    strut(c, new THREE.Vector3(x, h - 0.2, z), new THREE.Vector3(px, h + 0.1, pz), 0.03, c.m.paint, EXPO.white)
    c.b.add(new THREE.SphereGeometry(0.2, 14, 10), c.m.lampGlow, M(px, h + 0.28, pz), { cast: false, tint: '#fffaf0' })
  }
  c.col.box(x, h / 2, z, 0.25, h, 0.25)
  c.lights.push({ pos: new THREE.Vector3(x, h, z), color: '#ffe2b0', intensity: 2.0, dist: 9 })
}

/** 旗のポール（布は buildFlags で全部まとめて 1 つのメッシュにし、小さく揺らす） */
export function flagPole(c: ECtx, x: number, z: number, color: THREE.ColorRepresentation, h = 8): void {
  cyl(c, x, 0, h, z, 0.06, c.m.metal, { tint: EXPO.silver, r1: 0.04, seg: 8 })
  c.flags.push({ x: x + 0.82, y: h - 0.6, z, color })
  c.col.box(x, h / 2, z, 0.2, h, 0.2)
}

/** 旗の布をまとめて 1 つのメッシュにする（頂点カラーで色分け。揺れは毎フレーム頂点を動かす） */
export function buildFlags(c: ECtx): void {
  if (!c.flags.length) return
  const SEG = 8
  const per = (SEG + 1) * 2
  const n = c.flags.length
  const pos = new Float32Array(n * per * 3)
  const col = new Float32Array(n * per * 3)
  const base = new Float32Array(n * per)
  const idx: number[] = []
  const color = new THREE.Color()
  c.flags.forEach((f, k) => {
    color.set(f.color)
    for (let i = 0; i <= SEG; i++)
      for (let j = 0; j < 2; j++) {
        const v = k * per + i * 2 + j
        const bx = (i / SEG) * 1.6
        base[v] = bx
        pos.set([f.x - 0.8 + bx, f.y + (j ? -0.5 : 0.5), f.z], v * 3)
        col.set([color.r, color.g, color.b], v * 3)
      }
    for (let i = 0; i < SEG; i++) {
      const a = k * per + i * 2
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }))
  mesh.castShadow = true
  mesh.frustumCulled = false
  mesh.name = 'expo_flags'
  c.root.add(mesh)
  const P = g.attributes.position as THREE.BufferAttribute
  const ph = c.flags.map(() => c.rng() * 10)
  const z0 = c.flags.map((f) => f.z)
  c.updaters.push((_dt, t) => {
    for (let k = 0; k < n; k++)
      for (let v = k * per; v < (k + 1) * per; v++) {
        const bx = base[v]
        P.setZ(v, z0[k] + Math.sin(t * 3.2 + bx * 2.4 + ph[k]) * 0.12 * bx)
      }
    P.needsUpdate = true
  })
}

/** ベンチ（白い座面の万博のベンチ） */
export function bench(c: ECtx, x: number, z: number, rotY = 0, w = 2.0): void {
  box(c, x, 0.44, z, w, 0.08, 0.5, c.m.plastic, { rotY, tint: EXPO.white, r: 0.03 })
  for (const s of [-1, 1]) {
    const lx = s * (w / 2 - 0.2)
    box(c, x + lx * Math.cos(rotY), 0.2, z - lx * Math.sin(rotY), 0.1, 0.4, 0.42, c.m.paint, { rotY, tint: EXPO.orange })
  }
  c.col.box(x, 0.3, z, w, 0.6, 0.55, rotY)
}

/** 丸く刈った木（クスノキ風：幹と球の葉のかたまり） */
export function roundTree(c: ECtx, x: number, z: number, s = 1): void {
  cyl(c, x, 0, 2.2 * s, z, 0.16 * s, c.m.bark, { tint: '#7a6650', r1: 0.12 * s, seg: 8 })
  const r = c.rng
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + r()
    const rr = (1.0 + r() * 0.5) * s
    c.b.add(new THREE.IcosahedronGeometry(rr, 1), c.m.fabric, M(x + Math.cos(a) * 0.8 * s, (2.8 + r() * 0.9) * s, z + Math.sin(a) * 0.8 * s), { tint: new THREE.Color().setHSL(0.27 + r() * 0.04, 0.42, 0.3 + r() * 0.07) })
  }
  c.b.add(new THREE.IcosahedronGeometry(1.4 * s, 1), c.m.fabric, M(x, 3.8 * s, z), { tint: new THREE.Color().setHSL(0.26, 0.45, 0.34) })
  c.col.box(x, 1.2 * s, z, 0.35 * s, 2.4 * s, 0.35 * s)
}

/** 竹（細い円柱の束。節の輪と、上のほうの葉のかたまり） */
export function bamboo(c: ECtx, x: number, z: number, h: number, lean: number, dir: number, collide = true): void {
  const top = new THREE.Vector3(x + Math.cos(dir) * lean, h, z + Math.sin(dir) * lean)
  const base = new THREE.Vector3(x, 0, z)
  strut(c, base, top, 0.06, c.m.plastic, '#6f9a3a', false, 7)
  for (let y = 0.9; y < h - 0.5; y += 0.9) {
    const p = base.clone().lerp(top, y / h)
    c.b.add(new THREE.TorusGeometry(0.062, 0.012, 4, 8), c.m.plastic, M(p.x, p.y, p.z, Math.PI / 2, 0, 0), { tint: '#9cba5a', cast: false })
  }
  for (let k = 0; k < 3; k++) {
    const p = base.clone().lerp(top, 0.7 + k * 0.12)
    c.b.add(new THREE.IcosahedronGeometry(0.7 + c.rng() * 0.3, 0), c.m.fabric, M(p.x + (c.rng() - 0.5), p.y, p.z + (c.rng() - 0.5), 0, c.rng() * 3, 0, 1, 0.45, 1), { tint: new THREE.Color().setHSL(0.24 + c.rng() * 0.04, 0.45, 0.36), cast: false })
  }
  if (collide) c.col.box(x, 1.5, z, 0.16, 3, 0.16)
}

/** 石灯籠 */
export function stoneLantern(c: ECtx, x: number, y: number, z: number, s = 1): void {
  const st = c.m.stone
  const t = '#b8b2a6'
  box(c, x, y + 0.12 * s, z, 0.7 * s, 0.24 * s, 0.7 * s, st, { tint: t, texM: 1 })
  cyl(c, x, y + 0.24 * s, y + 0.95 * s, z, 0.13 * s, st, { tint: t, seg: 8 })
  box(c, x, y + 1.05 * s, z, 0.55 * s, 0.2 * s, 0.55 * s, st, { tint: t, texM: 1 })
  box(c, x, y + 1.3 * s, z, 0.4 * s, 0.3 * s, 0.4 * s, c.m.lampGlow, { tint: '#fff2d0' })
  c.b.add(new THREE.ConeGeometry(0.5 * s, 0.35 * s, 4), st, M(x, y + 1.62 * s, z, 0, Math.PI / 4, 0), { tint: t })
  c.b.add(new THREE.SphereGeometry(0.08 * s, 8, 6), st, M(x, y + 1.86 * s, z), { tint: t })
  c.col.box(x, y + 0.9 * s, z, 0.6 * s, 1.8 * s, 0.6 * s)
}

/** 池の縁（石）と底（見た目だけ。当たり判定は床に穴を空けて落ちるようにする） */
export function pondEdge(c: ECtx, r: Rect, bottom = -1.6): void {
  const t = '#a9a296'
  const e = 0.5
  boxAB(c, r.x0 - e, r.x1 + e, -0.05, 0.12, r.z0 - e, r.z0, c.m.stone, { tint: t, texM: 1.5 })
  boxAB(c, r.x0 - e, r.x1 + e, -0.05, 0.12, r.z1, r.z1 + e, c.m.stone, { tint: t, texM: 1.5 })
  boxAB(c, r.x0 - e, r.x0, -0.05, 0.12, r.z0, r.z1, c.m.stone, { tint: t, texM: 1.5 })
  boxAB(c, r.x1, r.x1 + e, -0.05, 0.12, r.z0, r.z1, c.m.stone, { tint: t, texM: 1.5 })
  // 内側の壁と底
  boxAB(c, r.x0, r.x1, bottom - 0.2, bottom, r.z0, r.z1, c.m.concrete, { tint: '#3c4a3a' })
  boxAB(c, r.x0, r.x1, bottom, 0, r.z0, r.z0 + 0.05, c.m.concrete, { tint: '#56604e' })
  boxAB(c, r.x0, r.x1, bottom, 0, r.z1 - 0.05, r.z1, c.m.concrete, { tint: '#56604e' })
  boxAB(c, r.x0, r.x0 + 0.05, bottom, 0, r.z0, r.z1, c.m.concrete, { tint: '#56604e' })
  boxAB(c, r.x1 - 0.05, r.x1, bottom, 0, r.z0, r.z1, c.m.concrete, { tint: '#56604e' })
}

/** 範囲を、穴（池）を空けた長方形に分ける（x と z の区切りで格子に分け、穴の中の升だけ抜き、縦に続く升はまとめる） */
export function cellsWithHoles(bounds: Rect, holes: Rect[]): Rect[] {
  const xs = new Set<number>([bounds.x0, bounds.x1])
  const zs = new Set<number>([bounds.z0, bounds.z1])
  for (const h of holes) {
    xs.add(h.x0)
    xs.add(h.x1)
    zs.add(h.z0)
    zs.add(h.z1)
  }
  const X = [...xs].filter((x) => x >= bounds.x0 && x <= bounds.x1).sort((a, b) => a - b)
  const Z = [...zs].filter((z) => z >= bounds.z0 && z <= bounds.z1).sort((a, b) => a - b)
  const out: Rect[] = []
  for (let i = 0; i < X.length - 1; i++) {
    const cx = (X[i] + X[i + 1]) / 2
    let start = -1
    for (let j = 0; j <= Z.length - 1; j++) {
      const ok = j < Z.length - 1 && !holes.some((h) => cx > h.x0 && cx < h.x1 && (Z[j] + Z[j + 1]) / 2 > h.z0 && (Z[j] + Z[j + 1]) / 2 < h.z1)
      if (ok && start < 0) start = j
      if (!ok && start >= 0) {
        out.push({ x0: X[i], x1: X[i + 1], z0: Z[start], z1: Z[j] })
        start = -1
      }
    }
  }
  return out
}

/** 床の当たり判定を、穴（池）を空けて並べる */
export function floorWithHoles(c: ECtx, bounds: Rect, holes: Rect[], top = 0): void {
  for (const r of cellsWithHoles(bounds, holes)) c.col.floor(r.x0, r.x1, r.z0, r.z1, top, 2)
}

/** 遠景の建物（影なし） */
export function farDome(c: ECtx, x: number, z: number, r: number, tint: THREE.ColorRepresentation, flat = 0.55): void {
  c.bf.add(new THREE.SphereGeometry(r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), c.m.paint, M(x, 0, z, 0, 0, 0, 1, flat, 1), { tint })
}
