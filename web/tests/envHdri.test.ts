import { describe, expect, it } from 'vitest'
import { hdriFor } from '../src/game/env'

describe('画質に合わせた HDRI', () => {
  it('どの画質も 1k（512 にすると太陽の光が広くにじみ、画面全体が白くかすむ）', () => {
    const u = './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr'
    for (const level of ['high', 'medium', 'low'] as const) expect(hdriFor(u, { level })).toBe(u)
  })
})

import { anisotropyFor } from '../src/render/quality'
describe('画質ごとの異方性フィルタ', () => {
  it('高画質は GPU の上限（16 まで）、標準 4、省電力 2', () => {
    expect(anisotropyFor('high', 16)).toBe(16)
    expect(anisotropyFor('high', 8)).toBe(8)
    expect(anisotropyFor('medium', 16)).toBe(4)
    expect(anisotropyFor('low', 16)).toBe(2)
    expect(anisotropyFor('low', 0)).toBe(1)
  })
})
