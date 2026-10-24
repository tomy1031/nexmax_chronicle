// 9 章の夜：ほこら防衛の進行（物語 v7.2「社長との約束」）。ステージ（stage.ts）が会話・カメラの場面を受け持ち、
// ここは遊びの中身を受け持つ：影の波・屋根にのぼる影・ほこらの体力・江戸の朝の光で影がにげる・大きな影と光の輪の戦い。
// ・地面の影（北＝路地の口、南＝トンネル路地）：戦闘（rt.combat）の欠け虫を影の色で。住みか（home）をほこらの前にして、
//   ほこらへ向かわせる。ほこらの前で手が空いている影は、箱にとびかかってほこらの体力を減らす
// ・屋根の影：ここで動かす影（欠け虫の形）。物置・長屋の屋根づたいに、ほこらの屋根へ。とりつくと体力が減る。
//   J（クロー）でつかむと引きずり下ろされて、地面の影（戦闘の欠け虫）になる
// ・波をしのぐと onWavesCleared（ステージが社長の「江戸の朝」の場面を流す）→ startBig() で大きな影
// ・大きな影（オーナーの感想「光を照らして倒すボスを、もっとゲームに」）：空き地の IDO のかんばん 3 本（lightPosts.ts）。
//   かんばんのそばで K（たたく）か、J でスイッチのレバーを引くと、かんばんの前に「江戸の朝」の光の輪が広がる。
//   大きな影は、ともった光の輪には入らない（ふちへ押し出される）。追いかけてくる影が、かんばんの前に来たときに光らせると、
//   光の輪の中でつかまって、弱って動けなくなる → J で引きたおす（K もきく）。3 回で終わり。
//   暗い所では、攻撃はきかない。近いと前足の叩きつけ（戦闘の赤い扇）、遠いと「影の手」（足もとに赤い輪）。
//   社長が「こっちのかんばんや！」「今や！」と声で手伝う（いちばん近いかんばんの点線の輪が明るく・影が中だと金色にまたたく）
import * as THREE from 'three'
import type { StageRuntime } from '../../../game/stage'
import type { ClawTargetDef, WireEvent } from '../../../player/clawLogic'
import type { EnemyHandle } from '../../../combat/combatSystem'
import { EnemyModel } from '../../../combat/enemyModels'
import { SHADE_STYLE, BIG_SHADE_STYLE } from '../../../chronicle/visuals/shade'
import { DEFENSE, SHRINE } from './layoutV7'
import { DEFENSE_WAVES, SHRINE_HITS, ShrineGuard, dueSpawns, guardLevel, type DefenseDir } from './shrineGuard'
import type { ChronicleNambaScene } from './sceneV7'
import { kidEnemy, softenEnemy } from './softEnemy'
import { BIG_SHADOW, LIGHT_TUNING, bestPost, inRing, pushOutOfRing } from './lightLogic'
import { ShadowHands } from './shadowHand'

export type DefensePhase = 'wait' | 'wave1' | 'projection' | 'big' | 'caught' | 'won'

/** 戦闘の敵のうち、ここが使う中の値（住みか・つなぎ） */
type EnemyInner = EnemyHandle & { home: THREE.Vector3; leash: number; def: ClawTargetDef; knock: THREE.Vector3 }

/** ほこらの前の、影の住みか（3 つに分けて重ならないように） */
const HOMES = [new THREE.Vector3(14.05, 0, 23.6), new THREE.Vector3(13.85, 0, 22.45), new THREE.Vector3(13.85, 0, 24.75)]

