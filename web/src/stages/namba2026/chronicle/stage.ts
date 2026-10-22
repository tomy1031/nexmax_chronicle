// 2026年 大阪・なんば（物語 v7.1 の 6・9 章）の本編ステージ。docs/物語_v7_時を裂く爪.md・docs/ステージ設計_v1.md §3〜4。
// 6 章（v7_nextmake で着く）：社長と佐伯さんが、立てたばかりのかんばんの QR の読みこみをためしている → かんばんの光から出る
//   → 光がもう一度ゆがんで、よろいの影獣（看板・鉄板を体にはりつける）。NEXTMAKE の前の「水辺の広場」で戦う（beastFight.ts）：
//   突進をよけて柱にぶつける → ゆるんだ板を J ではがす → J で投げ返す → よろいがなくなったら K でパンチ（おこると、とびかかり・佐伯さんをつかむ）
//   → 「君、だれや？」→ 名前とうしろの板で、まだ作っていないロボットに会う社長の大さわぎ → ラボで社長の絵（すみに「NEXTMAKE 001」）
//   → 佐伯さんが石の音 → IDO 検索「時計」→ 町のかんばん 3 本（時計屋・駅の大時計・古い路地）
//   → 路地のかんばんで「青い刃のかけら」（「時計」と「青い」で 1 本）→ F で QR を読む（目から光・石がコチコチ・絵が本物の景色に）→ 1726年へ（ido_kanban）
// 9 章（v7_alley で着く。夕方）：社長「また来たんか？」→ 来年ビルを建てる土地 → 路地のおくのほこら・おふじさん・佐伯さん
//   → 夜：空のひび・ほこら防衛（2 波。屋根の影は J、箱にとびかかる影は K）→ 社長の「江戸の朝」の映し出し → 小さな影がにげる
//   → 大きな影（暗がりへかくれる → F で照らしてもらう → J・K）→ 本物の朝 → 社長の決断・ダイヤル・ノート → 光の輪から 2086年へ
// 段階はフラグだけから決まる（storyNamba.ts）。場面は async runX(rt)（操作を止める → カメラ → 会話 → フラグ → セーブ）。
import * as THREE from 'three'
import { ERA_PRESENT, eraTintHex } from '../../../core/eras'
import { DialogueDB } from '../../../core/dialogue'
import type { ActionFrame } from '../../../player/inputActions'
import type { WireEvent } from '../../../player/clawLogic'
import type { Character } from '../../../world/characters'
import type { Hint } from '../../../ui/hud'
import type { EnemyHandle } from '../../../combat/combatSystem'
import type { MusicId } from '../../../audio/tracks'
import type { ObjectiveMark, SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageWorld } from '../../../game/stage'
import { SceneClock } from '../../../chronicle/kit/clock'
import { Walker } from '../../../chronicle/kit/walker'
import { Curtain } from '../../../chronicle/kit/curtain'
import { KinematicBox } from '../../../chronicle/kit/kinematic'
import { ARMORED_SHADE_STYLE } from '../../../chronicle/visuals/shade'
import { createSaekiPlaceholder } from '../saeki'
import { OfficeStaff } from '../officeStaff'
import { IdoPanelFx } from '../idoPanelFx'
import { NAMBA_SPAWNS } from '../layout'
import type { IdoMarker } from '../ido'
import linesData from './lines_v7.json'
import { buildChronicleNamba, type ChronicleNambaScene } from './sceneV7'
import { AlleyTime, ALLEY_PALETTES, sunDirection } from './alleyTime'
import { ArmorPlates, createArmorPlateObjects } from './armorPlates'
import { KanbanSurge } from './kanbanSurge'
import { IdoSearchPanel, SketchCloseup, recordImage, setRecordArt } from './idoSearch'
import { V7_ART, loadArtCanvas } from '../../../chronicle/art'
import { IDO_RECORDS, SEARCH_WORDS, recordOfKanban } from './idoSearchLogic'
import { createOfujiPlaceholder } from './ofuji'
import { DefenseDirector } from './defenseDirector'
import { ARMOR_SOURCES, KANBAN, LAB, SHRINE, SPOTS_V7, V7_SPAWNS, type KanbanId } from './layoutV7'
import { KANBAN_RECORD, STEP_SPAWN, STEP_TIME, combatStep, nambaV7Objective, nambaV7Step, stepMusic, type NambaV7Ctx, type NambaV7Step } from './storyNamba'
import { BEAST_STATS, BeastFight, type BeastHandle } from './beastFight'
import { BEAST_TUNING } from './beastLogic'
import { KanbanQr } from './qrSign'
import { NpcAntics } from './npcAntics'
import { paintEdoMorning } from './recordArt'
import { MobTalkV7 } from './mobTalkV7'

const lines = new DialogueDB(linesData)
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** よろいの影獣（6 章）：はじめに動かない秒・体力 0 で戻るときのやり直しの位置（水辺の広場の東。看板の柱のそば） */
const BEAST = { firstStun: 2.0, retry: v(2.6, 0, 4.4) }

type Spot = { pos: THREE.Vector3; face: THREE.Vector3 }
type Person = Character

/** 町のかんばんの記録を見ている */
type Rec = { kanban: KanbanId; marker: IdoMarker; t: number; talked: boolean; id: string }

const DAY = ALLEY_PALETTES.day

export class ChronicleNambaStage implements Stage {
  readonly key = '2026' as const
  readonly era = ERA_PRESENT
  readonly label = '2026年　大阪・なんば'
  readonly subtitle = '60年前の大阪'
  readonly environment: StageEnvironment = {
    sky: DAY.sky,
    sunDir: sunDirection(DAY.sunYaw, DAY.sunEl),
    sunColor: DAY.sunColor,
    sunIntensity: DAY.sunIntensity,
    hemi: DAY.hemi,
    hdri: './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    envIntensity: DAY.env,
    fog: DAY.fog,
    grade: { saturation: DAY.grade.saturation, contrast: DAY.grade.contrast },
  }
  private ns!: ChronicleNambaScene
  private matsui!: Person
  private saeki!: Person
  private ofuji!: Person
  private staff: OfficeStaff | null = null
  private rt: StageRuntime | null = null
  private spawnId = 'v7_nextmake'
  private step: NambaV7Step = 'arrive'
  private readonly clock = new SceneClock()
  private readonly walker = new Walker()
  private curtain: Curtain | null = null
  private time: AlleyTime | null = null
  private busy = false
  // 6 章
  private arrival: { t: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null
  private fight: BeastFight | null = null
  private armorFx: ArmorPlates | null = null
  /** 佐伯さんの手のタブレット（QR の読みこみをためしている） */
  private tablet: THREE.Group | null = null
  private qr: KanbanQr | null = null
  private readonly antics = new NpcAntics()
  private mob: MobTalkV7 | null = null
  /** 戦いの間の小さな台詞（戦いを止めない） */
  private readonly sayQ: Array<{ speaker: string; text: string }> = []
  private sayT = 0
  /** 町のかんばん C の QR を読んでいる（出発） */
  private reading = false
  /** 影獣と戦う間、NEXTMAKE の入口をふさぐ（中へにげこまない・獣も入らない） */
  private doorBlock: KinematicBox | null = null
  private toLab = false
  private labGreeted = false
  private searchOpen = false
  private readonly checked = new Set<string>()
  private search: IdoSearchPanel | null = null
  private sketch: SketchCloseup | null = null
  private readonly panelFx = new IdoPanelFx()
  private rec: Rec | null = null
  private surgeC: KanbanSurge | null = null
  // 9 章
  private toShrine = false
  private defense: DefenseDirector | null = null
  private ringOpen = false
  private readonly eye = new THREE.Vector3()
  private eyes: THREE.Object3D | null = null
  private readonly tmp = new THREE.Vector3()
  private readonly markAt = [v(0, 0, 0), v(0, 0, 0), v(0, 0, 0), v(0, 0, 0)]
  private readonly marks: ObjectiveMark[] = []

  // ================================================================ 読み込み・配置

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    const f = (n: string) => ctx.story.get(n)
    this.step = nambaV7Step(f)
    const want = STEP_SPAWN[this.step]
    this.spawnId = ctx.spawnId && V7_SPAWNS[ctx.spawnId] && ctx.params.get('spawn') === ctx.spawnId ? ctx.spawnId : want
    const npcs = Promise.all([ctx.loadNpc('matsui', 1.72), ctx.loadNpc('saeki', 1.6, () => createSaekiPlaceholder(1.6)), ctx.loadNpc('ofuji', 1.42, () => createOfujiPlaceholder(1.42) as unknown as Character)])
    ctx.progress(0.08, 'テクスチャを読み込み中…')
    await ctx.yieldFrame()
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    this.ns = await buildChronicleNamba(ctx.quality, aniso, ctx.progress, ctx.yieldFrame)
    ctx.progress(0.7, 'マツイ社長・佐伯さん・おふじさんを読み込み中…')
    await ctx.yieldFrame()
    const [matsui, saeki, ofuji] = await npcs
    this.matsui = matsui
    this.saeki = saeki
    this.ofuji = ofuji
    for (const ch of [matsui, saeki, ofuji]) {
      ch.root.rotation.order = 'YXZ'
      this.ns.root.add(ch.root)
      this.ns.obstacles.push(ch.root.position)
    }
    this.staff = new OfficeStaff()
    this.ns.root.add(this.staff.group)
    this.armorFx = new ArmorPlates()
    this.ns.root.add(this.armorFx.group)
    this.surgeC = new KanbanSurge(this.ns.idos.c)
    this.ns.root.add(this.surgeC.group)
    // かんばんの大きな QR（4 本）と、路地のかんばんの前にうかぶ QR
    const I = this.ns.idos
    this.qr = new KanbanQr(
      (['a', 'b', 'c', 'd'] as const).map((k, i) => ({ marker: I[k], yaw: KANBAN[k].yaw, seed: 11 + i * 7 })),
      { marker: I.c, yaw: KANBAN.c.yaw, seed: 25 },
    )
    this.ns.root.add(this.qr.group)
    this.ns.root.add(this.antics.group)
    this.tablet = makeTablet()
    return { root: this.ns.root, colliders: this.ns.colliders, claw: { targets: this.ns.claw.targets, movables: this.ns.claw.movables }, lights: this.ns.lights }
  }

