// 2086年 導入編（docs/シナリオ改訂案_導入編_v1.md の 1〜5 章）の物語の進行（状態機械）。three.js・DOM には依存しない純粋なロジック。
//   1章 祭りの朝：回想（15年前）→ ブースへ → ソラが IDO と展示を説明 → 腕が落ちる → 共鳴レンズ（J で取って F でソラに渡す）
//       → 中継アンテナ（金具 → 光る輪 → アンテナで F）→ 大画面に「開場」→ 約束（そのとき IDO を体験させてあげる）
//   2章 その夜：ソラと歩く → 空が裂ける（emergence2086）→ 破片をよけて南のゲートへ → 飲み込まれる → 朝へ（ループ）
//   3章 繰り返す朝：同じ朝 → 街頭ビジョンの日付（10月18日）・同じ街灯に引っかかる風船・落ちる前に受け止める腕
//       → ソラは一字一句同じあいさつ、夜の話には「初めて聞いた」返事（毎周同じ）
//   4章 あらがう：試みの一覧（順番は自由）①運営本部で中止を頼む（＋ソラにも）②非常警報の柱を J で引く
//       ③ソラと南のゲートから町の外へ（白くかすんで広場へ戻る）④夜に空の存在へ J（すり抜ける）。どれも夜へ飛んで失敗し、朝へ戻る。
//       2 つ試すと「ぼくには……未来は、変えられないの……？」
//   5章 IDO で自分を調べる：打ち明ける →「信じるよ」→ 記録の石標 3 本の QR（1970年・1726年は短い映像、
//       2026年の NEXMAX の記録で鉱石が共鳴して本物の穴）→ 2026年へ
// シェル（future2086Adapter）は send() で出来事を知らせ、onEffect で受け取った演出・会話・移動を実行して、終わったら知らせ返す。
// 旧版の流れ（future2086Story.ts）はプレビュー（previewPlay.ts）と既存テストのために残してある。
import lines from './intro_2086.json'

export type IntroStep =
  | 'opening'
  | 'go_booth'
  | 'talk_sora'
  | 'fetch_lens'
  | 'deliver_lens'
  | 'climb_hook'
  | 'swing_gap'
  | 'fix_antenna'
  | 'return_booth'
  | 'night'
  | 'night_walk'
  | 'night_orum'
  | 'evade'
  | 'swallow'
  | 'loop'
  | 'wake'
  | 'loop_cues'
  | 'attempts'
  | 'escape_walk'
  | 'attempt_night'
  | 'confront'
  | 'confide'
  | 'records'
  | 'resonance'
  | 'travel'
  | 'returned'

export const INTRO_STEPS: readonly IntroStep[] = [
  'opening',
  'go_booth',
  'talk_sora',
  'fetch_lens',
  'deliver_lens',
  'climb_hook',
  'swing_gap',
  'fix_antenna',
  'return_booth',
  'night',
  'night_walk',
  'night_orum',
  'evade',
  'swallow',
  'loop',
  'wake',
  'loop_cues',
  'attempts',
  'escape_walk',
  'attempt_night',
  'confront',
  'confide',
  'records',
  'resonance',
  'travel',
  'returned',
]

export type DialogueLine = { speaker: string; text: string }

/** 4章の試み */
export type Attempt = 'cancel' | 'alarm' | 'escape' | 'confront'
export const ATTEMPTS: readonly Attempt[] = ['cancel', 'alarm', 'escape', 'confront']
export const ATTEMPT_LABELS: Record<Attempt, string> = {
  cancel: '祭りの中止を頼む（運営本部）',
  alarm: '早めに避難させる（非常警報の柱）',
  escape: 'ソラを連れて町の外へ',
  confront: '夜、空の存在に立ち向かう',
}
/** 5章へ進めるようになる試みの数 */
export const ATTEMPTS_FOR_DESPAIR = 2

/** 記録の石標（5章） */
export type RecordId = 'expo1970' | 'edo1726' | 'namba2026'
export const RECORD_OF_STONE: Record<'stone_1970' | 'stone_1726' | 'stone_2026', RecordId> = {
  stone_1970: 'expo1970',
  stone_1726: 'edo1726',
  stone_2026: 'namba2026',
}

export type IntroZone = 'booth' | 'upper_walkway' | 'far_platform' | 'south_gate' | 'plaza_center'
export type IntroInteract = 'sora' | 'antenna' | 'hq' | 'stone_1970' | 'stone_1726' | 'stone_2026' | 'parts_table' | 'ido_exhibit'
export type IntroFx = 'flashback' | 'night' | 'loop' | 'whiteout' | 'qr'
export type ClawEventKind = 'fired' | 'missed' | 'connected' | 'object_arrived' | 'dropped' | 'arrived' | 'detached' | 'released' | 'retracted'

/** シェルの動かせる物・つかめる対象の ID */
export const INTRO_IDS = { lens: 'ido_lens', hook: 'walkway_hook', ring: 'arch_ring', alarm: 'alarm_lever' } as const

export type IntroEvent =
  | { kind: 'zone'; zone: IntroZone }
  /** F。item：ソラに渡せる物を持っている（共鳴レンズのケース） */
  | { kind: 'interact'; target: IntroInteract; item?: 'lens' }
  | { kind: 'claw'; event: ClawEventKind; targetId: string }
  | { kind: 'dialogue_done'; key: string }
  | { kind: 'choice'; id: string; option: string }
  | { kind: 'fx_done'; fx: IntroFx }
  | { kind: 'debris_hit' }
  /** 立ち向かう夜に J を撃った */
  | { kind: 'confront_shot' }
  | { kind: 'tick'; dt: number }

