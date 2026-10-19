// 2086年 ナンバタウン（時代博覧祭）のステージ。中身は stages/future2086/（別の担当）をそのまま使い、
// ここではシェルの Stage の形に包む（同じ担当の stages/future2086/previewPlay.ts の「遊ぶ」モードと同じつなぎ方）。
// ・組み立て：buildFutureScene（root・当たり判定・NMClaw の対象・到着地点・NPC の立ち位置・オルム・破片・IDO の裂け目）
// ・物語：Intro2086Story（導入編 1〜5 章。演出 IntroEffect を受け取って実行し、会話・選択・演出の終わりを送り返す）
//   新しい演出（回想・レンズの受け渡し・アンテナ・試み・QR など）とソラの動きは IntroDirector（stages/future2086/introDirector2086.ts）
// ・IDO 展示で 2026年へ：story.onRequestTravel → rt.travel({ to: '2026', cause: 'ido_exhibit' })
// ・中盤 9章：ソラの羅針盤で 1970年へ：rt.travel({ to: '1970', cause: 'ido_compass' })
// 読み込みに失敗したときは仮の広場（PlaceholderFutureStage）を使う。
import * as THREE from 'three'
import { EDO_SKY } from '../render/sky'
import { createMaterialLibrary } from '../render/materials'
import { ColliderList } from '../world/colliders'
import { ERA_FUTURE } from '../core/eras'
import { futureObjective } from '../core/storyDirector'
import type { Character } from '../world/characters'
import type { ActionFrame } from '../player/inputActions'
import type { WireEvent } from '../player/clawLogic'
import type { Hint } from '../ui/hud'
import { skyEnvironment, type EnvTexture } from './env'
import type { ObjectiveMark, SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageWorld } from './stage'
import type { FutureScene } from '../stages/future2086/scene'
import type { FocusTarget, Intro2086Story as StoryT, IntroEffect, IntroInteract } from '../stages/future2086/intro2086Story'
import type { IntroDirector as IntroDirectorT } from '../stages/future2086/introDirector2086'
import type { IntroProps } from '../stages/future2086/introProps2086'
import type { CineShot } from './cinematic'
import type { LoopFx as LoopFxT } from '../stages/future2086/loopFx'
import type { TimeOfDay } from '../stages/future2086/environment'
import type { ZoneId } from '../stages/future2086/layout'
import type { MobTalk2086 } from '../stages/future2086/mobTalk2086'
import type { SwingArcPreview as SwingArcT } from '../stages/future2086/focusShots2086'
import type { SkyTear as SkyTearT } from '../stages/future2086/skyTear2086'
import type { CueLine, EmergenceSequence as EmergenceT } from '../stages/future2086/emergence2086'
import type { MusicId } from '../audio/tracks'

export async function createFutureStage(): Promise<Stage> {
  try {
    const [sceneM, storyM, envM, fxM, matM, focusM, tearM, emergeM, propsM, introM] = await Promise.all([
      import('../stages/future2086/scene'),
      import('../stages/future2086/intro2086Story'),
      import('../stages/future2086/environment'),
      import('../stages/future2086/loopFx'),
      import('../stages/future2086/fmaterials'),
      import('../stages/future2086/focusShots2086'),
      import('../stages/future2086/skyTear2086'),
      import('../stages/future2086/emergence2086'),
      import('../stages/future2086/introProps2086'),
      import('../stages/future2086/introDirector2086'),
    ])
    return new Future2086Stage({ sceneM, storyM, envM, fxM, matM, focusM, tearM, emergeM, propsM, introM })
  } catch (e) {
    console.warn('[2086] stages/future2086 を読めないので仮の広場を使います', e)
    return new PlaceholderFutureStage()
  }
}

