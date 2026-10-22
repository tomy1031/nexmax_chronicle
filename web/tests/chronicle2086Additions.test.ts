// 物語 v7 の 2086 年に足した舞台（stages/future2086/chronicle/）：配置の決まりと年代ダイヤルのロジック
import { describe, expect, it } from 'vitest'
import { cellsWithHoles, rectsOverlap } from '../src/stages/future2086/groundHoles'
import { BENCH, CHECKPOINTS, COURSE, GROUND_HOLES, KEY_STALL, SITE, TOWER, UNDER, chronicleKillY } from '../src/stages/future2086/chronicle/layoutChronicle'
import { DEBRIS_WARN, HAND_NORTH, HAND_AWAY, gearHookAngle, gearHookInWindow, gearHookPoint, handAt, onHand, onLedge } from '../src/stages/future2086/chronicle/towerCourse'
import { B_SOUTH_Z, E_SOUTH_Z, SECTION, WALL_HAND, climbPhase, sectionAt } from '../src/stages/future2086/chronicle/towerClimb'
import { YearDialLogic } from '../src/stages/future2086/chronicle/yearDialLogic'
import { F } from '../src/stages/future2086/layout'

/** プレイヤーの跳べる高さ（player/controller.ts の jump 5.6・gravity 17 → 約 0.92m） */
const JUMP_H = (5.6 * 5.6) / (2 * 17)
/** クローの射程（胸の高さから） */
const CLAW_RANGE = 10
const CHEST = 0.72

describe('地面の穴', () => {
  it('穴を除いた箱は、穴と重ならず、面積は「全体 − 穴」になる', () => {
    const bounds = { x0: -120, x1: 120, z0: -120, z1: 120 }
    const cells = cellsWithHoles(bounds, GROUND_HOLES)
    for (const c of cells) for (const h of GROUND_HOLES) expect(rectsOverlap(c, h)).toBe(false)
    const area = (r: { x0: number; x1: number; z0: number; z1: number }) => (r.x1 - r.x0) * (r.z1 - r.z0)
    const sum = cells.reduce((s, c) => s + area(c), 0)
    const holes = GROUND_HOLES.reduce((s, h) => s + area(h), 0)
    expect(sum).toBeCloseTo(area(bounds) - holes, 6)
  })
  it('穴が無ければ 1 つの箱のまま', () => {
    expect(cellsWithHoles({ x0: 0, x1: 1, z0: 0, z1: 1 }, [])).toEqual([{ x0: 0, x1: 1, z0: 0, z1: 1 }])
  })
  it('地下の階段の穴は、広場の外（北の通り）にある', () => {
    expect(rectsOverlap(UNDER.hole, F.PLAZA)).toBe(false)
    expect(UNDER.hole.x0).toBeGreaterThan(F.STREET.x0)
    expect(UNDER.hole.x1).toBeLessThan(F.STREET.x1)
  })
})

describe('時計台', () => {
  it('高さ 20m くらい（てっぺんの足場は 18〜24m）', () => {
    expect(TOWER.deckY).toBeGreaterThanOrEqual(18)
    expect(TOWER.deckY).toBeLessThanOrEqual(24)
  })
  it('塔の金具は 2 個（C → D・E → 屋上）。着地点は足場かてっぺんの上', () => {
    expect(TOWER.hooks.length).toBe(2)
    let prev = 0
    for (const h of TOWER.hooks) {
      expect(h.landing.y).toBeGreaterThan(prev)
      prev = h.landing.y
      expect(h.point.y).toBeGreaterThan(h.landing.y)
      const onL = TOWER.ledges.some((L) => Math.abs(L.y - h.landing.y) < 1e-6 && h.landing.x >= L.x0 && h.landing.x <= L.x1 && h.landing.z >= L.z0 && h.landing.z <= L.z1)
      const D = TOWER.deck
      const onDeck = Math.abs(h.landing.y - TOWER.deckY) < 1e-6 && h.landing.x > D.x0 && h.landing.x < D.x1 && h.landing.z > D.z0 && h.landing.z < D.z1
      expect(onL || onDeck).toBe(true)
    }
  })
  it('金具は通りの側（西）を向いた壁にある', () => {
    for (const h of TOWER.hooks) expect(h.point.x).toBeLessThan(TOWER.x0)
  })
  it('トワの立つ所はてっぺんの足場の上', () => {
    const p = TOWER.towa.pos
    expect(p.y).toBe(TOWER.deckY)
    expect(p.x).toBeGreaterThan(TOWER.deck.x0)
    expect(p.x).toBeLessThan(TOWER.deck.x1)
    expect(p.z).toBeGreaterThan(TOWER.deck.z0)
    expect(p.z).toBeLessThan(TOWER.deck.z1)
  })
})