/** 大きな影の住みか（トンネル路地の口。やられて戻ったときは、ここから出なおす） */
const BIG_HOME = new THREE.Vector3(19.5, 0, 26.7)

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
  /** 波をしのいだ（ステージが映し出しの場面を流す） */
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
  /** 暗い所での大きな影の体力（攻撃がきかない：へったら戻す） */
  private bigDarkHp = 0
  /** やられる前の大きな影の体力（体力 0 で戻っても満タンにしない） */
  private bigLastHp = 0
  /** つかまえている光の輪（かんばんの番号）。-1 でなし */
  private caughtBy = -1
  /** このつかまえで、もう引きたおした */
  private pulled = false
  private downT = 0
  private catches = 0
  private misses = 0
  private sayCd = 0
  private darkHitCd = 0
  private handT = 0
  private hintBest = -1
  private readonly hands: ShadowHands
  private lowSaid = false
  private shieldSaid = false
  private seq = 0
  private readonly tmp = new THREE.Vector3()
  private readonly hitIds: string[] = []
  /** 開発・ボット用の数え */
  readonly stats = { triggers: 0, catches: 0, misses: 0, pulls: 0, handHits: 0, darkHits: 0 }

  constructor(rt: StageRuntime, ns: ChronicleNambaScene) {
    this.rt = rt
    this.ns = ns
    this.hands = new ShadowHands(BIG_SHADOW.handRadius)
    ns.root.add(this.hands.group)
    // かんばんの J の的（スイッチのレバー）。社長が「江戸の朝」を送るまでは使えない
    for (const d of ns.lightPosts.clawTargets) if (!rt.claw.targets.includes(d)) rt.claw.targets.push(d)
    ns.lightPosts.setArmed(false)
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
    this.phase = 'wave1'
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
    const h = kidEnemy(this.rt.combat.spawn(kind, p, { tag: 'def', style: SHADE_STYLE, leash: 4.2, yaw: dir === 'north' ? Math.PI : 0, hidden: true }) as EnemyInner)
    h.home.copy(HOMES[this.seq % HOMES.length])
    this.seq++
    this.rt.combat.appear(h)
    // 盾の影は、正面からの K をはじく：はじめて出たとき、はがし方を教える
    if (kind === 'shield' && !this.shieldSaid) {
      this.shieldSaid = true
      this.say?.('shield_hint')
    }
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
      if (flee) this.rt.shake(0.05)
      this.removeClimber(c)
    }
    this.gnaw.clear()
  }

  // ---------------------------------------------------------------- 大きな影

  /** 映し出しのあと：小さな影がにげる */
  fleeSmall(): void {
    this.clearSmall(true)
    for (const d of ['north', 'south', 'roof'] as const) this.ns.mouths.setActive(d, 0)
    this.phase = 'projection'
    this.rt.combat.showBossBar(null)
  }

  /** 大きな影がトンネル路地から出てくる（まだ動かない。ステージの場面のあとで fight() ） */
  startBig(): EnemyHandle {
    const at = DEFENSE.spawns.south[1].clone()
    const h = kidEnemy(this.rt.combat.spawn('brute', at, { tag: 'big', style: BIG_SHADE_STYLE, hp: BIG_SHADOW.hp, keepHpOnRespawn: true, scale: 1.65, leash: 40, yaw: 0, hidden: true }) as EnemyInner)
    softenEnemy(h, { windup: 1.35, speed: 1.9, sight: 30, lose: 40 })
    h.home.copy(BIG_HOME)
    this.rt.combat.appear(h)
    // 場面のあいだは動かない（ステージが戦闘を passive にしている）
    this.big = h
    this.bigDarkHp = h.brain.hp
    this.bigLastHp = h.brain.hp
    this.setGrabbable(false)
    this.rt.combat.showBoss(h, '大きな影')
    this.ns.mouths.setActive('south', 0.6)
    return h
  }

  /** 戦いを始める（かんばんが使えるように。社長の声の場面のあと） */
  fight(): void {
    const h = this.big
    if (!h) return
    this.phase = 'big'
    this.ns.lightPosts.setArmed(true)
    this.handT = 2.5
    this.sayCd = 3
    this.ns.mouths.setActive('south', 0)
    // かんばんのスイッチの箱を K でたたける的にする（そばで K でも光る：onAttack）
    const P = this.ns.lightPosts
    for (let i = 0; i < P.count; i++) {
      const id = `v7_post_hit_${i}`
      this.hitIds.push(id)
      this.rt.combat.addHitTarget({ id, pos: P.switchAt(i), radius: 0.4, enabled: true, onHit: () => this.trigger(i) })
    }
  }

  get bigHandle(): EnemyHandle | null {
    return this.big
  }

  /** いま大きな影がつかまっているか */
  get bigCaught(): boolean {
    return this.phase === 'caught'
  }

  /** 社長が教えているかんばん（目印。-1 でなし） */
  get hintPost(): number {
    return this.phase === 'big' ? this.hintBest : -1
  }

  /** J の的にするか（光の中だけ） */
  private setGrabbable(on: boolean): void {
    const h = this.big
    if (!h) return
    h.def.enabled = on
    h.def.type = 'enemy_pull'
    h.def.label = on ? '光の中の大きな影（引きたおす）' : '大きな影'
    h.def.priority = on ? 1 : 0
  }

  /** かんばんを光らせる（K でたたいた・J でレバーを引いた・そばで K） */
  trigger(i: number): boolean {
    if (this.phase !== 'big' && this.phase !== 'caught') return false
    const ok = this.ns.lightPosts.trigger(i)
    if (ok) {
      this.stats.triggers++
      this.rt.shake(0.06)
    }
    return ok
  }

  /** K を押した（ステージから）。スイッチの箱のそばなら、向きに関係なく光らせる */
  onAttack(): void {
    if (this.phase !== 'big' && this.phase !== 'caught') return
    const P = this.ns.lightPosts
    const p = this.rt.player.position
    let best = -1
    let bd = 1.5
    for (let i = 0; i < P.count; i++) {
      const s = P.switchAt(i)
      const d = Math.hypot(s.x - p.x, s.z - p.z)
      if (d < bd && P.state(i) === 'ready') {
        bd = d
        best = i
      }
    }
    if (best >= 0) this.trigger(best)
  }

  /** 光の輪 i で、大きな影をつかまえた */
  private catchBig(i: number): void {
    const h = this.big
    if (!h) return
    this.phase = 'caught'
    this.caughtBy = i
    this.pulled = false
    this.catches++
    this.stats.catches++
    this.misses = 0
    this.bigDarkHp = h.brain.hp
    this.setGrabbable(true)
    h.brain.stun(this.ns.lightPosts.logic(i).left + 0.1)
    h.model.hit()
    this.rt.shake(0.15)
    this.say?.(this.catches === 1 ? 'big_caught_first' : 'big_caught')
    this.sayCd = 3
    this.hands.clear()
  }

  /** 光が消えた・引きたおした：また追いかけてくる */
  private release(stun: number): void {
    const h = this.big
    this.phase = 'big'
    this.caughtBy = -1
    this.setGrabbable(false)
    if (h && h.alive) {
      h.brain.stun(stun)
      this.bigDarkHp = h.brain.hp
    }
    this.handT = Math.max(this.handT, 2.5)
  }

  // ---------------------------------------------------------------- 毎フレーム

  update(dt: number, t: number): void {
    const rt = this.rt
    // 波
    if (this.phase === 'wave1') {
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
            e.knock.set(SHRINE.pos.x - e.pos.x, 0, SHRINE.pos.z - e.pos.z).normalize().multiplyScalar(2.2)
          } else this.gnaw.set(e.id, g)
          e.yaw = Math.atan2(-(SHRINE.pos.x - e.pos.x), -(SHRINE.pos.z - e.pos.z))
        }
      }
      // 波が終わったか
      if (this.spawned >= w.spawns.length && rt.combat.alive('def').length === 0 && this.climbers.length === 0) {
        if (this.wave + 1 < DEFENSE_WAVES.length) {
          this.say?.('wave2')
          this.startWave(this.wave + 1)
        } else {
          this.phase = 'projection'
          for (const d of ['north', 'south', 'roof'] as const) this.ns.mouths.setActive(d, 0)
          this.onWavesCleared?.()
        }
      }
    }
    // 屋根の影
    for (const c of [...this.climbers]) this.updateClimber(c, dt, t)
    // かんばんの光
    const posts = this.ns.lightPosts
    for (const { i, ev } of posts.update(dt, t)) this.onPostEvent(i, ev)
    for (const s of this.hands.update(dt)) this.onHandStrike(s)
    // 大きな影
    const h = this.big
    if (!h) return
    if (h.alive && !rt.combat.downed) this.bigLastHp = h.brain.hp
    this.sayCd = Math.max(0, this.sayCd - dt)
    this.darkHitCd = Math.max(0, this.darkHitCd - dt)
    if (!h.alive) return
    const P = rt.player.position
    if (this.phase === 'big') {
      // 暗い所では、攻撃がきかない（へった分を戻す）
      if (h.brain.hp < this.bigDarkHp) {
        h.brain.hp = this.bigDarkHp
        this.stats.darkHits++
        if (this.darkHitCd <= 0) {
          this.say?.('big_dark_hit')
          this.darkHitCd = 4
        }
      }
      // ともった光の輪には入らない（ふちへ押し出される）
      for (let i = 0; i < posts.count; i++) {
        if (!posts.logic(i).on) continue
        const out = pushOutOfRing(posts.center(i), h.pos, LIGHT_TUNING.radius, 0.35 + 0.4)
        if (out) {
          h.pos.x += (out.x - h.pos.x) * Math.min(1, dt * 12)
          h.pos.z += (out.z - h.pos.z) * Math.min(1, dt * 12)
        }
      }
      // 遠くにいると「影の手」（足もとに赤い輪）
      const dist = Math.hypot(P.x - h.pos.x, P.z - h.pos.z)
      this.handT -= dt
      if (this.handT <= 0 && dist > BIG_SHADOW.handMinDist && !h.brain.helpless && !rt.combat.downed && !rt.talking && !this.hands.busy && !this.inLit(P)) {
        this.hands.warn(v(P.x, 0, P.z), BIG_SHADOW.handWindup)
        this.handT = BIG_SHADOW.handEvery
        this.rt.combat.coach('赤い輪から はなれて！（Shift でよける）')
      }
      // 社長の声：いちばん近いかんばん・影がその前に来たら「今や！」
      const ready = Array.from({ length: posts.count }, (_, i) => posts.isArmed && posts.state(i) === 'ready')
      const centers = Array.from({ length: posts.count }, (_, i) => posts.center(i))
      const best = bestPost(centers, ready, h.pos)
      const now = best >= 0 && inRing(centers[best], h.pos, LIGHT_TUNING.radius, 0.1)
      posts.setHint(best, now)
      if (best >= 0 && this.sayCd <= 0 && !rt.talking && !rt.inCinematic) {
        if (now) {
          this.say?.('big_now')
          this.sayCd = BIG_SHADOW.shoutEvery
        } else if (best !== this.hintBest) {
          this.say?.('big_here')
          this.sayCd = BIG_SHADOW.shoutEvery + 2
        }
      }
      this.hintBest = best
    } else if (this.phase === 'caught') {
      posts.setHint(-1, false)
      if (this.downT > 0) {
        // 引きたおされて、起き上がる
        this.downT -= dt
        if (this.downT <= 0) this.release(0.3)
      } else {
        const L = posts.logic(this.caughtBy)
        h.brain.stun(Math.max(0.2, L.left + 0.1))
        // 光の輪の中にとどめる（まん中へ少しずつ）
        const c = posts.center(this.caughtBy)
        const d = Math.hypot(h.pos.x - c.x, h.pos.z - c.z)
        if (d > LIGHT_TUNING.radius * 0.7) {
          h.pos.x += (c.x - h.pos.x) * Math.min(1, dt * 1.5)
          h.pos.z += (c.z - h.pos.z) * Math.min(1, dt * 1.5)
        }
      }
    }
  }

  /** プレイヤーが光の輪の中にいるか（影の手は、光の中には出せない） */
  private inLit(p: THREE.Vector3): boolean {
    const posts = this.ns.lightPosts
    for (let i = 0; i < posts.count; i++) if (posts.logic(i).on && inRing(posts.center(i), p, LIGHT_TUNING.radius, 0)) return true
    return false
  }

  private onPostEvent(i: number, ev: 'lit' | 'off' | 'ready'): void {
    const h = this.big
    if (ev === 'lit') {
      if (this.phase === 'big' && h && h.alive && inRing(this.ns.lightPosts.center(i), h.pos)) this.catchBig(i)
      else if (this.phase === 'big' && h) {
        this.misses++
        this.stats.misses++
        // 2 回まちがえたら、ヒント（影がかんばんの前に来てから）
        if (this.misses >= 2 && this.sayCd <= 1.5) {
          this.say?.('big_miss')
          this.sayCd = 4
          this.misses = 0
        }
      }
    } else if (ev === 'off' && this.phase === 'caught' && i === this.caughtBy && this.downT <= 0) {
      // 光が消えた：にげる
      this.say?.('big_escape')
      this.release(0.5)
    }
  }

  private onHandStrike(at: THREE.Vector3): void {
    const P = this.rt.player.position
    this.rt.shake(0.18)
    if (Math.hypot(P.x - at.x, P.z - at.z) < BIG_SHADOW.handRadius + 0.3 && Math.abs(P.y - at.y) < 1.6) {
      this.stats.handHits++
      this.rt.combat.hurtPlayer(1, this.tmp.set(P.x - at.x, 0, P.z - at.z).normalize(), 5)
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
        const h = kidEnemy(this.rt.combat.spawn('mite', at, { tag: 'def', style: SHADE_STYLE, leash: 4.2, hidden: true }) as EnemyInner)
        h.home.copy(HOMES[this.seq++ % HOMES.length])
        this.rt.combat.appear(h)
        h.brain.stun(1.6)
        return
      }
    }
    c.model.root.position.copy(c.pos)
    c.def.point.copy(c.pos).setY(c.pos.y + 0.35)
  }

  /** クローのお知らせ：屋根の影を引きずり下ろす／かんばんのレバーを引く／光の中の大きな影を引きたおす */
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
    const post = this.ns.lightPosts.indexOfClaw(e.target)
    if (post >= 0) {
      // レバーを引いた：光らせて、ワイヤーはすぐもどす
      this.trigger(post)
      this.rt.claw.reset()
      return
    }
    const h = this.big
    if (h && e.target === h.def && this.phase === 'caught' && !this.pulled) {
      // 光の中で弱った大きな影を、引きたおす
      this.pulled = true
      this.stats.pulls++
      this.rt.shake(0.3)
      h.model.hit()
      if (h.brain.hp <= BIG_SHADOW.pullDamage) {
        h.brain.hp = 1
        this.rt.combat.kill(h)
        return
      }
      h.brain.hp -= BIG_SHADOW.pullDamage
      this.bigDarkHp = h.brain.hp
      this.downT = BIG_SHADOW.downSec
      h.brain.stun(BIG_SHADOW.downSec + 0.3)
      this.say?.('big_pulled')
      this.sayCd = 2.5
    }
  }

  /** プレイヤーが体力 0 から戻った：大きな影の体力は、やられる前のまま（シェルは満タンにもどす） */
  onPlayerRespawn(): void {
    this.hands.clear()
    const h = this.big
    if (!h || !h.alive) return
    h.brain.hp = Math.min(h.brain.hp, this.bigLastHp)
    this.bigDarkHp = Math.min(this.bigDarkHp, h.brain.hp)
    if (this.phase === 'caught') this.release(1.0)
    this.downT = 0
  }

  /** 戦闘の敵が倒れた */
  onDefeated(h: EnemyHandle): void {
    this.gnaw.delete(h.id)
    if (h === this.big) {
      this.big = null
      this.phase = 'won'
      this.hands.clear()
      this.ns.lightPosts.setHint(-1, false)
      this.ns.lightPosts.setArmed(false)
      for (const id of this.hitIds) this.rt.combat.removeHitTarget(id)
      this.hitIds.length = 0
      this.onWon?.()
    }
  }

  /** 開発用：いまの段階を片づける（波を終わらせる・大きな影を倒す） */
  devSkip(): void {
    if (this.phase === 'wave1') {
      this.clearSmall(false)
      const w = DEFENSE_WAVES[this.wave]
      this.spawned = w.spawns.length
      this.waveT = 999
      this.wave = DEFENSE_WAVES.length - 1
    } else if ((this.phase === 'big' || this.phase === 'caught') && this.big) {
      this.big.brain.hp = 1
      this.rt.combat.kill(this.big)
    }
  }

  /** 戦いを全部やめる（場面の打ち切り・ステージの解放） */
  dispose(): void {
    for (const c of [...this.climbers]) this.removeClimber(c)
    this.climbers.length = 0
    for (const id of this.hitIds) this.rt.combat.removeHitTarget(id)
    this.hitIds.length = 0
    this.hands.dispose()
    this.ns.lightPosts.setArmed(false)
  }

  debug(): Record<string, unknown> {
    const P = this.ns.lightPosts
    return {
      phase: this.phase,
      wave: this.wave,
      waveT: +this.waveT.toFixed(1),
      spawned: this.spawned,
      hp: this.guard.value,
      climbers: this.climbers.length,
      enemies: this.rt.combat.alive('def').length,
      big: this.big ? { hp: this.big.brain.hp, st: this.big.brain.state, x: +this.big.pos.x.toFixed(2), z: +this.big.pos.z.toFixed(2), caughtBy: this.caughtBy } : null,
      posts: Array.from({ length: P.count }, (_, i) => P.state(i)),
      hint: this.hintBest,
      stats: { ...this.stats },
    }
  }
}
