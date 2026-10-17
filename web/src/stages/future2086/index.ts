// 2086年 ナンバタウン「時代博覧祭」：シェル（game/）から使う入口。
//
// つなぎ方（previewPlay.ts が最小の実例）：
//   1. await preloadFutureAssets(aniso)                    … テクスチャ（舗装・パネル）とフォントの先読み（任意だが推奨）
//   2. const fs = buildFutureScene(mats, quality, { aniso }) … root / colliders / claw / lights / spawns / npcs / environment …
//   3. ステージの environment は fs.environment（StageEnvironment と同じ形）。昼夜の切り替えは
//      fs.setTimeOfDay(mode) → applyTimeOfDay(fs.environment, { scene, sky, sun, hemi, post, envMaps })（作り直さずに値だけ変える）
//   4. 毎フレーム fs.update(dt, uTime.value)。夜の避難中は fs.debris.update(dt, player.position)（hit で軽くよろけさせる）
//   5. 物語：const story = new Future2086Story({ start: startStepFromFlags(flags) })
//      story.onEffect = (e) => { … }  … 会話・暗転・オルム・破片・ループ（LoopFx）・裂け目（fs.openRift）・選択肢・フラグ
//      story.onRequestTravel = (era, spawn) => rt.travel({ to: era, spawn, cause: 'ido_exhibit' })
//      出来事は story.send(…)：範囲（fs.zoneAt、地面に立っているときだけ）・F（interact）・NMClaw（WireEvent の kind と対象 ID）・
//      会話の終わり（dialogue_done）・選択（choice）・演出の終わり（fx_done）・破片（debris_hit）・tick
//   6. HUD：story.objective()（左上）、story.hints()（シェルのクローの案内が無いとき）
export { buildFutureScene, type FutureScene, type FutureSpawn, type FutureNpcs, type NpcSpot, type OrumState, type SoraSpotId } from './scene'
export { preloadFutureAssets, DISSOLVE, type TimeOfDay, type FutureMaterials } from './fmaterials'
export { FUTURE_ENVIRONMENTS, FUTURE_MORNING_SKY, FUTURE_NIGHT_SKY, FUTURE_SUN_DIR, applyTimeOfDay, findHaze, type FutureEnvironment, type EnvTargets } from './environment'
export { LoopFx, LOOP_TIMING, type LoopPhase, type LoopPlayOpts } from './loopFx'
export {
  Future2086Story,
  OBJECTIVES,
  STEP_HINTS,
  STORY_STEPS,
  IDO_CHOICE,
  EVADE_TIMEOUT,
  startStepFromFlags,
  spawnForStep,
  type StoryStepId,
  type StoryEvent,
  type StoryEffect,
  type StoryFlag,
  type StoryZone,
  type StoryInteract,
  type ClawEventKind,
  type DialogueLine,
  type Objective,
  type KeyHint,
} from './future2086Story'
export { F as FUTURE_LAYOUT, HOOK, SWING, ZONES, zoneAt, yawTo, type ZoneId, type Interactable } from './layout'
export { CLAW_IDS, type FutureClawWorld } from './clawTargets2086'
export { UNIT_SPECS, UNIT_HEIGHT, type UnitSpec } from './units'
export { DebrisField, type DebrisResult } from './orum'
