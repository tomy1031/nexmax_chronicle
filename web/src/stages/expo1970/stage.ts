// 1970年 千里丘陵・万国博覧会（架空の会場）のステージ。中盤 10章（docs/中盤シナリオとワールド構成_v1.md §3）。
// セミオープン：中央広場から、電気の館（東）・空中ロープウェイ（西）・日本庭園の竹林（南西）・工事中の区画（北東）・
// 未来の塔（北）へロード無しで行き来できる。進み方はフラグだけで決まる（story1970.ts）。
//   到着 → 広場の欠け（戦闘の基本）→ ミチ → 作業台 → 部品 3 つ（順番自由。振り子・飛びつき・群れとの戦い）→
//   はじくNMClaw → 塔の壁を割って外側の金具で登る → 錨の番人ミライ号 → 錨の糸をほどく（ミチの合図）→ 別れ → 2086年へ
// 寄り道：時のかけら 5 個・迷子の子・ロープウェイの係員の帽子。来場者の吹き出し（mob_lines_1970.json）。
// 敵「欠け」は可能性を吸われたものの抜け殻。倒すと吸われていたものが光になって持ち主へ帰る（ReturnLights）。
// 錨をほどくと、忘れられていた先輩・北條が戻り、展示案内の設計者の名前も戻る（§1.5・§3.2）。
import * as THREE from 'three'
import type { SkyPalette } from '../../render/sky'
import type { WireEvent } from '../../player/clawLogic'
import type { ActionFrame } from '../../player/inputActions'
import type { Hint } from '../../ui/hud'
import { equipFromFlags } from '../../player/equipment'
import { ERA_EXPO, eraTintHex } from '../../core/eras'
import { DialogueDB } from '../../core/dialogue'
import type { DialogueLine } from '../../game/dialogueQueue'
import type { ObjectiveMark, SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageWorld } from '../../game/stage'
import type { EnemyHandle } from '../../combat/combatSystem'
import type { EnemyKind } from '../../combat/combatLogic'
import type { EnemyStyle } from '../../combat/enemyModels'
import { MobTalk, type MobSpeakerDef } from '../../world/mobTalk'
import type { MobTable } from '../../world/mobTalkLogic'
import { BlackRing } from '../edo1726/blackRing'
import { buildExpoScene, CLAW_IDS, type CrackedWall, type ExpoScene } from './scene1970'
import { PARTS, PART_IDS, SHARDS, SHARD_IDS, SPAWNS, X, type PartId, type ShardId } from './layout'
import { createMichi, type MichiCharacter } from './michi'
import { Visitors, type VisitorDef } from './visitors1970'
import { AnchorThread, Debris, KakeRift, Pickup, Plaque, ReturnLights, buildMiraiFigure } from './props1970'
import { EXPO_PARTS, UnravelLogic, bossWaves, expoObjective, expoSpawn, expoStep, michiSpot, partsCount, shardCount, type ExpoStep } from './story1970'
import data1970 from './dialogue_1970.json'
import mobLines from './mob_lines_1970.json'

const lines = new DialogueDB(data1970)
const MOB_TABLE = mobLines as unknown as MobTable

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 夏の昼の空（からっと晴れて、地平が白い） */
const SKY_1970: SkyPalette = {
  zenith: '#1a62d0',
  upper: '#3f92ec',
  horizon: '#c4e2f8',
  warm: '#ffe4b8',
  ground: '#7a6a4c',
  haze: '#d8e8f4',
  cloudLit: '#ffffff',
  cloudShade: '#a8b8d0',
}
const SUN_YAW = (-125 * Math.PI) / 180
const SUN_EL = (56 * Math.PI) / 180
const SUN_DIR = new THREE.Vector3(Math.cos(SUN_EL) * Math.cos(SUN_YAW), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(SUN_YAW)).normalize()

/** 欠けの色（1970年：夕焼けのオレンジのひび） */
const KAKE_1970: EnemyStyle = { panel: '#3a2438', trim: '#ff8a3a', eye: '#ffb84a' }
/** 錨の番人ミライ号（欠けに取り込まれた銀の展示ロボット） */
const MIRAI_STYLE: EnemyStyle = { panel: '#dfe4ea', trim: '#ff7a2a', eye: '#ffb030', body: '#7a828e', robot: true }
const BOSS_NAME = '錨の番人　ミライ号'
/** 錨をほどくときの合図のパネル（1726年の水門と同じ形：ネクマックスが支え、ミチが合図する） */
const UNRAVEL_LABELS = { title: '錨の糸', worker: 'ネクマックス', what: ['ほどく', '支えている', 'ほどけた'], watcher: 'ミチ' } as const
const BOSS_HP = 24

/** ミチの立ち位置 */
const MICHI_AT = {
  bench: { pos: X.MICHI_BENCH.clone(), yaw: Math.PI },
  tower: { pos: X.MICHI_SIGNAL.clone(), yaw: 0 },
  farewell: { pos: v(2.4, 0, 8.6), yaw: Math.PI / 2 },
  appear: { pos: v(25, 0, -3), yaw: Math.PI / 2 },
}
/** 展示案内の板と、元に戻ったミライ号（電気の館の入口の前） */
const PLAQUE_AT = v(41.4, 0, -4.4)
const MIRAI_AT = v(41.6, 0, 2.6)
/** 戻ってきた先輩・北條（別れの場面でミチの横） */
const SENIOR_AT = v(3.7, 0, 9.5)
/** 取り戻した光が帰っていく先：展示の多い電気の館・広場の展示台 */
const LIGHT_HOME = { pavilion: v(54, 7, 0), exhibit: v(9, 1.2, -7) }
const MICHI_TO_TOWER = [v(30, 0, -6), v(20, 0, -18), v(6, 0, -24), v(-3.2, 0, -40.5), X.MICHI_SIGNAL.clone()]

type Walker = { path: THREE.Vector3[]; i: number; speed: number; face: number | null; done: (() => void) | null }

