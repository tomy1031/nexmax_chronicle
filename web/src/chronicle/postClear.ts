// クリア後（v7_epilogue）のおまけ：思い出の旅。
// 物語のおわりで、背中の石はもう光らない（時をもどすことも、昔へ行くこともできない）。そこで、ソラが IDO に「石が覚えている時代の記録」を
// 入れて、わっかの年代ダイヤルから、思い出の時代（2026・1726・1186 年）を歩けるようにした、というおまけ。
// 着いたときのひとこと・人と話したときのおまけの話・帰るときのひとことは bonus_lines.json。
import DATA from './bonus_lines.json'

export type Line = { speaker: string; text: string }
export type Flags = (name: string) => boolean

/** クリアした（おわりにを見た） */
export const CLEAR_FLAG = 'v7_epilogue'
/** ソラが、思い出の旅のことを話した（はじめの 1 回だけ） */
export const FREE_INTRO_FLAG = 'v7_free_intro'

export function cleared(f: Flags): boolean {
  return f(CLEAR_FLAG)
}

/** 思い出の旅で行ける時代（年代ダイヤルで光る年）と、着く所 */
export const MEMORY_TRIPS = [
  { year: 2026, to: '2026', spawn: 'v7_shrine' },
  { year: 1726, to: '1726', spawn: 'v7_return' },
  { year: 1186, to: '1186', spawn: 'altar' },
] as const

export type MemoryEra = '2086' | '2026' | '1726' | '1186'

type EraData = { intro?: Line[]; arrive?: Line[]; leave?: Line[]; talk: Record<string, Line[][]> }
const BONUS = DATA as unknown as Record<MemoryEra, EraData>

/** 話すたびに次の話へ（遊んでいるあいだ覚えておく。時代をまたいでも続きから） */
const turns = new Map<string, number>()

/** その人のおまけの話（次のぶん）。無ければ null */
export function bonusTalk(era: MemoryEra, who: string): Line[] | null {
  const list = BONUS[era]?.talk[who]
  if (!list?.length) return null
  const key = `${era}:${who}`
  const i = turns.get(key) ?? 0
  turns.set(key, (i + 1) % list.length)
  return list[i % list.length]
}

/** 着いたときのひとこと・帰るときのひとこと・ソラの説明 */
export function bonusLines(era: MemoryEra, kind: 'intro' | 'arrive' | 'leave'): Line[] {
  return BONUS[era]?.[kind] ?? []
}

/** その時代で、おまけの話をする人 */
export function bonusSpeakers(era: MemoryEra): string[] {
  return Object.keys(BONUS[era]?.talk ?? {})
}

/** テスト用：話の順番を最初にもどす */
export function resetBonusTurns(): void {
  turns.clear()
}