type Mods = {
  sceneM: typeof import('../stages/future2086/scene')
  storyM: typeof import('../stages/future2086/intro2086Story')
  envM: typeof import('../stages/future2086/environment')
  fxM: typeof import('../stages/future2086/loopFx')
  matM: typeof import('../stages/future2086/fmaterials')
  focusM: typeof import('../stages/future2086/focusShots2086')
  tearM: typeof import('../stages/future2086/skyTear2086')
  emergeM: typeof import('../stages/future2086/emergence2086')
  propsM: typeof import('../stages/future2086/introProps2086')
  introM: typeof import('../stages/future2086/introDirector2086')
}

/** 選択肢（W/S・↑↓ で選び、F／J で決定。スマホでは選択肢をタップすると選んで決定） */
class ChoiceBox {
  private el: HTMLDivElement | null = null
  private opts: Array<{ id: string; label: string }> = []
  private sel = 0
  private prompt = ''
  id = ''
  private lastY = 0
  /** タップされた（次のフレームの update で決定する） */
  private tapped = false

  get open(): boolean {
    return this.el !== null
  }

  show(ui: HTMLElement, id: string, prompt: string, options: ReadonlyArray<{ id: string; label: string }>): void {
    this.close()
    this.id = id
    this.prompt = prompt
    this.opts = [...options]
    this.sel = 0
    this.el = document.createElement('div')
    this.el.className = 'game-choice'
    this.tapped = false
    // タップ（スマホだけ押せる。PC では選択肢の箱がポインタを受け取らない）
    this.el.addEventListener('pointerdown', (e) => {
      const o = (e.target as HTMLElement).closest<HTMLElement>('.gc-opt')
      if (!o) return
      e.preventDefault()
      this.sel = Number(o.dataset.i)
      this.tapped = true
      this.render()
    })
    ui.appendChild(this.el)
    this.render()
  }

  /** タップで決まったか（1 回だけ true） */
  takeTap(): boolean {
    const t = this.tapped
    this.tapped = false
    return t && this.el !== null
  }

  private render(): void {
    if (!this.el) return
    this.el.innerHTML = `<div class="gc-title">${this.prompt}</div>${this.opts.map((o, i) => `<div class="gc-opt${i === this.sel ? ' on' : ''}" data-i="${i}">${i === this.sel ? '▶ ' : ''}${o.label}</div>`).join('')}<div class="gc-foot">W／S：選ぶ　F：決定</div>`
  }

  /** move.y / look.y の押し始めで選ぶ */
  input(frame: ActionFrame): void {
    if (!this.el) return
    const y = Math.abs(frame.move.y) > 0.5 ? frame.move.y : frame.look.y
    const dir = y > 0.5 ? 1 : y < -0.5 ? -1 : 0
    if (dir !== 0 && this.lastY === 0) {
      this.sel = (this.sel + (dir > 0 ? this.opts.length - 1 : 1)) % this.opts.length
      this.render()
    }
    this.lastY = dir
  }

  pick(): string | null {
    if (!this.el) return null
    const o = this.opts[this.sel]
    this.close()
    return o.id
  }

  close(): void {
    this.el?.remove()
    this.el = null
  }
}

