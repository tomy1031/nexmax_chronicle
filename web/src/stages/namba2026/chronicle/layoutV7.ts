// 物語 v7（6・9 章）の 2026年 なんばの配置（m）。もとの配置（../layout.ts の N・SPOTS）に足す物だけをここに置く。
// X=東、Z=南、Y=上。もとの町：水路は東西、南岸の遊歩道に NEXTMAKE（x -19〜-1）、アーチ橋 x=13、古い路地 x 15〜18。
// v7 で足す物：
// ・路地の「おく」：路地を南へ抜けた先の小さな空き地（来年 NEXTMAKE の新しいビルを建てる予定の土地）。西のはしに、
//   東を向いた「時の神さま」のほこら。北は路地の口、南は長屋の下をくぐるトンネル路地（暗い）、東は古い土蔵（屋根に上れる）
// ・路地のかんばん（石標 C）は、路地の口をふさがないように西の塀ぎわへ（板は東＝路地のまんなかを向く）
// ・時計屋の看板（石標 B のとなりの柱の丸時計）と、北岸の「なんば駅」の入口の大時計と、その前の石標 D
// ・NEXTMAKE の前の、立てたばかりの石標 A のまわり：工事の看板・鉄板・コーン・佐伯さんの測定の道具（影の獣のよろいの元）
import * as THREE from 'three'
import { N } from '../layout'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 路地（v7 は奥の塀をなくして空き地へ抜ける） */
export const ALLEY_V7 = { x0: N.ALLEY.x0, x1: N.ALLEY.x1, z0: N.ALLEY.z0, z1: 20 }

/** 路地のおくの空き地（ほこらの防衛戦の舞台） */
export const LOT = {
  x0: 11.0,
  x1: 22.4,
  z0: 20.0,
  z1: 27.4,
  /** 東の古い物置（片流れの低い屋根に上れる。西が低い）。西の面が空き地の東の端 */
  kura: { x0: 20.4, x1: 22.4, z0: 20.4, z1: 25.0, eave: 2.3, ridge: 2.75 },
  /** 南の長屋（2 階建て）。北の面に下屋（低い屋根）が張り出す */
  nagaya: { z0: 27.4, z1: 31.0, h: 5.6, shedZ0: 26.3, shedLow: 2.45, shedHigh: 2.95 },
  /** 長屋の 1 階をくぐるトンネル路地（南へ抜ける暗い道） */
  tunnel: { x0: 18.8, x1: 20.4, h: 2.2, end: 30.4 },
}

/** 時の神さまのほこら（東向き。足元の中心と向き） */
export const SHRINE = {
  pos: v(12.75, 0, 23.6),
  /** 正面の向き（ido.ts と同じ決まり：正面 = (sin y, 0, cos y)。π/2 で東） */
  yaw: Math.PI / 2,
  /** 大きさの倍率（buildShrine の scale） */
  scale: 1.18,
  /** 正面に立つ位置（おふじさん・ネクマックスが箱をのぞく） */
  front: v(14.55, 0, 23.6),
}

/** 石標（IDOのかんばん）。A は NEXTMAKE の前（もとのまま。立てたばかり）、B は橋のたもと（時計屋の看板のとなり）、
 *  C は路地の西の塀ぎわ（v7 で移す）、D は北岸の駅の大時計の前（v7 で足す） */
export const KANBAN = {
  a: { pos: N.IDO.clone(), yaw: 0 },
  b: { pos: N.IDO_B.clone(), yaw: 0 },
  c: { pos: v(15.68, 0, 16.6), yaw: Math.PI / 2 },
  d: { pos: v(0.1, 0, -5.85), yaw: Math.PI },
}
export type KanbanId = keyof typeof KANBAN

/** 時計屋の看板（柱の上の丸い時計。両面）と、北岸の駅の入口・大時計 */
export const CLOCK_SHOP = { pole: v(7.35, 0, 7.0), clockY: 3.05 }
export const STATION = { x0: -1.6, x1: 1.8, z0: -10.9, z1: -8.5, h: 2.9, clock: v(0.1, 4.25, -8.42) }

