// 物語 v7 の 7 章「江戸の時計師（1726年）」のステージ（ChronicleEdoStage）。docs/物語_v7_時を裂く爪.md・docs/ステージ設計_v1.md §4 7章。
// 舞台は chronicle/scene.ts（工房・路地とほこら・広場の時の鐘人形・夜と夜明けの空）。進み具合はフラグから（storyEdo7.ts）。
//   arrive   路地に着く → 茶運び人形が歩いてくる（J でつかんで止める）→ おはる → v7_met_oharu
//   workshop おはるについて工房へ → 書（青い刃のかけらの絵）→ 奥の木の箱へ近づくと、石とかけらが同じ音 → 源兵衛の話 → v7_fragment_seen
//   demo     作業台のそばで実演（切れ目の向こうに黒いもの）→ 表と裏・時を裂く → 爪を見る → 書に「時を裂く爪」→ v7_demo_seen
//   night    その夜：空のひび → 時の鐘人形にのりうつる → 広場でボス戦（右の肩・左のひざ・胸の歯車を J で 3 秒つかむ。
//            ふりおろしと鐘の衝撃波）→ 源兵衛「爪を使え！」→ 指先ほどの切れ目 → 影がはがれる → 夜明け → v7_doll_down
//   dawn     朝：時を裂く爪・針の目もり・ネクマックスの思いつき → からくりの箱を J で持ってほこらへ → 錠前・おはるの約束 → v7_claw_stored
//   leave    石が引っぱる → 光の輪（F）→ 2086年（return・v7_from_1726）
import * as THREE from 'three'
import { createMaterialLibrary } from '../../../render/materials'
import { EDO_SKY } from '../../../render/sky'
import { ERA_EDO, eraTintHex } from '../../../core/eras'
import { DialogueDB } from '../../../core/dialogue'
import type { ClawTargetDef, WireEvent } from '../../../player/clawLogic'
import type { MovableInput } from '../../../player/clawSystem'
import type { ActionFrame } from '../../../player/inputActions'
import type { Character } from '../../../world/characters'
import type { Hint } from '../../../ui/hud'
import type { MusicId } from '../../../audio/tracks'
import type { ObjectiveMark, SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageWorld } from '../../../game/stage'
import { SceneClock } from '../../../chronicle/kit/clock'
import { Walker } from '../../../chronicle/kit/walker'
import { Curtain } from '../../../chronicle/kit/curtain'
import { TeaDoll } from '../karakuri'
import { Townsfolk } from '../townsfolk'
import { buildChronicleEdo, type ChronicleEdoWorld } from './scene'
import { C, CHRONICLE_SPAWNS, ARRIVE_RING, RETURN_RING, WORKSHOP_SPOTS, YAW } from './layout'
import { EDO_LOOKS, type EdoSkyCycle } from './skyCycle'
import { KarakuriBox, shrineMaterialsFrom } from './shrine'
import { TimeClawProp, ResonanceWave } from './clawProp'
import { GEAR_NAMES, SWING_RADIUS, type DollImpact } from './bellDoll'
import { GearOrder, edoObjective, edoSpawn, edoStep, edoTime, type EdoStep, type EdoSub } from './storyEdo7'
import linesJson from './lines_v7.json'

const lines = new DialogueDB(linesJson)
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const dist2 = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z)

/** 茶運び人形の道（通りから路地を下りてくる） */
const DOLL_PATH = [v(-10.9, 0, 14.6), v(-10.8, 0, 17.5), v(-10.9, 0, 20.6)]
/** おはるが人形を追ってくる道 */
const OHARU_CHASE = [v(-10.9, 0, 13.4), v(-10.8, 0, 17.0)]
/** 工房の表の戸口の前・中・裏口 */
const DOOR_FRONT = v(-16.6, 0, 13.0)
const DOOR_IN = v(-16.6, 0.06, 15.4)
const BACK_DOOR = v(-14.25, 0, 21.6)
/** 書を読む所（見台の北）・作業台の前（実演を見る所） */
const BOOK_READ = v(-14.4, 0.06, 16.15)
const BENCH_FRONT = v(-16.6, 0.06, 16.0)
/** 実演のときの源兵衛（からくりのうでのそば） */
const GENBEI_ARM = v(-15.25, 0.06, 18.55)
/** 夜：おはるが見守る所（広場の北東のすみ）・ボス戦のやり直しの所 */
/** 広場でのおはるの立ち位置：裏口の東のわき（ネクマックスの肩ごしに人形を見る線に入らない） */
const OHARU_PLAZA = v(-13.7, 0.03, 24.5)
const PLAZA_ENTRY = v(-16.0, 0.03, 24.2)
/** からくりの箱（朝まで工房の床。クローで運ぶ） */
const BOX_HOME = v(-13.65, 0.06, 18.25)
const BOX_ID = 'v7_karakuri_box'
const TEA_ID = 'v7_tea_doll'
/** ボスの間合い */
const BOSS = { swingCd: 3.0, bellCd: 4.4, near: 7.5, far: 9.5, hurtKnock: 7 }

type Who = 'genbei' | 'oharu'

export class ChronicleEdoStage implements Stage {
  readonly key = '1726' as const
  readonly era = ERA_EDO
  readonly label = '1726年　大坂・仕掛け横丁'
  readonly subtitle = '享保11年 ― からくり時計の職人の町'
  /** 環境はいつも昼で読みこみ、begin で時間帯（夜・朝）に切りかえる（昼の環境マップを夜明けのあとも使うため） */
  readonly environment: StageEnvironment = {
    sky: EDO_SKY,
    sunDir: EDO_LOOKS.day.sunDir.clone(),
    hdri: './hdri/kloppenheim_06_puresky_1k.hdr',
    envIntensity: 0.75,
    fog: { color: EDO_SKY.haze, density: 0.0028 },
  }

  private w!: ChronicleEdoWorld
  private genbei!: Character
  private oharu!: Character
  private tea!: TeaDoll
  private folk!: Townsfolk
  private box!: KarakuriBox
  private boxMov!: MovableInput
  private teaDef!: ClawTargetDef
  private readonly clawProp = new TimeClawProp()
  private sky: EdoSkyCycle | null = null
  private readonly clock = new SceneClock()
  private readonly walker = new Walker()
  private curtain: Curtain | null = null
  private wave: ResonanceWave | null = null
  private rt: StageRuntime | null = null
  private from: string | null = null
  private step: EdoStep = 'arrive'
  private readonly sub: EdoSub = {}
  private busy = false
  /** 会う・話す相手の向き */
  private readonly look: Record<Who, THREE.Vector3 | null> = { genbei: null, oharu: null }
  private genbeiPose: 'crank' | 'idle' | 'wave' = 'crank'
  /** ボス戦 */
  private readonly gears = new GearOrder(3)
  private bossCd = 2.5
  private attacks = 0
  private waveHit = false
  private warnedSwing = 0
  private warnedBell = 0
  /** 夜明けの空（-1 は動かしていない） */
  private dawnAnim = -1
  private ringOpen = false
  private clawOnHand = false
  private stepT = 0
  /** カメラのうでの長さ（シェルの既定。工房の中で縮めたら、外で戻す） */
  private camDist0 = 0
  private camShort = false
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly marks: ObjectiveMark[] = []
  /** 人形の足もと（K の当たり：毎フレーム動かす） */
  private readonly dollBody = new THREE.Vector3()
  private readonly markAt = new THREE.Vector3()

