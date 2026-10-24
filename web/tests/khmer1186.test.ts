// 1186年 クメールの都の舞台：配置と仕掛けの計算（描画なし）
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ELEPHANT_PATHS, ELEPHANT_DOCK, K, ROUTE_N, SMALL_TOWER, SPAWNS, TOWERS, TOWER_IDS, WATER_HOUSES, arunCenter, mirrorCenter, towerPoint } from '../src/stages/khmer1186/layout'
import { FerryLogic, PingPongWalker, StoneFallLogic, TurntableLogic, angleDiff, segmentHitsBox, stairSegment, stairSlope, wrapAngle, type AABB } from '../src/stages/khmer1186/khmerLogic'
import { CLAW_TUNING } from '../src/player/clawLogic'
import { MOVE_TUNING } from '../src/player/controller'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const CHEST = 0.72
/** ジャンプでとどく高さ（v²/2g） */
const JUMP_APEX = (MOVE_TUNING.jump * MOVE_TUNING.jump) / (2 * MOVE_TUNING.gravity)
const box = (cx: number, cz: number, half: number, y0: number, y1: number, halfZ = half): AABB => ({ min: v(cx - half, y0, cz - halfZ), max: v(cx + half, y1, cz + halfZ) })

describe('角度', () => {
  it('wrapAngle と angleDiff は -π..π', () => {
    expect(wrapAngle(Math.PI * 2.5)).toBeCloseTo(Math.PI / 2, 5)
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2, 6)
    expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 6)
  })
})

describe('回る鏡の台', () => {
  it('回り続け、止めると止まる。正しい角度の幅で aligned', () => {
    const t = new TurntableLogic(1.0, { start: 0, speed: 0.5, tolerance: 0.1 })
    expect(t.aligned).toBe(false)
    const s = t.secondsToAligned()
    expect(s).toBeCloseTo(2, 3)
    t.update(s)
    expect(t.aligned).toBe(true)
    t.frozen = true
    t.update(10)
    expect(t.aligned).toBe(true)
    expect(t.secondsToAligned()).toBe(Infinity)
    t.frozen = false
    t.update(1)
    expect(t.aligned).toBe(false)
  })
})

describe('落ちてくる石', () => {
  const path = [v(0, 5, 0), v(0, 0.3, 0), v(-1.2, 0.3, 0), v(-2, -0.6, 0)]
  it('かくれる → ゆれる → 落ちる → 消える、をくり返す', () => {
    const s = new StoneFallLogic({ path, speed: 2, wobble: 1, fade: 0.5, gap: 0.5, window: { y0: 0.4, y1: 0.9 }, half: 0.3 })
    const seen = new Set<string>()
    for (let i = 0; i < 600; i++) {
      const p = s.update(1 / 60)
      if (p) seen.add(p)
    }
    expect([...seen].sort()).toEqual(['fade', 'fall', 'hidden', 'wobble'])
  })
  it('平らな所を転がっている間は「足場にちょうどいい」高さ。止めると動かない', () => {
    const s = new StoneFallLogic({ path, speed: 2, wobble: 0.2, window: { y0: 0.4, y1: 0.9 }, half: 0.3 })
    let caught = false
    for (let i = 0; i < 600 && !caught; i++) {
      s.update(1 / 60)
      if (s.inWindow) caught = true
    }
    expect(caught).toBe(true)
    const at = s.pos.clone()
    s.setFrozen(true)
    for (let i = 0; i < 120; i++) s.update(1 / 60)
    expect(s.pos.distanceTo(at)).toBeLessThan(1e-6)
    expect(s.top).toBeGreaterThanOrEqual(0.4)
  })
  it('rest：下に着いたら、足場にちょうどいい高さで rest 秒休む（そのあいだに止められる）', () => {
    const s = new StoneFallLogic({ path, speed: 2, wobble: 0.2, window: { y0: 0.4, y1: 0.9 }, half: 0.3, rest: 1.5 })
    let inWin = 0
    for (let i = 0; i < 600; i++) {
      s.update(1 / 60)
      if (s.inWindow) inWin += 1 / 60
      if (s.phase === 'fade') break
    }
    // 休みの 1.5 秒＋転がる間
    expect(inWin).toBeGreaterThan(1.5)
  })
  it('loop: false なら 1 回で終わる', () => {
    const s = new StoneFallLogic({ path, speed: 4, wobble: 0.1, fade: 0.1, loop: false })
    for (let i = 0; i < 400; i++) s.update(1 / 60)
    expect(s.active).toBe(false)
  })
})

