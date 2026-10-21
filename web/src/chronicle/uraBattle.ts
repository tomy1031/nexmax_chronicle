// 裏側の戦い（物語 11 章の夜明け・12 章の最後の夜）。2086 と 1186 のどちらのステージからも使う 1 つの部品。
// ステージの外の場面（夜の広場・寺の階段）は各ステージが作り、裏側に入ってから扉を出るまでを、この部品が受け持つ。
//
// 使い方（ステージ側）：
//   load()   ：this.ura = UraBattle.build({ root, colliders, scenario: 'khmer' | 'final', quality: ctx.quality })
//              lights に this.ura.lights を足す（裏側の点光源の候補）
//   場面     ：const r = await this.ura.run(rt, { ally: chanda, doorSeconds: 35, exitTo: { pos, yaw } })   // → 'escaped'
//   update   ：this.ura.update(dt, frame, rt)（裏側にいる間は rt.combat.passive もここで決める）
//   animate  ：this.ura.animate(dt, t)（裏側にいる間、ally・towa の update もここでする。ステージは二重に呼ばない）
//   interact ：if (this.ura.interact(rt)) return true
//   objective／hints／objectiveMarkers：this.ura.objective(rt) ?? …（裏側にいる間だけ値を返す）
//   music    ：this.ura.music ?? …（裏側にいる間 'ura'、夜明けの一撃のあと 'dawn'）
//   debug    ：{ ...this.ura.debug() }、devSkip：if (this.ura.active) this.ura.devSkip(rt)
//   onEnemyDefeated：tag が 'ura' の敵は、この部品の物（ステージは数えない）
//   dispose  ：this.ura.dispose()
// 裏側は origin（既定 x = +3000、y = 0）に組み立てる。y = 0 なので、落ちるとプレイヤーの killY（-1.3）で足場へ戻る（体力 1 減る）。
import * as THREE from 'three'
import type { StageRuntime } from '../game/stage'
import type { ActionFrame } from '../player/inputActions'
import type { Character } from '../world/characters'
import type { DialogueLine } from '../game/dialogueQueue'
import type { Hint } from '../ui/hud'
import type { ObjectiveMark } from '../game/objectiveMarker'
import type { ColliderList } from '../world/colliders'
import type { EnemyHandle } from '../combat/combatSystem'
import type { MusicId } from '../audio/tracks'
import type { QualitySettings } from '../render/quality'
import { SceneClock } from './kit/clock'
import { Curtain } from './kit/curtain'
import { ChoiceBox } from './kit/choice'
import { buildUraArena, UraEnvSwitch, type UraArena } from './visuals/ura'
import { OrmHeart } from './visuals/heart'
import { BlackHands } from './visuals/hands'
import { SlitFx, type Slit } from './visuals/slit'
import { SlashFx } from './visuals/chronoFx'
import { Lamp } from './visuals/lamp'
import { Particles } from './visuals/particles'
import { ShadeWisps, SHADE_STYLE, BIG_SHADE_STYLE } from './visuals/shade'
import type { PersonCharacter, PersonPose } from './visuals/person'
import { faceYaw } from './kit/walker'
import linesJson from './ura_lines.json'
import { doorLeft, doorWidthK, escortCanMove, fellBelow, insideDoor, isPlayStep, nextStep, uraObjective, veinsStepDone, URA_STEPS, type UraLineKey, type UraScenario, type UraStep } from './uraBattleLogic'

export type { UraScenario, UraStep } from './uraBattleLogic'

export type UraBuildOptions = {
  root: THREE.Object3D
  colliders: ColliderList
  scenario: UraScenario
  /** 裏側を組み立てる所（既定 (3000, 0, 0)。y は 0 にする） */
  origin?: THREE.Vector3
  quality?: QualitySettings | 'low' | 'medium' | 'high'
}

export type UraRunOptions = {
  /** khmer：チャンダ（createPerson('chanda') か ctx.loadNpc('chanda')。刃つき） */
  ally?: Character
  /** final：トワ（仮面・ランプ） */
  towa?: Character
  /** final：トワが投げるランプ（省略で、この部品が自分で作ってトワに持たせる） */
  lamp?: Lamp
  /** final：扉の向こうのソラ（いまは台詞だけで使う。わっかの位置） */
  sora?: { ringPos: THREE.Vector3 }
  /** 扉がもつ秒数（最後の「扉が閉じる前に帰る」。既定 khmer 35・final 40） */
  doorSeconds?: number
  /** 台詞（省略で ura_lines.json） */
  lines?: (key: string) => DialogueLine[]
  /** 出たあとの場所。渡すと、そこへ移して暗転を明ける。省略すると暗いまま返す（ステージが移して ura.lift() を呼ぶ） */
  exitTo?: { pos: THREE.Vector3; yaw?: number }
}

const LINES = linesJson as Record<string, DialogueLine[]>
const UP = new THREE.Vector3(0, 1, 0)
const SHADE_TAG = 'ura'

type Follower = { ch: Character; pos: THREE.Vector3; speed: number }

/** 手続きの人の形（PersonCharacter）なら v7 の身ぶりも、ふつうの Character なら近いポーズで */
function setPersonPose(ch: Character, p: PersonPose): void {
  ;(ch as PersonCharacter).setPose(p)
}

/** 裏側の戦い */
export class UraBattle {
  readonly scenario: UraScenario
  readonly group = new THREE.Group()
  readonly arena: UraArena
  readonly heart: OrmHeart
  /** 点光源の候補（ステージの world.lights に足す） */
  readonly lights: { pos: THREE.Vector3; color: string; intensity: number; dist: number }[]
  /** 裏側にいる間 true */
  active = false
  private stepV: UraStep = 'idle'
  private readonly hands: BlackHands
  private readonly slits: SlitFx
  private readonly slash: SlashFx
  private readonly wisps: ShadeWisps
  private readonly sparks: Particles
  private readonly origin: THREE.Vector3
  /** 光の扉（入口の足場の左おく、上面から 2.2 m）と、その面の向き（広場の方をななめに） */
  readonly doorPos = new THREE.Vector3()
  readonly doorNormal = new THREE.Vector3(0.62, 0, -0.78)
  /** オルムの心臓（広場の奥のふちから 3.2 m 先、上面から 3 m 上。広場のふちから裂ける） */
  readonly heartPos = new THREE.Vector3()
  private door: Slit | null = null
  private clock: SceneClock | null = null
  private curtain: Curtain | null = null
  private readonly choice = new ChoiceBox()
  private sw: UraEnvSwitch | null = null
  private rt: StageRuntime | null = null
  private o: UraRunOptions = {}
  private ownLamp: Lamp | null = null
  private lamp: Lamp | null = null
  private cut = false
  private retry = false
  private falling = false
  private fallSayAt = -99
  // 段ごとの合図
  private freed = false
  private heartHit = false
  private grabbed = false
  private escaped = false
  // チャンダ（khmer）
  private path: THREE.Vector3[] = []
  private pathIdx = 0
  private allyMode: 'idle' | 'escort' | 'stuck' | 'follow' | 'script' = 'idle'
  private allySpeed = 0
  private blocked = false
  private blockSayAt = -99
  private waves = 0
  private allySaved: { pos: THREE.Vector3; rotY: number } | null = null
  private readonly ankle = new THREE.Vector3()
  // トワ（final）
  private towaMode: 'idle' | 'follow' | 'script' = 'idle'
  private towaSpeed = 0
  private readonly wire: THREE.Line
  private readonly wireGeo: THREE.BufferGeometry
  // 扉
  private doorTotal = 35
  private doorT = 0
  private doorRunning = false
  private timerEl: HTMLDivElement | null = null
  private musicV: MusicId | null = null
  private prevEnabled = false
  private prevRespawn: (() => void) | null = null
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()

