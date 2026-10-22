// 11章「900年前のカンボジア」の進み方（stages/khmer1186/storyKhmer.ts）と台詞（lines_v7.json）のテスト。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { COLLAPSE_PLAN, KHMER_STEPS, MIRROR_FLAGS, NIGHT_WAVES, canPlaceMirror, khmerObjective, khmerSpawn, khmerStep, khmerTime, mirrorsLeft, type KhmerStep } from '../src/stages/khmer1186/storyKhmer'
import { K, SPAWNS } from '../src/stages/khmer1186/layout'

const STAIRS_SEGS = K.STAIRS.segs
import { V7_FLAGS } from '../src/chronicle/progress'
import lines from '../src/stages/khmer1186/lines_v7.json'

const flagsOf = (...on: string[]) => {
  const s = new Set(on)
  return (n: string) => s.has(n)
}

/** 物語の順にフラグを 1 つずつ立てたときの段階 */
const ORDER: Array<[string[], KhmerStep]> = [
  [[], 'arrive'],
  [['v7_khmer_arrived'], 'meet'],
  [['v7_met_chanda'], 'mirrors'],
  [['v7_mirror_n'], 'mirrors'],
  [['v7_mirror_e'], 'mirrors'],
  [['v7_mirror_s'], 'night'],
  [['v7_stairs_defended'], 'ura'],
  [['v7_heart1'], 'after'],
  [['v7_khmer_done'], 'return'],
]

describe('khmerStep（フラグだけから段階）', () => {
  it('物語の順にフラグを立てると、段階が順に進む', () => {
    const on: string[] = []
    for (const [add, want] of ORDER) {
      on.push(...add)
      expect(khmerStep(flagsOf(...on))).toBe(want)
    }
  })

  it('段階の並びは KHMER_STEPS と同じで、戻らない', () => {
    const on: string[] = []
    let last = -1
    for (const [add] of ORDER) {
      on.push(...add)
      const i = KHMER_STEPS.indexOf(khmerStep(flagsOf(...on)))
      expect(i).toBeGreaterThanOrEqual(last)
      last = i
    }
    expect(last).toBe(KHMER_STEPS.length - 1)
  })

  it('鏡は三つそろうまで mirrors（立てる順はどれでも）', () => {
    const base = ['v7_khmer_arrived', 'v7_met_chanda']
    expect(khmerStep(flagsOf(...base, 'v7_mirror_s', 'v7_mirror_e'))).toBe('mirrors')
    expect(mirrorsLeft(flagsOf(...base, 'v7_mirror_s', 'v7_mirror_e'))).toEqual(['n'])
    expect(khmerStep(flagsOf(...base, 'v7_mirror_s', 'v7_mirror_e', 'v7_mirror_n'))).toBe('night')
  })

  it('使うフラグは progress.ts の V7_FLAGS にある', () => {
    const all = new Set<string>(V7_FLAGS)
    for (const [add] of ORDER) for (const f of add) expect(all.has(f), f).toBe(true)
    for (const f of Object.values(MIRROR_FLAGS)) expect(all.has(f), f).toBe(true)
  })
})

describe('khmerSpawn・khmerTime', () => {
  it('どの段階の到着地点も、舞台の SPAWNS にある', () => {
    for (const s of KHMER_STEPS) expect(SPAWNS[khmerSpawn(s)], s).toBeTruthy()
  })

  it('夜の防衛は夜、裏側からあとは夜明け、それまでは昼', () => {
    expect(khmerTime('arrive')).toBe('afternoon')
    expect(khmerTime('meet')).toBe('afternoon')
    expect(khmerTime('mirrors')).toBe('afternoon')
    expect(khmerTime('night')).toBe('night')
    expect(khmerTime('ura')).toBe('dawn')
    expect(khmerTime('after')).toBe('dawn')
    expect(khmerTime('return')).toBe('dawn')
  })
})

