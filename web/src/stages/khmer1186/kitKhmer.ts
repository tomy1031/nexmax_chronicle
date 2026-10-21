// 1186年 クメールの都の形の部品。Batch に箱・円柱・回転体を積んで、マテリアルごとに 1 メッシュへ結合する。
// 区画（zone）ごとに Batch を分ける：画面に入らない区画・影のカメラに入らない区画は、まとめて描かずにすむ。
import * as THREE from 'three'
import { Batch, M, between, rbox } from '../../render/batch'
import type { Rng } from '../../render/noise'
import type { QualitySettings } from '../../render/quality'
import type { ColliderList } from '../../world/colliders'
import type { LightSpot } from '../../world/edo/kit'
import { KC, type KhmerMaterials } from './materialsKhmer'
import type { KhmerBodies } from './physKhmer'
import type { StiltHouseDef } from './layout'

export type ZoneId = 'village' | 'water' | 'temple' | 'south' | 'route'

export type KCtx = {
  /** 今の区画の、影を落とす静的な物 */
  b: Batch
  /** 遠景（影なし・区画なし） */
  bf: Batch
  zones: Map<ZoneId, Batch>
  m: KhmerMaterials
  col: ColliderList
  /** 後から切り替える・動かす当たり判定（大階段の段・落ちる石・象の背中） */
  bodies: KhmerBodies
  lights: LightSpot[]
  root: THREE.Group
  updaters: Array<(dt: number, t: number) => void>
  rng: Rng
  q: QualitySettings
  /** 松明の火の位置（fxKhmer の Torches でまとめて 1 つのメッシュに） */
  torches: THREE.Vector3[]
  /** 炭火の位置（かまど） */
  embers: THREE.Vector3[]
  /** 布（クロマー）：fxKhmer でまとめる */
  cloths: Array<{ a: THREE.Vector3; b: THREE.Vector3; drop: number; tile: number }>
}

/** 区画を切り替える（以後の c.b はその区画の Batch） */
export function zone(c: KCtx, id: ZoneId): void {
  let b = c.zones.get(id)
  if (!b) {
    b = new Batch()
    c.zones.set(id, b)
  }
  c.b = b
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type BoxOpts = {
  rotY?: number
  rotX?: number
  rotZ?: number
  tint?: THREE.ColorRepresentation
  texM?: number
  r?: number
  cast?: boolean
  far?: boolean
  collide?: boolean
}

export function box(c: KCtx, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, mat: THREE.Material, o: BoxOpts = {}): void {
  const r = o.r ?? Math.min(0.03, Math.min(sx, sy, sz) * 0.15)
  ;(o.far ? c.bf : c.b).add(rbox(sx, sy, sz, r), mat, M(cx, cy, cz, o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0), { tint: o.tint ?? '#ffffff', texM: o.texM, cast: o.far ? false : o.cast })
  if (o.collide) c.col.box(cx, cy, cz, sx, sy, sz, o.rotY ?? 0, o.rotX ?? 0, o.rotZ ?? 0)
}

export function boxAB(c: KCtx, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: THREE.Material, o: BoxOpts = {}): void {
  box(c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), mat, o)
}

export function cyl(
  c: KCtx,
  x: number,
  y0: number,
  y1: number,
  z: number,
  r0: number,
  mat: THREE.Material,
  o: { r1?: number; tint?: THREE.ColorRepresentation; seg?: number; cast?: boolean; far?: boolean; open?: boolean; collide?: boolean; texM?: number } = {},
): void {
  const h = y1 - y0
  ;(o.far ? c.bf : c.b).add(new THREE.CylinderGeometry(o.r1 ?? r0, r0, h, o.seg ?? 12, 1, o.open ?? false), mat, M(x, (y0 + y1) / 2, z), { tint: o.tint ?? '#ffffff', cast: o.far ? false : o.cast, texM: o.texM })
  if (o.collide) collideCylinder(c, x, y0, y1, z, Math.max(r0, o.r1 ?? r0))
}

/** 円柱の当たり判定（向きをずらした 3 枚の箱） */
export function collideCylinder(c: KCtx, x: number, y0: number, y1: number, z: number, r: number): void {
  const s = r * 2 * 0.93
  for (let k = 0; k < 3; k++) c.col.box(x, (y0 + y1) / 2, z, s, y1 - y0, s, (k * Math.PI) / 6)
}

export function strut(c: KCtx, a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material, tint: THREE.ColorRepresentation, o: { far?: boolean; seg?: number; r1?: number; cast?: boolean } = {}): void {
  const g = new THREE.CylinderGeometry(o.r1 ?? r, r, 1, o.seg ?? 6, 1, true)
  ;(o.far ? c.bf : c.b).add(g, mat, between(a, b), { tint, cast: o.far ? false : (o.cast ?? true) })
}

/**
 * 坂の当たり判定（上面が a→b の線分を通る、幅 w・厚さ t の板）。a・b は上面の中心線の両端（足もとの高さ）。
 * 回転は Y→X→Z（physics.ts と同じ 'YXZ'）：ローカルで +X へ上る板を Z で傾け、Y で向ける
 */
export function rampBox(a: THREE.Vector3, b: THREE.Vector3, w: number, t = 0.5): { center: THREE.Vector3; size: THREE.Vector3; rotY: number; rotZ: number } {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const run = Math.hypot(dx, dz)
  const rise = b.y - a.y
  const len = Math.hypot(run, rise)
  const ang = Math.atan2(rise, run)
  const rotY = Math.atan2(-dz, dx)
  // 上面の中心から、法線の逆へ t/2
  const nx = -Math.sin(ang)
  const ny = Math.cos(ang)
  const hx = (dx / run) * nx
  const hz = (dz / run) * nx
  const center = v((a.x + b.x) / 2 - (hx * t) / 2, (a.y + b.y) / 2 - (ny * t) / 2, (a.z + b.z) / 2 - (hz * t) / 2)
  return { center, size: v(len, t, w), rotY, rotZ: ang }
}

