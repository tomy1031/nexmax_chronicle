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

/** 角の丸い箱（面取り）。r は角の半径。 */
export function rbox(w: number, h: number, d: number, r = 0.03, seg = 1): THREE.BufferGeometry {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001)
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${rr.toFixed(3)}|${seg}`
  let g = rboxCache.get(key)
  if (!g) {
    g = rr > 0.002 ? new RoundedBoxGeometry(w, h, d, seg, rr) : new THREE.BoxGeometry(w, h, d)
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
