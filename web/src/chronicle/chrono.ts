// 時空裂きのNMクロー（物語 v7 の 10 章から。docs/ステージ設計_v1.md §1・§8.4）。シェルがステージごとに 1 つ作り、rt.chrono で渡す。
// ・止める（freeze）：動いている物に J。爪の先が物を少しだけ裏側（時が流れない所）にさしこみ、数秒その物の時間が止まる。一度に 1 つ
// ・裂く（seam）：空中のゆらぎに J。裏側への切れ目がひらく
// ・裂く（ura）：裏側にしかない物（黒い手・オルムのすじ・トワのランプの糸）に J。まだ時空裂きを持っていないと、すりぬける
// 照準はクローと同じ（ClawTargetDef の chrono_* 型として claw.targets に並べる）。ワイヤーは撃たず、その場に効く。
// 見た目（止めた物の時計の輪・裂いた光の線・すりぬけの波紋・空中の切れ目）は chronicle/visuals の部品（FreezeFx・SlashFx・
// RippleFx・SlitFx）を使い、dispose() で解放する。
import * as THREE from 'three'
import type { ClawSystem } from '../player/clawSystem'
import type { ClawTargetDef, ClawTargetType } from '../player/clawLogic'
import { FreezeFx, RippleFx, SlashFx } from './visuals/chronoFx'
import { SlitFx, type Slit as SlitView } from './visuals/slit'

export type ChronoKind = 'freeze' | 'seam' | 'ura'

export type ChronoTarget = {
  id: string
  kind: ChronoKind
  /** 照準に出す名前（「回る歯車」「黒い手」など） */
  label: string
  /** 狙う点（毎フレーム読む。ステージが動かしてよい） */
  point: THREE.Vector3
  radius: number
  enabled: boolean
  /** freeze：止める秒数（既定 4） */
  seconds?: number
  /** 射程の上書き（m。既定はクローと同じ 10） */
  range?: number
  /** 遮蔽を調べない（空の大きな物など） */
  noLineOfSight?: boolean
  /** いま効かせてよいか（動いていない物を止めて「止める」をむだにしないように。省略でいつでも） */
  canAct?(): boolean
  /** 時空裂きのクローで J（freeze：止まった／seam：切れ目がひらく／ura：裂いた） */
  onAct(): void
  /** freeze：時間が戻った */
  onThaw?(): void
  /** ura：まだ時空裂きを持っていないときに J（すりぬけた） */
  onPassThrough?(): void
}

export type SlitOptions = {
  /** 切れ目の面の向き（省略でカメラの方を向く） */
  normal?: THREE.Vector3
  width?: number
  height?: number
  /** 自動で閉じるまでの秒数（省略で開いたまま。close() で閉じる） */
  seconds?: number
  /** ura：白青のふち（裏側への切れ目）／dawn：金色のふち（夜明けの光の扉） */
  tone?: 'ura' | 'dawn'
}

export type SlitHandle = {
  readonly object: THREE.Object3D
  /** 開き具合（0〜1。ゆっくり近づく） */
  setOpen(k: number): void
  close(): void
  readonly closed: boolean
}

export type ChronoHost = {
  claw: ClawSystem
  toast(text: string, seconds?: number): void
  shake(amount: number): void
}

const KIND_TYPE: Record<ChronoKind, ClawTargetType> = { freeze: 'chrono_freeze', seam: 'chrono_seam', ura: 'chrono_ura' }
const FREEZE_SEC = 4

// ------------------------------------------------------------------ 切れ目

type Slit = {
  view: SlitView
  width: number
  life: number
  closed: boolean
  handle: SlitHandle
}

// ------------------------------------------------------------------ 本体

export class ChronoSystem {
  readonly group = new THREE.Group()
  /** 時空裂きのNMクローを持っているか（シェルがフラグ v7_rift_claw から毎フレーム入れる） */
  unlocked = false
  /** 止めた・裂いた・すりぬけたのお知らせ（ステージの台詞・効果音などに） */
  onAct: ((t: ChronoTarget, result: 'froze' | 'cut' | 'pass') => void) | null = null
  private readonly host: ChronoHost
  private readonly entries = new Map<string, { t: ChronoTarget; def: ClawTargetDef }>()
  private frozen: { id: string; left: number; total: number } | null = null
  private readonly freezeFx: FreezeFx
  private readonly slashFx: SlashFx
  private readonly rippleFx: RippleFx
  private readonly slitFx: SlitFx
  private readonly slits: Slit[] = []
  private clock = 0
  private passHintAt = -99

  constructor(host: ChronoHost) {
    this.host = host
    this.group.name = 'chrono'
    this.freezeFx = new FreezeFx(this.group)
    this.slashFx = new SlashFx(this.group)
    this.rippleFx = new RippleFx(this.group)
    this.slitFx = new SlitFx(this.group)
  }

  // ---------------------------------------------------------------- ステージから

  /** 対象を足す（同じ id なら置きかえる） */
  add(t: ChronoTarget): void {
    this.remove(t.id)
    const def: ClawTargetDef = {
      id: `chrono:${t.id}`,
      type: KIND_TYPE[t.kind],
      label: t.label,
      point: t.point,
      radius: t.radius,
      enabled: false,
      noLineOfSight: t.noLineOfSight,
      range: t.range,
    }
    this.entries.set(t.id, { t, def })
    this.host.claw.targets.push(def)
    this.syncDef(t, def)
  }