  private constructor(o: UraBuildOptions) {
    this.scenario = o.scenario
    this.origin = (o.origin ?? new THREE.Vector3(3000, 0, 0)).clone()
    this.group.name = `ura_${o.scenario}`
    o.root.add(this.group)
    const q = typeof o.quality === 'string' ? o.quality : (o.quality?.level ?? 'medium')
    this.arena = buildUraArena(this.group, o.colliders, this.origin, { quality: q })
    const entry = this.arena.platforms.find((p) => p.id === 'entry') ?? this.arena.platforms[0]
    const field = this.arena.platforms.find((p) => p.id === 'arena') ?? this.arena.platforms[0]
    this.doorPos.set(entry.center.x - entry.w * 0.5 + 0.9, entry.center.y + 2.2, entry.center.z + entry.d * 0.5 - 1.0)
    this.heartPos.set(field.center.x, field.center.y + 3.0, field.center.z - field.d * 0.5 - 3.2)
    this.heart = new OrmHeart(this.group, this.heartPos, { anchors: this.arena.veinAnchors.slice(0, 4), veins: o.scenario === 'final' ? 4 : 5 })
    this.hands = new BlackHands(this.group)
    this.slits = new SlitFx(this.group)
    this.slash = new SlashFx(this.group)
    this.wisps = new ShadeWisps(this.group, { max: q === 'low' ? 300 : 600 })
    this.sparks = new Particles({ max: 200, shape: 'soft', additive: true, renderOrder: 5 })
    this.group.add(this.sparks.points)
    this.lights = [...this.arena.lights, { pos: this.heartPos.clone(), color: '#ff4a9a', intensity: 1.4, dist: 14 }]
    this.wireGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    this.wire = new THREE.Line(this.wireGeo, new THREE.LineBasicMaterial({ color: new THREE.Color('#9fe8ff').multiplyScalar(2), toneMapped: false }))
    this.wire.frustumCulled = false
    this.wire.visible = false
    this.group.add(this.wire)
  }

  /** load() の中で組み立てる（足場の当たり判定を colliders に足すので、読み込みのときにしかできない） */
  static build(o: UraBuildOptions): UraBattle {
    return new UraBattle(o)
  }

  /** いまの段 */
  get step(): UraStep {
    return this.stepV
  }

  /** 裏側にいる間に鳴らす曲（いなければ null） */
  get music(): MusicId | null {
    return this.active ? this.musicV : null
  }

  // ---------------------------------------------------------------- 流れ

  /** 裏側へ入って、扉から出るまで。終わると 'escaped' */
  async run(rt: StageRuntime, o: UraRunOptions = {}): Promise<'escaped'> {
    this.rt = rt
    this.o = o
    this.clock?.dispose()
    this.clock = new SceneClock()
    this.curtain?.dispose()
    this.curtain = new Curtain(document.getElementById('ui') ?? document.body)
    this.active = true
    this.musicV = 'ura'
    this.prevEnabled = rt.combat.enabled
    this.prevRespawn = rt.combat.onRespawn
    rt.combat.onRespawn = () => {
      this.prevRespawn?.()
      this.retry = true
    }
    this.doorTotal = o.doorSeconds ?? (this.scenario === 'khmer' ? 35 : 40)
    let step: UraStep = URA_STEPS[this.scenario][0]
    while (step !== 'done' && !this.clock.dead) {
      this.stepV = step
      this.retry = false
      const again = await this.runStep(rt, step)
      if (this.clock.dead) break
      if (again) continue
      step = nextStep(this.scenario, step)
    }
    this.stepV = 'done'
    return 'escaped'
  }

  /** 暗いまま返したとき（exitTo を渡さなかったとき）、ステージが場所を移してから明ける */
  async lift(sec = 0.6): Promise<void> {
    await this.curtain?.set(false, sec)
  }

  /** 1 つの段。true を返すと同じ段をやり直す */
  private async runStep(rt: StageRuntime, step: UraStep): Promise<boolean> {
    switch (step) {
      case 'enter':
        await this.enter(rt)
        return false
      case 'escort':
        return this.escort(rt)
      case 'stab':
        await this.stab(rt)
        return false
      case 'free':
        return this.free(rt)
      case 'veins':
      case 'veins2':
        return this.veins(rt, step)
      case 'towaPulled':
        await this.towaPulled(rt)
        return false
      case 'lastVein':
        await this.lastVein(rt)
        return false
      case 'heart':
        return this.heartStep(rt)
      case 'pour':
        await this.pour(rt)
        return false
      case 'strike':
        await this.strike(rt)
        return false
      case 'grabTowa':
        return this.grabTowa(rt)
      case 'escape':
        return this.escape(rt)
      case 'exit':
        await this.exit(rt)
        return false
      default:
        return false
    }
  }

  // ---------------------------------------------------------------- 段

