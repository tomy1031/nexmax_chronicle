// 町の人（モブ）の台詞の選び方と、吹き出しを出す順番・間隔。three.js・DOM に依存しない純粋なロジック（tests/mobTalk.test.ts）。
// ・台詞の表（JSON）：話者 ID ごとに、場面（phase。例 morning / loop_morning / night）ごとの吹き出しの台詞と、F で話したときの短い会話。
// ・書いていない場面は表の repeatOf（例 loop_morning → morning）で元の場面の台詞を「一字一句そのまま」使う。
//   ループした朝は、ネクマックス以外は前の日を覚えていないので、同じ人が同じ場所で同じことを言う。
// ・出し方（MobTalkDirector）：範囲に入った人が 1 行。とどまると間をおいて次の行。その場面の台詞を言い終えたら、
//   いったん離れてまた来るまで黙る。同時に見える吹き出しは最大 2 つ、出だしの間隔もあける（うるさくしない）。
//   会話・演出・一時停止の間（suspended）はすべて消して、終わってから少し待つ。毎フレームの割り当ては無い。

/** F で話したときの 1 行（dialogue_2086.json と同じ形） */
export type MobTalkLine = { speaker: string; text: string }

/** 場面ごとの台詞の列 */
export type MobPhaseLines<T> = { readonly [phase: string]: readonly T[] | undefined }

export type MobSpeakerData = {
  /** F で話したときの話者名（吹き出しには出さない） */
  name: string
  /** 吹き出しの台詞（場面ごと。上から順に言う） */
  bubble: MobPhaseLines<string>
  /** F で話したときの短い会話（場面ごと。無い場面は吹き出しの次の 1 行を名前付きで出す） */
  talk?: MobPhaseLines<MobTalkLine>
}

export type MobTable = {
  /** 書いていない場面の代わりに使う場面（例 { "loop_morning": "morning" }）。たどれる限りたどる */
  repeatOf?: { readonly [phase: string]: string }
  speakers: { readonly [id: string]: MobSpeakerData }
}

const EMPTY: readonly never[] = []

/** 場面の台詞を引く（無ければ repeatOf をたどる。それでも無ければ空＝その場面では黙っている） */
export function resolvePhase<T>(lines: MobPhaseLines<T> | undefined, phase: string, repeatOf?: MobTable['repeatOf']): readonly T[] {
  if (!lines) return EMPTY
  let p: string | undefined = phase
  for (let hop = 0; p !== undefined && hop < 8; hop++) {
    const v: readonly T[] | undefined = lines[p]
    if (v && v.length) return v
    p = repeatOf?.[p]
  }
  return EMPTY
}

/** 話者たちの吹き出しの台詞（ids の順） */
export function bubbleLinesFor(table: MobTable, ids: readonly string[], phase: string): Array<readonly string[]> {
  return ids.map((id) => resolvePhase(table.speakers[id]?.bubble, phase, table.repeatOf))
}

/**
 * F で話したときの会話。その場面の会話が無ければ、次に言うはずの吹き出しの 1 行を名前付きで出す。
 * next は吹き出しの台詞の何行目か（MobTalkDirector.peek）
 */
export function talkLinesFor(table: MobTable, id: string, phase: string, next: number): readonly MobTalkLine[] {
  const sp = table.speakers[id]
  if (!sp) return EMPTY
  const talk = resolvePhase(sp.talk, phase, table.repeatOf)
  if (talk.length) return talk
  const b = resolvePhase(sp.bubble, phase, table.repeatOf)
  if (!b.length) return EMPTY
  return [{ speaker: sp.name, text: b[((next % b.length) + b.length) % b.length] }]
}

/** その場面で F の会話（または代わりの 1 行）があるか（配列を作らない） */
export function hasTalk(table: MobTable, id: string, phase: string): boolean {
  const sp = table.speakers[id]
  if (!sp) return false
  return resolvePhase(sp.talk, phase, table.repeatOf).length > 0 || resolvePhase(sp.bubble, phase, table.repeatOf).length > 0
}

