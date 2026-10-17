// 静的ジオメトリをマテリアルごとに 1 メッシュへ結合する（ドローコール削減）。
// UV は実寸（m）基準で投影し直すので、テクスチャの密度が全体で揃う。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

export type UVMode = 'box' | 'keep' | 'scale'

export type AddOpts = {
  tint?: THREE.ColorRepresentation
  /** box 投影でテクスチャ 1 枚が覆う m */
  texM?: number
  uv?: UVMode
  uvScale?: [number, number]
  /** box 投影の U 軸を固定（0=x,1=y,2=z） */
  uAxis?: 0 | 1 | 2
  flipV?: boolean
  cast?: boolean
  receive?: boolean
}

type Entry = { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }

const tmpColor = new THREE.Color()

export class Batch {
  private entries = new Map<string, Entry>()
  count = 0

  add(geo: THREE.BufferGeometry, mat: THREE.Material, matrix?: THREE.Matrix4, opts: AddOpts = {}): void {
    const g = geo.clone()
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name)
    }
    g.morphAttributes = {}
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    const mode: UVMode = opts.uv ?? (opts.texM ? 'box' : 'keep')
    if (mode === 'box') boxProjectUV(g, opts.texM ?? 1, opts.uAxis, opts.flipV)
    else if (mode === 'scale' && opts.uvScale) scaleUV(g, opts.uvScale[0], opts.uvScale[1])
    if (matrix) g.applyMatrix4(matrix)
    if (!g.index) {
      const n = g.attributes.position.count
      const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n)
      for (let i = 0; i < n; i++) idx[i] = i
      g.setIndex(new THREE.BufferAttribute(idx, 1))
    }
    tmpColor.set(opts.tint ?? '#ffffff')
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpColor.r
      col[i * 3 + 1] = tmpColor.g
      col[i * 3 + 2] = tmpColor.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const cast = opts.cast ?? true
    const receive = opts.receive ?? true
    const key = `${mat.uuid}|${cast ? 1 : 0}${receive ? 1 : 0}`
    let e = this.entries.get(key)
    if (!e) {
      e = { mat, geos: [], cast, receive }
      this.entries.set(key, e)
    }
    e.geos.push(g)
    this.count++
  }

  /** 結合したメッシュ群を返す。 */
  build(name = 'batch'): THREE.Group {
    const group = new THREE.Group()
    group.name = name
    for (const e of this.entries.values()) {
      // index の型を揃える
      const total = e.geos.reduce((s, g) => s + g.attributes.position.count, 0)
      if (total > 65535) {
        for (const g of e.geos) {
          const idx = g.index as THREE.BufferAttribute
          if (!(idx.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx.array), 1))
        }
      }
      const merged = mergeGeometries(e.geos, false)
      if (!merged) continue
      merged.computeBoundingSphere()
      merged.computeBoundingBox()
      const mesh = new THREE.Mesh(merged, e.mat)
      mesh.castShadow = e.cast
      mesh.receiveShadow = e.receive
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      group.add(mesh)
      for (const g of e.geos) g.dispose()
    }
    this.entries.clear()
    return group
  }
}

/** ローカル空間で面の向きに応じて実寸 UV を投影。U は長い方の軸（木目が長手方向に流れる）。 */
export function boxProjectUV(g: THREE.BufferGeometry, texM: number, uAxis?: 0 | 1 | 2, flipV = false): void {
  g.computeBoundingBox()
  const size = new THREE.Vector3()
  ;(g.boundingBox as THREE.Box3).getSize(size)
  const sz = [size.x, size.y, size.z]
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const uv = new Float32Array(pos.count * 2)
  const p = [0, 0, 0]
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i)
    p[1] = pos.getY(i)
    p[2] = pos.getZ(i)
    const ax = Math.abs(nor.getX(i))
    const ay = Math.abs(nor.getY(i))
    const az = Math.abs(nor.getZ(i))
    let a: number
    let b: number
    if (ay >= ax && ay >= az) {
      a = 0
      b = 2
    } else if (ax >= az) {
      a = 2
      b = 1
    } else {
      a = 0
      b = 1
    }
    let U = a
    let V = b
    if (uAxis !== undefined) {
      if (uAxis === b) {
        U = b
        V = a
      } else if (uAxis !== a) {
        // 指定軸がこの面に含まれない（面の法線方向）→ 既定どおり
      }
    } else if (sz[b] > sz[a]) {
      U = b
      V = a
    }
    uv[i * 2] = p[U] / texM
    uv[i * 2 + 1] = ((flipV ? -1 : 1) * p[V]) / texM
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

export function scaleUV(g: THREE.BufferGeometry, su: number, sv: number): void {
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
  uv.needsUpdate = true
}

// ------------------------------------------------------------------ 形状ヘルパ

const rboxCache = new Map<string, THREE.BufferGeometry>()

