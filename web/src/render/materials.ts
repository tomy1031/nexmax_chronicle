// 手続き的マテリアルライブラリ。起動時にキャンバスでテクスチャを作り、使い回す。
// 静的ジオメトリは Batch で頂点カラー（色むら）付きに結合するため、多くは vertexColors=true。
import * as THREE from 'three'
import {
  paintPlanks,
  paintWoodGrain,
  paintPlaster,
  paintRoofTiles,
  paintPaving,
  paintStoneWall,
  paintRope,
  paintBark,
  paintLantern,
  paintShoji,
  paintFabric,
  paintSign,
  paintBlossomCard,
  paintLeafCard,
  paintNoiseNormal,
  loadLetteringFonts,
  tex,
  type FabricDesign,
  type SignSpec,
  type Painted,
} from './textures'

/** 全シェーダ共通の時間（風・水・粒子） */
export const uTime = { value: 0 }

/** テクスチャ 1 枚が覆う実寸（m）。Batch の UV 投影に使う。 */
export const TEX_METERS = {
  planks: 2.0,
  wood: 1.6,
  plaster: 2.5,
  roof: 2.0,
  paving: 2.6,
  stoneWall: 3.0,
  rope: 0.3,
  bark: 1.2,
} as const

export type MaterialLibrary = Awaited<ReturnType<typeof createMaterialLibrary>>

/** Poly Haven CC0（public/textures/<name>/diff_1k.jpg, nor_1k.jpg, arm_1k.jpg） */
type PBRSet = { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }
const texLoader = new THREE.TextureLoader()

async function loadPBR(name: string, aniso: number): Promise<PBRSet | null> {
  const base = `./textures/${name}/`
  try {
    const [map, normalMap, arm] = await Promise.all([
      texLoader.loadAsync(base + 'diff_1k.jpg'),
      texLoader.loadAsync(base + 'nor_1k.jpg'),
      texLoader.loadAsync(base + 'arm_1k.jpg'),
    ])
    for (const t of [map, normalMap, arm]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.anisotropy = aniso
    }
    map.colorSpace = THREE.SRGBColorSpace
    return { map, normalMap, arm }
  } catch (e) {
    console.warn(`[materials] ${name} を読めないので手続きテクスチャを使います`, e)
    return null
  }
}

function pbrParams(p: PBRSet): THREE.MeshStandardMaterialParameters {
  return { map: p.map, normalMap: p.normalMap, roughnessMap: p.arm, aoMap: p.arm, metalnessMap: p.arm, roughness: 1, metalness: 1 }
}

function std(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, ...params })
}

function texSet(p: Painted, aniso: number): { map: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture; emissiveMap?: THREE.Texture } {
  const out: { map: THREE.Texture; normalMap?: THREE.Texture; roughnessMap?: THREE.Texture; emissiveMap?: THREE.Texture } = { map: tex(p.color, true, aniso) }
  if (p.normal) out.normalMap = tex(p.normal, false, aniso)
  if (p.rough) out.roughnessMap = tex(p.rough, false, aniso)
  if (p.emissive) out.emissiveMap = tex(p.emissive, true, aniso)
  return out
}

