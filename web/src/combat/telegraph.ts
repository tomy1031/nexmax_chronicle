// 敵の攻撃の予告：構えている間、当たる範囲を地面に赤い扇で出し、たたく瞬間に向かって中から満ちていく。
// 「どこが危ないか」「いつ来るか」を、子どもが見てわかるように（オーナーの「敵は避け方がわかりにくい」）。
// 扇は敵の正面（-Z）を中心に ±halfArc。半径 1 で作り、show() で大きさ・向き・満ち具合を合わせる。
import * as THREE from 'three'

const SEGMENTS = 28

/** 原点から -Z を中心に ±halfArc の扇（XZ 平面、半径 1）。halfArc が π 以上なら円 */
function fanGeometry(halfArc: number): THREE.BufferGeometry {
  const h = Math.min(Math.PI, halfArc)
  const pos: number[] = [0, 0, 0]
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = -h + (2 * h * i) / SEGMENTS
    pos.push(Math.sin(a), 0, -Math.cos(a))
  }
  const idx: number[] = []
  for (let i = 1; i <= SEGMENTS; i++) idx.push(0, i + 1, i)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

function dangerMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 0.18, 0.22),
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
}

export class AttackTelegraph {
  readonly root = new THREE.Group()
  private readonly outer: THREE.Mesh
  private readonly fill: THREE.Mesh
  private readonly geo: THREE.BufferGeometry

  constructor(halfArc: number) {
    this.geo = fanGeometry(halfArc)
    this.outer = new THREE.Mesh(this.geo, dangerMaterial(0.2))
    this.fill = new THREE.Mesh(this.geo, dangerMaterial(0.5))
    this.outer.renderOrder = 5
    this.fill.renderOrder = 6
    this.root.add(this.outer, this.fill)
    this.root.visible = false
  }

  /** 予告を出す。k は 0〜1（たたく瞬間が 1）。flash はたたいた瞬間の白っぽい光 */
  show(pos: THREE.Vector3, yaw: number, radius: number, k: number, flash = false): void {
    this.root.visible = true
    this.root.position.set(pos.x, pos.y + 0.05, pos.z)
    this.root.rotation.set(0, yaw, 0)
    this.outer.scale.setScalar(radius)
    const f = Math.max(0.02, Math.min(1, k))
    this.fill.scale.set(radius * f, 1, radius * f)
    ;(this.outer.material as THREE.MeshBasicMaterial).opacity = flash ? 0.55 : 0.18 + 0.12 * Math.sin(k * Math.PI * 6) ** 2
    ;(this.fill.material as THREE.MeshBasicMaterial).opacity = flash ? 0.85 : 0.35 + 0.3 * f
  }

  hide(): void {
    this.root.visible = false
  }

  dispose(): void {
    this.root.removeFromParent()
    this.geo.dispose()
    ;(this.outer.material as THREE.Material).dispose()
    ;(this.fill.material as THREE.Material).dispose()
  }
}