/** 立てたばかりの石標 A のまわりの物（工事の看板・鉄板・立て看板）。よろいの影獣がはりつける元 */
export const ARMOR_SOURCES: Array<{ id: 'plate' | 'koji' | 'aframe'; pos: THREE.Vector3; yaw: number }> = [
  { id: 'plate', pos: v(-1.35, 0, 6.05), yaw: 0.12 },
  { id: 'koji', pos: v(-3.0, 0, 6.15), yaw: -0.08 },
  { id: 'aframe', pos: v(-6.75, 0, 6.35), yaw: 0.35 },
]

/** 佐伯さんの測定の道具（石標 A の QR の読みこみを確かめる三脚とタブレット・折りたたみ机。机は建物ぎわへ寄せて、広場をあける） */
export const MEASURE = { table: v(-4.5, 0, 10.0), tripod: v(-5.6, 0, 7.15) }

/**
 * NEXTMAKE の前の「水辺の広場」：南岸から水路へ張り出した板の広場（6 章のよろいの影獣と戦う場所）。
 * 遊歩道（z 5〜11）と合わせて、たて 10m・よこ 26m ほど。ふちは見えない壁と低い柵（street.ts の buildGround に渡す）
 */
export const DECK = { x0: -19.5, x1: 6.5, z0: 0.9 }

export type PillarKind = 'lamp' | 'steel' | 'sign'
/**
 * 影獣が突進でぶつかる柱（街灯・工事の鉄柱・看板の柱）。pos は足元の中心、r は柱の太さ（m）。
 * 街灯の 3 本と吊り輪の門の柱はもとの町の物、鉄柱 2 本と看板の柱は広場に足す（riverDeck.ts）
 */
export const PILLARS: ReadonlyArray<{ id: string; kind: PillarKind; label: string; pos: THREE.Vector3; r: number }> = [
  { id: 'lamp_w', kind: 'lamp', label: '街灯', pos: v(-14, 0, 5.95), r: 0.16 },
  { id: 'lamp_c', kind: 'lamp', label: '街灯', pos: v(-2, 0, 5.95), r: 0.16 },
  { id: 'lamp_e', kind: 'lamp', label: '街灯', pos: v(7, 0, 5.95), r: 0.16 },
  { id: 'frame', kind: 'steel', label: '鉄の柱', pos: v(-21, 0, 6.2), r: 0.18 },
  { id: 'steel_c', kind: 'steel', label: '工事の鉄柱', pos: v(-8.6, 0, 2.7), r: 0.2 },
  { id: 'steel_w', kind: 'steel', label: '工事の鉄柱', pos: v(-16.4, 0, 2.6), r: 0.2 },
  { id: 'sign_e', kind: 'sign', label: '看板の柱', pos: v(1.6, 0, 2.5), r: 0.14 },
]

/** ラボ：佐伯さんの端末（IDO 検索）と、社長の絵（構想ボードに貼った紙） */
export const LAB = {
  /** 端末の画面の中心（作業台の上。正面は -Z＝部屋の側） */
  terminal: v(-9.25, 1.42, 22.3),
  /** 端末の前に立つ位置 */
  terminalStand: v(-9.3, 0, 21.05),
  /** 社長の絵（構想ボードの紙）の中心と、F で調べる立ち位置 */
  sketch: v(-18.53, 1.79, 20.26),
  sketchStand: v(-17.5, 0, 20.15),
  /** 絵のすみの「NEXTMAKE 001」（目印の位置） */
  sketchCorner: v(-18.52, 1.31, 19.65),
}

