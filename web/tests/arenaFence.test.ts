import { describe, expect, it } from 'vitest'
import { circlePoints, insidePoly, nearestOnEdge, pullInside, rectPoints } from '../src/chronicle/kit/arenaLogic'

describe('ボス戦の柵の形', () => {
  const sq = rectPoints(0, 10, 0, 10)

  it('長方形の内と外', () => {
    expect(insidePoly(sq, 5, 5)).toBe(true)
    expect(insidePoly(sq, 11, 5)).toBe(false)
    expect(insidePoly(sq, 5, -0.1)).toBe(false)
  })

  it('外にいたら、ふちの少し内側へもどす。中なら何もしない', () => {
    expect(pullInside(sq, 5, 5)).toBeNull()
    const back = pullInside(sq, 12, 5, 0.5)!
    expect(back.x).toBeCloseTo(9.5, 1)
    expect(back.z).toBeCloseTo(5, 1)
    expect(insidePoly(sq, back.x, back.z)).toBe(true)
  })

  it('円（多角形）でも、もどした先は内側', () => {
    const c = circlePoints(3, -2, 6)
    expect(insidePoly(c, 3, -2)).toBe(true)
    const back = pullInside(c, 3 + 9, -2)!
    expect(insidePoly(c, back.x, back.z)).toBe(true)
    expect(Math.hypot(back.x - 3, back.z + 2)).toBeLessThan(6)
  })

  it('ふちのいちばん近い点', () => {
    const e = nearestOnEdge(sq, 5, -3)
    expect(e.x).toBeCloseTo(5)
    expect(e.z).toBeCloseTo(0)
    expect(e.dist).toBeCloseTo(3)
  })
})
