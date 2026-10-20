// 導入編（docs/シナリオ改訂案_導入編_v1.md の 1〜5 章）で足す会場の小物。どれも root の下に入れる（解放はシェルが行う）。
// ・中継アンテナ（北の回廊の東の端。外れた線 → F でつなぐ）・会場の大画面（ステージの上。映像信号なし → 開場）
// ・街頭ビジョン（南の入口。毎朝同じ日付とニュース）・街灯と子どもの風船（毎朝同じ時刻に同じ街灯へ引っかかる。J で引き寄せると子どもに返る）
// ・運営本部のテント（南の入口。4章①）・非常警報の柱（J で引く。4章②。つかめる対象＝pull_object として足す）
// ・記録の石標 3 本（2026年の IDO の石標の再現。QR を読む。5章）・紙吹雪（開場の歓声）
// 形は軽い（箱・円柱・板・キャンバスの文字）。毎フレームの更新は動いているものだけ。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { mulberry32 } from '../../render/noise'
import type { ClawTargetDef } from '../../player/clawLogic'
import type { MovableInput } from '../../player/clawSystem'
import type { ColliderList } from '../../world/colliders'
import { F } from './layout'
import { ROUNDED } from './textures2086'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 小物の置き場所（focusShots2086 のカメラもここを見る） */
export const INTRO_LAYOUT = {
  antenna: v(9.6, F.WALK_Y, -18.7),
  /** 会場の大画面：ステージの上の高いところ（北の回廊に立てた柱で支える）。南（広場）を向く */
  screen: v(12.5, 12.4, -16.2),
  screenYaw: 0,
  screenSize: [8.4, 4.725] as const,
  /** 街頭ビジョン：風船の街灯の北、桜の枝の外。南の入口（到着地点）の方を向く */
  street: v(-1.4, 0, 7.4),
  streetYaw: 0.36,
  lamp: v(-2.8, 0, 9.6),
  /** 風船の子ども（crowd.ts の INTRO_CROWD の balloon_child）の右手 */
  balloonStart: v(-2.3, 1.05, 11.7),
  hq: v(6.4, 0, 16.9),
  alarm: v(-3.4, 0, 15.4),
  /** 記録の石標の足元（ブースの台座の前の縁、左から 1970・2026・1726） */
  stones: {
    stone_1970: v(-8.78, F.BOOTH.h, 1.66),
    stone_2026: v(-7.41, F.BOOTH.h, 1.04),
    stone_1726: v(-6.04, F.BOOTH.h, 0.42),
  },
  /** 石標の正面（読む人が立つ側。リングの正面と同じ向き） */
  stoneFront: v(Math.sin(F.PORTAL.yaw), 0, Math.cos(F.PORTAL.yaw)),
} as const

export type StoneId = keyof typeof INTRO_LAYOUT.stones
export type IntroInteractable = { id: 'antenna' | 'hq' | StoneId; pos: THREE.Vector3; reach: number }

/** キャンバスに描いてテクスチャにする */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, aniso = 4): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  draw(g, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  return t
}

function font(weight: number, px: number): string {
  return `${weight} ${px}px ${ROUNDED}`
}

