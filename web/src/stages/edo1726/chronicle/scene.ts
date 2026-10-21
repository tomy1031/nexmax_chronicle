// 7 章の 1726年 仕掛け横丁を組み立てる。導入編の町（world/edo/scene.ts）に、v7 で要る物を足す：
//   源兵衛の工房（中に入れる）・路地と路地のおく（時の神さまのほこら）・広場（時の鐘人形とかがり火）・月と星と夜明けの空。
// 静的な物は町と同じバッチに積む（buildEdoScene の extend）。動く物は root の下に入れる（解放はシェル）。
// 空の切りかえ（EdoSkyCycle）はシェルの空・太陽・後処理が要るので、ステージの begin で createSky(rt 相当) を呼んで作る。
import * as THREE from 'three'
import type { MaterialLibrary } from '../../../render/materials'
import type { QualitySettings } from '../../../render/quality'
import type { ClawTargetDef } from '../../../player/clawLogic'
import type { MovableInput } from '../../../player/clawSystem'
import { buildEdoScene, type EdoScene } from '../../../world/edo/scene'
import type { ColliderList } from '../../../world/colliders'
import type { LightSpot } from '../../../world/edo/kit'
import { C, CHRONICLE_SPAWNS, KEEP_OUT, ARRIVE_RING, RETURN_RING, WORKSHOP_SPOTS } from './layout'
import { loadEdo7Fonts } from './fonts'
import { buildWorkshop, type WorkshopParts } from './workshop'
import { buildAlleyAndCourt, buildPlaza, Kagaribi, KAGARIBI_PLACES } from './plaza'
import { TimeBellDoll } from './bellDoll'
import { TimeShrine, shrineMaterialsFrom } from './shrine'
import { EdoSkyCycle, type SkyTargets } from './skyCycle'

export type ChronicleEdoWorld = {
  /** 導入編の町（水路・水門・舟・クローの対象など） */
  edo: EdoScene
  root: THREE.Group
  colliders: ColliderList
  lights: LightSpot[]
  claw: { targets: ClawTargetDef[]; movables: MovableInput[] }
  workshop: WorkshopParts
  doll: TimeBellDoll
  shrine: TimeShrine
  kagaribi: Kagaribi
  /** 到着・帰還の光の輪の位置 */
  arriveRing: THREE.Vector3
  returnRing: THREE.Vector3
  /** 到着地点（?spawn= / 時空移動の spawn） */
  spawns: typeof CHRONICLE_SPAWNS
  spots: typeof WORKSHOP_SPOTS
  /** 空の切りかえを作る（シェルの空・太陽・後処理を渡す）。かがり火の点光源は時間帯の倍率から外す */
  createSky(t: Omit<SkyTargets, 'lights'>): EdoSkyCycle
  update(dt: number, t: number, camera: THREE.Camera): void
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** もやの粒の数（画質ごと） */
const MIST: Record<QualitySettings['level'], number> = { low: 90, medium: 160, high: 220 }

export async function buildChronicleEdo(mats: MaterialLibrary, quality: QualitySettings): Promise<ChronicleEdoWorld> {
  // 書・文字盤・扁額の字を描く前に、足した字のフォントを読む
  await loadEdo7Fonts()
  let workshop: WorkshopParts | null = null
  let doll: TimeBellDoll | null = null
  let kagaribi: Kagaribi | null = null
  const edo = buildEdoScene(mats, quality, {
    chronicle: true,
    keepOut: KEEP_OUT,
    extend: (c, _cf, f) => {
      workshop = buildWorkshop(c, c.root)
      buildAlleyAndCourt(c, f)
      buildPlaza(c, f)
      doll = new TimeBellDoll(c, v(C.DOLL.x, C.PLAZA.y, C.DOLL.z), C.DOLL.yaw, MIST[quality.level] ?? 160)
      doll.roam = C.DOLL_ROAM
      kagaribi = new Kagaribi(c, KAGARIBI_PLACES)
    },
  })
  const ws = workshop as unknown as WorkshopParts
  const dl = doll as unknown as TimeBellDoll
  const kg = kagaribi as unknown as Kagaribi
  const root = edo.root
  root.add(dl.root, dl.fx, kg.group)
  // 時の神さまのほこら（1726年：建てたばかり）
  const shrine = new TimeShrine({ age: 0, mats: shrineMaterialsFrom(mats), lanterns: true })
  shrine.root.position.set(C.SHRINE.x, 0, C.SHRINE.z)
  shrine.root.rotation.y = C.SHRINE.yaw
  root.add(shrine.root)
  shrine.addColliders(edo.colliders)
  let sky: EdoSkyCycle | null = null
  return {
    edo,
    root,
    colliders: edo.colliders,
    lights: edo.lights,
    claw: { targets: [...edo.claw.targets, ...dl.targets], movables: [...edo.claw.movables] },
    workshop: ws,
    doll: dl,
    shrine,
    kagaribi: kg,
    arriveRing: ARRIVE_RING.clone(),
    returnRing: RETURN_RING.clone(),
    spawns: CHRONICLE_SPAWNS,
    spots: WORKSHOP_SPOTS,
    createSky(t) {
      sky = new EdoSkyCycle({ ...t, lights: edo.lights.filter((l) => !kg.owns(l)) })
      root.add(sky.nightSky.group)
      return sky
    },
    update(dt, t, camera) {
      edo.update(dt, t)
      ws.update(dt, t, camera)
      dl.update(dt, camera)
      shrine.update(dt)
      kg.update(dt)
      sky?.update(dt, camera)
    },
  }
}
