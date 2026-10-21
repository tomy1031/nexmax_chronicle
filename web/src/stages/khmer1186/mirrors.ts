// 夜明けの鏡の仕掛け。
// ・MirrorStand：塔の上の鏡を立てる台（北・東・南）。placeMirror で鏡が立ち、beamOn で朝日をはね返す光の筋がアルンへ。
//   setLit で台が光る（目印・東の塔の「光の筋が通った」）
// ・Turntable：回る鏡の台（東の塔の仕掛け）。ゆっくり回り続け、setFrozen で止まる。正しい向きで止まると、
//   午後の日ざしをはね返した光の筋が東の塔の上の台に届き、台が光る
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { LightBeam, softDot } from './fxKhmer'
import { TurntableLogic } from './khmerLogic'
import { KC } from './materialsKhmer'
import type { TowerId } from './layout'

/** 鏡（青銅の円い枠・みがいた面・はすの台）。face は鏡の面の向く方向 */
function buildMirror(radius: number): { group: THREE.Group; face: THREE.Mesh; faceMat: THREE.MeshStandardMaterial } {
  const group = new THREE.Group()
  const bronze = new THREE.MeshStandardMaterial({ color: KC.bronze, roughness: 0.3, metalness: 0.9 })
  const faceMat = new THREE.MeshStandardMaterial({ color: '#f4e6c0', roughness: 0.06, metalness: 1, emissive: new THREE.Color('#ffcf6a'), emissiveIntensity: 0.15 })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, radius * 0.1, 8, 28), bronze)
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.96, 28), faceMat)
  face.position.z = 0.01
  const back = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.98, 28), bronze)
  back.rotation.y = Math.PI
  back.position.z = -0.02
  // 光の飾り（枠のまわりの炎の形）
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const f = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.08, radius * 0.24, 4), bronze)
    f.position.set(Math.cos(a) * radius * 1.12, Math.sin(a) * radius * 1.12, 0)
    f.rotation.z = a - Math.PI / 2
    group.add(f)
  }
  group.add(ring, face, back)
  // 支え（下の柄）
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.08, radius * 0.12, radius * 0.9, 8), bronze)
  stem.position.y = -radius * 1.35
  group.add(stem)
  group.traverse((o) => ((o as THREE.Mesh).castShadow = true))
  return { group, face, faceMat }
}

/** 塔の上の鏡を立てる台 */
export class MirrorStand {
  readonly id: TowerId
  readonly group = new THREE.Group()
  /** 鏡の中心（ワールド） */
  readonly center: THREE.Vector3
  /** 台の上面の中心（目印・光の筋の当たる所） */
  readonly top: THREE.Vector3
  /** 鏡の光の筋（朝日 → 鏡 → アルン） */
  readonly beam = new LightBeam(0.42, '#ffd47a')
  /** 朝日が鏡に当たる筋（空から） */
  readonly sunRay = new LightBeam(0.5, '#ffe2a0')
  private readonly mirror: { group: THREE.Group; face: THREE.Mesh; faceMat: THREE.MeshStandardMaterial }
  private readonly glow: THREE.Mesh
  private readonly glowMat: THREE.MeshBasicMaterial
  private readonly halo: THREE.Sprite
  private placed = false
  private placeT = -1
  private lit = 0
  private litTarget = 0
  private readonly target = new THREE.Vector3()

