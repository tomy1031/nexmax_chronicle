// 源兵衛の工房（7 章）：通りの表から入れる、からくり時計の職人の仕事場。
// 表：大看板「源兵衛」・歯車の暖簾・格子・軒の歯車（導入編の genbeiWorkshop と同じ顔）。戸口の暖簾をくぐって入る。
// 中：板の間・梁の天井・歯車の棚（西の壁）・作業台（からくりのうで・組みかけの和時計）・書の見台（ひらいた本）・
//     奥の箪笥の上の木の箱（青い刃のかけら）・道具の壁と櫓時計（東の壁）・行灯 3 つ・裏口（南の広場へ）。
// 動く物（本・木の箱とかけら・からくりのうで）は別のクラス。静的な物は町のバッチに積む。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../../render/batch'
import { ColliderList } from '../../../world/colliders'
import { WOOD, crate, barrel, deck, gableRoof, lantern, noren, ropeCoil, shedRoof, signboard, woodBox, woodTint, type Ctx } from '../../../world/edo/kit'
import { range, pick } from '../../../render/noise'
import { C, WORKSHOP_SPOTS } from './layout'
import { andon, clockMovement, gearGeometry, shide, yaguraClock } from './parts'
import { paintSpread } from './pages'
import { TempSlit } from './slit'
import { drawLettering, makeCanvas } from '../../../render/textures'
import { V7_ART } from '../../../chronicle/art'

const W = C.WORKSHOP
const X0 = W.x0
const X1 = W.x1
const Z0 = W.z0
const Z1 = W.z1
const CX = (X0 + X1) / 2
const H1 = W.h1
const H = W.h1 + W.h2
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 作業台（上面の高さ・範囲） */
const BENCH = { x0: -18.6, x1: -16.0, z0: 17.05, z1: 18.15, y: 0.84 }
/** 書の見台 */
const DESK = { x: WORKSHOP_SPOTS.book.x, z: WORKSHOP_SPOTS.book.z, y: 0.62 }
/** 見台の傾いた板（中心と傾き） */
const BOOK_REST = { y: DESK.y + 0.12, z: DESK.z + 0.04, tilt: 0.6 }
/** 奥の箪笥（木の箱をのせる） */
const CHEST = { x: WORKSHOP_SPOTS.box.x, z: Z1 - 0.45, w: 1.15, h: 0.78, d: 0.5 }

export type WorkshopParts = {
  book: GenbeiBook
  box: FragmentBox
  arm: KarakuriArm
  /** 源兵衛の実演の切れ目（仮。visuals の SlitFx に置きかえる） */
  slit: TempSlit
  /** 表の戸口・裏口（床の中心） */
  frontDoor: THREE.Vector3
  backDoor: THREE.Vector3
  /** 中にいるか（x,z） */
  inside(p: THREE.Vector3): boolean
  update(dt: number, t: number, camera: THREE.Camera): void
}

// ---------------------------------------------------------------- 建物（静的）

export function buildWorkshop(c: Ctx, root: THREE.Group): WorkshopParts {
  buildShell(c)
  buildFacade(c)
  buildInterior(c)
  const book = new GenbeiBook(c)
  const box = new FragmentBox(c)
  const arm = new KarakuriArm(c)
  const slit = new TempSlit()
  root.add(book.root, box.root, arm.root, slit.mesh)
  return {
    book,
    box,
    arm,
    slit,
    frontDoor: v((W.door.x0 + W.door.x1) / 2, 0, Z0),
    backDoor: v((W.backDoor.x0 + W.backDoor.x1) / 2, 0, Z1),
    inside: (p) => p.x > X0 && p.x < X1 && p.z > Z0 && p.z < Z1,
    update(dt, t, camera) {
      book.update(dt)
      box.update(dt, t)
      arm.update(dt, slit)
      slit.update(dt, camera)
    },
  }
}