describe('時計台のぼり（4 章のアクション）', () => {
  /** p（足もと）から金具 q を見上げる角（度） */
  const elev = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => (Math.atan2(q.y - (p.y + CHEST), Math.hypot(q.x - p.x, q.z - p.z)) * 180) / Math.PI
  const reach = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => Math.hypot(q.x - p.x, q.y - (p.y + CHEST), q.z - p.z)

  it('大歯車は通りから A まで、跳べる段（高さ）と、跳べるすき間で続く', () => {
    let top = 0
    let edge: { x: number; z: number; r: number } | null = null
    for (const g of COURSE.gears) {
      expect(g.c.y - top).toBeLessThanOrEqual(JUMP_H - 0.15)
      if (edge) expect(Math.hypot(g.c.x - edge.x, g.c.z - edge.z) - g.r - edge.r).toBeLessThan(1.2)
      top = g.c.y
      edge = { x: g.c.x, z: g.c.z, r: g.r }
    }
    const A = COURSE.A
    expect(A.y - top).toBeLessThanOrEqual(JUMP_H - 0.15)
    const last = COURSE.gears[COURSE.gears.length - 1]
    expect(A.z1 - (last.c.z - last.r)).toBeGreaterThan(-1.2)
  })
  it('回る歯車の金具は、待つ所から届いて、真上すぎない（72° より小さい）', () => {
    for (const s of [COURSE.hook1, COURSE.hook2]) {
      const top = gearHookPoint(s, 0)
      expect(reach(s.wait, top)).toBeLessThanOrEqual(CLAW_RANGE)
      expect(elev(s.wait, top)).toBeLessThan(72)
    }
    expect(onLedge(COURSE.hook1.landing, COURSE.B)).toBe(true)
    expect(onLedge(COURSE.hook1.wait, COURSE.A)).toBe(true)
  })
  it('金具は上に回ってきた時だけねらえる（窓）', () => {
    const s = COURSE.hook1
    expect(gearHookInWindow(gearHookAngle(0, s), s)).toBe(true)
    expect(gearHookInWindow(gearHookAngle(Math.PI / Math.abs(s.w), s), s)).toBe(false)
    // 1 回りのうち、ねらえる時間は 1 秒以上
    const period = (Math.PI * 2) / Math.abs(s.w)
    let on = 0
    for (let t = 0; t < period; t += 0.01) if (gearHookInWindow(gearHookAngle(t, s), s)) on += 0.01
    expect(on).toBeGreaterThan(1.0)
    expect(period - on).toBeLessThan(8)
  })
  it('大きな針は C の北の端が軸で、北で止まると B の南の端へとどく橋になる（2.5 秒以上止まる）', () => {
    const H = COURSE.hand
    const C = TOWER.ledges[0]
    expect(onLedge({ x: H.pivot.x, y: H.pivot.y, z: H.pivot.z }, C, 0.1, 0.4)).toBe(true)
    expect(H.dwell).toBeGreaterThanOrEqual(2.5)
    const tipN = { x: H.pivot.x + Math.cos(HAND_NORTH) * H.len, z: H.pivot.z + Math.sin(HAND_NORTH) * H.len }
    expect(tipN.z).toBeLessThan(COURSE.B.z1 + 0.05)
    expect(tipN.x).toBeGreaterThan(COURSE.B.x0)
    expect(tipN.x).toBeLessThan(COURSE.B.x1)
    // 西へ回ると、B から外れる（通りの上）
    const tipW = { x: H.pivot.x + Math.cos(HAND_AWAY) * H.len, z: H.pivot.z + Math.sin(HAND_AWAY) * H.len }
    expect(tipW.x).toBeLessThan(COURSE.B.x0 - 2)
    expect(handAt(0.5).state).toBe('bridge')
    expect(handAt(H.dwell + 0.5).state).toBe('leaving')
    expect(handAt(H.dwell + H.travel + 0.5).state).toBe('away')
    expect(handAt(H.dwell + H.travel + H.away + 0.5).state).toBe('coming')
    expect(onHand({ x: tipN.x, y: H.pivot.y, z: tipN.z + 0.3 }, HAND_NORTH)).toBe(true)
  })
  it('塔の金具：C の南の端から、E の南の端から、届いて真上すぎない', () => {
    const [h3, top] = TOWER.hooks
    const C = TOWER.ledges[0]
    const fromC = { x: 4.9, y: C.y, z: C.z1 - 0.3 }
    expect(reach(fromC, h3.point)).toBeLessThanOrEqual(CLAW_RANGE)
    expect(elev(fromC, h3.point)).toBeLessThan(72)
    const fromE = { x: 4.65, y: TOWER.clock.y0, z: E_SOUTH_Z }
    expect(reach(fromE, top.point)).toBeLessThanOrEqual(CLAW_RANGE)
    expect(elev(fromE, top.point)).toBeLessThan(72)
  })
  it('段の判定：やり直しの位置は、その段の上', () => {
    CHECKPOINTS.forEach((cp, i) => expect(sectionAt(cp.pos), cp.id).toBe(i))
    expect(sectionAt({ x: 6, y: TOWER.deckY, z: -22 })).toBe(SECTION.top)
  })
  it('段ごとに目標がある（B の南の端は針、E の南の端はてっぺん）', () => {
    expect(climbPhase(SECTION.street, { z: -21 })).toBe('tower_gears')
    expect(climbPhase(SECTION.B, { z: COURSE.B.z0 + 0.5 })).toBe('tower_wall')
    expect(climbPhase(SECTION.B, { z: B_SOUTH_Z })).toBe('tower_hand')
    expect(climbPhase(SECTION.E, { z: -24 })).toBe('tower_debris')
    expect(climbPhase(SECTION.E, { z: E_SOUTH_Z })).toBe('tower_top')
  })
  it('黒い手とがれきは、予告から当たりまで 1.2 秒以上', () => {
    expect(WALL_HAND.windup + WALL_HAND.strike).toBeGreaterThanOrEqual(1.2)
    expect(DEBRIS_WARN).toBeGreaterThanOrEqual(1.2)
  })
})

