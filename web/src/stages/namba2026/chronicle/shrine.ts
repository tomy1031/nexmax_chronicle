// 「時の神さま」のほこら（物語 v7 の 7・9・10 章）。源兵衛さんが 1726年に路地のおくに置いた、東を向いた小さなほこら。
// 毎朝、正面の丸窓から朝日がさしこみ、中のからくりの箱（ふたに時計じかけの錠前）を照らす。
// 1726年（建てたばかり）と 2026年（300 年たって苔むした姿）で同じ形を使うので、古さ age（0〜1）を引数で受け取る。
// ・形：二段の石の台 → 木の床 → 本体（格子の観音開きの戸）→ 妻入りの切妻屋根（銅板。古いと緑青）。正面の妻に丸窓。
//   鈴と鈴緒・しめ縄と紙垂・榊の小さな花入れ・「時の神」の木の札
// ・中：黒い漆のからくりの箱。ふたの前に真ちゅうの錠前（歯車がコチ、コチと進み、てんぷがゆれる）
// ・setDamage(k)：防衛戦で影にやられて欠けていく見た目（爪あと → 戸がはがれる → 屋根の銅板が落ちる → 丸窓が割れる）
// ・setGlow：錠前が石の音に反応して光る。setSun：朝日が丸窓から箱にさしこむ。setDoors：戸を開ける
// 座標は足元の中心が原点、正面がローカル +Z（ido.ts と同じ。世界での向きは root.rotation.y）。
// 材質・テクスチャはほこらの中で作る（どの時代のステージからも使える）。root をシーンに足せば、解放はシェルがたどる。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../../render/batch'
import { makeCanvas } from '../../../render/textures'
import { mulberry32 } from '../../../render/noise'

export type ShrineOptions = {
  /** 古さ（0 = 建てたばかり、1 = 300 年） */
  age: number
  /** 影を落とすか（既定 true） */
  shadows?: boolean
  /** 苔・汚れの並びの乱数 */
  seed?: number
  /** 大きさの倍率（既定 1。2026 の空き地では少し大きく） */
  scale?: number
}

export type Shrine = {
  /** 足元の中心が原点。正面はローカル +Z */
  readonly root: THREE.Group
  readonly age: number
  /** からくりの箱（中）と錠前（箱のふたの前） */
  readonly box: THREE.Object3D
  readonly lock: THREE.Object3D
  /** 大きさ（当たり判定・屋根にとりつく点の計算用。ローカル） */
  readonly size: { baseW: number; baseH: number; bodyW: number; bodyD: number; eaveY: number; ridgeY: number; roofW: number; roofZ0: number; roofZ1: number }
  /** ワールド座標：丸窓の中心・箱の中心・錠前の中心・正面の足元（箱をのぞく位置）・屋根の棟の上 */
  windowPoint(out: THREE.Vector3): THREE.Vector3
  boxPoint(out: THREE.Vector3): THREE.Vector3
  lockPoint(out: THREE.Vector3): THREE.Vector3
  frontPoint(out: THREE.Vector3, dist?: number): THREE.Vector3
  roofPoint(out: THREE.Vector3, side?: -1 | 0 | 1): THREE.Vector3
  /** 戸を開ける（0〜1） */
  setDoors(open: number): void
  /** 防衛戦で欠けていく（0 = 無傷 〜 1 = こわれる寸前） */
  setDamage(k: number): void
  readonly damage: number
  /** 錠前の光（0〜1。石の音に反応すると青く光る） */
  setGlow(v: number): void
  /** 朝日が丸窓からさしこむ（0〜1） */
  setSun(v: number): void
  /** 錠前のぜんまいの鍵（おふじさんが巻くとき） */
  setKey(on: boolean): void
  /** 錠前が時をきざむ（止めると歯車が止まる） */
  ticking: boolean
  /** 錠前が 1 回コチと進んだ（音を鳴らすなら） */
  onTick: (() => void) | null
  update(dt: number, t: number): void
}

// ------------------------------------------------------------------ テクスチャ（モジュールで使い回す）

const woodTexes = new Map<boolean, THREE.CanvasTexture>()
/** 明るい木目（色は頂点カラーで付ける：新しい檜は蜂蜜色、古い木は灰色がかった茶）。old は雨の筋と地衣のしみ */
function woodTexture(old: boolean): THREE.CanvasTexture {
  const hit = woodTexes.get(old)
  if (hit?.image) return hit
  const [c, g] = makeCanvas(256, 256)
  const rng = mulberry32(old ? 131 : 31)
  g.fillStyle = '#f2e6d4'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 70; i++) {
    const x = rng() * 256
    g.strokeStyle = `rgba(120,80,40,${0.08 + rng() * 0.14})`
    g.lineWidth = 0.8 + rng() * 2.2
    g.beginPath()
    for (let y = 0; y <= 256; y += 16) {
      const px = x + Math.sin(y * 0.03 + i) * (3 + rng() * 2)
      if (y === 0) g.moveTo(px, y)
      else g.lineTo(px, y)
    }
    g.stroke()
  }
  // 節
  for (let i = 0; i < 4; i++) {
    const x = rng() * 256
    const y = rng() * 256
    const gr = g.createRadialGradient(x, y, 0, x, y, 8)
    gr.addColorStop(0, 'rgba(90,50,20,0.5)')
    gr.addColorStop(1, 'rgba(90,50,20,0)')
    g.fillStyle = gr
    g.fillRect(x - 8, y - 8, 16, 16)
  }
  if (old) {
    // 灰色に退色した表面・雨の流れた黒い筋・白っぽい地衣のしみ
    g.fillStyle = 'rgba(150,150,145,0.35)'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 26; i++) {
      const x = rng() * 256
      const gr = g.createLinearGradient(0, 0, 0, 256)
      gr.addColorStop(0, `rgba(30,28,24,${0.25 + rng() * 0.3})`)
      gr.addColorStop(1, 'rgba(30,28,24,0)')
      g.fillStyle = gr
      g.fillRect(x, 0, 2 + rng() * 6, 120 + rng() * 136)
    }
    for (let i = 0; i < 30; i++) {
      const x = rng() * 256
      const y = rng() * 256
      const r = 3 + rng() * 9
      g.fillStyle = `rgba(${rng() < 0.5 ? '200,205,180' : '120,140,90'},${0.25 + rng() * 0.3})`
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  woodTexes.set(old, t)
  return t
}

