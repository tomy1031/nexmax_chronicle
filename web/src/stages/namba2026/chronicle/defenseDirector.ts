// 9 章の夜：ほこら防衛の進行（物語 v7「社長との約束」）。ステージ（stage.ts）が会話・カメラの場面を受け持ち、
// ここは遊びの中身を受け持つ：2 波の影・屋根にのぼる影・ほこらの体力・江戸の朝の光で影がにげる・大きな影。
// ・地面の影（北＝路地の口、南＝トンネル路地）：戦闘（rt.combat）の欠け虫・欠け盾を影の色で。住みか（home）をほこらの前にして、
//   ほこらへ向かわせる。ほこらの前で手が空いている（プレイヤーと戦っていない）影は、箱にとびかかってほこらの体力を減らす
// ・屋根の影：ここで動かす影（欠け虫の形）。物置・長屋の屋根づたいに、ほこらの屋根へ。とりつくと体力が減る。
//   J（クロー）でつかむと引きずり下ろされて、地面の影（戦闘の欠け虫）になる
// ・2 波しのぐと onWavesCleared（ステージが社長の映し出しの場面を流す）→ startBig() で大きな影
// ・大きな影：暗がり（DEFENSE.darkCorners）にかくれる。暗がりでは攻撃が効かない（体力が戻る）。F で社長に照らしてもらうと
//   まぶしくて動けなくなり、J で飛びついて引きたおせる・K が効く。しばらくすると、次の暗がりへにげる
import * as THREE from 'three'
import type { StageRuntime } from '../../../game/stage'
import type { ClawTargetDef, WireEvent } from '../../../player/clawLogic'
import type { EnemyHandle } from '../../../combat/combatSystem'
import { EnemyModel } from '../../../combat/enemyModels'
import { SHADE_STYLE, BIG_SHADE_STYLE } from '../../../chronicle/visuals/shade'
import { DEFENSE, SHRINE } from './layoutV7'
import { DEFENSE_WAVES, SHRINE_HITS, ShrineGuard, dueSpawns, guardLevel, type DefenseDir } from './shrineGuard'
import type { ChronicleNambaScene } from './sceneV7'

export type DefensePhase = 'wait' | 'wave1' | 'wave2' | 'projection' | 'big_dark' | 'big_lit' | 'won'

/** 戦闘の敵のうち、ここが使う中の値（住みか・つなぎ） */
type EnemyInner = EnemyHandle & { home: THREE.Vector3; leash: number; def: ClawTargetDef; knock: THREE.Vector3 }

/** ほこらの前の、影の住みか（3 つに分けて重ならないように） */
const HOMES = [new THREE.Vector3(14.05, 0, 23.6), new THREE.Vector3(13.85, 0, 22.45), new THREE.Vector3(13.85, 0, 24.75)]

