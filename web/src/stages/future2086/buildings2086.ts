// 2086年の建物と遠景：広場を囲むビル（白いパネル・ガラスの帯・屋上の緑・つる草・店先のネオン）、
// 北へ延びる通り、遠くのビル群（オルムで溶ける）、リングをまとった中央タワー、EXPO 2086 のホロの地球儀、
// 浮島（滝と白いパビリオン）、空飛ぶ車、大阪城の丘、山並み。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { mulberry32, pick, range, type Rng } from '../../render/noise'
import { uTime } from '../../render/materials'
import { castle } from '../../world/edo/backdrop'
import { Foliage } from '../../world/edo/nature'
import { createFallMaterial, fallSheet } from '../../world/edo/water'
import { ColliderList } from '../../world/colliders'
import { F } from './layout'
import { NEON, fbox, neon, vine, type FCtx } from './kit2086'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type Facing = 'n' | 's' | 'e' | 'w'

const FACE_ROT: Record<Facing, number> = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }

export type BuildingOpts = {
  /** 足元の範囲 */
  x0: number
  x1: number
  z0: number
  z1: number
  h: number
  front: Facing
  /** 1 階の店先の色（ネオンの帯） */
  accent?: THREE.Color
  /** 屋上の緑 */
  garden?: boolean
  /** 前面のつる草 */
  vines?: boolean
  /** 1 階の店先（ガラス＋ひさし）。空中回廊の下などは false */
  shop?: boolean
  /** 当たり判定 */
  collider?: boolean
  far?: boolean
  seed?: number
}

/**
 * 広場まわりのビル：ガラスの芯に、階ごとに少し張り出した白い床板（角は丸い）。
 * 前面の角に光る縦のひれ、1 階は店先（ガラス・ひさし・ネオン）、屋上は手すりと植え込み。
 */
