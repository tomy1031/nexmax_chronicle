// 1970年 万博の来場者（モブ）。部品ごとに InstancedMesh 1 つ（胴・頭・髪・脚・腕・帽子）で、全員を数回の描画で出す。
// ・歩き回る人（決めた範囲の中で、次の行き先を選んで歩く）／立ち止まる人（列・おしゃべり）
// ・欠けが出たら、その場所から逃げる（flee）
// ・係員・迷子の子・親など、ステージが動かす人は role='script'（walkTo・face・setVisible で動かす）
// 1970年の服：明るい原色のシャツ・ワンピース、帽子、子どもは半ズボン。当たり判定は持たない（柱などの円はよける）。
import * as THREE from 'three'

export type VisitorRole = 'wander' | 'idle' | 'script'

export type VisitorDef = {
  role: VisitorRole
  pos: THREE.Vector3
  /** 向き（正面 -Z を回す角度） */
  yaw?: number
  /** 歩き回る範囲 */
  area?: { x0: number; x1: number; z0: number; z1: number }
  kid?: boolean
  /** 帽子（係員の帽子は stage が付け外しする） */
  hat?: 'none' | 'straw' | 'cap' | 'staff'
  /** 吹き出しの ID（mob_lines_1970.json）。無ければ話さない */
  id?: string
  shirt?: THREE.ColorRepresentation
  pants?: THREE.ColorRepresentation
  dress?: boolean
}

type V = {
  d: VisitorDef
  pos: THREE.Vector3
  yaw: number
  h: number
  speed: number
  target: THREE.Vector3 | null
  wait: number
  phase: number
  flee: number
  fleeFrom: THREE.Vector3
  visible: boolean
  hat: 'none' | 'straw' | 'cap' | 'staff'
  wave: number
  onArrive: (() => void) | null
  walkSpeed: number
}

const SHIRTS = ['#e8442e', '#f0a020', '#2a8ad8', '#f6d040', '#30a878', '#f4f0e8', '#d85aa0', '#6a4ac8', '#ff7a3a', '#3ac0d8']
const PANTS = ['#2a3044', '#5a4a3a', '#e8e0d0', '#3a5a8a', '#2a2a2a', '#7a6a4a']
const SKIN = ['#f2cba8', '#e8b890', '#f6d6bc', '#dcae88']
const HAIR = ['#1a1614', '#2a201a', '#3a2c22', '#151515']
const HAT_COLOR = { none: '#000000', straw: '#e8d8a0', cap: '#d84a2a', staff: '#2a3a6a' } as const

/** 柱・噴水など、よける円（x, z, 半径） */
export type Obstacle = [number, number, number]

export class Visitors {
  readonly group = new THREE.Group()
  private readonly list: V[] = []
  private readonly meshes: Record<'torso' | 'skirt' | 'head' | 'hair' | 'legL' | 'legR' | 'armL' | 'armR' | 'hat', THREE.InstancedMesh>
  private readonly obstacles: Obstacle[]
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly e = new THREE.Euler()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly c = new THREE.Color()
  private rng: () => number

