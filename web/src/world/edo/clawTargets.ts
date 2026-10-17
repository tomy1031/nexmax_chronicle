// 1726年 仕掛け横丁の「つかむNMClaw」の対象（操作マニュアル v1.1 §1.1・§2.2・§8.3）。
// ・pull_object：舟の上の木箱と小さな歯車、水門の受け台に落ちた小さな歯車（手元へ引き寄せて置ける）
// ・pull_player：水門番の家（おはるの朱のバルコニー）の手すりの金具（自分が引き寄せられて上がる）
// ・swing_anchor：水路をまたぐ荷揚げの渡し梁の吊り輪（ぶら下がって対岸へ飛ぶ）
// ・hold_mechanism：水門の大歯車（支えている間に源兵衛が歯止めを入れ、おはるの合図で離す）
// 後半の GateFlow は大歯車の協力パズル（core/gatePuzzleLogic）を、この場面の舟・台詞・歯車の回転につなぐ。
import * as THREE from 'three'
import { Batch, M } from '../../render/batch'
import { ColliderList } from '../colliders'
import { L } from './layout'
import { WOOD, beamAB, crate, post, woodBox, woodTint, type Ctx } from './kit'
import type { GateParts } from './gate'
import type { ClawTargetDef } from '../../player/clawLogic'
import { GatePhase, GatePuzzleLogic, GateResult } from '../../core/gatePuzzleLogic'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 引き寄せて動かせる物（見た目のグループと箱の寸法） */
export type MovableSpec = {
  def: ClawTargetDef
  object: THREE.Group
  /** 箱の半寸法（当たり判定・置く高さ） */
  half: THREE.Vector3
  /** 元の位置（底の中心）。水に落ちたらここへ戻る */
  home: THREE.Vector3
}

export type ClawWorld = {
  targets: ClawTargetDef[]
  movables: MovableSpec[]
  gearTarget: ClawTargetDef
  /** 協力パズルで水門の下を通る舟（GateFlow が動かす） */
  boats: THREE.Group[]
}

/** 渡し梁の位置（水路をまたぐ） */
export const SWING = { x: -28, anchorY: 6.3, beamY: 7.05, postZ: 8.45, rope: 5.0 }
/** 水門番の家のバルコニーの金具 */
export const BALCONY_HOOK = { point: v(6.6, 5.75, 6.12), landing: v(7.3, 4.15, 6.97), via: v(6.9, 5.45, 6.0) }

