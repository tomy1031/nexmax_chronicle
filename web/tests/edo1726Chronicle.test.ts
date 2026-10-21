// 7 章（1726年）の本編：フラグだけから段階が決まる・到着地点・目標・時の鐘人形の歯車の順番・台詞のキー
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EDO_STEPS, GearOrder, edoObjective, edoSpawn, edoStep, edoTime } from '../src/stages/edo1726/chronicle/storyEdo7'
import lines from '../src/stages/edo1726/chronicle/lines_v7.json'

const flags = (...on: string[]) => (n: string) => on.includes(n)

describe('edoStep（フラグから段階）', () => {
  it('物語の順に進む', () => {
    expect(edoStep(flags())).toBe('arrive')
    expect(edoStep(flags('v7_met_oharu'))).toBe('workshop')
    expect(edoStep(flags('v7_met_oharu', 'v7_fragment_seen'))).toBe('demo')
    expect(edoStep(flags('v7_met_oharu', 'v7_fragment_seen', 'v7_demo_seen'))).toBe('night')
    expect(edoStep(flags('v7_met_oharu', 'v7_fragment_seen', 'v7_demo_seen', 'v7_doll_down'))).toBe('dawn')
    expect(edoStep(flags('v7_met_oharu', 'v7_fragment_seen', 'v7_demo_seen', 'v7_doll_down', 'v7_claw_stored'))).toBe('leave')
  })
  it('あとのフラグだけでも（?flags= で途中から）その段階になる', () => {
    expect(edoStep(flags('v7_doll_down'))).toBe('dawn')
    expect(edoStep(flags('v7_claw_stored'))).toBe('leave')
  })
  it('時間帯：夜はボス戦、朝は箱を運ぶ', () => {
    expect(edoTime('night')).toBe('night')
    expect(edoTime('dawn')).toBe('morning')
    expect(edoTime('arrive')).toBe('day')
  })
})

describe('到着地点と目標', () => {
  const layout = readFileSync(new URL('../src/stages/edo1726/chronicle/layout.ts', import.meta.url), 'utf8')
  it('どの段階の到着地点も layout.ts にある（v7_alley は 2026年のかんばんからの到着）', () => {
    expect(edoSpawn('arrive')).toBe('v7_alley')
    for (const s of EDO_STEPS) expect(layout).toContain(`${edoSpawn(s)}:`)
  })
  it('どの段階にも、短い目標がある', () => {
    for (const s of EDO_STEPS) {
      for (const sub of [{}, { dollCaught: true, inWorkshop: true, bookSeen: true, boss: 'fight' as const, nextGear: 2, carryBox: true, boxReady: true }]) {
        const o = edoObjective(s, sub)
        expect(o.title.length).toBeGreaterThan(2)
        expect(o.title.length).toBeLessThanOrEqual(24)
      }
    }
    expect(edoObjective('night', { boss: 'fight', nextGear: 1 }).title).toContain('左のひざ')
  })
})

describe('GearOrder（右の肩・左のひざ・胸の順に 3 秒つかむ）', () => {
  it('正しい順に 3 秒つかむと止まる', () => {
    const g = new GearOrder(3)
    expect(g.grab(0)).toBe('hold')
    expect(g.tick(1)).toBe(-1)
    expect(g.progress).toBeCloseTo(1 / 3)
    expect(g.tick(2.1)).toBe(0)
    expect(g.next).toBe(1)
    expect(g.holding).toBe(-1)
  })
  it('とちゅうではなすとやり直し・まちがえると怒る', () => {
    const g = new GearOrder(3)
    g.grab(0)
    g.tick(2)
    g.release()
    expect(g.progress).toBe(0)
    expect(g.grab(2)).toBe('wrong')
    expect(g.mistakes).toBe(1)
    expect(g.rage).toBeGreaterThan(1)
    g.grab(0)
    g.tick(3)
    expect(g.grab(0)).toBe('already')
    for (const i of [1, 2]) {
      g.grab(i)
      g.tick(3)
    }
    expect(g.done).toBe(true)
  })
  it('怒りは 1.6 まで', () => {
    const g = new GearOrder()
    for (let i = 0; i < 10; i++) g.grab(2)
    expect(g.rage).toBeLessThanOrEqual(1.6)
  })
})

describe('台詞（lines_v7.json）', () => {
  const src = readFileSync(new URL('../src/stages/edo1726/chronicle/stage.ts', import.meta.url), 'utf8')
  const table = lines as Record<string, Array<{ speaker: string; text: string }>>
  it('stage.ts が使うキーはすべてある', () => {
    const keys = [...src.matchAll(/lines\.lines\('([a-z0-9_]+)'\)/g)].map((m) => m[1])
    expect(keys.length).toBeGreaterThan(20)
    for (const k of keys) expect(table[k], k).toBeDefined()
    for (const k of ['call_0', 'call_1', 'call_2', 'stopped_0', 'stopped_1']) expect(table[k], k).toBeDefined()
  })
  it('1 行は短く、話し手は決まった名前', () => {
    const ok = new Set(['ネクマックス', '源兵衛', 'おはる'])
    for (const [k, ls] of Object.entries(table)) {
      for (const l of ls) {
        expect(ok.has(l.speaker), `${k}: ${l.speaker}`).toBe(true)
        expect(l.text.length, `${k}: ${l.text}`).toBeLessThanOrEqual(50)
      }
    }
  })
  it('本文の大事な言葉が入っている', () => {
    const all = Object.values(table)
      .flat()
      .map((l) => l.text)
      .join('\n')
    for (const w of ['このかけらが鳴った', '時を裂く', '右の肩、左のひざ、それから胸', '夜明けの光は、あいつらの毒なんやな', '時が、かわりに仕事をしてくれるんか', 'お前の石の音にだけ、ひらく', '百年先でも、二百年先でも']) {
      expect(all).toContain(w)
    }
    expect(all).not.toContain('オルム')
  })
})
