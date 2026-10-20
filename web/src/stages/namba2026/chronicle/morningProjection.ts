// 「江戸の朝の路地」の映し出し（物語 v7 の 9 章）：社長が路地のかんばんの記録から江戸の朝をえらんで、いっぱいに光らせる。
// 路地じゅうが、まぶしい朝の景色につつまれる → 影たちは朝が来たとかんちがいして、にげだす。
// ・まわりの壁の前に、光の映像（朝日の町家の並び）の板を立てる（加算。かんばんの側から順に、光の線が走って現れる）
// ・かんばんの板から、光の帯が何本も空き地へ流れていく（帯の中を光の粒が流れる）
// ・地面に朝日の光だまりと格子の影、宙にちりの粒
// ・setAim(p)：大きな影がかくれた暗がりへ、光の向きを変える（いちばん太い帯と光だまりがそこへ）
// ・isLit(p)：その場所がどれだけ照らされているか（0〜1。影がにげる・引きたおせるかの判定に）
// 環境の色（空・半球光など）は alleyTime.ts の setProjection で一緒に動かす（シーンが両方を呼ぶ）。
import * as THREE from 'three'
import { paintEdoMorning } from './recordArt'

export type ProjectionPanel = {
  /** 下のふちの左右（ワールド。左 → 右に見たときの面が表） */
  a: THREE.Vector3
  b: THREE.Vector3
  h: number
  /** 江戸の絵のどこを使うか（横の位置 0〜1） */
  u0?: number
  u1?: number
}

const panelVert = /* glsl */ `
varying vec2 vUv;
varying float vDist;
uniform vec3 uFrom;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDist = distance(wp.xz, uFrom.xz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const panelFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uK;
uniform float uTime;
uniform float uReach;
varying vec2 vUv;
varying float vDist;
void main() {
  // かんばんから近い順に現れる（光の線が走る）
  float front = uK * uReach;
  float on = smoothstep(front, front - 2.5, vDist);
  float line = exp(-pow((vDist - front) / 0.5, 2.0)) * step(0.01, uK) * step(uK, 0.999);
  vec3 c = texture2D(uMap, vUv).rgb;
  // 映像らしい走査線とちらつき
  float scan = 0.82 + 0.18 * sin(vUv.y * 220.0 + uTime * 6.0);
  float flick = 0.94 + 0.06 * sin(uTime * 23.0 + vUv.x * 9.0);
  // 下のふちは地面になじむ
  float base = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
  vec3 col = c * 1.25 * scan * flick * on * base + vec3(1.6, 1.3, 0.8) * line * 1.4;
  gl_FragColor = vec4(col, 1.0);
}
`

const ribbonVert = /* glsl */ `
attribute float aT;
attribute float aS;
varying float vT;
varying float vS;
void main() {
  vT = aT;
  vS = aS;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const ribbonFrag = /* glsl */ `
