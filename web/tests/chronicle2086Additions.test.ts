// 物語 v7 の 2086 年に足した舞台（stages/future2086/chronicle/）：配置の決まりと年代ダイヤルのロジック
import { describe, expect, it } from 'vitest'
import { cellsWithHoles, rectsOverlap } from '../src/stages/future2086/groundHoles'
import { BENCH, CHECKPOINTS, COURSE, GROUND_HOLES, KEY_STALL, SITE, TOWER, UNDER, chronicleKillY } from '../src/stages/future2086/chronicle/layoutChronicle'
import { DEBRIS_WARN, HAND_NORTH, HAND_AWAY, gearHookAngle, gearHookInWindow, gearHookPoint, handAt, onHand, onLedge } from '../src/stages/future2086/chronicle/towerCourse'
import { B_SOUTH_Z, E_SOUTH_Z, SECTION, SWING_ASSIST, WALL_HAND, climbPhase, nearWall, sectionAt, swingAssist, swingOf, swingTarget } from '../src/stages/future2086/chronicle/towerClimb'
import { swingGuidePath } from '../src/stages/future2086/chronicle/towerSwings'
import * as THREE from 'three'
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
  it('塔の金具は 1 個（E → 屋上）。着地点は足場かてっぺんの上', () => {
    expect(TOWER.hooks.length).toBe(1)
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
  it('てっぺんの金具：E の南の端から、届いて真上すぎない', () => {
    const [top] = TOWER.hooks
    const fromE = { x: 4.65, y: TOWER.clock.y0, z: E_SOUTH_Z }
    expect(reach(fromE, top.point)).toBeLessThanOrEqual(CLAW_RANGE)
    expect(elev(fromE, top.point)).toBeLessThan(72)
  })
  it('回る歯車の金具②は N1 で待って、E の北西のすみへ', () => {
    expect(onLedge(COURSE.hook2.wait, COURSE.N1)).toBe(true)
    const E = TOWER.ledges[TOWER.ledges.length - 1]
    expect(onLedge(COURSE.hook2.landing, { ...E, x1: E.x0 + 0.9 })).toBe(true)
  })
  it('光る輪 3 つで、通りの上をぐるりと回る（C の西のバルコニー C2 → W1 → W2 → N1）。飛びつく所・着く所は足場の上で、だんだん高くなる', () => {
    const from = [COURSE.C2, COURSE.W1, COURSE.W2]
    const to = [COURSE.W1, COURSE.W2, COURSE.N1]
    expect(COURSE.swings.length).toBe(3)
    COURSE.swings.forEach((s, i) => {
      expect(onLedge(s.start, from[i], 0.1, 0.25), s.id).toBe(true)
      expect(onLedge(s.land, to[i], 0.1, 0), s.id).toBe(true)
      expect(swingTarget(i)).toBe(to[i])
      expect(to[i].y).toBeGreaterThanOrEqual(from[i].y)
      expect(to[i].y - from[i].y).toBeLessThanOrEqual(2.0)
      expect(Math.abs(s.dir.length() - 1)).toBeLessThan(1e-6)
    })
    // 飛びつく所のうしろ（わたる向きの反対）に、カメラが下がれるすき間（壁まで 2.2m 以上）
    expect(TOWER.x0 - COURSE.swings[0].start.x).toBeGreaterThan(2.2)
    expect(COURSE.swings[2].start.x - COURSE.W2.x0).toBeGreaterThan(2.2)
    // 東西にわたる（通りの向こうのビル）のが 2 回、壁ぞいに北へ 1 回
    expect(COURSE.swings.filter((s) => Math.abs(s.dir.x) > 0.9).length).toBe(2)
    expect(COURSE.W1.x1).toBeLessThan(-3)
    expect(COURSE.N1.x0).toBeGreaterThan(3)
  })
  it('光る輪は、飛びつく所から届いて（9m まで）、見上げすぎない（55° より小さい）。向こうの足場のふちより手前にある', () => {
    for (const s of COURSE.swings) {
      expect(reach(s.start, s.anchor), s.id).toBeLessThanOrEqual(9)
      expect(elev(s.start, s.anchor), s.id).toBeLessThan(55)
      const L = swingTarget(COURSE.swings.indexOf(s))
      const ax = Math.abs(s.dir.x) > 0.5 ? 'x' : 'z'
      const sgn = (s.dir as THREE.Vector3)[ax] > 0 ? 1 : -1
      const edge = ax === 'x' ? (sgn > 0 ? L.x0 : L.x1) : sgn > 0 ? L.z0 : L.z1
      expect((edge - s.anchor[ax]) * sgn, s.id).toBeGreaterThanOrEqual(0.5)
    }
  })
  it('ぶら下がっている間（真下から 72° まで）、足は向こうの足場の板の中を通らない', () => {
    COURSE.swings.forEach((s, i) => {
      const L = swingTarget(i)
      for (let deg = -72; deg <= 72; deg += 2) {
        const th = (deg * Math.PI) / 180
        const p = s.anchor.clone().addScaledVector(s.dir, Math.sin(th) * s.rope)
        const feet = s.anchor.y - Math.cos(th) * s.rope - 1
        const over = p.x > L.x0 - 0.3 && p.x < L.x1 + 0.3 && p.z > L.z0 - 0.3 && p.z < L.z1 + 0.3
        if (over) expect(feet, `${s.id} ${deg}°`).toBeGreaterThan(L.y - 0.05)
      }
    })
  })
  it('道すじの線は、飛びつく所から始まって、向こうの足場の上で終わる', () => {
    COURSE.swings.forEach((s, i) => {
      const pts = swingGuidePath(s)
      expect(pts.length).toBeGreaterThan(20)
      expect(pts[0].distanceTo(s.start.clone().setY(s.start.y + 1))).toBeLessThan(0.01)
      const end = pts[pts.length - 1]
      expect(onLedge({ x: end.x, y: swingTarget(i).y, z: end.z }, swingTarget(i))).toBe(true)
    })
  })
  it('手をはなしたときの助け：向こうへ進んでいれば、足場にとどく速さになる。もどる向き・遠すぎるときは助けない', () => {
    const g = SWING_ASSIST.gravity
    COURSE.swings.forEach((s, i) => {
      const L = swingTarget(i)
      // 輪の真下を、向こうへ 5m/s で通るときに手をはなした（はなすと上へ 3.2m/s 足される）
      const p = s.anchor.clone().add(new THREE.Vector3(0, -s.rope - 1, 0))
      const vel = s.dir.clone().multiplyScalar(5).setY(3.2)
      const out = swingAssist(p, vel, s.dir, L)
      expect(out, s.id).not.toBeNull()
      // 山なりに飛んで、足場の高さで足場の上
      const disc = out!.y * out!.y + 2 * g * (p.y - L.y)
      const t = (out!.y + Math.sqrt(disc)) / g
      const land = { x: p.x + out!.x * t, y: L.y, z: p.z + out!.z * t }
      expect(onLedge(land, L, 0.1, 0), s.id).toBe(true)
      expect(Math.hypot(out!.x, out!.z)).toBeLessThanOrEqual(SWING_ASSIST.maxSpeed)
      // もどる向きに進んでいたら助けない
      expect(swingAssist(p, s.dir.clone().multiplyScalar(-4), s.dir, L)).toBeNull()
      // 遠すぎる（飛びつく所のすぐそば・足場より 6m 下）なら助けない
      expect(swingAssist(s.start.clone().add(new THREE.Vector3(0, -6, 0)), s.dir.clone().multiplyScalar(1), s.dir, L)).toBeNull()
    })
  })
  it('こぎすぎて向こうの壁に入りそうなら、手をはなして足場へ落とす（その所は足場の上）', () => {
    for (const s of COURSE.swings) {
      if (s.wall === undefined) continue
      const L = swingTarget(COURSE.swings.indexOf(s))
      const at = (k: number) => (Math.abs(s.dir.x) > 0.5 ? { x: k, z: s.anchor.z } : { x: s.anchor.x, z: k })
      expect(nearWall(at(s.wall - 0.2 * Math.sign(s.dir.x + s.dir.z)), s), s.id).toBe(true)
      expect(nearWall(at(s.anchor.x + 0 * s.dir.x), s), s.id).toBe(false)
      // 手をはなす所（壁の 0.4m 手前）は、向こうの足場の上
      const p = at(s.wall - 0.4 * Math.sign(s.dir.x + s.dir.z))
      expect(onLedge({ ...p, y: L.y }, L), s.id).toBe(true)
    }
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
    expect(climbPhase(SECTION.C, { z: -21 })).toBe('tower_swing1')
    expect(climbPhase(SECTION.W1, { z: -22 })).toBe('tower_swing2')
    expect(climbPhase(SECTION.W2, { z: -31 })).toBe('tower_swing3')
    expect(climbPhase(SECTION.N1, { z: -30 })).toBe('tower_gearhook2')
    expect([SECTION.C, SECTION.W1, SECTION.W2].map(swingOf)).toEqual([0, 1, 2])
    expect(swingOf(SECTION.B)).toBe(-1)
  })
  it('黒い手とがれきは、予告から当たりまで 1.2 秒以上（はじめの案内のときは、もっとゆっくり）', () => {
    expect(WALL_HAND.windup + WALL_HAND.strike).toBeGreaterThanOrEqual(1.2)
    expect(WALL_HAND.slow).toBeGreaterThan(WALL_HAND.windup)
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
