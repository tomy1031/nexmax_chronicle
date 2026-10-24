// 時の鐘人形（7 章のボス）。町の広場の大きなからくり時計：和時計の文字盤の台座の上に、赤い着物の大きな人形。
// 右手に木槌、左手に鐘を持ち、刻（とき）になると鐘を打つ。トワのランプの影がのりうつると、黒いもやと光る目になり、
// 見上げるほど大きくなって台座から降り、工房（かけら）へ向かって歩く。
//
// 弱点の歯車は 3 つ（おはるの声の順）：0＝右の肩・1＝左のひざ・2＝胸。それぞれ hold_mechanism の ClawTargetDef（targets）。
// 戦い方は「よける → すきができる → つかむ」のくり返し（どの攻撃も地面の赤い予告が先に出る）：
//   swing(side, at, stuck)  腕のふりおろし（予告の円 → たたきつけ）。stuck 秒、木槌が地面にささって動けない＝右の肩の歯車が見える
//   stomp()                 足ぶみの地ひびき（人形のまわりの赤い輪 → ドン）。そのあと左ひざがロックして、ひざをつく＝ひざの歯車
//   charge()                大技：鐘をかかげて力をためる（胸の戸がひらく）→ 輪の衝撃波が 2 つ → つかれて止まる＝胸の歯車
//   bellWave()              鐘の衝撃波（地面を広がる輪。ジャンプでよける）
// opening：いま見えている（つかめる）歯車。止めると（setGearStopped）、
//   右の肩 → 右うでがだらりと下がる（木槌はもう使えない）／左のひざ → 左ひざをついて動けなくなる（胸が低くなる）／
//   胸 → 全部が止まる（collapse で影がはがれる）
// 当たったかどうかはステージが onImpact・waveHit で決める（ここは見た目と時間だけ）。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../../render/batch'
import type { MaterialLibrary } from '../../../render/materials'
import { drawLettering, drawWaveCrest, makeCanvas, tex } from '../../../render/textures'
import type { ClawTargetDef } from '../../../player/clawLogic'
import type { ColliderList } from '../../../world/colliders'
import { WOOD, woodBox, woodTint, gableRoof, type Ctx, type LightSpot } from '../../../world/edo/kit'
import { gearGeometry } from './parts'
import { addOutlines, OUTLINE_PX } from './outline'
import { softGlowTexture } from './workshop'

export const GEAR_NAMES = ['右の肩', '左のひざ', '胸'] as const
export type GearIndex = 0 | 1 | 2
export type DollSide = 'left' | 'right'
/** 攻撃が地面をたたいた。pos：たたいた所（ふりおろしは木槌・鐘の頭の真下、鐘の音は人形の足もと） */
export type DollImpact = { kind: 'swing' | 'bell' | 'stomp'; side?: DollSide; pos: THREE.Vector3; radius: number }

type DollState =
  | 'idle'
  | 'chime'
  | 'possessing'
  | 'stepdown'
  | 'stand'
  | 'walk'
  | 'windup'
  | 'slam'
  | 'stuck'
  | 'recover'
  | 'bellUp'
  | 'bellHit'
  | 'stompUp'
  | 'stompHit'
  | 'kneeLock'
  | 'chargeUp'
  | 'tired'
  | 'collapse'
  | 'down'

/** 大きさ：ふだん（台座の上）とのりうつられたとき */
const NORMAL_SCALE = 0.86
/** 顔の前の補助灯の強さ（のりうつっているとき） */
const FACE_LIGHT = 4
/** カメラの側からの明かりの強さ（体の色に足す割合） */
const CAMERA_FILL = 0.22
/** 弱点の歯車の真ちゅうの色 */
const GEAR_BRASS = new THREE.Color('#c28f42')
const POSSESSED_SCALE = 1.1
/** 台座の高さ・寸法 */
export const PEDESTAL = { w: 5.4, h: 2.0, d: 4.2 }
/** 時間（秒） */
// ふりおろし：予告の円（windup）からたたきつけ（slam）まで、怒りがいちばん上（1.25 倍）でも 1.2 秒より長く。
// 足ぶみ：赤い輪（stompUp）からドンまで 1.6 秒（怒り 1.25 倍で 1.28 秒）。大技：ため（chargeUp）2.6 秒、2 つ目の輪は 0.95 秒あと。
// すき（stuck・kneeLock・tired）は怒りで短くしない（子どもがねらう時間）
const T = {
  windup: 1.4,
  slam: 0.22,
  recover: 1.3,
  // 鐘をかかげてから輪が出るまで（怒り 1.25 倍でも 1.1 秒。輪が足もとまで来る時間を足して 1.2 秒より長く）
  bellUp: 1.2,
  bellHit: 0.25,
  stompUp: 1.6,
  stompHit: 0.2,
  kneeLock: 4.6,
  chargeUp: 2.6,
  wave2: 0.95,
  tired: 4.8,
  possess: 2.6,
  stepdown: 1.4,
  collapse: 3.2,
}
/** 足ぶみの地ひびきがとどく半径（人形の足もとから。予告の赤い輪と同じ） */
export const STOMP_RADIUS = 5.2
/** 胸の戸がひらききる角度（rad） */
const DOOR_OPEN = 1.7
/** 衝撃波：広がる速さ（m/s）・最大の半径・輪の高さ */
// 輪がゆっくり広がるほど、ジャンプのタイミングを合わせやすい
export const BELL_WAVE = { speed: 6.0, maxR: 19, height: 0.7, width: 0.9 }
/** ふりおろしの予告の円の半径（木槌・鐘が地面をたたく所のまわり） */
export const SWING_RADIUS = 1.7
/** ふりおろしが当たる半径（たたいた頭の真下から、ネクマックスの足もとまで。木槌の頭の大きさ＋体の太さ） */
export const SWING_HIT = 1.45
/** たたきつける頭（右手＝木槌の頭の中心・左手＝鐘の口）の、手の中の位置 */
const STRIKE_LOCAL: Record<DollSide, THREE.Vector3> = { right: new THREE.Vector3(0, -2.2, 0), left: new THREE.Vector3(0, -1.55, 0) }
/** 頭が地面にふれたとみなす高さ（木槌は頭の半径・鐘は口のふち。のりうつったときの大きさで、地面から m） */
const STRIKE_Y: Record<DollSide, number> = { right: 0.5, left: 0.1 }
/** たたきつけたときの肩の横の開き・ひじ（決まった値。前へのかがみと腕の角度は、落ちる所から決める） */
const SLAM_Z: Record<DollSide, number> = { right: 0.2, left: -0.15 }
const SLAM_ELBOW = 0.05
/** たたきつけで前へかがむ角度の上限（これより遠い所へは、とどかない） */
const SLAM_LEAN_MAX = 1.25
/** たたきつけた腕は、真下より少なくともこれだけ前へ（rad。体の前の地面をたたく） */
const SLAM_FWD_MIN = 0.15

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const ease = (x: number) => x * x * (3 - 2 * x)
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

// ---------------------------------------------------------------- 布・ひび・文字盤のテクスチャ

function kimonoCanvas(): HTMLCanvasElement {
  const [c, g] = makeCanvas(512)
  const gr = g.createLinearGradient(0, 0, 512, 512)
  gr.addColorStop(0, '#c82e2a')
  gr.addColorStop(1, '#a8201f')
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 512)
  // 金の歯車紋と白い波紋（市松に）
  const [gc, gg] = makeCanvas(96)
  gg.fillStyle = '#f0c25a'
  gg.beginPath()
  const n = 48
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = i % 4 < 2 ? 44 : 34
    if (i === 0) gg.moveTo(48 + Math.cos(a) * rr, 48 + Math.sin(a) * rr)
    else gg.lineTo(48 + Math.cos(a) * rr, 48 + Math.sin(a) * rr)
  }
  gg.closePath()
  gg.fill()
  gg.fillStyle = '#b8282a'
  gg.beginPath()
  gg.arc(48, 48, 15, 0, Math.PI * 2)
  gg.fill()
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const cx = x * 128 + (y % 2 ? 64 : 0) + 32
      const cy = y * 128 + 64
      if ((x + y) % 2 === 0) g.drawImage(gc, cx - 30, cy - 30, 60, 60)
      else drawWaveCrest(g, cx, cy, 26, 'rgba(255,248,236,0.85)')
    }
  }
  // 布のしわ（薄い斜めの筋）
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(60,0,0,${0.04 + (i % 4) * 0.015})`
    g.lineWidth = 6
    g.beginPath()
    const x = (i * 53) % 512
    g.moveTo(x, 0)
    g.lineTo(x + 60, 512)
    g.stroke()
  }
  return c
}

function hakamaCanvas(): HTMLCanvasElement {
  const [c, g] = makeCanvas(256)
  g.fillStyle = '#2c3f74'
  g.fillRect(0, 0, 256, 256)
  // 縦縞（ひだ）
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i % 2 ? 'rgba(10,20,50,0.35)' : 'rgba(120,150,220,0.12)'
    g.fillRect(i * 16, 0, 8, 256)
  }
  g.fillStyle = 'rgba(230,200,120,0.5)'
  for (let i = 0; i < 4; i++) g.fillRect(0, 40 + i * 64, 256, 3)
  return c
}

let crackTex: THREE.CanvasTexture | null = null
/** のりうつったときに光るひび（すみれ色）。小さなキャッシュ */
function crackTexture(): THREE.CanvasTexture {
  if (crackTex) return crackTex
  const [c, g] = makeCanvas(256)
  g.fillStyle = '#000'
  g.fillRect(0, 0, 256, 256)
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  g.lineCap = 'round'
  for (let i = 0; i < 22; i++) {
    let x = rnd() * 256
    let y = rnd() * 256
    let a = rnd() * Math.PI * 2
    g.strokeStyle = `rgba(255,255,255,${0.5 + rnd() * 0.5})`
    g.lineWidth = 1 + rnd() * 2.5
    g.beginPath()
    g.moveTo(x, y)
    for (let k = 0; k < 7; k++) {
      a += (rnd() - 0.5) * 1.4
      x += Math.cos(a) * (8 + rnd() * 16)
      y += Math.sin(a) * (8 + rnd() * 16)
      g.lineTo(x, y)
    }
    g.stroke()
  }
  crackTex = new THREE.CanvasTexture(c)
  crackTex.wrapS = crackTex.wrapT = THREE.RepeatWrapping
  crackTex.colorSpace = THREE.SRGBColorSpace
  return crackTex
}

/** 和時計の文字盤（九〜四の刻・十二の目盛り・金のふち） */
function dialTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(512)
  g.fillStyle = '#1d1712'
  g.beginPath()
  g.arc(256, 256, 252, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#f2e6c8'
  g.beginPath()
  g.arc(256, 256, 224, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#c8a050'
  g.lineWidth = 10
  g.beginPath()
  g.arc(256, 256, 236, 0, Math.PI * 2)
  g.stroke()
  // 刻：九つ（真上）から右回りに 八・七・六・五・四、六（真下）をはさんでもう一巡
  const marks = ['九', '八', '七', '六', '五', '四', '九', '八', '七', '六', '五', '四']
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI * 2
    const x = 256 + Math.cos(a) * 168
    const y = 256 + Math.sin(a) * 168
    drawLettering(g, { text: marks[i], vertical: true, x: x - 30, y: y - 30, w: 60, h: 60, ink: '#2a1a12', face: 'brush' })
    g.fillStyle = '#8a6a3a'
    g.beginPath()
    g.arc(256 + Math.cos(a + Math.PI / 12) * 205, 256 + Math.sin(a + Math.PI / 12) * 205, 5, 0, Math.PI * 2)
    g.fill()
  }
  // 真ん中の日と月
  g.fillStyle = '#d8402c'
  g.beginPath()
  g.arc(256, 210, 26, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#c8a050'
  g.beginPath()
  g.arc(256, 302, 24, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#f2e6c8'
  g.beginPath()
  g.arc(266, 296, 22, 0, Math.PI * 2)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ---------------------------------------------------------------- 足元の予告の円・衝撃波・もや

/** 地面の予告の円（ふりおろしの落ちる所）。k（0〜1）で円の中が満ちていく */
class WarnCircle {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uA: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uK; uniform float uA; uniform float uTime; varying vec2 vUv;
        void main(){ vec2 p = vUv*2.0-1.0; float r = length(p); if (r > 1.0) discard;
          float rim = smoothstep(0.86, 0.95, r) * (1.0 - smoothstep(0.97, 1.0, r));
          float fill = step(r, uK) * 0.35 + smoothstep(uK - 0.06, uK, r) * step(r, uK) * 0.5;
          float stripes = step(0.5, fract((p.x + p.y) * 3.0 - uTime * 1.5)) * 0.08 * step(r, 0.9);
          vec3 col = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.18, 0.12), uK);
          float a = (rim * 0.95 + fill + stripes) * uA;
          gl_FragColor = vec4(col * 1.6, a); }`,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat)
    this.mesh.rotation.x = -Math.PI / 2
    this.mesh.renderOrder = 2
    this.mesh.visible = false
    this.mesh.name = 'doll_warn_circle'
  }
  show(pos: THREE.Vector3, r: number): void {
    this.mesh.position.set(pos.x, pos.y + 0.04, pos.z)
    this.mesh.scale.set(r, r, 1)
    this.mesh.visible = true
  }
  set(k: number, a: number, t: number): void {
    this.mat.uniforms.uK.value = k
    this.mat.uniforms.uA.value = a
    this.mat.uniforms.uTime.value = t
    if (a <= 0.001) this.mesh.visible = false
  }
}

