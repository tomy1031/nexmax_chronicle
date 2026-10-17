// 桜（幹・枝＋花のカード群＋内側のふくらみ）、植え込み、舞い散る花びら（GPU）、地面の花びら。
import * as THREE from 'three'
import { M } from '../../render/batch'
import { TEX_METERS, uTime } from '../../render/materials'
import { mulberry32, range, type Rng } from '../../render/noise'
import { paintPetal, tex } from '../../render/textures'
import { orientAB, type Ctx } from './kit'

type CardBuf = { pos: number[]; nor: number[]; uv: number[]; col: number[]; idx: number[] }

function newBuf(): CardBuf {
  return { pos: [], nor: [], uv: [], col: [], idx: [] }
}

const tmpU = new THREE.Vector3()
const tmpV = new THREE.Vector3()

function addCard(buf: CardBuf, p: THREE.Vector3, size: number, n: THREE.Vector3, color: THREE.Color, rng: Rng): void {
  // ランダムな向きの四角形。法線は球状（なめらかな陰影）
  tmpU.set(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)).normalize()
  tmpV.set(range(rng, -1, 1), range(rng, -1, 1), range(rng, -1, 1)).cross(tmpU).normalize()
  const h = size / 2
  const base = buf.pos.length / 3
  const corners = [
    [-1, -1, 0, 0],
    [1, -1, 1, 0],
    [1, 1, 1, 1],
    [-1, 1, 0, 1],
  ]
  for (const [a, b, u, v] of corners) {
    buf.pos.push(p.x + (tmpU.x * a + tmpV.x * b) * h, p.y + (tmpU.y * a + tmpV.y * b) * h, p.z + (tmpU.z * a + tmpV.z * b) * h)
    buf.nor.push(n.x, n.y, n.z)
    buf.uv.push(u, v)
    buf.col.push(color.r, color.g, color.b)
  }
  buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
}

