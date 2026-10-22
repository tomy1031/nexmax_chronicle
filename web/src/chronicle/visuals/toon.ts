// 人の形・ランプ・裏側の足場などで使う、トゥーンの材質（明暗 3 段・頂点色）と反転ハルの輪郭線。
// 輪郭線はネクマックスと同じ作り（world/nexmax/geom.ts の withHull：aOutline=1 の頂点だけ外へ押し出す）で、
// 部品を関節ごとに 1 つのジオメトリへまとめれば、輪郭線ごと 1 回の描画で出せる。
// 太さの計算（画面の高さに対する割合と最小の画素）はネクマックスの OUTLINE を共有する。
import * as THREE from 'three'
import { OUTLINE, OUTLINE_WIDTH_GLSL } from '../../world/nexmax/materials'
import { merge, paint, withHull } from '../../world/nexmax/geom'

/** トゥーンの明暗の段（暗い所でも 6 割強の明るさ。子どもが見て顔や服の色がわかるように） */
let ramp: THREE.DataTexture | null = null
export function toonRamp(): THREE.DataTexture {
  if (ramp) return ramp
  const d = new Uint8Array([158, 158, 158, 255, 210, 210, 210, 255, 250, 250, 250, 255])
  ramp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat)
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter
  ramp.generateMipmaps = false
  ramp.needsUpdate = true
  return ramp
}

/** 人物だけに使う柔らかな5段。怪物・小道具の3段ランプは維持する。 */
let personRamp: THREE.DataTexture | null = null
export function personToonRamp(): THREE.DataTexture {
  if (personRamp) return personRamp
  const levels = [130, 165, 195, 223, 245]
  personRamp = new THREE.DataTexture(new Uint8Array(levels.flatMap(v => [v, v, v, 255])), 5, 1, THREE.RGBAFormat)
  personRamp.minFilter = personRamp.magFilter = THREE.NearestFilter
  personRamp.generateMipmaps = false
  personRamp.needsUpdate = true
  return personRamp
}

export function createPersonMaterial(o: ToonOpts = {}): THREE.MeshToonMaterial {
  // 暗いコートも夜の空との境界を保つ、ごく弱い空色の回り込み。
  const m = createToonMaterial({ ...o, selfLight: o.selfLight ?? 0.12, rim: o.rim ?? '#7788a8', rimK: o.rimK ?? (o.rim ? 1 : 0.06) })
  m.gradientMap = personToonRamp()
  const base = m.onBeforeCompile
  m.onBeforeCompile = (shader, renderer) => {
    base.call(m, shader, renderer)
    // 強い暖色の太陽で肌と布が飽和しないように、人物は空の回り込みを少し多く受ける。
    const lights = THREE.ShaderChunk.lights_toon_pars_fragment.replace(
      'getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color',
      'getGradientIrradiance( geometryNormal, directLight.direction ) * mix(directLight.color, vec3(dot(directLight.color, vec3(0.2126, 0.7152, 0.0722))), 0.3)',
    )
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_toon_pars_fragment>', lights)
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n reflectedLight.directDiffuse *= 0.85;\n reflectedLight.indirectDiffuse *= 1.15;')
      .replace('#include <opaque_fragment>', 'float personLuma = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));\n outgoingLight = mix(vec3(personLuma), outgoingLight, 0.84);\n #include <opaque_fragment>')
  }
  m.customProgramCacheKey = () => 'cvPersonToon5'
  return m
}

export type ToonOpts = {
  /** 輪郭線の色（既定：こい茶） */
  line?: THREE.ColorRepresentation
  /** 輪郭線の太さの倍率（ネクマックスの線に対して。既定 0.8） */
  lineScale?: number
  /** 自分の色をどれだけ光らせるか（暗い所でも色が残る。既定 0.2） */
  selfLight?: number
  /** ふちの光（逆光のような。暗い場面で形を見せる） */
  rim?: THREE.ColorRepresentation
  rimK?: number
  map?: THREE.Texture | null
  transparent?: boolean
  opacity?: number
  side?: THREE.Side
  alphaTest?: number
}

export type ToonUniforms = {
  uLineColor: { value: THREE.Color }
  uLineScale: { value: number }
  uSelfLight: { value: number }
  uRimColor: { value: THREE.Color }
}

