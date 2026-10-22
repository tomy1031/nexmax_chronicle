// この世の裏側（物語 7・11・12 章：「着物に表と裏があるように、この世にも裏側がある。裏側には時が流れとらん」）。
// 暗い紫紺の空気、青白く光るふちの浮いた石の足場（当たり判定つき）、遠くにただよう崩れたかたち（オルムが食べた物）、
// ゆっくり落ちていく光の粒。ステージの load() の中で、遠く離れた座標（例：x = +3000）に組み立てる前提。
// ・高さは origin.y = 0 で作るのがおすすめ：足場の上面は 0〜1.8 m。落ちるとプレイヤーの killY（-1.3）で最後に立った所へ戻る
// ・中にいる間の環境（空・霧・かすみ・光）は URA_ENV。UraEnvSwitch で表の環境となめらかに切りかえられる
import * as THREE from 'three'
import type { ColliderList, BoxCollider } from '../../world/colliders'
import type { StageEnvironment } from '../../game/stage'
import type { PostChain } from '../../render/post'
import type { SkyPalette } from '../../render/sky'
import { merge, withHull } from '../../world/nexmax/geom'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createToonMaterial } from './toon'
import { NOISE_GLSL, VIEW_H, disposeRoot, seeded } from './common'

export type UraPlatformDef = {
  id: string
  /** origin からの位置（x・z）と上面の高さ */
  x: number
  z: number
  top: number
  /** 幅（x）・奥行き（z） */
  w: number
  d: number
  rotY?: number
}

export type UraPlatform = UraPlatformDef & {
  /** 上面のまん中（ワールド） */
  center: THREE.Vector3
  box: BoxCollider
}

export type UraOpts = {
  /** 足場の並び（省略で、入口 → 4 つの飛び石 → 広場 → 横と奥の小さな足場） */
  platforms?: UraPlatformDef[]
  /** 空の球の半径（m、既定 170） */
  radius?: number
  /** 粒の数（既定：画質から） */
  quality?: 'low' | 'medium' | 'high'
  seed?: number
}

export type UraArena = {
  root: THREE.Group
  /** 広場のまん中（上面） */
  center: THREE.Vector3
  /** 入口の足場の上（到着・落ちたときに戻す所） */
  entry: THREE.Vector3
  /** 落ちたときに戻す所（= entry） */
  respawn: THREE.Vector3
  /** 入口の後ろ（夜明けの光の扉・閉じる扉を開く所。entry の 3.5 m 後ろ、高さ 2.2 m） */
  doorAnchor: THREE.Vector3
  /** オルムの心臓を浮かべる所（広場の奥の上） */
  heartAnchor: THREE.Vector3
  /** すじの根もとにちょうどよい所（横と奥の足場の上 1.4 m。ここへ届くすじは、足場から裂ける） */
  veinAnchors: THREE.Vector3[]
  platforms: UraPlatform[]
  /** 点光源の候補（ステージの lights に足す） */
  lights: { pos: THREE.Vector3; color: string; intensity: number; dist: number }[]
  /** これより下は落ちた（origin.y - 4） */
  fallY: number
  isFallen(p: THREE.Vector3): boolean
  /** いちばん近い足場の上面のまん中 */
  nearestTop(p: THREE.Vector3, out?: THREE.Vector3): THREE.Vector3
  update(dt: number, t: number): void
  dispose(): void
}

/** 既定の足場（origin.y = 0 で、上面は 0〜1.8 m。すき間は歩きのジャンプでとどく 1.4 m 以下、段差 0.6 m 以下） */
export const URA_DEFAULT_PLATFORMS: UraPlatformDef[] = [
  { id: 'entry', x: 0, z: 22, top: 0, w: 6, d: 5 },
  { id: 'step1', x: -1.6, z: 16.6, top: 0.3, w: 3.4, d: 3, rotY: 0.12 },
  { id: 'step2', x: 1.2, z: 12.4, top: 0.6, w: 3.2, d: 3, rotY: -0.1 },
  { id: 'step3', x: -0.6, z: 8.3, top: 0.9, w: 3.6, d: 3, rotY: 0.06 },
  { id: 'arena', x: 0, z: 0, top: 1.2, w: 15, d: 12 },
  { id: 'sideL', x: -9.6, z: -2.5, top: 1.7, w: 3.4, d: 3.4, rotY: 0.2 },
  { id: 'sideR', x: 9.6, z: -2.5, top: 1.7, w: 3.4, d: 3.4, rotY: -0.2 },
  { id: 'backL', x: -6.2, z: -8.4, top: 1.8, w: 3, d: 3, rotY: -0.15 },
  { id: 'backR', x: 6.2, z: -8.4, top: 1.8, w: 3, d: 3, rotY: 0.15 },
]

