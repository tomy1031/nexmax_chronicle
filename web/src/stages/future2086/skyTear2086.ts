// 夜空が割れる演出（正体不明の存在＝オルムが空間から出てくる前ぶれ）。
// ・SkyTear：空に貼った 1 枚の板のシェーダ。ガラスが割れるように光る亀裂が中心から広がり（setCrack）、
//   中心の破片が抜け落ちて暗い虚無が開く（setOpen）。setFlash で亀裂ごと強く光る。
//   オルムの板（renderOrder -2）より先に描く（-3）ので、環は虚無の中から押し出てくるように重なる。
// ・画面の閃光（DOM、#app の中＝HUD の後ろ）：裂け目の方向を中心に一瞬白紫に光る
// ・空の色：夜の青 → 不気味な紫・深紅へ一気に（空のドーム・霧・半球光・月明かり・かすみ）。
//   朝に戻すのは applyTimeOfDay（ループの onSwap の setTime('morning')）＋ reset()
// 重い全画面パスは使わない（板 1 枚＋DOM 1 枚）。
import * as THREE from 'three'
import type { PostChain } from '../../render/post'
import { uTime } from '../../render/materials'
import { FUTURE_ENVIRONMENTS, findHaze } from './environment'
import { F } from './layout'

const tearVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const tearFrag = /* glsl */ `
uniform float uTime;
uniform float uCrack;
uniform float uOpen;
uniform float uFlash;
varying vec2 vUv;
const float PI = 3.14159265;
const float NA = 17.0;   // 角度方向の破片の数（放射状のひび）
const float K = 1.9;     // 半径方向（対数）の細かさ（小さいほど破片が放射状に長い）
float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec2 hash2(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1, 0)), u.x), mix(hash1(i + vec2(0, 1)), hash1(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.1 + 1.7; a *= 0.5; } return s; }
vec2 wrapCell(vec2 c) { return vec2(mod(c.x, NA), c.y); }
// ボロノイ（角度は NA で一周）：境界までの距離と、いちばん近い破片の番号
float voro(vec2 x, out vec2 cellId) {
  vec2 n = floor(x); vec2 f = fract(x);
  vec2 mg = vec2(0.0); vec2 mr = vec2(0.0); float md = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.15 + 0.7 * hash2(wrapCell(n + g));
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  cellId = wrapCell(n + mg);
  md = 8.0;
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = 0.15 + 0.7 * hash2(wrapCell(n + g));
    vec2 r = g + o - f;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  return md;
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  // 割れ目の中心をぎざぎざにゆがめる
  vec2 w = vec2(fbm(p * 6.0), fbm(p * 6.0 + 4.3)) - 0.5;
  float rr = r + w.x * 0.03;
  float aa = a + w.y * 0.08 / max(0.15, r);
  vec2 q = vec2((aa / (2.0 * PI) + 0.5) * NA, log(rr + 0.015) * K);
  vec2 id;
  float e = voro(q, id);
  float rnd = hash1(id + 3.1);
  // 破片の中心の半径（対数の格子から戻す）
  float cr = exp((id.y + 0.5) / K) - 0.015;
  // 亀裂の前線（角度ごとにばらつく）
  float front = uCrack * (0.78 + 0.34 * noise(vec2(aa * 2.2, 3.7)));
  float vis = smoothstep(front + 0.02, front - 0.06, cr * (0.85 + 0.3 * rnd));
  // 線の太さ：外ほど太く、中心は細かい
  float lw = 0.035 + 0.02 * rnd;
  float line = smoothstep(lw, 0.0, e) * vis;
  float halo = exp(-e * 9.0) * vis * 0.35;
  float fresh = smoothstep(front - 0.25, front, cr);
  float flick = 0.85 + 0.15 * noise(vec2(uTime * 18.0, id.x));
  vec3 hot = vec3(2.6, 2.3, 3.4);
  vec3 glow = vec3(1.1, 0.35, 2.0);
  // 開いた後は、まわりの亀裂は赤紫の傷あとのように少し落ち着く
  float scar = mix(1.0, 0.45, uOpen);
  hot = mix(hot, vec3(2.6, 0.9, 2.2), uOpen);
  vec3 col = mix(glow, hot, line) * (line * (1.4 + fresh * 2.0) + halo) * flick * scar;
  float alpha = clamp(line + halo, 0.0, 1.0);
  // 開く：中心に近い破片から抜け落ちて、暗い虚無に
  float openR = uOpen * 0.25 * (0.72 + 0.56 * rnd);
  float hole = smoothstep(openR + 0.015, openR - 0.015, cr);
  if (uOpen > 0.0) {
    vec2 sp = vec2(cos(a), sin(a)) * r;
    float sw = fbm(sp * 5.0 + vec2(uTime * 0.12, -uTime * 0.07) + r * 3.0);
    vec3 voidCol = mix(vec3(0.006, 0.0, 0.016), vec3(0.32, 0.02, 0.2), smoothstep(0.45, 0.95, sw) * (1.0 - r * 1.2));
    voidCol += vec3(0.5, 0.05, 0.35) * pow(smoothstep(0.0, openR + 0.05, r), 6.0) * 0.6;
    // 抜けた穴の縁（隣の破片の境目）を赤紫に燃やす
    float edgeHot = smoothstep(0.08, 0.0, e) * smoothstep(openR + 0.12, openR, cr) * (1.0 - hole);
    col = mix(col, voidCol, hole) + vec3(3.0, 0.4, 1.6) * edgeHot * 1.4;
    alpha = max(alpha, hole);
    alpha = max(alpha, edgeHot);
  }
  // 中心の白い閃き（割れ始めの一点）
  float core = exp(-r * 26.0) * smoothstep(0.0, 0.05, uCrack) * (1.0 - uOpen);
  col += vec3(3.0, 2.6, 3.6) * core;
  alpha = max(alpha, clamp(core, 0.0, 1.0));
  // 光ったとき（亀裂ごと明るく、中心ににじむ）
  float fl = uFlash * (exp(-r * 3.5) * 0.9 + line * 1.5);
  col += vec3(2.2, 1.6, 3.0) * fl;
  alpha = max(alpha, clamp(fl, 0.0, 1.0));
  alpha *= smoothstep(1.0, 0.86, r);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`

