// 手続き的な象（荷物を運んで、道をゆっくり行ったり来たりする）。背中の板は乗れる足場（KinematicBox）。
// 重くしない：体（皮膚）と荷物（木・布・かご）でそれぞれ 1 つのメッシュ、鼻は 1 つ、足は全部の象で 1 つの InstancedMesh。
// 止める（時間を止める）の対象にはしない（人と同じ扱い。ステージ設計 11 章）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PingPongWalker } from './khmerLogic'
import { KinematicBox, type KhmerBodies } from './physKhmer'
import { KC } from './materialsKhmer'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 背中の板の上面の高さ（足もとから） */
export const ELEPHANT_DECK_Y = 2.75
/** 足の付け根（左右・前後）と長さ */
const HIPS: Array<[number, number]> = [
  [-0.5, -0.85],
  [0.5, -0.85],
  [-0.5, 0.95],
  [0.5, 0.95],
]
const LEG_LEN = 1.35
/** 横の歩き方（左後ろ → 左前 → 右後ろ → 右前） */
const LEG_PHASE = [0.25, 0.75, 0, 0.5]

type Part = { g: THREE.BufferGeometry; tint: THREE.ColorRepresentation }

function colored(g: THREE.BufferGeometry, tint: THREE.ColorRepresentation): THREE.BufferGeometry {
  // なめらかな法線のまま、添字なしにそろえる（まとめるため）
  if (!g.attributes.normal) g.computeVertexNormals()
  const out = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') out.deleteAttribute(k)
  if (!out.attributes.uv) out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 2), 2))
  const c = new THREE.Color(tint)
  const n = out.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

