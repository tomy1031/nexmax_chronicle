// 音楽を鳴らす（タイトル・時代ごとの曲・戦闘）。曲は audio/tracks.ts のデータを audio/theory.ts で音の並びにして、
// 少し先（LOOKAHEAD 秒）まで Web Audio に予約していく。曲の切り替えは音量を重ねて入れ替える（クロスフェード）。
// ブラウザは遊ぶ人が触るまで音を出せないので、最初のキー・タップで unlock() する（installUnlock）。
// 画面が裏に回ったら AudioContext を止める（電池と発熱のため）。音量 0 のときも止める。
import { compileTrack, stepTime, type CompiledTrack } from './theory'
import { makeImpulse, playDrum, playNote } from './synth'
import { TRACKS, type MusicId } from './tracks'
import type { MusicLevel } from '../render/quality'

export type { MusicId }

/** 設定の音量（render/quality.ts の MusicLevel：0 = 切・1 = 小・2 = 中・3 = 大）→ 出力の倍率 */
export const MUSIC_LEVEL_GAIN: Readonly<Record<MusicLevel, number>> = { 0: 0, 1: 0.32, 2: 0.6, 3: 0.95 }

/** どこまで先の音を予約しておくか（秒）と、予約を見直す間隔（ミリ秒） */
const LOOKAHEAD = 0.3
const TICK_MS = 50
/** 一時停止中の音量 */
const DUCK = 0.35

const compiled = new Map<MusicId, CompiledTrack>()
export function compiledTrack(id: MusicId): CompiledTrack {
  let c = compiled.get(id)
  if (!c) {
    c = compileTrack(TRACKS[id])
    compiled.set(id, c)
  }
  return c
}

/** 曲を鳴らす経路（パートごとの音量・左右、響きとやまびこへの送り）。ctx が OfflineAudioContext でもよい */
class Playback {
  readonly id: MusicId
  readonly c: CompiledTrack
  private readonly ctx: BaseAudioContext
  /** 曲全体の音量（フェード）。乾いた音・響き・やまびこの 3 本 */
  private readonly fades: GainNode[]
  private readonly partOut: AudioNode[] = []
  private readonly start: number
  private idx = 0
  private loop = 0
  /** これより後の音は予約しない（フェードアウト中） */
  private stopAt = Infinity

  constructor(ctx: BaseAudioContext, id: MusicId, dry: AudioNode, rev: AudioNode, dly: AudioNode, startAt: number, fadeIn: number) {
    this.ctx = ctx
    this.id = id
    this.c = compiledTrack(id)
    const mk = (to: AudioNode) => {
      const g = ctx.createGain()
      g.gain.setValueAtTime(fadeIn > 0 ? 0 : 1, startAt)
      if (fadeIn > 0) g.gain.linearRampToValueAtTime(1, startAt + fadeIn)
      g.connect(to)
      return g
    }
    this.fades = [mk(dry), mk(rev), mk(dly)]
    for (const p of this.c.track.parts) {
      const g = ctx.createGain()
      g.gain.value = p.gain
      let node: AudioNode = g
      if (p.pan) {
        const pan = ctx.createStereoPanner()
        pan.pan.value = p.pan
        g.connect(pan)
        node = pan
      }
      node.connect(this.fades[0])
      if (p.rev) {
        const s = ctx.createGain()
        s.gain.value = p.rev
        node.connect(s).connect(this.fades[1])
      }
      if (p.dly) {
        const s = ctx.createGain()
        s.gain.value = p.dly
        node.connect(s).connect(this.fades[2])
      }
      this.partOut.push(g)
    }
    this.start = startAt
  }

  /** until（秒）までの音を予約する */
  schedule(until: number, now: number): void {
    const { events, loopSteps, stepSec, track } = this.c
    if (!events.length) return
    for (let guard = 0; guard < 200000; guard++) {
      const e = events[this.idx]
      const t = this.start + this.loop * loopSteps * stepSec + stepTime(this.c, e.step)
      if (t >= until || t >= this.stopAt) return
      // 裏に回って遅れた分は飛ばす（まとめて鳴らさない）
      if (t >= now - 0.02) {
        const part = track.parts[e.part]
        const out = this.partOut[e.part]
        if (part.kind === 'drum') playDrum(this.ctx, out, part.drum, t, e.vel)
        else playNote(this.ctx, out, part.inst, t, e.len * stepSec, e.midi, e.vel)
      }
      this.idx++
      if (this.idx >= events.length) {
        this.idx = 0
        this.loop++
      }
    }
  }

