// よろいの影獣（物語 v7.1 の 6 章）の戦いを動かす係。手順と数値は beastLogic.ts、見た目は beastFx.ts。
// 獣は戦闘（combat/）の欠け重（brute）。自分では攻撃しない数値（近づかない・届かない）で出して、動きはここで決める：
//   近づく → ひっかく（戦闘のふつうの攻撃をそのまま使う）／突進（前足で地面をかく予告と赤い帯 → 走る → 柱で気絶・板がゆるむ）
//   よろいがなくなったら、おこって速くなり、とびかかり（ねらいの輪 → 跳ぶ → 衝撃の輪）と、一度だけ佐伯さんをつかむ
// 獣の姿勢（構え・走り・気絶）は、戦闘の頭脳の状態（brain.state / brain.t）を毎フレーム書いて見せる（戦闘の更新のあとに呼ぶ）。
// 突進・とびかかりの当たりは rt.combat.hurtPlayer に獣からの向きと吹っ飛ばしをわたす（のけぞり・吹っ飛びは戦闘の側）。
import * as THREE from 'three'
import type { StageRuntime, ObjectiveMark } from '../../../game/stage'
import type { EnemyHandle } from '../../../combat/combatSystem'
import type { EnemyStats } from '../../../combat/combatLogic'
import type { ClawTargetDef, WireEvent } from '../../../player/clawLogic'
import type { Character } from '../../../world/characters'
import type { Walker } from '../../../chronicle/kit/walker'
import { softenEnemy } from './softEnemy'
import { BeastFx } from './beastFx'
import { BEAST_TUNING as T, beastObjective, beastStep, chargeHits, firstPillarOnPath, nextMove, ringHits, telegraphLocked, type BeastMove, type BeastStep, type PillarDisc } from './beastLogic'
import { PILLARS } from './layoutV7'

export type BeastHandle = EnemyHandle & { def: ClawTargetDef }

/** 獣が自分では攻撃しない数値（動きはこの係が決める）。ひっかくときだけ hitRange を入れる */
export const BEAST_STATS: Partial<EnemyStats> = {
  name: 'よろいの影獣',
  speed: 0,
  reach: 0,
  sight: 99,
  lose: 99,
  hitRange: 0,
  hitArc: T.scratch.hitArc,
  windup: T.scratch.windup,
  active: 0.24,
  recover: 0.9,
  damage: 1,
  knock: T.scratch.knock,
}

type Mode =
  | { k: 'wait'; t: number }
  | { k: 'stalk'; t: number; dur: number }
  | { k: 'scratch'; t: number }
  | { k: 'paw'; t: number; dur: number; lock: number; dx: number; dz: number }
  | { k: 'charge'; t: number; dx: number; dz: number; run: number; hit: boolean; puff: number }
  | { k: 'crashed'; t: number; sx: number; sz: number }
  | { k: 'miss'; t: number; dur: number }
  | { k: 'pounce'; t: number; dur: number; tx: number; tz: number }
  | { k: 'air'; t: number; fx: number; fz: number; tx: number; tz: number }
  | { k: 'ring'; t: number; cx: number; cz: number; hit: boolean }
  | { k: 'roar'; t: number }
  | { k: 'grab'; t: number; hold: boolean; side: number }
  | { k: 'hurt'; t: number }

export type BeastFightHost = {
  saeki: Character
  walker: Walker
  /** 佐伯さんがにげる先 */
  saekiSafe: THREE.Vector3
  /** 台詞（lines_v7.json のキー）を小さく出す（戦いを止めない） */
  say(key: string): void
  /** 佐伯さんをつかんだ・はなした（目標の欄・会話） */
  onGrab?(): void
  onRelease?(byClaw: boolean): void
}

/** 戦いの記録（ボットの確認用） */
export type BeastStats = { charges: number; crashes: number; firstCrashAt: number; misses: number; plateHits: number; throws: number; hitsTaken: number; grabs: number }

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

/** 戦いの場の外へ出ない（建物の前・橋の手前まで） */
const ARENA = { x0: -23, x1: 10, zMax: 10.7 }

export class BeastFight {
  readonly fx = new BeastFx()
  readonly h: BeastHandle
  plates: number
  angry = false
  misses = 0
  readonly stats: BeastStats = { charges: 0, crashes: 0, firstCrashAt: 0, misses: 0, plateHits: 0, throws: 0, hitsTaken: 0, grabs: 0 }
  /** 佐伯さんをつかんだ腕（J で引きはがす） */
  readonly armDef: ClawTargetDef
  private mode: Mode = { k: 'wait', t: 0 }
  private readonly rt: StageRuntime
  private readonly host: BeastFightHost
  private readonly plateMeshes: THREE.Mesh[]
  private readonly plateBase: Array<{ p: THREE.Vector3; r: THREE.Euler }>
  private readonly pillars: PillarDisc[]
  private readonly muted: ClawTargetDef[] = []
  private last: BeastMove | null = null
  private scratchCd = 1.5
  private grace = 0
  private angryT = 0
  private grabbed = false
  private grabDone = false
  private holding = false
  private lockedHints = 0
  private seen = new Set<string>()
  private groundP = 0
  private readonly tmp = v()
  private readonly tmp2 = v()
  private readonly dir = v()
  private readonly head = v()
  private readonly markAt = [v(), v(), v(), v()]
  private readonly marks: ObjectiveMark[] = []

