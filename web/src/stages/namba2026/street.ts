// 2026年 なんばの通り：水路と石の岸・遊歩道・柵・アーチ橋・看板のビル・屋台・街灯・木・ベンチ・自販機・遠景の町並み。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { range, pick } from '../../render/noise'
import { buildWater, type WaterRect } from '../../world/edo/water'
import { N } from './layout'
import { box, boxAB, cyl, sign, decal, lantern, streetLamp, bench, vending, tree, sag, type NCtx } from './kit'

const STONE_TINT = '#ece6dc'

// ------------------------------------------------------------------ 地面・岸・水

/** 南岸から水路へ張り出した板の広場（物語 v7 の 6 章の戦いの場）。x0〜x1、水路の側の端 z0（岸は N.CANAL_S） */
export type RiverDeckSpan = { x0: number; x1: number; z0: number }

export function buildGround(c: NCtx, deck?: RiverDeckSpan): THREE.Mesh {
  // 遊歩道（南・北）。建物の下もふさいでおく
  boxAB(c, -140, 140, -0.3, 0, N.CANAL_S, 44, c.m.paving, { texM: 2.4, r: 0.01 })
  boxAB(c, -140, 140, -0.3, 0, -44, N.CANAL_N, c.m.paving, { texM: 2.4, r: 0.01 })
  c.col.floor(-140, 140, N.CANAL_S, 44, 0, 1)
  c.col.floor(-140, 140, -44, N.CANAL_N, 0, 1)
  // 岸の石垣と笠石
  boxAB(c, -140, 140, N.WL - 1.6, -0.06, N.CANAL_S, N.CANAL_S + 0.6, c.m.stone, { texM: 3, tint: STONE_TINT })
  boxAB(c, -140, 140, N.WL - 1.6, -0.06, N.CANAL_N - 0.6, N.CANAL_N, c.m.stone, { texM: 3, tint: STONE_TINT })
  boxAB(c, -140, 140, -0.06, 0.07, N.CANAL_S - 0.08, N.CANAL_S + 0.5, c.m.stone, { texM: 1.4, tint: '#f6f2ea' })
  boxAB(c, -140, 140, -0.06, 0.07, N.CANAL_N - 0.5, N.CANAL_N + 0.08, c.m.stone, { texM: 1.4, tint: '#f6f2ea' })
  // 水路の底（暗い）
  c.b.add(new THREE.PlaneGeometry(400, 12), c.m.paint, M(0, N.WL - 1.5, 0, -Math.PI / 2, 0, 0), { tint: '#15322f', cast: false })
  // 水面
  const bank = (z: number) => Math.max(0, 1 - Math.min(Math.abs(z - N.CANAL_S), Math.abs(z - N.CANAL_N)) / 0.7) * 0.28
  const rects: WaterRect[] = [
    { x0: -420, x1: -40, z0: N.CANAL_N, z1: N.CANAL_S, y: N.WL, cell: 8, flow: () => [-0.25, 0], foam: () => 0 },
    { x0: -40, x1: 40, z0: N.CANAL_N, z1: N.CANAL_S, y: N.WL, cell: 0.9, flow: () => [-0.25, 0.0], foam: (_x, z) => bank(z) },
    { x0: 40, x1: 420, z0: N.CANAL_N, z1: N.CANAL_S, y: N.WL, cell: 8, flow: () => [-0.25, 0], foam: () => 0 },
  ]
  const water = buildWater(rects, c.m.water)
  water.receiveShadow = true
  c.root.add(water)
  // プレイ範囲の見えない壁と、水への落下防止（橋のところは開ける）
  c.col.wall(N.X0, N.CANAL_N - 8, N.X0, 24, -2, 9)
  c.col.wall(N.X1, N.CANAL_N - 8, N.X1, 24, -2, 9)
  const b0 = N.BRIDGE.x - N.BRIDGE.width / 2
  const b1 = N.BRIDGE.x + N.BRIDGE.width / 2
  for (const z of [N.CANAL_S + 0.12, N.CANAL_N - 0.12]) {
    if (deck && z > 0) {
      // 張り出した広場のところは、広場のふちに沿って囲む
      c.col.wall(N.X0, z, deck.x0, z, 0, 1.2, 0.2)
      c.col.wall(deck.x0, z, deck.x0, deck.z0, 0, 1.2, 0.2)
      c.col.wall(deck.x0, deck.z0, deck.x1, deck.z0, 0, 1.2, 0.2)
      c.col.wall(deck.x1, deck.z0, deck.x1, z, 0, 1.2, 0.2)
      c.col.wall(deck.x1, z, b0, z, 0, 1.2, 0.2)
    } else c.col.wall(N.X0, z, b0, z, 0, 1.2, 0.2)
    c.col.wall(b1, z, N.X1, z, 0, 1.2, 0.2)
  }
  return water
}

