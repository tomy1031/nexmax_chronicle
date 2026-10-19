// どの曲を鳴らすか（純粋なロジック・tests/music.test.ts）。
// ボスの体力が出ている間は番人の曲、敵が襲ってきたら戦闘の曲。戦いが終わっても少しのあいだ（BATTLE_HOLD 秒）は戦闘の曲のまま
// （敵が 1 匹ずつ来るたびに曲が行ったり来たりしないように）。ボスを倒したら、すぐに場所の曲へ戻る。
import type { MusicId } from './tracks'

export const BATTLE_HOLD = 4

export type MusicSituation = {
  /** 場所の曲（ステージが選ぶ。null なら鳴らさない） */
  place: MusicId | null
  /** ボスの体力が出ている */
  boss: boolean
  /** 近くで敵が襲ってきている */
  inCombat: boolean
  /** 時空移動の途中（光に包まれている間は鳴らさない） */
  travelling: boolean
}

export class MusicDirector {
  private mode: 'battle' | 'boss' | null = null
  private calm = 0

  pick(dt: number, s: MusicSituation): MusicId | null {
    if (s.travelling) {
      this.mode = null
      return null
    }
    if (s.boss) {
      this.mode = 'boss'
      this.calm = 0
    } else if (s.inCombat) {
      this.mode = 'battle'
      this.calm = 0
    } else if (this.mode === 'boss') this.mode = null
    else if (this.mode === 'battle') {
      this.calm += dt
      if (this.calm >= BATTLE_HOLD) this.mode = null
    }
    return this.mode ?? s.place
  }

  /** 曲が変わるときのフェードの秒（戦いに入るときは速く、戦いから戻るときはゆっくり） */
  static fadeFor(from: MusicId | null, to: MusicId | null): number {
    if (to === 'battle' || to === 'boss') return 0.5
    if (from === 'battle' || from === 'boss') return 2.4
    if (to === null) return 1.0
    return 1.6
  }
}
