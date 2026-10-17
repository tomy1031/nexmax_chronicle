// ループの演出：ネクマックスの背中の鉱石が強く光る → 光の球が広がって画面が白く飛ぶ →
// 白の中で時間が逆に流れる光の筋（中心へ吸い込まれる線・逆回りの時計の目盛り）→ 祭りの朝へ戻って白が晴れる。
// 画面の白とスジはカメラの前の板（後処理のブルームが効く）。世界側には鉱石の位置から広がる光の球。
// 使い方：fx.play({ at: 鉱石の位置, onOre(v), onSwap() }) → 毎フレーム fx.update(dt)。onSwap は真っ白の瞬間に 1 回（朝へ切り替える）。
import * as THREE from 'three'

const overlayVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  // 画面いっぱい（クリップ空間）。深度は手前に書く（AO・かすみを白の下で止める）
  gl_Position = vec4(position.xy * 2.0, -1.0, 1.0);
}
`
const overlayFrag = /* glsl */ `
uniform float uWhite;
uniform float uStreak;
uniform float uTime;
uniform float uAspect;
uniform float uDial;
varying vec2 vUv;
float h11(float x) { return fract(sin(x * 127.1) * 43758.5453); }
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  // 中心へ吸い込まれる光の筋（時間の逆流）
  float bins = 140.0;
  float id = floor((a / 6.2832 + 0.5) * bins);
  float rnd = h11(id);
  float speed = 0.6 + rnd * 1.6;
  float ph = fract(r * (1.5 + rnd) + uTime * speed + rnd * 7.0);
  float seg = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.08, 0.45, ph));
  float thin = 1.0 - smoothstep(0.0, 0.42, abs(fract((a / 6.2832 + 0.5) * bins) - 0.5));
  float streak = seg * thin * step(0.55, rnd) * smoothstep(0.05, 0.35, r);
  vec3 sc = mix(vec3(0.7, 0.85, 1.6), vec3(1.6, 1.2, 0.8), h11(id + 3.0));
  // 逆回りの時計の目盛り（細い光の輪と、5 目盛りごとに長い目盛り）
  float dial = 0.0;
  float ringR = 0.34;
  float ta = a + uDial;
  float f60 = fract(ta / 6.2832 * 60.0);
  float tick = smoothstep(0.1, 0.0, 0.5 - abs(f60 - 0.5)) * step(abs(r - ringR - 0.02), 0.01);
  float f12 = fract(ta / 6.2832 * 12.0);
  float big = smoothstep(0.05, 0.0, 0.5 - abs(f12 - 0.5)) * step(abs(r - ringR - 0.03), 0.022);
  dial += smoothstep(0.0035, 0.0, abs(r - ringR)) + tick * 0.6 + big;
  float hand = smoothstep(0.006, 0.0, abs(sin(ta * 0.5)) * r) * step(r, ringR * 0.9) * step(0.0, cos(ta * 0.5));
  dial += hand * 0.8;
  vec3 col = vec3(1.0) * uWhite * 2.2 + sc * streak * uStreak * 3.0 + vec3(1.2, 1.6, 2.6) * dial * uStreak * 1.4;
  float alpha = clamp(uWhite + streak * uStreak + dial * uStreak * 0.45, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
`

const sphereFrag = /* glsl */ `
uniform float uK;
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
  vec3 col = vec3(1.2, 1.6, 2.6) * (0.4 + f * 2.0) * uK;
  gl_FragColor = vec4(col, (0.25 + f * 0.75) * uK);
}
`
const sphereVert = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`

export type LoopPhase = 'idle' | 'flare' | 'whiteout' | 'rewind' | 'reveal'

export type LoopPlayOpts = {
  /** 光の球の中心（ネクマックスの背中の鉱石） */
  at: THREE.Vector3
  /** 鉱石の明るさ（setOreGlow へ渡す。最大 3） */
  onOre?: (v: number) => void
  /** 真っ白の瞬間に 1 回：時間帯を朝へ・プレイヤーを戻す・NPC を並べ直す */
  onSwap?: () => void
  onDone?: () => void
}

/** 時間配分（秒） */
export const LOOP_TIMING = { flare: 1.4, whiteout: 0.9, rewind: 1.8, reveal: 1.2 }

export class LoopFx {
  readonly overlay: THREE.Mesh
  readonly sphere: THREE.Mesh
  phase: LoopPhase = 'idle'
  private t = 0
  private opts: LoopPlayOpts | null = null
  private swapped = false
  private readonly om: THREE.ShaderMaterial
  private readonly sm: THREE.ShaderMaterial
  private dial = 0