/** 疑似 QR（位置検出の 3 つの角＋ランダムな点） */
function drawQr(g: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number, ink = '#1a120a', paper = '#f3ead8'): void {
  const n = 25
  const cell = size / n
  g.fillStyle = paper
  g.fillRect(x - cell, y - cell, size + cell * 2, size + cell * 2)
  const rng = mulberry32(seed)
  g.fillStyle = ink
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (rng() < 0.46) g.fillRect(x + i * cell, y + j * cell, cell, cell)
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

const scanVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`

// ------------------------------------------------------------------ 中継アンテナ

function buildAntenna(root: THREE.Group, col: ColliderList, mats: Mats) {
  const A = INTRO_LAYOUT.antenna
  const g = new THREE.Group()
  g.name = 'relay_antenna'
  g.position.copy(A)
  root.add(g)
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.3, 0.62), mats.navy)
  base.position.y = 0.15
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 2.5, 12), mats.metal)
  mast.position.y = 1.4
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), mats.white)
  box.position.set(0, 0.95, 0.12)
  const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), mats.darkMetal)
  socket.rotation.x = Math.PI / 2
  socket.position.set(0.1, 0.86, 0.27)
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.32), mats.white)
  dish.position.set(0, 2.45, 0.05)
  dish.rotation.x = Math.PI / 2 + 0.55
  const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 6), mats.metal)
  feed.position.set(0, 2.6, 0.3)
  feed.rotation.x = 0.9
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.35, 0.3), toneMapped: false }))
  lamp.position.set(0, 2.72, 0)
  const status = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.3), toneMapped: false }))
  status.position.set(-0.05, 1.08, 0.252)
  g.add(base, mast, box, socket, dish, feed, lamp, status)
  for (const m of [base, mast, box, dish]) m.castShadow = true
  col.box(A.x, A.y + 0.5, A.z, 0.62, 1.0, 0.62)
  // 外れた線（床へ垂れている）とつないだ線
  const tube = (pts: THREE.Vector3[]) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.025, 6, false)
  const loose = tube([v(0.1, 0.86, 0.28), v(0.25, 0.6, 0.5), v(0.45, 0.06, 0.75), v(0.9, 0.03, 0.9), v(1.3, 0.03, 0.75)])
  const fixed = tube([v(0.1, 0.86, 0.28), v(0.32, 0.7, 0.42), v(0.6, 0.35, 0.3), v(0.9, 0.1, 0.0), v(1.4, 0.04, -0.3)])
  const cable = new THREE.Mesh(loose, mats.cable)
  g.add(cable)
  const plug = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), mats.darkMetal)
  plug.position.set(1.32, 0.05, 0.76)
  g.add(plug)
  // 解放用に使わない方のジオメトリもぶら下げておく（見えない）
  const spare = new THREE.Mesh(fixed, mats.cable)
  spare.visible = false
  g.add(spare)
  let isFixed = false
  return {
    group: g,
    point: A.clone().add(v(0, 1.0, 0.6)),
    setFixed(on: boolean) {
      isFixed = on
      cable.geometry = on ? fixed : loose
      spare.geometry = on ? loose : fixed
      plug.visible = !on
      const c = on ? new THREE.Color(0.4, 3, 1.2) : new THREE.Color(3, 0.35, 0.3)
      ;(lamp.material as THREE.MeshBasicMaterial).color.copy(c)
      ;(status.material as THREE.MeshBasicMaterial).color.copy(c)
    },
    update(t: number) {
      lamp.visible = isFixed || Math.sin(t * 6) > -0.2
    },
  }
}

// ------------------------------------------------------------------ 会場の大画面

const screenFrag = /* glsl */ `
uniform sampler2D mapA;
uniform sampler2D mapB;
uniform float uMix;
uniform float uTime;
uniform float uFlicker;
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  float roll = step(0.97, fract(uTime * 0.37)) * 0.02;
  uv.y = fract(uv.y + roll);
  vec3 a = texture2D(mapA, uv).rgb;
  vec3 b = texture2D(mapB, uv).rgb;
  float noise = h(floor(vUv * vec2(320.0, 180.0)) + floor(uTime * 24.0));
  a = mix(a, vec3(noise * 0.35), 0.25);
  vec3 c = mix(a, b, uMix);
  float scan = 0.88 + 0.12 * sin(vUv.y * 540.0 - uTime * 8.0);
  float fl = 1.0 - uFlicker * step(0.5, h(vec2(floor(uTime * 30.0), 1.0)));
  gl_FragColor = vec4(c * scan * fl * 1.25, 1.0);
}
`

function paintNoSignal(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#06101f'
  g.fillRect(0, 0, w, h)
  const bars = ['#5a6070', '#6a6a3a', '#3a6a6a', '#3a6a3a', '#6a3a6a', '#6a3a3a', '#3a3a6a']
  bars.forEach((c, i) => {
    g.fillStyle = c
    g.fillRect((i * w) / bars.length, h * 0.08, w / bars.length + 1, h * 0.46)
  })
  g.fillStyle = 'rgba(4,10,24,0.82)'
  g.fillRect(w * 0.18, h * 0.36, w * 0.64, h * 0.32)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#e8f2ff'
  g.font = font(800, Math.round(h * 0.1))
  g.fillText('映像信号なし', w / 2, h * 0.47)
  g.fillStyle = '#8fb8e8'
  g.font = font(800, Math.round(h * 0.055))
  g.fillText('NO SIGNAL ― 中継アンテナを確認中', w / 2, h * 0.6)
}

function paintOpen(g: CanvasRenderingContext2D, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, 0, h)
  gr.addColorStop(0, '#0b2a6a')
  gr.addColorStop(0.6, '#1f68c8')
  gr.addColorStop(1, '#ff9ccf')
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
  // 昔の町並みの影絵
  const rng = mulberry32(1970)
  g.fillStyle = 'rgba(10,20,50,0.55)'
  let x = 0
  while (x < w) {
    const bw = 40 + rng() * 80
    const bh = h * (0.12 + rng() * 0.22)
    g.beginPath()
    g.moveTo(x, h)
    g.lineTo(x, h - bh)
    g.lineTo(x + bw / 2, h - bh - bw * 0.35)
    g.lineTo(x + bw, h - bh)
    g.lineTo(x + bw, h)
    g.fill()
    x += bw + 4
  }
  // 提灯
  for (let i = 0; i < 18; i++) {
    g.fillStyle = i % 2 ? '#ff6a4a' : '#fff1c8'
    g.beginPath()
    g.ellipse(w * (0.04 + i * 0.055), h * 0.12 + Math.sin(i) * 8, 10, 14, 0, 0, Math.PI * 2)
    g.fill()
  }
  // 桜
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,190,220,${0.4 + rng() * 0.5})`
    g.beginPath()
    g.arc(rng() * w, rng() * h, 2 + rng() * 5, 0, Math.PI * 2)
    g.fill()
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.shadowColor = '#7fe8ff'
  g.shadowBlur = 30
  g.fillStyle = '#ffffff'
  g.font = font(800, Math.round(h * 0.13))
  g.fillText('IDO ― 時を旅する大阪', w / 2, h * 0.36)
  g.shadowColor = '#ffd27f'
  g.font = font(800, Math.round(h * 0.2))
  g.fillStyle = '#fff3c4'
  g.fillText('開場', w / 2, h * 0.6)
  g.shadowBlur = 0
  g.font = font(800, Math.round(h * 0.05))
  g.fillStyle = '#e8f6ff'
  g.fillText('時代博覧祭 2086　ソラの IDO 展示ブース（西）', w / 2, h * 0.8)
}

