// v7 の人の形（手続きモデル）：トワ（大人・子ども）・トワの母・チャンダ・守り手のおばあさん・クメールの村人・おふじさん。
// 1970年のミチ（stages/expo1970/michi.ts）と同じ「関節で動かす」作りを、プリセットで着せかえできるようにしたもの。
// ・関節：腰・背・胸・首・頭・肩・ひじ・手・もも・ひざ。ポーズは関数で角度を出し、切りかえは 0.35 秒でまぜる
// ・材質は人ごとにトゥーン 1 つ（頂点色）。部品は関節ごとに 1 メッシュへまとめ、反転ハルの輪郭線も同じ描画で出す
// ・顔はキャンバスに描いた表情の並び（face.ts）。まばたきあり
// 既存の Character（world/characters.ts）と同じ形で返す（name は型の都合で CharacterName にそろえる）。
import * as THREE from 'three'
import type { Character, CharacterName, Pose } from '../../world/characters'
import { createToonMaterial, createPersonMaterial, PartSet, SHAPES, T, capsuleAB, lathe, innerShell, setToonRim, setToonSelfLight } from './toon'
import { faceTexture, facePatchGeometry, setFaceExpression, type Expression, type FaceStyle } from './face'
import { approach, disposeRoot, seeded } from './common'
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { paint } from '../../world/nexmax/geom'

export type { Expression } from './face'

export type PersonPreset = 'towa' | 'towaChild' | 'towaMother' | 'chanda' | 'khmerElder' | 'khmerVillager' | 'ofuji'

/** Character の Pose に、v7 の場面で使う身ぶりを足したもの */
export type PersonPose =
  | Pose
  /** ランプを空へかかげる（トワ） */
  | 'raiseLamp'
  /** 右手を前へのばす（setAim の相手へ） */
  | 'reach'
  /** 右手で指さす（setAim の相手へ） */
  | 'point'
  /** 腰に手をあてて大きく笑う（チャンダ） */
  | 'laugh'
  /** 刃を構える（チャンダ。刃は右手へ） */
  | 'guard'
  /** 両手を上げてよろこぶ */
  | 'cheer'
  /** 胸の前で手を合わせる */
  | 'pray'
  /** 地面にすわりこむ（ひざをかかえる） */
  | 'kneel'
  /** ベッドで上体を起こす（トワの母。root はベッドの上の腰の位置に置く） */
  | 'sitBed'
  /** おじぎ */
  | 'bow'
  /** 杖をつく（守り手のおばあさん） */
  | 'cane'
  /** うなだれる */
  | 'sad'

export type BladeState = 'whole' | 'broken' | 'none'

export type PersonOpts = {
  /** 背の高さ（m）。省略でプリセットの高さ */
  height?: number
  /** 村人の色ちがい（0..） */
  variant?: number
  /** 村人：女の人 */
  female?: boolean
  /** 軽い作り（ひじ・ひざを曲げない。描画の回数が少ない。群衆向け） */
  lite?: boolean
  /** ふちの光（暗い場面で形を見せる） */
  rim?: THREE.ColorRepresentation
  rimK?: number
  /** 影を落とす（既定 true） */
  castShadow?: boolean
}

export interface PersonCharacter extends Character {
  readonly preset: PersonPreset
  /** いまのポーズ */
  readonly pose: PersonPose
  setPose(p: PersonPose): void
  readonly expression: Expression
  /** 表情（まばたきは自動） */
  setExpression(e: Expression): void
  /** トワの仮面（外すと泣きそうな顔）。ほかの人は何もしない */
  setMask(on: boolean): void
  readonly masked: boolean
  /** チャンダの刃（whole：腰の鞘・構えると右手 / broken：折れたかけらを右手に / none：無し） */
  setBlade(b: BladeState): void
  readonly blade: BladeState
  /** 物を手に持たせる（null で外す。外した物は親から外れるだけで解放しない） */
  hold(obj: THREE.Object3D | null, hand?: 'L' | 'R'): void
  /** ランプを左手にさげる（Lamp の root を、いつも真下にぶら下がるつり手に付ける）。null で外す */
  holdLamp(lamp: { root: THREE.Object3D } | null): void
  /** 首を相手へ向ける（null で正面） */
  lookAt(target: THREE.Vector3 | null): void
  /** ふちの光（暗い場面で） */
  setRim(color: THREE.ColorRepresentation, k?: number): void
  /** 自分の色の光り方（暗い場面で少し上げる。既定 0.12） */
  setSelfLight(k: number): void
  /** 物を付ける場所 */
  readonly sockets: { handL: THREE.Object3D; handR: THREE.Object3D; head: THREE.Object3D; hip: THREE.Object3D; lamp: THREE.Object3D }
  /** 頭のてっぺんの高さ（名前の札・吹き出しの位置に） */
  readonly headTop: number
  dispose(): void
}

// ------------------------------------------------------------------ 体の寸法

type Spec = {
  H: number
  /** 頭身 */
  heads: number
  /** 股の高さ / 身長 */
  legK: number
  /** 肩の半幅 / 身長 */
  shoulder: number
  /** 股関節の半幅 / 身長 */
  hip: number
  /** 腕の長さ（上腕＋前腕）/ 身長 */
  armK: number
  /** 手足の太さの倍率 */
  limb: number
  /** 背中の丸み（前かがみ、ラジアン） */
  stoop: number
  /** 頭の横幅 / 縦 */
  headW: number
  child: boolean
}

type Dims = {
  hipY: number
  thigh: number
  shin: number
  footH: number
  footL: number
  torso: number
  waist: number
  chestY: number
  neckY: number
  neckLen: number
  headRy: number
  headRx: number
  headRz: number
  shoulderX: number
  shoulderY: number
  hipX: number
  upper: number
  fore: number
  handLen: number
  rThigh: number
  rShin: number
  rUpper: number
  rFore: number
}

function dims(s: Spec): Dims {
  const H = s.H
  const headH = H / s.heads
  const hipY = H * s.legK
  const footH = H * 0.04
  const legRest = hipY - footH
  const neckLen = headH * 0.26
  const torso = H - hipY - neckLen - headH * 0.98
  const k = s.limb * (H / 1.7)
  return {
    hipY,
    thigh: legRest * 0.5,
    shin: legRest * 0.5,
    footH,
    footL: H * 0.135,
    torso,
    waist: torso * 0.2,
    chestY: torso * 0.3,
    neckY: torso * 0.5,
    neckLen,
    headRy: headH * 0.5,
    headRx: headH * 0.5 * s.headW,
    headRz: headH * 0.5 * (s.headW + 0.04),
    shoulderX: H * s.shoulder,
    shoulderY: torso * 0.5 - H * 0.03,
    hipX: H * s.hip,
    upper: H * s.armK * 0.53,
    fore: H * s.armK * 0.47,
    handLen: headH * 0.42,
    rThigh: 0.068 * k * (s.child ? 1.1 : 1),
    rShin: 0.05 * k * (s.child ? 1.1 : 1),
    rUpper: 0.043 * k * (s.child ? 1.12 : 1),
    rFore: 0.036 * k * (s.child ? 1.12 : 1),
  }
}

// ------------------------------------------------------------------ 関節

const J = { hips: 0, spine: 1, chest: 2, neck: 3, head: 4, shL: 5, elL: 6, haL: 7, shR: 8, elR: 9, haR: 10, thL: 11, knL: 12, thR: 13, knR: 14 } as const
const NJ = 15
/** 角度（関節 × xyz）の後ろに、腰の上下・前後のずれ */
const SLOT_DY = NJ * 3
const SLOT_DZ = NJ * 3 + 1
const NSLOT = NJ * 3 + 2

type Rig = {
  root: THREE.Group
  body: THREE.Group
  joints: THREE.Group[]
  d: Dims
  sockets: { handL: THREE.Object3D; handR: THREE.Object3D; head: THREE.Object3D; hip: THREE.Object3D; lamp: THREE.Object3D }
}

function buildRig(name: string, d: Dims): Rig {
  const root = new THREE.Group()
  root.name = name
  const body = new THREE.Group()
  root.add(body)
  const g = (parent: THREE.Object3D, x: number, y: number, z = 0, n = '') => {
    const o = new THREE.Group()
    o.position.set(x, y, z)
    o.name = n
    parent.add(o)
    return o
  }
  const hips = g(body, 0, d.hipY, 0, 'hips')
  const spine = g(hips, 0, d.waist, 0, 'spine')
  const chest = g(spine, 0, d.chestY, 0, 'chest')
  const neck = g(chest, 0, d.neckY, 0, 'neck')
  const head = g(neck, 0, d.neckLen, 0, 'head')
  const shL = g(chest, -Math.max(0, d.shoulderX - 0.02), d.shoulderY, 0, 'shL')
  const elL = g(shL, 0, -d.upper, 0, 'elL')
  const haL = g(elL, 0, -d.fore, 0, 'haL')
  const shR = g(chest, Math.max(0, d.shoulderX - 0.02), d.shoulderY, 0, 'shR')
  const elR = g(shR, 0, -d.upper, 0, 'elR')
  const haR = g(elR, 0, -d.fore, 0, 'haR')
  const thL = g(hips, -d.hipX, -0.02, 0, 'thL')
  const knL = g(thL, 0, -d.thigh, 0, 'knL')
  const thR = g(hips, d.hipX, -0.02, 0, 'thR')
  const knR = g(thR, 0, -d.thigh, 0, 'knR')
  const sockL = g(haL, 0, -d.handLen * 0.45, -0.01, 'handL')
  const sockR = g(haR, 0, -d.handLen * 0.45, -0.01, 'handR')
  const lamp = g(sockL, 0, 0, 0, 'lampHanger')
  const hip = g(hips, -d.hipX * 1.9, d.waist * 0.35, 0.02, 'hipSocket')
  return {
    root,
    body,
    joints: [hips, spine, chest, neck, head, shL, elL, haL, shR, elR, haR, thL, knL, thR, knR],
    d,
    sockets: { handL: sockL, handR: sockR, head, hip, lamp },
  }
}

// ------------------------------------------------------------------ 服と体の部品

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

type Look = {
  skin: string
  /** 上腕・前腕の袖（null なら肌） */
  sleeveU: string | null
  sleeveF: string | null
  /** もも・すね（null なら肌） */
  legU: string | null
  legL: string | null
  shoe: string
  /** 胴の上（胸）と下（腰） */
  top: string
  bottom: string
}

