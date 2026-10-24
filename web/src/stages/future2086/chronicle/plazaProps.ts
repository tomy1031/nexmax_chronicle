// 広場に足す小物（物語 v7）：
// ・星のキーホルダーの屋台（1章：F で買う。同じ物が並ぶ。ループで元にもどる resetStall()）
// ・ベンチ（4章の終わりにネクマックスがすわりこむ。結末で「ひとりでベンチにすわってた日も、あったんだ」）
// ・星のキーホルダーの形（屋台の品・ネクマックスのポケット・ソラにわたす物で同じ形を使う：createStarKeychain）
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { uTime } from '../../../render/materials'
import { woodBox, WOOD } from '../../../world/edo/kit'
import { NEON, chochin, fbox, neon, type FCtx } from '../kit2086'
import { terraceMaterials } from '../terraces2086'
import { BENCH, KEY_STALL } from './layoutChronicle'
import { canvasTexture, font } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ 星のキーホルダー

let starGeo: THREE.BufferGeometry | null = null
/** 星（5 つの角）＋輪＋短い鎖をひとつにした形（原点＝輪の上。下へ垂れる。大きさ約 9cm） */
export function starKeychainGeometry(): THREE.BufferGeometry {
  if (starGeo) return starGeo
  const shape = new THREE.Shape()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    const r = i % 2 ? 0.022 : 0.05
    const x = Math.cos(a) * r
    const y = Math.sin(a) * r
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  const star = new THREE.ExtrudeGeometry(shape, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 })
  star.translate(0, -0.085, -0.007)
  const ring = new THREE.TorusGeometry(0.012, 0.003, 6, 14)
  ring.translate(0, -0.012, 0)
  const chain = new THREE.CylinderGeometry(0.002, 0.002, 0.024, 4)
  chain.translate(0, -0.035, 0)
  const parts = [star, ring, chain].map((g) => {
    const n = g.index ? g.toNonIndexed() : g
    n.deleteAttribute('uv')
    return n
  })
  const pos: number[] = []
  const nor: number[] = []
  for (const g of parts) {
    pos.push(...(g.attributes.position.array as Float32Array))
    nor.push(...(g.attributes.normal.array as Float32Array))
  }
  starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  starGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  return starGeo
}

/** ひとつの星のキーホルダー（手に持たせる・ポケットから出す・ソラにわたす）。scale は見せやすさの倍率 */
export function createStarKeychain(scale = 1): THREE.Mesh {
  const m = new THREE.Mesh(starKeychainGeometry(), new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: new THREE.Color('#ffb020'), emissiveIntensity: 0.45, roughness: 0.3, metalness: 0.4 }))
  m.scale.setScalar(scale)
  m.name = 'star_keychain'
  m.castShadow = true
  return m
}

export type KeychainStall = {
  /** 買う所（屋台の前・足元） */
  buy: THREE.Vector3
  /** カウンターの上の見本（カメラで寄る所） */
  showcase: THREE.Vector3
  /** 並んでいる数 */
  readonly count: number
  /** ひとつ売る（並びから消える）。消えた品の位置を返す（手元へ飛ばす演出に） */
  takeOne(): THREE.Vector3 | null
  /** ループの朝：売る前の並びにもどす */
  resetStall(): void
  update(dt: number): void
}

function paintStallSign(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.clearRect(0, 0, w, h)
  g.fillStyle = 'rgba(40, 20, 90, 0.8)'
  g.beginPath()
  g.roundRect(8, 8, w - 16, h - 16, h / 2 - 8)
  g.fill()
  g.strokeStyle = '#ffe07a'
  g.lineWidth = 10
  g.stroke()
  g.fillStyle = '#fff3c4'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(800, Math.round(h * 0.42))
  g.fillText('★ ほしの小物 ★', w / 2, h * 0.42)
  g.font = font(700, Math.round(h * 0.18))
  g.fillStyle = '#ffd6f0'
  g.fillText('おそろいの 星のキーホルダー', w / 2, h * 0.76)
}

