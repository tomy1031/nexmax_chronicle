// 祭りの人出：浴衣や未来の服の人たち（やわらかい形の簡単な人形をインスタンスで描く）。
// 体（浴衣の釣り鐘形）・帯・頭・髪・腕を部品ごとに 1 つの InstancedMesh（色はインスタンスごと）。
// 屋台の前・展示の前・ステージの前・回廊の上・北の通りに群れを置く。ゆっくり体を揺らし、何人かは歩く。
// 夜（オルム）は広場の人がいなくなる（避難した）ことにして隠す。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { uTime } from '../../render/materials'
import { mulberry32, pick, range } from '../../render/noise'
import type { ColliderList } from '../../world/colliders'
import { F } from './layout'

type Person = {
  pos: THREE.Vector3
  yaw: number
  h: number
  ph: number
  /** 歩く人：a ↔ b を往復（speed は m/s、t0 は位相） */
  walk?: { ax: number; az: number; bx: number; bz: number; speed: number; t0: number }
  /** 夜も残る（回廊の上・遠くの通り） */
  keepAtNight: boolean
  cloth: THREE.Color
  obi: THREE.Color
  skin: THREE.Color
  hair: THREE.Color
  style: number
}

const CLOTH = ['#2f4f9e', '#c8384a', '#f2a5c0', '#3b8f8a', '#f0e6d2', '#6a4fb0', '#e9884a', '#264070', '#ffffff', '#9fc8ea', '#d94f7a', '#4a6a3a']
const OBI = ['#f2c84b', '#d23a3a', '#ffffff', '#2a2f4a', '#ff8fb8', '#5fc8e8']
const SKIN = ['#f6d2b8', '#eec3a0', '#e0ad86', '#f8dcc6', '#c99272']
const HAIR = ['#2a1d18', '#3d2a1f', '#1c1a22', '#5a3a26', '#7a4a2a', '#2c2c38', '#c99a6a']
const COLLAR = ['#ffffff', '#f4ecdc', '#fff6f0'].map((c) => new THREE.Color(c))

function bodyGeo(): THREE.BufferGeometry {
  // 浴衣：裾はまっすぐ、帯のところで少しくびれ、胸と肩は丸く
  const prof: Array<[number, number]> = [
    [0.0, 0.0],
    [0.15, 0.0],
    [0.163, 0.035],
    [0.152, 0.3],
    [0.138, 0.55],
    [0.132, 0.62],
    [0.148, 0.74],
    [0.163, 0.84],
    [0.168, 0.9],
    [0.15, 0.95],
    [0.095, 0.985],
    [0.045, 1.0],
    [0.0, 1.0],
  ]
  const g = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    12,
  )
  g.scale(1, 1, 0.76)
  return g
}

/** 浴衣の袖（肩から下がる平たい袖） */
function sleeveGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const sl = new RoundedBoxGeometry(0.11, 0.32, 0.24, 1, 0.045)
    sl.rotateZ(s * 0.1)
    sl.translate(s * 0.198, 0.74, 0.0)
    parts.push(sl.toNonIndexed())
  }
  for (const p of parts) p.deleteAttribute('uv')
  return mergeGeometries(parts)!
}

/** 肌：頭＋首＋手（袖の先） */
function skinGeo(): THREE.BufferGeometry {
  const head = new THREE.SphereGeometry(0.12, 12, 9)
  head.scale(1, 1.05, 1)
  head.translate(0, 1.105, 0)
  const neck = new THREE.CylinderGeometry(0.042, 0.048, 0.08, 8, 1, true)
  neck.translate(0, 1.0, 0)
  const parts = [head, neck]
  for (const s of [-1, 1]) {
    const hand = new THREE.SphereGeometry(0.038, 8, 6)
    hand.scale(0.9, 1.1, 0.9)
    hand.translate(s * 0.19, 0.565, -0.07)
    parts.push(hand)
  }
  for (const p of parts) p.deleteAttribute('uv')
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!
}

/** 襟（胸の前の白い V） */
function collarGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const b = new THREE.BoxGeometry(0.04, 0.2, 0.012)
    b.rotateZ(s * 0.5)
    b.rotateX(-0.25)
    b.translate(s * 0.037, 0.875, -0.124)
    parts.push(b.toNonIndexed())
  }
  for (const p of parts) p.deleteAttribute('uv')
  return mergeGeometries(parts)!
}

