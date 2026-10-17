// 中景・遠景：朱の太鼓橋、鳥居、段々の町並み、五重塔、水車、大坂城風の城、浮島、遠い山並み。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import { mulberry32, noise3, range } from '../../render/noise'
import { WOOD, woodBox, woodTint, orientAB, post, lantern, type Ctx } from './kit'
import { createFallMaterial, fallSheet } from './water'
import type { Foliage } from './nature'

// ------------------------------------------------------------------ 太鼓橋

/** X 位置 x で Z 方向に z0→z1 を渡る朱塗りの太鼓橋（両端の高さ y0,y1） */
export function archBridge(c: Ctx, x: number, z0: number, z1: number, y0: number, y1: number, rise: number, width: number, o: { piersTo?: number; lanterns?: boolean; collider?: boolean } = {}): void {
  const N = 18
  const baseY = Math.min(y0, y1)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= N; i++) {
    const t = i / N
    pts.push(new THREE.Vector3(x, y0 + (y1 - y0) * t + rise * Math.sin(Math.PI * t), z0 + (z1 - z0) * t))
  }
  const deckT = () => woodTint(c.rng, WOOD.warm, 0.1)
  for (let i = 0; i < N; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const len = a.distanceTo(b) + 0.02
    // 床板（幅方向に数枚）
    c.b.add(rbox(width, len, 0.14, 0.03), c.m.wood, orientAB(a.clone().add(new THREE.Vector3(0, -0.07, 0)), b.clone().add(new THREE.Vector3(0, -0.07, 0))), { tint: deckT(), texM: 1.6, uAxis: 1 })
    // 側面の朱の桁
    for (const s of [-1, 1]) {
      const off = new THREE.Vector3(s * (width / 2 + 0.06), -0.28, 0)
      c.b.add(rbox(0.14, len, 0.42, 0.03), c.m.lacquerRed, orientAB(a.clone().add(off), b.clone().add(off)), { tint: '#ffffff' })
      // 欄干の手すり
      const ro = new THREE.Vector3(s * (width / 2 - 0.02), 0.95, 0)
      c.b.add(rbox(0.12, len, 0.1, 0.03), c.m.lacquerRed, orientAB(a.clone().add(ro), b.clone().add(ro)), { tint: '#ffffff' })
      const ro2 = new THREE.Vector3(s * (width / 2 - 0.02), 0.45, 0)
      c.b.add(rbox(0.08, len, 0.07, 0.02), c.m.lacquerRed, orientAB(a.clone().add(ro2), b.clone().add(ro2)), { tint: '#ffffff' })
    }
    if (o.collider ?? true) {
      const dy = b.y - a.y
      const dz = b.z - a.z
      c.col.box(x, (a.y + b.y) / 2 - 0.15, (a.z + b.z) / 2, width, 0.3, Math.hypot(dy, dz) + 0.05, 0, -Math.atan2(dy, dz), 0)
    }
  }
  // 親柱と擬宝珠
  for (let i = 0; i <= N; i += 3) {
    for (const s of [-1, 1]) {
      const p = pts[i]
      const px = x + s * (width / 2 - 0.02)
      woodBox(c, px, p.y + 0.5, p.z, 0.16, 1.1, 0.16, { mat: c.m.lacquerRed, tint: '#ffffff' })
      c.b.add(new THREE.SphereGeometry(0.1, 12, 8), c.m.gold, M(px, p.y + 1.17, p.z, 0, 0, 0, 1, 1.3, 1))
      c.b.add(new THREE.CylinderGeometry(0.09, 0.1, 0.07, 12), c.m.gold, M(px, p.y + 1.07, p.z))
      if (o.lanterns && (i === 3 || i === N - 3)) lantern(c, px, p.y + 1.6, p.z, { kind: 'red', cord: 0.1, s: 0.9 })
    }
  }
  if (o.collider ?? true) {
    c.col.box(x - width / 2 - 0.05, baseY + rise / 2 + 0.6, (z0 + z1) / 2, 0.15, rise + 1.6, Math.abs(z1 - z0))
    c.col.box(x + width / 2 + 0.05, baseY + rise / 2 + 0.6, (z0 + z1) / 2, 0.15, rise + 1.6, Math.abs(z1 - z0))
  }
  // 橋脚
  const bottom = o.piersTo ?? -1.6
  for (const t of [0.22, 0.5, 0.78]) {
    const p = pts[Math.round(t * N)]
    for (const s of [-1, 1]) {
      post(c, x + s * (width / 2 - 0.1), p.z, bottom, p.y - 0.35, 0.3, undefined, c.m.lacquerRed)
    }
    woodBox(c, x, p.y - 0.42, p.z, width + 0.5, 0.24, 0.3, { mat: c.m.lacquerRed, tint: '#ffffff' })
    woodBox(c, x, (bottom + p.y) / 2, p.z, width, 0.18, 0.2, { mat: c.m.lacquerRed, tint: '#ffffff' })
  }
}

// ------------------------------------------------------------------ 鳥居

