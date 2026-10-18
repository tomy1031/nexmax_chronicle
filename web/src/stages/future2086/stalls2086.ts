// 2086年の屋台（出店）：パールホワイトの丸い一体成形のカウンター、後ろから弧を描いてガラスの屋根を支える腕、
// 屋根の前に浮かぶネオンの丸い看板（たこ焼き・焼きそば・りんご飴・金魚すくい）、ホロのメニュー、
// 浮かぶ提灯ドローン、未来風の品物（回る鉄板・光る水槽の金魚など）。コンセプト画像：
// assets_src/reference/bg2086/nx_stalls2086_concept.png
// 屋台の位置・大きさ・当たり判定は layout.ts の F.STALLS のまま（量産型ネクマックスの店番の台も同じ高さ）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { M } from '../../render/batch'
import { F } from './layout'
import { NEON, chochin, fbox, type FCtx } from './kit2086'
import { ribbon, slabGeometry, terraceMaterials } from './terraces2086'
import { ROUNDED, fitText } from './textures2086'

type StallKind = 'tako' | 'soba' | 'ame' | 'kingyo'

const KINDS: Array<{ kind: StallKind; name: string; color: string; glow: THREE.Color; fill: string }> = [
  { kind: 'tako', name: 'たこ焼き', color: '#ffb070', glow: new THREE.Color(2.6, 1.0, 0.45), fill: 'rgba(70,24,30,0.62)' },
  { kind: 'soba', name: '焼きそば', color: '#7fe9ff', glow: NEON.cyan, fill: 'rgba(8,40,80,0.62)' },
  { kind: 'ame', name: 'りんご飴', color: '#ff8cc6', glow: NEON.pink, fill: 'rgba(76,10,52,0.62)' },
  { kind: 'kingyo', name: '金魚すくい', color: '#8fd2ff', glow: new THREE.Color(0.5, 1.2, 2.6), fill: 'rgba(10,30,86,0.62)' },
]

/** 角の丸い長方形の輪郭（ローカル x＝幅、z＝奥行き。z+ が正面）。左の辺 → 正面 → 右の辺 → 裏 と回る（ribbon の外向き） */
function roundedRect(w: number, d: number, r: number, cz = 0, seg = 6): Array<[number, number]> {
  const a = w / 2
  const b = d / 2
  const pts: Array<[number, number]> = []
  const arc = (cx: number, czz: number, t0: number, t1: number) => {
    for (let k = 0; k <= seg; k++) {
      const t = t0 + ((t1 - t0) * k) / seg
      pts.push([cx + Math.cos(t) * r, czz + Math.sin(t) * r])
    }
  }
  arc(-a + r, cz - b + r, Math.PI * 1.5, Math.PI) // 裏の左の角（左の辺へ）
  arc(-a + r, cz + b - r, Math.PI, Math.PI / 2) // 正面の左の角
  arc(a - r, cz + b - r, Math.PI / 2, 0) // 正面の右の角
  arc(a - r, cz - b + r, 0, -Math.PI / 2) // 裏の右の角
  pts.push(pts[0])
  return pts
}

// ------------------------------------------------------------------ 看板とメニューの絵

