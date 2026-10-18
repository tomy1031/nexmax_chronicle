// 腕パーツの装備状態（操作マニュアル v1.1 §1・§3・§8.5）と、異次元拠点を開けるかの判定（§5）。
// 初期は右腕に「つかむNMClaw」1 個、左腕は装備なし。装備スロットは左右各 1 つ。純粋なロジック。

export type ArmPart = 'grapple_claw' | 'impact_claw'
export type ArmSide = 'right' | 'left'

export type Equipment = {
  right: ArmPart | null
  left: ArmPart | null
  /** Q／E で選んでいる腕 */
  selected: ArmSide
}

export const PART_NAMES: Record<ArmPart, string> = {
  grapple_claw: 'つかむNMClaw',
  impact_claw: 'はじくNMClaw',
}

export const ARM_NAMES: Record<ArmSide, string> = { right: '右腕', left: '左腕' }

export function initialEquipment(): Equipment {
  return { right: 'grapple_claw', left: null, selected: 'right' }
}

/** 腕の表示名（例「右腕：つかむNMClaw」「左腕：装備なし」） */
export function armLabel(eq: Equipment, side: ArmSide): string {
  const part = eq[side]
  return `${ARM_NAMES[side]}：${part ? PART_NAMES[part] : '装備なし'}`
}

/**
 * Q／E で腕を選ぶ。未装備の腕は選べない（選択は変わらず、表示だけ返す）。
 * 移動などの操作は妨げない（戻り値を見て案内を出すだけ）。
 */
export function selectArm(eq: Equipment, side: ArmSide): { ok: boolean; message: string } {
  if (eq[side] === null) return { ok: false, message: armLabel(eq, side) }
  eq.selected = side
  return { ok: true, message: armLabel(eq, side) }
}

/** いま選んでいる腕のパーツ（J で使う） */
export function selectedPart(eq: Equipment): ArmPart | null {
  return eq[eq.selected]
}

/** 物語の進み具合から装備を決める（左腕の はじくNMClaw は 1970年でミチが組み上げる。docs/中盤シナリオとワールド構成_v1.md §3.2） */
export function equipFromFlags(eq: Equipment, f: (name: string) => boolean): void {
  eq.right = 'grapple_claw'
  eq.left = f('impact_claw_got') ? 'impact_claw' : null
  if (eq[eq.selected] === null) eq.selected = 'right'
}

/** つかむNMClaw を射出できる腕（無ければ null）。初期は右腕だけ。 */
export function clawArm(eq: Equipment): ArmSide | null {
  if (eq[eq.selected] === 'grapple_claw') return eq.selected
  if (eq.right === 'grapple_claw') return 'right'
  if (eq.left === 'grapple_claw') return 'left'
  return null
}

// ------------------------------------------------------------------ 異次元拠点（G）

export type HubContext = {
  /** 物語で異次元拠点が解放済みか */
  unlocked: boolean
  /** 安全なチェックポイントにいるか */
  atSafePoint: boolean
  /** ワイヤー移動中（引き寄せ・振り子） */
  wireMoving: boolean
  /** 落下・ジャンプ中 */
  airborne: boolean
  inCombat: boolean
}

export const HUB_MESSAGES = {
  wire: 'ワイヤー移動中は異次元拠点へ移動できません',
  combat: '戦闘中は異次元拠点を開けません',
  air: '空中では異次元拠点を開けません',
  place: 'ここでは異次元拠点を開けません',
  open: '異次元拠点を開きます',
} as const

/** G を押したときに開けるかどうかと、表示する文 */
export function canOpenHub(c: HubContext): { ok: boolean; message: string } {
  if (c.wireMoving) return { ok: false, message: HUB_MESSAGES.wire }
  if (c.inCombat) return { ok: false, message: HUB_MESSAGES.combat }
  if (c.airborne) return { ok: false, message: HUB_MESSAGES.air }
  if (!c.unlocked || !c.atSafePoint) return { ok: false, message: HUB_MESSAGES.place }
  return { ok: true, message: HUB_MESSAGES.open }
}
