// 空中の細い切れ目（仮）。源兵衛の実演（7 章）で、からくりのうでがかけらを動かしたあとに入る切れ目。
// 本番の見た目は visuals 担当の SlitFx（web/src/chronicle/visuals/）に置きかえる予定。それまでの代わり。
// ・細長いレンズ形の板：ふちは青白く光り、中はまっくらな「裏側」。中で大きな黒いものが、ぬるりと動く
// ・切れ目の向き（axis）のまわりで、板がカメラの方を向く（横から見ても消えない）
import * as THREE from 'three'
import { uTime } from '../../../render/materials'

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
uniform float uThing;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  // x：横（-1〜1）、y：切れ目の長さの向き（-1〜1）
  vec2 p = vUv * 2.0 - 1.0;
  float len = 1.0 - p.y * p.y;
  // レンズ形の幅（ふちが少し波打つ）
  float hw = uOpen * 0.55 * pow(max(len, 0.0), 0.7) * (0.9 + 0.1 * noise(vec2(p.y * 6.0, uTime * 2.0)));
  float d = abs(p.x) - hw;
  // 中：裏側（まっくら＋かすかな紫のゆらぎ）
  float inside = step(d, 0.0);
  vec3 col = vec3(0.01, 0.01, 0.03) + vec3(0.07, 0.03, 0.12) * noise(p * vec2(3.0, 8.0) + vec2(0.0, uTime * 0.4)) * 0.6;
  // 黒いもの：ゆっくり横切る大きな影（中だけ）
  float sx = (p.y - mix(1.4, -1.4, uThing)) * 1.8;
  float blob = smoothstep(0.55, 0.15, length(vec2(p.x / max(hw, 0.02) * 0.35, sx + 0.25 * sin(p.x * 3.0 + uTime))));
  col = mix(col, vec3(0.0), blob * 0.95);
  // ふちの光（外側へ減る）
  float edge = exp(-max(d, 0.0) * 34.0) * (1.0 - inside * 0.75);
  vec3 glow = mix(vec3(0.5, 0.85, 1.6), vec3(1.6, 1.8, 2.2), exp(-abs(d) * 60.0));
  float alpha = max(inside, edge * smoothstep(1.0, 0.7, abs(p.y)));
  vec3 outc = mix(glow * edge, col, inside);
  alpha *= smoothstep(0.0, 0.05, uOpen);
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(outc, alpha);
}
`

const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpC = new THREE.Vector3()
const tmpM = new THREE.Matrix4()

export class TempSlit {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  /** 切れ目の中心と、長さの向き（単位ベクトル） */
  readonly center = new THREE.Vector3()
  readonly axis = new THREE.Vector3(0, 1, 0)
  length = 1.2
  /** 板の横幅（m）。切れ目のいちばん太いところは、この 3 割ほど */
  width = 0.36
  /** ひらき具合の目標（0〜1）と今の値 */
  private want = 0
  private open = 0
  /** 黒いものの横切り（0〜1） */
  thing = 0

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag,
      uniforms: { uTime, uOpen: { value: 0 }, uThing: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat)
    this.mesh.name = 'temp_slit'
    this.mesh.visible = false
    this.mesh.renderOrder = 3
    this.mesh.frustumCulled = false
  }

  /** 中心・向き・長さを決める */
  place(center: THREE.Vector3, axis: THREE.Vector3, length = 1.2, width = 0.36): void {
    this.center.copy(center)
    this.axis.copy(axis).normalize()
    this.length = length
    this.width = width
  }

  /** ひらく（k=1）・閉じる（k=0）。instant でその場で */
  setOpen(k: number, instant = false): void {
    this.want = k
    if (instant) this.open = k
  }

  get openAmount(): number {
    return this.open
  }

  update(dt: number, camera: THREE.Camera): void {
    const rate = this.want > this.open ? 5 : 3
    this.open += (this.want - this.open) * Math.min(1, dt * rate)
    if (Math.abs(this.want - this.open) < 0.002) this.open = this.want
    this.mat.uniforms.uOpen.value = this.open
    this.mat.uniforms.uThing.value = this.thing
    this.mesh.visible = this.open > 0.01
    if (!this.mesh.visible) return
    // 長さの向きを Y に、カメラの方を Z に（軸のまわりのビルボード）
    const y = tmpA.copy(this.axis)
    const toCam = tmpB.copy(camera.position).sub(this.center)
    const x = tmpC.crossVectors(y, toCam).normalize()
    const z = toCam.crossVectors(x, y).normalize()
    tmpM.makeBasis(x, y, z)
    this.mesh.quaternion.setFromRotationMatrix(tmpM)
    this.mesh.position.copy(this.center)
    // 横幅は切れ目のふちの光のぶんだけ取る
    this.mesh.scale.set(this.width, this.length, 1)
  }
}
