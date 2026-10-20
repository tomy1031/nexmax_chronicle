// 時空裂きのNMクロー（物語 v7 の 10 章から。docs/ステージ設計_v1.md §1・§8.4）。シェルがステージごとに 1 つ作り、rt.chrono で渡す。
// ・止める（freeze）：動いている物に J。爪の先が物を少しだけ裏側（時が流れない所）にさしこみ、数秒その物の時間が止まる。一度に 1 つ
// ・裂く（seam）：空中のゆらぎに J。裏側への切れ目がひらく
// ・裂く（ura）：裏側にしかない物（黒い手・オルムのすじ・トワのランプの糸）に J。まだ時空裂きを持っていないと、すりぬける
// 照準はクローと同じ（ClawTargetDef の chrono_* 型として claw.targets に並べる）。ワイヤーは撃たず、その場に効く。
// 見た目（止めた物の時計の輪・裂いた光の線・すりぬけの波紋・空中の切れ目）はここで作って dispose() で解放する。
import * as THREE from 'three'
import type { ClawSystem } from '../player/clawSystem'
import type { ClawTargetDef, ClawTargetType } from '../player/clawLogic'

export type ChronoKind = 'freeze' | 'seam' | 'ura'

export type ChronoTarget = {
  id: string
  kind: ChronoKind
  /** 照準に出す名前（「回る歯車」「黒い手」など） */
  label: string
  /** 狙う点（毎フレーム読む。ステージが動かしてよい） */
  point: THREE.Vector3
  radius: number
  enabled: boolean
  /** freeze：止める秒数（既定 4） */
  seconds?: number
  /** 射程の上書き（m。既定はクローと同じ 10） */
  range?: number
  /** 遮蔽を調べない（空の大きな物など） */
  noLineOfSight?: boolean
  /** 時空裂きのクローで J（freeze：止まった／seam：切れ目がひらく／ura：裂いた） */
  onAct(): void
  /** freeze：時間が戻った */
  onThaw?(): void
  /** ura：まだ時空裂きを持っていないときに J（すりぬけた） */
  onPassThrough?(): void
}

export type SlitOptions = {
  /** 切れ目の面の向き（省略でカメラの方を向く） */
  normal?: THREE.Vector3
  width?: number
  height?: number
  /** 自動で閉じるまでの秒数（省略で開いたまま。close() で閉じる） */
  seconds?: number
  /** ura：白青のふち（裏側への切れ目）／dawn：金色のふち（夜明けの光の扉） */
  tone?: 'ura' | 'dawn'
}

export type SlitHandle = {
  readonly object: THREE.Object3D
  /** 開き具合（0〜1。ゆっくり近づく） */
  setOpen(k: number): void
  close(): void
  readonly closed: boolean
}

export type ChronoHost = {
  claw: ClawSystem
  toast(text: string, seconds?: number): void
  shake(amount: number): void
}

const KIND_TYPE: Record<ChronoKind, ClawTargetType> = { freeze: 'chrono_freeze', seam: 'chrono_seam', ura: 'chrono_ura' }
const FREEZE_SEC = 4

// ------------------------------------------------------------------ 見た目

const billboardVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/** 止めた物のまわりの時計の輪：残り時間の弧と 12 の目盛り */
const freezeFrag = /* glsl */ `
uniform float uLeft;
uniform float uTime;
uniform float uFade;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.x, p.y); // 0 = 上、時計回り
  float u = fract(a / 6.28318 + 1.0);
  float ring = smoothstep(0.06, 0.0, abs(r - 0.82)) * 0.55;
  float arc = smoothstep(0.08, 0.0, abs(r - 0.9)) * step(u, uLeft);
  float ticks = smoothstep(0.035, 0.0, abs(fract(u * 12.0 + 0.5) - 0.5) / 12.0 * 6.28) * smoothstep(0.1, 0.0, abs(r - 0.7)) * 0.7;
  float hand = smoothstep(0.04, 0.0, abs(dot(p, vec2(cos(uTime * 1.2), -sin(uTime * 1.2))))) * step(r, 0.62) * step(0.0, dot(p, vec2(sin(uTime * 1.2), cos(uTime * 1.2)))) * 0.6;
  float glow = smoothstep(1.0, 0.75, r) * smoothstep(0.55, 0.8, r) * 0.18;
  float v = ring + arc * 1.4 + ticks + hand + glow;
  vec3 col = mix(vec3(0.45, 0.85, 1.4), vec3(1.4, 1.6, 1.8), arc);
  gl_FragColor = vec4(col * v, v * uFade);
}`