function buildBigScreen(root: THREE.Group, col: ColliderList, mats: Mats) {
  const S = INTRO_LAYOUT.screen
  const [W, H] = INTRO_LAYOUT.screenSize
  const g = new THREE.Group()
  g.name = 'big_screen'
  g.position.copy(S)
  g.rotation.y = INTRO_LAYOUT.screenYaw
  root.add(g)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, H + 0.4, 0.3), mats.navy)
  frame.position.z = -0.18
  g.add(frame)
  for (const [x, y, w, h] of [
    [0, H / 2 + 0.2, W + 0.4, 0.05],
    [0, -H / 2 - 0.2, W + 0.4, 0.05],
    [W / 2 + 0.2, 0, 0.05, H + 0.4],
    [-W / 2 - 0.2, 0, 0.05, H + 0.4],
  ] as const) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), mats.glowCyan)
    e.position.set(x, y, -0.02)
    g.add(e)
  }
  // 北の回廊に立てた 2 本の柱
  const poleH = S.y - F.WALK_Y
  for (const s of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, poleH, 12), mats.white)
    pole.position.set(s * (W / 2 - 0.9), -poleH / 2, -0.45)
    pole.castShadow = true
    g.add(pole)
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), mats.glowCyan)
    ring.position.set(s * (W / 2 - 0.9), -poleH + 0.5, -0.45)
    g.add(ring)
    col.box(S.x + s * (W / 2 - 0.9), F.WALK_Y + 1, S.z - 0.45, 0.4, 2, 0.4)
  }
  const u = {
    mapA: { value: canvasTex(1024, 576, paintNoSignal) },
    mapB: { value: canvasTex(1024, 576, paintOpen) },
    uMix: { value: 0 },
    uTime,
    uFlicker: { value: 0 },
  }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.ShaderMaterial({ vertexShader: scanVert, fragmentShader: screenFrag, uniforms: u, fog: false }))
  g.add(scr)
  let on = false
  let t = 0
  return {
    group: g,
    center: S.clone(),
    setOn(x: boolean, instant = false) {
      on = x
      t = instant ? 9 : 0
      u.uMix.value = x && instant ? 1 : 0
      u.uFlicker.value = 0
    },
    update(dt: number) {
      if (!on) return
      t += dt
      // 電源が入る：ちらついてから開場の画面へ
      u.uFlicker.value = t < 1.4 ? 0.8 : 0
      u.uMix.value = Math.min(1, Math.max(0, (t - 0.5) / 0.9))
    },
  }
}

// ------------------------------------------------------------------ 街頭ビジョン

const streetFrag = /* glsl */ `
uniform sampler2D map;
uniform float uTime;
uniform float uPulse;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(map, vUv).rgb;
  float scan = 0.9 + 0.1 * sin(vUv.y * 300.0 - uTime * 6.0);
  float live = step(0.5, fract(uTime * 1.2)) * step(0.9, vUv.x) * step(0.86, vUv.y) * step(vUv.x, 0.97) * step(vUv.y, 0.95);
  c += vec3(2.4, 0.2, 0.2) * live * uPulse;
  gl_FragColor = vec4(c * scan * (1.1 + uPulse * 0.5), 1.0);
}
`

/**
 * 街頭ビジョンの中身（物語 v7：毎朝「今日は 2086年10月18日、お祭りの一日目です」）。
 * 何も指定しなければ導入編のままの画面。loop が 2 以上なら、右上にネクマックスだけに見える青い印「◯度目の 10月18日」を重ねる。
 */
export type StreetNews = {
  /** 大きな日付の行（例：'今日は 2086年10月18日'） */
  date?: string
  /** 2 行目（例：'お祭りの一日目です'） */
  headline?: string
  /** 3 行目（天気など） */
  sub?: string
  /** 下の流れる帯 */
  ticker?: string
  /** 何度目の同じ日か（2 以上で右上に青い印） */
  loop?: number
  /** 印の日付（既定 '10月18日'） */
  loopDate?: string
}

