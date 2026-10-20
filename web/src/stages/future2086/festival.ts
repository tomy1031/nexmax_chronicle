// 時代博覧祭の会場：広場の床（光るライン）、空中回廊（白い床・光る手すり・柱・つる草）、通りの上のアーチ（振り子の支点）、
// 屋台の列（のれん・提灯・ホロのメニュー）、祭りのステージ、幟と横断幕、ホログラムの看板、提灯の連なり、桜と植え込み、南の避難ゲート。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { mulberry32, range } from '../../render/noise'
import { F, HOOK, SWING } from './layout'
import { createFloorKit } from './floor2086'
import { buildStalls2086 } from './stalls2086'
import { NEON, bulbString, chochin, column, fbox, glowRailing, lanternString, neon, planter, vine, type FCtx } from './kit2086'
import { atlasPlane } from './textures2086'
import { paintWaterNormal } from '../../render/textures'
import { createSpray, type Emitter } from '../../world/edo/water'
import { floorWithHoles, planeWithHoles, rectsOverlap } from './groundHoles'
import type { FutureSceneMods } from './scene'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ 布・ホロを積む

/** 縦の幟（白い竿＋横棒＋布）。y は足元 */
export function nobori(c: FCtx, region: string, x: number, z: number, rotY: number, h = 3.2, w = 0.95): void {
  const r = c.fm.atlases.fabric.get(region)
  const aspect = ((r.u1 - r.u0) * 2048) / ((r.v1 - r.v0) * 2048)
  const bw = w
  const bh = Math.min(h, bw / aspect)
  const poleH = bh + 1.0
  c.b.add(new THREE.CylinderGeometry(0.035, 0.045, poleH, 8), c.fm.metal, M(x, poleH / 2, z), { uv: 'scale', uvScale: [1, poleH] })
  c.b.add(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 12), c.fm.darkMetal, M(x, 0.06, z))
  const cs = Math.cos(rotY)
  const sn = -Math.sin(rotY)
  const ox = cs * (bw / 2 + 0.05)
  const oz = sn * (bw / 2 + 0.05)
  c.b.add(new THREE.CylinderGeometry(0.02, 0.02, bw + 0.12, 6), c.fm.metal, M(x + ox, poleH - 0.06, z + oz, 0, rotY, Math.PI / 2))
  const g = atlasPlane(bw, bh, r, 3, 8)
  c.cloth.add(g, M(x + ox, poleH - 0.08 - bh / 2, z + oz, 0, rotY, 0), { aHang: (p) => Math.max(0, (bh / 2 - p.y) / bh) })
  c.col.box(x, poleH / 2, z, 0.15, poleH, 0.15)
}

/** 横断幕など：上辺で吊る布（中心 x,y,z、幅 w・高さ h） */
export function hangingCloth(c: FCtx, region: string, x: number, y: number, z: number, w: number, h: number, rotY: number, sway = 0.6): void {
  const r = c.fm.atlases.fabric.get(region)
  c.cloth.add(atlasPlane(w, h, r, 10, 3), M(x, y, z, 0, rotY, 0), { aHang: (p) => Math.max(0, (h / 2 - p.y) / h) * sway })
}

/** ホロの看板（板の中心） */
export function holoSign(c: FCtx, region: string, x: number, y: number, z: number, w: number, rotY: number, night = false): void {
  const atlas = c.fm.atlases.holo
  const r = atlas.get(region)
  const aspect = ((r.u1 - r.u0) * atlas.W) / ((r.v1 - r.v0) * atlas.H)
  ;(night ? c.holoN : c.holo).add(atlasPlane(w, w / aspect, r), M(x, y, z, 0, rotY, 0))
}

/** ホロの看板の台（光る縁の細い柱） */
function holoPost(c: FCtx, x: number, z: number, h: number, color = NEON.cyan): void {
  c.b.add(new THREE.CylinderGeometry(0.05, 0.07, h, 8), c.fm.metal, M(x, h / 2, z))
  c.b.add(new THREE.CylinderGeometry(0.22, 0.26, 0.1, 16), c.fm.darkMetal, M(x, 0.05, z))
  c.b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 10), c.fm.glow, M(x, h, z), { tint: color, cast: false })
}

