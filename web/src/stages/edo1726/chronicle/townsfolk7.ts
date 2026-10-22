// 7 章（1726年 仕掛け横丁）の町の人。導入編の町人（../townsfolk.ts）を v7 へ写して、次を足したもの：
//   ・ほこらのそばのおばあさん・広場の時の鐘人形を見に来た人（v7 の舞台）。夜はだれも出ない（ステージが group を隠す）
//   ・F で話しかけられたら、しばらくネクマックスの方を向く（faceToward）
// 体（着物の釣り鐘形）・帯・頭（＋首・手）・袖・襟・目・髪（髷・島田・子どもの髪）を部品ごとに 1 つの InstancedMesh。
// 毎フレームの割り当ては無い（行列・ベクトルは使い回す）。吹き出し（mobTalkEdo7.ts）用に頭の上の位置を出す。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

/** 髪型：0 町人の髷（男）・1 島田（女）・2 子どもの髪・3 白髪の髷（年寄り） */
export type TownHair = 0 | 1 | 2 | 3

export type TownPersonDef = {
  /** 吹き出しの話者 ID（mob_lines_v7.json）。null は話さない人 */
  id: string | null
  x: number
  z: number
  /** 体の正面の向き（y 軸回り。0 = -Z を向く） */
  yaw: number
  h: number
  hair: TownHair
  cloth: string
  obi: string
  /** 通りを行き来する（x0 ↔ x1。z は固定） */
  walk?: { x0: number; x1: number; speed: number; t0: number }
}

const SKIN = ['#f2d0b4', '#eac09c', '#e2b28c', '#f6d8c0']
const HAIR_COL: Record<TownHair, string> = { 0: '#1c1612', 1: '#1a1414', 2: '#2a1d16', 3: '#cfc8bc' }
const COLLAR = new THREE.Color('#f4ecdc')

/**
 * 町の人の配置。南岸の通り（岸 z=7.5 〜 店の正面 z=14。茶屋 x≈-32、源兵衛の工房 x -21〜-12.2、路地 x -12.2〜-9.6）・
 * 工房の裏の広場（時の鐘人形 (-28.6, 41.2)。朝は台座の前 (-28.6, 36.9) にひざをついている）・路地のおく（ほこら (-11.2, 26.2)。東を向く）
 */
export const TOWNSFOLK: TownPersonDef[] = [
  // 立ち話の二人（茶運び人形のうわさ・時の鐘人形のうわさ）
  { id: 't_gossip_a', x: -27.5, z: 12.55, yaw: -Math.PI / 2 + 0.5, h: 1.52, hair: 1, cloth: '#3a4f7a', obi: '#c8a040' },
  { id: 't_gossip_b', x: -26.6, z: 12.9, yaw: Math.PI / 2 - 0.4, h: 1.5, hair: 1, cloth: '#8a3a32', obi: '#2a2f4a' },
  // 岸の大工（どの家にもからくり時計）
  { id: 't_carpenter', x: -23.0, z: 8.45, yaw: Math.PI - 0.6, h: 1.66, hair: 0, cloth: '#5a6a4a', obi: '#3a2a1a' },
  // 子ども（「あのからくり、どこの工房のん？」）。大工と近すぎると、F でどちらと話すか選びにくいので少しはなす
  { id: 't_child', x: -20.2, z: 10.1, yaw: Math.PI / 2 - 0.2, h: 1.08, hair: 2, cloth: '#c86a3a', obi: '#f2c84b' },
  // 茶屋のおかみ（茶運び人形のしくみ）
  { id: 't_teahouse', x: -33.2, z: 12.5, yaw: Math.PI - 0.2, h: 1.5, hair: 1, cloth: '#6a5a8a', obi: '#e8d8b0' },
  // 舟着き場の船頭（時の鐘が舟を出す合図）
  { id: 't_boatman', x: -29.4, z: 8.0, yaw: Math.PI + 0.9, h: 1.64, hair: 0, cloth: '#2f4466', obi: '#d8c8a0' },
  // 路地の入口の年寄り（源兵衛の家は代々の時計職人）
  { id: 't_elder', x: -10.6, z: 9.4, yaw: Math.PI / 2 + 0.3, h: 1.54, hair: 3, cloth: '#6a5040', obi: '#2a2620' },
  // 広場で時の鐘人形を見上げる人（体の中の歯車）
  { id: 't_plaza', x: -24.8, z: 34.6, yaw: 2.37, h: 1.62, hair: 0, cloth: '#4a3a5a', obi: '#c89a4a' },
  // 路地のおく：ほこらを守るおばあさん（東を向いて、朝日がさしこむ）
  { id: 't_shrine', x: -2.8, z: 29.2, yaw: 1.23, h: 1.42, hair: 3, cloth: '#5a4a62', obi: '#d8c8a8' },
  // 通りを行き来する人（話さない）
  { id: null, x: -30, z: 10.3, yaw: 0, h: 1.6, hair: 0, cloth: '#46506a', obi: '#a88a5a', walk: { x0: -35, x1: -22.5, speed: 0.95, t0: 2.0 } },
  { id: null, x: -8, z: 11.4, yaw: 0, h: 1.52, hair: 1, cloth: '#7a6a4a', obi: '#5a2a2a', walk: { x0: -10.2, x1: -2.5, speed: 0.85, t0: 9.0 } },
  { id: null, x: -40, z: 9.4, yaw: 0, h: 1.62, hair: 0, cloth: '#3a3a40', obi: '#8a6a3a', walk: { x0: -46, x1: -33.5, speed: 1.1, t0: 5.0 } },
]