/** 土台・壁・柱・天井・屋根と当たり判定 */
function buildShell(c: Ctx): void {
  const postT = woodTint(c.rng, WOOD.dark, 0.08)
  const plasterT = '#fff6ea'
  const wall = (x: number, y: number, z: number, sx: number, sy: number, sz: number, tint = plasterT) => c.b.add(rbox(sx, sy, sz, 0.02), c.m.plaster, M(x, y, z), { tint, texM: 3 })
  const wains = (x: number, z: number, sx: number, sz: number) => c.b.add(rbox(sx, 1.0, sz, 0.01), c.m.planks, M(x, 0.55, z), { tint: woodTint(c.rng, WOOD.aged), texM: 1.6 })
  // 土台（石）
  c.b.add(rbox(X1 - X0, 0.24, 0.5, 0.04), c.m.stoneWall, M(CX, 0.12 - 0.2, Z0 + 0.25), { tint: '#e9e2d6', texM: 3 })
  // 床：戸口の前は土間（たたき）、奥は板の間
  c.b.add(rbox(X1 - X0 - 0.3, 0.06, 1.7, 0.01), c.m.plaster, M(CX, 0.0, Z0 + 1.0), { tint: '#9a7a5c', texM: 2 })
  deck(c, X0 + 0.15, X1 - 0.15, Z0 + 1.85, Z1 - 0.15, 0.06, { alongX: true, posts: false, tint: WOOD.warm })
  // 上がり框（土間と板の間のさかい）
  woodBox(c, CX, 0.03, Z0 + 1.85, X1 - X0 - 0.3, 0.07, 0.12, { tint: WOOD.dark })
  // 西と東の壁（外は漆喰、内は漆喰＋腰板）
  wall(X0 + 0.08, H / 2, (Z0 + Z1) / 2, 0.16, H, Z1 - Z0)
  wall(X1 - 0.08, H / 2, (Z0 + Z1) / 2, 0.16, H, Z1 - Z0)
  wains(X0 + 0.19, (Z0 + Z1) / 2, 0.04, Z1 - Z0 - 0.3)
  wains(X1 - 0.19, (Z0 + Z1) / 2, 0.04, Z1 - Z0 - 0.3)
  c.col.box(X0 + 0.08, 3, (Z0 + Z1) / 2, 0.24, 6, Z1 - Z0)
  c.col.box(X1 - 0.08, 3, (Z0 + Z1) / 2, 0.24, 6, Z1 - Z0)
  // 奥の壁（裏口をあける）
  const bd = W.backDoor
  const doorH = 2.25
  wall((X0 + bd.x0) / 2, H / 2, Z1 - 0.08, bd.x0 - X0, H, 0.16)
  wall((bd.x1 + X1) / 2, H / 2, Z1 - 0.08, X1 - bd.x1, H, 0.16)
  wall((bd.x0 + bd.x1) / 2, (doorH + H) / 2, Z1 - 0.08, bd.x1 - bd.x0, H - doorH, 0.16)
  wains((X0 + bd.x0) / 2, Z1 - 0.19, bd.x0 - X0 - 0.3, 0.04)
  c.col.box((X0 + bd.x0) / 2, 3, Z1 - 0.08, bd.x0 - X0, 6, 0.24)
  c.col.box((bd.x1 + X1) / 2, 3, Z1 - 0.08, X1 - bd.x1, 6, 0.24)
  // 裏口の枠と、開けた板戸・沓脱石
  for (const x of [bd.x0, bd.x1]) woodBox(c, x, doorH / 2, Z1 - 0.08, 0.14, doorH, 0.24, { tint: postT })
  woodBox(c, (bd.x0 + bd.x1) / 2, doorH + 0.06, Z1 - 0.08, bd.x1 - bd.x0 + 0.3, 0.14, 0.26, { tint: postT })
  c.b.add(rbox(bd.x1 - bd.x0 - 0.1, doorH - 0.1, 0.05, 0.01), c.m.planks, M(bd.x1 + (bd.x1 - bd.x0) / 2 - 0.05, doorH / 2, Z1 + 0.03), { tint: woodTint(c.rng, WOOD.aged), texM: 1.6 })
  c.b.add(rbox(1.1, 0.16, 0.6, 0.06), c.m.stoneWall, M((bd.x0 + bd.x1) / 2, 0.06, Z1 + 0.45), { tint: '#d8d0c4', texM: 1.2 })
  shedRoof(c, (bd.x0 + bd.x1) / 2, Z1 + 0.5, bd.x1 - bd.x0 + 1.4, 1.0, doorH + 0.75, 0, 0.35)
  // 外の腰板（焼杉）：東の壁（路地）と奥の壁（広場）。東の壁の高い所に格子の小窓
  const yaki = (x: number, z: number, sx: number, sz: number) => c.b.add(rbox(sx, 1.9, sz, 0.01), c.m.planks, M(x, 0.95, z), { tint: '#4e4038', texM: 1.6 })
  yaki(X1 + 0.03, (Z0 + Z1) / 2, 0.04, Z1 - Z0 - 0.4)
  yaki((X0 + bd.x0) / 2, Z1 + 0.03, bd.x0 - X0 - 0.3, 0.04)
  yaki((bd.x1 + X1) / 2 + 0.6, Z1 + 0.03, X1 - bd.x1 - 1.6, 0.04)
  for (const z of [Z0 + 2.4, Z0 + 5.4]) {
    c.b.add(rbox(0.06, 0.7, 1.1, 0.01), c.m.wood, M(X1 + 0.03, 2.7, z), { tint: WOOD.dark, texM: 1.6 })
    c.b.add(rbox(0.03, 0.56, 0.96, 0), c.m.shoji, M(X1 + 0.02, 2.7, z), { texM: 1, cast: false })
    for (let k = 0; k < 7; k++) c.b.add(rbox(0.05, 0.6, 0.035, 0), c.m.wood, M(X1 + 0.07, 2.7, z - 0.45 + k * 0.15), { tint: WOOD.dark, texM: 1 })
  }
  // 柱（四隅と表の柱）
  for (const [x, z] of [
    [X0 + 0.12, Z0 + 0.14],
    [X1 - 0.12, Z0 + 0.14],
    [X0 + 0.12, Z1 - 0.14],
    [X1 - 0.12, Z1 - 0.14],
    [W.door.x0 - 0.07, Z0 + 0.14],
    [W.door.x1 + 0.07, Z0 + 0.14],
    [X0 + 2.1, Z0 + 0.14],
    [X1 - 2.1, Z0 + 0.14],
    [X0 + 0.12, (Z0 + Z1) / 2],
    [X1 - 0.12, (Z0 + Z1) / 2],
  ] as const) {
    woodBox(c, x, H / 2, z, 0.22, H, 0.22, { tint: postT })
  }
  // 天井：梁と板（2 階の床）。カメラが屋根の中に入らないよう天井の当たり判定
  for (let z = Z0 + 1.2; z < Z1 - 0.5; z += 1.9) woodBox(c, CX, H1 - 0.12, z, X1 - X0 - 0.2, 0.26, 0.24, { tint: woodTint(c.rng, WOOD.dark, 0.06), uAxis: 0 })
  woodBox(c, CX, H1 - 0.3, (Z0 + Z1) / 2, 0.3, 0.34, Z1 - Z0 - 0.3, { tint: woodTint(c.rng, WOOD.veryDark, 0.05), uAxis: 2 })
  c.b.add(rbox(X1 - X0 - 0.2, 0.06, Z1 - Z0 - 0.2, 0.01), c.m.planks, M(CX, H1 + 0.03, (Z0 + Z1) / 2), { tint: woodTint(c.rng, WOOD.aged), texM: 2 })
  c.col.box(CX, H1 + 0.25, (Z0 + Z1) / 2, X1 - X0, 0.4, Z1 - Z0)
  // 胴差し（表）と 2 階の正面
  woodBox(c, CX, H1 - 0.02, Z0 + 0.12, X1 - X0 + 0.05, 0.32, 0.26, { tint: postT })
  wall(CX, H1 + W.h2 / 2 + 0.1, Z0 + 0.5, X1 - X0 - 0.2, W.h2 - 0.2, 0.18)
  woodBox(c, CX, H - 0.1, Z0 + 0.45, X1 - X0 + 0.05, 0.22, 0.24, { tint: postT })
  // 2 階の虫籠窓
  for (const lx of [-2.6, 2.6]) {
    c.b.add(rbox(1.6, 0.9, 0.06, 0.01), c.m.wood, M(CX + lx, H1 + W.h2 * 0.55, Z0 + 0.38), { tint: WOOD.dark, texM: 1.6 })
    c.b.add(rbox(1.42, 0.75, 0.03, 0), c.m.shoji, M(CX + lx, H1 + W.h2 * 0.55, Z0 + 0.42), { texM: 1.42, cast: false })
    for (let k = 0; k <= 11; k++) c.b.add(rbox(0.05, 0.8, 0.06, 0), c.m.plaster, M(CX + lx - 0.71 + k * 0.13, H1 + W.h2 * 0.55, Z0 + 0.36), { tint: plasterT, texM: 1 })
  }
  // 庇（表）と大屋根
  shedRoof(c, CX, Z0 - 0.45, X1 - X0 + 0.3, 1.2, H1 + 0.55, Math.PI, 0.42)
  gableRoof(c, CX, (Z0 + Z1) / 2 + 0.1, X1 - X0 + 0.5, Z1 - Z0 + 1.3, H + 0.05, 1.6, 'x')
  // 卯建
  for (const e of [-1, 1]) {
    c.b.add(rbox(0.18, 1.5, 0.9, 0.02), c.m.plaster, M(CX + e * ((X1 - X0) / 2 - 0.1), H1 + 1.1, Z0), { tint: plasterT, texM: 3 })
    c.b.add(rbox(0.36, 0.14, 1.1, 0.03), c.m.roof, M(CX + e * ((X1 - X0) / 2 - 0.1), H1 + 1.92, Z0 - 0.05), { tint: '#8d96a6', texM: 2 })
  }
}