// ------------------------------------------------------------------ 床

function plazaFloor(c: FCtx, mods: FutureSceneMods): void {
  const P = F.PLAZA
  const W = P.x1 - P.x0 + 1.2
  const D = P.z1 - P.z0 + 1.2
  // パールがかった大判タイル（テクスチャ 1 枚 ≒ 6m 四方）と、流れるように曲がる光の道（コンセプト案A）
  const fk = createFloorKit(c, c.root)
  const holes = mods.groundHoles ?? []
  const tileRect = { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 }
  if (holes.some((h) => rectsOverlap(h, tileRect))) c.b.add(planeWithHoles(tileRect, holes, 6), fk.tile, M(0, 0, 0), { uv: 'keep', tint: '#d9d8d4' })
  else c.b.add(new THREE.PlaneGeometry(W, D), fk.tile, M(0, 0, 0, -Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [W / 6, D / 6], tint: '#d9d8d4' })
  // 床の当たり判定（穴があれば、穴の周りの箱に分ける）
  if (holes.length) floorWithHoles(c.col, { x0: -120, x1: 120, z0: -120, z1: 120 }, 0, 1, holes)
  else c.col.floor(-120, 120, -120, 120, 0, 1)
  const y = 0.006
  const ring = (cx: number, cz: number, r: number, col: THREE.Color, n = 64) => {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      neon(c, v(cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r), v(cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r), 0.07, col)
    }
  }
  ring(1.5, 1.5, 7.2, NEON.cyan)
  // 中央の明るい石の円盤
  c.b.add(new THREE.CircleGeometry(7.1, 64), fk.tile, M(1.5, 0.003, 1.5, -Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [2.4, 2.4], tint: '#e8e4dc' })
  // 光の道：南の入口から噴水を回り込んで、IDO 展示・屋台・ステージ・北のアーチへ
  fk.path([[0.6, 21], [-0.4, 15.5], [-3.2, 11.4], [-6.4, 7.6], [-7.6, 3.6], [-6.6, 1.2]], NEON.cyan)
  fk.path([[2.6, 21], [3.8, 15.6], [7.4, 11.2], [11.4, 7.6], [12.8, 3.4], [12.6, 0.4]], NEON.warm, { halo: 0.7 })
  fk.path([[-1.0, 21], [-3.6, 17.2], [-9.0, 13.6], [-14.2, 12.4], [-17.8, 12.6]], new THREE.Color(1.6, 0.9, 2.4), { core: 0.07, halo: 0.6 })
  fk.path([[7.6, -3.2], [9.6, -5.4], [11.4, -7.2], [12.4, -8.2]], NEON.pink, { halo: 0.7 })
  fk.path([[2.4, -5.6], [2.0, -9.6], [0.6, -13.2], [0.2, -19.6]], NEON.cyan)
  // 噴水のまわりの細い 2 本目の輪（少しずれた楕円）
  {
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2
      pts.push([1.5 + Math.cos(a) * 8.3, 1.5 + Math.sin(a) * 7.8])
    }
    fk.path(pts, new THREE.Color(0.25, 0.8, 1.4), { core: 0.05, halo: 0.5 })
  }
}

// ------------------------------------------------------------------ 空中回廊

function deck(c: FCtx, x0: number, x1: number, z0: number, z1: number): void {
  const y = F.WALK_Y
  const w = x1 - x0
  const d = z1 - z0
  // 床（上面は灰色のタイル、縁は白）
  c.b.add(rbox(w, 0.55, d, 0.12), c.fm.panel, M((x0 + x1) / 2, y - 0.275, (z0 + z1) / 2), { texM: 2.2, tint: '#e6eaf0' })
  c.col.floor(x0, x1, z0, z1, y, 0.55)
}

