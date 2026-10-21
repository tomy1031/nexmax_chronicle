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

/** 起動時のステージ（URL の ?stage= も ?continue も無いとき）。物語 v7 は 2086 年のはじめにから始まる */
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
      return import('../stages/edo1726/chronicle/stage')
    case '1970':
      return import('../stages/expo1970/stage')
    case '2026':
      return import('../stages/namba2026/chronicle/stage')
    case '2086':
      return import('../stages/future2086/chronicle/stage')
  }
}

export async function createStage(key: StageKey): Promise<Stage> {
  switch (key) {
    case '1186': {
      const m = await import('../stages/khmer1186/stage')
      return new m.KhmerStage()
    }
    case '1726': {
      // 物語 v7 の 7 章（旧版の導入編は stages/edo1726/stage.ts の EdoStage に残してある）
      const m = await import('../stages/edo1726/chronicle/stage')
      return new m.ChronicleEdoStage()
    }
    case '1970': {
      const m = await import('../stages/expo1970/stage')
      return new m.ExpoStage()
    }
    case '2026': {
      // 物語 v7 の 6・9 章（旧版は stages/namba2026/stage.ts の NambaStage に残してある）
      const m = await import('../stages/namba2026/chronicle/stage')
      return new m.ChronicleNambaStage()
    }
    case '2086': {
      // 物語 v7 のはじめに・1〜5・8・10・12 章・結末・おわりに（旧版は future2086Adapter に残してある）
      const m = await import('../stages/future2086/chronicle/stage')
      return new m.ChronicleFutureStage()
    }
  }
}
