// 階段と、落ちてくる石。
// ・BigStairs：中央の塔へ上がる大階段（夜のボス戦の場所）。8 区切り × 3 段。collapseStep(i) で区切り i の段がくずれ落ち、
//   その区切りは低い平らな所になる（上の区切りとのあいだに 1.2m の壁 → 跳んでも届かない）。restoreStep でもどる。
//   当たり判定は physKhmer の ToggleBox（入れたり切ったり）
// ・FallingStone：上から落ちてくる石。止める（setFrozen）とその場で止まり、乗れる（KinematicBox）
// ・buildFlight：小さな塔の階段（静的。くずれた区切りは平らな所＋がれき）
// 段の見た目は 1 つのメッシュ（PartMesh）にまとめ、くずれる段だけ頂点を動かす（描画呼び出し 1 回）
import * as THREE from 'three'
import { rbox } from '../../render/batch'
import { mulberry32 } from '../../render/noise'
import { K } from './layout'
import { StoneFallLogic, stairSegment, type StonePhase } from './khmerLogic'
import { KinematicBox, ToggleBox, type KhmerBodies } from './physKhmer'
import { box, collideRamp, rampBox, shade, type KCtx } from './kitKhmer'
import { KC } from './materialsKhmer'
import type { Burst } from './fxKhmer'
import type { Freezable } from './mirrors'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ 部品ごとに動かせる 1 つのメッシュ

/** いくつかの部品を 1 つのジオメトリにまとめ、部品ごとに行列をかけ直せる（頂点を CPU で書きかえる） */
export class PartMesh {
  readonly mesh: THREE.Mesh
  private readonly base: Float32Array
  private readonly baseN: Float32Array
  private readonly ranges: Array<[number, number]> = []
  private readonly m3 = new THREE.Matrix3()
  private readonly p = new THREE.Vector3()

  constructor(parts: Array<{ geo: THREE.BufferGeometry; matrix: THREE.Matrix4; tint: THREE.ColorRepresentation }>, mat: THREE.Material, texM = 2) {
    const pos: number[] = []
    const nor: number[] = []
    const uv: number[] = []
    const col: number[] = []
    const idx: number[] = []
    const cc = new THREE.Color()
    for (const part of parts) {
      const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone()
      g.computeVertexNormals()
      g.applyMatrix4(part.matrix)
      const start = pos.length / 3
      const P = g.attributes.position as THREE.BufferAttribute
      const N = g.attributes.normal as THREE.BufferAttribute
      cc.set(part.tint)
      for (let i = 0; i < P.count; i++) {
        pos.push(P.getX(i), P.getY(i), P.getZ(i))
        nor.push(N.getX(i), N.getY(i), N.getZ(i))
        // 箱の投影の UV（面の向きで 2 軸をえらぶ）
        const ax = Math.abs(N.getX(i))
        const ay = Math.abs(N.getY(i))
        const az = Math.abs(N.getZ(i))
        if (ay >= ax && ay >= az) uv.push(P.getX(i) / texM, P.getZ(i) / texM)
        else if (ax >= az) uv.push(P.getZ(i) / texM, P.getY(i) / texM)
        else uv.push(P.getX(i) / texM, P.getY(i) / texM)
        col.push(cc.r, cc.g, cc.b)
        idx.push(start + i)
      }
      this.ranges.push([start, P.count])
      g.dispose()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    geo.computeBoundingSphere()
    this.base = new Float32Array(pos)
    this.baseN = new Float32Array(nor)
    this.mesh = new THREE.Mesh(geo, mat)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
  }

  get count(): number {
    return this.ranges.length
  }

  /** 部品 i に（もとの位置からの）行列 m をかける。null でもとの位置 */
  setPart(i: number, m: THREE.Matrix4 | null): void {
    const [s, n] = this.ranges[i]
    const P = this.mesh.geometry.attributes.position as THREE.BufferAttribute
    const N = this.mesh.geometry.attributes.normal as THREE.BufferAttribute
    if (m) this.m3.getNormalMatrix(m)
    for (let k = s; k < s + n; k++) {
      this.p.set(this.base[k * 3], this.base[k * 3 + 1], this.base[k * 3 + 2])
      if (m) this.p.applyMatrix4(m)
      P.setXYZ(k, this.p.x, this.p.y, this.p.z)
      this.p.set(this.baseN[k * 3], this.baseN[k * 3 + 1], this.baseN[k * 3 + 2])
      if (m) this.p.applyMatrix3(this.m3).normalize()
      N.setXYZ(k, this.p.x, this.p.y, this.p.z)
    }
    P.needsUpdate = true
    N.needsUpdate = true
  }

  /** 部品の中心（もとの位置） */
  center(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    const [s, n] = this.ranges[i]
    out.set(0, 0, 0)
    for (let k = s; k < s + n; k++) out.x += this.base[k * 3]
    for (let k = s; k < s + n; k++) out.y += this.base[k * 3 + 1]
    for (let k = s; k < s + n; k++) out.z += this.base[k * 3 + 2]
    return out.multiplyScalar(1 / n)
  }
}

// ------------------------------------------------------------------ 落ちてくる石

const STONE_SIZE = v(0.92, 0.62, 0.92)
/**
 * 落ちてきた石が、くずれた所の床（上の壁の前）で休む秒数。足場にちょうどいい高さはそこだけで、
 * 休まないと 0.5 秒ほどで転がり落ちる（子どもには J が間に合わない）
 */
export const STONE_REST = 2.2

export class FallingStone {
  readonly id: string
  readonly logic: StoneFallLogic
  readonly mesh: THREE.Mesh
  readonly body: KinematicBox
  /** 石の中心（止めるクローで狙う所。毎フレーム動く） */
  readonly point = new THREE.Vector3()
  private readonly mat: THREE.MeshStandardMaterial
  private readonly ring: THREE.Mesh
  private readonly burst: Burst | null
  private spinAxis = new THREE.Vector3(1, 0, 0.3).normalize()
  private spin = 0
  /** 段階が変わったとき（落ちはじめた・消えた） */
  onPhase: ((p: StonePhase) => void) | null = null