function walkways(c: FCtx): void {
  const y = F.WALK_Y
  const Wg = F.WALK_W
  const N = F.WALK_N
  const G = F.GAP
  deck(c, Wg.x0, Wg.x1, N.z1, Wg.z1)
  deck(c, N.x0, G.x0, N.z0, N.z1)
  deck(c, G.x1, N.x1, N.z0, N.z1)
  // 床の下の光の帯（内側の縁）
  const under = y - 0.58
  neon(c, v(Wg.x1 + 0.02, under, N.z1), v(Wg.x1 + 0.02, under, Wg.z1), 0.05, NEON.cyan)
  neon(c, v(Wg.x0, under, Wg.z1 + 0.02), v(Wg.x1, under, Wg.z1 + 0.02), 0.05, NEON.cyan)
  neon(c, v(Wg.x1, under, N.z1 + 0.02), v(G.x0, under, N.z1 + 0.02), 0.05, NEON.cyan)
  neon(c, v(G.x1, under, N.z1 + 0.02), v(N.x1, under, N.z1 + 0.02), 0.05, NEON.cyan)
  // 途切れた端の黄色い警告の縁
  for (const x of [G.x0, G.x1]) neon(c, v(x, y + 0.01, N.z0 + 0.2), v(x, y + 0.01, N.z1 - 0.2), 0.08, NEON.warm)
  // 手すり（広場側）
  glowRailing(c, Wg.x1, N.z1, Wg.x1, HOOK.point.z - 1.0, y)
  glowRailing(c, Wg.x1, HOOK.point.z + 1.0, Wg.x1, Wg.z1, y)
  // 金具の前は低い手すり（引き寄せの曲線が越えやすいように）
  glowRailing(c, Wg.x1, HOOK.point.z - 1.0, Wg.x1, HOOK.point.z + 1.0, y, { h: 0.7 })
  glowRailing(c, Wg.x0, Wg.z1, Wg.x1, Wg.z1, y)
  glowRailing(c, Wg.x1, N.z1, G.x0 - 0.05, N.z1, y)
  glowRailing(c, G.x1 + 0.05, N.z1, N.x1, N.z1, y)
  // 通りの上（北側が開いている部分）
  glowRailing(c, F.STREET.x0 - 0.2, N.z0, G.x0 - 0.05, N.z0, y)
  glowRailing(c, G.x1 + 0.05, N.z0, F.STREET.x1 + 0.2, N.z0, y)
  // 柱
  for (const z of [7, 1.2, -5.2, -11.2]) column(c, Wg.x1 - 0.45, z, 0, y - 0.55)
  for (const x of [-12, -6.6, -4.2, 4.2, 6.6, 12, 17.5]) column(c, x, N.z1 - 0.45, 0, y - 0.55)
  // つる草（手すりの外へ垂れる）
  const rng = mulberry32(404)
  for (let z = Wg.z1 - 1; z > N.z1; z -= 1.1) if (rng() < 0.55 && Math.abs(z - HOOK.point.z) > 1.4) vine(c, Wg.x1 + 0.1, y - 0.3, z, range(rng, 0.8, 2.2), rng)
  for (let x = Wg.x1 + 1; x < N.x1; x += 1.1) {
    if (x > G.x0 - 0.5 && x < G.x1 + 0.5) continue
    if (rng() < 0.5) vine(c, x, y - 0.3, N.z1 + 0.1, range(rng, 0.8, 2.0), rng)
  }
  // 回廊の上の植え込み（壁側）
  for (let z = 6; z > -14; z -= 5) planter(c, Wg.x0 + 0.75, z, 1.1, 2.4, y, 0.6, Math.round(z * 3 + 50))
  for (let x = -12; x < 19; x += 5.5) {
    if (x > F.STREET.x0 - 1 && x < F.STREET.x1 + 1) continue
    planter(c, x, N.z0 + 0.75, 2.4, 1.1, y, 0.6, Math.round(x * 5 + 90))
  }
  // 手すりに沿った電球
  bulbString(c, v(Wg.x1 + 0.05, y + 1.35, Wg.z1), v(Wg.x1 + 0.05, y + 1.35, N.z1), 0.25, 0.5, NEON.warm)
  bulbString(c, v(Wg.x1, y + 1.35, N.z1 + 0.05), v(G.x0, y + 1.35, N.z1 + 0.05), 0.2, 0.5, NEON.warm)
  bulbString(c, v(G.x1, y + 1.35, N.z1 + 0.05), v(N.x1, y + 1.35, N.z1 + 0.05), 0.25, 0.5, NEON.warm)

  // 西ウイングの縁の街灯と金具（pull_player）
  {
    const px = Wg.x1 - 0.05
    const pz = HOOK.point.z
    c.b.add(new THREE.CylinderGeometry(0.06, 0.08, 2.4, 10), c.fm.metal, M(px, y + 1.2, pz))
    fbox(c, c.fm.metal, (px + HOOK.point.x) / 2 + 0.05, y + 2.35, pz, Math.abs(HOOK.point.x - px) + 0.25, 0.08, 0.08, { r: 0.02 })
    c.b.add(new THREE.CylinderGeometry(0.012, 0.012, y + 2.35 - HOOK.point.y - 0.2, 6), c.fm.metal, M(HOOK.point.x, (y + 2.35 + HOOK.point.y + 0.2) / 2, pz))
    c.b.add(new THREE.TorusGeometry(0.17, 0.035, 10, 24), c.m.brass, M(HOOK.point.x, HOOK.point.y, pz, 0, Math.PI / 2, 0))
    c.b.add(new THREE.TorusGeometry(0.22, 0.012, 6, 28), c.fm.glow, M(HOOK.point.x, HOOK.point.y, pz, 0, Math.PI / 2, 0), { tint: NEON.cyan, cast: false })
    // 街灯の頭
    c.b.add(new THREE.SphereGeometry(0.16, 14, 8), c.fm.glow, M(px, y + 2.5, pz), { tint: NEON.white, cast: false })
    c.lights.push({ pos: v(px, y + 2.4, pz), color: '#cfe8ff', intensity: 2.5, dist: 7 })
  }

  // なんばタウンの横断幕（北ウイングの下、左側）
  hangingCloth(c, 'nanba_long', -9.6, y - 1.35, N.z1 + 0.25, 8.4, 1.48, 0, 0.35)
  // 回廊の床の下に吊る提灯
  for (let x = -14; x < -4; x += 1.4) chochin(c, x, y - 2.35, N.z1 + 0.55, x % 2.8 < 1.4 ? 'red' : 'white', 0.8, { light: Math.round(x) % 4 === 0 })
}