describe('象の往復', () => {
  it('端で待ってから引き返す', () => {
    const w = new PingPongWalker([v(0, 0, 0), v(10, 0, 0)], 2, 1)
    for (let i = 0; i < 5 * 60 + 2; i++) w.update(1 / 60)
    expect(w.pos.x).toBeCloseTo(10, 3)
    expect(w.moving).toBe(false)
    for (let i = 0; i < 2 * 60; i++) w.update(1 / 60)
    expect(w.pos.x).toBeLessThan(10)
    expect(w.heading.x).toBeLessThan(0)
  })
  it('池の象の道の先は h2 の縁台のすぐそば（跳び移れる）', () => {
    const P = ELEPHANT_PATHS.baray.points
    const end = P[P.length - 1]
    const h2 = WATER_HOUSES.find((h) => h.id === 'h2')!
    const deckTop = end.y + 2.75
    expect(h2.floorY - deckTop).toBeLessThan(JUMP_APEX - 0.2)
    const edgeX = h2.x + h2.w / 2 + h2.porch
    expect(Math.abs(end.x - edgeX)).toBeLessThan(2.2)
  })
  it('象のりばから、待っている象の背中へは、渡し板の坂を歩いてのぼれる', () => {
    const start = ELEPHANT_PATHS.baray.points[0]
    const rise = start.y + 2.75 - ELEPHANT_DOCK.y
    const run = ELEPHANT_DOCK.x - ELEPHANT_DOCK.w / 2 - (start.x + 0.6)
    expect(run).toBeGreaterThan(0)
    // プレイヤーがのぼれる坂は 52° まで（player/controller.ts の setMaxSlopeClimbAngle）。板は乗り場と背中に 0.25 m ずつかかる
    expect(Math.atan2(rise, run + 0.5)).toBeLessThan((40 * Math.PI) / 180)
  })
  it('象のりばは、待っている象の背中のすぐ横', () => {
    const start = ELEPHANT_PATHS.baray.points[0]
    const back = start.y + 2.75
    expect(Math.abs(ELEPHANT_DOCK.y - back)).toBeLessThan(JUMP_APEX - 0.3)
    expect(Math.abs(ELEPHANT_DOCK.x - ELEPHANT_DOCK.w / 2 - start.x)).toBeLessThan(2.4)
  })
})

describe('池の象（乗り場 ⇄ 池のまん中の家）', () => {
  const run = (f: FerryLogic, w: PingPongWalker, sec: number, riding: boolean) => {
    for (let i = 0; i < sec * 60; i++) {
      f.update(1 / 60, w, riding)
      w.update(1 / 60)
    }
  }
  it('乗るまで乗り場で待ち、乗ると池の家のそばまで行って、そこで待つ', () => {
    const w = new PingPongWalker(ELEPHANT_PATHS.baray.points, ELEPHANT_PATHS.baray.speed, ELEPHANT_PATHS.baray.wait)
    const f = new FerryLogic()
    run(f, w, 30, false)
    expect(f.state).toBe('dock')
    expect(w.s).toBe(0)
    run(f, w, 1, true)
    expect(f.state).toBe('go')
    run(f, w, 60, true)
    expect(f.state).toBe('far')
    const end = w.s
    run(f, w, 20, true)
    expect(w.s).toBeCloseTo(end, 3)
  })
  it('とちゅうで落ちても（乗っていなくても）先へ行かない。降りてしばらくすると乗り場へもどる', () => {
    const w = new PingPongWalker(ELEPHANT_PATHS.baray.points, ELEPHANT_PATHS.baray.speed, ELEPHANT_PATHS.baray.wait)
    const f = new FerryLogic()
    run(f, w, 1, true)
    run(f, w, 4, true)
    const mid = w.s
    run(f, w, 5, false)
    expect(w.s).toBeCloseTo(mid, 3)
    expect(f.state).toBe('go')
    run(f, w, 60, true)
    expect(f.state).toBe('far')
    run(f, w, 4, false)
    expect(f.state).toBe('far')
    run(f, w, 2, false)
    expect(f.state).toBe('back')
    run(f, w, 60, false)
    expect(f.state).toBe('dock')
    expect(w.s).toBe(0)
  })
})

describe('北の塔への道（クローの金具）', () => {
  it('どの金具も、狙う所から射程の中で、向きが合う', () => {
    for (const h of ROUTE_N.hooks) {
      const chest = h.from.clone().setY(h.from.y + CHEST)
      const d = chest.distanceTo(h.point)
      expect(d, h.id).toBeLessThanOrEqual(CLAW_TUNING.range - 0.3)
      expect(chest.clone().sub(h.point).dot(h.facing), h.id).toBeGreaterThan(0)
    }
  })
  it('ぶら下がる輪は h1 から届き、ふりこの先は h2 の縁台の上', () => {
    const S = ROUTE_N.swing
    const from = S.checkpoints[0].clone().setY(S.checkpoints[0].y + CHEST)
    expect(from.distanceTo(S.point)).toBeLessThanOrEqual(CLAW_TUNING.range)
    const h2 = WATER_HOUSES.find((h) => h.id === 'h2')!
    const reach = S.point.x + Math.sqrt(S.rope * S.rope - (S.point.y - 1.0 - h2.floorY - 2) ** 2)
    expect(reach).toBeGreaterThan(h2.x - h2.w / 2 - h2.porch)
  })
  it('小屋と小屋のあいだは跳んでは渡れない（クローが要る）', () => {
    const run = (MOVE_TUNING.dash * 2 * MOVE_TUNING.jump) / MOVE_TUNING.gravity
    const ids = ['va', 'h1', 'h2', 'h3', 'h4']
    for (let i = 0; i < ids.length - 1; i++) {
      const a = WATER_HOUSES.find((h) => h.id === ids[i])!
      const b = WATER_HOUSES.find((h) => h.id === ids[i + 1])!
      const gapX = Math.abs(b.x - a.x) - (a.w / 2 + a.porch) - (b.w / 2 + b.porch)
      const gapZ = Math.abs(b.z - a.z) - (a.d / 2 + a.porch) - (b.d / 2 + b.porch)
      expect(Math.max(gapX, gapZ), `${a.id}→${b.id}`).toBeGreaterThan(run * 0.75)
    }
  })
})

