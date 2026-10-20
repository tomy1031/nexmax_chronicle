// 祭りの地下通路（物語 v7 の 4 章：二度目の 10月18日、ネクマックスがかくれる所）。
// ・地上：北の通りの西側の入口（ガラスの屋根と「なんばウォーク」の看板）。階段で 4.4m 下へ
// ・地下：白いタイルの通路（祭りの日で閉まった店のシャッター・天井の光の板・案内板）。奥は工事中で通行止め
// ・小さな部屋（祭りの道具の倉庫）：通路の西の壁の戸口から。箱のかげにかくれる
// ・天井の穴：黒い手が地面をやぶって出てくる所（breach(k) でひびが広がり、穴があいて破片が落ちる）
// 当たり判定は町の ColliderList（固定）。地下の床は y=-4.4 なので、ステージは地下にいる間だけ落下の下限を下げる（layoutChronicle の chronicleKillY）。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { NEON, fbox, flightCase, neon, type FCtx } from '../kit2086'
import { UNDER } from './layoutChronicle'
import { additive, canvasTexture, clearGlass, font } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type UndergroundParts = {
  group: THREE.Group
  /** 天井がやぶれる（0：何もない、0〜0.6：ひびが広がる、1：穴があいて破片が落ちる） */
  breach(k: number): void
  /** ループの朝：天井を元に戻す */
  resetBreach(): void
  /** 通路の明かり（0..1。夜の停電の演出など） */
  setLights(k: number): void
  update(dt: number): void
}

// ------------------------------------------------------------------ 看板のアトラス（1 枚）

const SIGN_W = 1024
const SIGN_H = 1024
/** アトラスの区画（u0,v0,u1,v1） */
const SIGNS = {
  entrance: [0, 0.75, 1, 1],
  walk: [0, 0.5, 0.5, 0.75],
  closed: [0.5, 0.5, 1, 0.75],
  shopA: [0, 0.25, 0.333, 0.5],
  shopB: [0.333, 0.25, 0.666, 0.5],
  shopC: [0.666, 0.25, 1, 0.5],
  map: [0, 0, 0.5, 0.25],
  poster: [0.5, 0, 0.75, 0.25],
  storage: [0.75, 0, 1, 0.25],
} as const

