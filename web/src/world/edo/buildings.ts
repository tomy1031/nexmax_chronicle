// 町家・源兵衛の工房・水門番の家（おはるのバルコニー）・土蔵・上流の屋根付き水路倉庫。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { range, pick } from '../../render/noise'
import type { FabricDesign } from '../../render/textures'
import { WOOD, woodBox, woodTint, gableRoof, shedRoof, lantern, noren, signboard, crate, barrel, railing, post, ropeCoil, type Ctx } from './kit'

/** ローカル座標（X=間口、Z=奥行き、正面は -Z 側）→ ワールド */
export type Frame = { ox: number; oz: number; rot: number; y: number }

function fx(f: Frame, lx: number, lz: number): [number, number] {
  const c = Math.cos(f.rot)
  const s = Math.sin(f.rot)
  return [f.ox + lx * c + lz * s, f.oz - lx * s + lz * c]
}

function box(c: Ctx, f: Frame, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, mat: THREE.Material, tint?: THREE.ColorRepresentation, texM = 1.6, r = 0.03, cast = true): void {
  const [x, z] = fx(f, lx, lz)
  c.b.add(rbox(sx, sy, sz, r), mat, M(x, f.y + ly, z, 0, f.rot, 0), { tint: tint ?? '#ffffff', texM, cast })
}

function wbox(c: Ctx, f: Frame, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, tint?: THREE.ColorRepresentation): void {
  const [x, z] = fx(f, lx, lz)
  woodBox(c, x, f.y + ly, z, sx, sy, sz, { rotY: f.rot, tint: tint ?? woodTint(c.rng, WOOD.aged) })
}

export type MachiyaOpts = {
  width: number
  depth: number
  h1?: number
  h2?: number
  noren?: FabricDesign
  sign?: { text: string; gear?: boolean }
  vsign?: string
  lanterns?: 'cream' | 'red' | 'mixed' | 'none'
  shop?: 'goods' | 'tea' | 'workshop' | 'closed'
  balcony?: boolean
  roofTint?: THREE.ColorRepresentation
  plasterTint?: THREE.ColorRepresentation
  collider?: boolean
  lowDetail?: boolean
}

