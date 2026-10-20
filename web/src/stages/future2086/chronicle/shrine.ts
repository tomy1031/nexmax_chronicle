// 時の神さまのほこら（物語 v7 の 7・9・10 章）。300 年の古さ：くすんだ木、瓦、苔、石の台。
// 妻入り（正面が三角の妻）で、妻に東の窓（丸窓）。観音開きの格子戸の中の棚に、源兵衛のからくりの箱と時計じかけの錠前。
// ・openDoors(k)：格子戸を開く（0..1）
// ・openBox()：錠前の目もりが回って「カチリ」→ ふたが開く → 中の「時を裂く爪」が光る（約 3 秒。終わると resolve）
// ・setLockPulse(k)：石と錠前の音がそろう合図（錠前が青く脈打つ）　・setPlateGlow(k)：ふたの裏の小さな板（佐伯さんの声）
// ・setSunbeam(k)：東の窓から朝日がさしこむ　・takeClaw()：爪を取り出したあと（箱は空）　・reset()：元に戻す（ループ・歴史の切り替え）
// 正面はローカル +Z。yaw は正面の法線の向き（π/2 で東）。
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { uTime } from '../../../render/materials'
import type { FCtx } from '../kit2086'
import { additive, canvasTexture, clearGlass, font, softDotTexture, verticalText } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type ShrineParts = {
  group: THREE.Group
  /** 箱の中心（ワールド） */
  boxPos: THREE.Vector3
  /** 正面に立つ所（ワールド。ほこらを見る） */
  front: THREE.Vector3
  /** 東の窓（ワールド） */
  windowPos: THREE.Vector3
  readonly boxOpen: boolean
  openDoors(k: number): void
  openBox(): Promise<void>
  setLockPulse(k: number): void
  setPlateGlow(k: number): void
  setSunbeam(k: number): void
  takeClaw(): void
  reset(): void
  update(dt: number): void
}

const OLD_WOOD = '#8a6a4e'
const DARK_WOOD = '#5a4232'

function paintPlaque(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#3a2618'
  g.fillRect(0, 0, w, h)
  g.strokeStyle = '#c99a3c'
  g.lineWidth = 8
  g.strokeRect(8, 8, w - 16, h - 16)
  g.fillStyle = '#f2d48a'
  g.font = font(800, 60, '"Yuji Boku", "Hiragino Mincho ProN", "Yu Mincho", serif')
  verticalText(g, '時の神', w / 2, 34, 60, 1.08)
}

/** 格子戸 1 枚（ヒンジが原点。開く向きに +x へ伸びる）の形 */
function doorGeometry(w: number, h: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
    g.translate(x, y, z)
    parts.push(g.index ? g.toNonIndexed() : g)
  }
  const t = 0.045
  add(new THREE.BoxGeometry(w, t, 0.04), w / 2, h - t / 2, 0)
  add(new THREE.BoxGeometry(w, t, 0.04), w / 2, t / 2, 0)
  add(new THREE.BoxGeometry(t, h, 0.04), t / 2, h / 2, 0)
  add(new THREE.BoxGeometry(t, h, 0.04), w - t / 2, h / 2, 0)
  for (let i = 1; i < 5; i++) add(new THREE.BoxGeometry(0.018, h - t * 2, 0.025), (w * i) / 5, h / 2, 0)
  for (const y of [0.32, 0.62]) add(new THREE.BoxGeometry(w - t * 2, 0.018, 0.025), w / 2, h * y, 0)
  add(new THREE.BoxGeometry(w - t * 2, h * 0.24, 0.02), w / 2, h * 0.14, -0.005)
  for (const g of parts) g.deleteAttribute('uv')
  const pos: number[] = []
  const nor: number[] = []
  for (const g of parts) {
    pos.push(...(g.attributes.position.array as Float32Array))
    nor.push(...(g.attributes.normal.array as Float32Array))
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  return out
}

