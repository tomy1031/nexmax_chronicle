// 路地のおくの空き地（物語 v7 の 9 章の舞台）。古い路地を南へ抜けた先の、来年 NEXTMAKE の新しいビルを建てる予定の土地。
// ・西のはしに「時の神さま」のほこら（300 年。東向き）と、大きな古い木
// ・北：串カツの店・お好み焼の店の裏（勝手口・室外機・配管）と、路地の口
// ・南：2 階建ての長屋。北の面に下屋（低い屋根）が張り出し、1 階をくぐる暗いトンネル路地（影が来る）
// ・東：古い物置（片流れの低い屋根。木箱の段や金具で上がれる）と板塀。「建築計画のお知らせ」の看板
// ・電柱の外灯・ほこらの献灯（夜の明かり）
// 静的な物は NCtx の Batch に積む（scene の build で 1 つにまとまる）。ほこらは shrine.ts（動く部品があるので別のメッシュ）。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { mulberry32, range } from '../../../render/noise'
import type { ClawTargetDef } from '../../../player/clawLogic'
import { box, boxAB, cyl, sag, sign, tree, type NCtx } from '../kit'
import { buildShrine, shrineColliders, type Shrine } from './shrine'
import { buildNotice } from './townProps'
import { DEFENSE, LOT, SHRINE } from './layoutV7'