/** 鐘の衝撃波：地面を広がる光の輪（低い壁）。ジャンプで越える */
class BellWaveFx {
  readonly group = new THREE.Group()
  private readonly band: THREE.Mesh
  private readonly ground: THREE.Mesh
  private readonly mat: THREE.MeshBasicMaterial
  private readonly gmat: THREE.MeshBasicMaterial
  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.1, 2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })
    const g = new THREE.CylinderGeometry(1, 1, 1, 64, 1, true)
    g.translate(0, 0.5, 0)
    this.band = new THREE.Mesh(g, this.mat)
    this.gmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.5, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })
    this.ground = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 64), this.gmat)
    this.ground.rotation.x = -Math.PI / 2
    this.ground.position.y = 0.05
    this.group.add(this.band, this.ground)
    this.group.visible = false
    this.group.name = 'doll_bell_wave'
  }
  set(center: THREE.Vector3, r: number, a: number): void {
    this.group.visible = a > 0.001
    this.group.position.copy(center)
    this.band.scale.set(r, BELL_WAVE.height, r)
    this.ground.scale.set(r, r, 1)
    this.mat.opacity = a * 0.55
    this.gmat.opacity = a * 0.9
  }
}

/** 黒いもや（のりうつった影）。体のまわりに湧いて上へ流れる。lift で上へはがれていく */
class DollMist {
  readonly points: THREE.Points
  readonly embers: THREE.Points
  private readonly pos: Float32Array
  private readonly life: Float32Array
  private readonly epos: Float32Array
  private readonly elife: Float32Array
  private readonly mat: THREE.PointsMaterial
  private readonly emat: THREE.PointsMaterial
  private readonly n: number
  private readonly ne: number
  amount = 0
  lift = 0
  constructor(count: number) {
    this.n = count
    this.ne = Math.round(count * 0.25)
    this.pos = new Float32Array(this.n * 3)
    this.life = new Float32Array(this.n).map(() => Math.random())
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3))
    this.mat = new THREE.PointsMaterial({ map: softGlowTexture(), color: '#26103a', size: 2.2, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true, fog: false })
    this.points = new THREE.Points(g, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
    this.epos = new Float32Array(this.ne * 3)
    this.elife = new Float32Array(this.ne).map(() => Math.random())
    const eg = new THREE.BufferGeometry()
    eg.setAttribute('position', new THREE.BufferAttribute(this.epos, 3))
    this.emat = new THREE.PointsMaterial({ map: softGlowTexture(), color: new THREE.Color(1.4, 0.4, 2.0), size: 0.35, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false })
    this.embers = new THREE.Points(eg, this.emat)
    this.embers.frustumCulled = false
    this.points.name = 'doll_mist'
    this.embers.name = 'doll_embers'
  }
  /** center：足元（ワールド）、h：体の高さ、r：半径 */
  update(dt: number, center: THREE.Vector3, h: number, r: number): void {
    const vis = this.amount > 0.01
    this.points.visible = vis
    this.embers.visible = vis
    if (!vis) return
    this.mat.opacity = 0.5 * this.amount
    this.emat.opacity = 0.9 * this.amount * (1 - this.lift)
    const up = 1.6 + this.lift * 9
    for (let i = 0; i < this.n; i++) {
      this.life[i] += dt * (0.32 + (i % 5) * 0.03) * (1 + this.lift * 1.5)
      if (this.life[i] >= 1) this.life[i] -= 1
      const l = this.life[i]
      const a = i * 2.39996 + l * 1.3
      const rr = r * (0.55 + ((i * 37) % 10) / 22) * (1 + this.lift * 0.6)
      this.pos[i * 3] = center.x + Math.cos(a) * rr
      this.pos[i * 3 + 1] = center.y + (((i * 13) % 17) / 17) * h * 0.9 + l * up
      this.pos[i * 3 + 2] = center.z + Math.sin(a) * rr
    }
    ;(this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
    for (let i = 0; i < this.ne; i++) {
      this.elife[i] += dt * 0.5
      if (this.elife[i] >= 1) this.elife[i] -= 1
      const l = this.elife[i]
      const a = i * 1.7 + l * 3
      const rr = r * (0.4 + ((i * 7) % 5) / 6)
      this.epos[i * 3] = center.x + Math.cos(a) * rr
      this.epos[i * 3 + 1] = center.y + (((i * 11) % 13) / 13) * h + l * 2.5
      this.epos[i * 3 + 2] = center.z + Math.sin(a) * rr
    }
    ;(this.embers.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
  }
}

// ---------------------------------------------------------------- 人形

type Mats = {
  kimono: THREE.MeshStandardMaterial
  hakama: THREE.MeshStandardMaterial
  skin: THREE.MeshStandardMaterial
  lacquer: THREE.MeshStandardMaterial
  wood: THREE.MeshStandardMaterial
  gold: THREE.MeshStandardMaterial
  bronze: THREE.MeshStandardMaterial
  iron: THREE.MeshStandardMaterial
  white: THREE.MeshStandardMaterial
  gears: THREE.MeshStandardMaterial[]
}

/**
 * カメラの側から当てる暖色の明かり（点光源を使わない、材質の中の明かり）。
 * 夜のボス戦で、点光源の数が少ない画質でも顔・手・衣装の色が読めるように、カメラに向いた面ほど体の色を足す
 */
function addCameraFill(m: THREE.MeshStandardMaterial, fill: { value: number }): void {
  m.onBeforeCompile = (s) => {
    s.uniforms.uDollFill = fill
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDollFill;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 0.9, 0.78) * uDollFill * (0.3 + 0.7 * max(normal.z, 0.0));`,
      )
  }
  m.customProgramCacheKey = () => 'edo7-doll-fill'
}

function dollMaterials(lib: MaterialLibrary, fill: { value: number }): Mats {
  const crack = crackTexture()
  const std = (p: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, emissiveMap: crack, emissive: new THREE.Color(0, 0, 0), ...p })
    addCameraFill(m, fill)
    return m
  }
  const fromLib = (m: THREE.Material) => {
    const c = (m as THREE.MeshStandardMaterial).clone()
    c.emissiveMap = crack
    c.emissive = new THREE.Color(0, 0, 0)
    c.emissiveIntensity = 1
    addCameraFill(c, fill)
    return c
  }
  return {
    kimono: std({ map: tex(kimonoCanvas(), true, 4), roughness: 0.75 }),
    hakama: std({ map: tex(hakamaCanvas(), true, 4), roughness: 0.8 }),
    skin: std({ color: '#ffffff', roughness: 0.38 }),
    lacquer: std({ color: '#ffffff', roughness: 0.28, metalness: 0.1 }),
    wood: fromLib(lib.wood),
    gold: fromLib(lib.gold),
    bronze: std({ color: '#ffffff', roughness: 0.38, metalness: 0.75 }),
    iron: fromLib(lib.iron),
    white: std({ color: '#ffffff', roughness: 0.7 }),
    gears: [0, 1, 2].map(() => {
      const g = (lib.brass as THREE.MeshStandardMaterial).clone()
      g.emissive = new THREE.Color(0, 0, 0)
      return g
    }),
  }
}

type Leg = { hip: THREE.Group; knee: THREE.Group }
type Arm = { shoulder: THREE.Group; elbow: THREE.Group; hand: THREE.Group }

/** 関節の角度（目標へなめらかに寄せる） */
type Pose = {
  y: number
  lean: number
  roll: number
  twist: number
  headX: number
  headZ: number
  hipL: number
  hipR: number
  kneeL: number
  kneeR: number
  armRX: number
  armRZ: number
  elbowR: number
  armLX: number
  armLZ: number
  elbowL: number
}

const REST: Pose = { y: 0, lean: 0, roll: 0, twist: 0, headX: 0, headZ: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, armRX: 0.35, armRZ: 0.12, elbowR: 0.9, armLX: 0.55, armLZ: -0.1, elbowL: 0.6 }

export class TimeBellDoll {
  readonly root = new THREE.Group()
  /** 弱点の歯車（hold_mechanism）。0＝右の肩・1＝左のひざ・2＝胸。enabled はステージが決める */
  readonly targets: ClawTargetDef[]
  /** 地面の予告の円・衝撃波・もや（ワールドに置く。root とは別） */
  readonly fx = new THREE.Group()
  /** 台座の上に立っている足元（ワールド） */
  readonly home = new THREE.Vector3()
  /** 攻撃が当たる瞬間（ステージが体力を減らす） */
  onImpact: ((e: DollImpact) => void) | null = null
  /** 足をついた（画面の揺れ・土ぼこり） */
  onStep: ((pos: THREE.Vector3) => void) | null = null
  /** 歩ける範囲（ワールドの XZ）。walkTo の行き先をこの中にとどめる */
  roam: { x0: number; x1: number; z0: number; z1: number } | null = null
  state: DollState = 'idle'
  possessed = false
  /** 怒り（順番をまちがえたとき）：攻撃が速くなる 1〜1.6 */
  rage = 1
  /** 顔の前を照らす暖色の補助灯（町の点光源の候補。のりうつっている間だけ点く。人形について動く） */
  readonly faceLight: LightSpot = { pos: new THREE.Vector3(), color: '#ffe0b5', intensity: 0, dist: 16, priority: true }
  /** カメラの側からの暖色の明かり（材質の中。のりうつっている間だけ） */
  private readonly fill = { value: 0 }

  private readonly mats: Mats
  private readonly body = new THREE.Group()
  private readonly torso = new THREE.Group()
  private readonly head = new THREE.Group()
  private readonly legL: Leg
  private readonly legR: Leg
  private readonly armL: Arm
  private readonly armR: Arm
  private readonly key = new THREE.Group()
  private readonly gears: THREE.Group[] = []
  private readonly gearRings: THREE.Mesh[] = []
  private readonly gearGlow: THREE.Sprite[] = []
  private readonly gearStopped = [false, false, false]
  private readonly gearStrain = [0, 0, 0]
  private highlight: number | null = null
  private readonly eyes: THREE.Mesh[] = []
  private readonly eyeGlow: THREE.Sprite[] = []
  private readonly eyeDots: THREE.Mesh[] = []
  private readonly dialHand: THREE.Mesh
  private readonly pedestalGears: THREE.Object3D[] = []
  private readonly warn = new WarnCircle()
  /** 足ぶみの予告の赤い輪（人形のまわり） */
  private readonly stompWarn = new WarnCircle()
  /** 鐘の衝撃波（大技は 2 つ続けて出すので 2 本） */
  private readonly waves: Array<{ r: number; center: THREE.Vector3; fx: BellWaveFx }> = [0, 1].map(() => ({ r: -1, center: new THREE.Vector3(), fx: new BellWaveFx() }))
  /** 大技の 2 つ目の輪までの秒（-1 は無し） */
  private pendingWave = -1
  /** 胸の戸（左右の 2 枚。蝶番のまわりに回る）と、ひらき具合 */
  private readonly doors: THREE.Group[] = []
  private doorK = 0
  /** 大技のためで光る鐘 */
  private readonly bellGlow: THREE.Sprite
  private chargeGlow = 0
  /** 歯車を引っぱった回数（少しずつ外へとび出る） */
  private readonly gearHits = [0, 0, 0]
  /** 木槌が地面にささっている秒（swing で決める） */
  private stuckSec = 0
  /** 歯車をつかまれている（すきの姿勢のまま止まる） */
  private held = false
  private readonly mist: DollMist
  private readonly pose: Pose = { ...REST }
  private readonly want: Pose = { ...REST }
  private scale = NORMAL_SCALE
  private possessK = 0
  private t = 0
  private st = 0
  private walkPhase = 0
  private lastStepSign = 0
  private walkTarget: THREE.Vector3 | null = null
  private walkSpeed = 1.6
  private faceTarget: number | null = null
  private side: DollSide = 'right'
  private readonly impact = new THREE.Vector3()
  /** たたきつけの姿勢（前へのかがみ・腕の角度）。swing で、頭が予告の円に落ちるように決める */
  private readonly slamAim = { lean: 0.5, arm: 1.1 }
  /** このふりおろしで、もう地面をたたいた */
  private struck = true
  /** たたきつける頭のワールド位置（毎フレーム） */
  private readonly strikeAt = new THREE.Vector3()
  private struggleK = 0
  private kneeling = 0
  private onPedestal = true
  private resolve: (() => void) | null = null
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly q = new THREE.Quaternion()

  /**
   * c：町のバッチ（台座を積む）と当たり判定。pos：台座の中心（地面）、yaw：人形の向き（0 = 北）。
   * mistCount：もやの粒の数（画質で減らす）
   */
  constructor(c: Ctx, pos: THREE.Vector3, yaw: number, mistCount = 220) {
    this.mats = dollMaterials(c.m, this.fill)
    this.mist = new DollMist(mistCount)
    c.lights.push(this.faceLight)
    this.dialHand = this.buildPedestal(c, pos, yaw)
    this.home.set(pos.x, pos.y + PEDESTAL.h, pos.z)
    this.root.position.copy(this.home)
    this.root.rotation.y = yaw
    this.root.name = 'time_bell_doll'
    this.body.name = 'doll_body'
    this.root.add(this.body)
    this.legL = this.buildLeg(-1)
    this.legR = this.buildLeg(1)
    this.buildHakama()
    this.torso.position.y = 3.6
    this.body.add(this.torso)
    this.buildTorso()
    this.armR = this.buildArm(1)
    this.armL = this.buildArm(-1)
    this.buildHead()
    this.buildKey()
    // 弱点の歯車（0：右の肩・1：左のひざ・2：胸）
    this.gears.push(this.buildGear(this.torso, v(1.18, 2.42, -0.52), 0.5, 16, new THREE.Euler(-0.2, -0.585, 0), 0))
    this.gears.push(this.buildGear(this.legL.knee, v(0, 0, -0.4), 0.42, 14, new THREE.Euler(0, 0, 0), 1))
    this.gears.push(this.buildGear(this.torso, v(0, 1.4, -0.86), 0.5, 18, new THREE.Euler(0, 0, 0), 2))
    this.buildDoors()
    // 輪郭線（体の大きな部品だけ。歯車・金具は線なし）。人物と同じ画面の太さ（近くで太くなりすぎない）
    addOutlines(this.body, 0.006, '#2a1410', (m) => m.material !== this.mats.gold && !this.mats.gears.includes(m.material as THREE.MeshStandardMaterial) && m.material !== this.mats.iron, OUTLINE_PX.figure)
    this.targets = this.gears.map((_g, i) => ({
      id: `bell_doll_gear_${i}`,
      type: 'hold_mechanism' as const,
      label: `${GEAR_NAMES[i]}の歯車`,
      point: new THREE.Vector3(),
      radius: 0.55,
      enabled: false,
      noLineOfSight: true,
      range: 18,
      facing: new THREE.Vector3(0, 0, -1),
    }))
    // 大技のためで光る鐘（左手の鐘の口のあたり）
    this.bellGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#ff4fa0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }))
    this.bellGlow.position.set(0, -1.0, 0)
    this.bellGlow.scale.setScalar(3.2)
    this.armL.hand.add(this.bellGlow)
    this.stompWarn.mesh.name = 'doll_stomp_warn'
    this.fx.add(this.warn.mesh, this.stompWarn.mesh, ...this.waves.map((w) => w.fx.group), this.mist.points, this.mist.embers)
    this.fx.name = 'time_bell_doll_fx'
    this.root.scale.setScalar(this.scale)
    this.root.updateMatrixWorld(true)
    this.updateTargets()
  }

  // -------------------------------------------------------------- 組み立て

  private part(name: string, build: (b: Batch) => void): THREE.Group {
    const b = new Batch()
    build(b)
    const g = b.build(name)
    g.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.matrixAutoUpdate = true
      }
    })
    return g
  }

  /** 台座（和時計の文字盤・のぞき窓の歯車・小さな屋根）。町のバッチに積み、文字盤の針だけ別 */
  private buildPedestal(c: Ctx, pos: THREE.Vector3, yaw: number): THREE.Mesh {
    const P = PEDESTAL
    const cs = Math.cos(yaw)
    const sn = Math.sin(yaw)
    const L = (lx: number, ly: number, lz: number) => new THREE.Vector3(pos.x + lx * cs + lz * sn, pos.y + ly, pos.z - lx * sn + lz * cs)
    const box = (lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, mat: THREE.Material, tint: THREE.ColorRepresentation, texM = 1.6) => {
      const p = L(lx, ly, lz)
      c.b.add(rbox(sx, sy, sz, 0.03), mat, M(p.x, p.y, p.z, 0, yaw, 0), { tint, texM })
    }
    // 石の基壇と、木の箱（漆の板・柱）
    box(0, 0.15, 0, P.w + 0.6, 0.3, P.d + 0.6, c.m.stoneWall, '#e8e0d4', 3)
    box(0, P.h / 2 + 0.15, 0, P.w, P.h - 0.3, P.d, c.m.wood, woodTint(c.rng, '#9a5a3a', 0.04))
    for (const [lx, lz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      box(lx * (P.w / 2 - 0.1), P.h / 2 + 0.1, lz * (P.d / 2 - 0.1), 0.3, P.h - 0.2, 0.3, c.m.darkLacquer, '#ffffff')
      box(lx * (P.w / 2 - 0.1), P.h + 0.02, lz * (P.d / 2 - 0.1), 0.36, 0.08, 0.36, c.m.brass, '#ffffff')
    }
    // 上の縁（人形が立つ板）と、小さな軒
    box(0, P.h - 0.05, 0, P.w + 0.4, 0.14, P.d + 0.4, c.m.wood, woodTint(c.rng, WOOD.dark))
    // 正面の文字盤
    {
      const p = L(0, 1.05, -P.d / 2 - 0.03)
      c.b.add(new THREE.CylinderGeometry(0.98, 0.98, 0.08, 40), c.m.brass, M(p.x, p.y, p.z, Math.PI / 2, yaw, 0, 1, 1, 1))
    }
    // 横ののぞき窓（格子の奥で歯車が回る）
    for (const e of [-1, 1]) {
      const p = L(e * (P.w / 2 + 0.02), 1.05, 0)
      c.b.add(rbox(0.06, 1.0, 1.8, 0.01), c.m.darkLacquer, M(p.x, p.y, p.z, 0, yaw, 0), { tint: '#ffffff' })
      for (let k = 0; k < 9; k++) {
        const q = L(e * (P.w / 2 + 0.06), 1.05, -0.8 + k * 0.2)
        c.b.add(rbox(0.04, 1.0, 0.03, 0), c.m.wood, M(q.x, q.y, q.z, 0, yaw, 0), { tint: WOOD.dark })
      }
    }
    // 台座の裏の鐘楼風の小屋根（遠くから「からくり時計」だとわかる）
    {
      const p = L(0, 0, P.d / 2 + 0.1)
      woodBox(c, p.x, P.h + 1.2, p.z, 0.2, 2.4, 0.2, { tint: WOOD.dark })
      const top = L(0, 0, P.d / 2 + 0.1)
      gableRoof(c, top.x, top.z, 1.4, 1.1, pos.y + P.h + 2.3, 0.45, Math.abs(Math.sin(yaw)) > 0.5 ? 'z' : 'x')
    }
    // 看板「時の鐘」
    {
      const p = L(0, P.h - 0.32, -P.d / 2 - 0.06)
      c.b.add(rbox(1.7, 0.42, 0.06, 0.01), c.m.wood, M(p.x, p.y, p.z, 0, yaw, 0), { tint: WOOD.dark })
      const s = L(0, P.h - 0.32, -P.d / 2 - 0.095)
      c.b.add(new THREE.PlaneGeometry(1.6, 0.36), c.m.sign({ text: '時の鐘', w: 640, h: 144, face: 'brush' }), M(s.x, s.y, s.z, 0, yaw + Math.PI, 0))
    }
    c.col.box(pos.x, pos.y + P.h / 2, pos.z, P.w + 0.4, P.h, P.d + 0.4, yaw)
    // 文字盤の紙と針（針は回すので別のメッシュ）
    const dialFace = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.6 }))
    const dp = L(0, 1.05, -P.d / 2 - 0.075)
    dialFace.position.copy(dp)
    dialFace.rotation.y = yaw + Math.PI
    dialFace.name = 'doll_dial'
    this.fx.add(dialFace)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.68, 0.02), new THREE.MeshStandardMaterial({ color: '#2a1a12', roughness: 0.4 }))
    hand.geometry.translate(0, 0.3, 0)
    const hp = L(0, 1.05, -P.d / 2 - 0.09)
    hand.position.copy(hp)
    hand.rotation.set(0, yaw + Math.PI, 0)
    hand.name = 'doll_dial_hand'
    this.fx.add(hand)
    // のぞき窓の奥の歯車（回る）
    for (const e of [-1, 1]) {
      const b = new Batch()
      b.add(gearGeometry(0.45, 0.08, 16, { spokes: 4 }), c.m.brass, M(0, 0, 0, 0, Math.PI / 2, 0))
      const g = b.build('pedestal_gear')
      g.position.copy(L(e * (P.w / 2 - 0.25), 1.05, 0))
      g.rotation.y = yaw
      this.fx.add(g)
      this.pedestalGears.push(g)
    }
    return hand
  }

  private buildLeg(e: -1 | 1): Leg {
    const m = this.mats
    const hip = new THREE.Group()
    hip.position.set(e * 0.6, 3.4, 0)
    this.body.add(hip)
    hip.add(
      this.part('doll_thigh', (b) => {
        b.add(new THREE.CylinderGeometry(0.36, 0.3, 1.5, 14), m.wood, M(0, -0.75, 0), { tint: '#b86a3e', texM: 1 })
      }),
    )
    const knee = new THREE.Group()
    knee.position.y = -1.5
    hip.add(knee)
    knee.add(
      this.part('doll_shin', (b) => {
        b.add(new THREE.SphereGeometry(0.33, 14, 10), m.wood, undefined, { tint: '#a85e36', texM: 1 })
        b.add(new THREE.CylinderGeometry(0.3, 0.24, 1.55, 14), m.lacquer, M(0, -0.8, 0), { tint: '#2a1a14' })
        b.add(new THREE.CylinderGeometry(0.27, 0.27, 0.12, 14), m.gold, M(0, -1.45, 0), { tint: '#ffffff' })
        // 足袋（白）と下駄
        b.add(rbox(0.4, 0.22, 0.7, 0.08), m.white, M(0, -1.62, -0.12), { tint: '#f4f0e8' })
        b.add(rbox(0.52, 0.12, 0.98, 0.03), m.wood, M(0, -1.79, -0.1), { tint: '#d8b080', texM: 0.8 })
        for (const z of [-0.42, 0.22]) b.add(rbox(0.5, 0.14, 0.1, 0.01), m.lacquer, M(0, -1.9, z), { tint: '#2a1a14' })
        // 鼻緒（赤）
        b.add(new THREE.TorusGeometry(0.12, 0.03, 5, 12, Math.PI), m.white, M(0, -1.66, -0.32, -Math.PI / 2, 0, 0), { tint: '#d8302a' })
      }),
    )
    return { hip, knee }
  }

  private buildHakama(): void {
    const m = this.mats
    const pts = [
      [1.0, 3.95],
      [1.12, 3.5],
      [1.3, 2.85],
      [1.42, 2.42],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    this.body.add(
      this.part('doll_hakama', (b) => {
        const g = new THREE.LatheGeometry(pts, 24)
        b.add(g, m.hakama, undefined, { uv: 'scale', uvScale: [4, 1] })
        // すその縁（金）
        b.add(new THREE.TorusGeometry(1.42, 0.05, 6, 32), m.gold, M(0, 2.42, 0, Math.PI / 2, 0, 0))
        g.dispose()
      }),
    )
  }

  private buildTorso(): void {
    const m = this.mats
    const pts = [
      [0.0, 0.0],
      [0.98, 0.0],
      [1.02, 0.6],
      [1.08, 1.4],
      [1.0, 2.05],
      [0.7, 2.45],
      [0.3, 2.62],
      [0.0, 2.64],
    ].map(([r, y]) => new THREE.Vector2(r, y))
    this.torso.add(
      this.part('doll_torso', (b) => {
        const g = new THREE.LatheGeometry(pts, 24)
        b.add(g, m.kimono, M(0, 0, 0, 0, 0, 0, 1, 1, 0.82), { uv: 'scale', uvScale: [3, 1.6] })
        g.dispose()
        // 帯（金）と結び（背中の大きなリボン）
        b.add(new THREE.CylinderGeometry(1.05, 1.05, 0.55, 24, 1, true), m.gold, M(0, 0.35, 0, 0, 0, 0, 1, 1, 0.84))
        b.add(new THREE.CylinderGeometry(1.06, 1.06, 0.08, 24, 1, true), m.kimono, M(0, 0.35, 0, 0, 0, 0, 1, 1, 0.85), { tint: '#ffffff' })
        for (const e of [-1, 1]) b.add(rbox(0.9, 0.62, 0.2, 0.15), m.gold, M(e * 0.5, 0.5, 0.95, 0, e * 0.35, e * 0.25))
        b.add(rbox(0.36, 0.42, 0.26, 0.1), m.gold, M(0, 0.48, 0.92))
        // 衿（白い V 字）
        for (const e of [-1, 1]) b.add(rbox(0.16, 1.2, 0.08, 0.04), m.white, M(e * 0.26, 2.0, -0.76, -0.25, 0, e * 0.42), { tint: '#fbf6ee' })
        // 胸の窓のふち（漆の輪）
        b.add(new THREE.TorusGeometry(0.62, 0.09, 8, 28), m.lacquer, M(0, 1.4, -0.84), { tint: '#2a1a14' })
        b.add(new THREE.CircleGeometry(0.6, 24), m.lacquer, M(0, 1.4, -0.78, 0, Math.PI, 0), { tint: '#120c0a' })
      }),
    )
  }

  private buildArm(e: -1 | 1): Arm {
    const m = this.mats
    const shoulder = new THREE.Group()
    shoulder.position.set(e * 1.05, 2.3, 0)
    this.torso.add(shoulder)
    shoulder.add(
      this.part('doll_upper_arm', (b) => {
        b.add(new THREE.SphereGeometry(0.42, 14, 10), m.kimono, undefined, { uv: 'scale', uvScale: [1, 1] })
        b.add(new THREE.CylinderGeometry(0.3, 0.27, 1.55, 12), m.kimono, M(0, -0.8, 0), { uv: 'scale', uvScale: [1, 1] })
        // 振袖（たれる大きな袖）
        b.add(rbox(0.28, 1.7, 1.15, 0.12), m.kimono, M(e * 0.02, -1.1, 0.28), { uv: 'scale', uvScale: [1, 1.4] })
        b.add(rbox(0.3, 0.1, 1.15, 0.04), m.gold, M(e * 0.02, -1.95, 0.28))
      }),
    )
    const elbow = new THREE.Group()
    elbow.position.y = -1.55
    shoulder.add(elbow)
    elbow.add(
      this.part('doll_fore_arm', (b) => {
        b.add(new THREE.SphereGeometry(0.27, 12, 9), m.wood, undefined, { tint: '#b86a3e', texM: 1 })
        b.add(new THREE.CylinderGeometry(0.24, 0.21, 1.45, 12), m.skin, M(0, -0.73, 0), { tint: '#f6ece0' })
        b.add(new THREE.SphereGeometry(0.3, 14, 10), m.skin, M(0, -1.55, 0), { tint: '#f6ece0' })
      }),
    )
    const hand = new THREE.Group()
    hand.position.y = -1.55
    elbow.add(hand)
    if (e > 0) {
      // 右手：木槌（柄は腕の先へまっすぐ、頭は横向き）
      hand.add(
        this.part('doll_hammer', (b) => {
          b.add(new THREE.CylinderGeometry(0.09, 0.09, 2.3, 10), m.wood, M(0, -1.0, 0), { tint: '#c89a62', texM: 1 })
          b.add(new THREE.CylinderGeometry(0.44, 0.44, 1.05, 16), m.wood, M(0, -2.2, 0, 0, 0, Math.PI / 2), { tint: '#a8743e', texM: 1 })
          for (const x of [-0.45, 0.45]) b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.1, 16), m.iron, M(x, -2.2, 0, 0, 0, Math.PI / 2))
        }),
      )
    } else {
      // 左手：鐘（取っ手を握り、口は腕の先の向き）
      hand.add(
        this.part('doll_bell', (b) => {
          const pts = [
            [0.0, 0.0],
            [0.32, 0.02],
            [0.42, 0.2],
            [0.5, 0.75],
            [0.62, 1.12],
            [0.7, 1.28],
            [0.62, 1.3],
          ].map(([r, y]) => new THREE.Vector2(r, y))
          const g = new THREE.LatheGeometry(pts, 24)
          b.add(g, m.bronze, M(0, -0.25, 0, Math.PI, 0, 0), { tint: '#b08a4c' })
          g.dispose()
          b.add(new THREE.TorusGeometry(0.18, 0.06, 8, 16), m.bronze, M(0, -0.12, 0), { tint: '#9a7a44' })
          // 帯の模様
          for (const y of [-0.85, -1.2]) b.add(new THREE.TorusGeometry(y < -1 ? 0.6 : 0.5, 0.03, 4, 24), m.bronze, M(0, y - 0.25 + 0.25, 0, Math.PI / 2, 0, 0), { tint: '#6fae96' })
          // 中の舌
          b.add(new THREE.SphereGeometry(0.16, 10, 8), m.iron, M(0, -1.45, 0))
        }),
      )
    }
    return { shoulder, elbow, hand }
  }

  private buildHead(): void {
    const m = this.mats
    this.head.position.y = 2.66
    this.torso.add(this.head)
    this.head.add(
      this.part('doll_head', (b) => {
        b.add(new THREE.CylinderGeometry(0.32, 0.38, 0.4, 14), m.skin, M(0, 0.15, 0), { tint: '#f6ece0' })
        b.add(new THREE.SphereGeometry(0.86, 24, 18), m.skin, M(0, 0.95, 0, 0, 0, 0, 1, 1.02, 0.96), { tint: '#fbf3e8' })
        // 髪（黒い漆）：頭の上と後ろ・前髪・左右の房・頭の上の輪
        b.add(new THREE.SphereGeometry(0.9, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), m.lacquer, M(0, 1.0, 0.05, -0.32, 0, 0), { tint: '#1a1210' })
        b.add(rbox(1.3, 0.34, 0.3, 0.14), m.lacquer, M(0, 1.42, -0.62, -0.25, 0, 0), { tint: '#1a1210' })
        for (const e of [-1, 1]) b.add(rbox(0.3, 0.9, 0.5, 0.14), m.lacquer, M(e * 0.78, 0.85, 0.08), { tint: '#1a1210' })
        for (const e of [-1, 1]) b.add(new THREE.TorusGeometry(0.24, 0.1, 8, 16), m.lacquer, M(e * 0.32, 1.98, 0.1, 0, 0, e * 0.4), { tint: '#1a1210' })
        b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.12, 10), m.gold, M(0, 1.86, 0.1))
        // 眉と口と頬
        for (const e of [-1, 1]) b.add(rbox(0.2, 0.05, 0.05, 0.02), m.lacquer, M(e * 0.3, 1.18, -0.8, 0, 0, -e * 0.12), { tint: '#1a1210' })
        b.add(new THREE.SphereGeometry(0.07, 10, 8), m.white, M(0, 0.6, -0.82, 0, 0, 0, 1.4, 0.7, 0.6), { tint: '#d8302a' })
        for (const e of [-1, 1]) b.add(new THREE.SphereGeometry(0.12, 10, 8), m.white, M(e * 0.42, 0.74, -0.7, 0, 0, 0, 1, 0.7, 0.4), { tint: '#ffb0a8' })
      }),
    )
    // 目：ふだんは黒い点（目の形）、のりうつると光る（別のメッシュ）
    for (const e of [-1, 1]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), this.mats.lacquer)
      dot.position.set(e * 0.3, 0.95, -0.8)
      dot.scale.set(1, 1.25, 0.5)
      this.head.add(dot)
      this.eyeDots.push(dot)
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.6, 2.4), toneMapped: false }))
      eye.position.set(e * 0.3, 0.95, -0.82)
      eye.scale.set(1.2, 0.9, 0.5)
      eye.visible = false
      eye.userData.noOutline = true
      this.head.add(eye)
      this.eyes.push(eye)
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#ff3cd0', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }))
      glow.position.set(e * 0.3, 0.95, -0.95)
      glow.scale.setScalar(1.5)
      this.head.add(glow)
      this.eyeGlow.push(glow)
    }
  }

  /** 背中のぜんまいの鍵（大きな蝶の形。回る） */
  private buildKey(): void {
    const m = this.mats
    this.key.position.set(0, 1.4, 0.92)
    this.torso.add(this.key)
    this.key.add(
      this.part('doll_key', (b) => {
        b.add(new THREE.CylinderGeometry(0.1, 0.1, 0.7, 10), m.iron, M(0, 0, 0.35, Math.PI / 2, 0, 0))
        for (const e of [-1, 1]) b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 20), m.gold, M(e * 0.5, 0, 0.75, 0, 0, Math.PI / 2, 1, 1, 0.7))
      }),
    )
  }

  /** 弱点の歯車（真ちゅう。光る輪・止まったときの青い時計の輪つき） */
  private buildGear(parent: THREE.Group, p: THREE.Vector3, r: number, teeth: number, rot: THREE.Euler, i: number): THREE.Group {
    const holder = new THREE.Group()
    holder.position.copy(p)
    holder.rotation.copy(rot)
    parent.add(holder)
    const spin = this.part(`doll_gear_${i}`, (b) => {
      b.add(gearGeometry(r, 0.14, teeth, { spokes: 5 }), this.mats.gears[i], undefined)
      b.add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.24, 12), this.mats.iron, M(0, 0, 0, Math.PI / 2, 0, 0))
    })
    holder.add(spin)
    // 光る輪（次につかむ歯車）
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.35, 0.05, 6, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.9, 0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    ring.position.z = -0.1
    ring.userData.noOutline = true
    holder.add(ring)
    this.gearRings.push(ring)
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#ffd060', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }))
    glow.position.z = -0.25
    glow.scale.setScalar(r * 4)
    holder.add(glow)
    this.gearGlow.push(glow)
    return spin
  }

  /** 胸の戸（漆の観音びらき。大技のためでひらき、胸の歯車が見える） */
  private buildDoors(): void {
    const m = this.mats
    for (const e of [-1, 1]) {
      const hinge = new THREE.Group()
      hinge.position.set(e * 0.62, 1.4, -0.9)
      this.torso.add(hinge)
      // 半円の板：蝶番（外がわ）から胸のまんなかまで
      const door = this.part('doll_chest_door', (b) => {
        const g = new THREE.CircleGeometry(0.62, 16, e < 0 ? -Math.PI / 2 : Math.PI / 2, Math.PI)
        b.add(g, m.lacquer, M(-e * 0.62, 0, -0.02, 0, Math.PI, 0), { tint: '#7a1c18' })
        g.dispose()
        b.add(new THREE.TorusGeometry(0.62, 0.035, 5, 16, Math.PI), m.gold, M(-e * 0.62, 0, -0.03, 0, 0, e < 0 ? Math.PI / 2 : -Math.PI / 2), { tint: '#ffffff' })
        // 合わせ目の金の縁
        b.add(rbox(0.05, 1.18, 0.05, 0.01), m.gold, M(-e * 0.59, 0, -0.04), { tint: '#ffffff' })
      })
      hinge.add(door)
      this.doors.push(hinge)
    }
  }

  // -------------------------------------------------------------- 外から使う

  /** 足元（ワールド） */
  get position(): THREE.Vector3 {
    return this.root.position
  }

  get yaw(): number {
    return this.root.rotation.y
  }

  /** 体の高さ（今の大きさで） */
  get height(): number {
    return 8.3 * this.scale
  }

  /** のりうつられる・はなれる（instant で一瞬で） */
  setPossessed(on: boolean, instant = false): void {
    if (on === this.possessed && !instant) return
    this.possessed = on
    if (instant) {
      this.possessK = on ? 1 : 0
      this.scale = on ? POSSESSED_SCALE : NORMAL_SCALE
      this.root.scale.setScalar(this.scale)
      if (on && this.state === 'idle') this.state = 'stand'
      return
    }
    if (on) this.enter('possessing')
  }

  /** 台座から広場へ降りる（のりうつったあと）。降りきると resolve */
  stepDown(): Promise<void> {
    this.enter('stepdown')
    return this.waitState()
  }

  /** その場で台座の前の地面に立たせる（セーブから・撮影用） */
  placeOnGround(p?: THREE.Vector3): void {
    this.onPedestal = false
    const g = p ?? this.groundFront()
    this.root.position.set(g.x, g.y, g.z)
    if (this.state === 'idle' || this.state === 'possessing' || this.state === 'stepdown') this.state = 'stand'
  }

  /** 台座の前（降りる先） */
  groundFront(out = new THREE.Vector3()): THREE.Vector3 {
    const yaw = this.root.rotation.y
    return out.set(this.home.x - Math.sin(yaw) * (PEDESTAL.d / 2 + 2.2), this.home.y - PEDESTAL.h, this.home.z - Math.cos(yaw) * (PEDESTAL.d / 2 + 2.2))
  }

  /** p へ歩く（範囲 roam の中にとどめる）。着いたら止まる */
  walkTo(p: THREE.Vector3, speed = 1.6): void {
    if (!this.canMove()) return
    this.walkTarget = (this.walkTarget ?? new THREE.Vector3()).copy(p)
    if (this.roam) {
      this.walkTarget.x = Math.max(this.roam.x0, Math.min(this.roam.x1, this.walkTarget.x))
      this.walkTarget.z = Math.max(this.roam.z0, Math.min(this.roam.z1, this.walkTarget.z))
    }
    this.walkSpeed = speed
    if (this.state === 'stand') this.enter('walk')
  }

  stopWalking(): void {
    this.walkTarget = null
    if (this.state === 'walk') this.enter('stand')
  }

  /** p の方を向く（instant で一瞬で） */
  faceTo(p: THREE.Vector3, instant = false): void {
    const y = Math.atan2(-(p.x - this.root.position.x), -(p.z - this.root.position.z))
    if (instant) {
      this.root.rotation.y = y
      this.faceTarget = null
    } else this.faceTarget = y
  }

  /** 攻撃中か（ふりおろし・鐘・足ぶみ・大技と、そのあとのすき） */
  get attacking(): boolean {
    switch (this.state) {
      case 'windup':
      case 'slam':
      case 'stuck':
      case 'recover':
      case 'bellUp':
      case 'bellHit':
      case 'stompUp':
      case 'stompHit':
      case 'kneeLock':
      case 'chargeUp':
      case 'tired':
        return true
      default:
        return false
    }
  }

  /**
   * いま見えている（つかめる）歯車。よけたあとのすき：木槌が地面にささっている＝右の肩・足ぶみのあとひざがロック＝左のひざ・
   * 大技のため（半分すぎてから）とそのあとのつかれ＝胸（戸がひらく）。止めた歯車・すきが無いときは null
   */
  get opening(): number | null {
    if (this.state === 'stuck' && this.side === 'right' && !this.gearStopped[0]) return 0
    if (this.state === 'kneeLock' && !this.gearStopped[1]) return 1
    if (!this.gearStopped[2] && (this.state === 'tired' || (this.state === 'chargeUp' && this.st * this.rage >= T.chargeUp * 0.35))) return 2
    return null
  }

  /** すきの残りの秒（すきが無ければ 0） */
  get openingLeft(): number {
    if (this.state === 'stuck') return Math.max(0, this.stuckSec - this.st)
    if (this.state === 'kneeLock') return Math.max(0, T.kneeLock - this.st)
    if (this.state === 'tired') return Math.max(0, T.tired - this.st)
    if (this.state === 'chargeUp') return T.tired + Math.max(0, T.chargeUp - this.st * this.rage) / this.rage
    return 0
  }

  /** 次の命令を受けられる（立っている・歩いている） */
  get ready(): boolean {
    return this.state === 'stand' || this.state === 'walk'
  }

  /**
   * 腕のふりおろし（予告の円 → たたきつけ）。たたきつけまでの秒を返す（できなければ -1）。
   * at（ねらう地面）を渡すと、木槌（左手なら鐘）の頭が、そこへ本当に落ちるように、体の向き・前へのかがみ・腕の角度を決める
   * （とどかない遠さ・近さなら、とどく所まで）。予告の円は、頭が落ちる所に出す。at を省くと体の前
   */
  swing(side: DollSide, at?: THREE.Vector3, stuck = 0): number {
    if (!this.ready || this.state === 'collapse') return -1
    if (side === 'right' && this.gearStopped[0]) side = 'left'
    this.side = side
    this.stuckSec = side === 'right' ? stuck : 0
    this.walkTarget = null
    const r = this.root.position
    const dist = at ? Math.hypot(at.x - r.x, at.z - r.z) : 3.5 * (this.scale / POSSESSED_SCALE)
    const loc = this.solveSlam(side, dist, this.tmp2)
    // 体の向き：頭（体から見て loc）が、ねらう所の方角に来るように
    const bearing = at && dist > 0.3 ? Math.atan2(-(at.x - r.x), -(at.z - r.z)) : this.root.rotation.y + Math.atan2(-loc.x, -loc.z)
    const yaw = bearing - Math.atan2(-loc.x, -loc.z)
    this.faceTarget = yaw
    this.impact.set(r.x + loc.x * Math.cos(yaw) + loc.z * Math.sin(yaw), Math.max(0, r.y), r.z - loc.x * Math.sin(yaw) + loc.z * Math.cos(yaw))
    this.warn.show(this.impact, SWING_RADIUS)
    this.struck = false
    this.enter('windup')
    return T.windup / this.rage
  }

  /** 木槌・鐘が、いちばん近く・遠くで地面にとどく所（体の中心から m）。いまの大きさ・ひざのつき方で */
  swingReach(side: DollSide): [number, number] {
    if (side === 'right' && this.gearStopped[0]) side = 'left'
    const near = this.solveSlam(side, 0, this.tmp2)
    const n = Math.hypot(near.x, near.z)
    const far = this.solveSlam(side, 99, this.tmp2)
    return [n, Math.hypot(far.x, far.z)]
  }

  /**
   * 体（root）から見た、たたきつけたときの頭の位置（m。x＝右・y＝足もとからの高さ・z＝うしろ）。
   * 骨組みをその姿勢にして測る（親の行列だけ更新する。呼んだあとは applyPose で戻す）
   */
  private strikeLocal(side: DollSide, lean: number, arm: number, out: THREE.Vector3): THREE.Vector3 {
    const A = side === 'right' ? this.armR : this.armL
    this.body.position.y = -1.62 * this.kneeling
    this.body.rotation.z = 0
    this.torso.rotation.set(-lean, 0, 0)
    A.shoulder.rotation.set(arm, 0, SLAM_Z[side])
    A.elbow.rotation.x = SLAM_ELBOW
    A.hand.updateWorldMatrix(true, false)
    A.hand.localToWorld(out.copy(STRIKE_LOCAL[side]))
    this.root.worldToLocal(out)
    return out.multiplyScalar(this.scale)
  }

  /**
   * たたきつけの姿勢を決める：頭が地面にふれて、体の中心から dist m の所に落ちるような、前へのかがみと腕の角度（slamAim）。
   * かがむほど遠くへとどく（かがみを二分法で、そのかがみで頭が地面にふれる腕の角度も二分法で）。頭の位置（体から見て）を out に
   */
  private solveSlam(side: DollSide, dist: number, out: THREE.Vector3): THREE.Vector3 {
    const c = STRIKE_Y[side] * (this.scale / POSSESSED_SCALE)
    const p = this.tmp
    // かがみ lean で、頭が高さ c までおりる腕の角度（腕を真下より少し前へ下ろしても地面にとどかなければ -1）。
    // 腕の角度は体に対してなので、真下から前へ φ のとき arm = lean + φ（φ が負だと、うしろの地面をたたいてしまう）
    const armFor = (lean: number): number => {
      let lo = lean + SLAM_FWD_MIN
      let hi = lean + 1.6
      if (this.strikeLocal(side, lean, lo, p).y > c) return -1
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2
        if (this.strikeLocal(side, lean, mid, p).y > c) hi = mid
        else lo = mid
      }
      return lo
    }
    // 遠すぎれば、いちばんかがんだ姿勢に、近すぎれば、腕をまっすぐ下ろせるいちばん浅いかがみに落ち着く
    let lo = 0
    let hi = SLAM_LEAN_MAX
    let lean = hi
    const a0 = armFor(hi)
    let arm = a0 >= 0 ? a0 : hi + 0.8
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      const a = armFor(mid)
      if (a < 0) {
        lo = mid
        continue
      }
      this.strikeLocal(side, mid, a, p)
      if (Math.hypot(p.x, p.z) < dist) lo = mid
      else hi = mid
      lean = mid
      arm = a
    }
    this.slamAim.lean = lean
    this.slamAim.arm = arm
    this.strikeLocal(side, lean, arm, out)
    // 骨組みを今の姿勢へ戻す
    this.applyPose(0)
    this.root.updateMatrixWorld(true)
    return out
  }

  /** ふりおろしの落ちる所（体の前、その手の側） */
  impactPoint(side: DollSide, out = new THREE.Vector3()): THREE.Vector3 {
    const s = this.scale / POSSESSED_SCALE
    const lx = (side === 'right' ? 1.3 : -1.3) * s
    const lz = -(this.kneeling > 0.5 ? 3.0 : 3.5) * s
    const yaw = this.root.rotation.y
    return out.set(this.root.position.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), Math.max(0, this.root.position.y), this.root.position.z - lx * Math.sin(yaw) + lz * Math.cos(yaw))
  }

  /** 鐘の衝撃波。広がりはじめるまでの秒を返す（できなければ -1） */
  bellWave(): number {
    if (!this.ready) return -1
    this.walkTarget = null
    this.struck = true
    this.enter('bellUp')
    return (T.bellUp + T.bellHit) / this.rage
  }

  /** 足ぶみの地ひびき（人形のまわりに赤い輪 → ドン → 左ひざがロック）。ドンまでの秒を返す（できなければ -1） */
  stomp(): number {
    if (!this.ready || this.gearStopped[1]) return -1
    this.walkTarget = null
    this.struck = true
    this.stompWarn.show(this.root.position.clone().setY(Math.max(0, this.root.position.y)), STOMP_RADIUS)
    this.enter('stompUp')
    return T.stompUp / this.rage
  }

  /** 大技：鐘をかかげて力をためる（胸の戸がひらく）→ 輪の衝撃波を 2 つ → つかれて止まる。1 つ目の輪までの秒を返す */
  charge(): number {
    if (!this.ready) return -1
    this.walkTarget = null
    this.struck = true
    this.enter('chargeUp')
    return T.chargeUp / this.rage
  }

  /** 衝撃波が広がっているか（大技の 2 つ目を待っている間も） */
  get wavesActive(): boolean {
    return this.pendingWave >= 0 || this.waves.some((w) => w.r >= 0)
  }

  /**
   * p（足元）が衝撃波の輪に当たっているか。当たっていれば、その輪の中心（飛ばされる向きの元）、でなければ null。
   * grounded：地面にいるか（衝撃波はジャンプでよけられる）。ふりおろし・足ぶみは onImpact のときに一度だけ判定する
   */
  waveHit(p: THREE.Vector3, grounded: boolean, playerY = p.y): THREE.Vector3 | null {
    for (const w of this.waves) {
      if (w.r < 0) continue
      const d = Math.hypot(p.x - w.center.x, p.z - w.center.z)
      if (Math.abs(d - w.r) > BELL_WAVE.width * 0.5) continue
      if (grounded || playerY - w.center.y < BELL_WAVE.height * 0.6) return w.center
    }
    return null
  }

  /** 衝撃波を 1 つ出す（足もとから） */
  private startWave(): void {
    const w = this.waves.find((x) => x.r < 0) ?? this.waves[0]
    w.center.set(this.root.position.x, Math.max(0, this.root.position.y), this.root.position.z)
    w.r = 1.5 * this.scale
    this.onImpact?.({ kind: 'bell', pos: w.center.clone(), radius: w.r })
  }

  /** 衝撃波・予告を全部消す */
  private clearAttackFx(): void {
    this.warn.set(0, 0, 0)
    this.stompWarn.set(0, 0, 0)
    this.pendingWave = -1
    for (const w of this.waves) {
      w.r = -1
      w.fx.set(w.center, 0, 0)
    }
  }

  /** 体の中に入りこんだ点を外へ押し出す（足元の円）。押し出したら新しい位置、そうでなければ null */
  pushOut(p: THREE.Vector3, radius = 0.35, out = new THREE.Vector3()): THREE.Vector3 | null {
    const r = 1.45 * this.scale + radius
    const dx = p.x - this.root.position.x
    const dz = p.z - this.root.position.z
    const d = Math.hypot(dx, dz)
    if (d >= r || this.onPedestal) return null
    const k = d > 1e-3 ? r / d : 1
    return out.set(this.root.position.x + (d > 1e-3 ? dx * k : r), p.y, this.root.position.z + (d > 1e-3 ? dz * k : 0))
  }

  /** 歯車を止める・動かす（止まると、つながる手足がとまる） */
  setGearStopped(i: number, on = true): void {
    this.gearStopped[i] = on
    if (i === 1 && on) {
      this.walkTarget = null
      if (this.state === 'walk') this.enter('stand')
    }
  }

  gearIsStopped(i: number): boolean {
    return this.gearStopped[i]
  }

  /** 次につかむ歯車を光らせる（null で消す）。照準もその歯車に合いやすくする（ほかの歯車にはまず吸いつかない） */
  setGearHighlight(i: number | null): void {
    this.highlight = i
    this.targets.forEach((t, k) => (t.priority = k === i ? 1 : 0))
  }

  /** つかまれて保持されている歯車の力み（0〜1）。人形があばれる */
  setGearStrain(i: number, k: number): void {
    this.gearStrain[i] = clamp01(k)
  }

  /** 怒る（攻撃が速くなる）。1 でふつう */
  setRage(k: number): void {
    this.rage = Math.max(1, Math.min(1.6, k))
  }

  /** 止まって、影がはがれる（胸の歯車を止めたあと）。終わると resolve */
  collapse(): Promise<void> {
    this.walkTarget = null
    this.held = false
    this.clearAttackFx()
    this.enter('collapse')
    return this.waitState()
  }

  /**
   * 歯車をつかまれた（on）・はなされた（off）。つかまれている間は、攻撃（予告・衝撃波）を消して、すきの姿勢のまま止まる
   * （すきの時間も進まない）。大技のためでつかまれたら、そこでつかれた姿に。すきでない所でつかまれたら、立ったまま
   */
  grabbed(on: boolean): void {
    this.held = on
    if (!on) return
    this.walkTarget = null
    this.struck = true
    this.clearAttackFx()
    if (this.state === 'chargeUp') this.enter('tired')
    else if (this.opening === null && (this.attacking || this.state === 'walk')) this.enter('stand')
  }

  /** 引っぱられて、すきが終わる（よろけて立ち直る）。ふりほどいたときも */
  stagger(): void {
    this.held = false
    this.stuckSec = 0
    this.clearAttackFx()
    if (this.attacking || this.state === 'walk') this.enter('stand')
  }

  /** 歯車を引っぱった回数（見た目：少しずつ外へとび出て、かたむく） */
  setGearHits(i: number, n: number): void {
    this.gearHits[i] = n
  }

  /** 戦いをやり直す（体力 0 から戻ったとき）：攻撃と衝撃波を消し、台座の前に立たせる。止めた歯車はそのまま */
  resetFight(): void {
    this.walkTarget = null
    this.struck = true
    this.faceTarget = null
    this.held = false
    this.stuckSec = 0
    this.clearAttackFx()
    this.gearStrain.fill(0)
    this.onPedestal = false
    const g = this.groundFront(this.tmp2)
    this.root.position.copy(g)
    this.root.rotation.y = this.home.x === g.x && this.home.z === g.z ? this.root.rotation.y : Math.atan2(-(g.x - this.home.x), -(g.z - this.home.z))
    this.enter('stand')
  }

  /** 止まって影がはがれたあとの姿に、その場でする（セーブから朝で始めるとき） */
  setDownInstant(): void {
    this.possessed = false
    this.possessK = 0
    this.scale = POSSESSED_SCALE
    this.onPedestal = false
    this.gearStopped.fill(true)
    this.gearStrain.fill(0)
    this.highlight = null
    this.held = false
    this.clearAttackFx()
    this.doorK = 1
    this.root.position.copy(this.groundFront(this.tmp2))
    this.kneeling = 1
    this.enter('down')
    this.mist.lift = 1
    // 姿勢もすぐに
    this.step(0)
    Object.assign(this.pose, this.want)
    this.applyPose(0)
  }

  /** ふだんの刻の鐘（鐘を持ち上げて木槌で打つ） */
  chime(): void {
    if (this.state === 'idle') this.enter('chime')
  }

  /** 文字盤の針（0〜1 で一周） */
  setDial(k: number): void {
    this.dialHand.rotation.z = -k * Math.PI * 2
  }

  /** 歯車のワールド位置（カメラの寄り先） */
  gearWorld(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return this.gears[i].getWorldPosition(out)
  }

  /** 頭のワールド位置 */
  headWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.head.getWorldPosition(out).add(this.tmp.set(0, 1.0 * this.scale, 0))
  }

  // -------------------------------------------------------------- 毎フレーム

  update(dt: number, _camera?: THREE.Camera): void {
    this.t += dt
    // つかまれている間は、すきの時間を進めない
    if (!this.held) this.st += dt
    this.step(dt)
    // 姿勢を目標へ寄せる（たたきつけは速く）
    const fast = this.state === 'slam' || this.state === 'bellHit'
    const k = Math.min(1, dt * (fast ? 22 : this.state === 'collapse' ? 3 : 6))
    const P = this.pose as Record<string, number>
    const W = this.want as Record<string, number>
    for (const key in W) P[key] += (W[key] - P[key]) * k
    // あばれる（保持されているとき）
    const strain = Math.max(this.gearStrain[0], this.gearStrain[1], this.gearStrain[2])
    this.struggleK += (strain - this.struggleK) * Math.min(1, dt * 6)
    const sh = this.struggleK * (0.06 + 0.04 * Math.sin(this.t * 23))
    this.applyPose(sh)
    // 歯車の回転・光
    const speed = this.state === 'down' ? 0 : this.possessed ? 2.6 * this.rage : 0.7
    const open = this.opening
    this.gears.forEach((g, i) => {
      if (!this.gearStopped[i]) g.rotation.z += dt * speed * (i % 2 ? -1 : 1) * (1 - this.gearStrain[i] * 0.85)
      else g.rotation.z += (Math.round(g.rotation.z / 0.4) * 0.4 - g.rotation.z) * Math.min(1, dt * 8)
      // 引っぱった回数だけ、外へとび出て、かたむく
      const out = this.gearStopped[i] ? 0 : this.gearHits[i]
      g.position.z += (-0.13 * out - g.position.z) * Math.min(1, dt * 10)
      g.rotation.x += (0.22 * out - g.rotation.x) * Math.min(1, dt * 10)
      // すき（つかめる）の 1 個をいちばん明るく。次の 1 個はうすい輪だけ（まだつかめない）。止めた歯車は青くひかえめに
      const isNext = this.highlight === i && !this.gearStopped[i]
      const hl = isNext && open === i ? 0.85 + 0.15 * Math.sin(this.t * 9) : 0
      const dim = isNext && open !== i ? 0.22 : 0
      const stopped = this.gearStopped[i] ? 1 : 0
      const rm = this.gearRings[i].material as THREE.MeshBasicMaterial
      rm.opacity = Math.max(hl, dim, stopped * 0.4, this.gearStrain[i] * 0.9)
      rm.color.setRGB(stopped ? 0.3 : 2.6, stopped ? 0.75 : 2.0 - this.gearStrain[i] * 0.8, stopped ? 1.6 : 0.6)
      this.gearRings[i].rotation.z = this.t * (stopped ? 0 : 1.5)
      ;(this.gearGlow[i].material as THREE.SpriteMaterial).opacity = hl * 0.8 + this.gearStrain[i] * 0.5
      const gm = this.mats.gears[i]
      gm.emissive.setRGB(1, 0.75, 0.25).multiplyScalar(hl * 1.1 + this.gearStrain[i] * 0.6)
      // 止めた歯車は色を落とす（真ちゅうの照り返しで、今の 1 個より目立たないように）
      gm.color.copy(GEAR_BRASS).multiplyScalar(stopped ? 0.45 : 1)
      if (stopped) gm.emissive.setRGB(0.06, 0.12, 0.26)
    })
    // 胸の戸：胸がすきのとき・止めたあとはひらく
    const doorWant = this.gearStopped[2] || open === 2 ? 1 : 0
    this.doorK += (doorWant - this.doorK) * Math.min(1, dt * 5)
    this.doors.forEach((d, k) => (d.rotation.y = (k === 0 ? 1 : -1) * DOOR_OPEN * ease(clamp01(this.doorK))))
    // 大技のためで光る鐘
    const cg = this.state === 'chargeUp' ? clamp01((this.st * this.rage) / T.chargeUp) : 0
    this.chargeGlow += (cg - this.chargeGlow) * Math.min(1, dt * 8)
    ;(this.bellGlow.material as THREE.SpriteMaterial).opacity = this.chargeGlow * (0.7 + 0.3 * Math.sin(this.t * 18))
    this.bellGlow.scale.setScalar(2.4 + this.chargeGlow * 2.4)
    this.key.rotation.z += dt * (this.state === 'down' ? 0 : this.possessed ? 3.2 : 0.8)
    this.pedestalGears.forEach((g, i) => (g.rotation.x += dt * (i ? -0.5 : 0.5)))
    // のりうつり：色を少し沈め、ひびをすみれ色に、目を光らせる、もや。
    // 顔・手・衣装の色が夜でも読めるよう、暗くしすぎない（ひびは模様。体の色をうばわない）
    const pk = this.possessK
    const pulse = 0.65 + 0.35 * Math.sin(this.t * 3.1)
    const dark = 1 - 0.12 * pk
    for (const m of [this.mats.kimono, this.mats.hakama, this.mats.skin, this.mats.lacquer, this.mats.wood, this.mats.gold, this.mats.bronze, this.mats.white]) {
      m.color.setRGB(dark, dark * (1 - 0.08 * pk), dark * (1 + 0.04 * pk))
      m.emissive.setRGB(0.55, 0.12, 1.0).multiplyScalar(pk * pulse * 0.45)
    }
    // 顔の前の補助灯：人形の正面、胸と顔のあいだの高さ
    {
      const yaw = this.root.rotation.y
      const ahead = 3.4 * this.scale
      this.faceLight.pos.set(this.root.position.x - Math.sin(yaw) * ahead, this.root.position.y + this.height * 0.6, this.root.position.z - Math.cos(yaw) * ahead)
      this.faceLight.intensity = FACE_LIGHT * pk
      this.fill.value = CAMERA_FILL * pk
    }
    for (const e of this.eyes) e.visible = pk > 0.3
    for (const d of this.eyeDots) d.visible = pk <= 0.3
    for (const g of this.eyeGlow) (g.material as THREE.SpriteMaterial).opacity = Math.max(0, pk - 0.3) * (0.7 + 0.3 * pulse)
    this.mist.amount = pk * (this.state === 'collapse' || this.state === 'down' ? Math.max(0, 1 - this.st / T.collapse) : 1)
    this.mist.update(dt, this.root.position, this.height, 1.9 * this.scale)
    // 衝撃波（大技の 2 つ目は少しあとから）
    if (this.pendingWave >= 0 && !this.held) {
      this.pendingWave -= dt
      if (this.pendingWave < 0) this.startWave()
    }
    for (const w of this.waves) {
      if (w.r < 0) continue
      w.r += dt * BELL_WAVE.speed * this.rage
      const a = w.r > BELL_WAVE.maxR - 3 ? Math.max(0, (BELL_WAVE.maxR - w.r) / 3) : 1
      w.fx.set(w.center, w.r, a)
      if (w.r >= BELL_WAVE.maxR) {
        w.r = -1
        w.fx.set(w.center, 0, 0)
      }
    }
    this.root.scale.setScalar(this.scale)
    this.root.updateMatrixWorld(true)
    this.updateTargets()
    this.hitGround()
  }

  /** たたきつける頭（木槌・鐘の口）のワールド位置 */
  strikeWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const A = this.side === 'right' ? this.armR : this.armL
    return A.hand.localToWorld(out.copy(STRIKE_LOCAL[this.side]))
  }

  /** ふりおろし：見えている頭が地面にとどいた瞬間に onImpact（たたいた所＝頭の真下） */
  private hitGround(): void {
    if (this.struck || (this.state !== 'slam' && this.state !== 'recover' && this.state !== 'stuck')) return
    const p = this.strikeWorld(this.strikeAt)
    const ground = Math.max(0, this.root.position.y)
    const c = STRIKE_Y[this.side] * (this.scale / POSSESSED_SCALE)
    // ふつうは頭が地面にふれたとき。とどかないまま腕を下ろしきったら、そこで（保険）
    if (p.y > ground + c + 0.3 && !((this.state === 'recover' || this.state === 'stuck') && this.st > 0.3)) return
    this.struck = true
    const at = p.clone().setY(ground)
    this.onImpact?.({ kind: 'swing', side: this.side, pos: at, radius: SWING_RADIUS })
    this.onStep?.(at)
  }

  private updateTargets(): void {
    for (let i = 0; i < 3; i++) {
      const g = this.gears[i]
      const d = this.targets[i]
      g.getWorldPosition(d.point)
      // 歯車の面の向き（-Z）を水平にしたもの（前の側からならつかめる）。ひざをつくと、ひざの歯車は下を向くので、そのときは人形の前
      g.getWorldQuaternion(this.q)
      const f = (d.facing as THREE.Vector3).set(0, 0, -1).applyQuaternion(this.q).setY(0)
      if (f.lengthSq() < 0.09) f.set(-Math.sin(this.root.rotation.y), 0, -Math.cos(this.root.rotation.y))
      f.normalize()
      d.radius = 0.5 * this.scale
    }
  }

  private enter(s: DollState): void {
    this.state = s
    this.st = 0
  }

  private waitState(): Promise<void> {
    this.resolve?.()
    return new Promise((r) => (this.resolve = r))
  }

  private finish(): void {
    const r = this.resolve
    this.resolve = null
    r?.()
  }

  private canMove(): boolean {
    return !this.gearStopped[1] && !this.gearStopped[2] && this.state !== 'collapse' && this.state !== 'down' && !this.onPedestal
  }

  /** 状態ごとの動き（目標の姿勢 want を決める） */
  private step(dt: number): void {
    const W = this.want
    Object.assign(W, REST)
    const s = this.st
    // 左ひざ：止めたら、ずっとつく。足ぶみのあとのロックの間も、ガクッとつく
    const kneel = this.gearStopped[1] || this.state === 'kneeLock'
    this.kneeling += ((kneel ? 1 : 0) - this.kneeling) * Math.min(1, dt * (this.state === 'kneeLock' ? 7 : 3))
    // 向きを変える
    if (this.faceTarget !== null && this.canTurn()) {
      let d = this.faceTarget - this.root.rotation.y
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      // ふりかぶっている間は速く向く（たたきつけるまでに、頭が予告の円の上に来るように）
      const turn = Math.sign(d) * Math.min(Math.abs(d), dt * (this.state === 'windup' ? 2.4 : 0.9) * this.rage)
      this.root.rotation.y += turn
      if (Math.abs(d) < 0.01) this.faceTarget = null
    }
    switch (this.state) {
      case 'idle': {
        // 台座の上：ゆっくり首をかしげ、鐘を胸の前に
        W.headZ = Math.sin(this.t * 0.6) * 0.08
        W.twist = Math.sin(this.t * 0.35) * 0.06
        W.armLX = 0.9
        W.elbowL = 0.9
        W.armRX = 0.5
        W.elbowR = 1.2
        break
      }
      case 'chime': {
        // 鐘を上げて、木槌で打つ（2 回）
        W.armLX = 1.5
        W.armLZ = -0.15
        W.elbowL = 0.4
        const hit = (s % 1.2) / 1.2
        W.armRX = 1.6 + (hit < 0.5 ? hit * 1.4 : (1 - hit) * 1.4) - 0.6
        W.armRZ = 0.5
        W.elbowR = 0.9
        W.headX = 0.15
        if (s > 2.6) this.enter('idle')
        break
      }
      case 'possessing': {
        // ふるえて、大きくなる
        const k = clamp01(s / T.possess)
        this.possessK = k
        this.scale = NORMAL_SCALE + (POSSESSED_SCALE - NORMAL_SCALE) * ease(k)
        W.roll = Math.sin(this.t * 31) * 0.05 * (1 - k * 0.5)
        W.headX = -0.35 * k
        W.armLX = 0.9 + 0.8 * k
        W.armRX = 0.5 + 1.0 * k
        W.armRZ = 0.12 + 0.5 * k
        W.armLZ = -0.1 - 0.5 * k
        W.lean = -0.15 * k
        if (s >= T.possess) {
          this.possessK = 1
          this.scale = POSSESSED_SCALE
          this.enter(this.onPedestal ? 'stand' : 'stand')
          this.finish()
        }
        break
      }
      case 'stepdown': {
        const k = clamp01(s / T.stepdown)
        const from = this.home
        const to = this.groundFront(this.tmp2)
        const kk = ease(k)
        this.root.position.set(from.x + (to.x - from.x) * kk, from.y + (to.y - from.y) * kk + Math.sin(k * Math.PI) * 1.6, from.z + (to.z - from.z) * kk)
        W.hipL = 0.6 * Math.sin(k * Math.PI)
        W.hipR = 0.6 * Math.sin(k * Math.PI)
        W.kneeL = -0.9 * Math.sin(k * Math.PI)
        W.kneeR = -0.9 * Math.sin(k * Math.PI)
        W.armLX = 1.2
        W.armRX = 1.2
        if (k >= 1) {
          this.onPedestal = false
          this.root.position.copy(to)
          this.onStep?.(this.root.position)
          this.enter('stand')
          this.finish()
        }
        break
      }
      case 'stand':
      case 'walk': {
        this.standPose(W)
        if (this.state === 'walk' && this.walkTarget && this.canMove()) {
          const p = this.root.position
          const dx = this.walkTarget.x - p.x
          const dz = this.walkTarget.z - p.z
          const d = Math.hypot(dx, dz)
          if (d < 0.3) {
            this.walkTarget = null
            this.enter('stand')
            break
          }
          this.faceTarget = Math.atan2(-dx, -dz)
          const sp = this.walkSpeed * this.rage * (this.scale / POSSESSED_SCALE)
          const step = Math.min(d, sp * dt)
          p.x += (dx / d) * step
          p.z += (dz / d) * step
          this.walkPhase += dt * sp * 2.2
          const sw = Math.sin(this.walkPhase)
          W.hipL = 0.42 * sw
          W.hipR = -0.42 * sw
          W.kneeL = -0.6 * Math.max(0, -Math.cos(this.walkPhase))
          W.kneeR = -0.6 * Math.max(0, Math.cos(this.walkPhase))
          W.y = Math.abs(Math.cos(this.walkPhase)) * 0.12 - 0.06
          W.roll = sw * 0.05
          W.armLX = 0.6 - sw * 0.25
          W.armRX = (this.gearStopped[0] ? 0.05 : 0.6) + sw * 0.25
          const sign = Math.sign(sw)
          if (sign !== this.lastStepSign) {
            this.lastStepSign = sign
            this.onStep?.(this.root.position)
          }
        } else if (this.state === 'walk') this.enter('stand')
        break
      }
      case 'windup': {
        const k = clamp01((s * this.rage) / T.windup)
        this.standPose(W)
        this.armWindup(W, this.side, ease(k))
        this.warn.set(k, Math.min(1, k * 4), this.t)
        if (k >= 1) this.enter('slam')
        break
      }
      case 'slam': {
        const k = clamp01((s * this.rage) / T.slam)
        this.standPose(W)
        this.armSlam(W, this.side, k)
        this.warn.set(1, 1, this.t)
        // 地面をたたくのは、見えている頭が地面にとどいたとき（update の hitGround）。木槌はそのまま地面にささる
        if (k >= 1) this.enter(this.stuckSec > 0 ? 'stuck' : 'recover')
        break
      }
      case 'stuck': {
        // 木槌が地面にささって、ぬけない：ぐいぐい引っぱる（肩の歯車が見える）
        this.standPose(W)
        this.armSlam(W, this.side, 1)
        const tug = Math.max(0, Math.sin(this.t * 6.5)) * (this.held ? 0 : 1)
        W.lean += 0.06 * tug
        W.twist -= 0.08 * tug
        W.headX += 0.1
        this.warn.set(1, Math.max(0, 1 - s * 2.5), this.t)
        if (s >= this.stuckSec) {
          this.stuckSec = 0
          this.enter('recover')
        }
        break
      }
      case 'recover': {
        const k = clamp01((s * this.rage) / T.recover)
        this.standPose(W)
        // 腕を地面に置いたまま少し休む → 戻す
        if (k < 0.6) this.armSlam(W, this.side, 1)
        this.warn.set(1, Math.max(0, 1 - k * 3), this.t)
        if (k >= 1) this.enter('stand')
        break
      }
      case 'bellUp': {
        const k = ease(clamp01((s * this.rage) / T.bellUp))
        this.standPose(W)
        // 鐘を胸の前に掲げ、木槌をふりかぶる（右肩が止まっていれば鐘を高く上げる）
        W.armLX = 0.6 + 1.6 * k
        W.armLZ = -0.1 - 0.2 * k
        W.elbowL = 0.6 - 0.4 * k
        if (!this.gearStopped[0]) {
          W.armRX = 0.35 + 2.4 * k
          W.armRZ = 0.12 + 0.4 * k
          W.elbowR = 0.9 - 0.5 * k
        } else W.armLX = 0.6 + 2.6 * k
        W.lean = -0.12 * k
        if (k >= 1) this.enter('bellHit')
        break
      }
      case 'bellHit': {
        const k = clamp01((s * this.rage) / T.bellHit)
        this.standPose(W)
        W.armLX = 2.2
        W.armLZ = -0.3
        W.elbowL = 0.2
        if (!this.gearStopped[0]) {
          W.armRX = 2.75 - 1.6 * k
          W.armRZ = 0.52 - 0.5 * k
          W.elbowR = 0.4
        } else {
          // 鐘を地面にたたきつける
          W.armLX = 3.2 - 2.4 * k
          W.lean = 0.35 * k
        }
        if (k >= 1) {
          this.startWave()
          this.enter('recover')
          this.side = 'left'
        }
        break
      }
      case 'stompUp': {
        // 左足を高く上げて、両うでを広げる（足もとに赤い輪）
        const k = clamp01((s * this.rage) / T.stompUp)
        const kk = ease(Math.min(1, k * 1.4))
        this.standPose(W)
        W.hipL = 1.25 * kk
        W.kneeL = -1.35 * kk
        W.lean = -0.12 * kk
        W.armLZ = -0.25 - 0.75 * kk
        if (!this.gearStopped[0]) W.armRZ = 0.35 + 0.7 * kk
        W.roll = -0.06 * kk
        this.stompWarn.set(k, Math.min(1, k * 4), this.t)
        if (k >= 1) this.enter('stompHit')
        break
      }
      case 'stompHit': {
        const k = clamp01((s * this.rage) / T.stompHit)
        this.standPose(W)
        W.hipL = 1.25 * (1 - k)
        W.kneeL = -1.35 * (1 - k)
        W.lean = 0.12 * k
        this.stompWarn.set(1, 1, this.t)
        if (k >= 1) {
          const at = this.root.position.clone().setY(Math.max(0, this.root.position.y))
          this.onImpact?.({ kind: 'stomp', pos: at, radius: STOMP_RADIUS })
          this.onStep?.(at)
          this.enter('kneeLock')
        }
        break
      }
      case 'kneeLock': {
        // 左ひざがロックして、ガクッとひざをつく（ひざの歯車が見える）。ぬこうとして、ゆれる
        this.standPose(W)
        W.lean = 0.15
        W.headX = 0.2
        W.roll = this.held ? 0 : Math.sin(this.t * 5) * 0.03
        this.stompWarn.set(1, Math.max(0, 1 - s * 2), this.t)
        if (s >= T.kneeLock) this.enter('stand')
        break
      }
      case 'chargeUp': {
        // 大技：鐘を高くかかげて、ぶるぶると力をためる（胸の戸がひらく）
        const k = clamp01((s * this.rage) / T.chargeUp)
        const kk = ease(Math.min(1, k * 1.8))
        this.standPose(W)
        W.armLX = 0.6 + 2.6 * kk
        W.armLZ = -0.3
        W.elbowL = 0.2
        if (!this.gearStopped[0]) {
          W.armRX = 0.8 + 2.0 * kk
          W.armRZ = 0.5
        }
        W.lean = -0.22 * kk
        W.headX = -0.3 * kk
        W.roll += Math.sin(this.t * 38) * 0.025 * k
        if (k >= 1) {
          // 1 つ目の輪、少しあとに 2 つ目
          this.startWave()
          this.pendingWave = T.wave2 / this.rage
          this.side = 'left'
          this.enter('tired')
        }
        break
      }
      case 'tired': {
        // つかれて、うなだれる（胸の戸はひらいたまま）
        this.standPose(W)
        const br = Math.sin(this.t * 2.2) * 0.04
        W.lean = 0.32 + br
        W.headX = 0.45
        W.armLX = 0.2
        W.elbowL = 0.25
        if (!this.gearStopped[0]) W.armRX = 0.15
        if (s >= T.tired) this.enter('stand')
        break
      }
      case 'collapse': {
        const k = ease(clamp01(s / T.collapse))
        // 両ひざをついて、うなだれる。影は上へはがれる
        this.kneelPose(W, 1, true)
        W.lean = 0.35 * k
        W.headX = 0.55 * k
        W.armLX = 0.15
        W.armRX = 0.1
        W.elbowL = 0.15
        W.elbowR = 0.15
        this.mist.lift = k
        this.possessK = 1 - clamp01((s - T.collapse * 0.45) / (T.collapse * 0.55))
        if (s >= T.collapse) {
          this.possessK = 0
          this.enter('down')
          this.finish()
        }
        break
      }
      case 'down': {
        this.kneelPose(W, 1, true)
        W.lean = 0.35
        W.headX = 0.55
        W.armLX = 0.15
        W.armRX = 0.1
        W.elbowL = 0.15
        W.elbowR = 0.15
        break
      }
    }
  }

  private canTurn(): boolean {
    return this.state === 'stand' || this.state === 'walk' || this.state === 'windup'
  }

  /** 立っているとき（のりうつったあと）の構え。ひざが止まっていれば左ひざをつく */
  private standPose(W: Pose): void {
    if (this.possessed) {
      W.lean = 0.08
      W.armLX = 0.6
      W.armLZ = -0.25
      W.elbowL = 0.7
      W.armRX = 0.8
      W.armRZ = 0.35
      W.elbowR = 0.9
      W.headX = 0.12 + Math.sin(this.t * 1.7) * 0.05
      W.roll = Math.sin(this.t * 1.1) * 0.03
    }
    if (this.gearStopped[0]) {
      // 右うではだらり
      W.armRX = 0.05
      W.armRZ = 0.1
      W.elbowR = 0.05
    }
    if (this.kneeling > 0.01) this.kneelPose(W, this.kneeling, false)
  }

  /** 左ひざをつく（both で両ひざ） */
  private kneelPose(W: Pose, k: number, both: boolean): void {
    W.y += -1.62 * k
    W.hipL = 0.05 * k
    W.kneeL = -1.5 * k
    W.hipR = both ? 0.05 * k : 1.35 * k
    W.kneeR = both ? -1.5 * k : -1.35 * k
  }

  private armWindup(W: Pose, side: DollSide, k: number): void {
    if (side === 'right') {
      W.armRX = 0.8 + 2.3 * k
      W.armRZ = 0.35 - 0.2 * k
      W.elbowR = 0.9 - 0.6 * k
      W.twist = -0.25 * k
    } else {
      W.armLX = 0.6 + 2.5 * k
      W.armLZ = -0.25 + 0.15 * k
      W.elbowL = 0.7 - 0.5 * k
      W.twist = 0.25 * k
    }
    W.lean = -0.18 * k
    W.headX = -0.15 * k
  }

  /** たたきつけ：ふりかぶった腕を、swing で決めた姿勢（slamAim）まで。頭は地面の予告の円に落ちる */
  private armSlam(W: Pose, side: DollSide, k: number): void {
    const kk = ease(k)
    const A = this.slamAim
    if (side === 'right') {
      W.armRX = 3.1 + (A.arm - 3.1) * kk
      W.armRZ = 0.15 + (SLAM_Z.right - 0.15) * kk
      W.elbowR = 0.3 + (SLAM_ELBOW - 0.3) * kk
      W.twist = -0.25 * (1 - kk)
    } else {
      W.armLX = 3.1 + (A.arm - 3.1) * kk
      W.armLZ = -0.1 + (SLAM_Z.left + 0.1) * kk
      W.elbowL = 0.2 + (SLAM_ELBOW - 0.2) * kk
      W.twist = 0.25 * (1 - kk)
    }
    W.lean = -0.18 + (A.lean + 0.18) * kk
    W.roll = 0
    W.headX = 0.25 * kk
  }

  private applyPose(shake: number): void {
    const P = this.pose
    this.body.position.y = P.y
    this.body.rotation.z = P.roll + shake
    // lean・headX は「前へ倒す」が正（上を向いた物の X 回転は正で後ろへ倒れるので符号を反す）
    this.torso.rotation.set(-(P.lean + shake * 0.5), P.twist, shake * 0.6)
    this.head.rotation.set(-P.headX, 0, P.headZ - shake)
    this.legL.hip.rotation.x = P.hipL
    this.legR.hip.rotation.x = P.hipR
    this.legL.knee.rotation.x = P.kneeL
    this.legR.knee.rotation.x = P.kneeR
    this.armR.shoulder.rotation.set(P.armRX, 0, P.armRZ)
    this.armR.elbow.rotation.x = P.elbowR
    this.armL.shoulder.rotation.set(P.armLX, 0, P.armLZ)
    this.armL.elbow.rotation.x = P.elbowL
  }

  /** 台座の当たり判定を外す（壊れた・撮影用）。今は台座は残す */
  addColliders(_col: ColliderList): void {}
}