/** 体の基本（胴・首・腕・脚・手・靴）を置く。服の色は look で */
function baseBody(ps: PartSet, r: Rig, s: Spec, L: Look, lite: boolean): void {
  const d = r.d
  const [hips, spine, chest, , head, shL, elL, , shR, elR, , thL, knL, thR, knR] = r.joints
  const fem = s.child ? 0.92 : 1
  // 腰（骨盤）
  ps.add(hips, SHAPES.sphere, L.bottom, T(0, 0.02, 0, 0, 0, 0, d.hipX * 1.95, d.waist * 0.95, d.hipX * 1.35))
  // 胴（腰〜肩）：断面を回した形を前後につぶす。腰の継ぎ目は重ねて隠す
  const tw = d.shoulderX * 0.72 * fem
  const prof: [number, number][] = [
    [d.hipX * 1.55, -d.chestY - d.waist * 0.6],
    [tw * 0.86, -d.chestY * 0.4],
    [tw * 1.05, d.neckY * 0.25],
    [tw * 1.12, d.neckY * 0.62],
    [tw * 0.95, d.neckY * 0.86],
    [tw * 0.45, d.neckY * 1.0],
  ]
  ps.add(chest, lathe(prof, 16), L.top, T(0, 0, 0, 0, 0, 0, 1, 1, 0.7))
  ps.add(spine, SHAPES.capsule, L.top, T(0, d.chestY * 0.35, 0, 0, 0, 0, tw * 0.8, d.chestY * 0.25, tw * 0.8 * 0.66))
  // 首
  ps.add(chest, SHAPES.capsule, L.skin, T(0, d.neckY + d.neckLen * 0.35, 0.004, 0, 0, 0, d.headRx * 0.38, d.neckLen * 0.4, d.headRx * 0.38))
  // 腕
  const arm = (sh: THREE.Object3D, el: THREE.Object3D, side: number) => {
    const ur = d.rUpper * (L.sleeveU ? 1.15 : 1)
    const fr = d.rFore * (L.sleeveF ? 1.15 : 1)
    // 肩の丸みから袖を連続させる。袖の端は丸いカプセルで閉じず、短い輪で示す。
    if (L.sleeveU) {
      const end = L.sleeveF ? -d.upper - fr * 0.35 : -d.upper * 0.8
      ps.add(sh, lathe([[ur * 0.94, end], [ur, -d.upper * 0.45], [ur * 1.12, -ur * 0.25], [ur * 0.8, ur * 0.65], [0.001, ur]], 16), L.sleeveU)
      if (!L.sleeveF) ps.add(sh, SHAPES.cyl, L.sleeveU, T(0, end, 0, 0, 0, 0, ur * 1.03, 0.008, ur * 1.03), false)
    } else ps.add(sh, SHAPES.capsule, L.skin, capsuleAB(V(0, 0, 0), V(0, -d.upper, 0), ur))
    const fj = lite ? sh : el
    const fy = lite ? -d.upper : 0
    if (L.sleeveF) {
      ps.add(fj, lathe([[fr, fy - d.fore * 0.94], [fr * 1.08, fy - d.fore * 0.45], [ur * 0.98, fy], [ur * 0.8, fy + fr * 0.65]], 16), L.sleeveF)
      ps.add(fj, SHAPES.cyl, L.sleeveF, T(0, fy - d.fore * 0.94, 0, 0, 0, 0, fr * 1.06, 0.008, fr * 1.06), false)
    } else ps.add(fj, SHAPES.capsule, L.skin, capsuleAB(V(0, fy + (L.sleeveU ? d.upper * 0.21 : 0), 0), V(0, fy - d.fore * 0.92, 0), fr))
    // 手（ミトン＋親指）
    const hy = fy - d.fore
    ps.add(fj, SHAPES.sphere, L.skin, T(0, hy - d.handLen * 0.42, -0.004, 0, 0, 0, d.rFore * 1.08, d.handLen * 0.55, d.rFore * 0.75))
    ps.add(fj, SHAPES.capsule, L.skin, capsuleAB(V(side * -0.004, hy - d.handLen * 0.12, -d.rFore * 0.6), V(side * -0.004, hy - d.handLen * 0.45, -d.rFore * 1.05), d.rFore * 0.32))
  }
  arm(shL, elL, -1)
  arm(shR, elR, 1)
  // 脚
  const leg = (th: THREE.Object3D, kn: THREE.Object3D) => {
    ps.add(th, SHAPES.capsule, L.legU ?? L.skin, capsuleAB(V(0, 0, 0), V(0, -d.thigh, 0), d.rThigh))
    const kj = lite ? th : kn
    const ky = lite ? -d.thigh : 0
    ps.add(kj, SHAPES.capsule, L.legL ?? L.skin, capsuleAB(V(0, ky, 0), V(0, ky - d.shin + d.rShin * 0.4, 0), d.rShin))
    // 靴（足首の少し前へ）
    ps.add(kj, SHAPES.sphere, L.shoe, T(0, ky - d.shin - d.footH * 0.15, -d.footL * 0.22, 0, 0, 0, d.rShin * 1.25, d.footH * 0.95, d.footL * 0.55))
  }
  leg(thL, knL)
  leg(thR, knR)
  // 頭
  ps.add(head, SHAPES.sphereHi, L.skin, T(0, d.headRy * 0.92, 0, 0, 0, 0, d.headRx, d.headRy, d.headRz))
  // 耳
  for (const e of [-1, 1]) ps.add(head, SHAPES.sphere, L.skin, T(e * d.headRx * 0.97, d.headRy * 0.88, d.headRz * 0.05, 0, 0, 0, d.headRx * 0.14, d.headRy * 0.22, d.headRx * 0.1))
}

/** 頭の中心（顔・髪の基準） */
function headC(d: Dims): THREE.Vector3 {
  return V(0, d.headRy * 0.92, 0)
}

/** 髪のかぶり（頭より少し大きい球）。前は額まで、横と後ろは cover・back まで（顔はあける） */
function hairCap(ps: PartSet, head: THREE.Object3D, d: Dims, color: string, opts: { cover?: number; back?: number; grow?: number; front?: number } = {}): void {
  const c = headC(d)
  const k = 1 + (opts.grow ?? 0.07)
  const S = (g: THREE.BufferGeometry) => ps.add(head, g, color, T(c.x, c.y, c.z, 0, 0, 0, d.headRx * k, d.headRy * k, d.headRz * k))
  // てっぺん（額の線まで、ぐるり）
  const front = (opts.front ?? 0.33) * Math.PI
  S(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, front))
  // 横と後ろ（顔の前 ±0.95 rad はあける）。横は cover、後ろは back の深さまで
  const open = 0.95
  const side = (opts.cover ?? 0.52) * Math.PI
  S(new THREE.SphereGeometry(1, 20, 10, -Math.PI / 2 + open, Math.PI * 2 - open * 2, front - 0.02, side - front + 0.02))
  const back = (opts.back ?? 0.75) * Math.PI
  if (back > side) S(new THREE.SphereGeometry(1, 14, 8, Math.PI * 0.18, Math.PI * 0.64, side - 0.03, back - side + 0.03))
}

/** 前髪（ふさを額に並べる）。spikes：先のとがった房 */
function bangs(ps: PartSet, head: THREE.Object3D, d: Dims, color: string, n = 5, len = 0.5, spread = 1, tilt = 0, base = 0.42): void {
  const c = headC(d)
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : (i / (n - 1)) * 2 - 1
    const a = u * 0.62 * spread
    const x = Math.sin(a) * d.headRx * 1.02
    const z = -Math.cos(a) * d.headRz * 1.02
    const y = c.y + d.headRy * base
    const l = d.headRy * len * (1 - Math.abs(u) * 0.25)
    ps.add(head, SHAPES.cone, color, T(x, y - l * 0.4, z, Math.PI + 0.16, a, u * 0.25 + tilt, d.headRx * 0.2, l, d.headRx * 0.08))
  }
}

/** とがった房（髪のはね） */
function tuft(ps: PartSet, head: THREE.Object3D, d: Dims, color: string, ax: number, ay: number, len: number, w = 0.22): void {
  const c = headC(d)
  const dir = V(Math.sin(ax) * Math.cos(ay), Math.sin(ay), -Math.cos(ax) * Math.cos(ay)).normalize()
  const base = c.clone().add(V(dir.x * d.headRx * 0.88, dir.y * d.headRy * 0.88, dir.z * d.headRz * 0.88))
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir)
  const m = new THREE.Matrix4().compose(base.add(dir.clone().multiplyScalar(d.headRy * len * 0.4)), q, V(d.headRx * w, d.headRy * len, d.headRx * w * 0.6))
  ps.add(head, SHAPES.cone, color, m)
}

/** スカート・すそ（腰の関節に。y0：上の高さ、y1：すその高さ） */
function skirt(ps: PartSet, hips: THREE.Object3D, top: number, bottom: number, r0: number, r1: number, color: string, lining: string | null, open = 0, zs = 0.85): void {
  const prof: [number, number][] = [
    [r1, bottom],
    [r0 + (r1 - r0) * 0.55, bottom + (top - bottom) * 0.45],
    [r0, top],
  ]
  const phi0 = open > 0 ? Math.PI + open : 0
  const phiLen = open > 0 ? Math.PI * 2 - open * 2 : Math.PI * 2
  const g = lathe(prof, 20, phi0, phiLen)
  ps.add(hips, g, color, T(0, 0, 0, 0, 0, 0, 1, 1, zs))
  if (lining) ps.add(hips, innerShell(g, 0.004), lining, T(0, 0, 0, 0, 0, 0, 1, 1, zs), false)
}

/** 帯（輪）を体に巻く。rx・rz：輪の半径、t：布の厚み（m）、h：帯の幅（上下、m）、tilt：ななめ（たすき） */
function band(ps: PartSet, joint: THREE.Object3D, y: number, rx: number, rz: number, t: number, h: number, color: string, tiltZ = 0, tiltX = 0): void {
  const k = Math.max(0.01, t / rx)
  const g = new THREE.TorusGeometry(1, k, 6, 28)
  // 横にねかせてから（X）、体の前後の軸（Z）でかたむける
  const m = new THREE.Matrix4()
    .makeTranslation(0, y, 0)
    .multiply(new THREE.Matrix4().makeRotationZ(tiltZ))
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 + tiltX))
    .multiply(new THREE.Matrix4().makeScale(rx, rz, h / k / 2))
  ps.add(joint, g, color, m)
}

// ------------------------------------------------------------------ プリセット

type Built = {
  spec: Spec
  face: { key: string; style: FaceStyle }
  defaultPose: PersonPose
  /** 頭のてっぺん（root から） */
  headTop: number
  extra?: (ctx: BuildCtx) => void
  line?: string
}

