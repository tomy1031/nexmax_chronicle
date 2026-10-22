// 戦闘の純粋なロジック（docs/中盤シナリオとワールド構成_v1.md §4.1）。three.js・DOM には依存しない。
// ・体力（ハート 5 つ）と、当たったあとの無敵時間
// ・K の 3 段の連続攻撃（溜め → 当たり → 戻り。戻りの間に K を押すと次の段へ）
// ・Shift の回避（押した瞬間に短く滑る。避けている間は当たらない）
// ・前方の扇の中にいるかの当たり判定
// ・敵（欠け）の行動：待機 → 追う → 溜め → 攻撃 → 戻り、よろけ・気絶・倒れる
// 向きは PlayerController と同じ：facing の前 = (-sin f, -cos f)

export const COMBAT_TUNING = {
  hpMax: 5,
  /** 当たったあとの無敵時間（秒） */
  invulnSec: 1.1,
  /** 次の段を受け付ける時間（戻りの間。秒） */
  comboBuffer: 0.32,
  /** 回避 */
  dodge: { sec: 0.3, speed: 11.5, iframes: 0.28, cooldown: 0.5 },
  /** 装甲が割れてから戻るまで（秒）と、割れた直後の気絶（秒） */
  armorDownSec: 7,
  armorStunSec: 2.4,
} as const

export type AttackStep = {
  /** 溜め・当たり・戻り（秒） */
  windup: number
  active: number
  recover: number
  /** 届く距離（m、体の中心から）と扇の半分の角度（rad） */
  range: number
  halfArc: number
  damage: number
  /** 踏み込みの速さ（m/s、当たりの間） */
  lunge: number
  /** 敵を押し出す速さ（m/s） */
  knock: number
  /** 敵がよろける時間（秒） */
  stagger: number
  /** 右手か左手か（ポーズ用） */
  hand: 'r' | 'l'
}

export const ATTACK_STEPS: readonly AttackStep[] = [
  { windup: 0.07, active: 0.1, recover: 0.2, range: 1.75, halfArc: 1.05, damage: 1, lunge: 2.4, knock: 3.0, stagger: 0.35, hand: 'r' },
  { windup: 0.07, active: 0.1, recover: 0.22, range: 1.75, halfArc: 1.05, damage: 1, lunge: 2.6, knock: 3.0, stagger: 0.35, hand: 'l' },
  // 3 段目は大きく踏み込んで吹き飛ばす
  { windup: 0.12, active: 0.13, recover: 0.36, range: 2.1, halfArc: 1.2, damage: 2, lunge: 5.2, knock: 8.5, stagger: 0.7, hand: 'r' },
]

// ------------------------------------------------------------------ 体力

export type DamageResult = 'ignored' | 'hit' | 'dead'

export class PlayerHealth {
  readonly max: number
  hp: number
  /** 無敵の残り（秒） */
  invuln = 0

  constructor(max = COMBAT_TUNING.hpMax) {
    this.max = max
    this.hp = max
  }

  get dead(): boolean {
    return this.hp <= 0
  }

  /** 当たった。無敵の間・倒れている間は受けない */
  damage(n: number): DamageResult {
    if (this.invuln > 0 || this.hp <= 0 || n <= 0) return 'ignored'
    this.hp = Math.max(0, this.hp - n)
    this.invuln = COMBAT_TUNING.invulnSec
    return this.hp <= 0 ? 'dead' : 'hit'
  }

  heal(n: number): void {
    if (this.hp <= 0) return
    this.hp = Math.min(this.max, this.hp + n)
  }

  refill(): void {
    this.hp = this.max
    this.invuln = 0
  }

  tick(dt: number): void {
    this.invuln = Math.max(0, this.invuln - dt)
  }
}

// ------------------------------------------------------------------ 連続攻撃

export type ComboPhase = 'idle' | 'windup' | 'active' | 'recover'
export type ComboEvent = { kind: 'swing'; step: number } | { kind: 'hit'; step: number } | { kind: 'end' }

export class AttackCombo {
  step = -1
  phase: ComboPhase = 'idle'
  t = 0
  private queued = false
  private readonly steps: readonly AttackStep[]

  constructor(steps: readonly AttackStep[] = ATTACK_STEPS) {
    this.steps = steps
  }

  get current(): AttackStep | null {
    return this.step >= 0 ? this.steps[this.step] : null
  }

  get busy(): boolean {
    return this.phase !== 'idle'
  }

  /** 踏み込みの速さ（当たりの間だけ） */
  get lunge(): number {
    const s = this.current
    return s && this.phase === 'active' ? s.lunge : 0
  }