/** トゥーン材質（頂点色）。aOutline=1 の頂点は輪郭線として外へ押し出して線の色で塗る */
export function createToonMaterial(o: ToonOpts = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: '#ffffff',
    vertexColors: true,
    gradientMap: toonRamp(),
    map: o.map ?? null,
    transparent: o.transparent ?? false,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
    alphaTest: o.alphaTest ?? 0,
  })
  const u: ToonUniforms = {
    uLineColor: { value: new THREE.Color(o.line ?? '#2a1a12') },
    uLineScale: { value: o.lineScale ?? 0.8 },
    uSelfLight: { value: o.selfLight ?? 0.2 },
    uRimColor: { value: new THREE.Color(o.rim ?? '#000000').multiplyScalar(o.rimK ?? (o.rim ? 1 : 0)) },
  }
  m.userData.toon = u
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u, {
      uOutlineWidth: OUTLINE.width,
      uOutlineMin: OUTLINE.minWorld,
      uOutlineMinPx: OUTLINE.minPx,
      uOutlineViewH: OUTLINE.viewportH,
    })
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aOutline;
varying float vOutline;
uniform float uOutlineWidth;
uniform float uOutlineMin;
uniform float uOutlineMinPx;
uniform float uOutlineViewH;
uniform float uLineScale;
${OUTLINE_WIDTH_GLSL}`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
  vOutline = aOutline;
  if (aOutline > 0.5) {
    vec3 nV = normalize(normalMatrix * objectNormal);
    mvPosition.xyz += nV * nxOutlineWidth(-mvPosition.z, uOutlineMin) * uLineScale;
    gl_Position = projectionMatrix * mvPosition;
  }`,
      )
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying float vOutline;
uniform vec3 uLineColor;
uniform vec3 uRimColor;
uniform float uSelfLight;`,
      )
      .replace('void main() {', 'void main() {\n  if (vOutline > 0.5) { gl_FragColor = vec4(uLineColor, opacity); return; }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * uSelfLight;
  float cvRim = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  totalEmissiveRadiance += uRimColor * (cvRim * cvRim * cvRim);`,
      )
  }
  m.customProgramCacheKey = () => 'cvToon'
  return m
}

/** トゥーン材質のふちの光を変える */
export function setToonRim(m: THREE.Material, color: THREE.ColorRepresentation, k = 1): void {
  const u = m.userData.toon as ToonUniforms | undefined
  if (u) u.uRimColor.value.set(color).multiplyScalar(k)
}

/** トゥーン材質の自分の光を変える（暗い場面で見せたいとき） */
export function setToonSelfLight(m: THREE.Material, k: number): void {
  const u = m.userData.toon as ToonUniforms | undefined
  if (u) u.uSelfLight.value = k
}

// ------------------------------------------------------------------ 部品を関節ごとにまとめる

type Bucket = { line: THREE.BufferGeometry[]; flat: THREE.BufferGeometry[] }

/**
 * 部品（形・色・関節の中での行列）を集め、最後に関節ごとに 1 つのメッシュ（輪郭線つき）にまとめる。
 * 形は複製してから変形するので、渡した形は使い回してよい
 */
export class PartSet {
  private readonly buckets = new Map<THREE.Object3D, Bucket>()
  /** 軽い形（遠くの村人など）：よく使う原型（SHAPES）を、分割の少ない形に置きかえる */
  private readonly lite: boolean

  constructor(lite = false) {
    this.lite = lite
  }

  /** joint の中に形を置く。line=false なら輪郭線をつけない（目・細かい飾り・裏地） */
  add(joint: THREE.Object3D, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4, line = true): void {
    let g = (this.lite ? LITE_SHAPES.get(geo) : undefined)?.clone() ?? geo.clone()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k)
    g.morphAttributes = {}
    if (!g.index) {
      const n = g.attributes.position.count
      const ix = new Uint32Array(n)
      for (let i = 0; i < n; i++) ix[i] = i
      g.setIndex(new THREE.BufferAttribute(ix, 1))
    }
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    if (matrix) g = g.applyMatrix4(matrix)
    paint(g, color)
    let b = this.buckets.get(joint)
    if (!b) {
      b = { line: [], flat: [] }
      this.buckets.set(joint, b)
    }
    ;(line ? b.line : b.flat).push(g)
  }

  /** まとめて関節にメッシュを足す。返り値は足したメッシュ */
  bake(mat: THREE.Material, opts: { castShadow?: boolean; name?: string } = {}): THREE.Mesh[] {
    const out: THREE.Mesh[] = []
    for (const [joint, b] of this.buckets) {
      const list: THREE.BufferGeometry[] = []
      if (b.line.length) list.push(withHull(b.line.length > 1 ? merge(b.line) : b.line[0]))
      if (b.flat.length) list.push(...b.flat)
      if (!list.length) continue
      const g = list.length > 1 ? merge(list) : list[0]
      g.computeBoundingSphere()
      const mesh = new THREE.Mesh(g, mat)
      mesh.castShadow = opts.castShadow ?? true
      mesh.receiveShadow = false
      mesh.name = opts.name ?? 'part'
      joint.add(mesh)
      out.push(mesh)
      for (const x of b.line) if (x !== g) x.dispose()
      for (const x of b.flat) if (x !== g) x.dispose()
    }
    this.buckets.clear()
    return out
  }
}

