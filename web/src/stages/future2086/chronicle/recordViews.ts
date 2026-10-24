// IDO の VR（物語 v7.2）で見る「記録の町」。かんばんの QR を読むと、ネクマックスの見ている景色がこの町になる（少し上から、見回すだけ）。
// 町は 2086 年の町から遠くはなれた所（x = -2400）に小さく組んで、見るときだけ出す（はじめて見るときに組む）。
// ・edo1726：300 年前の大坂の路地（江戸の町家の部品 world/edo を使う。町の人は 1726 年のステージの町人 townsfolk7）
// ・nextmake2026：60 年前の NEXTMAKE のビルの前（立てたばかりの IDO のかんばん。2026 年の通行人 namba2026/pedestrians）
// ・ruins1186：900 年前のカンボジアの寺（石の塔・お堀・やしの木・村の人）
// どの町も、人が歩き、鳥が飛び、旗やけむりが動く（見ているだけでも、生きている町に見えるように）。当たり判定は持たない
// （5 章などで本当に入っていくときだけ、ステージが床を足す）。形は root の下（解放はシェル）。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../../render/batch'
import type { MaterialLibrary } from '../../../render/materials'
import { mulberry32, pick, range } from '../../../render/noise'
import type { QualitySettings } from '../../../render/quality'
import { ColliderList } from '../../../world/colliders'
import type { Ctx } from '../../../world/edo/kit'
import { barrel, crate, lantern, standLantern } from '../../../world/edo/kit'
import { machiya, kura, type Frame } from '../../../world/edo/buildings'
import { farHouse, pagoda, torii } from '../../../world/edo/backdrop'
import { Townsfolk, type TownPersonDef } from '../../edo1726/chronicle/townsfolk7'
import { Pedestrians } from '../../namba2026/pedestrians'
import { V7_TEXTURES } from '../../../chronicle/art'
import { buildFolk, folkMaterials, walkPose, type Folk, type FolkSpec } from './vrFolk'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type RecordViewKind = 'edo1726' | 'nextmake2026' | 'ruins1186'

/** 記録の町の、見る所（ローカル座標）と向き（camRig と同じ yaw・pitch）と、本当に入っていくときに下りる所 */
export type RecordView = {
  kind: RecordViewKind
  group: THREE.Group
  /** 見る目の位置（少し上から） */
  eye: THREE.Vector3
  yaw: number
  pitch: number
  /** 入っていくとき、ネクマックスが下りる所（地面） */
  land: THREE.Vector3
  update(dt: number): void
}

/** 町を置く所（2086 年の町から遠くはなれた所。種類ごとに少しずらす） */
export const VIEW_ORIGIN: Record<RecordViewKind, THREE.Vector3> = {
  edo1726: v(-2400, 0, 0),
  nextmake2026: v(-2400, 0, 600),
  ruins1186: v(-2400, 0, 1200),
}

export type ViewBuildCtx = { mats: MaterialLibrary; quality: QualitySettings }

export function buildRecordView(kind: RecordViewKind, bc: ViewBuildCtx): RecordView {
  const view = kind === 'edo1726' ? buildEdo(bc) : kind === 'nextmake2026' ? buildNextmake(bc) : buildRuins(bc)
  view.group.position.copy(VIEW_ORIGIN[kind])
  view.group.name = `record_view_${kind}`
  return view
}

// ------------------------------------------------------------------ 共通：鳥・けむり・はためく旗

/** 空をまわる鳥（V の字に羽ばたく）。数羽を 1 つずつの小さなメッシュで */
class Birds {
  readonly group = new THREE.Group()
  private readonly list: Array<{ m: THREE.Group; wl: THREE.Mesh; wr: THREE.Mesh; r: number; h: number; sp: number; ph: number; cx: number; cz: number }> = []
  private t = 0

  constructor(n: number, center: THREE.Vector3, color = '#2a2a32') {
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true })
    const wing = new THREE.BufferGeometry()
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.12, 0.55, 0.0, 0.02], 3))
    wing.computeVertexNormals()
    const rng = mulberry32(31)
    for (let i = 0; i < n; i++) {
      const m = new THREE.Group()
      const wr = new THREE.Mesh(wing, mat)
      const wl = new THREE.Mesh(wing, mat)
      wl.scale.x = -1
      m.add(wr, wl)
      this.group.add(m)
      this.list.push({ m, wl, wr, r: range(rng, 7, 16), h: range(rng, 10, 17), sp: range(rng, 0.25, 0.42) * (rng() < 0.5 ? 1 : -1), ph: rng() * 6.28, cx: center.x + range(rng, -4, 4), cz: center.z + range(rng, -4, 4) })
    }
  }

  update(dt: number): void {
    this.t += dt
    for (const b of this.list) {
      const a = this.t * b.sp + b.ph
      b.m.position.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(this.t * 0.7 + b.ph) * 0.6, b.cz + Math.sin(a) * b.r)
      // 進む向き（円の接線）へ
      b.m.rotation.y = -a + (b.sp > 0 ? 0 : Math.PI)
      const flap = Math.sin(this.t * 9 + b.ph) * 0.6
      b.wr.rotation.z = flap
      b.wl.rotation.z = -flap
    }
  }
}