function paintSigns(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h)
  const box = (key: keyof typeof SIGNS) => {
    const [u0, v0, u1, v1] = SIGNS[key]
    return { x: u0 * w, y: (1 - v1) * h, w: (u1 - u0) * w, h: (v1 - v0) * h }
  }
  const panel = (r: { x: number; y: number; w: number; h: number }, fill: string, edge: string) => {
    g.fillStyle = fill
    g.beginPath()
    g.roundRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12, 22)
    g.fill()
    g.lineWidth = 6
    g.strokeStyle = edge
    g.stroke()
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  // 入口の大看板
  {
    const r = box('entrance')
    panel(r, '#132a66', '#8fe6ff')
    g.fillStyle = '#ffffff'
    g.font = font(800, 86)
    g.fillText('地下通路　なんばウォーク', r.x + r.w / 2 - 40, r.y + r.h * 0.42)
    g.fillStyle = '#ffd98a'
    g.font = font(800, 44)
    g.fillText('B1　祭りの地下通路 ・ 駅へ', r.x + r.w / 2 - 40, r.y + r.h * 0.76)
    // 下向きの矢印
    g.fillStyle = '#8fe6ff'
    const ax = r.x + r.w - 110
    const ay = r.y + r.h / 2
    g.beginPath()
    g.moveTo(ax - 40, ay - 30)
    g.lineTo(ax + 40, ay - 30)
    g.lineTo(ax, ay + 44)
    g.closePath()
    g.fill()
  }
  {
    const r = box('walk')
    panel(r, '#ffffff', '#1d3a8a')
    g.fillStyle = '#1d3a8a'
    g.font = font(800, 64)
    g.fillText('なんばウォーク', r.x + r.w / 2, r.y + r.h * 0.42)
    g.font = font(700, 30)
    g.fillStyle = '#4a5a8a'
    g.fillText('NANBA WALK  B1', r.x + r.w / 2, r.y + r.h * 0.74)
  }
  {
    const r = box('closed')
    panel(r, '#ffd23a', '#2a2a2a')
    g.fillStyle = '#1a1a1a'
    g.font = font(800, 62)
    g.fillText('この先 工事中', r.x + r.w / 2, r.y + r.h * 0.4)
    g.font = font(800, 40)
    g.fillText('通り抜けできません', r.x + r.w / 2, r.y + r.h * 0.72)
  }
  const shop = (key: 'shopA' | 'shopB' | 'shopC', name: string, color: string) => {
    const r = box(key)
    panel(r, color, '#ffffff')
    g.fillStyle = '#ffffff'
    g.font = font(800, 58)
    g.fillText(name, r.x + r.w / 2, r.y + r.h * 0.42)
    g.font = font(700, 26)
    g.fillText('本日は お祭りのため お休み', r.x + r.w / 2, r.y + r.h * 0.75)
  }
  shop('shopA', 'たいやき', '#d9534f')
  shop('shopB', '時計と部品', '#3a6fd8')
  shop('shopC', 'おもちゃ', '#2fb37a')
  {
    const r = box('map')
    panel(r, '#f4f7fb', '#1d3a8a')
    g.fillStyle = '#1d3a8a'
    g.font = font(800, 34)
    g.fillText('案内図', r.x + 80, r.y + 44)
    g.strokeStyle = '#3a6fd8'
    g.lineWidth = 10
    g.beginPath()
    g.moveTo(r.x + 60, r.y + r.h - 50)
    g.lineTo(r.x + r.w * 0.45, r.y + r.h - 50)
    g.lineTo(r.x + r.w * 0.45, r.y + 90)
    g.lineTo(r.x + r.w - 60, r.y + 90)
    g.stroke()
    g.fillStyle = '#e0566f'
    g.beginPath()
    g.arc(r.x + r.w * 0.45, r.y + r.h - 50, 14, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#1d3a8a'
    g.font = font(700, 24)
    g.fillText('いまここ', r.x + r.w * 0.45 + 70, r.y + r.h - 50)
    g.fillText('時計台', r.x + r.w - 100, r.y + 60)
  }
  {
    const r = box('poster')
    const gr = g.createLinearGradient(r.x, r.y, r.x, r.y + r.h)
    gr.addColorStop(0, '#2a3a9a')
    gr.addColorStop(1, '#ff8fb8')
    g.fillStyle = gr
    g.fillRect(r.x + 10, r.y + 10, r.w - 20, r.h - 20)
    g.fillStyle = '#ffffff'
    g.font = font(800, 40)
    g.fillText('時代博覧祭', r.x + r.w / 2, r.y + r.h * 0.35)
    g.font = font(700, 26)
    g.fillText('10月18日・19日', r.x + r.w / 2, r.y + r.h * 0.62)
    g.fillText('ナンバタウン', r.x + r.w / 2, r.y + r.h * 0.8)
  }
  {
    const r = box('storage')
    panel(r, '#e8ecf2', '#6a7590')
    g.fillStyle = '#3a4562'
    g.font = font(800, 40)
    g.fillText('祭り 倉庫', r.x + r.w / 2, r.y + r.h * 0.42)
    g.font = font(700, 22)
    g.fillText('関係者以外 立入禁止', r.x + r.w / 2, r.y + r.h * 0.72)
  }
}

/** アトラスの区画を貼った板（正面の法線 yaw） */
function signPlane(key: keyof typeof SIGNS, w: number, h: number): THREE.PlaneGeometry {
  const [u0, v0, u1, v1] = SIGNS[key]
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0)
  return g
}

/** ひびのテクスチャ（天井の穴） */
function paintCrack(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  let seed = 7
  const rnd = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  g.strokeStyle = 'rgba(255,255,255,1)'
  g.lineCap = 'round'
  for (let i = 0; i < 14; i++) {
    let a = (i / 14) * Math.PI * 2 + rnd() * 0.3
    let x = cx
    let y = cy
    let r = 0
    g.lineWidth = 7
    g.beginPath()
    g.moveTo(x, y)
    while (r < w * 0.48) {
      const step = 14 + rnd() * 22
      a += (rnd() - 0.5) * 0.7
      x += Math.cos(a) * step
      y += Math.sin(a) * step
      r = Math.hypot(x - cx, y - cy)
      g.lineTo(x, y)
      g.lineWidth = Math.max(1.5, 7 * (1 - r / (w * 0.5)))
    }
    g.stroke()
  }
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.2)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
}