  /** at 秒から sec 秒で消す。消えきる時刻を返す */
  fadeOut(at: number, sec: number): number {
    for (const f of this.fades) {
      f.gain.cancelScheduledValues(at)
      f.gain.setValueAtTime(f.gain.value, at)
      f.gain.linearRampToValueAtTime(0, at + sec)
    }
    this.stopAt = at + sec
    return at + sec
  }

  disconnect(): void {
    for (const f of this.fades) f.disconnect()
  }
}

/** 響きとやまびこと全体の音量（ctx ごとに 1 組） */
class Mixer {
  readonly dry: GainNode
  readonly rev: GainNode
  readonly dly: GainNode
  readonly delay: DelayNode
  readonly volume: GainNode
  readonly duck: GainNode

  constructor(ctx: BaseAudioContext, dest: AudioNode) {
    this.volume = ctx.createGain()
    this.duck = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -16
    comp.knee.value = 12
    comp.ratio.value = 4
    comp.attack.value = 0.005
    comp.release.value = 0.2
    this.dry = ctx.createGain()
    this.dry.connect(comp)
    // 響き：1.6 秒の残響（たたみこみ 1 個だけ）
    this.rev = ctx.createGain()
    const conv = ctx.createConvolver()
    conv.buffer = makeImpulse(ctx, 1.6, 3.2)
    const revOut = ctx.createGain()
    revOut.gain.value = 0.55
    this.rev.connect(conv).connect(revOut).connect(comp)
    // やまびこ：付点 8 分（曲のテンポで変える）。くり返すたびに高い音を削る
    this.dly = ctx.createGain()
    this.delay = ctx.createDelay(2)
    this.delay.delayTime.value = 0.375
    const fb = ctx.createGain()
    fb.gain.value = 0.33
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 2600
    this.dly.connect(this.delay)
    this.delay.connect(lp).connect(fb).connect(this.delay)
    const dlyOut = ctx.createGain()
    dlyOut.gain.value = 0.5
    lp.connect(dlyOut).connect(comp)
    comp.connect(this.duck).connect(this.volume).connect(dest)
  }

  setTempo(bpm: number, at: number): void {
    this.delay.delayTime.setTargetAtTime((60 / bpm) * 0.75, at, 0.05)
  }
}

type AudioCtor = typeof AudioContext

export class MusicPlayer {
  private ctx: AudioContext | null = null
  private mixer: Mixer | null = null
  private cur: Playback | null = null
  private readonly fading = new Set<Playback>()
  private want: MusicId | null = null
  private level: MusicLevel
  private ducked = false
  private timer: ReturnType<typeof setInterval> | null = null
  private hidden = false
  private unlocked = false

