// 音楽（src/audio/theory.ts・tracks.ts・musicDirector.ts）：音名と和音の読み方、曲のデータの書き間違い、曲の選び方。
import { describe, expect, it } from 'vitest'
import { chordPcs, compileTrack, noteToMidi, parseChord, parseMelody, parsePattern, scalePcs, STEPS_PER_BAR } from '../src/audio/theory'
import { STAGE_MUSIC, TRACKS, type MusicId } from '../src/audio/tracks'
import { BATTLE_HOLD, MusicDirector } from '../src/audio/musicDirector'

describe('音名と和音', () => {
  it('音名を MIDI の番号にする（C4 = 60）', () => {
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('A4')).toBe(69)
    expect(noteToMidi('C#5')).toBe(73)
    expect(noteToMidi('Bb3')).toBe(58)
    expect(noteToMidi('H2')).toBeNull()
  })

  it('和音の種類と分数コード', () => {
    expect([...chordPcs(parseChord('F#m7'))].sort((a, b) => a - b)).toEqual([1, 4, 6, 9])
    const c = parseChord('C/E')
    expect(c.root).toBe(0)
    expect(c.bass).toBe(4)
    expect([...chordPcs(parseChord('Gm7/C'))].sort((a, b) => a - b)).toEqual([2, 5, 7, 10])
    expect(() => parseChord('Xm')).toThrow()
    expect(() => parseChord('Cfoo')).toThrow()
  })

  it('旋律の小節が 16 にならないと知らせる', () => {
    expect(parseMelody('C5:8 D5:8 | E5:16')).toHaveLength(3)
    expect(() => parseMelody('C5:8 D5:4 | E5:16')).toThrow(/1 小節目/)
    expect(() => parseMelody('C5:16 | E5:12')).toThrow(/2 小節目/)
  })

  it('型の - は前の音をのばす', () => {
    expect(parsePattern('R-..O...')).toEqual([
      { step: 0, len: 2, ch: 'R' },
      { step: 4, len: 1, ch: 'O' },
    ])
  })
})

describe('曲のデータ', () => {
  const ids = Object.keys(TRACKS) as MusicId[]

  it.each(ids)('%s：読めて、くり返しの中に収まる', (id) => {
    const t = TRACKS[id]
    const c = compileTrack(t)
    expect([8, 16]).toContain(c.bars)
    expect(c.loopSteps).toBe(c.bars * STEPS_PER_BAR)
    // パートごとに 1 音は鳴る
    for (let p = 0; p < t.parts.length; p++) expect(c.events.some((e) => e.part === p), `${id} part ${p}`).toBe(true)
    for (const e of c.events) {
      expect(e.step).toBeGreaterThanOrEqual(0)
      expect(e.step + e.len).toBeLessThanOrEqual(c.loopSteps)
      if (t.parts[e.part].kind !== 'drum') {
        // スマホのスピーカーでも聞こえる高さ・耳に痛くない高さ
        expect(e.midi, `${id} part ${e.part} step ${e.step}`).toBeGreaterThanOrEqual(36)
        expect(e.midi, `${id} part ${e.part} step ${e.step}`).toBeLessThanOrEqual(91)
      }
    }
  })

  it.each(ids)('%s：旋律は調の音か、そのときの和音の音だけ', (id) => {
    const t = TRACKS[id]
    const c = compileTrack(t)
    const scale = scalePcs(t.key)
    for (const e of c.events) {
      if (t.parts[e.part].kind !== 'melody') continue
      const pc = e.midi % 12
      const ok = scale.has(pc) || chordPcs(c.chordAt(e.step)).has(pc)
      expect(ok, `${id} 小節 ${Math.floor(e.step / 16) + 1} の ${e.midi}`).toBe(true)
    }
  })

  it('時代ごとの曲がある', () => {
    for (const k of ['1726', '1970', '2026', '2086'] as const) expect(TRACKS[STAGE_MUSIC[k]]).toBeTruthy()
  })
})

describe('曲の選び方', () => {
  const calm = { place: 'expo1970' as const, boss: false, inCombat: false, travelling: false }

  it('敵が来たら戦闘の曲、離れてもしばらくはそのまま', () => {
    const d = new MusicDirector()
    expect(d.pick(0.1, calm)).toBe('expo1970')
    expect(d.pick(0.1, { ...calm, inCombat: true })).toBe('battle')
    expect(d.pick(BATTLE_HOLD - 0.5, calm)).toBe('battle')
    expect(d.pick(1, calm)).toBe('expo1970')
  })

  it('ボスの間は番人の曲、倒したらすぐ場所の曲', () => {
    const d = new MusicDirector()
    expect(d.pick(0.1, { ...calm, boss: true, inCombat: true })).toBe('boss')
    expect(d.pick(0.1, calm)).toBe('expo1970')
  })

  it('時空移動の間は鳴らさない', () => {
    const d = new MusicDirector()
    d.pick(0.1, { ...calm, inCombat: true })
    expect(d.pick(0.1, { ...calm, travelling: true })).toBeNull()
    expect(d.pick(0.1, { ...calm, place: 'future2086' })).toBe('future2086')
  })

  it('戦いに入るときは速く、戻るときはゆっくり切り替える', () => {
    expect(MusicDirector.fadeFor('expo1970', 'battle')).toBeLessThan(MusicDirector.fadeFor('battle', 'expo1970'))
  })
})
