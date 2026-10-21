// オルムの心臓（物語 11・12 章）：裏側の暗やみで、どくどく脈うつ大きな黒い心臓。赤紫のひびが脈に合わせて光る。
// まわりから、光をすう黒いすじ（太い管）が 4〜6 本のびる。
// ・veins[i]：id・pos（裂く的の位置。毎フレーム更新）・point()・cut()・alive・reachTo(target, sec)（すじの先をのばす）
// ・setPulse(rate)：1 秒あたりの拍 / absorb(from, sec)：光の流れがすじに吸いこまれて心臓へ（チャンダの刃の光など）
// ・crack(k)：夜明けの光の金のひびが広がる（0..1）/ shatter()：夜明けの光でくずれて消える（Promise）
// 心臓は 1 メッシュ（輪郭線つき）、すじは全部で 1 メッシュ（毎フレーム頂点を書く）、流れる光は点 1 回、かけらは InstancedMesh。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { merge, withHull } from '../../world/nexmax/geom'
import { createToonMaterial, toonRamp, createCutMarker } from './toon'
import { Particles } from './particles'
import { BILLBOARD_GLSL, NOISE_GLSL, VIEW_H, clamp01, disposeRoot, easeOut, seeded, unitQuad } from './common'
import { VeinSet, heartBeat } from './logic'

export type HeartOpts = {
  /** 大きさ（既定 1：高さ約 4.6 m） */
  size?: number
  /** すじの数（4〜6、既定 5） */
  veins?: number
  /** すじの先の場所（ワールド）。足りない分は心臓のまわりに自動で置く */
  anchors?: THREE.Vector3[]
  seed?: number
}

export type HeartVein = {
  readonly id: string
  readonly index: number
  readonly alive: boolean
  /** 裂く的の位置（すじの先から 3 割ほど心臓側。毎フレーム更新される同じ Vector3） */
  readonly pos: THREE.Vector3
  point(out?: THREE.Vector3): THREE.Vector3
  /** 裂く：先はしおれてちりに、根もとは心臓へちぢむ */
  cut(): void
  /** すじの先を target へのばす（12 章：最後のすじがソラの扉のほうへ） */
  reachTo(target: THREE.Vector3, sec?: number): void
}

/** すじの裂く所（心臓 0 → 先 1） */
export const VEIN_CUT_U = 0.72
const VR = 30
const VRAD = 8

type VeinData = {
  id: string
  index: number
  start: THREE.Vector3
  end: THREE.Vector3
  endFrom: THREE.Vector3
  endTo: THREE.Vector3
  reachT: number
  reachSec: number
  bend: THREE.Vector3
  phase: number
  cutT: number
  absorb: number
  pts: THREE.Vector3[]
  pos: THREE.Vector3
}

// ------------------------------------------------------------------ 心臓の形

/** 心臓らしい形（上がふくらみ、下がとがる。上に太い管が 3 本） */
function heartGeometry(rnd: () => number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const color = (g: THREE.BufferGeometry, c: THREE.ColorRepresentation) => {
    const col = new THREE.Color(c)
    const n = g.attributes.position.count
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      a[i * 3] = col.r
      a[i * 3 + 1] = col.g
      a[i * 3 + 2] = col.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    return g
  }
  // 本体：球をのばして下をとがらせ、少しかたむける
  const body = new THREE.SphereGeometry(1, 40, 30)
  const p = body.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i)
    let y = p.getY(i)
    let z = p.getZ(i)
    if (y < 0) {
      const k = -y
      x *= 1 - k * 0.55
      z *= 1 - k * 0.45
      y *= 1.35
    } else {
      x *= 1.08
      z *= 0.95
    }
    // 左右のふくらみ（上の 2 つのこぶ）
    const lobe = Math.max(0, y) * 0.25 * Math.cos(Math.atan2(z, x) * 2)
    x *= 1 + lobe
    // ゆがみ（生きもののでこぼこ）
    const wob = 1 + (Math.sin(x * 5 + rnd() * 0.01) * Math.sin(y * 4) * Math.sin(z * 6)) * 0.025
    p.setXYZ(i, x * wob, y * wob, z * wob)
  }
  body.rotateZ(0.32)
  body.rotateX(0.12)
  body.computeVertexNormals()
  parts.push(color(body, '#382239'))
  // 心房（上のうしろの 2 つのふくらみ）
  for (const sx of [-1, 1]) {
    const a = new THREE.SphereGeometry(0.65, 20, 14)
    a.translate(sx * 0.55, 0.7, 0.25)
    parts.push(color(a, '#38283f'))
  }
  // 太い管（大動脈のアーチと 2 本の管）
  const arch = new THREE.TorusGeometry(0.42, 0.2, 10, 20, Math.PI)
  arch.rotateY(Math.PI / 2)
  arch.scale(1, 0.7, 1)
  arch.translate(0.05, 0.95, 0.05)
  parts.push(color(arch, '#241226'))
  for (const [x, z, h, r] of [
    [-0.35, -0.15, 0.56, 0.16],
    [0.42, 0.3, 0.49, 0.14],
  ] as const) {
    const c = new THREE.CylinderGeometry(r, r * 1.2, h, 12, 1, true)
    c.translate(x, 0.95 + h * 0.3, z)
    parts.push(color(c, '#241226'))
  }
  const withUv = parts.map((g) => {
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
    return withHull(g)
  })
  return merge(withUv)
}

