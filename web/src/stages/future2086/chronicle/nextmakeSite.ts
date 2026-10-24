// NEXTMAKE の跡地（路地のあと。物語 v7 の 8・10 章・おわりに）。歴史が 2 つあり、切り替えられる。
// ・building（はじめの歴史）：2027 年にほこらを取りこわして建てた NEXTMAKE 新館（高さ 38m のビル）
// ・courtyard（社長がほこらを守った歴史）：NEXTMAKE の古い建物（2026 年の本社。東の棟・北の棟）と、その中庭。
//   中庭には東を向いた時の神さまのほこら（shrine.ts）、ほこらの屋根の上のからくり時計、古いからくり飾りの大歯車、
//   北の棟の縁側、ゆらぎ（裂くと裏側の足場が見える）、ソラの工具箱が落ちる縁側
// ・どちらの歴史でも通りに立つ、60 年前からの古い石のかんばん
// setVariant で見た目と当たり判定を切り替え、ghostSwap は「変わる前の景色」を青い記憶として一瞬重ねてからほどく
// （変わる前を覚えているのはネクマックスだけ）。当たり判定は SwitchColliders の組 'site_building'・'site_courtyard'・'site_ura'。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { uTime } from '../../../render/materials'
import type { QualitySettings } from '../../../render/quality'
import { woodBox, WOOD } from '../../../world/edo/kit'
import { building } from '../buildings2086'
import { NEON, chochin, fbox, vine, type FCtx } from '../kit2086'
import type { FutureScene } from '../scene'
import { SITE } from './layoutChronicle'
import { additive, canvasTexture, createGhostMaterial, createSeamMaterial, finishCtx, font, makeCtx, newColliders, softDotTexture } from './kitChronicle'
import { buildShrine, type ShrineParts } from './shrine'
import type { Mover, SwitchColliders } from './switchColliders'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type SiteVariant = 'building' | 'courtyard'

export type ToolboxState = 'held' | 'falling' | 'frozen' | 'ground'

export type NextmakeSite = {
  group: THREE.Group
  readonly variant: SiteVariant
  /** 見た目と当たり判定をすぐに切り替える */
  setVariant(v: SiteVariant): void
  /** 切り替える。変わる前の景色を半透明で重ねて、下からほどけて消える（秒）。終わると resolve */
  ghostSwap(to: SiteVariant, seconds?: number): Promise<void>
  readonly ghosting: boolean
  shrine: ShrineParts
  kanban: { plate: THREE.Vector3; stand: THREE.Vector3; setSurge(k: number): void }
  gear: {
    /** 狙う点（軸の中心） */
    point: THREE.Vector3
    readonly frozen: boolean
    /** 止める／動かす。snap=true なら止めるとき一番上の歯をまっすぐ上に合わせる（足場にしやすく） */
    freeze(on: boolean, snap?: boolean): void
    /** いま一番上にある歯の上面の中心 */
    topTooth(out?: THREE.Vector3): THREE.Vector3
  }
  /** ゆらぎ（うすく光る縦のすじ）の見え方 0..1 */
  setSeam(k: number): void
  seamPoint: THREE.Vector3
  /** 裏側の足場（0..1。0.5 を超えると乗れる） */
  setUra(k: number): void
  toolbox: {
    /** 狙う点（いまの工具箱の位置） */
    point: THREE.Vector3
    readonly state: ToolboxState
    reset(): void
    /** ソラの手からすべり落ちる（slow：2 回まちがえたあとの、もっとゆっくりの落ち方） */
    drop(slow?: boolean): void
    freeze(on: boolean): void
  }
  /** からくり時計の足場の上面の中心（練習のゴール） */
  goal: THREE.Vector3
  update(dt: number): void
}

// ------------------------------------------------------------------ 古い石のかんばん