// ------------------------------------------------------------------ よく使う形（複製して使う原型。描画しないので解放しない）

const proto = {
  sphere: new THREE.SphereGeometry(1, 18, 12),
  sphereHi: new THREE.SphereGeometry(1, 26, 18),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 12),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
  cone: new THREE.ConeGeometry(1, 1, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  torus: new THREE.TorusGeometry(1, 0.18, 8, 24),
}
export const SHAPES = proto

/** 軽い形の原型（同じ大きさで、分割を減らした物。三角形はおよそ 3 分の 1） */
const LITE_SHAPES = new Map<THREE.BufferGeometry, THREE.BufferGeometry>([
  [proto.sphere, new THREE.SphereGeometry(1, 10, 7)],
  [proto.sphereHi, new THREE.SphereGeometry(1, 14, 10)],
  [proto.capsule, new THREE.CapsuleGeometry(1, 1, 2, 8)],
  [proto.cyl, new THREE.CylinderGeometry(1, 1, 1, 8)],
  [proto.cone, new THREE.ConeGeometry(1, 1, 8)],
  [proto.torus, new THREE.TorusGeometry(1, 0.18, 5, 14)],
])

const tq = new THREE.Quaternion()
const te = new THREE.Euler()
const tv = new THREE.Vector3()
const ts = new THREE.Vector3()

/** 位置・回転（XYZ 順）・拡大の行列 */
export function T(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  te.set(rx, ry, rz, 'XYZ')
  tq.setFromEuler(te)
  return new THREE.Matrix4().compose(tv.set(x, y, z), tq, ts.set(sx, sy, sz))
}

/** a→b を結ぶカプセル（半径 r）の行列。SHAPES.capsule（全長 3・半径 1）用 */
export function capsuleAB(a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Matrix4 {
  const d = tv.subVectors(b, a)
  const len = d.length()
  d.normalize()
  tq.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d)
  const mid = a.clone().add(b).multiplyScalar(0.5)
  // カプセルの全長（3）が a〜b の長さ + 2r になるように。太さは r
  const sy = Math.max(0.0001, (len + 2 * r) / 3)
  return new THREE.Matrix4().compose(mid, tq, ts.set(r, Math.max(sy, r), r))
}

/** 断面（[半径, 高さ] の並び）を Y 軸で回した形。phi0・phiLen で一部だけ（前の開いたコートなど） */
export function lathe(profile: [number, number][], seg = 18, phi0 = 0, phiLen = Math.PI * 2): THREE.BufferGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y))
  const g = new THREE.LatheGeometry(pts, seg, phi0, phiLen)
  return g
}

/** 開いた形の裏側（巻き順と法線を逆にした複製を少し内側へ）。前の開いたコート・すそが中から見えても抜けない */
export function innerShell(g: THREE.BufferGeometry, inset = 0.006): THREE.BufferGeometry {
  const out = g.index ? g.clone() : g.clone()
  const pos = out.attributes.position as THREE.BufferAttribute
  const nor = out.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) - nor.getX(i) * inset, pos.getY(i) - nor.getY(i) * inset, pos.getZ(i) - nor.getZ(i) * inset)
    nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i))
  }
  if (out.index) {
    const a = out.index.array as Uint16Array | Uint32Array
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1]
      a[i + 1] = a[i + 2]
      a[i + 2] = t
    }
  }
  return out
}

/** 腕・心臓の管に共通の切断記号。ローカルZを管の接線へ向ける。輪と向かい合う切れ込みを1描画にまとめる。 */
export function createCutMarker(radius: number, width = 0.12): THREE.Mesh {
  const ring = new THREE.TorusGeometry(radius, width * 0.5, 6, 40)
  const pieces: THREE.BufferGeometry[] = [ring]
  for (const sd of [-1, 1]) {
    for (const tilt of [-1, 1]) {
      const bar = new THREE.BoxGeometry(width * 0.45, width * 1.8, width * 0.45)
      bar.rotateZ(tilt * Math.PI / 4)
      bar.translate(sd * (radius + width * 0.7), tilt * width * 0.4, 0)
      pieces.push(bar)
    }
  }
  const geo = merge(pieces)
  pieces.forEach(g => g.dispose())
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#8fe8f3', toneMapped: false }))
  mesh.name = 'cutMarker'
  mesh.renderOrder = 3
  return mesh
}
