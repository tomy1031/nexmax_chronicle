// 2086年の「白い段々の曲面建築」（背景コンセプト案A：assets_src/reference/bg2086/nx_bg2086_A_utopia.png）。
// 階ごとに張り出したパールホワイトの床板（前の縁が波打つ）、引っ込んだガラスの帯、ガラスの手すりと光る笠木、
// テラスの植え込みと垂れるつる草、屋上庭園。広場に面する側だけ細かく作り、遠景は軽くする。
// 当たり判定は足元の箱だけ（張り出しは頭より上なので判定はいらない）。
import * as THREE from 'three'
import { M } from '../../render/batch'
import { mulberry32, range, type Rng } from '../../render/noise'
import { createFallMaterial, fallSheet } from '../../world/edo/water'
import { NEON, vine, type FCtx } from './kit2086'
import { ROUNDED, drawSakura, fitText } from './textures2086'

export type TerraceFacing = 'n' | 's' | 'e' | 'w'

const FACE_ROT: Record<TerraceFacing, number> = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 }

export type TerraceOpts = {
  /** 足元の範囲（ワールド） */
  x0: number
  x1: number
  z0: number
  z1: number
  /** 屋上の高さ */
  h: number
  front: TerraceFacing
  /** 最初の床板の高さ（既定 4.4） */
  first?: number
  /** 階の高さ（既定 4.2） */
  floor?: number
  /** 上の階の張り出しの平均（m、足元の正面の線から） */
  over?: number
  /** 前の縁の波の振れ幅 */
  amp?: number
  /** 正面の幅あたりの波の数 */
  waves?: number
  /** 階ごとに後ろへ下がる量（段々の山の形） */
  recess?: number
  /** この高さより下の床板は張り出さない（空中回廊の下・屋台の上など） */
  noOverBelow?: number
  /** 光る縁の色 */
  accent?: THREE.Color
  /** 1 階の店先 */
  shop?: boolean
  /** テラスの植え込み・つる草（'light' はつる草と屋上だけ。三角形を減らす） */
  green?: boolean | 'light'
  far?: boolean
  collider?: boolean
  seed?: number
}

/** 正面の縁（ローカル：x＝正面に沿う、z＝正面が +）の形を決める値 */
type Edge = { over: number; amp: number; phase: number }

type TerraceMats = { pearl: THREE.MeshStandardMaterial; rail: THREE.MeshStandardMaterial; soffit: THREE.MeshStandardMaterial; curtain: THREE.MeshStandardMaterial }
let pearlCache: WeakMap<object, TerraceMats> | null = null

/** カーテンウォール（1 階分の高さで 1 枚）：明るい水色の空の映り込み、細い白い方立て、上の欄間。夜は所々の窓が灯る */
function paintCurtain(): { color: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const S = 512
  const mk = () => {
    const cv = document.createElement('canvas')
    cv.width = cv.height = S
    return cv
  }
  const cv = mk()
  const em = mk()
  const c = cv.getContext('2d')!
  const e = em.getContext('2d')!
  const rng = mulberry32(886)
  const g = c.createLinearGradient(0, 0, 0, S)
  g.addColorStop(0, '#e4f4ff')
  g.addColorStop(0.55, '#a9d3f2')
  g.addColorStop(1, '#7fb4e0')
  c.fillStyle = g
  c.fillRect(0, 0, S, S)
  e.fillStyle = '#000'
  e.fillRect(0, 0, S, S)
  const cols = 4
  const cw = S / cols
  for (let i = 0; i < cols; i++) {
    const x = i * cw
    // 空と雲の映り込み（斜めの明るい帯を 1〜2 本）
    for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) {
      const o = rng() * cw
      c.fillStyle = `rgba(255,255,255,${0.12 + rng() * 0.22})`
      c.beginPath()
      c.moveTo(x + o, S)
      c.lineTo(x + o + cw * 0.35, 0)
      c.lineTo(x + o + cw * 0.55, 0)
      c.lineTo(x + o + cw * 0.2, S)
      c.fill()
    }
    // 室内の灯り（夜）：暖色が多め
    if (rng() < 0.55) {
      e.fillStyle = rng() < 0.75 ? `rgb(255,${196 + Math.floor(rng() * 40)},${130 + Math.floor(rng() * 50)})` : 'rgb(170,225,255)'
      e.fillRect(x + 6, S * 0.24, cw - 12, S * 0.7)
    }
  }
  // 欄間（上 18%）は少しすりガラス
  c.fillStyle = 'rgba(255,255,255,0.28)'
  c.fillRect(0, 0, S, S * 0.18)
  // 方立て（白い細い縦線）と横の桟
  c.fillStyle = '#f4f8fc'
  for (let i = 0; i <= cols; i++) c.fillRect(i * cw - 3, 0, 6, S)
  c.fillRect(0, S * 0.18 - 3, S, 6)
  c.fillRect(0, S - 5, S, 5)
  const color = new THREE.CanvasTexture(cv)
  color.colorSpace = THREE.SRGBColorSpace
  const emissive = new THREE.CanvasTexture(em)
  emissive.colorSpace = THREE.SRGBColorSpace
  for (const t of [color, emissive]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = 8
  }
  return { color, emissive }
}