function drawIcon(g: CanvasRenderingContext2D, kind: StallKind, cx: number, cy: number, s: number): void {
  g.save()
  g.lineWidth = s * 0.07
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.beginPath()
  if (kind === 'tako') {
    // たこ：丸い頭と、波打つ 5 本の足
    g.arc(cx, cy - s * 0.18, s * 0.26, Math.PI * 0.9, Math.PI * 2.1)
    for (let i = 0; i < 5; i++) {
      const x0 = cx - s * 0.28 + i * s * 0.14
      g.moveTo(x0, cy + s * 0.02)
      g.bezierCurveTo(x0 - s * 0.06, cy + s * 0.18, x0 + s * 0.08, cy + s * 0.24, x0 + s * 0.02, cy + s * 0.38)
    }
    g.stroke()
    g.beginPath()
    g.arc(cx - s * 0.09, cy - s * 0.17, s * 0.035, 0, Math.PI * 2)
    g.arc(cx + s * 0.09, cy - s * 0.17, s * 0.035, 0, Math.PI * 2)
    g.fill()
  } else if (kind === 'soba') {
    // どんぶりと箸と麺
    g.moveTo(cx - s * 0.38, cy)
    g.quadraticCurveTo(cx, cy + s * 0.5, cx + s * 0.38, cy)
    g.closePath()
    g.moveTo(cx - s * 0.1, cy - s * 0.42)
    g.lineTo(cx + s * 0.32, cy - s * 0.12)
    g.moveTo(cx - s * 0.02, cy - s * 0.46)
    g.lineTo(cx + s * 0.38, cy - s * 0.2)
    for (let i = 0; i < 3; i++) {
      const x0 = cx - s * 0.18 + i * s * 0.1
      g.moveTo(x0, cy - s * 0.02)
      g.bezierCurveTo(x0 + s * 0.06, cy - s * 0.12, x0 - s * 0.04, cy - s * 0.2, x0 + s * 0.04, cy - s * 0.3)
    }
    g.stroke()
  } else if (kind === 'ame') {
    // りんご（実と葉と軸）
    g.moveTo(cx, cy - s * 0.2)
    g.bezierCurveTo(cx - s * 0.44, cy - s * 0.42, cx - s * 0.48, cy + s * 0.34, cx, cy + s * 0.32)
    g.bezierCurveTo(cx + s * 0.48, cy + s * 0.34, cx + s * 0.44, cy - s * 0.42, cx, cy - s * 0.2)
    g.moveTo(cx, cy - s * 0.2)
    g.lineTo(cx + s * 0.04, cy - s * 0.4)
    g.moveTo(cx + s * 0.04, cy - s * 0.34)
    g.quadraticCurveTo(cx + s * 0.28, cy - s * 0.5, cx + s * 0.3, cy - s * 0.3)
    g.quadraticCurveTo(cx + s * 0.16, cy - s * 0.26, cx + s * 0.04, cy - s * 0.34)
    g.stroke()
  } else {
    // 金魚（体と広がる尾）
    g.ellipse(cx + s * 0.08, cy, s * 0.24, s * 0.15, 0, 0, Math.PI * 2)
    g.moveTo(cx - s * 0.14, cy)
    g.quadraticCurveTo(cx - s * 0.36, cy - s * 0.32, cx - s * 0.44, cy - s * 0.16)
    g.quadraticCurveTo(cx - s * 0.3, cy, cx - s * 0.44, cy + s * 0.18)
    g.quadraticCurveTo(cx - s * 0.36, cy + s * 0.32, cx - s * 0.14, cy)
    g.stroke()
    g.beginPath()
    g.arc(cx + s * 0.2, cy - s * 0.03, s * 0.03, 0, Math.PI * 2)
    g.fill()
    for (const [bx, by, br] of [[0.4, -0.3, 0.05], [0.48, -0.44, 0.035]] as const) {
      g.beginPath()
      g.arc(cx + s * bx, cy + s * by, s * br, 0, Math.PI * 2)
      g.stroke()
    }
  }
  g.restore()
}

