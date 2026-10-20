// 地面の穴（地下への階段・中庭の池など）：床の当たり判定を穴の周りの箱に分け、見た目の地面も穴をあけて作る。
// 穴が無ければ、呼び出し側は今までどおりの 1 枚の板・1 つの箱を使う（見た目も乱数も変わらない）。
import * as THREE from 'three'
import type { ColliderList } from '../../world/colliders'

/** XZ の長方形（x0<x1, z0<z1） */
export type GroundRect = { x0: number; x1: number; z0: number; z1: number }

export function rectsOverlap(a: GroundRect, b: GroundRect): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0
}

export function inRect(r: GroundRect, x: number, z: number, pad = 0): boolean {
  return x >= r.x0 - pad && x <= r.x1 + pad && z >= r.z0 - pad && z <= r.z1 + pad
}

/** bounds を、holes を除いた長方形の集まりに分ける（格子に切って、縦に続くものをつなぐ） */
export function cellsWithHoles(bounds: GroundRect, holes: readonly GroundRect[]): GroundRect[] {
  const hs = holes.filter((h) => rectsOverlap(h, bounds))
  if (!hs.length) return [{ ...bounds }]
  const xs = new Set<number>([bounds.x0, bounds.x1])
  const zs = new Set<number>([bounds.z0, bounds.z1])
  for (const h of hs) {
    for (const x of [h.x0, h.x1]) if (x > bounds.x0 && x < bounds.x1) xs.add(x)
    for (const z of [h.z0, h.z1]) if (z > bounds.z0 && z < bounds.z1) zs.add(z)
  }
  const X = [...xs].sort((a, b) => a - b)
  const Z = [...zs].sort((a, b) => a - b)
  const out: GroundRect[] = []
  for (let i = 0; i < X.length - 1; i++) {
    const cx = (X[i] + X[i + 1]) / 2
    let start = -1
    for (let j = 0; j <= Z.length - 1; j++) {
      const cz = j < Z.length - 1 ? (Z[j] + Z[j + 1]) / 2 : 0
      const ok = j < Z.length - 1 && !hs.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)
      if (ok && start < 0) start = j
      if (!ok && start >= 0) {
        out.push({ x0: X[i], x1: X[i + 1], z0: Z[start], z1: Z[j] })
        start = -1
      }
    }
  }
  return out
}

/** 床の当たり判定（上面 top・厚さ thick）を穴を避けて並べる */
export function floorWithHoles(col: ColliderList, bounds: GroundRect, top: number, thick: number, holes: readonly GroundRect[]): void {
  for (const r of cellsWithHoles(bounds, holes)) col.floor(r.x0, r.x1, r.z0, r.z1, top, thick)
}

/**
 * 穴のあいた水平な板（上向き・y=0）。UV は PlaneGeometry(W,D) を -90° 倒して uvScale [W/texM, D/texM] を掛けたものと同じ
 * （u = (x - x0) / texM、v = (z1 - z) / texM）なので、穴の無い板と模様がずれない。Batch には uv: 'keep' で渡す。
 */
export function planeWithHoles(bounds: GroundRect, holes: readonly GroundRect[], texM: number): THREE.BufferGeometry {
  const hs = holes.filter((h) => rectsOverlap(h, bounds)).map((h) => ({
    x0: Math.max(h.x0, bounds.x0 + 0.01),
    x1: Math.min(h.x1, bounds.x1 - 0.01),
    z0: Math.max(h.z0, bounds.z0 + 0.01),
    z1: Math.min(h.z1, bounds.z1 - 0.01),
  }))
  const ring = (r: GroundRect) => [new THREE.Vector2(r.x0, r.z0), new THREE.Vector2(r.x1, r.z0), new THREE.Vector2(r.x1, r.z1), new THREE.Vector2(r.x0, r.z1)]
  const contour = ring(bounds)
  const holePts = hs.map((h) => ring(h).reverse())
  const faces = THREE.ShapeUtils.triangulateShape(contour, holePts)
  const all = [...contour, ...holePts.flat()]
  const pos = new Float32Array(all.length * 3)
  const uv = new Float32Array(all.length * 2)
  const nor = new Float32Array(all.length * 3)
  all.forEach((p, i) => {
    pos[i * 3] = p.x
    pos[i * 3 + 2] = p.y
    nor[i * 3 + 1] = 1
    uv[i * 2] = (p.x - bounds.x0) / texM
    uv[i * 2 + 1] = (bounds.z1 - p.y) / texM
  })
  const idx: number[] = []
  for (const [a, b, c] of faces) {
    // 上から見て表になる向き（法線 +Y）にそろえる
    const pa = all[a]
    const pb = all[b]
    const pc = all[c]
    const ny = (pb.y - pa.y) * (pc.x - pa.x) - (pb.x - pa.x) * (pc.y - pa.y)
    if (ny >= 0) idx.push(a, b, c)
    else idx.push(a, c, b)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
