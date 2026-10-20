// 7 章の舞台で使い回す小さな部品：歯車の形・行灯・和時計の機械・櫓時計・紙垂。
// 静的な物は Ctx のバッチ（world/edo/kit.ts）に積む（町と同じ描画の回数で済む）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { M, rbox } from '../../../render/batch'
import { WOOD, woodBox, woodTint, type Ctx } from '../../../world/edo/kit'

const gearCache = new Map<string, THREE.BufferGeometry>()

/**
 * 歯車の形（Z 軸が回転軸。厚さ t）。歯は台形の箱、真ん中に穴の代わりの軸受け、スポーク 4〜6 本の抜き。
 * 同じ寸法はキャッシュ（Batch は clone するので共有してよい）。三角形はおよそ 60 + 歯 × 12
 */
export function gearGeometry(r: number, t: number, teeth: number, o: { spokes?: number; tooth?: number } = {}): THREE.BufferGeometry {
  const key = `${r.toFixed(3)}|${t.toFixed(3)}|${teeth}|${o.spokes ?? 0}|${o.tooth ?? 0}`
  const hit = gearCache.get(key)
  if (hit) return hit
  const tooth = o.tooth ?? Math.min(r * 0.22, (Math.PI * 2 * r) / teeth / 1.6)
  const parts: THREE.BufferGeometry[] = []
  const strip = (g: THREE.BufferGeometry) => {
    const n = g.index ? g.toNonIndexed() : g
    for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name)
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2))
    return n
  }
  const spokes = o.spokes ?? 0
  if (spokes > 0) {
    // 外の輪＋スポーク＋軸受け
    const shape = new THREE.Shape()
    shape.absarc(0, 0, r, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    hole.absarc(0, 0, r * 0.64, 0, Math.PI * 2, true)
    shape.holes.push(hole)
    const rim = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: Math.max(10, teeth) })
    rim.translate(0, 0, -t / 2)
    parts.push(strip(rim))
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2
      const s = new THREE.BoxGeometry(r * 0.16, r * 0.7, t * 0.8)
      s.translate(0, r * 0.38, 0)
      s.rotateZ(a)
      parts.push(strip(s))
    }
    const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, t * 1.3, 12)
    hub.rotateX(Math.PI / 2)
    parts.push(strip(hub))
  } else {
    const disc = new THREE.CylinderGeometry(r, r, t, Math.max(14, teeth * 2))
    disc.rotateX(Math.PI / 2)
    parts.push(strip(disc))
  }
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2
    const b = new THREE.BoxGeometry(tooth * 0.9, tooth, t)
    b.translate(0, r + tooth * 0.42, 0)
    b.rotateZ(a)
    parts.push(strip(b))
  }
  const g = mergeGeometries(parts, false) as THREE.BufferGeometry
  for (const p of parts) p.dispose()
  g.computeBoundingSphere()
  gearCache.set(key, g)
  return g
}

/** 行灯（置き型の角行灯）。紙は障子の材質（あたたかく光る）。点光源の候補も足す */
export function andon(c: Ctx, x: number, z: number, y = 0, rot = 0, light = true): void {
  const h = 0.86
  const w = 0.34
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    const lx = (dx * w) / 2
    const lz = (dz * w) / 2
    woodBox(c, x + lx * cs + lz * sn, y + h / 2, z - lx * sn + lz * cs, 0.04, h, 0.04, { tint: WOOD.dark })
  }
  c.b.add(rbox(w - 0.03, 0.46, w - 0.03, 0.01), c.m.shoji, M(x, y + 0.56, z, 0, rot, 0), { cast: false, texM: 0.34 })
  woodBox(c, x, y + h + 0.01, z, w + 0.06, 0.04, w + 0.06, { rotY: rot, tint: WOOD.dark })
  woodBox(c, x, y + 0.3, z, w, 0.03, w, { rotY: rot, tint: WOOD.dark })
  // 持ち手
  woodBox(c, x, y + h + 0.12, z, 0.03, 0.22, 0.03, { tint: WOOD.dark })
  woodBox(c, x, y + h + 0.22, z, w * 0.7, 0.03, 0.03, { rotY: rot, tint: WOOD.dark })
  if (light) c.lights.push({ pos: new THREE.Vector3(x, y + 0.6, z), color: '#ffb066', intensity: 2.6, dist: 6.5 })
  c.col.box(x, y + 0.45, z, w + 0.04, 0.9, w + 0.04, rot)
}