/** ゆっくり上へのぼって消えるけむり（やわらかい丸の板） */
class Smoke {
  readonly group = new THREE.Group()
  private readonly puffs: Array<{ s: THREE.Sprite; t: number }> = []
  private readonly at: THREE.Vector3

  constructor(at: THREE.Vector3, n = 7, color = '#e8e4dc') {
    this.at = at.clone()
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d') as CanvasRenderingContext2D
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,0.9)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, 64, 64)
    const tex = new THREE.CanvasTexture(c)
    const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, opacity: 0.6 })
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat.clone())
      this.group.add(s)
      this.puffs.push({ s, t: i / n })
    }
    mat.dispose()
  }

  update(dt: number): void {
    for (const p of this.puffs) {
      p.t = (p.t + dt * 0.12) % 1
      const k = p.t
      p.s.position.set(this.at.x + Math.sin(k * 5 + p.t) * 0.35 + k * 0.8, this.at.y + k * 4.5, this.at.z + k * 0.4)
      p.s.scale.setScalar(0.5 + k * 1.8)
      ;(p.s.material as THREE.SpriteMaterial).opacity = Math.sin(k * Math.PI) * 0.55
    }
  }
}

/** 竿にさげた、はためく旗（のぼり・こいのぼりの代わりの布）。上が竿の先 */
class Flag {
  readonly group = new THREE.Group()
  private readonly cloth: THREE.Mesh
  private readonly base: Float32Array
  private t = Math.random() * 10

  constructor(at: THREE.Vector3, h: number, w: number, painter: (g: CanvasRenderingContext2D, W: number, H: number) => void, pole = '#5a3f2a') {
    const poleMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h + 0.6, 8), new THREE.MeshStandardMaterial({ color: pole, roughness: 0.8 }))
    poleMesh.position.set(at.x, at.y + (h + 0.6) / 2, at.z)
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 512
    painter(c.getContext('2d') as CanvasRenderingContext2D, 128, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    const geo = new THREE.PlaneGeometry(w, h, 6, 12)
    geo.translate(w / 2 + 0.05, -h / 2, 0)
    this.base = (geo.attributes.position.array as Float32Array).slice()
    this.cloth = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.85 }))
    this.cloth.position.set(at.x, at.y + h + 0.45, at.z)
    this.group.add(poleMesh, this.cloth)
  }

  update(dt: number): void {
    this.t += dt
    const pos = this.cloth.geometry.attributes.position as THREE.BufferAttribute
    const a = pos.array as Float32Array
    for (let i = 0; i < a.length; i += 3) {
      const x = this.base[i]
      a[i + 2] = Math.sin(this.t * 3.2 - x * 2.4 + this.base[i + 1] * 0.6) * 0.12 * x
    }
    pos.needsUpdate = true
  }
}

/** 歩く人（a ↔ b を行ったり来たり。ときどき止まる） */
class Walkers {
  readonly group = new THREE.Group()
  private readonly list: Array<{ f: Folk; a: THREE.Vector3; b: THREE.Vector3; k: number; dir: number; sp: number; ph: number; pause: number }> = []

  add(f: Folk, a: THREE.Vector3, b: THREE.Vector3, sp: number, k = Math.random()): void {
    this.group.add(f.root)
    this.list.push({ f, a: a.clone(), b: b.clone(), k, dir: Math.random() < 0.5 ? 1 : -1, sp, ph: Math.random() * 6, pause: 0 })
  }

  update(dt: number): void {
    for (const w of this.list) {
      const len = w.a.distanceTo(w.b) || 1
      if (w.pause > 0) {
        w.pause -= dt
        walkPose(w.f, 0, 0)
        continue
      }
      w.k += (w.dir * w.sp * dt) / len
      if (w.k > 1 || w.k < 0) {
        w.k = Math.min(1, Math.max(0, w.k))
        w.dir *= -1
        w.pause = 0.6 + Math.random() * 1.6
      }
      w.ph += dt * w.sp * 4.2
      w.f.root.position.lerpVectors(w.a, w.b, w.k)
      w.f.root.position.y += Math.abs(Math.cos(w.ph)) * 0.025
      const dx = (w.b.x - w.a.x) * w.dir
      const dz = (w.b.z - w.a.z) * w.dir
      w.f.root.rotation.y = Math.atan2(-dx, -dz)
      walkPose(w.f, w.ph, 1)
    }
  }
}

