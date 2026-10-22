// v7 の共通の見た目（2086・1186・2026・1726 の各ステージで使う部品）の入口。
// 使い方と API は各ファイルの先頭のコメント、見た目は chronicle-preview.html?view=people|lamp|hands|slit|fx|ura|heart|shade
export { createPerson, createBed, type PersonCharacter, type PersonPreset, type PersonPose, type PersonOpts, type BladeState, type Expression } from './person'
export { Lamp, type LampOpts } from './lamp'
export { BlackHands, type HandFrom, type HandState, type SpawnOpts } from './hands'
export { SlitFx, Slit, type SlitOpts, type SlitState, type SlitVariant } from './slit'
export { FreezeFx, SlashFx, type SlashOpts } from './chronoFx'
export { buildUraArena, URA_ENV, URA_SKY, URA_DEFAULT_PLATFORMS, UraEnvSwitch, type UraArena, type UraOpts, type UraPlatform, type UraPlatformDef, type UraEnvTargets } from './ura'
export { OrmHeart, VEIN_CUT_U, type HeartOpts, type HeartVein } from './heart'
export { SHADE_STYLE, BIG_SHADE_STYLE, ARMORED_SHADE_STYLE, KARAKURI_SHADE_STYLE, SHADE_SMOKE, SHADE_GLOW, ShadeWisps, type WispTarget } from './shade'
export { Particles, type EmitOpts, type ParticleOpts, type ParticleShape } from './particles'
export { createToonMaterial, setToonRim, setToonSelfLight, PartSet } from './toon'
export { SLAM_TIMING, slamPhase, slamTotal, slamImpactAt, slamWarning, heartBeat, heartRate, VeinSet, freezeArc, freezeTicked, type SlamPhase, type SlamTiming } from './logic'
