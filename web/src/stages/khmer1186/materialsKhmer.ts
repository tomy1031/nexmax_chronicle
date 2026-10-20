// 1186年 クメールの都のマテリアル。Poly Haven CC0（public/textures）を 3 組だけ読み、あとはキャンバスで描く（texturesKhmer.ts）。
// 静的な物は Batch で頂点カラー（色の違い）付きに結合するので、多くは vertexColors=true（色はタイントで付ける）。
import * as THREE from 'three'
import { makeFoliage, uTime } from '../../render/materials'
import { paintBark, paintLeafCard, paintNoiseNormal, tex } from '../../render/textures'
import { createWaterMaterial } from '../../world/edo/water'
import {
  GROUND_AREA,
  paintAshlar,
  paintGround,
  paintGroundDetail,
  paintKrama,
  paintLaterite,
  paintPalmLeaves,
  paintProcessionRelief,
  paintStoryRelief,
  paintThatch,
  paintWeave,
} from './texturesKhmer'

type PBRSet = { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }
const loader = new THREE.TextureLoader()

async function loadPBR(name: string, aniso: number): Promise<PBRSet | null> {
  const base = `./textures/${name}/`
  try {
    const [map, normalMap, arm] = await Promise.all([loader.loadAsync(base + 'diff_1k.jpg'), loader.loadAsync(base + 'nor_1k.jpg'), loader.loadAsync(base + 'arm_1k.jpg')])
    for (const t of [map, normalMap, arm]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = aniso
    }
    map.colorSpace = THREE.SRGBColorSpace
    return { map, normalMap, arm }
  } catch (e) {
    console.warn(`[khmer] ${name} を読めないので単色で代用します`, e)
    return null
  }
}

function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, ...p })
}

function pbr(p: PBRSet | null, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  if (!p) return std({ roughness: 0.85, ...extra })
  return std({ map: p.map, normalMap: p.normalMap, roughnessMap: p.arm, aoMap: p.arm, roughness: 1, metalness: 0, ...extra })
}

