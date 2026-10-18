// 2086年 ナンバタウン「時代博覧祭」の物語の進行（状態機械）。three.js・DOM には依存しない純粋なロジック。
// 物語・裏設定 v2.3 §10 シーン2〜5、操作マニュアル v1.1 §6 チュートリアル1〜5：
//   go_booth（移動を覚える）→ talk_sora（F：祭りの朝のソラ「最新型じゃなくても、私は君と作りたい。」）
//   → fetch_lens（J：届かない部品を引き寄せる）→ climb_hook（J：金具へ飛びつく）→ swing_gap（吊り輪で途切れた回廊を渡る）
//   → night（夜へ）→ night_orum（オルム襲来）→ evade（Shift・ジャンプで落ちる破片をよける。短く、失敗しない）
//   → loop（鉱石が光って白く飛ぶ → 祭りの朝へ）→ loop_morning（ソラは同じあいさつ。覚えているのはネクマックスだけ）
//   → ido_exhibit（F：IDO 展示）→ 「NEXMAXの最初の記録／2026年・なんば」を選ぶ → ido_resonance（鉱石が反応・裂け目）
//   → travel（onRequestTravel('2026', 'arrive_from_2086')）
// シェル（ステージ）は send() で出来事を知らせ、onEffect で受け取った演出・会話・移動を実行して、終わったら知らせ返す。
import lines from './dialogue_2086.json'

export type StoryStepId =
  | 'go_booth'
  | 'talk_sora'
  | 'fetch_lens'
  | 'climb_hook'
  | 'swing_gap'
  | 'night'
  | 'night_orum'
  | 'evade'
  | 'swallow'
  | 'loop'
  | 'loop_morning'
  | 'ido_exhibit'
  | 'ido_resonance'
  | 'travel'
  | 'returned'

export const STORY_STEPS: readonly StoryStepId[] = [
  'go_booth',
  'talk_sora',
  'fetch_lens',
  'climb_hook',
  'swing_gap',
  'night',
  'night_orum',
  'evade',
  'swallow',
  'loop',
  'loop_morning',
  'ido_exhibit',
  'ido_resonance',
  'travel',
  'returned',
]

export type DialogueLine = { speaker: string; text: string }
export type DialogueTable = Readonly<Record<string, unknown>>

export type StoryZone = 'booth' | 'upper_walkway' | 'far_platform' | 'south_gate' | 'plaza_center'
export type StoryInteract = 'sora' | 'ido_exhibit' | 'parts_table'
export type StoryFx = 'night' | 'loop' | 'rift'

export type StoryEvent =
  /** プレイヤーが範囲に入った（入った瞬間だけ） */
  | { kind: 'zone'; zone: StoryZone }
  /** F で話す・調べる */
  | { kind: 'interact'; target: StoryInteract }
  /** NMClaw の出来事（player/clawLogic の WireEvent の kind と対象の ID） */
  | { kind: 'claw'; event: ClawEventKind; targetId: string }
  /** 会話が終わった */
  | { kind: 'dialogue_done'; key: string }
  /** 選択肢を選んだ */
  | { kind: 'choice'; id: string; option: string }
  /** 演出が終わった（夜への暗転・ループ・裂け目） */
  | { kind: 'fx_done'; fx: StoryFx }
  /** 落ちてきた破片に当たった（軽くよろけるだけ） */
  | { kind: 'debris_hit' }
  | { kind: 'tick'; dt: number }

/** player/clawLogic の WireEvent['kind'] と同じ（ここでは型だけ写す） */
export type ClawEventKind = 'fired' | 'missed' | 'connected' | 'object_arrived' | 'dropped' | 'arrived' | 'detached' | 'released' | 'retracted'

export type ChoiceOption = { id: string; label: string }

export type StoryFlag = 'festival_morning_seen' | 'orum_seen' | 'ido_exhibit_used'

export type SoraSpot = 'booth' | 'exhibit' | 'night' | 'gate'