export function building(c: FCtx, o: BuildingOpts): void {
  const rng = mulberry32(o.seed ?? Math.round(o.x0 * 13 + o.z0 * 7 + o.h))
  const far = !!o.far
  const b = far ? c.bf : c.b
  const glassM = far ? c.fm.farGlass : c.fm.glass
  const panelM = far ? c.fm.farPanel : c.fm.panel
  const w = o.x1 - o.x0
  const d = o.z1 - o.z0
  const cx = (o.x0 + o.x1) / 2
  const cz = (o.z0 + o.z1) / 2
  const rot = FACE_ROT[o.front]
  // 正面の向きに合わせたローカル寸法（幅＝正面に沿う長さ、奥行き）
  const along = o.front === 'n' || o.front === 's' ? w : d
  const depth = o.front === 'n' || o.front === 's' ? d : w
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  /** ローカル（x=正面に沿う、z=正面側が +）→ ワールド */
  const W = (lx: number, lz: number) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs] as const
  // 建物ごとに少しだけ色を変える（クリーム・水色・ミント・桃・藤）
  const tintPanel = new THREE.Color(pick(rng, ['#fff6e8', '#eaf3ff', '#eefaf1', '#ffeee6', '#f2eeff', '#ffffff', '#fff2dc'])).multiplyScalar(range(rng, 0.94, 1.0))
  const tintGlass = new THREE.Color(pick(rng, ['#ffffff', '#cfe6ff', '#d6f1ea', '#e2d9ff', '#ffe9d6']))
  const shopH = o.shop === false ? 0 : 4.0
  // ガラスの芯
  const coreH = o.h - shopH
  /** 遠景は角を丸めない（三角形を減らす） */
  const rr = (r: number) => (far ? 0 : r)
  b.add(rbox(along - 0.5, coreH, depth - 0.5, rr(0.25)), glassM, M(...xyz(W(0, 0), shopH + coreH / 2), 0, rot, 0), { texM: 8, cast: !far, tint: tintGlass })
  // 床板（3.4m ごと、少し張り出す）
  const slabT = far ? 0.9 : 0.8
  for (let y = shopH; y <= o.h - 0.4; y += 3.4) {
    const top = y + slabT > o.h ? o.h : y + slabT
    b.add(rbox(along + 0.1, top - y, depth + 0.1, rr(0.32)), panelM, M(...xyz(W(0, 0.05), (y + top) / 2), 0, rot, 0), { texM: 2.2, tint: tintPanel, cast: !far })
  }
  // 屋上の縁
  b.add(rbox(along + 0.1, 0.9, depth + 0.1, rr(0.3)), panelM, M(...xyz(W(0, 0.05), o.h + 0.45), 0, rot, 0), { texM: 2.2, tint: tintPanel, cast: !far })
  // 正面の角の縦のひれ（光る帯）
  const accent = o.accent ?? pick(rng, [NEON.cyan, NEON.pink, NEON.warm, NEON.blue])
  for (const sx of [-1, 1]) {
    const [fx, fz] = W(sx * (along / 2 - 0.15), depth / 2 + 0.25)
    fbox(c, panelM, fx, (shopH + o.h) / 2 + 0.3, fz, 0.5, o.h - shopH + 0.6, 0.6, { rotY: rot, r: rr(0.12), tint: tintPanel, far })
    const [gx, gz] = W(sx * (along / 2 - 0.15), depth / 2 + 0.56)
    neon(c, v(gx, shopH + 0.5, gz), v(gx, o.h, gz), 0.06, accent, far)
  }
  // 1 階の店先
  if (shopH > 0) {
    b.add(rbox(along - 0.9, shopH - 0.2, depth - 1.4, 0.1), glassM, M(...xyz(W(0, -0.4), shopH / 2), 0, rot, 0), { texM: 6, cast: false })
    // 店の柱
    const nCol = Math.max(2, Math.round(along / 4.5))
    for (let i = 0; i <= nCol; i++) {
      const lx = -along / 2 + 0.4 + (i / nCol) * (along - 0.8)
      const [px, pz] = W(lx, depth / 2 - 0.55)
      fbox(c, panelM, px, shopH / 2, pz, 0.45, shopH, 0.45, { rotY: rot, r: 0.1, tint: tintPanel, far })
    }
    // ひさし＋ネオンの帯
    const [ax, az] = W(0, depth / 2 + 0.5)
    fbox(c, c.fm.plastic, ax, shopH - 0.35, az, along - 0.4, 0.14, 1.6, { rotY: rot, r: 0.05, far, tint: '#f4f6f8' })
    const [n0x, n0z] = W(-along / 2 + 0.3, depth / 2 + 1.28)
    const [n1x, n1z] = W(along / 2 - 0.3, depth / 2 + 1.28)
    neon(c, v(n0x, shopH - 0.42, n0z), v(n1x, shopH - 0.42, n1z), 0.05, accent, far)
  }
  // 屋上：植え込みと手すり
  if (o.garden ?? true) {
    const n = Math.max(1, Math.round(along / 4))
    for (let i = 0; i < n; i++) {
      const lx = -along / 2 + ((i + 0.5) / n) * along
      const [px, pz] = W(lx, depth / 2 - 1.0)
      if (far) farTree(c, px, o.h + 0.9, pz, range(rng, 1.1, 1.8), rng)
      else {
        fbox(c, c.fm.plastic, px, o.h + 1.15, pz, 2.2, 0.5, 1.2, { rotY: rot, r: 0.08, tint: '#eef2f5' })
        c.foliage.bush(px, o.h + 1.2, pz, range(rng, 0.6, 0.85), Math.round(px * 7 + pz), 0.9)
      }
    }
  }
  // つる草（前面の床板から垂れる）
  if (!far && (o.vines ?? true)) {
    const n = Math.round(along / 2.2)
    for (let i = 0; i < n; i++) {
      if (rng() < 0.45) continue
      const lx = -along / 2 + 0.8 + rng() * (along - 1.6)
      const floor = shopH + 3.4 * Math.floor(rng() * Math.max(1, (o.h - shopH) / 3.4)) + slabT
      if (floor > o.h - 0.5) continue
      const [px, pz] = W(lx, depth / 2 + 0.12)
      vine(c, px, floor, pz, range(rng, 1.0, 2.4), rng)
    }
  }
  if (o.collider ?? !far) c.col.box(cx, o.h / 2, cz, w, o.h, d)
}