export function collideRamp(c: KCtx, a: THREE.Vector3, b: THREE.Vector3, w: number, t = 0.5): void {
  const r = rampBox(a, b, w, t)
  c.col.box(r.center.x, r.center.y, r.center.z, r.size.x, r.size.y, r.size.z, r.rotY, 0, r.rotZ)
}

// ------------------------------------------------------------------ 寺の石組み

/**
 * 段（基壇の 1 段）：本体と、下の台座の帯・上のコーニス（ひさし）。半分の幅 hx, hz・高さ y0→y1。
 * collide で本体の当たり判定
 */
export function tier(c: KCtx, cx: number, cz: number, hx: number, hz: number, y0: number, y1: number, o: { tint?: string; collide?: boolean; mat?: THREE.Material; band?: boolean } = {}): void {
  const mat = o.mat ?? c.m.sandstone
  const tint = o.tint ?? KC.sand
  const h = y1 - y0
  const bandH = Math.min(0.32, h * 0.12)
  // 本体（少し内側）
  box(c, cx, (y0 + y1) / 2, cz, hx * 2 - 0.2, h, hz * 2 - 0.2, mat, { tint, texM: 3 })
  if (o.band !== false) {
    // 台座の帯（下）とコーニス（上）
    box(c, cx, y0 + bandH / 2, cz, hx * 2 + 0.06, bandH, hz * 2 + 0.06, mat, { tint: shade(tint, 0.94), texM: 3 })
    // コーニスの上面は本体より 2cm 上（同じ面が重なってちらつかないように）
    box(c, cx, y1 - bandH * 0.4 + 0.02, cz, hx * 2 + 0.2, bandH * 0.8, hz * 2 + 0.2, mat, { tint: shade(tint, 1.04), texM: 3 })
    // コーニスの下のはすの花びらの帯（細い段）
    box(c, cx, y1 - bandH * 1.1, cz, hx * 2 + 0.06, bandH * 0.5, hz * 2 + 0.06, mat, { tint: shade(tint, 0.9), texM: 3 })
  }
  if (o.collide) c.col.box(cx, (y0 + y1) / 2, cz, hx * 2, h, hz * 2)
}

/** 色を明るさで少し変える */
export function shade(col: THREE.ColorRepresentation, k: number): string {
  const cc = new THREE.Color(col)
  cc.multiplyScalar(k)
  return '#' + cc.getHexString()
}

/** 屋根のつの（アンテフィクス：炎の形の小さな飾り） */
function antefix(c: KCtx, x: number, y: number, z: number, s: number, tint: string, rotY = 0): void {
  c.b.add(new THREE.ConeGeometry(s * 0.45, s * 1.5, 4, 1), c.m.sandstone, M(x, y + s * 0.75, z, 0, rotY + Math.PI / 4, 0), { tint, cast: false })
}

/**
 * 祠堂の塔（アンコールのつぼみの形）。x, z は中心、y0 は塔の下（本体の上）、w は下の幅、h は高さ。
 * 段ごとに十字（角を刻んだ形）を重ね、上ほど細く、つぼみのようにふくらませる。角と辺の中に炎の飾り。てっぺんにはすの実
 */
export function prasatSpire(c: KCtx, x: number, y0: number, z: number, w: number, h: number, o: { tint?: string; tiers?: number; antefix?: boolean } = {}): void {
  const tint = o.tint ?? KC.sand
  const n = o.tiers ?? 7
  const body = h * 0.88
  let y = y0
  // 段の高さ：下ほど高い（合計 body）
  const ws: number[] = []
  const hs: number[] = []
  let sum = 0
  for (let k = 0; k < n; k++) {
    const t = k / n
    const hk = 1 - t * 0.45
    hs.push(hk)
    sum += hk
    // つぼみの形：少しふくらんでから細る
    ws.push(w * (0.94 - 0.66 * Math.pow(t, 1.25)) * (1 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 1.6))))
  }
  for (let k = 0; k < n; k++) {
    const hk = (hs[k] / sum) * body
    const wk = ws[k]
    const sh = shade(tint, 0.96 + (k % 2) * 0.06)
    // 十字の段（中心＋2 本の腕）
    box(c, x, y + hk * 0.4, z, wk * 0.82, hk * 0.8, wk * 0.82, c.m.sandstone, { tint: sh, texM: 2 })
    box(c, x, y + hk * 0.4, z, wk, hk * 0.8, wk * 0.56, c.m.sandstone, { tint: sh, texM: 2 })
    box(c, x, y + hk * 0.4, z, wk * 0.56, hk * 0.8, wk, c.m.sandstone, { tint: sh, texM: 2 })
    // コーニス
    box(c, x, y + hk * 0.86, z, wk * 1.06, hk * 0.18, wk * 1.06, c.m.sandstone, { tint: shade(tint, 1.06), texM: 2 })
    if (o.antefix !== false) {
      const s = Math.max(0.12, wk * 0.11)
      const e = wk * 0.5
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        antefix(c, x + dx * e * (dz === 0 || dx === 0 ? 1.02 : 0.98), y + hk * 0.95, z + dz * e * (dz === 0 || dx === 0 ? 1.02 : 0.98), s, tint)
    }
    y += hk
  }
  // てっぺん：はすの実と、細い先
  const top = y
  const r = ws[n - 1] * 0.42
  c.b.add(new THREE.SphereGeometry(r, 10, 8), c.m.sandstone, M(x, top + r * 0.8, z, 0, 0, 0, 1, 1.25, 1), { tint, cast: true })
  c.b.add(new THREE.ConeGeometry(r * 0.45, h - body - r * 1.4, 8), c.m.sandstone, M(x, top + r * 1.7 + (h - body - r * 1.4) / 2, z), { tint, cast: true })
}