const roofTexes = new Map<boolean, THREE.CanvasTexture>()
/** 銅板葺きの継ぎ目（古いと、緑青の筋と黒い汚れの流れ） */
function roofTexture(old: boolean): THREE.CanvasTexture {
  const hit = roofTexes.get(old)
  if (hit?.image) return hit
  const [c, g] = makeCanvas(256, 256)
  const rng = mulberry32(old ? 77 : 7)
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, 256, 256)
  // 一文字葺きの板（横長の板を半分ずらして並べる）
  const rows = 8
  for (let r = 0; r < rows; r++) {
    const y = (r / rows) * 256
    g.fillStyle = 'rgba(0,0,0,0.16)'
    g.fillRect(0, y, 256, 2.5)
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.fillRect(0, y + 2.5, 256, 1.5)
    const off = r % 2 ? 32 : 0
    for (let x = off; x < 256 + 64; x += 64) {
      g.fillStyle = 'rgba(0,0,0,0.12)'
      g.fillRect(x, y, 2, 256 / rows)
    }
    // 板ごとのむら
    for (let x = off - 64; x < 256; x += 64) {
      g.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + rng() * 0.05})`
      g.fillRect(x + 2, y + 4, 62, 256 / rows - 4)
    }
  }
  if (old) {
    // 雨の流れた筋（暗い）と、明るい緑青の粉
    for (let i = 0; i < 40; i++) {
      const x = rng() * 256
      const gr = g.createLinearGradient(0, 0, 0, 256)
      gr.addColorStop(0, 'rgba(20,30,25,0)')
      gr.addColorStop(1, `rgba(20,30,25,${0.1 + rng() * 0.18})`)
      g.fillStyle = gr
      g.fillRect(x, 0, 1 + rng() * 4, 256)
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(200,255,230,${0.05 + rng() * 0.12})`
      g.fillRect(rng() * 256, rng() * 256, 2 + rng() * 5, 1 + rng() * 3)
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  roofTexes.set(old, t)
  return t
}

let stoneTex: THREE.CanvasTexture | null = null
function stoneTexture(): THREE.CanvasTexture {
  if (stoneTex?.image) return stoneTex
  const [c, g] = makeCanvas(256, 256)
  const rng = mulberry32(5)
  g.fillStyle = '#ece8e0'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 1600; i++) {
    const k = rng()
    g.fillStyle = k < 0.5 ? `rgba(60,55,50,${0.05 + rng() * 0.1})` : `rgba(255,255,255,${0.05 + rng() * 0.12})`
    g.fillRect(rng() * 256, rng() * 256, 1 + rng() * 3, 1 + rng() * 3)
  }
  stoneTex = new THREE.CanvasTexture(c)
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping
  stoneTex.colorSpace = THREE.SRGBColorSpace
  return stoneTex
}

/** 「時の神」の木の札（筆文字の縦書き） */
function plaqueTexture(old: boolean): THREE.CanvasTexture {
  const [c, g] = makeCanvas(96, 320)
  g.fillStyle = old ? '#8a7656' : '#e9cf9e'
  g.fillRect(0, 0, 96, 320)
  g.strokeStyle = old ? '#4a3a26' : '#6a4a26'
  g.lineWidth = 6
  g.strokeRect(4, 4, 88, 312)
  g.fillStyle = '#1a120a'
  g.font = '400 64px "Yuji Boku","Hiragino Mincho ProN","Yu Mincho",serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  ;['時', 'の', '神'].forEach((ch, i) => g.fillText(ch, 48, 62 + i * 96))
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 錠前の文字盤（真ちゅうの板に目もりと「源」の刻印） */
function lockFaceTexture(): THREE.CanvasTexture {
  const [c, g] = makeCanvas(128, 128)
  const gr = g.createRadialGradient(64, 56, 4, 64, 64, 64)
  gr.addColorStop(0, '#fff1b8')
  gr.addColorStop(0.6, '#d8a840')
  gr.addColorStop(1, '#8a5e18')
  g.fillStyle = gr
  g.beginPath()
  g.arc(64, 64, 63, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#5a3a0c'
  g.lineWidth = 3
  g.beginPath()
  g.arc(64, 64, 56, 0, Math.PI * 2)
  g.stroke()
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.beginPath()
    g.moveTo(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48)
    g.lineTo(64 + Math.cos(a) * 55, 64 + Math.sin(a) * 55)
    g.stroke()
  }
  g.fillStyle = '#5a3a0c'
  g.font = '400 22px "Yuji Boku","Hiragino Mincho ProN",serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('源', 64, 96)
  // 鍵穴
  g.fillStyle = '#2a1a06'
  g.beginPath()
  g.arc(64, 30, 5, 0, Math.PI * 2)
  g.fill()
  g.fillRect(62, 30, 4, 10)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ------------------------------------------------------------------ 組み立て

const lerpHex = (a: string, b: string, k: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, k))).getHexString()

