// 画面上部のコンパス（方位の目盛り＋目的地のピンと距離）。
// 方位の決まり：北 = ワールドの -Z、東 = +X。角度は度、時計回りが正（北 0°、東 90°）。
// 前半は DOM を使わない計算（tests/hudFutureCompass.test.ts）、後半が表示部品 CompassBar。
import type { PlanePoint } from './types'

const DEG = 180 / Math.PI

/** 角度（度）を -180 以上 180 未満へ */
export function wrapDeg(d: number): number {
  const r = (((d + 180) % 360) + 360) % 360
  return r - 180
}

/**
 * カメラの向き（cameraRig.yaw と同じ定義：カメラは注視点から (sin yaw, cos yaw) 側に置かれる）から、
 * 画面の奥（前方）の方位（度）を求める。前方 = (-sin yaw, -cos yaw) なので方位は -yaw。
 */
export function headingFromCameraYaw(yawRad: number): number {
  return wrapDeg(-yawRad * DEG)
}

/** 前方ベクトル（x, z）から方位（度）。THREE の camera.getWorldDirection の結果をそのまま渡せる */
export function headingFromForward(fx: number, fz: number): number {
  return wrapDeg(Math.atan2(fx, -fz) * DEG)
}

/** from から to への方位（度） */
export function bearingDeg(from: PlanePoint, to: PlanePoint): number {
  return wrapDeg(Math.atan2(to.x - from.x, -(to.z - from.z)) * DEG)
}

/** 水平距離（m） */
export function planeDistance(from: PlanePoint, to: PlanePoint): number {
  return Math.hypot(to.x - from.x, to.z - from.z)
}

