// 7 章の舞台の地面と囲い：路地（工房と団子屋のあいだ）・路地のおく（ほこらの小さな庭）・広場（工房の裏。時の鐘人形）。
// 静的な物は町のバッチに積む。かがり火（夜に燃える）だけは動く物（Kagaribi）。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { mulberry32, range, pick } from '../../../render/noise'
import { WOOD, barrel, crate, lantern, noren, standLantern, woodBox, woodTint, signboard, type Ctx } from '../../../world/edo/kit'
import { kura, machiya, type Frame } from '../../../world/edo/buildings'
import type { Foliage } from '../../../world/edo/nature'
import { C, YAW } from './layout'
import { softGlowTexture } from './workshop'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ---------------------------------------------------------------- 塀・垣根

/** 土塀（しっくいの壁に瓦の笠）。a→b、高さ h。当たり判定つき */
export function earthWall(c: Ctx, ax: number, az: number, bx: number, bz: number, h = 2.1, tint = '#efe3cc'): void {
  const len = Math.hypot(bx - ax, bz - az)
  const rot = -Math.atan2(bz - az, bx - ax)
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  c.b.add(rbox(len, 0.4, 0.5, 0.04), c.m.stoneWall, M(mx, 0.2, mz, 0, rot, 0), { tint: '#ddd5c8', texM: 2 })
  c.b.add(rbox(len, h - 0.4, 0.36, 0.02), c.m.plaster, M(mx, 0.4 + (h - 0.4) / 2, mz, 0, rot, 0), { tint, texM: 3 })
  // 瓦の笠（両側に少し張り出す）
  c.b.add(rbox(len + 0.1, 0.1, 0.72, 0.03), c.m.roof, M(mx, h + 0.05, mz, 0, rot, 0), { tint: '#ffffff', texM: 2, uAxis: 0 })
  c.b.add(rbox(len + 0.12, 0.12, 0.18, 0.05), c.m.roof, M(mx, h + 0.16, mz, 0, rot, 0), { tint: '#8d96a6', texM: 1 })
  // 柱の見え（等間隔の板）
  const n = Math.max(1, Math.round(len / 1.8))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    woodBox(c, ax + (bx - ax) * t, 0.4 + (h - 0.4) / 2, az + (bz - az) * t, 0.14, h - 0.4, 0.4, { rotY: rot, tint: WOOD.dark })
  }
  c.col.box(mx, h / 2, mz, len, h + 0.4, 0.5, rot)
}

/** 板塀（焼杉の縦板）。当たり判定つき */
export function boardFence(c: Ctx, ax: number, az: number, bx: number, bz: number, h = 1.9): void {
  const len = Math.hypot(bx - ax, bz - az)
  const rot = -Math.atan2(bz - az, bx - ax)
  const n = Math.max(2, Math.round(len / 0.16))
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    woodBox(c, ax + (bx - ax) * t, h / 2, az + (bz - az) * t, len / n - 0.012, h, 0.05, { rotY: rot, tint: woodTint(c.rng, '#5a4a3e', 0.12) })
  }
  for (const y of [0.35, h - 0.25]) woodBox(c, (ax + bx) / 2, y, (az + bz) / 2, len, 0.08, 0.08, { rotY: rot, tint: WOOD.dark })
  woodBox(c, (ax + bx) / 2, h + 0.03, (az + bz) / 2, len + 0.06, 0.06, 0.16, { rotY: rot, tint: WOOD.veryDark })
  c.col.box((ax + bx) / 2, h / 2 + 0.1, (az + bz) / 2, len, h + 0.2, 0.2, rot)
}