// ------------------------------------------------------------------ 通りの上のアーチ（振り子の支点）

function arch(c: FCtx): void {
  const A = F.ARCH
  const top = A.top
  for (const sx of [-1, 1]) {
    const x = sx * A.x
    fbox(c, c.fm.panel, x, top / 2, A.z, 0.62, top, 0.9, { r: 0.18, texM: 2.2, tint: '#f4f6f8' })
    neon(c, v(x - sx * 0.33, 0.5, A.z), v(x - sx * 0.33, top - 0.4, A.z), 0.06, NEON.cyan)
    c.col.box(x, top / 2, A.z, 0.62, top, 0.9)
  }
  // 梁（白い外装、下に光る帯）
  fbox(c, c.fm.panel, 0, top, A.z, A.x * 2 + 0.6, 0.75, 0.9, { r: 0.2, texM: 2.2, tint: '#f4f6f8' })
  neon(c, v(-A.x, top - 0.4, A.z + 0.46), v(A.x, top - 0.4, A.z + 0.46), 0.05, NEON.cyan)
  neon(c, v(-A.x, top - 0.4, A.z - 0.46), v(A.x, top - 0.4, A.z - 0.46), 0.05, NEON.cyan)
  // 吊り輪（swing_anchor）
  const an = SWING.anchor
  c.b.add(new THREE.CylinderGeometry(0.03, 0.03, top - 0.38 - an.y - 0.3, 8), c.fm.metal, M(an.x, (top - 0.38 + an.y + 0.3) / 2, an.z))
  c.b.add(rbox(0.4, 0.25, 0.4, 0.06), c.fm.darkMetal, M(an.x, top - 0.5, an.z))
  // 遠くからでも「ここにクローを引っかける」と分かるように、大きめの輪を水色に光らせ、光の輪を脈打たせる
  c.b.add(new THREE.TorusGeometry(0.5, 0.06, 12, 40), c.m.brass, M(an.x, an.y, an.z, 0, 0, 0))
  c.b.add(new THREE.TorusGeometry(0.5, 0.03, 8, 48), c.fm.glow, M(an.x, an.y, an.z + 0.045, 0, 0, 0), { tint: NEON.cyan, cast: false })
  c.b.add(new THREE.TorusGeometry(0.5, 0.03, 8, 48), c.fm.glow, M(an.x, an.y, an.z - 0.045, 0, 0, 0), { tint: NEON.cyan, cast: false })
  c.b.add(new THREE.SphereGeometry(0.09, 10, 6), c.m.brass, M(an.x, an.y + 0.53, an.z))
  const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.6, 2.4), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.56, 0.62, 48), haloMat)
  halo.position.copy(an)
  halo.renderOrder = 4
  const halo2 = halo.clone()
  halo2.rotation.y = Math.PI / 2
  c.root.add(halo, halo2)
  c.updaters.push((_dt, t) => {
    const k = (t * 0.7) % 1
    const sc = 1 + k * 0.9
    halo.scale.setScalar(sc)
    halo2.scale.setScalar(sc)
    haloMat.opacity = 0.85 * (1 - k) * (1 - k)
  })
  // 梁の上のホロ「時代博覧祭」
  holoSign(c, 'matsuri_logo', 0, top + 2.3, A.z + 0.1, 10.5, 0)
  // 梁から下がる提灯
  for (let x = -6; x <= 6; x += 1.5) if (Math.abs(x) > 1.2) chochin(c, x, top - 1.1 - Math.abs(Math.sin(x)) * 0.2, A.z + 0.2, Math.round(x / 1.5) % 2 ? 'red' : 'white', 0.85)
}

