// ステージの登録。各ステージは動的 import（別チャンク）で、移動するときに初めて読み込む。
import type { Stage } from './stage'
import type { StageKey } from './travel'

export type StageInfo = { year: string; place: string; label: string }

export const STAGE_INFO: Record<StageKey, StageInfo> = {
  '1726': { year: '1726年', place: '大坂・仕掛け横丁', label: '1726年　大坂・仕掛け横丁' },
  '2026': { year: '2026年', place: '大阪・なんば', label: '2026年　大阪・なんば' },
  '2086': { year: '2086年', place: 'ナンバタウン', label: '2086年　ナンバタウン' },
}

/** 起動時のステージ（URL の ?stage= も ?continue も無いとき）。1726年の縦切り試作をそのまま入口にしておく */
export const DEFAULT_STAGE: StageKey = '2086'

export async function createStage(key: StageKey): Promise<Stage> {
  switch (key) {
    case '1726': {
      const m = await import('../stages/edo1726/stage')
      return new m.EdoStage()
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