/** 不気味な空（夜の青から一気に変わる先） */
export const INVADED_SKY = {
  zenith: '#16031f',
  upper: '#46093a',
  horizon: '#a3183e',
  warm: '#ff2f55',
  ground: '#12040e',
  haze: '#5c1434',
  cloudLit: '#a32a64',
  cloudShade: '#2c0824',
  hemiSky: '#8a2a8c',
  hemiGround: '#2c0a18',
  hemiIntensity: 0.62,
  sunColor: '#c45cff',
  sunIntensity: 0.62,
  fogColor: '#3a0c2a',
  fogDensity: 0.003,
  hazeNear: '#4c1238',
  hazeFar: '#3c0a2e',
} as const

type Targets = { scene: THREE.Scene; sky: THREE.Mesh; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; post: PostChain }

const NIGHT = FUTURE_ENVIRONMENTS.night

export class SkyTear {
  readonly mesh: THREE.Mesh
  readonly center: THREE.Vector3
  private readonly u: { uTime: { value: number }; uCrack: { value: number }; uOpen: { value: number }; uFlash: { value: number } }
  private readonly flashEl: HTMLDivElement | null
  private readonly v = new THREE.Vector3()
  private readonly c0 = new THREE.Color()
  private readonly c1 = new THREE.Color()
  private skyK = 0
  private flash = 0