  private async enter(rt: StageRuntime): Promise<void> {
    rt.setControlLocked(true)
    await this.curtain!.set(true, 0.5)
    // 霧の出し入れでシェーダが作り直されないよう、表に霧が無ければ濃さ 0 の霧を入れておく（暗転の中で）
    if (!rt.scene.fog) rt.scene.fog = new THREE.FogExp2('#000000', 0)
    this.sw = new UraEnvSwitch({ scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post })
    this.sw.set(1)
    rt.combat.enabled = true
    this.door = this.slits.dawnDoor(this.doorPos, this.doorNormal, 2.2, 4.2)
    const spawn = this.spawnPoint()
    this.placePlayer(rt, spawn, 0)
    rt.player.setCheckpoint(spawn)
    rt.combat.setCheckpoint(spawn, 0)
    const ally = this.o.ally
    if (ally) {
      this.allySaved = { pos: ally.root.position.clone(), rotY: ally.root.rotation.y }
      ally.root.position.copy(spawn).add(new THREE.Vector3(1.1, 0, 0.4))
      ally.root.rotation.y = 0
      ally.setPose('idle')
      ;(ally as PersonCharacter).setRim?.('#8fb4ff', 0.5)
    }
    const towa = this.o.towa
    if (towa) towa.root.visible = false
    await this.clock!.wait(0.3)
    void this.curtain!.set(false, 0.7)
    void rt.cinematic({ look: this.heartPos.clone(), from: spawn.clone().add(new THREE.Vector3(2.2, 2.6, 2.4)), inSec: 1.2, hold: Infinity, outSec: 1.2, fov: 50, marker: { pos: this.heartPos.clone().add(new THREE.Vector3(0, 2.6, 0)), label: 'オルムの心臓', color: '#ff5aa8' } })
    await rt.dialogue(this.lines(this.scenario === 'khmer' ? 'k_enter' : 'f_enter'))
    rt.endCinematic()
    rt.setControlLocked(false)
  }

  /** khmer：チャンダが心臓へ走る道を守る */
  private async escort(rt: StageRuntime): Promise<boolean> {
    const ally = this.o.ally
    this.killShades(false)
    this.path = this.escortPath()
    this.pathIdx = 0
    this.waves = 0
    if (ally) ally.root.position.copy(this.path[0])
    this.allyMode = 'escort'
    void rt.dialogue(this.lines('k_escort_start'))
    const ok = await this.clock!.until(() => this.pathIdx >= this.path.length - 1 || this.retry || this.cut)
    this.cut = false
    if (this.retry || !ok) {
      this.retryBanner(rt)
      return true
    }
    this.allyMode = 'script'
    return false
  }

  /** khmer：刃が心臓をつく → すじが光をすう → 刃が折れる → 足に黒いもの */
  private async stab(rt: StageRuntime): Promise<void> {
    const ally = this.o.ally as PersonCharacter | undefined
    rt.setControlLocked(true)
    this.killShades(true)
    const front = this.heartFront()
    void rt.cinematic({ look: this.heartPos.clone().add(new THREE.Vector3(0, -1.2, 0)), from: front.clone().add(new THREE.Vector3(4.5, 2.2, 3.5)), inSec: 1.0, hold: Infinity, outSec: 1.0, fov: 52 })
    if (ally) {
      ally.root.position.copy(front)
      ally.root.rotation.y = faceYaw(front, this.heartPos)
      ally.setPose?.('guard')
      ally.setExpression?.('shout')
    }
    const L = this.lines('k_stab')
    await rt.dialogue(L.slice(0, 1))
    // つく：前へ踏みこみ、刃先が光る
    const blade = new THREE.Vector3()
    await this.tween(0.25, (k) => {
      if (!ally) return
      ally.root.position.copy(front).addScaledVector(this.tmp.subVectors(this.heartPos, front).setY(0).normalize(), k * 0.8)
    })
    if (ally) blade.copy(ally.root.position).add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(this.tmp.subVectors(this.heartPos, ally.root.position).normalize(), 0.7)
    else blade.copy(front).add(new THREE.Vector3(0, 1, -0.8))
    rt.shake(0.3)
    this.sparks.burst(30, blade, 3, { life: 0.6, size: 0.1, color: new THREE.Color('#9fe4ff').multiplyScalar(2), drag: 3 })
    this.heart.setPulse(2.6)
    this.heart.absorb(blade, 4)
    await rt.dialogue(L.slice(1))
    await this.clock!.wait(0.6)
    // 折れる
    ally?.setBlade?.('broken')
    rt.shake(0.45)
    this.sparks.burst(40, blade, 4, { life: 0.8, size: 0.09, color: new THREE.Color('#bfe8ff').multiplyScalar(2.2), drag: 2, gravity: 3 })
    // 足に黒いもの（小さな黒い手）
    if (ally) {
      this.ankle.copy(ally.root.position).add(new THREE.Vector3(0, 0.15, 0))
      const base = ally.root.position.clone().add(new THREE.Vector3(0.9, 0, 0.6))
      this.hands.spawn('leg', base, { size: 0.32, rest: this.ankle.clone().add(new THREE.Vector3(0.2, 0.4, 0.2)) })
      void this.clock!.wait(0.5).then(() => this.hands.reachTo('leg', this.ankle, 0.5))
      ally.setPose?.('sad')
      ally.setExpression?.('surprised')
    }
    this.heart.setPulse(1.6)
    await rt.dialogue(this.lines('k_stab_break'))
    rt.endCinematic()
    rt.setControlLocked(false)
  }

  /** khmer：チャンダの足の黒いものを裂く */
  private async free(rt: StageRuntime): Promise<boolean> {
    this.freed = false
    const p = this.hands.point('leg') ?? this.ankle
    rt.chrono.add({ id: 'ura_leg', kind: 'ura', label: '黒いもの', point: p, radius: 0.6, enabled: true, range: 16, onAct: () => (this.freed = true) })
    void rt.dialogue(this.lines('k_free'))
    await this.clock!.until(() => this.freed || this.retry || this.cut)
    this.cut = false
    rt.chrono.remove('ura_leg')
    if (!this.freed) return true
    this.hands.cut('leg')
    const ally = this.o.ally as PersonCharacter | undefined
    ally?.setPose?.('idle')
    ally?.setExpression?.('neutral')
    rt.setControlLocked(true)
    if (ally) void rt.cinematic({ look: ally.root.position.clone().add(new THREE.Vector3(0, 1, 0)), inSec: 0.8, hold: Infinity, outSec: 0.8, fov: 48 })
    await rt.dialogue(this.lines('k_freed'))
    rt.endCinematic()
    rt.setControlLocked(false)
    return false
  }

  /** final：光をすうすじを切る（veins：2 本まで、veins2：3 本まで。4 本目は最後の演出のため狙えない） */
  private async veins(rt: StageRuntime, step: UraStep): Promise<boolean> {
    this.killShades(false)
    const veins = this.heart.veins
    const playable = veins.slice(0, 3)
    playable.forEach((v, i) => {
      if (!v.alive) return
      rt.chrono.add({
        id: `ura_vein${i}`,
        kind: 'ura',
        label: '光をすうすじ',
        point: v.pos,
        radius: 0.8,
        enabled: true,
        range: 16,
        noLineOfSight: true,
        onAct: () => {
          v.cut()
          rt.chrono.remove(`ura_vein${i}`)
          rt.shake(0.3)
          if (this.cutCount() === 1) void rt.dialogue(this.lines('f_vein1'))
          if (this.cutCount() === 3) void rt.dialogue(this.lines('f_vein3'))
        },
      })
      // すじの足場に影の番人
      const plat = this.arena.platforms.find((p) => p.center.distanceTo(this.arena.veinAnchors[i]) < 3)
      if (plat) this.spawnShade(i % 2 ? 'shield' : 'mite', plat.center.clone().add(new THREE.Vector3(0.6, 0, 0.6)))
    })
    this.heart.setPulse(1.3 + this.cutCount() * 0.3)
    const ok = await this.clock!.until(() => veinsStepDone(step, this.cutCount()) || this.retry || this.cut)
    this.cut = false
    for (let i = 0; i < 3; i++) rt.chrono.remove(`ura_vein${i}`)
    if (!ok || this.retry) {
      if (this.retry) this.retryBanner(rt)
      if (!veinsStepDone(step, this.cutCount())) return true
    }
    this.heart.setPulse(1.3 + this.cutCount() * 0.3)
    return false
  }

