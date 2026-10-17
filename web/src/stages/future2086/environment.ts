// 2086年の環境（祭りの朝・夜）。形はシェルの StageEnvironment と同じ（そのまま渡せる）＋かすみ・空の太陽の強さ。
// applyTimeOfDay() は作り直さずに、空のドーム・霧・太陽・半球光・色調・ブルーム・かすみの値だけを切り替える
// （夜 → 朝のループで一瞬で戻すため）。環境マップ（IBL）は呼び出し側が朝・夜の 2 枚を用意して渡す。
import * as THREE from 'three'
import type { SkyPalette } from '../../render/sky'
import type { PostChain } from '../../render/post'
import type { TimeOfDay } from './fmaterials'

export type { TimeOfDay }

export const FUTURE_MORNING_SKY: SkyPalette = {
  zenith: '#1d5fd8',
  upper: '#4596ef',
  horizon: '#bfe2fb',
  warm: '#ffe1b4',
  ground: '#9a8a74',
  haze: '#d4e5f4',
  cloudLit: '#ffffff',
  cloudShade: '#a9bad6',
}

export const FUTURE_NIGHT_SKY: SkyPalette = {
  zenith: '#060b26',
  upper: '#142060',
  horizon: '#4a2f72',
  warm: '#ff4a78',
  ground: '#0d0913',
  haze: '#241c44',
  cloudLit: '#4a3a82',
  cloudShade: '#141030',
}

export type FutureEnvironment = {
  timeOfDay: TimeOfDay
  sky: SkyPalette
  /** 地面 → 太陽（夜は月明かり）。朝と夜で同じ向き（影の向きを変えない） */
  sunDir: THREE.Vector3
  sunColor: THREE.ColorRepresentation
  sunIntensity: number
  /** 空のドームの太陽の円盤の強さ（夜は 0） */
  skySunStrength: number
  hemi: { sky: THREE.ColorRepresentation; ground: THREE.ColorRepresentation; intensity: number }
  /** public/ からの HDRI。null なら手続きの空（sky）から IBL を作る */
  hdri: string | null
  envIntensity: number
  fog: { color: THREE.ColorRepresentation; density: number }
  grade: { exposure: number; saturation: number; contrast: number; vignette: number }
  bloom: { intensity: number; threshold: number }
  /** 後処理の層状のかすみ（render/post.ts の HazeEffect の uniform） */
  haze: { near: THREE.ColorRepresentation; far: THREE.ColorRepresentation; density: number; start: number; falloff: number; max: number }
}

/** 東南東・高さ 38° の朝日 */
const SUN_AZ = (115 * Math.PI) / 180
const SUN_EL = (38 * Math.PI) / 180
export const FUTURE_SUN_DIR = new THREE.Vector3(Math.sin(SUN_AZ) * Math.cos(SUN_EL), Math.sin(SUN_EL), -Math.cos(SUN_AZ) * Math.cos(SUN_EL)).normalize()

export const FUTURE_ENVIRONMENTS: Record<TimeOfDay, FutureEnvironment> = {
  morning: {
    timeOfDay: 'morning',
    sky: FUTURE_MORNING_SKY,
    sunDir: FUTURE_SUN_DIR.clone(),
    sunColor: '#ffdcb0',
    sunIntensity: 3.3,
    skySunStrength: 1,
    hemi: { sky: '#b4d6fa', ground: '#b49470', intensity: 0.5 },
    hdri: './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    envIntensity: 0.7,
    fog: { color: '#d4e5f4', density: 0.0014 },
    grade: { exposure: 0.9, saturation: 1.3, contrast: 1.12, vignette: 0.3 },
    bloom: { intensity: 1.15, threshold: 0.95 },
    haze: { near: '#eef0f2', far: '#a8cdf2', density: 0.0032, start: 70, falloff: 0.022, max: 0.62 },
  },
  night: {
    timeOfDay: 'night',
    sky: FUTURE_NIGHT_SKY,
    sunDir: FUTURE_SUN_DIR.clone(),
    sunColor: '#8ea4ff',
    sunIntensity: 0.5,
    skySunStrength: 0,
    hemi: { sky: '#3d54b8', ground: '#2a1c3a', intensity: 0.55 },
    hdri: null,
    envIntensity: 0.4,
    fog: { color: '#1b1630', density: 0.0026 },
    grade: { exposure: 1.18, saturation: 1.25, contrast: 1.12, vignette: 0.42 },
    bloom: { intensity: 1.35, threshold: 0.92 },
    haze: { near: '#2a2246', far: '#1a1838', density: 0.004, start: 55, falloff: 0.03, max: 0.6 },
  },
}

/** 切り替える相手（どれも任意。持っているものだけ変える） */
export type EnvTargets = {
  scene?: THREE.Scene
  /** createSkyDome() のメッシュ（makeSkyMaterial の uniform を書き換える） */
  sky?: THREE.Mesh
  sun?: THREE.DirectionalLight
  hemi?: THREE.HemisphereLight
  post?: PostChain
  /** 朝・夜の環境マップ（用意してあれば差し替える） */
  envMaps?: Partial<Record<TimeOfDay, THREE.Texture>>
}

type HazeLike = { name: string; uniforms: Map<string, THREE.Uniform> }

/** 後処理のかすみ（HazeEffect）を探す（PostChain が公開していないので EffectPass の中から名前で） */
export function findHaze(post: PostChain): HazeLike | null {
  for (const pass of post.composer.passes) {
    const effects = (pass as unknown as { effects?: HazeLike[] }).effects
    if (!Array.isArray(effects)) continue
    for (const e of effects) if (e && e.name === 'HazeEffect') return e
  }
  return null
}

export function applyTimeOfDay(env: FutureEnvironment, t: EnvTargets): void {
  if (t.scene) {
    t.scene.fog = new THREE.FogExp2(new THREE.Color(env.fog.color), env.fog.density)
    const map = t.envMaps?.[env.timeOfDay]
    if (map) t.scene.environment = map
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
    t.sun.color.set(env.sunColor)
    t.sun.intensity = env.sunIntensity
  }
  if (t.hemi) {
    t.hemi.color.set(env.hemi.sky)
    t.hemi.groundColor.set(env.hemi.ground)
    t.hemi.intensity = env.hemi.intensity
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
