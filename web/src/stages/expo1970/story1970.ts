// 1970年 万博（中盤 10章）の進み方。フラグだけから段階・目標を決める純粋なロジック（tests/story1970.test.ts）。
// docs/中盤シナリオとワールド構成_v1.md §3.2：
//   到着 → 欠け（戦闘の基本）→ ミチ → 電気の館の作業台 → 部品 3 つ（順番は自由）→ はじくNMClaw →
//   塔の壁を割って登る → 錨の番人（ミライ号）→ 錨をほどく（ミチの合図で離す）→ 別れ → 2086年へ
// 寄り道：時のかけら 5 個・迷子の子・ロープウェイの係員の帽子。

export type ExpoStep = 'arrive' | 'first_fight' | 'meet_michi' | 'to_bench' | 'parts' | 'assemble' | 'tower' | 'unravel' | 'farewell' | 'done'

type F = (name: string) => boolean

export const EXPO_PARTS = [
  { id: 'ropeway', flag: 'expo_part_ropeway', name: '放電コイル', where: 'ロープウェイ（西）' },
  { id: 'bamboo', flag: 'expo_part_bamboo', name: '共鳴ばね', where: '日本庭園（南西）' },
  { id: 'swarm', flag: 'expo_part_swarm', name: '試作の爪', where: '工事中の区画（北東）' },
] as const

export const EXPO_SHARD_FLAGS = ['expo_shard_capsule', 'expo_shard_ropeway', 'expo_shard_bamboo', 'expo_shard_store', 'expo_shard_tower'] as const

export function partsCount(f: F): number {
  return EXPO_PARTS.filter((p) => f(p.flag)).length
}

export function shardCount(f: F): number {
  return EXPO_SHARD_FLAGS.filter((s) => f(s)).length
}

/** いまの段階（保存したフラグから。再開しても同じところから） */
export function expoStep(f: F): ExpoStep {
  if (f('expo_farewell')) return 'done'
  if (f('expo_anchor_cleared')) return 'farewell'
  if (f('expo_boss_down')) return 'unravel'
  if (f('impact_claw_got')) return 'tower'
  if (f('expo_bench')) return partsCount(f) >= EXPO_PARTS.length ? 'assemble' : 'parts'
  if (f('met_michi')) return 'to_bench'
  if (f('expo_first_fight')) return 'meet_michi'
  if (f('expo_arrived')) return 'first_fight'
  return 'arrive'
}

/** ミチの居場所 */
export function michiSpot(step: ExpoStep): 'hidden' | 'plaza' | 'bench' | 'tower' | 'farewell' {
  switch (step) {
    case 'arrive':
    case 'first_fight':
      return 'hidden'
    case 'meet_michi':
      return 'plaza'
    case 'to_bench':
    case 'parts':
    case 'assemble':
      return 'bench'
    case 'tower':
    case 'unravel':
      return 'tower'
    case 'farewell':
    case 'done':
      return 'farewell'
  }
}

/** 到着地点（再開したときの既定） */
export function expoSpawn(step: ExpoStep): string {
  switch (step) {
    case 'arrive':
    case 'first_fight':
      return 'arrive'
    case 'meet_michi':
      return 'plaza'
    case 'to_bench':
    case 'parts':
    case 'assemble':
      return 'workbench'
    case 'tower':
      return 'tower'
    case 'unravel':
      return 'deck'
    case 'farewell':
    case 'done':
      return 'return'
  }
}

export type Objective = { title: string; sub: string }

