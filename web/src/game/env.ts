// ステージの環境（空のドーム・IBL・霧・太陽・半球光・色調）をシーンへ適用し、移動時に解放する。
// render/sky.ts の関数は PMREM のレンダーターゲットを返さない（テクスチャだけ）ので、解放できるようにここで包む。
import * as THREE from 'three'
import { createSkyDome, makeSkyMaterial, type SkyPalette } from '../render/sky'
import { createSunRig, type SunRig } from '../render/renderer'
import type { QualitySettings } from '../render/quality'
import type { PostChain } from '../render/post'
import type { StageEnvironment } from './stage'

export type EnvTexture = { texture: THREE.Texture; dispose(): void }

/** 手続きの空から IBL 用の環境マップ（解放できる形） */
export function skyEnvironment(renderer: THREE.WebGLRenderer, pal: SkyPalette, sunDir: THREE.Vector3, sunStrength = 0.25): EnvTexture {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const scene = new THREE.Scene()
  const mat = makeSkyMaterial(pal, sunDir, 1)
  mat.uniforms.uSunStrength.value = sunStrength
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat)
  scene.add(mesh)
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 200)
  pmrem.dispose()
  mesh.geometry.dispose()
  mat.dispose()
  return { texture: rt.texture, dispose: () => rt.dispose() }
}

/** HDRI から IBL 用の環境マップ（失敗時は null） */
export async function hdriEnvironment(renderer: THREE.WebGLRenderer, url: string): Promise<EnvTexture | null> {
  try {
    const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js')
    const hdr = await new HDRLoader().loadAsync(url)
    hdr.mapping = THREE.EquirectangularReflectionMapping
    const pmrem = new THREE.PMREMGenerator(renderer)
    const rt = pmrem.fromEquirectangular(hdr)
    pmrem.dispose()
    hdr.dispose()
    return { texture: rt.texture, dispose: () => rt.dispose() }
  } catch (e) {
    console.warn('[env] HDRI を読めないので手続きの空で IBL を作ります', e)
    return null
  }
}

/** 色調の既定値（render/post.ts の GradeEffect と同じ） */
const GRADE_DEFAULT = { exposure: 1.0, saturation: 1.27, contrast: 1.1, vignette: 0.32 }
/** かすみの既定値（render/post.ts の HazeEffect と同じ） */
const HAZE_DEFAULT = { near: new THREE.Color(0.95, 0.88, 0.78), far: new THREE.Color(0.56, 0.75, 0.98), density: 0.0034, start: 60, falloff: 0.03, max: 0.7 }

type HazeLike = { name: string; uniforms: Map<string, THREE.Uniform> }

/** 後処理のかすみ（HazeEffect）。PostChain が公開していないので EffectPass の中から名前で探す */
function findHaze(post: PostChain): HazeLike | null {
  for (const pass of post.composer.passes) {
    const effects = (pass as unknown as { effects?: HazeLike[] }).effects
    if (!Array.isArray(effects)) continue
    for (const e of effects) if (e && e.name === 'HazeEffect') return e
  }
  return null
}

function applyHaze(post: PostChain, h: StageEnvironment['haze']): void {
  const haze = findHaze(post)
  if (!haze) return
  const u = haze.uniforms
  ;(u.get('hNear')?.value as THREE.Color | undefined)?.set(h?.near ?? HAZE_DEFAULT.near)
  ;(u.get('hFar')?.value as THREE.Color | undefined)?.set(h?.far ?? HAZE_DEFAULT.far)
  const setN = (k: string, x: number) => {
    const un = u.get(k)
    if (un) un.value = x
  }
  setN('hDensity', h?.density ?? HAZE_DEFAULT.density)
  setN('hStart', h?.start ?? HAZE_DEFAULT.start)
  setN('hFalloff', h?.falloff ?? HAZE_DEFAULT.falloff)
  setN('hMax', h?.max ?? HAZE_DEFAULT.max)
}

export type AppliedEnvironment = {
  sky: THREE.Mesh
  sun: SunRig
  sunDir: THREE.Vector3
  dispose(): void
}

/** 環境をシーンへ適用する。返り値の dispose() で元に戻して GPU の資源を解放する */
export async function applyEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, post: PostChain, q: QualitySettings, env: StageEnvironment): Promise<AppliedEnvironment> {
  const sunDir = env.sunDir.clone().normalize()
  scene.fog = env.fog ? new THREE.FogExp2(new THREE.Color(env.fog.color), env.fog.density) : null
  const sky = createSkyDome(env.sky, sunDir)
  scene.add(sky)
  const ibl = (env.hdri ? await hdriEnvironment(renderer, env.hdri) : null) ?? skyEnvironment(renderer, env.sky, sunDir)
  scene.environment = ibl.texture
  scene.environmentIntensity = env.envIntensity ?? 0.75
  const sun = createSunRig(scene, q, sunDir)
  if (env.sunColor !== undefined) sun.sun.color.set(env.sunColor)
  if (env.sunIntensity !== undefined) sun.sun.intensity = env.sunIntensity
  if (env.hemi) {
    sun.hemi.color.set(env.hemi.sky)
    sun.hemi.groundColor.set(env.hemi.ground)
    sun.hemi.intensity = env.hemi.intensity
  }
  const g = { ...GRADE_DEFAULT, ...(env.grade ?? {}) }
  post.grade.set('gExposure', g.exposure)
  post.grade.set('gSaturation', g.saturation)
  post.grade.set('gContrast', g.contrast)
  post.grade.set('gVignette', g.vignette)
  if (q.bloom) post.bloom.intensity = env.bloom?.intensity ?? 1.2
  post.bloom.luminanceMaterial.threshold = env.bloom?.threshold ?? 0.95
  applyHaze(post, env.haze)
  return {
    sky,
    sun,
    sunDir,
    dispose() {
      scene.remove(sky)
      sky.geometry.dispose()
      ;(sky.material as THREE.Material).dispose()
      scene.environment = null
      ibl.dispose()
      scene.fog = null
      scene.remove(sun.sun, sun.sun.target, sun.hemi)
      sun.sun.dispose()
      sun.hemi.dispose()
    },
  }
}