/** にせの扉（祠堂の窓のない面の飾り：扉の枠と、閉じた扉の浮き彫り） */
export function falseDoor(c: KCtx, x: number, y0: number, z: number, nx: number, nz: number, w: number, h: number, tint: string): void {
  const rotY = Math.atan2(nx, nz)
  const px = (d: number) => x + nx * d
  const pz = (d: number) => z + nz * d
  // 枠の柱 2 本・まぐさ・扉の板
  const side = (s: number) => {
    const ox = -nz * s * (w / 2)
    const oz = nx * s * (w / 2)
    box(c, px(0.12) + ox, y0 + h / 2, pz(0.12) + oz, 0.22, h, 0.22, c.m.sandstone, { tint: shade(tint, 1.05), rotY, texM: 1 })
  }
  side(1)
  side(-1)
  box(c, px(0.14), y0 + h + 0.15, pz(0.14), w + 0.5, 0.3, 0.26, c.m.sandstone, { tint: shade(tint, 1.08), rotY, texM: 1 })
  box(c, px(0.04), y0 + h / 2, pz(0.04), w - 0.2, h - 0.1, 0.12, c.m.sandstone, { tint: shade(tint, 0.82), rotY, texM: 1 })
  // ペディメント（三角の破風）
  const tri = new THREE.ConeGeometry(w * 0.62, h * 0.38, 3, 1)
  tri.rotateY(Math.PI / 6)
  tri.scale(1, 1, 0.18)
  c.b.add(tri, c.m.sandstone, M(px(0.14), y0 + h + 0.3 + h * 0.19, pz(0.14), 0, rotY, 0), { tint: shade(tint, 1.02) })
}

/** 小さな祠堂（本体 + 四方のにせの扉 + 塔）。中は入れない */
export function smallPrasat(c: KCtx, x: number, y0: number, z: number, w: number, h: number, tint: string, collide = true): void {
  const bodyH = h * 0.36
  tier(c, x, z, w / 2 + 0.15, w / 2 + 0.15, y0, y0 + 0.35, { tint: shade(tint, 0.92), band: false })
  box(c, x, y0 + 0.35 + bodyH / 2, z, w, bodyH, w, c.m.sandstone, { tint, texM: 2 })
  for (const [nx, nz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    falseDoor(c, x + nx * (w / 2), y0 + 0.35, z + nz * (w / 2), nx, nz, w * 0.36, bodyH * 0.62, tint)
  box(c, x, y0 + 0.35 + bodyH + 0.12, z, w * 1.12, 0.24, w * 1.12, c.m.sandstone, { tint: shade(tint, 1.06), texM: 2 })
  prasatSpire(c, x, y0 + 0.35 + bodyH + 0.24, z, w * 0.96, h - bodyH - 0.6, { tint, tiers: 6 })
  if (collide) c.col.box(x, y0 + h / 2, z, w + 0.3, h, w + 0.3)
}

/** 獅子の像（階段の両わきの番人）。rotY は顔の向き（-Z が正面の決まりで）。すわった姿の石像 */
export function lion(c: KCtx, x: number, y: number, z: number, rotY: number, s = 1, tint: string = KC.sand): void {
  const fx = -Math.sin(rotY)
  const fz = -Math.cos(rotY)
  /** 前へ f・上へ up・横へ side の点の行列（体の向きに回す） */
  const P = (f: number, up: number, side = 0, rx = 0) => M(x + (fx * f - fz * side) * s, y + up * s, z + (fz * f + fx * side) * s, rx, rotY, 0)
  const S = c.m.sandstone
  const add = (g: THREE.BufferGeometry, m: THREE.Matrix4, t: string) => c.b.add(g, S, m, { tint: t, texM: 1 })
  // 台
  add(rbox(0.72 * s, 0.3 * s, 1.1 * s, 0.04), P(0, 0.15), shade(tint, 0.86))
  // 後ろ足のふともも（すわっている）
  add(rbox(0.66 * s, 0.5 * s, 0.62 * s, 0.1), P(-0.22, 0.55), tint)
  // 胸と胴（前へ少し反る）
  add(rbox(0.56 * s, 0.82 * s, 0.46 * s, 0.1), P(0.12, 0.9, 0, -0.18), shade(tint, 1.02))
  // たてがみ（顔のまわりの大きな丸）
  c.b.add(new THREE.SphereGeometry(0.36 * s, 10, 8), S, P(0.2, 1.42).multiply(new THREE.Matrix4().makeScale(1.05, 1.0, 0.55)), { tint: shade(tint, 0.94), texM: 1 })
  // 顔・鼻先・耳
  add(rbox(0.44 * s, 0.4 * s, 0.34 * s, 0.08), P(0.34, 1.42), shade(tint, 1.06))
  add(rbox(0.28 * s, 0.2 * s, 0.2 * s, 0.05), P(0.52, 1.34), shade(tint, 1.1))
  for (const sd of [-1, 1]) {
    c.b.add(new THREE.SphereGeometry(0.07 * s, 6, 5), S, P(0.5, 1.5, sd * 0.13), { tint: '#3a3028' })
    add(rbox(0.1 * s, 0.14 * s, 0.08 * s, 0.02), P(0.3, 1.66, sd * 0.2), shade(tint, 0.98))
    // 前足
    add(rbox(0.15 * s, 0.72 * s, 0.17 * s, 0.04), P(0.3, 0.66, sd * 0.17), shade(tint, 1.0))
    add(rbox(0.18 * s, 0.1 * s, 0.24 * s, 0.03), P(0.36, 0.33, sd * 0.17), shade(tint, 0.96))
  }
  // しっぽ（背中にそって）
  c.b.add(new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 0.6 * s, 5), S, P(-0.5, 0.75, 0, 0.5), { tint: shade(tint, 0.9) })
  c.col.box(x, y + 0.85 * s, z, 0.75 * s, 1.7 * s, 1.1 * s, rotY)
}

// ------------------------------------------------------------------ ナーガ（七つの頭の蛇）

/**
 * ナーガの手すり：低い柱の上に、太い蛇の胴（丸い手すり）。a→b の線にそって（高さ y は胴の中心）。
 * 見えない壁つき（落ちないように）
 */
export function nagaRail(c: KCtx, ax: number, az: number, bx: number, bz: number, y0: number, y: number, tint: string = KC.sand): void {
  const a = v(ax, y, az)
  const b = v(bx, y, bz)
  // 胴（うろこの帯がわかるように少し太さを変えた円柱を 2 本重ねる）
  const body = new THREE.CylinderGeometry(0.2, 0.2, 1, 10, 1, true)
  c.b.add(body, c.m.sandstone, between(a, b), { tint, cast: true })
  const belly = new THREE.CylinderGeometry(0.205, 0.205, 1, 10, 1, true, Math.PI * 0.75, Math.PI * 0.5)
  c.b.add(belly, c.m.sandstone, between(a.clone().setY(y - 0.01), b.clone().setY(y - 0.01)), { tint: shade(tint, 1.12), cast: false })
  // 支えの柱（こびと・ガルーダの代わりの、丸い頭の柱）
  const len = Math.hypot(bx - ax, bz - az)
  const n = Math.max(2, Math.round(len / 1.6))
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const px = ax + (bx - ax) * t
    const pz = az + (bz - az) * t
    box(c, px, (y0 + y) / 2, pz, 0.3, y - y0, 0.3, c.m.sandstone, { tint: shade(tint, 0.92), texM: 1 })
  }
  c.col.wall(ax, az, bx, bz, y0, y + 0.6, 0.35)
}

