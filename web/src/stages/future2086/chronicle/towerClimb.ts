// 4 章：時計台のぼり（アクション）の進み。形と動き（大歯車・大きな針・回る歯車の金具・がれき）は towerCourse.ts、
// 配置は layoutChronicle.ts の COURSE・CHECKPOINTS。ここは「いまどの段にいるか」「目標と目印」「黒い手・がれき」「落ちたらやり直し」。
// ・段（CHECKPOINTS の番号）：通り → A（大歯車の先）→ B（渡り廊下）→ C（針の先のバルコニー）→ D（細い足場）→ E（時計の下の回廊）→ 屋上
// ・B：壁から黒い手が出て、いま立っている所へふりおろす（赤い輪の予告 1.5 秒）。体に当たると吹っ飛ぶ（手すりがあるので落ちない）
// ・E：赤い輪にがれきが落ちる（予告 1.45 秒）。南へ歩きつづければ当たらない
// ・回る歯車の金具：上に回ってきて金色に光っている間だけねらえる
// ・落ちたら、着いたことのあるいちばん上の段へ（やり直しの回数を数える）
// 段の判定と目標の選び方は純粋な関数（tests/chronicle2086Additions.test.ts）。
import * as THREE from 'three'
import type { StageRuntime } from '../../../game/stage'
import type { ObjectiveMark } from '../../../game/stage'
import type { BlackHands } from '../../../chronicle/visuals'
import type { ClawTargetDef } from '../../../player/clawLogic'
import { CHECKPOINTS, COURSE, TOWER } from './layoutChronicle'
import { DEBRIS_WARN, onLedge, type TowerCourseParts } from './towerCourse'
import type { ClockTowerParts } from './clockTower'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 段の番号（CHECKPOINTS の順）。6 = 屋上 */
export const SECTION = { street: 0, A: 1, B: 2, C: 3, D: 4, E: 5, top: 6 } as const

/** 足もと p が立っている段（CHECKPOINTS の area の上。どこでもなければ -1）。上の段から調べる */
export function sectionAt(p: { x: number; y: number; z: number }): number {
  if (p.y > TOWER.deckY - 0.5) return SECTION.top
  for (let i = CHECKPOINTS.length - 1; i >= 0; i--) if (onLedge(p, CHECKPOINTS[i].area, i === 0 ? 0.5 : 0.4, 0.1)) return i
  return -1
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
      return 'tower_hook'
    case SECTION.D:
      return 'tower_gearhook2'
    case SECTION.E:
      return p.z > E_SOUTH_Z - 0.5 ? 'tower_top' : 'tower_debris'
    case SECTION.top:
      return 'tower_ring'
    default:
      return 'tower_gears'
  }
}

/** B の黒い手：休む秒・ふりおろしの予告（windup）の秒 */
export const WALL_HAND = { rest: 1.1, windup: 1.5, strike: 0.22, stuck: 0.45, recover: 0.55, hitR: 1.0 } as const
/** E のがれき：落とす間かく（秒）・当たる半径 */
export const DEBRIS = { every: 2.0, hitR: 0.8 } as const

export type TowerClimbHost = {
  /** 当たった（from：当てた物の位置。ステージが hurtPlayer で吹っ飛ばす） */
  hit(rt: StageRuntime, from: THREE.Vector3): void
}

