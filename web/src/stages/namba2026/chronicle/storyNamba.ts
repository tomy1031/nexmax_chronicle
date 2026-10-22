// 2026年 なんば（物語 v7 の 6・9 章）の進み方。フラグだけから段階が決まる純粋なロジック（tests/namba2026Story.test.ts）。
// 6 章：かんばんから出る → よろいの影獣（目標の欄は beastLogic.ts の ①〜④）→ 社長の大さわぎ → 社長の絵（ラボ）
//        → IDO 検索（町のかんばん 3 本） → 路地のかんばんの QR を読む（→1726）
// 9 章：路地のかんばんへ着く（夕方） → 社長・ほこら・おふじさん・佐伯さん → 夜のほこら防衛 → 江戸の朝の映し出し → 大きな影
//        → 本物の朝・社長の決断・ノート → 帰りの光（→2086）
import type { Flags } from '../../../chronicle/progress'
import type { AlleyPhase } from './alleyTime'

export type NambaV7Step =
  /** 6 章：かんばんから出る・よろいの影獣 */
  | 'arrive'
  /** 6 章：ラボで社長の絵を見る */
  | 'sketch'
  /** 6 章：IDO 検索・町のかんばんを回る */
  | 'search'
  /** 6 章：路地のかんばんの QR を読む（→1726） */
  | 'depart'
  /** 6 章のあと（江戸へ行ったまま、8 章のダイヤルの前）：開発用にここへ来たときの居場所 */
  | 'between'
  /** 9 章：着いて、社長とほこらへ（夕方） */
  | 'shrine_talk'
  /** 9 章：夜のほこら防衛 */
  | 'defense'
  /** 9 章：夜明け・帰りの光（→2086） */
  | 'return'

export const NAMBA_V7_STEPS: readonly NambaV7Step[] = ['arrive', 'sketch', 'search', 'depart', 'between', 'shrine_talk', 'defense', 'return']

/** いまの段階（フラグだけから） */
export function nambaV7Step(f: Flags): NambaV7Step {
  if (f('v7_dial_seen')) {
    if (f('v7_shrine_saved')) return 'return'
    if (f('v7_shrine_talk')) return 'defense'
    return 'shrine_talk'
  }
  if (f('v7_back1')) return 'between'
  if (f('v7_search_done')) return 'depart'
  if (f('v7_sketch_seen')) return 'search'
  if (f('v7_beast_down')) return 'sketch'
  return 'arrive'
}

/** 段階ごとの到着地点（?continue・?flags= で途中から始めたとき） */
export const STEP_SPAWN: Record<NambaV7Step, string> = {
  arrive: 'v7_nextmake',
  sketch: 'v7_lab',
  search: 'v7_lab',
  depart: 'v7_alley',
  between: 'v7_alley',
  shrine_talk: 'v7_alley',
  defense: 'v7_shrine',
  return: 'v7_shrine',
}

/** 段階ごとの時間（路地の時間） */
export const STEP_TIME: Record<NambaV7Step, AlleyPhase> = {
  arrive: 'day',
  sketch: 'day',
  search: 'day',
  depart: 'day',
  between: 'day',
  shrine_talk: 'dusk',
  defense: 'night',
  return: 'dawn',
}

/** 戦えるか（K で攻撃。ほかの段階では「ここでは戦わない」） */
export function combatStep(step: NambaV7Step): boolean {
  return step === 'arrive' || step === 'defense'
}

/** 曲（戦闘・ボスの曲はシェルがかぶせる） */
export function stepMusic(step: NambaV7Step): 'present2026' | 'night2086' {
  return step === 'defense' ? 'night2086' : 'present2026'
}

/** 目標を決めるための、フラグ以外の場面の状態 */
export type NambaV7Ctx = {
  /** 6 章：影獣と戦っている（よろいの残り・佐伯さんがつかまっている） */
  fight?: { plates: number; grabbed: boolean } | null
  /** 6 章：社長についてラボへ（まだ着いていない） */
  toLab?: boolean
  /** 6 章：検索の画面をひらいた・町で調べた数 */
  searchOpen?: boolean
  checked?: number
  /** 9 章：社長とほこらへ向かっている */
  toShrine?: boolean
  /** 9 章：防衛戦の段階 */
  defense?: 'wait' | 'wave1' | 'wave2' | 'projection' | 'big_dark' | 'big_lit' | 'won' | null
  /** 9 章：帰りの光がひらいている */
  ringOpen?: boolean
}

export type Objective = { title: string; sub: string }

