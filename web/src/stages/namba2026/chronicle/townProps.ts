// 物語 v7（6 章）で町に足す物：
// ・時計屋の看板（石標 B のとなり。柱の上の両面の丸時計と「ときわ堂」の札）
// ・北岸の「なんば駅」の入口と、その上の大時計（石標 D の前）
// ・立てたばかりの石標 A のまわり：新しいコンクリートの台・紅白のリボン・コーン・ケーブル・佐伯さんの測定の道具
// ・ラボ：佐伯さんの端末（IDO 検索の画面）
// 絵は registerV7Art で外の看板のアトラス（signs）と室内のアトラス（inner）へ先に入れておく（scene を組む前）。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { box, boxAB, cyl, decal, sag, sign, type NCtx } from '../kit'
import type { SignAtlas } from '../signs'
import { makeCanvas } from '../../../render/textures'
import { drawLogo, drawMarkWhite } from './brandArt'
import { paintV7ConceptBoard } from './recordArt'
import { CLOCK_SHOP, KANBAN, LAB, MEASURE, STATION } from './layoutV7'

const GOTHIC = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP",sans-serif'
const ROUND = '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c",sans-serif'
const BRUSH = '"Yuji Boku","Hiragino Mincho ProN","Yu Mincho",serif'
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

function clockFace(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, rim: string, face: string, ink: string, roman = false): void {
  g.fillStyle = rim
  g.beginPath()
  g.arc(cx, cy, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = face
  g.beginPath()
  g.arc(cx, cy, r * 0.86, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = ink
  g.strokeStyle = ink
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `700 ${r * 0.2}px ${roman ? '"Times New Roman",serif' : GOTHIC}`
  const nums = roman ? ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'] : ['12', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2
    g.fillText(nums[i], cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66)
    g.lineWidth = r * 0.025
    g.beginPath()
    g.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8)
    g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85)
    g.stroke()
  }
  g.lineCap = 'round'
  // 4 時 50 分（夕方の手前）
  const hr = ((4 + 50 / 60) / 12) * Math.PI * 2
  const mn = (50 / 60) * Math.PI * 2
  g.lineWidth = r * 0.07
  g.beginPath()
  g.moveTo(cx, cy)
  g.lineTo(cx + Math.sin(hr) * r * 0.42, cy - Math.cos(hr) * r * 0.42)
  g.stroke()
  g.lineWidth = r * 0.045
  g.beginPath()
  g.moveTo(cx, cy)
  g.lineTo(cx + Math.sin(mn) * r * 0.66, cy - Math.cos(mn) * r * 0.66)
  g.stroke()
  g.fillStyle = '#c8281c'
  g.beginPath()
  g.arc(cx, cy, r * 0.05, 0, Math.PI * 2)
  g.fill()
}