  spawn(id: string | null): SpawnPoint {
    return V7_SPAWNS[id ?? this.spawnId] ?? V7_SPAWNS[this.spawnId] ?? NAMBA_SPAWNS[id ?? ''] ?? V7_SPAWNS.v7_nextmake
  }

  private place(ch: Person, s: Spot): void {
    ch.root.position.copy(s.pos)
    this.walker.face(ch, s.face)
  }

  /** 段階ごとの人の居場所 */
  private placeForStep(step: NambaV7Step): void {
    const S = SPOTS_V7
    this.ofuji.root.visible = step === 'shrine_talk' || step === 'defense' || step === 'return'
    this.ofuji.setPose('idle')
    switch (step) {
      case 'arrive':
        this.place(this.matsui, S.matsuiKanban)
        this.place(this.saeki, S.saekiKanban)
        break
      case 'sketch':
      case 'search':
        this.place(this.matsui, S.matsuiSketch)
        this.place(this.saeki, S.saekiTerminal)
        break
      case 'depart':
      case 'between':
        this.place(this.matsui, S.matsuiAlley)
        this.place(this.saeki, S.saekiAlley)
        break
      case 'shrine_talk':
        this.place(this.matsui, { pos: S.matsuiRunIn[0], face: KANBAN.c.pos })
        this.place(this.saeki, { pos: S.saekiRunIn[0], face: KANBAN.c.pos })
        this.place(this.ofuji, S.ofujiWind)
        this.ofuji.setPose('crank')
        break
      case 'defense':
        this.place(this.matsui, S.matsuiDefense)
        this.place(this.saeki, S.saekiDefense)
        this.place(this.ofuji, S.ofujiDefense)
        break
      case 'return':
        this.place(this.matsui, S.matsuiShrine)
        this.place(this.saeki, S.saekiShrine)
        this.place(this.ofuji, S.ofujiAside)
        break
    }
  }

  begin(rt: StageRuntime): void {
    this.rt = rt
    const f = (n: string) => rt.story.get(n)
    this.step = nambaV7Step(f)
    const ui = rt.renderer.domElement.ownerDocument.getElementById('ui')
    this.curtain = new Curtain(ui ?? undefined)
    this.search = new IdoSearchPanel(ui)
    this.sketch = new SketchCloseup(ui)
    this.eyes = rt.nexmax.root.getObjectByName('eyeballs') ?? rt.nexmax.root.getObjectByName('head') ?? null
    // 源兵衛の書のイラスト（読めなければ recordArt.ts のキャンバスの絵のまま）
    void loadArtCanvas(V7_ART.bookPage1, 720).then((c) => setRecordArt('genbeiPage', c))
    this.ns.obstacles.push(rt.player.position)
    // 路地の時間（空・太陽はシェルの物を動かす）
    this.time = new AlleyTime({ scene: rt.scene, sky: rt.sky, sun: rt.sun, post: rt.post }, this.ns.glowMats)
    this.ns.attachTime(this.time)
    this.time.set(STEP_TIME[this.step], true)
    this.time.apply()
    this.placeForStep(this.step)
    rt.combat.enabled = combatStep(this.step)
    rt.combat.onEnemyDefeated = (h) => this.onDefeated(h)
    rt.combat.onRespawn = () => this.onCombatRespawn()
    // 段階ごとの見た目
    const sh = this.ns.shrine
    sh.setDoors(this.step === 'shrine_talk' ? 0.85 : 0)
    sh.setKey(this.step === 'shrine_talk')
    sh.setGlow(this.step === 'defense' ? 0.6 : 0.25)
    sh.setSun(this.step === 'return' ? 1 : 0)
    // 町の人と話す（F）
    this.mob = new MobTalkV7(this.ns.pedestrians, ui, rt.camera, this.staff, this.ns.root)
    if (this.step === 'arrive') {
      // かんばんの光の中で待つ（時代カードのあと、社長と佐伯さんが QR をためしたら出てくる）。それまでは見えない
      const k = this.ns.idos.a
      this.arrival = { t: -1, from: k.base.clone().addScaledVector(k.front, 0.55).setY(0.25), to: v(-4.35, 0, 8.65) }
      rt.player.beginExternal()
      rt.player.moveExternal(this.arrival.from, 1 / 60)
      rt.nexmax.root.visible = false
      this.ns.surge.setLevel(0)
      rt.setControlLocked(true)
      this.busy = true
      if (this.tablet) this.saeki.handAnchor.add(this.tablet)
    } else if (this.step === 'shrine_talk') {
      this.surgeC?.setLevel(0.6)
    } else if (this.step === 'defense') {
      this.ns.skyCrack.setCrack(1, true)
      this.defense = this.makeDefense(rt)
    } else if (this.step === 'return') {
      this.openRing(rt)
    } else if (this.step === 'search') {
      // セーブから：検索の画面はもう一度ひらく
      this.searchOpen = false
    }
    rt.save(this.spawnId)
    if (rt.params.has('debug')) {
      ;(window as unknown as { __nambaDev?: unknown }).__nambaDev = {
        tp: (x: number, z: number, facing?: number) => rt.player.teleport(new THREE.Vector3(x, 0, z), facing),
        stage: this,
      }
    }
  }

  revealed(rt: StageRuntime): void {
    if (this.step === 'arrive') void this.runArrival(rt)
    else if (this.step === 'shrine_talk') void this.runArrive9(rt)
    else if (this.step === 'defense') void this.runDefenseResume(rt)
    else if (this.step === 'between') void rt.dialogue(lines.lines('between'))
  }

  // ================================================================ 6 章：到着・よろいの影獣

