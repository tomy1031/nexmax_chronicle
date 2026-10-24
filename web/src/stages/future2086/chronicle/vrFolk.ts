// IDO の VR（物語 v7.2）の人：ソラのブースのまわりで VR のゴーグルをつけて昔を見ているお客さんと、記録の景色の中を歩く人。
// 軽い手続きの人形（2026 年の通行人 namba2026/pedestrians.ts と同じ作り）：胴（頭以外をまとめた 1 メッシュ）＋頭（髪・目・ゴーグル）＋
// 腕 2 本＋脚 2 本。頂点カラーで服の色を変える。ゴーグルの前の光る帯だけ別の発光の材質（ブルームで光る）。
// ゴーグルの人は、見えている昔の町を見回す（頭を左右・上へ）。ときどき、見えている物へ手をのばす（さわれない）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { ColliderList } from '../../../world/colliders'
import { F } from '../layout'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type FolkSpec = {
  /** 身長（m） */
  h: number
  skin: string
  top: string
  bottom: string
  hair: string
  /** VR のゴーグル（頭のバンドつき） */
  goggles?: boolean
  /** 長い腰布・衣（足首まで。1186 年の人・お坊さん） */
  robe?: boolean
  /** 長い髪 */
  longHair?: boolean
  /** 肩にかける布（お坊さんのたすき） */
  sash?: string
}

export type Folk = {
  root: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  /** 頭の高さ（足もとから） */
  headY: number
}

function colored(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4): THREE.BufferGeometry {
  const out = (g.index ? g.toNonIndexed() : g.clone()) as THREE.BufferGeometry
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k)
  out.applyMatrix4(m)
  const c = new THREE.Color(color)
  const n = out.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r
    col[i * 3 + 1] = c.g
    col[i * 3 + 2] = c.b
  }
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return out
}

const T = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz))

/** 人形の材質（頂点カラー）と、ゴーグルの光る帯の材質。呼ぶ側が 1 組作って使い回す（解放は root ごと、シェルが） */
export function folkMaterials(): { body: THREE.MeshStandardMaterial; glow: THREE.MeshBasicMaterial } {
  return {
    body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }),
    glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 2.2, 3.2), toneMapped: false }),
  }
}

const SPH = new THREE.SphereGeometry(1, 14, 10)
const CAP = new THREE.CapsuleGeometry(1, 1, 4, 10)
const BOX = new THREE.BoxGeometry(1, 1, 1)
const CONE = new THREE.CylinderGeometry(0.62, 1, 1, 12, 1)