/** 看板・室内の絵を足す（signs は外のアトラス、inner は室内のアトラス。どちらも texture() を作る前に） */
export function registerV7Art(signs: SignAtlas): void {
  // ---- 時計屋の丸時計（両面で使う）と札
  signs.addCustom('v7_clockface', 256, 256, (g, x, y, w) => clockFace(g, x + w / 2, y + w / 2, w / 2 - 2, '#2e4a3a', '#fbf6e8', '#1a1a14'))
  signs.addCustom('v7_clockshop', 320, 112, (g, x, y, w, h) => {
    g.fillStyle = '#20382c'
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#d8b860'
    g.lineWidth = 6
    g.strokeRect(x + 4, y + 4, w - 8, h - 8)
    g.fillStyle = '#f6e8c0'
    g.font = `400 ${h * 0.5}px ${BRUSH}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('時計 ときわ堂', x + w / 2, y + h * 0.42)
    g.font = `700 ${h * 0.17}px ${GOTHIC}`
    g.fillText('修理・電池交換', x + w / 2, y + h * 0.8)
  })
  // ---- 駅の大時計（ローマ数字）と駅の札
  signs.addCustom('v7_bigclock', 256, 256, (g, x, y, w) => clockFace(g, x + w / 2, y + w / 2, w / 2 - 2, '#7a5a2a', '#fffaf0', '#1a1408', true))
  signs.addCustom('v7_station', 512, 128, (g, x, y, w, h) => {
    const gr = g.createLinearGradient(x, y, x, y + h)
    gr.addColorStop(0, '#1d4fb8')
    gr.addColorStop(1, '#163f96')
    g.fillStyle = gr
    g.fillRect(x, y, w, h)
    // 駅のしるし（電車の横の形）
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.roundRect(x + 14, y + 34, 84, 48, 12)
    g.fill()
    g.fillStyle = '#1d4fb8'
    for (let i = 0; i < 3; i++) g.fillRect(x + 22 + i * 24, y + 42, 18, 16)
    g.fillStyle = '#ffffff'
    for (const wx of [30, 82]) {
      g.beginPath()
      g.arc(x + wx, y + 90, 7, 0, Math.PI * 2)
      g.fill()
    }
    g.fillRect(x + 10, y + 96, 92, 4)
    g.font = `900 ${h * 0.46}px ${ROUND}`
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText('なんば駅', x + 110, y + h * 0.42)
    g.font = `700 ${h * 0.16}px ${GOTHIC}`
    g.fillText('NAMBA STATION  ↓ のりば', x + 112, y + h * 0.8)
  })
  // ---- 空き地：建築計画のお知らせ（来年のビル）・トンネル路地の札
  signs.addCustom('v7_tunnel', 256, 80, (g, x, y, w, h) => {
    g.fillStyle = '#6a4a2c'
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#2a1a0c'
    g.lineWidth = 5
    g.strokeRect(x + 3, y + 3, w - 6, h - 6)
    g.fillStyle = '#f4ead2'
    g.font = `400 ${h * 0.62}px ${BRUSH}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('通りぬけ', x + w / 2, y + h * 0.54)
  })
  // ---- 石標 A：「IDO かんばん 第 1 号」の小さな銘板（立てたばかり）
  signs.addCustom('v7_kanban_no1', 256, 96, (g, x, y, w, h) => {
    g.fillStyle = '#16294f'
    g.fillRect(x, y, w, h)
    drawMarkWhite(g, x + h * 0.42, y + h / 2, h * 0.5)
    g.fillStyle = '#ffd56a'
    g.font = `900 ${h * 0.3}px ${GOTHIC}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('IDO かんばん 第1号', x + w * 0.58, y + h * 0.38)
    g.fillStyle = '#ffffff'
    g.font = `700 ${h * 0.19}px ${GOTHIC}`
    g.fillText('2026.10  試験運用中', x + w * 0.58, y + h * 0.76)
  })
  // ---- 佐伯さんのタブレット（三脚の上：かんばんの映りぐあい）
  signs.addCustom('v7_tablet', 192, 128, (g, x, y, w, h) => {
    g.fillStyle = '#081a24'
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#4ee6dc'
    g.lineWidth = 2
    g.strokeRect(x + 6, y + 6, w - 12, h - 34)
    // 映りぐあいの波形
    g.beginPath()
    for (let i = 0; i <= 60; i++) {
      const px = x + 10 + (i / 60) * (w - 20)
      const py = y + 40 + Math.sin(i * 0.5) * 10 * (i % 7 === 0 ? 1.8 : 1)
      if (i === 0) g.moveTo(px, py)
      else g.lineTo(px, py)
    }
    g.stroke()
    g.fillStyle = '#4ee6dc'
    g.font = `800 14px ${GOTHIC}`
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText('映りぐあい 98%', x + 10, y + h - 14)
  })
}

/** 建築計画のお知らせ（来年のビル）：白い板に、NEXTMAKE のロゴ */
function paintNotice(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = '#f8f8f4'
  g.fillRect(x, y, w, h)
  g.strokeStyle = '#2a3a6a'
  g.lineWidth = 8
  g.strokeRect(x + 4, y + 4, w - 8, h - 8)
  g.fillStyle = '#2a3a6a'
  g.fillRect(x + 4, y + 4, w - 8, h * 0.2)
  g.fillStyle = '#ffffff'
  g.font = `900 ${h * 0.11}px ${GOTHIC}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('建築計画のお知らせ', x + w / 2, y + h * 0.12)
  g.fillStyle = '#1a1a1a'
  g.textAlign = 'left'
  const rows: Array<[string, string]> = [
    ['建物の名前', '（仮）NEXTMAKE 新館'],
    ['建てる人', '株式会社'],
    ['工事のはじめ', '2027年 4月 の予定'],
    ['かいだて', '地上 12 階'],
  ]
  rows.forEach(([a, b], i) => {
    const yy = y + h * (0.32 + i * 0.15)
    g.font = `700 ${h * 0.07}px ${GOTHIC}`
    g.fillStyle = '#4a4a4a'
    g.fillText(a, x + w * 0.07, yy)
    g.font = `800 ${h * 0.075}px ${GOTHIC}`
    g.fillStyle = '#1a1a1a'
    g.fillText(b, x + w * 0.38, yy)
    g.fillStyle = '#c8ccd2'
    g.fillRect(x + w * 0.06, yy + h * 0.06, w * 0.88, 2)
  })
  g.fillStyle = '#c8281c'
  g.font = `800 ${h * 0.06}px ${GOTHIC}`
  g.fillText('※ この土地の古いほこらは とりこわします', x + w * 0.07, y + h * 0.93)
  // 建てる会社：「株式会社」のあとに NEXTMAKE のロゴ
  drawLogo(g, x + w * 0.55, y + h * (0.47 - 0.04), w * 0.4, h * 0.08)
}

/** 佐伯さんの端末の画面（IDO の記録さがし） */
function paintTerminal(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    g.fillStyle = '#061820'
    g.fillRect(x, y, w, h)
    g.fillStyle = '#0d2c38'
    g.fillRect(x, y, w, h * 0.16)
    g.fillStyle = '#4ee6dc'
    g.font = `900 ${h * 0.09}px ${GOTHIC}`
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillText('IDO  かんばんの記録さがし', x + 10, y + h * 0.08)
    // 検索の箱
    g.strokeStyle = '#4ee6dc'
    g.lineWidth = 2
    g.strokeRect(x + 12, y + h * 0.24, w - 24, h * 0.14)
    g.fillStyle = '#9af6ec'
    g.font = `700 ${h * 0.08}px ${GOTHIC}`
    g.fillText('🔍 ことばを入れてください', x + 20, y + h * 0.31)
    // 町の地図のような方眼
    g.strokeStyle = 'rgba(120,240,230,0.25)'
    g.lineWidth = 1
    for (let i = 0; i < 8; i++) {
      g.beginPath()
      g.moveTo(x + 12, y + h * (0.48 + i * 0.06))
      g.lineTo(x + w - 12, y + h * (0.48 + i * 0.06))
      g.stroke()
    }
    g.fillStyle = 'rgba(70,170,230,0.5)'
    g.fillRect(x + 12, y + h * 0.62, w - 24, h * 0.08)
    for (const [px, py] of [
      [0.3, 0.55],
      [0.62, 0.8],
      [0.8, 0.52],
    ]) {
      g.fillStyle = '#ff7a4f'
      g.beginPath()
      g.arc(x + w * px, y + h * py, 6, 0, Math.PI * 2)
      g.fill()
    }
    drawMarkWhite(g, x + w - 40, y + h * 0.88, 28)
  }

/** 空き地の「建築計画のお知らせ」の板（物置の西の面。自分のキャンバス：看板のアトラスはいっぱい） */
export function buildNotice(c: NCtx, x: number, y: number, z: number, rotY: number, w: number, h: number): void {
  const [cv, g] = makeCanvas(368, 276)
  paintNotice(g, 0, 0, 368, 276)
  const m = canvasPlane(c, cv, w, h, false, 'v7_notice')
  m.position.set(x, y, z)
  m.rotation.y = rotY
  box(c, x + Math.sin(rotY) * -0.025, y, z + Math.cos(rotY) * -0.025, w + 0.06, h + 0.06, 0.04, c.m.metal, { tint: '#8a8e94', rotY, cast: false })
  m.position.x += Math.sin(rotY) * 0.002
  m.position.z += Math.cos(rotY) * 0.002
}

/** 自分のキャンバスの板（アトラスに入れない大きな絵。1 回の描画） */
function canvasPlane(c: NCtx, cv: HTMLCanvasElement, w: number, h: number, glow: boolean, name: string): THREE.Mesh {
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  const mat = glow ? new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.9, roughness: 0.3, name }) : new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, name })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.receiveShadow = true
  c.root.add(m)
  return m
}

