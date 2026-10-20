// 時空裂きのNMクローの「止める」「裂く」の見た目。
// ・FreezeFx：止めた物のまわりの青い時計の輪（目もり 12・残り時間の弧・1 秒ごとにカチッと進む針）と、カチカチの粒。
//   show(pos, radius, total) → 毎フレーム set(remaining) → hide()（時間がもどる：光がはじける）
// ・SlashFx：裂いたときの、光る一本線が左右に開く（中に一瞬、裏側の暗やみ）。play(pos, { angle, length })
// どちらもカメラを向く板（描画 1 回ずつ）＋粒。
import * as THREE from 'three'
import { Particles } from './particles'
import { BILLBOARD_GLSL, clamp01, disposeRoot, unitQuad } from './common'
import { freezeArc, freezeTicked } from './logic'

const bbVert = /* glsl */ `
uniform float uRoll;
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * cvBillboard(position, uRoll);
}
`

const clockFrag = /* glsl */ `
uniform float uA;
uniform float uArc;
uniform float uHand;
uniform float uFlash;
uniform float uWarn;
uniform float uTime;
varying vec2 vUv;
#define PI 3.14159265
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  // 12 時が上、時計回りの角度（0..1）
  float ang = atan(p.x, p.y);
  float a01 = fract(ang / (2.0 * PI) + 1.0);
  vec3 blue = vec3(0.45, 0.85, 1.4);
  vec3 warn = vec3(1.4, 0.75, 0.35);
  vec3 col = mix(blue, warn, uWarn * (0.6 + 0.4 * sin(uTime * 14.0)));
  // うすい内側
  float disc = smoothstep(0.8, 0.76, r) * 0.1;
  // 輪
  float ring = exp(-pow((r - 0.8) / 0.018, 2.0));
  // 目もり（12・太い 4）
  float tick = 0.0;
  for (int i = 0; i < 12; i++) {
    float ta = float(i) / 12.0;
    float da = abs(fract(a01 - ta + 0.5) - 0.5) * 2.0 * PI * r;
    float big = (i == 0 || i == 3 || i == 6 || i == 9) ? 1.0 : 0.0;
    float len = mix(0.06, 0.11, big);
    tick += smoothstep(0.018 + big * 0.008, 0.0, da) * step(0.86, r) * step(r, 0.86 + len);
  }
  // 残り時間の弧（太く明るい）
  float arc = exp(-pow((r - 0.8) / 0.045, 2.0)) * step(a01, uArc);
  // 針（1 秒ごとにカチッと進む）
  float ha = uHand * 2.0 * PI;
  vec2 hd = vec2(sin(ha), cos(ha));
  float along = dot(p, hd);
  float across = abs(p.x * hd.y - p.y * hd.x);
  float hand = smoothstep(0.025, 0.0, across) * step(0.0, along) * step(along, 0.62);
  float hub = smoothstep(0.06, 0.04, r);
  // 現れたとき・時間がもどるときの光の輪
  float flash = exp(-pow((r - 0.8 - (1.0 - uFlash) * 0.18) / 0.08, 2.0)) * uFlash;
  float k = disc + ring * 0.55 + tick * 0.8 + arc * 1.3 + hand * 0.9 + hub * 0.9 + flash * 1.5;
  // 足して光らせる（後ろを暗くしない）
  gl_FragColor = vec4(col * k * uA * step(r, 1.0), 0.0);
}
`

/** 止めた物のまわりの青い時計の輪 */
export class FreezeFx {
  readonly root = new THREE.Group()
  private readonly mesh: THREE.Mesh
  private readonly mat: THREE.ShaderMaterial
  private readonly ticks: Particles
  private pos: THREE.Vector3 | null = null
  private radius = 1
  private total = 4
  private remaining = 0
  private prevRemaining = 0
  private a = 0
  private on = false
  private flash = 0
  private readonly tmp = new THREE.Vector3()
  private readonly v = new THREE.Vector3()

