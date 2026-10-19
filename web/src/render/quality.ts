// 画質（省電力・標準・高画質）とフレームレートの上限（30・60）。
// スマホ・タブレット（タッチ操作）は「標準・30」、PC は「高画質・60」から始まり、一時停止の「設定」タブで変えられる（この端末に保存）。
// URL の ?quality=low|medium|high・?fps=30|60 は保存した設定より優先する（開発用）。?shot=05|04|overview、?fixed（解像度を固定）。
export type QualityLevel = 'low' | 'medium' | 'high'
export type FpsCap = 30 | 60

export type QualitySettings = {
  level: QualityLevel
  shadowMapSize: number
  /** 影のふちのぼかし（PCF の半径） */
  shadowRadius: number
  /** 描画解像度（CSS の画素あたり）の上限。適応解像度はここから下げる */
  maxPixelRatio: number
  /** 適応解像度の下限 */
  minPixelRatio: number
  /** 環境遮蔽（N8AO）。全画面の処理が数回増える、いちばん重い後処理 */
  ao: boolean
  aoHalfRes: boolean
  /** ブルーム（光のにじみ）。縮小・拡大で 17 回ほど描く */
  bloom: boolean
  /** 後段のアンチエイリアス（SMAA、全画面 3 回）。null なら無し */
  smaa: 'high' | 'medium' | null
  petals: number
  /** 提灯などの点光源の数（近い順に割り当てる。少ないほど 1 画素あたりの光の計算が軽い） */
  pointLights: number
  /** HUD の左上の顔（小さな WebGL）の更新回数 */
  portraitFps: number
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualitySettings>> = {
  // Retina でも描画解像度は 1.25 倍まで・AO は半分の解像度（M1 実機で 25fps 前後しか出なかったため）
  high: { level: 'high', shadowMapSize: 2048, shadowRadius: 3, maxPixelRatio: 1.25, minPixelRatio: 0.7, ao: true, aoHalfRes: true, bloom: true, smaa: 'high', petals: 600, pointLights: 6, portraitFps: 20 },
  // AO を切り、影と解像度を 1 段下げる（見た目の差は小さく、重さは半分ほど）。
  // スマホは描画解像度が低い（CSS の画素以下まで下がる）ので、ふちのギザギザが目立ちやすい。SMAA は低い解像度ほど安いので HIGH にする
  medium: { level: 'medium', shadowMapSize: 1024, shadowRadius: 2, maxPixelRatio: 1.0, minPixelRatio: 0.65, ao: false, aoHalfRes: true, bloom: true, smaa: 'high', petals: 250, pointLights: 4, portraitFps: 12 },
  // 後処理はかすみと色調だけ（ブルーム・アンチエイリアスなし）。解像度も少し下げる
  low: { level: 'low', shadowMapSize: 1024, shadowRadius: 1, maxPixelRatio: 0.85, minPixelRatio: 0.6, ao: false, aoHalfRes: true, bloom: false, smaa: null, petals: 120, pointLights: 2, portraitFps: 8 },
}

export const QUALITY_LABELS: Readonly<Record<QualityLevel, string>> = { low: '省電力', medium: '標準', high: '高画質' }
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high']
export const FPS_CAPS: readonly FpsCap[] = [30, 60]

/** 遊ぶ人が選ぶ設定（この端末に保存する） */
export type GraphicsPrefs = { quality: QualityLevel; fps: FpsCap }

export const PREFS_KEY = 'nexmax.graphics.v1'

/** 最初の設定：スマホ・タブレットは熱くなりにくい「標準・30」、PC は「高画質・60」 */
export function defaultPrefs(touch: boolean): GraphicsPrefs {
  return touch ? { quality: 'medium', fps: 30 } : { quality: 'high', fps: 60 }
}

function isLevel(x: unknown): x is QualityLevel {
  return x === 'low' || x === 'medium' || x === 'high'
}

function asFps(x: unknown): FpsCap | null {
  const n = Number(x)
  return n === 30 || n === 60 ? n : null
}

/** 保存した文字列から（壊れていれば読めた分だけ） */
export function parsePrefs(raw: string | null): Partial<GraphicsPrefs> {
  if (!raw) return {}
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Partial<GraphicsPrefs> = {}
    if (isLevel(o.quality)) out.quality = o.quality
    const f = asFps(o.fps)
    if (f) out.fps = f
    return out
  } catch {
    return {}
  }
}

/** 既定 ← 保存した設定 ← URL の順に重ねる */
export function resolvePrefs(touch: boolean, saved: string | null, params: URLSearchParams): GraphicsPrefs {
  const p = { ...defaultPrefs(touch), ...parsePrefs(saved) }
  const q = params.get('quality')
  if (isLevel(q)) p.quality = q
  const f = asFps(params.get('fps'))
  if (f) p.fps = f
  return p
}

export function loadSavedPrefs(): string | null {
  try {
    return localStorage.getItem(PREFS_KEY)
  } catch {
    return null
  }
}

export function savePrefs(p: GraphicsPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // 保存できない（プライベートブラウズなど）ときは、この回だけの設定
  }
}

export function qualitySettings(level: QualityLevel): QualitySettings {
  return { ...QUALITY_PRESETS[level] }
}

/** URL だけから（プレビューのページ用。?quality が無ければ高画質） */
export function readParams(): { quality: QualitySettings; shot: string | null; fixedRatio: boolean } {
  const p = new URLSearchParams(location.search)
  const q = p.get('quality')
  const shot = p.get('shot')
  return { quality: qualitySettings(isLevel(q) ? q : 'high'), shot, fixedRatio: shot !== null || p.has('fixed') }
}

/**
 * フレームレートの上限：requestAnimationFrame のたびに、描くかどうかを決める（間引く）。
 * 60Hz の画面で 30 なら 1 回おき、120Hz の画面で 60 なら 1 回おき。画面の更新のゆれ（数 ms）は許す
 */
export class FrameLimiter {
  private fps: number
  private next = -1

  constructor(fps: number) {
    this.fps = fps
  }

  setFps(fps: number): void {
    if (fps !== this.fps) {
      this.fps = fps
      this.next = -1
    }
  }

  /** now：requestAnimationFrame の時刻（ms） */
  shouldRender(now: number): boolean {
    const iv = 1000 / this.fps
    if (this.next < 0) {
      this.next = now + iv
      return true
    }
    if (now < this.next - iv * 0.2) return false
    // 遅れたときは追いつこうとせず、今から数え直す
    this.next = Math.max(this.next + iv, now + iv * 0.8)
    return true
  }
}
