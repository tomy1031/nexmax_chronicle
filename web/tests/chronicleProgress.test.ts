// 物語 v7 の進み具合（chronicle/progress.ts）と、v7 の時空移動の道（game/travel.ts）
import { describe, expect, it } from 'vitest'
import { CHAPTER_ERA, CHAPTER_TITLES, LIGHT_SPENDERS, LIGHTS_TOTAL, V7_FLAGS, chapterOf, dayCount, lightsLeft, riftClawUnlocked, v7Started } from '../src/chronicle/progress'
import { STORY_BOOL_FLAGS, StoryState } from '../src/core/storyFlags'
import { travelRule } from '../src/game/travel'

const flags = (...on: string[]) => (name: string) => on.includes(name)

describe('光のつぶ', () => {
  it('はじめは 7 つ。巻き戻し 3・帰還 3・最後の一撃 1 で 0 になる', () => {
    expect(lightsLeft(flags())).toBe(LIGHTS_TOTAL)
    expect(LIGHT_SPENDERS.length).toBe(7)
    expect(lightsLeft(flags('v7_rewind1'))).toBe(6)
    expect(lightsLeft(flags('v7_rewind1', 'v7_rewind2', 'v7_rewind3'))).toBe(4)
    expect(lightsLeft(flags('v7_rewind1', 'v7_rewind2', 'v7_rewind3', 'v7_back1'))).toBe(3)
    expect(lightsLeft(flags('v7_rewind1', 'v7_rewind2', 'v7_rewind3', 'v7_back1', 'v7_back2', 'v7_back3'))).toBe(1)
    expect(lightsLeft(flags(...LIGHT_SPENDERS))).toBe(0)
  })

  it('何度目の 10月18日：巻き戻しの数 ＋ 1', () => {
    expect(dayCount(flags())).toBe(1)
    expect(dayCount(flags('v7_rewind1'))).toBe(2)
    expect(dayCount(flags('v7_rewind1', 'v7_rewind2', 'v7_rewind3', 'v7_back1'))).toBe(4)
  })
})

describe('章', () => {
  it('章のとびらは、その章の時代に着いてから出す（前の時代の終わりで章が進んでも）', () => {
    expect(CHAPTER_ERA[6]).toBe('2026')
    expect(CHAPTER_ERA[7]).toBe('1726')
    expect(CHAPTER_ERA[9]).toBe('2026')
    expect(CHAPTER_ERA[11]).toBe('1186')
    for (const c of [0, 1, 2, 3, 4, 5, 8, 10, 12, 13] as const) expect(CHAPTER_ERA[c]).toBe('2086')
  })
  it('フラグだけから章が決まる（物語の順）', () => {
    expect(chapterOf(flags())).toBe(0)
    expect(chapterOf(flags('v7_prologue_seen'))).toBe(1)
    expect(chapterOf(flags('v7_promise'))).toBe(2)
    expect(chapterOf(flags('v7_rewind1'))).toBe(3)
    expect(chapterOf(flags('v7_loop_seen'))).toBe(4)
    expect(chapterOf(flags('v7_rewind3'))).toBe(5)
    expect(chapterOf(flags('v7_door1'))).toBe(6)
    expect(chapterOf(flags('v7_search_done'))).toBe(7)
    expect(chapterOf(flags('v7_back1'))).toBe(8)
    expect(chapterOf(flags('v7_dial_seen'))).toBe(9)
    expect(chapterOf(flags('v7_back2'))).toBe(10)
    expect(chapterOf(flags('v7_towa_duel'))).toBe(11)
    expect(chapterOf(flags('v7_back3'))).toBe(12)
    expect(chapterOf(flags('v7_ending'))).toBe(13)
    for (let c = 0; c <= 13; c++) expect(CHAPTER_TITLES[c as keyof typeof CHAPTER_TITLES]).toBeTruthy()
  })

  it('時空裂きは 10章の箱から。v7 を始めたかどうか', () => {
    expect(riftClawUnlocked(flags())).toBe(false)
    expect(riftClawUnlocked(flags('v7_rift_claw'))).toBe(true)
    expect(v7Started(flags('met_matsui'))).toBe(false)
    expect(v7Started(flags('v7_prologue_seen'))).toBe(true)
  })

  it('v7 のフラグはすべて StoryState に登録されていて、保存して戻せる', () => {
    for (const f of V7_FLAGS) expect(STORY_BOOL_FLAGS).toContain(f)
    const s = new StoryState()
    s.set('v7_rewind2', true)
    s.set('v7_rift_claw', true)
    const t = new StoryState()
    t.fromJSON(JSON.parse(JSON.stringify(s.toJSON())))
    expect(t.get('v7_rewind2')).toBe(true)
    expect(t.get('v7_rift_claw')).toBe(true)
    expect(t.get('v7_back1')).toBe(false)
  })
})