/** 両面カードの法線を裏返さない（葉・花びらの球状法線用）＋風の揺れ */
export function makeFoliage(mat: THREE.MeshStandardMaterial, sway: number): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          float ph = wp.x * 0.35 + wp.z * 0.27;
          transformed.x += sin(uTime * 1.3 + ph) * ${sway.toFixed(3)};
          transformed.z += cos(uTime * 1.1 + ph * 1.3) * ${(sway * 0.7).toFixed(3)};
          transformed.y += sin(uTime * 1.7 + ph * 2.0) * ${(sway * 0.4).toFixed(3)};
        }`,
      )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'),
    )
  }
  mat.customProgramCacheKey = () => `foliage-${sway}`
  return mat
}

export async function createMaterialLibrary(aniso: number) {
  // 看板・幟・提灯の文字は筆文字フォントで描くので、テクスチャを描く前に読み込みを待つ
  const [deckPBR, stonePBR, cobblePBR, plasterPBR] = await Promise.all([
    loadPBR('wood_floor_deck', aniso),
    loadPBR('japanese_stone_wall', aniso),
    loadPBR('cobblestone_floor_04', aniso),
    loadPBR('white_plaster_02', aniso),
    loadLetteringFonts(),
  ])
  const woodP = paintWoodGrain()
  const plasterP = paintPlaster()
  const roofP = paintRoofTiles()
  const wallP = paintStoneWall()
  const ropeP = paintRope()
  const barkP = paintBark()
  const creamP = paintLantern('cream')
  const redLP = paintLantern('red')
  const shojiP = paintShoji()
  const blossomP = paintBlossomCard()
  const leafP = paintLeafCard()
  const ironN = tex(paintNoiseNormal(256, 12, 2.5), false, aniso)

  const woodT = texSet(woodP, aniso)
  const roofT = texSet(roofP, aniso)
  const wallT = texSet(wallP, aniso)
  const plasterT = texSet(plasterP, aniso)

  // CC0 テクスチャが無い場合だけ手続きテクスチャを描く
  const planks = deckPBR ? std({ ...pbrParams(deckPBR), color: '#ffffff' }) : std({ ...texSet(paintPlanks(), aniso), roughness: 1, metalness: 0 })
  const wood = std({ ...woodT, roughness: 0.78, metalness: 0 })
  const lacquerRed = std({
    color: '#d0402c',
    roughness: 0.42,
    metalness: 0,
    normalMap: woodT.normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
  })
  const plaster = plasterPBR
    ? std({ ...pbrParams(plasterPBR), color: new THREE.Color(1.85, 1.8, 1.68), normalScale: new THREE.Vector2(0.6, 0.6) })
    : std({ ...plasterT, roughness: 0.92 })
  const roof = std({ ...roofT, roughness: 1, metalness: 0.15, envMapIntensity: 1.2 })
  const paving = cobblePBR ? std({ ...pbrParams(cobblePBR), color: new THREE.Color(1.12, 1.04, 0.95) }) : std({ ...texSet(paintPaving(), aniso), roughness: 1 })
  const stoneWall = stonePBR ? std({ ...pbrParams(stonePBR), color: new THREE.Color(1.15, 1.08, 0.98) }) : std({ ...wallT, roughness: 1 })
  const rope = std({ ...texSet(ropeP, aniso), roughness: 0.95 })
  const bark = std({ ...texSet(barkP, aniso), roughness: 0.95 })
  const iron = std({ color: '#3b3f46', roughness: 0.48, metalness: 0.75, normalMap: ironN, normalScale: new THREE.Vector2(0.5, 0.5) })
  const brass = std({ color: '#c28f42', roughness: 0.32, metalness: 0.9, normalMap: ironN, normalScale: new THREE.Vector2(0.2, 0.2) })
  const darkLacquer = std({ color: '#231c17', roughness: 0.45, metalness: 0.1 })
  const gold = std({ color: '#e0b04a', roughness: 0.28, metalness: 1 })
  const creamT = texSet(creamP, aniso)
  const redT = texSet(redLP, aniso)
  const paperCream = std({
    map: creamT.map,
    emissiveMap: creamT.emissiveMap,
    emissive: new THREE.Color('#ffb46a'),
    emissiveIntensity: 3.4,
    roughness: 0.85,
    side: THREE.DoubleSide,
  })
  const paperRed = std({
    map: redT.map,
    emissiveMap: redT.emissiveMap,
    emissive: new THREE.Color('#ff7a48'),
    emissiveIntensity: 2.6,
    roughness: 0.85,
  })
  const shojiT = texSet(shojiP, aniso)
  const shoji = std({ map: shojiT.map, emissiveMap: shojiT.emissiveMap, emissive: new THREE.Color('#ffb060'), emissiveIntensity: 1.1, roughness: 0.9 })
  const interior = std({ color: '#3a2416', roughness: 0.9, emissive: new THREE.Color('#8a4a18'), emissiveIntensity: 0.8 })
  const castleWhite = std({ ...plasterT, color: '#ffffff', roughness: 0.85 })
  // 銅板葺きの緑青（大坂城のような青緑）
  const castleRoof = std({ map: roofT.map, normalMap: roofT.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), color: '#86c7b9', roughness: 0.82, metalness: 0.05, envMapIntensity: 0.45, side: THREE.DoubleSide })
  const grass = std({ color: '#7fa24a', roughness: 0.95, normalMap: ironN, normalScale: new THREE.Vector2(1.2, 1.2) })
  const rock = std({ ...wallT, color: '#c9b9a2', roughness: 1 })
  const plain = std({ color: '#ffffff', roughness: 0.8 })

  const blossom = makeFoliage(
    std({
      map: tex(blossomP.color, true, aniso),
      alphaTest: 0.42,
      side: THREE.DoubleSide,
      roughness: 0.75,
      emissive: new THREE.Color('#ff8fb4'),
      emissiveIntensity: 0.16,
    }),
    0.05,
  )
  const leaf = makeFoliage(
    std({ map: tex(leafP.color, true, aniso), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color('#3a5a10'), emissiveIntensity: 0.08 }),
    0.04,
  )
  const puffGreen = std({ color: '#6f9a3c', roughness: 0.9 })

  const fabricCache = new Map<FabricDesign, THREE.MeshStandardMaterial>()
  const fabric = (d: FabricDesign) => {
    let m = fabricCache.get(d)
    if (!m) {
      const p = paintFabric(d)
      m = std({ map: tex(p.color, true, aniso), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.95 })
      makeCloth(m)
      fabricCache.set(d, m)
    }
    return m
  }
  const signCache = new Map<string, THREE.MeshStandardMaterial>()
  const sign = (spec: SignSpec) => {
    const key = JSON.stringify(spec)
    let m = signCache.get(key)
    if (!m) {
      const p = paintSign(spec, woodP.color)
      const t = tex(p.color, true, aniso)
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      m = std({ map: t, roughness: 0.75, normalMap: woodT.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) })
      signCache.set(key, m)
    }
    return m
  }

  const named = {
    planks,
    wood,
    lacquerRed,
    plaster,
    roof,
    paving,
    stoneWall,
    rope,
    bark,
    iron,
    brass,
    darkLacquer,
    gold,
    paperCream,
    paperRed,
    shoji,
    interior,
    castleWhite,
    castleRoof,
    grass,
    rock,
    plain,
    blossom,
    leaf,
    puffGreen,
  }
  for (const [k, v] of Object.entries(named)) (v as THREE.Material).name = k
  return {
    ...named,
    fabric,
    sign,
    canvases: { wood: woodP.color },
  }
}

/** 布のはためき（上端は固定、下ほど揺れる。UV の v=1 が上端の前提） */
function makeCloth(mat: THREE.MeshStandardMaterial): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float hang = 1.0 - uv.y;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          float ph = wp.x * 0.7 + wp.z * 0.5;
          transformed += objectNormal * sin(uTime * 2.1 + ph + uv.y * 3.0) * 0.06 * hang;
        }`,
      )
  }
  mat.customProgramCacheKey = () => 'cloth'
}