export type IntroFlag = 'festival_morning_seen' | 'lens_installed' | 'orum_seen' | 'ido_exhibit_used' | 'loop_noticed' | 'try_cancel' | 'try_alarm' | 'try_escape' | 'try_confront' | 'confided'

export const ATTEMPT_FLAG: Record<Attempt, IntroFlag> = { cancel: 'try_cancel', alarm: 'try_alarm', escape: 'try_escape', confront: 'try_confront' }

export type SoraSpot = 'booth' | 'exhibit' | 'night' | 'gate'
export type FocusTarget = 'lens' | 'hook' | 'ring' | 'sky' | 'antenna' | 'screen' | 'balloon' | 'exhibit' | 'install'
export type ChoiceOption = { id: string; label: string }
export type AttemptItem = { id: Attempt; label: string; done: boolean; active: boolean }

export type IntroEffect =
  | { kind: 'step'; step: IntroStep }
  | { kind: 'dialogue'; key: string; lines: readonly DialogueLine[] }
  | { kind: 'say'; speaker: string; text: string; seconds?: number }
  | { kind: 'lock'; on: boolean }
  | { kind: 'transition'; to: 'night'; spawn: string; sora: SoraSpot }
  /** follow：プレイヤーの横を歩いてついてくる／stop：その場で止まる／escape：南のゲートへ逃げる */
  | { kind: 'sora'; spot: SoraSpot | 'escape' | 'follow' | 'stop' }
  /** appear：空が裂けて正体不明の存在が出てくる（short は 2 回目以降の短い版）／swallow：空いっぱいに広がる */
  | { kind: 'orum'; action: 'appear' | 'swallow'; short?: boolean }
  | { kind: 'debris'; active: boolean }
  | { kind: 'loop_fx'; spawn: string; sora: SoraSpot }
  | { kind: 'ore_glow'; level: number }
  | { kind: 'rift'; open: boolean }
  | { kind: 'choice'; id: string; prompt: string; options: readonly ChoiceOption[] }
  /** 腕のパーツが落ちる（1周目）／落ちる前に受け止める（3章） */
  | { kind: 'drop_arm' }
  | { kind: 'arm_catch' }
  | { kind: 'flag'; name: IntroFlag }
  | { kind: 'loop_count'; value: number }
  | { kind: 'travel'; to: '2026'; spawn: 'present_start'; cause: 'ido_exhibit' }
  | { kind: 'focus'; target: FocusTarget; short?: boolean }
  /** 1-0 の回想（終わったら fx_done 'flashback'） */
  | { kind: 'flashback' }
  /** 共鳴レンズのケースをソラに渡してリングにはめる（展示が安定する） */
  | { kind: 'install_lens' }
  /** 中継アンテナがつながった：会場の大画面に開場の映像・歓声 */
  | { kind: 'antenna_fixed' }
  /** 街頭ビジョンの朝のニュース（毎朝同じ時刻・同じ言葉） */
  | { kind: 'announce' }
  /** 子どもの風船が同じ街灯に引っかかる（毎朝同じ時刻） */
  | { kind: 'balloon' }
  /** 右上の試みの一覧（null で隠す） */
  | { kind: 'attempts_ui'; items: readonly AttemptItem[] | null }
  /** 昼のうちに人が避難して広場が空になる（朝に戻ると元どおり） */
  | { kind: 'evacuate'; on: boolean }
  /** 南のゲートの先が白くかすみ、広場へ戻される（終わったら fx_done 'whiteout'） */
  | { kind: 'whiteout' }
  /** 立ち向かう夜：J を撃てるようにする */
  | { kind: 'confront'; on: boolean }
  /** クローが本体をすり抜ける */
  | { kind: 'confront_shot' }
  /** 逃げた先の街から先に消えていく（避難した夜） */
  | { kind: 'city_unravel' }
  /** 記録の石標の QR を読む（目からの光 → リングにその時代が組み上がる。終わったら fx_done 'qr'） */
  | { kind: 'qr_scan'; record: RecordId }
  /** 展示のリングの見た目：visitor（体験中の客と昔の町）／idle（客なし）／off */
  | { kind: 'exhibit'; mode: 'visitor' | 'idle' }
  /** いまの段階で保存してよい */
  | { kind: 'save' }

export type Objective = { title: string; sub: string }
export type KeyHint = { key: string; label: string }

/** 夜の避難が長引いたら、失敗にせずに進める（秒） */
export const EVADE_TIMEOUT = 40
/** 立ち向かう夜に撃たないまま経ったら、自動で撃つ（秒） */
export const CONFRONT_TIMEOUT = 30
/** チュートリアルで進まないまま経ったら、目標を短く見せ直す（秒） */
export const FOCUS_REPLAY_SEC = 40
/** 毎朝の出来事の時刻（朝が始まってからの秒） */
export const MORNING_EVENTS = { announce: 3, balloon: 12 } as const
/** 夜の散歩の長さ（ソラの一言が終わってから、秒） */
export const NIGHT_WALK_AFTER = 3

export const FOCUS_REPLAY: Partial<Record<IntroStep, { target: FocusTarget; hint: string }>> = {
  fetch_lens: { target: 'lens', hint: 'sora_hint_lens' },
  climb_hook: { target: 'hook', hint: 'sora_hint_hook' },
  swing_gap: { target: 'ring', hint: 'sora_hint_swing' },
  fix_antenna: { target: 'antenna', hint: 'sora_hint_antenna' },
}