/** 吹き出しの表示秒数（文字数から。短い台詞でも読み切れるように） */
export function bubbleSeconds(text: string, cfg: Pick<MobDirectorConfig, 'minDur' | 'maxDur' | 'charSec'> = MOB_DIRECTOR_DEFAULTS): number {
  const n = [...text].length
  return Math.min(cfg.maxDur, Math.max(cfg.minDur, 1.2 + n * cfg.charSec))
}

export type MobDirectorConfig = {
  /** 同時に見える吹き出しの最大数 */
  maxVisible: number
  /** 吹き出しの出だしどうしの最小の間隔（秒） */
  gap: number
  /** 同じ人が続けて言うとき、前の吹き出しが消えてから次までの間（秒） */
  linger: number
  /** 一度言った人が、離れてまた来たときに再び言えるまでの休み（秒。吹き出しが消えてから） */
  rest: number
  /** ステージが始まってから最初の吹き出しまで（秒。時代カードとかぶらないように） */
  startDelay: number
  /** 会話・演出が終わってから吹き出しを再開するまで（秒） */
  resumeDelay: number
  /** 範囲を出たと見なす余白（m）。範囲の境目で出たり入ったりしないように */
  exitPad: number
  minDur: number
  maxDur: number
  /** 1 文字あたりの表示秒数 */
  charSec: number
  /** 吹き出しが消えてから同じ枠に次を出すまで（秒。消える動きを見せる） */
  fadeGap: number
}

export const MOB_DIRECTOR_DEFAULTS: MobDirectorConfig = {
  maxVisible: 2,
  gap: 1.4,
  linger: 5.5,
  rest: 6,
  startDelay: 4.2,
  resumeDelay: 1.2,
  exitPad: 0.9,
  minDur: 2.6,
  maxDur: 5.6,
  charSec: 0.11,
  fadeGap: 0.4,
}

/** 見えている（または空の）吹き出しの枠。speaker = -1 は空き */
export type MobBubble = { speaker: number; text: string; age: number; dur: number }

/** 吹き出しを出す順番と間隔（話者は番号で扱う。距離は呼ぶ側が毎フレーム入れる） */
export class MobTalkDirector {
  readonly cfg: MobDirectorConfig
  /** 吹き出しの枠（maxVisible 個。中身を入れ替えて使い回す） */
  readonly slots: MobBubble[]
  /** 枠の中身が変わるたびに増える（表示側の更新の目安） */
  version = 0
  private readonly n: number
  private lines: ReadonlyArray<readonly string[]>
  private readonly cursor: Int32Array
  private readonly saidThisVisit: Int32Array
  private readonly inside: Uint8Array
  /** この時刻（clock）までは言わない */
  private readonly notBefore: Float64Array
  /** 枠が空いた時刻 */
  private readonly freedAt: Float64Array
  private clock = 0
  private lastStart = -1e9
  private holdUntil = 0
  private phaseKey = ''

  constructor(n: number, cfg: Partial<MobDirectorConfig> = {}) {
    this.cfg = { ...MOB_DIRECTOR_DEFAULTS, ...cfg }
    this.n = n
    this.lines = Array.from({ length: n }, () => EMPTY)
    this.cursor = new Int32Array(n)
    this.saidThisVisit = new Int32Array(n)
    this.inside = new Uint8Array(n)
    this.notBefore = new Float64Array(n)
    this.slots = Array.from({ length: this.cfg.maxVisible }, () => ({ speaker: -1, text: '', age: 0, dur: 0 }))
    this.freedAt = new Float64Array(this.slots.length).fill(-1e9)
    this.holdUntil = this.cfg.startDelay
  }

  get phase(): string {
    return this.phaseKey
  }

  get time(): number {
    return this.clock
  }

  /**
   * 場面の台詞を入れる。場面が変わったら全員の何行目かを 0 に戻す
   * （ループした朝は、最初の朝と同じ 1 行目から同じ順で言う）
   */
  setLines(phase: string, lines: ReadonlyArray<readonly string[]>): void {
    if (phase === this.phaseKey && lines === this.lines) return
    const changed = phase !== this.phaseKey
    this.phaseKey = phase
    this.lines = lines
    if (!changed) return
    this.cursor.fill(0)
    this.saidThisVisit.fill(0)
    this.notBefore.fill(0)
    this.clear()
  }