/** 丸い看板 4 枚（1024×256 ずつ縦に）と、メニュー 4 枚（256×320 ずつ横に）を 1 枚の絵に */
function paintStallSigns(): THREE.CanvasTexture {
  const W = 1024
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = 1024 + 320
  const g = cv.getContext('2d')!
  const pill = (x: number, y: number, w: number, h: number) => {
    const r = h / 2
    g.beginPath()
    g.moveTo(x + r, y)
    g.lineTo(x + w - r, y)
    g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2)
    g.lineTo(x + r, y + h)
    g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5)
    g.closePath()
  }
  KINDS.forEach((k, i) => {
    const y0 = i * 256
    // 看板：濃い半透明の地、光る縁（二重）、白い文字、右に線画のアイコン
    pill(20, y0 + 30, W - 40, 196)
    g.fillStyle = k.fill
    g.fill()
    g.save()
    g.shadowColor = k.color
    g.shadowBlur = 26
    g.strokeStyle = k.color
    g.lineWidth = 9
    g.stroke()
    g.restore()
    pill(36, y0 + 46, W - 72, 164)
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 2.5
    g.stroke()
    g.save()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = k.color
    g.shadowBlur = 22
    g.fillStyle = '#ffffff'
    fitText(g, k.name, W * 0.43, y0 + 130, W * 0.6, 120, 800, ROUNDED, 6)
    g.restore()
    g.save()
    g.shadowColor = k.color
    g.shadowBlur = 18
    g.strokeStyle = '#ffffff'
    g.fillStyle = '#ffffff'
    drawIcon(g, k.kind, W * 0.83, y0 + 128, 150)
    g.restore()
    // メニュー：縦長のホロ画面（品物の絵・値段）
    const mx = i * 256
    const my = 1024
    g.save()
    g.translate(mx, my)
    g.beginPath()
    g.roundRect(14, 14, 228, 292, 22)
    g.fillStyle = k.fill
    g.fill()
    g.shadowColor = k.color
    g.shadowBlur = 14
    g.strokeStyle = k.color
    g.lineWidth = 5
    g.stroke()
    g.shadowBlur = 12
    g.strokeStyle = '#ffffff'
    g.fillStyle = '#ffffff'
    drawIcon(g, k.kind, 128, 112, 150)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowBlur = 10
    fitText(g, ['8個', '大盛り', '1本', '1回'][i], 128, 218, 200, 46, 800)
    g.fillStyle = k.color
    fitText(g, ['500円', '600円', '300円', '400円'][i], 128, 270, 200, 50, 800)
    g.restore()
  })
  // 走査線
  g.globalAlpha = 0.1
  g.fillStyle = '#ffffff'
  for (let y = 0; y < cv.height; y += 6) g.fillRect(0, y, W, 1)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

/** 看板の絵の i 枚目（看板 or メニュー）を貼る板 */
function signPlane(w: number, h: number, u0: number, v0: number, u1: number, v1: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h)
  const uv = g.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) ? u1 : u0, uv.getY(i) ? v1 : v0)
  return g
}

// ------------------------------------------------------------------ 屋台 1 軒

