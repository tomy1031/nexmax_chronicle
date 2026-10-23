// 4 章の時計台のぼり：通りの両側のビルとつなぐ所（物語 v7.1 の 3 回目の直し：「フィールドが狭い・ぶら下がりを多用したい」）。
// ・足場：西の段々のビルの東の面のかんばんの足場（W1・W2）、東の段々のビルの西の面の足場（N1）。夜でも読めるように、ふちが光る
// ・光る輪（swing_anchor）3 つ：通りをまたぐ電線・ビルの壁の腕から下がる。いまの輪は金色に脈打つ（ほかは水色）
// ・道すじ：いまわたる所の、ぶら下がってわたる線（光る点が流れる）。どこへ飛ぶのか、遠くからでも分かるように
// ・西のビルの壁の、縦の大きなかんばん（W1 と W2 のあいだ。輪②でその前をわたる）
// 配置は layoutChronicle.ts の COURSE（W1・W2・N1・swings）。道すじの形は純粋な関数（swingGuidePath。テストで確かめる）
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { uTime } from '../../../render/materials'
import type { ClawTargetDef } from '../../../player/clawLogic'
import { NEON, bulbString, chochin, fbox, glowRailing, neon, type FCtx } from '../kit2086'
import { COURSE, type Ledge, type SwingRingSpec } from './layoutChronicle'
import { additive, canvasTexture, font, softDotTexture, verticalText } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ 道すじ（純粋）

/**
 * ぶら下がってわたる道すじ（胸の高さの点の列）：飛びつく所 → 輪へ引かれてロープがぴんと張る → 輪の下をくぐる弧 → 向こうの足場へ。
 * 見せるための形（本当の動きは clawLogic の Pendulum）。n はおよその点の数
 */
export function swingGuidePath(s: Pick<SwingRingSpec, 'anchor' | 'rope' | 'dir' | 'start' | 'land'>, n = 48): THREE.Vector3[] {
  const a = s.anchor
  const d = s.dir.clone().setY(0).normalize()
  const chest = s.start.clone().add(v(0, 1, 0))
  const out: THREE.Vector3[] = []
  // (1) 輪へ引かれて、ロープの長さの円に入る所まで
  const toA = a.clone().sub(chest)
  const dist = toA.length()
  const entry = dist > s.rope ? chest.clone().addScaledVector(toA, (dist - s.rope) / dist) : chest.clone()
  const n1 = Math.max(2, Math.round(n * 0.18))
  for (let i = 0; i < n1; i++) out.push(chest.clone().lerp(entry, i / n1))
  // (2) 輪のまわりの弧（真下を通って、向こうへ 38° まで）
  const rel = entry.clone().sub(a)
  const along0 = rel.dot(d)
  const th0 = Math.atan2(along0, -rel.y)
  const th1 = (38 * Math.PI) / 180
  const n2 = Math.max(4, Math.round(n * 0.5))
  for (let i = 0; i <= n2; i++) {
    const th = th0 + ((th1 - th0) * i) / n2
    out.push(a.clone().addScaledVector(d, Math.sin(th) * s.rope).add(v(0, -Math.cos(th) * s.rope, 0)))
  }
  // (3) 手をはなして、山なりに向こうの足場へ（足もとの少し上まで）
  const rel0 = out[out.length - 1].clone()
  const land = s.land.clone().add(v(0, 0.5, 0))
  const n3 = Math.max(3, Math.round(n * 0.32))
  const lift = Math.max(0.6, land.y - rel0.y + 0.9)
  for (let i = 1; i <= n3; i++) {
    const k = i / n3
    const p = rel0.clone().lerp(land, k)
    p.y += Math.sin(k * Math.PI) * lift * (1 - k * 0.3)
    out.push(p)
  }
  return out
}

// ------------------------------------------------------------------ 形

export type SwingRingRuntime = {
  spec: SwingRingSpec
  def: ClawTargetDef
}

