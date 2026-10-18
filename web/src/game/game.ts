// ゲームのシェル：ずっと残るもの（レンダラ・後処理・HUD・入力・ネクマックス・カメラ・NMClaw・フラグとセーブ・
// 時空移動）を持ち、ステージ（時代）を 1 つだけ読み込んで動かす。移動のときは古いステージの GPU 資源と物理を解放してから
// 新しいステージを組み立て、シェーダを事前コンパイルしてから見せる。毎フレームの流れは 1726年の縦切り試作（slice.ts）と同じ。
// スマホのときだけタッチ操作（player/touchInput.ts）を足す。PC の操作・表示は変えない。
import * as THREE from 'three'
import { readParams, type QualitySettings } from '../render/quality'
import { createRenderer, AdaptiveResolution } from '../render/renderer'
import { createPost, type PostChain } from '../render/post'
import { uTime } from '../render/materials'
import { createPhysics, type Physics } from '../player/physics'
import { PlayerController } from '../player/controller'
import { CameraRig } from '../player/cameraRig'
import { createInput, type InputState } from '../player/input'
import { KEYBOARD_BINDINGS, TOUCH_BINDINGS, resolveActions, type ActionFrame, type Binding } from '../player/inputActions'
import { shouldUseTouch } from '../player/touchLogic'
import { TouchControls } from '../player/touchInput'
import { ClawSystem } from '../player/clawSystem'
import { TARGET_CATEGORY, type ClawTargetType } from '../player/clawLogic'
import { PART_NAMES, canOpenHub, clawArm, initialEquipment, selectArm, type Equipment } from '../player/equipment'
import { applyPose, applyRigClaw, applyRigOreGlow, applyRigSwing, choosePose } from '../player/poseDriver'
import { loadCharacter, type Character, type CharacterName } from '../world/characters'
import { Hud, LoadingOverlay, type Hint } from '../ui/hud'
import { TimelineState } from '../core/timelineState'
import { StoryState } from '../core/storyFlags'
import { GameSave } from '../core/gameSave'
import { eraTint } from '../core/eras'
import { parseGameParams, type GameParams } from './params'
import { TravelMachine, eraStage, stageEra, type StageKey, type TravelRequest, type TravelVerdict } from './travel'
import { TravelFx } from './travelFx'
import { RiftFx } from './riftFx'
import { applyEnvironment, type AppliedEnvironment } from './env'
import { disposeObject3D } from './dispose'
import { DialogueQueue, lineDuration, type DialogueLine } from './dialogueQueue'
import { createStage, DEFAULT_STAGE, STAGE_INFO } from './registry'
import { CineDirector, autoFramePosition, type CineShot } from './cinematic'
import { CineMarkerFx } from './cineMarker'
import type { Stage, StageLoadContext, StageRuntime, StageWorld } from './stage'

/** 読み込み表示を更新するために 1 フレーム譲る（非表示タブで rAF が止まっても進むよう setTimeout も併用） */
export const nextFrame = () =>
  new Promise<void>((r) => {
    let done = false
    const fin = () => {
      if (!done) {
        done = true
        r()
      }
    }
    requestAnimationFrame(fin)
    setTimeout(fin, 60)
  })

declare global {
  interface Window {
    __sliceReady?: boolean
    __slice?: unknown
    __game?: unknown
  }
}

/** 照準が合っているときのキー案内（J の後の言葉） */
const FIRE_VERB: Record<ClawTargetType, string> = {
  pull_object: 'つかむ',
  pull_player: '飛びつく',
  swing_anchor: 'ぶら下がる',
  hold_mechanism: '歯車をつかむ',
}

/** 入力なしの軸（毎フレーム作らない） */
const ZERO_AXIS = Object.freeze({ x: 0, y: 0 })

/** 開始直後に出す操作案内（秒） */
const START_HINT_TIME = 14

/** 読み込んでいるステージと、そのステージ用に作った物理・プレイヤー・クロー */
type Active = {
  stage: Stage
  world: StageWorld
  env: AppliedEnvironment
  phys: Physics
  player: PlayerController
  camRig: CameraRig
  claw: ClawSystem
  rt: StageRuntime
  /** 解放済み（古いステージの非同期の続きが、新しいステージで会話・演出を始めないように） */
  dead?: boolean
}

/** 時代ごとに登場する話者（HUD の顔アイコンを読み込み時に先に作る） */
const SPEAKERS_BY_STAGE: Partial<Record<StageKey, string[]>> = {
  '1726': ['源兵衛', 'おはる'],
  '2026': ['マツイ社長', '佐伯'],
  '2086': ['ソラ'],
}

export class Game {
  private readonly app: HTMLDivElement
  private readonly q: QualitySettings
  private readonly fixedRatio: boolean
  private readonly gp: GameParams
  private readonly urlp: URLSearchParams
  private readonly renderer: THREE.WebGLRenderer
  private readonly camera: THREE.PerspectiveCamera
  private readonly scene = new THREE.Scene()
  private readonly post: PostChain
  private readonly hud: Hud
  private readonly input: InputState & { endFrame(): void }
  /** 入力の割り当て（スマホではキーボードにタッチを足す） */
  private readonly bindings: readonly Binding[]
  /** スマホのタッチ操作（PC では null） */
  private readonly touch: TouchControls | null
  /** タッチ：右腕の輪（つかむボタン）に出す言葉 */
  private clawLabel = 'つかむ'
  private readonly loading: LoadingOverlay
  private readonly travelFx: TravelFx
  private readonly rift = new RiftFx()
  private readonly travel = new TravelMachine()
  readonly story = new StoryState(new TimelineState())
  private readonly saver = new GameSave()
  private readonly equipment: Equipment = initialEquipment()
  private readonly lanternLights: THREE.PointLight[] = []
  private nexmax!: Character
  private active: Active | null = null
  /** カメラの演出（rt.cinematic）とその目印・上下の黒帯 */
  private readonly cine = new CineDirector()
  private readonly cineMarker: CineMarkerFx
  private readonly cineBars: HTMLDivElement
  private readonly cineAuto = new THREE.Vector3()
  private readonly cineDir = new THREE.Vector3()
  private adaptive!: AdaptiveResolution
  // 進行中の状態
  private shotIndex = -1
  private paused = false
  private menuOpen = false
  private playTime = 0
  private airTime = 0
  private landTimer = 0
  private fireTimer = 0
  private oreGlow = 0
  private attackToastCooldown = 0
  private controlLocked = false
  private readonly savedPlayer = new THREE.Vector3()
  private talk: { queue: DialogueQueue; resolve: () => void } | null = null
  private lastFrame: ActionFrame | null = null
  private departT = 0
  /** 起動直後、時代カードと stage.revealed を出すまでの残り時間（-1 = なし） */
  private bootReveal = -1
  private readonly t0 = performance.now()