/** 和時計の機械（机の上の、組みかけの時計）。原点は底の中心 */
export function clockMovement(c: Ctx, x: number, y: number, z: number, s = 1, rot = 0): void {
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  const P = (lx: number, ly: number, lz: number) => [x + (lx * cs + lz * sn) * s, y + ly * s, z + (-lx * sn + lz * cs) * s] as const
  // 真ちゅうの枠（4 本の柱と上下の板）
  for (const [lx, lz] of [
    [-0.09, -0.06],
    [0.09, -0.06],
    [-0.09, 0.06],
    [0.09, 0.06],
  ] as const) {
    const [px, py, pz] = P(lx, 0.13, lz)
    c.b.add(new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.26 * s, 6), c.m.brass, M(px, py, pz))
  }
  for (const ly of [0.005, 0.255]) {
    const [px, py, pz] = P(0, ly, 0)
    c.b.add(rbox(0.21 * s, 0.012 * s, 0.15 * s, 0.003), c.m.brass, M(px, py, pz, 0, rot, 0))
  }
  // 歯車（立てて、前後に並べる）
  for (const [lx, ly, r, n] of [
    [-0.03, 0.08, 0.055, 18],
    [0.04, 0.14, 0.04, 14],
    [-0.02, 0.2, 0.03, 12],
  ] as const) {
    const [px, py, pz] = P(lx, ly, 0)
    c.b.add(gearGeometry(r * s, 0.008 * s, n), c.m.brass, M(px, py, pz, 0, rot, 0))
  }
  // 棒天符（上の横棒と、両端のおもり）
  {
    const [px, py, pz] = P(0, 0.29, 0)
    c.b.add(rbox(0.26 * s, 0.008 * s, 0.008 * s, 0), c.m.iron, M(px, py, pz, 0, rot, 0))
    for (const e of [-1, 1]) {
      const [qx, qy, qz] = P(e * 0.12, 0.29, 0)
      c.b.add(new THREE.SphereGeometry(0.014 * s, 8, 6), c.m.brass, M(qx, qy, qz))
    }
  }
}

/** 櫓時計（やぐら台の上の和時計。文字盤は九〜四の数字）。原点は台の底の中心、正面は -Z（rot で回す） */
export function yaguraClock(c: Ctx, x: number, z: number, y = 0, rot = 0): THREE.Vector3 {
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  const P = (lx: number, lz: number) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs] as const
  // 台（四本脚の櫓）
  for (const [lx, lz] of [
    [-0.24, -0.24],
    [0.24, -0.24],
    [-0.24, 0.24],
    [0.24, 0.24],
  ] as const) {
    const [px, pz] = P(lx, lz)
    woodBox(c, px, y + 0.55, pz, 0.07, 1.1, 0.07, { tint: WOOD.dark })
  }
  for (const ly of [0.18, 1.08]) woodBox(c, x, y + ly, z, 0.56, 0.05, 0.56, { rotY: rot, tint: woodTint(c.rng, WOOD.warm) })
  // 時計の箱（漆と真ちゅう）
  c.b.add(rbox(0.36, 0.42, 0.3, 0.02), c.m.darkLacquer, M(x, y + 1.32, z, 0, rot, 0))
  const [fx, fz] = P(0, -0.152)
  c.b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 24), c.m.brass, M(fx, y + 1.34, fz, Math.PI / 2, rot, 0))
  // 上の鐘
  c.b.add(new THREE.SphereGeometry(0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), c.m.brass, M(x, y + 1.53, z))
  c.b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), c.m.iron, M(x, y + 1.66, z))
  // 下がるおもりの鎖
  const [wx, wz] = P(0.08, 0.05)
  c.b.add(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), c.m.iron, M(wx, y + 0.86, wz))
  c.b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 10), c.m.iron, M(wx, y + 0.58, wz))
  return new THREE.Vector3(fx, y + 1.34, fz)
}

/** 紙垂（しで：白い稲妻形の紙）。注連縄に下げる */
export function shide(c: Ctx, x: number, y: number, z: number, rotY: number, s = 1): void {
  const g = new THREE.BufferGeometry()
  // ジグザグの帯（4 段）
  const pts: number[] = []
  const w = 0.05 * s
  const seg = 0.06 * s
  let ox = 0
  for (let i = 0; i < 4; i++) {
    const y0 = -i * seg
    const y1 = y0 - seg
    const nx = i % 2 === 0 ? w * 0.5 : -w * 0.5
    pts.push(ox - w / 2, y0, 0, ox + w / 2, y0, 0, nx + w / 2, y1, 0, ox - w / 2, y0, 0, nx + w / 2, y1, 0, nx - w / 2, y1, 0)
    ox = nx
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  g.computeVertexNormals()
  // 裏からも見えるよう、反対向きにもう 1 枚
  c.b.add(g, c.m.plain, M(x, y, z, 0, rotY, 0), { tint: '#fbfaf4', cast: false })
  c.b.add(g, c.m.plain, M(x, y, z, 0, rotY + Math.PI, 0), { tint: '#fbfaf4', cast: false })
  g.dispose()
}
