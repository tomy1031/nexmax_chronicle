// ネクマックスのポーズを操作とクローの状態から決める。
// 新しいリグ（rigid-parts）は 'jump' | 'fall' | 'land' | 'swing' | 'pulled' | 'fire' などを持ち、
// 任意で setClaw / setSwing / setOreGlow を持つ。まだ無い場合（仮モデル）は従来のポーズへ読み替える。
import type { Character, Pose } from '../world/characters'
import type { ClawTargetType, WirePhase } from './clawLogic'

export type RichPose = 'idle' | 'walk' | 'run' | 'dash' | 'jump' | 'fall' | 'land' | 'swing' | 'pulled' | 'fire' | 'hold' | 'punch' | 'punchL' | 'hurt' | 'sit'
type LegacyPose = 'idle' | 'walk' | 'hold'

export type PoseInput = {
  wirePhase: WirePhase
  targetType: ClawTargetType | null
  grounded: boolean
  /** 上下の速度（m/s） */
  vy: number
  /** 水平の速さ（m/s） */
  speed: number
  dash: boolean
  /** 着地してからの残り時間（> 0 の間は land） */
  landTimer: number
  /** 空振りの射出など、腕を突き出して見せる残り時間 */
  fireTimer: number
  /** 戦闘（combat/）が決めるポーズ：攻撃・回避・被弾（無ければ null） */
  combat?: 'punch' | 'punchL' | 'dash' | 'hurt' | null
}

export function choosePose(s: PoseInput): RichPose {
  switch (s.wirePhase) {
    case 'swinging':
      return 'swing'
    case 'zipping':
      return 'pulled'
    case 'holding':
      return 'hold'
    case 'firing':
    case 'reeling':
    case 'miss':
      return 'fire'
  }
  if (s.combat) return s.combat
  if (s.fireTimer > 0) return 'fire'
  if (!s.grounded) return s.vy > 0.5 ? 'jump' : 'fall'
  if (s.landTimer > 0) return 'land'
  if (s.speed > 4.6) return s.dash ? 'dash' : 'run'
  if (s.speed > 0.3) return 'walk'
  return 'idle'
}

/** 従来の仮モデルが持つポーズへの読み替え */
export function legacyPose(p: RichPose, speed: number): LegacyPose {
  switch (p) {
    case 'swing':
    case 'pulled':
    case 'fire':
    case 'hold':
    case 'punch':
    case 'punchL':
      return 'hold'
    case 'idle':
    case 'land':
    case 'hurt':
    case 'sit':
      return 'idle'
    case 'jump':
    case 'fall':
      return speed > 0.3 ? 'walk' : 'idle'
    default:
      return 'walk'
  }
}

/** 任意の拡張メソッド（新しいリグだけが持つ） */
type RigExtras = {
  setClaw?: (open: number, extended: number) => void
  setSwing?: (angleRad: number) => void
  setOreGlow?: (v: number) => void
}

/** 新しいリグか（setClaw を持つか）で判定 */
export function isRichRig(ch: Character): boolean {
  return 'setClaw' in ch
}

export function applyPose(ch: Character, pose: RichPose, speed: number): void {
  const p: RichPose | LegacyPose = isRichRig(ch) ? pose : legacyPose(pose, speed)
  ch.setPose(p as Pose)
}

/** 新しいリグなら腕の爪の開閉（0/1）と伸び（0/1）を渡す */
export function applyRigClaw(ch: Character, open: boolean, extended: boolean): void {
  const x = ch as unknown as RigExtras
  if ('setClaw' in ch && typeof x.setClaw === 'function') x.setClaw(open ? 1 : 0, extended ? 1 : 0)
}

export function applyRigSwing(ch: Character, angleRad: number): void {
  const x = ch as unknown as RigExtras
  if ('setSwing' in ch && typeof x.setSwing === 'function') x.setSwing(angleRad)
}

export function applyRigOreGlow(ch: Character, v: number): void {
  const x = ch as unknown as RigExtras
  if ('setOreGlow' in ch && typeof x.setOreGlow === 'function') x.setOreGlow(v)
}
