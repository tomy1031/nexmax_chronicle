// 物語 v7（6・9 章）の 2026年 なんばの組み立て。もとの町（../scene.ts と同じ部品）に、v7 で足す物をのせる。
// ・路地は奥へ抜けて、空き地（ほこら・物置・長屋・トンネル路地）へ（backLot.ts）
// ・石標：A（NEXTMAKE の前。立てたばかりの飾り）・B（橋のたもと。時計屋の看板のとなり）・C（路地の西の塀ぎわ）・
//   D（北岸の駅の大時計の前）
// ・ラボ：構想ボードに社長の絵、佐伯さんの端末
// ・演出の部品：かんばんの光のゆがみ（KanbanSurge）・よろいの元（ArmorSources）・江戸の朝の映し出し（MorningProjection）・
//   空のひびと影の出口（SkyCrack・ShadowMouths）・路地の時間（AlleyTime。シェルの空と太陽が要るので attachTime で後から）
// フェーズ 2 の ChronicleNambaStage は load() でこれを呼び、StageWorld に root・colliders・claw・lights を渡す。
import * as THREE from 'three'
import { Batch } from '../../../render/batch'
import { mulberry32 } from '../../../render/noise'
import { loadLetteringFonts } from '../../../render/textures'
import type { QualitySettings } from '../../../render/quality'
import { ColliderList } from '../../../world/colliders'
import type { LightSpot } from '../../../world/edo/kit'
import type { ClawTargetDef } from '../../../player/clawLogic'
import type { MovableInput } from '../../../player/clawSystem'
import { createNambaMaterials, type NambaMaterials } from '../materials'
import { SignAtlas } from '../signs'
import { registerInteriorArt, registerStreetArt } from '../artwork'
import { buildGround, buildRailings, buildBridge, buildNorthSide, buildSouthSide, buildFar } from '../street'
import { buildNextmake, type NextmakeParts } from '../nextmake'
import { buildIdo, type IdoMarker } from '../ido'
import { buildAlley } from '../alley'
import { buildNambaClaw, type NambaClaw } from '../clawTargets'
import { Pedestrians } from '../pedestrians'
import type { NCtx } from '../kit'
import { buildBackLot } from './backLot'
import type { Shrine } from './shrine'
import { buildClockShopSign, buildLabTerminal, buildNewKanbanDressing, buildStation, registerV7Art } from './townProps'
import { KanbanSurge } from './kanbanSurge'
import { ArmorSources } from './armorPlates'
import { MorningProjection } from './morningProjection'
import { SkyCrack, ShadowMouths } from './defenseFx'
import type { AlleyTime } from './alleyTime'
import { ALLEY_V7, ARMOR_SOURCES, KANBAN, LOT, SHRINE, type KanbanId } from './layoutV7'

export type ChronicleNambaScene = {
  root: THREE.Group
  colliders: ColliderList
  lights: LightSpot[]
  claw: { targets: ClawTargetDef[]; movables: MovableInput[] }
  /** もとの町のつかめる物（振り子の吊り輪・バルコニーの金具・木箱・クリスタル） */
  townClaw: NambaClaw
  /** 石標（イドーのかんばん）A・B・C・D */
  idos: Record<KanbanId, IdoMarker>
  nextmake: NextmakeParts
  pedestrians: Pedestrians
  /** 路地のおくの、時の神さまのほこら（300 年） */
  shrine: Shrine
  /** 石標 A の光のゆがみ（6 章の到着・影の獣） */
  surge: KanbanSurge
  /** 石標 A のまわりの工事の物（よろいの元） */
  armorSources: ArmorSources
  /** 9 章：江戸の朝の映し出し（路地のかんばん C から） */
  projection: MorningProjection
  /** 9 章：空のひびと、影の出口 */
  skyCrack: SkyCrack
  mouths: ShadowMouths
  /** 夜ほど明るくする発光のマテリアル（AlleyTime に渡す） */
  glowMats: Array<{ mat: THREE.MeshStandardMaterial; weight: number }>
  materials: NambaMaterials
  /** 江戸の朝の映し出しをつける・消す（映像と光の帯・地面の光、attachTime していれば空気の色も） */
  morningProjection(on: boolean, instant?: boolean): void
  /** 路地の時間（シェルの空・太陽ができてから作って渡す） */
  attachTime(time: AlleyTime | null): void
  readonly time: AlleyTime | null
  /** 歩く人がよける相手（プレイヤー・仲間の位置）。毎フレームの前に入れておく */
  readonly obstacles: THREE.Vector3[]
  update(dt: number, t: number, camera?: THREE.Camera): void
}

