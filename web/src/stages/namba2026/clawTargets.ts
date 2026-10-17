// 2026年 なんばの「つかむNMClaw」の対象（操作マニュアル v1.1 §1.1・§8.3。種類は ClawTargetDef のまま）。
// ・swing_anchor：水路をまたぐ鉄骨の門型フレーム（看板の吊り元）の吊り輪 → 振り子で対岸へ
// ・pull_player：串カツ屋の 2 階のバルコニーの金具 → 飛びついて上がると、クリスタルが置いてある
// ・pull_object：観光船の舳先の木箱、岸の段ボール箱（部品の箱）
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import { ColliderList } from '../../world/colliders'
import type { ClawTargetDef } from '../../player/clawLogic'
import type { MovableInput } from '../../player/clawSystem'
import { N } from './layout'
import { box, boxAB, cyl, sign, type NCtx } from './kit'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type NambaClaw = {
  targets: ClawTargetDef[]
  movables: MovableInput[]
  crystal: { group: THREE.Group; pos: THREE.Vector3 }
  boat: THREE.Group
}

export function buildNambaClaw(c: NCtx): NambaClaw {
  const targets: ClawTargetDef[] = []
  const movables: MovableInput[] = []

  // ---------------------------------------------------------- swing_anchor：門型フレームの吊り輪
  {
    const { x, anchorY, beamY, postZ, rope } = N.SWING
    for (const z of [-postZ, postZ]) {
      boxAB(c, x - 0.16, x + 0.16, 0, beamY + 0.2, z - 0.16, z + 0.16, c.m.metal, { tint: '#3a4048', collide: true })
      boxAB(c, x - 0.3, x + 0.3, 0, 0.18, z - 0.3, z + 0.3, c.m.concrete, { tint: '#bdb8b0' })
    }
    // 梁（トラス）と「なんば」の横断幕
    boxAB(c, x - 0.12, x + 0.12, beamY - 0.12, beamY + 0.12, -postZ, postZ, c.m.metal, { tint: '#3a4048' })
    boxAB(c, x - 0.08, x + 0.08, beamY + 0.42, beamY + 0.52, -postZ, postZ, c.m.metal, { tint: '#3a4048' })
    for (let z = -postZ; z <= postZ + 0.01; z += 0.8) {
      const g = new THREE.CylinderGeometry(0.025, 0.025, 0.62, 5)
      c.b.add(g, c.m.metal, M(x, beamY + 0.3, z, 0.6 * (Math.round(z / 0.8) % 2 ? 1 : -1), 0, 0), { tint: '#3a4048', cast: false })
    }
    sign(c, 'namba_big', x + 0.0, beamY + 1.35, -3.0, Math.PI / 2, 2.4, 1.2, { glow: true, depth: 0.1 })
    sign(c, 'namba_big', x + 0.0, beamY + 1.35, -3.0, -Math.PI / 2, 2.4, 1.2, { glow: true, depth: 0.1 })
    cyl(c, x, beamY - anchorY > 0 ? anchorY + 0.25 : anchorY, beamY - 0.1, 0, 0.02, c.m.metal, { tint: '#8a8e94', seg: 6 })
    c.b.add(new THREE.TorusGeometry(0.24, 0.045, 10, 28), c.m.metal, M(x, anchorY, 0, 0, Math.PI / 2, 0), { tint: '#f2c84b' })
    targets.push({
      id: 'namba_swing',
      type: 'swing_anchor',
      label: '鉄骨の吊り輪',
      point: v(x, anchorY, 0),
      radius: 0.3,
      enabled: true,
      ropeLength: rope,
      checkpoints: [v(x + 0.9, 0, -7.4), v(x + 0.9, 0, 7.4)],
    })
  }

  // ---------------------------------------------------------- pull_player：2 階のバルコニーの金具
  const B = N.BALCONY
  {
    const cx = (B.x0 + B.x1) / 2
    boxAB(c, B.x0, B.x1, B.y - 0.18, B.y, B.z0, B.z1, c.m.concrete, { tint: '#dcd6cc', collide: true })
    // 手すり（金属）と当たり判定
    for (let x = B.x0 + 0.05; x <= B.x1 - 0.04; x += 0.35) boxAB(c, x - 0.02, x + 0.02, B.y, B.y + 1.0, B.z0 + 0.02, B.z0 + 0.06, c.m.metal, { tint: '#2a2d33', cast: false })
    boxAB(c, B.x0, B.x1, B.y + 0.98, B.y + 1.04, B.z0, B.z0 + 0.08, c.m.metal, { tint: '#2a2d33' })
    for (const sx of [B.x0, B.x1]) boxAB(c, sx - 0.03, sx + 0.03, B.y, B.y + 1.04, B.z0, B.z1, c.m.metal, { tint: '#2a2d33' })
    c.col.box(cx, B.y + 0.6, B.z0 + 0.04, B.x1 - B.x0, 1.2, 0.1)
    c.col.box(B.x0, B.y + 0.6, (B.z0 + B.z1) / 2, 0.1, 1.2, B.z1 - B.z0)
    c.col.box(B.x1, B.y + 0.6, (B.z0 + B.z1) / 2, 0.1, 1.2, B.z1 - B.z0)
    // 2 階のガラス戸と植木鉢
    c.b.add(new THREE.PlaneGeometry(2.6, 2.2), c.m.glass, M(cx, B.y + 1.1, B.z1 + 0.02, 0, Math.PI, 0), { cast: false })
    for (const px of [B.x0 + 0.4, B.x1 - 0.4]) {
      cyl(c, px, B.y, B.y + 0.35, B.z1 - 0.3, 0.18, c.m.plastic, { tint: '#c8643a', r1: 0.22 })
      c.b.add(new THREE.SphereGeometry(0.28, 10, 8), c.m.leaf, M(px, B.y + 0.55, B.z1 - 0.3), { tint: '#5a8a3a' })
    }
    // 手すりの上の金具（鉄の腕木と輪）
    const hx = cx - 1.2
    box(c, hx, B.y + 1.45, B.z0 + 0.04, 0.07, 0.9, 0.07, c.m.metal, { tint: '#2a2d33' })
    box(c, hx, B.y + 1.86, B.z0 - 0.12, 0.06, 0.06, 0.36, c.m.metal, { tint: '#2a2d33' })
    c.b.add(new THREE.TorusGeometry(0.16, 0.035, 8, 22), c.m.metal, M(hx, B.y + 1.62, B.z0 - 0.28, 0, Math.PI / 2, 0), { tint: '#f2c84b' })
    targets.push({
      id: 'namba_balcony_hook',
      type: 'pull_player',
      label: 'バルコニーの金具',
      point: v(hx, B.y + 1.62, B.z0 - 0.28),
      radius: 0.22,
      enabled: true,
      facing: v(0, 0, -1),
      landing: v(hx + 0.5, B.y, B.z0 + 0.65),
      via: v(hx, B.y + 1.45, B.z0 - 0.35),
    })
  }

  // ---------------------------------------------------------- クリスタル（バルコニーの上）
  const crystal = new THREE.Group()
  crystal.name = 'namba_crystal'
  {
    const mat = new THREE.MeshStandardMaterial({ color: '#7fe8ff', emissive: new THREE.Color('#2ad0ff'), emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 })
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), mat)
    gem.scale.set(0.8, 1.4, 0.8)
    gem.castShadow = true
    crystal.add(gem)
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.6, 2.2), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }))
    halo.rotation.x = -Math.PI / 2
    halo.position.y = -0.3
    crystal.add(halo)
  }
  const crystalPos = v(B.x1 - 0.9, B.y + 0.55, B.z1 - 0.55)
  crystal.position.copy(crystalPos)
  c.root.add(crystal)

  // ---------------------------------------------------------- pull_object：観光船の木箱・岸の段ボール箱
  const movable = (id: string, label: string, home: THREE.Vector3, half: THREE.Vector3, build: (cc: NCtx) => void, rotY = 0) => {
    const sub: NCtx = { ...c, b: new Batch(), col: new ColliderList() }
    build(sub)
    const object = sub.b.build(id)
    object.position.copy(home)
    object.rotation.y = rotY
    c.root.add(object)
    const def: ClawTargetDef = { id, type: 'pull_object', label, point: home.clone().add(v(0, half.y, 0)), radius: Math.max(half.x, half.y, half.z) + 0.05, enabled: true }
    targets.push(def)
    movables.push({ def, object, half, home: home.clone() })
  }
  const boat = cruiseBoat(c)
  boat.position.set(-1.5, N.WL, -2.2)
  c.root.add(boat)
  movable('namba_crate', '木箱', v(1.55, N.WL + 0.52, -2.2), v(0.25, 0.25, 0.25), (cc) => crate(cc), 0.3)
  movable('namba_parts_box', '部品の段ボール箱', v(-2.6, 0, N.FACADE_S - 0.6), v(0.26, 0.2, 0.2), (cc) => cardboard(cc), -0.2)
  return { targets, movables, crystal: { group: crystal, pos: crystalPos }, boat }
}