// ------------------------------------------------------------------ 屋台（stalls2086.ts）＋屋台の上のホロ

function stalls(c: FCtx): void {
  buildStalls2086(c)
  // 屋台の上のホロ「なんばタウン」（東のビルの壁）
  holoSign(c, 'nanba_holo', F.PLAZA.x1 - 0.05, 7.4, -0.2, 7.6, -Math.PI / 2)
}

// ------------------------------------------------------------------ ステージ

function stage(c: FCtx): void {
  const S = F.STAGE
  const cx = (S.x0 + S.x1) / 2
  const cz = (S.z0 + S.z1) / 2
  const w = S.x1 - S.x0
  const d = S.z1 - S.z0
  // 台（白い縁、上は木の床）
  fbox(c, c.fm.panel, cx, S.h / 2 - 0.04, cz, w, S.h - 0.08, d, { r: 0.1, texM: 2.2, tint: '#eef1f5' })
  c.b.add(rbox(w - 0.2, 0.08, d - 0.2, 0.02), c.m.planks, M(cx, S.h - 0.04, cz), { texM: 2, tint: '#ffe0b8' })
  neon(c, v(S.x0 + 0.2, 0.5, S.z1 + 0.01), v(S.x1 - 0.2, 0.5, S.z1 + 0.01), 0.05, NEON.pink)
  c.col.box(cx, S.h / 2, cz, w, S.h, d)
  // 前の階段
  for (let i = 0; i < 3; i++) fbox(c, c.fm.panel, cx, (S.h / 3) * (i + 0.5) - 0.02, S.z1 + 0.9 - i * 0.3, 3.2, (S.h / 3) * (i + 1), 0.32, { r: 0.04, tint: '#eef1f5' })
  // 骨組み（左右の塔＋上の梁）
  const top = 6.2
  for (const x of [S.x0 + 0.3, S.x1 - 0.3]) {
    fbox(c, c.fm.darkMetal, x, top / 2, S.z1 - 0.3, 0.4, top, 0.4, { r: 0.04 })
    c.col.box(x, top / 2, S.z1 - 0.3, 0.4, top, 0.4)
    // スピーカー
    fbox(c, c.fm.darkMetal, x, S.h + 0.75, S.z1 - 0.9, 0.9, 1.5, 0.8, { r: 0.08 })
  }
  fbox(c, c.fm.darkMetal, cx, top, S.z1 - 0.3, w, 0.4, 0.4, { r: 0.04 })
  bulbString(c, v(S.x0 + 0.3, top - 0.25, S.z1 - 0.1), v(S.x1 - 0.3, top - 0.25, S.z1 - 0.1), 0.35, 0.4, NEON.warm)
  // 太鼓
  for (const [x, z, r] of [
    [cx - 1.6, cz - 0.6, 0.55],
    [cx + 1.2, cz - 0.9, 0.42],
  ] as const) {
    c.b.add(new THREE.CylinderGeometry(r, r, r * 1.3, 20), c.m.lacquerRed, M(x, S.h + 0.35 + r * 0.65, z), { tint: '#ffffff' })
    for (const yy of [S.h + 0.35, S.h + 0.35 + r * 1.3]) c.b.add(new THREE.CylinderGeometry(r * 1.02, r * 1.02, 0.03, 20), c.m.plain, M(x, yy, z), { tint: '#f4ead6' })
    fbox(c, c.m.wood, x, S.h + 0.17, z, r * 1.6, 0.34, r * 1.2, { tint: '#a86a3a' })
  }
  // 背景のホロ
  holoSign(c, 'stage', cx, 3.4, S.z0 + 0.2, 6.8, 0)
  // 両脇の幟
  nobori(c, 'matsuri_v', S.x0 - 0.6, S.z1 + 0.6, 0, 3.4, 0.95)
  nobori(c, 'expo_v', S.x1 + 0.6 > F.PLAZA.x1 ? S.x1 - 0.6 : S.x1 + 0.6, S.z1 + 1.2, 0, 3.4, 0.95)
}

