// ステージの登録。各ステージは動的 import（別チャンク）で、移動するときに初めて読み込む。
import type { Stage } from './stage'
import type { StageKey } from './travel'

export type StageInfo = { year: string; place: string; label: string }

export const STAGE_INFO: Record<StageKey, StageInfo> = {
  '1186': { year: '1186年', place: 'クメールの都・アルンの寺', label: '1186年　クメールの都・アルンの寺' },
  '1726': { year: '1726年', place: '大坂・仕掛け横丁', label: '1726年　大坂・仕掛け横丁' },
  '1970': { year: '1970年', place: '千里丘陵・万国博覧会', label: '1970年　千里丘陵・万国博覧会' },
  '2026': { year: '2026年', place: '大阪・なんば', label: '2026年　大阪・なんば' },
  '2086': { year: '2086年', place: 'ナンバタウン', label: '2086年　ナンバタウン' },
}

/** 起動時のステージ（URL の ?stage= も ?continue も無いとき）。1726年の縦切り試作をそのまま入口にしておく */
export const DEFAULT_STAGE: StageKey = '2086'

/**
 * ステージのファイルを先に読み込んでおく（タイトル画面を見ている間に。作りはしない）。
 * createStage と同じ import なので、あとで createStage したときはすぐ返る
 */
export function preloadStage(key: StageKey): Promise<unknown> {
  switch (key) {
    case '1186':
      return import('../stages/khmer1186/stage')
    case '1726':
      return import('../stages/edo1726/stage')
    case '1970':
      return import('../stages/expo1970/stage')
    case '2026':
      return import('../stages/namba2026/stage')
    case '2086':
      return import('./future2086Adapter')
  }
}

export async function createStage(key: StageKey): Promise<Stage> {
  switch (key) {
    case '1186': {
      const m = await import('../stages/khmer1186/stage')
      return new m.KhmerStage()
    }
    case '1726': {
      const m = await import('../stages/edo1726/stage')
      return new m.EdoStage()
    }
    case '1970': {
      const m = await import('../stages/expo1970/stage')
      return new m.ExpoStage()
    }
    case '2026': {
      const m = await import('../stages/namba2026/stage')
      return new m.NambaStage()
    }
    case '2086': {
      const m = await import('./future2086Adapter')
      return m.createFutureStage()
    }
  }
}