  constructor(app: HTMLDivElement, ui: HTMLDivElement) {
    this.app = app
    const params = readParams()
    this.q = params.quality
    this.fixedRatio = params.fixedRatio
    this.gp = parseGameParams(location.search)
    this.urlp = new URLSearchParams(location.search)
    this.loading = new LoadingOverlay(ui)
    this.renderer = createRenderer(app, this.q)
    const { w, h } = this.size()
    this.camera = new THREE.PerspectiveCamera(52, w / h, 0.1, 2500)
    this.post = createPost(this.renderer, this.scene, this.camera, this.q)
    this.hud = new Hud(ui)
    if (this.gp.nohud) ui.style.display = 'none'
    this.input = createInput(this.renderer.domElement)
    // スマホ（指が主な入力の端末）だけタッチ操作。つないだキーボードも使えるよう割り当てを足す
    const useTouch = shouldUseTouch({
      param: this.urlp.get('touch'),
      coarse: matchMedia('(pointer: coarse)').matches,
      hoverNone: matchMedia('(hover: none)').matches,
      touchPoints: navigator.maxTouchPoints ?? 0,
    })
    this.bindings = useTouch ? [...KEYBOARD_BINDINGS, ...TOUCH_BINDINGS] : KEYBOARD_BINDINGS
    this.touch = useTouch ? new TouchControls(ui, this.input) : null
    if (this.touch) {
      this.hud.setTouchMode(true)
      const t = this.hud.touchTargets
      this.touch.bindButton(t.rightArm, 'touch:claw')
      this.touch.bindButton(t.leftArm, 'touch:armL')
      this.touch.overlayTap = (x, y) => this.hud.tapPauseAt(x, y)
      document.documentElement.classList.add('touch-ui')
    }
    this.travelFx = new TravelFx(ui)
    this.scene.add(this.rift.group)
    // カメラの演出：黒帯は #ui のいちばん下（HUD の後ろ）、目印はシェルが 1 組だけ持つ
    this.cineBars = document.createElement('div')
    this.cineBars.className = 'cine-bars'
    this.cineBars.innerHTML = '<div class="cine-bar top"></div><div class="cine-bar bottom"></div>'
    ui.insertBefore(this.cineBars, ui.firstChild)
    this.cineMarker = new CineMarkerFx(ui)
    this.scene.add(this.cineMarker.group)
    // 提灯などの点光源（数は固定：近い候補へ毎回移す。ステージをまたいで使い回す）
    for (let i = 0; i < 6; i++) {
      const pl = new THREE.PointLight('#ffae5a', 0, 7, 2)
      this.scene.add(pl)
      this.lanternLights.push(pl)
    }
  }

  /** 画面の大きさ（毎フレーム新しいオブジェクトを作らないよう、resize のときだけ測り直す） */
  private readonly view = { w: 1, h: 1 }
  private size(): { w: number; h: number } {
    this.view.w = this.app.clientWidth || window.innerWidth
    this.view.h = this.app.clientHeight || window.innerHeight
    return this.view
  }

  private step(p: number, msg: string): void {
    this.loading.set(p, msg)
    if (this.gp.debug) console.info(`[game] ${(performance.now() - this.t0).toFixed(0)}ms ${msg}`)
  }

  // ================================================================ 起動