type BuildCtx = { ps: PartSet; r: Rig; s: Spec; lite: boolean; rnd: () => number; mats: THREE.Material[]; geos: THREE.BufferGeometry[]; out: PresetParts }

/** プリセットが作る、あとから動かす部品 */
type PresetParts = {
  mask?: THREE.Object3D
  blade?: { group: THREE.Group; whole: THREE.Object3D; broken: THREE.Object3D; sheathHilt: THREE.Object3D }
  staff?: THREE.Object3D
  coatSkirt?: THREE.Object3D
  skirt?: THREE.Object3D
}

const pick = <T,>(arr: readonly T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length]

function presetDef(preset: PersonPreset, o: PersonOpts): Built {
  const H = (h: number) => o.height ?? h
  switch (preset) {
    case 'towa':
      return {
        spec: { H: H(1.78), heads: 5.4, legK: 0.48, shoulder: 0.125, hip: 0.052, armK: 0.36, limb: 1.1, stoop: 0, headW: 0.84, child: false },
        face: { key: 'towa', style: { skin: '#f0d6c4', eye: '#5b4a6e', brow: '#1d1a24', blush: 0.18, eyeScale: 0.92, browW: 1.1 } },
        defaultPose: 'idle',
        headTop: 0,
        line: '#1a1420',
      }
    case 'towaChild':
      return {
        spec: { H: H(1.34), heads: 4.3, legK: 0.44, shoulder: 0.105, hip: 0.05, armK: 0.31, limb: 1.15, stoop: 0, headW: 0.92, child: true },
        face: { key: 'towaChild', style: { skin: '#f6dac6', eye: '#5b4a6e', brow: '#2a2230', blush: 0.45, eyeScale: 1.25 } },
        defaultPose: 'idle',
        headTop: 0,
      }
    case 'towaMother':
      return {
        spec: { H: H(1.62), heads: 5.5, legK: 0.47, shoulder: 0.1, hip: 0.056, armK: 0.35, limb: 0.88, stoop: 0, headW: 0.86, child: false },
        face: { key: 'towaMother', style: { skin: '#f4e0d2', eye: '#6a4a3a', brow: '#4a3326', blush: 0.15, lashes: true, eyeScale: 1.0 } },
        defaultPose: 'sitBed',
        headTop: 0,
      }
    case 'chanda':
      return {
        spec: { H: H(1.45), heads: 4.5, legK: 0.46, shoulder: 0.104, hip: 0.054, armK: 0.35, limb: 0.98, stoop: 0, headW: 0.9, child: true },
        face: { key: 'chanda', style: { skin: '#c4987a', eye: '#4a2c1a', brow: '#1b1414', blush: 0.3, lashes: true, eyeScale: 1.3 } },
        defaultPose: 'idle',
        headTop: 0,
      }
    case 'khmerElder':
      return {
        spec: { H: H(1.5), heads: 5.3, legK: 0.46, shoulder: 0.1, hip: 0.0616, armK: 0.35, limb: 0.9, stoop: 0.28, headW: 0.87, child: false },
        face: { key: 'khmerElder', style: { skin: '#b48a70', eye: '#3a2a20', brow: '#9a948c', blush: 0.15, wrinkles: true, eyeScale: 0.86, lashes: true } },
        defaultPose: 'cane',
        headTop: 0,
      }
    case 'ofuji':
      return {
        spec: { H: H(1.46), heads: 5.3, legK: 0.45, shoulder: 0.1, hip: 0.058, armK: 0.35, limb: 0.92, stoop: 0.28, headW: 0.88, child: false },
        face: { key: 'ofuji', style: { skin: '#f2d8c2', eye: '#4a3a30', brow: '#a8a29a', blush: 0.25, wrinkles: true, eyeScale: 0.84, glasses: '#8a5a3a' } },
        defaultPose: 'idle',
        headTop: 0,
      }
    case 'khmerVillager':
    default: {
      const v = o.variant ?? 0
      const female = o.female ?? v % 2 === 1
      const skin = pick(['#b48a6e', '#c49a7c', '#a87e62', '#cfa488'], v)
      return {
        spec: {
          H: H(female ? pick([1.52, 1.56, 1.5], v) : pick([1.64, 1.6, 1.68], v)),
          heads: 5.5,
          legK: 0.47,
          shoulder: female ? 0.1 : 0.114,
          hip: female ? 0.056 : 0.052,
          armK: 0.35,
          limb: 0.95,
          stoop: 0,
          headW: 0.87,
          child: false,
        },
        face: {
          key: `khmerVillager_${female ? 'f' : 'm'}_${skin}`,
          style: { skin, eye: '#3a2418', brow: '#1b1414', blush: female ? 0.3 : 0.12, lashes: female, eyeScale: 0.92 },
        },
        defaultPose: 'idle',
        headTop: 0,
      }
    }
  }
}

// ---------------------------------------------------------------- 着せかえ

function dressTowa(c: BuildCtx): void {
  const { ps, r, s } = c
  const d = r.d
  const [hips, , chest, , head, shL, elL, , shR, elR, , thL, knL, thR, knR] = r.joints
  const coat = '#252938'
  const coatHi = '#394052'
  const lining = '#49335f'
  const trim = '#6f6580'
  const skin = '#f0d6c4'
  const hair = '#1d1a24'
  baseBody(ps, r, s, { skin, sleeveU: coat, sleeveF: coat, legU: '#24222c', legL: '#24222c', shoe: '#121016', top: coat, bottom: '#24222c' }, c.lite)
  // コートの胸（ボタンの列）
  for (let i = 0; i < 4; i++) ps.add(chest, SHAPES.sphere, '#b9b4c8', T(d.shoulderX * 0.12, d.neckY * (0.75 - i * 0.22), -d.shoulderX * 0.48, 0, 0, 0, 0.011), false)
  // 高いえり
  const collar = lathe(
    [
      [d.headRx * 0.5, d.neckY - 0.01],
      [d.headRx * 0.62, d.neckY + d.neckLen * 0.9],
      [d.headRx * 0.72, d.neckY + d.neckLen * 1.4],
    ],
    18,
    Math.PI + 0.35,
    Math.PI * 2 - 0.7,
  )
  ps.add(chest, collar, coatHi, T(0, 0, 0.01, 0, 0, 0, 1, 1, 0.92))
  ps.add(chest, innerShell(collar, 0.003), lining, T(0, 0, 0.01, 0, 0, 0, 1, 1, 0.92), false)
  // 肩のケープ（肩をおおって胸の上まで。ふちに細い紫）
  const capeBottom = d.neckY * 0.42
  const cape = lathe(
    [
      [d.shoulderX * 1.18, capeBottom],
      [d.shoulderX * 1.16, d.neckY * 0.62],
      [d.shoulderX * 0.98, d.neckY * 0.86],
      [d.headRx * 0.62, d.neckY + 0.005],
    ],
    22,
  )
  ps.add(chest, cape, coatHi, T(0, 0, 0.004, 0, 0, 0, 1, 1, 0.66))
  ps.add(chest, innerShell(cape, 0.003), lining, T(0, 0, 0.004, 0, 0, 0, 1, 1, 0.66), false)
  band(ps, chest, capeBottom + 0.006, d.shoulderX * 1.18, d.shoulderX * 1.18 * 0.66, 0.005, 0.01, trim)
  // 袖口
  for (const el of [elL, elR]) if (!c.lite) ps.add(el, SHAPES.cyl, coatHi, T(0, -d.fore * 0.94, 0, 0, 0, 0, d.rFore * 1.35, 0.008, d.rFore * 1.35))
  // ベルト
  band(ps, hips, d.waist * 0.75, d.hipX * 2.0, d.hipX * 2.0 * 0.78, 0.02, 0.06, '#2b2633')
  ps.add(hips, SHAPES.box, '#b9b4c8', T(0, d.waist * 0.75, -d.hipX * 1.62, 0, 0, 0, 0.05, 0.035, 0.012), false)
  // コートのすそ（前が開いている）。ひざ下まで
  const skirtJ = new THREE.Group()
  skirtJ.name = 'coatSkirt'
  hips.add(skirtJ)
  skirt(ps, skirtJ, d.waist * 0.7, -(d.thigh + d.shin * 0.55), d.hipX * 2.05, d.hipX * 3.6, coat, lining, 0.42, 0.82)
  // 前開きに沿う折り返し。横線よりも縦のシルエットを読ませる。
  for (const sd of [-1, 1]) {
    const y0 = d.waist * 0.7
    const y1 = -(d.thigh + d.shin * 0.55)
    const a = V(sd * Math.sin(0.42) * d.hipX * 2.05, y0, -Math.cos(0.42) * d.hipX * 2.05 * 0.82)
    const b = V(sd * Math.sin(0.42) * d.hipX * 3.6, y1, -Math.cos(0.42) * d.hipX * 3.6 * 0.82)
    ps.add(skirtJ, SHAPES.capsule, coatHi, capsuleAB(a, b, 0.009), false)
  }
  c.out.coatSkirt = skirtJ
  // ブーツ（すねの下半分）
  for (const kn of [knL, knR]) if (!c.lite) ps.add(kn, SHAPES.capsule, '#121016', capsuleAB(V(0, -d.shin * 0.45, 0), V(0, -d.shin + 0.02, 0), d.rShin * 1.18))
  void thL
  void thR
  void shL
  void shR
  // 髪：くせのある黒髪（はねた房）
  hairCap(ps, head, d, hair, { cover: 0.55, back: 0.78, grow: 0.08 })
  bangs(ps, head, d, hair, 5, 0.36, 1.05, 0, 0.55)
  for (const [ax, ay, l] of [
    [-1.25, 0.25, 0.42],
    [1.25, 0.2, 0.42],
    [-0.6, 0.85, 0.5],
    [0.5, 0.9, 0.45],
    [2.4, 0.2, 0.6],
    [-2.4, 0.25, 0.6],
    [3.14, 0.05, 0.62],
  ] as const)
    tuft(ps, head, d, hair, ax, ay, l)
  // 頬を覆う湾曲した磁器の面。実際の目穴・8mmの厚み・鼻の稜線を作る。
  const shape = new THREE.Shape()
  shape.moveTo(0, 0.82)
  shape.bezierCurveTo(0.55, 0.84, 0.94, 0.55, 0.98, 0.12)
  shape.bezierCurveTo(0.93, -0.35, 0.45, -0.86, 0, -0.9)
  shape.bezierCurveTo(-0.45, -0.86, -0.93, -0.35, -0.98, 0.12)
  shape.bezierCurveTo(-0.94, 0.55, -0.55, 0.84, 0, 0.82)
  for (const sd of [-1, 1]) {
    const hole = new THREE.Path()
    hole.absellipse(sd * 0.39, 0.12, 0.22, 0.12, 0, Math.PI * 2, true, sd * 0.18)
    shape.holes.push(hole)
  }
  const mask = new THREE.Group()
  const mps = new PartSet()
  const blank = new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: false, curveSegments: 24, steps: 1 })
  // 大きな三角面を先に分割してから湾曲させ、面が頭の球へ食い込むのを防ぐ。
  const mg = new TessellateModifier(0.12, 5).modify(blank)
  blank.dispose()
  const originalNormal = mg.attributes.normal.clone()
  const pos = mg.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), depth = pos.getZ(i)
    const bulge = Math.sqrt(Math.max(0.12, 1 - (x * 0.88) ** 2 - (y * 0.82) ** 2))
    const nose = Math.exp(-x * x * 65 - (y + 0.08) ** 2 * 14) * 0.018
    pos.setXYZ(i, x * d.headRx * 0.9, y * d.headRy * 0.85, -bulge * d.headRz - 0.012 - depth - nose)
  }
  mg.computeVertexNormals()
  // 磁器の面は滑らかな法線、厚みの側面は稜線を残す。
  const smooth = new THREE.Vector3()
  const maskNormal = mg.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const sign = originalNormal.getZ(i)
    if (Math.abs(sign) < 0.5) continue
    const x = pos.getX(i) / (d.headRx * 0.9), y = pos.getY(i) / (d.headRy * 0.85)
    const bulge = Math.sqrt(Math.max(0.12, 1 - (x * 0.88) ** 2 - (y * 0.82) ** 2))
    const nose = Math.exp(-x * x * 65 - (y + 0.08) ** 2 * 14) * 0.018
    smooth.set((d.headRz * x * 0.7744 / bulge + x * 130 * nose) / (d.headRx * 0.9), (d.headRz * y * 0.6724 / bulge + (y + 0.08) * 28 * nose) / (d.headRy * 0.85), -1).normalize().multiplyScalar(sign)
    maskNormal.setXYZ(i, smooth.x, smooth.y, smooth.z)
  }
  const colors = new Float32Array(pos.count * 3)
  const normal = originalNormal
  const front = new THREE.Color('#eeeaf5'), side = new THREE.Color('#bcb5cb')
  for (let i = 0; i < pos.count; i++) (Math.abs(normal.getZ(i)) > 0.6 ? front : side).toArray(colors, i * 3)
  mg.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  mg.setAttribute('aOutline', new THREE.BufferAttribute(new Float32Array(pos.count), 1))
  const mmat = createPersonMaterial({ line: '#1a1420', side: THREE.DoubleSide })
  const shell = new THREE.Mesh(mg, mmat)
  mask.add(shell)
  c.mats.push(mmat)
  c.geos.push(mg)
  // 奥の黒で目穴を読ませる（肌が穴の奥へ見えないように）。
  for (const sd of [-1, 1]) mps.add(mask, SHAPES.sphere, '#171326', T(sd * d.headRx * 0.35, d.headRy * 0.1, -d.headRz * 0.95, 0, 0, sd * 0.18, d.headRx * 0.21, d.headRy * 0.115, 0.006), false)
  const tear = V(d.headRx * 0.35, -d.headRy * 0.1, -d.headRz * 1.04 - 0.012)
  mps.add(mask, SHAPES.capsule, '#705298', capsuleAB(tear, tear.clone().add(V(-0.005, -d.headRy * 0.35, 0.012)), 0.003), false)
  mps.bake(mmat, { name: 'maskDetail', castShadow: false })
  mask.position.copy(headC(d))
  mask.name = 'mask'
  head.add(mask)
  c.out.mask = mask

}