function xyz(p: readonly [number, number], y: number): [number, number, number] {
  return [p[0], y, p[1]]
}

/** 遠景の木（葉のカードを使わない軽い形） */
export function farTree(c: FCtx, x: number, y: number, z: number, r: number, rng: Rng): void {
  for (let i = 0; i < 3; i++) {
    c.bf.add(new THREE.IcosahedronGeometry(r * range(rng, 0.6, 0.85), 0), c.m.puffGreen, M(x + range(rng, -0.4, 0.4) * r, y + r * (0.6 + i * 0.32), z + range(rng, -0.4, 0.4) * r, rng(), rng(), 0), {
      tint: new THREE.Color(range(rng, 0.75, 1.0), range(rng, 0.85, 1.05), range(rng, 0.7, 0.9)),
      cast: false,
    })
  }
}

// ------------------------------------------------------------------ 広場を囲む街

export function buildDistrict(c: FCtx): void {
  const P = F.PLAZA
  // 西（空中回廊が 2 階に取り付く。1 階は回廊の陰の店先）
  building(c, { x0: -28, x1: P.x0 - 0.2, z0: -12, z1: 21, h: 15.2, front: 'e', accent: NEON.cyan, seed: 11 })
  building(c, { x0: -28, x1: P.x0 - 0.2, z0: -27, z1: -12.4, h: 18.8, front: 'e', accent: NEON.pink, seed: 12 })
  // 北西・北東（低い：奥の大阪城・中央タワー・浮島・夜のオルムが見えるように）
  building(c, { x0: -28, x1: F.STREET.x0, z0: -32, z1: P.z0 - 0.2, h: 8.2, front: 's', accent: NEON.warm, seed: 13 })
  building(c, { x0: F.STREET.x1, x1: 28, z0: -32, z1: P.z0 - 0.2, h: 8.0, front: 's', accent: NEON.blue, seed: 14 })
  // 東（屋台の奥）
  building(c, { x0: P.x1 + 0.2, x1: 28, z0: -19.5, z1: 4, h: 16.4, front: 'w', accent: NEON.pink, seed: 15 })
  building(c, { x0: P.x1 + 0.2, x1: 28, z0: 4.4, z1: 21, h: 12.6, front: 'w', accent: NEON.warm, seed: 16 })
  // 南（入口の両側）
  building(c, { x0: -28, x1: F.SOUTH_GATE.x0 - 0.5, z0: P.z1 + 0.2, z1: 31, h: 13, front: 'n', accent: NEON.blue, seed: 17 })
  building(c, { x0: F.SOUTH_GATE.x1 + 0.5, x1: 28, z0: P.z1 + 0.2, z1: 31, h: 14.5, front: 'n', accent: NEON.cyan, seed: 18 })
  // 北へ延びる通りの両側（手前は低く、奥ほど高い）
  const S = F.STREET
  let z = -32.5
  let i = 0
  while (z > S.z0) {
    const len = 9 + (i % 3) * 2.5
    const h = 9 + Math.min(26, (-z - 32) * 0.55) + (i % 2) * 3
    // 西側は低い町家風の商店（奥の大阪城の丘が見えるように）、東側は高いビル
    const hl = 7.6 + (i % 2) * 1.8 + Math.min(4, (-z - 32) * 0.08)
    building(c, { x0: -20, x1: S.x0 - 0.3, z0: z - len, z1: z, h: hl, front: 'e', seed: 30 + i, far: z < -50, garden: true })
    building(c, { x0: S.x1 + 0.3, x1: 20, z0: z - len - 1.5, z1: z - 1.5, h: h + 2, front: 'w', seed: 50 + i, far: z < -50, garden: true })
    z -= len + 0.6
    i++
  }
  // 通りの並木と、通りの上の電球の連なり
  for (let zz = -24; zz > -64; zz -= 7) {
    for (const x of [S.x0 + 0.9, S.x1 - 0.9]) {
      if (zz > -40) c.foliage.bush(x, 0, zz, 0.9, Math.round(zz * 3 + x), 1.6)
      else farTree(c, x, 0, zz, 1.0, mulberry32(Math.round(-zz * 10 + x)))
    }
  }
  // 地面：広場の外の舗装（通り）と遠景の地面
  c.b.add(new THREE.PlaneGeometry(S.x1 - S.x0 + 28, S.z1 - S.z0 + 6), c.fm.paving, M(0, -0.01, (S.z0 + S.z1) / 2 - 3, -Math.PI / 2, 0, 0), {
    uv: 'scale',
    uvScale: [(S.x1 - S.x0 + 28) / 2, (S.z1 - S.z0 + 6) / 2],
    tint: '#e9e4da',
  })
  c.bf.add(new THREE.PlaneGeometry(1800, 1800), c.fm.farPlain, M(0, -0.08, 0, -Math.PI / 2, 0, 0), { tint: '#bdb6a6', cast: false })
}

