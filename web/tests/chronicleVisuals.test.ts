// v7 の共通の見た目の純粋な計算（chronicle/visuals/logic.ts）
import { describe, expect, it } from 'vitest'
import { SLAM_TIMING, VeinSet, freezeArc, freezeTicked, heartBeat, heartRate, slamImpactAt, slamPhase, slamTotal, slamWarning } from '../src/chronicle/visuals/logic'

describe('黒い手のふりおろしの時間割', () => {
  it('予告 → ふりおろし → 地面で止まる → もどる → おわり の順に進む', () => {
    const order: string[] = []
    for (let t = 0; t <= slamTotal() + 0.2; t += 0.02) {
      const p = slamPhase(t).phase
      if (order[order.length - 1] !== p) order.push(p)
    }
    expect(order).toEqual(['windup', 'strike', 'stuck', 'recover', 'done'])
  })

  it('段の中の進みは 0..1、地面に当たるのは予告とふりおろしのあと', () => {
    for (let t = 0; t < slamTotal(); t += 0.05) {
      const { k } = slamPhase(t)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThanOrEqual(1)
    }
    expect(slamImpactAt()).toBeCloseTo(SLAM_TIMING.windup + SLAM_TIMING.strike)
    expect(slamPhase(slamImpactAt() + 0.01).phase).toBe('stuck')
    expect(slamPhase(slamImpactAt() - 0.01).phase).toBe('strike')
  })

  it('地面で止まっている間（裂くチャンス）は 1 秒以上ある', () => {
    expect(SLAM_TIMING.stuck).toBeGreaterThanOrEqual(1)
  })

  it('予告の円は予告とふりおろしの間だけ出て、だんだん満ちる', () => {
    expect(slamWarning(0).show).toBe(true)
    expect(slamWarning(0).fill).toBe(0)
    expect(slamWarning(SLAM_TIMING.windup * 0.5).fill).toBeCloseTo(0.5)
    expect(slamWarning(SLAM_TIMING.windup + 0.05).fill).toBe(1)
    expect(slamWarning(slamImpactAt() + 0.1).show).toBe(false)
  })

  it('時間割を変えられる', () => {
    const s = { windup: 0.5, strike: 0.1, stuck: 2, recover: 0.4 }
    expect(slamTotal(s)).toBeCloseTo(3)
    expect(slamPhase(0.55, s).phase).toBe('strike')
  })
})

describe('オルムの心臓', () => {
  it('脈は 0..1 で、1 拍に 2 つの山（どくん・どくん）', () => {
    const rate = 1
    let peaks = 0
    let prev = heartBeat(0, rate)
    let rising = false
    for (let t = 0.001; t < 1; t += 0.002) {
      const b = heartBeat(t, rate)
      expect(b).toBeGreaterThanOrEqual(0)
      expect(b).toBeLessThanOrEqual(1)
      if (b > prev) rising = true
      else if (rising && b < prev) {
        if (prev > 0.3) peaks++
        rising = false
      }
      prev = b
    }
    expect(peaks).toBe(2)
    expect(heartBeat(5, 0)).toBe(0)
  })

  it('すじは 1 本ずつ切れて、同じすじは 2 度切れない', () => {
    const v = new VeinSet(4)
    expect(v.aliveCount).toBe(4)
    expect(v.cut(2, 1)).toBe(true)
    expect(v.cut(2, 2)).toBe(false)
    expect(v.alive(2)).toBe(false)
    expect(v.cut(0, 3)).toBe(true)
    expect(v.cutOrder).toEqual([2, 0])
    expect(v.aliveCount).toBe(2)
    expect(v.cut(9)).toBe(false)
    v.cut(1, 4)
    v.cut(3, 5)
    expect(v.allCut).toBe(true)
    v.reset()
    expect(v.aliveCount).toBe(4)
  })

  it('すじが減るほど脈が速くなる', () => {
    expect(heartRate(4, 4)).toBeLessThan(heartRate(2, 4))
    expect(heartRate(0, 4)).toBeCloseTo(2.2)
  })
})

describe('止める輪', () => {
  it('残りの割合は 0..1', () => {
    expect(freezeArc(4, 4)).toBe(1)
    expect(freezeArc(1, 4)).toBe(0.25)
    expect(freezeArc(-1, 4)).toBe(0)
    expect(freezeArc(9, 4)).toBe(1)
  })

  it('1 秒の区切りをまたいだときだけ「カチ」', () => {
    expect(freezeTicked(3.02, 2.98)).toBe(true)
    expect(freezeTicked(2.9, 2.8)).toBe(false)
    expect(freezeTicked(0.05, 0)).toBe(false)
    let ticks = 0
    let prev = 4
    for (let r = 4; r > 0; r -= 1 / 60) {
      if (freezeTicked(prev, r)) ticks++
      prev = r
    }
    expect(ticks).toBe(3)
  })
})