/** 岸の柵：石の柱と鎖（プレイ範囲は細かく、遠くは柱だけ）。deck のところは柵を置かない（広場のふちに別の柵） */
export function buildRailings(c: NCtx, deck?: RiverDeckSpan): void {
  const b0 = N.BRIDGE.x - N.BRIDGE.width / 2 - 0.3
  const b1 = N.BRIDGE.x + N.BRIDGE.width / 2 + 0.3
  for (const side of [1, -1]) {
    const z = side * (N.CANAL_S + 0.24)
    let prev: THREE.Vector3 | null = null
    for (let x = -70; x <= 70; x += 2.4) {
      if ((x > b0 && x < b1) || (deck && side > 0 && x > deck.x0 - 0.3 && x < deck.x1 + 0.3)) {
        prev = null
        continue
      }
      const far = Math.abs(x) > 30
      box(c, x, 0.45, z, 0.26, 0.82, 0.26, c.m.stone, { texM: 0.8, tint: '#e2dcd2', far })
      c.b.add(new THREE.ConeGeometry(0.2, 0.14, 4), c.m.stone, M(x, 0.93, z, 0, Math.PI / 4, 0), { tint: '#e2dcd2', cast: !far })
      const top = new THREE.Vector3(x, 0.66, z)
      if (prev && !far) sag(c, prev.clone().add(new THREE.Vector3(0.14, 0, 0)), top.clone().add(new THREE.Vector3(-0.14, 0, 0)), 0.16, 0.022, c.m.metal, '#34383e')
      prev = top
    }
  }
}

// ------------------------------------------------------------------ アーチ橋

