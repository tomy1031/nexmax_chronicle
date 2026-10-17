// 2026年 大阪・なんばの組み立て（通り・NEXTMAKE・IDO・つかめる対象・歩く人）。
import * as THREE from 'three'
import { Batch } from '../../render/batch'
import { mulberry32 } from '../../render/noise'
import { loadLetteringFonts } from '../../render/textures'
import type { QualitySettings } from '../../render/quality'
import { ColliderList } from '../../world/colliders'
import type { LightSpot } from '../../world/edo/kit'
import { createNambaMaterials } from './materials'
import { SignAtlas } from './signs'
import { registerInteriorArt, registerStreetArt } from './artwork'
import { buildGround, buildRailings, buildBridge, buildNorthSide, buildSouthSide, buildFar } from './street'
import { buildNextmake, type NextmakeParts } from './nextmake'
import { buildIdo, type IdoMarker } from './ido'
import { buildNambaClaw, type NambaClaw } from './clawTargets'
import { Pedestrians } from './pedestrians'
import type { NCtx } from './kit'
import { N } from './layout'

export type NambaScene = {
  root: THREE.Group
  colliders: ColliderList
  lights: LightSpot[]
  claw: NambaClaw
  ido: IdoMarker
  nextmake: NextmakeParts
  pedestrians: Pedestrians
  update(dt: number, t: number): void
  /** 歩く人がよける相手（プレイヤー・仲間の位置）。毎フレームの前に入れておく */
  readonly obstacles: THREE.Vector3[]
}

/** 看板の文字に使うフォント（筆文字は public/fonts、丸ゴシックは index.html の Google Fonts）を待つ */
async function waitFonts(): Promise<void> {
  const loads: Array<Promise<unknown>> = [loadLetteringFonts()]
  if (document.fonts) {
    loads.push(document.fonts.load('800 48px "M PLUS Rounded 1c"', 'なんばお好み焼').catch(() => null))
    loads.push(document.fonts.load('900 48px "Hiragino Sans"', 'NEXTMAKE').catch(() => null))
  }
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))])
}

export async function buildNambaScene(q: QualitySettings, aniso: number, progress: (p: number, msg: string) => void, yieldFrame: () => Promise<void>): Promise<NambaScene> {
  const [m] = await Promise.all([createNambaMaterials(aniso), waitFonts()])
  progress(0.3, '看板を描いています…')
  await yieldFrame()
  const signs = new SignAtlas(2048)
  registerStreetArt(signs)
  const inner = new SignAtlas(2048)
  registerInteriorArt(inner)
  const signTex = signs.texture(aniso)
  const innerTex = inner.texture(aniso)
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55, metalness: 0.05, name: 'namba_signs' })
  const signGlow = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.85, roughness: 0.4, name: 'namba_signs_glow' })
  const innerMat = new THREE.MeshStandardMaterial({ map: innerTex, roughness: 0.6, name: 'namba_inner' })
  const innerGlow = new THREE.MeshStandardMaterial({ map: innerTex, emissiveMap: innerTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, roughness: 0.3, name: 'namba_inner_glow' })
  const root = new THREE.Group()
  root.name = 'namba2026'
  const c: NCtx = {
    b: new Batch(),
    bf: new Batch(),
    m,
    col: new ColliderList(),
    lights: [],
    root,
    updaters: [],
    rng: mulberry32(2026),
    q,
    signs,
    signMat,
    signGlow,
    inner,
    innerMat,
    innerGlow,
  }
  progress(0.4, 'なんばの通りを組み立て中…')
  await yieldFrame()
  buildGround(c)
  buildRailings(c)
  buildBridge(c)
  buildSouthSide(c)
  buildNorthSide(c)
  progress(0.5, 'NEXTMAKE を組み立て中…')
  await yieldFrame()
  const nextmake = buildNextmake(c)
  const ido = buildIdo(c)
  const claw = buildNambaClaw(c)
  progress(0.58, '遠くの町並みを組み立て中…')
  await yieldFrame()
  buildFar(c)
  root.add(c.b.build('namba_static'))
  const far = c.bf.build('namba_far')
  far.traverse((o) => (o.castShadow = false))
  root.add(far)
  const pedestrians = new Pedestrians([
    { x0: -21.5, x1: 9.5, z: 8.6, n: 3 },
    { x0: 16.5, x1: 23, z: 7.2, n: 1 },
    { x0: -23, x1: 23, z: -6.8, n: 4 },
    { x0: -23, x1: 23, z: -10.0, n: 2 },
  ])
  root.add(pedestrians.group)
  void N
  const obstacles: THREE.Vector3[] = []
  return {
    obstacles,
    root,
    colliders: c.col,
    lights: c.lights,
    claw,
    ido,
    nextmake,
    pedestrians,
    update(dt: number, t: number) {
      for (const u of c.updaters) u(dt, t)
      pedestrians.update(dt, obstacles)
      nextmake.update(dt, t)
      ido.update(dt, t)
    },
  }
}