  constructor(rt: StageRuntime, h: BeastHandle, plateMeshes: THREE.Mesh[], root: THREE.Object3D, host: BeastFightHost) {
    this.rt = rt
    this.h = h
    this.host = host
    this.plateMeshes = plateMeshes
    this.plates = plateMeshes.length
    this.plateBase = plateMeshes.map((m) => ({ p: m.position.clone(), r: m.rotation.clone() }))
    this.pillars = PILLARS.map((p) => ({ x: p.pos.x, z: p.pos.z, r: p.r }))
    h.model.root.rotation.order = 'YXZ'
    root.add(this.fx.group)
    this.armDef = { id: 'v7_beast_arm', type: 'enemy_pull', label: '佐伯さんをつかんだ影の腕', point: v(), radius: 0.7, enabled: false, noLineOfSight: true, range: 12, cone: 0.85 }
    rt.claw.targets.push(this.armDef)
    // 戦いの間は、町のつかめる物（木箱など）をねらわない（J はいつも獣へ）
    for (const t of rt.claw.targets) {
      if (t === h.def || t === this.armDef || !t.enabled) continue
      t.enabled = false
      this.muted.push(t)
    }
    h.def.label = 'よろいの影獣（板がかたい）'
    this.groundP = rt.player.position.y
  }

  // ---------------------------------------------------------------- 戦闘からのお知らせ

  /** はじめる（first：はじめは少し動かない） */
  start(first = 1.6): void {
    this.mode = { k: 'wait', t: -first }
    this.h.brain.stun(first)
  }

  /** よろいの板が 1 枚はがれた */
  onPlate(left: number): void {
    this.plates = left
    this.restorePlates()
    this.h.def.label = left > 0 ? 'よろいの影獣（板がかたい）' : 'よろいの影獣'
    this.host.say(this.once('plate1') ? 'beast_plate_first' : 'beast_plate')
  }

  /** ゆるんでいない板を J で引いた */
  onPlateLocked(): void {
    this.lockedHints++
    this.host.say(this.lockedHints >= 2 ? 'beast_locked2' : 'beast_locked')
  }

  /** 投げた板が当たった */
  onPlateHit(): void {
    this.stats.plateHits++
    this.rt.hud.flash('success')
    this.host.say(this.plates <= 0 ? 'beast_bare' : 'beast_plate_hit')
  }

  /** ワイヤーのお知らせ（つかんだ腕に J） */
  onClaw(e: WireEvent): void {
    if (e.kind === 'connected' && 'target' in e && e.target === this.armDef && this.mode.k === 'grab' && this.mode.hold) this.release(true)
  }

  /** 体力 0 でもどった（獣は住みかへもどされている） */
  onRespawn(): void {
    this.fx.clear()
    this.restorePlates()
    this.h.model.root.rotation.x = 0
    softenEnemy(this.h, { hitRange: 0 })
    if (this.mode.k === 'grab') this.release(false)
    this.mode = { k: 'stalk', t: 0, dur: 2.5 }
    this.grace = 2.4
    this.holding = false
  }

  /** 戦いのおわり（たおした・演出で片づけた） */
  finish(): void {
    if (this.mode.k === 'grab') this.release(true)
    this.fx.clear()
    this.restorePlates()
    this.h.model.root.rotation.x = 0
    this.armDef.enabled = false
    const i = this.rt.claw.targets.indexOf(this.armDef)
    if (i >= 0) this.rt.claw.targets.splice(i, 1)
    for (const t of this.muted) t.enabled = true
    this.muted.length = 0
  }

  // ---------------------------------------------------------------- 目標・目印・案内

  get step(): BeastStep {
    return beastStep({ plates: this.plates, loose: this.rt.combat.platesLoose(this.h), holding: this.rt.combat.holdingPlate, grabbed: this.grabbed })
  }

  get grabbing(): boolean {
    return this.grabbed
  }

  objective(): { title: string; sub: string } {
    return beastObjective(this.step, this.plates, this.misses)
  }