/** 白いパールの外装・ガラスの手すり・床板の裏（ほんのり暖色） */
export function terraceMaterials(c: FCtx): TerraceMats {
  if (!pearlCache) pearlCache = new WeakMap()
  let m = pearlCache.get(c.fm)
  if (!m) {
    const pearl = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffffff', roughness: 0.3, metalness: 0.05, envMapIntensity: 1.25 })
    pearl.name = 'f2086-pearl'
    const rail = new THREE.MeshStandardMaterial({ color: '#d9f3ff', roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 1.6 })
    rail.name = 'f2086-railGlass'
    const soffit = new THREE.MeshStandardMaterial({ vertexColors: true, color: '#fff7ee', roughness: 0.55, metalness: 0, emissive: new THREE.Color('#ffe9c8'), emissiveIntensity: 0.16 })
    soffit.name = 'f2086-soffit'
    const cw = paintCurtain()
    const curtain = new THREE.MeshStandardMaterial({ map: cw.color, emissiveMap: cw.emissive, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.1, roughness: 0.08, metalness: 0.35, envMapIntensity: 1.4 })
    curtain.name = 'f2086-curtain'
    // 夜の灯りは共通のガラス（fm.glass）の明るさに合わせる
    c.updaters.push(() => {
      curtain.emissiveIntensity = c.fm.glass.emissiveIntensity * 1.2
    })
    m = { pearl, rail, soffit, curtain }
    pearlCache.set(c.fm, m)
  }
  return m
}

/** 縁の輪郭（裏の左 → 左の辺 → 角 → 正面の波 → 角 → 右の辺 → 裏の右）。frontOnly は角と正面だけ */
function outline(along: number, depth: number, waves: number, e: Edge, inset: number, cornerR: number, frontOnly = false): Array<[number, number]> {
  const a = along / 2 - inset
  const back = -depth / 2
  const zf = (lx: number) => depth / 2 + e.over - inset + e.amp * Math.sin(e.phase + (lx / along) * Math.PI * 2 * waves)
  const r = Math.max(0.2, Math.min(cornerR, a * 0.45, (zf(-a) - back) * 0.45))
  const pts: Array<[number, number]> = []
  const zl = zf(-a + r)
  const zr = zf(a - r)
  if (!frontOnly) pts.push([-a, back], [-a, zl - r])
  for (let k = frontOnly ? 0 : 1; k <= 6; k++) {
    const t = Math.PI - (k / 6) * (Math.PI / 2)
    pts.push([-a + r + Math.cos(t) * r, zl - r + Math.sin(t) * r])
  }
  const n = Math.max(2, Math.ceil((2 * a - 2 * r) / 0.8))
  for (let k = 1; k < n; k++) {
    const lx = -a + r + ((2 * a - 2 * r) * k) / n
    pts.push([lx, zf(lx)])
  }
  for (let k = 0; k <= (frontOnly ? 6 : 5); k++) {
    const t = Math.PI / 2 - (k / 6) * (Math.PI / 2)
    pts.push([a - r + Math.cos(t) * r, zr - r + Math.sin(t) * r])
  }
  if (!frontOnly) pts.push([a, zr - r], [a, back])
  return pts
}