function edoCtx(group: THREE.Group, bc: ViewBuildCtx, seed: number): Ctx {
  return { b: new Batch(), bf: new Batch(), m: bc.mats, col: new ColliderList(), rng: mulberry32(seed), lights: [], root: group, updaters: [], quality: bc.quality }
}

function finishBatch(c: Ctx, group: THREE.Group, name: string): void {
  const near = c.b.build(name)
  near.traverse((o) => {
    // 遠くの町なので、影は落とさない（太陽の影は 2086 年の町のまわりだけ）
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false
  })
  group.add(near)
  if (c.bf.count) group.add(c.bf.build(name + '_far'))
}

// ------------------------------------------------------------------ 300 年前の大坂の路地

function buildEdo(bc: ViewBuildCtx): RecordView {
  const group = new THREE.Group()
  const c = edoCtx(group, bc, 1726)
  const rng = mulberry32(17261)
  // 地面：ふみ固めた土と、まん中の石だたみ
  c.b.add(rbox(70, 0.1, 70, 0.02), c.m.plaster, M(0, -0.05, 0), { tint: '#c8a882', texM: 3, cast: false })
  c.b.add(rbox(48, 0.06, 2.2, 0.02), c.m.paving, M(0, 0.02, 0), { tint: '#e8dcc4', texM: 2.4, cast: false })
  // 路地の両側の町家（北の列は南を向き、南の列は北を向く）
  const signs = ['飴', '甘味処', 'そば', '傘', '茶', '団子', '櫛']
  const norens = ['waveIndigo', 'redCrest', 'gearIndigo', 'whiteTea'] as const
  const shops = ['goods', 'tea', 'goods', 'workshop'] as const
  let k = 0
  for (const side of [1, -1]) {
    for (let x = -21; x <= 21; x += 6.2) {
      const fr: Frame = { ox: x + range(rng, -0.2, 0.2), oz: 3.1 * side, rot: side > 0 ? 0 : Math.PI, y: 0 }
      machiya(c, fr, {
        width: range(rng, 5.4, 6.0),
        depth: 5.5,
        noren: norens[k % norens.length],
        lanterns: pick(rng, ['red', 'cream', 'mixed'] as const),
        shop: shops[k % shops.length],
        sign: rng() < 0.6 ? { text: signs[k % signs.length] } : undefined,
        balcony: rng() < 0.25,
        collider: false,
      })
      k++
    }
    // うしろの家並み（屋根が重なって見えるように）
    for (let x = -26; x <= 26; x += 7) farHouse(c, x + range(rng, -1, 1), 0, side * range(rng, 13.5, 15.5), range(rng, 5, 6.5), range(rng, 5, 6), range(rng, 3.4, 5.2), side > 0 ? 0 : Math.PI, rng)
    for (let x = -30; x <= 30; x += 8) farHouse(c, x + range(rng, -1, 1), 0, side * range(rng, 22, 26), range(rng, 5, 7), range(rng, 5, 6), range(rng, 3.4, 5.6), side > 0 ? 0 : Math.PI, rng)
  }
  // 路地の両はし：西は蔵、東は鳥居（その先に五重塔）
  kura(c, { ox: -26.5, oz: 0, rot: -Math.PI / 2, y: 0 } as Frame, 5.0, 5.0, 5.4)
  torii(c, 23.5, 0, 0, Math.PI / 2, 0.8)
  pagoda(c, 40, 0, -6, 1.0)
  pagoda(c, -8, 0, -46, 1.2)
  // 路地の小物：井戸・樽・木箱・置き行灯・軒の提灯
  c.b.add(new THREE.CylinderGeometry(0.62, 0.66, 0.8, 16), c.m.stoneWall, M(-6.2, 0.4, 1.9), { tint: '#cfc8bb', texM: 1 })
  c.b.add(new THREE.CircleGeometry(0.52, 16), c.m.plain, M(-6.2, 0.78, 1.9, -Math.PI / 2, 0, 0), { tint: '#22343c', cast: false })
  for (const e of [-1, 1]) c.b.add(rbox(0.1, 1.6, 0.1, 0.02), c.m.wood, M(-6.2 + e * 0.6, 1.3, 1.9), { tint: '#7a5a3a' })
  c.b.add(rbox(1.4, 0.1, 0.16, 0.02), c.m.wood, M(-6.2, 2.1, 1.9), { tint: '#7a5a3a' })
  for (const [x, z] of [
    [-12.4, -1.9],
    [3.6, 2.0],
    [9.8, -2.1],
    [16.2, 2.2],
  ] as const)
    barrel(c, x, 0, z, 0.9, false)
  crate(c, 4.4, 0, 2.3, 0.6, 0.3)
  crate(c, -13.2, 0, -2.3, 0.7, -0.2)
  crate(c, -13.0, 0.7, -2.3, 0.5, 0.4)
  standLantern(c, -2.4, 2.0)
  standLantern(c, 12.6, -2.0)
  for (let x = -18; x <= 18; x += 4.1) lantern(c, x, 3.35, 2.45 * (x % 8.2 > 0 ? 1 : -1), { kind: rng() < 0.5 ? 'red' : 'cream', light: false, low: true })
  finishBatch(c, group, 'record_edo')
  // 町の人（1726 年のステージの町人と同じ形）：歩く人・立ち話の人・走る子ども
  const P = (x: number, z: number, yaw: number, h: number, hair: TownPersonDef['hair'], cloth: string, obi: string, walk?: TownPersonDef['walk']): TownPersonDef => ({ id: null, x, z, yaw, h, hair, cloth, obi, walk })
  const folk = new Townsfolk([
    P(-14, -0.9, 0, 1.6, 0, '#46506a', '#a88a5a', { x0: -20, x1: 14, speed: 0.95, t0: 2 }),
    P(0, 0.8, 0, 1.52, 1, '#8a3a32', '#2a2f4a', { x0: -12, x1: 18, speed: 0.8, t0: 9 }),
    P(6, -0.4, 0, 1.64, 0, '#5a6a4a', '#3a2a1a', { x0: -6, x1: 20, speed: 1.05, t0: 5 }),
    P(-4, 1.3, 0, 1.08, 2, '#c86a3a', '#f2c84b', { x0: -16, x1: 6, speed: 2.1, t0: 1 }),
    P(10, 0.3, 0, 1.5, 1, '#6a5a8a', '#e8d8b0', { x0: 2, x1: 19, speed: 0.75, t0: 13 }),
    P(-9.6, -2.2, Math.PI - 0.4, 1.52, 1, '#3a4f7a', '#c8a040'),
    P(-8.8, -1.9, 0.6 - Math.PI / 2, 1.5, 3, '#6a5040', '#2a2620'),
    P(1.2, 2.4, 0.2, 1.5, 1, '#7a6a4a', '#5a2a2a'),
    P(14.6, -2.3, Math.PI + 0.3, 1.62, 0, '#2f4466', '#d8c8a0'),
    P(-2.4, -2.5, Math.PI, 1.1, 2, '#3a7a5a', '#f2c84b'),
  ])
  group.add(folk.group)
  // 鳥・茶店のけむり・のぼり旗
  const birds = new Birds(5, v(2, 0, -2))
  const smoke = new Smoke(v(-1.4, 6.2, 5.2))
  const flagA = new Flag(v(-3.4, 0, -2.6), 2.4, 0.55, paintNobori('#c23a2e', '茶'))
  const flagB = new Flag(v(8.6, 0, 2.6), 2.4, 0.55, paintNobori('#2c3d6b', '飴'))
  group.add(birds.group, smoke.group, flagA.group, flagB.group)
  return {
    kind: 'edo1726',
    group,
    eye: v(-2.0, 4.3, 0.4),
    yaw: -Math.PI / 2 - 0.25,
    pitch: 0.28,
    land: v(1.5, 0, 0.2),
    update(dt) {
      folk.update(dt)
      birds.update(dt)
      smoke.update(dt)
      flagA.update(dt)
      flagB.update(dt)
    },
  }
}

