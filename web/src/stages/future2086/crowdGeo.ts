// 2086 年の人出の形（部品のジオメトリ）。crowd.ts から使う。
// 1 人の形は「立った姿勢（腕は下ろす）」の 1 つのモデル空間で作る（身長 ≈ 1.67、正面 -Z、足元 y=0）。
// 頂点ごとに aCrowd = (関節 limb, 色の枠 slot, 付属品のビット part) を持たせ、
// 頂点シェーダで関節を回し（歩き・手振り）、色はインスタンスごとの色表から引き、
// 付属品は人ごとのビットで出し入れする（無い人は頂点をつぶす）。光る線は色の枠 GLOW_A/B（シェーダで発光）。
// 三角形を節約するため、全員が持つのは素の体と髪だけ。付属品は「持っている人だけ」のメッシュに分ける。
import * as THREE from 'three'

/** 骨組み（モデル空間・大人の基準） */
export const SK = {
  HIP_Y: 0.86,
  LEG_X: 0.085,
  KNEE_Y: 0.47,
  SH_X: 0.205,
  SH_Y: 1.31,
  ELB_Y: 1.035,
  NECK_Y: 1.43,
  HEAD_Y: 1.535,
  HEAD_R: 0.118,
  /** 髪を含めた頭のてっぺん（スケールの基準） */
  TOP: 1.67,
} as const

/** 関節（シェーダの分岐と一致させる） */
export const LIMB = {
  RIGID: 0,
  L_THIGH: 1,
  L_SHIN: 2,
  R_THIGH: 3,
  R_SHIN: 4,
  L_UARM: 5,
  L_FARM: 6,
  R_UARM: 7,
  R_FARM: 8,
  HEAD: 9,
  DRONE: 10,
  /** コートの裾：左右の脚の振りに半分ついていく */
  SKIRT: 11,
  /** 右手に持つ物（前腕＋手首のひねり） */
  R_ITEM: 12,
} as const

/** 色表の列（人ごとに 1 行）。0〜14 は色、15〜19 は動きの値 */
export const SLOT = {
  TOP: 0,
  TOP2: 1,
  BOTTOM: 2,
  SHIN: 3,
  SHOE: 4,
  SOLE: 5,
  SKIN: 6,
  HAIR: 7,
  ARM_LO: 8,
  ACC: 9,
  DARK: 10,
  DRONE: 11,
  /** 光る線（この 2 つはシェーダで照明なしの HDR 発光） */
  GLOW_A: 12,
  GLOW_B: 13,
  HOLO: 14,
  A0: 15,
  A1: 16,
  A2: 17,
  A3: 18,
  A4: 19,
  COUNT: 20,
} as const

/** 付属品のビット（-1 = いつも出す） */
export const BIT = {
  HOOD: 0,
  COLLAR: 1,
  COAT: 2,
  BACKPACK: 3,
  VEST: 4,
  DRONE: 5,
  VISOR: 6,
  SOLES: 7,
  SLEEVE: 8,
  ZIP: 9,
  HOLOCOAT: 10,
  UCHIWA: 11,
  PENLIGHT: 12,
  PHONES: 13,
  SCREEN: 14,
  LEGLINE: 15,
  COATTRIM: 16,
  CHEST: 17,
} as const

/** メッシュごとに「この人は入るか」を決めるビットの組 */
export const KIT = {
  top: (1 << BIT.HOOD) | (1 << BIT.COLLAR) | (1 << BIT.ZIP) | (1 << BIT.CHEST) | (1 << BIT.SLEEVE) | (1 << BIT.LEGLINE),
  outer: (1 << BIT.COAT) | (1 << BIT.COATTRIM) | (1 << BIT.VEST),
  gear: (1 << BIT.BACKPACK) | (1 << BIT.DRONE) | (1 << BIT.PHONES) | (1 << BIT.PENLIGHT),
  holoCoat: 1 << BIT.HOLOCOAT,
  holoItem: (1 << BIT.UCHIWA) | (1 << BIT.SCREEN),
} as const

type SlotSpec = number | ((c: THREE.Vector3) => number)