  constructor(root: THREE.Object3D, radius = 250) {
    const O = F.ORUM
    this.center = new THREE.Vector3(O.x, O.y, O.z)
    this.u = { uTime, uCrack: { value: 0 }, uOpen: { value: 0 }, uFlash: { value: 0 } }
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.ShaderMaterial({ vertexShader: tearVert, fragmentShader: tearFrag, uniforms: this.u, transparent: true, depthWrite: false, fog: false }),
    )
    this.mesh.name = 'sky_tear'
    this.mesh.position.copy(this.center)
    this.mesh.lookAt(new THREE.Vector3(0, O.y * 0.35, 0))
    // オルムの板の少し奥（描く順は renderOrder で決める）
    this.mesh.position.addScaledVector(new THREE.Vector3(0, O.y * 0.35, 0).sub(this.center).normalize(), -6)
    this.mesh.renderOrder = -3
    this.mesh.frustumCulled = false
    this.mesh.visible = false
    root.add(this.mesh)
    // 画面の閃光（#app の中、キャンバスの上・HUD の下）
    const app = typeof document !== 'undefined' ? document.getElementById('app') : null
    this.flashEl = app ? document.createElement('div') : null
    if (this.flashEl && app) {
      this.flashEl.style.cssText =
        'position:absolute;inset:0;pointer-events:none;opacity:0;mix-blend-mode:screen;--fx:50%;--fy:30%;' +
        'background:radial-gradient(circle at var(--fx) var(--fy), rgba(255,246,255,0.95), rgba(214,140,255,0.55) 28%, rgba(120,40,170,0.18) 55%, rgba(60,0,80,0) 80%);'
      app.appendChild(this.flashEl)
    }
  }

  get active(): boolean {
    return this.mesh.visible
  }

  setCrack(x: number): void {
    this.u.uCrack.value = Math.min(1.2, Math.max(0, x))
    this.mesh.visible = this.u.uCrack.value > 0.001 || this.u.uOpen.value > 0
  }

  setOpen(x: number): void {
    this.u.uOpen.value = Math.min(1, Math.max(0, x))
  }

  /** 光る（0..1。画面の閃光も同じ強さ） */
  setFlash(x: number): void {
    this.flash = Math.min(1.5, Math.max(0, x))
    this.u.uFlash.value = this.flash
  }

  /** 毎フレーム：閃光の位置を裂け目の方向に合わせる */
  update(camera: THREE.Camera): void {
    const el = this.flashEl
    if (!el) return
    const op = Math.min(0.85, this.flash * 0.75)
    el.style.opacity = op.toFixed(3)
    if (op > 0.002) {
      this.v.copy(this.center).project(camera)
      const x = this.v.z < 1 ? this.v.x * 0.5 + 0.5 : 0.5
      const y = this.v.z < 1 ? -this.v.y * 0.5 + 0.5 : 0.1
      el.style.setProperty('--fx', `${(Math.min(1.2, Math.max(-0.2, x)) * 100).toFixed(1)}%`)
      el.style.setProperty('--fy', `${(Math.min(1.2, Math.max(-0.2, y)) * 100).toFixed(1)}%`)
    }
  }

  /** 空・霧・光の色を夜（0）→ 不気味な色（1）へ */
  setInvaded(k: number, t: Targets): void {
    k = Math.min(1, Math.max(0, k))
    this.skyK = k
    const lerp = (a: THREE.ColorRepresentation, b: THREE.ColorRepresentation) => this.c0.set(a).lerp(this.c1.set(b), k)
    const u = (t.sky.material as THREE.ShaderMaterial).uniforms
    const set = (key: string, a: THREE.ColorRepresentation, b: THREE.ColorRepresentation) => (u[key]?.value as THREE.Color | undefined)?.copy(lerp(a, b))
    const S = NIGHT.sky
    const I = INVADED_SKY
    set('uZenith', S.zenith, I.zenith)
    set('uUpper', S.upper, I.upper)
    set('uHorizon', S.horizon, I.horizon)
    set('uWarm', S.warm, I.warm)
    set('uGround', S.ground, I.ground)
    set('uHaze', S.haze, I.haze)
    set('uCloudLit', S.cloudLit, I.cloudLit)
    set('uCloudShade', S.cloudShade, I.cloudShade)
    t.hemi.color.copy(lerp(NIGHT.hemi.sky, I.hemiSky))
    t.hemi.groundColor.copy(lerp(NIGHT.hemi.ground, I.hemiGround))
    t.hemi.intensity = NIGHT.hemi.intensity + (I.hemiIntensity - NIGHT.hemi.intensity) * k
    t.sun.color.copy(lerp(NIGHT.sunColor, I.sunColor))
    t.sun.intensity = NIGHT.sunIntensity + (I.sunIntensity - NIGHT.sunIntensity) * k
    const fog = t.scene.fog
    if (fog instanceof THREE.FogExp2) {
      fog.color.copy(lerp(NIGHT.fog.color, I.fogColor))
      fog.density = NIGHT.fog.density + (I.fogDensity - NIGHT.fog.density) * k
    }
    const haze = findHaze(t.post)
    if (haze) {
      ;(haze.uniforms.get('hNear')?.value as THREE.Color | undefined)?.copy(lerp(NIGHT.haze.near, I.hazeNear))
      ;(haze.uniforms.get('hFar')?.value as THREE.Color | undefined)?.copy(lerp(NIGHT.haze.far, I.hazeFar))
    }
  }

  get invaded(): number {
    return this.skyK
  }

  /** 演出の最後の状態（夜の途中から読み込んだとき用） */
  setFinal(t: Targets): void {
    this.setCrack(1)
    this.setOpen(1)
    this.setFlash(0)
    this.setInvaded(1, t)
  }

  /** 朝に戻すとき（空の色は applyTimeOfDay が戻す） */
  reset(): void {
    this.u.uCrack.value = 0
    this.u.uOpen.value = 0
    this.setFlash(0)
    this.mesh.visible = false
    this.skyK = 0
    if (this.flashEl) this.flashEl.style.opacity = '0'
  }

  dispose(): void {
    this.flashEl?.remove()
  }
}
