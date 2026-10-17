// 近未来 HUD の台詞ウィンドウの中身（ui/future/dialogueBoard.ts）
import { describe, expect, it } from 'vitest'
import { DialogueBoard, GHOST_MAX, breakLines, textSizeStep } from '../src/ui/future/dialogueBoard'

describe('DialogueBoard', () => {
  it('新しい台詞が大きなウィンドウに出て、時間で消える', () => {
    const b = new DialogueBoard()
    expect(b.say('源兵衛', 'こんにちは', 3, 0)).toBe('new')
    expect(b.main?.speaker).toBe('源兵衛')
    expect(b.tick(2.9)).toBe(false)
    expect(b.tick(3.0)).toBe(true)
    expect(b.main).toBeNull()
  })

  it('同時に話したら、前の台詞は小さく残る（最長 GHOST_MAX 秒）', () => {
    const b = new DialogueBoard()
    b.say('源兵衛', '歯止めは入っとる。', 6, 0)
    b.say('おはる', '舟が来たよ！', 4, 0.5)
    expect(b.main?.speaker).toBe('おはる')
    expect(b.ghost?.speaker).toBe('源兵衛')
    expect(b.ghost?.until).toBeCloseTo(0.5 + GHOST_MAX)
    b.tick(0.5 + GHOST_MAX)
    expect(b.ghost).toBeNull()
    expect(b.main?.speaker).toBe('おはる')
  })

  it('時間切れの台詞は ghost にしない', () => {
    const b = new DialogueBoard()
    b.say('源兵衛', 'A', 1, 0)
    b.say('おはる', 'B', 2, 5)
    expect(b.ghost).toBeNull()
  })

  it('同じ台詞は出し直さず、時間だけ延ばす', () => {
    const b = new DialogueBoard()
    b.say('源兵衛', 'A', 2, 0)
    const v = b.version
    expect(b.say('源兵衛', 'A', 3, 1)).toBe('extended')
    expect(b.version).toBe(v)
    expect(b.main?.until).toBeCloseTo(4)
  })

  it('ghost と同じ台詞が来たら二重に出さない', () => {
    const b = new DialogueBoard()
    b.say('源兵衛', 'A', 5, 0)
    b.say('おはる', 'B', 5, 0.2)
    b.say('源兵衛', 'A', 5, 0.4)
    expect(b.main?.text).toBe('A')
    expect(b.ghost?.text).toBe('B')
  })

  it('次に消える時刻', () => {
    const b = new DialogueBoard()
    expect(b.nextExpiry()).toBeNull()
    b.say('源兵衛', 'A', 5, 0)
    b.say('おはる', 'B', 6, 1)
    expect(b.nextExpiry()).toBeCloseTo(1 + GHOST_MAX)
  })
})

describe('textSizeStep', () => {
  it('長い台詞ほど小さい段階', () => {
    expect(textSizeStep('つかむだけやあかん。')).toBe(0)
    expect(textSizeStep('あ'.repeat(50))).toBe(1)
    expect(textSizeStep('あ'.repeat(80))).toBe(2)
  })
})

describe('breakLines', () => {
  it('1 行に収まる台詞はそのまま', () => {
    expect(breakLines('つかむだけやあかん。', 0)).toBe('つかむだけやあかん。')
  })

  it('長い台詞は文の切れ目で 2 行に分ける', () => {
    expect(breakLines('つかむだけやあかん。人が通る道は、ちゃんと残さんとな。', 0)).toBe('つかむだけやあかん。\n人が通る道は、ちゃんと残さんとな。')
  })

  it('「！？」が続くときは続きの後ろで分け、次の行の頭の空白を消す', () => {
    expect(breakLines('うちは見張り台から水路を見とくね！ 舟が来たら教えるから！', 0)).toBe('うちは見張り台から水路を見とくね！\n舟が来たら教えるから！')
  })

  it('分けても収まらないときは、そのまま（自然な折り返しに任せる）', () => {
    const t = 'あ'.repeat(30) + '。' + 'い'.repeat(5)
    expect(breakLines(t, 0)).toBe(t)
  })
})
