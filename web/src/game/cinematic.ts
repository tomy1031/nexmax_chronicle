// カメラの演出（シェルのカメラディレクター）。ステージは rt.cinematic(shot) で「ここを見せて」と頼むだけで、
// プレイのカメラ（CameraRig）の姿勢から shot の姿勢へゆっくり移り（位置は補間・向きは slerp）、保持して、また戻る。
// 毎フレーム CameraRig が出した姿勢を土台に混ぜるので、始まりと終わりでカメラが飛ばない。
// ここは描画・DOM に依存しない（THREE の数学だけ）。表示（目印・上下の黒帯）は cineMarker.ts と game.ts。
import * as THREE from 'three'

/** ショットの中で見せる目印（光る輪＋光の柱＋名前の札） */
export type CineMarker = {
  pos: THREE.Vector3
  label: string
  /** 輪と柱の色（既定は水色） */
  color?: THREE.ColorRepresentation
}

/**
 * カメラのショット。look・from・lookTo・fromTo は毎フレーム読むので、ステージが中身を動かしてもよい。
 * 時間：inSec で寄って、hold だけ保持（その間に lookTo・fromTo へゆっくりパン）、outSec でプレイのカメラへ戻る。
 */
export type CineShot = {
  /** 見せる点 */
  look: THREE.Vector3
  /** カメラの位置。省略するとプレイヤーと look から自動で決める（プレイヤー越しに見る・壁に埋まらない） */
  from?: THREE.Vector3
  /** 保持の間にゆっくり向ける先（パン） */
  lookTo?: THREE.Vector3
  /** 保持の間にゆっくり移る先（ドリー） */
  fromTo?: THREE.Vector3
  /** 寄る時間（秒。既定 1.9） */
  inSec?: number
  /** 保持（秒。既定 2.2。Infinity なら endCinematic() まで） */
  hold?: number
  /** 戻る時間（秒。既定 1.5） */
  outSec?: number
  /** パンにかける時間（秒。既定は hold、hold が Infinity なら 3） */
  panSec?: number
  /** 画角（度）。省略は今の画角のまま */
  fov?: number
  marker?: CineMarker
  /** ショットの間ずっと続く揺れ（0〜1） */
  shake?: number
  /** 会話が出ていないとき F・Space・J で飛ばせる（戻りに入る） */
  skippable?: boolean
  /** 上下の黒帯（既定 true） */
  letterbox?: boolean
  /** 寄る・戻るときに弧を描いて持ち上げる高さ（m。既定は移動の距離から自動。0 でまっすぐ） */
  arc?: number
}

export const CINE_DEFAULTS = { inSec: 1.9, hold: 2.2, outSec: 1.5, panSec: 3 } as const

/** なめらかな加減速（smootherstep：始まりと終わりで速度も加速度も 0） */
export function easeInOut(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  return t * t * t * (t * (t * 6 - 15) + 10)
}

export type CinePhase = 'in' | 'hold' | 'out' | 'done'

/** ショットの時間の進み方（純粋な計算） */
export type CineTiming = { inSec: number; hold: number; outSec: number; panSec: number }

export function shotTiming(s: CineShot): CineTiming {
  const inSec = Math.max(0.05, s.inSec ?? CINE_DEFAULTS.inSec)
  const hold = Math.max(0, s.hold ?? CINE_DEFAULTS.hold)
  const outSec = Math.max(0.05, s.outSec ?? CINE_DEFAULTS.outSec)
  const panSec = Math.max(0.05, s.panSec ?? (Number.isFinite(hold) && hold > 0 ? hold : CINE_DEFAULTS.panSec))
  return { inSec, hold, outSec, panSec }
}

/**
 * t 秒の時点の混ぜ具合 w（0 = プレイのカメラ、1 = ショット）と、パンの進み pan（0..1）。
 * outStart は戻り始める時刻（既定は inSec + hold。endCinematic で早められる）、wOut はその時点の w。
 */
export function shotState(t: number, tm: CineTiming, outStart: number, wOut: number): { phase: CinePhase; w: number; pan: number } {
  const panAt = (x: number) => easeInOut(Math.min(1, Math.max(0, (x - tm.inSec) / tm.panSec)))
  if (t < outStart) {
    if (t < tm.inSec) return { phase: 'in', w: easeInOut(t / tm.inSec), pan: 0 }
    return { phase: 'hold', w: 1, pan: panAt(t) }
  }
  const u = (t - outStart) / tm.outSec
  if (u >= 1) return { phase: 'done', w: 0, pan: panAt(outStart) }
  return { phase: 'out', w: wOut * (1 - easeInOut(u)), pan: panAt(outStart) }
}