/**
 * ナーガの頭（七つの頭が扇のように開く）。x, z は首の根もと、y は地面、rotY は頭の向く方向（-Z が正面）。
 * 首が持ち上がり、7 つの頭のうしろに光背のような板
 */
export function nagaHead(c: KCtx, x: number, y: number, z: number, rotY: number, s = 1, tint: string = KC.sand): void {
  const fx = -Math.sin(rotY)
  const fz = -Math.cos(rotY)
  const rx = Math.cos(rotY)
  const rz = -Math.sin(rotY)
  const P = (f: number, up: number, r = 0) => v(x + fx * f * s + rx * r * s, y + up * s, z + fz * f * s + rz * r * s)
  // 台座
  box(c, x, y + 0.35 * s, z, 1.0 * s, 0.7 * s, 1.0 * s, c.m.sandstone, { rotY, tint: shade(tint, 0.88), texM: 1 })
  // 首（持ち上がる胴）
  const neck = new THREE.CatmullRomCurve3([P(-1.2, 0.95), P(-0.4, 1.0), P(0.05, 1.5), P(0.05, 2.25)])
  c.b.add(new THREE.TubeGeometry(neck, 10, 0.24 * s, 8, false), c.m.sandstone, undefined, { tint })
  // 光背（扇の板）
  const fan = new THREE.CircleGeometry(1.25 * s, 18, 0, Math.PI)
  c.b.add(fan, c.m.sandstone, M(P(-0.12, 2.15).x, P(-0.12, 2.15).y, P(-0.12, 2.15).z, 0, rotY, 0), { tint: shade(tint, 0.94) })
  const fanBack = new THREE.CircleGeometry(1.25 * s, 18, 0, Math.PI)
  fanBack.rotateY(Math.PI)
  c.b.add(fanBack, c.m.sandstone, M(P(-0.14, 2.15).x, P(-0.14, 2.15).y, P(-0.14, 2.15).z, 0, rotY, 0), { tint: shade(tint, 0.86) })
  // 光背のふち（玉の飾り）
  for (let k = 0; k <= 12; k++) {
    const a = (k / 12) * Math.PI
    const p = P(-0.1, 2.15 + Math.sin(a) * 1.28, Math.cos(a) * 1.28)
    c.b.add(new THREE.SphereGeometry(0.11 * s, 6, 5), c.m.sandstone, M(p.x, p.y, p.z), { tint: shade(tint, 1.06), cast: false })
  }
  // 7 つの頭（まん中がいちばん高い）
  for (let k = -3; k <= 3; k++) {
    const a = (k / 3) * 1.15
    const up = 2.25 + Math.cos(a) * 0.95
    const side = Math.sin(a) * 0.98
    const p = P(0.08, up, side)
    // 首
    c.b.add(new THREE.CylinderGeometry(0.09 * s, 0.13 * s, 0.75 * s, 6), c.m.sandstone, between(P(0.04, 2.2, side * 0.35), p), { tint })
    // 頭（ふくらんだフード＋鼻先）
    c.b.add(new THREE.SphereGeometry(0.2 * s, 8, 6), c.m.sandstone, M(p.x, p.y, p.z, 0, rotY, 0, 1.1, 1.0, 0.75), { tint: shade(tint, 1.04) })
    const nose = P(0.3, up - 0.04, side * 1.02)
    c.b.add(new THREE.SphereGeometry(0.12 * s, 7, 5), c.m.sandstone, M(nose.x, nose.y, nose.z, 0, rotY, 0, 0.9, 0.7, 1.4), { tint: shade(tint, 1.08), cast: false })
  }
  c.col.box(x, y + 1.6 * s, z, 1.3 * s, 3.2 * s, 1.3 * s, rotY)
}