function bufToMesh(buf: CardBuf, mat: THREE.Material): THREE.Mesh {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2))
  g.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3))
  g.setIndex(buf.idx)
  g.computeBoundingSphere()
  const m = new THREE.Mesh(g, mat)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export class Foliage {
  private blossom = newBuf()
  private leaves = newBuf()
  private readonly c: Ctx

  constructor(c: Ctx) {
    this.c = c
  }

  /** 桜の木。s=全体の大きさ（1 で高さ約 5.5m） */
  cherry(x: number, y: number, z: number, s = 1, seed = 1, cardCount = 1): void {
    const c = this.c
    const rng = mulberry32(seed * 7919 + 13)
    const lean = new THREE.Vector3(range(rng, -0.5, 0.5), 0, range(rng, -0.5, 0.5))
    const p0 = new THREE.Vector3(x, y - 0.2, z)
    const p1 = new THREE.Vector3(x + lean.x * 0.4 * s, y + 1.6 * s, z + lean.z * 0.4 * s)
    const p2 = new THREE.Vector3(x + lean.x * 0.9 * s, y + 2.8 * s, z + lean.z * 0.9 * s)
    const barkT = '#ffffff'
    const far = cardCount < 0.9
    const seg = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number) => {
      const len = a.distanceTo(b)
      c.b.add(new THREE.CylinderGeometry(r1, r0, len, far ? 5 : 9, 1), c.m.bark, orientAB(a, b), {
        tint: barkT,
        uv: 'scale',
        uvScale: [(2 * Math.PI * r0) / TEX_METERS.bark, len / TEX_METERS.bark],
        cast: !far,
      })
      if (!far) c.b.add(new THREE.SphereGeometry(r1 * 1.02, 7, 5), c.m.bark, M(b.x, b.y, b.z), { tint: barkT, uv: 'scale', uvScale: [0.5, 0.3] })
    }
    seg(p0, p1, 0.26 * s, 0.2 * s)
    seg(p1, p2, 0.2 * s, 0.15 * s)
    // 主枝
    const crownC = p2.clone().add(new THREE.Vector3(0, 1.2 * s, 0))
    const nb = 5
    const blobs: Array<{ p: THREE.Vector3; r: number }> = []
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + range(rng, -0.4, 0.4)
      const out = range(rng, 1.4, 2.3) * s
      const up = range(rng, 0.8, 1.8) * s
      const e = p2.clone().add(new THREE.Vector3(Math.cos(a) * out, up, Math.sin(a) * out))
      seg(p2, e, 0.13 * s, 0.06 * s)
      const m = p2.clone().lerp(e, 0.55)
      const e2 = m.clone().add(new THREE.Vector3(Math.cos(a + 0.9) * out * 0.5, up * 0.5, Math.sin(a + 0.9) * out * 0.5))
      seg(m, e2, 0.07 * s, 0.035 * s)
      blobs.push({ p: e.clone().add(new THREE.Vector3(0, 0.2 * s, 0)), r: range(rng, 1.0, 1.35) * s })
      blobs.push({ p: e2.clone().add(new THREE.Vector3(0, 0.1 * s, 0)), r: range(rng, 0.7, 1.0) * s })
    }
    blobs.push({ p: crownC.clone().add(new THREE.Vector3(0, 0.6 * s, 0)), r: 1.5 * s })
    blobs.push({ p: crownC.clone(), r: 1.4 * s })
    const col = new THREE.Color()
    for (const bl of blobs) {
      // 内側のふくらみ（隙間を埋める）
      const n = Math.round(bl.r * bl.r * 40 * cardCount)
      for (let k = 0; k < n; k++) {
        const dir = new THREE.Vector3(range(rng, -1, 1), range(rng, -0.6, 1), range(rng, -1, 1)).normalize()
        const rr = bl.r * Math.cbrt(range(rng, 0.25, 1))
        const p = bl.p.clone().addScaledVector(dir, rr)
        const nrm = p.clone().sub(crownC).normalize().multiplyScalar(0.6).add(dir.multiplyScalar(0.5)).normalize()
        const light = range(rng, 0, 1)
        col.setRGB(1, 0.93 + light * 0.07, 0.95 + light * 0.05)
        addCard(this.blossom, p, range(rng, 0.6, 0.95) * s * (cardCount < 0.9 ? 1.4 : 1), nrm, col, rng)
      }
    }
    c.col.box(x, y + 1.2, z, 0.5 * s, 2.4, 0.5 * s)
  }

  /** 丸い植え込み・遠景の木 */
  bush(x: number, y: number, z: number, r = 0.8, seed = 1, tall = 1): void {
    const c = this.c
    const rng = mulberry32(seed * 31 + 7)
    const nPuff = 3
    const col = new THREE.Color()
    for (let i = 0; i < nPuff; i++) {
      const p = new THREE.Vector3(x + range(rng, -0.4, 0.4) * r, y + r * (0.7 + i * 0.35) * tall, z + range(rng, -0.4, 0.4) * r)
      c.b.add(new THREE.IcosahedronGeometry(r * range(rng, 0.65, 0.85), 1), c.m.puffGreen, M(p.x, p.y, p.z, rng(), rng(), 0), {
        tint: new THREE.Color('#ffffff').multiplyScalar(range(rng, 0.8, 1.05)),
      })
      const n = Math.round(r * r * 22)
      for (let k = 0; k < n; k++) {
        const dir = new THREE.Vector3(range(rng, -1, 1), range(rng, -0.3, 1), range(rng, -1, 1)).normalize()
        const q = p.clone().addScaledVector(dir, r * range(rng, 0.5, 0.95))
        col.setRGB(range(rng, 0.85, 1.1), range(rng, 0.9, 1.1), range(rng, 0.8, 1))
        addCard(this.leaves, q, range(rng, 0.45, 0.75) * r, dir, col, rng)
      }
    }
  }

  build(): THREE.Group {
    const g = new THREE.Group()
    g.name = 'foliage'
    if (this.blossom.idx.length) g.add(bufToMesh(this.blossom, this.c.m.blossom))
    if (this.leaves.idx.length) g.add(bufToMesh(this.leaves, this.c.m.leaf))
    return g
  }
}