// ------------------------------------------------------------------ 遠景のビル群

/** 遠景の塔（形はいくつかの型から） */
function farTowerShape(c: FCtx, x: number, z: number, w: number, h: number, rng: Rng): void {
  const kind = rng()
  const glow = pick(rng, [NEON.cyan, NEON.pink, NEON.blue, NEON.warm, NEON.white])
  if (kind < 0.38) {
    // 角の丸い四角い塔（床板の帯）
    building(c, { x0: x - w / 2, x1: x + w / 2, z0: z - w / 2, z1: z + w / 2, h, front: pick(rng, ['n', 's', 'e', 'w'] as const), far: true, shop: false, garden: rng() < 0.6, seed: Math.round(x * 3 + z) })
  } else if (kind < 0.7) {
    // 円筒の塔：ガラスの芯＋輪のバルコニー
    const r = w / 2
    c.bf.add(new THREE.CylinderGeometry(r * 0.92, r, h, 20), c.fm.farGlass, M(x, h / 2, z), { texM: 8, uv: 'scale', uvScale: [(Math.PI * 2 * r) / 8, h / 8], cast: false })
    for (let y = 4; y < h; y += 4.2) c.bf.add(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.7, 20), c.fm.farPanel, M(x, y, z), { uv: 'scale', uvScale: [r, 0.3], cast: false })
    c.bf.add(new THREE.CylinderGeometry(r * 0.5, r * 1.02, 3, 20), c.fm.farPanel, M(x, h + 1.5, z), { uv: 'scale', uvScale: [r, 1], cast: false })
    neon(c, v(x, h + 3, z), v(x, h + 3 + range(rng, 4, 14), z), 0.25, glow, true)
    // 輪の光
    c.bf.add(new THREE.TorusGeometry(r * 1.07, 0.12, 6, 28), c.fm.farGlow, M(x, h * range(rng, 0.45, 0.8), z, Math.PI / 2, 0, 0), { tint: glow, cast: false, receive: false })
  } else {
    // 段々の塔（上ほど細く、段ごとに緑の屋上）
    let y = 0
    let ww = w
    const tiers = 2 + Math.floor(rng() * 3)
    for (let t = 0; t < tiers; t++) {
      const th = (h / tiers) * range(rng, 0.85, 1.15)
      farBlock(c, x, y, z, ww, th, rng)
      for (let k = 0; k < 2; k++) farTree(c, x + range(rng, -0.4, 0.4) * ww, y + th + 0.5, z + range(rng, -0.4, 0.4) * ww, range(rng, 0.9, 1.5), rng)
      y += th
      ww *= 0.7
    }
    neon(c, v(x, y, z), v(x, y + range(rng, 3, 9), z), 0.2, glow, true)
  }
}

/** 遠景の箱形の段（ガラス＋床板＋屋上の縁）。y0 は底の高さ */
function farBlock(c: FCtx, x: number, y0: number, z: number, w: number, h: number, rng: Rng): void {
  c.bf.add(rbox(w - 0.5, h, w - 0.5, 0), c.fm.farGlass, M(x, y0 + h / 2, z, 0, rng() * 0.2, 0), { texM: 8, cast: false })
  for (let y = 3; y < h - 0.5; y += 3.6) c.bf.add(rbox(w, 0.8, w, 0), c.fm.farPanel, M(x, y0 + y, z), { texM: 3, cast: false })
  c.bf.add(rbox(w + 0.1, 0.9, w + 0.1, 0), c.fm.farPanel, M(x, y0 + h + 0.45, z), { texM: 3, cast: false })
}

