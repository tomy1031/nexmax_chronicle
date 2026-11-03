import { describe, expect, it } from 'vitest'
import { cardDensity } from '../src/world/edo/nature'

describe('画質ごとの葉・花のカード', () => {
  it('高画質はそのまま、標準・省電力は少なく大きく（覆う面積は同じ）', () => {
    expect(cardDensity('high')).toEqual({ count: 1, size: 1 })
    for (const l of ['medium', 'low'] as const) {
      const d = cardDensity(l)
      expect(d.count).toBeLessThan(1)
      expect(d.count * d.size * d.size).toBeCloseTo(1, 5)
    }
    expect(cardDensity('low').count).toBeLessThan(cardDensity('medium').count)
  })
})