  constructor(id: string, logic: StoneFallLogic, mat: THREE.MeshStandardMaterial, bodies: KhmerBodies, burst: Burst | null) {
    this.id = id
    this.logic = logic
    this.burst = burst
    this.mat = mat
    const g = rbox(STONE_SIZE.x, STONE_SIZE.y, STONE_SIZE.z, 0.08).clone()
    const n = g.attributes.position.count
    const col = new Float32Array(n * 3).fill(1)
    const c = new THREE.Color(KC.sandWarm)
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3)
    g.setAttribute('color', new THREE.BufferAttribute(col, 3))
    this.mesh = new THREE.Mesh(g, mat)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.visible = false
    this.mesh.name = `khmer_stone_${id}`
    // 止まっているときの青い輪
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.78, 0.035, 6, 36),
      new THREE.MeshBasicMaterial({ color: '#7ad0ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
    )
    this.ring.visible = false
    this.mesh.add(this.ring)
    this.body = bodies.addKinematic(new KinematicBox(STONE_SIZE, false))
    this.point.copy(logic.pos)
    const r = mulberry32(id.length * 31 + 7)
    this.spinAxis.set(r() - 0.5, 0.2, r() - 0.5).normalize()
  }

  get frozen(): boolean {
    return this.logic.frozen
  }

  /** 見えていて止められるか */
  get catchable(): boolean {
    return this.logic.catchable
  }

  /** 今止めれば足場にちょうどいい高さか */
  get inWindow(): boolean {
    return this.logic.inWindow
  }

  setFrozen(on: boolean): void {
    if (on && !this.logic.catchable) return
    this.logic.setFrozen(on)
    this.ring.visible = on
    this.mat.emissive.set(on ? '#2a6aa8' : '#000000')
    this.mat.emissiveIntensity = on ? 0.6 : 0
    // 止めている間は乗れる（向きをまっすぐにして、足場にしやすく）
    if (on) {
      this.mesh.quaternion.identity()
      this.body.setPose(this.logic.pos, 0, true)
      this.body.setEnabled(true)
    } else this.body.setEnabled(false)
  }