  private async runArrival(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    const k = this.ns.idos.a
    const m = this.matsui
    const s = this.saeki
    // 社長と佐伯さんが、立てたばかりのかんばんの前で、QR の読みこみをためしている
    this.walker.face(s, k.plate)
    this.walker.face(m, k.plate)
    void rt.cinematic({ look: v(k.plate.x - 0.5, 1.0, k.plate.z + 0.9), from: v(-2.0, 1.75, 10.6), hold: Infinity, inSec: 0.4, fov: 50, arc: 0 })
    const QT = lines.lines('qr_test')
    await rt.dialogue(QT.slice(0, 1))
    // タブレットから板へ光（読み取りの線が走る）
    const tab = this.tabletPos()
    for (let i = 0; i < 8; i++) {
      k.setScan(tab, Math.min(1, (i + 1) / 3))
      await this.clock.wait(0.08)
    }
    await rt.dialogue(QT.slice(1))
    // QR を読むと……かんばんが光って、ネクマックスが出てくる
    k.setScan(null, 0)
    this.ns.surge.surge({ sec: 2.6 })
    rt.oreGlow(2)
    await this.clock.wait(0.5)
    rt.nexmax.root.visible = true
    if (this.arrival) this.arrival.t = 0
    await this.clock.until(() => this.arrival === null, 3)
    this.antics.emote(m, 'bangq', 2.4)
    this.antics.play(m, 'leanBack')
    this.antics.emote(s, 'bang', 2.0)
    this.antics.play(s, 'shake')
    this.walker.face(m, rt.player.position)
    this.walker.face(s, rt.player.position)
    rt.player.turnToward(m.root.position.x - rt.player.position.x, m.root.position.z - rt.player.position.z, 1, 1)
    const mid = this.tmp.copy(m.root.position).lerp(s.root.position, 0.5)
    void rt.cinematic({ look: v(mid.x, 1.25, mid.z), from: v(-4.4, 1.55, 10.6), hold: Infinity, inSec: 1.2, fov: 50 })
    await rt.dialogue(lines.lines('arrive_out'))
    // かんばんの光が、もう一度ゆがむ（黒い影の獣）
    const center = this.ns.surge.center.clone().setY(0)
    void rt.cinematic({ look: v(center.x, 1.3, center.z), from: v(-1.6, 1.9, 10.4), hold: Infinity, inSec: 1.0, fov: 50, shake: 0.08 })
    this.ns.surge.surge({ dark: true, sec: 3.6 })
    rt.shake(0.25)
    this.antics.emote(m, 'bang', 1.6)
    this.antics.play(m, 'jump')
    const L = lines.lines('beast_emerge')
    await rt.dialogue(L.slice(0, 2))
    // 獣が出る（戦闘の欠け重。よろいの板は見えないまま付けておき、飛んでくる板の演出のあとで見せる）
    const plateObjs = createArmorPlateObjects()
    for (const p of plateObjs) p.visible = false
    const yaw = Math.atan2(-(rt.player.position.x - center.x), -(rt.player.position.z - center.z))
    const T = BEAST_TUNING
    const h = rt.combat.spawn('brute', center, {
      tag: 'beast',
      style: ARMORED_SHADE_STYLE,
      hp: T.hp,
      stats: BEAST_STATS,
      keepHpOnRespawn: true,
      scale: T.scale,
      leash: 80,
      hidden: true,
      yaw,
      plates: plateObjs,
      platesLocked: true,
      plateThrow: true,
      throwDamage: T.throwDamage,
      aimCone: T.aimCone,
      onPlate: (left) => this.fight?.onPlate(left),
      onPlateLocked: () => this.fight?.onPlateLocked(),
      onPlateHit: () => this.fight?.onPlateHit(),
    }) as BeastHandle
    rt.combat.appear(h)
    h.brain.stun(6)
    this.setPromenadeCrowd(false)
    // 佐伯さんのタブレットはしまって、二人は NEXTMAKE の入口へ下がる
    this.tablet?.removeFromParent()
    void this.walker.walkTo(this.matsui, [SPOTS_V7.matsuiFight.pos], 2.4, center)
    void this.walker.walkTo(this.saeki, [SPOTS_V7.saekiSafe.pos], 2.4, center)
    await rt.dialogue(L.slice(2))
    // まわりの看板・鉄板が飛んできて、よろいになる
    const fx = this.armorFx as ArmorPlates
    fx.attach(h.model.root)
    fx.hideAll()
    void rt.cinematic({ look: v(center.x, 1.5, center.z), from: v(-0.9, 2.2, 9.6), hold: Infinity, inSec: 0.8, fov: 52 })
    for (let i = 0; i < ARMOR_SOURCES.length; i++) {
      const src = ARMOR_SOURCES[i]
      const it = this.ns.armorSources.items.find((x) => x.id === src.id)
      fx.reattach(i, (it?.pos ?? src.pos).clone(), 0.7)
      this.ns.armorSources.take(src.id)
      rt.shake(0.1)
      await this.clock.wait(0.45)
    }
    await this.clock.wait(0.5)
    fx.attach(null)
    for (const p of plateObjs) p.visible = true
    await rt.dialogue(lines.lines('beast_armor'))
    // 戦いのカメラ：プレイヤーのうしろから、獣の方を見る
    const pp = rt.player.position
    const start = v(-0.4, 0, 9.0)
    rt.player.teleport(start, Math.atan2(-(center.x - start.x), -(center.z - start.z)))
    rt.camRig.yaw = Math.atan2(pp.x - center.x, pp.z - center.z)
    rt.camRig.pitch = 0.32
    rt.endCinematic()
    // 戦い
    rt.combat.enabled = true
    rt.combat.setCheckpoint(BEAST.retry, Math.atan2(-(center.x - BEAST.retry.x), -(center.z - BEAST.retry.z)))
    rt.combat.showBoss(h, 'よろいの影獣')
    this.fight = new BeastFight(rt, h, plateObjs, this.ns.root, {
      saeki: this.saeki,
      walker: this.walker,
      saekiSafe: SPOTS_V7.saekiSafe.pos,
      say: (key) => this.sayLines(key),
      onGrab: () => this.sayLines('beast_grab'),
      onRelease: (byClaw) => this.sayLines(byClaw ? 'beast_released' : 'beast_dropped'),
    })
    this.fight.start(BEAST.firstStun)
    this.doorBlock = new KinematicBox(rt.phys, v(1.3, 1.6, 0.15), v(-10, 1.6, 11.05))
    this.busy = false
    rt.setControlLocked(false)
    this.sayLines('beast_hint')
  }

  /** 戦いの間の小さな台詞（会話の窓は出さず、戦いも止めない）。たまりすぎたら古いのを捨てる */
  private sayLines(key: string): void {
    for (const l of lines.lines(key)) this.sayQ.push(l)
    while (this.sayQ.length > 3) this.sayQ.shift()
  }

  private updateSay(dt: number, rt: StageRuntime): void {
    if (this.sayT > 0) this.sayT -= dt
    if (this.sayT > 0 || !this.sayQ.length || rt.talking) return
    const l = this.sayQ.shift() as { speaker: string; text: string }
    const sec = Math.min(4.2, 1.5 + [...l.text].length * 0.085)
    rt.say(l.speaker, l.text, sec)
    this.sayT = sec * 0.9
  }

  /** 佐伯さんのタブレットの位置（QR を読む光の始点） */
  private tabletPos(): THREE.Vector3 {
    if (this.tablet?.parent) {
      this.ns.root.updateMatrixWorld(true)
      return this.tablet.getWorldPosition(new THREE.Vector3())
    }
    return this.saeki.root.position.clone().setY(1.1)
  }

  /** 遊歩道を歩く町の人（影獣が出たら、にげていなくなる・たおしたら戻る） */
  private setPromenadeCrowd(on: boolean): void {
    for (const c of this.ns.pedestrians.group.children) if (c.position.z > 5 && c.position.z < 10.5 && c.position.x < 10) c.visible = on
  }

  private onDefeated(h: EnemyHandle): void {
    const rt = this.rt
    if (!rt) return
    if (h.tag === 'beast') void this.runBeastDown(rt)
    else this.defense?.onDefeated(h)
  }