  constructor(defs: VisitorDef[], obstacles: Obstacle[], seed = 70) {
    let a = seed >>> 0
    this.rng = () => {
      a = (a + 0x6d2b79f5) >>> 0
      let t = a
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    this.obstacles = obstacles
    const n = defs.length
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.8 })
    const mk = (g: THREE.BufferGeometry, name: string) => {
      const im = new THREE.InstancedMesh(g, mat, n)
      im.name = `visitor_${name}`
      im.castShadow = true
      im.receiveShadow = false
      im.frustumCulled = false
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.group.add(im)
      return im
    }
    const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8)
    // 部品は足元原点・身長 1 のときの形（あとで身長で拡大）
    const torso = cap(0.12, 0.2)
    const skirt = new THREE.CylinderGeometry(0.11, 0.2, 0.3, 10)
    const head = new THREE.SphereGeometry(0.085, 12, 10)
    const hair = new THREE.SphereGeometry(0.09, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)
    const leg = cap(0.045, 0.34)
    leg.translate(0, -0.21, 0)
    const arm = cap(0.035, 0.26)
    arm.translate(0, -0.16, 0)
    const hat = new THREE.CylinderGeometry(0.1, 0.13, 0.06, 12)
    this.meshes = { torso: mk(torso, 'torso'), skirt: mk(skirt, 'skirt'), head: mk(head, 'head'), hair: mk(hair, 'hair'), legL: mk(leg, 'legL'), legR: mk(leg.clone(), 'legR'), armL: mk(arm, 'armL'), armR: mk(arm.clone(), 'armR'), hat: mk(hat, 'hat') }
    for (const d of defs) this.add(d)
  }

  private add(d: VisitorDef): number {
    const r = this.rng
    const i = this.list.length
    const h = d.kid ? 0.95 + r() * 0.2 : 1.55 + r() * 0.2
    const v: V = {
      d,
      pos: d.pos.clone(),
      yaw: d.yaw ?? r() * Math.PI * 2,
      h,
      speed: 0,
      target: null,
      wait: r() * 3,
      phase: r() * 10,
      flee: 0,
      fleeFrom: new THREE.Vector3(),
      visible: true,
      hat: d.hat ?? (r() < 0.3 ? 'straw' : r() < 0.25 ? 'cap' : 'none'),
      wave: 0,
      onArrive: null,
      walkSpeed: d.kid ? 1.5 : 1.05 + r() * 0.35,
    }
    this.list.push(v)
    const M = this.meshes
    const dress = d.dress ?? (!d.kid && r() < 0.35)
    const shirt = this.c.set(d.shirt ?? SHIRTS[Math.floor(r() * SHIRTS.length)])
    M.torso.setColorAt(i, shirt)
    M.skirt.setColorAt(i, dress ? shirt : this.c.set('#000000'))
    const skin = new THREE.Color(SKIN[Math.floor(r() * SKIN.length)])
    M.armL.setColorAt(i, skin)
    M.armR.setColorAt(i, skin)
    M.head.setColorAt(i, skin)
    M.hair.setColorAt(i, this.c.set(HAIR[Math.floor(r() * HAIR.length)]))
    const pants = dress ? skin : this.c.set(d.pants ?? PANTS[Math.floor(r() * PANTS.length)]).clone()
    M.legL.setColorAt(i, pants)
    M.legR.setColorAt(i, pants)
    M.hat.setColorAt(i, this.c.set(HAT_COLOR[v.hat]))
    ;(v as V & { dress: boolean }).dress = dress
    return i
  }

  get count(): number {
    return this.list.length
  }

  /** 頭の上（吹き出しの付け根） */
  head(i: number, out: THREE.Vector3): THREE.Vector3 {
    const v = this.list[i]
    return out.set(v.pos.x, v.pos.y + v.h + 0.25, v.pos.z)
  }

  position(i: number): THREE.Vector3 {
    return this.list[i].pos
  }

  height(i: number): number {
    return this.list[i].h
  }

  isVisible(i: number): boolean {
    return this.list[i].visible
  }

  setVisible(i: number, on: boolean): void {
    this.list[i].visible = on
  }

  setHat(i: number, hat: 'none' | 'straw' | 'cap' | 'staff'): void {
    this.list[i].hat = hat
    this.meshes.hat.setColorAt(i, this.c.set(HAT_COLOR[hat]))
    if (this.meshes.hat.instanceColor) this.meshes.hat.instanceColor.needsUpdate = true
  }

  /** 向きを変える（止まっている人） */
  face(i: number, x: number, z: number): void {
    const v = this.list[i]
    v.yaw = Math.atan2(-(x - v.pos.x), -(z - v.pos.z))
  }

  teleport(i: number, p: THREE.Vector3, yaw?: number): void {
    const v = this.list[i]
    v.pos.copy(p)
    v.target = null
    v.onArrive = null
    if (yaw !== undefined) v.yaw = yaw
  }

  /** 歩かせる（script の人）。着いたら done */
  walkTo(i: number, p: THREE.Vector3, speed = 1.4, done: (() => void) | null = null): void {
    const v = this.list[i]
    v.target = p.clone()
    v.walkSpeed = speed
    v.onArrive = done
  }

  /** 手を振る（秒） */
  wave(i: number, sec = 2): void {
    this.list[i].wave = sec
  }

  /** 欠けが出た：近くの人は逃げる */
  scare(from: THREE.Vector3, radius: number, sec = 5): void {
    for (const v of this.list) {
      if (v.d.role === 'script' || !v.visible) continue
      if (Math.hypot(v.pos.x - from.x, v.pos.z - from.z) < radius) {
        v.flee = sec
        v.fleeFrom.copy(from)
      }
    }
  }

  update(dt: number, avoid: readonly THREE.Vector3[]): void {
    const r = this.rng
    for (const v of this.list) {
      if (!v.visible) continue
      v.phase += dt
      v.wave = Math.max(0, v.wave - dt)
      let mx = 0
      let mz = 0
      let sp = 0
      if (v.flee > 0) {
        v.flee -= dt
        const dx = v.pos.x - v.fleeFrom.x
        const dz = v.pos.z - v.fleeFrom.z
        const d = Math.hypot(dx, dz) || 1
        mx = dx / d
        mz = dz / d
        sp = 3.4
        if (v.flee <= 0) v.target = null
      } else if (v.target) {
        const dx = v.target.x - v.pos.x
        const dz = v.target.z - v.pos.z
        const d = Math.hypot(dx, dz)
        if (d < 0.15) {
          v.target = null
          v.wait = 1.5 + r() * 4
          const cb = v.onArrive
          v.onArrive = null
          cb?.()
        } else {
          mx = dx / d
          mz = dz / d
          sp = Math.min(v.walkSpeed, d * 3)
        }
      } else if (v.d.role === 'wander' && v.d.area) {
        v.wait -= dt
        if (v.wait <= 0) {
          const A = v.d.area
          v.target = new THREE.Vector3(A.x0 + r() * (A.x1 - A.x0), 0, A.z0 + r() * (A.z1 - A.z0))
          v.walkSpeed = (v.d.kid ? 1.5 : 1.05) + r() * 0.35
        }
      }
      // よける：プレイヤー・仲間・柱
      for (const a of avoid) {
        const dx = v.pos.x - a.x
        const dz = v.pos.z - a.z
        const d = Math.hypot(dx, dz)
        if (d < 0.85 && d > 1e-3) {
          v.pos.x += (dx / d) * (0.85 - d) * Math.min(1, dt * 8)
          v.pos.z += (dz / d) * (0.85 - d) * Math.min(1, dt * 8)
        }
      }
      for (const [ox, oz, or] of this.obstacles) {
        const dx = v.pos.x - ox
        const dz = v.pos.z - oz
        const d = Math.hypot(dx, dz)
        const R = or + 0.35
        if (d < R && d > 1e-3) {
          v.pos.x = ox + (dx / d) * R
          v.pos.z = oz + (dz / d) * R
          if (v.target && v.d.role === 'wander') v.target = null
        }
      }
      if (sp > 0) {
        v.pos.x += mx * sp * dt
        v.pos.z += mz * sp * dt
        const want = Math.atan2(-mx, -mz)
        let dd = want - v.yaw
        while (dd > Math.PI) dd -= Math.PI * 2
        while (dd < -Math.PI) dd += Math.PI * 2
        v.yaw += dd * Math.min(1, dt * 8)
      }
      v.speed = sp
    }
  }

  /** 見た目（行列）。一時停止中も呼ぶ（dt=0） */
  render(): void {
    const M = this.meshes
    const zero = this.m.makeScale(0, 0, 0)
    for (let i = 0; i < this.list.length; i++) {
      const v = this.list[i]
      if (!v.visible) {
        for (const k of Object.keys(M) as Array<keyof typeof M>) M[k].setMatrixAt(i, zero)
        continue
      }
      const h = v.h
      const walk = Math.min(1, v.speed / 1.4)
      const cyc = v.phase * (v.speed > 2 ? 11 : 7.5)
      const bob = Math.abs(Math.sin(cyc)) * 0.025 * walk * h
      const sw = Math.sin(cyc) * 0.55 * walk
      const breath = Math.sin(v.phase * 2) * 0.004
      const dress = (v as V & { dress: boolean }).dress
      const cy = Math.cos(v.yaw)
      const sy = Math.sin(v.yaw)
      const place = (mesh: THREE.InstancedMesh, lx: number, ly: number, lz: number, rx: number, sx: number, syy: number, sz: number) => {
        this.p.set(v.pos.x + (lx * cy + lz * sy) * h, v.pos.y + ly * h + bob, v.pos.z + (-lx * sy + lz * cy) * h)
        this.e.set(rx, v.yaw, 0, 'YXZ')
        this.q.setFromEuler(this.e)
        this.s.set(sx * h, syy * h, sz * h)
        this.m.compose(this.p, this.q, this.s)
        mesh.setMatrixAt(i, this.m)
      }
      place(M.legL, -0.06, 0.5, 0, sw, 1, 1, 1)
      place(M.legR, 0.06, 0.5, 0, -sw, 1, 1, 1)
      place(M.torso, 0, 0.68 + breath, 0, 0, 1, 1, 0.8)
      if (dress) place(M.skirt, 0, 0.5, 0, 0, 1, 1, 0.9)
      else M.skirt.setMatrixAt(i, zero)
      const waveA = v.wave > 0 ? -2.6 + Math.sin(v.phase * 12) * 0.3 : sw * 0.8
      place(M.armL, -0.15, 0.83, 0, -sw * 0.8, 1, 1, 1)
      place(M.armR, 0.15, 0.83, 0, waveA, 1, 1, 1)
      place(M.head, 0, 0.97, 0, 0, 1, 1.05, 1)
      place(M.hair, 0, 0.985, 0.008, -0.15, 1, 1, 1)
      if (v.hat === 'none') M.hat.setMatrixAt(i, zero)
      else if (v.hat === 'straw') place(M.hat, 0, 1.06, 0, 0, 1.5, 1, 1.5)
      else place(M.hat, 0, 1.065, 0, 0, 0.9, 1.4, 0.9)
    }
    for (const k of Object.keys(M) as Array<keyof typeof M>) M[k].instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    for (const im of Object.values(this.meshes)) {
      im.geometry.dispose()
      im.dispose()
    }
    ;((this.meshes.torso.material as THREE.Material) ?? null)?.dispose()
  }
}