  constructor(level: MusicLevel) {
    this.level = level
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.visibilityState === 'hidden'
        this.updateRunning()
      })
    }
  }

  /** いま鳴らしたい曲 */
  get current(): MusicId | null {
    return this.want
  }

  get running(): boolean {
    return this.ctx?.state === 'running'
  }

  /**
   * キー・タップ・クリックのたびに、止まっていれば鳴らせるようにする（ブラウザの決まり）。
   * iPhone は触った瞬間（touchend）でないと再開できず、裏から戻ったときや電話の後にも止まるので、ずっと聞いておく
   */
  installUnlock(target: EventTarget = window): void {
    const fn = () => {
      // ctx があれば一度 unlock 済みなので、shouldRun は「表に出ていて音量が 0 でない」と同じ
      if (!this.ctx || (this.ctx.state !== 'running' && this.shouldRun())) this.unlock()
    }
    for (const e of ['pointerdown', 'touchend', 'keydown', 'mousedown']) target.addEventListener(e, fn, true)
  }


  /** 触った直後に呼ぶ（AudioContext を作る・再開する） */
  unlock(): void {
    const Ctor: AudioCtor | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext) : undefined
    if (!Ctor) return
    if (!this.ctx) {
      try {
        this.ctx = new Ctor({ latencyHint: 'playback' })
      } catch {
        return
      }
      this.mixer = new Mixer(this.ctx, this.ctx.destination)
      this.mixer.volume.gain.value = MUSIC_LEVEL_GAIN[this.level]
      this.mixer.duck.gain.value = this.ducked ? DUCK : 1
    }
    this.unlocked = true
    this.updateRunning()
  }

  /** 曲を切り替える（同じ曲なら何もしない）。null で消す */
  play(id: MusicId | null, fade = 1.6): void {
    if (id === this.want) return
    this.want = id
    this.switchTo(fade)
  }

  /** 音量（設定）。0 なら AudioContext ごと止める */
  setLevel(level: MusicLevel): void {
    this.level = level
    const m = this.mixer
    if (m && this.ctx) m.volume.gain.setTargetAtTime(MUSIC_LEVEL_GAIN[level], this.ctx.currentTime, 0.08)
    this.updateRunning()
  }

  /** 一時停止中は小さく */
  setDuck(on: boolean): void {
    if (on === this.ducked) return
    this.ducked = on
    if (this.mixer && this.ctx) this.mixer.duck.gain.setTargetAtTime(on ? DUCK : 1, this.ctx.currentTime, 0.12)
  }

  private shouldRun(): boolean {
    return this.unlocked && !this.hidden && this.level > 0
  }

  private updateRunning(): void {
    const ctx = this.ctx
    if (!ctx) return
    if (this.shouldRun()) {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {})
      if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS)
      // 音量 0 から戻したとき・初めて触ったときに、鳴らしたい曲を始める
      if (!this.cur && this.want) this.switchTo(0.8)
    } else {
      if (this.timer) {
        clearInterval(this.timer)
        this.timer = null
      }
      if (ctx.state === 'running') void ctx.suspend().catch(() => {})
      if (this.level === 0) {
        // 止めている間は曲を持たない（戻したときに頭から）
        this.cur?.disconnect()
        this.cur = null
        for (const p of this.fading) p.disconnect()
        this.fading.clear()
      }
    }
  }

  private switchTo(fade: number): void {
    const ctx = this.ctx
    const m = this.mixer
    if (!ctx || !m || !this.shouldRun()) return
    const now = ctx.currentTime
    const old = this.cur
    if (old) {
      const end = old.fadeOut(now, fade)
      this.fading.add(old)
      setTimeout(
        () => {
          old.disconnect()
          this.fading.delete(old)
        },
        (end - now) * 1000 + 2500,
      )
    }
    this.cur = null
    if (this.want) {
      const tr = compiledTrack(this.want)
      m.setTempo(tr.track.bpm, now)
      // 前の曲が少し引いてから入る
      this.cur = new Playback(ctx, this.want, m.dry, m.rev, m.dly, now + (old ? fade * 0.35 : 0.08), old ? fade * 0.8 : 0.6)
    }
    this.tick()
  }

  private tick(): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    this.cur?.schedule(now + LOOKAHEAD, now)
    for (const p of this.fading) p.schedule(now + LOOKAHEAD, now)
  }
}

/** 試し聴き・確かめ用：曲を seconds 秒ぶん OfflineAudioContext で書き出す */
export async function renderTrackOffline(id: MusicId, seconds: number, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate)
  const m = new Mixer(ctx, ctx.destination)
  m.volume.gain.value = MUSIC_LEVEL_GAIN[3]
  m.setTempo(TRACKS[id].bpm, 0)
  const p = new Playback(ctx, id, m.dry, m.rev, m.dly, 0.05, 0)
  // 本番と同じように少し先の分だけを予約していく（先に全部作ると、まだ鳴らない音の分まで重くなる）
  const step = 0.25
  for (let t = step; t < seconds; t += step) {
    void ctx.suspend(t).then(() => {
      p.schedule(t + LOOKAHEAD, t)
      void ctx.resume()
    })
  }
  p.schedule(LOOKAHEAD, 0)
  return ctx.startRendering()
}