export const ATTEMPT_CHOICE = { id: 'attempt_menu', prompt: 'ソラに……' } as const
export const CHOICE_LABELS = {
  escape: 'いっしょに町の外へ逃げよう',
  confront: '夜になったら、空のあれに立ち向かう',
  confide: '本当のことを、打ち明ける',
  none: '……なんでもない',
} as const

const MORNING_STEPS: readonly IntroStep[] = ['go_booth', 'talk_sora', 'fetch_lens', 'deliver_lens', 'climb_hook', 'swing_gap', 'fix_antenna', 'return_booth', 'loop_cues', 'attempts', 'escape_walk']

export const INTRO_OBJECTIVES: Record<IntroStep, Objective> = {
  opening: { title: '', sub: '' },
  go_booth: { title: 'ソラの展示ブースへ行こう', sub: 'WASD：移動　↑↓←→：カメラ　Space：ジャンプ' },
  talk_sora: { title: 'ソラに話しかけよう', sub: 'ソラの近くで F：話す' },
  fetch_lens: { title: '開場までに展示を安定させよう', sub: '箱の山のいちばん上のケースを狙って J：引き寄せる' },
  deliver_lens: { title: '共鳴レンズのケースをソラに届けよう', sub: '持ったままソラの近くで F：渡す' },
  climb_hook: { title: '北の回廊の中継アンテナへ', sub: '回廊の縁の金具を狙って J：飛びつく' },
  swing_gap: { title: '光る輪で途切れた橋を渡ろう', sub: 'アーチの輪を狙って J → WASD でこぐ → Space で飛び移る' },
  fix_antenna: { title: '中継アンテナの線をつなごう', sub: 'アンテナの前で F：つなぐ' },
  return_booth: { title: 'ソラのところへ戻ろう', sub: '展示ブースへ' },
  night: { title: '夜の時代博覧祭', sub: '' },
  night_walk: { title: '夜の時代博覧祭', sub: 'ソラと会場を歩こう' },
  night_orum: { title: '夜の時代博覧祭', sub: '……空のようすがおかしい' },
  evade: { title: 'ソラと南の避難ゲートへ逃げよう', sub: '赤い輪に破片が落ちる　Shift：ダッシュ　Space：ジャンプ' },
  swallow: { title: 'ソラを守れ', sub: '' },
  loop: { title: '', sub: '' },
  wake: { title: '', sub: '' },
  loop_cues: { title: 'ソラのところへ行こう', sub: 'さっきと同じ朝……？' },
  attempts: { title: '夜が来る前に、みんなを守る方法を試そう', sub: '順番は自由（右の一覧）' },
  escape_walk: { title: 'ソラと南のゲートから町の外へ', sub: 'ソラがついてくる' },
  attempt_night: { title: '夜の時代博覧祭', sub: '……また、空が' },
  confront: { title: '空の存在に、クローを撃とう', sub: '空へカメラを向けて J' },
  confide: { title: 'ソラに打ち明けよう', sub: '' },
  records: { title: '記録の石標の QR を読もう', sub: '石標の前で F：QR を読む　君の記録は「2026年・なんば」' },
  resonance: { title: '……鉱石が反応している！', sub: '' },
  travel: { title: '光の穴の向こうへ', sub: '' },
  returned: { title: 'ソラに会いに行こう', sub: '時代博覧祭の IDO 展示へ' },
}

export const INTRO_HINTS: Record<IntroStep, KeyHint[]> = {
  opening: [],
  go_booth: [
    { key: 'WASD', label: '移動' },
    { key: '↑↓←→', label: 'カメラ' },
    { key: 'Space', label: 'ジャンプ' },
  ],
  talk_sora: [{ key: 'F', label: '話す' }],
  fetch_lens: [{ key: 'J', label: 'つかむ' }],
  deliver_lens: [{ key: 'J', label: 'つかむ' }],
  climb_hook: [{ key: 'J', label: '飛びつく' }],
  swing_gap: [
    { key: 'J', label: '輪にぶら下がる' },
    { key: 'WASD', label: 'こいで揺らす' },
    { key: 'Space', label: '飛び移る' },
  ],
  fix_antenna: [],
  return_booth: [],
  night: [],
  night_walk: [{ key: 'WASD', label: '歩く' }],
  night_orum: [],
  evade: [
    { key: 'Shift', label: 'ダッシュ' },
    { key: 'Space', label: 'ジャンプ' },
  ],
  swallow: [],
  loop: [],
  wake: [],
  loop_cues: [],
  attempts: [],
  escape_walk: [{ key: 'WASD', label: '移動' }],
  attempt_night: [],
  confront: [{ key: 'J', label: 'クローを撃つ' }],
  confide: [],
  records: [],
  resonance: [],
  travel: [],
  returned: [],
}

/** 保存されたフラグから始める段階（ロード後に同じところから） */
export function introStartStep(f: (name: string) => boolean): IntroStep {
  // 2026年・1726年まで進んでいれば（途中から始めた場合も）、戻ってきた後の段階にする。回想からやり直さない
  if (f('ido_exhibit_used') || f('met_saeki') || f('ido_qr_used') || f('fixture_made')) return 'returned'
  if (f('confided')) return 'records'
  if (f('loop_noticed')) return 'attempts'
  if (f('orum_seen')) return 'loop_cues'
  if (f('lens_installed')) return 'climb_hook'
  if (f('festival_morning_seen')) return 'fetch_lens'
  return 'opening'
}