  markers(): ObjectiveMark[] {
    const out = this.marks
    out.length = 0
    const at = (p: THREE.Vector3, y: number) => this.markAt[out.length].copy(p).setY(p.y + y)
    const step = this.step
    if (step === 'rescue') {
      out.push({ pos: at(this.host.saeki.root.position, 1.9), label: '佐伯さん', edge: true })
      return out
    }
    const label = step === 'strip' ? 'ゆるんだ板' : step === 'throw' ? 'ここへ投げる' : 'よろいの影獣'
    out.push({ pos: at(this.h.pos, 3.4), label, edge: true })
    if (step === 'charge') {
      // いちばん近い柱を 2 本
      const p = this.rt.player.position
      const order = PILLARS.map((q, i) => ({ i, d: Math.hypot(q.pos.x - p.x, q.pos.z - p.z) })).sort((a, b) => a.d - b.d)
      for (const o of order.slice(0, 2)) out.push({ pos: at(PILLARS[o.i].pos, PILLARS[o.i].kind === 'lamp' ? 4.7 : 3.6), label: '柱' })
    }
    return out
  }

  // ---------------------------------------------------------------- 毎フレーム（戦闘の更新のあと）

  private startRoarSoon = -1
  private throwCheck: { t: number; hits: number } | null = null

  update(dt: number): void {
    const rt = this.rt
    const h = this.h
    this.fx.update(dt)
    if (!h.alive) {
      this.fx.clear()
      return
    }
    // 板を投げた（持っていたのに、もう無い）→ 少しして当たっていなければ、ひとこと
    const holdNow = rt.combat.holdingPlate
    if (this.holding && !holdNow && !rt.combat.downed) {
      this.stats.throws++
      this.throwCheck = { t: 1.4, hits: this.stats.plateHits }
    }
    this.holding = holdNow
    if (this.throwCheck) {
      this.throwCheck.t -= dt
      if (this.throwCheck.t <= 0) {
        if (this.stats.plateHits === this.throwCheck.hits) this.host.say(this.plates > 0 ? 'beast_throw_miss' : 'beast_throw_miss_last')
        this.throwCheck = null
      }
    }
    if (rt.player.grounded) this.groundP = rt.player.position.y
    this.updatePlates(dt)
    if (rt.combat.downed) return
    if (this.grace > 0) this.grace -= dt
    const passive = rt.combat.passive || this.grace > 0
    // よろいがなくなって、板も手から離れたら、おこる
    if (this.plates <= 0 && !this.angry && !holdNow && this.startRoarSoon < 0 && this.mode.k !== 'roar') this.startRoarSoon = 1.6
    if (this.startRoarSoon > 0 && !passive) {
      this.startRoarSoon -= dt
      if (this.startRoarSoon <= 0 && !this.angry) this.beginRoar()
    }
    if (this.angry) this.angryT += dt
    this.scratchCd -= dt
    const m = this.mode
    m.t += dt
    // プレイヤーのこうげきで、ひるんだ・気絶した（板が当たった）
    const bs = h.brain.state
    if ((bs === 'stunned' || bs === 'stagger') && m.k !== 'crashed' && m.k !== 'hurt' && m.k !== 'grab') {
      const armor = m.k === 'paw' || m.k === 'charge' || m.k === 'air' || m.k === 'roar' || m.k === 'pounce'
      if (bs === 'stunned' || !armor) this.toHurt()
    }
    if (passive && this.mode.k !== 'crashed' && this.mode.k !== 'hurt') {
      // 会話・演出・やられたあと：いまの動きをやめて、その場で待つ（構えの途中で当たらないように）
      const k = this.mode.k
      if (k === 'paw' || k === 'charge' || k === 'pounce' || k === 'air' || k === 'scratch' || k === 'ring' || k === 'roar') {
        softenEnemy(h, { hitRange: 0 })
        this.fx.clear()
        h.pos.y = 0
        h.model.root.rotation.x = 0
        this.mode = k === 'roar' ? { k: 'roar', t: 0 } : { k: 'stalk', t: 0, dur: 1.2 }
      }
      if (this.mode.k !== 'grab') this.setBrain('chase', 0)
      h.model.root.userData.speed = 0
      return
    }
    this.step1(dt)
    this.aimPoint()
  }

  /**
   * クローのねらう点：胸より低い腰の高さにする（照準の吸い付きが小さい aimCone は上下にもせまいので、
   * ふつうのカメラの高さのまま、正面へ向ければ合うように）。ワイヤーを撃っている間は戦闘の点のまま
   */
  private aimPoint(): void {
    if (this.rt.claw.wire.phase !== 'idle') return
    const h = this.h
    h.def.point.set(h.pos.x, h.pos.y + T.aimY, h.pos.z)
  }