function paintStreet(g: CanvasRenderingContext2D, w: number, h: number, n: StreetNews = {}): void {
  const gr = g.createLinearGradient(0, 0, w, h)
  gr.addColorStop(0, '#0a1f4a')
  gr.addColorStop(1, '#16367a')
  g.fillStyle = gr
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#ffffff'
  g.textBaseline = 'middle'
  g.font = font(800, 40)
  g.fillText('NANBA TOWN NEWS', 34, 46)
  g.fillStyle = '#ff5a6a'
  g.font = font(800, 30)
  g.fillText('LIVE', w - 120, 46)
  const fit = (text: string, x: number, y: number, px: number, maxW: number) => {
    let size = px
    g.font = font(800, size)
    while (g.measureText(text).width > maxW && size > 12) {
      size *= 0.94
      g.font = font(800, size)
    }
    g.fillText(text, x, y)
  }
  g.fillStyle = '#fff6d8'
  fit(n.date ?? '本日 2086年10月18日（日）', 34, 150, 74, w - 68)
  g.fillStyle = '#ffffff'
  fit(n.headline ?? '時代博覧祭 開催！', 34, 248, 62, w - 68)
  g.fillStyle = '#9fe0ff'
  fit(n.sub ?? '天気：一日中晴れ　☀　最高 24℃', 34, 336, 46, w - 68)
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.fillRect(0, h - 64, w, 64)
  g.fillStyle = '#e8f0ff'
  fit(n.ticker ?? 'ソラさんの IDO 展示「時を旅する大阪」きょうお披露目 ― 体験の列はブース西側へ', 34, h - 32, 34, w - 68)
  if ((n.loop ?? 1) >= 2) {
    // ネクマックスの石の青：画面の上に浮かぶ印（町の人には見えていない、という見せ方）
    const text = `${n.loop}度目の ${n.loopDate ?? '10月18日'}`
    g.font = font(800, 40)
    const tw = g.measureText(text).width
    const bw = tw + 64
    const bx = w - bw - 26
    const by = 84
    g.save()
    g.shadowColor = '#5fd8ff'
    g.shadowBlur = 26
    g.fillStyle = 'rgba(8, 40, 96, 0.92)'
    g.beginPath()
    g.roundRect(bx, by, bw, 64, 32)
    g.fill()
    g.lineWidth = 4
    g.strokeStyle = '#8fe6ff'
    g.stroke()
    g.restore()
    g.fillStyle = '#bff2ff'
    g.beginPath()
    g.arc(bx + 30, by + 32, 9, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.fillText(text, bx + 48, by + 34)
  }
}

function buildStreetScreen(root: THREE.Group, col: ColliderList, mats: Mats) {
  const P = INTRO_LAYOUT.street
  const g = new THREE.Group()
  g.name = 'street_vision'
  g.position.copy(P)
  g.rotation.y = INTRO_LAYOUT.streetYaw
  root.add(g)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 2.4, 12), mats.white)
  pole.position.y = 1.2
  const house = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.1, 0.28), mats.navy)
  house.position.set(0, 3.3, -0.16)
  pole.castShadow = house.castShadow = true
  const tex = canvasTex(1024, 560, (cg, w, h) => paintStreet(cg, w, h))
  const u = { map: { value: tex }, uTime, uPulse: { value: 0 } }
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.86), new THREE.ShaderMaterial({ vertexShader: scanVert, fragmentShader: streetFrag, uniforms: u, fog: false }))
  scr.position.set(0, 3.3, 0)
  const edge = new THREE.Mesh(new THREE.BoxGeometry(3.66, 0.04, 0.05), mats.glowCyan)
  edge.position.set(0, 2.24, 0)
  g.add(pole, house, scr, edge)
  col.box(P.x, 1.2, P.z, 0.32, 2.4, 0.32)
  return {
    group: g,
    center: P.clone().add(v(0, 3.3, 0)),
    pulse() {
      u.uPulse.value = 1
    },
    /** 画面の文字を描き直す（物語 v7：日付・お祭りの何日目・何度目の 10月18日）。引数なしで導入編の画面に戻す */
    setNews(n: StreetNews = {}) {
      const cv = tex.image as HTMLCanvasElement
      paintStreet(cv.getContext('2d') as CanvasRenderingContext2D, cv.width, cv.height, n)
      tex.needsUpdate = true
    },
    update(dt: number) {
      u.uPulse.value = Math.max(0, u.uPulse.value - dt * 0.12)
    },
  }
}

// ------------------------------------------------------------------ 街灯と風船

