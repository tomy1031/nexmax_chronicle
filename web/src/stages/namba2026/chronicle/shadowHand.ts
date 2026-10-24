// 9 章の大きな影の「影の手」（物語 v7.2）：遠くにいるネクマックスの足もとに赤い輪 → windup 秒で輪が満ちて、
// 地面から黒い影の手（とがった指）がのびる。輪の中にいたら当たる。予告から当たりまで 1.2 秒以上（子どもの物差し）。
// 輪は「当たる広さそのまま」で、外へにげる矢じるしが流れる（2086 年の slamRing と同じ見せ方）。
import * as THREE from 'three'
import { uTime } from '../../../render/materials'

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const frag = /* glsl */ `
uniform float uFill;
uniform float uA;
uniform float uHit;
uniform float uTime;
varying vec2 vUv;
const float R_IN = 0.62;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float pulse = 0.8 + 0.2 * sin(uTime * 16.0);
  float edge = smoothstep(0.04, 0.0, abs(r - R_IN));
  float rimDark = smoothstep(0.035, 0.0, abs(r - R_IN - 0.055));
  float inside = step(r, R_IN);
  float fillR = R_IN * uFill;
  float filled = step(r, fillR);
  float front = smoothstep(0.03, 0.0, abs(r - fillR)) * inside;
  float ang = atan(p.y, p.x);
  float sector = abs(mod(ang + 0.7854, 1.5708) - 0.7854);
  float k = (r - R_IN - 0.09) / (0.97 - R_IN - 0.09);
  float m = k * 1.6 + sector * 2.4 - uTime * 1.3;
  float arrow = smoothstep(0.14, 0.06, abs(fract(m) - 0.5)) * step(sector, 0.34) * smoothstep(0.0, 0.15, k) * smoothstep(1.0, 0.8, k) * (1.0 - uHit);
  vec3 col = vec3(0.85, 0.04, 0.06);
  float a = inside * (0.22 + 0.36 * filled);
  col = mix(col, vec3(1.0, 0.45, 0.4), front);
  a = max(a, front * 0.9);
  col = mix(col, vec3(1.0, 0.12, 0.12) * (0.8 + 0.4 * pulse), edge);
  a = max(a, edge * 0.95);
  col = mix(col, vec3(0.06, 0.0, 0.02), rimDark * (1.0 - edge));
  a = max(a, rimDark * 0.6);
  col = mix(col, vec3(1.0), arrow);
  a = max(a, arrow * 0.9);
  col = mix(col, vec3(0.5, 0.2, 0.8), uHit * inside);
  a = max(a, uHit * inside * 0.7);
  gl_FragColor = vec4(col, a * uA);
}
`

/** 板の半径に対する、当たる半径の割合（frag の R_IN） */
const R_IN = 0.62
const FINGERS = 5

type Slot = {
  ring: THREE.Mesh
  u: { uFill: { value: number }; uA: { value: number }; uHit: { value: number }; uTime: { value: number } }
  hand: THREE.Group
  at: THREE.Vector3
  t: number
  windup: number
  on: boolean
  struck: boolean
}

export class ShadowHands {
  readonly group = new THREE.Group()
  private readonly slots: Slot[] = []
  private readonly geo = new THREE.PlaneGeometry(2, 2)
  private readonly fingerGeo = new THREE.ConeGeometry(0.11, 1.3, 6, 1)
  private readonly handMat = new THREE.MeshStandardMaterial({ color: '#0a0610', emissive: new THREE.Color('#5a1c9a'), emissiveIntensity: 0.6, roughness: 0.6 })
  private readonly mats: THREE.ShaderMaterial[] = []
  /** 当たる半径（m） */
  readonly radius: number

  constructor(radius: number, n = 2) {
    this.radius = radius
    this.group.name = 'v7_shadow_hands'
    this.fingerGeo.translate(0, 0.65, 0)
    for (let i = 0; i < n; i++) {
      const u = { uFill: { value: 0 }, uA: { value: 0 }, uHit: { value: 0 }, uTime }
      const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: u, transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3 })
      this.mats.push(mat)
      const ring = new THREE.Mesh(this.geo, mat)
      ring.rotation.x = -Math.PI / 2
      ring.renderOrder = 7
      ring.visible = false
      ring.frustumCulled = false
      ring.scale.setScalar(radius / R_IN)
      const hand = new THREE.Group()
      for (let k = 0; k < FINGERS; k++) {
        const f = new THREE.Mesh(this.fingerGeo, this.handMat)
        const a = (k / FINGERS) * Math.PI * 2
        f.position.set(Math.cos(a) * radius * 0.35, 0, Math.sin(a) * radius * 0.35)
        f.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45)
        hand.add(f)
      }
      hand.visible = false
      this.group.add(ring, hand)
      this.slots.push({ ring, u, hand, at: new THREE.Vector3(), t: 0, windup: 1, on: false, struck: false })
    }
  }

  /** 何か出ているか */
  get busy(): boolean {
    return this.slots.some((s) => s.on)
  }

  /** 足もと at に赤い輪を出す（windup 秒で満ちて、手がのびる） */
  warn(at: THREE.Vector3, windup: number): void {
    const s = this.slots.find((x) => !x.on) ?? this.slots[0]
    s.on = true
    s.struck = false
    s.t = 0
    s.windup = Math.max(0.3, windup)
    s.at.copy(at)
    s.ring.position.set(at.x, at.y + 0.05, at.z)
    s.ring.visible = true
    s.hand.position.set(at.x, at.y, at.z)
    s.hand.visible = false
  }

  /** 進める。手がのびた瞬間の場所を返す（当たりはステージが決める） */
  update(dt: number): THREE.Vector3[] {
    const hits: THREE.Vector3[] = []
    for (const s of this.slots) {
      if (!s.on) continue
      s.t += dt
      const k = s.t / s.windup
      s.u.uFill.value = Math.min(1, k)
      s.u.uA.value = Math.min(1, s.t / 0.15)
      if (k >= 1 && !s.struck) {
        s.struck = true
        hits.push(s.at)
      }
      // 手：のびる → しばらく → ひっこむ
      const after = s.t - s.windup
      if (after >= 0) {
        s.hand.visible = true
        const up = after < 0.12 ? after / 0.12 : after < 0.45 ? 1 : Math.max(0, 1 - (after - 0.45) / 0.3)
        s.hand.scale.set(1, Math.max(0.01, up), 1)
        s.u.uHit.value = Math.max(0, 1 - after / 0.4)
        s.u.uA.value = Math.max(0, 1 - after / 0.6)
        if (after > 0.8) this.off(s)
      }
    }
    return hits
  }

  clear(): void {
    for (const s of this.slots) this.off(s)
  }

  dispose(): void {
    this.group.removeFromParent()
    for (const m of this.mats) m.dispose()
    this.geo.dispose()
    this.fingerGeo.dispose()
    this.handMat.dispose()
  }

  private off(s: Slot): void {
    s.on = false
    s.ring.visible = false
    s.hand.visible = false
    s.u.uA.value = 0
  }
}