  // ================================================================ 読みこみ

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    this.from = ctx.from
    this.step = edoStep((n) => ctx.story.get(n))
    const chars = Promise.all([ctx.loadNpc('genbei', 1.6), ctx.loadNpc('oharu', 1.32)])
    ctx.progress(0.1, 'テクスチャを生成中…')
    await ctx.yieldFrame()
    const mats = await createMaterialLibrary(Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()))
    ctx.progress(0.4, '仕掛け横丁を組み立て中…')
    await ctx.yieldFrame()
    this.w = await buildChronicleEdo(mats, ctx.quality)
    ctx.progress(0.65, 'からくりを組み立て中…')
    await ctx.yieldFrame()
    // 茶運び人形（J でつかむと止まる）
    this.tea = new TeaDoll()
    this.tea.root.visible = false
    this.teaDef = { id: TEA_ID, type: 'hold_mechanism', label: '茶運び人形', point: new THREE.Vector3(), radius: 0.3, enabled: false, noLineOfSight: true, range: 12 }
    // からくりの箱（朝、ほこらへ運ぶ。クローの「引き寄せる物」）
    this.box = new KarakuriBox(shrineMaterialsFrom(mats))
    this.box.root.position.copy(BOX_HOME)
    this.box.root.rotation.y = 0.4
    const boxDef: ClawTargetDef = { id: BOX_ID, type: 'pull_object', label: 'からくりの箱', point: BOX_HOME.clone().setY(BOX_HOME.y + KarakuriBox.HALF.y), radius: 0.3, enabled: false }
    this.boxMov = { def: boxDef, object: this.box.root, half: KarakuriBox.HALF.clone(), home: BOX_HOME.clone() }
    this.folk = new Townsfolk()
    this.w.root.add(this.tea.root, this.box.root, this.clawProp.root, this.folk.group)
    this.clawProp.root.visible = false
    ctx.progress(0.75, 'キャラクターを読み込み中…')
    const [genbei, oharu] = await chars
    this.genbei = genbei
    this.oharu = oharu
    this.w.root.add(genbei.root, oharu.root)
    return {
      root: this.w.root,
      colliders: this.w.colliders,
      claw: { targets: [...this.w.claw.targets, this.teaDef, boxDef], movables: [...this.w.claw.movables, this.boxMov] },
      lights: this.w.lights,
    }
  }

  spawn(id: string | null): SpawnPoint {
    const sp = CHRONICLE_SPAWNS[id ?? ''] ?? CHRONICLE_SPAWNS[edoSpawn(this.step)]
    return { pos: sp.pos.clone(), facing: sp.facing, camYaw: sp.camYaw, camPitch: sp.camPitch }
  }

  begin(rt: StageRuntime): void {
    this.rt = rt
    this.camDist0 = rt.camRig.distance
    this.curtain = new Curtain(rt.renderer.domElement.ownerDocument.getElementById('ui') ?? document.body)
    this.wave = new ResonanceWave(rt.renderer.domElement.ownerDocument.getElementById('ui') ?? document.body)
    this.sky = this.w.createSky({ renderer: rt.renderer, scene: rt.scene, sky: rt.sky, sun: rt.sun, post: rt.post })
    this.sky.prepare()
    this.w.doll.onImpact = (e) => this.onDollImpact(e)
    this.w.doll.onStep = (p) => {
      const d = dist2(p, rt.player.position)
      if (d < 22) rt.shake(Math.max(0.05, 0.35 - d * 0.014))
    }
    rt.combat.onRespawn = () => this.onCombatRespawn()
    this.setupStep(this.step)
    rt.save(edoSpawn(this.step))
    if (rt.params.has('debug')) {
      ;(window as unknown as { __edo7Dev?: unknown }).__edo7Dev = { stage: this, rt, w: this.w, tp: (x: number, z: number, y = 0) => rt.player.teleport(new THREE.Vector3(x, y, z)) }
    }
  }

  revealed(rt: StageRuntime): void {
    switch (this.step) {
      case 'arrive':
        void this.runArrival(rt)
        break
      case 'demo':
        rt.say('源兵衛', lines.lines('genbei_demo_wait')[0].text, 3)
        break
      case 'night':
        void this.runNight(rt)
        break
      case 'dawn':
        void this.runMorning(rt)
        break
      case 'leave':
        void rt.dialogue(lines.lines('pull'))
        break
    }
  }

  // ================================================================ 段階ごとの配置（場面なし）

  private f = (n: string) => this.rt?.story.get(n) ?? false

  private setupStep(step: EdoStep): void {
    const w = this.w
    this.step = step
    this.stepT = 0
    const time = edoTime(step)
    this.sky?.set(time === 'night' ? 'night' : time === 'morning' ? 'morning' : 'day')
    w.kagaribi.setLit(time === 'night', true)
    this.folk.group.visible = time !== 'night'
    // 時の鐘人形
    const d = w.doll
    if (step === 'dawn' || step === 'leave') d.setDownInstant()
    for (const t of d.targets) t.enabled = false
    // 本：実演のあとは 2 ページ目が描いてある
    w.workshop.book.setClawPage(this.f('v7_demo_seen') ? 1 : 0)
    w.workshop.box.setLid(0.85, true)
    w.workshop.box.setShardVisible(!this.f('v7_demo_seen') || step === 'night' ? true : false)
    // 源兵衛とおはる
    this.place('genbei', WORKSHOP_SPOTS.genbei, v(-16.4, 0, 17.6), 'crank')
    this.place('oharu', WORKSHOP_SPOTS.oharu, v(-16.6, 0, 16), 'idle')
    this.oharu.root.visible = true
    this.tea.root.visible = false
    this.teaDef.enabled = false
    this.boxMov.def.enabled = false
    this.box.root.visible = step !== 'leave'
    w.shrine.placeBox(step === 'leave')
    w.shrine.setMorningLight(time === 'morning' ? 1 : 0, true)
    switch (step) {
      case 'arrive':
        this.oharu.root.visible = false
        break
      case 'workshop':
        // おはるは工房の戸口の前で待っている
        this.place('oharu', DOOR_FRONT.clone().add(v(0.9, 0, -0.3)), DOOR_FRONT, 'wave')
        break
      case 'demo':
        this.place('genbei', GENBEI_ARM, BENCH_FRONT, 'idle')
        break
      case 'night':
        // 'before'（広場へ行ける）は、夜の場面（空のひび・のりうつり）が終わってから
        this.sub.boss = undefined
        this.gears.next = 0
        this.gears.release()
        this.place('oharu', v(-14.2, 0.06, 18.9), v(-16.4, 0, 17.6), 'idle')
        break
      case 'dawn':
        this.place('genbei', GENBEI_ARM, BENCH_FRONT, 'idle')
        this.clawProp.root.visible = true
        this.clawProp.root.position.set(-16.2, 0.9, 17.35)
        this.clawProp.root.rotation.set(-Math.PI / 2, 0, 0)
        this.clawProp.setCharge(0.02, true)
        break
      case 'leave':
        this.place('genbei', v(-8.4, 0, 24.4), RETURN_RING, 'wave')
        this.place('oharu', v(-7.9, 0, 28.3), RETURN_RING, 'wave')
        this.openRing(false)
        break
    }
  }

  private ch(who: Who): Character {
    return who === 'genbei' ? this.genbei : this.oharu
  }

  private place(who: Who, pos: THREE.Vector3, face: THREE.Vector3, pose: 'crank' | 'idle' | 'wave' | 'walk' | 'run' = 'idle'): void {
    const c = this.ch(who)
    this.walker.stop(c)
    c.root.position.copy(pos)
    c.root.rotation.y = Math.atan2(-(face.x - pos.x), -(face.z - pos.z))
    c.setPose(pose)
    if (who === 'genbei') this.genbeiPose = pose === 'crank' ? 'crank' : pose === 'wave' ? 'wave' : 'idle'
  }

  private walk(who: Who, path: THREE.Vector3[], speed: number, face: THREE.Vector3 | null = null): Promise<void> {
    const c = this.ch(who)
    c.setPose('walk')
    return this.walker.walkTo(c, path, speed, face).then(() => c.setPose('idle'))
  }

  private lock(rt: StageRuntime, on: boolean): void {
    this.busy = on
    rt.setControlLocked(on)
  }

  // ================================================================ arrive：到着・茶運び人形・おはる

  private async runArrival(rt: StageRuntime): Promise<void> {
    if (this.from === '2026') {
      rt.rift.openAt(ARRIVE_RING, eraTintHex(1726), 1.7, 1.6)
      void this.clock.wait(2.2).then(() => rt.rift.close(0.8))
    }
    rt.oreGlow(1.2)
    await rt.dialogue(lines.lines('arrive'))
    if (this.step !== 'arrive' || this.sub.dollCaught) return
    // 茶運び人形が通りから路地を下りてくる
    this.tea.root.visible = true
    this.tea.walkPath(DOLL_PATH, 0.55)
    this.teaDef.enabled = true
    this.oharu.root.visible = true
    this.place('oharu', OHARU_CHASE[0], DOLL_PATH[1], 'run')
    void this.walk('oharu', [OHARU_CHASE[1]], 0.7, DOLL_PATH[2])
    // 路地を下りてくる人形を、ネクマックスの右うしろから見る（ほこらの石灯籠より手前に置く）
    const p = rt.player.position
    const from = v(Math.min(-9.75, Math.max(-11.9, p.x + 1.1)), 1.95, Math.min(24.3, p.z + 1.9))
    void rt.cinematic({ look: this.tea.position, from, hold: 3.2, inSec: 1.0, outSec: 1.0, fov: 44 })
    await rt.dialogue(lines.lines('doll_comes'))
  }

  /** 人形を止めた（J でつかんだ・ぜんまいが切れて止まった）→ おはると会う */
  private async runMeet(rt: StageRuntime): Promise<void> {
    if (this.busy || this.sub.dollCaught) return
    this.sub.dollCaught = true
    this.teaDef.enabled = false
    this.tea.mode = 'stop'
    this.lock(rt, true)
    await this.clock.wait(0.5)
    rt.claw.reset()
    // おはるが駆けよって人形を抱える
    const p = rt.player.position
    const toward = this.tmp.set(this.tea.position.x + 0.5, 0, this.tea.position.z - 0.4)
    await this.walk('oharu', [toward.clone()], 2.6, p)
    this.tea.carry()
    this.look.oharu = p
    rt.player.turnToward(this.oharu.root.position.x - p.x, this.oharu.root.position.z - p.z, 1, 1)
    const o = this.oharu.root.position
    const mid = v((p.x + o.x) / 2, 0.95, (p.z + o.z) / 2)
    // 路地はせまいので横からは撮れない。ネクマックスの頭ごしに、こちらを向いたおはるの顔を見る
    const ax = o.x - p.x
    const az = o.z - p.z
    const al = Math.max(0.01, Math.hypot(ax, az))
    const dx = ax / al
    const dz = az / al
    // 横へのずらしは路地のまんなか（x = -10.9）の側へ
    const sd = (p.x > -10.6 ? -1 : 1) * Math.sign(-dz || 1)
    const sx = -dz * sd
    const sz = dx * sd
    const meetFrom = v(p.x - dx * 2.1 + sx * 0.55, 1.68, p.z - dz * 2.1 + sz * 0.55)
    const meetTo = v(p.x - dx * 1.85 + sx * 0.5, 1.62, p.z - dz * 1.85 + sz * 0.5)
    void rt.cinematic({ look: mid, from: meetFrom, fromTo: meetTo, hold: Infinity, inSec: 1.2, panSec: 10, fov: 42 })
    await rt.dialogue(lines.lines('oharu_meet'))
    rt.endCinematic()
    rt.story.set('v7_met_oharu', true)
    this.setupStepKeepPlaces('workshop')
    rt.save(edoSpawn('workshop'))
    this.lock(rt, false)
    // おはるが工房へ案内する（路地を上って、表の戸口の前で待つ）
    rt.say('おはる', lines.lines('oharu_lead')[0].text, 3.2)
    await this.walk('oharu', [v(-10.9, 0, 15.0), v(-12.6, 0, 12.6), DOOR_FRONT.clone().add(v(0.9, 0, -0.3))], 1.9, rt.player.position)
    this.look.oharu = rt.player.position
  }

  /** 段階を進めるが、人物の位置はそのまま（場面のつづき） */
  private setupStepKeepPlaces(step: EdoStep): void {
    this.step = step
    this.stepT = 0
  }

  // ================================================================ workshop：工房・書・かけら・源兵衛の話

  private async runEnterWorkshop(rt: StageRuntime): Promise<void> {
    if (this.busy || this.sub.inWorkshop) return
    this.sub.inWorkshop = true
    // おはるも中へ
    void this.walk('oharu', [DOOR_IN.clone().add(v(0.8, 0, 0.2)), WORKSHOP_SPOTS.oharu], 2.0, v(-16.4, 0, 18.6))
    this.place('genbei', WORKSHOP_SPOTS.genbei, rt.player.position, 'idle')
    this.look.genbei = rt.player.position
    // 戸口の内側の東から：作業台の源兵衛と、入ってきたネクマックス・おはるを一画面に
    const p = rt.player.position
    const g = this.genbei.root.position
    void rt.cinematic({ look: v((p.x + g.x) / 2, 1.05, (p.z + g.z) / 2), from: v(-13.9, 1.85, 15.0), hold: Infinity, inSec: 1.0, fov: 50, arc: 0 })
    await rt.dialogue(lines.lines('workshop_enter'))
    rt.endCinematic()
    this.look.genbei = null
    this.genbeiPose = 'crank'
  }

  private async runBook(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.lock(rt, true)
    const book = this.w.workshop.book
    void rt.cinematic({ look: book.pageCenter, from: book.pageCenter.clone().addScaledVector(book.pageNormal, 0.75).add(v(0, 0.05, 0)), hold: Infinity, inSec: 1.2, fov: 40, arc: 0 })
    await rt.dialogue(lines.lines('book_seen'))
    rt.endCinematic()
    this.sub.bookSeen = true
    this.lock(rt, false)
  }

  /** 奥の木の箱へ近づいた：石とかけらが同じ音 → 源兵衛の話 */
  private async runFragment(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.lock(rt, true)
    this.sub.bookSeen = true
    const box = this.w.workshop.box
    box.setResonance(1)
    rt.oreGlow(2)
    const at = box.shardWorld
    void rt.cinematic({ look: at.clone().add(v(0, 0.05, 0)), from: v(at.x + 0.9, at.y + 0.35, at.z - 1.3), hold: Infinity, inSec: 1.4, fov: 38, arc: 0, marker: { pos: at.clone().add(v(0, 0.2, 0)), label: '青い刃のかけら', color: '#8fd0ff' } })
    this.wave?.set(1)
    // 源兵衛がふりむいて、近づく
    this.look.genbei = rt.player.position
    void this.walk('genbei', [v(-15.6, 0.06, 19.9)], 1.4, at)
    await rt.dialogue(lines.lines('box_rings'))
    rt.endCinematic()
    const g = this.genbei.root.position
    const p = rt.player.position
    rt.player.turnToward(g.x - p.x, g.z - p.z, 1, 1)
    const mid = v((g.x + p.x) / 2, 1.0, (g.z + p.z) / 2)
    void rt.cinematic({ look: mid, from: v(mid.x + 2.6, 1.5, mid.z - 1.6), hold: Infinity, inSec: 1.3, panSec: 20, fov: 44 })
    await rt.dialogue(lines.lines('genbei_story'))
    rt.endCinematic()
    this.wave?.set(null)
    box.setResonance(0.25)
    rt.story.set('v7_fragment_seen', true)
    this.setupStepKeepPlaces('demo')
    rt.save(edoSpawn('demo'))
    this.lock(rt, false)
    // 源兵衛は作業台のうでのそばへ
    void this.walk('genbei', [GENBEI_ARM], 1.4, BENCH_FRONT)
  }

  // ================================================================ demo：実演・表と裏・爪・書の絵

  private async runDemo(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.lock(rt, true)
    const ws = this.w.workshop
    this.place('genbei', GENBEI_ARM, ws.arm.slitCenter(), 'crank')
    // 箱のかけらをうでに持たせる
    ws.box.setShardVisible(false)
    ws.arm.holdShard(true)
    const p = rt.player.position
    const sc = ws.arm.slitCenter()
    rt.player.turnToward(sc.x - p.x, sc.z - p.z, 1, 1)
    void rt.cinematic({ look: v(-16.0, 1.05, 17.5), from: v(-14.4, 1.55, 15.4), hold: Infinity, inSec: 1.3, fov: 46 })
    const demo = ws.arm.demoSlit()
    await rt.dialogue(lines.lines('demo_tune'))
    // 切れ目がひらく瞬間へ寄る
    await this.clock.until(() => ws.arm.phase === 'look' || ws.arm.phase === 'rest', 8)
    rt.shake(0.25)
    rt.oreGlow(1.6)
    void rt.cinematic({ look: sc, from: v(sc.x + 1.5, sc.y + 0.2, sc.z - 1.6), hold: Infinity, inSec: 0.6, fov: 40, arc: 0 })
    await rt.dialogue(lines.lines('demo_slit'))
    await demo
    ws.arm.holdShard(false)
    ws.box.setShardVisible(true)
    this.genbei.setPose('idle')
    this.look.genbei = rt.player.position
    const g = this.genbei.root.position
    const mid = v((g.x + rt.player.position.x) / 2, 1.0, (g.z + rt.player.position.z) / 2)
    void rt.cinematic({ look: mid, from: v(mid.x + 1.4, 1.55, mid.z - 2.6), hold: Infinity, inSec: 1.2, panSec: 24, fov: 44 })
    await rt.dialogue(lines.lines('demo_explain'))
    // 爪を見る（源兵衛がネクマックスのクローをのぞきこむ）
    void this.walk('genbei', [this.tmp.copy(rt.player.position).add(v(0.75, 0, 0.55)).clone()], 1.2, rt.player.position)
    await rt.dialogue(lines.lines('claw_look'))
    // 書の 2 ページ目に「時を裂く爪」を描く
    await this.walk('genbei', [v(-13.6, 0.06, 16.9)], 1.6, this.w.workshop.book.pageCenter)
    this.genbei.setPose('crank')
    const book = ws.book
    void rt.cinematic({ look: book.pageCenter, from: book.pageCenter.clone().addScaledVector(book.pageNormal, 0.8).add(v(0.15, 0.08, 0)), hold: Infinity, inSec: 1.2, fov: 40, arc: 0 })
    const drawn = book.drawClawPage(6)
    await rt.dialogue(lines.lines('page_draw').slice(0, 2))
    await drawn
    await rt.dialogue(lines.lines('page_draw').slice(2))
    rt.endCinematic()
    rt.story.set('v7_demo_seen', true)
    rt.save(edoSpawn('night'))
    // その夜へ
    await this.curtain?.set(true, 1.0)
    this.setupStep('night')
    rt.player.teleport(CHRONICLE_SPAWNS.v7_workshop.pos, CHRONICLE_SPAWNS.v7_workshop.facing)
    this.lock(rt, false)
    await this.runNight(rt)
  }

  // ================================================================ night：空のひび・のりうつり・ボス戦

  private async runNight(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.lock(rt, true)
    const d = this.w.doll
    // 人形は台座の上に戻しておく（やり直し・セーブから）
    this.genbeiPose = 'crank'
    this.place('genbei', v(-16.3, 0.06, 18.75), v(-16.3, 0, 17.6), 'crank')
    rt.hud.toast('その夜……', 2.6)
    await this.curtain?.set(false, 1.0)
    await rt.dialogue(lines.lines('night_work'))
    // ゴゴゴ……空にひび
    rt.shake(0.4)
    const crackAt = v(C.DOLL.x + 1.5, 15, C.DOLL.z - 2)
    const crack = rt.chrono.slit(crackAt, { width: 1.6, height: 9, tone: 'ura' })
    crack.setOpen(1)
    void rt.cinematic({ look: crackAt, from: v(-17.5, 2.2, 24.4), lookTo: d.headWorld(), hold: Infinity, inSec: 1.6, panSec: 4.5, fov: 50 })
    this.look.oharu = crackAt
    await rt.dialogue(lines.lines('sky_crack'))
    // 影がのりうつる → 大きくなって、台座から降りる
    d.setPossessed(true)
    rt.shake(0.5)
    rt.oreGlow(1.5)
    void rt.cinematic({ look: d.headWorld(), from: v(-21.0, 1.6, 27.0), hold: Infinity, inSec: 0.8, fov: 52 })
    await this.clock.wait(2.8)
    crack.setOpen(0.3)
    await d.stepDown()
    rt.shake(0.8)
    d.faceTo(BACK_DOOR)
    await rt.dialogue(lines.lines('possessed'))
    rt.endCinematic()
    crack.close()
    this.look.oharu = null
    this.sub.boss = 'before'
    this.lock(rt, false)
    // おはるは裏口から広場の北東のすみへ
    void this.walk('oharu', [v(-14.3, 0.06, 20.6), v(-14.25, 0, 21.9), OHARU_PLAZA], 2.6, d.position)
  }

  private async runBossIntro(rt: StageRuntime): Promise<void> {
    if (this.busy || this.sub.boss !== 'before') return
    this.lock(rt, true)
    const d = this.w.doll
    this.walker.stop(this.oharu)
    this.place('oharu', OHARU_PLAZA, d.position, 'wave')
    d.faceTo(rt.player.position)
    void rt.cinematic({ look: d.headWorld().add(v(0, -1.6, 0)), from: v(-17.2, 1.4, 25.6), hold: Infinity, inSec: 1.2, fov: 54, marker: { pos: d.gearWorld(0), label: '右の肩の歯車', color: '#ffd447' } })
    d.setGearHighlight(0)
    await rt.dialogue(lines.lines('boss_intro'))
    rt.endCinematic()
    // 戻ったカメラは、ネクマックスの肩ごしに人形を正面に見る（広場の入口の向きのままだと、人形が画面のはしに切れる）
    {
      const p = rt.player.position
      const dp = d.position
      rt.player.turnToward(dp.x - p.x, dp.z - p.z, 1, 1)
      rt.camRig.turnTo(Math.atan2(p.x - dp.x, p.z - dp.z), 0.22)
    }
    // 戦いのはじまり
    this.sub.boss = 'fight'
    this.sub.nextGear = this.gears.next
    rt.combat.enabled = true
    rt.combat.setCheckpoint(PLAZA_ENTRY, YAW.south)
    rt.combat.showBossBar('時の鐘人形', 1 - this.gears.next / 3)
    // K でたたいても効かない（歯車をつかむ戦い）：おはるが教える
    let lastHint = -99
    rt.combat.addHitTarget({
      id: 'v7_bell_doll_body',
      pos: this.dollBody,
      radius: 1.8,
      enabled: true,
      onHit: () => {
        rt.shake(0.1)
        if (rt.playTime - lastHint > 8) {
          lastHint = rt.playTime
          rt.say('おはる', lines.lines('hit_body')[0].text, 2.6)
        }
      },
    })
    for (let i = 0; i < 3; i++) d.targets[i].enabled = !d.gearIsStopped(i)
    d.setGearHighlight(this.gears.next)
    this.bossCd = 2.2
    rt.save('v7_plaza')
    rt.say('おはる', lines.lines(`call_${this.gears.next}`)[0].text, 3.4)
    this.lock(rt, false)
  }

  /** ボスの頭（毎フレーム）：近づく・向く・攻撃を選ぶ・つかまれている間はあばれる */
  private bossUpdate(dt: number, rt: StageRuntime): void {
    const d = this.w.doll
    const p = rt.player.position
    // 体に入りこんだら押し出す
    const out = d.pushOut(p, 0.35, this.tmp)
    if (out && !rt.player.isExternal) rt.player.burstMove((out.x - p.x) * 8, (out.z - p.z) * 8, 0.1)
    // 衝撃波
    const wf = d.waveFront
    if (wf.active) {
      if (!this.waveHit && d.waveHits(p, rt.player.grounded, p.y)) {
        this.waveHit = true
        this.hurt(rt, 1, wf.center, 6)
      }
    } else this.waveHit = false
    // 保持：3 秒で止まる。その間は攻撃しない
    if (this.gears.holding >= 0) {
      const i = this.gears.holding
      d.setGearStrain(i, 0.25 + this.gears.progress * 0.75)
      rt.combat.setBossBar(1 - (this.gears.next + this.gears.progress) / 3)
      if (Math.random() < dt * 3) rt.shake(0.08 + this.gears.progress * 0.12)
      const stopped = this.gears.tick(dt)
      if (stopped >= 0) this.onGearStopped(rt, stopped)
      return
    }
    if (rt.talking && this.busy) return
    this.bossCd -= dt
    if (!d.ready) return
    const dd = dist2(d.position, p)
    d.faceTo(p)
    if (this.bossCd > 0) {
      // 遠ければ歩いて近づく（ひざが止まると歩けない）
      if (dd > 6.5 && !d.gearIsStopped(1)) d.walkTo(this.tmp2.copy(p).lerp(d.position, 4.5 / Math.max(dd, 4.6)), 1.6)
      else d.stopWalking()
      return
    }
    this.attacks++
    if (dd > BOSS.far || this.attacks % 3 === 0) {
      d.bellWave()
      this.bossCd = BOSS.bellCd / d.rage
      if (rt.playTime - this.warnedBell > 14) {
        this.warnedBell = rt.playTime
        rt.say('おはる', lines.lines('warn_bell')[0].text, 2.4)
      }
    } else if (dd < BOSS.near) {
      // 体の右と左、どちらにいるか
      const yaw = d.yaw
      const rx = Math.cos(yaw)
      const rz = -Math.sin(yaw)
      const side = (p.x - d.position.x) * rx + (p.z - d.position.z) * rz > 0 ? 'right' : 'left'
      // ふりおろす所：プレイヤーの足元（体から 2.5〜4.5m にとどめる）
      const at = this.tmp2.copy(p)
      const k = Math.max(2.5, Math.min(4.5, dd)) / Math.max(dd, 0.01)
      at.set(d.position.x + (p.x - d.position.x) * k, 0.03, d.position.z + (p.z - d.position.z) * k)
      if (d.swing(side, at) > 0) {
        this.bossCd = BOSS.swingCd / d.rage
        if (rt.playTime - this.warnedSwing > 16) {
          this.warnedSwing = rt.playTime
          rt.say('おはる', lines.lines('warn_swing')[0].text, 2.2)
        }
      }
    } else {
      this.bossCd = 0.6
      if (!d.gearIsStopped(1)) d.walkTo(this.tmp2.copy(p).lerp(d.position, 0.5), 1.8)
    }
  }

  private onDollImpact(e: DollImpact): void {
    const rt = this.rt
    if (!rt) return
    rt.shake(e.kind === 'bell' ? 0.45 : 0.6)
    if (e.kind === 'swing' && this.sub.boss === 'fight') {
      const p = rt.player.position
      if (dist2(p, e.pos) < SWING_RADIUS + 0.35 && p.y < e.pos.y + 1.2) this.hurt(rt, 1, e.pos, BOSS.hurtKnock)
    }
  }

  /** プレイヤーに当たった（体力 1）。歯車をつかんでいたら、ふりほどかれる */
  private hurt(rt: StageRuntime, dmg: number, from: THREE.Vector3, knock: number): void {
    const dir = this.tmp.copy(rt.player.position).sub(from).setY(0)
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1)
    dir.normalize()
    if (this.gears.holding >= 0) {
      this.w.doll.setGearStrain(this.gears.holding, 0)
      this.gears.release()
      rt.claw.reset()
      rt.say('おはる', lines.lines('shaken')[0].text, 2.2)
    }
    // 戦闘の体力（シェルの hurtPlayer：無敵時間・回避・体力 0 の暗転までまとめて）
    const c = rt.combat as unknown as { hurtPlayer?: (damage: number, d: THREE.Vector3, k: number) => void }
    if (typeof c.hurtPlayer === 'function') c.hurtPlayer(dmg, dir, knock)
    else {
      rt.combat.health.damage(dmg)
      rt.hud.flash('danger')
      rt.player.burstMove(dir.x * knock, dir.z * knock, 0.18)
    }
  }

  private onGearStopped(rt: StageRuntime, i: number): void {
    const d = this.w.doll
    d.setGearStopped(i)
    d.setGearStrain(i, 0)
    d.targets[i].enabled = false
    rt.claw.reset()
    rt.shake(0.5)
    rt.hud.banner(`${GEAR_NAMES[i]}の歯車が止まった！`, 'success', 1.8)
    rt.combat.setBossBar(1 - this.gears.next / 3)
    this.sub.nextGear = this.gears.next
    this.bossCd = Math.max(this.bossCd, 2.2)
    if (this.gears.done) {
      d.setGearHighlight(null)
      void this.runChestDone(rt)
      return
    }
    d.setGearHighlight(this.gears.next)
    void rt.dialogue([...lines.lines(`stopped_${i}`), ...lines.lines(`call_${this.gears.next}`)])
  }

  /** 胸が止まった → 源兵衛「爪を使え！」 */
  private async runChestDone(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    const d = this.w.doll
    rt.combat.showBossBar(null)
    rt.combat.removeHitTarget('v7_bell_doll_body')
    rt.combat.enabled = false
    d.stopWalking()
    for (const t of d.targets) t.enabled = false
    // 源兵衛が裏口から駆けてくる（手に爪）
    this.place('genbei', BACK_DOOR.clone().add(v(0, 0.03, 0.6)), d.position, 'run')
    void this.walk('genbei', [v(-17.6, 0.03, 26.6)], 3.0, d.position)
    void rt.cinematic({ look: v(-17.6, 1.2, 26.6), from: v(-21.0, 1.6, 30.5), hold: Infinity, inSec: 1.0, fov: 46 })
    await rt.dialogue(lines.lines('chest_done'))
    rt.endCinematic()
    this.clawOnHand = true
    this.clawProp.root.visible = true
    this.clawProp.setGlow(0.3)
    this.sub.boss = 'claw'
    this.lock(rt, false)
  }

  /** 力のない爪で、胸の影を裂く（指先ほど）→ 影がはがれる → 夜明け */
  private async runTinySlit(rt: StageRuntime): Promise<void> {
    if (this.busy || this.sub.boss !== 'claw') return
    this.lock(rt, true)
    const d = this.w.doll
    const chest = d.gearWorld(2)
    const p = rt.player.position
    rt.player.turnToward(chest.x - p.x, chest.z - p.z, 1, 1)
    void rt.cinematic({ look: chest, from: v(p.x + 1.4, 1.7, p.z - 1.2), hold: Infinity, inSec: 0.9, fov: 44 })
    await this.clock.wait(0.8)
    this.clawProp.setGlow(1)
    const at = chest.clone().lerp(p.clone().setY(chest.y), 0.12)
    const s = rt.chrono.slit(at, { width: 0.06, height: 0.3, seconds: 2.4, tone: 'dawn' })
    s.setOpen(1)
    rt.shake(0.3)
    await rt.dialogue(lines.lines('tiny_slit'))
    this.clawProp.setGlow(0)
    this.sub.boss = 'over'
    const down = d.collapse()
    void rt.cinematic({ look: d.headWorld().add(v(0, -2, 0)), from: v(-20.5, 2.0, 28.6), hold: Infinity, inSec: 1.2, fov: 54 })
    await down
    // 夜明け：東の空が明るくなる
    this.dawnAnim = 0
    this.w.kagaribi.setLit(false)
    // 東の空（蔵と塀の上から、城の向こうの空）→ 朝の光の中の人形
    void rt.cinematic({ look: v(14, 7, 28), from: v(-17.0, 7.2, 29.0), hold: Infinity, inSec: 2.0, fov: 56 })
    await this.clock.wait(2.5)
    const D = lines.lines('dawn_comes')
    await rt.dialogue(D.slice(0, 1))
    void rt.cinematic({ look: d.headWorld().add(v(0, -2.2, 0)), from: v(-19.6, 2.4, 28.6), hold: Infinity, inSec: 1.6, fov: 52 })
    await rt.dialogue(D.slice(1))
    await this.clock.until(() => this.dawnAnim < 0 || this.dawnAnim >= 0.7, 10)
    rt.endCinematic()
    rt.story.set('v7_doll_down', true)
    rt.save(edoSpawn('dawn'))
    this.clawOnHand = false
    // 朝：工房へ
    await this.curtain?.set(true, 1.0)
    this.dawnAnim = -1
    this.setupStep('dawn')
    rt.player.teleport(CHRONICLE_SPAWNS.v7_workshop.pos, CHRONICLE_SPAWNS.v7_workshop.facing)
    this.lock(rt, false)
    await this.runMorning(rt)
  }

  private onCombatRespawn(): void {
    const rt = this.rt
    if (!rt || this.step !== 'night') return
    this.gears.release()
    rt.claw.reset()
    if (this.sub.boss === 'fight') {
      this.w.doll.resetFight()
      this.bossCd = 3
    }
  }

  // ================================================================ dawn：時を裂く爪・針の目もり・思いつき・箱をほこらへ

  private async runMorning(rt: StageRuntime): Promise<void> {
    this.lock(rt, true)
    await this.curtain?.set(false, 1.0)
    rt.hud.toast('朝', 2.0)
    const g = this.genbei.root.position
    const p = rt.player.position
    this.look.genbei = p
    rt.player.turnToward(g.x - p.x, g.z - p.z, 1, 1)
    const mid = v((g.x + p.x) / 2, 1.0, (g.z + p.z) / 2)
    void rt.cinematic({ look: mid, from: v(mid.x + 2.2, 1.5, mid.z - 1.8), hold: Infinity, inSec: 1.2, panSec: 20, fov: 44 })
    await rt.dialogue(lines.lines('morning_claw').slice(0, 2))
    // 爪をクローの先に
    this.clawOnHand = true
    this.clawProp.setCharge(0.02, true)
    rt.oreGlow(1)
    await rt.dialogue(lines.lines('morning_claw').slice(2, 3))
    const tipAt = this.tmp.copy(p).add(v(-Math.sin(rt.player.facing) * 0.9, 0.8, -Math.cos(rt.player.facing) * 0.9)).clone()
    rt.chrono.slit(tipAt, { width: 0.05, height: 0.22, seconds: 1.4, tone: 'dawn' }).setOpen(1)
    await rt.dialogue(lines.lines('morning_claw').slice(3))
    // 針の目もり（朝日で、ほんの少し動く）
    const hand = this.handWorld(rt, this.tmp2)
    void rt.cinematic({ look: hand, from: hand.clone().add(v(0.55, 0.25, -0.55)), hold: Infinity, inSec: 1.0, fov: 36, arc: 0 })
    const L = lines.lines('needle')
    await rt.dialogue(L.slice(0, 1))
    this.clawProp.setCharge(0.07)
    this.clawProp.setGlow(0.4)
    await rt.dialogue(L.slice(1))
    this.clawProp.setGlow(0)
    void rt.cinematic({ look: mid, from: v(mid.x - 1.8, 1.45, mid.z - 2.2), hold: Infinity, inSec: 1.0, panSec: 20, fov: 44 })
    await rt.dialogue(lines.lines('idea'))
    // 爪を箱にしまう
    this.clawOnHand = false
    this.box.contents.add(this.clawProp.root)
    this.clawProp.root.position.set(0, 0.04, 0)
    this.clawProp.root.rotation.set(-Math.PI / 2, 0, 0)
    this.clawProp.root.scale.setScalar(1)
    this.box.setOpen(1)
    void rt.cinematic({ look: this.box.root.position.clone().add(v(0, 0.3, 0)), from: this.box.root.position.clone().add(v(-1.0, 1.0, -1.1)), hold: Infinity, inSec: 1.0, fov: 44 })
    await rt.dialogue(lines.lines('box_plan'))
    this.box.setOpen(0)
    rt.endCinematic()
    this.look.genbei = null
    this.sub.boxReady = true
    this.boxMov.def.enabled = true
    rt.save(edoSpawn('dawn'))
    this.lock(rt, false)
  }

  /** 箱をほこらに置く → 錠前・おはるの約束 → 石が引っぱる → 光の輪 */
  private async runStore(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.lock(rt, true)
    const sh = this.w.shrine
    // 運んでいた箱を、ほこらの中の箱に置きかえる
    this.box.root.visible = false
    this.boxMov.def.enabled = false
    rt.claw.reset()
    this.sub.carryBox = false
    sh.setDoors(1)
    // 人物は左右へひらく（背中で箱と錠前を隠さない）。カメラは正面のやや上から、まんなかに箱と錠前
    const front = sh.frontWorld(1.6)
    this.place('genbei', front.clone().add(v(0.3, 0, -1.8)), sh.boxWorld(), 'idle')
    this.place('oharu', front.clone().add(v(0.4, 0, 1.8)), sh.boxWorld(), 'idle')
    const bw = sh.boxWorld()
    // 見る点は格子戸のすぐ前（ほこらは東向き）。箱そのものはほこらの当たり判定の中にあるので、
    // そこを見る点にすると、演出のカメラの壁よけが格子戸の前までカメラを引きよせてしまう
    const doorFront = bw.clone().add(v(0.75, 0, 0))
    void rt.cinematic({ look: doorFront, from: bw.clone().add(v(3.6, 0.85, -0.4)), hold: Infinity, inSec: 1.2, panSec: 18, fov: 46, marker: { pos: bw.clone().add(v(0, 0.3, 0)), label: '時計じかけの錠前', color: '#ffd447' } })
    await this.clock.wait(0.6)
    sh.placeBox(true)
    sh.box.contents.add(this.clawProp.root)
    sh.box.setLockGlow(0.6)
    await this.clock.wait(0.6)
    sh.setDoors(0)
    sh.setMorningLight(1)
    sh.ringBell()
    await rt.dialogue(lines.lines('store').slice(0, 3))
    sh.box.setLockGlow(0)
    sh.box.wind()
    await rt.dialogue(lines.lines('store').slice(3))
    rt.endCinematic()
    rt.story.set('v7_claw_stored', true)
    this.setupStepKeepPlaces('leave')
    rt.save('v7_return')
    // 石が引っぱる
    rt.oreGlow(2)
    rt.shake(0.25)
    await rt.dialogue(lines.lines('pull'))
    this.openRing(true)
    this.place('genbei', v(-8.4, 0, 24.4), RETURN_RING, 'wave')
    this.place('oharu', v(-7.9, 0, 28.3), RETURN_RING, 'wave')
    void rt.cinematic({ look: RETURN_RING.clone().setY(1.2), hold: 1.6, inSec: 1.0, outSec: 1.0, fov: 46, marker: { pos: RETURN_RING.clone().setY(1.0), label: '帰りの光の輪', color: '#9fe8ff' } })
    await this.clock.wait(2.6)
    this.lock(rt, false)
  }

  private openRing(announce: boolean): void {
    const rt = this.rt
    if (!rt) return
    this.ringOpen = true
    rt.rift.openAt(RETURN_RING, eraTintHex(2086), 1.6, announce ? 0.8 : 4)
  }

  /** 光の輪で 2086年へ */
  private async leave(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.lock(rt, true)
    this.look.genbei = rt.player.position
    this.look.oharu = rt.player.position
    this.genbei.setPose('wave')
    this.oharu.setPose('wave')
    const gp = this.genbei.root.position
    const op = this.oharu.root.position
    const look = v((gp.x + op.x) / 2, 1.0, (gp.z + op.z) / 2)
    void rt.cinematic({ look, from: v(look.x + 4.2, 1.7, look.z - 0.6), hold: Infinity, inSec: 1.3, fov: 44 })
    await rt.dialogue(lines.lines('farewell'))
    rt.endCinematic()
    rt.oreGlow(2.2)
    this.lock(rt, false)
    const r = rt.travel({ to: '2086', cause: 'return', spawn: 'v7_from_1726' })
    if (!r.ok) rt.hud.toast(r.reason)
  }

  // ================================================================ 毎フレーム

  update(dt: number, _frame: ActionFrame, rt: StageRuntime): void {
    this.clock.update(dt)
    this.walker.update(dt)
    this.stepT += dt
    const p = rt.player.position
    const ws = this.w.workshop
    switch (this.step) {
      case 'arrive': {
        this.teaDef.point.copy(this.tea.position).setY(this.tea.position.y + 0.22)
        // つかめなくても、人形はぜんまいが切れて止まる → おはるが来る
        if (!this.busy && !this.sub.dollCaught && this.tea.root.visible && this.tea.mode === 'stop' && !rt.talking) void this.runMeet(rt)
        break
      }
      case 'workshop': {
        if (!this.sub.inWorkshop && ws.inside(p) && p.z > 14.6) void this.runEnterWorkshop(rt)
        if (this.sub.bookSeen) {
          const d = dist2(p, ws.box.shardWorld)
          const k = Math.max(0, Math.min(1, (5.5 - d) / 4))
          if (!this.busy) {
            ws.box.setResonance(k)
            this.wave?.set(k > 0.05 ? k : null)
            if (k > 0.1 && Math.random() < dt * 2) rt.oreGlow(0.6 + k)
          }
          if (d < 2.5 && !this.busy) void this.runFragment(rt)
        } else if (ws.inside(p)) ws.box.setResonance(0.15)
        break
      }
      case 'demo': {
        if (!this.busy && dist2(p, BENCH_FRONT) < 1.6) void this.runDemo(rt)
        break
      }
      case 'night': {
        if (this.sub.boss === 'before' && !this.busy && p.z > 22.2 && p.x < C.COURT.x0 - 0.1) void this.runBossIntro(rt)
        if (this.sub.boss === 'fight') {
          this.dollBody.copy(this.w.doll.position).setY(this.w.doll.position.y + 1.0)
          this.bossUpdate(dt, rt)
        }
        break
      }
      case 'dawn': {
        const carrying = (rt.claw.wire.phase === 'carrying' || rt.claw.wire.phase === 'reeling') && rt.claw.wire.target?.id === BOX_ID
        if (carrying && !this.sub.carryBox) {
          this.sub.carryBox = true
          rt.say('おはる', lines.lines('carry_hint')[0].text, 3)
          // 源兵衛とおはるも、ほこらへ向かう
          void this.walk('oharu', [DOOR_IN, DOOR_FRONT, v(-10.9, 0, 13.4), v(-10.9, 0, 21.8), v(-8.0, 0, 28.0)], 2.2, this.w.shrine.boxWorld())
          void this.walk('genbei', [DOOR_IN, DOOR_FRONT, v(-10.9, 0, 13.0), v(-10.9, 0, 21.6), v(-8.6, 0, 24.4)], 1.7, this.w.shrine.boxWorld())
        } else if (!carrying && this.sub.carryBox && !this.busy) this.sub.carryBox = false
        break
      }
    }
    // 夜明けの空を進める
    if (this.dawnAnim >= 0 && this.sky) {
      this.dawnAnim = Math.min(0.72, this.dawnAnim + dt / 11)
      this.sky.dawn(this.dawnAnim)
    }
    rt.combat.passive = this.busy || rt.talking || rt.inCinematic
    this.keepCameraInWorkshop(rt)
    // 人物の向き
    for (const who of ['genbei', 'oharu'] as const) {
      const c = this.ch(who)
      if (this.walker.speedOf(c) > 0) continue
      const target = this.look[who] ?? (dist2(c.root.position, p) < 4.5 && !(who === 'genbei' && this.genbeiPose === 'crank') ? p : null)
      if (target) this.walker.turnToward(c, target, dt, 4)
    }
  }

  /**
   * 工房の中では、カメラが表の戸口から外へ出ないよう、うでの長さを縮める。
   * 表は戸口だけ当たり判定が無いので、まっすぐ入ると、カメラが外から暖簾と格子ごしに見てしまう（中の人が見えない）
   */
  private keepCameraInWorkshop(rt: StageRuntime): void {
    const rig = rt.camRig
    const p = rt.player.position
    if (!this.w.workshop.inside(p)) {
      if (this.camShort) {
        rig.distance = this.camDist0
        this.camShort = false
      }
      return
    }
    // カメラの位置 = 足もと + 上 0.95 + 向き × 長さ。向きの z が北（-）のとき、表の内側（z0 + 0.45）でとめる
    const dz = Math.cos(rig.yaw) * Math.cos(rig.pitch)
    let d = this.camDist0
    if (dz < -0.05) d = Math.min(d, Math.max(1.2, (p.z - (C.WORKSHOP.z0 + 0.45)) / -dz))
    rig.distance = d
    this.camShort = true
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    this.genbei.update(dt, this.walker.speedOf(this.genbei))
    this.oharu.update(dt, this.walker.speedOf(this.oharu))
    this.w.update(dt, t, rt.camera)
    this.w.workshop.setNight(this.sky?.night ?? 0)
    this.folk.update(dt)
    this.box.update(dt)
    this.wave?.update(dt)
    // 人形：おはるが抱えているときは胸の前
    if (this.tea.mode === 'carried') {
      const o = this.oharu.root
      this.tmp.set(o.position.x - Math.sin(o.rotation.y) * 0.24, o.position.y + 0.62, o.position.z - Math.cos(o.rotation.y) * 0.24)
      this.tea.carryAt(this.tmp, o.rotation.y)
    }
    this.tea.update(dt)
    // 時を裂く爪：手にはめているときは右手の先
    if (this.clawOnHand) {
      this.clawProp.root.visible = true
      if (this.clawProp.root.parent !== this.w.root) this.w.root.add(this.clawProp.root)
      this.handWorld(rt, this.clawProp.root.position)
      this.clawProp.root.rotation.set(0, rt.player.facing, 0)
      this.clawProp.root.scale.setScalar(1.3)
    }
    this.clawProp.update(dt)
  }

  /** 右手の先（ワールド） */
  private handWorld(rt: StageRuntime, out: THREE.Vector3): THREE.Vector3 {
    rt.nexmax.handAnchor.getWorldPosition(out)
    return out.add(this.tmp.set(-Math.sin(rt.player.facing) * 0.12, 0, -Math.cos(rt.player.facing) * 0.12))
  }

  // ================================================================ クロー

  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    if (e.kind === 'connected') {
      const id = e.target.id
      if (id === TEA_ID) {
        this.tea.mode = 'stop'
        void this.runMeet(rt)
        return
      }
      if (id.startsWith('bell_doll_gear_') && this.sub.boss === 'fight') {
        const i = Number(id.slice(-1))
        const r = this.gears.grab(i)
        const d = this.w.doll
        if (r === 'hold') {
          // つかまれると、攻撃をやめてあばれる（衝撃波も消える）
          d.interrupt()
          this.waveHit = false
          d.setGearStrain(i, 0.2)
          rt.hud.toast(`${GEAR_NAMES[i]}の歯車をつかんだ！ はなさないで！`, 2.4)
        } else {
          rt.claw.reset()
          if (r === 'wrong') {
            d.setRage(this.gears.rage)
            rt.shake(0.3)
            // 2 回まちがえたら、照準の切りかえ（R）を教える
            const key = this.gears.mistakes >= 2 ? 'wrong_hint' : 'wrong'
            rt.say('おはる', lines.lines(key)[0].text, 3.2)
          }
        }
      }
    } else if (e.kind === 'released' && e.target.id.startsWith('bell_doll_gear_')) {
      const i = Number(e.target.id.slice(-1))
      if (this.gears.holding === i) {
        this.gears.release()
        this.w.doll.setGearStrain(i, 0)
        rt.combat.setBossBar(1 - this.gears.next / 3)
      }
    }
  }

  // ================================================================ F・案内・目標

  private nearNpc(rt: StageRuntime): Who | null {
    const p = rt.player.position
    let best: Who | null = null
    let bd = Infinity
    for (const who of ['genbei', 'oharu'] as const) {
      const c = this.ch(who)
      if (!c.root.visible) continue
      const d = dist2(c.root.position, p)
      if (d < 2.4 && d < bd && Math.abs(c.root.position.y - p.y) < 2) {
        best = who
        bd = d
      }
    }
    return best
  }

  private nearBook(rt: StageRuntime): boolean {
    return this.step === 'workshop' && this.sub.inWorkshop === true && !this.sub.bookSeen && dist2(rt.player.position, BOOK_READ) < 1.4
  }

  private nearShrine(rt: StageRuntime): boolean {
    return this.step === 'dawn' && this.sub.carryBox === true && dist2(rt.player.position, this.w.shrine.frontWorld(1.3, this.tmp2)) < 2.0
  }

  private nearDoll(rt: StageRuntime): boolean {
    return this.step === 'night' && this.sub.boss === 'claw' && dist2(rt.player.position, this.w.doll.position) < 7
  }

  private nearRing(rt: StageRuntime): boolean {
    return this.ringOpen && dist2(rt.player.position, RETURN_RING) < 2.4
  }

  interact(rt: StageRuntime): boolean {
    if (this.busy) return true
    if (this.nearRing(rt) && this.step === 'leave') {
      void this.leave(rt)
      return true
    }
    if (this.nearBook(rt)) {
      void this.runBook(rt)
      return true
    }
    if (this.nearShrine(rt)) {
      void this.runStore(rt)
      return true
    }
    if (this.nearDoll(rt)) {
      void this.runTinySlit(rt)
      return true
    }
    const who = this.nearNpc(rt)
    if (!who) return false
    if (this.step === 'demo' && who === 'genbei' && dist2(rt.player.position, BENCH_FRONT) < 3) {
      void this.runDemo(rt)
      return true
    }
    const key = this.npcLine(who)
    if (key) {
      const l = lines.lines(key)[0]
      rt.say(l.speaker, l.text, 3)
    }
    return true
  }

  private npcLine(who: Who): string | null {
    switch (this.step) {
      case 'arrive':
        return who === 'oharu' ? 'oharu_wait' : 'genbei_busy'
      case 'workshop':
        return who === 'oharu' ? (this.sub.inWorkshop ? 'oharu_book' : 'oharu_wait') : 'genbei_busy'
      case 'demo':
        return who === 'oharu' ? 'oharu_book' : 'genbei_demo_wait'
      case 'night':
        return who === 'oharu' ? 'oharu_night' : 'genbei_night'
      case 'dawn':
        return who === 'oharu' ? 'oharu_morning' : 'genbei_morning'
      case 'leave':
        return who === 'oharu' ? 'oharu_leave' : 'genbei_leave'
    }
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.busy) return []
    if (this.nearRing(rt) && this.step === 'leave') return [{ key: 'F', label: '光の輪で2086年へ帰る' }]
    if (this.nearBook(rt)) return [{ key: 'F', label: '書を見る' }]
    if (this.nearShrine(rt)) return [{ key: 'F', label: '箱をほこらに置く' }]
    if (this.nearDoll(rt)) return [{ key: 'F', label: '爪で胸の影を裂く' }]
    if (this.step === 'night' && this.gears.holding >= 0) return [{ key: 'J', label: 'はなす（3秒つかむと止まる）' }]
    if (this.nearNpc(rt)) return [{ key: 'F', label: '話す' }]
    return null
  }

  objective(_rt: StageRuntime): { title: string; sub: string } {
    if (this.step === 'night' && this.sub.boss === 'fight' && this.gears.holding >= 0) return { title: 'はなさないで！', sub: `${GEAR_NAMES[this.gears.holding]}の歯車が止まるまで（${Math.ceil((1 - this.gears.progress) * 3)}秒）` }
    return edoObjective(this.step, { ...this.sub, nextGear: this.gears.next, mistakes: this.gears.mistakes })
  }

  objectiveTarget(rt: StageRuntime): THREE.Vector3 | null {
    const ws = this.w.workshop
    switch (this.step) {
      case 'arrive':
        return this.sub.dollCaught ? this.oharu.root.position : this.tea.root.visible ? this.tea.position : null
      case 'workshop':
        if (!this.sub.inWorkshop) return DOOR_FRONT
        return this.sub.bookSeen ? ws.box.shardWorld : BOOK_READ
      case 'demo':
        return BENCH_FRONT
      case 'night':
        if (this.sub.boss === 'before') return rt.player.position.z < 21.4 ? BACK_DOOR : this.w.doll.position
        if (this.sub.boss === 'fight') return this.w.doll.targets[Math.min(2, this.gears.next)].point
        if (this.sub.boss === 'claw') return this.w.doll.targets[2].point
        return null
      case 'dawn':
        if (this.sub.carryBox) return this.w.shrine.frontWorld(1.3, this.markAt)
        if (this.sub.boxReady) return this.box.root.position
        return this.genbei.root.position
      case 'leave':
        return RETURN_RING
    }
  }

  objectiveMarkers(rt: StageRuntime): readonly ObjectiveMark[] | null {
    const out = this.marks
    out.length = 0
    const t = this.objectiveTarget(rt)
    if (!t) return out
    const at = this.markAt.copy(t)
    if (t === this.oharu.root.position) out.push({ pos: at.setY(t.y + this.oharu.height + 0.3), label: 'おはる' })
    else if (t === this.genbei.root.position) out.push({ pos: at.setY(t.y + this.genbei.height + 0.3), label: '源兵衛' })
    else if (this.step === 'arrive') out.push({ pos: at.setY(t.y + 0.7), label: '茶運び人形' })
    else if (this.step === 'workshop') out.push({ pos: at.setY(t.y + (this.sub.inWorkshop ? 0.7 : 3.0)), label: !this.sub.inWorkshop ? '源兵衛の工房' : this.sub.bookSeen ? '木の箱' : '書' })
    else if (this.step === 'demo') out.push({ pos: at.setY(1.6), label: '作業台' })
    else if (this.step === 'night') out.push({ pos: at.clone().setY(t.y + 0.9), label: this.sub.boss === 'before' ? (rt.player.position.z < 21.4 ? '裏口' : '時の鐘人形') : `${GEAR_NAMES[Math.min(2, this.gears.next)]}の歯車` })
    else if (this.step === 'dawn') out.push({ pos: at.setY(t.y + 0.9), label: this.sub.carryBox ? '時の神さまのほこら' : 'からくりの箱' })
    else if (this.step === 'leave') out.push({ pos: at.setY(2.6), label: '光の輪' })
    return out
  }

  music(_rt: StageRuntime): MusicId | null {
    if (this.step === 'night') return this.sub.boss === 'over' ? 'dawn' : 'ura'
    return 'edo1726'
  }

  // ================================================================ 開発用

  /** いまの段階のプレイヤーの仕事を片づけて先へ（通しの自動確認用） */
  devSkip(rt: StageRuntime): void {
    if (this.busy) return
    switch (this.step) {
      case 'arrive':
        // 人形がまだ歩き出していなければ、路地を下りてくる途中から（会話を飛ばしたとき）
        if (!this.tea.root.visible || this.tea.mode !== 'walk') {
          this.tea.walkPath([DOLL_PATH[1], DOLL_PATH[2]], 0.55)
          this.place('oharu', OHARU_CHASE[1], DOLL_PATH[2], 'idle')
        }
        this.tea.root.visible = true
        this.oharu.root.visible = true
        void this.runMeet(rt)
        break
      case 'workshop':
        this.sub.inWorkshop = true
        this.sub.bookSeen = true
        if (this.walker.speedOf(this.oharu) === 0) this.place('oharu', WORKSHOP_SPOTS.oharu, v(-16.4, 0, 18.6), 'idle')
        rt.player.teleport(v(-16.6, 0.06, 19.6))
        void this.runFragment(rt)
        break
      case 'demo':
        rt.player.teleport(BENCH_FRONT)
        void this.runDemo(rt)
        break
      case 'night':
        if (this.sub.boss === 'before') rt.player.teleport(PLAZA_ENTRY)
        else if (this.sub.boss === 'fight') {
          while (!this.gears.done) {
            const i = this.gears.next
            this.gears.grab(i)
            this.gears.holdT = this.gears.holdSec
            this.onGearStopped(rt, this.gears.tick(0))
          }
        } else if (this.sub.boss === 'claw') {
          rt.player.teleport(this.w.doll.position.clone().add(v(0, 0.03, -4.5)))
          void this.runTinySlit(rt)
        }
        break
      case 'dawn':
        if (this.sub.boxReady) {
          this.sub.carryBox = true
          rt.player.teleport(this.w.shrine.frontWorld(1.4))
          void this.runStore(rt)
        }
        break
      case 'leave':
        rt.player.teleport(RETURN_RING.clone().add(v(1.2, 0, 0.6)))
        void this.leave(rt)
        break
    }
  }

  debug(): Record<string, unknown> {
    const d = this.w.doll
    return {
      step: this.step,
      sub: { ...this.sub },
      busy: this.busy,
      gearNext: this.gears.next,
      holding: this.gears.holding,
      hold: +this.gears.progress.toFixed(2),
      dollState: d.state,
      dollPos: d.position.toArray().map((x) => +x.toFixed(1)),
      rage: d.rage,
      time: this.sky?.time ?? null,
      dawn: +this.dawnAnim.toFixed(2),
      ring: this.ringOpen,
      tea: this.tea.mode,
    }
  }

  dispose(): void {
    this.clock.dispose()
    this.walker.clear()
    this.sky?.dispose()
    this.sky = null
    this.curtain?.dispose()
    this.curtain = null
    this.wave?.dispose()
    this.wave = null
    const rt = this.rt
    if (rt) {
      rt.combat.showBossBar(null)
      rt.combat.onRespawn = null
      if (this.camShort) rt.camRig.distance = this.camDist0
    }
    this.rt = null
    const w = window as unknown as { __edo7Dev?: unknown }
    if (w.__edo7Dev) delete w.__edo7Dev
  }
}