  private step1(dt: number): void {
    const rt = this.rt
    const h = this.h
    const b = h.brain
    const P = rt.player.position
    const m = this.mode
    const dx = P.x - h.pos.x
    const dz = P.z - h.pos.z
    const dist = Math.hypot(dx, dz)
    h.model.root.rotation.x = 0
    switch (m.k) {
      case 'wait':
        if (m.t >= 0 && b.state !== 'stunned') this.mode = { k: 'stalk', t: 0, dur: 0.8 }
        return
      case 'hurt':
        this.fx.hideBand()
        this.fx.markPillar(null)
        this.fx.showTarget(null)
        if (b.state !== 'stunned' && b.state !== 'stagger' && m.t > 0.2) this.mode = { k: 'stalk', t: 0, dur: this.angry ? 0.6 : 1.0 }
        return
      case 'crashed':
        // 柱からはね返されて、よろける（はじめの 0.35 秒）
        if (m.t < 0.35 && (m.sx || m.sz)) {
          const k = dt / 0.35
          h.pos.x = Math.min(ARENA.x1, Math.max(ARENA.x0, h.pos.x + m.sx * k))
          h.pos.z = Math.min(ARENA.zMax, h.pos.z + m.sz * k)
        }
        this.head.copy(h.pos).setY(h.pos.y + 2.75 * T.scale * 0.85)
        this.fx.setStars(this.head)
        if (b.state !== 'stunned' && m.t > 0.5) {
          this.fx.setStars(null)
          this.mode = { k: 'stalk', t: 0, dur: this.angry ? 0.6 : 1.2 }
        }
        return
      case 'stalk': {
        this.turnTo(dx, dz, dt, 3.2)
        const sp = T.stalkSpeed[this.angry ? 1 : 0]
        const moving = dist > 2.4
        if (moving) this.moveBy(dx / dist, dz / dist, sp * dt)
        this.setBrain('chase', 0)
        h.model.root.userData.speed = moving ? sp : 0
        // 佐伯さんをつかむ（おこってから一度だけ）
        if (this.angry && !this.grabDone && (this.angryT > T.grab.after || b.hp <= T.grab.hpAtMost) && m.t > 0.3) {
          this.beginGrab()
          return
        }
        const ready = this.scratchCd <= 0
        if (ready && dist < T.scratch.near && m.t > 0.35) this.begin('scratch', dist)
        else if (m.t >= m.dur) this.begin(nextMove({ armored: !this.angry, dist, scratchReady: ready, last: this.last }), dist)
        return
      }
      case 'scratch':
        // ふつうの攻撃（構え → 当たり → 戻り）は戦闘の頭脳にまかせる。おわったら近づくへ
        if ((b.state === 'chase' || b.state === 'idle') && m.t > 0.2) {
          softenEnemy(h, { hitRange: 0 })
          this.mode = { k: 'stalk', t: 0, dur: this.angry ? 0.9 : 1.2 }
        }
        return
      case 'paw': {
        const locked = telegraphLocked(m.t, m.dur, m.lock)
        if (!locked) {
          this.turnTo(dx, dz, dt, 4)
          m.dx = -Math.sin(h.yaw)
          m.dz = -Math.cos(h.yaw)
        } else h.yaw = Math.atan2(-m.dx, -m.dz)
        // 前足で地面をかく（体をゆする・土ぼこり）
        h.model.root.rotation.x = 0.06 * Math.sin(m.t * 16)
        if (Math.floor(m.t / 0.28) !== Math.floor((m.t - dt) / 0.28)) this.fx.puff(this.tmp.set(h.pos.x + m.dx * 1.0, h.pos.y, h.pos.z + m.dz * 1.0), 3, 0.6, 0.7)
        this.showPath(m.dx, m.dz, locked)
        this.setBrain('windup', Math.min(m.t, m.dur - 0.05))
        if (m.t >= m.dur) {
          this.fx.markPillar(null)
          this.mode = { k: 'charge', t: 0, dx: m.dx, dz: m.dz, run: 0, hit: false, puff: 0 }
          rt.shake(0.15)
        }
        return
      }
      case 'charge':
        this.updateCharge(m, dt)
        return
      case 'miss':
        this.fx.hideBand()
        this.setBrain(m.t < 0.5 ? 'recover' : 'chase', m.t)
        if (m.t > 0.5) this.turnTo(dx, dz, dt, 2.4)
        if (m.t >= m.dur) this.mode = { k: 'stalk', t: 0, dur: this.angry ? 0.8 : 1.4 }
        return
      case 'pounce': {
        const locked = telegraphLocked(m.t, m.dur, T.pounce.lockBefore)
        if (!locked) {
          this.turnTo(dx, dz, dt, 4)
          m.tx = Math.min(ARENA.x1, Math.max(ARENA.x0, P.x))
          m.tz = Math.min(ARENA.zMax, P.z)
        }
        this.fx.showTarget(this.tmp.set(m.tx, h.pos.y, m.tz), T.pounce.landR, locked)
        h.model.root.rotation.x = 0.12 * Math.min(1, m.t / m.dur)
        this.setBrain('windup', Math.min(m.t, m.dur - 0.05))
        if (m.t >= m.dur) this.mode = { k: 'air', t: 0, fx: h.pos.x, fz: h.pos.z, tx: m.tx, tz: m.tz }
        return
      }
      case 'air': {
        const k = Math.min(1, m.t / T.pounce.air)
        h.pos.x = m.fx + (m.tx - m.fx) * k
        h.pos.z = m.fz + (m.tz - m.fz) * k
        h.pos.y = Math.sin(Math.PI * k) * 2.4 + this.groundP * 0
        h.yaw = Math.atan2(-(m.tx - m.fx), -(m.tz - m.fz))
        h.model.root.rotation.x = -0.35 * (1 - k) + 0.2 * k
        this.setBrain('attack', 0.05)
        if (k >= 1) this.land(m.tx, m.tz)
        return
      }
      case 'ring': {
        const r = 0.6 + T.pounce.ringSpeed * m.t
        const alpha = Math.max(0, 1 - r / T.pounce.ringMax)
        this.fx.setWave(r, T.pounce.ringHeight + 0.25, 0.4 + alpha * 0.6)
        const pd = Math.hypot(P.x - m.cx, P.z - m.cz)
        const air = rt.player.grounded ? 0 : P.y - this.groundP
        if (!m.hit && ringHits(r, pd, air)) {
          m.hit = true
          this.hurt(this.tmp.set(P.x - m.cx, 0, P.z - m.cz), T.pounce.knock)
        }
        this.setBrain('recover', Math.min(m.t, 0.3))
        if (r >= T.pounce.ringMax) {
          this.fx.stopWave()
          this.mode = { k: 'stalk', t: 0, dur: 0.9 }
        }
        return
      }
      case 'roar':
        this.setBrain('windup', Math.min(m.t, T.roar))
        h.model.root.rotation.x = 0.15 * Math.sin(m.t * 30) * Math.min(1, m.t)
        if (Math.floor(m.t / 0.3) !== Math.floor((m.t - dt) / 0.3)) rt.shake(0.2)
        if (m.t >= T.roar) this.mode = { k: 'stalk', t: 0, dur: 0.6 }
        return
      case 'grab':
        this.updateGrab(m, dt)
        return
    }
  }