/** 竹垣（低い。向こうが見える） */
export function bambooFence(c: Ctx, ax: number, az: number, bx: number, bz: number, h = 1.05): void {
  const len = Math.hypot(bx - ax, bz - az)
  const rot = -Math.atan2(bz - az, bx - ax)
  const n = Math.max(2, Math.round(len / 0.45))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    c.b.add(new THREE.CylinderGeometry(0.035, 0.035, h, 7), c.m.wood, M(ax + (bx - ax) * t, h / 2, az + (bz - az) * t), { tint: '#c8b26a', uv: 'scale', uvScale: [0.2, 1] })
  }
  for (const y of [0.3, 0.65, h - 0.08]) {
    c.b.add(new THREE.CylinderGeometry(0.025, 0.025, len, 6), c.m.wood, M((ax + bx) / 2, y, (az + bz) / 2, 0, rot, Math.PI / 2), { tint: '#b8a05a', uv: 'scale', uvScale: [0.2, len] })
  }
  // 結び目（しゅろ縄）
  for (let i = 0; i <= n; i++) {
    const t = i / n
    c.b.add(new THREE.SphereGeometry(0.04, 6, 4), c.m.rope, M(ax + (bx - ax) * t, 0.65, az + (bz - az) * t), { tint: '#4a3020' })
  }
  c.col.box((ax + bx) / 2, h / 2 + 0.1, (az + bz) / 2, len, h + 0.2, 0.2, rot)
}

// ---------------------------------------------------------------- 路地と、路地のおく（ほこらの庭）

