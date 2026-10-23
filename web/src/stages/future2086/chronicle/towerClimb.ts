// 4 章：時計台のぼり（アクション）の進み。形と動き（大歯車・大きな針・回る歯車の金具・がれき・光る輪）は towerCourse.ts・towerSwings.ts、
// 配置は layoutChronicle.ts の COURSE・CHECKPOINTS。ここは「いまどの段にいるか」「目標と目印」「黒い手・がれき」「落ちたらやり直し」。
// ・段（CHECKPOINTS の番号）：通り → A（大歯車の先）→ B（渡り廊下）→ C（針の先のバルコニー）→ W1・W2（通りの向こうの西のビル）→
//   N1（東のビル）→ E（時計の下の回廊）→ 屋上。通りの上を、ぶら下がりの光る輪で 3 回わたる（C → W1 → W2 → N1）
// ・B：壁から黒い手が出て、いま立っている所へふりおろす（当たる広さの赤い輪が、たたく瞬間に向かって満ちる）。体に当たると吹っ飛ぶ
// ・E：赤い輪にがれきが落ちる（予告 1.45 秒）。南へ歩きつづければ当たらない
// ・回る歯車の金具：上に回ってきて金色に光っている間だけねらえる
// ・光る輪：いまわたる輪だけ金色に光って、道すじが出る。ぶら下がったら、カメラをわたる向きへ（W でこげるように）。
//   向こうへ進みながら手をはなしたら、足場にとどくように少しだけ助ける（子どもの物差し。swingAssist）
// ・落ちたら、着いたことのあるいちばん上の段へ（やり直しの回数を数える）
// 段の判定と目標の選び方・助けの計算は純粋な関数（tests/chronicle2086Additions.test.ts）。
import * as THREE from 'three'
import type { StageRuntime } from '../../../game/stage'
import type { ObjectiveMark } from '../../../game/stage'
import type { BlackHands } from '../../../chronicle/visuals'
import type { ClawTargetDef, WireEvent } from '../../../player/clawLogic'
import { CHECKPOINTS, COURSE, TOWER, type Ledge } from './layoutChronicle'
import { DEBRIS_WARN, onLedge, type TowerCourseParts } from './towerCourse'
import type { ClockTowerParts } from './clockTower'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 段の番号（CHECKPOINTS の順）。8 = 屋上 */
export const SECTION = { street: 0, A: 1, B: 2, C: 3, W1: 4, W2: 5, N1: 6, E: 7, top: 8 } as const

/** 足もと p が立っている段（CHECKPOINTS の area の上。どこでもなければ -1）。上の段から調べる */
export function sectionAt(p: { x: number; y: number; z: number }): number {
  if (p.y > TOWER.deckY - 0.5) return SECTION.top
  for (let i = CHECKPOINTS.length - 1; i >= 0; i--) if (onLedge(p, CHECKPOINTS[i].area, i === 0 ? 0.5 : 0.4, 0.1)) return i
  return -1
}

/** その段から飛びつく光る輪の番号（COURSE.swings。無ければ -1） */
export function swingOf(section: number): number {
  return section === SECTION.C ? 0 : section === SECTION.W1 ? 1 : section === SECTION.W2 ? 2 : -1
}

/** 光る輪でわたった先の足場 */
export function swingTarget(index: number): Ledge {
  return [COURSE.W1, COURSE.W2, COURSE.N1][index]
}

/** B（渡り廊下）の南の端：針を待つ所 */
export const B_SOUTH_Z = COURSE.B.z1 - 0.9
/** E（時計の下の回廊）の南の端：てっぺんの金具をねらう所（金具が真上すぎないように、南へはなれる） */
export const E_SOUTH_Z = -19.3

/** 段と位置から、目標（story2086 の OBJECTIVES のキー） */
export function climbPhase(section: number, p: { z: number }): string {
  switch (section) {
    case SECTION.A:
      return 'tower_gearhook'
    case SECTION.B:
      return p.z > B_SOUTH_Z - 0.4 ? 'tower_hand' : 'tower_wall'
    case SECTION.C:
      return 'tower_swing1'
    case SECTION.W1:
      return 'tower_swing2'
    case SECTION.W2:
      return 'tower_swing3'
    case SECTION.N1:
      return 'tower_gearhook2'
    case SECTION.E:
      return p.z > E_SOUTH_Z - 0.5 ? 'tower_top' : 'tower_debris'
    case SECTION.top:
      return 'tower_ring'
    default:
      return 'tower_gears'
  }
}

