// 空中の縦の切れ目（時空裂きのNMクロー・源兵衛の実演・裏側への扉）と、夜明けの光の扉（金のふち）。
// ・ふちが白青く光り、中はまっくらな裏側で、小さな粒がただよう
// ・seam()：まだ開いていない「ゆらぎ」（うすく光る縦のすじ）。open() で切れ目になる
// ・open()：光る一本の線 → 縦にのびる → 左右へ開く。close() で閉じて消える。sec を渡すと自動で閉じる
// ・setStability(1)：ふちのゆれが止まる（ソラのわっかと共鳴レンズでささえたとき）
// 1 つの切れ目が板 1 枚（描画 1 回）。いくつでも同時に出せる。粒は全部で 1 回。
import * as THREE from 'three'
import { Particles } from './particles'
import { BILLBOARD_GLSL, NOISE_GLSL, approach, clamp01, disposeRoot, easeOut, unitQuad } from './common'

export type SlitVariant = 'rift' | 'dawn'
export type SlitState = 'seam' | 'opening' | 'open' | 'closing' | 'closed'

export type SlitOpts = {
  /** 切れ目の面の向き（省略すると Y 軸だけ回っていつもカメラを向く） */
  normal?: THREE.Vector3 | null
  /** 開いたときの幅（m、既定 1.2） */
  width?: number
  /** 高さ（m、既定 2.6） */
  height?: number
  /** この秒数のあと自動で閉じる（省略で開いたまま） */
  sec?: number
  /** rift：白青のふち（時空裂き）/ dawn：金のふち（夜明けの光の扉） */
  variant?: SlitVariant
}

const vertFixed = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const vertBill = /* glsl */ `
varying vec2 vUv;
${BILLBOARD_GLSL}
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4(cvBillboardY(position), 1.0);
}
`

const frag = /* glsl */ `
uniform float uTime;
uniform vec2 uSize;
uniform float uW;
uniform float uH;
uniform float uLine;
uniform float uSeam;
uniform float uWob;
uniform float uA;
uniform float uSeed;
uniform float uDawn;
varying vec2 vUv;
${NOISE_GLSL}
float stars(vec2 p, float t, float seed) {
  vec2 g = floor(p);
  vec2 f = fract(p);
  float h = cvHash(g + seed);
  vec2 c = vec2(cvHash(g + 7.1 + seed), cvHash(g + 3.7 + seed));
  c.y = fract(c.y + t * (0.05 + h * 0.08));
  float d = length(f - c);
  float tw = 0.6 + 0.4 * sin(t * (2.0 + h * 4.0) + h * 30.0);
  return smoothstep(0.08, 0.0, d) * step(0.55, h) * tw;
}
void main() {
  vec2 q = (vUv - 0.5) * uSize;
  float hh = max(0.001, uH * 0.5);
  float yn = q.y / hh;
  float inY = step(abs(yn), 1.0);
  float prof = pow(max(0.0, 1.0 - yn * yn), 0.65);
  float wob = (cvNoise(vec2(q.y * 3.5 + uTime * 2.2, uSeed)) - 0.5) * 0.16 * uWob + (cvNoise(vec2(q.y * 9.0 - uTime * 3.0, uSeed + 4.0)) - 0.5) * 0.05 * uWob;
  float hw = max(0.0, uW * 0.5 * prof + wob * prof * step(0.01, uW));
  float dx = abs(q.x) - hw;
  float inside = (1.0 - smoothstep(-0.012, 0.012, dx)) * inY * step(0.002, hw);
  // ふちの光（内外の両側）と、外へのにじみ
  float edge = exp(-abs(dx) / 0.03) * prof * step(abs(yn), 1.05) * step(0.002, hw);
  // 外へのにじみ（切れ目の外だけ。板のふちでは 0 に）
  float win = smoothstep(uSize.x * 0.5, uSize.x * 0.3, abs(q.x)) * smoothstep(uSize.y * 0.5, uSize.y * 0.35, abs(q.y));
  float halo = exp(-max(dx, 0.0) / 0.22) * step(0.0, dx) * prof * 0.45 * step(0.002, hw) * win;
  // 開くとき・閉じるときの一本の線、まだ開いていないゆらぎ
  float line = exp(-abs(q.x) / 0.018) * pow(max(0.0, 1.0 - yn * yn), 0.4);
  float shimmer = 0.55 + 0.45 * sin(uTime * 3.0 + q.y * 2.0) * sin(uTime * 1.7 - q.y * 5.0);
  float seamGlow = exp(-abs(q.x + (cvNoise(vec2(q.y * 4.0, uTime * 1.5)) - 0.5) * 0.06) / 0.03) * pow(max(0.0, 1.0 - yn * yn), 0.5) * shimmer;
  vec3 edgeC = mix(vec3(0.75, 0.92, 1.25), vec3(1.4, 1.0, 0.45), uDawn) * 2.0;
  vec3 haloC = mix(vec3(0.3, 0.55, 1.0), vec3(1.0, 0.62, 0.22), uDawn);
  // 中：まっくらな裏側（紫紺のもや）と、ただよう粒
  vec2 iq = q * 4.0 + vec2(0.0, uSeed * 3.0);
  float neb = cvFbm(q * 1.2 + vec2(uTime * 0.05, -uTime * 0.03) + uSeed);
  vec3 voidC = mix(vec3(0.008, 0.004, 0.025), vec3(0.07, 0.035, 0.16), neb * neb);
  voidC = mix(voidC, vec3(0.06, 0.03, 0.02), uDawn * 0.3);
  float st = stars(iq, uTime, uSeed) + stars(iq * 1.7 + 11.0, uTime * 0.7, uSeed + 2.0) * 0.6;
  vec3 starC = mix(vec3(0.7, 0.85, 1.4), vec3(1.4, 1.1, 0.6), uDawn);
  vec3 inner = voidC + starC * st;
  // 内側のふちの近くは少し明るく（奥行き）
  inner += haloC * exp(-abs(dx) / 0.08) * 0.35 * inside;
  vec3 col = inner * inside + edgeC * edge * (1.0 - inside * 0.25) + haloC * halo + edgeC * line * uLine * inY + edgeC * seamGlow * uSeam * 0.35;
  float a = inside;
  gl_FragColor = vec4(col * uA, a * uA);
}
`