export type StoryEffect =
  | { kind: 'step'; step: StoryStepId }
  /** 会話を 1 行ずつ出す。終わったら dialogue_done を送る */
  | { kind: 'dialogue'; key: string; lines: readonly DialogueLine[] }
  /** 1 行だけの台詞（送り返し不要） */
  | { kind: 'say'; speaker: string; text: string }
  /** 操作を止める／戻す */
  | { kind: 'lock'; on: boolean }
  /** 暗転して時間帯を変え、プレイヤーとソラを並べ直す。終わったら fx_done('night') */
  | { kind: 'transition'; to: 'night'; spawn: string; sora: SoraSpot }
  | { kind: 'sora'; spot: SoraSpot | 'escape' }
  /** オルム：appear＝出現（数秒かけて広がる）／swallow＝空いっぱいに広がる */
  | { kind: 'orum'; action: 'appear' | 'swallow' }
  | { kind: 'debris'; active: boolean }
  /** ループの演出（鉱石 → 白 → 逆流 → 朝）。白の瞬間に morning＋spawn＋ソラ booth。終わったら fx_done('loop') */
  | { kind: 'loop_fx'; spawn: string; sora: SoraSpot }
  | { kind: 'ore_glow'; level: number }
  /** IDO の展示画面を裂け目へ（数秒かけて開く）。開ききったら fx_done('rift')（任意） */
  | { kind: 'rift'; open: boolean }
  | { kind: 'choice'; id: string; prompt: string; options: readonly ChoiceOption[] }
  /** 古い腕のパーツを落とす小さな演出 */
  | { kind: 'drop_arm' }
  | { kind: 'flag'; name: StoryFlag }
  | { kind: 'loop_count'; value: number }
  /** 時空移動の要求（シェルの travel へ） */
  | { kind: 'travel'; to: '2026'; spawn: 'arrive_from_2086'; cause: 'ido_exhibit' }

export type Objective = { title: string; sub: string }
export type KeyHint = { key: string; label: string }

/** IDO 展示の記録の選択肢 */
export const IDO_CHOICE = {
  id: 'ido_record',
  prompt: 'IDO 歴史記録 ― どの記録を体験する？',
  options: [
    { id: 'osaka1726', label: '1726年・大坂 ― 仕掛け横丁のうわさ' },
    { id: 'expo1970', label: '1970年・大阪万博' },
    { id: 'nexmax2026', label: 'NEXMAXの最初の記録／2026年・なんば' },
  ],
  correct: 'nexmax2026',
} as const

/** 夜の避難が長引いたら、失敗にせずループへ進める（秒） */
export const EVADE_TIMEOUT = 40

/** ステップごとの目標（HUD 左上） */
export const OBJECTIVES: Record<StoryStepId, Objective> = {
  go_booth: { title: 'ソラの IDO 展示ブースへ行こう', sub: 'WASD：移動　↑↓←→：カメラ　Space：ジャンプ' },
  talk_sora: { title: 'ソラに話しかけよう', sub: 'ソラの近くで F：話す' },
  fetch_lens: { title: '共鳴レンズのケースを取ってあげよう', sub: '箱の山の一番上を狙って J：つかむ' },
  climb_hook: { title: '上の回廊へ上がろう', sub: '回廊の縁の金具を狙って J：飛びつく' },
  swing_gap: { title: '光る輪にぶら下がって、向こうの回廊へ渡ろう', sub: 'アーチの輪を狙って J → WASD でブランコのようにこぐ → Space で飛び移る' },
  night: { title: '夜の時代博覧祭', sub: '' },
  night_orum: { title: '夜の時代博覧祭', sub: '……空のようすがおかしい' },
  evade: { title: 'ソラと南の避難ゲートへ逃げよう', sub: '赤い輪に破片が落ちる　Shift：ダッシュ　Space：ジャンプ' },
  swallow: { title: 'ソラを守れ', sub: '' },
  loop: { title: '', sub: '' },
  loop_morning: { title: 'ソラのところへ行こう', sub: 'さっきと同じ朝……？' },
  ido_exhibit: { title: 'IDO 展示で自分の過去を調べよう', sub: '展示のリングの前で F：調べる' },
  ido_resonance: { title: '……鉱石が反応している！', sub: '' },
  travel: { title: '光の裂け目の向こうへ', sub: '' },
  returned: { title: 'ソラに会いに行こう', sub: '時代博覧祭の IDO 展示へ' },
}

