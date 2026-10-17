// からくり水門：太い木組み・鉄の帯とリベット・堰板・二段の滝・大歯車（回転体）・源兵衛の小車・作業台。
import * as THREE from 'three'
import { Batch, M, rbox } from '../../render/batch'
import { TEX_METERS } from '../../render/materials'
import { L } from './layout'
import { WOOD, beamAB, crate, deck, lantern, post, railing, ropeCoil, stairs, woodBox, woodTint, barrel, type Ctx } from './kit'
import { createFallMaterial, createFoamPatchMaterial, createSpray, fallSheet, mergeGroupByMaterial, type Emitter } from './water'

export type GateParts = {
  gear: THREE.Group
  /** 歯車の回転（ラジアン/秒）。保持中は 0 */
  setGearSpeed(v: number): void
  /** 歯車の縁上の点（クローの掴み位置、ワールド） */
  gearGrabPoint: THREE.Vector3
  gearCenter: THREE.Vector3
}

const GX = L.GATE_X
const POSTS_Z = [L.GATE_Z0, L.GATE_Z0 + (L.GATE_Z1 - L.GATE_Z0) / 3, L.GATE_Z0 + ((L.GATE_Z1 - L.GATE_Z0) * 2) / 3, L.GATE_Z1]
const APRON_X0 = 8.6
const APRON_Y = 0.3

function ironBand(c: Ctx, x: number, y: number, z: number, sx: number, sy: number, sz: number, rivets = true): void {
  c.b.add(rbox(sx, sy, sz, 0.01), c.m.iron, M(x, y, z), { tint: '#ffffff' })
  if (!rivets) return
  // 前面（-X）にリベット
  const n = Math.max(2, Math.round(sz / 0.14))
  for (let i = 0; i < n; i++) {
    const zz = z - sz / 2 + ((i + 0.5) * sz) / n
    for (const dy of [-sy * 0.28, sy * 0.28]) {
      c.b.add(new THREE.SphereGeometry(0.022, 6, 4), c.m.iron, M(x - sx / 2, y + dy, zz), { cast: false })
    }
  }
}