  /** 動かす・止める（false で隠れて止まる） */
  setActive(on: boolean, delay = 0): void {
    if (on) {
      if (!this.logic.active || this.logic.phase === 'hidden') this.logic.restart(delay)
    } else {
      this.logic.active = false
      this.logic.frozen = false
      this.mesh.visible = false
      this.ring.visible = false
      this.body.setEnabled(false)
    }
  }

  update(dt: number): void {
    const ph = this.logic.update(dt)
    const L = this.logic
    this.point.copy(L.pos)
    if (!L.active) {
      this.mesh.visible = false
      return
    }
    this.mesh.visible = L.phase !== 'hidden'
    this.mesh.position.copy(L.pos)
    if (!L.frozen) {
      if (L.phase === 'wobble') {
        // 上でぐらぐらゆれる
        const k = Math.sin(L.t * 26) * 0.06 * Math.min(1, L.t * 2)
        this.mesh.quaternion.setFromAxisAngle(this.spinAxis, k)
      } else if (L.phase === 'fall') {
        this.spin += dt * 3.2
        this.mesh.quaternion.setFromAxisAngle(this.spinAxis, this.spin * 0.25)
      }
      const s = L.phase === 'fade' ? Math.max(0.01, 1 - L.t / L.fade) : 1
      this.mesh.scale.setScalar(s)
    } else {
      this.mesh.scale.setScalar(1)
      this.ring.rotation.z += dt * 2
    }
    if (ph === 'fade' && this.burst) this.burst.emit(L.pos, 14, { spread: 1.6, up: 1.2, color: '#b8a080', size: 0.7, life: 0.9 })
    if (ph === 'wobble' && this.burst) this.burst.emit(L.pos.clone().setY(L.pos.y + 0.3), 5, { spread: 0.6, up: 0.4, color: '#c8b090', size: 0.35, life: 0.6 })
    if (ph) this.onPhase?.(ph)
  }

  /** 「止める」の対象の形（フェーズ 2 で rt.chrono へ） */
  freezable(label = '落ちてくる石'): Freezable {
    return {
      id: `khmer_stone_${this.id}`,
      label,
      point: this.point,
      radius: 0.6,
      canFreeze: () => this.logic.catchable,
      setFrozen: (on) => this.setFrozen(on),
      isFrozen: () => this.logic.frozen,
      goodNow: () => this.logic.inWindow,
    }
  }
}

/** 区切りの壁の前で落ちる石の道すじ（上 → 平らな所 → 下のふちから落ちる） */
export function stonePath(foot: THREE.Vector3, up: THREE.Vector3, wallH: number, run: number): THREE.Vector3[] {
  // foot：くずれた区切りの平らな所の、上の壁のすぐ前（足もとの高さ）。up：上る向き（水平）
  const h = STONE_SIZE.y / 2
  const back = up.clone().multiplyScalar(-1)
  const p0 = foot.clone().addScaledVector(back, 0.5).setY(foot.y + wallH + 2.6 + h)
  const p1 = foot.clone().addScaledVector(back, 0.5).setY(foot.y + h)
  const p2 = foot.clone().addScaledVector(back, run - 0.35).setY(foot.y + h)
  const p3 = foot.clone().addScaledVector(back, run + 0.6).setY(foot.y - 0.9 + h)
  return [p0, p1, p2, p3]
}

// ------------------------------------------------------------------ 大階段

export class BigStairs {
  readonly group = new THREE.Group()
  readonly segs: number
  private readonly parts: PartMesh
  private readonly ramps: ToggleBox[] = []
  private readonly collapsed: boolean[] = []
  /** くずれ落ちる動き：区切りごとの経過（-1：動いていない） */
  private readonly fallT: number[] = []
  readonly stones: FallingStone[] = []
  private stonesOn = false
  private readonly burst: Burst | null
  private readonly stepsPerSeg: number
  private readonly fallDir: THREE.Vector3[] = []
  /** 段がくずれたとき */
  onCollapse: ((i: number) => void) | null = null