// ------------------------------------------------------------------ 舞い散る花びら

const petalVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
uniform vec3 uCenter;
uniform vec3 uBox;
uniform float uPixelRatio;
attribute vec4 aSeed;
varying float vRot;
varying float vShade;
void main() {
  vec3 p = position;
  float t = uTime * (0.6 + aSeed.x * 0.5);
  p.x += t * 0.55 + sin(t * 1.3 + aSeed.y * 6.28) * 0.6;
  p.z += t * 0.25 + cos(t * 1.1 + aSeed.z * 6.28) * 0.5;
  p.y -= t * 0.55;
  // 箱の中で巻き戻す
  vec3 rel = p - uCenter + uBox * 0.5;
  rel = mod(rel, uBox);
  p = rel + uCenter - uBox * 0.5;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = (0.09 + aSeed.w * 0.06) * uPixelRatio * (520.0 / -mvPosition.z);
  vRot = uTime * (1.5 + aSeed.y * 2.0) + aSeed.z * 6.28;
  vShade = 0.8 + 0.2 * sin(uTime * 3.0 + aSeed.x * 20.0);
  #include <fog_vertex>
}
`
const petalFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uPetal;
varying float vRot;
varying float vShade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vRot); float sn = sin(vRot);
  vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  r.y *= 1.0 + 0.6 * abs(sin(vRot * 0.7));
  vec4 col = texture2D(uPetal, r + 0.5);
  if (col.a < 0.5 || abs(r.x) > 0.5 || abs(r.y) > 0.5) discard;
  gl_FragColor = vec4(col.rgb * vShade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export function createPetals(count: number, center: THREE.Vector3, size: THREE.Vector3): THREE.Points {
  const rng = mulberry32(55)
  const pos = new Float32Array(count * 3)
  const seed = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center.x + range(rng, -0.5, 0.5) * size.x
    pos[i * 3 + 1] = center.y + range(rng, -0.5, 0.5) * size.y
    pos[i * 3 + 2] = center.z + range(rng, -0.5, 0.5) * size.z
    seed[i * 4] = rng()
    seed[i * 4 + 1] = rng()
    seed[i * 4 + 2] = rng()
    seed[i * 4 + 3] = rng()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  g.boundingSphere = new THREE.Sphere(center.clone(), size.length())
  const mat = new THREE.ShaderMaterial({
    vertexShader: petalVert,
    fragmentShader: petalFrag,
    transparent: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uPetal: { value: tex(paintPetal(64), true, 1) },
      uCenter: { value: center.clone() },
      uBox: { value: size.clone() },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
      uTime: uTime,
    },
  })
  const pts = new THREE.Points(g, mat)
  pts.frustumCulled = false
  return pts
}

/** 地面に散った花びら（静的） */
export function groundPetals(c: Ctx, areas: Array<{ x0: number; x1: number; z0: number; z1: number; y: number; n: number }>): THREE.Mesh {
  const rng = mulberry32(77)
  const pos: number[] = []
  const uv: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  for (const a of areas) {
    for (let i = 0; i < a.n; i++) {
      const x = range(rng, a.x0, a.x1)
      const z = range(rng, a.z0, a.z1)
      const r = range(rng, 0, Math.PI * 2)
      const s = range(rng, 0.05, 0.09)
      const cs = Math.cos(r) * s
      const sn = Math.sin(r) * s
      const base = pos.length / 3
      for (const [u, v] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]) {
        const lx = (u - 0.5) * 1.0
        const lz = (v - 0.5) * 1.4
        pos.push(x + lx * cs - lz * sn, a.y + 0.012, z + lx * sn + lz * cs)
        uv.push(u, v)
        nor.push(0, 1, 0)
      }
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  const mat = new THREE.MeshStandardMaterial({ map: tex(paintPetal(64), true, 1), alphaTest: 0.5, roughness: 0.8, color: '#ffffff' })
  const m = new THREE.Mesh(g, mat)
  m.receiveShadow = true
  void c
  return m
}