  /** 次に言う行（何行目か。F の会話の代わりの 1 行に使う） */
  peek(i: number): number {
    return this.cursor[i] ?? 0
  }

  /** i が吹き出しを出している枠（無ければ -1） */
  slotOf(i: number): number {
    for (let k = 0; k < this.slots.length; k++) if (this.slots[k].speaker === i) return k
    return -1
  }

  /** しばらく黙らせる（F で話した直後など）。出している吹き出しも消す */
  silence(i: number, seconds: number): void {
    if (i < 0 || i >= this.n) return
    this.notBefore[i] = Math.max(this.notBefore[i], this.clock + seconds)
    const k = this.slotOf(i)
    if (k >= 0) this.free(k)
  }

  /** 吹き出しをすべて消す */
  clear(): void {
    for (let k = 0; k < this.slots.length; k++) if (this.slots[k].speaker >= 0) this.free(k)
  }

  private free(k: number): void {
    const s = this.slots[k]
    s.speaker = -1
    s.age = 0
    s.dur = 0
    this.freedAt[k] = this.clock
    this.version++
  }

  /**
   * 1 フレーム進める。dist[i] は話者 i までの距離（いない・高さが合わないなら Infinity）、reach[i] は吹き出しが出る距離。
   * suspended の間（会話・演出・一時停止など）は吹き出しを消し、終わってから resumeDelay 待つ
   */
  update(dt: number, dist: ArrayLike<number>, reach: ArrayLike<number>, suspended: boolean): void {
    const c = this.cfg
    this.clock += dt
    // 時間が来た吹き出しを消す
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k]
      if (s.speaker < 0) continue
      s.age += dt
      if (s.age >= s.dur) this.free(k)
    }
    // 範囲の出入り（会話中も数えておく：離れたら「この訪問で言った数」を戻す）
    for (let i = 0; i < this.n; i++) {
      const d = dist[i]
      const r = reach[i]
      if (this.inside[i]) {
        if (!(d <= r + c.exitPad)) {
          this.inside[i] = 0
          this.saidThisVisit[i] = 0
        }
      } else if (d <= r) {
        this.inside[i] = 1
        this.saidThisVisit[i] = 0
      }
    }
    if (suspended) {
      this.clear()
      this.holdUntil = Math.max(this.holdUntil, this.clock + c.resumeDelay)
      return
    }
    if (this.clock < this.holdUntil || this.clock - this.lastStart < c.gap) return
    let free = -1
    for (let k = 0; k < this.slots.length; k++) {
      if (this.slots[k].speaker < 0 && this.clock - this.freedAt[k] >= c.fadeGap) {
        free = k
        break
      }
    }
    if (free < 0) return
    // いちばん近い、言える人
    let best = -1
    let bd = Infinity
    for (let i = 0; i < this.n; i++) {
      if (!this.inside[i]) continue
      const ls = this.lines[i]
      if (!ls.length || this.saidThisVisit[i] >= ls.length || this.clock < this.notBefore[i] || this.slotOf(i) >= 0) continue
      if (dist[i] < bd) {
        bd = dist[i]
        best = i
      }
    }
    if (best < 0) return
    const ls = this.lines[best]
    const text = ls[this.cursor[best] % ls.length]
    this.cursor[best]++
    this.saidThisVisit[best]++
    const s = this.slots[free]
    s.speaker = best
    s.text = text
    s.age = 0
    s.dur = bubbleSeconds(text, c)
    // 続けて言うなら linger、離れてまた来たら rest（どちらも吹き出しが消えてから）
    const left = ls.length - this.saidThisVisit[best]
    this.notBefore[best] = this.clock + s.dur + (left > 0 ? c.linger : c.rest)
    this.lastStart = this.clock
    this.version++
  }
}
