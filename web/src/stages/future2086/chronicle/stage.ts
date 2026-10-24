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
import { autoFramePosition, type CineShot } from '../../../game/cinematic'
import type { ActionFrame } from '../../../player/inputActions'
import { toTouchText } from '../../../player/touchLogic'
import type { ClawTargetDef, WireEvent } from '../../../player/clawLogic'
import type { Hint } from '../../../ui/hud'
import type { Character } from '../../../world/characters'
import type { MusicId } from '../../../audio/tracks'
import { SceneClock } from '../../../chronicle/kit/clock'
import { Walker, faceYaw } from '../../../chronicle/kit/walker'
import { Curtain } from '../../../chronicle/kit/curtain'
import { ChoiceBox } from '../../../chronicle/kit/choice'
import { ArenaFence, rectPoints } from '../../../chronicle/kit/arena'
import { lightsLeft, type Flags } from '../../../chronicle/progress'
import { V7_ART, TOWA_UNMASKED, loadArtCanvas } from '../../../chronicle/art'
import { BlackHands, Lamp, SHADE_STYLE, createPerson, type PersonCharacter } from '../../../chronicle/visuals'
import { preloadFutureAssets } from '../fmaterials'
import { FUTURE_ENVIRONMENTS, FUTURE_EVENING, applyTimeOfDay, type TimeOfDay } from '../environment'
import type { FutureScene } from '../scene'
import { buildIntroProps, type IntroProps } from '../introProps2086'
import { LoopFx } from '../loopFx'
import { SkyTear } from '../skyTear2086'
import { LensMount, RingRecord, ScanBeam } from '../recordFx2086'
import { Flashback, type FlashbackLine } from '../introOverlay2086'
import { F, SWING } from '../layout'
import { FOCUS_SHOTS, SwingArcPreview } from '../focusShots2086'
import { INTRO_LAYOUT } from '../introProps2086'
import { buildChronicleFuture, type ChronicleAdditions } from './additions'
import { CHRONICLE_SPOTS, COURSE, SITE, TOWER, UNDER, chronicleKillY } from './layoutChronicle'
import { QR_RECORDS, dialRecord, type QrRecord } from './qrStand'
import { IdoVr, recordViewOf } from './idoVr'
import { VrVisitors } from './vrFolk'
import { SECTION, TowerClimb } from './towerClimb'
import { SlamRings } from './slamRing'
import { MobTalkV7, mobPhaseV7 } from './mobTalkV7'
import type { ChronoTarget } from '../../../chronicle/chrono'
import { YearDialLogic } from './yearDialLogic'
import { YearDialPanel } from './yearDialPanel'
import { createStarKeychain } from './plazaProps'
import { UraBattle } from '../../../chronicle/uraBattle'
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
  screenOn,
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

/** 黒い手のあそび：ソラを守る（2 章のはじめ。ふりおろさない）・逃げる（2 章）・最後の夜（12 章） */
type HandsMode = 'none' | 'protect' | 'escape' | 'cut'

