// 裏側の戦い（UraBattle）の段の進み方。three.js を使わない純粋な計算（tests/uraBattle.test.ts）。
// ・khmer（11 章・900 年前の夜明け）：入る → チャンダの道を守る → 刃が心臓をつく（すじが光をすう・刃が折れる）
//   → チャンダの足の黒いものを裂く → 扉が閉じる前に帰る → 出る
// ・final（12 章・最後の夜）：入る → すじを 2 本切る → トワが引きずりこまれる → 3 本目 → 最後のすじが扉へ（ランプ）
//   → 心臓を裂こうとする → 最後の光のつぶ（選ぶ）→ 夜明けの一撃 → トワをつかむ → 扉へ走る → 出る

export type UraScenario = 'khmer' | 'final'

export type UraStep =
  | 'idle'
  | 'enter'
  // khmer
  | 'escort'
  | 'stab'
  | 'free'
  // final
  | 'veins'
  | 'towaPulled'
  | 'veins2'
  | 'lastVein'
  | 'heart'
  | 'pour'
  | 'strike'
  | 'grabTowa'
  // 共通
  | 'escape'
  | 'exit'
  | 'done'

export const URA_STEPS: Readonly<Record<UraScenario, readonly UraStep[]>> = {
  khmer: ['enter', 'escort', 'stab', 'free', 'escape', 'exit', 'done'],
  final: ['enter', 'veins', 'towaPulled', 'veins2', 'lastVein', 'heart', 'pour', 'strike', 'grabTowa', 'escape', 'exit', 'done'],
}

/** プレイヤーが何かをする段（それ以外は演出で、自動で進む） */
export const PLAY_STEPS: ReadonlySet<UraStep> = new Set<UraStep>(['escort', 'free', 'escape', 'veins', 'veins2', 'heart', 'pour', 'grabTowa'])

export function isPlayStep(s: UraStep): boolean {
  return PLAY_STEPS.has(s)
}

/** 次の段（最後は done のまま） */
export function nextStep(sc: UraScenario, s: UraStep): UraStep {
  const list = URA_STEPS[sc]
  const i = list.indexOf(s)
  if (i < 0) return list[0]
  return list[Math.min(list.length - 1, i + 1)]
}

/** final：その段を終えるのに切れていなければならないすじの数（veins：2 本、veins2：3 本） */
export function veinsNeeded(s: UraStep): number {
  return s === 'veins' ? 2 : s === 'veins2' ? 3 : 0
}

/** final：すじの段が終わったか */
export function veinsStepDone(s: UraStep, cutCount: number): boolean {
  const n = veinsNeeded(s)
  return n > 0 && cutCount >= n
}

/** khmer：チャンダが進めるか（近くに影がいたら止まる）。dists：まわりの影までの距離 */
export function escortCanMove(dists: readonly number[], blockRadius = 4): boolean {
  return dists.every((d) => d > blockRadius)
}

/** 道のりの割合（0..1）：通った点の数と、いまの区間の進み */
export function pathProgress(index: number, segK: number, count: number): number {
  if (count <= 1) return 1
  return Math.max(0, Math.min(1, (index + Math.max(0, Math.min(1, segK))) / (count - 1)))
}

/** 扉が閉じるまでの残り（秒） */
export function doorLeft(total: number, elapsed: number): number {
  return Math.max(0, total - elapsed)
}

/** 扉の開き具合（残りが少ないほどせまく。0.25 より小さくはしない） */
export function doorWidthK(left: number, total: number): number {
  if (total <= 0) return 0.25
  return 0.25 + 0.75 * Math.max(0, Math.min(1, left / total))
}

/** 扉に入ったか（扉の前・横方向の距離と高さで） */
export function insideDoor(dx: number, dz: number, dy: number, width = 2.2): boolean {
  return Math.hypot(dx, dz) < Math.max(1.0, width * 0.55) && dy > -1.2 && dy < 3.2
}

/** 落ちたかどうか（足場の上面より下へ y が下がった） */
export function fellBelow(y: number, lowestTop: number, margin = 0.7): boolean {
  return y < lowestTop - margin
}

export type UraObjective = { title: string; sub: string }

/** 目標の文言（子どもにわかる一言） */
export function uraObjective(sc: UraScenario, s: UraStep, ctx: { left?: number; veinsLeft?: number; blocked?: boolean } = {}): UraObjective | null {
  const sec = ctx.left !== undefined ? `のこり ${Math.ceil(ctx.left)} 秒` : ''
  switch (s) {
    case 'enter':
      return { title: 'この世の裏側', sub: sc === 'khmer' ? 'チャンダといっしょに' : 'ソラが扉をささえている' }
    case 'escort':
      return ctx.blocked ? { title: 'チャンダの道を守る', sub: '影が道をふさいでいる！ K ではらおう' } : { title: 'チャンダの道を守る', sub: 'チャンダが心臓へ走る。影を近づけないで' }
    case 'stab':
      return { title: 'チャンダの刃が、心臓へ', sub: '' }
    case 'free':
      return { title: 'チャンダの足の、黒いものを裂く', sub: '黒いものをねらって J' }
    case 'veins':
    case 'veins2':
      return { title: `光をすうすじを切る（あと ${ctx.veinsLeft ?? 0} 本）`, sub: 'すじをねらって J で裂く' }
    case 'towaPulled':
    case 'lastVein':
      return { title: 'トワ……！', sub: '' }
    case 'heart':
      return { title: 'オルムの心臓を裂く', sub: '心臓をねらって J' }
    case 'pour':
      return { title: '最後の光のつぶ', sub: 'F で決める' }
    case 'strike':
      return { title: '夜明けの光の一撃', sub: '' }
    case 'grabTowa':
      return { title: 'トワをつかむ', sub: 'トワに近づいて J' }
    case 'escape':
      return { title: sc === 'final' ? 'トワといっしょに、扉へ' : '扉が閉じる前に帰る', sub: sec ? `光の扉へ走ろう（${sec}）` : '光の扉へ走ろう' }
    case 'exit':
      return { title: '扉の外へ', sub: '' }
    default:
      return null
  }
}

/** 台詞のキー（ura_lines.json にあること。テストで確かめる） */
export const URA_LINE_KEYS = [
  'k_enter',
  'k_escort_start',
  'k_escort_block',
  'k_escort_go',
  'k_stab',
  'k_stab_break',
  'k_free',
  'k_freed',
  'k_escape',
  'k_escape_fail',
  'k_exit',
  'f_enter',
  'f_vein1',
  'f_towa_pulled',
  'f_vein3',
  'f_last_vein',
  'f_lamp',
  'f_heart_crack',
  'f_wait',
  'f_pour',
  'f_strike',
  'f_after',
  'f_grab',
  'f_escape',
  'f_escape_fail',
  'f_exit',
  'fall',
] as const

export type UraLineKey = (typeof URA_LINE_KEYS)[number]
