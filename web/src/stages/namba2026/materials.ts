// 2026年 なんばのマテリアル。Poly Haven CC0（public/textures）を 4 組（12 枚）だけ読み、あとはキャンバスで描く。
// 静的な物は Batch で頂点カラー（色の違い）付きに結合するので、多くは vertexColors=true（色はタイントで付ける）。
import * as THREE from 'three'
import { makeCanvas, paintLeafCard, paintNoiseNormal, tex } from '../../render/textures'
import { mulberry32, range } from '../../render/noise'
import { createWaterMaterial } from '../../world/edo/water'

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
    console.warn(`[namba] ${name} を読めないので単色で代用します`, e)
    return null
  }
}

function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, ...p })
}

function pbr(p: PBRSet | null, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  if (!p) return std({ roughness: 0.85, ...extra })
  return std({ map: p.map, normalMap: p.normalMap, roughnessMap: p.arm, aoMap: p.arm, metalnessMap: p.arm, roughness: 1, metalness: 1, ...extra })
}

/** ビルの窓（1 枚 = 4 列 × 1 階）。明かりのついた窓は emissive に描く */
function paintWindows(S = 512): { color: HTMLCanvasElement; emissive: HTMLCanvasElement } {
  const rng = mulberry32(2026)
  const [c, g] = makeCanvas(S, S)
  const [e, ge] = makeCanvas(S, S)
  ge.fillStyle = '#000'
  ge.fillRect(0, 0, S, S)
  // 4 階 × 4 列（UV で繰り返すとき 1 枚 = 4 列 × 4 階）
  const rows = 4
  const cols = 4
  const cw = S / cols
  const ch = S / rows
  g.fillStyle = '#c9c2b8'
  g.fillRect(0, 0, S, S)
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x = k * cw
      const y = r * ch
      // 窓の外枠（明るい壁の中のガラス）
      const px = cw * 0.12
      const py = ch * 0.18
      const wx = x + px
      const wy = y + py
      const ww = cw - px * 2
      const wh = ch - py * 1.6
      const lit = rng() < 0.28
      const blind = rng() < 0.35
      const sky = g.createLinearGradient(0, wy, 0, wy + wh)
      if (lit) {
        sky.addColorStop(0, '#ffe7b0')
        sky.addColorStop(1, '#f2b46a')
      } else {
        sky.addColorStop(0, '#9fc3dc')
        sky.addColorStop(0.5, '#4f7593')
        sky.addColorStop(1, '#2c4255')
      }
      g.fillStyle = sky
      g.fillRect(wx, wy, ww, wh)
      if (blind) {
        g.fillStyle = lit ? 'rgba(255,240,210,0.8)' : 'rgba(220,226,230,0.85)'
        g.fillRect(wx, wy, ww, wh * range(rng, 0.25, 0.7))
        g.fillStyle = 'rgba(0,0,0,0.12)'
        for (let s = wy; s < wy + wh * 0.6; s += 5) g.fillRect(wx, s, ww, 1)
      }
      // 反射のハイライト
      g.fillStyle = 'rgba(255,255,255,0.18)'
      g.beginPath()
      g.moveTo(wx + ww * 0.15, wy)
      g.lineTo(wx + ww * 0.45, wy)
      g.lineTo(wx + ww * 0.1, wy + wh)
      g.lineTo(wx - ww * 0.2 + ww * 0.2, wy + wh)
      g.fill()
      // 窓枠
      g.strokeStyle = '#3a3f46'
      g.lineWidth = 4
      g.strokeRect(wx, wy, ww, wh)
      g.beginPath()
      g.moveTo(wx + ww / 2, wy)
      g.lineTo(wx + ww / 2, wy + wh)
      g.stroke()
      // 窓台
      g.fillStyle = '#e8e2d8'
      g.fillRect(wx - 3, wy + wh, ww + 6, 5)
      if (lit) {
        ge.fillStyle = '#ffd38a'
        ge.fillRect(wx, wy, ww, wh)
      }
    }
    // 階の境目の帯
    g.fillStyle = 'rgba(0,0,0,0.08)'
    g.fillRect(0, y0(r, ch), S, 4)
  }
  return { color: c, emissive: e }
}
const y0 = (r: number, ch: number) => r * ch

/** ラボの床（塗装したコンクリート） */
function paintEpoxy(S = 512): HTMLCanvasElement {
  const rng = mulberry32(77)
  const [c, g] = makeCanvas(S, S)
  g.fillStyle = '#8d949a'
  g.fillRect(0, 0, S, S)
  for (let i = 0; i < 2200; i++) {
    const x = rng() * S
    const y = rng() * S
    const r = range(rng, 0.5, 2.2)
    g.fillStyle = `rgba(${rng() < 0.5 ? '255,255,255' : '0,0,0'},${range(rng, 0.03, 0.09)})`
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fill()
  }
  // 目地
  g.strokeStyle = 'rgba(40,44,48,0.35)'
  g.lineWidth = 2
  g.strokeRect(1, 1, S - 2, S - 2)
  return c
}

export type NambaMaterials = Awaited<ReturnType<typeof createNambaMaterials>>