/** ステップごとのキー案内（シェルの NMClaw の案内が無いときに出す） */
export const STEP_HINTS: Record<StoryStepId, KeyHint[]> = {
  go_booth: [
    { key: 'WASD', label: '移動' },
    { key: '↑↓←→', label: 'カメラ' },
    { key: 'Space', label: 'ジャンプ' },
  ],
  talk_sora: [{ key: 'F', label: '話す' }],
  fetch_lens: [{ key: 'J', label: 'つかむ' }],
  climb_hook: [{ key: 'J', label: '飛びつく' }],
  swing_gap: [
    { key: 'J', label: '輪にぶら下がる' },
    { key: 'WASD', label: 'こいで揺らす' },
    { key: 'Space', label: '飛び移る' },
  ],
  night: [],
  night_orum: [],
  evade: [
    { key: 'Shift', label: 'ダッシュ' },
    { key: 'Space', label: 'ジャンプ' },
  ],
  swallow: [],
  loop: [],
  loop_morning: [{ key: 'F', label: '話す' }],
  ido_exhibit: [{ key: 'F', label: '調べる' }],
  ido_resonance: [],
  travel: [],
  returned: [{ key: 'F', label: '話す' }],
}

/** 保存されたフラグから始めるステップ（ロード後に同じところから） */
export function startStepFromFlags(f: (name: string) => boolean): StoryStepId {
  if (f('ido_exhibit_used')) return 'returned'
  if (f('orum_seen')) return 'loop_morning'
  if (f('festival_morning_seen')) return 'fetch_lens'
  return 'go_booth'
}

/** ステップを始めるときの到着地点 */
export function spawnForStep(step: StoryStepId): string {
  switch (step) {
    case 'loop_morning':
    case 'ido_exhibit':
      return 'loop_morning'
    case 'returned':
      return 'arrive_from_2026'
    case 'night_orum':
    case 'evade':
      return 'night_plaza'
    case 'climb_hook':
      return 'hook'
    case 'swing_gap':
      return 'walkway'
    default:
      return 'start'
  }
}

export type StoryOptions = {
  start?: StoryStepId
  /** セリフの表（既定は dialogue_2086.json） */
  table?: DialogueTable
  /** ループした回数（StoryState.loop_count） */
  loopCount?: number
}

export class Future2086Story {
  step: StoryStepId
  loopCount: number
  /** 夜の避難の経過（秒） */
  evadeTime = 0
  debrisHits = 0
  /** 演出・会話・移動の要求（シェルが実行する） */
  onEffect: ((e: StoryEffect) => void) | null = null
  /** 時空移動の要求（シェルの travel へつなぐ） */
  onRequestTravel: ((era: '2026', spawn: 'arrive_from_2086') => void) | null = null
  private readonly table: DialogueTable
  /** いま再生を待っている会話のキー */
  private pendingDialogue: string | null = null
  private choiceOpen = false
  private hitBark = 0
  private readonly queue: StoryEffect[] = []
  private keepQueue = false

  constructor(o: StoryOptions = {}) {
    this.step = o.start ?? 'go_booth'
    this.table = o.table ?? (lines as DialogueTable)
    this.loopCount = o.loopCount ?? 0
  }

  /** セリフの列（無ければ空） */
  lines(key: string): readonly DialogueLine[] {
    const v = this.table[key]
    return Array.isArray(v) ? (v as DialogueLine[]) : []
  }

  /** テスト用：出した演出をためる（onEffect の代わりに drain() で取り出す） */
  record(on = true): this {
    this.keepQueue = on
    return this
  }

  drain(): StoryEffect[] {
    return this.queue.splice(0, this.queue.length)
  }

