// 物語 v7 の 2086年ナンバタウンの舞台（フェーズ 1：舞台と仕掛けの部品）。既存の町（buildFutureScene）の上に足す。
//
// 使い方（ステージの load）：
//   const fs = buildFutureScene(mats, q, { aniso, mods: CHRONICLE_SCENE_MODS })   // 地面の穴・通りの延長・跡地の空き地
//   const ch = buildChronicleAdditions(fs, q)                                      // 時計台・地下通路・跡地・屋台・ベンチ・ダイヤル
//   world.claw.targets に fs.claw.targets（時計台の金具は ch が足してある）
// begin：ch.attachPhysics(rt.phys)（出し入れする当たり判定・動く足場を作る）
// 毎フレーム：ch.update(dt, t)。昼夜：fs.setTimeOfDay(m) のあと ch.setTimeOfDay(m)
import * as THREE from 'three'
import type { Physics } from '../../../player/physics'
import type { ClawTargetDef } from '../../../player/clawLogic'
import type { QualitySettings } from '../../../render/quality'
import type { MaterialLibrary } from '../../../render/materials'
import type { TimeOfDay } from '../fmaterials'
import { buildFutureScene, type FutureScene, type FutureSceneMods } from '../scene'
import { buildClockTower, type ClockTowerParts } from './clockTower'
import { buildUnderground, type UndergroundParts } from './underground'
import { finishCtx, makeCtx } from './kitChronicle'
import { CHRONICLE_SPOTS, CLEAR_AREAS, GROUND_HOLES, SITE, STREET_END_Z } from './layoutChronicle'
import { SwitchColliders } from './switchColliders'

/** buildFutureScene に渡す町の変更（地下の階段と池の穴・北の通りを跡地まで延ばす・跡地の場所を空ける・人を置かない所） */
export const CHRONICLE_SCENE_MODS: FutureSceneMods = {
  groundHoles: GROUND_HOLES,
  streetEndZ: STREET_END_Z,
  streetEastGap: SITE.gap,
  clearAreas: CLEAR_AREAS,
}

export type ChronicleAdditions = {
  root: THREE.Group
  tower: ClockTowerParts
  underground: UndergroundParts
  /** 出し入れする当たり判定（跡地の 2 つの姿・裏側の足場・つり板など） */
  colliders: SwitchColliders
  /** 足したつかめる対象（時計台の金具など。fs.claw.targets にも入れてある） */
  clawTargets: ClawTargetDef[]
  spots: typeof CHRONICLE_SPOTS
  /** ステージの begin で 1 回（rt.phys） */
  attachPhysics(phys: Physics): void
  setTimeOfDay(mode: TimeOfDay): void
  update(dt: number, t: number): void
  dispose(): void
}

export function buildChronicleAdditions(fs: FutureScene, quality: QualitySettings): ChronicleAdditions {
  const root = new THREE.Group()
  root.name = 'chronicle2086'
  fs.root.add(root)
  const colliders = new SwitchColliders()
  const c = makeCtx(fs, root, quality, 7086)

  // ---- 北の通りを跡地まで延ばした分の見えない壁（通りの両側の建物のすき間をふさぐ）
  c.col.wall(-6.12, -20.3, -6.12, STREET_END_Z, -1, 12)
  c.col.wall(6.2, -36.0, 6.2, SITE.gate.z1 + 0.05, -1, 12)
  c.col.wall(6.2, SITE.gate.z0 - 0.05, 6.2, STREET_END_Z, -1, 12)

  const tower = buildClockTower(c, root)
  for (const h of tower.hooks) fs.claw.targets.push(h)
  const underground = buildUnderground(c, root)

  const { holoNight } = finishCtx(c, root, 'chronicle_static')
  const clawTargets: ClawTargetDef[] = [...tower.hooks]

  let night = false
  const self: ChronicleAdditions = {
    root,
    tower,
    underground,
    colliders,
    clawTargets,
    spots: CHRONICLE_SPOTS,
    attachPhysics(phys: Physics) {
      colliders.attach(phys)
    },
    setTimeOfDay(mode: TimeOfDay) {
      night = mode === 'night'
      if (holoNight) holoNight.visible = night
      tower.setNight(night)
    },
    update(dt: number, t: number) {
      for (const u of c.updaters) u(dt, t)
      tower.update(dt)
      underground.update(dt)
    },
    dispose() {
      colliders.detach()
    },
  }
  return self
}

/** 町と舞台をまとめて組み立てる（プレビュー・ステージの load 用） */
export function buildChronicleFuture(mats: MaterialLibrary, quality: QualitySettings, opts: { aniso?: number } = {}): { fs: FutureScene; ch: ChronicleAdditions } {
  const fs = buildFutureScene(mats, quality, { aniso: opts.aniso, mods: CHRONICLE_SCENE_MODS })
  const ch = buildChronicleAdditions(fs, quality)
  return { fs, ch }
}