/** 髪型：0 ボブ・1 お団子・2 ポニーテール・3 短髪。どれも前髪付き */
function hairGeo(style: number): THREE.BufferGeometry {
  const reach = style === 0 ? 0.72 : style === 3 ? 0.5 : 0.6
  const cap = new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * reach)
  cap.scale(1, 1.05, 1)
  cap.translate(0, 0.012, 0.01)
  const parts: THREE.BufferGeometry[] = [cap]
  const bangs = new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
  bangs.scale(1.1, 0.42, 0.55)
  bangs.translate(0, 0.055, -0.07)
  parts.push(bangs)
  if (style === 0) {
    // 後ろ髪（あごの高さまで）
    const back = new THREE.CylinderGeometry(0.128, 0.122, 0.12, 12, 1, true, -Math.PI * 0.75, Math.PI * 1.5)
    back.translate(0, -0.035, 0.012)
    parts.push(back)
  } else if (style === 1) {
    const bun = new THREE.SphereGeometry(0.058, 8, 6)
    bun.translate(0, 0.1, 0.075)
    parts.push(bun)
  } else if (style === 2) {
    const tail = new THREE.CapsuleGeometry(0.036, 0.15, 3, 6)
    tail.rotateX(-0.25)
    tail.translate(0, -0.05, 0.12)
    parts.push(tail)
  }
  for (const p of parts) p.deleteAttribute('uv')
  return mergeGeometries(parts.map((p) => p.toNonIndexed()))!
}

export type Crowd = {
  group: THREE.Group
  update(dt: number): void
  setNight(on: boolean): void
}