export function buildBridge(c: NCtx): void {
  const { x, width, rise } = N.BRIDGE
  const L = 5.9
  const yTop = (z: number) => rise * (1 - (z / L) ** 2)
  // 橋の本体（石の側面＋アーチの下面）を押し出しで作る
  const shape = new THREE.Shape()
  const n = 24
  shape.moveTo(-L, -0.32)
  for (let i = 0; i <= n; i++) {
    const z = -L + (2 * L * i) / n
    shape.lineTo(z, yTop(z) - 0.04)
  }
  shape.lineTo(L, -0.32)
  shape.lineTo(N.CANAL_S, -0.32)
  shape.lineTo(N.CANAL_S, N.WL - 0.4)
  for (let i = 0; i <= n; i++) {
    const z = N.CANAL_S - (2 * N.CANAL_S * i) / n
    shape.lineTo(z, N.WL - 0.4 + (0.55 - (N.WL - 0.4)) * (1 - (z / N.CANAL_S) ** 2))
  }
  shape.lineTo(-N.CANAL_S, -0.32)
  shape.closePath()
  const body = new THREE.ExtrudeGeometry(shape, { depth: width - 0.2, bevelEnabled: false, curveSegments: 4 })
  body.rotateY(Math.PI / 2)
  body.translate(x - (width - 0.2) / 2, 0, 0)
  c.b.add(body, c.m.stone, undefined, { texM: 2.2, tint: '#e6dfd4' })
  // アーチの縁の帯（明るい石）
  for (const s of [-1, 1]) {
    const arc = new THREE.Shape()
    for (let i = 0; i <= n; i++) {
      const z = -N.CANAL_S + (2 * N.CANAL_S * i) / n
      const y = N.WL - 0.4 + (0.55 - (N.WL - 0.4)) * (1 - (z / N.CANAL_S) ** 2)
      if (i === 0) arc.moveTo(z, y - 0.0)
      else arc.lineTo(z, y)
    }
    for (let i = n; i >= 0; i--) {
      const z = -N.CANAL_S + (2 * N.CANAL_S * i) / n
      const y = N.WL - 0.4 + (0.55 - (N.WL - 0.4)) * (1 - (z / N.CANAL_S) ** 2)
      arc.lineTo(z * 1.0, y + 0.32)
    }
    const g = new THREE.ExtrudeGeometry(arc, { depth: 0.12, bevelEnabled: false })
    g.rotateY(Math.PI / 2)
    g.translate(x + s * (width / 2 - 0.08) - 0.06, 0, 0)
    c.b.add(g, c.m.stone, undefined, { texM: 1.5, tint: '#f8f4ec' })
  }
  // 路面（石畳）・当たり判定・欄干
  const segs = 12
  for (let i = 0; i < segs; i++) {
    const za = -L + (2 * L * i) / segs
    const zb = -L + (2 * L * (i + 1)) / segs
    const ya = yTop(za)
    const yb = yTop(zb)
    const len = Math.hypot(zb - za, yb - ya)
    const tilt = -Math.atan2(yb - ya, zb - za)
    const cz = (za + zb) / 2
    const cy = (ya + yb) / 2
    c.b.add(rbox(width - 0.3, 0.12, len + 0.04, 0.01), c.m.paving, M(x, cy - 0.04, cz, tilt, 0, 0), { texM: 2.0, tint: '#f2ece2' })
    c.col.box(x, cy - 0.3, cz, width, 0.6, len + 0.02, 0, tilt)
    for (const s of [-1, 1]) {
      // 欄干（石の低い壁＋笠木）
      c.b.add(rbox(0.26, 0.62, len + 0.02, 0.02), c.m.stone, M(x + s * (width / 2 - 0.13), cy + 0.27, cz, tilt, 0, 0), { texM: 1.2, tint: '#ece4d8' })
      c.b.add(rbox(0.34, 0.08, len + 0.04, 0.02), c.m.stone, M(x + s * (width / 2 - 0.13), cy + 0.62, cz, tilt, 0, 0), { texM: 1.2, tint: '#faf6ee' })
    }
  }
  for (const s of [-1, 1]) c.col.wall(x + s * (width / 2 - 0.1), -L - 0.3, x + s * (width / 2 - 0.1), L + 0.3, -1, 2.8, 0.25)
  // 橋の四隅の親柱と灯り
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const px = x + sx * (width / 2 - 0.13)
      const pz = sz * (L - 0.1)
      box(c, px, 0.6, pz, 0.46, 1.2, 0.46, c.m.stone, { texM: 0.8, tint: '#e2dacc', collide: true })
      cyl(c, px, 1.2, 2.6, pz, 0.06, c.m.metal, { tint: '#2a2d33', seg: 8 })
      c.b.add(new THREE.SphereGeometry(0.16, 14, 10), c.m.lampGlow, M(px, 2.72, pz), { cast: false })
      c.lights.push({ pos: new THREE.Vector3(px, 2.7, pz), color: '#ffcf8a', intensity: 2.0, dist: 7 })
    }
  }
  // 橋の名前の銘板
  sign(c, 'osaka_wide', x, 1.95, -L + 0.0, Math.PI, 2.4, 0.5, { glow: false, depth: 0.05 })
}

// ------------------------------------------------------------------ ビル

type Shop = {
  /** 1 階の看板（アトラスの id） */
  main?: string
  /** 縦の看板（壁から突き出す） */
  vert?: string
  vertSide?: -1 | 1
  /** 正面の大きな看板（上の階） */
  bill?: string
  billSize?: [number, number]
  /** 提灯の id */
  lanternId?: string
  /** 壁の色 */
  tint?: string
  /** 1 階の店先の明かり */
  shopLight?: string
}

/**
 * ビル 1 棟。side=1 は南岸（正面が -Z を向く）、side=-1 は北岸（正面が +Z）。zf は正面の z。
 * far=true は遠景（影なし・簡略）。
 */
