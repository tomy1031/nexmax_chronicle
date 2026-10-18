// 1726年 大坂・仕掛け横丁（からくり水門）のステージ。docs/シナリオ改訂案_導入編_v1.md の 7 章。
// 中身は world/edo/* の組み立てをそのまま使う（縦切り試作 world/edo/slice.ts をステージの形に移したもの）。
// 7-1 到着：川沿いの通り。足元を茶運び人形がことことと歩いてきて、止まる
// 7-2 町のうわさ：町人（townsfolk.ts）の吹き出し（人形が勝手に止まる・夜の黒い輪・明日の道具が消える）
// 7-3 おはる：人形を追ってきたおはるがネクマックスを見つけ、源兵衛の工房へ案内する（おはるが歩き、プレイヤーがついて行く）
// 7-4 源兵衛「お前、また来たんか！」・三年前に川で助けた話・古い金具（NMClaw の部品）
// 7-5 黒い輪：夕暮れの川向こうの空に小さな黒い輪。からくりがいっせいに止まり、2086年の夜空が一瞬重なる
// 7-6 水門の危機：おはるの知らせ、源兵衛「今ここにおる人を、先に助けるんや」→ 協力パズル（既存）→ 成功すると輪が薄くなる
// 7-7 絵図とおはるの写し → 岸に帰りの光の輪（→ 2026年）
import * as THREE from 'three'
import { createMaterialLibrary } from '../../render/materials'
import { EDO_SKY, type SkyPalette } from '../../render/sky'
import { buildEdoScene, type EdoScene } from '../../world/edo/scene'
import { SHOTS, GATE_GENBEI, GATE_OHARU, SPAWNS, faceYaw, type Placement, type Shot } from '../../world/edo/shots'
import { L } from '../../world/edo/layout'
import { GateFlow } from '../../world/edo/clawTargets'
import { GatePhase, GateResult } from '../../core/gatePuzzleLogic'
import { PART_NAMES } from '../../player/equipment'
import type { WireEvent } from '../../player/clawLogic'
import type { ActionFrame } from '../../player/inputActions'
import type { Character } from '../../world/characters'
import type { Hint } from '../../ui/hud'
import { ERA_EDO, eraTintHex } from '../../core/eras'
import { edoIntroObjective, edoObjective } from '../../core/storyDirector'
import { DialogueDB } from '../../core/dialogue'
import type { DialogueLine } from '../../game/dialogueQueue'
import { skyEnvironment, type EnvTexture } from '../../game/env'
import type { SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageShots, StageWorld } from '../../game/stage'
import data1726 from '../../data/dialogue_1726.json'
import { Townsfolk } from './townsfolk'
import { MobTalk1726 } from './mobTalk1726'
import { ShopDolls, TeaDoll } from './karakuri'
import { BlackRing, RingFlash } from './blackRing'
import { OldFitting } from './fitting'
import { edoNpcPlace, edoPhase, gearGrabbable, oharuShouldCome } from './script'

const lines1726 = new DialogueDB(data1726)

// 夕方前の暖かい日差し（西北西・やや低め）
const SUN_YAW = (-148 * Math.PI) / 180
const SUN_EL = (34 * Math.PI) / 180
const SUN_DIR = new THREE.Vector3(Math.cos(SUN_EL) * Math.cos(SUN_YAW), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(SUN_YAW)).normalize()