function stall(c: FCtx, zc: number, i: number, signMat: THREE.Material, fish: THREE.Object3D[]): void {
  const S = F.STALLS
  const k = KINDS[i % KINDS.length]
  const tm = terraceMaterials(c)
  const rot = -Math.PI / 2 // ローカル z+（正面）→ ワールド -X（西）
  const at = (lx: number, y: number, lz: number) => M(S.x - lz, y, zc + lx)
  const place = (y: number) => M(S.x, y, zc, 0, rot, 0)
  const half = S.w / 2
  // カウンター：丸い一体成形の白い台＋下と上の縁の光る線
  const cw = S.w - 0.3
  const ctr = roundedRect(cw, 0.82, 0.38, 0.86)
  c.b.add(slabGeometry(ctr, 1.0, 0.08), tm.pearl, place(1.0), { tint: '#ffffff' })
  c.b.add(ribbon(roundedRect(cw + 0.03, 0.85, 0.39, 0.86), 0.1, 0.16), c.fm.glow, place(0), { tint: NEON.cyan, cast: false, receive: false })
  c.b.add(ribbon(roundedRect(cw + 0.03, 0.85, 0.39, 0.86), 0.9, 0.93), c.fm.glow, place(0), { tint: k.glow, cast: false, receive: false })
  // 天板（少し張り出した白い板）
  c.b.add(slabGeometry(roundedRect(cw + 0.12, 0.96, 0.42, 0.84), 0.06, 0.02), tm.pearl, place(1.06), { tint: '#f4f7fb' })
  // 店番の台（量産型ネクマックスがカウンターに届くように。高さはそのまま）
  fbox(c, tm.pearl, S.x + 0.15, 0.19, zc, 0.95, 0.38, S.w - 0.7, { r: 0.08, tint: '#e8edf3' })
  // 後ろの棚（丸い白い箱）＋中の光る棚板
  c.b.add(slabGeometry(roundedRect(S.w - 0.5, 0.5, 0.22, -1.0), 1.75, 0.06), tm.pearl, place(1.75), { tint: '#eef2f6' })
  for (const y of [0.7, 1.25]) c.b.add(ribbon(roundedRect(S.w - 0.47, 0.53, 0.235, -1.0), y, y + 0.025), c.fm.glow, place(0), { tint: k.glow, cast: false, receive: false })
  // ガラスの屋根を支える腕（後ろから上へ、正面へ弧を描く）。中に光る線
  for (const s of [-1, 1]) {
    const lx = s * (half - 0.08)
    const pts = [
      [lx, 0.05, -1.2],
      [lx, 1.4, -1.2],
      [lx, 2.45, -1.12],
      [lx, 2.98, -0.55],
      [lx, 3.08, 0.4],
      [lx, 3.0, 1.2],
    ].map(([x, y, z]) => new THREE.Vector3(S.x - z, y, zc + x))
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal')
    c.b.add(new THREE.TubeGeometry(curve, 40, 0.085, 10, false), tm.pearl, undefined, { tint: '#ffffff' })
    const inner = new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(new THREE.Vector3(0.03, 0, -s * 0.07))), false, 'centripetal')
    c.b.add(new THREE.TubeGeometry(inner, 40, 0.018, 5, false), c.fm.glow, undefined, { tint: NEON.cyan, cast: false, receive: false })
  }
  // ガラスの屋根（浮いた薄い板）と光る縁
  const roof = roundedRect(S.w + 0.2, 2.5, 0.32, 0.1)
  c.b.add(slabGeometry(roof, 0.05, 0), tm.rail, place(3.12), { cast: false, receive: false })
  c.b.add(ribbon(roof, 3.07, 3.12), c.fm.glow, place(0), { tint: k.glow, cast: false, receive: false })
  // 正面の丸いネオン看板と、横のホロのメニュー
  const sv = (j: number) => 1 - (j * 256 + 256) / 1344
  // 看板とメニューは同じ絵・同じ材質なので、全部の屋台でまとめて 1 回の描画になる
  c.b.add(signPlane(3.1, 0.775, 0, sv(i), 1, 1 - (i * 256) / 1344), signMat, at(0, 2.5, 1.38).multiply(new THREE.Matrix4().makeRotationY(rot)), { uv: 'keep', cast: false, receive: false })
  c.b.add(signPlane(0.5, 0.625, i * 0.25, 0, (i + 1) * 0.25, 320 / 1344), signMat, at(half - 0.55, 1.62, 1.12).multiply(new THREE.Matrix4().makeRotationY(rot + 0.35)), { uv: 'keep', cast: false, receive: false })
  // 浮かぶ提灯ドローン（正面の角）
  for (const s of [-1, 1]) lanternDrone(c, S.x - 1.15, 3.55, zc + s * (half - 0.35), s < 0 && i % 2 === 0)
  // 台の上の品物
  const y = 1.12
  if (k.kind === 'tako') {
    // 自動で回る丸い鉄板（光る縁）×2 と、舟皿
    for (const [px, n] of [[-0.85, 0], [0.05, 1]] as const) {
      c.b.add(new THREE.CylinderGeometry(0.34, 0.36, 0.07, 28), c.fm.darkMetal, at(px, y - 0.02, 0.86))
      c.b.add(new THREE.TorusGeometry(0.35, 0.012, 6, 36), c.fm.glow, M(S.x - 0.86, y + 0.04, zc + px, Math.PI / 2, 0, 0), { tint: k.glow, cast: false })
      for (let r = 0; r < 3; r++) {
        const m = r === 0 ? 1 : r * 6
        for (let q = 0; q < m; q++) {
          const a = (q / m) * Math.PI * 2 + n
          const rr = r * 0.11
          c.b.add(new THREE.SphereGeometry(0.045, 8, 6), c.m.plain, at(px + Math.cos(a) * rr, y + 0.06, 0.86 + Math.sin(a) * rr), { tint: '#d2944a' })
        }
      }
    }
    for (let q = 0; q < 3; q++) fbox(c, c.m.plain, S.x - 0.92, y + 0.0, zc + 0.75 + q * 0.26, 0.2, 0.04, 0.22, { tint: '#f1e6cf' })
  } else if (k.kind === 'soba') {
    // 鉄板（光る格子）と麺
    fbox(c, c.fm.darkMetal, S.x - 0.86, y + 0.02, zc - 0.35, 0.62, 0.06, 1.5, { r: 0.03 })
    for (let q = -3; q <= 3; q++) c.b.add(new THREE.BoxGeometry(0.6, 0.004, 0.012), c.fm.glow, at(-0.35 + q * 0.2, y + 0.056, 0.86), { tint: new THREE.Color(2.2, 0.9, 0.3), cast: false })
    for (let q = 0; q < 26; q++) c.b.add(new THREE.SphereGeometry(0.035, 6, 4), c.m.plain, at(-0.35 + ((q * 0.37) % 1.3) - 0.65, y + 0.09, 0.86 + ((q * 0.53) % 0.44) - 0.22), { tint: q % 4 ? '#c98b45' : '#6aa04a' })
    // 容器の列
    for (let q = 0; q < 4; q++) c.b.add(new THREE.CylinderGeometry(0.06, 0.05, 0.12, 12), tm.pearl, at(0.75 + q * 0.16, y + 0.06, 0.95), { tint: '#ffffff' })
  } else if (k.kind === 'ame') {
    // 段の付いた白い台にりんご飴、光るガラスのケース
    for (let st = 0; st < 3; st++) c.b.add(slabGeometry(roundedRect(1.5 - st * 0.3, 0.42 - st * 0.08, 0.06, 0), 0.06, 0.01), tm.pearl, M(S.x - 0.86, y + 0.06 + st * 0.07, zc - 0.25, 0, rot, 0), { tint: '#ffffff' })
    for (let q = 0; q < 12; q++) {
      const lx = -0.25 - 0.6 + (q % 6) * 0.24
      const lz = 0.86 + (q < 6 ? -0.09 : 0.09)
      const yy = y + 0.13 + (q < 6 ? 0 : 0.07)
      c.b.add(new THREE.CylinderGeometry(0.007, 0.007, 0.2, 4), c.m.wood, at(lx, yy + 0.1, lz))
      c.b.add(new THREE.SphereGeometry(0.06, 12, 8), c.m.lacquerRed, at(lx, yy + 0.24, lz), { tint: '#ff4f5a' })
    }
    const caseB = roundedRect(1.6, 0.5, 0.08, 0)
    c.b.add(ribbon(caseB, y + 0.05, y + 0.55), tm.rail, M(S.x - 0.86, 0, zc - 0.25, 0, rot, 0), { cast: false, receive: false })
    c.b.add(ribbon(caseB, y + 0.53, y + 0.56), c.fm.glow, M(S.x - 0.86, 0, zc - 0.25, 0, rot, 0), { tint: k.glow, cast: false, receive: false })
  } else {
    // 天板の上の光る丸い水槽と、中を泳ぐ金魚
    const tx = S.x - 0.86
    const tz = zc + 0.75
    const R = 0.4
    c.b.add(new THREE.CylinderGeometry(R + 0.04, R + 0.06, 0.06, 32), tm.pearl, M(tx, y - 0.03, tz), { tint: '#ffffff' })
    c.b.add(new THREE.CylinderGeometry(R, R, 0.3, 32, 1, true), tm.rail, M(tx, y + 0.15, tz), { cast: false, receive: false })
    c.b.add(new THREE.CircleGeometry(R - 0.01, 32), c.fm.glow, M(tx, y + 0.2, tz, -Math.PI / 2, 0, 0), { tint: new THREE.Color(0.25, 0.9, 1.6), cast: false })
    c.b.add(new THREE.TorusGeometry(R, 0.014, 6, 40), c.fm.glow, M(tx, y + 0.3, tz, Math.PI / 2, 0, 0), { tint: k.glow, cast: false })
    const school = new THREE.Group()
    school.position.set(tx, y + 0.22, tz)
    // 金魚 8 匹を 1 つの形にまとめて、群れごと回す（描画 1 回）
    const parts: THREE.BufferGeometry[] = []
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2
      const r = 0.12 + (q % 3) * 0.08
      const body = new THREE.SphereGeometry(0.04, 8, 6)
      body.scale(1.8, 0.55, 0.9)
      const tail = new THREE.ConeGeometry(0.036, 0.065, 6)
      tail.rotateZ(Math.PI / 2)
      tail.scale(1, 0.4, 1.3)
      tail.translate(-0.09, 0, 0)
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.cos(a) * r, (q % 2) * 0.015, Math.sin(a) * r),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a - (Math.PI / 2) * (q % 2 ? 1 : -1)),
        new THREE.Vector3(1, 1, 1),
      )
      for (const g of [body, tail]) {
        g.deleteAttribute('uv')
        g.applyMatrix4(m)
        parts.push(g.toNonIndexed())
      }
    }
    school.add(new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.75, 0.35) })))
    c.root.add(school)
    fish.push(school)
    // ポイ（すくう網）の立て
    for (let q = 0; q < 3; q++) {
      c.b.add(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4), tm.pearl, at(-0.2 + q * 0.12, y + 0.08, 1.1), { tint: '#ffffff' })
      c.b.add(new THREE.TorusGeometry(0.045, 0.006, 5, 16), c.fm.glow, at(-0.2 + q * 0.12, y + 0.2, 1.1), { tint: NEON.white, cast: false })
    }
  }
  c.col.box(S.x + 0.1, 1.2, zc, S.d - 0.1, 2.4, S.w)
}

