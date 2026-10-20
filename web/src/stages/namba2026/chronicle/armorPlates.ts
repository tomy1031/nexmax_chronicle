// よろいの影獣（物語 v7 の 6 章）の「よろい」：影の獣が、まわりの鉄の板や看板を体にはりつけた 3 枚の板。
// 戦闘（combat/）の欠け重（brute）を影の色で出し、その見た目にこの飾りを毎フレーム合わせる（当たり判定は持たない）。
// ・attach(target)：敵のモデルの root（EnemyHandle.model.root など）に合わせる。target の向き・大きさもそのまま
// ・strip(i, toward)：板がはがれて飛ぶ（toward＝プレイヤーの方へ。地面に落ちて、少しして消える）
// ・reattach(i, from)：まわりの看板から、板が飛んできてはりつく（体力が半分を切ると付け直しに走る、の見た目）
// ・count：はりついている枚数。points[i]：板の中心（ワールド。クローの的の point にそのまま使える）
// 板は影のすじ（黒むらさきのひも）で体にくっついている。はがれるとすじが切れる。
// 町に置く「よろいの元」（工事の看板・鉄板・IDO の立て看板）も同じ絵を使う（ArmorSources）。
import * as THREE from 'three'
import { mulberry32 } from '../../../render/noise'
import { makeCanvas } from '../../../render/textures'

export type ArmorKind = 'plate' | 'koji' | 'aframe'

/** 板をはる場所（欠け重のモデルの座標。モデルは -Z が正面、胸の高さ 1.4） */
export type ArmorSlot = { kind: ArmorKind; pos: THREE.Vector3; rot: THREE.Euler; w: number; h: number }

export const BRUTE_ARMOR_SLOTS: readonly ArmorSlot[] = [
  // 胸：さびた鉄板（いちばん大きい）
  { kind: 'plate', pos: new THREE.Vector3(0, 1.3, -0.68), rot: new THREE.Euler(0.2, Math.PI, 0.06), w: 1.08, h: 0.82 },
  // 左の肩から腕：工事中の看板
  { kind: 'koji', pos: new THREE.Vector3(-0.9, 1.72, -0.34), rot: new THREE.Euler(0.12, -2.6, 0.3), w: 0.86, h: 0.67 },
  // 右の肩から腕：IDO の立て看板
  { kind: 'aframe', pos: new THREE.Vector3(0.9, 1.66, -0.32), rot: new THREE.Euler(0.1, 2.62, -0.26), w: 0.62, h: 0.82 },
]

/** アトラスの中の矩形（u0,v0,u1,v1。キャンバスの上が v=1） */
type Rect = [number, number, number, number]
const S = 512
const R = (x: number, y: number, w: number, h: number): Rect => [x / S, 1 - (y + h) / S, (x + w) / S, 1 - y / S]
const RECTS: Record<ArmorKind | 'back', Rect> = {
  plate: R(0, 0, 256, 196),
  koji: R(256, 0, 256, 200),
  aframe: R(0, 256, 192, 256),
  back: R(260, 260, 40, 40),
}