function strip(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g
  out.deleteAttribute('uv')
  return out
}

/** 着物：裾はまっすぐ長く（足首まで）、帯で少しくびれ、肩は丸く */
function bodyGeo(): THREE.BufferGeometry {
  const prof: Array<[number, number]> = [
    [0.0, 0.0],
    [0.142, 0.0],
    [0.152, 0.03],
    [0.146, 0.3],
    [0.136, 0.55],
    [0.13, 0.62],
    [0.146, 0.74],
    [0.162, 0.84],
    [0.166, 0.9],
    [0.148, 0.95],
    [0.094, 0.985],
    [0.045, 1.0],
    [0.0, 1.0],
  ]
  const g = new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    12,
  )
  g.scale(1, 1, 0.76)
  return strip(g)
}

/** 袖（たもと。肩から下がる平たい袖） */
function sleeveGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const sl = new RoundedBoxGeometry(0.1, 0.34, 0.22, 1, 0.04)
    sl.rotateZ(s * 0.08)
    sl.translate(s * 0.196, 0.73, 0.0)
    parts.push(strip(sl))
  }
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
    const hand = new THREE.SphereGeometry(0.036, 8, 6)
    hand.translate(s * 0.17, 0.56, -0.08)
    parts.push(hand)
  }
  return mergeGeometries(parts.map(strip))!
}

/** 襟（胸の前の白い V。右前） */
function collarGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const s of [-1, 1]) {
    const b = new THREE.BoxGeometry(0.04, 0.2, 0.012)
    b.rotateZ(s * 0.5)
    b.rotateX(-0.25)
    b.translate(s * 0.037, 0.875, -0.124)
    parts.push(strip(b))
  }
  return mergeGeometries(parts)!
}

/** 髪型（頭の中心が原点） */
function hairGeo(style: TownHair): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  if (style === 0 || style === 3) {
    // 髷：後ろ頭の髪＋月代（頭頂は肌が見えるので髪は後ろと横だけ）＋頭の上の小さな髷
    const back = new THREE.SphereGeometry(0.127, 12, 8, Math.PI * 0.15, Math.PI * 1.7, Math.PI * 0.3, Math.PI * 0.45)
    back.scale(1, 1.05, 1)
    parts.push(back)
    const mage = new THREE.CapsuleGeometry(0.018, 0.09, 3, 6)
    mage.rotateX(Math.PI / 2 - 0.25)
    mage.translate(0, 0.13, 0.0)
    parts.push(mage)
    const bun = new THREE.SphereGeometry(0.028, 8, 6)
    bun.translate(0, 0.125, 0.06)
    parts.push(bun)
  } else if (style === 1) {
    // 島田：前髪・左右の鬢・後ろの髱・頭の上の大きな髷
    const cap = new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62)
    cap.scale(1.05, 1.08, 1)
    parts.push(cap)
    const top = new THREE.SphereGeometry(0.07, 10, 7)
    top.scale(1.25, 0.75, 0.95)
    top.translate(0, 0.15, 0.02)
    parts.push(top)
    const tabo = new THREE.SphereGeometry(0.06, 8, 6)
    tabo.scale(1.2, 0.8, 1)
    tabo.translate(0, -0.02, 0.11)
    parts.push(tabo)
    for (const s of [-1, 1]) {
      const bin = new THREE.SphereGeometry(0.05, 8, 6)
      bin.scale(0.7, 1, 1)
      bin.translate(s * 0.115, 0.0, 0.02)
      parts.push(bin)
    }
  } else {
    // 子ども：おかっぱの短い髪
    const cap = new THREE.SphereGeometry(0.128, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.66)
    cap.scale(1, 1.05, 1)
    cap.translate(0, 0.01, 0.01)
    parts.push(cap)
    const bangs = new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)
    bangs.scale(1.1, 0.42, 0.55)
    bangs.translate(0, 0.05, -0.07)
    parts.push(bangs)
  }
  return mergeGeometries(parts.map(strip))!
}

