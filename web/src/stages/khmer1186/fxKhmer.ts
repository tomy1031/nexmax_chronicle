// 1186年の光と空の演出（軽いシェーダだけ。全画面のパスは使わない）。
// ・Torches：松明・かまどの火（1 つの InstancedMesh。夜にともす）
// ・LightBeam：光の筋（朝日をはね返す鏡 → アルン、回る鏡の台 → 東の塔）
// ・SkyCrack：夜の空のひび（ガラスのように光る割れ目）・Moon：月と光の輪
// ・Mist：オルムに食べられた森のあとにただよう黒い霧（点の粒子）・Fireflies：夜のほたる
// ・Burst：くずれた段の土ぼこり・光のつぶ（使い回す粒子）
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { paintSoftDot, tex } from '../../render/textures'
import { mulberry32 } from '../../render/noise'

let dotTex: THREE.Texture | null = null
/** やわらかい丸（粒子用。モジュールで使い回す） */
export function softDot(): THREE.Texture {
  if (!dotTex) dotTex = tex(paintSoftDot(64), false, 1)
  return dotTex
}

// ------------------------------------------------------------------ 火

const flameVert = /* glsl */ `
uniform float uTime;
uniform float uOn;
varying vec2 vUv;
varying float vPh;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vPh = fract(sin(dot(wp.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.28;
  // カメラの方を向く板（縦は固定）
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float s = length(instanceMatrix[0].xyz);
  float flick = 0.86 + 0.14 * sin(uTime * 13.0 + vPh) + 0.08 * sin(uTime * 23.0 + vPh * 2.0);
  vec3 p = wp.xyz + camRight * position.x * s + vec3(0.0, 1.0, 0.0) * position.y * s * flick * uOn;
  p.x += sin(uTime * 6.0 + vPh + position.y * 3.0) * 0.04 * s * position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`
const flameFrag = /* glsl */ `
uniform float uOn;
uniform vec3 uColor;
varying vec2 vUv;
varying float vPh;
void main() {
  vec2 q = vUv - vec2(0.5, 0.18);
  float w = mix(0.42, 0.06, clamp(vUv.y, 0.0, 1.0));
  float d = abs(q.x) / w;
  float a = smoothstep(1.0, 0.2, d) * smoothstep(1.0, 0.55, vUv.y) * smoothstep(0.0, 0.12, vUv.y);
  vec3 core = mix(uColor, vec3(1.0, 0.96, 0.8), smoothstep(0.6, 0.0, d) * smoothstep(0.8, 0.1, vUv.y));
  gl_FragColor = vec4(core * 2.4, a * uOn);
}
`

/** 火の板（全部で 1 つの InstancedMesh）。setOn(0..1) でともす・消す */
export class Torches {
  readonly mesh: THREE.InstancedMesh
  private readonly mat: THREE.ShaderMaterial
  private on = 0

