// 「時の神さま」のほこら（7・9・10 章）と、源兵衛のからくりの箱（時計じかけの錠前つき）。
// 1726年（建てたばかり）・2026年（300 年たった：木は灰色に、銅の屋根は緑青に、苔）・2086年（360 年・中庭で大事にされている）で
// 同じ形を使い回せるよう、時代の古さ（age：建ててからの年）を引数で変える。ほかの時代のステージからも使えるよう、
// 材質は自分で作る（createShrineMaterials）か、江戸の材質ライブラリから借りる（shrineMaterialsFrom）。
//
// ローカル座標：原点＝正面の石段の前の地面の中心。正面は -Z（root.rotation.y で向きを決める。東向きなら -π/2）。
// ・placeBox(on)：中の棚にからくりの箱を置く（box は KarakuriBox）
// ・setMorningLight(k)：正面の丸窓と格子戸から朝日がさしこむ（光の筋・箱が照らされる）
// ・setDoors(open)：格子戸をひらく（10 章で箱を取り出すとき）
// ・addColliders(col)：置いた場所で当たり判定（石の台座・ほこら・灯籠）を足す
import * as THREE from 'three'
import { Batch, M, rbox } from '../../../render/batch'
import type { MaterialLibrary } from '../../../render/materials'
import { drawLettering, makeCanvas, paintRope, paintRoofTiles, paintShoji, paintStoneWall, paintWoodGrain, tex } from '../../../render/textures'
import type { ColliderList } from '../../../world/colliders'
import { gearGeometry } from './parts'
import { softGlowTexture } from './workshop'

export type ShrineMaterials = {
  wood: THREE.Material
  copper: THREE.Material
  stone: THREE.Material
  plain: THREE.Material
  brass: THREE.Material
  rope: THREE.Material
  paper: THREE.Material
  lacquer: THREE.Material
  moss: THREE.Material
}

function std(p: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, ...p })
}

/** 江戸の材質ライブラリから借りる（銅と苔だけ新しく作る） */
export function shrineMaterialsFrom(lib: MaterialLibrary): ShrineMaterials {
  return {
    wood: lib.wood,
    copper: std({ color: '#ffffff', roughness: 0.5, metalness: 0.35, name: 'shrineCopper' }),
    stone: lib.stoneWall,
    plain: lib.plain,
    brass: lib.brass,
    rope: lib.rope,
    paper: lib.shoji,
    lacquer: lib.darkLacquer,
    moss: std({ color: '#ffffff', roughness: 0.95, name: 'shrineMoss' }),
  }
}

/** 自分で材質を作る（2026年・2086年のステージなど、江戸の材質ライブラリが無いとき） */
export function createShrineMaterials(aniso = 4): ShrineMaterials {
  const wood = paintWoodGrain()
  const roof = paintRoofTiles(512)
  const stone = paintStoneWall(512)
  const rope = paintRope()
  const shoji = paintShoji()
  const t = (p: { color: HTMLCanvasElement; normal?: HTMLCanvasElement }) => ({ map: tex(p.color, true, aniso), normalMap: p.normal ? tex(p.normal, false, aniso) : undefined })
  return {
    wood: std({ ...t(wood), roughness: 0.78, name: 'shrineWood' }),
    copper: std({ normalMap: t(roof).normalMap, normalScale: new THREE.Vector2(0.3, 0.3), color: '#ffffff', roughness: 0.5, metalness: 0.35, name: 'shrineCopper' }),
    stone: std({ ...t(stone), roughness: 1, name: 'shrineStone' }),
    plain: std({ color: '#ffffff', roughness: 0.8, name: 'shrinePlain' }),
    brass: std({ color: '#c28f42', roughness: 0.32, metalness: 0.9, name: 'shrineBrass' }),
    rope: std({ ...t(rope), roughness: 0.95, name: 'shrineRope' }),
    paper: std({ map: tex(shoji.color, true, aniso), emissive: new THREE.Color('#ffb060'), emissiveIntensity: 0.6, roughness: 0.9, name: 'shrinePaper' }),
    lacquer: std({ color: '#231c17', roughness: 0.45, metalness: 0.1, name: 'shrineLacquer' }),
    moss: std({ color: '#ffffff', roughness: 0.95, name: 'shrineMoss' }),
  }
}

