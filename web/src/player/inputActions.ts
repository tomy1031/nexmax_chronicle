// ゲーム内操作（アクション）の定義と、入力機器への割り当て（操作マニュアル v1.1 §2・§8.1）。
// ゲーム処理はキーではなくアクション名だけを見る。ゲームコントローラー対応時は
// BINDINGS に { action, control: 'pad:...' } を足し、入力層がその control を down/pressed/analog に
// 入れるだけでよい（ゲーム処理は変更しない）。描画にも DOM にも依存しない純粋なロジック。

/** マニュアル §8.1 のゲーム内操作 */
export const BUTTON_ACTIONS = [
  'jump', // 地上ではジャンプ／ワイヤー中は勢いを残して離脱
  'dash', // 押している間は高速移動
  'interact', // 話す・調べる・IDO
  'claw_fire', // つかむNMClaw を射出／接続中にもう一度で解除（トグル）
  'attack', // 基本攻撃（戦闘の実装後）
  'lock_switch', // 対象ロックの切り替え
  'select_left', // 左腕の装備を選択
  'select_right', // 右腕の装備を選択
  'open_hub', // 異次元空間を開く
  'menu', // 装備・記録メニュー
  'pause', // 一時停止・操作一覧
] as const
export type ButtonAction = (typeof BUTTON_ACTIONS)[number]
export type AxisAction = 'move' | 'look'
export type ActionName = ButtonAction | AxisAction

/** 軸アクションの 2 成分。move: x=右, y=前。look: x=右へ回す, y=上を見る */
export type Axis2 = { x: number; y: number }

export type ButtonBinding = { action: ButtonAction; control: string }
export type AxisBinding = { action: AxisAction; control: string; axis: 'x' | 'y'; scale: number }
export type Binding = ButtonBinding | AxisBinding

const btn = (action: ButtonAction, control: string): ButtonBinding => ({ action, control })
const ax = (action: AxisAction, control: string, axis: 'x' | 'y', scale: number): AxisBinding => ({ action, control, axis, scale })

/**
 * キーボードの割り当て（control はKeyboardEvent.code）。マウスは含めない。
 * 方向キーはカメラ専用（移動には使わない）。
 */
export const KEYBOARD_BINDINGS: readonly Binding[] = [
  ax('move', 'KeyW', 'y', 1),
  ax('move', 'KeyS', 'y', -1),
  ax('move', 'KeyD', 'x', 1),
  ax('move', 'KeyA', 'x', -1),
  ax('look', 'ArrowRight', 'x', 1),
  ax('look', 'ArrowLeft', 'x', -1),
  ax('look', 'ArrowUp', 'y', 1),
  ax('look', 'ArrowDown', 'y', -1),
  btn('jump', 'Space'),
  btn('dash', 'ShiftLeft'),
  btn('dash', 'ShiftRight'),
  btn('interact', 'KeyF'),
  btn('claw_fire', 'KeyJ'),
  btn('attack', 'KeyK'),
  btn('lock_switch', 'KeyR'),
  btn('select_left', 'KeyQ'),
  btn('select_right', 'KeyE'),
  btn('open_hub', 'KeyG'),
  btn('menu', 'Tab'),
  btn('pause', 'Escape'),
]

/**
 * スマホのタッチ操作の割り当て（touchInput.ts が control を down/pressed/analog に入れる）。
 * move は画面左側のスティック（analog：-1〜1）。look は画面右側のドラッグで、角度の増分として
 * 入力層が直接カメラへ渡すため、ここには含めない。攻撃・異次元空間は実装後に足す。
 */
export const TOUCH_BINDINGS: readonly Binding[] = [
  ax('move', 'touch:moveX', 'x', 1),
  ax('move', 'touch:moveY', 'y', 1),
  btn('dash', 'touch:dash'),
  btn('jump', 'touch:jump'),
  btn('claw_fire', 'touch:claw'),
  btn('attack', 'touch:attack'),
  btn('interact', 'touch:interact'),
  btn('lock_switch', 'touch:lock'),
  btn('select_left', 'touch:armL'),
  btn('menu', 'touch:menu'),
  btn('pause', 'touch:pause'),
]