export function buildKeychainStall(c: FCtx, root: THREE.Group): KeychainStall {
  const S = KEY_STALL
  const tm = terraceMaterials(c)
  const x = S.x
  const z = S.z
  const half = S.w / 2
  const frontX = x - S.d / 2
  // カウンター（白い台・光る縁）と、店番の台
  fbox(c, tm.pearl, x - 0.85, 0.5, z, 0.82, 1.0, S.w - 0.3, { r: 0.18, tint: '#ffffff' })
  fbox(c, tm.pearl, x - 0.85, 1.03, z, 0.96, 0.06, S.w - 0.18, { r: 0.03, tint: '#f4f7fb' })
  neon(c, v(frontX + 0.46, 0.14, z - half + 0.2), v(frontX + 0.46, 0.14, z + half - 0.2), 0.04, NEON.cyan)
  neon(c, v(frontX + 0.44, 0.92, z - half + 0.2), v(frontX + 0.44, 0.92, z + half - 0.2), 0.04, new THREE.Color(2.6, 2.0, 0.5))
  fbox(c, tm.pearl, x + 0.15, 0.19, z, 0.95, 0.38, S.w - 0.7, { r: 0.08, tint: '#e8edf3' })
  // 後ろの板（品をつるす白い板・光る縁）
  fbox(c, tm.pearl, x + 0.95, 1.4, z, 0.12, 2.0, S.w - 0.4, { r: 0.05, tint: '#ffffff' })
  neon(c, v(x + 0.88, 2.42, z - half + 0.25), v(x + 0.88, 2.42, z + half - 0.25), 0.035, NEON.pink)
  // 屋根を支える腕（後ろから弧を描いて前へ）とガラスの屋根
  for (const s of [-1, 1]) {
    const pts = [
      [0.05, -1.2],
      [1.4, -1.2],
      [2.45, -1.12],
      [2.98, -0.55],
      [3.08, 0.4],
      [3.0, 1.2],
    ].map(([y, lz]) => v(x - lz, y, z + s * (half - 0.08)))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    c.b.add(new THREE.TubeGeometry(curve, 32, 0.08, 8, false), tm.pearl, undefined, { tint: '#ffffff' })
  }
  c.b.add(rbox(2.5, 0.05, S.w + 0.2, 0.03), tm.rail, M(x - 0.1, 3.12, z), { cast: false, receive: false })
  neon(c, v(x - 1.33, 3.08, z - half - 0.08), v(x - 1.33, 3.08, z + half + 0.08), 0.04, new THREE.Color(2.6, 2.0, 0.5))
  // 正面の丸い看板（ホロ風）
  const signTex = canvasTexture(1024, 256, paintStallSign, 8)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.3, 1.3, 1.3) }))
  sign.position.set(frontX - 0.05, 2.5, z)
  sign.rotation.y = -Math.PI / 2
  sign.renderOrder = 2
  root.add(sign)
  // 提灯ドローン（左右）
  for (const s of [-1, 1]) chochin(c, x - 1.15, 3.55, z + s * (half - 0.35), 'white', 0.78, { light: s > 0 })
  c.col.box(x + 0.1, 1.2, z, S.d - 0.1, 2.4, S.w)

  // ---- 品：後ろの板に 3 段 × 5 個、カウンターの上の台に 4 個（同じ物が並ぶ）
  const spots: Array<{ pos: THREE.Vector3; yaw: number }> = []
  for (let row = 0; row < 3; row++) for (let i = 0; i < 5; i++) spots.push({ pos: v(x + 0.86, 2.15 - row * 0.42, z - 0.9 + i * 0.45), yaw: -Math.PI / 2 })
  for (let i = 0; i < 4; i++) spots.push({ pos: v(frontX + 0.62, 1.2, z - 0.55 + i * 0.36), yaw: -Math.PI / 2 + 0.25 })
  // 小さなフック（後ろの板）とカウンターの上の小さな台
  for (const s of spots.slice(0, 15)) c.b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.08, 4), c.fm.metal, M(s.pos.x + 0.03, s.pos.y + 0.01, s.pos.z, 0, 0, Math.PI / 2), { cast: false })
  fbox(c, c.fm.navyGloss, frontX + 0.66, 1.1, z, 0.22, 0.06, 1.4, { r: 0.02 })
  for (let i = 0; i < 4; i++) c.b.add(new THREE.CylinderGeometry(0.005, 0.005, 0.14, 4), c.fm.metal, M(frontX + 0.66, 1.2, z - 0.55 + i * 0.36), { cast: false })
  const mat = new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: new THREE.Color('#ffb020'), emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 })
  const items = new THREE.InstancedMesh(starKeychainGeometry(), mat, spots.length)
  items.name = 'star_keychains'
  items.castShadow = true
  root.add(items)
  const dummy = new THREE.Object3D()
  const shown = spots.map(() => true)
  const place = (t: number) => {
    spots.forEach((s, i) => {
      dummy.position.copy(s.pos)
      dummy.rotation.set(0, s.yaw + Math.sin(t * 1.3 + i) * 0.25, Math.sin(t * 1.7 + i * 2) * 0.08)
      dummy.scale.setScalar(shown[i] ? 1.35 : 0)
      dummy.updateMatrix()
      items.setMatrixAt(i, dummy.matrix)
    })
    items.instanceMatrix.needsUpdate = true
  }
  place(0)
  // 量産型NEXMAXの店番は units（buildUnits）を additions が足す

  return {
    buy: S.buy.clone(),
    showcase: spots[spots.length - 2].pos.clone(),
    get count() {
      return shown.filter(Boolean).length
    },
    takeOne() {
      // カウンターの台の上から先に売れていく
      for (let i = spots.length - 1; i >= 0; i--) {
        if (shown[i]) {
          shown[i] = false
          return spots[i].pos.clone()
        }
      }
      return null
    },
    resetStall() {
      shown.fill(true)
    },
    update() {
      place(uTime.value)
    },
  }
}

