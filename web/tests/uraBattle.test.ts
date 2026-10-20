// 裏側の戦い（chronicle/uraBattleLogic.ts・ura_lines.json）
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import lines from '../src/chronicle/ura_lines.json'
import {
  URA_LINE_KEYS,
  URA_STEPS,
  doorLeft,
  doorWidthK,
  escortCanMove,
  fellBelow,
  insideDoor,
  isPlayStep,
  nextStep,
  pathProgress,
  uraObjective,
  veinsNeeded,
  veinsStepDone,
  type UraStep,
} from '../src/chronicle/uraBattleLogic'

const L = lines as Record<string, { speaker: string; text: string }[]>

describe('段の進み方', () => {
  it('khmer：入る → 道を守る → 刃が心臓をつく → 黒いものを裂く → 扉へ → 出る', () => {
    const seen: UraStep[] = []
    let s: UraStep = URA_STEPS.khmer[0]
    for (let i = 0; i < 20 && s !== 'done'; i++) {
      seen.push(s)
      s = nextStep('khmer', s)
    }
    expect(seen).toEqual(['enter', 'escort', 'stab', 'free', 'escape', 'exit'])
    expect(nextStep('khmer', 'done')).toBe('done')
  })

  it('final：すじ 2 本 → トワ → 3 本目 → 最後のすじとランプ → 心臓 → 最後の光 → 一撃 → トワをつかむ → 扉へ', () => {
    const seen: UraStep[] = []
    let s: UraStep = URA_STEPS.final[0]
    for (let i = 0; i < 30 && s !== 'done'; i++) {
      seen.push(s)
      s = nextStep('final', s)
    }
    expect(seen).toEqual(['enter', 'veins', 'towaPulled', 'veins2', 'lastVein', 'heart', 'pour', 'strike', 'grabTowa', 'escape', 'exit'])
  })

  it('プレイヤーが動く段と、演出の段', () => {
    expect(isPlayStep('escort')).toBe(true)
    expect(isPlayStep('escape')).toBe(true)
    expect(isPlayStep('stab')).toBe(false)
    expect(isPlayStep('towaPulled')).toBe(false)
    expect(isPlayStep('strike')).toBe(false)
  })

  it('すじの段：veins は 2 本、veins2 は 3 本で終わる（4 本目は演出で切れる）', () => {
    expect(veinsNeeded('veins')).toBe(2)
    expect(veinsNeeded('veins2')).toBe(3)
    expect(veinsStepDone('veins', 1)).toBe(false)
    expect(veinsStepDone('veins', 2)).toBe(true)
    expect(veinsStepDone('veins2', 2)).toBe(false)
    expect(veinsStepDone('veins2', 3)).toBe(true)
    expect(veinsStepDone('heart', 4)).toBe(false)
  })
})

describe('道を守る・扉', () => {
  it('チャンダは、近くに影がいると止まる', () => {
    expect(escortCanMove([])).toBe(true)
    expect(escortCanMove([6, 9])).toBe(true)
    expect(escortCanMove([6, 3.5])).toBe(false)
    expect(escortCanMove([3.5], 3)).toBe(true)
  })

  it('道のりの割合', () => {
    expect(pathProgress(0, 0, 5)).toBe(0)
    expect(pathProgress(2, 0.5, 5)).toBeCloseTo(0.625)
    expect(pathProgress(9, 0, 5)).toBe(1)
  })

  it('扉は時間とともにせまくなり、0 にはならない。残りは 0 で止まる', () => {
    expect(doorLeft(30, 10)).toBe(20)
    expect(doorLeft(30, 40)).toBe(0)
    expect(doorWidthK(30, 30)).toBe(1)
    expect(doorWidthK(0, 30)).toBeCloseTo(0.25)
    expect(doorWidthK(15, 30)).toBeGreaterThan(doorWidthK(5, 30))
  })

  it('扉に入った・落ちた', () => {
    expect(insideDoor(0.3, 0.2, 0)).toBe(true)
    expect(insideDoor(3, 0, 0)).toBe(false)
    expect(insideDoor(0.2, 0.2, -3)).toBe(false)
    expect(fellBelow(-1.0, 0)).toBe(true)
    expect(fellBelow(-0.2, 0)).toBe(false)
  })
})

describe('目標と台詞', () => {
  it('プレイヤーが動く段には、目標の文言がある', () => {
    for (const sc of ['khmer', 'final'] as const)
      for (const s of URA_STEPS[sc]) {
        if (s === 'done') continue
        const o = uraObjective(sc, s, { left: 12.3, veinsLeft: 2 })
        expect(o, `${sc}:${s}`).not.toBeNull()
        if (isPlayStep(s)) expect(o!.title.length).toBeGreaterThan(0)
      }
    expect(uraObjective('khmer', 'escape', { left: 12.3 })!.sub).toContain('13')
    expect(uraObjective('final', 'veins', { veinsLeft: 2 })!.title).toContain('2')
  })

  it('使う台詞のキーはすべて ura_lines.json にあり、1 行は短い', () => {
    for (const k of URA_LINE_KEYS) {
      expect(L[k], k).toBeDefined()
      expect(L[k].length, k).toBeGreaterThan(0)
      for (const l of L[k]) {
        expect(l.text.length, `${k}: ${l.text}`).toBeLessThanOrEqual(50)
        expect(['ネクマックス', 'ソラ', 'トワ', 'チャンダ', 'チャンダのおばあさん']).toContain(l.speaker)
      }
    }
  })

  it('uraBattle.ts の中の this.lines(...) のキーはすべて JSON にある', () => {
    const src = readFileSync(new URL('../src/chronicle/uraBattle.ts', import.meta.url), 'utf8')
    const used = [...src.matchAll(/this\.lines\('([a-z_0-9]+)'\)/g)].map((m) => m[1])
    const tern = [...src.matchAll(/'([kf]_[a-z_0-9]+)'/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(5)
    for (const k of [...used, ...tern]) expect(L[k], k).toBeDefined()
  })

  it('物語の本文の大事な台詞がある', () => {
    const all = Object.values(L)
      .flat()
      .map((l) => l.text)
      .join('\n')
    expect(all).toContain('約束がちがう')
    expect(all).toContain('行け、ネクマックス！')
    expect(all).toContain('レンズが、もう、もたない')
    expect(all).toContain('扉が閉じる前に帰る')
    expect(all).toContain('佐伯のおばあちゃんも、こうやって、お前を守ったのか')
  })
})