/** 表の顔：格子・障子・戸口の暖簾・大看板・袖看板・軒の歯車・提灯・店先の道具 */
function buildFacade(c: Ctx): void {
  const postT = woodTint(c.rng, WOOD.dark, 0.08)
  const d = W.door
  // 格子（出格子）と障子：戸口の左右
  const lattice = (x0: number, x1: number) => {
    const n = Math.floor((x1 - x0) / 0.085)
    for (let k = 0; k < n; k++) c.b.add(rbox(0.035, 2.0, 0.05, 0), c.m.wood, M(x0 + 0.06 + (k * (x1 - x0 - 0.12)) / (n - 1), 1.3, Z0 + 0.05), { tint: WOOD.dark, texM: 1.6 })
    woodBox(c, (x0 + x1) / 2, 0.27, Z0 + 0.05, x1 - x0, 0.1, 0.12, { tint: postT })
    woodBox(c, (x0 + x1) / 2, 2.33, Z0 + 0.05, x1 - x0, 0.1, 0.12, { tint: postT })
    c.b.add(rbox(x1 - x0 - 0.05, 2.1, 0.04, 0), c.m.shoji, M((x0 + x1) / 2, 1.3, Z0 + 0.3), { texM: x1 - x0, cast: false })
    // 格子の上の漆喰
    c.b.add(rbox(x1 - x0, H1 - 2.4, 0.16, 0.01), c.m.plaster, M((x0 + x1) / 2, 2.4 + (H1 - 2.4) / 2, Z0 + 0.2), { tint: '#fff6ea', texM: 3 })
  }
  lattice(X0 + 0.2, d.x0 - 0.12)
  lattice(d.x1 + 0.12, X1 - 0.2)
  // 表の当たり判定（戸口だけあける）
  c.col.box((X0 + d.x0) / 2, 3, Z0 + 0.15, d.x0 - X0, 6, 0.3)
  c.col.box((d.x1 + X1) / 2, 3, Z0 + 0.15, X1 - d.x1, 6, 0.3)
  // 戸口の上の鴨居と漆喰、歯車の暖簾
  woodBox(c, (d.x0 + d.x1) / 2, 2.42, Z0 + 0.1, d.x1 - d.x0 + 0.3, 0.16, 0.24, { tint: postT })
  c.b.add(rbox(d.x1 - d.x0, H1 - 2.5, 0.16, 0.01), c.m.plaster, M((d.x0 + d.x1) / 2, 2.5 + (H1 - 2.5) / 2, Z0 + 0.2), { tint: '#fff6ea', texM: 3 })
  noren(c, (d.x0 + d.x1) / 2, 2.36, Z0 - 0.04, d.x1 - d.x0 - 0.05, 0.85, 0, 'gearIndigo')
  // 格子の前の飾り暖簾（短い）
  for (const x of [X0 + 1.25, X1 - 1.25]) noren(c, x, 3.15, Z0 - 0.05, 1.55, 0.6, 0, 'gearIndigo')
  // 大看板「源兵衛」＋歯車
  signboard(c, { text: '源兵衛', w: 1024, h: 340, gear: true }, CX + 0.4, 4.6, Z0 - 0.1, Math.PI, 4.4, 1.45, 0.16)
  for (const e of [-1, 1]) woodBox(c, CX + 0.4 + e * 1.9, 5.43, Z0 + 0.1, 0.14, 0.14, 0.5, { tint: WOOD.dark })
  // からくり縦看板（西の角の柱）
  woodBox(c, X0 - 0.35, 2.4, Z0 - 1.0, 0.22, 4.8, 0.22, { tint: WOOD.dark })
  signboard(c, { text: 'からくり', vertical: true, w: 200, h: 720, gear: true }, X0 - 0.52, 3.0, Z0 - 1.0, -Math.PI / 2, 0.62, 2.3, 0.1)
  // 袖看板（東の角から通りへ突き出す）
  {
    const x = X1 - 1.6
    signboard(c, { text: '源兵衛', w: 900, h: 340, gear: true }, x, 4.3, Z0 - 1.3, -Math.PI / 2, 2.5, 0.95, 0.12)
    for (const dz of [-0.9, 0.9]) woodBox(c, x, 4.9, Z0 - 1.3 + dz, 0.1, 0.25, 0.1, { tint: WOOD.dark })
    woodBox(c, x, 5.05, Z0 - 0.65, 0.14, 0.14, 2.2, { tint: WOOD.dark })
  }
  // 軒から吊るした歯車
  for (const [lx, r, drop] of [
    [-3.9, 0.32, 0.9],
    [-2.0, 0.22, 0.6],
    [2.1, 0.28, 0.75],
    [3.9, 0.2, 0.55],
  ] as const) {
    const x = CX + lx
    const z = Z0 - 0.9
    const topY = 3.35
    c.b.add(new THREE.CylinderGeometry(0.01, 0.01, drop, 4), c.m.iron, M(x, topY - drop / 2, z), { cast: false })
    c.b.add(gearGeometry(r, 0.06, 10), c.m.brass, M(x, topY - drop - r, z), { cast: false })
  }
  // 提灯（表の両角）
  for (const x of [X0 + 0.6, X1 - 0.6]) lantern(c, x, H1 - 0.2, Z0 - 1.0, { kind: 'cream', cord: 0.15 })
  // 店先の道具（戸口はあけておく）
  crate(c, X0 + 1.0, 0, Z0 - 0.9, 0.62, 0.2)
  crate(c, X0 + 1.0, 0.62, Z0 - 0.9, 0.45, -0.2)
  crate(c, X1 - 1.6, 0, Z0 - 0.85, 0.55, 0.3)
  barrel(c, X1 - 0.75, 0, Z0 - 0.75)
  ropeCoil(c, X0 + 2.2, 0, Z0 - 0.7)
  // 立てかけた大きな木の歯車
  for (const [x, r, y] of [
    [X0 + 0.55, 0.55, 0.6],
    [X1 - 2.4, 0.42, 0.48],
  ] as const) {
    c.b.add(gearGeometry(r, 0.12, 12, { spokes: 4 }), c.m.wood, M(x, y, Z0 - 0.22), { tint: WOOD.honey, texM: 1 })
  }
}