export function buildClawTargets(c: Ctx, gate: GateParts): ClawWorld {
  const targets: ClawTargetDef[] = []
  const movables: MovableSpec[] = []

  // ---------------------------------------------------------- swing_anchor：渡し梁の吊り輪
  {
    const { x, anchorY, beamY, postZ } = SWING
    const dark = WOOD.dark
    for (const z of [-postZ, postZ]) {
      post(c, x, z, -0.05, beamY + 0.3, 0.34, woodTint(c.rng, dark, 0.06))
      c.col.box(x, (beamY + 0.3) / 2, z, 0.36, beamY + 0.35, 0.36)
      // 根元の石と縄巻き
      c.b.add(new THREE.CylinderGeometry(0.3, 0.36, 0.3, 10), c.m.stoneWall, M(x, 0.1, z), { texM: 1.2, tint: '#e6ddd0' })
      // 方杖（柱 → 梁）
      beamAB(c, v(x, beamY - 1.1, z - Math.sign(z) * 0.1), v(x, beamY - 0.12, z - Math.sign(z) * 1.1), 0.14, 0.14, dark)
    }
    // 梁（水路をまたぐ）と鉄の帯
    woodBox(c, x, beamY, 0, 0.3, 0.34, postZ * 2 + 0.6, { tint: woodTint(c.rng, dark, 0.05), uAxis: 2 })
    for (const z of [-1.2, 1.2, -postZ + 0.3, postZ - 0.3]) c.b.add(new THREE.BoxGeometry(0.34, 0.38, 0.12), c.m.iron, M(x, beamY, z))
    // 吊り金具と輪（真ちゅう）
    c.b.add(new THREE.CylinderGeometry(0.022, 0.022, beamY - anchorY - 0.2, 6), c.m.iron, M(x, (beamY + anchorY + 0.2) / 2, 0))
    c.b.add(new THREE.TorusGeometry(0.24, 0.045, 10, 28), c.m.brass, M(x, anchorY, 0, 0, Math.PI / 2, 0))
    c.b.add(new THREE.SphereGeometry(0.07, 10, 6), c.m.brass, M(x, anchorY + 0.27, 0))
    const anchor = v(x, anchorY, 0)
    targets.push({
      id: 'swing_beam',
      type: 'swing_anchor',
      label: '渡し梁の吊り輪',
      point: anchor,
      radius: 0.3,
      enabled: true,
      ropeLength: SWING.rope,
      checkpoints: [v(x + 0.9, 0, -8.6), v(x + 0.9, 0, 8.7)],
    })
  }

  // ---------------------------------------------------------- pull_player：おはるのバルコニーの金具
  {
    const h = BALCONY_HOOK
    // 手すりの上に立てた鉄の腕木と、その先に下がる輪
    c.b.add(new THREE.BoxGeometry(0.08, 1.85, 0.08), c.m.iron, M(h.point.x, 4.15 + 0.925, 6.43))
    c.b.add(new THREE.BoxGeometry(0.07, 0.07, 0.42), c.m.iron, M(h.point.x, 5.97, 6.26))
    c.b.add(new THREE.TorusGeometry(0.16, 0.035, 8, 22), c.m.brass, M(h.point.x, h.point.y, h.point.z, 0, Math.PI / 2, 0))
    targets.push({
      id: 'balcony_hook',
      type: 'pull_player',
      label: 'バルコニーの金具',
      point: h.point,
      radius: 0.22,
      enabled: true,
      facing: v(0, 0, -1),
      landing: h.landing,
      via: h.via,
    })
  }

  // ---------------------------------------------------------- pull_object：舟の上の木箱・小さな歯車、受け台の歯車
  const movable = (id: string, label: string, home: THREE.Vector3, half: THREE.Vector3, build: (cc: Ctx) => void, rotY = 0) => {
    const sub: Ctx = { ...c, b: new Batch(), col: new ColliderList() }
    build(sub)
    const object = sub.b.build(id)
    object.position.copy(home)
    object.rotation.y = rotY
    c.root.add(object)
    const def: ClawTargetDef = { id, type: 'pull_object', label, point: home.clone().add(v(0, half.y, 0)), radius: Math.max(half.x, half.y, half.z) + 0.05, enabled: true }
    targets.push(def)
    movables.push({ def, object, half, home: home.clone() })
  }
  const boatTop = L.WL_DOWN + 0.2
  movable('crate_boat', '木箱', v(-12.75, boatTop, 5.36), v(0.25, 0.25, 0.25), (cc) => crate(cc, 0, 0, 0, 0.5, 0, '#f2cf9c'), 0.2)
  movable('small_gear_boat', '小さな歯車', v(-15.75, boatTop, 5.46), v(0.29, 0.29, 0.08), (cc) => smallGear(cc, 0.27))
  movable('small_gear_apron', '小さな歯車', v(9.0, 0.3, 1.25), v(0.25, 0.25, 0.08), (cc) => smallGear(cc, 0.23), Math.PI / 2 - 0.3)

  // ---------------------------------------------------------- hold_mechanism：水門の大歯車
  const gearTarget: ClawTargetDef = {
    id: 'gate_gear',
    type: 'hold_mechanism',
    label: '大歯車',
    point: gate.gearGrabPoint,
    radius: L.GEAR.r,
    enabled: true,
    // 大きな仕掛けは視線チェックをしない（歯車の当たり判定の箱が手前にかかるため）。西側からだけ狙える
    noLineOfSight: true,
    facing: v(-1, 0, -0.35).normalize(),
    range: 8,
  }
  targets.push(gearTarget)

  // ---------------------------------------------------------- 協力パズルの舟（2 艘を使い回す）
  const boats: THREE.Group[] = []
  for (let i = 0; i < 2; i++) {
    const sub: Ctx = { ...c, b: new Batch(), col: new ColliderList() }
    passengerBoat(sub, i)
    const g = sub.b.build(`gate_boat_${i}`)
    g.visible = false
    c.root.add(g)
    boats.push(g)
  }

  return {
    targets,
    movables,
    gearTarget,
    boats,
  }
}

/** 立てた小さな歯車（真ちゅう）。底の中心が原点 */
function smallGear(c: Ctx, r: number): void {
  const y = r + 0.02
  c.b.add(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.12, 20), c.m.brass, M(0, y, 0, Math.PI / 2, 0, 0))
  c.b.add(new THREE.CylinderGeometry(r * 0.22, r * 0.22, 0.18, 12), c.m.iron, M(0, y, 0, Math.PI / 2, 0, 0))
  const teeth = 12
  for (let k = 0; k < teeth; k++) {
    const a = (k / teeth) * Math.PI * 2
    c.b.add(new THREE.BoxGeometry(r * 0.3, r * 0.3, 0.12), c.m.brass, M(Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9, 0, 0, 0, a))
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4
    c.b.add(new THREE.BoxGeometry(r * 0.12, r * 0.95, 0.14), c.m.iron, M(Math.cos(a) * r * 0.42, y + Math.sin(a) * r * 0.42, 0, 0, 0, a - Math.PI / 2))
  }
}