// ------------------------------------------------------------------ 南の避難ゲート

function southGate(c: FCtx): void {
  const G = F.SOUTH_GATE
  const z = G.z0 + 1.8
  const top = 6.6
  for (const x of [G.x0 - 0.5, G.x1 + 0.5]) {
    fbox(c, c.fm.panel, x, top / 2, z, 0.7, top, 0.7, { r: 0.18, tint: '#f4f6f8', texM: 2.2 })
    neon(c, v(x, 0.4, z - 0.36), v(x, top - 0.3, z - 0.36), 0.06, NEON.cyan)
    c.col.box(x, top / 2, z, 0.7, top, 0.7)
  }
  fbox(c, c.fm.panel, 0, top, z, G.x1 - G.x0 + 1.7, 0.7, 0.7, { r: 0.18, tint: '#f4f6f8', texM: 2.2 })
  holoSign(c, 'nanba_holo', 0, top + 1.2, z, 5.6, Math.PI)
  holoSign(c, 'nanba_holo', 0, top + 1.2, z + 0.02, 5.6, 0)
  holoSign(c, 'shelter', 0, top - 1.3, z - 0.4, 3.6, 0, true)
  for (let x = -4; x <= 4; x += 1.6) chochin(c, x, top - 0.75, z - 0.1, Math.round(x / 1.6) % 2 ? 'red' : 'white', 0.8)
}

// ------------------------------------------------------------------ 全体

