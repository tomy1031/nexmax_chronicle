// ボス戦の柵（arena.ts）の形の計算。three に依存しない（テストしやすいように）。
// 形は XZ 平面の多角形（点は時計回りでも反時計回りでもよい）。円は多角形にして扱う。

export type XZ = { x: number; z: number }

/** 円を n 角形の点に */
export function circlePoints(cx: number, cz: number, r: number, n = 28): XZ[] {
  const out: XZ[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    out.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r })
  }
  return out
}

/** 長方形の 4 点 */
export function rectPoints(x0: number, x1: number, z0: number, z1: number): XZ[] {
  return [
    { x: Math.min(x0, x1), z: Math.min(z0, z1) },
    { x: Math.max(x0, x1), z: Math.min(z0, z1) },
    { x: Math.max(x0, x1), z: Math.max(z0, z1) },
    { x: Math.min(x0, x1), z: Math.max(z0, z1) },
  ]
}

/** 点が多角形の内側か */
export function insidePoly(pts: readonly XZ[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]
    const b = pts[j]
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** 多角形のふちで、(x, z) にいちばん近い点と、そこまでの距離 */
export function nearestOnEdge(pts: readonly XZ[], x: number, z: number): { x: number; z: number; dist: number } {
  let best = { x: pts[0].x, z: pts[0].z, dist: Infinity }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
    const px = a.x + dx * t
    const pz = a.z + dz * t
    const d = Math.hypot(x - px, z - pz)
    if (d < best.dist) best = { x: px, z: pz, dist: d }
  }
  return best
}

/** 多角形の重心（点の平均） */
export function centroid(pts: readonly XZ[]): XZ {
  let x = 0
  let z = 0
  for (const p of pts) {
    x += p.x
    z += p.z
  }
  return { x: x / pts.length, z: z / pts.length }
}

/**
 * 柵の外に出ていたら、内側へもどす位置（ふちから margin だけ内側）。中にいれば null。
 * ワイヤーで引っぱられたときや、すき間をぬけたときの保険。
 */
export function pullInside(pts: readonly XZ[], x: number, z: number, margin = 0.6): XZ | null {
  if (insidePoly(pts, x, z)) return null
  const e = nearestOnEdge(pts, x, z)
  const c = centroid(pts)
  const dx = c.x - e.x
  const dz = c.z - e.z
  const len = Math.hypot(dx, dz) || 1
  return { x: e.x + (dx / len) * margin, z: e.z + (dz / len) * margin }
}