class Future2086Stage implements Stage {
  readonly key = '2086' as const
  readonly era = ERA_FUTURE
  readonly label = '2086年　ナンバタウン'
  readonly subtitle = '時代博覧祭'
  readonly environment: StageEnvironment
  private readonly m: Mods
  private fs!: FutureScene
  private sora!: Character
  private story!: StoryT
  private props!: IntroProps
  /** 導入編の演出・ソラの動き（begin で作る） */
  private intro: IntroDirectorT | null = null
  private fx: LoopFxT | null = null
  private nightEnv: EnvTexture | null = null
  private dayEnv: THREE.Texture | null = null
  private choice = new ChoiceBox()
  private curtain: HTMLDivElement | null = null
  private curtainAnim: { t: number; onBlack: () => void; done: () => void; fired: boolean } | null = null
  private orumAnim: { t: number; mode: 'appear' | 'swallow' } | null = null
  private riftT = -1
  private lastZone: ZoneId | null = null
  private locked = false
  private talkToken = 0
  private talkKey: string | null = null
  private rt: StageRuntime | null = null
  private spawnId: string | null = null
  private ui: HTMLElement | null = null
  /** 町の人のおしゃべり（吹き出し・F の会話。stages/future2086/mobTalk2086.ts。begin で遅れて読み込む） */
  private mobs: MobTalk2086 | null = null
  /** 目標を見せるカメラ（story の focus）。会話が続けばその終わりまで映す */
  private focusRun: { token: number; t: number; minHold: number; talk: 'wait' | 'playing' | 'done'; ended: boolean; short: boolean; arc: SwingArcT | null } | null = null
  private focusToken = 0
  /** 夜空が割れる演出（空の板・色）と、その進行 */
  private tear: SkyTearT | null = null
  private emergence: EmergenceT | null = null
  /** F で反応する相手（ソラ・作業台＋導入編の小物） */
  private interactables: Array<{ id: IntroInteract; pos: THREE.Vector3; reach: number }> = []

  constructor(m: Mods) {
    this.m = m
    const e = m.envM.FUTURE_ENVIRONMENTS.morning
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

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    const soraP = ctx.loadNpc('sora', 1.58)
    ctx.progress(0.1, 'テクスチャとフォントを読み込み中…')
    await ctx.yieldFrame()
    await this.m.matM.preloadFutureAssets(aniso)
    const mats = await createMaterialLibrary(aniso)
    ctx.progress(0.45, 'ナンバタウンを組み立て中…')
    await ctx.yieldFrame()
    this.fs = this.m.sceneM.buildFutureScene(mats, ctx.quality, { aniso })
    // 導入編の小物（当たり判定は物理を作る前に足す）と、非常警報の柱・街灯の風船（つかめる対象）
    this.props = this.m.propsM.buildIntroProps(this.fs.root, this.fs.colliders)
    this.fs.claw.targets.push(this.props.alarm.def, this.props.balloon.def)
    this.fs.claw.movables.push(this.props.alarm.movable, this.props.balloon.movable)
    this.interactables = [
      ...this.fs.interactables.filter((it) => it.id !== 'ido_exhibit').map((it) => ({ id: it.id as IntroInteract, pos: it.pos, reach: it.reach })),
      ...this.props.interactables,
    ]
    ctx.progress(0.6, 'ソラを読み込み中…')
    this.sora = await soraP
    this.fs.root.add(this.sora.root)
    // 夜の環境マップ（朝はシェルが HDRI から作る）
    const night = this.m.envM.FUTURE_ENVIRONMENTS.night
    this.nightEnv = skyEnvironment(ctx.renderer, night.sky, night.sunDir)
    const f = (n: string) => ctx.story.get(n)
    this.story = new this.m.storyM.Intro2086Story({ start: this.m.storyM.introStartStep(f), loopCount: ctx.story.loop_count, flags: f })
    this.spawnId = ctx.spawnId
    return { root: this.fs.root, colliders: this.fs.colliders, claw: { targets: this.fs.claw.targets, movables: this.fs.claw.movables }, lights: this.fs.lights }
  }

  spawn(id: string | null): SpawnPoint {
    const sp = this.fs.spawns
    const key = id && sp[id] ? id : this.m.storyM.introSpawn(this.story.step)
    return sp[key] ?? sp.start ?? Object.values(sp)[0]
  }

  private setTime(mode: TimeOfDay, rt: StageRuntime): void {
    if (mode === 'morning') {
      this.emergence?.cancel()
      this.emergence = null
      this.tear?.reset()
    }
    this.fs.setTimeOfDay(mode)
    if (mode === 'morning') this.intro?.resetMorning(rt)
    const maps: Partial<Record<TimeOfDay, THREE.Texture>> = {}
    if (this.dayEnv) maps.morning = this.dayEnv
    if (this.nightEnv) maps.night = this.nightEnv.texture
    this.m.envM.applyTimeOfDay(this.fs.environment, { scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post, envMaps: maps })
  }