export async function createNambaMaterials(aniso: number) {
  const [tiles, laminate, stoneP, plasterP] = await Promise.all([
    loadPBR('large_grey_tiles', aniso),
    loadPBR('laminate_floor_02', aniso),
    loadPBR('japanese_stone_wall', aniso),
    loadPBR('white_plaster_02', aniso),
  ])
  const noiseN = tex(paintNoiseNormal(256, 10, 2.2), false, aniso)
  const win = paintWindows()
  const winMap = tex(win.color, true, aniso)
  const winEm = tex(win.emissive, true, aniso)
  const leafT = tex(paintLeafCard(256, 11).color, true, aniso)
  const epoxyT = tex(paintEpoxy(), true, aniso)

  const paving = pbr(tiles, { color: new THREE.Color(1.12, 1.07, 1.0) })
  const floorWood = pbr(laminate, { color: new THREE.Color(1.05, 1.0, 0.96), envMapIntensity: 0.8 })
  const stone = pbr(stoneP, { color: new THREE.Color(1.1, 1.08, 1.04) })
  const plaster = pbr(plasterP, { color: new THREE.Color(1.6, 1.58, 1.52), normalScale: new THREE.Vector2(0.5, 0.5) })
  const concrete = std({ color: '#ffffff', roughness: 0.9, normalMap: noiseN, normalScale: new THREE.Vector2(0.35, 0.35) })
  const epoxy = std({ map: epoxyT, roughness: 0.45, metalness: 0.05 })
  const metal = std({ color: '#ffffff', roughness: 0.42, metalness: 0.75, normalMap: noiseN, normalScale: new THREE.Vector2(0.15, 0.15) })
  const paint = std({ color: '#ffffff', roughness: 0.55, metalness: 0.05 })
  const plastic = std({ color: '#ffffff', roughness: 0.32, metalness: 0 })
  const rubber = std({ color: '#ffffff', roughness: 0.9, metalness: 0 })
  const fabric = std({ color: '#ffffff', roughness: 0.95, normalMap: noiseN, normalScale: new THREE.Vector2(0.6, 0.6) })
  const woodPlain = std({ color: '#ffffff', roughness: 0.6, metalness: 0 })
  /** 室内の壁（きれいな塗装）と天井（少しだけ自分で明るい：下からの照り返しの代わり） */
  const wall = std({ color: '#ffffff', roughness: 0.88, normalMap: noiseN, normalScale: new THREE.Vector2(0.12, 0.12) })
  const ceiling = std({ color: '#ffffff', roughness: 0.9, emissive: new THREE.Color('#fff8f0'), emissiveIntensity: 0.22 })
  /** 街灯の丸い灯り（まぶしすぎない） */
  const lampGlow = std({ color: '#ffffff', emissive: new THREE.Color('#ffd8a0'), emissiveIntensity: 1.5, roughness: 0.4 })
  const bark = std({ color: '#ffffff', roughness: 0.95, normalMap: noiseN, normalScale: new THREE.Vector2(1.2, 1.2) })
  const leaf = std({ map: leafT, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8, emissive: new THREE.Color('#2a4a10'), emissiveIntensity: 0.12 })
  const glass = new THREE.MeshStandardMaterial({ color: '#b9d6e6', roughness: 0.04, metalness: 0.2, transparent: true, opacity: 0.22, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide })
  const glassFrost = new THREE.MeshStandardMaterial({ color: '#eaf3f8', roughness: 0.3, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide })
  const windows = new THREE.MeshStandardMaterial({ map: winMap, emissiveMap: winEm, emissive: new THREE.Color('#ffc070'), emissiveIntensity: 1.1, roughness: 0.25, metalness: 0.3, envMapIntensity: 1.2 })
  /** 発光（白い天井照明・電球） */
  const lightCool = std({ color: '#ffffff', emissive: new THREE.Color('#e9f2ff'), emissiveIntensity: 2.6, roughness: 0.5 })
  const lightWarm = std({ color: '#ffffff', emissive: new THREE.Color('#ffc277'), emissiveIntensity: 3.0, roughness: 0.5 })
  /** ネオン管の色（頂点カラーで色を付けて光らせる） */
  const neon = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
  const water = createWaterMaterial()
  // 道頓堀のような少し緑がかった深い水色
  const baseCompile = water.onBeforeCompile
  water.onBeforeCompile = (shader, r) => {
    baseCompile.call(water, shader, r)
    ;(shader.uniforms.uShallow.value as THREE.Color).set('#2c6c60')
    ;(shader.uniforms.uDeep.value as THREE.Color).set('#0a2c32')
  }
  // 両岸のビルが映る深い水路：空の映り込みを弱めにする
  water.envMapIntensity = 0.26
  water.customProgramCacheKey = () => 'edo-water'

  const named = {
    paving,
    floorWood,
    stone,
    plaster,
    concrete,
    epoxy,
    metal,
    paint,
    plastic,
    rubber,
    fabric,
    woodPlain,
    wall,
    ceiling,
    lampGlow,
    bark,
    leaf,
    glass,
    glassFrost,
    windows,
    lightCool,
    lightWarm,
    neon,
    water,
  }
  for (const [k, m] of Object.entries(named)) (m as THREE.Material).name = `namba_${k}`
  return named
}
