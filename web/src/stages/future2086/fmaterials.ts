// 2086年の会場のマテリアル。共有のライブラリ（render/materials）に無いもの：
// 明るい舗装（Poly Haven: rectangular_paving）、白いパネル（grey_tiles を白く）、ガラスの窓（夜は灯る）、
// ネオン（頂点色×明るさ）、ホログラム（アトラス 1 枚）、布（アトラス 1 枚・裾が揺れる）、提灯、遠景（オルムに喰われて輪郭が溶ける）。
// 昼夜で変わる明るさは setTimeOfDay() でまとめて切り替える（このステージ専用のマテリアルなので共有ライブラリは触らない）。
import * as THREE from 'three'
import { uTime, type MaterialLibrary } from '../../render/materials'
import { loadLetteringFonts } from '../../render/textures'
import { FUTURE_TEXT, ROUNDED, paintChochin, paintDecalAtlas, paintFabricAtlas, paintHoloAtlas, paintWindows, type CanvasAtlas } from './textures2086'

export type TimeOfDay = 'morning' | 'night'

type PBRSet = { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }

const PBR_NAMES = ['rectangular_paving', 'grey_tiles'] as const
type PBRName = (typeof PBR_NAMES)[number]
const pbrCache = new Map<PBRName, PBRSet>()
const loader = new THREE.TextureLoader()

/**
 * 色の付いた写真のテクスチャを、明るさの模様だけ残した色に作り直す（白いパネル・明るい舗装に）。
 * 明るさを lo〜hi へ伸ばして tint を掛ける。読み込みが終わっていなければ、終わったときに差し替える。
 */
function remapTexture(src: THREE.Texture, lo: number, hi: number, tint: [number, number, number], aniso: number): THREE.Texture {
  const out = new THREE.CanvasTexture(document.createElement('canvas'))
  out.colorSpace = THREE.SRGBColorSpace
  out.wrapS = out.wrapT = THREE.RepeatWrapping
  out.anisotropy = aniso
  const run = (img: CanvasImageSource & { width: number; height: number }) => {
    const W = Math.min(1024, img.width)
    const H = Math.min(1024, img.height)
    const cv = out.image as HTMLCanvasElement
    cv.width = W
    cv.height = H
    const ctx = cv.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, W, H)
    const d = ctx.getImageData(0, 0, W, H)
    const a = d.data
    let sum = 0
    let sum2 = 0
    const n = W * H
    for (let i = 0; i < a.length; i += 4) {
      const l = (a[i] * 0.2126 + a[i + 1] * 0.7152 + a[i + 2] * 0.0722) / 255
      sum += l
      sum2 += l * l
    }
    const mean = sum / n
    const sd = Math.sqrt(Math.max(1e-6, sum2 / n - mean * mean))
    for (let i = 0; i < a.length; i += 4) {
      const l = (a[i] * 0.2126 + a[i + 1] * 0.7152 + a[i + 2] * 0.0722) / 255
      const k = Math.min(1, Math.max(0, (l - mean) / (sd * 4) + 0.5))
      const v = lo + (hi - lo) * k
      a[i] = Math.min(255, v * tint[0] * 255)
      a[i + 1] = Math.min(255, v * tint[1] * 255)
      a[i + 2] = Math.min(255, v * tint[2] * 255)
    }
    ctx.putImageData(d, 0, 0)
    out.needsUpdate = true
  }
  const img = src.image as (CanvasImageSource & { width: number; height: number }) | undefined
  if (img && img.width) run(img)
  else {
    const cv = out.image as HTMLCanvasElement
    cv.width = cv.height = 4
    const c = cv.getContext('2d')!
    c.fillStyle = `rgb(${Math.round(hi * tint[0] * 230)},${Math.round(hi * tint[1] * 230)},${Math.round(hi * tint[2] * 230)})`
    c.fillRect(0, 0, 4, 4)
    // 読み込みの完了を待つ（TextureLoader.load は image を後から入れる）
    const poll = () => {
      const im = src.image as (CanvasImageSource & { width: number; height: number }) | undefined
      if (im && im.width) run(im)
      else setTimeout(poll, 100)
    }
    poll()
  }
  return out
}

function setupPBR(set: PBRSet, aniso: number): PBRSet {
  for (const t of [set.map, set.normalMap, set.arm]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = aniso
  }
  set.map.colorSpace = THREE.SRGBColorSpace
  return set
}

