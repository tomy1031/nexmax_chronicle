// スマホのタッチ操作の決まりごと（描画にも DOM にも依存しない純粋なロジック）。
// ・タッチを出すかどうかの判定（スマホだけ。PC はタッチ画面つきでもキーボード操作のまま）
// ・画面左側のスティック：指の移動量 → move（-1〜1）と、大きく倒したときのダッシュ
// ・キー案内（Hint）→ タッチのボタン名と、画面下に出す案内への読み替え
import type { Axis2 } from './inputActions'
import type { Hint } from '../ui/hud'

export const TOUCH_TUNING = {
  /** スティックの半径（CSS px）。ノブはこの円の中だけを動く */
  stickRadius: 52,
  /** 中心付近の遊び（半径に対する割合） */
  deadzone: 0.14,
  /** 指が半径のこの倍率より外へ出たらダッシュ */
  dashAt: 1.35,
  /** 画面の左からこの割合までに触れるとスティック、それより右はカメラ */
  stickZone: 0.45,
  /** 右側のドラッグ 1 px あたりのカメラの回転（rad） */
  lookYawPerPx: 0.0075,
  lookPitchPerPx: 0.0055,
}

export type TouchEnv = {
  /** URL の ?touch=（'1' で強制オン、'0' で強制オフ） */
  param: string | null
  /** 主な入力が指（CSS の pointer: coarse） */
  coarse: boolean
  /** 主な入力でホバーできない（CSS の hover: none） */
  hoverNone: boolean
  /** navigator.maxTouchPoints */
  touchPoints: number
}

/**
 * タッチ操作を出すか。主な入力が指でホバーできない端末（スマホ）だけ。
 * タッチ画面つきの PC は主な入力がマウス・トラックパッドなので出さない。
 */
export function shouldUseTouch(env: TouchEnv): boolean {
  if (env.param === '1') return true
  if (env.param === '0') return false
  return env.touchPoints > 0 && env.coarse && env.hoverNone
}

export type StickState = {
  /** move アクション（x=右、y=前） */
  move: Axis2
  dash: boolean
  /** ノブの表示位置（スティックの中心から、CSS px。半径の円の中に収める） */
  knobX: number
  knobY: number
}

/** 指の移動量（スティックの中心から、画面の下向きが +dy）→ スティックの状態 */
export function stickVector(dx: number, dy: number, cfg: typeof TOUCH_TUNING = TOUCH_TUNING): StickState {
  const dist = Math.hypot(dx, dy)
  const r = dist / cfg.stickRadius
  const knob = dist > cfg.stickRadius ? cfg.stickRadius / dist : 1
  const out: StickState = { move: { x: 0, y: 0 }, dash: false, knobX: dx * knob, knobY: dy * knob }
  if (r <= cfg.deadzone) return out
  const mag = Math.min(1, (r - cfg.deadzone) / (1 - cfg.deadzone))
  out.move.x = (dx / dist) * mag
  out.move.y = (-dy / dist) * mag
  out.dash = r >= cfg.dashAt
  return out
}

// ------------------------------------------------------------------ キー案内 → タッチ

export type TouchButtonId = 'claw' | 'jump' | 'interact' | 'lock'

export type TouchHintView = {
  /** 各ボタンの文字。null は隠す */
  labels: Record<TouchButtonId, string | null>
  /** 画面下に出す案内（キー名は使わない） */
  hud: Hint[]
}

export type TouchHintContext = {
  /** 近くに話せる相手がいる */
  canInteract: boolean
  /** 狙える対象が複数あって切り替えられる */
  canSwitch: boolean
}

/** ボタンに載せるキー */
const KEY_BUTTON: Partial<Record<string, TouchButtonId>> = { J: 'claw', Space: 'jump', F: 'interact', R: 'lock' }

/** 指の動きで置き換えるキー */
const KEY_GESTURE: Partial<Record<string, string>> = {
  WASD: 'スティック',
  '↑↓←→': '右側をなぞる',
  Shift: '大きく倒す',
}

/**
 * キーボード用の案内をタッチ用に読み替える。ボタンに載せられるもの（J・Space・F・R）はボタンの文字に、
 * 移動・カメラ・ダッシュは指の動きの案内にする。Esc などは画面のボタンがあるので出さない。
 * 「話す」「切替」は使えるときだけ出す（案内の有無ではなく状況で決める）。
 */
export function touchHintView(hints: readonly Hint[], ctx: TouchHintContext): TouchHintView {
  const fromKey: Partial<Record<TouchButtonId, string>> = {}
  const hud: Hint[] = []
  for (const h of hints) {
    const b = KEY_BUTTON[h.key]
    if (b) {
      fromKey[b] = h.label
      continue
    }
    const g = KEY_GESTURE[h.key]
    if (g) hud.push({ key: g, label: h.label })
  }
  return {
    labels: {
      claw: fromKey.claw ?? 'つかむ',
      jump: fromKey.jump ?? 'ジャンプ',
      interact: ctx.canInteract ? (fromKey.interact ?? '話す') : null,
      lock: ctx.canSwitch ? (fromKey.lock ?? '切替') : null,
    },
    hud,
  }
}

/** 目的の説明文にあるキーの言い方をタッチ用にする（「J でつかむ」→「「つかむ」をタップ」） */
export function toTouchText(text: string): string {
  return text.replace(/J で(つかむ|離す)/g, '「$1」をタップ')
}
