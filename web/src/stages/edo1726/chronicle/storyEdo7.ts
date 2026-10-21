// 7 章「江戸の時計師（1726年）」の進み具合。フラグだけから段階が決まる純粋な計算（セーブから再開しても同じ段階から）。
// 段階：arrive（到着・茶運び人形とおはる）→ workshop（工房：書・木の箱のかけら・源兵衛の話）→ demo（実演・爪の設計）
//   → night（夜：空のひび・時の鐘人形のボス戦・夜明け）→ dawn（朝：爪・針の目もり・思いつき・箱をほこらへ）→ leave（帰還）
// 時の鐘人形の歯車の順番（右の肩・左のひざ・胸）と保持の時間も、ここで決める（GearOrder）。描画・DOM には依存しない。
import type { Flags } from '../../../chronicle/progress'

export type EdoStep = 'arrive' | 'workshop' | 'demo' | 'night' | 'dawn' | 'leave'

export const EDO_STEPS: readonly EdoStep[] = ['arrive', 'workshop', 'demo', 'night', 'dawn', 'leave']

export function edoStep(f: Flags): EdoStep {
  if (f('v7_claw_stored')) return 'leave'
  if (f('v7_doll_down')) return 'dawn'
  if (f('v7_demo_seen')) return 'night'
  if (f('v7_fragment_seen')) return 'demo'
  if (f('v7_met_oharu')) return 'workshop'
  return 'arrive'
}

/** 段階の頭の到着地点（stages/edo1726/chronicle/layout.ts の CHRONICLE_SPAWNS） */
export function edoSpawn(step: EdoStep): string {
  switch (step) {
    case 'arrive':
      return 'v7_alley'
    case 'workshop':
      return 'v7_street'
    case 'demo':
    case 'night':
    case 'dawn':
      return 'v7_workshop'
    case 'leave':
      return 'v7_return'
  }
}

/** 段階の時間帯 */
export function edoTime(step: EdoStep): 'day' | 'night' | 'morning' {
  if (step === 'night') return 'night'
  if (step === 'dawn' || step === 'leave') return 'morning'
  return 'day'
}

/** 段階の中の細かい進み（フラグにしない、その場だけの状態） */
export type EdoSub = {
  /** arrive：人形を止めた（おはると会う場面の前） */
  dollCaught?: boolean
  /** workshop：工房に入った・書を見た */
  inWorkshop?: boolean
  bookSeen?: boolean
  /** night：ボス戦のどこか（before：広場へ行く前／fight：戦い／claw：爪で裂く／over：夜明け） */
  boss?: 'before' | 'fight' | 'claw' | 'over'
  /** 次につかむ歯車（0〜2） */
  nextGear?: number
  /** dawn：箱を運んでいる・箱を運ぶ番 */
  carryBox?: boolean
  boxReady?: boolean
}

export const GEAR_LABELS = ['右の肩', '左のひざ', '胸'] as const

/** 左上の目標（子どもにわかる一言） */
export function edoObjective(step: EdoStep, s: EdoSub = {}): { title: string; sub: string } {
  switch (step) {
    case 'arrive':
      return s.dollCaught ? { title: 'おはると話そう', sub: '茶運び人形を追ってきた女の子' } : { title: '歩いてくる人形を止めよう', sub: '照準を人形へ向けて J でつかむ' }
    case 'workshop':
      if (!s.inWorkshop) return { title: 'おはるについて、工房へ', sub: '「源兵衛」の大きな看板のお店' }
      if (!s.bookSeen) return { title: '机の上の書を見よう', sub: '書の前で F' }
      return { title: '奥の木の箱へ近づこう', sub: '背中の石が、何かにこたえている' }
    case 'demo':
      return { title: '源兵衛さんの実演を見よう', sub: '作業台のそばへ行く' }
    case 'night':
      if (s.boss === 'fight') {
        const g = s.nextGear ?? 0
        return { title: `${GEAR_LABELS[g]}の歯車を止めよう`, sub: '光る歯車を J でつかんで、はなさない' }
      }
      if (s.boss === 'claw') return { title: '爪で、胸の影を裂こう', sub: '時の鐘人形のそばで F' }
      if (s.boss === 'over') return { title: '夜が明ける', sub: '東の空が明るくなってきた' }
      return { title: '裏口から広場へ！', sub: '時の鐘人形が工房へ向かってくる' }
    case 'dawn':
      if (s.carryBox) return { title: '箱をほこらへ運ぼう', sub: '路地のおくの「時の神さま」のほこらの前で F' }
      if (s.boxReady) return { title: 'からくりの箱を持とう', sub: '箱へ照準を向けて J' }
      return { title: '源兵衛さんと話そう', sub: '爪ができあがった' }
    case 'leave':
      return { title: '光の輪で帰ろう', sub: '石が元の時代へ引っぱっている' }
  }
}

/** 時の鐘人形の歯車の順番と保持（3 秒つかみつづけると止まる） */
export type GrabResult = 'hold' | 'wrong' | 'already'

export class GearOrder {
  /** 止めた数（次につかむ歯車の番号） */
  next = 0
  /** つかんでいる歯車（-1 はつかんでいない） */
  holding = -1
  holdT = 0
  /** まちがえた回数（人形が怒る） */
  mistakes = 0
  readonly holdSec: number

  constructor(holdSec = 3) {
    this.holdSec = holdSec
  }

  get done(): boolean {
    return this.next >= 3
  }

  /** つかんだ。正しい歯車なら保持を始める */
  grab(i: number): GrabResult {
    if (i < this.next) return 'already'
    if (i !== this.next) {
      this.mistakes++
      return 'wrong'
    }
    this.holding = i
    this.holdT = 0
    return 'hold'
  }

  /** はなした・ふりほどかれた（止まる前なら、やり直し） */
  release(): void {
    this.holding = -1
    this.holdT = 0
  }

  /** 保持の割合（0〜1） */
  get progress(): number {
    return this.holding < 0 ? 0 : Math.min(1, this.holdT / this.holdSec)
  }

  /** 進める。止まった歯車の番号を返す（止まらなければ -1） */
  tick(dt: number): number {
    if (this.holding < 0) return -1
    this.holdT += dt
    if (this.holdT < this.holdSec) return -1
    const i = this.holding
    this.next = i + 1
    this.release()
    return i
  }

  /** 怒り（攻撃の速さ）：まちがえるほど速く（1〜1.6） */
  get rage(): number {
    return Math.min(1.6, 1 + this.mistakes * 0.2)
  }
}
