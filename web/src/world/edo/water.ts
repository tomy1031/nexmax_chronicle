// 水：流れる水面（MeshStandardMaterial 改造：流れに沿う二重法線・泡・反射）、滝（流れ落ちる縞のシート）、
// 着水の泡、しぶき・霧（GPU で動く粒子）。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { paintFoam, paintSoftDot, paintWaterNormal, tex } from '../../render/textures'
import { mulberry32, range } from '../../render/noise'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type WaterRect = {
  x0: number
  x1: number
  z0: number
  z1: number
  y: number
  cell?: number
  flow: (x: number, z: number) => [number, number]
  foam: (x: number, z: number) => number
}

let waterTex: { normal: THREE.Texture; foam: THREE.Texture; dot: THREE.Texture } | null = null
function textures() {
  if (!waterTex) {
    waterTex = {
      normal: tex(paintWaterNormal(512), false, 4),
      foam: tex(paintFoam(256), false, 4),
      dot: tex(paintSoftDot(64), false, 1),
    }
  }
  return waterTex
}

export function createWaterMaterial(): THREE.MeshStandardMaterial {
  const t = textures()
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.06, metalness: 0, envMapIntensity: 0.55 })
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.uniforms.uWaterN = { value: t.normal }
    shader.uniforms.uFoamTex = { value: t.foam }
    shader.uniforms.uShallow = { value: new THREE.Color('#2fc7cf') }
    shader.uniforms.uDeep = { value: new THREE.Color('#0d6f86') }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        attribute vec2 aFlow;
        attribute float aFoam;
        varying vec2 vFlow;
        varying float vFoam;
        varying vec3 vWPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vFlow = aFlow;
        vFoam = aFoam;
        {
          vec4 wp0 = modelMatrix * vec4(transformed, 1.0);
          float w = sin(wp0.x * 0.9 + uTime * 1.4) * 0.018 + sin(wp0.z * 1.3 - uTime * 1.1) * 0.014;
          w += aFoam * sin(wp0.x * 3.1 + wp0.z * 2.3 + uTime * 5.0) * 0.035;
          transformed.y += w;
        }`,
      )
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform sampler2D uWaterN;
        uniform sampler2D uFoamTex;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        varying vec2 vFlow;
        varying float vFoam;
        varying vec3 vWPos;
        float gFoamMask;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 fuv = vWPos.xz * 0.32 + vFlow * uTime * 0.55;
          float f1 = texture2D(uFoamTex, fuv).r;
          float f2 = texture2D(uFoamTex, vWPos.xz * 0.71 + vFlow * uTime * 0.9 + vec2(0.31, 0.77)).r;
          float f = f1 * 0.65 + f2 * 0.5;
          gFoamMask = smoothstep(1.05 - vFoam, 1.25 - vFoam * 0.75, f + vFoam * 0.35);
          float tint = texture2D(uFoamTex, vWPos.xz * 0.05 + uTime * 0.004).r;
          vec3 body = mix(uDeep, uShallow, 0.55 + 0.45 * tint);
          diffuseColor.rgb = mix(body, vec3(0.97, 1.0, 1.0), gFoamMask);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec2 uvA = vWPos.xz * 0.16 + vFlow * uTime * 0.28;
          vec2 uvB = vWPos.xz * 0.43 + vFlow * uTime * 0.52 + vec2(0.37, 0.11);
          vec3 nA = texture2D(uWaterN, uvA).xyz * 2.0 - 1.0;
          vec3 nB = texture2D(uWaterN, uvB).xyz * 2.0 - 1.0;
          float rough = 0.55 + vFoam * 0.9;
          vec2 d = (nA.xy * 0.6 + nB.xy * 0.55) * rough;
          vec3 nW = normalize(vec3(d.x, 1.0, -d.y));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.75, gFoamMask);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * 0.22 * (1.0 - gFoamMask) + vec3(0.25, 0.28, 0.3) * gFoamMask * 0.5;`,
      )
  }
  m.customProgramCacheKey = () => 'edo-water'
  return m
}