/** 部品を 1 つの非インデックスのジオメトリへ詰める */
function sink() {
  const P: number[] = []
  const Nn: number[] = []
  const T: number[] = []
  const c = new THREE.Vector3()
  return {
    add(g: THREE.BufferGeometry, limb: number, slot: SlotSpec, part = -1): void {
      const ng = g.index ? g.toNonIndexed() : g
      if (!ng.attributes.normal) ng.computeVertexNormals()
      const p = ng.attributes.position as THREE.BufferAttribute
      const n = ng.attributes.normal as THREE.BufferAttribute
      for (let i = 0; i + 2 < p.count; i += 3) {
        // 極の縮退三角形は捨てる
        const ax = p.getX(i)
        const ay = p.getY(i)
        const az = p.getZ(i)
        const bx = p.getX(i + 1) - ax
        const by = p.getY(i + 1) - ay
        const bz = p.getZ(i + 1) - az
        const cx = p.getX(i + 2) - ax
        const cy = p.getY(i + 2) - ay
        const cz = p.getZ(i + 2) - az
        const crx = by * cz - bz * cy
        const cry = bz * cx - bx * cz
        const crz = bx * cy - by * cx
        if (crx * crx + cry * cry + crz * crz < 1e-14) continue
        let s: number
        if (typeof slot === 'number') s = slot
        else {
          c.set(ax + (bx + cx) / 3, ay + (by + cy) / 3, az + (bz + cz) / 3)
          s = slot(c)
        }
        for (let k = 0; k < 3; k++) {
          P.push(p.getX(i + k), p.getY(i + k), p.getZ(i + k))
          Nn.push(n.getX(i + k), n.getY(i + k), n.getZ(i + k))
          T.push(limb, s, part)
        }
      }
      g.dispose()
      if (ng !== g) ng.dispose()
    },
    build(): THREE.BufferGeometry {
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
      g.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3))
      g.setAttribute('aCrowd', new THREE.Float32BufferAttribute(T, 3))
      return g
    },
  }
}

// ---------------------------------------------------------------- 形の小道具

/** 縦の筒（ふたなし）。r0 = 下の半径、r1 = 上の半径 */
function tube(r0: number, r1: number, y0: number, y1: number, x: number, z: number, segs = 6, hseg = 1): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, segs, hseg, true)
  g.translate(x, (y0 + y1) / 2, z)
  return g
}

/** だ円体 */
function ell(rx: number, ry: number, rz: number, x: number, y: number, z: number, ws = 6, hs = 4): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, ws, hs)
  g.scale(rx, ry, rz)
  g.translate(x, y, z)
  return g
}

/** 輪（だ円の帯）。gap は正面の切れ目（ラジアン） */
function band(r: number, h: number, y: number, zs: number, gap = 0, segs = 8, x = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, segs, 1, true, Math.PI + gap / 2, Math.PI * 2 - gap)
  g.scale(1, 1, zs)
  g.translate(x, y, z)
  return g
}

type Prof = ReadonlyArray<readonly [number, number]>

/** 回転体（[半径, 高さ] を下から上へ）。zs で前後につぶす。gap は正面の切れ目 */
function lathe(prof: Prof, segs: number, zs: number, gap = 0, grow = 0): THREE.BufferGeometry {
  const pts = prof.map(([r, y]) => new THREE.Vector2(Math.max(0, r + (r > 0 ? grow : 0)), y))
  // 切れ目なし：正面に 1 区画がまっすぐ来るように始点をずらす（前立ての色分け用）
  const g = gap > 0 ? new THREE.LatheGeometry(pts, segs, Math.PI + gap / 2, Math.PI * 2 - gap) : new THREE.LatheGeometry(pts, segs, Math.PI / segs)
  g.scale(1, 1, zs)
  return g
}

/** 回転体の半径（高さ y で） */
function rAt(prof: Prof, y: number): number {
  if (y <= prof[0][1]) return prof[0][0]
  for (let i = 1; i < prof.length; i++) {
    const [r1, y1] = prof[i]
    const [r0, y0] = prof[i - 1]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-6, y1 - y0)
  }
  return prof[prof.length - 1][0]
}

