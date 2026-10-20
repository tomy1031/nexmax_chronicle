// 時空移動の状態機械と、移動してよいかの規則（仕様 v2.3 §3.3・§4・§5.3・§9.2、操作マニュアル §4）。
// 描画・DOM・three.js には依存しない純粋なロジック（tests/travel.test.ts）。
//
// 流れ：idle →（移動の要求が規則に合えば）outro：光の裂け目が画面を覆う（古いステージはまだ描画中）
//      → loading：読み込み画面の裏で古いステージを解放し、新しいステージを組み立ててシェーダを事前コンパイル
//      → intro：裂け目が閉じて新しい時代が見える（時代カードを出す）→ idle
// 移動は自由ではない：IDO（2086年の展示・2026年の QR・中盤はソラの羅針盤）か、鉱石に残った出発地点への帰還だけ。
// 物語 v7（docs/ステージ設計_v1.md §8.3）：ソラのイドーのわっか（ido_ring）・2026年の路地のかんばん（ido_kanban）・夜明けの帰還（return）。

export type StageKey = '1186' | '1726' | '1970' | '2026' | '2086'

export const STAGE_KEYS: readonly StageKey[] = ['1186', '1726', '1970', '2026', '2086']

export function isStageKey(v: unknown): v is StageKey {
  return typeof v === 'string' && (STAGE_KEYS as readonly string[]).includes(v)
}

export function stageEra(k: StageKey): 1186 | 1726 | 1970 | 2026 | 2086 {
  return Number(k) as 1186 | 1726 | 1970 | 2026 | 2086
}

export function eraStage(era: number): StageKey | null {
  const k = String(era)
  return isStageKey(k) ? k : null
}

/**
 * 移動のきっかけ。
 * ido_exhibit：2086年のソラの IDO 展示（VR）／ido_qr：2026年の IDO の QR／
 * ido_compass：2086年のソラの IDO の羅針盤（針が振れた記録の石標の QR。中盤）／return：鉱石に残った出発地点へ帰る／
 * ido_ring：v7 のソラのイドーのわっか（記録をうつすと、背中の石が道をひらく）／ido_kanban：v7 の 2026年の路地のかんばんに手をあてる／
 * debug：開発用（URL の ?stage= や検証）／load：セーブから再開
 */
export type TravelCause = 'ido_exhibit' | 'ido_qr' | 'ido_compass' | 'ido_ring' | 'ido_kanban' | 'return' | 'debug' | 'load'

export type TravelRequest = {
  to: StageKey
  /** 到着地点の ID（各ステージの spawn） */
  spawn?: string
  cause: TravelCause
}

/** 規則の判定に使うフラグ（StoryState.get を渡せる） */
export type TravelFlags = (name: string) => boolean

export type TravelVerdict = { ok: boolean; reason: string }

const ok = (reason = ''): TravelVerdict => ({ ok: true, reason })
const ng = (reason: string): TravelVerdict => ({ ok: false, reason })

/** 移動してよいか。from が null（起動直後）は何でも可 */
export function travelRule(from: StageKey | null, req: TravelRequest, f: TravelFlags): TravelVerdict {
  if (req.cause === 'debug' || req.cause === 'load' || from === null) return ok()
  if (from === req.to) return ng('同じ時代へは移動できません')
  const route = `${from}>${req.to}`
  const v7 = travelRuleV7(route, req, f)
  if (v7) return v7
  switch (route) {
    case '2086>2026':
      // 最初の 2026年行き：ソラの IDO 展示で「NEXMAX の最初の記録」を選んだとき、鉱石が反応して偶然つながる
      return req.cause === 'ido_exhibit' ? ok() : ng('2026年へは IDO 展示からしかつながりません')
    case '2026>1726':
      // マツイ社長に紹介された IDO の QR を読んだとき、偶然 1726年へ
      if (req.cause !== 'ido_qr') return ng('1726年へは IDO の QR からしかつながりません')
      return f('met_matsui') ? ok() : ng('まだ IDO の使い方を知らない')
    case '1726>2026':
      // 1726年に QR は無い。鉱石に残った出発地点（2026年）の記録を手掛かりに、安全地点から帰還する
      if (req.cause !== 'return') return ng('1726年からは帰還地点からしか戻れません')
      return f('gate_repaired') ? ok() : ng('まだ帰還の手掛かりがない（水門を直そう）')
    case '2026>2086':
      if (req.cause !== 'return') return ng('2086年へは帰還でしか戻れません')
      return f('drawing_confirmed') ? ok() : ng('まだ未来へ持ち帰るものがそろっていない')
    case '2086>1970':
      // 中盤 9章：ソラの羅針盤の針が「1970年・万博」の記録に振れたとき（docs/中盤シナリオとワールド構成_v1.md）
      if (req.cause !== 'ido_compass') return ng('1970年へは IDO の羅針盤からしかつながりません')
      return f('compass_built') ? ok() : ng('まだ羅針盤ができていない')
    case '1970>2086':
      // 錨をほどくと、鉱石に残った 2086年の記録へ帰れる
      if (req.cause !== 'return') return ng('1970年からは帰還でしか戻れません')
      return f('expo_anchor_cleared') ? ok() : ng('まだ帰れない（未来の塔の錨をほどこう）')
  }
  return ng(`${from}年から${req.to}年へは直接移動できません`)
}

/**
 * 物語 v7 の道（docs/ステージ設計_v1.md §8.3）。v7 のきっかけ（ido_ring・ido_kanban）か、v7 の帰還の条件がそろっているときだけ判定し、
 * それ以外は null（旧版の道の判定へ）。時間を渡れるのは背中の石の力だけ：わっか・かんばんは行き先の記録をうつすだけ。
 */
