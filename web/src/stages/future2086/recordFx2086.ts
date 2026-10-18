// 展示のリングに映す「記録」（導入編 1-2・1-4・5章）と、QR を読む光、リングにはめた共鳴レンズ、受け止める腕。
// ・RingRecord：リングの前に重ねる円の板のシェーダ。体験中の客が見ている昔の町（道頓堀）をうっすら映し、
//   レンズが無いあいだは揺らぐ（setWobble）。QR を読むと、その時代の町がブロック状に組み上がる（show）。
//   絵は public/textures/story/*.webp（リードが用意。無ければキャンバスで描いた仮の絵のまま）。
// ・ScanBeam：ネクマックスの目から石標の板へ伸びる読み取りの光。
// ・LensMount：リングの上にはまった共鳴レンズ（はめた瞬間に光る）。
// ・ArmCatch：外れた腕のパーツが跳ねて、手で受け止められる（3章）。
import * as THREE from 'three'
import { uTime } from '../../render/materials'
import { mulberry32 } from '../../render/noise'
import { F } from './layout'
import { ROUNDED } from './textures2086'

export type RecordKind = 'dotonbori' | 'expo1970' | 'edo1726' | 'namba2026'

/** リードが用意する絵（無くても動く） */
export const RECORD_IMAGES: Partial<Record<RecordKind, string>> = {
  expo1970: './textures/story/ido_1970_expo.webp',
  edo1726: './textures/story/ido_1726_rumor.webp',
  namba2026: './textures/story/ido_2026_namba.webp',
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ 仮の絵（キャンバス）

function canvas(n: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = c.height = n
  return [c, c.getContext('2d') as CanvasRenderingContext2D]
}

function sky(g: CanvasRenderingContext2D, n: number, top: string, mid: string, bottom: string): void {
  const gr = g.createLinearGradient(0, 0, 0, n)
  gr.addColorStop(0, top)
  gr.addColorStop(0.6, mid)
  gr.addColorStop(1, bottom)
  g.fillStyle = gr
  g.fillRect(0, 0, n, n)
}

function paintDotonbori(g: CanvasRenderingContext2D, n: number): void {
  sky(g, n, '#0a1e48', '#2a5aa8', '#f0b070')
  const rng = mulberry32(7)
  // 川（下の帯）と、両岸の芝居小屋・茶屋
  g.fillStyle = '#16305e'
  g.fillRect(0, n * 0.72, n, n * 0.28)
  for (let side = 0; side < 2; side++) {
    let x = side ? n * 0.55 : 0
    const end = side ? n : n * 0.45
    while (x < end) {
      const w = 40 + rng() * 50
      const h = n * (0.14 + rng() * 0.12)
      const y = n * 0.72
      g.fillStyle = '#3a2a1e'
      g.fillRect(x, y - h, w, h)
      g.fillStyle = '#1e1410'
      g.beginPath()
      g.moveTo(x - 6, y - h)
      g.lineTo(x + w / 2, y - h - 22)
      g.lineTo(x + w + 6, y - h)
      g.fill()
      // 提灯の列
      for (let i = 0; i < 3; i++) {
        g.fillStyle = rng() < 0.5 ? '#ff7a4a' : '#ffe2a0'
        g.beginPath()
        g.ellipse(x + 10 + i * (w / 3), y - h * 0.55, 5, 8, 0, 0, Math.PI * 2)
        g.fill()
      }
      x += w + 6
    }
  }
  // 川面の映り込み
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,${180 + rng() * 60},120,${0.2 + rng() * 0.3})`
    g.fillRect(rng() * n, n * (0.74 + rng() * 0.24), 10 + rng() * 30, 2)
  }
  label(g, n, '昔の道頓堀')
}

function paintExpo(g: CanvasRenderingContext2D, n: number): void {
  sky(g, n, '#2a6ad8', '#8fd0ff', '#f6f2d8')
  // 太陽の塔
  const cx = n / 2
  g.fillStyle = '#f4f0e6'
  g.beginPath()
  g.moveTo(cx - 70, n * 0.82)
  g.quadraticCurveTo(cx - 40, n * 0.3, cx, n * 0.22)
  g.quadraticCurveTo(cx + 40, n * 0.3, cx + 70, n * 0.82)
  g.fill()
  g.fillStyle = '#c8402a'
  g.beginPath()
  g.moveTo(cx - 60, n * 0.6)
  g.lineTo(cx - 150, n * 0.52)
  g.lineTo(cx - 62, n * 0.5)
  g.moveTo(cx + 60, n * 0.6)
  g.lineTo(cx + 150, n * 0.52)
  g.lineTo(cx + 62, n * 0.5)
  g.fill()
  g.fillStyle = '#e8b830'
  g.beginPath()
  g.arc(cx, n * 0.3, 22, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#1a1a1a'
  g.fillRect(cx - 14, n * 0.29, 8, 4)
  g.fillRect(cx + 6, n * 0.29, 8, 4)
  // 人の波
  const rng = mulberry32(70)
  for (let i = 0; i < 900; i++) {
    const y = n * (0.78 + rng() * 0.22)
    g.fillStyle = ['#2a2a3a', '#d84a4a', '#f2f2f2', '#3a6ad8', '#e8c040'][Math.floor(rng() * 5)]
    g.beginPath()
    g.arc(rng() * n, y, 2 + (y / n) * 3, 0, Math.PI * 2)
    g.fill()
  }
  label(g, n, '1970年・大阪万博')
}

function paintEdo(g: CanvasRenderingContext2D, n: number): void {
  sky(g, n, '#1a1030', '#6a4a8a', '#f0a868')
  const rng = mulberry32(17)
  g.fillStyle = '#2a3a6a'
  g.fillRect(0, n * 0.7, n, n * 0.3)
  let x = 0
  while (x < n) {
    const w = 50 + rng() * 40
    const h = n * (0.12 + rng() * 0.08)
    g.fillStyle = '#2a1c14'
    g.fillRect(x, n * 0.7 - h, w, h)
    g.fillStyle = '#140c08'
    g.beginPath()
    g.moveTo(x - 8, n * 0.7 - h)
    g.lineTo(x + w / 2, n * 0.7 - h - 26)
    g.lineTo(x + w + 8, n * 0.7 - h)
    g.fill()
    g.fillStyle = 'rgba(255,200,120,0.8)'
    g.fillRect(x + w * 0.3, n * 0.7 - h * 0.6, w * 0.4, h * 0.3)
    x += w + 4
  }
  // 水車
  g.strokeStyle = '#1a120c'
  g.lineWidth = 6
  g.beginPath()
  g.arc(n * 0.78, n * 0.66, 44, 0, Math.PI * 2)
  g.stroke()
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    g.beginPath()
    g.moveTo(n * 0.78, n * 0.66)
    g.lineTo(n * 0.78 + Math.cos(a) * 44, n * 0.66 + Math.sin(a) * 44)
    g.stroke()
  }
  // からくり人形の影（茶運び）
  g.fillStyle = '#0c0806'
  g.beginPath()
  g.arc(n * 0.32, n * 0.6, 14, 0, Math.PI * 2)
  g.fill()
  g.fillRect(n * 0.3, n * 0.62, 20, 34)
  g.fillRect(n * 0.27, n * 0.6, 44, 6)
  label(g, n, '1726年・仕掛け横丁')
}

function paintNamba(g: CanvasRenderingContext2D, n: number): void {
  sky(g, n, '#1a2048', '#ff8a5a', '#ffd0a0')
  const rng = mulberry32(2026)
  let x = 0
  while (x < n) {
    const w = 40 + rng() * 60
    const h = n * (0.3 + rng() * 0.35)
    g.fillStyle = '#1c2238'
    g.fillRect(x, n - h, w, h)
    for (let yy = n - h + 10; yy < n - 10; yy += 14)
      for (let xx = x + 6; xx < x + w - 6; xx += 12) {
        if (rng() < 0.55) {
          g.fillStyle = rng() < 0.8 ? '#ffe2a0' : '#9fe0ff'
          g.fillRect(xx, yy, 6, 7)
        }
      }
    x += w + 3
  }
  // 看板のネオン
  for (let i = 0; i < 10; i++) {
    g.fillStyle = ['#ff4a8a', '#4ae0ff', '#ffd040'][i % 3]
    g.fillRect(rng() * n, n * (0.5 + rng() * 0.35), 30 + rng() * 40, 12)
  }
  g.fillStyle = 'rgba(40,160,255,0.35)'
  g.fillRect(0, n * 0.9, n, n * 0.1)
  label(g, n, '2026年・なんば')
}

function label(g: CanvasRenderingContext2D, n: number, text: string): void {
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.font = `800 ${Math.round(n * 0.06)}px ${ROUNDED}`
  g.fillStyle = 'rgba(4,12,32,0.6)'
  g.fillRect(n * 0.22, n * 0.1, n * 0.56, n * 0.1)
  g.fillStyle = '#ffffff'
  g.fillText(text, n / 2, n * 0.15)
}

const PAINTERS: Record<RecordKind, (g: CanvasRenderingContext2D, n: number) => void> = {
  dotonbori: paintDotonbori,
  expo1970: paintExpo,
  edo1726: paintEdo,
  namba2026: paintNamba,
}

function recordTexture(kind: RecordKind): THREE.Texture {
  const [c, g] = canvas(512)
  PAINTERS[kind](g, 512)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// ------------------------------------------------------------------ リングの記録

const ringVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const ringFrag = /* glsl */ `
uniform sampler2D map;
uniform vec4 uCrop;
uniform float uTime;
uniform float uReveal;
uniform float uWobble;
uniform float uAlpha;
uniform float uRift;
varying vec2 vUv;
float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  vec2 uv = vUv;
  // 揺らぎ（レンズが無い）：波打ちと、ときどき横にずれる帯
  float band = step(0.82, fract(uTime * 1.3 + floor(uv.y * 14.0) * 0.37)) * (h21(vec2(floor(uTime * 10.0), floor(uv.y * 14.0))) - 0.5);
  uv.x += (sin(uv.y * 28.0 + uTime * 7.0) * 0.012 + band * 0.06) * uWobble;
  uv.y += sin(uv.x * 22.0 + uTime * 5.0) * 0.008 * uWobble;
  // 裂け目：中心へ渦を巻く
  float sw = uRift * (1.2 - r) * 4.0 + uRift * uTime * 1.2;
  vec2 q = vec2(cos(sw) * p.x - sin(sw) * p.y, sin(sw) * p.x + cos(sw) * p.y);
  uv = mix(uv, q * 0.5 + 0.5, uRift);
  vec2 tuv = uv * uCrop.xy + uCrop.zw;
  vec3 c;
  c.r = texture2D(map, tuv + vec2(0.006, 0.0) * uWobble).r;
  c.g = texture2D(map, tuv).g;
  c.b = texture2D(map, tuv - vec2(0.006, 0.0) * uWobble).b;
  // 組み上がり：ブロックごとに下から
  vec2 cell = floor(vUv * 22.0);
  float order = h21(cell) * 0.55 + (1.0 - vUv.y) * 0.45;
  float shown = step(order, uReveal * 1.08);
  float front = smoothstep(0.06, 0.0, abs(order - uReveal * 1.08)) * step(uReveal, 0.999);
  float scan = 0.86 + 0.14 * sin(vUv.y * 360.0 - uTime * 7.0);
  vec3 col = c * scan * 1.45;
  col += vec3(0.35, 0.95, 1.7) * front * 1.6;
  col += vec3(0.25, 0.8, 1.6) * smoothstep(0.86, 1.0, r) * 0.9;
  col = mix(col, vec3(0.8, 0.9, 1.6) * (1.0 - r) * 2.4, uRift * 0.6);
  float a = uAlpha * max(shown, front * 0.9) * (1.0 - 0.15 * uWobble * h21(vec2(floor(uTime * 20.0), 3.0)));
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`

export class RingRecord {
  readonly mesh: THREE.Mesh
  private readonly u: {
    map: { value: THREE.Texture }
    uCrop: { value: THREE.Vector4 }
    uTime: { value: number }
    uReveal: { value: number }
    uWobble: { value: number }
    uAlpha: { value: number }
    uRift: { value: number }
  }
  private readonly tex: Partial<Record<RecordKind, THREE.Texture>> = {}
  private readonly crop: Partial<Record<RecordKind, THREE.Vector4>> = {}
  private kind: RecordKind = 'dotonbori'
  private reveal = 1
  private revealTarget = 1
  private revealSpeed = 0.5
  private alpha = 0
  private alphaTarget = 0
  private wobble = 1
  private wobbleTarget = 1
  private readonly owned: THREE.Texture[] = []

  constructor(parent: THREE.Object3D) {
    const P = F.PORTAL
    this.u = {
      map: { value: this.texture('dotonbori') },
      uCrop: { value: new THREE.Vector4(1, 1, 0, 0) },
      uTime,
      uReveal: { value: 1 },
      uWobble: { value: 1 },
      uAlpha: { value: 0 },
      uRift: { value: 0 },
    }
    this.mesh = new THREE.Mesh(
      new THREE.CircleGeometry(P.r + 0.005, 72),
      new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: ringFrag, uniforms: this.u, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    )
    this.mesh.name = 'ring_record'
    this.mesh.position.set(P.x, P.y, P.z).add(v(Math.sin(P.yaw), 0, Math.cos(P.yaw)).multiplyScalar(0.03))
    this.mesh.rotation.y = P.yaw
    this.mesh.renderOrder = 5
    parent.add(this.mesh)
    // リードの絵を非同期で読む（無ければ仮の絵のまま）
    for (const k of Object.keys(RECORD_IMAGES) as RecordKind[]) {
      const url = RECORD_IMAGES[k]!
      new THREE.TextureLoader().load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace
          const img = t.image as { width: number; height: number }
          // 正方形へ中央で切り抜く（円に映すので）
          const w = img.width || 1
          const h = img.height || 1
          const crop = w >= h ? new THREE.Vector4(h / w, 1, (1 - h / w) / 2, 0) : new THREE.Vector4(1, w / h, 0, (1 - w / h) / 2)
          this.owned.push(t)
          this.tex[k] = t
          this.crop[k] = crop
          if (this.kind === k) {
            this.u.map.value = t
            this.u.uCrop.value.copy(crop)
          }
        },
        undefined,
        () => {
          /* 無ければ仮の絵 */
        },
      )
    }
  }

  private texture(kind: RecordKind): THREE.Texture {
    let t = this.tex[kind]
    if (!t) {
      t = recordTexture(kind)
      this.tex[kind] = t
      this.owned.push(t)
    }
    return t
  }

  /** 体験中の客が見ている昔の町（うっすら） */
  showVisitor(): void {
    this.setKind('dotonbori')
    this.reveal = this.revealTarget = 1
    this.alphaTarget = 0.62
  }

  /** 記録を組み上げる（seconds で 0 → 1） */
  show(kind: RecordKind, seconds = 2.4): void {
    this.setKind(kind)
    this.reveal = 0
    this.revealTarget = 1
    this.revealSpeed = 1 / Math.max(0.2, seconds)
    this.alphaTarget = 1
    this.alpha = 1
  }

  hide(): void {
    this.alphaTarget = 0
  }

  setWobble(x: number): void {
    this.wobbleTarget = x
  }

  setRift(x: number): void {
    this.u.uRift.value = x
  }

  get revealed(): number {
    return this.reveal
  }

  private setKind(kind: RecordKind): void {
    this.kind = kind
    this.u.map.value = this.texture(kind)
    this.u.uCrop.value.copy(this.crop[kind] ?? new THREE.Vector4(1, 1, 0, 0))
  }

  update(dt: number): void {
    this.reveal = Math.min(this.revealTarget, this.reveal + dt * this.revealSpeed)
    this.alpha += (this.alphaTarget - this.alpha) * Math.min(1, dt * 3)
    this.wobble += (this.wobbleTarget - this.wobble) * Math.min(1, dt * 2.5)
    this.u.uReveal.value = this.reveal
    this.u.uAlpha.value = this.alpha
    this.u.uWobble.value = this.wobble
    this.mesh.visible = this.alpha > 0.004
  }

  dispose(): void {
    for (const t of this.owned) t.dispose()
  }
}

// ------------------------------------------------------------------ 読み取りの光

export class ScanBeam {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.MeshBasicMaterial
  private readonly a = new THREE.Vector3()
  private readonly b = new THREE.Vector3()
  private strength = 0

  constructor(parent: THREE.Object3D) {
    const g = new THREE.CylinderGeometry(0.012, 0.03, 1, 8, 1, true)
    g.translate(0, 0.5, 0)
    g.rotateX(Math.PI / 2)
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 3.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    this.mesh = new THREE.Mesh(g, this.mat)
    this.mesh.frustumCulled = false
    this.mesh.visible = false
    this.mesh.renderOrder = 6
    parent.add(this.mesh)
  }

  /** from（目）→ to（板）。strength 0 で消える */
  set(from: THREE.Vector3, to: THREE.Vector3, strength: number): void {
    this.a.copy(from)
    this.b.copy(to)
    this.strength = strength
    this.mesh.visible = strength > 0.01
    if (!this.mesh.visible) return
    this.mesh.position.copy(this.a)
    this.mesh.lookAt(this.b)
    const len = this.a.distanceTo(this.b)
    const flick = 0.75 + 0.25 * Math.sin(uTime.value * 40)
    this.mesh.scale.set(1 + Math.sin(uTime.value * 18) * 0.3, 1, len)
    this.mat.opacity = this.strength * flick
  }
}

// ------------------------------------------------------------------ リングにはめた共鳴レンズ

export class LensMount {
  readonly group = new THREE.Group()
  private readonly glow: THREE.MeshBasicMaterial
  private flash = 0

  constructor(parent: THREE.Object3D) {
    const P = F.PORTAL
    const n = v(Math.sin(P.yaw), 0, Math.cos(P.yaw))
    this.group.name = 'lens_mount'
    this.group.position.set(P.x, P.y + P.r + 0.68, P.z).addScaledVector(n, 0.05)
    this.group.rotation.y = P.yaw
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 8, 24), new THREE.MeshStandardMaterial({ color: '#c8d0dc', metalness: 0.85, roughness: 0.25 }))
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.26), new THREE.MeshStandardMaterial({ color: '#f2f4f8', roughness: 0.35 }))
    seat.position.set(0, -0.2, -0.05)
    this.group.add(seat)
    this.glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 3.2), toneMapped: false, transparent: true, opacity: 0.95 })
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.glow)
    dome.rotation.x = Math.PI / 2
    this.group.add(ring, dome)
    this.group.visible = false
    parent.add(this.group)
  }

  set(on: boolean, flash = false): void {
    this.group.visible = on
    if (flash) this.flash = 1.6
  }

  update(dt: number): void {
    if (!this.group.visible) return
    this.flash = Math.max(0, this.flash - dt)
    const k = 1 + this.flash * 2.5 + Math.sin(uTime.value * 3) * 0.1
    this.glow.color.setRGB(0.5 * k, 2.4 * k, 3.2 * k)
    this.group.scale.setScalar(1 + this.flash * 0.25)
  }
}

// ------------------------------------------------------------------ 受け止める腕（3章）

export class ArmCatch {
  readonly group = new THREE.Group()
  private t = -1
  private readonly from = new THREE.Vector3()
  private readonly hand = new THREE.Vector3()

  constructor(parent: THREE.Object3D) {
    const mat = new THREE.MeshStandardMaterial({ color: '#6fb4ec', roughness: 0.55 })
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05 - i * 0.006, 14, 10), mat)
      s.position.x = -0.12 + i * 0.09
      this.group.add(s)
    }
    const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 10), mat)
    cap.rotation.z = Math.PI / 2
    cap.position.x = 0.12
    this.group.add(cap)
    this.group.visible = false
    this.group.name = 'arm_catch'
    parent.add(this.group)
  }

  /** shoulder から跳ねて、hand（毎フレーム更新）で受け止める */
  play(shoulder: THREE.Vector3): void {
    this.from.copy(shoulder)
    this.t = 0
    this.group.visible = true
  }

  update(dt: number, hand: THREE.Vector3): void {
    if (this.t < 0) return
    this.t += dt
    this.hand.copy(hand)
    const t = this.t
    if (t < 0.55) {
      // 外れて跳ねる
      const k = t / 0.55
      this.group.position.copy(this.from).lerp(this.hand, k * 0.5)
      this.group.position.y += Math.sin(k * Math.PI) * 0.35
      this.group.rotation.z += dt * 14
    } else if (t < 0.8) {
      // 手に収まる
      const k = (t - 0.55) / 0.25
      this.group.position.lerp(this.hand, k)
      this.group.rotation.z *= 0.8
    } else {
      this.group.position.copy(this.hand)
    }
    if (t > 2.6) {
      this.t = -1
      this.group.visible = false
    }
  }
}
