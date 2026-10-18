// 夜の広場に「正体不明の存在」（中身はオルム。まだ誰も名前を知らない）が空間を裂いて出てくる演出の進行（約 16 秒。最初のソラの一言のあと、裂けてからは約 12.5 秒）。
//   0.0  操作を止め、ソラの一言の間にカメラが夜の広場から空へゆっくり見上げる（focusShots2086 の sky）
//   3.4〜5.8  空に光る亀裂が走り、ガラスのように広がる（閃光と揺れ）
//   6.6  破片が抜け落ちて暗い虚無が開き、空の色が一気に紫・深紅へ（強い閃光と揺れ）
//   6.9〜10.3  黒い環が虚無の中から押し出て広がる（orum.ts の setShow）。遠くの街並みがほどけ始める
//   14.2 カメラがネクマックスへ戻り始め、16.0 で終わる → 避難（evade）へ
// 会話は物語の dialogue（orum_appear）の行に "cue" を付けると、その合図の時刻から流す（下の EMERGENCE_CUES）。
// cue の無い行は前の行に続けて流す。行を差し替えても cue さえ合わせれば同期する。
import type * as THREE from 'three'
import type { CineShot, StageRuntime } from '../../game/stage'
import type { DialogueLine } from './future2086Story'
import type { OrumParts } from './orum'
import type { SkyTear } from './skyTear2086'

/** 会話の行に付けられる合図（dialogue_2086.json の "cue"） */
export type CueLine = DialogueLine & { cue?: string }

/** 合図の時刻（秒） */
export const EMERGENCE_CUES: Record<string, number> = {
  calm: 0,
  crack: 3.6,
  emerge: 6.9,
  alarm: 7.0,
  spread: 11.8,
  return: 14.2,
}

/** 演出の時刻（秒） */
export const EMERGENCE_TIME = {
  cracks: [3.4, 4.2, 5.0, 5.8] as const,
  crackLevels: [0.16, 0.45, 0.74, 1.0] as const,
  open: 6.6,
  emerge: 6.9,
  emergeDur: 3.4,
  /** 遠くの街並み・環の中の明日の街がほどけ始める */
  unravel: 8.4,
  release: 14.2,
  end: 16.0,
}

/** 演出の後に避難中も続ける値（アダプタの orumAnim 'appear' の t = 5 と同じ） */
export const EMERGENCE_AFTER = { tomorrow: 1 - 5 / 14, dissolve: 5 / 22 }

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const easeOutCubic = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)

/** 時刻 t の値（純粋な計算：テストしやすいように外に出す） */
export function emergenceAt(t: number): { crack: number; open: number; flash: number; sky: number; show: number; tomorrow: number; dissolve: number } {
  const T = EMERGENCE_TIME
  let crack = 0
  for (let i = 0; i < T.cracks.length; i++) {
    const prev = i === 0 ? 0 : T.crackLevels[i - 1]
    if (t >= T.cracks[i]) crack = prev + (T.crackLevels[i] - prev) * easeOutCubic((t - T.cracks[i]) / 0.4)
  }
  if (t >= T.open) crack = Math.min(1.15, 1 + (t - T.open) * 0.04)
  let flash = 0
  const pulses: Array<[number, number]> = [...T.cracks.map((c, i): [number, number] => [c, [0.55, 0.45, 0.6, 0.55][i]]), [T.open, 1.25]]
  for (const [te, s] of pulses) if (t >= te) flash += s * Math.exp(-(t - te) * 6.5)
  const open = smooth((t - T.open) / 0.9)
  const sky = smooth((t - T.open) / 0.45)
  const show = t < T.emerge ? 0 : easeOutCubic((t - T.emerge) / T.emergeDur)
  const late = clamp01((t - T.unravel) / (T.end - T.unravel))
  return { crack, open, flash, sky, show, tomorrow: 1 - (1 - EMERGENCE_AFTER.tomorrow) * late, dissolve: EMERGENCE_AFTER.dissolve * clamp01((t - T.emerge) / (T.end - T.emerge)) }
}

