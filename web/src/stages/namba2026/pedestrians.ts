// 遊歩道を歩く人たち（軽い手続きモデル：丸い頭・服の胴・振れる脚。Tripo は使わない）。
// 1 人 = 上半身（頭・胴・腕・髪・鞄をまとめた 1 メッシュ）＋左右の脚 2 本。頂点カラーで服の色を変える。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32, pick, range } from '../../render/noise'

type Walker = {
  root: THREE.Group
  legL: THREE.Object3D
  legR: THREE.Object3D
  armSwing: THREE.Object3D
  x0: number
  x1: number
  z: number
  speed: number
  dir: number
  phase: number
  x: number
  pause: number
}

const SKIN = ['#f2c8a8', '#e8b892', '#d8a07a', '#f6d4b8']
const TOP = ['#3a5a9a', '#e8e4dc', '#c84a3a', '#2a2d33', '#6a8a5a', '#e8a83a', '#8a6aa8', '#f2f0ea', '#3a8aa8']
const BOTTOM = ['#2a3040', '#4a4a50', '#6a5a4a', '#20242c', '#8a8e96', '#3a4a6a']
const HAIR = ['#1a1410', '#3a2a1e', '#5a3a22', '#2a2622', '#8a6a4a']

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

const T = (x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz))

export class Pedestrians {
  readonly group = new THREE.Group()
  private readonly walkers: Walker[] = []
  private readonly mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })

  constructor(lanes: Array<{ x0: number; x1: number; z: number; n: number }>, seed = 26) {
    this.group.name = 'pedestrians'
    const rng = mulberry32(seed)
    for (const lane of lanes) {
      for (let i = 0; i < lane.n; i++) {
        const h = range(rng, 1.5, 1.72)
        const skin = pick(rng, SKIN)
        const top = pick(rng, TOP)
        const bottom = pick(rng, BOTTOM)
        const hair = pick(rng, HAIR)
        const s = h / 1.7
        const parts: THREE.BufferGeometry[] = []
        const sph = new THREE.SphereGeometry(1, 14, 10)
        const cap = new THREE.CapsuleGeometry(1, 1, 4, 10)
        // 少し大きめの頭（マツイ社長たちと同じ、やわらかい等身）・目・首・髪
        const hs = 1.3
        parts.push(colored(sph, skin, T(0, 1.58 * s, 0, 0.115 * s * hs, 0.13 * s * hs, 0.12 * s * hs)))
        const longHair = rng() < 0.4
        parts.push(colored(sph, hair, T(0, 1.65 * s, 0.02 * s, 0.124 * s * hs, 0.11 * s * hs, 0.128 * s * hs)))
        if (longHair) parts.push(colored(cap, hair, T(0, 1.5 * s, 0.07 * s, 0.11 * s * hs, 0.08 * s, 0.07 * s)))
        for (const e of [-1, 1]) parts.push(colored(sph, '#1a1410', T(e * 0.045 * s * hs, 1.585 * s, -0.142 * s, 0.014 * s, 0.02 * s, 0.01 * s)))
        parts.push(colored(cap, skin, T(0, 1.4 * s, 0, 0.045 * s, 0.03 * s, 0.045 * s)))
        parts.push(colored(cap, top, T(0, 1.13 * s, 0, 0.18 * s, 0.17 * s, 0.12 * s)))
        if (rng() < 0.5) parts.push(colored(new THREE.BoxGeometry(1, 1, 1), pick(rng, ['#2a2622', '#8a5a3a', '#e8e0d0']), T(0.17 * s, 1.0 * s, 0.05 * s, 0.08 * s, 0.24 * s, 0.2 * s)))
        const body = new THREE.Mesh(mergeGeometries(parts, false) as THREE.BufferGeometry, this.mat)
        body.castShadow = true
        const root = new THREE.Group()
        root.add(body)
        // 腕（左右まとめて胴の前後に振る）
        const arms = new THREE.Group()
        arms.position.y = 1.36 * s
        const armGeo = mergeGeometries(
          [-1, 1].flatMap((e) => [colored(cap, top, T(e * 0.2 * s, -0.22 * s, 0, 0.05 * s, 0.15 * s, 0.05 * s)), colored(sph, skin, T(e * 0.205 * s, -0.47 * s, 0, 0.045 * s, 0.05 * s, 0.045 * s))]),
          false,
        ) as THREE.BufferGeometry
        const armMesh = new THREE.Mesh(armGeo, this.mat)
        armMesh.castShadow = true
        arms.add(armMesh)
        root.add(arms)
        const leg = (sx: number) => {
          const g = new THREE.Group()
          g.position.set(sx * 0.085 * s, 0.86 * s, 0)
          const geo = mergeGeometries([colored(cap, bottom, T(0, -0.4 * s, 0, 0.078 * s, 0.3 * s, 0.078 * s)), colored(new THREE.BoxGeometry(1, 1, 1), pick(rng, ['#2a2a2a', '#f2f2f2', '#8a5a3a']), T(0, -0.83 * s, -0.04 * s, 0.1 * s, 0.07 * s, 0.21 * s))], false) as THREE.BufferGeometry
          const m = new THREE.Mesh(geo, this.mat)
          m.castShadow = true
          g.add(m)
          root.add(g)
          return g
        }
        const legL = leg(-1)
        const legR = leg(1)
        const x = range(rng, lane.x0, lane.x1)
        root.position.set(x, 0, lane.z + range(rng, -0.4, 0.4))
        this.group.add(root)
        this.walkers.push({ root, legL, legR, armSwing: arms, x0: lane.x0, x1: lane.x1, z: root.position.z, speed: range(rng, 1.0, 1.45), dir: rng() < 0.5 ? 1 : -1, phase: rng() * 10, x, pause: 0 })
      }
    }
  }

  /** obstacles：ぶつからないようにする相手（プレイヤー・仲間）。進む先にいたら立ち止まって引き返す */
  update(dt: number, obstacles: readonly THREE.Vector3[] = []): void {
    for (const w of this.walkers) {
      if (w.pause <= 0) {
        const nx = w.x + w.dir * 0.9
        for (const o of obstacles) {
          if (Math.abs(o.x - nx) < 0.75 && Math.abs(o.z - w.root.position.z) < 0.85 && (o.x - w.x) * w.dir > 0) {
            w.dir *= -1
            w.pause = 0.7 + Math.random()
            break
          }
        }
      }
      if (w.pause > 0) {
        w.pause -= dt
        w.legL.rotation.x = w.legR.rotation.x = 0
        w.armSwing.rotation.x = 0
        continue
      }
      w.x += w.dir * w.speed * dt
      if (w.x > w.x1 || w.x < w.x0) {
        w.dir *= -1
        w.x = Math.min(w.x1, Math.max(w.x0, w.x))
        w.pause = 0.6 + Math.random() * 1.5
      }
      w.phase += dt * w.speed * 4.2
      const s = Math.sin(w.phase)
      w.legL.rotation.x = s * 0.5
      w.legR.rotation.x = -s * 0.5
      w.armSwing.rotation.x = -s * 0.12
      w.root.position.x = w.x
      w.root.position.y = Math.abs(Math.cos(w.phase)) * 0.025
      w.root.rotation.y = w.dir > 0 ? -Math.PI / 2 : Math.PI / 2
    }
  }
}