// ------------------------------------------------------------------ ベンチ

export type BenchParts = {
  /** すわる所（腰の高さの位置と、向き yaw：モデルの正面 -Z を回す角） */
  seat: { pos: THREE.Vector3; yaw: number }
  /** ベンチの前に立つ所 */
  front: THREE.Vector3
}

export function buildBench(c: FCtx): BenchParts {
  const B = BENCH
  const p = B.pos
  // 正面（すわった人が向く方）＝ yaw の向き。ベンチの長い辺はそれと直角
  const fwd = v(-Math.sin(B.yaw), 0, -Math.cos(B.yaw))
  const side = v(-fwd.z, 0, fwd.x)
  const rot = B.yaw
  // 木の座板と背もたれ（すのこ）、白い鉄の脚
  for (let i = 0; i < 4; i++) {
    const q = p.clone().addScaledVector(fwd, -0.17 + i * 0.11)
    woodBox(c, q.x, B.seatY, q.z, 1.7, 0.05, 0.09, { rotY: rot, tint: WOOD.honey })
  }
  for (let i = 0; i < 3; i++) {
    const back = p.clone().addScaledVector(fwd, -0.28)
    woodBox(c, back.x, B.seatY + 0.2 + i * 0.13, back.z, 1.7, 0.09, 0.04, { rotY: rot, rotX: 0.15, tint: WOOD.honey })
  }
  for (const s of [-0.72, 0.72]) {
    const q = p.clone().addScaledVector(side, s)
    fbox(c, c.fm.plastic, q.x, B.seatY / 2, q.z, 0.06, B.seatY, 0.5, { rotY: rot, r: 0.02, tint: '#f4f6f8' })
    const qb = q.clone().addScaledVector(fwd, -0.28)
    fbox(c, c.fm.plastic, qb.x, B.seatY + 0.25, qb.z, 0.06, 0.55, 0.06, { rotY: rot, r: 0.02, tint: '#f4f6f8' })
  }
  c.col.box(p.x, 0.25, p.z, 1.8, 0.5, 0.55, rot)
  // 横の街灯（夜にベンチだけ明るい）と小さな植え込み
  const lp = p.clone().addScaledVector(side, 1.25).addScaledVector(fwd, -0.3)
  c.b.add(new THREE.CylinderGeometry(0.05, 0.07, 3.0, 10), c.fm.metal, M(lp.x, 1.5, lp.z))
  c.b.add(new THREE.SphereGeometry(0.17, 14, 10), c.fm.glow, M(lp.x, 3.05, lp.z), { tint: NEON.warm, cast: false })
  c.b.add(new THREE.CylinderGeometry(0.22, 0.14, 0.08, 12), c.fm.darkMetal, M(lp.x, 3.22, lp.z))
  c.col.box(lp.x, 1.5, lp.z, 0.16, 3.0, 0.16)
  c.lights.push({ pos: v(lp.x, 2.9, lp.z), color: '#ffcf8a', intensity: 2.4, dist: 7 })
  const pl = p.clone().addScaledVector(side, -1.3).addScaledVector(fwd, -0.2)
  c.b.add(new THREE.CylinderGeometry(0.35, 0.3, 0.45, 16), c.fm.plastic, M(pl.x, 0.22, pl.z), { tint: '#eef2f5' })
  c.foliage.bush(pl.x, 0.4, pl.z, 0.4, 91, 0.9)
  c.col.box(pl.x, 0.22, pl.z, 0.6, 0.45, 0.6)
  return {
    seat: { pos: v(p.x, B.seatY, p.z).addScaledVector(fwd, 0.02), yaw: B.yaw },
    front: p.clone().addScaledVector(fwd, 1.0),
  }
}
