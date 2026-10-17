// 2026年 大阪・なんばの配置（m）。X=東、Z=南、Y=上。水路は X 方向（東西）に流れる。
// 南岸の遊歩道（とんぼりリバーウォークのような石畳）に NEXTMAKE の会社（1 階：オフィス＋奥にラボ）と飲食店が並び、
// 北岸にも看板の大きなビルが並ぶ。東のアーチ橋で両岸がつながる。プレイ範囲はおよそ x -24〜24、z -13〜23。
import * as THREE from 'three'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export const N = {
  /** 水面の高さ */
  WL: -1.55,
  /** 水路（岸の石垣の内側） */
  CANAL_N: -5,
  CANAL_S: 5,
  /** 遊歩道の幅（岸から建物の正面まで） */
  FACADE_S: 11,
  FACADE_N: -11,
  /** プレイ範囲（見えない壁） */
  X0: -24,
  X1: 24,
  /** アーチ橋（x の中心・幅・水面からの高さ） */
  BRIDGE: { x: 13, width: 5, rise: 1.1 },
  /** NEXTMAKE（1 階はオフィス＋ラボ） */
  NM: {
    x0: -19,
    x1: -1,
    z0: 11,
    z1: 23,
    /** 入口（ガラスの自動ドア）の x 範囲 */
    door0: -11.2,
    door1: -8.8,
    /** オフィスとラボの間のガラスの仕切り（z）と、「LAB」の扉の x 範囲 */
    part: 17.2,
    lab0: -7.4,
    lab1: -5.6,
    ceil: 3.6,
    floors: 5,
  },
  /** IDO マーカー（石の標識）：足元の中心。QR の板は南（遊歩道の側）を向く */
  IDO: v(-4.6, 0, 5.85),
  /** つかむ対象 */
  SWING: { x: -21, anchorY: 6.3, beamY: 7.0, postZ: 6.2, rope: 5.0 },
  BALCONY: { x0: 8.2, x1: 12.4, y: 4.2, z0: 9.7, z1: 11 },
}

/** 人物の立ち位置 */
export const SPOTS = {
  /** 光の裂け目（初回の到着） */
  rift: v(-10.4, 0, 7.6),
  /** マツイ社長：入口の前 */
  matsuiEntrance: { pos: v(-8.3, 0, 9.7), face: v(-10.4, 0, 7.6) },
  /** マツイ社長：ラボの構想ボードの前 */
  matsuiLab: { pos: v(-15.8, 0, 20.3), face: v(-9.5, 0, 19.0) },
  /** マツイ社長：IDO の前（帰還を待っている） */
  matsuiIdo: { pos: v(-2.6, 0, 7.5), face: v(-4.6, 0, 6.6) },
  /** 佐伯：ラボの作業台の前（入ってくる人の方を向く） */
  saeki: { pos: v(-9.3, 0, 20.9), face: v(-7.2, 0, 18.2) },
  /** 社長がラボへ歩く道（入口 → オフィス → LAB の扉 → 構想ボード） */
  pathToLab: [v(-8.3, 0, 9.7), v(-9.9, 0, 11.6), v(-9.7, 0, 15.8), v(-6.5, 0, 16.6), v(-6.5, 0, 18.0), v(-11.5, 0, 18.4), v(-15.2, 0, 19.2), v(-15.8, 0, 20.3)],
  /** IDO の前 → 入口 → ラボ */
  pathIdoToLab: [v(-2.6, 0, 7.5), v(-6.5, 0, 8.6), v(-9.9, 0, 10.2), v(-9.9, 0, 11.6), v(-9.7, 0, 15.8), v(-6.5, 0, 16.6), v(-6.5, 0, 18.0), v(-11.5, 0, 18.4), v(-15.2, 0, 19.2), v(-15.8, 0, 20.3)],
}

export type NambaSpawn = { pos: THREE.Vector3; facing: number; camYaw: number; camPitch: number }

/** 到着地点（?spawn=）。camYaw はカメラが置かれる側の向き（0 = プレイヤーの南） */
export const NAMBA_SPAWNS: Record<string, NambaSpawn> = {
  // 初回：光の裂け目から NEXTMAKE の前に落ちる（入口とマツイ社長が見える）
  present_start: { pos: v(-10.4, 0, 7.6), facing: Math.PI - 0.35, camYaw: Math.PI - 0.55, camPitch: 0.22 },
  // 1726年からの帰還：IDO の前（水路と北岸の看板を背に石の標識）
  present_ido: { pos: v(-4.6, 0, 8.3), facing: 0, camYaw: 0.25, camPitch: 0.2 },
  // 遊歩道の東（橋と看板の通りを見渡す）
  street: { pos: v(6.5, 0, 7.8), facing: -Math.PI / 2, camYaw: -Math.PI / 2 - 0.35, camPitch: 0.22 },
  // オフィスの中（入口の内側）
  office: { pos: v(-10, 0, 12.6), facing: Math.PI, camYaw: Math.PI, camPitch: 0.3 },
  // ラボの中
  lab: { pos: v(-6.5, 0, 18.4), facing: Math.PI + 0.6, camYaw: Math.PI + 0.6, camPitch: 0.32 },
  // 北岸（振り子で渡った先）
  north: { pos: v(-18, 0, -8), facing: Math.PI, camYaw: Math.PI, camPitch: 0.2 },
  // 2 階のバルコニーの金具を見上げる
  balcony: { pos: v(10.3, 0, 7.4), facing: Math.PI, camYaw: Math.PI + 0.1, camPitch: -0.25 },
  // 振り子の吊り輪
  swing: { pos: v(-21, 0, 8.4), facing: 0, camYaw: 0.1, camPitch: -0.2 },
}