/** 床板：輪郭を押し出して、角を丸める。上面が y=0、厚みは下へ */
export function slabGeometry(pts: Array<[number, number]>, thick: number, bevel: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)))
  const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.01, thick - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 3 })
  g.rotateX(Math.PI / 2)
  g.translate(0, -bevel, 0)
  return g
}

/** 輪郭に沿った縦の帯（外向きの面）。u は長さ（m）/uScale、v は高さ（m）/vScale */
export function ribbon(pts: Array<[number, number]>, y0: number, y1: number, uScale = 1, vScale = 1): THREE.BufferGeometry {
  const n = pts.length
  const pos = new Float32Array(n * 2 * 3)
  const nor = new Float32Array(n * 2 * 3)
  const uv = new Float32Array(n * 2 * 2)
  let u = 0
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i]
    if (i > 0) u += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1])
    const p = pts[Math.max(0, i - 1)]
    const q = pts[Math.min(n - 1, i + 1)]
    // 進む向き (dx, dz) に対して外側は (-dz, dx)（輪郭は 左の辺 → 正面 → 右の辺 と回る）
    let nx = -(q[1] - p[1])
    let nz = q[0] - p[0]
    const l = Math.hypot(nx, nz) || 1
    nx /= l
    nz /= l
    pos.set([x, y0, z, x, y1, z], i * 6)
    nor.set([nx, 0, nz, nx, 0, nz], i * 6)
    uv.set([u / uScale, 0, u / uScale, (y1 - y0) / vScale], i * 4)
  }
  const idx: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2
    // 外向きが表になる向き
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}

/**
 * 段々の曲面建築を 1 棟。広場に面する正面（front）の縁が階ごとに波打ちながら張り出す。
 */
/** 建てた棟の情報（滝・看板の位置決め用） */
export type TerraceInfo = {
  levels: number[]
  /** i 階の床板の前の縁（ローカル x＝lx の所）のワールド位置。inset > 0 で内側へ */
  edgePoint(i: number, lx: number, inset?: number): THREE.Vector3
  /** 外向き（正面）の向き：dx = cos(dirYaw), dz = sin(dirYaw) */
  dirYaw: number
  along: number
}