export function buildGate(c: Ctx, scene: THREE.Group): GateParts {
  const dark = () => woodTint(c.rng, '#7a5a48', 0.1)
  // ---------------------------------------------------------- 柱と梁
  const top = 9.2
  for (const z of POSTS_Z) {
    post(c, GX, z, -1.8, top, 0.62, dark())
    // 鉄の帯
    for (const y of [-0.2, 1.2, 2.9, 4.6, 6.4, 8.2]) ironBand(c, GX, y, z, 0.66, 0.16, 0.66)
    // 前面の補強材
    post(c, GX - 0.42, z, -1.2, 3.4, 0.24, dark())
    c.col.box(GX, 4, z, 0.7, 12, 0.7)
  }
  for (const y of [2.15, 3.35, 5.9, 8.75]) {
    for (const dx of [-0.36, 0.36]) {
      woodBox(c, GX + dx, y, (L.GATE_Z0 + L.GATE_Z1) / 2, 0.34, 0.46, L.GATE_Z1 - L.GATE_Z0 + 1.1, { tint: dark() })
      if (dx < 0) {
        for (const z of POSTS_Z) ironBand(c, GX + dx - 0.02, y, z, 0.36, 0.5, 0.2, false)
      }
    }
  }
  // 筋交い
  for (let i = 0; i < 3; i++) {
    const za = POSTS_Z[i] + 0.3
    const zb = POSTS_Z[i + 1] - 0.3
    for (const [y0, y1] of [
      [3.6, 5.65],
      [6.15, 8.5],
    ]) {
      beamAB(c, new THREE.Vector3(GX - 0.5, y0, za), new THREE.Vector3(GX - 0.5, y1, zb), 0.2, 0.24, dark())
      beamAB(c, new THREE.Vector3(GX - 0.52, y0, zb), new THREE.Vector3(GX - 0.52, y1, za), 0.2, 0.24, dark())
    }
  }
  // 上部の巻き上げ機（からくり）：歯付きの竪棒と滑車
  for (let i = 0; i < 3; i++) {
    const zc = (POSTS_Z[i] + POSTS_Z[i + 1]) / 2
    const boardTop = i < 2 ? L.WL_UP : L.WL_UP + 0.5
    for (const dz of [-0.55, 0.55]) {
      woodBox(c, GX + 0.05, (boardTop + 8.5) / 2, zc + dz, 0.16, 8.5 - boardTop, 0.16, { tint: dark() })
      for (let k = 0; k < 18; k++) {
        const y = boardTop + 0.3 + k * 0.33
        if (y > 5.6 && y < 6.2) continue
        woodBox(c, GX - 0.07, y, zc + dz, 0.1, 0.12, 0.2, { tint: WOOD.aged })
      }
    }
    // 滑車
    c.b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 20), c.m.wood, M(GX - 0.6, 7.45, zc, Math.PI / 2, 0, 0), { tint: WOOD.aged, uv: 'scale', uvScale: [1, 0.2] })
    c.b.add(new THREE.TorusGeometry(0.42, 0.03, 6, 24), c.m.iron, M(GX - 0.6, 7.45, zc, 0, 0, 0))
    c.b.add(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 10), c.m.iron, M(GX - 0.6, 7.45, zc, Math.PI / 2, 0, 0))
    c.b.add(new THREE.CylinderGeometry(0.025, 0.025, 7.45 - boardTop, 5), c.m.rope, M(GX - 0.6, (7.45 + boardTop) / 2, zc + 0.42), { uv: 'scale', uvScale: [1, 8] })
    // 堰板
    const bz = POSTS_Z[i + 1] - POSTS_Z[i] - 0.62
    const nb = 6
    for (let k = 0; k < nb; k++) {
      const y0 = -0.9 + ((boardTop + 0.9) * k) / nb
      const y1 = -0.9 + ((boardTop + 0.9) * (k + 1)) / nb
      woodBox(c, GX + 0.1, (y0 + y1) / 2, zc, 0.2, y1 - y0 - 0.02, bz, { tint: woodTint(c.rng, WOOD.aged), uAxis: 2 })
    }
    for (const dz of [-bz * 0.3, bz * 0.3]) ironBand(c, GX - 0.02, (boardTop - 0.9) / 2, zc + dz, 0.06, boardTop + 0.8, 0.14, false)
    c.col.box(GX + 0.1, (boardTop - 1) / 2, zc, 0.3, boardTop + 1, bz)
  }
  // 水門の前に吊るした提灯
  for (const z of [0.15, 2.9]) {
    woodBox(c, GX - 0.95, 3.32, z, 0.7, 0.1, 0.1, { tint: dark() })
    lantern(c, GX - 1.25, 2.72, z, { kind: 'cream', s: 1.3, cord: 0.3 })
  }
  // 上の通路（板張り＋欄干）
  deck(c, GX - 0.75, GX + 0.75, L.GATE_Z0 - 0.4, L.GATE_Z1 + 0.4, 3.62, { alongX: false, posts: false })
  railing(c, GX - 0.72, L.GATE_Z0 - 0.4, GX - 0.72, L.GATE_Z1 + 0.4, 3.62, { spacing: 1.3 })
  railing(c, GX + 0.72, L.GATE_Z0 - 0.4, GX + 0.72, L.GATE_Z1 + 0.4, 3.62, { spacing: 1.3 })
  // 頂部の屋根（小さな切妻）
  woodBox(c, GX, top + 0.1, (L.GATE_Z0 + L.GATE_Z1) / 2, 1.3, 0.3, L.GATE_Z1 - L.GATE_Z0 + 1.6, { tint: dark() })

  // ---------------------------------------------------------- エプロン（一段目の受け）
  const apronZ0 = POSTS_Z[0] + 0.3
  const apronZ1 = POSTS_Z[2] - 0.3
  for (let k = 0; k < 4; k++) {
    const x = APRON_X0 + 0.15 + k * 0.3
    woodBox(c, x, APRON_Y - 0.08, (apronZ0 + apronZ1) / 2, 0.3, 0.16, apronZ1 - apronZ0, { tint: woodTint(c.rng, WOOD.aged), uAxis: 2 })
  }
  for (const z of [apronZ0 + 0.1, (apronZ0 + apronZ1) / 2, apronZ1 - 0.1]) {
    post(c, APRON_X0 + 0.2, z, -1.6, APRON_Y - 0.15, 0.22, dark())
  }
  ironBand(c, APRON_X0 + 0.02, APRON_Y - 0.08, (apronZ0 + apronZ1) / 2, 0.05, 0.12, apronZ1 - apronZ0, true)

  // ---------------------------------------------------------- 滝
  const falls = new THREE.Group()
  falls.name = 'falls'
  const fallMatA = createFallMaterial(0.13, 1, 1.25)
  const fallMatB = createFallMaterial(0.61, 0.65, 1.55)
  const fallMatC = createFallMaterial(0.37, 1, 1.0)
  for (let i = 0; i < 2; i++) {
    const zc = (POSTS_Z[i] + POSTS_Z[i + 1]) / 2
    const w = POSTS_Z[i + 1] - POSTS_Z[i] - 0.66
    // 一段目：堰板の上からエプロンへ
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 0.02, L.WL_UP + 0.04, zc), Math.PI, w, L.WL_UP - APRON_Y, 0.55), fallMatA))
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 0.06, L.WL_UP + 0.06, zc), Math.PI, w * 1.04, L.WL_UP - APRON_Y + 0.05, 0.72), fallMatB))
    // エプロン上の流れ
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 0.5, APRON_Y + 0.05, zc), Math.PI, w + 0.2, 0.04, GX - 0.5 - APRON_X0, 3, 6), fallMatC))
  }
  // 通路の下の放水口から落ちる幅広の白い滝（歯車の背後）
  {
    const zc = (POSTS_Z[0] + POSTS_Z[2]) / 2
    const w = POSTS_Z[2] - POSTS_Z[0] - 0.7
    woodBox(c, GX - 0.75, 3.0, zc, 0.5, 0.14, w + 0.4, { tint: dark() })
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 0.95, 3.05, zc), Math.PI, w, 3.05 - APRON_Y, 0.6, 16, 14), fallMatA))
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 1.0, 3.08, zc), Math.PI, w + 0.15, 3.1 - APRON_Y, 0.85, 16, 14), fallMatB))
  }
  // 二段目：エプロンの縁から水路へ（幅広）
  const wide = apronZ1 - apronZ0
  const zMid = (apronZ0 + apronZ1) / 2
  falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(APRON_X0, APRON_Y + 0.03, zMid), Math.PI, wide, APRON_Y - L.WL_DOWN, 0.55, 12, 16), fallMatA))
  falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(APRON_X0 - 0.04, APRON_Y + 0.05, zMid), Math.PI, wide * 1.03, APRON_Y - L.WL_DOWN + 0.05, 0.75, 12, 16), fallMatB))
  // 三つ目の区画：板の隙間から勢いよく吹き出す
  {
    const zc = (POSTS_Z[2] + POSTS_Z[3]) / 2
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 0.05, 0.35, zc), Math.PI, 1.1, 0.9, 1.1), fallMatA))
  }
  // 上の樋から落ちる高い滝（からくりの導水樋：高さ違いで 3 本）
  const troughs: Array<[number, number, number, number]> = [
    // [z 中心, 樋の高さ, 落ちる先の高さ, 幅]
    [(POSTS_Z[1] + POSTS_Z[2]) / 2, 5.25, APRON_Y, 1.85],
    [(POSTS_Z[0] + POSTS_Z[1]) / 2 + 0.15, 4.25, APRON_Y, 1.6],
    [(POSTS_Z[2] + POSTS_Z[3]) / 2, 3.65, L.WL_DOWN, 1.7],
  ]
  troughs.forEach(([zc, ty, toY, w], i) => {
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 1.0, ty, zc), Math.PI, w - 0.15, ty - toY - 0.05, 0.55, 18, 6), fallMatA))
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX - 1.05, ty + 0.02, zc), Math.PI, w - 0.02, ty - toY, 0.72, 18, 6), fallMatB))
    const len = 14 + i * 3
    woodBox(c, GX - 1.05 + (len + 1.05) / 2, ty - 0.1, zc, len + 1.05, 0.14, w + 0.2, { tint: dark() })
    woodBox(c, GX - 1.05 + (len + 1.05) / 2, ty + 0.2, zc - (w + 0.1) / 2, len + 1.05, 0.6, 0.1, { tint: dark() })
    woodBox(c, GX - 1.05 + (len + 1.05) / 2, ty + 0.2, zc + (w + 0.1) / 2, len + 1.05, 0.6, 0.1, { tint: dark() })
    for (let x = GX + 3.5; x <= GX + len + 0.01; x += 3.5) {
      post(c, x, zc - w / 2 - 0.15, L.WL_UP - 0.5, ty - 0.1, 0.2, dark())
      post(c, x, zc + w / 2 + 0.15, L.WL_UP - 0.5, ty - 0.1, 0.2, dark())
      woodBox(c, x, ty - 0.25, zc, 0.2, 0.18, w + 0.5, { tint: dark() })
    }
    falls.add(new THREE.Mesh(fallSheet(new THREE.Vector3(GX + len, ty + 0.02, zc), Math.PI, w - 0.1, 0.02, len + 1.0, 4, 6), fallMatC))
  })
  mergeGroupByMaterial(falls)
  scene.add(falls)

  // 着水の泡
  const foamMat = createFoamPatchMaterial(0.2)
  const foamMat2 = createFoamPatchMaterial(0.7)
  const addFoam = (x: number, z: number, sx: number, sz: number, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz, 8, 8), mat)
    m.rotation.x = -Math.PI / 2
    m.position.set(x, y, z)
    m.renderOrder = 2
    scene.add(m)
  }
  addFoam(APRON_X0 - 0.9, zMid, 2.6, wide + 1.4, L.WL_DOWN + 0.04, foamMat)
  addFoam(L.GEAR.x, L.GEAR.z, 2.4, 3.6, L.WL_DOWN + 0.05, foamMat2)
  addFoam(APRON_X0 - 2.6, zMid - 0.5, 3.2, wide + 2.5, L.WL_DOWN + 0.03, foamMat2)
  addFoam(GX - 1.0, (POSTS_Z[2] + POSTS_Z[3]) / 2, 2.0, 1.8, L.WL_DOWN + 0.04, foamMat2)
  addFoam(GX - 0.8, (POSTS_Z[1] + POSTS_Z[2]) / 2, 1.5, 1.8, APRON_Y + 0.08, foamMat)
  addFoam(GX - 0.8, (POSTS_Z[0] + POSTS_Z[1]) / 2 + 0.2, 1.4, 1.6, APRON_Y + 0.08, foamMat2)
  addFoam(GX - 1.3, (POSTS_Z[2] + POSTS_Z[3]) / 2, 2.2, 2.0, L.WL_DOWN + 0.05, foamMat)

  // しぶきと霧
  const q = c.quality.level === 'high' ? 1 : 0.5
  const em: Emitter[] = [
    { pos: new THREE.Vector3(APRON_X0 - 0.7, L.WL_DOWN + 0.1, zMid), spread: new THREE.Vector3(0.5, 0.1, wide / 2), vel: new THREE.Vector3(-1.4, 2.6, 0), velJitter: 1.3, count: Math.round(420 * q), life: [0.5, 1.1], size: [0.15, 0.4], alpha: 0.85 },
    { pos: new THREE.Vector3(GX - 0.75, APRON_Y + 0.1, zMid), spread: new THREE.Vector3(0.25, 0.05, wide / 2), vel: new THREE.Vector3(-0.8, 1.8, 0), velJitter: 0.9, count: Math.round(220 * q), life: [0.4, 0.9], size: [0.12, 0.3], alpha: 0.8 },
    { pos: new THREE.Vector3(L.GEAR.x + 0.2, L.WL_DOWN + 0.1, L.GEAR.z), spread: new THREE.Vector3(0.5, 0.1, 1.3), vel: new THREE.Vector3(-0.8, 2.6, 0), velJitter: 1.4, count: Math.round(380 * q), life: [0.5, 1.1], size: [0.15, 0.42], alpha: 0.9 },
    { pos: new THREE.Vector3(GX - 1.3, L.WL_DOWN + 0.1, (POSTS_Z[2] + POSTS_Z[3]) / 2), spread: new THREE.Vector3(0.5, 0.1, 0.6), vel: new THREE.Vector3(-1.2, 2.4, 0), velJitter: 1.2, count: Math.round(200 * q), life: [0.5, 1.1], size: [0.15, 0.4], alpha: 0.85 },
    { pos: new THREE.Vector3(GX - 1.5, APRON_Y + 0.15, (POSTS_Z[0] + POSTS_Z[2]) / 2), spread: new THREE.Vector3(0.3, 0.05, 2.2), vel: new THREE.Vector3(-1.0, 2.6, 0), velJitter: 1.2, count: Math.round(260 * q), life: [0.5, 1.0], size: [0.15, 0.4], alpha: 0.85 },
  ]
  scene.add(createSpray(em, 1.0, new THREE.Color(1.5, 1.62, 1.7), 3))
  const mist: Emitter[] = [
    { pos: new THREE.Vector3(APRON_X0 - 1.5, L.WL_DOWN + 0.5, zMid), spread: new THREE.Vector3(1.4, 0.4, wide / 2 + 0.5), vel: new THREE.Vector3(-0.3, 0.5, 0), velJitter: 0.25, count: Math.round(40 * q), life: [2.5, 4.5], size: [2.0, 3.5], alpha: 0.13 },
    { pos: new THREE.Vector3(GX - 1.2, APRON_Y + 0.6, zMid), spread: new THREE.Vector3(0.6, 0.6, wide / 2), vel: new THREE.Vector3(-0.2, 0.4, 0), velJitter: 0.2, count: Math.round(24 * q), life: [2.5, 4.0], size: [1.6, 2.6], alpha: 0.1 },
  ]
  scene.add(createSpray(mist, 1.0, new THREE.Color(1.15, 1.22, 1.3), 9))

  // ---------------------------------------------------------- 源兵衛の作業台・桟橋・ボードウォーク
  const P = L.PLATFORM
  deck(c, P.x0, P.x1, P.z0, P.z1, P.y, { alongX: true, postBottom: -1.6 })
  deck(c, 2.3, 3.7, P.z1, L.BANK_S + 0.1, 0.15, { alongX: false, postBottom: -1.6 })
  buildYagura(c)
  // 軸受けの架台
  const A = axisVec()
  const wheelP = new THREE.Vector3(L.GENBEI_WHEEL.x, L.GENBEI_WHEEL.y, L.GENBEI_WHEEL.z)
  const gearP = new THREE.Vector3(L.GEAR.x, L.GEAR.y, L.GEAR.z)
  const bearing = gearP.clone().lerp(wheelP, 0.42)
  const side = new THREE.Vector3(-A.z, 0, A.x)
  for (const s of [-1, 1]) {
    const p = bearing.clone().addScaledVector(side, s * 0.45)
    post(c, p.x, p.z, -1.6, bearing.y + 0.1, 0.26, dark())
  }
  woodBox(c, bearing.x, bearing.y - 0.24, bearing.z, 0.34, 0.24, 1.25, { rotY: Math.atan2(A.x, A.z) , tint: dark() })
  c.b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.42, 16), c.m.iron, M(bearing.x, bearing.y, bearing.z, Math.PI / 2, Math.atan2(A.x, A.z), 0))
  // 小車の架台
  const stand = wheelP.clone().addScaledVector(A, -0.35)
  for (const s of [-1, 1]) {
    const p = stand.clone().addScaledVector(side, s * 0.3)
    post(c, p.x, p.z, P.y, wheelP.y + 0.15, 0.16, dark())
  }
  c.b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 14), c.m.brass, M(stand.x, stand.y, stand.z, Math.PI / 2, Math.atan2(A.x, A.z), 0))
  // 歯止め（ラチェット）
  const ratchet = stand.clone().addScaledVector(side, 0.55)
  post(c, ratchet.x, ratchet.z, P.y, 0.95, 0.18, dark())
  c.b.add(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 12), c.m.iron, M(ratchet.x, 0.95, ratchet.z, Math.PI / 2, Math.atan2(A.x, A.z), 0))
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const loc = new THREE.Vector3(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0)
    loc.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(A.x, A.z))
    c.b.add(rbox(0.06, 0.06, 0.08, 0.01), c.m.iron, M(ratchet.x + loc.x, 0.95 + loc.y, ratchet.z + loc.z, 0, Math.atan2(A.x, A.z), a))
  }
  // 作業台の小物（歯車が隠れない南側へ）
  crate(c, 1.85, P.y, 0.7, 0.62, 0.3)
  crate(c, 1.9, P.y + 0.62, 0.72, 0.48, -0.2)
  crate(c, 4.6, P.y, 0.75, 0.66, 0.1)
  barrel(c, 2.6, P.y, 0.85)
  ropeCoil(c, 1.95, P.y, -0.2, 0.3)
  // 作業台→水門の通路へ上がる階段（南の区画の前）
  deck(c, 5.4, GX - 0.4, 4.9, 7.2, 1.4, { alongX: true, postBottom: -1.6 })
  stairs(c, 3.8, 6.0, 0.15, 1.4, 1.6, 0)
  stairs(c, GX - 1.5, 4.95, 1.4, 3.6, 1.0, -Math.PI / 2)
  railing(c, 5.4, 4.9, GX - 1.6, 4.9, 1.4, { spacing: 1.4 })
  barrel(c, 6.2, 1.4, 6.7)
  barrel(c, 6.85, 1.4, 6.6)
  crate(c, 7.6, 1.4, 6.7, 0.6, 0.2)

  // ---------------------------------------------------------- 大歯車（回転体）
  const gear = buildGear(c)
  scene.add(gear)
  let speed = 0.25
  let angle = 0
  const spin = gear.getObjectByName('spin') as THREE.Group
  c.updaters.push((dt) => {
    angle += speed * dt
    spin.rotation.z = angle
  })
  const grab = gearP.clone().add(new THREE.Vector3(0, 0.95, 0)).addScaledVector(side, 0.95).addScaledVector(A, 0.36)

  // 当たり判定：歯車と軸のおおよその箱
  c.col.box(gearP.x, gearP.y, gearP.z, 0.7, 3.1, 3.1, Math.atan2(A.x, A.z))
  return {
    gear,
    setGearSpeed(v: number) {
      speed = v
    },
    gearGrabPoint: grab,
    gearCenter: gearP,
  }
}