export function buildShrine(c: FCtx, parent: THREE.Group, pos: THREE.Vector3, yaw: number): ShrineParts {
  const group = new THREE.Group()
  group.name = 'toki_shrine'
  group.position.copy(pos)
  group.rotation.y = yaw
  parent.add(group)
  const base = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), v(1, 1, 1))
  /** ローカル（正面 +Z）の置き場所 → ワールドの行列 */
  const L = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => base.clone().multiply(M(x, y, z, rx, ry, rz, sx, sy, sz))
  const W = (x: number, y: number, z: number) => v(x, y, z).applyMatrix4(base)
  const moss = new THREE.Color('#6d8f3c')

  // ---- 石の台（2 段）と正面の石段、苔
  c.b.add(rbox(2.2, 0.32, 2.0, 0.05), c.m.stoneWall, L(0, 0.16, 0), { texM: 1.2, tint: '#b8b2a6' })
  c.b.add(rbox(1.75, 0.32, 1.55, 0.05), c.m.stoneWall, L(0, 0.48, -0.05), { texM: 1.2, tint: '#c4beb2' })
  c.b.add(rbox(1.0, 0.16, 0.42, 0.04), c.m.stoneWall, L(0, 0.08, 1.2), { texM: 1.0, tint: '#beb8ac' })
  for (const [x, z, s] of [
    [-0.95, 0.85, 0.22],
    [0.98, -0.7, 0.26],
    [-0.8, -0.95, 0.2],
    [0.7, 0.62, 0.14],
  ] as const)
    c.b.add(new THREE.SphereGeometry(s, 8, 5), c.m.grass, L(x, 0.33, z, 0, 0, 0, 1.4, 0.35, 1.1), { tint: moss })
  // 当たり判定（台と本体）
  {
    const p = W(0, 0, -0.05)
    c.col.box(p.x, 0.9, p.z, Math.abs(Math.sin(yaw)) > 0.5 ? 1.6 : 2.1, 1.8, Math.abs(Math.sin(yaw)) > 0.5 ? 2.1 : 1.6)
  }

  // ---- 本体（くすんだ木の柱と板壁）
  const bw = 1.2
  const bd = 0.95
  const y0 = 0.64
  const y1 = 1.9
  for (const [x, z] of [
    [-bw / 2, -bd / 2],
    [bw / 2, -bd / 2],
    [-bw / 2, bd / 2],
    [bw / 2, bd / 2],
  ] as const)
    c.b.add(rbox(0.1, y1 - y0, 0.1, 0.015), c.m.wood, L(x, (y0 + y1) / 2, z), { tint: DARK_WOOD, texM: 0.8 })
  c.b.add(rbox(bw, y1 - y0 - 0.1, 0.05, 0.01), c.m.wood, L(0, (y0 + y1) / 2, -bd / 2 + 0.02), { tint: OLD_WOOD, texM: 0.8 })
  for (const s of [-1, 1]) c.b.add(rbox(0.05, y1 - y0 - 0.1, bd, 0.01), c.m.wood, L((s * bw) / 2 - s * 0.02, (y0 + y1) / 2, 0), { tint: OLD_WOOD, texM: 0.8 })
  c.b.add(rbox(bw + 0.1, 0.06, bd + 0.1, 0.01), c.m.wood, L(0, y0 + 0.03, 0), { tint: DARK_WOOD })
  // 中の暗がり（扉を開けると見える）と棚
  c.b.add(new THREE.PlaneGeometry(bw - 0.1, y1 - y0 - 0.1), c.m.darkLacquer, L(0, (y0 + y1) / 2, -bd / 2 + 0.05), { tint: '#3a2a20' })
  c.b.add(rbox(bw - 0.12, 0.05, 0.55, 0.01), c.m.wood, L(0, y0 + 0.24, -0.05), { tint: '#9a7a5a' })
  // 正面の上の梁と、扁額「時の神」
  c.b.add(rbox(bw + 0.2, 0.12, 0.12, 0.02), c.m.wood, L(0, y1 - 0.02, bd / 2 + 0.03), { tint: DARK_WOOD })
  {
    const tex = canvasTexture(128, 320, paintPlaque)
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.42), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))
    pl.position.set(0, y1 + 0.2, bd / 2 + 0.1)
    group.add(pl)
  }
  // しめ縄と紙垂
  {
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 12; i++) {
      const t = i / 12
      pts.push(W(-bw / 2 - 0.08 + (bw + 0.16) * t, y1 - 0.12 - Math.sin(Math.PI * t) * 0.08, bd / 2 + 0.1))
    }
    c.b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.03, 6), c.m.rope, undefined, { tint: '#e2cf9a' })
    for (const x of [-0.36, -0.12, 0.12, 0.36]) {
      for (let k = 0; k < 3; k++) c.b.add(new THREE.BoxGeometry(0.06, 0.07, 0.004), c.m.plain, L(x + (k % 2 ? 0.025 : -0.025), y1 - 0.2 - k * 0.07 - Math.cos(x * 4) * 0.03, bd / 2 + 0.11), { tint: '#ffffff', cast: false })
    }
  }

  // ---- 屋根（妻入り：棟は前後、左右へ流れる瓦。苔むしている）
  const ry = y1 + 0.02
  const rise = 0.5
  const half = 0.98
  const len = 1.85
  const zc = 0.08
  const ang = Math.atan2(rise, half)
  const sl = Math.hypot(half, rise)
  for (const s of [-1, 1]) {
    c.b.add(rbox(sl + 0.06, 0.1, len, 0.03), c.m.roof, L((s * half) / 2, ry + rise / 2, zc, 0, 0, -s * ang), { texM: 1.2, tint: '#7f8a86', uAxis: 2 })
    // 軒先の丸瓦
    for (let i = 0; i < 8; i++) c.b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 6), c.m.roof, L(s * (half + 0.01), ry - 0.02, zc - len / 2 + (i + 0.5) * (len / 8), 0, 0, Math.PI / 2), { tint: '#8d9692', uv: 'scale', uvScale: [0.1, 0.1] })
    // 屋根の苔
    for (let i = 0; i < 4; i++) {
      const t = 0.25 + (i % 2) * 0.35
      c.b.add(new THREE.SphereGeometry(0.13 + (i % 3) * 0.03, 8, 5), c.m.grass, L(s * half * (1 - t), ry + rise * t + 0.05, zc - 0.6 + i * 0.4, 0, 0, -s * ang, 1.3, 0.3, 1.0), { tint: moss })
    }
  }
  c.b.add(rbox(0.16, 0.14, len + 0.1, 0.04), c.m.roof, L(0, ry + rise + 0.05, zc), { tint: '#5d6663' })
  c.b.add(new THREE.CylinderGeometry(0.07, 0.07, len + 0.15, 8), c.m.roof, L(0, ry + rise + 0.13, zc, Math.PI / 2, 0, 0), { tint: '#6c7572', uv: 'scale', uvScale: [0.3, 2] })
  // 妻（正面の三角の板）と東の窓（丸窓：格子と古いガラス）
  {
    const tri = new THREE.Shape()
    tri.moveTo(-bw / 2 - 0.05, 0)
    tri.lineTo(bw / 2 + 0.05, 0)
    tri.lineTo(0, rise * ((bw / 2 + 0.05) / half) + 0.02)
    tri.closePath()
    const g = new THREE.ShapeGeometry(tri)
    c.b.add(g, c.m.wood, L(0, ry - 0.01, bd / 2 + 0.035), { tint: OLD_WOOD, texM: 0.6 })
    c.b.add(new THREE.TorusGeometry(0.12, 0.022, 6, 20), c.m.wood, L(0, ry + 0.16, bd / 2 + 0.05), { tint: DARK_WOOD })
    c.b.add(new THREE.CircleGeometry(0.11, 18), clearGlass(), L(0, ry + 0.16, bd / 2 + 0.04), { cast: false })
    c.b.add(new THREE.BoxGeometry(0.01, 0.22, 0.012), c.m.wood, L(0, ry + 0.16, bd / 2 + 0.052), { tint: DARK_WOOD })
    c.b.add(new THREE.BoxGeometry(0.22, 0.01, 0.012), c.m.wood, L(0, ry + 0.16, bd / 2 + 0.052), { tint: DARK_WOOD })
  }
  // 小さな石灯籠（左右）と賽銭箱
  for (const s of [-1, 1]) {
    const x = s * 1.32
    const z = 0.75
    c.b.add(new THREE.CylinderGeometry(0.16, 0.2, 0.14, 8), c.m.stoneWall, L(x, 0.07, z), { tint: '#aaa498', uv: 'scale', uvScale: [0.5, 0.2] })
    c.b.add(new THREE.CylinderGeometry(0.06, 0.07, 0.5, 8), c.m.stoneWall, L(x, 0.39, z), { tint: '#b2ac9f', uv: 'scale', uvScale: [0.3, 0.5] })
    c.b.add(rbox(0.26, 0.2, 0.26, 0.03), c.m.stoneWall, L(x, 0.74, z), { tint: '#b8b2a5', texM: 0.5 })
    c.b.add(new THREE.ConeGeometry(0.24, 0.16, 4), c.m.stoneWall, L(x, 0.92, z, 0, Math.PI / 4, 0), { tint: '#a8a295', uv: 'scale', uvScale: [0.4, 0.3] })
    c.b.add(new THREE.SphereGeometry(0.05, 8, 6), c.m.grass, L(x, 0.95, z, 0, 0, 0, 2.2, 0.6, 2.2), { tint: moss })
    c.b.add(new THREE.PlaneGeometry(0.12, 0.1), c.fm.glow, L(x, 0.74, z + 0.135), { tint: new THREE.Color(2.2, 1.3, 0.5), cast: false })
    const lp = W(x, 0.8, z + 0.3)
    c.lights.push({ pos: lp, color: '#ffb466', intensity: 1.2, dist: 4 })
  }
  c.b.add(rbox(0.5, 0.28, 0.3, 0.02), c.m.wood, L(0, 0.64 + 0.14, 0.62), { tint: DARK_WOOD })
  for (let i = 0; i < 6; i++) c.b.add(new THREE.BoxGeometry(0.46, 0.012, 0.025), c.m.wood, L(0, 0.93, 0.5 + i * 0.045), { tint: '#3a2a1e', cast: false })

  // ================================================================== 動くもの（group の中のローカル座標）
  const woodMat = new THREE.MeshStandardMaterial({ color: OLD_WOOD, map: c.m.wood.map, roughness: 0.85 })
  const doorH = y1 - y0 - 0.16
  const doorW = bw / 2 - 0.04
  const doorGeo = doorGeometry(doorW, doorH)
  const doors = [-1, 1].map((s) => {
    const pivot = new THREE.Group()
    pivot.position.set(s * (bw / 2 - 0.02), y0 + 0.08, bd / 2 + 0.01)
    const m = new THREE.Mesh(doorGeo, woodMat)
    m.castShadow = true
    // 左の扉は +x へ、右の扉は -x へ伸びる
    m.scale.x = -s
    pivot.add(m)
    group.add(pivot)
    return pivot
  })

  // からくりの箱（源兵衛の箱：黒漆に真鍮の角金具）
  const box = new THREE.Group()
  box.position.set(0, y0 + 0.265, 0.02)
  group.add(box)
  const lacquer = new THREE.MeshStandardMaterial({ color: '#2a1c16', roughness: 0.35, metalness: 0.05 })
  const brass = new THREE.MeshStandardMaterial({ color: '#c79a46', roughness: 0.3, metalness: 0.9 })
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.2, 0.3), lacquer)
  body.position.y = 0.1
  box.add(body)
  for (const [x, z] of [
    [-0.215, -0.135],
    [0.215, -0.135],
    [-0.215, 0.135],
    [0.215, 0.135],
  ] as const) {
    const k = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.21, 0.045), brass)
    k.position.set(x, 0.1, z)
    box.add(k)
  }
  // ふた（後ろの辺がヒンジ）
  const lidPivot = new THREE.Group()
  lidPivot.position.set(0, 0.2, -0.15)
  box.add(lidPivot)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.31), lacquer)
  lid.position.set(0, 0.025, 0.15)
  lidPivot.add(lid)
  const lidTrim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.33), brass)
  lidTrim.position.set(0, 0.008, 0.15)
  lidPivot.add(lidTrim)
  // ふたの裏の小さな板（佐伯さんの声）
  const plateMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.5, 0.8), toneMapped: false })
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), plateMat)
  plate.position.set(0, -0.001, 0.15)
  plate.rotation.x = Math.PI / 2
  lidPivot.add(plate)
  // 時計じかけの錠前（正面）：真鍮の丸い板・目もりの針・掛け金
  const lock = new THREE.Group()
  lock.position.set(0, 0.11, 0.155)
  box.add(lock)
  const lockFace = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 20), brass)
  lockFace.rotation.x = Math.PI / 2
  lock.add(lockFace)
  const lockGlowMat = additive(new THREE.Color(0.4, 1.4, 2.6), 0)
  const lockGlow = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), lockGlowMat)
  lockGlow.position.z = 0.013
  lock.add(lockGlow)
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.055, 0.006), new THREE.MeshStandardMaterial({ color: '#1a1a24' }))
  hand.geometry.translate(0, 0.024, 0)
  hand.position.z = 0.012
  lock.add(hand)
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.004), lacquer)
    const a = (i / 12) * Math.PI * 2
    t.position.set(Math.sin(a) * 0.055, Math.cos(a) * 0.055, 0.012)
    t.rotation.z = -a
    lock.add(t)
  }
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.009, 6, 14, Math.PI), brass)
  shackle.position.set(0, 0.075, 0.0)
  lock.add(shackle)

  // 中の「時を裂く爪」：真鍮の歯車の台に、青い刃のかけら（光る）
  const claw = new THREE.Group()
  claw.position.set(0, 0.11, 0)
  box.add(claw)
  const gearDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12), brass)
  claw.add(gearDisk)
  for (let i = 0; i < 12; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.02, 0.018), brass)
    const a = (i / 12) * Math.PI * 2
    t.position.set(Math.cos(a) * 0.066, 0, Math.sin(a) * 0.066)
    t.rotation.y = -a
    claw.add(t)
  }
  const bladeMat = new THREE.MeshStandardMaterial({ color: '#6fd6ff', emissive: new THREE.Color('#3fb8ff'), emissiveIntensity: 0.3, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 })
  const blade = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), bladeMat)
  blade.scale.set(0.7, 1.9, 0.45)
  blade.position.set(0.02, 0.1, 0)
  blade.rotation.z = -0.35
  claw.add(blade)
  const haloMat = additive(new THREE.Color(0.4, 1.3, 2.6), 0, softDotTexture())
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), haloMat)
  halo.position.set(0, 0.16, 0.12)
  halo.renderOrder = 6
  box.add(halo)
  // 光の柱（箱が開いたとき、上へ）
  const beamMat = additive(new THREE.Color(0.3, 1.0, 2.2), 0)
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 1.1, 16, 1, true), beamMat)
  beam.position.set(0, 0.7, 0)
  beam.renderOrder = 6
  box.add(beam)
  // 東の窓から朝日（ほこらの中へ斜めに）
  const sunMat = additive(new THREE.Color(2.0, 1.5, 0.8), 0)
  const sun = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.9, 12, 1, true), sunMat)
  sun.position.set(0, ry - 0.2, bd / 2 - 0.3)
  sun.rotation.x = 0.9
  sun.renderOrder = 6
  group.add(sun)
  const windowGlow = new THREE.Mesh(new THREE.CircleGeometry(0.11, 18), additive(new THREE.Color(2.4, 1.8, 0.9), 0))
  windowGlow.position.set(0, ry + 0.16, bd / 2 + 0.045)
  group.add(windowGlow)

  // ---- 状態
  let doorK = 0
  let doorTarget = 0
  let boxT = -1
  let opened = false
  let lockPulse = 0
  let resolveOpen: (() => void) | null = null
  const setGlow = (k: number) => {
    bladeMat.emissiveIntensity = 0.3 + k * 3.2
    haloMat.opacity = k * 0.85
    beamMat.opacity = k * 0.45
  }

  const parts: ShrineParts = {
    group,
    boxPos: W(0, y0 + 0.37, 0.02),
    front: W(0, 0, 2.0),
    windowPos: W(0, ry + 0.16, bd / 2 + 0.05),
    get boxOpen() {
      return opened
    },
    openDoors(k: number) {
      doorTarget = Math.max(0, Math.min(1, k))
    },
    openBox() {
      if (opened) return Promise.resolve()
      doorTarget = 1
      boxT = 0
      return new Promise<void>((r) => (resolveOpen = r))
    },
    setLockPulse(k: number) {
      lockPulse = Math.max(0, Math.min(1, k))
    },
    setPlateGlow(k: number) {
      plateMat.color.setRGB(0.25 + k * 1.8, 0.5 + k * 1.6, 0.8 + k * 1.6)
    },
    setSunbeam(k: number) {
      sunMat.opacity = k * 0.35
      ;(windowGlow.material as THREE.MeshBasicMaterial).opacity = k
    },
    takeClaw() {
      claw.visible = false
      setGlow(0.15)
    },
    reset() {
      doorK = doorTarget = 0
      boxT = -1
      opened = false
      claw.visible = true
      claw.position.y = 0.11
      lidPivot.rotation.x = 0
      shackle.position.y = 0.075
      shackle.rotation.y = 0
      hand.rotation.z = 0
      setGlow(0)
      lockPulse = 0
      lockGlowMat.opacity = 0
      for (const d of doors) d.rotation.y = 0
    },
    update(dt: number) {
      // 扉
      doorK += (doorTarget - doorK) * Math.min(1, dt * 3)
      doors[0].rotation.y = -doorK * 1.9
      doors[1].rotation.y = doorK * 1.9
      // 錠前の脈（コチ、コチ）
      const t = uTime.value
      const tick = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 8)
      lockGlowMat.opacity = Math.max(lockPulse * (0.35 + 0.65 * tick), boxT >= 0 && boxT < 1.7 ? 0.9 : 0)
      if (boxT < 0) {
        if (!opened && lockPulse > 0) hand.rotation.z = -Math.floor(t * 2) * (Math.PI / 6)
        return
      }
      boxT += dt
      // 0.6〜1.5 秒：目もりの針が速く回る → カチリ（掛け金が上がって回る）
      if (boxT > 0.6 && boxT < 1.5) hand.rotation.z -= dt * 18
      if (boxT >= 1.5) {
        const k = Math.min(1, (boxT - 1.5) / 0.15)
        shackle.position.y = 0.075 + k * 0.03
        shackle.rotation.y = k * 1.2
      }
      // 1.7〜2.7 秒：ふたが開く
      const lk = Math.min(1, Math.max(0, (boxT - 1.7) / 1.0))
      lidPivot.rotation.x = -lk * lk * (3 - 2 * lk) * 1.95
      // 2.0〜3.2 秒：爪が光って少し浮く
      const gk = Math.min(1, Math.max(0, (boxT - 2.0) / 1.2))
      setGlow(gk * (0.85 + 0.15 * Math.sin(t * 6)))
      claw.position.y = 0.11 + gk * 0.07
      claw.rotation.y += dt * gk * 0.8
      if (boxT > 3.2 && !opened) {
        opened = true
        resolveOpen?.()
        resolveOpen = null
      }
    },
  }
  return parts
}