/** 夕暮れの空（源兵衛の話のあいだに少しずつ暮れていく） */
const DUSK_SKY: SkyPalette = {
  zenith: '#2c3c86',
  upper: '#6a62b0',
  horizon: '#f2a878',
  warm: '#ff9858',
  ground: '#6a4a3c',
  haze: '#e8b898',
  cloudLit: '#ffcaa0',
  cloudShade: '#8a7aa0',
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 2026年から来たときの到着地点（茶屋と舟着き場のそば。東に源兵衛の工房） */
const ARRIVE: SpawnPoint = { pos: v(-30.2, 0, 10.9), facing: -Math.PI / 2 - 0.1, camYaw: -Math.PI / 2 + 0.3, camPitch: 0.24 }
/** 茶運び人形の道（工房の方から歩いてきて、ネクマックスの前で止まる） */
const DOLL_PATH = [v(-24.2, 0, 11.3), v(-27.0, 0, 11.0), v(-28.75, 0, 10.9)]
/** 源兵衛の工房の前（源兵衛・おはる・店先の人形） */
const SHOP_GENBEI: Placement = { pos: v(-15.6, 0, 12.35), face: v(-15.8, 0, 9.0), pose: 'crank' }
const SHOP_OHARU: Placement = { pos: v(-14.3, 0, 11.75), face: v(-17, 0, 9.5), pose: 'idle' }
const OHARU_DOOR = v(-14.6, 0, 13.2)
/** 黒い輪（川向こうの空・北） */
const RING_POS = v(-12, 25, -68)
/** 水門へ急ぐときの目標（北岸の桟橋の真ん中） */
const PIER_CENTER = v((L.PIER.x0 + L.PIER.x1) / 2, L.PIER.y, (L.PIER.z0 + L.PIER.z1) / 2)
/** 源兵衛・おはるが水門へ向かう道（通り → 水門番の家の前の板の道 → 作業台） */
const GATE_PATH_GENBEI = [v(-15.6, 0, 11.4), v(-6, 0, 10.4), v(1.5, 0, 9.3), v(3.0, 0.15, 7.2), v(3.0, 0.15, 1.6), v(GATE_GENBEI.pos.x, GATE_GENBEI.pos.y, GATE_GENBEI.pos.z)]
const GATE_PATH_OHARU = [v(-14.3, 0, 11.2), v(-6, 0, 10.0), v(1.6, 0, 8.9), v(3.2, 0.15, 7.2), v(3.4, 0.15, 3.2)]

/** 帰還の光の輪（水門を直したあと、桟橋の後ろの岸に開く）。2026年の出発地点の記録に鉱石が反応する */
const RETURN_RING = v(1.4, 0, -9.3)
const RETURN_REACH = 2.4

type Walker = { ch: Character; path: THREE.Vector3[]; i: number; speed: number; face: THREE.Vector3 | null; done: (() => void) | null }

export class EdoStage implements Stage {
  readonly key = '1726' as const
  readonly era = ERA_EDO
  readonly label = '1726年　大坂・仕掛け横丁'
  readonly subtitle = '享保11年 ― からくり職人の町'
  readonly environment: StageEnvironment = {
    sky: EDO_SKY,
    sunDir: SUN_DIR,
    hdri: './hdri/kloppenheim_06_puresky_1k.hdr',
    envIntensity: 0.75,
    fog: { color: EDO_SKY.haze, density: 0.0028 },
  }
  private edo!: EdoScene
  private genbei!: Character
  private oharu!: Character
  private gateFlow!: GateFlow
  private waterEnv: EnvTexture | null = null
  private from: string | null = null
  private ringOpen = false
  private successTimer = -1
  private folk!: Townsfolk
  private mobs: MobTalk1726 | null = null
  private doll!: TeaDoll
  private shopDolls!: ShopDolls
  private ring!: BlackRing
  private flash: RingFlash | null = null
  private fitting!: OldFitting
  private readonly walkers: Walker[] = []
  /** 段階の演出（到着・おはる・工房・黒い輪）を流している */
  private busy = false
  /** 到着の演出：人形が歩いてくる → 止まった時刻 */
  private dollStopT = -1
  private arrivalPos = new THREE.Vector3()
  /** おはる：'inside'（工房の中）→ 'run'（人形へ走る）→ 'meet'（会話）→ 'lead'（工房へ）→ 'shop'（工房の前）→ 'gate' */
  private oharuState: 'inside' | 'run' | 'meet' | 'lead' | 'shop' | 'gate' = 'shop'
  private oharuCarry = false
  /** 源兵衛・おはるの向く相手 */
  private genbeiLook: THREE.Vector3 | null = null
  private oharuLook: THREE.Vector3 | null = null
  /** 水門の持ち場へまだ着いていない（見えないところで持ち場へ移す） */
  private toGate = { genbei: false, oharu: false }
  private dusk = 0
  private duskTarget = 0
  private skyDay: Record<string, THREE.Color> | null = null
  private sunDay = new THREE.Color()
  private sunDayI = 1
  private fogDay = new THREE.Color()
  private readonly timers: Array<{ t: number; done: () => void }> = []
  private stageT = 0
  private readonly frustum = new THREE.Frustum()
  private readonly pm = new THREE.Matrix4()
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly carryPos = new THREE.Vector3()

  /** 読み込んだときの段階（到着地点の既定に使う） */
  private startPhase: ReturnType<typeof edoPhase> = 'town'

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    this.from = ctx.from
    this.startPhase = edoPhase((n) => ctx.story.get(n))
    // キャラクターは早めに読み込み開始（テクスチャ生成と並行）
    const charsPromise = Promise.all([ctx.loadNpc('genbei', 1.6), ctx.loadNpc('oharu', 1.32)])
    ctx.progress(0.12, 'テクスチャを生成中…')
    await ctx.yieldFrame()
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    const mats = await createMaterialLibrary(aniso)
    ctx.progress(0.4, '仕掛け横丁を組み立て中…')
    await ctx.yieldFrame()
    this.edo = buildEdoScene(mats, ctx.quality)
    // 水面だけは彩度の高い空を映す（HDRI の白い地平が映ると水が白っぽくなるため）
    this.waterEnv = skyEnvironment(ctx.renderer, { ...EDO_SKY, horizon: '#74b8e6', upper: '#3d8ce0', ground: '#2c7a84', cloudLit: '#e8f2fa' }, SUN_DIR)
    ;(this.edo.water.material as THREE.MeshStandardMaterial).envMap = this.waterEnv.texture
    ctx.progress(0.6, '町の人とからくりを組み立て中…')
    await ctx.yieldFrame()
    this.folk = new Townsfolk()
    this.doll = new TeaDoll()
    this.shopDolls = new ShopDolls(v(-18.4, 0, 12.75), 0)
    this.ring = new BlackRing(RING_POS, 15)
    this.fitting = new OldFitting()
    this.edo.root.add(this.folk.group, this.doll.root, this.shopDolls.root, this.ring.mesh, this.fitting.root)
    this.edo.colliders.box(-18.4, 0.35, 12.75, 1.0, 0.7, 0.5)
    ctx.progress(0.7, 'キャラクターを読み込み中…')
    await ctx.yieldFrame()
    const [genbei, oharu] = await charsPromise
    this.genbei = genbei
    this.oharu = oharu
    this.edo.root.add(genbei.root, oharu.root)
    return { root: this.edo.root, colliders: this.edo.colliders, claw: { targets: this.edo.claw.targets, movables: this.edo.claw.movables }, lights: this.edo.lights }
  }

  spawn(id: string | null): SpawnPoint {
    if (id === 'arrive' || id === 'edo_arrive') return ARRIVE
    if (id === 'edo_return') return { pos: v(RETURN_RING.x + 1.2, 0, RETURN_RING.z + 3.4), facing: 0.35, camYaw: 0.35, camPitch: 0.2 }
    // 指定が無いとき：まだ町に着いたばかりなら到着地点（茶屋のそば）から
    if (!id) return this.startPhase === 'town' ? ARRIVE : SPAWNS.street
    return SPAWNS[id] ?? SPAWNS.street
  }

  begin(rt: StageRuntime): void {
    const hud = rt.hud
    const f = (n: string) => rt.story.get(n)
    this.gateFlow = new GateFlow(this.edo.gate, this.edo.claw.boats, this.edo.claw.gearTarget, (speaker, text) => hud.say(speaker, text))
    this.mobs = new MobTalk1726(this.folk, rt.renderer.domElement.ownerDocument.getElementById('ui'), rt.camera)
    this.flash = new RingFlash(rt.renderer.domElement.ownerDocument.getElementById('ui'))
    this.captureDay(rt)
    this.arrivalPos.copy(rt.player.position)
    const phase = edoPhase(f)
    // 源兵衛・おはるの居場所
    if (edoNpcPlace(f) === 'gate') {
      this.place(this.genbei, GATE_GENBEI)
      this.place(this.oharu, GATE_OHARU)
      this.oharuState = 'gate'
      this.ring.appear(true)
      this.folk.lookToward(RING_POS)
      this.setDusk(1, true)
      this.shopDolls.frozen = true
      this.doll.root.visible = false
    } else {
      this.place(this.genbei, SHOP_GENBEI)
      this.place(this.oharu, SHOP_OHARU)
      if (phase === 'workshop') this.setDusk(0.6, true)
      // 茶運び人形：最初はネクマックスの前へ歩いてくる。おはるに会ったあとは工房の前の台の上
      if (phase === 'town') {
        this.oharu.root.visible = false
        this.oharuState = 'inside'
        this.doll.walkPath(DOLL_PATH, 0.55)
        this.doll.onStop = () => {
          this.dollStopT = this.stageT
        }
      } else {
        this.oharuState = 'shop'
        this.doll.root.position.set(-18.1, 0.65, 12.6)
        this.doll.root.rotation.y = 0
      }
    }
    // 大歯車は水門の危機のあいだだけつかめる
    this.edo.claw.gearTarget.enabled = gearGrabbable(f)
    // セーブ・?flags= で水門を直したあとから始めるとき
    if (f('gate_repaired')) {
      this.gateFlow.logic.phase = GatePhase.DONE
      this.gateFlow.logic.progress = 1
      this.gateFlow.resultTime = 999
      this.edo.claw.gearTarget.enabled = false
      this.ring.hide()
      this.folk.lookToward(null)
      this.openReturnRing(rt, false)
    } else if (phase === 'crisis') this.toGate = { genbei: false, oharu: false }
    rt.save(this.from ? 'edo_arrive' : 'street')
    if (rt.params.has('debug')) {
      ;(window as unknown as { __edoDev?: unknown }).__edoDev = {
        tp: (x: number, z: number, facing?: number, y = 0) => rt.player.teleport(new THREE.Vector3(x, y, z), facing),
        stage: this,
        cam: () => rt.camera.position.toArray().map((x) => +x.toFixed(2)),
        rt,
      }
    }
  }

  revealed(rt: StageRuntime): void {
    if (this.from === '2026' || edoPhase((n) => rt.story.get(n)) === 'town') void this.runArrival(rt)
  }

  // ---------------------------------------------------------------- 小さな道具

  /** ゲームの時間で待つ（一時停止中は進まない） */
  private wait(sec: number): Promise<void> {
    return new Promise((r) => this.timers.push({ t: sec, done: r }))
  }

  private place(ch: Character, p: Placement): void {
    ch.root.position.copy(p.pos)
    ch.root.rotation.y = faceYaw(p.pos, p.face)
    ch.setPose(p.pose)
  }

  /** 人物を道に沿って歩かせる（終わると resolve） */
  private walkTo(ch: Character, path: THREE.Vector3[], speed: number, face: THREE.Vector3 | null = null): Promise<void> {
    const old = this.walkers.findIndex((w) => w.ch === ch)
    if (old >= 0) {
      this.walkers[old].done?.()
      this.walkers.splice(old, 1)
    }
    return new Promise((done) => {
      this.walkers.push({ ch, path: [ch.root.position.clone(), ...path.map((p) => p.clone())], i: 1, speed, face, done })
    })
  }

  private isWalking(ch: Character): boolean {
    return this.walkSpeed(ch) > 0
  }

  /** 歩いている速さ（歩いていなければ 0。毎フレーム呼ぶので配列の関数を使わない） */
  private walkSpeed(ch: Character): number {
    for (let i = 0; i < this.walkers.length; i++) if (this.walkers[i].ch === ch) return this.walkers[i].speed
    return 0
  }

  private updateWalkers(dt: number): void {
    for (let k = this.walkers.length - 1; k >= 0; k--) {
      const w = this.walkers[k]
      const target = w.path[w.i]
      this.tmp.subVectors(target, w.ch.root.position)
      const d = Math.hypot(this.tmp.x, this.tmp.z)
      const step = w.speed * dt
      if (d <= step) {
        w.ch.root.position.copy(target)
        w.i++
        if (w.i >= w.path.length) {
          this.walkers.splice(k, 1)
          if (w.face) w.ch.root.rotation.y = faceYaw(w.ch.root.position, w.face)
          w.done?.()
        }
      } else {
        w.ch.root.position.x += (this.tmp.x / d) * step
        w.ch.root.position.z += (this.tmp.z / d) * step
        w.ch.root.position.y += this.tmp.y * Math.min(1, step / d)
        this.turn(w.ch, this.tmp.x, this.tmp.z, dt, 9)
      }
    }
  }

  private turn(ch: Character, vx: number, vz: number, dt: number, rate: number): void {
    if (Math.hypot(vx, vz) < 0.05) return
    const want = Math.atan2(-vx, -vz)
    let d = want - ch.root.rotation.y
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    ch.root.rotation.y += d * Math.min(1, rate * dt)
  }

  /** 画面に映っているか（持ち場へ移すのは見えないところで） */
  private onScreen(p: THREE.Vector3, rt: StageRuntime): boolean {
    rt.camera.updateMatrixWorld()
    this.pm.multiplyMatrices(rt.camera.projectionMatrix, rt.camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.pm)
    return this.frustum.containsPoint(this.tmp2.copy(p).setY(p.y + 0.9))
  }

  // ---------------------------------------------------------------- 夕暮れ（空・日差し・霧の色）

  private captureDay(rt: StageRuntime): void {
    const u = (rt.sky.material as THREE.ShaderMaterial).uniforms as Record<string, { value: unknown }> | undefined
    if (u?.uZenith) {
      this.skyDay = {}
      for (const k of ['uZenith', 'uUpper', 'uHorizon', 'uWarm', 'uHaze', 'uCloudLit', 'uCloudShade']) this.skyDay[k] = (u[k].value as THREE.Color).clone()
    }
    this.sunDay.copy(rt.sun.sun.color)
    this.sunDayI = rt.sun.sun.intensity
    const fog = rt.scene.fog as THREE.FogExp2 | null
    if (fog) this.fogDay.copy(fog.color)
  }

  private setDusk(k: number, instant: boolean): void {
    this.duskTarget = k
    if (instant) this.dusk = k
  }

  private applyDusk(rt: StageRuntime): void {
    const k = this.dusk
    const u = (rt.sky.material as THREE.ShaderMaterial).uniforms as Record<string, { value: unknown }> | undefined
    if (u && this.skyDay) {
      const map: Record<string, keyof SkyPalette> = { uZenith: 'zenith', uUpper: 'upper', uHorizon: 'horizon', uWarm: 'warm', uHaze: 'haze', uCloudLit: 'cloudLit', uCloudShade: 'cloudShade' }
      for (const key in map) (u[key].value as THREE.Color).copy(this.skyDay[key]).lerp(this.tmpColor.set(DUSK_SKY[map[key]]), k)
    }
    rt.sun.sun.color.copy(this.sunDay).lerp(this.tmpColor.set('#ff9a5a'), k * 0.8)
    rt.sun.sun.intensity = this.sunDayI * (1 - 0.3 * k)
    const fog = rt.scene.fog as THREE.FogExp2 | null
    if (fog) fog.color.copy(this.fogDay).lerp(this.tmpColor.set(DUSK_SKY.haze), k * 0.85)
  }
  private readonly tmpColor = new THREE.Color()

  // ---------------------------------------------------------------- 7-1〜7-3：到着・人形・おはる

  private async runArrival(rt: StageRuntime): Promise<void> {
    this.busy = true
    await rt.dialogue(lines1726.lines('arrive_from_2026'))
    // 人形が歩いてくるのを見せる（人形を追う）
    if (this.doll.mode === 'walk' || this.dollStopT < 0) {
      void rt.cinematic({ look: this.doll.position, hold: Infinity, inSec: 1.2, fov: 40, arc: 0 })
      await rt.dialogue(lines1726.lines('doll_walks'))
      while (this.doll.mode === 'walk') await this.wait(0.2)
      await rt.dialogue(lines1726.lines('doll_stops'))
      rt.endCinematic()
    }
    this.busy = false
  }

  /** おはるが人形を追って工房から走ってくる → 人形を抱える → ネクマックスに気づいて話す → 工房へ案内 */
  private async runOharu(rt: StageRuntime): Promise<void> {
    this.oharuState = 'run'
    this.oharu.root.visible = true
    this.oharu.root.position.copy(OHARU_DOOR)
    await this.walkTo(this.oharu, [v(-16, 0, 11.0), this.doll.position.clone().add(v(0.55, 0, 0.1))], 3.0)
    // 人形を抱える
    this.oharuCarry = true
    this.doll.carry()
    this.oharuLook = rt.player.position
    // ネクマックスが遠ければ、こちらへ来る
    while (Math.hypot(this.oharu.root.position.x - rt.player.position.x, this.oharu.root.position.z - rt.player.position.z) > 3.2) {
      if (!this.isWalking(this.oharu)) {
        const p = rt.player.position
        const o = this.oharu.root.position
        const d = Math.hypot(p.x - o.x, p.z - o.z)
        void this.walkTo(this.oharu, [v(o.x + ((p.x - o.x) * (d - 1.8)) / d, 0, o.z + ((p.z - o.z) * (d - 1.8)) / d)], 2.2)
      }
      await this.wait(0.3)
    }
    this.oharuState = 'meet'
    this.busy = true
    rt.setControlLocked(true)
    const o = this.oharu.root.position
    const p = rt.player.position
    rt.player.turnToward(o.x - p.x, o.z - p.z, 1, 1)
    const mid = v((o.x + p.x) / 2, 0.85, (o.z + p.z) / 2)
    // 川の側（北）から二人を横に
    void rt.cinematic({ look: mid, from: v(mid.x + 0.6, 1.45, mid.z - 3.2), fromTo: v(mid.x + 0.4, 1.3, mid.z - 2.6), hold: Infinity, inSec: 1.4, panSec: 9, fov: 42 })
    await rt.dialogue(lines1726.lines('oharu_meet'))
    rt.endCinematic()
    rt.setControlLocked(false)
    rt.story.set('met_oharu', true)
    rt.save('edo_arrive')
    this.busy = false
    // 工房へ（ふり返りながら歩く）
    this.oharuState = 'lead'
    this.oharuLook = null
    await this.walkTo(this.oharu, [v(-22, 0, 10.9), v(-17.2, 0, 11.2), SHOP_OHARU.pos], 1.9, rt.player.position)
    this.oharuState = 'shop'
    this.oharuLook = rt.player.position
  }

  // ---------------------------------------------------------------- 7-4〜7-6：工房・黒い輪・水門の危機

  private async runWorkshop(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    const g = this.genbei
    this.genbeiLook = rt.player.position
    g.setPose('idle')
    // おはるより先に工房へ来たとき：おはるも工房から出てくる
    if (!this.oharu.root.visible) {
      this.oharu.root.position.copy(OHARU_DOOR)
      this.oharu.root.visible = true
      this.oharuState = 'shop'
      rt.story.set('met_oharu', true)
    }
    // 人形は台の上へ戻す
    this.oharuCarry = false
    this.doll.mode = 'stop'
    this.doll.root.position.set(-18.1, 0.65, 12.6)
    this.doll.root.rotation.y = 0
    this.setDusk(0.65, false)
    const L0 = lines1726.lines('genbei_first_meet')
    const p = rt.player.position
    // 「お前、また来たんか！」：源兵衛が驚いて数歩近づく（おはるもついてくる）
    {
      const gp0 = g.root.position
      const d = Math.hypot(gp0.x - p.x, gp0.z - p.z)
      const ux = (gp0.x - p.x) / d
      const uz = (gp0.z - p.z) / d
      const meetG = v(p.x + ux * 1.75, 0, p.z + uz * 1.75)
      const meetO = v(meetG.x - uz * 0.95 + ux * 0.35, 0, meetG.z + ux * 0.95 + uz * 0.35)
      const said = rt.dialogue(L0.slice(0, 1))
      void this.walkTo(this.oharu, [meetO], 1.6, p)
      await Promise.all([said, this.walkTo(g, [meetG], 1.5, p)])
    }
    rt.player.turnToward(g.root.position.x - p.x, g.root.position.z - p.z, 1, 1)
    const mid = v((g.root.position.x + p.x) / 2, 0.95, (g.root.position.z + p.z) / 2)
    // 川の側（北）から二人を横に。工房の店先が背景
    const perp = this.tmp2.set(g.root.position.z - p.z, 0, -(g.root.position.x - p.x)).normalize()
    if (perp.z > 0) perp.negate()
    const side = v(mid.x + perp.x * 3.6, 1.6, mid.z + perp.z * 3.6)
    const sideIn = v(mid.x + perp.x * 2.9, 1.45, mid.z + perp.z * 2.9)
    void rt.cinematic({ look: mid, from: side, fromTo: sideIn, hold: Infinity, inSec: 1.3, panSec: 14, fov: 42 })
    await rt.dialogue(L0.slice(1, 4))
    // 古い金具を取り出す（源兵衛の手のひらの上。ネクマックスの目の高さ）
    const gp = g.root.position
    const dir = this.tmp.set(p.x - gp.x, 0, p.z - gp.z).normalize()
    this.fitting.root.position.set(gp.x + dir.x * 0.5, 1.02, gp.z + dir.z * 0.5)
    this.fitting.show(true)
    rt.oreGlow(0.8)
    const fp = this.fitting.root.position.clone()
    // ネクマックスの目の高さ・すぐ横から、金具と、その向こうの源兵衛の顔
    void rt.cinematic({ look: v(fp.x, fp.y + 0.12, fp.z), from: v(fp.x + dir.x * 1.25 + perp.x * 0.35, 1.2, fp.z + dir.z * 1.25 + perp.z * 0.35), hold: Infinity, inSec: 1.2, fov: 36, arc: 0 })
    await rt.dialogue(L0.slice(4, 7))
    this.fitting.show(false)
    void rt.cinematic({ look: mid, from: sideIn, hold: Infinity, inSec: 1.2, fov: 42 })
    await rt.dialogue(L0.slice(7))
    rt.story.set('met_genbei', true)
    rt.save('edo_arrive')
    await this.runBlackRing(rt)
  }

  /** 7-5 黒い輪 → 7-6 水門の危機の知らせ */
  private async runBlackRing(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    this.setDusk(1, false)
    // 外が騒がしくなる
    const c = lines1726.lines('ring_commotion')[0]
    rt.say(c.speaker, c.text, 3)
    this.ring.appear()
    this.folk.lookToward(RING_POS)
    await this.wait(1.2)
    // 空の黒い輪へ寄る。からくりがいっせいに止まり、2086年の夜空が一瞬重なる
    const p = rt.player.position
    void rt.cinematic({
      look: RING_POS.clone().add(v(0, -4, 0)),
      lookTo: RING_POS.clone(),
      from: v(p.x + 0.6, 1.7, p.z + 2.2),
      hold: Infinity,
      inSec: 2.2,
      panSec: 6,
      fov: 26,
      shake: 0.08,
    })
    this.genbeiLook = RING_POS
    this.oharuLook = RING_POS
    await this.wait(1.6)
    this.shopDolls.frozen = true
    this.doll.frozen = true
    this.flash?.play()
    rt.shake(0.5)
    rt.oreGlow(1.4)
    const R = lines1726.lines('ring_seen')
    await rt.dialogue(R.slice(0, 1))
    this.genbeiLook = rt.player.position
    await rt.dialogue(R.slice(1, 3))
    rt.endCinematic()
    await rt.dialogue(R.slice(3))
    rt.story.set('black_ring_seen', true)
    rt.save('edo_arrive')
    // 7-6 おはるが水門を見に走る → 知らせ
    this.oharuLook = null
    this.oharuState = 'gate'
    void rt.dialogue(lines1726.lines('oharu_go_gate'))
    void this.walkTo(this.oharu, GATE_PATH_OHARU, 3.2)
    await this.wait(4.2)
    const A = lines1726.lines('gate_alarm') as readonly DialogueLine[]
    await rt.dialogue(A)
    this.edo.claw.gearTarget.enabled = true
    rt.setControlLocked(false)
    this.busy = false
    this.genbeiLook = null
    void this.walkTo(this.genbei, GATE_PATH_GENBEI, 2.8, v(L.GENBEI_WHEEL.x, 0, L.GENBEI_WHEEL.z)).then(() => {
      this.toGate.genbei = true
      this.place(this.genbei, GATE_GENBEI)
    })
    rt.save('edo_arrive')
  }

  // ---------------------------------------------------------------- 会話（F）

  private nearNpc(rt: StageRuntime): Character | null {
    const p = rt.player.position
    let best: Character | null = null
    let bd = Infinity
    for (const [ch, reach] of [
      [this.genbei, 2.6],
      [this.oharu, 3.0],
    ] as const) {
      if (!ch.root.visible) continue
      const d = Math.hypot(ch.root.position.x - p.x, ch.root.position.z - p.z)
      if (d < reach && d < bd && Math.abs(ch.root.position.y - p.y) < 2.4) {
        best = ch
        bd = d
      }
    }
    return best
  }

  private nearRing(rt: StageRuntime): boolean {
    const p = rt.player.position
    return this.ringOpen && Math.hypot(p.x - RETURN_RING.x, p.z - RETURN_RING.z) < RETURN_REACH
  }

  private talk(who: Character, rt: StageRuntime): void {
    const hud = rt.hud
    const f = (n: string) => rt.story.get(n)
    const phase = edoPhase(f)
    const ph = this.gateFlow.logic.phase
    if (who === this.genbei) {
      if (phase === 'town' && (this.oharuState === 'run' || this.oharuState === 'meet')) {
        hud.say('源兵衛', 'おはるのやつ、また人形を追いかけて行きよった。')
        return
      }
      if (phase === 'town' || phase === 'follow') {
        void this.runWorkshop(rt)
        return
      }
      if (phase === 'workshop') {
        // 金具の話のあと（セーブから）：もう一言から黒い輪へ
        this.busy = true
        void rt.dialogue(lines1726.lines('genbei_workshop')).then(() => this.runBlackRing(rt))
        return
      }
      if (ph === GatePhase.DONE) hud.say('源兵衛', '助かったわ。仕掛けは使う人と一緒に作るもんやな。')
      else if (ph === GatePhase.WAIT_SIGNAL) hud.say('源兵衛', '歯止めは入っとる。おはるの合図で離すんやで。')
      else if (this.gateFlow.logic.holding) hud.say('源兵衛', '今やっとる！ 離さんといてや！')
      else hud.say('源兵衛', '向こう岸の桟橋から、その腕で大歯車をつかんでくれ！')
    } else {
      if (phase === 'follow' || phase === 'town') {
        void rt.dialogue(lines1726.lines('oharu_wait'))
        return
      }
      if (phase === 'workshop') hud.say('おはる', 'おじいちゃん、ずっと待っとったんやと思う。あんたのこと。')
      else if (ph === GatePhase.DONE) hud.say('おはる', '絵図の写し、ちゃんと残しとくからね。')
      else if (ph === GatePhase.WAIT_SIGNAL) hud.say('おはる', this.gateFlow.logic.isDanger() ? '待って！ そこに人がいる！' : '今は離して！ もう大丈夫や！')
      else hud.say('おはる', 'うちは見張り台から水路を見とくね！ 舟が来たら教えるから！')
    }
  }

  interact(rt: StageRuntime): boolean {
    if (this.busy) return true
    if (this.nearRing(rt)) {
      void this.leave(rt)
      return true
    }
    const n = this.nearNpc(rt)
    if (n) {
      this.talk(n, rt)
      return true
    }
    return this.mobs?.interact(rt) ?? false
  }

  /** 7-7 帰り：お礼と「また来るんやろ？」→ 光の輪へ */
  private async leave(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    this.genbeiLook = rt.player.position
    this.oharuLook = rt.player.position
    this.genbei.setPose('wave')
    this.oharu.setPose('wave')
    const R = lines1726.lines('return_ring')
    await rt.dialogue(R.slice(0, 1))
    // 水門の作業台と見張り台から手を振る二人
    const gp = this.genbei.root.position
    const op = this.oharu.root.position
    const look = v((gp.x + op.x) / 2, (gp.y + op.y) / 2 + 1.0, (gp.z + op.z) / 2)
    void rt.cinematic({ look, from: v(look.x - 1.6, 2.3, look.z - 5.6), hold: Infinity, inSec: 1.4, fov: 40 })
    await rt.dialogue(R.slice(1, 2))
    rt.endCinematic()
    await rt.dialogue(R.slice(2))
    rt.oreGlow(2)
    rt.setControlLocked(false)
    const v2 = rt.travel({ to: '2026', cause: 'return', spawn: 'present_ido' })
    if (!v2.ok) rt.hud.toast(v2.reason)
    this.busy = false
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.busy) return []
    if (this.nearRing(rt)) return [{ key: 'F', label: '光の輪で2026年へ帰る' }]
    if (this.nearNpc(rt)) return [{ key: 'F', label: '話す' }]
    return this.mobs?.hints(rt) ?? null
  }

  objective(rt: StageRuntime): { title: string; sub: string } {
    const f = (n: string) => rt.story.get(n)
    const intro = edoIntroObjective(f)
    if (intro) return { title: intro.title, sub: intro.sub }
    if (this.ringOpen) return edoObjective(f)
    if (edoPhase(f) === 'crisis' && this.gateFlow.logic.phase === GatePhase.WAIT_GRAB && !this.nearPier(rt)) return { title: '水門へ急ごう', sub: '赤い橋を渡って、向こう岸の桟橋へ' }
    return this.gateFlow.objective()
  }

  private nearPier(rt: StageRuntime): boolean {
    const p = rt.player.position
    return p.z < L.PIER.z1 + 0.6 && p.z > L.NORTH_Z1 && Math.abs(p.x - PIER_CENTER.x) < 8
  }

  objectiveTarget(rt: StageRuntime): THREE.Vector3 | null {
    const f = (n: string) => rt.story.get(n)
    const phase = edoPhase(f)
    if (phase === 'town') return null
    if (phase === 'follow') return this.oharu.root.position
    if (phase === 'workshop') return this.genbei.root.position
    if (this.ringOpen) return RETURN_RING
    if (this.gateFlow.done) return null
    return this.nearPier(rt) ? this.edo.gate.gearCenter : PIER_CENTER
  }

  // ---------------------------------------------------------------- クロー・水門パズル

  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    switch (e.kind) {
      case 'connected':
        if (e.target.type === 'hold_mechanism') {
          this.gateFlow.onGrab()
          // 支え始めたら、まだ持ち場にいない二人をそっと持ち場へ
          this.snapToGate(true)
        }
        break
      case 'released':
        if (e.target.type === 'hold_mechanism') {
          const hud = rt.hud
          const r = this.gateFlow.onRelease()
          if (r === GateResult.TOO_EARLY) {
            hud.banner('まだ早い！', 'fail', 1.6)
            rt.story.timeline.addMetric('release_too_early')
          } else if (r === GateResult.PERSON_IN_DANGER) {
            hud.flash('danger')
            hud.banner('危ない！ 舟が下にいる', 'fail', 2.0)
            rt.story.timeline.addMetric('release_person_danger')
          } else if (r === GateResult.SUCCESS) {
            hud.flash('success')
            hud.banner('水門 修理完了！', 'success', 3.2)
            rt.oreGlow(1)
            rt.story.set('gate_repaired', true)
            // 成功の台詞のあと、黒い輪が薄くなり、源兵衛が気づく → 絵図
            this.successTimer = 3.4
          }
        }
        break
    }
  }

  private snapToGate(force: boolean): void {
    if (!this.toGate.genbei && (force || this.isWalking(this.genbei))) {
      const w = this.walkers.findIndex((x) => x.ch === this.genbei)
      if (w >= 0) this.walkers.splice(w, 1)
      this.place(this.genbei, GATE_GENBEI)
      this.toGate.genbei = true
    }
    if (!this.toGate.oharu || force) {
      const w = this.walkers.findIndex((x) => x.ch === this.oharu)
      if (w >= 0) this.walkers.splice(w, 1)
      this.place(this.oharu, GATE_OHARU)
      this.toGate.oharu = true
    }
  }

  private async afterGate(rt: StageRuntime): Promise<void> {
    this.busy = true
    // 輪が薄くなる（空を見せる）
    this.ring.fade(0.25)
    // 北岸の屋根の上に空が見えるよう、水路の上の高いところから見上げる
    void rt.cinematic({ look: RING_POS.clone(), from: v(PIER_CENTER.x - 1.5, 5.4, -2.2), hold: Infinity, inSec: 1.8, fov: 32 })
    await this.wait(1.4)
    await rt.dialogue(lines1726.lines('ring_fades'))
    this.ring.fade(0)
    this.folk.lookToward(null)
    this.shopDolls.frozen = false
    this.doll.frozen = false
    rt.endCinematic()
    rt.story.set('genbei_drawing_found', true)
    await rt.dialogue(lines1726.lines('gate_drawing').slice(0, 3))
    rt.oreGlow(1.6)
    this.openReturnRing(rt, true)
    void rt.cinematic({ look: RETURN_RING.clone().setY(1.2), hold: 1.6, inSec: 1.2, outSec: 1.2, fov: 46, marker: { pos: RETURN_RING.clone().setY(1.0), label: '帰りの光の輪', color: '#9fe8ff' } })
    await rt.dialogue(lines1726.lines('gate_drawing').slice(3))
    this.busy = false
  }

  private openReturnRing(rt: StageRuntime, announce: boolean): void {
    this.ringOpen = true
    rt.rift.openAt(RETURN_RING, eraTintHex(2026), 1.55, 0.8)
    if (announce) rt.save('edo_return')
  }

  update(dt: number, _frame: ActionFrame, rt: StageRuntime): void {
    const f = (n: string) => rt.story.get(n)
    this.stageT += dt
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]
      t.t -= dt
      if (t.t <= 0) {
        this.timers.splice(i, 1)
        t.done()
      }
    }
    const phase = edoPhase(f)
    // 水門のパズルは危機のときから（それまでは歯車も止まっている）
    if (phase === 'crisis' || phase === 'after') this.gateFlow.tick(dt)
    else this.edo.gate.setGearSpeed(0)
    if (this.successTimer > 0) {
      this.successTimer -= dt
      if (this.successTimer <= 0) void this.afterGate(rt)
    }
    // 7-3 おはるが出てくる合図
    if (phase === 'town' && this.oharuState === 'inside' && !this.busy && this.dollStopT >= 0) {
      const moved = Math.hypot(rt.player.position.x - this.arrivalPos.x, rt.player.position.z - this.arrivalPos.z)
      if (oharuShouldCome(this.stageT - this.dollStopT, moved, this.mobs?.rumorsHeard ?? 0)) void this.runOharu(rt)
    }
    // 7-4 工房に着くと、源兵衛のほうから声をかける
    if (phase === 'follow' && !this.busy) {
      const g = this.genbei.root.position
      if (Math.hypot(rt.player.position.x - g.x, rt.player.position.z - g.z) < 5.0) void this.runWorkshop(rt)
    }
    // 水門へ向かう二人：見えないところで持ち場へ
    if (phase === 'crisis') {
      if (!this.toGate.genbei && this.isWalking(this.genbei) && !this.onScreen(this.genbei.root.position, rt) && this.genbei.root.position.x > -8) this.snapToGate(false)
      if (!this.toGate.oharu && !this.isWalking(this.oharu) && !this.onScreen(this.oharu.root.position, rt)) {
        this.place(this.oharu, GATE_OHARU)
        this.toGate.oharu = true
      }
      if (!this.busy && !this.isWalking(this.genbei) && !this.toGate.genbei && this.genbeiLook === null) {
        // セーブから危機の途中で始めたとき
        this.place(this.genbei, GATE_GENBEI)
        this.place(this.oharu, GATE_OHARU)
        this.toGate.genbei = this.toGate.oharu = true
      }
    }
    // 仲間のポーズと向き
    this.updateWalkers(dt)
    const gs = this.gateFlow.hudState()
    const atGate = phase === 'crisis' || phase === 'after'
    if (atGate && this.toGate.genbei && !this.isWalking(this.genbei) && !this.busy) this.genbei.setPose(gs.phase === GatePhase.DONE ? 'wave' : 'crank')
    if (atGate && this.toGate.oharu && !this.isWalking(this.oharu) && !this.busy) {
      this.oharu.setPose(gs.signal === 'wait' ? 'hold' : gs.phase === GatePhase.ADJUSTING && this.gateFlow.logic.holding ? 'idle' : 'wave')
      if (gs.signal === 'wait') this.oharu.setAim(null)
    }
    if (!atGate) {
      if (!this.isWalking(this.genbei)) {
        const look = this.genbeiLook ?? (Math.hypot(rt.player.position.x - this.genbei.root.position.x, rt.player.position.z - this.genbei.root.position.z) < 5 ? rt.player.position : null)
        if (look) this.turn(this.genbei, look.x - this.genbei.root.position.x, look.z - this.genbei.root.position.z, dt, 4)
        if (phase === 'town' || phase === 'follow') this.genbei.setPose(this.genbeiLook ? 'idle' : 'crank')
      }
    }
    if (!this.isWalking(this.oharu) && this.oharuLook && this.oharu.root.visible) this.turn(this.oharu, this.oharuLook.x - this.oharu.root.position.x, this.oharuLook.z - this.oharu.root.position.z, dt, 5)
    if (!this.isWalking(this.genbei) && this.genbeiLook && atGate && this.busy) this.turn(this.genbei, this.genbeiLook.x - this.genbei.root.position.x, this.genbeiLook.z - this.genbei.root.position.z, dt, 4)
    rt.hud.setGate(gs.visible && atGate ? { progress: gs.progress, signal: gs.signal, signalText: gs.signalText, adjusting: gs.phase === GatePhase.ADJUSTING && this.gateFlow.logic.holding } : null)
    this.mobs?.update(dt, rt, this.busy)
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    this.genbei.update(dt, this.walkSpeed(this.genbei))
    this.oharu.update(dt, this.walkSpeed(this.oharu))
    this.edo.update(dt, t)
    this.folk.update(dt)
    // おはるが抱えた人形（胸の前）
    if (this.oharuCarry) {
      const o = this.oharu.root
      this.carryPos.set(o.position.x - Math.sin(o.rotation.y) * 0.24, o.position.y + 0.62, o.position.z - Math.cos(o.rotation.y) * 0.24)
      this.doll.carryAt(this.carryPos, o.rotation.y)
    }
    this.doll.update(dt)
    this.shopDolls.update(dt)
    this.ring.update(dt, rt.camera, t)
    this.fitting.update(dt, t, rt.camera)
    this.flash?.update(dt)
    this.mobs?.render(dt)
    if (Math.abs(this.dusk - this.duskTarget) > 0.001 || this.stageT < 0.1) {
      this.dusk += Math.sign(this.duskTarget - this.dusk) * Math.min(Math.abs(this.duskTarget - this.dusk), dt / 12)
      this.applyDusk(rt)
    }
  }

  onRespawn(): void {
    // 水に落ちたときは特に何もしない（クローの解除はシェル）
  }

  // ---------------------------------------------------------------- 撮影用ショット（?shot=05 / 04 / overview、P キー）

  readonly shots: StageShots = {
    ids: SHOTS.map((s) => s.id),
    apply: (index, rt) => this.applyShot(index >= 0 ? SHOTS[index] : null, rt),
    update: (index, dt, hand, rt) => {
      if (index >= 0 && rt.claw.beam.active) rt.claw.beam.update(dt, hand, this.tmp.copy(this.edo.gate.gearGrabPoint), { open: 0, thickness: 1 })
    },
    focus: (index) => SHOTS[index].focus,
    nexmaxSpeed: (index) => (SHOTS[index].nexmax.pose === 'walk' ? 3.2 : 0),
  }

  private applyShot(shot: Shot | null, rt: StageRuntime): void {
    const { camera, claw, hud, nexmax } = rt
    if (shot) {
      claw.reset()
      this.gateFlow.forceRelease()
      camera.position.copy(shot.cam)
      camera.lookAt(shot.target)
      camera.fov = shot.fov
      camera.updateProjectionMatrix()
      this.place(nexmax, shot.nexmax)
      // 大歯車を支えるショットでは、体ごと歯車の掴み位置へまっすぐ向ける（爪が正面から出る）
      if (shot.claw) nexmax.root.rotation.y = faceYaw(shot.nexmax.pos, this.edo.gate.gearGrabPoint)
      this.place(this.genbei, shot.genbei)
      this.place(this.oharu, shot.oharu)
      this.oharu.root.visible = true
      nexmax.setAim(shot.claw ? this.edo.gate.gearGrabPoint : null)
      claw.beam.setActive(shot.claw)
      this.edo.gate.setGearSpeed(shot.claw ? 0 : 0.25)
      hud.setShot(shot.label)
      hud.setPlayUiVisible(false)
      hud.setArms({ right: { name: PART_NAMES.grapple_claw, holding: shot.claw ? '支えている：大歯車' : null, selected: true, active: shot.claw }, left: { name: null, selected: false } })
      if (shot.claw) hud.setObjective('歯車を動かないように支えよう', '源兵衛が水門を調整中')
      hud.setGate(null)
    } else {
      camera.fov = 55
      camera.updateProjectionMatrix()
      const atGate = edoNpcPlace((n) => rt.story.get(n)) === 'gate'
      this.place(this.genbei, atGate ? GATE_GENBEI : SHOP_GENBEI)
      this.place(this.oharu, atGate ? GATE_OHARU : SHOP_OHARU)
      nexmax.setPose('idle')
      nexmax.setAim(null)
      claw.beam.setActive(false)
      hud.setShot(null)
      hud.setPlayUiVisible(true)
    }
  }

  debug(): Record<string, unknown> {
    const g = this.gateFlow
    return {
      gatePhase: g.logic.phase,
      gateProgress: +g.logic.progress.toFixed(2),
      danger: g.logic.isDanger(),
      lastResult: g.lastResult,
      boats: g.logic.boats.map((x) => +x.toFixed(1)),
      returnRing: this.ringOpen,
      busy: this.busy,
      oharu: this.oharuState,
      oharuPos: this.oharu.root.position.toArray().map((x) => +x.toFixed(2)),
      genbeiPos: this.genbei.root.position.toArray().map((x) => +x.toFixed(2)),
      doll: this.doll.mode,
      dusk: +this.dusk.toFixed(2),
      toGate: { ...this.toGate },
      rumors: this.mobs?.rumorsHeard ?? 0,
    }
  }

  dispose(): void {
    this.waterEnv?.dispose()
    this.waterEnv = null
    this.mobs?.dispose()
    this.mobs = null
    this.flash?.dispose()
    this.flash = null
    // 待っている演出は再開させない（解放したステージの続きが新しい時代で動かないように）
    this.walkers.length = 0
    this.timers.length = 0
    const w = window as unknown as { __edoDev?: unknown }
    if (w.__edoDev) delete w.__edoDev
  }
}