/** 人が乗った細い舟（-X 向きに進む）。原点は水面 */
function passengerBoat(c: Ctx, seed: number): void {
  const hull = new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  c.b.add(hull, c.m.wood, M(0, 0.2, 0, 0, 0, 0, 1.7, 0.42, 0.42), { tint: woodTint(c.rng, WOOD.aged), uv: 'scale', uvScale: [4, 1] })
  c.b.add(new THREE.TorusGeometry(1, 0.04, 6, 24), c.m.wood, M(0, 0.2, 0, Math.PI / 2, 0, 0, 1.7, 0.42, 1), { tint: WOOD.dark, uv: 'scale', uvScale: [6, 0.2] })
  for (const lx of [-0.8, 0.7]) woodBox(c, lx, 0.18, 0, 0.14, 0.05, 0.72, { tint: WOOD.warm })
  // 船頭（笠・紺の着物）
  const robe = seed === 0 ? '#3b4f86' : '#7a3b34'
  c.b.add(new THREE.CylinderGeometry(0.15, 0.22, 0.62, 10), c.m.plain, M(0.35, 0.5, 0), { tint: robe })
  c.b.add(new THREE.SphereGeometry(0.12, 12, 8), c.m.plain, M(0.35, 0.92, 0), { tint: '#f1c9a5' })
  c.b.add(new THREE.ConeGeometry(0.3, 0.16, 14), c.m.plain, M(0.35, 1.07, 0), { tint: '#d8b56a' })
  // 棹
  c.b.add(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 6), c.m.wood, M(0.55, 0.9, 0.18, 0.15, 0, 0.5), { tint: WOOD.warm })
  // 荷物
  crate(c, -0.6, 0.18, 0, 0.36, 0.2)
}

// ------------------------------------------------------------------ 大歯車の協力パズル

/** 協力パズルで出す台詞（源兵衛は関西弁） */
export const GATE_LINES = {
  grabFirst: { speaker: '源兵衛', text: 'よし、そのまま支えといてくれ！ 今のうちに歯止めを入れる！' },
  grabRetry: { speaker: '源兵衛', text: 'よっしゃ、もういっぺんいくで！ しっかり支えとってや！' },
  grabWaitSignal: { speaker: '源兵衛', text: '歯止めは入っとる。おはるの合図を待つんや！' },
  halfway: { speaker: '源兵衛', text: 'もうちょいや……踏ん張ってくれ！' },
  ratchetSet: { speaker: '源兵衛', text: '歯止めは入った！ あとはおはるの合図で離すんや！' },
  danger: { speaker: 'おはる', text: '待って！ そこに人がいる！' },
  safe: { speaker: 'おはる', text: '今は離して！ もう大丈夫や！' },
  tooEarly: { speaker: '源兵衛', text: 'まだや！ 歯止めが入っとらん！ もう一回つかんでくれ！' },
  dangerFail: { speaker: '源兵衛', text: 'あかん、舟が下を通っとる！ もう一回支えてくれ！' },
  success: { speaker: '源兵衛', text: '……閉まった！ ようやった、ネクマックス！' },
  successOharu: { speaker: 'おはる', text: 'やったね！ 舟の人も無事や！' },
} as const

export type GateSignal = 'watch' | 'wait' | 'go' | 'done'

export type GateHudState = {
  visible: boolean
  phase: GatePhase
  progress: number
  signal: GateSignal
  signalText: string
}

/** 舟の通り道（北側の舟路。桟橋と大歯車の間） */
const BOAT_LANE_Z = -3.7

export class GateFlow {
  readonly logic = new GatePuzzleLogic()
  private readonly gate: GateParts
  private readonly boats: THREE.Group[]
  private readonly target: ClawTargetDef
  private readonly say: (speaker: string, text: string) => void
  private grabbedOnce = false
  private saidHalf = false
  private lastDanger = false
  private slip = 0
  private gearAngleSpeed = 0.25
  private bob = 0
  /** 失敗・成功の演出用（HUD が読む） */
  lastResult: GateResult = GateResult.NONE
  resultTime = 0

  constructor(gate: GateParts, boats: THREE.Group[], target: ClawTargetDef, say: (speaker: string, text: string) => void) {
    this.gate = gate
    this.boats = boats
    this.target = target
    this.say = say
  }

  get done(): boolean {
    return this.logic.phase === GatePhase.DONE
  }

  /** クローが大歯車につながった */
  onGrab(): void {
    const first = !this.grabbedOnce
    this.grabbedOnce = true
    const phase = this.logic.phase
    this.logic.grab()
    if (phase === GatePhase.WAIT_SIGNAL) {
      this.say(GATE_LINES.grabWaitSignal.speaker, GATE_LINES.grabWaitSignal.text)
      this.lastDanger = this.logic.isDanger()
    } else {
      const l = first ? GATE_LINES.grabFirst : GATE_LINES.grabRetry
      this.say(l.speaker, l.text)
    }
  }