export function buildFestival(c: FCtx, mods: FutureSceneMods = {}): void {
  plazaFloor(c, mods)
  walkways(c)
  arch(c)
  stalls(c)
  stage(c)
  southGate(c)

  // 広場を横切る提灯の連なり（西の回廊の手すり → 東のビル）
  for (const [z0, z1] of [
    [-9.5, -8.5],
    [-3.2, -2.2],
    [3.0, 4.2],
  ] as const) {
    lanternString(c, v(F.WALK_W.x1 + 0.05, F.WALK_Y + 1.6, z0), v(F.PLAZA.x1 - 0.1, 7.4, z1), 2.0, 1.3, 0.85, 4)
  }
  // 幟
  nobori(c, 'osaka_v', -12.9, 2.6, 0.5, 4.0, 1.25)
  nobori(c, 'ido_v', -4.4, -5.4, 0.2)
  nobori(c, 'expo_v', 11.8, -10.6, -0.2)
  nobori(c, 'expo_v', 11.8, 11.6, -0.1)
  nobori(c, 'matsuri_v', -6.4, 15.6, 0.3)
  nobori(c, 'matsuri_v', 6.4, 15.6, -0.3)
  nobori(c, 'ido_v', -15.0, 14.2, 0.6)
  // 案内のホロ
  holoPost(c, -4.6, 7.2, 2.3)
  holoSign(c, 'ido_arrow', -4.6, 2.75, 7.22, 1.7, 0.55)

  // 桜（白い丸い植え込み）と植え込み
  const sakura = (x: number, z: number, s: number, seed: number) => {
    c.b.add(new THREE.CylinderGeometry(1.45 * s, 1.6 * s, 0.55, 28), c.fm.plastic, M(x, 0.275, z), { tint: '#eef2f5' })
    c.b.add(new THREE.CylinderGeometry(1.3 * s, 1.3 * s, 0.05, 28), c.m.grass, M(x, 0.54, z), { tint: '#6c8a3a' })
    c.b.add(new THREE.TorusGeometry(1.52 * s, 0.025, 6, 48), c.fm.glow, M(x, 0.56, z, Math.PI / 2, 0, 0), { tint: NEON.pink, cast: false })
    c.foliage.cherry(x, 0.5, z, s, seed)
    c.col.box(x, 0.3, z, 2.6 * s, 0.6, 2.6 * s)
  }
  sakura(7.2, 9.6, 1.05, 21)
  sakura(-9.6, 10.6, 0.95, 22)
  sakura(13.4, 15.0, 0.9, 23)
  sakura(-14.6, -12.6, 0.85, 24)
  planter(c, -2.5, 12.6, 3.0, 1.0, 0, 0.5, 31)
  planter(c, 4.8, 13.4, 1.0, 2.6, 0, 0.5, 32)
  planter(c, 8.6, -5.2, 2.6, 1.0, 0, 0.5, 33, 0.6)

  // ベンチ（白）
  for (const [x, z, r] of [
    [-1.8, 9.4, 0.1],
    [10.2, 6.8, Math.PI / 2],
  ] as const) {
    fbox(c, c.fm.plastic, x, 0.42, z, 1.8, 0.1, 0.5, { rotY: r, r: 0.04, tint: '#f2f4f7' })
    for (const s of [-0.7, 0.7]) fbox(c, c.fm.darkMetal, x + Math.cos(r) * s, 0.2, z - Math.sin(r) * s, 0.08, 0.4, 0.42, { rotY: r, r: 0.02 })
    c.col.box(x, 0.25, z, 1.8, 0.5, 0.5, r)
  }

  // 広場の端の見えない壁（プレイ範囲）。北の通りは少しだけ入れる
  const P = F.PLAZA
  c.col.wall(P.x0, P.z1, F.SOUTH_GATE.x0, P.z1, -1, 8)
  c.col.wall(F.SOUTH_GATE.x1, P.z1, P.x1, P.z1, -1, 8)
  c.col.wall(F.SOUTH_GATE.x0 - 0.6, P.z1 + 3.2, F.SOUTH_GATE.x1 + 0.6, P.z1 + 3.2, -1, 8)
  c.col.wall(F.STREET.x0, mods.streetEndZ ?? -34, F.STREET.x1, mods.streetEndZ ?? -34, -1, 12)
  // 回廊の外（ビルの壁で止まるが、念のため）
  c.col.wall(P.x0, P.z0, P.x0, P.z1, -1, 12)
  c.col.wall(P.x1, P.z0, P.x1, P.z1, -1, 12)
}

/**
 * 広場の中央の「時の泉」：白い縁の丸い水盤、噴き上がる水、中央に回る輪（ポータルと同じ形）と EXPO の紋のホロ。
 * 回るもの（輪・紋）は別メッシュ。
 */
