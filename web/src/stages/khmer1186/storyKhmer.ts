// 11章「900年前のカンボジア」の進み方。フラグだけから段階が決まる純粋な計算（tests/khmerStory.test.ts）。
//   arrive（着く）→ meet（チャンダ・おばあさん・アルンの話・たたかい方）→ mirrors（三つの塔に夜明けの鏡）→
//   night（寺の階段の防衛：トワ・落ちる石・影）→ ura（夜明けの光の扉から裏側へ：オルムの心臓）→ after（900 本の筋・最後の光）→ return（帰還）
import type { Flags } from '../../chronicle/progress'
import type { TowerId } from './layout'

export type KhmerStep = 'arrive' | 'meet' | 'mirrors' | 'night' | 'ura' | 'after' | 'return'

export const KHMER_STEPS: readonly KhmerStep[] = ['arrive', 'meet', 'mirrors', 'night', 'ura', 'after', 'return']

export const MIRROR_FLAGS: Record<TowerId, string> = { n: 'v7_mirror_n', e: 'v7_mirror_e', s: 'v7_mirror_s' }

/** まだ鏡を立てていない塔 */
export function mirrorsLeft(f: Flags): TowerId[] {
  return (['n', 'e', 's'] as TowerId[]).filter((id) => !f(MIRROR_FLAGS[id]))
}

export function khmerStep(f: Flags): KhmerStep {
  if (!f('v7_khmer_arrived')) return 'arrive'
  if (!f('v7_met_chanda')) return 'meet'
  if (mirrorsLeft(f).length > 0) return 'mirrors'
  if (!f('v7_stairs_defended')) return 'night'
  if (!f('v7_heart1')) return 'ura'
  if (!f('v7_khmer_done')) return 'after'
  return 'return'
}

/** 段階の頭から始めるときの到着地点（layout.ts の SPAWNS） */
export function khmerSpawn(step: KhmerStep): string {
  switch (step) {
    case 'arrive':
    case 'meet':
      return 'arrive'
    case 'mirrors':
      return 'temple'
    case 'night':
      return 'stairs'
    case 'ura':
    case 'after':
    case 'return':
      return 'altar'
  }
}

/** 段階ごとの時間（昼・夜・夜明け） */
export function khmerTime(step: KhmerStep): 'afternoon' | 'night' | 'dawn' {
  if (step === 'night') return 'night'
  if (step === 'ura' || step === 'after' || step === 'return') return 'dawn'
  return 'afternoon'
}

/**
 * 村の人の台詞の場面（mob_lines_v7.json）：day（着いてからおばあさんに会うまで）・mirrors（鏡を立てる間）・
 * night（村の人は出ない）・dawn（夜明けのあと）。ball：木に引っかかったまりを子どもに返した（昼だけ *_ball）
 */
export function khmerMobPhase(step: KhmerStep, ball = false): string {
  const t = khmerTime(step)
  if (t === 'night') return 'night'
  if (t === 'dawn') return 'dawn'
  const p = step === 'mirrors' ? 'mirrors' : 'day'
  return ball ? `${p}_ball` : p
}

/** 夜の防衛の中の段階（実行中だけ。セーブはしない：夜の頭からやり直す） */
export type NightPhase = 'intro' | 'climb' | 'defend' | 'talk' | 'dawn'

/** 昼の、鏡を立てる前の小さな段階（実行中だけ） */
export type MeetPhase = 'find' | 'follow' | 'altar'

export type ObjectiveCtx = {
  meet?: MeetPhase
  night?: NightPhase
  /** 東の塔：回る鏡の台を正しい向きで止めた */
  turntableSolved?: boolean
  /** 近い塔（鏡の目標の書き分け） */
  near?: TowerId | null
  /** 近い塔の仕掛けをこえた（北：島に着いた・南：上の台に上がった）。まだなら仕掛けの手がかりを出す */
  climbed?: boolean
}

const TOWER_SUB: Record<TowerId, string> = {
  n: '北の塔：池の上の家から家へ、J で飛びうつる',
  e: '東の塔：回る鏡の台を J で止めて、光を塔の上へ',
  s: '南の塔：落ちてくる石を J で止めて、足場にする',
}

/** 左上の目標（子どもにわかる一言） */
export function khmerObjective(step: KhmerStep, f: Flags, o: ObjectiveCtx = {}): { title: string; sub: string } {
  switch (step) {
    case 'arrive':
      return { title: '900年前のカンボジア', sub: 'まわりを見てみよう' }
    case 'meet':
      if (o.meet === 'follow') return { title: 'チャンダについていく', sub: 'お寺のいちばん上で、おばあさんが待っている' }
      if (o.meet === 'altar') return { title: 'おばあさんの話を聞く', sub: 'アルンのそばへ（F で話す）' }
      return { title: '刃を持った女の子と話す', sub: 'F で話す' }
    case 'mirrors': {
      const left = mirrorsLeft(f)
      const title = `夜明けの鏡を塔に立てる（のこり ${left.length}）`
      if (o.near && left.includes(o.near)) {
        if (o.near === 'e' && !o.turntableSolved) return { title, sub: TOWER_SUB.e }
        if (o.near !== 'e' && o.climbed === false) return { title, sub: TOWER_SUB[o.near] }
        return { title, sub: o.near === 'e' ? '東の塔の上の、光っている台で F' : `${o.near === 'n' ? '北' : '南'}の塔の上の台で F：鏡を立てる` }
      }
      return { title, sub: left.map((id) => TOWER_SUB[id].split('：')[0]).join('・') + ' へ' }
    }
    case 'night':
      switch (o.night) {
        case 'climb':
          return { title: '大階段をのぼる', sub: '落ちてくる石を J で止めて、足場にする' }
        case 'defend':
          return { title: 'チャンダと背中あわせで守る', sub: '影を K でたたき、J で引きよせる' }
        case 'talk':
        case 'dawn':
          return { title: 'トワ……', sub: '' }
        default:
          return { title: '夜がきた', sub: 'アルンを守る' }
      }
    case 'ura':
      return { title: '夜明けの光の扉', sub: 'チャンダといっしょに、裏側のオルムの心臓へ' }
    case 'after':
      return { title: 'アルンの最後の光', sub: '' }
    case 'return':
      return { title: '2086年へ帰る', sub: '光の輪で F' }
  }
}

/** 塔の上の台で鏡を立てられるか（東は回る鏡の台を解いてから） */
export function canPlaceMirror(id: TowerId, f: Flags, turntableSolved: boolean): boolean {
  if (f(MIRROR_FLAGS[id])) return false
  if (!f('v7_met_chanda')) return false
  if (id === 'e' && !turntableSolved) return false
  return true
}

/** 夜の防衛の波（上の台で出す影の数と種類）。i は波の番号（0 から） */
export const NIGHT_WAVES: ReadonlyArray<ReadonlyArray<'mite' | 'shield'>> = [
  ['mite', 'mite', 'mite'],
  ['mite', 'mite', 'shield', 'mite'],
]

/** トワがくずす大階段の区切り（のぼる間に。下から 0） */
export const COLLAPSE_PLAN: ReadonlyArray<{ seg: number; at: number }> = [
  { seg: 2, at: 0 },
  { seg: 5, at: 0.6 },
]