/** ラボの構想ボード（v7）：社長の絵を貼ったホワイトボード。もとのボードの上に重ねる */
export function buildPresidentBoard(c: NCtx): THREE.Mesh {
  const [cv, g] = makeCanvas(1024, 600)
  paintV7ConceptBoard(g, 0, 0, 1024, 600)
  const m = canvasPlane(c, cv, 2.6, 1.52, false, 'v7_concept_board')
  // ../nextmake.ts の構想ボード：西の壁 x = NM.x0 + 0.34 + 0.055、中心 (y 1.75, z 19.9)、東向き
  m.position.set(-19 + 0.34 + 0.06, 1.75, 19.9)
  m.rotation.y = Math.PI / 2
  return m
}

/** 時計屋の看板：柱の上の両面の丸時計と、その下の札 */
export function buildClockShopSign(c: NCtx): void {
  const p = CLOCK_SHOP.pole
  const y = CLOCK_SHOP.clockY
  cyl(c, p.x, 0, 0.3, p.z, 0.16, c.m.metal, { tint: '#24382c', r1: 0.12, seg: 12 })
  cyl(c, p.x, 0.3, y - 0.4, p.z, 0.055, c.m.metal, { tint: '#24382c', seg: 10 })
  c.col.box(p.x, 1.5, p.z, 0.32, 3, 0.32)
  // 札（両面）
  sign(c, 'v7_clockshop', p.x, y - 0.72, p.z + 0.03, 0, 0.86, 0.3, { depth: 0.04 })
  sign(c, 'v7_clockshop', p.x, y - 0.72, p.z - 0.03, Math.PI, 0.86, 0.3, { depth: 0.04 })
  // 丸い時計（緑の金属の縁・両面の文字盤）
  c.b.add(new THREE.CylinderGeometry(0.46, 0.46, 0.2, 32), c.m.metal, M(p.x, y, p.z, Math.PI / 2, 0, 0), { tint: '#2e4a3a' })
  for (const s of [1, -1]) decal(c, c.signs.get('v7_clockface'), p.x, y, p.z + s * 0.102, s > 0 ? 0 : Math.PI, 0.84, 0.84, c.signGlow)
  c.b.add(new THREE.SphereGeometry(0.09, 12, 8), c.m.metal, M(p.x, y + 0.52, p.z), { tint: '#c8a040' })
  c.lights.push({ pos: v(p.x, y, p.z + 0.4), color: '#fff0d0', intensity: 1.2, dist: 4 })
}