export function buildFountain(c: FCtx, root: THREE.Group): void {
  const x = 1.5
  const z = 1.5
  const R = 2.7
  // 水盤（外壁・底・縁）
  c.b.add(new THREE.CylinderGeometry(R, R + 0.08, 0.5, 56, 1, true), c.fm.plastic, M(x, 0.25, z), { tint: '#f1f4f7' })
  c.b.add(new THREE.CylinderGeometry(R - 0.22, R - 0.22, 0.42, 56, 1, true), c.fm.panel, M(x, 0.25, z), { tint: '#dfe8ef', uv: 'scale', uvScale: [8, 0.3] })
  c.b.add(new THREE.TorusGeometry(R - 0.11, 0.13, 10, 72), c.fm.plastic, M(x, 0.5, z, Math.PI / 2, 0, 0), { tint: '#f6f8fa' })
  c.b.add(new THREE.CircleGeometry(R - 0.2, 56), c.fm.navyGloss, M(x, 0.06, z, -Math.PI / 2, 0, 0), { tint: '#7fb0e0' })
  c.b.add(new THREE.TorusGeometry(R + 0.06, 0.025, 6, 96), c.fm.glow, M(x, 0.05, z, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false })
  // 中央の台座
  c.b.add(new THREE.CylinderGeometry(0.42, 0.55, 0.9, 28), c.fm.plastic, M(x, 0.45, z), { tint: '#eef2f5' })
  c.b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.04, 28), c.fm.glow, M(x, 0.91, z), { tint: NEON.pink, cast: false })
  // 当たり判定（八角形 ≒ 2 つの正方形）
  c.col.box(x, 0.3, z, R * 1.93, 0.6, R * 1.93)
  c.col.box(x, 0.3, z, R * 1.93, 0.6, R * 1.93, Math.PI / 4)
  // 水面（ゆっくり流れる法線）
  const wn = new THREE.CanvasTexture(paintWaterNormal(256))
  wn.wrapS = wn.wrapT = THREE.RepeatWrapping
  wn.repeat.set(2.5, 2.5)
  const water = new THREE.MeshStandardMaterial({ color: '#4fb6e6', roughness: 0.06, metalness: 0.2, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6 })
  const wm = new THREE.Mesh(new THREE.RingGeometry(0.5, R - 0.2, 56, 1), water)
  wm.rotation.x = -Math.PI / 2
  wm.position.set(x, 0.36, z)
  wm.receiveShadow = true
  root.add(wm)
  // 噴水（中央の柱と、縁から内向きの 8 本）
  const jets: Emitter[] = [{ pos: new THREE.Vector3(x, 0.95, z), spread: new THREE.Vector3(0.06, 0.02, 0.06), vel: new THREE.Vector3(0, 4.6, 0), velJitter: 0.35, count: 220, life: [0.7, 1.1], size: [0.12, 0.26], alpha: 0.85 }]
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    const px = x + Math.cos(a) * (R - 0.45)
    const pz = z + Math.sin(a) * (R - 0.45)
    jets.push({ pos: new THREE.Vector3(px, 0.42, pz), spread: new THREE.Vector3(0.03, 0.02, 0.03), vel: new THREE.Vector3(-Math.cos(a) * 1.25, 2.9, -Math.sin(a) * 1.25), velJitter: 0.12, count: 70, life: [0.75, 0.95], size: [0.08, 0.16], alpha: 0.8 })
  }
  root.add(createSpray(jets, 1.0, new THREE.Color(1.5, 1.65, 1.8), 31))
  // 回る輪と紋のホロ
  const ringG = new THREE.Group()
  ringG.position.set(x, 2.25, z)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.06, 10, 64), c.fm.metal)
  ring.castShadow = true
  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.02, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.8, 2.6) }))
  ringGlow.position.z = 0.065
  ringG.add(ring, ringGlow)
  const r = c.fm.atlases.holo.get('emblem')
  const em = new THREE.Mesh(atlasPlane(1.25, 1.25, r), c.fm.holo)
  em.renderOrder = 3
  const em2 = em.clone()
  em2.rotation.y = Math.PI
  ringG.add(em, em2)
  root.add(ringG)
  c.updaters.push((dt) => {
    ringG.rotation.y += dt * 0.5
    wn.offset.x += dt * 0.03
    wn.offset.y += dt * 0.017
  })
}