export type TowerSwingParts = {
  rings: SwingRingRuntime[]
  /** いまわたる輪（金色に脈打って、道すじを出す）。null で全部ふつうに。hanging：ぶら下がっている間（道すじと後光を消す） */
  setActive(index: number | null, hanging?: boolean): void
  update(dt: number): void
  setNight(on: boolean): void
  dispose(): void
}

const guideVert = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
attribute float aK;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // 先へ流れる光
  float run = 0.45 + 0.55 * smoothstep(0.16, 0.0, abs(fract(aK - uTime * 0.5) - 0.5) - 0.34);
  // 近くの点は大きくなりすぎないように（カメラのすぐ前で、ぼやけた帯にならないように）。すぐ近くはうすく
  float d = max(0.5, -mv.z);
  gl_PointSize = (4.0 + 4.0 * run) * uPixelRatio * clamp(16.0 / d, 0.5, 1.8);
  vA = run * smoothstep(2.0, 5.0, d);
}
`
const guideFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.12, d);
  float a = core * vA * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * (1.3 + core * 1.5), a);
}
`

/** かんばんの文字（夜は内側から灯る） */
function paintBoard(text: string, sub: string, bg: string, edge: string) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = bg
    g.beginPath()
    g.roundRect(6, 6, w - 12, h - 12, 28)
    g.fill()
    g.strokeStyle = edge
    g.lineWidth = 10
    g.stroke()
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = font(800, Math.round(h * 0.46))
    g.fillText(text, w / 2, h * 0.44)
    g.fillStyle = '#ffe9a8'
    g.font = font(700, Math.round(h * 0.16))
    g.fillText(sub, w / 2, h * 0.82)
  }
}

function paintTall(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#1b1d5e'
  g.beginPath()
  g.roundRect(6, 6, w - 12, h - 12, 30)
  g.fill()
  g.strokeStyle = '#ff7fc8'
  g.lineWidth = 10
  g.stroke()
  g.fillStyle = '#ffffff'
  g.font = font(800, 104)
  verticalText(g, 'ナンバタウン', w / 2, 34, 104, 1.08)
  g.fillStyle = '#9fe8ff'
  g.font = font(800, 30)
  g.textAlign = 'center'
  g.fillText('NANBA', w / 2, h - 60)
}