/** 段階を始めるときの到着地点 */
export function introSpawn(step: IntroStep): string {
  switch (step) {
    case 'wake':
    case 'loop_cues':
    case 'attempts':
      return 'loop_morning'
    case 'records':
    case 'confide':
      return 'booth'
    case 'returned':
      return 'arrive_from_2026'
    case 'night':
    case 'night_walk':
    case 'night_orum':
    case 'evade':
    case 'attempt_night':
    case 'confront':
      return 'night_plaza'
    case 'climb_hook':
      return 'hook'
    case 'swing_gap':
      return 'walkway'
    case 'fix_antenna':
      return 'far_platform'
    default:
      return 'start'
  }
}

/** 夜の段階か（環境を夜にする） */
export function isNightStep(step: IntroStep): boolean {
  return step === 'night' || step === 'night_walk' || step === 'night_orum' || step === 'evade' || step === 'swallow' || step === 'attempt_night' || step === 'confront'
}

export type IntroOptions = {
  start?: IntroStep
  loopCount?: number
  /** 保存されたフラグ（試みの済み・未済みを戻す） */
  flags?: (name: string) => boolean
  table?: Readonly<Record<string, unknown>>
}

export class Intro2086Story {
  step: IntroStep
  loopCount: number
  /** 済んだ試み */
  readonly attempts = new Set<Attempt>()
  /** いま試している試み */
  current: Attempt | null = null
  /** 運営本部で中止を頼んだ（この周、ソラにも頼むと夜へ） */
  cancelAsked = false
  /** この周、ソラのあいさつを聞いた */
  greeted = false
  /** 2 つ試して「変えられない」と気づいた */
  despaired = false
  readonly recordsSeen = new Set<RecordId>()
  evadeTime = 0
  debrisHits = 0
  idleTime = 0
  /** 朝が始まってからの秒（-1 = 朝の時計なし） */
  morningT = -1
  onEffect: ((e: IntroEffect) => void) | null = null
  onRequestTravel: ((era: '2026', spawn: 'present_start') => void) | null = null
  private readonly table: Readonly<Record<string, unknown>>
  private pendingDialogue: string | null = null
  private choiceOpen = false
  private announced = false
  private ballooned = false
  private hitBark = 0
  private walkT = -1
  private confrontT = 0
  private qrBusy = false
  private whiteoutBusy = false
  private readonly queue: IntroEffect[] = []
  private keepQueue = false

  constructor(o: IntroOptions = {}) {
    this.step = o.start ?? 'opening'
    this.loopCount = o.loopCount ?? 0
    this.table = o.table ?? (lines as Readonly<Record<string, unknown>>)
    const f = o.flags
    if (f) for (const a of ATTEMPTS) if (f(ATTEMPT_FLAG[a])) this.attempts.add(a)
    this.despaired = this.attempts.size >= ATTEMPTS_FOR_DESPAIR
  }

  lines(key: string): readonly DialogueLine[] {
    const v = this.table[key]
    return Array.isArray(v) ? (v as DialogueLine[]) : []
  }

  record(on = true): this {
    this.keepQueue = on
    return this
  }

  drain(): IntroEffect[] {
    return this.queue.splice(0, this.queue.length)
  }

  objective(): Objective {
    if (this.step === 'attempts') {
      if (this.cancelAsked) return { title: 'ソラにも中止を頼もう', sub: '展示ブースのソラに F：話す' }
      if (this.despaired) return { title: 'ソラに打ち明けよう', sub: 'まだ試していない方法もある（右の一覧）' }
    }
    return INTRO_OBJECTIVES[this.step]
  }

  hints(): KeyHint[] {
    return INTRO_HINTS[this.step]
  }

  /** 右上の試みの一覧（4章〜5章の前。出さないときは null） */
  attemptItems(): AttemptItem[] | null {
    const show = this.step === 'attempts' || this.step === 'escape_walk' || (this.step === 'night' && this.current !== null) || this.step === 'attempt_night' || this.step === 'confront' || (this.step === 'wake' && this.loopCount >= 2) || (this.step === 'swallow' && this.current !== null) || (this.step === 'loop' && this.current !== null)
    if (!show) return null
    return ATTEMPTS.map((id) => ({ id, label: ATTEMPT_LABELS[id], done: this.attempts.has(id), active: this.current === id }))
  }

  /** いま終わりを待っている会話のキー（無ければ null） */
  get pending(): string | null {
    return this.pendingDialogue
  }

  /** 会話・演出を待っているか */
  get busy(): boolean {
    return (
      this.pendingDialogue !== null ||
      this.choiceOpen ||
      this.qrBusy ||
      this.whiteoutBusy ||
      this.step === 'opening' ||
      this.step === 'night' ||
      this.step === 'swallow' ||
      this.step === 'loop' ||
      this.step === 'wake' ||
      this.step === 'resonance' ||
      this.step === 'travel'
    )
  }

  /** いま F で反応する相手か */
  canInteract(target: IntroInteract): boolean {
    if (this.busy) return false
    switch (target) {
      case 'sora':
        return MORNING_STEPS.includes(this.step) || this.step === 'records' || this.step === 'returned'
      case 'antenna':
        return this.step === 'fix_antenna'
      case 'hq':
        return this.step === 'attempts'
      case 'stone_1970':
      case 'stone_1726':
      case 'stone_2026':
        return this.step === 'records'
      case 'parts_table':
        return this.step === 'talk_sora' || this.step === 'go_booth' || this.step === 'fetch_lens'
      case 'ido_exhibit':
        return false
    }
  }