/** 平たい帯（点列に沿う。normals は外向き） */
function ribbon(pts: THREE.Vector3[], nrm: THREE.Vector3[], w: number): THREE.BufferGeometry {
  const P: number[] = []
  const N: number[] = []
  const side = (i: number) => {
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const t = new THREE.Vector3().subVectors(b, a).normalize()
    return new THREE.Vector3().crossVectors(t, nrm[i]).normalize().multiplyScalar(w / 2)
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const s0 = side(i)
    const s1 = side(i + 1)
    const a0 = pts[i].clone().sub(s0)
    const a1 = pts[i].clone().add(s0)
    const b0 = pts[i + 1].clone().sub(s1)
    const b1 = pts[i + 1].clone().add(s1)
    for (const [v, n] of [
      [a0, nrm[i]],
      [b0, nrm[i + 1]],
      [a1, nrm[i]],
      [a1, nrm[i]],
      [b0, nrm[i + 1]],
      [b1, nrm[i + 1]],
    ] as const) {
      P.push(v.x, v.y, v.z)
      N.push(n.x, n.y, n.z)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3))
  return g
}

/** 回転体の表面に沿う縦の帯（角度 a：0 = 正面、+ = 右(+X)） */
function profRibbon(prof: Prof, zs: number, a: number, y0: number, y1: number, w: number, lift = 0.004, steps = 5): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = []
  const nrm: THREE.Vector3[] = []
  for (let i = 0; i <= steps; i++) {
    const y = y0 + ((y1 - y0) * i) / steps
    const r = rAt(prof, y) + lift
    pts.push(new THREE.Vector3(Math.sin(a) * r, y, -Math.cos(a) * r * zs))
    nrm.push(new THREE.Vector3(Math.sin(a), 0, -Math.cos(a) / zs).normalize())
  }
  return ribbon(pts, nrm, w)
}

/** 平面の四角い枠（中心 c、面の向き n、幅 w・高さ h、線の太さ t、上向き up） */
function frame(c: THREE.Vector3, n: THREE.Vector3, up: THREE.Vector3, w: number, h: number, t: number): THREE.BufferGeometry[] {
  const r = new THREE.Vector3().crossVectors(up, n).normalize()
  const u = up.clone().normalize()
  const p = (x: number, y: number) => c.clone().addScaledVector(r, x).addScaledVector(u, y)
  const seg = (a: THREE.Vector3, b: THREE.Vector3) => ribbon([a, b], [n, n], t)
  return [seg(p(-w / 2, -h / 2), p(w / 2, -h / 2)), seg(p(w / 2, -h / 2), p(w / 2, h / 2)), seg(p(w / 2, h / 2), p(-w / 2, h / 2)), seg(p(-w / 2, h / 2), p(-w / 2, -h / 2))]
}

// ---------------------------------------------------------------- 体の輪郭

/** 上着（すそ 0.83 → 肩 → 首）。少しゆったりしたストリートの形 */
const TORSO: Prof = [
  [0.162, 0.83],
  [0.151, 0.98],
  [0.168, 1.17],
  [0.18, 1.255],
  [0.182, 1.3],
  [0.13, 1.366],
  [0.055, 1.395],
  [0.0, 1.4],
]
const TORSO_ZS = 0.7
/** 腰（ズボンの上） */
const PELVIS: Prof = [
  [0.0, 0.79],
  [0.13, 0.805],
  [0.154, 0.85],
  [0.138, 0.96],
]
/** ベスト（上着の外側） */
const VEST: Prof = [
  [0.162, 0.83],
  [0.151, 0.98],
  [0.168, 1.17],
  [0.174, 1.265],
  [0.142, 1.35],
]
const VEST_ZS = TORSO_ZS + 0.02
const VEST_GAP = 1.15
/** 長いホロのコート */
const HOLOCOAT: Prof = [
  [0.232, 0.5],
  [0.196, 0.75],
  [0.172, 0.97],
  [0.182, 1.17],
  [0.188, 1.27],
  [0.15, 1.365],
  [0.078, 1.41],
]
const HOLOCOAT_ZS = 0.76
const HOLOCOAT_GAP = 0.78
/** テックコートの裾（腰から太ももの中ほどまで） */
const COAT: Prof = [
  [0.19, 0.6],
  [0.174, 0.78],
  [0.166, 0.93],
]
const COAT_ZS = 0.72
const COAT_GAP = 0.7