  private teleport(id: string, rt: StageRuntime): void {
    const s = this.fs.spawns[id] ?? this.fs.spawns.start
    rt.claw.reset()
    rt.player.teleport(s.pos.clone(), s.facing)
    rt.camRig.yaw = s.camYaw
    rt.camRig.pitch = s.camPitch
  }

  begin(rt: StageRuntime): void {
    this.rt = rt
    this.dayEnv = rt.scene.environment
    this.ui = rt.renderer.domElement.ownerDocument.getElementById('ui')
    // 町の人のおしゃべり（読めなくても本編はそのまま）
    void import('../stages/future2086/mobTalk2086')
      .then((m) => {
        if (this.rt === rt && !this.mobs) this.mobs = new m.MobTalk2086(this.fs, this.ui, rt.camera)
      })
      .catch((e) => console.warn('[2086] 町の人の台詞を読めませんでした', e))
    this.fx = new this.m.fxM.LoopFx(rt.camera, rt.scene)
    this.curtain = document.createElement('div')
    this.curtain.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:6;'
    document.body.appendChild(this.curtain)
    this.intro = new this.m.introM.IntroDirector(this.fs, this.props, this.sora, this.story, this.ui, rt.camera)
    this.story.onEffect = (e) => this.onEffect(e, rt)
    this.story.onRequestTravel = (era, spawn) => {
      // 2026年：IDO 展示／1970年：羅針盤（中盤 9章）
      const v = era === '1970' ? rt.travel({ to: '1970', cause: 'ido_compass', spawn }) : rt.travel({ to: '2026', cause: 'ido_exhibit', spawn: 'present_start' })
      if (!v.ok) rt.hud.toast(v.reason)
    }
    this.tear = new this.m.tearM.SkyTear(this.fs.root)
    const step = this.story.step
    const isNight = this.m.storyM.isNightStep(step)
    this.setTime(isNight ? 'night' : 'morning', rt)
    if (isNight) {
      this.fs.setOrum({ show: 1, tomorrow: 0.5, dissolve: 0.4 })
      this.tear.setFinal({ scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post })
    }
    this.story.begin()
    rt.save(this.spawnId ?? this.m.storyM.introSpawn(this.story.step))
  }