  /** F の案内の言葉 */
  interactLabel(target: IntroInteract): string {
    switch (target) {
      case 'sora':
        return this.step === 'deliver_lens' ? '渡す' : '話す'
      case 'antenna':
        return 'つなぐ'
      case 'hq':
        return '中止を頼む'
      case 'stone_1970':
      case 'stone_1726':
      case 'stone_2026':
        return 'QR を読む'
      default:
        return '調べる'
    }
  }

  /** 非常警報の柱（J で引く）を狙えるか */
  alarmEnabled(): boolean {
    return this.step === 'attempts' && !this.attempts.has('alarm') && !this.current && !this.busy
  }

  /** 段階の開始（ロード直後・ステージ開始時に 1 回） */
  begin(): void {
    this.emit({ kind: 'step', step: this.step })
    const spot: SoraSpot = this.step === 'records' || this.step === 'returned' ? 'exhibit' : isNightStep(this.step) ? 'night' : 'booth'
    this.emit({ kind: 'sora', spot })
    this.emit({ kind: 'exhibit', mode: this.step === 'records' || this.step === 'returned' ? 'idle' : 'visitor' })
    if (this.step === 'opening') {
      this.emit({ kind: 'lock', on: true })
      this.emit({ kind: 'flashback' })
      return
    }
    if (this.step === 'climb_hook' || this.step === 'swing_gap' || this.step === 'fix_antenna' || this.step === 'return_booth') this.emit({ kind: 'install_lens' })
    if (MORNING_STEPS.includes(this.step)) this.startMorning()
    this.emitAttemptsUi()
  }

  send(ev: IntroEvent): boolean {
    switch (ev.kind) {
      case 'tick':
        return this.tick(ev.dt)
      case 'dialogue_done':
        return this.onDialogueDone(ev.key)
      case 'zone':
        return this.onZone(ev.zone)
      case 'interact':
        return this.onInteract(ev.target, ev.item)
      case 'claw':
        return this.onClaw(ev.event, ev.targetId)
      case 'choice':
        return this.onChoice(ev.id, ev.option)
      case 'fx_done':
        return this.onFx(ev.fx)
      case 'debris_hit':
        return this.onHit()
      case 'confront_shot':
        return this.onConfrontShot()
    }
  }

  // ---------------------------------------------------------------- 内部

  private emit(e: IntroEffect): void {
    if (this.keepQueue) this.queue.push(e)
    this.onEffect?.(e)
  }

  private go(step: IntroStep): void {
    this.step = step
    this.idleTime = 0
    this.emit({ kind: 'step', step })
    this.emitAttemptsUi()
  }

  private emitAttemptsUi(): void {
    this.emit({ kind: 'attempts_ui', items: this.attemptItems() })
  }

  private say(key: string, prefix: readonly DialogueLine[] = [], suffix: readonly DialogueLine[] = []): void {
    const l = [...prefix, ...this.lines(key), ...suffix]
    if (!l.length) return
    this.pendingDialogue = key
    this.emit({ kind: 'dialogue', key, lines: l })
  }

  /** 1 行だけの台詞（待たない） */
  private bark(key: string, seconds?: number): void {
    const l = this.lines(key)[0]
    if (l) this.emit({ kind: 'say', speaker: l.speaker, text: l.text, seconds })
  }

  private focus(target: FocusTarget, key: string, short = false): void {
    this.emit({ kind: 'focus', target, short: short || this.loopCount > 0 })
    this.say(key)
  }

  /** ソラのあいさつ（この周で初めて話すときだけ前に付ける。毎周一字一句同じ） */
  private greeting(): readonly DialogueLine[] {
    if (this.greeted) return []
    this.greeted = true
    return this.lines('morning_greet')
  }

  private startMorning(): void {
    this.morningT = 0
    this.announced = false
    this.ballooned = false
  }

  private tick(dt: number): boolean {
    // 毎朝の出来事（同じ時刻・同じ言葉）
    if (this.morningT >= 0 && MORNING_STEPS.includes(this.step)) {
      this.morningT += dt
      if (!this.announced && this.morningT >= MORNING_EVENTS.announce && !this.pendingDialogue) {
        this.announced = true
        this.emit({ kind: 'announce' })
        this.bark('announce', 6.5)
        if (this.step === 'loop_cues') this.delayed.push({ t: 6.8, run: () => !this.pendingDialogue && this.bark('cue_date', 3.2) })
      }
      if (!this.ballooned && this.morningT >= MORNING_EVENTS.balloon) {
        this.ballooned = true
        this.emit({ kind: 'balloon' })
        this.delayed.push({ t: 2.2, run: () => !this.pendingDialogue && this.bark('balloon_cry', 2.6) })
        if (this.step === 'loop_cues' && !this.pendingDialogue) {
          this.emit({ kind: 'focus', target: 'balloon', short: true })
          this.delayed.push({ t: 5.2, run: () => !this.pendingDialogue && this.bark('cue_balloon', 3.2) })
        }
      }
    }
    for (let i = this.delayed.length - 1; i >= 0; i--) {
      const d = this.delayed[i]
      d.t -= dt
      if (d.t <= 0) {
        this.delayed.splice(i, 1)
        // 朝の間だけ（夜へ移ったら言わない）
        if (MORNING_STEPS.includes(this.step)) d.run()
      }
    }
    // 見せ直し
    const replay = FOCUS_REPLAY[this.step]
    if (replay && !this.pendingDialogue && !this.choiceOpen) {
      this.idleTime += dt
      if (this.idleTime >= FOCUS_REPLAY_SEC) {
        this.idleTime = 0
        this.focus(replay.target, replay.hint, true)
      }
    }
    // 夜の散歩：ソラの一言が終わって少ししたら、空が裂ける
    if (this.step === 'night_walk' && this.walkT >= 0 && !this.pendingDialogue) {
      this.walkT += dt
      if (this.walkT >= NIGHT_WALK_AFTER) this.startEmergence(false)
    }
    if (this.step === 'evade' && !this.pendingDialogue) {
      this.evadeTime += dt
      this.hitBark = Math.max(0, this.hitBark - dt)
      if (this.evadeTime >= EVADE_TIMEOUT) this.swallow()
    }
    if (this.step === 'confront' && !this.pendingDialogue) {
      this.confrontT += dt
      if (this.confrontT >= CONFRONT_TIMEOUT) this.onConfrontShot()
    }
    return false
  }