/** 中の家具と道具 */
function buildInterior(c: Ctx): void {
  const rng = c.rng
  // ---------------------------------------------------------- 作業台
  const B = BENCH
  const bx = (B.x0 + B.x1) / 2
  const bz = (B.z0 + B.z1) / 2
  woodBox(c, bx, B.y - 0.05, bz, B.x1 - B.x0, 0.1, B.z1 - B.z0, { tint: woodTint(rng, WOOD.honey), uAxis: 0 })
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const) {
    woodBox(c, bx + dx * ((B.x1 - B.x0) / 2 - 0.12), (B.y - 0.1) / 2 + 0.03, bz + dz * ((B.z1 - B.z0) / 2 - 0.1), 0.12, B.y - 0.1, 0.12, { tint: WOOD.dark })
  }
  woodBox(c, bx, 0.28, bz, B.x1 - B.x0 - 0.2, 0.05, B.z1 - B.z0 - 0.2, { tint: woodTint(rng, WOOD.aged) })
  c.col.box(bx, B.y / 2, bz, B.x1 - B.x0, B.y, B.z1 - B.z0)
  // 台の上：組みかけの和時計・歯車・ぜんまい・道具・万力・木くず
  clockMovement(c, B.x0 + 0.45, B.y, bz - 0.15, 1.3, 0.3)
  clockMovement(c, B.x0 + 1.2, B.y, bz + 0.25, 1.0, -0.4)
  for (let i = 0; i < 9; i++) {
    const r = range(rng, 0.03, 0.09)
    c.b.add(gearGeometry(r, 0.012, Math.round(8 + r * 120)), c.m.brass, M(range(rng, B.x0 + 0.2, B.x1 - 0.8), B.y + 0.007, range(rng, B.z0 + 0.12, B.z1 - 0.12), -Math.PI / 2, 0, range(rng, 0, 6)))
  }
  // ぜんまい（渦巻き）
  for (let i = 0; i < 2; i++) {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k < 60; k++) {
      const a = k * 0.32
      const r = 0.008 + k * 0.0011
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))
    }
    c.b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.0025, 4), c.m.iron, M(B.x0 + 1.75 + i * 0.16, B.y + 0.004, B.z0 + 0.2 + i * 0.1), { cast: false })
  }
  // 万力
  c.b.add(rbox(0.16, 0.12, 0.12, 0.01), c.m.iron, M(B.x0 + 0.12, B.y + 0.06, B.z0 + 0.1))
  c.b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.2, 6), c.m.iron, M(B.x0 + 0.12, B.y + 0.09, B.z0 - 0.02, Math.PI / 2, 0, 0))
  // 鑿・小刀・やすり・金槌
  for (let i = 0; i < 5; i++) {
    const x = B.x0 + 0.5 + i * 0.13
    const z = B.z1 - 0.15
    woodBox(c, x, B.y + 0.012, z, 0.025, 0.022, 0.12, { tint: WOOD.dark, rotY: range(rng, -0.2, 0.2) })
    c.b.add(rbox(0.012, 0.006, 0.1, 0), c.m.iron, M(x, B.y + 0.006, z - 0.11, 0, range(rng, -0.1, 0.1), 0))
  }
  woodBox(c, B.x1 - 0.95, B.y + 0.02, B.z1 - 0.2, 0.3, 0.04, 0.04, { tint: WOOD.dark, rotY: 0.5 })
  c.b.add(rbox(0.07, 0.07, 0.11, 0.01), c.m.iron, M(B.x1 - 1.08, B.y + 0.04, B.z1 - 0.12, 0, 0.5, 0))
  // 木くず
  for (let i = 0; i < 14; i++) {
    c.b.add(new THREE.TorusGeometry(0.012, 0.003, 4, 8, Math.PI * 1.4), c.m.wood, M(range(rng, B.x0, B.x1 - 0.5), B.y + 0.006, range(rng, B.z0 + 0.05, B.z1 - 0.05), Math.PI / 2, 0, range(rng, 0, 6)), { tint: WOOD.fresh, cast: false })
  }
  // 腰かけ
  woodBox(c, bx - 0.4, 0.22, B.z1 + 0.55, 0.42, 0.06, 0.32, { tint: WOOD.warm })
  for (const dx of [-0.16, 0.16]) woodBox(c, bx - 0.4 + dx, 0.11, B.z1 + 0.55, 0.06, 0.22, 0.28, { tint: WOOD.dark })

  // ---------------------------------------------------------- 書の見台（ひらいた本は GenbeiBook）
  {
    const D0 = DESK
    woodBox(c, D0.x, D0.y - 0.04, D0.z, 0.95, 0.06, 0.62, { tint: woodTint(rng, WOOD.warm), uAxis: 0 })
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      woodBox(c, D0.x + dx * 0.4, (D0.y - 0.07) / 2 + 0.03, D0.z + dz * 0.24, 0.07, D0.y - 0.07, 0.07, { tint: WOOD.dark })
    }
    // 傾いた本の台（見台）：読む人（北）の方へ傾ける。下のふちに本を受ける桟
    woodBox(c, D0.x, BOOK_REST.y, BOOK_REST.z, 0.58, 0.03, 0.42, { tint: WOOD.dark, rotX: -BOOK_REST.tilt })
    woodBox(c, D0.x, BOOK_REST.y - Math.sin(BOOK_REST.tilt) * 0.2 + 0.01, BOOK_REST.z - Math.cos(BOOK_REST.tilt) * 0.2 - 0.01, 0.6, 0.05, 0.03, { tint: WOOD.dark })
    for (const dx of [-0.25, 0.25]) woodBox(c, D0.x + dx, (D0.y + BOOK_REST.y) / 2, BOOK_REST.z + 0.12, 0.03, BOOK_REST.y - D0.y, 0.03, { tint: WOOD.dark })
    // 硯と筆
    c.b.add(rbox(0.12, 0.025, 0.18, 0.01), c.m.darkLacquer, M(D0.x + 0.36, D0.y + 0.0, D0.z - 0.12))
    c.b.add(new THREE.CylinderGeometry(0.006, 0.004, 0.2, 6), c.m.wood, M(D0.x + 0.36, D0.y + 0.03, D0.z + 0.08, Math.PI / 2, 0, 0.2), { tint: WOOD.honey })
    c.col.box(D0.x, 0.45, D0.z, 0.95, 0.9, 0.62)
  }

  // ---------------------------------------------------------- 歯車の棚（西の壁）
  {
    const x = X0 + 0.48
    for (let u = 0; u < 3; u++) {
      const z = Z0 + 2.3 + u * 1.85
      const h = 2.55
      // 枠
      for (const dz of [-0.88, 0.88]) woodBox(c, x, h / 2, z + dz, 0.5, h, 0.06, { tint: WOOD.dark })
      woodBox(c, x - 0.24, h / 2, z, 0.03, h, 1.8, { tint: woodTint(rng, WOOD.aged) })
      for (let s = 0; s < 5; s++) {
        const y = 0.12 + s * 0.6
        woodBox(c, x, y, z, 0.5, 0.04, 1.8, { tint: woodTint(rng, WOOD.warm) })
        if (s === 4) break
        // 棚の上：立てた歯車・小箱・人形の頭・巻物
        let zz = z - 0.8
        while (zz < z + 0.75) {
          const k = rng()
          if (k < 0.5) {
            const r = range(rng, 0.08, 0.24)
            const mat = rng() < 0.6 ? c.m.brass : c.m.wood
            c.b.add(gearGeometry(r, 0.03, Math.round(10 + r * 40), r > 0.16 ? { spokes: 4 } : {}), mat, M(x - 0.02, y + 0.02 + r + 0.03, zz + r, 0, Math.PI / 2 + range(rng, -0.25, 0.25), range(rng, 0, 1)), { tint: mat === c.m.wood ? WOOD.honey : '#ffffff', texM: 1 })
            zz += r * 2 + 0.05
          } else if (k < 0.75) {
            const s2 = range(rng, 0.14, 0.24)
            c.b.add(rbox(0.3, s2, s2 * 1.2, 0.01), c.m.wood, M(x, y + 0.02 + s2 / 2, zz + s2 * 0.6), { tint: woodTint(rng, WOOD.honey), texM: 0.6 })
            zz += s2 * 1.2 + 0.05
          } else if (k < 0.88) {
            // からくり人形の頭（白い顔・黒い髪）
            c.b.add(new THREE.SphereGeometry(0.07, 12, 9), c.m.plain, M(x, y + 0.09, zz + 0.08), { tint: '#f4e2c8' })
            c.b.add(new THREE.SphereGeometry(0.073, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), c.m.darkLacquer, M(x, y + 0.1, zz + 0.08))
            zz += 0.2
          } else {
            c.b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), c.m.plain, M(x, y + 0.05, zz + 0.05, 0, 0, Math.PI / 2), { tint: pick(rng, ['#e8dcc0', '#d8c8a0', '#c94a3a']) })
            zz += 0.12
          }
        }
      }
    }
    c.col.box(X0 + 0.48, 1.3, Z0 + 4.15, 0.55, 2.6, 5.6)
  }

  // ---------------------------------------------------------- 東の壁：道具の板・櫓時計・ばね樽
  {
    const x = X1 - 0.2
    woodBox(c, x - 0.02, 1.7, Z0 + 3.3, 0.04, 1.3, 2.4, { tint: woodTint(rng, WOOD.aged) })
    for (let i = 0; i < 9; i++) {
      const z = Z0 + 2.3 + i * 0.25
      const y = 1.6 + (i % 3) * 0.32
      woodBox(c, x - 0.07, y, z, 0.04, 0.24, 0.035, { tint: WOOD.dark })
      c.b.add(rbox(0.02, 0.16, 0.05, 0), c.m.iron, M(x - 0.08, y - 0.18, z))
    }
    // 鋸（のこぎり）
    c.b.add(rbox(0.01, 0.12, 0.55, 0.005), c.m.iron, M(x - 0.06, 2.2, Z0 + 4.0))
    woodBox(c, x - 0.06, 2.2, Z0 + 4.36, 0.03, 0.04, 0.2, { tint: WOOD.honey })
    // 櫓時計（文字盤は北を向く）
    yaguraClock(c, X1 - 0.65, Z0 + 5.6, 0.06, 0)
    c.col.box(X1 - 0.65, 0.8, Z0 + 5.6, 0.6, 1.6, 0.6)
    barrel(c, X1 - 0.6, 0.06, Z0 + 6.6, 0.8)
  }

  // ---------------------------------------------------------- 奥：箪笥（木の箱の台）と神棚
  {
    const K = CHEST
    c.b.add(rbox(K.w, K.h, K.d, 0.02), c.m.wood, M(K.x, K.h / 2 + 0.06, K.z), { tint: woodTint(rng, '#a8744a', 0.05), texM: 1.2 })
    // 引き出しと金具
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 2; k++) {
        const y = 0.2 + r * 0.24
        const x = K.x + (k - 0.5) * (K.w / 2)
        c.b.add(rbox(K.w / 2 - 0.04, 0.2, 0.02, 0.005), c.m.wood, M(x, y + 0.06, K.z - K.d / 2 - 0.005), { tint: woodTint(rng, '#b8845a', 0.04), texM: 0.6 })
        c.b.add(new THREE.TorusGeometry(0.03, 0.006, 5, 12, Math.PI), c.m.iron, M(x, y + 0.06, K.z - K.d / 2 - 0.03, 0, 0, Math.PI))
      }
    }
    for (const dx of [-1, 1]) c.b.add(rbox(0.06, K.h, 0.02, 0), c.m.iron, M(K.x + dx * (K.w / 2 - 0.03), K.h / 2 + 0.06, K.z - K.d / 2 - 0.01))
    c.col.box(K.x, 0.5, K.z, K.w, 1.0, K.d)
    // 神棚（箱の上の壁。小さな社と注連縄・紙垂）
    const y = 2.35
    woodBox(c, K.x, y, Z1 - 0.32, 1.3, 0.05, 0.36, { tint: woodTint(rng, WOOD.fresh) })
    for (const dx of [-0.55, 0.55]) woodBox(c, K.x + dx, y - 0.16, Z1 - 0.25, 0.04, 0.3, 0.2, { tint: WOOD.warm, rotX: -0.6 })
    c.b.add(rbox(0.32, 0.26, 0.2, 0.01), c.m.wood, M(K.x, y + 0.16, Z1 - 0.3), { tint: WOOD.fresh, texM: 0.6 })
    c.b.add(rbox(0.42, 0.04, 0.3, 0.01), c.m.wood, M(K.x, y + 0.31, Z1 - 0.3), { tint: WOOD.warm, texM: 0.6 })
    const rope: THREE.Vector3[] = []
    for (let k = 0; k <= 10; k++) rope.push(new THREE.Vector3(K.x - 0.6 + k * 0.12, y + 0.48 - Math.sin((k / 10) * Math.PI) * 0.06, Z1 - 0.2))
    c.b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rope), 16, 0.022, 6), c.m.rope, undefined, { uv: 'scale', uvScale: [6, 1], cast: false })
    for (const dx of [-0.35, 0, 0.35]) shide(c, K.x + dx, y + 0.42, Z1 - 0.21, 0, 1)
  }

  // ---------------------------------------------------------- 行灯（あたたかい明かり）と、壁ぎわの材木
  andon(c, X0 + 1.4, Z0 + 2.4, 0.06, 0.2)
  andon(c, CHEST.x - 1.1, Z1 - 0.7, 0.06, -0.3)
  andon(c, X1 - 0.9, Z0 + 1.9, 0.06, 0.4)
  for (let i = 0; i < 3; i++) woodBox(c, X0 + 0.3 + i * 0.07, 0.95, Z0 + 0.75 + i * 0.22, 0.05, 1.8, 0.16, { tint: woodTint(rng, '#d8b48a'), rotZ: -0.14 })
  // 中の吊り提灯（戸口の内側）
  lantern(c, (W.door.x0 + W.door.x1) / 2, H1 - 0.6, Z0 + 0.9, { kind: 'cream', s: 0.8, cord: 0.3 })
}