export function building(c: NCtx, x0: number, x1: number, zf: number, side: 1 | -1, H: number, o: Shop = {}, far = false): void {
  const w = x1 - x0
  const cx = (x0 + x1) / 2
  const depth = 9
  const zb = zf + side * depth
  const out = -side // 正面の外向き（z の符号）
  const front = zf + out * 0.001
  const tint = o.tint ?? '#e8e2d8'
  const rotFront = side === 1 ? Math.PI : 0 // 看板の正面を通りへ向ける
  const fo = { far }
  // 本体（1 階は少し奥まった店先、上は壁）
  boxAB(c, x0 + 0.05, x1 - 0.05, 4.2, H, Math.min(zf, zb), Math.max(zf, zb), c.m.plaster, { texM: 2.5, tint, ...fo })
  const zShop = zf + side * 0.6
  boxAB(c, x0 + 0.05, x1 - 0.05, 0, 4.2, Math.min(zShop, zb), Math.max(zShop, zb), c.m.plaster, { texM: 2.5, tint: '#d4cdc2', ...fo })
  if (!far) c.col.box(cx, 2.2, zf + side * 0.6 + side * 0.5, w, 4.4, 1.0)
  else c.col.box(cx, 2.2, zf + side * 1, w, 4.4, 1.0)
  // 上の階の窓
  const winH = H - 5.2
  if (winH > 1.5) {
    const cols = Math.max(1, Math.round((w - 1.2) / 1.7))
    const floors = Math.max(1, Math.round(winH / 3.1))
    const g = new THREE.PlaneGeometry(w - 1.2, winH)
    ;(far ? c.bf : c.b).add(g, c.m.windows, M(cx, 4.6 + winH / 2, front + out * 0.02, 0, rotFront, 0), { uv: 'scale', uvScale: [cols / 4, floors / 4], cast: false })
    // 階の帯と両端の柱
    for (let f = 0; f <= floors; f++) {
      const y = 4.4 + (winH / floors) * f
      boxAB(c, x0 + 0.1, x1 - 0.1, y - 0.09, y + 0.09, zf + out * 0.12, zf - out * 0.02, c.m.plaster, { texM: 2, tint: '#f6f2ea', ...fo, cast: false })
    }
    for (const sx of [x0 + 0.35, x1 - 0.35]) boxAB(c, sx - 0.3, sx + 0.3, 4.2, H, zf + out * 0.16, zf - out * 0.02, c.m.plaster, { texM: 2, tint: '#f2ede4', ...fo })
  }
  // 屋上：パラペットと室外機・給水塔
  boxAB(c, x0, x1, H, H + 0.5, Math.min(zf, zb), Math.max(zf, zb), c.m.plaster, { texM: 2, tint: '#cfc8bc', ...fo })
  if (!far) {
    for (let i = 0; i < 2; i++) box(c, cx + range(c.rng, -w / 3, w / 3), H + 0.95, zf + side * range(c.rng, 2, 6), 1.1, 0.9, 0.8, c.m.metal, { tint: '#b8bcc2' })
    if (c.rng() < 0.4) cyl(c, cx, H + 0.5, H + 2.4, zf + side * 5, 0.9, c.m.paint, { tint: '#9aa4ae', seg: 14 })
  }
  // 1 階の店先：ガラス越しの明るい店内・ひさし・看板
  const shopZ = zShop
  decal(c, c.signs.get('shop_inside'), cx, 1.55, shopZ + out * 0.02, rotFront, w - 1.2, 2.6, c.signGlow, far)
  ;(far ? c.bf : c.b).add(new THREE.PlaneGeometry(w - 1.2, 2.6), c.m.glass, M(cx, 1.55, shopZ + out * 0.08, 0, rotFront, 0), { cast: false })
  for (const sx of [x0 + 0.3, x1 - 0.3]) boxAB(c, sx - 0.25, sx + 0.25, 0, 4.2, zf - 0.02 * out, zf + side * 0.62, c.m.plaster, { texM: 2, tint: '#cbc3b6', ...fo })
  // ひさし
  if (!far) {
    c.b.add(rbox(w - 0.4, 0.12, 1.1, 0.02), c.m.paint, M(cx, 3.05, zf + out * 0.5, side * 0.12, 0, 0), { tint: o.tint ? '#3a3a40' : '#8a2a22' })
    if (o.shopLight) c.lights.push({ pos: new THREE.Vector3(cx, 2.4, zf + out * 0.8), color: o.shopLight, intensity: 2.2, dist: 7 })
  }
  if (o.main) sign(c, o.main, cx, 3.75, front + out * 0.06, rotFront, Math.min(w - 1.2, 6.2), 1.0, { glow: true, far })
  if (o.bill) {
    const [bw, bh] = o.billSize ?? [w - 1.6, (w - 1.6) * 0.45]
    sign(c, o.bill, cx, Math.min(H - bh / 2 - 0.6, 4.8 + bh / 2 + 1.2), front + out * 0.2, rotFront, bw, bh, { glow: true, depth: 0.25, far })
  }
  if (o.vert) {
    // 壁から突き出す縦の看板（通りの両方向から読めるように表裏）
    const sx = o.vertSide === -1 ? x0 + 0.5 : x1 - 0.5
    const vh = Math.min(H - 5.2, 6.5)
    const vy = 4.8 + vh / 2
    const vz = zf + out * 0.9
    sign(c, o.vert, sx, vy, vz, Math.PI / 2, 1.2, vh, { glow: true, depth: 0.2, far })
    sign(c, o.vert, sx, vy, vz, -Math.PI / 2, 1.2, vh, { glow: true, depth: 0.2, far })
    boxAB(c, sx - 0.05, sx + 0.05, vy + vh / 2 - 0.2, vy + vh / 2, zf, zf + out * 0.4, c.m.metal, { tint: '#2a2d33', ...fo })
  }
  if (o.lanternId && !far) {
    for (let i = 0; i < Math.floor(w / 1.6); i++) lantern(c, o.lanternId, x0 + 0.9 + i * 1.6, 2.6, zf + out * 0.95, 0.7)
  }
}

