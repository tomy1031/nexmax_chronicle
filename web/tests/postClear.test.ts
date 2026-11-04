import { describe, expect, it } from 'vitest'
import { travelRule } from '../src/game/travel'
import { MEMORY_TRIPS, bonusLines, bonusSpeakers, bonusTalk, cleared, resetBonusTurns } from '../src/chronicle/postClear'
import { YearDialLogic } from '../src/stages/future2086/chronicle/yearDialLogic'

const flags = (...on: string[]) => (n: string) => on.includes(n)

describe('クリア後のおまけ：思い出の旅', () => {
  it('クリアしたら、わっかから 2026・1726・1186 年へ行ける（クリア前は行けない）', () => {
    for (const t of MEMORY_TRIPS) {
      expect(travelRule('2086', { to: t.to, cause: 'ido_ring' }, flags('v7_epilogue')).ok).toBe(true)
      expect(travelRule('2086', { to: t.to, cause: 'ido_ring' }, flags()).ok).toBe(false)
    }
    // わっか以外のきっかけでは行けない
    expect(travelRule('2086', { to: '1726', cause: 'ido_qr' }, flags('v7_epilogue')).ok).toBe(false)
  })

  it('クリア後は、どの時代からも帰りの光の輪で 2086 年へ帰れる', () => {
    const all = flags('v7_epilogue', 'v7_claw_stored', 'v7_dial_seen', 'v7_shrine_saved', 'v7_khmer_done')
    for (const from of ['2026', '1726', '1186'] as const) expect(travelRule(from, { to: '2086', cause: 'return' }, all).ok).toBe(true)
  })

  it('cleared はおわりにを見たときだけ', () => {
    expect(cleared(flags('v7_epilogue'))).toBe(true)
    expect(cleared(flags('v7_orm_down'))).toBe(false)
  })

  it('人ごとのおまけの話は、話すたびに次へ（最後のあとは最初から）', () => {
    resetBonusTurns()
    const a = bonusTalk('2026', 'matsui')
    const b = bonusTalk('2026', 'matsui')
    expect(a).not.toEqual(b)
    bonusTalk('2026', 'matsui')
    expect(bonusTalk('2026', 'matsui')).toEqual(a)
    expect(bonusTalk('2026', 'nobody')).toBeNull()
  })

  it('どの時代にも、着いたとき・帰るときのひとことと、話す人がいる', () => {
    expect(bonusLines('2086', 'intro').length).toBeGreaterThan(0)
    for (const era of ['2026', '1726', '1186'] as const) {
      expect(bonusLines(era, 'arrive').length).toBeGreaterThan(0)
      expect(bonusLines(era, 'leave').length).toBeGreaterThan(0)
      expect(bonusSpeakers(era).length).toBeGreaterThanOrEqual(2)
    }
    for (const era of ['2086', '2026', '1726', '1186'] as const)
      for (const who of bonusSpeakers(era)) {
        resetBonusTurns()
        const first = bonusTalk(era, who)!
        expect(first.length).toBeGreaterThan(0)
        for (const l of first) expect(l.text.length).toBeGreaterThan(0)
      }
  })
})

describe('年代ダイヤル：行ける年がいくつもあるとき', () => {
  it('回していくと、通りこす前の行ける年で止まり、そこでぴったり', () => {
    const d = new YearDialLogic({ start: 2086, target: 2026, targets: [2026, 1726, 1186] })
    for (let i = 0; i < 200; i++) d.hold(-1, 1 / 30)
    expect(d.year).toBe(2026)
    expect(d.locked).toBe(true)
    // 一度離して、また回すと、次の年（1726）で止まる
    d.hold(0, 1 / 30)
    for (let i = 0; i < 400; i++) d.hold(-1, 1 / 30)
    expect(d.year).toBe(1726)
    expect(d.locked).toBe(true)
  })

  it('指でなぞったときは、いちばん近い行ける年にすいつく', () => {
    const d = new YearDialLogic({ start: 2086, target: 2026, targets: [2026, 1726, 1186] })
    d.setYear(1190)
    expect(d.year).toBe(1186)
    expect(d.locked).toBe(true)
    d.setYear(1500)
    expect(d.locked).toBe(false)
  })
})
