// タイトル画面とホーム画面への追加の案内の、描画に依存しない判断（tests/titleLogic.test.ts）。
import { GameSave } from '../../core/gameSave'
import { StoryState } from '../../core/storyFlags'
import { TimelineState } from '../../core/timelineState'
import type { StorageLike } from '../../core/saveManager'
import { eraStage, type StageKey } from '../../game/travel'

/** タイトル画面で選んだこと */
export type TitleChoice = 'continue' | 'new'

/** 開発・検証用の URL パラメータがあるときはタイトルを出さない（いままでどおり直接始める） */
const DIRECT_PARAMS = ['stage', 'spawn', 'flags', 'continue', 'newgame', 'shot', 'nohud']

export function shouldShowTitle(search: string): boolean {
  const p = new URLSearchParams(search)
  return !DIRECT_PARAMS.some((k) => p.has(k))
}

/** つづきからの表示に使うセーブの中身 */
export type SaveSummary = {
  stage: StageKey | null
  checkpoint: string
  savedAt: number
}

/** セーブを読んで要約する（ゲームの状態は変えない）。無い・壊れていれば null */
export function summarizeSave(storage: StorageLike | null): SaveSummary | null {
  const save = new GameSave(storage)
  const raw = save.read()
  if (!raw) return null
  const story = new StoryState(new TimelineState())
  const loaded = save.load(story)
  if (!loaded) return null
  return { stage: eraStage(loaded.era), checkpoint: loaded.checkpoint, savedAt: raw.saved_at }
}

/** 保存した日時（例「きょう 21:30」「きのう 8:05」「10月18日 21:30」「2025年12月1日」） */
export function formatSavedAt(savedAt: number, now: number): string {
  if (!savedAt) return ''
  const d = new Date(savedAt)
  const n = new Date(now)
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  const dayStart = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((dayStart(n) - dayStart(d)) / 86400000)
  if (diffDays === 0) return `きょう ${hm}`
  if (diffDays === 1) return `きのう ${hm}`
  if (d.getFullYear() !== n.getFullYear()) return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`
}

// ------------------------------------------------------------------ ホーム画面への追加

/** 案内の出し分け */
export type InstallPlatform =
  /** iPhone・iPad（Safari など。共有ボタン → ホーム画面に追加） */
  | 'ios'
  /** Android（Chrome など。メニュー → ホーム画面に追加／インストール） */
  | 'android'
  /** アプリの中のブラウザ（LINE・Instagram など）。追加できないので、ブラウザで開き直してもらう */
  | 'inapp'
  /** PC */
  | 'desktop'

export type DeviceInfo = {
  userAgent: string
  maxTouchPoints: number
  /** 指が主な入力（pointer: coarse） */
  coarse: boolean
}

const INAPP_RE = /\bLine\/|FBAN|FBAV|Instagram|MicroMessenger|TikTok|musical_ly|Twitter|KAKAOTALK|; wv\)/i

export function detectInstallPlatform(d: DeviceInfo): InstallPlatform {
  const ua = d.userAgent
  if (INAPP_RE.test(ua)) return 'inapp'
  // iPadOS は「Macintosh」を名乗るので、タッチ点の数で見分ける
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && d.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return d.coarse ? 'android' : 'desktop'
}

export type InstallContext = {
  /** すでにホーム画面のアイコンから開いている */
  standalone: boolean
  platform: InstallPlatform
  /** 一度「あとで」を押した */
  dismissed: boolean
}

/** 最初の起動で案内を自動で開くか（スマホ・タブレットで、まだ追加していなくて、閉じたことがない） */
export function shouldAutoShowInstall(c: InstallContext): boolean {
  if (c.standalone || c.dismissed) return false
  return c.platform !== 'desktop'
}

/** タイトルに「ホーム画面に追加」の入口を出すか（PC はブラウザがインストールに対応しているときだけ） */
export function shouldOfferInstall(c: InstallContext & { canPrompt: boolean }): boolean {
  if (c.standalone) return false
  return c.platform !== 'desktop' || c.canPrompt
}

export const INSTALL_DISMISSED_KEY = 'nexmax.install.dismissed.v1'