/** 風船（毎朝）：none＝まだ／caught＝電灯に引っかかった／carry＝クローで持っている／given＝男の子にわたした */
type BalloonPhase = 'none' | 'caught' | 'carry' | 'given'

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
  /** 黒い手のふりおろしの予告（当たる広さの赤い輪。たたく瞬間に向かって満ちる） */
  private slamRings!: SlamRings
  private tear!: SkyTear
  private sky!: SkyEvent
  private ring!: RingRecord
  private lens!: LensMount
  private ura!: UraBattle
  private nightEnv: EnvTexture | null = null
  private dayEnv: THREE.Texture | null = null
  private keychain: THREE.Mesh | null = null
  private beam!: ScanBeam
  /** 4 章の時計台のぼり（のぼっている間だけ） */
  private climb: TowerClimb | null = null
  /** のぼりの記録（ボットの確認用：かかったゲーム時間・落ちた回数・当たった回数） */
  private climbLog: { sec: number; falls: number; hits: number; assists: number } | null = null
  private climbT0 = 0
  /** 町の人のおしゃべり */
  private mob: MobTalkV7 | null = null
  /**
   * 戦い・追いかけの間の柵（chronicle/kit/arena.ts）：2 章の夜の広場・4 章の地下・4 章の時計台の屋上。
   * 場面に関係ない所へ行けない・てっぺんから落ちられないように。朝にもどる（prepare）と開く
   */
  private fence: ArenaFence | null = null
  /** 4 章のてっぺん：トワの手さげランプ（クローでねらう。とどくと影の手がはらいのける） */
  private lampDef!: ClawTargetDef
  private lampGrab: (() => void) | null = null
  /** はらいのける間は、クローの先（lampDef.point）をステージが動かす */
  private lampHold = false
  /** IDO の VR（物語 v7.2）：QR を読むと、ネクマックスの見ている景色が記録の町になる（少し上から、見回すだけ） */
  private vr!: IdoVr
  /** ソラのブースのまわりの、ゴーグルで昔を見ているお客さん */
  private vrVisitors!: VrVisitors
  /** 見回している間：F・タップでおわる */
  private vrDone: (() => void) | null = null
  /** 見ている間に、歩こう・つかもうとした（「見えるだけ」の案内は 1 回だけ） */
  private vrTried = false
  /** 見ていた景色の中へ落ちていく間（見回す案内を出さない） */
  private vrFalling = false
  /** 見ている間にねらえなくした的と、もとの enabled */
  private vrTargets: Array<[ClawTargetDef, boolean]> | null = null

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
  private antennaToday = false
  private balloon: BalloonPhase = 'none'
  /** QR を読む光（のこり秒） */
  private scanT = 0
  // ---- ソラ
  private soraMode: SoraMode = 'spot'
  private readonly soraSpot = { pos: new THREE.Vector3(), yaw: 0 }
  // ---- 黒い手
  private handsMode: HandsMode = 'none'
  private handT = 0
  private handHits = 0
  private handsCut = 0
  /** 12 章：まだ止まっていない手に J をした回数（ヒント用） */
  private handPass = 0
  private readonly handClock: Record<string, number> = {}
  /** ふりおろした所と、もう当たり判定をしたか（地面に着いた瞬間に 1 回だけ） */
  private readonly slamAt: Record<string, THREE.Vector3> = {}
  private readonly slamDone: Record<string, boolean> = {}
  /** ソラが転んでいる（2 章。0..1 で倒れていく） */
  private soraDown = 0
  private soraDownTo = 0
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
    // 物語 v7.1：1 章のお使いの中継アンテナ（導入編の小物。v7 では町の外の入れ物にあるので、北の回廊の東の端へもどす）
    const A = INTRO_LAYOUT.antenna
    this.props.group.add(this.props.antenna.group)
    fs.colliders.box(A.x, A.y + 0.5, A.z, 0.62, 1.0, 0.62)
    this.props.screen.setOn(true, true)
    this.beam = new ScanBeam(fs.root)
    this.ring = new RingRecord(fs.root)
    this.vr = new IdoVr(fs.root, mats, ctx.quality)
    this.vrVisitors = new VrVisitors(fs.root, fs.colliders)
    this.lens = new LensMount(fs.root)
    this.tear = new SkyTear(fs.root)
    this.sky = new SkyEvent(this.tear, fs.orum)
    this.hands = new BlackHands(fs.root)
    this.slamRings = new SlamRings(fs.root)
    this.towa = createPerson('towa', { rim: '#9a7cff', rimK: 0.6 })
    this.lamp = new Lamp(fs.root, { dark: true })
    this.towa.holdLamp(this.lamp)
    this.towa.root.visible = false
    fs.root.add(this.towa.root)
    // 4 章のてっぺんでねらうランプ（ふだんはねらえない。物を引きよせる的だが、とどいたら場面がはらいのける）
    this.lampDef = { id: 'towa_lamp', type: 'pull_object', label: 'ランプ', point: new THREE.Vector3(), radius: 0.35, enabled: false, noLineOfSight: true, priority: 1, range: 12 }
    fs.claw.targets.push(this.lampDef)
    // 12 章の裏側（足場の当たり判定を足すので load で組む。x = +3000 の遠く）
    this.ura = UraBattle.build({ root: fs.root, colliders: fs.colliders, scenario: 'final', quality: ctx.quality })
    ctx.progress(0.8, 'ソラを読み込み中…')
    this.sora = await soraP
    fs.root.add(this.sora.root)
    const night = FUTURE_ENVIRONMENTS.night
    this.nightEnv = skyEnvironment(ctx.renderer, night.sky, night.sunDir)
    this.spawnId = ctx.spawnId
    this.arrival = ctx.spawnId && ctx.spawnId.startsWith('v7_from_') ? ctx.spawnId : null
    this.step = step2086((n) => ctx.story.get(n))
    return { root: fs.root, colliders: fs.colliders, claw: { targets: fs.claw.targets, movables: fs.claw.movables }, lights: [...fs.lights, ...this.ura.lights] }
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
    this.fence = new ArenaFence(this.fs.root, rt.phys)
    if (this.ui) this.vr.attachUi(this.ui)
    this.mob = new MobTalkV7(this.fs, [this.ch.stallUnit], this.ui, rt.camera)
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
    this.balloon = 'none'
    this.props.antenna.setFixed(step !== 'ch1_booth' && step !== 'ch1_antenna')
    this.props.screen.setOn(screenOn(step, this.antennaToday), true)
    this.ch.qr.setRecord(QR_RECORDS.idle)
    this.ch.qr.setScan(0)
    this.ch.qr.setNear(0)
    this.soraDown = this.soraDownTo = 0
    this.ch.stall.resetStall()
    const day = Math.max(1, morningOf(step, this.f) || 1)
    this.props.street.setNews(step === 'epilogue' || step === 'done' ? this.newsEpilogue() : this.newsFor(day))
    this.ch.tower.setTime(part === 'morning' ? 10 : part === 'evening' ? 17 : 20, part === 'night' ? 40 : 30)
    this.ch.tower.setNextHook(null)
    this.ch.tower.setSkySeam(0)
    this.fence?.open(true)
    this.lampDef.enabled = false
    this.lampHold = false
    // ゴーグルのお客さんは、昼と夕方だけ（夜は展示がおしまい）
    this.vrVisitors.setVisible(part !== 'night')
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
    this.fs.setAction(false)
    this.fs.setTimeOfDay(mode)
    this.ch.setTimeOfDay(mode)
    const maps: Partial<Record<TimeOfDay, THREE.Texture>> = {}
    if (this.dayEnv) maps.morning = this.dayEnv
    if (this.nightEnv) maps.night = this.nightEnv.texture
    // 夕方：店の明かりは夜のまま、空と光は夕焼け（夜の環境だと中庭の決闘が暗すぎる）
    const env = part === 'evening' ? FUTURE_EVENING : this.fs.environment
    applyTimeOfDay(env, { scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post, envMaps: maps })
    if (part === 'evening') this.fs.setStars(false)
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
    this.soraDown = this.soraDownTo = 0
    this.sora.root.rotation.x = 0
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
      s.root.position.y += (groundY(rt.phys, s.root.position, p.y, 1.2, rt.player.collider) - s.root.position.y) * Math.min(1, dt * 10)
    } else if (this.soraMode === 'spot') {
      // 近くに来たらこちらを向く
      const p = rt.player.position
      if (p.distanceTo(s.root.position) < 4.5 && this.soraDownTo === 0) this.walker.turnToward(s, p, dt, 3)
    } else if (this.soraMode === 'walk') {
      s.root.position.y += (groundY(rt.phys, s.root.position, s.root.position.y) - s.root.position.y) * Math.min(1, dt * 10)
    }
    // 転ぶ（2 章）：うしろへ倒れて、しりもち
    if (this.soraDown !== this.soraDownTo || this.soraDown > 0) {
      this.soraDown += (this.soraDownTo - this.soraDown) * Math.min(1, dt * (this.soraDownTo > this.soraDown ? 7 : 3))
      s.root.rotation.order = 'YXZ'
      s.root.rotation.x = -1.38 * this.soraDown
      s.root.position.y = this.soraSpot.pos.y + 0.12 * this.soraDown
      speed = 0
    }
    s.update(dt, speed)
  }

  // ================================================================== トワ

  private hideTowa(): void {
    this.towa.root.visible = false
    this.lamp.root.visible = false
    this.ch.tower.setTowaOnTop(false)
  }

  private showTowa(pos: THREE.Vector3, face: THREE.Vector3, pose: Parameters<PersonCharacter['setPose']>[0] = 'idle', mask = true): void {
    this.towa.root.visible = true
    this.lamp.root.visible = true
    this.towa.root.position.copy(pos)
    this.towa.root.rotation.y = faceYaw(pos, face)
    this.towa.setPose(pose)
    this.towa.setMask(mask)
    this.ch.tower.setTowaOnTop(pos.y > TOWER.deckY - 0.5)
    // 仮面を外したあと（結末・おわりに）は、台詞の顔も素顔に
    if (!mask) this.rt?.hud.setSpeakerIcon('トワ', TOWA_UNMASKED)
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
      () => {
        // 目的の点の少し手前（来た方向）へ。人の上に重ならないように
        const p = rt.player.position
        const d = new THREE.Vector3(p.x - pos.x, 0, p.z - pos.z)
        if (d.lengthSq() < 1e-4) d.set(0, 0, 1)
        d.setLength(Math.min(r * 0.6, 1.3))
        const to = pos.clone().add(d)
        this.teleport(rt, to, faceYaw(to, pos))
      },
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

  /**
   * 演出のカメラ（rt.cinematic）。見る点が建物・ほこらなどの当たり判定の中にあると、シェルの壁よけ（見る点からカメラへのレイ）が
   * その場で当たって、カメラが見る点のすぐそば（＝建物の中）まで寄ってしまう。そのときは見る点を、カメラから見た面の手前へ出す（向きは同じ）
   */
  private cine(rt: StageRuntime, shot: CineShot): Promise<void> {
    const look = shot.look
    const from = shot.from ?? autoFramePosition(rt.player.position, look, new THREE.Vector3())
    const dir = from.clone().sub(look)
    const len = dir.length()
    if (len > 1) {
      dir.divideScalar(len)
      const inside = (rt.phys.raycast(look.clone().addScaledVector(dir, 0.35), dir, 0.05, rt.player.collider, true) ?? 1) < 0.001
      const back = dir.negate()
      const hit = inside ? rt.phys.raycast(from, back, len, rt.player.collider, true) : null
      if (hit !== null && hit > 0.8) shot = { ...shot, from, look: from.clone().addScaledVector(back, hit - 0.3) }
    }
    return rt.cinematic(shot)
  }

  /** カメラで見せながら会話（終わったら戻す） */
  private async talkShot(rt: StageRuntime, key: string, look: THREE.Vector3, from?: THREE.Vector3, o: { fov?: number; label?: string } = {}): Promise<void> {
    void this.cine(rt, { look, from, hold: Infinity, inSec: 1.4, outSec: 1.2, fov: o.fov, marker: o.label ? { pos: look, label: o.label } : undefined })
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
    rt.hud.showIdo({ title, sub, body, image, foot: 'IDOのかんばんの記録' })
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
        this.prepareSoft(step)
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
  private prepareSoft(step: Step2086): void {
    this.ch.dial.setDial(dialVisible(this.f))
    this.lens.set(lensMounted(step, this.lensToday))
  }

  private runStep(step: Step2086, rt: StageRuntime): Promise<void> {
    switch (step) {
      case 'prologue':
        return this.scenePrologue(rt)
      case 'ch1_booth':
        return this.sceneCh1Booth(rt)
      case 'ch1_antenna':
        return this.sceneCh1Antenna(rt)
      case 'ch1_qr':
        return this.sceneCh1Qr(rt)
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
    // 第1章のとびらは、画面が黒いうちに（フィールドより先に）。明けるのは 1 章の朝（runMorning）
    await rt.chapter()
    this.lock(rt, false)
  }

  // ================================================================== 毎朝の型

  /**
   * 街頭ビジョン → 風船（毎朝同じ電灯に引っかかる）→ 1 度目の朝だけ選ぶ（風船を取ってあげる／ソラのところへ行く）。day は何度目の 10月18日。
   * 2 度目の朝からは（物語 v7.2）、同じ場面を短く見せて F・タップでとばせる。選ぶ画面は出さず、目標はソラ。
   * 風船は、取りたければ J で取って男の子にわたせる（目標にはしない）。取ってあげると選んだら true
   */
  private async runMorning(rt: StageRuntime, day: number): Promise<boolean> {
    this.lock(rt, true)
    this.setPhase('morning')
    this.props.street.setNews(this.newsFor(day))
    this.props.street.pulse()
    const vision = this.props.street.center
    this.teleportSpawn(rt, 'loop_morning')
    await this.fade(false, 0.8)
    void this.cine(rt, { look: vision, from: vision.clone().add(v(1.6, -1.2, 4.4)), hold: Infinity, inSec: 1.2, fov: 48 })
    await this.talk(rt, day >= 2 ? (day >= 4 ? 'morning4' : `morning${day}`) : 'morning1')
    rt.endCinematic()
    // 風船：男の子の手からはなれて、毎朝同じ電灯に引っかかる
    const loop = day >= 2
    this.props.balloon.play()
    this.balloon = 'none'
    await this.wait(loop ? 0.3 : 0.6)
    const t0 = this.clock.time
    let shotDone = false
    void this.cine(rt, { look: BALLOON_LAMP.clone(), hold: loop ? 3.2 : Infinity, inSec: 1.0, outSec: 0.8, skippable: loop }).then(() => (shotDone = true))
    await this.talk(rt, 'balloon_up')
    // ネクマックスが「同じだ」と気づく（2 度目の朝から）
    if (loop) await this.talk(rt, 'balloon_same')
    if (loop) await this.until(() => shotDone)
    else {
      // 1 度目は、電灯に引っかかるまで見せる
      await this.wait(Math.max(0, BALLOON_FLOAT_SEC - (this.clock.time - t0)))
      rt.endCinematic()
    }
    // とばしたときも、風船は電灯に引っかかった所へ
    this.props.balloon.update(BALLOON_FLOAT_SEC)
    this.balloon = 'caught'
    // カメラがもどりきってから選ぶ画面を出す（もどる間の F はシェルが受け取らないので、押しても決まらない）
    await this.until(() => !rt.inCinematic)
    if (!this.alive) return false
    // 2 度目の朝から：選ばない。風船は電灯に引っかかったまま、取りたければ取れる（ソラのところへ行くとちゅうで）
    if (loop) {
      this.props.balloon.def.enabled = true
      this.lock(rt, false)
      return false
    }
    this.setPhase('balloon_choice')
    const take = (await this.askChoice(rt, 'balloon', '男の子の風船が、電灯に引っかかっている……', [BALLOON_OPT.take, BALLOON_OPT.go])) === 'take'
    if (!this.alive) return false
    if (take) await this.talk(rt, 'balloon_take')
    else await this.talk(rt, 'balloon_leave')
    // 取ってあげないときは、風船は電灯に引っかかったまま（ねらえない）
    this.props.balloon.def.enabled = take
    this.lock(rt, false)
    return take
  }

  /** 選ぶ画面（W／S・↑↓ で選んで F／J で決める。スマホは選択肢をタップ）。devSkip ではじめの物を選ぶ */
  private askChoice(rt: StageRuntime, id: string, prompt: string, options: ReadonlyArray<{ id: string; label: string }>): Promise<string> {
    if (!this.ui || !this.alive) return Promise.resolve(options[0].id)
    this.marks = []
    return this.choice.ask(this.ui, id, rt.touch ? toTouchText(prompt) : prompt, options)
  }

  /** 風船の男の子（crowd.ts の balloon_child） */
  private get balloonKid(): THREE.Vector3 {
    return BALLOON_KID
  }

  /**
   * 風船を取ってあげる：J で取る → 男の子のそばで F。わたすか、ソラのそばへ行ったらおしまい
   * （ソラのところへ先に行ったら、持っている風船はだまって返す。settleBalloon）
   */
  private async balloonErrand(rt: StageRuntime): Promise<void> {
    const sora = this.sora.root.position
    const nearSora = () => Math.hypot(rt.player.position.x - sora.x, rt.player.position.z - sora.z) < 3.4
    while (this.alive && this.balloon !== 'given' && !nearSora()) {
      if (this.balloon === 'carry') this.setPhase('balloon_give', [{ pos: this.balloonKid.clone().setY(1.6), label: '男の子' }])
      else this.setPhase('balloon_take', [{ pos: this.props.balloon.markPos.clone().add(v(0, 0.5, 0)), label: '風船' }])
      const was = this.balloon
      await this.until(
        () => this.balloon !== was || nearSora(),
        () => this.giveBalloon(rt, false),
      )
    }
    // お礼の会話が終わるまで
    await this.until(() => !rt.talking)
  }

  /** 風船を男の子にわたす（thanks：お礼の会話） */
  private giveBalloon(rt: StageRuntime, thanks = true): void {
    const b = this.props.balloon
    const from = b.markPos.clone()
    rt.claw.sendHomeById(b.def.id)
    b.def.enabled = false
    b.giveBack(from)
    this.balloon = 'given'
    const first = !this.f('v7_balloon_done')
    this.set(rt, 'v7_balloon_done')
    if (thanks) void this.talk(rt, first && !this.f('v7_rewind1') ? 'balloon_back' : 'balloon_back_loop')
  }

  /**
   * くり返しの朝（2 度目から）：ソラのところへ。風船は目標にしないが、とちゅうで取って持っていたら、男の子の目印も出す
   * （わたすのは男の子のそばで F。interact）
   */
  private async goSoraLoop(rt: StageRuntime): Promise<void> {
    const sora = this.sora.root.position
    const soraMark: ObjectiveMark = { pos: sora.clone().setY(sora.y + 1.9), label: 'ソラ' }
    const kidMark: ObjectiveMark = { pos: BALLOON_KID.clone().setY(1.6), label: '男の子' }
    this.setPhase('loop_greet', [soraMark])
    await this.until(
      () => {
        this.marks = this.balloon === 'carry' ? [soraMark, kidMark] : [soraMark]
        return Math.hypot(rt.player.position.x - sora.x, rt.player.position.z - sora.z) < 3.4 && Math.abs(rt.player.position.y - sora.y) < 3
      },
      () => this.teleport(rt, sora.clone().add(v(1.0, 0, 1.0)), faceYaw(sora.clone().add(v(1.0, 0, 1.0)), sora)),
    )
  }

  /** 会話の場面に入る前：持っている風船は、だまって男の子へ返す（持ったまま場面が進まないように） */
  private settleBalloon(rt: StageRuntime): void {
    if (this.balloon === 'carry') this.giveBalloon(rt, false)
    if (this.balloon === 'caught') this.props.balloon.def.enabled = false
  }

  // ================================================================== 1 章

  private async sceneCh1Booth(rt: StageRuntime): Promise<void> {
    const take = await this.runMorning(rt, 1)
    if (!this.alive) return
    // 風船を取ってあげると選んだら、わたすまで（ソラのところへ先に行ってもよい）
    if (take) await this.balloonErrand(rt)
    if (!this.alive) return
    const sora = this.sora.root.position
    this.setPhase('go_sora', [{ pos: sora.clone().setY(sora.y + 1.9), label: 'ソラ' }])
    await this.waitNear(rt, sora, 3.4)
    if (!this.alive) return
    this.lock(rt, true)
    this.settleBalloon(rt)
    this.walker.face(this.sora, rt.player.position)
    // ゴーグルをつけて昔の町を見ているお客さん（IDO は VR。わっかは、その景色がまわりにも見える板）
    await this.talkShot(rt, 'ch1_greet', this.vrVisitors.center.clone(), this.vrVisitors.center.clone().add(v(3.4, 0.6, 3.2)), { fov: 50 })
    // 箱の山のいちばん上のレンズを見せる
    void this.cine(rt, FOCUS_SHOTS.lens({ player: rt.player.position, lens: this.lensObject?.position.clone() ?? this.fs.markers.lens.clone(), short: true }))
    await this.wait(2.6)
    this.lock(rt, false)
    await this.lensErrand(rt)
  }

  /** 共鳴レンズ：J で取る → ソラのそばで F（置いてしまったら、もう一度取る） */
  private get lensObject(): THREE.Object3D | null {
    return this.fs.claw.movables.find((m) => m.def.id === this.fs.claw.ids.lens)?.object ?? null
  }

  private lensCarried(rt: StageRuntime): boolean {
    const w = rt.claw.wire
    return (w.phase === 'carrying' || w.phase === 'reeling') && w.target?.id === this.fs.claw.ids.lens
  }

  private async lensErrand(rt: StageRuntime): Promise<void> {
    let given = false
    this.lensGive = () => (given = true)
    while (this.alive && !given) {
      if (this.lensCarried(rt)) this.setPhase('lens_give', [{ pos: this.sora.root.position.clone().setY(this.sora.root.position.y + 1.9), label: 'ソラ' }])
      else this.setPhase('lens', [{ pos: (this.lensObject?.position ?? this.fs.markers.lens).clone().add(v(0, 0.7, 0)), label: '共鳴レンズ' }])
      const carrying = this.lensCarried(rt)
      await this.until(
        () => given || this.lensCarried(rt) !== carrying,
        () => (given = true),
      )
    }
    this.lensGive = null
    if (!this.alive) return
    await this.installLens(rt)
  }

  /** レンズをわたす（interact から） */
  private lensGive: (() => void) | null = null

  private async installLens(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    const lensId = this.fs.claw.ids.lens
    rt.claw.reset()
    const mv = this.fs.claw.movables.find((m) => m.def.id === lensId)
    if (mv) {
      rt.claw.sendHomeById(lensId)
      mv.object.visible = false
      mv.def.enabled = false
    }
    this.walker.face(this.sora, rt.player.position)
    await this.talk(rt, 'ch1_lens_give')
    this.lensToday = true
    this.lens.set(true, true)
    this.ring.setWobble(0)
    rt.oreGlow(1.2)
    await this.talkShot(rt, 'ch1_lens_ok', v(F.PORTAL.x, F.PORTAL.y, F.PORTAL.z), undefined, { fov: 50 })
    this.set(rt, 'v7_lens_done')
    this.lock(rt, false)
  }

  /** 1 章：北の回廊の中継アンテナ（回廊の金具 → 光る輪で切れた橋をわたる → 線をつなぐ → 大画面に「開場」） */
  private async sceneCh1Antenna(rt: StageRuntime): Promise<void> {
    this.lens.set(true)
    this.ring.setWobble(0)
    this.props.antenna.setFixed(false)
    this.props.screen.setOn(false, true)
    // 1 段目：回廊のふちの金具へカメラを動かして「これをつかむ」と見せる
    this.lock(rt, true)
    await this.showFocus(rt, 'hook', false, 'ch1_hook')
    this.lock(rt, false)
    const HOOKP = this.fs.markers.hook
    const ring = SWING.anchor
    const antenna = INTRO_LAYOUT.antenna
    const zone = () => (rt.player.grounded && !rt.player.isExternal ? this.fs.zoneAt(rt.player.position) : null)
    let up = false
    let fell = 0
    let reached = false
    this.focusReq = null
    let since = this.clock.time
    while (this.alive && !reached) {
      await this.until(
        () => {
          const z = zone()
          if (z === 'far_platform') return (reached = true)
          if (z === 'upper_walkway' && !up) {
            up = true
            since = this.clock.time
            // 2 段目：回廊に上がったら、光る輪と、ぶら下がってわたる道すじを見せる
            this.focusReq = { id: 'ring', short: false, line: 'ch1_walkway' }
          }
          // 振り子から落ちて広場へ：回廊の西の端（切れた橋の手前）へもどす。2 回目は、輪をもう一度見せる
          if (up && rt.player.grounded && !rt.player.isExternal && rt.player.position.y < F.WALK_Y - 1.5) {
            this.teleport(rt, SWING.checkpoints[0].clone(), faceYaw(SWING.checkpoints[0], SWING.checkpoints[1]))
            if (++fell <= 2) void this.talk(rt, 'ch1_fall_retry')
            if (fell === 2) {
              rt.hud.toast('輪にぶら下がったら、WASD で前へこいで、向こう岸の上で Space！', 4)
              this.focusReq = { id: 'ring', short: true }
            }
          }
          // しばらく進まないときも、もう一度見せる
          if (!this.focusReq && this.clock.time - since > FOCUS_REPLAY_SEC && rt.claw.wire.phase === 'idle' && !rt.talking) {
            since = this.clock.time
            this.focusReq = { id: up ? 'ring' : 'hook', short: true }
          }
          if (up) this.setPhase('antenna_swing', [{ pos: ring.clone().add(v(0, 0.5, 0)), label: '光る輪' }])
          else this.setPhase('antenna_hook', [{ pos: HOOKP.clone().add(v(0, 0.4, 0)), label: '回廊の金具' }])
          // 見せる（ワイヤーで動いている間・会話の間は待つ）
          return this.focusReq !== null && rt.claw.wire.phase === 'idle' && !rt.talking && rt.player.grounded
        },
        () => {
          reached = true
          this.teleportSpawn(rt, 'far_platform')
        },
      )
      const req = this.focusReq as ChronicleFutureStage['focusReq']
      this.focusReq = null
      if (reached || !req || !this.alive) continue
      this.lock(rt, true)
      await this.showFocus(rt, req.id, req.short, req.line)
      this.lock(rt, false)
      since = this.clock.time
    }
    if (!this.alive) return
    // 3 段目：中継アンテナ
    this.lock(rt, true)
    void this.cine(rt, FOCUS_SHOTS.antenna({ player: rt.player.position, lens: this.fs.markers.lens, short: true }))
    await this.talk(rt, 'ch1_antenna_found')
    await this.wait(0.6)
    this.lock(rt, false)
    this.setPhase('antenna_fix', [{ pos: antenna.clone().add(v(0, 3.0, 0)), label: '中継アンテナ' }])
    await this.waitF(antenna.clone().add(v(0, 0, 0.9)), 2.2, 'つなぐ')
    if (!this.alive) return
    this.lock(rt, true)
    this.props.antenna.setFixed(true)
    this.antennaToday = true
    rt.oreGlow(0.8)
    await this.wait(0.5)
    // 会場の大画面に「開場」・紙ふぶき・歓声
    const scr = this.props.screen.center
    void this.cine(rt, { look: scr.clone(), from: v(4.0, 6.6, -4.0), hold: Infinity, inSec: 1.2, fov: 54 })
    await this.wait(1.0)
    this.props.screen.setOn(true)
    await this.wait(1.6)
    this.props.confetti.play()
    rt.shake(0.15)
    await this.talk(rt, 'ch1_open')
    rt.endCinematic()
    this.set(rt, 'v7_antenna_done')
    this.lock(rt, false)
  }

  /** 1 章のお使いの「つかむ物を見せる」の、次に見せる物（2 回まちがえた・しばらく進まない・回廊に上がった） */
  private focusReq: { id: 'hook' | 'ring'; short: boolean; line?: string } | null = null
  /** 光る輪を見せる間の、振り子の道すじの点線（focusShots2086 の SwingArcPreview） */
  private arc: { fx: SwingArcPreview; short: boolean; off: number } | null = null

  /**
   * 1 章のお使い：つかむ物へカメラを動かして、金色の目印で「これをつかむ」と見せる（前の版の focusShots2086 のカメラ）。
   * 光る輪は、ぶら下がってわたる道すじ（点線と光る玉）もいっしょに。short はヒントの見せ直し（短く、F でとばせる）
   */
  private async showFocus(rt: StageRuntime, id: 'hook' | 'ring', short: boolean, line?: string): Promise<void> {
    const shot = FOCUS_SHOTS[id]({ player: rt.player.position.clone(), lens: this.fs.markers.lens.clone(), short })
    if (shot.marker) shot.marker = { ...shot.marker, label: FOCUS_GRAB_LABEL[id] }
    const minSec = (shot.inSec ?? 1.5) + (short ? (id === 'ring' ? 3.4 : 1.8) : id === 'ring' ? 6.2 : 3.0)
    shot.hold = Infinity
    shot.skippable = short
    this.arc?.fx.dispose()
    this.arc = id === 'ring' ? { fx: new SwingArcPreview(this.fs.root), short, off: 0 } : null
    const t0 = this.clock.time
    let ended = false
    void this.cine(rt, shot).then(() => (ended = true))
    if (line) await this.talk(rt, line)
    await this.until(() => ended || this.clock.time - t0 >= minSec)
    if (!ended) rt.endCinematic()
  }

  /** 1 章：ブースへもどる → 「さすが！」→ 展示の台の QR を読む（300 年前の路地） */
  private async sceneCh1Qr(rt: StageRuntime): Promise<void> {
    this.lens.set(true)
    this.ring.setWobble(0)
    const sora = this.sora.root.position
    this.setPhase('back_booth', [{ pos: sora.clone().setY(sora.y + 1.9), label: 'ソラ' }])
    await this.waitNear(rt, sora, 3.6)
    if (!this.alive) return
    this.lock(rt, true)
    this.walker.face(this.sora, rt.player.position)
    this.sora.setPose('wave')
    await this.talkShot(rt, 'ch1_praise', sora.clone().add(v(0, 1.35, 0)), undefined, { fov: 44 })
    this.sora.setPose('idle')
    const qr = this.ch.qr
    qr.setRecord(QR_RECORDS.edo1726)
    void this.cine(rt, { look: qr.qrPos.clone(), hold: 2.2, inSec: 1.0, outSec: 1.0, fov: 40, marker: { pos: qr.qrPos.clone().add(v(0, 0.75, 0)), label: 'かんばんの QR', color: '#ffd447' } })
    await this.wait(2.4)
    this.lock(rt, false)
    await this.readQr(rt, QR_RECORDS.edo1726, 'qr_demo')
    if (!this.alive) return
    // ネクマックスの見ている景色が、300 年前の路地になる（少し上から。見回すだけ。わっかには、その景色がうつる）
    this.ring.show('edo1726', 2.6)
    await this.enterVr(rt, QR_RECORDS.edo1726)
    await this.talk(rt, 'ch1_qr')
    await this.lookAround(rt, 'ch1_qr_look')
    if (!this.alive) return
    await this.exitVr(rt)
    this.ring.showVisitor()
    qr.setRecord(QR_RECORDS.idle)
    this.set(rt, 'v7_qr_demo')
    this.lock(rt, false)
  }

  /**
   * 展示の台の QR を読む：台に rec を出して、台の前で F → ネクマックスの目から光が QR へのびる（約 1.6 秒）。
   * 終わったら操作は止めたまま（呼んだ場面が続きを見せる）
   */
  private async readQr(rt: StageRuntime, rec: QrRecord, phase: string): Promise<void> {
    const qr = this.ch.qr
    qr.setRecord(rec)
    qr.setNear(1)
    this.setPhase(phase, [{ pos: qr.qrPos.clone().add(v(0, 0.8, 0)), label: 'QR' }])
    await this.waitF(qr.stand, 1.4, 'QR を読む')
    if (!this.alive) return
    this.lock(rt, true)
    this.teleport(rt, qr.stand, faceYaw(qr.stand, qr.qrPos))
    // ネクマックスの横から、目の光と QR を見る
    const n = qr.stand.clone().sub(qr.qrPos).setY(0).normalize()
    const side = v(-n.z, 0, n.x)
    void this.cine(rt, { look: qr.qrPos.clone().lerp(rt.player.position.clone().add(v(0, 0.8, 0)), 0.45), from: qr.stand.clone().addScaledVector(side, 2.1).addScaledVector(n, 0.9).setY(qr.qrPos.y + 0.35), hold: Infinity, inSec: 0.7, fov: 44 })
    await this.wait(0.6)
    qr.setScan(1)
    this.scanT = 1.8
    rt.oreGlow(0.9)
    await this.wait(1.9)
    qr.setScan(0)
    qr.setNear(0)
    rt.endCinematic()
  }

  // ================================================================== IDO の VR（物語 v7.2）

  /** 記録の名前の札（画面の下のまん中） */
  private vrCaption(rec: QrRecord): string {
    return `IDO　${rec.era}　${rec.title}`
  }

  /** QR を読んだあと：ネクマックスの見ている景色が、記録の町になる（白っぽい水色の幕の間に切りかえる） */
  private async enterVr(rt: StageRuntime, rec: QrRecord): Promise<void> {
    await this.fade(true, 0.35, '#d4f6ff')
    this.vr.enter(recordViewOf(rec), this.vrCaption(rec), rt.camRig, rt.camera)
    this.vrTried = false
    // 見ている間は、クローでねらえる物を出さない（照準が、見ている景色の上に出ないように）
    if (!this.vrTargets) {
      this.vrTargets = this.fs.claw.targets.map((t) => [t, t.enabled] as [ClawTargetDef, boolean])
      for (const t of this.fs.claw.targets) t.enabled = false
    }
    await this.wait(0.2)
    await this.fade(false, 0.55, '#d4f6ff')
  }

  /** 見るのをやめて、ブースの前のネクマックスにもどる */
  private async exitVr(rt: StageRuntime): Promise<void> {
    this.vrDone = null
    await this.fade(true, 0.3, '#d4f6ff')
    this.vr.exit(rt.camRig, rt.camera)
    for (const [t, on] of this.vrTargets ?? []) t.enabled = on
    this.vrTargets = null
    await this.wait(0.15)
    await this.fade(false, 0.45, '#d4f6ff')
  }

  /** 見回す（F・タップか、maxSec 秒でおわる）。line：はじめのひとこと */
  private async lookAround(rt: StageRuntime, line: string | null, maxSec = 24): Promise<void> {
    if (line) await this.talk(rt, line)
    if (!this.alive) return
    let done = false
    this.vrDone = () => (done = true)
    this.setPhase('vr_look')
    const t0 = this.clock.time
    await this.until(() => done || this.clock.time - t0 > maxSec, () => (done = true))
    this.vrDone = null
  }

  /** 見ている間に歩こう・つかもうとしたら、1 回だけ「見えるだけ」と知らせる */
  private watchVrTry(frame: ActionFrame, rt: StageRuntime): void {
    if (!this.vr.active || this.vrTried || rt.talking) return
    if (frame.pressed.has('claw_fire') || frame.pressed.has('jump') || Math.hypot(frame.move.x, frame.move.y) > 0.6) {
      this.vrTried = true
      rt.hud.toast('見えるだけ。さわったり、歩いたりはできないよ', 2.8)
    }
  }

  /**
   * QR を読む → 少し上から記録の町を見る（VR）→ 背中の石がコチ、コチ、コチと大きく鳴る → 見ているだけだった景色の中へ、
   * ネクマックスが本当に落ちていく → 時代を移る。5 章（60 年前の NEXTMAKE）・8 章（ダイヤルでえらんだ 2026 年）・
   * 10 章のあと（1186 年）の旅立ちで、ダイヤルのあとに呼ぶ（8・10 章は後半の担当）。
   * phase：QR を読む間の目標（OBJECTIVES のキー）。o.lines：石が鳴ったあとの会話、o.go：落ちる前の会話（ソラ「待って――！」など）、
   * o.flag：時代を移る前に立てるフラグ。セーブは 'exhibit'（ブースの前）
   */
  private async diveIntoRecord(rt: StageRuntime, rec: QrRecord, phase: string, o: { lines?: string; go?: string; flag?: string; to: '2026' | '1186'; spawn: string }): Promise<void> {
    await this.readQr(rt, rec, phase)
    if (!this.alive) return
    this.lock(rt, true)
    // わっかには、ネクマックスの見ている景色がうつる（ソラが見る）
    if (rec.seed === 1186) this.ring.showUrl(V7_ART.relief1186, 2.2)
    else this.ring.showUrl(V7_ART.recordNextmake, 2.2)
    await this.enterVr(rt, rec)
    this.setPhase('vr_dive')
    // いつものように、少し見回せる
    await this.wait(2.4)
    // 石が、コチ、コチ、コチと大きく鳴って、強く光る
    for (let i = 0; i < 6 && this.alive; i++) {
      rt.oreGlow(1.2 + i * 0.2)
      rt.shake(0.06 + i * 0.015)
      this.vr.tick(0.8 + i * 0.15)
      await this.wait(0.42)
    }
    if (o.lines) await this.talk(rt, o.lines)
    if (!this.alive) return
    // 見ているだけだった景色が、本物になる（ブースのわっかも、本物の扉に）
    this.vr.setReal()
    this.vrFalling = true
    rt.oreGlow(2.6)
    rt.shake(0.25)
    for (let k = 0; k <= 10; k++) {
      this.fs.openRift(k / 10)
      this.ring.setRift(k / 10)
      await this.wait(0.03)
    }
    if (o.go) await this.talk(rt, o.go)
    if (!this.alive) return
    // ネクマックスが、景色の中へ落ちていく（カメラは見ていた所から、落ちていくネクマックスを追う）
    this.vr.addFloor(rt.phys)
    const land = this.vr.landWorld()
    const eye = this.vr.eyeWorld()
    const fwd = v(land.x - eye.x, 0, land.z - eye.z)
    if (fwd.lengthSq() < 0.01) this.vr.forward(rt.camRig, fwd)
    fwd.normalize()
    const start = land.clone().addScaledVector(fwd, -1.2).setY(eye.y + 1.2)
    rt.claw.reset()
    rt.player.teleport(start, Math.atan2(-fwd.x, -fwd.z))
    this.vr.watch(rt.player.position)
    rt.oreGlow(2.2)
    const t0 = this.clock.time
    await this.until(() => (rt.player.grounded && this.clock.time - t0 > 0.3) || this.clock.time - t0 > 2.2)
    if (!this.alive) return
    rt.shake(0.2)
    await this.wait(0.35)
    if (o.flag) this.set(rt, o.flag)
    rt.save('exhibit')
    this.lock(rt, false)
    this.travel(rt, o.to, o.spawn)
  }

  private async sceneCh1Keychain(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    this.walker.face(this.sora, rt.player.position)
    if (rt.player.position.distanceTo(this.sora.root.position) > 4) this.teleportSpawn(rt, 'booth')
    await this.talkShot(rt, 'ch1_stone', rt.player.position.clone().add(v(0, 0.7, 0)), undefined, { fov: 46 })
    // 夕方：準備がおわる
    await this.fade(true, 0.7)
    this.setPart('evening', rt, false)
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
    void this.cine(rt, { look: stall.showcase, hold: Infinity, inSec: 1.0, fov: 40 })
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
    this.towa.setRim('#b08cff', 1.0)
    // 広場から、てっぺんのトワを見上げる（近いと屋上の縁にかくれるので、少し離れて寄る）
    void this.cine(rt, { look: top.clone().add(v(0, 1.1, 0)), from: v(4.4, 1.8, 6.4), hold: Infinity, inSec: 1.6, fov: 22, marker: { pos: top.clone().add(v(0, 2.6, 0)), label: '時計台' } })
    await this.talk(rt, 'ch2_towa')
    // ランプを空へ → 空のひび → 黒い輪
    this.towa.setPose('raiseLamp')
    this.sky.start(1.15)
    rt.endCinematic(true)
    void this.cine(rt, { look: this.fs.orum.center.clone(), from: v(0.6, 1.6, 9.0), hold: Infinity, inSec: 1.4, fov: 60 })
    await this.until(() => this.sky.done || !this.sky.running)
    rt.endCinematic(true)
    // トワが見下ろして言う（石の力をもらいに来た）
    void this.cine(rt, { look: top.clone().add(v(0, 1.3, 0)), from: v(4.4, 1.8, 6.4), hold: Infinity, inSec: 1.0, fov: 20, marker: { pos: top.clone().add(v(0, 2.6, 0)), label: '仮面の男' } })
    await this.talk(rt, 'ch2_tear')
    rt.endCinematic()
    // 黒い手 3 本：人ごみの上をこえて、ネクマックスとソラへ
    this.fs.setAction(true)
    this.startHands(rt, 'protect')
    // 黒い手が出ている間は、夜の広場から出られない（北の通り・回廊へ行かない。南のゲートは中）
    this.fence?.close(rectPoints(PLAZA_FENCE.x0, PLAZA_FENCE.x1, PLAZA_FENCE.z0, PLAZA_FENCE.z1), { y: 0 })
    const soraHand = 'hand0'
    this.hands.reachTo(soraHand, this.sora.root.position.clone().add(v(0.3, 2.3, 0.2)), 1.6)
    this.hands.reachTo('hand1', rt.player.position.clone().add(v(-0.4, 2.6, 0.4)), 1.8)
    const mid = rt.player.position.clone().lerp(this.sora.root.position, 0.5)
    void this.cine(rt, { look: mid.clone().add(v(0, 1.6, 0)), hold: Infinity, inSec: 0.9, fov: 58 })
    await this.wait(1.4)
    await this.talk(rt, 'ch2_hands')
    rt.endCinematic()
    this.lock(rt, false)
    // 目標：黒い手から、ソラを守ろう（J）。J はすりぬける
    let passed = false
    const off = this.onPass(() => (passed = true))
    const tp = this.clock.time
    let hinted = false
    await this.until(
      () => {
        const pt = this.hands.point(soraHand)
        this.marks = pt ? [{ pos: pt.clone().add(v(0, 0.9, 0)), label: '黒い手' }] : []
        this.phase = 'protect'
        if (!hinted && this.clock.time - tp > 9) {
          hinted = true
          rt.hud.toast('ソラの上の黒い手のほうを向いて、J！', 4)
        }
        return passed
      },
      () => (passed = true),
    )
    off()
    if (!this.alive) return
    this.lock(rt, true)
    await this.wait(0.5)
    await this.talk(rt, 'ch2_pass')
    // にげる：手は、にげる人には見向きもせず、二人だけを追う
    this.handsMode = 'escape'
    for (const id of this.hands.ids) this.handClock[id] = 1.2 + Math.random() * 1.4
    this.soraFollow()
    this.lock(rt, false)
    const gate = v(0, 0, 18.2)
    this.setPhase('flee', [{ pos: gate.clone().setY(2.2), label: '南のゲート' }])
    const total = 45
    const start = this.clock.time
    const left = () => total - (this.clock.time - start)
    const badge = () => {
      const l = left()
      this.badge?.set(`8:40　のこり ${Math.max(0, Math.ceil(l))}秒`, l / total)
      this.ch.tower.setTime(20, 40 + Math.min(1, (this.clock.time - start) / total))
    }
    // ゲートへ近づくか、しばらく逃げたら：ソラのすぐ横に手がふりおろされる
    await this.until(
      () => {
        badge()
        return rt.player.position.z > 10.5 || this.clock.time - start > 22
      },
      () => {},
    )
    if (!this.alive) return
    await this.soraFalls(rt, badge)
    if (!this.alive) return
    this.badge?.set(null)
    await this.touchAndLoop(rt, 'ch2_touch', 'v7_rewind1')
  }

  /** 2 章：ソラのすぐ横に手がふりおろされて、ソラが転ぶ（見せる） */
  private async soraFalls(rt: StageRuntime, badge: () => void): Promise<void> {
    this.lock(rt, true)
    this.handsMode = 'none'
    const s = this.sora.root.position.clone()
    this.walker.stop(this.sora)
    this.soraMode = 'spot'
    this.soraSpot.pos.copy(s)
    const side = v(rt.player.position.x - s.x, 0, rt.player.position.z - s.z)
    if (side.lengthSq() < 0.01) side.set(1, 0, 0)
    side.normalize()
    // ソラの、ネクマックスと反対側のすぐ横（手の指がソラにかからない所）
    const at = s.clone().addScaledVector(side, -2.4).setY(groundY(rt.phys, s, s.y))
    const id = this.hands.ids.find((h) => this.hands.state(h) !== 'cut') ?? 'hand0'
    if (!this.hands.has(id)) this.hands.spawn(id, at.clone().add(v(-3, 0, -2)))
    this.hands.slam(id, at, { windup: 1.3, stuck: 1.6 }, { warn: false })
    this.slamRings.show(id, at, HAND_HIT_R, 1.3)
    // 横から：まん中にソラ、片側にふりおろす手、もう片側にネクマックス
    const look = s.clone().add(v(0, 0.6, 0))
    const perp = v(-side.z, 0, side.x)
    if (perp.dot(v(rt.camera.position.x - s.x, 0, rt.camera.position.z - s.z)) < 0) perp.negate()
    void this.cine(rt, { look, from: s.clone().addScaledVector(perp, 4.0).addScaledVector(side, 0.3).add(v(0, 1.5, 0)), hold: Infinity, inSec: 0.6, fov: 52 })
    for (let k = 0; k < 15 && this.alive; k++) {
      badge()
      await this.wait(0.1)
    }
    rt.shake(0.6)
    // ソラが転ぶ（ネクマックスのほうへ倒れる）
    this.walker.face(this.sora, at)
    this.soraDownTo = 1
    this.sora.setPose('idle')
    await this.wait(0.6)
    await this.talk(rt, 'ch2_fall')
    rt.endCinematic(true)
  }

  /** 8時41分：手が背中の石にふれそうになる（体に当たって、軽く吹っ飛ぶ）→ 白くとぶ → 朝（flag を立てる） */
  private async touchAndLoop(rt: StageRuntime, lineKey: string, flag: string, handId?: string): Promise<void> {
    this.lock(rt, true)
    this.handsMode = 'none'
    this.ch.tower.setTime(20, 41)
    const p = rt.player.position
    const fwd = v(-Math.sin(rt.player.facing), 0, -Math.cos(rt.player.facing))
    // 背中の石（体のうしろ、肩の下）
    const ore = p.clone().add(v(0, 0.6, 0)).addScaledVector(fwd, -0.22)
    let id = handId ?? this.hands.ids.find((h) => this.hands.state(h) !== 'cut' && this.hands.state(h) !== 'gone') ?? null
    if (!id) {
      id = 'touch'
      this.hands.spawn(id, p.clone().addScaledVector(fwd, -2.4).setY(groundY(rt.phys, p, p.y, 1.2, rt.player.collider)), { size: 0.9 })
      await this.wait(0.5)
    }
    // まず背中のうしろへ、それから石へ
    this.hands.reachTo(id, ore.clone().addScaledVector(fwd, -0.9).add(v(0, 0.5, 0)), 0.8)
    const side = v(-fwd.z, 0, fwd.x)
    void this.cine(rt, { look: ore.clone(), from: ore.clone().addScaledVector(side, 3.0).addScaledVector(fwd, 0.8).add(v(0, 0.6, 0)), hold: Infinity, inSec: 0.7, fov: 46 })
    await this.wait(0.9)
    this.hands.reachTo(id, ore, 0.35)
    await this.wait(0.36)
    // 手が体に当たって、前へ軽く吹っ飛ぶ（体力はへらさない）
    rt.combat.hurtPlayer(0, fwd, 6, false)
    rt.oreGlow(2.4)
    await this.talk(rt, lineKey)
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
        this.antennaToday = false
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
    this.handPass = 0
    const p = rt.player.position
    const ring = [v(4, 0, -3), v(-4.5, 0, -1), v(0.5, 0, 4.5)]
    ring.forEach((o, i) => {
      const id = `hand${i}`
      const base = p.clone().add(o).setY(0)
      this.hands.spawn(id, base)
      this.handClock[id] = 1.4 + i * 1.3
      this.slamDone[id] = true
      this.addHandTarget(rt, id)
    })
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
        } else {
          this.hands.passThrough(id)
          this.onPassThroughAny()
          // 12 章：まだ止まっていない手を 2 回ねらったら、止まるのを待つことを教える
          if (this.handsMode === 'cut' && ++this.handPass === 2) rt.hud.toast('手がふりおろして、地面で止まったら J！ それまでは、はなれていよう', 4)
        }
      },
      onPassThrough: () => {
        this.hands.passThrough(id)
        this.onPassThroughAny()
      },
    })
  }

  private stopHands(): void {
    for (const id of this.hands.ids) {
      this.rt?.chrono.remove('chrono_' + id)
    }
    this.hands.clear()
    this.slamRings.clear()
    this.handsMode = 'none'
  }

  /**
   * 手をふりおろす（予告の赤い輪 → 地面に着いた瞬間に、輪の中にいたら体に当たる）。輪は当たる広さそのままで、たたく瞬間に向かって満ちる。
   * はじめの 2 回（ほかの敵の分とあわせて）は「赤い輪の外へ」の案内を出して、ゆっくりふりおろす
   */
  private slamHand(rt: StageRuntime, id: string, at: THREE.Vector3, timing: { windup?: number; stuck?: number } = {}): void {
    this.slamAt[id] = at.clone()
    this.slamDone[id] = false
    let windup = timing.windup ?? 1.4
    if (rt.combat.coach('赤い輪の外へ はなれて！（Shift でダッシュ）')) windup += HAND_SLOW
    this.hands.slam(id, at, { ...timing, windup }, { warn: false })
    this.slamRings.show(id, at, HAND_HIT_R, windup)
  }

  private updateHands(dt: number, rt: StageRuntime): void {
    if (this.handsMode === 'none' || this.busy) return
    const p = rt.player.position
    this.handT += dt
    for (const id of this.hands.ids) {
      const st = this.hands.state(id)
      if (st === 'cut' || st === 'gone' || st === 'retract') continue
      // ソラを守る間（2 章のはじめ）は、二人の上にのびたまま
      if (this.handsMode === 'protect') continue
      this.handClock[id] = (this.handClock[id] ?? 2) - dt
      const ph = this.hands.slamPhase(id)
      if (st === 'slam' && ph) {
        // 地面に着いた瞬間：輪の中にいたら、手が体に当たって吹っ飛ぶ
        if (!this.slamDone[id] && (ph.phase === 'stuck' || ph.phase === 'recover' || ph.phase === 'done')) {
          this.slamDone[id] = true
          const at = this.slamAt[id]
          if (at && Math.hypot(at.x - p.x, at.z - p.z) < HAND_HIT_R && Math.abs(at.y - p.y) < 1.6) this.knock(rt, at)
        }
        if (ph.phase === 'stuck' && this.handsMode === 'cut') continue
        if (ph.phase !== 'done' && ph.phase !== 'recover') continue
      }
      if (this.handClock[id] > 0) {
        if (st !== 'chase' && st !== 'slam') this.hands.chase(id, p, this.handsMode === 'escape' ? 3.2 : 2.6)
        continue
      }
      // ふりおろす（少し先を読む）。予告は 1.4 秒（子どもがよけられる）
      const lead = this.tmp.set(-Math.sin(rt.player.facing), 0, -Math.cos(rt.player.facing)).multiplyScalar(rt.player.speed * 0.45)
      // 足もとの床（プレイヤーの体には当てない）
      const at = p.clone().add(lead).setY(groundY(rt.phys, p, p.y, 1.2, rt.player.collider))
      this.slamHand(rt, id, at, this.handsMode === 'cut' ? { windup: 1.4, stuck: 2.6 } : { windup: 1.4 })
      this.handClock[id] = this.handsMode === 'escape' ? 3.6 + Math.random() * 1.2 : 4.2 + Math.random()
    }
  }

  /** 黒い手などが体に当たった：当てた物からネクマックスへの向きに、軽く吹っ飛ぶ（体力は最後の 1 を残す） */
  private knock(rt: StageRuntime, from: THREE.Vector3, damage = 1): void {
    const p = rt.player.position
    let dx = p.x - from.x
    let dz = p.z - from.z
    let d = Math.hypot(dx, dz)
    if (d < 0.05) {
      // まん中に当たった：うしろへ
      dx = Math.sin(rt.player.facing)
      dz = Math.cos(rt.player.facing)
      d = 1
    }
    rt.combat.hurtPlayer(damage, this.tmp.set(dx / d, 0, dz / d), HAND_KNOCK, false)
    this.handHits++
  }

  // ================================================================== 3 章：また、同じ朝

  private async sceneCh3(rt: StageRuntime): Promise<void> {
    const take = await this.runMorning(rt, 2)
    if (!this.alive) return
    await rt.chapter()
    if (take) await this.balloonErrand(rt)
    if (!this.alive) return
    const sora = this.sora.root.position
    await this.goSoraLoop(rt)
    if (!this.alive) return
    this.lock(rt, true)
    this.settleBalloon(rt)
    this.walker.face(this.sora, rt.player.position)
    await this.talkShot(rt, 'ch3_greet', sora.clone().add(v(0, 1.4, 0)), undefined, { fov: 44 })
    // ソラは笑って、ブースのじゅんびにもどる（ネクマックスは、それ以上言えない）
    const back = this.fs.npcs.sora.booth
    void this.soraWalk([back.pos.clone()], 1.8).then(() => {
      if (this.soraMode === 'spot') this.placeSora('booth')
      this.sora.setPose('crank')
    })
    await this.wait(1.2)
    await this.talk(rt, 'ch3_pocket_hint')
    this.lock(rt, false)
    this.setPhase('pocket')
    await this.waitF(rt.player.position, 999, 'ポケットを見る')
    if (!this.alive) return
    this.lock(rt, true)
    this.showKeychain(rt, true)
    void this.cine(rt, { look: rt.player.position.clone().add(v(0, 0.7, 0)), hold: 2.6, inSec: 0.8, fov: 36 })
    await this.talk(rt, 'ch3_pocket')
    // 屋台には、同じキーホルダーが、まだ売られる前のまま
    void this.cine(rt, { look: this.ch.stall.showcase, hold: Infinity, inSec: 1.2, outSec: 1.0, fov: 38, marker: { pos: this.ch.stall.showcase.clone().add(v(0, 0.5, 0)), label: '屋台の星のキーホルダー' } })
    await this.wait(1.6)
    await this.talk(rt, 'ch3_stall')
    rt.endCinematic()
    await this.wait(0.4)
    this.showKeychain(rt, false)
    // 石の音（コチ、コチ）
    for (let i = 0; i < 4; i++) {
      rt.oreGlow(1.0 + i * 0.15)
      await this.wait(0.5)
    }
    await this.talk(rt, 'ch3_tick')
    // 転んだソラを思い出す（白い一瞬）
    await this.fade(true, 0.25, '#fff')
    await this.wait(0.15)
    await this.fade(false, 0.5, '#fff')
    await this.talk(rt, 'ch3_fear')
    this.set(rt, 'v7_loop_seen')
    this.lock(rt, false)
  }

  // ================================================================== 4 章：すりぬける怪物

  private async sceneCh4Hide(rt: StageRuntime): Promise<void> {
    // 夕方：ソラが屋台のほうを指さして、夜の約束 → ネクマックスはうなずけない
    this.lock(rt, true)
    await this.fade(true, 0.8)
    this.setPart('evening', rt, false)
    this.ch.tower.setTime(17, 10)
    this.teleportSpawn(rt, 'booth')
    this.placeSora('booth')
    this.sora.setPose('idle')
    this.walker.face(this.sora, rt.player.position)
    await this.wait(0.3)
    await this.fade(false, 0.8)
    await rt.chapter()
    await this.talkShot(rt, 'ch4_evening', this.sora.root.position.clone().add(v(0, 1.35, 0)), undefined, { fov: 44 })
    this.lock(rt, false)
    const top = UNDER.stairsTop
    this.setPhase('hide', [{ pos: top.clone().add(v(0, 3.4, 0)), label: '地下通路' }])
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
    // 黒い手が出ている間は、地下の部屋と通路から出られない（階段の下に光の幕）
    this.fence?.close(UNDER_FENCE, { y: UNDER.floorY })
    await this.wait(0.8)
    this.hands.reachTo('cellar', this.sora.root.position.clone().add(v(0, 1.0, 0)), 0.8)
    this.sora.setPose('hold')
    void this.cine(rt, { look: this.sora.root.position.clone().add(v(0, 1.2, 0)), hold: 2.2, inSec: 0.7, fov: 50 })
    await this.talk(rt, 'ch4_grab')
    this.addHandTarget(rt, 'cellar')
    this.lock(rt, false)
    // J → またすりぬける → ソラの前へ飛び出す
    this.setPhase('save_sora', [{ pos: this.sora.root.position.clone().add(v(0, 2.0, 0)), label: 'ソラ' }])
    let passed = false
    const off = this.onPass(() => (passed = true))
    await this.until(() => passed, () => (passed = true))
    off()
    if (!this.alive) return
    await this.talk(rt, 'ch4_pass')
    this.setPhase('save_run', [{ pos: this.sora.root.position.clone().add(v(0, 2.0, 0)), label: 'ソラ' }])
    await this.waitNear(rt, this.sora.root.position, 2.4, 2)
    if (!this.alive) return
    this.lock(rt, true)
    // ソラの前（手とソラのあいだ）に立つ
    const s = this.sora.root.position
    const toHand = v(UNDER.handHole.x - s.x, 0, UNDER.handHole.z - s.z).normalize()
    const stand = s.clone().addScaledVector(toHand, 0.9)
    this.teleport(rt, stand, faceYaw(stand, UNDER.handHole))
    await this.talk(rt, 'ch4_jump')
    // 手がソラをはなして、背中の石へ
    this.sora.setPose('idle')
    this.hands.reachTo('cellar', UNDER.handHole.clone().setY(UNDER.floorY + 2.2), 0.6)
    await this.wait(0.5)
    await this.talk(rt, 'ch4_after2')
    rt.chrono.remove('chrono_cellar')
    await this.touchAndLoop(rt, 'ch2_touch', 'v7_rewind2', CELLAR_HAND)
    this.ch.underground.resetBreach()
    this.lock(rt, false)
  }

  /**
   * 4 章のてっぺん：ランプにとどいたクローを、黒い火からのびた影の手がはらいのける（横から、ランプとクローの先を見せる）。
   * クローの先（lampDef.point）はランプにとどいたまま止めて、影の手にはたかれたら横へ飛ばし、ワイヤーを外す
   */
  private async lampSwat(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    this.lampHold = true
    const L = this.lamp.center(new THREE.Vector3())
    this.lampDef.point.copy(L)
    const P = rt.player.position.clone().add(v(0, 0.75, 0))
    const dir = v(P.x - L.x, 0, P.z - L.z)
    if (dir.lengthSq() < 1e-4) dir.set(-1, 0, 0)
    dir.normalize()
    const side = v(-dir.z, 0, dir.x)
    // カメラ：ランプとネクマックスのあいだの横から（ランプが画面の左寄り、ネクマックスが右寄り）
    const mid = L.clone().lerp(P, 0.5)
    void this.cine(rt, { look: mid.clone().lerp(L, 0.25), from: mid.clone().addScaledVector(side, 3.4).add(v(0, 0.7, 0)), hold: Infinity, inSec: 0.4, fov: 44 })
    // 黒い火から、小さな影の手
    this.hands.spawn(LAMP_HAND, L.clone(), { from: 'sky', size: 0.32, normal: dir.clone().add(v(0, 0.5, 0)).normalize(), rest: L.clone().addScaledVector(dir, 0.5).add(v(0, 0.45, 0)), noDecal: true })
    await this.wait(0.7)
    // クローの先をつかんで、はらいのける
    const tip = L.clone().addScaledVector(dir, 0.12)
    this.hands.reachTo(LAMP_HAND, tip, 0.3)
    await this.wait(0.32)
    rt.shake(0.35)
    rt.oreGlow(0.8)
    this.hands.passThrough(LAMP_HAND, tip)
    const from = this.lampDef.point.clone()
    const to = L.clone().addScaledVector(side, 1.3).addScaledVector(dir, 0.9).add(v(0, -0.6, 0))
    for (let k = 1; k <= 8 && this.alive; k++) {
      this.lampDef.point.lerpVectors(from, to, k / 8)
      await this.wait(0.03)
    }
    rt.claw.reset()
    this.lampHold = false
    this.hands.idle(LAMP_HAND, L.clone().addScaledVector(dir, 0.35).add(v(0, 0.3, 0)))
    await this.talk(rt, 'ch4_lamp_swat')
    this.hands.retract(LAMP_HAND)
    rt.endCinematic()
    await this.wait(0.3)
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
    if (await this.runMorning(rt, 3)) await this.balloonErrand(rt)
    if (!this.alive) return
    // ソラにたのむ：今夜は、ブースで待ってて
    const sora = this.sora.root.position
    await this.goSoraLoop(rt)
    if (!this.alive) return
    this.lock(rt, true)
    this.settleBalloon(rt)
    this.walker.face(this.sora, rt.player.position)
    await this.talkShot(rt, 'ch4_ask', sora.clone().add(v(0, 1.35, 0)), undefined, { fov: 44 })
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
    this.teleport(rt, TOWER.foot, faceYaw(TOWER.foot, COURSE_FIRST_GEAR))
    this.hideSora()
    this.showTowa(TOWER.towa.pos, v(1.5, 0, 6), 'raiseLamp')
    this.sky.finish(rt)
    await this.wait(0.4)
    await this.fade(false, 1.0)
    // てっぺんのトワ：塔の真下からだと屋上の床に隠れるので、南の広場の側から見上げる
    this.towa.setRim('#b08cff', 1.0)
    void this.cine(rt, { look: TOWER.towa.pos.clone().add(v(0, 1.3, 0)), from: v(6.0, 1.6, 6.0), hold: Infinity, inSec: 1.2, fov: 18, marker: { pos: TOWER.towa.pos.clone().add(v(0, 2.6, 0)), label: '仮面の男' } })
    await this.wait(2.6)
    // のぼる道すじ：回る大歯車から、通りの両側のビルをつなぐ光る輪・時計の部分まで、通りの上の高い所から見下ろす
    void this.cine(rt, { look: v(0.5, 7.5, -28.5), lookTo: v(0.6, 9.0, -27.0), from: v(1.0, 25.0, -15.5), fromTo: v(0.2, 23.5, -16.8), panSec: 4.0, hold: Infinity, inSec: 1.3, fov: 62, marker: { pos: COURSE_FIRST_GEAR.clone().add(v(0, 1.4, 0)), label: '大歯車' } })
    await this.talk(rt, 'ch4_climb')
    rt.endCinematic()
    rt.camRig.yaw = camYawToward(rt.player.position, COURSE_FIRST_GEAR)
    rt.camRig.pitch = 0.1
    this.lock(rt, false)
    // のぼる（ジャンプ・タイミング・よける・クロー）。町の光は一段落として、塔の足場を目立たせる
    this.fs.setAction(true)
    const camDist = rt.camRig.distance
    rt.camRig.distance = CLIMB_CAM_DIST
    const climb = new TowerClimb(this.ch.course, this.ch.tower, this.hands, {
      hit: (r, from) => this.knock(r, from),
      warn: (id, at, radius, windup) => this.slamRings.show(id, at, radius, windup),
    })
    this.climb = climb
    this.climbT0 = this.clock.time
    // 1 章のアーチの光る輪は、のぼる間はつかめない（となりの光る輪①とまちがえないように）
    const archRing = this.fs.claw.targets.find((t) => t.id === this.fs.claw.ids.swing)
    const archWas = archRing?.enabled ?? false
    if (archRing) archRing.enabled = false
    // はじめて C に着いたら、光る輪①と、向こうのビルの足場を見せる（短く。F でとばせる）
    let introShown = false
    while (this.alive && !climb.done) {
      await this.until(
        () => {
          this.phase = climb.phase
          this.marks = climb.marks
          return climb.done || (!introShown && climb.section === SECTION.C && rt.player.grounded && rt.claw.wire.phase === 'idle' && !rt.talking)
        },
        () => climb.skip(rt),
      )
      if (climb.done || !this.alive) break
      introShown = true
      this.lock(rt, true)
      const sw = COURSE.swings[0]
      const introT0 = this.clock.time
      let ended = false
      void this.cine(rt, {
        look: v(-3.0, 13.4, -21.5),
        from: v(5.5, 13.0, -17.6),
        hold: 2.6,
        inSec: 1.0,
        outSec: 0.9,
        fov: 62,
        skippable: true,
        marker: { pos: sw.anchor.clone().add(v(0, 0.9, 0)), label: '光る輪で、向こうのビルへ！', color: '#ffd447' },
      }).then(() => (ended = true))
      // カメラが輪①のほうへ行っている間に、輪①へ飛びつく所（C2 の西のふち）へ。針から来た C の北の端は、塔の壁に近くて
      // カメラがうしろに下がれない（頭が画面いっぱいになる）うえ、ななめに C2 へ歩くと北のすみの穴から落ちやすいので
      await this.until(() => ended || this.clock.time - introT0 > 1.1)
      const at = sw.start.clone().setX(sw.start.x + 0.35)
      this.teleport(rt, at, faceYaw(at, sw.anchor))
      rt.camRig.pitch = -0.3
      await this.until(() => ended)
      this.lock(rt, false)
    }
    this.climbLog = { sec: +(this.clock.time - this.climbT0).toFixed(1), falls: climb.falls, hits: climb.hits, assists: climb.assists }
    climb.end()
    this.climb = null
    if (archRing) archRing.enabled = archWas
    rt.camRig.distance = camDist
    this.fs.setAction(false)
    if (!this.alive) return
    // てっぺん：仮面の男と話す（名のるまでは「仮面の男」）。屋上のふちに柵（見えない壁と光の幕）を立てて、
    // 話している間・ランプをねらう間・黒い手が来る間に、屋上から落ちられないように（朝にもどると prepare で開く）
    this.fence?.close(rectPoints(TOWER.deck.x0 + 0.25, TOWER.deck.x1 - 0.25, TOWER.deck.z0 + 0.25, TOWER.deck.z1 - 0.25), { y: TOWER.deckY, color: '#b08cff' })
    this.lock(rt, true)
    this.showTowa(TOWA_DECK, rt.player.position, 'idle')
    void this.cine(rt, { look: this.towa.root.position.clone().add(v(0, 1.4, 0)), hold: Infinity, inSec: 1.2, fov: 44 })
    await this.talk(rt, 'ch4_towa')
    // トワの手さげランプ（黒い火から影がこぼれる）を見せる：ランプを取れば、影が止まるかもしれない
    this.towa.setPose('point')
    await this.wait(0.3)
    const lampAt = this.lamp.center(new THREE.Vector3())
    const toP = v(rt.player.position.x - lampAt.x, 0, rt.player.position.z - lampAt.z).normalize()
    const lampSide = v(-toP.z, 0, toP.x)
    void this.cine(rt, { look: lampAt.clone().add(v(0, -0.15, 0)), from: lampAt.clone().addScaledVector(toP, 1.7).addScaledVector(lampSide, 1.1).add(v(0, 0.35, 0)), hold: Infinity, inSec: 1.0, fov: 40, marker: { pos: lampAt.clone().add(v(0, 0.45, 0)), label: 'ランプ' } })
    await this.talk(rt, 'ch4_lamp_hint')
    rt.endCinematic()
    this.lock(rt, false)
    // ランプにクロー（J）→ 黒い火から影の手がのびて、クローをはらいのける
    let grabbed = false
    this.lampGrab = () => (grabbed = true)
    this.lampDef.enabled = true
    await this.until(
      () => {
        const c = this.lamp.center(this.tmp)
        this.setPhase('tower_lamp', [{ pos: c.clone().add(v(0, 0.55, 0)), label: 'ランプ' }])
        // 立ち止まったら、ランプのほうを向く（クローは向いている方へのびる）
        const p = rt.player.position
        if (rt.player.speed < 0.3 && rt.player.grounded) rt.player.turnToward(c.x - p.x, c.z - p.z, this.lastDt, 4)
        return grabbed
      },
      () => (grabbed = true),
    )
    this.lampGrab = null
    this.lampDef.enabled = false
    if (!this.alive) return
    await this.lampSwat(rt)
    if (!this.alive) return
    this.towa.setPose('idle')
    await this.talk(rt, 'ch4_shield')
    // 8時41分：空の黒い輪から手が来る
    this.hands.spawn(TOWER_HAND, v(TOWER.cx + 2, TOWER.deckY + 8, TOWER.cz - 2), { from: 'sky', size: 1.1 })
    await this.wait(0.6)
    await this.touchAndLoop(rt, 'ch2_touch', 'v7_rewind3', TOWER_HAND)
    // 四度目の朝：ベンチにすわりこむ（座板の上に置いて、重力を止めてすわる）
    this.lock(rt, true)
    const b = this.ch.bench
    this.teleport(rt, b.seat.pos.clone().setY(b.seat.pos.y + 0.03), faceYaw(b.seat.pos, b.front))
    rt.player.beginExternal()
    rt.setPlayerPose('sit')
    this.hideSora()
    await this.fade(false, 0.4)
    // ベンチの前から、すわりこんだネクマックスを少し見下ろす（ベンチの向きに合わせる）
    const fwd = b.front.clone().sub(b.seat.pos).setY(0).normalize()
    const side = v(-fwd.z, 0, fwd.x)
    const benchCam = b.seat.pos.clone().addScaledVector(fwd, 1.5).addScaledVector(side, 2.0).setY(b.seat.pos.y + 1.0)
    void this.cine(rt, { look: b.seat.pos.clone().add(v(0, 0.35, 0)), from: benchCam, hold: Infinity, inSec: 1.2, fov: 40 })
    await this.talk(rt, 'ch4_bench')
    rt.endCinematic()
    rt.setPlayerPose(null)
    rt.player.endExternal()
    this.teleport(rt, b.front, faceYaw(b.seat.pos, b.front))
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
    void this.cine(rt, { look: rt.player.position.clone().add(v(0, 0.8, 0)), hold: Infinity, inSec: 0.9, fov: 40 })
    await this.talk(rt, 'ch5_show')
    rt.endCinematic()
    this.showKeychain(rt, false)
    this.set(rt, 'v7_confided')
    this.lock(rt, false)
  }

  private async sceneCh5Door(rt: StageRuntime): Promise<void> {
    this.lens.set(true)
    this.ring.setWobble(0)
    this.placeSora('exhibit')
    // ソラが展示の台に、NEXTMAKE のビルの前のかんばんの、いちばん古い記録（60 年前）の QR を出す。
    // 読むと、いつものように少し上から 60 年前の町が見える → 石が鳴る → 見ているだけだった景色の中へ、本当に落ちていく
    await this.diveIntoRecord(rt, QR_RECORDS.nextmake2026, 'qr_door', { lines: 'ch5_record', go: 'ch5_go', flag: 'v7_door1', to: '2026', spawn: 'v7_nextmake' })
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
    // 通りの西の端から、新館のビルと上の大きな看板を見上げる（見る点はビルの手前の面）
    void this.cine(rt, { look: v(6.4, 13.5, -45.5), from: v(-4.2, 1.4, -38.5), hold: 2.6, inSec: 1.4, fov: 66 })
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
    this.setPhase('to_ring_dial', [{ pos: v(F.PORTAL.x, F.PORTAL.y + 2.6, F.PORTAL.z), label: 'IDOのわっか' }])
    await this.waitNear(rt, front, 3.0)
    if (!this.alive) return
    this.lock(rt, true)
    this.placeSora('exhibit')
    this.teleport(rt, front, faceYaw(front, v(F.PORTAL.x, 0, F.PORTAL.z)))
    this.ch.dial.setDial(true)
    void this.cine(rt, { look: this.ch.dial.center.clone(), hold: Infinity, inSec: 1.2, fov: 40, marker: { pos: this.ch.dial.center.clone().add(v(0, 0.6, 0)), label: '年代ダイヤル' } })
    await this.talk(rt, 'ch8_dial')
    rt.endCinematic()
    this.lock(rt, false)
    // ダイヤルを回すと、台の QR がその年の記録に変わる
    await this.runDial(rt, 2026, 'NEXTMAKE 前のかんばん → 路地', dialRecord)
    if (!this.alive) return
    this.lock(rt, true)
    this.ring.showUrl(V7_ART.recordNextmake, 1.4)
    await this.talk(rt, 'ch8_dial_ok')
    this.lock(rt, false)
    // 今度は、自分で行き先をえらんで、QR を読む
    await this.readQr(rt, dialRecord(2026), 'qr_dial')
    if (!this.alive) return
    rt.oreGlow(2)
    await this.talk(rt, 'ch8_go')
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
  private runDial(rt: StageRuntime, target: number, sub: string, record: (year: number) => QrRecord): Promise<void> {
    const logic = new YearDialLogic({ start: 2086, target })
    this.dialRecord = record
    this.ch.qr.setRecord(record(logic.year))
    rt.hud.toast('← → でダイヤルを回して、石の音と記録の音をそろえよう', 4)
    this.ch.dial.setDial(true)
    // スマホ：パネルの案内も、スティックとボタンの言い方に
    this.dialPanel?.show({ year: logic.year, sub, hint: rt.touch ? 'スティックを左右に倒して回す　　ボタンで決める' : '← → で回す　　F で決める' })
    this.setPhase('dial')
    return new Promise<void>((resolve) => {
      this.dial = { logic, resolve }
      this.skipReq = false
    })
  }

  /** ダイヤルの年の、台に出す QR */
  private dialRecord: (year: number) => QrRecord = dialRecord

  private updateDial(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    const d = this.dial
    if (!d) return
    this.ch.qr.setRecord(this.dialRecord(d.logic.year))
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
    void this.cine(rt, { look: v(14, 6, -45), from: v(1.0, 2.2, -36.5), hold: Infinity, inSec: 1.0, fov: 64 })
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
    void this.cine(rt, { look: site.shrine.boxPos.clone(), from: site.shrine.boxPos.clone().add(v(1.9, 0.5, 0.5)), hold: Infinity, inSec: 1.0, fov: 40 })
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
    if (rt.player.position.distanceTo(SITE.toolbox.hand) > 7) this.teleport(rt, v(15.6, 0, -41.4), faceYaw(v(15.6, 0, -41.4), SITE.toolbox.hand))
    let stopped = false
    // 落ちている間だけ狙える（手の中や地面の工具箱に J をむだ撃ちして、止める力を使ったことにならないように）
    const toolT: ChronoTarget = {
      id: 'chrono_toolbox',
      kind: 'freeze',
      label: '工具箱',
      point: site.toolbox.point,
      radius: 0.5,
      enabled: false,
      seconds: 4,
      onAct: () => {
        site.toolbox.freeze(true)
        if (site.toolbox.state === 'frozen') stopped = true
      },
      onThaw: () => site.toolbox.freeze(false),
    }
    rt.chrono.add(toolT)
    let misses = 0
    for (;;) {
      if (!this.alive) return
      site.toolbox.reset()
      this.lock(rt, true)
      // 落ちる前から、工具箱が画面のまん中に来るように
      rt.camRig.turnTo(camYawToward(rt.player.position, SITE.toolbox.hand), 0.12)
      await this.talk(rt, 'ch10_toolbox')
      this.lock(rt, false)
      // 2 回まちがえたら、もっとゆっくり落ちる
      site.toolbox.drop(misses >= 2)
      await this.until(
        () => {
          toolT.enabled = site.toolbox.state === 'falling'
          return stopped || site.toolbox.state === 'ground'
        },
        () => {
          site.toolbox.freeze(true)
          stopped = true
        },
      )
      toolT.enabled = false
      if (stopped) break
      misses++
      await this.talk(rt, 'ch10_toolbox_again')
      if (misses >= 2) rt.hud.toast('工具箱のほうを向いて待っていて、すべり落ちたら、すぐ J！', 4)
      await this.wait(0.6)
    }
    this.lock(rt, true)
    void this.cine(rt, { look: site.toolbox.point.clone(), hold: Infinity, inSec: 0.7, fov: 36 })
    await this.talk(rt, 'ch10_toolbox_ok')
    rt.endCinematic()
    rt.chrono.remove('chrono_toolbox')
    rt.chrono.thaw()
    site.toolbox.reset()
    // 2. ゆらぎを裂く → 裏側の足場
    site.setSeam(0.9)
    await this.talkShot(rt, 'ch10_seam', site.seamPoint, undefined, { fov: 48, label: 'ゆらぎ' })
    this.lock(rt, false)
    // 裏側の足場は 12 秒（のぼる間に閉じたら、もう一度裂けばよい）。歯車の段で縁側から落ちても、
    // もう一度ゆらぎを裂いてのぼれるように、ゆらぎは歯車の段が終わるまで残す
    let uraOpen = 0
    let uraTalked = false
    rt.chrono.add({
      id: 'chrono_seam',
      kind: 'seam',
      label: 'ゆらぎ',
      point: site.seamPoint,
      radius: 0.6,
      enabled: true,
      onAct: () => {
        rt.chrono.slit(site.seamPoint.clone(), { width: 1.1, height: 2.4, seconds: URA_STEP_SEC }).setOpen(1)
        uraOpen = URA_STEP_SEC
        site.setUra(1)
        if (!uraTalked) void this.talk(rt, 'ch10_ura')
        uraTalked = true
      },
    })
    const onBalcony = () => rt.player.position.y > SITE.balcony.y - 0.3 && rt.player.position.z < SITE.balcony.z1 + 0.2 && rt.player.position.x > SITE.balcony.x0
    const seamMark = () => [{ pos: site.seamPoint.clone().add(v(0, 1.6, 0)), label: 'ゆらぎ' }]
    const balconyMark = () => [{ pos: v(SITE.balcony.x1 - 1, SITE.balcony.y + 1.2, (SITE.balcony.z0 + SITE.balcony.z1) / 2), label: '縁側' }]
    /** 裏側の足場の残り時間を進める。開いている間は「縁側へ」、閉じたら「ゆらぎ」 */
    let closed = 0
    const tickUra = () => {
      if (uraOpen <= 0) return
      uraOpen -= this.lastDt
      if (uraOpen > 0) return
      site.setUra(0)
      if (!onBalcony() && ++closed === 2) rt.hud.toast('ゆらぎを裂いたら、すぐに光る足場を Space でとびのって、縁側まで！', 4)
    }
    this.setPhase('seam', seamMark())
    await this.until(
      () => {
        tickUra()
        if (uraOpen > 0) this.setPhase('ura_climb', balconyMark())
        else this.setPhase('seam', seamMark())
        return onBalcony()
      },
      () => this.teleport(rt, v(SITE.balcony.x1 - 1.2, SITE.balcony.y, (SITE.balcony.z0 + SITE.balcony.z1) / 2), Math.PI / 2),
    )
    if (!this.alive) return
    await this.wait(1.2)
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
      seconds: 10,
      onAct: () => site.gear.freeze(true),
      onThaw: () => site.gear.freeze(false),
    })
    const goal = site.goal
    const gearMarks = () => [
      { pos: site.gear.point.clone().add(v(0, 2.0, 0)), label: '歯車' },
      { pos: goal.clone().add(v(0, 1.4, 0)), label: 'からくり時計' },
    ]
    this.setPhase('gear', gearMarks())
    let fell = false
    await this.until(
      () => {
        tickUra()
        // 縁側から落ちた（足場の高さより下）：もう一度ゆらぎからのぼる
        const below = rt.player.position.y < SITE.balcony.y - 1.0 && rt.player.grounded
        if (below && !fell) rt.hud.toast('落ちちゃった！ もう一度ゆらぎを裂いて、縁側へのぼろう', 3)
        if (below || (fell && rt.player.position.y < SITE.balcony.y - 0.3)) {
          fell = true
          if (uraOpen > 0) this.setPhase('ura_climb', balconyMark())
          else this.setPhase('seam', seamMark())
        } else if (fell && onBalcony()) {
          fell = false
          this.setPhase('gear', gearMarks())
        }
        // からくり時計の足場の上（板のどこでも）
        const p = rt.player.position
        const L = SITE.karakuri.ledge
        return p.x > L.x0 - 0.2 && p.x < L.x1 + 0.2 && p.z > L.z0 - 0.2 && p.z < L.z1 + 0.2 && p.y > goal.y - 0.4
      },
      () => this.teleport(rt, goal.clone(), Math.PI / 2),
    )
    rt.chrono.remove('chrono_gear')
    rt.chrono.remove('chrono_seam')
    site.setUra(0)
    site.setSeam(0)
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
      ['mem_please', V7_ART.memPlease, ['思い出', 'お母さんの病室']],
      ['mem_matane', V7_ART.memMatane, ['思い出', '最後の日の夕方']],
      ['mem_sky', V7_ART.memNightSky, ['思い出', 'ある夜']],
    ]
    await this.fade(false, 0.3, '#fff')
    for (const [key, img, place] of mems) {
      if (!this.alive) return
      await this.playFlashback(this.L(key) as FlashbackLine[], img, place)
    }
    // 佐伯さんの声（ふたの裏の小さな板が光る）
    this.teleport(rt, site.shrine.front, faceYaw(site.shrine.front, SITE.shrine.pos))
    site.shrine.setPlateGlow(1)
    void this.cine(rt, { look: site.shrine.boxPos.clone(), from: site.shrine.boxPos.clone().add(v(1.6, 0.6, 0.4)), hold: Infinity, inSec: 1.0, fov: 40 })
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
    this.teleport(rt, v(13.4, 0, -40.8), faceYaw(v(13.4, 0, -40.8), v(13.4, 0, -46)))
    this.placeSora(v(15.6, 0, -38.4), faceYaw(v(15.6, 0, -38.4), v(13, 0, -45)))
    await this.wait(0.3)
    await this.fade(false, 0.8)
    // 中庭の空にひび → トワ
    const towaAt = v(13.4, 2.2, -46.4)
    const slit = rt.chrono.slit(towaAt.clone().add(v(0, 1.0, -1.2)), { width: 2.2, height: 4.2, normal: v(0, 0, 1) })
    slit.setOpen(1)
    this.showTowa(towaAt, rt.player.position, 'idle')
    rt.shake(0.4)
    // ネクマックスの左うしろから、ひびの前に浮かぶトワを見上げる（中庭の南の壁ぎわにカメラが押しこまれないように、位置を決める）
    void this.cine(rt, { look: v(13.4, 2.4, -45.0), from: v(11.6, 2.3, -37.4), hold: Infinity, inSec: 1.2, fov: 54, marker: { pos: towaAt.clone().add(v(0, 2.4, 0)), label: 'トワ' } })
    await this.talk(rt, 'ch10_towa')
    rt.endCinematic()
    this.lock(rt, false)
    // 戦い：影（K で切れる）・影の弾（J で止める）・ランプの黒い糸（光ったら J で裂く、3 回）
    rt.combat.enabled = true
    rt.combat.setCheckpoint(v(13.4, 0, -40.8), Math.PI)
    this.duel = { thread: 0, window: 0, shots: [], fireT: 2.5, wave: 0 }
    rt.combat.showBossBar('トワ', 1)
    // 影は 2 → 2 → 3 匹（前は 3 → 3 → 4。子どもには影の数が多く、やられてばかりになる）
    this.spawnShades(rt, 2)
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
        if (d.thread < 3) this.spawnShades(rt, 1 + d.thread)
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
    void this.cine(rt, { look: this.towa.root.position.clone().add(v(0, 1.3, 0)), hold: Infinity, inSec: 1.0, fov: 44 })
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
      const vel = rt.player.position.clone().add(v(0, 0.7, 0)).sub(mesh.position).normalize().multiplyScalar(SHOT_SPEED)
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
    this.setPhase('dial1186', [{ pos: v(F.PORTAL.x, F.PORTAL.y + 2.6, F.PORTAL.z), label: 'IDOのわっか' }])
    await this.waitF(front, 2.8, 'ダイヤル')
    if (!this.alive) return
    await this.runDial(rt, 1186, 'カンボジアの遺跡のかんばん', ruinsRecord)
    if (!this.alive) return
    this.lock(rt, true)
    this.ring.showUrl(V7_ART.relief1186, 1.4)
    await this.talk(rt, 'ch10_dial_ok')
    this.lock(rt, false)
    // 遺跡のかんばんの QR を読む
    await this.readQr(rt, QR_RECORDS.ruins1186, 'qr1186')
    if (!this.alive) return
    rt.oreGlow(2)
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
    this.towa.setRim('#b08cff', 1.0)
    void this.cine(rt, { look: TOWER.towa.pos.clone().add(v(0, 1.2, 0)), from: v(4.4, 1.8, 6.4), hold: Infinity, inSec: 1.2, fov: 26, marker: { pos: TOWER.towa.pos.clone().add(v(0, 2.6, 0)), label: 'トワ' } })
    await this.until(() => this.sky.done)
    await this.talk(rt, 'ch12_towa')
    rt.endCinematic()
    // 黒い手 3 本：ふりおろして止まったところを裂く（空を裂くまで、祭りの光は一段落とす）
    this.startHands(rt, 'cut')
    this.fs.setAction(true)
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
    this.fs.setAction(true)
    this.showTowa(TOWER.towa.pos, v(1.5, 0, 6), 'raiseLamp')
    this.lock(rt, true)
    // ソラとならんで、時計台の上の大きなゆらぎを見上げる（2 人のうしろから。ゆらぎは画面の上に。
    // ソラは街頭ビジョンの前ではなく、ネクマックスの右へ）
    await this.fade(true, 0.35)
    this.teleportSpawn(rt, 'night_plaza')
    this.placeSora(v(2.4, 0, 7.0), faceYaw(v(2.4, 0, 7.0), v(TOWER.cx, 0, TOWER.cz)))
    this.ch.tower.setSkySeam(1)
    void this.cine(rt, { look: v(2.31, 4.2, 0.51), from: v(1.9, 1.5, 12.2), hold: Infinity, inSec: 0.3, fov: 64 })
    await this.fade(false, 0.35)
    await this.talk(rt, 'ch12_now')
    rt.endCinematic()
    // 操作にもどったら、ゆらぎの方を見上げる
    rt.camRig.turnTo(rt.player.facing, -0.42)
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
    this.ch.tower.setSkySeam(1)
    await this.until(() => opened, () => (opened = true))
    this.ch.tower.setSkySeam(0)
    rt.chrono.remove('chrono_sky')
    if (!this.alive) return
    this.lock(rt, true)
    const door = rt.chrono.slit(seam.clone(), { width: 5, height: 9, tone: 'dawn' })
    door.setOpen(1)
    this.lens.set(true, true)
    rt.shake(0.6)
    void this.cine(rt, { look: seam.clone(), hold: 2.4, inSec: 1.2, fov: 56 })
    await this.wait(2.6)
    this.lock(rt, false)
    this.setPhase('ura')
    // 裏側へ（扉から出ると、広場へ転がり出る）
    const out = this.spawnPoint('night_plaza')
    await this.ura.run(rt, { towa: this.towa, lamp: this.lamp, sora: { ringPos: v(F.PORTAL.x, F.PORTAL.y, F.PORTAL.z) }, exitTo: { pos: out.pos.clone(), yaw: out.facing } })
    if (!this.alive) return
    door.close()
    // ランプはトワの手へもどす（光はもう消えている）
    this.towa.holdLamp(this.lamp)
    this.lamp.root.position.set(0, 0, 0)
    this.lamp.root.rotation.set(0, 0, 0)
    this.lamp.root.visible = false
    if (!this.f('v7_orm_down')) this.set(rt, 'v7_orm_down')
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
    void this.cine(rt, { look: this.towa.root.position.clone().add(v(0, 0.8, 0)), hold: Infinity, inSec: 1.2, fov: 42 })
    await this.talk(rt, 'ch12_ending')
    rt.endCinematic()
    await this.talk(rt, 'ch12_festival')
    this.showKeychain(rt, true)
    await this.wait(1.0)
    this.showKeychain(rt, false)
    // 絵の下で画面を黒くしておく（おわりにのとびらを、フィールドより先に）
    void this.fade(true, 0.8)
    await this.playFlashback(this.L('ending_card') as FlashbackLine[], V7_ART.endingFestival, ['10月18日の夜', 'お祭りの明かり'])
    if (!this.alive) return
    await this.fade(true, 0.01)
    this.set(rt, 'v7_ending')
    await rt.chapter()
    this.lock(rt, false)
  }

  // ================================================================== おわりに

  private async sceneEpilogue(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    await this.fade(true, 0.01)
    // おわりにのとびら（もう出していれば何もしない）。黒いうちに
    await rt.chapter()
    this.setPart('morning', rt, false)
    this.ch.site.setVariant('courtyard')
    this.ch.site.shrine.takeClaw()
    this.hideTowa()
    this.teleportSpawn(rt, 'loop_morning')
    this.props.street.setNews(this.newsEpilogue())
    this.props.street.pulse()
    await this.fade(false, 1.0)
    const vision = this.props.street.center
    void this.cine(rt, { look: vision, from: vision.clone().add(v(1.6, -1.2, 4.4)), hold: Infinity, inSec: 1.2, fov: 48 })
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
    void this.cine(rt, { look: this.towa.root.position.clone().add(v(0, 1.2, 0)), hold: Infinity, inSec: 1.0, fov: 46 })
    await this.talk(rt, 'epi_towa')
    rt.endCinematic()
    await this.playFlashback([{ speaker: 'ソラ', text: 'まずは、今日の思い出から！' }], V7_ART.epilogueMorning, ['おわり', 'ネクマックスと、時を裂く爪'])
    if (!this.alive) return
    this.set(rt, 'v7_epilogue')
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
    // 時計台のコース（回る大歯車・大きな針・回る歯車の金具）は、いつも動く。乗っていれば一緒に回る
    this.ch.course.update(dt)
    this.ch.course.carry(rt.player, dt)
    this.updateDial(dt, frame, rt)
    this.watchMisses(frame, rt)
    this.updateHands(dt, rt)
    this.fence?.update(dt, rt.player)
    if (this.climb && !this.busy && !rt.talking) this.climb.update(dt, rt)
    this.updateDuel(dt, rt)
    this.updateBalloon(rt)
    this.watchVrTry(frame, rt)
    if (!this.duel) rt.combat.passive = this.busy || rt.talking || rt.inCinematic
    this.mob?.update(dt, rt, mobPhaseV7(this.f, this.part), this.busy || this.climb !== null)
    // 裏側（UraBattle）は出たあとも自分の時計で暗転を明けるので、active でなくても毎フレーム回す
    this.ura.update(dt, frame, rt)
  }

  /** J の空振り（狙える物が照準に無いのに J）を段階ごとに数えて、2 回目でヒント（その後も 4 回ごと） */
  private missPhase = ''
  private misses = 0
  private watchMisses(frame: ActionFrame, rt: StageRuntime): void {
    if (this.phase !== this.missPhase) {
      this.missPhase = this.phase
      this.misses = 0
    }
    if (this.busy || !frame.pressed.has('claw_fire') || rt.claw.wire.phase !== 'miss') return
    const hint = MISS_HINTS[this.phase]
    if (!hint) return
    this.misses++
    if (this.misses === 2 || (this.misses > 2 && this.misses % 4 === 2)) {
      // スマホでは、キーの言い方（「↑ キーで見上げて」など）をトーストが読みかえる
      rt.hud.toast(hint, 4)
      // 1 章のお使い：2 回まちがえたら、つかむ物をもう一度カメラで見せる
      if (this.phase === 'antenna_hook' || this.phase === 'antenna_swing') this.focusReq = { id: this.phase === 'antenna_hook' ? 'hook' : 'ring', short: true }
    }
  }

  /** 風船：クローで持ったか・置いてしまったか（わたすのは F。interact） */
  private updateBalloon(rt: StageRuntime): void {
    const b = this.props.balloon
    if (this.balloonFree >= 0) {
      this.balloonFree += this.lastDt
      b.def.enabled = false
      return
    }
    const w = rt.claw.wire
    const mine = w.target?.id === b.def.id
    if (this.balloon === 'caught' && mine && (w.phase === 'carrying' || w.phase === 'reeling')) this.balloon = 'carry'
    else if (this.balloon === 'carry' && !(mine && (w.phase === 'carrying' || w.phase === 'reeling'))) {
      // J で置いた・はなれた：風船は、ふわっと電灯へもどる（もう一度取れる）
      rt.claw.sendHomeById(b.def.id)
      b.def.enabled = true
      this.balloon = 'caught'
      rt.hud.toast('風船が、ふわっと電灯にもどった。もう一度 J で取って、男の子のそばで F', 3.5)
    }
  }

  /** 風船を持って、男の子のそばにいるか */
  private balloonNearKid(rt: StageRuntime): boolean {
    return this.balloon === 'carry' && Math.hypot(rt.player.position.x - BALLOON_KID.x, rt.player.position.z - BALLOON_KID.z) < 2.6
  }

  private lensNearSora(rt: StageRuntime): boolean {
    return !!this.lensGive && this.lensCarried(rt) && Math.hypot(rt.player.position.x - this.sora.root.position.x, rt.player.position.z - this.sora.root.position.z) < 2.8
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    this.fs.update(dt, t)
    this.ch.update(dt, t)
    this.props.update(dt)
    this.ring.update(dt)
    this.lens.update(dt)
    this.sky.update(dt, rt)
    this.hands.update(dt, t)
    this.slamRings.update(dt)
    this.fx?.update(dt)
    this.flash?.update(dt)
    // 光る輪の道すじ：ショットの間は描いて玉を走らせ、カメラがもどったら消す
    const arc = this.arc
    if (arc) {
      arc.fx.update(dt, arc.short ? 1.0 : 4.6)
      if (!rt.inCinematic) {
        arc.fx.fadeOut(dt)
        arc.off += dt
        if (arc.off > 0.6) {
          arc.fx.dispose()
          this.arc = null
        }
      }
    }
    if (this.rt) this.updateSora(dt, rt)
    // IDO の VR：記録の町の動きと、カメラ（シェルのカメラのあとで、目の位置と見ている向きに置きなおす）
    this.vrVisitors.update(dt)
    this.vr.update(dt)
    if (this.vr.active) this.vr.apply(rt.camera, rt.camRig, dt)
    // QR を読む光：ネクマックスの目から台の QR へ
    if (this.scanT > 0) {
      this.scanT = Math.max(0, this.scanT - dt)
      const eye = rt.player.position.clone().add(v(-Math.sin(rt.player.facing) * 0.14, 0.86, -Math.cos(rt.player.facing) * 0.14))
      const k = Math.min(1, this.scanT / 0.3, (1.8 - this.scanT) / 0.25)
      this.beam.set(eye, this.ch.qr.qrPos, Math.max(0, k))
    } else this.beam.set(this.ch.qr.qrPos, this.ch.qr.qrPos, 0)
    // 裏側の間は、トワとランプの update を UraBattle がする（二重にしない）
    this.ura.animate(dt, t)
    if (!this.ura.active) {
      this.lamp.update(dt, t)
      if (this.towa.root.visible) this.towa.update(dt, 0)
    }
    // 4 章のてっぺん：ねらうランプの位置（はらいのける間は、ステージが動かす）
    if (this.lampDef.enabled && !this.lampHold) this.lamp.center(this.lampDef.point)
    if (this.fx) this.fx.setAspect(rt.camera.aspect)
    this.mob?.render(dt)
  }

  // ================================================================== F・案内・目標

  interact(rt: StageRuntime): boolean {
    // 選ぶ画面：いま選んでいる物で決める
    if (this.choice.open) {
      this.choice.pick()
      return true
    }
    if (this.ura.active && this.ura.interact(rt)) return true
    // IDO の VR：見回すのをおわる
    if (this.vrDone) {
      const d = this.vrDone
      this.vrDone = null
      d()
      return true
    }
    if (this.dial) {
      if (this.dial.logic.locked) this.finishDial()
      else rt.hud.toast('石の音と記録の音がそろうまで、← → で回そう', 2)
      return true
    }
    // 風船を男の子にわたす
    if (this.balloonNearKid(rt)) {
      this.giveBalloon(rt)
      return true
    }
    // 共鳴レンズをソラにわたす
    if (this.lensNearSora(rt)) {
      const g = this.lensGive
      this.lensGive = null
      g?.()
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
      void this.talk(rt, this.soraIdleLine())
      return true
    }
    // 町の人と話す
    if (!this.busy && this.mob?.interact(rt)) return true
    return false
  }

  /** ソラに F で話しかけたとき（場面のあいま） */
  private soraIdleLine(): string {
    if (this.lensGive) return 'sora_hint_lens'
    switch (this.phase) {
      case 'balloon_take':
      case 'balloon_give':
        return 'sora_hint_balloon'
      case 'antenna_hook':
      case 'antenna_swing':
      case 'antenna_fix':
        return 'sora_hint_antenna'
      case 'keychain':
        return 'sora_hint_keychain'
      default:
        return 'sora_wait'
    }
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.choice.open) return [{ key: 'W／S', label: '選ぶ' }, { key: 'F', label: '決定' }]
    if (this.ura.active) return this.ura.hints(rt)
    if (this.dial) return [{ key: '← →', label: '回す' }, { key: 'F', label: this.dial.logic.locked ? '決める' : 'そろえてから' }]
    if (this.vrDone) return [{ key: '↑↓←→', label: '見回す' }, { key: 'F', label: 'おわる' }]
    if (this.vr.active) return this.vrFalling ? [] : [{ key: '↑↓←→', label: '見回す' }]
    if (this.balloonNearKid(rt)) return [{ key: 'F', label: '風船をわたす' }]
    if (this.lensNearSora(rt)) return [{ key: 'F', label: 'レンズをわたす' }]
    const w = this.fWait
    if (w) {
      const d = Math.hypot(rt.player.position.x - w.pos.x, rt.player.position.z - w.pos.z)
      if (d <= w.reach) return [{ key: 'F', label: w.label }]
    }
    let base: Hint[] | null = null
    switch (this.phase) {
      case 'flee':
        base = [{ key: 'Shift', label: 'ダッシュでにげる' }]
        break
      case 'protect':
        base = [{ key: 'J', label: '黒い手に撃つ' }]
        break
      case 'antenna_swing':
        base = [{ key: 'J', label: '輪にぶら下がる' }, { key: 'WASD', label: 'こぐ' }, { key: 'Space', label: '飛びうつる' }]
        break
      case 'tower_gears':
      case 'tower_hand':
        base = [{ key: 'Space', label: 'ジャンプ' }]
        break
      case 'tower_wall':
      case 'tower_debris':
        base = [{ key: 'WASD', label: '赤い輪からにげる' }]
        break
      case 'tower_gearhook':
      case 'tower_gearhook2':
        base = [{ key: 'J', label: '金色に光ったら飛びつく' }]
        break
      case 'tower_swing1':
      case 'tower_swing2':
      case 'tower_swing3':
        base = [{ key: 'J', label: '輪にぶら下がる' }, { key: 'WASD', label: 'こぐ' }, { key: 'Space', label: '飛びうつる' }]
        break
      case 'tower_top':
        base = [{ key: 'J', label: '金具に飛びつく' }]
        break
      case 'tower_lamp':
        base = [{ key: 'J', label: 'ランプをつかむ' }]
        break
      case 'hands':
        base = [{ key: 'J', label: '止まった手を裂く' }]
        break
    }
    if (this.mob && !this.busy) {
      const h = this.mob.hints(base ?? [], rt)
      if (h.length) return h
    }
    return base
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

  music(): MusicId | null {
    return this.ura.music ?? musicOf(this.step, this.part)
  }

  onClawEvent(e: WireEvent): void {
    if (e.kind === 'connected' && e.target.id === this.props.balloon.def.id) this.props.balloon.grab()
    // 4 章のてっぺん：クローがランプにとどいた
    if (e.kind === 'connected' && e.target === this.lampDef) this.lampGrab?.()
    // 時計台のぼり：光る輪にぶら下がった・手をはなした
    if (this.climb && this.rt) this.climb.onClawEvent(e, this.rt)
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
    if (this.choice.open) {
      this.choice.pick()
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
      goal: this.phase,
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
      balloon: this.balloon,
      choice: this.choice.open ? this.choice.id : null,
      vr: this.vr?.active ?? null,
      fence: this.fence?.closed ?? false,
      climb: this.climb ? { section: this.climb.section, best: this.climb.best, falls: this.climb.falls, hits: this.climb.hits, assists: this.climb.assists, sec: +(this.clock.time - this.climbT0).toFixed(1) } : null,
      climbLog: this.climbLog,
      handHits: this.handHits,
      clock: +this.clock.time.toFixed(2),
      mob: this.mob?.debugInfo() ?? null,
      ...this.ura.debug(),
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
    this.arc?.fx.dispose()
    this.arc = null
    this.ura.dispose()
    this.mob?.dispose()
    this.mob = null
    this.climb?.end()
    this.climb = null
    this.vr?.dispose()
    this.fence?.dispose()
    this.fence = null
    // 夜の環境マップを使ったまま消さない（シェルが次の時代の環境を入れるまでの間）
    if (this.rt && this.nightEnv && this.rt.scene.environment === this.nightEnv.texture) this.rt.scene.environment = this.dayEnv
    this.nightEnv?.dispose()
    this.ch?.dispose()
    this.fs?.dispose()
    this.hands?.dispose()
    this.slamRings?.dispose()
    this.lamp?.dispose()
    this.towa?.dispose()
    this.tear?.dispose()
    this.ring?.dispose()
    if (this.keychain) this.keychain.removeFromParent()
    this.rt = null
  }
}