describe('地下通路', () => {
  it('部屋とかくれ場所・天井の穴は通路か部屋の中', () => {
    const inRect = (r: { x0: number; x1: number; z0: number; z1: number }, p: { x: number; z: number }) => p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1
    expect(inRect(UNDER.room, UNDER.hide.pos)).toBe(true)
    expect(inRect(UNDER.passage, UNDER.handHole)).toBe(true)
    expect(inRect(UNDER.passage, UNDER.sora.pos)).toBe(true)
    expect(UNDER.door.z0).toBeGreaterThan(UNDER.room.z0)
    expect(UNDER.door.z1).toBeLessThan(UNDER.room.z1)
  })
  it('地下にいる間だけ落下の下限を下げる（床より下）', () => {
    expect(chronicleKillY(UNDER.hide.pos)).toBeLessThan(UNDER.floorY - 1)
    expect(chronicleKillY(UNDER.stairsBottom)).toBeLessThan(UNDER.floorY - 1)
    expect(chronicleKillY({ x: 0, z: 0 })).toBe(-1.3)
    expect(chronicleKillY({ x: SITE.shrine.pos.x, z: SITE.shrine.pos.z })).toBe(-1.3)
  })
})

describe('中庭の練習（止める・裂く）', () => {
  it('裏側の足場は地面から縁側まで、跳べる高さずつ', () => {
    let y = 0
    for (const p of SITE.ura) {
      expect(p.y - y).toBeLessThanOrEqual(JUMP_H)
      y = p.y
    }
    expect(SITE.balcony.y - y).toBeLessThanOrEqual(JUMP_H)
  })
  it('縁側は裏側の足場なしでは上がれない高さ', () => {
    expect(SITE.balcony.y).toBeGreaterThan(JUMP_H + 0.5)
  })
  it('止めた歯車の一番上の歯は、縁側とからくり時計の足場のあいだの、跳べる段', () => {
    const top = SITE.gear.axle.y + SITE.gear.r
    expect(top - SITE.balcony.y).toBeLessThanOrEqual(JUMP_H)
    expect(SITE.karakuri.ledgeY - top).toBeLessThanOrEqual(JUMP_H)
    expect(SITE.balcony.x0 - (SITE.gear.axle.x + 0.36)).toBeLessThan(1.6)
    expect(SITE.gear.axle.x - 0.36 - SITE.karakuri.ledge.x1).toBeLessThan(1.6)
  })
  it('止めた歯の上から西へまっすぐ跳べば、からくり時計の足場に乗る（奥行きが重なり、すき間は 1m ほど）', () => {
    const L = SITE.karakuri.ledge
    expect(SITE.gear.axle.z).toBeGreaterThan(L.z0 + 0.2)
    expect(SITE.gear.axle.z).toBeLessThan(L.z1)
    expect(SITE.gear.axle.x - 0.36 - L.x1).toBeLessThan(1.0)
    // 回る歯の先（半径 r + 0.22）は、足場の板の下面（ledgeY − 0.16）より下を通る
    const tip = SITE.gear.r + 0.22
    const dx = SITE.gear.axle.x - L.x1
    const yAtEdge = SITE.gear.axle.y + Math.sqrt(Math.max(0, tip * tip - dx * dx))
    expect(yAtEdge).toBeLessThan(SITE.karakuri.ledgeY - 0.16)
  })
  it('ほこらは東を向き、中庭の中にある', () => {
    expect(Math.sin(SITE.shrine.yaw)).toBeCloseTo(1, 6)
    const p = SITE.shrine.pos
    expect(p.x).toBeGreaterThan(SITE.yard.x0)
    expect(p.x).toBeLessThan(SITE.yard.x1)
    expect(p.z).toBeGreaterThan(SITE.yard.z0)
    expect(p.z).toBeLessThan(SITE.yard.z1)
  })
})