/** 町家。frame の原点＝正面中央の地面。 */
export function machiya(c: Ctx, f: Frame, o: MachiyaOpts): void {
  const W = o.width
  const D = o.depth
  const h1 = o.h1 ?? 3.0
  const h2 = o.h2 ?? 2.3
  const H = h1 + h2
  const postT = woodTint(c.rng, WOOD.dark, 0.08)
  const plasterT = o.plasterTint ?? '#ffffff'
  const low = o.lowDetail ?? false
  // 土台・床
  box(c, f, 0, 0.12, 0.25, W, 0.24, 0.5, c.m.stoneWall, '#e9e2d6', 3, 0.04)
  // 壁（側面・背面・2階正面）
  box(c, f, -W / 2 + 0.08, H / 2, D / 2, 0.16, H, D, c.m.plaster, plasterT, 3, 0.02)
  box(c, f, W / 2 - 0.08, H / 2, D / 2, 0.16, H, D, c.m.plaster, plasterT, 3, 0.02)
  box(c, f, 0, H / 2, D - 0.08, W, H, 0.16, c.m.plaster, plasterT, 3, 0.02)
  box(c, f, 0, h1 + h2 / 2 + 0.1, 0.5, W - 0.2, h2 - 0.2, 0.18, c.m.plaster, plasterT, 3, 0.02)
  // 柱
  const nb = Math.max(2, Math.round(W / 1.9))
  for (let i = 0; i <= nb; i++) {
    const lx = -W / 2 + 0.12 + ((W - 0.24) * i) / nb
    wbox(c, f, lx, H / 2, 0.14, 0.22, H, 0.22, postT)
  }
  // 胴差し（1階と2階の間の梁）
  wbox(c, f, 0, h1 - 0.05, 0.12, W + 0.05, 0.32, 0.26, postT)
  wbox(c, f, 0, H - 0.1, 0.45, W + 0.05, 0.22, 0.24, postT)
  // 1階の店先
  const shop = o.shop ?? 'goods'
  const bayW = (W - 0.24) / nb
  if (!low) {
    // 室内（暖かい光の奥壁＋棚）
    box(c, f, 0, h1 / 2, 2.6, W - 0.4, h1, 0.1, c.m.interior, '#ffffff', 2, 0.01, false)
    box(c, f, 0, 0.32, 1.5, W - 0.4, 0.12, 2.0, c.m.wood, woodTint(c.rng, WOOD.warm), 1.6, 0.02, false)
    box(c, f, 0, h1 - 0.25, 1.4, W - 0.4, 0.1, 2.4, c.m.wood, WOOD.dark, 1.6, 0.01, false)
    for (let s = 0; s < 3; s++) {
      box(c, f, 0, 0.9 + s * 0.55, 2.4, W - 0.6, 0.05, 0.4, c.m.wood, WOOD.aged, 1.6, 0.01, false)
      for (let k = 0; k < Math.floor(W * 2.2); k++) {
        if (c.rng() < 0.35) continue
        const lx = -W / 2 + 0.5 + range(c.rng, 0, W - 1.0)
        const sz = range(c.rng, 0.12, 0.3)
        const col = pick(c.rng, ['#c9a26a', '#b5533c', '#3f5a8a', '#d8c9a0', '#8a6a3c', '#e2b04a', '#6b8c4a'])
        box(c, f, lx, 0.95 + s * 0.55 + sz / 2, 2.35, sz, sz, sz * 0.8, c.m.plain, col, 1, 0, false)
      }
    }
  }
  for (let i = 0; i < nb; i++) {
    const lx = -W / 2 + 0.12 + bayW * (i + 0.5)
    const open = shop !== 'closed' && (i === Math.floor(nb / 2) || (i % 2 === 0 && shop !== 'tea'))
    if (!open) {
      // 格子（出格子）
      const n = Math.floor(bayW / 0.085)
      for (let k = 0; k < n; k++) {
        const sx = lx - bayW / 2 + 0.06 + (k * (bayW - 0.12)) / (n - 1)
        box(c, f, sx, 1.25, 0.05, 0.035, 2.0, 0.05, c.m.wood, WOOD.dark, 1.6, 0.0)
      }
      wbox(c, f, lx, 0.22, 0.05, bayW, 0.1, 0.12, postT)
      wbox(c, f, lx, 2.28, 0.05, bayW, 0.1, 0.12, postT)
      if (!low) box(c, f, lx, 1.25, 0.32, bayW - 0.05, 2.1, 0.04, c.m.shoji, '#ffffff', bayW, 0.0, false)
    }
  }
  // 暖簾
  if (o.noren && !low) {
    const lx = -W / 2 + 0.12 + bayW * (Math.floor(nb / 2) + 0.5)
    const [x, z] = fx(f, lx, -0.05)
    noren(c, x, f.y + 2.25, z, Math.min(bayW - 0.1, 1.9), 0.95, f.rot, o.noren)
  }
  // 庇（1階の屋根）
  {
    const [x, z] = fx(f, 0, -0.45)
    shedRoof(c, x, z, W + 0.3, 1.2, f.y + h1 + 0.55, f.rot + Math.PI, 0.42)
  }
  // 2階の窓：虫籠窓 or 格子
  const nw = Math.max(1, Math.round(W / 2.6))
  for (let i = 0; i < nw; i++) {
    const lx = -W / 2 + (W * (i + 0.5)) / nw
    const ww = Math.min(1.6, W / nw - 0.6)
    box(c, f, lx, h1 + h2 * 0.55, 0.38, ww + 0.16, 0.9, 0.06, c.m.wood, WOOD.dark, 1.6, 0.01)
    if (!low) box(c, f, lx, h1 + h2 * 0.55, 0.42, ww, 0.75, 0.03, c.m.shoji, '#ffffff', ww, 0, false)
    const ns = Math.floor(ww / 0.12)
    for (let k = 0; k <= ns; k++) {
      box(c, f, lx - ww / 2 + (k * ww) / ns, h1 + h2 * 0.55, 0.36, 0.05, 0.8, 0.06, c.m.plaster, plasterT, 1, 0)
    }
  }
  // 卯建（うだつ）
  if (!low) {
    for (const e of [-1, 1]) {
      box(c, f, e * (W / 2 - 0.1), h1 + 1.1, 0.0, 0.18, 1.5, 0.9, c.m.plaster, plasterT, 3, 0.02)
      box(c, f, e * (W / 2 - 0.1), h1 + 1.92, -0.05, 0.36, 0.14, 1.1, c.m.roof, '#8d96a6', 2, 0.03)
    }
  }
  // 大屋根
  {
    const [x, z] = fx(f, 0, D / 2 + 0.1)
    gableRoof(c, x, z, W + 0.5, D + 1.3, f.y + H + 0.05, 1.55, f.rot === 0 || Math.abs(f.rot - Math.PI) < 0.01 ? 'x' : 'z', { tint: o.roofTint, endTiles: !low })
  }
  // 看板（屋根看板）
  if (o.sign) {
    const [x, z] = fx(f, 0, 0.1)
    const sw = Math.min(W * 0.8, 1.0 * o.sign.text.length + (o.sign.gear ? 1.2 : 0.6))
    signboard(c, { text: o.sign.text, w: 512, h: Math.round(512 * (0.85 / sw)), gear: o.sign.gear }, x, f.y + h1 + 1.15, z - 0.0, f.rot + Math.PI, sw, 0.85, 0.1)
  }
  if (o.vsign) {
    const [x, z] = fx(f, -W / 2 - 0.2, -0.6)
    signboard(c, { text: o.vsign, vertical: true, w: 160, h: 512 }, x, f.y + 1.9, z, f.rot + Math.PI, 0.5, 1.6, 0.08)
  }
  // 提灯
  const lk = o.lanterns ?? 'cream'
  if (lk !== 'none') {
    for (const e of [-1, 1]) {
      const [x, z] = fx(f, e * (W / 2 - 0.6), -1.0)
      const kind = lk === 'mixed' ? (e < 0 ? 'red' : 'cream') : lk
      lantern(c, x, f.y + h1 - 0.2, z, { kind, cord: 0.15, light: !low })
    }
  }
  // 2階の手すり
  if (o.balcony) {
    const [ax, az] = fx(f, -W / 2 + 0.3, -0.25)
    const [bx, bz] = fx(f, W / 2 - 0.3, -0.25)
    railing(c, ax, az, bx, bz, f.y + h1 + 0.3, { h: 0.7, spacing: 1.0, collider: false })
  }
  if (o.collider ?? true) {
    const [x, z] = fx(f, 0, D / 2 + 0.15)
    c.col.box(x, f.y + 3, z, f.rot === 0 || Math.abs(f.rot - Math.PI) < 0.01 ? W : D - 0.3, 6, f.rot === 0 || Math.abs(f.rot - Math.PI) < 0.01 ? D - 0.3 : W)
  }
}