/** 人の立ち位置（6・9 章の仮の位置。フェーズ 2 で使う） */
export const SPOTS_V7 = {
  /** 6 章の到着：社長と佐伯さんが石標 A の映りぐあいを見ている */
  matsuiKanban: { pos: v(-2.75, 0, 7.55), face: v(-4.6, 0, 6.2) },
  saekiKanban: { pos: v(-6.15, 0, 7.55), face: v(-4.6, 0, 6.2) },
  /** ラボ：社長は絵のそば、佐伯さんは端末の前 */
  matsuiSketch: { pos: v(-17.2, 0, 20.75), face: v(-17.6, 0, 19.6) },
  saekiTerminal: { pos: v(-9.3, 0, 20.9), face: v(-7.2, 0, 18.2) },
  /** 9 章：おふじさん（ほこらの前でぜんまいを巻く。防衛戦のあいだは路地の口へ下がる） */
  ofujiWind: { pos: v(14.28, 0, 23.72), face: SHRINE.pos.clone() },
  ofujiSafe: { pos: v(16.2, 0, 19.0), face: SHRINE.pos.clone() },
  /** 錠前を見せるときと、朝の場面（ほこらの正面をあける。南の献灯の東） */
  ofujiAside: { pos: v(14.8, 0, 24.75), face: SHRINE.pos.clone() },
  /** 9 章：社長と佐伯さん（ほこらの前の両わき。献灯の外側に立ち、正面のおふじさんとカメラのあいだをあける） */
  matsuiShrine: { pos: v(15.05, 0, 21.75), face: v(14.28, 0, 23.72) },
  saekiShrine: { pos: v(15.0, 0, 25.45), face: v(14.28, 0, 23.72) },
  /** 9 章：ほこらで話すあいだのネクマックスの立ち位置（会話のカメラに入らない） */
  nexmaxShrine: { pos: v(16.75, 0, 22.55), face: v(14.28, 0, 23.72) },
  /** 9 章の防衛戦：社長が路地のかんばんへかけよる道と、映し出すときに立つ位置 */
  matsuiToKanban: [v(15.05, 0, 21.75), v(16.4, 0, 20.4), v(16.6, 0, 18.0), v(16.75, 0, 16.6)],
  matsuiProject: { pos: v(16.75, 0, 16.6), face: v(15.68, 0, 16.6) },
  /** 6 章：影獣と戦うあいだ（NEXTMAKE の入口の前へ下がる）・佐伯さんがにげる先 */
  matsuiFight: { pos: v(-9.4, 0, 9.9), face: v(-4.6, 0, 7.4) },
  saekiSafe: { pos: v(-10.7, 0, 10.35), face: v(-4.6, 0, 7.4) },
  /** 6 章：検索のあと、表の通り（路地の入口の近く）で待つ */
  matsuiWait: { pos: v(14.1, 0, 9.3), face: v(16.5, 0, 11.0) },
  saekiWait: { pos: v(13.2, 0, 8.9), face: v(16.5, 0, 11.0) },
  /** 6 章：路地のかんばんの前（三人で） */
  matsuiAlley: { pos: v(17.4, 0, 17.7), face: v(15.68, 0, 16.6) },
  saekiAlley: { pos: v(16.45, 0, 18.25), face: v(15.68, 0, 16.6) },
  /** 9 章：かけつける（表の通り → 路地） */
  matsuiRunIn: [v(16.6, 0, 9.4), v(16.9, 0, 14.0)],
  saekiRunIn: [v(15.6, 0, 9.0), v(16.25, 0, 13.2)],
  /** 9 章の防衛戦のあいだ（空き地の北東のすみ） */
  matsuiDefense: { pos: v(19.05, 0, 20.45), face: v(13.5, 0, 23.6) },
  saekiDefense: { pos: v(18.35, 0, 20.45), face: v(13.5, 0, 23.6) },
  ofujiDefense: { pos: v(18.7, 0, 21.25), face: v(13.5, 0, 23.6) },
  /** 9 章：帰りの光の輪 */
  returnRing: v(15.6, 0, 24.6),
}

/**
 * 防衛戦（9 章の夜）の舞台。影は 3 方向から来る：屋根（土蔵と長屋の屋根から、ほこらの屋根へ飛び移る）・
 * 路地の両側（北＝路地の口、南＝トンネル路地）
 */