/** 北岸の駅の入口（ガラスの囲いと屋根・明るい中）と、その上の大時計の塔 */
export function buildStation(c: NCtx): void {
  const S = STATION
  const cx = (S.x0 + S.x1) / 2
  // 屋根と後ろの壁
  boxAB(c, S.x0 - 0.15, S.x1 + 0.15, S.h, S.h + 0.22, S.z0, S.z1 + 0.2, c.m.paint, { tint: '#f2f2ee' })
  boxAB(c, S.x0, S.x1, 0, S.h, S.z0, S.z0 + 0.2, c.m.plaster, { tint: '#e2e4e6', texM: 2 })
  // 両側のガラスの壁（四すみに青い柱）
  for (const x of [S.x0, S.x1]) {
    for (const z of [S.z0 + 0.1, S.z1 - 0.06]) boxAB(c, x - 0.07, x + 0.07, 0, S.h, z - 0.06, z + 0.06, c.m.metal, { tint: '#2a62b8' })
    boxAB(c, x - 0.04, x + 0.04, 0, 0.5, S.z0, S.z1, c.m.metal, { tint: '#2a62b8', cast: false })
    c.b.add(new THREE.PlaneGeometry(S.z1 - S.z0, S.h - 0.6), c.m.glass, M(x, 0.5 + (S.h - 0.6) / 2, (S.z0 + S.z1) / 2, 0, Math.PI / 2, 0), { cast: false })
    c.col.box(x, S.h / 2, (S.z0 + S.z1) / 2, 0.15, S.h, S.z1 - S.z0)
  }
  // 正面のガラスの自動ドア（閉まっている）と枠。中は明るい改札
  const fz = S.z1 - 0.06
  boxAB(c, S.x0, S.x1, S.h - 0.32, S.h, fz - 0.05, fz + 0.05, c.m.metal, { tint: '#2a62b8' })
  for (const x of [cx - 0.75, cx, cx + 0.75]) boxAB(c, x - 0.03, x + 0.03, 0, S.h - 0.32, fz - 0.03, fz + 0.03, c.m.metal, { tint: '#c8ccd2', cast: false })
  c.b.add(new THREE.PlaneGeometry(S.x1 - S.x0, S.h - 0.32), c.m.glass, M(cx, (S.h - 0.32) / 2, fz, 0, 0, 0), { cast: false })
  c.col.box(cx, S.h / 2, fz, S.x1 - S.x0, S.h, 0.14)
  boxAB(c, S.x0 + 0.1, S.x1 - 0.1, 0.01, S.h - 0.05, S.z0 + 0.2, S.z0 + 0.25, c.m.lightCool, { tint: '#e8f0ff', cast: false })
  boxAB(c, S.x0 + 0.08, S.x1 - 0.08, 0, 0.02, S.z0 + 0.2, fz - 0.05, c.m.stone, { tint: '#d8d8d4', cast: false })
  for (let i = 0; i < 3; i++) {
    const gx = S.x0 + 0.75 + i * 1.0
    boxAB(c, gx - 0.12, gx + 0.12, 0, 1.0, S.z0 + 0.8, S.z0 + 1.7, c.m.metal, { tint: '#9aa0a8', cast: false })
    boxAB(c, gx - 0.1, gx + 0.1, 1.0, 1.04, S.z0 + 1.45, S.z0 + 1.65, c.m.lightCool, { tint: '#7af08a', cast: false })
  }
  // 駅の札（屋根の前）
  sign(c, 'v7_station', cx, S.h + 0.48, S.z1 + 0.2, 0, 2.4, 0.6, { glow: true, depth: 0.08 })
  // 大時計の塔（屋根の上）
  const t = S.clock
  boxAB(c, t.x - 0.75, t.x + 0.75, S.h + 0.22, t.y + 0.85, S.z1 - 0.3, S.z1 + 0.05, c.m.plaster, { tint: '#d8c8a8', texM: 1.5 })
  c.b.add(rbox(1.8, 0.14, 0.6, 0.03), c.m.paint, M(t.x, t.y + 0.92, S.z1 - 0.12), { tint: '#7a5a2a' })
  c.b.add(new THREE.CylinderGeometry(0.66, 0.66, 0.12, 36), c.m.metal, M(t.x, t.y, t.z, Math.PI / 2, 0, 0), { tint: '#8a6a30' })
  decal(c, c.signs.get('v7_bigclock'), t.x, t.y, t.z + 0.062, 0, 1.2, 1.2, c.signGlow)
  c.lights.push({ pos: v(t.x, t.y, t.z + 0.6), color: '#fff2d8', intensity: 1.6, dist: 6 })
  c.lights.push({ pos: v(cx, 2.0, S.z0 + 1.0), color: '#e8f0ff', intensity: 1.8, dist: 6 })
}