export type TimeShrineOptions = {
  /** 建ててからの年（0＝1726年、300＝2026年、360＝2086年） */
  age?: number
  mats: ShrineMaterials
  /** 小さな鳥居を前に立てる */
  torii?: boolean
  /** 石灯籠を左右に置く（既定 true） */
  lanterns?: boolean
  /** 年のわりに手入れされている（苔を少なく。2086年の中庭など） */
  cared?: boolean
}

const lerpColor = (a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, k: number) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k)))

/** 扁額「時の神」（黒い板・金のふち・上に歯車と日の紋） */
function plaqueTexture(fade: number): THREE.CanvasTexture {
  const [cv, g] = makeCanvas(160, 256)
  g.fillStyle = '#2a1c14'
  g.fillRect(0, 0, 160, 256)
  const gold = fade > 0.5 ? '#c8a860' : '#ecc760'
  g.strokeStyle = gold
  g.lineWidth = 10
  g.strokeRect(8, 8, 144, 240)
  // 日と歯車の紋
  g.fillStyle = gold
  g.beginPath()
  g.arc(80, 52, 18, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.fillRect(80 + Math.cos(a) * 24 - 4, 52 + Math.sin(a) * 24 - 4, 8, 8)
  }
  g.fillStyle = '#2a1c14'
  g.beginPath()
  g.arc(80, 52, 7, 0, Math.PI * 2)
  g.fill()
  drawLettering(g, { text: '時の神', vertical: true, x: 22, y: 86, w: 116, h: 156, ink: gold, face: 'brush' })
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** 光の筋のテクスチャ（長さの向きに薄くなる帯） */
let rayTex: THREE.CanvasTexture | null = null
function rayTexture(): THREE.CanvasTexture {
  if (rayTex) return rayTex
  const [cv, g] = makeCanvas(64, 256)
  const gr = g.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, 'rgba(255,255,255,0)')
  gr.addColorStop(0.15, 'rgba(255,255,255,0.9)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 64, 256)
  const gx = g.createLinearGradient(0, 0, 64, 0)
  gx.addColorStop(0, 'rgba(0,0,0,1)')
  gx.addColorStop(0.5, 'rgba(0,0,0,0)')
  gx.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = gx
  g.fillRect(0, 0, 64, 256)
  rayTex = new THREE.CanvasTexture(cv)
  rayTex.colorSpace = THREE.SRGBColorSpace
  return rayTex
}

export class TimeShrine {
  readonly root = new THREE.Group()
  readonly box: KarakuriBox
  /** 箱を置く棚の上（ローカル。root の子） */
  readonly boxSpot = new THREE.Object3D()
  /** 正面の丸窓の中心（ローカル） */
  readonly windowPos = new THREE.Vector3(0.3, 1.43, 0.55)
  readonly age: number
  private readonly doors: THREE.Group[] = []
  private doorOpen = 0
  private doorWant = 0
  private readonly rays: THREE.Mesh[] = []
  private readonly rayMat: THREE.MeshBasicMaterial
  private readonly innerGlow: THREE.Sprite
  private light = 0
  private lightWant = 0
  private readonly bell: THREE.Object3D
  private bellSwing = 0
  private t = 0
  private readonly collidersLocal: Array<{ c: THREE.Vector3; s: THREE.Vector3 }> = []

  constructor(o: TimeShrineOptions) {
    const age = o.age ?? 0
    this.age = age
    const k = Math.min(1.1, age / 300)
    const m = o.mats
    const b = new Batch()
    const woodT = lerpColor('#f4d8b0', '#7f6c5a', k)
    const woodD = lerpColor('#d8b48a', '#5f4f43', k)
    const copperT = lerpColor('#e08a56', '#6fb5a0', Math.min(1, k * 1.15))
    const stoneT = lerpColor('#ece6dc', '#aaa697', k)
    const ropeT = lerpColor('#efe0b0', '#c9b483', k * 0.6)
    const W = (x: number, y: number, z: number, sx: number, sy: number, sz: number, tint: THREE.Color | string = woodT, r = 0.01, rx = 0, ry = 0, rz = 0) =>
      b.add(rbox(sx, sy, sz, r), m.wood, M(x, y, z, rx, ry, rz), { tint, texM: 1.2 })
    const S = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => b.add(rbox(sx, sy, sz, 0.03), m.stone, M(x, y, z), { tint: stoneT, texM: 1.4 })
    // ------------------------------------------------ 石段・台座
    S(0, 0.09, -0.32, 1.0, 0.18, 0.42)
    S(0, 0.125, 0.95, 1.9, 0.25, 1.9)
    S(0, 0.4, 0.95, 1.5, 0.3, 1.45)
    S(0, 0.32, -0.04, 0.9, 0.18, 0.3)
    this.collidersLocal.push({ c: new THREE.Vector3(0, 0.3, 0.95), s: new THREE.Vector3(1.9, 0.6, 1.9) })
    // ------------------------------------------------ 縁（板）・身舎の壁・柱
    W(0, 0.58, 0.95, 1.3, 0.06, 1.2, woodD)
    // 壁（背・左右）。正面は格子戸
    W(0, 1.08, 1.43, 1.0, 0.95, 0.05)
    for (const e of [-1, 1]) W(e * 0.49, 1.08, 1.0, 0.05, 0.95, 0.9)
    // 中の暗がり（格子のすきまから見える）
    b.add(rbox(0.9, 0.9, 0.02, 0), m.plain, M(0, 1.08, 1.4), { tint: '#2a1e18', cast: false })
    // 中の棚（箱をのせる）
    W(0, 0.86, 1.15, 0.8, 0.04, 0.48, woodD)
    for (const [x, z] of [
      [-0.5, 0.56],
      [0.5, 0.56],
      [-0.5, 1.44],
      [0.5, 1.44],
    ] as const) {
      W(x, 1.08, z, 0.08, 1.0, 0.08, woodD)
    }
    // 向拝の柱（前に伸びた屋根を支える）
    for (const e of [-1, 1]) W(e * 0.58, 1.05, 0.1, 0.07, 0.95, 0.07, woodD)
    // 欄間（格子戸の上）と丸窓
    W(0, 1.43, 0.55, 1.0, 0.24, 0.04)
    W(0, 1.31, 0.53, 1.04, 0.04, 0.07, woodD)
    W(0, 1.56, 0.53, 1.06, 0.05, 0.08, woodD)
    // 丸窓（左右に 2 つ。まんなかには扁額がかかる）
    for (const x of [-0.3, 0.3]) {
      b.add(new THREE.CircleGeometry(0.095, 18), m.plain, M(x, 1.43, 0.525, 0, Math.PI, 0), { tint: '#2a1e18', cast: false })
      b.add(new THREE.TorusGeometry(0.1, 0.016, 6, 20), m.wood, M(x, 1.43, 0.52), { tint: woodD })
      for (const a of [0, Math.PI / 2]) b.add(rbox(0.19, 0.012, 0.012, 0), m.wood, M(x, 1.43, 0.515, 0, 0, a), { tint: woodD })
    }
    // ------------------------------------------------ 屋根（流造：前が長い）。銅板（新しいと赤銅、古いと緑青）
    const ridgeY = 1.98
    const ridgeZ = 1.0
    const frontEave = { y: 1.48, z: -0.12 }
    const backEave = { y: 1.62, z: 1.72 }
    const slope = (y0: number, z0: number, y1: number, z1: number) => {
      const len = Math.hypot(z1 - z0, y1 - y0)
      const ang = Math.atan2(y1 - y0, z1 - z0)
      b.add(rbox(1.62, 0.06, len + 0.04, 0.02), m.copper, M(0, (y0 + y1) / 2, (z0 + z1) / 2, -ang, 0, 0), { tint: copperT, texM: 0.5 })
      // 板の継ぎ目（細い筋）
      for (let i = 1; i < 6; i++) b.add(rbox(0.012, 0.075, len, 0), m.copper, M(-0.81 + i * 0.27, (y0 + y1) / 2 + 0.01, (z0 + z1) / 2, -ang, 0, 0), { tint: copperT.clone().multiplyScalar(0.8) })
      // 軒の厚み（木口）
      b.add(rbox(1.66, 0.08, 0.06, 0.01), m.wood, M(0, y1 - 0.03, z1), { tint: woodD })
    }
    slope(ridgeY, ridgeZ, frontEave.y, frontEave.z)
    slope(ridgeY, ridgeZ, backEave.y, backEave.z)
    // 妻（三角の板）
    for (const e of [-1, 1]) {
      // 外向き（±X）の面になるよう、向きで頂点の順を変える
      const a = [e * 0.5, 1.55, 0.56]
      const c2 = [e * 0.5, 1.55, 1.43]
      const top = [e * 0.5, ridgeY - 0.04, ridgeZ]
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.Float32BufferAttribute(e > 0 ? [...a, ...top, ...c2] : [...a, ...c2, ...top], 3))
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0.5, 0.5, 1, 0], 2))
      g.computeVertexNormals()
      b.add(g, m.wood, undefined, { tint: woodT, cast: false })
      g.dispose()
    }
    // 棟・鰹木・千木
    b.add(rbox(1.75, 0.09, 0.14, 0.03), m.copper, M(0, ridgeY + 0.04, ridgeZ), { tint: copperT })
    for (const x of [-0.35, 0.35]) b.add(new THREE.CylinderGeometry(0.045, 0.045, 0.28, 10), m.wood, M(x, ridgeY + 0.12, ridgeZ, Math.PI / 2, 0, 0), { tint: woodD })
    for (const e of [-1, 1]) {
      for (const s of [-1, 1]) b.add(rbox(0.04, 0.42, 0.06, 0.005), m.wood, M(e * 0.82, ridgeY + 0.12, ridgeZ + s * 0.08, s * 0.5, 0, 0), { tint: woodD })
    }
    // ------------------------------------------------ 扁額・鈴・注連縄・紙垂・賽銭箱
    {
      // 扁額：軒の下、欄間の前にかける（鈴の上）
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.24), new THREE.MeshStandardMaterial({ map: plaqueTexture(k), roughness: 0.6 }))
      plaque.position.set(0, 1.52, 0.4)
      plaque.rotation.set(-0.12, Math.PI, 0)
      plaque.name = 'shrine_plaque'
      this.root.add(plaque)
      W(0, 1.52, 0.415, 0.17, 0.26, 0.02, woodD, 0.004, -0.12)
    }
    // 注連縄（向拝の柱のあいだ、たるませて）
    {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 12; i++) {
        const t = i / 12
        pts.push(new THREE.Vector3(-0.58 + 1.16 * t, 1.46 - Math.sin(t * Math.PI) * 0.09, 0.08))
      }
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, 0.035, 6), m.rope, undefined, { tint: ropeT, uv: 'scale', uvScale: [5, 1] })
      for (const x of [-0.36, 0.0, 0.36]) {
        const sh = new THREE.BufferGeometry()
        const w = 0.045
        const seg = 0.055
        const pos: number[] = []
        let ox = 0
        for (let i = 0; i < 4; i++) {
          const y0 = -i * seg
          const y1 = y0 - seg
          const nx = i % 2 === 0 ? w * 0.5 : -w * 0.5
          pos.push(ox - w / 2, y0, 0, ox + w / 2, y0, 0, nx + w / 2, y1, 0, ox - w / 2, y0, 0, nx + w / 2, y1, 0, nx - w / 2, y1, 0)
          ox = nx
        }
        sh.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
        sh.computeVertexNormals()
        const y = 1.46 - Math.sin(((x + 0.58) / 1.16) * Math.PI) * 0.09 - 0.03
        b.add(sh, m.plain, M(x, y, 0.07, 0, Math.PI, 0), { tint: '#fbfaf2', cast: false })
        b.add(sh, m.plain, M(x, y, 0.07, 0, 0, 0), { tint: '#fbfaf2', cast: false })
        sh.dispose()
      }
    }
    // 賽銭箱
    W(0, 0.22, -0.62, 0.52, 0.3, 0.3, woodD)
    for (let i = 0; i < 5; i++) W(-0.2 + i * 0.1, 0.38, -0.62, 0.05, 0.02, 0.3, woodT)
    // ------------------------------------------------ 石灯籠・小さな鳥居
    if (o.lanterns ?? true) {
      for (const e of [-1, 1]) {
        const x = e * 1.3
        const z = -0.7
        S(x, 0.1, z, 0.42, 0.2, 0.42)
        b.add(new THREE.CylinderGeometry(0.08, 0.1, 0.55, 8), m.stone, M(x, 0.47, z), { tint: stoneT })
        S(x, 0.8, z, 0.36, 0.12, 0.36)
        b.add(rbox(0.24, 0.22, 0.24, 0.01), m.paper, M(x, 0.97, z), { tint: '#ffffff', cast: false, texM: 0.24 })
        b.add(new THREE.ConeGeometry(0.3, 0.22, 4), m.stone, M(x, 1.19, z, 0, Math.PI / 4, 0), { tint: stoneT })
        b.add(new THREE.SphereGeometry(0.05, 8, 6), m.stone, M(x, 1.33, z), { tint: stoneT })
        this.collidersLocal.push({ c: new THREE.Vector3(x, 0.6, z), s: new THREE.Vector3(0.44, 1.2, 0.44) })
      }
    }
    if (o.torii) {
      const red = lerpColor('#d8442e', '#9a5a4a', k)
      for (const e of [-1, 1]) b.add(new THREE.CylinderGeometry(0.06, 0.07, 1.9, 10), m.plain, M(e * 0.62, 0.95, -1.5), { tint: red })
      b.add(rbox(1.7, 0.1, 0.14, 0.02), m.plain, M(0, 1.92, -1.5), { tint: '#2a1c14' })
      b.add(rbox(1.5, 0.09, 0.1, 0.02), m.plain, M(0, 1.66, -1.5), { tint: red })
      for (const e of [-1, 1]) this.collidersLocal.push({ c: new THREE.Vector3(e * 0.62, 1.0, -1.5), s: new THREE.Vector3(0.16, 2.0, 0.16) })
    }
    // ------------------------------------------------ 苔と地衣（古いほど）
    const mossK = Math.max(0, k - 0.25) * (o.cared ? 0.45 : 1)
    if (mossK > 0) {
      let s = 1726
      const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
      const n = Math.round(26 * mossK)
      for (let i = 0; i < n; i++) {
        const onRoof = i % 3 !== 0
        let x: number
        let y: number
        let z: number
        if (onRoof) {
          const front = rnd() < 0.6
          const t = 0.25 + rnd() * 0.7
          x = -0.7 + rnd() * 1.4
          z = front ? ridgeZ + (frontEave.z - ridgeZ) * t : ridgeZ + (backEave.z - ridgeZ) * t
          y = front ? ridgeY + (frontEave.y - ridgeY) * t + 0.04 : ridgeY + (backEave.y - ridgeY) * t + 0.04
        } else {
          const a = rnd() * Math.PI * 2
          x = Math.cos(a) * 0.95
          z = 0.95 + Math.sin(a) * 0.95
          y = 0.25
        }
        const r = 0.05 + rnd() * 0.08
        b.add(new THREE.IcosahedronGeometry(r, 1), m.moss, M(x, y, z, rnd(), rnd(), 0, 1.4, 0.35, 1.2), { tint: lerpColor('#7c9a3c', '#5a7a34', rnd()), cast: false })
      }
    }
    const statics = b.build('time_shrine')
    this.root.add(statics)
    // ------------------------------------------------ 格子戸（左右の 2 枚。外の端がちょうつがい）
    for (const e of [-1, 1]) {
      const hinge = new THREE.Group()
      hinge.position.set(e * 0.46, 0.62, 0.55)
      const db = new Batch()
      const w = 0.45
      const h = 0.68
      const cx = -e * (w / 2)
      db.add(rbox(w, 0.04, 0.035, 0.005), m.wood, M(cx, h - 0.02, 0), { tint: woodD })
      db.add(rbox(w, 0.04, 0.035, 0.005), m.wood, M(cx, 0.02, 0), { tint: woodD })
      for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) db.add(rbox(0.04, h, 0.035, 0.005), m.wood, M(cx + x, h / 2, 0), { tint: woodD })
      for (let i = 1; i < 6; i++) db.add(rbox(0.016, h - 0.06, 0.02, 0), m.wood, M(cx - w / 2 + (w * i) / 6, h / 2, 0), { tint: woodT })
      for (let j = 1; j < 4; j++) db.add(rbox(w - 0.06, 0.016, 0.02, 0), m.wood, M(cx, (h * j) / 4, 0), { tint: woodT })
      // 引き手（金具）
      db.add(new THREE.TorusGeometry(0.018, 0.005, 5, 10), m.brass, M(-e * (w - 0.06), h * 0.5, -0.025), { tint: '#ffffff' })
      hinge.add(db.build('shrine_door'))
      hinge.userData.side = e
      this.root.add(hinge)
      this.doors.push(hinge)
    }
    // ------------------------------------------------ 鈴（揺れる）
    {
      this.bell = new THREE.Group()
      this.bell.position.set(0, 1.47, 0.0)
      const bb = new Batch()
      bb.add(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 5), m.plain, M(0, -0.06, 0), { tint: '#3a2a1a' })
      bb.add(new THREE.SphereGeometry(0.065, 14, 10), m.brass, M(0, -0.17, 0), { tint: k > 0.5 ? '#b89a6a' : '#ffffff' })
      bb.add(rbox(0.1, 0.01, 0.02, 0), m.lacquer, M(0, -0.2, -0.055), { tint: '#ffffff' })
      // 鈴緒（紅白）
      bb.add(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6), m.plain, M(0, -0.58, 0), { tint: '#d8443a' })
      bb.add(new THREE.CylinderGeometry(0.019, 0.019, 0.7, 6), m.plain, M(0.01, -0.58, 0, 0, 0, 0.02), { tint: '#fbfaf2' })
      this.bell.add(bb.build('shrine_bell'))
      this.root.add(this.bell)
    }
    // ------------------------------------------------ 中の棚と箱
    this.boxSpot.position.set(0, 0.88, 1.1)
    this.root.add(this.boxSpot)
    this.box = new KarakuriBox(m)
    this.box.root.visible = false
    this.boxSpot.add(this.box.root)
    // ------------------------------------------------ 朝日：丸窓と格子戸からの光の筋・中の明るさ
    this.rayMat = new THREE.MeshBasicMaterial({ map: rayTexture(), color: '#ffd8a0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false })
    for (const [x, y, w, len] of [
      [-0.3, 1.43, 0.2, 3.4],
      [0.3, 1.43, 0.2, 3.4],
      [-0.22, 0.98, 0.34, 3.2],
      [0.22, 0.98, 0.34, 3.2],
    ] as const) {
      for (const twist of [0, Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(w, len)
        // 窓から外（-Z）へ、上へ（朝日の方）。帯の濃い端が窓
        g.translate(0, -len / 2, 0)
        const ray = new THREE.Mesh(g, this.rayMat)
        ray.position.set(x, y, 0.62)
        ray.rotation.set(Math.PI / 2 + 0.22, twist, 0, 'XYZ')
        ray.renderOrder = 4
        ray.visible = false
        ray.name = 'shrine_ray'
        this.root.add(ray)
        this.rays.push(ray)
      }
    }
    this.innerGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#ffcf8a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }))
    this.innerGlow.position.set(0, 1.0, 1.05)
    this.innerGlow.scale.setScalar(0.9)
    this.root.add(this.innerGlow)
    this.root.name = 'time_shrine'
  }

  /** 箱を中の棚に置く（on=false で取り出す） */
  placeBox(on = true): void {
    this.box.root.visible = on
  }

  get hasBox(): boolean {
    return this.box.root.visible
  }

  /** 朝日の差しこみ（0〜1） */
  setMorningLight(k: number, instant = false): void {
    this.lightWant = Math.max(0, Math.min(1, k))
    if (instant) this.light = this.lightWant
  }

  /** 格子戸をひらく（0〜1） */
  setDoors(open: number, instant = false): void {
    this.doorWant = open
    if (instant) this.doorOpen = open
  }

  /** 鈴を鳴らす（揺れる） */
  ringBell(): void {
    this.bellSwing = 1
  }

  /** 箱の位置（ワールド） */
  boxWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.boxSpot.getWorldPosition(out).add(new THREE.Vector3(0, 0.12, 0))
  }

  /** 正面の前の立ち位置（ワールド。石段の前 dist m） */
  frontWorld(dist = 1.2, out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld()
    return out.set(0, 0, -dist).applyMatrix4(this.root.matrixWorld)
  }

  /** 置いた場所で当たり判定を足す（root の位置・向きを決めてから呼ぶ） */
  addColliders(col: ColliderList): void {
    this.root.updateMatrixWorld(true)
    const yaw = this.root.rotation.y
    const p = new THREE.Vector3()
    for (const b of this.collidersLocal) {
      p.copy(b.c).applyMatrix4(this.root.matrixWorld)
      col.box(p.x, p.y, p.z, b.s.x, b.s.y, b.s.z, yaw)
    }
    // 身舎（中には入れない）と屋根（カメラが屋根の中に入らないよう）
    p.set(0, 1.2, 1.0).applyMatrix4(this.root.matrixWorld)
    col.box(p.x, p.y, p.z, 1.2, 1.4, 1.1, yaw)
    p.set(0, 1.78, 0.8).applyMatrix4(this.root.matrixWorld)
    col.box(p.x, p.y, p.z, 1.7, 0.45, 1.9, yaw)
  }

  update(dt: number): void {
    this.t += dt
    this.doorOpen += (this.doorWant - this.doorOpen) * Math.min(1, dt * 3)
    for (const d of this.doors) d.rotation.y = (d.userData.side as number) * -this.doorOpen * 1.6
    this.light += (this.lightWant - this.light) * Math.min(1, dt * 1.5)
    const on = this.light > 0.01
    for (const r of this.rays) r.visible = on
    this.rayMat.opacity = this.light * (0.32 + 0.06 * Math.sin(this.t * 1.3))
    ;(this.innerGlow.material as THREE.SpriteMaterial).opacity = this.light * 0.8
    this.box.setSunlit(this.light)
    if (this.bellSwing > 0) {
      this.bellSwing = Math.max(0, this.bellSwing - dt * 0.6)
      this.bell.rotation.x = Math.sin(this.t * 9) * 0.25 * this.bellSwing
    }
    this.box.update(dt)
  }
}