  // ---------------------------------------------------------------- 動き

  private begin(move: BeastMove, dist: number): void {
    const h = this.h
    this.last = move
    if (move === 'scratch') {
      this.scratchCd = T.scratch.cooldown + (this.angry ? 0 : 0.8)
      softenEnemy(h, { hitRange: T.scratch.hitRange, windup: T.scratch.windup })
      h.brain.state = 'windup'
      h.brain.t = 0
      this.mode = { k: 'scratch', t: 0 }
      return
    }
    if (move === 'charge') {
      const i = this.angry ? 1 : 0
      this.stats.charges++
      softenEnemy(h, { hitRange: 0, windup: T.charge.paw[i] })
      this.mode = { k: 'paw', t: 0, dur: T.charge.paw[i], lock: T.charge.lockBefore[i], dx: -Math.sin(h.yaw), dz: -Math.cos(h.yaw) }
      if (this.once('paw')) this.host.say('beast_paw_first')
      return
    }
    softenEnemy(h, { hitRange: 0, windup: T.pounce.windup })
    const P = this.rt.player.position
    this.mode = { k: 'pounce', t: 0, dur: T.pounce.windup, tx: P.x, tz: P.z }
    if (this.once('pounce')) this.host.say('beast_pounce_first')
    void dist
  }