export function torii(c: Ctx, x: number, y: number, z: number, rotY: number, s = 1): void {
  const cs = Math.cos(rotY)
  const sn = -Math.sin(rotY)
  const W = (lx: number) => [x + cs * lx, z + sn * lx] as const
  for (const e of [-1, 1]) {
    const [px, pz] = W(e * 2.0 * s)
    c.b.add(new THREE.CylinderGeometry(0.22 * s, 0.26 * s, 5.2 * s, 14), c.m.lacquerRed, M(px, y + 2.6 * s, pz, 0, 0, e * 0.03), { tint: '#ffffff' })
    c.b.add(new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.5 * s, 14), c.m.darkLacquer, M(px, y + 0.25 * s, pz))
  }
  const [mx, mz] = W(0)
  woodBox(c, mx, y + 4.1 * s, mz, 5.0 * s, 0.32 * s, 0.26 * s, { rotY, mat: c.m.lacquerRed, tint: '#ffffff' })
  woodBox(c, mx, y + 4.65 * s, mz, 0.3 * s, 0.8 * s, 0.22 * s, { rotY, mat: c.m.lacquerRed, tint: '#ffffff' })
  // 笠木（反り）
  for (const e of [-1, 0, 1]) {
    const [px, pz] = W(e * 2.1 * s)
    const len = e === 0 ? 2.6 * s : 2.1 * s
    woodBox(c, px, y + 5.15 * s + Math.abs(e) * 0.14 * s, pz, len, 0.36 * s, 0.4 * s, { rotY, rotZ: e * -0.1, mat: c.m.lacquerRed, tint: '#ffffff' })
    woodBox(c, px, y + 5.42 * s + Math.abs(e) * 0.2 * s, pz, len + 0.1, 0.2 * s, 0.48 * s, { rotY, rotZ: e * -0.13, mat: c.m.darkLacquer, tint: '#ffffff' })
  }
}

// ------------------------------------------------------------------ 簡易な家（遠景用）

const FAR_PLASTER = ['#f4eadb', '#efe2c8', '#e9d7b6', '#f8f2e8', '#dfcca8', '#f1e4d2']
const FAR_ROOF = ['#e8ecf4', '#ccd3df', '#b3bccb', '#dcd6cd', '#a3adbd', '#c2c0c8']

/**
 * 遠景の家。形をばらす：切妻の平屋／2 階建て（1 階に庇）／寄棟／土蔵／寺の大屋根。
 * 漆喰・瓦の色、屋根の勾配、高さ、わずかな向きのずれも家ごとに変える。
 */
export function farHouse(c: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, rot: number, rng: () => number): void {
  rot += range(rng, -0.05, 0.05)
  const kind = rng()
  const plaster = new THREE.Color(FAR_PLASTER[Math.floor(rng() * FAR_PLASTER.length)]).multiplyScalar(range(rng, 0.9, 1.04))
  const roofTint = new THREE.Color(FAR_ROOF[Math.floor(rng() * FAR_ROOF.length)]).multiplyScalar(range(rng, 0.92, 1.05))
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  const at = (lx: number, ly: number, lz: number, rx = 0) => M(x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs, rx, rot, 0)
  const gable = (gw: number, gd: number, baseY: number, pitch: number, tint: THREE.Color) => {
    const rise = gd * pitch
    const ang = Math.atan2(rise, gd / 2 + 0.4)
    const sl = Math.hypot(gd / 2 + 0.5, rise)
    for (const sd of [-1, 1]) {
      const lz = (sd * (gd / 2 + 0.5)) / 2
      c.b.add(rbox(gw + 0.7, 0.16, sl, 0), c.m.roof, at(0, baseY + rise / 2, lz, sd * ang), { texM: 2, uAxis: 0, flipV: sd > 0, tint })
    }
    c.b.add(rbox(gw + 0.8, 0.22, 0.32, 0), c.m.roof, at(0, baseY + rise + 0.05, 0), { texM: 1, tint: new THREE.Color('#9aa2b2').multiply(tint) })
  }
  const pent = (pw: number, pd: number, py: number, tint: THREE.Color) => {
    // 1 階の庇（長辺の両側）
    for (const sd of [-1, 1]) c.b.add(rbox(pw + 0.4, 0.12, 0.9, 0), c.m.roof, at(0, py, sd * (pd / 2 + 0.35), sd * 0.38), { texM: 2, uAxis: 0, tint })
  }
  if (kind < 0.42) {
    // 切妻の町家（平屋〜つし 2 階）
    c.b.add(rbox(w, h, d, 0), c.m.plaster, at(0, h / 2, 0), { tint: plaster, texM: 3 })
    c.b.add(rbox(w + 0.04, h * 0.45, d + 0.04, 0), c.m.wood, at(0, h * 0.22, 0), { tint: woodTint(c.rng, WOOD.aged), texM: 1.6 })
    gable(w, d, h, range(rng, 0.26, 0.4), roofTint)
  } else if (kind < 0.7) {
    // 2 階建て：1 階は木の格子、庇、2 階は少し小さく白壁
    const h1 = h * 0.5
    c.b.add(rbox(w + 0.04, h1, d + 0.04, 0), c.m.wood, at(0, h1 / 2, 0), { tint: woodTint(c.rng, WOOD.dark), texM: 1.6 })
    pent(w, d, h1 + 0.25, roofTint)
    const h2 = h * range(rng, 0.85, 1.25) - h1
    c.b.add(rbox(w - 0.3, h2, d - 1.0, 0), c.m.plaster, at(0, h1 + h2 / 2, 0), { tint: plaster, texM: 3 })
    gable(w - 0.3, d - 1.0, h1 + h2, range(rng, 0.3, 0.42), roofTint)
  } else if (kind < 0.86) {
    // 寄棟
    c.b.add(rbox(w, h, d, 0), c.m.plaster, at(0, h / 2, 0), { tint: plaster, texM: 3 })
    c.b.add(rbox(w + 0.04, h * 0.4, d + 0.04, 0), c.m.wood, at(0, h * 0.2, 0), { tint: woodTint(c.rng, WOOD.aged), texM: 1.6 })
    c.b.add(sweptRoof(w, d, Math.min(w, d) * range(rng, 0.45, 0.6), { over: 0.5, lift: 0.12, rings: 3, texM: 2, lip: 0.14 }), c.m.roof, at(0, h, 0), { tint: roofTint })
  } else if (kind < 0.96) {
    // 土蔵：白壁・なまこ壁の腰・急な切妻
    const kw = Math.min(w, 5)
    c.b.add(rbox(kw, h * 1.05, d * 0.8, 0), c.m.plaster, at(0, (h * 1.05) / 2, 0), { tint: '#fbf7ef', texM: 3 })
    c.b.add(rbox(kw + 0.06, 1.2, d * 0.8 + 0.06, 0), c.m.roof, at(0, 0.6, 0), { tint: '#7d8696', texM: 1 })
    c.b.add(rbox(0.8, 0.7, 0.1, 0), c.m.darkLacquer, at(0, h * 0.75, -(d * 0.4) - 0.04))
    gable(kw, d * 0.8, h * 1.05, 0.42, new THREE.Color('#b9c1cf'))
  } else {
    // 寺の大屋根（反りの強い寄棟）
    const tw = w * 1.4
    const td = d * 1.3
    c.b.add(rbox(tw, h * 0.9, td, 0), c.m.wood, at(0, (h * 0.9) / 2, 0), { tint: woodTint(c.rng, WOOD.dark), texM: 1.6 })
    c.b.add(rbox(tw - 0.6, h * 0.5, td + 0.05, 0), c.m.plaster, at(0, h * 0.6, 0), { tint: '#f6efe2', texM: 3 })
    c.b.add(sweptRoof(tw, td, Math.min(tw, td) * 0.85, { over: 1.4, lift: 0.6, rings: 4, texM: 2, curve: 1.7 }), c.m.roof, at(0, h * 0.9, 0), { tint: '#8f99aa' })
  }
  if (rng() < 0.3) lantern(c, x - sn * (d / 2 + 0.6), y + h * 0.42, z - cs * (d / 2 + 0.6), { kind: rng() < 0.5 ? 'red' : 'cream', cord: 0.1, light: false, low: true })
}

