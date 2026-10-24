// 1186年 クメールの都・アルンの寺と村（物語 v7 の 11 章「900年前のカンボジア」）。
// 舞台は sceneKhmer.ts（池・水の上の家・ナーガの橋・象・寺・三つの塔・大階段・アルン）、進み方は storyKhmer.ts（フラグだけで段階が決まる）。
//   着く（光の輪・空のひび・食べられた森）→ チャンダ（爪の音が刃と同じ）→ お寺のいちばん上でおばあさん（アルンの話）→ 刃・たたかい方・やくそく →
//   夜明けの鏡を三つの塔へ（北：象に乗って池のまん中の家へ → 家から家へ飛びうつる／東：回る鏡の台を止める／南：落ちる石を止めて足場）→
//   夜：寺の階段の防衛（トワが段をくずす・石を止めてのぼる・チャンダと背中あわせ）→ トワとの話 → 空の口が石像と家を飲みこむ → 夜明け →
//   三つの鏡の光がアルンへ → 光の扉 → 裏側：オルムの心臓（初戦）→ 900 本の筋・最後の光が七つのつぶでかけらへ・土へ → 帰還
// チャンダは、話している間はその場で止まってネクマックスを向く（talk）。ついてこなければ、近くで待って呼ぶ。
// 池の象は、乗るまで乗り場で待ち、乗っていなければ先へ行かない（FerryLogic）。水に落ちたら、すぐ象の背中か、最後に立っていた所へ（fallGuard）。
import * as THREE from 'three'
import { ERA_KHMER, eraTintHex } from '../../core/eras'
import { DialogueDB } from '../../core/dialogue'
import type { DialogueLine } from '../../game/dialogueQueue'
import type { ObjectiveMark, SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageWorld } from '../../game/stage'
import type { ActionFrame } from '../../player/inputActions'
import type { WireEvent } from '../../player/clawLogic'
import type { Hint } from '../../ui/hud'
import type { MusicId } from '../../audio/tracks'
import type { EnemyHandle } from '../../combat/combatSystem'
import type { EnemyStats } from '../../combat/combatLogic'
import { SceneClock } from '../../chronicle/kit/clock'
import { ArenaFence, rectPoints } from '../../chronicle/kit/arena'
import { Walker } from '../../chronicle/kit/walker'
import { Curtain } from '../../chronicle/kit/curtain'
import type { ChronoTarget, SlitHandle } from '../../chronicle/chrono'
import { Lamp, SHADE_STYLE, createPerson, type PersonCharacter, type PersonPose } from '../../chronicle/visuals'
import { buildKhmerScene, KHMER_BALL_ID, type KhmerScene } from './sceneKhmer'
import { KHMER_ENVIRONMENTS, KhmerEnvMaps, applyKhmerTime, type TimeOfDay } from './environment'
import { ELEPHANT_DOCK, K, KHMER_CLAW_IDS, NPC, ROUTE_N, SMALL_TOWER, SPAWNS, TOWERS, TOWER_IDS, WATER_HOUSES, towerPoint, type Spot, type TowerId } from './layout'
import { FerryLogic } from './khmerLogic'
import type { Elephant } from './elephant'
import { COLLAPSE_PLAN, MIRROR_FLAGS, NIGHT_WAVES, canPlaceMirror, khmerMobPhase, khmerObjective, khmerSpawn, khmerStep, khmerTime, mirrorsLeft, type KhmerStep, type MeetPhase, type NightPhase } from './storyKhmer'
import { UraBattle } from '../../chronicle/uraBattle'
import { SWALLOW } from './swallow'
import { createKhmerVillagers, type KhmerVillager } from './people'
import { MobTalkKhmer } from './mobTalkKhmer'
import type { Freezable } from './mirrors'
import data from './lines_v7.json'

const DB = new DialogueDB(data)

/**
 * 夜の影の攻撃を、子ども向けにゆるめる（共有の ENEMY_STATS はそのまま、この敵だけ）：
 * 構え（溜め）が見えてから当たるまで 1.2 秒より長く（欠け虫は 0.45 秒・欠け盾は 0.6 秒）・当たりはハート 1 つ
 */
function kidEnemy(h: EnemyHandle): void {
  const b = h.brain as unknown as { stats: EnemyStats }
  b.stats = { ...b.stats, windup: Math.max(1.25, b.stats.windup), damage: Math.min(1, b.stats.damage) }
}
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 帰りの光の輪（上の台の西のふち） */
const RETURN_RING = v(20.4, K.TOP_Y, -9.2)
/** 夜のトワ（大階段の上の空に浮かぶ） */
const TOWA_NIGHT = v(12.6, 13.2, -11.6)
/** 夜のチャンダ（上の台、階段のすぐ北） */
const CHANDA_NIGHT: Spot = { pos: v(20.3, K.TOP_Y, -7.6), yaw: Math.PI / 2 }
/** 裏側から出た所（上の台、アルンの祠の前の少し北。アルンを見るカメラの線から外す） */
const URA_EXIT = v(K.URA_ENTRY.x - 0.4, K.TOP_Y, K.URA_ENTRY.z - 2.6)
/** 宝の箱（折れた刃のかけらをしまう） */
const TREASURE_BOX = v(23.6, K.TOP_Y, -9.4)
/** 夜の影が出る所（上の台） */
/** 落ちてくる石が体に当たる水平の近さ（石の半分の幅＋体の太さ）と、飛ばされる速さ */
const STONE_HIT_R = 0.46 + 0.36
const STONE_KNOCK = 6
/** すべり落ちていく石に押しのけられる速さ（m/s） */
const STONE_SHOVE = 3.2
const TOP_SPAWNS = [v(24, K.TOP_Y, -10.2), v(28, K.TOP_Y, -10.2), v(24, K.TOP_Y, 2.2), v(28.2, K.TOP_Y, 2.2), v(32.2, K.TOP_Y, -4), v(32.2, K.TOP_Y, -7.6)]
/** 夜の防衛の柵（上の台だけ。ふちから下の段へ落ちない） */
const TOP_ARENA = { x0: 19.3, x1: 32.7, z0: -10.7, z1: 2.7 }
/** チャンダが待って呼ぶ遠さ（これより遠いと止まって待つ・これより近いと歩きだす）と、呼ぶまでの秒・呼ぶ間 */
const LEAD = { wait: 10, go: 7, callAfter: 4, callEvery: 8 }
/** 水に落ちたとみなす高さ（池の水面の下。岸の石段のいちばん下の段より低い所で、落ちている途中） */
const SINK_Y = K.WATER_Y - 0.35
/** 北の塔への道の金具（目印用） */
const HOOK = (id: string) => ROUTE_N.hooks.find((h) => h.id === KHMER_CLAW_IDS.hook(id)) as (typeof ROUTE_N.hooks)[number]
/** 象のりばの上（目印） */
const DOCK_TOP = v(ELEPHANT_DOCK.x, ELEPHANT_DOCK.y, ELEPHANT_DOCK.z)

export class KhmerStage implements Stage {
  readonly key = '1186' as const
  readonly era = ERA_KHMER
  readonly label = '1186年　クメールの都・アルンの寺'
  readonly subtitle = '900年前のカンボジア'
  environment: StageEnvironment = KHMER_ENVIRONMENTS.afternoon
  private sc!: KhmerScene
  /** 裏側の戦い（chronicle/uraBattle.ts、scenario 'khmer'） */
  private ura!: UraBattle
  private chanda!: PersonCharacter
  private grandma!: PersonCharacter
  private towa!: PersonCharacter
  private lamp!: Lamp
  private villagers: KhmerVillager[] = []
  /** 村の人の吹き出しと F の会話 */
  private mobs: MobTalkKhmer | null = null
  private rt: StageRuntime | null = null
  private readonly clock = new SceneClock()
  private readonly walker = new Walker()
  private curtain: Curtain | null = null
  private maps: KhmerEnvMaps | null = null
  private startStep: KhmerStep = 'arrive'
  private time: TimeOfDay = 'afternoon'
  private busy = false
  private meet: MeetPhase = 'find'
  private night: NightPhase = 'intro'
  /** 開発用：夜の影の波を全部すませた */
  private wavesSkipped = false
  private readonly told = new Set<string>()
  private ringOpen = false
  private leaving = false
  private door: SlitHandle | null = null
  private chandaHitT = 0
  private nearTower: TowerId | null = null
  private ballGiven = false
  private kidBall: THREE.Mesh | null = null
  private towaFloat = 0
  private towaShown = false
  private readonly marks: ObjectiveMark[] = []
  private readonly hitDir = new THREE.Vector3()
  /** 落ちる石を、足場にならない高さで止めた回数（ヒント用） */
  private stoneMiss = 0
  /** rt.chrono に渡した止める対象（enabled を毎フレーム切りかえる） */
  private readonly fzTargets: { fz: Freezable; t: ChronoTarget }[] = []
  /** チャンダが話している（その場で止まって、ネクマックスの方を向く）。入れ子で数える */
  private chandaTalking = 0
  /** チャンダが、ついてこないネクマックスを待っている（案内のとちゅう） */
  private chandaWaiting = false
  private chandaWaitT = 0
  private chandaCallT = 0
  private chandaWasWalking = false
  private readonly chandaPos = new THREE.Vector3()
  /** 池の象（乗り場 ⇄ 池のまん中の家のそば） */
  private readonly ferry = new FerryLogic()
  /** 落ちたときにもどす所：最後に立っていた、動かない地面 */
  private readonly safe = new THREE.Vector3()
  /** 最後に乗っていた象と、その時刻（落ちたら、その背中へ） */
  private rideEl: Elephant | null = null
  private rideT = -99
  private readonly fallTo = new THREE.Vector3()
  /** 夜の防衛の柵 */
  private fence: ArenaFence | null = null