export function axisVec(): THREE.Vector3 {
  return new THREE.Vector3(Math.cos(L.GEAR.axisYaw), 0, Math.sin(L.GEAR.axisYaw))
}

/** 大歯車＋軸＋源兵衛の小車（同じ軸で回る） */
function buildGear(c: Ctx): THREE.Group {
  const root = new THREE.Group()
  root.name = 'bigGear'
  root.position.set(L.GEAR.x, L.GEAR.y, L.GEAR.z)
  const A = axisVec()
  root.rotation.y = Math.atan2(A.x, A.z) // ローカル +Z が軸方向（源兵衛側）
  const spin = new THREE.Group()
  spin.name = 'spin'
  root.add(spin)
  const b = new Batch()
  const R = L.GEAR.r
  const depth = 0.58
  const wt = () => woodTint(c.rng, WOOD.honey, 0.12)
  // 外輪（10 個の角材ブロック）
  const nSeg = 10
  const rMid = R * 0.74
  for (let i = 0; i < nSeg; i++) {
    const a = ((i + 0.5) / nSeg) * Math.PI * 2
    const len = 2 * rMid * Math.sin(Math.PI / nSeg) + 0.08
    b.add(rbox(len, 0.34, depth, 0.06), c.m.wood, M(Math.cos(a) * rMid, Math.sin(a) * rMid, 0, 0, 0, a + Math.PI / 2), { tint: wt(), texM: TEX_METERS.wood, uAxis: 0 })
    // 継ぎ目の鉄板とリベット
    const aj = (i / nSeg) * Math.PI * 2
    for (const zf of [-depth / 2 - 0.012, depth / 2 + 0.012]) {
      b.add(rbox(0.24, 0.44, 0.03, 0.01), c.m.iron, M(Math.cos(aj) * rMid, Math.sin(aj) * rMid, zf, 0, 0, aj + Math.PI / 2))
      for (const [dx, dy] of [
        [-0.06, -0.1],
        [0.06, -0.1],
        [-0.06, 0.1],
        [0.06, 0.1],
      ]) {
        const ca = Math.cos(aj + Math.PI / 2)
        const sa = Math.sin(aj + Math.PI / 2)
        const px = Math.cos(aj) * rMid + dx * ca - dy * sa
        const py = Math.sin(aj) * rMid + dx * sa + dy * ca
        b.add(new THREE.SphereGeometry(0.024, 6, 4), c.m.iron, M(px, py, zf + Math.sign(zf) * 0.012), { cast: false })
      }
    }
  }
  // 歯
  const nTeeth = 14
  for (let i = 0; i < nTeeth; i++) {
    const a = (i / nTeeth) * Math.PI * 2
    const r = R - 0.2
    b.add(rbox(0.4, 0.44, depth + 0.1, 0.07), c.m.wood, M(Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a + Math.PI / 2), { tint: wt(), texM: TEX_METERS.wood })
  }
  // 輻（スポーク）
  const nSp = 6
  for (let i = 0; i < nSp; i++) {
    const a = (i / nSp) * Math.PI * 2 + 0.26
    b.add(rbox(0.26, rMid - 0.35, 0.34, 0.05), c.m.wood, M(Math.cos(a) * (rMid + 0.35) / 2, Math.sin(a) * (rMid + 0.35) / 2, 0, 0, 0, a - Math.PI / 2), { tint: wt(), texM: TEX_METERS.wood, uAxis: 1 })
    b.add(rbox(0.3, 0.14, 0.38, 0.01), c.m.iron, M(Math.cos(a) * (rMid - 0.25), Math.sin(a) * (rMid - 0.25), 0, 0, 0, a - Math.PI / 2))
  }
  // 軸穴まわり
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.8, 22), c.m.wood, M(0, 0, 0, Math.PI / 2, 0, 0), { tint: wt(), uv: 'scale', uvScale: [1.6, 0.5] })
  for (const z of [-0.34, 0.34]) b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.1, 22), c.m.iron, M(0, 0, z, Math.PI / 2, 0, 0))
  b.add(new THREE.CylinderGeometry(0.3, 0.34, 0.16, 18), c.m.brass, M(0, 0, 0.44, Math.PI / 2, 0, 0))
  b.add(new THREE.TorusGeometry(0.36, 0.035, 8, 24), c.m.brass, M(0, 0, 0.4))
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    b.add(new THREE.SphereGeometry(0.035, 6, 4), c.m.iron, M(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0.4), { cast: false })
  }
  // 軸（源兵衛の小車まで）
  const wheelP = new THREE.Vector3(L.GENBEI_WHEEL.x, L.GENBEI_WHEEL.y, L.GENBEI_WHEEL.z)
  const len = wheelP.distanceTo(new THREE.Vector3(L.GEAR.x, L.GEAR.y, L.GEAR.z))
  b.add(new THREE.CylinderGeometry(0.26, 0.26, len + 0.2, 18), c.m.wood, M(0, 0, len / 2, Math.PI / 2, 0, 0), { tint: WOOD.honey, uv: 'scale', uvScale: [1.0, len / 1.6] })
  for (let k = 1; k < 5; k++) b.add(new THREE.CylinderGeometry(0.29, 0.29, 0.1, 18), c.m.iron, M(0, 0, (len * k) / 5, Math.PI / 2, 0, 0))
  // 小車（真鍮の輪＋木の輻＋握り）
  const wz = len
  b.add(new THREE.TorusGeometry(0.52, 0.045, 10, 32), c.m.brass, M(0, 0, wz))
  b.add(new THREE.TorusGeometry(0.44, 0.025, 8, 32), c.m.brass, M(0, 0, wz))
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    b.add(rbox(0.06, 0.52, 0.05, 0.015), c.m.wood, M(Math.cos(a) * 0.26, Math.sin(a) * 0.26, wz, 0, 0, a - Math.PI / 2), { tint: WOOD.honey, texM: 1 })
    b.add(new THREE.CylinderGeometry(0.035, 0.03, 0.22, 8), c.m.wood, M(Math.cos(a) * 0.65, Math.sin(a) * 0.65, wz, 0, 0, a - Math.PI / 2), { tint: WOOD.honey, uv: 'scale', uvScale: [0.2, 0.2] })
  }
  b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 12), c.m.brass, M(0, 0, wz, Math.PI / 2, 0, 0))
  const built = b.build('gearMeshes')
  built.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.matrixAutoUpdate = true
    }
  })
  spin.add(built)
  return root
}