  private onEffect(e: IntroEffect, rt: StageRuntime): void {
    if (this.intro?.handle(e, rt, (_t, shot) => this.startFocus('exhibit', false, rt, shot))) return
    switch (e.kind) {
      case 'dialogue': {
        const token = ++this.talkToken
        this.talkKey = e.key
        const done = () => {
          if (token !== this.talkToken) return
          this.talkKey = null
          this.story.send({ kind: 'dialogue_done', key: e.key })
        }
        // 夜空が割れる演出中で、行に合図（cue）があれば演出に合わせて流す（演出と会話の両方が終わったら知らせる）
        const em = this.emergence
        if (em?.playing && (e.lines as readonly CueLine[]).some((l) => l.cue)) {
          let talked = false
          let shown = false
          em.attachDialogue(e.lines as readonly CueLine[], () => {
            talked = true
            if (shown) done()
          })
          const prev = em.onDone
          em.onDone = () => {
            prev?.()
            shown = true
            if (talked) done()
          }
          break
        }
        // 目標を見せるカメラの直後の会話なら、会話が終わるまで映す
        const fr = this.focusRun && this.focusRun.talk === 'wait' ? this.focusRun : null
        if (fr) fr.talk = 'playing'
        void rt.dialogue(e.lines).then(() => {
          if (fr && this.focusRun === fr) fr.talk = 'done'
          done()
        })
        break
      }
      case 'focus':
        // 見せ直し（short）は、ワイヤーで移動・ぶら下がり中なら映さない（ヒントの会話だけ）
        if (e.short && rt.claw.wire.phase !== 'idle') break
        this.startFocus(e.target, !!e.short || rt.story.loop_count > 0, rt)
        break
      case 'say':
        rt.say(e.speaker, e.text, e.seconds ?? 2.4)
        break
      case 'lock':
        this.locked = e.on
        break
      case 'transition':
        this.curtainAnim = {
          t: 0,
          fired: false,
          onBlack: () => {
            this.setTime('night', rt)
            this.fs.setOrum({ show: 0, tomorrow: 1, swallow: 0, dissolve: 0 })
            this.teleport(e.spawn, rt)
            this.intro?.placeSora(e.sora)
            rt.hud.banner('― その夜 ―', 'success', 2.2)
          },
          done: () => this.story.send({ kind: 'fx_done', fx: 'night' }),
        }
        break
      case 'orum':
        if (e.action === 'appear' && this.tear) this.startEmergence(rt, !!e.short)
        else this.orumAnim = { t: 0, mode: e.action }
        break
      case 'debris':
        this.fs.debris.setActive(e.active)
        break
      case 'loop_fx':
        this.fx?.play({
          at: rt.nexmax.root.position.clone().add(new THREE.Vector3(0, 0.55, 0.12)),
          onOre: (x: number) => rt.oreGlow(x),
          onSwap: () => {
            this.setTime('morning', rt)
            this.orumAnim = null
            this.teleport(e.spawn, rt)
            this.intro?.placeSora(e.sora)
          },
          onDone: () => this.story.send({ kind: 'fx_done', fx: 'loop' }),
        })
        break
      case 'ore_glow':
        rt.oreGlow(e.level)
        break
      case 'rift':
        this.riftT = e.open ? 0 : -1
        if (!e.open) this.fs.openRift(0)
        break
      case 'choice':
        if (this.ui) this.choice.show(this.ui, e.id, e.prompt, e.options)
        break
      case 'drop_arm':
        this.fs.dropArmPart(rt.nexmax.root.position.clone().add(new THREE.Vector3(0.25, 0.55, -0.1)))
        break
      case 'flag':
        rt.story.set(e.name, true)
        // 再開したときの段階と同じ到着地点を保存する
        rt.save(this.m.storyM.introSpawn(this.m.storyM.introStartStep((n) => rt.story.get(n))))
        break
      case 'loop_count':
        while (rt.story.loop_count < e.value) rt.story.addLoop()
        break
      default:
        break
    }
  }

  /** 共鳴レンズのケースのいまの位置 */
  private lensPos(): THREE.Vector3 {
    const mv = this.fs.claw.movables.find((m) => m.def.id === this.fs.claw.ids.lens)
    return mv ? mv.object.position.clone() : this.fs.markers.lens.clone()
  }

  /** 目標をカメラで見せる（focusShots2086 の表から）。直後の会話が終わるまで映して、プレイのカメラへ戻る */
  private startFocus(target: FocusTarget, short: boolean, rt: StageRuntime, prebuilt?: CineShot): void {
    const shot = prebuilt ?? this.m.focusM.focusShot(target, { player: rt.player.position.clone(), lens: this.lensPos(), sora: this.sora.root.position.clone(), short })
    const minHold = (shot.inSec ?? 1.9) + (Number.isFinite(shot.hold) ? (shot.hold ?? 2) : 2)
    // QR の場面（exhibit）は演出側が終わらせる
    const manual = target === 'exhibit'
    shot.hold = Infinity
    this.focusRun?.arc?.dispose()
    const token = ++this.focusToken
    const arc = target === 'ring' ? new this.m.focusM.SwingArcPreview(this.fs.root) : null
    const run = { token, t: 0, minHold, talk: (manual ? 'playing' : 'wait') as 'wait' | 'playing' | 'done', ended: manual, short, arc }
    this.focusRun = run
    void rt.cinematic(shot).then(() => {
      run.arc?.dispose()
      run.arc = null
      if (this.focusRun === run) this.focusRun = null
    })
  }