export type BackLot = {
  shrine: Shrine
  /** つかめる対象（物置の屋根の金具） */
  targets: ClawTargetDef[]
  /** 夜に明るくする明かり（電柱の外灯・献灯・トンネルの電球）の発光マテリアル */
  nightGlow: THREE.MeshStandardMaterial
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 地面：土と小石。飛び石が路地の口からほこらの前へ */
function ground(c: NCtx): void {
  const rng = mulberry32(915)
  boxAB(c, LOT.x0, LOT.x1, -0.02, 0.012, LOT.z0, LOT.z1, c.m.stone, { tint: '#8a7f6c', texM: 1.6, cast: false })
  // 飛び石
  const steps: Array<[number, number]> = [
    [16.45, 20.55],
    [16.0, 21.35],
    [15.45, 22.05],
    [14.95, 22.8],
    [14.55, 23.6],
  ]
  for (const [x, z] of steps) {
    const s = 0.36 + rng() * 0.12
    c.b.add(new THREE.CylinderGeometry(s, s * 1.05, 0.06, 7), c.m.stone, M(x, 0.03, z, 0, rng() * 3, 0, 1 + rng() * 0.25, 1, 0.75 + rng() * 0.2), { tint: '#b4aea2', texM: 0.6, cast: false })
  }
  // 苔と小石（ほこらのまわりと塀ぎわ）
  for (let i = 0; i < 18; i++) {
    const nearShrine = i < 10
    const x = nearShrine ? SHRINE.pos.x + range(rng, -1.6, 1.8) : range(rng, LOT.x0 + 0.3, LOT.x1 - 0.4)
    const z = nearShrine ? SHRINE.pos.z + range(rng, -2.0, 2.0) : rng() < 0.5 ? LOT.z0 + range(rng, 0.2, 0.8) : LOT.z1 - range(rng, 0.2, 1.2)
    // 苔のかたまり（低い小山をいくつか寄せる）
    for (let k = 0; k < 4; k++) {
      const s = range(rng, 0.08, 0.2)
      c.b.add(new THREE.IcosahedronGeometry(1, 0), c.m.fabric, M(x + range(rng, -0.25, 0.25), 0.0, z + range(rng, -0.25, 0.25), 0, rng() * 3, 0, s, s * 0.3, s * 1.2), { tint: rng() < 0.5 ? '#3f5e2a' : '#4c6c32', cast: false })
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = range(rng, LOT.x0 + 0.2, LOT.x1 - 0.2)
    const z = range(rng, LOT.z0 + 0.2, LOT.z1 - 0.2)
    c.b.add(new THREE.IcosahedronGeometry(1, 0), c.m.stone, M(x, 0.02, z, rng(), rng(), rng(), range(rng, 0.03, 0.07)), { tint: '#9a9284', cast: false })
  }
  // 塀ぎわの雑草（葉のカード）
  for (let i = 0; i < 22; i++) {
    const side = i % 3
    const x = side === 0 ? LOT.x0 + 0.25 : side === 1 ? range(rng, 11.5, 19.8) : LOT.kura.x0 - 0.2
    const z = side === 1 ? LOT.z1 - 1.25 + range(rng, -0.1, 0.1) : range(rng, 20.4, 27.0)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(range(rng, -0.3, 0.3), rng() * Math.PI, 0))
    const s = range(rng, 0.25, 0.5)
    c.b.add(new THREE.PlaneGeometry(1, 1), c.m.leaf, new THREE.Matrix4().compose(v(x, s * 0.45, z), q, v(s, s, s)), { tint: new THREE.Color().setHSL(0.25, 0.45, 0.36 + rng() * 0.1), uv: 'keep', cast: false })
  }
}

/** 北：店の裏（勝手口・室外機・配管・ビールケース・小さな窓） */
function northBacks(c: NCtx): void {
  // 当たり判定（建物の箱の裏の面）
  c.col.box((LOT.x0 + 15) / 2, 3, 19.8, 15 - LOT.x0, 6, 0.4)
  c.col.box((18 + LOT.x1) / 2, 3, 19.8, LOT.x1 - 18, 6, 0.4)
  const z = 20.0
  // 串カツの店の勝手口（ドア・ひさし・小さな灯り）
  boxAB(c, 12.7, 13.6, 0, 2.1, z, z + 0.05, c.m.paint, { tint: '#6a5a4a' })
  box(c, 13.45, 1.05, z + 0.07, 0.05, 0.05, 0.04, c.m.metal, { tint: '#c8ccd2', cast: false })
  c.b.add(rbox(1.3, 0.06, 0.55, 0.01), c.m.paint, M(13.15, 2.3, z + 0.28, 0.12, 0, 0), { tint: '#3a3d44' })
  c.b.add(new THREE.SphereGeometry(0.08, 10, 8), c.m.lightWarm, M(13.15, 2.15, z + 0.36), { tint: '#ffe0b0', cast: false })
  c.lights.push({ pos: v(13.15, 2.0, z + 0.6), color: '#ffc890', intensity: 1.6, dist: 5 })
  // 室外機
  for (const [x, zz] of [
    [11.9, z + 0.32],
    [19.3, z + 0.32],
  ] as const) {
    box(c, x, 0.32, zz, 0.8, 0.6, 0.3, c.m.metal, { tint: '#d8dcd8', collide: true })
    c.b.add(new THREE.CircleGeometry(0.2, 18), c.m.paint, M(x - 0.1, 0.32, zz + 0.155), { tint: '#3a3d44', cast: false })
  }
  // 配管（たて）
  for (const x of [14.65, 21.95]) cyl(c, x, 0, 5.5, z + 0.1, 0.05, c.m.metal, { tint: '#9aa0a6', seg: 8 })
  // 小さな窓（夜は明かり）
  for (const [x, y] of [
    [12.2, 3.2],
    [19.6, 3.0],
    [21.2, 3.0],
  ] as const) {
    boxAB(c, x - 0.4, x + 0.4, y - 0.3, y + 0.3, z, z + 0.04, c.m.lightWarm, { tint: '#ffcf8a', cast: false })
    for (let k = -1; k <= 1; k++) box(c, x + k * 0.27, y, z + 0.05, 0.03, 0.62, 0.02, c.m.woodPlain, { tint: '#3a2a1c', cast: false })
  }
  // ビールケースの山（勝手口の横）
  for (let i = 0; i < 4; i++) box(c, 14.1 + (i % 2) * 0.02, 0.15 + i * 0.3, z + 0.35, 0.5, 0.28, 0.36, c.m.plastic, { tint: i % 2 ? '#d8b020' : '#c8281c' })
  c.col.box(14.1, 0.6, z + 0.35, 0.5, 1.2, 0.36)
}

/** 西：古い土塀（瓦の笠）と、その向こうの古い倉庫のビル */
function westWall(c: NCtx): void {
  const x0 = LOT.x0 - 0.3
  const x1 = LOT.x0
  boxAB(c, x0, x1, 0, 2.5, LOT.z0, LOT.z1, c.m.plaster, { tint: '#cbb896', texM: 1.6 })
  boxAB(c, x1 - 0.02, x1, 0, 0.6, LOT.z0, LOT.z1, c.m.stone, { tint: '#8a8478', texM: 0.8, cast: false })
  c.b.add(rbox(0.75, 0.12, LOT.z1 - LOT.z0, 0.02), c.m.paint, M((x0 + x1) / 2, 2.58, (LOT.z0 + LOT.z1) / 2), { tint: '#3e4048' })
  for (let z = LOT.z0 + 0.1; z < LOT.z1; z += 0.24) c.b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 6, 1, false, 0, Math.PI), c.m.paint, M((x0 + x1) / 2, 2.63, z, 0, 0, Math.PI / 2), { tint: '#4a4e56', cast: false })
  c.col.box((x0 + x1) / 2, 1.6, (LOT.z0 + LOT.z1) / 2, 0.4, 3.2, LOT.z1 - LOT.z0)
  // 向こうの倉庫のビル（空がぽっかり空かないように）
  boxAB(c, 4.5, x0, 0, 9.5, LOT.z0 - 0.5, 31.5, c.m.plaster, { tint: '#bfb8ac', texM: 2.5 })
  const g = new THREE.PlaneGeometry(31.5 - LOT.z0 - 2, 5.5)
  c.b.add(g, c.m.windows, M(x0 + 0.02, 6.2, (LOT.z0 + 31.5) / 2, 0, Math.PI / 2, 0), { uv: 'scale', uvScale: [2.4, 0.5], cast: false })
}

