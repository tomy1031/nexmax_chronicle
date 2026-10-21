// 1726年の一日の空（7 章）：昼 → 夕暮れ → 夜（提灯・月・星）→ 夜明け前（東の空が白む）→ 夜明け（朝日）→ 朝。
// 作り直さずに、空のドームの色・太陽（夜は月明かり）の向きと色・半球光・霧・IBL（環境マップ）・色調・ブルーム・かすみ・
// 提灯の点光源の強さを切りかえる（導入編の captureDay / setDusk / applyDusk を、時間帯の表にしたもの）。
// 昼の環境マップはシェルが HDRI から作ったもの（scene.environment）を借り、夜・夜明けの 2 枚はここで作って dispose で解放する。
// set(time, sec) で sec 秒かけて移る。dawn(k) は夜 → 夜明け前 → 夜明け → 朝 を 0〜1 の一本の目盛りで（夜明けの演出用）。
import * as THREE from 'three'
import { EDO_SKY, type SkyPalette } from '../../../render/sky'
import type { PostChain } from '../../../render/post'
import type { SunRig } from '../../../render/renderer'
import type { LightSpot } from '../../../world/edo/kit'
import { skyEnvironment, type EnvTexture } from '../../../game/env'
import { dawnSunDir } from './layout'

export type EdoTime = 'day' | 'dusk' | 'night' | 'predawn' | 'dawn' | 'morning'

type Look = {
  sky: SkyPalette
  sunDir: THREE.Vector3
  sunColor: string
  sunIntensity: number
  /** 空の太陽の円盤とまわりの光 */
  skySun: number
  hemi: { sky: string; ground: string; intensity: number }
  fog: { color: string; density: number }
  env: 'day' | 'night' | 'dawn'
  envIntensity: number
  grade: { exposure: number; saturation: number; contrast: number; vignette: number }
  bloom: { intensity: number; threshold: number }
  haze: { near: string; far: string; density: number; max: number }
  /** 提灯の点光源の強さ（倍） */
  lantern: number
  /** 月と星 */
  night: number
}

/** 昼の太陽（導入編と同じ：西北西・やや低め） */
const DAY_SUN = (() => {
  const yaw = (-148 * Math.PI) / 180
  const el = (34 * Math.PI) / 180
  return new THREE.Vector3(Math.cos(el) * Math.cos(yaw), Math.sin(el), Math.cos(el) * Math.sin(yaw)).normalize()
})()
/** 月（南西の高いところ）：夜の「太陽」の向き */
const MOON_DIR = new THREE.Vector3(-0.45, 0.78, 0.42).normalize()