/** 裏側の空の色（表の空のシェーダにそのまま入れられる形） */
export const URA_SKY: SkyPalette = {
  zenith: '#05031a',
  upper: '#120b34',
  horizon: '#2a2160',
  warm: '#3a2a6a',
  ground: '#07051a',
  haze: '#241c52',
  cloudLit: '#2a2a5a',
  cloudShade: '#100c28',
}

/** 裏側にいる間の環境（StageEnvironment の形。UraEnvSwitch か、ステージの environment に） */
export const URA_ENV: StageEnvironment = {
  sky: URA_SKY,
  sunDir: new THREE.Vector3(0.2, 0.9, 0.3).normalize(),
  sunColor: '#8a9cff',
  sunIntensity: 0.6,
  hemi: { sky: '#6a7ad8', ground: '#1e1236', intensity: 0.7 },
  hdri: null,
  envIntensity: 0.35,
  fog: { color: '#160f34', density: 0.011 },
  grade: { exposure: 1.15, saturation: 1.15, contrast: 1.08, vignette: 0.42 },
  bloom: { intensity: 1.4, threshold: 0.85 },
  haze: { near: '#2a1f5a', far: '#140c34', density: 0.004, start: 30, falloff: 0.02, max: 0.55 },
}

// ------------------------------------------------------------------ 空の球

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const skyFrag = /* glsl */ `
uniform float uTime;
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 top = vec3(0.012, 0.008, 0.06);
  vec3 mid = vec3(0.06, 0.04, 0.16);
  vec3 low = vec3(0.01, 0.006, 0.03);
  vec3 col = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, low, pow(-h, 0.5));
  // うずまくもや（紫と青）
  vec2 uv = vec2(atan(d.z, d.x) * 1.6, h * 3.0);
  float n = cvFbm(uv * 1.3 + vec2(uTime * 0.01, 0.0));
  float n2 = cvFbm(uv * 2.4 - vec2(0.0, uTime * 0.015) + 7.0);
  col += vec3(0.1, 0.05, 0.24) * pow(n, 3.0) * (1.0 - abs(h)) * 1.1;
  col += vec3(0.04, 0.1, 0.26) * pow(n2, 4.0) * 1.3;
  // 遠い光の点
  vec2 sp = uv * 18.0;
  vec2 g = floor(sp);
  float hs = cvHash(g);
  float st = smoothstep(0.06, 0.0, length(fract(sp) - vec2(cvHash(g + 1.3), cvHash(g + 7.7)))) * step(0.82, hs);
  col += vec3(0.6, 0.7, 1.0) * st * (0.5 + 0.5 * sin(uTime * (1.0 + hs * 3.0) + hs * 40.0));
  gl_FragColor = vec4(col, 1.0);
}
`

// ------------------------------------------------------------------ 落ちていく粒（GPU で動かす）

const moteVert = /* glsl */ `
uniform float uTime;
uniform float uViewH;
uniform vec3 uBox;
attribute vec4 aSeed;
varying float vA;
void main() {
  vec3 p = position;
  float t = uTime * (0.25 + aSeed.x * 0.45);
  p.y = mod(position.y - t + uBox.y, uBox.y * 2.0) - uBox.y;
  p.x += sin(uTime * 0.3 + aSeed.y * 6.28) * 0.8;
  p.z += cos(uTime * 0.25 + aSeed.z * 6.28) * 0.8;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = 0.05 + aSeed.w * 0.07;
  gl_PointSize = size * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z);
  vA = smoothstep(uBox.y, uBox.y * 0.7, abs(p.y)) * (0.5 + 0.5 * sin(uTime * 2.0 + aSeed.y * 30.0));
}
`
const moteFrag = /* glsl */ `
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.6, 0.78, 1.3) * a, a);
}
`

// ------------------------------------------------------------------ 足場の形

/** 角の丸い四角の周り（n 点、反時計回り） */
function roundRect(w: number, d: number, r: number, n: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = []
  const hw = w / 2 - r
  const hd = d / 2 - r
  const per = Math.max(2, Math.floor(n / 4))
  const corners: [number, number, number][] = [
    [hw, hd, 0],
    [-hw, hd, Math.PI / 2],
    [-hw, -hd, Math.PI],
    [hw, -hd, Math.PI * 1.5],
  ]
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= per; i++) {
      const a = a0 + (i / per) * (Math.PI / 2)
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cz + Math.sin(a) * r))
    }
  }
  return pts
}