export function buildTowerSwings(c: FCtx, group: THREE.Group): TowerSwingParts {
  const C = COURSE
  const mats: THREE.Material[] = []
  const geos: THREE.BufferGeometry[] = []
  const texs: THREE.Texture[] = []
  const boards: THREE.MeshStandardMaterial[] = []

  // ---- 足場（板・ふちの光・腕・足もとの印・明かり）。wallX：取りつく壁の x。back：壁の中まで板をのばす長さ（丸い角の外壁にもつながって見えるように）
  const sideLedge = (L: Ledge, wallX: number, back: number, rails: Array<[number, number, number, number]>) => {
    const west = wallX < 0
    const cz = (L.z0 + L.z1) / 2
    const vx0 = west ? L.x0 - back : L.x0
    const vx1 = west ? L.x1 : L.x1 + back
    fbox(c, c.fm.panel, (vx0 + vx1) / 2, L.y - 0.16, cz, vx1 - vx0, 0.32, L.z1 - L.z0, { r: 0.08, tint: '#ffffff' })
    c.col.box((L.x0 + L.x1) / 2, L.y - 0.16, cz, L.x1 - L.x0, 0.32, L.z1 - L.z0)
    // 通りの側のふちと、両はしの光る線（夜でも足場の形が読めるように）
    const ex = west ? L.x1 + 0.01 : L.x0 - 0.01
    neon(c, v(ex, L.y - 0.22, L.z0), v(ex, L.y - 0.22, L.z1), 0.05, NEON.cyan)
    neon(c, v(ex, L.y + 0.015, L.z0 + 0.1), v(ex, L.y + 0.015, L.z1 - 0.1), 0.035, NEON.warm)
    for (const z of [L.z0 - 0.01, L.z1 + 0.01]) neon(c, v(vx0, L.y - 0.22, z), v(vx1, L.y - 0.22, z), 0.045, NEON.cyan)
    // 下の腕（壁 → 板の外のふち、ななめ）
    for (const z of [L.z0 + 0.35, cz, L.z1 - 0.35]) {
      const ax = west ? wallX - 0.1 : wallX + 0.1
      const bx = west ? L.x1 - 0.3 : L.x0 + 0.3
      const a = v(ax, L.y - 2.0, z)
      const b = v(bx, L.y - 0.3, z)
      const len = a.distanceTo(b)
      c.b.add(rbox(0.12, len, 0.12, 0.02), c.fm.darkMetal, M((a.x + b.x) / 2, (a.y + b.y) / 2, z, 0, 0, Math.atan2(-(b.x - a.x), b.y - a.y)))
    }
    // 足もとの印（着いた所＝やり直しの所）
    c.b.add(new THREE.RingGeometry(0.3, 0.37, 28), c.fm.glow, M((L.x0 + L.x1) / 2, L.y + 0.012, cz, -Math.PI / 2, 0, 0), { tint: new THREE.Color(0.25, 0.7, 1.0), cast: false, receive: false })
    // 手すり（向こうへ飛びこえないように。輪へ飛びつく側・着く側は空ける）。当たり判定は見えない壁
    for (const [ax, az, bx, bz] of rails) {
      glowRailing(c, ax, az, bx, bz, L.y, { h: 0.85, collider: false })
      c.col.wall(ax, az, bx, bz, L.y, L.y + 1.2, 0.2)
    }
    // 夜の明かり
    c.lights.push({ pos: v((L.x0 + L.x1) / 2 + (west ? 0.6 : -0.6), L.y + 2.2, cz), color: '#ffe2b0', intensity: 2.2, dist: 7 })
  }
  const W1 = C.W1
  const W2 = C.W2
  const N1 = C.N1
  // C2：C（塔の西の足場）の西へ張り出したバルコニー。西のふち（輪①へ飛びつく所）は空けて黄色く光らせ、南（広場の側）は手すり
  {
    const L = C.C2
    const cz = (L.z0 + L.z1) / 2
    fbox(c, c.fm.panel, (L.x0 + L.x1) / 2 + 0.05, L.y - 0.15, cz, L.x1 - L.x0 + 0.1, 0.3, L.z1 - L.z0, { r: 0.07, tint: '#ffffff' })
    c.col.box((L.x0 + L.x1) / 2, L.y - 0.15, cz, L.x1 - L.x0, 0.3, L.z1 - L.z0)
    neon(c, v(L.x0 - 0.01, L.y - 0.2, L.z0), v(L.x0 - 0.01, L.y - 0.2, L.z1), 0.05, NEON.cyan)
    neon(c, v(L.x0 - 0.01, L.y + 0.015, L.z0 + 0.1), v(L.x0 - 0.01, L.y + 0.015, L.z1 - 0.1), 0.06, NEON.warm)
    neon(c, v(L.x0, L.y - 0.2, L.z0 - 0.01), v(L.x1, L.y - 0.2, L.z0 - 0.01), 0.045, NEON.cyan)
    // 下の腕（塔の壁 → 板の西のふち、ななめ）
    for (const z of [L.z0 + 0.3, L.z1 - 0.3]) {
      const a = v(5.55, L.y - 2.6, z)
      const b = v(L.x0 + 0.25, L.y - 0.3, z)
      c.b.add(rbox(0.12, a.distanceTo(b), 0.12, 0.02), c.fm.darkMetal, M((a.x + b.x) / 2, (a.y + b.y) / 2, z, 0, 0, Math.atan2(-(b.x - a.x), b.y - a.y)))
    }
    // 南の手すり（C と C2 の広場の側）。当たり判定は見えない壁
    glowRailing(c, L.x0 + 0.05, L.z1 - 0.05, 5.55, L.z1 - 0.05, L.y, { h: 0.85, collider: false })
    c.col.wall(L.x0 + 0.05, L.z1 - 0.05, 5.55, L.z1 - 0.05, L.y, L.y + 1.2, 0.2)
    c.b.add(new THREE.RingGeometry(0.3, 0.37, 28), c.fm.glow, M(L.x0 + 0.5, L.y + 0.012, cz, -Math.PI / 2, 0, 0), { tint: new THREE.Color(0.25, 0.7, 1.0), cast: false, receive: false })
    c.lights.push({ pos: v(L.x0 + 0.8, L.y + 2.2, cz), color: '#ffe2b0', intensity: 2.0, dist: 6 })
  }
  // W1：西のビルの南東の丸い角（外壁は奥へ下がっていく）。南の端に手すり
  sideLedge(W1, -7.2, 2.6, [[W1.x0 + 0.05, W1.z1 - 0.05, W1.x1 - 0.05, W1.z1 - 0.05]])
  // W2：北の端に手すり（輪②でとびすぎても落ちない）
  sideLedge(W2, -6.0, 0.6, [[W2.x0 + 0.05, W2.z0 + 0.05, W2.x1 - 0.05, W2.z0 + 0.05]])
  // N1：北の端・南の端の手すり（南の端は、金具の下で待つ所なので、まん中を空ける）
  sideLedge(N1, 6.0, 0.6, [
    [N1.x0 + 0.05, N1.z0 + 0.05, N1.x1 - 0.05, N1.z0 + 0.05],
    [N1.x1 - 0.05, N1.z1 - 0.05, N1.x1 - 0.9, N1.z1 - 0.05],
  ])

  // ---- 足場の下のかんばん（通りを向く。夜は灯る）
  const board = (L: Ledge, text: string, sub: string, bg: string, edge: string, west: boolean) => {
    const tex = canvasTexture(512, 256, paintBoard(text, sub, bg, edge))
    texs.push(tex)
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4, roughness: 0.45 })
    boards.push(mat)
    mats.push(mat)
    const w = L.z1 - L.z0 - 0.3
    const geo = new THREE.PlaneGeometry(w, w * 0.5)
    geos.push(geo)
    const m = new THREE.Mesh(geo, mat)
    const x = west ? L.x1 - 0.12 : L.x0 + 0.12
    m.position.set(x, L.y - 0.4 - w * 0.25, (L.z0 + L.z1) / 2)
    m.rotation.y = west ? Math.PI / 2 : -Math.PI / 2
    m.name = 'course_board'
    group.add(m)
    // 枠（裏の箱）
    fbox(c, c.fm.navyGloss, west ? x - 0.12 : x + 0.12, m.position.y, m.position.z, 0.2, w * 0.5 + 0.16, w + 0.16, { r: 0.05 })
  }
  board(W1, 'なんば', 'NANBA TOWN', '#1d2c66', '#8fe6ff', true)
  board(W2, '博覧祭', 'EXPO 2086', '#5a1d5e', '#ffd36b', true)
  board(N1, '2086', 'TIME FESTIVAL', '#163a5c', '#ff9ad8', false)

  // ---- 西のビルの縦の大きなかんばん（W1 と W2 のあいだ。輪②でその前をわたる）
  {
    const tex = canvasTexture(256, 900, paintTall)
    texs.push(tex)
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.5, roughness: 0.4 })
    boards.push(mat)
    mats.push(mat)
    const geo = new THREE.PlaneGeometry(1.5, 5.3)
    geos.push(geo)
    const m = new THREE.Mesh(geo, mat)
    m.position.set(-5.86, 12.6, -27.0)
    m.rotation.y = Math.PI / 2
    m.name = 'course_tall_sign'
    group.add(m)
    fbox(c, c.fm.navyGloss, -5.95, 12.6, -27.0, 0.16, 5.5, 1.7, { r: 0.06 })
  }

  // ---- 光る輪（電線・腕から下がる）
  const GOLD = new THREE.Color('#ffd36b')
  const CYAN = new THREE.Color(0.35, 1.6, 2.4)
  const ringParts: Array<{ glowMat: THREE.MeshBasicMaterial; haloMat: THREE.MeshBasicMaterial; halos: THREE.Mesh[]; back: THREE.Sprite }> = []
  const rings: SwingRingRuntime[] = []
  for (const s of C.swings) {
    const a = s.anchor
    const h = s.hang
    const top = h.y
    if (h.kind === 'cable') {
      // 通りをまたぐ電線（たるみ）と、お祭りの電球・提灯
      const A = v(h.x0, top, a.z)
      const B = v(h.x1, h.y1 ?? top, a.z)
      bulbString(c, A, B, 0.35, 0.45, NEON.warm)
      for (let x = h.x0 + 1.2; x < h.x1 - 0.8; x += 2.4) if (Math.abs(x - a.x) > 0.9) chochin(c, x, top - 0.75, a.z, Math.round(x) % 2 ? 'red' : 'white', 0.75)
      // 屋上の上なら、柱を立てる
      for (const x of [h.x0, h.x1]) if (top > 17.4 && (h.y1 ?? top) > 17.4) c.b.add(new THREE.CylinderGeometry(0.06, 0.08, top - 17.0 + 0.2, 10), c.fm.metal, M(x + (x < 0 ? -0.25 : 0.25), (top + 17.0) / 2, a.z))
    } else {
      // 壁から出た腕と、ななめの支え
      const len = Math.abs(a.x - h.wallX)
      const mx = (a.x + h.wallX) / 2
      fbox(c, c.fm.darkMetal, mx, top, a.z, len + 0.2, 0.14, 0.14, { r: 0.03 })
      const b0 = v(h.wallX, top - 1.4, a.z)
      const b1 = v(a.x - 0.2 * Math.sign(a.x - h.wallX), top - 0.05, a.z)
      c.b.add(rbox(0.09, b0.distanceTo(b1), 0.09, 0.02), c.fm.darkMetal, M((b0.x + b1.x) / 2, (b0.y + b1.y) / 2, a.z, 0, 0, Math.atan2(-(b1.x - b0.x), b1.y - b0.y)))
      neon(c, v(h.wallX, top + 0.09, a.z), v(a.x, top + 0.09, a.z), 0.035, NEON.cyan)
    }
    // 吊り金具と輪（真鍮＋水色の光）。わたる向きを正面にする（飛びつく所から輪の穴が見える）。電線が斜めなら、輪の上の高さ
    const ht = h.kind === 'cable' && h.y1 !== undefined ? top + ((h.y1 - top) * (a.x - h.x0)) / (h.x1 - h.x0) - 0.25 : top
    c.b.add(new THREE.CylinderGeometry(0.025, 0.025, ht - a.y - 0.55, 8), c.fm.metal, M(a.x, (ht + a.y + 0.55) / 2, a.z))
    c.b.add(rbox(0.3, 0.2, 0.3, 0.05), c.fm.darkMetal, M(a.x, ht - 0.12, a.z))
    const yaw = Math.atan2(s.dir.x, s.dir.z)
    c.b.add(new THREE.TorusGeometry(0.5, 0.06, 12, 40), c.m.brass, M(a.x, a.y, a.z, 0, yaw, 0))
    c.b.add(new THREE.SphereGeometry(0.09, 10, 6), c.m.brass, M(a.x, a.y + 0.53, a.z))
    const glowMat = new THREE.MeshBasicMaterial({ color: CYAN.clone(), toneMapped: false, fog: false })
    mats.push(glowMat)
    const glowGeo = new THREE.TorusGeometry(0.5, 0.032, 8, 48)
    geos.push(glowGeo)
    for (const off of [-0.05, 0.05]) {
      const g = new THREE.Mesh(glowGeo, glowMat)
      g.position.copy(a).addScaledVector(s.dir, off)
      g.rotation.y = yaw
      group.add(g)
    }
    // 脈打つ光の輪（2 枚、十字に）と、やわらかい後光
    const haloMat = additive(CYAN, 0.8)
    mats.push(haloMat)
    const haloGeo = new THREE.RingGeometry(0.56, 0.63, 48)
    geos.push(haloGeo)
    const halos = [0, Math.PI / 2].map((r) => {
      const m = new THREE.Mesh(haloGeo, haloMat)
      m.position.copy(a)
      m.rotation.y = yaw + r
      m.renderOrder = 4
      group.add(m)
      return m
    })
    // いまの輪の後光は、どの向きからも見えるように、いつもカメラを向く板（遠くからでも金色の光で「次はここ」）
    const backMat = new THREE.SpriteMaterial({ map: softDotTexture(), color: GOLD.clone(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 })
    mats.push(backMat)
    const back = new THREE.Sprite(backMat)
    back.scale.set(2.4, 2.4, 1)
    back.position.copy(a)
    back.renderOrder = 3
    group.add(back)
    ringParts.push({ glowMat, haloMat, halos, back })
    c.lights.push({ pos: a.clone().add(v(0, 0.3, 0)), color: '#bfe6ff', intensity: 1.8, dist: 6 })
    const def: ClawTargetDef = {
      id: s.id,
      type: 'swing_anchor',
      label: '光る輪',
      point: a.clone(),
      radius: 0.6,
      enabled: false,
      noLineOfSight: true,
      range: 11,
      ropeLength: s.rope,
    }
    rings.push({ spec: s, def })
  }

  // ---- 道すじ（いまわたる輪の分だけ出す）
  const pr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1
  const guideU = { uTime, uPixelRatio: { value: pr }, uColor: { value: GOLD.clone() }, uOpacity: { value: 0 } }
  const guideMat = new THREE.ShaderMaterial({ vertexShader: guideVert, fragmentShader: guideFrag, uniforms: guideU, transparent: true, depthWrite: false, fog: false, toneMapped: false })
  mats.push(guideMat)
  const guides = C.swings.map((s) => {
    const pts = swingGuidePath(s)
    const pos = new Float32Array(pts.length * 3)
    const ks = new Float32Array(pts.length)
    pts.forEach((p, i) => {
      pos.set([p.x, p.y, p.z], i * 3)
      ks[i] = i / (pts.length - 1)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aK', new THREE.BufferAttribute(ks, 1))
    geos.push(g)
    const p = new THREE.Points(g, guideMat)
    p.frustumCulled = false
    p.renderOrder = 6
    p.visible = false
    group.add(p)
    return p
  })

  let active: number | null = null
  let hang = false
  let fade = 0
  let night = false
  return {
    rings,
    setActive(index: number | null, hanging = false) {
      if (index === active && hanging === hang) return
      if (index !== active) fade = 0
      active = index
      hang = hanging
      guides.forEach((g, i) => (g.visible = i === index && !hanging))
    },
    update(dt: number) {
      const t = uTime.value
      fade = Math.min(1, fade + dt * 1.5)
      guideU.uOpacity.value = 0.9 * fade
      const k = (t * 0.8) % 1
      ringParts.forEach((p, i) => {
        const on = i === active
        p.glowMat.color.copy(on ? GOLD : CYAN).multiplyScalar(on ? 1.9 : 1)
        p.haloMat.color.copy(on ? GOLD : CYAN)
        for (const h of p.halos) h.scale.setScalar(1 + k * (on ? 1.2 : 0.7))
        p.haloMat.opacity = (on ? 0.95 : 0.5) * (1 - k) * (1 - k)
        p.back.material.opacity = on && !hang ? 0.5 + 0.15 * Math.sin(t * 5) : 0
      })
    },
    setNight(on: boolean) {
      night = on
      for (const m of boards) m.emissiveIntensity = night ? 1.5 : 0.4
    },
    dispose() {
      for (const m of mats) m.dispose()
      for (const g of geos) g.dispose()
      for (const t of texs) t.dispose()
    },
  }
}