  /** 影獣をたおした → 「君、だれや？」→ 名前とうしろの板で、まだ作っていないロボットに会った社長の大さわぎ → ラボへ */
  private async runBeastDown(rt: StageRuntime): Promise<void> {
    if (rt.story.get('v7_beast_down')) return
    this.busy = true
    this.fight?.finish()
    this.fight?.dispose()
    this.fight = null
    this.sayQ.length = 0
    this.doorBlock?.remove()
    this.doorBlock = null
    rt.combat.dropPlates()
    this.setPromenadeCrowd(true)
    rt.combat.showBoss(null)
    await this.clock.wait(0.8)
    rt.setControlLocked(true)
    this.ns.surge.surge({ dark: true, sec: 1.8, strength: 0.5 })
    const m = this.matsui
    const s = this.saeki
    s.root.position.y = 0
    // 二人がかけよってくる（ネクマックスの前に）
    const p = rt.player.position.clone()
    const toward = (dx: number, dz: number) => {
      const q = v(p.x + dx, 0, p.z + dz)
      q.x = Math.min(6, Math.max(-18, q.x))
      q.z = Math.min(10.4, Math.max(1.4, q.z))
      return q
    }
    const mAt = toward(1.3, 1.0)
    const sAt = toward(-1.3, 1.1)
    void this.walker.walkTo(m, [mAt], 2.6, p)
    void this.walker.walkTo(s, [sAt], 2.4, p)
    rt.player.teleport(p, Math.atan2(-(mAt.x - p.x), -(mAt.z - p.z)))
    const side = this.tmp.set(mAt.x - sAt.x, 0, mAt.z - sAt.z).normalize()
    const camFrom = v(p.x - side.z * 3.2 + (mAt.x + sAt.x - 2 * p.x) * 0.5, 1.6, p.z + side.x * 3.2 + (mAt.z + sAt.z - 2 * p.z) * 0.5)
    void rt.cinematic({ look: v((p.x + mAt.x + sAt.x) / 3, 1.15, (p.z + mAt.z + sAt.z) / 3), from: camFrom, hold: Infinity, inSec: 1.2, fov: 50 })
    const D = lines.lines('beast_down')
    await rt.dialogue(D.slice(0, 1))
    await this.clock.until(() => this.walker.speedOf(m) === 0, 3)
    this.walker.face(m, p)
    this.walker.face(s, p)
    await rt.dialogue(D.slice(1))
    // 「ネクマックス!?」：とびあがる
    const N = lines.lines('paradox_name')
    this.antics.play(m, 'jump')
    this.antics.emote(m, 'bangq', 2.2)
    rt.shake(0.08)
    await rt.dialogue(N.slice(0, 1))
    this.antics.play(m, 'shake', 1.6)
    this.antics.emote(m, 'sweat', 2.6)
    await rt.dialogue(N.slice(1, 2))
    this.antics.play(s, 'shy', 2.4)
    this.antics.emote(s, 'note', 2.0)
    await rt.dialogue(N.slice(2))
    // うしろの板を見せる（ネクマックスがうしろを向く）
    const back = Math.atan2(p.x - mAt.x, p.z - mAt.z)
    rt.player.teleport(p, back)
    const plateAt = v(p.x, 0.62, p.z)
    void rt.cinematic({ look: plateAt, from: v(p.x + (mAt.x - p.x) * 0.55, 1.05, p.z + (mAt.z - p.z) * 0.55), hold: Infinity, inSec: 0.9, fov: 38, arc: 0 })
    await this.clock.wait(1.1)
    const PL = lines.lines('paradox_plate')
    this.antics.play(m, 'hop2')
    this.antics.emote(m, 'bang', 1.8)
    await rt.dialogue(PL.slice(0, 1))
    rt.player.teleport(p, Math.atan2(-(mAt.x - p.x), -(mAt.z - p.z)))
    void rt.cinematic({ look: v(mAt.x, 1.35, mAt.z), from: v(p.x + (mAt.x - p.x) * 0.2 - side.z * 1.4, 1.55, p.z + (mAt.z - p.z) * 0.2 + side.x * 1.4), hold: Infinity, inSec: 0.8, fov: 44 })
    this.antics.play(m, 'leanBack', 1.2)
    this.antics.emote(m, 'bangq', 2.4)
    await rt.dialogue(PL.slice(1, 2))
    this.antics.play(m, 'headHold', 3.2)
    this.antics.emote(m, 'swirl', 3.2)
    await rt.dialogue(PL.slice(2))
    void rt.cinematic({ look: v((p.x + mAt.x + sAt.x) / 3, 1.15, (p.z + mAt.z + sAt.z) / 3), from: camFrom, hold: Infinity, inSec: 1.0, fov: 50 })
    await rt.dialogue(lines.lines('tell_2086'))
    rt.endCinematic()
    rt.combat.enabled = false
    rt.story.set('v7_beast_down', true)
    rt.save('v7_nextmake')
    this.step = 'sketch'
    this.toLab = true
    this.busy = false
    rt.setControlLocked(false)
    // 社長はラボの構想ボードへ、佐伯さんは自分の作業台へ（入口の前を通って）
    const toLab = [v(-10.0, 0, 9.4), v(-9.9, 0, 10.2), v(-9.9, 0, 11.6), v(-9.7, 0, 15.8), v(-6.5, 0, 16.6), v(-6.5, 0, 18.0), v(-10.2, 0, 18.45), v(-13.4, 0, 18.3)]
    void this.walker.walkTo(this.matsui, [...toLab, SPOTS_V7.matsuiSketch.pos], 1.9, LAB.sketch)
    void this.walker.walkTo(this.saeki, [...toLab.slice(0, 7), SPOTS_V7.saekiTerminal.pos], 1.8, SPOTS_V7.saekiTerminal.face)
  }

  // ================================================================ 6 章：社長の絵・IDO 検索・町のかんばん

  private async runSketch(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    this.toLab = false
    this.walker.stop(this.matsui)
    if (this.matsui.root.position.distanceTo(SPOTS_V7.matsuiSketch.pos) > 2.5) this.place(this.matsui, { pos: SPOTS_V7.matsuiSketch.pos, face: LAB.sketch })
    rt.player.turnToward(LAB.sketch.x - rt.player.position.x, LAB.sketch.z - rt.player.position.z, 1, 1)
    void rt.cinematic({ look: LAB.sketch.clone(), from: v(-16.6, 1.75, 20.0), hold: Infinity, inSec: 1.1, fov: 46, arc: 0 })
    const SS = lines.lines('sketch_show')
    await rt.dialogue(SS.slice(0, 1))
    const sk = this.sketch as SketchCloseup
    sk.show('社長の絵')
    await this.clock.wait(0.4)
    // 「……って、本人の前で見せるの、めっちゃはずかしいな！」
    this.antics.play(this.matsui, 'shy', 2.6)
    this.antics.emote(this.matsui, 'sweat', 2.6)
    await rt.dialogue(SS.slice(1, 2))
    await rt.dialogue(SS.slice(2))
    sk.markCorner(true)
    sk.setCaption('すみに、小さく「NEXTMAKE 001」')
    await this.clock.wait(0.6)
    sk.zoomCorner(true)
    await rt.dialogue(lines.lines('sketch_corner'))
    sk.hide()
    // 「未来の僕、ちゃんと君を作れたんやな。……いや、まだ作ってへんのか！」：頭をかかえる
    const mp = this.matsui.root.position
    this.walker.face(this.matsui, rt.player.position)
    void rt.cinematic({ look: v(mp.x, 1.35, mp.z), from: v(mp.x + 1.6, 1.6, mp.z - 1.9), hold: Infinity, inSec: 0.9, fov: 46, arc: 0 })
    const SP = lines.lines('sketch_paradox')
    this.antics.emote(this.matsui, 'note', 1.8)
    await rt.dialogue(SP.slice(0, 1))
    this.antics.play(this.matsui, 'jump')
    this.antics.emote(this.matsui, 'bangq', 1.2)
    await this.clock.wait(0.5)
    this.antics.play(this.matsui, 'headHold', 4.0)
    this.antics.emote(this.matsui, 'swirl', 4.0)
    await rt.dialogue(SP.slice(1, 2))
    await rt.dialogue(SP.slice(2))
    this.antics.stopBody(this.matsui)
    rt.endCinematic()
    rt.story.set('v7_sketch_seen', true)
    rt.save('v7_lab')
    // 佐伯さんが石の音を聞きに来る
    const s = this.saeki
    const p = rt.player.position
    const near = v(p.x + 0.9, 0, p.z + 0.7)
    await this.walker.walkTo(s, [near], 1.8, p)
    void rt.cinematic({ look: v(p.x, 0.9, p.z), from: v(p.x + 2.6, 1.6, p.z - 0.6), hold: Infinity, inSec: 1.0, fov: 46 })
    await rt.dialogue(lines.lines('saeki_stone'))
    rt.endCinematic()
    this.step = 'search'
    void this.walker.walkTo(s, [SPOTS_V7.saekiTerminal.pos], 1.8, SPOTS_V7.saekiTerminal.face)
    this.busy = false
    rt.setControlLocked(false)
  }

  /** 佐伯さんの端末：はじめは「時計」でさがす場面。そのあとは画面をひらく・とじる */
  private async runTerminal(rt: StageRuntime): Promise<void> {
    const panel = this.search as IdoSearchPanel
    if (this.searchOpen) {
      if (panel.visible) panel.close()
      else {
        panel.open()
        if (!panel.results.length) void panel.search(SEARCH_WORDS.first, { perChar: 0.05, think: 0.2 })
        panel.setChecked(this.checked)
        panel.setFoot('F でとじる', 'F')
      }
      return
    }
    this.busy = true
    rt.setControlLocked(true)
    const t = LAB.terminal
    void rt.cinematic({ look: v(t.x, 1.2, t.z), from: v(t.x + 1.1, 1.65, t.z - 2.4), hold: Infinity, inSec: 1.0, fov: 50, arc: 0 })
    await rt.dialogue(lines.lines('search_start'))
    panel.open()
    panel.setChecked(this.checked)
    await panel.search(SEARCH_WORDS.first)
    await rt.dialogue(lines.lines('search_result'))
    this.searchOpen = true
    panel.setFoot('町で かんばんの前に行って F で記録を見よう')
    await rt.dialogue(lines.lines('search_go'))
    panel.close()
    rt.endCinematic()
    // 社長と佐伯さんは表の通りで待つ
    const out = [v(-10.2, 0, 18.45), v(-6.5, 0, 18.0), v(-6.5, 0, 16.6), v(-9.7, 0, 15.8), v(-9.9, 0, 11.6), v(-9.9, 0, 10.2), v(-6.5, 0, 8.9)]
    void this.walker.walkTo(this.matsui, [v(-13.4, 0, 18.3), ...out, v(6.0, 0, 9.0), SPOTS_V7.matsuiWait.pos], 2.0, SPOTS_V7.matsuiWait.face)
    void this.walker.walkTo(this.saeki, [...out, v(5.0, 0, 8.7), SPOTS_V7.saekiWait.pos], 2.0, SPOTS_V7.saekiWait.face)
    this.busy = false
    rt.setControlLocked(false)
  }

