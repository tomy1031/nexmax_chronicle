// 夜の防衛の山場：空の黒い口（オルムの口）が、村の古い石像と、そばの家を、ひと口で飲みこむ（物語 11 章）。
// 石像（ナーガの上にすわる仏さま）と小さな高床の家は、それぞれ別のメッシュにして、飲みこまれる動きをつける。
// 当たり判定は physKhmer の ToggleBox（飲みこまれたら切る）。口は 1726 年の BlackRing を使い回す。
import * as THREE from 'three'
import { Batch, M } from '../../render/batch'
import { ColliderList } from '../../world/colliders'
import { BlackRing } from '../edo1726/blackRing'
import { box, cyl, shade, stiltHouse, type KCtx } from './kitKhmer'
import { KC } from './materialsKhmer'
import { ToggleBox } from './physKhmer'
import type { Burst } from './fxKhmer'
import type { StiltHouseDef } from './layout'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

/** 飲みこまれる物の場所（村の西のはずれ。お寺の上からも見える） */
export const SWALLOW = {
  statue: v(-69, 0, -7),
  house: { id: 'old', x: -77.5, z: -11, w: 4.2, d: 3.6, porch: 0.9, floorY: 2.0, hue: 0.05, water: false } as StiltHouseDef,
  /** 空の口（石像と家の上の空） */
  mouth: v(-72, 34, -9),
  mouthSize: 30,
}

export class SwallowTargets {
  readonly statue: THREE.Group
  readonly house: THREE.Group
  readonly mouth: BlackRing
  /** 飲みこまれたあとの地面のえぐれ */
  readonly scar: THREE.Mesh
  private readonly toggles: ToggleBox[] = []
  private t = -1
  private done: (() => void) | null = null
  private readonly burst: Burst | null
  private readonly homes: Array<{ o: THREE.Object3D; p: THREE.Vector3 }> = []
  swallowed = false

  constructor(c: KCtx, burst: Burst | null) {
    this.burst = burst
    // 当たり判定は、いったん別のリストに集めて ToggleBox にする
    const col0 = c.col
    const b0 = c.b
    const tmp = new ColliderList()
    c.col = tmp
    // 石像
    const sb = new Batch()
    c.b = sb
    const S = SWALLOW.statue
    buildStatue(c, S.x, S.z)
    this.statue = sb.build('khmer_swallow_statue')
    // 家
    const hb = new Batch()
    c.b = hb
    stiltHouse(c, SWALLOW.house)
    this.house = hb.build('khmer_swallow_house')
    c.b = b0
    c.col = col0
    for (const it of tmp.items) {
      if (it.invisible) continue
      this.toggles.push(c.bodies.addToggle(new ToggleBox(it.center, it.half.clone().multiplyScalar(2), it.rotY, it.rotX ?? 0, it.rotZ ?? 0)))
    }
    // 子の座標を、まわる中心からの相対にする（飲みこまれるとき、その場でちぢんでまわる）
    for (const [g, p] of [
      [this.statue, S.clone().setY(1.2)],
      [this.house, v(SWALLOW.house.x, 2.2, SWALLOW.house.z)],
    ] as Array<[THREE.Group, THREE.Vector3]>) {
      for (const ch of g.children) {
        const mesh = ch as THREE.Mesh
        mesh.geometry.translate(-p.x, -p.y, -p.z)
        mesh.matrixAutoUpdate = true
        mesh.position.set(0, 0, 0)
        mesh.updateMatrix()
      }
      g.position.copy(p)
      this.homes.push({ o: g, p: p.clone() })
    }
    // 空の口
    this.mouth = new BlackRing(SWALLOW.mouth, SWALLOW.mouthSize)
    // えぐれた地面
    const g = new THREE.CircleGeometry(5.2, 20)
    g.rotateX(-Math.PI / 2)
    this.scar = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: '#141018', roughness: 1, transparent: true, opacity: 0.88, depthWrite: false }))
    this.scar.position.set((S.x + SWALLOW.house.x) / 2, 0.03, (S.z + SWALLOW.house.z) / 2)
    this.scar.scale.set(1.5, 1, 1)
    this.scar.visible = false
    this.scar.renderOrder = 1
  }

  /** root に足す物 */
  get objects(): THREE.Object3D[] {
    return [this.statue, this.house, this.mouth.mesh, this.scar]
  }

  /** 口が現れて、石像と家を飲みこむ（約 4 秒）。終わると resolve */
  play(): Promise<void> {
    this.mouth.appear()
    this.t = 0
    return new Promise((r) => {
      this.done = r
    })
  }

  /** 飲みこまれたあとの見た目にする（セーブから再開したとき） */
  setSwallowed(on: boolean): void {
    this.swallowed = on
    this.statue.visible = !on
    this.house.visible = !on
    this.scar.visible = on
    for (const t of this.toggles) t.setEnabled(!on)
    if (!on) for (const h of this.homes) {
      h.o.position.copy(h.p)
      h.o.scale.setScalar(1)
      h.o.rotation.set(0, 0, 0)
    }
  }

  /** 口を消す */
  hideMouth(): void {
    this.mouth.hide()
  }

  update(dt: number, camera: THREE.Camera, t: number): void {
    this.mouth.update(dt, camera, t)
    if (this.t < 0) return
    this.t += dt
    const k = Math.min(1, Math.max(0, (this.t - 1.0) / 2.6))
    const e = k * k
    for (const h of this.homes) {
      if (!h.o.visible) continue
      h.o.position.lerpVectors(h.p, SWALLOW.mouth, e)
      h.o.position.y += Math.sin(k * Math.PI) * 3
      h.o.scale.setScalar(Math.max(0.01, 1 - e * 0.95))
      h.o.rotation.y = e * 3
      h.o.rotation.z = Math.sin(this.t * 5) * 0.08 * (1 - e)
    }
    if (this.t > 1.0 && this.t - dt <= 1.0) {
      this.scar.visible = true
      for (const tg of this.toggles) tg.setEnabled(false)
      for (const h of this.homes) this.burst?.emit(h.p.clone().setY(0.4), 26, { spread: 3, up: 2.5, color: '#1a1220', size: 1.6, life: 1.6 })
    }
    if (k >= 1) {
      this.t = -1
      this.swallowed = true
      this.statue.visible = false
      this.house.visible = false
      this.mouth.fade(0.4)
      const d = this.done
      this.done = null
      d?.()
    }
  }
}