const KEY_STALL_X = 15.2

/** 4 章の黒い手の名前（地下でソラをつかむ手・時計台のてっぺんへ来る手） */
const CELLAR_HAND = 'cellar'
const TOWER_HAND = 'tower'
/** 2 章：黒い手が出ている間の、夜の広場の柵（北の通り・東の屋台の裏・西の回廊の下へは行かない。南のゲートは中） */
const PLAZA_FENCE = { x0: -15.5, x1: 13.6, z0: -13.5, z1: 19.6 } as const
/** 4 章：地下の部屋と通路（階段の下でふさぐ） */
const UNDER_FENCE = [
  { x: -11.7, z: -41.7 },
  { x: -6.4, z: -41.7 },
  { x: -6.4, z: -43.3 },
  { x: -0.7, z: -43.3 },
  { x: -0.7, z: -31.7 },
  { x: -6.3, z: -31.7 },
  { x: -6.3, z: -35.9 },
  { x: -11.7, z: -35.9 },
]
/** 4 章のてっぺん：トワのランプの黒い火から出る小さな影の手と、トワが立つ所（屋上の南東） */
const LAMP_HAND = 'lamp_hand'
const TOWA_DECK = v(8.6, TOWER.deckY, -20.4)

/** 10 章のあと：ダイヤルでえらんだ年の、カンボジアの遺跡のかんばんの記録 */
function ruinsRecord(year: number): QrRecord {
  return year === 1186 ? QR_RECORDS.ruins1186 : { era: `${year}年`, title: 'カンボジアの遺跡のかんばん', seed: year }
}

