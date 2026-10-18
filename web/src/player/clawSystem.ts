// つかむNMClaw の実行時の処理：中央照準の対象選択 → J で射出 → 種類ごとの動き → 見た目。
// 純粋な判断は clawLogic.ts（WireClaw・Pendulum・曲線・スコア）、ここは物理・プレイヤー・描画へのつなぎ。
// ・pull_object：物を決まった山なりで手元へ。持ったまま歩け、J でその場に置く（水に落ちたら元の場所へ戻る）
// ・pull_player：重力と KCC を止めて、手すりを越える曲線で着地点まで運ぶ
// ・swing_anchor：支点から振り子。WASD（カメラ基準）で揺らし、Space／J で勢いを残して離脱
// ・hold_mechanism：その場で保持（移動入力を止める）。J で外す
import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import type { Physics } from './physics'
import type { PlayerController } from './controller'
import type { ActionFrame } from './inputActions'
import { ClawBeam } from './claw'
import {
  CLAW_TUNING,
  Pendulum,
  WireClaw,
  arcPosition,
  chooseTarget,
  cycleLock,
  evaluateTarget,
  nearestOutOfRange,
  rankTargets,
  zipPosition,
  type ClawTargetDef,
  type ClawTargetType,
  type TargetView,
  type ViewBasis,
  type WireEvent,
  type WirePhase,
} from './clawLogic'

/** 足元から胸（照準・射程の基準）までの高さ */
export const CHEST_HEIGHT = 0.72
/** 空振りの上下の角度（ラジアン）：カメラの見下ろしに少し足して、この範囲に収める */
const MISS_PITCH_LIFT = 0.12
const MISS_PITCH_MIN = -0.08
const MISS_PITCH_MAX = 0.45
/** ぶら下がるとき、足元からワイヤーの付け根（右手を上げた位置）までの高さ */
export const HANG_HEIGHT = 1.0
/** 水に落ちたとみなす高さ */
const SINK_Y = -0.75

export type MovableInput = {
  def: ClawTargetDef
  object: THREE.Group
  half: THREE.Vector3
  home: THREE.Vector3
}

type MovableState = 'rest' | 'flying' | 'carried' | 'falling' | 'sunk'

type Movable = MovableInput & {
  body: RAPIER.RigidBody
  collider: RAPIER.Collider
  state: MovableState
  from: THREE.Vector3
  vel: THREE.Vector3
  timer: number
  homeRotY: number
}

/** 右下の表示（「つかんでいる：木箱」「支えている：大歯車」など） */
const HOLD_VERB: Record<ClawTargetType, string> = {
  pull_object: 'つかんでいる',
  pull_player: 'つないでいる',
  swing_anchor: 'ぶら下がっている',
  hold_mechanism: '支えている',
  enemy_pull: '引き寄せている',
  enemy_zip: '飛び込んでいる',
}

export type ScreenTarget = { def: ClawTargetDef; x: number; y: number; r: number }

export type ClawUi = {
  selected: ScreenTarget | null
  far: ScreenTarget | null
  candidates: number
  locked: boolean
  phase: WirePhase
  connectedType: ClawTargetType | null
  /** つかんでいる／つながっている対象の表示（「支えている：大歯車」など） */
  holdingLabel: string | null
}

export class ClawSystem {
  readonly wire = new WireClaw()
  readonly beam = new ClawBeam()
  readonly targets: ClawTargetDef[]
  private readonly movables: Movable[]
  private readonly phys: Physics
  private readonly player: PlayerController
  private lockId: string | null = null
  private ranked: TargetView[] = []
  private views: Array<TargetView | null> = []
  private selected: TargetView | null = null
  private far: TargetView | null = null
  private pendulum: Pendulum | null = null
  private readonly zipStart = new THREE.Vector3()
  private carried: Movable | null = null
  private readonly lastEnd = new THREE.Vector3()
  private readonly missEnd = new THREE.Vector3()
  private readonly missDir = new THREE.Vector3()
  /** 爪の先の現在位置（ポーズの狙い先にも使う） */
  readonly end = new THREE.Vector3()
  /** 射出・解除・到着などのお知らせ（パズル・HUD・台詞へ） */
  onEvent: ((e: WireEvent) => void) | null = null
  private readonly basis: ViewBasis = {
    origin: new THREE.Vector3(),
    forward: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    tanHalfX: 1,
    tanHalfY: 1,
  }
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly chest = new THREE.Vector3()
  private readonly holdPos = new THREE.Vector3()
  private readonly push = new THREE.Vector3()