/** B の黒い手：休む秒・ふりおろしの予告（windup）の秒・当たる半径（赤い輪の大きさ）。はじめの案内のときは windup を slow に */
export const WALL_HAND = { rest: 1.1, windup: 1.5, slow: 2.2, strike: 0.22, stuck: 0.45, recover: 0.55, hitR: 1.05 } as const
/** E のがれき：落とす間かく（秒）・当たる半径 */
export const DEBRIS = { every: 2.0, hitR: 0.8 } as const

/** 光る輪から手をはなしたときの助け：ここまでなら、足場にとどくように速さを直す（横の速さの上限・上へ足す速さの上限） */
export const SWING_ASSIST = { maxSpeed: 9.5, maxLift: 4.5, minForward: 0.6, gravity: 17 } as const

/**
 * 光る輪から手をはなした瞬間（p：足もと、vel：はなしたときの速さ）に、向こうの足場 L にとどく速さ。
 * 向こうへ進んでいない・遠すぎるときは null（助けない）。ねらう所は、足場の手前のふちから 4 割のおくゆき・横は今の位置のまま（足場の中へ）
 */
export function swingAssist(p: THREE.Vector3, vel: THREE.Vector3, dir: THREE.Vector3, L: Ledge, out = new THREE.Vector3()): THREE.Vector3 | null {
  const A = SWING_ASSIST
  const fwd = vel.x * dir.x + vel.z * dir.z
  if (fwd < A.minForward) return null
  // ねらう所
  const tx = Math.abs(dir.x) > 0.5 ? (dir.x > 0 ? L.x0 + (L.x1 - L.x0) * 0.4 : L.x1 - (L.x1 - L.x0) * 0.4) : THREE.MathUtils.clamp(p.x, L.x0 + 0.5, L.x1 - 0.5)
  const tz = Math.abs(dir.z) > 0.5 ? (dir.z > 0 ? L.z0 + (L.z1 - L.z0) * 0.4 : L.z1 - (L.z1 - L.z0) * 0.4) : THREE.MathUtils.clamp(p.z, L.z0 + 0.5, L.z1 - 0.5)
  // 足場より 0.6m 上まで上がれるように（足りなければ、上へ少し足す）
  let vy = vel.y
  const need = L.y + 0.6 - p.y
  if (need > 0) {
    const vyMin = Math.sqrt(2 * A.gravity * need)
    if (vy < vyMin) {
      if (vyMin - vy > A.maxLift) return null
      vy = vyMin
    }
  }
  // 足場の高さまで落ちてくるまでの秒
  const h = p.y - (L.y + 0.05)
  const disc = vy * vy + 2 * A.gravity * h
  if (disc < 0) return null
  const t = (vy + Math.sqrt(disc)) / A.gravity
  if (t < 0.12) return null
  const vx = (tx - p.x) / t
  const vz = (tz - p.z) / t
  if (Math.hypot(vx, vz) > A.maxSpeed) return null
  // 向こうへ進む向きのまま（もどる向きにはしない）
  if (vx * dir.x + vz * dir.z < 0) return null
  return out.set(vx, vy, vz)
}

export type TowerClimbHost = {
  /** 当たった（from：当てた物の位置。ステージが hurtPlayer で吹っ飛ばす） */
  hit(rt: StageRuntime, from: THREE.Vector3): void
  /** ふりおろしの予告の赤い輪（当たる半径・満ちる秒）を出す */
  warn(id: string, at: THREE.Vector3, radius: number, windup: number): void
}

export class TowerClimb {
  /** 着いたことのあるいちばん上の段 */
  best = 0
  /** いま立っている段（空中は前のまま） */
  section = 0
  phase = 'tower_gears'
  marks: ObjectiveMark[] = []
  /** 落ちてやり直した回数・黒い手とがれきに当たった回数・光る輪から手をはなしたときに助けた回数 */
  falls = 0
  hits = 0
  assists = 0
  done = false
  private readonly course: TowerCourseParts
  private readonly tower: ClockTowerParts
  private readonly hands: BlackHands
  private readonly host: TowerClimbHost
  private wallT = 0
  private wallAt = new THREE.Vector3()
  private wallStruck = true
  private debrisT = 0
  private shown = -1
  /** いまぶら下がっている光る輪（COURSE.swings の番号。-1 = ぶら下がっていない） */
  private hanging = -1
  private readonly towerHooks: ClawTargetDef[]
  private readonly saved: Array<{ facing: ClawTargetDef['facing']; los: boolean | undefined }>