const SIDES = [-1, 1] as const
const ld = (s: number) => ({
  thigh: s < 0 ? LIMB.L_THIGH : LIMB.R_THIGH,
  shin: s < 0 ? LIMB.L_SHIN : LIMB.R_SHIN,
  uarm: s < 0 ? LIMB.L_UARM : LIMB.R_UARM,
  farm: s < 0 ? LIMB.L_FARM : LIMB.R_FARM,
})
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 手に持つ物の位置（腕を下ろした姿勢で、手の先） */
const HAND_Y = 0.745
const FAN_C = v3(SK.SH_X, 0.55, 0)
const FAN_R = 0.108
const DRONE_C = v3(0.36, 1.9, 0.08)
const SCREEN_C = v3(-0.07, 1.16, -0.34)
const SCREEN_TILT = -0.55

// ---------------------------------------------------------------- 素の体（全員）

export function bodyGeo(): THREE.BufferGeometry {
  const s = sink()
  const R = LIMB.RIGID
  // 腰とズボン・上着（正面の 1 区画は前立て TOP2：ジャケットの中のシャツ・パーカーのジッパーの色）
  s.add(lathe(PELVIS, 8, 0.72), R, SLOT.BOTTOM)
  s.add(lathe(TORSO, 8, TORSO_ZS), R, (c) => (c.z < 0 && Math.abs(c.x) < 0.06 && c.y < 1.37 ? SLOT.TOP2 : SLOT.TOP))
  for (const sd of SIDES) {
    const l = ld(sd)
    const x = sd * SK.LEG_X
    // 脚：太もも（ズボン）・すね（ズボン or 素足 or レギンス）
    s.add(tube(0.06, 0.074, 0.47, 0.9, x, 0), l.thigh, SLOT.BOTTOM)
    s.add(tube(0.046, 0.059, 0.1, 0.5, x, 0), l.shin, SLOT.SHIN)
    // 厚底スニーカー（ソールの帯は底が見えないのでふたなし）
    s.add(ell(0.054, 0.056, 0.116, x, 0.07, -0.032, 6, 4), l.shin, SLOT.SHOE)
    s.add(band(0.061, 0.034, 0.017, 2.1, 0, 6, x, -0.032), l.shin, SLOT.SOLE)
    // 靴底の光るライン
    s.add(band(0.064, 0.012, 0.025, 2.05, 0, 6, x, -0.032), l.shin, SLOT.GLOW_A, BIT.SOLES)
    // 腕：肩・上腕（上半分は上着、下半分は袖 or 肌）・前腕・手
    const ax = sd * SK.SH_X
    s.add(ell(0.047, 0.042, 0.05, sd * 0.196, SK.SH_Y - 0.026, 0, 6, 3), l.uarm, SLOT.TOP)
    s.add(tube(0.037, 0.045, SK.ELB_Y, SK.SH_Y, ax, 0, 6, 2), l.uarm, (c) => (c.y > 1.17 ? SLOT.TOP : SLOT.ARM_LO))
    s.add(tube(0.03, 0.037, 0.8, SK.ELB_Y + 0.01, ax, 0), l.farm, SLOT.ARM_LO)
    s.add(ell(0.03, 0.046, 0.028, ax, HAND_Y, -0.004, 6, 3), l.farm, SLOT.SKIN)
  }
  // 首・頭・目（目は顔の前の小さなだ円の板）
  s.add(tube(0.04, 0.042, 1.34, 1.46, 0, 0.004), R, SLOT.SKIN)
  s.add(ell(SK.HEAD_R, SK.HEAD_R * 1.05, SK.HEAD_R, 0, SK.HEAD_Y, 0, 10, 6), LIMB.HEAD, SLOT.SKIN)
  for (const sd of SIDES) {
    const eye = new THREE.CircleGeometry(1, 6)
    eye.scale(0.0135, 0.02, 1)
    eye.rotateY(Math.PI - sd * 0.36)
    eye.translate(sd * 0.042, SK.HEAD_Y - 0.004, -0.113)
    s.add(eye, LIMB.HEAD, SLOT.DARK)
  }
  return s.build()
}