/** 段々の擁壁（石垣）付きの台地 */
export function terrace(c: Ctx, x0: number, x1: number, z0: number, z1: number, top: number, bottom = -2, grassTop = false): void {
  c.b.add(rbox(x1 - x0, top - bottom, z1 - z0, 0.15), c.m.stoneWall, M((x0 + x1) / 2, (top + bottom) / 2, (z0 + z1) / 2), { texM: 3.5, tint: '#f0e9df' })
  if (grassTop) c.b.add(rbox(x1 - x0 - 0.3, 0.2, z1 - z0 - 0.3, 0.08), c.m.grass, M((x0 + x1) / 2, top + 0.08, (z0 + z1) / 2), { texM: 4 })
  else c.b.add(rbox(x1 - x0 - 0.2, 0.12, z1 - z0 - 0.2, 0.04), c.m.paving, M((x0 + x1) / 2, top + 0.03, (z0 + z1) / 2), { texM: 4, tint: '#ead9c4' })
}

// ------------------------------------------------------------------ 五重塔

export function pagoda(c: Ctx, x: number, y: number, z: number, s = 1): void {
  let yy = y
  for (let i = 0; i < 5; i++) {
    const w = (5.2 - i * 0.55) * s
    const h = 2.4 * s
    c.b.add(rbox(w * 0.62, h, w * 0.62, 0.05), c.m.lacquerRed, M(x, yy + h / 2, z), { tint: '#ffe0d0' })
    c.b.add(rbox(w * 0.62 + 0.04, h * 0.5, w * 0.62 + 0.04, 0.02), c.m.plaster, M(x, yy + h * 0.55, z), { texM: 3 })
    const roofY = yy + h
    const g = new THREE.CylinderGeometry(w * 0.3, w * 0.78, 0.9 * s, 4, 1)
    c.b.add(g, c.m.roof, M(x, roofY + 0.3 * s, z, 0, Math.PI / 4, 0), { tint: '#bfc6d4', texM: 2 })
    yy = roofY + 0.4 * s
  }
  c.b.add(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, 5 * s, 8), c.m.gold, M(x, yy + 2.5 * s, z))
  for (let k = 0; k < 6; k++) c.b.add(new THREE.TorusGeometry(0.4 * s, 0.06 * s, 6, 12), c.m.gold, M(x, yy + 0.8 * s + k * 0.55 * s, z, Math.PI / 2, 0, 0))
}

// ------------------------------------------------------------------ 反りのある屋根（城・櫓用）

type RoofOpts = {
  /** 軒の出 */
  over?: number
  /** 隅の反り上がり（m） */
  lift?: number
  /** 隅の外への張り出し（割合） */
  flare?: number
  /** 勾配の曲がり（>1 で軒先がゆるく棟へ向けて急になる） */
  curve?: number
  rings?: number
  texM?: number
  /** 軒先の厚み（鼻隠し） */
  lip?: number
}