  private updateCharge(m: Extract<Mode, { k: 'charge' }>, dt: number): void {
    const rt = this.rt
    const h = this.h
    const i = this.angry ? 1 : 0
    const top = T.charge.speed[i]
    const sp = 4 + (top - 4) * Math.min(1, m.t / T.charge.accel)
    const step = sp * dt
    h.yaw = Math.atan2(-m.dx, -m.dz)
    h.model.root.rotation.x = -0.24
    this.setBrain('chase', 0)
    h.model.root.userData.speed = 9
    this.fx.hideBand()
    // 柱にぶつかる
    const hit = firstPillarOnPath(h.pos.x, h.pos.z, m.dx, m.dz, step + 0.02, this.pillars, T.bodyR)
    if (hit) {
      h.pos.x += m.dx * hit.d
      h.pos.z += m.dz * hit.d
      // 勢いがついていないと（走り出してすぐ）、ぶつかっても板はゆるまない
      if (m.run + hit.d >= T.charge.minRun) this.crash(hit.i)
      else this.miss(T.miss.bonk, true)
      return
    }
    // 壁・行き止まり・戦いの場の外
    const nx = h.pos.x + m.dx * step
    const nz = h.pos.z + m.dz * step
    this.tmp.set(h.pos.x, h.pos.y + 0.45, h.pos.z)
    this.dir.set(m.dx, 0, m.dz)
    const wall = rt.phys.raycast(this.tmp, this.dir, step + T.bodyR * 0.9, rt.player.collider)
    if (wall !== null || nx < ARENA.x0 || nx > ARENA.x1 || nz > ARENA.zMax || this.nearPerson(nx, nz)) {
      this.miss(T.miss.bonk, true)
      return
    }
    h.pos.x = nx
    h.pos.z = nz
    m.run += step
    // プレイヤーに当たる（体の幅の中）
    const P = rt.player.position
    const rx = P.x - h.pos.x
    const rz = P.z - h.pos.z
    const along = rx * m.dx + rz * m.dz
    const lat = rx * m.dz - rz * m.dx
    if (!m.hit && Math.abs(P.y - h.pos.y) < 1.3 && chargeHits(along, lat, T.bodyR)) {
      m.hit = true
      // 横へはじき飛ばす（獣の進む向きも少し）
      const side = lat >= 0 ? 1 : -1
      this.hurt(this.tmp2.set(m.dz * side + m.dx * 0.6, 0, -m.dx * side + m.dz * 0.6), T.charge.knock)
    }
    m.puff -= dt
    if (m.puff <= 0) {
      m.puff = 0.09
      this.fx.puff(this.tmp.set(h.pos.x - m.dx * 0.6, h.pos.y, h.pos.z - m.dz * 0.6), 2, 0.5, 0.8)
    }
    if (m.run >= T.charge.maxLen) this.miss(T.miss.skid, false)
  }

  /** 佐伯さん・社長のところで止まる（体をすりぬけない） */
  private nearPerson(x: number, z: number): boolean {
    const s = this.host.saeki.root.position
    return Math.hypot(s.x - x, s.z - z) < T.bodyR + 0.3 && !this.grabbed
  }

  private crash(i: number): void {
    const rt = this.rt
    const h = this.h
    const p = PILLARS[i]
    this.stats.crashes++
    if (!this.stats.firstCrashAt) this.stats.firstCrashAt = this.stats.charges
    this.misses = 0
    // 柱にはね返されて、うしろ・横へよろける（柱のかげにかくれて、ねらえなくならないように。プレイヤーのいる側へ）
    const fx = -Math.sin(h.yaw)
    const fz = -Math.cos(h.yaw)
    const P = this.rt.player.position
    const side = (P.x - h.pos.x) * fz - (P.z - h.pos.z) * fx >= 0 ? 1 : -1
    h.brain.stun(T.crash.stun)
    this.mode = { k: 'crashed', t: 0, sx: fz * side * 1.2 - fx * 0.7, sz: -fx * side * 1.2 - fz * 0.7 }
    rt.shake(0.5)
    this.fx.puff(this.tmp.set(p.pos.x, h.pos.y + 0.6, p.pos.z), 10, 1.2, 1.1)
    this.fx.markPillar(null)
    if (this.plates > 0) {
      rt.combat.loosenPlates(h, T.crash.loose)
      this.h.def.label = 'ゆるんだ板（J ではがせる！）'
      this.host.say(this.once('crash') ? 'beast_crash_first' : 'beast_crash')
    } else this.host.say('beast_crash_bare')
  }

  private miss(dur: number, bonk: boolean): void {
    if (!this.angry) {
      this.misses++
      this.stats.misses++
      if (this.misses === T.hintAfterMisses) this.host.say('beast_miss_hint')
    }
    if (bonk) this.rt.shake(0.2)
    this.mode = { k: 'miss', t: 0, dur }
  }

  private land(x: number, z: number): void {
    const rt = this.rt
    const h = this.h
    h.pos.y = 0
    rt.shake(0.5)
    this.fx.showTarget(null)
    this.fx.puff(this.tmp.set(x, 0, z), 10, 1.4, 1.2)
    this.fx.startWave(this.tmp.set(x, h.pos.y, z))
    const P = rt.player.position
    const air = rt.player.grounded ? 0 : P.y - this.groundP
    const d = Math.hypot(P.x - x, P.z - z)
    const hit = d < T.pounce.landR && air < 1.0
    if (hit) this.hurt(this.tmp2.set(P.x - x, 0, P.z - z), T.pounce.knock)
    this.mode = { k: 'ring', t: 0, cx: x, cz: z, hit }
  }

  private beginRoar(): void {
    this.angry = true
    this.angryT = 0
    this.fx.clear()
    this.mode = { k: 'roar', t: 0 }
    this.h.def.label = 'よろいの影獣'
    this.host.say('beast_roar')
  }