let atlasTex: THREE.CanvasTexture | null = null
/** よろいの板の絵（さびた鉄板・工事中の看板・IDO の立て看板・裏の色） */
export function armorAtlas(): THREE.CanvasTexture {
  if (atlasTex?.image) return atlasTex
  const [c, g] = makeCanvas(S, S)
  const rng = mulberry32(66)
  g.fillStyle = '#404040'
  g.fillRect(0, 0, S, S)
  // ---- 鉄板（さび・リベット・ボルトの穴）
  {
    const [x, y, w, h] = [0, 0, 256, 196]
    const gr = g.createLinearGradient(x, y, x + w, y + h)
    gr.addColorStop(0, '#8c8c88')
    gr.addColorStop(1, '#6a6862')
    g.fillStyle = gr
    g.fillRect(x, y, w, h)
    // 縞鋼板のすべり止め
    g.strokeStyle = 'rgba(255,255,255,0.18)'
    g.lineWidth = 3
    for (let i = 0; i < 70; i++) {
      const px = x + 10 + (i % 10) * 24 + (Math.floor(i / 10) % 2) * 12
      const py = y + 14 + Math.floor(i / 10) * 26
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(px + 10, py + (i % 2 ? 6 : -6))
      g.stroke()
    }
    // さび
    for (let i = 0; i < 18; i++) {
      const px = x + rng() * w
      const py = y + rng() * h
      const r = 8 + rng() * 26
      const rg = g.createRadialGradient(px, py, 0, px, py, r)
      rg.addColorStop(0, 'rgba(160,80,30,0.65)')
      rg.addColorStop(1, 'rgba(160,80,30,0)')
      g.fillStyle = rg
      g.fillRect(px - r, py - r, r * 2, r * 2)
    }
    g.strokeStyle = '#3a3a38'
    g.lineWidth = 6
    g.strokeRect(x + 3, y + 3, w - 6, h - 6)
    g.fillStyle = '#2e2e2c'
    for (const [px, py] of [
      [14, 14],
      [w - 14, 14],
      [14, h - 14],
      [w - 14, h - 14],
    ]) {
      g.beginPath()
      g.arc(x + px, y + py, 6, 0, Math.PI * 2)
      g.fill()
    }
  }
  // ---- 工事中の看板（黄と黒のしま・おじぎをする人・「工事中」）
  {
    const [x, y, w, h] = [256, 0, 256, 200]
    g.fillStyle = '#ffd21f'
    g.fillRect(x, y, w, h)
    g.save()
    g.beginPath()
    g.rect(x, y, w, h)
    g.rect(x + 16, y + 16, w - 32, h - 32)
    g.clip('evenodd')
    g.fillStyle = '#1a1a1a'
    for (let k = -10; k < 20; k++) {
      g.beginPath()
      g.moveTo(x + k * 24, y)
      g.lineTo(x + k * 24 + 12, y)
      g.lineTo(x + k * 24 + 12 - h, y + h)
      g.lineTo(x + k * 24 - h, y + h)
      g.fill()
    }
    g.restore()
    g.fillStyle = '#ffffff'
    g.fillRect(x + 16, y + 16, w - 32, h - 32)
    // おじぎをする人（ヘルメット）
    g.fillStyle = '#2a5ad0'
    g.beginPath()
    g.arc(x + 62, y + 72, 14, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffd21f'
    g.beginPath()
    g.arc(x + 60, y + 66, 13, Math.PI, 0)
    g.fill()
    g.fillStyle = '#2a5ad0'
    g.beginPath()
    g.moveTo(x + 48, y + 86)
    g.lineTo(x + 84, y + 84)
    g.lineTo(x + 92, y + 150)
    g.lineTo(x + 62, y + 150)
    g.fill()
    g.fillStyle = '#d01c1c'
    g.font = '900 52px "Hiragino Sans","Noto Sans JP",sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('工事中', x + 160, y + 82)
    g.fillStyle = '#1a1a1a'
    g.font = '700 17px "Hiragino Sans","Noto Sans JP",sans-serif'
    g.fillText('ごめいわくを', x + 160, y + 126)
    g.fillText('おかけします', x + 160, y + 150)
  }
  // ---- IDO の立て看板（青い板に白い字）
  {
    const [x, y, w, h] = [0, 256, 192, 256]
    const gr = g.createLinearGradient(x, y, x, y + h)
    gr.addColorStop(0, '#2a62d8')
    gr.addColorStop(1, '#1a3f96')
    g.fillStyle = gr
    g.fillRect(x, y, w, h)
    g.strokeStyle = '#ffffff'
    g.lineWidth = 6
    g.strokeRect(x + 8, y + 8, w - 16, h - 16)
    g.fillStyle = '#ffffff'
    g.font = '900 54px "Orbitron","Hiragino Sans",sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('IDO', x + w / 2, y + 62)
    g.font = '800 24px "Hiragino Sans","Noto Sans JP",sans-serif'
    g.fillText('かんばん', x + w / 2, y + 118)
    g.fillText('試験中', x + w / 2, y + 150)
    g.font = '700 15px "Hiragino Sans","Noto Sans JP",sans-serif'
    g.fillText('NEXTMAKE', x + w / 2, y + 210)
    // 太陽と波のしるし
    g.strokeStyle = '#ffd56a'
    g.lineWidth = 4
    g.beginPath()
    g.arc(x + w / 2, y + 186, 14, Math.PI, 0)
    g.stroke()
  }
  // ---- 裏（黒っぽい鉄）
  g.fillStyle = '#2a2a2e'
  g.fillRect(260, 260, 40, 40)
  atlasTex = new THREE.CanvasTexture(c)
  atlasTex.colorSpace = THREE.SRGBColorSpace
  atlasTex.anisotropy = 4
  return atlasTex
}

/** 少し曲がった板（正面にアトラスの絵、裏と縁は暗い色）。中心が原点、正面は +Z */
export function armorPlateGeometry(kind: ArmorKind, w: number, h: number, bend = 0.08, thick = 0.035): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = RECTS[kind]
  const [b0, c0] = [RECTS.back[0] + 0.01, RECTS.back[1] + 0.01]
  const segX = 6
  const pos: number[] = []
  const nor: number[] = []
  const uv: number[] = []
  const zAt = (u: number) => -bend * (2 * u - 1) ** 2 // 端が後ろへ反る
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[], ua: number[], ub: number[], uc: number[], ud: number[]) => {
    for (const [p, t] of [
      [a, ua],
      [b, ub],
      [c, uc],
      [a, ua],
      [c, uc],
      [d, ud],
    ] as const) {
      pos.push(...p)
      nor.push(...n)
      uv.push(...t)
    }
  }
  for (let i = 0; i < segX; i++) {
    const s0 = i / segX
    const s1 = (i + 1) / segX
    const x0 = (s0 - 0.5) * w
    const x1 = (s1 - 0.5) * w
    const z0 = zAt(s0)
    const z1 = zAt(s1)
    const nx = -(z1 - z0)
    const nz = x1 - x0
    const l = Math.hypot(nx, nz)
    const n = [nx / l, 0, nz / l]
    const nb = [-n[0], 0, -n[2]]
    // 正面
    quad([x0, -h / 2, z0], [x1, -h / 2, z1], [x1, h / 2, z1], [x0, h / 2, z0], n, [u0 + (u1 - u0) * s0, v0], [u0 + (u1 - u0) * s1, v0], [u0 + (u1 - u0) * s1, v1], [u0 + (u1 - u0) * s0, v1])
    // 裏
    quad([x1, -h / 2, z1 - thick], [x0, -h / 2, z0 - thick], [x0, h / 2, z0 - thick], [x1, h / 2, z1 - thick], nb, [b0, c0], [b0, c0], [b0, c0], [b0, c0])
    // 上下の縁
    quad([x0, h / 2, z0], [x1, h / 2, z1], [x1, h / 2, z1 - thick], [x0, h / 2, z0 - thick], [0, 1, 0], [b0, c0], [b0, c0], [b0, c0], [b0, c0])
    quad([x1, -h / 2, z1], [x0, -h / 2, z0], [x0, -h / 2, z0 - thick], [x1, -h / 2, z1 - thick], [0, -1, 0], [b0, c0], [b0, c0], [b0, c0], [b0, c0])
  }
  // 左右の縁
  for (const s of [0, 1]) {
    const x = (s - 0.5) * w
    const z = zAt(s)
    const n = [s ? 1 : -1, 0, 0]
    if (s) quad([x, -h / 2, z], [x, -h / 2, z - thick], [x, h / 2, z - thick], [x, h / 2, z], n, [b0, c0], [b0, c0], [b0, c0], [b0, c0])
    else quad([x, -h / 2, z - thick], [x, -h / 2, z], [x, h / 2, z], [x, h / 2, z - thick], n, [b0, c0], [b0, c0], [b0, c0], [b0, c0])
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  return g
}