export function buildUnderground(c: FCtx, root: THREE.Group): UndergroundParts {
  const U = UNDER
  const group = new THREE.Group()
  group.name = 'underground'
  root.add(group)
  const F0 = U.floorY
  const C0 = U.ceilY
  const H = C0 - F0
  const signTex = canvasTexture(SIGN_W, SIGN_H, paintSigns, 8)
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.55, roughness: 0.45, transparent: true, alphaTest: 0.3 })
  signMat.name = 'chronicle-underSigns'
  const signs = new THREE.Group()
  signs.name = 'under_signs'
  group.add(signs)
  const addSign = (key: keyof typeof SIGNS, w: number, h: number, pos: THREE.Vector3, yaw: number) => {
    const m = new THREE.Mesh(signPlane(key, w, h), signMat)
    m.position.copy(pos)
    m.rotation.y = yaw
    signs.add(m)
  }

  // ================================================================== 地上の入口
  const K = U.kiosk
  const hole = U.hole
  {
    const kx = (K.x0 + K.x1) / 2
    // 床のふち（穴のまわりの白い縁石と、光る線）
    for (const x of [hole.x0 - 0.12, hole.x1 + 0.12]) fbox(c, c.fm.plastic, x, 0.06, (hole.z0 + hole.z1) / 2, 0.24, 0.12, hole.z1 - hole.z0, { r: 0.04, tint: '#eef2f6' })
    // 左右のガラスの壁（白い枠）と、奥の壁
    for (const x of [K.x0 + 0.06, K.x1 - 0.06]) {
      fbox(c, clearGlass(), x, 1.35, (K.z0 + 0.6 + K.z1) / 2, 0.06, 2.3, K.z1 - K.z0 - 0.9, { r: 0.02, cast: false })
      fbox(c, c.fm.plastic, x, 2.6, (K.z0 + K.z1) / 2, 0.16, 0.2, K.z1 - K.z0, { r: 0.05, tint: '#ffffff' })
      fbox(c, c.fm.plastic, x, 0.15, (K.z0 + K.z1) / 2, 0.16, 0.3, K.z1 - K.z0, { r: 0.05, tint: '#ffffff' })
      for (let z = K.z0 + 0.1; z <= K.z1 + 0.01; z += (K.z1 - K.z0 - 0.2) / 4) fbox(c, c.fm.plastic, x, 1.35, z, 0.12, 2.7, 0.12, { r: 0.03, tint: '#ffffff' })
      c.col.box(x, 1.45, (K.z0 + K.z1) / 2, 0.16, 2.9, K.z1 - K.z0)
      neon(c, v(x, 0.32, K.z0), v(x, 0.32, K.z1), 0.035, NEON.cyan)
    }
    fbox(c, c.fm.plastic, kx, 1.45, K.z0 + 0.08, K.x1 - K.x0, 2.9, 0.16, { r: 0.05, tint: '#eef2f6' })
    c.col.box(kx, 1.45, K.z0 + 0.08, K.x1 - K.x0, 2.9, 0.16)
    // 屋根（ゆるい弧のガラス＋白い縁）
    const R = 3.2
    const roof = new THREE.CylinderGeometry(R, R, K.z1 - K.z0 + 0.4, 18, 1, true, -0.45, 0.9)
    roof.rotateX(Math.PI / 2)
    c.b.add(roof, clearGlass(), M(kx, K.h - R + 0.25, (K.z0 + K.z1) / 2), { cast: false })
    // 屋根の骨（白い弧を等間隔に）
    for (let z = K.z0 + 1.2; z < K.z1 - 0.5; z += 1.6) c.b.add(new THREE.TorusGeometry(R, 0.035, 5, 14, 0.9), c.fm.plastic, M(kx, K.h - R + 0.25, z, 0, 0, Math.PI / 2 - 0.45), { tint: '#ffffff' })
    for (const z of [K.z0 - 0.15, K.z1 + 0.15]) c.b.add(new THREE.TorusGeometry(R, 0.07, 6, 18, 0.9), c.fm.plastic, M(kx, K.h - R + 0.25, z, 0, 0, Math.PI / 2 - 0.45), { tint: '#ffffff' })
    c.b.add(rbox(K.x1 - K.x0 + 0.3, 0.12, 0.25, 0.04), c.fm.plastic, M(kx, K.h + 0.22, K.z1 + 0.15), { tint: '#ffffff' })
    neon(c, v(K.x0 - 0.1, K.h + 0.12, K.z1 + 0.3), v(K.x1 + 0.1, K.h + 0.12, K.z1 + 0.3), 0.04, NEON.cyan)
    // 正面の看板（屋根の上）
    addSign('entrance', 2.8, 0.7, v(kx, K.h + 0.75, K.z1 + 0.2), 0)
    // 案内の柱（通りから見える）
    fbox(c, c.fm.darkMetal, K.x1 + 0.45, 1.3, K.z1 - 0.2, 0.12, 2.6, 0.12, { r: 0.03 })
    addSign('walk', 1.0, 0.5, v(K.x1 + 0.45, 2.7, K.z1 - 0.13), 0)
    c.lights.push({ pos: v(kx, 2.4, K.z1 - 0.8), color: '#cfe8ff', intensity: 2.2, dist: 7 })
  }

  // ================================================================== 階段
  {
    const top = hole.z1
    const bot = hole.z0
    const rise = 0 - F0
    const run = top - bot
    const n = 26
    const sx = (hole.x0 + hole.x1) / 2
    const sw = hole.x1 - hole.x0
    for (let i = 0; i < n; i++) {
      // 段 i の上面は鼻（手前の縁）の高さ。鼻を結ぶ線が坂の当たり判定
      const yTop = -(i / n) * rise
      const z0 = top - (i / n) * run
      const z1 = top - ((i + 1) / n) * run
      c.b.add(rbox(sw - 0.04, 0.18, z0 - z1 + 0.02, 0.02), c.fm.panel, M(sx, yTop - 0.09, (z0 + z1) / 2), { tint: '#d8dce4', texM: 1.5 })
      // 段の鼻（黄色い滑り止め）
      c.b.add(new THREE.BoxGeometry(sw - 0.1, 0.02, 0.05), c.fm.glow, M(sx, yTop + 0.005, z0 - 0.04), { tint: new THREE.Color(1.6, 1.3, 0.3), cast: false })
    }
    // 坂の当たり判定（段の鼻を結ぶ面を半段だけ上げる：足が段に沈みすぎないように）
    const ang = Math.atan2(rise, run)
    const len = Math.hypot(rise, run)
    c.col.box(sx, -rise / 2 + rise / (2 * n) - 0.1 * Math.cos(ang), (top + bot) / 2 + 0.1 * Math.sin(ang), sw, 0.2, len, 0, -ang)
    // 両側の壁（地下）と手すり
    for (const [x, s] of [
      [hole.x0 - 0.1, 1],
      [hole.x1 + 0.1, -1],
    ] as const) {
      fbox(c, c.fm.plastic, x, (F0 + 0) / 2, (top + bot) / 2, 0.2, rise, run, { r: 0.03, tint: '#eef2f6' })
      c.col.box(x, (F0 + 0) / 2, (top + bot) / 2, 0.2, rise + 0.02, run)
      const a = v(x + s * 0.14, 0.95, top)
      const b = v(x + s * 0.14, F0 + 0.95, bot)
      const len2 = a.distanceTo(b)
      c.b.add(new THREE.CylinderGeometry(0.035, 0.035, len2, 8), c.fm.metal, new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize()), v(1, 1, 1)))
      neon(c, v(x + s * 0.11, 0.2, top), v(x + s * 0.11, F0 + 0.2, bot), 0.03, NEON.cyan)
    }
    // 階段の上の天井（地下の入口の梁）
    fbox(c, c.fm.plastic, sx, C0 - 0.15, bot + 0.2, sw + 0.4, 0.3, 0.4, { r: 0.04, tint: '#ffffff' })
  }

  // ================================================================== 通路
  const P = U.passage
  const px = (P.x0 + P.x1) / 2
  const pz = (P.z0 + P.z1) / 2
  const PW = P.x1 - P.x0
  const PD = P.z1 - P.z0
  {
    // 床（灰色のタイル＋黄色の点字ブロックの線）・天井
    c.b.add(new THREE.PlaneGeometry(PW, PD), c.fm.panel, M(px, F0 + 0.002, pz, -Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [PW / 1.2, PD / 1.2], tint: '#c9ced8' })
    c.col.floor(P.x0 - 0.3, P.x1 + 0.3, P.z0 - 0.3, P.z1 + 0.3, F0, 1)
    c.b.add(new THREE.BoxGeometry(0.3, 0.012, PD - 1), c.m.plain, M(P.x1 - 1.4, F0 + 0.008, pz), { tint: '#f2c230' })
    c.b.add(new THREE.PlaneGeometry(PW, PD), c.fm.panel, M(px, C0 - 0.005, pz, Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [PW / 1.5, PD / 1.5], tint: '#e3e7ee' })
    // 壁：東（店のシャッター）・西（倉庫の戸口）・北（通行止め）・南（階段の口の両わき）
    const wall = (x0: number, x1: number, z0: number, z1: number, tint = '#eef1f5') => {
      fbox(c, c.fm.plastic, (x0 + x1) / 2, (F0 + C0) / 2, (z0 + z1) / 2, Math.max(0.2, x1 - x0), H, Math.max(0.2, z1 - z0), { r: 0.02, tint })
      c.col.box((x0 + x1) / 2, (F0 + C0) / 2, (z0 + z1) / 2, Math.max(0.2, x1 - x0), H, Math.max(0.2, z1 - z0))
    }
    wall(P.x1, P.x1 + 0.2, P.z0, P.z1)
    wall(P.x0 - 0.2, P.x0, P.z0, U.door.z0)
    wall(P.x0 - 0.2, P.x0, U.door.z1, P.z1)
    wall(P.x0, P.x1, P.z0 - 0.2, P.z0, '#e6e9ee')
    wall(P.x0, hole.x0 - 0.2, P.z1, P.z1 + 0.2)
    wall(hole.x1 + 0.2, P.x1, P.z1, P.z1 + 0.2)
    // 壁の下の光る線（通路の向きが分かるように）
    neon(c, v(P.x1 - 0.01, F0 + 0.12, P.z0), v(P.x1 - 0.01, F0 + 0.12, P.z1), 0.04, NEON.cyan)
    neon(c, v(P.x0 + 0.01, F0 + 0.12, P.z0), v(P.x0 + 0.01, F0 + 0.12, U.door.z0), 0.04, NEON.cyan)
    neon(c, v(P.x0 + 0.01, F0 + 0.12, U.door.z1), v(P.x0 + 0.01, F0 + 0.12, P.z1), 0.04, NEON.cyan)
    // 東の壁：閉まった店のシャッター 3 つと看板
    const shops = ['shopA', 'shopB', 'shopC'] as const
    shops.forEach((key, i) => {
      const z = P.z1 - 2.4 - i * 3.6
      fbox(c, c.fm.metal, P.x1 - 0.06, F0 + 1.25, z, 0.08, 2.5, 2.8, { r: 0.02, tint: '#b8c0cc' })
      for (let k = 0; k < 12; k++) c.b.add(new THREE.BoxGeometry(0.03, 0.03, 2.78), c.fm.darkMetal, M(P.x1 - 0.11, F0 + 0.2 + k * 0.2, z), { cast: false })
      addSign(key, 2.4, 0.6, v(P.x1 - 0.04, F0 + 2.85, z), -Math.PI / 2)
    })
    // 北の行き止まり：工事中の柵と看板
    fbox(c, c.fm.metal, px, F0 + 1.3, P.z0 + 0.06, PW - 0.4, 2.6, 0.08, { r: 0.02, tint: '#9aa3b2' })
    for (let k = 0; k < 13; k++) c.b.add(new THREE.BoxGeometry(PW - 0.42, 0.03, 0.03), c.fm.darkMetal, M(px, F0 + 0.2 + k * 0.2, P.z0 + 0.12), { cast: false })
    addSign('closed', 1.8, 0.62, v(px, F0 + 1.5, P.z0 + 0.5), 0)
    for (const s of [-1, 1]) {
      // 工事中の柵（黄黒）
      c.b.add(rbox(1.4, 0.12, 0.08, 0.02), c.m.plain, M(px + s * 1.4, F0 + 0.75, P.z0 + 0.7), { tint: '#f2c230' })
      c.b.add(rbox(0.08, 0.9, 0.08, 0.02), c.fm.darkMetal, M(px + s * 1.4 - 0.6, F0 + 0.45, P.z0 + 0.7))
      c.b.add(rbox(0.08, 0.9, 0.08, 0.02), c.fm.darkMetal, M(px + s * 1.4 + 0.6, F0 + 0.45, P.z0 + 0.7))
    }
    c.col.box(px, F0 + 0.5, P.z0 + 0.7, PW, 1.0, 0.2)
    // 西の壁：倉庫の戸口（枠と表札）・案内図・ポスター
    fbox(c, c.fm.darkMetal, P.x0 + 0.02, F0 + 1.15, U.door.z0 - 0.06, 0.24, 2.3, 0.12, { r: 0.02 })
    fbox(c, c.fm.darkMetal, P.x0 + 0.02, F0 + 1.15, U.door.z1 + 0.06, 0.24, 2.3, 0.12, { r: 0.02 })
    fbox(c, c.fm.darkMetal, P.x0 + 0.02, F0 + 2.36, (U.door.z0 + U.door.z1) / 2, 0.24, 0.12, U.door.z1 - U.door.z0 + 0.24, { r: 0.02 })
    addSign('storage', 1.0, 0.5, v(P.x0 + 0.03, F0 + 2.75, (U.door.z0 + U.door.z1) / 2), Math.PI / 2)
    addSign('map', 2.2, 1.1, v(P.x0 + 0.03, F0 + 1.6, P.z1 - 2.6), Math.PI / 2)
    addSign('poster', 0.9, 1.25, v(P.x0 + 0.03, F0 + 1.55, U.door.z0 - 1.6), Math.PI / 2)
    // 天井の光の板（夜も灯っている。setLights で弱める）と、吊り看板
    for (let z = P.z1 - 1.6; z > P.z0 + 0.8; z -= 2.6) c.b.add(new THREE.BoxGeometry(1.6, 0.04, 0.5), c.fm.glow, M(px, C0 - 0.03, z), { tint: NEON.white, cast: false })
    fbox(c, c.fm.darkMetal, px, C0 - 0.3, P.z1 - 4.8, 0.06, 0.5, 0.06, { r: 0.01 })
    addSign('walk', 1.4, 0.7, v(px, C0 - 0.85, P.z1 - 4.8), 0)
    addSign('walk', 1.4, 0.7, v(px, C0 - 0.85, P.z1 - 4.81), Math.PI)
    // ベンチと自販機
    fbox(c, c.fm.plastic, P.x0 + 0.45, F0 + 0.42, U.door.z1 + 2.6, 0.5, 0.08, 1.6, { r: 0.03, tint: '#ffffff' })
    for (const s of [-0.6, 0.6]) fbox(c, c.fm.darkMetal, P.x0 + 0.45, F0 + 0.2, U.door.z1 + 2.6 + s, 0.42, 0.4, 0.08, { r: 0.02 })
    c.col.box(P.x0 + 0.45, F0 + 0.25, U.door.z1 + 2.6, 0.5, 0.5, 1.6)
    fbox(c, c.fm.plastic, P.x1 - 0.5, F0 + 0.95, P.z0 + 2.2, 0.8, 1.9, 1.0, { r: 0.06, tint: '#e0566f' })
    c.b.add(new THREE.PlaneGeometry(0.7, 0.9), c.fm.glow, M(P.x1 - 0.905, F0 + 1.25, P.z0 + 2.2, 0, -Math.PI / 2, 0), { tint: new THREE.Color(1.6, 1.8, 2.0), cast: false })
    c.col.box(P.x1 - 0.5, F0 + 0.95, P.z0 + 2.2, 0.8, 1.9, 1.0)
    for (let z = P.z1 - 3; z > P.z0; z -= 4.5) c.lights.push({ pos: v(px, C0 - 0.4, z), color: '#e8f2ff', intensity: 2.2, dist: 7 })
  }

  // ================================================================== 小さな部屋（祭りの倉庫）
  const R = U.room
  {
    const rx = (R.x0 + R.x1) / 2
    const rz = (R.z0 + R.z1) / 2
    const RW = R.x1 - R.x0
    const RD = R.z1 - R.z0
    c.b.add(new THREE.PlaneGeometry(RW, RD), c.m.planks, M(rx, F0 + 0.003, rz, -Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [RW / 2, RD / 2], tint: '#b9a487' })
    c.col.floor(R.x0 - 0.3, R.x1, R.z0 - 0.3, R.z1 + 0.3, F0, 1)
    c.b.add(new THREE.PlaneGeometry(RW, RD), c.fm.panel, M(rx, C0 - 0.005, rz, Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [RW / 1.5, RD / 1.5], tint: '#cfd3da' })
    const wall = (x0: number, x1: number, z0: number, z1: number) => {
      fbox(c, c.fm.plastic, (x0 + x1) / 2, (F0 + C0) / 2, (z0 + z1) / 2, x1 - x0, H, z1 - z0, { r: 0.02, tint: '#dfe3e9' })
      c.col.box((x0 + x1) / 2, (F0 + C0) / 2, (z0 + z1) / 2, x1 - x0, H, z1 - z0)
    }
    wall(R.x0 - 0.2, R.x0, R.z0, R.z1)
    wall(R.x0 - 0.2, R.x1 - 0.2, R.z0 - 0.2, R.z0)
    wall(R.x0 - 0.2, R.x1 - 0.2, R.z1, R.z1 + 0.2)
    // 祭りの道具の箱（フライトケース）の山。奥の山のかげがかくれる所
    flightCase(c, R.x0 + 0.8, F0, R.z0 + 2.4, 1.2, 0.9, 0.9, 0.1)
    flightCase(c, R.x0 + 0.85, F0 + 0.9, R.z0 + 2.4, 1.0, 0.8, 0.8, -0.15)
    flightCase(c, R.x0 + 2.2, F0, R.z0 + 2.1, 1.1, 1.0, 0.8, 0.3)
    flightCase(c, R.x1 - 1.0, F0, R.z1 - 0.7, 1.3, 0.9, 0.9, 0)
    flightCase(c, R.x1 - 1.0, F0 + 0.9, R.z1 - 0.7, 1.1, 0.7, 0.8, 0.2)
    flightCase(c, R.x0 + 0.8, F0, R.z1 - 0.8, 1.0, 1.1, 0.9, -0.2)
    // 畳んだテントと、消えた提灯の箱
    fbox(c, c.fm.plastic, R.x1 - 2.6, F0 + 0.25, R.z1 - 0.6, 2.2, 0.5, 0.6, { r: 0.12, tint: '#f6f6f2' })
    c.col.box(R.x1 - 2.6, F0 + 0.25, R.z1 - 0.6, 2.2, 0.5, 0.6)
    for (let i = 0; i < 4; i++) c.b.add(new THREE.SphereGeometry(0.2, 10, 8), c.fm.lantern, M(R.x0 + 1.6 + i * 0.42, F0 + 0.2, R.z0 + 0.5, 0, i, 0, 1, 1.25, 1), { cast: false })
    // 天井の裸電球（暖色）
    c.b.add(new THREE.CylinderGeometry(0.008, 0.008, 0.5, 4), c.fm.rubber, M(rx, C0 - 0.25, rz))
    c.b.add(new THREE.SphereGeometry(0.09, 12, 8), c.fm.glow, M(rx, C0 - 0.55, rz), { tint: NEON.warm, cast: false })
    c.lights.push({ pos: v(rx, C0 - 0.6, rz), color: '#ffb466', intensity: 2.0, dist: 6 })
  }

  // ================================================================== 天井の穴（黒い手が出てくる所）
  const HH = U.handHole
  const crackTex = canvasTexture(512, 512, paintCrack)
  const crackMat = additive(new THREE.Color(1.6, 0.35, 1.4), 0, crackTex)
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), crackMat)
  crack.position.set(HH.x, C0 - 0.012, HH.z)
  crack.rotation.x = Math.PI / 2
  crack.renderOrder = 5
  crack.visible = false
  group.add(crack)
  // 穴（天井の板の厚みの暗い筒と、奥にうすく光る紫）
  const holeMat = new THREE.MeshBasicMaterial({ color: '#0b0614', transparent: true, opacity: 0, side: THREE.BackSide, fog: false })
  const holeMesh = new THREE.Group()
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.72, 0.95, 14, 1, true), holeMat)
  tube.position.y = 0.47
  const deep = new THREE.Mesh(new THREE.CircleGeometry(0.75, 16), additive(new THREE.Color(0.9, 0.2, 1.4), 0.9))
  deep.rotation.x = Math.PI / 2
  deep.position.y = 0.9
  const rim = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 14), new THREE.MeshBasicMaterial({ color: '#1a1022', side: THREE.DoubleSide, fog: false }))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.005
  holeMesh.add(tube, deep, rim)
  holeMesh.position.set(HH.x, C0 - 0.02, HH.z)
  holeMesh.renderOrder = 6
  holeMesh.visible = false
  group.add(holeMesh)
  // 落ちる破片（天井の板のかけら）
  const N = 18
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.06, 0.18), c.fm.panel, N)
  debris.name = 'under_debris'
  debris.visible = false
  debris.frustumCulled = false
  group.add(debris)
  const pieces = Array.from({ length: N }, (_, i) => ({ p: v(0, 0, 0), vel: v(0, 0, 0), rot: v(i * 1.3, i * 0.7, 0), spin: v(3 + (i % 5), 2 + (i % 3), 4) }))
  let debrisT = -1
  const dummy = new THREE.Object3D()
  let breachK = 0

  return {
    group,
    breach(k: number) {
      const prev = breachK
      breachK = Math.max(0, Math.min(1, k))
      crack.visible = breachK > 0.01
      crack.scale.setScalar(0.25 + 0.75 * Math.min(1, breachK / 0.6))
      crackMat.opacity = Math.min(1, breachK * 2.2)
      holeMesh.visible = breachK > 0.6
      holeMat.opacity = Math.min(1, (breachK - 0.6) / 0.25)
      holeMesh.scale.setScalar(0.3 + 0.7 * Math.min(1, (breachK - 0.6) / 0.4))
      if (prev <= 0.6 && breachK > 0.6) {
        // 穴があいた瞬間に破片を落とす
        debrisT = 0
        debris.visible = true
        pieces.forEach((pc, i) => {
          const a = (i / N) * Math.PI * 2
          const r = 0.2 + (i % 4) * 0.15
          pc.p.set(HH.x + Math.cos(a) * r, C0 - 0.1, HH.z + Math.sin(a) * r)
          pc.vel.set(Math.cos(a) * (0.6 + (i % 3) * 0.4), -0.5 - (i % 4) * 0.4, Math.sin(a) * (0.6 + (i % 2) * 0.5))
        })
      }
    },
    resetBreach() {
      breachK = 0
      crack.visible = false
      holeMesh.visible = false
      debris.visible = false
      debrisT = -1
    },
    setLights(k: number) {
      signMat.emissiveIntensity = 0.55 * k
    },
    update(dt: number) {
      if (debrisT < 0) return
      debrisT += dt
      pieces.forEach((pc, i) => {
        if (pc.p.y > F0 + 0.04) {
          pc.vel.y -= 14 * dt
          pc.p.addScaledVector(pc.vel, dt)
          pc.rot.addScaledVector(pc.spin, dt)
        } else {
          pc.p.y = F0 + 0.03
          pc.vel.set(0, 0, 0)
        }
        dummy.position.copy(pc.p)
        dummy.rotation.set(pc.rot.x, pc.rot.y, pc.rot.z)
        dummy.updateMatrix()
        debris.setMatrixAt(i, dummy.matrix)
      })
      debris.instanceMatrix.needsUpdate = true
    },
  }
}