// ---------------------------------------------------------------- 動く物：書（ひらいた本）

/** 源兵衛の書。見台の上でひらいている。右のページ＝青い刃のかけら、左のページ＝あとで「時を裂く爪」を描く */
/** 絵の見開き（1280×720）のうち、本のページの所（左・上・幅・高さ）。縦横比はページの板（1.6）に近づける */
const ART_CROP = { p1: [140, 22, 1030, 644], p2: [110, 40, 1070, 660] } as const
/** 2 ページ目の絵（右ページの小さな青いからくり）を描いていく順（中心 x・y と、広がる半径。キャンバスの 0〜1） */
const REVEAL: ReadonlyArray<[number, number, number]> = [
  [0.7, 0.42, 0.16],
  [0.71, 0.66, 0.15],
  [0.6, 0.62, 0.1],
  [0.83, 0.42, 0.12],
  [0.88, 0.3, 0.1],
  [0.93, 0.45, 0.14],
  [0.68, 0.18, 0.14],
  [0.7, 0.86, 0.13],
]

/**
 * 源兵衛の書。見台の上でひらいている。はじめは「青い刃のかけら」の見開き（V7_ART.bookPage1）。
 * drawClawPage() で次の見開きをひらき、源兵衛が「時を裂く爪」の絵（V7_ART.bookPage2）を描いていく（にじむように広がる）。
 * 絵が読めないときは、手描きのキャンバス（pages.ts）で同じことをする。
 */
export class GenbeiBook {
  readonly root = new THREE.Group()
  /** ページの真ん中（カメラの寄り先） */
  readonly pageCenter = new THREE.Vector3()
  /** ページの面の向き（読む人の方） */
  readonly pageNormal = new THREE.Vector3()
  private readonly g: CanvasRenderingContext2D
  private readonly tex: THREE.CanvasTexture
  private claw = 0
  private drawing: { t: number; dur: number; done: () => void } | null = null
  private repaint = 0
  private readonly art: { p1: HTMLImageElement | null; p2: HTMLImageElement | null } = { p1: null, p2: null }
  private static readonly W = 1024
  private static readonly H = 640