/** 1 章のお使いで見せる物の目印の文字（金色の札） */
const FOCUS_GRAB_LABEL = { hook: '回廊の金具　これをつかむ！', ring: '光る輪　これをつかむ！' } as const
/** 進まないまま、つかむ物をもう一度見せるまでの秒 */
const FOCUS_REPLAY_SEC = 40

/** 時計台のぼりの最初の大歯車 */
const COURSE_FIRST_GEAR = COURSE.gears[0].c.clone()

/** 黒い手のふりおろしが体に当たる半径（予告の赤い輪の内側）と、吹っ飛ぶ速さ */
const HAND_HIT_R = 1.2
const HAND_KNOCK = 6
/** はじめの案内（rt.combat.coach）を出したふりおろしは、この秒だけゆっくり */
const HAND_SLOW = 0.7

/** 風船の男の子の足もと（crowd.ts の INTRO_CROWD の balloon_child） */
const BALLOON_KID = v(-2.49, 0, 11.76)
/** 風船が引っかかる電灯（カメラで見る所）と、手をはなれて引っかかるまでの秒（introProps2086 の float） */
const BALLOON_LAMP = v(-2.8, 4.2, 9.6)
const BALLOON_FLOAT_SEC = 3.5
/** 毎朝の風船の選択肢 */
const BALLOON_OPT = { take: { id: 'take', label: '風船を取ってあげる' }, go: { id: 'go', label: 'ソラのところへ行く' } } as const