/** 布のはためき（上端は固定。UV の v=1 が上端） */
function makeCloth(mat: THREE.MeshStandardMaterial, amp = 0.07): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          // 2×2 のアトラス：各区画の中で上端（v の大きい方）を固定する
          float hang = 1.0 - fract(uv.y * 2.0);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float ph = wp.x * 0.7 + wp.z * 0.5;
          transformed += objectNormal * sin(uTime * 2.3 + ph + uv.y * 3.0) * ${amp.toFixed(3)} * hang;
        }`,
      )
  }
  mat.customProgramCacheKey = () => `khmer-cloth-${amp}`
  return mat
}

/**
 * 地面：大きな色分けの絵（ワールド XZ → UV）に、小さなくり返しのざらつきをかける。
 * Batch の UV は使わず、ワールド座標から計算する（どの区画の床でも絵がつながる）
 */
function makeGround(map: THREE.Texture, detail: THREE.Texture): THREE.MeshStandardMaterial {
  const m = std({ map, roughness: 0.96, metalness: 0 })
  const A = GROUND_AREA
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: detail }
    shader.uniforms.uArea = { value: new THREE.Vector4(A.x0, A.z0, A.x1 - A.x0, A.z1 - A.z0) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform vec4 uArea;\nvarying vec3 vGWorld;')
      .replace(
        '#include <map_fragment>',
        `{
          vec2 guv = vec2((vGWorld.x - uArea.x) / uArea.z, 1.0 - (vGWorld.z - uArea.y) / uArea.w);
          vec4 texelColor = texture2D(map, guv);
          float d = texture2D(uDetail, vGWorld.xz * 0.45).r * 0.6 + texture2D(uDetail, vGWorld.xz * 0.11).r * 0.6;
          texelColor.rgb *= 0.55 + d * 0.55;
          diffuseColor *= texelColor;
        }`,
      )
  }
  m.customProgramCacheKey = () => 'khmer-ground'
  return m
}

export type KhmerMaterials = Awaited<ReturnType<typeof createKhmerMaterials>>

export async function createKhmerMaterials(aniso: number) {
  const [tiles, woodP, planksP] = await Promise.all([loadPBR('large_grey_tiles', aniso), loadPBR('rough_wood', aniso), loadPBR('weathered_brown_planks', aniso)])
  const noiseN = tex(paintNoiseNormal(256, 10, 2.2), false, aniso)
  const ashlar = paintAshlar()
  const later = paintLaterite()
  const story = paintStoryRelief()
  const proc = paintProcessionRelief()
  const thatchP = paintThatch()
  const weaveP = paintWeave()
  const kramaP = paintKrama()
  const palmP = paintPalmLeaves()
  const groundT = tex(paintGround(), true, aniso)
  groundT.wrapS = groundT.wrapT = THREE.ClampToEdgeWrapping
  const detailT = tex(paintGroundDetail(), false, aniso)
  const barkP = paintBark()

  /** 砂岩（切り石の段）。色はタイントで（灰色がかった黄土色・桃色がかった砂岩） */
  const sandstone = std({ map: tex(ashlar.color, true, aniso), normalMap: tex(ashlar.normal as HTMLCanvasElement, false, aniso), normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92 })
  /** 舗装・上の台（大きな平たい石） */
  const paving = pbr(tiles, { color: new THREE.Color(1.18, 1.06, 0.9) })
  const laterite = std({ map: tex(later.color, true, aniso), normalMap: tex(later.normal as HTMLCanvasElement, false, aniso), roughness: 0.95 })
  const reliefStory = std({ map: tex(story.color, true, aniso), normalMap: tex(story.normal as HTMLCanvasElement, false, aniso), normalScale: new THREE.Vector2(1.2, 1.2), roughness: 0.9 })
  reliefStory.map!.wrapS = THREE.ClampToEdgeWrapping
  const reliefBand = std({ map: tex(proc.color, true, aniso), normalMap: tex(proc.normal as HTMLCanvasElement, false, aniso), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.9 })
  const thatch = std({ map: tex(thatchP.color, true, aniso), normalMap: tex(thatchP.normal as HTMLCanvasElement, false, aniso), roughness: 1, side: THREE.DoubleSide })
  const weave = std({ map: tex(weaveP.color, true, aniso), roughness: 0.9, normalMap: noiseN, normalScale: new THREE.Vector2(0.4, 0.4) })
  const wood = pbr(woodP, { color: new THREE.Color(0.95, 0.82, 0.68) })
  const planks = pbr(planksP, { color: new THREE.Color(1.12, 1.02, 0.9) })
  const bark = std({ map: tex(barkP.color, true, aniso), normalMap: barkP.normal ? tex(barkP.normal, false, aniso) : noiseN, roughness: 0.95 })
  const clay = std({ color: '#ffffff', roughness: 0.88, normalMap: noiseN, normalScale: new THREE.Vector2(0.4, 0.4) })
  const fabric = std({ color: '#ffffff', roughness: 0.95, normalMap: noiseN, normalScale: new THREE.Vector2(0.6, 0.6) })
  const plain = std({ color: '#ffffff', roughness: 0.75 })
  const krama = makeCloth(std({ map: tex(kramaP.color, true, aniso), side: THREE.DoubleSide, roughness: 0.95 }))
  const palm = makeFoliage(
    std({ map: tex(palmP.color, true, aniso), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color('#2a4a10'), emissiveIntensity: 0.1 }),
    0.06,
  )
  const leaf = makeFoliage(std({ map: tex(paintLeafCard(256, 21).color, true, aniso), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color('#2a4a10'), emissiveIntensity: 0.1 }), 0.04)
  /** 遠くの森のかたまり（葉のカードは重いので、丸いかたまりにする） */
  const canopy = std({ color: '#ffffff', roughness: 0.95, normalMap: noiseN, normalScale: new THREE.Vector2(1.4, 1.4) })
  const ground = makeGround(groundT, detailT)
  /** 青銅（鏡・金具） */
  const bronze = std({ color: '#ffffff', roughness: 0.32, metalness: 0.85, normalMap: noiseN, normalScale: new THREE.Vector2(0.12, 0.12) })
  /** 金具の光る輪（クローで狙える所の目印） */
  const hookGlow = std({ color: '#ffffff', roughness: 0.4, metalness: 0.6, emissive: new THREE.Color('#ffb040'), emissiveIntensity: 0.55 })
  /** 火・炭・灯り */
  const ember = std({ color: '#ffffff', emissive: new THREE.Color('#ff6a20'), emissiveIntensity: 1.6, roughness: 0.6 })
  const water = createWaterMaterial()
  // 池の水：少し緑がかった、空を映す深い色
  const baseCompile = water.onBeforeCompile
  water.onBeforeCompile = (shader, r) => {
    baseCompile.call(water, shader, r)
    ;(shader.uniforms.uShallow.value as THREE.Color).set('#4a8a68')
    ;(shader.uniforms.uDeep.value as THREE.Color).set('#163a30')
  }
  water.envMapIntensity = 0.55
  water.customProgramCacheKey = () => 'khmer-water'

  const named = {
    sandstone,
    paving,
    laterite,
    reliefStory,
    reliefBand,
    thatch,
    weave,
    wood,
    planks,
    bark,
    clay,
    fabric,
    plain,
    krama,
    palm,
    leaf,
    canopy,
    ground,
    bronze,
    hookGlow,
    ember,
    water,
  }
  for (const [k, m] of Object.entries(named)) (m as THREE.Material).name = `khmer_${k}`
  return named
}

/** 色（砂岩・ラテライト・木・屋根など。タイントに使う） */
export const KC = {
  sand: '#c8b18c',
  sandWarm: '#d2b48e',
  sandPink: '#d6ab94',
  sandGrey: '#a99f8e',
  sandDark: '#8f8270',
  laterite: '#b86a48',
  wood: '#8a6440',
  woodDark: '#5c4128',
  thatch: '#d8b878',
  thatchOld: '#b89a62',
  weave: '#e8d2a2',
  clay: '#b4643c',
  clayDark: '#7a4026',
  basket: '#c9a467',
  palmTrunk: '#8b7b62',
  leaf: '#4f8a3a',
  canopy: '#3f7a34',
  canopyFar: '#54805a',
  lotus: '#f08cb0',
  lotusPad: '#3f8a3e',
  bronze: '#c8964a',
  gold: '#ffcf5a',
  arun: '#5ab8ff',
} as const