  /** かんばんの前で F：記録のパネル（IDO の歴史案内と同じ見た目で、絵が組み上がる） */
  private showRecord(k: KanbanId, rt: StageRuntime): void {
    const r = k === 'a' ? null : recordOfKanban(k)
    if (!r) return
    const img = recordImage(r.image)
    if (img) this.panelFx.start(img)
    rt.hud.showIdo({ ...r.panel, image: img ? this.panelFx.canvas : null })
    this.rec = { kanban: k, marker: this.ns.idos[k], t: 0, talked: false, id: r.id }
    const first = !this.checked.has(r.id)
    this.checked.add(r.id)
    this.search?.setChecked(this.checked)
    rt.setControlLocked(true)
    const key = `rec_${r.id}`
    void rt.dialogue(lines.lines(key)).then(() => {
      if (!this.rec) return
      this.rec.talked = true
      if (r.id === 'old_alley' && first) void this.runAlleyFound(rt)
    })
  }

  private updateRecord(dt: number, rt: StageRuntime): void {
    const s = this.rec
    if (!s) return
    s.t += dt
    this.panelFx.update(dt)
    const mk = s.marker
    if (s.t < 1.3) rt.player.turnToward(mk.plate.x - rt.player.position.x, mk.plate.z - rt.player.position.z, dt, 8)
    if (s.t > 1.3 && !this.busy) rt.setControlLocked(false)
    this.eyePos(rt)
    mk.setScan(s.t < 1.5 ? this.eye : null, s.t < 1.5 ? Math.min(1, s.t / 0.35) * Math.min(1, (1.5 - s.t) / 0.25) : 0)
    const p = rt.player.position
    const away = Math.hypot(p.x - mk.base.x, p.z - mk.base.z) > 3.4
    if ((s.talked && s.t > 2.5 && !this.busy) || (away && s.t > 1.3) || s.t > 30) this.closeRecord(rt)
  }

  private closeRecord(rt: StageRuntime): void {
    if (!this.rec) return
    this.rec.marker.setScan(null, 0)
    this.rec = null
    rt.hud.hideIdo()
    if (!this.busy) rt.setControlLocked(false)
  }

  private eyePos(rt: StageRuntime): THREE.Vector3 {
    if (this.eyes) {
      rt.nexmax.root.updateMatrixWorld(true)
      this.eyes.getWorldPosition(this.eye)
    } else this.eye.copy(rt.player.position).setY(1.0)
    return this.eye
  }

  /** 路地のかんばんで「青い」も合う → 社長と佐伯さんが来る → 「時計」と「青い」で 1 本 */
  private async runAlleyFound(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    const L = lines.lines('alley_found')
    await rt.dialogue(L.slice(0, 1))
    this.closeRecord(rt)
    rt.setControlLocked(true)
    const m = this.walker.walkTo(this.matsui, [v(16.6, 0, 10.6), SPOTS_V7.matsuiAlley.pos], 2.6, KANBAN.c.pos)
    const s = this.walker.walkTo(this.saeki, [v(16.3, 0, 10.6), v(16.9, 0, 13.0), v(17.4, 0, 16.6), SPOTS_V7.saekiAlley.pos], 2.6, KANBAN.c.pos)
    void rt.cinematic({ look: v(16.3, 1.1, 15.8), from: v(17.5, 1.9, 12.0), hold: Infinity, inSec: 1.2, fov: 54 })
    await Promise.race([Promise.all([m, s]), this.clock.wait(6)])
    const panel = this.search as IdoSearchPanel
    panel.open()
    panel.setChecked(this.checked)
    await rt.dialogue(L.slice(1, 2))
    await panel.search(SEARCH_WORDS.second)
    await rt.dialogue(L.slice(2, 3))
    panel.close()
    await rt.dialogue(L.slice(3))
    rt.endCinematic()
    rt.story.set('v7_search_done', true)
    rt.save('v7_alley')
    this.step = 'depart'
    this.busy = false
    rt.setControlLocked(false)
  }

  /** 路地のかんばんの QR を読む → 目から光・うかぶ QR・記録の絵が組み上がる → 石がコチ、コチ → 絵が本物の景色に → 1726年へ */
  private async runDepart(rt: StageRuntime): Promise<void> {
    this.busy = true
    this.reading = true
    rt.setControlLocked(true)
    const c = this.ns.idos.c
    const qr = this.qr as KanbanQr
    rt.player.turnToward(c.plate.x - rt.player.position.x, c.plate.z - rt.player.position.z, 1, 1)
    void rt.cinematic({ look: v(c.plate.x, 1.1, c.plate.z), from: v(17.6, 1.7, 13.4), hold: Infinity, inSec: 1.0, fov: 50 })
    await rt.dialogue(lines.lines('depart_touch'))
    // QR を読む：板の前に大きな QR がうかび、目から光
    const hc = qr.holoCenter
    void rt.cinematic({ look: hc.clone(), from: v(hc.x + 1.9, hc.y + 0.15, hc.z - 1.1), hold: Infinity, inSec: 0.8, fov: 46, arc: 0 })
    qr.setHolo(1)
    for (let i = 0; i < 6; i++) {
      c.setScan(this.eyePos(rt), Math.min(1, (i + 1) / 3))
      await this.clock.wait(0.1)
    }
    const rec = recordOfKanban('c')
    const img = rec ? recordImage(rec.image) : null
    if (img) this.panelFx.start(img)
    if (rec) rt.hud.showIdo({ ...rec.panel, image: img ? this.panelFx.canvas : null })
    await this.clock.wait(1.3)
    // 背中の石が、記録に合わせて、コチ、コチ……
    void rt.dialogue(lines.lines('depart_kochi'))
    for (let i = 0; i < 8; i++) {
      const k = (i + 1) / 8
      rt.oreGlow(1.3 + k * 1.1)
      qr.setResonance(k)
      rt.hud.setIdoGlitch(k * 0.8)
      this.surgeC?.setLevel(0.15 + k * 0.35)
      rt.shake(0.05 + k * 0.08)
      c.setScan(this.eyePos(rt), 1)
      await this.clock.wait(0.24)
      rt.oreGlow(1.0)
      await this.clock.wait(0.24)
    }
    // かんばんの絵が、ゆらりと本物の景色に
    this.panelFx.start(this.edoView())
    rt.hud.setIdoGlitch(0.35)
    this.surgeC?.setLevel(0.65)
    void rt.cinematic({ look: v(c.plate.x, 1.1, c.plate.z), from: v(17.6, 1.7, 13.4), hold: Infinity, inSec: 0.9, fov: 52 })
    await this.clock.wait(1.0)
    await rt.dialogue(lines.lines('depart_go'))
    this.surgeC?.setLevel(1)
    rt.oreGlow(2.4)
    rt.shake(0.25)
    rt.hud.hideIdo()
    rt.rift.openAt(rt.player.position.clone().lerp(c.base, 0.4), eraTintHex(1726), 1.6, 2.2)
    await this.clock.wait(0.7)
    c.setScan(null, 0)
    qr.setHolo(0)
    qr.setResonance(0)
    rt.endCinematic(true)
    rt.setControlLocked(false)
    this.busy = false
    this.reading = false
    const r = rt.travel({ to: '1726', cause: 'ido_kanban', spawn: 'v7_alley' })
    if (!r.ok) {
      rt.hud.toast(r.reason)
      rt.rift.close()
      this.surgeC?.setLevel(0)
    }
  }

  /** 本物の景色（300 年前の路地の朝）。1 回だけ描く */
  private edoImg: HTMLCanvasElement | null = null
  private edoView(): HTMLCanvasElement {
    if (!this.edoImg) this.edoImg = paintEdoMorning(720, 300, 5)
    return this.edoImg
  }

  // ================================================================ 9 章：社長との約束

