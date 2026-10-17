// 入力機器の層：キーボードの生の状態（KeyboardEvent.code）を集めるだけ。
// ゲーム処理は inputActions.ts の resolveActions() を通したアクションだけを見る。
// マウスは必須ではない（キャンバスをクリックしたときだけ、任意の視点操作としてポインタロックを使える）。
import type { RawInput } from './inputActions'

export type InputState = RawInput & {
  /** 押している control（KeyboardEvent.code） */
  down: Set<string>
  /** このフレームで押された control */
  pressed: Set<string>
  /** 任意：ポインタロック中のマウス移動量（UI では案内しない） */
  mouseDX: number
  mouseDY: number
  locked: boolean
}

/** ブラウザの既定動作（スクロール・フォーカス移動）を止めるキー */
const PREVENT = new Set(['Space', 'Tab', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

export function createInput(canvas: HTMLCanvasElement): InputState & { endFrame(): void } {
  const s: InputState & { endFrame(): void } = {
    down: new Set(),
    pressed: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
    endFrame() {
      s.mouseDX = 0
      s.mouseDY = 0
      s.pressed.clear()
    },
  }
  window.addEventListener('keydown', (e) => {
    if (PREVENT.has(e.code)) e.preventDefault()
    if (e.repeat) return
    if (!s.down.has(e.code)) s.pressed.add(e.code)
    s.down.add(e.code)
  })
  window.addEventListener('keyup', (e) => s.down.delete(e.code))
  window.addEventListener('blur', () => s.down.clear())
  // 任意のマウス視点（必須ではない）
  canvas.addEventListener('click', () => {
    if (!s.locked) canvas.requestPointerLock?.()
  })
  document.addEventListener('pointerlockchange', () => {
    s.locked = document.pointerLockElement === canvas
  })
  document.addEventListener('mousemove', (e) => {
    if (!s.locked) return
    s.mouseDX += e.movementX
    s.mouseDY += e.movementY
  })
  return s
}
