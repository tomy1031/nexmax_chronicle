// 黒い手のふりおろしの予告（物語 v7.1 の 3 回目の直し：「敵は避け方がわかりにくい」）。
// 手がふりおろす所の地面に、当たる広さそのままの赤い輪を出す。輪の中は、たたく瞬間に向かって外へ満ちていき、
// 満ちきった時に手が落ちる。輪のすぐ外には、外を向いた矢印（「ここから外へにげる」）が流れる。
// 共有の BlackHands の小さな予告の輪（オレンジ）にかさねて、ステージの側で出す（当たる半径と同じ大きさ）。
import * as THREE from 'three'
import { uTime } from '../../../render/materials'

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
// 板の半径 1 の所 = 板のふち。輪は R_IN（当たる半径）に、矢印はその外（R_IN〜1）に
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
  float pulse = 0.75 + 0.25 * sin(uTime * 16.0);
  // ふちの太い輪（当たる所の境め）
  float edge = smoothstep(0.035, 0.0, abs(r - R_IN));
  // 中：うすい赤と、満ちていく前の線（たたく瞬間に、ふちにとどく）
  float inside = step(r, R_IN);
  float fillR = R_IN * uFill;
  float filled = step(r, fillR) * (0.32 + 0.25 * uFill);
  float front = smoothstep(0.03, 0.0, abs(r - fillR)) * inside * 0.9;
  // 外を向いた矢印（4 方向の山形。外へ流れる）
  float ang = atan(p.y, p.x);
  float sector = abs(mod(ang + 0.7854, 1.5708) - 0.7854);
  float k = (r - R_IN - 0.06) / (0.97 - R_IN - 0.06);
  float m = k * 1.6 + sector * 2.4 - uTime * 1.3;
  float arrow = smoothstep(0.13, 0.05, abs(fract(m) - 0.5)) * step(sector, 0.34) * smoothstep(0.0, 0.15, k) * smoothstep(1.0, 0.8, k);
  float a = ((edge * pulse) * 1.4 + filled * inside + front + arrow * 0.9 * (1.0 - uHit)) * uA;
  a += uHit * smoothstep(R_IN + 0.05, 0.0, r) * 0.9 * uA;
  vec3 col = mix(vec3(2.6, 0.18, 0.22), vec3(3.0, 1.4, 0.4), arrow * (1.0 - inside));
  gl_FragColor = vec4(col * a, a);
}
`

type Ring = { id: string; mesh: THREE.Mesh; u: { uFill: { value: number }; uA: { value: number }; uHit: { value: number } }; t: number; windup: number; on: boolean }

/** 板の半径に対する、当たる半径の割合（frag の R_IN） */
const R_IN = 0.62

export class SlamRings {
  private readonly rings: Ring[] = []
  private readonly geo = new THREE.PlaneGeometry(2, 2)
  private readonly mats: THREE.ShaderMaterial[] = []

  constructor(root: THREE.Object3D, n = 4) {
    for (let i = 0; i < n; i++) {
      const u = { uFill: { value: 0 }, uA: { value: 0 }, uHit: { value: 0 }, uTime }
      const mat = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -2 })
      this.mats.push(mat)
      const mesh = new THREE.Mesh(this.geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 7
      mesh.visible = false
      mesh.frustumCulled = false
      mesh.name = 'slam_ring'
      root.add(mesh)
      this.rings.push({ id: '', mesh, u, t: 0, windup: 1, on: false })
    }
  }

  /** ふりおろしの始まり：at（地面）に半径 radius（当たる半径）の輪を出し、windup 秒で満ちる */
  show(id: string, at: THREE.Vector3, radius: number, windup: number): void {
    const r = this.rings.find((x) => x.id === id) ?? this.rings.find((x) => !x.on) ?? this.rings[0]
    r.id = id
    r.on = true
    r.t = 0
    r.windup = Math.max(0.2, windup)
    r.mesh.position.set(at.x, at.y + 0.05, at.z)
    r.mesh.scale.setScalar(radius / R_IN)
    r.mesh.visible = true
  }

  hide(id: string): void {
    const r = this.rings.find((x) => x.id === id && x.on)
    if (r) this.off(r)
  }

  clear(): void {
    for (const r of this.rings) this.off(r)
  }

  update(dt: number): void {
    for (const r of this.rings) {
      if (!r.on) continue
      r.t += dt
      const k = r.t / r.windup
      r.u.uFill.value = Math.min(1, k)
      // 満ちきったら、たたいた光（0.35 秒）で消える
      const after = r.t - r.windup - 0.22
      r.u.uHit.value = after > 0 ? Math.max(0, 1 - after / 0.35) : 0
      r.u.uA.value = Math.min(1, r.t / 0.15) * (after > 0 ? Math.max(0, 1 - after / 0.35) : 1)
      if (after > 0.35) this.off(r)
    }
  }

  dispose(): void {
    for (const r of this.rings) r.mesh.removeFromParent()
    for (const m of this.mats) m.dispose()
    this.geo.dispose()
  }

  private off(r: Ring): void {
    r.on = false
    r.id = ''
    r.mesh.visible = false
  }
}