function dressTowaChild(c: BuildCtx): void {
  const { ps, r, s } = c
  const d = r.d
  const [hips, , chest, , head, , , , , , , , knL, , knR] = r.joints
  const shirt = '#7cc8f0'
  const shorts = '#2f4a7a'
  const hair = '#2a2230'
  baseBody(ps, r, s, { skin: '#f6dac6', sleeveU: shirt, sleeveF: null, legU: shorts, legL: null, shoe: '#e8503a', top: shirt, bottom: shorts }, c.lite)
  // 半ズボンのすそ（ももの上半分）
  for (const th of [r.joints[J.thL], r.joints[J.thR]]) ps.add(th, SHAPES.capsule, shorts, capsuleAB(V(0, 0, 0), V(0, -d.thigh * 0.5, 0), d.rThigh * 1.2))
  // シャツの胸の黄色い星（小さな印）
  const star = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + i * Math.PI / 5
    const rr = i % 2 ? 0.015 : 0.035
    if (i === 0) star.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else star.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  star.closePath()
  ps.add(chest, new THREE.ShapeGeometry(star), '#ffd44a', T(0, d.neckY * 0.55, -d.shoulderX * 0.62, 0, Math.PI, 0), false)
  // 白いくつした
  for (const kn of [knL, knR]) if (!c.lite) ps.add(kn, SHAPES.capsule, '#ffffff', capsuleAB(V(0, -d.shin * 0.78, 0), V(0, -d.shin + 0.015, 0), d.rShin * 1.08))
  // えりの線
  band(ps, chest, d.neckY * 0.97, d.headRx * 0.5, d.headRx * 0.42, 0.012, 0.03, '#ffffff')
  void hips
  // 髪：短く、てっぺんにアホ毛
  hairCap(ps, head, d, hair, { cover: 0.5, back: 0.72, grow: 0.08 })
  bangs(ps, head, d, hair, 5, 0.5, 1.0)
  tuft(ps, head, d, hair, 0.2, 1.3, 0.5, 0.16)
  tuft(ps, head, d, hair, -1.3, 0.3, 0.42)
  tuft(ps, head, d, hair, 1.3, 0.3, 0.42)
  tuft(ps, head, d, hair, 3.14, 0.2, 0.45)
}

function dressTowaMother(c: BuildCtx): void {
  const { ps, r, s } = c
  const d = r.d
  const [hips, , chest, , head] = r.joints
  const gown = '#f4e4ea'
  const shawl = '#a9cfb4'
  const hair = '#4a3326'
  baseBody(ps, r, s, { skin: '#f4e0d2', sleeveU: gown, sleeveF: gown, legU: gown, legL: gown, shoe: '#e9dfe4', top: gown, bottom: gown }, c.lite)
  // ねまきのすそ（足首まで）
  const sk = new THREE.Group()
  sk.name = 'skirt'
  hips.add(sk)
  skirt(ps, sk, d.waist * 0.5, -(d.thigh + d.shin * 0.9), d.hipX * 2.05, d.hipX * 2.9, gown, '#e4d0d8', 0, 0.85)
  c.out.skirt = sk
  // 肩かけ（うすい緑の編み物）
  const sh = lathe(
    [
      [d.shoulderX * 1.25, d.neckY * 0.35],
      [d.shoulderX * 1.22, d.neckY * 0.6],
      [d.shoulderX * 0.9, d.neckY * 0.88],
      [d.headRx * 0.6, d.neckY + 0.004],
    ],
    20,
    Math.PI + 0.3,
    Math.PI * 2 - 0.6,
  )
  ps.add(chest, sh, shawl, T(0, 0, 0.008, 0, 0, 0, 1, 1, 0.76))
  ps.add(chest, innerShell(sh, 0.003), '#8fb89a', T(0, 0, 0.008, 0, 0, 0, 1, 1, 0.76), false)
  // 長い髪（背中へ）
  hairCap(ps, head, d, hair, { cover: 0.56, back: 0.85, grow: 0.08 })
  const hc = headC(d)
  ps.add(head, SHAPES.capsule, hair, T(0, hc.y - d.headRy * 0.9, d.headRz * 0.55, -0.12, 0, 0, d.headRx * 0.95, d.headRy * 0.65, d.headRz * 0.32))
  for (const e of [-1, 1]) ps.add(head, SHAPES.capsule, hair, T(e * d.headRx * 0.9, hc.y - d.headRy * 0.6, -d.headRz * 0.1, 0, 0, e * 0.08, d.headRx * 0.22, d.headRy * 0.55, d.headRz * 0.25))
  bangs(ps, head, d, hair, 4, 0.45, 1.1, 0)
}

