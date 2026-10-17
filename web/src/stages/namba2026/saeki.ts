// 佐伯玲奈の仮モデル（public/models/saeki.glb が無いときだけ使う）。
// 20 代後半の女性エンジニア：黒髪を低い位置で一つ結び・前髪、頭に透明の保護メガネ、紺の作業ジャケット（袖まくり）、
// 薄い灰色の T シャツ、黒い細身のパンツ、灰色の安全靴。軽い手続きモデル（呼吸と小さな揺れだけ）。
import * as THREE from 'three'
import type { Character, Pose } from '../../world/characters'

export function createSaekiPlaceholder(height = 1.6): Character {
  const s = height / 1.6
  const root = new THREE.Group()
  root.name = 'saeki'
  const inner = new THREE.Group()
  root.add(inner)
  const mat = (color: string, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough })
  const skin = mat('#f2cbb0', 0.6)
  const hair = mat('#1a1614', 0.5)
  const navy = mat('#24345a')
  const tee = mat('#c8ccd2')
  const pants = mat('#1e2026')
  const shoes = mat('#6a6e74')
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx) => {
    const o = new THREE.Mesh(g, m)
    o.position.set(x * s, y * s, z * s)
    o.scale.set(sx * s, sy * s, sz * s)
    o.castShadow = true
    o.receiveShadow = true
    inner.add(o)
    return o
  }
  const sph = new THREE.SphereGeometry(1, 20, 14)
  const cap = new THREE.CapsuleGeometry(1, 1, 4, 12)
  // 脚と靴
  for (const e of [-1, 1]) {
    add(cap, pants, e * 0.075, 0.45, 0, 0.065, 0.32, 0.065)
    add(new THREE.BoxGeometry(1, 1, 1), shoes, e * 0.075, 0.04, -0.03, 0.1, 0.08, 0.22)
  }
  // 胴（T シャツ）とジャケット
  add(cap, tee, 0, 1.08, 0, 0.15, 0.2, 0.1)
  const jacket = add(cap, navy, 0, 1.1, 0.005, 0.165, 0.2, 0.115)
  ;(jacket.material as THREE.Material).side = THREE.FrontSide
  add(new THREE.BoxGeometry(1, 1, 1), tee, 0, 1.12, -0.11, 0.1, 0.32, 0.01)
  // 胸ポケットのペンとドライバー
  add(new THREE.CylinderGeometry(1, 1, 1, 6), mat('#2a6ad8', 0.4), 0.07, 1.2, -0.12, 0.008, 0.08, 0.008)
  add(new THREE.CylinderGeometry(1, 1, 1, 6), mat('#e8b03a', 0.4), 0.09, 1.19, -0.12, 0.008, 0.07, 0.008)
  // 社員証
  add(new THREE.BoxGeometry(1, 1, 1), mat('#f4f4f4', 0.5), -0.06, 1.0, -0.125, 0.05, 0.07, 0.005)
  // 腕（袖まくり：ひじから先は肌）
  for (const e of [-1, 1]) {
    add(cap, navy, e * 0.2, 1.13, 0, 0.05, 0.12, 0.05)
    add(cap, skin, e * 0.215, 0.9, -0.02, 0.04, 0.1, 0.04)
    add(sph, skin, e * 0.22, 0.77, -0.03, 0.04, 0.045, 0.04)
  }
  // 頭・髪（前髪と低い一つ結び）・保護メガネ
  add(sph, skin, 0, 1.46, 0, 0.11, 0.125, 0.115)
  add(sph, hair, 0, 1.5, 0.015, 0.118, 0.11, 0.12)
  add(new THREE.BoxGeometry(1, 1, 1), hair, 0, 1.53, -0.1, 0.2, 0.05, 0.03)
  add(sph, hair, 0, 1.38, 0.12, 0.05, 0.07, 0.05)
  const glasses = new THREE.MeshStandardMaterial({ color: '#cfe8f4', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6 })
  add(new THREE.TorusGeometry(1, 0.15, 8, 24, Math.PI), glasses, 0, 1.6, -0.02, 0.12, 0.06, 0.1).rotation.x = -Math.PI / 2
  // 顔（目）
  for (const e of [-1, 1]) add(sph, mat('#1a1614', 0.3), e * 0.04, 1.47, -0.105, 0.012, 0.016, 0.006)
  const hand = new THREE.Object3D()
  hand.position.set(0.22 * s, 0.77 * s, -0.03 * s)
  root.add(hand)
  let t = Math.random() * 10
  return {
    name: 'saeki',
    root,
    placeholder: true,
    height,
    handAnchor: hand,
    setPose(_p: Pose) {},
    setAim() {},
    update(dt: number, speed: number) {
      t += dt
      const breath = Math.sin(t * 2.1)
      inner.scale.set(1 - breath * 0.004, 1 + breath * 0.01, 1 - breath * 0.004)
      inner.position.y = Math.abs(Math.sin(t * 9)) * 0.04 * Math.min(1, speed / 3)
      inner.rotation.z = Math.sin(t * 0.9) * 0.012
    },
  }
}