/** 立てたばかりの石標 A：新しいコンクリートの台・紅白のリボン・銘板・コーン・ケーブル・佐伯さんの測定の道具 */
export function buildNewKanbanDressing(c: NCtx): void {
  const k = KANBAN.a.pos
  // 新しいコンクリートの台（少し明るい・濡れたようなつや）
  boxAB(c, k.x - 0.85, k.x + 0.85, 0, 0.03, k.z - 0.65, k.z + 0.75, c.m.concrete, { tint: '#d8d6d0', cast: false })
  // 紅白のリボン（石の胴に巻いて、前で結ぶ）
  const ribbon = (y: number, tint: string) => c.b.add(new THREE.TorusGeometry(0.47, 0.022, 4, 24), c.m.fabric, M(k.x + 0.02, y, k.z + 0.02, Math.PI / 2, 0, 0, 1, 0.82, 1), { tint, cast: false })
  ribbon(0.32, '#d8281c')
  ribbon(0.36, '#f4f4f0')
  c.b.add(new THREE.SphereGeometry(0.08, 10, 8), c.m.fabric, M(k.x, 0.34, k.z + 0.42, 0, 0, 0, 1.4, 0.8, 0.6), { tint: '#d8281c', cast: false })
  for (const s of [-1, 1]) c.b.add(new THREE.PlaneGeometry(0.06, 0.3), c.m.fabric, M(k.x + s * 0.06, 0.18, k.z + 0.44, 0, 0, s * 0.3), { tint: s > 0 ? '#f4f4f0' : '#d8281c', cast: false })
  // 銘板（台石の前）
  sign(c, 'v7_kanban_no1', k.x, 0.1, k.z + 0.44, 0, 0.5, 0.18, { depth: 0.02 })
  // コーンとコーンバー（立ち入りを少しよける）
  const cones = [v(k.x - 1.0, 0, k.z - 0.5), v(k.x + 1.0, 0, k.z - 0.5)]
  for (const p of cones) {
    c.b.add(new THREE.ConeGeometry(0.17, 0.62, 14), c.m.plastic, M(p.x, 0.36, p.z), { tint: '#f26a1c' })
    c.b.add(new THREE.CylinderGeometry(0.115, 0.135, 0.09, 14), c.m.plastic, M(p.x, 0.4, p.z), { tint: '#f4f4f0', cast: false })
    boxAB(c, p.x - 0.22, p.x + 0.22, 0, 0.05, p.z - 0.22, p.z + 0.22, c.m.rubber, { tint: '#2a2a2a', cast: false })
  }
  for (let i = 0; i < 6; i++) box(c, k.x - 0.85 + i * 0.34, 0.55, k.z - 0.5, 0.34, 0.05, 0.05, c.m.plastic, { tint: i % 2 ? '#f4f4f0' : '#d8281c', cast: false })
  // ケーブル（石標 → 測定の机）
  sag(c, v(k.x - 0.4, 0.05, k.z + 0.3), v(MEASURE.table.x + 0.3, 0.72, MEASURE.table.z - 0.2), 0.0, 0.016, c.m.rubber, '#1a1c20')
  // 折りたたみの机・ノート PC・工具箱
  const t = MEASURE.table
  boxAB(c, t.x - 0.55, t.x + 0.55, 0.7, 0.74, t.z - 0.3, t.z + 0.3, c.m.plastic, { tint: '#e8eaee' })
  for (const sx of [-0.5, 0.5]) for (const sz of [-0.25, 0.25]) boxAB(c, t.x + sx - 0.015, t.x + sx + 0.015, 0, 0.7, t.z + sz - 0.015, t.z + sz + 0.015, c.m.metal, { tint: '#8a8e94', cast: false })
  c.col.box(t.x, 0.37, t.z, 1.1, 0.74, 0.6)
  box(c, t.x - 0.15, 0.75, t.z + 0.05, 0.34, 0.015, 0.24, c.m.metal, { tint: '#c8ccd2', cast: false })
  c.b.add(rbox(0.34, 0.22, 0.01, 0.003), c.m.metal, M(t.x - 0.15, 0.86, t.z - 0.08, -0.2, 0, 0), { tint: '#c8ccd2', cast: false })
  decal(c, c.signs.get('v7_tablet'), t.x - 0.15, 0.86, t.z - 0.074, 0, 0.3, 0.19, c.signGlow)
  box(c, t.x + 0.3, 0.83, t.z, 0.34, 0.16, 0.2, c.m.paint, { tint: '#2a6ad8' })
  // 三脚とタブレット（かんばんの板へ向ける）
  const p = MEASURE.tripod
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3
    const foot = v(p.x + Math.cos(a) * 0.32, 0, p.z + Math.sin(a) * 0.32)
    const top = v(p.x, 1.2, p.z)
    const len = foot.distanceTo(top)
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize())
    c.b.add(new THREE.CylinderGeometry(0.014, 0.014, len, 5), c.m.metal, new THREE.Matrix4().compose(foot.clone().lerp(top, 0.5), q, new THREE.Vector3(1, 1, 1)), { tint: '#2a2d33', cast: false })
  }
  const face = Math.atan2(k.x - p.x, k.z - p.z)
  c.b.add(rbox(0.32, 0.22, 0.02, 0.01), c.m.plastic, M(p.x, 1.32, p.z, -0.25, face + Math.PI, 0), { tint: '#1a1c22' })
  decal(c, c.signs.get('v7_tablet'), p.x - Math.sin(face) * 0.012, 1.32, p.z - Math.cos(face) * 0.012, face + Math.PI, 0.28, 0.18, c.signGlow)
}

