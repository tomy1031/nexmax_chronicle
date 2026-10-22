// ソラの展示の台（物語 v7.1：QR を物語の鍵にもどす）。わっかの右手前に立つ白い台で、上の大きな板にかんばんの QR を出す。
// ・板の QR は場面で変わる（1章：300 年前の路地／5章：NEXTMAKE 前のかんばんの 60 年前／8章：ダイヤルでえらんだ年／10章のあと：遺跡のかんばん）
// ・台の両わきに「世界じゅうのかんばんの QR」の小さな札がならぶ（飾り）
// ・F で読むと、ネクマックスの目から光が QR へのびる（ScanBeam は recordFx2086）。そのあいだ板に読み取りの線が走る（setScan）
// 形は軽い（箱・円柱・板）。板の絵はキャンバス（記録が変わるときだけ描き直す）。どれも root の下（解放はシェル）。
import * as THREE from 'three'
import { uTime } from '../../../render/materials'
import { mulberry32 } from '../../../render/noise'
import type { ColliderList } from '../../../world/colliders'
import { F } from '../layout'
import { canvasTexture, font } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 板に出す記録（era：上の段の年・title：下の段の場所） */
export type QrRecord = { era: string; title: string; seed: number; gold?: boolean }

export const QR_RECORDS = {
  idle: { era: 'イドーのかんばん', title: 'QR をよみこんでね', seed: 2086 },
  edo1726: { era: '300年前（1726年）', title: '大坂・瓦屋根の路地', seed: 1726 },
  nextmake2026: { era: '60年前（2026年）', title: 'NEXTMAKE のビルの前', seed: 2026, gold: true },
  ruins1186: { era: '1186年', title: 'カンボジアの遺跡のかんばん', seed: 1186, gold: true },
} as const satisfies Record<string, QrRecord>

/** 年代ダイヤルでえらんだ年の、路地のかんばんの記録 */
export function dialRecord(year: number): QrRecord {
  return { era: `${year}年`, title: 'NEXTMAKE 前の路地のかんばん', seed: year, gold: year === 2026 }
}

/** 台の置き場所（わっかの正面から右手前）と、読む人が立つ所 */
export const QR_STAND = (() => {
  const P = F.PORTAL
  const n = v(Math.sin(P.yaw), 0, Math.cos(P.yaw))
  const side = v(n.z, 0, -n.x)
  const front = v(P.x, 0, P.z).addScaledVector(n, 2.2 + 0.9).addScaledVector(side, 1.3)
  const pos = front.clone().setY(F.BOOTH.h)
  return {
    pos,
    /** 板の向き（正面の法線） */
    normal: n.clone(),
    yaw: P.yaw,
    /** 読む人が立つ所（台の正面 1.1m） */
    stand: pos.clone().addScaledVector(n, 1.1),
  }
})()

/** 疑似 QR（位置検出の 3 つの角＋ランダムな点） */
function drawQr(g: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number, ink = '#0c1430', paper = '#ffffff'): void {
  const n = 25
  const cell = size / n
  g.fillStyle = paper
  g.fillRect(x - cell * 2, y - cell * 2, size + cell * 4, size + cell * 4)
  const rng = mulberry32(seed)
  g.fillStyle = ink
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (rng() < 0.46) g.fillRect(x + i * cell, y + j * cell, cell + 0.5, cell + 0.5)
  const finder = (fx: number, fy: number) => {
    g.fillStyle = paper
    g.fillRect(x + fx * cell - cell, y + fy * cell - cell, cell * 9, cell * 9)
    g.fillStyle = ink
    g.fillRect(x + fx * cell, y + fy * cell, cell * 7, cell * 7)
    g.fillStyle = paper
    g.fillRect(x + (fx + 1) * cell, y + (fy + 1) * cell, cell * 5, cell * 5)
    g.fillStyle = ink
    g.fillRect(x + (fx + 2) * cell, y + (fy + 2) * cell, cell * 3, cell * 3)
  }
  finder(0, 0)
  finder(n - 7, 0)
  finder(0, n - 7)
}

function paintBoard(rec: QrRecord) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h)
    g.fillStyle = '#0e1d4e'
    g.beginPath()
    g.roundRect(6, 6, w - 12, h - 12, 34)
    g.fill()
    g.strokeStyle = rec.gold ? '#ffd447' : '#7fe9ff'
    g.lineWidth = 12
    g.stroke()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#bfefff'
    g.font = font(800, 40)
    g.fillText('イドーのかんばん　QR', w / 2, 62)
    const s = w * 0.66
    drawQr(g, (w - s) / 2, 112, s, rec.seed)
    g.fillStyle = rec.gold ? '#ffe9a0' : '#ffffff'
    g.font = font(800, 50)
    g.fillText(rec.era, w / 2, h - 130)
    g.fillStyle = '#e8f4ff'
    g.font = font(800, rec.title.length > 12 ? 36 : 42)
    g.fillText(rec.title, w / 2, h - 70)
  }
}

const scanVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const scanFrag = /* glsl */ `
uniform float uTime;
uniform float uScan;
uniform float uNear;
varying vec2 vUv;
void main() {
  float y = fract(uTime * 0.9);
  float line = smoothstep(0.03, 0.0, abs(vUv.y - y)) * uScan;
  float frame = (step(vUv.x, 0.025) + step(0.975, vUv.x) + step(vUv.y, 0.02) + step(0.98, vUv.y)) * (uNear * 0.7 + uScan);
  float glow = uScan * 0.22;
  vec3 c = vec3(0.4, 1.6, 2.6) * (line * 2.0 + min(frame, 1.0) + glow);
  float a = clamp(line + min(frame, 1.0) * 0.8 + glow, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
}
`

export type QrStandParts = {
  group: THREE.Group
  /** 板の QR のまん中（目の光の先） */
  qrPos: THREE.Vector3
  /** 読む人が立つ所 */
  stand: THREE.Vector3
  setRecord(rec: QrRecord): void
  readonly record: QrRecord
  /** 読み取りの線（0..1） */
  setScan(k: number): void
  /** 近くに来た（枠がうすく光る。0..1） */
  setNear(k: number): void
  update(dt: number): void
}

export function buildQrStand(root: THREE.Group, col: ColliderList): QrStandParts {
  const S = QR_STAND
  const group = new THREE.Group()
  group.name = 'qr_stand'
  group.position.copy(S.pos)
  group.rotation.y = S.yaw
  root.add(group)
  const white = new THREE.MeshStandardMaterial({ color: '#f3f6fb', roughness: 0.35, metalness: 0.05 })
  const navy = new THREE.MeshStandardMaterial({ color: '#1b2752', roughness: 0.4, metalness: 0.3 })
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 3.4), toneMapped: false })
  // 台（白い柱と、上の斜めの台）
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.12, 24), navy)
  base.position.y = 0.06
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.22), white)
  post.position.y = 0.6
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.022, 6, 40), glow)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.13
  group.add(base, post, ring)
  // 上の板（大きな QR）：少し上を向けて、立った人の目の高さで読める
  const TILT = -0.38
  const board = new THREE.Group()
  board.position.set(0, 1.32, 0.02)
  board.rotation.x = TILT
  group.add(board)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.04, 0.06), navy)
  frame.position.z = -0.035
  board.add(frame)
  let rec: QrRecord = QR_RECORDS.idle
  const tex = canvasTexture(512, 620, paintBoard(rec), 8)
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.97), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
  board.add(face)
  const u = { uTime, uScan: { value: 0 }, uNear: { value: 0 } }
  const scan = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.99),
    new THREE.ShaderMaterial({ vertexShader: scanVert, fragmentShader: scanFrag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  )
  scan.position.z = 0.006
  board.add(scan)
  // 両わきの小さな札（世界じゅうのかんばんの QR）
  const cards: THREE.Mesh[] = []
  const cardTex = canvasTexture(256, 160, (g, w, h) => {
    g.fillStyle = '#0e1d4e'
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 3; i++) {
      drawQr(g, 12 + i * 82, 30, 66, 300 + i * 17)
    }
  })
  const cardMat = new THREE.MeshBasicMaterial({ map: cardTex, toneMapped: false })
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.2), white)
    arm.position.set(s * 0.6, 1.0, 0)
    group.add(arm)
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.21), cardMat)
    card.position.set(s * 0.6, 1.03, 0.02)
    card.rotation.x = -Math.PI / 2 + 0.5
    group.add(card)
    cards.push(card)
  }
  for (const m of [base, post, frame]) m.castShadow = true
  col.box(S.pos.x, S.pos.y + 0.6, S.pos.z, 0.6, 1.2, 0.6, S.yaw)
  group.updateMatrixWorld(true)
  const qrPos = board.localToWorld(v(0, 0.06, 0.01))
  let scanK = 0
  let nearK = 0
  return {
    group,
    qrPos,
    stand: S.stand.clone(),
    get record() {
      return rec
    },
    setRecord(r: QrRecord) {
      if (r.seed === rec.seed && r.title === rec.title && r.era === rec.era) return
      rec = r
      const img = tex.image as HTMLCanvasElement
      const g = img.getContext('2d') as CanvasRenderingContext2D
      paintBoard(r)(g, img.width, img.height)
      tex.needsUpdate = true
    },
    setScan(k: number) {
      scanK = k
    },
    setNear(k: number) {
      nearK = k
    },
    update(dt: number) {
      u.uScan.value += (scanK - u.uScan.value) * Math.min(1, dt * 6)
      u.uNear.value += (nearK - u.uNear.value) * Math.min(1, dt * 4)
      scan.visible = u.uScan.value > 0.01 || u.uNear.value > 0.01
    },
  }
}