  constructor(c: Ctx) {
    const [cv, g] = makeCanvas(GenbeiBook.W, GenbeiBook.H)
    this.g = g
    this.tex = new THREE.CanvasTexture(cv)
    this.tex.colorSpace = THREE.SRGBColorSpace
    this.tex.anisotropy = 4
    this.paint()
    // 物語の絵（読めたら差しかえる）
    const load = (url: string, key: 'p1' | 'p2') =>
      new THREE.ImageLoader().load(
        url,
        (img) => {
          this.art[key] = img
          this.paint()
        },
        undefined,
        () => console.warn('[edo7] 書の絵を読めなかったので手描きの絵を使います', url),
      )
    load(V7_ART.bookPage1, 'p1')
    load(V7_ART.bookPage2, 'p2')
    // ページ（のどがくぼみ、両端が少し反る）
    const geo = new THREE.PlaneGeometry(0.46, 0.288, 24, 1)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) / 0.23
      pos.setZ(i, 0.012 * (1 - Math.cos(Math.min(1, Math.abs(x)) * Math.PI * 0.5)) * 2.2 + 0.006 * Math.pow(Math.abs(x), 6))
    }
    geo.computeVertexNormals()
    const page = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.9, emissive: new THREE.Color('#5a4a30'), emissiveMap: this.tex, emissiveIntensity: 0.35 }))
    page.name = 'genbei_book_pages'
    page.receiveShadow = true
    // 表紙（藍の布）と紙の束
    const sub: Ctx = { ...c, b: new Batch(), col: new ColliderList() }
    for (const e of [-1, 1]) sub.b.add(rbox(0.235, 0.3, 0.012, 0.003), sub.m.plain, M(e * 0.117, 0, -0.02), { tint: '#2c3f6e' })
    for (const e of [-1, 1]) sub.b.add(rbox(0.215, 0.28, 0.008, 0.002), sub.m.plain, M(e * 0.109, 0, -0.01), { tint: '#efe4cc' })
    const covers = sub.b.build('genbei_book_covers')
    this.root.add(page, covers)
    // 見台の傾き：読む人（北）から見て、ページの上が南へ遠ざかる
    const right = new THREE.Vector3(-1, 0, 0)
    const up = new THREE.Vector3(0, Math.sin(BOOK_REST.tilt), Math.cos(BOOK_REST.tilt))
    const n = new THREE.Vector3().crossVectors(right, up)
    this.root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n))
    this.root.position.set(DESK.x, BOOK_REST.y, BOOK_REST.z).addScaledVector(n, 0.035)
    this.root.name = 'genbei_book'
    this.pageCenter.copy(this.root.position).addScaledVector(n, 0.02)
    this.pageNormal.copy(n)
  }

  /** 2 ページ目の描きかけ（0〜1）をその場で（セーブから再開したとき） */
  setClawPage(t: number): void {
    this.drawing = null
    this.claw = t
    this.paint()
  }

  get clawPage(): number {
    return this.claw
  }

  /** 源兵衛が次の見開きに「時を裂く爪」を描く（dur 秒。描き終わると resolve） */
  drawClawPage(dur = 4.5): Promise<void> {
    this.drawing?.done()
    return new Promise((done) => {
      this.drawing = { t: this.claw * dur, dur, done }
    })
  }

  /** 今の状態でページを描く */
  private paint(): void {
    const g = this.g
    const W = GenbeiBook.W
    const H = GenbeiBook.H
    const t = this.claw
    const crop = (img: HTMLImageElement, r: readonly number[]) => g.drawImage(img, r[0], r[1], r[2], r[3], 0, 0, W, H)
    if (t <= 0 && this.art.p1) crop(this.art.p1, ART_CROP.p1)
    else if (t > 0 && this.art.p2) {
      const img = this.art.p2
      const r = ART_CROP.p2
      // 白紙の見開き：左ページ（白紙）を右へ鏡に写す
      crop(img, r)
      g.save()
      g.translate(W, 0)
      g.scale(-1, 1)
      g.drawImage(img, r[0], r[1], r[2] * 0.5, r[3], 0, 0, W * 0.5, H)
      g.restore()
      // 絵をにじむように広げる（描いた順）
      g.save()
      g.beginPath()
      const n = REVEAL.length
      for (let i = 0; i < n; i++) {
        const k = Math.max(0, Math.min(1, t * 1.25 * n - i))
        if (k <= 0) continue
        const [x, y, rad] = REVEAL[i]
        g.moveTo(x * W + rad * W * k, y * H)
        g.arc(x * W, y * H, rad * W * k, 0, Math.PI * 2)
      }
      g.clip()
      crop(img, r)
      g.restore()
      // 題（左ページの上の余白）と印
      const a = Math.max(0, Math.min(1, (t - 0.78) / 0.2))
      if (a > 0) {
        g.save()
        g.globalAlpha = a
        drawLettering(g, { text: '時を裂く爪', vertical: true, x: W * 0.3, y: H * 0.1, w: W * 0.12, h: H * 0.52, ink: '#1e1a18', face: 'kaisho', maxSize: W * 0.08 })
        g.fillStyle = '#c8392b'
        g.fillRect(W * 0.33, H * 0.66, W * 0.05, W * 0.05)
        drawLettering(g, { text: '源', vertical: true, x: W * 0.334, y: H * 0.665, w: W * 0.042, h: W * 0.042, ink: '#fbeee0', face: 'kaisho', bold: 0 })
        g.restore()
      }
    } else paintSpread(g, W, H, t)
    this.tex.needsUpdate = true
  }

  update(dt: number): void {
    const d = this.drawing
    if (!d) return
    d.t += dt
    this.claw = Math.min(1, d.t / d.dur)
    this.repaint -= dt
    if (this.repaint <= 0 || this.claw >= 1) {
      this.repaint = 0.07
      this.paint()
    }
    if (this.claw >= 1) {
      this.drawing = null
      d.done()
    }
  }
}

// ---------------------------------------------------------------- 動く物：奥の木の箱と青い刃のかけら

/** 青い刃のかけらの形（折れた刃の先。長さ len、X が長さの向き、Z が厚み） */
export function shardGeometry(len = 0.13): THREE.BufferGeometry {
  const s = new THREE.Shape()
  const P: Array<[number, number]> = [
    [0, 0.0],
    [0.35, -0.08],
    [0.78, -0.07],
    [1.0, 0.03],
    [0.8, 0.12],
    [0.42, 0.2],
    [0.2, 0.28],
    [0.1, 0.18],
    [0.03, 0.22],
  ]
  P.forEach(([x, y], i) => (i ? s.lineTo(x * len, y * len) : s.moveTo(x * len, y * len)))
  s.closePath()
  const g = new THREE.ExtrudeGeometry(s, { depth: len * 0.05, bevelEnabled: true, bevelThickness: len * 0.03, bevelSize: len * 0.025, bevelSegments: 1 })
  g.translate(-len * 0.5, -len * 0.08, -len * 0.025)
  g.computeVertexNormals()
  return g
}

let glowTex: THREE.CanvasTexture | null = null
/** やわらかい光の点（加算のスプライト用。ステージをまたいで使い回す小さなキャッシュ） */
export function softGlowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const [cv, g] = makeCanvas(64)
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.3, 'rgba(255,255,255,0.45)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 64)
  glowTex = new THREE.CanvasTexture(cv)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

/** 青い刃のかけらの材質（光り方は setGlow で） */
export function shardMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#7cc4ff', emissive: new THREE.Color('#2f8cff'), emissiveIntensity: 0.9, roughness: 0.18, metalness: 0.35 })
}

/**
 * 奥の箪笥の上の木の箱。ふたを開けると紫の袱紗の上に青い刃のかけら。
 * setResonance(k)：ネクマックスが近づくと、背中の石と同じ「コチ、コチ」の拍で光る（k は強さ 0〜1）。拍ごとに onTick
 */
export class FragmentBox {
  readonly root = new THREE.Group()
  readonly shard: THREE.Mesh
  /** かけらの位置（ワールド。カメラの寄り先・光の輪の中心） */
  readonly shardWorld = new THREE.Vector3()
  /** 拍（コチ）ごとに呼ぶ（音・HUD の波形などに） */
  onTick: ((strong: boolean) => void) | null = null
  private readonly lid: THREE.Group
  private readonly shardMat: THREE.MeshStandardMaterial
  private readonly glow: THREE.Sprite
  private readonly rings: THREE.Mesh[] = []
  private readonly ringT: number[] = []
  private res = 0
  private resWant = 0
  private lidOpen = 0
  private lidWant = 0
  private beat = 0
  private beatK = 0