/** J を 2 回空振りしたときのヒント（段階 phase ごと） */
const MISS_HINTS: Record<string, string> = {
  balloon_take: '↑ キーで電灯の風船を見上げて、画面のまん中に入れてから J',
  lens: '箱の山のいちばん上の白いケースのほうを向いて、↑ キーで見上げてから J',
  antenna_hook: '回廊のふちの金具のほうを向いて、↑ キーで見上げてから J',
  antenna_swing: 'アーチから下がる光る輪のほうを向いて、↑ キーで見上げてから J',
  protect: 'ソラの上の黒い手のほうを向いてから J',
  save_sora: '部屋から通路へ出て、黒い手が画面のまん中に来るように向いてから J',
  tower_gearhook: '金具が上に回ってきて、金色に光っているときだけ J。足場の東のはしで待って、↑ キーで見上げよう',
  tower_gearhook2: '金具が上に回ってきて、金色に光っているときだけ J。足場の南のはしで待って、↑ キーで見上げよう',
  tower_swing1: '↑ キーで金色の光る輪を見上げて、画面のまん中に入れてから J',
  tower_swing2: '↑ キーで金色の光る輪を見上げて、画面のまん中に入れてから J',
  tower_swing3: '↑ キーで金色の光る輪を見上げて、画面のまん中に入れてから J',
  tower_top: '回廊の南のはしで、↑ キーでてっぺんの金色の金具を見上げてから J',
  tower_lamp: '立ち止まって、トワの手さげランプのほうを向いてから J',
  seam: '池の上の、うすく光る縦のすじ（ゆらぎ）のほうを向いて J',
  gear: '縁側の西の端で、大歯車のほうを向いて J',
  duel: '影を K でたおすと、ランプの黒い糸が光る。光ったら、糸をねらって J',
  duel_thread: 'トワのランプの、光っている黒い糸をねらって J',
  test_slit: 'わっかの前の、小さなゆらぎのほうを向いて J',
  hands: '手が地面にささって止まっている間に、その手をねらって J',
  sky_seam: '↑ キーで時計台の上の大きなゆらぎを見上げて J',
}

/** 10 章の決闘：影の弾の速さ（m/s）。ランプから 5m ほどの所で、当たるまで約 1.4 秒 */
const SHOT_SPEED = 3.6

/** 10 章の練習：ゆらぎを裂いたとき、裏側の足場が見えている秒数 */
const URA_STEP_SEC = 12

/** 時計台をのぼる間のカメラの距離（ふだんは 4.4。引くほど、まわりの足場と歯車が見やすい） */
const CLIMB_CAM_DIST = 5.5

/** カメラを p のうしろ（at の反対側）に置く向き：at が画面のまん中の方に来る（camRig.yaw の向き） */
function camYawToward(p: THREE.Vector3, at: THREE.Vector3): number {
  return Math.atan2(p.x - at.x, p.z - at.z)
}