export function buildAlleyAndCourt(c: Ctx, f: Foliage): void {
  const A = C.ALLEY
  const K = C.COURT
  const rng = mulberry32(7261)
  const ax = (A.x0 + A.x1) / 2
  // 路地の石畳（まんなかに飛び石の列）と、東の側溝
  for (let z = A.z0 + 0.3; z < A.z1; z += 0.62) {
    c.b.add(rbox(range(rng, 0.9, 1.15), 0.05, 0.5, 0.06), c.m.stoneWall, M(ax - 0.2 + range(rng, -0.08, 0.08), 0.015, z, 0, range(rng, -0.06, 0.06), 0), { tint: woodTint(rng, '#e2dccf', 0.06), texM: 1.2 })
  }
  c.b.add(rbox(0.32, 0.04, A.z1 - A.z0, 0.01), c.m.plain, M(A.x1 - 0.32, 0.0, (A.z0 + A.z1) / 2), { tint: '#3a4048', cast: false })
  for (const dx of [-0.18, 0.18]) c.b.add(rbox(0.08, 0.08, A.z1 - A.z0, 0.02), c.m.stoneWall, M(A.x1 - 0.32 + dx, 0.03, (A.z0 + A.z1) / 2), { tint: '#cfc8bb', texM: 1 })
  // 入口の木戸（柱と冠木）と、ほこらへの案内の札「時の神」
  for (const x of [A.x0 + 0.12, A.x1 - 0.12]) woodBox(c, x, 1.35, A.z0 + 0.25, 0.16, 2.7, 0.16, { tint: WOOD.dark })
  woodBox(c, ax, 2.62, A.z0 + 0.25, A.x1 - A.x0 + 0.5, 0.18, 0.2, { tint: WOOD.dark })
  shed(c, ax, A.z0 + 0.25, A.x1 - A.x0 + 0.9, 0.7, 3.05)
  signboard(c, { text: '時の神', vertical: true, w: 160, h: 400 }, A.x1 - 0.12, 1.75, A.z0 + 0.12, Math.PI, 0.3, 0.75, 0.06)
  // 路地の小物：鉢植え・樽・縁台・物干し・軒の提灯
  for (let i = 0; i < 6; i++) {
    const z = A.z0 + 1.6 + i * 1.15
    const x = i % 2 ? A.x0 + 0.3 : A.x1 - 0.65
    const r = range(rng, 0.13, 0.2)
    c.b.add(new THREE.CylinderGeometry(r, r * 0.8, r * 1.6, 10), c.m.darkLacquer, M(x, r * 0.8, z), { tint: pick(rng, ['#6b4a36', '#3a3f4a', '#8a5a3a']) })
    c.b.add(new THREE.IcosahedronGeometry(r * 1.1, 1), c.m.puffGreen, M(x, r * 1.6 + r * 0.8, z, rng(), rng(), 0, 1, 0.85, 1), { tint: new THREE.Color('#ffffff').multiplyScalar(range(rng, 0.75, 1)) })
    c.col.box(x, 0.3, z, r * 2.2, 0.6, r * 2.2)
  }
  barrel(c, A.x0 + 0.45, 0, A.z1 - 1.2, 0.85)
  crate(c, A.x1 - 0.55, 0, A.z0 + 0.9, 0.5, 0.3)
  // 物干し竿と手ぬぐい
  c.b.add(new THREE.CylinderGeometry(0.02, 0.02, A.x1 - A.x0, 6), c.m.wood, M(ax, 2.35, A.z0 + 4.2, 0, 0, Math.PI / 2), { tint: '#c8b26a' })
  for (const [dx, col] of [
    [-0.5, '#3b5a9a'],
    [0.35, '#f4f0e6'],
  ] as const) {
    c.b.add(new THREE.PlaneGeometry(0.34, 0.7, 2, 4), c.m.plain, M(ax + dx, 2.0, A.z0 + 4.2), { tint: col, cast: false })
    c.b.add(new THREE.PlaneGeometry(0.34, 0.7, 2, 4), c.m.plain, M(ax + dx, 2.0, A.z0 + 4.2, 0, Math.PI, 0), { tint: col, cast: false })
  }
  // 腕木の提灯（工房の壁から）
  for (const z of [A.z0 + 2.6, A.z1 - 2.2]) {
    woodBox(c, A.x0 + 0.3, 2.5, z, 0.5, 0.06, 0.06, { tint: WOOD.dark })
    lantern(c, A.x0 + 0.5, 2.15, z, { kind: 'red', s: 0.8, cord: 0.2 })
  }

  // ------------------------------------------------ 路地のおく（庭）
  // 地面：白い砂利と飛び石（路地の出口 → ほこらの前）
  c.b.add(rbox(K.x1 - K.x0 - 0.2, 0.04, K.z1 - K.z0 + 1.2, 0.02), c.m.plaster, M((K.x0 + K.x1) / 2, 0.0, (K.z0 + K.z1) / 2 - 0.6), { tint: '#d8d2c4', texM: 1.2, cast: false })
  const stones: Array<[number, number]> = [
    [-10.9, 22.6],
    [-10.4, 23.4],
    [-9.9, 24.2],
    [-9.6, 25.1],
    [-9.7, 26.0],
    [-8.6, 26.3],
    [-7.5, 26.5],
    [-6.3, 26.6],
    [-5.1, 26.9],
  ]
  for (const [x, z] of stones) c.b.add(new THREE.CylinderGeometry(0.34, 0.38, 0.08, 9), c.m.stoneWall, M(x, 0.03, z, 0, rng() * 3, 0, 1, 1, range(rng, 0.8, 1)), { tint: woodTint(rng, '#ddd6ca', 0.05), texM: 0.8 })
  // 西の板塀（向こうは広場。南の端に木戸）
  boardFence(c, K.x0, 21.6, K.x0, C.COURT_GATE.z0)
  boardFence(c, K.x0, C.COURT_GATE.z1, K.x0, K.z1)
  // 木戸（枠と、開けた戸）
  for (const z of [C.COURT_GATE.z0, C.COURT_GATE.z1]) woodBox(c, K.x0, 1.2, z, 0.16, 2.4, 0.16, { tint: WOOD.dark })
  woodBox(c, K.x0, 2.38, (C.COURT_GATE.z0 + C.COURT_GATE.z1) / 2, 0.2, 0.14, C.COURT_GATE.z1 - C.COURT_GATE.z0 + 0.4, { tint: WOOD.dark })
  woodBox(c, K.x0 - 0.65, 0.95, C.COURT_GATE.z0 + 0.1, 1.3, 1.8, 0.05, { tint: woodTint(rng, '#5a4a3e'), rotY: 0.9 })
  // 南の土塀
  earthWall(c, K.x0, K.z1, K.x1, K.z1, 2.0)
  // 東の低い竹垣（朝日がさしこむ。向こうは上流の台地と城）
  bambooFence(c, K.x1, 21.0, K.x1, K.z1)
  // 北：店の裏の板塀（店の裏の壁のすきまをふさぐ）
  boardFence(c, A.x1, 21.15, K.x1, 21.15, 1.7)
  // 庭の木（小さな桜と植え込み）・井戸・手水鉢
  f.cherry(-2.0, 0, 28.8, 0.75, 41)
  f.bush(0.8, 0, 23.0, 0.7, 42)
  f.bush(-12.3, 0, 29.6, 0.55, 43)
  f.bush(1.0, 0, 29.4, 0.65, 44)
  // 手水鉢（石の鉢と柄杓）
  c.b.add(new THREE.CylinderGeometry(0.42, 0.36, 0.55, 12), c.m.stoneWall, M(-8.4, 0.27, 28.6), { tint: '#cfc8bb', texM: 1 })
  c.b.add(new THREE.CircleGeometry(0.34, 16), c.m.plain, M(-8.4, 0.53, 28.6, -Math.PI / 2, 0, 0), { tint: '#3a6a7a', cast: false })
  c.b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5), c.m.wood, M(-8.4, 0.62, 28.6, 0, 0.4, 1.1), { tint: '#c8a070' })
  c.col.box(-8.4, 0.3, 28.6, 0.84, 0.6, 0.84)
  // 庭の灯り（石灯籠の代わりの置き行灯 2 つ）
  standLantern(c, -6.0, 23.2)
  standLantern(c, -1.0, 25.6)
  c.col.box(-6.0, 0.6, 23.2, 0.4, 1.2, 0.4)
  c.col.box(-1.0, 0.6, 25.6, 0.4, 1.2, 0.4)
  // 庭の南の塀の向こう（遠景を埋める低い家並み。当たり判定なし）
  for (const x of [-4.2, 1.6, 7.4]) machiya(c, { ox: x, oz: K.z1 + 1.2, rot: 0, y: 0 } as Frame, { width: 5.6, depth: 5, lanterns: 'none', lowDetail: true, collider: false, h1: 2.8 })
}

