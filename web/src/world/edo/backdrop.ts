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

export function farHouse(c: Ctx, x: number, y: number, z: number, w: number, d: number, h: number, rot: number, rng: () => number): void {
  const plaster = new THREE.Color('#f4eadb').multiplyScalar(range(rng, 0.9, 1.05))
  c.b.add(rbox(w, h, d, 0), c.m.plaster, M(x, y + h / 2, z, 0, rot, 0), { tint: plaster, texM: 3 })
  // 1 階の木部
  c.b.add(rbox(w + 0.04, h * 0.45, d + 0.04, 0), c.m.wood, M(x, y + h * 0.22, z, 0, rot, 0), { tint: woodTint(c.rng, WOOD.aged), texM: 1.6 })
  const rise = d * 0.32
  const ang = Math.atan2(rise, d / 2 + 0.4)
  const sl = Math.hypot(d / 2 + 0.5, rise)
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  for (const sd of [-1, 1]) {
    const lz = (sd * (d / 2 + 0.5)) / 2
    c.b.add(rbox(w + 0.7, 0.16, sl, 0), c.m.roof, M(x + lz * sn, y + h + rise / 2, z + lz * cs, sd * ang, rot, 0), { texM: 2, uAxis: 0, flipV: sd > 0, tint: '#e8ecf4' })
  }
  c.b.add(rbox(w + 0.8, 0.22, 0.32, 0), c.m.roof, M(x, y + h + rise + 0.05, z, 0, rot, 0), { texM: 1, tint: '#9aa2b2' })
  if (rng() < 0.35) lantern(c, x - sn * (d / 2 + 0.6), y + h * 0.5, z - cs * (d / 2 + 0.6), { kind: rng() < 0.5 ? 'red' : 'cream', cord: 0.1, light: false })
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

// ------------------------------------------------------------------ 城

export function castle(c: Ctx, x: number, y: number, z: number, f: Foliage): void {
  const rng = mulberry32(404)
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
    if (rng() < 0.22) f.cherry(x + Math.cos(a) * r, y + hh - 1, z + Math.sin(a) * r, range(rng, 1.4, 2.0), 900 + i, 0.4)
    else f.bush(x + Math.cos(a) * r, y + hh - 1, z + Math.sin(a) * r, range(rng, 1.6, 2.6), 300 + i, 1.3)
  }
  // 石垣（二段）
  const top0 = y + 33
  const sq = (w0: number, w1: number, h: number, yy: number) => {
    const g = new THREE.CylinderGeometry(w1 / Math.SQRT2, w0 / Math.SQRT2, h, 4, 1).toNonIndexed()
    g.computeVertexNormals()
    c.b.add(g, c.m.stoneWall, M(x, yy + h / 2, z, 0, Math.PI / 4, 0), { tint: '#d8d2c8', texM: 9 })
  }
  sq(46, 40, 6, top0)
  sq(30, 26, 7, top0 + 6)
  // 天守
  let yy = top0 + 13
  const tiers = [
    [22, 18, 5.2],
    [18, 14.5, 4.6],
    [14.5, 11.5, 4.2],
    [11, 9, 3.8],
    [8.5, 7.5, 3.6],
  ]
  for (let i = 0; i < tiers.length; i++) {
    const [w, d, h] = tiers[i]
    c.b.add(rbox(w, h, d, 0.1), c.m.castleWhite, M(x, yy + h / 2, z, 0, -0.35, 0), { texM: 4 })
    // 窓
    const nwin = Math.max(2, Math.floor(w / 3))
    for (let k = 0; k < nwin; k++) {
      const lx = -w / 2 + ((k + 0.5) * w) / nwin
      for (const sd of [-1, 1]) {
        const cs = Math.cos(-0.35)
        const sn = Math.sin(-0.35)
        const lz = sd * (d / 2 + 0.05)
        c.b.add(rbox(1.0, 1.1, 0.12, 0.02), c.m.darkLacquer, M(x + lx * cs + lz * sn, yy + h * 0.55, z - lx * sn + lz * cs, 0, -0.35, 0))
      }
    }
    // 屋根（反りのある寄棟：4 分割の回転体＋金の縁）
    const rw = w + 6.0
    const rd = d + 6.0
    const roofH = 2.8
    const prof = [
      new THREE.Vector2(1.0, -0.06),
      new THREE.Vector2(0.99, 0.0),
      new THREE.Vector2(0.84, 0.22),
      new THREE.Vector2(0.66, 0.55),
      new THREE.Vector2(0.52, 1.0),
      new THREE.Vector2(0.0, 1.0),
    ]
    const g = new THREE.LatheGeometry(prof, 4)
    g.rotateY(Math.PI / 4)
    g.scale(rw / Math.SQRT2, roofH, rd / Math.SQRT2)
    g.computeVertexNormals()
    c.b.add(g, c.m.castleRoof, M(x, yy + h - 0.3, z, 0, -0.35, 0), { texM: 3 })
    c.b.add(rbox(rw * 1.0, 0.9, rd * 1.0, 0.15), c.m.castleRoof, M(x, yy + h - 0.65, z, 0, -0.35, 0), { tint: '#6b7d80', texM: 2 })
    c.b.add(rbox(rw * 1.01, 0.16, rd * 1.01, 0.05), c.m.gold, M(x, yy + h - 0.2, z, 0, -0.35, 0))
    // 黒い腰壁（下見板）
    c.b.add(rbox(w + 0.1, h * 0.28, d + 0.1, 0.05), c.m.darkLacquer, M(x, yy + h * 0.14, z, 0, -0.35, 0), { tint: '#3a3430' })
    // 千鳥破風
    if (i < 4) {
      const tri = new THREE.Shape()
      tri.moveTo(-2.4, 0)
      tri.lineTo(2.4, 0)
      tri.lineTo(0, 2.2)
      tri.closePath()
      const tg = new THREE.ExtrudeGeometry(tri, { depth: 1.2, bevelEnabled: false })
      for (const sd of [-1, 1]) {
        const cs = Math.cos(-0.35)
        const sn = Math.sin(-0.35)
        const lz = sd * (d / 2 + 1.2)
        c.b.add(tg, c.m.castleRoof, M(x + lz * sn, yy + h + 0.2, z + lz * cs, 0, -0.35 + (sd > 0 ? 0 : Math.PI), 0), { texM: 3 })
        c.b.add(new THREE.ShapeGeometry(tri), c.m.castleWhite, M(x + (lz + sd * 1.25) * sn, yy + h + 0.35, z + (lz + sd * 1.25) * cs, 0, -0.35 + (sd > 0 ? 0 : Math.PI), 0, 0.8), { texM: 3, cast: false })
      }
    }
    yy += h + roofH * 0.62
  }
  // 鯱
  for (const e of [-1, 1]) {
    const cs = Math.cos(-0.35)
    const sn = Math.sin(-0.35)
    c.b.add(new THREE.ConeGeometry(0.6, 2.0, 8), c.m.gold, M(x + e * 3.2 * cs, yy + 0.6, z - e * 3.2 * sn, 0, 0, e * 0.4))
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
