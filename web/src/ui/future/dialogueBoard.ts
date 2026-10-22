// 台詞ウィンドウの中身を決める純粋なロジック（DOM なし。tests/hudFutureDialogue.test.ts）。
// ・いちばん新しい台詞を大きなウィンドウ（main）に出す
// ・まだ表示時間が残っている 1 つ前の台詞は、ウィンドウの上に小さく残せる（ghost、最大 ghostMax 秒。0 なら残さない）
// ・同じ台詞がもう一度来たら、出し直さずに時間だけ延ばす

export type BoardLine = {
  speaker: string
  text: string
  /** 表示を始めた時刻（秒） */
  since: number
  /** 消す時刻（秒） */
  until: number
}

/** 小さく残す 1 つ前の台詞の最長表示（秒） */
export const GHOST_MAX = 3.2

export type SayResult = 'new' | 'extended'

export class DialogueBoard {
  /** 小さく残す台詞の最長表示（秒） */
  ghostMax = GHOST_MAX
  main: BoardLine | null = null
  ghost: BoardLine | null = null
  /** 表示が変わるたびに増える（DOM の更新判定用） */
  version = 0

  say(speaker: string, text: string, seconds: number, now: number): SayResult {
    const dur = Math.max(0.5, seconds)
    const m = this.main
    if (m && m.speaker === speaker && m.text === text) {
      m.until = Math.max(m.until, now + dur)
      return 'extended'
    }
    if (m && m.until > now && this.ghostMax > 0) {
      this.ghost = { ...m, until: Math.min(m.until, now + this.ghostMax) }
    } else if (this.ghost && this.ghost.until <= now) {
      this.ghost = null
    }
    // 同じ台詞が ghost に残っていたら消す（main と二重に出さない）
    if (this.ghost && this.ghost.speaker === speaker && this.ghost.text === text) this.ghost = null
    this.main = { speaker, text, since: now, until: now + dur }
    this.version++
    return 'new'
  }

  /** 時間切れを片付ける。表示が変わったら true */
  tick(now: number): boolean {
    let changed = false
    if (this.main && this.main.until <= now) {
      this.main = null
      changed = true
    }
    if (this.ghost && this.ghost.until <= now) {
      this.ghost = null
      changed = true
    }
    if (changed) this.version++
    return changed
  }

  /** 次に何かが消える時刻（なければ null） */
  nextExpiry(): number | null {
    const ts = [this.main?.until, this.ghost?.until].filter((v): v is number => typeof v === 'number')
    return ts.length ? Math.min(...ts) : null
  }

  clear(): void {
    if (!this.main && !this.ghost) return
    this.main = null
    this.ghost = null
    this.version++
  }
}

/** 文字の大きさの段階ごとの 1 行のおよその文字数（会話ウィンドウの幅から） */
export const LINE_CHARS = [22, 25, 29] as const

/** 2 行に収めるための文字の大きさの段階（0 = 標準、1 = 少し小さく、2 = 小さく） */
export function textSizeStep(text: string): 0 | 1 | 2 {
  const n = [...text].length
  if (n <= 44) return 0
  if (n <= 50) return 1
  return 2
}

/**
 * 2 行の台詞を、文の切れ目（。！？）で折り返す。1 行に収まらない長さで、切れ目で分けると
 * どちらの行も収まるときだけ改行を入れる（「ちゃんと残｜さんとな」のような途中の折り返しを避ける）。
 */
export function breakLines(text: string, sizeStep: 0 | 1 | 2): string {
  const chars = [...text]
  const perLine = LINE_CHARS[sizeStep]
  if (chars.length <= perLine || text.includes('\n')) return text
  let best = -1
  let bestScore = Infinity
  for (let i = 0; i < chars.length - 1; i++) {
    if (!'。！？!?…'.includes(chars[i])) continue
    // 「！？」「……」の続きは切れ目の後ろへ
    let j = i
    while (j + 1 < chars.length - 1 && '。！？!?…」'.includes(chars[j + 1])) j++
    const a = j + 1
    const b = chars.length - a
    if (a > perLine || b > perLine || b <= 0) continue
    const score = Math.abs(a - b)
    if (score < bestScore) {
      bestScore = score
      best = a
    }
  }
  if (best < 0) return text
  // 次の行の頭の空白は消す
  return `${chars.slice(0, best).join('')}\n${chars.slice(best).join('').replace(/^[\s　]+/, '')}`
}