/** 会話の行を合図ごとのまとまりに分ける（先頭に cue が無ければ 'calm' から） */
export function splitByCue(lines: readonly CueLine[]): Array<{ cue: string; lines: DialogueLine[] }> {
  const out: Array<{ cue: string; lines: DialogueLine[] }> = []
  for (const l of lines) {
    const line: DialogueLine = { speaker: l.speaker, text: l.text }
    if (l.cue || out.length === 0) out.push({ cue: l.cue ?? 'calm', lines: [line] })
    else out[out.length - 1].lines.push(line)
  }
  return out
}

export type EmergenceDeps = {
  rt: StageRuntime
  orum: OrumParts
  tear: SkyTear
  /** focusShots2086 の sky（中身の Vector3 は演出中に動かす） */
  shot: CineShot
  /** 短い版（2 回目以降の夜）：時間を 0.7 倍に */
  short?: boolean
}

export class EmergenceSequence {
  private readonly d: EmergenceDeps
  private t = 0
  private readonly speed: number
  private chunks: Array<{ cue: string; lines: DialogueLine[] }> = []
  private chunkIdx = 0
  private chunkPlaying = false
  private dialogueDone: (() => void) | null = null
  private camDone = false
  private released = false
  private shakeIdx = 0
  private finished = false
  /** 終わったとき（カメラが戻り、会話も流し終えた） */
  onDone: (() => void) | null = null

  constructor(d: EmergenceDeps) {
    this.d = d
    this.speed = d.short ? 1 / 0.7 : 1
    d.orum.setShow(0)
    d.orum.setTomorrow(1)
    d.orum.setDissolve(0)
    d.tear.reset()
    void d.rt.cinematic(d.shot).then(() => {
      this.camDone = true
    })
  }

  get playing(): boolean {
    return !this.finished
  }

  get time(): number {
    return this.t
  }

  /** 物語の会話（cue 付き）を演出に合わせて流す。流し終えたら done */
  attachDialogue(lines: readonly CueLine[], done: () => void): void {
    this.chunks = splitByCue(lines)
    this.chunkIdx = 0
    this.chunkPlaying = false
    this.dialogueDone = done
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.finished) return
    this.t += dt * this.speed
    const t = this.t
    const T = EMERGENCE_TIME
    const s = emergenceAt(t)
    const { tear, orum, rt } = this.d
    tear.setCrack(s.crack)
    tear.setOpen(s.open)
    tear.setFlash(s.flash)
    tear.update(camera)
    if (s.sky > 0 && tear.invaded < 1) tear.setInvaded(s.sky, { scene: rt.scene, sky: rt.sky, sun: rt.sun.sun, hemi: rt.sun.hemi, post: rt.post })
    orum.setShow(s.show)
    orum.setTomorrow(s.tomorrow)
    orum.setDissolve(s.dissolve)
    // 揺れ（亀裂のたびに、開く瞬間は強く）
    const hits = [...T.cracks, T.open]
    const amps = [0.35, 0.4, 0.5, 0.5, 1.1]
    while (this.shakeIdx < hits.length && t >= hits[this.shakeIdx]) {
      rt.shake(amps[this.shakeIdx])
      this.shakeIdx++
    }
    // 虚無が開いてからは低い地鳴りの揺れを続ける
    this.d.shot.shake = t >= T.open ? 0.22 * (1 - clamp01((t - T.release) / 1.5)) : 0
    if (!this.released && t >= T.release) {
      this.released = true
      rt.endCinematic()
    }
    // 会話
    if (this.dialogueDone && !this.chunkPlaying) {
      const c = this.chunks[this.chunkIdx]
      if (!c) {
        const fin = this.dialogueDone
        this.dialogueDone = null
        fin()
      } else if (t >= (EMERGENCE_CUES[c.cue] ?? 0)) {
        this.chunkPlaying = true
        void rt.dialogue(c.lines).then(() => {
          this.chunkPlaying = false
          this.chunkIdx++
        })
      }
    }
    if (t >= T.end && this.camDone && !this.dialogueDone) {
      this.finished = true
      tear.setFlash(0)
      tear.update(camera)
      this.onDone?.()
    }
  }

  /** 打ち切る（ステージの解放・ループのとき） */
  cancel(): void {
    this.finished = true
    this.dialogueDone = null
    this.d.tear.setFlash(0)
  }
}
