// 戦闘（docs/中盤シナリオとワールド構成_v1.md §4.1）。シェルがステージごとに 1 つ作り、ステージは rt.combat で敵を出す。
// ・K：3 段の連続攻撃（近くの敵へ向き直って踏み込む）。Shift（戦闘中）：回避
// ・敵（欠け）：combatLogic の EnemyBrain が行動を決め、ここで動かす（地面に沿って歩く・壁で止まる・住みかへ戻る）
// ・クロー：敵は enemy_pull（小さい敵・盾を手元へ）／enemy_zip（大きい敵へ飛び込んで蹴る）の対象としてクローに並ぶ
// ・はじくNMClaw（左腕）：前方へ電気の衝撃。敵をよろけさせ、盾・装甲を割り、ひび割れた壁（breakable）を壊す
// ・体力 0：暗転してチェックポイントへ戻り、全回復。敵は住みかへ戻って元どおり
// 敵の当たり判定は物理に入れない（地面と壁はレイで調べる）。見た目・DOM はここで作って dispose() で解放する。
import * as THREE from 'three'
import type { Physics } from '../player/physics'
import type { PlayerController } from '../player/controller'
import type { ClawSystem } from '../player/clawSystem'
import type { ClawTargetDef, WireEvent } from '../player/clawLogic'
import type { Hud } from '../ui/hud'
import { ATTACK_STEPS, AttackCombo, COMBAT_TUNING, Dodge, EnemyBrain, PlayerHealth, angleTo, inArc, type DamageResult, type EnemyKind, type EnemyStats } from './combatLogic'

/** やられて戻ったあと、敵が襲ってこない時間（秒） */
const RESPAWN_GRACE = 2.2
import { EnemyModel, type EnemyStyle } from './enemyModels'
import './combat.css'

const v3 = () => new THREE.Vector3()
const PLAYER_R = 0.35
/** これより遠い敵は描かず、住みかで待っているなら考えるのも止める（m） */
const FAR_HIDE = 55

export type SpawnOptions = {
  /** 向き（モデルの正面 -Z を回す角度） */
  yaw?: number
  /** 住みかから離れてよい距離（m） */
  leash?: number
  /** ステージが使う印（倒した数を数えるなど） */
  tag?: string
  style?: EnemyStyle
  /** 体力の上書き（ボスなど） */
  hp?: number
  /** この敵だけの数値の上書き（溜めの長さ・当たりの強さなど） */
  stats?: Partial<EnemyStats>
  /** やられて戻ったときも、この敵の体力を満タンに戻さない（ボス：けずった分を残す） */
  keepHpOnRespawn?: boolean
  /** 大きさの倍率（見た目と当たり） */
  scale?: number
  /** 出てくるまで隠す（appear() で出す） */
  hidden?: boolean
  /** 装甲（はじくで割れるまで攻撃が通らない。欠け重の形だけ見た目が付く） */
  armored?: boolean
  /**
   * よろいの板（物語 v7 の影獣：鉄板・看板を体にはりつける）。モデルに付け、クローで 1 枚ずつはがす（盾と同じく手元へ飛んでくる）。
   * 全部はがすまで攻撃が通らない。はじくでは割れない。armored より優先
   */
  plates?: THREE.Object3D[]
  /** よろいの板が 1 枚はがれた（残りの枚数） */
  onPlate?: (left: number) => void
  /** よろいの板は、ゆるむまで（loosenPlates）はがせない。ゆるんでいないときに J で引くと、がっちりはじかれる */
  platesLocked?: boolean
  /** はがした板を手に持つ（もう一度 J で投げる。当たると装甲に関係なくダメージで、大きくひるむ） */
  plateThrow?: boolean
  /** 投げた板が当たったときのダメージ（既定 2） */
  throwDamage?: number
  /** ゆるんでいない板を J で引いた（ステージがヒントを出す） */
  onPlateLocked?: () => void
  /** 投げた板が、この敵に当たった */
  onPlateHit?: () => void
  /** 照準の吸い付き範囲の倍率（ClawTargetDef.cone。小さいほど、正面へきちんと向けないと選ばれない） */
  aimCone?: number
}

/** K の攻撃が当たる、敵でない物（ボスの体の一部・トワなど）。ステージが addHitTarget で足す */
export type HitTarget = {
  id: string
  /** 中心（毎回読む。動かしてよい） */
  pos: THREE.Vector3
  radius: number
  enabled: boolean
  /** 当たった（damage は連続攻撃の段のダメージ、step は 0〜2） */
  onHit: (damage: number, step: number) => void
}

export type EnemyHandle = {
  readonly id: string
  readonly kind: EnemyKind
  readonly tag: string
  readonly brain: EnemyBrain
  readonly model: EnemyModel
  readonly pos: THREE.Vector3
  readonly maxHp: number
  yaw: number
  readonly alive: boolean
}

export type Breakable = {
  id: string
  pos: THREE.Vector3
  radius: number
  enabled: boolean
  /** はじくで壊れた */
  onBreak: () => void
}

type Enemy = EnemyHandle & {
  def: ClawTargetDef
  home: THREE.Vector3
  homeYaw: number
  leash: number
  scale: number
  knock: THREE.Vector3
  /** クローで引き寄せている（from から手元へ） */
  yank: { from: THREE.Vector3; to: THREE.Vector3 } | null
  /** 盾をはがしている途中（盾が手元へ飛んでくる） */
  shieldFly: { obj: THREE.Object3D; from: THREE.Vector3; t: number; dropT: number } | null
  /** よろいの板（残り）。null ならよろいなし */
  plates: THREE.Object3D[] | null
  onPlate: ((left: number) => void) | null
  struck: boolean
  dyingT: number
  hidden: boolean
  removed: boolean
  /** やられて戻ったときも体力を残す */
  keepHp: boolean
  /** よろいの板はゆるむまではがせない */
  platesLocked: boolean
  /** よろいの板がゆるんでいる残りの秒 */
  looseT: number
  plateThrow: boolean
  throwDamage: number
  onPlateLocked: (() => void) | null
  onPlateHit: (() => void) | null
}

/** 手に持った・投げたよろいの板 */
type HeldPlate = { obj: THREE.Object3D; damage: number }
type ThrownPlate = HeldPlate & { vel: THREE.Vector3; t: number; dropT: number }

/** 攻撃を受けたとき：のけぞる時間（秒）・横に飛ばされる最小の速さ（m/s）・はね上がる速さ（m/s） */
const HURT_POSE_SEC = 0.55
const HURT_MIN_KNOCK = 5
const HURT_HOP = 4.2

/** 投げた板の速さ（m/s）と、まわりの敵へ向きを寄せる角度（ラジアン） */
const THROW_SPEED = 17
const THROW_HOMING = 0.45