export class ExpoStage implements Stage {
  readonly key = '1970' as const
  readonly era = ERA_EXPO
  readonly label = '1970年　千里丘陵・万国博覧会'
  readonly subtitle = '人類の明日が並んだ夏'
  readonly environment: StageEnvironment = {
    sky: SKY_1970,
    sunDir: SUN_DIR,
    sunIntensity: 3.2,
    hemi: { sky: '#cfe6ff', ground: '#8a7a5a', intensity: 0.55 },
    hdri: './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    envIntensity: 0.85,
    fog: { color: SKY_1970.haze, density: 0.0022 },
    grade: { saturation: 1.1, contrast: 1.04 },
  }
  private sc!: ExpoScene
  private michi!: MichiCharacter
  private visitors!: Visitors
  private mobs: MobTalk | null = null
  private ring!: BlackRing
  private thread!: AnchorThread
  private debris!: Debris
  private lights!: ReturnLights
  private plaque!: Plaque
  private mirai!: THREE.Group
  private readonly parts = {} as Record<PartId, Pickup>
  private readonly shards = {} as Record<ShardId, Pickup>
  private readonly rifts: { first: KakeRift; swarm: KakeRift; child: KakeRift; gate: KakeRift } = {} as never
  private startStep: ExpoStep = 'arrive'
  private rt: StageRuntime | null = null
  private from: string | null = null
  private busy = false
  private walker: Walker | null = null
  private readonly timers: Array<{ t: number; done: () => void }> = []
  private stageT = 0
  /** 最初の欠け：何波目か（0：まだ） */
  private fightWave = 0
  private boss: EnemyHandle | null = null
  private bossStarted = false
  private bossWavesDone = 0
  private readonly unravel = new UnravelLogic()
  private ringOpen = false
  private curtain: HTMLDivElement | null = null
  /** 来場者の中の決まった人 */
  private who = { staff: 0, child: 0, mother: 0, father: 0, senior: 0 }
  /** 先輩・北條が戻ってきて、ミチと会った */
  private seniorBack = false
  private childState: 'trapped' | 'walking' | 'home' | 'thanked' = 'trapped'
  private childCried = false
  private staffAsked = false
  private storeHinted = false
  private worldSpawned = false
  private readonly avoid: THREE.Vector3[] = []
  private readonly tmp = new THREE.Vector3()
  private readonly marks: ObjectiveMark[] = []
  private readonly markPool = Array.from({ length: 4 }, () => new THREE.Vector3())
  private readonly frustum = new THREE.Frustum()
  private readonly pm = new THREE.Matrix4()

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    this.from = ctx.from
    this.startStep = expoStep((n) => ctx.story.get(n))
    ctx.progress(0.12, '1970年の会場を準備中…')
    await ctx.yieldFrame()
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    this.sc = await buildExpoScene(ctx.quality, aniso, ctx.progress, ctx.yieldFrame)
    ctx.progress(0.7, '来場者を案内中…')
    await ctx.yieldFrame()
    const root = this.sc.root
    this.michi = (await ctx.loadNpc('michi', 1.56, () => createMichi(1.56))) as MichiCharacter
    if (!('setLight' in this.michi)) Object.assign(this.michi, { setLight() {}, showNotebook() {} })
    root.add(this.michi.root)
    this.visitors = new Visitors(this.visitorDefs(), [
      ...X.COLUMNS.map(([x, z]) => [x, z, 1.3] as [number, number, number]),
      [X.FIRST_FIGHT.x, X.FIRST_FIGHT.z, 3.3],
      [11, 13, 2.7],
      [X.PAVILION.x, X.PAVILION.z, X.PAVILION.r + 0.4],
      // ミチの作業台のひさしの下
      [X.WORKBENCH.x, X.WORKBENCH.z, 4],
    ])
    root.add(this.visitors.group)
    for (const id of PART_IDS) {
      this.parts[id] = new Pickup('part', PARTS[id].pos)
      root.add(this.parts[id].root)
    }
    for (const id of SHARD_IDS) {
      this.shards[id] = new Pickup('shard', SHARDS[id].pos)
      root.add(this.shards[id].root)
    }
    this.rifts.first = new KakeRift(X.FIRST_FIGHT.clone().setY(0.28), 1.1)
    this.rifts.swarm = new KakeRift(PARTS.swarm.pos.clone().setY(0.7), 0.7)
    this.rifts.child = new KakeRift(v(X.CHILD.x - 2.2, 0, X.CHILD.z + 1.4), 0.8)
    this.rifts.gate = new KakeRift(v(0, 0, -37.5), 0.9)
    for (const r of Object.values(this.rifts)) root.add(r.root)
    this.ring = new BlackRing(X.ANCHOR_RING, 15)
    this.thread = new AnchorThread(X.ANCHOR_RING.clone().add(v(0, -3, 0)), X.ANCHOR_KNOT)
    this.debris = new Debris()
    this.lights = new ReturnLights()
    this.plaque = new Plaque()
    this.plaque.root.position.copy(PLAQUE_AT)
    this.plaque.root.rotation.y = Math.PI / 2
    this.mirai = buildMiraiFigure()
    this.mirai.position.copy(MIRAI_AT)
    this.mirai.rotation.y = Math.PI / 2
    this.mirai.visible = false
    root.add(this.ring.mesh, this.thread.root, this.debris.root, this.lights.root, this.plaque.root, this.mirai)
    return { root, colliders: this.sc.colliders, claw: this.sc.claw, lights: this.sc.lights }
  }

  private visitorDefs(): VisitorDef[] {
    const defs: VisitorDef[] = []
    const plaza = { x0: -22, x1: 22, z0: -19, z1: 21 }
    const ids = ['v_couple', 'v_student', 'v_grandpa', 'v_kid', 'v_mother', 'v_reporter']
    for (let i = 0; i < 22; i++) defs.push({ role: 'wander', pos: v(-18 + ((i * 37) % 36), 0, -16 + ((i * 53) % 34)), area: plaza, kid: i % 7 === 3, id: ids[i] })
    for (let i = 0; i < 4; i++) defs.push({ role: 'wander', pos: v(-3 + i * 2, 0, -28 - i * 3), area: { x0: -4, x1: 4, z0: -40, z1: -24 } })
    for (let i = 0; i < 4; i++) defs.push({ role: 'wander', pos: v(30 + i * 3, 0, -8 + i * 5), area: { x0: 27, x1: 43, z0: -12, z1: 14 } })
    for (let i = 0; i < 3; i++) defs.push({ role: 'wander', pos: v(-40 + i * 4, 0, 6), area: { x0: -45, x1: -28, z0: -8, z1: 10 } })
    // 電気の館の列
    for (let i = 0; i < 6; i++) defs.push({ role: 'idle', pos: v(41.2, 0, -6.2 - i * 1.3), yaw: -Math.PI / 2, kid: i === 3 })
    // 案内係・作業員
    defs.push({ role: 'idle', pos: v(28, 0, 2.5), yaw: Math.PI / 2, id: 'v_guide', shirt: '#2a8ad8', pants: '#2a3044', dress: true, hat: 'cap' })
    defs.push({ role: 'idle', pos: v(18.5, 0, -27), yaw: Math.PI / 2, id: 'v_worker', shirt: '#e8c040', pants: '#4a4a52', hat: 'cap' })
    // 係員・迷子の子・親（ステージが動かす）
    this.who.staff = defs.length
    defs.push({ role: 'script', pos: X.ROPE_STAFF.clone(), yaw: Math.PI, shirt: '#e8e4dc', pants: '#2a3a6a', hat: 'none' })
    this.who.child = defs.length
    defs.push({ role: 'script', pos: X.CHILD.clone(), yaw: 0, kid: true, shirt: '#f6d040', pants: '#3a5a8a', hat: 'straw' })
    this.who.mother = defs.length
    defs.push({ role: 'script', pos: X.PARENTS.clone(), yaw: Math.PI * 0.8, shirt: '#d85aa0', dress: true })
    this.who.father = defs.length
    defs.push({ role: 'script', pos: X.PARENTS.clone().add(v(0.9, 0, 0.6)), yaw: Math.PI * 0.9, shirt: '#f4f0e8', pants: '#5a4a3a', hat: 'straw' })
    // 先輩・北條（錨をほどくまで、だれの記憶にもいない）
    this.who.senior = defs.length
    defs.push({ role: 'script', pos: SENIOR_AT.clone(), yaw: -Math.PI / 2, shirt: '#e8eef4', pants: '#2a3a5e', hat: 'cap' })
    return defs
  }

  spawn(id: string | null): SpawnPoint {
    if (id && SPAWNS[id]) return SPAWNS[id]
    return SPAWNS[expoSpawn(this.startStep)] ?? SPAWNS.arrive
  }

  private f(rt: StageRuntime): (n: string) => boolean {
    return (n) => rt.story.get(n)
  }

  private step(rt: StageRuntime): ExpoStep {
    return expoStep(this.f(rt))
  }

  begin(rt: StageRuntime): void {
    this.rt = rt
    const f = this.f(rt)
    const step = this.step(rt)
    const ui = rt.renderer.domElement.ownerDocument.getElementById('ui')
    this.curtain = document.createElement('div')
    this.curtain.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:6;transition:opacity 0.6s;'
    document.body.appendChild(this.curtain)
    // 来場者の吹き出し
    const speakers: MobSpeakerDef[] = []
    const defs = this.visitorDefs()
    defs.forEach((d, i) => {
      if (!d.id) return
      speakers.push({ id: d.id, anchor: (out) => (this.visitors.head(i, out), true), footY: () => 0, range: () => [3.4, 1.8], talkReach: 2.2 })
    })
    this.mobs = new MobTalk({ host: ui, camera: rt.camera, table: MOB_TABLE, speakers, theme: '1970' })
    // 戦闘
    const combat = rt.combat
    combat.enabled = true
    combat.setCheckpoint(rt.player.position, rt.player.facing)
    combat.onEnemyDefeated = (e) => this.onDefeated(e, rt)
    combat.onRespawn = () => {
      // 番人の体力が戻るので、増援の数も戻す
      this.bossWavesDone = 0
    }
    // 拾った物
    for (const id of PART_IDS) {
      if (f(PARTS[id].flag)) this.parts[id].hide()
      this.parts[id].active = f('expo_bench') && !f('impact_claw_got')
    }
    if (f('impact_claw_got')) for (const id of PART_IDS) this.parts[id].hide()
    for (const id of SHARD_IDS) if (f(SHARDS[id].flag)) this.shards[id].hide()
    this.sc.protoArm.visible = !f('impact_claw_got')
    // 壊れる壁
    for (const [w, flag] of [
      [this.sc.walls.tower, 'expo_wall_broken'],
      [this.sc.walls.store, 'expo_shard_store'],
    ] as Array<[CrackedWall, string]>) {
      const broken = flag === 'expo_wall_broken' ? f(flag) : this.storeBroken
      if (broken) this.breakWall(w, rt, true)
      else
        combat.addBreakable({
          id: w.id,
          pos: w.pos,
          radius: w.radius,
          enabled: true,
          onBreak: () => this.onWallBreak(w, rt),
        })
    }
    for (const h of this.sc.towerHooks) h.enabled = f('expo_wall_broken')
    // 錨（黒い輪と糸）
    if (f('expo_anchor_cleared')) {
      this.ring.hide()
      this.thread.setFade(0)
    } else {
      this.ring.appear(true)
      this.thread.setFade(f('expo_boss_down') ? 1 : 0.6)
    }
    this.sc.knot.enabled = step === 'unravel'
    // ミチ
    this.placeMichi(step)
    // 係員の帽子
    if (f('expo_hat_returned')) {
      this.sc.hat.def.enabled = false
      this.sc.hat.object.visible = false
      this.visitors.setHat(this.who.staff, 'staff')
    }
    // 先輩・北條と、元に戻ったミライ号・展示案内の名前
    const cleared = f('expo_anchor_cleared')
    this.visitors.setVisible(this.who.senior, cleared)
    this.seniorBack = f('expo_farewell')
    this.mirai.visible = cleared
    this.plaque.setNamed(cleared)
    // 迷子の子
    if (f('expo_child_saved')) {
      this.childState = 'thanked'
      this.visitors.teleport(this.who.child, X.PARENTS.clone().add(v(-0.8, 0, 0.3)), Math.PI)
    }
    // 敵
    if (step === 'first_fight') this.startFirstFight(rt, true)
    if (f('met_michi') && !f('expo_anchor_cleared')) this.spawnWorld(rt)
    if (step === 'tower' || step === 'unravel') this.spawnTower(rt)
    if (f('expo_farewell')) this.openReturnRing(rt, false)
    rt.save(this.from ? expoSpawn(step) : expoSpawn(step))
    if (rt.params.has('debug')) {
      ;(window as unknown as { __expoDev?: unknown }).__expoDev = {
        tp: (x: number, z: number, y = 0) => rt.player.teleport(new THREE.Vector3(x, y, z)),
        stage: this,
        rt,
      }
    }
  }

  /** 倉庫の壁は、かけらを拾ったら壊れたまま（壁そのもののフラグは持たない） */
  private storeBroken = false

  revealed(rt: StageRuntime): void {
    const step = this.step(rt)
    if (step === 'arrive') void this.runArrival(rt)
    else if (step === 'farewell') void this.runFarewell(rt)
  }

  // ---------------------------------------------------------------- 小さな道具

  private wait(sec: number): Promise<void> {
    return new Promise((r) => this.timers.push({ t: sec, done: r }))
  }

  private walkMichi(path: THREE.Vector3[], speed: number, face: number | null = null): Promise<void> {
    this.walker?.done?.()
    return new Promise((done) => {
      this.walker = { path: path.map((p) => p.clone()), i: 0, speed, face, done }
    })
  }

  private placeMichi(step: ExpoStep): void {
    const spot = michiSpot(step)
    const m = this.michi
    m.root.visible = spot !== 'hidden'
    m.setLight(null)
    m.showNotebook(true)
    const at = spot === 'bench' ? MICHI_AT.bench : spot === 'tower' ? MICHI_AT.tower : spot === 'farewell' ? MICHI_AT.farewell : MICHI_AT.appear
    if (spot === 'plaza') {
      m.root.position.copy(X.ARRIVE).add(v(2, 0, -3))
      m.root.rotation.y = 0
    } else {
      m.root.position.copy(at.pos)
      m.root.rotation.y = at.yaw
    }
    m.setPose(step === 'assemble' || step === 'parts' || step === 'to_bench' ? 'crank' : 'idle')
  }

  private onScreen(p: THREE.Vector3, rt: StageRuntime): boolean {
    rt.camera.updateMatrixWorld()
    this.pm.multiplyMatrices(rt.camera.projectionMatrix, rt.camera.matrixWorldInverse)
    this.frustum.setFromProjectionMatrix(this.pm)
    return this.frustum.containsPoint(this.tmp.copy(p).setY(p.y + 0.9))
  }

  private dist2(a: THREE.Vector3, b: THREE.Vector3): number {
    return Math.hypot(a.x - b.x, a.z - b.z)
  }

  private lines(key: string): readonly DialogueLine[] {
    return lines.lines(key) as readonly DialogueLine[]
  }

  private say1(rt: StageRuntime, key: string, seconds = 3): void {
    const l = this.lines(key)[0]
    if (l) rt.say(l.speaker, l.text, seconds)
  }

  private fade(on: boolean): Promise<void> {
    if (this.curtain) this.curtain.style.opacity = on ? '1' : '0'
    return this.wait(0.65)
  }

  // ---------------------------------------------------------------- 敵

  private spawnEnemy(rt: StageRuntime, kind: EnemyKind, pos: THREE.Vector3, tag: string, leash = 10, extra: { yaw?: number; hidden?: boolean } = {}): EnemyHandle {
    return rt.combat.spawn(kind, pos, { tag, leash, style: KAKE_1970, yaw: extra.yaw ?? Math.PI, hidden: extra.hidden })
  }

  private startFirstFight(rt: StageRuntime, instant: boolean): void {
    const F = X.FIRST_FIGHT
    this.rifts.first.show(true, instant)
    this.visitors.scare(F, 14, 6)
    this.fightWave = 1
    for (const [dx, dz] of [
      [-2.6, 2.4],
      [2.8, 2.0],
      [0.2, 3.4],
    ])
      this.spawnEnemy(rt, 'mite', v(F.x + dx, 0, F.z + dz), 'first', 14, { yaw: 0 })
  }

  /** 会場のあちこちの欠け（ミチに会ったあと、錨をほどくまで） */
  private spawnWorld(rt: StageRuntime): void {
    if (this.worldSpawned) return
    this.worldSpawned = true
    const f = this.f(rt)
    // ロープウェイの向こう（池の西）
    this.spawnEnemy(rt, 'mite', v(-70, 0, 5), 'rope', 9)
    this.spawnEnemy(rt, 'mite', v(-72, 0, -5), 'rope', 9)
    // 日本庭園の小島
    const I = X.ISLAND
    this.spawnEnemy(rt, 'mite', v(I.x - 1.4, I.y, I.z + 0.8), 'island', 2.6)
    this.spawnEnemy(rt, 'mite', v(I.x + 1.4, I.y, I.z - 0.4), 'island', 2.6)
    this.spawnEnemy(rt, 'shield', v(I.x, I.y, I.z - 1.6), 'island', 2.4, { yaw: Math.PI })
    // 工事中の区画の群れ
    if (!f('expo_part_swarm') && !f('impact_claw_got')) {
      const S = X.SWARM
      this.rifts.swarm.show(true, true)
      for (const [dx, dz] of [
        [-5, 3],
        [4, 4],
        [-3, -4],
        [6, -2],
      ])
        this.spawnEnemy(rt, 'mite', v(S.x + dx, 0, S.z + dz), 'swarm', 12)
      this.spawnEnemy(rt, 'shield', v(S.x - 2, 0, S.z + 5.5), 'swarm', 12)
      this.spawnEnemy(rt, 'shield', v(S.x + 3, 0, S.z + 6), 'swarm', 12)
      this.spawnEnemy(rt, 'brute', v(S.x + 1, 0, S.z - 1), 'swarm', 10)
    }
    // 迷子の子を囲む欠け
    if (!f('expo_child_saved')) {
      const C = X.CHILD
      this.rifts.child.show(true, true)
      for (const [dx, dz] of [
        [-1.8, -1.2],
        [1.9, -0.9],
        [0.3, 2.0],
      ])
        this.spawnEnemy(rt, 'mite', v(C.x + dx, 0, C.z + dz), 'child', 6)
    }
  }

  /** 塔の前の欠け（壁を割る前）と、頂上の番人（隠しておく） */
  private spawnTower(rt: StageRuntime): void {
    const f = this.f(rt)
    if (!f('expo_wall_broken')) {
      this.rifts.gate.show(true, true)
      this.spawnEnemy(rt, 'shield', v(-2.4, 0, -38.6), 'gate', 8)
      this.spawnEnemy(rt, 'shield', v(2.6, 0, -38.2), 'gate', 8)
      this.spawnEnemy(rt, 'mite', v(0.2, 0, -36.4), 'gate', 8)
    }
    if (!f('expo_boss_down') && !this.boss) {
      const T = X.TOWER
      this.boss = rt.combat.spawn('brute', v(T.x, T.deckY, T.z - 1.5), { tag: 'boss', leash: 12, style: MIRAI_STYLE, hp: BOSS_HP, scale: 1.55, hidden: true, armored: true, yaw: 0 })
    }
  }

  private onDefeated(e: EnemyHandle, rt: StageRuntime): void {
    // 吸われていたものが、光になって持ち主へ帰る
    const home = e.tag === 'first' ? LIGHT_HOME.exhibit : e.tag === 'child' ? this.visitors.position(this.who.child).clone().setY(1.2) : LIGHT_HOME.pavilion
    this.lights.send(this.tmp.copy(e.pos).setY(e.pos.y + 0.8), home)
    if (e.tag === 'boss') for (let k = 0; k < 4; k++) this.lights.send(this.tmp.copy(e.pos).setY(e.pos.y + 1.5 + k * 0.2), LIGHT_HOME.pavilion, k * 0.25)
    const left = rt.combat.alive(e.tag).length
    if (e.tag === 'swarm' && left === 0) {
      this.rifts.swarm.show(false)
      rt.hud.toast('群れを追い払った！ 試作の爪が台の上に', 2.6)
    }
    if (e.tag === 'gate' && left === 0) this.rifts.gate.show(false)
    if (e.tag === 'child' && left === 0 && this.childState === 'trapped') void this.runChildSaved(rt)
    if (this.boss && e.id === this.boss.id) void this.runBossDown(rt)
  }

  // ---------------------------------------------------------------- 到着・最初の欠け・ミチ

  private async runArrival(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    rt.oreGlow(1.2)
    await rt.dialogue(this.lines('arrive'))
    // 北の塔と、てっぺんの黒い輪
    const p = rt.player.position
    void rt.cinematic({ look: v(0, 30, -62), lookTo: X.ANCHOR_RING.clone(), from: v(p.x + 1.2, 1.8, p.z + 2.5), hold: Infinity, inSec: 1.8, panSec: 5, fov: 30, marker: { pos: X.ANCHOR_RING.clone().add(v(0, -9, 0)), label: '黒い輪', color: '#c77dff' } })
    await this.wait(1.0)
    await rt.dialogue(this.lines('arrive_ring'))
    rt.endCinematic()
    rt.story.set('expo_arrived', true)
    rt.save('arrive')
    // 広場のすみの展示が黒く欠け、欠け虫が湧く
    this.startFirstFight(rt, false)
    rt.shake(0.35)
    void rt.cinematic({ look: X.FIRST_FIGHT.clone().setY(0.8), hold: 1.4, inSec: 1.0, outSec: 0.9, fov: 46 })
    await rt.dialogue(this.lines('kake_appear'))
    rt.setControlLocked(false)
    this.busy = false
    rt.hud.toast('K：攻撃　J：引き寄せて気絶させる　Shift：よける', 5)
  }

  private async runFirstFightDone(rt: StageRuntime): Promise<void> {
    this.busy = true
    this.rifts.first.show(false)
    await this.wait(0.6)
    await rt.dialogue(this.lines('first_fight_done'))
    rt.story.set('expo_first_fight', true)
    rt.save('plaza')
    await this.runMichiMeet(rt)
  }

  private async runMichiMeet(rt: StageRuntime): Promise<void> {
    this.busy = true
    const m = this.michi
    m.root.visible = true
    m.root.position.copy(MICHI_AT.appear.pos)
    m.setPose('idle')
    const say = rt.dialogue(this.lines('michi_meet').slice(0, 1))
    // ネクマックスのところまで走ってくる
    for (let k = 0; k < 40; k++) {
      const p = rt.player.position
      const d = this.dist2(m.root.position, p)
      if (d < 2.1) break
      const to = v(p.x + ((m.root.position.x - p.x) * 1.9) / d, p.y, p.z + ((m.root.position.z - p.z) * 1.9) / d)
      await Promise.race([this.walkMichi([to], 3.4), this.wait(0.5)])
    }
    this.walker = null
    await say
    rt.setControlLocked(true)
    const p = rt.player.position
    const mp = m.root.position
    rt.player.turnToward(mp.x - p.x, mp.z - p.z, 1, 1)
    m.root.rotation.y = Math.atan2(-(p.x - mp.x), -(p.z - mp.z))
    const mid = v((p.x + mp.x) / 2, 1.0, (p.z + mp.z) / 2)
    const side = this.tmp.set(mp.z - p.z, 0, -(mp.x - p.x)).normalize()
    void rt.cinematic({ look: mid, from: v(mid.x + side.x * 3.4, 1.5, mid.z + side.z * 3.4), fromTo: v(mid.x + side.x * 2.8, 1.4, mid.z + side.z * 2.8), hold: Infinity, inSec: 1.2, panSec: 14, fov: 42 })
    await rt.dialogue(this.lines('michi_meet').slice(1))
    rt.endCinematic()
    rt.setControlLocked(false)
    rt.story.set('met_michi', true)
    rt.save('plaza')
    this.spawnWorld(rt)
    this.busy = false
    // 作業台へ（ふり返りながら）
    m.setPose('idle')
    void this.walkMichi([v(24, 0, -4), v(32, 0, -1), MICHI_AT.bench.pos], 2.6, MICHI_AT.bench.yaw).then(() => m.setPose('crank'))
  }

  private async runBench(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    const m = this.michi
    this.walker = null
    m.root.position.copy(MICHI_AT.bench.pos)
    m.setPose('idle')
    const p = rt.player.position
    m.root.rotation.y = Math.atan2(-(p.x - m.root.position.x), -(p.z - m.root.position.z))
    rt.player.turnToward(m.root.position.x - p.x, m.root.position.z - p.z, 1, 1)
    const W = X.WORKBENCH
    void rt.cinematic({ look: v(W.x - 0.1, 1.1, W.z + 0.3), from: v(W.x - 2.6, 2.0, W.z - 1.6), hold: Infinity, inSec: 1.2, fov: 40 })
    await rt.dialogue(this.lines('bench_parts'))
    // 部品の場所（ロープウェイの向こうの鉄塔を見せる）
    void rt.cinematic({ look: v(-60, 9, 0), from: v(30, 6, 2), hold: Infinity, inSec: 1.2, fov: 34, marker: { pos: PARTS.ropeway.pos.clone().add(v(0, 1.2, 0)), label: '放電コイル', color: '#5ad8ff' } })
    await rt.dialogue(this.lines('bench_where'))
    rt.endCinematic()
    await rt.dialogue(this.lines('bench_go'))
    rt.setControlLocked(false)
    rt.story.set('expo_bench', true)
    for (const id of PART_IDS) this.parts[id].active = true
    rt.combat.setCheckpoint(SPAWNS.workbench.pos, SPAWNS.workbench.facing)
    rt.save('workbench')
    m.setPose('crank')
    this.busy = false
  }

  // ---------------------------------------------------------------- 部品・かけら

  private collectPart(id: PartId, rt: StageRuntime): void {
    this.parts[id].collect()
    rt.story.set(PARTS[id].flag, true)
    rt.oreGlow(0.8)
    rt.hud.banner(`${PARTS[id].name} を手に入れた`, 'success', 2.2)
    const n = partsCount(this.f(rt))
    void rt.dialogue(this.lines(n >= EXPO_PARTS.length ? 'parts_all' : `part_${id}`))
    rt.save(expoSpawn(this.step(rt)))
  }

  private collectShard(id: ShardId, rt: StageRuntime): void {
    const first = shardCount(this.f(rt)) === 0
    this.shards[id].collect()
    rt.story.set(SHARDS[id].flag, true)
    rt.oreGlow(0.6)
    const n = shardCount(this.f(rt))
    if (first) void rt.dialogue(this.lines('shard_first'))
    rt.hud.banner(`時のかけら ${n}/5`, 'success', 2.2)
    rt.save(expoSpawn(this.step(rt)))
  }

  // ---------------------------------------------------------------- はじくNMClaw

  private async runAssemble(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    const m = this.michi
    this.walker = null
    m.root.position.copy(MICHI_AT.bench.pos)
    m.root.rotation.y = MICHI_AT.bench.yaw
    const W = X.WORKBENCH
    void rt.cinematic({ look: v(W.x - 0.1, 1.1, W.z + 0.3), from: v(W.x - 2.4, 1.9, W.z - 1.8), hold: Infinity, inSec: 1.2, fov: 40 })
    await rt.dialogue(this.lines('assemble_a'))
    // ミチが自分の手で組み上げる（手が震える → 見習いでも、今できることはある）
    m.setPose('crank')
    await rt.dialogue(this.lines('assemble_b'))
    await this.wait(0.6)
    m.setPose('idle')
    const p = rt.player.position
    m.root.rotation.y = Math.atan2(-(p.x - m.root.position.x), -(p.z - m.root.position.z))
    // 組み上げ
    this.sc.protoArm.visible = false
    rt.story.set('impact_claw_got', true)
    equipFromFlags(rt.equipment, this.f(rt))
    rt.oreGlow(1.6)
    rt.shake(0.2)
    rt.hud.banner('はじくNMClaw', 'success', 2.6)
    await rt.dialogue(this.lines('assemble_c'))
    rt.endCinematic()
    await rt.dialogue(this.lines('assemble_d'))
    rt.setControlLocked(false)
    for (const id of PART_IDS) this.parts[id].active = false
    this.spawnTower(rt)
    rt.save('workbench')
    this.busy = false
    rt.hud.toast('Q：左腕（はじく）　E：右腕（つかむ）　J：選んだ腕を使う', 5)
    // ミチは塔の前へ
    void this.walkMichi(MICHI_TO_TOWER, 2.8, MICHI_AT.tower.yaw).then(() => this.michi.setPose('idle'))
  }

  private breakWall(w: CrackedWall, rt: StageRuntime, instant: boolean): void {
    w.group.visible = false
    for (const c of w.colliders) rt.phys.remove(c)
    if (!instant) {
      const n = new THREE.Vector3(Math.sin(w.group.rotation.y), 0, Math.cos(w.group.rotation.y))
      // 割った側（プレイヤー）から奥へ飛ぶ
      if (this.tmp.subVectors(rt.player.position, w.pos).dot(n) > 0) n.negate()
      this.debris.burst(w.pos, n.negate(), w.radius * 2, 3)
      rt.shake(0.5)
    }
  }

  private onWallBreak(w: CrackedWall, rt: StageRuntime): void {
    this.breakWall(w, rt, false)
    if (w === this.sc.walls.store) {
      this.storeBroken = true
      rt.hud.toast('壁が割れた！ 奥で何か光っている', 2.6)
      return
    }
    rt.story.set('expo_wall_broken', true)
    for (const h of this.sc.towerHooks) h.enabled = true
    rt.combat.setCheckpoint(v(0, 0.3, -50), 0)
    rt.save('tower')
    void rt.dialogue(this.lines('wall_broken'))
  }

  // ---------------------------------------------------------------- 錨の番人

  private async runBossIntro(rt: StageRuntime): Promise<void> {
    if (!this.boss) return
    this.bossStarted = true
    this.busy = true
    rt.setControlLocked(true)
    rt.claw.reset()
    rt.combat.setCheckpoint(SPAWNS.deck.pos, SPAWNS.deck.facing)
    const b = this.boss
    void rt.cinematic({ look: X.ANCHOR_RING.clone(), from: v(rt.player.position.x, X.TOWER.deckY + 1.6, rt.player.position.z + 2), hold: Infinity, inSec: 1.4, fov: 40 })
    await rt.dialogue(this.lines('boss_intro_a'))
    rt.combat.appear(b)
    rt.shake(0.5)
    void rt.cinematic({ look: b.pos.clone().setY(b.pos.y + 2.2), hold: Infinity, inSec: 1.0, fov: 44 })
    await rt.dialogue(this.lines('boss_intro_b'))
    rt.endCinematic()
    rt.combat.showBoss(b, BOSS_NAME)
    rt.setControlLocked(false)
    this.busy = false
    rt.hud.toast('装甲は はじく（Q → J）で割れる', 3.5)
  }

  private async runBossDown(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.story.set('expo_boss_down', true)
    this.boss = null
    for (const e of rt.combat.alive('bosswave')) rt.combat.kill(e)
    await this.wait(1.0)
    rt.setControlLocked(true)
    void rt.cinematic({ look: X.ANCHOR_KNOT.clone(), lookTo: X.ANCHOR_RING.clone(), hold: Infinity, inSec: 1.4, panSec: 4, fov: 40 })
    this.thread.setFade(1)
    await rt.dialogue(this.lines('boss_down'))
    // 下からミチの声と合図
    this.michi.setPose('hold')
    this.michi.setLight('#ffffff')
    const mp = this.michi.root.position
    void rt.cinematic({ look: mp.clone().setY(1.2), from: v(mp.x + 3.5, 6, mp.z - 6), hold: Infinity, inSec: 1.2, fov: 40 })
    await rt.dialogue(this.lines('unravel_intro').slice(0, 2))
    rt.endCinematic()
    await rt.dialogue(this.lines('unravel_intro').slice(2))
    rt.setControlLocked(false)
    this.sc.knot.enabled = true
    rt.save('deck')
    this.busy = false
    rt.hud.toast('E：右腕にして、結び目を J でつかむ', 3.5)
  }

  // ---------------------------------------------------------------- 錨をほどく

  private onUnravelRelease(rt: StageRuntime): void {
    const r = this.unravel.release()
    this.thread.setTension(0)
    if (r === 'success') {
      rt.shake(0.3)
      rt.oreGlow(1)
      this.ring.fade(1 - this.unravel.progress * 0.7)
      // ほどけた分だけ、取られていた明日が光になって会場へ帰っていく（その声が聞こえる）
      for (let k = 0; k < 3; k++) this.lights.send(X.ANCHOR_KNOT, k === 0 ? LIGHT_HOME.pavilion : k === 1 ? LIGHT_HOME.exhibit : v(-30 + Math.random() * 60, 4, -10 + Math.random() * 30), k * 0.2)
      if (this.unravel.finished) void this.runUnravelDone(rt)
      else void rt.dialogue(this.lines(`unravel_success_${this.unravel.done}`))
    } else if (r === 'early') {
      rt.hud.banner('まだ早い！', 'fail', 1.4)
      this.say1(rt, 'unravel_early', 2.2)
    }
  }

  private async runUnravelDone(rt: StageRuntime): Promise<void> {
    this.busy = true
    this.sc.knot.enabled = false
    rt.claw.reset()
    rt.setControlLocked(true)
    rt.hud.setGate({ progress: 1, signal: 'done', signalText: 'ほどけた！', adjusting: false, labels: UNRAVEL_LABELS })
    this.michi.setLight(null)
    this.michi.setPose('wave')
    rt.hud.flash('success')
    rt.hud.banner('錨をほどいた！', 'success', 3)
    void rt.cinematic({ look: X.ANCHOR_RING.clone(), from: v(4, X.TOWER.deckY + 1.8, X.TOWER.z + 7), hold: Infinity, inSec: 1.6, fov: 38, shake: 0.06 })
    this.ring.fade(0)
    this.thread.setFade(0)
    for (let k = 0; k < 10; k++) this.lights.send(X.ANCHOR_KNOT, v(-40 + Math.random() * 100, 3 + Math.random() * 6, -40 + Math.random() * 60), k * 0.12)
    await this.wait(1.6)
    await rt.dialogue(this.lines('unravel_done'))
    rt.endCinematic(true)
    rt.hud.setGate(null)
    rt.story.set('expo_anchor_cleared', true)
    rt.save('return')
    // 会場の欠けはすべて消え、ミライ号は館の入口へ、案内板には設計者の名前が戻る
    this.mirai.visible = true
    this.plaque.setNamed(true)
    for (const e of rt.combat.alive()) rt.combat.kill(e)
    for (const r of Object.values(this.rifts)) r.show(false)
    // 暗転して広場へ（ミチのところ）
    await this.fade(true)
    rt.player.teleport(SPAWNS.return.pos.clone(), SPAWNS.return.facing)
    rt.camRig.yaw = SPAWNS.return.camYaw
    rt.camRig.pitch = SPAWNS.return.camPitch
    this.walker = null
    this.placeMichi('farewell')
    await this.wait(0.3)
    await this.fade(false)
    rt.setControlLocked(false)
    this.busy = false
    await this.runFarewell(rt)
  }

  private async runFarewell(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    const m = this.michi
    const p = rt.player.position
    m.root.rotation.y = Math.atan2(-(p.x - m.root.position.x), -(p.z - m.root.position.z))
    rt.player.turnToward(m.root.position.x - p.x, m.root.position.z - p.z, 1, 1)
    const mid = v((p.x + m.root.position.x) / 2, 1.0, (p.z + m.root.position.z) / 2)
    void rt.cinematic({ look: mid, from: v(mid.x - 0.6, 1.5, mid.z + 3.4), fromTo: v(mid.x - 0.4, 1.4, mid.z + 2.8), hold: Infinity, inSec: 1.3, panSec: 16, fov: 40 })
    // 先輩・北條が、何事もなかったように戻ってくる（本人は消えていたことを知らない）
    if (!this.seniorBack) {
      this.seniorBack = true
      const s = this.who.senior
      this.visitors.setVisible(s, true)
      this.visitors.teleport(s, v(12, 0, 11), -Math.PI / 2)
      const said = rt.dialogue(this.lines('senior_return').slice(0, 1))
      this.visitors.walkTo(s, SENIOR_AT, 2.4, () => this.visitors.face(s, m.root.position.x, m.root.position.z))
      await said
      m.root.rotation.y = Math.atan2(-(SENIOR_AT.x - m.root.position.x), -(SENIOR_AT.z - m.root.position.z))
      void rt.cinematic({ look: v((SENIOR_AT.x + m.root.position.x) / 2, 1.2, (SENIOR_AT.z + m.root.position.z) / 2), from: v(1.0, 1.6, 12.6), hold: Infinity, inSec: 1.2, fov: 40 })
      await rt.dialogue(this.lines('senior_return').slice(1))
      m.root.rotation.y = Math.atan2(-(p.x - m.root.position.x), -(p.z - m.root.position.z))
      void rt.cinematic({ look: mid, from: v(mid.x - 0.6, 1.5, mid.z + 3.4), fromTo: v(mid.x - 0.4, 1.4, mid.z + 2.8), hold: Infinity, inSec: 1.3, panSec: 16, fov: 40 })
    }
    const L = this.lines('farewell_a')
    await rt.dialogue(L.slice(0, -1))
    // ノートの最後のページに、小さな青いロボットの絵
    m.setPose('crank')
    await this.wait(1.2)
    await rt.dialogue(L.slice(-1))
    m.setPose('idle')
    const B = this.lines('farewell_b')
    await rt.dialogue(B.slice(0, -1))
    rt.endCinematic()
    rt.oreGlow(1.8)
    await rt.dialogue(B.slice(-1))
    rt.story.set('expo_farewell', true)
    this.openReturnRing(rt, true)
    // 光の輪を見せてから操作を戻す（カメラが戻りきる前に F を押しても効かないので）
    await Promise.all([rt.cinematic({ look: X.RETURN_RING.clone().setY(1.2), hold: 1.5, inSec: 1.1, outSec: 1.1, fov: 46, marker: { pos: X.RETURN_RING.clone().setY(1.0), label: '帰りの光の輪', color: '#c8a6ff' } }), rt.dialogue(this.lines('return_ready'))])
    rt.setControlLocked(false)
    this.busy = false
  }

  private openReturnRing(rt: StageRuntime, announce: boolean): void {
    this.ringOpen = true
    rt.rift.openAt(X.RETURN_RING, eraTintHex(2086), 1.55, 0.8)
    if (announce) rt.save('return')
  }

  private nearRing(rt: StageRuntime): boolean {
    return this.ringOpen && this.dist2(rt.player.position, X.RETURN_RING) < 2.4
  }

  private async leave(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    this.michi.setPose('wave')
    this.visitors.wave(this.who.senior, 4)
    await rt.dialogue(this.lines('return_leave'))
    rt.oreGlow(2)
    rt.setControlLocked(false)
    const res = rt.travel({ to: '2086', cause: 'return', spawn: 'arrive_from_1970' })
    if (!res.ok) rt.hud.toast(res.reason)
    this.busy = false
  }

  // ---------------------------------------------------------------- 寄り道

  private async runChildSaved(rt: StageRuntime): Promise<void> {
    this.childState = 'walking'
    this.rifts.child.show(false)
    const c = this.who.child
    this.visitors.face(c, rt.player.position.x, rt.player.position.z)
    await rt.dialogue(this.lines('child_saved'))
    this.visitors.walkTo(c, v(-24, 0, 25), 2.0, () =>
      this.visitors.walkTo(c, v(-14, 0, 22.4), 2.0, () =>
        this.visitors.walkTo(c, X.PARENTS.clone().add(v(-0.8, 0, 0.3)), 2.0, () => {
          this.childState = 'home'
          this.visitors.face(c, X.PARENTS.x, X.PARENTS.z)
          this.visitors.wave(this.who.mother, 3)
        }),
      ),
    )
  }

  private carryingHat(rt: StageRuntime): boolean {
    const w = rt.claw.wire
    if ((w.phase === 'carrying' || w.phase === 'reeling') && w.target?.id === CLAW_IDS.hat) return true
    const o = this.sc.hat.object
    return o.visible && this.sc.hat.def.enabled && o.position.distanceTo(this.sc.hat.home) > 0.6 && this.dist2(o.position, this.visitors.position(this.who.staff)) < 3
  }

  // ---------------------------------------------------------------- F

  private nearNpc(rt: StageRuntime): 'michi' | 'staff' | 'parents' | 'senior' | 'plaque' | 'mirai' | null {
    const p = rt.player.position
    if (this.michi.root.visible && this.dist2(p, this.michi.root.position) < 2.8 && Math.abs(p.y - this.michi.root.position.y) < 2) return 'michi'
    if (this.visitors.isVisible(this.who.senior) && this.dist2(p, this.visitors.position(this.who.senior)) < 2.4) return 'senior'
    if (this.dist2(p, PLAQUE_AT) < 2.0) return 'plaque'
    if (this.mirai.visible && this.dist2(p, MIRAI_AT) < 2.4) return 'mirai'
    if (this.dist2(p, this.visitors.position(this.who.staff)) < 2.4) return 'staff'
    if (this.dist2(p, this.visitors.position(this.who.mother)) < 2.4 || this.dist2(p, this.visitors.position(this.who.father)) < 2.4) return 'parents'
    return null
  }

  interact(rt: StageRuntime): boolean {
    if (this.busy) return true
    if (this.nearRing(rt)) {
      void this.leave(rt)
      return true
    }
    const n = this.nearNpc(rt)
    if (n === 'michi') {
      this.talkMichi(rt)
      return true
    }
    if (n === 'staff') {
      const f = this.f(rt)
      if (f('expo_hat_returned')) void rt.dialogue(this.lines('staff_after'))
      else if (this.carryingHat(rt)) {
        rt.claw.reset()
        this.sc.hat.def.enabled = false
        this.sc.hat.object.visible = false
        this.visitors.setHat(this.who.staff, 'staff')
        rt.story.set('expo_hat_returned', true)
        rt.save(expoSpawn(this.step(rt)))
        void rt.dialogue(this.lines('staff_thanks'))
      } else if (!this.staffAsked) {
        this.staffAsked = true
        void rt.dialogue(this.lines('staff_ask'))
      } else void rt.dialogue(this.lines('staff_wait'))
      return true
    }
    if (n === 'senior') {
      void rt.dialogue(this.lines('senior_talk'))
      return true
    }
    if (n === 'plaque') {
      void rt.dialogue(this.lines(this.f(rt)('expo_anchor_cleared') ? 'plaque_after' : 'plaque_before'))
      return true
    }
    if (n === 'mirai') {
      void rt.dialogue(this.lines('mirai_restored'))
      return true
    }
    if (n === 'parents') {
      if (this.childState === 'home') {
        this.childState = 'thanked'
        rt.combat.health.refill()
        rt.story.set('expo_child_saved', true)
        rt.save(expoSpawn(this.step(rt)))
        this.visitors.wave(this.who.child, 3)
        void rt.dialogue(this.lines('parents_thanks'))
      } else if (this.childState === 'thanked') void rt.dialogue(this.lines('parents_after'))
      else void rt.dialogue(this.lines('parents_wait'))
      return true
    }
    return this.mobs?.interact(rt, rt.player.position) ?? false
  }

  private talkMichi(rt: StageRuntime): void {
    const f = this.f(rt)
    switch (this.step(rt)) {
      case 'to_bench':
        if (this.dist2(rt.player.position, MICHI_AT.bench.pos) < 4.5) void this.runBench(rt)
        else void rt.dialogue(this.lines('michi_to_bench'))
        return
      case 'parts': {
        const left = EXPO_PARTS.filter((p) => !f(p.flag))
        rt.say('ミチ', `部品はあと${left.length}つ。${left.map((p) => p.where.replace(/（.+）/, '')).join('・')}やで。`, 3.4)
        return
      }
      case 'assemble':
        void this.runAssemble(rt)
        return
      case 'tower':
        void rt.dialogue(this.lines(f('expo_wall_broken') ? 'michi_tower_climb' : 'michi_tower'))
        return
      case 'unravel':
        void rt.dialogue(this.lines('michi_unravel'))
        return
      case 'farewell':
        void this.runFarewell(rt)
        return
      case 'done':
        void rt.dialogue(this.lines('michi_done'))
        return
      default:
        return
    }
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.busy) return []
    if (this.nearRing(rt)) return [{ key: 'F', label: '光の輪で2086年へ帰る' }]
    const n = this.nearNpc(rt)
    if (n === 'staff' && this.carryingHat(rt)) return [{ key: 'F', label: '帽子を渡す' }]
    if (n === 'plaque') return [{ key: 'F', label: '読む' }]
    if (n) return [{ key: 'F', label: '話す' }]
    return this.mobs?.canTalk(rt.player.position) ? [{ key: 'F', label: '話す' }] : null
  }

  objective(rt: StageRuntime): { title: string; sub: string } {
    const f = this.f(rt)
    const T = X.TOWER
    const p = rt.player.position
    const onDeck = p.y > T.deckY - 1 && this.dist2(p, v(T.x, 0, T.z)) < T.deckR + 0.5
    return expoObjective(this.step(rt), f, { wallBroken: f('expo_wall_broken'), onDeck, bossAlive: !!this.boss && this.bossStarted })
  }

  objectiveTarget(rt: StageRuntime): THREE.Vector3 | null {
    const m = this.objectiveMarkers(rt)
    return m && m.length ? m[0].pos : null
  }

  /** 目標の目印（頭の上の▼と名前） */
  objectiveMarkers(rt: StageRuntime): readonly ObjectiveMark[] | null {
    const out = this.marks
    out.length = 0
    if (this.busy) return out
    const f = this.f(rt)
    let k = 0
    const mark = (p: THREE.Vector3, dy: number, label: string) => {
      if (k >= this.markPool.length) return
      out.push({ pos: this.markPool[k++].copy(p).setY(p.y + dy), label })
    }
    const michi = () => mark(this.michi.root.position, this.michi.height + 0.35, 'ミチ')
    switch (this.step(rt)) {
      case 'first_fight':
        mark(X.FIRST_FIGHT, 2.2, '欠け')
        break
      case 'to_bench':
      case 'assemble':
      case 'farewell':
        michi()
        break
      case 'parts':
        for (const id of PART_IDS) if (!f(PARTS[id].flag)) mark(PARTS[id].pos, 1.8, PARTS[id].name)
        break
      case 'tower': {
        if (!f('expo_wall_broken')) {
          mark(X.TOWER_WALL, 2.2, 'ひび割れた壁')
          break
        }
        if (this.bossStarted) break
        // 次に飛びつく金具（いまの高さより上で一番低いもの）
        const y = rt.player.position.y
        const next = this.sc.towerHooks.find((h) => h.point.y > y + 0.4)
        if (next) mark(next.point, 0.6, '塔の金具')
        break
      }
      case 'unravel':
        mark(X.ANCHOR_KNOT, 1.0, '錨の結び目')
        break
      case 'done':
        mark(X.RETURN_RING, 2.6, '光の輪')
        break
    }
    return out
  }

  // ---------------------------------------------------------------- クロー

  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    if (!('target' in e) || !e.target) return
    if (e.target.id !== CLAW_IDS.knot) return
    if (e.kind === 'connected') {
      this.unravel.grab()
      this.michi.setLight('#ffa24a')
    } else if (e.kind === 'released' || e.kind === 'detached') {
      if (this.unravel.holding) this.onUnravelRelease(rt)
      if (!this.unravel.finished) this.michi.setLight('#ffffff')
    }
  }

  // ---------------------------------------------------------------- 毎フレーム

  update(dt: number, _frame: ActionFrame, rt: StageRuntime): void {
    const f = this.f(rt)
    this.stageT += dt
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]
      t.t -= dt
      if (t.t <= 0) {
        this.timers.splice(i, 1)
        t.done()
      }
    }
    const step = this.step(rt)
    const p = rt.player.position
    rt.combat.passive = this.busy || rt.talking || rt.inCinematic
    // 最初の欠け：2 波
    if (step === 'first_fight' && !this.busy && this.fightWave > 0) {
      if (rt.combat.alive('first').length === 0) {
        if (this.fightWave === 1) {
          this.fightWave = 2
          const F = X.FIRST_FIGHT
          rt.shake(0.2)
          this.spawnEnemy(rt, 'shield', v(F.x, 0, F.z + 2.6), 'first', 14, { yaw: 0 })
          this.spawnEnemy(rt, 'mite', v(F.x - 2.8, 0, F.z + 1.0), 'first', 14, { yaw: 0 })
          rt.hud.toast('盾は正面の攻撃を防ぐ。J でクローを撃って盾をはがそう', 4)
        } else if (this.fightWave === 2) {
          this.fightWave = 3
          void this.runFirstFightDone(rt)
        }
      }
    }
    // 作業台に着いた
    if (step === 'to_bench' && !this.busy && !this.walker && this.dist2(p, MICHI_AT.bench.pos) < 4.2) void this.runBench(rt)
    // 拾う
    if (!this.busy) {
      for (const id of PART_IDS) {
        const pk = this.parts[id]
        if (id === 'swarm' && rt.combat.alive('swarm').length > 0) continue
        if (pk.near(p)) this.collectPart(id, rt)
      }
      for (const id of SHARD_IDS) if (this.shards[id].near(p)) this.collectShard(id, rt)
    }
    if (step === 'assemble' && !this.busy && this.dist2(p, MICHI_AT.bench.pos) < 3.2) void this.runAssemble(rt)
    // 倉庫の壁の前（はじくを持つ前）
    if (!this.storeHinted && !f('impact_claw_got') && !this.storeBroken && this.dist2(p, X.STORE_WALL) < 3.2) {
      this.storeHinted = true
      void rt.dialogue(this.lines('store_hint'))
    }
    // 迷子の子の泣き声
    if (!this.childCried && this.childState === 'trapped' && f('met_michi') && this.dist2(p, X.CHILD) < 11) {
      this.childCried = true
      this.say1(rt, 'child_cry', 2.6)
    }
    // 塔の上に着いた → 番人
    const T = X.TOWER
    if (step === 'tower' && !this.bossStarted && !this.busy && this.boss && p.y > T.deckY - 0.6 && this.dist2(p, v(T.x, 0, T.z)) < T.deckR) void this.runBossIntro(rt)
    if (this.boss && this.bossStarted && this.boss.alive) {
      const w = bossWaves(this.boss.brain.hp, this.boss.maxHp)
      while (this.bossWavesDone < w) {
        this.bossWavesDone++
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + this.bossWavesDone
          const e = this.spawnEnemy(rt, 'mite', v(T.x + Math.cos(a) * 5.5, T.deckY, T.z + Math.sin(a) * 5.5), 'bosswave', 12)
          rt.combat.appear(e)
        }
        rt.shake(0.3)
        this.say1(rt, 'boss_wave', 2.4)
      }
    }
    // 錨をほどく：合図
    if (step === 'unravel') {
      const ev = this.unravel.tick(dt)
      if (ev === 'go') this.michi.setLight('#3fe0cf')
      if (ev === 'missed') {
        this.michi.setLight('#ffa24a')
        this.say1(rt, 'unravel_missed', 2.2)
      }
      this.thread.setTension(this.unravel.holding ? (this.unravel.signal === 'go' ? 1 : 0.5) : 0)
      const u = this.unravel
      const near = p.y > T.deckY - 1
      rt.hud.setGate(near && !this.busy ? { progress: u.progress, signal: u.holding ? (u.signal === 'go' ? 'go' : 'wait') : 'watch', signalText: u.holding ? (u.signal === 'go' ? '今！ 離して！' : '待って……') : '結び目を J でつかむ', adjusting: u.holding, labels: UNRAVEL_LABELS } : null)
    }
    // ミチの歩き
    this.updateMichi(dt, rt)
    // 来場者
    this.avoid.length = 0
    this.avoid.push(p, this.michi.root.position)
    this.visitors.update(dt, this.avoid)
    if (step === 'first_fight' && this.fightWave > 0 && this.fightWave < 3 && Math.floor(this.stageT * 2) % 4 === 0) this.visitors.scare(X.FIRST_FIGHT, 10, 2)
    this.mobs?.update(dt, p, f('expo_anchor_cleared') ? 'after' : 'before', this.busy || rt.talking || rt.inCinematic)
  }

  private updateMichi(dt: number, rt: StageRuntime): void {
    const m = this.michi
    const w = this.walker
    if (w) {
      const target = w.path[w.i]
      this.tmp.subVectors(target, m.root.position)
      const d = Math.hypot(this.tmp.x, this.tmp.z)
      const stepLen = w.speed * dt
      if (d <= stepLen) {
        m.root.position.copy(target)
        w.i++
        if (w.i >= w.path.length) {
          this.walker = null
          if (w.face !== null) m.root.rotation.y = w.face
          w.done?.()
        }
      } else {
        m.root.position.x += (this.tmp.x / d) * stepLen
        m.root.position.z += (this.tmp.z / d) * stepLen
        const want = Math.atan2(-this.tmp.x, -this.tmp.z)
        let dd = want - m.root.rotation.y
        while (dd > Math.PI) dd -= Math.PI * 2
        while (dd < -Math.PI) dd += Math.PI * 2
        m.root.rotation.y += dd * Math.min(1, dt * 9)
      }
      // 遠い道のりは、見えないところで先へ
      if (this.walker && w.path.length > 3 && !this.onScreen(m.root.position, rt) && this.dist2(m.root.position, rt.player.position) > 25) {
        m.root.position.copy(w.path[w.path.length - 1])
        this.walker = null
        if (w.face !== null) m.root.rotation.y = w.face
        w.done?.()
      }
      return
    }
    // 近くに来たら、こちらを向く
    const p = rt.player.position
    if (m.root.visible && !this.busy && this.dist2(p, m.root.position) < 4.5) {
      const want = Math.atan2(-(p.x - m.root.position.x), -(p.z - m.root.position.z))
      let dd = want - m.root.rotation.y
      while (dd > Math.PI) dd -= Math.PI * 2
      while (dd < -Math.PI) dd += Math.PI * 2
      m.root.rotation.y += dd * Math.min(1, dt * 4)
    }
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    this.michi.update(dt, this.walker?.speed ?? 0)
    this.sc.update(dt, t)
    for (const id of PART_IDS) this.parts[id].update(dt, t)
    for (const id of SHARD_IDS) this.shards[id].update(dt, t)
    for (const r of Object.values(this.rifts)) r.update(dt, t)
    this.debris.update(dt)
    this.lights.update(dt, t)
    this.ring.update(dt, rt.camera, t)
    // 糸は近いときだけ動かす（形を作り直すので）
    if (rt.player.position.distanceTo(X.ANCHOR_KNOT) < 60) this.thread.update(dt, t)
    this.visitors.render()
    this.mobs?.render(dt)
  }

  debug(): Record<string, unknown> {
    return {
      step: this.rt ? this.step(this.rt) : null,
      busy: this.busy,
      fightWave: this.fightWave,
      bossStarted: this.bossStarted,
      bossHp: this.boss?.brain.hp ?? null,
      bossArmor: this.boss?.brain.armor ?? null,
      unravel: { done: this.unravel.done, holding: this.unravel.holding, signal: this.unravel.signal },
      child: this.childState,
      ringOpen: this.ringOpen,
      michi: this.michi.root.position.toArray().map((x) => +x.toFixed(2)),
    }
  }

  dispose(): void {
    this.mobs?.dispose()
    this.mobs = null
    this.curtain?.remove()
    this.curtain = null
    this.visitors?.dispose()
    this.thread?.dispose()
    this.walker = null
    this.timers.length = 0
    this.rt = null
    const w = window as unknown as { __expoDev?: unknown }
    if (w.__expoDev) delete w.__expoDev
  }
}
