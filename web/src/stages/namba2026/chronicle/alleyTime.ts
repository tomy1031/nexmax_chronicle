// 路地の時間（物語 v7 の 9 章）：昼 → 夕方 → 夜 → 夜明け を、作り直さずに空・太陽・半球光・霧・環境光・色調・ブルーム・
// かすみ・看板の光の値だけ動かして切り替える（2086 の applyTimeOfDay と同じ考え方。ここは途中の色も混ぜる）。
// ・set(phase)：ゆっくり（既定 6 秒で 1 段）その時間へ。instant で一瞬
// ・setProjection(k)：社長の「江戸の朝の路地」の映し出し（路地のまわりだけ朝の暖かい光に。空は夜のまま）
// 夜明けは東から（太陽の向きも変わる。影の向きも変わる）。
import * as THREE from 'three'
import type { SkyPalette } from '../../../render/sky'
import type { SunRig } from '../../../render/renderer'
import type { PostChain } from '../../../render/post'

export type AlleyPhase = 'day' | 'dusk' | 'night' | 'dawn'
export const ALLEY_PHASES: readonly AlleyPhase[] = ['day', 'dusk', 'night', 'dawn']

type Haze = { near: string; far: string; density: number; start: number; falloff: number; max: number }
export type AlleyPalette = {
  sky: SkyPalette
  /** 太陽の方位（度。0 = 東 +X、90 = 南 +Z、180 = 西）と高さ（度） */
  sunYaw: number
  sunEl: number
  sunColor: string
  sunIntensity: number
  skySun: number
  hemi: { sky: string; ground: string; intensity: number }
  env: number
  fog: { color: string; density: number }
  grade: { exposure: number; saturation: number; contrast: number; vignette: number }
  bloom: { intensity: number; threshold: number }
  haze: Haze
  /** 看板・窓・灯りの光の強さの倍率 */
  glow: number
}

export const ALLEY_PALETTES: Record<AlleyPhase, AlleyPalette> = {
  day: {
    sky: { zenith: '#2a62cf', upper: '#4c90e6', horizon: '#bcd8f0', warm: '#ffc488', ground: '#7a6650', haze: '#dae2ec', cloudLit: '#fff2e0', cloudShade: '#a6b2cc' },
    sunYaw: 172,
    sunEl: 27,
    sunColor: '#ffd29a',
    sunIntensity: 3.9,
    skySun: 1,
    hemi: { sky: '#b4d2f2', ground: '#8a7058', intensity: 0.46 },
    env: 0.72,
    fog: { color: '#dae2ec', density: 0.003 },
    grade: { exposure: 1.0, saturation: 1.22, contrast: 1.08, vignette: 0.32 },
    bloom: { intensity: 1.2, threshold: 0.95 },
    haze: { near: '#f2e0c6', far: '#8fbffa', density: 0.0034, start: 60, falloff: 0.03, max: 0.7 },
    glow: 1,
  },
  dusk: {
    sky: { zenith: '#34427e', upper: '#86689e', horizon: '#ffae6c', warm: '#ff8a4a', ground: '#5a4030', haze: '#e6a486', cloudLit: '#ffc48a', cloudShade: '#7a5a7a' },
    sunYaw: 176,
    sunEl: 8,
    sunColor: '#ff9a5a',
    sunIntensity: 2.7,
    skySun: 1,
    hemi: { sky: '#c49cb8', ground: '#6a4a3a', intensity: 0.44 },
    env: 0.46,
    fog: { color: '#d89a80', density: 0.004 },
    grade: { exposure: 1.02, saturation: 1.26, contrast: 1.1, vignette: 0.36 },
    bloom: { intensity: 1.3, threshold: 0.9 },
    haze: { near: '#f0b090', far: '#a888b0', density: 0.004, start: 50, falloff: 0.03, max: 0.62 },
    glow: 1.7,
  },
  night: {
    sky: { zenith: '#060c22', upper: '#101c4a', horizon: '#2c2c5e', warm: '#5a3a7a', ground: '#0a0a10', haze: '#1a1a34', cloudLit: '#3a3a6a', cloudShade: '#10102a' },
    sunYaw: 130,
    sunEl: 48,
    sunColor: '#8ea4ff',
    sunIntensity: 0.62,
    skySun: 0,
    hemi: { sky: '#3a4c9a', ground: '#1a1424', intensity: 0.52 },
    env: 0.2,
    fog: { color: '#141a30', density: 0.006 },
    grade: { exposure: 1.18, saturation: 1.2, contrast: 1.1, vignette: 0.42 },
    bloom: { intensity: 1.45, threshold: 0.86 },
    haze: { near: '#1e2240', far: '#141a34', density: 0.005, start: 40, falloff: 0.03, max: 0.6 },
    glow: 2.6,
  },
  dawn: {
    sky: { zenith: '#2a3a78', upper: '#6a7ab8', horizon: '#ffd0a0', warm: '#ffb070', ground: '#4a4040', haze: '#d8c0b8', cloudLit: '#ffe0c0', cloudShade: '#8a8aa8' },
    sunYaw: 8,
    sunEl: 7,
    sunColor: '#ffb880',
    sunIntensity: 2.5,
    skySun: 1,
    hemi: { sky: '#a8b8e0', ground: '#6a5848', intensity: 0.44 },
    env: 0.42,
    fog: { color: '#d8b8a8', density: 0.004 },
    grade: { exposure: 1.02, saturation: 1.22, contrast: 1.08, vignette: 0.34 },
    bloom: { intensity: 1.3, threshold: 0.9 },
    haze: { near: '#f0c8a8', far: '#9aa8d0', density: 0.0038, start: 50, falloff: 0.03, max: 0.62 },
    glow: 1.3,
  },
}