  async boot(): Promise<void> {
    this.step(0.05, 'レンダラを準備中…')
    await nextFrame()
    // フラグ：?newgame でセーブを消す、?continue で再開、?flags= で上書き
    if (this.gp.newGame) this.saver.clear()
    let stageKey: StageKey = this.gp.stage ?? DEFAULT_STAGE
    let spawn: string | null = this.gp.spawn
    if (this.gp.continue) {
      const loaded = this.saver.load(this.story)
      if (loaded) {
        stageKey = this.gp.stage ?? eraStage(loaded.era) ?? DEFAULT_STAGE
        spawn = this.gp.spawn ?? loaded.checkpoint
      }
    }
    const unknown = this.story.applyFlagList(this.gp.flags)
    if (unknown.length) console.warn('[game] 未知のフラグ', unknown)
    this.loading.setEra(STAGE_INFO[stageKey].label)
    this.loading.setTheme(stageKey)
    this.hud.setEra(STAGE_INFO[stageKey].label)
    this.hud.setTheme(stageKey)
    // ネクマックス（主人公）はシェルが持ち、ステージをまたいで使い回す
    const nexP = loadCharacter('nexmax', 1.05)
    this.adaptive = new AdaptiveResolution(0.7, Math.min(window.devicePixelRatio, this.q.maxPixelRatio), (r) => {
      this.renderer.setPixelRatio(r)
      this.resize()
    })
    window.addEventListener('resize', () => this.resize())
    this.nexmax = await nexP
    this.scene.add(this.nexmax.root)
    this.travel.start(null, { to: stageKey, cause: 'load', spawn: spawn ?? undefined }, (n) => this.story.get(n), true)
    this.travel.tick(0)
    await this.loadStage(stageKey, spawn, null, (p, msg) => this.step(0.1 + p * 0.9, msg), true)
    // 起動時は光の渦の演出なし（読み込み画面が消えるだけ）。時代カードはショット撮影以外で出す
    this.travel.abort()
    this.step(1, '完了')
    this.loading.hide()
    const a0 = this.active as Active | null
    if (a0 && this.shotIndex < 0) {
      // 読み込み画面が消えてから（0.7 秒）時代カードと到着の演出
      this.bootReveal = 0.7
    }
    this.exposeDebug()
    const timer = new THREE.Timer()
    timer.connect(document)
    const timeScale = Math.min(1, Math.max(0.05, Number(this.urlp.get('slowmo') ?? 1) || 1))
    let fpsAcc = 0
    let fpsFrames = 0
    let fps = 60
    this.renderer.setAnimationLoop(() => {
      timer.update()
      const dt = Math.min(timer.getDelta(), 0.1) * timeScale
      this.frame(dt)
      fpsAcc += dt
      fpsFrames++
      if (fpsAcc >= 0.5) {
        fps = fpsFrames / fpsAcc
        if (!this.fixedRatio && this.active) this.adaptive.sample(fpsAcc / fpsFrames)
        fpsAcc = 0
        fpsFrames = 0
      }
      if (this.hud.statsOn) {
        const r = this.renderer
        this.hud.updateStats({ fps, ms: 1000 / Math.max(1, fps), calls: r.info.render.calls, tris: r.info.render.triangles, ratio: r.getPixelRatio(), quality: this.q.level, textures: r.info.memory.textures, programs: r.info.programs?.length ?? 0 })
      }
    })
    if (this.gp.stats) this.hud.toggleStats(true)
    window.__sliceReady = true
  }

  private resize(): void {
    const { w, h } = this.size()
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
    this.post.setSize(w, h)
  }

  // ================================================================ ステージの読み込み・解放

  private async loadNpc(name: CharacterName, height: number, fallback?: () => Character): Promise<Character> {
    if (fallback) {
      try {
        const head = await fetch(`./models/${name}.glb`, { method: 'HEAD' })
        const type = head.headers.get('content-type') ?? ''
        if (!head.ok || type.includes('text/html')) return fallback()
      } catch {
        return fallback()
      }
    }
    return loadCharacter(name, height)
  }

