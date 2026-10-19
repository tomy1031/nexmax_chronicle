// 曲のデータ（すべてこのゲームのための書き下ろし）。書き方は audio/theory.ts の頭のとおり。
// 曲ごとに 8 小節か 16 小節をくり返す。旋律は調の音か、そのとき鳴っている和音の音だけを使う（tests/music.test.ts で確かめる）。
import type { Track } from './theory'

export type MusicId = 'title' | 'future2086' | 'night2086' | 'present2026' | 'expo1970' | 'edo1726' | 'ruins2028' | 'khmer' | 'battle' | 'boss'

/** bars 小節ごとに 1 回だけ鳴らす打楽器の型（頭に x） */
function every(bars: number): string {
  return 'x' + '.'.repeat(bars * 16 - 1)
}

/** bars 小節の最後の小節だけ、lastBar の型で鳴らす（おかず） */
function lastBar(bars: number, last: string): string {
  return '.'.repeat((bars - 1) * 16) + last
}

export const TRACKS: Readonly<Record<MusicId, Track>> = {
  // タイトル「はじまりの未来」：夜明け（アルン）の主題。5・1・2・3 と上がっていく頭の 4 音が、物語の約束の動機
  title: {
    title: 'はじまりの未来',
    bpm: 76,
    key: 'F major',
    chords: ['F', 'C/E', 'Dm7', 'Bbmaj7', 'F/A', 'Gm7', 'Gm7/C', 'C', 'Dm', 'Am7', 'Bbmaj7', 'F/A', 'Gm7', 'F/A', 'Bbmaj7', 'Csus4 C'],
    parts: [
      { kind: 'pad', inst: 'strings', lo: 53, gain: 0.5, rev: 0.5 },
      {
        kind: 'melody',
        inst: 'musicbox',
        gain: 0.9,
        pan: 0.1,
        rev: 0.45,
        dly: 0.22,
        notes:
          'r:4 C5:2 F5:2 G5:2 A5:6 | G5:4 E5:4 C5:8 | r:2 D5:2 F5:2 A5:2 C6:4 A5:4 | Bb5:6 A5:2 F5:8 | r:4 C5:2 F5:2 G5:2 A5:4 C6:2 | Bb5:6 A5:2 G5:4 F5:4 | G5:4 F5:4 D5:4 F5:4 | G5:4 E5:12 | ' +
          'r:2 A4:2 D5:2 E5:2 F5:4 E5:2 D5:2 | C5:4 E5:4 G5:8 | F5:2 G5:2 A5:2 Bb5:2 D6:4 C6:4 | A5:12 r:4 | Bb5:4 A5:4 G5:4 D5:4 | C5:4 F5:4 A5:8 | D6:6 C6:2 Bb5:4 A5:4 | G5:8 r:8',
      },
      { kind: 'arp', inst: 'ep', lo: 53, pattern: '0.2.1.3.2.4.3.1.', gain: 0.42, pan: -0.2, rev: 0.3 },
      { kind: 'bass', inst: 'bass', lo: 36, pattern: 'R-----------F---', gain: 0.62 },
      { kind: 'drum', drum: 'kick', pattern: 'x.......x.......', gain: 0.4, on: '0000000011111111' },
      { kind: 'drum', drum: 'shaker', pattern: '..x...x...x...x.', gain: 0.5, pan: 0.3, on: '0000000011111111' },
    ],
  },

  // 2086年 ナンバタウン「時代博覧祭の朝」：明るいシンセポップ。祭りの朝のわくわく
  future2086: {
    title: '時代博覧祭の朝',
    bpm: 118,
    key: 'D major',
    chords: ['D', 'A/C#', 'Bm7', 'Gmaj7', 'D/F#', 'G', 'Em7', 'Asus4 A', 'G', 'A', 'F#m7', 'Bm7', 'Em7', 'A', 'Gmaj7', 'A'],
    parts: [
      { kind: 'pad', inst: 'pad', lo: 57, gain: 0.42, rev: 0.4 },
      { kind: 'arp', inst: 'pluck', lo: 62, pattern: '0121312101213121', gain: 0.5, pan: 0.25, dly: 0.3 },
      { kind: 'bass', inst: 'synthbass', lo: 38, pattern: 'R.O.R.O.R.O.R.O.', gain: 0.75 },
      { kind: 'drum', drum: 'kick', pattern: 'x...x...x...x...', gain: 0.78 },
      { kind: 'drum', drum: 'clap', pattern: '....x.......x...', gain: 0.5, rev: 0.2 },
      { kind: 'drum', drum: 'hat', pattern: '..x...x...x...x.', gain: 0.6, pan: 0.2 },
      { kind: 'drum', drum: 'shaker', pattern: 'x.xxx.xxx.xxx.xx', gain: 0.3, pan: -0.3 },
      { kind: 'drum', drum: 'crash', pattern: every(8), gain: 0.45, rev: 0.3 },
      {
        kind: 'melody',
        inst: 'lead',
        oct: -1,
        gain: 0.72,
        rev: 0.3,
        dly: 0.2,
        notes:
          'F#5:3 A5:3 D6:2 r:2 A5:2 F#5:2 A5:2 | E5:4 C#5:2 E5:2 A5:6 r:2 | D5:3 F#5:3 B5:2 r:2 A5:2 F#5:2 D5:2 | F#5:6 G5:2 B5:4 A5:4 | F#5:3 A5:3 D6:2 r:2 E6:2 D6:2 A5:2 | B5:4 G5:2 B5:2 D6:6 r:2 | B5:3 A5:3 G5:2 E5:4 G5:4 | D6:8 C#6:4 A5:4 | ' +
          'B5:2 B5:2 A5:2 B5:4 D6:2 B5:4 | C#6:2 C#6:2 B5:2 C#6:4 E6:2 C#6:4 | A5:4 F#5:4 C#6:4 A5:4 | D6:6 C#6:2 B5:4 F#5:4 | G5:3 B5:3 E6:2 r:2 D6:2 B5:2 G5:2 | A5:3 C#6:3 E6:2 r:2 D6:2 C#6:2 B5:2 | B5:4 A5:4 F#5:4 G5:4 | A5:12 r:4',
      },
    ],
  },

  // 2086年 夜「夜空の裂け目」：空が割れる夜。低い脈と、遠くで鳴る鐘
  night2086: {
    title: '夜空の裂け目',
    bpm: 84,
    key: 'D minor',
    chords: ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Bb', 'Eb', 'A'],
    parts: [
      { kind: 'pad', inst: 'choir', lo: 50, gain: 0.55, rev: 0.6 },
      { kind: 'bass', inst: 'synthbass', lo: 38, pattern: 'R.R.R.R.R.R.R.R.', gain: 0.55 },
      { kind: 'arp', inst: 'pluck', lo: 62, pattern: '0.0.1.0.2.0.1.0.', gain: 0.25, dly: 0.35, on: '00001111' },
      { kind: 'drum', drum: 'kick', pattern: 'x..x............', gain: 0.7 },
      { kind: 'drum', drum: 'tom', pattern: lastBar(4, '........x...x.x.'), gain: 0.4, rev: 0.4 },
      { kind: 'melody', inst: 'bell', gain: 0.6, rev: 0.6, dly: 0.35, notes: 'A5:4 r:4 F5:4 r:4 | D6:8 r:8 | Bb5:4 r:4 G5:4 r:4 | C#6:8 r:4 E5:4 | A5:4 r:4 F5:4 r:4 | D6:4 F6:4 r:8 | G5:4 Bb5:4 Eb6:8 | C#6:12 r:4' },
    ],
  },

  // 2026年 大阪・なんば「なんばの今」：電気ピアノのシティポップ。少し跳ねるリズム
  present2026: {
    title: 'なんばの今',
    bpm: 94,
    swing: 0.14,
    key: 'C major',
    chords: ['Fmaj7', 'E7', 'Am7', 'Gm7 C7', 'Fmaj7', 'E7', 'Am7 D7', 'Dm7 G7', 'Dm7', 'G7', 'Em7', 'Am7', 'Dm7', 'G7', 'Cmaj7', 'E7'],
    parts: [
      { kind: 'comp', inst: 'ep', lo: 52, pattern: 'x-....x-..x-....', gain: 0.5, pan: -0.15, rev: 0.35 },
      { kind: 'pad', inst: 'pad', lo: 55, gain: 0.25, rev: 0.4 },
      { kind: 'bass', inst: 'bass', lo: 36, pattern: 'R-...RO.R-..F.O.', gain: 0.72 },
      { kind: 'drum', drum: 'kick', pattern: 'x......x..x.....', gain: 0.7 },
      { kind: 'drum', drum: 'snare', pattern: '....x.......x...', gain: 0.5, rev: 0.15 },
      { kind: 'drum', drum: 'hat', pattern: 'x.x.x.xxx.x.x.xx', gain: 0.4, pan: 0.2 },
      {
        kind: 'melody',
        inst: 'lead',
        gain: 0.55,
        rev: 0.3,
        dly: 0.25,
        notes:
          'r:2 A4:2 C5:2 E5:2 G5:6 E5:2 | G#5:6 E5:2 D5:4 B4:4 | C5:4 E5:2 G5:2 A5:8 | Bb5:4 A5:2 G5:2 E5:4 G5:4 | A5:6 G5:2 E5:4 C5:4 | D5:4 B4:2 G#4:2 B4:8 | C5:4 E5:4 F#5:4 A5:4 | F5:6 E5:2 D5:4 B4:4 | ' +
          'r:2 D5:2 F5:2 A5:2 C6:6 A5:2 | B5:6 A5:2 G5:4 F5:4 | E5:4 G5:2 B5:2 D6:8 | C6:6 B5:2 A5:4 G5:4 | F5:4 A5:4 C6:4 A5:4 | B5:4 G5:4 F5:4 D5:4 | E5:6 G5:2 B5:8 | G#5:12 r:4',
      },
    ],
  },

  // 1970年 万国博覧会「進歩と調和のパビリオン」：70 年代の未来の音。ヴィブラフォンとオルガン、後半はテルミン
  expo1970: {
    title: '進歩と調和のパビリオン',
    bpm: 120,
    swing: 0.06,
    key: 'F major',
    chords: ['Bbmaj7', 'Am7 D7', 'Gm7', 'C7', 'Fmaj7', 'Dm7', 'Gm7 C7', 'Fmaj7', 'Dm7', 'G7', 'Cm7 F7', 'Bbmaj7', 'Bbm7 Eb7', 'Am7 D7', 'Gm7 C7', 'F'],
    parts: [
      { kind: 'pad', inst: 'organ', lo: 53, gain: 0.32, rev: 0.2 },
      { kind: 'comp', inst: 'brass', lo: 58, pattern: '......x...x..x..', gain: 0.42, pan: -0.2, rev: 0.2 },
      { kind: 'bass', inst: 'bass', lo: 41, pattern: 'R..O..R.R..F.O..', gain: 0.8 },
      { kind: 'drum', drum: 'kick', pattern: 'x.....x...x.....', gain: 0.72 },
      { kind: 'drum', drum: 'snare', pattern: '....x.......x...', gain: 0.5, rev: 0.15 },
      { kind: 'drum', drum: 'hat', pattern: 'xxxxxxxxxxxxxx.x', gain: 0.3, pan: 0.25 },
      { kind: 'drum', drum: 'ohat', pattern: '..............x.', gain: 0.35, pan: 0.25 },
      ...(['vibes', 'theremin'] as const).map((inst) => ({
        kind: 'melody' as const,
        inst,
        gain: inst === 'vibes' ? 0.85 : 0.68,
        pan: inst === 'vibes' ? 0.15 : 0,
        rev: inst === 'vibes' ? 0.35 : 0.45,
        dly: inst === 'vibes' ? 0 : 0.2,
        on: inst === 'vibes' ? '1111111100000000' : '0000000011111111',
        notes:
          'D5:2 F5:2 A5:3 F5:3 D5:2 C5:4 | C5:2 E5:2 G5:4 F#5:2 A5:2 C6:4 | Bb5:6 A5:2 G5:2 F5:2 D5:4 | E5:4 G5:2 Bb5:2 C6:4 r:4 | A5:3 C6:3 E6:2 r:2 C6:2 A5:4 | F5:3 A5:3 C6:2 r:2 A5:2 F5:4 | G5:2 Bb5:2 D6:4 C6:2 Bb5:2 G5:4 | A5:12 r:4 | ' +
          'A5:8 F5:4 D5:4 | B5:8 G5:4 F5:4 | Eb5:4 G5:4 A5:4 C6:4 | D6:12 r:4 | Db6:4 Bb5:4 G5:4 Db6:4 | C6:4 A5:4 F#5:4 C6:4 | Bb5:4 D6:4 E6:4 C6:4 | A5:4 F5:4 C5:8',
      })),
    ],
  },

  // 1726年 大坂・仕掛け横丁「からくり横丁の昼下がり」：陽音階の笛と三味線、太鼓とチキチン
  edo1726: {
    title: 'からくり横丁の昼下がり',
    bpm: 100,
    key: 'D yo',
    chords: ['Dsus2', 'Dsus2', 'G6', 'Asus4', 'Dsus2', 'Em7', 'G6 Asus4', 'Dsus2', 'G6', 'Asus4', 'Em7', 'Dsus2', 'G6', 'Em7', 'Asus4', 'Dsus2'],
    parts: [
      { kind: 'pad', inst: 'organ', lo: 62, gain: 0.16, rev: 0.5 },
      { kind: 'arp', inst: 'shamisen', lo: 50, pattern: '0..1..2.0..2.1..', gain: 0.6, pan: -0.25, rev: 0.2 },
      { kind: 'arp', inst: 'koto', lo: 62, pattern: '0.1.2.3.4.3.2.1.', gain: 0.32, pan: 0.3, rev: 0.4, on: '0000000011111111' },
      { kind: 'drum', drum: 'taiko', pattern: 'x.......x..x....', gain: 0.8, rev: 0.25 },
      { kind: 'drum', drum: 'shime', pattern: '..x...x...x.x.x.', gain: 0.5, pan: 0.2 },
      { kind: 'drum', drum: 'kane', pattern: 'x.....x.x.....x.', gain: 0.35, pan: -0.3, on: '0000111111111111' },
      {
        kind: 'melody',
        inst: 'flute',
        gain: 0.8,
        rev: 0.4,
        dly: 0.15,
        notes:
          'A5:4 B5:2 A5:2 E5:4 D5:4 | E5:2 G5:2 A5:8 r:4 | B5:4 D6:4 B5:2 A5:2 G5:4 | A5:12 r:4 | D6:4 B5:2 A5:2 B5:4 A5:4 | G5:2 A5:2 B5:4 G5:4 E5:4 | D5:4 E5:4 A5:4 B5:4 | A5:12 r:4 | ' +
          'D6:4 E6:4 D6:2 B5:2 A5:4 | B5:2 A5:2 E5:4 A5:8 | G5:4 E5:4 D5:4 E5:4 | A4:12 r:4 | B5:4 A5:2 B5:2 D6:8 | E6:4 D6:4 B5:4 G5:4 | A5:4 B5:2 A5:2 E5:4 D5:4 | D5:12 r:4',
      },
    ],
  },

  // 15章 2028年 カンボジア「忘れられた遺跡」（docs/物語の背骨_v3.md §5 15章）：朝霧の密林に眠る遺跡。銅鑼の旋律と、遠い太鼓。
  // クメールの宮廷の合奏（ピンペアト）の楽器を借りた書き下ろし。伝統曲の引用はしない
  ruins2028: {
    title: '忘れられた遺跡',
    bpm: 80,
    key: 'A minpent',
    chords: ['Am7', 'Am7', 'Dsus2', 'Am7', 'C6', 'G', 'Dsus2', 'E7sus4', 'Am7', 'C6', 'Dsus2', 'Am7', 'Fmaj7', 'G', 'Dsus2', 'E7sus4'],
    parts: [
      { kind: 'pad', inst: 'choir', lo: 45, gain: 0.4, rev: 0.6 },
      { kind: 'bass', inst: 'bass', lo: 40, pattern: 'R-------R-------', gain: 0.5 },
      { kind: 'arp', inst: 'roneat', lo: 57, pattern: '0.1.2.1.0.1.3.1.', gain: 0.32, pan: -0.25, rev: 0.3, on: '0000111111111111' },
      { kind: 'drum', drum: 'taiko', pattern: 'x.........x.....', gain: 0.5, rev: 0.4 },
      { kind: 'drum', drum: 'shaker', pattern: '.x.x.x.x.x.x.x.x', gain: 0.16, pan: 0.4 },
      { kind: 'drum', drum: 'chhing', pattern: every(2), gain: 0.35, pan: 0.2, rev: 0.5 },
      {
        kind: 'melody',
        inst: 'gong',
        gain: 0.75,
        rev: 0.5,
        dly: 0.25,
        notes:
          'E5:4 D5:2 C5:2 A4:8 | r:4 C5:2 D5:2 E5:4 G5:4 | A5:6 G5:2 E5:4 D5:4 | E5:12 r:4 | G5:4 E5:2 G5:2 A5:4 C6:4 | D6:6 C6:2 A5:4 G5:4 | E5:4 D5:2 E5:2 A5:4 G5:4 | E5:12 r:4 | ' +
          'A5:4 G5:2 E5:2 G5:4 A5:4 | C6:6 A5:2 G5:4 E5:4 | D5:4 E5:4 A5:4 E5:4 | C5:12 r:4 | A5:4 C6:4 E6:8 | D6:4 C6:2 A5:2 G5:8 | A5:4 G5:2 E5:2 D5:4 E5:4 | A4:12 r:4',
      },
    ],
  },

  // 15章 クメール王朝の時代「クメールの都」：IDO の記録を通って行く、遺跡が生きていた頃。木琴が駆け、後半は笛が歌う
  khmer: {
    title: 'クメールの都',
    bpm: 112,
    key: 'D pentatonic',
    chords: ['D6', 'D6', 'Bm7', 'Bm7', 'G6', 'A', 'D6', 'A', 'Bm7', 'G6', 'D6', 'A', 'Bm7', 'G6', 'Asus4 A', 'D6'],
    parts: [
      { kind: 'arp', inst: 'gong', lo: 62, pattern: '0.1.2.1.3.1.2.1.', gain: 0.3, pan: 0.2, rev: 0.3 },
      { kind: 'bass', inst: 'bass', lo: 38, pattern: 'R.......F.......', gain: 0.5 },
      { kind: 'drum', drum: 'taiko', pattern: 'x.....x...x.....', gain: 0.65, rev: 0.2 },
      { kind: 'drum', drum: 'tom', pattern: '....x.......x.x.', gain: 0.4 },
      { kind: 'drum', drum: 'chhing', pattern: '..x...x...x...x.', gain: 0.4, pan: 0.3 },
      {
        kind: 'melody',
        inst: 'roneat',
        gain: 0.85,
        pan: -0.15,
        rev: 0.3,
        notes:
          'A5:2 B5:2 A5:2 F#5:2 E5:2 D5:2 E5:2 F#5:2 | A5:2 F#5:2 A5:2 B5:2 D6:4 B5:4 | D6:2 B5:2 A5:2 F#5:2 A5:2 B5:2 D6:2 E6:2 | F#6:4 E6:2 D6:2 B5:8 | E6:2 D6:2 B5:2 D6:2 E6:4 D6:4 | E6:2 C#6:2 A5:2 B5:2 C#6:4 E6:4 | F#6:2 E6:2 D6:2 B5:2 A5:2 B5:2 D6:4 | E6:4 A5:4 E5:8 | ' +
          'B5:2 D6:2 B5:2 A5:2 F#5:4 A5:4 | B5:2 D6:2 E6:2 D6:2 B5:4 G5:4 | A5:2 B5:2 D6:2 E6:2 F#6:4 E6:4 | E6:2 D6:2 C#6:2 B5:2 A5:8 | F#5:2 A5:2 B5:2 D6:2 B5:4 A5:4 | B5:2 A5:2 G5:2 E5:2 D5:4 E5:4 | D6:4 E6:4 C#6:4 E6:4 | D6:8 A5:4 F#5:4',
      },
      {
        kind: 'melody',
        inst: 'sralai',
        gain: 0.6,
        rev: 0.35,
        notes: 'r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | r:16 | F#5:8 A5:8 | B5:8 G5:8 | A5:8 D6:8 | E6:12 r:4 | D6:8 B5:8 | B5:8 E5:8 | D6:8 C#6:8 | D6:12 r:4',
      },
    ],
  },

  // 戦闘「欠けを払え」：欠け虫が襲ってきたとき。速い 16 分の低音と、刻むリード
  battle: {
    title: '欠けを払え',
    bpm: 140,
    key: 'E minor',
    chords: ['Em', 'C', 'D', 'B7', 'Em', 'C', 'Am', 'B'],
    parts: [
      { kind: 'pad', inst: 'strings', lo: 52, gain: 0.3, rev: 0.3 },
      { kind: 'comp', inst: 'brass', lo: 52, pattern: 'x..x..x...x.x...', gain: 0.38, pan: -0.2 },
      { kind: 'bass', inst: 'synthbass', lo: 40, pattern: 'RRR.RRR.RRR.RO.R', gain: 0.68 },
      { kind: 'drum', drum: 'kick', pattern: 'x.....x.x.....x.', gain: 0.85 },
      { kind: 'drum', drum: 'snare', pattern: '....x.......x...', gain: 0.6, rev: 0.15 },
      { kind: 'drum', drum: 'hat', pattern: 'x.x.x.x.x.x.x.x.', gain: 0.45, pan: 0.2 },
      { kind: 'drum', drum: 'crash', pattern: every(8), gain: 0.5 },
      { kind: 'drum', drum: 'tom', pattern: lastBar(8, '........x.x.xxxx'), gain: 0.55 },
      {
        kind: 'melody',
        inst: 'lead',
        oct: -1,
        gain: 0.7,
        rev: 0.2,
        dly: 0.15,
        notes: 'E5:2 G5:2 B5:2 E6:2 D6:2 B5:2 G5:2 B5:2 | C6:4 B5:2 G5:2 E5:4 G5:4 | F#5:2 A5:2 D6:2 F#6:2 E6:2 D6:2 A5:2 D6:2 | D#6:6 B5:2 F#5:4 A5:4 | E5:2 G5:2 B5:2 E6:2 G6:4 F#6:4 | E6:4 C6:4 G5:4 C6:4 | A5:4 C6:4 E6:4 C6:4 | B5:4 D#6:4 F#6:4 D#6:4',
      },
    ],
  },

  // 錨の番人「錨の番人」：ボス戦。合唱と金管、太鼓
  boss: {
    title: '錨の番人',
    bpm: 152,
    key: 'D minor',
    chords: ['Dm', 'Eb', 'Dm', 'Eb', 'Bb', 'C', 'Gm', 'A'],
    parts: [
      { kind: 'pad', inst: 'choir', lo: 50, gain: 0.5, rev: 0.5 },
      { kind: 'bass', inst: 'synthbass', lo: 38, pattern: 'R.RR.RR.R.RR.RRO', gain: 0.7 },
      { kind: 'drum', drum: 'kick', pattern: 'x..x..x...x..x..', gain: 0.85 },
      { kind: 'drum', drum: 'snare', pattern: '....x.......x...', gain: 0.6, rev: 0.2 },
      { kind: 'drum', drum: 'taiko', pattern: 'x.......x.......', gain: 0.6, rev: 0.3 },
      { kind: 'drum', drum: 'hat', pattern: '..x...x...x...x.', gain: 0.4, pan: 0.2 },
      { kind: 'drum', drum: 'crash', pattern: every(4), gain: 0.45 },
      { kind: 'drum', drum: 'tom', pattern: lastBar(8, '....x.x.x.xxxxxx'), gain: 0.55 },
      { kind: 'melody', inst: 'brass', gain: 0.7, rev: 0.3, notes: 'D5:4 F5:4 A5:6 G5:2 | G5:4 Eb5:4 Bb4:8 | D5:4 F5:4 A5:4 D6:4 | Eb6:8 D6:4 Bb5:4 | F5:4 Bb5:4 D6:8 | E6:4 C6:4 G5:8 | Bb5:4 G5:4 D5:4 G5:4 | C#6:8 A5:8' },
    ],
  },
}

/** 時代の曲（ステージが指定しないとき） */
export const STAGE_MUSIC: Readonly<Record<'1726' | '1970' | '2026' | '2086', MusicId>> = {
  '1726': 'edo1726',
  '1970': 'expo1970',
  '2026': 'present2026',
  '2086': 'future2086',
}