  private async runArrive9(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    this.surgeC?.surge({ sec: 2.0 })
    rt.oreGlow(1.6)
    // 社長と佐伯さんが表の通りからかけつける
    const m = this.walker.walkTo(this.matsui, SPOTS_V7.matsuiRunIn.slice(1), 3.0, rt.player.position)
    void this.walker.walkTo(this.saeki, SPOTS_V7.saekiRunIn.slice(1), 2.8, rt.player.position)
    void rt.cinematic({ look: v(16.8, 1.3, 13.4), from: v(17.4, 1.8, 18.2), hold: Infinity, inSec: 1.2, fov: 54 })
    await Promise.race([m, this.clock.wait(4)])
    this.surgeC?.setLevel(0)
    rt.player.turnToward(this.matsui.root.position.x - rt.player.position.x, this.matsui.root.position.z - rt.player.position.z, 1, 1)
    const A9 = lines.lines('arrive9')
    await rt.dialogue(A9.slice(0, 1))
    // 「おお、帰れたんか！」でとびあがって、「……って、また来たんか？」で首をかしげる
    this.antics.play(this.matsui, 'hop2')
    this.antics.emote(this.matsui, 'note', 1.4)
    this.antics.emote(this.saeki, 'bang', 1.4)
    await this.clock.wait(0.3)
    void this.clock.wait(1.3).then(() => {
      this.antics.emote(this.matsui, 'q', 2.0)
      this.antics.play(this.matsui, 'leanBack', 0.9)
    })
    await rt.dialogue(A9.slice(1, 2))
    await rt.dialogue(A9.slice(2))
    const LP = lines.lines('land_plan')
    await rt.dialogue(LP.slice(0, -1))
    // 佐伯さん「ほこらへ、行ってみましょう」：二人が先に路地のおくへ。ネクマックスの背中ごしに見送る
    void this.walker.walkTo(this.matsui, [v(17.65, 0, 15.2), v(17.35, 0, 19.4), SPOTS_V7.matsuiShrine.pos], 1.8, SHRINE.pos)
    void this.clock.wait(0.7).then(() => this.walker.walkTo(this.saeki, [v(17.6, 0, 14.6), v(17.6, 0, 16.4), v(16.9, 0, 19.6), SPOTS_V7.saekiShrine.pos], 1.7, SHRINE.pos))
    const pp = rt.player.position
    rt.player.teleport(pp, Math.atan2(-(16.9 - pp.x), -(21 - pp.z)))
    // 向きが逆のショットなので、寄らずに切りかえる
    void rt.cinematic({ look: v(16.9, 1.0, 20.2), from: v(16.6, 2.3, 12.2), hold: Infinity, inSec: 0.05, fov: 54, arc: 0 })
    await rt.dialogue(LP.slice(-1))
    await this.clock.wait(1.2)
    rt.camRig.yaw = Math.PI
    rt.camRig.pitch = 0.3
    rt.endCinematic()
    this.toShrine = true
    this.busy = false
    rt.setControlLocked(false)
  }

  /** 空き地に入ると：おふじさん・錠前・佐伯さん → 夜 → 防衛戦 */
  private async runShrineMeet(rt: StageRuntime): Promise<void> {
    this.busy = true
    this.toShrine = false
    rt.setControlLocked(true)
    this.walker.clear()
    this.place(this.matsui, SPOTS_V7.matsuiShrine)
    this.place(this.saeki, SPOTS_V7.saekiShrine)
    const sh = this.ns.shrine
    sh.setDoors(0.85)
    sh.setKey(true)
    sh.setGlow(0.5)
    this.ofuji.setPose('crank')
    const ns = SPOTS_V7.nexmaxShrine
    rt.player.teleport(ns.pos, Math.atan2(-(ns.face.x - ns.pos.x), -(ns.face.z - ns.pos.z)))
    void rt.cinematic({ look: v(13.6, 1.0, 23.4), from: v(17.7, 1.75, 24.55), hold: Infinity, inSec: 1.3, fov: 52 })
    const L = lines.lines('shrine_meet')
    await rt.dialogue(L.slice(0, 2))
    this.ofuji.setPose('idle')
    sh.setKey(false)
    this.walker.face(this.ofuji, rt.player.position)
    await rt.dialogue(L.slice(2, 5))
    // 錠前を見せる：おふじさんは少しわきへ
    void this.walker.walkTo(this.ofuji, [SPOTS_V7.ofujiAside.pos], 1.0, ns.pos)
    void rt.cinematic({ look: sh.lockPoint(this.tmp).clone(), from: v(14.95, 1.35, 23.3), hold: Infinity, inSec: 1.0, fov: 34, arc: 0 })
    await rt.dialogue(L.slice(5, 6))
    // 佐伯さんとおふじさん
    this.walker.face(this.ofuji, this.saeki.root.position)
    this.walker.face(this.saeki, this.ofuji.root.position)
    void rt.cinematic({ look: v(14.65, 1.25, 24.95), from: v(17.2, 1.65, 23.6), hold: Infinity, inSec: 1.0, fov: 46 })
    await rt.dialogue(L.slice(6))
    rt.endCinematic()
    rt.story.set('v7_shrine_talk', true)
    rt.save('v7_shrine')
    // 夜になる
    await this.curtain?.set(true, 0.8)
    this.time?.set('night', true)
    this.time?.apply()
    sh.setDoors(0)
    this.placeForStep('defense')
    this.step = 'defense'
    rt.player.teleport(V7_SPAWNS.v7_shrine.pos, V7_SPAWNS.v7_shrine.facing)
    rt.camRig.yaw = V7_SPAWNS.v7_shrine.camYaw
    rt.camRig.pitch = V7_SPAWNS.v7_shrine.camPitch
    await this.curtain?.set(false, 0.8)
    this.defense = this.makeDefense(rt)
    await this.runNightFalls(rt)
  }

  private makeDefense(rt: StageRuntime): DefenseDirector {
    const d = new DefenseDirector(rt, this.ns)
    d.say = (key) => {
      const l = lines.lines(key)[0]
      if (l) rt.say(l.speaker, l.text, 3)
    }
    d.onLow = () => d.say?.('shrine_low')
    d.onBroken = () => void this.runShrineBroken(rt)
    d.onWavesCleared = () => void this.runProjection(rt)
    d.onWon = () => void this.runDawn(rt)
    return d
  }

  private async runNightFalls(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    this.ns.skyCrack.setCrack(1)
    void rt.cinematic({ look: v(16.6, 9.0, 30.0), from: v(16.6, 1.6, 20.6), hold: Infinity, inSec: 1.4, fov: 60, shake: 0.06 })
    await rt.dialogue(lines.lines('night_falls'))
    rt.endCinematic()
    this.busy = false
    rt.setControlLocked(false)
    this.defense?.start()
    void rt.dialogue(lines.lines('defense_hint'))
  }

  /** セーブ（防衛戦の途中）から：夜のまま、もう一度 1 波目から */
  private async runDefenseResume(rt: StageRuntime): Promise<void> {
    await this.runNightFalls(rt)
  }

  private async runShrineBroken(rt: StageRuntime): Promise<void> {
    if (this.busy) return
    this.busy = true
    rt.setControlLocked(true)
    await rt.dialogue(lines.lines('shrine_broken'))
    await this.curtain?.set(true, 0.6)
    this.defense?.restartWave()
    rt.player.teleport(V7_SPAWNS.v7_shrine.pos, V7_SPAWNS.v7_shrine.facing)
    rt.camRig.yaw = V7_SPAWNS.v7_shrine.camYaw
    rt.camRig.pitch = V7_SPAWNS.v7_shrine.camPitch
    await this.curtain?.set(false, 0.6)
    this.busy = false
    rt.setControlLocked(false)
  }

  private onCombatRespawn(): void {
    // 体力 0 で戻ったとき：影獣の体力は、やられる前のまま（keepHpOnRespawn）。はがした板もそのまま。防衛戦はそのまま（ほこらの体力も）
    this.fight?.onRespawn()
    this.defense?.onPlayerRespawn()
  }

  /** 2 波しのいだ：社長が路地のかんばんで「江戸の朝」を映す → 小さな影がにげる → 大きな影 */
  private async runProjection(rt: StageRuntime): Promise<void> {
    this.busy = true
    await this.clock.wait(0.6)
    rt.setControlLocked(true)
    const m = this.matsui
    void rt.cinematic({ look: v(18.0, 1.35, 20.4), from: v(15.4, 1.75, 23.2), hold: Infinity, inSec: 1.0, fov: 52 })
    const L = lines.lines('projection')
    await rt.dialogue(L.slice(0, 1))
    const run = this.walker.walkTo(m, [v(17.4, 0, 20.3), v(16.7, 0, 18.4), SPOTS_V7.matsuiProject.pos], 3.2, KANBAN.c.pos)
    await rt.dialogue(L.slice(1, 2))
    await Promise.race([run, this.clock.wait(4)])
    void rt.cinematic({ look: v(16.0, 1.1, 16.6), from: v(17.5, 1.7, 13.4), hold: Infinity, inSec: 0.8, fov: 50 })
    this.surgeC?.surge({ sec: 1.8 })
    await rt.dialogue(L.slice(2))
    this.ns.morningProjection(true)
    rt.shake(0.15)
    void rt.cinematic({ look: v(14.5, 1.6, 24.0), from: v(18.6, 2.6, 20.4), hold: Infinity, inSec: 1.2, fov: 62 })
    await this.clock.wait(1.4)
    this.defense?.fleeSmall()
    await rt.dialogue(lines.lines('shadows_flee'))
    // 大きな影：トンネル路地から出て、暗がりへ
    const big = this.defense?.startBig()
    if (big) void rt.cinematic({ look: big.pos.clone().setY(1.6), from: v(16.2, 2.0, 23.6), hold: Infinity, inSec: 1.0, fov: 54, shake: 0.08 })
    await this.clock.wait(0.8)
    await rt.dialogue(lines.lines('big_appear'))
    rt.endCinematic()
    rt.combat.setCheckpoint(V7_SPAWNS.v7_shrine.pos, V7_SPAWNS.v7_shrine.facing)
    this.busy = false
    rt.setControlLocked(false)
  }