describe('khmerObjective（左上の目標）', () => {
  it('どの段階でも、目標の一言がある', () => {
    for (const s of KHMER_STEPS) {
      const o = khmerObjective(s, flagsOf())
      expect(o.title.length, s).toBeGreaterThan(0)
      expect(o.title.length, s).toBeLessThanOrEqual(24)
    }
  })

  it('鏡ののこりの数が出る', () => {
    const f = flagsOf('v7_khmer_arrived', 'v7_met_chanda', 'v7_mirror_n')
    expect(khmerObjective('mirrors', f).title).toContain('のこり 2')
  })

  it('東の塔は、回る鏡の台を止めるまで、その手がかりを出す', () => {
    const f = flagsOf('v7_khmer_arrived', 'v7_met_chanda')
    expect(khmerObjective('mirrors', f, { near: 'e', turntableSolved: false }).sub).toContain('回る鏡の台')
    expect(khmerObjective('mirrors', f, { near: 'e', turntableSolved: true }).sub).toContain('F')
  })

  it('北・南の塔は、仕掛けをこえるまで、その手がかりを出す', () => {
    const f = flagsOf('v7_khmer_arrived', 'v7_met_chanda')
    expect(khmerObjective('mirrors', f, { near: 's', climbed: false }).sub).toContain('石')
    expect(khmerObjective('mirrors', f, { near: 's', climbed: true }).sub).toContain('F')
    expect(khmerObjective('mirrors', f, { near: 'n', climbed: false }).sub).toContain('飛びうつる')
  })

  it('夜の中の段階ごとに目標がかわる', () => {
    const f = flagsOf()
    expect(khmerObjective('night', f, { night: 'climb' }).title).toContain('階段')
    expect(khmerObjective('night', f, { night: 'defend' }).title).toContain('守る')
  })
})

describe('canPlaceMirror', () => {
  const met = flagsOf('v7_khmer_arrived', 'v7_met_chanda')
  it('チャンダと会う前は立てられない', () => {
    expect(canPlaceMirror('n', flagsOf('v7_khmer_arrived'), true)).toBe(false)
  })
  it('東は回る鏡の台を解いてから', () => {
    expect(canPlaceMirror('e', met, false)).toBe(false)
    expect(canPlaceMirror('e', met, true)).toBe(true)
    expect(canPlaceMirror('n', met, false)).toBe(true)
  })
  it('立てた塔には、もう立てない', () => {
    expect(canPlaceMirror('s', flagsOf('v7_khmer_arrived', 'v7_met_chanda', 'v7_mirror_s'), true)).toBe(false)
  })
})

describe('夜の防衛の決まり', () => {
  it('影の波は 2 つ、どれも 3〜5 体', () => {
    expect(NIGHT_WAVES.length).toBe(2)
    for (const w of NIGHT_WAVES) {
      expect(w.length).toBeGreaterThanOrEqual(3)
      expect(w.length).toBeLessThanOrEqual(5)
    }
  })
  it('くずれる区切りは大階段の中で、下から順', () => {
    let last = -1
    for (const c of COLLAPSE_PLAN) {
      expect(c.seg).toBeGreaterThan(last)
      expect(c.seg).toBeLessThan(STAIRS_SEGS)
      expect(c.at).toBeGreaterThanOrEqual(0)
      expect(c.at).toBeLessThanOrEqual(1)
      last = c.seg
    }
  })
})

describe('台詞（lines_v7.json）', () => {
  const db = lines as Record<string, Array<{ speaker: string; text: string }>>
  const SPEAKERS = new Set(['ネクマックス', 'チャンダ', 'チャンダのおばあさん', 'トワ', '村の人'])

  it('stage.ts で使っている台詞のキーが、すべて JSON にある', () => {
    const src = readFileSync(new URL('../src/stages/khmer1186/stage.ts', import.meta.url), 'utf8')
    const keys = new Set<string>()
    for (const m of src.matchAll(/(?:this\.lines|this\.talkOnce\(rt,)\s*\(?'([a-z0-9_]+)'/g)) keys.add(m[1])
    expect(keys.size).toBeGreaterThan(20)
    for (const k of keys) expect(db[k], k).toBeTruthy()
    // 組み立てて使うキー
    for (const n of [1, 2, 3]) expect(db[`mirror_set_${n}`]).toBeTruthy()
    for (const id of ['n', 'e', 's']) expect(db[`tower_${id}_near`]).toBeTruthy()
  })

  it('1 行は短く、話者は決まった名前', () => {
    for (const [k, list] of Object.entries(db)) {
      expect(list.length, k).toBeGreaterThan(0)
      for (const l of list) {
        expect(SPEAKERS.has(l.speaker), `${k}: ${l.speaker}`).toBe(true)
        expect(l.text.length, `${k}: ${l.text}`).toBeLessThanOrEqual(50)
        expect(l.text.length).toBeGreaterThan(0)
      }
    }
  })

  it('トワの一人称は「おれ」（「ぼく」「わたし」を使わない）', () => {
    for (const list of Object.values(db)) for (const l of list) if (l.speaker === 'トワ') expect(l.text).not.toMatch(/ぼく|わたし/)
  })
})