export function buildFarCity(c: FCtx): void {
  const rng = mulberry32(2086)
  const castleAz = Math.atan2(F.CASTLE.x, -F.CASTLE.z)
  const tower = new THREE.Vector2(F.TOWER.x, F.TOWER.z)
  let placed = 0
  for (let i = 0; i < 420 && placed < 120; i++) {
    const r = 60 + Math.pow(rng(), 0.8) * 300
    const az = range(rng, -Math.PI, Math.PI)
    const x = Math.sin(az) * r
    const z = -Math.cos(az) * r
    // 広場・通りの近くは置かない
    if (Math.abs(x) < 34 && z > -75 && z < 40) continue
    if (Math.abs(x) < 9 && z < -70 && z > -160) continue
    // 大阪城の丘のまわりは空ける
    if (Math.abs(az - castleAz) < 0.36 && r > 50) continue
    // 中央タワーの足元
    if (tower.distanceTo(new THREE.Vector2(x, z)) < 34) continue
    const southish = z > 0
    const h = southish ? range(rng, 14, 40) : range(rng, 18, 60) + (r > 180 ? range(rng, 0, 50) : 0)
    farTowerShape(c, x, z, range(rng, 8, 16), h, rng)
    placed++
  }
}

// ------------------------------------------------------------------ 中央タワー（リング付き）

export type TowerParts = { rings: THREE.Group; beacon: THREE.Mesh }