/** 南：長屋（下屋・格子・2 階の窓・瓦屋根）と、1 階をくぐるトンネル路地 */
function nagaya(c: NCtx, bulb: THREE.MeshStandardMaterial): void {
  const N = LOT.nagaya
  const T = LOT.tunnel
  const zf = N.z0
  // 1 階の正面（トンネルの口はあける）：格子と板壁
  const seg: Array<[number, number]> = [
    [LOT.x0, T.x0],
    [T.x1, LOT.x1],
  ]
  for (const [a, b] of seg) {
    boxAB(c, a, b, 0, 2.95, zf, zf + 0.25, c.m.woodPlain, { tint: '#5a4432' })
    c.col.box((a + b) / 2, 1.5, zf + 0.12, b - a, 3.0, 0.3)
    // 格子（明るい木）
    for (let x = a + 0.25; x < b - 0.2; x += 0.13) box(c, x, 1.25, zf - 0.03, 0.04, 1.7, 0.04, c.m.woodPlain, { tint: '#9a7a54', cast: false })
    boxAB(c, a, b, 0.35, 0.42, zf - 0.06, zf, c.m.woodPlain, { tint: '#6a5038', cast: false })
    boxAB(c, a, b, 2.08, 2.16, zf - 0.06, zf, c.m.woodPlain, { tint: '#6a5038', cast: false })
  }
  // 戸口と、夜に明かりのつく窓（格子の奥）
  for (const x of [12.6, 15.4, 21.4]) boxAB(c, x - 0.45, x + 0.45, 0.42, 2.08, zf - 0.005, zf, c.m.lightWarm, { tint: '#d8a060', cast: false })
  // 下屋（低い屋根。北へ張り出す）と、その当たり判定（上を歩ける）
  const run = zf - N.shedZ0
  const rise = N.shedHigh - N.shedLow
  const tilt = Math.atan2(rise, run)
  const sl = Math.hypot(run, rise) + 0.1
  const cz = (N.shedZ0 + zf) / 2
  const cy = (N.shedLow + N.shedHigh) / 2
  c.b.add(rbox(LOT.x1 - LOT.x0 + 0.1, 0.1, sl, 0.02), c.m.paint, M((LOT.x0 + LOT.x1) / 2, cy, cz, -tilt, 0, 0), { tint: '#3c3f46' })
  for (let x = LOT.x0 + 0.1; x < LOT.x1; x += 0.24) c.b.add(new THREE.CylinderGeometry(0.045, 0.045, sl, 6, 1, false, 0, Math.PI), c.m.paint, M(x, cy + 0.06, cz, Math.PI / 2 - tilt, 0, 0), { tint: '#4a4e58', cast: false })
  // 軒の垂木と雨どい
  boxAB(c, LOT.x0, LOT.x1, N.shedLow - 0.14, N.shedLow - 0.04, N.shedZ0 - 0.02, N.shedZ0 + 0.1, c.m.metal, { tint: '#6a6e74', cast: false })
  c.col.box((LOT.x0 + LOT.x1) / 2, cy - 0.05, cz, LOT.x1 - LOT.x0, 0.2, sl, 0, -tilt)
  // 2 階（少し奥）・窓・瓦屋根
  boxAB(c, LOT.x0, LOT.x1, N.shedHigh, 5.05, zf + 0.15, N.z1, c.m.plaster, { tint: '#d8ccb4', texM: 2 })
  for (let x = LOT.x0 + 1.0; x < LOT.x1 - 0.6; x += 2.3) {
    boxAB(c, x - 0.55, x + 0.55, 3.45, 4.4, zf + 0.12, zf + 0.15, c.m.lightWarm, { tint: '#e0a868', cast: false })
    for (let k = -2; k <= 2; k++) box(c, x + k * 0.22, 3.92, zf + 0.1, 0.035, 0.98, 0.035, c.m.woodPlain, { tint: '#4a3624', cast: false })
    boxAB(c, x - 0.62, x + 0.62, 3.38, 3.45, zf + 0.02, zf + 0.15, c.m.woodPlain, { tint: '#4a3624', cast: false })
  }
  const mrun = 1.75
  const mrise = 1.2
  const mt = Math.atan2(mrise, mrun)
  const msl = Math.hypot(mrun, mrise) + 0.2
  c.b.add(rbox(LOT.x1 - LOT.x0 + 0.3, 0.12, msl, 0.02), c.m.paint, M((LOT.x0 + LOT.x1) / 2, 5.05 + mrise / 2, zf + 0.1 + mrun / 2, -mt, 0, 0), { tint: '#3a3d44' })
  for (let x = LOT.x0; x < LOT.x1 + 0.1; x += 0.26) c.b.add(new THREE.CylinderGeometry(0.05, 0.05, msl, 6, 1, false, 0, Math.PI), c.m.paint, M(x, 5.13 + mrise / 2, zf + 0.1 + mrun / 2, Math.PI / 2 - mt, 0, 0), { tint: '#484c56', cast: false })
  boxAB(c, LOT.x0 - 0.15, LOT.x1 + 0.15, 6.2, 6.4, zf + mrun - 0.05, zf + mrun + 0.25, c.m.paint, { tint: '#2e3036' })
  // 屋根の上も歩ける（影が現れる所）
  c.col.box((LOT.x0 + LOT.x1) / 2, 5.05 + mrise / 2 - 0.05, zf + 0.1 + mrun / 2, LOT.x1 - LOT.x0, 0.2, msl, 0, -mt)
  // トンネル路地（暗い。奥に電球がひとつ）
  boxAB(c, T.x0 - 0.12, T.x0, 0, T.h, zf, T.end, c.m.woodPlain, { tint: '#3a2c20' })
  boxAB(c, T.x1, T.x1 + 0.12, 0, T.h, zf, T.end, c.m.woodPlain, { tint: '#3a2c20' })
  boxAB(c, T.x0 - 0.12, T.x1 + 0.12, T.h, T.h + 0.12, zf, T.end, c.m.woodPlain, { tint: '#2a2018' })
  boxAB(c, T.x0, T.x1, 0, 0.01, zf, T.end, c.m.stone, { tint: '#5a5650', texM: 0.8, cast: false })
  // 奥は真っ暗（黒い面）
  c.b.add(new THREE.PlaneGeometry(T.x1 - T.x0, T.h), c.m.paint, M((T.x0 + T.x1) / 2, T.h / 2, T.end - 0.01, 0, Math.PI, 0), { tint: '#020203', cast: false })
  c.col.box(T.x0 - 0.06, T.h / 2, (zf + T.end) / 2, 0.14, T.h, T.end - zf)
  c.col.box(T.x1 + 0.06, T.h / 2, (zf + T.end) / 2, 0.14, T.h, T.end - zf)
  c.col.box((T.x0 + T.x1) / 2, T.h / 2, T.end - 0.4, T.x1 - T.x0, T.h, 0.3)
  c.b.add(new THREE.SphereGeometry(0.07, 10, 8), bulb, M((T.x0 + T.x1) / 2, T.h - 0.2, zf + 1.1), { cast: false })
  c.lights.push({ pos: v((T.x0 + T.x1) / 2, T.h - 0.3, zf + 1.1), color: '#ffb060', intensity: 1.2, dist: 4 })
  // 入口の上の小さな木の札「通りぬけ」
  sign(c, 'v7_tunnel', (T.x0 + T.x1) / 2, T.h + 0.32, zf - 0.03, Math.PI, 1.0, 0.3, { depth: 0.03 })
}