/** ラボの佐伯さんの作業台：端末（モニター）を置く */
export function buildLabTerminal(c: NCtx): void {
  const t = LAB.terminal
  const top = 0.98
  boxAB(c, t.x - 0.05, t.x + 0.05, top, t.y - 0.18, t.z + 0.05, t.z + 0.11, c.m.metal, { tint: '#2a2d33' })
  boxAB(c, t.x - 0.16, t.x + 0.16, top, top + 0.015, t.z - 0.02, t.z + 0.16, c.m.metal, { tint: '#2a2d33', cast: false })
  box(c, t.x, t.y, t.z, 0.66, 0.42, 0.03, c.m.plastic, { tint: '#1a1c20' })
  const [cv, g] = makeCanvas(320, 200)
  paintTerminal(g, 0, 0, 320, 200)
  const scr = canvasPlane(c, cv, 0.62, 0.38, true, 'v7_terminal')
  scr.position.set(t.x, t.y, t.z - 0.017)
  scr.rotation.y = Math.PI
  // キーボード
  box(c, t.x, top + 0.01, t.z - 0.3, 0.44, 0.015, 0.14, c.m.plastic, { tint: '#e8eaee', cast: false })
  c.lights.push({ pos: v(t.x, t.y, t.z - 0.4), color: '#9af6ec', intensity: 0.8, dist: 3 })
}