  /** K。待機中なら 1 段目、溜め・当たり・戻りの間は次の段を予約 */
  press(): ComboEvent[] {
    if (this.phase === 'idle') return this.begin(0)
    if (this.step < this.steps.length - 1) this.queued = true
    return []
  }

  /** 回避・被弾で打ち切る */
  cancel(): void {
    this.phase = 'idle'
    this.step = -1
    this.t = 0
    this.queued = false
  }

  tick(dt: number): ComboEvent[] {
    const s = this.current
    if (!s || this.phase === 'idle') return []
    this.t += dt
    const out: ComboEvent[] = []
    if (this.phase === 'windup' && this.t >= s.windup) {
      this.phase = 'active'
      this.t -= s.windup
      out.push({ kind: 'hit', step: this.step })
    }
    if (this.phase === 'active' && this.t >= s.active) {
      this.phase = 'recover'
      this.t -= s.active
    }
    if (this.phase === 'recover') {
      // 戻りの前半で次の段の予約があれば、すぐ次へ
      if (this.queued && this.step < this.steps.length - 1 && this.t >= Math.min(0.06, s.recover)) {
        out.push(...this.begin(this.step + 1))
      } else if (this.t >= s.recover) {
        // 戻りの終わりでも、受付時間のうちに押されていれば次へ
        if (this.queued && this.step < this.steps.length - 1) out.push(...this.begin(this.step + 1))
        else {
          this.cancel()
          out.push({ kind: 'end' })
        }
      }
    }
    return out
  }

  private begin(step: number): ComboEvent[] {
    this.step = step
    this.phase = 'windup'
    this.t = 0
    this.queued = false
    return [{ kind: 'swing', step }]
  }
}

// ------------------------------------------------------------------ 回避

export class Dodge {
  t = 0
  cooldown = 0
  /** 回避の向き（x, z。長さ 1） */
  dirX = 0
  dirZ = 0

  get active(): boolean {
    return this.t > 0
  }

  /** 避けている間は当たらない（始めの iframes 秒） */
  get invulnerable(): boolean {
    return this.t > COMBAT_TUNING.dodge.sec - COMBAT_TUNING.dodge.iframes
  }

  /** Shift を押した瞬間。dx, dz は入力の向き（無ければ後ろへ）。始められたら true */
  press(dx: number, dz: number, facing: number): boolean {
    if (this.t > 0 || this.cooldown > 0) return false
    let x = dx
    let z = dz
    const len = Math.hypot(x, z)
    if (len < 0.2) {
      // 入力が無ければ後ろへ下がる
      x = Math.sin(facing)
      z = Math.cos(facing)
    } else {
      x /= len
      z /= len
    }
    this.dirX = x
    this.dirZ = z
    this.t = COMBAT_TUNING.dodge.sec
    this.cooldown = COMBAT_TUNING.dodge.sec + COMBAT_TUNING.dodge.cooldown
    return true
  }

  tick(dt: number): void {
    this.t = Math.max(0, this.t - dt)
    this.cooldown = Math.max(0, this.cooldown - dt)
  }
}

// ------------------------------------------------------------------ 当たり判定

/** (ax, az) から facing の向きの扇（半径 range、半角 halfArc）に (bx, bz) が入るか。r は相手の大きさ */
export function inArc(ax: number, az: number, facing: number, bx: number, bz: number, range: number, halfArc: number, r = 0): boolean {
  const dx = bx - ax
  const dz = bz - az
  const d = Math.hypot(dx, dz)
  if (d > range + r) return false
  if (d < 0.35 + r) return true
  const fx = -Math.sin(facing)
  const fz = -Math.cos(facing)
  const cos = (dx * fx + dz * fz) / d
  // 相手の大きさの分だけ角度をゆるめる
  const slack = Math.atan2(r, d)
  return cos >= Math.cos(Math.min(Math.PI, halfArc + slack))
}