// ---------------------------------------------------------------- 上着の細部（フード・襟・ジッパー・胸の帯・袖と脚の線）

export function topGeo(): THREE.BufferGeometry {
  const s = sink()
  const R = LIMB.RIGID
  const A = SLOT.GLOW_A
  const B = SLOT.GLOW_B
  // パーカー：背中に下ろしたフード＋おなかのポケット
  const hood = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.5)
  hood.scale(0.135, 0.12, 0.085)
  hood.rotateX(Math.PI * 0.42)
  hood.translate(0, 1.345, 0.08)
  s.add(hood, R, SLOT.TOP, BIT.HOOD)
  // パーカーのひも
  for (const sd of SIDES) {
    const y0 = 1.33
    const y1 = 1.2
    const z0 = -rAt(TORSO, y0) * TORSO_ZS - 0.008
    const z1 = -rAt(TORSO, y1) * TORSO_ZS - 0.006
    s.add(ribbon([v3(sd * 0.045, y0, z0), v3(sd * 0.05, y1, z1)], [v3(0, 0.3, -1).normalize(), v3(0, 0, -1)], 0.011), R, SLOT.DRONE, BIT.HOOD)
  }
  // ジャケット：立ち襟
  const collar = new THREE.CylinderGeometry(0.074, 0.09, 0.07, 8, 1, true, Math.PI + 0.55, Math.PI * 2 - 1.1)
  collar.scale(1, 1, 0.86)
  collar.translate(0, 1.385, 0.004)
  s.add(collar, R, SLOT.TOP, BIT.COLLAR)
  // 前のジッパーの線＋すその輪
  s.add(profRibbon(TORSO, TORSO_ZS, 0, 0.835, 1.36, 0.012), R, B, BIT.ZIP)
  s.add(band(0.166, 0.014, 0.842, TORSO_ZS * 1.01), R, B, BIT.ZIP)
  // 胸の帯
  s.add(band(0.172, 0.015, 1.2, TORSO_ZS * 1.01), R, A, BIT.CHEST)
  for (const sd of SIDES) {
    const l = ld(sd)
    const ax = sd * SK.SH_X
    const x = sd * SK.LEG_X
    const out = v3(sd, 0, 0)
    // 袖の外側の線＋手首の輪
    s.add(ribbon([v3(ax + sd * 0.0495, 1.33, 0), v3(ax + sd * 0.04, SK.ELB_Y, 0)], [out, out], 0.013), l.uarm, A, BIT.SLEEVE)
    s.add(ribbon([v3(ax + sd * 0.039, SK.ELB_Y, 0), v3(ax + sd * 0.033, 0.82, 0)], [out, out], 0.012), l.farm, A, BIT.SLEEVE)
    s.add(band(0.035, 0.014, 0.815, 1, 0, 6, ax, 0), l.farm, A, BIT.SLEEVE)
    // 脚の外側の線
    s.add(ribbon([v3(x + sd * 0.077, 0.86, 0), v3(x + sd * 0.063, 0.49, 0)], [out, out], 0.013), l.thigh, A, BIT.LEGLINE)
    s.add(ribbon([v3(x + sd * 0.061, 0.49, 0), v3(x + sd * 0.05, 0.14, 0)], [out, out], 0.012), l.shin, A, BIT.LEGLINE)
  }
  return s.build()
}

// ---------------------------------------------------------------- 外側の服（テックコートの裾・ハッピ風ベスト）