/** 入力層が毎フレーム渡す生の状態（control 名の集合）。analog はスティック等の連続値（-1〜1） */
export type RawInput = {
  down: ReadonlySet<string>
  pressed: ReadonlySet<string>
  analog?: ReadonlyMap<string, number>
}

/** 1 フレーム分のアクション */
export type ActionFrame = {
  move: Axis2
  look: Axis2
  held: ReadonlySet<ButtonAction>
  pressed: ReadonlySet<ButtonAction>
}

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v))

export function isAxisBinding(b: Binding): b is AxisBinding {
  return 'axis' in b
}

/** 生の入力 → アクション。move は斜め入力でも長さ 1 を超えない。 */
export function resolveActions(raw: RawInput, bindings: readonly Binding[] = KEYBOARD_BINDINGS): ActionFrame {
  const move = { x: 0, y: 0 }
  const look = { x: 0, y: 0 }
  const held = new Set<ButtonAction>()
  const pressed = new Set<ButtonAction>()
  for (const b of bindings) {
    if (isAxisBinding(b)) {
      const analog = raw.analog?.get(b.control)
      const v = analog !== undefined ? analog : raw.down.has(b.control) ? 1 : 0
      if (v === 0) continue
      const target = b.action === 'move' ? move : look
      target[b.axis] += v * b.scale
    } else {
      if (raw.down.has(b.control)) held.add(b.action)
      if (raw.pressed.has(b.control)) {
        pressed.add(b.action)
        held.add(b.action)
      }
    }
  }
  look.x = clamp1(look.x)
  look.y = clamp1(look.y)
  move.x = clamp1(move.x)
  move.y = clamp1(move.y)
  const len = Math.hypot(move.x, move.y)
  if (len > 1) {
    move.x /= len
    move.y /= len
  }
  return { move, look, held, pressed }
}

/** アクションに割り当てられている control 名（操作一覧・キー案内の表示用） */
export function controlsFor(action: ActionName, bindings: readonly Binding[] = KEYBOARD_BINDINGS): string[] {
  return bindings.filter((b) => b.action === action).map((b) => b.control)
}

/** 何も押していないフレーム */
export const EMPTY_FRAME: ActionFrame = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, held: new Set(), pressed: new Set() }

// ------------------------------------------------------------------ 方向キーのカメラ（加速つき）

export type LookConfig = {
  /** 最大角速度（rad/s） */
  yawSpeed: number
  pitchSpeed: number
  /** 押し始めの速さの割合（細かい調整用）。押し続けると 1 まで上がる */
  startFraction: number
  /** startFraction → 1 になるまでの時間（秒） */
  rampTime: number
  /** 目標速度へ近づく速さ（1/s） */
  response: number
}

export const DEFAULT_LOOK: LookConfig = { yawSpeed: 2.2, pitchSpeed: 1.5, startFraction: 0.4, rampTime: 0.45, response: 14 }

export type LookState = { yawVel: number; pitchVel: number; holdTime: number }

export function createLookState(): LookState {
  return { yawVel: 0, pitchVel: 0, holdTime: 0 }
}

/**
 * 方向キーの入力から角速度を更新して、このフレームの回転量（yaw, pitch の増分）を返す。
 * 押し始めはゆっくり・押し続けると加速、離すとすぐ止まる。
 * yaw の正は「右へ回す」、pitch の正は「上を見る」。
 */
export function stepLook(state: LookState, look: Axis2, dt: number, cfg: LookConfig = DEFAULT_LOOK): { dYaw: number; dPitch: number } {
  const active = look.x !== 0 || look.y !== 0
  state.holdTime = active ? state.holdTime + dt : 0
  const ramp = cfg.startFraction + (1 - cfg.startFraction) * Math.min(1, state.holdTime / Math.max(1e-6, cfg.rampTime))
  const wantYaw = look.x * cfg.yawSpeed * ramp
  const wantPitch = look.y * cfg.pitchSpeed * ramp
  const k = 1 - Math.exp(-cfg.response * dt)
  state.yawVel += (wantYaw - state.yawVel) * k
  state.pitchVel += (wantPitch - state.pitchVel) * k
  if (!active && Math.abs(state.yawVel) < 1e-3) state.yawVel = 0
  if (!active && Math.abs(state.pitchVel) < 1e-3) state.pitchVel = 0
  return { dYaw: state.yawVel * dt, dPitch: state.pitchVel * dt }
}
