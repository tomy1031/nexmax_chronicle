import { describe, expect, it } from 'vitest'
import { TalkLogStore } from '../src/ui/future/talkLog'

describe('会話のきろく（ログ）', () => {
  it('出たセリフを順にためる。同じセリフが続けて来たら 1 つ', () => {
    const s = new TalkLogStore()
    s.push('ソラ', 'おはよう！')
    s.push('ソラ', 'おはよう！')
    s.push('ネクマックス', 'おはよう、ソラ。')
    expect(s.entries.map((e) => e.text)).toEqual(['おはよう！', 'おはよう、ソラ。'])
  })

  it('いっぱいになったら古いものから捨てる', () => {
    const s = new TalkLogStore(3)
    for (let i = 0; i < 5; i++) s.push('ソラ', `${i}`)
    expect(s.entries.map((e) => e.text)).toEqual(['2', '3', '4'])
  })
})