/** 足場 1 つ（上面＋側面＋とがった下側）。頂点色つき（上は白っぽく、下は暗い青へ） */
function platformGeometry(w: number, d: number, rnd: () => number): { body: THREE.BufferGeometry; rim: THREE.BufferGeometry; cracks: THREE.BufferGeometry } {
  const per = roundRect(w, d, Math.min(0.6, Math.min(w, d) * 0.2), 28)
  const n = per.length
  const top = new THREE.Color('#b7c9dd')
  const side = new THREE.Color('#6d7e9f')
  const under = new THREE.Color('#35425e')
  // 上面（扇）
  const tp: number[] = [0, 0, 0]
  const tc: number[] = [top.r, top.g, top.b]
  for (const p of per) {
    tp.push(p.x * Math.max(0.5, 1 - 0.16 / w), 0, p.y * Math.max(0.5, 1 - 0.16 / d))
    tc.push(top.r, top.g, top.b)
  }
  const ti: number[] = []
  for (let i = 0; i < n; i++) ti.push(0, 1 + ((i + 1) % n), 1 + i)
  const cap = new THREE.BufferGeometry()
  cap.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3))
  cap.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3))
  cap.setIndex(ti)
  cap.computeVertexNormals()
  // 側面と下：輪を重ねて先へしぼる
  const depth = 0.9 + Math.max(w, d) * 0.18
  const rings: { y: number; s: number; c: THREE.Color; j: number }[] = [
    { y: 0, s: 1.0, c: top, j: 0 },
    { y: -0.08, s: 1.0, c: side, j: 0 },
    { y: -0.42, s: 1.0, c: side, j: 0.04 },
    { y: -depth * 0.5, s: 0.82, c: side.clone().lerp(under, 0.4), j: 0.12 },
    { y: -depth * 0.82, s: 0.48, c: under, j: 0.18 },
    { y: -depth, s: 0.19, c: under, j: 0.12 },
  ]
  const bp: number[] = []
  const bc: number[] = []
  // 元の4断面分だけ乱数を消費し、足場の改修で背景遺構の配置まで変わらないようにする。
  const jitter = Array.from({ length: 4 }, () => per.map(() => [rnd() - 0.5, rnd() - 0.5]))
  const sourceRing = [0, 0, 1, 2, 3, 3]
  rings.forEach((rg, ringIndex) => {
    per.forEach((p, i) => {
      const [jx, jy] = jitter[sourceRing[ringIndex]][i]
      const jit = 1 + jx * rg.j * 2
      bp.push(p.x * rg.s * jit * (rg.y === 0 ? Math.max(0.5, 1 - 0.16 / w) : 1), rg.y + jy * rg.j, p.y * rg.s * jit * (rg.y === 0 ? Math.max(0.5, 1 - 0.16 / d) : 1))
      bc.push(rg.c.r, rg.c.g, rg.c.b)
    })
  })
  const tip = rings.length * n
  bp.push((rnd() - 0.5) * 0.4, -depth, (rnd() - 0.5) * 0.4)
  bc.push(under.r * 0.7, under.g * 0.7, under.b * 0.7)
  const bi: number[] = []
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i
      const b = r * n + ((i + 1) % n)
      const c = (r + 1) * n + i
      const e = (r + 1) * n + ((i + 1) % n)
      bi.push(a, b, c, b, e, c)
    }
  }
  for (let i = 0; i < n; i++) bi.push((rings.length - 1) * n + i, (rings.length - 1) * n + ((i + 1) % n), tip)
  let body = new THREE.BufferGeometry()
  body.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3))
  body.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3))
  body.setIndex(bi)
  body = mergeVertices(body, 1e-4)
  body.computeVertexNormals()
  // 巻き順を外向きに（上から見て反時計回りの周りなので、外向きになるよう確かめる）
  fixOutward(body)
  const uvs = (g: THREE.BufferGeometry) => g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
  uvs(cap)
  uvs(body)
  const merged = merge([withHull(cap), withHull(body)])
  // ふちの光る線（上面のまわりの細い帯）と、上面の光るひび
  const rp: number[] = []
  const ri: number[] = []
  for (let i = 0; i < n; i++) {
    const p = per[i]
    const o = 0.995
    rp.push(p.x * Math.max(0.5, 1 - 0.16 / w), 0.012, p.y * Math.max(0.5, 1 - 0.16 / d), p.x * o, -0.06, p.y * o)
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2
    const b = ((i + 1) % n) * 2
    ri.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const rim = new THREE.BufferGeometry()
  rim.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3))
  rim.setIndex(ri)
  const cp: number[] = []
  const ci: number[] = []
  const nCr = 2 + Math.floor(rnd() * 3)
  for (let k = 0; k < nCr; k++) {
    let x = (rnd() - 0.5) * w * 0.6
    let z = (rnd() - 0.5) * d * 0.6
    let a = rnd() * Math.PI * 2
    for (let s = 0; s < 6; s++) {
      a += (rnd() - 0.5) * 1.2
      const len = 0.25 + rnd() * 0.35
      const nx = Math.max(-w / 2 + 0.3, Math.min(w / 2 - 0.3, x + Math.cos(a) * len))
      const nz = Math.max(-d / 2 + 0.3, Math.min(d / 2 - 0.3, z + Math.sin(a) * len))
      const px = -Math.sin(a) * 0.018
      const pz = Math.cos(a) * 0.018
      const base = cp.length / 3
      cp.push(x - px, 0.011, z - pz, x + px, 0.011, z + pz, nx - px, 0.011, nz - pz, nx + px, 0.011, nz + pz)
      ci.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
      x = nx
      z = nz
    }
  }
  const cracks = new THREE.BufferGeometry()
  cracks.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3))
  cracks.setIndex(ci)
  return { body: merged, rim, cracks }
}

