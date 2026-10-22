// オルムの黒い手（物語 2・4・12 章）。長い腕（ひじのような節が 2 つ）・大きな手・長い指とかぎ爪。
// 黒い体に紫のふち光と、うすく光るひび。
// ・地面のひびから生える（from: 'ground'）／空の黒い輪から伸びる（from: 'sky'）
// ・reachTo（ねらう所へのばす）・chase（動く相手を追う）・slam（ふりおろし。地面に予告の円 → 地面で止まる）
// ・retract（ひっこむ）・passThrough（クローがすりぬけた波紋）・cut（裂かれて二つに分かれ、ちりになって消える）
// 腕は手ごとに 1 本のなめらかな管（毎フレーム頂点を書きかえる、約 260 頂点）。指・つめ・指の付け根は、
// すべての手でまとめて 3 つの InstancedMesh。ひび・予告の円・空の輪・波紋は手ごとの板。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { Particles } from './particles'
import { BILLBOARD_GLSL, NOISE_GLSL, approach, clamp01, disposeRoot, easeIn, easeOut, smooth, unitQuad } from './common'
import { SLAM_TIMING, slamImpactAt, slamPhase, slamWarning, type SlamTiming } from './logic'
import { toonRamp, createCutMarker } from './toon'

export type HandFrom = 'ground' | 'sky'
export type HandState = 'emerge' | 'idle' | 'reach' | 'hold' | 'chase' | 'slam' | 'retract' | 'cut' | 'gone'

export type SpawnOpts = {
  from?: HandFrom
  /** 大きさ（既定：地面 1、空 1.5） */
  size?: number
  /** 出てきて待つ位置（省略：地面なら base の上 4.5 m、空なら base の下 7 m） */
  rest?: THREE.Vector3
  /** 空の輪の向き（輪から手が出る向き。省略は下） */
  normal?: THREE.Vector3
  /** 輪・ひびを出さない（2086 年の大きなオルムの口から出すときなど） */
  noDecal?: boolean
}

const MAX = 8
/** 腕の管：根もと〜切り口（N1 本の輪）＋切り口〜手首（N2 本の輪）。切り口の輪は 2 つ重ねて持つ（裂いたら分かれる） */
const N1 = 13
const N2 = 13
const RINGS = N1 + N2
const RAD = 10
/** 裂く位置（腕の付け根からの割合） */
const CUT_U = 0.55
/** 手の部品：手のひら＋指 4×3＋親指 2 */
const PER_SEG = 1 + 12 + 2
/** 指の付け根のこぶ */
const PER_KNOB = 5
/** つめ（指 4＋親指） */
const PER_CLAW = 5

type Sever = {
  pivot: THREE.Vector3
  vel: THREE.Vector3
  axis: THREE.Vector3
  spin: number
  pos: Float32Array
  nor: Float32Array
  segs: THREE.Matrix4[]
  knobs: THREE.Matrix4[]
  claws: THREE.Matrix4[]
}

type Hand = {
  id: string
  slot: number
  from: HandFrom
  base: THREE.Vector3
  normal: THREE.Vector3
  size: number
  state: HandState
  st: number
  grow: number
  tip: THREE.Vector3
  rest: THREE.Vector3
  target: THREE.Vector3
  from0: THREE.Vector3
  sec: number
  chaseRef: THREE.Vector3 | null
  chaseSpeed: number
  slamAt: THREE.Vector3
  slamHit: boolean
  timing: SlamTiming
  curl: number
  phase: number
  pass: number
  passAt: THREE.Vector3
  fade: number
  glow: number
  sever: Sever | null
  /** 腕の中心線（輪ごと） */
  pts: THREE.Vector3[]
  point: THREE.Vector3
  wrist: THREE.Vector3
  arm: THREE.Mesh
  armPos: THREE.BufferAttribute
  armNor: THREE.BufferAttribute
  armFx: THREE.BufferAttribute
  crack: THREE.Mesh | null
  portal: THREE.Mesh | null
  cutMark: THREE.Mesh
  warn: THREE.Mesh
  ripple: THREE.Mesh
  fingerF: THREE.Vector3
  fingerN: THREE.Vector3
  bend: THREE.Vector3
}

// ------------------------------------------------------------------ 材質（黒い体・紫のふち・ひびの光・ちりになる）