// ------------------------------------------------------------------ 村

/**
 * 高床の家：柱・床・縁台（手すり）・編み壁・ヤシの葉の切妻屋根・はしご。
 * 部屋（壁と屋根）は箱の当たり判定（中には入れない）、縁台は歩ける床
 */
export function stiltHouse(c: KCtx, d: StiltHouseDef, rotY = 0): void {
  const { x, z, w, floorY } = d
  const dd = d.d
  const p = d.porch
  const W = w + p * 2
  const D = dd + p * 2
  const rng = c.rng
  const base = d.water ? -2.2 : 0
  const woodT = KC.wood
  // 柱（水の中まで）
  const nx = Math.max(2, Math.round(W / 1.8))
  const nz = Math.max(2, Math.round(D / 1.8))
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz && (i + j) % 2 === 1) continue
      const px = x - W / 2 + (W * i) / nx
      const pz = z - D / 2 + (D * j) / nz
      cyl(c, px, base, floorY - 0.05, pz, 0.11, c.m.wood, { tint: shade(woodT, 0.8 + rng() * 0.25), seg: 6, r1: 0.1 })
    }
  // 床と縁台（板）
  boxAB(c, x - W / 2, x + W / 2, floorY - 0.16, floorY, z - D / 2, z + D / 2, c.m.planks, { tint: '#ffffff', texM: 2, collide: true })
  // 縁台の手すり（低い。入口の側はあける）
  const railY = floorY + 0.55
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    strut(c, v(ax, railY, az), v(bx, railY, bz), 0.04, c.m.wood, shade(woodT, 1.1), { cast: false })
    c.col.wall(ax, az, bx, bz, floorY, floorY + 0.8, 0.12)
  }
  const gap = 0.9
  rail(x - W / 2, z - D / 2, x + W / 2, z - D / 2)
  rail(x - W / 2, z + D / 2, x - gap, z + D / 2)
  rail(x + gap, z + D / 2, x + W / 2, z + D / 2)
  // 横の手すりは中ほどを開ける（金具から飛びこんで着地する所）
  rail(x - W / 2, z - D / 2, x - W / 2, z - 0.9)
  rail(x - W / 2, z + 0.9, x - W / 2, z + D / 2)
  rail(x + W / 2, z - D / 2, x + W / 2, z - 0.9)
  rail(x + W / 2, z + 0.9, x + W / 2, z + D / 2)
  for (const [px, pz] of [
    [x - W / 2, z - D / 2],
    [x + W / 2, z - D / 2],
    [x - W / 2, z + D / 2],
    [x + W / 2, z + D / 2],
  ])
    cyl(c, px, floorY, railY + 0.05, pz, 0.05, c.m.wood, { tint: woodT, seg: 5, cast: false })
  // 部屋：編み壁と、木の枠・窓・入口
  const wallH = 1.75
  boxAB(c, x - w / 2, x + w / 2, floorY, floorY + wallH, z - dd / 2, z + dd / 2, c.m.weave, { tint: KC.weave, texM: 1.2 })
  c.col.box(x, floorY + wallH / 2 + 0.6, z, w + 0.1, wallH + 1.2, dd + 0.1)
  for (const [cx, cz] of [
    [x - w / 2, z - dd / 2],
    [x + w / 2, z - dd / 2],
    [x - w / 2, z + dd / 2],
    [x + w / 2, z + dd / 2],
  ])
    box(c, cx, floorY + wallH / 2, cz, 0.14, wallH, 0.14, c.m.wood, { tint: shade(woodT, 0.9) })
  // 入口（南の面）と窓（暗い四角）
  box(c, x, floorY + 0.8, z + dd / 2 + 0.02, 0.8, 1.5, 0.04, c.m.plain, { tint: '#2a1c12', cast: false })
  box(c, x - w / 2 - 0.02, floorY + 1.1, z, 0.04, 0.55, 0.9, c.m.plain, { tint: '#2a1c12', cast: false })
  box(c, x + w / 2 + 0.02, floorY + 1.1, z, 0.04, 0.55, 0.9, c.m.plain, { tint: '#2a1c12', cast: false })
  // 切妻屋根（ヤシの葉）：棟は x 方向
  const roofY = floorY + wallH
  const ov = 0.75
  const ridgeH = Math.max(1.6, dd * 0.55)
  const halfD = dd / 2 + ov
  const slope = Math.hypot(halfD, ridgeH)
  const ang = Math.atan2(ridgeH, halfD)
  const roofTint = shade(KC.thatch, 0.85 + d.hue * 0.25)
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(w + ov * 2, slope)
    g.rotateX(-Math.PI / 2)
    g.translate(0, 0, (s * slope) / 2)
    // 棟（z=0 の縁）から軒へ下がるように X で傾けて、棟の位置へ
    const mm = new THREE.Matrix4().compose(v(x, roofY + ridgeH, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(s * ang, 0, 0, 'YXZ')), v(1, 1, 1))
    c.b.add(g, c.m.thatch, mm, { tint: roofTint, uv: 'scale', uvScale: [(w + ov * 2) / 2.2, slope / 2.2] })
  }
  // 破風（三角の壁）と棟
  for (const s of [-1, 1]) {
    const tri = new THREE.BufferGeometry()
    const px = x + s * (w / 2)
    tri.setAttribute('position', new THREE.Float32BufferAttribute([px, roofY, z - dd / 2, px, roofY, z + dd / 2, px, roofY + ridgeH - 0.1, z], 3))
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2))
    tri.computeVertexNormals()
    const tri2 = tri.clone()
    tri2.setIndex([0, 2, 1])
    tri2.computeVertexNormals()
    c.b.add(tri, c.m.weave, undefined, { tint: KC.weave })
    c.b.add(tri2, c.m.weave, undefined, { tint: KC.weave })
    // 破風の飾り（反り上がった角）
    c.b.add(new THREE.ConeGeometry(0.08, 0.6, 5), c.m.wood, M(x + s * (w / 2 + ov), roofY + ridgeH + 0.2, z, 0, 0, s * 0.5), { tint: KC.woodDark })
  }
  box(c, x, roofY + ridgeH + 0.04, z, w + ov * 2 + 0.1, 0.14, 0.24, c.m.wood, { tint: KC.woodDark })
  // はしご（陸の家は入口から地面へ）
  if (!d.water) {
    const lz = z + D / 2 + 0.6
    for (const s of [-1, 1]) strut(c, v(x + s * 0.35, 0, lz + 0.5), v(x + s * 0.35, floorY, z + D / 2 - 0.05), 0.05, c.m.wood, woodT)
    for (let k = 1; k <= 5; k++) {
      const t = k / 6
      box(c, x, floorY * t, lz + 0.5 * (1 - t) - 0.05, 0.8, 0.06, 0.12, c.m.wood, { tint: woodT, cast: false })
    }
    // 床下：つぼ・ハンモック
    cyl(c, x - w * 0.3, 0, 0.7, z - dd * 0.2, 0.28, c.m.clay, { r1: 0.18, tint: KC.clay, seg: 10 })
    cyl(c, x - w * 0.3 + 0.7, 0, 0.55, z - dd * 0.25, 0.22, c.m.clay, { r1: 0.15, tint: KC.clayDark, seg: 10 })
    c.col.box(x - w * 0.3 + 0.35, 0.35, z - dd * 0.22, 1.3, 0.7, 0.6)
  }
  void rotY
}

