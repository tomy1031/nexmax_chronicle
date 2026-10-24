// 7 章「江戸の時計師（1726年）」の進み具合。フラグだけから段階が決まる純粋な計算（セーブから再開しても同じ段階から）。
// 段階：arrive（到着・茶運び人形とおはる）→ workshop（工房：書・木の箱のかけら・源兵衛の話）→ demo（実演・爪の設計）
//   → night（夜：空のひび・時の鐘人形のボス戦・夜明け）→ dawn（朝：爪・針の目もり・思いつき・箱をほこらへ）→ leave（帰還）
// 時の鐘人形の歯車（右の肩・左のひざ・胸の順に引っぱって止める：GearPulls）と攻撃の順（dollAttack）も、ここで決める。描画・DOM には依存しない。
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

/** 町の人の台詞の場面（mob_lines_v7.json）：day（人形が来る前）・night（町の人は出ない）・morning（夜明けのあと） */
export function edoMobPhase(step: EdoStep): 'day' | 'night' | 'morning' {
  const t = edoTime(step)
  return t === 'day' ? 'day' : t === 'night' ? 'night' : 'morning'
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
  /** ボス戦：次の歯車がいま見えている（すき） */
  open?: boolean
  /** ボス戦：次の歯車が止まるまで、あと何回引っぱるか */
  left?: number
  /** dawn：箱を運んでいる・箱を運ぶ番 */
  carryBox?: boolean
  boxReady?: boolean
}

export const GEAR_LABELS = ['右の肩', '左のひざ', '胸'] as const
/** 歯車ごとの、すきの作り方（目標の下の行） */
const GEAR_HOW = ['赤い円からにげる → 木槌が地面にささったら J', '赤い輪の外へにげる → ひざが止まったら J', '大技の輪をジャンプ → 胸の戸がひらいたら J'] as const

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
        if (g >= 3) return { title: '三つの歯車が止まった！', sub: '時の鐘人形が動けなくなった' }
        const left = s.left && s.left > 1 ? `（あと ${s.left} 回）` : ''
        if (s.open) return { title: `今！ ${GEAR_LABELS[g]}の歯車をつかもう`, sub: `光っている間に J でつかむ！${left}` }
        return { title: `${GEAR_LABELS[g]}の歯車を止めよう`, sub: GEAR_HOW[g] + left }
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

/**
 * 時の鐘人形の歯車：右の肩・左のひざ・胸の順に、1 つにつき PULLS_PER_GEAR 回、引っぱって止める。
 * 歯車は、人形の攻撃をよけたあとの「すき」の間だけ見えて（open）、つかめる。つかんで PULL_SEC 秒で 1 回
 */
export const PULLS_PER_GEAR = 2
/** つかんでから 1 回引っぱるまでの秒 */
export const PULL_SEC = 0.9
/** 止めた数ごとの人形の怒り（攻撃の速さ）：止めるたびに速く。いちばん上でも、腕のふりおろしの予告から当たりまで 1.2 秒より長く（bellDoll の T） */
export const BOSS_RAGE = [1, 1.12, 1.25] as const

export type PullResult = 'hold' | 'closed' | 'later' | 'already'

export class GearPulls {
  /** 止めた数（次の歯車の番号） */
  next = 0
  /** 次の歯車を引っぱった回数 */
  pulls = 0
  /** つかんでいる歯車（-1 はつかんでいない） */
  holding = -1
  holdT = 0
  readonly perGear: number
  readonly holdSec: number

  constructor(perGear = PULLS_PER_GEAR, holdSec = PULL_SEC) {
    this.perGear = perGear
    this.holdSec = holdSec
  }

  get done(): boolean {
    return this.next >= 3
  }

  /** つかんだ。open：いま見えている（すきの）歯車。次の歯車がすきのときだけ、引っぱり始める */
  grab(i: number, open: number | null): PullResult {
    if (i < this.next) return 'already'
    if (i !== this.next) return 'later'
    if (open !== i) return 'closed'
    this.holding = i
    this.holdT = 0
    return 'hold'
  }

  /** はなした（引っぱり終わる前なら、その 1 回はやり直し） */
  release(): void {
    this.holding = -1
    this.holdT = 0
  }

  /** 引っぱりの割合（0〜1） */
  get progress(): number {
    return this.holding < 0 ? 0 : Math.min(1, this.holdT / this.holdSec)
  }

  /** ボスの体力の残り（0〜1） */
  get life(): number {
    return Math.max(0, 1 - (this.next * this.perGear + this.pulls + this.progress) / (3 * this.perGear))
  }

  /** あと何回で、次の歯車が止まるか */
  get left(): number {
    return this.perGear - this.pulls
  }

  /** 進める：1 回引っぱった（pulled）・歯車が止まった（stopped）・まだ（none） */
  tick(dt: number): 'none' | 'pulled' | 'stopped' {
    if (this.holding < 0) return 'none'
    this.holdT += dt
    if (this.holdT < this.holdSec) return 'none'
    this.release()
    this.pulls++
    if (this.pulls < this.perGear) return 'pulled'
    this.next++
    this.pulls = 0
    return 'stopped'
  }

  /** 怒り（攻撃の速さ）：止めた数で決まる */
  get rage(): number {
    return BOSS_RAGE[Math.min(2, this.next)]
  }
}

/** 人形の攻撃：swing＝右うで（木槌）のふりおろし（木槌が地面にささる）・swingL＝左うで（鐘）・bell＝鐘の衝撃波・stomp＝足ぶみ・charge＝大技 */
export type DollAttack = 'swing' | 'swingL' | 'bell' | 'stomp' | 'charge'

/**
 * 次の攻撃。phase：止めた歯車の数、n：その段階で何回目の攻撃か。
 * 段階ごとに、その歯車のすきを作る攻撃（肩：木槌のふりおろし・ひざ：足ぶみ・胸：大技）を軸に、止めるたびに攻撃の種類がふえる
 */
export function dollAttack(phase: number, n: number): DollAttack {
  // すきを作る攻撃は 1 つおき（そのあいだの攻撃は、よけるだけ）
  if (phase <= 0) return (['swingL', 'swing', 'bell', 'swing'] as const)[n % 4]
  if (phase === 1) return (['swingL', 'stomp', 'bell', 'stomp'] as const)[n % 4]
  return (['bell', 'charge', 'swingL', 'charge'] as const)[n % 4]
}

/** すきを作る攻撃（その段階の歯車が見える） */
export function opensGear(a: DollAttack): number | null {
  return a === 'swing' ? 0 : a === 'stomp' ? 1 : a === 'charge' ? 2 : null
}