function merge(parts: Part[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts.map((p) => colored(p.g, p.tint)), false) as THREE.BufferGeometry
  g.computeBoundingSphere()
  return g
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => {
  const m = new THREE.Matrix4().compose(v(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), v(sx, sy, sz))
  g.applyMatrix4(m)
  return g
}

/** 体（皮膚）・荷物・鼻・足のジオメトリ（全部の象で使い回す） */
function elephantGeometries(): { skin: THREE.BufferGeometry; load: THREE.BufferGeometry; trunk: THREE.BufferGeometry; leg: THREE.BufferGeometry } {
  const skin = '#8f8a86'
  const skinDark = '#7c7672'
  const pink = '#c8a49a'
  const body: Part[] = [
    { g: at(new THREE.SphereGeometry(1, 18, 12), 0, 1.78, 0.05, 0, 0, 0, 0.86, 0.78, 1.42), tint: skin },
    // 肩と背中のもりあがり
    { g: at(new THREE.SphereGeometry(0.7, 12, 8), 0, 2.15, -0.55, 0, 0, 0, 1, 0.75, 1), tint: skin },
    { g: at(new THREE.SphereGeometry(0.75, 12, 8), 0, 2.05, 0.75, 0, 0, 0, 1, 0.7, 1), tint: skin },
    // 頭（ふたこぶのおでこ）
    { g: at(new THREE.SphereGeometry(0.62, 14, 10), 0, 2.28, -1.55, 0, 0, 0, 1, 1.05, 0.95), tint: skin },
    { g: at(new THREE.SphereGeometry(0.3, 10, 8), -0.2, 2.72, -1.62), tint: skinDark },
    { g: at(new THREE.SphereGeometry(0.3, 10, 8), 0.2, 2.72, -1.62), tint: skinDark },
    // 目
    { g: at(new THREE.SphereGeometry(0.06, 6, 5), -0.42, 2.35, -1.92), tint: '#1a1410' },
    { g: at(new THREE.SphereGeometry(0.06, 6, 5), 0.42, 2.35, -1.92), tint: '#1a1410' },
    // しっぽ
    { g: new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(v(0, 2.0, 1.4), v(0, 1.6, 1.62), v(0, 1.05, 1.55)), 6, 0.05, 5, false), tint: skinDark },
  ]
  // 耳（うすい円板。ふちに少しピンク）
  for (const s of [-1, 1]) {
    body.push({ g: at(new THREE.CircleGeometry(0.62, 16), s * 0.62, 2.18, -1.25, 0, s * 1.25, 0.12 * s, 0.85, 1.05, 1), tint: skinDark })
    body.push({ g: at(new THREE.CircleGeometry(0.62, 16), s * 0.6, 2.18, -1.25, 0, s * 1.25 + Math.PI, 0.12 * s, 0.85, 1.05, 1), tint: pink })
    // きば（小さな白いきば）
    body.push({ g: at(new THREE.ConeGeometry(0.06, 0.42, 6), s * 0.2, 1.78, -2.02, -1.9, 0, 0), tint: '#f2ece0' })
  }
  // 背中の板・鞍の布・荷物
  const load: Part[] = [
    // 鞍の布（赤と金）
    { g: at(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), 0, 1.98, 0.08, 0, 0, 0, 0.92, 0.82, 1.08), tint: '#b8322c' },
    { g: at(new THREE.TorusGeometry(0.88, 0.035, 5, 28), 0, 2.36, 0.08, Math.PI / 2, 0, 0, 1.03, 1.2, 1), tint: '#e8b84a' },
    // 乗れる板（上面 = ELEPHANT_DECK_Y）
    { g: at(new THREE.BoxGeometry(1.25, 0.14, 1.9), 0, ELEPHANT_DECK_Y - 0.07, 0.1), tint: KC.wood },
    { g: at(new THREE.BoxGeometry(1.3, 0.3, 0.12), 0, ELEPHANT_DECK_Y - 0.25, -0.86), tint: KC.woodDark },
    { g: at(new THREE.BoxGeometry(1.3, 0.3, 0.12), 0, ELEPHANT_DECK_Y - 0.25, 1.06), tint: KC.woodDark },
    // 前後の低い手すり（乗るのをじゃましない高さ）
    { g: at(new THREE.BoxGeometry(1.3, 0.16, 0.08), 0, ELEPHANT_DECK_Y + 0.08, -0.82), tint: KC.wood },
    { g: at(new THREE.BoxGeometry(1.3, 0.16, 0.08), 0, ELEPHANT_DECK_Y + 0.08, 1.02), tint: KC.wood },
  ]
  // 両わきにつるした荷物（かごと布の包み）
  for (const s of [-1, 1]) {
    load.push({ g: at(new THREE.CylinderGeometry(0.3, 0.24, 0.6, 10), s * 0.98, 1.95, -0.2), tint: KC.basket })
    load.push({ g: at(new THREE.CylinderGeometry(0.28, 0.22, 0.55, 10), s * 0.96, 1.98, 0.5), tint: '#b8945a' })
    load.push({ g: at(new THREE.SphereGeometry(0.34, 10, 8), s * 0.92, 2.42, 0.15, 0, 0, 0, 1, 0.8, 1.3), tint: s > 0 ? '#2d5fae' : '#2f8a4a' })
    load.push({ g: at(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), s * 0.75, 2.4, -0.2, 0, 0, s * 0.6), tint: '#6a4a28' })
  }
  // 鼻（付け根がまわる：原点が付け根）
  const trunkCurve = new THREE.CatmullRomCurve3([v(0, 0, 0), v(0, -0.45, -0.22), v(0, -1.0, -0.26), v(0, -1.42, -0.1), v(0, -1.58, -0.28)])
  const trunk = new THREE.TubeGeometry(trunkCurve, 14, 0.15, 8, false)
  // 先ほど細く
  const tp = trunk.attributes.position as THREE.BufferAttribute
  const tuv = trunk.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < tp.count; i++) {
    const t = tuv.getX(i)
    const p = trunkCurve.getPointAt(Math.min(1, t))
    const k = 1 - t * 0.55
    tp.setXYZ(i, p.x + (tp.getX(i) - p.x) * k, p.y + (tp.getY(i) - p.y) * k, p.z + (tp.getZ(i) - p.z) * k)
  }
  // 足（原点が付け根、下へのびる）。つま先の爪
  const legParts: Part[] = [
    { g: at(new THREE.CylinderGeometry(0.26, 0.23, LEG_LEN, 10), 0, -LEG_LEN / 2, 0), tint: skin },
    { g: at(new THREE.CylinderGeometry(0.25, 0.27, 0.12, 10), 0, -LEG_LEN + 0.06, 0), tint: '#d8d0c4' },
  ]
  return { skin: merge(body), load: merge(load), trunk: colored(trunk, skin), leg: merge(legParts) }
}

/** 足の InstancedMesh（全部の象で 1 つ） */
export class ElephantLegs {
  readonly mesh: THREE.InstancedMesh
  private n = 0

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max * 4)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.name = 'khmer_elephant_legs'
    this.mesh.count = 0
  }

  alloc(): number {
    const i = this.n
    this.n += 4
    this.mesh.count = this.n
    return i
  }
}

export class Elephant {
  readonly group = new THREE.Group()
  readonly walker: PingPongWalker
  /** 背中の乗れる板 */
  readonly deck: KinematicBox
  private readonly trunk: THREE.Mesh
  private readonly legs: ElephantLegs
  private readonly legBase: number
  private yaw: number
  private gait = 0
  private moving = 0
  private readonly m = new THREE.Matrix4()
  private readonly m2 = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly deckPos = new THREE.Vector3()
  private t = Math.random() * 10