/** ヤシ。kind='sugar'：まっすぐな幹と丸い扇の葉の冠（サトウヤシ）／'coco'：曲がった幹と羽の葉 */
export function palm(c: KCtx, x: number, z: number, h: number, kind: 'sugar' | 'coco', y0 = 0, far = false, collide = true): void {
  const r = c.rng
  const lean = kind === 'coco' ? 0.8 + r() * 1.4 : 0.1 + r() * 0.2
  const dir = r() * Math.PI * 2
  const top = v(x + Math.cos(dir) * lean, y0 + h, z + Math.sin(dir) * lean)
  const mid = v(x + Math.cos(dir) * lean * 0.35, y0 + h * 0.5, z + Math.sin(dir) * lean * 0.35)
  const B = far ? c.bf : c.b
  const curve = new THREE.QuadraticBezierCurve3(v(x, y0, z), mid, top)
  B.add(new THREE.TubeGeometry(curve, far ? 3 : 6, kind === 'sugar' ? 0.18 : 0.15, far ? 4 : 6, false), c.m.bark, undefined, { tint: KC.palmTrunk, cast: !far })
  // 冠の下のふくらみ
  B.add(new THREE.SphereGeometry(kind === 'sugar' ? 0.42 : 0.3, 6, 5), c.m.bark, M(top.x, top.y - 0.1, top.z), { tint: shade(KC.palmTrunk, 0.8), cast: false })
  const n = kind === 'sugar' ? (far ? 8 : 13) : far ? 7 : 10
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4
    let g: THREE.BufferGeometry
    let rot: THREE.Euler
    if (kind === 'sugar') {
      // 扇：根もと（下のまん中）が原点の半円のカード。上を向いた角度 el で外へ開く
      const R = 1.05 + r() * 0.25
      g = new THREE.PlaneGeometry(R * 2, R)
      g.translate(0, R / 2, 0)
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), 0.5 + uv.getY(i) * 0.5)
      // 葉柄の分だけ外へ
      g.translate(0, 0.35, 0)
      const el = -0.2 + r() * 1.5
      rot = new THREE.Euler(Math.PI / 2 - el, a, (r() - 0.5) * 0.5, 'YXZ')
    } else {
      // 羽：根もと（左）が原点。外へのび、先が垂れる
      const L = 2.6 + r() * 0.7
      g = new THREE.PlaneGeometry(L, L * 0.5)
      g.translate(L / 2, 0, 0)
      const uv = g.attributes.uv as THREE.BufferAttribute
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * 0.5)
      rot = new THREE.Euler(Math.PI / 2 + (r() - 0.5) * 0.5, a, -0.15 - r() * 0.55, 'YZX')
    }
    const m = new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromEuler(rot), v(1, 1, 1))
    B.add(g, c.m.palm, m, { tint: new THREE.Color().setHSL(0.24 + r() * 0.04, 0.35, 0.72 + r() * 0.12), cast: !far })
  }
  if (collide && !far) c.col.box(x, y0 + 1.5, z, 0.35, 3, 0.35)
}

const AXIS_Z = new THREE.Vector3(0, 0, 1)
const ONE = new THREE.Vector3(1, 1, 1)