/** ナーガの上にすわる仏さま（ムチャリンダ）の古い石像 */
function buildStatue(c: KCtx, x: number, z: number): void {
  const tint = shade(KC.sandGrey, 0.95)
  // 台座
  box(c, x, 0.3, z, 2.2, 0.6, 2.2, c.m.sandstone, { tint: shade(tint, 0.9), texM: 2, collide: true })
  box(c, x, 0.7, z, 1.8, 0.2, 1.8, c.m.sandstone, { tint, texM: 2 })
  // ナーガのとぐろ（3 段の輪）
  for (let k = 0; k < 3; k++) c.b.add(new THREE.TorusGeometry(0.75 - k * 0.08, 0.16, 8, 20), c.m.sandstone, M(x, 0.95 + k * 0.28, z, Math.PI / 2, 0, 0), { tint: shade(tint, 1.02) })
  // すわった体・ひざ・頭・頭の上のふくらみ
  c.b.add(new THREE.SphereGeometry(0.5, 12, 10), c.m.sandstone, M(x, 2.25, z, 0, 0, 0, 0.9, 1.25, 0.7), { tint })
  c.b.add(new THREE.CapsuleGeometry(0.22, 0.9, 4, 8), c.m.sandstone, M(x, 1.75, z + 0.25, 0, 0, Math.PI / 2), { tint })
  c.b.add(new THREE.SphereGeometry(0.3, 12, 10), c.m.sandstone, M(x, 3.0, z), { tint: shade(tint, 1.05) })
  c.b.add(new THREE.ConeGeometry(0.14, 0.32, 8), c.m.sandstone, M(x, 3.38, z), { tint })
  // 頭のうしろの七つの頭（フード）
  for (let k = -3; k <= 3; k++) {
    const a = (k / 3) * 1.1
    c.b.add(new THREE.SphereGeometry(0.16, 8, 6), c.m.sandstone, M(x + Math.sin(a) * 0.62, 3.1 + Math.cos(a) * 0.55, z - 0.3), { tint: shade(tint, 1.08) })
  }
  c.b.add(new THREE.CircleGeometry(0.75, 14, 0, Math.PI), c.m.sandstone, M(x, 3.05, z - 0.36, 0, Math.PI, 0), { tint: shade(tint, 0.92) })
  c.b.add(new THREE.CircleGeometry(0.75, 14, 0, Math.PI), c.m.sandstone, M(x, 3.05, z - 0.34), { tint: shade(tint, 0.95) })
  // こけ
  cyl(c, x - 0.8, 0.6, 0.66, z + 0.7, 0.3, c.m.plain, { tint: '#4a6a3a', seg: 8, cast: false })
}