/** 映し出し（江戸の朝）のときに寄せる値。空は変えない（路地のまわりだけの朝） */
const PROJECTION = {
  hemi: { sky: '#ffe2b0', ground: '#c09060', intensity: 1.15 },
  sunColor: '#ffd6a0',
  sunIntensity: 1.6,
  fog: { color: '#e8c098', density: 0.0045 },
  exposure: 1.32,
  bloom: 1.6,
  env: 0.55,
}

/** 太陽の方位・高さ → 地面から太陽への向き */
export function sunDirection(yawDeg: number, elDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const y = (yawDeg * Math.PI) / 180
  const e = (elDeg * Math.PI) / 180
  return out.set(Math.cos(e) * Math.cos(y), Math.sin(e), Math.cos(e) * Math.sin(y)).normalize()
}

/** 位置 p（0 = 昼、1 = 夕方、2 = 夜、3 = 夜明け）で、となりの 2 つの時間を混ぜる。純粋な計算（テストする） */
export function phaseMix(p: number): { a: AlleyPhase; b: AlleyPhase; k: number } {
  const q = Math.max(0, Math.min(3, p))
  const i = Math.min(2, Math.floor(q))
  return { a: ALLEY_PHASES[i], b: ALLEY_PHASES[i + 1], k: q - i }
}