/** 源兵衛の工房：大看板・からくり縦看板・歯車の暖簾・店先の道具 */
export function genbeiWorkshop(c: Ctx, f: Frame): void {
  const W = 10
  machiya(c, f, { width: W, depth: 7.5, h1: 3.4, h2: 2.4, shop: 'workshop', lanterns: 'cream', noren: undefined })
  // 大看板「源兵衛」＋歯車
  {
    const [x, z] = fx(f, 0.6, -0.1)
    signboard(c, { text: '源兵衛', w: 1024, h: 340, gear: true }, x, f.y + 4.6, z, f.rot + Math.PI, 4.6, 1.5, 0.16)
    // 看板の腕木
    for (const e of [-1, 1]) {
      const [px, pz] = fx(f, 0.6 + e * 2.0, 0.1)
      woodBox(c, px, f.y + 5.45, pz, 0.14, 0.14, 0.5, { rotY: f.rot, tint: WOOD.dark })
    }
  }
  // 歯車模様の暖簾（4 枚）
  for (let i = 0; i < 4; i++) {
    const [x, z] = fx(f, -2.7 + i * 1.8, -0.05)
    noren(c, x, f.y + 3.15, z, 1.55, 1.05, f.rot, 'gearIndigo')
  }
  // からくり縦看板（柱に、通りを来る人へ向ける）
  {
    const [x, z] = fx(f, -W / 2 - 0.35, -1.0)
    woodBox(c, x, f.y + 2.4, z, 0.22, 4.8, 0.22, { tint: WOOD.dark })
    signboard(c, { text: 'からくり', vertical: true, w: 200, h: 720, gear: true }, x - 0.17, f.y + 3.0, z, f.rot - Math.PI / 2, 0.62, 2.3, 0.1)
  }
  // 袖看板「源兵衛」（壁から突き出し、通りの奥へ向ける）
  {
    const lx = -W / 2 + 2.4
    const [x, z] = fx(f, lx, -1.3)
    signboard(c, { text: '源兵衛', w: 900, h: 340, gear: true }, x, f.y + 4.3, z, f.rot - Math.PI / 2, 2.5, 0.95, 0.12)
    for (const dz of [-0.9, 0.9]) {
      const [bx, bz] = fx(f, lx, -1.3 + dz)
      woodBox(c, bx, f.y + 4.9, bz, 0.1, 0.25, 0.1, { tint: WOOD.dark })
    }
    const [ax, az] = fx(f, lx, -0.65)
    woodBox(c, ax, f.y + 5.05, az, 0.14, 0.14, 2.2, { rotY: f.rot, tint: WOOD.dark })
  }
  // 店先の歯車飾り（壁に立てかけ）と道具
  for (const [lx, r, ly] of [
    [-3.8, 0.55, 0.6],
    [3.9, 0.45, 0.5],
    [4.4, 0.3, 1.3],
  ] as const) {
    const [x, z] = fx(f, lx, -0.25)
    const g = new THREE.CylinderGeometry(r, r, 0.12, 12)
    c.b.add(g, c.m.wood, M(x, f.y + ly, z, Math.PI / 2, f.rot, 0), { tint: WOOD.honey, uv: 'scale', uvScale: [1, 0.2] })
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2
      const [tx, tz] = fx(f, lx + Math.cos(a) * (r + 0.07), -0.25)
      c.b.add(rbox(0.1, 0.12, 0.13, 0.02), c.m.wood, M(tx, f.y + ly + Math.sin(a) * (r + 0.07), tz, 0, f.rot, a), { tint: WOOD.honey, texM: 1 })
    }
    c.b.add(new THREE.CylinderGeometry(r * 0.25, r * 0.25, 0.16, 10), c.m.iron, M(x, f.y + ly, z, Math.PI / 2, f.rot, 0))
  }
  for (const [lx, lz, s, rot] of [
    [-3.0, -1.0, 0.7, 0.2],
    [-2.3, -1.3, 0.55, -0.3],
    [-3.0, -1.0, 0.0, 0],
    [3.2, -1.1, 0.75, 0.1],
    [2.4, -0.9, 0.5, 0.4],
  ] as const) {
    if (s === 0) continue
    const [x, z] = fx(f, lx, lz)
    crate(c, x, f.y, z, s, f.rot + rot)
  }
  {
    const [x, z] = fx(f, -3.0, -1.0)
    crate(c, x, f.y + 0.7, z, 0.5, f.rot - 0.15)
    const [bx, bz] = fx(f, 1.7, -0.8)
    barrel(c, bx, f.y, bz)
    const [rx, rz] = fx(f, 4.5, -0.9)
    ropeCoil(c, rx, f.y, rz)
  }
}

