// 画質とフレームレートの設定（src/render/quality.ts）・適応解像度（src/render/renderer.ts）・設定タブのキー（src/ui/future/hudLogic.ts）。
import { describe, expect, it } from 'vitest'
import { FrameLimiter, QUALITY_PRESETS, defaultPrefs, parsePrefs, resolvePrefs } from '../src/render/quality'
import { AdaptiveResolution } from '../src/render/renderer'
import { settingsKey } from '../src/ui/future/hudLogic'

const P = (s: string) => new URLSearchParams(s)

describe('画質の段階', () => {
  it('省電力 < 標準 < 高画質 の順に重い処理が増える', () => {
    const { low, medium, high } = QUALITY_PRESETS
    expect([low.ao, medium.ao, high.ao]).toEqual([false, false, true])
    expect([low.bloom, medium.bloom, high.bloom]).toEqual([false, true, true])
    expect([low.smaa, medium.smaa, high.smaa]).toEqual([null, 'medium', 'high'])
    expect(low.maxPixelRatio).toBeLessThan(medium.maxPixelRatio)
    expect(medium.maxPixelRatio).toBeLessThan(high.maxPixelRatio)
    expect(medium.shadowMapSize).toBeLessThan(high.shadowMapSize)
    expect(low.pointLights).toBeLessThan(medium.pointLights)
    expect(medium.pointLights).toBeLessThan(high.pointLights)
    expect(low.portraitFps).toBeLessThan(high.portraitFps)
    for (const q of [low, medium, high]) expect(q.minPixelRatio).toBeLessThan(q.maxPixelRatio)
  })

  it('スマホ・タブレットは「標準・30」、PC は「高画質・60」から始まる', () => {
    expect(defaultPrefs(true)).toEqual({ quality: 'medium', fps: 30 })
    expect(defaultPrefs(false)).toEqual({ quality: 'high', fps: 60 })
  })

  it('保存した設定が既定より優先、URL はさらに優先。壊れた値は使わない', () => {
    expect(resolvePrefs(true, JSON.stringify({ quality: 'low', fps: 60 }), P(''))).toEqual({ quality: 'low', fps: 60 })
    expect(resolvePrefs(false, JSON.stringify({ quality: 'low' }), P('?quality=medium&fps=30'))).toEqual({ quality: 'medium', fps: 30 })
    expect(resolvePrefs(true, '{not json', P(''))).toEqual({ quality: 'medium', fps: 30 })
    expect(parsePrefs(JSON.stringify({ quality: 'ultra', fps: 144 }))).toEqual({})
    expect(resolvePrefs(false, null, P('?quality=ultra&fps=144'))).toEqual({ quality: 'high', fps: 60 })
  })
})

describe('フレームレートの上限', () => {
  const run = (cap: number, hz: number, seconds = 10) => {
    const l = new FrameLimiter(cap)
    let n = 0
    for (let i = 0; i < hz * seconds; i++) {
      // 画面の更新のゆれ（±1ms）
      const t = (i * 1000) / hz + (i % 3) - 1
      if (l.shouldRender(t)) n++
    }
    return n / seconds
  }

  it('60Hz の画面で 30 にすると 1 回おきに描く', () => {
    expect(run(30, 60)).toBeCloseTo(30, 0)
  })

  it('120Hz の画面でも 60 を超えて描かない', () => {
    expect(run(60, 120)).toBeCloseTo(60, 0)
    expect(run(30, 120)).toBeCloseTo(30, 0)
  })

  it('60Hz の画面で 60 なら毎回描く', () => {
    expect(run(60, 60)).toBeCloseTo(60, 0)
  })

  it('止まったあとは追いつこうと続けて描かず、そこから数え直す', () => {
    const l = new FrameLimiter(30)
    expect(l.shouldRender(0)).toBe(true)
    expect(l.shouldRender(16.7)).toBe(false)
    expect(l.shouldRender(500)).toBe(true)
    expect(l.shouldRender(516.7)).toBe(false)
    expect(l.shouldRender(533.4)).toBe(true)
  })
})

describe('適応解像度', () => {
  /** 毎フレーム dt 秒で seconds 秒ぶん */
  const feed = (a: AdaptiveResolution, dt: number, seconds: number) => {
    for (let t = 0; t < seconds; t += dt) a.sample(dt)
  }

  it('30 の上限どおりに描けていれば下げない（60 の基準で「遅い」と誤解しない）', () => {
    const got: number[] = []
    const a = new AdaptiveResolution(0.65, 1, (r) => got.push(r), 30)
    feed(a, 1 / 30, 20)
    expect(got).toEqual([])
    expect(a.ratio).toBe(1)
  })

  it('上限に届かないと下げ、しばらくは下げる前の少し手前までしか戻さない', () => {
    const a = new AdaptiveResolution(0.6, 1, () => {}, 30)
    feed(a, 1 / 20, 3)
    expect(a.ratio).toBeLessThan(1)
    const low = a.ratio
    feed(a, 1 / 30, 30)
    expect(a.ratio).toBeGreaterThan(low)
    expect(a.ratio).toBeLessThanOrEqual(0.95)
  })

  it('設定を変えたら上限の解像度から始め直す', () => {
    const got: number[] = []
    const a = new AdaptiveResolution(0.7, 1.25, (r) => got.push(r), 60)
    a.configure(0.6, 0.85, 30)
    expect(a.ratio).toBe(0.85)
    expect(got).toEqual([0.85])
  })
})

describe('設定タブのキー', () => {
  const base = { quality: 'medium' as const, fps: 30 as const }

  it('W/S で項目、A/D で値（端で止まる）、Enter で次の値へ回す', () => {
    expect(settingsKey('quality', base, 'KeyS').row).toBe('fps')
    expect(settingsKey('fps', base, 'KeyS').row).toBe('fps')
    expect(settingsKey('fps', base, 'ArrowUp').row).toBe('quality')
    expect(settingsKey('quality', base, 'KeyA').prefs.quality).toBe('low')
    expect(settingsKey('quality', { ...base, quality: 'low' }, 'KeyA').prefs.quality).toBe('low')
    expect(settingsKey('quality', base, 'KeyD').prefs.quality).toBe('high')
    expect(settingsKey('quality', { ...base, quality: 'high' }, 'Enter').prefs.quality).toBe('low')
    expect(settingsKey('fps', base, 'KeyD').prefs.fps).toBe(60)
    expect(settingsKey('fps', base, 'KeyX').prefs).toBe(base)
  })
})