/**
 * 寄棟（隅に反りのある日本の屋根）。原点＝壁の上端中央、+Y 上。w×d は壁の外寸、H は（隠れる分も含めた）棟までの高さ。
 * 4 面を別々の格子で作るので、隅棟は鋭く、面の中はなめらか。
 */
export function sweptRoof(w: number, d: number, H: number, o: RoofOpts = {}): THREE.BufferGeometry {
  const over = o.over ?? 1.2
  const lift = o.lift ?? 0.5
  const flare = o.flare ?? 0.05
  const curve = o.curve ?? 1.45
  const rings = o.rings ?? 7
  const texM = o.texM ?? 2
  const lip = o.lip ?? 0.25
  const a = w / 2 + over
  const b = d / 2 + over
  const m = Math.min(a, b) - 0.06
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  // 角 0..3 を反時計回り（上から見て）
  const corners: Array<[number, number]> = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ]
  const point = (ux: number, uz: number, t: number): [number, number, number] => {
    const hx = a - t * m
    const hz = b - t * m
    const cf = Math.pow(Math.min(Math.abs(ux), Math.abs(uz)), 3)
    const k = 1 + flare * cf * (1 - t) * (1 - t)
    const y = H * Math.pow(t, curve) + lift * cf * Math.pow(1 - t, 2.5)
    return [ux * hx * k, y, uz * hz * k]
  }
  for (let s = 0; s < 4; s++) {
    const [x0, z0] = corners[s]
    const [x1, z1] = corners[(s + 1) % 4]
    const sideLen = Math.hypot((x1 - x0) * a, (z1 - z0) * b)
    const ns = Math.max(4, Math.round(sideLen / 2.2))
    const base = pos.length / 3
    for (let j = 0; j <= rings; j++) {
      const t = j / rings
      for (let i = 0; i <= ns; i++) {
        const f = i / ns
        const ux = x0 + (x1 - x0) * f
        const uz = z0 + (z1 - z0) * f
        const p = point(ux, uz, t)
        pos.push(p[0], p[1], p[2])
        uv.push((f * sideLen * (1 - t * 0.5)) / texM, (t * Math.hypot(m, H)) / texM)
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < ns; i++) {
        const p0 = base + j * (ns + 1) + i
        const p1 = p0 + 1
        const p2 = p0 + ns + 1
        const p3 = p2 + 1
        idx.push(p0, p3, p1, p0, p2, p3)
      }
    }
    // 軒先の鼻隠し（下へ lip）と軒裏
    const lb = pos.length / 3
    for (let i = 0; i <= ns; i++) {
      const f = i / ns
      const ux = x0 + (x1 - x0) * f
      const uz = z0 + (z1 - z0) * f
      const p = point(ux, uz, 0)
      const q = point(ux, uz, 0.18)
      pos.push(p[0], p[1], p[2], p[0], p[1] - lip, p[2], q[0] * 0.98, p[1] - lip * 0.6, q[2] * 0.98)
      uv.push((f * sideLen) / texM, 0, (f * sideLen) / texM, 0.05, (f * sideLen) / texM, 0.1)
    }
    for (let i = 0; i < ns; i++) {
      const p0 = lb + i * 3
      const p1 = p0 + 3
      idx.push(p0, p1 + 1, p0 + 1, p0, p1, p1 + 1)
      idx.push(p0 + 1, p1 + 2, p0 + 2, p0 + 1, p1 + 1, p1 + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** sweptRoof の軒先の線（金の縁取り用の閉じた管）。dy は軒先からの高さのずれ。 */
export function sweptEaveTube(w: number, d: number, o: RoofOpts = {}, radius = 0.09, dy = -0.05): THREE.BufferGeometry {
  const over = o.over ?? 1.2
  const lift = o.lift ?? 0.5
  const flare = o.flare ?? 0.05
  const a = w / 2 + over
  const b = d / 2 + over
  const corners: Array<[number, number]> = [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ]
  const pts: THREE.Vector3[] = []
  for (let s = 0; s < 4; s++) {
    const [x0, z0] = corners[s]
    const [x1, z1] = corners[(s + 1) % 4]
    const n = 14
    for (let i = 0; i < n; i++) {
      const f = i / n
      const ux = x0 + (x1 - x0) * f
      const uz = z0 + (z1 - z0) * f
      const cf = Math.pow(Math.min(Math.abs(ux), Math.abs(uz)), 3)
      const k = 1 + flare * cf
      pts.push(new THREE.Vector3(ux * a * k, lift * cf + dy, uz * b * k))
    }
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.1), 112, radius, 4, true)
}

/** 屋根の t（軒=0、棟=1）での高さ（sweptRoof と同じ式・隅以外） */
function roofHeightAt(H: number, t: number, curve = 1.45): number {
  return H * Math.pow(Math.max(0, t), curve)
}

/**
 * 千鳥破風：屋根面から外へ突き出す小さな切妻（三角の白い妻面＋反った二枚の屋根）。
 * 原点＝妻面の下辺中央、+Z が外向き。w=幅、h=妻の高さ、depth=奥行き。
 */
function gableDormer(w: number, h: number, depth: number, lift = 0.25): { roof: THREE.BufferGeometry; face: THREE.BufferGeometry; trim: THREE.BufferGeometry } {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const nAcross = 5
  const nAlong = 3
  for (const side of [-1, 1]) {
    const base = pos.length / 3
    for (let j = 0; j <= nAlong; j++) {
      const zz = depth * (j / nAlong) - depth + 0.35
      for (let i = 0; i <= nAcross; i++) {
        const t = i / nAcross // 0=棟、1=軒
        const xx = side * (w / 2 + 0.35) * t
        const front = j / nAlong
        const y = h * (1 - Math.pow(t, 0.8)) + lift * Math.pow(t, 3) * front + 0.05
        pos.push(xx, y, zz)
        uv.push(t * 1.5, front * 1.5)
      }
    }
    for (let j = 0; j < nAlong; j++) {
      for (let i = 0; i < nAcross; i++) {
        const p0 = base + j * (nAcross + 1) + i
        const p1 = p0 + 1
        const p2 = p0 + nAcross + 1
        const p3 = p2 + 1
        if (side > 0) idx.push(p0, p3, p1, p0, p2, p3)
        else idx.push(p0, p1, p3, p0, p3, p2)
      }
    }
  }
  const roof = new THREE.BufferGeometry()
  roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  roof.setIndex(idx)
  roof.computeVertexNormals()
  const tri = new THREE.Shape()
  tri.moveTo(-w / 2, 0)
  tri.lineTo(w / 2, 0)
  tri.lineTo(0, h * 0.94)
  tri.closePath()
  const face = new THREE.ShapeGeometry(tri)
  // 金の破風板（妻の二辺）
  const trimPts = [new THREE.Vector3(-w / 2 - 0.3, 0.05 + lift, 0.4), new THREE.Vector3(0, h + 0.05, 0.4), new THREE.Vector3(w / 2 + 0.3, 0.05 + lift, 0.4)]
  const trim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trimPts, false, 'catmullrom', 0.2), 12, 0.09, 5)
  return { roof, face, trim }
}