function handMaterial(): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: '#242035', gradientMap: toonRamp() })
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFx;\nvarying vec2 vFx;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLocal = position;\n  vFx = aFx;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec2 vFx;\nvarying vec3 vLocal;\n${NOISE_GLSL}`)
      .replace(
        'void main() {',
        `void main() {
  float cvN = cvNoise3(vLocal * 4.0 + vec3(0.0, uTime * 0.2, 0.0));
  if (vFx.y > 0.001 && cvN < vFx.y * 1.08 - 0.04) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  float cvRim = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  totalEmissiveRadiance += vec3(0.55, 0.22, 1.0) * pow(cvRim, 2.4) * 0.55;
  // うすく光るひび（ゆっくり脈うつ）
  float cvR = abs(cvNoise3(vLocal * 1.6 + 3.1) - 0.5);
  float cvCrack = smoothstep(0.03, 0.0, cvR) * (0.55 + 0.45 * sin(uTime * 2.6 + vLocal.y * 1.5));
  totalEmissiveRadiance += vec3(0.75, 0.18, 1.0) * cvCrack * 0.25;
  // ちりになるふち・すりぬけたときの光
  float cvEdge = vFx.y > 0.001 ? smoothstep(vFx.y * 1.08 + 0.1, vFx.y * 1.08 - 0.04, cvN) : 0.0;
  totalEmissiveRadiance += vec3(0.85, 0.45, 1.0) * (cvEdge * 3.0 + vFx.x * 1.4);`,
      )
  }
  m.customProgramCacheKey = () => 'cvBlackHand'
  return m
}

/** 地面のひび（放射状の割れ目が紫に光る） */
const crackFrag = /* glsl */ `
uniform float uA;
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float lines = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float aa = fi * 0.897 + cvHash(vec2(fi, 3.0)) * 0.6;
    float da = abs(mod(a - aa + 3.14159, 6.28318) - 3.14159);
    float wob = (cvNoise(vec2(r * 6.0, fi * 7.0)) - 0.5) * 0.25;
    float len = 0.55 + cvHash(vec2(fi, 9.0)) * 0.45;
    lines = max(lines, smoothstep(0.05, 0.0, abs(da + wob) * r * 2.0) * smoothstep(len, len - 0.2, r));
  }
  float hole = smoothstep(0.3, 0.16, r + (cvNoise(p * 5.0) - 0.5) * 0.12);
  float glow = exp(-r * 3.0) * 0.5;
  vec3 col = vec3(0.7, 0.2, 1.0) * (lines * 1.6 + glow) * (0.8 + 0.2 * sin(uTime * 3.0));
  float a2 = max(hole, max(lines, glow * 0.6)) * uA;
  col = mix(col, vec3(0.01, 0.0, 0.02), hole);
  gl_FragColor = vec4(col * a2, a2);
}
`

/** 空の黒い輪（手の出口） */
const portalFrag = /* glsl */ `
uniform float uA;
uniform float uTime;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float wob = (cvNoise(vec2(a * 3.0 + uTime * 0.8, uTime * 0.5)) - 0.5) * 0.08;
  float rr = r + wob;
  float disc = smoothstep(0.62, 0.55, rr);
  float rim = exp(-pow((rr - 0.6) / 0.07, 2.0));
  float halo = exp(-pow((rr - 0.6) / 0.25, 2.0)) * 0.35;
  vec3 rimC = mix(vec3(0.6, 0.15, 1.0), vec3(0.9, 0.15, 0.4), 0.5 + 0.5 * sin(a * 2.0 + uTime));
  vec3 col = vec3(0.01, 0.0, 0.025) * disc + rimC * (rim * 1.4 + halo) * (1.0 - disc * 0.7);
  float a2 = max(disc, max(rim, halo)) * uA * smoothstep(1.0, 0.9, r);
  gl_FragColor = vec4(col * a2, a2);
}
`

/** ふりおろしの予告の円（ふちの輪と、内側がだんだん満ちる） */
const warnFrag = /* glsl */ `
uniform float uA;
uniform float uFill;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float ring = smoothstep(0.07, 0.0, abs(r - 0.9));
  float inner = step(r, 0.9 * uFill) * 0.3 + smoothstep(0.05, 0.0, abs(r - 0.9 * uFill)) * 0.9;
  float pulse = 0.75 + 0.25 * sin(uTime * 18.0);
  // 8個の山形が内側を指す。水色の切断輪と色・形で区別する。
  float angle = atan(p.y, p.x);
  float sector = abs(mod(angle + 0.392699, 0.785398) - 0.392699);
  float chevron = smoothstep(0.035, 0.012, abs(r - (0.57 + sector * 0.5))) * step(sector, 0.24);
  vec3 col = vec3(1.0, 0.42, 0.08) * 1.3;
  float a = (ring * pulse + inner + chevron) * uA * step(r, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`

/** すりぬけの波紋（広がる輪 3 つ） */
const rippleFrag = /* glsl */ `
uniform float uT;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = 0.0;
  for (int i = 0; i < 3; i++) {
    float t = uT * 1.6 - float(i) * 0.18;
    if (t <= 0.0 || t >= 1.0) continue;
    float rad = t * 0.95;
    a += exp(-pow((r - rad) / (0.025 + t * 0.04), 2.0)) * (1.0 - t);
  }
  vec3 col = vec3(0.85, 0.75, 1.0) * 1.5;
  gl_FragColor = vec4(col * a, a);
}
`

const flatVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const bbVert = /* glsl */ `
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * cvBillboard(position, 0.0);
}
`

function decalMat(frag: string, uniforms: Record<string, THREE.IUniform>, vert = flatVert): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { uA: { value: 0 }, uTime, ...uniforms },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  })
}

// ------------------------------------------------------------------ 計算の道具

const UP = new THREE.Vector3(0, 1, 0)
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _m = new THREE.Matrix4()
const _s = new THREE.Vector3()
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0)

function bezier(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u: number, out: THREE.Vector3): THREE.Vector3 {
  const v = 1 - u
  return out
    .copy(p0)
    .multiplyScalar(v * v * v)
    .addScaledVector(p1, 3 * v * v * u)
    .addScaledVector(p2, 3 * v * u * u)
    .addScaledVector(p3, u * u * u)
}

/** a→b の節（カプセル：全長 3・半径 1 の形）の行列 */
function segMatrix(a: THREE.Vector3, b: THREE.Vector3, r: number, out: THREE.Matrix4): THREE.Matrix4 {
  _d.subVectors(b, a)
  const len = _d.length()
  if (len < 1e-5) return out.copy(ZERO_M)
  _d.multiplyScalar(1 / len)
  _q.setFromUnitVectors(UP, _d)
  _c.addVectors(a, b).multiplyScalar(0.5)
  return out.compose(_c, _q, _s.set(r, Math.max(r, (len + r * 1.4) / 3), r))
}

/** 輪 i の、腕の付け根からの割合（切り口の輪は 2 つ） */
function ringU(i: number): number {
  return i < N1 ? (i / (N1 - 1)) * CUT_U : CUT_U + ((i - N1) / (N2 - 1)) * (1 - CUT_U)
}

/** 腕の太さ（根もと太く・手首へ細く、ひじのような節が 2 つ） */
function armRadius(u: number, S: number): number {
  const base = 0.34 - 0.2 * u
  const knot = 0.2 * Math.exp(-Math.pow((u - 0.34) / 0.035, 2)) + 0.17 * Math.exp(-Math.pow((u - 0.72) / 0.03, 2))
  const flare = 0.35 * Math.exp(-u / 0.04)
  return base * (1 + knot + flare) * S
}

/** 腕の管の index（切り口の 2 つの輪のあいだはつながない） */
function armIndex(): THREE.BufferAttribute {
  const ix: number[] = []
  for (let r = 0; r < RINGS - 1; r++) {
    if (r === N1 - 1) continue
    for (let k = 0; k < RAD; k++) {
      const a = r * RAD + k
      const b = r * RAD + ((k + 1) % RAD)
      const c = (r + 1) * RAD + k
      const d = (r + 1) * RAD + ((k + 1) % RAD)
      ix.push(a, b, c, b, d, c)
    }
  }
  // 手首のふた
  const center = RINGS * RAD
  for (let k = 0; k < RAD; k++) ix.push((RINGS - 1) * RAD + k, (RINGS - 1) * RAD + ((k + 1) % RAD), center)
  return new THREE.BufferAttribute(new Uint16Array(ix), 1)
}

// ------------------------------------------------------------------ 本体

export class BlackHands {
  readonly root = new THREE.Group()
  /** 手が地面をたたいた（ふりおろしの瞬間）。ゆれ・ダメージに */
  onSlamHit: ((id: string, at: THREE.Vector3) => void) | null = null
  private readonly hands = new Map<string, Hand>()
  private readonly free: number[] = []
  private readonly segMesh: THREE.InstancedMesh
  private readonly knobMesh: THREE.InstancedMesh
  private readonly clawMesh: THREE.InstancedMesh
  private readonly segFx: THREE.InstancedBufferAttribute
  private readonly knobFx: THREE.InstancedBufferAttribute
  private readonly clawFx: THREE.InstancedBufferAttribute
  private readonly mat: THREE.MeshToonMaterial
  private readonly dust: Particles
  private readonly sparks: Particles
  private readonly geos: THREE.BufferGeometry[] = []
  private readonly mats: THREE.Material[] = []
  private readonly index = armIndex()

  constructor(parent: THREE.Object3D) {
    this.root.name = 'blackHands'
    parent.add(this.root)
    this.mat = handMaterial()
    this.mats.push(this.mat)
    const segG = new THREE.CapsuleGeometry(1, 1, 3, 10)
    const knobG = new THREE.SphereGeometry(1, 12, 8)
    const clawG = new THREE.ConeGeometry(1, 1, 8)
    clawG.translate(0, 0.5, 0)
    this.segFx = new THREE.InstancedBufferAttribute(new Float32Array(MAX * PER_SEG * 2), 2)
    this.knobFx = new THREE.InstancedBufferAttribute(new Float32Array(MAX * PER_KNOB * 2), 2)
    this.clawFx = new THREE.InstancedBufferAttribute(new Float32Array(MAX * PER_CLAW * 2), 2)
    segG.setAttribute('aFx', this.segFx)
    knobG.setAttribute('aFx', this.knobFx)
    clawG.setAttribute('aFx', this.clawFx)
    this.geos.push(segG, knobG, clawG)
    const mk = (g: THREE.BufferGeometry, n: number, name: string) => {
      const im = new THREE.InstancedMesh(g, this.mat, n)
      im.name = name
      im.frustumCulled = false
      im.castShadow = true
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      for (let i = 0; i < n; i++) im.setMatrixAt(i, ZERO_M)
      this.root.add(im)
      return im
    }
    this.segMesh = mk(segG, MAX * PER_SEG, 'handSegs')
    this.knobMesh = mk(knobG, MAX * PER_KNOB, 'handKnobs')
    this.clawMesh = mk(clawG, MAX * PER_CLAW, 'handClaws')
    this.dust = new Particles({ max: 500, shape: 'smoke', additive: false, renderOrder: 3 })
    this.sparks = new Particles({ max: 400, shape: 'spark', additive: true, renderOrder: 4 })
    this.root.add(this.dust.points, this.sparks.points)
    for (let i = MAX - 1; i >= 0; i--) this.free.push(i)
  }

  /** 手を出す（id は自由な名前。同じ id がいれば置きかえ） */
  spawn(id: string, base: THREE.Vector3, o: SpawnOpts = {}): void {
    this.remove(id)
    const slot = this.free.pop()
    if (slot === undefined) {
      console.warn('[BlackHands] 手が多すぎる（最大 ' + MAX + '）')
      return
    }
    const from = o.from ?? 'ground'
    const size = o.size ?? (from === 'sky' ? 1.5 : 1)
    const normal = (o.normal ?? (from === 'sky' ? new THREE.Vector3(0, -1, 0) : UP)).clone().normalize()
    const rest = o.rest?.clone() ?? base.clone().addScaledVector(normal, from === 'sky' ? 7 * size : 4.5 * size)
    const mkDecal = (frag: string, u: Record<string, THREE.IUniform>, vert?: string) => {
      const m = new THREE.Mesh(unitQuad(), decalMat(frag, u, vert))
      m.frustumCulled = false
      m.renderOrder = 2
      this.mats.push(m.material as THREE.Material)
      this.root.add(m)
      return m
    }
    let crack: THREE.Mesh | null = null
    let portal: THREE.Mesh | null = null
    if (!o.noDecal) {
      if (from === 'ground') {
        crack = mkDecal(crackFrag, {})
        crack.position.copy(base).addScaledVector(UP, 0.03)
        crack.rotation.x = -Math.PI / 2
        crack.scale.setScalar(3.4 * size)
      } else {
        portal = mkDecal(portalFrag, {})
        portal.position.copy(base)
        portal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
        portal.scale.setScalar(4.2 * size)
      }
    }
    const warn = mkDecal(warnFrag, { uFill: { value: 0 } })
    warn.rotation.x = -Math.PI / 2
    warn.visible = false
    const ripple = mkDecal(rippleFrag, { uT: { value: 0 } }, bbVert)
    ripple.visible = false
    const cutMark = createCutMarker(armRadius(CUT_U, size) + 0.065 * size, 0.12 * size)
    cutMark.visible = false
    this.root.add(cutMark)
    // 腕の管（頂点は毎フレーム書く）
    const g = new THREE.BufferGeometry()
    const nV = RINGS * RAD + 1
    const armPos = new THREE.BufferAttribute(new Float32Array(nV * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const armNor = new THREE.BufferAttribute(new Float32Array(nV * 3), 3).setUsage(THREE.DynamicDrawUsage)
    const armFx = new THREE.BufferAttribute(new Float32Array(nV * 2), 2).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', armPos)
    g.setAttribute('normal', armNor)
    g.setAttribute('aFx', armFx)
    g.setIndex(this.index)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    const arm = new THREE.Mesh(g, this.mat)
    arm.name = 'handArm'
    arm.frustumCulled = false
    arm.castShadow = true
    this.root.add(arm)
    const h: Hand = {
      id,
      slot,
      from,
      base: base.clone(),
      normal,
      size,
      state: 'emerge',
      st: 0,
      grow: 0,
      tip: rest.clone(),
      rest,
      target: rest.clone(),
      from0: rest.clone(),
      sec: 1,
      chaseRef: null,
      chaseSpeed: 4,
      slamAt: base.clone(),
      slamHit: false,
      timing: { ...SLAM_TIMING },
      curl: 0.4,
      phase: Math.random() * 10,
      pass: -1,
      passAt: new THREE.Vector3(),
      fade: 0,
      glow: 0,
      sever: null,
      pts: Array.from({ length: RINGS }, () => new THREE.Vector3()),
      point: base.clone(),
      wrist: rest.clone(),
      arm,
      armPos,
      armNor,
      armFx,
      crack,
      portal,
      warn,
      cutMark,
      ripple,
      fingerF: new THREE.Vector3(0, 0, -1),
      fingerN: UP.clone(),
      bend: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
    }
    this.hands.set(id, h)
    if (from === 'ground') this.dust.burst(26, base, 3.5 * size, { life: 1.2, size: 0.35 * size, grow: 2.2, color: '#2a2030', alpha: 0.75, gravity: 3, drag: 1.5 }, 2.5, 0.8 * size)
  }

  has(id: string): boolean {
    return this.hands.has(id)
  }

  state(id: string): HandState | null {
    return this.hands.get(id)?.state ?? null
  }

  /** ふりおろしの段階（slam 中だけ） */
  slamPhase(id: string): ReturnType<typeof slamPhase> | null {
    const h = this.hands.get(id)
    if (!h || h.state !== 'slam') return null
    return slamPhase(h.st, h.timing)
  }

  /** 地面で止まっている（裂くチャンス） */
  isStuck(id: string): boolean {
    return this.slamPhase(id)?.phase === 'stuck'
  }

  /** 手首のワールド座標（毎フレーム更新される同じ Vector3） */
  handPos(id: string): THREE.Vector3 | null {
    return this.hands.get(id)?.wrist ?? null
  }

  /** 腕の裂く所（まん中より少し手の側。rt.chrono の的に。毎フレーム更新される同じ Vector3） */
  point(id: string): THREE.Vector3 | null {
    return this.hands.get(id)?.point ?? null
  }

  get ids(): string[] {
    return [...this.hands.keys()]
  }

  /** target へ sec 秒でのばし、そこでつかむ（hold） */
  reachTo(id: string, target: THREE.Vector3, sec = 1.2): void {
    const h = this.hands.get(id)
    if (!h || h.state === 'cut' || h.state === 'retract') return
    h.from0.copy(h.tip)
    h.target.copy(target)
    h.sec = Math.max(0.05, sec)
    this.go(h, 'reach')
  }

  /** 動く相手（毎フレーム読む Vector3）を、上から speed m/s で追いかける */
  chase(id: string, target: THREE.Vector3, speed = 4): void {
    const h = this.hands.get(id)
    if (!h || h.state === 'cut' || h.state === 'retract') return
    h.chaseRef = target
    h.chaseSpeed = speed
    this.go(h, 'chase')
  }

  /** at の地面へふりおろす（予告の円 → たたく → 地面で止まる → もどる） */
  slam(id: string, at: THREE.Vector3, timing: Partial<SlamTiming> = {}): void {
    const h = this.hands.get(id)
    if (!h || h.state === 'cut' || h.state === 'retract') return
    h.slamAt.copy(at)
    h.from0.copy(h.tip)
    h.slamHit = false
    h.timing = { ...SLAM_TIMING, ...timing }
    h.warn.position.copy(at).addScaledVector(UP, 0.04)
    h.warn.scale.setScalar(3.0 * h.size)
    this.go(h, 'slam')
  }

  /** 待つ位置へもどる（rest を変えるときは渡す） */
  idle(id: string, rest?: THREE.Vector3): void {
    const h = this.hands.get(id)
    if (!h || h.state === 'cut' || h.state === 'retract') return
    if (rest) h.rest.copy(rest)
    h.from0.copy(h.tip)
    this.go(h, 'idle')
  }

  /** 出口へひっこんで消える */
  retract(id: string): void {
    const h = this.hands.get(id)
    if (!h || h.state === 'cut' || h.state === 'gone') return
    this.go(h, 'retract')
  }

  /** クローがすりぬけた（波紋。腕が一瞬すけて光る）。at を省くと腕の裂く所 */
  passThrough(id: string, at?: THREE.Vector3): void {
    const h = this.hands.get(id)
    if (!h) return
    h.pass = 0
    h.passAt.copy(at ?? h.point)
    h.ripple.position.copy(h.passAt)
    h.ripple.scale.setScalar(2.2 * h.size)
    h.ripple.visible = true
    this.sparks.burst(14, h.passAt, 2.2, { life: 0.5, size: 0.08, color: new THREE.Color('#d8c8ff').multiplyScalar(1.8), drag: 3 })
  }

  /** 裂かれた：腕の裂く所で二つに分かれ、ちりになって消える */
  cut(id: string): void {
    const h = this.hands.get(id)
    if (!h || h.state === 'cut' || h.state === 'gone') return
    const pivot = h.pts[N1].clone()
    const away = _a.subVectors(h.wrist, h.base).normalize()
    const n0 = N1 * RAD
    const sever: Sever = {
      pivot,
      vel: away.clone().multiplyScalar(2.2 * h.size).add(new THREE.Vector3(0, 1.5, 0)),
      axis: new THREE.Vector3(Math.random() - 0.5, 0.2, Math.random() - 0.5).normalize(),
      spin: 1.6 + Math.random() * 1.2,
      pos: (h.armPos.array as Float32Array).slice(n0 * 3),
      nor: (h.armNor.array as Float32Array).slice(n0 * 3),
      segs: [],
      knobs: [],
      claws: [],
    }
    const grab = (im: THREE.InstancedMesh, base: number, n: number, out: THREE.Matrix4[]) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Matrix4()
        im.getMatrixAt(base + i, m)
        out.push(m)
      }
    }
    grab(this.segMesh, h.slot * PER_SEG, PER_SEG, sever.segs)
    grab(this.knobMesh, h.slot * PER_KNOB, PER_KNOB, sever.knobs)
    grab(this.clawMesh, h.slot * PER_CLAW, PER_CLAW, sever.claws)
    h.sever = sever
    h.warn.visible = false
    // 切り口の光と、ちり
    this.sparks.burst(40, pivot, 6 * h.size, { life: 0.6, size: 0.12 * h.size, color: new THREE.Color('#e8f4ff').multiplyScalar(2.2), drag: 3.5 }, 0, 0.2)
    this.sparks.burst(30, pivot, 2.5 * h.size, { life: 1.2, size: 0.1 * h.size, color: new THREE.Color('#b070ff').multiplyScalar(1.8), drag: 1.5, gravity: -0.3 })
    this.go(h, 'cut')
  }

  /** すぐに消す（演出なし） */
  remove(id: string): void {
    const h = this.hands.get(id)
    if (!h) return
    this.clearSlot(h.slot)
    for (const m of [h.crack, h.portal, h.warn, h.ripple]) {
      if (!m) continue
      m.removeFromParent()
      const mat = m.material as THREE.Material
      mat.dispose()
      const i = this.mats.indexOf(mat)
      if (i >= 0) this.mats.splice(i, 1)
    }
    h.cutMark.removeFromParent()
    h.cutMark.geometry.dispose()
    ;(h.cutMark.material as THREE.Material).dispose()
    h.arm.removeFromParent()
    h.arm.geometry.dispose()
    this.hands.delete(id)
    this.free.push(h.slot)
  }

  clear(): void {
    for (const id of [...this.hands.keys()]) this.remove(id)
  }

  update(dt: number, t: number): void {
    for (const h of [...this.hands.values()]) this.step(h, dt, t)
    this.segMesh.instanceMatrix.needsUpdate = true
    this.knobMesh.instanceMatrix.needsUpdate = true
    this.clawMesh.instanceMatrix.needsUpdate = true
    this.segFx.needsUpdate = true
    this.knobFx.needsUpdate = true
    this.clawFx.needsUpdate = true
    this.dust.update(dt)
    this.sparks.update(dt)
  }

  dispose(): void {
    this.clear()
    this.dust.dispose()
    this.sparks.dispose()
    disposeRoot(this.root)
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
  }

  // ---------------------------------------------------------------- 中身

  private go(h: Hand, s: HandState): void {
    h.state = s
    h.st = 0
  }

  private clearSlot(slot: number): void {
    for (let i = 0; i < PER_SEG; i++) this.segMesh.setMatrixAt(slot * PER_SEG + i, ZERO_M)
    for (let i = 0; i < PER_KNOB; i++) this.knobMesh.setMatrixAt(slot * PER_KNOB + i, ZERO_M)
    for (let i = 0; i < PER_CLAW; i++) this.clawMesh.setMatrixAt(slot * PER_CLAW + i, ZERO_M)
  }

  private step(h: Hand, dt: number, t: number): void {
    h.st += dt
    const sway = _b.set(Math.sin(t * 0.9 + h.phase), Math.sin(t * 0.7 + h.phase * 1.7) * 0.4, Math.cos(t * 0.8 + h.phase)).multiplyScalar(0.35 * h.size)
    let wantCurl = 0.35 + Math.sin(t * 1.4 + h.phase) * 0.15
    let flat = 0
    let glow = 0
    let fade = 0
    switch (h.state) {
      case 'emerge': {
        h.grow = easeOut(h.st / 0.9)
        h.tip.copy(h.rest).add(sway)
        wantCurl = 0.7 - h.grow * 0.4
        if (h.st >= 0.9) this.go(h, 'idle')
        break
      }
      case 'idle': {
        h.grow = 1
        _a.copy(h.rest).add(sway)
        h.tip.lerp(_a, 1 - Math.exp(-dt * 2.5))
        break
      }
      case 'reach':
      case 'hold': {
        h.grow = 1
        if (h.state === 'reach') {
          const k = smooth(h.st / h.sec)
          h.tip.lerpVectors(h.from0, h.target, k)
          // 少し上から弧を描いて
          h.tip.y += Math.sin(k * Math.PI) * 0.8 * h.size
          wantCurl = 0.05
          if (h.st >= h.sec) this.go(h, 'hold')
        } else {
          h.tip.copy(h.target).addScaledVector(sway, 0.12)
          wantCurl = 0.85
        }
        break
      }
      case 'chase': {
        h.grow = 1
        if (h.chaseRef) {
          _a.copy(h.chaseRef).addScaledVector(UP, 1.6 * h.size).addScaledVector(sway, 0.4)
          _c.subVectors(_a, h.tip)
          const d = _c.length()
          const mv = Math.min(d, h.chaseSpeed * dt)
          if (d > 1e-4) h.tip.addScaledVector(_c, mv / d)
        }
        wantCurl = 0.15 + Math.max(0, Math.sin(t * 5 + h.phase)) * 0.45
        break
      }
      case 'slam': {
        h.grow = 1
        const p = slamPhase(h.st, h.timing)
        const hover = _c.copy(h.slamAt).addScaledVector(UP, 4.2 * h.size)
        const ground = _d.copy(h.slamAt).addScaledVector(UP, 0.3 * h.size)
        const warn = slamWarning(h.st, h.timing)
        h.warn.visible = warn.show
        if (warn.show) {
          const u = (h.warn.material as THREE.ShaderMaterial).uniforms
          u.uA.value = 1
          u.uFill.value = warn.fill
          h.warn.scale.setScalar(3.0 * h.size * warn.ring)
        }
        if (p.phase === 'windup') {
          h.tip.lerpVectors(h.from0, hover, easeOut(p.k))
          h.tip.y += Math.sin(p.k * Math.PI) * 0.4
          wantCurl = 0.05
          flat = smooth(p.k)
        } else if (p.phase === 'strike') {
          h.tip.lerpVectors(hover, ground, easeIn(p.k))
          wantCurl = 0.0
          flat = 1
        } else if (p.phase === 'stuck') {
          h.tip.copy(ground)
          h.tip.x += Math.sin(t * 40) * 0.012 * h.size
          wantCurl = 0.5
          flat = 1
          // 止まっている（裂くチャンス）を、ゆっくりした紫の明滅で
          glow = 0.015 + 0.01 * Math.sin(t * 7)
        } else if (p.phase === 'recover') {
          h.tip.lerpVectors(ground, _a.copy(h.rest).add(sway), smooth(p.k))
          flat = 1 - p.k
        } else {
          h.from0.copy(h.tip)
          this.go(h, 'idle')
        }
        if (!h.slamHit && h.st >= slamImpactAt(h.timing)) {
          h.slamHit = true
          const at = h.slamAt
          this.dust.burst(36, at, 5 * h.size, { life: 1.1, size: 0.4 * h.size, grow: 2.4, color: '#3a3040', alpha: 0.7, gravity: 2.5, drag: 2.2 }, 1.2, 0.6 * h.size)
          this.sparks.burst(24, at, 4 * h.size, { life: 0.6, size: 0.1 * h.size, color: new THREE.Color('#c890ff').multiplyScalar(2), drag: 2.5 }, 1)
          this.onSlamHit?.(h.id, at)
        }
        break
      }
      case 'retract': {
        h.grow = 1 - easeIn(h.st / 0.8)
        h.tip.lerp(h.rest, 1 - Math.exp(-dt * 2))
        wantCurl = 0.8
        if (h.st >= 0.8) {
          this.remove(h.id)
          return
        }
        break
      }
      case 'cut': {
        fade = clamp01(h.st / 1.1)
        if (h.st < 1.0 && dt > 0) {
          const n = Math.round(dt * 60)
          for (let i = 0; i < n; i++) {
            const idx = Math.floor(Math.random() * RINGS)
            _c.copy(h.pts[idx]).add(_d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5 * h.size))
            this.dust.emit(_c, _d.set(0, 0.6, 0), { life: 1.0, size: 0.18 * h.size, grow: 1.8, color: '#1a1022', alpha: 0.65, drag: 1.2, gravity: -0.4 })
            if (Math.random() < 0.4) this.sparks.emit(_c, _d.set(0, 0.8, 0), { life: 0.9, size: 0.06 * h.size, color: new THREE.Color('#a060ff').multiplyScalar(1.6), drag: 1, gravity: -0.3 })
          }
        }
        if (h.st >= 1.4) {
          this.remove(h.id)
          return
        }
        break
      }
    }
    // すりぬけの波紋
    if (h.pass >= 0) {
      h.pass += dt
      ;(h.ripple.material as THREE.ShaderMaterial).uniforms.uT.value = h.pass
      glow = Math.max(glow, Math.max(0, 1 - h.pass * 2.5))
      if (h.pass > 0.9) {
        h.pass = -1
        h.ripple.visible = false
      }
    }
    h.curl = approach(h.curl, wantCurl, 8, dt)
    h.glow = glow
    h.fade = fade
    // ひび・空の輪の明るさ
    const decalA = h.state === 'cut' ? 1 - fade : h.state === 'retract' ? 1 - clamp01(h.st / 0.8) : clamp01(h.grow * 3)
    if (h.crack) (h.crack.material as THREE.ShaderMaterial).uniforms.uA.value = decalA
    if (h.portal) (h.portal.material as THREE.ShaderMaterial).uniforms.uA.value = decalA
    if (h.state !== 'slam') h.warn.visible = false
    if (h.state === 'cut') this.poseCut(h)
    else this.pose(h, flat, t)
    h.cutMark.visible = h.state === 'slam' && slamPhase(h.st, h.timing).phase === 'stuck'
    if (h.cutMark.visible) {
      h.cutMark.position.copy(h.point)
      const tangent = _a.subVectors(h.pts[N1 + 1], h.pts[N1 - 2]).normalize()
      h.cutMark.quaternion.setFromUnitVectors(_b.set(0, 0, 1), tangent)
      h.cutMark.scale.setScalar(1 + 0.04 * Math.sin(t * 5))
    }
  }

  /** 腕の中心線（h.pts）を計算する。g：のびた割合 */
  private centerline(h: Hand, flat: number, t: number, g: number): void {
    const S = h.size
    const B = h.base
    const W = h.tip
    const L = Math.max(0.5, B.distanceTo(W))
    const p1 = _c.copy(B).addScaledVector(h.normal, L * 0.5).addScaledVector(h.bend, L * 0.22)
    const inDir = _d.subVectors(W, p1).normalize()
    if (flat > 0) inDir.lerp(_a.set(0, -1, 0), flat).normalize()
    const p2 = _a.copy(W).addScaledVector(inDir, -L * 0.28)
    const w1 = Math.sin(t * 1.1 + h.phase * 2) * 0.3 * S
    const w2 = Math.cos(t * 0.9 + h.phase) * 0.3 * S
    const uMax = Math.max(0.001, g)
    const p1c = p1.clone()
    const p2c = p2.clone()
    for (let i = 0; i < RINGS; i++) {
      const u = ringU(i) * uMax
      bezier(B, p1c, p2c, W, u, h.pts[i])
      const k = Math.sin(u * Math.PI)
      h.pts[i].x += w1 * k
      h.pts[i].z += w2 * k
    }
  }

  /** 腕の管の頂点を書く（輪 r0..r1-1）。fadeA：ちりになる度合い */
  private writeTube(h: Hand, r0: number, r1: number, glow: number, fade: number, collapse: Set<number>): void {
    const pos = h.armPos.array as Float32Array
    const nor = h.armNor.array as Float32Array
    const fx = h.armFx.array as Float32Array
    const T = new THREE.Vector3()
    const N = new THREE.Vector3()
    const Bn = new THREE.Vector3()
    // はじめの輪の向き（出口の向きに垂直な、決まった向き）
    T.subVectors(h.pts[1], h.pts[0]).normalize()
    N.set(1, 0, 0)
    if (Math.abs(T.dot(N)) > 0.9) N.set(0, 0, 1)
    N.addScaledVector(T, -N.dot(T)).normalize()
    for (let r = 0; r < RINGS; r++) {
      const a = h.pts[Math.max(0, r - 1)]
      const b = h.pts[Math.min(RINGS - 1, r + 1)]
      const nt = _a.subVectors(b, a)
      if (nt.lengthSq() > 1e-10) {
        nt.normalize()
        // 前の輪の向きを、新しい接線へ回して運ぶ（ねじれない）
        _q.setFromUnitVectors(T, nt)
        N.applyQuaternion(_q)
        T.copy(nt)
      }
      Bn.crossVectors(T, N)
      if (r < r0 || r >= r1) continue
      const u = ringU(r)
      const rad = collapse.has(r) ? 0 : armRadius(u, h.size) * (0.6 + 0.4 * Math.min(1, h.grow * 2 + (h.state === 'cut' ? 1 : 0)))
      const c = h.pts[r]
      for (let k = 0; k < RAD; k++) {
        const ang = (k / RAD) * Math.PI * 2
        const cs = Math.cos(ang)
        const sn = Math.sin(ang)
        const nx = N.x * cs + Bn.x * sn
        const ny = N.y * cs + Bn.y * sn
        const nz = N.z * cs + Bn.z * sn
        const vi = (r * RAD + k) * 3
        pos[vi] = c.x + nx * rad
        pos[vi + 1] = c.y + ny * rad
        pos[vi + 2] = c.z + nz * rad
        nor[vi] = nx
        nor[vi + 1] = ny
        nor[vi + 2] = nz
        const fi = (r * RAD + k) * 2
        fx[fi] = glow
        fx[fi + 1] = fade
      }
    }
    // 手首のふた
    const ci = RINGS * RAD
    const w = h.pts[RINGS - 1]
    pos[ci * 3] = w.x + T.x * 0.05
    pos[ci * 3 + 1] = w.y + T.y * 0.05
    pos[ci * 3 + 2] = w.z + T.z * 0.05
    nor[ci * 3] = T.x
    nor[ci * 3 + 1] = T.y
    nor[ci * 3 + 2] = T.z
    fx[ci * 2] = glow
    fx[ci * 2 + 1] = fade
    h.armPos.needsUpdate = true
    h.armNor.needsUpdate = true
    h.armFx.needsUpdate = true
  }

  /** 腕と手の形を計算して書く */
  private pose(h: Hand, flat: number, t: number): void {
    const S = h.size
    this.centerline(h, flat, t, h.grow)
    this.writeTube(h, 0, RINGS, h.glow, h.fade, NONE)
    const W = h.pts[RINGS - 1]
    h.wrist.copy(W)
    h.point.copy(h.pts[N1])
    // 手の向き：指の向き F・手の甲 N・横 Sd
    const F = h.fingerF
    _a.subVectors(h.pts[RINGS - 1], h.pts[RINGS - 3]).normalize()
    if (h.state === 'reach' || h.state === 'hold' || h.state === 'chase') {
      const aimAt = h.state === 'chase' && h.chaseRef ? h.chaseRef : h.target
      _b.subVectors(aimAt, W)
      if (_b.lengthSq() > 0.01) _a.lerp(_b.normalize(), 0.6).normalize()
    }
    if (flat > 0) {
      _b.set(_a.x, 0, _a.z)
      if (_b.lengthSq() < 1e-4) _b.subVectors(W, h.base).setY(0)
      if (_b.lengthSq() < 1e-4) _b.set(0, 0, -1)
      _b.normalize()
      _a.lerp(_b, flat).normalize()
    }
    F.copy(_a)
    const N = h.fingerN
    // 最初は掌をプレイカメラ側（-Z）へ見せる。ふりおろしでは地面へ伏せる。
    N.set(0, flat, -(1 - flat)).normalize()
    N.addScaledVector(F, -N.dot(F))
    if (N.lengthSq() < 1e-3) N.copy(h.bend)
    N.normalize()
    const Sd = _c.crossVectors(F, N).normalize()
    N.crossVectors(Sd, F).normalize()
    const sd = Sd.clone()
    // 手のひら
    const palmLen = 1.1 * S
    const palmW = 1.05 * S
    const basis = new THREE.Matrix4().makeBasis(sd, F, N)
    const palmC = W.clone().addScaledVector(F, palmLen * 0.36)
    _m.copy(basis).scale(_s.set(palmW * 0.5, palmLen / 3, 0.2 * S)).setPosition(palmC)
    const segBase = h.slot * PER_SEG
    const knobBase = h.slot * PER_KNOB
    const clawBase = h.slot * PER_CLAW
    this.segMesh.setMatrixAt(segBase, _m)
    this.segFx.setXY(segBase, h.glow, h.fade)
    // 指 4 本（3 節）＋親指（2 節）。curl で手のひら側へ曲がる
    const curl = h.curl
    const fingerLen = [0.44, 0.36, 0.3]
    let si = segBase + 1
    let ki = knobBase
    let ci = clawBase
    const dir = new THREE.Vector3()
    const p = new THREE.Vector3()
    const q = new THREE.Vector3()
    for (let f = 0; f < 5; f++) {
      const thumb = f === 4
      const off = thumb ? 0 : (f - 1.5) * palmW * 0.3
      const lenK = thumb ? 0.85 : [0.9, 1.05, 1.0, 0.8][f]
      if (thumb) {
        p.copy(W).addScaledVector(F, palmLen * 0.3).addScaledVector(sd, (palmW * 0.5 + 0.15 * S))
        dir.copy(F).multiplyScalar(0.55).addScaledVector(sd, 0.8).addScaledVector(N, -0.25).normalize()
      } else {
        p.copy(W).addScaledVector(F, palmLen * (0.8 - 0.2 * Math.abs((f - 1.5) / 1.5))).addScaledVector(sd, off)
        const spread = (f - 1.5) * 0.25 * (1 - curl * 0.7)
        dir.copy(F).addScaledVector(sd, Math.sin(spread)).normalize()
      }
      // 付け根のこぶ
      _m.compose(p, _q.setFromRotationMatrix(basis), _s.set((thumb ? 0.24 : 0.13) * S, (thumb ? 0.2 : 0.13) * S, (thumb ? 0.15 : 0.13) * S))
      this.knobMesh.setMatrixAt(ki, _m)
      this.knobFx.setXY(ki, h.glow, h.fade)
      ki++
      const nSeg = thumb ? 2 : 3
      for (let j = 0; j < nSeg; j++) {
        // 曲げる軸は横（sd）。手のひら側（-N）へ
        const bend = (j === 0 ? 0.25 : 0.55) * curl + (j === 0 ? 0.08 : 0.12) + Math.sin(t * 2 + f + h.phase) * 0.05
        dir.applyAxisAngle(sd, -bend)
        const len = fingerLen[j] * lenK * S
        q.copy(p).addScaledVector(dir, len)
        segMatrix(p, q, (0.12 - j * 0.018) * S, _m)
        this.segMesh.setMatrixAt(si, _m)
        this.segFx.setXY(si, h.glow, h.fade)
        si++
        p.copy(q)
      }
      // かぎ爪
      _q.setFromUnitVectors(UP, _b.copy(dir).applyAxisAngle(sd, -0.35).normalize())
      _m.compose(p, _q, _s.set(0.05 * S, 0.12 * S, 0.05 * S))
      this.clawMesh.setMatrixAt(ci, _m)
      this.clawFx.setXY(ci, h.glow + 0.3, h.fade)
      ci++
    }
  }

  /** 裂かれたあと：根もと側はちりになりながらひっこみ、手の側は飛んで回りながら消える */
  private poseCut(h: Hand): void {
    const sv = h.sever
    if (!sv) return
    const tt = h.st
    const fade = clamp01(tt / 1.2)
    // 根もと側：中心線を切り口から根もとへ縮める
    const shrink = 1 - easeIn(tt / 0.8)
    const B = h.base
    for (let i = 0; i < N1; i++) h.pts[i].lerp(B, (1 - shrink) * (i / (N1 - 1)) * 0.9)
    this.writeTube(h, 0, N1, 0.3, fade, CUT_CAP_BASE)
    // 手の側：写した頂点を X = T(pivot+off)·R·T(-pivot) で動かす
    const off = _a.copy(sv.vel).multiplyScalar(tt).add(_b.set(0, -2.5 * tt * tt, 0))
    _q.setFromAxisAngle(sv.axis, sv.spin * tt)
    const X = new THREE.Matrix4()
      .makeTranslation(sv.pivot.x + off.x, sv.pivot.y + off.y, sv.pivot.z + off.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(_q))
      .multiply(new THREE.Matrix4().makeTranslation(-sv.pivot.x, -sv.pivot.y, -sv.pivot.z))
    const pos = h.armPos.array as Float32Array
    const nor = h.armNor.array as Float32Array
    const fx = h.armFx.array as Float32Array
    const n0 = N1 * RAD
    const v = new THREE.Vector3()
    for (let i = 0; i < sv.pos.length / 3; i++) {
      v.set(sv.pos[i * 3], sv.pos[i * 3 + 1], sv.pos[i * 3 + 2]).applyMatrix4(X)
      const j = (n0 + i) * 3
      // 切り口の輪は閉じる
      if (i < RAD) v.copy(sv.pivot).add(off)
      pos[j] = v.x
      pos[j + 1] = v.y
      pos[j + 2] = v.z
      v.set(sv.nor[i * 3], sv.nor[i * 3 + 1], sv.nor[i * 3 + 2]).applyQuaternion(_q)
      nor[j] = v.x
      nor[j + 1] = v.y
      nor[j + 2] = v.z
      fx[(n0 + i) * 2] = 0.4
      fx[(n0 + i) * 2 + 1] = fade
    }
    h.armPos.needsUpdate = true
    h.armNor.needsUpdate = true
    h.armFx.needsUpdate = true
    const put = (im: THREE.InstancedMesh, attr: THREE.InstancedBufferAttribute, base: number, list: THREE.Matrix4[], glow: number) => {
      list.forEach((m0, i) => {
        _m.multiplyMatrices(X, m0)
        im.setMatrixAt(base + i, _m)
        attr.setXY(base + i, glow, fade)
      })
    }
    put(this.segMesh, this.segFx, h.slot * PER_SEG, sv.segs, 0.4)
    put(this.knobMesh, this.knobFx, h.slot * PER_KNOB, sv.knobs, 0.4)
    put(this.clawMesh, this.clawFx, h.slot * PER_CLAW, sv.claws, 0.6)
    h.point.copy(sv.pivot)
  }
}

const NONE = new Set<number>()
/** 裂いたあと、根もと側の切り口の輪を閉じる */
const CUT_CAP_BASE = new Set<number>([N1 - 1])
