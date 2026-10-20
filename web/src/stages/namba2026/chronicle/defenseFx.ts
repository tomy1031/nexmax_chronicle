// 9 章の夜の防衛戦の見た目：路地の上の空のひびと、影がわき出る暗いうず（3 方向：路地の口・トンネル路地・屋根の上）。
// ・SkyCrack：長屋の上の空に、ガラスのようなひびが走る（setCrack(0〜1) で中心から広がる。黒い芯とむらさきのふち）
// ・ShadowMouths：影の出口。地面や屋根の上の黒いうず（setActive(dir, k)）。1 回の描画（InstancedMesh）
// 戦闘（影の敵）は combat/ が受け持つ。ここは出る場所の目印と空の演出だけ。
import * as THREE from 'three'
import { mulberry32 } from '../../../render/noise'
import { DEFENSE } from './layoutV7'

// ------------------------------------------------------------------ 空のひび

/** ひびの絵：R = 線、G = 中心からの近さ（1 が中心）。広がりの順に使う */
function crackCanvas(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 256
  const g = c.getContext('2d') as CanvasRenderingContext2D
  g.fillStyle = '#000'
  g.fillRect(0, 0, 512, 256)
  const rng = mulberry32(seed)
  const cx = 256
  const cy = 128
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let px = x
    let py = y
    const steps = Math.max(3, Math.round(len / 14))
    for (let i = 0; i < steps; i++) {
      a += (rng() - 0.5) * 0.8
      const nx = px + Math.cos(a) * 14
      const ny = py + Math.sin(a) * 14 * 0.6
      const d = Math.hypot(nx - cx, (ny - cy) * 2) / 256
      const gch = Math.max(0, Math.min(255, Math.round((1 - d) * 255)))
      g.strokeStyle = `rgb(255,${gch},0)`
      g.lineWidth = w * (1 - i / steps) + 1
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(nx, ny)
      g.stroke()
      px = nx
      py = ny
      if (depth > 0 && rng() < 0.25) branch(px, py, a + (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.6), len * 0.5, w * 0.6, depth - 1)
    }
  }
  for (let i = 0; i < 7; i++) branch(cx, cy, (i / 7) * Math.PI * 2 + rng() * 0.4, 150 + rng() * 120, 5, 2)
  return c
}

const crackVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const crackFrag = /* glsl */ `
uniform sampler2D uMap;
uniform float uK;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(uMap, vUv);
  float line = s.r;
  float near = s.g;
  float shown = smoothstep(1.0 - uK, 1.0 - uK + 0.08, near);
  // 線のまわりのにじみ（むらさき）と、線の芯（黒）
  float glow = line * shown;
  float pulse = 0.8 + 0.2 * sin(uTime * 3.0 + near * 10.0);
  vec3 col = mix(vec3(1.6, 0.4, 2.6) * pulse, vec3(0.02, 0.0, 0.05), smoothstep(0.55, 0.95, line));
  gl_FragColor = vec4(col, glow);
}
`

export class SkyCrack {
  readonly mesh: THREE.Mesh
  private readonly u: { uMap: { value: THREE.Texture }; uK: { value: number }; uTime: { value: number } }
  private k = 0
  private target = 0

  constructor(center: THREE.Vector3, lookAt: THREE.Vector3, w = 18, h = 9) {
    const tex = new THREE.CanvasTexture(crackCanvas(915))
    tex.colorSpace = THREE.NoColorSpace
    this.u = { uMap: { value: tex }, uK: { value: 0 }, uTime: { value: 0 } }
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: crackVert, fragmentShader: crackFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }),
    )
    this.mesh.position.copy(center)
    this.mesh.lookAt(lookAt)
    this.mesh.renderOrder = 2
    this.mesh.visible = false
    this.mesh.name = 'sky_crack'
  }

  /** ひびの広がり（0〜1）。instant でなければ 1.5 秒ほどで */
  setCrack(k: number, instant = false): void {
    this.target = Math.max(0, Math.min(1, k))
    if (instant) this.k = this.target
  }

  update(dt: number, t: number): void {
    const d = this.target - this.k
    if (Math.abs(d) > 1e-4) this.k += Math.sign(d) * Math.min(Math.abs(d), dt * 0.7)
    this.mesh.visible = this.k > 0.002
    this.u.uK.value = this.k
    this.u.uTime.value = t
  }
}