/** 唐破風：中央が丸く盛り上がり両端が反る波形の破風。原点＝下辺中央、+Z 外向き。 */
function karaHafu(w: number, h: number, depth: number): { roof: THREE.BufferGeometry; face: THREE.BufferGeometry; trim: THREE.BufferGeometry } {
  const curveY = (u: number) => {
    // u: -1..1
    const au = Math.abs(u)
    const bell = Math.pow(Math.cos((Math.min(au, 1) * Math.PI) / 2), 1.6)
    return h * bell + 0.35 * Math.pow(au, 6)
  }
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const nu = 16
  const nz = 3
  for (let j = 0; j <= nz; j++) {
    const zz = -depth + (depth + 0.4) * (j / nz)
    for (let i = 0; i <= nu; i++) {
      const u = -1 + (2 * i) / nu
      pos.push((u * (w + 0.6)) / 2, curveY(u) + 0.08, zz)
      uv.push(i / 4, j / 2)
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nu; i++) {
      const p0 = j * (nu + 1) + i
      const p1 = p0 + 1
      const p2 = p0 + nu + 1
      const p3 = p2 + 1
      idx.push(p0, p3, p1, p0, p2, p3)
    }
  }
  const roof = new THREE.BufferGeometry()
  roof.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  roof.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  roof.setIndex(idx)
  roof.computeVertexNormals()
  const sh = new THREE.Shape()
  sh.moveTo(-w / 2, 0)
  for (let i = 0; i <= nu; i++) {
    const u = -1 + (2 * i) / nu
    sh.lineTo((u * w) / 2, Math.max(0, curveY(u) - 0.05))
  }
  sh.lineTo(w / 2, 0)
  sh.closePath()
  const face = new THREE.ShapeGeometry(sh)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= nu; i++) {
    const u = -1 + (2 * i) / nu
    pts.push(new THREE.Vector3((u * (w + 0.6)) / 2, curveY(u) + 0.05, 0.42))
  }
  const trim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.09, 5)
  return { roof, face, trim }
}

/** 金の鯱（頭を下に、尾を反り上げた魚）。原点＝腹の下、+X が頭の向き。 */
function addShachi(c: Ctx, mat4: THREE.Matrix4, s: number): void {
  const pts: Array<[number, number, number]> = [
    [0.55, 0.35, 0.34],
    [0.25, 0.55, 0.42],
    [-0.1, 0.8, 0.36],
    [-0.3, 1.1, 0.28],
    [-0.38, 1.4, 0.2],
    [-0.3, 1.66, 0.15],
  ]
  for (const [px, py, r] of pts) {
    c.b.add(new THREE.SphereGeometry(1, 10, 7), c.m.gold, new THREE.Matrix4().multiplyMatrices(mat4, M(px * s, py * s, 0, 0, 0, 0, r * s, r * s, r * s * 0.8)), { cast: false })
  }
  // 尾びれ
  c.b.add(new THREE.ConeGeometry(0.3 * s, 0.5 * s, 4), c.m.gold, new THREE.Matrix4().multiplyMatrices(mat4, M(-0.12 * s, 1.85 * s, 0, 0, 0, 0.7, 1, 1, 0.35)), { cast: false })
}

// ------------------------------------------------------------------ 城

