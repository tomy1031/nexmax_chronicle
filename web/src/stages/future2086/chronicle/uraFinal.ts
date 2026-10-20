// 12 章の「裏側」の段のつなぎ口。本物は visuals 担当の UraBattle（chronicle/uraBattle.ts、scenario 'final'）。
// それが入るまでの仮：暗い裏側の色にして、本文の言葉を流し、「最後の光のつぶを、爪にそそぐ」（F）で v7_orm_down を立て、
// 扉から出て 'escaped' を返す。ステージは同じ形（build は load、run は場面、update/animate/interact は毎フレーム）で呼ぶので、
// 差し替えるときは createUraFinal の中身を UraBattle.build({ …, scenario: 'final' }) にするだけでよい。
import * as THREE from 'three'
import type { DialogueLine } from '../../../game/dialogueQueue'
import type { ObjectiveMark, StageRuntime } from '../../../game/stage'
import type { ActionFrame } from '../../../player/inputActions'
import type { Hint } from '../../../ui/hud'
import type { Character } from '../../../world/characters'

export type UraRunOpts = {
  towa?: Character
  sora?: { ringPos: THREE.Vector3 }
  doorSeconds?: number
  lines?: (key: string) => readonly DialogueLine[]
}

export type UraLike = {
  readonly active: boolean
  run(rt: StageRuntime, o: UraRunOpts): Promise<'escaped'>
  update(dt: number, frame: ActionFrame, rt: StageRuntime): void
  animate(dt: number, t: number): void
  interact(rt: StageRuntime): boolean
  objective(rt: StageRuntime): { title: string; sub: string } | null
  hints(rt: StageRuntime): Hint[] | null
  markers(rt: StageRuntime): readonly ObjectiveMark[] | null
  devSkip(rt: StageRuntime): void
  dispose(): void
}

/** 仮の裏側（UraBattle が入るまで） */
export function createUraFinal(): UraLike {
  let active = false
  let waitF: (() => void) | null = null
  let el: HTMLDivElement | null = null
  const cover = (on: boolean, color = '#05030c') => {
    if (!el) {
      el = document.createElement('div')
      el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity 0.8s ease;'
      document.body.appendChild(el)
    }
    el.style.background = `radial-gradient(ellipse at 50% 45%, rgba(90,40,160,0.55), ${color} 70%)`
    void el.offsetWidth
    el.style.opacity = on ? '1' : '0'
  }
  return {
    get active() {
      return active
    },
    async run(rt, o) {
      active = true
      rt.setControlLocked(true)
      cover(true)
      await new Promise((r) => setTimeout(r, 900))
      const L = (k: string) => o.lines?.(k) ?? []
      await rt.dialogue(L('ch12_ura_stub'))
      rt.hud.toast('F：最後の光のつぶを、爪にそそぐ', 6)
      await new Promise<void>((r) => (waitF = r))
      rt.story.set('v7_orm_down', true)
      rt.oreGlow(2.4)
      rt.shake(0.8)
      cover(true, '#fff6d8')
      await new Promise((r) => setTimeout(r, 1200))
      await rt.dialogue(L('ch12_out'))
      cover(false)
      await new Promise((r) => setTimeout(r, 900))
      rt.setControlLocked(false)
      active = false
      return 'escaped'
    },
    update(_dt, frame) {
      if (waitF && frame.pressed.has('interact')) {
        const w = waitF
        waitF = null
        w()
      }
    },
    animate() {},
    interact() {
      if (!waitF) return false
      const w = waitF
      waitF = null
      w()
      return true
    },
    objective() {
      return active ? { title: 'オルムの心臓', sub: waitF ? 'F：最後の光のつぶを、爪にそそぐ' : '' } : null
    },
    hints() {
      return active && waitF ? [{ key: 'F', label: '最後の光をそそぐ' }] : null
    },
    markers() {
      return null
    },
    devSkip() {
      const w = waitF
      waitF = null
      w?.()
    },
    dispose() {
      el?.remove()
      el = null
    },
  }
}