describe('v7 の時空移動（石の力だけで渡る）', () => {
  it('5章：ソラに話したあと、わっかの 60 年前の記録で 2026年へ', () => {
    expect(travelRule('2086', { to: '2026', cause: 'ido_ring' }, flags()).ok).toBe(false)
    expect(travelRule('2086', { to: '2026', cause: 'ido_ring' }, flags('v7_confided')).ok).toBe(true)
  })

  it('6章：IDO 検索のあと、路地のかんばんから 1726年へ', () => {
    expect(travelRule('2026', { to: '1726', cause: 'ido_kanban' }, flags()).ok).toBe(false)
    expect(travelRule('2026', { to: '1726', cause: 'ido_kanban' }, flags('v7_search_done')).ok).toBe(true)
  })

  it('7章：爪をほこらにおさめたら、夜明けに 2086年へ帰る', () => {
    expect(travelRule('1726', { to: '2086', cause: 'return' }, flags('v7_search_done')).ok).toBe(false)
    expect(travelRule('1726', { to: '2086', cause: 'return' }, flags('v7_claw_stored')).ok).toBe(true)
    expect(travelRule('1726', { to: '2086', cause: 'ido_ring' }, flags('v7_claw_stored')).ok).toBe(false)
  })

  it('8章：年代ダイヤルで、自分でえらんで 2026年へ。9章：ほこらを守ったら帰る', () => {
    const f8 = ['v7_confided', 'v7_back1', 'v7_dial_seen']
    expect(travelRule('2086', { to: '2026', cause: 'ido_ring' }, flags('v7_confided', 'v7_back1')).ok).toBe(false)
    expect(travelRule('2086', { to: '2026', cause: 'ido_ring' }, flags(...f8)).ok).toBe(true)
    expect(travelRule('2026', { to: '2086', cause: 'return' }, flags(...f8)).ok).toBe(false)
    expect(travelRule('2026', { to: '2086', cause: 'return' }, flags(...f8, 'v7_shrine_saved')).ok).toBe(true)
    // 帰ったあとは、もう 2026年へは行かない
    expect(travelRule('2086', { to: '2026', cause: 'ido_ring' }, flags(...f8, 'v7_back2')).ok).toBe(false)
  })

  it('10章のあと：トワとの決闘のあと、1186年へ。11章：アルンの最後の光を見とどけたら帰る', () => {
    expect(travelRule('2086', { to: '1186', cause: 'ido_ring' }, flags('v7_back2')).ok).toBe(false)
    expect(travelRule('2086', { to: '1186', cause: 'ido_ring' }, flags('v7_towa_duel')).ok).toBe(true)
    expect(travelRule('2086', { to: '1186', cause: 'return' }, flags('v7_towa_duel')).ok).toBe(false)
    expect(travelRule('1186', { to: '2086', cause: 'return' }, flags('v7_towa_duel')).ok).toBe(false)
    expect(travelRule('1186', { to: '2086', cause: 'return' }, flags('v7_khmer_done')).ok).toBe(true)
  })

  it('旧版の道はそのまま（2086→2026 の IDO 展示、絵図のあとの帰還）', () => {
    expect(travelRule('2086', { to: '2026', cause: 'ido_exhibit' }, flags()).ok).toBe(true)
    expect(travelRule('2026', { to: '2086', cause: 'return' }, flags('drawing_confirmed')).ok).toBe(true)
  })
})

describe('大きな章（とびらを出す区切り）', () => {
  it('12 の小さな章を、はじめに・5 つの章・おわりにへ、順番どおりにまとめる', async () => {
    const { BIG_CHAPTER, bigChapterLabel, sceneTitle } = await import('../src/chronicle/progress')
    const list = Array.from({ length: 14 }, (_, i) => BIG_CHAPTER[i as keyof typeof BIG_CHAPTER])
    expect(list).toEqual([0, 1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 4, 5, 6])
    expect(bigChapterLabel(1)).toBe('第 1 章')
    expect(bigChapterLabel(0)).toBe('はじめに')
    expect(sceneTitle(2)).toBe('空のひび')
  })
})