/** 人形を 1 人作る（足もとが原点、正面は -Z） */
export function buildFolk(spec: FolkSpec, mats: ReturnType<typeof folkMaterials>): Folk {
  const s = spec.h / 1.7
  const hs = 1.3
  const root = new THREE.Group()
  root.name = 'folk'
  // 胴（首・胴・腰布）
  const body: THREE.BufferGeometry[] = []
  body.push(colored(CAP, spec.skin, T(0, 1.4 * s, 0, 0.045 * s, 0.03 * s, 0.045 * s)))
  body.push(colored(CAP, spec.top, T(0, 1.13 * s, 0, 0.18 * s, 0.17 * s, 0.12 * s)))
  if (spec.robe) body.push(colored(CONE, spec.bottom, T(0, 0.5 * s, 0, 0.2 * s, 0.86 * s, 0.15 * s)))
  if (spec.sash) body.push(colored(BOX, spec.sash, T(0.02 * s, 1.15 * s, 0, 0.06 * s, 0.5 * s, 0.25 * s, 0, 0, -0.5)))
  const bodyMesh = new THREE.Mesh(mergeGeometries(body, false) as THREE.BufferGeometry, mats.body)
  bodyMesh.castShadow = true
  root.add(bodyMesh)
  // 頭（髪・目・ゴーグル）。首の付け根を回る
  const head = new THREE.Group()
  head.position.y = 1.45 * s
  const hp: THREE.BufferGeometry[] = []
  hp.push(colored(SPH, spec.skin, T(0, 0.13 * s, 0, 0.115 * s * hs, 0.13 * s * hs, 0.12 * s * hs)))
  hp.push(colored(SPH, spec.hair, T(0, 0.2 * s, 0.02 * s, 0.124 * s * hs, 0.11 * s * hs, 0.128 * s * hs)))
  if (spec.longHair) hp.push(colored(CAP, spec.hair, T(0, 0.05 * s, 0.07 * s, 0.11 * s * hs, 0.08 * s, 0.07 * s)))
  if (spec.goggles) {
    // ゴーグル（目をおおう箱）と、頭のまわりのバンド
    hp.push(colored(BOX, '#1d2540', T(0, 0.14 * s, -0.135 * s, 0.25 * s * hs, 0.085 * s * hs, 0.08 * s * hs)))
    hp.push(colored(BOX, '#f2f4f8', T(0, 0.14 * s, -0.115 * s, 0.27 * s * hs, 0.1 * s * hs, 0.05 * s * hs)))
    const band = new THREE.TorusGeometry(0.152 * s * hs, 0.012 * s, 6, 24)
    hp.push(colored(band, '#2a3150', T(0, 0.14 * s, 0, 1, 1, 1, Math.PI / 2)))
    band.dispose()
  } else {
    for (const e of [-1, 1]) hp.push(colored(SPH, '#1a1410', T(e * 0.045 * s * hs, 0.135 * s, -0.142 * s, 0.014 * s, 0.02 * s, 0.01 * s)))
  }
  const headMesh = new THREE.Mesh(mergeGeometries(hp, false) as THREE.BufferGeometry, mats.body)
  headMesh.castShadow = true
  head.add(headMesh)
  if (spec.goggles) {
    // 前の光る帯（見ている映像の光）
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22 * s * hs, 0.022 * s * hs, 0.01), mats.glow)
    strip.position.set(0, 0.14 * s, -0.177 * s * hs)
    head.add(strip)
  }
  root.add(head)
  // 腕（肩で回る）
  const arm = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.2 * s, 1.36 * s, 0)
    const geo = mergeGeometries([colored(CAP, spec.top, T(0, -0.22 * s, 0, 0.05 * s, 0.15 * s, 0.05 * s)), colored(SPH, spec.skin, T(0, -0.47 * s, 0, 0.045 * s, 0.05 * s, 0.045 * s))], false) as THREE.BufferGeometry
    const m = new THREE.Mesh(geo, mats.body)
    m.castShadow = true
    g.add(m)
    root.add(g)
    return g
  }
  const armL = arm(-1)
  const armR = arm(1)
  // 脚（腰で回る）。衣の人は衣の下に足先だけ
  const leg = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.085 * s, 0.86 * s, 0)
    const parts = spec.robe
      ? [colored(BOX, '#3a2a1e', T(0, -0.83 * s, -0.05 * s, 0.09 * s, 0.06 * s, 0.18 * s))]
      : [colored(CAP, spec.bottom, T(0, -0.4 * s, 0, 0.078 * s, 0.3 * s, 0.078 * s)), colored(BOX, '#2a2a2a', T(0, -0.83 * s, -0.04 * s, 0.1 * s, 0.07 * s, 0.21 * s))]
    const m = new THREE.Mesh(mergeGeometries(parts, false) as THREE.BufferGeometry, mats.body)
    m.castShadow = true
    g.add(m)
    root.add(g)
    return g
  }
  const legL = leg(-1)
  const legR = leg(1)
  return { root, head, armL, armR, legL, legR, headY: 1.58 * s }
}

/** 歩かせる（phase：脚の振りの位相 rad） */
export function walkPose(f: Folk, phase: number, amount = 1): void {
  const s = Math.sin(phase)
  f.legL.rotation.x = s * 0.5 * amount
  f.legR.rotation.x = -s * 0.5 * amount
  f.armL.rotation.x = -s * 0.32 * amount
  f.armR.rotation.x = s * 0.32 * amount
}

// ------------------------------------------------------------------ ソラのブースのまわりの、ゴーグルのお客さん

type Visitor = { f: Folk; ph: number; reach: boolean; kid: boolean; yaw0: number }

/** ゴーグルのお客さん（わっかの前の、体験の場所）。わっか（F.PORTAL）の正面を基準に置く */
const P = F.PORTAL
const N = v(Math.sin(P.yaw), 0, Math.cos(P.yaw))
const SIDE = v(N.z, 0, -N.x)
const at = (fwd: number, side: number) => v(P.x, F.BOOTH.h, P.z).addScaledVector(N, fwd).addScaledVector(SIDE, side)