/** 先読み（任意）：テクスチャとフォント。読み込み画面の間に await しておくと、組み立て直後から正しい見た目になる */
export async function preloadFutureAssets(aniso = 8): Promise<void> {
  const fonts = (async () => {
    await loadLetteringFonts()
    if (typeof document === 'undefined' || !document.fonts) return
    const t = new Promise<void>((r) => setTimeout(r, 6000))
    await Promise.race([
      Promise.all([document.fonts.load(`800 64px ${ROUNDED}`, FUTURE_TEXT), document.fonts.load(`700 64px ${ROUNDED}`, FUTURE_TEXT)]).catch(() => undefined),
      t,
    ])
  })()
  const tex = Promise.all(
    PBR_NAMES.map(async (name) => {
      if (pbrCache.has(name)) return
      const base = `./textures/${name}/`
      try {
        const [map, normalMap, arm] = await Promise.all([loader.loadAsync(base + 'diff_1k.jpg'), loader.loadAsync(base + 'nor_1k.jpg'), loader.loadAsync(base + 'arm_1k.jpg')])
        pbrCache.set(name, setupPBR({ map, normalMap, arm }, aniso))
      } catch (e) {
        console.warn(`[future2086] ${name} を読めませんでした`, e)
      }
    }),
  )
  await Promise.all([fonts, tex])
}

/** 先読みしていなければ、その場で読み込みを始める（読み終わると自動で反映される） */
function pbr(name: PBRName, aniso: number): PBRSet {
  let s = pbrCache.get(name)
  if (!s) {
    const base = `./textures/${name}/`
    s = setupPBR({ map: loader.load(base + 'diff_1k.jpg'), normalMap: loader.load(base + 'nor_1k.jpg'), arm: loader.load(base + 'arm_1k.jpg') }, aniso)
    pbrCache.set(name, s)
  }
  return s
}

function pbrParams(p: PBRSet): THREE.MeshStandardMaterialParameters {
  return { map: p.map, normalMap: p.normalMap, roughnessMap: p.arm, aoMap: p.arm, metalnessMap: p.arm, roughness: 1, metalness: 1 }
}

// ------------------------------------------------------------------ 遠景の溶解（オルム）

/** 遠景のマテリアル共通の uniform（オルムの進み具合） */
export const DISSOLVE = {
  amount: { value: 0 },
  /** オルムの中心（ワールド） */
  center: { value: new THREE.Vector3() },
}

const NOISE_GLSL = /* glsl */ `
float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dHash(i), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`

/**
 * 遠くの建物が「輪郭を失っていく」溶解：オルムに近い方向・遠い所ほど先に、ノイズで穴があき、縁が赤く光る。
 * 上の方から崩れ、黒く沈む。amount=0 で無効。
 */
export function addDissolve<T extends THREE.MeshStandardMaterial | THREE.MeshBasicMaterial>(mat: T, key: string): T {
  const prev = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r)
    shader.uniforms.uDissolve = DISSOLVE.amount
    shader.uniforms.uOrumC = DISSOLVE.center
    shader.uniforms.uTime = uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vDWorld;\nuniform float uDissolve;\nuniform vec3 uOrumC;\nuniform float uTime;\n${NOISE_GLSL}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
  float dEdge = 0.0;
  if (uDissolve > 0.001) {
    vec3 toO = normalize(uOrumC - vec3(0.0, 0.0, 0.0));
    float far = smoothstep(50.0, 320.0, length(vDWorld.xz));
    vec3 dir = normalize(vDWorld - vec3(0.0, vDWorld.y * 0.6, 0.0));
    float facing = smoothstep(-0.4, 0.9, dot(normalize(vec3(dir.x, 0.0, dir.z)), normalize(vec3(toO.x, 0.0, toO.z))));
    float high = smoothstep(0.0, 90.0, vDWorld.y);
    float n = dNoise(vDWorld * 0.18 + vec3(0.0, uTime * 0.25, 0.0)) * 0.62 + dNoise(vDWorld * 0.9) * 0.38;
    float th = uDissolve * (0.15 + 0.85 * far) * (0.35 + 0.65 * facing) * (0.6 + 0.6 * high) * 1.25;
    if (n < th) discard;
    dEdge = 1.0 - smoothstep(0.0, 0.07, n - th);
    dEdge *= step(0.02, th);
  }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
  if (uDissolve > 0.001) {
    gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.35, 0.3, 0.45), clamp(uDissolve * 0.8, 0.0, 0.7));
    gl_FragColor.rgb += vec3(2.6, 0.25, 0.7) * dEdge * 2.2;
  }`,
      )
  }
  mat.customProgramCacheKey = () => 'dissolve-' + key
  return mat
}

// ------------------------------------------------------------------ ホログラム

const holoVert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const holoFrag = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uIntensity;
uniform float uOpacity;
uniform float uBlink;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.01) discard;
  float scan = 0.86 + 0.14 * sin(vWorld.y * 55.0 - uTime * 5.0);
  float band = smoothstep(0.92, 1.0, fract(vWorld.y * 0.35 - uTime * 0.45)) * 0.5;
  float flick = 0.95 + 0.05 * sin(uTime * 31.0 + vWorld.x * 2.7) * sin(uTime * 7.3 + vWorld.z * 1.3);
  float blink = mix(1.0, 0.55 + 0.45 * step(0.5, fract(uTime * 1.6)), uBlink);
  // 明るい部分ほど HDR で光らせる（文字と縁はブルームでにじむ）
  float lum = max(t.r, max(t.g, t.b));
  vec3 col = t.rgb * (0.6 + uIntensity * smoothstep(0.35, 1.0, lum)) * scan * flick * blink;
  col += t.rgb * band;
  gl_FragColor = vec4(col, t.a * uOpacity * blink);
}
`