  constructor(c: KCtx, stoneMat: () => THREE.MeshStandardMaterial, burst: Burst | null) {
    const S = K.STAIRS
    this.segs = S.segs
    this.stepsPerSeg = S.steps
    this.burst = burst
    const tread = S.run / S.steps
    const stepH = S.rise / S.steps
    const width = S.z1 - S.z0
    const zc = (S.z0 + S.z1) / 2
    const parts: Array<{ geo: THREE.BufferGeometry; matrix: THREE.Matrix4; tint: THREE.ColorRepresentation }> = []
    const rng = mulberry32(186)
    for (let i = 0; i < S.segs; i++) {
      const seg = stairSegment(i)
      // 区切りの下の芯（平らな上面 = seg.y0）：静的な当たり判定と見た目
      if (seg.y0 > 0) {
        box(c, (seg.x0 + seg.x1) / 2, seg.y0 / 2, zc, S.run + 0.02, seg.y0, width, c.m.sandstone, { tint: KC.sandDark, texM: 3 })
        c.col.box((seg.x0 + seg.x1) / 2, seg.y0 / 2, zc, S.run, seg.y0, width)
      }
      // 段（3 つ）：芯の上にのる石。高さ 0.4・0.8・1.2
      for (let j = 0; j < S.steps; j++) {
        const h = stepH * (j + 1)
        const x0 = seg.x0 + tread * j
        const x1 = seg.x1 + 0.02
        const geo = new THREE.BoxGeometry(x1 - x0, h, width)
        const m = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, seg.y0 + h / 2, zc)
        parts.push({ geo, matrix: m, tint: shade(KC.sand, 0.92 + rng() * 0.14) })
      }
      // くずれた後のがれき（はじめは隠す）
      for (let k = 0; k < 5; k++) {
        const geo = new THREE.IcosahedronGeometry(0.22 + rng() * 0.2, 0)
        const m = new THREE.Matrix4().makeTranslation(seg.x0 + 0.2 + rng() * (S.run - 0.4), seg.y0 + 0.08, S.z0 + 0.4 + rng() * (width - 0.8))
        parts.push({ geo, matrix: m, tint: shade(KC.sandDark, 0.9 + rng() * 0.2) })
      }
      // 坂の当たり判定（くずれると切る）
      const a = v(seg.x0, seg.y0, zc)
      const b = v(seg.x1, seg.y1, zc)
      const r = rampBox(a, b, width, 0.6)
      this.ramps.push(c.bodies.addToggle(new ToggleBox(r.center, r.size, r.rotY, 0, r.rotZ)))
      this.collapsed.push(false)
      this.fallT.push(-1)
      this.fallDir.push(v(-1, 0, (rng() - 0.5) * 0.6).normalize())
      // 落ちてくる石（この区切りがくずれている間）
      const foot = v(seg.x1, seg.y0, zc + (rng() - 0.5) * 0.8)
      const logic = new StoneFallLogic({ path: stonePath(foot, v(1, 0, 0), S.rise, S.run), speed: 1.7, wobble: 1.4, gap: 1.6, window: { y0: seg.y0 + 0.4, y1: seg.y0 + 0.9 }, half: STONE_SIZE.y / 2, delay: i * 0.7, rest: STONE_REST })
      logic.active = false
      const st = new FallingStone(`stairs_${i}`, logic, stoneMat(), c.bodies, burst)
      this.stones.push(st)
      this.group.add(st.mesh)
    }
    this.parts = new PartMesh(parts, c.m.sandstone, 3)
    this.parts.mesh.name = 'khmer_big_stairs'
    this.group.add(this.parts.mesh)
    // がれきを隠す
    for (let i = 0; i < S.segs; i++) for (let k = 0; k < 5; k++) this.parts.setPart(this.rubbleIndex(i, k), HIDE)
  }

  private stepIndex(i: number, j: number): number {
    return i * (this.stepsPerSeg + 5) + j
  }

  private rubbleIndex(i: number, k: number): number {
    return i * (this.stepsPerSeg + 5) + this.stepsPerSeg + k
  }

  isCollapsed(i: number): boolean {
    return this.collapsed[i] ?? false
  }

  /** くずれている区切りの一覧 */
  get collapsedList(): number[] {
    return this.collapsed.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
  }

  /** 区切り i（0 が下）の段がくずれ落ちる。当たり判定を切り、低い平らな所にする */
  collapseStep(i: number, instant = false): void {
    if (i < 0 || i >= this.segs || this.collapsed[i]) return
    this.collapsed[i] = true
    this.ramps[i].setEnabled(false)
    if (instant) {
      for (let j = 0; j < this.stepsPerSeg; j++) this.parts.setPart(this.stepIndex(i, j), HIDE)
      for (let k = 0; k < 5; k++) this.parts.setPart(this.rubbleIndex(i, k), null)
    } else {
      this.fallT[i] = 0
      const seg = stairSegment(i)
      this.burst?.emit(v((seg.x0 + seg.x1) / 2, seg.y1, (K.STAIRS.z0 + K.STAIRS.z1) / 2), 26, { spread: 2.6, up: 1.8, color: '#bba584', size: 1.0, life: 1.4 })
    }
    if (this.stonesOn) this.stones[i].setActive(true, 0.8)
    this.onCollapse?.(i)
  }

  /** 区切り i をもとにもどす（やり直し用） */
  restoreStep(i: number): void {
    if (!this.collapsed[i]) return
    this.collapsed[i] = false
    this.fallT[i] = -1
    this.ramps[i].setEnabled(true)
    for (let j = 0; j < this.stepsPerSeg; j++) this.parts.setPart(this.stepIndex(i, j), null)
    for (let k = 0; k < 5; k++) this.parts.setPart(this.rubbleIndex(i, k), HIDE)
    this.stones[i].setActive(false)
  }

  restoreAll(): void {
    for (let i = 0; i < this.segs; i++) this.restoreStep(i)
  }

  /** くずれた区切りの前で、石が落ちてくる（夜の防衛）。false で止める */
  setStonesActive(on: boolean): void {
    this.stonesOn = on
    this.collapsed.forEach((c, i) => {
      if (c && on) this.stones[i].setActive(true, i * 0.5)
      else if (!on) this.stones[i].setActive(false)
    })
  }

  /** 区切り i の上の壁の足もと（石を止めると足場になる所。目印用） */
  wallFoot(i: number): THREE.Vector3 {
    const seg = stairSegment(i)
    return v(seg.x1 - 0.5, seg.y0, (K.STAIRS.z0 + K.STAIRS.z1) / 2)
  }

  update(dt: number): void {
    const tmpM = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    for (let i = 0; i < this.segs; i++) {
      if (this.fallT[i] < 0) continue
      this.fallT[i] += dt
      const t = this.fallT[i]
      const d = this.fallDir[i]
      for (let j = 0; j < this.stepsPerSeg; j++) {
        // 段の石が、下へ転がり落ちて消える
        const tj = Math.max(0, t - j * 0.08)
        const c0 = this.parts.center(this.stepIndex(i, j))
        const drop = 0.5 * 9 * tj * tj
        const out = 2.2 * tj
        q.setFromAxisAngle(v(-d.z, 0, d.x).normalize(), -tj * 2.4)
        const s = Math.max(0.001, 1 - Math.max(0, tj - 0.9) / 0.5)
        const pos = v(d.x * out, -drop, d.z * out)
        // 中心のまわりに回して、動かす
        tmpM.makeTranslation(-c0.x, -c0.y, -c0.z)
        const rot = new THREE.Matrix4().compose(v(0, 0, 0), q, v(s, s, s))
        const back = new THREE.Matrix4().makeTranslation(c0.x + pos.x, c0.y + pos.y, c0.z + pos.z)
        this.parts.setPart(this.stepIndex(i, j), back.multiply(rot).multiply(tmpM))
      }
      if (t > 0.25 && t - dt <= 0.25) for (let k = 0; k < 5; k++) this.parts.setPart(this.rubbleIndex(i, k), null)
      if (t > 1.5) {
        for (let j = 0; j < this.stepsPerSeg; j++) this.parts.setPart(this.stepIndex(i, j), HIDE)
        this.fallT[i] = -1
      }
    }
    for (const s of this.stones) s.update(dt)
  }
}