  constructor(parent: THREE.Object3D) {
    this.root.name = 'freezeFx'
    parent.add(this.root)
    this.mat = new THREE.ShaderMaterial({
      vertexShader: bbVert,
      fragmentShader: clockFrag,
      uniforms: { uA: { value: 0 }, uArc: { value: 1 }, uHand: { value: 0 }, uFlash: { value: 0 }, uWarn: { value: 0 }, uTime: { value: 0 }, uRoll: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(unitQuad(), this.mat)
    this.mesh.visible = false
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 8
    this.root.add(this.mesh)
    this.ticks = new Particles({ max: 160, shape: 'diamond', additive: true, renderOrder: 9 })
    this.root.add(this.ticks.points)
  }

  /** 止めた物のまわりに出す。pos は毎フレーム読む（動く物ならそのまま渡す）。radius：輪の半径（m）、total：止める秒 */
  show(pos: THREE.Vector3, radius: number, total: number): void {
    this.pos = pos
    this.radius = radius
    this.total = Math.max(0.01, total)
    this.remaining = total
    this.prevRemaining = total
    this.on = true
    this.flash = 1
    this.mesh.visible = true
    this.burst(18, 1.6)
  }

  /** 残りの秒 */
  set(remaining: number): void {
    this.remaining = Math.max(0, remaining)
  }

  /** 消す（時間がもどる：光の粒がはじける） */
  hide(): void {
    if (!this.on) return
    this.on = false
    this.burst(26, 2.4)
  }

  get visible(): boolean {
    return this.on || this.a > 0.01
  }

  update(dt: number, t: number): void {
    this.a += ((this.on ? 1 : 0) - this.a) * (1 - Math.exp(-dt * (this.on ? 14 : 8)))
    if (this.a < 0.005 && !this.on) {
      this.mesh.visible = false
    }
    if (this.pos) this.mesh.position.copy(this.pos)
    const d = this.radius * 2.5
    this.mesh.scale.set(d, d, 1)
    const u = this.mat.uniforms
    u.uA.value = this.a
    u.uTime.value = t
    const arc = freezeArc(this.remaining, this.total)
    u.uArc.value = arc
    u.uWarn.value = this.remaining > 0 && this.remaining <= 1.2 ? 1 : 0
    // 針は 1 秒ごとに 1 目もり（12 分の 1）ずつ進む
    const elapsed = this.total - this.remaining
    u.uHand.value = Math.floor(elapsed + 1e-4) / 12
    this.flash = Math.max(0, this.flash - dt * 3)
    u.uFlash.value = this.flash
    if (this.on && freezeTicked(this.prevRemaining, this.remaining)) {
      this.burst(10, 1.1)
      this.flash = Math.max(this.flash, 0.35)
    }
    this.prevRemaining = this.remaining
    this.ticks.update(dt)
  }

  /** 輪のまわりからカチカチの粒 */
  private burst(n: number, speed: number): void {
    if (!this.pos) return
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      this.v.set(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 0.6).normalize()
      this.tmp.copy(this.pos).addScaledVector(this.v, this.radius * 0.95)
      this.v.multiplyScalar(speed * (0.5 + Math.random() * 0.6))
      this.ticks.emit(this.tmp, this.v, { life: 0.45 + Math.random() * 0.3, size: 0.07 + Math.random() * 0.05, color: new THREE.Color('#9fe4ff').multiplyScalar(2.2), drag: 4 })
    }
  }

  dispose(): void {
    this.ticks.dispose()
    disposeRoot(this.root)
  }
}

// ------------------------------------------------------------------ 裂く

const slashFrag = /* glsl */ `
uniform float uP;
uniform float uL;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  vec2 q = (vUv - 0.5) * vec2(uL, 1.0);
  float x01 = vUv.x;
  // 0〜0.18：左から右へ線が走る
  float wipe = smoothstep(uP / 0.18 + 0.02, uP / 0.18 - 0.02, x01);
  float taper = pow(max(0.0, 1.0 - pow(abs(q.x) / (uL * 0.5), 2.0)), 0.5);
  float open = clamp((uP - 0.18) / 0.82, 0.0, 1.0);
  float d = open * 0.22 * taper;
  float fade = 1.0 - smoothstep(0.35, 1.0, open);
  float w = (0.012 + 0.02 * (1.0 - open)) * taper;
  float l1 = exp(-pow((q.y - d) / max(0.002, w), 2.0));
  float l2 = exp(-pow((q.y + d) / max(0.002, w), 2.0));
  float glow = exp(-abs(abs(q.y) - d) / 0.06) * 0.4 * taper;
  float gap = step(abs(q.y), d) * step(0.001, d) * taper;
  vec3 col = uColor * (max(l1, l2) * 1.8 + glow) * wipe * fade;
  float a = gap * 0.85 * wipe * fade;
  col += vec3(0.01, 0.0, 0.03) * a;
  gl_FragColor = vec4(col, a);
}
`

export type SlashOpts = {
  /** 画面の中での線の向き（ラジアン。0 = 横、π/2 = 縦。既定はななめ） */
  angle?: number
  /** 線の長さ（m、既定 2） */
  length?: number
  /** 線の色（既定：白青。金にするなら '#ffd27a'） */
  color?: THREE.ColorRepresentation
  /** 秒（既定 0.55） */
  sec?: number
}

type SlashItem = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; sec: number; on: boolean }

/** 裂いたときの、光る一本線が左右に開く（同時に 4 つまで） */
export class SlashFx {
  readonly root = new THREE.Group()
  private readonly pool: SlashItem[] = []
  private readonly sparks: Particles
  private readonly v = new THREE.Vector3()