/** 複数の水面矩形を 1 メッシュに（流れ・泡を頂点属性に焼く） */
export function buildWater(rects: WaterRect[], mat: THREE.Material): THREE.Mesh {
  const geos: THREE.BufferGeometry[] = []
  for (const r of rects) {
    const cell = r.cell ?? 0.6
    const nx = Math.max(1, Math.ceil((r.x1 - r.x0) / cell))
    const nz = Math.max(1, Math.ceil((r.z1 - r.z0) / cell))
    const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0, nx, nz)
    g.rotateX(-Math.PI / 2)
    g.translate((r.x0 + r.x1) / 2, r.y, (r.z0 + r.z1) / 2)
    const pos = g.attributes.position
    const flow = new Float32Array(pos.count * 2)
    const foam = new Float32Array(pos.count)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const [fx, fz] = r.flow(x, z)
      flow[i * 2] = fx
      flow[i * 2 + 1] = fz
      foam[i] = Math.min(1, Math.max(0, r.foam(x, z)))
    }
    g.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2))
    g.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1))
    g.deleteAttribute('uv')
    geos.push(g)
  }
  // 手動結合（属性が独自なので）
  const merged = mergeSimple(geos)
  const mesh = new THREE.Mesh(merged, mat)
  mesh.receiveShadow = true
  mesh.name = 'water'
  return mesh
}

function mergeSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let nv = 0
  let ni = 0
  for (const g of geos) {
    nv += g.attributes.position.count
    ni += (g.index as THREE.BufferAttribute).count
  }
  const pos = new Float32Array(nv * 3)
  const nor = new Float32Array(nv * 3)
  const flow = new Float32Array(nv * 2)
  const foam = new Float32Array(nv)
  const idx = new Uint32Array(ni)
  let vo = 0
  let io = 0
  for (const g of geos) {
    const n = g.attributes.position.count
    pos.set(g.attributes.position.array as Float32Array, vo * 3)
    nor.set(g.attributes.normal.array as Float32Array, vo * 3)
    flow.set(g.attributes.aFlow.array as Float32Array, vo * 2)
    foam.set(g.attributes.aFoam.array as Float32Array, vo)
    const ia = (g.index as THREE.BufferAttribute).array
    for (let i = 0; i < ia.length; i++) idx[io + i] = ia[i] + vo
    vo += n
    io += ia.length
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('aFlow', new THREE.BufferAttribute(flow, 2))
  out.setAttribute('aFoam', new THREE.BufferAttribute(foam, 1))
  out.setIndex(new THREE.BufferAttribute(idx, 1))
  out.computeBoundingSphere()
  return out
}

// ------------------------------------------------------------------ 滝

const fallVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vWN;
varying vec3 vWPos;
void main() {
  vUv = uv;
  vWN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const fallFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D uFoamTex;
uniform vec3 uTop;
uniform vec3 uSun;
uniform vec3 uSunDir;
uniform float uSpeed;
uniform float uOpacity;
uniform float uSeed;
varying vec2 vUv;
varying vec3 vWN;
varying vec3 vWPos;
void main() {
  float v = vUv.y; // 0=上 1=下
  float t = uTime * uSpeed;
  float c1 = texture2D(uFoamTex, vec2(vUv.x * 1.2 + uSeed, v * 0.32 - t * 0.75)).r;
  float c2 = texture2D(uFoamTex, vec2(vUv.x * 2.8 + 0.37 + uSeed, v * 0.75 - t * 1.25)).r;
  float c3 = texture2D(uFoamTex, vec2(vUv.x * 7.0 + uSeed * 2.0, v * 1.7 - t * 2.1)).r;
  float n = c1 * 0.55 + c2 * 0.4 + c3 * 0.3;
  float aer = smoothstep(0.0, 0.3, v);
  float white = clamp(n * 1.25 * (0.35 + 0.65 * aer) + v * 0.35 - 0.1, 0.0, 1.0);
  vec3 water = uTop * (0.85 + 0.35 * c2);
  vec3 col = mix(water, vec3(1.0), smoothstep(0.22, 0.7, white));
  col *= 0.78 + 0.32 * c3;
  float lit = 0.75 + 0.4 * max(dot(normalize(vWN), uSunDir), 0.0);
  col *= lit * uSun;
  col += vec3(0.95, 1.0, 1.0) * pow(max(c3 - 0.55, 0.0) * 2.2, 2.0) * 0.7;
  float en = texture2D(uFoamTex, vec2(vUv.x * 1.7 + uSeed * 3.0, v * 0.45 - t * 0.6)).r;
  float edge = smoothstep(0.0, 0.14 + 0.16 * en, vUv.x) * smoothstep(1.0, 0.86 - 0.16 * en, vUv.x);
  float top = smoothstep(0.0, 0.05, v);
  float bottom = 1.0 - smoothstep(0.85, 1.0, v) * 0.55;
  float a = mix(0.5, 1.0, smoothstep(0.1, 0.6, white)) * edge * top * bottom * uOpacity;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export function createFallMaterial(seed: number, opacity = 1, speed = 1.3): THREE.ShaderMaterial {
  const t = textures()
  return new THREE.ShaderMaterial({
    vertexShader: fallVert,
    fragmentShader: fallFrag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uFoamTex: { value: t.foam },
      uTop: { value: new THREE.Color('#5fd2dc') },
      uSun: { value: new THREE.Color('#fff1dc') },
      uSunDir: { value: new THREE.Vector3(-0.7, 0.5, -0.5).normalize() },
      uSpeed: { value: speed },
      uOpacity: { value: opacity },
      uSeed: { value: seed },
      uTime: uTime,
    },
  })
}

/**
 * 滝のシート。lip（上端中央）から dir（XZ の流れ出し方向）へ放物線で落ちる。
 * width は幅、drop は落差、out は着水点までの水平距離。
 */
export function fallSheet(lip: THREE.Vector3, dirYaw: number, width: number, drop: number, out: number, segY = 14, segX = 8): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(1, 1, segX, segY)
  const pos = g.attributes.position
  const uv = g.attributes.uv
  const dx = Math.cos(dirYaw)
  const dz = Math.sin(dirYaw)
  // 幅方向（dir に直交）
  const wx = -dz
  const wz = dx
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i)
    const s = 1 - uv.getY(i) // 0=上 1=下
    const across = (u - 0.5) * width * (1 + s * 0.1)
    const bulge = Math.sin(Math.PI * u) * Math.min(0.12, width * 0.06) * (0.3 + s)
    const horiz = out * Math.sqrt(s) * 0.35 + out * s * 0.65 + bulge
    const y = lip.y - drop * s * s * 0.25 - drop * s * 0.75
    pos.setXYZ(i, lip.x + dx * horiz + wx * across, y, lip.z + dz * horiz + wz * across)
    uv.setY(i, s)
  }
  g.computeVertexNormals()
  return g
}

// ------------------------------------------------------------------ 粒子（しぶき・霧）

const sprayVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
uniform float uSize;
uniform float uPixelRatio;
attribute vec3 aVel;
attribute vec4 aSeed;
varying float vAlpha;
void main() {
  float life = aSeed.y;
  float t = fract(uTime / life + aSeed.x);
  vec3 p = position + aVel * (t * life) + vec3(0.0, -4.9, 0.0) * (t * life) * (t * life);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float sz = uSize * aSeed.z * (0.5 + t * 1.2);
  gl_PointSize = sz * uPixelRatio * (300.0 / -mvPosition.z);
  vAlpha = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.55, 1.0, t)) * aSeed.w;
  #include <fog_vertex>
}
`

const sprayFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uDot;
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float a = texture2D(uDot, gl_PointCoord).a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export type Emitter = {
  pos: THREE.Vector3
  /** 放出範囲（ローカル半径） */
  spread: THREE.Vector3
  vel: THREE.Vector3
  velJitter: number
  count: number
  life: [number, number]
  size: [number, number]
  alpha: number
}

export function createSpray(emitters: Emitter[], size: number, color: THREE.ColorRepresentation, seed = 1): THREE.Points {
  const rng = mulberry32(seed)
  const total = emitters.reduce((s, e) => s + e.count, 0)
  const pos = new Float32Array(total * 3)
  const vel = new Float32Array(total * 3)
  const sd = new Float32Array(total * 4)
  let k = 0
  for (const e of emitters) {
    for (let i = 0; i < e.count; i++, k++) {
      pos[k * 3] = e.pos.x + range(rng, -1, 1) * e.spread.x
      pos[k * 3 + 1] = e.pos.y + range(rng, -1, 1) * e.spread.y
      pos[k * 3 + 2] = e.pos.z + range(rng, -1, 1) * e.spread.z
      vel[k * 3] = e.vel.x + range(rng, -1, 1) * e.velJitter
      vel[k * 3 + 1] = e.vel.y + range(rng, -0.3, 1) * e.velJitter
      vel[k * 3 + 2] = e.vel.z + range(rng, -1, 1) * e.velJitter
      sd[k * 4] = rng()
      sd[k * 4 + 1] = range(rng, e.life[0], e.life[1])
      sd[k * 4 + 2] = range(rng, e.size[0], e.size[1])
      sd[k * 4 + 3] = e.alpha * range(rng, 0.5, 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e4)
  const mat = new THREE.ShaderMaterial({
    vertexShader: sprayVert,
    fragmentShader: sprayFrag,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uDot: { value: textures().dot },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) },
      uTime: uTime,
    },
  })
  const pts = new THREE.Points(g, mat)
  pts.frustumCulled = false
  pts.renderOrder = 5
  pts.name = 'spray'
  return pts
}

/** 着水点の泡（水面に貼る楕円） */
const foamFrag = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D uFoamTex;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 c = vUv - 0.5;
  float r = length(c) * 2.0;
  float f1 = texture2D(uFoamTex, vUv * 2.0 + vec2(uTime * 0.12, -uTime * 0.2) + uSeed).r;
  float f2 = texture2D(uFoamTex, vUv * 4.3 - vec2(uTime * 0.25, uTime * 0.1) + uSeed).r;
  float f = f1 * 0.6 + f2 * 0.6;
  float a = smoothstep(1.0, 0.25, r) * smoothstep(0.25, 0.7, f + (1.0 - r) * 0.4);
  gl_FragColor = vec4(vec3(0.96, 0.99, 1.0) * 1.05, a * 0.95);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`
const foamVert = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uTime;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  p.z += sin(uTime * 6.0 + uv.x * 12.0) * 0.03 + sin(uTime * 4.0 + uv.y * 9.0) * 0.03;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

export function createFoamPatchMaterial(seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: foamVert,
    fragmentShader: foamFrag,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), uFoamTex: { value: textures().foam }, uSeed: { value: seed }, uTime: uTime },
  })
}

/** 同じマテリアルのメッシュ（滝のシートなど）を 1 つに結合 */
export function mergeGroupByMaterial(group: THREE.Group): void {
  const byMat = new Map<THREE.Material, THREE.Mesh[]>()
  for (const ch of [...group.children]) {
    const m = ch as THREE.Mesh
    if (!m.isMesh) continue
    const mat = m.material as THREE.Material
    const l = byMat.get(mat) ?? []
    l.push(m)
    byMat.set(mat, l)
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue
    const geos = list.map((m) => {
      m.updateMatrix()
      const g = m.geometry.clone()
      g.applyMatrix4(m.matrix)
      return g
    })
    const merged = mergeGeometries(geos, false)
    if (!merged) continue
    for (const m of list) group.remove(m)
    const mesh = new THREE.Mesh(merged, mat)
    mesh.renderOrder = list[0].renderOrder
    group.add(mesh)
  }
}