  objective(): Objective {
    return OBJECTIVES[this.step]
  }

  hints(): KeyHint[] {
    return STEP_HINTS[this.step]
  }

  /** いま F で反応する相手か（キー案内「F：話す」を出すかどうか） */
  canInteract(target: StoryInteract): boolean {
    if (this.pendingDialogue || this.choiceOpen) return false
    if (target === 'sora') return !['night', 'night_orum', 'evade', 'swallow', 'loop', 'ido_resonance', 'travel'].includes(this.step)
    if (target === 'ido_exhibit') return this.step === 'ido_exhibit'
    return target === 'parts_table' && (this.step === 'talk_sora' || this.step === 'fetch_lens')
  }

  /** 会話・演出を待っているか（シェルは操作を止めてよい） */
  get busy(): boolean {
    return this.pendingDialogue !== null || this.choiceOpen || this.step === 'night' || this.step === 'loop' || this.step === 'ido_resonance' || this.step === 'swallow'
  }

  /** ステップの開始時の演出（ロード直後・ステージ開始時に 1 回） */
  begin(): void {
    this.emit({ kind: 'step', step: this.step })
    if (this.step === 'loop_morning') this.say('loop_wake')
    if (this.step === 'returned') {
      this.emit({ kind: 'sora', spot: 'exhibit' })
    } else if (this.step === 'ido_exhibit') this.emit({ kind: 'sora', spot: 'exhibit' })
    else this.emit({ kind: 'sora', spot: 'booth' })
  }

  /** 出来事を知らせる。F の interact は処理したら true */
  send(ev: StoryEvent): boolean {
    switch (ev.kind) {
      case 'tick':
        return this.tick(ev.dt)
      case 'dialogue_done':
        return this.onDialogueDone(ev.key)
      case 'zone':
        return this.onZone(ev.zone)
      case 'interact':
        return this.onInteract(ev.target)
      case 'claw':
        return this.onClaw(ev.event, ev.targetId)
      case 'choice':
        return this.onChoice(ev.id, ev.option)
      case 'fx_done':
        return this.onFx(ev.fx)
      case 'debris_hit':
        return this.onHit()
    }
  }

  // ---------------------------------------------------------------- 内部

  private emit(e: StoryEffect): void {
    if (this.keepQueue) this.queue.push(e)
    this.onEffect?.(e)
  }

  private go(step: StoryStepId): void {
    this.step = step
    this.emit({ kind: 'step', step })
  }

  private say(key: string): void {
    const l = this.lines(key)
    if (!l.length) return
    this.pendingDialogue = key
    this.emit({ kind: 'dialogue', key, lines: l })
  }

  private tick(dt: number): boolean {
    if (this.step === 'evade' && !this.pendingDialogue) {
      this.evadeTime += dt
      this.hitBark = Math.max(0, this.hitBark - dt)
      if (this.evadeTime >= EVADE_TIMEOUT) this.reachShelter()
    }
    return false
  }