/** 東：古い物置（片流れの屋根）・板塀・「建築計画のお知らせ」・屋根へ上がる木箱と金具 */
function eastSide(c: NCtx, targets: ClawTargetDef[]): void {
  const K = LOT.kura
  // 物置の板壁
  boxAB(c, K.x0, K.x1, 0, K.eave, K.z0, K.z1, c.m.woodPlain, { tint: '#6a5442' })
  for (let z = K.z0 + 0.2; z < K.z1; z += 0.32) box(c, K.x0 - 0.015, K.eave / 2, z, 0.03, K.eave - 0.1, 0.05, c.m.woodPlain, { tint: '#4a3a2c', cast: false })
  boxAB(c, K.x0 - 0.03, K.x0, 0, 0.5, K.z0, K.z1, c.m.stone, { tint: '#8a8478', cast: false })
  c.col.box((K.x0 + K.x1) / 2, K.eave / 2, (K.z0 + K.z1) / 2, K.x1 - K.x0, K.eave, K.z1 - K.z0)
  // 片流れのトタン屋根（西が低い）。上を歩ける
  const run = K.x1 - K.x0
  const rise = K.ridge - K.eave
  const tilt = Math.atan2(rise, run)
  const sl = Math.hypot(run, rise) + 0.3
  const cx = (K.x0 + K.x1) / 2 - 0.1
  const cy = (K.eave + K.ridge) / 2 + 0.05
  const cz = (K.z0 + K.z1) / 2
  c.b.add(rbox(sl, 0.06, K.z1 - K.z0 + 0.3, 0.01), c.m.metal, M(cx, cy, cz, 0, 0, tilt), { tint: '#8a8e86' })
  for (let z = K.z0 - 0.1; z < K.z1 + 0.15; z += 0.16) c.b.add(new THREE.CylinderGeometry(0.02, 0.02, sl, 5, 1, false, 0, Math.PI), c.m.metal, M(cx, cy + 0.03, z, 0, 0, Math.PI / 2 + tilt), { tint: '#7a7e76', cast: false })
  c.col.box(cx, cy - 0.02, cz, sl, 0.14, K.z1 - K.z0 + 0.3, 0, 0, tilt)
  // 物置の入口（引き戸）
  boxAB(c, K.x0 - 0.04, K.x0, 0.1, 1.9, 21.2, 22.3, c.m.woodPlain, { tint: '#8a6e52', cast: false })
  // 物置と建物の裏のすきま・南の板塀
  c.col.box(K.x0 + 0.5, 1.5, (LOT.z0 + K.z0) / 2, 1.2, 3, K.z0 - LOT.z0 + 0.05)
  boxAB(c, LOT.x1 - 0.12, LOT.x1, 0, 2.4, K.z1, LOT.z1, c.m.woodPlain, { tint: '#3e3026' })
  for (let z = K.z1 + 0.15; z < LOT.z1; z += 0.4) box(c, LOT.x1 - 0.14, 1.2, z, 0.04, 2.4, 0.06, c.m.woodPlain, { tint: '#2c221a', cast: false })
  c.col.box(LOT.x1 - 0.06, 1.2, (K.z1 + LOT.z1) / 2, 0.2, 2.4, LOT.z1 - K.z1)
  // 建築計画のお知らせ（物置の西の面。西を向く）
  buildNotice(c, K.x0 - 0.06, 1.45, 23.75, -Math.PI / 2, 1.15, 0.86)
  // 木箱の段（屋根へ上がる）
  for (const cr of DEFENSE.crates) {
    const p = cr.pos
    const s = cr.size
    c.b.add(rbox(s.x, s.y, s.z, 0.03), c.m.woodPlain, M(p.x, p.y + s.y / 2, p.z), { tint: '#b08a5a' })
    for (const k of [-0.32, 0, 0.32]) box(c, p.x, p.y + s.y / 2 + k * s.y * 0.9, p.z - s.z / 2 - 0.005, s.x * 0.98, 0.06, 0.02, c.m.woodPlain, { tint: '#8a6a40', cast: false })
    c.col.box(p.x, p.y + s.y / 2, p.z, s.x, s.y, s.z)
  }
  // 屋根の縁の金具（飛びついて上がる）
  const H = DEFENSE.hook
  cyl(c, H.point.x + 0.05, K.eave, H.point.y + 0.1, H.point.z, 0.035, c.m.metal, { tint: '#2a2d33', seg: 8 })
  c.b.add(new THREE.TorusGeometry(0.14, 0.032, 8, 20), c.m.metal, M(H.point.x - 0.08, H.point.y, H.point.z, 0, Math.PI / 2, 0), { tint: '#f2c84b' })
  targets.push({
    id: 'v7_kura_hook',
    type: 'pull_player',
    label: '物置の屋根の金具',
    point: H.point.clone().setX(H.point.x - 0.08),
    radius: 0.24,
    enabled: true,
    landing: H.landing.clone(),
    via: v(H.point.x - 0.1, H.point.y + 0.35, H.point.z),
    facing: v(-1, 0, 0),
  })
}