export const DEFENSE = {
  /** 守る物（ほこらの箱の前）。影が「箱にとびかかる」ときの目標 */
  target: v(14.05, 0, 23.6),
  spawns: {
    /** 北：路地の口（遊歩道の側から路地をかけてくる） */
    north: [v(16.5, 0, 12.6), v(16.9, 0, 14.4)],
    /** 南：トンネル路地の暗がり */
    south: [v(19.6, 0, 29.6), v(19.5, 0, 28.6)],
    /** 屋根：土蔵の棟・長屋の屋根の上（ここに現れて、屋根づたいにほこらの屋根へ） */
    roof: [v(21.6, 2.62, 21.2), v(15.2, 5.85, 28.6), v(12.6, 5.85, 28.6)],
  },
  /**
   * 屋根づたいの道（影が歩く・跳ぶ点の列。最後がほこらの屋根の上）。敵は物理の当たり判定を持たないので、
   * フェーズ 2 ではこの点を順にたどらせる（跳ぶところは放物線で）
   */
  roofPaths: [
    [v(21.6, 2.62, 21.2), v(20.7, 2.37, 22.6), v(14.6, 2.6, 23.3), v(12.79, 2.55, 23.6)],
    [v(15.2, 5.85, 28.6), v(15.2, 2.9, 27.2), v(14.8, 2.5, 26.4), v(12.79, 2.13, 24.1)],
    [v(12.6, 5.85, 28.6), v(12.6, 2.9, 27.2), v(12.6, 2.5, 26.4), v(12.79, 2.13, 24.1)],
  ],
  /** ほこらの屋根の上（屋根にのぼった影がとりつく点。J で引きずり下ろす） */
  roofPerches: [v(12.79, 2.13, 23.1), v(12.79, 2.13, 24.1), v(12.79, 2.55, 23.6)],
  /** 大きな影がかくれる暗がり（かんばんの光をきらう） */
  darkCorners: [v(12.3, 0, 21.3), v(19.6, 0, 27.9), v(13.5, 0, 26.6)],
  /** プレイヤーが屋根に上がる足場（木箱の段）と金具（pull_player） */
  crates: [
    { pos: v(19.75, 0, 21.15), size: v(0.8, 0.8, 0.8) },
    { pos: v(19.8, 0.8, 21.95), size: v(0.8, 0.8, 0.8) },
    { pos: v(19.75, 0, 21.95), size: v(0.8, 0.8, 0.8) },
  ],
  hook: { point: v(20.52, 2.86, 23.6), landing: v(21.25, 2.5, 23.6) },
}

export type V7Spawn = { pos: THREE.Vector3; facing: number; camYaw: number; camPitch: number }

/** 到着地点（?spawn=）。facing は向き（0 = 北 -Z を見る）、camYaw はカメラが置かれる側（0 = プレイヤーの南） */
export const V7_SPAWNS: Record<string, V7Spawn> = {
  // 6 章：立てたばかりのかんばん（石標 A）の光の中から出てくる。目の前に NEXTMAKE のビル
  v7_nextmake: { pos: v(-4.6, 0, 7.25), facing: Math.PI, camYaw: Math.PI + 0.3, camPitch: 0.2 },
  // 9 章（8 章のダイヤル）：路地のかんばん（石標 C）の前
  v7_alley: { pos: v(16.85, 0, 15.6), facing: 2.15, camYaw: 2.75, camPitch: 0.24 },
  // ラボの入口（LAB の扉の内側）
  v7_lab: { pos: v(-7.0, 0, 18.5), facing: Math.PI / 2 + 0.35, camYaw: Math.PI / 2 + 0.55, camPitch: 0.28 },
  // 9 章：ほこらの前（空き地）
  v7_shrine: { pos: v(15.6, 0, 22.9), facing: 1.8, camYaw: 2.2, camPitch: 0.24 },
}