export function castle(c: Ctx, x: number, y: number, z: number, f: Foliage): void {
  const rng = mulberry32(404)
  const rot = -0.35
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  /** 城のローカル（X=幅、Z=奥行き）→ ワールド行列 */
  const L = (lx: number, ly: number, lz: number, ry = 0, rx = 0, sx = 1, sy = sx, sz = sx) => M(x + lx * cs + lz * sn, y + ly, z - lx * sn + lz * cs, rx, rot + ry, 0, sx, sy, sz)
  // 丘
  const hill = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.01, 34),
      new THREE.Vector2(26, 33),
      new THREE.Vector2(40, 26),
      new THREE.Vector2(55, 14),
      new THREE.Vector2(72, 4),
      new THREE.Vector2(90, -1),
    ],
    28,
  )
  displace(hill, 3.5, 0.06)
  c.b.add(hill, c.m.grass, M(x, y, z), { tint: '#c7d98f', uv: 'scale', uvScale: [6, 6] })
  for (let i = 0; i < 70; i++) {
    const a = range(rng, 0, Math.PI * 2)
    const r = range(rng, 28, 70)
    const hh = 34 - Math.max(0, (r - 26) / 46) * 32
    if (rng() < 0.3) f.cherry(x + Math.cos(a) * r, y + hh - 1, z + Math.sin(a) * r, range(rng, 1.4, 2.0), 900 + i, 0.4)
    else f.bush(x + Math.cos(a) * r, y + hh - 1, z + Math.sin(a) * r, range(rng, 1.6, 2.6), 300 + i, 1.3)
  }
  // 石垣：扇の勾配（下ほど開く反りのある四角錐台）
  const top0 = y + 33
  const ishigaki = (w0: number, w1: number, h: number, yy: number, tint: string) => {
    const prof: THREE.Vector2[] = []
    for (let i = 0; i <= 6; i++) {
      const t = i / 6
      prof.push(new THREE.Vector2((w1 + (w0 - w1) * Math.pow(1 - t, 2.2)) / Math.SQRT2, h * t))
    }
    prof.push(new THREE.Vector2(0.01, h))
    const g = new THREE.LatheGeometry(prof, 4)
    g.rotateY(Math.PI / 4)
    const ng = g.toNonIndexed()
    ng.computeVertexNormals()
    c.b.add(ng, c.m.stoneWall, L(0, yy - y, 0), { tint, uv: 'scale', uvScale: [(w0 * 4) / 2.6, h / 1.6] })
  }
  ishigaki(50, 42, 7, top0, '#a29d96')
  ishigaki(32, 27, 7.5, top0 + 7, '#aaa59e')
  // 外周の白い塀（小さな瓦屋根）と隅櫓
  const wallTop = top0 + 7
  for (const [lx, lz, len, ry] of [
    [0, 20.6, 41, 0],
    [0, -20.6, 41, 0],
    [20.6, 0, 41, Math.PI / 2],
    [-20.6, 0, 41, Math.PI / 2],
  ] as const) {
    c.b.add(rbox(len, 1.6, 0.6, 0), c.m.castleWhite, L(lx, wallTop - y + 0.8, lz, ry), { texM: 4 })
    c.b.add(rbox(len + 0.3, 0.35, 1.3, 0), c.m.castleRoof, L(lx, wallTop - y + 1.75, lz, ry), { texM: 2, tint: '#5f7f84' })
  }
  for (const [lx, lz] of [
    [18.5, 18.5],
    [-18.5, 18.5],
    [18.5, -18.5],
  ] as const) {
    const by = wallTop - y
    c.b.add(rbox(7, 4.2, 6, 0), c.m.castleWhite, L(lx, by + 2.1, lz), { texM: 4 })
    c.b.add(sweptRoof(7, 6, 5.5, { over: 1.4, lift: 0.5, texM: 2.5 }), c.m.castleRoof, L(lx, by + 4.2, lz), { tint: '#6f9196' })
    c.b.add(rbox(4.6, 3.0, 3.8, 0), c.m.castleWhite, L(lx, by + 6.0, lz), { texM: 4 })
    c.b.add(sweptRoof(4.6, 3.8, 3.4, { over: 1.0, lift: 0.4, texM: 2 }), c.m.castleRoof, L(lx, by + 7.5, lz), { tint: '#6f9196' })
    c.b.add(new THREE.SphereGeometry(0.25, 8, 6), c.m.gold, L(lx, by + 7.5 + 3.4 * 0.62, lz), { cast: false })
    for (const sd of [-1, 1]) c.b.add(rbox(1.0, 0.9, 0.1, 0), c.m.darkLacquer, L(lx + sd * 1.6, by + 2.4, lz - 3.02))
  }
  // 天守：白壁＋反りのある寄棟を重ね、千鳥破風・唐破風・金の縁・最上階は黒漆に金
  let yy = top0 + 14.5 - y
  const tiers: Array<[number, number, number]> = [
    [23, 19, 5.4],
    [18.5, 15, 4.6],
    [14.5, 11.8, 4.2],
    [11.2, 9.2, 3.8],
    [8.4, 7.0, 3.7],
  ]
  for (let i = 0; i < tiers.length; i++) {
    const [w, d, h] = tiers[i]
    const top = i === tiers.length - 1
    const wallMat = top ? c.m.darkLacquer : c.m.castleWhite
    c.b.add(rbox(w, h, d, 0.08), wallMat, L(0, yy + h / 2, 0), { texM: 4, tint: top ? '#2a2420' : '#ffffff' })
    // 窓（格子窓の暗い開口）
    const nwin = Math.max(2, Math.floor(w / 2.6))
    for (let k = 0; k < nwin; k++) {
      const lx = -w / 2 + ((k + 0.5) * w) / nwin
      for (const sd of [-1, 1]) c.b.add(rbox(1.1, 1.15, 0.12, 0.02), top ? c.m.gold : c.m.darkLacquer, L(lx, yy + h * 0.56, sd * (d / 2 + 0.04)), { tint: top ? '#ffffff' : '#3a3632' })
    }
    const nwz = Math.max(2, Math.floor(d / 2.6))
    for (let k = 0; k < nwz; k++) {
      const lz = -d / 2 + ((k + 0.5) * d) / nwz
      for (const sd of [-1, 1]) c.b.add(rbox(0.12, 1.15, 1.1, 0.02), top ? c.m.gold : c.m.darkLacquer, L(sd * (w / 2 + 0.04), yy + h * 0.56, lz), { tint: top ? '#ffffff' : '#3a3632' })
    }
    // 最上階の金の帯
    if (top) {
      for (const hy of [0.12, 0.92]) c.b.add(rbox(w + 0.12, 0.22, d + 0.12, 0.02), c.m.gold, L(0, yy + h * hy, 0))
    }
    // 屋根：次の階の壁の足もとで高さ ~2.3m になるよう全体の高さを決める
    const over = top ? 2.4 : 2.9
    const b = d / 2 + over
    const next = tiers[i + 1]
    const nb = next ? next[1] / 2 : 0
    const tAtNext = next ? (b - nb) / (Math.min(w / 2 + over, b) - 0.06) : 0
    const H = next ? 2.3 / Math.pow(Math.min(0.95, tAtNext), 1.45) : 4.6
    const roofY = yy + h
    c.b.add(sweptRoof(w, d, H, { over, lift: top ? 1.1 : 0.95, flare: 0.07, texM: 2.4, lip: 0.32 }), c.m.castleRoof, L(0, roofY, 0), { tint: '#ffffff' })
    // 軒先の金の縁取り（反りに沿う）
    c.b.add(sweptEaveTube(w, d, { over, lift: top ? 1.1 : 0.95, flare: 0.07 }, 0.1, -0.06), c.m.gold, L(0, roofY, 0), { cast: false })
    // 破風：下の階から交互に千鳥破風・唐破風
    if (!top) {
      const tFace = 0.28
      const ry = roofHeightAt(H, tFace)
      const zFace = b - tFace * (Math.min(w / 2 + over, b) - 0.06)
      const kara = i === 1
      const dw = kara ? Math.min(6.5, w * 0.36) : Math.min(7, w * 0.42)
      const dh = kara ? 1.5 : 2.6
      const parts = kara ? karaHafu(dw, dh, 2.2) : gableDormer(dw, dh, 2.6)
      for (const sd of [-1, 1]) {
        const m4 = L(0, roofY + ry - 0.15, sd * (zFace + 0.1), sd > 0 ? 0 : Math.PI)
        c.b.add(parts.roof, c.m.castleRoof, m4, { tint: '#ffffff' })
        c.b.add(parts.face, c.m.castleWhite, new THREE.Matrix4().multiplyMatrices(m4, M(0, 0, 0.32)), { texM: 3, cast: false })
        c.b.add(parts.trim, c.m.gold, m4, { cast: false })
        // 妻の金の懸魚
        c.b.add(new THREE.SphereGeometry(0.32, 8, 6), c.m.gold, new THREE.Matrix4().multiplyMatrices(m4, M(0, dh * 0.62, 0.42, 0, 0, 0, 1, 0.8, 0.4)), { cast: false })
      }
      // 妻側（短辺）にも小さな千鳥破風
      if (i === 0 || i === 2) {
        const ad = w / 2 + over
        const zSide = ad - tFace * (Math.min(ad, b) - 0.06)
        const side = gableDormer(Math.min(5, d * 0.4), 2.0, 2.2)
        for (const sd of [-1, 1]) {
          const m4 = L(sd * (zSide + 0.1), roofY + ry - 0.15, 0, sd > 0 ? Math.PI / 2 : -Math.PI / 2)
          c.b.add(side.roof, c.m.castleRoof, m4, { tint: '#ffffff' })
          c.b.add(side.face, c.m.castleWhite, new THREE.Matrix4().multiplyMatrices(m4, M(0, 0, 0.32)), { texM: 3, cast: false })
          c.b.add(side.trim, c.m.gold, m4, { cast: false })
        }
      }
    } else {
      // 最上階：入母屋（短辺の上部に白い妻）
      const ad = w / 2 + over
      const ridgeHalf = ad - (Math.min(ad, b) - 0.06)
      for (const sd of [-1, 1]) {
        const tri = new THREE.Shape()
        tri.moveTo(-b * 0.42, 0)
        tri.lineTo(b * 0.42, 0)
        tri.lineTo(0, H * 0.48)
        tri.closePath()
        const m4 = L(sd * (ridgeHalf + 1.6), roofY + H * 0.5, 0, sd > 0 ? Math.PI / 2 : -Math.PI / 2)
        c.b.add(new THREE.ShapeGeometry(tri), c.m.castleWhite, m4, { texM: 3, cast: false })
      }
      // 棟と鯱
      const ridgeY = roofY + H + 0.05
      c.b.add(rbox(ridgeHalf * 2 + 0.6, 0.55, 0.7, 0.1), c.m.castleRoof, L(0, ridgeY, 0), { tint: '#ffffff' })
      c.b.add(rbox(ridgeHalf * 2 + 0.7, 0.12, 0.76, 0.03), c.m.gold, L(0, ridgeY + 0.3, 0))
      for (const e of [-1, 1]) addShachi(c, L(e * (ridgeHalf + 0.15), ridgeY + 0.2, 0, e > 0 ? 0 : Math.PI, 0, 1), 1.25)
    }
    yy += h + 1.35
  }
}