// ------------------------------------------------------------------ 影の出口（黒いうず）

const mouthVert = /* glsl */ `
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = float(gl_InstanceID) * 1.37;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`
const mouthFrag = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float a = atan(p.y, p.x);
  float swirl = 0.5 + 0.5 * sin(a * 5.0 + r * 9.0 - uTime * 4.0 + vSeed);
  float body = smoothstep(1.0, 0.55, r);
  float rim = exp(-pow((r - 0.78) / 0.12, 2.0)) * (0.6 + 0.4 * swirl);
  vec3 col = mix(vec3(0.015, 0.0, 0.03), vec3(1.3, 0.3, 2.2), rim);
  float alpha = clamp(body * (0.75 + 0.25 * swirl) + rim, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`

export type MouthDir = 'north' | 'south' | 'roof'

export class ShadowMouths {
  readonly mesh: THREE.InstancedMesh
  private readonly list: Array<{ dir: MouthDir; pos: THREE.Vector3; k: number; target: number; size: number }> = []
  private readonly u = { uTime: { value: 0 } }
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()

  constructor() {
    const all: Array<[MouthDir, THREE.Vector3]> = [
      ...DEFENSE.spawns.north.map((p) => ['north', p] as [MouthDir, THREE.Vector3]),
      ...DEFENSE.spawns.south.map((p) => ['south', p] as [MouthDir, THREE.Vector3]),
      ...DEFENSE.spawns.roof.map((p) => ['roof', p] as [MouthDir, THREE.Vector3]),
    ]
    for (const [dir, pos] of all) this.list.push({ dir, pos: pos.clone(), k: 0, target: 0, size: dir === 'roof' ? 1.6 : 2.0 })
    const g = new THREE.PlaneGeometry(1, 1)
    g.rotateX(-Math.PI / 2)
    this.mesh = new THREE.InstancedMesh(
      g,
      new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: mouthVert, fragmentShader: mouthFrag, transparent: true, depthWrite: false, toneMapped: false }),
      this.list.length,
    )
    this.mesh.name = 'shadow_mouths'
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.write()
  }

  /** 出口（方向ごと）を開く・閉じる（0〜1） */
  setActive(dir: MouthDir, k: number, instant = false): void {
    for (const e of this.list) {
      if (e.dir !== dir) continue
      e.target = Math.max(0, Math.min(1, k))
      if (instant) e.k = e.target
    }
  }

  /** 出口の位置（影を出す場所） */
  points(dir: MouthDir): THREE.Vector3[] {
    return this.list.filter((e) => e.dir === dir).map((e) => e.pos)
  }

  private write(): void {
    this.list.forEach((e, i) => {
      const k = e.k
      this.s.set(e.size * k, 1, e.size * k)
      this.q.identity()
      this.m.compose(this.tmpP.copy(e.pos).setY(e.pos.y + 0.03), this.q, this.s)
      this.mesh.setMatrixAt(i, this.m)
    })
    this.mesh.instanceMatrix.needsUpdate = true
  }
  private readonly tmpP = new THREE.Vector3()

  update(dt: number, t: number): void {
    this.u.uTime.value = t
    let any = false
    let changed = false
    for (const e of this.list) {
      const d = e.target - e.k
      if (Math.abs(d) > 1e-4) {
        e.k += Math.sign(d) * Math.min(Math.abs(d), dt * 1.5)
        changed = true
      }
      if (e.k > 0.002) any = true
    }
    this.mesh.visible = any
    if (changed) this.write()
  }
}