/** 北岸の看板のビル（プレイ範囲の向こう岸） */
export function buildNorthSide(c: NCtx): void {
  const z = N.FACADE_N
  const list: Array<[number, number, number, Shop]> = [
    [-30, -22.5, 16, { main: 'sushi_v', vert: 'kissa_v', bill: 'karaoke', billSize: [5.2, 1.6], shopLight: '#ffd0a0' }],
    [-22.5, -14.5, 24, { main: 'gourmet', vert: 'osaka_red', vertSide: -1, bill: 'namba_big', billSize: [6.4, 3.2], tint: '#d8d2c8', shopLight: '#ffcf9a' }],
    [-14.5, -7, 18, { main: 'ramen_v', vert: 'ramen_v', bill: 'ido_ad', billSize: [6.0, 3.0], tint: '#e6e0d4', shopLight: '#ffe0b0', lanternId: 'kushi_lantern' }],
    [-7, 1, 21, { main: 'drug', vert: 'izakaya_v', vertSide: -1, bill: 'osaka_v', billSize: [2.4, 5.4], tint: '#d0d6dc', shopLight: '#f0f6ff' }],
    [1, 8.5, 15, { main: 'okonomi_main', vert: 'okonomi_v', bill: 'gyoza_v', billSize: [1.6, 4.4], shopLight: '#ffcf9a' }],
    [8.5, 17, 26, { main: 'cafe', vert: 'takoyaki_red_v', vertSide: -1, bill: 'hotel', billSize: [4.2, 1.4], tint: '#cfc6b8', shopLight: '#ffe6c0' }],
    [17, 25, 19, { main: 'udon_main', vert: 'sushi_v', bill: 'karaoke', billSize: [5.6, 1.7], shopLight: '#ffd6a8', lanternId: 'tako_lantern' }],
    [25, 32, 22, { main: 'kushi_main', vert: 'gyoza_v', vertSide: -1, bill: 'drug', billSize: [4.4, 1.6] }],
  ]
  for (const [x0, x1, H, o] of list) building(c, x0, x1, z, -1, H, o)
  // 北岸の遊歩道の木と街灯
  for (const [x, s, sd] of [
    [-17, 0.95, 1],
    [-4, 1.05, 2],
    [6.5, 0.9, 3],
    [20, 1.0, 4],
  ] as const)
    tree(c, x, -8.6, s, sd)
  for (const x of [-22, -10, 2, 18]) streetLamp(c, x, -5.9)
}