  private toHurt(): void {
    if (this.mode.k === 'scratch') softenEnemy(this.h, { hitRange: 0 })
    this.fx.hideBand()
    this.fx.markPillar(null)
    this.fx.showTarget(null)
    this.h.model.root.rotation.x = 0
    this.mode = { k: 'hurt', t: 0 }
  }

  /** プレイヤーに当たった（ハート 1 つ・獣からの向きへ吹っ飛ぶ） */
  private hurt(dir: THREE.Vector3, knock: number): void {
    if (this.rt.combat.downed) return
    dir.y = 0
    if (dir.lengthSq() < 1e-4) dir.set(-Math.sin(this.h.yaw), 0, -Math.cos(this.h.yaw))
    dir.normalize()
    const before = this.rt.combat.health.hp
    this.rt.combat.hurtPlayer(1, dir, knock)
    if (this.rt.combat.health.hp < before) this.stats.hitsTaken++
  }

  // ---------------------------------------------------------------- 佐伯さんをつかむ

  private beginGrab(): void {
    this.grabDone = true
    this.stats.grabs++
    this.host.walker.stop(this.host.saeki)
    this.mode = { k: 'grab', t: 0, hold: false, side: 1 }
  }

  private updateGrab(m: Extract<Mode, { k: 'grab' }>, dt: number): void {
    const rt = this.rt
    const h = this.h
    const s = this.host.saeki
    if (!m.hold) {
      this.tmp.set(s.root.position.x - h.pos.x, 0, s.root.position.z - h.pos.z)
      const d = this.tmp.length()
      this.turnTo(this.tmp.x, this.tmp.z, dt, 5)
      if (d > 1.5) {
        h.pos.addScaledVector(this.tmp.normalize(), Math.min(d - 1.5, 3.6 * dt))
        h.model.root.userData.speed = 3.6
      }
      this.setBrain('chase', 0)
      if (d <= 1.6 || m.t > 4) {
        m.hold = true
        m.t = 0
        // プレイヤーから見て、佐伯さんのいる側に持ち上げる（獣の体のかげにかくれないように）
        const px = rt.player.position.x - h.pos.x
        const pz = rt.player.position.z - h.pos.z
        m.side = -pz * (s.root.position.x - h.pos.x) + px * (s.root.position.z - h.pos.z) >= 0 ? 1 : -1
        h.def.enabled = false
        this.armDef.enabled = true
        this.grabbed = true
        this.host.onGrab?.()
        rt.shake(0.2)
      }
      return
    }
    // つかんでいる：プレイヤーの方を向き、佐伯さんを横に持ち上げる
    this.turnTo(rt.player.position.x - h.pos.x, rt.player.position.z - h.pos.z, dt, 5)
    const fx = -Math.sin(h.yaw)
    const fz = -Math.cos(h.yaw)
    const sx = -fz * m.side
    const sz = fx * m.side
    s.root.position.set(h.pos.x + sx * 1.55 + fx * 0.5, 0.55 + Math.sin(m.t * 9) * 0.04, h.pos.z + sz * 1.55 + fz * 0.5)
    this.host.walker.face(s, h.pos)
    this.armDef.point.set(h.pos.x + sx * 1.1 + fx * 0.4, 1.5, h.pos.z + sz * 1.1 + fz * 0.4)
    this.setBrain('windup', T.scratch.windup * 0.9)
    if (m.t > T.grab.hold) this.release(false)
  }

  private release(byClaw: boolean): void {
    const m = this.mode
    if (m.k !== 'grab') return
    this.grabbed = false
    this.armDef.enabled = false
    this.h.def.enabled = true
    const s = this.host.saeki
    s.root.position.y = 0
    void this.host.walker.walkTo(s, [this.host.saekiSafe], 2.6, this.h.pos)
    this.host.onRelease?.(byClaw)
    if (byClaw) {
      this.rt.hud.flash('success')
      this.h.brain.stun(3.0)
      this.mode = { k: 'crashed', t: 0, sx: 0, sz: 0 }
    } else this.mode = { k: 'stalk', t: 0, dur: 1.0 }
  }

  // ---------------------------------------------------------------- 小さな道具

  private once(key: string): boolean {
    if (this.seen.has(key)) return false
    this.seen.add(key)
    return true
  }

  private setBrain(state: 'chase' | 'windup' | 'attack' | 'recover', t: number): void {
    this.h.brain.state = state
    this.h.brain.t = t
  }

  private turnTo(dx: number, dz: number, dt: number, rate: number): void {
    if (dx * dx + dz * dz < 1e-4) return
    let d = Math.atan2(-dx, -dz) - this.h.yaw
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    this.h.yaw += Math.sign(d) * Math.min(Math.abs(d), rate * dt)
  }

