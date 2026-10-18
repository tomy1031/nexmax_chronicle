// 源兵衛が三年間しまっていた「古い金具」（導入編 7-4）：三年前にネクマックスが落としていった NMClaw の部品。
// 丸い台座（ハブ）から 3 本の爪がのびる、使い込まれた鉄と真鍮の小さな金具。源兵衛が手のひらにのせて見せる。
// 見せている間はゆっくり回り、まわりに淡い金色の光の輪（ネクマックスの目が形を読み取っている）。
import * as THREE from 'three'

export class OldFitting {
  readonly root = new THREE.Group()
  private readonly part = new THREE.Group()
  private readonly tilt = new THREE.Group()
  private readonly halo: THREE.Mesh
  private readonly haloMat: THREE.MeshBasicMaterial
  private k = 0
  private on = false

  constructor() {
    const iron = new THREE.MeshStandardMaterial({ color: '#8a8278', roughness: 0.5, metalness: 0.7, emissive: new THREE.Color('#2a2420'), emissiveIntensity: 0.4 })
    const rust = new THREE.MeshStandardMaterial({ color: '#a86a42', roughness: 0.75, metalness: 0.35, emissive: new THREE.Color('#2a1408'), emissiveIntensity: 0.4 })
    const brass = new THREE.MeshStandardMaterial({ color: '#e0b860', roughness: 0.3, metalness: 0.8, emissive: new THREE.Color('#3a2a08'), emissiveIntensity: 0.5 })
    // 軸は上（ローカル +Y）。下に丸いハブ（真鍮の輪＋鉄の台座）、そこから 3 本の爪が外へ開いて、先が内へ曲がる（NMClaw の爪と同じ形）
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.056, 0.05, 18), iron)
    this.part.add(hub)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.054, 0.009, 8, 24), brass)
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.022
    this.part.add(ring)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.05, 10), brass)
    stem.position.y = -0.045
    this.part.add(stem)
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2
      const arm = new THREE.Group()
      arm.rotation.y = a
      // 付け根のピン
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), brass)
      pin.rotation.x = Math.PI / 2
      pin.position.set(0.045, 0.03, 0)
      arm.add(pin)
      // 下の爪（外へ開く）と上の爪（内へ曲がる）。1 本は先が欠けている
      const m = k === 1 ? rust : iron
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.085, 0.022), m)
      lower.position.set(0.062, 0.07, 0)
      lower.rotation.z = -0.42
      arm.add(lower)
      if (k !== 2) {
        const upper = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.07, 0.02), m)
        upper.position.set(0.07, 0.135, 0)
        upper.rotation.z = 0.55
        arm.add(upper)
      } else {
        const stub = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.025, 0.02), m)
        stub.position.set(0.083, 0.115, 0)
        stub.rotation.z = 0.3
        arm.add(stub)
      }
      this.part.add(arm)
    }
    this.part.scale.setScalar(1.6)
    // 爪の開いた側を見る人のほうへ少し傾ける
    this.tilt.rotation.order = 'YXZ'
    this.tilt.rotation.x = 0.6
    this.tilt.add(this.part)
    this.root.add(this.tilt)
    this.haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.215, 48), this.haloMat)
    this.root.add(this.halo)
    this.root.visible = false
    this.root.name = 'old_fitting'
  }

  show(on: boolean): void {
    this.on = on
    if (on) this.root.visible = true
  }

  update(dt: number, t: number, camera: THREE.Camera): void {
    this.k += ((this.on ? 1 : 0) - this.k) * Math.min(1, dt * 5)
    if (!this.on && this.k < 0.02) {
      this.root.visible = false
      return
    }
    this.part.rotation.y = t * 0.6
    // 傾きは見る人（カメラ）の向きに合わせる
    this.tilt.rotation.y = Math.atan2(camera.position.x - this.root.position.x, camera.position.z - this.root.position.z)
    this.root.scale.setScalar(0.4 + 0.6 * this.k)
    this.halo.quaternion.copy(camera.quaternion)
    this.haloMat.opacity = this.k * (0.35 + 0.2 * Math.sin(t * 4))
  }
}