/**
 * 目標を見せるカメラの位置を自動で決める：プレイヤーの後ろ上（少し右）から、プレイヤー越しに目標を見る。
 * 目標が遠いときは目標の方へ寄る（目標が小さくなりすぎない）。壁の判定は呼び出し側（物理）で行う。
 */
export function autoFramePosition(player: THREE.Vector3, look: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  let dx = look.x - player.x
  let dz = look.z - player.z
  let d = Math.hypot(dx, dz)
  if (d < 0.01) {
    dx = 0
    dz = -1
    d = 1
  }
  const ux = dx / d
  const uz = dz / d
  // 遠い目標へは寄る（プレイヤーは画面の外でもよい）
  const adv = Math.max(0, d - 16)
  const back = Math.min(6, Math.max(3.2, 2.6 + (d - adv) * 0.14))
  const side = 1.3
  const rise = 1.9 + Math.min(4, Math.max(0, look.y - player.y) * 0.3)
  out.set(player.x + ux * (adv - back) - uz * side, player.y + rise, player.z + uz * (adv - back) + ux * side)
  return out
}

/** 寄る・戻るときの弧の高さ（移動の距離から。近ければまっすぐ） */
export function arcHeight(distance: number): number {
  return Math.min(2.5, Math.max(0, (distance - 3) * 0.14))
}

/** 揺れ（いくつかの正弦の和。乱数を使わないので毎フレーム同じ時刻なら同じ値） */
export function shakeNoise(t: number, seed: number): number {
  return (Math.sin(t * 31.7 + seed) * 0.5 + Math.sin(t * 17.3 + seed * 2.1) * 0.3 + Math.sin(t * 47.9 + seed * 3.7) * 0.2) * 1.0
}

type Pose = { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number }

const UP = new THREE.Vector3(0, 1, 0)

/**
 * カメラディレクター：ショットを 1 つずつ再生する。apply() は CameraRig がカメラを置いた後に毎フレーム呼ぶ。
 * ショット中に次のショットが来たら、その時点のカメラの姿勢から次のショットへ寄る（飛ばない）。
 */
export class CineDirector {
  private shot: CineShot | null = null
  private tm: CineTiming = shotTiming({ look: new THREE.Vector3() })
  private t = 0
  private outStart = Infinity
  private wOut = 1
  private resolveFn: (() => void) | null = null
  /** 寄る間の土台（ショットからショットへ移るときの、前のカメラの姿勢） */
  private inBase: Pose | null = null
  private fov0 = 55
  private arcH = 0
  private w = 0
  private pan = 0
  private phaseNow: CinePhase = 'done'
  private shakeAmp = 0
  private shakeT = 0
  private readonly from = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private readonly autoFrom = new THREE.Vector3()
  private readonly qShot = new THREE.Quaternion()
  private readonly qBase = new THREE.Quaternion()
  private readonly pBase = new THREE.Vector3()
  private readonly m = new THREE.Matrix4()
  private readonly e = new THREE.Euler()
  private readonly qShake = new THREE.Quaternion()

  get active(): boolean {
    return this.shot !== null
  }

  /** いまの混ぜ具合（0..1） */
  get weight(): number {
    return this.shot ? this.w : 0
  }

  get phase(): CinePhase {
    return this.shot ? this.phaseNow : 'done'
  }

  /** パン（lookTo・fromTo）の進み（0..1） */
  get panProgress(): number {
    return this.shot ? this.pan : 0
  }

  get current(): CineShot | null {
    return this.shot
  }

  get skippable(): boolean {
    return !!this.shot?.skippable && this.t < this.outStart
  }