/** 浮かぶ提灯ドローン：白い提灯の上に小さな円盤と光る輪 */
function lanternDrone(c: FCtx, x: number, y: number, z: number, light: boolean): void {
  chochin(c, x, y, z, 'white', 0.78, { light })
  c.b.add(new THREE.CylinderGeometry(0.17, 0.2, 0.05, 18), c.fm.darkMetal, M(x, y + 0.36, z))
  c.b.add(new THREE.TorusGeometry(0.22, 0.012, 6, 28), c.fm.glow, M(x, y + 0.37, z, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false })
  c.b.add(new THREE.TorusGeometry(0.12, 0.01, 6, 20), c.fm.glow, M(x, y - 0.34, z, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false })
}

export function buildStalls2086(c: FCtx): void {
  const signMat = new THREE.MeshBasicMaterial({ map: paintStallSigns(), transparent: true, depthWrite: false, side: THREE.DoubleSide, color: new THREE.Color(1.35, 1.35, 1.35) })
  signMat.name = 'f2086-stallSigns'
  const fish: THREE.Object3D[] = []
  F.STALLS.zs.forEach((z, i) => stall(c, z, i, signMat, fish))
  // 屋台の前の通りに浮かぶ提灯ドローンの列（柱と綱は無し）
  const x = F.STALLS.x - F.STALLS.d / 2 - 0.9
  for (let z = F.STALLS.zs[0] - 2.2, n = 0; z <= F.STALLS.zs[3] + 2.3; z += 2.3, n++) lanternDrone(c, x, 3.75 + Math.sin(n * 1.7) * 0.12, z, n % 3 === 0)
  c.updaters.push((dt) => {
    for (const s of fish) s.rotation.y -= dt * 0.6
  })
}