/** 距離の表示（「32m」「1.2km」）。1m 未満は「0m」 */
export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return ''
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`
  return `${Math.round(m)}m`
}

export type CompassMarker = {
  /** バーの左端 0 〜 右端 1 の位置（範囲外は端に張り付く） */
  x: number
  /** -1 = 左の範囲外、0 = 範囲内、1 = 右の範囲外 */
  side: -1 | 0 | 1
  /** 正面から見た相対方位（度、右が正） */
  rel: number
}

/**
 * 目的地のピンの位置。halfRange はバーの半分に映す角度（度）。
 * edge はピンが端からはみ出さないための余白（0〜0.5）。
 */
export function markerOnBar(headingDeg: number, targetBearingDeg: number, halfRange: number, edge = 0.04): CompassMarker {
  const rel = wrapDeg(targetBearingDeg - headingDeg)
  const raw = 0.5 + rel / (2 * halfRange)
  if (raw < edge) return { x: edge, side: -1, rel }
  if (raw > 1 - edge) return { x: 1 - edge, side: 1, rel }
  return { x: raw, side: 0, rel }
}

/**
 * 目盛りの帯（-360°〜+360° の 720° 分、帯の幅＝窓の幅 × 720 / (2×halfRange)）を
 * どれだけ左へずらすか（帯の幅に対する割合 0〜1）。窓の中央が headingDeg になる。
 */
export function stripShift(headingDeg: number, halfRange: number): number {
  const h = wrapDeg(headingDeg)
  return (h - halfRange + 360) / 720
}

/** 方位の文字（45° ごと）。目盛りに出すのは東西南北だけ（子どもに読みやすく） */
export const CARDINALS: Array<[number, string]> = [
  [0, 'N'],
  [90, 'E'],
  [180, 'S'],
  [-90, 'W'],
]

// ------------------------------------------------------------------ 表示部品

export type CompassOptions = {
  /** バーの半分に映す角度（度）。既定 100°：正面が北なら W と E が両端の少し内側に来る */
  halfRange?: number
}

/** 画面上部中央のコンパス。update() は毎フレーム呼んでよい（変化した値だけ DOM を触る） */
export class CompassBar {
  readonly el: HTMLDivElement
  private readonly strip: HTMLDivElement
  private readonly pin: HTMLDivElement
  private readonly dist: HTMLDivElement
  private readonly windowEl: HTMLDivElement
  private readonly halfRange: number
  private winW = 0
  private lastShift = Number.POSITIVE_INFINITY
  private lastPinX = Number.POSITIVE_INFINITY
  private lastSide = 9
  private lastDist = ''
  private hasTarget = false
  private readonly ro: ResizeObserver | null = null

  constructor(opts: CompassOptions = {}) {
    this.halfRange = opts.halfRange ?? 100
    this.el = document.createElement('div')
    this.el.className = 'nx-compass'
    this.el.innerHTML = `
      <div class="nx-frame-host" data-frame="compass"></div>
      <div class="nx-cmp-window"><div class="nx-cmp-strip">${buildStrip()}</div></div>
      <div class="nx-cmp-center"></div>
      <div class="nx-cmp-pin" hidden>
        <div class="nx-cmp-pinicon">${PIN_SVG}</div>
        <div class="nx-cmp-edge"></div>
        <div class="nx-cmp-ring"></div>
        <div class="nx-cmp-dist"></div>
      </div>`
    this.windowEl = this.el.querySelector('.nx-cmp-window') as HTMLDivElement
    this.strip = this.el.querySelector('.nx-cmp-strip') as HTMLDivElement
    this.pin = this.el.querySelector('.nx-cmp-pin') as HTMLDivElement
    this.dist = this.el.querySelector('.nx-cmp-dist') as HTMLDivElement
    // 帯の幅は窓の幅 × 720 / (2×halfRange)
    this.strip.style.width = `${(720 / (2 * this.halfRange)) * 100}%`
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => {
        this.winW = this.windowEl.clientWidth
        this.lastPinX = Number.POSITIVE_INFINITY
      })
      this.ro.observe(this.windowEl)
    }
  }

  /**
   * headingDeg：画面奥の方位（度）。target：目的地（null でピンを消す）、from：プレイヤーの位置。
   */
  update(headingDeg: number, target: PlanePoint | null, from: PlanePoint | null): void {
    const shift = stripShift(headingDeg, this.halfRange)
    if (!(Math.abs(shift - this.lastShift) <= 1e-5)) {
      this.lastShift = shift
      this.strip.style.transform = `translate3d(${(-shift * 100).toFixed(3)}%, 0, 0)`
    }
    const show = !!(target && from)
    if (show !== this.hasTarget) {
      this.hasTarget = show
      this.pin.hidden = !show
    }
    if (!target || !from) return
    if (!this.winW) this.winW = this.windowEl.clientWidth
    const m = markerOnBar(headingDeg, bearingDeg(from, target), this.halfRange)
    const px = m.x * this.winW
    if (!(Math.abs(px - this.lastPinX) <= 0.25)) {
      this.lastPinX = px
      this.pin.style.transform = `translate3d(${px.toFixed(1)}px, 0, 0)`
    }
    if (m.side !== this.lastSide) {
      this.lastSide = m.side
      this.pin.dataset.side = String(m.side)
    }
    const d = formatDistance(planeDistance(from, target))
    if (d !== this.lastDist) {
      this.lastDist = d
      this.dist.textContent = d
    }
  }

  dispose(): void {
    this.ro?.disconnect()
    this.el.remove()
  }
}

/** 目盛りの帯（-360°〜+360°）。15° ごとの目盛り、45° ごとに長め、東西南北に文字 */
function buildStrip(): string {
  const parts: string[] = []
  for (let d = -360; d <= 360; d += 15) {
    const left = ((d + 360) / 720) * 100
    const card = CARDINALS.find(([a]) => wrapDeg(a) === wrapDeg(d))
    if (card) {
      parts.push(`<span class="nx-cmp-letter${card[1] === 'N' ? ' n' : ''}" style="left:${left.toFixed(4)}%">${card[1]}</span>`)
    } else {
      const major = d % 45 === 0
      parts.push(`<i class="nx-cmp-tick${major ? ' major' : ''}" style="left:${left.toFixed(4)}%"></i>`)
    }
  }
  return parts.join('')
}

const PIN_SVG = `<svg viewBox="0 0 40 52" aria-hidden="true"><defs><linearGradient id="nx-pin-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2a0"/><stop offset="1" stop-color="#ffc21a"/></linearGradient></defs><path d="M20 50 C14 39 5 31 5 19 A15 15 0 0 1 35 19 C35 31 26 39 20 50 Z" fill="url(#nx-pin-g)" stroke="#fff8d0" stroke-width="1.4"/><circle cx="20" cy="19" r="6.2" fill="#0d3a6e"/><circle cx="20" cy="19" r="3.4" fill="#dffbff"/></svg>`

