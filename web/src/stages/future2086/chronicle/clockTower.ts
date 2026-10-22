// 時計台（物語 v7 の 2・4・12 章）：北の通りの入口、北東の段々のビルの角に立つ高さ約 20m の塔。
// ・白いパネルの胴（角に光る線）、紺の時計の部分に 4 面の大きな文字盤（夜は内側から灯る。針はシェーダで描くので 1 回の描画）
// ・てっぺんの足場（トワが立つ。低い胸壁・四隅の提灯・北に細い尖塔と光る輪）
// ・通りに面した西の壁：足場（C のバルコニー・D の細い足場・E の時計の下の回廊）と金具 2 個（pull_player、着地点つき）。
//   4 章ののぼりのコース（大歯車・大きな針・回る歯車の金具・がれき）は towerCourse.ts。
//   次につかむ金具だけを金色の輪と脈打つ光で目立たせる（setNextHook。ほかは細い水色の輪だけ）
import * as THREE from 'three'
import { M, rbox } from '../../../render/batch'
import { uTime } from '../../../render/materials'
import type { ClawTargetDef } from '../../../player/clawLogic'
import { NEON, chochin, fbox, glowRailing, neon, type FCtx } from '../kit2086'
import { TOWER } from './layoutChronicle'
import { additive, canvasTexture, createSeamMaterial, font, softDotTexture, verticalText } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type ClockTowerParts = {
  group: THREE.Group
  /** のぼる金具（下から順。enabled を切り替えてよい） */
  hooks: ClawTargetDef[]
  /** 文字盤の時刻（時・分。分は小数でよい） */
  setTime(hours: number, minutes: number): void
  /** 次につかむ金具（hooks の番号。null で金色の印を消す） */
  setNextHook(index: number | null): void
  /** 屋上にトワが立っているか（夜、トワの後ろの後光を強くして、夜空に姿が読めるように） */
  setTowaOnTop(on: boolean): void
  /** 12 章：時計台の上の空の大きなゆらぎ（裂く所。0..1。0 で消す） */
  setSkySeam(k: number): void
  /** 文字盤を一瞬強く光らせる（ループ・石の共鳴の合図。0..1） */
  setFlash(k: number): void
  setNight(on: boolean): void
  update(dt: number): void
}

// ------------------------------------------------------------------ 文字盤

function paintDial(g: CanvasRenderingContext2D, w: number, h: number): void {
  const cx = w / 2
  const cy = h / 2
  const R = w / 2
  g.clearRect(0, 0, w, h)
  // 地（クリーム）と、外の紺の輪
  const gr = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R)
  gr.addColorStop(0, '#fffaf0')
  gr.addColorStop(0.85, '#f4ead6')
  gr.addColorStop(1, '#e8dcc2')
  g.fillStyle = gr
  g.beginPath()
  g.arc(cx, cy, R, 0, Math.PI * 2)
  g.fill()
  g.lineWidth = R * 0.07
  g.strokeStyle = '#1d2c66'
  g.beginPath()
  g.arc(cx, cy, R * 0.955, 0, Math.PI * 2)
  g.stroke()
  g.lineWidth = R * 0.012
  g.strokeStyle = '#c99a3c'
  g.beginPath()
  g.arc(cx, cy, R * 0.9, 0, Math.PI * 2)
  g.stroke()
  // 分の目もり
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2
    const big = i % 5 === 0
    const r0 = R * (big ? 0.78 : 0.83)
    const r1 = R * 0.875
    g.strokeStyle = big ? '#1d2c66' : '#6f7aa0'
    g.lineWidth = big ? R * 0.022 : R * 0.008
    g.beginPath()
    g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0)
    g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1)
    g.stroke()
  }
  // 数字（子どもにも読める算用数字）
  g.fillStyle = '#1d2c66'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = font(800, Math.round(R * 0.17))
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.fillText(String(i), cx + Math.sin(a) * R * 0.64, cy - Math.cos(a) * R * 0.64 + R * 0.01)
  }
  // 真ん中の小さな印（なんばタウンの時計台）
  g.font = font(700, Math.round(R * 0.07))
  g.fillStyle = '#5a6a9a'
  g.fillText('NANBA', cx, cy + R * 0.3)
  g.fillText('2086', cx, cy + R * 0.39)
}

const dialVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const dialFrag = /* glsl */ `
uniform sampler2D map;
uniform float uHour;
uniform float uMin;
uniform float uNight;
uniform float uFlash;
varying vec2 vUv;
float seg(vec2 p, float ang, float len, float w) {
  vec2 d = vec2(sin(ang), cos(ang));
  float t = clamp(dot(p, d), -0.1, len);
  return length(p - d * t) - w;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  vec3 col = texture2D(map, vUv).rgb;
  // 夜は内側から灯る（暖かい白）
  col *= mix(0.92, 2.8, uNight);
  float hand = min(seg(p, uHour, 0.48, 0.05), seg(p, uMin, 0.76, 0.032));
  float fill = 1.0 - smoothstep(0.0, 0.012, hand);
  float edge = 1.0 - smoothstep(0.012, 0.03, hand);
  col = mix(col, vec3(1.0, 0.78, 0.32) * mix(1.0, 1.8, uNight), edge * (1.0 - fill));
  col = mix(col, vec3(0.07, 0.11, 0.3), fill);
  float cap = 1.0 - smoothstep(0.065, 0.075, r);
  col = mix(col, vec3(1.0, 0.8, 0.35) * mix(1.1, 1.9, uNight), cap);
  col += vec3(0.5, 0.85, 1.6) * uFlash * (1.2 - r);
  gl_FragColor = vec4(col, 1.0);
}
`

/** 縦長の看板「時計台」（南の面。夜は灯る） */
function paintSign(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#16245c'
  g.beginPath()
  g.roundRect(4, 4, w - 8, h - 8, 26)
  g.fill()
  g.strokeStyle = '#8fe6ff'
  g.lineWidth = 8
  g.stroke()
  g.fillStyle = '#ffffff'
  g.font = font(800, 92)
  verticalText(g, '時計台', w / 2, 40, 92, 1.12)
  g.fillStyle = '#ffd98a'
  g.font = font(800, 30)
  g.textAlign = 'center'
  g.fillText('NANBA', w / 2, h - 86)
  g.fillText('CLOCK', w / 2, h - 50)
}