/** 三角形の向きを、中心（y 軸）から外向きにそろえる */
function fixOutward(g: THREE.BufferGeometry): void {
  const pos = g.attributes.position
  const ix = g.index!.array as Uint16Array | Uint32Array
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const n = new THREE.Vector3()
  const m = new THREE.Vector3()
  for (let i = 0; i < ix.length; i += 3) {
    a.fromBufferAttribute(pos, ix[i])
    b.fromBufferAttribute(pos, ix[i + 1])
    c.fromBufferAttribute(pos, ix[i + 2])
    n.subVectors(b, a).cross(m.subVectors(c, a))
    m.addVectors(a, b).add(c).divideScalar(3)
    m.y = Math.min(0, m.y) * 0.3
    if (n.dot(m) < 0) {
      const t = ix[i + 1]
      ix[i + 1] = ix[i + 2]
      ix[i + 2] = t
    }
  }
  g.computeVertexNormals()
}

// ------------------------------------------------------------------ 遠くの崩れたかたち

function ruinPiece(kind: number, rnd: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, m: THREE.Matrix4) => {
    g.applyMatrix4(m)
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    parts.push(g.index ? g.toNonIndexed() : g)
  }
  const T = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = new THREE.Vector3(1, 1, 1)) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), s)
  switch (kind % 6) {
    case 0: // 折れた柱
      add(new THREE.CylinderGeometry(0.9, 1.0, 7 + rnd() * 5, 10), T(0, 0, 0))
      add(new THREE.CylinderGeometry(0.9, 0.9, 2.5, 10), T(1.6, 5.5, 0.4, 0.3, 0, 0.9))
      break
    case 1: // かたむいた門（鳥居のような）
      add(new THREE.BoxGeometry(0.8, 8, 0.8), T(-3, 0, 0))
      add(new THREE.BoxGeometry(0.8, 6, 0.8), T(3, -1, 0))
      add(new THREE.BoxGeometry(9, 0.8, 1.0), T(0, 4.2, 0, 0, 0, 0.12))
      add(new THREE.BoxGeometry(8, 0.5, 0.7), T(0, 3, 0))
      break
    case 2: // 家のかけら（屋根つき）
      add(new THREE.BoxGeometry(5, 3.6, 4), T(0, 0, 0))
      add(new THREE.ConeGeometry(4.2, 2.6, 4), T(0, 3.1, 0, 0, Math.PI / 4, 0))
      break
    case 3: // 時計台のかけら（丸い文字盤）
      add(new THREE.BoxGeometry(3, 9, 3), T(0, 0, 0))
      add(new THREE.TorusGeometry(1.2, 0.18, 6, 20), T(0, 2.5, -1.6))
      add(new THREE.ConeGeometry(2.4, 3, 4), T(0, 6, 0, 0, Math.PI / 4, 0.25))
      break
    case 4: // 石像の頭
      add(new THREE.SphereGeometry(2.2, 10, 8), T(0, 0, 0))
      add(new THREE.ConeGeometry(1.4, 3.2, 8), T(0, 2.6, 0))
      break
    default: // 岩のかたまり
      add(new THREE.DodecahedronGeometry(2.5 + rnd() * 2, 0), T(0, 0, 0))
      add(new THREE.DodecahedronGeometry(1.4, 0), T(2.6, 1.2, 0.5))
  }
  return merge(
    parts.map((p) => {
      p.computeVertexNormals()
      return p
    }),
  )
}

// ------------------------------------------------------------------ 組み立て

