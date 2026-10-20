// 粒（けむり・ちり・光の粒・カチカチの粒）。CPU で動かす決まった数の点を、1 回の描画で出す。
// 大きさは m で指定する（距離で小さくなる）。1 つの Particles は 1 つの形（やわらかい丸・十字の光・ひし形・けむり）。
import * as THREE from 'three'
import { VIEW_H } from './common'

export type ParticleShape = 'soft' | 'spark' | 'diamond' | 'smoke'

export type ParticleOpts = {
  /** 同時に出せる粒の数（古い順に上書き） */
  max: number
  /** 足して光らせる（光の粒）。false なら普通に重ねる（黒いけむり） */
  additive?: boolean
  shape?: ParticleShape
  renderOrder?: number
}

export type EmitOpts = {
  /** 生きる秒数 */
  life: number
  /** 大きさ（m） */
  size: number
  color: THREE.ColorRepresentation
  /** 不透明度（既定 1） */
  alpha?: number
  /** 終わりの大きさの倍率（既定 1） */
  grow?: number
  /** 下向きの加速（m/s²。負なら上へ） */
  gravity?: number
  /** 空気の抵抗（1/s） */
  drag?: number
  /** 出始めにふわっと出る割合（0..1、既定 0.15） */
  fadeIn?: number
}

const vert = /* glsl */ `
attribute vec4 aColor;
attribute float aSize;
uniform float uViewH;
varying vec4 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.05, -mv.z);
  vColor = aColor;
}
`

const frag = (shape: ParticleShape) => /* glsl */ `
varying vec4 vColor;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q);
  float a;
  ${
    shape === 'spark'
      ? 'a = exp(-r * r * 60.0) + max(0.0, 1.0 - abs(q.x) * 14.0) * max(0.0, 1.0 - abs(q.y) * 2.2) * 0.5 + max(0.0, 1.0 - abs(q.y) * 14.0) * max(0.0, 1.0 - abs(q.x) * 2.2) * 0.5;'
      : shape === 'diamond'
        ? 'float d = abs(q.x) + abs(q.y); a = smoothstep(0.42, 0.34, d) + exp(-r * r * 30.0) * 0.6;'
        : shape === 'smoke'
          ? 'a = smoothstep(0.5, 0.05, r); a *= a;'
          : 'a = smoothstep(0.5, 0.0, r); a = a * a * (1.6 - 0.6 * a);'
  }
  a *= vColor.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vColor.rgb, a);
}
`

const tmpC = new THREE.Color()

export class Particles {
  readonly points: THREE.Points
  private readonly n: number
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly col: Float32Array
  private readonly base: Float32Array // r g b alpha
  private readonly size: Float32Array
  private readonly size0: Float32Array
  private readonly life: Float32Array
  private readonly age: Float32Array
  private readonly grow: Float32Array
  private readonly grav: Float32Array
  private readonly drag: Float32Array
  private readonly fadeIn: Float32Array
  private cursor = 0
  private live = 0
  /** 前のフレームに生きていた（または出したばかり）。どちらも無ければ書き換えも転送も省く */
  private busy = false
  private readonly geo: THREE.BufferGeometry
  private readonly mat: THREE.ShaderMaterial