export function buildClockTower(c: FCtx, root: THREE.Group): ClockTowerParts {
  const T = TOWER
  const C = T.clock
  const group = new THREE.Group()
  group.name = 'clock_tower'
  root.add(group)
  const cx = T.cx
  const cz = T.cz
  const W = T.x1 - T.x0
  const D = T.z1 - T.z0

  // ---- 台座と胴
  fbox(c, c.fm.panel, cx, 0.3, cz, W + 0.5, 0.6, D + 0.5, { r: 0.1, tint: '#dfe4ec', texM: 2 })
  neon(c, v(T.x0 - 0.26, 0.62, T.z0 - 0.25), v(T.x0 - 0.26, 0.62, T.z1 + 0.25), 0.05, NEON.cyan)
  neon(c, v(T.x0 - 0.25, 0.62, T.z1 + 0.26), v(T.x1 + 0.25, 0.62, T.z1 + 0.26), 0.05, NEON.cyan)
  // 胴は白い樹脂（日陰でも明るく見えるように少し青白く）。角は面取り
  fbox(c, c.fm.plastic, cx, (0.6 + C.y0) / 2, cz, W, C.y0 - 0.6, D, { r: 0.16, tint: '#f4f8ff' })
  c.col.box(cx, C.y0 / 2, cz, W + 0.5, C.y0, D + 0.5)
  // 角の光る線（4 本）と、段ごとの白い帯
  for (const [x, z] of [
    [T.x0 - 0.02, T.z0 - 0.02],
    [T.x0 - 0.02, T.z1 + 0.02],
    [T.x1 + 0.02, T.z1 + 0.02],
    [T.x1 + 0.02, T.z0 - 0.02],
  ] as const)
    neon(c, v(x, 0.7, z), v(x, C.y0 - 0.35, z), 0.035, NEON.cyan)
  for (const y of [4.4, 8.6, 12.8]) {
    fbox(c, c.fm.panel, cx, y, cz, W + 0.22, 0.32, D + 0.22, { r: 0.08, tint: '#ffffff' })
    neon(c, v(T.x0 - 0.12, y - 0.19, T.z0 - 0.11), v(T.x0 - 0.12, y - 0.19, T.z1 + 0.11), 0.03, NEON.blue)
    neon(c, v(T.x0 - 0.11, y - 0.19, T.z1 + 0.12), v(T.x1 + 0.11, y - 0.19, T.z1 + 0.12), 0.03, NEON.blue)
  }
  // 西の面：細長いガラスの窓（ネクマックスがのぼる背景）と、下の扉
  fbox(c, c.fm.glass, T.x0 - 0.02, 9.6, -22.25, 0.06, 11.0, 0.7, { r: 0.02 })
  fbox(c, c.fm.glass, T.x1 + 0.02, 9.6, cz, 0.06, 11.0, 1.0, { r: 0.02 })
  // 南の面（広場から見える）：左右に縦の光の筋
  for (const s of [-1, 1]) neon(c, v(cx + s * 1.05, 5.0, T.z1 + 0.03), v(cx + s * 1.05, C.y0 - 0.6, T.z1 + 0.03), 0.035, NEON.blue)
  // 扉（紺のアーチと金の枠）
  {
    const dz = -22.8
    fbox(c, c.fm.navyGloss, T.x0 - 0.04, 1.75, dz, 0.08, 2.3, 1.2, { r: 0.03 })
    c.b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 20, 1, false, 0, Math.PI), c.fm.navyGloss, M(T.x0 - 0.04, 2.9, dz, 0, 0, Math.PI / 2), {})
    c.b.add(new THREE.TorusGeometry(0.62, 0.045, 8, 24, Math.PI), c.m.brass, M(T.x0 - 0.08, 2.9, dz, 0, -Math.PI / 2, 0))
    for (const s of [-1, 1]) fbox(c, c.m.brass, T.x0 - 0.08, 1.75, dz + s * 0.62, 0.06, 2.3, 0.08, { r: 0.02 })
    c.b.add(new THREE.SphereGeometry(0.05, 10, 8), c.m.brass, M(T.x0 - 0.12, 1.8, dz + 0.32))
  }
  // 南の面（広場から見える）：縦の看板
  {
    const tex = canvasTexture(256, 768, paintSign)
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.35, roughness: 0.4 })
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 3.3), mat)
    sign.position.set(cx, 11.2, T.z1 + 0.04)
    sign.name = 'clock_sign'
    group.add(sign)
    c.updaters.push(() => {
      mat.emissiveIntensity = night ? 1.4 : 0.35
    })
  }

  // 足場の手すり：当たり判定は見えない壁にする（プレイヤーは止めるが、カメラは手すりの外に下がれる。
  // ふつうの箱だと、のぼっている間のカメラが手すりに押されて、ネクマックスの頭の後ろまで寄ってしまう）
  const railing = (ax: number, az: number, bx: number, bz: number, y: number, h: number) => {
    glowRailing(c, ax, az, bx, bz, y, { h, collider: false })
    c.col.wall(ax, az, bx, bz, y, y + 1.2, 0.2)
  }

  // ---- 西の壁の足場（下から）
  for (const L of T.ledges) {
    const lx = (L.x0 + L.x1) / 2
    const lz = (L.z0 + L.z1) / 2
    const lw = L.x1 - L.x0
    const ld = L.z1 - L.z0
    if (L.id === 'l4') {
      // 時計の部分の下をぐるりと回る回廊（ひと続きの板。外へ出る幅は東西南北で同じ）
      const x0 = L.x0
      const x1 = C.x1 + (C.x0 - L.x0)
      fbox(c, c.fm.panel, (x0 + x1) / 2, L.y - 0.16, lz, x1 - x0, 0.32, ld, { r: 0.08, tint: '#ffffff' })
      c.col.box((x0 + x1) / 2, L.y - 0.16, lz, x1 - x0, 0.32, ld)
      neon(c, v(x0 - 0.01, L.y - 0.22, L.z0), v(x0 - 0.01, L.y - 0.22, L.z1), 0.04, NEON.cyan)
      neon(c, v(x0, L.y - 0.22, L.z1 + 0.01), v(x1, L.y - 0.22, L.z1 + 0.01), 0.04, NEON.cyan)
      // 手すり（西・南・北の外の縁）
      railing(x0 + 0.05, L.z0 + 0.05, x0 + 0.05, L.z1 - 0.05, L.y, 0.9)
      railing(x0 + 0.05, L.z1 - 0.05, x1 - 0.05, L.z1 - 0.05, L.y, 0.9)
      railing(x0 + 0.05, L.z0 + 0.05, x1 - 0.05, L.z0 + 0.05, L.y, 0.9)
      // 下の支え（斜めの腕）
      for (const z of [L.z0 + 0.4, L.z1 - 0.4]) c.b.add(rbox(0.12, 1.2, 0.12, 0.03), c.fm.darkMetal, M(x0 + 0.55, L.y - 0.75, z, 0, 0, -0.8))
      continue
    }
    fbox(c, c.fm.panel, lx, L.y - 0.14, lz, lw, 0.28, ld, { r: 0.07, tint: '#ffffff' })
    c.col.box(lx, L.y - 0.14, lz, lw, 0.28, ld)
    neon(c, v(L.x0 - 0.01, L.y - 0.2, L.z0 + 0.06), v(L.x0 - 0.01, L.y - 0.2, L.z1 - 0.06), 0.04, NEON.cyan)
    // 足元の印（着地する所が分かるように、うすく光る輪）
    c.b.add(new THREE.RingGeometry(0.28, 0.34, 24), c.fm.glow, M(lx, L.y + 0.012, lz, -Math.PI / 2, 0, 0), { tint: new THREE.Color(0.25, 0.7, 1.0), cast: false, receive: false })
    // 下の支え（三角の腕）
    for (const z of [L.z0 + 0.25, L.z1 - 0.25]) c.b.add(rbox(0.1, 0.9, 0.1, 0.02), c.fm.darkMetal, M(L.x0 + lw * 0.45, L.y - 0.6, z, 0, 0, -0.75))
    if (L.rail) railing(L.x0 + 0.05, L.z0 + 0.05, L.x0 + 0.05, L.z1 - 0.05, L.y, 0.85)
  }

  // ---- 時計の部分（紺の箱・白い角柱・4 面の文字盤）
  const ccx = (C.x0 + C.x1) / 2
  const ccz = (C.z0 + C.z1) / 2
  const CW = C.x1 - C.x0
  const CH = C.y1 - C.y0
  fbox(c, c.fm.navyGloss, ccx, (C.y0 + C.y1) / 2, ccz, CW, CH, CW, { r: 0.12 })
  c.col.box(ccx, (C.y0 + C.y1) / 2, ccz, CW, CH, CW)
  for (const [x, z] of [
    [C.x0, C.z0],
    [C.x0, C.z1],
    [C.x1, C.z1],
    [C.x1, C.z0],
  ] as const) {
    fbox(c, c.fm.panel, x + (x < ccx ? 0.3 : -0.3), (C.y0 + C.y1) / 2, z + (z < ccz ? 0.3 : -0.3), 0.72, CH + 0.1, 0.72, { r: 0.1, tint: '#ffffff' })
    neon(c, v(x + (x < ccx ? -0.04 : 0.04), C.y0 + 0.3, z + (z < ccz ? -0.04 : 0.04)), v(x + (x < ccx ? -0.04 : 0.04), C.y1 - 0.3, z + (z < ccz ? -0.04 : 0.04)), 0.035, NEON.cyan)
  }
  // 上下の金の帯
  for (const y of [C.y0 + 0.12, C.y1 - 0.12]) fbox(c, c.m.gold, ccx, y, ccz, CW + 0.08, 0.1, CW + 0.08, { r: 0.03 })
  // 文字盤（4 面を 1 つの形に。針はシェーダ）
  const dialTex = canvasTexture(512, 512, paintDial, 8)
  const dialMat = new THREE.ShaderMaterial({
    vertexShader: dialVert,
    fragmentShader: dialFrag,
    uniforms: { map: { value: dialTex }, uHour: { value: 0 }, uMin: { value: 0 }, uNight: { value: 0 }, uFlash: { value: 0 } },
    fog: false,
  })
  dialMat.name = 'chronicle-clockDial'
  const faces: THREE.BufferGeometry[] = []
  const faceYaws = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
  for (const yaw of faceYaws) {
    const n = v(Math.sin(yaw), 0, Math.cos(yaw))
    const p = v(ccx, T.faceY, ccz).addScaledVector(n, CW / 2 + 0.035)
    const g = new THREE.CircleGeometry(T.faceR, 48)
    g.applyMatrix4(new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), v(1, 1, 1)))
    faces.push(g)
    // 白い縁と金の内輪
    const ring = new THREE.Matrix4().compose(p.clone().addScaledVector(n, 0.02), new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), yaw), v(1, 1, 1))
    c.b.add(new THREE.TorusGeometry(T.faceR + 0.07, 0.1, 10, 56), c.fm.plastic, ring, { tint: '#ffffff' })
    c.b.add(new THREE.TorusGeometry(T.faceR + 0.2, 0.025, 6, 56), c.fm.glow, ring, { tint: NEON.cyan, cast: false })
  }
  const dial = new THREE.Mesh(mergeFaces(faces), dialMat)
  dial.name = 'clock_dials'
  group.add(dial)
  // 夜の光（文字盤の前）
  c.lights.push({ pos: v(T.x0 - 1.2, T.faceY, cz), color: '#ffe6b8', intensity: 2.2, dist: 8 })
  c.lights.push({ pos: v(cx, T.faceY, C.z1 + 1.2), color: '#ffe6b8', intensity: 2.2, dist: 8 })

  // ---- 屋上（てっぺんの足場）
  const Dk = T.deck
  const dcx = (Dk.x0 + Dk.x1) / 2
  const dcz = (Dk.z0 + Dk.z1) / 2
  const DW = Dk.x1 - Dk.x0
  const DD = Dk.z1 - Dk.z0
  fbox(c, c.fm.panel, ccx, C.y1 + 0.2, ccz, CW + 0.5, 0.4, CW + 0.5, { r: 0.1, tint: '#ffffff' })
  fbox(c, c.fm.panel, dcx, T.deckY - 0.2, dcz, DW, 0.4, DD, { r: 0.1, tint: '#f2f5f9' })
  c.col.box(dcx, (C.y1 + T.deckY) / 2, dcz, DW, T.deckY - C.y1, DD)
  for (const [ax, az, bx, bz] of [
    [Dk.x0, Dk.z0, Dk.x0, Dk.z1],
    [Dk.x0, Dk.z1, Dk.x1, Dk.z1],
    [Dk.x1, Dk.z1, Dk.x1, Dk.z0],
    [Dk.x1, Dk.z0, Dk.x0, Dk.z0],
  ] as const)
    neon(c, v(ax, T.deckY - 0.3, az), v(bx, T.deckY - 0.3, bz), 0.05, NEON.cyan)
  // 低い胸壁（白）と上の光る線。当たり判定は少し高め（落ちないように）で、見えない壁にする
  // （下の広場から、てっぺんのトワを見上げる演出のカメラが、胸壁の当たり判定に引っかかってトワのすぐ前まで寄らないように）
  const parapet = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az)
    const rot = -Math.atan2(bz - az, bx - ax)
    fbox(c, c.fm.panel, (ax + bx) / 2, T.deckY + 0.27, (az + bz) / 2, len, 0.54, 0.16, { rotY: rot, r: 0.05, tint: '#ffffff' })
    neon(c, v(ax, T.deckY + 0.56, az), v(bx, T.deckY + 0.56, bz), 0.035, NEON.cyan)
    c.col.wall(ax, az, bx, bz, T.deckY, T.deckY + 1.0, 0.16)
  }
  const e = 0.08
  parapet(Dk.x0 + e, Dk.z0 + e, Dk.x0 + e, Dk.z1 - e)
  parapet(Dk.x0 + e, Dk.z1 - e, Dk.x1 - e, Dk.z1 - e)
  parapet(Dk.x1 - e, Dk.z1 - e, Dk.x1 - e, Dk.z0 + e)
  parapet(Dk.x1 - e, Dk.z0 + e, Dk.x0 + e, Dk.z0 + e)
  // 四隅の提灯（短い柱の上）
  for (const [x, z, k] of [
    [Dk.x0 + 0.2, Dk.z0 + 0.2, 'white'],
    [Dk.x0 + 0.2, Dk.z1 - 0.2, 'red'],
    [Dk.x1 - 0.2, Dk.z1 - 0.2, 'white'],
    [Dk.x1 - 0.2, Dk.z0 + 0.2, 'red'],
  ] as const) {
    c.b.add(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), c.fm.metal, M(x, T.deckY + 0.45, z))
    chochin(c, x, T.deckY + 1.15, z, k, 0.85, { light: k === 'red' })
  }
  // 北の細い尖塔と光る輪、先の灯り
  {
    const sx = dcx
    const sz = Dk.z0 + 0.7
    const top = T.deckY + 4.6
    c.b.add(new THREE.CylinderGeometry(0.07, 0.16, top - T.deckY, 12), c.fm.panel, M(sx, (T.deckY + top) / 2, sz), { tint: '#ffffff', uv: 'scale', uvScale: [1, 2] })
    c.b.add(new THREE.CylinderGeometry(0.28, 0.32, 0.3, 16), c.fm.darkMetal, M(sx, T.deckY + 0.15, sz))
    c.b.add(new THREE.TorusGeometry(0.55, 0.035, 8, 40), c.fm.glow, M(sx, T.deckY + 3.1, sz, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false })
    c.b.add(new THREE.TorusGeometry(0.38, 0.03, 8, 32), c.m.brass, M(sx, T.deckY + 3.6, sz, Math.PI / 2, 0, 0))
    c.b.add(new THREE.SphereGeometry(0.14, 14, 10), c.fm.glow, M(sx, top + 0.1, sz), { tint: NEON.white, cast: false })
    c.lights.push({ pos: v(sx, top, sz), color: '#cfe8ff', intensity: 2.0, dist: 9 })
    c.col.box(sx, T.deckY + 1.2, sz, 0.5, 2.4, 0.5)
  }

  // ---- のぼる金具（真鍮の輪＋細い水色の光の輪＋壁から出た腕）。次につかむ 1 個は下の金色の印が重なる
  const HOOK_R = 0.36
  const hooks: ClawTargetDef[] = []
  for (const h of T.hooks) {
    const p = h.point
    const wallX = h.id === 'clock_hook_top' ? Dk.x0 : p.x + 0.17
    // 腕（壁 → 輪）
    c.b.add(rbox(Math.max(0.05, wallX - p.x), 0.07, 0.07, 0.02), c.fm.darkMetal, M((wallX + p.x) / 2 + 0.04, p.y + 0.2, p.z))
    c.b.add(new THREE.TorusGeometry(0.17, 0.035, 10, 24), c.m.brass, M(p.x, p.y, p.z, 0, Math.PI / 2, 0))
    c.b.add(new THREE.TorusGeometry(HOOK_R, 0.014, 6, 32), c.fm.glow, M(p.x - 0.01, p.y, p.z, 0, Math.PI / 2, 0), { tint: new THREE.Color(0.16, 0.5, 0.75), cast: false })
    hooks.push({
      id: h.id,
      type: 'pull_player',
      label: h.id === 'clock_hook_top' ? '時計台のてっぺん' : '時計台の金具',
      point: p.clone(),
      radius: 0.42,
      enabled: true,
      facing: v(-1, 0, 0),
      landing: h.landing.clone(),
      via: h.via?.clone(),
    })
  }
  // 次につかむ金具の印（金色の輪・脈打つ光の輪・やわらかい後光）。1 組だけを次の金具へ動かす
  const GOLD = new THREE.Color('#ffd36b')
  const next = new THREE.Group()
  next.name = 'clock_next_hook'
  next.visible = false
  // 輪は加算にしない（白い壁の上でも金色に見えるように）
  const nextRing = new THREE.Mesh(new THREE.TorusGeometry(HOOK_R, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(1.5), toneMapped: false, fog: false }))
  nextRing.rotation.y = Math.PI / 2
  const haloMat = additive(GOLD, 0.8)
  const halo = new THREE.Mesh(new THREE.RingGeometry(HOOK_R, HOOK_R + 0.08, 40), haloMat)
  halo.rotation.y = -Math.PI / 2
  const backGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), additive(GOLD, 0.42, softDotTexture()))
  backGlow.rotation.y = -Math.PI / 2
  backGlow.position.x = 0.05
  for (const m of [nextRing, halo, backGlow]) m.renderOrder = 4
  // 脈打つ輪と後光は、上の足場の床にかくれても見えるように（下から見上げると、金具はひとつ上の足場の上にある）
  for (const m of [halo, backGlow]) {
    ;(m.material as THREE.Material).depthTest = false
    m.renderOrder = 8
  }
  next.add(backGlow, nextRing, halo)
  group.add(next)

  // 屋上の後光（夜、トワの後ろがうすく光る：広場から見上げたとき、夜空に黒いトワの姿が読めるように。南を向いた板）
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), additive('#b4a8ff', 0.0, softDotTexture()))
  glow.position.set(T.towa.pos.x, T.deckY + 1.2, T.towa.pos.z - 0.6)
  glow.renderOrder = 3
  group.add(glow)

  // 夜：下から照らされた白い壁（ライトアップ）。加算の縦のグラデーションを南と西の面に重ねる
  const washTex = canvasTexture(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0)
    gr.addColorStop(0, 'rgba(255,255,255,0.95)')
    gr.addColorStop(0.45, 'rgba(255,255,255,0.35)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
  })
  const washMat = additive(new THREE.Color(0.45, 0.6, 1.1), 0, washTex)
  const washH = C.y0 - 0.8
  for (const [px, pz, yaw, w] of [
    [cx, T.z1 + 0.06, 0, W],
    [T.x0 - 0.06, cz, -Math.PI / 2, D],
  ] as const) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, washH), washMat)
    m.position.set(px, 0.6 + washH / 2, pz)
    m.rotation.y = yaw
    m.renderOrder = 3
    group.add(m)
  }

  // 12 章：時計台の上の空の大きなゆらぎ（広場から見上げても分かるように、大きな白青のすじ＋紫のにじみ。いつもカメラの方を向く）
  const skySeamMat = createSeamMaterial(new THREE.Color(0.95, 1.25, 1.9), 3.0, true)
  const skySeam = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 13), skySeamMat)
  skySeam.position.copy(T.seamTop)
  skySeam.frustumCulled = false
  skySeam.renderOrder = 6
  const skyGlowMat = new THREE.SpriteMaterial({ map: softDotTexture(), color: new THREE.Color(0.55, 0.45, 1.3), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, opacity: 0 })
  const skyGlow = new THREE.Sprite(skyGlowMat)
  skyGlow.scale.set(11, 17, 1)
  skyGlow.position.copy(T.seamTop)
  skyGlow.renderOrder = 5
  skySeam.visible = skyGlow.visible = false
  group.add(skyGlow, skySeam)
  let skyK = 0

  let night = false
  let towaOnTop = false
  let flash = 0
  const glowMat = glow.material as THREE.MeshBasicMaterial
  const applyGlow = () => (glowMat.opacity = night ? (towaOnTop ? 0.6 : 0.15) : 0)
  const parts: ClockTowerParts = {
    group,
    hooks,
    setTime(h: number, m: number) {
      dialMat.uniforms.uHour.value = ((((h % 12) + 12) % 12) + m / 60) / 12 * Math.PI * 2
      dialMat.uniforms.uMin.value = ((m % 60) / 60) * Math.PI * 2
    },
    setNextHook(index: number | null) {
      const h = index === null ? undefined : T.hooks[index]
      next.visible = !!h
      if (h) next.position.copy(h.point).add(v(-0.02, 0, 0))
    },
    setTowaOnTop(on: boolean) {
      towaOnTop = on
      applyGlow()
    },
    setSkySeam(k: number) {
      skyK = k
      skySeam.visible = skyGlow.visible = k > 0.001
    },
    setFlash(k: number) {
      flash = Math.max(flash, k)
    },
    setNight(on: boolean) {
      night = on
      dialMat.uniforms.uNight.value = on ? 1 : 0
      applyGlow()
      washMat.opacity = on ? 0.55 : 0
    },
    update(dt: number) {
      flash = Math.max(0, flash - dt * 1.6)
      dialMat.uniforms.uFlash.value = flash
      const t = uTime.value
      if (skySeam.visible) {
        // ゆっくり脈打つ（ここを狙う、の合図）
        const p = 0.8 + 0.2 * Math.sin(t * 3.0)
        skySeamMat.uniforms.uK.value = skyK * p
        skyGlowMat.opacity = 0.7 * skyK * p
      }
      if (next.visible) {
        const k = (t * 0.8) % 1
        halo.scale.setScalar(1 + k * 0.8)
        haloMat.opacity = 0.8 * (1 - k) * (1 - k)
      }
    },
  }
  parts.setTime(10, 0)
  return parts
}

function mergeFaces(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let base = 0
  for (const g of list) {
    const p = g.attributes.position
    const u = g.attributes.uv
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      uv.push(u.getX(i), u.getY(i))
    }
    const ix = g.index as THREE.BufferAttribute
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base)
    base += p.count
    g.dispose()
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  out.setIndex(idx)
  out.computeVertexNormals()
  return out
}
