// 乱数・ノイズ（テクスチャ生成とジオメトリの揺らぎ用）。すべて決定的（シード固定）。

export type Rng = () => number

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function range(rng: Rng, a: number, b: number): number {
  return a + (b - a) * rng()
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

/** タイル可能な 2D 値ノイズ。period 単位で繰り返す。 */
export class TileNoise {
  private readonly lattice: Float32Array
  private readonly size = 256

  constructor(seed = 1) {
    const rng = mulberry32(seed)
    this.lattice = new Float32Array(this.size * this.size)
    for (let i = 0; i < this.lattice.length; i++) this.lattice[i] = rng()
  }

  /** 0..1。px,py は繰り返し周期（格子数、<=256）。 */
  value(x: number, y: number, px = 256, py = 256): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const sx = fx * fx * (3 - 2 * fx)
    const sy = fy * fy * (3 - 2 * fy)
    const x0 = ((xi % px) + px) % px
    const y0 = ((yi % py) + py) % py
    const x1 = (x0 + 1) % px
    const y1 = (y0 + 1) % py
    const L = this.lattice
    const s = this.size
    const a = L[y0 * s + x0]
    const b = L[y0 * s + x1]
    const c = L[y1 * s + x0]
    const d = L[y1 * s + x1]
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
  }

  /** フラクタル（0..1 付近）。u,v は 0..1 のテクスチャ座標、freq は基本の格子数。 */
  fbm(u: number, v: number, freq: number, octaves = 4, gain = 0.5, freqY = freq): number {
    let amp = 0.5
    let sum = 0
    let norm = 0
    let fx = freq
    let fy = freqY
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.value(u * fx, v * fy, Math.max(1, Math.round(fx)), Math.max(1, Math.round(fy)))
      norm += amp
      amp *= gain
      fx *= 2
      fy *= 2
    }
    return sum / norm
  }
}

/** 非タイルの 3D 値ノイズ（ジオメトリの凹凸用）。 */
export function hash3(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function noise3(x: number, y: number, z: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const fx = x - xi
  const fy = y - yi
  const fz = z - zi
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const sz = fz * fz * (3 - 2 * fz)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c000 = hash3(xi, yi, zi)
  const c100 = hash3(xi + 1, yi, zi)
  const c010 = hash3(xi, yi + 1, zi)
  const c110 = hash3(xi + 1, yi + 1, zi)
  const c001 = hash3(xi, yi, zi + 1)
  const c101 = hash3(xi + 1, yi, zi + 1)
  const c011 = hash3(xi, yi + 1, zi + 1)
  const c111 = hash3(xi + 1, yi + 1, zi + 1)
  return l(l(l(c000, c100, sx), l(c010, c110, sx), sy), l(l(c001, c101, sx), l(c011, c111, sx), sy), sz)
}