export class Slit {
  readonly pos: THREE.Vector3
  readonly mesh: THREE.Mesh
  state: SlitState
  /** 開き具合（0..1） */
  k = 0
  private readonly mat: THREE.ShaderMaterial
  private targetW: number
  private curW = 0
  private wSpeed = 1
  private h: number
  private curH = 0
  private st = 0
  private life: number | null
  private stability = 0
  private maxW: number
  /** Y 軸だけ回ってカメラを向く */
  readonly billboard: boolean
  /** 閉じきったら SlitFx が片づける */
  dead = false

  constructor(pos: THREE.Vector3, o: SlitOpts, seamOnly: boolean, seed: number) {
    this.pos = pos.clone()
    this.targetW = o.width ?? 1.2
    this.h = o.height ?? 2.6
    this.life = o.sec ?? null
    this.maxW = Math.max(this.targetW, 0.6) * 1.6 + 1.2
    const billboard = !o.normal
    this.billboard = billboard
    this.mat = new THREE.ShaderMaterial({
      vertexShader: billboard ? vertBill : vertFixed,
      fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: new THREE.Vector2(this.maxW, this.h + 0.8) },
        uW: { value: 0 },
        uH: { value: this.h },
        uLine: { value: 0 },
        uSeam: { value: seamOnly ? 1 : 0 },
        uWob: { value: 1 },
        uA: { value: 0 },
        uSeed: { value: seed },
        uDawn: { value: o.variant === 'dawn' ? 1 : 0 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      toneMapped: false,
    })
    this.mesh = new THREE.Mesh(unitQuad(), this.mat)
    this.mesh.name = 'slit'
    this.mesh.position.copy(pos)
    this.mesh.scale.set(this.maxW, this.h + 0.8, 1)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    if (o.normal) this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), o.normal.clone().normalize())
    this.state = seamOnly ? 'seam' : 'opening'
    if (seamOnly) this.curH = this.h
  }

  get width(): number {
    return this.curW
  }

  get height(): number {
    return this.h
  }

  get isOpen(): boolean {
    return this.state === 'open' || this.state === 'opening'
  }

  /** ゆらぎ（seam）から開く。幅・自動で閉じる秒も変えられる */
  open(width?: number, sec?: number): void {
    if (width !== undefined) this.targetW = width
    if (sec !== undefined) this.life = sec
    if (this.state === 'seam' || this.state === 'closed' || this.state === 'closing') {
      this.state = 'opening'
      this.st = 0
      this.dead = false
    }
  }

  /** 開いた幅を変える（sec 秒でなめらかに） */
  setWidth(w: number, sec = 0.4): void {
    this.targetW = Math.max(0, w)
    this.wSpeed = 1 / Math.max(0.05, sec)
    const need = Math.max(this.targetW, 0.6) * 1.6 + 1.2
    if (need > this.maxW) {
      this.maxW = need
      this.mat.uniforms.uSize.value.x = need
      this.mesh.scale.x = need
    }
  }

  setHeight(h: number): void {
    this.h = h
    this.curH = Math.min(this.curH, h)
    this.mat.uniforms.uSize.value.y = h + 0.8
    this.mesh.scale.y = h + 0.8
  }

  /** ふちのゆれ（0 = ゆれる、1 = ぴたりと止まる） */
  setStability(k: number): void {
    this.stability = clamp01(k)
  }

  /** 閉じて消える */
  close(): void {
    if (this.state === 'closing' || this.state === 'closed') return
    this.state = 'closing'
    this.st = 0
  }

  setPosition(p: THREE.Vector3): void {
    this.pos.copy(p)
    this.mesh.position.copy(p)
  }

  /** 1 フレーム進める。返り値は「いま光の粒を出すとよい強さ」 */
  step(dt: number, t: number): number {
    this.st += dt
    const u = this.mat.uniforms
    u.uTime.value = t
    u.uWob.value = approach(u.uWob.value, 1 - this.stability, 6, dt)
    let emit = 0
    switch (this.state) {
      case 'seam':
        u.uA.value = approach(u.uA.value, 1, 4, dt)
        u.uSeam.value = 1
        u.uLine.value = 0
        this.curW = 0
        this.curH = this.h
        emit = 0.15
        break
      case 'opening': {
        u.uSeam.value = approach(u.uSeam.value, 0, 8, dt)
        u.uA.value = 1
        // 0〜0.18 秒：線が縦にのびる → そのあと左右に開く
        const a = clamp01(this.st / 0.18)
        this.curH = Math.max(this.curH, this.h * easeOut(a))
        u.uLine.value = Math.min(1, this.st * 10) * (1 - clamp01((this.st - 0.25) / 0.4) * 0.8)
        if (this.st > 0.12) this.curW = Math.min(this.targetW, this.curW + dt * this.targetW * 3.2)
        if (this.curW >= this.targetW - 1e-3 && this.st > 0.4) {
          this.state = 'open'
          this.st = 0
        }
        emit = 1
        break
      }
      case 'open': {
        u.uLine.value = approach(u.uLine.value, 0, 7, dt)
        const d = this.targetW - this.curW
        this.curW += Math.sign(d) * Math.min(Math.abs(d), dt * this.wSpeed * Math.max(0.3, Math.abs(d)) * 2.5)
        if (this.life !== null && this.st >= this.life) this.close()
        emit = 0.5
        break
      }
      case 'closing': {
        this.curW = Math.max(0, this.curW - dt * Math.max(1.5, this.curW * 5))
        u.uLine.value = this.curW <= 0 ? Math.max(0, 1 - (this.st - 0.2) * 4) : 1
        if (this.curW <= 0) this.curH = Math.max(0, this.curH - dt * this.h * 4)
        if (this.curH <= 0.01 && this.curW <= 0) {
          this.state = 'closed'
          u.uA.value = 0
          this.dead = true
        }
        emit = this.curW > 0 ? 0.6 : 0
        break
      }
      case 'closed':
        u.uA.value = 0
        break
    }
    u.uW.value = this.curW
    u.uH.value = Math.max(0.001, this.curH)
    this.k = this.targetW > 0 ? clamp01(this.curW / this.targetW) : 0
    return emit
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mat.dispose()
  }
}