/** 影のすじ（板の裏から体へのびる黒むらさきのひも 4 本）。板のローカル座標 */
function tendrilGeometry(w: number, h: number, seed: number): THREE.BufferGeometry {
  const rng = mulberry32(seed)
  const parts: THREE.BufferGeometry[] = []
  for (const [sx, sy] of [
    [-0.42, 0.38],
    [0.42, 0.36],
    [-0.4, -0.4],
    [0.38, -0.36],
  ]) {
    const a = new THREE.Vector3(sx * w, sy * h, -0.04)
    const b = new THREE.Vector3(sx * w * 0.4 + (rng() - 0.5) * 0.1, sy * h * 0.4, -0.32)
    const c = new THREE.Vector3(0, 0, -0.5)
    const curve = new THREE.QuadraticBezierCurve3(a, b, c)
    parts.push(new THREE.TubeGeometry(curve, 6, 0.028, 4, false))
  }
  // 板のふちに巻きつく短いすじ
  const wrap = new THREE.TorusGeometry(Math.min(w, h) * 0.32, 0.02, 4, 18, Math.PI * 1.2)
  wrap.translate(0, 0, -0.03)
  parts.push(wrap)
  const out = new THREE.BufferGeometry()
  const P: number[] = []
  const Nn: number[] = []
  for (const p of parts) {
    const q = p.index ? p.toNonIndexed() : p
    P.push(...(q.attributes.position.array as Float32Array))
    Nn.push(...(q.attributes.normal.array as Float32Array))
    if (q !== p) q.dispose()
    p.dispose()
  }
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(Nn, 3))
  return out
}

