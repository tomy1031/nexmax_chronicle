// 夕暮れの川向こうの空に浮かぶ、小さな黒い輪（導入編 7-5）。2086年の夜空を飲み込んだものと同じ形。
// 名前（オルム）は導入編では誰も口にしない。表示は「空の黒い輪」。
// カメラの方を向く 1 枚の板に、シェーダで黒い輪・ふちのかすかな紫の光・まわりの空のゆらぎ（ゆがみの代わりの陽炎）を描く。
// 霧の影響を受けない（遠くの空でも黒く見える）。appear() でふわっと現れ、fade(k) で薄くなる（水門を直したとき）。
import * as THREE from 'three'
import { uTime } from '../../render/materials'

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const frag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uPulse;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  // ふちがわずかに波打つ輪（ゆっくり回る）
  float wob = (noise(vec2(a * 3.0 + uTime * 0.6, uTime * 0.4)) - 0.5) * 0.05;
  float rr = r + wob;
  float ring = smoothstep(0.17, 0.0, abs(rr - 0.5));
  float core = smoothstep(0.09, 0.0, abs(rr - 0.5));
  // 内側と外側のふちの、かすかな紫と深紅の光
  float rim = smoothstep(0.12, 0.0, abs(rr - 0.66)) * 0.5 + smoothstep(0.1, 0.0, abs(rr - 0.34)) * 0.35;
  vec3 rimCol = mix(vec3(0.55, 0.12, 0.6), vec3(0.75, 0.08, 0.18), 0.5 + 0.5 * sin(a * 2.0 + uTime));
  // まわりの空のゆらぎ（陽炎のような細かい明暗の揺れ）
  float haze = smoothstep(1.0, 0.45, r) * (noise(p * 9.0 + vec2(uTime * 1.3, -uTime)) - 0.5) * 0.35;
  float alpha = max(core, ring * 0.92);
  vec3 col = vec3(0.012, 0.0, 0.03);
  col = mix(col + rimCol * rim * (0.8 + uPulse), col, core);
  float a2 = max(alpha, rim * 0.55) + abs(haze) * 0.4;
  col += vec3(haze * 0.25, haze * 0.1, haze * 0.3);
  a2 *= uOpacity * smoothstep(1.0, 0.85, r);
  if (a2 < 0.003) discard;
  gl_FragColor = vec4(col, a2);
}
`

export class BlackRing {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  private k = 0
  private want = 0
  private fadeK = 1

  /** pos：空の位置、size：板の大きさ（m） */
  constructor(pos: THREE.Vector3, size: number) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime, uOpacity: { value: 0 }, uPulse: { value: 0 } },
      transparent: true,
      depthWrite: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat)
    this.mesh.position.copy(pos)
    this.mesh.renderOrder = 2
    this.mesh.visible = false
    this.mesh.frustumCulled = false
    this.mesh.name = 'black_ring'
  }

  get position(): THREE.Vector3 {
    return this.mesh.position
  }

  /** 現れる（instant なら最初から出ている） */
  appear(instant = false): void {
    this.want = 1
    this.fadeK = 1
    if (instant) this.k = 1
    this.mesh.visible = true
  }

  /** 薄くなる（0 = 消える、1 = 元のまま） */
  fade(to: number): void {
    this.fadeK = to
  }

  hide(): void {
    this.want = 0
    this.k = 0
    this.mesh.visible = false
  }

  update(dt: number, camera: THREE.Camera, t: number): void {
    if (!this.mesh.visible) return
    this.k += (this.want - this.k) * Math.min(1, dt * 0.9)
    this.mesh.quaternion.copy(camera.quaternion)
    const op = this.k * this.fadeK
    this.mat.uniforms.uOpacity.value += (op - this.mat.uniforms.uOpacity.value) * Math.min(1, dt * 1.5)
    this.mat.uniforms.uPulse.value = 0.5 + 0.5 * Math.sin(t * 1.7)
    const s = 0.6 + 0.4 * this.k
    this.mesh.scale.setScalar(s)
    if (this.fadeK <= 0.001 && this.mat.uniforms.uOpacity.value < 0.004) this.mesh.visible = false
  }
}

/**
 * 2086年の夜空が一瞬重なる演出（全画面のキャンバス。紫と深紅の空・空のひび・大きな黒い輪・ほどけていく街の影）。
 * play() で 2 回瞬いて消える。#ui の下層に置く（HUD の会話は上に出る）
 */
export class RingFlash {
  private readonly el: HTMLCanvasElement
  private t = -1

  constructor(host: HTMLElement | null) {
    const c = document.createElement('canvas')
    c.width = 640
    c.height = 360
    c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;opacity:0;filter:blur(0.6px) saturate(1.2)'
    this.el = c
    this.paint()
    host?.insertBefore(c, host.firstChild)
  }

  private paint(): void {
    const g = this.el.getContext('2d') as CanvasRenderingContext2D
    const W = 640
    const H = 360
    const sky = g.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#12021e')
    sky.addColorStop(0.5, '#4a0a3a')
    sky.addColorStop(0.85, '#8a1424')
    sky.addColorStop(1, '#2a0610')
    g.fillStyle = sky
    g.fillRect(0, 0, W, H)
    // 空のひび（光の筋）
    g.strokeStyle = 'rgba(255,220,255,0.9)'
    g.lineWidth = 2
    g.shadowColor = '#ff8aff'
    g.shadowBlur = 12
    g.beginPath()
    let x = 120
    let y = 40
    g.moveTo(x, y)
    for (let i = 0; i < 9; i++) {
      x += 30 + ((i * 37) % 23)
      y += ((i * 53) % 31) - 12
      g.lineTo(x, y)
    }
    g.stroke()
    g.shadowBlur = 0
    // 大きな黒い輪
    // 本物の黒い輪（カメラの演出で画面の中ほど）に重なる位置
    const cx = W * 0.5
    const cy = H * 0.4
    g.lineWidth = 46
    g.strokeStyle = '#050008'
    g.beginPath()
    g.arc(cx, cy, 110, 0, Math.PI * 2)
    g.stroke()
    g.lineWidth = 6
    g.strokeStyle = 'rgba(200,60,200,0.55)'
    g.beginPath()
    g.arc(cx, cy, 136, 0, Math.PI * 2)
    g.stroke()
    // ほどけていく街の影
    g.fillStyle = '#0a0410'
    for (let i = 0; i < 22; i++) {
      const bx = i * 30
      const bh = 40 + ((i * 47) % 70)
      g.globalAlpha = 0.9 - ((i * 13) % 5) * 0.12
      g.fillRect(bx, H - bh, 24, bh)
    }
    g.globalAlpha = 1
  }

  play(): void {
    this.t = 0
  }

  update(dt: number): void {
    if (this.t < 0) return
    this.t += dt
    const t = this.t
    // 2 回の瞬き：0〜0.45 秒と 0.6〜1.3 秒
    let o = 0
    if (t < 0.45) o = Math.sin((t / 0.45) * Math.PI) * 0.85
    else if (t > 0.6 && t < 1.3) o = Math.sin(((t - 0.6) / 0.7) * Math.PI) * 0.6
    else if (t >= 1.3) this.t = -1
    this.el.style.opacity = o.toFixed(3)
  }

  dispose(): void {
    this.el.remove()
  }
}