function buildLampBalloon(root: THREE.Group, col: ColliderList, mats: Mats) {
  const L = INTRO_LAYOUT.lamp
  const g = new THREE.Group()
  g.name = 'lamp_balloon'
  root.add(g)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.3, 12), mats.white)
  pole.position.set(L.x, 2.15, L.z)
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 8), mats.white)
  arm.rotation.z = Math.PI / 2
  arm.position.set(L.x + 0.42, 4.2, L.z)
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.12, 16), mats.navy)
  head.position.set(L.x + 0.82, 4.12, L.z)
  const glow = new THREE.Mesh(new THREE.CircleGeometry(0.2, 16), mats.glowWarm)
  glow.rotation.x = Math.PI / 2
  glow.position.set(L.x + 0.82, 4.055, L.z)
  pole.castShadow = true
  g.add(pole, arm, head, glow)
  col.box(L.x, 2.1, L.z, 0.24, 4.2, 0.24)
  const catchAt = v(L.x + 0.55, 4.2, L.z)
  // 風船（原点は玉の中心）
  const balloon = new THREE.Group()
  balloon.name = 'festival_balloon'
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 14), new THREE.MeshStandardMaterial({ color: '#ff6fa8', roughness: 0.25, metalness: 0.0, emissive: new THREE.Color('#ff2a7a'), emissiveIntensity: 0.25 }))
  ball.scale.set(1, 1.15, 1)
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 8), ball.material)
  knot.position.y = -0.29
  knot.rotation.x = Math.PI
  balloon.add(ball, knot)
  g.add(balloon)
  const strGeo = new THREE.BufferGeometry().setFromPoints([v(0, 0, 0), v(0, -1, 0)])
  const str = new THREE.Line(strGeo, new THREE.LineBasicMaterial({ color: '#f4f4f4' }))
  str.frustumCulled = false
  g.add(str)
  // 街灯に引っかかった風船は J で引き寄せられる（動かせる物。物理の箱は街灯の上に作られ、そこへ戻る）
  const home = catchAt.clone().add(v(0, 0.62, 0))
  balloon.position.copy(home)
  const def: ClawTargetDef = { id: 'festival_balloon', type: 'pull_object', label: '風船', point: home.clone(), radius: 0.42, enabled: false, noLineOfSight: true, range: 13 }
  const movable: MovableInput = { def, object: balloon, half: new THREE.Vector3(0.18, 0.18, 0.18), home: home.clone() }
  const start = INTRO_LAYOUT.balloonStart
  /** held：子どもが持っている／float：手を離れて街灯へ／caught：引っかかっている／claw：クローが運ぶ／back：子どもの手へ戻る */
  let mode: 'held' | 'float' | 'caught' | 'claw' | 'back' = 'held'
  let t = 0
  const p = new THREE.Vector3()
  const end = new THREE.Vector3()
  const backFrom = new THREE.Vector3()
  const pa = strGeo.attributes.position as THREE.BufferAttribute
  const inHand = (out: THREE.Vector3, T: number) => out.copy(start).add(v(Math.sin(T * 1.3) * 0.04, Math.sin(T * 1.9) * 0.03 + 0.35, 0))
  const place = () => {
    const T = uTime.value
    if (mode === 'held') {
      // 子どもが持っている（ゆれる）
      inHand(p, T)
      end.copy(start).add(v(0, -0.45, 0))
    } else if (mode === 'float') {
      // 手から離れて、ゆらゆらと街灯へ
      const k = Math.min(1, t / 3.4)
      const e = k * k * (3 - 2 * k)
      p.lerpVectors(start, catchAt, e)
      p.y += Math.sin(k * Math.PI) * 0.35 + 0.35 * (1 - e) + 0.32 * e
      p.x += Math.sin(t * 3.1) * 0.12 * (1 - e)
      end.copy(p).add(v(Math.sin(t * 4) * 0.1, -0.75, 0.05))
      if (t >= 3.4) mode = 'caught'
    } else if (mode === 'caught') {
      // 引っかかった：糸の先が腕に絡んでいる
      p.copy(catchAt).add(v(Math.sin(T * 1.7) * 0.06, 0.62 + Math.sin(T * 2.3) * 0.03, Math.cos(T * 1.3) * 0.05))
      end.copy(catchAt)
      def.point.copy(p)
    } else if (mode === 'claw') {
      // クローが動かしている（位置はそのまま。糸だけ垂らす）
      p.copy(balloon.position)
      end.copy(p).add(v(Math.sin(T * 4) * 0.06, -0.7, 0.04))
    } else {
      // 子どもの手へ、ふわっと戻る
      const k = Math.min(1, t / 0.9)
      const e = k * k * (3 - 2 * k)
      inHand(end, T)
      p.lerpVectors(backFrom, end, e)
      p.y += Math.sin(k * Math.PI) * 0.5
      end.copy(p).add(v(0, -0.7, 0))
      if (k >= 1) mode = 'held'
    }
    if (mode !== 'claw') balloon.position.copy(p)
    pa.setXYZ(0, p.x, p.y - 0.31, p.z)
    pa.setXYZ(1, end.x, end.y, end.z)
    pa.needsUpdate = true
  }
  return {
    group: g,
    def,
    movable,
    catchAt: catchAt.clone(),
    /** 目印を出す位置（風船の上） */
    get markPos(): THREE.Vector3 {
      return balloon.position
    },
    play() {
      mode = 'float'
      t = 0
    },
    /** クローが引っかけた（以後の位置はクローが決める） */
    grab() {
      mode = 'claw'
    },
    /** 子どもの手へ返す（from：いまの見た目の位置） */
    giveBack(from: THREE.Vector3) {
      backFrom.copy(from)
      mode = 'back'
      t = 0
    },
    reset() {
      mode = 'held'
      t = 0
      place()
    },
    update(dt: number) {
      t += dt
      place()
    },
  }
}

// ------------------------------------------------------------------ 運営本部のテント

function paintHq(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#1a2a6a'
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#ffffff'
  g.fillRect(8, 8, w - 16, h - 16)
  g.fillStyle = '#1a2a6a'
  g.fillRect(14, 14, w - 28, h - 28)
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = '#ffffff'
  g.font = font(800, Math.round(h * 0.42))
  g.fillText('運営本部', w / 2, h * 0.42)
  g.fillStyle = '#9fd8ff'
  g.font = font(800, Math.round(h * 0.18))
  g.fillText('FESTIVAL HQ ・ 案内', w / 2, h * 0.78)
}

