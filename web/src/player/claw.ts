// NMClaw の見た目だけ：手元のグリップ → シアンに光るビーム → 歯車をつかむクローヘッド。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export class ClawBeam {
  readonly group = new THREE.Group()
  private readonly core: THREE.Mesh
  private readonly glow: THREE.Mesh
  private readonly glow2: THREE.Mesh
  private readonly head = new THREE.Group()
  private readonly grip = new THREE.Group()
  private readonly coreMat: THREE.MeshBasicMaterial
  private readonly glowMat: THREE.MeshBasicMaterial
  private readonly light: THREE.PointLight
  private t = 0

  constructor() {
    this.group.name = 'clawBeam'
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 4.2, 5.0), toneMapped: false })
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.75, 1.2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    const glow2Mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.4, 0.8), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
    const unit = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true)
    unit.translate(0, 0.5, 0)
    this.core = new THREE.Mesh(unit, this.coreMat)
    this.glow = new THREE.Mesh(unit, this.glowMat)
    this.glow2 = new THREE.Mesh(unit, glow2Mat)
    for (const m of [this.core, this.glow, this.glow2]) {
      m.frustumCulled = false
      this.group.add(m)
    }
    // クローヘッド：暗い金属の本体＋光る縁の爪 3 本
    const metal = new THREE.MeshStandardMaterial({ color: '#2a3442', metalness: 0.8, roughness: 0.35 })
    const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 3.2, 4.0), toneMapped: false })
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.2, 16), metal)
    body.rotation.x = Math.PI / 2
    this.head.add(body)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.018, 8, 24), edge)
    this.head.add(ring)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      const prong = new THREE.Group()
      prong.rotation.z = a
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.24), metal)
      p1.position.set(0, 0.15, -0.14)
      p1.rotation.x = 0.5
      const p1e = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.012, 0.25), edge)
      p1e.position.set(0, 0.178, -0.135)
      p1e.rotation.x = 0.5
      const p2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.16), metal)
      p2.position.set(0, 0.2, -0.32)
      p2.rotation.x = -0.6
      prong.add(p1, p1e, p2)
      this.head.add(prong)
    }
    this.head.scale.setScalar(1.6)
    // 爪の部品を材質ごとに結合（ドローコール削減）
    this.head.updateMatrixWorld(true)
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>()
    this.head.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const g = m.geometry.clone().toNonIndexed()
      // head 自身の拡大は残すので、head 基準の行列で焼く
      const rel = new THREE.Matrix4().copy(this.head.matrixWorld).invert().multiply(m.matrixWorld)
      g.applyMatrix4(rel)
      const l = byMat.get(m.material as THREE.Material) ?? []
      l.push(g)
      byMat.set(m.material as THREE.Material, l)
    })
    this.head.clear()
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false)
      if (merged) this.head.add(new THREE.Mesh(merged, mat))
    }
    this.group.add(this.head)
    // グリップ
    const gripBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.22, 14), metal)
    gripBody.rotation.x = Math.PI / 2
    const gripRing = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 20), edge)
    gripRing.position.z = -0.1
    this.grip.add(gripBody, gripRing)
    this.group.add(this.grip)
    this.head.traverse((o) => ((o as THREE.Mesh).castShadow = true))
    this.light = new THREE.PointLight('#5fe0ff', 3.0, 4.5, 2)
    this.group.add(this.light)
    this.setActive(false)
  }

  active = false

  /** ライト数を変えない（シェーダ再コンパイルを避ける）ため、表示は子だけ切り替える */
  setActive(on: boolean): void {
    this.active = on
    for (const o of [this.core, this.glow, this.glow2, this.head, this.grip]) o.visible = on
    if (!on) this.light.intensity = 0
  }

  update(dt: number, from: THREE.Vector3, to: THREE.Vector3): void {
    this.t += dt
    if (!this.active) return
    const dir = new THREE.Vector3().subVectors(to, from)
    const len = dir.length()
    dir.normalize()
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
    const flick = 1 + Math.sin(this.t * 37) * 0.08 + Math.sin(this.t * 13) * 0.05
    const gripLen = 0.12
    const start = from.clone().addScaledVector(dir, gripLen)
    const beamLen = Math.max(0.01, len - gripLen - 0.36)
    for (const [m, r] of [
      [this.core, 0.03 * flick],
      [this.glow, 0.08 * flick],
      [this.glow2, 0.17],
    ] as const) {
      m.position.copy(start)
      m.quaternion.copy(q)
      m.scale.set(r, beamLen, r)
    }
    // ヘッド：ローカル -Z をビーム方向へ
    const qz = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir)
    this.head.position.copy(to).addScaledVector(dir, -0.28)
    this.head.quaternion.copy(qz)
    this.grip.position.copy(from)
    this.grip.quaternion.copy(qz)
    this.light.position.copy(from).lerp(to, 0.5)
    this.light.intensity = 3.0 * flick
    this.glowMat.opacity = 0.5 * flick
  }
}
