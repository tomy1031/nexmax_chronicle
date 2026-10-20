// トワの手さげランプ。もとはトワの母が「昼のうちに朝の光をためて、夜にともす」ランプ（物語 10・12 章）。
// ・暗いとき（setDark(true)）：中で黒い火がゆれ、黒い影がけむりのように下へこぼれる（ふちは紫）
// ・明るいとき（setDark(false)）：あたたかい金色の火（回想の母のランプ）
// ・burst()：ガラスがわれて、中から「朝の光」（あたたかい金色）があふれる（光の玉・輪・光のすじ・金の粒・ガラスのかけら）
// root はつり手のてっぺんが原点（手の先に付けると下へぶら下がる）。けむり・光はワールドに置く fx（作るときに渡す親へ足す）。
import * as THREE from 'three'
import { createToonMaterial, PartSet, SHAPES, T, lathe } from './toon'
import { Particles } from './particles'
import { BILLBOARD_GLSL, NOISE_GLSL, clamp01, disposeRoot, easeOut, unitQuad } from './common'

export type LampOpts = {
  /** はじめから黒い火（既定 true） */
  dark?: boolean
  /** けむりの量（既定 1） */
  smoke?: number
  /** 点光源を持つ（光の数が変わらないよう、作るときから持つ。既定 false） */
  light?: boolean
  /** 大きさ（既定 1：高さ約 0.3 m） */
  scale?: number
}

const fireVert = /* glsl */ `
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  vec3 wp = cvBillboardY(position);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`

const fireFrag = /* glsl */ `
uniform float uTime;
uniform float uDark;
uniform float uK;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float yy = clamp((p.y + 1.0) * 0.5, 0.0, 1.0);
  float n = cvNoise(vec2(p.x * 3.0, p.y * 3.0 - uTime * 5.0));
  float x = p.x + (n - 0.5) * 0.5 * yy;
  // しずく形（下が丸く、上がとがる）
  float w = mix(0.62, 0.04, pow(yy, 1.15));
  float d = length(vec2(x / w, (p.y + 0.45) / 1.25));
  float body = 1.0 - smoothstep(0.78, 1.0, d);
  float glow = exp(-max(0.0, d - 0.7) * 3.0) * (1.0 - body * 0.6);
  vec3 darkCore = vec3(0.02, 0.0, 0.04);
  vec3 darkRim = vec3(0.75, 0.25, 1.25);
  vec3 warmCore = vec3(2.2, 1.7, 0.85);
  vec3 warmRim = vec3(1.6, 0.75, 0.2);
  float rim = smoothstep(0.72, 0.98, d) * body;
  vec3 core = mix(warmCore, darkCore, uDark);
  vec3 rimC = mix(warmRim, darkRim, uDark);
  // 黒い火：中は黒く、ふちだけ紫に光る。明るい火：中が白っぽい金
  float a = body * mix(0.85, 1.0, uDark) * uK;
  vec3 col = core * a + rimC * (rim * 1.3 + glow * mix(0.55, 0.3, uDark)) * uK;
  gl_FragColor = vec4(col, a);
}
`

const flashVert = /* glsl */ `
uniform float uRoll;
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * cvBillboard(position, uRoll);
}
`

/** 朝の光の玉（やわらかい丸＋光のすじ） */
const flashFrag = /* glsl */ `
uniform float uA;
uniform float uRays;
uniform float uTime;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float core = exp(-r * r * 9.0);
  float halo = exp(-r * 3.2) * 0.55;
  float rays = pow(max(0.0, cos(a * 7.0 + uTime * 0.25)), 26.0) + pow(max(0.0, cos(a * 11.0 - uTime * 0.18 + 1.3)), 40.0) * 0.6;
  rays *= smoothstep(1.0, 0.1, r) * uRays;
  float k = (core * 1.6 + halo + rays * 0.9) * uA * smoothstep(1.0, 0.85, r);
  gl_FragColor = vec4(uColor * k, 1.0);
}
`

/** ひろがる光の輪 */
const ringFrag = /* glsl */ `
uniform float uA;
uniform float uW;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float k = exp(-pow((r - 0.86) / uW, 2.0)) * uA;
  gl_FragColor = vec4(uColor * k, 1.0);
}
`

const WARM = new THREE.Color('#ffc46a')
const DARK_LIGHT = new THREE.Color('#9a5cff')

