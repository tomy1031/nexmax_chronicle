// 写真のテクスチャ（Poly Haven CC0。public/textures/<名前>/）の読みこみ。KTX2（GPU のまま縮んだ形式）を先に、だめなら JPG。
// ・diff（色）・arm（AO・粗さ・金属）：ETC1S（1 画素 0.5〜1 バイト。RGBA の JPG を広げると 4 バイト）
// ・nor（法線）：UASTC。高画質は 1024（nor_1k.ktx2）、標準・省電力は 512（nor_512.ktx2）
// どちらもミップマップ入りなので、読みこみの時に JPG をほどいてミップマップを作る手間もない。
// 作り方：scratchpad の encode.mjs（ktx2-encoder）。KTX2 を読めないブラウザ・?tex=jpg のときは、今までどおり *_1k.jpg
import * as THREE from 'three'
import type { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import type { QualityLevel } from './quality'

export type PBRTextures = { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }

const jpg = new THREE.TextureLoader()
let ktx2: Promise<KTX2Loader | null> | null = null
let normal: '1k' | '512' = '1k'

function wantsJpg(): boolean {
  try {
    return typeof location !== 'undefined' && new URLSearchParams(location.search).get('tex') === 'jpg'
  } catch {
    return false
  }
}

/** シェルが起動したときと画質を変えたときに 1 回（KTX2 の読み手は、この GPU で使える形式を調べて作る） */
export function configurePbrTextures(renderer: THREE.WebGLRenderer | null, level: QualityLevel): void {
  normal = level === 'high' ? '1k' : '512'
  if (ktx2 || !renderer || wantsJpg()) return
  ktx2 = import('three/examples/jsm/loaders/KTX2Loader.js')
    .then(({ KTX2Loader }) => new KTX2Loader().setTranscoderPath('./basis/').detectSupport(renderer))
    .catch((e) => {
      console.warn('[pbr] KTX2 を使えないので JPG を読みます', e)
      return null
    })
}

async function one(base: string, file: string, fallback: string): Promise<THREE.Texture> {
  const loader = ktx2 ? await ktx2 : null
  if (loader) {
    try {
      return await loader.loadAsync(base + file)
    } catch (e) {
      console.warn(`[pbr] ${base}${file} を読めないので JPG を読みます`, e)
    }
  }
  return jpg.loadAsync(base + fallback)
}

/** 3 枚を読む（くり返し・異方性フィルタもここで）。1 枚でも読めなければ失敗（呼ぶ側が単色などで代わりにする） */
export async function loadPbrTextures(name: string, aniso: number): Promise<PBRTextures> {
  const base = `./textures/${name}/`
  const [map, normalMap, arm] = await Promise.all([
    one(base, 'diff_1k.ktx2', 'diff_1k.jpg'),
    one(base, normal === '1k' ? 'nor_1k.ktx2' : 'nor_512.ktx2', 'nor_1k.jpg'),
    one(base, 'arm_1k.ktx2', 'arm_1k.jpg'),
  ])
  for (const t of [map, normalMap, arm]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = aniso
  }
  map.colorSpace = THREE.SRGBColorSpace
  normalMap.colorSpace = THREE.NoColorSpace
  arm.colorSpace = THREE.NoColorSpace
  return { map, normalMap, arm }
}