/** 南岸の店（NEXTMAKE の両側） */
export function buildSouthSide(c: NCtx): void {
  const z = N.FACADE_S
  building(c, -27, -19, z, 1, 13, { main: 'udon_main', vert: 'udon_v', vertSide: -1, tint: '#efe8dc', shopLight: '#ffd6a8', lanternId: 'kushi_lantern' })
  building(c, -1, 7, z, 1, 12, { main: 'tako_main', vert: 'tako_v', tint: '#f0e6d6', shopLight: '#ffc890' })
  building(c, 7, 15, z, 1, 15.5, { main: 'kushi_main', vert: 'kushi_v', bill: 'osaka_wide', billSize: [6.4, 1.4], tint: '#e4dccf', shopLight: '#ffd090' })
  // 15〜18 は古い路地（alley.ts。奥に IDO の石標 C）
  building(c, 18, 24, z, 1, 11, { main: 'okonomi_main', vert: 'okonomi_v', vertSide: -1, tint: '#f2ece0', shopLight: '#ffc890', lanternId: 'tako_lantern' })
  // 遊歩道の街灯・ベンチ・木・自販機
  for (const x of [-22.5, -14, -2, 7, 19]) streetLamp(c, x, N.CANAL_S + 0.95)
  bench(c, 1.6, N.CANAL_S + 1.3, Math.PI)
  bench(c, -16.8, N.CANAL_S + 1.3, Math.PI)
  bench(c, 20.6, 9.6, 0)
  tree(c, -23.4, 9.3, 0.95, 7)
  tree(c, 21.6, 9.0, 1.0, 8)
  vending(c, 5.6, N.FACADE_S - 0.45, Math.PI, '#d8382a')
  vending(c, 4.5, N.FACADE_S - 0.45, Math.PI, '#2a6ad8')
  takoyakiStall(c, 2.4, N.FACADE_S - 1.2)
}

/** たこ焼の屋台（店先のカウンター・鉄板の明かり・赤い提灯・のれん・品書き） */
function takoyakiStall(c: NCtx, x: number, z: number): void {
  boxAB(c, x - 1.5, x + 1.5, 0, 1.0, z - 0.45, z + 0.45, c.m.woodPlain, { tint: '#9a5a32', collide: true })
  boxAB(c, x - 1.6, x + 1.6, 1.0, 1.08, z - 0.55, z + 0.55, c.m.woodPlain, { tint: '#c88a52' })
  // 鉄板（焼けている丸いくぼみの光）
  boxAB(c, x - 1.0, x + 0.6, 1.08, 1.16, z - 0.3, z + 0.3, c.m.metal, { tint: '#2a2622' })
  for (let i = 0; i < 6; i++) {
    for (let k = 0; k < 3; k++) {
      c.b.add(new THREE.SphereGeometry(0.075, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), c.m.paint, M(x - 0.88 + i * 0.27, 1.14, z - 0.18 + k * 0.18), { tint: '#c87a3a', cast: false })
    }
  }
  // 柱・屋根・のれん
  for (const sx of [-1.45, 1.45]) cyl(c, x + sx, 1.08, 2.7, z - 0.4, 0.05, c.m.metal, { tint: '#3a3a40', seg: 8 })
  c.b.add(rbox(3.4, 0.1, 1.4, 0.02), c.m.paint, M(x, 2.75, z - 0.2, 0.18, 0, 0), { tint: '#c8281c' })
  decal(c, c.signs.get('tako_noren'), x, 2.35, z - 0.86, Math.PI, 2.9, 0.75, c.signMat)
  for (const sx of [-1.2, 0, 1.2]) lantern(c, 'tako_lantern', x + sx, 2.12, z - 0.95, 0.62)
  sign(c, 'tako_menu', x + 1.1, 1.38, z - 0.5, Math.PI, 0.7, 0.44, { glow: false, depth: 0.03 })
  c.lights.push({ pos: new THREE.Vector3(x, 1.5, z - 0.8), color: '#ffae5a', intensity: 2.8, dist: 6 })
}

// ------------------------------------------------------------------ 遠景（水路の先へ続く町並み）