/** 心臓の材質：トゥーン＋輪郭線（createToonMaterial）に、脈うつふくらみ・赤紫のひび・金のひび・吸う光を足す */
function heartMaterial(u: { beat: THREE.IUniform; crack: THREE.IUniform; absorb: THREE.IUniform; dissolve: THREE.IUniform }): THREE.MeshToonMaterial {
  const m = createToonMaterial({ line: '#2a0414', lineScale: 1.2, selfLight: 0.15, rim: '#c03a8a', rimK: 0.38 })
  const base = m.onBeforeCompile
  m.onBeforeCompile = (s, r) => {
    base.call(m, s, r)
    s.uniforms.uBeat = u.beat
    s.uniforms.uCrack = u.crack
    s.uniforms.uAbsorb = u.absorb
    s.uniforms.uDissolve = u.dissolve
    s.uniforms.uTime = uTime
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBeat;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vObj = position;\n  transformed += normal * uBeat * 0.07 * (0.6 + 0.4 * smoothstep(-1.2, 1.0, position.y));')
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform float uBeat;\nuniform float uCrack;\nuniform float uAbsorb;\nuniform float uDissolve;\nuniform float uTime;\nvarying vec3 vObj;\n${NOISE_GLSL}`,
      )
      .replace(
        'void main() {',
        `void main() {
  float cvD = cvNoise3(vObj * 3.0);
  if (uDissolve > 0.001 && cvD < uDissolve * 1.1 - 0.05) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  // 赤紫のひび（脈に合わせて光る）
  float r1 = abs(cvNoise3(vObj * 2.2 + 1.7) - 0.5);
  float r2 = abs(cvNoise3(vObj * 4.6 + 9.1) - 0.5);
  float crackR = smoothstep(0.04, 0.0, r1) + smoothstep(0.025, 0.0, r2) * 0.6;
  totalEmissiveRadiance += vec3(1.0, 0.12, 0.45) * crackR * (0.12 + uBeat * 0.45 + uAbsorb * 0.35);
  // 吸った光（金がまじる）
  totalEmissiveRadiance += vec3(1.2, 0.8, 0.3) * crackR * uAbsorb * 0.2;
  // 夜明けの金のひび（広がる）
  float r3 = abs(cvNoise3(vObj * 1.6 + 4.3) - 0.5);
  float gold = smoothstep(0.02 + uCrack * 0.09, 0.0, r3) * step(0.001, uCrack);
  totalEmissiveRadiance += vec3(1.8, 1.25, 0.5) * gold * (1.2 + uCrack * 2.0);
  // ちりになるふち
  float cvE = uDissolve > 0.001 ? smoothstep(uDissolve * 1.1 + 0.08, uDissolve * 1.1 - 0.05, cvD) : 0.0;
  totalEmissiveRadiance += vec3(1.6, 1.1, 0.5) * cvE * 3.0;`,
      )
  }
  m.customProgramCacheKey = () => 'cvHeart'
  return m
}

/** すじの材質：黒い管に、心臓へ流れる光の帯（ふだんは暗い紫、吸うときは金） */
function veinMaterial(): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: '#120a16', gradientMap: toonRamp() })
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = uTime
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aV;\nvarying vec4 vV;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vV = aV;\n  vObj = position;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec4 vV;\nvarying vec3 vObj;\n${NOISE_GLSL}`)
      .replace(
        'void main() {',
        `void main() {
  float cvD = cvNoise3(vObj * 3.0);
  if (vV.z > 0.001 && cvD < vV.z * 1.1 - 0.05) discard;`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  float cvRim = 1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0);
  totalEmissiveRadiance += vec3(0.6, 0.15, 0.7) * pow(cvRim, 2.5) * 0.45;
  // 心臓へ向かって流れる帯（u が小さい方へ）
  float u = vV.x;
  float ph = fract(u * 3.0 + uTime * (0.35 + vV.y * 1.8));
  float band = smoothstep(0.82, 0.95, ph) * smoothstep(1.0, 0.95, ph);
  vec3 idleC = vec3(0.6, 0.12, 0.55);
  vec3 drinkC = vec3(1.6, 1.15, 0.45) * 1.25;
  float filament = smoothstep(0.6, 0.95, cos(vV.w * 6.283185));
  totalEmissiveRadiance += mix(idleC, drinkC, vV.y) * band * (0.16 + vV.y * 0.5) * mix(1.0, filament, vV.y);
  float cvE = vV.z > 0.001 ? smoothstep(vV.z * 1.1 + 0.08, vV.z * 1.1 - 0.05, cvD) : 0.0;
  totalEmissiveRadiance += vec3(0.85, 0.45, 1.0) * cvE * 3.0;`,
      )
  }
  m.customProgramCacheKey = () => 'cvVein'
  return m
}

const flashVert = /* glsl */ `
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * cvBillboard(position, 0.0);
}
`
const flashFrag = /* glsl */ `
uniform float uA;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float core = exp(-r * r * 8.0);
  float rays = pow(max(0.0, cos(a * 9.0 + uTime * 0.3)), 30.0) * smoothstep(1.0, 0.1, r);
  float ring = exp(-pow((r - 0.75) / 0.05, 2.0)) * 0.6;
  float k = (core * 1.6 + rays + ring) * uA * smoothstep(1.0, 0.9, r);
  gl_FragColor = vec4(vec3(1.0, 0.82, 0.48) * 1.8 * k, 1.0);
}
`

/** 流れる光の点（決まった道すじを進む） */
const streamVert = /* glsl */ `
attribute float aA;
uniform float uViewH;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = 0.16 * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z);
  vA = aA;
}
`
const streamFrag = /* glsl */ `
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, r) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(1.6, 1.25, 0.6) * a, a);
}
`

const UP = new THREE.Vector3(0, 1, 0)
const STREAM_MAX = 160

export class OrmHeart {
  readonly root = new THREE.Group()
  readonly veins: HeartVein[] = []
  /** 心臓のまん中（ワールド。root を動かしたら update で更新） */
  readonly center = new THREE.Vector3()
  /** すじが裂かれたとき */
  onVeinCut: ((v: HeartVein) => void) | null = null
  private readonly size: number
  private readonly heart: THREE.Mesh
  private readonly hu = { beat: { value: 0 }, crack: { value: 0 }, absorb: { value: 0 }, dissolve: { value: 0 } }
  private readonly veinMesh: THREE.Mesh
  private readonly vPos: THREE.BufferAttribute
  private readonly vNor: THREE.BufferAttribute
  private readonly vAttr: THREE.BufferAttribute
  private readonly data: VeinData[] = []
  private readonly state: VeinSet
  private rate = 1.1
  private beatT = 0
  private crackK = 0
  private absorbK = 0
  private shatterT = -1
  private onShatterDone: (() => void) | null = null
  private readonly sparks: Particles
  private readonly dust: Particles
  private readonly flash: THREE.Mesh
  private readonly flashMat: THREE.ShaderMaterial
  private readonly shards: THREE.InstancedMesh
  private readonly shardVel: { p: THREE.Vector3; v: THREE.Vector3; ax: THREE.Vector3; s: number }[] = []
  private readonly stream: THREE.Points
  private readonly sPos: THREE.BufferAttribute
  private readonly sA: THREE.BufferAttribute
  private readonly streamP: { s: number; speed: number; vein: number; from: THREE.Vector3; enterU: number; off: THREE.Vector3; on: boolean }[] = []
  private streamEmit: { from: THREE.Vector3; until: number; vein: number } | null = null
  private time = 0
  private readonly cutMarks: THREE.Mesh[] = []
  private readonly sourceLight: THREE.Mesh
  private readonly sourceMat: THREE.MeshBasicMaterial
  private readonly arrival: THREE.Mesh
  private readonly arrivalMat: THREE.MeshBasicMaterial
  private sourceT = -1
  private arrivalK = 0
  private readonly mats: THREE.Material[] = []
  private readonly geos: THREE.BufferGeometry[] = []

  constructor(parent: THREE.Object3D, pos: THREE.Vector3, o: HeartOpts = {}) {
    const rnd = seeded(o.seed ?? 5)
    this.size = o.size ?? 1
    this.root.name = 'ormHeart'
    this.root.position.copy(pos)
    parent.add(this.root)
    this.center.copy(pos)
    // 心臓
    const hg = heartGeometry(rnd)
    const hm = heartMaterial(this.hu)
    this.heart = new THREE.Mesh(hg, hm)
    this.heart.scale.setScalar(2.1 * this.size)
    this.heart.castShadow = true
    this.heart.name = 'heart'
    this.root.add(this.heart)
    this.geos.push(hg)
    this.mats.push(hm)
    // すじ
    const n = Math.max(1, Math.min(8, o.veins ?? 5))
    this.state = new VeinSet(n)
    const anchors = (o.anchors ?? []).slice(0, n)
    for (let i = anchors.length; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.4
      anchors.push(pos.clone().add(new THREE.Vector3(Math.cos(a) * 13, -3 + (i % 3) * 3.5, Math.sin(a) * 9 + 4).multiplyScalar(this.size)))
    }
    const nV = n * VR * VRAD
    const g = new THREE.BufferGeometry()
    this.vPos = new THREE.BufferAttribute(new Float32Array(nV * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.vNor = new THREE.BufferAttribute(new Float32Array(nV * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.vAttr = new THREE.BufferAttribute(new Float32Array(nV * 4), 4).setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('position', this.vPos)
    g.setAttribute('normal', this.vNor)
    g.setAttribute('aV', this.vAttr)
    const ix: number[] = []
    for (let v = 0; v < n; v++) {
      const o0 = v * VR * VRAD
      for (let r = 0; r < VR - 1; r++)
        for (let k = 0; k < VRAD; k++) {
          const a = o0 + r * VRAD + k
          const b = o0 + r * VRAD + ((k + 1) % VRAD)
          const c = o0 + (r + 1) * VRAD + k
          const d = o0 + (r + 1) * VRAD + ((k + 1) % VRAD)
          ix.push(a, b, c, b, d, c)
        }
    }
    g.setIndex(ix)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5)
    const vm = veinMaterial()
    this.veinMesh = new THREE.Mesh(g, vm)
    this.veinMesh.frustumCulled = false
    this.veinMesh.castShadow = true
    this.veinMesh.name = 'heartVeins'
    // すじはワールドの座標で書く（心臓の root の外、親へ直接）
    parent.add(this.veinMesh)
    this.geos.push(g)
    this.mats.push(vm)
    for (let i = 0; i < n; i++) {
      const end = anchors[i].clone()
      const dir = end.clone().sub(pos).normalize()
      const start = pos.clone().addScaledVector(dir, 1.6 * this.size)
      const vd: VeinData = {
        id: `vein${i}`,
        index: i,
        start,
        end,
        endFrom: end.clone(),
        endTo: end.clone(),
        reachT: -1,
        reachSec: 1,
        bend: new THREE.Vector3(rnd() - 0.5, rnd() * 0.6 + 0.2, rnd() - 0.5).normalize(),
        phase: rnd() * 10,
        cutT: -1,
        absorb: 0,
        pts: Array.from({ length: VR }, () => new THREE.Vector3()),
        pos: new THREE.Vector3(),
      }
      this.data.push(vd)
      const self = this
      this.veins.push({
        id: vd.id,
        index: i,
        get alive() {
          return self.state.alive(i)
        },
        pos: vd.pos,
        point: (out = new THREE.Vector3()) => out.copy(vd.pos),
        cut: () => self.cutVein(i),
        reachTo: (target: THREE.Vector3, sec = 1.5) => {
          vd.endFrom.copy(vd.end)
          vd.endTo.copy(target)
          vd.reachT = 0
          vd.reachSec = Math.max(0.05, sec)
        },
      })
    }
    for (let i = 0; i < n; i++) {
      const mark = createCutMarker((0.46 - 0.3 * VEIN_CUT_U + 0.06) * this.size, 0.12 * this.size)
      this.cutMarks.push(mark)
      parent.add(mark)
    }
    // 吸収の出発点は0.2秒で消灯、到着点だけを点灯させる。
    this.sourceMat = new THREE.MeshBasicMaterial({ color: '#ffe6a2', transparent: true, depthWrite: false, toneMapped: false })
    this.sourceLight = new THREE.Mesh(new THREE.SphereGeometry(0.13 * this.size, 12, 8), this.sourceMat)
    this.sourceLight.name = 'absorbSource'
    this.sourceLight.visible = false
    parent.add(this.sourceLight)
    this.arrivalMat = this.sourceMat.clone()
    this.arrival = new THREE.Mesh(this.sourceLight.geometry, this.arrivalMat)
    this.arrival.name = 'absorbArrival'
    this.arrival.visible = false
    parent.add(this.arrival)
    this.geos.push(this.sourceLight.geometry)
    this.mats.push(this.sourceMat, this.arrivalMat)
    // 粒・光・かけら・流れる光
    this.sparks = new Particles({ max: 500, shape: 'soft', additive: true, renderOrder: 5 })
    this.dust = new Particles({ max: 300, shape: 'smoke', additive: false, renderOrder: 4 })
    parent.add(this.sparks.points, this.dust.points)
    this.flashMat = new THREE.ShaderMaterial({ vertexShader: flashVert, fragmentShader: flashFrag, uniforms: { uA: { value: 0 }, uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    this.flash = new THREE.Mesh(unitQuad(), this.flashMat)
    this.flash.visible = false
    this.flash.frustumCulled = false
    this.flash.renderOrder = 6
    this.root.add(this.flash)
    this.mats.push(this.flashMat)
    const sg = new THREE.TetrahedronGeometry(0.35 * this.size, 0)
    const sm = createToonMaterial({ line: '#2a0414', selfLight: 0.3, rim: '#ffcf7a', rimK: 2.0 })
    this.shards = new THREE.InstancedMesh(sg, sm, 60)
    this.shards.visible = false
    this.shards.frustumCulled = false
    const col = new Float32Array(sg.attributes.position.count * 3).fill(0.12)
    sg.setAttribute('color', new THREE.BufferAttribute(col, 3))
    parent.add(this.shards)
    this.geos.push(sg)
    this.mats.push(sm)
    const sp = new Float32Array(STREAM_MAX * 3)
    const sa = new Float32Array(STREAM_MAX)
    const stg = new THREE.BufferGeometry()
    this.sPos = new THREE.BufferAttribute(sp, 3).setUsage(THREE.DynamicDrawUsage)
    this.sA = new THREE.BufferAttribute(sa, 1).setUsage(THREE.DynamicDrawUsage)
    stg.setAttribute('position', this.sPos)
    stg.setAttribute('aA', this.sA)
    const stm = new THREE.ShaderMaterial({ vertexShader: streamVert, fragmentShader: streamFrag, uniforms: { uViewH: VIEW_H }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })
    this.stream = new THREE.Points(stg, stm)
    this.stream.frustumCulled = false
    this.stream.renderOrder = 5
    parent.add(this.stream)
    this.geos.push(stg)
    this.mats.push(stm)
    for (let i = 0; i < STREAM_MAX; i++) this.streamP.push({ s: 0, speed: 1, vein: 0, from: new THREE.Vector3(), enterU: 1, off: new THREE.Vector3(), on: false })
    this.update(0, 0)
  }

  /** 1 秒あたりの拍（既定 1.1） */
  setPulse(rate: number): void {
    this.rate = Math.max(0, rate)
  }

  /** 生きているすじの数 */
  get aliveCount(): number {
    return this.state.aliveCount
  }

  get allCut(): boolean {
    return this.state.allCut
  }

  /** from（ワールド）の光が、いちばん近いすじに吸いこまれて心臓へ流れる（sec 秒のあいだ） */
  absorb(from: THREE.Vector3, sec = 2, vein?: number): void {
    let best = vein ?? -1
    if (best < 0) {
      let bd = Infinity
      this.data.forEach((d, i) => {
        if (!this.state.alive(i)) return
        for (let k = 0; k < VR; k += 3) {
          const dd = d.pts[k].distanceToSquared(from)
          if (dd < bd) {
            bd = dd
            best = i
          }
        }
      })
    }
    if (best < 0 || best >= this.data.length || !this.state.alive(best) || this.shattered) return
    // 新しい光源へ切り替えるときも、強く光る管は1本だけ。
    this.streamP.forEach(p => { p.on = false })
    this.streamEmit = { from: from.clone(), until: this.time + Math.max(0, sec), vein: best }
    this.sourceLight.position.copy(from)
    this.sourceT = 0
  }

  /** 夜明けの金のひび（0..1） */
  crack(k: number): void {
    const was = this.crackK
    this.crackK = clamp01(k)
    if (this.crackK > was + 0.05) this.sparks.burst(20, this.center, 3 * this.size, { life: 1.2, size: 0.12, color: new THREE.Color('#ffd27a').multiplyScalar(2), drag: 1.5, gravity: -0.5 }, 1, 1.5 * this.size)
  }

  get shattered(): boolean {
    return this.shatterT >= 0
  }

  /** 夜明けの光でくずれて消える（約 3 秒。終わったら resolve） */
  shatter(): Promise<void> {
    if (this.shatterT >= 0) return Promise.resolve()
    this.shatterT = 0
    this.crackK = 1
    return new Promise((res) => {
      this.onShatterDone = res
    })
  }

  update(dt: number, t: number): void {
    this.time = t
    if (this.sourceT >= 0) this.sourceT += dt
    this.sourceLight.visible = this.sourceT >= 0 && this.sourceT < 0.2 && !this.shattered
    this.sourceMat.opacity = Math.max(0, 1 - this.sourceT / 0.2)
    this.arrivalK = Math.max(0, this.arrivalK - dt * 4)
    this.arrivalMat.opacity = this.arrivalK
    this.arrival.visible = this.arrivalK > 0.01 && !this.shattered
    this.root.updateMatrixWorld()
    this.center.setFromMatrixPosition(this.root.matrixWorld)
    // 脈（すじが減るほど、あせって速く）
    this.beatT += dt
    let beat = heartBeat(this.beatT, this.rate)
    // 吸う光
    if (this.streamEmit && t > this.streamEmit.until) this.streamEmit = null
    this.absorbK += ((this.streamEmit ? 1 : 0) - this.absorbK) * (1 - Math.exp(-dt * 3))
    // くずれる
    let dissolve = 0
    if (this.shatterT >= 0) {
      this.shatterT += dt
      const st = this.shatterT
      beat = st < 1.2 ? heartBeat(this.beatT, 3.5) * (1 + st) : 0
      if (st >= 1.2 && !this.shards.visible) this.explode()
      dissolve = clamp01((st - 1.2) / 0.6)
      this.flash.visible = st >= 1.1 && st < 3.4
      const fk = clamp01((st - 1.1) * 4) * (1 - clamp01((st - 1.6) / 1.8))
      this.flashMat.uniforms.uA.value = fk
      const fs = (3 + 9 * easeOut(clamp01((st - 1.1) / 1.2))) * this.size
      this.flash.scale.set(fs, fs, 1)
      if (st > 1.2 && st < 2.6 && dt > 0) {
        const n = Math.round(dt * 80)
        for (let i = 0; i < n; i++) {
          const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.5, Math.random() - 0.5).normalize()
          this.sparks.emit(this.center.clone().addScaledVector(v, Math.random() * 3 * this.size), v.multiplyScalar(1 + Math.random() * 2).add(UP), { life: 1.6, size: 0.12 + Math.random() * 0.1, color: new THREE.Color('#ffd27a').multiplyScalar(1.8), drag: 0.8, gravity: -0.3 })
        }
      }
      if (st >= 3.4) {
        this.heart.visible = false
        this.veinMesh.visible = false
        this.flash.visible = false
        const done = this.onShatterDone
        this.onShatterDone = null
        done?.()
      }
    }
    this.hu.beat.value = beat
    this.hu.crack.value = this.crackK
    this.hu.absorb.value = this.absorbK
    this.hu.dissolve.value = dissolve
    this.heart.visible = this.heart.visible && dissolve < 1
    // 金のひびから光がもれる
    if (this.crackK > 0.25 && this.shatterT < 0 && dt > 0 && Math.random() < dt * 12 * this.crackK) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize()
      this.sparks.emit(this.center.clone().addScaledVector(v, 1.9 * this.size), v.multiplyScalar(0.8), { life: 1.2, size: 0.1, color: new THREE.Color('#ffd27a').multiplyScalar(1.8), drag: 0.6, gravity: -0.4 })
    }
    this.writeVeins(dt, t, beat, dissolve)
    this.updateStream(dt)
    this.updateShards(dt)
    this.sparks.update(dt)
    this.dust.update(dt)
  }

  dispose(): void {
    this.sparks.dispose()
    this.dust.dispose()
    this.sourceLight.removeFromParent()
    this.arrival.removeFromParent()
    for (const mark of this.cutMarks) {
      mark.removeFromParent()
      mark.geometry.dispose()
      ;(mark.material as THREE.Material).dispose()
    }
    this.veinMesh.removeFromParent()
    this.shards.removeFromParent()
    this.stream.removeFromParent()
    disposeRoot(this.root)
    for (const g of this.geos) g.dispose()
    for (const m of this.mats) m.dispose()
  }

  // ---------------------------------------------------------------- 中身

  private cutVein(i: number): void {
    if (!this.state.cut(i, this.time)) return
    const d = this.data[i]
    d.cutT = 0
    this.cutMarks[i].visible = false
    if (this.streamEmit?.vein === i) this.streamEmit = null
    const at = d.pos.clone()
    this.sparks.burst(36, at, 5, { life: 0.6, size: 0.14, color: new THREE.Color('#e8f4ff').multiplyScalar(2.2), drag: 3.5 }, 0, 0.3)
    this.sparks.burst(24, at, 2, { life: 1.2, size: 0.12, color: new THREE.Color('#b070ff').multiplyScalar(1.8), drag: 1.5, gravity: -0.3 })
    this.dust.burst(20, at, 1.5, { life: 1.4, size: 0.4, grow: 2, color: '#1a1022', alpha: 0.6, drag: 1.2 })
    // 心臓がいたがる（どくん）
    this.beatT = 0
    this.onVeinCut?.(this.veins[i])
  }

  /** すじの中心線を計算して、管の頂点を書く */
  private writeVeins(dt: number, t: number, beat: number, dissolve: number): void {
    const pos = this.vPos.array as Float32Array
    const nor = this.vNor.array as Float32Array
    const att = this.vAttr.array as Float32Array
    const T = new THREE.Vector3()
    const N = new THREE.Vector3()
    const B = new THREE.Vector3()
    const q = new THREE.Quaternion()
    const a = new THREE.Vector3()
    const c1 = new THREE.Vector3()
    const c2 = new THREE.Vector3()
    for (const d of this.data) {
      // 先をのばす
      if (d.reachT >= 0) {
        d.reachT += dt
        const k = easeOut(d.reachT / d.reachSec)
        d.end.lerpVectors(d.endFrom, d.endTo, k)
        if (k >= 1) d.reachT = -1
      }
      const alive = this.state.alive(d.index)
      if (!alive) d.cutT += dt
      // 根もとは心臓の表面（脈でふくらむ）
      const dir = a.subVectors(d.end, this.center).normalize()
      d.start.copy(this.center).addScaledVector(dir, (1.5 + beat * 0.1) * this.size)
      const L = d.start.distanceTo(d.end)
      c1.copy(d.start).addScaledVector(dir, L * 0.3).addScaledVector(d.bend, L * 0.18)
      c2.copy(d.end).addScaledVector(dir, -L * 0.3).addScaledVector(d.bend, L * 0.12)
      // 裂かれたあと：根もと側は心臓へちぢむ
      const retract = alive ? 0 : Math.min(0.85, d.cutT * 0.9)
      const absorb = this.streamEmit && this.streamEmit.vein === d.index ? this.absorbK : 0
      d.absorb = absorb
      for (let r = 0; r < VR; r++) {
        let u = r / (VR - 1)
        if (!alive && u <= VEIN_CUT_U) u = u * (1 - retract)
        const v = 1 - u
        const p = d.pts[r]
        p.copy(d.start)
          .multiplyScalar(v * v * v)
          .addScaledVector(c1, 3 * v * v * u)
          .addScaledVector(c2, 3 * v * u * u)
          .addScaledVector(d.end, u * u * u)
        const sw = Math.sin(u * Math.PI) * 0.35 * this.size
        p.x += Math.sin(t * 0.8 + d.phase + u * 3) * sw
        p.y += Math.cos(t * 0.6 + d.phase * 1.3 + u * 2) * sw * 0.6
        // 先は裂かれたら下へしおれる
        if (!alive && r / (VR - 1) > VEIN_CUT_U) p.y -= d.cutT * d.cutT * 2.5 * ((r / (VR - 1) - VEIN_CUT_U) / (1 - VEIN_CUT_U))
      }
      // 裂く的：先から 3 割ほど心臓側
      const ci = Math.round(VEIN_CUT_U * (VR - 1))
      if (alive) d.pos.copy(d.pts[ci])
      const mark = this.cutMarks[d.index]
      mark.visible = alive && dissolve < 0.01
      mark.position.copy(d.pos)
      mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), a.subVectors(d.pts[Math.min(VR - 1, ci + 1)], d.pts[Math.max(0, ci - 1)]).normalize())
      // 管
      T.subVectors(d.pts[1], d.pts[0]).normalize()
      N.set(0, 1, 0)
      if (Math.abs(T.dot(N)) > 0.9) N.set(1, 0, 0)
      N.addScaledVector(T, -N.dot(T)).normalize()
      const o0 = d.index * VR * VRAD
      for (let r = 0; r < VR; r++) {
        const pa = d.pts[Math.max(0, r - 1)]
        const pb = d.pts[Math.min(VR - 1, r + 1)]
        const nt = a.subVectors(pb, pa)
        if (nt.lengthSq() > 1e-10) {
          nt.normalize()
          q.setFromUnitVectors(T, nt)
          N.applyQuaternion(q)
          T.copy(nt)
        }
        B.crossVectors(T, N)
        const u = r / (VR - 1)
        // 根もと太く先へ細く、こぶ（吸った光のふくらみが心臓へ流れる）
        let rad = (0.46 - 0.3 * u) * this.size
        const lump = Math.max(0, Math.sin(u * 14 + t * 3.5 * (0.5 + absorb * 2)))
        rad *= 1 + lump * lump * (0.1 + absorb * 0.25)
        let fade = dissolve
        if (!alive) {
          if (u > VEIN_CUT_U) {
            rad *= Math.max(0, 1 - d.cutT * 0.8)
            fade = Math.max(fade, clamp01(d.cutT / 1.2))
          } else {
            fade = Math.max(fade, clamp01((d.cutT - 0.6) / 1.2) * 0.6)
            // 切り口は閉じる
            if (u > VEIN_CUT_U - 1 / (VR - 1)) rad *= 0.3
          }
        }
        const pc = d.pts[r]
        for (let k = 0; k < VRAD; k++) {
          const ang = (k / VRAD) * Math.PI * 2
          const cs = Math.cos(ang)
          const sn = Math.sin(ang)
          const nx = N.x * cs + B.x * sn
          const ny = N.y * cs + B.y * sn
          const nz = N.z * cs + B.z * sn
          const vi = o0 + r * VRAD + k
          pos[vi * 3] = pc.x + nx * rad
          pos[vi * 3 + 1] = pc.y + ny * rad
          pos[vi * 3 + 2] = pc.z + nz * rad
          nor[vi * 3] = nx
          nor[vi * 3 + 1] = ny
          nor[vi * 3 + 2] = nz
          att[vi * 4] = u
          att[vi * 4 + 1] = absorb
          att[vi * 4 + 2] = fade
          att[vi * 4 + 3] = k / VRAD
        }
      }
    }
    this.vPos.needsUpdate = true
    this.vNor.needsUpdate = true
    this.vAttr.needsUpdate = true
  }

  /** 流れる光：from → すじの入り口 → すじにそって心臓へ */
  private updateStream(dt: number): void {
    const e = this.streamEmit
    if (e && dt > 0) {
      const n = Math.max(1, Math.round(dt * 45))
      let made = 0
      for (const p of this.streamP) {
        if (made >= n) break
        if (p.on) continue
        p.on = true
        p.s = 0
        p.speed = 0.55 + Math.random() * 0.3
        p.vein = e.vein
        p.from.copy(e.from).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.1))
        // すじのいちばん近い所から入る
        const d = this.data[e.vein]
        let bu = 1
        let bd = Infinity
        for (let r = 0; r < VR; r++) {
          const dd = d.pts[r].distanceToSquared(e.from)
          if (dd < bd) {
            bd = dd
            bu = r / (VR - 1)
          }
        }
        p.enterU = bu
        p.off.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.06)
        made++
      }
    }
    const pos = this.sPos.array as Float32Array
    const al = this.sA.array as Float32Array
    const tmp = new THREE.Vector3()
    this.streamP.forEach((p, i) => {
      if (!p.on) {
        al[i] = 0
        return
      }
      p.s += dt * p.speed
      if (p.s >= 1 && this.state.alive(p.vein)) {
        this.arrivalK = 1
        this.arrival.position.copy(this.data[p.vein].start)
      }
      if (p.s >= 1 || !this.state.alive(p.vein)) {
        p.on = false
        al[i] = 0
        return
      }
      const d = this.data[p.vein]
      const veinAt = (u: number, out: THREE.Vector3) => {
        const f = u * (VR - 1)
        const i0 = Math.floor(f)
        const i1 = Math.min(VR - 1, i0 + 1)
        return out.lerpVectors(d.pts[i0], d.pts[i1], f - i0)
      }
      const split = 0.35
      if (p.s < split) {
        const k = p.s / split
        veinAt(p.enterU, tmp)
        tmp.lerpVectors(p.from, tmp, k * k * (3 - 2 * k))
        tmp.y += Math.sin(k * Math.PI) * 0.6
      } else {
        const k = (p.s - split) / (1 - split)
        veinAt(p.enterU * (1 - k), tmp)
      }
      tmp.add(p.off)
      pos[i * 3] = tmp.x
      pos[i * 3 + 1] = tmp.y
      pos[i * 3 + 2] = tmp.z
      al[i] = Math.min(1, p.s * 8) * (1 - Math.max(0, (p.s - 0.9) * 10))
    })
    this.sPos.needsUpdate = true
    this.sA.needsUpdate = true
  }

  /** 心臓がくずれる：かけらが飛んで、ちりになる */
  private explode(): void {
    this.shards.visible = true
    this.shardVel.length = 0
    for (let i = 0; i < this.shards.count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      this.shardVel.push({
        p: this.center.clone().addScaledVector(v, Math.random() * 1.6 * this.size),
        v: v.multiplyScalar((3 + Math.random() * 5) * this.size),
        ax: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        s: 0.6 + Math.random() * 0.9,
      })
    }
    this.dust.burst(40, this.center, 4 * this.size, { life: 1.6, size: 0.8, grow: 2, color: '#1a0d1c', alpha: 0.7, drag: 1.5 }, 0, 1.5 * this.size)
    for (const v of this.veins) if (v.alive) this.state.cut(v.index, this.time)
    for (const d of this.data) if (d.cutT < 0) d.cutT = 0
  }

  private updateShards(dt: number): void {
    if (!this.shards.visible) return
    const st = this.shatterT - 1.2
    const k = Math.max(0, 1 - st / 2.0)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const sc = new THREE.Vector3()
    this.shardVel.forEach((s, i) => {
      s.v.multiplyScalar(Math.exp(-dt * 1.2))
      s.p.addScaledVector(s.v, dt)
      q.setFromAxisAngle(s.ax, st * 4 * s.s)
      sc.setScalar(s.s * k)
      m.compose(s.p, q, sc)
      this.shards.setMatrixAt(i, m)
    })
    this.shards.instanceMatrix.needsUpdate = true
    if (k <= 0) this.shards.visible = false
  }
}