export function outerGeo(): THREE.BufferGeometry {
  const s = sink()
  const R = LIMB.RIGID
  const B = SLOT.GLOW_B
  // テックコートの裾（脚に合わせて揺れる）と光る縁
  s.add(lathe(COAT, 8, COAT_ZS, COAT_GAP), LIMB.SKIRT, SLOT.TOP, BIT.COAT)
  for (const sd of SIDES) s.add(profRibbon(COAT, COAT_ZS, sd * (COAT_GAP / 2 + 0.03), 0.6, 0.93, 0.013, 0.003, 3), LIMB.SKIRT, B, BIT.COATTRIM)
  s.add(band(0.193, 0.013, 0.607, COAT_ZS, COAT_GAP), LIMB.SKIRT, B, BIT.COATTRIM)
  // 光るハッピ風のベスト（前が開いている）：縁・すそ・背中の紋
  s.add(lathe(VEST, 8, VEST_ZS, VEST_GAP, 0.012), R, SLOT.ACC, BIT.VEST)
  const vestProf = VEST.map(([r, y]) => [r + 0.014, y] as const)
  for (const sd of SIDES) s.add(profRibbon(vestProf, VEST_ZS, sd * (VEST_GAP / 2 + 0.03), 0.835, 1.33, 0.017, 0.002, 4), R, B, BIT.VEST)
  s.add(band(0.176, 0.017, 0.84, VEST_ZS, VEST_GAP), R, B, BIT.VEST)
  const crest = new THREE.RingGeometry(0.045, 0.06, 8)
  crest.translate(0, 1.16, rAt(VEST, 1.16) * VEST_ZS + 0.022)
  s.add(crest, R, B, BIT.VEST)
  return s.build()
}

// ---------------------------------------------------------------- 持ち物（リュック・ドローン・ヘッドホン・ペンライト）

export function gearGeo(): THREE.BufferGeometry {
  const s = sink()
  const R = LIMB.RIGID
  const A = SLOT.GLOW_A
  // リュック＋肩ひも＋光るパネル
  const pack = new THREE.BoxGeometry(0.24, 0.28, 0.1)
  pack.translate(0, 1.1, 0.172)
  s.add(pack, R, SLOT.ACC, BIT.BACKPACK)
  for (const sd of SIDES) {
    const px = sd * 0.085
    const pts = [v3(px, 1.2, 0.13), v3(px * 1.05, 1.335, 0.07), v3(px * 1.1, 1.375, -0.01), v3(px * 1.08, 1.29, -0.115), v3(px, 1.02, -0.11)]
    const nrm = [v3(0, 0.2, 1), v3(0, 0.8, 0.6), v3(0, 1, 0), v3(0, 0.5, -0.86), v3(0, -0.1, -1)].map((v) => v.normalize())
    s.add(ribbon(pts, nrm, 0.036), R, SLOT.ACC, BIT.BACKPACK)
  }
  for (const g of frame(v3(0, 1.105, 0.2235), v3(0, 0, 1), v3(0, 1, 0), 0.17, 0.19, 0.013)) s.add(g, R, A, BIT.BACKPACK)
  s.add(ribbon([v3(-0.055, 1.07, 0.2235), v3(0.055, 1.07, 0.2235)], [v3(0, 0, 1), v3(0, 0, 1)], 0.02), R, A, BIT.BACKPACK)
  // 荷物を運ぶ小さなドローン（右肩の上に浮く）：白い体・荷物・光るガードの輪
  const dc = DRONE_C
  s.add(ell(0.072, 0.03, 0.072, dc.x, dc.y, dc.z, 6, 3), LIMB.DRONE, SLOT.DRONE, BIT.DRONE)
  const cargo = new THREE.BoxGeometry(0.085, 0.07, 0.085)
  cargo.translate(dc.x, dc.y - 0.07, dc.z)
  s.add(cargo, LIMB.DRONE, SLOT.ACC, BIT.DRONE)
  const guard = new THREE.RingGeometry(0.088, 0.104, 8)
  guard.rotateX(-Math.PI / 2)
  guard.translate(dc.x, dc.y + 0.004, dc.z)
  s.add(guard, LIMB.DRONE, A, BIT.DRONE)
  // ヘッドホン（耳あて＋バンド＋光る輪）
  for (const sd of SIDES) {
    const cup = new THREE.CylinderGeometry(0.04, 0.04, 0.032, 6, 1, true)
    cup.rotateZ(Math.PI / 2)
    cup.translate(sd * 0.122, SK.HEAD_Y - 0.005, 0.005)
    s.add(cup, LIMB.HEAD, SLOT.ACC, BIT.PHONES)
    const cap = new THREE.CircleGeometry(0.04, 6)
    cap.rotateY((sd * Math.PI) / 2)
    cap.translate(sd * 0.138, SK.HEAD_Y - 0.005, 0.005)
    s.add(cap, LIMB.HEAD, SLOT.ACC, BIT.PHONES)
    const ring = new THREE.RingGeometry(0.02, 0.033, 6)
    ring.rotateY((sd * Math.PI) / 2)
    ring.translate(sd * 0.1395, SK.HEAD_Y - 0.005, 0.005)
    s.add(ring, LIMB.HEAD, A, BIT.PHONES)
  }
  const hb = new THREE.TorusGeometry(0.128, 0.011, 3, 6, Math.PI)
  hb.translate(0, SK.HEAD_Y - 0.005, 0.005)
  s.add(hb, LIMB.HEAD, SLOT.ACC, BIT.PHONES)
  // ペンライト（右手）
  s.add(tube(0.013, 0.013, 0.5, HAND_Y + 0.02, SK.SH_X, -0.004, 4), LIMB.R_FARM, SLOT.GLOW_B, BIT.PENLIGHT)
  return s.build()
}

