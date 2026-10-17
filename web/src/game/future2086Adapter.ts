// 2086年 ナンバタウン（時代博覧祭）のステージ。中身は stages/future2086/（別の担当）をそのまま使い、
// ここではシェルの Stage の形に包む（同じ担当の stages/future2086/previewPlay.ts の「遊ぶ」モードと同じつなぎ方）。
// ・組み立て：buildFutureScene（root・当たり判定・NMClaw の対象・到着地点・NPC の立ち位置・オルム・破片・IDO の裂け目）
// ・物語：Future2086Story（演出 StoryEffect を受け取って実行し、会話・選択・演出の終わりを送り返す）
// ・IDO 展示で 2026年へ：story.onRequestTravel → rt.travel({ to: '2026', cause: 'ido_exhibit' })
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
import type { SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageWorld } from './stage'
import type { FutureScene, SoraSpotId } from '../stages/future2086/scene'
import type { Future2086Story as StoryT, StoryEffect, StoryStepId } from '../stages/future2086/future2086Story'
import type { LoopFx as LoopFxT } from '../stages/future2086/loopFx'
import type { TimeOfDay } from '../stages/future2086/environment'
import type { ZoneId } from '../stages/future2086/layout'

export async function createFutureStage(): Promise<Stage> {
  try {
    const [sceneM, storyM, envM, fxM, matM] = await Promise.all([
      import('../stages/future2086/scene'),
      import('../stages/future2086/future2086Story'),
      import('../stages/future2086/environment'),
      import('../stages/future2086/loopFx'),
      import('../stages/future2086/fmaterials'),
    ])
    return new Future2086Stage({ sceneM, storyM, envM, fxM, matM })
  } catch (e) {
    console.warn('[2086] stages/future2086 を読めないので仮の広場を使います', e)
    return new PlaceholderFutureStage()
  }
}

type Mods = {
  sceneM: typeof import('../stages/future2086/scene')
  storyM: typeof import('../stages/future2086/future2086Story')
  envM: typeof import('../stages/future2086/environment')
  fxM: typeof import('../stages/future2086/loopFx')
  matM: typeof import('../stages/future2086/fmaterials')
}