/** 水門番の家（2 階にバルコニー：朱の欄干・大きな提灯）。正面＝北（水路側） */
export function gatehouse(c: Ctx, f: Frame): void {
  const W = 7.9
  const D = 6.0
  const h1 = 4.15
  const h2 = 2.5
  const H = h1 + h2
  const postT = woodTint(c.rng, WOOD.dark, 0.06)
  // 石の基礎（水際）
  box(c, f, 0, 0.6, D / 2, W, 1.2, D, c.m.stoneWall, '#ffffff', 3, 0.04)
  // 壁
  box(c, f, 0, H / 2 + 0.6, D / 2 + 0.2, W - 0.1, H, D - 0.4, c.m.plaster, '#fbf3e6', 3, 0.02)
  // 1 階の板壁
  box(c, f, 0, 0.6 + (h1 - 0.6) / 2, 0.24, W, h1 - 0.6, 0.1, c.m.planks, woodTint(c.rng, WOOD.aged), 1.6, 0.01)
  for (let i = 0; i <= 4; i++) wbox(c, f, -W / 2 + 0.15 + ((W - 0.3) * i) / 4, H / 2 + 0.3, 0.14, 0.26, H + 0.6, 0.26, postT)
  wbox(c, f, 0, h1 - 0.1, 0.1, W + 0.1, 0.34, 0.3, postT)
  // バルコニー（北へ張り出す）
  const by = h1
  const bd = 1.15
  {
    const [x, z] = fx(f, 0, -bd / 2)
    woodBox(c, x, f.y + by - 0.07, z, W + 0.3, 0.14, bd, { rotY: f.rot, tint: woodTint(c.rng, WOOD.warm) })
    c.col.box(x, f.y + by - 0.2, z, W + 0.3, 0.4, bd, f.rot)
    for (let i = 0; i <= 5; i++) {
      const [px, pz] = fx(f, -W / 2 + ((W * i) / 5), -bd + 0.1)
      woodBox(c, px, f.y + by - 0.35, pz, 0.18, 0.5, 0.18, { tint: postT })
      // 持ち送り
      const [kx, kz] = fx(f, -W / 2 + ((W * i) / 5), -bd / 2 + 0.05)
      woodBox(c, kx, f.y + by - 0.32, kz, 0.14, 0.2, bd - 0.2, { rotY: f.rot, tint: postT })
    }
    const [ax, az] = fx(f, -W / 2 - 0.1, -bd + 0.08)
    const [bx, bz] = fx(f, W / 2 + 0.1, -bd + 0.08)
    railing(c, ax, az, bx, bz, f.y + by, { red: true, h: 0.85, spacing: 1.3 })
    const [cx2, cz2] = fx(f, -W / 2 - 0.1, -0.05)
    railing(c, ax, az, cx2, cz2, f.y + by, { red: true, h: 0.85, spacing: 1.1 })
    // 2 階の障子戸（灯り）
    box(c, f, 0, by + 1.15, 0.22, W - 1.0, 2.0, 0.05, c.m.shoji, '#ffffff', 2, 0, false)
    for (let i = 0; i <= 6; i++) wbox(c, f, -(W - 1.0) / 2 + ((W - 1.0) * i) / 6, by + 1.15, 0.18, 0.08, 2.05, 0.08, postT)
    // バルコニーの庇
    const [sx2, sz2] = fx(f, 0, -0.5)
    shedRoof(c, sx2, sz2, W + 0.6, 1.6, f.y + H + 0.3, f.rot + Math.PI, 0.5)
    // 大提灯
    for (const lx of [-2.6, 1.4]) {
      const [px, pz] = fx(f, lx, -bd + 0.25)
      lantern(c, px, f.y + by + 1.75, pz, { kind: 'cream', s: 1.7, cord: 0.25 })
    }
  }
  // 大屋根
  {
    const [x, z] = fx(f, 0, D / 2 + 0.2)
    gableRoof(c, x, z, W + 0.6, D + 1.0, f.y + H + 0.65, 1.7, 'x')
  }
  // 1 階の入口と提灯
  {
    const [x, z] = fx(f, 1.8, -0.02)
    noren(c, x, f.y + 3.0, z, 1.6, 0.95, f.rot, 'redCrest')
  }
  // 西の面（通りの突き当たり）：店構え・暖簾・提灯・格子・庇
  {
    const wx = f.ox - W / 2 - 0.02
    const z0 = f.oz + 0.6
    const z1 = f.oz + D - 0.3
    const len = z1 - z0
    c.b.add(rbox(0.1, h1 - 1.2, len, 0.01), c.m.planks, M(wx - 0.02, 1.2 + (h1 - 1.2) / 2, (z0 + z1) / 2), { tint: woodTint(c.rng, WOOD.aged), texM: 1.6 })
    for (let i = 0; i <= 4; i++) woodBox(c, wx - 0.1, h1 / 2 + 0.3, z0 + (len * i) / 4, 0.22, h1 + 0.6, 0.22, { tint: postT })
    woodBox(c, wx - 0.1, h1 - 0.15, (z0 + z1) / 2, 0.3, 0.3, len + 0.3, { tint: postT })
    // 格子の窓
    for (const zc of [z0 + len * 0.18, z0 + len * 0.82]) {
      for (let k = 0; k < 14; k++) woodBox(c, wx - 0.14, 2.1, zc - 0.6 + k * 0.09, 0.05, 1.5, 0.035, { tint: WOOD.dark })
      c.b.add(rbox(0.04, 1.5, 1.25, 0), c.m.shoji, M(wx - 0.05, 2.1, zc), { texM: 1.25, cast: false })
    }
    noren(c, wx - 0.2, 2.9, (z0 + z1) / 2, 1.8, 1.0, Math.PI / 2, 'redCrest')
    c.b.add(rbox(0.06, 2.2, 1.7, 0), c.m.interior, M(wx + 0.05, 1.5, (z0 + z1) / 2), { cast: false })
    shedRoof(c, wx - 0.6, (z0 + z1) / 2, len + 0.4, 1.2, h1 + 0.5, -Math.PI / 2, 0.42)
    for (const zc of [z0 + 0.4, z1 - 0.4]) lantern(c, wx - 0.85, h1 - 0.45, zc, { kind: 'red', cord: 0.15 })
    signboard(c, { text: '水門茶屋', w: 640, h: 180 }, wx - 0.2, h1 + 1.25, (z0 + z1) / 2, -Math.PI / 2, 3.0, 0.8, 0.1)
    // 2 階の窓
    for (const zc of [z0 + len * 0.3, z0 + len * 0.7]) {
      c.b.add(rbox(0.06, 0.95, 1.4, 0.01), c.m.wood, M(wx - 0.05, h1 + 1.35, zc), { tint: WOOD.dark, texM: 1.6 })
      c.b.add(rbox(0.03, 0.8, 1.25, 0), c.m.shoji, M(wx - 0.09, h1 + 1.35, zc), { texM: 1.25, cast: false })
    }
  }
  const [x, z] = fx(f, 0, D / 2)
  c.col.box(x, f.y + 3, z, W, 6, D)
}