  private updateFocus(dt: number, rt: StageRuntime): void {
    const fr = this.focusRun
    if (!fr) return
    fr.t += dt
    // 会話が続かなかったら、ショットの保持の時間だけ映す
    if (fr.talk === 'wait' && fr.t > 0.3) fr.talk = 'done'
    if (!fr.ended && fr.talk === 'done' && fr.t >= fr.minHold) {
      fr.ended = true
      rt.endCinematic()
    }
    if (!rt.inCinematic && fr.t > 0.5) {
      fr.arc?.dispose()
      fr.arc = null
      this.focusRun = null
    }
  }

  /** 夜空が割れて、正体不明の存在が出てくる演出（emergence2086.ts）。short は 2 回目以降の短い版 */
  private startEmergence(rt: StageRuntime, short: boolean): void {
    if (!this.tear) return
    this.emergence?.cancel()
    const shot = this.m.focusM.focusShot('sky', { player: rt.player.position.clone(), lens: this.lensPos(), sora: this.sora.root.position.clone(), short })
    const em = new this.m.emergeM.EmergenceSequence({ rt, orum: this.fs.orum, tear: this.tear, shot, short })
    em.onDone = () => {
      // 避難の間も、環の中の明日の街は消え続ける（orumAnim 'appear' の t = 5 から）
      this.orumAnim = { t: 5, mode: 'appear' }
      if (this.emergence === em) this.emergence = null
    }
    this.emergence = em
  }

  private nearInteract(rt: StageRuntime): IntroInteract | null {
    let best: IntroInteract | null = null
    let bd = Infinity
    const p = rt.player.position
    for (const it of this.interactables) {
      const pos = it.id === 'sora' ? this.sora.root.position : it.pos
      const d = Math.hypot(pos.x - p.x, pos.z - p.z)
      if (d < it.reach && d < bd && Math.abs(pos.y - p.y) < 1.5 && this.story.canInteract(it.id)) {
        best = it.id
        bd = d
      }
    }
    return best
  }

  private pickChoice(): void {
    const id = this.choice.id
    const opt = this.choice.pick()
    if (opt) this.story.send({ kind: 'choice', id, option: opt })
  }

  interact(rt: StageRuntime): boolean {
    if (this.choice.open) {
      this.pickChoice()
      return true
    }
    if (this.blocked) return true
    const n = this.nearInteract(rt)
    if (!n && this.mobs) return this.mobs.interact(rt) // 町の人（ソラ・展示が近くにいないときだけ）
    if (!n) return false
    return this.story.send({ kind: 'interact', target: n, item: n === 'sora' && this.intro?.hasLens(rt) ? 'lens' : undefined })
  }