/**
 * 裏側の空間を root の下に組み立て、足場の当たり判定を colliders に足す。
 * origin：広場のまん中の基準（上面は origin.y + 1.2）。遠く離れた場所に置くこと（例：new Vector3(3000, 0, 0)）
 */
export function buildUraArena(root: THREE.Object3D, colliders: ColliderList, origin: THREE.Vector3, opts: UraOpts = {}): UraArena {
  const rnd = seeded(opts.seed ?? 11)
  const group = new THREE.Group()
  group.name = 'uraArena'
  group.position.copy(origin)
  root.add(group)
  const R = opts.radius ?? 170
  const q = opts.quality ?? 'medium'
  const geos: THREE.BufferGeometry[] = []
  const mats: THREE.Material[] = []

  // 空の球（表の空を内側からおおう）
  const skyMat = new THREE.ShaderMaterial({ vertexShader: skyVert, fragmentShader: skyFrag, uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false, fog: false })
  const skyGeo = new THREE.SphereGeometry(R, 40, 20)
  const sky = new THREE.Mesh(skyGeo, skyMat)
  sky.renderOrder = -9
  sky.frustumCulled = false
  sky.name = 'uraSky'
  group.add(sky)
  geos.push(skyGeo)
  mats.push(skyMat)

  // 足場
  const defs = opts.platforms ?? URA_DEFAULT_PLATFORMS
  const stoneMat = createToonMaterial({ line: '#141a3a', selfLight: 0.22, rim: '#8fb4ff', rimK: 0.2 })
  const rimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fd8ff').multiplyScalar(0.85), toneMapped: false, side: THREE.DoubleSide })
  const crackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8fc8ff').multiplyScalar(1.2), toneMapped: false, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide })
  mats.push(stoneMat, rimMat, crackMat)
  const bodies: THREE.BufferGeometry[] = []
  const rims: THREE.BufferGeometry[] = []
  const cracks: THREE.BufferGeometry[] = []
  const platforms: UraPlatform[] = []
  for (const def of defs) {
    const pg = platformGeometry(def.w, def.d, rnd)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(def.x, def.top, def.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), def.rotY ?? 0), new THREE.Vector3(1, 1, 1))
    bodies.push(pg.body.applyMatrix4(m))
    // 最初の着地点にだけ二つの山形。足場の縁と同じ材質へまとめ、描画は増やさない。
    if (def.id === 'step1') {
      const guidePos: number[] = [], guideIx: number[] = []
      for (let i = 0; i < 2; i++) {
        const z = (i - 0.5) * 0.48
        const base = guidePos.length / 3
        guidePos.push(-0.15, 0.018, z + 0.12, 0, 0.018, z - 0.03, 0.15, 0.018, z + 0.12, 0.15, 0.018, z + 0.19, 0, 0.018, z + 0.04, -0.15, 0.018, z + 0.19)
        guideIx.push(base, base + 1, base + 4, base, base + 4, base + 5, base + 1, base + 2, base + 3, base + 1, base + 3, base + 4)
      }
      const guide = new THREE.BufferGeometry()
      guide.setAttribute('position', new THREE.Float32BufferAttribute(guidePos, 3))
      guide.setIndex(guideIx)
      rims.push(guide.applyMatrix4(m))
    }
    rims.push(pg.rim.applyMatrix4(m))
    cracks.push(pg.cracks.applyMatrix4(m))
    const center = new THREE.Vector3(origin.x + def.x, origin.y + def.top, origin.z + def.z)
    // 当たり判定：上面の四角（厚さ 0.8）
    const box = colliders.box(center.x, center.y - 0.4, center.z, def.w, 0.8, def.d, def.rotY ?? 0)
    platforms.push({ ...def, center, box })
  }
  const bodyG = merge(bodies)
  bodyG.computeBoundingSphere()
  const stones = new THREE.Mesh(bodyG, stoneMat)
  stones.name = 'uraPlatforms'
  stones.castShadow = true
  stones.receiveShadow = true
  group.add(stones)
  const rimG = mergeIndexed(rims)
  const rimMesh = new THREE.Mesh(rimG, rimMat)
  rimMesh.name = 'uraRims'
  group.add(rimMesh)
  const crackG = mergeIndexed(cracks)
  const crackMesh = new THREE.Mesh(crackG, crackMat)
  crackMesh.name = 'uraCracks'
  crackMesh.renderOrder = 1
  group.add(crackMesh)
  geos.push(bodyG, rimG, crackG)
  for (const g of [...bodies, ...rims, ...cracks]) if (g !== bodyG && g !== rimG && g !== crackG) g.dispose()

  // 遠くの崩れたかたち（3 つの群れが、それぞれゆっくり回る）
  const ruinMat = createToonMaterial({ line: '#0a0820', selfLight: 0.12, rim: '#7a8cff', rimK: 0.8 })
  mats.push(ruinMat)
  const rings: THREE.Group[] = []
  for (let gI = 0; gI < 3; gI++) {
    const ring = new THREE.Group()
    ring.name = `uraRuins${gI}`
    const list: THREE.BufferGeometry[] = []
    const n = 6
    for (let i = 0; i < n; i++) {
      const g = ruinPiece(i + gI * 2, rnd)
      const a = (i / n) * Math.PI * 2 + gI * 0.9 + rnd() * 0.5
      const dist = 55 + gI * 25 + rnd() * 15
      const y = -18 + rnd() * 50
      const s = 0.8 + rnd() * 1.4
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * dist, y, Math.sin(a) * dist), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - 0.5) * 1.2, rnd() * 6, (rnd() - 0.5) * 1.2)), new THREE.Vector3(s, s, s)))
      const gc = g.attributes.position.count
      const col = new Float32Array(gc * 3)
      const c = new THREE.Color('#3a3a62').lerp(new THREE.Color('#6a6a9a'), rnd())
      for (let k = 0; k < gc; k++) {
        col[k * 3] = c.r
        col[k * 3 + 1] = c.g
        col[k * 3 + 2] = c.b
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3))
      list.push(g)
    }
    const rg = merge(list.map((g) => withHull(g)))
    for (const g of list) g.dispose()
    const mesh = new THREE.Mesh(rg, ruinMat)
    mesh.frustumCulled = false
    ring.add(mesh)
    geos.push(rg)
    group.add(ring)
    rings.push(ring)
  }

  // ゆっくり落ちていく光の粒（GPU で動く）
  const count = q === 'low' ? 500 : q === 'high' ? 1400 : 900
  const box = new THREE.Vector3(36, 18, 36)
  const mp = new Float32Array(count * 3)
  const ms = new Float32Array(count * 4)
  for (let i = 0; i < count; i++) {
    mp[i * 3] = (rnd() * 2 - 1) * box.x
    mp[i * 3 + 1] = (rnd() * 2 - 1) * box.y + 4
    mp[i * 3 + 2] = (rnd() * 2 - 1) * box.z
    ms[i * 4] = rnd()
    ms[i * 4 + 1] = rnd()
    ms[i * 4 + 2] = rnd()
    ms[i * 4 + 3] = rnd()
  }
  const moteG = new THREE.BufferGeometry()
  moteG.setAttribute('position', new THREE.BufferAttribute(mp, 3))
  moteG.setAttribute('aSeed', new THREE.BufferAttribute(ms, 4))
  const moteMat = new THREE.ShaderMaterial({
    vertexShader: moteVert,
    fragmentShader: moteFrag,
    uniforms: { uTime: { value: 0 }, uViewH: VIEW_H, uBox: { value: box } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const motes = new THREE.Points(moteG, moteMat)
  motes.frustumCulled = false
  motes.position.y = 4
  motes.renderOrder = 3
  motes.name = 'uraMotes'
  group.add(motes)
  geos.push(moteG)
  mats.push(moteMat)

  const at = (x: number, y: number, z: number) => new THREE.Vector3(origin.x + x, origin.y + y, origin.z + z)
  const entryDef = defs.find((d) => d.id === 'entry') ?? defs[0]
  const arenaDef = defs.find((d) => d.id === 'arena') ?? defs[0]
  const entry = at(entryDef.x, entryDef.top, entryDef.z)
  const center = at(arenaDef.x, arenaDef.top, arenaDef.z)
  const veinAnchors = defs.filter((d) => /^(side|back)/.test(d.id)).map((d) => at(d.x, d.top + 1.4, d.z))
  const lights = [
    { pos: at(arenaDef.x, arenaDef.top + 3, arenaDef.z), color: '#8fb0ff', intensity: 1.6, dist: 16 },
    { pos: at(entryDef.x, entryDef.top + 2.5, entryDef.z), color: '#a8c8ff', intensity: 1.2, dist: 10 },
  ]
  const arena: UraArena = {
    root: group,
    center,
    entry,
    respawn: entry.clone(),
    doorAnchor: at(entryDef.x, entryDef.top + 2.2, entryDef.z + 3.5),
    heartAnchor: at(arenaDef.x, arenaDef.top + 5.5, arenaDef.z - 15),
    veinAnchors,
    platforms,
    lights,
    fallY: origin.y - 4,
    isFallen: (p) => p.y < origin.y - 4,
    nearestTop(p, out = new THREE.Vector3()) {
      let best = platforms[0]
      let bd = Infinity
      for (const pl of platforms) {
        const d = pl.center.distanceToSquared(p)
        if (d < bd) {
          bd = d
          best = pl
        }
      }
      return out.copy(best.center)
    },
    update(_dt, t) {
      skyMat.uniforms.uTime.value = t
      moteMat.uniforms.uTime.value = t
      rings.forEach((r, i) => {
        r.rotation.y = t * (0.004 + i * 0.002) * (i % 2 ? -1 : 1)
        r.position.y = Math.sin(t * 0.1 + i) * 1.5
      })
      // ふちの光のゆっくりした明滅
      const k = 1.45 + Math.sin(t * 1.3) * 0.2
      rimMat.color.set('#9fd8ff').multiplyScalar(k)
    },
    dispose() {
      disposeRoot(group)
      for (const g of geos) g.dispose()
      for (const m of mats) m.dispose()
    },
  }
  return arena
}

/** index 付きの形をまとめる（位置だけ） */
function mergeIndexed(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0
  let m = 0
  for (const g of list) {
    n += g.attributes.position.count
    m += g.index ? g.index.count : 0
  }
  const pos = new Float32Array(n * 3)
  const ix = new Uint32Array(m)
  let vo = 0
  let io = 0
  for (const g of list) {
    pos.set(g.attributes.position.array as Float32Array, vo * 3)
    const src = g.index!.array
    for (let i = 0; i < src.length; i++) ix[io + i] = src[i] + vo
    vo += g.attributes.position.count
    io += src.length
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setIndex(new THREE.BufferAttribute(ix, 1))
  out.computeBoundingSphere()
  return out
}

// ------------------------------------------------------------------ 表 ⇄ 裏の環境の切りかえ

export type UraEnvTargets = {
  scene: THREE.Scene
  /** シェルの空のドーム（rt.sky） */
  sky?: THREE.Mesh | null
  sun?: THREE.DirectionalLight | null
  hemi?: THREE.HemisphereLight | null
  post?: PostChain | null
}

type EnvSnap = {
  sky: Record<string, THREE.Color>
  skySun: number
  fog: { color: THREE.Color; density: number } | null
  sunColor: THREE.Color
  sunI: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiI: number
  envI: number
  grade: Record<string, number>
  bloomI: number
  bloomT: number
  haze: Record<string, THREE.Color | number>
}

const SKY_KEYS: [keyof SkyPalette, string][] = [
  ['zenith', 'uZenith'],
  ['upper', 'uUpper'],
  ['horizon', 'uHorizon'],
  ['warm', 'uWarm'],
  ['ground', 'uGround'],
  ['haze', 'uHaze'],
  ['cloudLit', 'uCloudLit'],
  ['cloudShade', 'uCloudShade'],
]

type HazeLike = { name: string; uniforms: Map<string, THREE.Uniform> }
function findHaze(post: PostChain): HazeLike | null {
  for (const pass of post.composer.passes) {
    const effects = (pass as unknown as { effects?: HazeLike[] }).effects
    if (!Array.isArray(effects)) continue
    for (const e of effects) if (e && e.name === 'HazeEffect') return e
  }
  return null
}

/**
 * 表の環境と URA_ENV を k（0 = 表、1 = 裏）でなめらかにまぜる。作ったときの表の値を覚え、set(0) でもどす。
 * 使い方：const sw = new UraEnvSwitch({ scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post })
 *        → 毎フレーム sw.set(k)（扉をくぐる演出の間に 0→1）
 */
export class UraEnvSwitch {
  private readonly t: UraEnvTargets
  private snap: EnvSnap
  private readonly env: StageEnvironment
  private k = -1
  private readonly ownFog: THREE.FogExp2

  constructor(t: UraEnvTargets, env: StageEnvironment = URA_ENV) {
    this.t = t
    this.env = env
    this.ownFog = new THREE.FogExp2('#000000', 0)
    this.snap = this.capture()
  }

  /** いまの（表の）値を覚えなおす */
  capture(): EnvSnap {
    const t = this.t
    const u = (t.sky?.material as THREE.ShaderMaterial | undefined)?.uniforms
    const sky: Record<string, THREE.Color> = {}
    if (u) for (const [, k] of SKY_KEYS) if (u[k]) sky[k] = (u[k].value as THREE.Color).clone()
    const f = t.scene.fog as THREE.FogExp2 | null
    const haze: Record<string, THREE.Color | number> = {}
    const hz = t.post ? findHaze(t.post) : null
    if (hz) for (const [k, v] of hz.uniforms) haze[k] = (v.value as THREE.Color).isColor ? (v.value as THREE.Color).clone() : (v.value as number)
    const grade: Record<string, number> = {}
    if (t.post) for (const k of ['gExposure', 'gSaturation', 'gContrast', 'gVignette']) grade[k] = (t.post.grade.uniforms.get(k)?.value as number) ?? 1
    this.snap = {
      sky,
      skySun: (u?.uSunStrength?.value as number) ?? 1,
      fog: f && f !== this.ownFog ? { color: f.color.clone(), density: f.density } : null,
      sunColor: t.sun?.color.clone() ?? new THREE.Color(),
      sunI: t.sun?.intensity ?? 0,
      hemiSky: t.hemi?.color.clone() ?? new THREE.Color(),
      hemiGround: t.hemi?.groundColor.clone() ?? new THREE.Color(),
      hemiI: t.hemi?.intensity ?? 0,
      envI: t.scene.environmentIntensity,
      grade,
      bloomI: t.post?.bloom.intensity ?? 1,
      bloomT: t.post?.bloom.luminanceMaterial.threshold ?? 0.95,
      haze,
    }
    return this.snap
  }

  /** 0 = 表、1 = 裏 */
  set(k: number): void {
    k = Math.max(0, Math.min(1, k))
    if (Math.abs(k - this.k) < 1e-4) return
    this.k = k
    const t = this.t
    const s = this.snap
    const e = this.env
    const tc = new THREE.Color()
    const u = (t.sky?.material as THREE.ShaderMaterial | undefined)?.uniforms
    if (u) {
      for (const [pk, uk] of SKY_KEYS) if (u[uk] && s.sky[uk]) (u[uk].value as THREE.Color).copy(s.sky[uk]).lerp(tc.set(e.sky[pk]), k)
      if (u.uSunStrength) u.uSunStrength.value = s.skySun * (1 - k) + 0.02 * k
    }
    // 霧
    const ef = e.fog
    if (k <= 0) {
      t.scene.fog = s.fog ? new THREE.FogExp2(s.fog.color, s.fog.density) : null
    } else {
      const fog = this.ownFog
      const c0 = s.fog?.color ?? tc.set(ef?.color ?? '#000000')
      fog.color.copy(c0).lerp(new THREE.Color(ef?.color ?? '#000000'), k)
      fog.density = (s.fog?.density ?? 0) * (1 - k) + (ef?.density ?? 0) * k
      t.scene.fog = fog
    }
    if (t.sun) {
      t.sun.color.copy(s.sunColor).lerp(tc.set(e.sunColor ?? '#ffffff'), k)
      t.sun.intensity = s.sunI * (1 - k) + (e.sunIntensity ?? s.sunI) * k
    }
    if (t.hemi && e.hemi) {
      t.hemi.color.copy(s.hemiSky).lerp(tc.set(e.hemi.sky), k)
      t.hemi.groundColor.copy(s.hemiGround).lerp(tc.set(e.hemi.ground), k)
      t.hemi.intensity = s.hemiI * (1 - k) + e.hemi.intensity * k
    }
    t.scene.environmentIntensity = s.envI * (1 - k) + (e.envIntensity ?? s.envI) * k
    if (t.post) {
      const g = e.grade ?? {}
      const mix = (key: string, v: number | undefined) => {
        const a = s.grade[key] ?? 1
        t.post!.grade.set(key as 'gExposure', a * (1 - k) + (v ?? a) * k)
      }
      mix('gExposure', g.exposure)
      mix('gSaturation', g.saturation)
      mix('gContrast', g.contrast)
      mix('gVignette', g.vignette)
      if (t.post.bloom.intensity > 0 || s.bloomI > 0) t.post.bloom.intensity = s.bloomI * (1 - k) + (e.bloom?.intensity ?? s.bloomI) * k
      t.post.bloom.luminanceMaterial.threshold = s.bloomT * (1 - k) + (e.bloom?.threshold ?? s.bloomT) * k
      const hz = findHaze(t.post)
      const h = e.haze
      if (hz && h) {
        const setC = (name: string, to: THREE.ColorRepresentation | undefined) => {
          const v = hz.uniforms.get(name)?.value as THREE.Color | undefined
          const from = s.haze[name] as THREE.Color | undefined
          if (v && from && to !== undefined) v.copy(from).lerp(tc.set(to), k)
        }
        const setN = (name: string, to: number | undefined) => {
          const un = hz.uniforms.get(name)
          const from = s.haze[name] as number | undefined
          if (un && from !== undefined && to !== undefined) un.value = from * (1 - k) + to * k
        }
        setC('hNear', h.near)
        setC('hFar', h.far)
        setN('hDensity', h.density)
        setN('hStart', h.start)
        setN('hFalloff', h.falloff)
        setN('hMax', h.max)
      }
    }
  }
}