/** 裂いた光の線（中心が白く、ふちが青い細い帯） */
const slashFrag = /* glsl */ `
uniform float uK;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float y = abs(vUv.y - 0.5) * 2.0;
  float x = abs(vUv.x - 0.5) * 2.0;
  float core = smoothstep(0.35, 0.0, y) * smoothstep(1.0, 0.6, x);
  float halo = smoothstep(1.0, 0.0, y) * smoothstep(1.0, 0.2, x) * 0.35;
  float a = (core + halo) * (1.0 - uK);
  gl_FragColor = vec4(mix(uColor, vec3(2.0), core) * a, a);
}`

/** すりぬけの波紋（広がって消える紫の輪） */
const rippleFrag = /* glsl */ `
uniform float uK;
varying vec2 vUv;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float rr = 0.25 + uK * 0.7;
  float v = smoothstep(0.08, 0.0, abs(r - rr)) * (1.0 - uK);
  gl_FragColor = vec4(vec3(0.75, 0.45, 1.5) * v, v);
}`

/** 空中の切れ目：まん中はまっくらな裏側（ゆっくり流れる粒）、ふちが光る */
const slitFrag = /* glsl */ `
uniform float uOpen;
uniform float uTime;
uniform vec3 uEdge;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // 上下ほど細いレンズ形の切れ目
  float half_w = uOpen * (1.0 - p.y * p.y) * 0.95;
  float d = abs(p.x) - half_w;
  float inside = step(d, 0.0);
  float edge = smoothstep(0.12, 0.0, abs(d)) * step(0.001, uOpen) * (1.0 - smoothstep(0.92, 1.0, abs(p.y)));
  vec2 g = floor(vec2(p.x * 18.0, p.y * 30.0 + uTime * 1.5));
  float star = step(0.93, hash(g)) * inside * (0.4 + 0.6 * sin(uTime * 3.0 + hash(g) * 6.28));
  vec3 voidCol = vec3(0.02, 0.01, 0.06) + vec3(0.25, 0.3, 0.6) * star;
  vec3 col = voidCol * inside + uEdge * edge * 2.2;
  float a = max(inside * 0.97, edge);
  gl_FragColor = vec4(col, a);
}`

function fxMaterial(frag: string, uniforms: Record<string, THREE.IUniform>, additive = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: billboardVert,
    fragmentShader: frag,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
}

type Pulse = { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; t: number; dur: number; at: THREE.Vector3; roll: number; len: number }

type Slit = {
  mesh: THREE.Mesh
  mat: THREE.ShaderMaterial
  open: number
  target: number
  life: number
  normal: THREE.Vector3 | null
  closed: boolean
  handle: SlitHandle
}

// ------------------------------------------------------------------ 本体

export class ChronoSystem {
  readonly group = new THREE.Group()
  /** 時空裂きのNMクローを持っているか（シェルがフラグ v7_rift_claw から毎フレーム入れる） */
  unlocked = false
  /** 止めた・裂いた・すりぬけたのお知らせ（ステージの台詞・効果音などに） */
  onAct: ((t: ChronoTarget, result: 'froze' | 'cut' | 'pass') => void) | null = null
  private readonly host: ChronoHost
  private readonly entries = new Map<string, { t: ChronoTarget; def: ClawTargetDef }>()
  private frozen: { id: string; left: number; total: number } | null = null
  private readonly ring: THREE.Mesh
  private readonly ringMat: THREE.ShaderMaterial
  private ringFade = 0
  private readonly slashGeo = new THREE.PlaneGeometry(1, 1)
  private readonly slashes: Pulse[] = []
  private readonly ripples: Pulse[] = []
  private readonly slits: Slit[] = []
  private clock = 0
  private passHintAt = -99
  private readonly tmp = new THREE.Vector3()
  private readonly q = new THREE.Quaternion()