  constructor(c: Ctx) {
    const sub: Ctx = { ...c, b: new Batch(), col: new ColliderList() }
    const w = 0.36
    const h = 0.1
    const d = 0.24
    // 桐の箱（四隅に真ちゅうの金具）、中に紫の袱紗
    sub.b.add(rbox(w, 0.02, d, 0.004), sub.m.wood, M(0, 0.01, 0), { tint: '#f6e8cc', texM: 0.6 })
    for (const [x, z, sx, sz] of [
      [0, -d / 2 + 0.01, w, 0.02],
      [0, d / 2 - 0.01, w, 0.02],
      [-w / 2 + 0.01, 0, 0.02, d],
      [w / 2 - 0.01, 0, 0.02, d],
    ] as const) {
      sub.b.add(rbox(sx, h, sz, 0.003), sub.m.wood, M(x, h / 2, z), { tint: '#f6e8cc', texM: 0.6 })
    }
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      sub.b.add(rbox(0.035, h + 0.004, 0.035, 0.004), sub.m.brass, M(x * (w / 2 - 0.012), h / 2, z * (d / 2 - 0.012)))
    }
    sub.b.add(rbox(w - 0.05, 0.03, d - 0.05, 0.012), sub.m.plain, M(0, 0.05, 0), { tint: '#6c3c8e' })
    // 紐（朱）
    sub.b.add(new THREE.TorusGeometry(0.018, 0.005, 5, 12), sub.m.plain, M(0, h * 0.55, -d / 2 - 0.006), { tint: '#c8392b' })
    this.root.add(sub.b.build('fragment_box'))
    // ふた（奥の辺がちょうつがい）
    this.lid = new THREE.Group()
    this.lid.position.set(0, h, d / 2)
    const lb = new Batch()
    lb.add(rbox(w + 0.01, 0.022, d + 0.01, 0.005), c.m.wood, M(0, 0.011, -d / 2), { tint: '#f8ecd2', texM: 0.6 })
    lb.add(rbox(0.12, 0.004, 0.06, 0), c.m.plain, M(0, 0.024, -d / 2), { tint: '#2a1a12' })
    this.lid.add(lb.build('fragment_box_lid'))
    this.root.add(this.lid)
    // かけら
    this.shardMat = shardMaterial()
    // 袱紗の上に、前（-Z）へ向けて斜めに立てかける（箱のふちより上に先が出る）
    this.shard = new THREE.Mesh(shardGeometry(0.16), this.shardMat)
    this.shard.position.set(0, 0.105, 0.03)
    this.shard.rotation.set(-0.55, 0, 0.42)
    this.shard.castShadow = true
    this.root.add(this.shard)
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#5ab0ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }))
    this.glow.position.set(0, 0.11, 0.0)
    this.glow.scale.setScalar(0.4)
    this.root.add(this.glow)
    // 音の輪（拍ごとに広がる）
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 4, 40), new THREE.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
      r.rotation.x = Math.PI / 2
      r.position.y = 0.09
      r.visible = false
      this.root.add(r)
      this.rings.push(r)
      this.ringT.push(-1)
    }
    this.root.position.set(CHEST.x, CHEST.h + 0.06, CHEST.z - 0.02)
    this.root.name = 'fragment_box'
    this.setLid(0.85, true)
    this.root.updateMatrixWorld(true)
    this.shard.getWorldPosition(this.shardWorld)
  }

  /** ふたの開き（0＝閉じる、1＝開く） */
  setLid(open: number, instant = false): void {
    this.lidWant = open
    if (instant) this.lidOpen = open
  }

  /** 共鳴の強さ（0〜1）。近づくほど強く（ステージが距離から決める） */
  setResonance(k: number, instant = false): void {
    this.resWant = Math.max(0, Math.min(1, k))
    if (instant) this.res = this.resWant
  }

  get resonance(): number {
    return this.res
  }

  /** かけらを見せる・隠す（うでに持たせるとき） */
  setShardVisible(on: boolean): void {
    this.shard.visible = on
    this.glow.visible = on
  }

  update(dt: number, t: number): void {
    this.lidOpen += (this.lidWant - this.lidOpen) * Math.min(1, dt * 4)
    this.lid.rotation.x = this.lidOpen * 1.75
    this.res += (this.resWant - this.res) * Math.min(1, dt * 3)
    // コチ、コチ（1 秒に 2 拍。強い拍と弱い拍）
    if (this.res > 0.02) {
      this.beat += dt * 2
      if (this.beat >= 1) {
        this.beat -= 1
        this.beatK = 1
        const strong = Math.floor(t * 2) % 2 === 0
        this.onTick?.(strong)
        if (this.res > 0.25) {
          const i = this.ringT.findIndex((x) => x < 0)
          if (i >= 0) this.ringT[i] = 0
        }
      }
    } else this.beat = 0
    this.beatK = Math.max(0, this.beatK - dt * 4)
    const k = this.res
    this.shardMat.emissiveIntensity = 0.9 + k * (1.6 + this.beatK * 3.5)
    const gm = this.glow.material as THREE.SpriteMaterial
    gm.opacity = Math.min(1, 0.25 + k * (0.5 + this.beatK * 0.5))
    this.glow.scale.setScalar(0.32 + k * (0.3 + this.beatK * 0.25))
    for (let i = 0; i < this.rings.length; i++) {
      const r = this.rings[i]
      if (this.ringT[i] < 0) {
        r.visible = false
        continue
      }
      this.ringT[i] += dt
      const p = this.ringT[i] / 1.1
      if (p >= 1) {
        this.ringT[i] = -1
        r.visible = false
        continue
      }
      r.visible = true
      r.scale.setScalar(0.06 + p * 0.55)
      ;(r.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.8 * k
    }
  }
}

// ---------------------------------------------------------------- 動く物：源兵衛のからくりのうで

type ArmPhase = 'rest' | 'tune' | 'raise' | 'cut' | 'look' | 'close' | 'back'

/** 実演の時間割（秒） */
const DEMO = { tune: 2.6, raise: 0.9, cut: 0.45, look: 3.4, close: 0.7, back: 1.1 }

/**
 * 作業台の東の端に据えた、源兵衛のからくりのうで。台の歯車・肩・ひじ・手首の歯車が回り、先のはさみでかけらを持つ。
 * demoSlit(slit)：歯車を一つずつ組みかえて合わせる → うでを上げる → かけらでさっと空を切る → 切れ目がひらく
 *   （中で黒いものがぬるりと動く）→ 閉じる → もとの位置へ。終わると resolve
 */
export class KarakuriArm {
  readonly root = new THREE.Group()
  /** はさみの先（かけらの位置。ワールド） */
  readonly tip = new THREE.Object3D()
  phase: ArmPhase = 'rest'
  private readonly yaw = new THREE.Group()
  private readonly shoulder = new THREE.Group()
  private readonly elbow = new THREE.Group()
  private readonly wrist = new THREE.Group()
  private readonly baseGears: THREE.Object3D[] = []
  private readonly jointGears: THREE.Object3D[] = []
  private readonly shard: THREE.Mesh
  private readonly shardGlow: THREE.Sprite
  private t = 0
  private idleT = 0
  private demo: { done: () => void } | null = null
  private readonly cutA = new THREE.Vector3()
  private readonly cutB = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()