  /** final：オルムの影がトワを引きずりこむ */
  private async towaPulled(rt: StageRuntime): Promise<void> {
    const A = this.arena
    const towa = this.o.towa
    rt.setControlLocked(true)
    const land = this.spawnPoint().add(new THREE.Vector3(-1.6, 0, -1.2))
    const sky = A.entry.clone().add(new THREE.Vector3(-3, 9, -3))
    void rt.cinematic({ look: land.clone().add(new THREE.Vector3(0, 2.5, 0)), from: A.center.clone().add(new THREE.Vector3(3, 3.5, 6)), inSec: 1.2, hold: Infinity, outSec: 1.0, fov: 55 })
    this.hands.spawn('towa', sky, { from: 'sky', size: 1.0 })
    const chest = new THREE.Vector3()
    if (towa) {
      towa.root.visible = true
      towa.root.position.copy(this.doorPos).add(new THREE.Vector3(0, -1.5, 0))
      setPersonPose(towa, 'fall')
      ;(towa as PersonCharacter).setRim?.('#8fb4ff', 0.5)
    }
    await this.clock!.wait(0.6)
    // 引きずられて、宙を飛ぶ
    const from = towa ? towa.root.position.clone() : this.doorPos.clone()
    const mid = sky.clone().add(new THREE.Vector3(1.5, -4.5, 1))
    this.hands.chase('towa', chest, 12)
    const dlg = rt.dialogue(this.lines('f_towa_pulled'))
    await this.tween(1.6, (k) => {
      if (!towa) return
      towa.root.position.lerpVectors(from, mid, k * k * (3 - 2 * k))
      towa.root.position.y += Math.sin(k * Math.PI) * 1.2
      chest.copy(towa.root.position).add(new THREE.Vector3(0, 1.3, 0))
    })
    await dlg
    // 手がはなれて、入口の足場へ落ちる
    this.hands.retract('towa')
    await this.tween(0.6, (k) => {
      if (!towa) return
      towa.root.position.lerpVectors(mid, land, k * k)
    })
    if (towa) {
      towa.root.position.copy(land)
      towa.root.rotation.y = faceYaw(land, this.heartPos)
      setPersonPose(towa, 'kneel')
    }
    rt.shake(0.3)
    await this.clock!.wait(0.6)
    rt.endCinematic()
    rt.setControlLocked(false)
  }

  /** final：最後のすじが扉（ソラ）の方へのびる → トワがランプを投げる → 朝の光でやける */
  private async lastVein(rt: StageRuntime): Promise<void> {
    const A = this.arena
    const towa = this.o.towa
    const v = this.heart.veins[3]
    rt.setControlLocked(true)
    this.killShades(false)
    void rt.cinematic({ look: this.doorPos.clone().lerp(this.heartPos, 0.4), from: A.center.clone().add(new THREE.Vector3(-7, 4, 9)), inSec: 1.2, hold: Infinity, outSec: 1.0, fov: 58 })
    const reachTo = this.doorPos.clone().addScaledVector(this.doorNormal, 1.3).add(new THREE.Vector3(0, -0.6, 0))
    v.reachTo(reachTo, 2.4)
    this.heart.absorb(this.doorPos, 4, 3)
    this.door?.setStability(0)
    const L = this.lines('f_last_vein')
    await rt.dialogue(L.slice(0, 2))
    if (towa) {
      setPersonPose(towa, 'idle')
      towa.root.rotation.y = faceYaw(towa.root.position, this.doorPos)
    }
    await rt.dialogue(L.slice(2))
    // ランプを投げる
    const lamp = this.ensureLamp()
    if (towa) {
      towa.root.rotation.y = faceYaw(towa.root.position, v.pos)
      setPersonPose(towa, 'raiseLamp')
      await this.clock!.wait(0.6)
    }
    const start = lamp.center(new THREE.Vector3())
    lamp.root.removeFromParent()
    this.group.add(lamp.root)
    lamp.root.position.copy(start)
    lamp.root.rotation.set(0, 0, 0)
    const to = v.pos.clone()
    if (towa) setPersonPose(towa, 'point')
    await this.tween(0.75, (k) => {
      lamp.root.position.lerpVectors(start, to, k)
      lamp.root.position.y += Math.sin(k * Math.PI) * 2
      lamp.root.rotation.z = k * 6
    })
    const burst = lamp.burst()
    rt.shake(0.5)
    v.cut()
    this.heart.crack(0.3)
    this.door?.setStability(1)
    if (towa) setPersonPose(towa, 'guard')
    await rt.dialogue(this.lines('f_lamp'))
    await burst
    lamp.root.visible = false
    rt.endCinematic()
    rt.setControlLocked(false)
  }

  /** final：心臓を裂こうとする */
  private async heartStep(rt: StageRuntime): Promise<boolean> {
    this.heartHit = false
    rt.chrono.add({ id: 'ura_heart', kind: 'ura', label: 'オルムの心臓', point: this.heart.center, radius: 2.2, enabled: true, range: 18, noLineOfSight: true, onAct: () => (this.heartHit = true) })
    await this.clock!.until(() => this.heartHit || this.retry || this.cut)
    this.cut = false
    rt.chrono.remove('ura_heart')
    return !this.heartHit
  }

  /** final：爪にひび → 最後の光のつぶを、爪にそそぐ（選ぶ） */
  private async pour(rt: StageRuntime): Promise<void> {
    rt.setControlLocked(true)
    void rt.cinematic({ look: this.heartPos.clone(), from: this.heartFront().add(new THREE.Vector3(3.6, 2.8, 7.5)), inSec: 0.8, hold: Infinity, outSec: 0.8, fov: 52 })
    // 裂きかけて、とちゅうで止まる（爪にひび）
    this.slash.play(this.heart.center.clone().add(new THREE.Vector3(0, 0, 1.8)), { angle: 0.6, length: 2.2, sec: 0.35 })
    rt.shake(0.4)
    rt.hud.toast('ピシッ……　爪に、ひびが！', 2)
    await this.clock!.wait(0.5)
    await rt.dialogue(this.lines('f_heart_crack'))
    for (;;) {
      const ui = document.getElementById('ui') ?? document.body
      const pick = await this.choice.ask(ui, 'pour', '最後の光のつぶを……', [
        { id: 'pour', label: '最後の光のつぶを、爪にそそぐ' },
        { id: 'wait', label: '……まだ、まよう' },
      ])
      if (pick === 'pour' || !this.clock || this.clock.dead) break
      await rt.dialogue(this.lines('f_wait'))
    }
    rt.story.set('v7_orm_down', true)
    await rt.dialogue(this.lines('f_pour'))
    rt.endCinematic(true)
  }