/** 電柱と外灯（夜の空き地の明かり）・電線 */
function lampPole(c: NCtx, glow: THREE.MeshStandardMaterial): void {
  const x = 21.95
  const z = 26.7
  cyl(c, x, 0, 6.4, z, 0.13, c.m.concrete, { tint: '#b8b4ac', r1: 0.1, seg: 10 })
  c.col.box(x, 2, z, 0.3, 4, 0.3)
  // 腕木と傘つきの電球
  box(c, x - 0.45, 3.85, z, 0.9, 0.06, 0.06, c.m.metal, { tint: '#3a3d44' })
  c.b.add(new THREE.ConeGeometry(0.22, 0.14, 14, 1, true), c.m.metal, M(x - 0.85, 3.78, z), { tint: '#3a3d44', cast: false })
  c.b.add(new THREE.SphereGeometry(0.075, 10, 8), glow, M(x - 0.85, 3.7, z), { cast: false })
  c.lights.push({ pos: v(x - 0.85, 3.6, z), color: '#ffd8a0', intensity: 2.4, dist: 9 })
  sag(c, v(x, 6.2, z), v(LOT.x0 + 1.0, 5.6, LOT.nagaya.z0 + 0.4), 0.5, 0.015, c.m.rubber, '#1a1c20')
  sag(c, v(x, 6.0, z), v(16.5, 5.2, 20.0), 0.55, 0.015, c.m.rubber, '#1a1c20')
}