function buildHq(root: THREE.Group, col: ColliderList, mats: Mats) {
  const H = INTRO_LAYOUT.hq
  const g = new THREE.Group()
  g.name = 'festival_hq'
  g.position.copy(H)
  root.add(g)
  for (const [x, z] of [
    [-1.4, -1.0],
    [1.4, -1.0],
    [-1.4, 1.0],
    [1.4, 1.0],
  ] as const) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 2.5, 8), mats.metal)
    p.position.set(x, 1.25, z)
    g.add(p)
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.12, 2.3), mats.white)
  roof.position.y = 2.55
  roof.castShadow = true
  const valance = new THREE.Mesh(new THREE.BoxGeometry(3.12, 0.3, 0.04), mats.navy)
  valance.position.set(0, 2.36, -1.15)
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.76, 0.66), mats.white)
  table.position.set(0, 0.38, 0.0)
  table.castShadow = true
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.5, 0.02), mats.navy)
  cloth.position.set(0, 0.45, -0.34)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(512, 170, paintHq), toneMapped: false }))
  // 正面（広場側＝ -Z）に向ける
  sign.position.set(0, 2.36, -1.18)
  sign.rotation.y = Math.PI
  const sign2 = sign.clone()
  sign2.position.set(0, 1.05, -0.36)
  sign2.scale.setScalar(0.62)
  g.add(roof, valance, table, cloth, sign, sign2)
  col.box(H.x, 0.38, H.z, 2.0, 0.76, 0.66)
  return { group: g, talkPoint: H.clone().add(v(0, 0, -1.2)) }
}

// ------------------------------------------------------------------ 非常警報の柱（J で引く）

function buildAlarm(root: THREE.Group, col: ColliderList, mats: Mats) {
  const P = INTRO_LAYOUT.alarm
  const g = new THREE.Group()
  g.name = 'alarm_pillar'
  g.position.copy(P)
  root.add(g)
  const red = new THREE.MeshStandardMaterial({ color: '#e0283c', roughness: 0.35, metalness: 0.1 })
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 1.7, 16), red)
  body.position.y = 0.85
  body.castShadow = true
  for (const y of [0.5, 1.45]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.215, 0.08, 16), mats.white)
    band.position.y = y
    g.add(band)
  }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.38, 0.06), new THREE.MeshStandardMaterial({ color: '#ffd23a', roughness: 0.5 }))
  panel.position.set(0, 1.2, -0.21)
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 16), mats.darkMetal)
  top.position.y = 1.76
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.12, 0.12), toneMapped: false, transparent: true, opacity: 0.85 })
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), lampMat)
  lamp.position.y = 1.82
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.2),
    new THREE.MeshBasicMaterial({
      map: canvasTex(256, 82, (c, w, h) => {
        c.fillStyle = '#b0101e'
        c.fillRect(0, 0, w, h)
        c.fillStyle = '#ffffff'
        c.textAlign = 'center'
        c.textBaseline = 'middle'
        c.font = font(800, 46)
        c.fillText('非常警報', w / 2, h / 2 + 2)
      }),
      toneMapped: false,
    }),
  )
  sign.position.set(0, 1.56, -0.25)
  sign.rotation.y = Math.PI
  g.add(body, panel, top, lamp, sign)
  col.box(P.x, 0.85, P.z, 0.44, 1.7, 0.44)
  // 引き手（つかめる対象＝動かせる物。底の中心が原点）
  const handle = new THREE.Group()
  handle.name = 'alarm_lever'
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mats.darkMetal)
  bar.position.y = 0.03
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshStandardMaterial({ color: '#202020', roughness: 0.4 }))
  knob.position.y = 0.03
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.12), mats.metal)
    arm.position.set(s * 0.09, 0.03, 0.06)
    handle.add(arm)
  }
  handle.add(bar, knob)
  const home = P.clone().add(v(0, 1.12, -0.32))
  handle.position.copy(home)
  root.add(handle)
  const def: ClawTargetDef = { id: 'alarm_lever', type: 'pull_object', label: '非常警報の柱', point: home.clone().add(v(0, 0.06, 0)), radius: 0.32, enabled: false }
  const movable: MovableInput = { def, object: handle, half: new THREE.Vector3(0.11, 0.04, 0.08), home: home.clone() }
  // 回る光（作動中）
  const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.15, 0.15), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 16, 1, true), beamMat)
  beam.rotation.z = Math.PI / 2
  beam.position.set(1.6, 0, 0)
  const spin = new THREE.Group()
  spin.position.y = 1.86
  spin.add(beam)
  g.add(spin)
  let alarmOn = false
  return {
    group: g,
    def,
    movable,
    point: home.clone(),
    setOn(on: boolean) {
      alarmOn = on
      handle.rotation.x = on ? 0.9 : 0
      beamMat.opacity = 0
      lampMat.color.setRGB(0.9, 0.12, 0.12)
    },
    update(t: number) {
      if (!alarmOn) return
      spin.rotation.y = t * 5
      const f = 0.5 + 0.5 * Math.sin(t * 12)
      beamMat.opacity = 0.35
      lampMat.color.setRGB(3 * f + 0.5, 0.25, 0.2)
    },
  }
}

// ------------------------------------------------------------------ 記録の石標（5章）

const STONE_TEXT: Record<StoneId, { era: string; title: string; seed: number }> = {
  stone_1970: { era: '1970年・大阪', title: '大阪万博', seed: 1970 },
  stone_2026: { era: '2026年・なんば', title: 'NEXMAXの最初の記録', seed: 2026 },
  stone_1726: { era: '1726年・大坂', title: '仕掛け横丁のうわさ', seed: 1726 },
}

