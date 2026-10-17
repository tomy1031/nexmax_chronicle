// オルム：夜空に現れる巨大な黒い環。中心は空を喰った虚無（紫の渦）、縁は赤く燃えながら粒子になってほつれていく。
// 環の内側には「明日の街並み」の影が見え、それが消えていく。周りには黒い破片が漂う。
// ・setShow(0..1)：出現（細い線から広がる）　・setTomorrow(1..0)：明日の街並みが消える
// ・setSwallow(0..1)：ループ直前、環が空いっぱいに広がる
// DebrisField：夜の避難中に落ちてくる黒い破片（赤い予兆の輪 → 落下 → 着地の火花）。当たっても軽くよろけるだけ。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { mulberry32, range } from '../../render/noise'
import { DISSOLVE, type FutureMaterials } from './fmaterials'
import { F } from './layout'

const coreVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const coreFrag = /* glsl */ `
uniform float uTime;
uniform float uShow;
uniform float uTomorrow;
uniform float uSwallow;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
vec2 rot(vec2 p, float a) { float c = cos(a); float s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main() {
  // 板は環の半径の 3 倍（-1.5..1.5）。出現と飲み込みで環の大きさが変わる
  float grow = mix(0.06, 1.0, smoothstep(0.0, 1.0, uShow)) * (1.0 + uSwallow * 0.5);
  vec2 p = (vUv * 2.0 - 1.0) * 1.5 / grow;
  float r = length(p);
  float a = atan(p.y, p.x);
  // 縁のほつれ
  float fr = (fbm(vec2(a * 3.0, uTime * 0.25)) - 0.5) * 0.12 + (noise(vec2(a * 24.0, uTime * 1.3)) - 0.5) * 0.04;
  float rr = r + fr;
  // 中心：紫の渦
  vec2 q = rot(p, rr * 2.6 - uTime * 0.18);
  float sw = fbm(q * 2.4 + vec2(uTime * 0.05, 0.0));
  vec3 voidCol = mix(vec3(0.004, 0.0, 0.012), vec3(0.11, 0.02, 0.2), smoothstep(0.35, 0.9, sw) * (1.0 - rr * 0.6));
  voidCol += vec3(0.25, 0.04, 0.12) * pow(smoothstep(0.55, 0.93, rr), 3.0);
  // 明日の街並み（下半分の影絵、窓の灯り）。ノイズで溶けて消えていく
  float sx = p.x * 7.0;
  float hb = 0.18 + 0.32 * hash(vec2(floor(sx), 3.0)) + 0.12 * hash(vec2(floor(sx * 2.3), 7.0));
  float sky = -0.6 + hb;
  float bld = step(p.y, sky) * step(-0.85, p.y) * step(r, 0.86);
  vec2 wg = fract(vec2(p.x * 42.0, p.y * 30.0));
  float win = step(0.55, hash(floor(vec2(p.x * 42.0, p.y * 30.0)))) * step(0.25, wg.x) * step(0.3, wg.y);
  float melt = fbm(p * 5.0 + vec2(0.0, uTime * 0.4));
  float keep = smoothstep(1.0 - uTomorrow - 0.12, 1.0 - uTomorrow + 0.12, melt);
  vec3 cityCol = mix(vec3(0.05, 0.1, 0.22), vec3(0.6, 0.85, 1.4), win * 0.8);
  voidCol = mix(voidCol, cityCol, bld * keep * 0.85);
  // 縁：赤〜桃色の炎（HDR）
  float rim = exp(-abs(rr - 1.0) * 26.0);
  float spikes = pow(noise(vec2(a * 18.0, uTime * 0.9)), 3.0) * 0.18;
  float flame = smoothstep(1.0 + spikes, 1.0, rr) * step(1.0, rr) * (0.6 + 0.4 * noise(vec2(a * 40.0, r * 10.0 - uTime * 2.0)));
  vec3 rimCol = mix(vec3(3.6, 0.35, 0.6), vec3(2.4, 0.5, 2.6), 0.5 + 0.5 * sin(a * 3.0 + uTime * 0.7));
  vec3 col = voidCol * step(rr, 1.0) + rimCol * (rim * 1.6 + flame * 1.2);
  // 外側のにじみ
  float halo = exp(-max(r - 1.0, 0.0) * 3.2) * step(1.0, r) * 0.6;
  col += vec3(0.9, 0.08, 0.32) * halo;
  float alpha = max(step(rr, 1.0), clamp(rim * 1.4 + flame + halo, 0.0, 1.0));
  alpha *= smoothstep(0.0, 0.15, uShow);
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(col, alpha);
}
`