export const EDO_LOOKS: Record<EdoTime, Look> = {
  day: {
    sky: EDO_SKY,
    sunDir: DAY_SUN,
    sunColor: '#ffd09a',
    sunIntensity: 4.0,
    skySun: 1,
    hemi: { sky: '#a9cdf5', ground: '#a5744a', intensity: 0.4 },
    fog: { color: EDO_SKY.haze as string, density: 0.0028 },
    env: 'day',
    envIntensity: 0.75,
    grade: { exposure: 1.0, saturation: 1.27, contrast: 1.1, vignette: 0.32 },
    bloom: { intensity: 1.2, threshold: 0.95 },
    haze: { near: '#f2e0c6', far: '#8fbff8', density: 0.0034, max: 0.7 },
    lantern: 1,
    night: 0,
  },
  dusk: {
    sky: { zenith: '#2c3c86', upper: '#6a62b0', horizon: '#f2a878', warm: '#ff9858', ground: '#6a4a3c', haze: '#e8b898', cloudLit: '#ffcaa0', cloudShade: '#8a7aa0' },
    sunDir: new THREE.Vector3(-0.82, 0.16, -0.5).normalize(),
    sunColor: '#ff9a5a',
    sunIntensity: 2.6,
    skySun: 1,
    hemi: { sky: '#9a8ac8', ground: '#8a5a3a', intensity: 0.45 },
    fog: { color: '#e0a888', density: 0.003 },
    env: 'day',
    envIntensity: 0.55,
    grade: { exposure: 1.02, saturation: 1.3, contrast: 1.1, vignette: 0.36 },
    bloom: { intensity: 1.25, threshold: 0.92 },
    haze: { near: '#f0b890', far: '#9a8ac8', density: 0.0034, max: 0.65 },
    lantern: 1.4,
    night: 0.1,
  },
  night: {
    sky: { zenith: '#070c2a', upper: '#142060', horizon: '#33366e', warm: '#5a4a90', ground: '#0e0c16', haze: '#1c2046', cloudLit: '#3a4680', cloudShade: '#10142c' },
    sunDir: MOON_DIR,
    sunColor: '#a4b8ff',
    sunIntensity: 0.65,
    skySun: 0,
    // 夜でも人物とボスの顔が読める明るさ（暗部を沈めすぎない・四隅を暗くしすぎない）
    hemi: { sky: '#4a5cb8', ground: '#2a1c2a', intensity: 0.8 },
    fog: { color: '#161a38', density: 0.0035 },
    env: 'night',
    envIntensity: 0.55,
    grade: { exposure: 1.2, saturation: 1.2, contrast: 1.04, vignette: 0.25 },
    bloom: { intensity: 1.4, threshold: 0.88 },
    haze: { near: '#2a2a50', far: '#1a1e44', density: 0.004, max: 0.6 },
    lantern: 2.2,
    night: 1,
  },
  predawn: {
    sky: { zenith: '#18215a', upper: '#3c3f86', horizon: '#e49a8c', warm: '#ffa066', ground: '#2a2232', haze: '#7a6488', cloudLit: '#f0a8a0', cloudShade: '#3c3664' },
    sunDir: dawnSunDir(-3),
    sunColor: '#ff9a78',
    sunIntensity: 0.5,
    skySun: 0.35,
    hemi: { sky: '#7a74c0', ground: '#3a2a34', intensity: 0.55 },
    fog: { color: '#5a4a70', density: 0.0032 },
    env: 'dawn',
    envIntensity: 0.45,
    grade: { exposure: 1.15, saturation: 1.22, contrast: 1.1, vignette: 0.4 },
    bloom: { intensity: 1.35, threshold: 0.9 },
    haze: { near: '#8a6a88', far: '#5a5a98', density: 0.0036, max: 0.6 },
    lantern: 1.8,
    night: 0.55,
  },
  dawn: {
    sky: { zenith: '#3462ba', upper: '#7c9ee0', horizon: '#ffc48c', warm: '#ffac58', ground: '#6a5040', haze: '#f2c49c', cloudLit: '#ffdcb0', cloudShade: '#a888a8' },
    sunDir: dawnSunDir(10),
    sunColor: '#ffb070',
    sunIntensity: 3.0,
    skySun: 1,
    hemi: { sky: '#b4b0e0', ground: '#8a6044', intensity: 0.5 },
    fog: { color: '#f0c098', density: 0.003 },
    env: 'dawn',
    envIntensity: 0.6,
    grade: { exposure: 1.05, saturation: 1.3, contrast: 1.1, vignette: 0.34 },
    bloom: { intensity: 1.35, threshold: 0.9 },
    haze: { near: '#ffd0a0', far: '#a8b4e8', density: 0.0034, max: 0.65 },
    lantern: 1.1,
    night: 0,
  },
  morning: {
    sky: { zenith: '#2266d4', upper: '#4c98ee', horizon: '#c4e2f8', warm: '#ffe0b0', ground: '#8a6a4c', haze: '#d8e6f0', cloudLit: '#fffaf0', cloudShade: '#a9b6cf' },
    sunDir: dawnSunDir(24),
    sunColor: '#ffe0b8',
    sunIntensity: 3.8,
    skySun: 1,
    hemi: { sky: '#a9cdf5', ground: '#a5744a', intensity: 0.45 },
    fog: { color: '#d8e6f0', density: 0.0026 },
    env: 'day',
    envIntensity: 0.75,
    grade: { exposure: 1.0, saturation: 1.28, contrast: 1.1, vignette: 0.32 },
    bloom: { intensity: 1.2, threshold: 0.95 },
    haze: { near: '#f6e6cc', far: '#8fc0f6', density: 0.0032, max: 0.66 },
    lantern: 1,
    night: 0,
  },
}

/** dawn(k) の目盛り：夜 0 → 夜明け前 0.35 → 夜明け 0.7 → 朝 1 */
const DAWN_STEPS: Array<[number, EdoTime]> = [
  [0, 'night'],
  [0.35, 'predawn'],
  [0.7, 'dawn'],
  [1, 'morning'],
]

