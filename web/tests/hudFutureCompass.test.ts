// 近未来 HUD のコンパスの計算（ui/future/compass.ts）
import { describe, expect, it } from 'vitest'
import { bearingDeg, formatDistance, headingFromCameraYaw, headingFromForward, markerOnBar, planeDistance, stripShift, wrapDeg } from '../src/ui/future/compass'

describe('wrapDeg', () => {
  it('-180 以上 180 未満へ折り返す', () => {
    expect(wrapDeg(0)).toBe(0)
    expect(wrapDeg(190)).toBe(-170)
    expect(wrapDeg(-190)).toBe(170)
    expect(wrapDeg(180)).toBe(-180)
    expect(wrapDeg(720 + 45)).toBe(45)
  })
})

describe('方位', () => {
  it('北 = -Z、東 = +X', () => {
    const o = { x: 0, z: 0 }
    expect(bearingDeg(o, { x: 0, z: -10 })).toBeCloseTo(0)
    expect(bearingDeg(o, { x: 10, z: 0 })).toBeCloseTo(90)
    expect(Math.abs(bearingDeg(o, { x: 0, z: 10 }))).toBeCloseTo(180)
    expect(bearingDeg(o, { x: -10, z: 0 })).toBeCloseTo(-90)
  })

  it('cameraRig.yaw = 0 はカメラが +Z 側にいて北（-Z）を向く', () => {
    expect(headingFromCameraYaw(0)).toBeCloseTo(0)
    // yaw = -90°：カメラは -X 側 → 前方は +X（東）
    expect(headingFromCameraYaw(-Math.PI / 2)).toBeCloseTo(90)
    expect(headingFromCameraYaw(Math.PI / 2)).toBeCloseTo(-90)
  })

  it('前方ベクトルからの方位はカメラの yaw からの方位と一致する', () => {
    for (const yaw of [0, 0.4, -1.2, 2.9, -3.1]) {
      const fx = -Math.sin(yaw)
      const fz = -Math.cos(yaw)
      expect(headingFromForward(fx, fz)).toBeCloseTo(headingFromCameraYaw(yaw))
    }
  })
})

describe('ピンの位置', () => {
  it('正面なら中央、右 50° なら右寄り（半分の範囲 100°）', () => {
    expect(markerOnBar(0, 0, 100).x).toBeCloseTo(0.5)
    expect(markerOnBar(0, 50, 100).x).toBeCloseTo(0.75)
    expect(markerOnBar(0, -50, 100).x).toBeCloseTo(0.25)
    expect(markerOnBar(0, 50, 100).side).toBe(0)
  })

  it('範囲外は端に張り付き、左右がわかる', () => {
    const r = markerOnBar(0, 150, 100)
    expect(r.side).toBe(1)
    expect(r.x).toBeCloseTo(0.96)
    const l = markerOnBar(0, -150, 100)
    expect(l.side).toBe(-1)
    expect(l.x).toBeCloseTo(0.04)
  })

  it('真後ろをまたいでも近い向きで測る', () => {
    expect(markerOnBar(170, -170, 100).rel).toBeCloseTo(20)
    expect(markerOnBar(-170, 170, 100).rel).toBeCloseTo(-20)
  })
})

describe('目盛りの帯', () => {
  it('窓の中央が向いている方位になる', () => {
    const half = 100
    for (const h of [0, 45, -90, 179, -180]) {
      // 窓の左端の角度 = 帯の始まり(-360°) + ずらし × 720°
      const left = -360 + stripShift(h, half) * 720
      expect(wrapDeg(left + half)).toBeCloseTo(wrapDeg(h))
      // 帯（720°）からはみ出さない
      expect(stripShift(h, half)).toBeGreaterThanOrEqual(0)
      expect(stripShift(h, half) * 720 + 2 * half).toBeLessThanOrEqual(720)
    }
  })
})

describe('距離', () => {
  it('水平距離（高さは無視）と表示', () => {
    expect(planeDistance({ x: 0, z: 0 }, { x: 3, z: 4 })).toBeCloseTo(5)
    expect(formatDistance(31.6)).toBe('32m')
    expect(formatDistance(0.2)).toBe('0m')
    expect(formatDistance(1530)).toBe('1.5km')
    expect(formatDistance(Number.NaN)).toBe('')
  })
})
