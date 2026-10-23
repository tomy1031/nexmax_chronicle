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

export type TouchButtonId = 'claw' | 'jump' | 'attack' | 'interact' | 'lock'

export type TouchHintView = {
  /** 各ボタンの文字。null は隠す（つかむ・ジャンプは常に出す） */
  labels: Record<TouchButtonId, string | null>
  /** 画面下に出す案内（キー名は使わない。key は指の動きの名前） */
  hud: Hint[]
}

export type TouchHintContext = {
  /**
   * その場で「話す・調べる」ボタン（F）に反応するものの言葉（「話す」「IDO の QR を読む」など）。無ければ null。
   * 照準の案内が優先されて案内に F が無いときでも、ボタンは出しておくために使う
   */
  interact: string | null
  /** 狙える対象が複数あって切り替えられる */
  canSwitch: boolean
  /** 戦いのある場面（K のパンチが使える）。「パンチ」ボタンを出す */
  attack: boolean
}

/** ボタンに載せるキー */
const KEY_BUTTON: Partial<Record<string, TouchButtonId>> = { J: 'claw', Space: 'jump', K: 'attack', F: 'interact', R: 'lock' }

/** 指の動きで置き換えるキー */
const KEY_GESTURE: Partial<Record<string, string>> = {
  WASD: 'スティック',
  '↑↓←→': '右側をなぞる',
  Shift: '大きく倒す',
  'A/D': 'スティック左右',
  'W／S': 'スティック上下',
  '← →': 'スティック左右',
}

/**
 * キーボード用の案内をタッチ用に読み替える。ボタンに載せられるもの（J・Space・F・R）はボタンの文字に、
 * 移動・カメラ・ダッシュ・揺らす・選ぶは指の動きの案内にする。Esc などは画面のボタンがあるので出さない。
 * 「話す」「切替」は使えるときだけ出す。
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
      attack: ctx.attack ? 'パンチ' : null,
      interact: fromKey.interact ?? ctx.interact,
      lock: ctx.canSwitch ? (fromKey.lock ?? '切替') : null,
    },
    hud,
  }
}

/**
 * 目的の説明・台詞にあるキーの言い方をタッチ用にする（順に当てる）。英字の途中（QR・IDO など）には当てない。
 * 「KEY：言葉」（目的の補足）と「KEY で…」（台詞）の両方の形を読み替える。
 */
const TEXT_RULES: Array<[RegExp, string]> = [
  // 目的の補足：「WASD：移動　Space：ジャンプ」など
  [/WASD：/g, '左側をなぞって'],
  [/↑↓←→：/g, '右側をなぞって'],
  [/A\/D：/g, 'スティックを左右に倒して'],
  [/Shift：/g, 'スティックを大きく倒して'],
  [/(^|[^A-Za-z0-9])(?:J|F|R|Space)：([^\s　]+)/g, '$1「$2」'],
  [/(^|[^A-Za-z0-9])K：([^\s　]+)/g, '$1「パンチ」で$2'],
  // 「K でパンチ！」「K で攻撃」
  [/(^|[^A-Za-z0-9])K ?で(パンチ|攻撃)/g, '$1「パンチ」をタップ'],
  [/(^|[^A-Za-z0-9])K ?で/g, '$1「パンチ」で'],
  // 「J でつかむ」「J で離す」→ ボタンを押す言い方
  [/(^|[^A-Za-z0-9])J ?で(つかむ|離す)/g, '$1「$2」をタップ'],
  // 台詞：「J で引き寄せて」「A と D で勢いをつけて」「Space で飛んで」「F を押すと」「F で QR を読んで」「近づいて F や」
  [/(^|[^A-Za-z0-9])J ?で/g, '$1「つかむ」で'],
  [/(^|[^A-Za-z0-9])Space ?で/g, '$1「ジャンプ」で'],
  [/(^|[^A-Za-z0-9])Shift ?で/g, '$1スティックを大きく倒して'],
  [/(^|[^A-Za-z0-9])WASD ?で/g, '$1スティックで'],
  [/↑↓←→ ?で/g, '右側をなぞって'],
  // 「↑ キーで見上げて」
  [/↑ ?キー ?で/g, '画面の右側を上へなぞって'],
  [/↓ ?キー ?で/g, '画面の右側を下へなぞって'],
  [/← ?→ ?で/g, 'スティックを左右に倒して'],
  // 「向こう岸の上で Space！」のように、キーだけで終わる言い方
  [/(^|[^A-Za-z0-9])Space(?=$|[\s　。、！!）)])/g, '$1「ジャンプ」'],
  [/(^|[^A-Za-z0-9])J(?=$|[\s　。、！!）)])/g, '$1「つかむ」'],
  [/(^|[^A-Za-z0-9])A ?と ?D ?で/g, '$1スティックを左右に倒して'],
  [/(^|[^A-Za-z0-9])F ?を押/g, '$1画面のボタンを押'],
  // 目的の補足の終わり：「ラボの作業台で F」
  [/で ?F(?=$|[\s　。、！])/g, 'でボタンをタップ'],
  [/(^|[^A-Za-z0-9])F ?で/g, '$1画面のボタンで'],
  [/(^|[^A-Za-z0-9])F ?や/g, '$1ボタンを押すんや'],
]

export function toTouchText(text: string): string {
  let t = text
  for (const [re, to] of TEXT_RULES) t = t.replace(re, to)
  return t
}