export function buildCentralTower(c: FCtx, root: THREE.Group): TowerParts {
  const { x, z, h } = F.TOWER
  // 芯：下が太く上が細い（白い外装＋ガラスの帯）
  const prof: THREE.Vector2[] = [
    new THREE.Vector2(0.01, 0),
    new THREE.Vector2(19, 0),
    new THREE.Vector2(14, 18),
    new THREE.Vector2(10.5, 60),
    new THREE.Vector2(8.5, 110),
    new THREE.Vector2(7, h - 12),
    new THREE.Vector2(9.5, h - 6),
    new THREE.Vector2(4, h),
    new THREE.Vector2(0.01, h),
  ]
  c.bf.add(new THREE.LatheGeometry(prof, 32), c.fm.farGlass, M(x, 0, z), { uv: 'scale', uvScale: [8, h / 8], cast: false })
  // 縦の白い骨（4 本）
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2
    const pts = prof.slice(1, 6).map((p) => v(x + Math.cos(a) * (p.x + 0.6), p.y, z + Math.sin(a) * (p.x + 0.6)))
    for (let i = 0; i < pts.length - 1; i++) {
      const len = pts[i].distanceTo(pts[i + 1])
      const q = new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), pts[i + 1].clone().sub(pts[i]).normalize())
      const m = new THREE.Matrix4().compose(pts[i].clone().add(pts[i + 1]).multiplyScalar(0.5), q, v(1, 1, 1))
      c.bf.add(new THREE.BoxGeometry(1.6, len, 1.6), c.fm.farPanel, m, { texM: 4, cast: false })
    }
  }
  // 展望の円盤と床の輪
  for (const [yy, rr] of [
    [18, 15],
    [60, 11.5],
    [110, 9.5],
    [h - 9, 12],
  ] as const) {
    c.bf.add(new THREE.CylinderGeometry(rr + 1.5, rr, 2.2, 32), c.fm.farPanel, M(x, yy, z), { uv: 'scale', uvScale: [8, 1], cast: false })
    c.bf.add(new THREE.TorusGeometry(rr + 1.55, 0.25, 6, 40), c.fm.farGlow, M(x, yy + 0.4, z, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false, receive: false })
  }
  // 尖塔
  c.bf.add(new THREE.CylinderGeometry(0.4, 1.8, 30, 10), c.fm.farPanel, M(x, h + 15, z), { uv: 'scale', uvScale: [1, 4], cast: false })
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 1.2), fog: false }))
  beacon.position.set(x, h + 31, z)
  root.add(beacon)
  // 回るリング（光の輪を 3 重。少し傾けて点の帯を付ける）
  const rings = new THREE.Group()
  rings.position.set(x, 0, z)
  const rg: THREE.BufferGeometry[] = []
  const ringMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })
  const col = (g: THREE.BufferGeometry, cc: THREE.Color) => {
    const n = g.attributes.position.count
    const a = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      a[i * 3] = cc.r
      a[i * 3 + 1] = cc.g
      a[i * 3 + 2] = cc.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3))
    return g
  }
  for (const [yy, rr, tilt, cc] of [
    [72, 36, 0.12, new THREE.Color(1.6, 0.9, 2.4)],
    [100, 29, -0.1, new THREE.Color(0.6, 1.8, 2.6)],
    [126, 22, 0.08, new THREE.Color(2.4, 1.0, 1.8)],
  ] as const) {
    const t = new THREE.TorusGeometry(rr, 0.55, 8, 96)
    t.rotateX(Math.PI / 2 + tilt)
    t.translate(0, yy, 0)
    rg.push(col(t, cc))
    // 点の帯（回転が見えるように）
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2
      const s = new THREE.SphereGeometry(1.1, 6, 4)
      const p = v(Math.cos(a) * rr, 0, Math.sin(a) * rr).applyAxisAngle(v(1, 0, 0), tilt)
      s.translate(p.x, yy + p.y, p.z)
      s.deleteAttribute('uv')
      rg.push(col(s, new THREE.Color(cc.r * 1.6, cc.g * 1.6, cc.b * 1.6)))
    }
  }
  for (const g of rg) if (g.attributes.uv) g.deleteAttribute('uv')
  const merged = mergeAll(rg)
  const ringMesh = new THREE.Mesh(merged, ringMat)
  ringMesh.frustumCulled = false
  rings.add(ringMesh)
  root.add(rings)
  c.updaters.push((dt) => {
    rings.rotation.y += dt * 0.05
  })
  return { rings, beacon }
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const prepared = list.map((g) => (g.index ? g.toNonIndexed() : g))
  // 属性をそろえる
  for (const g of prepared) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k)
  let total = 0
  for (const g of prepared) total += g.attributes.position.count
  const pos = new Float32Array(total * 3)
  const nor = new Float32Array(total * 3)
  const col = new Float32Array(total * 3)
  let o = 0
  for (const g of prepared) {
    pos.set(g.attributes.position.array as Float32Array, o * 3)
    nor.set(g.attributes.normal.array as Float32Array, o * 3)
    col.set(g.attributes.color.array as Float32Array, o * 3)
    o += g.attributes.position.count
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  out.setAttribute('color', new THREE.BufferAttribute(col, 3))
  out.computeBoundingSphere()
  return out
}

// ------------------------------------------------------------------ EXPO 2086 のホロの地球儀

const globeVert = /* glsl */ `
varying vec3 vN;
varying vec3 vP;
varying vec2 vUv;
varying vec3 vView;
void main() {
  vUv = uv;
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = -mv.xyz;
  vP = position;
  gl_Position = projectionMatrix * mv;
}
`
const globeFrag = /* glsl */ `
uniform float uTime;
uniform sampler2D map;
uniform vec4 uRect;
uniform float uIntensity;
varying vec3 vN;
varying vec3 vP;
varying vec2 vUv;
varying vec3 vView;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
  vec2 g = vec2(vUv.x * 24.0 + uTime * 0.2, vUv.y * 12.0);
  vec2 f = abs(fract(g) - 0.5);
  float grid = smoothstep(0.46, 0.5, max(f.x, f.y));
  // 正面の紋
  vec2 e = vec2(fract(vUv.x * 2.0 + uTime * 0.02), vUv.y);
  vec2 eu = (e - vec2(0.5, 0.5)) * vec2(2.2, 1.6) + 0.5;
  vec4 em = vec4(0.0);
  if (eu.x > 0.0 && eu.x < 1.0 && eu.y > 0.0 && eu.y < 1.0) em = texture2D(map, mix(uRect.xy, uRect.zw, eu));
  vec3 col = vec3(0.35, 0.85, 1.6) * (grid * 0.9 + fres * 1.2) + em.rgb * em.a * 1.8;
  float a = clamp(grid * 0.55 + fres * 0.8 + em.a * 0.9, 0.0, 1.0);
  gl_FragColor = vec4(col * uIntensity, a);
}
`

