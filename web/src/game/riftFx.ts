// 3D の「光の裂け目」：時空移動の出発・到着で、その場に開く光の渦（時代の色）と吸い込まれる光の粒。
// シェルが 1 つだけ持ち、ステージをまたいで使い回す（ステージの解放対象にしない）。
import * as THREE from 'three'

const vert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const frag = /* glsl */ `
uniform float uTime;
uniform float uOpen;
uniform vec3 uTint;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.07; a *= 0.5; } return s; }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // 縦長の楕円（裂け目）
  p.x *= 1.55;
  float r = length(p);
  float a = atan(p.y, p.x);
  float open = uOpen;
  float rad = 0.92 * open;
  if (r > rad + 0.12) discard;
  // 渦：角度をずらしながら内側へ流れる縞
  float swirl = fbm(vec2(a * 1.6 + r * 5.0 - uTime * 2.4, r * 3.0 - uTime * 1.2));
  float swirl2 = fbm(vec2(a * 3.1 - r * 7.0 + uTime * 1.7, r * 6.0 + uTime * 0.8));
  float streak = smoothstep(0.45, 0.85, swirl) * 0.8 + smoothstep(0.55, 0.9, swirl2) * 0.6;
  float edge = smoothstep(rad + 0.1, rad - 0.02, r) * smoothstep(rad - 0.32, rad - 0.04, r);
  float core = smoothstep(rad * 0.75, 0.0, r);
  float inside = smoothstep(rad + 0.02, rad - 0.06, r);
  vec3 col = uTint * (streak * 1.5 + edge * 2.6) + vec3(1.0, 0.98, 0.95) * core * core * 1.9 + uTint * inside * 0.25;
  float alpha = clamp(inside * (0.25 + streak * 0.6 + core) + edge, 0.0, 1.0);
  gl_FragColor = vec4(col * alpha, alpha);
}
`

export class RiftFx {
  readonly group = new THREE.Group()
  private readonly disc: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  private readonly ring: THREE.Mesh
  private readonly ringMat: THREE.MeshBasicMaterial
  private readonly sparks: THREE.Points
  private readonly sparkMat: THREE.PointsMaterial
  private readonly sparkSeeds: Float32Array
  private readonly light: THREE.PointLight
  private open = 0
  private target = 0
  private speed = 2
  private t = 0
  private readonly tint = new THREE.Color()
  /** 開いているか（開きかけ・閉じかけを含む） */
  get visible(): boolean {
    return this.open > 0.001 || this.target > 0
  }

  constructor() {
    this.group.name = 'rift'
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uTint: { value: new THREE.Color(0.5, 0.8, 1.0) } },
      toneMapped: false,
    })
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), this.mat)
    this.disc.renderOrder = 5
    this.disc.frustumCulled = false
    this.group.add(this.disc)
    // 足元の光の輪
    const rg = new THREE.RingGeometry(0.92, 1.12, 64)
    rg.rotateX(-Math.PI / 2)
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.8, 1.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    this.ring = new THREE.Mesh(rg, this.ringMat)
    this.ring.renderOrder = 4
    this.group.add(this.ring)
    // 吸い込まれる光の粒
    const N = 160
    const pos = new Float32Array(N * 3)
    this.sparkSeeds = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      this.sparkSeeds[i * 3] = Math.random() * Math.PI * 2
      this.sparkSeeds[i * 3 + 1] = Math.random()
      this.sparkSeeds[i * 3 + 2] = 0.6 + Math.random() * 0.8
    }
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    this.sparkMat = new THREE.PointsMaterial({ size: 0.06, color: new THREE.Color(1, 1, 1), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, sizeAttenuation: true })
    this.sparks = new THREE.Points(sg, this.sparkMat)
    this.sparks.frustumCulled = false
    this.group.add(this.sparks)
    this.light = new THREE.PointLight('#8fd0ff', 0, 9, 2)
    this.light.position.set(0, 1.7, 0)
    this.group.add(this.light)
    // 点光源は常にシーンに残す（光源の数が変わるとシェーダが作り直しになるため）。見た目のメッシュだけ出し入れする
    this.setMeshesVisible(false)
  }

  private shown = false
  private setMeshesVisible(on: boolean): void {
    this.shown = on
    this.disc.visible = on
    this.ring.visible = on
    this.sparks.visible = on
  }

  /** pos（裂け目の中心の足元）に開く。tint は時代の色 */
  openAt(pos: THREE.Vector3, tint: THREE.ColorRepresentation, height = 1.7, speed = 1.6): void {
    this.group.position.copy(pos)
    this.disc.position.y = height
    this.ring.position.y = 0.03
    this.tint.set(tint)
    ;(this.mat.uniforms.uTint.value as THREE.Color).copy(this.tint)
    this.ringMat.color.copy(this.tint).multiplyScalar(1.1)
    this.sparkMat.color.copy(this.tint).lerp(new THREE.Color(1, 1, 1), 0.4).multiplyScalar(1.4)
    this.light.color.copy(this.tint)
    this.light.position.y = height
    this.target = 1
    this.speed = speed
    this.setMeshesVisible(true)
  }

  /** シェーダの事前コンパイル用に、見えない状態でメッシュを出しておく（on=false で戻す） */
  warm(on: boolean, pos: THREE.Vector3): void {
    if (on) {
      this.group.position.copy(pos)
      this.mat.uniforms.uOpen.value = 0
      this.ringMat.opacity = 0
      this.sparkMat.opacity = 0
    }
    this.setMeshesVisible(on)
  }

  close(speed = 1.2): void {
    this.target = 0
    this.speed = speed
  }

  /** 即座に消す（ステージを移るとき） */
  hide(): void {
    this.open = 0
    this.target = 0
    this.setMeshesVisible(false)
    this.light.intensity = 0
  }

  update(dt: number, camera: THREE.Camera): void {
    if (!this.shown) return
    this.t += dt
    const d = this.target - this.open
    this.open += Math.sign(d) * Math.min(Math.abs(d), dt * this.speed)
    const k = this.open * this.open * (3 - 2 * this.open)
    this.mat.uniforms.uTime.value = this.t
    this.mat.uniforms.uOpen.value = k
    // カメラの方を向く（縦軸だけ回す）
    const cp = camera.position
    this.disc.rotation.y = Math.atan2(cp.x - this.group.position.x, cp.z - this.group.position.z)
    this.ringMat.opacity = k * (0.35 + 0.18 * Math.sin(this.t * 6))
    this.ring.scale.setScalar(0.6 + k * 0.6)
    this.sparkMat.opacity = k
    this.light.intensity = k * 6
    // 粒：渦を巻きながら中心へ
    const pos = (this.sparks.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
    const h = this.disc.position.y
    const n = pos.length / 3
    for (let i = 0; i < n; i++) {
      const a0 = this.sparkSeeds[i * 3]
      const ph = (this.sparkSeeds[i * 3 + 1] + this.t * 0.45 * this.sparkSeeds[i * 3 + 2]) % 1
      const r = (1 - ph) * 2.2 * k + 0.05
      const a = a0 + ph * 5.0
      pos[i * 3] = Math.cos(a) * r * Math.cos(this.disc.rotation.y)
      pos[i * 3 + 1] = h + Math.sin(a) * r * 1.3
      pos[i * 3 + 2] = -Math.cos(a) * r * Math.sin(this.disc.rotation.y)
    }
    this.sparks.geometry.attributes.position.needsUpdate = true
    if (this.open <= 0.001 && this.target === 0) this.hide()
  }
}