  private get blocked(): boolean {
    return this.locked || this.choice.open || (this.fx?.playing ?? false) || this.curtainAnim !== null || (this.intro?.flashbackPlaying ?? false)
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.choice.open) return [
      { key: 'W／S', label: '選ぶ' },
      { key: 'F', label: '決定' },
    ]
    if (this.fx?.playing || this.intro?.flashbackPlaying) return []
    const n = this.nearInteract(rt)
    if (n) return [{ key: 'F', label: this.story.interactLabel(n) }]
    if (this.mobs) return this.mobs.hints(this.story.hints(), rt) // 町の人が近ければ「F：話す」を足す
    return this.story.hints()
  }

  objective(): { title: string; sub: string } {
    return this.story.objective()
  }

  /** 回想と冒頭はタイトルと同じ約束の曲、夜は空が裂ける夜の曲、ほかは祭りの朝の曲 */
  music(): MusicId | null {
    const step = this.story.step
    if (step === 'opening' || this.intro?.flashbackPlaying) return 'title'
    return this.m.storyM.isNightStep(step) ? 'night2086' : 'future2086'
  }

  objectiveTarget(): THREE.Vector3 | null {
    const mk = this.fs.markers
    return this.intro?.objectiveTarget(this.story.step, this.lensPos(), mk.hook, mk.swing) ?? null
  }

  objectiveMarkers(): readonly ObjectiveMark[] | null {
    if (this.blocked) return null
    return this.intro?.objectiveMarkers(this.story.step, this.lensPos()) ?? null
  }

  onClawEvent(e: WireEvent): void {
    const id = 'target' in e ? e.target.id : null
    if (id) this.story.send({ kind: 'claw', event: e.kind, targetId: id })
    this.intro?.onClaw(e.kind, id)
    // 立ち向かう夜：空へ撃った（届かないので空振りでよい）
    if (this.intro?.confrontOn && (e.kind === 'fired' || e.kind === 'missed')) this.story.send({ kind: 'confront_shot' })
  }

  update(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    if (this.choice.open) this.choice.input(frame)
    if (this.choice.takeTap()) this.pickChoice()
    rt.setControlLocked(this.blocked)
    this.story.send({ kind: 'tick', dt })
    this.updateFocus(dt, rt)
    this.emergence?.update(dt, rt.camera)
    this.intro?.update(dt, frame, rt)
    this.mobs?.update(dt, rt, this.blocked || this.story.busy || (this.intro?.evacuated ?? false)) // 町の人の吹き出し（会話・演出の間は出さない）
    const z = this.fs.zoneAt(rt.player.position)
    if (z !== this.lastZone) {
      this.lastZone = z
      if (z) this.story.send({ kind: 'zone', zone: z })
    }
    // ソラ（立ち位置・ついてくる・止まる・逃げる）
    this.intro?.updateSora(dt, rt, this.talkKey !== null && this.story.step !== 'night_orum' && this.story.step !== 'attempt_night')
    // オルム・破片・裂け目・暗転
    if (this.orumAnim) {
      this.orumAnim.t += dt
      const t = this.orumAnim.t
      if (this.orumAnim.mode === 'appear') this.fs.setOrum({ show: Math.min(1, t / 5), tomorrow: Math.max(0.15, 1 - t / 14), dissolve: Math.min(0.62, t / 22) })
      else this.fs.setOrum({ show: 1, swallow: Math.min(1, t / 2.6), dissolve: Math.min(0.9, 0.62 + t / 8) })
    }
    if (this.fs.debris.active) {
      const r = this.fs.debris.update(dt, rt.player.position)
      if (r.impact) rt.shake(0.2)
      if (r.hit && r.hitDir) {
        rt.player.velocity.x += r.hitDir.x * 5
        rt.player.velocity.z += r.hitDir.z * 5
        rt.player.velocity.y = Math.max(rt.player.velocity.y, 3.5)
        rt.hud.flash('danger')
        this.story.send({ kind: 'debris_hit' })
      }
    }
    if (this.riftT >= 0) {
      this.riftT += dt
      this.fs.openRift(Math.min(1, this.riftT / 3.2))
    }
    if (this.curtainAnim && this.curtain) {
      this.curtainAnim.t += dt
      const t = this.curtainAnim.t
      this.curtain.style.opacity = String(t < 0.8 ? t / 0.8 : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.9))
      if (t >= 0.8 && !this.curtainAnim.fired) {
        this.curtainAnim.fired = true
        this.curtainAnim.onBlack()
      }
      if (t >= 2.5) {
        const done = this.curtainAnim.done
        this.curtainAnim = null
        this.curtain.style.opacity = '0'
        done()
      }
    }
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    const arc = this.focusRun?.arc
    if (arc) {
      arc.update(dt, this.focusRun?.short ? 1.0 : 4.6)
      if (this.focusRun?.ended) arc.fadeOut(dt)
    }
    this.sora.update(dt, this.intro?.soraSpeed ?? 0)
    if (!this.fs.debris.active) this.fs.debris.update(dt, null)
    if (this.fx) {
      this.fx.setAspect(rt.camera.aspect)
      this.fx.update(dt)
    }
    this.fs.update(dt, t)
    this.intro?.animate(dt, rt)
    this.mobs?.render(dt) // 町の人の吹き出しを頭の上へ（カメラが動いた後）
  }

  debug(): Record<string, unknown> {
    return {
      step: this.story.step,
      loop: this.story.loopCount,
      zone: this.lastZone,
      choice: this.choice.open,
      attempts: [...this.story.attempts],
      current: this.story.current,
      pending: this.story.pending,
      mobs: this.mobs?.debugInfo(),
    }
  }

  dispose(): void {
    this.mobs?.dispose() // 町の人の吹き出し（DOM）
    this.mobs = null
    this.focusRun?.arc?.dispose()
    this.focusRun = null
    this.emergence?.cancel()
    this.emergence = null
    this.tear?.dispose()
    this.tear = null
    this.intro?.dispose()
    this.intro = null
    this.choice.close()
    this.curtain?.remove()
    this.curtain = null
    this.fx?.dispose()
    this.fx = null
    if (this.rt && this.rt.scene.environment === this.nightEnv?.texture) this.rt.scene.environment = this.dayEnv
    this.nightEnv?.dispose()
    this.nightEnv = null
    this.fs.dispose()
    this.rt = null
  }
}