export function buildCrowd(root: THREE.Group, col: ColliderList | null): Crowd {
  const rng = mulberry32(8086)
  const people: Person[] = []
  const add = (x: number, z: number, yaw: number, o: { y?: number; keep?: boolean; walk?: Person['walk']; child?: boolean; collide?: boolean } = {}) => {
    const h = o.child ? range(rng, 1.0, 1.2) : range(rng, 1.5, 1.74)
    people.push({
      pos: new THREE.Vector3(x, o.y ?? 0, z),
      yaw,
      h,
      ph: rng() * 10,
      walk: o.walk,
      keepAtNight: !!o.keep,
      cloth: new THREE.Color(pick(rng, CLOTH)),
      obi: new THREE.Color(pick(rng, OBI)),
      skin: new THREE.Color(pick(rng, SKIN)),
      hair: new THREE.Color(pick(rng, HAIR)),
      style: Math.floor(rng() * 4),
    })
    if (col && (o.collide ?? ((o.y ?? 0) < 1 && !o.walk))) col.box(x, 0.8, z, 0.42, 1.6, 0.42)
  }
  const look = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z)) + range(rng, -0.35, 0.35)
  const group2 = (cx: number, cz: number, n: number, r: number, tx: number, tz: number, o: { y?: number; keep?: boolean } = {}) => {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2
      const rr = Math.sqrt(rng()) * r
      const x = cx + Math.cos(a) * rr
      const z = cz + Math.sin(a) * rr
      add(x, z, look(x, z, tx, tz), { ...o, child: rng() < 0.15 })
    }
  }
  // 屋台の前（列）
  for (const z of F.STALLS.zs) group2(F.STALLS.x - F.STALLS.d / 2 - 1.6, z + range(rng, -0.6, 0.6), 3, 0.9, F.STALLS.x, z)
  // ステージの前（観客）
  group2((F.STAGE.x0 + F.STAGE.x1) / 2 - 0.4, F.STAGE.z1 + 2.6, 7, 1.8, (F.STAGE.x0 + F.STAGE.x1) / 2, (F.STAGE.z0 + F.STAGE.z1) / 2)
  // 展示の前（少し離れて見物）
  group2(F.BOOTH.x + 4.6, F.BOOTH.z + 5.6, 3, 1.0, F.PORTAL.x, F.PORTAL.z)
  // 広場の中のあちこち（2〜3 人の連れ）
  for (const [x, z] of [
    [-3.2, 12.2],
    [9.6, 4.8],
    [-1.0, -10.6],
    [10.4, -3.8],
    [-12.6, 6.4],
    [9.2, 13.2],
  ] as const) group2(x, z, 2 + Math.floor(rng() * 2), 0.7, x + range(rng, -3, 3), z + range(rng, -3, 3))
  // 回廊の上（手すりに沿って）
  for (let z = 8; z > -14; z -= 2.6) if (rng() < 0.7) add(F.WALK_W.x1 - 0.7 - rng() * 0.6, z, -Math.PI / 2 + range(rng, -0.6, 0.6), { y: F.WALK_Y, keep: true, collide: false })
  for (let x = -14; x < 19; x += 2.4) {
    if (x > F.GAP.x0 - 1.2 && x < F.GAP.x1 + 1.2) continue
    if (rng() < 0.6) add(x, F.WALK_N.z1 - 0.7 - rng() * 0.8, Math.PI + range(rng, -0.6, 0.6), { y: F.WALK_Y, keep: true, collide: false })
  }
  // 北の通り（遠く・多く）
  for (let i = 0; i < 34; i++) {
    const z = range(rng, -24, -66)
    const x = range(rng, F.STREET.x0 + 0.8, F.STREET.x1 - 0.8)
    add(x, z, rng() < 0.5 ? 0 : Math.PI, { keep: true, collide: false })
  }
  // 歩く人（広場の南側・北の回廊の下・通りを往復）
  const walkers: Array<[number, number, number, number]> = [
    [-6, 12.6, 12, 12.6],
    [12, 10.8, -4, 10.8],
    [-3.5, -11.6, 6.5, -11.6],
    [-1.5, -14, -1.5, -40],
    [2.5, -42, 2.5, -16],
    [-4, 16.5, 7, 9.5],
  ]
  walkers.forEach(([ax, az, bx, bz], i) => add(ax, az, 0, { walk: { ax, az, bx, bz, speed: range(rng, 0.9, 1.25), t0: i * 3.7 }, collide: false }))

  // ---- インスタンス
  const N = people.length
  const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.InstancedMesh(geo, mat, N)
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    return m
  }
  const cloth = new THREE.MeshStandardMaterial({ roughness: 0.85 })
  const skinM = new THREE.MeshStandardMaterial({ roughness: 0.6 })
  const hairM = new THREE.MeshStandardMaterial({ roughness: 0.55 })
  const body = mk(bodyGeo(), cloth)
  const obiGeo = new THREE.CylinderGeometry(0.142, 0.14, 0.085, 12, 1, true)
  obiGeo.scale(1, 1, 0.78)
  obiGeo.translate(0, 0.62, 0)
  const obi = mk(obiGeo, cloth)
  const skin = mk(skinGeo(), skinM)
  const arms = mk(sleeveGeo(), cloth)
  const collar = mk(collarGeo(), cloth)
  collar.castShadow = false
  // 目（小さな黒い点を 2 つ）
  const eyeGeo = mergeGeometries(
    [-1, 1].map((s) => {
      const e = new THREE.SphereGeometry(0.0135, 6, 4)
      e.scale(1, 1.45, 0.6)
      e.translate(s * 0.042, 1.1, -0.116)
      e.deleteAttribute('uv')
      return e.toNonIndexed()
    }),
  )!
  const eyes = mk(eyeGeo, new THREE.MeshBasicMaterial({ color: '#1a1414' }))
  eyes.castShadow = false
  const hairs = [0, 1, 2, 3].map((st) => {
    const g = hairGeo(st)
    g.translate(0, 1.105, 0)
    return mk(g, hairM)
  })
  const counts = [0, 0, 0, 0]
  for (let i = 0; i < N; i++) {
    const p = people[i]
    body.setColorAt(i, p.cloth)
    arms.setColorAt(i, p.cloth)
    obi.setColorAt(i, p.obi)
    skin.setColorAt(i, p.skin)
    collar.setColorAt(i, COLLAR[i % COLLAR.length])
  }
  // 髪型ごとに詰める
  const hairIdx: Array<{ mesh: number; slot: number }> = []
  for (let i = 0; i < N; i++) {
    const st = people[i].style
    hairIdx.push({ mesh: st, slot: counts[st]++ })
    hairs[st].setColorAt(counts[st] - 1, people[i].hair)
  }
  hairs.forEach((h, k) => (h.count = counts[k]))
  const group = new THREE.Group()
  group.name = 'crowd'
  group.add(body, obi, skin, arms, collar, eyes, ...hairs)
  root.add(group)

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const pos = new THREE.Vector3()
  const scl = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  let night = false
  const write = () => {
    const t = uTime.value
    for (let i = 0; i < N; i++) {
      const p = people[i]
      let visible = !night || p.keepAtNight
      let yaw = p.yaw
      pos.copy(p.pos)
      let bob = Math.sin(t * 1.6 + p.ph) * 0.006
      if (p.walk) {
        const w = p.walk
        const len = Math.hypot(w.bx - w.ax, w.bz - w.az)
        const d = ((t + w.t0) * w.speed) % (len * 2)
        const fwd = d < len
        const k = fwd ? d / len : 2 - d / len
        pos.set(w.ax + (w.bx - w.ax) * k, 0, w.az + (w.bz - w.az) * k)
        const dx = (w.bx - w.ax) * (fwd ? 1 : -1)
        const dz = (w.bz - w.az) * (fwd ? 1 : -1)
        yaw = Math.atan2(-dx, -dz)
        bob = Math.abs(Math.sin(t * 7 + p.ph)) * 0.03
        if (night) visible = false
      }
      const s = visible ? p.h / 1.22 : 0
      q.setFromAxisAngle(up, yaw + Math.sin(t * 0.7 + p.ph) * 0.05)
      scl.set(s, s * (1 + bob), s)
      m.compose(pos, q, scl)
      body.setMatrixAt(i, m)
      obi.setMatrixAt(i, m)
      skin.setMatrixAt(i, m)
      arms.setMatrixAt(i, m)
      collar.setMatrixAt(i, m)
      eyes.setMatrixAt(i, m)
      const hi = hairIdx[i]
      hairs[hi.mesh].setMatrixAt(hi.slot, m)
    }
    for (const x of [body, obi, skin, arms, collar, eyes, ...hairs]) x.instanceMatrix.needsUpdate = true
  }
  write()
  return {
    group,
    update(dt: number) {
      void dt
      write()
    },
    setNight(on: boolean) {
      night = on
      write()
    },
  }
}
