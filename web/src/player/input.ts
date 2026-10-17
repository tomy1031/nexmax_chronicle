// キーボード・マウス入力。キャンバスのクリックでポインタロック、Esc で解除。
export type InputState = {
  keys: Set<string>
  mouseDX: number
  mouseDY: number
  locked: boolean
  /** 1 回押しのイベント（P・F3・G など） */
  pressed: Set<string>
}

export function createInput(canvas: HTMLCanvasElement): InputState & { endFrame(): void } {
  const s: InputState & { endFrame(): void } = {
    keys: new Set(),
    mouseDX: 0,
    mouseDY: 0,
    locked: false,
    pressed: new Set(),
    endFrame() {
      s.mouseDX = 0
      s.mouseDY = 0
      s.pressed.clear()
    },
  }
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F3' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
    if (!s.keys.has(e.code)) s.pressed.add(e.code)
    s.keys.add(e.code)
  })
  window.addEventListener('keyup', (e) => s.keys.delete(e.code))
  window.addEventListener('blur', () => s.keys.clear())
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