/** 歯車の形（平たい円柱＋歯）。z が厚み */
function gearGeometry(r: number, teeth: number, thick: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const disk = new THREE.CylinderGeometry(r * 0.82, r * 0.82, thick, 20)
  disk.rotateX(Math.PI / 2)
  parts.push(disk)
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2
    const t = new THREE.BoxGeometry(r * 0.28, r * 0.3, thick)
    t.translate(0, r * 0.9, 0)
    t.rotateZ(a)
    parts.push(t)
  }
  // 腕（4 本）と真ん中の軸
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.BoxGeometry(r * 0.12, r * 1.4, thick * 1.2)
    arm.rotateZ((i * Math.PI) / 4)
    parts.push(arm)
  }
  const out = mergeSimple(parts)
  return out
}

/** 位置・法線・UV だけの簡単な結合（index なしで並べる） */
function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const arrs: Record<'position' | 'normal' | 'uv', number[]> = { position: [], normal: [], uv: [] }
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0
    for (const k of ['position', 'normal', 'uv'] as const) {
      const a = g.attributes[k]
      if (!a) continue
      arrs[k].push(...(a.array as Float32Array))
    }
    if (g !== g0) g.dispose()
    g0.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(arrs.position, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(arrs.normal, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(arrs.uv, 2))
  return out
}

/** 1 枚のメッシュ（Batch の結果のグループから最初のメッシュ） */
function single(b: Batch, name: string): THREE.Group {
  const g = b.build(name)
  return g
}

