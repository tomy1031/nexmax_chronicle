// NEXTMAKE のロゴと、ネクマックスの公式の絵（public/textures/brand。https://nextmake.site/nexmax/ のもの）。
// 2026 年のビルの看板・ロゴの壁・社員証・社長の絵などに使う。絵は読み込みに時間がかかるので、
// シーンを組む前（看板のアトラスを描く前）に loadBrandArt() を待つ。読めなければ、キャンバスの手描き（印と文字）のまま。
// 印（三つの青い三角で「M」）は nextmake_mark.svg と同じ形をキャンバスに直接かく（読み込み不要・どの大きさでもくっきり）。

const BASE = './textures/brand/'

type BrandImages = {
  /** 青いロゴ（白い所・明るい所に。すける） */
  logo: HTMLImageElement | null
  /** 白いロゴ（暗い所に。すける） */
  logoWhite: HTMLImageElement | null
  /** ネクマックスの公式の絵（すける。692×768） */
  sketch: HTMLImageElement | null
}

const images: BrandImages = { logo: null, logoWhite: null, sketch: null }
let loading: Promise<void> | null = null

function load(file: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null)
  const img = new Image()
  img.decoding = 'async'
  img.src = BASE + file
  return img.decode().then(
    () => img,
    () => null,
  )
}

/** ロゴと公式の絵を読む（1 回だけ。timeoutMs をすぎたら、読めた物だけで先へ進む） */
export function loadBrandArt(timeoutMs = 6000): Promise<void> {
  if (!loading) {
    loading = Promise.all([load('nextmake_logo.png'), load('nextmake_logo_white.png'), load('nexmax_official_sketch.webp')]).then(([a, b, c]) => {
      images.logo = a
      images.logoWhite = b
      images.sketch = c
    })
  }
  return Promise.race([loading, new Promise<void>((r) => setTimeout(r, timeoutMs))])
}

/** 読めた絵（読めていなければ null） */
export function brandImages(): Readonly<BrandImages> {
  return images
}

/** 印の色（ロゴの濃い青・明るい青） */
export const MARK_DARK = '#0a5aa0'
export const MARK_LIGHT = '#0a8ad0'
/** ロゴの文字の青 */
export const LOGO_BLUE = '#0b5ca6'

/**
 * NEXTMAKE の印（三つの直角三角形で「M」。nextmake_mark.svg と同じ形）。(cx, cy) が中心、w が幅（高さは w × 0.79）。
 * light = 'white' なら白い印（暗い所。まん中の三角だけ少しすける）
 */
export function drawMark(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, dark: string = MARK_DARK, light: string = MARK_LIGHT): void {
  const s = w / 355
  const x0 = cx - w / 2
  const y0 = cy - (280 * s) / 2
  const tri = (pts: ReadonlyArray<readonly [number, number]>, fill: string) => {
    g.fillStyle = fill
    g.beginPath()
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x0 + x * s, y0 + y * s) : g.lineTo(x0 + x * s, y0 + y * s)))
    g.closePath()
    g.fill()
  }
  g.save()
  tri(
    [
      [355, 0],
      [355, 280],
      [46, 280],
    ],
    dark,
  )
  tri(
    [
      [80, 25],
      [80, 280],
      [310, 280],
    ],
    light,
  )
  tri(
    [
      [0, 100],
      [0, 280],
      [190, 280],
    ],
    dark,
  )
  g.restore()
}

/** 白い印（暗い所）。重なりがわかるよう、まん中の三角だけ少し青みをのこす */
export function drawMarkWhite(g: CanvasRenderingContext2D, cx: number, cy: number, w: number): void {
  drawMark(g, cx, cy, w, '#ffffff', 'rgba(200,228,255,0.92)')
}

const LOGO_FONT = '"Helvetica Neue","Arial","Hiragino Sans","Noto Sans JP",sans-serif'

/**
 * ロゴ（NEXT［印］MAKE）を (x, y, w, h) の箱のまん中に、たて横の比をたもって入れる。
 * white = true で白いロゴ（暗い所）。画像が読めていなければ、印と文字でかく
 */
export function drawLogo(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, white = false): void {
  const img = white ? images.logoWhite : images.logo
  const ratio = 611 / 80
  let lw = w
  let lh = w / ratio
  if (lh > h) {
    lh = h
    lw = h * ratio
  }
  const lx = x + (w - lw) / 2
  const ly = y + (h - lh) / 2
  if (img) {
    g.drawImage(img, lx, ly, lw, lh)
    return
  }
  // 読めなかったとき：文字と印（ロゴと同じならび）
  const col = white ? '#ffffff' : LOGO_BLUE
  g.save()
  g.fillStyle = col
  g.textBaseline = 'middle'
  g.font = `500 ${lh * 0.98}px ${LOGO_FONT}`
  g.textAlign = 'right'
  g.fillText('NEXT', lx + lw * 0.385, ly + lh / 2)
  g.textAlign = 'left'
  g.fillText('MAKE', lx + lw * 0.59, ly + lh / 2)
  g.restore()
  if (white) drawMarkWhite(g, lx + lw * 0.488, ly + lh / 2, lh * 1.0)
  else drawMark(g, lx + lw * 0.488, ly + lh / 2, lh * 1.0)
}