export function createHoloMaterial(map: THREE.Texture, intensity = 1.8, blink = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: holoVert,
    fragmentShader: holoFrag,
    uniforms: {
      map: { value: map },
      uTime,
      uIntensity: { value: intensity },
      uOpacity: { value: 1 },
      uBlink: { value: blink },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.NormalBlending,
    fog: false,
  })
}

// ------------------------------------------------------------------ 布（裾が揺れる。aHang：0=留め具、1=裾）

function makeCloth(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aHang;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float ph = wp.x * 0.6 + wp.z * 0.45;
          transformed += objectNormal * (sin(uTime * 1.9 + ph + aHang * 2.6) * 0.07 + sin(uTime * 3.3 + ph * 1.7) * 0.025) * aHang;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'future-cloth'
  return mat
}

// ------------------------------------------------------------------ ライブラリ

export type FutureMaterials = ReturnType<typeof createFutureMaterials>

export function createFutureMaterials(mats: MaterialLibrary, aniso = 8) {
  const paveP = pbr('rectangular_paving', aniso)
  const tileP = pbr('grey_tiles', aniso)
  const ironN = mats.iron.normalMap

  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p })

  // 写真の色味（茶色っぽい）は使わず、明るさの模様だけを残した明るい石・白いパネルに
  const paveMap = remapTexture(paveP.map, 0.46, 0.8, [1.0, 0.93, 0.84], aniso)
  const tileMap = remapTexture(tileP.map, 0.72, 0.9, [0.97, 0.985, 1.0], aniso)
  const paving = std({ ...pbrParams(paveP), map: paveMap, color: new THREE.Color(1, 1, 1) })
  const panel = std({ ...pbrParams(tileP), map: tileMap, color: new THREE.Color(1, 1, 1), normalScale: new THREE.Vector2(0.55, 0.55), envMapIntensity: 1.1 })
  // 白い樹脂（ケース・屋台の骨・ブースの機材）
  const plastic = std({ color: '#ffffff', roughness: 0.36, metalness: 0.04, envMapIntensity: 1.0 })
  const metal = std({ color: '#d0d8e2', roughness: 0.26, metalness: 0.88, normalMap: ironN, normalScale: new THREE.Vector2(0.15, 0.15), envMapIntensity: 1.2 })
  const darkMetal = std({ color: '#3b4352', roughness: 0.38, metalness: 0.72, normalMap: ironN, normalScale: new THREE.Vector2(0.3, 0.3) })
  const rubber = std({ color: '#20242c', roughness: 0.62, metalness: 0 })
  const wins = paintWindows()
  const glass = std({ map: wins.color, emissiveMap: wins.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.1, roughness: 0.1, metalness: 0.45, envMapIntensity: 1.5 })
  // ネオン（頂点色が色、color が昼夜の明るさ）
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1), fog: false })
  // 遠景（オルムで溶ける）
  const farPanel = addDissolve(std({ ...pbrParams(tileP), map: tileMap, color: new THREE.Color(0.97, 0.98, 1), normalScale: new THREE.Vector2(0.4, 0.4) }), 'panel')
  const farGlass = addDissolve(
    std({ map: wins.color, emissiveMap: wins.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.1, roughness: 0.12, metalness: 0.45, envMapIntensity: 1.4 }),
    'glass',
  )
  const farGlow = addDissolve(new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1, 1, 1), fog: false }), 'glow')
  const farPlain = addDissolve(std({ color: '#ffffff', roughness: 0.6, metalness: 0.1 }), 'plain')

  const fabricAtlas = paintFabricAtlas()
  const fabricTex = fabricAtlas.texture(aniso)
  const cloth = makeCloth(new THREE.MeshStandardMaterial({ map: fabricTex, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.88 }))
  const holoAtlas = paintHoloAtlas()
  const holoTex = holoAtlas.texture(aniso)
  const holo = createHoloMaterial(holoTex, 1.8, 0)
  const holoNight = createHoloMaterial(holoTex, 2.4, 1)
  const decalAtlas = paintDecalAtlas()
  const decalTex = decalAtlas.texture(aniso)
  const decal = new THREE.MeshStandardMaterial({ map: decalTex, alphaTest: 0.4, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  const screen = new THREE.MeshStandardMaterial({ map: decalTex, emissiveMap: decalTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.3, roughness: 0.3 })
  const choch = paintChochin()
  const lantern = std({ map: choch.color, emissiveMap: choch.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 1.1, roughness: 0.85, side: THREE.DoubleSide })
  // ブースのリングの内側などの、つやのある紺の外装
  const navyGloss = std({ color: '#26346e', roughness: 0.22, metalness: 0.3, envMapIntensity: 1.2 })
  const debris = new THREE.MeshStandardMaterial({ color: '#141018', roughness: 0.75, metalness: 0.15, emissive: new THREE.Color('#2a0612'), emissiveIntensity: 0.6 })

  const named = { paving, panel, plastic, metal, darkMetal, rubber, glass, glow, farPanel, farGlass, farGlow, farPlain, cloth, holo, holoNight, decal, screen, lantern, navyGloss, debris }
  for (const [k, m] of Object.entries(named)) (m as THREE.Material).name = 'f2086-' + k
  let tod: TimeOfDay = 'morning'
  let action = false

  return {
    ...named,
    /** 共有ライブラリ（木・草・葉・花など） */
    lib: mats,
    atlases: { fabric: fabricAtlas, holo: holoAtlas, decal: decalAtlas } as Record<'fabric' | 'holo' | 'decal', CanvasAtlas>,
    textures: [fabricTex, holoTex, decalTex, wins.color, wins.emissive, choch.color, choch.emissive, paveMap, tileMap],
    setTimeOfDay(mode: TimeOfDay) {
      tod = mode
      applyLights()
    },
    /**
     * アクションの間（黒い手からにげる・最後の夜の黒い手）は、祭りの光（看板・提灯・光の帯・ホログラム）を一段落とす。
     * 逃げ先・黒い手・プレイヤーが、まわりの光に負けないように。false で元の強さへ
     */
    setAction(on: boolean) {
      action = on
      applyLights()
    },
  }
  function applyLights(): void {
    const night = tod === 'night'
    const a = action && night
    // アクション中の値は、美術監督の初期案（看板 1.1・ホロ 1.6・光の帯 1.15）より少し強めに落とす（ブルームで白くとんで差が見えにくいため）
    glow.color.setScalar(night ? (a ? 1.05 : 1.55) : 1.0)
    farGlow.color.setScalar(night ? (a ? 0.95 : 1.4) : 0.9)
    glass.emissiveIntensity = night ? (a ? 0.55 : 0.95) : 0.1
    farGlass.emissiveIntensity = night ? (a ? 0.5 : 0.9) : 0.08
    lantern.emissiveIntensity = night ? (a ? 1.45 : 2.5) : 1.1
    screen.emissiveIntensity = night ? (a ? 0.95 : 1.8) : 1.3
    holo.uniforms.uIntensity.value = night ? (a ? 1.35 : 2.4) : 1.8
    holoNight.uniforms.uIntensity.value = a ? 1.35 : 2.4
  }
}