  /** final：夜明けの光の一撃 → 心臓がくずれる */
  private async strike(rt: StageRuntime): Promise<void> {
    rt.setControlLocked(true)
    this.musicV = 'dawn'
    void rt.cinematic({ look: this.heartPos.clone(), from: this.heartFront().add(new THREE.Vector3(-3, 2.4, 4)), inSec: 0.8, hold: Infinity, outSec: 1.2, fov: 56, shake: 0.1 })
    const dlg = rt.dialogue(this.lines('f_strike'))
    await this.tween(1.8, () => rt.oreGlow(2.6))
    await dlg
    this.slash.play(this.heart.center.clone().add(new THREE.Vector3(0, 0, 1.6)), { angle: -0.5, length: 6, color: '#ffd27a', sec: 0.9 })
    rt.shake(0.7)
    await this.heart.shatter()
    this.killShades(true)
    // くずれていくのを、だまって見る
    await this.clock!.wait(1.4)
    rt.endCinematic()
    rt.setControlLocked(false)
  }

  /** final：トワをつかむ（ワイヤーでつなぐ） */
  private async grabTowa(rt: StageRuntime): Promise<boolean> {
    this.grabbed = false
    const towa = this.o.towa
    if (towa) {
      // 影をおしかえしていたトワが、広場のはしにいる
      const at = this.heartFront().add(new THREE.Vector3(-2.6, 0, 1.8))
      towa.root.position.copy(at)
      towa.root.rotation.y = faceYaw(at, rt.player.position)
      setPersonPose(towa, 'sad')
    } else this.grabbed = true
    await this.clock!.until(() => this.grabbed || this.retry || this.cut)
    this.cut = false
    if (!this.grabbed) return true
    this.towaMode = 'follow'
    this.wire.visible = !!towa
    if (towa) setPersonPose(towa, 'idle')
    void rt.dialogue(this.lines('f_grab'))
    return false
  }

  /** 扉が閉じる前に帰る（共通） */
  private async escape(rt: StageRuntime): Promise<boolean> {
    const A = this.arena
    this.escaped = false
    this.killShades(false)
    // 道をふさぐ影
    const step1 = this.arena.platforms.find((p) => p.id === 'step2')?.center ?? A.entry
    const step3 = this.arena.platforms.find((p) => p.id === 'step3')?.center ?? A.entry
    this.spawnShade('mite', step1.clone().add(new THREE.Vector3(0.4, 0, 0)))
    this.spawnShade('mite', step3.clone().add(new THREE.Vector3(-0.5, 0, 0)))
    this.spawnShade('shield', A.center.clone().add(new THREE.Vector3(1.2, 0, 4.0)))
    if (this.scenario === 'khmer') this.allyMode = 'follow'
    this.door?.setStability(this.scenario === 'final' ? 0.4 : 1)
    this.doorT = 0
    this.doorRunning = true
    this.showTimer(true)
    void rt.dialogue(this.lines(this.scenario === 'khmer' ? 'k_escape' : 'f_escape'))
    const ok = await this.clock!.until(() => this.escaped || this.retry || this.cut || doorLeft(this.doorTotal, this.doorT) <= 0)
    this.cut = false
    this.doorRunning = false
    if (ok && this.escaped) {
      this.showTimer(false)
      return false
    }
    // まにあわなかった（または体力 0）：扉が開きなおして、広場の前からもう一度
    rt.setControlLocked(true)
    await this.curtain!.set(true, 0.4, '#fff')
    const start = this.heartFront().add(new THREE.Vector3(0, 0, 2.5))
    this.placePlayer(rt, start, Math.PI)
    rt.player.setCheckpoint(start)
    rt.combat.setCheckpoint(start, Math.PI)
    rt.combat.health.refill()
    if (this.o.ally) this.o.ally.root.position.copy(start).add(new THREE.Vector3(1, 0, 0.5))
    if (this.o.towa && this.towaMode === 'follow') this.o.towa.root.position.copy(start).add(new THREE.Vector3(-1, 0, 0.5))
    this.door?.setWidth(2.2, 0.3)
    await this.curtain!.set(false, 0.5)
    rt.hud.banner('扉が、閉じてしまう……！ もう一度！', 'fail', 2)
    await rt.dialogue(this.lines(this.scenario === 'khmer' ? 'k_escape_fail' : 'f_escape_fail'))
    rt.setControlLocked(false)
    return true
  }

  /** 扉を出る：元の環境にもどす */
  private async exit(rt: StageRuntime): Promise<void> {
    rt.setControlLocked(true)
    this.showTimer(false)
    this.wire.visible = false
    this.killShades(true)
    if (this.scenario === 'khmer') {
      // オルムは傷ついて、しずんでいく
      void rt.cinematic({ look: this.heartPos.clone(), from: this.doorPos.clone().addScaledVector(this.doorNormal, 0.8).add(new THREE.Vector3(0, 0.8, 0)), inSec: 0.6, hold: Infinity, outSec: 0.3, fov: 50 })
      const y0 = this.heart.root.position.y
      const dlg = rt.dialogue(this.lines('k_exit'))
      await this.tween(2.2, (k) => {
        this.heart.root.position.y = y0 - k * k * 8
        this.heart.setPulse(0.6)
      })
      await dlg
    } else {
      void rt.cinematic({ look: this.doorPos.clone(), from: this.doorPos.clone().addScaledVector(this.doorNormal, 5).add(new THREE.Vector3(0, 0.3, 0)), inSec: 0.5, hold: Infinity, outSec: 0.3, fov: 55 })
      await rt.dialogue(this.lines('f_exit'))
    }
    this.door?.close()
    await this.curtain!.set(true, 0.6, '#fff')
    rt.endCinematic(true)
    this.cleanupTargets(rt)
    this.sw?.set(0)
    rt.combat.enabled = this.prevEnabled
    rt.combat.onRespawn = this.prevRespawn
    this.prevRespawn = null
    this.active = false
    this.musicV = null
    this.allyMode = 'idle'
    this.towaMode = 'idle'
    const ally = this.o.ally
    if (ally && this.allySaved) {
      ally.root.position.copy(this.allySaved.pos)
      ally.root.rotation.y = this.allySaved.rotY
      ;(ally as PersonCharacter).setRim?.('#000000', 0)
    }
    if (this.o.towa) {
      this.o.towa.root.visible = true
      ;(this.o.towa as PersonCharacter).setRim?.('#000000', 0)
    }
    const ex = this.o.exitTo
    if (ex) {
      this.placePlayer(rt, ex.pos, ex.yaw ?? 0)
      rt.player.setCheckpoint(ex.pos)
      rt.combat.setCheckpoint(ex.pos, ex.yaw ?? 0)
      await this.clock!.wait(0.2)
      await this.curtain!.set(false, 0.8, '#fff')
    }
    rt.setControlLocked(false)
  }