  constructor(course: TowerCourseParts, tower: ClockTowerParts, hands: BlackHands, host: TowerClimbHost) {
    this.course = course
    this.tower = tower
    this.hands = hands
    this.host = host
    this.towerHooks = tower.hooks
    // 塔の金具は足場の上の板ごしに見上げるので、のぼる間は板にかくれても狙える。向きの条件もはずす
    this.saved = this.towerHooks.map((h) => ({ facing: h.facing, los: h.noLineOfSight }))
    for (const h of this.towerHooks) {
      h.noLineOfSight = true
      h.facing = undefined
      h.enabled = false
    }
    for (const g of course.gearHooks) g.def.enabled = false
    for (const r of course.swings.rings) r.def.enabled = false
  }

  /** プレイ中の毎フレーム（会話・演出の間は呼ばない） */
  update(dt: number, rt: StageRuntime): void {
    const p = rt.player.position
    const wired = rt.claw.wire.isConnected() || rt.claw.wire.phase === 'firing'
    const grounded = rt.player.grounded && !wired && !rt.player.isExternal
    if (grounded) {
      const s = sectionAt(p)
      if (s >= 0) {
        this.section = s
        if (s > this.best) this.best = s
      }
      // 落ちた：着いた段より下で着地した → その段の頭へ
      const cp = CHECKPOINTS[Math.min(this.best, CHECKPOINTS.length - 1)]
      if (this.best > 0 && p.y < cp.area.y - 1.2) this.respawn(rt, 'おっと！ さっきの足場から、もう一度')
    }
    if (rt.claw.wire.phase !== 'swinging') this.hanging = -1
    if (p.y > TOWER.deckY - 0.5) {
      this.done = true
      this.section = SECTION.top
    }
    const sec = this.section
    this.phase = climbPhase(sec, p)
    this.updateHooks(rt, sec)
    const B = COURSE.B
    const onB = sec === SECTION.B && p.x > B.x0 - 0.3 && p.x < B.x1 + 0.3 && p.z > B.z0 - 0.3 && p.z < B.z1 + 0.2 && Math.abs(p.y - B.y) < 2
    this.updateWallHand(dt, rt, onB)
    this.updateDebris(dt, rt, sec === SECTION.E)
    this.marks = this.marksFor(sec, rt.touch)
    // 立ち止まったら、ネクマックスが次の金具・輪のほうを向く（クローは向いている方へのびるので、向き直さなくてよいように）
    const aim = this.aimFor(sec)
    if (aim && grounded && rt.player.speed < 0.3) rt.player.turnToward(aim.x - p.x, aim.z - p.z, dt, 5)
    // 段が変わったら、次にねらう物の方を見上げる（方向キーで取り消せる）
    if (grounded && sec !== this.shown) {
      this.shown = sec
      const at = this.lookFor(sec)
      if (at) rt.camRig.turnTo(Math.atan2(p.x - at.x, p.z - at.z), at.y - p.y > 2.5 ? -0.5 : -0.1)
    }
  }