/** ほこらの献灯（小さな木の灯籠 2 つ）と、おふじさんの縁台 */
function shrineSide(c: NCtx, glow: THREE.MeshStandardMaterial): void {
  const p = SHRINE.pos
  for (const s of [-1, 1]) {
    const x = p.x + 1.3
    const z = p.z + s * 1.35
    cyl(c, x, 0, 0.95, z, 0.035, c.m.woodPlain, { tint: '#5a4632', seg: 6 })
    box(c, x, 1.07, z, 0.24, 0.26, 0.24, c.m.woodPlain, { tint: '#6a5038' })
    box(c, x, 1.07, z, 0.18, 0.2, 0.25, glow, { cast: false })
    box(c, x, 1.07, z, 0.25, 0.2, 0.18, glow, { cast: false })
    c.b.add(new THREE.ConeGeometry(0.22, 0.14, 4), c.m.paint, M(x, 1.27, z, 0, Math.PI / 4, 0), { tint: '#3a3d44' })
    c.lights.push({ pos: v(x, 1.1, z), color: '#ffb070', intensity: 1.2, dist: 4 })
  }
  // 縁台（おふじさんが一休みする）
  const bx = 15.9
  const bz = 26.05
  boxAB(c, bx - 0.85, bx + 0.85, 0.42, 0.48, bz - 0.3, bz + 0.3, c.m.woodPlain, { tint: '#8a6a48' })
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.22, 0.22]) boxAB(c, bx + sx - 0.04, bx + sx + 0.04, 0, 0.42, bz + sz - 0.04, bz + sz + 0.04, c.m.woodPlain, { tint: '#6a5038' })
  c.col.box(bx, 0.24, bz, 1.7, 0.48, 0.6)
  // じょうろとほうき（おふじさんの道具）
  cyl(c, bx + 0.55, 0.48, 0.66, bz, 0.08, c.m.metal, { tint: '#3a8a5a', seg: 10 })
  c.b.add(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 5), c.m.woodPlain, M(bx - 1.05, 0.65, bz - 0.25, 0.25, 0, 0.12), { tint: '#c8a870' })
  c.b.add(new THREE.ConeGeometry(0.12, 0.35, 8), c.m.fabric, M(bx - 1.02, 0.12, bz - 0.4, 0.25, 0, 0.12), { tint: '#c8b070' })
}

