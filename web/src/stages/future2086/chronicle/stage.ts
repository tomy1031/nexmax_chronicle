// 2086 年ナンバタウン（物語 v7「ネクマックスと、時を裂く爪」の はじめに・1〜5・8・10・12 章・おわりに）の本編。
// ・舞台：buildChronicleFuture（既存の町＋時計台・地下通路・NEXTMAKE の跡地・屋台・ベンチ・年代ダイヤル）＋導入編の小物（街頭ビジョン・風船）
// ・進み：story2086.ts（フラグだけから段階が決まる純粋なロジック）。段階ごとの場面は async の scene*（操作を止める → カメラ →
//   会話 → フラグ → セーブ → 操作を戻す）。プレイヤーが何かをするのを待つ所は until()（devSkip で片づけられる）
// ・人：ソラ（GLB）・トワ（visuals の createPerson('towa') ＋ Lamp）。黒い手は visuals の BlackHands、空のひびは SkyTear と orum
// ・12 章の裏側は uraFinal.ts（visuals 担当の UraBattle が入るまでの仮）
import * as THREE from 'three'
import { createMaterialLibrary } from '../../../render/materials'
import { ERA_FUTURE } from '../../../core/eras'
import { DialogueDB } from '../../../core/dialogue'
import { skyEnvironment, type EnvTexture } from '../../../game/env'
import type { ObjectiveMark, SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageWorld } from '../../../game/stage'
import type { ActionFrame } from '../../../player/inputActions'
import type { WireEvent } from '../../../player/clawLogic'
import type { Hint } from '../../../ui/hud'
import type { Character } from '../../../world/characters'
import type { MusicId } from '../../../audio/tracks'
import { SceneClock } from '../../../chronicle/kit/clock'
import { Walker, faceYaw } from '../../../chronicle/kit/walker'
import { Curtain } from '../../../chronicle/kit/curtain'
import { ChoiceBox } from '../../../chronicle/kit/choice'
import { lightsLeft, type Flags } from '../../../chronicle/progress'
import { V7_ART, TOWA_UNMASKED, loadArtCanvas } from '../../../chronicle/art'
import { BlackHands, Lamp, SHADE_STYLE, createPerson, type PersonCharacter } from '../../../chronicle/visuals'
import { preloadFutureAssets } from '../fmaterials'
import { FUTURE_ENVIRONMENTS, applyTimeOfDay, type TimeOfDay } from '../environment'
import type { FutureScene } from '../scene'
import { buildIntroProps, type IntroProps } from '../introProps2086'
import { LoopFx } from '../loopFx'
import { SkyTear } from '../skyTear2086'
import { LensMount, RingRecord } from '../recordFx2086'
import { Flashback, type FlashbackLine } from '../introOverlay2086'
import { F } from '../layout'
import { buildChronicleFuture, type ChronicleAdditions } from './additions'
import { CHRONICLE_SPOTS, SITE, TOWER, UNDER, chronicleKillY } from './layoutChronicle'
import type { ChronoTarget } from '../../../chronicle/chrono'
import { YearDialLogic } from './yearDialLogic'
import { YearDialPanel } from './yearDialPanel'
import { createStarKeychain } from './plazaProps'
import { createUraFinal, type UraLike } from './uraFinal'
import { SkyEvent, TimeBadge, groundY } from './stageKit'
import linesJson from './lines_v7.json'
import {
  arrivalFlag,
  dayPartOf,
  defaultPhase,
  dialVisible,
  lensMounted,
  morningOf,
  musicOf,
  objectiveOf,
  siteVariantOf,
  spawnFor,
  step2086,
  type DayPart,
  type Step2086,
} from './story2086'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const LINES = new DialogueDB(linesJson as Record<string, unknown>)

type SoraMode = 'spot' | 'follow' | 'walk' | 'hidden'
type FWait = { pos: THREE.Vector3; reach: number; label: string; resolve: () => void }

/** 逃げきり（2 章）・時計台のぼり（4 章）・最後の夜（12 章）の黒い手のあそび */
type HandsMode = 'none' | 'escape' | 'climb' | 'cut'

export class ChronicleFutureStage implements Stage {
  readonly key = '2086' as const
  readonly era = ERA_FUTURE
  readonly label = '2086年　ナンバタウン'
  readonly subtitle = '時代博覧祭'
  readonly environment: StageEnvironment

  // ---- 舞台
  private fs!: FutureScene
  private ch!: ChronicleAdditions
  private props!: IntroProps
  private sora!: Character
  private towa!: PersonCharacter
  private lamp!: Lamp
  private hands!: BlackHands
  private tear!: SkyTear
  private sky!: SkyEvent
  private ring!: RingRecord
  private lens!: LensMount
  private ura!: UraLike
  private nightEnv: EnvTexture | null = null
  private dayEnv: THREE.Texture | null = null
  private keychain: THREE.Mesh | null = null