const emberVert = /* glsl */ `
uniform float uTime;
uniform float uShow;
uniform float uSwallow;
uniform float uR;
uniform float uPixelRatio;
uniform float uDark;
attribute vec4 aSeed;
varying float vA;
varying float vHot;
void main() {
  float speed = 0.04 + aSeed.y * 0.06;
  float life = fract(aSeed.x + uTime * speed);
  float ang = aSeed.z * 6.2832 + life * (0.3 + aSeed.w * 0.4) * (aSeed.w > 0.5 ? 1.0 : -1.0);
  float grow = mix(0.06, 1.0, smoothstep(0.0, 1.0, uShow)) * (1.0 + uSwallow * 0.5);
  float rad = uR * grow * (0.97 + life * (0.25 + aSeed.y * 0.6));
  vec3 p = vec3(cos(ang) * rad, sin(ang) * rad - life * life * uR * 0.18, (aSeed.w - 0.5) * uR * 0.3);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(0.6, 1.8, aSeed.y) * (uDark > 0.5 ? 2.2 : 1.0);
  gl_PointSize = size * uPixelRatio * (900.0 / -mv.z) * step(0.05, uShow);
  vA = smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.55, 1.0, life)) * smoothstep(0.1, 0.6, uShow);
  vHot = 1.0 - life;
}
`
const emberFrag = /* glsl */ `
uniform float uDark;
varying float vA;
varying float vHot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  if (uDark > 0.5) {
    // 黒い欠片（角ばった形）
    if (abs(c.x) + abs(c.y) > 0.42) discard;
    gl_FragColor = vec4(vec3(0.02, 0.0, 0.03), vA * 0.9);
  } else {
    float k = smoothstep(0.5, 0.0, d);
    vec3 col = mix(vec3(2.4, 0.2, 0.7), vec3(3.2, 1.2, 0.8), vHot * vHot);
    gl_FragColor = vec4(col * k * vA, k * vA);
  }
}
`

export type OrumParts = {
  group: THREE.Group
  show: number
  setShow(v: number): void
  setTomorrow(v: number): void
  setSwallow(v: number): void
  /** 遠景の建物が溶ける量（0..1） */
  setDissolve(v: number): void
  update(dt: number): void
  light: THREE.DirectionalLight
  center: THREE.Vector3
}