export class SlitFx {
  readonly root = new THREE.Group()
  private readonly list: Slit[] = []
  private readonly motes: Particles
  private seed = 1
  private readonly tmp = new THREE.Vector3()
  private readonly vel = new THREE.Vector3()
  private readonly right = new THREE.Vector3()

  constructor(parent: THREE.Object3D) {
    this.root.name = 'slits'
    parent.add(this.root)
    this.motes = new Particles({ max: 400, shape: 'soft', additive: true, renderOrder: 4 })
    this.root.add(this.motes.points)
  }

  /** 切れ目を開く（光る線 → 縦にのびる → 左右に開く） */
  open(pos: THREE.Vector3, normal: THREE.Vector3 | null = null, width = 1.2, height = 2.6, sec?: number, variant: SlitVariant = 'rift'): Slit {
    const s = new Slit(pos, { normal, width, height, sec, variant }, false, this.seed++ * 1.37)
    this.add(s)
    return s
  }

  /** まだ開いていない「ゆらぎ」（うすく光る縦のすじ）。返り値の open() で開く */
  seam(pos: THREE.Vector3, o: SlitOpts = {}): Slit {
    const s = new Slit(pos, o, true, this.seed++ * 1.37)
    this.add(s)
    return s
  }

  /** 夜明けの光の扉（金のふち）。open と同じ */
  dawnDoor(pos: THREE.Vector3, normal: THREE.Vector3 | null = null, width = 2.2, height = 4.2, sec?: number): Slit {
    return this.open(pos, normal, width, height, sec, 'dawn')
  }