  /** 大きな影をたおした → 本物の朝 → 社長の決断・ダイヤル・ノート → 帰りの光 */
  private async runDawn(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.combat.showBoss(null)
    await this.clock.wait(1.2)
    rt.setControlLocked(true)
    rt.combat.enabled = false
    await rt.dialogue(lines.lines('big_down'))
    this.ns.morningProjection(false)
    this.ns.skyCrack.setCrack(0)
    for (const d of ['north', 'south', 'roof'] as const) this.ns.mouths.setActive(d, 0)
    if (this.time) {
      this.time.speed = 1 / 2.5
      this.time.set('dawn')
    }
    this.place(this.matsui, SPOTS_V7.matsuiShrine)
    this.place(this.saeki, SPOTS_V7.saekiShrine)
    this.place(this.ofuji, SPOTS_V7.ofujiAside)
    const nx = SPOTS_V7.nexmaxShrine
    rt.player.teleport(nx.pos, Math.atan2(-(nx.face.x - nx.pos.x), -(nx.face.z - nx.pos.z)))
    const sh = this.ns.shrine
    void rt.cinematic({ look: v(12.9, 1.4, 23.55), from: v(18.6, 1.7, 23.75), hold: Infinity, inSec: 1.6, fov: 50 })
    for (let i = 0; i <= 10; i++) {
      sh.setSun(i / 10)
      await this.clock.wait(0.15)
    }
    await rt.dialogue(lines.lines('dawn'))
    void rt.cinematic({ look: v(15.05, 1.45, 21.9), from: v(15.75, 1.6, 24.3), hold: Infinity, inSec: 1.2, fov: 44 })
    this.walker.face(this.matsui, sh.root.position)
    await rt.dialogue(lines.lines('decision').slice(0, 1))
    this.walker.face(this.matsui, rt.player.position)
    await rt.dialogue(lines.lines('decision').slice(1))
    await rt.dialogue(lines.lines('notebook'))
    // 戻ったカメラは南東から（ほこらと帰りの光の輪が見える。社長の頭でふさがない）
    rt.camRig.yaw = 0.9
    rt.camRig.pitch = 0.3
    rt.endCinematic()
    rt.story.set('v7_shrine_saved', true)
    rt.save('v7_shrine')
    this.step = 'return'
    this.openRing(rt)
    this.busy = false
    rt.setControlLocked(false)
  }

  private openRing(rt: StageRuntime): void {
    this.ringOpen = true
    rt.rift.openAt(SPOTS_V7.returnRing.clone().setY(0.05), eraTintHex(2086), 1.7, 1.6)
  }

  private async runLeave(rt: StageRuntime): Promise<void> {
    this.busy = true
    rt.setControlLocked(true)
    await rt.dialogue(lines.lines('return_ready'))
    rt.setControlLocked(false)
    this.busy = false
    const r = rt.travel({ to: '2086', cause: 'return', spawn: 'v7_from_2026' })
    if (!r.ok) rt.hud.toast(r.reason)
  }

  // ================================================================ 話す・調べる（F）

  private nearKanban(p: THREE.Vector3): KanbanId | null {
    let best: KanbanId | null = null
    let bd = Infinity
    for (const id of ['a', 'b', 'c', 'd'] as const) {
      const mk = this.ns.idos[id]
      const sx = mk.base.x + mk.front.x
      const sz = mk.base.z + mk.front.z
      const d = Math.hypot(p.x - sx, p.z - sz)
      const ahead = (p.x - mk.base.x) * mk.front.x + (p.z - mk.base.z) * mk.front.z
      if (d < 1.5 && ahead > 0.3 && d < bd) {
        best = id
        bd = d
      }
    }
    return best
  }

  private near(p: THREE.Vector3, q: THREE.Vector3, r: number): boolean {
    return Math.hypot(p.x - q.x, p.z - q.z) < r
  }

  /** いま F でできること（hints と interact で同じ判定） */
  private action(rt: StageRuntime): { kind: string; label: string; kanban?: KanbanId } | null {
    if (this.busy || this.rec) return null
    const p = rt.player.position
    const step = this.step
    if (this.search?.visible && this.searchOpen) return { kind: 'close_search', label: 'とじる' }
    if (step === 'sketch' && this.near(p, LAB.sketchStand, 1.6)) return { kind: 'sketch', label: '社長の絵を見る' }
    if (step === 'search' && this.near(p, LAB.terminalStand, 1.5)) return { kind: 'terminal', label: this.searchOpen ? '検索の画面を見る' : '佐伯さんの端末で、さがす' }
    const k = this.nearKanban(p)
    if (k) {
      if (step === 'search') {
        if (k === 'a') return null
        return this.searchOpen ? { kind: 'record', label: '記録を見る', kanban: k } : { kind: 'not_yet', label: '調べる', kanban: k }
      }
      if (step === 'depart' && k === 'c') return { kind: 'depart', label: 'QR を読む', kanban: k }
      if (step === 'between' && k === 'c') return { kind: 'between', label: '調べる', kanban: k }
    }
    if (step === 'defense' && this.defense?.phase === 'big_dark') return { kind: 'aim', label: '社長に照らしてもらう' }
    if (step === 'return' && this.ringOpen && this.near(p, SPOTS_V7.returnRing, 1.8)) return { kind: 'leave', label: '光の輪に入る' }
    return null
  }