function displace(g: THREE.BufferGeometry, amp: number, freq: number): void {
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const n = noise3(x * freq, y * freq, z * freq) - 0.5
    const r = Math.hypot(x, z)
    if (r > 0.1) {
      const k = 1 + (n * amp) / Math.max(r, 1)
      p.setX(i, x * k)
      p.setZ(i, z * k)
    }
    p.setY(i, y + n * amp * 0.4)
  }
  g.computeVertexNormals()
}

// ------------------------------------------------------------------ 浮島

export function floatingIsland(c: Ctx, scene: THREE.Group, x: number, y: number, z: number, r: number, seed: number, f: Foliage): void {
  const rng = mulberry32(seed)
  const rock = new THREE.ConeGeometry(r, r * 1.7, 11, 6)
  rock.rotateX(Math.PI)
  rock.translate(0, -r * 0.85, 0)
  const p = rock.attributes.position
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i)
    const vy = p.getY(i)
    const vz = p.getZ(i)
    const n = noise3(vx * 0.35 + seed, vy * 0.35, vz * 0.35) - 0.5
    p.setXYZ(i, vx * (1 + n * 0.5), vy + n * r * 0.25, vz * (1 + n * 0.5))
  }
  rock.computeVertexNormals()
  c.b.add(rock, c.m.rock, M(x, y, z, 0, range(rng, 0, 6), 0), { uv: 'scale', uvScale: [3, 3], tint: '#e8d8c0' })
  c.b.add(new THREE.CylinderGeometry(r * 1.02, r * 0.92, r * 0.18, 14), c.m.grass, M(x, y + r * 0.02, z), { tint: '#cfe08a', uv: 'scale', uvScale: [3, 0.3] })
  for (let i = 0; i < Math.round(r * 1.2); i++) {
    const a = range(rng, 0, Math.PI * 2)
    const rr = range(rng, 0.1, 0.8) * r
    if (rng() < 0.4) f.cherry(x + Math.cos(a) * rr, y + r * 0.1, z + Math.sin(a) * rr, range(rng, 0.7, 1.1) * (r / 6), seed * 10 + i, 0.6)
    else f.bush(x + Math.cos(a) * rr, y + r * 0.1, z + Math.sin(a) * rr, range(rng, 0.6, 1.1) * (r / 6), seed * 10 + i)
  }
  farHouse(c, x + r * 0.2, y + r * 0.1, z - r * 0.15, r * 0.35, r * 0.3, r * 0.25, range(rng, 0, 3), rng)
  // 端から落ちる細い滝
  const fall = new THREE.Mesh(fallSheet(new THREE.Vector3(x + r * 0.95, y + r * 0.05, z), 0, r * 0.18, r * 2.2, r * 0.25, 10, 3), createFallMaterial(seed * 0.1, 0.8, 0.6))
  scene.add(fall)
}