  /** クローの出来事（ステージの onClawEvent から）：光る輪にぶら下がった・手をはなした */
  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    if (e.kind !== 'connected' && e.kind !== 'detached') return
    const i = this.course.swings.rings.findIndex((r) => r.def === e.target)
    if (i < 0) return
    const s = this.course.swings.rings[i].spec
    if (e.kind === 'connected') {
      this.hanging = i
      // カメラを、わたる向きのうしろへ（W で前へこげるように）
      rt.camRig.turnTo(Math.atan2(-s.dir.x, -s.dir.z), 0.15)
      return
    }
    // 手をはなした：向こうへ進んでいれば、足場にとどくように
    this.hanging = -1
    const vel = swingAssist(rt.player.position, rt.player.velocity, s.dir, swingTarget(i))
    if (vel) {
      rt.player.velocity.copy(vel)
      this.assists++
    }
  }

  private updateHooks(rt: StageRuntime, sec: number): void {
    const wireT = rt.claw.wire.target
    const [g1, g2] = this.course.gearHooks
    g1.def.enabled = sec === SECTION.A && (g1.inWindow || wireT === g1.def)
    g2.def.enabled = sec === SECTION.N1 && (g2.inWindow || wireT === g2.def)
    // 光る輪：その段で飛びつく輪だけ（ぶら下がっている間は、その輪のまま）
    const want = this.hanging >= 0 ? this.hanging : swingOf(sec)
    this.course.swings.rings.forEach((r, i) => (r.def.enabled = i === want || wireT === r.def))
    this.course.swings.setActive(want >= 0 ? want : null)
    const [top] = this.towerHooks
    if (!rt.claw.wire.isConnected()) {
      top.enabled = sec === SECTION.E
      this.tower.setNextHook(sec === SECTION.E ? 0 : null)
    }
  }

  /** 目印（touch：スマホの言い方。J →「つかむ」、Space →「ジャンプ」） */
  private marksFor(sec: number, touch: boolean): ObjectiveMark[] {
    const C = COURSE
    const J = touch ? '「つかむ」' : 'J'
    // ぶら下がっている間は、飛びうつる先の足場
    if (this.hanging >= 0) {
      const L = swingTarget(this.hanging)
      return [{ pos: v((L.x0 + L.x1) / 2, L.y + 1.4, (L.z0 + L.z1) / 2), label: touch ? 'ここで「ジャンプ」！' : 'ここで Space！' }]
    }
    const ring = swingOf(sec)
    if (ring >= 0) return [{ pos: C.swings[ring].anchor.clone().add(v(0, 0.85, 0)), label: `光る輪に ${J}` }]
    switch (sec) {
      case SECTION.A: {
        const g = this.course.gearHooks[0]
        return [{ pos: g.def.point.clone().add(v(0, 0.45, 0)), label: g.inWindow ? `今だ！ ${J}` : '回る金具' }]
      }
      case SECTION.B:
        return [{ pos: v(5.4, C.B.y + 1.4, C.B.z1 - 0.4), label: '針にのる所' }]
      case SECTION.N1: {
        const g = this.course.gearHooks[1]
        return [{ pos: g.def.point.clone().add(v(0, 0.45, 0)), label: g.inWindow ? `今だ！ ${J}` : '回る金具' }]
      }
      case SECTION.E:
        return [{ pos: this.towerHooks[0].point.clone().add(v(0, 0.45, 0)), label: 'てっぺん' }]
      case SECTION.top:
        return []
      default:
        return [{ pos: v((C.A.x0 + C.A.x1) / 2, C.A.y + 1.2, (C.A.z0 + C.A.z1) / 2), label: '足場' }]
    }
  }

  /** その段でねらう物（立ち止まったら、そちらを向く） */
  private aimFor(sec: number): THREE.Vector3 | null {
    const ring = swingOf(sec)
    if (ring >= 0) return COURSE.swings[ring].anchor
    switch (sec) {
      case SECTION.A:
        return this.course.gearHooks[0].spec.c
      case SECTION.N1:
        return this.course.gearHooks[1].spec.c
      case SECTION.E:
        return this.towerHooks[0].point
      default:
        return null
    }
  }

  private lookFor(sec: number): THREE.Vector3 | null {
    const ring = swingOf(sec)
    if (ring >= 0) return COURSE.swings[ring].anchor.clone()
    switch (sec) {
      case SECTION.street:
        return COURSE.gears[1].c.clone()
      case SECTION.A:
        return this.course.gearHooks[0].spec.c.clone().add(v(0, COURSE.hook1.r, 0))
      case SECTION.B:
        return v(5.4, COURSE.B.y, COURSE.B.z1 + 1)
      case SECTION.N1:
        return this.course.gearHooks[1].spec.c.clone().add(v(0, COURSE.hook2.r, 0))
      case SECTION.E:
        return v(4.65, TOWER.clock.y0, E_SOUTH_Z + 1.5)
      default:
        return null
    }
  }

  /** B：壁から黒い手が出て、いま立っている所へふりおろす */
  private updateWallHand(dt: number, rt: StageRuntime, on: boolean): void {
    const id = 'tower_wall'
    if (!on) {
      if (this.hands.has(id) && this.hands.state(id) !== 'slam') this.hands.retract(id)
      this.wallT = 0
      return
    }
    const B = COURSE.B
    if (!this.hands.has(id) || this.hands.state(id) === 'gone') {
      // 渡り廊下の東の建物の壁から、斜め下へ出てくる（上の N1 の足場の下から）
      this.hands.spawn(id, v(6.5, B.y + 3.0, (B.z0 + B.z1) / 2), { from: 'sky', size: 0.7, normal: v(-0.6, -0.8, 0), rest: v(5.9, B.y + 2.1, (B.z0 + B.z1) / 2), noDecal: true })
      this.wallT = -0.6
      this.wallStruck = true
    }
    const ph = this.hands.slamPhase(id)
    if (ph) {
      // 地面に着いた瞬間（stuck の始め）に当たり判定：輪の中にいたら、手が体に当たる
      if (!this.wallStruck && (ph.phase === 'stuck' || ph.phase === 'recover')) {
        this.wallStruck = true
        const p = rt.player.position
        if (Math.hypot(p.x - this.wallAt.x, p.z - this.wallAt.z) < WALL_HAND.hitR && Math.abs(p.y - this.wallAt.y) < 1.3) {
          this.hits++
          this.host.hit(rt, this.wallAt.clone().setX(this.wallAt.x + 0.6))
          // 当たったら、少し長く休む（続けて当たらないように）
          this.wallT = -1.4
        }
      }
      if (ph.phase !== 'done') return
    }
    this.wallT += dt
    if (this.wallT < WALL_HAND.rest) return
    this.wallT = 0
    // いま立っている所（廊下のまん中の線）へ
    const p = rt.player.position
    this.wallAt.set(THREE.MathUtils.clamp(p.x, B.x0 + 0.5, B.x1 - 0.4), B.y, THREE.MathUtils.clamp(p.z, B.z0 + 0.4, B.z1 - 0.4))
    this.wallStruck = false
    // はじめの 2 回（ほかの敵の分とあわせて）は「赤い輪の外へ」の案内と、ゆっくりのふりおろし
    const windup = rt.combat.coach('赤い輪の外へ はなれて！（Shift でダッシュ）') ? WALL_HAND.slow : WALL_HAND.windup
    this.hands.slam(id, this.wallAt, { windup, strike: WALL_HAND.strike, stuck: WALL_HAND.stuck, recover: WALL_HAND.recover })
    this.host.warn(id, this.wallAt, WALL_HAND.hitR, windup)
  }

  /** E：赤い輪にがれきが落ちる（いま立っている所へ） */
  private updateDebris(dt: number, rt: StageRuntime, on: boolean): void {
    if (!on) {
      this.debrisT = 0
      return
    }
    this.debrisT += dt
    if (this.debrisT < DEBRIS.every) return
    this.debrisT = 0
    const D = COURSE.debris
    const p = rt.player.position
    // 南の端（金具をねらう所）では落とさない：ねらう間はゆっくりさせる
    if (p.z > E_SOUTH_Z - 0.2) return
    const at = v(THREE.MathUtils.clamp(p.x, D.x0 + 0.1, D.x1 - 0.1), D.y, THREE.MathUtils.clamp(p.z, D.z0 + 0.3, D.z1 - 0.3))
    this.course.dropDebris(
      at,
      (a) => {
        const q = rt.player.position
        rt.shake(0.25)
        if (Math.hypot(q.x - a.x, q.z - a.z) < DEBRIS.hitR && Math.abs(q.y - a.y) < 1.5) {
          this.hits++
          this.host.hit(rt, a.clone().setX(a.x + 0.4))
        }
      },
      DEBRIS_WARN,
    )
  }

  /** 着いたことのあるいちばん上の段の頭へもどす */
  respawn(rt: StageRuntime, msg: string | null): void {
    const cp = CHECKPOINTS[Math.min(this.best, CHECKPOINTS.length - 1)]
    rt.claw.reset()
    rt.player.teleport(cp.pos.clone(), rt.player.facing)
    this.falls++
    this.shown = -1
    this.hanging = -1
    // 光る輪の段で 2 回落ちたら、こつを教える
    if (swingOf(this.best) >= 0 && this.falls % 2 === 0) rt.hud.toast('輪にぶら下がったら WASD でこいで、光る足場の上で Space！', 4)
    else if (msg) rt.hud.toast(msg, 2.4)
  }

  /** 屋上へ（devSkip） */
  skip(rt: StageRuntime): void {
    rt.claw.reset()
    rt.player.teleport(TOWER.hooks[TOWER.hooks.length - 1].landing.clone(), Math.PI)
    this.done = true
  }

  /** のぼり終わり：金具をもとにもどし、手・がれき・輪を片づける */
  end(): void {
    this.towerHooks.forEach((h, i) => {
      h.enabled = true
      h.facing = this.saved[i].facing
      h.noLineOfSight = this.saved[i].los
    })
    for (const g of this.course.gearHooks) g.def.enabled = false
    for (const r of this.course.swings.rings) r.def.enabled = false
    this.course.swings.setActive(null)
    this.tower.setNextHook(null)
    this.course.clearDebris()
    if (this.hands.has('tower_wall')) this.hands.remove('tower_wall')
  }
}