/**
 * 戦闘の「よろいの板」（rt.combat.spawn('brute', pos, { plates, onPlate })）に渡す板。モデルの座標（slot の位置・向き）で作る。
 * 戦闘がモデルの root に付け、クロー（J）ではがすと手元へ飛ばす（後ろの板からはがれる）。影のすじ付き。
 * 材質は板ごとに 1 つ（はがす的を光らせるなら material.emissiveIntensity を上げる）
 */
export function createArmorPlateObjects(slots: readonly ArmorSlot[] = BRUTE_ARMOR_SLOTS): THREE.Mesh[] {
  const tex = armorAtlas()
  const tendrilMat = new THREE.MeshStandardMaterial({ color: '#140a1e', roughness: 0.4, metalness: 0.3, emissive: new THREE.Color('#7a2cff'), emissiveIntensity: 0.9, name: 'armor_tendril' })
  return slots.map((slot, i) => {
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: slot.kind === 'plate' ? 0.6 : 0.15, emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0, name: `armor_${slot.kind}` })
    const mesh = new THREE.Mesh(armorPlateGeometry(slot.kind, slot.w, slot.h), mat)
    mesh.castShadow = true
    mesh.name = `armor_${i}`
    const tendril = new THREE.Mesh(tendrilGeometry(slot.w, slot.h, 11 + i), tendrilMat)
    tendril.name = 'armor_tendril'
    mesh.add(tendril)
    mesh.position.copy(slot.pos)
    mesh.rotation.copy(slot.rot)
    mesh.userData.armorKind = slot.kind
    return mesh
  })
}

export type ArmorAnchor = THREE.Object3D | { root: THREE.Object3D }

type Plate = {
  slot: ArmorSlot
  mesh: THREE.Mesh
  mat: THREE.MeshStandardMaterial
  tendril: THREE.Mesh
  state: 'on' | 'flying' | 'down' | 'gone' | 'coming'
  vel: THREE.Vector3
  spin: THREE.Vector3
  t: number
  from: THREE.Vector3
  fromQ: THREE.Quaternion
  dur: number
  highlight: number
  hlNow: number
}

/**
 * よろいの 3 枚の板。group をステージの root に足し、毎フレーム update(dt, t) を呼ぶ。
 * 敵のモデルの root を attach すると、その位置・向き・大きさに合わせる（target は動いてよい）
 */