export type SkyTargets = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  /** 空のドーム（render/sky.ts の makeSkyMaterial） */
  sky: THREE.Mesh
  sun: SunRig
  post?: PostChain | null
  /** 提灯などの点光源の候補（強さを時間帯で変える） */
  lights?: LightSpot[]
}

type HazeLike = { name: string; uniforms: Map<string, THREE.Uniform> }

function findHaze(post: PostChain): HazeLike | null {
  for (const pass of post.composer.passes) {
    const effects = (pass as unknown as { effects?: HazeLike[] }).effects
    if (!Array.isArray(effects)) continue
    for (const e of effects) if (e && e.name === 'HazeEffect') return e
  }
  return null
}

/** 夜空の月と星（空のドームの前。カメラについていく） */
class NightSky {
  readonly group = new THREE.Group()
  private readonly starMat: THREE.PointsMaterial
  private readonly moonMat: THREE.MeshBasicMaterial
  private readonly haloMat: THREE.MeshBasicMaterial
  constructor() {
    const n = 420
    const pos = new Float32Array(n * 3)
    let s = 1726
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < n; i++) {
      const y = 0.12 + rnd() * 0.88
      const a = rnd() * Math.PI * 2
      const r = Math.sqrt(1 - y * y)
      pos[i * 3] = Math.cos(a) * r * 800
      pos[i * 3 + 1] = y * 800
      pos[i * 3 + 2] = Math.sin(a) * r * 800
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.starMat = new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.6, 2.0), size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false })
    const stars = new THREE.Points(g, this.starMat)
    stars.frustumCulled = false
    stars.renderOrder = -9
    this.moonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.75, 1.5), transparent: true, opacity: 0, depthWrite: false, fog: false, toneMapped: false })
    const moon = new THREE.Mesh(new THREE.CircleGeometry(22, 32), this.moonMat)
    moon.position.copy(MOON_DIR).multiplyScalar(780)
    moon.lookAt(0, 0, 0)
    moon.renderOrder = -8
    this.haloMat = new THREE.MeshBasicMaterial({ color: '#7a88d8', transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
    const halo = new THREE.Mesh(new THREE.CircleGeometry(70, 32), this.haloMat)
    halo.position.copy(MOON_DIR).multiplyScalar(790)
    halo.lookAt(0, 0, 0)
    halo.renderOrder = -9
    this.group.add(stars, halo, moon)
    this.group.name = 'edo_night_sky'
  }
  set(k: number): void {
    this.group.visible = k > 0.01
    this.starMat.opacity = k
    this.moonMat.opacity = k
    this.haloMat.opacity = k * 0.18
  }
}

export class EdoSkyCycle {
  /** 月と星（ステージのルートに足す。カメラの位置へ動かす） */
  readonly nightSky = new NightSky()
  private readonly t: SkyTargets
  private readonly dayEnv: THREE.Texture | null
  private nightEnv: EnvTexture | null = null
  private dawnEnv: EnvTexture | null = null
  private readonly baseLantern: number[]
  private from: Look = EDO_LOOKS.day
  private to: Look = EDO_LOOKS.day
  private k = 1
  private dur = 0
  private readonly tmpA = new THREE.Color()
  private readonly tmpB = new THREE.Color()
  private readonly dir = new THREE.Vector3()
  private readonly haze: HazeLike | null
  /** 今の時間帯（移っている最中は行き先） */
  time: EdoTime = 'day'
  /** dawn(k) の値（-1 は使っていない） */
  dawnK = -1

  constructor(t: SkyTargets) {
    this.t = t
    this.dayEnv = t.scene.environment
    this.baseLantern = (t.lights ?? []).map((l) => l.intensity)
    this.haze = t.post ? findHaze(t.post) : null
  }

  /** 夜・夜明けの環境マップを作る（読み込みの間に一度） */
  prepare(): void {
    if (!this.nightEnv) this.nightEnv = skyEnvironment(this.t.renderer, EDO_LOOKS.night.sky, EDO_LOOKS.night.sunDir, 0)
    if (!this.dawnEnv) this.dawnEnv = skyEnvironment(this.t.renderer, EDO_LOOKS.dawn.sky, EDO_LOOKS.dawn.sunDir, 0.5)
  }

