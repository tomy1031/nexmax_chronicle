// 会話（複数の台詞）を 1 行ずつ順に出す待ち行列。文字数に応じて自動で進み、F で早送りできる。
// 表示は呼び出し側（HUD の台詞）。描画・DOM に依存しない純粋なロジック（tests/dialogueQueue.test.ts）。

export type DialogueLine = { speaker: string; text: string }

export type DialogueTiming = {
  /** 1 行の最短表示（秒） */
  min: number
  /** 1 文字あたり（秒） */
  perChar: number
  /** 1 行の最長表示（秒） */
  max: number
}

export const DEFAULT_DIALOGUE_TIMING: DialogueTiming = { min: 2.4, perChar: 0.09, max: 6.5 }

/** 1 行を読むのに必要な時間（秒） */
export function lineDuration(text: string, t: DialogueTiming = DEFAULT_DIALOGUE_TIMING): number {
  const n = [...text].length
  return Math.min(t.max, Math.max(t.min, n * t.perChar + 0.8))
}

export class DialogueQueue {
  readonly lines: readonly DialogueLine[]
  private readonly timing: DialogueTiming
  /** いま表示している行（-1 = 開始前） */
  index = -1
  private left = 0

  constructor(lines: readonly DialogueLine[], timing: DialogueTiming = DEFAULT_DIALOGUE_TIMING) {
    this.lines = lines
    this.timing = timing
  }

  get current(): DialogueLine | null {
    return this.index >= 0 && this.index < this.lines.length ? this.lines[this.index] : null
  }

  get done(): boolean {
    return this.index >= this.lines.length
  }

  /** いまの行の残り時間（秒） */
  get remaining(): number {
    return this.left
  }

  /** 最初の行を出す（空なら null で即終了） */
  start(): DialogueLine | null {
    this.index = -1
    return this.advance()
  }

  /** 次の行へ（F で早送り）。終わったら null */
  advance(): DialogueLine | null {
    if (this.done) return null
    this.index++
    const l = this.current
    this.left = l ? lineDuration(l.text, this.timing) : 0
    return l
  }

  /** 時間を進める。次の行に移ったらその行を返す */
  tick(dt: number): DialogueLine | null {
    if (this.done || this.index < 0) return null
    this.left -= dt
    if (this.left <= 0) return this.advance()
    return null
  }
}