// ---------------------------------------------------------------- 半透明のホロ（長いコート／うちわと空中画面）

export function holoCoatGeo(): THREE.BufferGeometry {
  const s = sink()
  const H = SLOT.HOLO
  const A = SLOT.GLOW_A
  s.add(lathe(HOLOCOAT, 10, HOLOCOAT_ZS, HOLOCOAT_GAP), LIMB.SKIRT, H)
  const hood = new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.5)
  hood.scale(0.15, 0.135, 0.1)
  hood.rotateX(Math.PI * 0.42)
  hood.translate(0, 1.35, 0.105)
  s.add(hood, LIMB.RIGID, H)
  for (const sd of SIDES) {
    const l = ld(sd)
    const ax = sd * SK.SH_X
    s.add(tube(0.054, 0.062, SK.ELB_Y - 0.01, SK.SH_Y + 0.02, ax, 0), l.uarm, H)
    s.add(tube(0.05, 0.055, 0.8, SK.ELB_Y + 0.01, ax, 0), l.farm, H)
    // 光る縁：前の開き・袖口・二の腕の輪
    s.add(profRibbon(HOLOCOAT, HOLOCOAT_ZS, sd * (HOLOCOAT_GAP / 2 + 0.03), 0.5, 1.38, 0.015, 0.003, 6), LIMB.SKIRT, A)
    s.add(band(0.052, 0.014, 0.815, 1, 0, 6, ax, 0), l.farm, A)
    s.add(band(0.059, 0.012, 1.12, 1, 0, 6, ax, 0), l.uarm, A)
  }
  s.add(band(0.236, 0.017, 0.508, HOLOCOAT_ZS, HOLOCOAT_GAP, 10), LIMB.SKIRT, A)
  s.add(profRibbon(HOLOCOAT, HOLOCOAT_ZS, Math.PI, 0.52, 1.3, 0.013, 0.003, 5), LIMB.SKIRT, A)
  return s.build()
}