describe('塔と光の筋', () => {
  const tiers = K.PYRAMID.tiers.map((t) => box(K.PYRAMID.cx, K.PYRAMID.cz, t.half - 0.1, t.y0, t.y1))
  it('三つの鏡からアルンへの光の筋は、中央の山の段にあたらない', () => {
    const to = arunCenter()
    for (const id of TOWER_IDS) {
      const from = mirrorCenter(id)
      // アルンのすぐ手前（入口の中）まで
      const end = from.clone().lerp(to, 0.94)
      for (const b of tiers) expect(segmentHitsBox(from, end, b), `${id}`).toBe(false)
    }
  })
  it('光の筋は、ほかの塔の基壇にあたらない', () => {
    const to = arunCenter()
    for (const id of TOWER_IDS) {
      const from = mirrorCenter(id)
      for (const other of TOWER_IDS) {
        if (other === id) continue
        const t = TOWERS[other]
        let y = t.baseY
        for (const tr of SMALL_TOWER.tiers) {
          expect(segmentHitsBox(from, to, box(t.x, t.z, tr.half, y, y + tr.h)), `${id}→${other}`).toBe(false)
          y += tr.h
        }
      }
    }
  })
  it('回る鏡の台から東の塔の台への光の筋は、東の塔の基壇にあたらない', () => {
    const t = TOWERS.e
    const from = K.TURNTABLE.clone().setY(1.75)
    const to = towerPoint(t, SMALL_TOWER.stand.front, 0, SMALL_TOWER.top + SMALL_TOWER.stand.h + 0.25)
    let y = t.baseY
    for (const tr of SMALL_TOWER.tiers) {
      const end = from.clone().lerp(to, 0.97)
      expect(segmentHitsBox(from, end, box(t.x, t.z, tr.half, y, y + tr.h))).toBe(false)
      y += tr.h
    }
  })
})

describe('大階段', () => {
  it('区切りの高さは跳んでも届かず、坂は上れる角度', () => {
    expect(K.STAIRS.rise).toBeGreaterThan(JUMP_APEX + 0.15)
    expect(stairSlope()).toBeLessThan((50 * Math.PI) / 180)
    expect(K.STAIRS.rise / 2).toBeLessThan(JUMP_APEX - 0.1)
  })
  it('区切りはつながって、上の台の高さで終わる', () => {
    const last = stairSegment(K.STAIRS.segs - 1)
    expect(last.y1).toBeCloseTo(K.TOP_Y, 5)
    expect(last.x1).toBeCloseTo(K.STAIRS.x1, 5)
    for (let i = 1; i < K.STAIRS.segs; i++) expect(stairSegment(i).x0).toBeCloseTo(stairSegment(i - 1).x1, 6)
  })
  it('小さな塔の階段も、区切りは跳べず、坂は上れる', () => {
    const S = SMALL_TOWER.stairs
    expect(S.rise).toBeGreaterThan(JUMP_APEX + 0.15)
    expect(Math.atan2(S.rise, S.run)).toBeLessThan((52 * Math.PI) / 180)
    expect(S.rise * S.segs).toBeCloseTo(SMALL_TOWER.top, 5)
  })
})

describe('到着地点', () => {
  it('どれも歩ける範囲の中', () => {
    const B = K.BOUNDS
    for (const [id, s] of Object.entries(SPAWNS)) {
      expect(s.pos.x, id).toBeGreaterThan(B.x0)
      expect(s.pos.x, id).toBeLessThan(B.x1)
      expect(s.pos.z, id).toBeGreaterThan(B.z0)
      expect(s.pos.z, id).toBeLessThan(B.z1)
    }
  })
  it('設計書の到着地点がそろっている', () => {
    for (const id of ['arrive', 'village', 'temple', 'stairs', 'tower_n', 'tower_e', 'tower_s']) expect(SPAWNS[id], id).toBeTruthy()
  })
})
