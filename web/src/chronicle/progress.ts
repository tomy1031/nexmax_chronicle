// 物語 v7（docs/物語_v7_時を裂く爪.md・docs/ステージ設計_v1.md §8）の進み具合。フラグだけから決まる純粋な計算。
// ・光のつぶ：背中の石の 7 つの光。巻き戻し 3 回・旅の帰り 3 回・最後の一撃 1 回で減る（フラグの数から数える）
// ・何度目の 10月18日：1 ＋ 巻き戻しの数
// ・章：いまどの章にいるか（セーブの要約・HUD・目標の既定の文言に使う）
// 描画・DOM には依存しない。

export type Flags = (name: string) => boolean

/** v7 の真偽フラグ（core/storyFlags.ts に登録する。並びは物語の順） */
export const V7_FLAGS = [
  // 0〜1章 2086
  'v7_prologue_seen', // 回想（2071年、地下の倉庫）を見た
  'v7_balloon_done', // 1章：男の子の風船を取ってあげた（任意）
  'v7_lens_done', // 1章：共鳴レンズをソラにわたした
  'v7_antenna_done', // 1章：北の回廊の中継アンテナをつないだ（大画面に「開場」）
  'v7_qr_demo', // 1章：展示の台の QR を読んで、わっかに 300 年前の路地を見た
  'v7_keychain', // 1章：星のキーホルダーを買った
  'v7_promise', // 1章：夜の約束（このあと夜）
  // 2〜5章 2086
  'v7_rewind1', // 2章：一度目の巻き戻し（光 7→6）
  'v7_loop_seen', // 3章：同じ朝に気づいた
  'v7_rewind2', // 4章：二度目の巻き戻し（かくれた夜。光 6→5）
  'v7_rewind3', // 4章：三度目の巻き戻し（トワと話した夜。光 5→4）
  'v7_confided', // 5章：ソラに話した（キーホルダー）
  'v7_door1', // 5章：60年前の記録で扉がひらいた（→2026）
  // 6章 2026
  'v7_beast_down', // よろいの影獣をたおした
  'v7_sketch_seen', // 社長の絵（すみに 001）を見た
  'v7_search_done', // IDO 検索で路地のかんばん（青い刃のかけら）を見つけた
  // 7章 1726
  'v7_met_oharu', // おはると会った
  'v7_fragment_seen', // かけらが鳴った・源兵衛の話
  'v7_demo_seen', // 実演（切れ目の向こうの黒いもの）・爪の設計
  'v7_doll_down', // 時の鐘人形を止めた
  'v7_claw_stored', // 爪をほこらにおさめた（→帰還）
  // 8章 2086
  'v7_back1', // 江戸から帰った（光 4→3）
  'v7_building_seen', // ほこらの場所がビルだった・書の絵がふえていた
  'v7_dial_seen', // 年代ダイヤルに気づいた（→2026）
  // 9章 2026
  'v7_shrine_talk', // 社長・おふじさん・佐伯さん
  'v7_shrine_saved', // ほこらを守りぬいた・社長の決断（→帰還）
  // 10章 2086
  'v7_back2', // 2026年から帰った（光 3→2）
  'v7_rift_claw', // 時空裂きのNMクローを手に入れた
  'v7_rift_practice', // 新しい力の練習をおえた
  'v7_memory_open', // 思い出と佐伯さんの声
  'v7_towa_duel', // 中庭の決闘（→1186）
  // 11章 1186
  'v7_khmer_arrived',
  'v7_met_chanda',
  'v7_mirror_n',
  'v7_mirror_e',
  'v7_mirror_s',
  'v7_stairs_defended', // 寺の階段を守りぬいた（夜明け）
  'v7_heart1', // 裏側でチャンダを助けて帰った
  'v7_khmer_done', // アルンの最後の光・別れ（→帰還）
  // 12章 2086
  'v7_back3', // カンボジアから帰った（光 2→1）
  'v7_final_ready', // ソラと試した
  'v7_hands_cut', // 黒い手 3 本を裂いた
  'v7_orm_down', // 最後の光でオルムをたおした（光 1→0）
  'v7_ending', // 帰ってきた・結末
  'v7_epilogue', // おわりに（10月19日の朝）
] as const

export type V7Flag = (typeof V7_FLAGS)[number]

export const LIGHTS_TOTAL = 7

/** 光のつぶを使うできごと（物語の順） */
export const LIGHT_SPENDERS: readonly V7Flag[] = ['v7_rewind1', 'v7_rewind2', 'v7_rewind3', 'v7_back1', 'v7_back2', 'v7_back3', 'v7_orm_down']

/** 背中の石に残っている光のつぶ（0〜7） */
export function lightsLeft(f: Flags): number {
  let n = LIGHTS_TOTAL
  for (const k of LIGHT_SPENDERS) if (f(k)) n--
  return Math.max(0, n)
}

/** いまが何度目の 10月18日か（1〜4）。おわりに（10月19日）でも 4 のまま */
export function dayCount(f: Flags): number {
  return 1 + (f('v7_rewind1') ? 1 : 0) + (f('v7_rewind2') ? 1 : 0) + (f('v7_rewind3') ? 1 : 0)
}

/** 時空裂きのNMクローを持っているか */
export function riftClawUnlocked(f: Flags): boolean {
  return f('v7_rift_claw')
}

/** 章（0 = はじめに、13 = おわりに） */
export type Chapter = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

export const CHAPTER_TITLES: Record<Chapter, string> = {
  0: 'はじめに　地下の倉庫の、小さなロボット',
  1: '1　お祭りの日',
  2: '2　空のひび',
  3: '3　また、同じ朝',
  4: '4　すりぬける怪物',
  5: '5　ソラに話す',
  6: '6　60年前の大阪',
  7: '7　江戸の時計師',
  8: '8　消えたほこら',
  9: '9　社長との約束',
  10: '10　ひらいた箱と、ひらいた思い出',
  11: '11　900年前のカンボジア',
  12: '12　最後の夜',
  13: 'おわりに　10月19日の朝',
}

/** いまの章（フラグだけから。セーブの要約や目標の既定に使う） */
export function chapterOf(f: Flags): Chapter {
  if (f('v7_ending')) return 13
  if (f('v7_back3')) return 12
  if (f('v7_towa_duel')) return 11
  if (f('v7_back2')) return 10
  if (f('v7_dial_seen')) return 9
  if (f('v7_back1')) return 8
  if (f('v7_search_done')) return 7
  if (f('v7_door1')) return 6
  if (f('v7_rewind3')) return 5
  if (f('v7_loop_seen')) return 4
  if (f('v7_rewind1')) return 3
  if (f('v7_promise')) return 2
  if (f('v7_prologue_seen')) return 1
  return 0
}

/**
 * 章の舞台（その章のとびらを出す時代）。章を進めるフラグは前の時代の終わりに立つことがある
 * （7 章の v7_search_done は 2026 で、9 章の v7_dial_seen・11 章の v7_towa_duel は 2086 で立つ）ので、
 * とびらは着いた先の時代で出す
 */
export const CHAPTER_ERA: Readonly<Record<Chapter, '1186' | '1726' | '2026' | '2086'>> = {
  0: '2086',
  1: '2086',
  2: '2086',
  3: '2086',
  4: '2086',
  5: '2086',
  6: '2026',
  7: '1726',
  8: '2086',
  9: '2026',
  10: '2086',
  11: '1186',
  12: '2086',
  13: '2086',
}

/** v7 の物語を始めているか（旧版のセーブと分けるため） */
export function v7Started(f: Flags): boolean {
  return V7_FLAGS.some((k) => f(k))
}