/**
 * 角を面取りした箱（6 面＋12 本の面取り帯＋8 つの角の三角＝44 三角形）。
 * RoundedBoxGeometry（108 三角形）より軽く、面取りの帯が光を拾うので見た目はほぼ同じ。
 * UV は実寸 1m の箱投影（Batch の box 投影で上書きされることが多い）。
 */
export function chamferBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const half = [w / 2, h / 2, d / 2]
  const inner = [half[0] - r, half[1] - r, half[2] - r]
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  /** 面 a（符号 sa）上の、他の 2 軸の符号 s による頂点 */
  const fv = (a: number, s: number[]): number[] => {
    const p = [0, 0, 0]
    for (let i = 0; i < 3; i++) p[i] = i === a ? s[i] * half[i] : s[i] * inner[i]
    return p
  }
  const tri = (p0: number[], p1: number[], p2: number[]) => {
    const ux = p1[0] - p0[0]
    const uy = p1[1] - p0[1]
    const uz = p1[2] - p0[2]
    const vx = p2[0] - p0[0]
    const vy = p2[1] - p0[1]
    const vz = p2[2] - p0[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const cx = p0[0] + p1[0] + p2[0]
    const cy = p0[1] + p1[1] + p2[1]
    const cz = p0[2] + p1[2] + p2[2]
    let q = [p0, p1, p2]
    if (nx * cx + ny * cy + nz * cz < 0) {
      q = [p0, p2, p1]
      nx = -nx
      ny = -ny
      nz = -nz
    }
    const l = Math.hypot(nx, ny, nz) || 1
    nx /= l
    ny /= l
    nz /= l
    const ax = Math.abs(nx)
    const ay = Math.abs(ny)
    const az = Math.abs(nz)
    for (const p of q) {
      pos.push(p[0], p[1], p[2])
      nor.push(nx, ny, nz)
      if (ay >= ax && ay >= az) uv.push(p[0], p[2])
      else if (ax >= az) uv.push(p[2], p[1])
      else uv.push(p[0], p[1])
    }
  }
  const quad = (a: number[], b: number[], c: number[], e: number[]) => {
    tri(a, b, c)
    tri(a, c, e)
  }
  const S = [-1, 1]
  // 6 面
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3
    const v = (a + 2) % 3
    for (const sa of S) {
      const s = (su: number, sv: number) => {
        const k = [0, 0, 0]
        k[a] = sa
        k[u] = su
        k[v] = sv
        return fv(a, k)
      }
      quad(s(-1, -1), s(1, -1), s(1, 1), s(-1, 1))
    }
  }
  // 12 本の面取り帯（軸 e に平行な辺）
  for (let e = 0; e < 3; e++) {
    const u = (e + 1) % 3
    const v = (e + 2) % 3
    for (const su of S) {
      for (const sv of S) {
        const k0 = [0, 0, 0]
        const k1 = [0, 0, 0]
        k0[u] = su
        k0[v] = sv
        k0[e] = -1
        k1[u] = su
        k1[v] = sv
        k1[e] = 1
        quad(fv(u, k0), fv(u, k1), fv(v, k1), fv(v, k0))
      }
    }
  }
  // 8 つの角
  for (const sx of S) for (const sy of S) for (const sz of S) tri(fv(0, [sx, sy, sz]), fv(1, [sx, sy, sz]), fv(2, [sx, sy, sz]))
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** 角の丸い箱（面取り）。r は角の半径。seg>1 のときだけ RoundedBoxGeometry（なめらかな丸み）を使う。 */
export function rbox(w: number, h: number, d: number, r = 0.03, seg = 1): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${rr.toFixed(3)}|${seg}`
  let g = rboxCache.get(key)
  if (!g) {
    g = rr > 0.002 ? (seg > 1 ? new RoundedBoxGeometry(w, h, d, seg, rr) : chamferBox(w, h, d, rr)) : new THREE.BoxGeometry(w, h, d)
    rboxCache.set(key, g)
  }
  return g
}

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler()
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()

/** 位置・回転（ラジアン、XYZ 順）・拡大から行列を作る（毎回新しい Matrix4）。 */
export function M(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  tmpE.set(rx, ry, rz, 'YXZ')
  tmpQ.setFromEuler(tmpE)
  tmpP.set(x, y, z)
  tmpS.set(sx, sy, sz)
  return new THREE.Matrix4().compose(tmpP, tmpQ, tmpS)
}

/** a→b を結ぶ棒の行列（Y 軸方向のジオメトリ用） */
export function between(a: THREE.Vector3, b: THREE.Vector3, sx = 1, sz = sx): THREE.Matrix4 {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  dir.normalize()
  tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  return tmpM.clone().compose(mid, tmpQ, new THREE.Vector3(sx, len, sz))
}

export function mul(a: THREE.Matrix4, b: THREE.Matrix4): THREE.Matrix4 {
  return new THREE.Matrix4().multiplyMatrices(a, b)
}