function paintPlate(id: StoneId) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const gr = g.createLinearGradient(0, 0, w, h)
    gr.addColorStop(0, '#a8844e')
    gr.addColorStop(0.5, '#86643a')
    gr.addColorStop(1, '#5e4426')
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
    g.strokeStyle = '#3a2814'
    g.lineWidth = 8
    g.strokeRect(10, 10, w - 20, h - 20)
    const T = STONE_TEXT[id]
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#2a1a0c'
    g.font = font(800, 44)
    g.fillText('IDO　記録の石標', w / 2, 60)
    drawQr(g, w * 0.2, 100, w * 0.6, T.seed)
    g.fillStyle = '#1e1408'
    g.font = font(800, 40)
    g.fillText(T.era, w / 2, h - 108)
    g.font = font(800, T.title.length > 9 ? 34 : 40)
    g.fillText(T.title, w / 2, h - 56)
  }
}

const plateScanFrag = /* glsl */ `
uniform float uTime;
uniform float uScan;
uniform float uNear;
varying vec2 vUv;
void main() {
  float y = fract(uTime * 0.9);
  float line = smoothstep(0.03, 0.0, abs(vUv.y - y)) * uScan;
  float frame = (step(vUv.x, 0.03) + step(0.97, vUv.x) + step(vUv.y, 0.02) + step(0.98, vUv.y)) * (uNear * 0.6 + uScan);
  float glow = uScan * 0.25;
  vec3 c = vec3(0.4, 1.6, 2.6) * (line * 2.0 + min(frame, 1.0) + glow);
  float a = clamp(line + min(frame, 1.0) * 0.8 + glow, 0.0, 1.0);
  if (a < 0.01) discard;
  gl_FragColor = vec4(c, a);
}
`

function paintStoneLabel(id: StoneId) {
  return (g: CanvasRenderingContext2D, w: number, h: number) => {
    const T = STONE_TEXT[id]
    g.fillStyle = 'rgba(8,22,52,0.82)'
    g.beginPath()
    g.roundRect(4, 4, w - 8, h - 8, 18)
    g.fill()
    g.strokeStyle = id === 'stone_2026' ? '#ffd447' : '#7fe9ff'
    g.lineWidth = 5
    g.stroke()
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = '#ffffff'
    g.font = font(800, 40)
    g.fillText(T.era, w / 2, h * 0.36)
    g.fillStyle = id === 'stone_2026' ? '#ffe9a0' : '#bfefff'
    g.font = font(800, 34)
    g.fillText(T.title, w / 2, h * 0.7)
  }
}

function buildStones(root: THREE.Group, col: ColliderList) {
  const granite = new THREE.MeshStandardMaterial({ color: '#cfc8bd', roughness: 0.85, metalness: 0.0 })
  const dark = new THREE.MeshStandardMaterial({ color: '#8d877d', roughness: 0.9 })
  const front = INTRO_LAYOUT.stoneFront
  const yaw = Math.atan2(front.x, front.z)
  const out = {} as Record<StoneId, { group: THREE.Group; plate: THREE.Vector3; stand: THREE.Vector3; setScan(v: number): void; setNear(v: number): void; label: THREE.Sprite }>
  const scans: Array<{ u: { uTime: { value: number }; uScan: { value: number }; uNear: { value: number } } }> = []
  for (const id of Object.keys(INTRO_LAYOUT.stones) as StoneId[]) {
    const p = INTRO_LAYOUT.stones[id]
    const g = new THREE.Group()
    g.name = id
    g.position.copy(p)
    g.rotation.y = yaw
    root.add(g)
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.72), dark)
    base.position.y = 0.07
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.34), granite)
    body.position.set(0, 0.69, -0.04)
    body.rotation.x = -0.1
    body.castShadow = true
    base.receiveShadow = true
    const plateMat = new THREE.MeshStandardMaterial({ map: canvasTex(384, 512, paintPlate(id)), roughness: 0.45, metalness: 0.55 })
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.62), plateMat)
    plate.position.set(0, 0.78, 0.14)
    plate.rotation.x = -0.1
    const u = { uTime, uScan: { value: 0 }, uNear: { value: 0 } }
    const scan = new THREE.Mesh(
      new THREE.PlaneGeometry(0.48, 0.64),
      new THREE.ShaderMaterial({ vertexShader: scanVert, fragmentShader: plateScanFrag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
    )
    scan.position.set(0, 0.78, 0.146)
    scan.rotation.x = -0.1
    scans.push({ u })
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(512, 150, paintStoneLabel(id)), depthWrite: false, toneMapped: false }))
    label.scale.set(1.15, 0.34, 1)
    label.position.set(0, 1.62, 0)
    g.add(base, body, plate, scan, label)
    // 当たり判定（軸に沿った箱：少し大きめ）
    col.box(p.x, p.y + 0.6, p.z, 0.7, 1.2, 0.7)
    g.updateMatrixWorld(true)
    out[id] = {
      group: g,
      plate: g.localToWorld(new THREE.Vector3(0, 0.78, 0.15)),
      stand: p.clone().addScaledVector(front, 1.05).setY(0),
      setScan(x: number) {
        u.uScan.value = x
      },
      setNear(x: number) {
        u.uNear.value = x
      },
      label,
    }
  }
  return out
}