  interact(rt: StageRuntime): boolean {
    if (this.busy) return true
    if (this.rec) {
      if (this.rec.talked) this.closeRecord(rt)
      return true
    }
    const a = this.action(rt)
    if (!a) return this.mob !== null && !this.mobSuspended(rt) && this.mob.interact(rt)
    switch (a.kind) {
      case 'close_search':
        this.search?.close()
        return true
      case 'sketch':
        void this.runSketch(rt)
        return true
      case 'terminal':
        void this.runTerminal(rt)
        return true
      case 'record':
        this.showRecord(a.kanban as KanbanId, rt)
        return true
      case 'not_yet':
        void rt.dialogue(lines.lines('kanban_not_yet'))
        return true
      case 'depart':
        void this.runDepart(rt)
        return true
      case 'between':
        void rt.dialogue(lines.lines('between'))
        return true
      case 'aim':
        if (this.defense?.aimAtBig()) void rt.dialogue(lines.lines('big_aim'))
        return true
      case 'leave':
        void this.runLeave(rt)
        return true
    }
    return false
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.busy) return []
    if (this.rec) return this.rec.talked ? [{ key: 'F', label: 'とじる' }] : []
    const a = this.action(rt)
    if (a) return [{ key: 'F', label: a.label }]
    if (this.fight?.grabbing) return [{ key: 'J', label: '影の腕を引きはがす' }]
    if (this.mob && !this.mobSuspended(rt)) return this.mob.hints(rt)
    return null
  }

  /** 町の人の吹き出し・会話を出さないとき（戦い・演出・記録を見ている・防衛戦の夜） */
  private mobSuspended(rt: StageRuntime): boolean {
    return this.busy || this.fight !== null || this.rec !== null || this.reading || this.step === 'defense' || !!this.search?.visible || rt.combat.inCombat
  }

  private ctx(): NambaV7Ctx {
    return {
      fight: this.fight ? { plates: this.fight.plates, grabbed: this.fight.grabbing } : null,
      toLab: this.toLab,
      searchOpen: this.searchOpen,
      checked: [...this.checked].filter((id) => ['clock_shop', 'station_clock', 'old_alley'].includes(id)).length,
      toShrine: this.toShrine,
      defense: this.defense ? this.defense.phase : null,
      ringOpen: this.ringOpen,
    }
  }

  objective(_rt: StageRuntime): { title: string; sub: string } {
    if (this.fight && this.step === 'arrive') return this.fight.objective()
    return nambaV7Objective(this.step, this.ctx())
  }

  objectiveTarget(rt: StageRuntime): THREE.Vector3 | null {
    const m = this.objectiveMarkers(rt)
    return m && m.length ? (m.find((x) => x.edge) ?? m[0]).pos : null
  }

  objectiveMarkers(rt: StageRuntime): readonly ObjectiveMark[] | null {
    const out = this.marks
    out.length = 0
    const at = (i: number, p: THREE.Vector3, y: number) => this.markAt[i].copy(p).setY(p.y + y)
    const head = (c: Person, label: string) => out.push({ pos: at(out.length, c.root.position, c.height + 0.3), label })
    switch (this.step) {
      case 'arrive':
        if (this.fight) return this.fight.markers()
        break
      case 'sketch':
        if (this.toLab && rt.player.position.z < 17) head(this.matsui, 'マツイ社長')
        else out.push({ pos: at(0, LAB.sketch, 0.9), label: '社長の絵' })
        break
      case 'search':
        if (!this.searchOpen) out.push({ pos: at(0, LAB.terminal, 0.6), label: '佐伯さんの端末' })
        else {
          const p = rt.player.position
          let best = -1
          let bd = Infinity
          for (const k of ['b', 'd', 'c'] as const) {
            if (this.checked.has(KANBAN_RECORD[k])) continue
            const b = this.ns.idos[k].base
            const d = Math.hypot(b.x - p.x, b.z - p.z)
            if (d < bd) {
              bd = d
              best = out.length
            }
            const r = IDO_RECORDS.find((x) => x.id === KANBAN_RECORD[k])
            out.push({ pos: at(out.length, b, 1.75), label: r?.name ?? 'かんばん' })
          }
          if (best >= 0) out[best].edge = true
        }
        break
      case 'depart':
        out.push({ pos: at(0, this.ns.idos.c.base, 1.75), label: '路地のかんばんの QR', edge: true })
        break
      case 'shrine_talk':
        if (this.toShrine) out.push({ pos: at(0, SHRINE.pos, 2.8), label: '時の神さまのほこら', edge: true })
        break
      case 'defense': {
        const d = this.defense
        if (d && (d.phase === 'big_dark' || d.phase === 'big_lit') && d.bigHandle) out.push({ pos: at(0, d.bigHandle.pos, 4.0), label: '大きな影', edge: true })
        break
      }
      case 'return':
        if (this.ringOpen) out.push({ pos: at(0, SPOTS_V7.returnRing, 2.2), label: '光の輪', edge: true })
        break
    }
    return out
  }

  music(_rt: StageRuntime): MusicId | null {
    return stepMusic(this.step)
  }

  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    this.fight?.onClaw(e)
    this.defense?.onClaw(e)
    void rt
  }

  // ================================================================ 毎フレーム

  update(dt: number, _frame: ActionFrame, rt: StageRuntime): void {
    this.clock.update(dt)
    this.walker.update(dt)
    rt.combat.passive = this.busy || rt.talking || rt.inCinematic
    // 6 章の到着：光の中から出てくる
    const ar = this.arrival
    if (ar) {
      if (ar.t < 0) rt.player.moveExternal(ar.from, dt)
      else {
        ar.t += dt
        const k = Math.min(1, ar.t / 0.9)
        const e = k * k * (3 - 2 * k)
        this.tmp.lerpVectors(ar.from, ar.to, e)
        this.tmp.y = ar.from.y * (1 - e) + Math.sin(Math.PI * e) * 0.5
        rt.player.moveExternal(this.tmp, dt)
        if (k >= 1) {
          this.arrival = null
          rt.player.endExternal(new THREE.Vector3(0, -0.5, 0))
          rt.hud.flash('success')
        }
      }
    }
    // 影獣の戦い（戦闘の更新のあと）・戦いの間の小さな台詞
    this.fight?.update(dt)
    this.updateSay(dt, rt)
    this.updateRecord(dt, rt)
    if (this.reading) this.panelFx.update(dt)
    this.mob?.update(dt, rt, this.step, this.mobSuspended(rt))
    this.defense?.update(dt, this.clock.time)
    this.staff?.update(dt)
    const p = rt.player.position
    // ラボに着いたら社長が声をかける
    if (this.step === 'sketch' && this.toLab && !this.labGreeted && !this.busy && p.z > 17.4 && p.x < -3) {
      this.labGreeted = true
      void rt.dialogue(lines.lines('lab_arrive'))
    }
    // 9 章：空き地に入ったら、おふじさん
    if (this.step === 'shrine_talk' && this.toShrine && !this.busy && p.z > 20.4 && p.x < 20) void this.runShrineMeet(rt)
    // 石標の光の輪（近いほど明るい）と、候補のかんばんの弱い光
    for (const id of ['a', 'b', 'c', 'd'] as const) {
      const mk = this.ns.idos[id]
      const di = Math.hypot(p.x - (mk.base.x + mk.front.x), p.z - (mk.base.z + mk.front.z))
      mk.setNear(this.rec?.marker === mk ? 1 : Math.max(0, Math.min(1, (4.5 - di) / 3)))
      const candidate = this.step === 'search' && this.searchOpen && id !== 'a' && !this.checked.has(KANBAN_RECORD[id as 'b' | 'c' | 'd'])
      mk.setBeacon(candidate || (this.step === 'depart' && id === 'c') ? 1 : 0)
    }
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    this.ns.update(dt, t, rt.camera)
    this.armorFx?.update(dt, t)
    this.surgeC?.update(dt, t, rt.camera)
    this.search?.update(dt)
    this.qr?.update(dt)
    this.mob?.render(dt)
    const p = rt.player.position
    for (const ch of [this.matsui, this.saeki, this.ofuji]) {
      if (!ch) continue
      const sp = this.walker.speedOf(ch)
      // 立ち止まっている人は、近くのネクマックスの方を向く（つかまっている佐伯さんはそのまま）
      if (sp === 0 && !(ch === this.saeki && this.fight?.grabbing) && !(ch === this.ofuji && this.step === 'shrine_talk' && !this.busy)) {
        if (Math.hypot(p.x - ch.root.position.x, p.z - ch.root.position.z) < 5) this.walker.turnToward(ch, p, dt, 3)
      }
      ch.update(dt, sp)
    }
    // 大きな身ぶり（人の update のあと）
    this.antics.update(dt)
  }

  // ================================================================ 開発用

  /** 開発用：いまの段階の「プレイヤーがやること」を片づけて先へ進める */
  devSkip(rt: StageRuntime): void {
    switch (this.step) {
      case 'arrive':
        if (this.fight) rt.combat.kill(this.fight.h)
        break
      case 'sketch':
        if (!this.busy) {
          rt.player.teleport(LAB.sketchStand, Math.PI / 2)
          void this.runSketch(rt)
        }
        break
      case 'search':
        if (!this.busy) {
          if (!this.searchOpen) {
            rt.player.teleport(LAB.terminalStand, 0)
            void this.runTerminal(rt)
          } else {
            this.checked.add('clock_shop')
            this.checked.add('station_clock')
            const c = KANBAN.c.pos
            rt.player.teleport(v(c.x + 1.05, 0, c.z), Math.PI / 2)
            this.showRecord('c', rt)
          }
        }
        break
      case 'depart':
        if (!this.busy) {
          const c = KANBAN.c.pos
          rt.player.teleport(v(c.x + 1.05, 0, c.z), Math.PI / 2)
          void this.runDepart(rt)
        }
        break
      case 'shrine_talk':
        if (!this.busy) {
          this.toShrine = true
          rt.player.teleport(V7_SPAWNS.v7_shrine.pos, V7_SPAWNS.v7_shrine.facing)
        }
        break
      case 'defense':
        this.defense?.devSkip()
        break
      case 'return':
        if (!this.busy) {
          rt.player.teleport(SPOTS_V7.returnRing, 0)
          void this.runLeave(rt)
        }
        break
    }
  }

  debug(): Record<string, unknown> {
    return {
      step: this.step,
      busy: this.busy,
      spawn: this.spawnId,
      fight: this.fight ? this.fight.debug() : null,
      toLab: this.toLab,
      searchOpen: this.searchOpen,
      checked: [...this.checked],
      rec: this.rec?.id ?? null,
      toShrine: this.toShrine,
      defense: this.defense?.debug() ?? null,
      ringOpen: this.ringOpen,
      time: this.time ? +this.time.value.toFixed(2) : null,
    }
  }

  dispose(): void {
    this.clock.dispose()
    this.walker.clear()
    this.defense?.dispose()
    this.defense = null
    this.search?.dispose()
    this.sketch?.dispose()
    this.curtain?.dispose()
    this.armorFx?.dispose()
    this.fight?.dispose()
    this.fight = null
    this.doorBlock = null
    this.qr?.dispose()
    this.antics.dispose()
    this.mob?.dispose()
    this.mob = null
    if (this.tablet) {
      this.tablet.removeFromParent()
      disposeTree(this.tablet)
    }
    // 主人公の見た目はシェルの物：かくしたままにしない
    if (this.rt) this.rt.nexmax.root.visible = true
    this.ns?.attachTime(null)
    this.rt = null
    const w = window as unknown as { __nambaDev?: unknown }
    if (w.__nambaDev) delete w.__nambaDev
  }
}

/** 佐伯さんの手のタブレット（QR の読みこみをためす）。黒い枠と光る画面 */
function makeTablet(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'saeki_tablet'
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.18, 0.015), new THREE.MeshStandardMaterial({ color: '#1a1c22', roughness: 0.4, metalness: 0.3 }))
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.23, 0.15), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 1.4, 1.9), toneMapped: false }))
  screen.position.z = -0.009
  screen.rotation.y = Math.PI
  g.add(body, screen)
  g.position.set(-0.06, 0.32, -0.12)
  g.rotation.set(0.35, 0, 0)
  return g
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((x) => {
    const m = x as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  })
}