/** 見えない所へしまう行列（大きさ 0） */
const HIDE = new THREE.Matrix4().makeScale(0, 0, 0)

// ------------------------------------------------------------------ 小さな塔の階段（静的）

export type FlightOpts = {
  /** 階段のいちばん下の中心（足もと） */
  bottom: THREE.Vector3
  /** 上る向き（水平の単位ベクトル） */
  up: THREE.Vector3
  width: number
  segs: number
  rise: number
  run: number
  steps?: number
  /** くずれた区切り（平らな所とがれき。坂の当たり判定なし） */
  broken?: number[]
  tint?: string
}

/** 静的な階段（見た目は Batch・当たり判定は坂）。くずれた区切りの「上の壁の足もと」を返す */
export function buildFlight(c: KCtx, o: FlightOpts): { walls: Array<{ seg: number; foot: THREE.Vector3; y0: number }> } {
  const steps = o.steps ?? 3
  const tread = o.run / steps
  const stepH = o.rise / steps
  const rotY = Math.atan2(-o.up.z, o.up.x)
  const right = v(-o.up.z, 0, o.up.x)
  const tint = o.tint ?? KC.sand
  const walls: Array<{ seg: number; foot: THREE.Vector3; y0: number }> = []
  const rng = mulberry32(Math.round(o.bottom.x * 13 + o.bottom.z * 7))
  const at = (along: number, y: number, side = 0) => o.bottom.clone().addScaledVector(o.up, along).addScaledVector(right, side).setY(o.bottom.y + y)
  for (let i = 0; i < o.segs; i++) {
    const y0 = o.rise * i
    const a0 = o.run * i
    const broken = o.broken?.includes(i) ?? false
    // 芯（平らな上面 y0）
    if (y0 > 0) {
      const p = at(a0 + o.run / 2, y0 / 2)
      box(c, p.x, p.y, p.z, o.run + 0.02, y0, o.width, c.m.sandstone, { rotY, tint: shade(tint, 0.82), texM: 3, collide: true })
    }
    if (broken) {
      // がれき
      for (let k = 0; k < 6; k++) {
        const p = at(a0 + 0.2 + rng() * (o.run - 0.4), y0 + 0.1, (rng() - 0.5) * (o.width - 0.6))
        c.b.add(new THREE.IcosahedronGeometry(0.2 + rng() * 0.2, 0), c.m.sandstone, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z), { tint: shade(KC.sandDark, 0.9 + rng() * 0.2) })
      }
      walls.push({ seg: i, foot: at(a0 + o.run, y0), y0: o.bottom.y + y0 })
      continue
    }
    for (let j = 0; j < steps; j++) {
      const h = stepH * (j + 1)
      const p = at(a0 + tread * j + (o.run - tread * j) / 2, y0 + h / 2)
      box(c, p.x, p.y, p.z, o.run - tread * j + 0.02, h, o.width, c.m.sandstone, { rotY, tint: shade(tint, 0.92 + rng() * 0.12), texM: 3 })
    }
    collideRamp(c, at(a0, y0), at(a0 + o.run, y0 + o.rise), o.width, 0.5)
  }
  // 両わきの低い壁（ほお壁）
  for (const s of [-1, 1]) {
    for (let i = 0; i < o.segs; i++) {
      const p = at(o.run * i + o.run / 2, o.rise * i + o.rise * 0.5 + 0.1, s * (o.width / 2 + 0.25))
      const top = p.y + 0.35
      box(c, p.x, (o.bottom.y + top) / 2, p.z, o.run + 0.02, top - o.bottom.y, 0.5, c.m.sandstone, { rotY, tint: shade(tint, 0.9), texM: 3, collide: true })
    }
  }
  return { walls }
}