export function buildShrine(opts: ShrineOptions): Shrine {
  const age = Math.max(0, Math.min(1, opts.age))
  const old = age > 0.5
  const cast = opts.shadows ?? true
  const rng = mulberry32(opts.seed ?? 1726)
  const root = new THREE.Group()
  root.name = old ? 'shrine_old' : 'shrine_new'
  /** 傾き（古さ・ダメージ）を受け持つ中の枠。置き場所と向きは root（呼ぶ側）で */
  const inner = new THREE.Group()
  inner.rotation.order = 'YXZ'
  root.add(inner)

  // 材質（頂点カラーで色を付ける）
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(old), vertexColors: true, roughness: old ? 0.92 : 0.72, name: 'shrine_wood' })
  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), vertexColors: true, roughness: 0.92, name: 'shrine_stone' })
  const copper = new THREE.MeshStandardMaterial({ map: roofTexture(old), vertexColors: true, roughness: old ? 0.62 : 0.38, metalness: old ? 0.25 : 0.65, name: 'shrine_roof' })
  const detail = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35, name: 'shrine_detail' })
  const moss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, name: 'shrine_moss', emissive: new THREE.Color('#1a3008'), emissiveIntensity: 0.25 })
  const paper = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, name: 'shrine_paper' })
  const brass = new THREE.MeshStandardMaterial({ color: '#e0b04a', roughness: 0.28, metalness: 0.85, emissive: new THREE.Color('#ffb040'), emissiveIntensity: 0, name: 'shrine_brass' })

  const WOOD = lerpHex('#e8b878', '#8e8478', age)
  const WOOD_DARK = lerpHex('#c48a50', '#5a5048', age)
  const STONE = lerpHex('#e2ded6', '#8e8a7c', age)
  const STONE_DARK = lerpHex('#cfcac0', '#6e6a5e', age)
  const ROOF = lerpHex('#d98a4a', '#6fae94', age)
  const RIDGE = lerpHex('#c87436', '#5b977f', age)
  const PAPER = lerpHex('#ffffff', '#f2e6c8', age)

  // 寸法
  const baseW = 1.7
  const base2W = 1.34
  const baseH = 0.5
  const floorY = baseH + 0.06
  const bodyW = 0.86
  const bodyD = 0.78
  const bodyZ = -0.06
  const bodyFront = bodyZ + bodyD / 2
  const bodyTop = floorY + 0.84
  const eaveY = bodyTop + 0.06
  const ridgeY = bodyTop + 0.66
  const roofW = 0.84
  const roofZ0 = bodyZ - bodyD / 2 - 0.24
  const roofZ1 = bodyFront + 0.42
  const sc = opts.scale ?? 1
  root.scale.setScalar(sc)
  const size = { baseW: baseW * sc, baseH: baseH * sc, bodyW: bodyW * sc, bodyD: bodyD * sc, eaveY: eaveY * sc, ridgeY: ridgeY * sc, roofW: roofW * sc, roofZ0: roofZ0 * sc, roofZ1: roofZ1 * sc }

  const sb = new Batch() // 石（台）
  const wb = new Batch() // 木（本体・床・柱・妻）
  const db = new Batch() // 細かい物（箱・金具・鈴の緒など）
  const mb = new Batch() // 苔・草
  const pb = new Batch() // 紙（紙垂）
  const rb = new Batch() // 屋根の棟と破風（銅）

  // ---- 石の台（二段）と正面の石段
  sb.add(rbox(baseW, 0.24, baseW, 0.03), stone, M(0, 0.12, 0), { tint: STONE_DARK, texM: 0.8 })
  sb.add(rbox(base2W, baseH - 0.24, base2W, 0.03), stone, M(0, 0.24 + (baseH - 0.24) / 2, 0), { tint: STONE, texM: 0.8 })
  sb.add(rbox(0.9, 0.14, 0.32, 0.02), stone, M(0, 0.07, baseW / 2 + 0.14), { tint: STONE_DARK, texM: 0.8 })
  // 古い石のひび（暗い細い板）
  if (age > 0.3) {
    for (let i = 0; i < 4; i++) {
      const s = i % 2 ? 1 : -1
      const geo = new THREE.PlaneGeometry(0.02, 0.18 + rng() * 0.12)
      sb.add(geo, stone, M(s * (0.2 + rng() * 0.4), 0.12, (i < 2 ? 1 : -1) * (baseW / 2 + 0.002), 0, i < 2 ? 0 : Math.PI, 0.3 * s), { tint: '#3a3830', cast: false })
    }
  }

  // ---- 木の床（浜床）と、本体の柱・壁
  wb.add(rbox(1.12, 0.06, 1.12, 0.012), wood, M(0, floorY - 0.03, -0.02), { tint: WOOD_DARK, texM: 0.6 })
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      wb.add(rbox(0.075, bodyTop - floorY + 0.04, 0.075, 0.01), wood, M(sx * (bodyW / 2 - 0.02), (floorY + bodyTop) / 2, bodyZ + sz * (bodyD / 2 - 0.02)), { tint: WOOD_DARK, texM: 0.5 })
    }
  }
  // 横と後ろの板壁
  for (const sx of [-1, 1]) wb.add(rbox(0.035, bodyTop - floorY, bodyD - 0.08, 0.008), wood, M(sx * (bodyW / 2 - 0.03), (floorY + bodyTop) / 2, bodyZ), { tint: WOOD, texM: 0.5 })
  wb.add(rbox(bodyW - 0.08, bodyTop - floorY, 0.035, 0.008), wood, M(0, (floorY + bodyTop) / 2, bodyZ - bodyD / 2 + 0.03), { tint: WOOD, texM: 0.5 })
  // 長押（戸の上の横木）と敷居
  wb.add(rbox(bodyW + 0.04, 0.07, 0.07, 0.01), wood, M(0, bodyTop - 0.05, bodyFront), { tint: WOOD_DARK, texM: 0.5 })
  wb.add(rbox(bodyW, 0.04, 0.06, 0.008), wood, M(0, floorY + 0.02, bodyFront), { tint: WOOD_DARK, texM: 0.5 })
  // 天井板（中が暗くなりすぎないよう明るい板）
  wb.add(rbox(bodyW - 0.06, 0.03, bodyD - 0.06, 0.005), wood, M(0, bodyTop - 0.01, bodyZ), { tint: WOOD, texM: 0.5 })
  // 妻（正面と背面の五角形の壁）。正面には丸窓の穴をあける
  const gableShape = () => {
    const s = new THREE.Shape()
    const hw = bodyW / 2
    const yEdge = ridgeY - (ridgeY - eaveY) * (hw / roofW) - 0.06
    s.moveTo(-hw, 0)
    s.lineTo(hw, 0)
    s.lineTo(hw, yEdge - bodyTop)
    s.lineTo(0, ridgeY - 0.07 - bodyTop)
    s.lineTo(-hw, yEdge - bodyTop)
    s.closePath()
    return s
  }
  const winY = bodyTop + 0.25
  const winR = 0.15
  {
    const front = gableShape()
    const hole = new THREE.Path()
    hole.absarc(0, winY - bodyTop, winR, 0, Math.PI * 2, true)
    front.holes.push(hole)
    const g = new THREE.ExtrudeGeometry(front, { depth: 0.03, bevelEnabled: false, curveSegments: 20 })
    wb.add(g, wood, M(0, bodyTop, bodyFront - 0.03), { tint: WOOD, texM: 0.4 })
    const back = new THREE.ExtrudeGeometry(gableShape(), { depth: 0.03, bevelEnabled: false })
    wb.add(back, wood, M(0, bodyTop, bodyZ - bodyD / 2), { tint: WOOD, texM: 0.4 })
  }
  // 丸窓の木の枠（輪）
  wb.add(new THREE.TorusGeometry(winR + 0.012, 0.022, 8, 28), wood, M(0, winY, bodyFront + 0.012), { tint: WOOD_DARK })
  // 「時の神」の木の札（台の左前に立てる）
  {
    wb.add(rbox(0.05, 0.62, 0.05, 0.01), wood, M(-0.62, 0.31 + 0.24, baseW / 2 - 0.06), { tint: WOOD_DARK, texM: 0.5 })
  }

  // ---- 屋根（左右の銅板は欠けるので別のメッシュ）・棟・破風
  const slope = Math.atan2(ridgeY - eaveY, roofW)
  const slabLen = Math.hypot(ridgeY - eaveY, roofW) + 0.02
  const roofLen = roofZ1 - roofZ0
  const roofHalf = (side: -1 | 1): THREE.Mesh => {
    const g = rbox(slabLen, 0.055, roofLen, 0.015)
    const b = new Batch()
    b.add(g, copper, M(side * (roofW / 2), (ridgeY + eaveY) / 2, (roofZ0 + roofZ1) / 2, 0, 0, -side * slope), { tint: ROOF, uv: 'box', texM: 0.55, uAxis: 2 })
    // 軒先の厚い縁（明るい線）
    b.add(rbox(0.05, 0.08, roofLen + 0.02, 0.01), copper, M(side * (roofW - 0.005), eaveY - 0.01, (roofZ0 + roofZ1) / 2), { tint: lerpHex('#f0a060', '#8cc8b0', age) })
    const grp = b.build(side < 0 ? 'shrine_roof_l' : 'shrine_roof_r')
    const mesh = grp.children[0] as THREE.Mesh
    grp.remove(mesh)
    mesh.castShadow = cast
    return mesh
  }
  const roofL = roofHalf(-1)
  const roofR = roofHalf(1)
  inner.add(roofL, roofR)
  rb.add(rbox(0.13, 0.11, roofLen + 0.06, 0.02), copper, M(0, ridgeY + 0.03, (roofZ0 + roofZ1) / 2), { tint: RIDGE, uv: 'box', texM: 0.5 })
  // 鬼板（棟の両端の飾り）
  for (const z of [roofZ0 - 0.02, roofZ1 + 0.02]) rb.add(rbox(0.2, 0.16, 0.04, 0.02), copper, M(0, ridgeY + 0.06, z), { tint: RIDGE })
  // 破風（正面と背面の、屋根の斜めの縁の板）
  for (const z of [roofZ0 + 0.01, roofZ1 - 0.01]) {
    for (const side of [-1, 1]) {
      rb.add(rbox(slabLen, 0.09, 0.035, 0.01), wood, M(side * (roofW / 2), (ridgeY + eaveY) / 2 - 0.05, z, 0, 0, -side * slope), { tint: WOOD_DARK, texM: 0.5 })
    }
  }
  // 懸魚（正面の破風の真ん中の飾り）
  rb.add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 6), wood, M(0, ridgeY - 0.12, roofZ1 - 0.01, Math.PI / 2, 0, 0), { tint: lerpHex('#d0a050', '#7a6a56', age) })

  // ---- しめ縄と紙垂・鈴と鈴緒・榊
  {
    const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.42, bodyTop - 0.12, bodyFront + 0.06), new THREE.Vector3(0, bodyTop - 0.2, bodyFront + 0.08), new THREE.Vector3(0.42, bodyTop - 0.12, bodyFront + 0.06)])
    db.add(new THREE.TubeGeometry(rope, 12, 0.022, 6, false), detail, undefined, { tint: lerpHex('#e8d8a0', '#b0a070', age), cast: false })
    for (const x of [-0.2, 0.2]) {
      // 紙垂（ジグザグの白い紙）
      const s = new THREE.Shape()
      s.moveTo(0, 0)
      s.lineTo(0.05, 0)
      s.lineTo(0.05, -0.05)
      s.lineTo(0.09, -0.05)
      s.lineTo(0.09, -0.1)
      s.lineTo(0.05, -0.1)
      s.lineTo(0.05, -0.16)
      s.lineTo(0.0, -0.16)
      s.lineTo(0.0, -0.1)
      s.lineTo(0.04, -0.1)
      s.lineTo(0.04, -0.05)
      s.lineTo(0.0, -0.05)
      s.closePath()
      pb.add(new THREE.ShapeGeometry(s), paper, M(x - 0.045, bodyTop - 0.17, bodyFront + 0.075), { tint: PAPER, cast: false })
    }
  }
  // 鈴緒（赤と白の綱）
  {
    const top = new THREE.Vector3(0, eaveY + 0.02, roofZ1 - 0.12)
    db.add(new THREE.CylinderGeometry(0.018, 0.018, 0.7, 8), detail, M(0, top.y - 0.38, top.z), { tint: lerpHex('#d83a2a', '#a05a48', age * 0.7), cast: false })
    db.add(new THREE.CylinderGeometry(0.02, 0.014, 0.12, 8), detail, M(0, top.y - 0.78, top.z), { tint: '#f4f0e6', cast: false })
    // 鈴（金色の玉）
    db.add(new THREE.SphereGeometry(0.055, 12, 8), detail, M(0, top.y - 0.04, top.z), { tint: lerpHex('#ffd24a', '#c8a050', age) })
  }
  // 榊の花入れ（左右）
  for (const sx of [-1, 1]) {
    const x = sx * 0.44
    const z = bodyFront + 0.15
    db.add(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 10), detail, M(x, floorY + 0.06, z), { tint: '#f4f2ea' })
    for (let k = 0; k < 5; k++) {
      const l = new THREE.SphereGeometry(0.04, 6, 4)
      mb.add(l, moss, M(x + (rng() - 0.5) * 0.06, floorY + 0.16 + k * 0.025, z + (rng() - 0.5) * 0.06, 0, 0, 0, 1, 0.5, 1), { tint: '#3e8a3a', cast: false })
    }
  }

  // ---- 苔（古いほど多い）と、ツタ
  const mossCount = Math.round(age * 64)
  for (let i = 0; i < mossCount; i++) {
    const r = rng()
    let x: number
    let y: number
    let z: number
    let s: number
    if (r < 0.45) {
      // 一段目の台の上のふち
      const a = rng() * Math.PI * 2
      x = Math.max(-0.82, Math.min(0.82, Math.cos(a) * 0.9))
      z = Math.max(-0.82, Math.min(0.82, Math.sin(a) * 0.9))
      y = 0.245
      s = 0.08 + rng() * 0.1
    } else if (r < 0.7) {
      // 二段目の上
      x = (rng() - 0.5) * 1.3
      z = (rng() < 0.5 ? -1 : 1) * (0.55 + rng() * 0.1)
      y = baseH
      s = 0.05 + rng() * 0.07
    } else if (r < 0.88) {
      // 地面（台のまわり）
      const a = rng() * Math.PI * 2
      x = Math.cos(a) * (0.9 + rng() * 0.25)
      z = Math.sin(a) * (0.9 + rng() * 0.25)
      y = 0.005
      s = 0.1 + rng() * 0.14
    } else {
      // 屋根の軒先
      const side = rng() < 0.5 ? -1 : 1
      x = side * (roofW - 0.05)
      z = roofZ0 + rng() * roofLen
      y = eaveY + 0.03
      s = 0.04 + rng() * 0.05
    }
    const g = new THREE.IcosahedronGeometry(1, 0)
    const k = s * 0.55
    mb.add(g, moss, M(x, y, z, 0, rng() * 3, 0, k, k * 0.28, k * (0.8 + rng() * 0.6)), { tint: rng() < 0.5 ? '#4a6a30' : '#5a7a38', cast: false })
  }
  if (age > 0.6) {
    // ツタ（左の壁の後ろ側をはう葉）
    for (let i = 0; i < 14; i++) {
      const y = floorY + 0.05 + i * 0.06
      const z = bodyZ - bodyD / 2 + 0.05 + Math.sin(i * 1.3) * 0.12
      const leaf = new THREE.PlaneGeometry(0.09, 0.07)
      mb.add(leaf, moss, M(-bodyW / 2 - 0.035, y, z, 0, -Math.PI / 2, rng() * 2), { tint: '#4f8a34', cast: false })
    }
  }

  // ---- 戸（格子の観音開き。左右で 1 枚ずつ。蝶番は外側）
  const doorW = bodyW / 2 - 0.05
  const doorH = bodyTop - floorY - 0.12
  const makeDoor = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group()
    pivot.position.set(side * (bodyW / 2 - 0.045), floorY + 0.04, bodyFront)
    const b = new Batch()
    const cx = -side * (doorW / 2)
    // 枠
    b.add(rbox(doorW, 0.04, 0.03, 0.006), wood, M(cx, doorH - 0.02, 0), { tint: WOOD_DARK, texM: 0.4 })
    b.add(rbox(doorW, 0.04, 0.03, 0.006), wood, M(cx, 0.02, 0), { tint: WOOD_DARK, texM: 0.4 })
    b.add(rbox(0.035, doorH, 0.03, 0.006), wood, M(cx - doorW / 2 + 0.017, doorH / 2, 0), { tint: WOOD_DARK, texM: 0.4 })
    b.add(rbox(0.035, doorH, 0.03, 0.006), wood, M(cx + doorW / 2 - 0.017, doorH / 2, 0), { tint: WOOD_DARK, texM: 0.4 })
    // 下の腰板
    b.add(rbox(doorW - 0.04, 0.16, 0.018, 0.004), wood, M(cx, 0.11, 0), { tint: WOOD, texM: 0.4 })
    // 格子
    for (let i = 1; i < 4; i++) b.add(new THREE.BoxGeometry(0.016, doorH - 0.22, 0.018), wood, M(cx - doorW / 2 + (doorW * i) / 4, 0.19 + (doorH - 0.22) / 2, 0), { tint: WOOD_DARK })
    for (let i = 1; i < 5; i++) b.add(new THREE.BoxGeometry(doorW - 0.04, 0.014, 0.018), wood, M(cx, 0.19 + ((doorH - 0.22) * i) / 5, 0), { tint: WOOD_DARK })
    // 取っ手の金具
    b.add(new THREE.SphereGeometry(0.014, 6, 4), wood, M(cx + side * (doorW / 2 - 0.05), doorH * 0.5, 0.02), { tint: '#e8b840' })
    const grp = b.build(side < 0 ? 'shrine_door_l' : 'shrine_door_r')
    grp.traverse((o) => ((o as THREE.Mesh).castShadow = cast))
    pivot.add(grp)
    return pivot
  }
  const doorL = makeDoor(-1)
  const doorR = makeDoor(1)
  inner.add(doorL, doorR)

  // ---- 丸窓の格子（割れると外れる）
  const winB = new Batch()
  winB.add(new THREE.BoxGeometry(winR * 2, 0.014, 0.014), wood, M(0, winY, bodyFront - 0.012), { tint: WOOD_DARK })
  winB.add(new THREE.BoxGeometry(0.014, winR * 2, 0.014), wood, M(0, winY, bodyFront - 0.012), { tint: WOOD_DARK })
  for (const k of [-0.5, 0.5]) {
    const len = 2 * Math.sqrt(winR * winR - (k * winR) ** 2)
    winB.add(new THREE.BoxGeometry(len, 0.01, 0.012), wood, M(0, winY + k * winR, bodyFront - 0.012), { tint: WOOD_DARK })
    winB.add(new THREE.BoxGeometry(0.01, len, 0.012), wood, M(k * winR, winY, bodyFront - 0.012), { tint: WOOD_DARK })
  }
  const windowLattice = winB.build('shrine_window')

  // ---- からくりの箱（中の台の上）と錠前
  const boxY = floorY + 0.16
  const boxG = new THREE.Group()
  boxG.name = 'karakuri_box'
  boxG.position.set(0, boxY, bodyZ + 0.02)
  {
    const b = new Batch()
    // 台
    b.add(rbox(0.5, 0.1, 0.36, 0.01), wood, M(0, -0.11, 0), { tint: WOOD_DARK, texM: 0.4 })
    // 箱（黒い漆）とふた
    b.add(rbox(0.44, 0.2, 0.3, 0.015), detail, M(0, 0.04, 0), { tint: '#2a1810' })
    b.add(rbox(0.46, 0.05, 0.32, 0.015), detail, M(0, 0.165, 0), { tint: '#3a2014' })
    // 真ちゅうの角金具と帯
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(new THREE.BoxGeometry(0.05, 0.22, 0.05), detail, M(sx * 0.215, 0.05, sz * 0.145), { tint: '#d8a840' })
    b.add(new THREE.BoxGeometry(0.47, 0.025, 0.33), detail, M(0, 0.135, 0), { tint: '#c89434' })
    const grp = b.build('karakuri_box_body')
    grp.traverse((o) => ((o as THREE.Mesh).castShadow = cast))
    boxG.add(grp)
  }
  // 錠前（ふたの前の丸い真ちゅうの板。歯車とてんぷ）
  const lockG = new THREE.Group()
  lockG.name = 'clock_lock'
  lockG.position.set(0, 0.07, 0.155)
  const faceMat = new THREE.MeshStandardMaterial({ map: lockFaceTexture(), roughness: 0.3, metalness: 0.7, emissive: new THREE.Color('#ffb040'), emissiveIntensity: 0, name: 'shrine_lock_face' })
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24), faceMat)
  face.rotation.x = Math.PI / 2
  // 文字盤の上下：キャンバスの上（鍵穴）が上に来るよう
  face.rotation.y = Math.PI
  lockG.add(face)
  const gear = new THREE.Mesh(gearGeometry(0.035, 10, 0.008), brass)
  gear.position.set(0.026, 0.004, 0.01)
  lockG.add(gear)
  const gear2 = new THREE.Mesh(gearGeometry(0.022, 8, 0.008), brass)
  gear2.position.set(-0.03, -0.018, 0.012)
  lockG.add(gear2)
  // てんぷ（ゆれる輪）
  const balance = new THREE.Group()
  balance.position.set(-0.02, 0.03, 0.014)
  balance.add(new THREE.Mesh(mergeSimple([new THREE.TorusGeometry(0.02, 0.004, 6, 16), new THREE.BoxGeometry(0.04, 0.004, 0.004)]), brass))
  lockG.add(balance)
  // ぜんまいの鍵（おふじさんが巻くときだけ）
  const key = new THREE.Group()
  key.position.set(0, 0.044, 0.016)
  {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.05, 6), brass)
    shaft.rotation.x = Math.PI / 2
    shaft.position.z = 0.025
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 12), brass)
    bow.position.z = 0.055
    key.add(shaft, bow)
  }
  key.visible = false
  lockG.add(key)
  boxG.add(lockG)
  inner.add(boxG)

  // ---- 朝日の光（丸窓からさしこむ光の筋と、箱のふたの光だまり）。加算の板
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 0.86, 0.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const shaft = new THREE.Group()
  {
    // 窓の外（正面）から窓を通って箱へ向かう細長い光の柱（十字の 2 枚）
    const from = new THREE.Vector3(0, winY + 0.3, bodyFront + 0.7)
    const to = new THREE.Vector3(0, boxY + 0.17, bodyZ + 0.02)
    const len = from.distanceTo(to)
    for (let i = 0; i < 2; i++) {
      const g = new THREE.PlaneGeometry(winR * 1.8, len)
      const pos = g.attributes.position as THREE.BufferAttribute
      // 先（箱）ほど細く
      for (let k = 0; k < pos.count; k++) if (pos.getY(k) > 0) pos.setX(k, pos.getX(k) * 0.7)
      const m = new THREE.Mesh(g, sunMat)
      m.rotation.y = (i * Math.PI) / 2
      shaft.add(m)
    }
    shaft.position.copy(from).add(to).multiplyScalar(0.5)
    shaft.lookAt(to)
    shaft.rotateX(Math.PI / 2)
    shaft.renderOrder = 5
  }
  shaft.visible = false
  inner.add(shaft)
  const poolMat = sunMat.clone()
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.16, 20), poolMat)
  pool.rotation.x = -Math.PI / 2
  pool.position.set(0, boxY + 0.195, bodyZ + 0.02)
  pool.visible = false
  inner.add(pool)
  // 丸窓のガラスのような光（夜は箱の錠前の光が内側から少し漏れる）
  const winGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  const winGlow = new THREE.Mesh(new THREE.CircleGeometry(winR, 24), winGlowMat)
  winGlow.position.set(0, winY, bodyFront - 0.005)
  inner.add(winGlow)

  // ---- 「時の神」の札の文字（札の正面）
  const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture(old), roughness: 0.8, name: 'shrine_plaque' })
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.37), plaqueMat)
  plaque.position.set(-0.62, 0.68, baseW / 2 - 0.03)
  inner.add(plaque)

  // ---- 防衛戦の傷（影の爪あと・落ちた銅板・外れた戸）
  const scratchMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.32, 0.08, 0.5), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
  const scratches: THREE.Mesh[] = []
  {
    // 3 本ずつの爪あと（横の壁・正面の柱・台）。ダメージが進むと増える
    const spots: Array<[number, number, number, number]> = [
      [bodyW / 2 + 0.01, floorY + 0.5, bodyZ, Math.PI / 2],
      [-bodyW / 2 - 0.01, floorY + 0.35, bodyZ + 0.1, -Math.PI / 2],
      [0.35, 0.36, base2W / 2 + 0.005, 0],
      [-0.4, floorY + 0.25, bodyFront + 0.03, 0],
    ]
    for (const [x, y, z, ry] of spots) {
      const b = new Batch()
      for (let k = 0; k < 3; k++) {
        const g = new THREE.PlaneGeometry(0.018, 0.22)
        b.add(g, scratchMat, M(-0.05 + k * 0.05, k * 0.02, 0, 0, 0, 0.45), { cast: false })
      }
      const grp = b.build('shrine_scratch')
      const mesh = grp.children[0] as THREE.Mesh
      grp.remove(mesh)
      mesh.position.set(x, y, z)
      mesh.rotation.y = ry
      mesh.visible = false
      mesh.renderOrder = 4
      inner.add(mesh)
      scratches.push(mesh)
    }
  }
  // 外れて落ちた戸・銅板（足元）
  const debris = new THREE.Group()
  debris.name = 'shrine_debris'
  {
    const b = new Batch()
    b.add(rbox(doorW, 0.03, doorH * 0.9, 0.006), wood, M(-0.55, 0.26, baseW / 2 + 0.35, -Math.PI / 2 + 0.2, 0.5, 0), { tint: WOOD_DARK, texM: 0.4 })
    const grp = b.build('debris_door')
    grp.visible = false
    grp.name = 'debris_door'
    debris.add(grp)
    const c = new Batch()
    for (let i = 0; i < 3; i++) c.add(rbox(0.32, 0.03, 0.22, 0.008), copper, M(-0.95 + i * 0.12, 0.03 + i * 0.01, 0.2 - i * 0.3, 0.1 * i, i, 0.15), { tint: ROOF })
    const g2 = c.build('debris_roof')
    g2.visible = false
    g2.name = 'debris_roof'
    debris.add(g2)
  }
  inner.add(debris)

  // ---- 静的な物をまとめる
  for (const [b, name] of [
    [sb, 'shrine_stone'],
    [wb, 'shrine_wood'],
    [db, 'shrine_detail'],
    [mb, 'shrine_moss'],
    [pb, 'shrine_paper'],
    [rb, 'shrine_ridge'],
  ] as const) {
    const g = single(b, name)
    if (!cast) g.traverse((o) => ((o as THREE.Mesh).castShadow = false))
    inner.add(g)
  }
  inner.add(windowLattice)
  // 少し傾く（古いほど）
  const lean = age * 0.012

  // ---- 状態
  let doors = 0
  let damage = 0
  let glow = 0
  let glowNow = 0
  let sun = 0
  let tickT = 0
  let gearAng = 0
  /** ローカル → ワールド（置いた直後でも正しいように、親からの行列を更新してから） */
  const world = (o: THREE.Object3D, p: THREE.Vector3) => {
    o.updateWorldMatrix(true, false)
    return o.localToWorld(p)
  }
  const api: Shrine = {
    root,
    age,
    box: boxG,
    lock: lockG,
    size,
    windowPoint: (out) => world(inner, out.set(0, winY, bodyFront + 0.02)),
    boxPoint: (out) => world(inner, out.set(0, boxY + 0.05, bodyZ + 0.02)),
    lockPoint: (out) => world(lockG, out.set(0, 0, 0)),
    frontPoint: (out, dist = 1.5) => world(root, out.set(0, 0, baseW / 2 + dist)),
    roofPoint: (out, side = 0) => world(inner, out.set(side * roofW * 0.5, side === 0 ? ridgeY + 0.08 : (ridgeY + eaveY) / 2 + 0.05, (roofZ0 + roofZ1) / 2)),
    setDoors(open) {
      doors = Math.max(0, Math.min(1, open))
      doorL.rotation.y = -doors * 1.9
      doorR.rotation.y = doors * 1.9
    },
    setDamage(k) {
      damage = Math.max(0, Math.min(1, k))
      scratches.forEach((s, i) => (s.visible = damage > 0.12 + i * 0.12))
      const doorGone = damage >= 0.45
      doorL.visible = !doorGone
      ;(debris.getObjectByName('debris_door') as THREE.Object3D).visible = doorGone
      const roofGone = damage >= 0.65
      roofL.visible = !roofGone
      ;(debris.getObjectByName('debris_roof') as THREE.Object3D).visible = roofGone
      windowLattice.visible = damage < 0.85
      inner.rotation.z = lean + damage * 0.035
      inner.rotation.x = -damage * 0.02
    },
    get damage() {
      return damage
    },
    setGlow(v) {
      glow = Math.max(0, v)
    },
    setSun(v) {
      sun = Math.max(0, Math.min(1, v))
      shaft.visible = sun > 0.01
      pool.visible = sun > 0.01
      sunMat.opacity = sun * 0.22
      poolMat.opacity = sun * 0.7
    },
    setKey(on) {
      key.visible = on
    },
    ticking: true,
    onTick: null,
    update(dt, t) {
      // 錠前：0.5 秒ごとにコチ（歯車が 1 歯ぶん進む）。てんぷは往復
      if (api.ticking) {
        tickT += dt
        if (tickT >= 0.5) {
          tickT -= 0.5
          gearAng += (Math.PI * 2) / 10
          api.onTick?.()
        }
        const snap = Math.min(1, tickT / 0.08)
        gear.rotation.z = -(gearAng - (Math.PI * 2) / 10 + ((Math.PI * 2) / 10) * snap)
        gear2.rotation.z = (gearAng * 10) / 8 - 0.3
        balance.rotation.z = Math.sin(t * Math.PI * 2) * 1.2
        if (key.visible) key.rotation.z = -t * 3
      }
      glowNow += (glow - glowNow) * Math.min(1, dt * 5)
      const pulse = 0.75 + 0.25 * Math.sin(t * 6.3)
      faceMat.emissiveIntensity = glowNow * 1.6 * pulse
      faceMat.emissive.setRGB(1, 0.75 + glowNow * 0.1, 0.35 + glowNow * 0.6)
      brass.emissiveIntensity = glowNow * 1.2 * pulse
      // 丸窓：夜は錠前の光がにじむ。朝日のときは明るい
      winGlowMat.opacity = Math.min(1, glowNow * 0.35 + sun * 0.5) * (damage > 0.85 ? 0.4 : 1)
      if (sun > 0.01) shaft.children.forEach((c, i) => (c.scale.x = 1 + Math.sin(t * 1.3 + i) * 0.05))
    },
  }
  api.setDamage(0)
  return api
}

/** ほこらの当たり判定（世界の位置・向きで台と本体を箱で）。col は ColliderList（box を持つ物） */
export function shrineColliders(col: { box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rotY?: number): unknown }, s: Shrine, pos: THREE.Vector3, yaw: number): void {
  const { baseW, baseH, bodyW, bodyD, ridgeY } = s.size
  col.box(pos.x, baseH / 2, pos.z, baseW, baseH, baseW, yaw)
  // 本体（屋根の下まで）。正面から少し下がった中心
  const c = new THREE.Vector3(0, 0, -0.06 * (baseW / 1.7)).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(pos)
  col.box(c.x, (baseH + ridgeY) / 2, c.z, bodyW + 0.2, ridgeY - baseH, bodyD + 0.2, yaw)
}