export type AlleyTimeTargets = {
  scene: THREE.Scene
  sky: THREE.Mesh
  sun: SunRig
  post?: PostChain | null
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

const ca = new THREE.Color()
const cb = new THREE.Color()
const cc = new THREE.Color()
const mix = (a: string, b: string, k: number, out: THREE.Color) => out.set(a).lerp(cb.set(b), k)

/**
 * 路地の時間を動かす。glow に看板・窓・灯りのマテリアル（とそのときの emissiveIntensity）を渡すと、夜ほど明るくする
 */
export class AlleyTime {
  private pos = 0
  private target = 0
  /** 1 段（昼 → 夕方など）にかける秒 */
  speed = 1 / 6
  private projection = 0
  private projTarget = 0
  private readonly glow: Array<{ mat: THREE.MeshStandardMaterial; base: number; weight: number }>
  private readonly haze: HazeLike | null
  private readonly sunDir = new THREE.Vector3()
  private readonly dirB = new THREE.Vector3()
  private dirty = true

  private readonly t: AlleyTimeTargets

  /** glowMats：夜ほど明るくする発光のマテリアル（weight で効きを弱められる。1 = 倍率そのまま） */
  constructor(t: AlleyTimeTargets, glowMats: ReadonlyArray<THREE.MeshStandardMaterial | { mat: THREE.MeshStandardMaterial; weight: number }> = []) {
    this.t = t
    this.glow = glowMats.map((g) => ('mat' in g && !(g instanceof THREE.MeshStandardMaterial) ? { mat: g.mat, base: g.mat.emissiveIntensity, weight: g.weight } : { mat: g as THREE.MeshStandardMaterial, base: (g as THREE.MeshStandardMaterial).emissiveIntensity, weight: 1 }))
    this.haze = t.post ? findHaze(t.post) : null
  }

  /** いまの位置（0〜3） */
  get value(): number {
    return this.pos
  }

  get phase(): AlleyPhase {
    return ALLEY_PHASES[Math.round(this.pos)]
  }

  set(phase: AlleyPhase, instant = false): void {
    this.setValue(ALLEY_PHASES.indexOf(phase), instant)
  }

  /** 途中の時間（例：2.5 = 夜と夜明けのあいだ） */
  setValue(p: number, instant = false): void {
    this.target = Math.max(0, Math.min(3, p))
    if (instant) this.pos = this.target
    this.dirty = true
  }

  /** 江戸の朝の映し出し（0〜1。instant でなければ 1 秒ほどで） */
  setProjection(k: number, instant = false): void {
    this.projTarget = Math.max(0, Math.min(1, k))
    if (instant) this.projection = this.projTarget
    this.dirty = true
  }

  get projectionLevel(): number {
    return this.projection
  }

  update(dt: number): void {
    const d = this.target - this.pos
    if (Math.abs(d) > 1e-4) {
      this.pos += Math.sign(d) * Math.min(Math.abs(d), this.speed * dt)
      this.dirty = true
    }
    const dp = this.projTarget - this.projection
    if (Math.abs(dp) > 1e-4) {
      this.projection += Math.sign(dp) * Math.min(Math.abs(dp), dt * (dp > 0 ? 1.2 : 0.7))
      this.dirty = true
    }
    if (this.dirty) this.apply()
  }

  /** いまの値をすべてへ（シェルが環境を作り直した直後などにも） */
  apply(): void {
    this.dirty = false
    const { a, b, k } = phaseMix(this.pos)
    const A = ALLEY_PALETTES[a]
    const B = ALLEY_PALETTES[b]
    const P = this.projection
    const n = (x: number, y: number) => x + (y - x) * k
    // 空
    const u = (this.t.sky.material as THREE.ShaderMaterial).uniforms as Record<string, THREE.IUniform> | undefined
    sunDirection(A.sunYaw, A.sunEl, this.sunDir)
    sunDirection(B.sunYaw, B.sunEl, this.dirB)
    this.sunDir.lerp(this.dirB, k).normalize()
    if (u) {
      const set = (key: string, f: keyof SkyPalette) => (u[key]?.value as THREE.Color | undefined)?.copy(mix(String(A.sky[f]), String(B.sky[f]), k, cc))
      set('uZenith', 'zenith')
      set('uUpper', 'upper')
      set('uHorizon', 'horizon')
      set('uWarm', 'warm')
      set('uGround', 'ground')
      set('uHaze', 'haze')
      set('uCloudLit', 'cloudLit')
      set('uCloudShade', 'cloudShade')
      if (u.uSunStrength) u.uSunStrength.value = n(A.skySun, B.skySun)
      ;(u.uSunDir?.value as THREE.Vector3 | undefined)?.copy(this.sunDir)
    }
    // 太陽（夜は月）と半球光
    const sun = this.t.sun
    sun.sunDir.copy(this.sunDir)
    mix(A.sunColor, B.sunColor, k, sun.sun.color).lerp(ca.set(PROJECTION.sunColor), P * 0.6)
    sun.sun.intensity = n(A.sunIntensity, B.sunIntensity) * (1 - P * 0.2) + PROJECTION.sunIntensity * P * 0.5
    mix(A.hemi.sky, B.hemi.sky, k, sun.hemi.color).lerp(ca.set(PROJECTION.hemi.sky), P)
    mix(A.hemi.ground, B.hemi.ground, k, sun.hemi.groundColor).lerp(ca.set(PROJECTION.hemi.ground), P)
    sun.hemi.intensity = n(A.hemi.intensity, B.hemi.intensity) * (1 - P) + PROJECTION.hemi.intensity * P
    // 霧・環境光
    const scene = this.t.scene
    const fog = scene.fog as THREE.FogExp2 | null
    if (fog && 'density' in fog) {
      mix(A.fog.color, B.fog.color, k, fog.color).lerp(ca.set(PROJECTION.fog.color), P * 0.7)
      fog.density = n(A.fog.density, B.fog.density) * (1 - P) + PROJECTION.fog.density * P
    }
    scene.environmentIntensity = n(A.env, B.env) * (1 - P) + PROJECTION.env * P
    // 色調・ブルーム・かすみ
    const post = this.t.post
    if (post) {
      post.grade.set('gExposure', n(A.grade.exposure, B.grade.exposure) * (1 - P) + PROJECTION.exposure * P)
      post.grade.set('gSaturation', n(A.grade.saturation, B.grade.saturation))
      post.grade.set('gContrast', n(A.grade.contrast, B.grade.contrast))
      post.grade.set('gVignette', n(A.grade.vignette, B.grade.vignette))
      post.bloom.intensity = n(A.bloom.intensity, B.bloom.intensity) * (1 - P) + PROJECTION.bloom * P
      post.bloom.luminanceMaterial.threshold = n(A.bloom.threshold, B.bloom.threshold)
      const h = this.haze
      if (h) {
        ;(h.uniforms.get('hNear')?.value as THREE.Color | undefined)?.copy(mix(A.haze.near, B.haze.near, k, cc))
        ;(h.uniforms.get('hFar')?.value as THREE.Color | undefined)?.copy(mix(A.haze.far, B.haze.far, k, cc))
        const setN = (key: string, x: number) => {
          const un = h.uniforms.get(key)
          if (un) un.value = x
        }
        setN('hDensity', n(A.haze.density, B.haze.density))
        setN('hStart', n(A.haze.start, B.haze.start))
        setN('hFalloff', n(A.haze.falloff, B.haze.falloff))
        setN('hMax', n(A.haze.max, B.haze.max))
      }
    }
    // 看板・窓・灯り
    const g = n(A.glow, B.glow)
    for (const e of this.glow) e.mat.emissiveIntensity = e.base * (1 + (g - 1) * e.weight)
  }
}