/** 片流れの小さな屋根（木戸の上） */
function shed(c: Ctx, x: number, z: number, w: number, d: number, y: number): void {
  c.b.add(rbox(w, 0.08, d, 0.02), c.m.roof, M(x, y, z, 0.18, 0, 0), { texM: 1.5, uAxis: 0 })
  c.b.add(rbox(w + 0.04, 0.1, 0.12, 0.03), c.m.roof, M(x, y + 0.08, z + d / 2 - 0.06), { tint: '#8d96a6', texM: 1 })
}

// ---------------------------------------------------------------- 広場（工房の裏）

export function buildPlaza(c: Ctx, f: Foliage): void {
  const P = C.PLAZA
  const rng = mulberry32(1727)
  const cx = (P.x0 + P.x1) / 2
  const cz = (P.z0 + P.z1) / 2
  // 地面：踏み固めた土に、真ん中の石だたみの丸
  c.b.add(rbox(P.x1 - P.x0, 0.1, P.z1 - P.z0 + 1.0, 0.02), c.m.plaster, M(cx, P.y - 0.05, cz + 0.5), { tint: '#c8a882', texM: 3, cast: false })
  c.col.floor(P.x0 - 2, P.x1, P.z0 - 0.5, P.z1 + 2, P.y, 1)
  const disc = new THREE.CircleGeometry(8.6, 40)
  c.b.add(disc, c.m.paving, M(C.DOLL.x, P.y + 0.012, C.DOLL.z - 1.0, -Math.PI / 2, 0, 0), { tint: '#e8dcc4', texM: 2.4, cast: false })
  disc.dispose()
  // 広場のまわり：西は蔵と土塀、南は家並み、東は蔵と土塀（北は店の裏）
  kura(c, { ox: P.x0, oz: 25.5, rot: -Math.PI / 2, y: 0 } as Frame, 4.6, 5.2, 5.4)
  kura(c, { ox: P.x0, oz: 41.5, rot: -Math.PI / 2, y: 0 } as Frame, 5.2, 5.2, 5.8)
  earthWall(c, P.x0, 21.2, P.x0, 23.0)
  earthWall(c, P.x0, 28.0, P.x0, 38.8)
  earthWall(c, P.x0, 44.2, P.x0, P.z1 + 0.5)
  const south: Array<[number, number, Parameters<typeof machiya>[2]]> = [
    [-39.2, 8.6, { width: 8.6, depth: 6.5, noren: 'waveIndigo', lanterns: 'red', shop: 'goods', sign: { text: '飴' } }],
    [-30.4, 8.6, { width: 8.6, depth: 6.5, noren: 'redCrest', lanterns: 'mixed', shop: 'tea', sign: { text: '甘味処' } }],
    [-21.6, 8.6, { width: 8.6, depth: 6.5, noren: 'gearIndigo', lanterns: 'cream', shop: 'goods', balcony: true }],
  ]
  for (const [x, , o] of south) machiya(c, { ox: x, oz: P.z1, rot: 0, y: 0 } as Frame, o)
  // 南の店と台座のあいだの土塀のすきま（家の間口のはしから）
  kura(c, { ox: P.x1, oz: 33.2, rot: Math.PI / 2, y: 0 } as Frame, 5.0, 5.0, 5.2)
  kura(c, { ox: P.x1, oz: 40.6, rot: Math.PI / 2, y: 0 } as Frame, 5.0, 5.0, 5.6)
  earthWall(c, P.x1 + 0.2, 30.4, P.x1 + 0.2, 30.7)
  earthWall(c, P.x1 + 0.2, 35.7, P.x1 + 0.2, 38.1)
  earthWall(c, P.x1 + 0.2, 43.1, P.x1 + 0.2, P.z1 + 0.5)
  // 店の裏（北）：店の裏の壁のすきまを板塀でふさぐ（工房の裏口はあける）
  boardFence(c, P.x0, 21.15, C.WORKSHOP.x0, 21.15, 1.7)
  // 広場の小物：井戸・縁台・高札・樽・木箱・木
  {
    // 井戸（石の井筒・屋根・つるべ）
    const wx = -40.6
    const wz = 33.0
    c.b.add(new THREE.CylinderGeometry(0.75, 0.8, 0.75, 16, 1, true), c.m.stoneWall, M(wx, 0.37, wz), { tint: '#d8d0c4', texM: 1.2 })
    c.b.add(new THREE.TorusGeometry(0.76, 0.08, 6, 20), c.m.stoneWall, M(wx, 0.75, wz, Math.PI / 2, 0, 0), { tint: '#cfc8bb', texM: 1 })
    c.b.add(new THREE.CircleGeometry(0.7, 16), c.m.plain, M(wx, 0.3, wz, -Math.PI / 2, 0, 0), { tint: '#1a2a30', cast: false })
    for (const e of [-1, 1]) woodBox(c, wx, 1.2, wz + e * 0.85, 0.12, 2.4, 0.12, { tint: WOOD.dark })
    woodBox(c, wx, 2.3, wz, 0.14, 0.12, 1.9, { tint: WOOD.dark })
    c.b.add(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 12), c.m.wood, M(wx, 2.15, wz, Math.PI / 2, 0, 0), { tint: WOOD.honey })
    c.b.add(new THREE.CylinderGeometry(0.008, 0.008, 1.3, 4), c.m.rope, M(wx, 1.5, wz + 0.12))
    barrel(c, wx + 0.2, 0, wz + 1.25, 0.6)
    c.col.box(wx, 0.5, wz, 1.7, 1.0, 1.9)
  }
  for (const [x, z, rot] of [
    [-33.5, 23.0, 0],
    [-25.5, 23.0, 0],
    [-42.2, 46.0, Math.PI / 2],
  ] as const) {
    // 縁台（赤い毛氈）
    woodBox(c, x, 0.42, z, 1.6, 0.06, 0.5, { rotY: rot, tint: WOOD.aged })
    c.b.add(rbox(1.7, 0.02, 0.56, 0), c.m.plain, M(x, 0.455, z, 0, rot, 0), { tint: '#c8322a' })
    for (const [dx, dz] of [
      [-0.7, -0.18],
      [0.7, -0.18],
      [-0.7, 0.18],
      [0.7, 0.18],
    ] as const) {
      const cs = Math.cos(rot)
      const sn = Math.sin(rot)
      woodBox(c, x + dx * cs + dz * sn, 0.2, z - dx * sn + dz * cs, 0.06, 0.4, 0.06, { tint: WOOD.dark })
    }
    c.col.box(x, 0.25, z, 1.6, 0.5, 0.5, rot)
  }
  // 高札（お知らせの札。西の土塀の前）
  {
    const x = -42.6
    const z = 30.4
    for (const e of [-1, 1]) woodBox(c, x, 1.2, z + e * 0.9, 0.14, 2.4, 0.14, { tint: WOOD.dark })
    woodBox(c, x + 0.05, 1.7, z, 0.06, 0.9, 1.9, { tint: woodTint(rng, WOOD.fresh) })
    c.b.add(rbox(0.8, 0.12, 2.3, 0.03), c.m.roof, M(x, 2.45, z), { texM: 1.5 })
    signboard(c, { text: '時の鐘\n毎刻 鳴る', vertical: true, w: 360, h: 300, bg: 'white' }, x + 0.1, 1.7, z, Math.PI / 2, 1.6, 0.8, 0.04)
    c.col.box(x, 1.2, z, 0.4, 2.4, 2.0)
  }
  for (let i = 0; i < 5; i++) crate(c, range(rng, -42.4, -41.2), 0, range(rng, 37.5, 39.5), range(rng, 0.45, 0.65), range(rng, -0.4, 0.4))
  barrel(c, -15.0, 0, 44.5, 0.9)
  barrel(c, -15.7, 0, 45.2, 0.85)
  // 広場の木（すみに大きな桜）
  f.cherry(-41.6, 0, 45.9, 1.15, 51)
  f.cherry(-16.2, 0, 23.6, 0.9, 52)
  f.bush(-15.2, 0, 42.6, 0.8, 53)
  // 置き行灯（広場のふち）
  for (const [x, z] of [
    [-42.6, 25.0],
    [-42.6, 36.0],
    [-36.0, 22.3],
    [-21.5, 22.3],
    [-14.4, 32.5],
    [-14.4, 38.5],
    [-35.0, 46.8],
    [-22.0, 46.8],
  ] as const) {
    standLantern(c, x, z)
    c.col.box(x, 0.6, z, 0.4, 1.2, 0.4)
  }
  // 広場の上の提灯の綱（夜に明るい。祭りの飾り）
  for (const [a, b] of [
    [v(-42.8, 4.6, 24.0), v(-14.0, 4.6, 24.0)],
    [v(-42.8, 4.8, 31.5), v(-14.0, 4.8, 31.5)],
  ] as const) {
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 16; k++) {
      const t = k / 16
      pts.push(new THREE.Vector3(a.x + (b.x - a.x) * t, a.y - Math.sin(t * Math.PI) * 0.7, a.z))
    }
    c.b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.015, 4), c.m.darkLacquer, undefined, { cast: false })
    for (const e of [a, b]) woodBox(c, e.x, e.y / 2, e.z, 0.16, e.y + 0.3, 0.16, { tint: WOOD.dark })
    const n = 14
    for (let k = 1; k < n; k++) {
      const t = k / n
      lantern(c, a.x + (b.x - a.x) * t, a.y - Math.sin(t * Math.PI) * 0.7 - 0.25, a.z, { kind: k % 2 ? 'red' : 'cream', s: 0.55, cord: 0.05, light: k % 4 === 2, low: true })
    }
  }
  for (const [x, z] of [
    [-42.8, 24.0],
    [-14.0, 24.0],
    [-42.8, 31.5],
    [-14.0, 31.5],
  ] as const) {
    c.col.box(x, 2.4, z, 0.3, 4.8, 0.3)
  }
  // 囲いの外の家並み（遠景を埋める。当たり判定なし・低い詳細）
  for (let i = 0; i < 4; i++) machiya(c, { ox: P.x0 - 4.0, oz: 22 + i * 7.2, rot: -Math.PI / 2, y: 0 } as Frame, { width: 6.6, depth: 6, lanterns: 'none', lowDetail: true, collider: false, h1: 2.9 })
  for (let i = 0; i < 5; i++) machiya(c, { ox: -46 + i * 8.2, oz: P.z1 + 7.6, rot: 0, y: 0 } as Frame, { width: 7.6, depth: 6, lanterns: 'none', lowDetail: true, collider: false, h1: 3.0 })
  // 広場の幟（時の鐘のお祭り）
  noren(c, -30.2, 3.6, C.PLAZA.z1 - 0.05, 1.6, 0.9, Math.PI, 'redCrest')
}

