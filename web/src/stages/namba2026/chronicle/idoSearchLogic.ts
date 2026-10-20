// IDO 検索（物語 v7 の 6 章）：佐伯さんの端末で、町じゅうのかんばんの記録を言葉でさがす。純粋なロジック（テストする）。
// 「時計」でさがすと 3 本（時計屋の看板・駅の大時計の看板・古い路地のかんばん）。町でそれぞれの前に行って F で記録を見る。
// 古い路地のかんばんだけ「青い」も合う（源兵衛の書の「青い刃のかけら」）。「時計」と「青い」の両方でさがすと 1 本になる。

/** 記録の絵の種類（recordArt.ts の絵を選ぶ） */
export type RecordImage = 'clockShop' | 'stationClock' | 'genbeiPage' | 'none'

export type IdoRecord = {
  id: string
  /** 記録をしまっているかんばん（layoutV7.ts の KANBAN の id）。null は町の外（地図に出さない） */
  kanban: 'a' | 'b' | 'c' | 'd' | null
  /** 検索の結果の一行（かんばんの名前） */
  name: string
  /** 場所の説明（子どもにわかる道順） */
  place: string
  /** 合う言葉 */
  words: readonly string[]
  /** 地図の位置（x, z） */
  at: readonly [number, number]
  /** 記録のパネル（hud.showIdo に渡す中身） */
  panel: { title: string; sub: string; body: string; foot: string }
  image: RecordImage
}

/** 町のかんばんの記録（検索の対象。合わない物もまぜて、言葉でしぼれることを見せる） */
export const IDO_RECORDS: readonly IdoRecord[] = [
  {
    id: 'clock_shop',
    kanban: 'b',
    name: '時計屋の看板',
    place: '橋のたもと（南の遊歩道）',
    words: ['時計', '昭和', '店', '橋'],
    at: [9.0, 5.85],
    panel: {
      title: 'かんばんの記録 ― 橋のたもとの時計屋',
      sub: '昭和のはじめ ・ 「ときわ堂」の大きな丸時計',
      body: 'このあたりには、むかし小さな時計屋があった。店の前の大きな丸い時計は、橋をわたる人たちの目じるしだったという。',
      foot: '※ 写真をもとにした記録です',
    },
    image: 'clockShop',
  },
  {
    id: 'station_clock',
    kanban: 'd',
    name: '駅の大時計の看板',
    place: '川の向こう（北の遊歩道）・駅の入口',
    words: ['時計', '駅', '待ち合わせ', '100年前'],
    at: [0.1, -5.85],
    panel: {
      title: 'かんばんの記録 ― 駅の大時計',
      sub: '100年前 ・ 駅の前の待ち合わせの場所',
      body: '駅の前には大きな時計があって、町の人たちの待ち合わせの場所だった。「大時計の下で会おう」が合言葉だったという。',
      foot: '※ 写真をもとにした記録です',
    },
    image: 'stationClock',
  },
  {
    id: 'old_alley',
    kanban: 'c',
    name: '古い路地のかんばん',
    place: '串カツの店のとなりの細い路地',
    words: ['時計', '青い', '江戸', 'からくり', '源兵衛', 'かけら'],
    at: [15.68, 16.6],
    panel: {
      title: 'かんばんの記録 ― 古い路地',
      sub: '江戸時代 ・ からくり時計の名人・源兵衛の工房',
      body: '江戸時代、この路地には、からくり時計の名人・源兵衛（げんべえ）の工房があった。源兵衛の家には、遠い国から来た『空の怪物を裂く、青い刃のかけら』が、宝として伝わっていた。かけらは、時計のように、コチ、コチと鳴ったという。',
      foot: '※ 源兵衛の書の一ページ（町の記録より）',
    },
    image: 'genbeiPage',
  },
  {
    id: 'nextmake',
    kanban: 'a',
    name: 'NEXTMAKE の前のかんばん',
    place: 'NEXTMAKE のビルの前',
    words: ['NEXTMAKE', '新しい', 'IDO'],
    at: [-4.6, 5.85],
    panel: {
      title: 'かんばんの記録 ― IDO 第 1 号',
      sub: '2026年 ・ 立てたばかりのかんばん',
      body: 'NEXTMAKE が町に立てた、いちばん新しいかんばん。町の昔のようすを、写真や絵や言い伝えで見せる。',
      foot: '',
    },
    image: 'none',
  },
  {
    id: 'blue_cafe',
    kanban: null,
    name: '青い屋根の喫茶店のかんばん',
    place: '町の北のはずれ',
    words: ['青い', '喫茶店', '昭和'],
    at: [0, 0],
    panel: { title: 'かんばんの記録 ― 青い屋根の喫茶店', sub: '昭和 ・ 町の北のはずれ', body: '青い屋根の喫茶店は、町の人の休み場所だった。', foot: '' },
    image: 'none',
  },
  {
    id: 'river_boat',
    kanban: null,
    name: '川の船着き場のかんばん',
    place: '川の下流',
    words: ['船', '川', '江戸'],
    at: [0, 0],
    panel: { title: 'かんばんの記録 ― 船着き場', sub: '江戸時代 ・ 川の下流', body: '荷物を運ぶ船が、毎日たくさん行き来していた。', foot: '' },
    image: 'none',
  },
]

/** 検索：すべての言葉が合う記録（言葉が空なら何も出さない） */
export function searchRecords(words: readonly string[], records: readonly IdoRecord[] = IDO_RECORDS): IdoRecord[] {
  const ws = words.map((w) => w.trim()).filter((w) => w.length > 0)
  if (!ws.length) return []
  return records.filter((r) => ws.every((w) => r.words.includes(w)))
}

/** 記録 1 本に、言葉のどれが合うか（結果の行の「合った言葉」の印） */
export function matchedWords(r: IdoRecord, words: readonly string[]): string[] {
  return words.filter((w) => r.words.includes(w))
}

/** 6 章の検索の言葉（佐伯さんの「時計」と、ネクマックスの石の色「青い」） */
export const SEARCH_WORDS = { first: ['時計'] as const, second: ['時計', '青い'] as const }

/** 「時計」の候補（町で回る 3 本）の id。順番は近い順（ラボ → 橋 → 路地 → 駅） */
export const CLOCK_CANDIDATES = searchRecords(SEARCH_WORDS.first).map((r) => r.id)

/** かんばんの id から、そのかんばんの記録 */
export function recordOfKanban(k: 'a' | 'b' | 'c' | 'd'): IdoRecord | null {
  return IDO_RECORDS.find((r) => r.kanban === k) ?? null
}

/** 町で調べた候補の数（検索の画面の「◯／3」） */
export function checkedCount(checked: ReadonlySet<string>, candidates: readonly string[] = CLOCK_CANDIDATES): number {
  return candidates.filter((id) => checked.has(id)).length
}