  /** center：鏡の中心、top：台の上面、faceDir：鏡の向く方向（アルンへ） */
  constructor(id: TowerId, center: THREE.Vector3, top: THREE.Vector3, faceDir: THREE.Vector3, radius: number) {
    this.id = id
    this.center = center.clone()
    this.top = top.clone()
    this.mirror = buildMirror(radius)
    this.mirror.group.position.copy(center)
    this.mirror.group.lookAt(center.clone().add(faceDir))
    this.mirror.group.visible = false
    // 台の上の光る輪（鏡を立てる所の目印）
    this.glowMat = new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.5, 32), this.glowMat)
    this.glow.rotation.x = -Math.PI / 2
    this.glow.position.copy(top).setY(top.y + 0.03)
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: '#ffcf6a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }))
    this.halo.scale.setScalar(2.6)
    this.halo.position.copy(top).setY(top.y + 0.5)
    this.group.add(this.mirror.group, this.glow, this.halo, this.beam.group, this.sunRay.group)
    this.group.name = `khmer_mirror_${id}`
  }

  get hasMirror(): boolean {
    return this.placed
  }

  /** 鏡が立つ（下からせり上がって、光る）。instant ならすぐ */
  placeMirror(instant = false): void {
    this.placed = true
    this.mirror.group.visible = true
    this.placeT = instant ? -1 : 0
    if (instant) this.mirror.group.scale.setScalar(1)
    else this.mirror.group.scale.setScalar(0.01)
  }

  /** 鏡を外す（開発用・やり直し用） */
  removeMirror(): void {
    this.placed = false
    this.mirror.group.visible = false
    this.beam.setOn(false, true)
    this.sunRay.setOn(false, true)
  }

  /**
   * 朝日をはね返す光の筋を、to（アルンの中心）へ。sunDir は朝日の来る方向（地面 → 太陽）。
   * 鏡が立っていなければ立てる
   */
  beamOn(to: THREE.Vector3, sunDir: THREE.Vector3, instant = false): void {
    if (!this.placed) this.placeMirror(instant)
    this.target.copy(to)
    this.beam.set(this.center, to)
    this.sunRay.set(this.center.clone().addScaledVector(sunDir, 26), this.center)
    this.beam.setOn(true, instant)
    this.sunRay.setOn(0.7, instant)
    // 鏡の面を、朝日とアルンのまん中の向きへ
    const toArun = to.clone().sub(this.center).normalize()
    const n = toArun.add(sunDir.clone().normalize()).normalize()
    if (n.lengthSq() > 0.01) this.mirror.group.lookAt(this.center.clone().add(n))
    this.mirror.faceMat.emissiveIntensity = 1.4
  }

  beamOff(instant = false): void {
    this.beam.setOn(false, instant)
    this.sunRay.setOn(false, instant)
    this.mirror.faceMat.emissiveIntensity = 0.15
  }

  get beamLevel(): number {
    return this.beam.level
  }

  /** 台を光らせる（0〜1。目印・光の筋が届いた） */
  setLit(k: number | boolean, instant = false): void {
    this.litTarget = typeof k === 'number' ? k : k ? 1 : 0
    if (instant) this.lit = this.litTarget
  }

  /** 一瞬だけ光る（回る鏡の光の筋が通りすぎたとき） */
  flash(k = 0.8): void {
    this.lit = Math.max(this.lit, k)
  }

  get litLevel(): number {
    return this.lit
  }

  update(dt: number): void {
    if (this.placeT >= 0) {
      this.placeT += dt
      const k = Math.min(1, this.placeT / 0.8)
      const e = 1 - Math.pow(1 - k, 3)
      this.mirror.group.scale.setScalar(Math.max(0.01, e * (1 + Math.sin(k * Math.PI) * 0.15)))
      if (k >= 1) this.placeT = -1
    }
    this.lit += (this.litTarget - this.lit) * Math.min(1, dt * (this.litTarget > this.lit ? 6 : 1.8))
    const pulse = 0.8 + 0.2 * Math.sin(uTime.value * 3)
    this.glowMat.opacity = this.lit * 0.9 * pulse
    this.halo.material.opacity = this.lit * 0.6 * pulse
    this.glow.visible = this.lit > 0.01
    this.halo.visible = this.lit > 0.01
    this.beam.update(dt)
    this.sunRay.update(dt)
  }
}

/** 回る鏡の台の速さ（rad/s）と、正しい向きとみなす幅（±度） */
export const TURNTABLE_TUNING = { speed: 0.36, toleranceDeg: 18 }