// ---------------------------------------------------------------- かがり火（夜に燃える）

/** 広場のかがり火（鉄のかごに薪と炎）。setLit で灯す。点光源の候補も足す */
export class Kagaribi {
  readonly group = new THREE.Group()
  private readonly flames: THREE.Sprite[] = []
  private readonly mats: THREE.SpriteMaterial[] = []
  private readonly spots: Array<{ intensity: number }> = []
  private lit = 0
  private want = 0
  private t = 0

  constructor(c: Ctx, places: ReadonlyArray<readonly [number, number]>) {
    for (const [x, z] of places) {
      // 三本の脚と鉄のかご（バッチ）
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2
        c.b.add(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 5), c.m.iron, M(x + Math.cos(a) * 0.32, 0.78, z + Math.sin(a) * 0.32, Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22))
      }
      c.b.add(new THREE.CylinderGeometry(0.42, 0.26, 0.42, 10, 1, true), c.m.iron, M(x, 1.62, z))
      c.b.add(new THREE.TorusGeometry(0.42, 0.03, 4, 14), c.m.iron, M(x, 1.83, z, Math.PI / 2, 0, 0))
      for (let k = 0; k < 6; k++) woodBox(c, x + Math.cos(k) * 0.12, 1.7, z + Math.sin(k) * 0.12, 0.08, 0.5, 0.08, { tint: '#5a3a24', rotZ: Math.cos(k * 2) * 0.5, rotX: Math.sin(k * 2) * 0.5 })
      c.col.box(x, 0.9, z, 0.8, 1.8, 0.8)
      const spot = { pos: new THREE.Vector3(x, 2.2, z), color: '#ff8a3a', intensity: 0, dist: 9 }
      c.lights.push(spot)
      this.spots.push(spot)
      for (let k = 0; k < 3; k++) {
        const m = new THREE.SpriteMaterial({ map: softGlowTexture(), color: k === 0 ? new THREE.Color(2.6, 1.3, 0.4) : new THREE.Color(2.2, 0.7, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false })
        const s = new THREE.Sprite(m)
        s.position.set(x, 2.0 + k * 0.25, z)
        s.scale.set(0.9 - k * 0.15, 1.3 - k * 0.2, 1)
        this.group.add(s)
        this.flames.push(s)
        this.mats.push(m)
      }
    }
    this.group.name = 'kagaribi'
  }

  /** この点光源がかがり火のものか（時間帯で提灯の強さを変えるとき、かがり火は外す） */
  owns(spot: object): boolean {
    return this.spots.includes(spot as { intensity: number })
  }

  /** 灯す・消す（instant でその場で） */
  setLit(on: boolean, instant = false): void {
    this.want = on ? 1 : 0
    if (instant) this.lit = this.want
    this.apply()
  }

  private apply(): void {
    for (const s of this.spots) s.intensity = 6.0 * this.lit
    this.group.visible = this.lit > 0.01
  }

  update(dt: number): void {
    this.t += dt
    if (this.lit !== this.want) {
      this.lit += Math.sign(this.want - this.lit) * Math.min(Math.abs(this.want - this.lit), dt * 1.5)
      this.apply()
    }
    if (this.lit <= 0.01) return
    for (let i = 0; i < this.flames.length; i++) {
      const k = i % 3
      const f = this.flames[i]
      const fl = 0.85 + 0.15 * Math.sin(this.t * (9 + i) + i * 1.7) + 0.08 * Math.sin(this.t * 23 + i)
      f.scale.set((0.9 - k * 0.15) * fl, (1.3 - k * 0.2) * (0.9 + 0.2 * fl), 1)
      this.mats[i].opacity = this.lit * (k === 0 ? 0.95 : 0.7) * fl
    }
  }
}

/** 広場のかがり火の場所（四すみ） */
export const KAGARIBI_PLACES = [
  [-40.6, 24.6],
  [-16.4, 26.4],
  [-40.2, 39.6],
  [-16.6, 38.4],
] as const

export { YAW }