  constructor(points: THREE.Vector3[], size = 0.55, color: THREE.ColorRepresentation = '#ff8a2a') {
    const g = new THREE.PlaneGeometry(1, 1.6)
    g.translate(0, 0.8 - 0.25, 0)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: flameVert,
      fragmentShader: flameFrag,
      uniforms: { uTime, uOn: { value: 0 }, uColor: { value: new THREE.Color(color) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.mesh = new THREE.InstancedMesh(g, this.mat, Math.max(1, points.length))
    this.mesh.count = points.length
    const m = new THREE.Matrix4()
    points.forEach((p, i) => this.mesh.setMatrixAt(i, m.compose(p, new THREE.Quaternion(), new THREE.Vector3(size, size, size))))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.visible = false
    this.mesh.name = 'khmer_flames'
  }

  setOn(k: number): void {
    this.on = k
    this.mat.uniforms.uOn.value = k
    this.mesh.visible = k > 0.01 && this.mesh.count > 0
  }

  get level(): number {
    return this.on
  }
}

// ------------------------------------------------------------------ 光の筋

const beamVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const beamFrag = /* glsl */ `
uniform float uTime;
uniform float uOn;
uniform float uLen;
uniform float uCore;
uniform vec3 uColor;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float body = pow(facing, uCore);
  // 光のつぶが筋にそって流れる
  float s = vUv.y * uLen - uTime * 4.0;
  float spark = smoothstep(0.86, 1.0, sin(s * 3.1) * 0.5 + 0.5) * smoothstep(0.7, 1.0, sin(vUv.x * 18.0 + s * 0.7) * 0.5 + 0.5);
  // 端はやわらかく
  float ends = smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
  float a = (body * 0.75 + spark * 0.6) * ends * uOn;
  gl_FragColor = vec4(uColor * (1.4 + spark * 2.0), a);
}
`

/** 光の筋（a→b）。外側のぼんやりした光と、中の細い芯の 2 本の筒 */
export class LightBeam {
  readonly group = new THREE.Group()
  private readonly outer: THREE.Mesh
  private readonly inner: THREE.Mesh
  private readonly mats: THREE.ShaderMaterial[] = []
  readonly a = new THREE.Vector3()
  readonly b = new THREE.Vector3()
  private on = 0
  private target = 0
  /** 1 秒あたりの、ともる・消える速さ */
  fadeSpeed = 1.6

  constructor(radius = 0.35, color: THREE.ColorRepresentation = '#ffd27a') {
    const make = (r: number, core: number, col: THREE.ColorRepresentation) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: beamVert,
        fragmentShader: beamFrag,
        uniforms: { uTime, uOn: { value: 0 }, uLen: { value: 10 }, uCore: { value: core }, uColor: { value: new THREE.Color(col) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      })
      this.mats.push(mat)
      const g = new THREE.CylinderGeometry(r, r, 1, 14, 1, true)
      g.translate(0, 0.5, 0)
      const m = new THREE.Mesh(g, mat)
      m.frustumCulled = false
      m.renderOrder = 4
      return m
    }
    this.outer = make(radius, 2.2, color)
    this.inner = make(radius * 0.32, 1.2, '#fff4d8')
    this.group.add(this.outer, this.inner)
    this.group.visible = false
    this.group.name = 'khmer_beam'
  }

  /** 端の点を決める */
  set(a: THREE.Vector3, b: THREE.Vector3): void {
    this.a.copy(a)
    this.b.copy(b)
    const d = new THREE.Vector3().subVectors(b, a)
    const len = Math.max(0.01, d.length())
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
    for (const m of [this.outer, this.inner]) {
      m.position.copy(a)
      m.quaternion.copy(qq)
      m.scale.set(1, len, 1)
    }
    for (const mat of this.mats) mat.uniforms.uLen.value = len
  }

  /** ともす（true）・消す。instant ならすぐ */
  setOn(on: boolean | number, instant = false): void {
    this.target = typeof on === 'number' ? on : on ? 1 : 0
    if (instant) this.apply(this.target)
  }

  get level(): number {
    return this.on
  }

  setColor(c: THREE.ColorRepresentation): void {
    ;(this.mats[0].uniforms.uColor.value as THREE.Color).set(c)
  }

  update(dt: number): void {
    if (this.on === this.target) return
    const step = dt * this.fadeSpeed
    this.apply(this.on < this.target ? Math.min(this.target, this.on + step) : Math.max(this.target, this.on - step))
  }

  private apply(k: number): void {
    this.on = k
    for (const m of this.mats) m.uniforms.uOn.value = k
    this.group.visible = k > 0.001
  }
}

// ------------------------------------------------------------------ 空のひび

const crackVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const crackFrag = /* glsl */ `
uniform float uTime;
uniform float uCrack;
uniform float uOpen;
varying vec2 vUv;
float hash(float n) { return fract(sin(n) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), u.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  // 放射状の割れ目：角度方向に N 本、ゆらぎ・枝分かれ
  float N = 13.0;
  float line = 0.0;
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float aa = a + noise(vec2(r * (5.0 + fk * 4.0), fk * 7.0)) * (0.35 + fk * 0.2) - 0.18;
    float idx = floor(aa / 6.2831 * N + fk * 0.5);
    float center = (idx + 0.5 + (hash(idx + fk * 31.0) - 0.5) * 0.5) / N * 6.2831 - fk * 0.5 / N * 6.2831;
    float reach = 0.35 + hash(idx * 3.1 + fk) * 0.65;
    float d = abs(aa - center) * r;
    float w = 0.012 + 0.012 * (1.0 - r);
    line = max(line, smoothstep(w, 0.0, d) * step(r, reach * uCrack) * (1.0 - fk * 0.35));
  }
  // 中心の黒い穴（虚無）と、ふちの光
  float hole = smoothstep(0.16 * uOpen + 0.02, 0.1 * uOpen, r) * step(0.01, uOpen);
  float rim = smoothstep(0.05, 0.0, abs(r - 0.15 * uOpen)) * uOpen;
  float glow = smoothstep(0.7 * uCrack, 0.0, r) * 0.25 * uCrack;
  vec3 col = mix(vec3(0.55, 0.85, 1.0), vec3(0.85, 0.6, 1.0), noise(p * 3.0 + uTime * 0.2));
  float pulse = 0.75 + 0.25 * sin(uTime * 2.2);
  vec3 c = col * (line * 2.6 * pulse + glow + rim * 2.0);
  float alpha = clamp(line + glow + rim, 0.0, 1.0);
  c = mix(c, vec3(0.02, 0.0, 0.05), hole);
  alpha = max(alpha, hole);
  gl_FragColor = vec4(c, alpha * step(0.001, uCrack + uOpen));
}
`

/** 夜の空のひび。setCrack(0..1) で広がる、setOpen(0..1) で中心に黒い穴 */
export class SkyCrack {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial

  constructor(pos: THREE.Vector3, size: number, lookAt: THREE.Vector3) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: crackVert,
      fragmentShader: crackFrag,
      uniforms: { uTime, uCrack: { value: 0 }, uOpen: { value: 0 } },
      transparent: true,
      depthWrite: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat)
    this.mesh.position.copy(pos)
    this.mesh.lookAt(lookAt)
    this.mesh.renderOrder = -5
    this.mesh.frustumCulled = false
    this.mesh.visible = false
    this.mesh.name = 'khmer_sky_crack'
  }

  setCrack(k: number): void {
    this.mat.uniforms.uCrack.value = k
    this.mesh.visible = k > 0.001 || this.mat.uniforms.uOpen.value > 0.001
  }

  setOpen(k: number): void {
    this.mat.uniforms.uOpen.value = k
    this.mesh.visible = k > 0.001 || this.mat.uniforms.uCrack.value > 0.001
  }

  get crack(): number {
    return this.mat.uniforms.uCrack.value
  }
}

// ------------------------------------------------------------------ 月

function paintMoon(S = 256): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = S
  const g = c.getContext('2d') as CanvasRenderingContext2D
  const grad = g.createRadialGradient(S * 0.45, S * 0.42, S * 0.05, S / 2, S / 2, S * 0.48)
  grad.addColorStop(0, '#fffdf0')
  grad.addColorStop(0.8, '#f0ead0')
  grad.addColorStop(1, '#d8d0b0')
  g.fillStyle = grad
  g.beginPath()
  g.arc(S / 2, S / 2, S * 0.47, 0, Math.PI * 2)
  g.fill()
  const rng = mulberry32(3)
  for (let i = 0; i < 18; i++) {
    const a = rng() * Math.PI * 2
    const d = Math.sqrt(rng()) * S * 0.36
    g.fillStyle = `rgba(150,140,110,${0.15 + rng() * 0.2})`
    g.beginPath()
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.02 + rng() * 0.07), 0, Math.PI * 2)
    g.fill()
  }
  return c
}

/** 月（カメラの方を向く円板）と、まわりの光の輪 */
export class Moon {
  readonly group = new THREE.Group()
  private readonly disc: THREE.Mesh
  private readonly halo: THREE.Mesh

  constructor(pos: THREE.Vector3, size = 34) {
    const map = new THREE.CanvasTexture(paintMoon())
    map.colorSpace = THREE.SRGBColorSpace
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 32), new THREE.MeshBasicMaterial({ map, fog: false, color: new THREE.Color(1.6, 1.55, 1.4) }))
    this.halo = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 4.5, size * 4.5),
      new THREE.MeshBasicMaterial({ map: softDot(), color: '#8aa8ff', transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    )
    this.group.add(this.halo, this.disc)
    this.group.position.copy(pos)
    this.group.renderOrder = -6
    this.disc.renderOrder = -6
    this.halo.renderOrder = -7
    this.group.visible = false
    this.group.name = 'khmer_moon'
    this.disc.frustumCulled = this.halo.frustumCulled = false
  }

  setOn(on: boolean): void {
    this.group.visible = on
  }

  update(camera: THREE.Camera): void {
    if (!this.group.visible) return
    this.group.quaternion.copy(camera.quaternion)
  }
}

// ------------------------------------------------------------------ 粒子（黒い霧・ほたる）

