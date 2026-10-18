// カメラの演出（cinematic.ts）で見せる目印：脈打つ光る輪（カメラの方を向く）＋やわらかい光の柱＋名前の札（DOM）。
// シェルが 1 組だけ作って使い回す（ふだんは隠す。ステージをまたいで残り、メッシュは 2 枚・シェーダは小さい）。
// 輪は壁の向こうでも見えるよう深度を見ない。柱は深度を見る（建物の手前・奥がわかる）。
import * as THREE from 'three'
import { uTime } from '../render/materials'

const ringVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const ringFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
float band(float r, float c, float w) { return smoothstep(w, 0.0, abs(r - c)); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  // 紺の縁取り（明るい背景でも輪が読めるように）
  float halo = band(r, 0.62, 0.15) * 0.7;
  // 本体の輪（少し脈打つ）
  float beat = 0.5 + 0.5 * sin(uTime * 5.0);
  float core = band(r, 0.62, 0.036 + beat * 0.012);
  // 内側の細い輪
  float inner = band(r, 0.47, 0.016) * 0.75;
  // 外へ広がる波紋
  float ph = fract(uTime * 0.75);
  float wave = band(r, mix(0.5, 0.98, ph), 0.02) * (1.0 - ph);
  // 回る 4 つの目盛り（照準のように）
  float ang = a + uTime * 0.6;
  float tick = step(0.86, abs(cos(ang * 2.0))) * band(r, 0.78, 0.045);
  vec3 col = uColor * (core * 2.4 + inner * 1.6 + wave * 1.8 + tick * 2.0);
  float alpha = max(halo, max(core, max(inner, max(wave, tick))));
  vec3 navy = vec3(0.02, 0.05, 0.14);
  col = mix(navy, col, clamp(core + inner + wave + tick, 0.0, 1.0));
  alpha *= uOpacity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`

const beamFrag = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float x = abs(vUv.x * 2.0 - 1.0);
  float side = pow(1.0 - x, 2.2);
  float y = vUv.y;
  // 下（目標）ほど明るく、上へ消える
  float fade = smoothstep(0.0, 0.05, y) * pow(1.0 - y, 1.6);
  float shimmer = 0.8 + 0.2 * sin(y * 40.0 - uTime * 6.0);
  float a = side * fade * shimmer * uOpacity * 0.55;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.2 + side * 1.4), a);
}
`

export class CineMarkerFx {
  readonly group = new THREE.Group()
  private readonly ring: THREE.Mesh
  private readonly beam: THREE.Mesh
  private readonly ringU: { uTime: { value: number }; uOpacity: { value: number }; uColor: { value: THREE.Color } }
  private readonly beamU: { uTime: { value: number }; uOpacity: { value: number }; uColor: { value: THREE.Color } }
  private readonly label: HTMLDivElement
  private readonly labelText: HTMLSpanElement
  private readonly pos = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  private shown = false
  private text = ''

  constructor(ui: HTMLElement) {
    this.group.name = 'cine_marker'
    this.ringU = { uTime, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#7ff0ff') } }
    this.beamU = { uTime, uOpacity: { value: 0 }, uColor: { value: new THREE.Color('#7ff0ff') } }
    const common = { transparent: true, depthWrite: false, fog: false, toneMapped: false }
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: ringFrag, uniforms: this.ringU, depthTest: false, ...common }))
    this.ring.renderOrder = 990
    this.ring.frustumCulled = false
    const bg = new THREE.PlaneGeometry(1, 1)
    bg.translate(0, 0.5, 0)
    this.beam = new THREE.Mesh(bg, new THREE.ShaderMaterial({ vertexShader: ringVert, fragmentShader: beamFrag, uniforms: this.beamU, blending: THREE.AdditiveBlending, ...common }))
    this.beam.renderOrder = 989
    this.beam.frustumCulled = false
    this.group.add(this.beam, this.ring)
    this.group.visible = false
    this.label = document.createElement('div')
    this.label.className = 'cine-mark-label'
    this.label.hidden = true
    this.labelText = document.createElement('span')
    this.label.appendChild(this.labelText)
    ui.appendChild(this.label)
  }

  /** 目印を出す（opacity は update で毎フレーム決める） */
  show(pos: THREE.Vector3, label: string, color: THREE.ColorRepresentation = '#7ff0ff'): void {
    this.pos.copy(pos)
    this.ringU.uColor.value.set(color)
    this.beamU.uColor.value.set(color)
    if (label !== this.text) {
      this.text = label
      this.labelText.textContent = label
    }
    this.label.style.setProperty('--cm-color', `#${this.ringU.uColor.value.getHexString()}`)
    this.shown = true
  }

  hide(): void {
    this.shown = false
    this.group.visible = false
    this.label.hidden = true
    this.ringU.uOpacity.value = 0
    this.beamU.uOpacity.value = 0
  }

  get visible(): boolean {
    return this.shown
  }

  /** シェーダの事前コンパイル用（読み込み中だけ見せる） */
  warm(on: boolean, at: THREE.Vector3): void {
    this.group.visible = on
    if (on) {
      this.group.position.copy(at)
      this.ringU.uOpacity.value = 0.001
      this.beamU.uOpacity.value = 0.001
    }
  }

  /** 毎フレーム：輪をカメラへ向け、距離に応じた大きさにして、札を画面に置く */
  update(camera: THREE.PerspectiveCamera, opacity: number, w: number, h: number): void {
    if (!this.shown) return
    const op = Math.min(1, Math.max(0, opacity))
    this.group.visible = op > 0.002
    this.ringU.uOpacity.value = op
    this.beamU.uOpacity.value = op
    this.group.position.copy(this.pos)
    const dist = camera.position.distanceTo(this.pos)
    // 画面の上でおよそ一定の大きさ（画角の高さの 12% ほど）
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist
    const ringR = Math.min(40, Math.max(0.28, k * 0.1))
    const s = ringR / 0.31
    this.ring.scale.setScalar(s)
    this.ring.quaternion.copy(camera.quaternion)
    // 柱：Y 軸まわりにだけカメラへ向ける
    this.beam.rotation.set(0, Math.atan2(camera.position.x - this.pos.x, camera.position.z - this.pos.z), 0)
    this.beam.scale.set(ringR * 1.3, Math.max(6, ringR * 22), 1)
    this.beam.position.y = -ringR * 0.3
    // 札（輪の上）
    this.v.copy(this.pos)
    this.v.y += ringR * 1.15
    this.v.project(camera)
    const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 1.2 && Math.abs(this.v.y) < 1.2
    this.label.hidden = !onScreen || op < 0.05
    if (!this.label.hidden) {
      this.label.style.transform = `translate(${((this.v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-this.v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`
      this.label.style.opacity = op.toFixed(3)
    }
  }

  dispose(): void {
    this.ring.geometry.dispose()
    ;(this.ring.material as THREE.Material).dispose()
    this.beam.geometry.dispose()
    ;(this.beam.material as THREE.Material).dispose()
    this.label.remove()
  }
}