  constructor(c: Ctx) {
    const part = (name: string, build: (s: Ctx) => void): THREE.Group => {
      const s: Ctx = { ...c, b: new Batch(), col: new ColliderList() }
      build(s)
      return s.b.build(name)
    }
    const honey = WOOD.honey
    // 台（木の箱・真ちゅうの角）
    this.root.add(
      part('arm_base', (s) => {
        s.b.add(rbox(0.4, 0.2, 0.34, 0.015), s.m.wood, M(0, 0.1, 0), { tint: honey, texM: 0.6 })
        for (const [x, z] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const) {
          s.b.add(rbox(0.04, 0.205, 0.04, 0.005), s.m.brass, M(x * 0.185, 0.1, z * 0.155))
        }
        s.b.add(new THREE.CylinderGeometry(0.13, 0.14, 0.03, 20), s.m.brass, M(0, 0.215, 0))
      }),
    )
    // 台の前の歯車（組みかえて回す）
    for (const [x, y, r, n] of [
      [-0.1, 0.1, 0.075, 16],
      [0.04, 0.12, 0.05, 12],
      [0.13, 0.08, 0.035, 10],
    ] as const) {
      const g = part('arm_gear', (s) => s.b.add(gearGeometry(r, 0.014, n), s.m.brass, undefined))
      g.position.set(x, y, -0.18)
      this.root.add(g)
      this.baseGears.push(g)
    }
    // 首振り（ヨー）→ 柱 → 肩
    this.yaw.position.y = 0.23
    this.root.add(this.yaw)
    this.yaw.add(
      part('arm_column', (s) => {
        s.b.add(rbox(0.08, 0.36, 0.08, 0.01), s.m.wood, M(0, 0.18, 0), { tint: WOOD.dark, texM: 0.6 })
        for (const y of [0.06, 0.3]) s.b.add(rbox(0.09, 0.025, 0.09, 0.004), s.m.brass, M(0, y, 0))
      }),
    )
    this.shoulder.position.y = 0.38
    this.yaw.add(this.shoulder)
    const jg = (r: number, n: number) => {
      const g = part('arm_joint', (s) => {
        s.b.add(gearGeometry(r, 0.018, n), s.m.brass, M(0, 0, 0, 0, Math.PI / 2, 0))
        s.b.add(new THREE.CylinderGeometry(r * 0.25, r * 0.25, 0.11, 10), s.m.iron, M(0, 0, 0, 0, 0, Math.PI / 2))
      })
      this.jointGears.push(g)
      return g
    }
    const sg = jg(0.07, 14)
    sg.position.x = 0.06
    this.shoulder.add(sg)
    // 上腕（前へ = -Z）
    this.shoulder.add(
      part('arm_upper', (s) => {
        s.b.add(rbox(0.06, 0.06, 0.42, 0.01), s.m.wood, M(0, 0, -0.21), { tint: honey, texM: 0.6 })
        for (const z of [-0.06, -0.36]) s.b.add(rbox(0.068, 0.068, 0.025, 0.004), s.m.brass, M(0, 0, z))
      }),
    )
    this.elbow.position.z = -0.42
    this.shoulder.add(this.elbow)
    const eg = jg(0.055, 12)
    eg.position.x = -0.05
    this.elbow.add(eg)
    this.elbow.add(
      part('arm_fore', (s) => {
        s.b.add(rbox(0.05, 0.05, 0.36, 0.01), s.m.wood, M(0, 0, -0.18), { tint: honey, texM: 0.6 })
        s.b.add(rbox(0.058, 0.058, 0.02, 0.003), s.m.brass, M(0, 0, -0.3))
      }),
    )
    this.wrist.position.z = -0.37
    this.elbow.add(this.wrist)
    const wg = jg(0.035, 10)
    this.wrist.add(wg)
    // はさみ（2 本の爪）
    this.wrist.add(
      part('arm_clamp', (s) => {
        for (const e of [-1, 1]) {
          s.b.add(rbox(0.012, 0.012, 0.09, 0.002), s.m.brass, M(e * 0.018, 0, -0.05, 0, e * 0.15, 0))
          s.b.add(rbox(0.012, 0.012, 0.03, 0.002), s.m.brass, M(e * 0.008, 0, -0.1, 0, -e * 0.5, 0))
        }
      }),
    )
    this.tip.position.z = -0.12
    this.wrist.add(this.tip)
    this.shard = new THREE.Mesh(shardGeometry(0.11), shardMaterial())
    this.shard.rotation.set(0, Math.PI / 2, 0)
    this.shard.position.z = -0.03
    this.shard.visible = false
    this.tip.add(this.shard)
    this.shardGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#5ab0ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8, toneMapped: false }))
    this.shardGlow.scale.setScalar(0.3)
    this.shardGlow.visible = false
    this.tip.add(this.shardGlow)
    // 作業台の東の端、北（戸口の方）を向く
    this.root.position.set(BENCH.x1 - 0.35, BENCH.y, (BENCH.z0 + BENCH.z1) / 2)
    this.root.name = 'karakuri_arm'
    this.pose(0, -0.35, 1.0, 0.4)
  }

  /** かけらを持たせる・外す */
  holdShard(on: boolean): void {
    this.shard.visible = on
    this.shardGlow.visible = on
  }

  get holding(): boolean {
    return this.shard.visible
  }

  /** 実演（切れ目の見せ場）。終わると resolve。slit は切れ目の見た目 */
  demoSlit(): Promise<void> {
    this.demo?.done()
    this.holdShard(true)
    this.phase = 'tune'
    this.t = 0
    return new Promise((done) => {
      this.demo = { done }
    })
  }

  /** 切れ目の中心（実演の前からカメラを向けられるよう、決まった場所） */
  slitCenter(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.root.position.x - 0.05, 1.32, BENCH.z0 - 0.55)
  }

  private pose(yaw: number, sh: number, el: number, wr: number): void {
    this.yaw.rotation.y = yaw
    this.shoulder.rotation.x = sh
    this.elbow.rotation.x = el
    this.wrist.rotation.x = wr
  }

  update(dt: number, slit: TempSlit): void {
    const ease = (x: number) => x * x * (3 - 2 * x)
    this.idleT += dt
    if (this.phase === 'rest') {
      // 待っている間：台の歯車がゆっくり回り、うでがかすかに揺れる
      this.baseGears.forEach((g, i) => (g.rotation.z += dt * (i % 2 ? -0.5 : 0.35) * (1 + i * 0.4)))
      this.pose(Math.sin(this.idleT * 0.4) * 0.05, -0.35, 1.0, 0.4)
      return
    }
    this.t += dt
    const T = DEMO
    if (this.phase === 'tune') {
      // 歯車を一つずつ「カチッ」と合わせる（段のある回り方）
      const k = this.t / T.tune
      this.baseGears.forEach((g, i) => {
        const steps = Math.floor(this.t * 6 + i * 2)
        g.rotation.z = (steps * Math.PI) / 9 * (i % 2 ? -1 : 1)
      })
      this.jointGears.forEach((g, i) => (g.rotation.x = Math.floor(this.t * 4 + i) * 0.4))
      this.pose(Math.sin(k * Math.PI * 2) * 0.08, -0.35, 1.0, 0.4)
      if (this.t >= T.tune) this.next('raise')
    } else if (this.phase === 'raise') {
      const k = ease(Math.min(1, this.t / T.raise))
      this.pose(-0.45 * k, -0.35 + 1.25 * k, 1.0 - 0.75 * k, 0.4 - 0.6 * k)
      if (this.t >= T.raise) {
        this.tip.getWorldPosition(this.cutA)
        this.next('cut')
      }
    } else if (this.phase === 'cut') {
      const k = ease(Math.min(1, this.t / T.cut))
      this.pose(-0.45 + 0.85 * k, 0.9 - 1.25 * k, 0.25 + 0.15 * k, -0.2 + 0.1 * k)
      this.jointGears.forEach((g) => (g.rotation.x += dt * 14))
      if (this.t >= T.cut) {
        this.tip.getWorldPosition(this.cutB)
        // 切った道すじに切れ目
        const mid = this.tmp.addVectors(this.cutA, this.cutB).multiplyScalar(0.5)
        const axis = this.cutB.clone().sub(this.cutA)
        slit.place(mid, axis, Math.max(0.7, axis.length() * 1.15), 0.2)
        slit.setOpen(1)
        slit.thing = 0
        this.next('look')
      }
    } else if (this.phase === 'look') {
      slit.thing = Math.min(1, this.t / T.look)
      if (this.t >= T.look) {
        slit.setOpen(0)
        this.next('close')
      }
    } else if (this.phase === 'close') {
      if (this.t >= T.close) this.next('back')
    } else if (this.phase === 'back') {
      const k = ease(Math.min(1, this.t / T.back))
      this.pose(0.4 * (1 - k), -0.35 * k + (0.9 - 1.25) * (1 - k), 0.4 + 0.6 * k, -0.1 + 0.5 * k)
      if (this.t >= T.back) {
        this.phase = 'rest'
        const d = this.demo
        this.demo = null
        d?.done()
      }
    }
  }

  private next(p: ArmPhase): void {
    this.phase = p
    this.t = 0
  }
}