// ------------------------------------------------------------------ 水車

export function waterWheel(c: Ctx, scene: THREE.Group, x: number, y: number, z: number, r: number, axisYaw: number): void {
  const b = new Batch()
  const root = new THREE.Group()
  root.position.set(x, y, z)
  root.rotation.y = Math.atan2(Math.cos(axisYaw), Math.sin(axisYaw))
  const spin = new THREE.Group()
  root.add(spin)
  const w = r * 0.32
  for (const zz of [-w / 2, w / 2]) {
    b.add(new THREE.TorusGeometry(r, 0.07 * r, 6, 28), c.m.wood, M(0, 0, zz), { tint: WOOD.dark, uv: 'scale', uvScale: [8, 0.3] })
    b.add(new THREE.TorusGeometry(r * 0.78, 0.05 * r, 6, 28), c.m.wood, M(0, 0, zz), { tint: WOOD.dark, uv: 'scale', uvScale: [8, 0.3] })
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      b.add(rbox(0.07 * r, r, 0.07 * r, 0.02), c.m.wood, M(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, zz, 0, 0, a - Math.PI / 2), { tint: WOOD.aged, texM: 1.6 })
    }
  }
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2
    b.add(rbox(0.32 * r, 0.04 * r, w, 0.01), c.m.wood, M(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 0, 0, 0, a), { tint: WOOD.aged, texM: 1.6 })
  }
  b.add(new THREE.CylinderGeometry(0.12 * r, 0.12 * r, w * 1.6, 12), c.m.iron, M(0, 0, 0, Math.PI / 2, 0, 0))
  spin.add(b.build('wheel'))
  scene.add(root)
  c.updaters.push((dt) => {
    spin.rotation.z -= dt * 0.5
  })
}

// ------------------------------------------------------------------ 山並み

export function mountains(c: Ctx): void {
  const rng = mulberry32(8)
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + range(rng, -0.08, 0.08)
    const d = range(rng, 380, 520)
    const h = range(rng, 50, 120)
    const g = new THREE.ConeGeometry(range(rng, 90, 160), h, 7, 3)
    displace(g, 14, 0.02)
    c.b.add(g, c.m.grass, M(Math.cos(a) * d, h / 2 - 8, Math.sin(a) * d, 0, range(rng, 0, 6), 0), { tint: '#7f9fb0', uv: 'scale', uvScale: [4, 2], cast: false, receive: false })
  }
}
