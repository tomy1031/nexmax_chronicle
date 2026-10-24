// ボス戦の柵：ボスが出ている間、戦う場所の外（家の中・路地の奥・水の上など）へ行けないようにする。
// ・見えない壁の当たり判定を、形のふちに沿ってあとから足す（physics.add）。カメラと視線は通す。
// ・ふちに、下から上へうすくなる光の幕を出す（近づくと明るく）。「ここから先は行けない」が見てわかるように。
// ・ワイヤーで引っぱられたり、すき間をぬけたりして外に出たら、内側へもどす（update）。
// 使い方：fence.close(rectPoints(...)) で閉じる → 毎フレーム fence.update(dt, rt.player) → 戦いが終わったら fence.open()。
import * as THREE from 'three'
import type { BoxCollider } from '../../world/colliders'
import type { Physics } from '../../player/physics'
import { uTime } from '../../render/materials'
import { pullInside, type XZ } from './arenaLogic'

export { circlePoints, rectPoints, insidePoly, pullInside, type XZ } from './arenaLogic'

export type ArenaOptions = {
  /** 床の高さ（幕の下のはし・壁の下のはし） */
  y: number
  /** 壁の高さ（既定 6 m。ジャンプやワイヤーで上をこえないように） */
  height?: number
  /** 幕の高さ（既定 2.2 m） */
  curtain?: number
  /** 幕の色（既定 赤むらさき） */
  color?: THREE.ColorRepresentation
  /** 幕を出さない（壁だけ） */
  hidden?: boolean
}

type MinimalPlayer = { position: THREE.Vector3; teleport(p: THREE.Vector3, facing?: number): void }

const vert = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`
const frag = /* glsl */ `
uniform vec3 uColor;
uniform float uA;
uniform float uTime;
uniform vec3 uPlayer;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float fade = pow(1.0 - vUv.y, 1.6);
  float lines = 0.55 + 0.45 * smoothstep(0.35, 0.5, abs(fract(vUv.y * 7.0 - uTime * 0.6) - 0.5));
  float stripes = 0.75 + 0.25 * step(0.5, fract(vUv.x * 0.8 + uTime * 0.25));
  float near = 1.0 - smoothstep(1.0, 5.5, distance(vWorld.xz, uPlayer.xz));
  float base = smoothstep(0.0, 0.06, vUv.y) * (1.0 - smoothstep(0.06, 0.14, vUv.y));
  float a = (fade * (0.16 + 0.5 * near) * lines * stripes + base * (0.5 + 0.4 * near)) * uA;
  gl_FragColor = vec4(uColor * (1.0 + near), a);
}
`

export class ArenaFence {
  private readonly parent: THREE.Object3D
  private readonly phys: Physics
  private readonly walls: BoxCollider[] = []
  private mesh: THREE.Mesh | null = null
  private pts: XZ[] = []
  private y = 0
  private a = 0
  private target = 0
  private readonly uniforms = {
    uColor: { value: new THREE.Color('#ff4f8a') },
    uA: { value: 0 },
    uTime,
    uPlayer: { value: new THREE.Vector3() },
  }

  constructor(parent: THREE.Object3D, phys: Physics) {
    this.parent = parent
    this.phys = phys
  }

  /** 柵が閉じているか */
  get closed(): boolean {
    return this.walls.length > 0
  }

  /** 形（XZ の点）で柵を閉じる。閉じていたら、いったん開けてから */
  close(points: readonly XZ[], o: ArenaOptions): void {
    this.open(true)
    this.pts = points.map((p) => ({ x: p.x, z: p.z }))
    this.y = o.y
    const h = o.height ?? 6
    for (let i = 0; i < this.pts.length; i++) {
      const a = this.pts[i]
      const b = this.pts[(i + 1) % this.pts.length]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (len < 0.01) continue
      // 角にすき間ができないよう、少し長めに
      const item: BoxCollider = {
        kind: 'box',
        center: new THREE.Vector3((a.x + b.x) / 2, o.y + h / 2 - 0.5, (a.z + b.z) / 2),
        half: new THREE.Vector3(len / 2 + 0.2, h / 2 + 0.5, 0.2),
        rotY: -Math.atan2(b.z - a.z, b.x - a.x),
        invisible: true,
      }
      this.phys.add(item)
      this.walls.push(item)
    }
    if (o.hidden) return
    this.uniforms.uColor.value.set(o.color ?? '#ff4f8a')
    this.mesh = new THREE.Mesh(
      ribbon(this.pts, o.y, o.curtain ?? 2.2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    )
    this.mesh.renderOrder = 4
    this.mesh.frustumCulled = false
    this.parent.add(this.mesh)
    this.a = 0
    this.target = 1
  }

  /** 柵を開ける（壁を外して、幕を消していく）。now=true ならすぐ消す */
  open(now = false): void {
    for (const w of this.walls) this.phys.remove(w)
    this.walls.length = 0
    this.target = 0
    if (now || !this.mesh) this.drop()
  }

  /** 毎フレーム：幕の明るさ、外に出ていたら内側へもどす */
  update(dt: number, player?: MinimalPlayer): void {
    if (this.mesh) {
      this.a += Math.sign(this.target - this.a) * Math.min(Math.abs(this.target - this.a), dt * 2.5)
      this.uniforms.uA.value = this.a
      if (player) this.uniforms.uPlayer.value.copy(player.position)
      if (this.target === 0 && this.a <= 0.001) this.drop()
    }
    if (!player || !this.closed) return
    const p = player.position
    // 床より大きく下（落ちている）・上（ワイヤーで高い所）のときはさわらない
    if (p.y < this.y - 3 || p.y > this.y + 8) return
    const back = pullInside(this.pts, p.x, p.z)
    if (back) player.teleport(new THREE.Vector3(back.x, Math.max(p.y, this.y) + 0.05, back.z))
  }

  dispose(): void {
    this.open(true)
  }

  private drop(): void {
    if (!this.mesh) return
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.mesh = null
  }
}

/** 形のふちに沿った、たての幕（uv.x＝ふちに沿った長さ m、uv.y＝0 が下） */
function ribbon(pts: readonly XZ[], y: number, h: number): THREE.BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let run = 0
  for (let i = 0; i <= pts.length; i++) {
    const p = pts[i % pts.length]
    if (i > 0) {
      const q = pts[i - 1]
      run += Math.hypot(p.x - q.x, p.z - q.z)
    }
    pos.push(p.x, y, p.z, p.x, y + h, p.z)
    uv.push(run, 0, run, 1)
    if (i > 0) {
      const k = i * 2
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  return g
}
