// 1186年の環境：着いたとき（afternoon：強い日ざし、少しかすみ）・夜（night：空のひび、月と松明）・夜明け（dawn：東から金色の朝日）。
// 形はシェルの StageEnvironment と同じ（そのまま渡せる）＋空の太陽の強さ。
// applyKhmerTime() は組み立て直さずに、空のドーム・霧・太陽（向きも）・半球光・色調・ブルーム・かすみ・IBL だけを切り替える
// （stages/future2086/environment.ts の applyTimeOfDay と同じ考え）。夜と夜明けの IBL は KhmerEnvMaps が必要なときに作る。
import * as THREE from 'three'
import type { SkyPalette } from '../../render/sky'
import type { PostChain } from '../../render/post'
import type { SunRig } from '../../render/renderer'
import type { StageEnvironment } from '../../game/stage'
import { skyEnvironment, type EnvTexture } from '../../game/env'
import { findHaze } from '../future2086/environment'
import { K, type TimeOfDay } from './layout'

export type { TimeOfDay }

export const KHMER_SKY: Record<TimeOfDay, SkyPalette> = {
  afternoon: {
    zenith: '#1758c4',
    upper: '#3a8ee6',
    horizon: '#d8e6ec',
    warm: '#ffe0aa',
    ground: '#8a7458',
    haze: '#e6e0cc',
    cloudLit: '#ffffff',
    cloudShade: '#b4bccc',
  },
  night: {
    zenith: '#050a24',
    upper: '#101c52',
    horizon: '#3a2a66',
    warm: '#6a4aa8',
    ground: '#0e0a16',
    haze: '#221c44',
    cloudLit: '#3c3a7a',
    cloudShade: '#14122e',
  },
  dawn: {
    zenith: '#2c4c92',
    upper: '#7a7cbc',
    horizon: '#ffcc94',
    warm: '#ff9a52',
    ground: '#6a4a3a',
    haze: '#f2c8a4',
    cloudLit: '#ffd8b0',
    cloudShade: '#a87a8a',
  },
}

const dirFrom = (azDeg: number, elDeg: number) => {
  // az：北（-Z）から時計回り（東 = 90°）。el：高さ
  const az = (azDeg * Math.PI) / 180
  const el = (elDeg * Math.PI) / 180
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
}

/** 午後の太陽（西南西・高さ 40°） */
export const SUN_AFTERNOON = dirFrom(248, 40)
/** 夜明けの太陽（東・地平の少し上） */
export const SUN_DAWN = dirFrom(84, 8)
/** 月（夜の光の向き） */
export const MOON_DIR = K.MOON.clone().normalize()

export type KhmerEnvironment = StageEnvironment & {
  time: TimeOfDay
  sunDir: THREE.Vector3
  sunColor: THREE.ColorRepresentation
  sunIntensity: number
  hemi: { sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; intensity: number }
  envIntensity: number
  fog: { color: THREE.ColorRepresentation; density: number }
  grade: { exposure: number; saturation: number; contrast: number; vignette: number }
  bloom: { intensity: number; threshold: number }
  haze: { near: THREE.ColorRepresentation; far: THREE.ColorRepresentation; density: number; start: number; falloff: number; max: number }
  /** 空のドームの太陽の円板の強さ（夜は 0） */
  skySunStrength: number
}

export const KHMER_ENVIRONMENTS: Record<TimeOfDay, KhmerEnvironment> = {
  afternoon: {
    time: 'afternoon',
    sky: KHMER_SKY.afternoon,
    sunDir: SUN_AFTERNOON.clone(),
    sunColor: '#fff0d6',
    sunIntensity: 3.5,
    skySunStrength: 1,
    hemi: { sky: '#bcd8f4', ground: '#b48a5e', intensity: 0.55 },
    hdri: './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    envIntensity: 0.75,
    fog: { color: '#dcdccc', density: 0.0016 },
    grade: { exposure: 0.95, saturation: 1.16, contrast: 1.1, vignette: 0.28 },
    bloom: { intensity: 1.1, threshold: 0.95 },
    haze: { near: '#f2e6cc', far: '#b8d0e8', density: 0.003, start: 70, falloff: 0.028, max: 0.55 },
  },
  night: {
    time: 'night',
    sky: KHMER_SKY.night,
    sunDir: MOON_DIR.clone(),
    sunColor: '#90a8ff',
    sunIntensity: 0.6,
    skySunStrength: 0,
    hemi: { sky: '#3d54b8', ground: '#2a1c3a', intensity: 0.6 },
    hdri: null,
    envIntensity: 0.42,
    fog: { color: '#1a1a36', density: 0.0028 },
    grade: { exposure: 1.18, saturation: 1.2, contrast: 1.1, vignette: 0.42 },
    bloom: { intensity: 1.4, threshold: 0.9 },
    haze: { near: '#2a2448', far: '#1a1a3c', density: 0.004, start: 50, falloff: 0.03, max: 0.6 },
  },
  dawn: {
    time: 'dawn',
    sky: KHMER_SKY.dawn,
    sunDir: SUN_DAWN.clone(),
    sunColor: '#ffb070',
    sunIntensity: 2.8,
    skySunStrength: 1,
    hemi: { sky: '#9aa4d8', ground: '#8a5a48', intensity: 0.55 },
    hdri: null,
    envIntensity: 0.6,
    fog: { color: '#e8c4a4', density: 0.0017 },
    grade: { exposure: 1.0, saturation: 1.25, contrast: 1.06, vignette: 0.3 },
    bloom: { intensity: 1.35, threshold: 0.88 },
    haze: { near: '#f6d2b0', far: '#c8a8c0', density: 0.0032, start: 60, falloff: 0.028, max: 0.5 },
  },
}