/** のぼり旗の布（色地に白い字） */
function paintNobori(bg: string, text: string) {
  return (g: CanvasRenderingContext2D, W: number, H: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, W, H)
    g.fillStyle = 'rgba(255,255,255,0.18)'
    for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2)
    g.fillStyle = '#ffffff'
    g.font = `900 ${Math.round(W * 0.7)}px 'Noto Serif JP', serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, W / 2, H * 0.4)
  }
}

// ------------------------------------------------------------------ 60 年前（2026 年）の NEXTMAKE のビルの前

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  paint(c.getContext('2d') as CanvasRenderingContext2D, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping
  return t
}

/** ビルの窓（4×4 の窓のくり返し。box 投影で 1 枚 6m） */
function windowTexture(seed: number, glass: string, frame: string): THREE.CanvasTexture {
  return canvasTex(
    256,
    256,
    (g, w, h) => {
      const rng = mulberry32(seed)
      g.fillStyle = frame
      g.fillRect(0, 0, w, h)
      const n = 4
      const cw = w / n
      for (let i = 0; i < n; i++)
        for (let j = 0; j < n; j++) {
          const lit = rng()
          g.fillStyle = lit < 0.18 ? '#ffe9b8' : glass
          g.fillRect(i * cw + 8, j * cw + 10, cw - 16, cw - 18)
          g.fillStyle = 'rgba(255,255,255,0.25)'
          g.fillRect(i * cw + 8, j * cw + 10, (cw - 16) * 0.35, cw - 18)
        }
    },
    true,
  )
}

function buildNextmake(bc: ViewBuildCtx): RecordView {
  const group = new THREE.Group()
  const b = new Batch()
  const m = bc.mats
  const rng = mulberry32(2026)
  const winA = new THREE.MeshStandardMaterial({ map: windowTexture(1, '#5f7f9f', '#e6e8ec'), roughness: 0.4, metalness: 0.1 })
  const winB = new THREE.MeshStandardMaterial({ map: windowTexture(2, '#3d566e', '#8a8f98'), roughness: 0.45, metalness: 0.15 })
  const winC = new THREE.MeshStandardMaterial({ map: windowTexture(3, '#6d8aa8', '#d9c8b0'), roughness: 0.5 })
  // 車道（アスファルト）・白線・歩道
  b.add(rbox(90, 0.1, 9, 0), m.plain, M(0, -0.05, 0), { tint: '#4a4e56', cast: false })
  for (let x = -40; x <= 40; x += 4) b.add(rbox(2, 0.02, 0.15, 0), m.plain, M(x, 0.01, 0), { tint: '#f2f2ee', cast: false })
  for (const s of [-1, 1]) {
    b.add(rbox(90, 0.16, 3.6, 0.02), m.paving, M(0, 0.06, s * 6.3), { tint: '#d8d4cc', texM: 2, cast: false })
    b.add(rbox(90, 0.18, 0.2, 0.02), m.plain, M(0, 0.08, s * 4.55), { tint: '#b8b8b4', cast: false })
  }
  b.add(rbox(120, 0.1, 120, 0), m.plain, M(0, -0.08, 0), { tint: '#8a8a86', cast: false })
  // 北の側：まん中に NEXTMAKE のビル（白い壁に青いガラス）、両わきにビル
  b.add(rbox(14, 16, 10, 0.1), m.plain, M(0, 8, -13.2), { tint: '#f4f6f8' })
  b.add(rbox(13.2, 12, 0.2, 0), winA, M(0, 9, -8.15), { texM: 6 })
  b.add(rbox(6, 3.2, 0.3, 0.05), m.plain, M(0, 1.6, -8.1), { tint: '#2a3a5a' })
  b.add(rbox(7, 0.25, 2.4, 0.05), m.plain, M(0, 3.4, -7.2), { tint: '#ffffff' })
  for (const [x, w, h, d, mat] of [
    [-17, 18, 22, 10, winB],
    [-33, 12, 14, 10, winC],
    [16.5, 17, 19, 10, winC],
    [33, 14, 26, 10, winB],
  ] as const) {
    b.add(rbox(w, h, d, 0.05), m.plain, M(x, h / 2, -13.2), { tint: pick(rng, ['#c9ccd2', '#e2d6c4', '#a9b0bc']) })
    b.add(rbox(w - 0.8, h - 3, 0.2, 0), mat, M(x, h / 2 + 1, -8.15), { texM: 6 })
    b.add(rbox(w - 1, 2.6, 0.25, 0), m.plain, M(x, 1.3, -8.1), { tint: pick(rng, ['#e85a4a', '#3a8a5a', '#2a2a2a', '#e8a83a']) })
  }
  // 南の側：店の並び（にぎやかな看板）
  for (let x = -36; x <= 36; x += 9) {
    const h = range(rng, 9, 20)
    b.add(rbox(8.6, h, 10, 0.05), m.plain, M(x, h / 2, 13.2), { tint: pick(rng, ['#d9d2c6', '#c4c8d0', '#e8dcc8', '#b8bcc6']) })
    b.add(rbox(8, h - 3, 0.2, 0), pick(rng, [winA, winB, winC]), M(x, h / 2 + 1, 8.15), { texM: 6 })
    b.add(rbox(7.6, 1.2, 0.3, 0.05), m.plain, M(x, 3.6, 8.0), { tint: pick(rng, ['#ff4a6a', '#ffd040', '#3ac0ff', '#ff8a2a', '#7ad04a']) })
    b.add(rbox(1.0, 4, 0.3, 0.05), m.plain, M(x + 3.2, 6.6, 7.9), { tint: pick(rng, ['#ff4a8a', '#4ae0ff', '#ffd040']) })
  }
  // 街路樹と街灯
  for (let x = -30; x <= 30; x += 10) {
    for (const s of [-1, 1]) {
      const tx = x + (s > 0 ? 5 : 0)
      b.add(new THREE.CylinderGeometry(0.12, 0.16, 2.6, 8), m.bark, M(tx, 1.3, s * 7.2), { tint: '#6a5040' })
      b.add(new THREE.IcosahedronGeometry(1.3, 1), m.puffGreen, M(tx, 3.4, s * 7.2, 0, 0, 0, 1, 0.9, 1), { tint: '#ffffff' })
      b.add(new THREE.CylinderGeometry(0.06, 0.08, 5, 8), m.plain, M(tx + 2.5, 2.5, s * 5.0), { tint: '#3a3e46' })
      b.add(rbox(0.8, 0.12, 0.3, 0.03), m.plain, M(tx + 2.5, 5, s * 5.0 - s * 0.3), { tint: '#3a3e46' })
    }
  }
  const near = b.build('record_2026')
  near.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false
  })
  group.add(near)
  // NEXTMAKE の看板（ロゴ）と、立てたばかりの IDO のかんばん
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.5), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, toneMapped: false }))
  logo.position.set(0, 11.8, -8.0)
  group.add(logo)
  new THREE.TextureLoader().load('./textures/brand/nextmake_logo.png', (t) => {
    t.colorSpace = THREE.SRGBColorSpace
    const img = t.image as { width: number; height: number }
    logo.scale.y = (7.6 * (img.height / Math.max(1, img.width))) / 2.5
    ;(logo.material as THREE.MeshBasicMaterial).map = t
    ;(logo.material as THREE.MeshBasicMaterial).needsUpdate = true
  })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 1.0), new THREE.MeshBasicMaterial({ map: canvasTex(512, 72, paintText('NEXTMAKE', '#ffffff', '#1d4fa0')), toneMapped: false }))
  sign.position.set(0, 4.1, -8.0)
  group.add(sign)
  group.add(idoKanban(v(3.4, 0.14, -6.0)))
  // 道を走る車
  const cars: Array<{ g: THREE.Group; x: number; z: number; sp: number }> = []
  for (const [z, sp, col] of [
    [-2.2, 6.5, '#e8e8ec'],
    [2.2, -5.2, '#d84a3a'],
    [2.2, -5.2, '#2a5aa8'],
  ] as const) {
    const g = car(col)
    g.rotation.y = sp > 0 ? -Math.PI / 2 : Math.PI / 2
    group.add(g)
    cars.push({ g, x: range(rng, -40, 40), z, sp })
  }
  // 歩道を歩く人（2026 年のステージと同じ人形）
  const peds = new Pedestrians(
    [
      { x0: -30, x1: 30, z: 6.4, n: 6 },
      { x0: -30, x1: 30, z: -6.2, n: 5 },
    ],
    260,
  )
  peds.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false
  })
  group.add(peds.group)
  const birds = new Birds(4, v(0, 0, -4), '#30343c')
  group.add(birds.group)
  return {
    kind: 'nextmake2026',
    group,
    // 道の向こうの歩道の上から、NEXTMAKE のビルとかんばんを、ななめに見る
    eye: v(-8.6, 6.6, 7.4),
    yaw: -0.6,
    pitch: 0.06,
    land: v(1.2, 0.14, -5.4),
    update(dt) {
      for (const c of cars) {
        c.x += c.sp * dt
        if (c.x > 46) c.x = -46
        if (c.x < -46) c.x = 46
        c.g.position.set(c.x, 0, c.z)
      }
      peds.update(dt)
      birds.update(dt)
    },
  }
}

function paintText(text: string, fg: string, bg: string) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = bg
    g.fillRect(0, 0, w, h)
    g.fillStyle = fg
    g.font = `800 ${Math.round(h * 0.62)}px 'M PLUS Rounded 1c', sans-serif`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, w / 2, h * 0.54)
  }
}

/** 立てたばかりの IDO のかんばん（石の柱と、上の QR の板） */
function idoKanban(at: THREE.Vector3): THREE.Group {
  const g = new THREE.Group()
  const stone = new THREE.MeshStandardMaterial({ color: '#b8b4ac', roughness: 0.8 })
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.3), stone)
  pillar.position.y = 0.75
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.62),
    new THREE.MeshBasicMaterial({
      map: canvasTex(128, 128, (c, w, h) => {
        c.fillStyle = '#1b2f6a'
        c.fillRect(0, 0, w, h)
        c.fillStyle = '#ffffff'
        c.fillRect(22, 30, 84, 84)
        const rng = mulberry32(2026)
        c.fillStyle = '#0c1430'
        for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) if (rng() < 0.5) c.fillRect(26 + i * 6.3, 34 + j * 6.3, 6.3, 6.3)
        c.fillStyle = '#ffffff'
        c.font = "800 20px 'M PLUS Rounded 1c', sans-serif"
        c.textAlign = 'center'
        c.fillText('IDO', w / 2, 22)
      }),
      toneMapped: false,
    }),
  )
  plate.position.set(0, 1.62, 0.16)
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.72, 0.12), stone)
  cap.position.set(0, 1.62, 0.08)
  g.add(pillar, cap, plate)
  g.position.copy(at)
  return g
}

/** 車（箱の胴・窓・車輪） */
function car(color: string): THREE.Group {
  const g = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 4.0), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 }))
  body.position.y = 0.65
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.6, 2.0), new THREE.MeshStandardMaterial({ color: '#28323e', roughness: 0.2, metalness: 0.4 }))
  cab.position.set(0, 1.25, 0.2)
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12)
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 })
  g.add(body, cab)
  for (const [x, z] of [
    [-0.82, -1.3],
    [0.82, -1.3],
    [-0.82, 1.3],
    [0.82, 1.3],
  ] as const) {
    const w = new THREE.Mesh(wheelGeo, wheelMat)
    w.rotation.z = Math.PI / 2
    w.position.set(x, 0.32, z)
    g.add(w)
  }
  return g
}

// ------------------------------------------------------------------ 900 年前（1186 年）のカンボジアの寺

/** 石の塔（とうもろこしの形の塔。下から少しずつ細くなる段） */
function prangGeo(s: number): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  const prof: Array<[number, number]> = [
    [1.6, 0],
    [1.6, 1.2],
    [1.3, 1.35],
    [1.42, 2.4],
    [1.12, 2.6],
    [1.22, 3.6],
    [0.95, 3.8],
    [1.02, 4.7],
    [0.74, 4.9],
    [0.76, 5.7],
    [0.5, 5.9],
    [0.48, 6.5],
    [0.18, 7.1],
    [0.0, 7.6],
  ]
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r * s, y * s))
  return new THREE.LatheGeometry(pts, 8)
}

function buildRuins(bc: ViewBuildCtx): RecordView {
  const group = new THREE.Group()
  const b = new Batch()
  const m = bc.mats
  const rng = mulberry32(1186)
  const stone = new THREE.MeshStandardMaterial({ color: '#c9a77e', roughness: 0.92 })
  // 石の材質（読めたら、寺の石の絵をはる）
  new THREE.TextureLoader().load(V7_TEXTURES.khmerSandstone, (t) => {
    t.colorSpace = THREE.SRGBColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    stone.map = t
    stone.color.set('#ffffff')
    stone.needsUpdate = true
  })
  // 地面（赤い土と草）・お堀の水
  b.add(rbox(140, 0.1, 140, 0), m.plain, M(0, -0.06, 0), { tint: '#a88a5a', cast: false })
  const water = new THREE.Mesh(new THREE.PlaneGeometry(90, 9), new THREE.MeshStandardMaterial({ color: '#2f6a6a', roughness: 0.08, metalness: 0.35 }))
  water.rotation.x = -Math.PI / 2
  water.position.set(0, 0.02, -6.5)
  group.add(water)
  // 参道（お堀をわたる石の道）と、両わきのらんかん
  b.add(rbox(4.2, 0.6, 26, 0.05), stone, M(0, 0.3, -2), { texM: 3 })
  for (const s of [-1, 1]) for (let z = 10; z > -14; z -= 1.2) b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 8), stone, M(s * 1.95, 0.85, z), { texM: 1 })
  // 寺：3 段の基壇と、まわりの回廊、まん中の高い塔と四すみの塔
  const T0 = -24
  b.add(rbox(30, 1.4, 20, 0.05), stone, M(0, 0.7, T0), { texM: 3 })
  b.add(rbox(22, 1.4, 15, 0.05), stone, M(0, 2.1, T0 - 0.5), { texM: 3 })
  b.add(rbox(14, 1.4, 10, 0.05), stone, M(0, 3.5, T0 - 1), { texM: 3 })
  // 正面の階段
  for (let i = 0; i < 7; i++) b.add(rbox(3.2, 0.2, 0.6, 0.02), stone, M(0, 0.1 + i * 0.2 + 0.0, T0 + 10 + 0.3 - i * 0.6 + 0.6), { texM: 1 })
  // 回廊の柱の列
  for (let x = -14; x <= 14; x += 2) b.add(rbox(0.5, 2.4, 0.5, 0.02), stone, M(x, 2.6, T0 + 9.4), { texM: 1 })
  b.add(rbox(30, 0.5, 1.2, 0.02), stone, M(0, 4.0, T0 + 9.4), { texM: 3 })
  const center = prangGeo(1.7)
  b.add(center, stone, M(0, 4.2, T0 - 1), { texM: 2 })
  center.dispose()
  const small = prangGeo(0.95)
  for (const [x, z] of [
    [-5.5, T0 + 2.5],
    [5.5, T0 + 2.5],
    [-5.5, T0 - 4.5],
    [5.5, T0 - 4.5],
  ] as const)
    b.add(small, stone, M(x, 4.2, z), { texM: 2 })
  small.dispose()
  // 門の塔（参道の手前）
  b.add(rbox(6, 3.4, 2.2, 0.05), stone, M(0, 1.7, -14.5), { texM: 3 })
  b.add(prangGeo(0.7), stone, M(0, 3.4, -14.5), { texM: 2 })
  // やしの木（お堀のまわり）
  const palms: Array<[number, number]> = [
    [-9, 4],
    [8, 5],
    [-14, -1],
    [13, -2],
    [-20, -12],
    [19, -11],
    [-26, 6],
    [24, 7],
  ]
  for (const [x, z] of palms) {
    const h = range(rng, 6.5, 9)
    const lean = range(rng, -0.12, 0.12)
    b.add(new THREE.CylinderGeometry(0.16, 0.24, h, 8), m.bark, M(x, h / 2, z, 0, 0, lean), { tint: '#8a6a4a' })
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + rng()
      b.add(rbox(0.5, 0.06, 3.2, 0.02), m.leaf, M(x + Math.cos(a) * 1.3 - lean * h * 0.5, h + 0.1, z + Math.sin(a) * 1.3, -0.45, -a + Math.PI / 2, 0), { tint: '#4f8a3a' })
    }
  }
  // 遠くの林（低い丸い木）
  for (let i = 0; i < 26; i++) {
    const a = range(rng, -Math.PI, 0)
    const r = range(rng, 36, 52)
    b.add(new THREE.IcosahedronGeometry(range(rng, 2.2, 3.6), 1), m.puffGreen, M(Math.cos(a) * r, 1.8, Math.sin(a) * r - 10), { tint: '#cfe8b8', cast: false })
  }
  const near = b.build('record_1186')
  near.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false
  })
  group.add(near)
  // 村の人・お坊さん（参道を行き来する）
  const mats = folkMaterials()
  const walkers = new Walkers()
  const people: Array<[FolkSpec, THREE.Vector3, THREE.Vector3, number]> = [
    [{ h: 1.6, skin: '#b07a55', top: '#e2a03a', bottom: '#e2a03a', hair: '#1a1410', robe: true, sash: '#d8882a' }, v(-0.8, 0.6, 8), v(-0.8, 0.6, -12), 0.8],
    [{ h: 1.58, skin: '#a06a48', top: '#e2a03a', bottom: '#e2a03a', hair: '#1a1410', robe: true, sash: '#d8882a' }, v(-0.2, 0.6, 7), v(-0.2, 0.6, -12), 0.8],
    [{ h: 1.55, skin: '#b07a55', top: '#f2ead8', bottom: '#7a3a5a', hair: '#1a1410', robe: true, longHair: true }, v(0.9, 0.6, -11), v(0.9, 0.6, 9), 0.9],
    [{ h: 1.1, skin: '#b07a55', top: '#e8d8b8', bottom: '#4a6a8a', hair: '#1a1410' }, v(1.3, 0.6, -6), v(1.3, 0.6, 8), 1.8],
    [{ h: 1.66, skin: '#8a5a3c', top: '#c8b89a', bottom: '#3a5a4a', hair: '#1a1410', robe: true }, v(-12, 0, 2.5), v(12, 0, 2.5), 1.0],
  ]
  for (const [spec, a, bb, sp] of people) {
    const f = buildFolk(spec, mats)
    walkers.add(f, a, bb, sp)
  }
  walkers.group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false
  })
  group.add(walkers.group)
  const birds = new Birds(6, v(0, 0, -16), '#24282e')
  const smoke = new Smoke(v(-16, 0.4, 3), 6, '#d8d0c4')
  group.add(birds.group, smoke.group)
  let t = 0
  return {
    kind: 'ruins1186',
    group,
    eye: v(-1.8, 5.6, 11),
    yaw: 0.06,
    pitch: 0.16,
    land: v(0, 0.6, 3),
    update(dt) {
      t += dt
      walkers.update(dt)
      birds.update(dt)
      smoke.update(dt)
      // 水面のきらめき（色を少しだけゆらす）
      ;(water.material as THREE.MeshStandardMaterial).color.setHSL(0.5, 0.38, 0.29 + Math.sin(t * 1.3) * 0.015)
    },
  }
}