export class ArmorPlates {
  readonly group = new THREE.Group()
  /** 板の中心（ワールド）。毎フレーム更新（クローの的の point に使える） */
  readonly points: THREE.Vector3[]
  /** はがれた板が落ちる地面の高さ */
  ground = 0
  private readonly holder = new THREE.Group()
  private readonly loose = new THREE.Group()
  private readonly plates: Plate[]
  private target: THREE.Object3D | null = null
  private readonly tendrilMat: THREE.MeshStandardMaterial
  private readonly tmpM = new THREE.Matrix4()
  private readonly tmpV = new THREE.Vector3()
  private readonly tmpQ = new THREE.Quaternion()
  private readonly tmpS = new THREE.Vector3()
  private readonly slotM = new THREE.Matrix4()

  constructor(slots: readonly ArmorSlot[] = BRUTE_ARMOR_SLOTS) {
    this.group.name = 'armor_plates'
    this.holder.matrixAutoUpdate = false
    this.group.add(this.holder, this.loose)
    const meshes = createArmorPlateObjects(slots)
    this.tendrilMat = (meshes[0]?.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial
    this.plates = meshes.map((mesh, i) => {
      const slot = slots[i]
      this.holder.add(mesh)
      return { slot, mesh, mat: mesh.material as THREE.MeshStandardMaterial, tendril: mesh.children[0] as THREE.Mesh, state: 'on', vel: new THREE.Vector3(), spin: new THREE.Vector3(), t: 0, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), dur: 0.8, highlight: 0, hlNow: 0 }
    })
    this.points = this.plates.map(() => new THREE.Vector3())
    this.group.visible = false
  }

  /** 敵のモデル（root）に合わせる。null で外す（板は見えなくなる） */
  attach(target: ArmorAnchor | null): void {
    this.target = target ? ('root' in target && !(target instanceof THREE.Object3D) ? target.root : (target as THREE.Object3D)) : null
    this.group.visible = this.target !== null
    this.follow()
  }

  /** はりついている枚数 */
  get count(): number {
    return this.plates.filter((p) => p.state === 'on' || p.state === 'coming').length
  }

  get total(): number {
    return this.plates.length
  }

  isOn(i: number): boolean {
    return this.plates[i]?.state === 'on'
  }

  kind(i: number): ArmorKind {
    return this.plates[i].slot.kind
  }

  /** 板 i を目立たせる（J ではがせる板。ふちが金色に光る） */
  setHighlight(i: number, on: boolean): void {
    const p = this.plates[i]
    if (p) p.highlight = on ? 1 : 0
  }

