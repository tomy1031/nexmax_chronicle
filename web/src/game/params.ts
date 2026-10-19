// URL パラメータ（開発・検証用）。描画に依存しない純粋なロジック。
// ?stage=1726|2026|2086  開始する時代　?spawn=ID  到着地点　?flags=a,b,c=false,loop_count=2  フラグを立てる
// ?continue  セーブから再開　?newgame  セーブを消して最初から　?shot= / ?nohud / ?quality=low / ?stats / ?debug は従来どおり
import { isStageKey, type StageKey } from './travel'

export type GameParams = {
  stage: StageKey | null
  spawn: string | null
  flags: string[]
  continue: boolean
  newGame: boolean
  shot: string | null
  nohud: boolean
  stats: boolean
  debug: boolean
}

export function parseGameParams(search: string): GameParams {
  const p = new URLSearchParams(search)
  const stage = p.get('stage')
  const flags = (p.get('flags') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  return {
    stage: isStageKey(stage) ? stage : null,
    spawn: p.get('spawn'),
    flags,
    continue: p.has('continue'),
    newGame: p.has('newgame'),
    shot: p.get('shot'),
    nohud: p.has('nohud'),
    stats: p.has('stats'),
    debug: p.has('debug'),
  }
}
