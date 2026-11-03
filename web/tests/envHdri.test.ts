import { describe, expect, it } from 'vitest'
import { hdriFor } from '../src/game/env'

describe('画質に合わせた HDRI', () => {
  it('高画質は 1k、標準・省電力は半分の 512', () => {
    const u = './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr'
    expect(hdriFor(u, { level: 'high' })).toBe(u)
    expect(hdriFor(u, { level: 'medium' })).toBe('./hdri/kloofendal_48d_partly_cloudy_puresky_512.hdr')
    expect(hdriFor(u, { level: 'low' })).toBe('./hdri/kloofendal_48d_partly_cloudy_puresky_512.hdr')
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