// ---------------------------------------------------------------- からくりの箱（時計じかけの錠前）

/**
 * 源兵衛のからくりの箱。黒漆の箱に真ちゅうの角金具、正面に時計じかけの錠前（文字盤・針・小さな歯車・青い石の窓）、
 * 横にぜんまいの鍵。原点は底の中心（クローで運ぶ物の決まり）。大きさ 0.42 × 0.28 × 0.3。
 * ・setOpen(k)：ふたを開ける（10 章）
 * ・setLockGlow(k)：錠前の青い窓が石の音にこたえて光る
 * ・setInnerGlow(k)：中の物（時を裂く爪）の光が、ふたのすきまからもれる
 * ・wind()：ぜんまいの鍵が回る（おはるがお正月に巻く）
 */
export class KarakuriBox {
  readonly root = new THREE.Group()
  /** 中に物を入れる場所（ふたの下） */
  readonly contents = new THREE.Group()
  /** 箱の半分の寸法（クローで運ぶときの当たり判定） */
  static readonly HALF = new THREE.Vector3(0.21, 0.14, 0.15)
  private readonly lid = new THREE.Group()
  private readonly hand = new THREE.Group()
  private readonly lockGears: THREE.Object3D[] = []
  private readonly key = new THREE.Group()
  private readonly lockMat: THREE.MeshStandardMaterial
  private readonly glow: THREE.Sprite
  private open = 0
  private openWant = 0
  private lockK = 0
  private innerK = 0
  private sun = 0
  private winding = 0
  private tickT = 0
  private ticks = 0