export class Lamp {
  /** つり手のてっぺんが原点。手に付ける・場面に置く */
  readonly root = new THREE.Group()
  /** ワールドに置く演出（けむり・光の玉・輪・粒）。作るときに渡した親に足してある */
  readonly fx = new THREE.Group()
  /** いまの明るさ（0..）。点光源を自分で置くときに使う（色は lightColor） */
  lightLevel = 0
  readonly lightColor = new THREE.Color()
  /** あふれた朝の光の強さ（0..1。ステージが影・すじを弱らせるのに使える） */
  morning = 0
  private dark: boolean
  private darkK: number
  private readonly scale: number
  private readonly smokeRate: number
  private readonly glass: THREE.Mesh
  private readonly fire: THREE.Mesh
  private readonly fireMat: THREE.ShaderMaterial
  private readonly flash: THREE.Mesh
  private readonly flashMat: THREE.ShaderMaterial
  private readonly ring: THREE.Mesh
  private readonly ringMat: THREE.ShaderMaterial
  private readonly smoke: Particles
  private readonly glow: Particles
  private readonly light: THREE.PointLight | null
  private smokeAcc = 0
  private burstT = -1
  private brokenFlag = false
  private onBurstDone: (() => void) | null = null
  private readonly burstAt = new THREE.Vector3()
  private readonly c = new THREE.Vector3()
  private readonly tmp = new THREE.Vector3()
  private readonly tv = new THREE.Vector3()