export function terraceBuilding(c: FCtx, o: TerraceOpts): TerraceInfo {
  const rng: Rng = mulberry32(o.seed ?? Math.round(o.x0 * 13 + o.z0 * 7 + o.h))
  const far = !!o.far
  const b = far ? c.bf : c.b
  const tm = terraceMaterials(c)
  const pearlM = far ? c.fm.farPanel : tm.pearl
  const glassM = far ? c.fm.farGlass : tm.curtain
  const glowM = far ? c.fm.farGlow : c.fm.glow
  const w = o.x1 - o.x0
  const d = o.z1 - o.z0
  const cx = (o.x0 + o.x1) / 2
  const cz = (o.z0 + o.z1) / 2
  const rot = FACE_ROT[o.front]
  const along = o.front === 'n' || o.front === 's' ? w : d
  const depth = o.front === 'n' || o.front === 's' ? d : w
  const cs = Math.cos(rot)
  const sn = Math.sin(rot)
  const W = (lx: number, lz: number): [number, number] => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]
  const place = (y: number) => M(cx, y, cz, 0, rot, 0)
  const first = o.first ?? 4.4
  const floorH = o.floor ?? 4.2
  const over = o.over ?? 1.8
  const amp = o.amp ?? 0.9
  const waves = o.waves ?? Math.max(1, Math.round(along / 16))
  const recess = o.recess ?? 0
  const accent = o.accent ?? NEON.cyan
  const green = !far && (o.green ?? true) !== false
  const lightGreen = o.green === 'light'
  const cornerR = Math.min(4.5, along * 0.18)
  const seedPh = rng() * Math.PI * 2

  // 階の高さと、それぞれの縁の形
  const levels: number[] = []
  for (let y = first; y < o.h - 1.2; y += floorH) levels.push(y)
  levels.push(o.h)
  const edges: Edge[] = levels.map((y, i) => {
    const top = i === levels.length - 1
    let ov = over * (0.65 + 0.35 * Math.sin(seedPh + i * 1.9)) - recess * i
    if (o.noOverBelow !== undefined && y < o.noOverBelow) ov = Math.min(ov, 0)
    if (top) ov = Math.min(ov, over * 0.4 - recess * i)
    return { over: ov, amp: amp * (0.6 + 0.4 * Math.cos(seedPh * 0.7 + i * 1.3)), phase: seedPh + i * 0.85 }
  })
  const slabT = far ? 0.7 : 0.62
  const bevel = far ? 0 : 0.16

  // 1 階：店先のガラスと白い柱（引っ込めて、床板の下に影ができるように）
  const ground: Edge = { over: 0, amp: 0, phase: 0 }
  if (o.shop ?? true) {
    const gp = outline(along, depth, waves, ground, 0.9, cornerR * 0.6)
    b.add(ribbon(gp, 0, first - slabT, 3.4, first), glassM, place(0), { cast: false })
    const nCol = Math.max(2, Math.round(along / 5))
    for (let i = 0; i <= nCol; i++) {
      const lx = -along / 2 + 0.6 + (i / nCol) * (along - 1.2)
      const [px, pz] = W(lx, depth / 2 - 0.35)
      b.add(new THREE.CylinderGeometry(0.22, 0.26, first - slabT, 14), pearlM, M(px, (first - slabT) / 2, pz), { uv: 'scale', uvScale: [1, 2], tint: '#f8f9fb', cast: !far })
    }
  } else {
    const gp = outline(along, depth, waves, ground, 0.4, cornerR * 0.6)
    b.add(ribbon(gp, 0, first - slabT, 3.4, first), pearlM, place(0), { tint: '#eef1f4', cast: !far })
  }

  for (let i = 0; i < levels.length; i++) {
    const y = levels[i]
    const e = edges[i]
    const top = i === levels.length - 1
    // 床板（パール）と裏（暖色の照明）
    const pts = outline(along, depth, waves, e, 0, cornerR)
    b.add(slabGeometry(pts, slabT, bevel), pearlM, place(y), { tint: '#ffffff', uv: 'scale', uvScale: [0.2, 0.2], cast: !far })
    if (!far) b.add(slabGeometry(outline(along, depth, waves, e, 0.35, cornerR), 0.02, 0), tm.soffit, place(y - slabT + 0.005), { cast: false })
    // 縁の光る線（床板の前面）
    const fpts = outline(along, depth, waves, e, -bevel - 0.012, cornerR, true)
    b.add(ribbon(fpts, y - slabT * 0.62, y - slabT * 0.5), glowM, place(0), { tint: accent, cast: false, receive: false })
    // 手すり（ガラス＋光る笠木）
    if (!far) {
      const rp = outline(along, depth, waves, e, 0.22, cornerR, true)
      b.add(ribbon(rp, y + 0.02, y + 1.05), tm.rail, place(0), { cast: false, receive: false })
      b.add(ribbon(rp, y + 1.03, y + 1.08), glowM, place(0), { tint: top ? NEON.white : new THREE.Color(1.6, 1.9, 2.1), cast: false, receive: false })
    }
    // その階のガラスの帯（上の床板の下まで）。上の階が引っ込んでいれば、そちらに合わせる
    if (!top) {
      const up = edges[i + 1]
      const ge: Edge = { over: Math.min(e.over, up.over) - (far ? 0.8 : 1.6), amp: up.amp, phase: up.phase }
      const gp = outline(along, depth, waves, ge, 0, Math.max(0.6, cornerR - 1.6))
      b.add(ribbon(gp, y, levels[i + 1] - slabT, 4.4, levels[i + 1] - slabT - y), glassM, place(0), { cast: false })
    }
    // テラスの緑（手すりの内側の植え込み・床板から垂れるつる草）
    if (green) {
      const fp = outline(along, depth, waves, e, 0.9, cornerR, true)
      for (let k = 3; k < fp.length - 3 && !lightGreen; k += 5) {
        if (rng() < 0.4) continue
        const [px, pz] = W(fp[k][0], fp[k][1])
        c.foliage.bush(px, y, pz, range(rng, 0.45, 0.7), Math.round(px * 17 + pz * 5 + y), range(rng, 0.8, 1.3))
      }
      const vp = outline(along, depth, waves, e, 0.05, cornerR, true)
      for (let k = 1; k < vp.length - 1; k += 2) {
        if (rng() < 0.62) continue
        const [px, pz] = W(vp[k][0], vp[k][1])
        vine(c, px, y - slabT * 0.5, pz, range(rng, 0.9, 2.6), rng)
      }
    }
  }
  // 屋上：植え込みの島と小さな木
  if (green) {
    const e = edges[edges.length - 1]
    const n = Math.max(2, Math.round(along / 6))
    for (let i = 0; i < n; i++) {
      const lx = -along / 2 + ((i + 0.5) / n) * along
      const [px, pz] = W(lx, depth / 2 + e.over - 2.6)
      c.foliage.bush(px, o.h, pz, range(rng, 0.8, 1.2), Math.round(px * 7 + pz), 1.4)
      if (rng() < 0.4) c.foliage.cherry(px + range(rng, -1, 1), o.h, pz - 1.2, range(rng, 0.55, 0.75), Math.round(px * 3 + pz * 11))
    }
  } else if (far) {
    // 遠景は屋上の緑を軽い塊で
    const e = edges[edges.length - 1]
    const [px, pz] = W(0, depth / 2 + e.over - 2)
    c.bf.add(new THREE.IcosahedronGeometry(Math.min(3, along * 0.12), 0), c.m.puffGreen, M(px, o.h + 1, pz, rng(), rng(), 0), { tint: '#a9d48a', cast: false })
  }
  if (o.collider ?? !far) c.col.box(cx, o.h / 2, cz, w, o.h, d)
  return {
    levels,
    along,
    dirYaw: Math.atan2(cs, sn),
    edgePoint(i, lx, inset = 0) {
      const e = edges[Math.max(0, Math.min(edges.length - 1, i))]
      const lz = depth / 2 + e.over - inset + e.amp * Math.sin(e.phase + (lx / along) * Math.PI * 2 * waves)
      const [x, z] = W(lx, lz)
      return new THREE.Vector3(x, levels[Math.max(0, Math.min(levels.length - 1, i))], z)
    },
  }
}

