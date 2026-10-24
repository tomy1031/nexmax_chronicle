// かんばんの光がゆがむ演出（物語 v7 の 6 章）：立てたばかりのIDOのかんばん（石標 A）の板の前で、光が波打ってゆがみ、
// その中からネクマックスが出てくる。もう一度ゆがむと、こんどは黒い影の獣がとび出してくる（dark）。
// ・縦長のゆがみ（同心の波・ねじれ・まん中の光。dark では黒い芯とむらさきのふち）を板の前に立てる（カメラのほうへ向く）
// ・足元に広がる光の輪、まっすぐ立つ光の柱、らせんに舞う光のつぶ
// ・石標の板の光（IdoMarker.setSurge）と足元の輪（setNear）も一緒に動かす
// 使い方：const s = new KanbanSurge(marker); root.add(s.group); s.surge({ sec: 2.4 }); 毎フレーム s.update(dt, t, camera)
import * as THREE from 'three'
import type { IdoMarker } from '../ido'

const warpVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const warpFrag = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uDark;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(1.0, 1.25);
  float ang = atan(p.y, p.x);
  float r = length(p);
  // ねじれと波（ゆがみ）
  float wob = noise(vec2(ang * 2.0 + uTime * 0.7, r * 6.0 - uTime * 1.3)) - 0.5;
  float rr = r + wob * 0.06 * uLevel;
  float rings = 0.5 + 0.5 * sin(rr * 46.0 - uTime * 9.0 + ang * 2.0);
  float size = 0.12 + 0.36 * uLevel;
  float body = smoothstep(size, size * 0.55, rr);
  float edge = exp(-pow((rr - size * 0.92) / (0.035 + 0.02 * uLevel), 2.0));
  float core = exp(-rr * rr / (0.004 + 0.02 * uLevel));
  vec3 cyan = vec3(0.55, 1.6, 2.3);
  vec3 gold = vec3(2.4, 1.7, 0.7);
  vec3 violet = vec3(1.5, 0.35, 2.4);
  vec3 col = mix(cyan, gold, 0.5 + 0.5 * sin(ang * 3.0 + uTime * 2.0)) * (0.35 * rings * body + 1.2 * edge) + vec3(2.6, 2.4, 2.0) * core;
  float a = clamp(0.55 * rings * body + edge + core, 0.0, 1.0);
  // dark：黒い芯とむらさきのふち
  vec3 dcol = mix(vec3(0.02, 0.0, 0.05), violet * (0.6 + 0.4 * rings), smoothstep(size * 0.35, size, rr)) + violet * edge * 1.3;
  float da = clamp(body * 0.92 + edge, 0.0, 1.0);
  col = mix(col, dcol, uDark);
  a = mix(a, da, uDark) * smoothstep(0.0, 0.08, uLevel);
  // 端はゆらぐ光の糸
  float strands = smoothstep(0.75, 1.0, noise(vec2(ang * 8.0, uTime * 2.0))) * smoothstep(size * 1.6, size, r) * smoothstep(size * 0.8, size, r);
  col += mix(cyan, violet, uDark) * strands * 1.5 * uLevel;
  a = max(a, strands * uLevel * 0.8);
  gl_FragColor = vec4(col, a);
}
`

/** 柱・輪で使う、上下（または内外）にやわらかく消える光のテクスチャ */
function fadeTexture(radial: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const g = c.getContext('2d') as CanvasRenderingContext2D
  if (radial) {
    const gr = g.createRadialGradient(32, 32, 10, 32, 32, 32)
    gr.addColorStop(0, 'rgba(255,255,255,0)')
    gr.addColorStop(0.7, 'rgba(255,255,255,1)')
    gr.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = gr
  } else {
    const gr = g.createLinearGradient(0, 0, 0, 64)
    gr.addColorStop(0, 'rgba(255,255,255,0)')
    gr.addColorStop(0.35, 'rgba(255,255,255,0.9)')
    gr.addColorStop(1, 'rgba(255,255,255,0.2)')
    g.fillStyle = gr
  }
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export class KanbanSurge {
  readonly group = new THREE.Group()
  /** ゆがみの中心（ワールド。ネクマックス・獣が出てくる位置） */
  readonly center = new THREE.Vector3()
  private readonly marker: IdoMarker | null
  private readonly warp: THREE.Mesh
  private readonly warpU: { uTime: { value: number }; uLevel: { value: number }; uDark: { value: number } }
  private readonly pillar: THREE.Mesh
  private readonly ring: THREE.Mesh
  private readonly sparks: THREE.Points
  private readonly sparkSeed: Float32Array
  private level = 0
  private target = 0
  private dark = 0
  private darkTarget = 0
  private pulseT = -1
  private pulseSec = 2.4
  private ringT = -1

  constructor(marker: IdoMarker | null, at?: { plate: THREE.Vector3; front: THREE.Vector3 }) {
    this.marker = marker
    const plate = marker?.plate ?? at?.plate ?? new THREE.Vector3()
    const front = marker?.front ?? at?.front ?? new THREE.Vector3(0, 0, 1)
    this.group.name = 'kanban_surge'
    this.center.copy(plate).addScaledVector(front, 0.75).setY(1.0)
    this.warpU = { uTime: { value: 0 }, uLevel: { value: 0 }, uDark: { value: 0 } }
    const warpMat = new THREE.ShaderMaterial({ uniforms: this.warpU, vertexShader: warpVert, fragmentShader: warpFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    this.warp = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.6), warpMat)
    this.warp.position.copy(this.center)
    this.warp.renderOrder = 8
    this.warp.visible = false
    this.group.add(this.warp)
    // 光の柱
    const pillarMat = new THREE.MeshBasicMaterial({ map: fadeTexture(false), color: new THREE.Color(0.5, 1.4, 2.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 6, 24, 1, true), pillarMat)
    this.pillar.position.copy(this.center).setY(3.0)
    this.pillar.visible = false
    this.group.add(this.pillar)
    // 足元の輪
    const ringMat = new THREE.MeshBasicMaterial({ map: fadeTexture(true), color: new THREE.Color(0.6, 1.5, 2.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ringMat)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.copy(this.center).setY(0.04)
    this.ring.visible = false
    this.group.add(this.ring)
    // 光のつぶ（らせん）
    const n = 48
    const pos = new Float32Array(n * 3)
    this.sparkSeed = new Float32Array(n)
    for (let i = 0; i < n; i++) this.sparkSeed[i] = Math.random()
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const sparkMat = new THREE.PointsMaterial({ map: fadeTexture(true), color: new THREE.Color(1.6, 1.8, 2.2), size: 0.14, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    this.sparks = new THREE.Points(g, sparkMat)
    this.sparks.frustumCulled = false
    this.sparks.visible = false
    this.group.add(this.sparks)
  }

  get value(): number {
    return this.level
  }

  /** 1 回ゆがむ（ふくらんで、しぼむ）。dark で影の獣のゆがみ */
  surge(opts: { strength?: number; sec?: number; dark?: boolean } = {}): void {
    this.pulseT = 0
    this.pulseSec = opts.sec ?? 2.4
    this.target = opts.strength ?? 1
    this.darkTarget = opts.dark ? 1 : 0
    this.ringT = 0
  }

  /** ずっと続く強さ（0〜1）。surge の途中で呼ぶと、そちらが優先 */
  setLevel(k: number, dark = false): void {
    this.pulseT = -1
    this.target = Math.max(0, Math.min(1, k))
    this.darkTarget = dark ? 1 : 0
    if (k > 0.05 && this.ringT < 0) this.ringT = 0
  }

  update(dt: number, t: number, camera?: THREE.Camera): void {
    // 1 回のゆがみ：最初の 25% でふくらみ、残りでしぼむ
    let want = this.target
    if (this.pulseT >= 0) {
      this.pulseT += dt
      const k = this.pulseT / this.pulseSec
      want = this.target * (k < 0.25 ? Math.sin((k / 0.25) * Math.PI * 0.5) : Math.max(0, 1 - (k - 0.25) / 0.75) ** 1.5)
      if (k >= 1) {
        this.pulseT = -1
        this.target = 0
        want = 0
      }
    }
    this.level += (want - this.level) * Math.min(1, dt * (want > this.level ? 10 : 4))
    this.dark += (this.darkTarget - this.dark) * Math.min(1, dt * 6)
    const L = this.level
    const on = L > 0.005
    this.warp.visible = on
    this.pillar.visible = on
    this.sparks.visible = on
    this.warpU.uTime.value = t
    this.warpU.uLevel.value = L
    this.warpU.uDark.value = this.dark
    if (on && camera) {
      // 縦の軸のまわりだけカメラへ向ける
      this.warp.rotation.set(0, Math.atan2(camera.position.x - this.center.x, camera.position.z - this.center.z), 0)
    }
    this.warp.scale.set(1 + Math.sin(t * 7) * 0.03 * L, 1 + Math.sin(t * 5.3) * 0.04 * L, 1)
    const pm = this.pillar.material as THREE.MeshBasicMaterial
    pm.opacity = L * 0.55
    pm.color.setRGB(0.5 + this.dark * 0.9, 1.4 - this.dark * 1.1, 2.0 + this.dark * 0.3)
    this.pillar.rotation.y = t * 0.8
    this.pillar.scale.set(0.6 + L * 0.5, 1, 0.6 + L * 0.5)
    // 足元の輪：広がって消える（くり返し）
    if (this.ringT >= 0) {
      this.ringT += dt
      const k = (this.ringT % 1.1) / 1.1
      this.ring.visible = on
      this.ring.scale.setScalar(0.6 + k * 4.5)
      const rm = this.ring.material as THREE.MeshBasicMaterial
      rm.opacity = (1 - k) * L
      rm.color.setRGB(0.6 + this.dark, 1.5 - this.dark * 1.2, 2.2)
      if (!on) this.ringT = -1
    }
    // 光のつぶ：中心のまわりをらせんに上る
    if (on) {
      const a = this.sparks.geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < a.count; i++) {
        const s = this.sparkSeed[i]
        const ph = (t * (0.35 + s * 0.3) + s) % 1
        const ang = s * 40 + t * (1.5 + s)
        const r = 0.35 + 0.6 * (1 - ph) * L
        a.setXYZ(i, this.center.x + Math.cos(ang) * r, ph * 3.2, this.center.z + Math.sin(ang) * r)
      }
      a.needsUpdate = true
      const sm = this.sparks.material as THREE.PointsMaterial
      sm.opacity = L
      sm.color.setRGB(1.6 + this.dark * 0.4, 1.8 - this.dark * 1.4, 2.2)
    }
    // 石標の板と足元の輪
    if (this.marker) {
      this.marker.setSurge(Math.min(1, L * 1.2))
    }
  }
}