export function holoItemGeo(): THREE.BufferGeometry {
  const s = sink()
  const H = SLOT.HOLO
  // ホロうちわ（右手）：面・光る縁・柄
  const fan = new THREE.CircleGeometry(FAN_R - 0.013, 12)
  fan.translate(FAN_C.x, FAN_C.y, FAN_C.z)
  s.add(fan, LIMB.R_ITEM, H, BIT.UCHIWA)
  const rim = new THREE.RingGeometry(FAN_R - 0.012, FAN_R + 0.002, 12)
  rim.translate(FAN_C.x, FAN_C.y, FAN_C.z)
  s.add(rim, LIMB.R_ITEM, SLOT.GLOW_B, BIT.UCHIWA)
  const hn = v3(0, 0, -1)
  s.add(ribbon([v3(FAN_C.x, FAN_C.y + FAN_R - 0.01, 0), v3(FAN_C.x, HAND_Y + 0.01, 0)], [hn, hn], 0.014), LIMB.R_ITEM, SLOT.GLOW_B, BIT.UCHIWA)
  // 空中の画面（体の前に浮く）と光る枠
  const scr = new THREE.PlaneGeometry(0.218, 0.138)
  scr.rotateX(SCREEN_TILT)
  scr.translate(SCREEN_C.x, SCREEN_C.y, SCREEN_C.z)
  s.add(scr, LIMB.RIGID, H, BIT.SCREEN)
  const sn = v3(0, -Math.sin(SCREEN_TILT), Math.cos(SCREEN_TILT))
  const su = v3(0, Math.cos(SCREEN_TILT), Math.sin(SCREEN_TILT))
  for (const g of frame(SCREEN_C, sn, su, 0.236, 0.156, 0.009)) s.add(g, LIMB.RIGID, SLOT.GLOW_A, BIT.SCREEN)
  return s.build()
}

// ---------------------------------------------------------------- 髪型（＋AR バイザー）

export const HAIR_STYLES = 5

/** 0 短髪・1 ボブ・2 お団子・3 ポニーテール・4 ロング。どれも前髪付き。AR バイザー（光の帯）もここに入れる */
export function hairGeo(style: number): THREE.BufferGeometry {
  const reach = style === 0 ? 0.56 : 0.64
  const parts: THREE.BufferGeometry[] = []
  const cap = new THREE.SphereGeometry(0.127, 10, 4, 0, Math.PI * 2, 0, Math.PI * reach)
  cap.rotateX(0.5)
  cap.scale(1.02, 1.07, 1.03)
  cap.translate(0, 0.012, 0.004)
  parts.push(cap)
  const bangs = new THREE.SphereGeometry(0.1, 8, 2, 0, Math.PI * 2, 0, Math.PI / 2)
  bangs.scale(1.12, 0.42, 0.56)
  bangs.translate(0, 0.058, -0.07)
  parts.push(bangs)
  if (style === 0) {
    // 短髪：てっぺんに毛先
    for (const [x, z, a] of [
      [0.0, -0.03, -0.5],
      [0.05, 0.02, 0.0],
      [-0.05, 0.02, 0.2],
    ] as const) {
      const tuft = new THREE.ConeGeometry(0.048, 0.075, 4, 1, true)
      tuft.rotateX(a)
      tuft.translate(x, 0.125, z)
      parts.push(tuft)
    }
  } else if (style === 1) {
    const back = new THREE.CylinderGeometry(0.131, 0.126, 0.13, 8, 1, true, -Math.PI * 0.72, Math.PI * 1.44)
    back.translate(0, -0.04, 0.012)
    parts.push(back)
  } else if (style === 2) {
    parts.push(ell(0.058, 0.058, 0.058, 0, 0.115, 0.07, 6, 4))
  } else if (style === 3) {
    parts.push(ell(0.04, 0.11, 0.04, 0, -0.06, 0.135, 5, 4))
  } else {
    const back = new THREE.CylinderGeometry(0.13, 0.115, 0.3, 8, 1, true, -Math.PI * 0.62, Math.PI * 1.24)
    back.translate(0, -0.12, 0.02)
    parts.push(back)
  }
  const s = sink()
  for (const p of parts) {
    p.translate(0, SK.HEAD_Y, 0)
    s.add(p, LIMB.HEAD, SLOT.HAIR)
  }
  const visor = new THREE.CylinderGeometry(0.128, 0.128, 0.03, 8, 1, true, Math.PI - 1.2, 2.4)
  visor.translate(0, SK.HEAD_Y - 0.004, 0)
  s.add(visor, LIMB.HEAD, SLOT.GLOW_A, BIT.VISOR)
  return s.build()
}