  constructor(geos: ReturnType<typeof elephantGeometries>, mats: { skin: THREE.Material; load: THREE.Material }, legs: ElephantLegs, walker: PingPongWalker, bodies: KhmerBodies) {
    this.walker = walker
    this.legs = legs
    this.legBase = legs.alloc()
    const skin = new THREE.Mesh(geos.skin, mats.skin)
    const load = new THREE.Mesh(geos.load, mats.load)
    this.trunk = new THREE.Mesh(geos.trunk, mats.skin)
    this.trunk.position.set(0, 2.05, -2.0)
    for (const o of [skin, load, this.trunk]) {
      o.castShadow = true
      o.receiveShadow = true
    }
    this.group.add(skin, load, this.trunk)
    this.group.name = 'khmer_elephant'
    this.yaw = Math.atan2(-walker.heading.x, -walker.heading.z)
    this.deck = bodies.addKinematic(new KinematicBox(v(1.2, 0.3, 1.85)))
    this.place(true)
  }

  /** 背中の板の上面（足場の目印・乗る所） */
  get deckTop(): THREE.Vector3 {
    return this.deckPos.clone().setY(this.deckPos.y + 0.15)
  }

  update(dt: number): void {
    this.t += dt
    this.walker.update(dt)
    const want = Math.atan2(-this.walker.heading.x, -this.walker.heading.z)
    let d = want - this.yaw
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    // 端でゆっくり向きを変える（その場で足ぶみ）
    const turning = Math.abs(d) > 0.05
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), dt * 0.7)
    const target = this.walker.moving || turning ? 1 : 0
    this.moving += (target - this.moving) * Math.min(1, dt * 3)
    this.gait += dt * (this.walker.moving ? this.walker.speed * 0.62 : turning ? 0.5 : 0)
    this.place(false)
  }

  private place(teleport: boolean): void {
    const p = this.walker.pos
    const bob = Math.abs(Math.sin(this.gait * Math.PI * 2)) * 0.035 * this.moving
    this.group.position.set(p.x, p.y + bob, p.z)
    this.group.rotation.y = this.yaw
    // 鼻のゆれ
    this.trunk.rotation.x = Math.sin(this.t * 0.9) * 0.12 + 0.05
    this.trunk.rotation.z = Math.sin(this.t * 0.6 + 1) * 0.08
    // 足
    this.group.updateMatrix()
    for (let i = 0; i < 4; i++) {
      const ph = (this.gait + LEG_PHASE[i]) * Math.PI * 2
      const swing = Math.sin(ph) * 0.32 * this.moving
      const lift = Math.max(0, Math.cos(ph)) * 0.06 * this.moving
      const [hx, hz] = HIPS[i]
      this.q.setFromAxisAngle(v(1, 0, 0), swing)
      this.m2.compose(v(hx, LEG_LEN + lift - bob, hz), this.q, v(1, 1, 1))
      this.m.multiplyMatrices(this.group.matrix, this.m2)
      this.legs.mesh.setMatrixAt(this.legBase + i, this.m)
    }
    this.legs.mesh.instanceMatrix.needsUpdate = true
    // 背中の板（物理）
    const c = Math.cos(this.yaw)
    const s = Math.sin(this.yaw)
    const lz = 0.1
    this.deckPos.set(p.x + s * lz, p.y + bob + ELEPHANT_DECK_Y - 0.15, p.z + c * lz)
    this.deck.setPose(this.deckPos, this.yaw, teleport)
  }
}

/** 象たち（足は 1 つの InstancedMesh） */
export class ElephantHerd {
  readonly group = new THREE.Group()
  readonly list: Elephant[] = []
  private readonly geos = elephantGeometries()
  private readonly legs: ElephantLegs
  private readonly mats: { skin: THREE.Material; load: THREE.Material }

  constructor(mats: { skin: THREE.Material; load: THREE.Material }, max = 4) {
    this.mats = mats
    this.legs = new ElephantLegs(this.geos.leg, mats.skin, max)
    this.group.add(this.legs.mesh)
    this.group.name = 'khmer_elephants'
  }

  add(walker: PingPongWalker, bodies: KhmerBodies): Elephant {
    const e = new Elephant(this.geos, this.mats, this.legs, walker, bodies)
    this.list.push(e)
    this.group.add(e.group)
    return e
  }

  /** 乗れる板（PlatformRider に渡す） */
  get decks(): KinematicBox[] {
    return this.list.map((e) => e.deck)
  }

  update(dt: number): void {
    for (const e of this.list) e.update(dt)
  }
}