export class Townsfolk {
  readonly group = new THREE.Group()
  readonly defs: readonly TownPersonDef[]
  /** いまの足元の位置（歩く人は毎フレーム動く。吹き出し用に読む） */
  readonly positions: THREE.Vector3[]
  private readonly yaw: Float32Array
  private readonly ph: Float32Array
  private readonly meshes: THREE.InstancedMesh[]
  private readonly hairMesh: THREE.InstancedMesh[]
  private readonly hairSlot: Array<{ mesh: number; slot: number }>
  private readonly body: THREE.InstancedMesh
  private readonly obi: THREE.InstancedMesh
  private readonly skin: THREE.InstancedMesh
  private readonly arms: THREE.InstancedMesh
  private readonly collar: THREE.InstancedMesh
  private readonly eyes: THREE.InstancedMesh
  private t = 0
  /** 話しかけられたときに向く向きと、残りの秒 */
  private readonly faceYaw: Float32Array
  private readonly faceT: Float32Array
  /** 空を見上げる（0〜1）と、見上げる先 */
  private lookUp = 0
  private lookUpTarget = 0
  private readonly lookAt = new THREE.Vector3()
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly scl = new THREE.Vector3()

  constructor(defs: readonly TownPersonDef[] = TOWNSFOLK) {
    this.defs = defs
    this.group.name = 'townsfolk'
    const N = defs.length
    this.positions = defs.map((d) => new THREE.Vector3(d.x, 0, d.z))
    this.yaw = new Float32Array(defs.map((d) => d.yaw))
    this.ph = new Float32Array(defs.map((_, i) => i * 1.37 + 0.4))
    this.faceYaw = new Float32Array(N)
    this.faceT = new Float32Array(N)
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n = N, cast = true) => {
      const im = new THREE.InstancedMesh(geo, mat, n)
      im.castShadow = cast
      im.receiveShadow = true
      im.frustumCulled = false
      return im
    }
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.88 })
    const skinM = new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: new THREE.Color('#3a2418'), emissiveIntensity: 0.25 })
    const hairM = new THREE.MeshStandardMaterial({ roughness: 0.5 })
    this.body = mk(bodyGeo(), cloth)
    const obiGeo = strip(new THREE.CylinderGeometry(0.138, 0.136, 0.1, 12, 1, true))
    obiGeo.scale(1, 1, 0.78)
    obiGeo.translate(0, 0.62, 0)
    this.obi = mk(obiGeo, cloth)
    this.skin = mk(skinGeo(), skinM)
    this.arms = mk(sleeveGeo(), cloth)
    this.collar = mk(collarGeo(), cloth, N, false)
    const eyeGeo = mergeGeometries(
      [-1, 1].map((s) => {
        // 顔から少し前へ出す（遠くからでも目が読めるように）
        const e = new THREE.SphereGeometry(0.017, 6, 4)
        e.scale(1, 1.45, 0.55)
        e.translate(s * 0.043, 1.1, -0.119)
        return strip(e)
      }),
    )!
    this.eyes = mk(eyeGeo, new THREE.MeshBasicMaterial({ color: '#1a1414' }), N, false)
    const counts = [0, 0, 0, 0]
    for (const d of defs) counts[d.hair]++
    this.hairMesh = ([0, 1, 2, 3] as const).map((st) => {
      const g = hairGeo(st)
      g.translate(0, 1.105, 0)
      return mk(g, hairM, Math.max(1, counts[st]))
    })
    this.hairSlot = []
    const used = [0, 0, 0, 0]
    const rnd = (i: number) => SKIN[(i * 7) % SKIN.length]
    defs.forEach((d, i) => {
      const c = new THREE.Color(d.cloth)
      this.body.setColorAt(i, c)
      this.arms.setColorAt(i, c)
      this.obi.setColorAt(i, new THREE.Color(d.obi))
      this.skin.setColorAt(i, new THREE.Color(rnd(i)))
      this.collar.setColorAt(i, COLLAR)
      const slot = used[d.hair]++
      this.hairSlot.push({ mesh: d.hair, slot })
      this.hairMesh[d.hair].setColorAt(slot, new THREE.Color(HAIR_COL[d.hair]))
    })
    this.hairMesh.forEach((h, k) => (h.count = counts[k]))
    this.meshes = [this.body, this.obi, this.skin, this.arms, this.collar, this.eyes]
    this.group.add(...this.meshes, ...this.hairMesh)
    this.write()
  }

  /** 頭の上（吹き出しの付け根）の位置を out に */
  head(i: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.positions[i]
    return out.set(p.x, this.defs[i].h + 0.32, p.z)
  }

  /** i が sec 秒のあいだ p の方を向く（話しかけられたとき） */
  faceToward(i: number, p: THREE.Vector3, sec = 6): void {
    const pos = this.positions[i]
    this.faceYaw[i] = Math.atan2(-(p.x - pos.x), -(p.z - pos.z))
    this.faceT[i] = sec
  }

  /** 空の一点を見上げる。null で元へ */
  lookToward(p: THREE.Vector3 | null): void {
    if (p) this.lookAt.copy(p)
    this.lookUpTarget = p ? 1 : 0
  }

  update(dt: number): void {
    this.t += dt
    this.lookUp += (this.lookUpTarget - this.lookUp) * Math.min(1, dt * 2.5)
    // 話しかけられた人は、ゆっくりふり向き、時間がたったら元の向きへ
    for (let i = 0; i < this.defs.length; i++) {
      this.faceT[i] = Math.max(0, this.faceT[i] - dt)
      const want = this.faceT[i] > 0 ? this.faceYaw[i] : this.defs[i].yaw
      let d = want - this.yaw[i]
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.yaw[i] += d * Math.min(1, dt * 5)
    }
    this.write()
  }

  private write(): void {
    const t = this.t
    const defs = this.defs
    for (let i = 0; i < defs.length; i++) {
      const d = defs[i]
      const pos = this.positions[i]
      let yaw = this.yaw[i]
      let bob = Math.sin(t * 1.6 + this.ph[i]) * 0.006
      let pitch = 0
      if (d.walk) {
        const w = d.walk
        const len = w.x1 - w.x0
        const s = ((t + w.t0) * w.speed) % (len * 2)
        const fwd = s < len
        pos.x = fwd ? w.x0 + s : w.x1 - (s - len)
        yaw = fwd ? -Math.PI / 2 : Math.PI / 2
        bob = Math.abs(Math.sin(t * 6.5 + this.ph[i])) * 0.028
      } else if (this.lookUp > 0.01) {
        // 黒い輪の方へ向き直って、少し見上げる
        const want = Math.atan2(-(this.lookAt.x - pos.x), -(this.lookAt.z - pos.z))
        let dy = want - yaw
        while (dy > Math.PI) dy -= Math.PI * 2
        while (dy < -Math.PI) dy += Math.PI * 2
        yaw += dy * this.lookUp
        pitch = 0.12 * this.lookUp
      }
      const s = d.h / 1.22
      this.e.set(-pitch * 0.4, yaw + Math.sin(t * 0.7 + this.ph[i]) * 0.04, 0, 'YXZ')
      this.q.setFromEuler(this.e)
      this.scl.set(s, s * (1 + bob), s)
      this.m.compose(pos, this.q, this.scl)
      for (const im of this.meshes) im.setMatrixAt(i, this.m)
      const hs = this.hairSlot[i]
      this.hairMesh[hs.mesh].setMatrixAt(hs.slot, this.m)
    }
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true
    for (const im of this.hairMesh) im.instanceMatrix.needsUpdate = true
  }
}