/** 土蔵：白壁＋なまこ壁＋小窓 */
export function kura(c: Ctx, f: Frame, W = 4.5, D = 5, H = 5.2): void {
  box(c, f, 0, H / 2, D / 2, W, H, D, c.m.plaster, '#ffffff', 3, 0.05)
  // なまこ壁（下部の灰色瓦＋白目地）
  box(c, f, 0, 0.75, 0.0, W + 0.06, 1.5, 0.08, c.m.roof, '#6e7686', 1.0, 0.02)
  for (let k = 0; k <= Math.floor(W / 0.45); k++) {
    box(c, f, -W / 2 + k * 0.45, 0.75, -0.05, 0.06, 1.5, 0.04, c.m.plain, '#f4f1ea', 1, 0.01)
  }
  for (let k = 0; k <= 3; k++) box(c, f, 0, 0.05 + k * 0.48, -0.05, W, 0.06, 0.04, c.m.plain, '#f4f1ea', 1, 0.01)
  // 小窓
  box(c, f, 0, H * 0.72, -0.05, 0.9, 0.8, 0.14, c.m.darkLacquer, '#ffffff', 1, 0.03)
  box(c, f, 0, H * 0.72, -0.12, 1.1, 1.0, 0.06, c.m.plaster, '#ffffff', 1, 0.03)
  const [x, z] = fx(f, 0, D / 2)
  gableRoof(c, x, z, W + 0.5, D + 0.8, f.y + H, 1.3, f.rot === 0 || Math.abs(f.rot - Math.PI) < 0.01 ? 'x' : 'z')
  c.col.box(x, f.y + 3, z, f.rot === 0 || Math.abs(f.rot - Math.PI) < 0.01 ? W : D, 6, f.rot === 0 || Math.abs(f.rot - Math.PI) < 0.01 ? D : W)
}