function travelRuleV7(route: string, req: TravelRequest, f: TravelFlags): TravelVerdict | null {
  switch (route) {
    case '2086>2026':
      if (req.cause !== 'ido_ring') return null
      // 5章：60年前の NEXTMAKE の記録で、目をさました石が道をひらく／8章：年代ダイヤルで、自分で行き先をえらぶ
      if (f('v7_confided') && !f('v7_back1')) return ok()
      if (f('v7_dial_seen') && !f('v7_back2')) return ok()
      return ng('いまは、わっかの記録が本物の道にならない')
    case '2026>1726':
      if (req.cause !== 'ido_kanban') return null
      return f('v7_search_done') ? ok() : ng('まだ、どの記録へ行けばいいかわからない')
    case '1726>2086':
      if (req.cause !== 'return') return ng('1726年からは、夜明けの帰還でしか戻れません')
      return f('v7_claw_stored') ? ok() : ng('まだ帰れない（爪をほこらにおさめよう）')
    case '2026>2086':
      if (req.cause !== 'return' || !f('v7_dial_seen')) return null
      return f('v7_shrine_saved') ? ok() : ng('まだ帰れない（ほこらを守りぬこう）')
    case '2086>1186':
      if (req.cause !== 'ido_ring') return ng('1186年へは、わっかの年代ダイヤルからしかつながりません')
      return f('v7_towa_duel') && !f('v7_back3') ? ok() : ng('まだ、900年前へ行く理由がない')
    case '1186>2086':
      if (req.cause !== 'return') return ng('1186年からは、帰還でしか戻れません')
      return f('v7_khmer_done') ? ok() : ng('まだ帰れない（アルンを守りぬこう）')
  }
  return null
}

// ------------------------------------------------------------------ 状態機械

export type TravelPhase = 'idle' | 'outro' | 'loading' | 'intro'

export const TRAVEL_TIMING = {
  /** 光の裂け目が画面を覆うまで（秒） */
  outro: 1.1,
  /** 新しい時代が見えてくるまで（秒） */
  intro: 0.9,
  /** 時代カードを出しておく時間（秒、intro の開始から） */
  card: 3.2,
}

export type TravelEvent =
  | { kind: 'started'; request: TravelRequest }
  /** 画面が覆われた：ここで古いステージを解放して新しいステージを読み込む（終わったら loaded() を呼ぶ） */
  | { kind: 'cover'; request: TravelRequest }
  | { kind: 'revealed'; request: TravelRequest }
  | { kind: 'done'; request: TravelRequest }

/** 何も起きなかったフレーム（毎フレーム配列を作らない） */
const NO_EVENTS: readonly TravelEvent[] = Object.freeze([]) as readonly TravelEvent[]

export class TravelMachine {
  phase: TravelPhase = 'idle'
  /** いまの段階に入ってからの時間（秒） */
  t = 0
  request: TravelRequest | null = null
  private readonly timing: typeof TRAVEL_TIMING
  private pending: TravelEvent[] = []

  constructor(timing: typeof TRAVEL_TIMING = TRAVEL_TIMING) {
    this.timing = timing
  }

  get busy(): boolean {
    return this.phase !== 'idle'
  }

  /** プレイヤーの操作を止めるべきか（outro・loading の間） */
  get inputLocked(): boolean {
    return this.phase === 'outro' || this.phase === 'loading'
  }

  /**
   * 移動を始める。規則に合わない・移動中なら開始しない（理由を返す）。
   * instant=true は起動直後の読み込み（演出なしで loading から）
   */
  start(from: StageKey | null, req: TravelRequest, flags: TravelFlags, instant = false): TravelVerdict {
    if (this.busy) return ng('移動中です')
    const v = travelRule(from, req, flags)
    if (!v.ok) return v
    this.request = req
    this.t = 0
    this.pending.push({ kind: 'started', request: req })
    if (instant) {
      this.phase = 'loading'
      this.pending.push({ kind: 'cover', request: req })
    } else this.phase = 'outro'
    return v
  }

  /** 新しいステージの準備ができた（loading → intro） */
  loaded(): void {
    if (this.phase !== 'loading' || !this.request) return
    this.phase = 'intro'
    this.t = 0
    this.pending.push({ kind: 'revealed', request: this.request })
  }

  /** 読み込みに失敗した：元に戻す（呼び出し側が元のステージを戻す前提） */
  abort(): void {
    this.phase = 'idle'
    this.t = 0
    this.request = null
  }

  /** 時間を進めて、起きたことを返す */
  tick(dt: number): readonly TravelEvent[] {
    if (this.phase === 'outro') {
      this.t += dt
      if (this.t >= this.timing.outro && this.request) {
        this.phase = 'loading'
        this.t = 0
        this.pending.push({ kind: 'cover', request: this.request })
      }
    } else if (this.phase === 'intro') {
      this.t += dt
      if (this.t >= this.timing.intro && this.request) {
        const r = this.request
        this.phase = 'idle'
        this.t = 0
        this.request = null
        this.pending.push({ kind: 'done', request: r })
      }
    } else if (this.phase === 'loading') {
      this.t += dt
    }
    if (this.pending.length === 0) return NO_EVENTS
    const out = this.pending
    this.pending = []
    return out
  }

  /** 全画面の演出の強さ 0〜1（outro で 0→1、loading は 1、intro で 1→0） */
  get cover(): number {
    switch (this.phase) {
      case 'outro':
        return Math.min(1, this.t / this.timing.outro)
      case 'loading':
        return 1
      case 'intro':
        return Math.max(0, 1 - this.t / this.timing.intro)
    }
    return 0
  }
}