  constructor(fxParent: THREE.Object3D, o: LampOpts = {}) {
    this.dark = o.dark ?? true
    this.darkK = this.dark ? 1 : 0
    this.scale = o.scale ?? 1
    this.smokeRate = 26 * (o.smoke ?? 1)
    this.root.name = 'lamp'
    this.fx.name = 'lampFx'
    fxParent.add(this.fx)
    const body = new THREE.Group()
    body.scale.setScalar(this.scale)
    this.root.add(body)
    // 金具（つり手・かさ・輪・かご・台）：トゥーン＋輪郭線
    const ps = new PartSet()
    const iron = '#3a3346'
    const bronze = '#9a7440'
    const handle = new THREE.TorusGeometry(0.052, 0.0055, 6, 20, Math.PI)
    ps.add(body, handle, iron, T(0, -0.058, 0))
    ps.add(body, SHAPES.cyl, iron, T(0, -0.068, 0, 0, 0, 0, 0.016, 0.03, 0.016))
    ps.add(
      body,
      lathe(
        [
          [0.078, -0.112],
          [0.06, -0.098],
          [0.024, -0.078],
          [0.016, -0.07],
        ],
        16,
      ),
      iron,
    )
    ps.add(body, new THREE.TorusGeometry(1, 0.1, 6, 22), bronze, T(0, -0.112, 0, Math.PI / 2, 0, 0, 0.074, 0.074, 0.06))
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const x = Math.cos(a) * 0.066
      const z = Math.sin(a) * 0.066
      ps.add(body, SHAPES.cyl, iron, T(x, -0.185, z, 0, 0, 0, 0.0045, 0.15, 0.0045))
    }
    ps.add(
      body,
      lathe(
        [
          [0.06, -0.3],
          [0.078, -0.285],
          [0.08, -0.262],
          [0.066, -0.255],
        ],
        16,
      ),
      bronze,
    )
    ps.add(body, new THREE.TorusGeometry(1, 0.1, 6, 22), iron, T(0, -0.258, 0, Math.PI / 2, 0, 0, 0.072, 0.072, 0.06))
    const metal = createToonMaterial({ line: '#120c18', selfLight: 0.25 })
    ps.bake(metal, { name: 'lampMetal' })
    // ガラス（うすい色。中の火が見える）
    const gg = lathe(
      [
        [0.05, -0.256],
        [0.063, -0.2],
        [0.06, -0.15],
        [0.048, -0.114],
      ],
      18,
    )
    this.glass = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: '#b8a0d8', transparent: true, opacity: 0.16, depthWrite: false }))
    this.glass.name = 'lampGlass'
    this.glass.renderOrder = 3
    body.add(this.glass)
    // 火（Y 軸だけカメラを向く板）
    this.fireMat = new THREE.ShaderMaterial({
      vertexShader: fireVert,
      fragmentShader: fireFrag,
      uniforms: { uTime: { value: 0 }, uDark: { value: this.darkK }, uK: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    })
    this.fire = new THREE.Mesh(unitQuad(), this.fireMat)
    this.fire.name = 'lampFire'
    this.fire.position.set(0, -0.19, 0)
    this.fire.scale.set(0.075, 0.12, 1)
    this.fire.renderOrder = 2
    this.fire.frustumCulled = false
    body.add(this.fire)
    // 朝の光の玉と輪（ワールド）
    this.flashMat = new THREE.ShaderMaterial({
      vertexShader: flashVert,
      fragmentShader: flashFrag,
      uniforms: { uA: { value: 0 }, uRays: { value: 1 }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffcf7a').multiplyScalar(1.7) }, uRoll: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.flash = new THREE.Mesh(unitQuad(), this.flashMat)
    this.flash.visible = false
    this.flash.frustumCulled = false
    this.flash.renderOrder = 5
    this.fx.add(this.flash)
    this.ringMat = new THREE.ShaderMaterial({
      vertexShader: flashVert,
      fragmentShader: ringFrag,
      uniforms: { uA: { value: 0 }, uW: { value: 0.05 }, uColor: { value: new THREE.Color('#ffd890').multiplyScalar(2.0) }, uRoll: { value: 0 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    this.ring = new THREE.Mesh(unitQuad(), this.ringMat)
    this.ring.visible = false
    this.ring.frustumCulled = false
    this.ring.renderOrder = 5
    this.fx.add(this.ring)
    // けむり（黒）と光の粒（足して光る）
    this.smoke = new Particles({ max: 140, shape: 'smoke', additive: false, renderOrder: 4 })
    this.glow = new Particles({ max: 320, shape: 'soft', additive: true, renderOrder: 6 })
    this.fx.add(this.smoke.points, this.glow.points)
    this.light = o.light ? new THREE.PointLight('#ffc46a', 0, 9, 2) : null
    if (this.light) this.fx.add(this.light)
    this.setDark(this.dark, true)
  }

  /** 黒い火（true）・あたたかい火（false）。instant で、まぜずにすぐ */
  setDark(on: boolean, instant = false): void {
    this.dark = on
    if (instant) this.darkK = on ? 1 : 0
    ;(this.glass.material as THREE.MeshBasicMaterial).color.set(on ? '#8a80a8' : '#ffe2a8')
  }

  get isDark(): boolean {
    return this.dark
  }

  /** われた（burst のあと） */
  get broken(): boolean {
    return this.brokenFlag
  }

  /** われて、中から朝の光があふれる。終わったら resolve（約 3.5 秒） */
  burst(): Promise<void> {
    if (this.burstT >= 0 || this.brokenFlag) return Promise.resolve()
    this.burstT = 0
    this.center(this.burstAt)
    this.flash.position.copy(this.burstAt)
    this.ring.position.copy(this.burstAt)
    this.flash.visible = true
    this.ring.visible = true
    // ガラスのかけら（光る白）と金の粒
    const s = this.scale
    this.glow.burst(26, this.burstAt, 3.2 * s, { life: 0.9, size: 0.035 * s, color: new THREE.Color('#e8f4ff').multiplyScalar(2), gravity: 6, drag: 1.2 }, 1.2, 0.08 * s)
    this.glow.burst(60, this.burstAt, 2.2 * s, { life: 2.4, size: 0.08 * s, color: new THREE.Color('#ffc864').multiplyScalar(2.2), gravity: -0.5, drag: 1.4, grow: 0.5 }, 0.6, 0.1 * s)
    return new Promise((res) => {
      this.onBurstDone = res
    })
  }

  /** われる前にもどす */
  reset(dark = true): void {
    this.burstT = -1
    this.brokenFlag = false
    this.morning = 0
    this.glass.visible = true
    this.fire.visible = true
    this.flash.visible = false
    this.ring.visible = false
    this.setDark(dark, true)
  }

  /** ガラスの中（火）のワールド座標 */
  center(out = new THREE.Vector3()): THREE.Vector3 {
    return this.fire.getWorldPosition(out)
  }

  update(dt: number, t: number): void {
    this.darkK += ((this.dark ? 1 : 0) - this.darkK) * (1 - Math.exp(-dt * 4))
    const u = this.fireMat.uniforms
    u.uTime.value = t
    u.uDark.value = this.darkK
    const c = this.center(this.c)
    const s = this.scale
    // 黒いけむり：ガラスのすきまからこぼれて、重たく下へ流れる
    if (!this.brokenFlag && this.burstT < 0 && this.darkK > 0.5 && dt > 0) {
      this.smokeAcc += dt * this.smokeRate * this.darkK
      while (this.smokeAcc >= 1) {
        this.smokeAcc -= 1
        const a = Math.random() * Math.PI * 2
        const top = Math.random() < 0.35
        this.tmp.set(Math.cos(a) * 0.06 * s, top ? 0.075 * s : (Math.random() - 0.6) * 0.1 * s, Math.sin(a) * 0.06 * s).add(c)
        this.tv.set(Math.cos(a) * 0.12, top ? 0.05 : -0.05, Math.sin(a) * 0.12)
        this.smoke.emit(this.tmp, this.tv, {
          life: 1.6 + Math.random() * 1.0,
          size: (0.07 + Math.random() * 0.05) * s,
          grow: 3.4,
          color: Math.random() < 0.3 ? '#4a2272' : '#22103a',
          alpha: 0.7,
          gravity: 0.22,
          drag: 1.1,
          fadeIn: 0.2,
        })
        // 夜でも見えるように、うすい紫のもやを重ねる
        if (Math.random() < 0.45) this.glow.emit(this.tmp, this.tv, { life: 1.8, size: 0.09 * s, grow: 3, color: '#6a3aa8', alpha: 0.16, gravity: 0.2, drag: 1.1, fadeIn: 0.25 })
        if (Math.random() < 0.18) this.glow.emit(this.tmp, this.tv.multiplyScalar(0.6), { life: 1.0, size: 0.02 * s, color: new THREE.Color('#b070ff').multiplyScalar(2), gravity: 0.1, drag: 1.5 })
      }
    }
    // 明るさ（火の明るさ・われたときの光）
    let lvl = this.brokenFlag ? 0 : this.darkK > 0.5 ? 0.35 : 1.0
    this.lightColor.copy(WARM).lerp(DARK_LIGHT, this.darkK)
    if (this.burstT >= 0) {
      this.burstT += dt
      const bt = this.burstT
      // 0.1 秒でガラスがわれる
      if (bt > 0.1 && !this.brokenFlag) {
        this.brokenFlag = true
        this.glass.visible = false
        this.dark = false
        this.darkK = 0
      }
      const k1 = easeOut(bt / 1.2)
      const fade = 1 - clamp01((bt - 1.0) / 2.4)
      const fs = (0.4 + 3.6 * k1) * s
      this.flash.scale.set(fs, fs, 1)
      this.flashMat.uniforms.uA.value = Math.min(1, bt * 8) * fade * 0.75
      this.flashMat.uniforms.uTime.value = t
      const rk = easeOut(bt / 1.3)
      const rs = (0.3 + 7 * rk) * s
      this.ring.scale.set(rs, rs, 1)
      this.ringMat.uniforms.uA.value = (1 - clamp01(bt / 1.3)) * Math.min(1, bt * 10)
      this.ringMat.uniforms.uW.value = 0.04 + 0.05 * rk
      this.fire.visible = bt < 1.6
      this.fireMat.uniforms.uK.value = 1 + Math.max(0, 1 - bt) * 1.5
      this.fire.scale.set(0.075 * (1 + bt * 1.5), 0.12 * (1 + bt * 1.2), 1)
      // 金の粒が上へのぼる
      if (bt < 2.6 && dt > 0) {
        const n = Math.round(dt * 70)
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2
          const rr = Math.random() * 0.6 * s * (0.3 + k1)
          this.tmp.set(Math.cos(a) * rr, (Math.random() - 0.3) * 0.4 * s, Math.sin(a) * rr).add(this.burstAt)
          this.tv.set(Math.cos(a) * 0.3, 0.6 + Math.random() * 0.9, Math.sin(a) * 0.3)
          this.glow.emit(this.tmp, this.tv, { life: 1.4 + Math.random(), size: (0.04 + Math.random() * 0.05) * s, color: new THREE.Color('#ffd27a').multiplyScalar(1.8), gravity: -0.2, drag: 0.6 })
        }
      }
      this.morning = fade * Math.min(1, bt * 5)
      lvl = Math.max(lvl, 4 * Math.min(1, bt * 6) * Math.pow(fade, 1.5))
      this.lightColor.copy(WARM)
      if (bt > 3.5) {
        this.flash.visible = false
        this.ring.visible = false
        this.fire.visible = false
        this.burstT = -1
        this.morning = 0
        const done = this.onBurstDone
        this.onBurstDone = null
        done?.()
      }
    }
    this.lightLevel = lvl
    if (this.light) {
      this.light.position.copy(c)
      this.light.color.copy(this.lightColor)
      this.light.intensity = lvl * 1.2
    }
    this.smoke.update(dt)
    this.glow.update(dt)
  }

  dispose(): void {
    this.smoke.dispose()
    this.glow.dispose()
    disposeRoot(this.root)
    disposeRoot(this.fx)
  }
}