const fallMats = new WeakMap<object, THREE.ShaderMaterial>()

/** 屋上から段々のテラスを 1 段ずつ落ちる滝（上の縁 → 下の階のテラスへ） */
export function terraceCascade(c: FCtx, info: TerraceInfo, lx: number, width: number, fromLevel = info.levels.length - 1, toLevel = 1): void {
  let mat = fallMats.get(c.fm)
  if (!mat) {
    mat = createFallMaterial(4.2, 1.0, 1.1, 0.55)
    fallMats.set(c.fm, mat)
  }
  for (let i = fromLevel; i >= Math.max(1, toLevel); i--) {
    const lip = info.edgePoint(i, lx, -0.1)
    lip.y += 0.05
    const below = info.edgePoint(i - 1, lx, 0.6)
    const drop = lip.y - info.levels[i - 1] - 0.05
    // 下のテラスの手すりの内側に落ちるように（下の縁が前に出ていれば、そのぶん前へ飛ばす）
    const dx = Math.cos(info.dirYaw)
    const dz = Math.sin(info.dirYaw)
    const out = Math.max(0.3, Math.min(2.2, (below.x - lip.x) * dx + (below.z - lip.z) * dz))
    const m = new THREE.Mesh(fallSheet(lip, info.dirYaw, width, drop, out, 12, 6), mat)
    m.castShadow = false
    m.renderOrder = 2
    c.root.add(m)
  }
}