  private readonly delayed: Array<{ t: number; run: () => unknown }> = []

  private onZone(zone: IntroZone): boolean {
    switch (this.step) {
      case 'go_booth':
        if (zone === 'booth') {
          this.go('talk_sora')
          return true
        }
        break
      case 'climb_hook':
        if (zone === 'upper_walkway') return this.reachWalkway()
        break
      case 'swing_gap':
        if (zone === 'far_platform') {
          this.go('fix_antenna')
          this.emit({ kind: 'focus', target: 'antenna', short: true })
          this.bark('antenna_found', 3)
          return true
        }
        break
      case 'evade':
        if (zone === 'south_gate') {
          this.swallow()
          return true
        }
        break
      case 'escape_walk':
        if (zone === 'south_gate' && !this.whiteoutBusy) {
          this.whiteoutBusy = true
          this.emit({ kind: 'lock', on: true })
          this.emit({ kind: 'whiteout' })
          return true
        }
        break
    }
    return false
  }

  private reachWalkway(): boolean {
    if (this.step !== 'climb_hook') return false
    this.go('swing_gap')
    this.focus('ring', 'walkway_up')
    return true
  }

  private onInteract(target: IntroInteract, item?: 'lens'): boolean {
    if (!this.canInteract(target)) return false
    switch (target) {
      case 'parts_table':
        this.bark('parts_table', 3)
        return true
      case 'antenna':
        this.emit({ kind: 'antenna_fixed' })
        this.emit({ kind: 'focus', target: 'screen', short: this.loopCount > 0 })
        this.say('antenna_done')
        this.go('return_booth')
        return true
      case 'hq':
        if (this.attempts.has('cancel')) {
          this.bark('cancel_done', 3.2)
          return true
        }
        if (this.current) return false
        this.say('try_cancel_hq')
        return true
      case 'stone_1970':
      case 'stone_1726':
      case 'stone_2026': {
        const rec = RECORD_OF_STONE[target]
        this.qrBusy = true
        this.pendingRecord = rec
        this.emit({ kind: 'lock', on: true })
        this.emit({ kind: 'qr_scan', record: rec })
        return true
      }
      case 'sora':
        return this.talkSora(item)
      default:
        return false
    }
  }

  private pendingRecord: RecordId | null = null

  private talkSora(item?: 'lens'): boolean {
    switch (this.step) {
      case 'go_booth':
      case 'talk_sora':
        this.step = 'talk_sora'
        this.say('ch1_ido', this.greeting())
        return true
      case 'fetch_lens':
        this.idleTime = 0
        this.say('sora_hint_lens')
        return true
      case 'deliver_lens':
        if (item !== 'lens') {
          this.say('lens_need')
          return true
        }
        this.emit({ kind: 'install_lens' })
        this.emit({ kind: 'focus', target: 'install', short: this.loopCount > 0 })
        this.say('lens_install')
        return true
      case 'climb_hook':
        this.idleTime = 0
        this.say('sora_hint_hook')
        return true
      case 'swing_gap':
        this.idleTime = 0
        this.say('sora_hint_swing')
        return true
      case 'fix_antenna':
        this.idleTime = 0
        this.say('sora_hint_antenna')
        return true
      case 'return_booth':
        this.say('promise')
        return true
      case 'loop_cues':
        this.say('loop_help', this.greeting())
        return true
      case 'attempts': {
        const greet = this.greeting()
        if (this.cancelAsked) {
          this.say('try_cancel_sora', greet)
          return true
        }
        if (greet.length) {
          this.say('greet_then_menu', greet)
          return true
        }
        this.openMenu()
        return true
      }
      case 'records':
        this.say('sora_hint_records')
        return true
      case 'returned':
        this.say('return_sora')
        return true
    }
    this.say('sora_idle')
    return true
  }

  private openMenu(): void {
    const opts: ChoiceOption[] = []
    if (this.despaired) opts.push({ id: 'confide', label: CHOICE_LABELS.confide })
    if (!this.attempts.has('escape')) opts.push({ id: 'escape', label: CHOICE_LABELS.escape })
    if (!this.attempts.has('confront')) opts.push({ id: 'confront', label: CHOICE_LABELS.confront })
    opts.push({ id: 'none', label: CHOICE_LABELS.none })
    this.choiceOpen = true
    this.emit({ kind: 'choice', id: ATTEMPT_CHOICE.id, prompt: ATTEMPT_CHOICE.prompt, options: opts })
  }