/**
 * 葉のかたまり：丸いかたまり（半径 R、たてに ky 倍）と、その表面にそって外を向いた葉のカード（cards 枚、一辺 card）。
 * カードは上半分に多く置き、かたまりの面の向き（外向き）にそろえる（ばらばらに刺さった紙に見えないように）
 */
export function leafCrown(c: KCtx, B: Batch, center: THREE.Vector3, R: number, ky: number, cards: number, card: number, tint: THREE.ColorRepresentation): void {
  const r = c.rng
  B.add(new THREE.IcosahedronGeometry(R, 1), c.m.canopy, M(center.x, center.y, center.z, 0, r() * 3, 0, 1, ky, 1), { tint })
  const n = new THREE.Vector3()
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const roll = new THREE.Quaternion()
  for (let j = 0; j < cards; j++) {
    const az = (j / cards) * Math.PI * 2 + r() * 0.8
    const el = -0.2 + r() * 1.1
    n.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az))
    // だ円体の表面の点と、そこでの外向きの法線
    p.set(center.x + n.x * R, center.y + n.y * R * ky, center.z + n.z * R)
    n.set(n.x, n.y / ky, n.z).normalize()
    p.addScaledVector(n, card * 0.12)
    q.setFromUnitVectors(AXIS_Z, n).multiply(roll.setFromAxisAngle(AXIS_Z, r() * Math.PI * 2))
    B.add(new THREE.PlaneGeometry(card, card), c.m.leaf, new THREE.Matrix4().compose(p, q, ONE), { tint: new THREE.Color().setHSL(0.26 + r() * 0.05, 0.4, 0.62 + r() * 0.1), cast: false })
  }
}

/** 大きな木（板根のある熱帯の木。幹・太い枝・葉のかたまりのカード）。s は大きさ */
export function bigTree(c: KCtx, x: number, z: number, s = 1, far = false, y0 = 0): void {
  const r = c.rng
  const B = far ? c.bf : c.b
  const h = 7 * s
  B.add(new THREE.CylinderGeometry(0.42 * s, 0.7 * s, h, 8, 1, true), c.m.bark, M(x, y0 + h / 2, z), { tint: '#8a7a68', cast: !far })
  // 板根（ひだのような根）
  if (!far)
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + r()
      // 幹のそばが高く、外へ行くほど低くなるひれ
      const g = new THREE.BoxGeometry(1.6 * s, 1.3 * s, 0.14 * s, 4, 1, 1)
      g.translate(0.8 * s, 0.65 * s, 0)
      const p = g.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0.5 * s) p.setY(i, 1.3 * s * Math.pow(Math.max(0, 1 - p.getX(i) / (1.6 * s)), 1.5) + 0.05)
      g.computeVertexNormals()
      B.add(g, c.m.bark, M(x, y0, z, 0, -a, 0), { tint: '#7e6e5e' })
    }
  // 枝と葉のかたまり（近くの木はかたまりを小さく・少なく、葉のカードは樹冠の表面にそって外向きに）
  const crowns = far ? 4 : 5
  for (let k = 0; k < crowns; k++) {
    const a = (k / crowns) * Math.PI * 2 + r() * 0.5
    const rr = (far ? 1.8 + r() * 1.6 : 1.2 + r() * 1.0) * s
    const cy = y0 + h * (0.82 + r() * 0.3)
    const p = v(x + Math.cos(a) * rr, cy, z + Math.sin(a) * rr)
    if (!far) strut(c, v(x, y0 + h * 0.65, z), p, 0.16 * s, c.m.bark, '#8a7a68', { r1: 0.08 * s })
    if (far) {
      const size = (2.4 + r() * 1.2) * s
      c.bf.add(new THREE.IcosahedronGeometry(size, 0), c.m.canopy, M(p.x, p.y + size * 0.3, p.z, 0, r() * 3, 0, 1, 0.7, 1), { tint: new THREE.Color().setHSL(0.28 + r() * 0.05, 0.42, 0.17 + r() * 0.06) })
    } else {
      const size = (1.8 + r() * 0.9) * s
      leafCrown(c, c.b, v(p.x, p.y + size * 0.3, p.z), size * 0.82, 0.66, 7, size * 0.45, new THREE.Color().setHSL(0.27 + r() * 0.05, 0.46, 0.18 + r() * 0.06))
    }
  }
  if (!far) collideCylinder(c, x, y0, y0 + 4, z, 0.65 * s)
}

/** かまど（土のかまど・黒いなべ・炭火）。炭火は c.embers に（夜に光る） */
export function hearth(c: KCtx, x: number, z: number, rotY = 0): void {
  cyl(c, x, 0, 0.42, z, 0.55, c.m.clay, { r1: 0.5, tint: KC.clay, seg: 12 })
  box(c, x - Math.sin(rotY) * 0.5, 0.18, z - Math.cos(rotY) * 0.5, 0.36, 0.3, 0.12, c.m.plain, { tint: '#2a1a10', rotY, cast: false })
  c.b.add(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), c.m.plain, M(x, 0.62, z, Math.PI, 0, 0), { tint: '#2a2622' })
  c.b.add(new THREE.TorusGeometry(0.42, 0.03, 5, 16), c.m.plain, M(x, 0.62, z, Math.PI / 2, 0, 0), { tint: '#3a3430', cast: false })
  c.embers.push(v(x - Math.sin(rotY) * 0.5, 0.2, z - Math.cos(rotY) * 0.5))
  // まき
  for (let k = 0; k < 3; k++) strut(c, v(x - Math.sin(rotY) * (0.6 + k * 0.05), 0.08, z - Math.cos(rotY) * 0.6 + (k - 1) * 0.12), v(x - Math.sin(rotY) * 1.3, 0.05, z - Math.cos(rotY) * 1.25 + (k - 1) * 0.2), 0.05, c.m.wood, KC.woodDark, { cast: false })
  c.col.box(x, 0.3, z, 1.1, 0.6, 1.1)
  c.lights.push({ pos: v(x, 0.9, z), color: '#ff9a4a', intensity: 0.0, dist: 6 })
}