/** 空き地を組み立てる（看板の絵 'v7_tunnel' は先にアトラスへ入れておくこと：registerV7Art） */
export function buildBackLot(c: NCtx): BackLot {
  const targets: ClawTargetDef[] = []
  const nightGlow = new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: new THREE.Color('#ffb860'), emissiveIntensity: 1.4, roughness: 0.4, name: 'v7_lot_glow' })
  ground(c)
  northBacks(c)
  westWall(c)
  nagaya(c, nightGlow)
  eastSide(c, targets)
  lampPole(c, nightGlow)
  shrineSide(c, nightGlow)
  // 古い大きな木（ほこらの南西）
  tree(c, 11.95, 26.55, 1.3, 26)
  // ほこら（300 年。東向き）
  const shrine = buildShrine({ age: 1, seed: 2026, shadows: true, scale: SHRINE.scale })
  shrine.root.position.copy(SHRINE.pos)
  shrine.root.rotation.y = SHRINE.yaw
  c.root.add(shrine.root)
  shrineColliders(c.col, shrine, SHRINE.pos, SHRINE.yaw)
  c.lights.push({ pos: v(SHRINE.pos.x + 0.9, 1.6, SHRINE.pos.z), color: '#ffcf90', intensity: 1.4, dist: 4.5 })
  return { shrine, targets, nightGlow }
}
