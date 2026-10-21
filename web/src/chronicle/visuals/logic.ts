// v7 の共通の見た目の、純粋な計算（three.js を使わない。tests/chronicleVisuals.test.ts）。
// ・黒い手のふりおろしの時間割（予告 → ふりおろし → 地面で止まる → もどる）
// ・心臓の脈（どくん、どくん）とすじの状態
// ・止める輪の残りの割合と、カチカチの粒を出す瞬間

// ------------------------------------------------------------------ 黒い手のふりおろし

/** ふりおろしの時間割（秒）。windup：手を上げて地面に予告の円 / strike：ふりおろし / stuck：地面で止まる（裂くチャンス） / recover：もどる */
export const SLAM_TIMING = { windup: 1.2, strike: 0.22, stuck: 2.2, recover: 0.7 } as const
export type SlamTiming = { windup: number; strike: number; stuck: number; recover: number }
export type SlamPhase = 'windup' | 'strike' | 'stuck' | 'recover' | 'done'

/** ふりおろしを始めてからの秒 t のときの段階と、その段階の中の進み（0..1） */
export function slamPhase(t: number, s: SlamTiming = SLAM_TIMING): { phase: SlamPhase; k: number } {
  if (t < 0) return { phase: 'windup', k: 0 }
  if (t < s.windup) return { phase: 'windup', k: t / s.windup }
  t -= s.windup
  if (t < s.strike) return { phase: 'strike', k: t / s.strike }
  t -= s.strike
  if (t < s.stuck) return { phase: 'stuck', k: t / s.stuck }
  t -= s.stuck
  if (t < s.recover) return { phase: 'recover', k: t / s.recover }
  return { phase: 'done', k: 1 }
}

/** ふりおろし全体の秒 */
export function slamTotal(s: SlamTiming = SLAM_TIMING): number {
  return s.windup + s.strike + s.stuck + s.recover
}

/** 地面に当たる瞬間（始めてからの秒） */
export function slamImpactAt(s: SlamTiming = SLAM_TIMING): number {
  return s.windup + s.strike
}

/** 予告の円の大きさ（1 から 0.35 へしぼむ）と明るさ。windup の間だけ出る */
export function slamWarning(t: number, s: SlamTiming = SLAM_TIMING): { show: boolean; ring: number; fill: number } {
  const p = slamPhase(t, s)
  if (p.phase === 'windup') return { show: true, ring: 1 - 0.15 * p.k, fill: p.k }
  if (p.phase === 'strike') return { show: true, ring: 0.85, fill: 1 }
  return { show: false, ring: 0, fill: 0 }
}

// ------------------------------------------------------------------ オルムの心臓

/**
 * 心臓の脈（0..1）。1 拍の中に「どくん（強）・どくん（弱）」の 2 つの山。rate は 1 秒あたりの拍の数
 */
export function heartBeat(t: number, rate: number): number {
  if (rate <= 0) return 0
  const ph = (t * rate) % 1
  const bump = (c: number, w: number) => Math.exp(-Math.pow((ph - c) / w, 2))
  return Math.min(1, bump(0.08, 0.06) + bump(0.3, 0.07) * 0.6)
}

/** 心臓のまわりのすじ（光をすう黒い管）の状態 */
export class VeinSet {
  private readonly cutAt: number[]
  readonly count: number
  constructor(count: number) {
    this.count = count
    this.cutAt = new Array(count).fill(-1)
  }
  /** i 番目を切る（切れたら true。もう切れていたら false） */
  cut(i: number, now = 0): boolean {
    if (i < 0 || i >= this.count || this.cutAt[i] >= 0) return false
    this.cutAt[i] = now
    return true
  }
  alive(i: number): boolean {
    return i >= 0 && i < this.count && this.cutAt[i] < 0
  }
  get aliveCount(): number {
    return this.cutAt.filter((x) => x < 0).length
  }
  get allCut(): boolean {
    return this.aliveCount === 0
  }
  /** 切られた順（古い順）の番号 */
  get cutOrder(): number[] {
    return this.cutAt
      .map((t, i) => ({ t, i }))
      .filter((x) => x.t >= 0)
      .sort((a, b) => a.t - b.t)
      .map((x) => x.i)
  }
  reset(): void {
    this.cutAt.fill(-1)
  }
}

/** 心臓の脈の速さ：すじが減るほど弱って速く（あせって）打つ。のこり 0 なら 2.2 拍／秒 */
export function heartRate(alive: number, total: number, base = 1.1): number {
  if (total <= 0) return base
  const k = 1 - alive / total
  return base + k * 1.1
}

// ------------------------------------------------------------------ 止める輪

/** 残りの割合（0..1）。total 秒のうち remaining 秒が残っている */
export function freezeArc(remaining: number, total: number): number {
  if (total <= 0) return 0
  return Math.max(0, Math.min(1, remaining / total))
}

/** 前のフレームの残り prev から今の残り now のあいだに、1 秒の区切り（カチ）をまたいだか */
export function freezeTicked(prev: number, now: number): boolean {
  return Math.ceil(prev) !== Math.ceil(now) && now > 0 && now < prev
}