export function buildFar(c: NCtx): void {
  const rng = c.rng
  const shops: Shop[] = [
    { vert: 'osaka_red', bill: 'karaoke' },
    { vert: 'ramen_v', bill: 'namba_big', billSize: [6, 3] },
    { vert: 'izakaya_v' },
    { vert: 'tako_v', bill: 'hotel' },
    { vert: 'gyoza_v', bill: 'gourmet', billSize: [6, 1.2] },
    { vert: 'sushi_v' },
    { vert: 'okonomi_v', bill: 'drug' },
  ]
  for (const side of [1, -1] as const) {
    const zf = side * 11
    for (const dir of [-1, 1]) {
      let x = dir < 0 ? (side === 1 ? -27 : -30) : side === 1 ? 24 : 32
      for (let i = 0; i < 12; i++) {
        const w = range(rng, 6, 10)
        const x0 = dir < 0 ? x - w : x
        const x1 = dir < 0 ? x : x + w
        const H = range(rng, 12, 30)
        building(c, x0, x1, zf, side, H, { ...pick(rng, shops), tint: pick(rng, ['#e8e2d8', '#d6d0c6', '#cfd6dc', '#e2d8c8', '#c8c0b4']) }, true)
        x = dir < 0 ? x0 : x1
      }
    }
  }
  // 遠くの橋（東西）
  for (const bx of [-64, 76]) {
    boxAB(c, bx - 3, bx + 3, -0.4, 0.5, -6, 6, c.m.stone, { texM: 2, tint: '#d8d0c4', far: true })
    boxAB(c, bx - 3, bx - 2.7, 0.5, 1.4, -6, 6, c.m.stone, { texM: 2, tint: '#e8e0d4', far: true })
    boxAB(c, bx + 2.7, bx + 3, 0.5, 1.4, -6, 6, c.m.stone, { texM: 2, tint: '#e8e0d4', far: true })
  }
  // 水路の突き当たりの高層ビルと塔
  for (const [x, z, w, d, h] of [
    [-150, -20, 30, 24, 60],
    [-160, 20, 26, 30, 48],
    [150, -26, 28, 26, 70],
    [170, 18, 30, 28, 52],
    [-200, 0, 40, 40, 85],
    [210, 0, 40, 40, 90],
  ] as const) {
    boxAB(c, x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2, c.m.plaster, { tint: '#c8ccd2', far: true, texM: 6 })
    for (const face of [1, -1]) {
      const g = new THREE.PlaneGeometry(d - 2, h - 4)
      c.bf.add(g, c.m.windows, M(x - (face * w) / 2 - face * 0.05, h / 2, z, 0, -face * Math.PI / 2, 0), { uv: 'scale', uvScale: [(d - 2) / 7, (h - 4) / 12], cast: false })
    }
  }
  // 細い電波塔（一般的な鉄塔）
  const tx = 240
  const tz = -60
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4
    const g = new THREE.CylinderGeometry(0.5, 0.9, 90, 6)
    const dir = new THREE.Vector3(-Math.cos(a) * 0.12, 1, -Math.sin(a) * 0.12).normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    const m = new THREE.Matrix4().compose(new THREE.Vector3(tx + Math.cos(a) * 6, 45, tz + Math.sin(a) * 6), q, new THREE.Vector3(1, 1, 1))
    c.bf.add(g, c.m.metal, m, { tint: '#d8dce2', cast: false })
  }
  cyl(c, tx, 85, 100, tz, 1.4, c.m.paint, { tint: '#e8ecf0', far: true, seg: 10 })
  cyl(c, tx, 100, 125, tz, 0.3, c.m.metal, { tint: '#d0d4da', far: true, seg: 6 })
  // 遠景の地面（建物の裏）
  c.bf.add(new THREE.PlaneGeometry(900, 300), c.m.paint, M(0, -0.05, 170, -Math.PI / 2, 0, 0), { tint: '#8a8a84', cast: false })
  c.bf.add(new THREE.PlaneGeometry(900, 300), c.m.paint, M(0, -0.05, -170, -Math.PI / 2, 0, 0), { tint: '#8a8a84', cast: false })
  // 裏の町（低いビルの塊）
  for (let i = 0; i < 70; i++) {
    const x = range(rng, -260, 260)
    const z = (rng() < 0.5 ? -1 : 1) * range(rng, 26, 120)
    const w = range(rng, 8, 18)
    const h = range(rng, 10, 45)
    boxAB(c, x - w / 2, x + w / 2, 0, h, z - w / 2, z + w / 2, c.m.plaster, { tint: pick(rng, ['#d6d2cc', '#c4c8ce', '#e0d8cc', '#b8bec6']), far: true, texM: 6 })
    const g = new THREE.PlaneGeometry(w - 1, h - 2)
    const face = z > 0 ? -1 : 1
    c.bf.add(g, c.m.windows, M(x, h / 2, z + (face * w) / 2 + face * 0.06, 0, face > 0 ? 0 : Math.PI, 0), { uv: 'scale', uvScale: [(w - 1) / 7, (h - 2) / 12], cast: false })
  }
}