  /** time へ sec 秒かけて移る（0 ならすぐ） */
  set(time: EdoTime, sec = 0): void {
    this.prepare()
    this.dawnK = -1
    this.from = sec > 0 ? this.snapshot() : EDO_LOOKS[time]
    this.to = EDO_LOOKS[time]
    this.time = time
    this.k = sec > 0 ? 0 : 1
    this.dur = sec
    this.apply(this.from, this.to, sec > 0 ? 0 : 1)
  }

  /** 夜明けの目盛り（0＝夜・0.35＝夜明け前・0.7＝夜明け・1＝朝）。演出がこの値を少しずつ進める */
  dawn(k: number): void {
    this.prepare()
    k = Math.max(0, Math.min(1, k))
    this.dawnK = k
    this.dur = 0
    this.k = 1
    let i = 0
    while (i < DAWN_STEPS.length - 2 && k > DAWN_STEPS[i + 1][0]) i++
    const [k0, a] = DAWN_STEPS[i]
    const [k1, b] = DAWN_STEPS[i + 1]
    const u = (k - k0) / (k1 - k0)
    this.time = u < 0.5 ? a : b
    this.from = EDO_LOOKS[a]
    this.to = EDO_LOOKS[b]
    this.apply(this.from, this.to, u)
  }

  /** 移っている最中か */
  get busy(): boolean {
    return this.k < 1
  }

  update(dt: number, camera?: THREE.Camera): void {
    if (camera) this.nightSky.group.position.copy(camera.position)
    if (this.k >= 1) return
    this.k = Math.min(1, this.k + dt / Math.max(0.001, this.dur))
    const e = this.k * this.k * (3 - 2 * this.k)
    this.apply(this.from, this.to, e)
  }

  /** 今の見た目を表にする（途中から次へ移るため） */
  private snapshot(): Look {
    const u = (this.t.sky.material as THREE.ShaderMaterial).uniforms
    const hex = (c: THREE.Color) => '#' + c.getHexString()
    const sky: SkyPalette = {
      zenith: hex(u.uZenith.value),
      upper: hex(u.uUpper.value),
      horizon: hex(u.uHorizon.value),
      warm: hex(u.uWarm.value),
      ground: hex(u.uGround.value),
      haze: hex(u.uHaze.value),
      cloudLit: hex(u.uCloudLit.value),
      cloudShade: hex(u.uCloudShade.value),
    }
    const fog = this.t.scene.fog as THREE.FogExp2 | null
    const g = this.t.post?.grade.uniforms
    const num = (k: string, d: number) => ((g?.get(k)?.value as number | undefined) ?? d)
    const hz = this.haze?.uniforms
    const L = this.to
    return {
      sky,
      sunDir: this.t.sun.sunDir.clone(),
      sunColor: hex(this.t.sun.sun.color),
      sunIntensity: this.t.sun.sun.intensity,
      skySun: (u.uSunStrength?.value as number) ?? 1,
      hemi: { sky: hex(this.t.sun.hemi.color), ground: hex(this.t.sun.hemi.groundColor), intensity: this.t.sun.hemi.intensity },
      fog: { color: fog ? hex(fog.color) : L.fog.color, density: fog?.density ?? L.fog.density },
      env: L.env,
      envIntensity: this.t.scene.environmentIntensity,
      grade: { exposure: num('gExposure', L.grade.exposure), saturation: num('gSaturation', L.grade.saturation), contrast: num('gContrast', L.grade.contrast), vignette: num('gVignette', L.grade.vignette) },
      bloom: { intensity: this.t.post?.bloom.intensity ?? L.bloom.intensity, threshold: this.t.post?.bloom.luminanceMaterial.threshold ?? L.bloom.threshold },
      haze: {
        near: hz ? hex(hz.get('hNear')?.value as THREE.Color) : L.haze.near,
        far: hz ? hex(hz.get('hFar')?.value as THREE.Color) : L.haze.far,
        density: (hz?.get('hDensity')?.value as number) ?? L.haze.density,
        max: (hz?.get('hMax')?.value as number) ?? L.haze.max,
      },
      lantern: this.lanternK,
      night: this.nightK,
    }
  }

  private lanternK = 1
  private nightK = 0

  /** 夜のぐあい（0 = 昼、1 = 夜） */
  get night(): number {
    return this.nightK
  }

  private col(a: string, b: string, k: number, out: THREE.Color): THREE.Color {
    return out.copy(this.tmpA.set(a)).lerp(this.tmpB.set(b), k)
  }