  remove(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    const i = this.host.claw.targets.indexOf(e.def)
    if (i >= 0) this.host.claw.targets.splice(i, 1)
    this.entries.delete(id)
    if (this.frozen?.id === id) this.thaw()
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  /** いま止めている対象の id */
  get frozenId(): string | null {
    return this.frozen?.id ?? null
  }

  /** 止めている物の残りの秒数（止めていなければ 0） */
  get frozenLeft(): number {
    return this.frozen?.left ?? 0
  }

  /** 止めている物の時間を戻す（ステージの都合で早めに戻すとき） */
  thaw(): void {
    const f = this.frozen
    if (!f) return
    this.frozen = null
    this.freezeFx.hide()
    this.entries.get(f.id)?.t.onThaw?.()
  }

  /** 空中の切れ目の見た目（裏側への入口・夜明けの光の扉） */
  slit(pos: THREE.Vector3, o: SlitOptions = {}): SlitHandle {
    const w = o.width ?? 1.6
    const h = o.height ?? 3.2
    const view = this.slitFx.open(pos, o.normal ?? null, w, h, undefined, o.tone === 'dawn' ? 'dawn' : 'rift')
    const s: Slit = { view, width: w, life: o.seconds ?? Infinity, closed: false, handle: null as unknown as SlitHandle }
    s.handle = {
      object: view.mesh,
      setOpen: (k: number) => {
        if (!s.closed) view.setWidth(Math.max(0, Math.min(1, k)) * w, 0.35)
      },
      close: () => {
        if (s.closed) return
        s.closed = true
        view.close()
      },
      get closed() {
        return s.closed
      },
    }
    this.slits.push(s)
    this.host.shake(0.15)
    return s.handle
  }

  // ---------------------------------------------------------------- シェルから

  /** J：照準が chrono_* の対象のとき。効いたら true */
  act(def: ClawTargetDef): boolean {
    const id = def.id.startsWith('chrono:') ? def.id.slice(7) : def.id
    const e = this.entries.get(id)
    if (!e) return false
    this.syncDef(e.t, e.def)
    if (!e.def.enabled) return false
    const t = e.t
    if (t.kind === 'ura' && !this.unlocked) {
      // すりぬける：手応えだけ残す
      this.rippleFx.play(t.point, Math.max(1.6, t.radius * 3))
      if (this.passHintAt + 5 < this.clock) {
        this.passHintAt = this.clock
        this.host.toast('すりぬけた……！ さわることさえ、できない', 2.6)
      }
      t.onPassThrough?.()
      this.onAct?.(t, 'pass')
      return true
    }
    if (!this.unlocked) return false
    if (t.kind === 'freeze') {
      if (this.frozen && this.frozen.id !== t.id) this.thaw()
      const total = t.seconds ?? FREEZE_SEC
      this.frozen = { id: t.id, left: total, total }
      this.freezeFx.show(t.point, Math.max(0.5, t.radius * 1.3), total)
      t.onAct()
      this.onAct?.(t, 'froze')
      return true
    }
    // 裂く（seam・ura）
    this.slashFx.play(t.point, { angle: 0.4 + Math.random() * 0.5, length: Math.max(2.2, t.radius * 3.4) })
    this.host.shake(0.22)
    t.onAct()
    this.onAct?.(t, 'cut')
    return true
  }

  /** 毎フレーム（一時停止中は dt = 0） */
  update(dt: number, camera: THREE.Camera): void {
    this.clock += dt
    for (const e of this.entries.values()) this.syncDef(e.t, e.def)
    // 止めている物
    const f = this.frozen
    if (f) {
      f.left -= dt
      const e = this.entries.get(f.id)
      if (!e || f.left <= 0) this.thaw()
      else this.freezeFx.set(f.left)
    }
    // 切れ目（seconds がたったら閉じる。閉じきった物は SlitFx が片づける）
    for (let i = this.slits.length - 1; i >= 0; i--) {
      const s = this.slits[i]
      s.life -= dt
      if (s.life <= 0 && !s.closed) s.handle.close()
      if (s.view.dead) this.slits.splice(i, 1)
    }
    this.freezeFx.update(dt, this.clock)
    this.slashFx.update(dt)
    this.rippleFx.update(dt)
    this.slitFx.update(dt, this.clock, camera)
  }

  dispose(): void {
    this.entries.clear()
    this.freezeFx.dispose()
    this.slashFx.dispose()
    this.rippleFx.dispose()
    this.slitFx.dispose()
    this.slits.length = 0
  }

  // ---------------------------------------------------------------- 内部

  private syncDef(t: ChronoTarget, def: ClawTargetDef): void {
    // freeze・seam は時空裂きを持ってから狙える。ura はいつでも狙える（持っていなければ、すりぬける）。止めている物は狙わない
    def.enabled = t.enabled && (t.canAct?.() ?? true) && (t.kind === 'ura' || this.unlocked) && this.frozen?.id !== t.id
    def.label = t.label
  }
}