  constructor(host: ChronoHost) {
    this.host = host
    this.group.name = 'chrono'
    this.ringMat = fxMaterial(freezeFrag, { uLeft: { value: 1 }, uTime: { value: 0 }, uFade: { value: 0 } })
    this.ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.ringMat)
    this.ring.visible = false
    this.ring.renderOrder = 10
    this.group.add(this.ring)
    for (let i = 0; i < 3; i++) {
      const mat = fxMaterial(slashFrag, { uK: { value: 1 }, uColor: { value: new THREE.Color(0.5, 1.2, 2.2) } })
      const mesh = new THREE.Mesh(this.slashGeo, mat)
      mesh.visible = false
      mesh.renderOrder = 11
      this.group.add(mesh)
      this.slashes.push({ mesh, mat, t: 1, dur: 0.4, at: new THREE.Vector3(), roll: 0, len: 2 })
    }
    for (let i = 0; i < 2; i++) {
      const mat = fxMaterial(rippleFrag, { uK: { value: 1 } })
      const mesh = new THREE.Mesh(this.slashGeo, mat)
      mesh.visible = false
      mesh.renderOrder = 11
      this.group.add(mesh)
      this.ripples.push({ mesh, mat, t: 1, dur: 0.7, at: new THREE.Vector3(), roll: 0, len: 2 })
    }
  }

  // ---------------------------------------------------------------- ステージから

  /** 対象を足す（同じ id なら置きかえる） */
  add(t: ChronoTarget): void {
    this.remove(t.id)
    const def: ClawTargetDef = {
      id: `chrono:${t.id}`,
      type: KIND_TYPE[t.kind],
      label: t.label,
      point: t.point,
      radius: t.radius,
      enabled: false,
      noLineOfSight: t.noLineOfSight,
      range: t.range,
    }
    this.entries.set(t.id, { t, def })
    this.host.claw.targets.push(def)
    this.syncDef(t, def)
  }

  remove(id: string): void {
    const e = this.entries.get(id)
    if (!e) return
    const i = this.host.claw.targets.indexOf(e.def)
    if (i >= 0) this.host.claw.targets.splice(i, 1)
    this.entries.delete(id)
    if (this.frozen?.id === id) this.thaw()
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  /** いま止めている対象の id */
  get frozenId(): string | null {
    return this.frozen?.id ?? null
  }

  /** 止めている物の残りの秒数（止めていなければ 0） */
  get frozenLeft(): number {
    return this.frozen?.left ?? 0
  }

  /** 止めている物の時間を戻す（ステージの都合で早めに戻すとき） */
  thaw(): void {
    const f = this.frozen
    if (!f) return
    this.frozen = null
    this.entries.get(f.id)?.t.onThaw?.()
  }

  /** 空中の切れ目の見た目（裏側への入口・夜明けの光の扉） */
  slit(pos: THREE.Vector3, o: SlitOptions = {}): SlitHandle {
    const w = o.width ?? 1.6
    const h = o.height ?? 3.2
    const edge = o.tone === 'dawn' ? new THREE.Color(1.6, 1.15, 0.45) : new THREE.Color(0.7, 1.15, 1.8)
    const mat = fxMaterial(slitFrag, { uOpen: { value: 0 }, uTime: { value: 0 }, uEdge: { value: edge } }, false)
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
    mesh.position.copy(pos)
    mesh.renderOrder = 9
    this.group.add(mesh)
    const s: Slit = {
      mesh,
      mat,
      open: 0,
      target: 1,
      life: o.seconds ?? Infinity,
      normal: o.normal ? o.normal.clone().normalize() : null,
      closed: false,
      handle: null as unknown as SlitHandle,
    }
    s.handle = {
      object: mesh,
      setOpen: (k: number) => {
        if (!s.closed) s.target = Math.max(0, Math.min(1, k))
      },
      close: () => {
        s.closed = true
        s.target = 0
      },
      get closed() {
        return s.closed
      },
    }
    this.slits.push(s)
    this.host.shake(0.15)
    return s.handle
  }

  // ---------------------------------------------------------------- シェルから

  /** J：照準が chrono_* の対象のとき。効いたら true */
  act(def: ClawTargetDef): boolean {
    const id = def.id.startsWith('chrono:') ? def.id.slice(7) : def.id
    const e = this.entries.get(id)
    if (!e) return false
    this.syncDef(e.t, e.def)
    if (!e.def.enabled) return false
    const t = e.t
    if (t.kind === 'ura' && !this.unlocked) {
      // すりぬける：手応えだけ残す
      this.pulse(this.ripples, t.point, 0.7, 0, Math.max(1.6, t.radius * 3))
      if (this.passHintAt + 5 < this.clock) {
        this.passHintAt = this.clock
        this.host.toast('すりぬけた……！ さわることさえ、できない', 2.6)
      }
      t.onPassThrough?.()
      this.onAct?.(t, 'pass')
      return true
    }
    if (!this.unlocked) return false
    if (t.kind === 'freeze') {
      if (this.frozen && this.frozen.id !== t.id) this.thaw()
      const total = t.seconds ?? FREEZE_SEC
      this.frozen = { id: t.id, left: total, total }
      this.ringFade = 0
      this.pulse(this.slashes, t.point, 0.3, Math.random() * Math.PI, Math.max(1.2, t.radius * 2.2))
      t.onAct()
      this.onAct?.(t, 'froze')
      return true
    }
    // 裂く（seam・ura）
    this.pulse(this.slashes, t.point, 0.42, -0.6 + Math.random() * 0.4, Math.max(2.2, t.radius * 3.4))
    this.host.shake(0.22)
    t.onAct()
    this.onAct?.(t, 'cut')
    return true
  }

  /** 毎フレーム（一時停止中は dt = 0） */
  update(dt: number, camera: THREE.Camera): void {
    this.clock += dt
    for (const e of this.entries.values()) this.syncDef(e.t, e.def)
    // 止めている物
    const f = this.frozen
    if (f) {
      f.left -= dt
      const e = this.entries.get(f.id)
      if (!e || f.left <= 0) this.thaw()
      else {
        this.ring.visible = true
        this.ring.position.copy(e.t.point)
        this.ring.quaternion.copy(camera.quaternion)
        this.ring.scale.setScalar(Math.max(0.6, e.t.radius * 1.35))
        this.ringFade = Math.min(1, this.ringFade + dt * 6)
        this.ringMat.uniforms.uLeft.value = f.left / f.total
        this.ringMat.uniforms.uTime.value = this.clock
        this.ringMat.uniforms.uFade.value = this.ringFade * (f.left < 1 ? 0.5 + 0.5 * Math.sin(this.clock * 18) : 1)
      }
    }
    if (!this.frozen) this.ring.visible = false
    for (const p of this.slashes) this.stepPulse(p, dt, camera, true)
    for (const p of this.ripples) this.stepPulse(p, dt, camera, false)
    // 切れ目
    for (let i = this.slits.length - 1; i >= 0; i--) {
      const s = this.slits[i]
      s.life -= dt
      if (s.life <= 0 && !s.closed) s.handle.close()
      s.open += (s.target - s.open) * Math.min(1, dt * (s.closed ? 6 : 4))
      s.mat.uniforms.uOpen.value = s.open
      s.mat.uniforms.uTime.value = this.clock
      if (s.normal) {
        this.tmp.copy(s.mesh.position).add(s.normal)
        s.mesh.lookAt(this.tmp)
      } else {
        // 縦のまま、カメラの方を向く
        this.tmp.copy(camera.position).setY(s.mesh.position.y)
        s.mesh.lookAt(this.tmp)
      }
      if (s.closed && s.open < 0.01) {
        this.group.remove(s.mesh)
        s.mesh.geometry.dispose()
        s.mat.dispose()
        this.slits.splice(i, 1)
      }
    }
  }

  dispose(): void {
    this.entries.clear()
    this.ring.geometry.dispose()
    this.ringMat.dispose()
    this.slashGeo.dispose()
    for (const p of [...this.slashes, ...this.ripples]) p.mat.dispose()
    for (const s of this.slits) {
      s.mesh.geometry.dispose()
      s.mat.dispose()
    }
    this.slits.length = 0
  }

  // ---------------------------------------------------------------- 内部

  private syncDef(t: ChronoTarget, def: ClawTargetDef): void {
    // freeze・seam は時空裂きを持ってから狙える。ura はいつでも狙える（持っていなければ、すりぬける）。止めている物は狙わない
    def.enabled = t.enabled && (t.kind === 'ura' || this.unlocked) && this.frozen?.id !== t.id
    def.label = t.label
  }

  private pulse(pool: Pulse[], at: THREE.Vector3, dur: number, roll: number, len: number): void {
    let p = pool[0]
    for (const x of pool) if (x.t >= x.dur) p = x
    p.t = 0
    p.dur = dur
    p.at.copy(at)
    p.roll = roll
    p.len = len
    p.mesh.visible = true
  }

  private stepPulse(p: Pulse, dt: number, camera: THREE.Camera, slash: boolean): void {
    if (p.t >= p.dur) {
      p.mesh.visible = false
      return
    }
    p.t += dt
    const k = Math.min(1, p.t / p.dur)
    p.mesh.position.copy(p.at)
    p.mesh.quaternion.copy(camera.quaternion)
    if (slash) {
      // 線が伸びてから消える
      p.mesh.quaternion.multiply(this.q.setFromAxisAngle(this.tmp.set(0, 0, 1), p.roll))
      const grow = Math.min(1, k * 3)
      p.mesh.scale.set(p.len * grow, 0.22 * (1 - k * 0.6), 1)
      p.mat.uniforms.uK.value = Math.max(0, (k - 0.3) / 0.7)
    } else {
      p.mesh.scale.setScalar(p.len)
      p.mat.uniforms.uK.value = k
    }
    if (p.t >= p.dur) p.mesh.visible = false
  }
}