function paintPlate(g: CanvasRenderingContext2D, w: number, h: number): void {
  // 60 年たったブロンズ（緑青）
  const gr = g.createLinearGradient(0, 0, w, h)
  gr.addColorStop(0, '#7a6a48')
  gr.addColorStop(1, '#5b5238')
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(90, 160, 130, ${0.08 + (i % 7) * 0.02})`
    g.beginPath()
    g.arc((i * 73) % w, (i * 151) % h, 6 + (i % 5) * 4, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = '#d8c48a'
  g.lineWidth = 6
  g.strokeRect(10, 10, w - 20, h - 20)
  g.fillStyle = '#f0e2b0'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(800, 64)
  g.fillText('IDO', w / 2, 70)
  g.font = font(700, 24)
  g.fillText('IDOのかんばん', w / 2, 118)
  // 古い QR
  const s = 150
  const x0 = (w - s) / 2
  const y0 = 150
  g.fillStyle = '#efe4c2'
  g.fillRect(x0 - 8, y0 - 8, s + 16, s + 16)
  let seed = 2026
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  g.fillStyle = '#2a2418'
  const n = 21
  const cell = s / n
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (rnd() < 0.45) g.fillRect(x0 + i * cell, y0 + j * cell, cell, cell)
  for (const [fx, fy] of [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ]) {
    g.fillStyle = '#2a2418'
    g.fillRect(x0 + fx * cell, y0 + fy * cell, cell * 7, cell * 7)
    g.fillStyle = '#efe4c2'
    g.fillRect(x0 + (fx + 1) * cell, y0 + (fy + 1) * cell, cell * 5, cell * 5)
    g.fillStyle = '#2a2418'
    g.fillRect(x0 + (fx + 2) * cell, y0 + (fy + 2) * cell, cell * 3, cell * 3)
  }
  g.fillStyle = '#f0e2b0'
  g.font = font(800, 26)
  g.fillText('NEXTMAKE', w / 2, h - 70)
  g.font = font(700, 20)
  g.fillText('2026', w / 2, h - 38)
}

function buildKanban(c: FCtx, group: THREE.Group) {
  const K = SITE.kanban
  const p = K.pos
  const rotY = K.yaw
  const toWorld = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), rotY), v(1, 1, 1))
  // 台石・本体（2026 年の石標と同じ形。60 年分くすんで、足元に苔）
  c.b.add(rbox(1.2, 0.18, 0.9, 0.03), c.m.stoneWall, M(p.x, 0.09, p.z, 0, rotY, 0), { texM: 1, tint: '#a8a49a' })
  const shape = new THREE.Shape()
  shape.moveTo(-0.28, 0)
  shape.lineTo(0.3, 0)
  shape.lineTo(0.12, 1.15)
  shape.lineTo(-0.2, 1.22)
  shape.lineTo(-0.28, 1.12)
  shape.closePath()
  const body = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 })
  body.rotateY(-Math.PI / 2)
  body.translate(0.4, 0.18, 0)
  body.applyMatrix4(toWorld)
  c.b.add(body, c.m.stoneWall, undefined, { texM: 0.9, tint: '#9c978c' })
  for (const [lx, lz, s] of [
    [-0.45, 0.32, 0.2],
    [0.42, -0.3, 0.16],
    [0.2, 0.38, 0.12],
  ] as const) {
    const q = v(lx, 0.2, lz).applyMatrix4(toWorld)
    c.b.add(new THREE.SphereGeometry(s, 8, 5), c.m.grass, M(q.x, q.y, q.z, 0, 0, 0, 1.5, 0.4, 1.2), { tint: '#6d8f3c' })
  }
  c.col.box(p.x, 0.65, p.z, 0.7, 1.3, 0.9)
  // ブロンズの板（正面の斜めの面）
  const nrmL = v(0, 0.18, 1.15).normalize()
  const plateL = v(0, 0.18 + 0.7, 0.3 - 0.18 * (0.7 / 1.15)).addScaledVector(nrmL, 0.03)
  const plateC = plateL.clone().applyMatrix4(toWorld)
  const tex = canvasTexture(320, 480, paintPlate)
  const plateMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.5, emissiveMap: tex, emissive: new THREE.Color('#000000') })
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.8), plateMat)
  plate.position.copy(plateC)
  plate.rotation.set(-Math.atan2(0.18, 1.15), rotY, 0, 'YXZ')
  group.add(plate)
  // 2086 年の後づけ：上に浮かぶ小さな光の輪（いまも記録が生きている印）
  const ringMat = additive(new THREE.Color(0.4, 1.4, 2.4), 0.8)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 32), ringMat)
  ring.position.copy(p).add(v(0, 1.75, 0))
  ring.rotation.x = Math.PI / 2
  group.add(ring)
  let surge = 0
  return {
    plate: plateC,
    stand: p.clone().add(v(Math.sin(rotY), 0, Math.cos(rotY)).multiplyScalar(1.3)),
    setSurge(k: number) {
      surge = k
      plateMat.emissive.setRGB(0.35 * k, 0.75 * k, 1.1 * k)
    },
    update(t: number) {
      ring.position.y = p.y + 1.75 + Math.sin(t * 1.6) * 0.05
      ring.rotation.z = t * 0.8
      ringMat.opacity = 0.55 + 0.25 * Math.sin(t * 2.2) + surge * 0.4
    },
  }
}

// ------------------------------------------------------------------ 古い建物（2026 年の本社：クリームの漆喰・鉄の窓枠・石の腰壁）

function oldWing(c: FCtx, r: { x0: number; x1: number; z0: number; z1: number; h: number }, front: 'w' | 's'): void {
  const cx = (r.x0 + r.x1) / 2
  const cz = (r.z0 + r.z1) / 2
  const w = r.x1 - r.x0
  const d = r.z1 - r.z0
  fbox(c, c.m.plaster, cx, r.h / 2, cz, w, r.h, d, { r: 0.06, tint: '#f1e8d4', texM: 3 })
  // 石の腰壁と、階ごとの帯
  fbox(c, c.m.stoneWall, cx, 0.45, cz, w + 0.1, 0.9, d + 0.1, { r: 0.04, tint: '#b9b2a4', texM: 1.4 })
  for (let y = 3.8; y < r.h - 1; y += 3.7) fbox(c, c.m.plaster, cx, y, cz, w + 0.14, 0.22, d + 0.14, { r: 0.04, tint: '#d8ccb2', texM: 2 })
  // 屋上の手すり壁と、後づけの太陽光の板（2086 年）
  fbox(c, c.m.plaster, cx, r.h + 0.35, cz, w + 0.1, 0.7, d + 0.1, { r: 0.04, tint: '#e6dcc6', texM: 2 })
  for (let k = 0; k < 3; k++) fbox(c, c.fm.navyGloss, cx + (front === 's' ? (k - 1) * (w / 3.4) : 0), r.h + 0.75, cz + (front === 'w' ? (k - 1) * (d / 3.4) : 0), front === 's' ? w / 4 : w * 0.6, 0.08, front === 'w' ? d / 4 : d * 0.6, { r: 0.02, rotZ: front === 'w' ? 0.25 : 0, rotX: front === 's' ? -0.25 : 0 })
  c.col.box(cx, r.h / 2, cz, w, r.h, d)
  // 正面の窓（階ごと）
  const along = front === 'w' ? d : w
  const n = Math.max(2, Math.floor(along / 2.2))
  for (let y = 1.6; y < r.h - 1.5; y += 3.7) {
    for (let i = 0; i < n; i++) {
      const t = -along / 2 + (i + 0.5) * (along / n)
      const [x, z] = front === 'w' ? [r.x0 - 0.04, cz + t] : [cx + t, r.z1 + 0.04]
      const rot = front === 'w' ? Math.PI / 2 : 0
      fbox(c, c.fm.darkMetal, x, y + 0.75, z, front === 'w' ? 0.08 : 1.3, 1.7, front === 'w' ? 1.3 : 0.08, { r: 0.02 })
      fbox(c, c.fm.glass, x + (front === 'w' ? -0.02 : 0), y + 0.75, z + (front === 's' ? 0.02 : 0), front === 'w' ? 0.04 : 1.12, 1.52, front === 'w' ? 1.12 : 0.04, { r: 0.01 })
      void rot
    }
  }
  // つる草（60 年分）
  for (let i = 0; i < Math.floor(along / 2.5); i++) {
    const t = -along / 2 + 0.8 + i * 2.5 + (i % 2) * 0.6
    const [x, z] = front === 'w' ? [r.x0 - 0.1, cz + t] : [cx + t, r.z1 + 0.1]
    vine(c, x, r.h - 0.3, z, 2.0 + (i % 3) * 1.2, c.rng)
  }
}

/** 漆喰の土塀（瓦の笠）。a→b の線に沿って */
function dobei(c: FCtx, ax: number, az: number, bx: number, bz: number, h = 1.9): void {
  const len = Math.hypot(bx - ax, bz - az)
  if (len < 0.1) return
  const rot = -Math.atan2(bz - az, bx - ax)
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  fbox(c, c.m.stoneWall, mx, 0.25, mz, len, 0.5, 0.5, { rotY: rot, r: 0.03, tint: '#b2ab9c', texM: 1.2 })
  fbox(c, c.m.plaster, mx, (0.5 + h) / 2, mz, len, h - 0.5, 0.38, { rotY: rot, r: 0.03, tint: '#efe4cc', texM: 2 })
  c.b.add(rbox(len + 0.1, 0.12, 0.62, 0.03), c.m.roof, M(mx, h + 0.06, mz, 0, rot, 0), { texM: 1.2, tint: '#7f8a86', uAxis: 0 })
  c.b.add(rbox(len + 0.1, 0.1, 0.2, 0.03), c.m.roof, M(mx, h + 0.16, mz, 0, rot, 0), { tint: '#5d6663' })
  c.col.box(mx, h / 2 + 0.1, mz, len, h + 0.2, 0.5, rot)
}

function paintGateSign(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h)
  gr.addColorStop(0, '#6a4a2c')
  gr.addColorStop(1, '#4a321e')
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
  g.strokeStyle = 'rgba(30,18,10,0.5)'
  for (let i = 0; i < 9; i++) {
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(0, 18 + i * 16)
    g.bezierCurveTo(w * 0.3, 10 + i * 17, w * 0.7, 26 + i * 15, w, 16 + i * 16)
    g.stroke()
  }
  g.fillStyle = '#f2e2bc'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(400, 92, '"Yuji Boku", "Hiragino Mincho ProN", "Yu Mincho", serif')
  g.fillText('うら横丁', w / 2, h / 2 + 4)
}

function paintPlaque(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#f6f4ee'
  g.beginPath()
  g.roundRect(4, 4, w - 8, h - 8, 18)
  g.fill()
  g.strokeStyle = '#1d3a8a'
  g.lineWidth = 6
  g.stroke()
  g.fillStyle = '#1d3a8a'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(800, 34)
  g.fillText('NEXTMAKE 中庭', w / 2, 52)
  g.font = font(700, 24)
  g.fillStyle = '#3a4a6a'
  g.fillText('時の神さまのほこら（江戸時代から）', w / 2, 104)
  g.fillText('2026年 マツイ社長が この土地ごと 守りました', w / 2, 146)
}

function paintBigSign(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h)
  g.fillStyle = 'rgba(12, 26, 70, 0.9)'
  g.beginPath()
  g.roundRect(6, 6, w - 12, h - 12, 40)
  g.fill()
  g.strokeStyle = '#8fe6ff'
  g.lineWidth = 10
  g.stroke()
  // N の印
  g.fillStyle = '#4fb8ff'
  g.beginPath()
  g.roundRect(40, 36, h - 72, h - 72, 30)
  g.fill()
  g.fillStyle = '#ffffff'
  g.font = font(800, Math.round(h * 0.55))
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('N', 40 + (h - 72) / 2, h / 2 + 6)
  g.textAlign = 'left'
  g.font = font(800, Math.round(h * 0.42))
  g.fillText('NEXTMAKE', h + 10, h * 0.44)
  g.font = font(700, Math.round(h * 0.17))
  g.fillStyle = '#bfe8ff'
  g.fillText('新館　2028年 完成', h + 16, h * 0.8)
}

function paintClockFace(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#efe2c0'
  g.beginPath()
  g.arc(w / 2, h / 2, w / 2 - 4, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#3a2618'
  g.lineWidth = 10
  g.stroke()
  // 和時計の十二支（子どもには読みにくいので、目もりと数字を少しだけ）
  g.fillStyle = '#3a2618'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(700, 30, '"Hiragino Mincho ProN", "Yu Mincho", serif')
  const names = ['九', '八', '七', '六', '五', '四']
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.fillText(names[i % 6], w / 2 + Math.sin(a) * w * 0.36, h / 2 - Math.cos(a) * h * 0.36)
  }
  g.fillStyle = '#c99a3c'
  g.beginPath()
  g.arc(w / 2, h / 2, 12, 0, Math.PI * 2)
  g.fill()
}

// ------------------------------------------------------------------ 組み立て

export function buildNextmakeSite(fs: FutureScene, quality: QualitySettings, root: THREE.Group, colliders: SwitchColliders): NextmakeSite {
  const S = SITE
  const group = new THREE.Group()
  group.name = 'nextmake_site'
  root.add(group)
  const shared = new THREE.Group()
  shared.name = 'site_shared'
  const gB = new THREE.Group()
  gB.name = 'site_building'
  const gC = new THREE.Group()
  gC.name = 'site_courtyard'
  group.add(shared, gB, gC)

  // ================================================================== 両方の歴史で同じもの
  const cs = makeCtx(fs, shared, quality, 2026)
  const kanban = buildKanban(cs, shared)
  // 北東の段々のビルの裏（中庭から見える面）をふさぐ壁
  building(cs, { x0: 6.0, x1: 31, z0: -36.4, z1: -35.1, h: 17.2, front: 'n', shop: false, garden: false, vines: true, collider: false, accent: NEON.blue, seed: 3640 })
  finishCtx(cs, shared, 'site_shared')

  // ================================================================== はじめの歴史：NEXTMAKE 新館
  const colB = newColliders()
  const cb = makeCtx(fs, gB, quality, 2027, colB)
  const T = S.tower
  building(cb, { x0: T.x0, x1: T.x1, z0: T.z0, z1: T.z1, h: T.h, front: 'w', accent: NEON.cyan, garden: true, vines: false, seed: 2027 })
  {
    const tex = canvasTexture(1024, 256, paintBigSign, 8)
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, transparent: true, roughness: 0.4 })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(12.8, 3.2), mat)
    sign.position.set(T.x0 - 0.75, T.h - 4.5, (T.z0 + T.z1) / 2)
    sign.rotation.y = -Math.PI / 2
    gB.add(sign)
    // 入口の前の白い広場
    fbox(cb, cb.fm.plastic, (S.x0 + T.x0) / 2, 0.03, (T.z0 + T.z1) / 2, T.x0 - S.x0 + 0.4, 0.06, T.z1 - T.z0, { r: 0.02, tint: '#eef2f6' })
  }
  finishCtx(cb, gB, 'site_building')
  colliders.addSet('site_building', colB, false)

  // ================================================================== ほこらを守った歴史：古い建物と中庭
  const colC = newColliders()
  const cc = makeCtx(fs, gC, quality, 1726, colC)
  // 中庭の明かり（fs.lights に足した分。あとで提灯の色を落ち着かせ、ビルの歴史のときは消す）
  const courtLight0 = fs.lights.length
  oldWing(cc, S.oldEast, 'w')
  oldWing(cc, S.oldNorth, 's')
  // 古い建物の看板（東の棟の屋上の縁。通りからも見える）
  {
    const tex = canvasTexture(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#f6efe0'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#1d3a8a'
      g.font = font(800, 150)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('NEXTMAKE', w / 2, h / 2 + 6)
    })
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.25, roughness: 0.6 }))
    m.position.set(S.oldEast.x0 - 0.08, S.oldEast.h - 1.2, (S.oldEast.z0 + S.oldEast.z1) / 2 + 2)
    m.rotation.y = -Math.PI / 2
    gC.add(m)
  }
  // 中庭の地面（古い石畳）と、門からほこらへの飛び石
  const Y = S.yard
  cc.b.add(new THREE.PlaneGeometry(Y.x1 - Y.x0, Y.z1 - Y.z0), cc.m.paving, M((Y.x0 + Y.x1) / 2, 0.012, (Y.z0 + Y.z1) / 2, -Math.PI / 2, 0, 0), { uv: 'scale', uvScale: [(Y.x1 - Y.x0) / 2.2, (Y.z1 - Y.z0) / 2.2], tint: '#d6cdbd' })
  for (let i = 0; i < 9; i++) {
    const t = i / 8
    const x = 7.6 + (11.2 - 7.6) * t + Math.sin(i * 1.7) * 0.25
    const z = -39.2 + (-45.0 + 39.2) * t
    cc.b.add(new THREE.CylinderGeometry(0.42, 0.46, 0.08, 9), cc.m.stoneWall, M(x + 0.4 * t, 0.04, z, 0, i, 0, 1, 1, 0.8), { tint: '#eee3c7', uv: 'scale', uvScale: [0.6, 0.6] })
  }
  // 塀（通りの側。門のところは空ける）と門
  dobei(cc, S.x0 + 0.27, S.yard.z0, S.x0 + 0.27, S.gate.z0)
  dobei(cc, S.x0 + 0.27, S.gate.z1, S.x0 + 0.27, S.z1)
  {
    const gx = S.x0 + 0.27
    for (const z of [S.gate.z0 - 0.1, S.gate.z1 + 0.1]) {
      woodBox(cc, gx, 1.45, z, 0.26, 2.9, 0.26, { tint: WOOD.dark })
      cc.col.box(gx, 1.45, z, 0.3, 2.9, 0.3)
    }
    woodBox(cc, gx, 2.75, (S.gate.z0 + S.gate.z1) / 2, 0.24, 0.2, S.gate.z1 - S.gate.z0 + 0.8, { tint: WOOD.dark })
    cc.b.add(rbox(0.9, 0.1, S.gate.z1 - S.gate.z0 + 1.2, 0.03), cc.m.roof, M(gx, 3.05, (S.gate.z0 + S.gate.z1) / 2, 0, 0, 0.08), { texM: 1.2, tint: '#7f8a86' })
    const tex = canvasTexture(512, 160, paintGateSign)
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }))
    sign.position.set(gx - 0.14, 2.45, (S.gate.z0 + S.gate.z1) / 2)
    sign.rotation.y = -Math.PI / 2
    gC.add(sign)
    // 門の提灯（赤）と、中庭の案内の札
    for (const z of [S.gate.z0 + 0.35, S.gate.z1 - 0.35]) chochin(cc, gx - 0.2, 2.25, z, 'red', 0.8, { light: true })
    const pt = canvasTexture(512, 180, paintPlaque)
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.42), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.5 }))
    pl.position.set(gx - 0.2, 1.3, S.gate.z1 + 0.9)
    pl.rotation.y = -Math.PI / 2
    gC.add(pl)
  }

  // ---- ほこら
  const shrine = buildShrine(cc, gC, S.shrine.pos, S.shrine.yaw)

  // ---- ほこらの屋根の上のからくり時計（木組みの足場の上）
  const KL = S.karakuri.ledge
  const ly = S.karakuri.ledgeY
  {
    for (const [x, z] of [
      [7.3, KL.z0 + 0.1],
      [7.3, KL.z1 - 0.1],
      [KL.x1 - 0.4, KL.z0 + 0.1],
      [KL.x1 - 0.4, KL.z1 - 0.1],
    ] as const) {
      woodBox(cc, x, ly / 2, z, 0.2, ly, 0.2, { tint: WOOD.aged })
      cc.col.box(x, ly / 2, z, 0.22, ly, 0.22)
    }
    // 筋かい
    for (const z of [KL.z0 + 0.1, KL.z1 - 0.1]) cc.b.add(rbox(0.08, 3.4, 0.08, 0.02), cc.m.wood, M((7.3 + KL.x1 - 0.4) / 2, ly / 2, z, 0, 0, 0.32), { tint: WOOD.aged })
    // 足場の板
    const planks = Math.round((KL.z1 - KL.z0) / 0.42)
    for (let i = 0; i < planks; i++) {
      const z = KL.z0 + 0.2 + i * ((KL.z1 - KL.z0 - 0.4) / (planks - 1))
      woodBox(cc, (KL.x0 + KL.x1) / 2, ly - 0.05, z, KL.x1 - KL.x0, 0.1, 0.4, { tint: WOOD.warm })
    }
    cc.col.box((KL.x0 + KL.x1) / 2, ly - 0.08, (KL.z0 + KL.z1) / 2, KL.x1 - KL.x0, 0.16, KL.z1 - KL.z0)
    // 低い手すり（西・北・南）
    for (const [ax, az, bx, bz] of [
      [KL.x0 + 0.05, KL.z0 + 0.05, KL.x0 + 0.05, KL.z1 - 0.05],
      [KL.x0 + 0.05, KL.z1 - 0.05, KL.x1 - 0.05, KL.z1 - 0.05],
    ] as const) {
      const len = Math.hypot(bx - ax, bz - az)
      const rot = -Math.atan2(bz - az, bx - ax)
      woodBox(cc, (ax + bx) / 2, ly + 0.55, (az + bz) / 2, len, 0.08, 0.08, { rotY: rot, tint: WOOD.dark })
      cc.col.box((ax + bx) / 2, ly + 0.45, (az + bz) / 2, len, 0.9, 0.12, rot)
    }
    // からくり時計の箱（小さな瓦屋根）と文字盤
    const f = S.karakuri.face
    woodBox(cc, 7.48, ly + 0.85, f.z, 0.56, 1.7, 1.1, { tint: WOOD.dark })
    cc.col.box(7.48, ly + 0.85, f.z, 0.56, 1.7, 1.1)
    cc.b.add(rbox(0.9, 0.08, 1.5, 0.03), cc.m.roof, M(7.48, ly + 1.78, f.z, 0, 0, 0.12), { texM: 1.2, tint: '#7f8a86' })
    const ft = canvasTexture(256, 256, paintClockFace)
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.6 }))
    face.position.set(f.x, f.y, f.z)
    face.rotation.y = Math.PI / 2
    gC.add(face)
    cc.b.add(new THREE.TorusGeometry(0.42, 0.035, 8, 32), cc.m.brass, M(f.x + 0.01, f.y, f.z, 0, Math.PI / 2, 0))
    chochin(cc, 8.7, ly + 1.2, KL.z1 - 0.2, 'white', 0.7, { light: true })
  }
  // 時計の針（からくりの歯車が止まると、この針も止まる）
  const kHand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.3, 0.012), new THREE.MeshStandardMaterial({ color: '#2a1a10' }))
  kHand.geometry.translate(0, 0.13, 0)
  kHand.position.copy(S.karakuri.face).add(v(0.02, 0, 0))
  kHand.rotation.y = Math.PI / 2
  gC.add(kHand)

  // ---- 北の棟の縁側（見物台。裏側の足場からだけ上がれる）
  const BL = S.balcony
  {
    const cx = (BL.x0 + BL.x1) / 2
    const cz = (BL.z0 + BL.z1) / 2
    for (let i = 0; i < Math.round((BL.x1 - BL.x0) / 0.32); i++) woodBox(cc, BL.x0 + 0.16 + i * 0.32, BL.y - 0.05, cz, 0.3, 0.1, BL.z1 - BL.z0, { tint: WOOD.warm })
    woodBox(cc, cx, BL.y - 0.18, BL.z1 - 0.05, BL.x1 - BL.x0, 0.18, 0.12, { tint: WOOD.dark })
    for (let x = BL.x0 + 0.5; x < BL.x1; x += 2.4) {
      woodBox(cc, x, (BL.y - 0.1) / 2, BL.z1 - 0.12, 0.16, BL.y - 0.1, 0.16, { tint: WOOD.aged })
      cc.col.box(x, (BL.y - 0.1) / 2, BL.z1 - 0.12, 0.18, BL.y - 0.1, 0.18)
    }
    cc.col.box(cx, BL.y - 0.1, cz, BL.x1 - BL.x0, 0.2, BL.z1 - BL.z0)
    // 手すり（南の縁。東の端＝裏側の足場が着く所はあける）
    const railEnd = 18.1
    woodBox(cc, (BL.x0 + railEnd) / 2, BL.y + 0.85, BL.z1 - 0.06, railEnd - BL.x0, 0.08, 0.08, { tint: WOOD.dark })
    for (let x = BL.x0 + 0.3; x <= railEnd; x += 0.9) woodBox(cc, x, BL.y + 0.42, BL.z1 - 0.06, 0.06, 0.84, 0.06, { tint: WOOD.dark })
    cc.col.box((BL.x0 + railEnd) / 2, BL.y + 0.5, BL.z1 - 0.06, railEnd - BL.x0, 1.0, 0.14).camPass = true
    // 縁側の上の提灯の列
    for (let x = BL.x0 + 1; x < BL.x1; x += 1.8) chochin(cc, x, BL.y + 2.1, BL.z1 - 0.3, x % 3.6 < 1.8 ? 'red' : 'white', 0.7, { light: Math.round(x) % 4 === 0 })
  }

  // ---- 東の棟の縁側（ソラが工具箱を持って立つ。工具箱はここから落ちる）
  const TD = S.toolbox.deck
  {
    for (let i = 0; i < Math.round((TD.z1 - TD.z0) / 0.32); i++) woodBox(cc, (TD.x0 + TD.x1) / 2, TD.h - 0.04, TD.z0 + 0.16 + i * 0.32, TD.x1 - TD.x0, 0.08, 0.3, { tint: WOOD.warm })
    woodBox(cc, TD.x0 + 0.06, TD.h / 2, (TD.z0 + TD.z1) / 2, 0.12, TD.h, TD.z1 - TD.z0, { tint: WOOD.dark })
    cc.col.box((TD.x0 + TD.x1) / 2, TD.h / 2, (TD.z0 + TD.z1) / 2, TD.x1 - TD.x0, TD.h, TD.z1 - TD.z0)
    // 踏み石
    for (const z of [-46.0, -40.0]) cc.b.add(rbox(0.5, 0.3, 0.8, 0.05), cc.m.stoneWall, M(TD.x0 - 0.3, 0.15, z), { tint: '#bdb6a8', texM: 0.8 })
    // ガラスの引き戸（古い建物の中庭側の入口）
    fbox(cc, cc.fm.glass, S.oldEast.x0 - 0.05, 1.7, -42.0, 0.06, 2.2, 2.6, { r: 0.02 })
    fbox(cc, cc.fm.darkMetal, S.oldEast.x0 - 0.08, 1.7, -42.0, 0.06, 2.3, 0.06, { r: 0.01 })
  }
  // ---- 中庭の古い桜・植え込み・石灯籠・ベンチ
  cc.foliage.cherry(S.tree.x, 0, S.tree.z, 0.95, 77)
  cc.b.add(new THREE.CylinderGeometry(1.2, 1.3, 0.3, 20), cc.m.stoneWall, M(S.tree.x, 0.15, S.tree.z), { tint: '#b8b1a3', uv: 'scale', uvScale: [2, 0.3] })
  cc.col.box(S.tree.x, 0.3, S.tree.z, 0.6, 0.6, 0.6)
  // 植え込み（南の塀ぎわの 2 つは、決闘のはじめのカメラの前に来ないように、ベンチの左右へ）
  for (const [x, z] of [
    [7.6, -38.2],
    [7.6, -49.0],
    [16.4, -37.1],
    [10.9, -37.1],
  ] as const)
    cc.foliage.bush(x, 0, z, 0.7, Math.round(x * 13 - z), 1.0)
  {
    const bx = 13.6
    const bz = -38.6
    woodBox(cc, bx, 0.44, bz, 1.6, 0.08, 0.46, { tint: WOOD.warm })
    for (const s of [-0.6, 0.6]) woodBox(cc, bx + s, 0.2, bz, 0.08, 0.4, 0.4, { tint: WOOD.dark })
    cc.col.box(bx, 0.25, bz, 1.6, 0.5, 0.46)
  }
  // 中庭の上の提灯の連なり（門 → 東の棟）
  {
    const a = v(S.x0 + 0.3, 2.9, -39.2)
    const b = v(S.oldEast.x0, 4.6, -40.6)
    const n = 9
    for (let i = 1; i < n; i++) {
      const t = i / n
      const p = a.clone().lerp(b, t)
      p.y -= Math.sin(Math.PI * t) * 0.7
      chochin(cc, p.x, p.y - 0.3, p.z, i % 2 ? 'red' : 'white', 0.65, { light: i === 4 })
    }
  }

  // ---- からくり飾りの大歯車（北の棟の壁の前。軸は南北）
  const G = S.gear
  const gearGroup = new THREE.Group()
  gearGroup.position.copy(G.axle)
  gC.add(gearGroup)
  const brassM = new THREE.MeshStandardMaterial({ color: '#c79a46', roughness: 0.32, metalness: 0.85 })
  const woodM = new THREE.MeshStandardMaterial({ color: '#a07850', map: cc.m.wood.map, roughness: 0.8 })
  {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.09, 10, 48), brassM)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, G.width + 0.1, 20), brassM)
    hub.rotation.x = Math.PI / 2
    gearGroup.add(rim, hub)
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.12), woodM)
      spoke.position.set(-Math.sin(a) * 0.55, Math.cos(a) * 0.55, 0)
      spoke.rotation.z = a
      gearGroup.add(spoke)
    }
    // 大きな歯（足場になる）：歯の上面は軸から G.r
    for (let k = 0; k < G.teeth; k++) {
      const a = (k / G.teeth) * Math.PI * 2
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.44, 0.9), woodM)
      tooth.position.set(-Math.sin(a) * (G.r - 0.22), Math.cos(a) * (G.r - 0.22), 0)
      tooth.rotation.z = a
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.05, 0.92), brassM)
      cap.position.y = 0.22
      tooth.add(cap)
      gearGroup.add(tooth)
    }
    gearGroup.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
  }
  // 支え（壁の金具と軸）と、下の石の台（下をくぐれないように）
  cc.b.add(new THREE.CylinderGeometry(0.1, 0.1, Math.abs(S.oldNorth.z1 - G.axle.z) + 0.3, 12), cc.m.iron, M(G.axle.x, G.axle.y, (S.oldNorth.z1 + G.axle.z) / 2, Math.PI / 2, 0, 0))
  cc.b.add(rbox(0.8, 0.8, 0.1, 0.03), cc.m.iron, M(G.axle.x, G.axle.y, S.oldNorth.z1 + 0.05))
  cc.b.add(rbox(2.4, 0.5, 1.2, 0.06), cc.m.stoneWall, M(G.axle.x, 0.25, G.axle.z + 0.05), { tint: '#b6afa1', texM: 1.2 })
  cc.foliage.bush(G.axle.x - 0.7, 0.45, G.axle.z + 0.2, 0.5, 31, 0.8)
  cc.col.box(G.axle.x, 0.6, G.axle.z + 0.05, 2.4, 1.2, 1.2)
  cc.col.box(G.axle.x, G.axle.y, G.axle.z, 0.5, 0.5, G.width + 0.2)
  const toothMovers: Mover[] = []
  for (let k = 0; k < G.teeth; k++) toothMovers.push(colliders.addMover(`gear_tooth_${k}`, v(0.36, 0.22, 0.45), G.axle.clone(), false))
  let gearAngle = 0
  let gearFrozen = false
  let gearSnap: number | null = null

  // ---- ゆらぎ（縦のすじ）と裏側の足場
  const seamMat = createSeamMaterial()
  const seam = new THREE.Group()
  for (const ry of [0, Math.PI / 2]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), seamMat)
    m.rotation.y = ry
    m.renderOrder = 5
    seam.add(m)
  }
  seam.position.copy(S.seam)
  gC.add(seam)
  // 裏側の足場：暗い青の半透明の板に、白青に光るふち（裏側＝時が止まった所の色）
  const uraMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.08, 0.14, 0.36), transparent: true, opacity: 0, depthWrite: false, fog: false })
  const uraEdge = additive(new THREE.Color(0.6, 1.4, 2.4), 0)
  const uraSteps = new THREE.Group()
  const colU = newColliders()
  for (const p of S.ura) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.95), uraMat)
    m.position.copy(p).add(v(0, -0.09, 0))
    const e = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.03, 1.02), uraEdge)
    e.position.copy(p).add(v(0, 0.005, 0))
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), additive(new THREE.Color(0.3, 0.6, 1.4), 0.0, softDotTexture()))
    glow.position.copy(p).add(v(0, -0.3, 0))
    glow.rotation.x = -Math.PI / 2
    uraSteps.add(m, e, glow)
    colU.box(p.x, p.y - 0.09, p.z, 0.95, 0.18, 0.95)
  }
  uraSteps.visible = false
  uraSteps.renderOrder = 5
  gC.add(uraSteps)
  colliders.addSet('site_ura', colU, false)

  // ---- ソラの工具箱
  const tool = new THREE.Group()
  {
    const red = new THREE.MeshStandardMaterial({ color: '#d8403a', roughness: 0.4, metalness: 0.2 })
    const white = new THREE.MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.35 })
    const dark = new THREE.MeshStandardMaterial({ color: '#2a3040', roughness: 0.5, metalness: 0.6 })
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.22, 0.26), red)
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.06, 0.27), white)
    lid.position.y = 0.13
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 6, 16, Math.PI), dark)
    handle.position.y = 0.16
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.03, 0.27), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.4, 2.2), toneMapped: false }))
    stripe.position.y = 0.02
    tool.add(body, lid, handle, stripe)
    tool.traverse((o) => ((o as THREE.Mesh).isMesh ? (o.castShadow = true) : null))
  }
  tool.position.copy(S.toolbox.hand)
  gC.add(tool)
  let toolState: ToolboxState = 'held'
  let toolGrav = 2.6
  const toolVel = v(0, 0, 0)
  const toolPoint = tool.position.clone()

  // 提灯の点光源は、赤い照り返しで壁と石畳が赤くならないように、やわらかい電球色で弱く（提灯の表面の色はそのまま）。
  // ほこらの小さな灯り（暖色）はそのまま。門からほこらへの道に、淡い青の補助の光（暖色のほこらと道を分ける）
  const courtLights = fs.lights.slice(courtLight0)
  for (const l of courtLights) {
    if (l.dist === 8 && (l.color === '#ff7a48' || l.color === '#ffb466')) {
      l.color = '#ffe1b3'
      l.intensity *= 0.55
    }
  }
  const fill = { pos: v(12, 2.6, -43), color: '#bad9ff', intensity: 1.2, dist: 10 }
  fs.lights.push(fill)
  courtLights.push(fill)
  const courtBase = courtLights.map((l) => l.intensity)
  finishCtx(cc, gC, 'site_courtyard')
  colliders.addSet('site_courtyard', colC, false)

  // ================================================================== 切り替え
  let variant: SiteVariant = 'building'
  let ghosting = false
  const apply = (vv: SiteVariant) => {
    variant = vv
    gB.visible = vv === 'building'
    gC.visible = vv === 'courtyard'
    colliders.setEnabled('site_building', vv === 'building')
    colliders.setEnabled('site_courtyard', vv === 'courtyard')
    for (const m of toothMovers) m.enabled = vv === 'courtyard'
    if (vv !== 'courtyard') colliders.setEnabled('site_ura', false)
    // 中庭の明かりは中庭があるときだけ（強さ 0 の明かりはシェルが割り当てない）
    courtLights.forEach((l, i) => (l.intensity = vv === 'courtyard' ? courtBase[i] : 0))
  }
  apply('building')
  const ghostMat = createGhostMaterial()
  let ghostT = -1
  let ghostSec = 2.6
  let ghostOld: THREE.Group | null = null
  let ghostSaved: Array<{ mesh: THREE.Mesh; mat: THREE.Material | THREE.Material[] }> = []
  let ghostHidden: THREE.Object3D[] = []
  let ghostDone: (() => void) | null = null
  const ghostRange = { y0: 0, y1: 10 }
  const endGhost = () => {
    for (const s of ghostSaved) s.mesh.material = s.mat
    for (const o of ghostHidden) o.visible = true
    ghostSaved = []
    ghostHidden = []
    if (ghostOld) ghostOld.visible = ghostOld === (variant === 'building' ? gB : gC)
    ghostOld = null
    ghostT = -1
    ghosting = false
    ghostDone?.()
    ghostDone = null
  }

  const site: NextmakeSite = {
    group,
    get variant() {
      return variant
    },
    get ghosting() {
      return ghosting
    },
    setVariant(vv: SiteVariant) {
      if (ghosting) endGhost()
      apply(vv)
    },
    ghostSwap(to: SiteVariant, seconds = 2.8) {
      if (ghosting) endGhost()
      if (to === variant) return Promise.resolve()
      const old = variant === 'building' ? gB : gC
      apply(to)
      ghostOld = old
      old.visible = true
      const box = new THREE.Box3().setFromObject(old)
      ghostRange.y0 = box.min.y
      ghostRange.y1 = Math.min(box.max.y, 60)
      old.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        if ((m as THREE.InstancedMesh).isInstancedMesh || (m.material as THREE.Material).type === 'ShaderMaterial' || (m.material as THREE.Material).transparent) {
          if (m.visible) {
            ghostHidden.push(m)
            m.visible = false
          }
          return
        }
        ghostSaved.push({ mesh: m, mat: m.material })
        m.material = ghostMat
      })
      ghostSec = seconds
      ghostT = 0
      ghosting = true
      return new Promise<void>((r) => (ghostDone = r))
    },
    shrine,
    kanban,
    gear: {
      point: G.axle.clone(),
      get frozen() {
        return gearFrozen
      },
      freeze(on: boolean, snap = true) {
        gearFrozen = on
        const step = (Math.PI * 2) / G.teeth
        gearSnap = on && snap ? Math.round(gearAngle / step) * step : null
      },
      topTooth(out = new THREE.Vector3()) {
        const step = (Math.PI * 2) / G.teeth
        const k = Math.round(-gearAngle / step)
        const a = gearAngle + k * step
        return out.set(G.axle.x - Math.sin(a) * G.r, G.axle.y + Math.cos(a) * G.r, G.axle.z)
      },
    },
    setSeam(k: number) {
      seamMat.uniforms.uK.value = k
      seam.visible = k > 0.001
    },
    seamPoint: S.seam.clone(),
    setUra(k: number) {
      uraSteps.visible = k > 0.001
      uraMat.opacity = 0.75 * k
      uraEdge.opacity = k
      uraSteps.children.forEach((o, i) => {
        if (i % 3 === 2) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.6 * k
      })
      colliders.setEnabled('site_ura', variant === 'courtyard' && k > 0.5)
    },
    toolbox: {
      get point() {
        return toolPoint.copy(tool.position).add(v(0, 0.1, 0))
      },
      get state() {
        return toolState
      },
      reset() {
        toolState = 'held'
        tool.position.copy(S.toolbox.hand)
        tool.rotation.set(0, 0.3, 0)
        toolVel.set(0, 0, 0)
      },
      drop(slow = false) {
        toolState = 'falling'
        // 子どもでも間に合うように、ふわっと上がってから、ゆっくり落ちる（約 2.1 秒。slow：約 3 秒）
        toolVel.set(-0.25, slow ? 2.4 : 2.2, 0.08)
        toolGrav = slow ? 1.75 : 2.6
      },
      freeze(on: boolean) {
        if (on && toolState === 'falling') toolState = 'frozen'
        else if (!on && toolState === 'frozen') toolState = 'falling'
      },
    },
    goal: v((KL.x0 + KL.x1) / 2, ly, (KL.z0 + KL.z1) / 2),
    update(dt: number) {
      const t = uTime.value
      kanban.update(t)
      shrine.update(dt)
      // 大歯車（止まっていなければゆっくり回る。止めたら一番上の歯をまっすぐ上へ合わせる）
      if (!gearFrozen) gearAngle += dt * 0.5
      else if (gearSnap !== null) {
        gearAngle += (gearSnap - gearAngle) * Math.min(1, dt * 10)
        if (Math.abs(gearSnap - gearAngle) < 1e-3) gearAngle = gearSnap
      }
      gearGroup.rotation.z = gearAngle
      if (!gearFrozen) kHand.rotation.x = -t * 0.6
      if (variant === 'courtyard') {
        const q = new THREE.Quaternion()
        for (let k = 0; k < G.teeth; k++) {
          const a = gearAngle + (k / G.teeth) * Math.PI * 2
          q.setFromAxisAngle(v(0, 0, 1), a)
          toothMovers[k].set(v(G.axle.x - Math.sin(a) * (G.r - 0.22), G.axle.y + Math.cos(a) * (G.r - 0.22), G.axle.z), 0, q)
        }
      }
      // 工具箱
      if (toolState === 'falling') {
        toolVel.y -= toolGrav * dt
        tool.position.addScaledVector(toolVel, dt)
        tool.rotation.x += dt * 3.2
        tool.rotation.z += dt * 1.6
        if (tool.position.y <= 0.11) {
          tool.position.y = 0.11
          tool.rotation.set(0, tool.rotation.y, 0.0)
          toolState = 'ground'
        }
      }
      // 時空裂きのクローが毎フレーム読む点（工具箱について動く）
      toolPoint.copy(tool.position).y += 0.1
      // ゴースト（変わる前の景色）：一瞬はっきり → 下からほどけて消える
      if (ghostT >= 0) {
        ghostT += dt
        const k = ghostT / ghostSec
        const fadeIn = Math.min(1, ghostT / 0.25)
        ghostMat.uniforms.uOpacity.value = fadeIn * (1 - Math.max(0, (k - 0.75) / 0.25))
        const span = (ghostRange.y1 - ghostRange.y0) * 0.035 + 0.35
        ghostMat.uniforms.uWipe.value = ghostRange.y0 * 0.035 - 0.3 + Math.max(0, (k - 0.25) / 0.75) * span
        if (k >= 1) endGhost()
      }
    },
  }
  site.toolbox.reset()
  return site
}
