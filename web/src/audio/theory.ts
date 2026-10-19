// 曲のデータ（audio/tracks.ts）を、鳴らす音の並び（イベント）に変える純粋な計算。DOM も Web Audio も使わない（tests/music.test.ts）。
// 書き方：
//   旋律   'A4:4 C5:2 r:2 F5:8 | …'  音名（C4 = 60）と長さ（16 分音符いくつ分。省略は直前と同じ）。r は休み。| は小節の区切り（16 になるか確かめる）
//   和音   ['F', 'C/E', 'Gm7 C7', …]  1 小節に 1 つ。空白で区切ると小節を等分する
//   低音   'R..O..R.R..F.O..'  1 文字 = 16 分音符。R 根音・O 1 オクターブ上・F 5 度・T 3 度・- のばす・. 休み
//   分散   '0.1.2.3.2.1.0.1.'  数字 = 和音の音を下から数えた番号（上のオクターブへ続く）・- のばす・. 休み
//   刻み   'x..x..x.x.......'  和音をまとめて短く鳴らす（x 普通・X 強く・- のばす）
//   打楽器 'x...x...x...x...'  x 普通・X 強く・. 休み（16 の倍数の長さで、くり返す）

export const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** 'C#5' → 73（C4 = 60）。読めなければ null */
export function noteToMidi(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!m) return null
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + NOTE_PC[m[1]] + acc
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function pcOf(name: string): number | null {
  const m = /^([A-G])([#b]?)$/.exec(name)
  if (!m) return null
  return (NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12
}

/** 和音の種類 → 根音からの半音の数 */
const CHORD_QUALITY: Record<string, readonly number[]> = {
  '': [0, 4, 7],
  m: [0, 3, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim: [0, 3, 6],
  dim7: [0, 3, 6, 9],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  '7sus4': [0, 5, 7, 10],
  add9: [0, 4, 7, 14],
  madd9: [0, 3, 7, 14],
  '9': [0, 4, 7, 10, 14],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
}

export type Chord = {
  /** 根音（0〜11） */
  root: number
  /** 根音からの半音の数（下から） */
  intervals: readonly number[]
  /** 低音（分数コードの / の右。無ければ根音） */
  bass: number
}

/** 'F#m7/C#' など。読めなければ例外（曲のデータの書き間違いはテストで見つける） */
export function parseChord(sym: string): Chord {
  const [head, slash] = sym.split('/')
  const m = /^([A-G][#b]?)(.*)$/.exec(head)
  if (!m) throw new Error(`和音を読めません: ${sym}`)
  const root = pcOf(m[1])
  const intervals = CHORD_QUALITY[m[2]]
  if (root === null || !intervals) throw new Error(`和音を読めません: ${sym}`)
  const bass = slash ? pcOf(slash) : root
  if (bass === null) throw new Error(`和音の低音を読めません: ${sym}`)
  return { root, intervals, bass }
}

/** 和音の音の高さの組（0〜11） */
export function chordPcs(c: Chord): Set<number> {
  return new Set(c.intervals.map((i) => (c.root + i) % 12))
}

/** lo 以上で、和音の音を低い順に count 個（上のオクターブへ続く） */
export function chordLadder(c: Chord, lo: number, count: number): number[] {
  const pcs = [...chordPcs(c)].sort((a, b) => a - b)
  const out: number[] = []
  for (let m = lo; out.length < count && m < lo + 60; m++) if (pcs.includes(((m % 12) + 12) % 12)) out.push(m)
  return out
}

/** パッドの音の並べ方：lo から 1 オクターブの中に和音の音をすべて置く（隣の和音との動きが小さくなる） */
export function chordVoicing(c: Chord, lo: number): number[] {
  return chordLadder(c, lo, chordPcs(c).size)
}

/** 根音・低音の高さ（lo 以上でいちばん低い） */
export function bassNote(pc: number, lo: number): number {
  let m = lo
  while (((m % 12) + 12) % 12 !== pc) m++
  return m
}

/** 調の音（'D major' 'A minor' 'D yo' など）。テストで旋律の書き間違いを見つけるのに使う */
const SCALE_STEPS: Record<string, readonly number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  yo: [0, 2, 5, 7, 9],
  pentatonic: [0, 2, 4, 7, 9],
  minpent: [0, 3, 5, 7, 10],
}

export function scalePcs(key: string): Set<number> {
  const [tonic, kind] = key.split(' ')
  const t = pcOf(tonic)
  const steps = SCALE_STEPS[kind]
  if (t === null || !steps) throw new Error(`調を読めません: ${key}`)
  return new Set(steps.map((s) => (t + s) % 12))
}

// ---------------------------------------------------------------- 曲のデータ

export type InstrumentId =
  | 'pad'
  | 'strings'
  | 'choir'
  | 'organ'
  | 'ep'
  | 'musicbox'
  | 'bell'
  | 'vibes'
  | 'pluck'
  | 'shamisen'
  | 'koto'
  | 'roneat'
  | 'gong'
  | 'sralai'
  | 'lead'
  | 'theremin'
  | 'flute'
  | 'brass'
  | 'bass'
  | 'synthbass'
  | 'subbass'

export type DrumId = 'kick' | 'snare' | 'clap' | 'hat' | 'ohat' | 'shaker' | 'taiko' | 'shime' | 'kane' | 'chhing' | 'tom' | 'crash' | 'rim'

type PartBase = {
  /** 音量（0〜1） */
  gain: number
  /** 左右（-1〜1） */
  pan?: number
  /** 響き（リバーブ）に送る量（0〜1） */
  rev?: number
  /** やまびこ（ディレイ）に送る量（0〜1） */
  dly?: number
  /** 小節ごとに鳴らすか（'1'/'0' をくり返す。省略はずっと鳴らす） */
  on?: string
}

export type Part =
  | (PartBase & { kind: 'melody'; inst: InstrumentId; notes: string; oct?: number })
  | (PartBase & { kind: 'pad'; inst: InstrumentId; lo: number })
  | (PartBase & { kind: 'comp'; inst: InstrumentId; lo: number; pattern: string })
  | (PartBase & { kind: 'arp'; inst: InstrumentId; lo: number; pattern: string })
  | (PartBase & { kind: 'bass'; inst: InstrumentId; lo: number; pattern: string })
  | (PartBase & { kind: 'drum'; drum: DrumId; pattern: string })

export type Track = {
  title: string
  bpm: number
  /** 裏の 16 分音符を遅らせる割合（0〜0.5） */
  swing?: number
  /** 調（テスト用） */
  key: string
  /** 1 小節に 1 つ。この数が曲の小節数 */
  chords: readonly string[]
  parts: readonly Part[]
}

export type NoteEvent = {
  /** 曲の頭からの 16 分音符の位置 */
  step: number
  /** 長さ（16 分音符いくつ分） */
  len: number
  part: number
  /** 音の高さ（打楽器は 0） */
  midi: number
  /** 強さ（0〜1） */
  vel: number
}

export type CompiledTrack = {
  track: Track
  bars: number
  loopSteps: number
  /** 16 分音符 1 つの秒数 */
  stepSec: number
  /** step の順 */
  events: NoteEvent[]
  /** step ごとの和音（16 分音符ごと） */
  chordAt(step: number): Chord
}

export const STEPS_PER_BAR = 16

/** 旋律を読む。小節の区切り（|）ごとに 16 になっているか確かめる */
export function parseMelody(src: string, oct = 0): Array<{ step: number; len: number; midi: number | null }> {
  const out: Array<{ step: number; len: number; midi: number | null }> = []
  let step = 0
  let barStart = 0
  let len = 2
  let bar = 1
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') {
      if (step - barStart !== STEPS_PER_BAR) throw new Error(`旋律の ${bar} 小節目が ${step - barStart}（16 ではない）: ${src.slice(0, 40)}…`)
      barStart = step
      bar++
      continue
    }
    const [name, l] = tok.split(':')
    if (l !== undefined) {
      len = Number(l)
      if (!Number.isInteger(len) || len <= 0) throw new Error(`長さを読めません: ${tok}`)
    }
    if (name === 'r') out.push({ step, len, midi: null })
    else {
      const m = noteToMidi(name)
      if (m === null) throw new Error(`音名を読めません: ${tok}`)
      out.push({ step, len, midi: m + oct * 12 })
    }
    step += len
  }
  if (step - barStart !== STEPS_PER_BAR) throw new Error(`旋律の ${bar} 小節目が ${step - barStart}（16 ではない）: ${src.slice(0, 40)}…`)
  return out
}

/** 1 文字 = 16 分音符の型。- は直前の音をのばす。返すのは [位置, 長さ, 文字] */
export function parsePattern(p: string): Array<{ step: number; len: number; ch: string }> {
  const out: Array<{ step: number; len: number; ch: string }> = []
  for (let i = 0; i < p.length; i++) {
    const ch = p[i]
    if (ch === '.' || ch === ' ') continue
    if (ch === '-') {
      const last = out[out.length - 1]
      if (last && last.step + last.len === i) last.len++
      continue
    }
    out.push({ step: i, len: 1, ch })
  }
  return out
}

function barOn(mask: string | undefined, bar: number): boolean {
  if (!mask) return true
  return mask[bar % mask.length] !== '0'
}

/** 曲を鳴らす音の並びにする */
export function compileTrack(track: Track): CompiledTrack {
  const bars = track.chords.length
  const loopSteps = bars * STEPS_PER_BAR
  // 16 分音符ごとの和音
  const chordSteps: Chord[] = []
  for (const bar of track.chords) {
    const syms = bar.trim().split(/\s+/)
    if (STEPS_PER_BAR % syms.length !== 0) throw new Error(`1 小節を等分できません: ${bar}`)
    const each = STEPS_PER_BAR / syms.length
    for (const s of syms) {
      const c = parseChord(s)
      for (let i = 0; i < each; i++) chordSteps.push(c)
    }
  }
  const chordAt = (step: number) => chordSteps[((step % loopSteps) + loopSteps) % loopSteps]
  const events: NoteEvent[] = []
  track.parts.forEach((part, pi) => {
    const push = (step: number, len: number, midi: number, vel: number) => {
      if (step >= loopSteps) return
      if (!barOn(part.on, Math.floor(step / STEPS_PER_BAR))) return
      events.push({ step, len: Math.min(len, loopSteps - step), part: pi, midi, vel })
    }
    switch (part.kind) {
      case 'melody': {
        const notes = parseMelody(part.notes, part.oct ?? 0)
        const total = notes.length ? notes[notes.length - 1].step + notes[notes.length - 1].len : 0
        if (total % loopSteps !== 0 && loopSteps % total !== 0) throw new Error(`旋律の長さ ${total} が曲（${loopSteps}）と合いません`)
        for (let rep = 0; rep * total < loopSteps; rep++) for (const n of notes) if (n.midi !== null) push(rep * total + n.step, n.len, n.midi, 0.8)
        break
      }
      case 'pad': {
        // 和音が変わるところと小節の頭で区切って、のばす
        let start = 0
        for (let s = 1; s <= loopSteps; s++) {
          if (s < loopSteps && chordSteps[s] === chordSteps[start] && s % STEPS_PER_BAR !== 0) continue
          for (const m of chordVoicing(chordSteps[start], part.lo)) push(start, s - start, m, 0.6)
          start = s
        }
        break
      }
      case 'comp':
      case 'arp':
      case 'bass': {
        if (part.pattern.length % STEPS_PER_BAR !== 0) throw new Error(`型の長さが 16 の倍数ではありません: ${part.pattern}`)
        const hits = parsePattern(part.pattern)
        const plen = part.pattern.length
        for (let base = 0; base < loopSteps; base += plen) {
          for (const h of hits) {
            const step = base + h.step
            const c = chordAt(step)
            if (part.kind === 'comp') {
              const vel = h.ch === 'X' ? 0.9 : 0.65
              for (const m of chordVoicing(c, part.lo)) push(step, h.len, m, vel)
            } else if (part.kind === 'arp') {
              const idx = Number(h.ch)
              if (!Number.isInteger(idx)) throw new Error(`分散の型を読めません: ${part.pattern}`)
              const ladder = chordLadder(c, part.lo, idx + 1)
              push(step, h.len, ladder[idx], 0.6)
            } else {
              const root = bassNote(c.bass, part.lo)
              const tone = bassNote(c.root, part.lo)
              const third = bassNote((c.root + c.intervals[1]) % 12, tone)
              const fifth = bassNote((c.root + 7) % 12, tone)
              const midi = h.ch === 'R' ? root : h.ch === 'O' ? root + 12 : h.ch === 'F' ? fifth : h.ch === 'T' ? third : NaN
              if (Number.isNaN(midi)) throw new Error(`低音の型を読めません: ${part.pattern}`)
              push(step, h.len, midi, h.ch === 'R' ? 0.85 : 0.7)
            }
          }
        }
        break
      }
      case 'drum': {
        if (part.pattern.length % STEPS_PER_BAR !== 0) throw new Error(`打楽器の型の長さが 16 の倍数ではありません: ${part.pattern}`)
        const plen = part.pattern.length
        for (let base = 0; base < loopSteps; base += plen) {
          for (let i = 0; i < plen; i++) {
            const ch = part.pattern[i]
            if (ch === 'x' || ch === 'X') push(base + i, 1, 0, ch === 'X' ? 1 : 0.7)
          }
        }
        break
      }
    }
  })
  events.sort((a, b) => a.step - b.step || a.part - b.part)
  return { track, bars, loopSteps, stepSec: 60 / track.bpm / 4, events, chordAt }
}

/** 揺れ（スウィング）を入れた、曲の頭からの秒 */
export function stepTime(c: CompiledTrack, step: number): number {
  const swing = c.track.swing ?? 0
  return step * c.stepSec + (step % 2 === 1 ? swing * c.stepSec : 0)
}