/** かご（編んだ円いかご）。lid で丸いふた */
export function basket(c: KCtx, x: number, y: number, z: number, s = 1, tint: string = KC.basket, lid = false): void {
  c.b.add(new THREE.CylinderGeometry(0.32 * s, 0.24 * s, 0.42 * s, 10, 1, !lid), c.m.weave, M(x, y + 0.21 * s, z), { tint, texM: 0.4 })
  c.b.add(new THREE.TorusGeometry(0.32 * s, 0.03 * s, 4, 12), c.m.wood, M(x, y + 0.42 * s, z, Math.PI / 2, 0, 0), { tint: shade(tint, 0.8), cast: false })
  if (lid) c.b.add(new THREE.SphereGeometry(0.32 * s, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), c.m.weave, M(x, y + 0.42 * s, z, 0, 0, 0, 1, 0.5, 1), { tint, texM: 0.4 })
}

/** つぼ（水がめ） */
export function jar(c: KCtx, x: number, y: number, z: number, s = 1, tint: string = KC.clay): void {
  const pts = [v(0, 0, 0), v(0.22, 0.02, 0), v(0.34, 0.25, 0), v(0.3, 0.5, 0), v(0.16, 0.66, 0), v(0.18, 0.74, 0), v(0.15, 0.76, 0)].map((p) => new THREE.Vector2(p.x * s, p.y * s))
  c.b.add(new THREE.LatheGeometry(pts, 10), c.m.clay, M(x, y, z), { tint })
}

/** 木の舟（細長い丸木舟）。y は水面（または地面） */
export function boat(c: KCtx, x: number, y: number, z: number, rotY: number, len = 5, tint: string = KC.wood): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.5, 0.5, len, 12, 6, false, Math.PI * 0.5, Math.PI)
  // 両端を細くする
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / (len / 2)
    const k = Math.sqrt(Math.max(0, 1 - t * t * t * t)) * 0.92 + 0.08
    p.setX(i, p.getX(i) * k)
    p.setZ(i, p.getZ(i) * (0.55 + 0.45 * k))
    // 両端は少し持ち上がる
    p.setZ(i, p.getZ(i) - Math.pow(Math.abs(t), 3) * 0.25)
  }
  g.computeVertexNormals()
  g.rotateZ(Math.PI / 2)
  g.rotateX(-Math.PI / 2)
  // 中を見せるため、上は開けたまま（半円柱）。g は x 方向に長い
  c.b.add(g, c.m.wood, M(x, y + 0.42, z, 0, rotY, 0, 1, 0.8, 1.15), { tint, texM: 1 })
  // 横板
  for (const t of [-0.25, 0.25])
    box(c, x + Math.cos(rotY) * len * t, y + 0.36, z - Math.sin(rotY) * len * t, 0.1, 0.05, 0.85, c.m.wood, { rotY, tint: shade(tint, 1.15), cast: false })
  return g
}

/** はすの葉と花（水面）。cx, cz を中心に半径 r に n 枚 */
export function lotusPatch(c: KCtx, cx: number, cz: number, r: number, n: number, y: number): void {
  const rng = c.rng
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2
    const d = Math.sqrt(rng()) * r
    const x = cx + Math.cos(a) * d
    const z = cz + Math.sin(a) * d
    const s = 0.35 + rng() * 0.4
    // 切れこみのある円い葉
    const leaf = new THREE.CircleGeometry(s, 10, 0.25, Math.PI * 2 - 0.25)
    leaf.rotateX(-Math.PI / 2)
    c.b.add(leaf, c.m.plain, M(x, y + 0.03, z, 0, rng() * 6, 0), { tint: new THREE.Color().setHSL(0.3 + rng() * 0.04, 0.5, 0.3 + rng() * 0.08), cast: false })
    if (rng() < 0.18) {
      // 花（ピンクのつぼみ）
      c.b.add(new THREE.ConeGeometry(0.12, 0.3, 6), c.m.plain, M(x + 0.2, y + 0.3, z), { tint: KC.lotus, cast: false })
      c.b.add(new THREE.SphereGeometry(0.13, 6, 5), c.m.plain, M(x + 0.2, y + 0.17, z, 0, 0, 0, 1, 0.6, 1), { tint: '#f6b2c8', cast: false })
    }
  }
}

/** 松明の柱（夜に火がともる）。火は c.torches へ（fxKhmer.Torches でまとめる）。光の候補も足す */
export function torchPost(c: KCtx, x: number, y: number, z: number, h = 1.7): void {
  cyl(c, x, y, y + h, z, 0.05, c.m.wood, { tint: KC.woodDark, seg: 5, r1: 0.04, cast: false })
  c.b.add(new THREE.CylinderGeometry(0.11, 0.07, 0.3, 6, 1, true), c.m.weave, M(x, y + h + 0.1, z), { tint: '#6a4a28', cast: false })
  c.torches.push(v(x, y + h + 0.32, z))
  c.lights.push({ pos: v(x, y + h + 0.5, z), color: '#ffa04a', intensity: 0, dist: 8 })
  c.col.box(x, y + h / 2, z, 0.2, h, 0.2)
}
