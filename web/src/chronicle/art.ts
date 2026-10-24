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

/**
 * 会話の顔（話者名 → 絵。全員分。384px の正方形）。話者名は台詞の JSON の speaker と同じにする。
 * 同じ人の言いかえ（「ソラ（通信）」「量産型NEXMAX No.33」など）は、ui/future/speakerIcons.ts の正規表現で同じ絵になる。
 * ネクマックスの表情は「ネクマックス#happy」のように # のあとに付ける（speakerIcons.ts の dialogFaceName）。
 */
export const V7_PORTRAITS: Readonly<Record<string, string>> = {
  ネクマックス: base('portraits/nexmax.webp'),
  'ネクマックス#happy': base('portraits/nexmax_happy.webp'),
  'ネクマックス#surprised': base('portraits/nexmax_surprised.webp'),
  'ネクマックス#worried': base('portraits/nexmax_worried.webp'),
  ソラ: base('portraits/sora.webp'),
  'ソラ（8歳）': base('portraits/sora_child.webp'),
  マツイ社長: base('portraits/matsui.webp'),
  佐伯: base('portraits/saeki.webp'),
  '佐伯（2068年）': base('portraits/saeki_old.webp'),
  源兵衛: base('portraits/genbei.webp'),
  おはる: base('portraits/oharu.webp'),
  量産型NEXMAX: base('portraits/unit.webp'),
  トワのお母さん: base('portraits/towa_mother.webp'),
  仮面の男: base('portraits/towa_mask.webp'),
  トワ: base('portraits/towa_mask.webp'),
  'トワ（小さいころ）': base('portraits/towa_child.webp'),
  チャンダ: base('portraits/chanda.webp'),
  チャンダのおばあさん: base('portraits/elder.webp'),
  おふじ: base('portraits/ofuji.webp'),
}

/** 仮面を外したトワの顔（12 章の結末から。stage が rt.hud.setSpeakerIcon('トワ', TOWA_UNMASKED) で差しかえる） */
export const TOWA_UNMASKED = base('portraits/towa.webp')

/** 先に読んでおいた絵（読み終わるまで手放さない） */
const warmed: HTMLImageElement[] = []

/**
 * 会話の顔のイラストを HUD に入れる（シェルが起動時に 1 回）。
 * 絵は小さい（1 枚 20KB ほど）ので、ここで全部を先に読んでおき、最初の会話からすぐ出るようにする。
 */
export function applyV7Portraits(hud: Pick<Hud, 'setSpeakerIcon'>): void {
  for (const [name, url] of Object.entries(V7_PORTRAITS)) hud.setSpeakerIcon(name, url)
  if (typeof Image === 'undefined' || warmed.length) return
  for (const url of new Set([...Object.values(V7_PORTRAITS), TOWA_UNMASKED])) {
    const img = new Image()
    img.decoding = 'async'
    img.setAttribute('fetchpriority', 'low')
    img.src = url
    warmed.push(img)
  }
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