  constructor(o: ParticleOpts) {
    const n = (this.n = Math.max(1, Math.floor(o.max)))
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    this.col = new Float32Array(n * 4)
    this.base = new Float32Array(n * 4)
    this.size = new Float32Array(n)
    this.size0 = new Float32Array(n)
    this.life = new Float32Array(n)
    this.age = new Float32Array(n).fill(1e9)
    this.grow = new Float32Array(n)
    this.grav = new Float32Array(n)
    this.drag = new Float32Array(n)
    this.fadeIn = new Float32Array(n)
    const g = (this.geo = new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage))
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert,
      fragmentShader: frag(o.shape ?? 'soft'),
      uniforms: { uViewH: VIEW_H },
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
      fog: false,
    })
    this.points = new THREE.Points(g, this.mat)
    this.points.frustumCulled = false
    this.points.renderOrder = o.renderOrder ?? 2
    this.points.name = 'particles'
  }

  /** 1 つ出す（p・v はワールド座標。points はワールドに置くこと） */
  emit(p: THREE.Vector3, v: THREE.Vector3, o: EmitOpts): void {
    const i = this.cursor
    this.cursor = (this.cursor + 1) % this.n
    this.pos[i * 3] = p.x
    this.pos[i * 3 + 1] = p.y
    this.pos[i * 3 + 2] = p.z
    this.vel[i * 3] = v.x
    this.vel[i * 3 + 1] = v.y
    this.vel[i * 3 + 2] = v.z
    tmpC.set(o.color)
    this.base[i * 4] = tmpC.r
    this.base[i * 4 + 1] = tmpC.g
    this.base[i * 4 + 2] = tmpC.b
    this.base[i * 4 + 3] = o.alpha ?? 1
    this.size0[i] = o.size
    this.life[i] = Math.max(0.01, o.life)
    this.age[i] = 0
    this.grow[i] = o.grow ?? 1
    this.grav[i] = o.gravity ?? 0
    this.drag[i] = o.drag ?? 0
    this.fadeIn[i] = o.fadeIn ?? 0.15
    this.busy = true
  }

  /** まわりへ n 個ばらまく（速さ speed、上向きの加え up） */
  burst(n: number, at: THREE.Vector3, speed: number, o: EmitOpts, up = 0, spread = 0): void {
    const v = new THREE.Vector3()
    const p = new THREE.Vector3()
    for (let i = 0; i < n; i++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
      if (v.lengthSq() < 1e-4) v.set(0, 1, 0)
      v.normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65))
      v.y += up
      p.set(at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread)
      this.emit(p, v, { ...o, life: o.life * (0.6 + Math.random() * 0.6), size: o.size * (0.6 + Math.random() * 0.8) })
    }
  }

  /** 生きている粒の数（目安） */
  get alive(): number {
    return this.live
  }

  clear(): void {
    this.age.fill(1e9)
    this.size.fill(0)
    this.live = 0
    this.flag()
  }

  update(dt: number): void {
    if (!this.busy) return
    let live = 0
    for (let i = 0; i < this.n; i++) {
      const life = this.life[i]
      let a = this.age[i]
      if (a >= life) {
        if (this.size[i] !== 0) {
          this.size[i] = 0
          this.col[i * 4 + 3] = 0
        }
        continue
      }
      a += dt
      this.age[i] = a
      live++
      const k = a / life
      const d = Math.exp(-this.drag[i] * dt)
      const j = i * 3
      this.vel[j] *= d
      this.vel[j + 1] = this.vel[j + 1] * d - this.grav[i] * dt
      this.vel[j + 2] *= d
      this.pos[j] += this.vel[j] * dt
      this.pos[j + 1] += this.vel[j + 1] * dt
      this.pos[j + 2] += this.vel[j + 2] * dt
      const fi = this.fadeIn[i]
      const fade = (fi > 0 ? Math.min(1, k / fi) : 1) * (1 - Math.max(0, (k - 0.55) / 0.45))
      this.size[i] = k >= 1 ? 0 : this.size0[i] * (1 + (this.grow[i] - 1) * k)
      const c = i * 4
      this.col[c] = this.base[c]
      this.col[c + 1] = this.base[c + 1]
      this.col[c + 2] = this.base[c + 2]
      this.col[c + 3] = this.base[c + 3] * Math.max(0, fade)
    }
    this.live = live
    this.flag()
    // 最後の粒が消えたフレームは転送して、そのあとは止める
    this.busy = live > 0
  }

  private flag(): void {
    ;(this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aColor as THREE.BufferAttribute).needsUpdate = true
    ;(this.geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true
  }

  dispose(): void {
    this.points.removeFromParent()
    this.geo.dispose()
    this.mat.dispose()
  }
}
