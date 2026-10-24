// 年代ダイヤルの音（Web Audio で、その場で作る短い音。ファイルは使わない）。
// カチ（目もりを 1 つこえるたび）・コチ、コチ（ネクマックスの石の音。目当ての年に近いほど速く・高く）・
// ぴったり（キラン）・まだ（ぶぶ）・この年へ行く（上がる 3 音）。
// 音量は設定の「音楽」の大きさに合わせる（切なら鳴らさない）。ダイヤルを開いている間だけ使い、dispose で閉じる。
import { MUSIC_LEVEL_GAIN } from '../../../audio/music'
import { loadSavedPrefs, parsePrefs } from '../../../render/quality'

type Ctor = typeof AudioContext

export class DialSound {
  private ctx: AudioContext | null = null
  private out: GainNode | null = null
  private lastClick = 0
  private kochiT = 0
  private kochiFlip = false

  /** 開いたとき・触ったときに呼ぶ（AudioContext を作る・止まっていれば鳴らせるようにする） */
  wake(): void {
    const level = parsePrefs(loadSavedPrefs()).music ?? 2
    const vol = MUSIC_LEVEL_GAIN[level] * 0.55
    if (vol <= 0) {
      if (this.out) this.out.gain.value = 0
      return
    }
    if (!this.ctx) {
      const C: Ctor | undefined = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext) : undefined
      if (!C) return
      try {
        this.ctx = new C()
      } catch {
        return
      }
      this.out = this.ctx.createGain()
      this.out.connect(this.ctx.destination)
    }
    if (this.out) this.out.gain.value = vol
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined)
  }

  /** カチ（目もりを 1 つこえた）。こまかく続くときは間引く */
  click(): void {
    const c = this.live()
    if (!c) return
    const now = c.currentTime
    if (now - this.lastClick < 0.045) return
    this.lastClick = now
    this.blip('square', 2300, 1700, now, 0.028, 0.09)
  }

  /**
   * 石の音（毎フレーム呼ぶ）：near 0..1 で、コチ、コチの間かくが 1.0 秒 → 0.17 秒、音が高くなる。
   * locked のときは、ゆっくり大きく。鳴らす時が来たら true（音が切でも。画面の石の脈に使う）
   */
  tick(dt: number, near: number, locked: boolean): boolean {
    this.kochiT -= dt
    if (this.kochiT > 0) return false
    this.kochiT = locked ? 0.42 : 1.0 - 0.83 * near
    this.kochiFlip = !this.kochiFlip
    const c = this.live()
    if (!c) return true
    const f = (this.kochiFlip ? 880 : 1180) * (1 + near * 0.35)
    this.blip('triangle', f, f * 0.72, c.currentTime, 0.07, 0.16 + near * 0.12)
    return true
  }

  /** ぴったり（キラン） */
  lock(): void {
    const c = this.live()
    if (!c) return
    const t = c.currentTime
    this.blip('square', 2600, 1900, t, 0.03, 0.12)
    this.bell(1318.5, t + 0.03, 0.7, 0.22)
    this.bell(1975.5, t + 0.12, 0.8, 0.18)
  }

  /** まだ合っていないのに決めようとした（ぶぶ） */
  buzz(): void {
    const c = this.live()
    if (!c) return
    const t = c.currentTime
    this.blip('square', 196, 180, t, 0.12, 0.08)
    this.blip('square', 196, 180, t + 0.16, 0.12, 0.08)
  }

  /** この年へ行く（上がる 3 音） */
  go(): void {
    const c = this.live()
    if (!c) return
    const t = c.currentTime
    ;[1046.5, 1318.5, 1568].forEach((f, i) => this.bell(f, t + i * 0.09, 0.5, 0.2))
  }

  dispose(): void {
    void this.ctx?.close().catch(() => undefined)
    this.ctx = null
    this.out = null
  }

  private live(): AudioContext | null {
    const c = this.ctx
    return c && c.state === 'running' && this.out && this.out.gain.value > 0 ? c : null
  }

  /** 短い音（f0 → f1 へ下がる。dur 秒で消える） */
  private blip(type: OscillatorType, f0: number, f1: number, t: number, dur: number, vol: number): void {
    const c = this.ctx
    const out = this.out
    if (!c || !out) return
    const o = c.createOscillator()
    const g = c.createGain()
    o.type = type
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  /** すんだ鐘の音（正弦波＋少し上の倍音） */
  private bell(f: number, t: number, dur: number, vol: number): void {
    const c = this.ctx
    const out = this.out
    if (!c || !out) return
    for (const [mul, v] of [
      [1, vol],
      [2.01, vol * 0.3],
    ] as const) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(f * mul, t)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(v, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
      o.connect(g).connect(out)
      o.start(t)
      o.stop(t + dur + 0.05)
    }
  }
}