  private onChoice(id: string, option: string): boolean {
    if (id !== ATTEMPT_CHOICE.id || !this.choiceOpen) return false
    this.choiceOpen = false
    switch (option) {
      case 'escape':
        this.current = 'escape'
        this.emitAttemptsUi()
        this.say('try_escape')
        return true
      case 'confront':
        this.current = 'confront'
        this.emitAttemptsUi()
        this.say('try_confront')
        return true
      case 'confide':
        if (!this.despaired) return false
        this.go('confide')
        this.emit({ kind: 'attempts_ui', items: null })
        this.say('confide')
        return true
    }
    return true
  }

  private onClaw(event: ClawEventKind, targetId: string): boolean {
    if (this.step === 'fetch_lens' && targetId === INTRO_IDS.lens && (event === 'object_arrived' || event === 'connected')) {
      this.go('deliver_lens')
      this.bark('lens_got', 2.6)
      return true
    }
    if (this.step === 'climb_hook' && targetId === INTRO_IDS.hook && event === 'arrived') return this.reachWalkway()
    if (targetId === INTRO_IDS.alarm && event === 'connected' && this.alarmEnabled() && !this.current) {
      this.current = 'alarm'
      this.cancelAsked = false
      this.emitAttemptsUi()
      this.emit({ kind: 'evacuate', on: true })
      this.say('try_alarm')
      return true
    }
    return false
  }

  private onConfrontShot(): boolean {
    if (this.step !== 'confront' || this.pendingDialogue) return false
    this.emit({ kind: 'confront', on: false })
    this.emit({ kind: 'confront_shot' })
    this.emit({ kind: 'debris', active: true })
    this.say('confront_fail')
    return true
  }

  private onHit(): boolean {
    if (this.step !== 'evade' && this.step !== 'confront') return false
    this.debrisHits++
    if (this.hitBark <= 0) {
      const l = this.lines('debris_hit')
      if (l.length) {
        const line = l[(this.debrisHits - 1) % l.length]
        this.emit({ kind: 'say', speaker: line.speaker, text: line.text })
      }
      this.hitBark = 3
    }
    return true
  }

  /** 試みを決めた：昼をはしょって夜へ */
  private startAttemptNight(): void {
    this.emit({ kind: 'lock', on: true })
    this.go('night')
    this.emit({ kind: 'transition', to: 'night', spawn: 'night_plaza', sora: 'night' })
  }

  private startEmergence(short: boolean): void {
    this.go(short ? 'attempt_night' : 'night_orum')
    this.walkT = -1
    this.emit({ kind: 'lock', on: true })
    this.emit({ kind: 'sora', spot: 'stop' })
    this.emit({ kind: 'orum', action: 'appear', short })
    this.say(short ? 'orum_appear_short' : 'orum_appear')
  }

  private swallow(): void {
    this.go('swallow')
    this.emit({ kind: 'debris', active: false })
    this.emit({ kind: 'confront', on: false })
    this.emit({ kind: 'orum', action: 'swallow' })
    this.emit({ kind: 'lock', on: true })
    this.say('orum_swallow')
  }

  private onFx(fx: IntroFx): boolean {
    if (fx === 'flashback' && this.step === 'opening') {
      this.go('go_booth')
      this.emit({ kind: 'lock', on: false })
      this.say('opening_mono')
      return true
    }
    if (fx === 'night' && this.step === 'night') {
      if (this.current) {
        this.startEmergence(true)
      } else {
        this.go('night_walk')
        this.emit({ kind: 'lock', on: false })
        this.emit({ kind: 'sora', spot: 'follow' })
        this.walkT = 0
        this.say('night_walk')
      }
      return true
    }
    if (fx === 'loop' && this.step === 'loop') {
      this.greeted = false
      this.cancelAsked = false
      this.emit({ kind: 'evacuate', on: false })
      this.go('wake')
      if (this.loopCount <= 1 && !this.current) {
        this.say('loop_wake')
      } else {
        const realize = this.current === 'cancel' ? this.lines('realize_cancel') : []
        const done = this.current
        if (done) {
          this.attempts.add(done)
          this.emit({ kind: 'flag', name: ATTEMPT_FLAG[done] })
        }
        this.current = null
        const tail = !this.despaired && this.attempts.size >= ATTEMPTS_FOR_DESPAIR ? this.lines('despair') : []
        if (tail.length) this.despaired = true
        this.emitAttemptsUi()
        // 気づきと、2 つ目のあとの「変えられないの……？」を同じ会話に続ける
        this.say('wake_again', [], [...realize, ...tail])
      }
      return true
    }
    if (fx === 'whiteout' && this.step === 'escape_walk') {
      this.whiteoutBusy = false
      this.say('escape_fail')
      return true
    }
    if (fx === 'qr' && this.step === 'records' && this.pendingRecord) {
      const rec = this.pendingRecord
      this.pendingRecord = null
      this.qrBusy = false
      this.recordsSeen.add(rec)
      if (rec === 'namba2026') {
        this.go('resonance')
        this.emit({ kind: 'lock', on: true })
        this.emit({ kind: 'ore_glow', level: 2.6 })
        this.emit({ kind: 'rift', open: true })
        this.say('ido_resonance')
      } else {
        this.say(rec === 'expo1970' ? 'qr_expo1970' : 'qr_edo1726')
      }
      return true
    }
    return false
  }