  get slits(): readonly Slit[] {
    return this.list
  }

  closeAll(): void {
    for (const s of this.list) s.close()
  }

  update(dt: number, t: number, camera?: THREE.Camera): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i]
      const emit = s.step(dt, t)
      if (emit > 0 && dt > 0) this.emitMotes(s, emit, dt, camera)
      if (s.dead) {
        s.dispose()
        this.list.splice(i, 1)
      }
    }
    this.motes.update(dt)
  }

  dispose(): void {
    for (const s of this.list) s.dispose()
    this.list.length = 0
    this.motes.dispose()
    disposeRoot(this.root)
  }

  private add(s: Slit): void {
    this.list.push(s)
    this.root.add(s.mesh)
  }

  /** ふちから光の粒がこぼれる */
  private emitMotes(s: Slit, k: number, dt: number, camera?: THREE.Camera): void {
    const dawn = (s.mesh.material as THREE.ShaderMaterial).uniforms.uDawn.value > 0.5
    const n = k * dt * (12 + s.width * 18)
    let count = Math.floor(n)
    if (Math.random() < n - count) count++
    if (!count) return
    // 切れ目の横の向き（カメラを向くときはカメラの右）
    if (camera && s.billboard) {
      this.right.set(1, 0, 0).applyQuaternion(camera.quaternion)
      this.right.y = 0
      if (this.right.lengthSq() < 1e-6) this.right.set(1, 0, 0)
      this.right.normalize()
    } else this.right.set(1, 0, 0).applyQuaternion(s.mesh.quaternion)
    for (let i = 0; i < count; i++) {
      const yn = (Math.random() * 2 - 1) * 0.9
      const prof = Math.pow(Math.max(0, 1 - yn * yn), 0.65)
      const side = Math.random() < 0.5 ? -1 : 1
      const off = (s.width * 0.5 * prof + 0.02) * side
      this.tmp.copy(s.pos).addScaledVector(this.right, off)
      this.tmp.y += (yn * s.height) / 2
      this.vel.copy(this.right).multiplyScalar(side * (0.15 + Math.random() * 0.3))
      this.vel.y = 0.1 + Math.random() * 0.25
      this.motes.emit(this.tmp, this.vel, {
        life: 0.8 + Math.random() * 0.8,
        size: 0.03 + Math.random() * 0.04,
        color: dawn ? new THREE.Color('#ffd27a').multiplyScalar(2) : new THREE.Color('#bfe6ff').multiplyScalar(2),
        drag: 1.2,
        gravity: -0.1,
      })
    }
  }
}