function crate(c: NCtx): void {
  c.b.add(rbox(0.5, 0.5, 0.5, 0.02), c.m.woodPlain, M(0, 0.25, 0), { tint: '#c89a62' })
  for (const y of [0.06, 0.44]) c.b.add(rbox(0.52, 0.06, 0.52, 0.01), c.m.woodPlain, M(0, y, 0), { tint: '#9a6a3a' })
}

function cardboard(c: NCtx): void {
  c.b.add(rbox(0.52, 0.4, 0.4, 0.01), c.m.paint, M(0, 0.2, 0), { tint: '#c8a070' })
  c.b.add(new THREE.BoxGeometry(0.53, 0.06, 0.08), c.m.paint, M(0, 0.4, 0), { tint: '#e8e0c8' })
  c.b.add(new THREE.PlaneGeometry(0.18, 0.1), c.m.paint, M(0.1, 0.25, 0.201), { tint: '#ffffff' })
}

/** 観光船（白い船体・青い帯・屋根）。原点は水面 */
function cruiseBoat(c: NCtx): THREE.Group {
  const sub: NCtx = { ...c, b: new Batch(), col: new ColliderList() }
  const hull = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
  sub.b.add(hull, c.m.paint, M(0, 0.45, 0, 0, 0, 0, 4.2, 0.6, 1.25), { tint: '#f4f6f8' })
  sub.b.add(new THREE.TorusGeometry(1, 0.06, 6, 32), c.m.paint, M(0, 0.45, 0, Math.PI / 2, 0, 0, 4.2, 1.25, 1), { tint: '#2a5ab8' })
  sub.b.add(rbox(7.4, 0.08, 2.1, 0.02), c.m.woodPlain, M(0, 0.48, 0), { tint: '#c89a62' })
  for (const x of [-2.6, -1.2, 0.2, 1.0]) sub.b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), c.m.metal, M(x, 1.2, 0.9), { tint: '#c8ccd2' })
  for (const x of [-2.6, -1.2, 0.2, 1.0]) sub.b.add(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 6), c.m.metal, M(x, 1.2, -0.9), { tint: '#c8ccd2' })
  sub.b.add(rbox(4.0, 0.08, 2.1, 0.03), c.m.paint, M(-0.8, 1.92, 0), { tint: '#2a5ab8' })
  for (let i = 0; i < 4; i++) sub.b.add(rbox(0.5, 0.5, 1.6, 0.04), c.m.fabric, M(-2.4 + i * 0.85, 0.75, 0), { tint: '#d8443a' })
  return sub.b.build('cruise_boat')
}