  private onDialogueDone(key: string): boolean {
    if (this.pendingDialogue !== key) return false
    this.pendingDialogue = null
    switch (key) {
      case 'ch1_ido':
        if (this.step === 'talk_sora') {
          this.emit({ kind: 'drop_arm' })
          this.say('ch1_arm')
        }
        return true
      case 'ch1_arm':
        if (this.step === 'talk_sora') {
          this.emit({ kind: 'flag', name: 'festival_morning_seen' })
          this.go('fetch_lens')
          this.focus('lens', 'lens_ask')
        }
        return true
      case 'lens_install':
        if (this.step === 'deliver_lens') {
          this.emit({ kind: 'flag', name: 'lens_installed' })
          this.say('antenna_ask')
        }
        return true
      case 'antenna_ask':
        if (this.step === 'deliver_lens') {
          this.go('climb_hook')
          this.focus('hook', 'tut_hook')
          this.emit({ kind: 'save' })
        }
        return true
      case 'promise':
        if (this.step === 'return_booth') {
          this.emit({ kind: 'lock', on: true })
          this.go('night')
          this.emit({ kind: 'transition', to: 'night', spawn: 'night_plaza', sora: 'night' })
        }
        return true
      case 'opening_mono':
        if (this.step === 'go_booth' || this.step === 'talk_sora') this.startMorning()
        return true
      case 'night_walk':
        return true
      case 'orum_appear':
        if (this.step === 'night_orum') {
          this.emit({ kind: 'flag', name: 'orum_seen' })
          this.go('evade')
          this.evadeTime = 0
          this.debrisHits = 0
          this.emit({ kind: 'lock', on: false })
          this.emit({ kind: 'debris', active: true })
          this.emit({ kind: 'sora', spot: 'escape' })
        }
        return true
      case 'orum_appear_short':
        if (this.step === 'attempt_night') this.attemptNightBeat()
        return true
      case 'alarm_night':
      case 'cancel_night':
      case 'escape_night':
      case 'confront_fail':
        if (this.step === 'attempt_night' || this.step === 'confront') this.swallow()
        return true
      case 'orum_swallow':
        if (this.step === 'swallow') {
          this.go('loop')
          this.loopCount++
          this.emit({ kind: 'loop_count', value: this.loopCount })
          this.emit({ kind: 'loop_fx', spawn: 'loop_morning', sora: 'booth' })
        }
        return true
      case 'loop_wake':
        if (this.step === 'wake') {
          this.go('loop_cues')
          this.startMorning()
        }
        return true
      case 'wake_again':
        if (this.step === 'wake') {
          this.go('attempts')
          this.startMorning()
          this.emit({ kind: 'save' })
        }
        return true
      case 'loop_help':
        if (this.step === 'loop_cues') {
          this.emit({ kind: 'arm_catch' })
          this.say('loop_catch')
        }
        return true
      case 'loop_catch':
        if (this.step === 'loop_cues') {
          this.emit({ kind: 'flag', name: 'loop_noticed' })
          this.go('attempts')
          this.emit({ kind: 'save' })
        }
        return true
      case 'greet_then_menu':
        if (this.step === 'attempts') this.openMenu()
        return true
      case 'try_cancel_hq':
        if (this.step === 'attempts' && !this.current) {
          this.cancelAsked = true
          this.emitAttemptsUi()
        }
        return true
      case 'try_cancel_sora':
        if (this.step === 'attempts' && this.cancelAsked) {
          this.current = 'cancel'
          this.cancelAsked = false
          this.emitAttemptsUi()
          this.startAttemptNight()
        }
        return true
      case 'try_alarm':
      case 'try_confront':
        if (this.step === 'attempts' && this.current) this.startAttemptNight()
        return true
      case 'try_escape':
        if (this.step === 'attempts' && this.current === 'escape') {
          this.go('escape_walk')
          this.emit({ kind: 'sora', spot: 'follow' })
        }
        return true
      case 'escape_fail':
        if (this.step === 'escape_walk') this.startAttemptNight()
        return true
      case 'confide':
        if (this.step === 'confide') {
          this.emit({ kind: 'flag', name: 'confided' })
          this.emit({ kind: 'exhibit', mode: 'idle' })
          this.emit({ kind: 'sora', spot: 'exhibit' })
          this.say('stones_intro')
        }
        return true
      case 'stones_intro':
        if (this.step === 'confide') {
          this.go('records')
          this.emit({ kind: 'save' })
        }
        return true
      case 'qr_expo1970':
      case 'qr_edo1726':
        if (this.step === 'records') this.emit({ kind: 'lock', on: false })
        return true
      case 'ido_resonance':
        if (this.step === 'resonance') {
          this.go('travel')
          this.emit({ kind: 'flag', name: 'ido_exhibit_used' })
          this.emit({ kind: 'travel', to: '2026', spawn: 'present_start', cause: 'ido_exhibit' })
          this.onRequestTravel?.('2026', 'present_start')
        }
        return true
    }
    return true
  }

  /** 試みの夜：空が裂けたあと、試みごとの一場面 → 飲み込まれる */
  private attemptNightBeat(): void {
    switch (this.current) {
      case 'confront':
        this.go('confront')
        this.confrontT = 0
        this.emit({ kind: 'lock', on: false })
        this.emit({ kind: 'confront', on: true })
        return
      case 'alarm':
        this.emit({ kind: 'city_unravel' })
        this.say('alarm_night')
        return
      case 'cancel':
        this.say('cancel_night')
        return
      case 'escape':
        this.say('escape_night')
        return
      default:
        this.swallow()
    }
  }
}