  // ---------------------------------------------------------------- 毎フレーム（ステージから）

  update(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    this.clock?.update(dt)
    // 選ぶ画面：W/S で選び、J か F で決める（演出のカメラ中はシェルが F を interact に回さないので、ここで受ける）
    if (this.choice.open && this.choice.input(frame) === null && frame.pressed.has('interact')) this.choice.pick()
    if (!this.active) return
    const step = this.stepV
    const busy = !isPlayStep(step) || rt.inCinematic
    rt.combat.passive = busy || rt.talking
    const P = rt.player.position
    // 落ちた：killY で足場へ戻ったら、体力を 1 へらす（0 にはしない）
    const lowest = Math.min(...this.arena.platforms.map((p) => p.center.y))
    if (fellBelow(P.y, lowest)) this.falling = true
    else if (this.falling && P.y > lowest - 0.3) {
      this.falling = false
      const h = rt.combat.health
      if (h.hp > 1) h.damage(1)
      rt.hud.flash('danger')
      if (this.clock && this.clock.time - this.fallSayAt > 8) {
        this.fallSayAt = this.clock.time
        const l = this.lines('fall')[0]
        if (l) rt.say(l.speaker, l.text, 2.4)
      }
    }
    // チャンダ
    const ally = this.o.ally
    this.allySpeed = 0
    if (ally) {
      if (this.allyMode === 'escort' && step === 'escort') this.stepEscort(dt, rt, ally)
      else if (this.allyMode === 'follow') this.allySpeed = this.follow({ ch: ally, pos: ally.root.position, speed: 0 }, P, rt, dt, 1.0)
    }
    // トワ
    const towa = this.o.towa
    this.towaSpeed = 0
    if (towa && this.towaMode === 'follow') this.towaSpeed = this.follow({ ch: towa, pos: towa.root.position, speed: 0 }, P, rt, dt, -1.0)
    // トワをつかむ：近くで J（または F）
    if (step === 'grabTowa' && towa && !this.grabbed && P.distanceTo(towa.root.position) < 5 && frame.pressed.has('claw_fire')) this.grabbed = true
    // 扉
    if (this.doorRunning) {
      this.doorT += dt
      const left = doorLeft(this.doorTotal, this.doorT)
      this.door?.setWidth(2.2 * doorWidthK(left, this.doorTotal), 0.3)
      this.updateTimer(left)
      const d = this.doorPos
      if (insideDoor(P.x - d.x, P.z - d.z, P.y - (d.y - 2.2), this.door?.width ?? 2.2)) this.escaped = true
    }
    this.wisps.sync(rt.combat.alive(SHADE_TAG))
  }

  /** 見た目（裏側にいる間だけ動かす）。ally・towa の update もここで */
  animate(dt: number, t: number): void {
    if (!this.active && !this.curtain?.covered) return
    this.arena.update(dt, t)
    this.heart.update(dt, t)
    this.hands.update(dt, t)
    this.slits.update(dt, t, this.rt?.camera)
    this.slash.update(dt)
    this.wisps.update(dt)
    this.sparks.update(dt)
    this.lamp?.update(dt, t)
    if (this.active) {
      this.o.ally?.update(dt, this.allySpeed)
      this.o.towa?.update(dt, this.towaSpeed)
    }
    // ワイヤー（ネクマックスの手 → トワの手）
    if (this.wire.visible && this.rt && this.o.towa) {
      const a = this.rt.nexmax.handAnchor.getWorldPosition(this.tmp)
      const b = this.o.towa.handAnchor.getWorldPosition(this.tmp2)
      const pos = this.wireGeo.attributes.position as THREE.BufferAttribute
      pos.setXYZ(0, a.x, a.y, a.z)
      pos.setXYZ(1, b.x, b.y, b.z)
      pos.needsUpdate = true
    }
  }

  /** F（選ぶ画面の決定・トワをつかむ）。処理したら true */
  interact(rt: StageRuntime): boolean {
    if (this.choice.open) {
      this.choice.pick()
      return true
    }
    if (this.active && this.stepV === 'grabTowa' && this.o.towa && rt.player.position.distanceTo(this.o.towa.root.position) < 5) {
      this.grabbed = true
      return true
    }
    return this.active
  }

  objective(rt: StageRuntime): { title: string; sub: string } | null {
    if (!this.active) return null
    const left = this.doorRunning ? doorLeft(this.doorTotal, this.doorT) : undefined
    void rt
    return uraObjective(this.scenario, this.stepV, { left, veinsLeft: Math.max(0, (this.stepV === 'veins' ? 2 : 3) - this.cutCount()), blocked: this.blocked })
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (!this.active) return null
    void rt
    switch (this.stepV) {
      case 'escort':
        return [
          { key: 'K', label: '影をはらう' },
          { key: 'J', label: '影を引きよせる' },
        ]
      case 'free':
      case 'veins':
      case 'veins2':
      case 'heart':
        return [{ key: 'J', label: '裂く' }]
      case 'pour':
        return [
          { key: 'W/S', label: 'えらぶ' },
          { key: 'F', label: '決める' },
        ]
      case 'grabTowa':
        return [{ key: 'J', label: 'トワをつかむ' }]
      case 'escape':
        return [
          { key: 'Shift', label: '走る' },
          { key: 'K', label: '影をはらう' },
        ]
      default:
        return []
    }
  }

  markers(rt: StageRuntime): ObjectiveMark[] | null {
    if (!this.active || rt.inCinematic || rt.talking) return null
    const up = (p: THREE.Vector3, h: number) => p.clone().addScaledVector(UP, h)
    switch (this.stepV) {
      case 'escort':
        return this.o.ally ? [{ pos: up(this.o.ally.root.position, 1.8), label: 'チャンダ' }] : null
      case 'free': {
        const p = this.hands.point('leg')
        return p ? [{ pos: up(p, 0.6), label: '黒いもの' }] : null
      }
      case 'veins':
      case 'veins2':
        return this.heart.veins
          .slice(0, 3)
          .filter((v) => v.alive)
          .map((v) => ({ pos: up(v.pos, 0.9), label: 'すじ' }))
      case 'heart':
        return [{ pos: up(this.heart.center, 2.6), label: 'オルムの心臓' }]
      case 'grabTowa':
        return this.o.towa ? [{ pos: up(this.o.towa.root.position, 2.0), label: 'トワ' }] : null
      case 'escape':
        return [{ pos: up(this.doorPos, 2.4), label: '光の扉' }]
      default:
        return null
    }
  }