  /** 歩いて動く（壁と戦いの場のはしで止まる） */
  private moveBy(dx: number, dz: number, step: number): void {
    const h = this.h
    this.tmp.set(h.pos.x, h.pos.y + 0.45, h.pos.z)
    this.dir.set(dx, 0, dz)
    if (this.rt.phys.raycast(this.tmp, this.dir, step + T.bodyR * 0.9, this.rt.player.collider) !== null) return
    const nx = h.pos.x + dx * step
    const nz = h.pos.z + dz * step
    if (nx < ARENA.x0 || nx > ARENA.x1 || nz > ARENA.zMax) return
    if (firstPillarOnPath(h.pos.x, h.pos.z, dx, dz, step, this.pillars, T.bodyR * 0.8)) return
    h.pos.x = nx
    h.pos.z = nz
  }

  /** 突進の帯（向きと、最初にぶつかる物までの長さ）と、柱の印 */
  private showPath(dx: number, dz: number, locked: boolean): void {
    const h = this.h
    this.tmp.set(h.pos.x, h.pos.y + 0.45, h.pos.z)
    this.dir.set(dx, 0, dz)
    const wall = this.rt.phys.raycast(this.tmp, this.dir, T.charge.maxLen + T.bodyR, this.rt.player.collider)
    let len = wall === null ? T.charge.maxLen : Math.max(0.5, wall)
    // 戦いの場のはし
    if (dz > 1e-3) len = Math.min(len, (ARENA.zMax - h.pos.z) / dz + T.bodyR)
    if (dx > 1e-3) len = Math.min(len, (ARENA.x1 - h.pos.x) / dx + T.bodyR)
    if (dx < -1e-3) len = Math.min(len, (ARENA.x0 - h.pos.x) / dx + T.bodyR)
    const hit = firstPillarOnPath(h.pos.x, h.pos.z, dx, dz, len, this.pillars, T.bodyR)
    if (hit) len = hit.d + T.bodyR
    this.fx.showBand(this.tmp.set(h.pos.x, h.pos.y, h.pos.z), dx, dz, len, T.bodyR * 2.1, locked)
    this.fx.markPillar(hit && hit.d >= T.charge.minRun ? PILLARS[hit.i].pos : null)
  }

  /** ゆるんだ板：光って、ガタガタ（次にはがれる板＝いちばん後ろの板） */
  private updatePlates(_dt: number): void {
    const loose = this.plates > 0 && this.rt.combat.platesLoose(this.h)
    const i = this.plates - 1
    if (i < 0) return
    const mesh = this.plateMeshes[i]
    const base = this.plateBase[i]
    const mat = mesh.material as THREE.MeshStandardMaterial
    // ゆるんでいる間は、細い柱のかげでも照準が合う
    this.h.def.noLineOfSight = loose
    if (loose) {
      const t = performance.now() / 1000
      mat.emissiveIntensity = 0.9 + 0.7 * Math.abs(Math.sin(t * 9))
      mesh.rotation.set(base.r.x + Math.sin(t * 41) * 0.09, base.r.y + Math.sin(t * 37) * 0.07, base.r.z + Math.sin(t * 29) * 0.08)
      mesh.position.set(base.p.x + Math.sin(t * 33) * 0.03, base.p.y + Math.abs(Math.sin(t * 23)) * 0.05, base.p.z - 0.06)
    } else if (mat.emissiveIntensity !== 0) {
      mat.emissiveIntensity = 0
      mesh.position.copy(base.p)
      mesh.rotation.copy(base.r)
      if (this.plates > 0) this.h.def.label = 'よろいの影獣（板がかたい）'
    }
  }

  private restorePlates(): void {
    for (let i = 0; i < this.plateMeshes.length; i++) {
      const m = this.plateMeshes[i]
      if (m.parent !== this.h.model.root) continue
      ;(m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0
      m.position.copy(this.plateBase[i].p)
      m.rotation.copy(this.plateBase[i].r)
    }
  }

  debug(): Record<string, unknown> {
    const m = this.mode
    return {
      mode: m.k,
      t: +m.t.toFixed(2),
      dur: 'dur' in m ? m.dur : null,
      lock: m.k === 'paw' ? m.lock : m.k === 'pounce' ? T.pounce.lockBefore : null,
      target: m.k === 'pounce' || m.k === 'air' ? [m.tx, m.tz] : m.k === 'ring' ? [m.cx, m.cz] : null,
      ring: m.k === 'ring' ? 0.6 + T.pounce.ringSpeed * m.t : null,
      pos: [this.h.pos.x, this.h.pos.z],
      yaw: this.h.yaw,
      brain: this.h.brain.state,
      plates: this.plates,
      angry: this.angry,
      step: this.step,
      misses: this.misses,
      grabbed: this.grabbed,
      hp: this.h.brain.hp,
      stats: { ...this.stats },
    }
  }

  dispose(): void {
    this.fx.dispose()
  }
}