/** 左上の目標（子どもにわかる一言） */
export function nambaV7Objective(step: NambaV7Step, c: NambaV7Ctx = {}): Objective {
  switch (step) {
    case 'arrive':
      if (c.fight) {
        if (c.fight.grabbed) return { title: '佐伯さんを助けよう', sub: '佐伯さんをつかんだ影の腕を、J で引きはがす' }
        if (c.fight.plates > 0) return { title: 'よろいを J ではがそう', sub: `よろいの影獣：鉄の板や看板を 1 枚ずつ（あと ${c.fight.plates} 枚）` }
        return { title: 'K で攻撃！', sub: 'よろいがはがれた。むき出しの影獣をたおそう' }
      }
      return { title: '60年前の大阪', sub: 'NEXTMAKE のビルの前。かんばんの光から出てきた' }
    case 'sketch':
      if (c.toLab) return { title: '社長について、ラボへ', sub: 'NEXTMAKE のビルの中。「LAB」の扉の奥' }
      return { title: '社長の絵を見よう', sub: 'ラボの構想ボードの前で F' }
    case 'search':
      if (!c.searchOpen) return { title: '佐伯さんの端末で、記録をさがそう', sub: 'ラボの佐伯さんの作業台の画面で F' }
      return { title: `「時計」のかんばんを調べよう（${c.checked ?? 0}/3）`, sub: '時計屋の看板・駅の大時計・古い路地のかんばん（前で F）' }
    case 'depart':
      return { title: '路地のかんばんの QR を読もう', sub: '古い路地のかんばんの前で F。青い刃のかけらを、たしかめに行く' }
    case 'between':
      return { title: '60年前の大阪', sub: '（江戸から帰ったあと。2086年のソラのところへ）' }
    case 'shrine_talk':
      if (c.toShrine) return { title: '路地のおくの、ほこらへ', sub: '社長といっしょに、路地をぬけた先の空き地へ' }
      return { title: '社長に話そう', sub: 'ほこらのことを、マツイ社長に（F）' }
    case 'defense':
      switch (c.defense) {
        case 'wave1':
        case 'wave2':
          return { title: 'ほこらを守ろう', sub: '屋根の影は J で引きずり下ろす・箱にとびかかる影は K で' }
        case 'projection':
          return { title: '江戸の朝の光！', sub: '社長が、路地のかんばんで朝を映している' }
        case 'big_dark':
          return { title: '大きな影を照らそう', sub: 'F で社長に光の向きを変えてもらう（暗がりでは効かない）' }
        case 'big_lit':
          return { title: '照らされた大きな影をたおせ', sub: 'J で飛びついて引きたおす・K で攻撃' }
        case 'won':
          return { title: '本物の朝', sub: 'ほこらは、ぶじだった' }
        default:
          return { title: '夜の路地', sub: '空にひびが……' }
      }
    case 'return':
      if (c.ringOpen) return { title: '光の輪から帰ろう', sub: 'ほこらの前の光の輪で F（2086年へ）' }
      return { title: '本物の朝', sub: '社長の話を聞こう' }
  }
}

/** 町のかんばんの id（layoutV7.ts の KANBAN）→ 記録の id（idoSearchLogic.ts） */
export const KANBAN_RECORD: Record<'b' | 'c' | 'd', string> = { b: 'clock_shop', c: 'old_alley', d: 'station_clock' }

/** 段階ごとの会話のキー（lines_v7.json にあることをテストで確かめる） */
export const NAMBA_V7_LINE_KEYS = [
  'arrive_out',
  'beast_emerge',
  'beast_armor',
  'beast_hint',
  'beast_grab',
  'beast_released',
  'beast_dropped',
  'beast_plate',
  'beast_bare',
  'beast_down',
  'tell_2086',
  'lab_arrive',
  'sketch_show',
  'sketch_corner',
  'saeki_stone',
  'search_start',
  'search_result',
  'search_go',
  'kanban_not_yet',
  'rec_clock_shop',
  'rec_station_clock',
  'rec_old_alley',
  'alley_found',
  'depart_touch',
  'depart_go',
  'between',
  'arrive9',
  'land_plan',
  'shrine_meet',
  'night_falls',
  'defense_hint',
  'wave2',
  'shrine_low',
  'shrine_broken',
  'projection',
  'shadows_flee',
  'big_appear',
  'big_dark_hit',
  'big_aim',
  'big_flee',
  'big_down',
  'dawn',
  'decision',
  'notebook',
  'return_ready',
] as const