/** 回る鏡の台（東の塔の仕掛け） */
export class Turntable {
  readonly group = new THREE.Group()
  readonly logic: TurntableLogic
  /** 台の中心（地面） */
  readonly base: THREE.Vector3
  /** 鏡の中心（止めるクローで狙う所） */
  readonly point: THREE.Vector3
  /** はね返した光の筋 */
  readonly beam = new LightBeam(0.2, '#ffdc8a', 0.55)
  /** 午後の日ざし（空 → 鏡） */
  readonly sunRay = new LightBeam(0.4, '#ffe8b8', 0.35)
  /** 光の筋が届くと光る台（東の塔の上） */
  readonly stand: MirrorStand
  private readonly spin = new THREE.Group()
  private readonly mirror: { group: THREE.Group; face: THREE.Mesh; faceMat: THREE.MeshStandardMaterial }
  private readonly frozenRing: THREE.Mesh
  private readonly elev: number
  private readonly reach: number
  private wasAligned = false
  /** 止まっている間に正しい向きだった（光の筋が台へ届いた）。台は光り続ける */
  solved = false
  /** 正しい向きで止まった瞬間 */
  onSolved: (() => void) | null = null
  /** ちがう向きで止めた（ヒント用） */
  onMissed: (() => void) | null = null
  private readonly tmp = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()