export function buildExpoGlobe(c: FCtx, root: THREE.Group): THREE.Mesh {
  const pos = v(46, 40, -105)
  // 台座のビル
  building(c, { x0: pos.x - 9, x1: pos.x + 9, z0: pos.z - 9, z1: pos.z + 9, h: pos.y - 9, front: 's', far: true, shop: false, garden: false, seed: 7 })
  c.bf.add(new THREE.CylinderGeometry(5, 7.5, 2.5, 24), c.fm.farPanel, M(pos.x, pos.y - 8, pos.z), { uv: 'scale', uvScale: [4, 1], cast: false })
  c.bf.add(new THREE.TorusGeometry(7.6, 0.25, 6, 36), c.fm.farGlow, M(pos.x, pos.y - 7, pos.z, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false })
  const r = c.fm.atlases.holo.get('emblem')
  const mat = new THREE.ShaderMaterial({
    vertexShader: globeVert,
    fragmentShader: globeFrag,
    uniforms: { uTime, map: { value: (c.fm.holo.uniforms.map as { value: THREE.Texture }).value }, uRect: { value: new THREE.Vector4(r.u0, r.v0, r.u1, r.v1) }, uIntensity: { value: 1.6 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const globe = new THREE.Mesh(new THREE.SphereGeometry(7.5, 40, 24), mat)
  globe.position.copy(pos)
  globe.renderOrder = 2
  root.add(globe)
  c.updaters.push((dt) => {
    globe.rotation.y += dt * 0.15
  })
  return globe
}

// ------------------------------------------------------------------ 浮島

function floatIsland(c: FCtx, root: THREE.Group, x: number, y: number, z: number, r: number, seed: number, f: Foliage): void {
  const rng = mulberry32(seed)
  const rock = new THREE.ConeGeometry(r, r * 1.6, 12, 6)
  rock.rotateX(Math.PI)
  rock.translate(0, -r * 0.8, 0)
  const p = rock.attributes.position
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i)
    const vy = p.getY(i)
    const vz = p.getZ(i)
    const n = Math.sin(vx * 0.7 + seed) * Math.cos(vz * 0.6 + vy * 0.4) * 0.5
    p.setXYZ(i, vx * (1 + n * 0.35), vy + n * r * 0.18, vz * (1 + n * 0.35))
  }
  rock.computeVertexNormals()
  c.bf.add(rock, c.m.rock, M(x, y, z, 0, range(rng, 0, 6), 0), { uv: 'scale', uvScale: [3, 3], tint: '#eadcc8', cast: false })
  c.bf.add(new THREE.CylinderGeometry(r * 1.02, r * 0.94, r * 0.16, 16), c.m.grass, M(x, y + r * 0.02, z), { tint: '#cfe58e', uv: 'scale', uvScale: [3, 0.3], cast: false })
  for (let i = 0; i < Math.round(r * 0.9); i++) {
    const a = range(rng, 0, Math.PI * 2)
    const rr = range(rng, 0.25, 0.8) * r
    if (rng() < 0.45) f.cherry(x + Math.cos(a) * rr, y + r * 0.09, z + Math.sin(a) * rr, range(rng, 0.7, 1.0) * (r / 6), seed * 10 + i, 0.5)
    else farTree(c, x + Math.cos(a) * rr, y + r * 0.08, z + Math.sin(a) * rr, range(rng, 0.8, 1.2) * (r / 7), rng)
  }
  // 白いパビリオン（ドーム＋光る輪）
  c.bf.add(new THREE.SphereGeometry(r * 0.22, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), c.fm.farPanel, M(x - r * 0.2, y + r * 0.1, z + r * 0.1), { uv: 'scale', uvScale: [2, 1], cast: false })
  c.bf.add(new THREE.TorusGeometry(r * 0.225, r * 0.012, 6, 24), c.fm.farGlow, M(x - r * 0.2, y + r * 0.12, z + r * 0.1, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false })
  // 端から落ちる細い滝
  const fall = new THREE.Mesh(fallSheet(new THREE.Vector3(x + r * 0.93, y + r * 0.05, z), 0, r * 0.16, r * 2.4, r * 0.25, 10, 3), createFallMaterial(seed * 0.1, 0.8, 0.6))
  fall.castShadow = false
  root.add(fall)
}

export function buildSky(c: FCtx, root: THREE.Group, f: Foliage): void {
  floatIsland(c, root, -70, 58, -165, 11, 3, f)
  floatIsland(c, root, 64, 74, -190, 13, 5, f)
  floatIsland(c, root, -150, 82, -110, 9, 7, f)
  floatIsland(c, root, 115, 48, -95, 7, 9, f)
  floatIsland(c, root, 20, 96, -300, 10, 11, f)
  // 大阪城の丘（江戸の城をそのまま遠景に）
  const cc: FCtx = { ...c, b: c.bf, col: new ColliderList() }
  castle(cc, F.CASTLE.x, F.CASTLE.y, F.CASTLE.z, f)
}

// ------------------------------------------------------------------ 空飛ぶ車

export type Traffic = { update(dt: number): void; group: THREE.Group }

export function buildTraffic(root: THREE.Group): Traffic {
  const N = 16
  const group = new THREE.Group()
  group.name = 'traffic'
  const bodyGeo = rbox(3.4, 1.0, 1.6, 0.45, 2)
  const canopyGeo = new THREE.SphereGeometry(0.8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)
  canopyGeo.scale(1.4, 0.7, 0.85)
  canopyGeo.translate(0.3, 0.45, 0)
  const lightGeo = new THREE.BoxGeometry(0.15, 0.18, 1.3)
  lightGeo.translate(-1.72, 0, 0)
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#f4f6f9', roughness: 0.3, metalness: 0.3 })
  const canopyMat = new THREE.MeshStandardMaterial({ color: '#21385a', roughness: 0.08, metalness: 0.6, envMapIntensity: 1.5 })
  const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.6, 1.2) })
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, N)
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, N)
  const lights = new THREE.InstancedMesh(lightGeo, lightMat, N)
  for (const m of [bodies, canopies, lights]) {
    m.frustumCulled = false
    m.castShadow = false
    group.add(m)
  }
  const rng = mulberry32(77)
  const paths = Array.from({ length: N }, (_, i) => ({
    cx: range(rng, -60, 70),
    cz: range(rng, -260, -90),
    rx: range(rng, 50, 130),
    rz: range(rng, 30, 70),
    y: range(rng, 26, 70),
    speed: range(rng, 0.05, 0.11) * (i % 2 ? 1 : -1),
    phase: range(rng, 0, Math.PI * 2),
    tint: new THREE.Color(pick(rng, ['#ffffff', '#ffe9d6', '#dfeeff', '#ffd6e6'])),
  }))
  for (let i = 0; i < N; i++) bodies.setColorAt(i, paths[i].tint)
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  const one = new THREE.Vector3(1, 1, 1)
  const update = (dt: number) => {
    void dt
    const t = uTime.value
    for (let i = 0; i < N; i++) {
      const pa = paths[i]
      const a = pa.phase + t * pa.speed
      p.set(pa.cx + Math.cos(a) * pa.rx, pa.y + Math.sin(a * 3) * 1.5, pa.cz + Math.sin(a) * pa.rz)
      // 進行方向
      const dx = -Math.sin(a) * pa.rx * Math.sign(pa.speed)
      const dz = Math.cos(a) * pa.rz * Math.sign(pa.speed)
      q.setFromAxisAngle(v(0, 1, 0), Math.atan2(-dz, dx))
      m.compose(p, q, one)
      bodies.setMatrixAt(i, m)
      canopies.setMatrixAt(i, m)
      lights.setMatrixAt(i, m)
    }
    bodies.instanceMatrix.needsUpdate = true
    canopies.instanceMatrix.needsUpdate = true
    lights.instanceMatrix.needsUpdate = true
  }
  update(0)
  root.add(group)
  return { update, group }
}