  constructor(m: ShrineMaterials) {
    const w = 0.42
    const h = 0.22
    const d = 0.3
    const b = new Batch()
    b.add(rbox(w, h, d, 0.012), m.lacquer, M(0, h / 2, 0), { tint: '#ffffff' })
    // 角金具と帯
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      b.add(rbox(0.05, h + 0.006, 0.05, 0.006), m.brass, M(x * (w / 2 - 0.018), h / 2, z * (d / 2 - 0.018)))
    }
    b.add(rbox(w + 0.006, 0.025, d + 0.006, 0.004), m.brass, M(0, 0.02, 0))
    // 錠前の台（正面 -Z）
    b.add(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 24), m.brass, M(0, h * 0.55, -d / 2 - 0.008, Math.PI / 2, 0, 0))
    b.add(new THREE.CylinderGeometry(0.066, 0.066, 0.006, 24), m.plain, M(0, h * 0.55, -d / 2 - 0.02, Math.PI / 2, 0, 0), { tint: '#f4ecd8' })
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      b.add(rbox(0.004, 0.012, 0.003, 0), m.lacquer, M(Math.cos(a) * 0.055, h * 0.55 + Math.sin(a) * 0.055, -d / 2 - 0.024, 0, 0, a + Math.PI / 2))
    }
    // ぜんまいの鍵の軸（右の側面）
    b.add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), m.brass, M(w / 2 + 0.012, h * 0.5, 0, 0, 0, Math.PI / 2))
    this.root.add(b.build('karakuri_box'))
    // 錠前の小さな歯車（文字盤のまわり）
    for (const [x, y, r] of [
      [-0.11, h * 0.75, 0.03],
      [0.11, h * 0.35, 0.025],
      [0.12, h * 0.78, 0.018],
    ] as const) {
      const gb = new Batch()
      gb.add(gearGeometry(r, 0.006, Math.round(8 + r * 200)), m.brass, undefined)
      const g = gb.build('box_gear')
      g.position.set(x, y, -d / 2 - 0.006)
      this.root.add(g)
      this.lockGears.push(g)
    }
    // 針
    {
      const hb = new Batch()
      hb.add(rbox(0.006, 0.05, 0.003, 0), m.lacquer, M(0, 0.022, 0), { tint: '#ffffff' })
      this.hand.add(hb.build('box_hand'))
      this.hand.position.set(0, h * 0.55, -d / 2 - 0.027)
      this.root.add(this.hand)
    }
    // 錠前の真ん中の青い石の窓（石の音にだけひらく）
    this.lockMat = new THREE.MeshStandardMaterial({ color: '#6ab4ff', emissive: new THREE.Color('#3a8cff'), emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.3 })
    const stone = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), this.lockMat)
    stone.position.set(0, h * 0.55, -d / 2 - 0.026)
    stone.scale.z = 0.5
    this.root.add(stone)
    // ふた（奥の辺がちょうつがい）
    this.lid.position.set(0, h, d / 2)
    const lb = new Batch()
    lb.add(rbox(w + 0.012, 0.06, d + 0.012, 0.012), m.lacquer, M(0, 0.03, -d / 2), { tint: '#ffffff' })
    lb.add(rbox(w + 0.016, 0.012, d + 0.016, 0.004), m.brass, M(0, 0.008, -d / 2))
    // ふたの上の紋（歯車）
    lb.add(gearGeometry(0.06, 0.006, 12), m.brass, M(0, 0.062, -d / 2, -Math.PI / 2, 0, 0))
    this.lid.add(lb.build('karakuri_box_lid'))
    this.root.add(this.lid)
    // ぜんまいの鍵（蝶の形）
    {
      const kb = new Batch()
      kb.add(rbox(0.012, 0.012, 0.03, 0), m.brass, M(0, 0, 0))
      for (const e of [-1, 1]) kb.add(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 12), m.brass, M(0.0, e * 0.03, 0, 0, 0, Math.PI / 2))
      this.key.add(kb.build('box_key'))
      this.key.position.set(w / 2 + 0.034, h * 0.5, 0)
      this.root.add(this.key)
    }
    this.contents.position.set(0, 0.04, 0)
    this.root.add(this.contents)
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softGlowTexture(), color: '#8fd0ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false }))
    this.glow.position.set(0, h + 0.02, 0)
    this.glow.scale.setScalar(0.6)
    this.root.add(this.glow)
    this.root.name = 'karakuri_box'
  }

  setOpen(k: number, instant = false): void {
    this.openWant = k
    if (instant) this.open = k
  }

  setLockGlow(k: number): void {
    this.lockK = k
  }

  setInnerGlow(k: number): void {
    this.innerK = k
  }

  /** 朝日が当たっている（0〜1。ほこらが入れる） */
  setSunlit(k: number): void {
    this.sun = k
  }

  /** ぜんまいを巻く（鍵が回る） */
  wind(): void {
    this.winding = 2.4
  }

  update(dt: number): void {
    this.open += (this.openWant - this.open) * Math.min(1, dt * 3)
    this.lid.rotation.x = this.open * 1.9
    // 錠前はずっと時をきざむ（1 秒に 1 回、針がカチッ）
    this.tickT += dt
    if (this.tickT >= 1) {
      this.tickT -= 1
      this.ticks++
      this.hand.rotation.z = -(this.ticks % 60) * ((Math.PI * 2) / 60)
      this.lockGears.forEach((g, i) => (g.rotation.z += (i % 2 ? -1 : 1) * 0.35))
    }
    if (this.winding > 0) {
      this.winding -= dt
      this.key.rotation.x += dt * 6
    }
    this.lockMat.emissiveIntensity = 0.4 + this.lockK * 3.2 + this.sun * 0.6
    const gm = this.glow.material as THREE.SpriteMaterial
    gm.opacity = Math.min(1, this.innerK * Math.min(1, this.open * 3 + 0.25) + this.lockK * 0.35)
  }
}