  /** 板 i がはがれて飛ぶ（toward はプレイヤーの位置など。無ければ外へはじける） */
  strip(i: number, toward?: THREE.Vector3): void {
    const p = this.plates[i]
    if (!p || p.state !== 'on') return
    this.follow()
    p.mesh.updateWorldMatrix(true, false)
    p.mesh.matrixWorld.decompose(this.tmpV, this.tmpQ, this.tmpS)
    this.loose.add(p.mesh)
    p.mesh.position.copy(this.tmpV)
    p.mesh.quaternion.copy(this.tmpQ)
    p.mesh.scale.copy(this.tmpS)
    p.tendril.visible = false
    if (toward) {
      p.vel.subVectors(toward, this.tmpV).setY(0)
      const d = Math.max(0.5, p.vel.length())
      p.vel.multiplyScalar(Math.min(7, d * 1.6) / d).setY(4.2)
    } else {
      // 板の正面の向きへはじける
      p.vel.set(0, 0, 1).applyQuaternion(this.tmpQ).setY(0).normalize().multiplyScalar(3.2).setY(3.6)
    }
    p.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9)
    p.state = 'flying'
    p.t = 0
    p.highlight = 0
  }

  /** 板 i が飛んできてはりつく（from はまわりの看板の位置。無ければその場に現れる） */
  reattach(i: number, from?: THREE.Vector3, sec = 0.8): void {
    const p = this.plates[i]
    if (!p || p.state === 'on' || p.state === 'coming') return
    if (from) {
      this.loose.add(p.mesh)
      p.from.copy(from)
      p.fromQ.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0))
      p.mesh.position.copy(from)
      p.mesh.quaternion.copy(p.fromQ)
      p.mesh.scale.setScalar(this.targetScale())
      p.state = 'coming'
      p.t = 0
      p.dur = sec
    } else this.snapOn(p)
    p.mesh.visible = true
    p.mat.opacity = 1
    p.mat.transparent = false
  }

  /** 全部はりついた状態へ（チェックポイントからやり直すとき） */
  reset(): void {
    for (const p of this.plates) {
      this.snapOn(p)
      p.mesh.visible = true
      p.mat.opacity = 1
      p.mat.transparent = false
    }
  }

  private snapOn(p: Plate): void {
    this.holder.add(p.mesh)
    p.mesh.position.copy(p.slot.pos)
    p.mesh.rotation.copy(p.slot.rot)
    p.mesh.scale.setScalar(1)
    p.tendril.visible = true
    p.state = 'on'
  }

  private targetScale(): number {
    if (!this.target) return 1
    this.target.updateWorldMatrix(true, false)
    this.target.matrixWorld.decompose(this.tmpV, this.tmpQ, this.tmpS)
    return this.tmpS.x
  }

  private follow(): void {
    if (!this.target) return
    this.target.updateWorldMatrix(true, false)
    this.holder.matrix.copy(this.target.matrixWorld)
    this.holder.matrixWorldNeedsUpdate = true
  }

  update(dt: number, t: number): void {
    this.follow()
    for (let i = 0; i < this.plates.length; i++) {
      const p = this.plates[i]
      if (p.state === 'on') {
        // 体にはりついて、少し息をする（すじがゆれる）
        p.mesh.position.copy(p.slot.pos)
        p.mesh.position.y += Math.sin(t * 3 + i * 2) * 0.012
        p.tendril.scale.set(1 + Math.sin(t * 5 + i) * 0.06, 1, 1 + Math.sin(t * 4 + i * 1.7) * 0.1)
      } else if (p.state === 'flying' || p.state === 'down') {
        p.t += dt
        if (p.state === 'flying') {
          p.vel.y -= 12 * dt
          p.mesh.position.addScaledVector(p.vel, dt)
          p.mesh.rotation.x += p.spin.x * dt
          p.mesh.rotation.y += p.spin.y * dt
          p.mesh.rotation.z += p.spin.z * dt
          const floor = this.ground + 0.04
          if (p.mesh.position.y < floor && p.vel.y < 0) {
            p.mesh.position.y = floor
            if (Math.abs(p.vel.y) > 2.2) {
              p.vel.y *= -0.3
              p.vel.x *= 0.5
              p.vel.z *= 0.5
              p.spin.multiplyScalar(0.4)
            } else {
              // 寝かせて止まる
              p.state = 'down'
              p.t = 0
              const e = new THREE.Euler(-Math.PI / 2, p.mesh.rotation.y, 0)
              p.mesh.quaternion.setFromEuler(e)
            }
          }
        } else if (p.t > 2.6) {
          // 地面の板は少しして消える
          p.mat.transparent = true
          p.mat.opacity = Math.max(0, 1 - (p.t - 2.6) / 0.8)
          if (p.mat.opacity <= 0) {
            p.mesh.visible = false
            p.state = 'gone'
          }
        }
      } else if (p.state === 'coming') {
        p.t += dt
        const k = Math.min(1, p.t / p.dur)
        const e = k * k * (3 - 2 * k)
        // 体の上の行き先（ワールド）
        this.slotM.compose(p.slot.pos, this.tmpQ.setFromEuler(p.slot.rot), this.tmpS.set(1, 1, 1))
        this.tmpM.multiplyMatrices(this.holder.matrix, this.slotM)
        const to = this.tmpV.setFromMatrixPosition(this.tmpM)
        p.mesh.position.lerpVectors(p.from, to, e)
        p.mesh.position.y += Math.sin(Math.PI * e) * 1.2
        this.tmpM.decompose(this.tmpV, this.tmpQ, this.tmpS)
        p.mesh.quaternion.slerpQuaternions(p.fromQ, this.tmpQ, e)
        if (k >= 1) this.snapOn(p)
      }
      // 光るふち（J の的）
      p.hlNow += (p.highlight - p.hlNow) * Math.min(1, dt * 8)
      p.mat.emissiveIntensity = p.hlNow * (0.35 + 0.25 * Math.sin(t * 8))
      // 中心（ワールド）
      p.mesh.getWorldPosition(this.points[i])
    }
  }

  dispose(): void {
    for (const p of this.plates) {
      p.mesh.geometry.dispose()
      p.tendril.geometry.dispose()
      p.mat.dispose()
    }
    this.tendrilMat?.dispose()
    this.group.removeFromParent()
  }
}