  // ---- 進み
  private rt: StageRuntime | null = null
  private spawnId: string | null = null
  private arrival: string | null = null
  step: Step2086 = 'prologue'
  phase = 'prologue'
  private part: DayPart = 'morning'
  private readonly clock = new SceneClock()
  private readonly walker = new Walker()
  private readonly choice = new ChoiceBox()
  private curtain: Curtain | null = null
  private badge: TimeBadge | null = null
  private dialPanel: YearDialPanel | null = null
  private fx: LoopFx | null = null
  private flash: Flashback | null = null
  private ui: HTMLElement | null = null
  private busy = false
  private fWait: FWait | null = null
  private skipReq = false
  private marks: ObjectiveMark[] = []
  private started = false
  private dead = false
  /** その日の中の進み（ループの朝で戻る） */
  private lensToday = false
  private boughtToday = false
  // ---- ソラ
  private soraMode: SoraMode = 'spot'
  private readonly soraSpot = { pos: new THREE.Vector3(), yaw: 0 }
  // ---- 黒い手
  private handsMode: HandsMode = 'none'
  private handT = 0
  private handHits = 0
  private handsCut = 0
  private readonly handClock: Record<string, number> = {}
  private climbLanding = new THREE.Vector3()
  // ---- 年代ダイヤル
  private dial: { logic: YearDialLogic; resolve: () => void } | null = null
  // ---- 決闘
  private duel: { thread: number; window: number; shots: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; frozen: boolean; id: string; life: number }>; fireT: number; wave: number } | null = null
  private tmp = new THREE.Vector3()

  constructor() {
    const e = FUTURE_ENVIRONMENTS.morning
    this.environment = {
      sky: e.sky,
      sunDir: e.sunDir,
      sunColor: e.sunColor,
      sunIntensity: e.sunIntensity,
      hemi: e.hemi,
      hdri: e.hdri,
      envIntensity: e.envIntensity,
      fog: e.fog,
      grade: e.grade,
      bloom: e.bloom,
      haze: e.haze,
    }
  }

  // ================================================================== 読み込み

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    const soraP = ctx.loadNpc('sora', 1.58)
    ctx.progress(0.1, 'テクスチャとフォントを読み込み中…')
    await ctx.yieldFrame()
    await preloadFutureAssets(aniso)
    const mats = await createMaterialLibrary(aniso)
    ctx.progress(0.4, 'ナンバタウンを組み立て中…')
    await ctx.yieldFrame()
    const { fs, ch } = buildChronicleFuture(mats, ctx.quality, { aniso })
    this.fs = fs
    this.ch = ch
    ctx.progress(0.65, 'お祭りの小物を置いています…')
    await ctx.yieldFrame()
    this.props = buildIntroProps(fs.root, fs.colliders, { v7: true })
    fs.claw.targets.push(this.props.balloon.def)
    fs.claw.movables.push(this.props.balloon.movable)
    this.props.screen.setOn(true, true)
    this.ring = new RingRecord(fs.root)
    this.lens = new LensMount(fs.root)
    this.tear = new SkyTear(fs.root)
    this.sky = new SkyEvent(this.tear, fs.orum)
    this.hands = new BlackHands(fs.root)
    this.towa = createPerson('towa', { rim: '#9a7cff', rimK: 0.6 })
    this.lamp = new Lamp(fs.root, { dark: true })
    this.towa.holdLamp(this.lamp)
    this.towa.root.visible = false
    fs.root.add(this.towa.root)
    this.ura = createUraFinal()
    ctx.progress(0.8, 'ソラを読み込み中…')
    this.sora = await soraP
    fs.root.add(this.sora.root)
    const night = FUTURE_ENVIRONMENTS.night
    this.nightEnv = skyEnvironment(ctx.renderer, night.sky, night.sunDir)
    this.spawnId = ctx.spawnId
    this.arrival = ctx.spawnId && ctx.spawnId.startsWith('v7_from_') ? ctx.spawnId : null
    this.step = step2086((n) => ctx.story.get(n))
    return { root: fs.root, colliders: fs.colliders, claw: { targets: fs.claw.targets, movables: fs.claw.movables }, lights: fs.lights }
  }

  spawn(id: string | null): SpawnPoint {
    const key = id && (this.fs.spawns[id] || (CHRONICLE_SPOTS as Record<string, unknown>)[id]) ? id : spawnFor(this.step, id)
    return this.spawnPoint(key)
  }

  private spawnPoint(key: string): SpawnPoint {
    const s = this.fs.spawns[key]
    if (s) return s
    const c = (CHRONICLE_SPOTS as Record<string, { pos: THREE.Vector3; yaw: number }>)[key]
    if (c) return { pos: c.pos.clone(), facing: c.yaw, camYaw: c.yaw, camPitch: 0.22 }
    return this.fs.spawns.start
  }

  // ================================================================== はじまり

  begin(rt: StageRuntime): void {
    this.rt = rt
    this.dayEnv = rt.scene.environment
    this.ui = rt.renderer.domElement.ownerDocument.getElementById('ui') ?? document.body
    this.curtain = new Curtain(document.body)
    this.badge = new TimeBadge(document.body)
    this.dialPanel = new YearDialPanel(this.ui)
    this.fx = new LoopFx(rt.camera, rt.scene)
    this.ch.attachPhysics(rt.phys)
    // 時代を移って着いた：帰還のフラグ（光のつぶが 1 つへる）
    const back = arrivalFlag(this.f)
    if (back) rt.story.set(back, true)
    this.step = step2086(this.f)
    this.phase = defaultPhase(this.step)
    this.prepare(this.step, rt)
    rt.save(this.spawnId ?? spawnFor(this.step))
  }

  revealed(rt: StageRuntime): void {
    if (this.started) return
    this.started = true
    void this.runFrom(rt)
  }

  /** フラグの読み取り（rt が無いときは false） */
  private readonly f: Flags = (n: string) => this.rt?.story.get(n) ?? false

  private set(rt: StageRuntime, flag: string): void {
    rt.story.set(flag, true)
  }

  private L(key: string) {
    return LINES.lines(key)
  }

  private get alive(): boolean {
    return !this.dead && !this.clock.dead
  }

  /** 段階に合わせて舞台を整える（昼夜・跡地・ダイヤル・レンズ・ソラ・トワ・小物） */
  private prepare(step: Step2086, rt: StageRuntime): void {
    const part = dayPartOf(step)
    this.setPart(part, rt, step === 'ch2_night' || step === 'ch12_hands' || step === 'ch12_ura')
    this.ch.site.setVariant(step === 'ch10_shrine' && !this.f('v7_rift_claw') ? 'building' : siteVariantOf(this.f))
    if (siteVariantOf(this.f) === 'courtyard' && this.f('v7_rift_claw')) this.ch.site.shrine.takeClaw()
    this.ch.dial.setDial(dialVisible(this.f), true)
    this.ch.dial.setYear(2086)
    this.lens.set(lensMounted(step, this.lensToday))
    this.ring.setWobble(lensMounted(step, this.lensToday) ? 0 : 1)
    this.ring.showVisitor()
    this.ch.site.setSeam(0)
    this.ch.site.setUra(0)
    this.ch.site.toolbox.reset()
    this.hideTowa()
    this.placeSora('booth')
    this.props.balloon.reset()
    this.props.balloon.def.enabled = false
    this.ch.stall.resetStall()
    const day = Math.max(1, morningOf(step, this.f) || 1)
    this.props.street.setNews(step === 'epilogue' || step === 'done' ? this.newsEpilogue() : this.newsFor(day))
    this.ch.tower.setTime(part === 'morning' ? 10 : part === 'evening' ? 17 : 20, part === 'night' ? 40 : 30)
  }

  private newsFor(day: number) {
    return { date: '今日は 2086年10月18日', headline: 'お祭りの一日目です', sub: '天気：一日中晴れ　☀　夜はお祭りの明かりを楽しもう', loop: day }
  }

  private newsEpilogue() {
    return { date: '今日は 2086年10月19日', headline: 'お祭りの二日目です', sub: '天気：晴れ　☀　きのうの夜の流れ星、見ましたか？' }
  }

  // ================================================================== 昼夜

  private setPart(part: DayPart, rt: StageRuntime, orum: boolean): void {
    this.part = part
    const mode: TimeOfDay = part === 'morning' ? 'morning' : 'night'
    if (mode === 'morning') this.sky.reset()
    this.fs.setTimeOfDay(mode)
    this.ch.setTimeOfDay(mode)
    const maps: Partial<Record<TimeOfDay, THREE.Texture>> = {}
    if (this.dayEnv) maps.morning = this.dayEnv
    if (this.nightEnv) maps.night = this.nightEnv.texture
    applyTimeOfDay(this.fs.environment, { scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post, envMaps: maps })
    this.fs.setOrum({ show: 0, tomorrow: 1, dissolve: 0, swallow: 0 })
    if (orum && part === 'night') this.sky.finish(rt)
    // 夕方：夜の環境で、人出はそのまま（夜の人出にしない）
    if (part === 'evening') this.fs.crowd.setNight(false)
  }

  // ================================================================== ソラ

  private placeSora(spot: 'booth' | 'exhibit' | 'night' | 'gate' | THREE.Vector3, yaw?: number): void {
    this.walker.stop(this.sora)
    this.sora.root.visible = true
    this.soraMode = 'spot'
    if (spot instanceof THREE.Vector3) {
      this.soraSpot.pos.copy(spot)
      this.soraSpot.yaw = yaw ?? this.sora.root.rotation.y
    } else {
      const s = this.fs.npcs.sora[spot]
      this.soraSpot.pos.copy(s.pos)
      this.soraSpot.yaw = s.yaw
    }
    this.sora.root.position.copy(this.soraSpot.pos)
    this.sora.root.rotation.y = this.soraSpot.yaw
    this.sora.setPose('idle')
  }

  private soraFollow(): void {
    this.walker.stop(this.sora)
    this.sora.root.visible = true
    this.soraMode = 'follow'
  }

  private async soraWalk(path: THREE.Vector3[], speed = 2.2, face: THREE.Vector3 | null = null): Promise<void> {
    this.sora.root.visible = true
    this.soraMode = 'walk'
    await this.walker.walkTo(this.sora, path, speed, face)
    this.soraSpot.pos.copy(this.sora.root.position)
    this.soraSpot.yaw = this.sora.root.rotation.y
    if (this.soraMode === 'walk') this.soraMode = 'spot'
  }

  private updateSora(dt: number, rt: StageRuntime): void {
    const s = this.sora
    let speed = this.walker.speedOf(s)
    if (this.soraMode === 'follow') {
      const p = rt.player.position
      const fx = -Math.sin(rt.player.facing)
      const fz = -Math.cos(rt.player.facing)
      // プレイヤーの右うしろ
      const want = this.tmp.set(p.x - fx * 1.3 + fz * 0.9, p.y, p.z - fz * 1.3 - fx * 0.9)
      const dx = want.x - s.root.position.x
      const dz = want.z - s.root.position.z
      const d = Math.hypot(dx, dz)
      if (d > 0.35) {
        const sp = Math.min(d > 4 ? 5.2 : 3.2, d * 3)
        s.root.position.x += (dx / d) * sp * dt
        s.root.position.z += (dz / d) * sp * dt
        if (d > 12) s.root.position.set(want.x, want.y, want.z)
        this.walker.turnToward(s, want, dt, 8)
        speed = sp
      } else this.walker.turnToward(s, p, dt, 4)
      s.root.position.y += (groundY(rt.phys, s.root.position, p.y) - s.root.position.y) * Math.min(1, dt * 10)
    } else if (this.soraMode === 'spot') {
      // 近くに来たらこちらを向く
      const p = rt.player.position
      if (p.distanceTo(s.root.position) < 4.5) this.walker.turnToward(s, p, dt, 3)
    } else if (this.soraMode === 'walk') {
      s.root.position.y += (groundY(rt.phys, s.root.position, s.root.position.y) - s.root.position.y) * Math.min(1, dt * 10)
    }
    s.update(dt, speed)
  }

  // ================================================================== トワ

  private hideTowa(): void {
    this.towa.root.visible = false
    this.lamp.root.visible = false
  }

  private showTowa(pos: THREE.Vector3, face: THREE.Vector3, pose: Parameters<PersonCharacter['setPose']>[0] = 'idle', mask = true): void {
    this.towa.root.visible = true
    this.lamp.root.visible = true
    this.towa.root.position.copy(pos)
    this.towa.root.rotation.y = faceYaw(pos, face)
    this.towa.setPose(pose)
    this.towa.setMask(mask)
  }

  // ================================================================== 待つ・F・カメラ

  /** cond が真になるまで待つ（devSkip で skip を呼んで先へ） */
  private async until(cond: () => boolean, skip?: () => void): Promise<void> {
    this.skipReq = false
    await this.clock.until(() => this.skipReq || cond())
    if (this.skipReq) skip?.()
    this.skipReq = false
  }

  private wait(sec: number): Promise<void> {
    return this.clock.wait(sec)
  }

  /** 近くで F を押すまで待つ */
  private waitF(pos: THREE.Vector3, reach: number, label: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.fWait = { pos: pos.clone(), reach, label, resolve }
      this.skipReq = false
    })
  }

  /** プレイヤーが pos の近くへ来るまで（skip でそこへ移す） */
  private waitNear(rt: StageRuntime, pos: THREE.Vector3, r: number, ySpan = 3): Promise<void> {
    return this.until(
      () => Math.hypot(rt.player.position.x - pos.x, rt.player.position.z - pos.z) < r && Math.abs(rt.player.position.y - pos.y) < ySpan,
      () => this.teleport(rt, pos, faceYaw(pos, this.sora.root.position)),
    )
  }

  private teleport(rt: StageRuntime, pos: THREE.Vector3, yaw?: number): void {
    rt.claw.reset()
    rt.player.teleport(pos.clone(), yaw ?? rt.player.facing)
    if (yaw !== undefined) {
      rt.camRig.yaw = yaw
      rt.camRig.pitch = 0.24
    }
  }

  private teleportSpawn(rt: StageRuntime, key: string): void {
    const s = this.spawnPoint(key)
    rt.claw.reset()
    rt.player.teleport(s.pos.clone(), s.facing)
    rt.camRig.yaw = s.camYaw
    rt.camRig.pitch = s.camPitch
  }

  /** 会話（操作は止めない。場面の中では lock してから） */
  private talk(rt: StageRuntime, key: string): Promise<void> {
    return rt.dialogue(this.L(key))
  }

  /** カメラで見せながら会話（終わったら戻す） */
  private async talkShot(rt: StageRuntime, key: string, look: THREE.Vector3, from?: THREE.Vector3, o: { fov?: number; label?: string } = {}): Promise<void> {
    void rt.cinematic({ look, from, hold: Infinity, inSec: 1.4, outSec: 1.2, fov: o.fov, marker: o.label ? { pos: look, label: o.label } : undefined })
    await this.talk(rt, key)
    rt.endCinematic()
    await this.wait(0.4)
  }

  private lock(rt: StageRuntime, on: boolean): void {
    this.busy = on
    rt.setControlLocked(on)
  }

  private setPhase(p: string, marks: ObjectiveMark[] = []): void {
    this.phase = p
    this.marks = marks
  }

  private async fade(on: boolean, sec = 0.6, color = '#000'): Promise<void> {
    await this.curtain?.set(on, sec, color)
  }

  private async playFlashback(lines: readonly FlashbackLine[], image: string, place: [string, string]): Promise<void> {
    const fb = new Flashback(lines, { image, place, noCanvas: true })
    this.flash = fb
    await new Promise<void>((r) => (fb.onDone = r))
    this.flash = null
  }

  private async showRecord(rt: StageRuntime, title: string, sub: string, body: string, art: string, lines?: string): Promise<void> {
    const image = await loadArtCanvas(art)
    rt.hud.showIdo({ title, sub, body, image, foot: 'イドーのかんばんの記録' })
    if (lines) await this.talk(rt, lines)
    else await this.wait(4)
    rt.hud.hideIdo()
  }

  // ================================================================== 段階の流れ

  private async runFrom(rt: StageRuntime): Promise<void> {
    while (this.alive) {
      const step = step2086(this.f)
      if (step !== this.step) {
        this.step = step
        this.prepareSoft(step, rt)
      }
      this.phase = defaultPhase(step)
      const before = step
      try {
        await this.runStep(step, rt)
      } catch (e) {
        console.error('[2086 v7] 場面でエラー', step, e)
        this.lock(rt, false)
        return
      }
      if (!this.alive) return
      if (step2086(this.f) === before) return
      rt.save(spawnFor(step2086(this.f)))
    }
  }

  /** 段階が変わったとき（場面の続き）：大きく作り直さずに必要なものだけ */
  private prepareSoft(step: Step2086, rt: StageRuntime): void {
    this.ch.dial.setDial(dialVisible(this.f))
    this.lens.set(lensMounted(step, this.lensToday))
    void rt
  }

  private runStep(step: Step2086, rt: StageRuntime): Promise<void> {
    switch (step) {
      case 'prologue':
        return this.scenePrologue(rt)
      case 'ch1_booth':
        return this.sceneCh1Booth(rt)
      case 'ch1_keychain':
        return this.sceneCh1Keychain(rt)
      case 'ch1_promise':
        return this.sceneCh1Promise(rt)
      case 'ch2_night':
        return this.sceneCh2(rt)
      case 'ch3_morning':
        return this.sceneCh3(rt)
      case 'ch4_hide':
        return this.sceneCh4Hide(rt)
      case 'ch4_tower':
        return this.sceneCh4Tower(rt)
      case 'ch5_confide':
        return this.sceneCh5Confide(rt)
      case 'ch5_door':
        return this.sceneCh5Door(rt)
      case 'ch8_back':
        return this.sceneCh8Back(rt)
      case 'ch8_dial':
        return this.sceneCh8Dial(rt)
      case 'ch10_shrine':
        return this.sceneCh10Shrine(rt)
      case 'ch10_practice':
        return this.sceneCh10Practice(rt)
      case 'ch10_memory':
        return this.sceneCh10Memory(rt)
      case 'ch10_duel':
        return this.sceneCh10Duel(rt)
      case 'ch10_travel':
        return this.sceneCh10Travel(rt)
      case 'ch12_back':
        return this.sceneCh12Back(rt)
      case 'ch12_hands':
        return this.sceneCh12Hands(rt)
      case 'ch12_ura':
        return this.sceneCh12Ura(rt)
      case 'ch12_ending':
        return this.sceneCh12Ending(rt)
      case 'epilogue':
        return this.sceneEpilogue(rt)
      default:
        this.setPhase('done')
        return Promise.resolve()
    }
  }

  // ================================================================== はじめに

  private async scenePrologue(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    this.setPhase('prologue')
    await this.fade(true, 0.01)
    await this.playFlashback(this.L('prologue'), V7_ART.prologue, ['15年前　2071年', '古いビルの地下の倉庫'])
    if (!this.alive) return
    this.set(rt, 'v7_prologue_seen')
    rt.save('start')
    await this.fade(false, 1.0)
    this.lock(rt, false)
    await rt.chapter()
  }

  // ================================================================== 毎朝の型

  /** 街頭ビジョン → 風船。day は何度目の 10月18日 */
  private async runMorning(rt: StageRuntime, day: number): Promise<void> {
    this.lock(rt, true)
    this.setPhase('morning')
    this.props.street.setNews(this.newsFor(day))
    this.props.street.pulse()
    const vision = this.props.street.center
    this.teleportSpawn(rt, 'loop_morning')
    await this.fade(false, 0.8)
    void rt.cinematic({ look: vision, from: vision.clone().add(v(1.6, -1.2, 4.4)), hold: Infinity, inSec: 1.2, fov: 48 })
    await this.talk(rt, day >= 2 ? (day >= 4 ? 'morning4' : `morning${day}`) : 'morning1')
    rt.endCinematic()
    // 風船：子どもの手からはなれて、毎朝同じ電灯に引っかかる
    this.props.balloon.play()
    await this.wait(0.6)
    void rt.cinematic({ look: v(-2.8, 4.2, 9.6), hold: 2.6, inSec: 1.0, outSec: 1.0 })
    await this.talk(rt, 'balloon_up')
    await this.wait(2.2)
    this.props.balloon.def.enabled = true
    this.lock(rt, false)
  }

  // ================================================================== 1 章

  private async sceneCh1Booth(rt: StageRuntime): Promise<void> {
    await this.runMorning(rt, 1)
    if (!this.alive) return
    const sora = this.sora.root.position
    this.setPhase('balloon', [{ pos: sora.clone().setY(sora.y + 1.9), label: 'ソラ' }])
    await this.waitNear(rt, sora, 3.4)
    if (!this.alive) return
    this.lock(rt, true)
    this.props.balloon.def.enabled = false
    this.walker.face(this.sora, rt.player.position)
    await this.talkShot(rt, 'ch1_greet', F.PORTAL.y > 0 ? v(F.PORTAL.x, F.PORTAL.y, F.PORTAL.z) : sora, undefined, { fov: 52 })
    this.lock(rt, false)
    // 共鳴レンズ（箱の山の上）
    const lensId = this.fs.claw.ids.lens
    const lensMv = this.fs.claw.movables.find((m) => m.def.id === lensId)
    const carrying = () => rt.claw.wire.phase === 'carrying' && rt.claw.wire.target?.id === lensId
    this.setPhase('lens', [{ pos: this.fs.markers.lens.clone().add(v(0, 0.6, 0)), label: '共鳴レンズ' }])
    await this.until(carrying, () => {
      this.lensToday = true
    })
    if (!this.alive) return
    if (!this.lensToday) {
      this.setPhase('lens_give', [{ pos: this.sora.root.position.clone().setY(this.sora.root.position.y + 1.9), label: 'ソラ' }])
      await this.until(() => !carrying() || this.sora.root.position.distanceTo(rt.player.position) < 2.6)
      if (this.sora.root.position.distanceTo(rt.player.position) >= 2.6 && !carrying()) {
        // 途中で置いた：もう一度取ってもらう
        return this.sceneCh1Lens(rt)
      }
    }
    await this.installLens(rt, lensMv?.def.id ?? lensId)
  }

  /** レンズを置いてしまったとき：もう一度取って、わたす */
  private async sceneCh1Lens(rt: StageRuntime): Promise<void> {
    const lensId = this.fs.claw.ids.lens
    const carrying = () => rt.claw.wire.phase === 'carrying' && rt.claw.wire.target?.id === lensId
    for (;;) {
      if (!this.alive) return
      this.setPhase('lens', [{ pos: this.fs.markers.lens.clone().add(v(0, 0.6, 0)), label: '共鳴レンズ' }])
      await this.until(() => carrying() || this.lensToday, () => (this.lensToday = true))
      if (this.lensToday) break
      this.setPhase('lens_give', [{ pos: this.sora.root.position.clone().setY(this.sora.root.position.y + 1.9), label: 'ソラ' }])
      await this.until(() => !carrying() || this.sora.root.position.distanceTo(rt.player.position) < 2.6, () => (this.lensToday = true))
      if (this.lensToday || this.sora.root.position.distanceTo(rt.player.position) < 2.6) break
    }
    await this.installLens(rt, lensId)
  }

  private async installLens(rt: StageRuntime, lensId: string): Promise<void> {
    this.lock(rt, true)
    rt.claw.reset()
    const mv = this.fs.claw.movables.find((m) => m.def.id === lensId)
    if (mv) {
      rt.claw.sendHomeById(lensId)
      mv.object.visible = false
      mv.def.enabled = false
    }
    await this.talk(rt, 'ch1_lens_give')
    this.lensToday = true
    this.lens.set(true, true)
    this.ring.setWobble(0)
    rt.oreGlow(1.2)
    await this.talkShot(rt, 'ch1_lens_ok', v(F.PORTAL.x, F.PORTAL.y, F.PORTAL.z), undefined, { fov: 50 })
    this.set(rt, 'v7_lens_done')
    this.lock(rt, false)
  }

  private async sceneCh1Keychain(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    this.walker.face(this.sora, rt.player.position)
    if (rt.player.position.distanceTo(this.sora.root.position) > 4) this.teleportSpawn(rt, 'booth')
    await this.talkShot(rt, 'ch1_stone', rt.player.position.clone().add(v(0, 0.7, 0)), undefined, { fov: 46 })
    // 夕方：準備がおわる
    await this.fade(true, 0.7)
    this.ch.tower.setTime(17, 10)
    await this.wait(0.3)
    await this.fade(false, 0.7)
    await this.talk(rt, 'ch1_evening')
    this.soraFollow()
    this.lock(rt, false)
    const stall = this.ch.stall
    this.setPhase('keychain', [{ pos: v(KEY_STALL_X, 2.2, stall.buy.z), label: '星のキーホルダー' }])
    await this.waitF(stall.buy, 2.2, '買う')
    if (!this.alive) return
    this.lock(rt, true)
    stall.takeOne()
    stall.takeOne()
    this.boughtToday = true
    void rt.cinematic({ look: stall.showcase, hold: Infinity, inSec: 1.0, fov: 40 })
    this.showKeychain(rt, true)
    await this.talk(rt, 'ch1_buy')
    rt.endCinematic()
    this.showKeychain(rt, false)
    this.set(rt, 'v7_keychain')
    this.lock(rt, false)
  }

  private async sceneCh1Promise(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    await this.fade(true, 0.9)
    this.setPart('night', rt, false)
    this.ch.tower.setTime(20, 30)
    this.teleportSpawn(rt, 'night_plaza')
    this.placeSora(rt.player.position.clone().add(v(1.2, 0, 0.6)), faceYaw(rt.player.position, v(0, 0, -10)))
    this.set(rt, 'v7_promise')
    await this.fade(false, 0.9)
    await rt.chapter()
    await this.talk(rt, 'ch1_night')
    this.soraFollow()
    this.lock(rt, false)
  }

  // ================================================================== 2 章：空のひび

  private async sceneCh2(rt: StageRuntime): Promise<void> {
    if (this.part !== 'night') this.setPart('night', rt, false)
    this.sky.reset()
    this.soraFollow()
    this.setPhase('night_walk', [{ pos: v(KEY_STALL_X - 2, 2.6, 2.0), label: '屋台' }])
    await this.talk(rt, 'ch2_walk')
    // 屋台の明かりの中を歩く（屋台の列に近づくか、少し歩いたら）
    const t0 = this.clock.time
    await this.until(() => rt.player.position.x > 7 || this.clock.time - t0 > 22)
    if (!this.alive) return
    this.lock(rt, true)
    this.ch.tower.setTime(20, 40)
    // 時計台のてっぺんにトワ
    const top = TOWER.towa.pos
    this.showTowa(top, v(1.5, 0, 6), 'idle')
    this.towa.setRim('#b08cff', 0.9)
    void rt.cinematic({ look: top.clone().add(v(0, 1.1, 0)), from: v(1.6, 2.0, 1.0), hold: Infinity, inSec: 1.6, fov: 34, marker: { pos: top.clone().add(v(0, 2.3, 0)), label: '時計台' } })
    await this.talk(rt, 'ch2_towa')
    // ランプを空へ → 空のひび → 黒い輪
    this.towa.setPose('raiseLamp')
    this.sky.start(1.15)
    rt.endCinematic(true)
    void rt.cinematic({ look: this.fs.orum.center.clone(), from: v(0.6, 1.6, 9.0), hold: Infinity, inSec: 1.4, fov: 60 })
    await this.until(() => this.sky.done || !this.sky.running)
    await this.talk(rt, 'ch2_tear')
    rt.endCinematic()
    await this.wait(0.6)
    // 黒い手 3 本
    this.startHands(rt, 'escape')
    await this.talk(rt, 'ch2_hands')
    this.lock(rt, false)
    this.soraMode = 'spot'
    this.soraSpot.pos.copy(this.sora.root.position)
    this.setPhase('escape')
    // 8時40分 → 41分（60 秒）
    const total = 60
    const start = this.clock.time
    await this.until(
      () => {
        const left = total - (this.clock.time - start)
        const s = Math.max(0, Math.ceil(left))
        this.badge?.set(`8:40　のこり ${s}秒`, left / total)
        this.ch.tower.setTime(20, 40 + Math.min(1, (this.clock.time - start) / total))
        return left <= 0
      },
      () => {},
    )
    this.badge?.set(null)
    if (!this.alive) return
    await this.touchAndLoop(rt, 'ch2_touch', 'v7_rewind1')
  }

  /** 8時41分：手が石にふれそうになる → 白くとぶ → 朝（flag を立てる） */
  private async touchAndLoop(rt: StageRuntime, lineKey: string, flag: string): Promise<void> {
    this.lock(rt, true)
    this.ch.tower.setTime(20, 41)
    const id = this.hands.ids.find((h) => this.hands.state(h) !== 'cut') ?? null
    const ore = rt.player.position.clone().add(v(0, 0.7, 0.15))
    if (id) this.hands.reachTo(id, ore, 1.0)
    else {
      this.hands.spawn('touch', rt.player.position.clone().add(v(1.2, 0, 1.2)))
      this.hands.reachTo('touch', ore, 1.2)
    }
    this.handsMode = 'none'
    void rt.cinematic({ look: ore, hold: Infinity, inSec: 0.8, fov: 42 })
    await this.talk(rt, lineKey)
    rt.oreGlow(2.4)
    await this.loop(rt, flag)
    rt.endCinematic(true)
  }

  /** ループ（白くとぶ → 朝へ）。光のつぶが減る（flag） */
  private loop(rt: StageRuntime, flag: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const fx = this.fx
      const swap = () => {
        rt.story.set(flag, true)
        this.stopHands()
        this.hideTowa()
        this.lensToday = false
        this.boughtToday = false
        this.walker.clear()
        const step = step2086(this.f)
        this.step = step
        this.prepare(step, rt)
        this.teleportSpawn(rt, 'loop_morning')
        rt.endCinematic(true)
      }
      if (!fx) {
        swap()
        resolve()
        return
      }
      fx.play({
        at: rt.player.position.clone().add(v(0, 0.55, 0.1)),
        onOre: (x) => rt.oreGlow(x),
        onSwap: swap,
        onDone: () => resolve(),
      })
    })
  }

  // ================================================================== 黒い手のあそび

  private startHands(rt: StageRuntime, mode: HandsMode): void {
    this.handsMode = mode
    this.handT = 0
    this.handHits = 0
    this.handsCut = 0
    const p = rt.player.position
    if (mode === 'escape' || mode === 'cut') {
      const ring = [v(4, 0, -3), v(-4.5, 0, -1), v(0.5, 0, 4.5)]
      ring.forEach((o, i) => {
        const id = `hand${i}`
        const base = p.clone().add(o).setY(0)
        this.hands.spawn(id, base)
        this.handClock[id] = 1.4 + i * 1.3
        this.addHandTarget(rt, id)
      })
    }
  }

  private addHandTarget(rt: StageRuntime, id: string): void {
    const pt = this.hands.point(id)
    if (!pt) return
    rt.chrono.add({
      id: 'chrono_' + id,
      kind: 'ura',
      label: '黒い手',
      point: pt,
      radius: 0.9,
      enabled: true,
      range: 16,
      onAct: () => {
        // 時空裂きを持っていれば、止まっている手だけ裂ける（12 章）
        if (this.handsMode === 'cut' && this.hands.isStuck(id)) {
          this.hands.cut(id)
          rt.chrono.remove('chrono_' + id)
          this.handsCut++
          rt.shake(0.4)
          if (this.handsCut === 1) void this.talk(rt, 'ch12_hand_cut')
        } else this.hands.passThrough(id)
      },
      onPassThrough: () => this.hands.passThrough(id),
    })
  }

  private stopHands(): void {
    for (const id of this.hands.ids) {
      this.rt?.chrono.remove('chrono_' + id)
    }
    this.hands.clear()
    this.handsMode = 'none'
  }

  private updateHands(dt: number, rt: StageRuntime): void {
    if (this.handsMode === 'none' || this.busy) return
    const p = rt.player.position
    this.handT += dt
    for (const id of this.hands.ids) {
      const st = this.hands.state(id)
      if (st === 'cut' || st === 'gone' || st === 'retract') continue
      this.handClock[id] = (this.handClock[id] ?? 2) - dt
      const ph = this.hands.slamPhase(id)
      if (st === 'slam' && ph) {
        // たたいた瞬間に近くにいたら、はじかれる（体力は減らない）
        if (ph.phase === 'strike' && ph.k > 0.6 && !(this.handClock[id + '_hit'] > 0)) {
          const hp = this.hands.handPos(id)
          if (hp && Math.hypot(hp.x - p.x, hp.z - p.z) < 1.5 && Math.abs(hp.y - p.y) < 2) {
            this.handClock[id + '_hit'] = 1.2
            this.knock(rt, hp)
          }
        }
        if (ph.phase === 'stuck' && this.handsMode === 'cut') continue
        if (ph.phase !== 'done' && ph.phase !== 'recover') continue
      }
      this.handClock[id + '_hit'] = Math.max(0, (this.handClock[id + '_hit'] ?? 0) - dt)
      if (this.handClock[id] > 0) {
        if (st !== 'chase' && st !== 'slam') this.hands.chase(id, p, this.handsMode === 'escape' ? 3.2 : 2.6)
        continue
      }
      // ふりおろす（少し先を読む）
      const lead = this.tmp.set(-Math.sin(rt.player.facing), 0, -Math.cos(rt.player.facing)).multiplyScalar(rt.player.speed * 0.5)
      const at = p.clone().add(lead).setY(groundY(rt.phys, p, p.y))
      this.hands.slam(id, at, this.handsMode === 'cut' ? { stuck: 2.6 } : {})
      this.handClock[id] = this.handsMode === 'escape' ? 3.4 + Math.random() * 1.2 : 4.2 + Math.random()
    }
  }

  private knock(rt: StageRuntime, from: THREE.Vector3): void {
    const p = rt.player.position
    const dx = p.x - from.x
    const dz = p.z - from.z
    const d = Math.hypot(dx, dz) || 1
    rt.player.burstMove((dx / d) * 7, (dz / d) * 7, 0.35)
    rt.hud.flash('danger')
    rt.shake(0.5)
    this.handHits++
  }

  // ================================================================== 3 章：また、同じ朝

  private async sceneCh3(rt: StageRuntime): Promise<void> {
    await this.runMorning(rt, 2)
    if (!this.alive) return
    await rt.chapter()
    const sora = this.sora.root.position
    this.setPhase('loop_greet', [{ pos: sora.clone().setY(sora.y + 1.9), label: 'ソラ' }])
    await this.waitNear(rt, sora, 3.4)
    if (!this.alive) return
    this.lock(rt, true)
    this.props.balloon.def.enabled = false
    this.walker.face(this.sora, rt.player.position)
    await this.talkShot(rt, 'ch3_greet', sora.clone().add(v(0, 1.4, 0)), undefined, { fov: 44 })
    await this.talk(rt, 'ch3_pocket_hint')
    this.lock(rt, false)
    this.setPhase('pocket')
    await this.waitF(rt.player.position, 999, 'ポケットを見る')
    if (!this.alive) return
    this.lock(rt, true)
    this.showKeychain(rt, true)
    void rt.cinematic({ look: rt.player.position.clone().add(v(0, 0.7, 0)), hold: 2.6, inSec: 0.8, fov: 36 })
    await this.talk(rt, 'ch3_pocket')
    await this.talkShot(rt, 'ch3_pocket', this.ch.stall.showcase, undefined, { fov: 38, label: '屋台の星のキーホルダー' }).catch(() => undefined)
    this.showKeychain(rt, false)
    // 石の音（コチ、コチ）
    for (let i = 0; i < 4; i++) {
      rt.oreGlow(1.0 + i * 0.15)
      await this.wait(0.5)
    }
    await this.talk(rt, 'ch3_tick')
    await this.talk(rt, 'ch3_think')
    this.set(rt, 'v7_loop_seen')
    this.lock(rt, false)
    await rt.chapter()
  }

  // ================================================================== 4 章：すりぬける怪物

  private async sceneCh4Hide(rt: StageRuntime): Promise<void> {
    if (rt.player.position.y > -1 && this.phase !== 'hide') {
      // 3 章の続きなら朝の型は出さない
    }
    this.lock(rt, true)
    await this.talk(rt, 'ch4_hide')
    this.lock(rt, false)
    const top = UNDER.stairsTop
    this.setPhase('hide', [{ pos: top.clone().add(v(0, 3.4, 0)), label: '地下通路の入口' }])
    await this.waitNear(rt, UNDER.hide.pos, 2.4, 1.6)
    if (!this.alive) return
    this.lock(rt, true)
    this.hideSora()
    await this.talk(rt, 'ch4_wait')
    await this.fade(true, 1.0)
    this.setPart('night', rt, true)
    this.ch.tower.setTime(20, 39)
    this.teleport(rt, UNDER.hide.pos, UNDER.hide.yaw)
    this.setPhase('hide_wait')
    await this.wait(0.6)
    await this.fade(false, 1.0)
    // 上からソラの声 → 階段を下りてくる
    this.sora.root.position.copy(UNDER.stairsTop)
    this.sora.root.visible = true
    void this.soraWalk([UNDER.stairsBottom, UNDER.sora.pos], 1.6, UNDER.handHole.clone().setY(UNDER.floorY))
    await this.talk(rt, 'ch4_voice')
    await this.until(() => this.soraMode !== 'walk')
    // 天井がやぶれて、黒い手がソラをつかむ
    this.ch.tower.setTime(20, 40)
    for (let k = 0; k <= 10; k++) {
      this.ch.underground.breach(k / 10)
      rt.shake(0.15)
      await this.wait(0.12)
    }
    const hp = UNDER.handHole.clone()
    this.hands.spawn('cellar', hp.clone().setY(UNDER.ceilY + 0.2), { from: 'sky', size: 0.8, rest: hp.clone().setY(UNDER.floorY + 1.4), noDecal: true, normal: v(0, -1, 0) })
    await this.wait(0.8)
    this.hands.reachTo('cellar', this.sora.root.position.clone().add(v(0, 1.0, 0)), 0.8)
    this.sora.setPose('hold')
    void rt.cinematic({ look: this.sora.root.position.clone().add(v(0, 1.2, 0)), hold: 2.2, inSec: 0.7, fov: 50 })
    await this.talk(rt, 'ch4_grab')
    this.addHandTarget(rt, 'cellar')
    this.lock(rt, false)
    // J ですりぬける → ソラの前へ飛び出す
    this.setPhase('save_sora', [{ pos: this.sora.root.position.clone().add(v(0, 2.0, 0)), label: 'ソラ' }])
    let passed = false
    const off = this.onPass(() => (passed = true))
    await this.until(() => passed, () => (passed = true))
    off()
    if (!this.alive) return
    await this.talk(rt, 'ch4_pass')
    await this.waitNear(rt, this.sora.root.position, 1.8, 2)
    if (!this.alive) return
    this.lock(rt, true)
    await this.talk(rt, 'ch4_jump')
    this.hands.reachTo('cellar', rt.player.position.clone().add(v(0, 0.7, 0)), 1.0)
    this.sora.setPose('idle')
    await this.talk(rt, 'ch4_after2')
    rt.oreGlow(2.4)
    await this.loop(rt, 'v7_rewind2')
    this.ch.underground.resetBreach()
    this.lock(rt, false)
  }

  private passListeners: Array<() => void> = []
  /** すりぬけ（ura に J）を待つ */
  private onPass(fn: () => void): () => void {
    this.passListeners.push(fn)
    return () => {
      const i = this.passListeners.indexOf(fn)
      if (i >= 0) this.passListeners.splice(i, 1)
    }
  }

  private hideSora(): void {
    this.walker.stop(this.sora)
    this.soraMode = 'hidden'
    this.sora.root.visible = false
  }

  private async sceneCh4Tower(rt: StageRuntime): Promise<void> {
    await this.runMorning(rt, 3)
    if (!this.alive) return
    this.lock(rt, true)
    await this.talk(rt, 'ch4_tower_go')
    this.lock(rt, false)
    this.setPhase('tower_go', [{ pos: TOWER.foot.clone().add(v(0, 2.2, 0)), label: '時計台' }])
    await this.waitNear(rt, TOWER.foot, 3.2)
    if (!this.alive) return
    this.lock(rt, true)
    this.props.balloon.def.enabled = false
    await this.talk(rt, 'ch4_wait_night')
    await this.fade(true, 1.0)
    this.setPart('night', rt, false)
    this.ch.tower.setTime(20, 39)
    this.teleport(rt, TOWER.foot, faceYaw(TOWER.foot, v(TOWER.cx, 0, TOWER.cz)))
    this.hideSora()
    this.showTowa(TOWER.towa.pos, v(1.5, 0, 6), 'raiseLamp')
    this.sky.finish(rt)
    await this.wait(0.4)
    await this.fade(false, 1.0)
    void rt.cinematic({ look: TOWER.towa.pos.clone().add(v(0, 1, 0)), hold: 2.2, inSec: 1.2, fov: 38, marker: { pos: TOWER.towa.pos.clone().add(v(0, 2.3, 0)), label: 'トワ' } })
    await this.talk(rt, 'ch4_climb')
    this.lock(rt, false)
    // のぼる（黒い手が壁をなでる）
    this.handsMode = 'climb'
    this.climbLanding.copy(TOWER.foot)
    this.handT = 0
    for (const h of this.ch.tower.hooks) h.enabled = true
    this.setPhase('tower_climb', [{ pos: this.ch.tower.hooks[0].point.clone(), label: '金具' }])
    await this.until(
      () => {
        const next = this.ch.tower.hooks.find((h) => (h.landing?.y ?? 0) > rt.player.position.y + 0.3)
        this.marks = next ? [{ pos: next.point.clone().add(v(0, 0.4, 0)), label: next.id === 'clock_hook_top' ? 'てっぺん' : '金具' }] : []
        return rt.player.position.y > TOWER.deckY - 0.5
      },
      () => this.teleport(rt, TOWER.hooks[TOWER.hooks.length - 1].landing.clone(), Math.PI),
    )
    this.handsMode = 'none'
    for (let i = 0; i < TOWER.sweeps.length; i++) this.ch.tower.setSweepWarn(i, 0)
    this.hands.clear()
    if (!this.alive) return
    // てっぺん：トワと話す
    this.lock(rt, true)
    this.showTowa(v(8.6, TOWER.deckY, -20.4), rt.player.position, 'idle')
    void rt.cinematic({ look: this.towa.root.position.clone().add(v(0, 1.4, 0)), hold: Infinity, inSec: 1.2, fov: 44 })
    await this.talk(rt, 'ch4_towa')
    rt.endCinematic()
    await this.talk(rt, 'ch4_ring_hint')
    this.lock(rt, false)
    // 黒い輪に J（すりぬける）
    const orumPt = this.fs.orum.center.clone()
    let passed = false
    rt.chrono.add({
      id: 'chrono_orum',
      kind: 'ura',
      label: '黒い輪',
      point: orumPt,
      radius: 40,
      enabled: true,
      range: 600,
      noLineOfSight: true,
      onAct: () => (passed = true),
      onPassThrough: () => (passed = true),
    })
    this.setPhase('tower_ring', [{ pos: orumPt, label: '黒い輪' }])
    await this.until(() => passed, () => (passed = true))
    rt.chrono.remove('chrono_orum')
    if (!this.alive) return
    this.lock(rt, true)
    await this.talk(rt, 'ch4_shield')
    // 8時41分
    this.hands.spawn('tower', v(TOWER.cx + 2, TOWER.deckY + 8, TOWER.cz - 2), { from: 'sky', size: 1.1 })
    await this.wait(0.6)
    await this.touchAndLoop(rt, 'ch2_touch', 'v7_rewind3')
    // 四度目の朝：ベンチにすわりこむ
    this.lock(rt, true)
    const b = this.ch.bench
    this.teleport(rt, b.front, faceYaw(b.front, b.seat.pos))
    this.hideSora()
    await this.fade(false, 0.4)
    void rt.cinematic({ look: b.seat.pos.clone().add(v(0, 0.4, 0)), from: b.front.clone().add(v(1.8, 1.4, 2.4)), hold: Infinity, inSec: 1.2, fov: 40 })
    await this.talk(rt, 'ch4_bench')
    rt.endCinematic()
    this.placeSora('booth')
    this.lock(rt, false)
    await rt.chapter()
  }

  // ================================================================== 5 章：ソラに話す

  private async sceneCh5Confide(rt: StageRuntime): Promise<void> {
    if (this.boughtToday || !this.f('v7_rewind3')) {
      /* 4 章の続き */
    }
    const sora = this.sora.root.position
    this.setPhase('confide', [{ pos: sora.clone().setY(sora.y + 1.9), label: 'ソラ' }])
    await this.waitNear(rt, sora, 3.4)
    if (!this.alive) return
    this.lock(rt, true)
    this.walker.face(this.sora, rt.player.position)
    await this.talkShot(rt, 'ch5_tell', sora.clone().add(v(0, 1.3, 0)), undefined, { fov: 44 })
    await this.talk(rt, 'ch5_show_hint')
    this.lock(rt, false)
    this.setPhase('show_keychain')
    await this.waitF(rt.player.position, 999, 'キーホルダーを見せる')
    if (!this.alive) return
    this.lock(rt, true)
    this.showKeychain(rt, true)
    void rt.cinematic({ look: rt.player.position.clone().add(v(0, 0.8, 0)), hold: Infinity, inSec: 0.9, fov: 40 })
    await this.talk(rt, 'ch5_show')
    rt.endCinematic()
    this.showKeychain(rt, false)
    this.set(rt, 'v7_confided')
    this.lock(rt, false)
  }

  private async sceneCh5Door(rt: StageRuntime): Promise<void> {
    this.lens.set(true)
    this.ring.setWobble(0)
    const front = this.fs.markers.exhibit
    this.setPhase('door', [{ pos: v(F.PORTAL.x, F.PORTAL.y + 2.6, F.PORTAL.z), label: 'イドーのわっか' }])
    await this.waitF(front, 2.8, '記録をひらく')
    if (!this.alive) return
    this.lock(rt, true)
    this.placeSora('exhibit')
    this.teleport(rt, front, faceYaw(front, v(F.PORTAL.x, 0, F.PORTAL.z)))
    const ringC = v(F.PORTAL.x, F.PORTAL.y, F.PORTAL.z)
    this.ring.showUrl(V7_ART.recordNextmake, 2.2)
    void rt.cinematic({ look: ringC, hold: Infinity, inSec: 1.2, fov: 50 })
    for (let i = 0; i < 6; i++) {
      rt.oreGlow(1.2 + i * 0.2)
      await this.wait(0.35)
    }
    await this.talk(rt, 'ch5_record')
    for (let k = 0; k <= 20; k++) {
      this.fs.openRift(k / 20)
      this.ring.setRift(k / 20)
      await this.wait(0.05)
    }
    await this.talk(rt, 'ch5_go')
    rt.endCinematic(true)
    this.set(rt, 'v7_door1')
    rt.save('exhibit')
    this.lock(rt, false)
    this.travel(rt, '2026', 'v7_nextmake')
  }

  private travel(rt: StageRuntime, to: '2026' | '1186', spawn: string): void {
    const r = rt.travel({ to, cause: 'ido_ring', spawn })
    if (!r.ok) rt.hud.toast(r.reason)
  }

  // ================================================================== 8 章：消えたほこら

  private async sceneCh8Back(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    this.placeSora('exhibit')
    this.walker.face(this.sora, rt.player.position)
    await this.talkShot(rt, 'ch8_back', this.sora.root.position.clone().add(v(0, 1.3, 0)), undefined, { fov: 46 })
    this.soraFollow()
    this.lock(rt, false)
    const kb = this.ch.site.kanban
    this.setPhase('to_site', [{ pos: SITE.kanban.pos.clone().add(v(0, 2.0, 0)), label: '路地のあと' }])
    await this.waitNear(rt, kb.stand, 4.5)
    if (!this.alive) return
    this.lock(rt, true)
    void rt.cinematic({ look: v(17, 16, -46), from: v(0.5, 1.6, -38), hold: 2.6, inSec: 1.4, fov: 62 })
    await this.talk(rt, 'ch8_building')
    kb.setSurge(1)
    await this.showRecord(rt, '2027年の記録', 'NEXTMAKE 前のかんばん', '古いほこらを取りこわし、NEXTMAKE の新しいビルを建てる。ほこらの中の古い箱は、ゆくえ不明。', V7_ART.record2027, 'ch8_record')
    await this.showRecord(rt, '源兵衛の書', '江戸のからくり職人の書（記録にうつっていたページ）', '青いかけらの絵の次のページ：小さな青いからくりが、爪で空を切っている絵。「時を裂く爪」', V7_ART.bookPage2, 'ch8_book')
    kb.setSurge(0)
    this.set(rt, 'v7_building_seen')
    this.lock(rt, false)
  }

  private async sceneCh8Dial(rt: StageRuntime): Promise<void> {
    if (this.soraMode !== 'follow') this.placeSora('exhibit')
    const front = this.fs.markers.exhibit
    this.setPhase('to_ring_dial', [{ pos: v(F.PORTAL.x, F.PORTAL.y + 2.6, F.PORTAL.z), label: 'イドーのわっか' }])
    await this.waitNear(rt, front, 3.0)
    if (!this.alive) return
    this.lock(rt, true)
    this.placeSora('exhibit')
    this.teleport(rt, front, faceYaw(front, v(F.PORTAL.x, 0, F.PORTAL.z)))
    this.ch.dial.setDial(true)
    void rt.cinematic({ look: this.ch.dial.center.clone(), hold: Infinity, inSec: 1.2, fov: 40, marker: { pos: this.ch.dial.center.clone().add(v(0, 0.6, 0)), label: '年代ダイヤル' } })
    await this.talk(rt, 'ch8_dial')
    rt.endCinematic()
    this.lock(rt, false)
    await this.runDial(rt, 2026, 'NEXTMAKE 前のかんばん → 路地')
    if (!this.alive) return
    this.lock(rt, true)
    this.ring.showUrl(V7_ART.recordNextmake, 1.4)
    await this.talk(rt, 'ch8_dial_ok')
    for (let k = 0; k <= 20; k++) {
      this.fs.openRift(k / 20)
      await this.wait(0.04)
    }
    this.set(rt, 'v7_dial_seen')
    rt.save('exhibit')
    this.lock(rt, false)
    this.travel(rt, '2026', 'v7_alley')
  }

  /** 年代ダイヤルを回して target の年にそろえ、F で決める */
  private runDial(rt: StageRuntime, target: number, sub: string): Promise<void> {
    const logic = new YearDialLogic({ start: 2086, target })
    rt.hud.toast('← → でダイヤルを回して、石の音と記録の音をそろえよう', 4)
    this.ch.dial.setDial(true)
    this.dialPanel?.show({ year: logic.year, sub })
    this.setPhase('dial')
    return new Promise<void>((resolve) => {
      this.dial = { logic, resolve }
      this.skipReq = false
    })
  }

  private updateDial(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    const d = this.dial
    if (!d) return
    const x = Math.abs(frame.move.x) > 0.5 ? frame.move.x : frame.look.x
    const dir: -1 | 0 | 1 = x > 0.5 ? 1 : x < -0.5 ? -1 : 0
    // 右で年が進む（未来）、左で昔へ
    d.logic.hold(dir, dt)
    this.dialPanel?.press(dir)
    this.dialPanel?.setYear(d.logic.year)
    this.dialPanel?.setMatch(d.logic.match)
    this.dialPanel?.setDetune(d.logic.detune)
    this.dialPanel?.update(dt)
    this.ch.dial.setYear(d.logic.year)
    this.ch.dial.setMatch(d.logic.match)
    rt.oreGlow(0.4 + d.logic.match * 1.4)
    if (d.logic.locked && (frame.pressed.has('interact') || frame.pressed.has('claw_fire'))) this.finishDial()
  }

  private finishDial(): void {
    const d = this.dial
    if (!d) return
    this.dial = null
    this.dialPanel?.hide()
    d.resolve()
  }

  // ================================================================== 10 章：ひらいた箱と、ひらいた思い出

  private async sceneCh10Shrine(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    this.placeSora('exhibit')
    this.walker.face(this.sora, rt.player.position)
    await this.talk(rt, 'ch10_back')
    this.soraFollow()
    this.lock(rt, false)
    const site = this.ch.site
    site.setVariant('building')
    this.setPhase('to_court', [{ pos: SITE.kanban.pos.clone().add(v(0, 2.0, 0)), label: '路地のあと' }])
    await this.waitNear(rt, site.kanban.stand, 5.0)
    if (!this.alive) return
    this.lock(rt, true)
    // 景色が変わる（前の景色を重ねる。覚えているのはネクマックスだけ）
    void rt.cinematic({ look: v(14, 6, -45), from: v(1.0, 2.2, -36.5), hold: Infinity, inSec: 1.0, fov: 64 })
    await this.wait(0.8)
    rt.oreGlow(2)
    await site.ghostSwap('courtyard', 3.4)
    rt.endCinematic()
    // 中庭のほこら
    this.teleport(rt, v(11.5, 0, -42.0), faceYaw(v(11.5, 0, -42), SITE.shrine.pos))
    this.placeSora(v(12.8, 0, -41.0), faceYaw(v(12.8, 0, -41), SITE.shrine.pos))
    await this.talkShot(rt, 'ch10_court', site.shrine.boxPos.clone().add(v(0, 0.4, 0)), v(13.6, 1.8, -42.6), { fov: 46 })
    this.lock(rt, false)
    site.shrine.setLockPulse(0.6)
    this.setPhase('lock', [{ pos: site.shrine.boxPos.clone().add(v(0, 1.4, 0)), label: 'ほこら' }])
    await this.waitF(site.shrine.front, 2.6, '錠前')
    if (!this.alive) return
    this.lock(rt, true)
    this.teleport(rt, site.shrine.front, faceYaw(site.shrine.front, SITE.shrine.pos))
    void rt.cinematic({ look: site.shrine.boxPos.clone(), from: site.shrine.boxPos.clone().add(v(1.9, 0.5, 0.5)), hold: Infinity, inSec: 1.0, fov: 40 })
    site.shrine.setLockPulse(1)
    for (let i = 0; i < 4; i++) {
      rt.oreGlow(1.4)
      await this.wait(0.5)
    }
    await this.talk(rt, 'ch10_lock')
    await site.shrine.openBox()
    site.shrine.setLockPulse(0)
    await this.talk(rt, 'ch10_claw')
    site.shrine.takeClaw()
    this.set(rt, 'v7_rift_claw')
    rt.oreGlow(2.4)
    rt.hud.flash('success')
    await this.talk(rt, 'ch10_flow')
    rt.endCinematic()
    // ひとふり：空中に切れ目
    const at = rt.player.position.clone().add(v(-Math.sin(rt.player.facing) * 1.6, 1.2, -Math.cos(rt.player.facing) * 1.6))
    const slit = rt.chrono.slit(at, { width: 1.2, height: 2.4, seconds: 3.5 })
    slit.setOpen(1)
    rt.shake(0.3)
    await this.talkShot(rt, 'ch10_slit', at, undefined, { fov: 48 })
    rt.hud.banner('時空裂きのNMクローを手に入れた！', 'success', 3)
    this.lock(rt, false)
  }

  private async sceneCh10Practice(rt: StageRuntime): Promise<void> {
    const site = this.ch.site
    site.setVariant('courtyard')
    site.shrine.takeClaw()
    // 1. 工具箱を止める
    this.placeSora(SITE.toolbox.hand.clone().setY(SITE.toolbox.deck.h).add(v(0.45, 0, 0)), -Math.PI / 2)
    this.setPhase('toolbox', [{ pos: SITE.toolbox.hand.clone().add(v(0, 1.0, 0)), label: '工具箱' }])
    if (rt.player.position.distanceTo(SITE.toolbox.hand) > 7) this.teleport(rt, v(15.6, 0, -41.4), -Math.PI / 2 * -1 + Math.PI)
    let stopped = false
    rt.chrono.add({
      id: 'chrono_toolbox',
      kind: 'freeze',
      label: '工具箱',
      point: site.toolbox.point,
      radius: 0.5,
      enabled: true,
      seconds: 4,
      onAct: () => {
        site.toolbox.freeze(true)
        if (site.toolbox.state === 'frozen') stopped = true
      },
      onThaw: () => site.toolbox.freeze(false),
    })
    for (;;) {
      if (!this.alive) return
      site.toolbox.reset()
      this.lock(rt, true)
      await this.talk(rt, 'ch10_toolbox')
      this.lock(rt, false)
      site.toolbox.drop()
      await this.until(() => stopped || site.toolbox.state === 'ground', () => {
        site.toolbox.freeze(true)
        stopped = true
      })
      if (stopped) break
      await this.talk(rt, 'ch10_toolbox_again')
      await this.wait(0.6)
    }
    // 工具箱の点は毎フレーム動くので、更新して渡し続ける（point は getter のコピー）
    this.lock(rt, true)
    void rt.cinematic({ look: site.toolbox.point.clone(), hold: Infinity, inSec: 0.7, fov: 36 })
    await this.talk(rt, 'ch10_toolbox_ok')
    rt.endCinematic()
    rt.chrono.remove('chrono_toolbox')
    rt.chrono.thaw()
    site.toolbox.reset()
    // 2. ゆらぎを裂く → 裏側の足場
    site.setSeam(0.9)
    await this.talkShot(rt, 'ch10_seam', site.seamPoint, undefined, { fov: 48, label: 'ゆらぎ' })
    this.lock(rt, false)
    let uraOpen = 0
    rt.chrono.add({
      id: 'chrono_seam',
      kind: 'seam',
      label: 'ゆらぎ',
      point: site.seamPoint,
      radius: 0.6,
      enabled: true,
      onAct: () => {
        rt.chrono.slit(site.seamPoint.clone(), { width: 1.1, height: 2.4, seconds: 9 }).setOpen(1)
        uraOpen = 9
        site.setUra(1)
        void this.talk(rt, 'ch10_ura')
      },
    })
    const onBalcony = () => rt.player.position.y > SITE.balcony.y - 0.3 && rt.player.position.z < SITE.balcony.z1 + 0.2 && rt.player.position.x > SITE.balcony.x0
    this.setPhase('seam', [{ pos: site.seamPoint.clone().add(v(0, 1.6, 0)), label: 'ゆらぎ' }])
    await this.until(
      () => {
        if (uraOpen > 0) {
          this.setPhase('ura_climb', [{ pos: v(SITE.balcony.x1 - 1, SITE.balcony.y + 1.2, (SITE.balcony.z0 + SITE.balcony.z1) / 2), label: '縁側' }])
          uraOpen -= this.lastDt
          if (uraOpen <= 0) {
            site.setUra(0)
            this.setPhase('seam', [{ pos: site.seamPoint.clone().add(v(0, 1.6, 0)), label: 'ゆらぎ' }])
          }
        }
        return onBalcony()
      },
      () => this.teleport(rt, v(SITE.balcony.x1 - 1.2, SITE.balcony.y, (SITE.balcony.z0 + SITE.balcony.z1) / 2), Math.PI / 2),
    )
    rt.chrono.remove('chrono_seam')
    if (!this.alive) return
    await this.wait(1.2)
    site.setUra(0)
    site.setSeam(0)
    // 3. 回る歯車を止めて足場に → からくり時計の足場へ
    this.lock(rt, true)
    await this.talkShot(rt, 'ch10_gear', site.gear.point, undefined, { fov: 50, label: 'からくりの大歯車' })
    this.lock(rt, false)
    rt.chrono.add({
      id: 'chrono_gear',
      kind: 'freeze',
      label: '回る歯車',
      point: site.gear.point,
      radius: 1.2,
      enabled: true,
      seconds: 8,
      onAct: () => site.gear.freeze(true),
      onThaw: () => site.gear.freeze(false),
    })
    const goal = site.goal
    this.setPhase('gear', [
      { pos: site.gear.point.clone().add(v(0, 2.0, 0)), label: '歯車' },
      { pos: goal.clone().add(v(0, 1.4, 0)), label: 'からくり時計' },
    ])
    await this.until(
      () => Math.hypot(rt.player.position.x - goal.x, rt.player.position.z - goal.z) < 1.6 && rt.player.position.y > goal.y - 0.4,
      () => this.teleport(rt, goal.clone(), Math.PI / 2),
    )
    rt.chrono.remove('chrono_gear')
    rt.chrono.thaw()
    site.gear.freeze(false)
    if (!this.alive) return
    this.lock(rt, true)
    this.placeSora(v(11.6, 0, -44.2), faceYaw(v(11.6, 0, -44.2), goal))
    await this.talk(rt, 'ch10_goal')
    this.set(rt, 'v7_rift_practice')
    this.lock(rt, false)
  }

  private lastDt = 1 / 60

  private async sceneCh10Memory(rt: StageRuntime): Promise<void> {
    const site = this.ch.site
    this.lock(rt, true)
    await this.talk(rt, 'ch10_memory_click')
    site.gear.freeze(false)
    rt.oreGlow(2.2)
    await this.fade(true, 0.8, '#fff')
    const mems: Array<[string, string, [string, string]]> = [
      ['mem_wake', V7_ART.memLabWake, ['思い出', '研究所の目ざめ']],
      ['mem_garden', V7_ART.memGarden, ['思い出', '研究所の庭']],
      ['mem_lamp', V7_ART.memMotherLamp, ['思い出', 'トワのお母さんのランプ']],
      ['mem_please', V7_ART.memPlease, ['思い出', '「時間をもどして」']],
      ['mem_matane', V7_ART.memMatane, ['思い出', 'また明日ね']],
      ['mem_sky', V7_ART.memNightSky, ['思い出', '仮面の人']],
    ]
    await this.fade(false, 0.3, '#fff')
    for (const [key, img, place] of mems) {
      if (!this.alive) return
      await this.playFlashback(this.L(key) as FlashbackLine[], img, place)
    }
    // 佐伯さんの声（ふたの裏の小さな板が光る）
    this.teleport(rt, site.shrine.front, faceYaw(site.shrine.front, SITE.shrine.pos))
    site.shrine.setPlateGlow(1)
    void rt.cinematic({ look: site.shrine.boxPos.clone(), from: site.shrine.boxPos.clone().add(v(1.6, 0.6, 0.4)), hold: Infinity, inSec: 1.0, fov: 40 })
    await this.talk(rt, 'ch10_saeki')
    rt.endCinematic()
    site.shrine.setPlateGlow(0)
    this.placeSora(site.shrine.front.clone().add(v(0.2, 0, 0.8)), faceYaw(site.shrine.front, rt.player.position))
    await this.talk(rt, 'ch10_after')
    this.set(rt, 'v7_memory_open')
    this.lock(rt, false)
  }

  // ---- 中庭の決闘
  private async sceneCh10Duel(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    await this.fade(true, 0.8)
    this.setPart('evening', rt, false)
    this.ch.tower.setTime(17, 40)
    this.teleport(rt, v(13.4, 0, -40.0), faceYaw(v(13.4, 0, -40), v(13.4, 0, -46)))
    this.placeSora(v(15.6, 0, -38.4), faceYaw(v(15.6, 0, -38.4), v(13, 0, -45)))
    await this.wait(0.3)
    await this.fade(false, 0.8)
    // 中庭の空にひび → トワ
    const towaAt = v(13.4, 2.2, -46.4)
    const slit = rt.chrono.slit(towaAt.clone().add(v(0, 1.0, -1.2)), { width: 2.2, height: 4.2, normal: v(0, 0, 1) })
    slit.setOpen(1)
    this.showTowa(towaAt, rt.player.position, 'idle')
    rt.shake(0.4)
    void rt.cinematic({ look: towaAt.clone().add(v(0, 1.3, 0)), hold: Infinity, inSec: 1.2, fov: 46, marker: { pos: towaAt.clone().add(v(0, 2.4, 0)), label: 'トワ' } })
    await this.talk(rt, 'ch10_towa')
    rt.endCinematic()
    this.lock(rt, false)
    // 戦い：影（K で切れる）・影の弾（J で止める）・ランプの黒い糸（光ったら J で裂く、3 回）
    rt.combat.enabled = true
    rt.combat.setCheckpoint(v(13.4, 0, -40.0), Math.PI)
    this.duel = { thread: 0, window: 0, shots: [], fireT: 2.5, wave: 0 }
    rt.combat.showBossBar('トワ', 1)
    this.spawnShades(rt, 3)
    this.setPhase('duel', [{ pos: towaAt.clone().add(v(0, 2.4, 0)), label: 'トワ' }])
    void this.talk(rt, 'ch10_duel_cut')
    const thread: ChronoTarget = {
      id: 'chrono_thread',
      kind: 'ura',
      label: 'ランプの黒い糸',
      point: this.lamp.center(new THREE.Vector3()),
      radius: 0.6,
      enabled: false,
      range: 14,
      onAct: () => {
        const d = this.duel
        if (!d || d.window <= 0) return
        d.thread++
        d.window = 0
        rt.shake(0.5)
        rt.hud.flash('success')
        rt.combat.setBossBar(1 - d.thread / 3)
        this.lamp.setDark(d.thread < 3)
        if (d.thread < 3) this.spawnShades(rt, 2 + d.thread)
      },
    }
    this.threadTarget = thread
    rt.chrono.add(thread)
    await this.until(
      () => {
        const d = this.duel
        if (!d) return true
        return d.thread >= 3
      },
      () => {
        if (this.duel) this.duel.thread = 3
      },
    )
    rt.chrono.remove('chrono_thread')
    this.threadTarget = null
    for (const s of this.duel?.shots ?? []) {
      s.mesh.removeFromParent()
      rt.chrono.remove(s.id)
    }
    this.duel = null
    for (const e of rt.combat.alive('duel')) rt.combat.kill(e)
    rt.combat.showBossBar(null)
    if (!this.alive) return
    this.lock(rt, true)
    void rt.cinematic({ look: this.towa.root.position.clone().add(v(0, 1.3, 0)), hold: Infinity, inSec: 1.0, fov: 44 })
    await this.talk(rt, 'ch10_towa_leave')
    rt.endCinematic()
    this.hideTowa()
    this.lamp.setDark(true, true)
    slit.close()
    rt.combat.enabled = false
    this.set(rt, 'v7_towa_duel')
    this.lock(rt, false)
    await rt.chapter()
  }

  private spawnShades(rt: StageRuntime, n: number): void {
    const c = v(13.4, 0, -42.4)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random()
      const p = c.clone().add(v(Math.cos(a) * 3.2, 0, Math.sin(a) * 2.6))
      const h = rt.combat.spawn('mite', p, { tag: 'duel', style: SHADE_STYLE, leash: 9, hidden: true })
      rt.combat.appear(h)
    }
  }

  private updateDuel(dt: number, rt: StageRuntime): void {
    const d = this.duel
    if (!d || this.busy) return
    rt.combat.passive = rt.talking || rt.inCinematic
    const towaC = this.towa.root.position.clone().add(v(0, 1.3, 0))
    this.towa.root.position.y = 2.2 + Math.sin(this.clock.time * 1.4) * 0.15
    this.walker.turnToward(this.towa, rt.player.position, dt, 3)
    // 糸が光る時間（影が少ないとき、数秒ごと）
    const shades = rt.combat.alive('duel').length
    if (d.window > 0) d.window -= dt
    else if (shades <= 1) {
      d.fireT -= dt * 0.3
      if (Math.random() < dt * 0.5) d.window = 4.5
    }
    this.phase = d.window > 0 ? 'duel_thread' : 'duel'
    this.marks = d.window > 0 ? [{ pos: this.lamp.center(new THREE.Vector3()).add(v(0, 0.5, 0)), label: '黒い糸' }] : [{ pos: towaC.clone().add(v(0, 1.2, 0)), label: 'トワ' }]
    // 影の弾（ゆっくり飛ぶ黒い玉。止めてから K ではじき返せる）
    d.fireT -= dt
    if (d.fireT <= 0) {
      d.fireT = 3.2
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.15, 0.9), toneMapped: false }))
      mesh.position.copy(this.lamp.center(new THREE.Vector3()))
      this.fs.root.add(mesh)
      const vel = rt.player.position.clone().add(v(0, 0.7, 0)).sub(mesh.position).normalize().multiplyScalar(4.2)
      const id = `shot_${Math.round(this.clock.time * 100)}`
      const shot = { mesh, vel, frozen: false, id, life: 6 }
      d.shots.push(shot)
      rt.chrono.add({
        id,
        kind: 'freeze',
        label: '影の弾',
        point: mesh.position,
        radius: 0.4,
        enabled: true,
        seconds: 4,
        onAct: () => (shot.frozen = true),
        onThaw: () => (shot.frozen = false),
      })
      rt.combat.addHitTarget({
        id: id + '_hit',
        pos: mesh.position,
        radius: 0.6,
        enabled: true,
        onHit: () => {
          // 止めた弾を K でトワへはじき返す
          if (!shot.frozen) return
          shot.frozen = false
          shot.vel.copy(towaC).sub(mesh.position).normalize().multiplyScalar(9)
          shot.life = 3
          rt.chrono.remove(id)
        },
      })
    }
    for (let i = d.shots.length - 1; i >= 0; i--) {
      const s = d.shots[i]
      s.life -= dt
      if (!s.frozen) s.mesh.position.addScaledVector(s.vel, dt)
      const toPlayer = s.mesh.position.distanceTo(rt.player.position.clone().add(v(0, 0.6, 0)))
      const toTowa = s.mesh.position.distanceTo(towaC)
      let gone = s.life <= 0
      if (!s.frozen && toPlayer < 0.6 && s.vel.length() < 6) {
        this.knock(rt, s.mesh.position)
        gone = true
      }
      if (toTowa < 0.9 && s.vel.length() > 6) {
        // はじき返した弾がトワに当たると、糸が光る
        d.window = 5
        rt.shake(0.3)
        gone = true
      }
      if (gone) {
        s.mesh.removeFromParent()
        s.mesh.geometry.dispose()
        ;(s.mesh.material as THREE.Material).dispose()
        rt.chrono.remove(s.id)
        rt.combat.removeHitTarget(s.id + '_hit')
        d.shots.splice(i, 1)
      }
    }
    // 糸の的（chrono は add した物を毎フレーム読むので、enabled を書きかえる）
    if (this.threadTarget) this.threadTarget.enabled = d.window > 0
  }

  private threadTarget: ChronoTarget | null = null

  private async sceneCh10Travel(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    if (this.part === 'morning') this.setPart('evening', rt, false)
    this.placeSora('exhibit')
    if (rt.player.position.distanceTo(this.fs.markers.exhibit) > 6) {
      await this.fade(true, 0.6)
      this.teleportSpawn(rt, 'exhibit')
      await this.fade(false, 0.6)
    }
    await this.showRecord(rt, '1186年の記録', 'カンボジアの遺跡のかんばん（NEXTMAKE）', '「1186年、空の怪物から『アルン』を守った戦いの絵」', V7_ART.relief1186, 'ch10_relief')
    this.lock(rt, false)
    const front = this.fs.markers.exhibit
    this.setPhase('dial1186', [{ pos: v(F.PORTAL.x, F.PORTAL.y + 2.6, F.PORTAL.z), label: 'イドーのわっか' }])
    await this.waitF(front, 2.8, 'ダイヤル')
    if (!this.alive) return
    await this.runDial(rt, 1186, 'カンボジアの遺跡のかんばん')
    if (!this.alive) return
    this.lock(rt, true)
    this.ring.showUrl(V7_ART.relief1186, 1.4)
    await this.talk(rt, 'ch10_go')
    for (let k = 0; k <= 20; k++) {
      this.fs.openRift(k / 20)
      await this.wait(0.04)
    }
    rt.save('exhibit')
    this.lock(rt, false)
    this.travel(rt, '1186', 'arrive')
  }

  // ================================================================== 12 章：最後の夜

  private async sceneCh12Back(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    if (this.part === 'morning') this.setPart('evening', rt, false)
    this.placeSora('exhibit')
    this.walker.face(this.sora, rt.player.position)
    await this.talkShot(rt, 'ch12_back', this.sora.root.position.clone().add(v(0, 1.3, 0)), undefined, { fov: 46 })
    this.lock(rt, false)
    const at = v(F.PORTAL.x, 1.6, F.PORTAL.z).addScaledVector(v(Math.sin(F.PORTAL.yaw), 0, Math.cos(F.PORTAL.yaw)), 4.2)
    let opened = false
    rt.chrono.add({
      id: 'chrono_test',
      kind: 'seam',
      label: '小さなゆらぎ',
      point: at,
      radius: 0.5,
      enabled: true,
      onAct: () => {
        opened = true
        const s = rt.chrono.slit(at.clone(), { width: 0.9, height: 1.8, seconds: 5 })
        s.setOpen(1)
      },
    })
    this.ch.site.setSeam(0)
    this.setPhase('test_slit', [{ pos: at.clone().add(v(0, 1.4, 0)), label: 'ゆらぎ' }])
    await this.until(() => opened, () => (opened = true))
    rt.chrono.remove('chrono_test')
    if (!this.alive) return
    this.lock(rt, true)
    this.lens.set(true, true)
    await this.talk(rt, 'ch12_test_ok')
    this.set(rt, 'v7_final_ready')
    this.lock(rt, false)
  }

  private async sceneCh12Hands(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    await this.fade(true, 0.8)
    this.setPart('night', rt, false)
    this.ch.tower.setTime(20, 40)
    this.teleportSpawn(rt, 'night_plaza')
    this.placeSora(v(-1.0, 0, 8.2), faceYaw(v(-1, 0, 8.2), v(TOWER.cx, 0, TOWER.cz)))
    this.showTowa(TOWER.towa.pos, v(1.5, 0, 6), 'raiseLamp')
    await this.wait(0.3)
    await this.fade(false, 0.8)
    this.sky.start(1.3)
    void rt.cinematic({ look: TOWER.towa.pos.clone().add(v(0, 1.2, 0)), from: v(1.2, 1.6, 4.0), hold: Infinity, inSec: 1.2, fov: 40, marker: { pos: TOWER.towa.pos.clone().add(v(0, 2.3, 0)), label: 'トワ' } })
    await this.until(() => this.sky.done)
    await this.talk(rt, 'ch12_towa')
    rt.endCinematic()
    // 黒い手 3 本：ふりおろして止まったところを裂く
    this.startHands(rt, 'cut')
    rt.combat.enabled = true
    this.lock(rt, false)
    this.setPhase('hands')
    await this.until(
      () => {
        this.marks = this.hands.ids.filter((id) => this.hands.isStuck(id)).map((id) => ({ pos: (this.hands.point(id) ?? rt.player.position).clone().add(v(0, 1.0, 0)), label: '止まった手' }))
        return this.handsCut >= 3
      },
      () => {
        for (const id of this.hands.ids) this.hands.cut(id)
        this.handsCut = 3
      },
    )
    this.stopHands()
    rt.combat.enabled = false
    if (!this.alive) return
    this.set(rt, 'v7_hands_cut')
  }

  private async sceneCh12Ura(rt: StageRuntime): Promise<void> {
    if (this.part !== 'night') this.setPart('night', rt, true)
    this.showTowa(TOWER.towa.pos, v(1.5, 0, 6), 'raiseLamp')
    this.placeSora(v(-1.0, 0, 8.2), faceYaw(v(-1, 0, 8.2), v(TOWER.cx, 0, TOWER.cz)))
    this.lock(rt, true)
    await this.talk(rt, 'ch12_now')
    this.lock(rt, false)
    let opened = false
    const seam = TOWER.seamTop
    rt.chrono.add({
      id: 'chrono_sky',
      kind: 'seam',
      label: '空の大きなゆらぎ',
      point: seam,
      radius: 3,
      enabled: true,
      range: 60,
      noLineOfSight: true,
      onAct: () => (opened = true),
    })
    this.setPhase('sky_seam', [{ pos: seam.clone().add(v(0, 2, 0)), label: '大きなゆらぎ' }])
    await this.until(() => opened, () => (opened = true))
    rt.chrono.remove('chrono_sky')
    if (!this.alive) return
    this.lock(rt, true)
    const door = rt.chrono.slit(seam.clone(), { width: 5, height: 9, tone: 'dawn' })
    door.setOpen(1)
    this.lens.set(true, true)
    rt.shake(0.6)
    void rt.cinematic({ look: seam.clone(), hold: 2.4, inSec: 1.2, fov: 56 })
    await this.wait(2.6)
    this.lock(rt, false)
    this.setPhase('ura')
    await this.ura.run(rt, { towa: this.towa, sora: { ringPos: v(F.PORTAL.x, F.PORTAL.y, F.PORTAL.z) }, doorSeconds: 60, lines: (k) => this.L(k) })
    if (!this.alive) return
    door.close()
    if (!this.f('v7_orm_down')) this.set(rt, 'v7_orm_down')
    // 広場へ転がり出る
    this.teleportSpawn(rt, 'night_plaza')
  }

  private async sceneCh12Ending(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    if (this.part !== 'night') this.setPart('night', rt, false)
    // 空のひびが消え、お祭りの明かりがもどる
    this.sky.reset()
    this.setPart('night', rt, false)
    this.fs.crowd.setNight(false)
    const p = rt.player.position
    this.showTowa(p.clone().add(v(1.6, 0, -1.2)), p, 'kneel', true)
    this.lamp.root.visible = false
    this.placeSora(p.clone().add(v(-1.4, 0, 0.8)), faceYaw(p.clone().add(v(-1.4, 0, 0.8)), p))
    await this.wait(0.6)
    this.towa.setMask(false)
    rt.hud.setSpeakerIcon('トワ', TOWA_UNMASKED)
    void rt.cinematic({ look: this.towa.root.position.clone().add(v(0, 0.8, 0)), hold: Infinity, inSec: 1.2, fov: 42 })
    await this.talk(rt, 'ch12_ending')
    rt.endCinematic()
    await this.talk(rt, 'ch12_festival')
    this.showKeychain(rt, true)
    await this.wait(1.0)
    this.showKeychain(rt, false)
    await this.playFlashback(this.L('ending_card') as FlashbackLine[], V7_ART.endingFestival, ['10月18日の夜', 'お祭りの明かり'])
    if (!this.alive) return
    this.set(rt, 'v7_ending')
    this.lock(rt, false)
    await rt.chapter()
  }

  // ================================================================== おわりに

  private async sceneEpilogue(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    await this.fade(true, 0.01)
    this.setPart('morning', rt, false)
    this.ch.site.setVariant('courtyard')
    this.ch.site.shrine.takeClaw()
    this.hideTowa()
    this.teleportSpawn(rt, 'loop_morning')
    this.props.street.setNews(this.newsEpilogue())
    this.props.street.pulse()
    await this.fade(false, 1.0)
    const vision = this.props.street.center
    void rt.cinematic({ look: vision, from: vision.clone().add(v(1.6, -1.2, 4.4)), hold: Infinity, inSec: 1.2, fov: 48 })
    // 風船は今朝は引っかからずに空へ
    this.props.balloon.play()
    this.balloonFree = 0
    await this.talk(rt, 'epi_vision')
    rt.endCinematic()
    this.placeSora(rt.player.position.clone().add(v(1.4, 0, -1.6)), faceYaw(rt.player.position.clone().add(v(1.4, 0, -1.6)), rt.player.position))
    await this.talk(rt, 'epi_sora')
    this.soraFollow()
    this.lock(rt, false)
    // 中庭のほこらのトワ
    const shrine = this.ch.site.shrine
    this.showTowa(shrine.front.clone().add(v(-0.5, 0, -0.3)), SITE.shrine.pos, 'pray', false)
    this.lamp.root.visible = false
    this.setPhase('epilogue', [{ pos: SITE.kanban.pos.clone().add(v(0, 2, 0)), label: 'NEXTMAKE の中庭' }])
    await this.waitNear(rt, shrine.front, 4.5)
    if (!this.alive) return
    this.lock(rt, true)
    this.walker.face(this.towa, rt.player.position)
    this.towa.setPose('wave')
    void rt.cinematic({ look: this.towa.root.position.clone().add(v(0, 1.2, 0)), hold: Infinity, inSec: 1.0, fov: 46 })
    await this.talk(rt, 'epi_towa')
    rt.endCinematic()
    await this.playFlashback([{ speaker: 'ソラ', text: 'まずは、今日の思い出から！' }], V7_ART.epilogueMorning, ['おわり', 'ネクマックスと、時を裂く爪'])
    if (!this.alive) return
    this.set(rt, 'v7_epilogue')
    rt.hud.banner('おわり　―　また明日ね', 'success', 4)
    this.setPhase('done')
    this.lock(rt, false)
  }

  private balloonFree = -1

  // ================================================================== キーホルダー（手に持って見せる）

  private showKeychain(rt: StageRuntime, on: boolean): void {
    if (on && !this.keychain) {
      this.keychain = createStarKeychain(2.4)
      rt.nexmax.handAnchor.add(this.keychain)
      this.keychain.position.set(0, 0.05, 0)
    }
    if (this.keychain) this.keychain.visible = on
  }

  // ================================================================== 毎フレーム

  update(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    this.lastDt = dt
    this.clock.update(dt)
    this.walker.update(dt)
    rt.player.killY = chronicleKillY(rt.player.position)
    if (this.flash && (frame.pressed.has('interact') || frame.pressed.has('jump') || frame.pressed.has('claw_fire'))) this.flash.skip()
    if (this.choice.open) this.choice.input(frame)
    this.updateDial(dt, frame, rt)
    this.updateHands(dt, rt)
    this.updateClimb(dt, rt)
    this.updateDuel(dt, rt)
    this.updateBalloon(rt)
    if (!this.duel) rt.combat.passive = this.busy || rt.talking || rt.inCinematic
    if (this.ura.active) this.ura.update(dt, frame, rt)
    // F 待ちの的が遠いときの案内（目印は scene が出す）
    if (this.fWait && this.fWait.reach < 900) {
      const d = Math.hypot(rt.player.position.x - this.fWait.pos.x, rt.player.position.z - this.fWait.pos.z)
      if (d < this.fWait.reach) rt.hud.setClawPrompt?.('', false)
    }
  }

  /** 時計台：黒い手が壁をなでる（予告の帯 → なでる）。当たったら一つ下の足場へ */
  private updateClimb(dt: number, rt: StageRuntime): void {
    if (this.handsMode !== 'climb' || this.busy) return
    this.handT += dt
    const p = rt.player.position
    // いまいる高さに近い帯をねらう
    const T = TOWER
    const cycle = 4.2
    const k = this.handT % cycle
    let lane = 0
    let best = 1e9
    T.sweeps.forEach((s, i) => {
      const d = Math.abs(s.y - (p.y + 0.6))
      if (d < best) {
        best = d
        lane = i
      }
    })
    for (let i = 0; i < T.sweeps.length; i++) this.ch.tower.setSweepWarn(i, i === lane && k > 1.4 && k < 3.0 ? (k - 1.4) / 1.6 : 0)
    const s = T.sweeps[lane]
    if (k > 3.0 && k < 3.6 && !this.handClock.climbHit) {
      // なでる：帯の高さで、壁の前を北から南へ
      if (!this.hands.has('wall')) this.hands.spawn('wall', v(s.x - 5, s.y + 6, s.z0 - 4), { from: 'sky', size: 0.9, noDecal: true })
      const zz = s.z0 + ((k - 3.0) / 0.6) * (s.z1 - s.z0 + 2)
      this.hands.reachTo('wall', v(s.x - 0.6, s.y, zz), 0.15)
      if (Math.abs(p.y + 0.6 - s.y) < 1.1 && p.x < T.x0 + 0.4 && p.x > T.x0 - 2.5 && Math.abs(p.z - zz) < 1.2 && !rt.claw.wire.isConnected()) {
        this.handClock.climbHit = 1
        this.knock(rt, v(s.x - 0.6, s.y, zz))
        // 一つ下の足場へ
        const below = [...T.hooks].reverse().find((h) => h.landing.y < p.y - 0.5)
        this.teleport(rt, (below ? below.landing : T.foot).clone())
      }
    }
    if (k < 0.2) {
      this.handClock.climbHit = 0
      if (this.hands.has('wall')) this.hands.retract('wall')
    }
    void this.climbLanding
  }

  /** 風船：クローが運んでくると子どもへ返す（任意） */
  private updateBalloon(rt: StageRuntime): void {
    const b = this.props.balloon
    if (this.balloonFree >= 0) {
      this.balloonFree += this.lastDt
      b.def.enabled = false
      return
    }
    if (!b.def.enabled) return
    if (rt.claw.wire.target?.id === b.def.id && rt.claw.wire.phase === 'carrying') {
      const from = b.markPos.clone()
      rt.claw.sendHomeById(b.def.id)
      b.def.enabled = false
      b.giveBack(from)
      const first = !this.f('v7_balloon_done')
      this.set(rt, 'v7_balloon_done')
      void this.talk(rt, first && !this.f('v7_rewind1') ? 'balloon_back' : 'balloon_back_loop')
    }
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    this.fs.update(dt, t)
    this.ch.update(dt, t)
    this.props.update(dt)
    this.ring.update(dt)
    this.lens.update(dt)
    this.sky.update(dt, rt)
    this.hands.update(dt, t)
    this.lamp.update(dt, t)
    this.fx?.update(dt)
    this.flash?.update(dt)
    if (this.rt) this.updateSora(dt, rt)
    if (this.towa.root.visible) this.towa.update(dt, 0)
    if (this.ura.active) this.ura.animate(dt, t)
    if (this.fx) this.fx.setAspect(rt.camera.aspect)
  }

  // ================================================================== F・案内・目標

  interact(rt: StageRuntime): boolean {
    if (this.ura.active && this.ura.interact(rt)) return true
    if (this.dial) {
      if (this.dial.logic.locked) this.finishDial()
      else rt.hud.toast('石の音と記録の音がそろうまで、← → で回そう', 2)
      return true
    }
    const w = this.fWait
    if (w) {
      const d = Math.hypot(rt.player.position.x - w.pos.x, rt.player.position.z - w.pos.z)
      if (d <= w.reach) {
        this.fWait = null
        w.resolve()
        return true
      }
    }
    // ソラと少し話す
    if (!this.busy && this.sora.root.visible && rt.player.position.distanceTo(this.sora.root.position) < 2.4) {
      void this.talk(rt, 'sora_wait')
      return true
    }
    return false
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.ura.active) return this.ura.hints(rt)
    if (this.dial) return [{ key: '← →', label: '回す' }, { key: 'F', label: this.dial.logic.locked ? '決める' : 'そろえてから' }]
    const w = this.fWait
    if (w) {
      const d = Math.hypot(rt.player.position.x - w.pos.x, rt.player.position.z - w.pos.z)
      if (d <= w.reach) return [{ key: 'F', label: w.label }]
    }
    if (this.phase === 'escape') return [{ key: 'Shift', label: 'ダッシュでにげる' }, { key: 'J', label: '手に撃つ（すりぬける）' }]
    if (this.phase === 'tower_climb') return [{ key: 'J', label: '金具に飛びつく' }]
    if (this.phase === 'hands') return [{ key: 'J', label: '止まった手を裂く' }]
    return null
  }

  objective(rt: StageRuntime): { title: string; sub: string } {
    const u = this.ura.active ? this.ura.objective(rt) : null
    if (u) return u
    return objectiveOf(this.phase)
  }

  objectiveTarget(): THREE.Vector3 | null {
    return this.marks[0]?.pos ?? null
  }

  objectiveMarkers(rt: StageRuntime): readonly ObjectiveMark[] | null {
    if (this.ura.active) return this.ura.markers(rt)
    return this.marks.length ? this.marks : null
  }

  music(rt: StageRuntime): MusicId | null {
    if (this.ura.active) return 'ura'
    void rt
    return musicOf(this.step, this.part)
  }

  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    if (e.kind === 'connected' && e.target.id === this.props.balloon.def.id) this.props.balloon.grab()
    void rt
  }

  onPassThroughAny(): void {
    for (const fn of [...this.passListeners]) fn()
  }

  // ================================================================== 開発用

  /** いまの段階の「プレイヤーがやること」を片づけて先へ（リードの通し確認用） */
  devSkip(rt: StageRuntime): void {
    if (this.ura.active) {
      this.ura.devSkip(rt)
      return
    }
    if (this.dial) {
      this.dial.logic.year = this.dial.logic.target
      this.finishDial()
      return
    }
    if (this.flash) {
      this.flash.skip()
      return
    }
    if (this.fWait) {
      const w = this.fWait
      this.fWait = null
      w.resolve()
      return
    }
    this.skipReq = true
  }

  debug(): Record<string, unknown> {
    return {
      step: this.step,
      arrival: this.arrival,
      phase: this.phase,
      busy: this.busy,
      part: this.part,
      lights: lightsLeft(this.f),
      handsMode: this.handsMode,
      handsCut: this.handsCut,
      site: this.ch?.site.variant,
      dial: this.dial ? { year: this.dial.logic.year, target: this.dial.logic.target } : null,
      fWait: this.fWait?.label ?? null,
      sora: this.soraMode,
      duel: this.duel ? { thread: this.duel.thread, window: this.duel.window } : null,
    }
  }

  dispose(): void {
    this.dead = true
    this.clock.dispose()
    this.walker.clear()
    this.curtain?.dispose()
    this.badge?.dispose()
    this.dialPanel?.dispose()
    this.flash?.dispose()
    this.fx?.dispose()
    this.choice.close()
    this.ura.dispose()
    this.nightEnv?.dispose()
    this.ch?.dispose()
    this.hands?.dispose()
    this.lamp?.dispose()
    this.towa?.dispose()
    this.tear?.dispose()
    this.ring?.dispose()
    if (this.keychain) this.keychain.removeFromParent()
    this.rt = null
  }
}

const KEY_STALL_X = 15.2