/** 切り替える相手（どれも任意。持っているものだけ変える） */
export type KhmerEnvTargets = {
  scene?: THREE.Scene
  /** 空のドーム（render/sky.ts の makeSkyMaterial の uniform を書き換える） */
  sky?: THREE.Mesh
  /** 太陽（向きも変える：午後は西、夜明けは東） */
  sun?: SunRig
  post?: PostChain
  /** その時間の IBL（KhmerEnvMaps.get） */
  envMap?: THREE.Texture | null
}

export function applyKhmerTime(env: KhmerEnvironment, t: KhmerEnvTargets): void {
  if (t.scene) {
    t.scene.fog = new THREE.FogExp2(new THREE.Color(env.fog.color), env.fog.density)
    if (t.envMap) t.scene.environment = t.envMap
    t.scene.environmentIntensity = env.envIntensity
  }
  if (t.sky) {
    const u = (t.sky.material as THREE.ShaderMaterial).uniforms
    const set = (k: string, c: THREE.ColorRepresentation) => (u[k]?.value as THREE.Color | undefined)?.set(c)
    set('uZenith', env.sky.zenith)
    set('uUpper', env.sky.upper)
    set('uHorizon', env.sky.horizon)
    set('uWarm', env.sky.warm)
    set('uGround', env.sky.ground)
    set('uHaze', env.sky.haze)
    set('uCloudLit', env.sky.cloudLit)
    set('uCloudShade', env.sky.cloudShade)
    if (u.uSunStrength) u.uSunStrength.value = env.skySunStrength
    ;(u.uSunDir?.value as THREE.Vector3 | undefined)?.copy(env.sunDir).normalize()
  }
  if (t.sun) {
    t.sun.sun.color.set(env.sunColor)
    t.sun.sun.intensity = env.sunIntensity
    t.sun.hemi.color.set(env.hemi.sky)
    t.sun.hemi.groundColor.set(env.hemi.ground)
    t.sun.hemi.intensity = env.hemi.intensity
    // 影の向き（SunRig.follow が sunDir を使う）
    t.sun.sunDir.copy(env.sunDir).normalize()
  }
  if (t.post) {
    t.post.grade.set('gExposure', env.grade.exposure)
    t.post.grade.set('gSaturation', env.grade.saturation)
    t.post.grade.set('gContrast', env.grade.contrast)
    t.post.grade.set('gVignette', env.grade.vignette)
    if (t.post.bloom.intensity > 0) t.post.bloom.intensity = env.bloom.intensity
    t.post.bloom.luminanceMaterial.threshold = env.bloom.threshold
    const haze = findHaze(t.post)
    if (haze) {
      const u = haze.uniforms
      ;(u.get('hNear')?.value as THREE.Color | undefined)?.set(env.haze.near)
      ;(u.get('hFar')?.value as THREE.Color | undefined)?.set(env.haze.far)
      const setN = (k: string, x: number) => {
        const un = u.get(k)
        if (un) un.value = x
      }
      setN('hDensity', env.haze.density)
      setN('hStart', env.haze.start)
      setN('hFalloff', env.haze.falloff)
      setN('hMax', env.haze.max)
    }
  }
}

/**
 * 時間ごとの IBL（環境マップ）。午後はシェルが作ったもの（HDRI）を借りる（解放しない）。
 * 夜・夜明けは手続きの空から必要なときに作り、dispose() で解放する（ステージの dispose から呼ぶ）
 */
export class KhmerEnvMaps {
  private readonly owned = new Map<TimeOfDay, EnvTexture>()
  private readonly borrowed = new Map<TimeOfDay, THREE.Texture>()
  private readonly renderer: THREE.WebGLRenderer

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer
  }

  /** シェルが作った環境マップを、その時間のものとして借りる */
  borrow(time: TimeOfDay, tex: THREE.Texture | null): void {
    if (tex) this.borrowed.set(time, tex)
  }

  get(time: TimeOfDay): THREE.Texture {
    const b = this.borrowed.get(time)
    if (b) return b
    let e = this.owned.get(time)
    if (!e) {
      const env = KHMER_ENVIRONMENTS[time]
      e = skyEnvironment(this.renderer, env.sky, env.sunDir, time === 'night' ? 0 : 0.35)
      this.owned.set(time, e)
    }
    return e.texture
  }

  dispose(): void {
    for (const e of this.owned.values()) e.dispose()
    this.owned.clear()
    this.borrowed.clear()
  }
}