/**
 * 町に置く「よろいの元」（NEXTMAKE の前の工事の物）。影の獣がはりつけに来る・プレイヤーが先に取ってしまえる物。
 * take(id) で消える（はりつけた・取った）、restore() で元へ。
 */
export class ArmorSources {
  readonly group = new THREE.Group()
  readonly items: Array<{ id: ArmorKind; pos: THREE.Vector3; object: THREE.Object3D; taken: boolean }> = []

  constructor(defs: ReadonlyArray<{ id: ArmorKind; pos: THREE.Vector3; yaw: number }>) {
    this.group.name = 'armor_sources'
    const tex = armorAtlas()
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.3, name: 'armor_source' })
    const leg = new THREE.MeshStandardMaterial({ color: '#d8d8d8', roughness: 0.5, metalness: 0.5, name: 'armor_source_leg' })
    for (const d of defs) {
      const o = new THREE.Group()
      o.position.copy(d.pos)
      o.rotation.y = d.yaw
      if (d.id === 'plate') {
        // 敷き鉄板を 2 枚、柵に立てかける
        for (let k = 0; k < 2; k++) {
          const m = new THREE.Mesh(armorPlateGeometry('plate', 1.1, 0.84, 0.0, 0.04), mat)
          m.position.set(k * 0.06, 0.42, -k * 0.05)
          m.rotation.x = -0.25
          m.castShadow = true
          o.add(m)
        }
      } else if (d.id === 'koji') {
        // 工事中の看板（細い脚の台）
        const m = new THREE.Mesh(armorPlateGeometry('koji', 0.76, 0.6, 0, 0.03), mat)
        m.position.y = 0.95
        m.castShadow = true
        o.add(m)
        for (const s of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.25, 6), leg)
          l.position.set(s * 0.3, 0.62, -0.03)
          l.castShadow = true
          o.add(l)
          const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.5), leg)
          f.position.set(s * 0.3, 0.02, 0)
          o.add(f)
        }
      } else {
        // IDO の立て看板（A 型）
        for (const s of [-1, 1]) {
          const m = new THREE.Mesh(armorPlateGeometry('aframe', 0.58, 0.78, 0, 0.03), mat)
          m.position.set(0, 0.4, s * 0.13)
          m.rotation.set(s * 0.2, s > 0 ? 0 : Math.PI, 0)
          m.castShadow = true
          o.add(m)
        }
      }
      this.group.add(o)
      this.items.push({ id: d.id, pos: d.pos.clone().setY(0.6), object: o, taken: false })
    }
  }

  /** 板を持っていかれた（取った） */
  take(id: ArmorKind): boolean {
    const it = this.items.find((x) => x.id === id && !x.taken)
    if (!it) return false
    it.taken = true
    it.object.visible = false
    return true
  }

  /** まだ残っている元のうち、pos にいちばん近い物 */
  nearest(pos: THREE.Vector3): (typeof this.items)[number] | null {
    let best: (typeof this.items)[number] | null = null
    let bd = Infinity
    for (const it of this.items) {
      if (it.taken) continue
      const d = it.pos.distanceToSquared(pos)
      if (d < bd) {
        bd = d
        best = it
      }
    }
    return best
  }

  restore(): void {
    for (const it of this.items) {
      it.taken = false
      it.object.visible = true
    }
  }
}
