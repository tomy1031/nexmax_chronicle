// 時空裂きのNMクロー（chronicle/chrono.ts）：止める・裂く・すりぬける
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ChronoSystem, type ChronoTarget } from '../src/chronicle/chrono'
import type { ClawTargetDef } from '../src/player/clawLogic'
import type { ClawSystem } from '../src/player/clawSystem'

function make() {
  const targets: ClawTargetDef[] = []
  const toasts: string[] = []
  const c = new ChronoSystem({ claw: { targets } as unknown as ClawSystem, toast: (t) => toasts.push(t), shake: () => {} })
  const cam = new THREE.PerspectiveCamera()
  return { c, targets, toasts, cam }
}

function target(kind: ChronoTarget['kind'], log: string[], id = kind): ChronoTarget {
  return { id, kind, label: id, point: new THREE.Vector3(0, 1, -3), radius: 0.5, enabled: true, seconds: 2, onAct: () => log.push(`act:${id}`), onThaw: () => log.push(`thaw:${id}`), onPassThrough: () => log.push(`pass:${id}`) }
}

describe('ChronoSystem', () => {
  it('持つまでは、止める・裂くは狙えない。裏側の物は狙えて、すりぬける', () => {
    const { c, targets, cam } = make()
    const log: string[] = []
    c.add(target('freeze', log))
    c.add(target('seam', log))
    c.add(target('ura', log))
    c.update(0, cam)
    expect(targets.map((d) => [d.type, d.enabled])).toEqual([
      ['chrono_freeze', false],
      ['chrono_seam', false],
      ['chrono_ura', true],
    ])
    expect(c.act(targets[2])).toBe(true)
    expect(log).toEqual(['pass:ura'])
  })

  it('持ったら：止めると数秒で戻る。一度に 1 つ。止めている物は狙わない', () => {
    const { c, targets, cam } = make()
    const log: string[] = []
    c.unlocked = true
    c.add(target('freeze', log, 'gear'))
    c.add(target('freeze', log, 'stone'))
    c.update(0, cam)
    expect(c.act(targets[0])).toBe(true)
    expect(c.frozenId).toBe('gear')
    c.update(0, cam)
    expect(targets[0].enabled).toBe(false)
    // 別の物を止めると、前の物は動き出す
    expect(c.act(targets[1])).toBe(true)
    expect(log).toEqual(['act:gear', 'thaw:gear', 'act:stone'])
    c.update(1.0, cam)
    expect(c.frozenId).toBe('stone')
    c.update(1.1, cam)
    expect(c.frozenId).toBe(null)
    expect(log[log.length - 1]).toBe('thaw:stone')
  })

  it('持ったら：ゆらぎと裏側の物は裂ける。remove で照準から外れる', () => {
    const { c, targets, cam } = make()
    const log: string[] = []
    c.unlocked = true
    c.add(target('seam', log))
    c.add(target('ura', log))
    c.update(0, cam)
    expect(c.act(targets[0])).toBe(true)
    expect(c.act(targets[1])).toBe(true)
    expect(log).toEqual(['act:seam', 'act:ura'])
    c.remove('seam')
    expect(targets.length).toBe(1)
    c.dispose()
  })

  it('切れ目の見た目：開いて、閉じると消える', () => {
    const { c, cam } = make()
    const h = c.slit(new THREE.Vector3(0, 2, -4), { seconds: 0.5 })
    c.update(0.3, cam)
    expect(h.closed).toBe(false)
    c.update(0.3, cam)
    expect(h.closed).toBe(true)
    for (let i = 0; i < 60; i++) c.update(0.05, cam)
    expect(c.group.children.includes(h.object)).toBe(false)
  })
})