  private onZone(zone: StoryZone): boolean {
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
          this.go('night')
          this.say('swing_done')
          return true
        }
        break
      case 'evade':
        if (zone === 'south_gate') {
          this.reachShelter()
          return true
        }
        break
    }
    return false
  }

  private reachWalkway(): boolean {
    if (this.step !== 'climb_hook') return false
    this.go('swing_gap')
    this.say('walkway_up')
    return true
  }

  private reachShelter(): void {
    if (this.step !== 'evade') return
    this.go('swallow')
    this.emit({ kind: 'debris', active: false })
    this.emit({ kind: 'orum', action: 'swallow' })
    this.emit({ kind: 'lock', on: true })
    this.say('orum_swallow')
  }

  private onInteract(target: StoryInteract): boolean {
    if (!this.canInteract(target)) return false
    if (target === 'parts_table') {
      this.emit({ kind: 'say', speaker: 'ネクマックス', text: '工具と、水色の古い腕のパーツ……ぼくの予備かな。' })
      return true
    }
    if (target === 'ido_exhibit') {
      this.choiceOpen = true
      this.emit({ kind: 'choice', id: IDO_CHOICE.id, prompt: IDO_CHOICE.prompt, options: IDO_CHOICE.options })
      return true
    }
    // ソラ
    switch (this.step) {
      case 'go_booth':
      case 'talk_sora':
        this.step = 'talk_sora'
        this.emit({ kind: 'drop_arm' })
        this.say('prep_talk')
        return true
      case 'fetch_lens':
        this.say('sora_hint_lens')
        return true
      case 'climb_hook':
        this.say('sora_hint_hook')
        return true
      case 'swing_gap':
        this.say('sora_hint_swing')
        return true
      case 'loop_morning':
        this.say('loop_greet')
        return true
      case 'ido_exhibit':
        this.say('sora_hint_exhibit')
        return true
      case 'returned':
        this.say('return_sora')
        return true
    }
    this.say('sora_idle')
    return true
  }

  private onClaw(event: ClawEventKind, targetId: string): boolean {
    // 共鳴レンズのケースが手元に届いた（つないだ瞬間でも進める：引き寄せは失敗しないので）
    if (this.step === 'fetch_lens' && targetId === 'ido_lens' && (event === 'object_arrived' || event === 'connected')) {
      this.go('climb_hook')
      this.say('lens_thanks')
      return true
    }
    if (this.step === 'climb_hook' && targetId === 'walkway_hook' && event === 'arrived') return this.reachWalkway()
    return false
  }

  private onChoice(id: string, option: string): boolean {
    if (id !== IDO_CHOICE.id || this.step !== 'ido_exhibit') return false
    this.choiceOpen = false
    if (option !== IDO_CHOICE.correct) {
      this.say('ido_other')
      return true
    }
    this.go('ido_resonance')
    this.emit({ kind: 'lock', on: true })
    this.emit({ kind: 'ore_glow', level: 2.6 })
    this.emit({ kind: 'rift', open: true })
    this.say('ido_resonance')
    return true
  }

  private onHit(): boolean {
    if (this.step !== 'evade') return false
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

  private onFx(fx: StoryFx): boolean {
    if (fx === 'night' && this.step === 'night') {
      this.go('night_orum')
      this.emit({ kind: 'orum', action: 'appear' })
      this.say('orum_appear')
      return true
    }
    if (fx === 'loop' && this.step === 'loop') {
      this.go('loop_morning')
      this.emit({ kind: 'lock', on: false })
      this.say('loop_wake')
      return true
    }
    return false
  }

  private onDialogueDone(key: string): boolean {
    if (this.pendingDialogue !== key) return false
    this.pendingDialogue = null
    switch (key) {
      case 'prep_talk':
        if (this.step === 'talk_sora') {
          this.emit({ kind: 'flag', name: 'festival_morning_seen' })
          this.go('fetch_lens')
        }
        return true
      case 'swing_done':
        if (this.step === 'night') {
          this.emit({ kind: 'lock', on: true })
          this.emit({ kind: 'transition', to: 'night', spawn: 'night_plaza', sora: 'night' })
        }
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
      case 'orum_swallow':
        if (this.step === 'swallow') {
          this.go('loop')
          this.loopCount++
          this.emit({ kind: 'loop_count', value: this.loopCount })
          this.emit({ kind: 'loop_fx', spawn: 'loop_morning', sora: 'booth' })
        }
        return true
      case 'loop_greet':
        if (this.step === 'loop_morning') {
          this.go('ido_exhibit')
          this.emit({ kind: 'sora', spot: 'exhibit' })
        }
        return true
      case 'ido_resonance':
        if (this.step === 'ido_resonance') {
          this.go('travel')
          this.emit({ kind: 'flag', name: 'ido_exhibit_used' })
          this.emit({ kind: 'travel', to: '2026', spawn: 'arrive_from_2086', cause: 'ido_exhibit' })
          this.onRequestTravel?.('2026', 'arrive_from_2086')
        }
        return true
    }
    return true
  }
}
