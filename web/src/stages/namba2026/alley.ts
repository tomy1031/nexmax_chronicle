// 古い路地（導入編 6-6：石標 C の置き場所）。串カツの店とお好み焼の店のあいだの細い路地。
// 石畳・焼杉の板塀・小さな瓦の庇・提灯・苔むした石灯籠・植木鉢・頭上の電線。入口の梁に「うら横丁」の木の看板。
// 明るい遊歩道から一歩入ると、時間が止まったような暗くて暖かい場所（奥の石標が「からくりの噂」の記録）。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { makeCanvas } from '../../render/textures'
import { N } from './layout'
import { box, boxAB, cyl, sag, type NCtx } from './kit'

const A0 = N.ALLEY

/**
 * open：物語 v7（9 章）の路地。奥の塀をなくして、南の空き地（ほこらのある「路地のおく」）へ抜ける。
 * 両側の板塀は z1（空き地の手前）までのばし、石灯籠と桶は東の塀ぎわへ移す（西の塀ぎわに石標 C を置くため）
 */
export type AlleyOptions = { open?: boolean; z1?: number }

/** 入口の木の看板（筆文字。2026年なので左から右の横書き） */
function signTexture(): THREE.CanvasTexture {
  const [cv, g] = makeCanvas(512, 160)
  const gr = g.createLinearGradient(0, 0, 0, 160)
  gr.addColorStop(0, '#6a4a2c')
  gr.addColorStop(1, '#4a321e')
  g.fillStyle = gr
  g.fillRect(0, 0, 512, 160)
  // 木目
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(30,18,8,${0.08 + (i % 5) * 0.02})`
    g.lineWidth = 1 + (i % 3)
    g.beginPath()
    const y = (i / 40) * 160
    g.moveTo(0, y)
    g.bezierCurveTo(170, y + 6, 340, y - 6, 512, y + 3)
    g.stroke()
  }
  g.strokeStyle = '#2a1a0c'
  g.lineWidth = 8
  g.strokeRect(6, 6, 500, 148)
  g.fillStyle = '#f4ead2'
  g.font = '400 92px "Yuji Boku","Hiragino Mincho ProN",serif'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('うら横丁', 256, 84)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

/** 提灯（白い紙に赤い帯。光る） */
function paperLantern(c: NCtx, x: number, y: number, z: number, s = 1): void {
  c.b.add(new THREE.SphereGeometry(0.2 * s, 14, 10), c.m.lampGlow, M(x, y, z, 0, 0, 0, 1, 1.25, 1), { tint: '#fff2dc', cast: false })
  cyl(c, x, y - 0.06 * s, y + 0.06 * s, z, 0.202 * s, c.m.paint, { tint: '#b8281c', seg: 14, cast: false })
  cyl(c, x, y + 0.24 * s, y + 0.3 * s, z, 0.1 * s, c.m.paint, { tint: '#1a1410', seg: 10, cast: false })
  cyl(c, x, y - 0.3 * s, y - 0.24 * s, z, 0.1 * s, c.m.paint, { tint: '#1a1410', seg: 10, cast: false })
}

export function buildAlley(c: NCtx, opts: AlleyOptions = {}): void {
  const open = !!opts.open
  const A = { ...A0, z1: open ? (opts.z1 ?? 20) : A0.z1 }
  const cx = (A.x0 + A.x1) / 2
  const len = A.z1 - A.z0
  // 石畳（大きさの違う古い石。少し暗く、ところどころ苔の色）
  boxAB(c, A.x0, A.x1, -0.02, 0.006, A.z0, A.z1, c.m.stone, { tint: '#7c7a74', texM: 1.1, cast: false })
  let z = A.z0 + 0.1
  let row = 0
  while (z < A.z1 - 0.3) {
    const d = 0.42 + ((row * 37) % 5) * 0.06
    let x = A.x0 + 0.12 + (row % 2 ? 0.25 : 0)
    while (x < A.x1 - 0.3) {
      const w = 0.5 + (((row + 1) * (x * 10)) % 3) * 0.12
      const ww = Math.min(w, A.x1 - 0.12 - x)
      const k = (row * 7 + Math.round(x * 13)) % 9
      const tint = k === 0 ? '#6f7a62' : k < 4 ? '#8a877e' : '#9a958a'
      c.b.add(rbox(ww - 0.05, 0.03, d - 0.05, 0.012), c.m.stone, M(x + ww / 2, 0.012, z + d / 2), { tint, texM: 0.7, cast: false })
      x += ww
    }
    z += d
    row++
  }
  // 焼杉の板塀（両側）と縦の押縁
  for (const [x0, x1, inner] of [
    [A.x0, A.x0 + 0.12, A.x0 + 0.12],
    [A.x1 - 0.12, A.x1, A.x1 - 0.12],
  ] as const) {
    boxAB(c, x0, x1, 0, 3.0, A.z0 + 0.6, A.z1, c.m.woodPlain, { tint: '#3e3026', cast: true })
    c.col.box((x0 + x1) / 2, 1.5, (A.z0 + A.z1) / 2, 0.16, 3.0, len)
    const dir = inner === x1 ? 1 : -1
    for (let bz = A.z0 + 0.8; bz < A.z1 - 0.1; bz += 0.46) box(c, inner + dir * 0.02, 1.5, bz, 0.04, 3.0, 0.06, c.m.woodPlain, { tint: '#2c221a', cast: false })
    // 腰板（下の方が少し明るい古い板）
    boxAB(c, inner, inner + dir * 0.03, 0.05, 0.9, A.z0 + 0.6, A.z1, c.m.woodPlain, { tint: '#5a4632', cast: false })
    // 小さな瓦の庇（板塀の上、路地の内側へ少し張り出す）
    const ex = inner + dir * 0.32
    c.b.add(rbox(0.7, 0.08, len - 0.6, 0.02), c.m.paint, M(ex, 3.05, (A.z0 + 0.6 + A.z1) / 2, 0, 0, -dir * 0.32), { tint: '#3a3d44' })
    for (let bz = A.z0 + 0.7; bz < A.z1; bz += 0.22) c.b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6, 1, false, 0, Math.PI), c.m.paint, M(ex, 3.1, bz, 0, 0, Math.PI / 2 - dir * 0.32), { tint: '#4a4e56', cast: false })
  }
  // 奥の塀と小さな屋根（v7 の open では空き地へ抜けるので作らない）
  if (!open) {
    boxAB(c, A.x0, A.x1, 0, 3.2, A.z1 - 0.12, A.z1 + 0.1, c.m.woodPlain, { tint: '#3a2c22' })
    c.col.box(cx, 1.6, A.z1, A.x1 - A.x0, 3.2, 0.24)
    c.b.add(rbox(A.x1 - A.x0 + 0.2, 0.08, 0.7, 0.02), c.m.paint, M(cx, 3.25, A.z1 - 0.3, 0.3, 0, 0), { tint: '#3a3d44' })
  }
  // 入口の梁と「うら横丁」の看板
  boxAB(c, A.x0 - 0.05, A.x1 + 0.05, 3.35, 3.55, A.z0 + 0.15, A.z0 + 0.35, c.m.woodPlain, { tint: '#3a2a1c' })
  for (const px of [A.x0 + 0.08, A.x1 - 0.08]) boxAB(c, px - 0.08, px + 0.08, 0, 3.55, A.z0 + 0.17, A.z0 + 0.33, c.m.woodPlain, { tint: '#3a2a1c' })
  c.col.box(A.x0 + 0.08, 1.7, A.z0 + 0.25, 0.18, 3.4, 0.18)
  c.col.box(A.x1 - 0.08, 1.7, A.z0 + 0.25, 0.18, 3.4, 0.18)
  const signMat = new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.7 })
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.53), signMat)
  sign.position.set(cx, 3.05, A.z0 + 0.12)
  sign.rotation.y = Math.PI
  c.root.add(sign)
  const signBack = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: '#2a1a0c', roughness: 0.8 }))
  signBack.position.set(cx, 3.05, A.z0 + 0.15)
  c.root.add(signBack)
  // 提灯（入口の梁に 2 つ、路地の両側に）
  paperLantern(c, A.x0 + 0.45, 2.9, A.z0 + 0.25, 1)
  paperLantern(c, A.x1 - 0.45, 2.9, A.z0 + 0.25, 1)
  for (let i = 0; i < 3; i++) {
    const lz = A.z0 + 2.2 + i * 2.1
    const side = i % 2 ? A.x1 - 0.42 : A.x0 + 0.42
    box(c, side + (i % 2 ? 0.2 : -0.2), 2.62, lz, 0.4, 0.04, 0.04, c.m.metal, { tint: '#2a2d33', cast: false })
    paperLantern(c, side, 2.38, lz, 0.85)
  }
  c.lights.push({ pos: new THREE.Vector3(cx, 2.6, A.z0 + 2.5), color: '#ffb070', intensity: 2.4, dist: 6 })
  c.lights.push({ pos: new THREE.Vector3(cx, 2.4, (open ? A0.z1 : A.z1) - 1.6), color: '#ffa860', intensity: 2.6, dist: 6 })
  // 苔むした石灯籠（石標の左奥。open では東の塀ぎわ、空き地の手前）
  const lx = open ? A.x1 - 0.42 : A.x0 + 0.42
  const lz = open ? A.z1 - 0.9 : A.z1 - 0.5
  boxAB(c, lx - 0.22, lx + 0.22, 0, 0.12, lz - 0.22, lz + 0.22, c.m.stone, { tint: '#8a8a7c', texM: 0.6 })
  cyl(c, lx, 0.12, 0.72, lz, 0.08, c.m.stone, { tint: '#8c8a7e', seg: 8 })
  boxAB(c, lx - 0.2, lx + 0.2, 0.72, 0.8, lz - 0.2, lz + 0.2, c.m.stone, { tint: '#7a8070', texM: 0.6 })
  boxAB(c, lx - 0.15, lx + 0.15, 0.8, 1.06, lz - 0.15, lz + 0.15, c.m.stone, { tint: '#8a8a7c', texM: 0.6 })
  c.b.add(new THREE.ConeGeometry(0.3, 0.2, 4), c.m.stone, M(lx, 1.16, lz, 0, Math.PI / 4, 0), { tint: '#6e7a62', texM: 0.6 })
  c.b.add(new THREE.SphereGeometry(0.05, 8, 6), c.m.stone, M(lx, 1.29, lz), { tint: '#7a7a6c' })
  box(c, lx, 0.93, lz - 0.152, 0.14, 0.12, 0.01, c.m.lightWarm, { tint: '#ffd8a0', cast: false })
  if (open) box(c, lx - 0.152, 0.93, lz, 0.01, 0.12, 0.14, c.m.lightWarm, { tint: '#ffd8a0', cast: false })
  c.col.box(lx, 0.6, lz, 0.44, 1.2, 0.44)
  // 植木鉢と古い桶
  for (const [px, pz, s] of [
    [A.x1 - 0.32, A.z0 + 1.4, 1],
    [A.x1 - 0.3, A.z0 + 4.4, 0.8],
    [A.x0 + 0.3, A.z0 + 3.3, 0.9],
  ] as const) {
    cyl(c, px, 0, 0.32 * s, pz, 0.16 * s, c.m.paint, { r1: 0.2 * s, tint: '#7a4a32', seg: 12 })
    c.b.add(new THREE.SphereGeometry(0.24 * s, 10, 8), c.m.fabric, M(px, 0.45 * s, pz, 0, 0, 0, 1, 0.8, 1), { tint: '#4a7a3a', cast: false })
  }
  if (open) cyl(c, A.x1 - 0.35, 0, 0.38, A.z1 - 1.7, 0.2, c.m.woodPlain, { r1: 0.22, tint: '#8a6a44', seg: 14 })
  else cyl(c, A.x1 - 0.35, 0, 0.38, A.z1 - 0.55, 0.2, c.m.woodPlain, { r1: 0.22, tint: '#8a6a44', seg: 14 })
  // 頭上の電線と、壁の古い配電箱
  sag(c, new THREE.Vector3(A.x0 + 0.1, 3.9, A.z0 + 1.2), new THREE.Vector3(A.x1 - 0.1, 4.0, A.z0 + 3.4), 0.3, 0.012, c.m.rubber, '#1a1c20')
  sag(c, new THREE.Vector3(A.x0 + 0.1, 4.1, A.z0 + 4.0), new THREE.Vector3(A.x1 - 0.1, 3.95, A.z0 + 5.6), 0.35, 0.012, c.m.rubber, '#1a1c20')
  box(c, A.x0 + 0.16, 1.9, A.z0 + 5.4, 0.08, 0.5, 0.36, c.m.metal, { tint: '#8a9096' })
}