async function waitFonts(): Promise<void> {
  const loads: Array<Promise<unknown>> = [loadLetteringFonts()]
  if (document.fonts) {
    loads.push(document.fonts.load('800 48px "M PLUS Rounded 1c"', 'なんば駅お好み焼').catch(() => null))
    loads.push(document.fonts.load('900 48px "Hiragino Sans"', 'NEXTMAKE').catch(() => null))
  }
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 4000))])
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export async function buildChronicleNamba(q: QualitySettings, aniso: number, progress: (p: number, msg: string) => void, yieldFrame: () => Promise<void>): Promise<ChronicleNambaScene> {
  const [m] = await Promise.all([createNambaMaterials(aniso), waitFonts()])
  progress(0.3, '看板を描いています…')
  await yieldFrame()
  const signs = new SignAtlas(2048)
  registerStreetArt(signs)
  const inner = new SignAtlas(2048)
  registerInteriorArt(inner)
  registerV7Art(signs, inner)
  const signTex = signs.texture(aniso)
  const innerTex = inner.texture(aniso)
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.55, metalness: 0.05, name: 'namba_signs' })
  const signGlow = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.85, roughness: 0.4, name: 'namba_signs_glow' })
  const innerMat = new THREE.MeshStandardMaterial({ map: innerTex, roughness: 0.6, name: 'namba_inner' })
  const innerGlow = new THREE.MeshStandardMaterial({ map: innerTex, emissiveMap: innerTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, roughness: 0.3, name: 'namba_inner_glow' })
  const root = new THREE.Group()
  root.name = 'namba2026_v7'
  const c: NCtx = { b: new Batch(), bf: new Batch(), m, col: new ColliderList(), lights: [], root, updaters: [], rng: mulberry32(2026), q, signs, signMat, signGlow, inner, innerMat, innerGlow }
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
  buildLabTerminal(c)
  const idos: Record<KanbanId, IdoMarker> = {
    a: buildIdo(c, KANBAN.a.pos, KANBAN.a.yaw),
    b: buildIdo(c, KANBAN.b.pos, KANBAN.b.yaw),
    c: buildIdo(c, KANBAN.c.pos, KANBAN.c.yaw),
    d: buildIdo(c, KANBAN.d.pos, KANBAN.d.yaw),
  }
  // C は横向き（東向き）なので、石の幅にあわせて当たり判定を足す
  c.col.box(KANBAN.c.pos.x, 0.65, KANBAN.c.pos.z, 0.8, 1.3, 1.12)
  buildNewKanbanDressing(c)
  buildClockShopSign(c)
  buildStation(c)
  progress(0.55, '路地のおくを組み立て中…')
  await yieldFrame()
  buildAlley(c, { open: true, z1: ALLEY_V7.z1 })
  const lot = buildBackLot(c)
  const townClaw = buildNambaClaw(c)
  progress(0.6, '遠くの町並みを組み立て中…')
  await yieldFrame()
  buildFar(c)
  root.add(c.b.build('namba_v7_static'))
  const far = c.bf.build('namba_v7_far')
  far.traverse((o) => (o.castShadow = false))
  root.add(far)
  const pedestrians = new Pedestrians([
    { x0: -21.5, x1: 9.5, z: 8.6, n: 3 },
    { x0: 18.6, x1: 23, z: 7.2, n: 1 },
    { x0: -23, x1: 23, z: -7.3, n: 4 },
    { x0: -23, x1: -2.6, z: -10.0, n: 1 },
    { x0: 2.8, x1: 23, z: -10.0, n: 1 },
  ])
  root.add(pedestrians.group)

  // ---- 演出の部品
  const surge = new KanbanSurge(idos.a)
  root.add(surge.group)
  const armorSources = new ArmorSources(ARMOR_SOURCES)
  root.add(armorSources.group)
  // 江戸の朝の映し出し：路地の両側・空き地の三方の壁の前に映像。かんばん C から光の帯
  const A = ALLEY_V7
  const projection = new MorningProjection({
    plate: idos.c.plate,
    front: idos.c.front,
    panels: [
      // 路地（西の塀・東の塀）
      { a: v(A.x0 + 0.16, 0, A.z0 + 1.0), b: v(A.x0 + 0.16, 0, A.z1), h: 3.4 },
      { a: v(A.x1 - 0.16, 0, A.z1), b: v(A.x1 - 0.16, 0, A.z0 + 1.0), h: 3.4 },
      // 空き地：西（ほこらの後ろ）・南（長屋）・東（物置）・北（店の裏）
      { a: v(LOT.x0 + 0.08, 0, LOT.z1), b: v(LOT.x0 + 0.08, 0, LOT.z0 + 0.1), h: 5.2 },
      { a: v(LOT.x1 - 0.1, 0, LOT.nagaya.shedZ0 - 0.15), b: v(LOT.x0 + 0.1, 0, LOT.nagaya.shedZ0 - 0.15), h: 5.4 },
      { a: v(LOT.kura.x0 - 0.1, 0, LOT.kura.z0), b: v(LOT.kura.x0 - 0.1, 0, LOT.kura.z1), h: 4.2 },
      { a: v(LOT.x0 + 0.1, 0, LOT.z0 + 0.12), b: v(A.x0 - 0.05, 0, LOT.z0 + 0.12), h: 5.0 },
      { a: v(A.x1 + 0.05, 0, LOT.z0 + 0.12), b: v(LOT.kura.x0, 0, LOT.z0 + 0.12), h: 5.0 },
    ],
    targets: [v(16.4, 1.2, 12.4), v(15.8, 2.6, 21.5), SHRINE.front.clone().setY(1.6), v(19.5, 1.4, 26.2), v(13.0, 3.6, 26.8), v(20.6, 2.8, 22.2)],
    pool: { center: v((LOT.x0 + LOT.x1) / 2, 0, (LOT.z0 + LOT.z1) / 2), w: LOT.x1 - LOT.x0, d: LOT.z1 - LOT.z0 },
    litBoxes: [
      { x0: A.x0, x1: A.x1, z0: A.z0, z1: A.z1 },
      { x0: LOT.x0, x1: LOT.x1, z0: LOT.z0, z1: LOT.z1 },
    ],
  })
  root.add(projection.group)
  const skyCrack = new SkyCrack(v(16.6, 13.5, 32.5), v(16.6, 1.5, 21.0))
  root.add(skyCrack.mesh)
  const mouths = new ShadowMouths()
  root.add(mouths.mesh)
  // 映し出しの光（点光源の候補。消えているときは 0）
  const projLight: LightSpot = { pos: v(16.4, 2.6, 21.8), color: '#ffd8a0', intensity: 0, dist: 12 }
  c.lights.push(projLight)

  const glowMats = [
    { mat: signGlow, weight: 1 },
    { mat: m.windows, weight: 0.8 },
    { mat: m.lampGlow, weight: 0.7 },
    { mat: m.lightWarm, weight: 0.25 },
    { mat: lot.nightGlow, weight: 1 },
  ]
  const obstacles: THREE.Vector3[] = []
  let time: AlleyTime | null = null
  const updaters = c.updaters
  return {
    root,
    colliders: c.col,
    lights: c.lights,
    claw: { targets: [...townClaw.targets, ...lot.targets], movables: townClaw.movables },
    townClaw,
    idos,
    nextmake,
    pedestrians,
    shrine: lot.shrine,
    surge,
    armorSources,
    projection,
    skyCrack,
    mouths,
    glowMats,
    materials: m,
    obstacles,
    get time() {
      return time
    },
    attachTime(t: AlleyTime | null) {
      time = t
    },
    morningProjection(on: boolean, instant = false) {
      projection.set(on, instant)
      time?.setProjection(on ? 1 : 0, instant)
    },
    update(dt: number, t: number, camera?: THREE.Camera) {
      for (const u of updaters) u(dt, t)
      pedestrians.update(dt, obstacles)
      nextmake.update(dt, t)
      idos.a.update(dt, t)
      idos.b.update(dt, t)
      idos.c.update(dt, t)
      idos.d.update(dt, t)
      lot.shrine.update(dt, t)
      surge.update(dt, t, camera)
      projection.update(dt, t)
      projLight.intensity = projection.level * 3.2
      skyCrack.update(dt, t)
      mouths.update(dt, t)
      time?.update(dt)
    },
  }
}