  /** J で大歯車を離した。結果に応じて演出し、そのまま再挑戦できる */
  onRelease(): GateResult {
    const r = this.logic.release()
    this.lastResult = r
    this.resultTime = 0
    switch (r) {
      case GateResult.TOO_EARLY:
        this.slip = 1
        this.saidHalf = false
        this.say(GATE_LINES.tooEarly.speaker, GATE_LINES.tooEarly.text)
        break
      case GateResult.PERSON_IN_DANGER:
        this.slip = 0.6
        this.say(GATE_LINES.danger.speaker, GATE_LINES.danger.text)
        this.say(GATE_LINES.dangerFail.speaker, GATE_LINES.dangerFail.text)
        break
      case GateResult.SUCCESS:
        this.target.enabled = false
        this.say(GATE_LINES.success.speaker, GATE_LINES.success.text)
        this.say(GATE_LINES.successOharu.speaker, GATE_LINES.successOharu.text)
        break
    }
    return r
  }

  /** 演出なしで保持だけ外す（ショット切り替え・復帰など） */
  forceRelease(): void {
    this.logic.holding = false
  }

  tick(dt: number): void {
    this.resultTime += dt
    const before = this.logic.phase
    const ratchetSet = this.logic.tick(dt)
    if (ratchetSet) {
      this.say(GATE_LINES.ratchetSet.speaker, GATE_LINES.ratchetSet.text)
      this.say(GATE_LINES.danger.speaker, GATE_LINES.danger.text)
      this.lastDanger = true
    }
    if (before === GatePhase.ADJUSTING && this.logic.phase === GatePhase.ADJUSTING && !this.saidHalf && this.logic.progress >= 0.5) {
      this.saidHalf = true
      this.say(GATE_LINES.halfway.speaker, GATE_LINES.halfway.text)
    }
    if (this.logic.phase === GatePhase.WAIT_SIGNAL && this.logic.holding && !ratchetSet) {
      const d = this.logic.isDanger()
      if (d !== this.lastDanger) {
        const l = d ? GATE_LINES.danger : GATE_LINES.safe
        this.say(l.speaker, l.text)
        this.lastDanger = d
      }
    }
    // 大歯車の回転：支えている間は止まる。早く離すと滑って勢いよく回る。完成後は止まったまま
    let want = 0.25
    if (this.logic.holding || this.done) want = 0
    if (this.slip > 0) {
      want = 2.6 * this.slip
      this.slip = Math.max(0, this.slip - dt * 1.2)
    }
    this.gearAngleSpeed += (want - this.gearAngleSpeed) * Math.min(1, dt * 10)
    this.gate.setGearSpeed(this.gearAngleSpeed)
    // 舟
    this.bob += dt
    this.boats.forEach((b, i) => {
      const x = this.logic.boats[i]
      if (x === undefined) {
        b.visible = false
        return
      }
      b.visible = true
      b.position.set(x, L.WL_DOWN + Math.sin(this.bob * 2 + i) * 0.025, BOAT_LANE_Z)
      b.rotation.z = Math.sin(this.bob * 1.5 + i) * 0.02
    })
  }

  hudState(): GateHudState {
    const p = this.logic.phase
    const visible = this.logic.holding || p === GatePhase.WAIT_SIGNAL || (p === GatePhase.ADJUSTING && this.logic.progress > 0) || (p === GatePhase.WAIT_GRAB && this.logic.progress > 0) || (p === GatePhase.DONE && this.resultTime < 6)
    let signal: GateSignal = 'watch'
    if (p === GatePhase.WAIT_SIGNAL) signal = this.logic.isDanger() ? 'wait' : 'go'
    else if (p === GatePhase.DONE) signal = 'done'
    return { visible, phase: p, progress: this.logic.progress, signal, signalText: this.logic.signalText() }
  }

  /** 目的表示（左上） */
  objective(): { title: string; sub: string } {
    switch (this.logic.phase) {
      case GatePhase.WAIT_GRAB:
        return this.grabbedOnce
          ? { title: 'もう一度 大歯車を支えよう', sub: '照準を歯車へ向けて J でつかむ' }
          : { title: '大歯車を支えて、水門を直そう', sub: '桟橋から照準を歯車へ向けて J でつかむ' }
      case GatePhase.ADJUSTING:
        return { title: '大歯車を支えよう', sub: '源兵衛が歯止めを入れている' }
      case GatePhase.WAIT_SIGNAL:
        return { title: 'おはるの合図で離そう', sub: '舟が通り過ぎたら J で離す' }
      case GatePhase.DONE:
        return { title: '水門を直した！', sub: '仕掛け横丁を自由に歩いてみよう' }
    }
  }
}