  /** ショットを始める。autoFrom は from が無いときのカメラ位置（呼び出し側が壁の判定まで済ませたもの） */
  start(shot: CineShot, camera: THREE.PerspectiveCamera, autoFrom: THREE.Vector3 | null): Promise<void> {
    if (this.shot) {
      // 前のショットから続けて寄る：いまのカメラの姿勢を土台にする（画角は元の画角を覚えたまま）
      this.inBase = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov }
      this.finish(false)
    } else {
      this.inBase = null
      this.fov0 = camera.fov
    }
    this.shot = shot
    this.tm = shotTiming(shot)
    this.t = 0
    this.outStart = this.tm.inSec + this.tm.hold
    this.wOut = 1
    this.w = 0
    this.pan = 0
    this.phaseNow = 'in'
    if (autoFrom) this.autoFrom.copy(autoFrom)
    // 遠くへ寄るときは弧を描いて（建物や展示の上を越えるように）持ち上げる
    this.arcH = shot.arc ?? arcHeight(camera.position.distanceTo(shot.from ?? this.autoFrom))
    return new Promise<void>((r) => {
      this.resolveFn = r
    })
  }

  /** 戻りに入る（保持を切り上げる）。fast なら戻りを短くする */
  release(fast = false): void {
    if (!this.shot || this.t >= this.outStart) return
    const s = shotState(this.t, this.tm, Infinity, 1)
    this.outStart = this.t
    this.wOut = s.w
    if (fast) this.tm = { ...this.tm, outSec: Math.min(this.tm.outSec, 0.7) }
  }

  /** すぐにやめる（時空移動・ステージの解放・撮影ショットへの切替のとき）。画角は戻す */
  cancel(camera: THREE.PerspectiveCamera | null): void {
    if (!this.shot) return
    if (camera) {
      camera.fov = this.fov0
      camera.updateProjectionMatrix()
    }
    this.finish(true)
  }

  private finish(clearBase: boolean): void {
    const r = this.resolveFn
    this.resolveFn = null
    this.shot = null
    this.phaseNow = 'done'
    this.w = 0
    if (clearBase) this.inBase = null
    r?.()
  }

  /** 画面の揺れ（0〜1。少しずつ収まる） */
  addShake(amount: number): void {
    this.shakeAmp = Math.min(1.5, Math.max(this.shakeAmp, amount))
  }

  /**
   * カメラ（CameraRig が置いたプレイの姿勢）にショットを混ぜる。終わったフレームは true を返す（後片付けの合図）。
   * 揺れは applyShake で別に足す。
   */
  apply(dt: number, camera: THREE.PerspectiveCamera): boolean {
    const shot = this.shot
    if (!shot) return false
    this.t += dt
    const st = shotState(this.t, this.tm, this.outStart, this.wOut)
    this.phaseNow = st.phase
    this.w = st.w
    this.pan = st.pan
    // ショットの姿勢
    this.from.copy(shot.from ?? this.autoFrom)
    if (shot.fromTo) this.from.lerp(shot.fromTo, st.pan)
    this.look.copy(shot.look)
    if (shot.lookTo) this.look.lerp(shot.lookTo, st.pan)
    this.m.lookAt(this.from, this.look, UP)
    this.qShot.setFromRotationMatrix(this.m)
    // 土台：寄る間で前のショットから続けるなら前の姿勢、それ以外はプレイのカメラ
    const base = st.phase === 'in' && this.inBase ? this.inBase : null
    this.pBase.copy(base ? base.pos : camera.position)
    this.qBase.copy(base ? base.quat : camera.quaternion)
    const fovBase = base ? base.fov : this.fov0
    camera.position.lerpVectors(this.pBase, this.from, st.w)
    if (st.w < 1) camera.position.y += this.arcH * Math.sin(Math.PI * st.w)
    camera.quaternion.slerpQuaternions(this.qBase, this.qShot, st.w)
    const fovShot = shot.fov ?? this.fov0
    const fov = fovBase + (fovShot - fovBase) * st.w
    if (Math.abs(camera.fov - fov) > 1e-4) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    if (st.phase === 'hold' || st.phase === 'out') this.inBase = null
    if (st.phase === 'done') {
      if (Math.abs(camera.fov - this.fov0) > 1e-4) {
        camera.fov = this.fov0
        camera.updateProjectionMatrix()
      }
      this.finish(true)
      return true
    }
    return false
  }

  /** 揺れを足す（ショット中はショットの揺れ＋衝撃、プレイ中は衝撃だけ）。CameraRig・apply の後に毎フレーム */
  applyShake(dt: number, camera: THREE.PerspectiveCamera): void {
    this.shakeT += dt
    this.shakeAmp = Math.max(0, this.shakeAmp - dt * 1.4)
    const a = this.shakeAmp + (this.shot?.shake ?? 0) * this.w
    if (a < 1e-3) return
    const t = this.shakeT
    this.e.set(shakeNoise(t, 1.3) * 0.016 * a, shakeNoise(t, 4.1) * 0.02 * a, shakeNoise(t, 7.7) * 0.012 * a, 'YXZ')
    this.qShake.setFromEuler(this.e)
    camera.quaternion.multiply(this.qShake)
    camera.position.y += shakeNoise(t, 9.2) * 0.03 * a
  }
}