// ------------------------------------------------------------------ 紙吹雪

const confettiVert = /* glsl */ `
uniform float uTime;
uniform float uT;
uniform float uPixelRatio;
attribute vec4 aSeed;
varying vec3 vCol;
varying float vA;
void main() {
  float t = uT;
  vec3 p = position;
  p.y = position.y - t * (1.4 + aSeed.x * 1.2);
  p.x += sin(t * (1.5 + aSeed.y * 2.0) + aSeed.z * 6.28) * 0.6;
  p.z += cos(t * (1.2 + aSeed.x) + aSeed.w * 6.28) * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (3.0 + aSeed.y * 3.0) * uPixelRatio * (16.0 / max(1.0, -mv.z)) * step(0.0, p.y);
  float k = aSeed.w;
  vCol = k < 0.25 ? vec3(1.0, 0.45, 0.7) : k < 0.5 ? vec3(1.0, 0.85, 0.3) : k < 0.75 ? vec3(0.4, 0.85, 1.0) : vec3(1.0);
  vA = (1.0 - smoothstep(6.0, 8.0, t)) * step(0.001, t);
}
`
const confettiFrag = /* glsl */ `
varying vec3 vCol;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (abs(c.x) > 0.5 || abs(c.y) > 0.28) discard;
  gl_FragColor = vec4(vCol * 1.4, vA);
}
`

function buildConfetti(root: THREE.Group) {
  const N = 700
  const rng = mulberry32(99)
  const pos = new Float32Array(N * 3)
  const seed = new Float32Array(N * 4)
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -14 + rng() * 30
    pos[i * 3 + 1] = 9 + rng() * 9
    pos[i * 3 + 2] = -12 + rng() * 26
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = rng()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4))
  const u = { uTime, uT: { value: 0 }, uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } }
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: confettiVert, fragmentShader: confettiFrag, uniforms: u, transparent: true, depthWrite: false, toneMapped: false }))
  pts.frustumCulled = false
  pts.visible = false
  pts.name = 'confetti'
  root.add(pts)
  let t = -1
  return {
    play() {
      t = 0
      pts.visible = true
    },
    update(dt: number) {
      if (t < 0) return
      t += dt
      u.uT.value = t
      if (t > 8.2) {
        t = -1
        pts.visible = false
      }
    },
  }
}

// ------------------------------------------------------------------ まとめ

type Mats = {
  white: THREE.MeshStandardMaterial
  navy: THREE.MeshStandardMaterial
  metal: THREE.MeshStandardMaterial
  darkMetal: THREE.MeshStandardMaterial
  cable: THREE.MeshStandardMaterial
  glowCyan: THREE.MeshBasicMaterial
  glowWarm: THREE.MeshBasicMaterial
}

export type IntroProps = ReturnType<typeof buildIntroProps>

export function buildIntroProps(root: THREE.Group, col: ColliderList) {
  const group = new THREE.Group()
  group.name = 'intro_props'
  root.add(group)
  const mats: Mats = {
    white: new THREE.MeshStandardMaterial({ color: '#f2f4f8', roughness: 0.35, metalness: 0.05 }),
    navy: new THREE.MeshStandardMaterial({ color: '#1b2752', roughness: 0.4, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ color: '#c3cad6', roughness: 0.3, metalness: 0.85 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: '#3a4152', roughness: 0.45, metalness: 0.7 }),
    cable: new THREE.MeshStandardMaterial({ color: '#2b2f3c', roughness: 0.6 }),
    glowCyan: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.6, 3.4), toneMapped: false }),
    glowWarm: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.8), toneMapped: false }),
  }
  const antenna = buildAntenna(group, col, mats)
  const screen = buildBigScreen(group, col, mats)
  const street = buildStreetScreen(group, col, mats)
  const balloon = buildLampBalloon(group, col, mats)
  const hq = buildHq(group, col, mats)
  const alarm = buildAlarm(group, col, mats)
  const stones = buildStones(group, col)
  const confetti = buildConfetti(group)
  const interactables: IntroInteractable[] = [
    { id: 'antenna', pos: INTRO_LAYOUT.antenna.clone().add(v(0, 0, 0.9)), reach: 2.2 },
    { id: 'hq', pos: hq.talkPoint.clone(), reach: 2.0 },
    ...(Object.keys(stones) as StoneId[]).map((id) => ({ id, pos: stones[id].stand.clone(), reach: 1.25 })),
  ]
  return {
    group,
    antenna,
    screen,
    street,
    balloon,
    hq,
    alarm,
    stones,
    confetti,
    interactables,
    /** 朝に戻す（ループの朝）。antennaFixed：アンテナがつながったままにするか */
    resetMorning(antennaFixed = false) {
      antenna.setFixed(antennaFixed)
      screen.setOn(antennaFixed, true)
      balloon.reset()
      alarm.setOn(false)
      for (const id of Object.keys(stones) as StoneId[]) stones[id].setScan(0)
    },
    update(dt: number) {
      const t = uTime.value
      antenna.update(t)
      screen.update(dt)
      street.update(dt)
      balloon.update(dt)
      alarm.update(t)
      confetti.update(dt)
    },
  }
}