  /** 自動の通し確認用：いまの段のプレイヤーの役目を、正しい結果ですませる */
  devSkip(rt: StageRuntime): void {
    switch (this.stepV) {
      case 'escort':
        this.killShades(true)
        this.pathIdx = this.path.length - 1
        if (this.o.ally) this.o.ally.root.position.copy(this.path[this.path.length - 1])
        break
      case 'free':
        this.freed = true
        break
      case 'veins':
      case 'veins2': {
        const need = this.stepV === 'veins' ? 2 : 3
        for (const v of this.heart.veins.slice(0, 3)) if (this.cutCount() < need && v.alive) v.cut()
        break
      }
      case 'heart':
        this.heartHit = true
        break
      case 'pour':
        if (this.choice.open) this.choice.pick()
        break
      case 'grabTowa':
        this.grabbed = true
        break
      case 'escape':
        this.escaped = true
        break
      default:
        rt.endCinematic(true)
    }
  }

  debug(): Record<string, unknown> {
    return {
      uraStep: this.stepV,
      uraScenario: this.scenario,
      uraActive: this.active,
      veinsAlive: this.heart.aliveCount,
      doorLeft: this.doorRunning ? Math.round(doorLeft(this.doorTotal, this.doorT) * 10) / 10 : null,
      escort: this.path.length ? `${this.pathIdx}/${this.path.length - 1}` : null,
    }
  }

  dispose(): void {
    this.clock?.dispose()
    this.clock = null
    this.curtain?.dispose()
    this.curtain = null
    this.choice.close()
    this.timerEl?.remove()
    this.timerEl = null
    if (this.rt && this.prevRespawn !== null) this.rt.combat.onRespawn = this.prevRespawn
    this.active = false
    this.hands.dispose()
    this.slits.dispose()
    this.slash.dispose()
    this.wisps.dispose()
    this.sparks.dispose()
    this.heart.dispose()
    this.arena.dispose()
    this.ownLamp?.dispose()
    this.wireGeo.dispose()
    ;(this.wire.material as THREE.Material).dispose()
    this.group.removeFromParent()
  }

  // ---------------------------------------------------------------- 中身

  private lines(key: UraLineKey): DialogueLine[] {
    const custom = this.o.lines?.(key)
    if (custom && custom.length) return custom
    return LINES[key] ?? []
  }

  private cutCount(): number {
    return this.heart.veins.filter((v) => !v.alive).length
  }

  /** 入口の足場のまん中（扉は左おく） */
  private spawnPoint(): THREE.Vector3 {
    return this.arena.entry.clone().add(new THREE.Vector3(0.4, 0, -0.6))
  }

  /** 広場の奥のふち（心臓の前） */
  private heartFront(): THREE.Vector3 {
    const a = this.arena.platforms.find((p) => p.id === 'arena')
    const c = this.arena.center
    return new THREE.Vector3(c.x, c.y, c.z - (a ? a.d * 0.5 - 0.8 : 5))
  }

  /** チャンダの道（入口 → 飛び石 → 広場 → 心臓の前）。足場のすき間は少し跳ぶ */
  private escortPath(): THREE.Vector3[] {
    const plats = ['entry', 'step1', 'step2', 'step3', 'arena'].map((id) => this.arena.platforms.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p)
    const pts: THREE.Vector3[] = [this.spawnPoint().add(new THREE.Vector3(1.0, 0, 0))]
    for (let i = 0; i < plats.length - 1; i++) {
      const a = plats[i]
      const b = plats[i + 1]
      const aEdge = new THREE.Vector3(a.center.x, a.center.y, a.center.z - a.d * 0.5 + 0.35)
      const bEdge = new THREE.Vector3(b.center.x, b.center.y, b.center.z + b.d * 0.5 - 0.35)
      const air = aEdge.clone().lerp(bEdge, 0.5)
      air.y = Math.max(aEdge.y, bEdge.y) + 0.7
      pts.push(aEdge, air, bEdge)
      if (b.id !== 'arena') pts.push(new THREE.Vector3(b.center.x, b.center.y, b.center.z))
    }
    pts.push(this.heartFront().add(new THREE.Vector3(0, 0, 4)), this.heartFront())
    return pts
  }