const VISITORS: ReadonlyArray<{ pos: THREE.Vector3; spec: FolkSpec; reach?: boolean; kid?: boolean; turn?: number }> = [
  // わっかの前の、左側（展示の台・ソラの操作卓のほうは空けておく。どれもブースの台の上）
  { pos: at(1.4, -2.0), spec: { h: 1.62, skin: '#f1cdb0', top: '#3d7fd9', bottom: '#29314d', hair: '#2a1e1a', goggles: true }, turn: 0.5 },
  { pos: at(2.2, -2.6), spec: { h: 1.55, skin: '#e5b896', top: '#f5a6c6', bottom: '#1c2135', hair: '#56392a', goggles: true, longHair: true }, reach: true, turn: -0.3 },
  { pos: at(3.2, -1.2), spec: { h: 1.12, skin: '#f7dcc8', top: '#ffcf3f', bottom: '#3a4767', hair: '#1b1517', goggles: true }, kid: true, turn: 0.9 },
  { pos: at(1.2, -3.0), spec: { h: 1.7, skin: '#d29f7a', top: '#2fb39a', bottom: '#2e3442', hair: '#121318', goggles: true }, turn: -0.8 },
]

/** ソラのブースの、ゴーグルで昔を見ているお客さん（見回す・手をのばす） */
export class VrVisitors {
  readonly group = new THREE.Group()
  /** お客さんのまん中（胸の高さ。カメラで見せる所） */
  readonly center = new THREE.Vector3()
  private readonly list: Visitor[] = []
  private t = 0

  constructor(root: THREE.Object3D, col: ColliderList | null, mats = folkMaterials()) {
    this.group.name = 'vr_visitors'
    VISITORS.forEach((d, i) => {
      const f = buildFolk(d.spec, mats)
      f.root.position.copy(d.pos)
      // わっかのほうを向いて、少しずつ別の方を見ている
      const yaw0 = Math.atan2(-(P.x - d.pos.x), -(P.z - d.pos.z)) + (d.turn ?? 0)
      f.root.rotation.y = yaw0
      this.group.add(f.root)
      this.list.push({ f, ph: i * 1.9 + 0.4, reach: !!d.reach, kid: !!d.kid, yaw0 })
      col?.box(d.pos.x, d.pos.y + 0.8, d.pos.z, 0.5, 1.6, 0.5)
      this.center.add(d.pos)
    })
    this.center.divideScalar(Math.max(1, VISITORS.length)).add(v(0, 1.25, 0))
    root.add(this.group)
  }

  setVisible(on: boolean): void {
    this.group.visible = on
  }

  update(dt: number): void {
    if (!this.group.visible) return
    this.t += dt
    const t = this.t
    for (const v of this.list) {
      const f = v.f
      // 見回す：ゆっくり左右と、少し上を見上げる（昔の町の屋根や空）
      f.head.rotation.order = 'YXZ'
      f.head.rotation.y = Math.sin(t * 0.45 + v.ph) * 0.75 + Math.sin(t * 1.3 + v.ph * 2) * 0.12
      f.head.rotation.x = 0.18 + Math.sin(t * 0.33 + v.ph * 1.7) * 0.2
      // 体も少しだけ向きを変える
      f.root.rotation.y = v.yaw0 + Math.sin(t * 0.21 + v.ph) * 0.35
      // 子どもは、うれしくて少しはねる
      if (v.kid) f.root.position.y = F.BOOTH.h + Math.max(0, Math.sin(t * 5.2 + v.ph)) * 0.05
      if (v.reach) {
        // 見えている物へ手をのばして、さわれずに引っこめる
        const k = Math.max(0, Math.sin(t * 0.7 + v.ph))
        // （腕は下へ下がっているので、x を + に回すと前へ上がる）
        f.armR.rotation.x = k * 1.35
        f.armR.rotation.z = k * 0.15
        f.armL.rotation.x = k * 0.4
      } else {
        f.armL.rotation.x = Math.sin(t * 0.9 + v.ph) * 0.08
        f.armR.rotation.x = -Math.sin(t * 0.9 + v.ph) * 0.08
      }
    }
  }
}