  constructor(parent: THREE.Object3D) {
    this.root.name = 'slashFx'
    parent.add(this.root)
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: bbVert,
        fragmentShader: slashFrag,
        uniforms: { uP: { value: 0 }, uL: { value: 2 }, uColor: { value: new THREE.Color('#cfeaff').multiplyScalar(2) }, uRoll: { value: 0 } },
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        toneMapped: false,
      })
      const mesh = new THREE.Mesh(unitQuad(), mat)
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.renderOrder = 9
      this.root.add(mesh)
      this.pool.push({ mesh, mat, t: 0, sec: 0.55, on: false })
    }
    this.sparks = new Particles({ max: 200, shape: 'spark', additive: true, renderOrder: 10 })
    this.root.add(this.sparks.points)
  }

  play(pos: THREE.Vector3, o: SlashOpts = {}): void {
    const it = this.pool.find((x) => !x.on) ?? this.pool[0]
    const L = o.length ?? 2
    it.on = true
    it.t = 0
    it.sec = o.sec ?? 0.55
    it.mesh.visible = true
    it.mesh.position.copy(pos)
    it.mesh.scale.set(L, 1.0, 1)
    it.mat.uniforms.uL.value = L
    it.mat.uniforms.uRoll.value = o.angle ?? 0.6
    ;(it.mat.uniforms.uColor.value as THREE.Color).set(o.color ?? '#cfeaff').multiplyScalar(2)
    const c = new THREE.Color(o.color ?? '#dff2ff').multiplyScalar(2.2)
    for (let i = 0; i < 26; i++) {
      this.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 3)
      this.sparks.emit(pos, this.v, { life: 0.35 + Math.random() * 0.3, size: 0.06 + Math.random() * 0.05, color: c, drag: 4 })
    }
  }

  update(dt: number): void {
    for (const it of this.pool) {
      if (!it.on) continue
      it.t += dt
      const p = clamp01(it.t / it.sec)
      it.mat.uniforms.uP.value = p
      if (p >= 1) {
        it.on = false
        it.mesh.visible = false
      }
    }
    this.sparks.update(dt)
  }

  dispose(): void {
    this.sparks.dispose()
    disposeRoot(this.root)
  }
}
