// HUD の小さな決まり（DOM なし・テストあり：tests/hudFutureTheme.test.ts）。
import type { Hint } from './types'

/** 左腕に装備が無いあいだは、左腕でしか意味のない Q の案内を出さない */
export function filterHintsForArms(list: readonly Hint[], leftEquipped: boolean): Hint[] {
  if (leftEquipped) return [...list]
  return list.filter((h) => h.key.trim().toUpperCase() !== 'Q')
}

/** 一時停止パネルのタブ（← → で切り替え。端まで行ったら反対の端へ） */
export type PauseTab = 'equip' | 'controls'
export const PAUSE_TABS: readonly PauseTab[] = ['equip', 'controls']
/** 開いたときのタブ */
export const PAUSE_DEFAULT_TAB: PauseTab = 'equip'

export function nextPauseTab(current: PauseTab, key: string): PauseTab {
  const n = PAUSE_TABS.length
  const i = Math.max(0, PAUSE_TABS.indexOf(current))
  if (key === 'ArrowRight') return PAUSE_TABS[(i + 1) % n]
  if (key === 'ArrowLeft') return PAUSE_TABS[(i + n - 1) % n]
  return current
}
