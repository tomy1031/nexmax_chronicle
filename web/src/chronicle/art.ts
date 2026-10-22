// 物語 v7 の絵（Codex の画像生成で作ったイラスト。web/public/textures/story/v7・textures/portraits）。
// ・回想・思い出・結末の一枚絵（introOverlay2086.ts の Flashback などに渡す）
// ・IDO の記録の写真（hud.showIdo の image はキャンバスなので loadArtCanvas で読む）
// ・会話の顔のイラスト（手続きの人物は顔が素朴なので、会話の顔はイラストにする。applyV7Portraits）
import type { Hud } from '../ui/hud'

const base = (p: string) => `./textures/${p}`

/** 一枚絵（16:9） */
export const V7_ART = {
  /** はじめに（2071）：地下の倉庫、毛布をめくるソラ */
  prologue: base('story/v7/prologue_2071.webp'),
  /** 5章：60年前の NEXTMAKE の記録（立てたばかりのかんばん・社長・佐伯さん） */
  recordNextmake: base('story/v7/record_nextmake_2026.webp'),
  /** 6章：源兵衛の書（青い刃のかけらの絵） */
  bookPage1: base('story/v7/genbei_book_p1.webp'),
  /** 7章のあと・8章：源兵衛の書の次のページ（時を裂く爪の絵） */
  bookPage2: base('story/v7/genbei_book_p2.webp'),
  /** 8章：2027年 ほこらの取りこわしの記録 */
  record2027: base('story/v7/record_2027.webp'),
  /** 10・11章：カンボジアの遺跡の浮き彫り（1186年の戦いの絵） */
  relief1186: base('story/v7/relief_1186.webp'),
  /** 10章の思い出 */
  memLabWake: base('story/v7/mem_lab_wake.webp'),
  memGarden: base('story/v7/mem_garden.webp'),
  memMotherLamp: base('story/v7/mem_mother_lamp.webp'),
  memPlease: base('story/v7/mem_please.webp'),
  memMatane: base('story/v7/mem_matane.webp'),
  memNightSky: base('story/v7/mem_night_sky.webp'),
  /** 結末・おわりに */
  endingFestival: base('story/v7/ending_festival.webp'),
  epilogueMorning: base('story/v7/epilogue_morning.webp'),
} as const

/** 材質（くり返しの模様）：1186 の寺の壁 */
export const V7_TEXTURES = {
  khmerReliefBand: base('story/v7/khmer_relief_band.webp'),
  khmerSandstone: base('story/v7/khmer_sandstone.webp'),
} as const

/** 会話の顔（話者名 → 絵）。話者名は台詞の JSON の speaker と同じにする */
export const V7_PORTRAITS: Readonly<Record<string, string>> = {
  トワ: base('portraits/towa_mask.webp'),
  'トワ（小さいころ）': base('portraits/towa_child.webp'),
  チャンダ: base('portraits/chanda.webp'),
  チャンダのおばあさん: base('portraits/elder.webp'),
  おふじ: base('portraits/ofuji.webp'),
  '佐伯（2068年）': base('portraits/saeki_old.webp'),
}

/** 仮面を外したトワの顔（12 章の結末から。stage が rt.hud.setSpeakerIcon('トワ', TOWA_UNMASKED) で差しかえる） */
export const TOWA_UNMASKED = base('portraits/towa.webp')

/** 会話の顔のイラストを HUD に入れる（シェルが起動時に 1 回） */
export function applyV7Portraits(hud: Pick<Hud, 'setSpeakerIcon'>): void {
  for (const [name, url] of Object.entries(V7_PORTRAITS)) hud.setSpeakerIcon(name, url)
}

/** 絵をキャンバスに読む（hud.showIdo の image 用）。読めなければ null */
export function loadArtCanvas(url: string, maxW = 1280): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, maxW / img.naturalWidth)
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * k)
      c.height = Math.round(img.naturalHeight * k)
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height)
      resolve(c)
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