/** 目標（左上）。wallBroken：塔の壁を割った（その場の状態） */
export function expoObjective(step: ExpoStep, f: F, o: { wallBroken?: boolean; onDeck?: boolean; bossAlive?: boolean } = {}): Objective {
  switch (step) {
    case 'arrive':
      return { title: '1970年……？', sub: '' }
    case 'first_fight':
      return { title: '欠けから来場者を守ろう', sub: 'K：攻撃　J：引き寄せる　Shift：回避' }
    case 'meet_michi':
      return { title: '', sub: '' }
    case 'to_bench':
      return { title: 'ミチと電気の館の作業台へ', sub: '広場の東・動く歩道の先' }
    case 'parts': {
      const left = EXPO_PARTS.filter((p) => !f(p.flag))
      return { title: `「はじく腕」の部品を集めよう（${partsCount(f)}/3）`, sub: left.map((p) => `${p.name}：${p.where}`).join('　') }
    }
    case 'assemble':
      return { title: 'ミチの作業台へ戻ろう', sub: '部品が三つそろった' }
    case 'tower':
      if (o.onDeck && o.bossAlive) return { title: '錨の番人を止めよう', sub: 'Q で左腕 → J：はじくで装甲を割ってから K で攻撃' }
      if (!o.wallBroken && !f('expo_wall_broken')) return { title: '未来の塔の前の、ひび割れた壁を壊そう', sub: 'Q：左腕を選ぶ → 壁の前で J：はじく' }
      return { title: '未来の塔を登ろう', sub: '段のふちの下の金具を見上げて J：飛びつく（E で右腕）' }
    case 'unravel':
      return { title: '錨の糸をほどこう', sub: '結び目を J でつかみ、ミチの合図（青緑の光）でもう一度 J：離す' }
    case 'farewell':
      return { title: 'ミチのところへ戻ろう', sub: '中央広場' }
    case 'done':
      return { title: '光の輪で2086年へ帰ろう', sub: `時のかけら ${shardCount(f)}/5　寄り道もできる` }
  }
}

// ------------------------------------------------------------------ 錨をほどく（1726年の水門と同じ「ええ時に離す」）

export const UNRAVEL = {
  /** ほどくのに必要な成功の数 */
  need: 3,
  /** 「待って」（オレンジ）の長さ（秒。順に使う） */
  waits: [2.4, 1.7, 3.0, 2.1] as readonly number[],
  /** 「今！」（青緑）の長さ（秒） */
  goSec: 1.5,
}

export type UnravelSignal = 'off' | 'wait' | 'go'

export class UnravelLogic {
  done = 0
  holding = false
  signal: UnravelSignal = 'off'
  t = 0
  private k = 0

  get finished(): boolean {
    return this.done >= UNRAVEL.need
  }

  /** 結び目をつかんだ */
  grab(): void {
    if (this.finished) return
    this.holding = true
    this.signal = 'wait'
    this.t = 0
  }

  /** 離した：今！ なら成功、それ以外は早すぎ */
  release(): 'success' | 'early' | 'none' {
    if (!this.holding) return 'none'
    this.holding = false
    const was = this.signal
    this.signal = 'off'
    this.t = 0
    if (was === 'go') {
      this.done++
      this.k++
      return 'success'
    }
    return 'early'
  }

  /** 時間を進める。今！ の間に離さなかったら missed（また待ってになる） */
  tick(dt: number): 'go' | 'missed' | null {
    if (!this.holding) return null
    this.t += dt
    if (this.signal === 'wait' && this.t >= UNRAVEL.waits[this.k % UNRAVEL.waits.length]) {
      this.signal = 'go'
      this.t = 0
      return 'go'
    }
    if (this.signal === 'go' && this.t >= UNRAVEL.goSec) {
      this.signal = 'wait'
      this.t = 0
      this.k++
      return 'missed'
    }
    return null
  }

  /** ほどけた割合 0〜1（輪の薄さ・糸の震えに使う） */
  get progress(): number {
    return Math.min(1, this.done / UNRAVEL.need)
  }
}

// ------------------------------------------------------------------ 錨の番人（ミライ号）

/** 体力の割合で、欠け虫を呼ぶ回数（2/3 と 1/3 を切ったとき） */
export function bossWaves(hp: number, maxHp: number): number {
  const k = hp / Math.max(1, maxHp)
  return k <= 1 / 3 ? 2 : k <= 2 / 3 ? 1 : 0
}