/** facing から見た (dx, dz) の向きの角度差（-π〜π） */
export function angleTo(facing: number, dx: number, dz: number): number {
  const want = Math.atan2(-dx, -dz)
  let d = want - facing
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

// ------------------------------------------------------------------ 敵の行動

export type EnemyKind = 'mite' | 'shield' | 'brute'

export type EnemyStats = {
  name: string
  hp: number
  /** 歩く速さ（m/s） */
  speed: number
  /** 気づく距離・あきらめる距離（m） */
  sight: number
  lose: number
  /** 攻撃を始める距離（m） */
  reach: number
  windup: number
  active: number
  recover: number
  damage: number
  /** プレイヤーを押し出す速さ（m/s） */
  knock: number
  /** 攻撃の届く距離と扇（溜めの終わりの位置から） */
  hitRange: number
  hitArc: number
  /** 攻撃のときに前へ跳ぶ速さ（m/s。欠け虫の体当たり） */
  leap: number
  /** 体の半径・高さ（m） */
  radius: number
  height: number
  /** クローでの扱い：light＝引き寄せる、heavy＝自分が飛び込む */
  mass: 'light' | 'heavy'
  /** 正面からの攻撃を防ぐ（盾がある間） */
  guards: boolean
}

export const ENEMY_STATS: Readonly<Record<EnemyKind, EnemyStats>> = {
  // 欠け虫：小さく素早い。跳びかかって体当たり。クローで引き寄せると気絶
  mite: { name: '欠け虫', hp: 2, speed: 3.6, sight: 11, lose: 18, reach: 2.4, windup: 1.2, active: 0.32, recover: 0.6, damage: 1, knock: 5, hitRange: 1.0, hitArc: 1.2, leap: 6.5, radius: 0.38, height: 0.55, mass: 'light', guards: false },
  // 欠け盾：盾で正面を守る。クローで盾をはがすと無防備
  shield: { name: '欠け盾', hp: 4, speed: 2.3, sight: 12, lose: 18, reach: 1.9, windup: 1.2, active: 0.2, recover: 0.7, damage: 1, knock: 6, hitRange: 2.0, hitArc: 0.9, leap: 1.5, radius: 0.5, height: 1.55, mass: 'light', guards: true },
  // 欠け重：大きく硬い。溜めの長い叩きつけ。はじくでよろけ、クローで飛び込んで蹴る
  brute: { name: '欠け重', hp: 9, speed: 1.7, sight: 13, lose: 20, reach: 2.6, windup: 1.3, active: 0.24, recover: 1.1, damage: 1, knock: 9, hitRange: 3.0, hitArc: 1.3, leap: 0, radius: 0.85, height: 2.3, mass: 'heavy', guards: false },
}

export type BrainState = 'idle' | 'chase' | 'windup' | 'attack' | 'recover' | 'stagger' | 'stunned' | 'dead'

export type BrainInput = {
  /** プレイヤーまでの水平距離（m） */
  dist: number
  /** 住みか（出てきた場所）から離れすぎていないか */
  leashed: boolean
  /** プレイヤーがやられている・演出中など、襲わないとき */
  passive: boolean
}

export type BrainOutput = {
  /** none：止まる／toward：プレイヤーへ／home：住みかへ戻る／leap：攻撃の跳びかかり */
  move: 'none' | 'toward' | 'home' | 'leap'
  /** この瞬間に攻撃が当たる（attack に入ったフレームだけ true） */
  strike: boolean
  /** プレイヤーの方を向くか */
  face: boolean
}

export class EnemyBrain {
  readonly kind: EnemyKind
  readonly stats: EnemyStats
  state: BrainState = 'idle'
  t = 0
  hp: number
  /** 盾が残っているか（欠け盾） */
  shield: boolean
  /** 装甲を持つ（錨の番人など）。armor：いま装甲がある（はじくで割れるまで攻撃が通らない。割れてもしばらくで戻る） */
  armored = false
  armor = false
  /** 装甲が戻るまで（秒） */
  armorDown = 0
  /** よろけ・気絶の残り（秒） */
  private hold = 0
  /** 次に攻撃できるまで（秒。群れで一斉に襲わないよう、出てくるときに少しずらす） */
  cooldown: number

  constructor(kind: EnemyKind, seed = 0, override?: Partial<EnemyStats>) {
    this.kind = kind
    this.stats = override ? { ...ENEMY_STATS[kind], ...override } : ENEMY_STATS[kind]
    this.hp = this.stats.hp
    this.shield = this.stats.guards
    this.cooldown = 0.4 + (seed % 7) * 0.13
  }

  get alive(): boolean {
    return this.state !== 'dead'
  }

  /** 気絶・よろけていて反撃しない */
  get helpless(): boolean {
    return this.state === 'stagger' || this.state === 'stunned'
  }

  /** 気づいて襲ってきている（戦闘中の判定に使う） */
  get engaged(): boolean {
    return this.state === 'chase' || this.state === 'windup' || this.state === 'attack' || this.state === 'recover'
  }

  /**
   * 攻撃を受けた。fromFront：正面から（盾で防げる）。armorBreak：はじくの衝撃（盾ごと吹き飛ばす）。
   * 戻り値：blocked（盾で防いだ）／hurt／killed
   */
  hurt(damage: number, stagger: number, fromFront: boolean, armorBreak = false): 'blocked' | 'hurt' | 'killed' {
    if (this.state === 'dead') return 'blocked'
    if (this.armor) {
      if (!armorBreak) return 'blocked'
      // 装甲が割れて、しばらく無防備になる（割った一撃は小さめ）
      this.armor = false
      this.armorDown = COMBAT_TUNING.armorDownSec
      if (this.hp > 1) {
        this.hp -= 1
        this.setHold('stunned', COMBAT_TUNING.armorStunSec)
        return 'hurt'
      }
      damage = 1
    }
    if (this.shield && armorBreak) this.shield = false
    else if (this.shield && fromFront && !this.helpless) {
      // 盾で受けて、少し下がる
      this.setHold('stagger', 0.18)
      return 'blocked'
    }
    this.hp -= damage
    if (this.hp <= 0) {
      this.hp = 0
      this.state = 'dead'
      this.t = 0
      return 'killed'
    }
    this.setHold('stagger', stagger)
    return 'hurt'
  }

  /** 投げた物（はがしたよろいの板など）が当たった：装甲・盾に関係なく通り、しばらく動けない */
  hurtThrough(damage: number, stunSec: number): 'blocked' | 'hurt' | 'killed' {
    if (this.state === 'dead') return 'blocked'
    this.hp -= damage
    if (this.hp <= 0) {
      this.hp = 0
      this.state = 'dead'
      this.t = 0
      return 'killed'
    }
    this.setHold('stunned', stunSec)
    return 'hurt'
  }

  /** クローで引き寄せられた・飛び込まれた：しばらく動けない */
  stun(sec: number): void {
    if (this.state === 'dead') return
    this.setHold('stunned', sec)
  }

  /** 装甲を付ける・外す（付けると最初から装甲がある） */
  setArmored(on: boolean): void {
    this.armored = on
    this.armor = on
    this.armorDown = 0
  }

  /** 盾をはがされた */
  dropShield(): void {
    this.shield = false
    this.stun(1.1)
  }

  private setHold(s: 'stagger' | 'stunned', sec: number): void {
    // 長い方を残す（気絶中の追い打ちで短くならない）
    if ((this.state === 'stagger' || this.state === 'stunned') && this.hold > sec) return
    this.state = s
    this.hold = sec
    this.t = 0
  }

  update(dt: number, i: BrainInput): BrainOutput {
    const s = this.stats
    this.t += dt
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.armored && !this.armor && this.state !== 'dead') {
      this.armorDown -= dt
      if (this.armorDown <= 0) this.armor = true
    }
    const out: BrainOutput = { move: 'none', strike: false, face: false }
    switch (this.state) {
      case 'dead':
        return out
      case 'stagger':
      case 'stunned':
        this.hold -= dt
        if (this.hold <= 0) {
          this.state = 'chase'
          this.t = 0
          this.cooldown = Math.max(this.cooldown, 0.3)
        }
        return out
      case 'idle':
        if (!i.passive && i.dist < s.sight) {
          this.state = 'chase'
          this.t = 0
        }
        return { ...out, move: i.leashed ? 'none' : 'home' }
      case 'chase':
        if (i.passive || i.dist > s.lose || !i.leashed) {
          this.state = 'idle'
          this.t = 0
          return { ...out, move: 'home' }
        }
        if (i.dist <= s.reach && this.cooldown <= 0) {
          this.state = 'windup'
          this.t = 0
          return { ...out, face: true }
        }
        return { ...out, move: i.dist > s.reach * 0.75 ? 'toward' : 'none', face: true }
      case 'windup':
        // 溜めの間はプレイヤーの方を向き続ける（最後の 0.15 秒は向きを固定して、避けられるようにする）
        if (this.t >= s.windup) {
          this.state = 'attack'
          this.t = 0
          return { ...out, strike: true, move: s.leap > 0 ? 'leap' : 'none' }
        }
        return { ...out, face: this.t < s.windup - 0.15 }
      case 'attack':
        if (this.t >= s.active) {
          this.state = 'recover'
          this.t = 0
        }
        return { ...out, move: s.leap > 0 ? 'leap' : 'none' }
      case 'recover':
        if (this.t >= s.recover) {
          this.state = 'chase'
          this.t = 0
          this.cooldown = 0.5
        }
        return out
    }
  }
}