  /** base：台の中心（地面）、stand：光を届ける塔の上の台、sunDir：午後の日ざしの方向（地面 → 太陽） */
  constructor(base: THREE.Vector3, stand: MirrorStand, sunDir: THREE.Vector3) {
    this.base = base.clone()
    this.stand = stand
    this.point = base.clone().setY(base.y + 1.75)
    const to = stand.top.clone().setY(stand.top.y + 0.25).sub(this.point)
    const horiz = Math.hypot(to.x, to.z)
    this.elev = Math.atan2(to.y, horiz)
    this.reach = to.length()
    const correct = Math.atan2(-to.z, to.x)
    // 正しい向きの幅は ±18°・速さ 0.36 rad/s：台が光ってから J まで 1.7 秒ほど間に合う（±8°・0.42 では 0.67 秒）
    this.logic = new TurntableLogic(correct, { start: correct + 2.4, speed: TURNTABLE_TUNING.speed, tolerance: (TURNTABLE_TUNING.toleranceDeg * Math.PI) / 180 })
    // 台：石の太鼓（静的な物は scene 側の Batch。ここは回る上の部分）
    const bronze = new THREE.MeshStandardMaterial({ color: KC.bronze, roughness: 0.32, metalness: 0.85 })
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.3, 0.16, 32), bronze)
    disc.position.y = 0.88
    // 円盤のふちの目もり（どこを向いているかがわかる）
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.22), bronze)
      t.position.set(Math.cos(a) * 1.18, 0.98, Math.sin(a) * 1.18)
      t.rotation.y = -a
      this.spin.add(t)
    }
    // 向きの矢印（はね返す方向）
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 4), new THREE.MeshStandardMaterial({ color: '#ffcf5a', emissive: new THREE.Color('#ffb030'), emissiveIntensity: 0.6, roughness: 0.4 }))
    arrow.rotation.z = -Math.PI / 2
    arrow.position.set(1.05, 1.02, 0)
    this.mirror = buildMirror(0.62)
    this.mirror.group.position.set(0, this.point.y - base.y, 0)
    this.spin.add(disc, arrow, this.mirror.group)
    this.spin.position.copy(base)
    this.spin.traverse((o) => ((o as THREE.Mesh).castShadow = true))
    // 止まっているときの青い時計の輪（シェルの止める表示とは別に、台にも）
    this.frozenRing = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.6, 48), new THREE.MeshBasicMaterial({ color: '#7ad0ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }))
    this.frozenRing.rotation.x = -Math.PI / 2
    this.frozenRing.position.copy(base).setY(base.y + 0.99)
    this.frozenRing.visible = false
    this.group.add(this.spin, this.frozenRing, this.beam.group, this.sunRay.group)
    this.group.name = 'khmer_turntable'
    // 日ざし（空 → 鏡）は短くやわらかく（遠くからは目立ちすぎないように）
    this.sunRay.set(this.point.clone().addScaledVector(sunDir.clone().normalize(), 14), this.point)
    this.sunRay.setOn(0.4, true)
    this.beam.setOn(1, true)
    this.applyAngle()
  }

  get angle(): number {
    return this.logic.angle
  }

  get correctAngle(): number {
    return this.logic.correct
  }

  get aligned(): boolean {
    return this.logic.aligned
  }

  get frozen(): boolean {
    return this.logic.frozen
  }

  /** 止める（true）・動かす（false） */
  setFrozen(on: boolean): void {
    this.logic.frozen = on
    this.frozenRing.visible = on
    if (on && this.logic.aligned && !this.solved) {
      this.solved = true
      this.stand.setLit(1)
      this.onSolved?.()
    } else if (on && !this.solved) this.onMissed?.()
  }

  /** 解けた状態にする（セーブから再開したとき） */
  setSolved(on: boolean): void {
    this.solved = on
    this.stand.setLit(on ? 1 : 0, true)
    if (on) {
      this.logic.angle = this.logic.correct
      this.logic.frozen = true
      this.applyAngle()
      this.logic.frozen = false
    }
  }

  /** 日ざし（午後だけ）。夜・夜明けは止める */
  setSunlight(on: boolean): void {
    this.sunRay.setOn(on ? 0.4 : 0)
    this.beam.setOn(on ? 1 : 0)
  }

  update(dt: number): void {
    // 解けた後は、正しい向きで止まったまま
    if (this.solved && !this.logic.frozen) {
      this.logic.angle = this.logic.correct
    } else this.logic.update(dt)
    this.applyAngle()
    const aligned = this.logic.aligned
    // 回っている光の筋が台を通りすぎると、台が一瞬光る（ここで止めればいい、の合図）
    if (aligned && !this.wasAligned && !this.logic.frozen && !this.solved) this.stand.flash(0.9)
    this.wasAligned = aligned
    const pulse = 0.85 + 0.15 * Math.sin(uTime.value * 6)
    ;(this.frozenRing.material as THREE.MeshBasicMaterial).opacity = 0.7 * pulse
    this.beam.update(dt)
    this.sunRay.update(dt)
  }

  private applyAngle(): void {
    const a = this.logic.angle
    this.spin.rotation.y = a
    // はね返す方向
    const ce = Math.cos(this.elev)
    this.dir.set(Math.cos(a) * ce, Math.sin(this.elev), -Math.sin(a) * ce)
    const len = this.logic.aligned ? this.reach : 16
    this.tmp.copy(this.point).addScaledVector(this.dir, len)
    this.beam.set(this.point, this.tmp)
    // 鏡の面：日ざしとはね返す方向のまん中
    const sun = this.sunRay.a.clone().sub(this.point).normalize()
    const n = this.dir.clone().add(sun).normalize()
    // spin の中の鏡も、lookAt はワールドの点を向く（親の回転を打ち消す）
    this.spin.updateMatrixWorld(true)
    this.mirror.group.lookAt(this.tmp.copy(this.point).add(n))
    this.mirror.faceMat.emissiveIntensity = this.logic.aligned ? 1.2 : 0.35
  }

  /** 「止める」で狙う対象の形（フェーズ 2 で rt.chrono へ） */
  freezable(): Freezable {
    return {
      id: 'khmer_turntable',
      label: '回る鏡の台',
      point: this.point,
      radius: 1.3,
      canFreeze: () => !this.solved,
      setFrozen: (on) => this.setFrozen(on),
      isFrozen: () => this.logic.frozen,
    }
  }
}

/** 「止める」の対象（rt.chrono の ChronoTarget にそのまま写せる形） */
export type Freezable = {
  id: string
  label: string
  /** 毎フレーム読む位置 */
  point: THREE.Vector3
  radius: number
  canFreeze(): boolean
  setFrozen(on: boolean): void
  isFrozen(): boolean
  /** 今止めれば、ちょうどいい（落ちる石：足場の高さ）。止めたあとのヒントに使う */
  goodNow?(): boolean
}