export class TowerClimb {
  /** 着いたことのあるいちばん上の段 */
  best = 0
  /** いま立っている段（空中は前のまま） */
  section = 0
  phase = 'tower_gears'
  marks: ObjectiveMark[] = []
  /** 落ちてやり直した回数・黒い手とがれきに当たった回数 */
  falls = 0
  hits = 0
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
    this.marks = this.marksFor(sec)
    // 立ち止まったら、ネクマックスが次の金具のほうを向く（クローは向いている方へのびるので、向き直さなくてよいように）
    const aim = this.aimFor(sec)
    if (aim && grounded && rt.player.speed < 0.3) rt.player.turnToward(aim.x - p.x, aim.z - p.z, dt, 5)
    // 段が変わったら、次にねらう物の方を見上げる（方向キーで取り消せる）
    if (grounded && sec !== this.shown) {
      this.shown = sec
      const at = this.lookFor(sec)
      if (at) rt.camRig.turnTo(Math.atan2(p.x - at.x, p.z - at.z), at.y - p.y > 2.5 ? -0.5 : -0.1)
    }
  }

  private updateHooks(rt: StageRuntime, sec: number): void {
    const wireT = rt.claw.wire.target
    const [g1, g2] = this.course.gearHooks
    g1.def.enabled = sec === SECTION.A && (g1.inWindow || wireT === g1.def)
    g2.def.enabled = sec === SECTION.D && (g2.inWindow || wireT === g2.def)
    const [h3, top] = this.towerHooks
    if (!rt.claw.wire.isConnected()) {
      h3.enabled = sec === SECTION.C
      top.enabled = sec === SECTION.E
      this.tower.setNextHook(sec === SECTION.C ? 0 : sec === SECTION.E ? 1 : null)
    }
  }

  private marksFor(sec: number): ObjectiveMark[] {
    const C = COURSE
    switch (sec) {
      case SECTION.A: {
        const g = this.course.gearHooks[0]
        return [{ pos: g.def.point.clone().add(v(0, 0.45, 0)), label: g.inWindow ? '今だ！ J' : '回る金具' }]
      }
      case SECTION.B:
        return [{ pos: v(5.4, C.B.y + 1.4, C.B.z1 - 0.4), label: '針にのる所' }]
      case SECTION.C:
        return [{ pos: this.towerHooks[0].point.clone().add(v(0, 0.45, 0)), label: '金具' }]
      case SECTION.D: {
        const g = this.course.gearHooks[1]
        return [{ pos: g.def.point.clone().add(v(0, 0.45, 0)), label: g.inWindow ? '今だ！ J' : '回る金具' }]
      }
      case SECTION.E:
        return [{ pos: this.towerHooks[1].point.clone().add(v(0, 0.45, 0)), label: 'てっぺん' }]
      case SECTION.top:
        return []
      default:
        return [{ pos: v((C.A.x0 + C.A.x1) / 2, C.A.y + 1.2, (C.A.z0 + C.A.z1) / 2), label: '足場' }]
    }
  }

  /** その段でねらう金具（立ち止まったら、そちらを向く） */
  private aimFor(sec: number): THREE.Vector3 | null {
    switch (sec) {
      case SECTION.A:
        return this.course.gearHooks[0].spec.c
      case SECTION.C:
        return this.towerHooks[0].point
      case SECTION.D:
        return this.course.gearHooks[1].spec.c
      case SECTION.E:
        return this.towerHooks[1].point
      default:
        return null
    }
  }

  private lookFor(sec: number): THREE.Vector3 | null {
    switch (sec) {
      case SECTION.street:
        return COURSE.gears[1].c.clone()
      case SECTION.A:
        return this.course.gearHooks[0].spec.c.clone().add(v(0, COURSE.hook1.r, 0))
      case SECTION.B:
        return v(5.4, COURSE.B.y, COURSE.B.z1 + 1)
      case SECTION.C:
        return this.towerHooks[0].point.clone()
      case SECTION.D:
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
      // 渡り廊下の東の建物の壁から、斜め下へ出てくる
      this.hands.spawn(id, v(6.5, B.y + 4.2, (B.z0 + B.z1) / 2), { from: 'sky', size: 0.7, normal: v(-0.6, -0.8, 0), rest: v(5.9, B.y + 2.6, (B.z0 + B.z1) / 2), noDecal: true })
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
    this.hands.slam(id, this.wallAt, { windup: WALL_HAND.windup, strike: WALL_HAND.strike, stuck: WALL_HAND.stuck, recover: WALL_HAND.recover })
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
    if (msg) rt.hud.toast(msg, 2.4)
  }

  /** 屋上へ（devSkip） */
  skip(rt: StageRuntime): void {
    rt.claw.reset()
    rt.player.teleport(TOWER.hooks[TOWER.hooks.length - 1].landing.clone(), Math.PI)
    this.done = true
  }

  /** のぼり終わり：金具をもとにもどし、手・がれきを片づける */
  end(): void {
    this.towerHooks.forEach((h, i) => {
      h.enabled = true
      h.facing = this.saved[i].facing
      h.noLineOfSight = this.saved[i].los
    })
    for (const g of this.course.gearHooks) g.def.enabled = false
    this.tower.setNextHook(null)
    this.course.clearDebris()
    if (this.hands.has('tower_wall')) this.hands.remove('tower_wall')
  }
}