  private async loadStage(key: StageKey, spawnId: string | null, from: StageKey | null, progress: (p: number, msg: string) => void, initial = false): Promise<void> {
    const stage = await createStage(key)
    this.hud.setEra(stage.label)
    this.hud.setTheme(key)
    // その時代の話者アイコンを先に作っておく（初めて話したときに止まらないように）
    this.hud.preloadSpeakers(SPEAKERS_BY_STAGE[key] ?? [])
    const loadCtx: StageLoadContext = {
      renderer: this.renderer,
      quality: this.q,
      story: this.story,
      progress: (p, msg) => progress(Math.min(0.7, p * 0.7), msg),
      yieldFrame: nextFrame,
      loadNpc: (n, h, fb) => this.loadNpc(n, h, fb),
      spawnId,
      from,
      params: this.urlp,
    }
    const world = await stage.load(loadCtx)
    this.scene.add(world.root)
    progress(0.72, '物理と環境光を準備中…')
    await nextFrame()
    const [phys, env] = await Promise.all([createPhysics(world.colliders), applyEnvironment(this.renderer, this.scene, this.post, this.q, stage.environment)])
    const sp = stage.spawn(spawnId)
    const player = new PlayerController(phys, sp.pos.clone())
    player.facing = sp.facing
    const camRig = new CameraRig(this.camera, phys, player.collider)
    camRig.yaw = sp.camYaw
    camRig.pitch = sp.camPitch
    const claw = new ClawSystem(phys, player, world.claw.targets, world.claw.movables)
    this.scene.add(claw.beam.group)
    // 状態をリセット
    this.shotIndex = -1
    this.paused = false
    this.menuOpen = false
    this.airTime = 0
    this.landTimer = 0
    this.fireTimer = 0
    this.controlLocked = false
    this.departT = 0
    this.endCineUi()
    this.hud.setPaused(false)
    this.hud.setMenu(false)
    this.hud.setGate(null)
    this.hud.setShot(null)
    this.hud.setPlayUiVisible(true)
    this.nexmax.root.scale.setScalar(1)
    this.nexmax.root.position.copy(player.position)
    this.nexmax.root.rotation.y = player.facing
    this.nexmax.setPose('idle')
    this.nexmax.setAim(null)
    this.camera.fov = 55
    this.camera.updateProjectionMatrix()
    const a = { stage, world, env, phys, player, camRig, claw } as Active
    a.rt = this.makeRuntime(a)
    claw.onEvent = (e) => {
      switch (e.kind) {
        case 'fired':
          this.fireTimer = 0.25
          break
        case 'missed':
          this.fireTimer = 0.32
          break
        case 'arrived':
          // 金具の正面側（開けた側）の少し上へカメラを回す（壁際・手すりでカメラが詰まらないように）
          if (e.target.facing) camRig.turnTo(Math.atan2(e.target.facing.x, e.target.facing.z), 0.62)
          break
      }
      stage.onClawEvent?.(e, a.rt)
    }
    player.onRespawn = () => {
      claw.reset()
      this.hud.toast('水に落ちた！ 近くのチェックポイントから再開')
      this.story.timeline.addMetric('falls')
      stage.onRespawn?.(a.rt)
    }
    this.story.timeline.setFlag('current_era', stage.era)
    stage.begin(a.rt)
    // 撮影用ショット（起動時の ?shot= のみ）
    this.savedPlayer.copy(sp.pos)
    const shots = stage.shots
    let focus = sp.pos.clone()
    if (shots) {
      const initialShot = initial && this.gp.shot ? shots.ids.indexOf(this.gp.shot) : -1
      if (initialShot >= 0) {
        this.shotIndex = initialShot
        shots.apply(initialShot, a.rt)
        this.hud.setPlayUiVisible(false)
        focus = shots.focus(initialShot).clone()
      } else shots.apply(-1, a.rt)
    }
    // 事前コンパイル（クローの見た目と光の裂け目も含める）
    progress(0.85, 'シェーダを準備中…')
    await nextFrame()
    this.resize()
    this.assignLights(world, focus)
    env.sun.follow(focus)
    const beamWasActive = claw.beam.active
    claw.beam.setActive(true)
    claw.beam.update(0, sp.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), sp.pos.clone().add(new THREE.Vector3(0, 0.6, -2)))
    const riftWasShown = this.rift.visible
    if (!riftWasShown) this.rift.warm(true, sp.pos)
    this.cineMarker.warm(true, sp.pos)
    await Promise.race([this.renderer.compileAsync(this.scene, this.camera), new Promise((r) => setTimeout(r, 6000))])
    if (!riftWasShown) this.rift.warm(false, sp.pos)
    this.cineMarker.warm(false, sp.pos)
    claw.beam.setActive(beamWasActive)
    env.sky.position.copy(this.camera.position)
    for (let i = 0; i < 2; i++) {
      this.renderer.info.reset()
      this.post.render(1 / 60)
    }
    this.active = a
    progress(1, '完了')
  }

  private unloadStage(a: Active): void {
    a.dead = true
    this.cancelCinematic()
    this.endDialogue()
    this.hud.clearDialog()
    this.hud.hideIdo()
    this.hud.setGate(null)
    this.hud.setReticle({ mode: 'idle' })
    this.hud.setHints([])
    this.rift.hide()
    a.stage.dispose()
    this.scene.remove(a.world.root)
    disposeObject3D(a.world.root)
    this.scene.remove(a.claw.beam.group)
    disposeObject3D(a.claw.beam.group)
    a.env.dispose()
    a.phys.world.free()
    for (const pl of this.lanternLights) pl.intensity = 0
    this.renderer.renderLists.dispose()
  }

  /** 画面が光で覆われた：古いステージを解放して新しいステージを読み込む */
  private async swap(req: TravelRequest): Promise<void> {
    const prev = this.active
    this.active = null
    const from = prev?.stage.key ?? null
    if (prev) this.unloadStage(prev)
    const before = { ...this.renderer.info.memory }
    this.travelFx.setProgress(0.05, '時代の記録を読み込み中…')
    try {
      await this.loadStage(req.to, req.spawn ?? null, from, (p, msg) => this.travelFx.setProgress(p, msg))
    } catch (e) {
      console.error('[game] ステージを読み込めませんでした', e)
      this.travelFx.setProgress(1, '読み込みに失敗しました')
      if (from && from !== req.to) {
        await this.loadStage(from, null, null, (p, msg) => this.travelFx.setProgress(p, msg))
      }
    }
    if (this.gp.debug) console.info('[game] memory after unload', before, 'after load', { ...this.renderer.info.memory })
    this.travel.loaded()
  }

  // ================================================================ ステージから使う機能

  private makeRuntime(a: Active): StageRuntime {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this
    return {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
      post: this.post,
      hud: this.hud,
      quality: this.q,
      params: this.urlp,
      player: a.player,
      camRig: a.camRig,
      claw: a.claw,
      phys: a.phys,
      nexmax: this.nexmax,
      sky: a.env.sky,
      sun: a.env.sun,
      equipment: this.equipment,
      story: this.story,
      rift: this.rift,
      oreGlow: (v) => {
        this.oreGlow = Math.max(this.oreGlow, v)
      },
      travel: (req) => (a.dead ? { ok: false, reason: '' } : this.requestTravel(req)),
      dialogue: (lines) => (a.dead ? Promise.resolve() : this.startDialogue(lines)),
      get talking() {
        return g.talk !== null
      },
      say: (speaker, text, seconds) => {
        if (!a.dead) this.hud.say(speaker, text, seconds)
      },
      save: (checkpoint) => {
        this.saver.save(this.story, a.stage.era, checkpoint)
      },
      setControlLocked: (on) => {
        this.controlLocked = on
      },
      cinematic: (shot) => (a.dead ? Promise.resolve() : this.startCinematic(a, shot)),
      endCinematic: (fast) => this.cine.release(fast),
      get inCinematic() {
        return g.cine.active
      },
      shake: (amount) => this.cine.addShake(amount),
      get playTime() {
        return g.playTime
      },
    }
  }

  requestTravel(req: TravelRequest): TravelVerdict {
    const from = this.active?.stage.key ?? null
    const v = this.travel.start(from, req, (n) => this.story.get(n))
    if (!v.ok) return v
    this.cancelCinematic()
    this.active?.claw.reset()
    this.story.timeline.addMetric('time_travels')
    this.travelFx.begin(from ? eraTint(stageEra(from)) : eraTint(stageEra(req.to)), eraTint(stageEra(req.to)), STAGE_INFO[req.to].label)
    this.travelFx.setProgress(0, '')
    this.departT = 0
    return v
  }

  private showEraCard(key: StageKey, sub: string): void {
    const info = STAGE_INFO[key]
    const t = eraTint(stageEra(key))
    const css = `rgb(${Math.round(t.r * 255)},${Math.round(t.g * 255)},${Math.round(t.b * 255)})`
    this.hud.showEraCard(info.year, info.place, sub, 3.4, css)
  }

  private startDialogue(lines: readonly DialogueLine[]): Promise<void> {
    this.endDialogue()
    return new Promise<void>((resolve) => {
      const queue = new DialogueQueue(lines)
      this.talk = { queue, resolve }
      const l = queue.start()
      if (l) this.showLine(l)
      else this.endDialogue()
    })
  }

  private showLine(l: DialogueLine): void {
    this.hud.say(l.speaker, l.text, lineDuration(l.text) + 1.6)
  }

  private endDialogue(): void {
    const t = this.talk
    this.talk = null
    t?.resolve()
  }

  private tickDialogue(dt: number, advance: boolean): void {
    const t = this.talk
    if (!t) return
    const l = advance ? t.queue.advance() : t.queue.tick(dt)
    if (l) this.showLine(l)
    if (t.queue.done) this.endDialogue()
  }

  // ================================================================ 点光源

  /** 近い候補から順に点光源を割り当てる（並べ替え用の配列は使い回す） */
  private readonly lightOrder: number[] = []
  private readonly lightDist: number[] = []
  private assignLights(world: StageWorld, center: THREE.Vector3): void {
    const L = world.lights
    const order = this.lightOrder
    const dist = this.lightDist
    order.length = L.length
    dist.length = L.length
    for (let i = 0; i < L.length; i++) {
      order[i] = i
      dist[i] = L[i].pos.distanceToSquared(center)
    }
    order.sort((x, y) => dist[x] - dist[y])
    for (let i = 0; i < this.lanternLights.length; i++) {
      const pl = this.lanternLights[i]
      const s = i < order.length ? L[order[i]] : null
      if (!s) {
        pl.intensity = 0
        continue
      }
      pl.position.copy(s.pos)
      pl.color.set(s.color)
      pl.intensity = s.intensity * 2.2
      pl.distance = s.dist
    }
  }

  // ================================================================ 1 フレーム

  private lightTimer = 0
  private readonly focus = new THREE.Vector3()
  private readonly hand = new THREE.Vector3()
  private readonly lightCenter = new THREE.Vector3()
  private armKey = ''
  /** 前のフレームで照準を R でロックしていたか（ロック中は止まっていれば対象の方を向く） */
  private lastLocked = false

  private frame(dt: number): void {
    uTime.value += dt
    this.renderer.info.reset()
    const input = this.input
    const frame = resolveActions(input, this.bindings)
    this.lastFrame = frame
    if (input.pressed.has('F3')) this.hud.toggleStats()
    // 時空移動
    for (const e of this.travel.tick(dt)) {
      if (e.kind === 'cover') void this.swap(e.request)
      else if (e.kind === 'revealed') this.showEraCard(e.request.to, this.active?.stage.subtitle ?? '')
      else if (e.kind === 'done') {
        const a = this.active
        if (a) a.stage.revealed?.(a.rt)
      }
    }
    this.travelFx.draw(dt, this.travel.cover, this.travel.phase === 'intro', this.travel.phase === 'loading')
    const a = this.active
    if (!a) {
      input.endFrame()
      return
    }
    if (this.bootReveal > 0) {
      this.bootReveal -= dt
      if (this.bootReveal <= 0) {
        this.showEraCard(a.stage.key, a.stage.subtitle ?? '')
        a.stage.revealed?.(a.rt)
      }
    }
    const { stage, player, claw, rt } = a
    const shots = stage.shots
    // 開発用（操作案内には出さない）：P でショット切替
    if (shots && input.pressed.has('KeyP') && !this.travel.busy) this.setMode(a, this.shotIndex + 1 >= shots.ids.length ? -1 : this.shotIndex + 1)
    if (this.shotIndex >= 0 && shots) {
      if (frame.pressed.has('pause')) this.setMode(a, -1)
      this.focus.copy(shots.focus(this.shotIndex))
    } else {
      if (!this.travel.busy) {
        if (frame.pressed.has('pause')) {
          if (this.menuOpen) this.menuOpen = false
          else this.paused = !this.paused
        } else if (frame.pressed.has('menu') && !this.paused) this.menuOpen = !this.menuOpen
      }
      this.hud.setPaused(this.paused)
      this.hud.setMenu(this.menuOpen)
      if (this.travel.inputLocked) this.departure(a, dt)
      else if (!this.paused && !this.menuOpen) this.gameplay(a, frame, dt)
      this.focus.copy(player.position)
    }
    const frozen = this.shotIndex === -1 && (this.paused || this.menuOpen)
    this.touch?.setPlaying(this.shotIndex === -1 && !frozen && !this.travel.busy)
    this.touch?.setLocked(this.controlLocked || this.cine.active)
    this.touch?.setOverlay(this.shotIndex === -1 && !this.travel.busy ? (this.paused ? 'pause' : this.menuOpen ? 'menu' : null) : null)
    const ndt = frozen ? 0 : dt
    this.nexmax.update(ndt, this.shotIndex === -1 || !shots ? player.speed : shots.nexmaxSpeed(this.shotIndex))
    stage.animate(ndt, uTime.value, rt)
    if (!frozen) this.tickDialogue(ndt, false)
    // クロー（右手首の発射口から）
    this.nexmax.root.updateMatrixWorld(true)
    this.nexmax.handAnchor.getWorldPosition(this.hand)
    if (this.shotIndex >= 0 && shots) {
      shots.update(this.shotIndex, dt, this.hand, rt)
    } else {
      claw.updateVisuals(ndt, this.hand)
      const { w, h } = this.size()
      const u = claw.uiState(this.camera, w, h)
      const s = u.selected ?? u.far
      if (s && !frozen && !this.travel.busy) {
        this.hud.setReticle({ mode: u.selected ? 'target' : 'far', x: s.x, y: s.y, r: s.r, category: TARGET_CATEGORY[s.def.type], label: s.def.label, candidates: u.candidates, locked: u.locked, connected: u.connectedType !== null })
      } else this.hud.setReticle({ mode: 'idle' })
      this.lastLocked = u.locked
      const active = u.phase !== 'idle'
      const key = `${u.holdingLabel ?? ''}|${this.equipment.selected}|${active ? 1 : 0}|${this.equipment.left ?? ''}`
      if (key !== this.armKey) {
        this.armKey = key
        this.hud.setArms({
          right: { name: PART_NAMES.grapple_claw, holding: u.holdingLabel, selected: this.equipment.selected === 'right', active },
          left: { name: this.equipment.left ? PART_NAMES[this.equipment.left] : null, selected: this.equipment.selected === 'left' },
        })
      }
      if (this.touch) this.hud.setClawPrompt(this.clawLabel, u.selected !== null && !active && !this.cine.active)
      if (frozen || this.travel.busy) this.hud.setHints([])
    }
    this.rift.update(ndt, this.camera)
    this.hud.tick(dt)
    // 影と点光源
    a.env.sun.follow(this.focus)
    this.lightTimer -= dt
    if (this.lightTimer <= 0) {
      this.assignLights(a.world, this.shotIndex === -1 ? this.lightCenter.copy(this.camera.position).lerp(this.focus, 0.6) : this.focus)
      this.lightTimer = 0.4
    }
    a.env.sky.position.copy(this.camera.position)
    this.post.render(dt)
    input.endFrame()
  }

  private setMode(a: Active, idx: number): void {
    const shots = a.stage.shots
    if (!shots) return
    this.cancelCinematic()
    if (this.shotIndex === -1 && idx !== -1) this.savedPlayer.copy(a.player.position)
    this.paused = false
    this.menuOpen = false
    this.hud.setPaused(false)
    this.hud.setMenu(false)
    this.shotIndex = idx
    if (idx === -1) {
      a.player.teleport(this.savedPlayer)
      a.camRig.syncFrom(this.camera, this.savedPlayer)
      shots.apply(-1, a.rt)
    } else shots.apply(idx, a.rt)
  }

  /** 出発の演出：背中の鉱石が強く光り、ネクマックスが光の裂け目へ吸い込まれる */
  private departure(a: Active, dt: number): void {
    this.departT += dt
    const k = Math.min(1, this.departT / 1.1)
    this.oreGlow = 2.2
    applyRigOreGlow(this.nexmax, this.oreGlow)
    this.nexmax.setPose('pulled')
    this.nexmax.root.position.copy(a.player.position)
    this.nexmax.root.position.y += k * k * 1.2
    this.nexmax.root.rotation.y = a.player.facing + k * k * 6
    this.nexmax.root.scale.setScalar(Math.max(0.05, 1 - k * k * 0.9))
    a.camRig.update(dt, ZERO_AXIS, a.player.position)
    this.hud.setHints([])
  }

  // ================================================================ プレイ中の 1 フレーム

  private gameplay(a: Active, frame: ActionFrame, dt: number): void {
    const { stage, player, camRig, claw, rt } = a
    const hud = this.hud
    this.playTime += dt
    this.story.timeline.play_time += dt
    claw.aim(this.camera)
    // カメラの演出中：操作を止める（F は会話の早送り、会話が無ければ飛ばせるショットを飛ばす）
    const cineOn = this.cine.active
    if (cineOn) this.cineInput(frame)
    else if (frame.pressed.has('select_left')) {
      hud.toast(selectArm(this.equipment, 'left').message)
      hud.pulseArm('left')
    }
    if (!cineOn && frame.pressed.has('select_right')) {
      hud.toast(selectArm(this.equipment, 'right').message)
      hud.pulseArm('right')
    }
    if (!cineOn && frame.pressed.has('open_hub')) {
      const r = canOpenHub({ unlocked: false, atSafePoint: false, wireMoving: claw.wire.isWireMoving(), airborne: !player.grounded && !player.isExternal, inCombat: false })
      hud.toast(r.message)
    }
    this.attackToastCooldown -= dt
    if (!cineOn && frame.pressed.has('attack') && this.attackToastCooldown <= 0) {
      hud.toast('基本攻撃は戦闘の実装後に使えます')
      this.attackToastCooldown = 2
    }
    if (!cineOn && frame.pressed.has('interact')) {
      if (this.talk) this.tickDialogue(0, true)
      else stage.interact(rt)
    }
    const locked = this.controlLocked || cineOn
    const { jumpConsumed } = locked ? { jumpConsumed: false } : claw.handleInput(frame, clawArm(this.equipment) !== null, this.camera)
    player.update(dt, { move: locked ? ZERO_AXIS : frame.move, jump: !locked && frame.pressed.has('jump') && !jumpConsumed, dash: !locked && frame.held.has('dash') }, camRig.yaw)
    claw.update(dt, frame, camRig.yaw)
    this.faceClawTarget(a, frame, dt)
    stage.update(dt, frame, rt)
    if (this.cine.active) camRig.update(dt, ZERO_AXIS, player.position)
    else camRig.update(dt, frame.look, player.position, this.input.mouseDX, this.input.mouseDY)
    this.applyCine(dt)

    // ネクマックスの位置・向き・ポーズ
    const nexmax = this.nexmax
    nexmax.root.position.copy(player.position)
    nexmax.root.rotation.y = player.facing
    if (!player.grounded && !player.isExternal) this.airTime += dt
    else {
      if (player.grounded && this.airTime > 0.3) this.landTimer = 0.2
      this.airTime = 0
    }
    this.landTimer = Math.max(0, this.landTimer - dt)
    this.fireTimer = Math.max(0, this.fireTimer - dt)
    const w = claw.wire
    const pose = choosePose({
      wirePhase: w.phase,
      targetType: w.target?.type ?? null,
      grounded: player.isExternal ? false : player.grounded || this.airTime < 0.12,
      vy: player.velocity.y,
      speed: player.speed,
      dash: frame.held.has('dash'),
      landTimer: this.landTimer,
      fireTimer: this.fireTimer,
    })
    applyPose(nexmax, pose, player.speed)
    const aimAt = pose === 'fire' || pose === 'hold' || pose === 'pulled' || pose === 'swing' ? claw.aimPoint : null
    nexmax.setAim(aimAt)
    applyRigClaw(nexmax, w.phase === 'firing' || w.phase === 'miss', w.phase !== 'idle')
    applyRigSwing(nexmax, claw.swingAngle())
    this.oreGlow = Math.max(0, this.oreGlow - dt * 0.5)
    applyRigOreGlow(nexmax, this.oreGlow)

    // HUD（左上の顔は本物のモデル：ポーズで表情、鉱石の光で縁が光る）
    hud.setPlayerPose(pose)
    hud.setOreGlow(this.oreGlow)
    const hints = this.computeHints(a)
    if (this.touch) {
      // スマホ：J・Space・F・R の言葉はボタンへ、移動・カメラなどは指の動きの案内に
      const v = this.touch.applyHints(hints, { interact: this.talk || this.cine.active ? null : this.interactLabel(a), canSwitch: !this.cine.active && claw.candidateCount > 1 && claw.wire.phase === 'idle' })
      hud.setHints(v.hud)
      this.clawLabel = v.claw
    } else hud.setHints(hints)
    const o = stage.objective(rt)
    hud.setObjective(o.title, o.sub)
    hud.setCompass(camRig.yaw, stage.objectiveTarget?.(rt) ?? null, player.position)
  }

  // ================================================================ カメラの演出（rt.cinematic）

  private startCinematic(a: Active, shot: CineShot): Promise<void> {
    if (this.shotIndex >= 0 || this.travel.busy || this.active !== a) return Promise.resolve()
    const auto = shot.from ? null : this.frameFrom(a, shot.look)
    const p = this.cine.start(shot, this.camera, auto)
    if (shot.marker) this.cineMarker.show(shot.marker.pos, shot.marker.label, shot.marker.color)
    else this.cineMarker.hide()
    this.cineBars.classList.toggle('on', shot.letterbox !== false)
    this.hud.setPlayUiVisible(false)
    this.hud.setReticle({ mode: 'idle' })
    return p
  }

  /** from の無いショット：プレイヤー越しに目標を見る位置。目標からカメラへ光線を飛ばし、壁があれば手前に縮める */
  private frameFrom(a: Active, look: THREE.Vector3): THREE.Vector3 {
    const cam = autoFramePosition(a.player.position, look, this.cineAuto)
    const dir = this.cineDir.subVectors(cam, look)
    const len = dir.length()
    if (len > 0.8) {
      dir.divideScalar(len)
      const start = this.lightCenter.copy(look).addScaledVector(dir, 0.35)
      const hit = a.phys.raycast(start, dir, len - 0.35, a.player.collider, true)
      if (hit !== null) cam.copy(start).addScaledVector(dir, Math.max(0.5, hit - 0.4))
    }
    return cam
  }

  /** ショット中の入力：F は会話の早送り。会話が無く、飛ばせるショットなら F・Space・J で戻りに入る */
  private cineInput(frame: ActionFrame): void {
    if (frame.pressed.has('interact') && this.talk) {
      this.tickDialogue(0, true)
      return
    }
    if (!this.talk && this.cine.skippable && (frame.pressed.has('interact') || frame.pressed.has('jump') || frame.pressed.has('claw_fire'))) this.cine.release(true)
  }

  /** CameraRig の後：ショットを混ぜ、目印を置き、揺れを足す */
  private applyCine(dt: number): void {
    if (this.cine.active) {
      const done = this.cine.apply(dt, this.camera)
      if (done) this.endCineUi()
      else if (this.cine.current?.marker) {
        // CameraRig の lookAt が古い姿勢で行列を作っているので、札の投影の前に作り直す
        this.camera.updateMatrixWorld()
        const w = this.cine.weight
        const op = this.cine.phase === 'hold' ? 1 : Math.min(1, Math.max(0, (w - 0.35) / 0.5))
        const { w: vw, h: vh } = this.view
        this.cineMarker.update(this.camera, op, vw, vh)
      }
    }
    this.cine.applyShake(dt, this.camera)
  }

  private cancelCinematic(): void {
    this.cine.cancel(this.camera)
    this.endCineUi()
  }

  private endCineUi(): void {
    this.cineMarker.hide()
    this.cineBars.classList.remove('on')
    if (this.shotIndex < 0) this.hud.setPlayUiVisible(true)
  }

  /**
   * NMClaw を撃つ・支える・引き寄せられる・引き寄せる間、それと R でロックした対象を止まって狙っている間は、
   * 体を対象へまっすぐ向ける（爪が体の正面から出るように）。振り子の間は進む向き（ClawSystem）のまま。
   */
  private faceClawTarget(a: Active, frame: ActionFrame, dt: number): void {
    const { claw, player } = a
    const w = claw.wire
    let p: THREE.Vector3 | null = null
    switch (w.phase) {
      case 'firing':
      case 'holding':
      case 'zipping':
      case 'reeling':
        p = w.target?.point ?? null
        break
      case 'idle':
        if (this.lastLocked && Math.hypot(frame.move.x, frame.move.y) < 0.1) p = claw.selectedTarget?.point ?? null
        break
    }
    if (p) player.turnToward(p.x - player.position.x, p.z - player.position.z, dt, 14)
  }

  /** タッチ：その場で F に反応するもの（ステージの「話す」「調べる」など）の言葉。照準の案内が優先されて出ないときもボタンは出す */
  private interactLabel(a: Active): string | null {
    return a.stage.hints(a.rt)?.find((h) => h.key === 'F')?.label ?? null
  }

  /** キー案内（必要なときだけ）：ワイヤー → 照準 → ステージ（話す・調べる）→ 開始直後の操作案内 */
  private computeHints(a: Active): Hint[] {
    const { claw } = a
    if (this.talk) return [{ key: 'F', label: '次へ' }]
    if (this.cine.active) return this.cine.skippable ? [{ key: 'F', label: 'スキップ' }] : []
    const w = claw.wire
    switch (w.phase) {
      case 'swinging':
        return [
          { key: 'WASD', label: 'こいで揺らす' },
          { key: 'Space', label: '飛び移る' },
          { key: 'J', label: '離す' },
        ]
      case 'zipping':
        return [{ key: 'Space', label: '離脱' }]
      case 'holding':
        return [
          { key: 'J', label: '離す' },
          { key: '↑↓←→', label: 'カメラ' },
        ]
      case 'carrying':
      case 'reeling': {
        // 持ったまま渡せる相手がいれば「F：渡す」も出す（ステージの F の案内）
        const give = a.stage.hints(a.rt)?.find((h) => h.key === 'F')
        return [
          ...(give ? [give] : []),
          { key: 'J', label: '置く' },
          { key: 'WASD', label: '運ぶ' },
        ]
      }
      case 'firing':
      case 'retracting':
      case 'miss':
        return []
    }
    const sel = claw.selectedTarget
    if (sel) {
      const list: Hint[] = [{ key: 'J', label: FIRE_VERB[sel.type] }]
      if (claw.candidateCount > 1) list.push({ key: 'R', label: '対象を切替' })
      return list
    }
    const st = a.stage.hints(a.rt)
    if (st && st.length) return st
    if (this.playTime < START_HINT_TIME) {
      return [
        { key: 'WASD', label: '移動' },
        { key: '↑↓←→', label: 'カメラ' },
        { key: 'Space', label: 'ジャンプ' },
        { key: 'Shift', label: 'ダッシュ' },
        { key: 'J', label: 'つかむ' },
        { key: 'Esc', label: '操作一覧' },
      ]
    }
    return []
  }

  // ================================================================ 開発用

  private exposeDebug(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const g = this
    const api = {
      get scene() {
        return g.scene
      },
      get camera() {
        return g.camera
      },
      get renderer() {
        return g.renderer
      },
      get player() {
        return g.active?.player
      },
      get camRig() {
        return g.active?.camRig
      },
      get claw() {
        return g.active?.claw
      },
      get stage() {
        return g.active?.stage
      },
      get equipment() {
        return g.equipment
      },
      story: g.story,
      travel: (to: StageKey, spawn?: string, cause: TravelRequest['cause'] = 'debug') => g.requestTravel({ to, spawn, cause }),
      memory: () => ({ ...g.renderer.info.memory, programs: g.renderer.info.programs?.length ?? 0 }),
      /** 開発用：カメラの演出を試す（座標は [x, y, z] の配列でよい） */
      cine: (o: Record<string, unknown>) => {
        const a = g.active
        if (!a) return Promise.resolve()
        const v = (x: unknown) => (Array.isArray(x) ? new THREE.Vector3(x[0], x[1], x[2]) : (x as THREE.Vector3 | undefined))
        const m = o.marker as { pos: unknown; label: string } | undefined
        const shot = { ...o, look: v(o.look)!, from: v(o.from), lookTo: v(o.lookTo), fromTo: v(o.fromTo), marker: m ? { ...m, pos: v(m.pos)! } : undefined } as CineShot
        return a.rt.cinematic(shot)
      },
      endCine: (fast?: boolean) => g.cine.release(fast),
      cineState: () => ({ active: g.cine.active, phase: g.cine.phase, w: +g.cine.weight.toFixed(3) }),
      debug: () => {
        const a = g.active
        const claw = a?.claw
        const player = a?.player
        return {
          stage: a?.stage.key ?? null,
          travel: g.travel.phase,
          talking: g.talk !== null,
          flags: g.story.activeFlags(),
          phase: claw?.wire.phase ?? null,
          target: claw?.wire.target?.id ?? null,
          selected: claw?.selectedTarget?.id ?? null,
          candidates: claw?.candidateCount ?? 0,
          player: player ? player.position.toArray().map((x) => +x.toFixed(2)) : null,
          grounded: player?.grounded ?? false,
          external: player?.isExternal ?? false,
          paused: g.paused,
          menuOpen: g.menuOpen,
          camYaw: a ? +a.camRig.yaw.toFixed(2) : 0,
          camPitch: a ? +a.camRig.pitch.toFixed(2) : 0,
          move: g.lastFrame ? g.lastFrame.move : null,
          movables: a ? a.world.claw.movables.map((m) => ({ id: m.def.id, pos: m.object.position.toArray().map((x) => +x.toFixed(2)) })) : [],
          ...(a?.stage.debug?.() ?? {}),
        }
      },
    }
    window.__slice = api
    window.__game = api
  }
}

export async function startGame(app: HTMLDivElement, ui: HTMLDivElement): Promise<void> {
  const g = new Game(app, ui)
  await g.boot()
}