// ------------------------------------------------------------------ 仮の広場（2086 年の中身が読めないとき）

const FUTURE_SKY = { ...EDO_SKY, zenith: '#2a4fd0', upper: '#5a7ff0', horizon: '#c3c8f8', warm: '#ffd0e8', haze: '#d6d2f2' }

class PlaceholderFutureStage implements Stage {
  readonly key = '2086' as const
  readonly era = ERA_FUTURE
  readonly label = '2086年　ナンバタウン'
  readonly subtitle = '時代博覧祭（準備中）'
  readonly environment: StageEnvironment = {
    sky: FUTURE_SKY,
    sunDir: new THREE.Vector3(-0.5, 0.6, -0.4).normalize(),
    hdri: null,
    envIntensity: 0.8,
    fog: { color: FUTURE_SKY.haze, density: 0.004 },
  }

  async load(): Promise<StageWorld> {
    const root = new THREE.Group()
    root.name = 'future2086_placeholder'
    const col = new ColliderList()
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: '#b9c2e6', roughness: 0.6, metalness: 0.1 }))
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    root.add(floor)
    col.floor(-30, 30, -30, 30, 0, 1)
    col.wall(-28, -28, 28, -28, -1, 6)
    col.wall(28, -28, 28, 28, -1, 6)
    col.wall(28, 28, -28, 28, -1, 6)
    col.wall(-28, 28, -28, -28, -1, 6)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 16, 64), new THREE.MeshStandardMaterial({ color: '#9a8cff', emissive: new THREE.Color('#6a5aff'), emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.3 }))
    ring.position.set(0, 3.6, -10)
    root.add(ring)
    return { root, colliders: col, claw: { targets: [], movables: [] }, lights: [] }
  }

  spawn(): SpawnPoint {
    return { pos: new THREE.Vector3(0, 0, 6), facing: 0, camYaw: 0, camPitch: 0.25 }
  }

  begin(rt: StageRuntime): void {
    rt.save('future_return')
  }

  revealed(rt: StageRuntime): void {
    rt.say('システム', '2086年 ナンバタウン（仮の広場）。stages/future2086 を読み込めませんでした。')
  }

  update(): void {}
  animate(): void {}
  interact(): boolean {
    return false
  }
  hints(): Hint[] | null {
    return null
  }
  objective(rt: StageRuntime): { title: string; sub: string } {
    return futureObjective((n) => rt.story.get(n))
  }
  dispose(): void {}
}