export function buildOrum(fm: FutureMaterials, root: THREE.Group): OrumParts {
  const O = F.ORUM
  const center = new THREE.Vector3(O.x, O.y, O.z)
  DISSOLVE.center.value.copy(center)
  const group = new THREE.Group()
  group.name = 'orum'
  group.position.copy(center)
  // 広場の中心を向く
  group.lookAt(new THREE.Vector3(0, O.y * 0.35, 0))
  root.add(group)

  const uniforms = { uTime, uShow: { value: 0 }, uTomorrow: { value: 1 }, uSwallow: { value: 0 } }
  const core = new THREE.Mesh(
    new THREE.PlaneGeometry(O.r * 3, O.r * 3),
    new THREE.ShaderMaterial({ vertexShader: coreVert, fragmentShader: coreFrag, uniforms, transparent: true, depthWrite: false, fog: false }),
  )
  core.renderOrder = -2
  core.frustumCulled = false
  group.add(core)

  const rng = mulberry32(666)
  const makePoints = (n: number, dark: boolean) => {
    const seeds = new Float32Array(n * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = rng()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    const m = new THREE.ShaderMaterial({
      vertexShader: emberVert,
      fragmentShader: emberFrag,
      uniforms: { ...uniforms, uR: { value: O.r }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) }, uDark: { value: dark ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: dark ? THREE.NormalBlending : THREE.AdditiveBlending,
      fog: false,
    })
    const pts = new THREE.Points(g, m)
    pts.frustumCulled = false
    pts.renderOrder = -1
    group.add(pts)
    return pts
  }
  makePoints(1600, false)
  makePoints(700, true)

  // 漂う黒い破片（環のまわりを回る）
  const NCH = 70
  const chunkGeo = new THREE.IcosahedronGeometry(1, 0)
  const chunks = new THREE.InstancedMesh(chunkGeo, fm.debris, NCH)
  chunks.frustumCulled = false
  chunks.castShadow = false
  const orb = Array.from({ length: NCH }, () => ({
    a: range(rng, 0, Math.PI * 2),
    r: O.r * range(rng, 0.95, 1.75),
    z: range(rng, -O.r * 0.4, O.r * 0.5),
    s: range(rng, 1.5, 7.5),
    sp: range(rng, 0.01, 0.04) * (rng() < 0.5 ? -1 : 1),
    rx: range(rng, 0, 6),
    ry: range(rng, 0, 6),
    tumble: range(rng, 0.1, 0.5),
  }))
  group.add(chunks)

  // 赤い光（環の方向から。数は固定：強さだけ変える）
  const light = new THREE.DirectionalLight('#ff3a66', 0)
  light.position.copy(center).normalize().multiplyScalar(80)
  light.target.position.set(0, 0, 0)
  root.add(light, light.target)

  const mtx = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const p = new THREE.Vector3()
  const s = new THREE.Vector3()
  let show = 0
  let swallow = 0
  const parts: OrumParts = {
    group,
    light,
    center,
    get show() {
      return show
    },
    setShow(x: number) {
      show = Math.min(1, Math.max(0, x))
      uniforms.uShow.value = show
      group.visible = show > 0.001
      light.intensity = show * 0.45 + swallow * 1.0
    },
    setTomorrow(x: number) {
      uniforms.uTomorrow.value = Math.min(1, Math.max(0, x))
    },
    setSwallow(x: number) {
      swallow = Math.min(1, Math.max(0, x))
      uniforms.uSwallow.value = swallow
      light.intensity = show * 0.45 + swallow * 1.0
    },
    setDissolve(x: number) {
      DISSOLVE.amount.value = Math.min(1, Math.max(0, x))
    },
    update() {
      if (!group.visible) return
      const t = uTime.value
      const grow = (0.06 + 0.94 * show * show * (3 - 2 * show)) * (1 + swallow * 0.5)
      for (let i = 0; i < NCH; i++) {
        const o = orb[i]
        const a = o.a + t * o.sp
        p.set(Math.cos(a) * o.r * grow, Math.sin(a) * o.r * grow, o.z)
        e.set(o.rx + t * o.tumble, o.ry + t * o.tumble * 0.7, 0)
        q.setFromEuler(e)
        s.setScalar(o.s * Math.min(1, show * 1.5))
        mtx.compose(p, q, s)
        chunks.setMatrixAt(i, mtx)
      }
      chunks.instanceMatrix.needsUpdate = true
    },
  }
  parts.setShow(0)
  return parts
}

// ------------------------------------------------------------------ 落ちてくる破片

const ringVert = /* glsl */ `
attribute float aK;
varying vec2 vUv;
varying float vK;
void main() {
  vUv = uv;
  vK = aK;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`
const ringFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vK;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ring = smoothstep(0.08, 0.0, abs(r - 0.82)) + smoothstep(0.05, 0.0, abs(r - mix(0.8, 0.1, fract(uTime * 1.8))));
  float fill = (1.0 - smoothstep(0.0, 0.85, r)) * 0.25;
  float a = (ring + fill) * vK;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(3.0, 0.3, 0.45) * a, a);
}
`

const burstVert = /* glsl */ `
uniform float uPixelRatio;
attribute vec4 aSeed;
attribute float aT;
varying float vA;
void main() {
  // aT：着地からの時間（秒）。負なら非表示
  float t = aT;
  vec3 dir = normalize(vec3(aSeed.x - 0.5, 0.6 + aSeed.y, aSeed.z - 0.5));
  vec3 p = position + dir * (2.5 + aSeed.w * 3.0) * t - vec3(0.0, 4.5 * t * t, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (0.12 + aSeed.w * 0.12) * uPixelRatio * (500.0 / -mv.z) * step(0.0, t) * step(t, 0.9);
  vA = 1.0 - t / 0.9;
}
`
const burstFrag = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float k = smoothstep(0.5, 0.0, length(c));
  gl_FragColor = vec4(vec3(3.0, 0.9, 0.6) * k * vA, k * vA);
}
`

type Drop = { state: 'idle' | 'warn' | 'fall' | 'rest'; t: number; pos: THREE.Vector3; rot: THREE.Euler; s: number }

export type DebrisResult = { hit: boolean; impact: boolean; shake: number; hitDir: THREE.Vector3 | null }

/** 夜の避難の間に落ちる黒い破片 */
export class DebrisField {
  readonly group = new THREE.Group()
  active = false
  private readonly drops: Drop[] = []
  private readonly chunks: THREE.InstancedMesh
  private readonly rings: THREE.InstancedMesh
  private readonly ringK: THREE.InstancedBufferAttribute
  private readonly burst: THREE.Points
  private readonly burstT: Float32Array
  private readonly burstPos: Float32Array
  private spawnIn = 0.6
  private shake = 0
  private readonly rng = mulberry32(13)
  private readonly mtx = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly sc = new THREE.Vector3()
  static readonly N = 12
  static readonly WARN = 1.15
  static readonly FALL = 0.55
  static readonly FALL_H = 26
  static readonly HIT_R = 1.25
  private static readonly BURST = 26

  constructor(fm: FutureMaterials, root: THREE.Group) {
    const N = DebrisField.N
    this.group.name = 'debris'
    for (let i = 0; i < N; i++) this.drops.push({ state: 'idle', t: 0, pos: new THREE.Vector3(), rot: new THREE.Euler(), s: 1 })
    this.chunks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 0), fm.debris, N)
    this.chunks.castShadow = true
    this.chunks.frustumCulled = false
    const rg = new THREE.PlaneGeometry(2.8, 2.8)
    rg.rotateX(-Math.PI / 2)
    this.ringK = new THREE.InstancedBufferAttribute(new Float32Array(N), 1)
    rg.setAttribute('aK', this.ringK)
    this.rings = new THREE.InstancedMesh(
      rg,
      new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: ringFrag, uniforms: { uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      N,
    )
    this.rings.frustumCulled = false
    const B = DebrisField.BURST
    const seeds = new Float32Array(N * B * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = this.rng()
    this.burstPos = new Float32Array(N * B * 3)
    this.burstT = new Float32Array(N * B).fill(-1)
    const bg = new THREE.BufferGeometry()
    bg.setAttribute('position', new THREE.BufferAttribute(this.burstPos, 3))
    bg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    bg.setAttribute('aT', new THREE.BufferAttribute(this.burstT, 1))
    this.burst = new THREE.Points(
      bg,
      new THREE.ShaderMaterial({ vertexShader: burstVert, fragmentShader: burstFrag, uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    this.burst.frustumCulled = false
    this.group.add(this.chunks, this.rings, this.burst)
    root.add(this.group)
    this.hideAll()
  }

  private hideAll(): void {
    this.sc.setScalar(0)
    this.mtx.compose(new THREE.Vector3(0, -50, 0), this.q.identity(), this.sc)
    for (let i = 0; i < DebrisField.N; i++) {
      this.chunks.setMatrixAt(i, this.mtx)
      this.rings.setMatrixAt(i, this.mtx)
      this.ringK.setX(i, 0)
    }
    this.chunks.instanceMatrix.needsUpdate = true
    this.rings.instanceMatrix.needsUpdate = true
    this.ringK.needsUpdate = true
  }

  setActive(on: boolean): void {
    this.active = on
    if (!on) {
      for (const d of this.drops) d.state = 'idle'
      this.burstT.fill(-1)
      ;(this.burst.geometry.attributes.aT as THREE.BufferAttribute).needsUpdate = true
      this.hideAll()
    }
    this.spawnIn = 0.4
  }

  /** 破片を 1 つ落とす（予兆の輪から） */
  drop(at: THREE.Vector3): void {
    const d = this.drops.find((x) => x.state === 'idle')
    if (!d) return
    d.state = 'warn'
    d.t = 0
    d.pos.copy(at).setY(0)
    d.rot.set(this.rng() * 6, this.rng() * 6, this.rng() * 6)
    d.s = range(this.rng, 0.8, 1.4)
  }

  update(dt: number, player: THREE.Vector3 | null): DebrisResult {
    const res: DebrisResult = { hit: false, impact: false, shake: 0, hitDir: null }
    this.shake = Math.max(0, this.shake - dt * 2.5)
    if (this.active && player) {
      this.spawnIn -= dt
      if (this.spawnIn <= 0) {
        this.spawnIn = range(this.rng, 0.55, 0.95)
        const near = this.rng() < 0.65
        const a = range(this.rng, 0, Math.PI * 2)
        const r = near ? range(this.rng, 1.6, 5.0) : range(this.rng, 3, 14)
        const p = new THREE.Vector3(player.x + Math.cos(a) * r, 0, player.z + Math.sin(a) * r)
        p.x = Math.min(18, Math.max(-14, p.x))
        p.z = Math.min(16, Math.max(-14, p.z))
        this.drop(p)
      }
    }
    const B = DebrisField.BURST
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]
      if (d.state === 'idle') continue
      d.t += dt
      let y = -50
      let ringK = 0
      let scale = d.s
      if (d.state === 'warn') {
        ringK = Math.min(1, d.t / 0.25)
        if (d.t >= DebrisField.WARN) {
          d.state = 'fall'
          d.t = 0
        }
      } else if (d.state === 'fall') {
        const u = Math.min(1, d.t / DebrisField.FALL)
        y = DebrisField.FALL_H * (1 - u * u) + 0.4 * d.s
        ringK = 1
        if (u >= 1) {
          d.state = 'rest'
          d.t = 0
          res.impact = true
          this.shake = Math.min(1, this.shake + 0.5)
          for (let k = 0; k < B; k++) {
            const j = i * B + k
            this.burstPos[j * 3] = d.pos.x
            this.burstPos[j * 3 + 1] = 0.3
            this.burstPos[j * 3 + 2] = d.pos.z
            this.burstT[j] = 0
          }
          ;(this.burst.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
          if (player && Math.hypot(player.x - d.pos.x, player.z - d.pos.z) < DebrisField.HIT_R && player.y < 2.2) {
            res.hit = true
            res.hitDir = new THREE.Vector3(player.x - d.pos.x, 0, player.z - d.pos.z).normalize()
          }
        }
      } else if (d.state === 'rest') {
        y = 0.4 * d.s - Math.max(0, d.t - 1.6) * 0.5
        scale = d.s * Math.max(0, 1 - Math.max(0, d.t - 1.6) / 0.8)
        if (d.t > 2.4) d.state = 'idle'
      }
      this.q.setFromEuler(d.rot)
      this.sc.setScalar(d.state === 'warn' || d.state === 'idle' ? 0 : scale)
      this.mtx.compose(new THREE.Vector3(d.pos.x, y, d.pos.z), this.q, this.sc)
      this.chunks.setMatrixAt(i, this.mtx)
      this.sc.setScalar(ringK > 0 && d.state !== 'rest' ? 1 : 0)
      this.mtx.compose(new THREE.Vector3(d.pos.x, 0.03, d.pos.z), this.q.identity(), this.sc)
      this.rings.setMatrixAt(i, this.mtx)
      this.ringK.setX(i, d.state === 'rest' ? 0 : ringK)
    }
    for (let j = 0; j < this.burstT.length; j++) if (this.burstT[j] >= 0) this.burstT[j] = this.burstT[j] + dt > 1 ? -1 : this.burstT[j] + dt
    ;(this.burst.geometry.attributes.aT as THREE.BufferAttribute).needsUpdate = true
    this.chunks.instanceMatrix.needsUpdate = true
    this.rings.instanceMatrix.needsUpdate = true
    this.ringK.needsUpdate = true
    res.shake = this.shake
    return res
  }
}
