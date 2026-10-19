// HUD の小さな決まり（DOM なし・テストあり：tests/hudFutureTheme.test.ts）。
import type { Hint } from './types'
import { FPS_CAPS, MUSIC_LEVELS, QUALITY_LEVELS, type GraphicsPrefs } from '../../render/quality'

/** 左腕に装備が無いあいだは、左腕でしか意味のない Q の案内を出さない */
export function filterHintsForArms(list: readonly Hint[], leftEquipped: boolean): Hint[] {
  if (leftEquipped) return [...list]
  return list.filter((h) => h.key.trim().toUpperCase() !== 'Q')
}

/** 一時停止パネルのタブ（← → で切り替え。端まで行ったら反対の端へ） */
export type PauseTab = 'equip' | 'controls' | 'settings'
export const PAUSE_TABS: readonly PauseTab[] = ['equip', 'controls', 'settings']
/** 開いたときのタブ */
export const PAUSE_DEFAULT_TAB: PauseTab = 'equip'

export function nextPauseTab(current: PauseTab, key: string): PauseTab {
  const n = PAUSE_TABS.length
  const i = Math.max(0, PAUSE_TABS.indexOf(current))
  if (key === 'ArrowRight') return PAUSE_TABS[(i + 1) % n]
  if (key === 'ArrowLeft') return PAUSE_TABS[(i + n - 1) % n]
  return current
}

/** 設定タブの項目（W/S・↑↓ で選び、A/D で変える。Enter・Space・F は次の値へ回す） */
export type SettingRow = 'quality' | 'fps' | 'music'
export const SETTING_ROWS: readonly SettingRow[] = ['quality', 'fps', 'music']

/** 設定タブのキー操作：選んでいる項目と、変えた後の設定（変わらなければ同じ値） */
export function settingsKey(row: SettingRow, prefs: GraphicsPrefs, code: string): { row: SettingRow; prefs: GraphicsPrefs } {
  const ri = SETTING_ROWS.indexOf(row)
  if (code === 'KeyW' || code === 'ArrowUp') return { row: SETTING_ROWS[Math.max(0, ri - 1)], prefs }
  if (code === 'KeyS' || code === 'ArrowDown') return { row: SETTING_ROWS[Math.min(SETTING_ROWS.length - 1, ri + 1)], prefs }
  const dir = code === 'KeyA' ? -1 : code === 'KeyD' ? 1 : code === 'Enter' || code === 'Space' || code === 'KeyF' ? 0 : null
  if (dir === null) return { row, prefs }
  const step = <T>(list: readonly T[], v: T): T => {
    const i = list.indexOf(v)
    // 0 は回す（端から反対の端へ）、±1 は端で止まる
    return dir === 0 ? list[(i + 1) % list.length] : list[Math.min(list.length - 1, Math.max(0, i + dir))]
  }
  if (row === 'quality') return { row, prefs: { ...prefs, quality: step(QUALITY_LEVELS, prefs.quality) } }
  if (row === 'music') return { row, prefs: { ...prefs, music: step(MUSIC_LEVELS, prefs.music) } }
  return { row, prefs: { ...prefs, fps: step(FPS_CAPS, prefs.fps) } }
}