describe('広場の小物', () => {
  it('ベンチと屋台は広場の中', () => {
    for (const p of [BENCH.pos, KEY_STALL.buy]) {
      expect(p.x).toBeGreaterThan(F.PLAZA.x0)
      expect(p.x).toBeLessThan(F.PLAZA.x1)
      expect(p.z).toBeGreaterThan(F.PLAZA.z0)
      expect(p.z).toBeLessThan(F.PLAZA.z1)
    }
  })
})

describe('年代ダイヤル', () => {
  it('1 年ずつ回せて、目当ての年でぴったりそろう', () => {
    const d = new YearDialLogic({ start: 2028, target: 2026 })
    expect(d.locked).toBe(false)
    d.step(-1)
    d.step(-1)
    expect(d.year).toBe(2026)
    expect(d.locked).toBe(true)
    expect(d.match).toBe(1)
    expect(d.detune).toBe(0)
  })
  it('ずれるほど、そろい具合が下がる', () => {
    const d = new YearDialLogic({ start: 2026, target: 2026 })
    const m0 = d.match
    d.step(1)
    const m1 = d.match
    for (let i = 0; i < 9; i++) d.step(1)
    const m10 = d.match
    expect(m0).toBeGreaterThan(m1)
    expect(m1).toBeGreaterThan(m10)
    expect(m10).toBeLessThan(0.1)
  })
  it('押し続けると速くなり、2086 年から 1186 年まで 15 秒以内に届く。目当ての近くでは速くならない', () => {
    const d = new YearDialLogic({ start: 2086, target: 1186 })
    let t = 0
    while (d.year > 1186 + 30 && t < 30) {
      d.hold(-1, 1 / 30)
      t += 1 / 30
    }
    expect(t).toBeLessThan(15)
    const y0 = d.year
    for (let i = 0; i < 30; i++) d.hold(-1, 1 / 30)
    expect(y0 - d.year).toBeLessThanOrEqual(9)
    d.hold(0, 1 / 30)
  })
  it('範囲の外へは回らない', () => {
    const d = new YearDialLogic({ start: 2086, target: 2026 })
    d.step(1)
    expect(d.year).toBe(2086)
  })
})