function dressChanda(c: BuildCtx): void {
  const { ps, r, s } = c
  const d = r.d
  const [hips, , chest, , head, , elL, , , elR, , , knL, , knR] = r.joints
  const top = '#dfad42'
  const sampot = '#b94c46'
  const gold = '#e7c577'
  const sash = '#cb6484'
  const hair = '#1b1414'
  const skin = '#c4987a'
  baseBody(ps, r, s, { skin, sleeveU: top, sleeveF: null, legU: sampot, legL: null, shoe: '#7a4a2a', top, bottom: sampot }, c.lite)
  // サンポット（腰布）：ふくらはぎまで、金のふち
  const sk = new THREE.Group()
  sk.name = 'skirt'
  hips.add(sk)
  const hem = -(d.thigh + d.shin * 0.55)
  const cloth = lathe(Array.from({ length: 6 }, (_, i): [number, number] => {
    const u = i / 5
    return [d.hipX * (2.4 - 0.7 * u + Math.sin(u * Math.PI) * 0.08), hem + (d.waist * 0.6 - hem) * u]
  }), 48)
  const cp = cloth.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < cp.count; i++) {
    const phi = Math.atan2(cp.getX(i), cp.getZ(i))
    const k = 1 + 0.025 * Math.cos(6 * phi)
    cp.setXYZ(i, cp.getX(i) * k, cp.getY(i), cp.getZ(i) * k)
  }
  cloth.computeVertexNormals()
  ps.add(sk, cloth, sampot, T(0, 0, 0, 0, 0, 0, 1, 1, 0.8))
  ps.add(sk, innerShell(cloth), '#913f3d', T(0, 0, 0, 0, 0, 0, 1, 1, 0.8), false)
  band(ps, sk, hem + 0.012, d.hipX * 2.38, d.hipX * 2.38 * 0.8, 0.012, 0.035, gold)
  // 前の折りかえし（サンポットのひだ）
  const fold = new THREE.PlaneGeometry(1, 1, 2, 5)
  const fp = fold.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < fp.count; i++) {
    const u = 0.5 - fp.getY(i)
    const x = fp.getX(i) * (0.045 - u * 0.018) + d.hipX * 0.4
    const y = d.waist * 0.6 + (hem * 0.87 - d.waist * 0.6) * u
    const rad = d.hipX * (1.7 + u * 0.7 * 0.87)
    const z = -Math.sqrt(Math.max(0, rad * rad - x * x)) * 0.8 - 0.006 - (1 - Math.abs(fp.getX(i)) * 2) * 0.006
    fp.setXYZ(i, x, y, z)
  }
  // 表を人物の正面（-Z）へ向ける。
  if (fold.index) {
    const ix = fold.index.array
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]]
  }
  fold.computeVertexNormals()
  ps.add(sk, fold, '#9d403d', undefined, false)
  c.out.skirt = sk
  // 金の帯
  band(ps, hips, d.waist * 0.62, d.hipX * 1.72, d.hipX * 1.72 * 0.8, 0.014, 0.045, gold)
  // たすき（左肩から右の腰へ）
  band(ps, chest, d.chestY * 0.1, d.shoulderX * 0.78, d.shoulderX * 0.55, 0.014, 0.07, sash, -0.62, 0.1)
  // 金のうでわ・足首の輪
  if (!c.lite) {
    for (const el of [elL, elR]) ps.add(el, new THREE.TorusGeometry(1, 0.28, 6, 16), gold, T(0, -d.fore * 0.75, 0, Math.PI / 2, 0, 0, d.rFore * 1.1), false)
    for (const kn of [knL, knR]) ps.add(kn, new THREE.TorusGeometry(1, 0.25, 6, 16), gold, T(0, -d.shin * 0.86, 0, Math.PI / 2, 0, 0, d.rShin * 1.1), false)
  }
  // 髪：頭の上でまとめたまげ＋金の冠の小さな塔
  const hc = headC(d)
  hairCap(ps, head, d, hair, { cover: 0.58, back: 0.76, grow: 0.07 })
  bangs(ps, head, d, hair, 5, 0.42, 1.05)
  ps.add(head, SHAPES.sphere, hair, T(0, hc.y + d.headRy * 1.08, d.headRz * 0.12, 0, 0, 0, d.headRx * 0.45, d.headRy * 0.4, d.headRx * 0.45))
  ps.add(head, new THREE.TorusGeometry(1, 0.22, 6, 18), gold, T(0, hc.y + d.headRy * 0.92, d.headRz * 0.12, Math.PI / 2, 0, 0, d.headRx * 0.4))
  ps.add(head, SHAPES.cone, gold, T(0, hc.y + d.headRy * 1.62, d.headRz * 0.12, 0, 0, 0, d.headRx * 0.18, d.headRy * 0.55, d.headRx * 0.18))
  ps.add(head, SHAPES.sphere, '#7fd8ff', T(0, hc.y + d.headRy * 1.95, d.headRz * 0.12, 0, 0, 0, d.headRx * 0.08), false)
  // 耳かざり
  for (const e of [-1, 1]) ps.add(head, SHAPES.sphere, gold, T(e * d.headRx * 0.98, hc.y - d.headRy * 0.12, d.headRz * 0.05, 0, 0, 0, d.headRx * 0.08), false)
  // 腰の鞘
  const sheath = new THREE.Group()
  sheath.name = 'sheath'
  sheath.position.set(-d.hipX * 2.05, d.waist * 0.35, 0.02)
  sheath.rotation.set(0.25, 0, -0.42)
  hips.add(sheath)
  const bl = s.H * 0.3
  ps.add(sheath, SHAPES.capsule, '#6b3f22', T(0, -bl * 0.5, 0, 0, 0, 0, 0.022, bl * 0.33, 0.012))
  ps.add(sheath, SHAPES.cone, gold, T(0, -bl - 0.012, 0, Math.PI, 0, 0, 0.022, 0.045, 0.014))
  // 刃（別の材質：アルンの青い石）
  const bmat = createPersonMaterial({ selfLight: 0.22, rim: '#bce7ff', rimK: 0.35, line: '#1c4a6a' })
  c.mats.push(bmat)
  const bps = new PartSet()
  const blade = new THREE.Group()
  blade.name = 'blade'
  const hilt = new THREE.Group()
  blade.add(hilt)
  bps.add(hilt, SHAPES.capsule, '#3a2414', capsuleAB(V(0, -0.075, 0), V(0, 0.0, 0), 0.016))
  bps.add(hilt, SHAPES.box, gold, T(0, 0.012, 0, 0, 0, 0, 0.075, 0.016, 0.03))
  bps.add(hilt, SHAPES.sphere, gold, T(0, -0.085, 0, 0, 0, 0, 0.022))
  const whole = new THREE.Group()
  whole.name = 'whole'
  blade.add(whole)
  // 中央の稜線・淡い刃先・暗い側面が続く石の刃。
  addStoneBlade(bps, whole, false, T(0, 0.02 + bl * 0.5, 0, 0, 0, 0, 0.075, bl, 0.075))
  const broken = new THREE.Group()
  broken.name = 'broken'
  blade.add(broken)
  addStoneBlade(bps, broken, true, T(0, 0.02 + bl * 0.2, 0, 0, 0, 0, 0.075, bl * 0.4, 0.075))
  bps.bake(bmat, { name: 'blade' })
  // 鞘に入っているとき見える柄（柄だけ）
  const sheathHilt = new THREE.Group()
  sheathHilt.name = 'sheathHilt'
  sheath.add(sheathHilt)
  c.out.blade = { group: blade, whole, broken, sheathHilt }
}