  constructor(phys: Physics, player: PlayerController, targets: ClawTargetDef[], movables: MovableInput[]) {
    this.phys = phys
    this.player = player
    this.targets = targets
    const R = phys.R
    this.movables = movables.map((m) => {
      const c = m.object.position.clone().add(new THREE.Vector3(0, m.half.y, 0))
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, m.object.rotation.y, 0))
      const body = phys.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }))
      const collider = phys.world.createCollider(R.ColliderDesc.cuboid(m.half.x, m.half.y, m.half.z).setFriction(0.8), body)
      return { ...m, body, collider, state: 'rest' as MovableState, from: new THREE.Vector3(), vel: new THREE.Vector3(), timer: 0, homeRotY: m.object.rotation.y }
    })
  }

  // ---------------------------------------------------------------- 照準

  /** カメラ（＝画面中央の照準）から狙える対象を評価する。毎フレーム、入力処理の前に呼ぶ */
  aim(camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld()
    const b = this.basis
    b.origin.setFromMatrixPosition(camera.matrixWorld)
    camera.getWorldDirection(b.forward)
    b.right.set(1, 0, 0).transformDirection(camera.matrixWorld)
    b.up.set(0, 1, 0).transformDirection(camera.matrixWorld)
    b.tanHalfY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
    b.tanHalfX = b.tanHalfY * camera.aspect
    this.chestPos(this.chest)
    const los = (def: ClawTargetDef, distance: number) => {
      this.tmp.subVectors(def.point, this.chest).normalize()
      const hit = this.phys.raycast(this.chest, this.tmp, distance, this.player.collider, true)
      return hit === null || hit >= distance - (def.radius + 0.35)
    }
    // 接続中・射出中は照準を変えない（今の対象を表示し続ける）
    this.views = this.targets.map((t) => evaluateTarget(t, b, this.chest, los))
    this.ranked = rankTargets(this.views)
    this.selected = chooseTarget(this.ranked, this.lockId)
    if (this.lockId && (!this.selected || this.selected.def.id !== this.lockId)) this.lockId = null
    this.far = this.selected ? null : nearestOutOfRange(this.views)
  }

  /** 腕を向ける先：つないだ対象、空振りなら伸ばす先 */
  get aimPoint(): THREE.Vector3 {
    const w = this.wire
    if (w.target) return w.target.point
    if (w.phase === 'miss') return this.missEnd
    return this.end
  }

  get selectedTarget(): ClawTargetDef | null {
    return this.selected?.def ?? null
  }

  get candidateCount(): number {
    return this.ranked.length
  }

  // ---------------------------------------------------------------- 入力

  /**
   * J（射出／解除）・R（ロック切り替え）・Space（ワイヤーからの離脱）を処理する。
   * 戻り値 jumpConsumed が true なら、その Space はジャンプに使わない。
   */
  handleInput(frame: ActionFrame, canFire: boolean, camera: THREE.PerspectiveCamera): { jumpConsumed: boolean } {
    if (frame.pressed.has('lock_switch') && this.wire.phase === 'idle') {
      this.lockId = cycleLock(this.ranked, this.selected?.def.id ?? null)
      this.selected = chooseTarget(this.ranked, this.lockId)
    }
    if (frame.pressed.has('claw_fire') && canFire) {
      const idle = this.wire.phase === 'idle'
      const t = idle ? (this.selected?.def ?? null) : null
      if (idle && !t) this.computeMissEnd(camera)
      // 撃つ瞬間に体を狙う向きへそろえる（爪がいつも体の正面から出るように）
      if (idle) this.snapFacing(t ? t.point : this.missEnd)
      const evs = this.wire.press(t, t ? (this.selected?.distance ?? 0) : 0)
      for (const e of evs) this.handle(e)
    }
    let jumpConsumed = false
    if (frame.pressed.has('jump')) {
      const r = this.wire.jump()
      jumpConsumed = r.consumed
      for (const e of r.events) this.handle(e)
    }
    return { jumpConsumed }
  }

  // ---------------------------------------------------------------- 更新

  /** ワイヤーの段階を進め、対象の種類ごとに物・プレイヤーを動かす（プレイヤーの通常更新の後） */
  update(dt: number, frame: ActionFrame, camYaw: number): void {
    for (const e of this.wire.tick(dt)) this.handle(e)
    const w = this.wire
    const t = w.target
    switch (w.phase) {
      case 'firing':
        // 伸びている間は歩いても向きを変えない
        if (t) this.faceToward(t.point, dt, 40)
        break
      case 'miss':
        this.faceToward(this.missEnd, dt, 40)
        break
      case 'holding':
        if (t) this.faceToward(t.point, dt)
        break
      case 'reeling':
        if (this.carried) {
          this.holdPoint(this.holdPos)
          arcPosition(this.carried.from, this.holdPos, w.progress, 0.7, this.carried.object.position)
          this.carried.object.rotation.y += dt * 4
          this.syncPoint(this.carried)
          this.faceToward(this.carried.def.point, dt)
        }
        break
      case 'carrying':
        if (this.carried) {
          this.holdPoint(this.holdPos)
          this.carried.object.position.lerp(this.holdPos, 1 - Math.exp(-dt * 18))
          this.syncPoint(this.carried)
        }
        break
      case 'zipping':
        if (t) {
          zipPosition(this.zipStart, t, w.progress, this.tmp)
          this.player.moveExternal(this.tmp, dt)
        }
        break
      case 'swinging':
        if (this.pendulum) {
          const fx = -Math.sin(camYaw)
          const fz = -Math.cos(camYaw)
          const rx = Math.cos(camYaw)
          const rz = -Math.sin(camYaw)
          this.push.set(fx * frame.move.y + rx * frame.move.x, 0, fz * frame.move.y + rz * frame.move.x)
          this.pendulum.step(dt, this.push)
          this.tmp.copy(this.pendulum.pos)
          this.tmp.y -= HANG_HEIGHT
          this.player.moveExternal(this.tmp, dt)
        }
        break
    }
    for (const m of this.movables) this.updateMovable(m, dt)
  }

  /** 見た目（ワイヤー・爪）。hand はネクマックスの右手首（handAnchor）のワールド位置 */
  updateVisuals(dt: number, hand: THREE.Vector3): void {
    const w = this.wire
    const t = w.target
    let open = 0
    let thickness = 0.42
    switch (w.phase) {
      case 'idle':
        this.beam.setActive(false)
        return
      case 'firing':
        if (t) this.end.lerpVectors(hand, t.point, w.wireOut)
        open = 1
        break
      case 'miss':
        this.end.lerpVectors(hand, this.missEnd, w.wireOut)
        open = w.progress < 0.5 ? 1 : 0.35
        break
      case 'reeling':
      case 'carrying':
        // 敵（引き寄せ）は戦闘側が def.point を動かす
        if (this.carried) this.end.copy(this.carried.def.point)
        else if (t) this.end.copy(t.point)
        break
      case 'zipping':
      case 'swinging':
        if (t) this.end.copy(t.point)
        break
      case 'holding':
        if (t) this.end.copy(t.point)
        thickness = 1
        break
      case 'retracting':
        this.end.lerpVectors(hand, this.lastEnd, w.wireOut)
        open = 0.6
        break
    }
    if (!this.beam.active) this.beam.setActive(true)
    this.beam.update(dt, hand, this.end, { open, thickness })
  }

  /** 振り子の角度（真下からの角度に、進行方向の符号を付けたもの）。ぶら下がっていなければ 0 */
  swingAngle(): number {
    const p = this.pendulum
    if (!p || this.wire.phase !== 'swinging') return 0
    const a = p.angle()
    this.tmp.subVectors(p.pos, p.anchor)
    const fx = -Math.sin(this.player.facing)
    const fz = -Math.cos(this.player.facing)
    return a * (this.tmp.x * fx + this.tmp.z * fz >= 0 ? 1 : -1)
  }

  /** 強制的に外す（ショット切り替え・復帰）。持っている物は元の場所へ戻す */
  reset(): void {
    if (this.player.isExternal) this.player.endExternal()
    this.player.enabled = true
    if (this.carried) this.sendHome(this.carried)
    this.carried = null
    this.pendulum = null
    this.wire.reset()
    this.beam.setActive(false)
  }

  uiState(camera: THREE.PerspectiveCamera, width: number, height: number): ClawUi {
    const w = this.wire
    // 持っている物・飛んでくる物には照準を出さない（右下の表示で分かる）
    const carryingObject = w.phase === 'reeling' || w.phase === 'carrying'
    const connected = (w.isConnected() || w.phase === 'firing') && !carryingObject
    const shown = carryingObject ? null : this.selected
    const toScreen = (def: ClawTargetDef): ScreenTarget | null => {
      this.tmp.copy(def.point).project(camera)
      if (this.tmp.z > 1 || this.tmp.z < -1) return null
      const dist = camera.position.distanceTo(def.point)
      const r = (def.radius / Math.max(0.1, dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))) * (height / 2)
      return { def, x: (this.tmp.x * 0.5 + 0.5) * width, y: (-this.tmp.y * 0.5 + 0.5) * height, r }
    }
    const selDef = connected ? w.target : (shown?.def ?? null)
    let holdingLabel: string | null = null
    if (w.isConnected() && w.target) holdingLabel = `${HOLD_VERB[w.target.type]}：${w.target.label}`
    return {
      selected: selDef ? toScreen(selDef) : null,
      far: !selDef && !carryingObject && this.far ? toScreen(this.far.def) : null,
      candidates: this.ranked.length,
      locked: this.lockId !== null,
      phase: w.phase,
      connectedType: w.isConnected() && w.target ? w.target.type : null,
      holdingLabel,
    }
  }

  // ---------------------------------------------------------------- 内部

  /** 動かせる物を元の場所へ戻す（持っていれば外してから）。ステージの演出用（ループで朝に戻すなど） */
  sendHomeById(id: string): void {
    const m = this.movables.find((x) => x.def.id === id)
    if (!m) return
    if (this.carried === m) {
      this.reset()
      return
    }
    this.sendHome(m)
  }

  private handle(e: WireEvent): void {
    switch (e.kind) {
      case 'connected': {
        const t = e.target
        if (t.type === 'pull_object') {
          const m = this.movables.find((x) => x.def === t)
          if (m) {
            m.state = 'flying'
            m.from.copy(m.object.position)
            m.collider.setEnabled(false)
            m.def.enabled = false
            this.carried = m
          }
        } else if (t.type === 'pull_player' || t.type === 'enemy_zip') {
          this.player.beginExternal()
          this.zipStart.copy(this.player.position)
        } else if (t.type === 'swing_anchor') {
          this.player.beginExternal()
          this.tmp.copy(this.player.position)
          this.tmp.y += HANG_HEIGHT
          this.pendulum = new Pendulum(t.point, t.ropeLength ?? 5, this.tmp, this.player.velocity)
          if (t.checkpoints?.length) {
            const near = t.checkpoints.reduce((a, b) => (a.distanceToSquared(this.player.position) <= b.distanceToSquared(this.player.position) ? a : b))
            this.player.setCheckpoint(near)
          }
        } else if (t.type === 'hold_mechanism') {
          this.player.enabled = false
        }
        break
      }
      case 'object_arrived':
        if (this.carried) this.carried.state = 'carried'
        break
      case 'dropped':
        if (this.carried) {
          const m = this.carried
          this.lastEnd.copy(m.def.point)
          m.state = 'falling'
          const fx = -Math.sin(this.player.facing)
          const fz = -Math.cos(this.player.facing)
          m.vel.set(fx * 1.4 + this.player.velocity.x * 0.5, 1.2, fz * 1.4 + this.player.velocity.z * 0.5)
          this.carried = null
        }
        break
      case 'arrived':
        if (e.target.landing) this.player.teleport(e.target.landing, this.player.facing)
        this.player.endExternal()
        this.lastEnd.copy(e.target.point)
        break
      case 'detached':
        this.lastEnd.copy(e.target.point)
        if (this.pendulum) {
          this.player.endExternal(this.pendulum.releaseVelocity(this.tmp2))
          this.pendulum = null
        } else {
          this.tmp2.copy(this.player.velocity)
          this.tmp2.y = Math.max(this.tmp2.y, 0) + 1.5
          this.player.endExternal(this.tmp2)
        }
        break
      case 'released':
        this.lastEnd.copy(e.target.point)
        this.player.enabled = true
        break
      case 'missed':
      case 'fired':
      case 'retracted':
        break
    }
    this.onEvent?.(e)
  }

  private chestPos(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.player.position).add(this.tmp2.set(0, CHEST_HEIGHT, 0))
  }

  /** 持っている物の位置（底の中心）：体の前・右手の高さ */
  private holdPoint(out: THREE.Vector3): THREE.Vector3 {
    const fx = -Math.sin(this.player.facing)
    const fz = -Math.cos(this.player.facing)
    const half = this.carried?.half.y ?? 0.25
    out.copy(this.player.position)
    out.x += fx * 0.62
    out.z += fz * 0.62
    out.y += 0.62 - half
    return out
  }

  private syncPoint(m: Movable): void {
    m.def.point.copy(m.object.position)
    m.def.point.y += m.half.y
  }

  private faceToward(p: THREE.Vector3, dt: number, rate = 14): void {
    this.player.turnToward(p.x - this.player.position.x, p.z - this.player.position.z, dt, rate)
  }

  /** すぐに p の方を向く（水平だけ） */
  private snapFacing(p: THREE.Vector3): void {
    const dx = p.x - this.player.position.x
    const dz = p.z - this.player.position.z
    if (Math.hypot(dx, dz) > 0.2) this.player.facing = Math.atan2(-dx, -dz)
  }

  /**
   * 空振り：カメラの向いている方へ、胸の高さからまっすぐ伸ばす（当たる物があればそこまで）。
   * 上下はカメラの見下ろしをそのまま使うと足元の地面へ刺さるので、水平に近い範囲へ抑える。
   */
  private computeMissEnd(camera: THREE.PerspectiveCamera): void {
    // chestPos() は tmp2 を使うので、向きは専用の missDir に作る（以前は tmp2 が上書きされ、世界の原点の方へ飛んでいた）
    this.chestPos(this.missEnd)
    camera.getWorldDirection(this.tmp)
    const flat = Math.hypot(this.tmp.x, this.tmp.z)
    const pitch = THREE.MathUtils.clamp(Math.atan2(this.tmp.y, flat) + MISS_PITCH_LIFT, MISS_PITCH_MIN, MISS_PITCH_MAX)
    const dir = this.missDir
    if (flat < 1e-3) {
      dir.set(-Math.sin(this.player.facing), 0, -Math.cos(this.player.facing))
    } else dir.set(this.tmp.x / flat, 0, this.tmp.z / flat)
    dir.multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch))
    const len = CLAW_TUNING.range * 0.7
    const hit = this.phys.raycast(this.missEnd, dir, len, this.player.collider, true)
    this.missEnd.addScaledVector(dir, hit ?? len)
  }

  private updateMovable(m: Movable, dt: number): void {
    if (m.state === 'falling') {
      m.vel.y -= 17 * dt
      const o = m.object.position
      // 下に地面があるか（底から少し上→下）
      this.tmp.set(o.x, o.y + 0.1, o.z)
      const down = this.tmp2.set(0, -1, 0)
      const reach = 0.1 + Math.max(0, -m.vel.y * dt) + 0.02
      const hit = m.vel.y <= 0 ? this.phys.raycast(this.tmp, down, reach, this.player.collider, true) : null
      if (hit !== null) {
        o.y = this.tmp.y - hit
        m.state = 'rest'
        m.vel.set(0, 0, 0)
        this.placeCollider(m)
      } else {
        o.addScaledVector(m.vel, dt)
        m.object.rotation.y += dt * 2
        if (o.y < SINK_Y) {
          m.state = 'sunk'
          m.timer = 0.7
          m.object.visible = false
        }
      }
      this.syncPoint(m)
    } else if (m.state === 'sunk') {
      m.timer -= dt
      if (m.timer <= 0) this.sendHome(m)
    }
  }

  private placeCollider(m: Movable): void {
    const c = m.object.position
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, m.object.rotation.y, 0))
    m.body.setTranslation({ x: c.x, y: c.y + m.half.y, z: c.z }, true)
    m.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    m.collider.setEnabled(true)
    m.def.enabled = true
    this.syncPoint(m)
  }

  private sendHome(m: Movable): void {
    m.object.position.copy(m.home)
    m.object.rotation.y = m.homeRotY
    m.object.visible = true
    m.state = 'rest'
    m.vel.set(0, 0, 0)
    this.placeCollider(m)
  }
}
