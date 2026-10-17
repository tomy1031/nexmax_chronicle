// NMClaw の見た目：右手のグリップ → シアンに光るワイヤー → 開閉する 3 本爪のクローヘッド。
// 物理はなく、始点・終点・開き具合・太さを毎フレーム受け取って置くだけ（軽量なメッシュ数本）。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export type ClawPose = {
  /** 爪の開き具合 0（閉じてつかむ）〜1（大きく開く） */
  open: number
  /** ワイヤーの太さの倍率（1 = 歯車を支えるときの太いビーム、0.45 前後 = 細いワイヤー） */
  thickness: number
}

const HEAD_SCALE = 1.6

export class ClawBeam {
  readonly group = new THREE.Group()
  private readonly core: THREE.Mesh
  private readonly glow: THREE.Mesh
  private readonly glow2: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly hinges: THREE.Group[] = []
  private readonly grip = new THREE.Group()
  private readonly coreMat: THREE.MeshBasicMaterial
  private readonly glowMat: THREE.MeshBasicMaterial
  private readonly light: THREE.PointLight
  private t = 0
  private openNow = 1
  active = false
  private readonly dir = new THREE.Vector3()
  private readonly start = new THREE.Vector3()
  private readonly q = new THREE.Quaternion()
  private readonly qz = new THREE.Quaternion()
  private static readonly Y = new THREE.Vector3(0, 1, 0)
  private static readonly NZ = new THREE.Vector3(0, 0, -1)

  constructor() {
    this.group.name = 'clawBeam'
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 4.2, 5.0), toneMapped: false })
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.75, 1.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    const glow2Mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.4, 0.8), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    const unit = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)
    unit.translate(0, 0.5, 0)
    this.core = new THREE.Mesh(unit, this.coreMat)
    this.glow = new THREE.Mesh(unit, this.glowMat)
    this.glow2 = new THREE.Mesh(unit, glow2Mat)
    for (const m of [this.core, this.glow, this.glow2]) {
      m.frustumCulled = false
      this.group.add(m)
    }
    // クローヘッド：暗い金属の本体＋光る縁。爪 3 本はそれぞれ蝶番（hinge）で開閉する
    const metal = new THREE.MeshStandardMaterial({ color: '#2a3442', metalness: 0.8, roughness: 0.35 })
    const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 3.2, 4.0), toneMapped: false })
    const bodyG = new THREE.CylinderGeometry(0.09, 0.12, 0.2, 16)
    bodyG.rotateX(Math.PI / 2)
    const body = new THREE.Mesh(bodyG, metal)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 24), edge)
    this.head.add(body, ring)
    // 爪 1 本分（蝶番の位置を原点に）を材質ごとに結合
    const hingeY = 0.12
    const hingeZ = -0.06
    const part = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number) => {
      g.rotateX(rx)
      g.translate(x, y - hingeY, z - hingeZ)
      return g.toNonIndexed()
    }
    const prongMetal = mergeGeometries([
      part(new THREE.BoxGeometry(0.05, 0.05, 0.24), 0, 0.15, -0.14, 0.5),
      part(new THREE.BoxGeometry(0.045, 0.045, 0.16), 0, 0.2, -0.32, -0.6),
    ])
    const prongEdge = part(new THREE.BoxGeometry(0.056, 0.012, 0.25), 0, 0.178, -0.135, 0.5)
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Group()
      spoke.rotation.z = (i / 3) * Math.PI * 2
      const hinge = new THREE.Group()
      hinge.position.set(0, hingeY, hingeZ)
      hinge.add(new THREE.Mesh(prongMetal, metal), new THREE.Mesh(prongEdge, edge))
      spoke.add(hinge)
      this.head.add(spoke)
      this.hinges.push(hinge)
    }
    this.head.scale.setScalar(HEAD_SCALE)
    this.head.traverse((o) => ((o as THREE.Mesh).castShadow = true))
    this.group.add(this.head)
    // グリップ（右手の発射口）
    const gripBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.22, 14), metal)
    gripBody.rotation.x = Math.PI / 2
    const gripRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), edge)
    gripRing.position.z = -0.1
    this.grip.add(gripBody, gripRing)
    this.group.add(this.grip)
    // ライトは常に 1 灯（数を変えるとシェーダが再コンパイルされるので、強さだけ変える）
    this.light = new THREE.PointLight('#5fe0ff', 3.0, 4.5, 2)
    this.group.add(this.light)
    this.setActive(false)
  }

  /** 表示の切り替え（ライトの数は変えない） */
  setActive(on: boolean): void {
    this.active = on
    for (const o of [this.core, this.glow, this.glow2, this.head, this.grip]) o.visible = on
    if (!on) this.light.intensity = 0
  }

  /** from（手元）→ to（爪の先）。pose で開き具合と太さを指定 */
  update(dt: number, from: THREE.Vector3, to: THREE.Vector3, pose: ClawPose = { open: 0, thickness: 1 }): void {
    this.t += dt
    if (!this.active) return
    this.dir.subVectors(to, from)
    const len = this.dir.length()
    if (len < 1e-4) this.dir.set(0, 0, -1)
    else this.dir.multiplyScalar(1 / len)
    this.q.setFromUnitVectors(ClawBeam.Y, this.dir)
    const flick = 1 + Math.sin(this.t * 37) * 0.08 + Math.sin(this.t * 13) * 0.05
    const th = pose.thickness
    const gripLen = 0.12
    this.start.copy(from).addScaledVector(this.dir, gripLen)
    const beamLen = Math.max(0.01, len - gripLen - 0.36)
    const show = len > gripLen + 0.4
    for (const [m, r] of [
      [this.core, 0.03 * flick * Math.max(0.6, th)],
      [this.glow, 0.08 * flick * th],
      [this.glow2, 0.17 * th],
    ] as const) {
      m.visible = show
      m.position.copy(this.start)
      m.quaternion.copy(this.q)
      m.scale.set(r, beamLen, r)
    }
    // ヘッド：ローカル -Z をワイヤーの向きへ
    this.qz.setFromUnitVectors(ClawBeam.NZ, this.dir)
    this.head.position.copy(to).addScaledVector(this.dir, -0.28)
    this.head.quaternion.copy(this.qz)
    this.grip.position.copy(from)
    this.grip.quaternion.copy(this.qz)
    // 爪の開閉（なめらかに）
    this.openNow += (pose.open - this.openNow) * Math.min(1, dt * 18)
    const ang = -0.12 + this.openNow * 0.7
    for (const h of this.hinges) h.rotation.x = ang
    this.light.position.copy(from).lerp(to, 0.5)
    this.light.intensity = (1.2 + 1.8 * th) * flick
    this.glowMat.opacity = 0.5 * flick
  }
}