/** 小さな破片・火花（使い回し） */
class Sparks {
  readonly mesh: THREE.InstancedMesh
  private readonly n: number
  private readonly life: Float32Array
  private readonly vel: Float32Array
  private readonly pos: Float32Array
  private next = 0
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly p = new THREE.Vector3()
  private readonly c = new THREE.Color()

  constructor(n = 96) {
    this.n = n
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n)
    this.mesh.frustumCulled = false
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.life = new Float32Array(n)
    this.vel = new Float32Array(n * 3)
    this.pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      this.mesh.setColorAt(i, this.c.set(1, 1, 1))
      this.m.makeScale(0, 0, 0)
      this.mesh.setMatrixAt(i, this.m)
    }
  }

  burst(at: THREE.Vector3, color: THREE.ColorRepresentation, count: number, speed: number, up = 2): void {
    this.c.set(color).multiplyScalar(2.5)
    for (let k = 0; k < count; k++) {
      const i = this.next
      this.next = (this.next + 1) % this.n
      this.life[i] = 0.35 + Math.random() * 0.35
      const a = Math.random() * Math.PI * 2
      const r = speed * (0.4 + Math.random() * 0.6)
      this.vel[i * 3] = Math.cos(a) * r
      this.vel[i * 3 + 1] = up * (0.5 + Math.random())
      this.vel[i * 3 + 2] = Math.sin(a) * r
      this.pos[i * 3] = at.x
      this.pos[i * 3 + 1] = at.y
      this.pos[i * 3 + 2] = at.z
      this.mesh.setColorAt(i, this.c)
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  update(dt: number): void {
    let any = false
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue
      any = true
      this.life[i] -= dt
      this.vel[i * 3 + 1] -= 9 * dt
      this.pos[i * 3] += this.vel[i * 3] * dt
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt
      const k = Math.max(0, Math.min(1, this.life[i] * 3))
      this.p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2])
      this.q.setFromAxisAngle(this.s.set(0.3, 1, 0.2).normalize(), this.life[i] * 20)
      this.m.compose(this.p, this.q, this.s.setScalar(k))
      this.mesh.setMatrixAt(i, this.m)
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

export type CombatHost = {
  phys: Physics
  player: PlayerController
  claw: ClawSystem
  hud: Hud
  ui: HTMLElement | null
  /** 画面の揺れ（シェルの rt.shake） */
  shake(amount: number): void
  /** 当たった所の輪をカメラへ向ける */
  camera?: THREE.Camera
}

export class CombatSystem {
  /** このステージで戦闘を使うか（false の間は K は案内だけ、敵は出せるが襲ってこない） */
  enabled = false
  /** 敵が襲ってこない（会話・演出の間。ステージが切り替える） */
  passive = false
  /** やられて戻ったあと、敵が襲ってこない残りの秒数 */
  private graceT = 0
  readonly group = new THREE.Group()
  readonly health = new PlayerHealth()
  /** 体力 0 のときに戻る場所（ステージが設定。無ければ到着地点） */
  checkpoint: THREE.Vector3 | null = null
  checkpointYaw = 0
  /** 敵を倒した（倒れて消えたとき） */
  onEnemyDefeated: ((e: EnemyHandle) => void) | null = null
  /** 体力 0 から復帰した */
  onRespawn: (() => void) | null = null
  private readonly host: CombatHost
  private readonly enemies: Enemy[] = []
  private readonly byDef = new Map<ClawTargetDef, Enemy>()
  private readonly breakables: Breakable[] = []
  private readonly hitTargets: HitTarget[] = []
  private readonly combo = new AttackCombo()
  private readonly dodgeState = new Dodge()
  private readonly sparks = new Sparks()
  private readonly ring: THREE.Mesh
  private ringT = -1
  /** パンチ・投げた板が当たった所に広がる輪（どこに当たったか、ひと目でわかるように） */
  private readonly hitRings: Array<{ mesh: THREE.Mesh; t: number; size: number }> = []
  private hurtT = 0
  private impactT = 0
  private impactCd = 0
  private impactFired = false
  /** 当たった瞬間の止まり（実時間の秒） */
  private hitstop = 0
  /** はがして手に持ったよろいの板・投げて飛んでいる板 */
  private held: HeldPlate | null = null
  private readonly thrown: ThrownPlate[] = []
  private downT = -1
  private seq = 0
  private clock = 0
  private armorHintAt = -99
  private readonly fade: HTMLDivElement
  private bossBar: { el: HTMLDivElement; fill: HTMLDivElement; e: Enemy | null; frac: number } | null = null
  private readonly start = v3()
  private readonly tmp = v3()
  private readonly tmp2 = v3()
  private readonly down = new THREE.Vector3(0, -1, 0)

  constructor(host: CombatHost) {
    this.host = host
    this.group.name = 'combat'
    this.group.add(this.sparks.mesh)
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.08, 6, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    )
    this.ring.visible = false
    this.group.add(this.ring)
    const hitGeo = new THREE.RingGeometry(0.55, 1, 28)
    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, 2.2), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }))
      mesh.visible = false
      this.group.add(mesh)
      this.hitRings.push({ mesh, t: -1, size: 1 })
    }
    this.start.copy(host.player.position)
    this.fade = document.createElement('div')
    this.fade.className = 'combat-fade'
    ;(host.ui ?? document.body).appendChild(this.fade)
  }

  // ---------------------------------------------------------------- ステージから

  /** 敵を出す */
  spawn(kind: EnemyKind, pos: THREE.Vector3, o: SpawnOptions = {}): EnemyHandle {
    const id = `kake_${kind}_${++this.seq}`
    const brain = new EnemyBrain(kind, this.seq, o.stats)
    if (o.hp) brain.hp = o.hp
    const model = new EnemyModel(kind, o.style)
    const scale = o.scale ?? 1
    model.baseScale = scale
    model.root.scale.setScalar(scale)
    const plates = o.plates?.length ? [...o.plates] : null
    if (plates) {
      // よろいの板：クローではがすまで攻撃が通らない（装甲のように時間で戻らない）
      brain.setArmored(true)
      for (const p of plates) model.root.add(p)
    } else if (o.armored) {
      brain.setArmored(true)
      model.setArmor(true)
    }
    model.root.position.copy(pos)
    model.root.rotation.y = o.yaw ?? 0
    model.root.visible = !o.hidden
    this.group.add(model.root)
    const s = brain.stats
    const def: ClawTargetDef = {
      id,
      type: plates ? 'enemy_pull' : s.mass === 'heavy' ? 'enemy_zip' : 'enemy_pull',
      label: plates ? `${s.name}（よろいをはがす）` : s.mass === 'heavy' ? `${s.name}（飛び込む）` : brain.shield ? `${s.name}（盾をはがす）` : s.name,
      point: pos.clone().add(new THREE.Vector3(0, model.chestY * scale, 0)),
      radius: s.radius * scale + 0.15,
      enabled: !o.hidden,
      noLineOfSight: false,
      range: 11,
      landing: pos.clone(),
      cone: o.aimCone,
    }
    const e: Enemy = {
      id,
      kind,
      tag: o.tag ?? '',
      brain,
      model,
      pos: model.root.position,
      maxHp: brain.hp,
      keepHp: o.keepHpOnRespawn ?? false,
      get yaw() {
        return model.root.rotation.y
      },
      set yaw(y: number) {
        model.root.rotation.y = y
      },
      get alive() {
        return brain.alive
      },
      def,
      home: pos.clone(),
      homeYaw: o.yaw ?? 0,
      leash: o.leash ?? 14,
      scale,
      knock: v3(),
      yank: null,
      shieldFly: null,
      plates,
      onPlate: o.onPlate ?? null,
      struck: false,
      dyingT: -1,
      hidden: !!o.hidden,
      removed: false,
      platesLocked: !!o.platesLocked,
      looseT: 0,
      plateThrow: !!o.plateThrow,
      throwDamage: o.throwDamage ?? 2,
      onPlateLocked: o.onPlateLocked ?? null,
      onPlateHit: o.onPlateHit ?? null,
    }
    this.enemies.push(e)
    this.byDef.set(def, e)
    this.host.claw.targets.push(def)
    return e
  }

  /** よろいの板を sec 秒だけゆるめる（その間だけ J ではがせる）。ステージが「柱にぶつかった」などで呼ぶ。0 で締め直す */
  loosenPlates(h: EnemyHandle, sec: number): void {
    const e = this.enemies.find((x) => x.id === h.id)
    if (e) e.looseT = Math.max(0, sec)
  }

  /** いま、よろいの板をはがせるか（ゆるんでいる、または締めていない敵） */
  platesLoose(h: EnemyHandle): boolean {
    const e = this.enemies.find((x) => x.id === h.id)
    return !!e?.plates?.length && (!e.platesLocked || e.looseT > 0)
  }

  /** はがしたよろいの板を手に持っている（J で投げる） */
  get holdingPlate(): boolean {
    return this.held !== null
  }

  /** 持っている板を、向いている方へ投げる（正面の近くに敵がいれば、そちらへ少し寄せる） */
  throwPlate(): boolean {
    const h = this.held
    if (!h || this.downT >= 0) return false
    this.held = null
    const pl = this.host.player
    const P = pl.position
    const dir = new THREE.Vector3(-Math.sin(pl.facing), 0, -Math.cos(pl.facing))
    let best: Enemy | null = null
    let bestA = THROW_HOMING
    for (const e of this.enemies) {
      if (!e.alive || e.hidden || e.removed) continue
      const dx = e.pos.x - P.x
      const dz = e.pos.z - P.z
      if (dx * dx + dz * dz > 14 * 14) continue
      const a = Math.abs(angleTo(pl.facing, dx, dz))
      if (a < bestA) {
        bestA = a
        best = e
      }
    }
    if (best) dir.set(best.pos.x - h.obj.position.x, best.pos.y + best.model.chestY * best.scale - h.obj.position.y, best.pos.z - h.obj.position.z).normalize()
    this.thrown.push({ ...h, vel: dir.multiplyScalar(THROW_SPEED).add(new THREE.Vector3(0, 1.2, 0)), t: 0, dropT: -1 })
    this.combo.cancel()
    pl.burstMove(dir.x * -1.2, dir.z * -1.2, 0.08)
    return true
  }

  /** 持っている板・飛んでいる板を片付ける（場面の切りかえ・やられたとき） */
  dropPlates(): void {
    if (this.held) this.held.obj.removeFromParent()
    this.held = null
    for (const t of this.thrown) t.obj.removeFromParent()
    this.thrown.length = 0
  }

  /** 隠して出した敵を出す（ボスの登場など） */
  appear(h: EnemyHandle): void {
    const e = this.enemies.find((x) => x.id === h.id)
    if (!e) return
    e.hidden = false
    e.model.root.visible = true
    e.def.enabled = true
    this.sparks.burst(this.tmp.copy(e.pos).setY(e.pos.y + 0.8), '#b04cff', 20, 4)
  }

  /** まだ生きている敵（tag で絞れる） */
  alive(tag?: string): EnemyHandle[] {
    return this.enemies.filter((e) => e.alive && !e.removed && (tag === undefined || e.tag === tag))
  }

  /** 演出で倒す（錨がほどけて欠けが消えるときなど）。倒れて消えたら onEnemyDefeated が呼ばれる */
  kill(h: EnemyHandle): void {
    const e = this.enemies.find((x) => x.id === h.id)
    if (!e || !e.alive || e.removed) return
    e.brain.armor = false
    const res = e.brain.hurt(e.brain.hp + 99, 0, false)
    if (res === 'killed') this.onEnemyHurt(e, res, 0, 0)
  }

  addBreakable(b: Breakable): void {
    this.breakables.push(b)
  }

  /** K の攻撃が当たる物を足す（同じ id は置きかえる） */
  addHitTarget(t: HitTarget): void {
    this.removeHitTarget(t.id)
    this.hitTargets.push(t)
  }

  removeHitTarget(id: string): void {
    const i = this.hitTargets.findIndex((x) => x.id === id)
    if (i >= 0) this.hitTargets.splice(i, 1)
  }

  /** 敵でないボス（時の鐘人形・トワ・オルムの心臓など）の体力を画面の上に出す。frac は 0〜1。name が null で消す */
  showBossBar(name: string | null, frac = 1): void {
    this.bossBar?.el.remove()
    this.bossBar = null
    if (name === null) return
    const el = document.createElement('div')
    el.className = 'combat-boss'
    el.innerHTML = `<div class="cb-name"></div><div class="cb-bar"><div class="cb-fill"></div></div>`
    ;(el.querySelector('.cb-name') as HTMLDivElement).textContent = name
    ;(this.host.ui ?? document.body).appendChild(el)
    this.bossBar = { el, fill: el.querySelector('.cb-fill') as HTMLDivElement, e: null, frac }
    this.setBossBar(frac)
  }

  /** showBossBar で出した体力（0〜1） */
  setBossBar(frac: number): void {
    const b = this.bossBar
    if (!b || b.e) return
    b.frac = Math.max(0, Math.min(1, frac))
    b.fill.style.transform = `scaleX(${b.frac.toFixed(3)})`
  }

  setCheckpoint(p: THREE.Vector3, yaw = 0): void {
    this.checkpoint = p.clone()
    this.checkpointYaw = yaw
  }

  /** ボスの体力を画面の上に出す（null で消す） */
  showBoss(h: EnemyHandle | null, name = ''): void {
    this.bossBar?.el.remove()
    this.bossBar = null
    const e = h ? this.enemies.find((x) => x.id === h.id) : null
    if (!e) return
    const el = document.createElement('div')
    el.className = 'combat-boss'
    el.innerHTML = `<div class="cb-name"></div><div class="cb-bar"><div class="cb-fill"></div></div>`
    ;(el.querySelector('.cb-name') as HTMLDivElement).textContent = name || e.brain.stats.name
    ;(this.host.ui ?? document.body).appendChild(el)
    this.bossBar = { el, fill: el.querySelector('.cb-fill') as HTMLDivElement, e, frac: 1 }
  }

  // ---------------------------------------------------------------- 状態

  /** 近くで敵が襲ってきている（回避・異次元拠点の判定） */
  get inCombat(): boolean {
    const p = this.host.player.position
    return this.enemies.some((e) => e.alive && !e.hidden && e.brain.engaged && e.pos.distanceToSquared(p) < 15 * 15)
  }

  /** ボスの体力が出ていて、ボスがまだ倒れていない（番人の曲） */
  get bossActive(): boolean {
    const b = this.bossBar
    return b !== null && (b.e ? b.e.alive : b.frac > 0)
  }

  /** 体力 0 から戻る途中（操作を止める） */
  get downed(): boolean {
    return this.downT >= 0
  }

  /** 攻撃中は歩きを遅く（0〜1） */
  get moveScale(): number {
    if (this.downT >= 0) return 0
    return this.combo.busy || this.impactT > 0 ? 0.25 : 1
  }

  /** 当たった瞬間の一瞬の止まり（シェルが dt に掛ける） */
  get timeScale(): number {
    return this.hitstop > 0 ? 0.08 : 1
  }

  /** 実時間で進めるもの（止まりの残り）。シェルが dt を縮める前に呼ぶ */
  tickReal(dt: number): void {
    this.hitstop = Math.max(0, this.hitstop - dt)
  }

  /** ネクマックスのポーズ（null なら通常どおり） */
  poseHint(): 'punch' | 'punchL' | 'dash' | 'hurt' | null {
    if (this.downT >= 0 || this.hurtT > 0) return 'hurt'
    if (this.dodgeState.active) return 'dash'
    if (this.impactT > 0) return 'punchL'
    const s = this.combo.current
    if (this.combo.busy && s) return s.hand === 'l' ? 'punchL' : 'punch'
    return null
  }

  // ---------------------------------------------------------------- 操作

  /** K */
  attack(): void {
    if (this.downT >= 0 || this.impactT > 0) return
    const w = this.host.claw.wire.phase
    if (w === 'zipping' || w === 'swinging' || w === 'holding' || w === 'carrying') return
    for (const ev of this.combo.press()) this.onCombo(ev.kind, ev.kind === 'end' ? -1 : ev.step)
  }

  /** Shift を押した瞬間（戦闘中だけ）。dx, dz は入力の向き（ワールド） */
  dodge(dx: number, dz: number): void {
    const pl = this.host.player
    if (this.downT >= 0 || pl.isExternal || !pl.grounded) return
    if (!this.dodgeState.press(dx, dz, pl.facing)) return
    this.combo.cancel()
    const D = this.dodgeState
    pl.burstMove(D.dirX * 11.5, D.dirZ * 11.5, 0.26)
  }

  /** はじくNMClaw（J。左腕で選んでいるとき）。前方へ衝撃 */
  impact(): boolean {
    if (this.downT >= 0 || this.impactCd > 0 || this.host.player.isExternal) return false
    this.combo.cancel()
    this.impactT = 0.42
    this.impactCd = 0.75
    this.impactFired = false
    return true
  }

  // ---------------------------------------------------------------- クロー

  onClawEvent(ev: WireEvent): void {
    if (!('target' in ev)) return
    const e = this.byDef.get(ev.target)
    if (!e) return
    const pl = this.host.player
    switch (ev.kind) {
      case 'connected':
        if (ev.target.type === 'enemy_pull') {
          if (e.plates && e.plates.length && e.platesLocked && e.looseT <= 0) {
            // ゆるんでいない：がっちりくっついていて、はがれない
            this.sparks.burst(e.def.point, '#9fd8ff', 12, 3)
            this.host.shake(0.12)
            e.onPlateLocked?.()
          } else if (e.plates && e.plates.length) {
            this.stripPlate(e)
          } else if (e.brain.shield && e.model.shield) {
            // 盾をはがす：盾だけが手元へ飛んでくる
            const obj = e.model.shield
            const wp = obj.getWorldPosition(v3())
            const wq = obj.getWorldQuaternion(new THREE.Quaternion())
            obj.removeFromParent()
            obj.position.copy(wp)
            obj.quaternion.copy(wq)
            this.group.add(obj)
            e.model.shield = null
            e.shieldFly = { obj, from: wp.clone(), t: 0, dropT: -1 }
            e.brain.dropShield()
            e.def.label = e.brain.stats.name
            this.sparks.burst(wp, '#ffb347', 10, 3)
          } else {
            e.brain.stun(1.4)
            e.yank = { from: e.pos.clone(), to: v3() }
          }
        } else if (ev.target.type === 'enemy_zip') e.brain.stun(1.2)
        break
      case 'object_arrived':
      case 'dropped':
        if (e.yank) {
          e.yank = null
          this.sparks.burst(this.tmp.copy(e.pos).setY(e.pos.y + 0.4), '#c77dff', 8, 2.5)
        }
        if (e.shieldFly && e.plateThrow && e.shieldFly.dropT < 0) {
          // はがした板を手に持つ（もう一度 J で投げる）
          if (this.held) this.held.obj.removeFromParent()
          this.held = { obj: e.shieldFly.obj, damage: e.throwDamage }
          e.shieldFly = null
          this.host.hud.toast('J で、板を投げ返そう！', 2.4)
        } else if (e.shieldFly) e.shieldFly.dropT = 0
        break
      case 'arrived':
        if (ev.target.type === 'enemy_zip') {
          // 飛び込んで蹴る
          const r = e.brain.hurt(2, 1.4, false)
          this.onEnemyHurt(e, r, 4, 0.12)
          this.tmp.subVectors(e.pos, pl.position).setY(0).normalize()
          pl.burstMove(-this.tmp.x * 4, -this.tmp.z * 4, 0.16)
          pl.velocity.y = 4.5
        }
        break
    }
  }

  /** よろいの板を 1 枚はがす（盾と同じく手元へ飛んでくる）。最後の 1 枚で攻撃が通るようになる */
  private stripPlate(e: Enemy): void {
    const obj = e.plates?.pop()
    if (!obj) return
    const wp = obj.getWorldPosition(v3())
    const wq = obj.getWorldQuaternion(new THREE.Quaternion())
    obj.removeFromParent()
    obj.position.copy(wp)
    obj.quaternion.copy(wq)
    this.group.add(obj)
    if (e.shieldFly) e.shieldFly.obj.removeFromParent()
    e.shieldFly = { obj, from: wp.clone(), t: 0, dropT: -1 }
    e.brain.stun(1.1)
    e.looseT = 0
    this.sparks.burst(wp, '#ffb347', 14, 3.5)
    this.host.shake(0.18)
    const left = e.plates?.length ?? 0
    if (left === 0) {
      e.plates = null
      e.brain.armored = false
      e.brain.armor = false
      e.def.type = e.brain.stats.mass === 'heavy' ? 'enemy_zip' : 'enemy_pull'
      e.def.label = e.brain.stats.mass === 'heavy' ? `${e.brain.stats.name}（飛び込む）` : e.brain.stats.name
      this.host.hud.toast('よろいがはがれた！ 今のうちに攻撃！', 2.4)
    }
    e.onPlate?.(left)
  }

  // ---------------------------------------------------------------- 毎フレーム

  update(dt: number): void {
    const pl = this.host.player
    const hud = this.host.hud
    this.clock += dt
    this.health.tick(dt)
    this.dodgeState.tick(dt)
    this.graceT = Math.max(0, this.graceT - dt)
    this.hurtT = Math.max(0, this.hurtT - dt)
    this.impactCd = Math.max(0, this.impactCd - dt)
    // 体力 0 → 暗転して戻る
    if (this.downT >= 0) {
      this.downT += dt
      this.fade.style.opacity = String(Math.min(1, this.downT / 0.6))
      if (this.downT >= 1.3) this.respawn()
    } else if (this.fade.style.opacity !== '' && this.fade.style.opacity !== '0') {
      this.fade.style.opacity = String(Math.max(0, Number(this.fade.style.opacity) - dt * 1.6))
    }
    // 連続攻撃
    for (const ev of this.combo.tick(dt)) this.onCombo(ev.kind, ev.kind === 'end' ? -1 : ev.step)
    if (this.combo.phase === 'active' && this.combo.lunge > 0 && !pl.bursting) {
      const near = this.nearestEnemy(1.0, 0.9)
      if (!near) pl.burstMove(-Math.sin(pl.facing) * this.combo.lunge, -Math.cos(pl.facing) * this.combo.lunge, (this.combo.current?.active ?? 0.1) * 0.9)
    }
    // はじく
    if (this.impactT > 0) {
      this.impactT -= dt
      if (!this.impactFired && this.impactT < 0.34) {
        this.impactFired = true
        this.fireImpact()
      }
    }
    for (const r of this.hitRings) {
      if (r.t < 0) continue
      r.t += dt
      const k = r.t / 0.22
      r.mesh.scale.setScalar(r.size * (0.3 + k * 1.1))
      r.mesh.quaternion.copy(this.host.camera?.quaternion ?? r.mesh.quaternion)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k)
      if (k >= 1) {
        r.t = -1
        r.mesh.visible = false
      }
    }
    if (this.ringT >= 0) {
      this.ringT += dt
      const k = this.ringT / 0.32
      this.ring.scale.setScalar(0.4 + k * 3.6)
      ;(this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k)
      if (k >= 1) {
        this.ringT = -1
        this.ring.visible = false
      }
    }
    // 敵
    const playerDown = this.downT >= 0 || this.health.dead
    for (const e of this.enemies) if (!e.removed) this.updateEnemy(e, dt, playerDown)
    for (let i = this.enemies.length - 1; i >= 0; i--) if (this.enemies[i].removed) this.enemies.splice(i, 1)
    this.updatePlates(dt)
    this.sparks.update(dt)
    hud.setHp(this.health.hp)
    if (this.bossBar?.e) {
      const b = this.bossBar
      const be = b.e as Enemy
      b.fill.style.transform = `scaleX(${Math.max(0, be.brain.hp / be.maxHp).toFixed(3)})`
      if (!be.alive && be.dyingT > 0.8) this.showBoss(null)
    }
  }

  /** 見た目だけ（一時停止中も呼ばれる。dt = 0） */
  animate(dt: number, t: number): void {
    const P = this.host.player.position
    for (const e of this.enemies) {
      if (e.removed || e.hidden) continue
      // 遠い敵は描かない（描画の回数を減らす）
      const far = e.pos.distanceToSquared(P) > FAR_HIDE * FAR_HIDE
      e.model.root.visible = !far
      if (far) continue
      const speed = Math.hypot(e.knock.x, e.knock.z) > 0.5 ? 0 : e.brain.state === 'chase' || e.brain.state === 'idle' ? (e.model.root.userData.speed ?? 0) : 0
      e.model.animate(dt, t + e.home.x, e.brain.state, e.brain.t, speed, e.dyingT >= 0 ? e.dyingT / 0.6 : 0, e.brain.stats.windup)
    }
  }

  // ---------------------------------------------------------------- 内部

  private onCombo(kind: 'swing' | 'hit' | 'end', step: number): void {
    const pl = this.host.player
    if (kind === 'swing') {
      // 近くの敵へ向き直る（ゆるい自動の狙い）
      const near = this.nearestEnemy(4, 1.5)
      const at = near ? near.pos : this.nearestHitTarget(4, 1.5)
      if (at) pl.facing = Math.atan2(-(at.x - pl.position.x), -(at.z - pl.position.z))
      return
    }
    if (kind !== 'hit') return
    const s = ATTACK_STEPS[step]
    const P = pl.position
    let hitAny = false
    for (const e of this.enemies) {
      if (!e.alive || e.hidden || e.removed) continue
      const r = e.brain.stats.radius * e.scale
      if (Math.abs(e.pos.y - P.y) > 1.4 + r) continue
      if (!inArc(P.x, P.z, pl.facing, e.pos.x, e.pos.z, s.range, s.halfArc, r)) continue
      const front = this.fromFront(e, P)
      const res = e.brain.hurt(s.damage, s.stagger, front)
      this.onEnemyHurt(e, res, s.knock * (e.brain.stats.mass === 'heavy' ? 0.25 : 1), step === 2 ? 0.07 : 0.04)
      hitAny = true
    }
    // 敵でない的（ボスの体の一部など）
    for (const t of this.hitTargets) {
      if (!t.enabled) continue
      if (Math.abs(t.pos.y - P.y) > 1.6 + t.radius) continue
      if (!inArc(P.x, P.z, pl.facing, t.pos.x, t.pos.z, s.range, s.halfArc, t.radius)) continue
      t.onHit(s.damage, step)
      this.sparks.burst(this.tmp.copy(t.pos), '#ff6fa8', step === 2 ? 14 : 8, 3)
      this.hitstop = Math.max(this.hitstop, step === 2 ? 0.07 : 0.04)
      hitAny = true
    }
    // 壊せる物：3 段目だけ
    if (step === 2) {
      for (const b of this.breakables) {
        if (!b.enabled) continue
        if (inArc(P.x, P.z, pl.facing, b.pos.x, b.pos.z, s.range + 0.4, s.halfArc, b.radius)) this.host.hud.toast('ひびが固い……はじくなら割れそう')
      }
    }
    if (hitAny) this.host.shake(step === 2 ? 0.22 : 0.1)
  }

  private fireImpact(): void {
    const pl = this.host.player
    const P = pl.position
    const fx = -Math.sin(pl.facing)
    const fz = -Math.cos(pl.facing)
    this.ring.position.set(P.x + fx * 1.2, P.y + 0.75, P.z + fz * 1.2)
    this.ring.lookAt(P.x + fx * 3, P.y + 0.75, P.z + fz * 3)
    this.ring.visible = true
    this.ringT = 0
    this.sparks.burst(this.tmp.set(P.x + fx * 1.0, P.y + 0.8, P.z + fz * 1.0), '#6fe8ff', 18, 5, 1.2)
    this.host.shake(0.3)
    pl.burstMove(-fx * 2.5, -fz * 2.5, 0.12)
    let hit = false
    for (const e of this.enemies) {
      if (!e.alive || e.hidden || e.removed) continue
      const r = e.brain.stats.radius * e.scale
      if (Math.abs(e.pos.y - P.y) > 2 + r) continue
      if (!inArc(P.x, P.z, pl.facing, e.pos.x, e.pos.z, 4.4, 0.85, r)) continue
      const hadShield = e.brain.shield
      const hadArmor = e.brain.armor
      const res = e.brain.hurt(2, e.brain.stats.mass === 'heavy' ? 1.6 : 1.0, this.fromFront(e, P), true)
      if (hadArmor && !e.brain.armor) {
        // 装甲が割れる
        this.sparks.burst(e.model.armorPoint(this.tmp2), '#ffd36a', 30, 6)
        e.model.setArmor(false)
        this.host.shake(0.45)
        this.host.hud.toast('装甲が割れた！ 今のうちに攻撃！', 2.4)
      }
      if (hadShield && e.model.shield) {
        // 盾は砕ける
        const s = e.model.shield
        this.sparks.burst(s.getWorldPosition(this.tmp2), '#ffb347', 16, 4)
        s.removeFromParent()
        e.model.shield = null
        e.def.label = e.brain.stats.name
      }
      this.onEnemyHurt(e, res, e.brain.stats.mass === 'heavy' ? 4 : 10, 0.08)
      hit = true
    }
    for (const b of this.breakables) {
      if (!b.enabled) continue
      if (Math.abs(b.pos.y - P.y) > 3 + b.radius) continue
      if (!inArc(P.x, P.z, pl.facing, b.pos.x, b.pos.z, 4.6, 1.0, b.radius)) continue
      b.enabled = false
      this.sparks.burst(b.pos, '#ffd36a', 26, 5)
      b.onBreak()
      hit = true
    }
    if (hit) this.hitstop = Math.max(this.hitstop, 0.08)
  }

  /** 手に持った板（体の前）と、投げた板（まっすぐ飛んで、敵に当たるか、壁・地面で落ちる） */
  private updatePlates(dt: number): void {
    const pl = this.host.player
    const P = pl.position
    const h = this.held
    if (h) {
      // 頭の上に持ち上げる（うしろのカメラからも見えるように）
      h.obj.position.set(P.x - Math.sin(pl.facing) * 0.2, P.y + 1.85 + Math.sin(this.clock * 6) * 0.04, P.z - Math.cos(pl.facing) * 0.2)
      h.obj.rotation.set(-0.35, pl.facing + Math.PI, 0)
    }
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i]
      const o = t.obj.position
      if (t.dropT >= 0) {
        t.dropT += dt
        o.y = Math.max(P.y - 0.4, o.y - dt * 3)
        t.obj.scale.setScalar(Math.max(0.01, 1 - t.dropT / 0.7))
        if (t.dropT > 0.7) {
          t.obj.removeFromParent()
          this.thrown.splice(i, 1)
        }
        continue
      }
      t.t += dt
      t.vel.y -= 5 * dt
      const step = t.vel.length() * dt
      this.tmp.copy(t.vel).normalize()
      const wall = this.host.phys.raycast(o, this.tmp, step + 0.2, pl.collider, true)
      o.addScaledVector(t.vel, dt)
      t.obj.rotation.x += dt * 14
      // 敵に当たったか
      let hit: Enemy | null = null
      for (const e of this.enemies) {
        if (!e.alive || e.hidden || e.removed) continue
        const r = e.brain.stats.radius * e.scale + 0.45
        const cy = e.pos.y + e.model.chestY * e.scale
        if (Math.hypot(o.x - e.pos.x, o.z - e.pos.z) < r && o.y > e.pos.y - 0.2 && o.y < cy + 1.2 * e.scale) {
          hit = e
          break
        }
      }
      if (hit) {
        const res = hit.brain.hurtThrough(t.damage, 2.4)
        this.onEnemyHurt(hit, res, 3, 0.12)
        this.sparks.burst(this.tmp.copy(o), '#ffd36a', 26, 6)
        this.host.shake(0.4)
        hit.onPlateHit?.()
        t.obj.removeFromParent()
        this.thrown.splice(i, 1)
        continue
      }
      if (wall !== null || t.t > 1.4 || o.y < P.y - 3) {
        this.sparks.burst(this.tmp.copy(o), '#ffb347', 8, 2.5)
        t.dropT = 0
      }
    }
  }

  private onEnemyHurt(e: Enemy, res: 'blocked' | 'hurt' | 'killed', knock: number, stop: number): void {
    const P = this.host.player.position
    const chest = this.tmp2.copy(e.pos).setY(e.pos.y + e.model.chestY * e.scale)
    this.tmp.subVectors(e.pos, P).setY(0)
    if (this.tmp.lengthSq() < 1e-4) this.tmp.set(0, 0, -1)
    this.tmp.normalize()
    if (res === 'blocked') {
      this.sparks.burst(chest, '#9fd8ff', 6, 2.5)
      if (e.brain.armor && this.armorHintAt + 6 < this.clock) {
        this.armorHintAt = this.clock
        this.host.hud.toast(e.plates ? 'よろいが硬い……クローで 1 枚ずつはがそう' : '装甲が硬い……はじくNMClaw で割ろう', 2.4)
      }
      e.knock.addScaledVector(this.tmp, 2.5)
      // 盾で弾かれて、こちらも少し下がる
      this.host.player.burstMove(-this.tmp.x * 2.5, -this.tmp.z * 2.5, 0.1)
      this.combo.cancel()
      return
    }
    e.model.hit()
    this.popHitRing(chest, stop >= 0.07 ? 0.9 : 0.6)
    e.knock.addScaledVector(this.tmp, knock)
    this.sparks.burst(chest, res === 'killed' ? '#c77dff' : '#ff6fa8', res === 'killed' ? 22 : 9, res === 'killed' ? 5 : 3)
    this.hitstop = Math.max(this.hitstop, stop)
    if (res === 'killed') {
      e.dyingT = 0
      e.def.enabled = false
      e.yank = null
    }
  }

  /** 当たった所に白い輪を出す（いちばん古い輪を使い回す） */
  private popHitRing(at: THREE.Vector3, size: number): void {
    let r = this.hitRings.find((x) => x.t < 0)
    if (!r) r = this.hitRings.reduce((a, b) => (a.t > b.t ? a : b))
    r.t = 0
    r.size = size
    r.mesh.position.copy(at)
    r.mesh.visible = true
  }

  /** 敵の正面から当たったか（盾で防げる向き） */
  private fromFront(e: Enemy, from: THREE.Vector3): boolean {
    return Math.abs(angleTo(e.yaw, from.x - e.pos.x, from.z - e.pos.z)) < 1.2
  }

  private nearestEnemy(maxDist: number, maxAngle: number): Enemy | null {
    const pl = this.host.player
    let best: Enemy | null = null
    let bd = Infinity
    for (const e of this.enemies) {
      if (!e.alive || e.hidden || e.removed) continue
      const dx = e.pos.x - pl.position.x
      const dz = e.pos.z - pl.position.z
      const d = Math.hypot(dx, dz) - e.brain.stats.radius * e.scale
      if (d > maxDist || Math.abs(e.pos.y - pl.position.y) > 1.6) continue
      if (Math.abs(angleTo(pl.facing, dx, dz)) > maxAngle) continue
      if (d < bd) {
        bd = d
        best = e
      }
    }
    return best
  }

  /** 近くの敵でない的（ボスの体の一部など）の位置 */
  private nearestHitTarget(maxDist: number, maxAngle: number): THREE.Vector3 | null {
    const pl = this.host.player
    let best: THREE.Vector3 | null = null
    let bd = Infinity
    for (const t of this.hitTargets) {
      if (!t.enabled) continue
      const dx = t.pos.x - pl.position.x
      const dz = t.pos.z - pl.position.z
      const d = Math.hypot(dx, dz) - t.radius
      if (d > maxDist || Math.abs(t.pos.y - pl.position.y) > 1.6 + t.radius) continue
      if (Math.abs(angleTo(pl.facing, dx, dz)) > maxAngle) continue
      if (d < bd) {
        bd = d
        best = t.pos
      }
    }
    return best
  }

  private updateEnemy(e: Enemy, dt: number, playerDown: boolean): void {
    const pl = this.host.player
    const P = pl.position
    const st = e.brain.stats
    const r = st.radius * e.scale
    if (e.hidden) return
    // 倒れていく
    if (e.dyingT >= 0) {
      e.dyingT += dt
      e.pos.addScaledVector(e.knock, dt)
      e.knock.multiplyScalar(Math.exp(-5 * dt))
      if (e.dyingT > 0.6 && !e.removed) {
        e.removed = true
        this.sparks.burst(this.tmp.copy(e.pos).setY(e.pos.y + 0.4), '#7a3cff', 12, 3)
        e.model.root.removeFromParent()
        e.model.dispose()
        const i = this.host.claw.targets.indexOf(e.def)
        if (i >= 0) this.host.claw.targets.splice(i, 1)
        this.byDef.delete(e.def)
        if (e.shieldFly) e.shieldFly.obj.removeFromParent()
        this.onEnemyDefeated?.(e)
      }
      return
    }
    if (e.looseT > 0) e.looseT = Math.max(0, e.looseT - dt)
    // 装甲が戻った（よろいの板の敵は板が見た目）
    if (e.brain.armored && !e.plates && e.brain.armor !== e.model.armorShown) {
      e.model.setArmor(e.brain.armor)
      if (e.brain.armor) this.sparks.burst(e.model.armorPoint(this.tmp), '#b04cff', 16, 3)
    }
    const dx = P.x - e.pos.x
    const dz = P.z - e.pos.z
    const dist = Math.hypot(dx, dz)
    if (dist > FAR_HIDE && e.brain.state === 'idle' && !e.yank && e.knock.lengthSq() < 1e-4) return
    const leashed = e.pos.distanceTo(e.home) < e.leash
    const out = e.brain.update(dt, { dist: Math.abs(P.y - e.pos.y) > 3 ? 99 : dist, leashed, passive: !this.enabled || this.passive || playerDown || this.graceT > 0 })
    if (e.brain.state === 'windup' && e.brain.t <= dt + 1e-6) e.struck = false
    if (out.face && dist > 0.05) this.turn(e, dx, dz, dt, st.mass === 'heavy' ? 4 : 9)
    // 動き
    let vx = 0
    let vz = 0
    if (e.yank) {
      // クローで手元へ：ワイヤーの進み具合に合わせて、プレイヤーの前へ
      const w = this.host.claw.wire
      const u = w.phase === 'reeling' ? w.progress : 1
      e.yank.to.set(P.x - Math.sin(pl.facing) * 1.15, P.y, P.z - Math.cos(pl.facing) * 1.15)
      e.pos.lerpVectors(e.yank.from, e.yank.to, u * u * (3 - 2 * u))
      e.pos.y += Math.sin(Math.PI * u) * 0.8
      this.turn(e, dx, dz, dt, 20)
    } else {
      switch (out.move) {
        case 'toward':
          vx = (dx / Math.max(dist, 1e-3)) * st.speed
          vz = (dz / Math.max(dist, 1e-3)) * st.speed
          break
        case 'home': {
          const hx = e.home.x - e.pos.x
          const hz = e.home.z - e.pos.z
          const hd = Math.hypot(hx, hz)
          if (hd > 0.4) {
            vx = (hx / hd) * st.speed * 0.8
            vz = (hz / hd) * st.speed * 0.8
            this.turn(e, hx, hz, dt, 6)
          } else this.turn(e, -Math.sin(e.homeYaw), -Math.cos(e.homeYaw), dt, 3)
          break
        }
        case 'leap':
          if (e.brain.t < 0.22) {
            vx = -Math.sin(e.yaw) * st.leap
            vz = -Math.cos(e.yaw) * st.leap
          }
          break
      }
      // 押し出された分
      vx += e.knock.x
      vz += e.knock.z
      e.knock.multiplyScalar(Math.exp(-7 * dt))
      // 壁：進む向きにレイを飛ばして、当たるなら止まる
      const sp = Math.hypot(vx, vz)
      if (sp > 1e-3) {
        this.tmp.set(e.pos.x, e.pos.y + Math.min(0.6, st.height * 0.5), e.pos.z)
        this.tmp2.set(vx / sp, 0, vz / sp)
        const hit = this.host.phys.raycast(this.tmp, this.tmp2, sp * dt + r, pl.collider)
        if (hit === null) {
          e.pos.x += vx * dt
          e.pos.z += vz * dt
        } else {
          e.knock.set(0, 0, 0)
        }
      }
      e.model.root.userData.speed = sp
      // 地面に沿う（足元の少し上から下へ）
      this.tmp.set(e.pos.x, e.pos.y + 1.2, e.pos.z)
      const g = this.host.phys.raycast(this.tmp, this.down, 4, pl.collider)
      if (g !== null) {
        const gy = this.tmp.y - g
        e.pos.y += (gy - e.pos.y) * Math.min(1, dt * 14)
      }
      // プレイヤーと重ならない
      if (dist < r + PLAYER_R && dist > 1e-3 && Math.abs(P.y - e.pos.y) < 1.5) {
        const push = r + PLAYER_R - dist
        e.pos.x -= (dx / dist) * push
        e.pos.z -= (dz / dist) * push
      }
    }
    // 攻撃が当たるか（攻撃の間に 1 回だけ）
    if (e.brain.state === 'attack' && !e.struck && !playerDown) {
      const reach = st.hitRange * e.scale
      if (Math.abs(P.y - e.pos.y) < 1.4 * e.scale && inArc(e.pos.x, e.pos.z, e.yaw, P.x, P.z, reach, st.hitArc, PLAYER_R)) {
        e.struck = true
        this.hurtPlayer(st.damage, this.tmp.set(dx, 0, dz).normalize(), st.knock)
      }
      if (st.mass === 'heavy' && e.brain.t < dt * 1.5) {
        // 叩きつけの衝撃
        this.host.shake(0.25)
        this.sparks.burst(this.tmp2.set(e.pos.x - Math.sin(e.yaw) * 1.6, e.pos.y + 0.1, e.pos.z - Math.cos(e.yaw) * 1.6), '#b04cff', 14, 4, 1.5)
      }
    }
    // 盾が手元へ飛んでくる
    const sf = e.shieldFly
    if (sf) {
      if (sf.dropT < 0) {
        const w = this.host.claw.wire
        const u = w.phase === 'reeling' ? w.progress : 1
        this.tmp.set(P.x - Math.sin(pl.facing) * 0.9, P.y + 0.8, P.z - Math.cos(pl.facing) * 0.9)
        sf.obj.position.lerpVectors(sf.from, this.tmp, u)
        sf.obj.rotation.y += dt * 8
        e.def.point.copy(sf.obj.position)
      } else {
        sf.dropT += dt
        sf.obj.position.y = Math.max(P.y + 0.05, sf.obj.position.y - dt * 4)
        sf.obj.scale.setScalar(Math.max(0.01, 1 - sf.dropT / 0.8))
        if (sf.dropT > 0.8) {
          sf.obj.removeFromParent()
          e.shieldFly = null
        }
      }
    }
    // クローの接続点・飛び込みの着地点
    if (!sf || sf.dropT >= 0) e.def.point.set(e.pos.x, e.pos.y + e.model.chestY * e.scale, e.pos.z)
    if (e.def.type === 'enemy_zip') {
      const len = Math.max(dist, 1e-3)
      e.def.landing?.set(e.pos.x + (dx / len) * (r + 0.7), e.pos.y, e.pos.z + (dz / len) * (r + 0.7))
    }
  }

  private turn(e: Enemy, dx: number, dz: number, dt: number, rate: number): void {
    const d = angleTo(e.yaw, dx, dz)
    e.yaw = e.yaw + d * Math.min(1, rate * dt)
  }

  /**
   * プレイヤーが攻撃を受けた（無敵時間・回避・体力 0 の暗転までまとめて）。敵でないボスの攻撃からも呼べる。
   * lethal = false なら最後の 1 は残す（台本の場面の中で倒れてやり直しにならないように）
   */
  hurtPlayer(damage: number, dir: THREE.Vector3, knock: number, lethal = true): void {
    if (this.dodgeState.invulnerable || this.health.invuln > 0) return
    const n = lethal ? damage : Math.min(damage, this.health.hp - 1)
    let res: DamageResult = 'hit'
    if (n <= 0) {
      // 残り 1：へらさず、当たった手応え（吹っ飛び）と無敵時間だけ
      this.health.invuln = COMBAT_TUNING.invulnSec
    } else {
      res = this.health.damage(n)
      if (res === 'ignored') return
    }
    this.combo.cancel()
    this.knockPlayer(dir, knock)
    if (res === 'dead') {
      this.downT = 0
      this.host.claw.reset()
      this.host.hud.banner('やられた……', 'fail', 1.4)
    }
  }

  /**
   * 当たった手応え：当てた物の方を向いてのけぞり、少しはね上がって、うしろへ飛ばされる（はっきり見えるように）。
   * dir は当てた物からネクマックスへの向き、knock は横の速さ（小さくても、軽く吹っ飛ぶくらいは出す）
   */
  private knockPlayer(dir: THREE.Vector3, knock: number): void {
    const pl = this.host.player
    this.hurtT = HURT_POSE_SEC
    const len = Math.hypot(dir.x, dir.z)
    if (!pl.isExternal) {
      if (len > 1e-3) {
        const dx = dir.x / len
        const dz = dir.z / len
        const sp = Math.max(knock, HURT_MIN_KNOCK)
        pl.facing = Math.atan2(dx, dz)
        pl.burstMove(dx * sp, dz * sp, 0.26)
      }
      if (pl.grounded) pl.velocity.y = Math.max(pl.velocity.y, HURT_HOP)
    }
    this.hitstop = Math.max(this.hitstop, 0.06)
    this.host.hud.flash('danger')
    this.host.shake(0.4)
    // 白い輪は出さない（のけぞる姿がかくれる）。赤い火花だけ
    this.sparks.burst(this.tmp2.copy(pl.position).setY(pl.position.y + 0.75), '#ff4f6a', 16, 4)
  }

  private respawn(): void {
    const pl = this.host.player
    this.downT = -1
    this.health.refill()
    this.combo.cancel()
    this.dropPlates()
    pl.teleport(this.checkpoint ?? this.start, this.checkpoint ? this.checkpointYaw : undefined)
    // 敵は住みかへ戻って元どおり
    for (const e of this.enemies) {
      if (!e.alive || e.removed) continue
      e.pos.copy(e.home)
      e.yaw = e.homeYaw
      e.knock.set(0, 0, 0)
      e.yank = null
      if (!e.keepHp) e.brain.hp = e.maxHp
      e.brain.state = 'idle'
      e.brain.t = 0
      if (e.brain.armored) e.brain.setArmored(true)
    }
    // 戻ってすぐは襲わない（子どもが立て直せるように）
    this.graceT = RESPAWN_GRACE
    this.onRespawn?.()
  }

  dispose(): void {
    this.dropPlates()
    this.showBoss(null)
    this.fade.remove()
    for (const e of this.enemies) {
      e.model.dispose()
      const i = this.host.claw.targets.indexOf(e.def)
      if (i >= 0) this.host.claw.targets.splice(i, 1)
    }
    this.enemies.length = 0
    this.byDef.clear()
    this.sparks.dispose()
    this.ring.geometry.dispose()
    ;(this.ring.material as THREE.Material).dispose()
    this.hitRings[0]?.mesh.geometry.dispose()
    for (const r of this.hitRings) (r.mesh.material as THREE.Material).dispose()
    this.group.removeFromParent()
  }
}
