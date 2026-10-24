// 7 章（1726年）の本編：フラグだけから段階が決まる・到着地点・目標・時の鐘人形の歯車の順番・台詞のキー
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOSS_RAGE, EDO_STEPS, GearPulls, PULLS_PER_GEAR, dollAttack, edoMobPhase, edoObjective, edoSpawn, edoStep, edoTime, opensGear } from '../src/stages/edo1726/chronicle/storyEdo7'
import lines from '../src/stages/edo1726/chronicle/lines_v7.json'
import mobLines from '../src/stages/edo1726/chronicle/mob_lines_v7.json'
import { TOWNSFOLK } from '../src/stages/edo1726/chronicle/townsfolk7'
import { hasTalk, talkLinesFor, type MobTable } from '../src/world/mobTalkLogic'

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

describe('GearPulls（右の肩・左のひざ・胸の順に、すきの間につかんで引っぱる）', () => {
  it('すき（open）のときだけつかめる。つかんで holdSec で 1 回、PULLS_PER_GEAR 回で止まる', () => {
    const g = new GearPulls()
    expect(g.grab(0, null)).toBe('closed')
    expect(g.grab(1, 1)).toBe('later')
    expect(g.grab(0, 0)).toBe('hold')
    expect(g.tick(g.holdSec * 0.5)).toBe('none')
    expect(g.progress).toBeCloseTo(0.5)
    expect(g.tick(g.holdSec)).toBe(PULLS_PER_GEAR > 1 ? 'pulled' : 'stopped')
    expect(g.holding).toBe(-1)
    for (let k = 1; k < PULLS_PER_GEAR; k++) {
      g.grab(0, 0)
      expect(g.tick(g.holdSec)).toBe(k === PULLS_PER_GEAR - 1 ? 'stopped' : 'pulled')
    }
    expect(g.next).toBe(1)
    expect(g.grab(0, 0)).toBe('already')
  })
  it('とちゅうではなすと、その 1 回はやり直し。体力は止めるほどへる', () => {
    const g = new GearPulls()
    expect(g.life).toBe(1)
    g.grab(0, 0)
    g.tick(g.holdSec * 0.6)
    g.release()
    expect(g.progress).toBe(0)
    expect(g.pulls).toBe(0)
    for (const i of [0, 1, 2]) {
      for (let k = 0; k < PULLS_PER_GEAR; k++) {
        g.grab(i, i)
        g.tick(g.holdSec)
      }
      expect(g.life).toBeCloseTo(1 - (i + 1) / 3)
    }
    expect(g.done).toBe(true)
  })
  it('止めるたびに速くなるが、怒りは 1.25 まで（腕の予告から当たりまで 1.2 秒より長く）', () => {
    const g = new GearPulls()
    let last = 0
    for (let i = 0; i < 3; i++) {
      g.next = i
      expect(g.rage).toBeGreaterThan(last)
      last = g.rage
    }
    expect(Math.max(...BOSS_RAGE)).toBeLessThanOrEqual(1.25)
    // bellDoll の T：ふりおろしの予告（windup 1.4）＋たたきつけ（0.22）、足ぶみの予告（1.6）を、いちばん速い怒りで割っても 1.2 秒以上
    expect((1.4 + 0.22) / 1.25).toBeGreaterThanOrEqual(1.2)
    expect(1.6 / 1.25).toBeGreaterThanOrEqual(1.2)
  })
  it('攻撃の順：どの段階にも、その歯車のすきを作る攻撃が入っていて、止めるたびに種類がふえる', () => {
    for (let phase = 0; phase < 3; phase++) {
      const seen = new Set(Array.from({ length: 12 }, (_, n) => dollAttack(phase, n)))
      const opens = [...seen].map(opensGear)
      expect(opens).toContain(phase)
      // ほかの歯車のすきは作らない
      for (const o of opens) if (o !== null) expect(o).toBe(phase)
      expect(seen.size).toBeGreaterThanOrEqual(phase === 0 ? 2 : 3)
    }
    // 右の肩が止まったら、木槌（右うで）のふりおろしは出さない
    for (let n = 0; n < 12; n++) for (const phase of [1, 2]) expect(dollAttack(phase, n)).not.toBe('swing')
    // ひざが止まったら、足ぶみは出さない
    for (let n = 0; n < 12; n++) expect(dollAttack(2, n)).not.toBe('stomp')
  })
  it('目標：すきのときは「今！」、そうでなければ、すきの作り方', () => {
    expect(edoObjective('night', { boss: 'fight', nextGear: 0, open: true }).title).toContain('今！')
    expect(edoObjective('night', { boss: 'fight', nextGear: 1 }).sub).toContain('赤い輪')
    expect(edoObjective('night', { boss: 'fight', nextGear: 2 }).sub).toContain('胸の戸')
    expect(edoObjective('night', { boss: 'fight', nextGear: 0, left: 2 }).sub).toContain('あと 2 回')
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

describe('町の人（townsfolk7.ts・mob_lines_v7.json）', () => {
  const table = mobLines as unknown as MobTable
  const ids = TOWNSFOLK.flatMap((d) => (d.id ? [d.id] : []))
  it('場面：人形が来る前は昼、夜は町の人がいない、夜明けのあとは朝', () => {
    expect(edoMobPhase('arrive')).toBe('day')
    expect(edoMobPhase('workshop')).toBe('day')
    expect(edoMobPhase('demo')).toBe('day')
    expect(edoMobPhase('night')).toBe('night')
    expect(edoMobPhase('dawn')).toBe('morning')
    expect(edoMobPhase('leave')).toBe('morning')
  })
  it('話せる人が 8 人以上いて、昼と朝のどちらでも F で 1〜3 行の会話がある', () => {
    expect(ids.length).toBeGreaterThanOrEqual(8)
    for (const id of ids) {
      expect(table.speakers[id], id).toBeDefined()
      for (const ph of ['day', 'morning']) {
        expect(hasTalk(table, id, ph), `${id} ${ph}`).toBe(true)
        const t = talkLinesFor(table, id, ph, 0)
        expect(t.length, `${id} ${ph}`).toBeGreaterThanOrEqual(1)
        expect(t.length, `${id} ${ph}`).toBeLessThanOrEqual(3)
        expect(table.speakers[id].bubble[ph]?.length, `${id} ${ph}`).toBeGreaterThan(0)
      }
      // 夜はだれもいない
      expect(hasTalk(table, id, 'night'), id).toBe(false)
    }
  })
  it('吹き出しは 40 字まで・会話の 1 行は 44 字まで・物語の先の名前は出さない', () => {
    for (const id of ids) {
      const sp = table.speakers[id]
      for (const l of Object.values(sp.bubble).flatMap((x) => x ?? [])) expect([...l].length, l).toBeLessThanOrEqual(40)
      for (const l of Object.values(sp.talk ?? {}).flatMap((x) => x ?? [])) {
        expect([...l.text].length, l.text).toBeLessThanOrEqual(44)
        expect([sp.name, 'ネクマックス']).toContain(l.speaker)
        for (const w of ['オルム', 'トワ', 'カンボジア', '時を裂く爪']) expect(l.text).not.toContain(w)
      }
    }
  })
})