type Climber = {
  model: EnemyModel
  def: ClawTargetDef
  path: THREE.Vector3[]
  i: number
  pos: THREE.Vector3
  /** 'climb'：屋根づたい／'perch'：ほこらの屋根にとりついた／'fall'：引きずり下ろされている */
  state: 'climb' | 'perch' | 'fall'
  hop: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number } | null
  tick: number
  t: number
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export class DefenseDirector {
  phase: DefensePhase = 'wait'
  readonly guard = new ShrineGuard()
  /** 2 波しのいだ（ステージが映し出しの場面を流す） */
  onWavesCleared: (() => void) | null = null
  /** 大きな影をたおした */
  onWon: (() => void) | null = null
  /** ほこらが壊れそう（体力 0）。ステージがやり直しの場面を流す */
  onBroken: (() => void) | null = null
  /** 体力が少なくなった（1 回だけ） */
  onLow: (() => void) | null = null
  /** 会話を 1 行だけ（ステージの rt.say など） */
  say: ((key: string) => void) | null = null
  private readonly rt: StageRuntime
  private readonly ns: ChronicleNambaScene
  private wave = -1
  private waveT = 0
  private spawned = 0
  private readonly climbers: Climber[] = []
  private readonly gnaw = new Map<number | string, number>()
  private big: EnemyInner | null = null
  private bigCorner = 0
  private bigLitT = 0
  private bigDarkHp = 0
  /** やられる前の大きな影の体力（体力 0 で戻っても満タンにしない） */
  private bigLastHp = 0
  private aimCd = 0
  private lowSaid = false
  private seq = 0
  private readonly tmp = new THREE.Vector3()

  constructor(rt: StageRuntime, ns: ChronicleNambaScene) {
    this.rt = rt
    this.ns = ns
  }

  /** 1 波目から始める（体力は満タン） */
  start(): void {
    this.guard.reset()
    this.ns.shrine.setDamage(0)
    this.lowSaid = false
    this.rt.combat.enabled = true
    this.rt.combat.setCheckpoint(v(15.4, 0, 23.0), Math.PI / 2)
    this.rt.combat.showBossBar('時の神さまのほこら', 1)
    this.startWave(0)
  }

  private startWave(i: number): void {
    this.wave = i
    this.waveT = 0
    this.spawned = 0
    this.phase = i === 0 ? 'wave1' : 'wave2'
    for (const d of ['north', 'south', 'roof'] as const) this.ns.mouths.setActive(d, 1)
  }

  /** いまの波をはじめからやり直す（ほこらが壊れそうになったとき） */
  restartWave(): void {
    this.clearSmall(false)
    this.guard.reset()
    this.ns.shrine.setDamage(0)
    this.rt.combat.setBossBar(1)
    this.lowSaid = false
    this.startWave(Math.max(0, this.wave))
  }

  // ---------------------------------------------------------------- 影を出す

  private spawnGround(dir: DefenseDir, kind: 'mite' | 'shield'): void {
    const pts = dir === 'north' ? DEFENSE.spawns.north : DEFENSE.spawns.south
    const p = pts[this.seq % pts.length].clone()
    p.x += (Math.random() - 0.5) * 0.6
    const h = this.rt.combat.spawn(kind, p, { tag: 'def', style: SHADE_STYLE, leash: 4.2, yaw: dir === 'north' ? Math.PI : 0, hidden: true }) as EnemyInner
    h.home.copy(HOMES[this.seq % HOMES.length])
    this.seq++
    this.rt.combat.appear(h)
  }

  private spawnClimber(): void {
    const k = this.seq++ % DEFENSE.roofPaths.length
    const path = DEFENSE.roofPaths[k].map((p) => p.clone())
    const model = new EnemyModel('mite', SHADE_STYLE)
    model.root.scale.setScalar(1.1)
    model.root.position.copy(path[0])
    this.ns.root.add(model.root)
    const pos = path[0].clone()
    const def: ClawTargetDef = { id: `v7_climber_${this.seq}`, type: 'enemy_pull', label: '屋根の影（引きずり下ろす）', point: pos.clone().setY(pos.y + 0.35), radius: 0.55, enabled: true, noLineOfSight: true, range: 14 }
    this.rt.claw.targets.push(def)
    this.climbers.push({ model, def, path, i: 1, pos, state: 'climb', hop: null, tick: 0, t: 0 })
  }

  private removeClimber(c: Climber): void {
    const i = this.rt.claw.targets.indexOf(c.def)
    if (i >= 0) this.rt.claw.targets.splice(i, 1)
    c.def.enabled = false
    c.model.root.removeFromParent()
    c.model.dispose()
    const k = this.climbers.indexOf(c)
    if (k >= 0) this.climbers.splice(k, 1)
  }

  /** 小さな影を全部消す（flee：光でにげる＝くずれて消える） */
  private clearSmall(flee: boolean): void {
    for (const h of this.rt.combat.alive('def')) this.rt.combat.kill(h)
    for (const c of [...this.climbers]) {
      if (flee) {
        // 屋根の影も、光にやかれてくずれる（火花）
        this.rt.shake(0.05)
      }
      this.removeClimber(c)
    }
    this.gnaw.clear()
  }

  // ---------------------------------------------------------------- 大きな影

  /** 映し出しのあと：小さな影がにげて、大きな影がトンネル路地から出てきて暗がりへかくれる */
  fleeSmall(): void {
    this.clearSmall(true)
    for (const d of ['north', 'south', 'roof'] as const) this.ns.mouths.setActive(d, 0)
    this.phase = 'projection'
    this.rt.combat.showBossBar(null)
  }

  startBig(): EnemyHandle {
    this.bigCorner = 0
    const at = DEFENSE.darkCorners[1].clone()
    const h = this.rt.combat.spawn('brute', at, { tag: 'big', style: BIG_SHADE_STYLE, hp: 12, scale: 1.65, leash: 1.6, yaw: 0, hidden: true }) as EnemyInner
    this.rt.combat.appear(h)
    this.big = h
    this.bigDarkHp = h.brain.hp
    this.goDark(0)
    this.rt.combat.showBoss(h, '大きな影')
    this.ns.mouths.setActive('south', 0.6)
    return h
  }

  get bigHandle(): EnemyHandle | null {
    return this.big
  }

  /** 暗がり i へにげる（光は全体へもどる） */
  private goDark(i: number): void {
    const h = this.big
    if (!h) return
    this.bigCorner = i
    h.home.copy(DEFENSE.darkCorners[i])
    this.phase = 'big_dark'
    this.bigDarkHp = h.brain.hp
    this.ns.projection.setAim(null)
    this.aimCd = 1.5
  }

  /** F：社長に、大きな影のいる所を照らしてもらう */
  aimAtBig(): boolean {
    const h = this.big
    if (!h || this.phase !== 'big_dark' || this.aimCd > 0) return false
    this.ns.projection.setAim(h.pos)
    this.phase = 'big_lit'
    this.bigLitT = 0
    h.brain.stun(2.6)
    this.rt.shake(0.12)
    return true
  }

  /** 大きな影が照らされているか */
  get bigLit(): boolean {
    return this.phase === 'big_lit'
  }

  // ---------------------------------------------------------------- 毎フレーム

  update(dt: number, t: number): void {
    const rt = this.rt
    // 波
    if (this.phase === 'wave1' || this.phase === 'wave2') {
      const w = DEFENSE_WAVES[this.wave]
      this.waveT += dt
      for (const i of dueSpawns(w, this.waveT, this.spawned)) {
        const s = w.spawns[i]
        for (let k = 0; k < s.count; k++) {
          if (s.dir === 'roof') this.spawnClimber()
          else this.spawnGround(s.dir, s.kind)
        }
        this.spawned = i + 1
      }
      // 箱にとびかかる（ほこらの前で手の空いた影）
      for (const h of rt.combat.alive('def')) {
        const e = h as EnemyInner
        const d = Math.hypot(e.pos.x - e.home.x, e.pos.z - e.home.z)
        const free = e.brain.state === 'idle'
        if (d < 1.4 && free) {
          const g = (this.gnaw.get(e.id) ?? 0) + dt
          if (g >= 2.4) {
            this.gnaw.set(e.id, 0)
            this.hitShrine(SHRINE_HITS.leap)
            // とびかかる見た目：前へ小さく跳ねる
            e.knock.set(SHRINE.pos.x - e.pos.x, 0, SHRINE.pos.z - e.pos.z).normalize().multiplyScalar(2.2)
          } else this.gnaw.set(e.id, g)
          // ほこらの方を向く
          e.yaw = Math.atan2(-(SHRINE.pos.x - e.pos.x), -(SHRINE.pos.z - e.pos.z))
        }
      }
      // 波が終わったか
      if (this.spawned >= w.spawns.length && rt.combat.alive('def').length === 0 && this.climbers.length === 0) {
        if (this.wave === 0) {
          this.say?.('wave2')
          this.startWave(1)
        } else {
          this.phase = 'projection'
          for (const d of ['north', 'south', 'roof'] as const) this.ns.mouths.setActive(d, 0)
          this.onWavesCleared?.()
        }
      }
    }
    // 屋根の影
    for (const c of [...this.climbers]) this.updateClimber(c, dt, t)
    // 大きな影
    const h = this.big
    if (h) {
      if (h.alive && !rt.combat.downed) this.bigLastHp = h.brain.hp
      this.aimCd = Math.max(0, this.aimCd - dt)
      if (!h.alive) {
        // 倒れた（onDefeated でも呼ばれる）
      } else if (this.phase === 'big_dark') {
        // 暗がりでは効かない：体力をもどす
        if (h.brain.hp < this.bigDarkHp) {
          h.brain.hp = this.bigDarkHp
          if (this.aimCd <= 0) {
            this.say?.('big_dark_hit')
            this.aimCd = 2.5
          }
        }
      } else if (this.phase === 'big_lit') {
        this.bigLitT += dt
        this.ns.projection.setAim(h.pos)
        const took = this.bigDarkHp - h.brain.hp
        if (took >= 4 || this.bigLitT > 9) {
          // まぶしさに慣れて、次の暗がりへにげる
          this.say?.('big_flee')
          this.goDark((this.bigCorner + 1) % DEFENSE.darkCorners.length)
        }
      }
    }
  }

  private hitShrine(n: number): void {
    const g = this.guard
    g.hit(n)
    this.ns.shrine.setDamage(g.damage)
    this.ns.shrine.setGlow(1.4)
    this.rt.combat.setBossBar(g.ratio)
    this.rt.shake(0.06)
    if (!this.lowSaid && guardLevel(g.ratio) === 'danger') {
      this.lowSaid = true
      this.onLow?.()
    }
    if (g.broken) this.onBroken?.()
  }

  private updateClimber(c: Climber, dt: number, t: number): void {
    c.t += dt
    if (c.state === 'climb') {
      const to = c.path[c.i]
      if (!c.hop) {
        const from = c.pos.clone()
        const dist = from.distanceTo(to)
        const jump = Math.abs(to.y - from.y) > 0.8
        c.hop = { from, to: to.clone(), t: 0, dur: jump ? 0.75 : Math.max(0.3, dist / 1.7) }
      }
      const hop = c.hop
      hop.t += dt
      const k = Math.min(1, hop.t / hop.dur)
      c.pos.lerpVectors(hop.from, hop.to, k)
      if (Math.abs(hop.to.y - hop.from.y) > 0.8 || hop.from.distanceTo(hop.to) > 2.5) c.pos.y += Math.sin(Math.PI * k) * 0.9
      c.model.root.rotation.y = Math.atan2(-(hop.to.x - hop.from.x), -(hop.to.z - hop.from.z))
      c.model.animate(dt, t, 'chase', c.t, 3, 0, 0.45)
      if (k >= 1) {
        c.hop = null
        c.i++
        if (c.i >= c.path.length) {
          c.state = 'perch'
          c.tick = 0
        }
      }
    } else if (c.state === 'perch') {
      // ほこらの屋根で暴れる（体力が減る）
      c.tick += dt
      c.model.animate(dt, t, c.tick % 2 < 0.4 ? 'attack' : 'windup', c.tick % 2, 0, 0, 0.45)
      if (c.tick >= 2.0) {
        c.tick = 0
        this.hitShrine(SHRINE_HITS.roofTick)
      }
    } else if (c.state === 'fall' && c.hop) {
      const hop = c.hop
      hop.t += dt
      const k = Math.min(1, hop.t / hop.dur)
      c.pos.lerpVectors(hop.from, hop.to, k)
      c.pos.y += Math.sin(Math.PI * k) * 0.6
      c.model.root.rotation.x += dt * 9
      if (k >= 1) {
        // 地面の影（戦闘の欠け虫）になる
        const at = hop.to.clone().setY(0)
        this.removeClimber(c)
        const h = this.rt.combat.spawn('mite', at, { tag: 'def', style: SHADE_STYLE, leash: 4.2, hidden: true }) as EnemyInner
        h.home.copy(HOMES[this.seq++ % HOMES.length])
        this.rt.combat.appear(h)
        h.brain.stun(1.6)
        return
      }
    }
    c.model.root.position.copy(c.pos)
    c.def.point.copy(c.pos).setY(c.pos.y + 0.35)
  }

  /** クローのお知らせ：屋根の影をつかんだら引きずり下ろす／暗がりの大きな影に飛びついた */
  onClaw(e: WireEvent): void {
    if (e.kind !== 'connected' || !('target' in e)) return
    const c = this.climbers.find((x) => x.def === e.target)
    if (c && c.state !== 'fall') {
      c.state = 'fall'
      c.def.enabled = false
      const p = this.rt.player.position
      const to = this.tmp.set(p.x - c.pos.x, 0, p.z - c.pos.z)
      const d = Math.max(0.1, to.length())
      to.multiplyScalar(Math.min(1, (d - 1.2) / d)).add(c.pos).setY(0)
      c.hop = { from: c.pos.clone(), to: to.clone(), t: 0, dur: 0.55 }
      this.rt.shake(0.1)
      return
    }
    if (this.big && e.target === this.big.def && this.phase === 'big_dark') this.say?.('big_dark_hit')
  }

  /** プレイヤーが体力 0 から戻った：大きな影の体力は、やられる前のまま（シェルは満タンにもどす） */
  onPlayerRespawn(): void {
    const h = this.big
    if (!h || !h.alive) return
    h.brain.hp = Math.min(h.brain.hp, this.bigLastHp)
    this.bigDarkHp = Math.min(this.bigDarkHp, h.brain.hp)
  }

  /** 戦闘の敵が倒れた */
  onDefeated(h: EnemyHandle): void {
    this.gnaw.delete(h.id)
    if (h === this.big) {
      this.big = null
      this.phase = 'won'
      this.ns.projection.setAim(null)
      this.onWon?.()
    }
  }

  /** 開発用：いまの段階を片づける（波を終わらせる・大きな影を倒す） */
  devSkip(): void {
    if (this.phase === 'wave1' || this.phase === 'wave2') {
      this.clearSmall(false)
      const w = DEFENSE_WAVES[this.wave]
      this.spawned = w.spawns.length
      this.waveT = 999
    } else if ((this.phase === 'big_dark' || this.phase === 'big_lit') && this.big) {
      this.phase = 'big_lit'
      this.big.brain.hp = 1
      this.rt.combat.kill(this.big)
    }
  }

  /** 戦いを全部やめる（場面の打ち切り・ステージの解放） */
  dispose(): void {
    for (const c of [...this.climbers]) this.removeClimber(c)
    this.climbers.length = 0
  }

  debug(): Record<string, unknown> {
    return { phase: this.phase, wave: this.wave, waveT: +this.waveT.toFixed(1), spawned: this.spawned, hp: this.guard.value, climbers: this.climbers.length, enemies: this.rt.combat.alive('def').length, big: this.big ? { hp: this.big.brain.hp, corner: this.bigCorner, lit: this.bigLit } : null }
  }
}