/** 作業台の上の見張り台（やぐら）：朱の欄干・提灯・小さな屋根。おはるが立つ。 */
function buildYagura(c: Ctx): void {
  const Y = L.YAGURA
  const dark = () => woodTint(c.rng, WOOD.dark, 0.1)
  const roofY = Y.y + 2.6
  for (const [x, z] of [
    [Y.x0, Y.z0],
    [Y.x1, Y.z0],
    [Y.x0, Y.z1],
    [Y.x1, Y.z1],
  ] as const) {
    post(c, x, z, -1.6, roofY, 0.24, dark())
    ironBand(c, x, Y.y - 0.35, z, 0.28, 0.12, 0.28, false)
  }
  // 床
  deck(c, Y.x0 - 0.15, Y.x1 + 0.15, Y.z0 - 0.15, Y.z1 + 0.15, Y.y, { alongX: true, posts: false })
  // 斜材
  beamAB(c, new THREE.Vector3(Y.x0, L.PLATFORM.y + 0.3, Y.z0), new THREE.Vector3(Y.x0, Y.y - 0.3, Y.z1), 0.14, 0.16, dark())
  beamAB(c, new THREE.Vector3(Y.x1, L.PLATFORM.y + 0.3, Y.z1), new THREE.Vector3(Y.x1, Y.y - 0.3, Y.z0), 0.14, 0.16, dark())
  // 朱の欄干（北・西・東）
  railing(c, Y.x0 - 0.1, Y.z0 - 0.1, Y.x1 + 0.1, Y.z0 - 0.1, Y.y, { red: true, h: 0.8, spacing: 1.1 })
  railing(c, Y.x0 - 0.1, Y.z0 - 0.1, Y.x0 - 0.1, Y.z1 + 0.1, Y.y, { red: true, h: 0.8, spacing: 1.1 })
  railing(c, Y.x1 + 0.1, Y.z0 - 0.1, Y.x1 + 0.1, Y.z1 + 0.1, Y.y, { red: true, h: 0.8, spacing: 1.1 })
  // 屋根の梁と小屋根
  for (const z of [Y.z0, Y.z1]) woodBox(c, (Y.x0 + Y.x1) / 2, roofY, z, Y.x1 - Y.x0 + 0.5, 0.2, 0.2, { tint: dark() })
  for (const x of [Y.x0, Y.x1]) woodBox(c, x, roofY, (Y.z0 + Y.z1) / 2, 0.2, 0.2, Y.z1 - Y.z0 + 0.5, { tint: dark() })
  gableRoofLite(c, (Y.x0 + Y.x1) / 2, (Y.z0 + Y.z1) / 2, Y.x1 - Y.x0 + 1.3, Y.z1 - Y.z0 + 1.4, roofY + 0.1, 0.9)
  // 大きな提灯（おはるの左右）
  lantern(c, Y.x0 + 0.15, roofY - 0.75, Y.z0 - 0.05, { kind: 'cream', s: 1.55, cord: 0.15 })
  lantern(c, Y.x1 - 0.15, roofY - 0.75, Y.z0 - 0.05, { kind: 'cream', s: 1.55, cord: 0.15 })
  // はしご
  for (let k = 0; k < 10; k++) woodBox(c, Y.x0 + 0.6, L.PLATFORM.y + 0.3 + k * 0.29, Y.z1 - 0.2, 0.6, 0.05, 0.08, { tint: WOOD.aged })
  for (const dx of [0.3, 0.9]) woodBox(c, Y.x0 + dx, (L.PLATFORM.y + Y.y) / 2, Y.z1 - 0.2, 0.07, Y.y - L.PLATFORM.y, 0.07, { tint: WOOD.aged })
}

function gableRoofLite(c: Ctx, cx: number, cz: number, length: number, width: number, eaveY: number, rise: number): void {
  const half = width / 2
  const ang = Math.atan2(rise, half)
  const sl = Math.hypot(half, rise) + 0.05
  for (const sd of [-1, 1]) {
    c.b.add(rbox(length, 0.14, sl, 0.04), c.m.roof, M(cx, eaveY + rise / 2, cz + (sd * half) / 2, sd * ang, 0, 0), { texM: 2, uAxis: 0, flipV: sd > 0 })
  }
  c.b.add(rbox(length + 0.15, 0.2, 0.28, 0.07), c.m.roof, M(cx, eaveY + rise + 0.06, cz), { texM: 1, tint: '#9aa3b4' })
}