  constructor(camera: THREE.Camera, scene: THREE.Object3D) {
    this.om = new THREE.ShaderMaterial({
      vertexShader: overlayVert,
      fragmentShader: overlayFrag,
      uniforms: { uWhite: { value: 0 }, uStreak: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 16 / 9 }, uDial: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: true,
      fog: false,
    })
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.om)
    this.overlay.frustumCulled = false
    this.overlay.renderOrder = 10000
    this.overlay.visible = false
    camera.add(this.overlay)
    if (!camera.parent) scene.add(camera)
    this.sm = new THREE.ShaderMaterial({
      vertexShader: sphereVert,
      fragmentShader: sphereFrag,
      uniforms: { uK: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    })
    this.sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.sm)
    this.sphere.visible = false
    this.sphere.frustumCulled = false
    this.sphere.renderOrder = 50
    scene.add(this.sphere)
  }

  get playing(): boolean {
    return this.phase !== 'idle'
  }

  /** 白さ（0..1）。HUD を隠す・音を絞るなどに使える */
  get whiteness(): number {
    return this.om.uniforms.uWhite.value as number
  }

  play(o: LoopPlayOpts): void {
    this.opts = o
    this.phase = 'flare'
    this.t = 0
    this.swapped = false
    this.sphere.position.copy(o.at)
    this.sphere.visible = true
    this.overlay.visible = true
  }

  /** 画面の縦横比（overlay の円を丸く保つ） */
  setAspect(a: number): void {
    this.om.uniforms.uAspect.value = a
  }

  update(dt: number): LoopPhase {
    if (this.phase === 'idle' || !this.opts) return 'idle'
    this.t += dt
    const T = LOOP_TIMING
    const u = this.om.uniforms
    u.uTime.value += dt * (this.phase === 'rewind' ? -1.4 : 0.6)
    const sm = (a: number, b: number, x: number) => {
      const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
      return k * k * (3 - 2 * k)
    }
    let white = 0
    let streak = 0
    if (this.phase === 'flare') {
      const k = this.t / T.flare
      this.opts.onOre?.(1 + 2 * sm(0, 0.7, k))
      this.sm.uniforms.uK.value = sm(0.15, 1, k)
      this.sphere.scale.setScalar(0.3 + 9 * Math.pow(k, 2.2))
      white = sm(0.55, 1, k) * 0.4
      streak = sm(0.4, 1, k) * 0.5
      if (this.t >= T.flare) this.next('whiteout')
    } else if (this.phase === 'whiteout') {
      const k = this.t / T.whiteout
      this.opts.onOre?.(3)
      this.sphere.scale.setScalar(9.3 + 60 * k)
      this.sm.uniforms.uK.value = 1
      white = 0.4 + 0.6 * sm(0, 0.6, k)
      streak = 0.5 + 0.5 * k
      if (k >= 0.75 && !this.swapped) {
        this.swapped = true
        this.sphere.visible = false
        this.opts.onSwap?.()
      }
      if (this.t >= T.whiteout) this.next('rewind')
    } else if (this.phase === 'rewind') {
      const k = this.t / T.rewind
      this.opts.onOre?.(3 - 2 * sm(0.3, 1, k))
      white = 1 - 0.45 * sm(0.1, 1, k)
      streak = 1
      this.dial -= dt * (8 - 6 * k)
      if (this.t >= T.rewind) this.next('reveal')
    } else if (this.phase === 'reveal') {
      const k = this.t / T.reveal
      this.opts.onOre?.(1)
      white = 0.55 * (1 - sm(0, 1, k))
      streak = 1 - sm(0, 0.7, k)
      this.dial -= dt * 2
      if (this.t >= T.reveal) {
        this.phase = 'idle'
        this.overlay.visible = false
        this.sphere.visible = false
        u.uWhite.value = 0
        u.uStreak.value = 0
        const done = this.opts.onDone
        this.opts = null
        done?.()
        return 'idle'
      }
    }
    u.uWhite.value = white
    u.uStreak.value = streak
    u.uDial.value = this.dial
    return this.phase
  }

  private next(p: LoopPhase): void {
    this.phase = p
    this.t = 0
  }

  dispose(): void {
    this.overlay.removeFromParent()
    this.sphere.removeFromParent()
    this.overlay.geometry.dispose()
    this.sphere.geometry.dispose()
    this.om.dispose()
    this.sm.dispose()
  }
}