/** 選択肢（W/S・↑↓ で選び、F／J で決定） */
class ChoiceBox {
  private el: HTMLDivElement | null = null
  private opts: Array<{ id: string; label: string }> = []
  private sel = 0
  private prompt = ''
  id = ''
  private lastY = 0

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
    ui.appendChild(this.el)
    this.render()
  }

  private render(): void {
    if (!this.el) return
    this.el.innerHTML = `<div class="gc-title">${this.prompt}</div>${this.opts.map((o, i) => `<div class="gc-opt${i === this.sel ? ' on' : ''}">${i === this.sel ? '▶ ' : ''}${o.label}</div>`).join('')}<div class="gc-foot">W／S：選ぶ　F：決定</div>`
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
  private fx: LoopFxT | null = null
  private nightEnv: EnvTexture | null = null
  private dayEnv: THREE.Texture | null = null
  private choice = new ChoiceBox()
  private curtain: HTMLDivElement | null = null
  private curtainAnim: { t: number; onBlack: () => void; done: () => void; fired: boolean } | null = null
  private orumAnim: { t: number; mode: 'appear' | 'swallow' } | null = null
  private riftT = -1
  private soraSpot: SoraSpotId | 'escape' = 'booth'
  private soraPathT = 0
  private lastZone: ZoneId | null = null
  private locked = false
  private talkToken = 0
  private talkKey: string | null = null
  private rt: StageRuntime | null = null
  private spawnId: string | null = null
  private ui: HTMLElement | null = null

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
    ctx.progress(0.6, 'ソラを読み込み中…')
    this.sora = await soraP
    this.fs.root.add(this.sora.root)
    // 夜の環境マップ（朝はシェルが HDRI から作る）
    const night = this.m.envM.FUTURE_ENVIRONMENTS.night
    this.nightEnv = skyEnvironment(ctx.renderer, night.sky, night.sunDir)
    const f = (n: string) => ctx.story.get(n)
    this.story = new this.m.storyM.Future2086Story({ start: this.m.storyM.startStepFromFlags(f), loopCount: ctx.story.loop_count })
    this.spawnId = ctx.spawnId
    return { root: this.fs.root, colliders: this.fs.colliders, claw: { targets: this.fs.claw.targets, movables: this.fs.claw.movables }, lights: this.fs.lights }
  }

  spawn(id: string | null): SpawnPoint {
    const sp = this.fs.spawns
    const key = id && sp[id] ? id : this.m.storyM.spawnForStep(this.story.step)
    return sp[key] ?? sp.start ?? Object.values(sp)[0]
  }

  private setTime(mode: TimeOfDay, rt: StageRuntime): void {
    this.fs.setTimeOfDay(mode)
    const maps: Partial<Record<TimeOfDay, THREE.Texture>> = {}
    if (this.dayEnv) maps.morning = this.dayEnv
    if (this.nightEnv) maps.night = this.nightEnv.texture
    this.m.envM.applyTimeOfDay(this.fs.environment, { scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post, envMaps: maps })
  }

  private placeSora(spot: SoraSpotId): void {
    this.soraSpot = spot
    const s = this.fs.npcs.sora[spot]
    this.sora.root.position.copy(s.pos)
    this.sora.root.rotation.y = s.yaw
    this.sora.setPose(s.pose)
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
    this.fx = new this.m.fxM.LoopFx(rt.camera, rt.scene)
    this.curtain = document.createElement('div')
    this.curtain.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:6;'
    document.body.appendChild(this.curtain)
    this.story.onEffect = (e) => this.onEffect(e, rt)
    this.story.onRequestTravel = () => {
      const v = rt.travel({ to: '2026', cause: 'ido_exhibit', spawn: 'present_start' })
      if (!v.ok) rt.hud.toast(v.reason)
    }
    const step = this.story.step as StoryStepId
    const isNight = step === 'night_orum' || step === 'evade'
    this.setTime(isNight ? 'night' : 'morning', rt)
    if (isNight) this.fs.setOrum({ show: 1, tomorrow: 0.5, dissolve: 0.4 })
    this.placeSora(step === 'loop_morning' || step === 'go_booth' ? 'booth' : isNight ? 'night' : step === 'ido_exhibit' ? 'exhibit' : 'booth')
    this.story.begin()
    rt.save(this.spawnId ?? this.m.storyM.spawnForStep(this.story.step))
  }

  private onEffect(e: StoryEffect, rt: StageRuntime): void {
    switch (e.kind) {
      case 'dialogue': {
        const token = ++this.talkToken
        this.talkKey = e.key
        void rt.dialogue(e.lines).then(() => {
          if (token !== this.talkToken) return
          this.talkKey = null
          this.story.send({ kind: 'dialogue_done', key: e.key })
        })
        break
      }
      case 'say':
        rt.say(e.speaker, e.text, 2.4)
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
            this.placeSora(e.sora)
            rt.hud.banner('― その夜 ―', 'success', 2.2)
          },
          done: () => this.story.send({ kind: 'fx_done', fx: 'night' }),
        }
        break
      case 'sora':
        if (e.spot === 'escape') {
          this.soraSpot = 'escape'
          this.soraPathT = 0
          this.sora.setPose('walk')
        } else this.placeSora(e.spot)
        break
      case 'orum':
        this.orumAnim = { t: 0, mode: e.action }
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
            this.placeSora(e.sora)
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
        break
      case 'loop_count':
        while (rt.story.loop_count < e.value) rt.story.addLoop()
        break
      case 'travel':
      case 'step':
        break
    }
  }

  private nearInteract(rt: StageRuntime): 'sora' | 'ido_exhibit' | 'parts_table' | null {
    let best: 'sora' | 'ido_exhibit' | 'parts_table' | null = null
    let bd = Infinity
    const p = rt.player.position
    for (const it of this.fs.interactables) {
      const pos = it.id === 'sora' ? this.sora.root.position : it.pos
      const d = Math.hypot(pos.x - p.x, pos.z - p.z)
      if (d < it.reach && d < bd && Math.abs(pos.y - p.y) < 1.5 && this.story.canInteract(it.id)) {
        best = it.id
        bd = d
      }
    }
    return best
  }

  interact(rt: StageRuntime): boolean {
    if (this.choice.open) {
      const id = this.choice.id
      const opt = this.choice.pick()
      if (opt) this.story.send({ kind: 'choice', id, option: opt })
      return true
    }
    if (this.blocked) return true
    const n = this.nearInteract(rt)
    if (!n) return false
    return this.story.send({ kind: 'interact', target: n })
  }

  private get blocked(): boolean {
    return this.locked || this.choice.open || (this.fx?.playing ?? false) || this.curtainAnim !== null
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.choice.open) return [
      { key: 'W／S', label: '選ぶ' },
      { key: 'F', label: '決定' },
    ]
    if (this.fx?.playing) return []
    const n = this.nearInteract(rt)
    if (n) return [{ key: 'F', label: n === 'sora' ? '話す' : '調べる' }]
    return this.story.hints()
  }

  objective(): { title: string; sub: string } {
    return this.story.objective()
  }

  objectiveTarget(): THREE.Vector3 | null {
    const step = this.story.step
    const mk = this.fs.markers
    if (step === 'go_booth' || step === 'talk_sora' || step === 'loop_morning') return this.sora.root.position
    if (step === 'fetch_lens') return mk.lens
    if (step === 'climb_hook') return mk.hook
    if (step === 'swing_gap') return mk.swing
    if (step === 'evade') return mk.south_gate
    if (step === 'ido_exhibit') return mk.exhibit
    return null
  }

  onClawEvent(e: WireEvent): void {
    if ('target' in e) this.story.send({ kind: 'claw', event: e.kind, targetId: e.target.id })
  }

  update(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    if (this.choice.open) this.choice.input(frame)
    rt.setControlLocked(this.blocked)
    this.story.send({ kind: 'tick', dt })
    const z = this.fs.zoneAt(rt.player.position)
    if (z !== this.lastZone) {
      this.lastZone = z
      if (z) this.story.send({ kind: 'zone', zone: z })
    }
    // ソラ
    if (this.soraSpot === 'escape') {
      const path = this.fs.npcs.soraEscape
      this.soraPathT = Math.min(path.length - 1, this.soraPathT + dt * 0.55)
      const i = Math.min(path.length - 2, Math.floor(this.soraPathT))
      const k = this.soraPathT - i
      this.sora.root.position.lerpVectors(path[i], path[i + 1], k)
      this.sora.root.rotation.y = Math.atan2(-(path[i + 1].x - path[i].x), -(path[i + 1].z - path[i].z))
      if (this.soraPathT >= path.length - 1) this.placeSora('gate')
    } else if (this.talkKey && this.story.step !== 'night_orum') {
      const p = rt.player.position
      const want = Math.atan2(-(p.x - this.sora.root.position.x), -(p.z - this.sora.root.position.z))
      let d = want - this.sora.root.rotation.y
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      this.sora.root.rotation.y += d * Math.min(1, dt * 5)
    }
    // オルム・破片・裂け目・暗転
    if (this.orumAnim) {
      this.orumAnim.t += dt
      const t = this.orumAnim.t
      if (this.orumAnim.mode === 'appear') this.fs.setOrum({ show: Math.min(1, t / 5), tomorrow: Math.max(0.15, 1 - t / 14), dissolve: Math.min(0.62, t / 22) })
      else this.fs.setOrum({ show: 1, swallow: Math.min(1, t / 2.6), dissolve: Math.min(0.9, 0.62 + t / 8) })
    }
    if (this.fs.debris.active) {
      const r = this.fs.debris.update(dt, rt.player.position)
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
    this.sora.update(dt, this.soraSpot === 'escape' ? 3 : 0)
    if (!this.fs.debris.active) this.fs.debris.update(dt, null)
    if (this.fx) {
      this.fx.setAspect(rt.camera.aspect)
      this.fx.update(dt)
    }
    this.fs.update(dt, t)
  }

  debug(): Record<string, unknown> {
    return { step: this.story.step, loop: this.story.loopCount, zone: this.lastZone, choice: this.choice.open }
  }

  dispose(): void {
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