  // ================================================================ 読みこみ

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    const f = (n: string) => ctx.story.get(n)
    this.startStep = khmerStep(f)
    this.time = khmerTime(this.startStep)
    this.environment = KHMER_ENVIRONMENTS[this.time]
    ctx.progress(0.1, '900年前のカンボジアへ…')
    await ctx.yieldFrame()
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    this.sc = await buildKhmerScene(ctx.quality, aniso, ctx.progress, ctx.yieldFrame)
    const root = this.sc.root
    ctx.progress(0.62, '裏側の空間を組み立て中…')
    await ctx.yieldFrame()
    // 裏側（x = +3000 に組み立てる。夜明けの光の扉から入る）
    this.ura = UraBattle.build({ root, colliders: this.sc.colliders, origin: K.URA_ORIGIN.clone(), quality: ctx.quality, scenario: 'khmer' })
    // 人
    this.chanda = createPerson('chanda')
    this.grandma = createPerson('khmerElder')
    this.towa = createPerson('towa')
    this.lamp = new Lamp(root, { dark: true })
    this.towa.holdLamp(this.lamp)
    this.towa.root.visible = false
    root.add(this.chanda.root, this.grandma.root, this.towa.root)
    this.villagers = createKhmerVillagers()
    for (const vv of this.villagers) root.add(vv.ch.root)
    // 仮の箱（舞台の確認用）は本編では出さない
    this.sc.villagers.setVisible(false)
    this.sc.chanda.group.visible = false
    this.sc.grandma.group.visible = false
    // 宝の箱
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.55), new THREE.MeshStandardMaterial({ color: '#7a4a28', roughness: 0.7 }))
    chest.position.copy(TREASURE_BOX).setY(TREASURE_BOX.y + 0.25)
    chest.castShadow = true
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: '#c8963a', roughness: 0.4, metalness: 0.6 }))
    lid.position.y = 0.3
    chest.add(lid)
    root.add(chest)
    const lights = [...this.sc.lights, ...this.ura.lights]
    return { root, colliders: this.sc.colliders, claw: this.sc.claw, lights }
  }

  spawn(id: string | null): SpawnPoint {
    const s = (id && SPAWNS[id]) || SPAWNS[khmerSpawn(this.startStep)] || SPAWNS.arrive
    return { pos: s.pos.clone(), facing: s.facing, camYaw: s.camYaw, camPitch: s.camPitch }
  }

  private lines(key: string): DialogueLine[] {
    return DB.lines(key) as DialogueLine[]
  }

  private f(rt: StageRuntime): (n: string) => boolean {
    return (n) => rt.story.get(n)
  }

  private step(rt: StageRuntime): KhmerStep {
    return khmerStep(this.f(rt))
  }

  // ================================================================ はじめ

  begin(rt: StageRuntime): void {
    this.rt = rt
    this.sc.attachPhysics(rt.phys)
    this.curtain = new Curtain()
    this.mobs = new MobTalkKhmer(this.villagers, rt.renderer.domElement.ownerDocument.getElementById('ui'), rt.camera, () => this.time !== 'night')
    this.maps = new KhmerEnvMaps(rt.renderer)
    this.maps.borrow(this.time, rt.scene.environment)
    // 1186 年に来ているなら、時空裂きのNMクロー（10 章）はもう持っている（開発で ?stage=1186 から始めたときのため）
    if (!rt.story.get('v7_rift_claw')) rt.story.set('v7_rift_claw', true)
    const f = this.f(rt)
    const step = this.step(rt)
    this.sc.setTimeOfDay(this.time)
    // 前にしたことを見た目へ（鏡・回る鏡の台・飲みこまれた石像と家・アルン）
    for (const id of TOWER_IDS) if (f(MIRROR_FLAGS[id])) this.sc.placeMirror(id, true)
    if (f('v7_mirror_e')) this.sc.turntable.setSolved(true)
    if (f('v7_stairs_defended')) this.sc.swallow.setSwallowed(true)
    if (f('v7_khmer_done')) {
      this.sc.arun.setScars(1)
      this.sc.arun.setDead(true)
      this.chanda.setBlade('broken')
    } else if (f('v7_heart1')) {
      this.chanda.setBlade('broken')
      this.sc.arun.setScars(1)
    }
    if (step === 'ura' || step === 'after' || step === 'return') for (const id of TOWER_IDS) this.sc.beamOn(id, true)
    this.sc.turntable.onSolved = () => {
      if (this.step(rt) === 'mirrors') {
        rt.hud.toast('光の筋が、東の塔の上にとどいた！', 2.6)
        void this.talkOnce(rt, 'tower_e_solved')
      }
    }
    // ちがう向きで 2 回止めたら、止めるタイミングを教える（そのあとも 3 回ごとに）
    let missed = 0
    this.sc.turntable.onMissed = () => {
      missed++
      if (this.step(rt) === 'mirrors' && missed >= 2 && missed % 3 === 2) void this.talk(rt, this.lines('tower_e_hint'))
    }
    // 時空裂きで止められる物
    this.addFreezables(rt)
    this.placeForStep(step)
    this.safe.copy(rt.player.position)
    rt.combat.enabled = false
    rt.save(khmerSpawn(step))
    if (step === 'return') this.openRing(rt)
  }

  revealed(rt: StageRuntime): void {
    const step = this.step(rt)
    switch (step) {
      case 'arrive':
        void this.runArrive(rt)
        break
      case 'meet':
        void this.chandaApproach(rt)
        break
      case 'night':
        void this.runNight(rt)
        break
      case 'ura':
        void this.runDawn(rt)
        break
      case 'after':
        void this.runAfter(rt)
        break
      default:
        break
    }
  }

  /** 止める（時空裂き）の対象：回る鏡の台・南の塔の石・大階段の石 */
  private addFreezables(rt: StageRuntime): void {
    this.fzTargets.length = 0
    for (const fz of this.sc.freezables()) {
      const t: ChronoTarget = {
        id: fz.id,
        kind: 'freeze',
        label: fz.label,
        point: fz.point,
        radius: fz.radius,
        enabled: false,
        // 落ちる石は、止めたあとに 2 回とびのる時間がいるので長めに（子どもが間に合うように）。回る鏡の台はふつう
        seconds: fz.id === 'khmer_turntable' ? 4 : 6.5,
        range: fz.id === 'khmer_turntable' ? 14 : 12,
        onAct: () => {
          // 落ちる石を、足場にならない高さで止めた：2 回目から、止めどきを教える（そのあとも 3 回ごとに）
          if (fz.goodNow && !fz.goodNow()) {
            this.stoneMiss++
            if (this.stoneMiss >= 2 && this.stoneMiss % 3 === 2) void this.talk(rt, this.lines('stone_hint'))
          }
          fz.setFrozen(true)
        },
        onThaw: () => fz.setFrozen(false),
      }
      rt.chrono.add(t)
      this.fzTargets.push({ fz, t })
    }
  }

  /** 段階の頭の、人の立ち位置 */
  private placeForStep(step: KhmerStep): void {
    const put = (ch: PersonCharacter, s: Spot, pose: PersonPose = 'idle') => {
      ch.root.position.copy(s.pos)
      ch.root.rotation.y = s.yaw
      ch.setPose(pose)
    }
    put(this.grandma, NPC.grandma.altar, 'cane')
    switch (step) {
      case 'arrive':
        put(this.chanda, NPC.chanda.bridge)
        break
      case 'meet':
        put(this.chanda, NPC.chanda.arrive)
        break
      case 'mirrors':
        put(this.chanda, NPC.chanda.temple, 'laugh')
        break
      case 'night':
        put(this.chanda, CHANDA_NIGHT, 'guard')
        put(this.grandma, NPC.grandma.door, 'pray')
        break
      default:
        put(this.chanda, NPC.chanda.altar)
        put(this.grandma, NPC.grandma.door, 'cane')
    }
  }

  private setTime(rt: StageRuntime, t: TimeOfDay): void {
    this.time = t
    this.sc.setTimeOfDay(t)
    applyKhmerTime(KHMER_ENVIRONMENTS[t], { scene: rt.scene, sky: rt.sky, sun: rt.sun, post: rt.post, envMap: this.maps?.get(t) ?? null })
  }

  /** 1 回だけ流す台詞（操作は止めない） */
  private async talkOnce(rt: StageRuntime, key: string): Promise<void> {
    if (this.told.has(key)) return
    this.told.add(key)
    await this.talk(rt, this.lines(key))
  }

  /**
   * 会話を流す。チャンダが話す会話なら、話している間、チャンダはその場で止まって、ネクマックスの方を向く
   * （歩いているとちゅうなら、話し終わってから続きを歩く）
   */
  private async talk(rt: StageRuntime, ls: DialogueLine[]): Promise<void> {
    const chanda = ls.some((l) => l.speaker === 'チャンダ')
    if (chanda) this.chandaTalking++
    try {
      await rt.dialogue(ls)
    } finally {
      if (chanda) this.chandaTalking--
    }
  }

  // ================================================================ 場面：着く

  private async runArrive(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    rt.rift.openAt(K.ARRIVE_RING.clone(), eraTintHex(ERA_KHMER), 1.8, 1.2)
    rt.oreGlow(1.6)
    await this.clock.wait(0.6)
    rt.rift.close(0.8)
    // お寺・池・空のひび
    void rt.cinematic({ look: v(26, 14, -4), from: v(-36, 3.2, -26), lookTo: v(40, 60, -150), fromTo: v(-35, 3.0, -28), panSec: 9, inSec: 1.8, hold: Infinity, outSec: 1.2, fov: 54 })
    await this.talk(rt, this.lines('arrive_look'))
    // 食べられた森
    const vil = this.villagers.find((x) => x.id === 'watch2')
    if (vil) vil.ch.setPose('point')
    void rt.cinematic({ look: v(85, 0, -112), from: v(-30, 4, -30), inSec: 1.4, hold: Infinity, outSec: 1.2, fov: 46, marker: { pos: v(85, 2, -112), label: '食べられた森', color: '#c08aff' } })
    await this.talk(rt, this.lines('villager_fear'))
    if (vil) vil.ch.setPose('idle')
    rt.endCinematic()
    rt.story.set('v7_khmer_arrived', true)
    rt.save('arrive')
    rt.setControlLocked(false)
    this.busy = false
    await this.chandaApproach(rt)
  }

  /** チャンダが走ってくる（話しかけるのを待つ） */
  private async chandaApproach(rt: StageRuntime): Promise<void> {
    this.meet = 'find'
    const to = NPC.chanda.arrive.pos
    if (this.chanda.root.position.distanceTo(to) > 0.5) {
      this.chanda.setPose('walk')
      await this.walker.walkTo(this.chanda, [v(-24.5, 0, -6), to], 3.4, rt.player.position)
      this.chanda.setPose('laugh')
    }
  }

  // ================================================================ 場面：チャンダ・おばあさん

  private async runMeet(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    this.walker.face(this.chanda, rt.player.position)
    this.chanda.lookAt(rt.player.position.clone().setY(0.8))
    this.chanda.setPose('guard')
    void rt.cinematic({ look: this.chanda.root.position.clone().setY(1.0), inSec: 1.0, hold: Infinity, outSec: 0.8, fov: 46 })
    const p = this.talk(rt, this.lines('chanda_meet'))
    await this.clock.wait(4.5)
    this.chanda.setPose('laugh')
    await p
    rt.endCinematic()
    this.chanda.lookAt(null)
    rt.setControlLocked(false)
    this.busy = false
    this.meet = 'follow'
    // 「こっち、こっち！」は、ネクマックスの方を向いて言ってから歩きだす
    void this.talk(rt, this.lines('chanda_follow'))
    void this.chandaLead(rt)
  }

  /** チャンダが寺の上まで案内する（プレイヤーが離れると待つ） */
  private async chandaLead(rt: StageRuntime): Promise<void> {
    const path: THREE.Vector3[] = [
      v(-34.5, 0, -4),
      v(-29.6, K.BRIDGE.deckY, -4),
      v(-4.6, K.BRIDGE.deckY, -4),
      v(K.STAIRS.x0 - 0.8, 0, -4),
      v(K.STAIRS.x1, K.TOP_Y, -4.4),
      NPC.chanda.altar.pos.clone(),
    ]
    for (const p of path) {
      if (this.meet !== 'follow') return
      // プレイヤーが遠いと待つ
      await this.clock.until(() => rt.player.position.distanceTo(this.chanda.root.position) < 13 || this.meet !== 'follow')
      this.chanda.setPose('walk')
      await this.walker.walkTo(this.chanda, [p], 2.8)
      if (this.clock.dead) return
    }
    this.chanda.root.rotation.y = NPC.chanda.altar.yaw
    this.chanda.setPose('idle')
  }

  private async runAltar(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.meet = 'altar'
    rt.setControlLocked(true)
    this.walker.stop(this.chanda)
    this.chanda.root.position.copy(NPC.chanda.altar.pos)
    this.walker.face(this.chanda, this.sc.arun.center)
    this.walker.face(this.grandma, rt.player.position)
    this.grandma.setPose('cane')
    const altarFrom = v(17.8, 11.0, -3.2)
    void rt.cinematic({ look: this.arunLook(altarFrom), from: altarFrom, lookTo: this.grandma.root.position.clone().setY(10.8), panSec: 14, inSec: 1.6, hold: Infinity, outSec: 1.0, fov: 52 })
    this.sc.arun.setGlow(1.4)
    await this.talk(rt, this.lines('grandma_arun'))
    this.sc.arun.setGlow(1)
    // チャンダの刃
    this.walker.face(this.chanda, rt.player.position)
    this.chanda.setPose('guard')
    void rt.cinematic({ look: this.chanda.root.position.clone().setY(10.6), inSec: 1.0, hold: Infinity, outSec: 0.8, fov: 44 })
    await this.talk(rt, this.lines('chanda_blade'))
    this.chanda.setPose('point')
    this.chanda.setAim(v(26, 12, -40))
    await this.talk(rt, this.lines('chanda_plan'))
    this.chanda.setAim(null)
    // 北の塔への道：象のりばの象 → 池のまん中の家 → 島の北の塔（上の台から北を見る）
    await this.showNorthRoute(rt)
    rt.endCinematic()
    rt.story.set('v7_met_chanda', true)
    rt.save('altar')
    rt.hud.toast('夜明けの鏡を 3 つ、あずかった', 3)
    rt.setControlLocked(false)
    this.busy = false
    // チャンダは境内へおりて待つ
    this.chanda.setPose('walk')
    void this.walker.walkTo(this.chanda, [v(K.STAIRS.x1, K.TOP_Y, -4.4), v(K.STAIRS.x0 - 0.8, 0, -4), NPC.chanda.temple.pos], 3.0, rt.player.position).then(() => this.chanda.setPose('laugh'))
  }

  /** 北の塔への道を、カメラで見せる（象 → 池のまん中の家 → 北の塔）。チャンダの短い一言 */
  private async showNorthRoute(rt: StageRuntime): Promise<void> {
    const el = this.sc.elephant.baray
    // 池の上の少し高い所から（寺の北の大きな木に象がかくれない所）
    const from = v(8, 7, -46)
    const house = WATER_HOUSES.find((h) => h.id === 'h3') as (typeof WATER_HOUSES)[number]
    const houseAt = v(house.x, house.floorY + 1.2, house.z)
    void rt.cinematic({ look: el.deckTop.clone().setY(el.deckTop.y + 0.5), from, inSec: 1.2, hold: Infinity, fov: 40, marker: { pos: el.deckTop.clone().setY(el.deckTop.y + 1.2), label: '池の象', color: '#ffd76a' } })
    const L = this.lines('chanda_route_n')
    await this.talk(rt, L.slice(0, 1))
    void rt.cinematic({ look: houseAt, from, lookTo: v(TOWERS.n.x, TOWERS.n.baseY + 6, TOWERS.n.z), panSec: 5, inSec: 1.0, hold: Infinity, fov: 40, marker: { pos: houseAt.clone().setY(houseAt.y + 1.4), label: '池のまん中の家', color: '#ffd76a' } })
    await this.talk(rt, L.slice(1))
  }

  // ================================================================ 場面：鏡

  /** 鏡を立てる（F） */
  private async placeMirror(rt: StageRuntime, id: TowerId): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    this.sc.placeMirror(id)
    this.sc.mirrors[id].setLit(0.8)
    rt.oreGlow(1.4)
    rt.story.set(MIRROR_FLAGS[id], true)
    const n = 3 - mirrorsLeft(this.f(rt)).length
    const st = this.sc.mirrors[id]
    void rt.cinematic({ look: st.center.clone(), inSec: 0.9, hold: Infinity, outSec: 0.8, fov: 46, marker: { pos: st.center.clone(), label: '夜明けの鏡', color: '#ffd76a' } })
    await this.talk(rt, this.lines(`mirror_set_${Math.min(3, Math.max(1, n))}`))
    rt.endCinematic()
    rt.save(`tower_${id}`)
    rt.setControlLocked(false)
    this.busy = false
    if (n >= 3) await this.runNight(rt)
  }

  /** 近くの、鏡を立てられる台 */
  private standNear(rt: StageRuntime): TowerId | null {
    const p = rt.player.position
    for (const id of TOWER_IDS) {
      const st = this.sc.mirrors[id].top
      if (Math.hypot(p.x - st.x, p.z - st.z) < 1.9 && Math.abs(p.y - (st.y - SMALL_TOWER.stand.h)) < 1.2) return id
    }
    return null
  }

  // ================================================================ 場面：夜（寺の階段の防衛）

  private async runNight(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.night = 'intro'
    rt.setControlLocked(true)
    const curtain = this.curtain as Curtain
    await curtain.set(true, 0.9)
    this.setTime(rt, 'night')
    this.sc.skyCrack.setCrack(0.9)
    this.sc.skyCrack.setOpen(0.25)
    const sp = SPAWNS.stairs
    rt.claw.reset()
    rt.player.teleport(sp.pos.clone(), sp.facing)
    rt.camRig.yaw = sp.camYaw
    // 少し上から：門の下からでも、のぼる段の面が見えるように
    rt.camRig.pitch = 0.4
    this.walker.clear()
    this.placeForStep('night')
    this.sc.stairs.restoreAll()
    this.showTowa(true)
    this.lamp.setDark(true, true)
    await this.clock.wait(0.3)
    await curtain.set(false, 1.0)
    rt.hud.banner('― その夜 ―', 'success', 2.4)
    // トワが来る（大階段の下の南から見上げる：トワ・空のひび・松明の階段が一度に見える。回廊の屋根・壁の中に入らない所から）
    void rt.cinematic({ look: v(12.0, 12.2, -10.4), from: v(6.0, 1.4, 1.2), inSec: 1.6, hold: Infinity, outSec: 1.0, fov: 42, marker: { pos: TOWA_NIGHT.clone().add(v(0, 1.2, 0)), label: 'トワ', color: '#c08aff' } })
    await this.talk(rt, this.lines('night_begin'))
    // 段をくずす
    this.towa.setPose('raiseLamp')
    for (const c of COLLAPSE_PLAN) {
      await this.clock.wait(c.at)
      this.sc.collapseStep(c.seg)
      rt.shake(0.5)
    }
    this.sc.stairs.setStonesActive(true)
    // くずれた段：南西の少し上から（松明の列・落ちてくる石・上の台のチャンダが入る）
    void rt.cinematic({ look: v(13, 6.2, -4.2), from: v(6.4, 5.0, 2.6), inSec: 1.0, hold: Infinity, outSec: 1.0, fov: 52 })
    await this.talk(rt, this.lines('night_collapse'))
    rt.endCinematic()
    this.towa.setPose('idle')
    rt.combat.setCheckpoint(sp.pos.clone(), sp.facing)
    rt.setControlLocked(false)
    this.busy = false
    this.night = 'climb'
    // 上の台に着くまで
    await this.clock.until(() => this.onTop(rt) || this.night !== 'climb')
    if (this.clock.dead) return
    await this.runDefend(rt)
  }

  private onTop(rt: StageRuntime): boolean {
    const p = rt.player.position
    return p.y > K.TOP_Y - 0.4 && p.x > K.STAIRS.x1 - 0.3 && p.x < 33 && p.z > -11 && p.z < 3
  }

  private async runDefend(rt: StageRuntime): Promise<void> {
    this.night = 'defend'
    // 上の台だけで戦う（ふちから下の段へ落ちない）
    if (!this.fence) this.fence = new ArenaFence(this.sc.root, rt.phys)
    this.fence.close(rectPoints(TOP_ARENA.x0, TOP_ARENA.x1, TOP_ARENA.z0, TOP_ARENA.z1), { y: K.TOP_Y })
    rt.combat.enabled = true
    rt.combat.setCheckpoint(SPAWNS.altar.pos.clone(), SPAWNS.altar.facing)
    void this.talk(rt, this.lines('night_top'))
    this.chanda.setPose('guard')
    this.wavesSkipped = false
    for (let w = 0; w < NIGHT_WAVES.length; w++) {
      if (this.night !== 'defend' || this.wavesSkipped) break
      if (w > 0) void this.talk(rt, this.lines('night_wave2'))
      this.spawnWave(rt, w)
      await this.clock.until(() => rt.combat.alive('night').length === 0 || this.night !== 'defend' || this.wavesSkipped)
      if (this.clock.dead) return
      await this.clock.wait(1.2)
    }
    await this.runTowaTalk(rt)
  }

  private spawnWave(rt: StageRuntime, w: number): void {
    const kinds = NIGHT_WAVES[w]
    kinds.forEach((kind, i) => {
      const at = TOP_SPAWNS[(i + w * 2) % TOP_SPAWNS.length]
      const h = rt.combat.spawn(kind, at.clone(), { tag: 'night', style: SHADE_STYLE, leash: 16, hidden: true })
      kidEnemy(h)
      void this.clock.wait(i * 0.45).then(() => {
        if (h.alive && !this.clock.dead) rt.combat.appear(h)
      })
    })
  }

  private async runTowaTalk(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.night = 'talk'
    rt.setControlLocked(true)
    for (const h of rt.combat.alive('night')) rt.combat.kill(h)
    rt.combat.enabled = false
    this.fence?.open()
    this.chanda.setPose('idle')
    this.walker.face(this.towa, rt.player.position)
    void rt.cinematic({ look: TOWA_NIGHT.clone().add(v(0, 0.6, 0)), from: v(19.4, 11.2, -5.6), inSec: 1.4, hold: Infinity, outSec: 1.0, fov: 46 })
    this.towa.setPose('idle')
    const p = this.talk(rt, this.lines('towa_talk'))
    await this.clock.wait(9)
    this.towa.setPose('sad')
    await p
    // 空の口が、村の古い石像と家を飲みこむ
    this.towa.setPose('idle')
    void rt.cinematic({ look: SWALLOW.statue.clone().setY(6), from: v(-34, 14, 2), lookTo: SWALLOW.mouth.clone().setY(22), panSec: 6, inSec: 1.6, hold: Infinity, outSec: 1.2, fov: 50 })
    await this.clock.wait(1.2)
    const sw = this.sc.swallow.play()
    rt.shake(0.6)
    await this.talk(rt, this.lines('swallow').slice(0, 2))
    await sw
    void rt.cinematic({ look: TOWA_NIGHT.clone().add(v(0, 0.5, 0)), from: v(19.4, 11.2, -5.6), inSec: 1.2, hold: Infinity, outSec: 1.0, fov: 44 })
    await this.talk(rt, this.lines('swallow').slice(2))
    this.towa.setPose('sad')
    // 夜明けが来る：トワが下がる
    this.night = 'dawn'
    // 上の台の東のふちから東の空を見る（祠堂の中・四すみの小さな塔のかげに入らない所）
    void rt.cinematic({ look: v(140, 10, -10), from: v(32.2, 11.4, -4.0), inSec: 1.4, hold: Infinity, outSec: 1.0, fov: 54 })
    this.sc.skyCrack.setOpen(0)
    await this.talk(rt, this.lines('dawn_coming'))
    this.towaRetreat = 0
    this.sc.swallow.hideMouth()
    this.sc.stairs.setStonesActive(false)
    rt.endCinematic()
    rt.story.set('v7_stairs_defended', true)
    rt.save('altar')
    this.busy = false
    await this.runDawn(rt)
  }

  private towaRetreat = -1

  /**
   * アルンを見る点：石の中心から、カメラの方へ 1.5 m 手前（石の当たり判定の外）。
   * 演出のカメラの壁よけは見る点から光線を飛ばすので、石の中を見る点にすると、カメラが石の中まで寄ってしまう
   */
  private arunLook(from: THREE.Vector3): THREE.Vector3 {
    const c = this.sc.arun.center
    const d = v(from.x - c.x, 0, from.z - c.z).normalize()
    return c.clone().addScaledVector(d, 1.5)
  }

  private showTowa(on: boolean): void {
    this.towaShown = on
    this.towa.root.visible = on
    if (on) {
      this.towa.root.position.copy(TOWA_NIGHT)
      this.towa.setRim('#b07aff', 0.9)
      this.towa.setSelfLight(0.35)
      this.towa.setPose('idle')
    }
  }

  // ================================================================ 場面：夜明け・光の扉・裏側

  private async runDawn(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    const curtain = this.curtain as Curtain
    if (this.time !== 'dawn') {
      await curtain.set(true, 1.0, '#2a1a20')
      this.setTime(rt, 'dawn')
      this.showTowa(false)
      for (const h of rt.combat.alive()) rt.combat.kill(h)
      rt.combat.enabled = false
      rt.claw.reset()
      rt.player.teleport(SPAWNS.altar.pos.clone(), SPAWNS.altar.facing)
      rt.camRig.yaw = SPAWNS.altar.camYaw
      this.placeForStep('ura')
      await this.clock.wait(0.3)
      await curtain.set(false, 1.2, '#2a1a20')
    }
    // 三つの鏡が朝日をはね返し、アルンへ（祠堂の西の入口の外から、部屋の中のアルンと、入ってくる光の筋を見る）
    const dawnFrom = v(19.0, 11.8, -3.0)
    void rt.cinematic({ look: this.arunLook(dawnFrom), from: dawnFrom, inSec: 1.8, hold: Infinity, outSec: 1.0, fov: 58 })
    for (const id of TOWER_IDS) {
      this.sc.beamOn(id)
      await this.clock.wait(0.7)
    }
    this.sc.arun.setGlow(2)
    rt.oreGlow(2)
    await this.clock.wait(1.0)
    // 光の扉
    this.grandma.setPose('cheer')
    const D = K.DAWN_DOOR
    this.door = rt.chrono.slit(D.pos.clone(), { tone: 'dawn', width: D.width, height: D.height, normal: D.normal.clone() })
    this.door.setOpen(1)
    void rt.cinematic({ look: D.pos.clone(), from: v(4, 13, -4), inSec: 1.6, hold: Infinity, outSec: 1.0, fov: 56, marker: { pos: D.pos.clone(), label: '光の扉', color: '#ffd76a' } })
    await this.talk(rt, this.lines('dawn_door'))
    rt.endCinematic(true)
    rt.setControlLocked(false)
    // 裏側へ（チャンダといっしょに。出ると上の台の扉の前へ）
    this.chanda.setPose('idle')
    await this.ura.run(rt, { ally: this.chanda, exitTo: { pos: URA_EXIT.clone(), yaw: -Math.PI / 2 } })
    if (this.clock.dead) return
    // もどってきた：上の台
    rt.claw.reset()
    this.chanda.root.position.copy(NPC.chanda.altar.pos)
    this.chanda.root.rotation.y = NPC.chanda.altar.yaw
    this.chanda.setBlade('broken')
    this.chanda.setPose('kneel')
    this.door?.close()
    this.door = null
    this.sc.arun.setGlow(1)
    this.grandma.setPose('cane')
    rt.story.set('v7_heart1', true)
    rt.save('altar')
    this.busy = false
    await this.runAfter(rt)
  }

  // ================================================================ 場面：900 本の筋・最後の光・別れ

  private async runAfter(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    const curtain = this.curtain as Curtain
    if (curtain.covered) await curtain.set(false, 1.0, '#fff6dc')
    this.chanda.setBlade('broken')
    this.chanda.setPose('laugh')
    const afterFrom = v(18.4, 11.0, -4.6)
    void rt.cinematic({ look: this.arunLook(afterFrom), from: afterFrom, inSec: 1.2, hold: Infinity, outSec: 1.0, fov: 46 })
    const p = this.talk(rt, this.lines('after_back'))
    await this.clock.wait(5)
    this.sc.arun.setScars(1)
    await p
    // アルンにひび → 最後の光が七つのつぶで小さなかけらへ → 土へ
    this.sc.arun.crack()
    rt.shake(0.5)
    await this.talk(rt, this.lines('after_crack'))
    // かけらができる所：西の入口の外から、部屋の中のアルンの前（動くかけらを追うと、壁や土の中から光線を飛ばしてカメラがつぶれるので、決まった所を見る）
    void rt.cinematic({ look: v(23.4, 10.6, -3.6), from: v(19.2, 11.6, -2.9), inSec: 1.0, hold: Infinity, outSec: 1.2, fov: 50 })
    const shard = this.sc.arun.releaseShard({ to: K.SHARD_GROUND.clone() })
    await this.clock.wait(3.6)
    this.sc.arun.setDead()
    // かけらが土の庭へ落ちていく（庭の南西から）
    await this.clock.wait(0.3)
    void rt.cinematic({ look: K.SHARD_GROUND.clone().add(v(0.8, 1.6, -0.8)), from: v(4.2, 3.4, 19.6), inSec: 0.8, hold: Infinity, outSec: 1.2, fov: 50 })
    await shard
    await this.talk(rt, this.lines('after_shard'))
    // 刃のかけらを宝の箱へ
    this.chanda.setPose('walk')
    await this.walker.walkTo(this.chanda, [TREASURE_BOX.clone().add(v(0, 0, 1.0))], 2.0, TREASURE_BOX)
    this.chanda.setPose('kneel')
    void rt.cinematic({ look: TREASURE_BOX.clone().setY(TREASURE_BOX.y + 0.6), from: v(19.6, 11.2, -6.4), inSec: 1.0, hold: Infinity, outSec: 1.0, fov: 46 })
    await this.clock.wait(1.0)
    this.chanda.setBlade('none')
    this.chanda.setPose('idle')
    this.walker.face(this.chanda, rt.player.position)
    await this.talk(rt, this.lines('after_box'))
    rt.endCinematic()
    rt.story.set('v7_khmer_done', true)
    rt.save('altar')
    rt.oreGlow(2)
    await this.talk(rt, this.lines('after_pull'))
    this.chanda.setPose('wave')
    rt.setControlLocked(false)
    this.busy = false
    this.openRing(rt)
  }

  private openRing(rt: StageRuntime): void {
    if (this.ringOpen) return
    this.ringOpen = true
    rt.rift.openAt(RETURN_RING.clone(), eraTintHex(2086), 1.9, 1.0)
  }

  private leave(rt: StageRuntime): void {
    if (this.leaving) return
    this.leaving = true
    const r = rt.travel({ to: '2086', cause: 'return', spawn: 'v7_from_1186' })
    if (!r.ok) {
      this.leaving = false
      rt.hud.toast(r.reason ?? 'まだ帰れない', 2.4)
    }
  }

  // ================================================================ 毎フレーム

  update(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    this.clock.update(dt)
    // チャンダ：話している・待っている間は、歩きを止めて（道の続きはそのまま）、ネクマックスの方を向く
    const holdChanda = (this.chandaTalking > 0 || this.chandaWaiting) && !this.ura.active
    this.chandaPos.copy(this.chanda.root.position)
    const chandaYaw = this.chanda.root.rotation.y
    this.walker.update(dt)
    if (holdChanda) {
      this.chanda.root.position.copy(this.chandaPos)
      this.chanda.root.rotation.y = chandaYaw
      this.walker.turnToward(this.chanda, rt.player.position, dt, 6)
      if (this.chanda.pose === 'walk') {
        this.chandaWasWalking = true
        this.chanda.setPose('idle')
      }
    } else if (this.chandaWasWalking) {
      this.chandaWasWalking = false
      if (this.walker.speedOf(this.chanda) > 0) this.chanda.setPose('walk')
    }
    // 池の象：乗るまで乗り場で待ち、乗っていなければ先へ行かない
    const baray = this.sc.elephant.baray
    this.ferry.update(dt, baray.walker, this.sc.rider.riding === baray.deck)
    // 渡し板：象が乗り場で池の方を向いて待っている間だけ
    {
      const h = baray.walker.heading
      let dy = Math.atan2(-h.x, -h.z) - baray.group.rotation.y
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      this.sc.dockPlank.set(this.ferry.state === 'dock' && Math.abs(dy) < 0.06)
    }
    this.sc.update(dt, rt.playTime, rt.camera)
    const riding = this.sc.carryPlayer(rt.player, Math.hypot(frame.move.x, frame.move.y) > 0.1)
    this.fallGuard(rt, riding)
    this.fence?.update(dt, rt.player)
    this.ura.update(dt, frame, rt)
    if (!this.ura.active) rt.combat.passive = this.busy || rt.talking || rt.inCinematic
    const step = this.step(rt)
    const f = this.f(rt)
    // 止められる物（いま止めて意味のある物だけ狙える）
    this.updateFreezables(rt, step)
    // 村の人の吹き出し（夜・裏側・場面の間は黙る）
    this.mobs?.update(dt, rt, khmerMobPhase(step, this.ballGiven), this.busy || this.ura.active)
    // チャンダについて行く（ついてこなければ、止まって待って呼ぶ）→ 上の台でおばあさん
    this.leadWait(dt, rt, step === 'meet' && this.meet === 'follow' && !this.busy)
    if (step === 'meet' && this.meet === 'follow' && !this.busy && this.chanda.root.position.distanceTo(NPC.chanda.altar.pos) < 3) {
      // 上の台に上がった（大階段のいちばん上の段からでも、チャンダのそばなら）
      const p = rt.player.position
      if (this.onTop(rt) || (p.y > K.TOP_Y - 1.5 && p.distanceTo(this.chanda.root.position) < 5)) void this.runAltar(rt)
    }
    // 鏡：塔に近づいたら一言（チャンダが話す塔は、チャンダがそばへ来て、止まってから）
    if (step === 'mirrors' && !this.busy) {
      this.nearTower = this.towerNear(rt.player.position)
      const id = this.nearTower
      if (id && !f(MIRROR_FLAGS[id])) {
        // 北：象のりばでは道を見せる演出（dock_look）があるので、池へ出てから
        if (id === 'n') {
          if (this.northRoute(rt) !== 'dock') void this.talkOnce(rt, 'tower_n_near')
        }
        else if (id === 'e' && this.sc.turntable.solved) this.told.add('tower_e_near')
        else if (this.chandaAt(rt, id === 'e' ? NPC.chanda.tower_e : NPC.chanda.tower_s, id === 'e' ? K.TURNTABLE : towerPoint(TOWERS.s, 9, 0, 0))) void this.talkOnce(rt, `tower_${id}_near`)
      }
      // 象のりばへ来たら、北の塔への道を見せる（1 回）
      if (!f(MIRROR_FLAGS.n) && !this.told.has('dock_look') && Math.hypot(rt.player.position.x - DOCK_TOP.x, rt.player.position.z - DOCK_TOP.z) < 9 && !rt.talking) void this.runDockLook(rt)
    }
    // 夜：のぼっている間、上の台に着いたら
    if (step === 'night' && this.night === 'defend') this.chandaFight(dt, rt)
    // 夜：トワがくずした段から落ちてくる石は、体に当たったら軽く吹っ飛ばす
    if (step === 'night' && (this.night === 'climb' || this.night === 'defend') && !this.busy) this.stoneHits(rt)
    // トワが下がる
    if (this.towaRetreat >= 0) {
      this.towaRetreat += dt
      this.towa.root.position.y = TOWA_NIGHT.y + this.towaRetreat * this.towaRetreat * 3
      this.towa.root.position.z = TOWA_NIGHT.z - this.towaRetreat * 4
      if (this.towaRetreat > 3) {
        this.towaRetreat = -1
        this.showTowa(false)
      }
    }
    // 帰りの光の輪
    if (this.ringOpen && !this.busy && !rt.talking && rt.player.position.distanceTo(RETURN_RING) < 6) void this.talkOnce(rt, 'return_ring')
    if (this.ringOpen && !this.leaving && rt.player.position.distanceTo(RETURN_RING) < 1.3) this.leave(rt)
  }

  /**
   * チャンダがその塔のそばへ来て、止まっているか（まだなら、歩いて来させる）。
   * 遠くから話しかけない：着いて、ネクマックスが近くにいるときに true
   */
  private chandaAt(rt: StageRuntime, spot: Spot, face: THREE.Vector3): boolean {
    const c = this.chanda.root.position
    if (c.distanceTo(spot.pos) > 1.5) {
      if (this.walker.speedOf(this.chanda) === 0) {
        this.chanda.setPose('walk')
        void this.walker.walkTo(this.chanda, [spot.pos], 3.4, face).then(() => this.chanda.setPose('idle'))
      }
      return false
    }
    return this.walker.speedOf(this.chanda) === 0 && c.distanceTo(rt.player.position) < 14
  }

  /** 案内のとちゅう：ネクマックスが遠くなったら止まって待ち、しばらくしたら呼ぶ。近づいたら歩きだす */
  private leadWait(dt: number, rt: StageRuntime, leading: boolean): void {
    if (!leading) {
      this.chandaWaiting = false
      return
    }
    const d = this.chanda.root.position.distanceTo(rt.player.position)
    if (!this.chandaWaiting && d > LEAD.wait && this.walker.speedOf(this.chanda) > 0) {
      this.chandaWaiting = true
      this.chandaWaitT = 0
      this.chandaCallT = 0
    } else if (this.chandaWaiting && d < LEAD.go) this.chandaWaiting = false
    if (!this.chandaWaiting) return
    this.chandaWaitT += dt
    this.chandaCallT -= dt
    if (this.chandaWaitT > LEAD.callAfter && this.chandaCallT <= 0 && !rt.talking) {
      this.chandaCallT = LEAD.callEvery
      this.chanda.setPose('wave')
      void this.clock.wait(1.6).then(() => {
        if (this.chanda.pose === 'wave') this.chanda.setPose('idle')
      })
      rt.say('チャンダ', this.lines('chanda_call')[0].text, 2.6)
    }
  }

  /** 象のりば：北の塔への道を見せる（象に乗って → 池のまん中の家 → 北の塔） */
  private async runDockLook(rt: StageRuntime): Promise<void> {
    this.told.add('dock_look')
    const house = WATER_HOUSES.find((h) => h.id === 'h3') as (typeof WATER_HOUSES)[number]
    const houseAt = v(house.x, house.floorY + 1.0, house.z)
    const from = v(DOCK_TOP.x + 1.4, DOCK_TOP.y + 3.2, DOCK_TOP.z + 4.5)
    void rt.cinematic({ look: houseAt, from, lookTo: v(TOWERS.n.x, TOWERS.n.baseY + 5, TOWERS.n.z), panSec: 4.5, inSec: 1.0, hold: Infinity, outSec: 1.0, fov: 46, marker: { pos: houseAt.clone().setY(houseAt.y + 1.6), label: '池のまん中の家', color: '#ffd76a' } })
    await this.talk(rt, this.lines('dock_look'))
    rt.endCinematic()
  }

  /**
   * 水に落ちたら、すぐもどす（池の底には当たり判定が無い）。少し前まで象の背中にいたら、その背中へ。
   * それ以外は、最後に立っていた、動かない地面へ。落ちた所のもどし先（player の killY）も毎フレームここにそろえる
   * （シェルの「最後に立っていた所」は、象の背中だと、象が先へ行ったあとの空中になり、落ちつづけてしまう）
   */
  private fallGuard(rt: StageRuntime, riding: ReturnType<KhmerScene['carryPlayer']>): void {
    if (this.ura.active) return
    const pl = rt.player
    const p = pl.position
    const el = riding ? (this.sc.elephants.list.find((e) => e.deck === riding) ?? null) : null
    if (el) {
      this.rideEl = el
      this.rideT = rt.playTime
    } else if (pl.grounded && !pl.isExternal && p.y > K.WATER_Y + 0.25 && !this.sc.bodies.kinematics.some((k) => k.enabled && k.supports(p, 0.2, 0.4))) this.safe.copy(p)
    const back = this.rideEl && rt.playTime - this.rideT < 8 && this.rideEl.deckTop.distanceTo(p) < 16 ? this.rideEl : null
    if (back) this.fallTo.copy(back.deckTop).setY(back.deckTop.y + 0.08)
    else this.fallTo.copy(this.safe)
    pl.setCheckpoint(this.fallTo)
    if (pl.isExternal || this.busy) return
    if ((p.y < SINK_Y && !pl.grounded) || p.y < K.WATER_Y - 0.75) {
      rt.claw.reset()
      pl.teleport(this.fallTo.clone().setY(this.fallTo.y + (back ? 0 : 0.3)))
      rt.shake(0.15)
    }
  }

  private updateFreezables(_rt: StageRuntime, step: KhmerStep): void {
    const tt = this.sc.turntable
    for (const { fz, t } of this.fzTargets) {
      let on = fz.canFreeze()
      if (fz.id === 'khmer_turntable') on = on && step === 'mirrors' && !tt.solved
      else if (fz.id.startsWith('khmer_stone_south')) on = on && step === 'mirrors'
      else on = on && step === 'night'
      t.enabled = on
    }
  }

  /**
   * 夜：落ちてくる石（止めていない・落ちている最中）が、本当にネクマックスの体に重なったら、
   * 上から落ちてくる間は、石からネクマックスへの向きに軽く吹っ飛ばす（体力は 1 へるが、最後の 1 は残す。無敵時間はシェル）。
   * 下に着いて段の下へすべり落ちていく間は、押しのけるだけ。石の上に乗っているとき（石が足の下）は当たらない
   */
  private stoneHits(rt: StageRuntime): void {
    const P = rt.player.position
    for (const st of this.sc.stairs.stones) {
      const L = st.logic
      if (!L.active || L.frozen || L.phase !== 'fall' || L.resting) continue
      // 高さ：石が足もとより上・頭より下にかかっている
      if (L.pos.y - L.half > P.y + 1.0 || L.pos.y + L.half < P.y + 0.2) continue
      const dx = P.x - L.pos.x
      const dz = P.z - L.pos.z
      if (Math.hypot(dx, dz) > STONE_HIT_R) continue
      // 真上から落ちてきたときは、段の下（西）へ
      const dir = Math.hypot(dx, dz) > 0.08 ? this.hitDir.set(dx, 0, dz) : this.hitDir.set(-1, 0, 0)
      dir.normalize()
      if (L.pos.y > L.path[1].y + 0.05) {
        // 上から落ちてくる石（トワの攻撃）：当たり
        rt.combat.hurtPlayer(1, dir, STONE_KNOCK, false)
        rt.shake(0.3)
      } else if (!rt.player.isExternal) {
        // 下に着いたあと、段の下へすべり落ちていく石：体を押しのけるだけ（すりぬけない。体力はへらない）
        rt.player.burstMove(dir.x * STONE_SHOVE, dir.z * STONE_SHOVE, 0.12)
      }
    }
  }

  /** 夜の防衛：チャンダも、近くの影を刃ではらう（ときどき） */
  private chandaFight(dt: number, rt: StageRuntime): void {
    this.chandaHitT -= dt
    let near: EnemyHandle | null = null
    let nd = 3.2
    for (const h of rt.combat.alive('night')) {
      const d = h.pos.distanceTo(this.chanda.root.position)
      if (d < nd) {
        nd = d
        near = h
      }
    }
    if (near) {
      this.walker.turnToward(this.chanda, near.pos, dt, 8)
      if (this.chandaHitT <= 0) {
        this.chandaHitT = 2.8
        this.chanda.setPose('guard')
        rt.combat.kill(near)
        if (Math.random() < 0.5) rt.say('チャンダ', 'アハハ！ えいっ！', 1.6)
      }
    }
  }

  /** 近い塔の仕掛けをこえたか（北：島の上・南：上の台の高さ）。目標の書き分け用 */
  private towerClimbed(rt: StageRuntime): boolean {
    const p = rt.player.position
    const id = this.nearTower
    if (id === 'n') {
      const I = K.ISLAND
      return p.x > I.x0 && p.x < I.x1 && p.z > I.z0 && p.z < I.z1
    }
    if (id === 's') return p.y > TOWERS.s.baseY + SMALL_TOWER.top - 1.5
    return true
  }

  private towerNear(p: THREE.Vector3): TowerId | null {
    // 回る鏡の台のそば（南の塔の階段の下の円とも重なるので、先に見る。でないと台の前で「南の塔」の目標が出る）
    if (Math.hypot(p.x - K.TURNTABLE.x, p.z - K.TURNTABLE.z) < 7) return 'e'
    // いちばん近い塔（塔の中心から 12m・階段の下から 9m の中）
    let best: TowerId | null = null
    let bd = 0
    for (const id of TOWER_IDS) {
      const t = TOWERS[id]
      const base = towerPoint(t, SMALL_TOWER.tiers[2].half + SMALL_TOWER.stairs.run * SMALL_TOWER.stairs.segs, 0, 0)
      const d = Math.min(Math.hypot(p.x - t.x, p.z - t.z) - 12, Math.hypot(p.x - base.x, p.z - base.z) - 9)
      if (d < bd) {
        best = id
        bd = d
      }
    }
    if (best) return best
    // 北の塔：水の上の村の東・象のりば・池の中
    if (p.z < -45 && p.x > -42) return 'n'
    if (Math.hypot(p.x - DOCK_TOP.x, p.z - DOCK_TOP.z) < 12) return 'n'
    if (Math.hypot(p.x - K.TURNTABLE.x, p.z - K.TURNTABLE.z) < 9) return 'e'
    return null
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    const cam = rt.camera.position
    // 裏側にいる間のチャンダは UraBattle が動かす
    if (!this.ura.active) this.chanda.update(dt, this.chandaTalking > 0 || this.chandaWaiting ? 0 : this.walker.speedOf(this.chanda))
    this.grandma.update(dt, this.walker.speedOf(this.grandma))
    if (this.towa.root.visible) {
      this.towaFloat += dt
      if (this.towaRetreat < 0 && this.towaShown) this.towa.root.position.y = TOWA_NIGHT.y + Math.sin(this.towaFloat * 1.3) * 0.18
      this.walker.turnToward(this.towa, rt.player.position, dt, 3)
      this.towa.update(dt, 0)
      this.lamp.update(dt, t)
    }
    for (const v0 of this.villagers) {
      const far = v0.ch.root.position.distanceToSquared(cam) > 60 * 60
      v0.ch.root.visible = !far && this.time !== 'night'
      if (!far) v0.ch.update(dt, 0)
    }
    this.mobs?.render(dt)
    this.ura.animate(dt, t)
  }

  // ================================================================ F

  interact(rt: StageRuntime): boolean {
    if (this.ura.interact(rt)) return true
    if (this.busy) return false
    const step = this.step(rt)
    const p = rt.player.position
    const near = (o: THREE.Object3D, r = 2.4) => o.position.distanceTo(p) < r && Math.abs(o.position.y - p.y) < 1.5
    if (step === 'meet' && this.meet === 'find' && near(this.chanda.root, 3)) {
      void this.runMeet(rt)
      return true
    }
    if (step === 'meet' && this.meet === 'follow' && near(this.grandma.root, 3) && this.onTop(rt)) {
      void this.runAltar(rt)
      return true
    }
    if (step === 'mirrors') {
      const id = this.standNear(rt)
      if (id && canPlaceMirror(id, this.f(rt), this.sc.turntable.solved)) {
        void this.placeMirror(rt, id)
        return true
      }
      if (id === 'e' && !this.sc.turntable.solved && !this.f(rt)('v7_mirror_e')) {
        rt.hud.toast('台がまだ光っていない。下の回る鏡の台を止めて、光を通そう', 3)
        return true
      }
      if (near(this.grandma.root, 3)) {
        void this.talk(rt, this.lines('grandma_altar_more'))
        return true
      }
      if (near(this.chanda.root, 2.6)) {
        void this.talk(rt, [{ speaker: 'チャンダ', text: `のこりは、${mirrorsLeft(this.f(rt)).map((id) => ({ n: '北', e: '東', s: '南' })[id]).join('と')}の塔！ アハハ、がんばって！` }])
        return true
      }
    }
    // まりを子どもに返す
    const kid = this.ballKid(rt)
    if (kid) {
      this.giveBall(rt, kid.ch)
      return true
    }
    // 村の人（話しかけた人は、ネクマックスの方を向く）
    if (this.mobs?.interact(rt, (vv) => this.walker.face(vv.ch, p))) return true
    if (this.ringOpen && rt.player.position.distanceTo(RETURN_RING) < 2.6) {
      this.leave(rt)
      return true
    }
    return false
  }

  /** まりを持って、子ども（kid1）のそばにいる（F で返せる） */
  private ballKid(rt: StageRuntime): KhmerVillager | null {
    if (this.ballGiven || rt.claw.wire.phase !== 'carrying' || rt.claw.wire.target?.id !== KHMER_BALL_ID) return null
    const kid = this.villagers.find((x) => x.id === 'kid1')
    const p = rt.player.position
    return kid && kid.ch.root.position.distanceTo(p) < 3 && Math.abs(kid.ch.root.position.y - p.y) < 1.5 ? kid : null
  }

  private giveBall(rt: StageRuntime, kid: PersonCharacter): void {
    this.ballGiven = true
    rt.claw.reset()
    const def = this.sc.claw.targets.find((t) => t.id === KHMER_BALL_ID)
    const mv = this.sc.claw.movables.find((m) => m.def.id === KHMER_BALL_ID)
    if (def) def.enabled = false
    if (mv) mv.object.visible = false
    this.kidBall = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshStandardMaterial({ color: '#d8b060', roughness: 0.85 }))
    this.kidBall.position.copy(kid.root.position).add(v(0.4, 0.17, 0.3))
    this.sc.root.add(this.kidBall)
    kid.setPose('cheer')
    void this.talk(rt, this.lines('kids_ball_back'))
  }

  // ================================================================ 案内・目標

  hints(rt: StageRuntime): Hint[] | null {
    const u = this.ura.hints(rt)
    if (u) return u
    if (this.busy) return null
    const step = this.step(rt)
    const p = rt.player.position
    const near = (o: THREE.Object3D, r: number) => o.position.distanceTo(p) < r && Math.abs(o.position.y - p.y) < 1.5
    if (step === 'meet' && this.meet === 'find' && near(this.chanda.root, 3)) return [{ key: 'F', label: '話す' }]
    if (step === 'mirrors') {
      const id = this.standNear(rt)
      if (id && canPlaceMirror(id, this.f(rt), this.sc.turntable.solved)) return [{ key: 'F', label: '鏡を立てる' }]
    }
    if (this.ringOpen && p.distanceTo(RETURN_RING) < 2.6) return [{ key: 'F', label: '帰る' }]
    if (this.ballKid(rt)) return [{ key: 'F', label: 'まりを返す' }]
    return this.mobs?.hints(rt) ?? null
  }

  objective(rt: StageRuntime): { title: string; sub: string } {
    const u = this.ura.objective(rt)
    if (u) return u
    const step = this.step(rt)
    const nr = step === 'mirrors' && this.nearTower === 'n' ? this.northRoute(rt) : null
    const northRide = nr === 'riding' ? (this.ferry.state === 'far' ? 'arrived' : 'riding') : nr === 'h2' || nr === 'h3' || nr === 'h4' ? 'houses' : nr === 'dock' ? 'dock' : undefined
    return khmerObjective(step, this.f(rt), { meet: this.meet, night: this.night, turntableSolved: this.sc.turntable.solved, near: this.nearTower, climbed: this.towerClimbed(rt), northRide })
  }

  objectiveTarget(rt: StageRuntime): THREE.Vector3 | null {
    // いちばん近い目印へ（鏡の段は塔が三つあるので、近い塔を指す）
    const m = this.objectiveMarkers(rt)
    if (!m || !m.length) return null
    const p = rt.player.position
    let best = m[0]
    for (const x of m) if (x.pos.distanceToSquared(p) < best.pos.distanceToSquared(p)) best = x
    return best.pos
  }

  objectiveMarkers(rt: StageRuntime): readonly ObjectiveMark[] | null {
    const out = this.marks
    out.length = 0
    if (this.ura.active) return this.ura.markers(rt)
    const step = this.step(rt)
    const head = (o: THREE.Object3D, h = 1.9) => o.position.clone().setY(o.position.y + h)
    switch (step) {
      case 'meet':
        if (this.meet === 'find') out.push({ pos: head(this.chanda.root, 1.6), label: 'チャンダ' })
        else if (this.meet === 'follow') out.push({ pos: this.onTop(rt) ? head(this.grandma.root, 1.7) : head(this.chanda.root, 1.6), label: this.onTop(rt) ? 'おばあさん' : 'チャンダ' })
        break
      case 'mirrors':
        for (const id of mirrorsLeft(this.f(rt))) {
          if (id === 'e' && !this.sc.turntable.solved) out.push({ pos: this.sc.turntable.point.clone().setY(2.6), label: '回る鏡の台' })
          else if (id === 'n' && this.northMark(rt)) out.push(this.northMark(rt) as ObjectiveMark)
          else out.push({ pos: this.sc.mirrors[id].top.clone().setY(this.sc.mirrors[id].top.y + 1.4), label: `${({ n: '北', e: '東', s: '南' } as const)[id]}の塔の台` })
        }
        break
      case 'night':
        if (this.night === 'climb') out.push({ pos: v(K.STAIRS.x1, K.TOP_Y + 1.6, -4), label: '上の台' })
        break
      case 'return':
        if (this.ringOpen) out.push({ pos: RETURN_RING.clone().setY(RETURN_RING.y + 2.2), label: '光の輪' })
        break
    }
    return out
  }

  /** 北の塔への道の、次の目印（島に着いたら null：塔の台を指す） */
  private northMark(rt: StageRuntime): ObjectiveMark | null {
    const r = this.northRoute(rt)
    const hook = (id: string, label: string): ObjectiveMark => ({ pos: HOOK(id).point.clone().setY(HOOK(id).point.y + 0.6), label })
    switch (r) {
      case 'dock':
        return { pos: DOCK_TOP.clone().setY(DOCK_TOP.y + 1.2), label: '象のりば' }
      case 'riding':
        // 象の上：行く先の池のまん中の家 → 着いたら、その家の軒の金具
        if (this.ferry.state === 'far') return hook('h3s', '家の軒の金具')
        {
          const h = WATER_HOUSES.find((x) => x.id === 'h3') as (typeof WATER_HOUSES)[number]
          return { pos: v(h.x, h.floorY + 3.6, h.z), label: '池のまん中の家' }
        }
      case 'h2':
        return hook('h3w', '家の軒の金具')
      case 'h3':
        return hook('h4w', '家の軒の金具')
      case 'h4':
        return { pos: v(18.2, 3.2, -66), label: '島の柱の金具' }
      default:
        return null
    }
  }

  /** 北の塔への道のどこにいるか（目標の文と目印） */
  private northRoute(rt: StageRuntime): 'dock' | 'riding' | 'h2' | 'h3' | 'h4' | 'island' | 'water' {
    const p = rt.player.position
    const I = K.ISLAND
    if (p.x > I.x0 && p.x < I.x1 && p.z > I.z0 && p.z < I.z1) return 'island'
    if (this.sc.rider.riding === this.sc.elephant.baray.deck) return 'riding'
    for (const id of ['h4', 'h3', 'h2'] as const) {
      const h = WATER_HOUSES.find((x) => x.id === id) as (typeof WATER_HOUSES)[number]
      if (Math.abs(p.x - h.x) < h.w / 2 + h.porch + 0.4 && Math.abs(p.z - h.z) < h.d / 2 + h.porch + 0.4 && p.y > h.floorY - 0.5) return id
    }
    // 池の上（板の道・ほかの家）にいるときは、象のりばへは呼びもどさない
    if (p.z < -45 && p.y > 0.8) return 'water'
    return 'dock'
  }

  music(rt: StageRuntime): MusicId | null {
    if (this.ura.active) return this.ura.music ?? 'ura'
    const step = this.step(rt)
    if (step === 'night') return 'ruins2028'
    if (step === 'ura' || step === 'after' || step === 'return') return 'dawn'
    return 'khmer'
  }

  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    if (e.kind === 'connected' && e.target.id === KHMER_BALL_ID && !this.ballGiven) rt.hud.toast('子どもたちのところへ持っていこう（F で返す）', 2.6)
  }

  /** 水などに落ちて、シェルが戻したとき：もどし先は fallGuard がそろえている（象の背中か、動かない地面） */
  onRespawn(rt: StageRuntime): void {
    if (this.ura.active) return
    rt.claw.reset()
  }

  // ================================================================ 開発用

  /** いまの段階の「プレイヤーがやること」を片づけて先へ（リードの通しの確認用） */
  devSkip(rt: StageRuntime): void {
    const step = this.step(rt)
    switch (step) {
      case 'arrive':
        if (!this.busy) void this.runArrive(rt)
        break
      case 'meet':
        if (this.meet === 'find' && !this.busy) void this.runMeet(rt)
        else if (this.meet === 'follow' && !this.busy) {
          rt.claw.reset()
          rt.player.teleport(SPAWNS.altar.pos.clone(), SPAWNS.altar.facing)
          this.walker.stop(this.chanda)
          this.chanda.root.position.copy(NPC.chanda.altar.pos)
          void this.runAltar(rt)
        }
        break
      case 'mirrors': {
        if (this.busy) break
        const left = mirrorsLeft(this.f(rt))
        if (left.includes('e')) this.sc.turntable.setSolved(true)
        for (const id of left.slice(0, -1)) {
          this.sc.placeMirror(id, true)
          rt.story.set(MIRROR_FLAGS[id], true)
        }
        void this.placeMirror(rt, left[left.length - 1])
        break
      }
      case 'night':
        if (this.night === 'climb') {
          rt.claw.reset()
          rt.player.teleport(SPAWNS.altar.pos.clone(), SPAWNS.altar.facing)
        } else if (this.night === 'defend') {
          this.wavesSkipped = true
          for (const h of rt.combat.alive('night')) rt.combat.kill(h)
        }
        break
      case 'ura':
        if (this.ura.active) this.ura.devSkip(rt)
        break
      case 'after':
        break
      case 'return':
        this.leave(rt)
        break
    }
  }

  debug(): Record<string, unknown> {
    const rt = this.rt
    return {
      step: rt ? this.step(rt) : this.startStep,
      meet: this.meet,
      night: this.night,
      busy: this.busy,
      time: this.time,
      turntable: { angle: +this.sc.turntable.angle.toFixed(2), correct: +this.sc.turntable.correctAngle.toFixed(2), solved: this.sc.turntable.solved },
      collapsed: this.sc.stairs.collapsedList,
      ring: this.ringOpen,
      near: this.nearTower,
      ferry: this.ferry.state,
      riding: this.sc.rider.riding === this.sc.elephant.baray.deck ? 'baray' : this.sc.rider.riding ? 'road' : null,
      chandaHold: this.chandaTalking > 0 ? 'talk' : this.chandaWaiting ? 'wait' : null,
      fence: this.fence?.closed ?? false,
      mobs: this.mobs?.debugInfo() ?? null,
      ...(this.ura?.debug() ?? {}),
    }
  }

  dispose(): void {
    this.clock.dispose()
    this.walker.clear()
    this.curtain?.dispose()
    this.mobs?.dispose()
    this.mobs = null
    this.fence?.dispose()
    this.fence = null
    this.maps?.dispose()
    this.ura?.dispose()
    this.sc?.dispose()
    this.lamp?.dispose()
    for (const ch of [this.chanda, this.grandma, this.towa, ...this.villagers.map((x) => x.ch)]) ch?.dispose()
    this.rt = null
  }
}

/** シェル（registry.ts）から呼ぶ */
export function createKhmerStage(): KhmerStage {
  return new KhmerStage()
}