const mistVert = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uRise;
attribute vec4 aSeed;
varying float vA;
void main() {
  float life = fract(uTime * aSeed.w + aSeed.x);
  vec3 p = position;
  p.y += life * uRise;
  p.x += sin(uTime * 0.3 + aSeed.y * 6.28) * 2.0;
  p.z += cos(uTime * 0.25 + aSeed.z * 6.28) * 2.0;
  vA = sin(life * 3.14159);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * (0.6 + aSeed.y * 0.8) * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`
const mistFrag = /* glsl */ `
uniform sampler2D uDot;
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  float a = texture2D(uDot, gl_PointCoord).r * vA * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
`

/** ただよう粒子（黒い霧・ほたる）。points は各粒子の根もとの位置 */
export class Drift {
  readonly points: THREE.Points
  private readonly mat: THREE.ShaderMaterial

  constructor(base: THREE.Vector3[], o: { size: number; rise: number; color: THREE.ColorRepresentation; opacity: number; additive?: boolean; speed?: number; seed?: number }) {
    const rng = mulberry32(o.seed ?? 9)
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(base.length * 3)
    const seed = new Float32Array(base.length * 4)
    base.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3)
      seed.set([rng(), rng(), rng(), (o.speed ?? 0.05) * (0.6 + rng() * 0.8)], i * 4)
    })
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
    this.mat = new THREE.ShaderMaterial({
      vertexShader: mistVert,
      fragmentShader: mistFrag,
      uniforms: { uTime, uSize: { value: o.size }, uRise: { value: o.rise }, uDot: { value: softDot() }, uColor: { value: new THREE.Color(o.color) }, uOpacity: { value: o.opacity } },
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(g, this.mat)
    this.points.frustumCulled = false
  }

  setOpacity(k: number): void {
    this.mat.uniforms.uOpacity.value = k
    this.points.visible = k > 0.001
  }

  setColor(c: THREE.ColorRepresentation): void {
    ;(this.mat.uniforms.uColor.value as THREE.Color).set(c)
  }
}

// ------------------------------------------------------------------ はじける粒子（土ぼこり・光のつぶ）

type Particle = { p: THREE.Vector3; v: THREE.Vector3; life: number; max: number; size: number; color: THREE.Color }

/** 使い回す粒子のはじけ（土ぼこり・光）。最大 n 個 */
export class Burst {
  readonly points: THREE.Points
  private readonly list: Particle[] = []
  private readonly pos: Float32Array
  private readonly col: Float32Array
  private readonly size: Float32Array
  private readonly n: number

  constructor(n = 160, additive = false) {
    this.n = n
    this.pos = new Float32Array(n * 3)
    this.col = new Float32Array(n * 4)
    this.size = new Float32Array(n)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4))
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1))
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec4 color;
        varying vec4 vC;
        void main() {
          vC = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uDot;
        varying vec4 vC;
        void main() {
          float a = texture2D(uDot, gl_PointCoord).r * vC.a;
          if (a < 0.02) discard;
          gl_FragColor = vec4(vC.rgb, a);
        }`,
      uniforms: { uDot: { value: softDot() } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    })
    this.points = new THREE.Points(g, mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 5
  }

  /** at から count 個（spread：速さ、up：上向き、color、size、life 秒） */
  emit(at: THREE.Vector3, count: number, o: { spread?: number; up?: number; color?: THREE.ColorRepresentation; size?: number; life?: number; gravity?: boolean } = {}): void {
    const col = new THREE.Color(o.color ?? '#b49a78')
    for (let i = 0; i < count; i++) {
      if (this.list.length >= this.n) this.list.shift()
      const a = Math.random() * Math.PI * 2
      const sp = (o.spread ?? 1.5) * (0.4 + Math.random() * 0.8)
      this.list.push({
        p: at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.3, (Math.random() - 0.5) * 0.4)),
        v: new THREE.Vector3(Math.cos(a) * sp, (o.up ?? 1.5) * (0.5 + Math.random()), Math.sin(a) * sp),
        life: 0,
        max: (o.life ?? 1.2) * (0.7 + Math.random() * 0.6),
        size: (o.size ?? 0.6) * (0.6 + Math.random() * 0.8),
        color: col,
      })
    }
  }

  update(dt: number, gravity = 3): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const q = this.list[i]
      q.life += dt
      if (q.life >= q.max) {
        this.list.splice(i, 1)
        continue
      }
      q.v.y -= gravity * dt
      q.v.multiplyScalar(1 - dt * 1.2)
      q.p.addScaledVector(q.v, dt)
    }
    for (let i = 0; i < this.n; i++) {
      const q = this.list[i]
      if (!q) {
        this.size[i] = 0
        continue
      }
      const k = 1 - q.life / q.max
      this.pos.set([q.p.x, q.p.y, q.p.z], i * 3)
      this.col.set([q.color.r, q.color.g, q.color.b, k], i * 4)
      this.size[i] = q.size * (0.6 + 0.4 * k)
    }
    const g = this.points.geometry
    ;(g.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(g.attributes.color as THREE.BufferAttribute).needsUpdate = true
    ;(g.attributes.size as THREE.BufferAttribute).needsUpdate = true
    this.points.visible = this.list.length > 0
  }
}