/** 上流の屋根付き水路倉庫（導水路をまたぐ） */
export function coveredWarehouse(c: Ctx, x0: number, x1: number, z0: number, z1: number, baseY: number): void {
  const H = 4.2
  const postT = woodTint(c.rng, WOOD.dark)
  for (let x = x0; x <= x1 + 0.01; x += (x1 - x0) / 5) {
    for (const z of [z0, z1]) post(c, x, z, baseY - 0.6, baseY + H, 0.3, postT)
    woodBox(c, x, baseY + H - 0.2, (z0 + z1) / 2, 0.24, 0.3, z1 - z0 + 0.4, { tint: postT })
  }
  for (const z of [z0, z1]) woodBox(c, (x0 + x1) / 2, baseY + H, z, x1 - x0 + 0.4, 0.3, 0.26, { tint: postT })
  // 腰板
  for (const z of [z0, z1]) {
    c.b.add(rbox(x1 - x0, 1.2, 0.08, 0.01), c.m.planks, M((x0 + x1) / 2, baseY + 1.0, z + (z === z0 ? -0.1 : 0.1)), { tint: woodTint(c.rng, WOOD.aged), texM: 1.6 })
  }
  gableRoof(c, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0 + 1.6, z1 - z0 + 2.2, baseY + H + 0.15, 2.0, 'x')
  // 中の滑車と吊り荷
  for (let k = 0; k < 3; k++) {
    const x = x0 + 1.5 + k * ((x1 - x0 - 3) / 2)
    c.b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 14), c.m.wood, M(x, baseY + H - 0.6, (z0 + z1) / 2, Math.PI / 2, 0, 0), { tint: WOOD.honey, uv: 'scale', uvScale: [1, 0.2] })
    c.b.add(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 5), c.m.rope, M(x, baseY + H - 1.5, (z0 + z1) / 2 + 0.3))
    crate(c, x, baseY + H - 3.0, (z0 + z1) / 2 + 0.3, 0.6, 0.3)
  }
  for (let k = 0; k < 4; k++) lantern(c, x0 + 1 + k * ((x1 - x0 - 2) / 3), baseY + H - 0.7, z0 - 0.3, { cord: 0.2, light: false })
}
