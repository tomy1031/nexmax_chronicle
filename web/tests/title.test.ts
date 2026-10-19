// タイトル画面の決まり（src/game/titleLogic.ts）。
import { describe, expect, it } from 'vitest'
import { formatSavedAt, titleActivate, titleConfirm, titleInit, titleKey } from '../src/game/titleLogic'

const keys = (s: ReturnType<typeof titleInit>, ...codes: string[]) => codes.reduce(titleKey, s)

describe('タイトル画面', () => {
  it('どのキーでもメニューへ。記録があれば「つづきから」を選んでおく', () => {
    const s = keys(titleInit(true), 'KeyQ')
    expect(s.mode).toBe('menu')
    expect(s.sel).toBe(1)
    expect(keys(titleInit(false), 'Space').sel).toBe(0)
  })

  it('記録が無いときは「つづきから」に止まらない・選べない', () => {
    const s = keys(titleInit(false), 'Enter', 'ArrowDown')
    expect(s.sel).toBe(0)
    expect(titleActivate(s, 1)).toBe(s)
    const go = keys(s, 'Enter')
    expect(go.mode).toBe('done')
    expect(go.result).toBe('new')
  })

  it('つづきから', () => {
    const s = keys(titleInit(true), 'Enter', 'Enter')
    expect(s.mode).toBe('done')
    expect(s.result).toBe('continue')
  })

  it('記録があるのに「はじめから」なら確かめる（最初は「いいえ」）', () => {
    const s = keys(titleInit(true), 'Enter', 'ArrowUp', 'Enter')
    expect(s.mode).toBe('confirm')
    expect(s.confirmSel).toBe(0)
    // いいえ → メニューへ戻る
    expect(keys(s, 'Enter').mode).toBe('menu')
    expect(keys(s, 'Escape').mode).toBe('menu')
    // はいを選んで決定
    const yes = keys(s, 'ArrowRight', 'Enter')
    expect(yes.mode).toBe('done')
    expect(yes.result).toBe('new')
    expect(titleConfirm(s, true).result).toBe('new')
  })

  it('記録の日時', () => {
    expect(formatSavedAt(new Date(2086, 9, 18, 9, 5).getTime())).toBe('10月18日 09:05')
    expect(formatSavedAt(0)).toBe('')
  })
})