uniform float uK;
uniform float uTime;
varying float vT;
varying float vS;
void main() {
  // かんばんから先へのびていく
  float reach = smoothstep(uK * 1.15, uK * 1.15 - 0.15, vT);
  float edge = 1.0 - abs(vS * 2.0 - 1.0);
  edge = pow(edge, 1.6);
  float flow = 0.55 + 0.45 * sin(vT * 30.0 - uTime * 7.0);
  float bits = smoothstep(0.82, 1.0, sin(vT * 90.0 - uTime * 16.0 + vS * 3.0));
  float fade = smoothstep(1.0, 0.7, vT);
  vec3 col = vec3(1.9, 1.45, 0.75) * (edge * flow * 0.8 + bits * edge * 1.2) * reach * fade;
  gl_FragColor = vec4(col, 1.0);
}
`

const poolFrag = /* glsl */ `
uniform float uK;
uniform float uTime;
uniform vec2 uAim;
uniform float uAimK;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p * vec2(1.0, 1.0));
  float pool = smoothstep(0.5, 0.15, r);
  // 格子の影（朝日が格子窓を通った光の縞）
  float lattice = 0.65 + 0.35 * step(0.5, fract((p.x + p.y * 0.35) * 18.0));
  float aim = smoothstep(0.16, 0.02, distance(vUv, uAim)) * uAimK;
  vec3 col = vec3(1.25, 0.95, 0.55) * (pool * lattice * 0.55 * (1.0 - 0.5 * uAimK) + aim * 1.6);
  gl_FragColor = vec4(col * uK, 1.0);
}
`
const poolVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

let edoTex: THREE.CanvasTexture | null = null
function edoTexture(): THREE.CanvasTexture {
  if (edoTex?.image) return edoTex
  edoTex = new THREE.CanvasTexture(paintEdoMorning(1024, 384, 3))
  edoTex.colorSpace = THREE.SRGBColorSpace
  edoTex.wrapS = THREE.RepeatWrapping
  edoTex.anisotropy = 4
  return edoTex
}

/** 帯の形：曲線にそった平たい帯（aT＝かんばんからの割合、aS＝帯の横の位置）。いつも上を向く面 */
function ribbonGeometry(curves: Array<{ curve: THREE.Curve<THREE.Vector3>; width: number }>): THREE.BufferGeometry {
  const pos: number[] = []
  const aT: number[] = []
  const aS: number[] = []
  const idx: number[] = []
  const side = new THREE.Vector3()
  const tan = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  for (const { curve, width } of curves) {
    const n = 40
    const base = pos.length / 3
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p = curve.getPointAt(t)
      curve.getTangentAt(t, tan)
      side.crossVectors(tan, up)
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
      side.normalize()
      // 根元は細く、先は広がる
      const w = width * (0.25 + 0.75 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5))
      pos.push(p.x - side.x * w, p.y - side.y * w, p.z - side.z * w, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w)
      aT.push(t, t)
      aS.push(0, 1)
      if (i < n) {
        const k = base + i * 2
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1))
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

export type MorningProjectionOptions = {
  /** かんばんの板の中心と正面 */
  plate: THREE.Vector3
  front: THREE.Vector3
  /** 映像の板（壁の前） */
  panels: readonly ProjectionPanel[]
  /** 光の帯の行き先（ワールド） */
  targets: readonly THREE.Vector3[]
  /** 地面の光だまり（中心と大きさ） */
  pool: { center: THREE.Vector3; w: number; d: number }
  /** 照らされる範囲（isLit の判定。x0..x1・z0..z1 の箱を何個か） */
  litBoxes: ReadonlyArray<{ x0: number; x1: number; z0: number; z1: number }>
}

export class MorningProjection {
  readonly group = new THREE.Group()
  private k = 0
  private target = 0
  private readonly panelU: { uMap: { value: THREE.Texture }; uK: { value: number }; uTime: { value: number }; uReach: { value: number }; uFrom: { value: THREE.Vector3 } }
  private readonly ribbonU: { uK: { value: number }; uTime: { value: number } }
  private readonly aimU: { uK: { value: number }; uTime: { value: number }; uAim: { value: THREE.Vector2 }; uAimK: { value: number } }
  private readonly panels: THREE.Mesh
  private readonly ribbons: THREE.Mesh
  private readonly pool: THREE.Mesh
  private readonly beam: THREE.Mesh
  private readonly dust: THREE.Points
  private readonly dustSeed: Float32Array
  private readonly opts: MorningProjectionOptions
  private aim: THREE.Vector3 | null = null
  private aimK = 0
  private readonly aimNow = new THREE.Vector3()

  constructor(opts: MorningProjectionOptions) {
    this.opts = opts
    this.group.name = 'morning_projection'
    const from = opts.plate.clone()
    // ---- 映像の板（1 つのジオメトリにまとめる）
    let reach = 0
    const pos: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    let u = 0
    for (const p of opts.panels) {
      const base = pos.length / 3
      const len = p.a.distanceTo(p.b)
      const u0 = p.u0 ?? u
      const u1 = p.u1 ?? u0 + len / 22
      u = u1
      pos.push(p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z, p.b.x, p.b.y + p.h, p.b.z, p.a.x, p.a.y + p.h, p.a.z)
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1)
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3)
      reach = Math.max(reach, Math.hypot(p.a.x - from.x, p.a.z - from.z), Math.hypot(p.b.x - from.x, p.b.z - from.z))
    }
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    pg.setIndex(idx)
    pg.computeBoundingSphere()
    this.panelU = { uMap: { value: edoTexture() }, uK: { value: 0 }, uTime: { value: 0 }, uReach: { value: reach + 3 }, uFrom: { value: from } }
    this.panels = new THREE.Mesh(
      pg,
      new THREE.ShaderMaterial({ uniforms: this.panelU, vertexShader: panelVert, fragmentShader: panelFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
    )
    this.panels.renderOrder = 6
    this.panels.frustumCulled = false
    this.group.add(this.panels)
    // ---- 光の帯（かんばん → 行き先。少し上へふくらむ）
    const start = opts.plate.clone().addScaledVector(opts.front, 0.12)
    const curves = opts.targets.map((t, i) => {
      const mid = start.clone().lerp(t, 0.5)
      mid.y = Math.max(start.y, t.y) + 1.4 + (i % 3) * 0.6
      const ctrl = start.clone().addScaledVector(opts.front, 1.2).setY(start.y + 0.8)
      return { curve: new THREE.CatmullRomCurve3([start, ctrl, mid, t]), width: 0.18 + (i % 2) * 0.12 }
    })
    this.ribbonU = { uK: { value: 0 }, uTime: { value: 0 } }
    this.ribbons = new THREE.Mesh(
      ribbonGeometry(curves),
      new THREE.ShaderMaterial({ uniforms: this.ribbonU, vertexShader: ribbonVert, fragmentShader: ribbonFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }),
    )
    this.ribbons.renderOrder = 7
    this.ribbons.frustumCulled = false
    this.group.add(this.ribbons)
    // ---- 地面の光だまり（格子の縞・ねらった所の明るい丸）
    this.aimU = { uK: { value: 0 }, uTime: { value: 0 }, uAim: { value: new THREE.Vector2(0.5, 0.5) }, uAimK: { value: 0 } }
    this.pool = new THREE.Mesh(
      new THREE.PlaneGeometry(opts.pool.w, opts.pool.d),
      new THREE.ShaderMaterial({ uniforms: this.aimU, vertexShader: poolVert, fragmentShader: poolFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    )
    this.pool.rotation.x = -Math.PI / 2
    this.pool.position.copy(opts.pool.center).setY(0.03)
    this.pool.renderOrder = 3
    this.group.add(this.pool)
    // ---- ねらいの光の筒（setAim のとき。かんばん → 暗がり）
    const beamGeo = new THREE.CylinderGeometry(0.9, 0.12, 1, 20, 1, true)
    beamGeo.translate(0, 0.5, 0)
    beamGeo.rotateX(Math.PI / 2)
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.7), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    this.beam.position.copy(start)
    this.beam.visible = false
    this.beam.renderOrder = 7
    this.group.add(this.beam)
    // ---- ちりの粒
    const n = 90
    const dp = new Float32Array(n * 3)
    this.dustSeed = new Float32Array(n * 3)
    for (let i = 0; i < n * 3; i++) this.dustSeed[i] = Math.random()
    const dg = new THREE.BufferGeometry()
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3))
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.3, 0.8), size: 0.05, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    this.dust.frustumCulled = false
    this.group.add(this.dust)
    this.group.visible = false
  }

  /** いまの強さ（0〜1） */
  get level(): number {
    return this.k
  }

  /** 映し出す・やめる（instant で一瞬） */
  set(on: boolean, instant = false): void {
    this.target = on ? 1 : 0
    if (instant) this.k = this.target
  }

  /** 光の向きを変える（大きな影のかくれた暗がりへ）。null で全体へ戻す */
  setAim(p: THREE.Vector3 | null): void {
    this.aim = p ? p.clone() : null
    if (p && this.aimK < 0.01) this.aimNow.copy(p)
  }

  /** その場所がどれだけ照らされているか（0〜1）。ねらっているときは、ねらった所だけ強く */
  isLit(p: THREE.Vector3): number {
    if (this.k < 0.05) return 0
    const inside = this.opts.litBoxes.some((b) => p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1)
    let lit = inside ? this.k : 0
    if (this.aimK > 0.05) {
      const d = Math.hypot(p.x - this.aimNow.x, p.z - this.aimNow.z)
      lit = Math.max(lit * (1 - this.aimK * 0.5), this.k * this.aimK * Math.max(0, 1 - d / 2.2))
    }
    return lit
  }

  update(dt: number, t: number): void {
    // 出るときはかんばんから光が走るように 1.6 秒、消えるときは 1 秒
    const d = this.target - this.k
    if (Math.abs(d) > 1e-4) this.k += Math.sign(d) * Math.min(Math.abs(d), dt * (d > 0 ? 0.62 : 1))
    const k = this.k
    this.group.visible = k > 0.002
    if (!this.group.visible) return
    this.panelU.uK.value = k
    this.panelU.uTime.value = t
    this.ribbonU.uK.value = Math.min(1, k * 1.4)
    this.ribbonU.uTime.value = t
    this.aimU.uK.value = k
    this.aimU.uTime.value = t
    // ねらい
    const want = this.aim ? 1 : 0
    this.aimK += (want - this.aimK) * Math.min(1, dt * 2.5)
    if (this.aim) this.aimNow.lerp(this.aim, Math.min(1, dt * 2))
    const P = this.opts.pool
    this.aimU.uAim.value.set((this.aimNow.x - (P.center.x - P.w / 2)) / P.w, 1 - (this.aimNow.z - (P.center.z - P.d / 2)) / P.d)
    this.aimU.uAimK.value = this.aimK
    const bm = this.beam.material as THREE.MeshBasicMaterial
    this.beam.visible = this.aimK > 0.02
    if (this.beam.visible) {
      const len = this.beam.position.distanceTo(this.aimNow)
      this.beam.lookAt(this.aimNow.x, 0.3, this.aimNow.z)
      this.beam.scale.set(1, 1, len)
      bm.opacity = 0.32 * this.aimK * k * (0.85 + 0.15 * Math.sin(t * 9))
    }
    // ちり：光だまりの上をゆっくり舞う
    const a = this.dust.geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < a.count; i++) {
      const sx = this.dustSeed[i * 3]
      const sy = this.dustSeed[i * 3 + 1]
      const sz = this.dustSeed[i * 3 + 2]
      a.setXYZ(i, P.center.x + (sx - 0.5) * P.w + Math.sin(t * 0.3 + sy * 9) * 0.3, 0.3 + ((sy * 3.2 + t * 0.08 * (0.5 + sz)) % 3.2), P.center.z + (sz - 0.5) * P.d + Math.cos(t * 0.25 + sx * 7) * 0.3)
    }
    a.needsUpdate = true
    ;(this.dust.material as THREE.PointsMaterial).opacity = k * 0.9
  }
}