/** 刃の中央・刃先・厚みを同じ描画へまとめる。 */
function addStoneBlade(ps: PartSet, joint: THREE.Object3D, broken: boolean, matrix: THREE.Matrix4): void {
  const section: [number, number][] = [[-0.5, 0], [-0.34, -0.13], [0, -0.2], [0.34, -0.13], [0.5, 0], [0, 0.2]]
  const levels = broken ? [0, 0.5, 1] : [0, 0.65, 0.82, 1]
  const bins: number[][] = [[], [], []]
  const at = (j: number, k: number): THREE.Vector3 => {
    const u = levels[j]
    const [x, z] = section[k]
    const taper = !broken && u > 0.82 ? Math.max(0.001, (1 - u) / 0.18) : 1
    // 折れ口の大きいV字の欠け（幅の約1/3）。全長も通常の4割。
    const notch = broken && j === levels.length - 1 ? [0, -0.08, -0.36, -0.12, 0, -0.18][k] : 0
    return V(x * taper, u - 0.5 + notch, z * taper + u * u * 0.04)
  }
  const tri = (bin: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => bins[bin].push(...a.toArray(), ...b.toArray(), ...c.toArray())
  for (let k = 0; k < section.length; k++) {
    const next = (k + 1) % section.length
    const bin = k === 0 || k === 3 ? 1 : k < 4 ? 0 : 2
    for (let j = 0; j < levels.length - 1; j++) {
      const a = at(j, k), b = at(j, next), c = at(j + 1, k), d = at(j + 1, next)
      tri(bin, a, c, b); tri(bin, b, c, d)
    }
    if (broken) tri(2, at(levels.length - 1, k), V(0, 0.2, 0), at(levels.length - 1, next))
  }
  bins.forEach((positions, i) => {
    const facet = new THREE.BufferGeometry()
    facet.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    facet.computeVertexNormals()
    ps.add(joint, facet, ['#8fcbe0', '#e5f7ff', '#4d829e'][i], matrix)
    facet.dispose()
  })
}

function dressElder(c: BuildCtx): void {
  const { ps, r, s } = c
  const d = r.d
  const [hips, , chest, , head] = r.joints
  const robe = '#f4f2ea'
  const sbai = '#ead9a2'
  baseBody(ps, r, s, { skin: '#b48a70', sleeveU: robe, sleeveF: robe, legU: robe, legL: robe, shoe: '#8a6040', top: robe, bottom: robe }, c.lite)
  const sk = new THREE.Group()
  sk.name = 'skirt'
  hips.add(sk)
  skirt(ps, sk, d.waist * 0.6, -(d.thigh + d.shin * 0.95), d.hipX * 2.1, d.hipX * 3.0, robe, '#e2ded2', 0, 0.86)
  c.out.skirt = sk
  // 肩かけ（左肩から右の腰へ、幅広）
  band(ps, chest, d.chestY * 0.35, d.shoulderX * 0.82, d.shoulderX * 0.58, 0.02, 0.16, sbai, -0.68, 0.08)
  for (const sd of [-1, 1]) ps.add(chest, new RoundedBoxGeometry(0.065, 0.15, 0.018, 3, 0.008), sbai, T(sd * d.shoulderX * 0.55, d.neckY * 0.22 - 0.04, -d.shoulderX * 0.62, 0.1, 0, sd * -0.14), false)
  // 首の白い布
  band(ps, chest, d.neckY * 0.96, d.headRx * 0.52, d.headRx * 0.44, 0.02, 0.05, robe)
  // 短く刈った白髪
  hairCap(ps, head, d, '#d9d6d0', { cover: 0.5, back: 0.72, grow: 0.035 })
  // 杖（右手）：木の杖、先に小さな青い石
  const staff = new THREE.Group()
  staff.name = 'staff'
  const L = s.H * 0.98
  const sps = new PartSet()
  sps.add(staff, SHAPES.capsule, '#8a5a34', capsuleAB(V(0, L * 0.25, 0), V(0, -L * 0.72, 0), 0.016))
  sps.add(staff, new THREE.TorusGeometry(1, 0.3, 6, 14), '#d8b24a', T(0, L * 0.22, 0, Math.PI / 2, 0, 0, 0.026))
  const smat = createToonMaterial({ line: '#3a2414' })
  c.mats.push(smat)
  sps.bake(smat, { name: 'staff' })
  const stone = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fd8ff').multiplyScalar(1.6), toneMapped: false }))
  c.geos.push(stone.geometry)
  c.mats.push(stone.material as THREE.Material)
  stone.position.y = L * 0.25 + 0.045
  stone.scale.set(1, 1.5, 1)
  staff.add(stone)
  c.out.staff = staff
}

function dressOfuji(c: BuildCtx): void {
  const { ps, r, s } = c
  const d = r.d
  const [hips, , chest, , head] = r.joints
  const cardigan = '#925264'
  const blouse = '#f6f2ea'
  const skirtC = '#6e5f56'
  baseBody(ps, r, s, { skin: '#f2d8c2', sleeveU: cardigan, sleeveF: cardigan, legU: skirtC, legL: '#d8c8b8', shoe: '#5a4a40', top: cardigan, bottom: skirtC }, c.lite)
  const sk = new THREE.Group()
  sk.name = 'skirt'
  hips.add(sk)
  skirt(ps, sk, d.waist * 0.55, -(d.thigh + d.shin * 0.5), d.hipX * 2.0, d.hipX * 2.5, skirtC, '#5a4c44', 0, 0.86)
  c.out.skirt = sk
  // ブラウスの白いえり・カーディガンの前の線とボタン
  band(ps, chest, d.neckY * 0.95, d.headRx * 0.55, d.headRx * 0.46, 0.015, 0.04, blouse)
  ps.add(chest, SHAPES.box, blouse, T(0, d.neckY * 0.6, -d.shoulderX * 0.5, 0, 0, 0, d.shoulderX * 0.28, d.neckY * 0.7, 0.01), false)
  for (let i = 0; i < 4; i++) ps.add(chest, SHAPES.sphere, '#f0e2c0', T(d.shoulderX * 0.16, d.neckY * (0.55 - i * 0.24), -d.shoulderX * 0.5, 0, 0, 0, 0.01), false)
  ps.add(sk, new RoundedBoxGeometry(0.24, 0.42, 0.014, 3, 0.012), blouse, T(0, -0.18, -d.hipX * 1.88), false)
  band(ps, hips, d.waist * 0.5, d.hipX * 2, d.hipX * 1.7, 0.009, 0.025, blouse)
  // 白髪をうしろでおだんご
  const hc = headC(d)
  hairCap(ps, head, d, '#e4e1dc', { cover: 0.56, back: 0.78, grow: 0.07 })
  ps.add(head, SHAPES.sphere, '#dcd8d2', T(0, hc.y + d.headRy * 0.45, d.headRz * 0.95, 0, 0, 0, d.headRx * 0.42, d.headRy * 0.38, d.headRx * 0.38))
  ps.add(head, new THREE.TorusGeometry(1, 0.2, 6, 16), '#7a5a8a', T(0, hc.y + d.headRy * 0.45, d.headRz * 0.72, 0, 0, 0, d.headRx * 0.3), false)
  // 前髪は横に流す
  bangs(ps, head, d, '#e4e1dc', 3, 0.32, 0.9, 0.4)
}

function dressVillager(c: BuildCtx, o: PersonOpts): void {
  const { ps, r, s } = c
  const d = r.d
  const [hips, , chest, , head] = r.joints
  const v = o.variant ?? 0
  const female = o.female ?? v % 2 === 1
  const skin = pick(['#b48a6e', '#c49a7c', '#a87e62', '#cfa488'], v)
  const hair = '#1b1414'
  if (female) {
    const blouse = pick(['#f2e6c8', '#e8b8c8', '#c8e0f0', '#f0d080'], v >> 1)
    const sampot = pick(['#b33a4a', '#3a5aa8', '#d08a2a', '#4f8a5a'], v)
    baseBody(ps, r, s, { skin, sleeveU: blouse, sleeveF: null, legU: sampot, legL: sampot, shoe: '#6a4028', top: blouse, bottom: sampot }, c.lite)
    const sk = new THREE.Group()
    sk.name = 'skirt'
    hips.add(sk)
    skirt(ps, sk, d.waist * 0.55, -(d.thigh + d.shin * 0.85), d.hipX * 2.0, d.hipX * 2.6, sampot, null, 0, 0.86)
    band(ps, sk, -(d.thigh + d.shin * 0.85) + 0.015, d.hipX * 2.58, d.hipX * 2.58 * 0.86, 0.01, 0.03, '#e8c25a')
    c.out.skirt = sk
    band(ps, chest, d.chestY * 0.2, d.shoulderX * 0.8, d.shoulderX * 0.56, 0.012, 0.07, pick(['#e0457b', '#f0c552', '#ffffff', '#7a3a9a'], v + 1), -0.6, 0.1)
    const hc = headC(d)
    hairCap(ps, head, d, hair, { cover: 0.56, back: 0.8, grow: 0.07 })
    ps.add(head, SHAPES.sphere, hair, T(0, hc.y + d.headRy * 0.5, d.headRz * 0.92, 0, 0, 0, d.headRx * 0.45, d.headRy * 0.4, d.headRx * 0.42))
    bangs(ps, head, d, hair, 3, 0.3, 0.8)
  } else {
    const shirt = pick(['#ece4d2', '#6b8fb8', '#d9a441', '#9fb87a'], v >> 1)
    const pants = pick(['#7b2d3a', '#2f4f7a', '#8a6a2a', '#4a6a4a'], v)
    baseBody(ps, r, s, { skin, sleeveU: shirt, sleeveF: null, legU: pants, legL: null, shoe: '#6a4028', top: shirt, bottom: pants }, c.lite)
    // ひざ下までの巻きズボン（すそを少しふくらませる）
    for (const th of [r.joints[J.thL], r.joints[J.thR]]) ps.add(th, SHAPES.capsule, pants, capsuleAB(V(0, -d.thigh * 0.2, 0), V(0, -d.thigh * 1.02, 0), d.rThigh * 1.28))
    // クロマー（赤い布）を首か頭に
    const krama = pick(['#d64b3b', '#3a6ab8', '#d64b3b', '#e0a030'], v >> 1)
    if (v % 4 < 2) band(ps, chest, d.neckY * 0.92, d.headRx * 0.62, d.headRx * 0.55, 0.03, 0.07, krama)
    else band(ps, head, headC(d).y + d.headRy * 0.35, d.headRx * 1.06, d.headRz * 1.06, 0.02, 0.06, krama)
    hairCap(ps, head, d, hair, { cover: 0.5, back: 0.72, grow: 0.05 })
    bangs(ps, head, d, hair, 4, 0.28, 0.9)
  }
}

// ------------------------------------------------------------------ ポーズ

type PoseCtx = { t: number; d: Dims; spec: Spec; energy: number; aim: THREE.Vector3 | null; aimR: [number, number, number] | null }

function rest(o: Float32Array, s: Spec): void {
  o.fill(0)
  o[J.shL * 3 + 2] = -0.1
  o[J.shR * 3 + 2] = 0.1
  o[J.elL * 3] = 0.15
  o[J.elR * 3] = 0.15
  o[J.spine * 3] = -s.stoop * 0.6
  o[J.chest * 3] = -s.stoop * 0.5
  o[J.head * 3] = s.stoop * 0.7
}

const set3 = (o: Float32Array, j: number, x: number, y: number, z: number) => {
  o[j * 3] = x
  o[j * 3 + 1] = y
  o[j * 3 + 2] = z
}
const add3 = (o: Float32Array, j: number, x: number, y: number, z: number) => {
  o[j * 3] += x
  o[j * 3 + 1] += y
  o[j * 3 + 2] += z
}

/** そのポーズのとき、腕を歩きの振りにまかせない（L・R） */
function armsBusy(p: PersonPose): [boolean, boolean] {
  switch (p) {
    case 'hold':
    case 'pray':
    case 'crank':
    case 'cheer':
    case 'guard':
    case 'laugh':
      return [true, true]
    case 'raiseLamp':
      return [true, false]
    case 'wave':
    case 'reach':
    case 'point':
    case 'cane':
      return [false, true]
    default:
      return [false, false]
  }
}

/** 歩けないポーズ（すわる・ねる） */
const seated = (p: PersonPose) => p === 'sitBed' || p === 'kneel'

function posePose(o: Float32Array, p: PersonPose, c: PoseCtx): void {
  const t = c.t
  const d = c.d
  rest(o, c.spec)
  const breath = Math.sin(t * 2.1)
  add3(o, J.chest, breath * 0.012, 0, 0)
  switch (p) {
    case 'wave':
      set3(o, J.shR, 0.15, 0, 2.55 + Math.sin(t * 8) * 0.28)
      set3(o, J.elR, 0.25, 0, 0)
      add3(o, J.head, 0, 0, 0.08)
      add3(o, J.chest, 0, 0, -0.03)
      break
    case 'hold':
      set3(o, J.shL, 0.95, 0, 0.22)
      set3(o, J.shR, 0.95, 0, -0.22)
      set3(o, J.elL, 0.85, 0, 0)
      set3(o, J.elR, 0.85, 0, 0)
      break
    case 'raiseLamp':
      set3(o, J.shL, 0.2, 0, -2.75)
      set3(o, J.elL, 0.25, 0, 0)
      set3(o, J.shR, -0.1, 0, 0.18)
      add3(o, J.head, 0.32, 0, 0)
      add3(o, J.chest, 0.08, 0, 0.04)
      break
    case 'reach':
    case 'point': {
      if (c.aimR) set3(o, J.shR, c.aimR[0], c.aimR[1], c.aimR[2])
      else set3(o, J.shR, 1.45, 0.1, 0.05)
      set3(o, J.elR, p === 'reach' ? 0.12 : 0.02, 0, 0)
      add3(o, J.chest, -0.06, -0.12, 0)
      if (p === 'point') {
        set3(o, J.shL, -0.15, 0, -0.55)
        set3(o, J.elL, 1.5, 0, 0)
      }
      break
    }
    case 'laugh': {
      const b = Math.sin(t * 13)
      add3(o, J.chest, 0.16 + b * 0.04, 0, 0)
      add3(o, J.head, 0.22 + b * 0.03, 0, Math.sin(t * 3) * 0.06)
      o[SLOT_DY] = Math.abs(b) * 0.015
      set3(o, J.shL, -0.15, 0, -0.78)
      set3(o, J.shR, -0.15, 0, 0.78)
      set3(o, J.elL, 0.1, 0, 1.95)
      set3(o, J.elR, 0.1, 0, -1.95)
      break
    }
    case 'guard': {
      const k = Math.sin(t * 3) * 0.02
      set3(o, J.hips, 0, 0.35, 0)
      add3(o, J.chest, -0.06, -0.3, 0)
      add3(o, J.head, 0, -0.08, 0)
      set3(o, J.thL, 0.35, 0, -0.18)
      set3(o, J.knL, -0.45, 0, 0)
      set3(o, J.thR, -0.25, 0, 0.18)
      set3(o, J.knR, -0.3, 0, 0)
      o[SLOT_DY] = -d.hipY * 0.07 + k
      set3(o, J.shR, 1.1, 0.25, 0.1)
      set3(o, J.elR, 0.7, 0, 0)
      set3(o, J.shL, 0.75, 0, -0.35)
      set3(o, J.elL, 1.35, 0, 0)
      break
    }
    case 'cheer': {
      const b = Math.sin(t * 9)
      set3(o, J.shL, 0.1, 0, -2.6 - b * 0.15)
      set3(o, J.shR, 0.1, 0, 2.6 + b * 0.15)
      set3(o, J.elL, 0.3, 0, 0)
      set3(o, J.elR, 0.3, 0, 0)
      o[SLOT_DY] = Math.max(0, b) * 0.05
      add3(o, J.head, 0.15, 0, 0)
      break
    }
    case 'pray':
      set3(o, J.shL, 0.6, 0, 0.42)
      set3(o, J.shR, 0.6, 0, -0.42)
      set3(o, J.elL, 1.8, 0, 0)
      set3(o, J.elR, 1.8, 0, 0)
      add3(o, J.head, -0.18, 0, 0)
      break
    case 'kneel': {
      // 地面にすわりこむ（ひざを立て、うでをひざの上に）
      o[SLOT_DY] = -(d.hipY - d.rThigh * 1.1)
      set3(o, J.thL, 1.25, 0, -0.12)
      set3(o, J.thR, 1.25, 0, 0.12)
      set3(o, J.knL, -2.15, 0, 0)
      set3(o, J.knR, -2.15, 0, 0)
      add3(o, J.spine, -0.18, 0, 0)
      add3(o, J.chest, -0.1, 0, 0)
      add3(o, J.head, -0.28, 0, 0)
      set3(o, J.shL, 0.85, 0, 0.12)
      set3(o, J.shR, 0.85, 0, -0.12)
      set3(o, J.elL, 0.7, 0, 0)
      set3(o, J.elR, 0.7, 0, 0)
      break
    }
    case 'sitBed': {
      // 腰をベッドの面へ。脚は前へまっすぐ、上体は少し後ろ（まくら）へ
      o[SLOT_DY] = -(d.hipY - d.rThigh * 1.05)
      set3(o, J.thL, 1.57, 0, -0.03)
      set3(o, J.thR, 1.57, 0, 0.03)
      set3(o, J.knL, -0.05, 0, 0)
      set3(o, J.knR, -0.05, 0, 0)
      add3(o, J.spine, 0.22, 0, 0)
      add3(o, J.chest, 0.04, 0, 0)
      add3(o, J.head, -0.12, 0, Math.sin(t * 0.6) * 0.04)
      set3(o, J.shL, 0.85, -0.15, -0.42)
      set3(o, J.shR, 0.5, 0.12, -0.08)
      set3(o, J.elL, 0.72, 0, 0)
      set3(o, J.elR, 0.45, 0, 0)
      break
    }
    case 'bow':
      add3(o, J.spine, -0.5, 0, 0)
      add3(o, J.chest, -0.15, 0, 0)
      add3(o, J.head, -0.2, 0, 0)
      set3(o, J.shL, 0.35, 0, 0.25)
      set3(o, J.shR, 0.35, 0, -0.25)
      set3(o, J.elL, 0.45, 0, 0)
      set3(o, J.elR, 0.45, 0, 0)
      break
    case 'cane':
      set3(o, J.shR, 0.32, 0, 0.12)
      set3(o, J.elR, 0.55, 0, 0)
      set3(o, J.shL, 0.15, 0, -0.08)
      set3(o, J.elL, 0.5, 0, 0)
      break
    case 'crank': {
      const a = t * 4
      add3(o, J.spine, -0.25, 0, 0)
      add3(o, J.head, 0.2, 0, 0)
      set3(o, J.shR, 0.85 + Math.sin(a) * 0.22, 0, -0.1)
      set3(o, J.elR, 0.7 + Math.cos(a) * 0.25, 0, 0)
      set3(o, J.shL, 0.8, 0, 0.15)
      set3(o, J.elL, 0.95, 0, 0)
      break
    }
    case 'sad':
      add3(o, J.chest, -0.14, 0, 0)
      add3(o, J.head, -0.38, 0, 0)
      set3(o, J.shL, 0.05, 0, -0.04)
      set3(o, J.shR, 0.05, 0, 0.04)
      break
    case 'fire':
    case 'swing':
    case 'pulled':
      set3(o, J.shR, 1.4, 0, 0)
      break
    case 'idle':
    default: {
      // 立ち：首をゆっくり、元気な子は少しはずむ
      add3(o, J.head, Math.sin(t * 0.9) * 0.03, Math.sin(t * 0.5) * 0.12, 0)
      add3(o, J.shL, breath * 0.02, 0, 0)
      add3(o, J.shR, -breath * 0.02, 0, 0)
      if (c.energy > 0) {
        o[SLOT_DY] = Math.abs(Math.sin(t * 2.4)) * 0.012 * c.energy
        add3(o, J.shL, 0, 0, -0.08 * c.energy)
        add3(o, J.shR, 0, 0, 0.08 * c.energy)
      }
    }
  }
}

/** 歩き・走りの層（脚・腕の振り・腰の上下）を w の強さで重ねる */
function walkLayer(o: Float32Array, phase: number, w: number, run: number, busy: [boolean, boolean], d: Dims): void {
  if (w <= 0.001) return
  const amp = 0.48 + run * 0.32
  const sw = Math.sin(phase) * amp
  const lerpTo = (i: number, v: number) => (o[i] += (v - o[i]) * w)
  lerpTo(J.thL * 3, sw)
  lerpTo(J.thR * 3, -sw)
  lerpTo(J.thL * 3 + 2, -0.03)
  lerpTo(J.thR * 3 + 2, 0.03)
  lerpTo(J.knL * 3, -(0.12 + Math.max(0, Math.cos(phase)) * (0.85 + run * 0.6)))
  lerpTo(J.knR * 3, -(0.12 + Math.max(0, -Math.cos(phase)) * (0.85 + run * 0.6)))
  if (!busy[0]) {
    lerpTo(J.shL * 3, -sw * (0.75 + run * 0.3))
    lerpTo(J.elL * 3, 0.25 + run * 0.9)
  }
  if (!busy[1]) {
    lerpTo(J.shR * 3, sw * (0.75 + run * 0.3))
    lerpTo(J.elR * 3, 0.25 + run * 0.9)
  }
  lerpTo(J.hips * 3 + 1, Math.sin(phase) * 0.09)
  lerpTo(J.chest * 3 + 1, -Math.sin(phase) * 0.11)
  o[J.spine * 3] += (-0.04 - run * 0.2) * w
  o[SLOT_DY] += (Math.abs(Math.cos(phase)) * (0.028 + run * 0.03) - 0.012 - run * 0.02) * w * (d.hipY / 0.85)
}

// ------------------------------------------------------------------ 本体

const tmpQ = new THREE.Quaternion()
const tmpQ2 = new THREE.Quaternion()
const tmpV = new THREE.Vector3()
const tmpM = new THREE.Matrix4()
const tmpE = new THREE.Euler()
const DOWN = new THREE.Vector3(0, -1, 0)

/**
 * 人の形を作る。返り値は Character と同じ形（root・update(dt, speed)・setPose・handAnchor など）。
 * root は足もとが原点、-Z 向き。シーン（ステージの root）に足して使う
 */
export function createPerson(preset: PersonPreset, opts: PersonOpts = {}): PersonCharacter {
  const def = presetDef(preset, opts)
  const spec = def.spec
  const d = dims(spec)
  const r = buildRig(preset, d)
  const lite = opts.lite ?? false
  const mats: THREE.Material[] = []
  const geos: THREE.BufferGeometry[] = []
  const ps = new PartSet()
  const out: PresetParts = {}
  const ctx: BuildCtx = { ps, r, s: spec, lite, rnd: seeded((opts.variant ?? 0) + 7), mats, geos, out }
  switch (preset) {
    case 'towa':
      dressTowa(ctx)
      break
    case 'towaChild':
      dressTowaChild(ctx)
      break
    case 'towaMother':
      dressTowaMother(ctx)
      break
    case 'chanda':
      dressChanda(ctx)
      break
    case 'khmerElder':
      dressElder(ctx)
      break
    case 'ofuji':
      dressOfuji(ctx)
      break
    default:
      dressVillager(ctx, opts)
  }
  const mat = createPersonMaterial({ line: def.line ?? '#2a1a12', rim: opts.rim, rimK: opts.rimK })
  mats.push(mat)
  ps.bake(mat, { castShadow: opts.castShadow ?? true, name: preset })
  // 顔
  const ftex = faceTexture(def.face.key, def.face.style)
  const fmat = createPersonMaterial({ map: ftex, rim: opts.rim, rimK: opts.rimK })
  mats.push(fmat)
  const fg = facePatchGeometry()
  paint(fg, '#ffffff')
  fg.setAttribute('aOutline', new THREE.BufferAttribute(new Float32Array(fg.attributes.position.count), 1))
  geos.push(fg)
  const face = new THREE.Mesh(fg, fmat)
  face.position.copy(headC(d))
  face.scale.set(d.headRx, d.headRy, d.headRz)
  face.castShadow = false
  face.name = 'face'
  r.joints[J.head].add(face)
  // 刃・杖
  let bladeState: BladeState = 'none'
  if (out.blade) {
    const b = out.blade
    bladeState = 'whole'
    b.group.rotation.set(-Math.PI / 2, 0, 0)
  }
  if (out.staff) {
    r.sockets.handR.add(out.staff)
    out.staff.rotation.set(0.1, 0, -0.06)
  }

  // ---------------------------------------------------------------- 状態
  let pose: PersonPose = def.defaultPose
  let prevPose: PersonPose = pose
  let blend = 1
  let t = Math.random() * 10
  let phase = 0
  let walkW = 0
  let runK = 0
  let expr: Expression = preset === 'towa' ? 'cry' : preset === 'towaMother' ? 'sad' : 'neutral'
  let shown: Expression | null = null
  let blinkT = 2 + Math.random() * 3
  let blinking = 0
  let masked = preset === 'towa'
  let aim: THREE.Vector3 | null = null
  let look: THREE.Vector3 | null = null
  let lookYaw = 0
  let lookPitch = 0
  let lampSwing = 0
  let lampVel = 0
  const A = new Float32Array(NSLOT)
  const B = new Float32Array(NSLOT)
  const energy = preset === 'chanda' || preset === 'towaChild' ? 1 : 0

  const applyExpression = (e: Expression) => {
    if (e === shown) return
    shown = e
    setFaceExpression(ftex, e)
  }
  const bladePlace = () => {
    const b = out.blade
    if (!b) return
    const inHand = bladeState === 'broken' || (bladeState === 'whole' && pose === 'guard')
    // 鞘に入っているときは柄だけ見せる（刃は鞘の中）
    b.whole.visible = bladeState === 'whole' && inHand
    b.broken.visible = bladeState === 'broken'
    b.group.visible = bladeState !== 'none'
    if (inHand) {
      r.sockets.handR.add(b.group)
      b.group.position.set(0, -0.005, 0)
      b.group.rotation.set(-Math.PI / 2 + 0.2, 0, 0)
    } else {
      const sheath = r.joints[J.hips].getObjectByName('sheath')
      if (sheath) {
        sheath.add(b.group)
        // 鞘に入れる（柄が上に出る）
        b.group.position.set(0, 0.0, 0)
        b.group.rotation.set(Math.PI, 0, 0)
      }
    }
  }
  bladePlace()
  if (out.mask) {
    out.mask.visible = masked
    face.visible = !masked
  }

  const aimAngles = (): [number, number, number] | null => {
    if (!aim) return null
    const sh = r.joints[J.shR]
    r.root.updateMatrixWorld(true)
    tmpM.copy((sh.parent as THREE.Object3D).matrixWorld).invert()
    tmpV.copy(aim).applyMatrix4(tmpM).sub(sh.position)
    if (tmpV.lengthSq() < 1e-6) return null
    tmpV.normalize()
    tmpQ.setFromUnitVectors(DOWN, tmpV)
    tmpE.setFromQuaternion(tmpQ, 'XYZ')
    return [tmpE.x, tmpE.y, tmpE.z]
  }

  const writeJoints = (o: Float32Array) => {
    for (let j = 0; j < NJ; j++) r.joints[j].rotation.set(o[j * 3], o[j * 3 + 1], o[j * 3 + 2])
    r.joints[J.hips].position.y = d.hipY + o[SLOT_DY]
    r.joints[J.hips].position.z = o[SLOT_DZ]
  }

  const ch: PersonCharacter = {
    name: preset as CharacterName,
    preset,
    root: r.root,
    placeholder: true,
    height: spec.H,
    handAnchor: r.sockets.handR,
    sockets: r.sockets,
    headTop: d.hipY + d.waist + d.chestY + d.neckY + d.neckLen + d.headRy * 1.95,
    get pose() {
      return pose
    },
    get expression() {
      return expr
    },
    get masked() {
      return masked
    },
    get blade() {
      return bladeState
    },
    setPose(p: PersonPose) {
      if (p === pose) return
      prevPose = pose
      pose = p
      blend = 0
      bladePlace()
    },
    setAim(target: THREE.Vector3 | null) {
      aim = target ? target.clone() : null
    },
    setExpression(e: Expression) {
      expr = e
    },
    setMask(on: boolean) {
      if (!out.mask) return
      masked = on
      out.mask.visible = on
      face.visible = !on
    },
    setBlade(b: BladeState) {
      if (!out.blade) return
      bladeState = b
      bladePlace()
    },
    hold(obj: THREE.Object3D | null, hand: 'L' | 'R' = 'R') {
      const s = hand === 'L' ? r.sockets.handL : r.sockets.handR
      for (const c of [...s.children]) if (c !== r.sockets.lamp && c !== out.staff && c !== out.blade?.group) s.remove(c)
      if (obj) s.add(obj)
    },
    holdLamp(lamp: { root: THREE.Object3D } | null) {
      for (const c of [...r.sockets.lamp.children]) r.sockets.lamp.remove(c)
      if (lamp) r.sockets.lamp.add(lamp.root)
    },
    lookAt(target: THREE.Vector3 | null) {
      look = target ? target.clone() : null
    },
    setRim(color: THREE.ColorRepresentation, k = 1) {
      for (const m of mats) setToonRim(m, color, k)
    },
    setSelfLight(k: number) {
      setToonSelfLight(mat, k)
      setToonSelfLight(fmat, k)
    },
    update(dt: number, speed: number) {
      t += dt
      // ポーズのまぜ
      blend = Math.min(1, blend + dt / 0.35)
      const sitting = seated(pose)
      walkW = approach(walkW, !sitting && speed > 0.25 ? Math.min(1, speed / 1.3) : 0, 9, dt)
      runK = approach(runK, speed > 3 ? Math.min(1, (speed - 3) / 2) : 0, 6, dt)
      if (walkW > 0.01) phase += dt * (speed / Math.max(0.5, d.hipY)) * (2.0 - runK * 0.4) * (1 + 0.15 * energy)
      const pc: PoseCtx = { t, d, spec, energy, aim, aimR: pose === 'reach' || pose === 'point' ? aimAngles() : null }
      posePose(B, pose, pc)
      if (blend < 1) {
        posePose(A, prevPose, pc)
        const k = blend * blend * (3 - 2 * blend)
        for (let i = 0; i < NSLOT; i++) B[i] = A[i] + (B[i] - A[i]) * k
      }
      walkLayer(B, phase, walkW, runK, armsBusy(pose), d)
      // 首を相手へ
      let wantYaw = 0
      let wantPitch = 0
      if (look) {
        r.root.updateMatrixWorld(true)
        const hp = r.joints[J.neck].getWorldPosition(tmpV)
        const dx = look.x - hp.x
        const dy = look.y - hp.y - 0.1
        const dz = look.z - hp.z
        r.root.getWorldQuaternion(tmpQ)
        const lv = new THREE.Vector3(dx, dy, dz).applyQuaternion(tmpQ.invert())
        wantYaw = Math.max(-1.0, Math.min(1.0, Math.atan2(-lv.x, -lv.z)))
        wantPitch = Math.max(-0.45, Math.min(0.45, Math.atan2(lv.y, Math.hypot(lv.x, lv.z))))
      }
      lookYaw = approach(lookYaw, wantYaw, 6, dt)
      lookPitch = approach(lookPitch, wantPitch, 6, dt)
      B[J.neck * 3 + 1] += lookYaw * 0.45
      B[J.head * 3 + 1] += lookYaw * 0.55
      B[J.head * 3] += lookPitch * 0.8
      writeJoints(B)
      // すその揺れ（歩くと前後に広がる）
      const sk = out.skirt ?? out.coatSkirt
      if (sk) {
        const sw = Math.abs(Math.sin(phase)) * walkW
        sk.scale.set(1, 1, 1 + sw * 0.35 + runK * 0.15)
        sk.rotation.x = walkW * (0.06 + runK * 0.12)
        if (sitting) sk.scale.set(1, pose === 'sitBed' ? 0.55 : 0.6, 1.2)
      }
      // 表情（笑うポーズは笑い顔。まばたき）
      blinkT -= dt
      if (blinkT <= 0) {
        blinking = 0.13
        blinkT = 2.4 + Math.random() * 3.2
      }
      blinking = Math.max(0, blinking - dt)
      const base: Expression = pose === 'laugh' ? 'laugh' : expr
      const canBlink = base === 'neutral' || base === 'smile' || base === 'sad' || base === 'shout'
      applyExpression(blinking > 0 && canBlink ? 'closed' : base)
      // ランプのつり手：いつも真下へ、歩きでゆれる
      if (r.sockets.lamp.children.length) {
        const drive = Math.sin(phase) * 0.22 * walkW + Math.sin(t * 1.3) * 0.03
        lampVel += ((drive - lampSwing) * 30 - lampVel * 4) * dt
        lampSwing += lampVel * dt
        r.root.updateMatrixWorld(true)
        r.sockets.handL.getWorldQuaternion(tmpQ)
        r.root.getWorldQuaternion(tmpQ2)
        // つり手の向き = 手の向きの逆 × 体の向き × ゆれ（体の前後）
        tmpQ.invert().multiply(tmpQ2).multiply(new THREE.Quaternion().setFromEuler(tmpE.set(lampSwing, 0, lampSwing * 0.3)))
        r.sockets.lamp.quaternion.copy(tmpQ)
      }
    },
    dispose() {
      disposeRoot(r.root)
      for (const m of mats) m.dispose()
      for (const g of geos) g.dispose()
      ftex.dispose()
    },
  }
  ch.update(0, 0)
  return ch
}

// ------------------------------------------------------------------ ベッド（トワの母の回想）

/**
 * 回想のベッド（木のわく・ふとん・まくら・ひざ掛け）。トワの母を sitBed で座らせる位置は hipSpot（root の中の座標）。
 * root は -Z が足もと側（人の顔の向き）
 */
export function createBed(): { root: THREE.Group; hipSpot: THREE.Vector3; dispose(): void } {
  const root = new THREE.Group()
  root.name = 'bed'
  const ps = new PartSet()
  const W = 1.0
  const L = 2.0
  const top = 0.5
  const wood = '#c9a77c'
  // わく・あし・頭の板
  ps.add(root, new RoundedBoxGeometry(W + 0.06, 0.12, L + 0.06, 3, 0.025), wood, T(0, top - 0.17, 0))
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    ps.add(root, SHAPES.box, wood, T((x * W) / 2, (top - 0.17) / 2, (z * L) / 2, 0, 0, 0, 0.07, top - 0.17, 0.07))
  ps.add(root, SHAPES.box, wood, T(0, top + 0.28, L / 2 + 0.02, 0, 0, 0, W + 0.08, 0.9, 0.06))
  // ふとん・まくら
  ps.add(root, new RoundedBoxGeometry(W - 0.02, 0.16, L - 0.04, 3, 0.025), '#fbf8f2', T(0, top - 0.06, 0))
  ps.add(root, SHAPES.capsule, '#ffffff', T(0, top + 0.12, L / 2 - 0.22, 0, 0, Math.PI / 2, 0.11, 0.24, 0.16))
  ps.add(root, SHAPES.capsule, '#f2e8ee', T(0, top + 0.2, L / 2 - 0.32, -0.6, 0, Math.PI / 2, 0.1, 0.22, 0.14))
  // ひざ掛け（足の上をおおう、ふっくら）
  const blanketRise = (x: number, z: number) => 0.2 * THREE.MathUtils.smoothstep(-z, -0.1, 0.45) * Math.exp(-Math.pow((z + 0.2) / 0.6, 4) - Math.pow(x / 0.4, 4))
  const drape = (g: THREE.BufferGeometry, x0: number, z0: number) => {
    // 丸箱は中央に大きな平面を持つため、先に分割して布の中央まで曲げる。
    const cloth = new TessellateModifier(0.09, 6).modify(g)
    g.dispose()
    const p = cloth.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + blanketRise(p.getX(i) + x0, p.getZ(i) + z0))
    cloth.computeVertexNormals()
    return cloth
  }
  // 足を覆う中央だけを持ち上げ、両端は寝具へ落とす。
  const blanket = drape(new RoundedBoxGeometry(W * 1.02, 0.15, L * 0.76, 5, 0.065), 0, -L * 0.12)
  ps.add(root, blanket, '#d9b6c2', T(0, top + 0.04, -L * 0.12), false)
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.23
    const fold = drape(new RoundedBoxGeometry(0.055, 0.012, 1.25 - i * 0.12, 5, 0.005), x, -0.24)
    ps.add(root, fold, '#e9cbd4', T(x, top + 0.119, -0.24), false)
  }
  const mat = createToonMaterial({ line: '#3a2a1a' })
  ps.bake(mat, { name: 'bed' })
  return {
    root,
    hipSpot: new THREE.Vector3(0, top + 0.02, L / 2 - 0.5),
    dispose: () => disposeRoot(root),
  }
}