  private stepEscort(dt: number, rt: StageRuntime, ally: Character): void {
    const pos = ally.root.position
    // 波：道の半分ほどで影が出る
    const thresholds = [2, 6, 10]
    while (this.waves < thresholds.length && this.pathIdx >= thresholds[this.waves]) this.spawnWave(this.waves++)
    const dists = rt.combat.alive(SHADE_TAG).map((e) => e.pos.distanceTo(pos))
    const can = escortCanMove(dists, 4)
    const wasBlocked = this.blocked
    this.blocked = !can
    const p = ally as PersonCharacter
    if (this.blocked) {
      p.setPose?.('guard')
      p.setExpression?.('laugh')
      const near = rt.combat.alive(SHADE_TAG).sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos))[0]
      if (near) ally.root.rotation.y = faceYaw(pos, near.pos)
      if (!wasBlocked && this.clock && this.clock.time - this.blockSayAt > 5) {
        this.blockSayAt = this.clock.time
        const L = this.lines('k_escort_block')
        const l = L[Math.floor(Math.random() * L.length)]
        if (l && !rt.talking) rt.say(l.speaker, l.text, 2.4)
      }
      return
    }
    if (wasBlocked) {
      p.setPose?.('run')
      p.setExpression?.('neutral')
      const L = this.lines('k_escort_go')
      const l = L[Math.floor(Math.random() * L.length)]
      if (l && !rt.talking && this.clock && this.clock.time - this.blockSayAt > 2) rt.say(l.speaker, l.text, 1.8)
    }
    if (this.pathIdx >= this.path.length - 1) return
    const target = this.path[this.pathIdx + 1]
    const d = this.tmp.subVectors(target, pos)
    const flat = Math.hypot(d.x, d.z)
    const sp = 2.1
    const step = sp * dt
    if (flat <= step || flat < 0.02) {
      pos.copy(target)
      this.pathIdx++
    } else {
      pos.x += (d.x / flat) * step
      pos.z += (d.z / flat) * step
      pos.y += d.y * Math.min(1, step / Math.max(flat, 0.001))
      ally.root.rotation.y = faceYaw(pos, target)
    }
    p.setPose?.('walk')
    this.allySpeed = sp
  }

  private spawnWave(i: number): void {
    const P = (id: string) => this.arena.platforms.find((p) => p.id === id)?.center ?? this.arena.center
    if (i === 0) {
      this.spawnShade('mite', P('step2').clone().add(new THREE.Vector3(0.6, 0, 0.3)))
      this.spawnShade('mite', P('step2').clone().add(new THREE.Vector3(-0.6, 0, -0.4)))
    } else if (i === 1) {
      this.spawnShade('shield', P('step3').clone().add(new THREE.Vector3(0.6, 0, 0)))
      this.spawnShade('mite', this.arena.center.clone().add(new THREE.Vector3(-1.5, 0, 4)))
    } else {
      this.spawnShade('mite', this.arena.center.clone().add(new THREE.Vector3(2, 0, -1)))
      this.spawnShade('mite', this.arena.center.clone().add(new THREE.Vector3(-2.2, 0, -2)))
      this.spawnShade('shield', this.arena.center.clone().add(new THREE.Vector3(0, 0, -3), ), true)
    }
  }

  private spawnShade(kind: 'mite' | 'shield', pos: THREE.Vector3, big = false): EnemyHandle | null {
    const rt = this.rt
    if (!rt) return null
    const h = rt.combat.spawn(kind, pos, { tag: SHADE_TAG, leash: 6, style: big ? BIG_SHADE_STYLE : SHADE_STYLE, hp: kind === 'shield' ? 4 : 2 })
    this.sparks.burst(14, pos.clone().add(new THREE.Vector3(0, 0.6, 0)), 2, { life: 0.7, size: 0.08, color: new THREE.Color('#a05cff').multiplyScalar(2), drag: 2 })
    return h
  }

  /** 影を消す（poof：けむりがはじける） */
  private killShades(poof: boolean): void {
    const rt = this.rt
    if (!rt) return
    for (const e of rt.combat.alive(SHADE_TAG)) {
      if (poof) this.wisps.poof(e.pos, e.kind === 'mite' ? 0.7 : 1)
      rt.combat.kill(e)
    }
  }

  /** 後ろについてくる（ally：右うしろ、towa：左うしろ）。返り値は歩きの速さ */
  private follow(f: Follower, P: THREE.Vector3, rt: StageRuntime, dt: number, side: number): number {
    const yaw = rt.player.facing
    const want = this.tmp.set(P.x + Math.sin(yaw) * 1.6 + Math.cos(yaw) * 0.8 * side, P.y, P.z + Math.cos(yaw) * 1.6 - Math.sin(yaw) * 0.8 * side)
    const pos = f.ch.root.position
    const dx = want.x - pos.x
    const dz = want.z - pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > 9 || Math.abs(want.y - pos.y) > 4) {
      pos.copy(want)
      return 0
    }
    const sp = Math.min(6, dist * 2.6)
    if (dist > 0.05) {
      pos.x += (dx / dist) * sp * dt
      pos.z += (dz / dist) * sp * dt
      f.ch.root.rotation.y = faceYaw(pos, this.tmp2.set(pos.x + dx, pos.y, pos.z + dz))
    }
    pos.y += (want.y - pos.y) * Math.min(1, dt * 6)
    return sp > 0.3 ? sp : 0
  }

  private placePlayer(rt: StageRuntime, p: THREE.Vector3, yaw: number): void {
    rt.player.teleport(p.clone(), yaw)
    // カメラはうしろ（向きの反対側）から
    rt.camera.position.set(p.x + Math.sin(yaw) * 4.4, p.y + 2.4, p.z + Math.cos(yaw) * 4.4)
    rt.camera.lookAt(p.x, p.y + 1.0, p.z)
    rt.camRig.syncFrom(rt.camera, p)
  }

  private ensureLamp(): Lamp {
    if (this.o.lamp) {
      this.lamp = this.o.lamp
      return this.o.lamp
    }
    if (!this.ownLamp) {
      this.ownLamp = new Lamp(this.group, { dark: true })
      const towa = this.o.towa as PersonCharacter | undefined
      if (towa?.holdLamp) towa.holdLamp(this.ownLamp)
      else this.group.add(this.ownLamp.root)
    }
    this.lamp = this.ownLamp
    return this.ownLamp
  }

  private cleanupTargets(rt: StageRuntime): void {
    for (const id of ['ura_leg', 'ura_heart', 'ura_vein0', 'ura_vein1', 'ura_vein2']) rt.chrono.remove(id)
  }

  private retryBanner(rt: StageRuntime): void {
    rt.hud.banner('もう一度！', 'fail', 1.6)
  }

  /** sec 秒のあいだ、毎フレーム f(k)（k = 0..1）。clock で進む */
  private async tween(sec: number, f: (k: number) => void): Promise<void> {
    const c = this.clock
    if (!c) return
    const t0 = c.time
    for (;;) {
      const k = Math.min(1, (c.time - t0) / Math.max(0.001, sec))
      f(k)
      if (k >= 1 || c.dead) return
      await c.wait(0)
    }
  }

  // 扉の残り時間（画面の上のまん中）
  private showTimer(on: boolean): void {
    if (!on) {
      this.timerEl?.remove()
      this.timerEl = null
      return
    }
    if (this.timerEl) return
    const el = document.createElement('div')
    el.style.cssText =
      'position:fixed;left:50%;top:64px;transform:translateX(-50%);padding:6px 16px;border-radius:14px;background:rgba(40,24,8,0.72);color:#ffe2a0;font:800 18px "M PLUS Rounded 1c",system-ui,sans-serif;border:1px solid rgba(255,210,122,0.7);box-shadow:0 0 18px rgba(255,190,80,0.45);pointer-events:none;z-index:5;text-align:center;min-width:220px'
    el.innerHTML = '<div class="ut-label">扉が閉じるまで</div><div style="height:6px;border-radius:3px;background:rgba(255,255,255,0.18);margin-top:4px;overflow:hidden"><div class="ut-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#ffb84a,#fff2b0)"></div></div>'
    ;(document.getElementById('ui') ?? document.body).appendChild(el)
    this.timerEl = el
  }

  private updateTimer(left: number): void {
    const el = this.timerEl
    if (!el) return
    const lab = el.querySelector('.ut-label') as HTMLDivElement
    const fill = el.querySelector('.ut-fill') as HTMLDivElement
    lab.textContent = `扉が閉じるまで　${Math.ceil(left)} 秒`
    fill.style.width = `${Math.max(0, Math.min(100, (left / this.doorTotal) * 100)).toFixed(1)}%`
    el.style.color = left < 8 ? '#ffb0a0' : '#ffe2a0'
  }
}