/** 前の縁のローカル座標（ある階の正面の中央付近）→ ワールド。看板・滝の位置決め用 */
export function terraceFrontPoint(o: TerraceOpts, lx: number, outFromFront: number): THREE.Vector3 {
  const rot = FACE_ROT[o.front]
  const w = o.x1 - o.x0
  const d = o.z1 - o.z0
  const depth = o.front === 'n' || o.front === 's' ? d : w
  const cx = (o.x0 + o.x1) / 2
  const cz = (o.z0 + o.z1) / 2
  const lz = depth / 2 + outFromFront
  return new THREE.Vector3(cx + lx * Math.cos(rot) + lz * Math.sin(rot), 0, cz - lx * Math.sin(rot) + lz * Math.cos(rot))
}

export function terraceYaw(front: TerraceFacing): number {
  return FACE_ROT[front]
}

/** 曲面の大きな看板（「なんばタウン NAMBA TOWN」）：i 階のガラスの帯の前に、縁に沿って貼る */
export function terraceSign(c: FCtx, info: TerraceInfo, level: number, lx0: number, lx1: number, h: number): void {
  if (level + 1 < info.levels.length) h = Math.min(h, info.levels[level + 1] - 0.7 - (info.levels[level] + 1.15))
  const cv = document.createElement('canvas')
  const Wpx = 2048
  const Hpx = Math.round((Wpx * h) / Math.abs(lx1 - lx0))
  cv.width = Wpx
  cv.height = Hpx
  const g = cv.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, Wpx, Hpx)
  bg.addColorStop(0, '#24318a')
  bg.addColorStop(0.55, '#3a52c4')
  bg.addColorStop(1, '#5b3fb2')
  g.fillStyle = bg
  g.fillRect(0, 0, Wpx, Hpx)
  // 細かい格子（画面の画素）
  g.strokeStyle = 'rgba(255,255,255,0.07)'
  g.lineWidth = 1
  for (let x = 0; x < Wpx; x += 8) {
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, Hpx)
    g.stroke()
  }
  drawSakura(g, Hpx * 0.62, Hpx * 0.5, Hpx * 0.34, '#ff9cc4', '#fff0f6', 0.2)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = 'rgba(160,220,255,0.9)'
  g.shadowBlur = 18
  fitText(g, 'なんばタウン', Wpx * 0.56, Hpx * 0.42, Wpx * 0.66, Hpx * 0.5, 800)
  g.fillStyle = '#d6e8ff'
  fitText(g, 'NAMBA TOWN', Wpx * 0.56, Hpx * 0.8, Wpx * 0.42, Hpx * 0.15, 800, ROUNDED, Hpx * 0.06)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.25, 1.25, 1.3) })
  mat.name = 'f2086-bigSign'
  // 縁に沿った点（ガラスの帯より少し前）
  const n = 40
  // 手すりの上から、上の床板の下まで（収まらなければ縮める）。lx は小さい方から（見る人の右へ u が増える）
  const y0 = info.levels[level] + 1.15
  if (lx0 > lx1) [lx0, lx1] = [lx1, lx0]
  const pos = new Float32Array((n + 1) * 6)
  const uv = new Float32Array((n + 1) * 4)
  for (let k = 0; k <= n; k++) {
    const lx = lx0 + ((lx1 - lx0) * k) / n
    const p = info.edgePoint(level, lx, 1.35)
    pos.set([p.x, y0, p.z, p.x, y0 + h, p.z], k * 6)
    uv.set([k / n, 0, k / n, 1], k * 4)
  }
  const idx: number[] = []
  for (let k = 0; k < n; k++) {
    const a = k * 2
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geo.setIndex(idx)
  const mesh = new THREE.Mesh(geo, mat)
  mat.side = THREE.DoubleSide
  c.root.add(mesh)
}