  private apply(a: Look, b: Look, k: number): void {
    const n = (x: number, y: number) => x + (y - x) * k
    const t = this.t
    // 空のドーム
    const u = (t.sky.material as THREE.ShaderMaterial).uniforms
    const keys: Array<[string, keyof SkyPalette]> = [
      ['uZenith', 'zenith'],
      ['uUpper', 'upper'],
      ['uHorizon', 'horizon'],
      ['uWarm', 'warm'],
      ['uGround', 'ground'],
      ['uHaze', 'haze'],
      ['uCloudLit', 'cloudLit'],
      ['uCloudShade', 'cloudShade'],
    ]
    for (const [uk, pk] of keys) if (u[uk]) this.col(a.sky[pk] as string, b.sky[pk] as string, k, u[uk].value as THREE.Color)
    if (u.uSunStrength) u.uSunStrength.value = n(a.skySun, b.skySun)
    this.dir.copy(a.sunDir).lerp(b.sunDir, k).normalize()
    ;(u.uSunDir?.value as THREE.Vector3 | undefined)?.copy(this.dir)
    // 太陽（夜は月明かり）。影の向きも変える
    t.sun.sunDir.copy(this.dir)
    this.col(a.sunColor, b.sunColor, k, t.sun.sun.color)
    t.sun.sun.intensity = n(a.sunIntensity, b.sunIntensity)
    this.col(a.hemi.sky, b.hemi.sky, k, t.sun.hemi.color)
    this.col(a.hemi.ground, b.hemi.ground, k, t.sun.hemi.groundColor)
    t.sun.hemi.intensity = n(a.hemi.intensity, b.hemi.intensity)
    // 霧
    const fog = t.scene.fog as THREE.FogExp2 | null
    if (fog) {
      this.col(a.fog.color, b.fog.color, k, fog.color)
      fog.density = n(a.fog.density, b.fog.density)
    }
    // 環境マップ（混ぜられないので、半分を過ぎたら行き先へ）
    const env = k < 0.5 ? a.env : b.env
    const map = env === 'day' ? this.dayEnv : env === 'night' ? (this.nightEnv?.texture ?? null) : (this.dawnEnv?.texture ?? null)
    if (map && t.scene.environment !== map) t.scene.environment = map
    t.scene.environmentIntensity = n(a.envIntensity, b.envIntensity)
    // 色調・ブルーム・かすみ
    if (t.post) {
      t.post.grade.set('gExposure', n(a.grade.exposure, b.grade.exposure))
      t.post.grade.set('gSaturation', n(a.grade.saturation, b.grade.saturation))
      t.post.grade.set('gContrast', n(a.grade.contrast, b.grade.contrast))
      t.post.grade.set('gVignette', n(a.grade.vignette, b.grade.vignette))
      t.post.bloom.intensity = n(a.bloom.intensity, b.bloom.intensity)
      t.post.bloom.luminanceMaterial.threshold = n(a.bloom.threshold, b.bloom.threshold)
    }
    if (this.haze) {
      const hu = this.haze.uniforms
      const hn = hu.get('hNear')?.value as THREE.Color | undefined
      const hf = hu.get('hFar')?.value as THREE.Color | undefined
      if (hn) this.col(a.haze.near, b.haze.near, k, hn)
      if (hf) this.col(a.haze.far, b.haze.far, k, hf)
      const d = hu.get('hDensity')
      if (d) d.value = n(a.haze.density, b.haze.density)
      const mx = hu.get('hMax')
      if (mx) mx.value = n(a.haze.max, b.haze.max)
    }
    // 提灯の点光源
    this.lanternK = n(a.lantern, b.lantern)
    const L = t.lights ?? []
    for (let i = 0; i < L.length && i < this.baseLantern.length; i++) L[i].intensity = this.baseLantern[i] * this.lanternK
    // 月と星
    this.nightK = n(a.night, b.night)
    this.nightSky.set(this.nightK)
  }

  /** 夜・夜明けの環境マップを解放し、昼の環境マップに戻す */
  dispose(): void {
    if (this.dayEnv) this.t.scene.environment = this.dayEnv
    this.nightEnv?.dispose()
    this.dawnEnv?.dispose()
    this.nightEnv = null
    this.dawnEnv = null
  }
}
