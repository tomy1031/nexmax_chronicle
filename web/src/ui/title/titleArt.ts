// タイトル画面の一枚絵（案 A「時の輪のとびら」：ソラの IDO のわっかの向こうに 4 つの時代、手をふるネクマックスとソラ。
// Codex の画像生成。public/textures/title/）と、その置き方（描画に依存しない計算）。
// 絵の中の場所（時の輪の中心など）は、絵の幅・高さに対する割合で書く（titleScreen.ts・title.css の光の演出もこれに合わせる）。
// main.ts はタイトルを出す前に preloadTitleArt() で読み込みを始める（Service Worker の確認と並べて）。

/** 元の絵の大きさ（px） */
export const ART_W = 1672
export const ART_H = 941
const ASPECT = ART_W / ART_H

const BASE = './textures/title/'

/** 横長の画面で、メニューの左の端にそろえる絵の横の位置（ソラの手の少し右。ここより右は夜空） */
const CLEAR_X = 0.575
/** 上下が切れるとき、下（足もと）を少し多めに残す */
const FOCUS_Y = 0.7
/** 縦長の画面で、真ん中に来る絵の横の位置（時の輪とふたり） */
const FOCUS_PORTRAIT = 0.34
/** 縦長の画面で、絵が使う高さ（下はメニュー） */
const PORTRAIT_H = 0.58

export type ArtFrame = { x: number; y: number; w: number; h: number }

/**
 * 絵を置く枠（画面の CSS px。はみ出した分は切れる）。
 * 横長：画面をおおう大きさ。横が余れば、絵の CLEAR_X がメニューの左の端（sideLeft）より左に来るようにずらす。
 * 縦長：上の PORTRAIT_H に、時の輪とふたりを真ん中にして置く。
 */
export function artFrame(vw: number, vh: number, sideLeft: number, portrait: boolean): ArtFrame {
  if (portrait) {
    const h = Math.max(vh * PORTRAIT_H, vw / ASPECT)
    const w = h * ASPECT
    return { x: clamp(vw / 2 - FOCUS_PORTRAIT * w, vw - w, 0), y: 0, w, h }
  }
  const w = Math.max(vw, vh * ASPECT)
  const h = w / ASPECT
  return { x: clamp(sideLeft - CLEAR_X * w, vw - w, 0), y: (vh - h) * FOCUS_Y, w, h }
}

/** 縦長の画面か（title.css の @media (max-aspect-ratio: 4/5) と同じ） */
export function isPortrait(vw: number, vh: number): boolean {
  return vw / Math.max(1, vh) <= 4 / 5
}

/** 絵のファイル。スマホ・ふつうの PC は 1280 の版（約 190KB）、大きい画面だけ元の大きさ（約 280KB） */
export function titleArtUrl(frameWidth: number, dpr: number): string {
  const need = frameWidth * Math.min(dpr || 1, 1.5)
  return BASE + (need > 1400 ? 'title_ring.webp' : 'title_ring_1280.webp')
}

/** いまの画面で使う絵のファイル */
export function currentTitleArtUrl(): string {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return titleArtUrl(artFrame(vw, vh, 0, isPortrait(vw, vh)).w, window.devicePixelRatio)
}

/** タイトルを出す前に、絵の読み込みを始めておく（同じファイルをタイトルの img が使う） */
export function preloadTitleArt(): void {
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = currentTitleArtUrl()
  } catch {
    // 読めなくてもタイトルは出る
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
