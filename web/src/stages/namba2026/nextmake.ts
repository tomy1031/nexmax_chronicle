// NEXTMAKE の会社（ビルの 1 階）：入口（ガラスの自動ドア・「NEXTMAKE」の看板）→ オフィス（受付・ロゴの壁・
// ガラスの会議室とホワイトボード・カフェコーナー・島型のデスクとモニター・本棚・観葉植物、落ち着いた白い照明）→
// ガラスの仕切りの「LAB ラボ」の扉 → ラボ（作業台・工具の有孔ボード・3D プリンタ・オシロスコープ・はんだ付け台・
// ロボットアーム・部品棚・試験台・ネクマックスの構想ボード、暖かい手元の照明）。
import * as THREE from 'three'
import { M, rbox } from '../../render/batch'
import { range } from '../../render/noise'
import { N } from './layout'
import { box, boxAB, cyl, sign, decal, sag, type NCtx } from './kit'

const NM = N.NM
const WALL_IN = '#f3f1ec'
const NAVY = '#16294f'

export type NextmakeParts = {
  /** 佐伯の固定具（帰還後に作業台に現れる） */
  fixture: THREE.Group
  /** 動くロボットアーム */
  arm: THREE.Group
  update(dt: number, t: number): void
}

export function buildNextmake(c: NCtx): NextmakeParts {
  exterior(c)
  shell(c)
  office(c)
  partition(c)
  const arm = lab(c)
  const fixture = buildFixture()
  fixture.position.set(-9.15, 0.99, 22.05)
  fixture.visible = false
  c.root.add(fixture)
  let t = 0
  return {
    fixture,
    arm,
    update(dt: number) {
      t += dt
      const base = arm.children[0]
      if (base) base.rotation.y = Math.sin(t * 0.45) * 0.9
      const a1 = arm.getObjectByName('j1')
      const a2 = arm.getObjectByName('j2')
      if (a1) a1.rotation.z = -0.5 + Math.sin(t * 0.6) * 0.25
      if (a2) a2.rotation.z = 1.1 + Math.sin(t * 0.6 + 1) * 0.3
      if (fixture.visible) fixture.rotation.y += dt * 0.6
    },
  }
}

// ------------------------------------------------------------------ 外観

function exterior(c: NCtx): void {
  const zf = NM.z0
  const H = 17.6
  // 1 階：ガラスの店構え（縦の方立て）と入口
  const glassY0 = 0.05
  const glassY1 = 3.5
  for (let x = NM.x0 + 0.4; x <= NM.x1 - 0.39; x += 1.5) {
    if (x > NM.door0 - 0.05 && x < NM.door1 + 0.05) continue
    boxAB(c, x - 0.05, x + 0.05, 0, glassY1, zf - 0.06, zf + 0.06, c.m.metal, { tint: '#2a2f38' })
  }
  for (const dx of [NM.door0, NM.door1]) boxAB(c, dx - 0.08, dx + 0.08, 0, glassY1, zf - 0.08, zf + 0.08, c.m.metal, { tint: '#2a2f38' })
  boxAB(c, NM.x0 + 0.3, NM.x1 - 0.3, glassY1, glassY1 + 0.12, zf - 0.08, zf + 0.08, c.m.metal, { tint: '#2a2f38' })
  boxAB(c, NM.x0 + 0.3, NM.x1 - 0.3, 0, 0.08, zf - 0.06, zf + 0.06, c.m.metal, { tint: '#2a2f38' })
  const glass = (x0: number, x1: number) => c.b.add(new THREE.PlaneGeometry(x1 - x0, glassY1 - glassY0), c.m.glass, M((x0 + x1) / 2, (glassY0 + glassY1) / 2, zf, 0, Math.PI, 0), { cast: false })
  glass(NM.x0 + 0.3, NM.door0)
  glass(NM.door1, NM.x1 - 0.3)
  // 開いた自動ドア（両脇に寄せたガラス戸）
  for (const [x0, x1] of [
    [NM.door0 - 1.1, NM.door0 - 0.05],
    [NM.door1 + 0.05, NM.door1 + 1.1],
  ]) {
    c.b.add(new THREE.PlaneGeometry(x1 - x0, 2.9), c.m.glass, M((x0 + x1) / 2, 1.5, zf - 0.12, 0, Math.PI, 0), { cast: false })
    boxAB(c, x0, x1, 2.9, 3.0, zf - 0.15, zf - 0.09, c.m.metal, { tint: '#3a3f48' })
  }
  // ガラスと壁の当たり判定（入口は開ける）
  c.col.box((NM.x0 + NM.door0) / 2, 1.8, zf, NM.door0 - NM.x0, 3.6, 0.3)
  c.col.box((NM.door1 + NM.x1) / 2, 1.8, zf, NM.x1 - NM.door1, 3.6, 0.3)
  // 入口のひさしと足元のマット
  c.b.add(rbox(4.6, 0.14, 1.6, 0.02), c.m.metal, M((NM.door0 + NM.door1) / 2, 3.15, zf - 0.75), { tint: '#e8ecf0' })
  boxAB(c, NM.door0, NM.door1, 0, 0.012, zf - 1.2, zf + 0.8, c.m.fabric, { tint: '#3a4250', cast: false })
  // 看板の帯（紺）と「NEXTMAKE」の光る看板
  boxAB(c, NM.x0, NM.x1, 3.62, 4.7, zf - 0.22, zf + 0.1, c.m.paint, { tint: NAVY })
  sign(c, 'nm_logo', (NM.x0 + NM.x1) / 2 - 1.2, 4.16, zf - 0.24, Math.PI, 6.6, 1.08, { glow: true, depth: 0.06 })
  // 上の階：カーテンウォールの窓と白い縦のルーバー
  const g = new THREE.PlaneGeometry(NM.x1 - NM.x0 - 0.6, H - 5.2)
  c.b.add(g, c.m.windows, M((NM.x0 + NM.x1) / 2, 4.8 + (H - 5.2) / 2, zf - 0.02, 0, Math.PI, 0), { uv: 'scale', uvScale: [10 / 4, 4 / 4], cast: false })
  for (let x = NM.x0 + 0.3; x <= NM.x1 - 0.29; x += 1.75) boxAB(c, x - 0.08, x + 0.08, 4.7, H, zf - 0.45, zf - 0.02, c.m.plaster, { tint: '#f6f4f0', texM: 2 })
  for (let f = 0; f < 4; f++) {
    const y = 4.7 + f * 3.15
    boxAB(c, NM.x0, NM.x1, y - 0.12, y + 0.06, zf - 0.3, zf, c.m.plaster, { tint: '#eae6e0', texM: 2, cast: false })
  }
  // 本体の箱（側面・背面・屋上）
  boxAB(c, NM.x0, NM.x0 + 0.3, 0, H, zf, NM.z1, c.m.plaster, { texM: 2.5, tint: '#e6e2da' })
  boxAB(c, NM.x1 - 0.3, NM.x1, 0, H, zf, NM.z1, c.m.plaster, { texM: 2.5, tint: '#e6e2da' })
  boxAB(c, NM.x0, NM.x1, 0, H, NM.z1 - 0.3, NM.z1, c.m.plaster, { texM: 2.5, tint: '#e6e2da' })
  boxAB(c, NM.x0, NM.x1, NM.ceil + 0.6, H, zf + 0.05, NM.z1, c.m.plaster, { texM: 2.5, tint: '#e2ded6' })
  boxAB(c, NM.x0, NM.x1, H, H + 0.6, zf, NM.z1, c.m.plaster, { texM: 2, tint: '#d8d4cc' })
  c.col.box(NM.x0 + 0.15, 2, (zf + NM.z1) / 2, 0.3, 4, NM.z1 - zf)
  c.col.box(NM.x1 - 0.15, 2, (zf + NM.z1) / 2, 0.3, 4, NM.z1 - zf)
  c.col.box((NM.x0 + NM.x1) / 2, 2, NM.z1 - 0.15, NM.x1 - NM.x0, 4, 0.3)
  // 入口の両脇の植え込み
  for (const px of [NM.door0 - 1.9, NM.door1 + 1.9]) {
    boxAB(c, px - 0.6, px + 0.6, 0, 0.55, zf - 0.85, zf - 0.25, c.m.concrete, { tint: '#bdb8b0', collide: true })
    bush(c, px, 0.55, zf - 0.55, 0.55, 1.1)
  }
  c.lights.push({ pos: new THREE.Vector3((NM.door0 + NM.door1) / 2, 2.9, zf - 0.9), color: '#fff0d8', intensity: 2.0, dist: 7 })
}

/** 低い植え込み（葉のカードの塊） */
function bush(c: NCtx, x: number, y: number, z: number, r: number, w = 1): void {
  for (let k = 0; k < 9; k++) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(range(c.rng, 0, Math.PI), range(c.rng, 0, Math.PI), range(c.rng, 0, Math.PI)))
    const p = new THREE.Vector3(x + range(c.rng, -w / 2, w / 2) * 0.8, y + range(c.rng, 0.05, r), z + range(c.rng, -0.2, 0.2))
    const g = new THREE.PlaneGeometry(1, 1)
    const n = g.attributes.normal as THREE.BufferAttribute
    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < n.count; i++) n.setXYZ(i, pos.getX(i), 0.7, pos.getY(i))
    c.b.add(g, c.m.leaf, new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1).multiplyScalar(r * 1.3)), { tint: new THREE.Color().setHSL(0.27, 0.45, 0.42), uv: 'keep' })
  }
}

/** 鉢植えの観葉植物 */
function plant(c: NCtx, x: number, z: number, s = 1): void {
  cyl(c, x, 0, 0.45 * s, z, 0.24 * s, c.m.plastic, { r1: 0.28 * s, tint: '#f2f0ea', seg: 14 })
  cyl(c, x, 0.42 * s, 0.46 * s, z, 0.26 * s, c.m.rubber, { tint: '#3a2a1e', seg: 14 })
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + range(c.rng, -0.2, 0.2)
    const h = range(c.rng, 0.5, 1.2) * s
    const p = new THREE.Vector3(x + Math.cos(a) * 0.18 * s, 0.45 * s + h * 0.6, z + Math.sin(a) * 0.18 * s)
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(range(c.rng, -0.6, 0.6), a, range(c.rng, -0.4, 0.4)))
    const g = new THREE.PlaneGeometry(0.55 * s, h * 1.1)
    c.b.add(g, c.m.leaf, new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1)), { tint: new THREE.Color().setHSL(0.3, 0.5, 0.36 + range(c.rng, 0, 0.1)), uv: 'keep' })
  }
  c.col.box(x, 0.5 * s, z, 0.5 * s, 1 * s, 0.5 * s)
}

// ------------------------------------------------------------------ 内装の箱（床・天井・壁）

function shell(c: NCtx): void {
  const x0 = NM.x0 + 0.3
  const x1 = NM.x1 - 0.3
  // 床：オフィスは木目のフローリング、ラボは塗装の床
  boxAB(c, x0, x1, 0, 0.025, NM.z0 + 0.08, NM.part, c.m.floorWood, { texM: 2.2, tint: '#ffffff', r: 0.002 })
  boxAB(c, x0, x1, 0, 0.025, NM.part, NM.z1 - 0.3, c.m.epoxy, { texM: 3, tint: '#ffffff', r: 0.002 })
  c.col.floor(x0, x1, NM.z0, NM.z1, 0.025, 0.5)
  // 天井（下面が室内）と照明
  boxAB(c, NM.x0, NM.x1, NM.ceil, NM.ceil + 0.6, NM.z0 + 0.05, NM.z1, c.m.ceiling, { tint: '#f6f6f4' })
  // オフィス：白い角形の照明パネル
  for (let x = -17; x <= -2; x += 3) {
    for (const z of [12.6, 15.3]) {
      boxAB(c, x - 0.6, x + 0.6, NM.ceil - 0.05, NM.ceil, z - 0.3, z + 0.3, c.m.lightCool, { cast: false })
    }
  }
  // 内壁（オフィスは白、ラボは明るい灰色）。外壁の内側に薄い板を貼って色を変える
  boxAB(c, x0, x0 + 0.04, 0, NM.ceil, NM.z0 + 0.1, NM.part, c.m.wall, { tint: WALL_IN, texM: 2.5 })
  boxAB(c, x1 - 0.04, x1, 0, NM.ceil, NM.z0 + 0.1, NM.part, c.m.wall, { tint: WALL_IN, texM: 2.5 })
  boxAB(c, x0, x0 + 0.04, 0, NM.ceil, NM.part, NM.z1 - 0.3, c.m.wall, { tint: '#e2e6ea', texM: 2.5 })
  boxAB(c, x1 - 0.04, x1, 0, NM.ceil, NM.part, NM.z1 - 0.3, c.m.wall, { tint: '#e2e6ea', texM: 2.5 })
  boxAB(c, x0, x1, 0, NM.ceil, NM.z1 - 0.34, NM.z1 - 0.3, c.m.wall, { tint: '#dde2e8', texM: 2.5 })
  // ラボの奥の壁のアクセント（紺の帯）
  boxAB(c, x0, x1, 2.7, 2.85, NM.z1 - 0.36, NM.z1 - 0.33, c.m.paint, { tint: NAVY, cast: false })
  // 腰の巾木
  boxAB(c, x0, x1, 0, 0.1, NM.z1 - 0.36, NM.z1 - 0.32, c.m.paint, { tint: '#5a6068', cast: false })
  // 照明の当たり（点光源の候補）：オフィスは白、ラボは暖色
  for (const [x, z] of [
    [-10, 12.6],
    [-4.5, 14.2],
    [-13.5, 15.8],
    [-17, 13.3],
  ])
    c.lights.push({ pos: new THREE.Vector3(x, 3.1, z), color: '#eef4ff', intensity: 2.0, dist: 8 })
  for (const [x, z] of [
    [-14, 21.3],
    [-9.2, 21.3],
    [-4.8, 21.3],
    [-13.5, 19.4],
  ])
    c.lights.push({ pos: new THREE.Vector3(x, 2.5, z), color: '#ffc27a', intensity: 2.4, dist: 7 })
}

// ------------------------------------------------------------------ オフィス

function desk(c: NCtx, x: number, z: number, facing: 1 | -1, screen: number): void {
  // facing：座る人が向く方向（z の符号）
  boxAB(c, x - 0.78, x + 0.78, 0.72, 0.76, z - 0.36, z + 0.36, c.m.woodPlain, { tint: '#e8d8c0' })
  for (const sx of [-0.72, 0.72]) boxAB(c, x + sx - 0.03, x + sx + 0.03, 0.025, 0.72, z - 0.32, z + 0.32, c.m.metal, { tint: '#d8dce2' })
  c.col.box(x, 0.4, z, 1.6, 0.8, 0.74)
  // モニター（奥側）とキーボード・ノート PC
  const mz = z - facing * 0.18
  const rot = facing > 0 ? 0 : Math.PI
  boxAB(c, x - 0.04, x + 0.04, 0.76, 1.02, mz - 0.03, mz + 0.03, c.m.metal, { tint: '#2a2d33' })
  box(c, x, 1.2, mz, 0.62, 0.38, 0.03, c.m.plastic, { tint: '#1a1c20', rotY: rot })
  decal(c, c.inner.get(`screen_${screen}`), x, 1.2, mz + facing * 0.017, rot, 0.58, 0.34, c.innerGlow)
  box(c, x, 0.775, z + facing * 0.08, 0.42, 0.015, 0.14, c.m.plastic, { tint: '#e8eaee', rotY: rot, cast: false })
  // ノート PC（半分開き）
  const lx = x + 0.48
  box(c, lx, 0.772, z + facing * 0.05, 0.32, 0.012, 0.22, c.m.metal, { tint: '#c8ccd2', rotY: rot, cast: false })
  c.b.add(rbox(0.32, 0.2, 0.01, 0.003), c.m.metal, M(lx, 0.87, z - facing * 0.06, facing * -0.25, rot, 0), { tint: '#c8ccd2', cast: false })
  decal(c, c.inner.get(`screen_${(screen + 1) % 4}`), lx, 0.87, z - facing * 0.054, rot, 0.28, 0.17, c.innerGlow)
  // マグカップ
  cyl(c, x - 0.5, 0.76, 0.86, z + facing * 0.1, 0.04, c.m.plastic, { tint: ['#e85a4a', '#4a8ae8', '#f2c84b'][screen % 3], seg: 10 })
  chair(c, x, z + facing * 0.7, facing)
}

function chair(c: NCtx, x: number, z: number, facing: 1 | -1): void {
  cyl(c, x, 0.05, 0.42, z, 0.03, c.m.metal, { tint: '#3a3f48', seg: 8 })
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2
    box(c, x + Math.cos(a) * 0.2, 0.05, z + Math.sin(a) * 0.2, 0.36, 0.04, 0.05, c.m.metal, { tint: '#2a2d33', rotY: -a, cast: false })
  }
  c.b.add(rbox(0.5, 0.08, 0.48, 0.03), c.m.fabric, M(x, 0.46, z), { tint: '#3a4a64' })
  c.b.add(rbox(0.48, 0.56, 0.07, 0.03), c.m.fabric, M(x, 0.8, z + facing * 0.24, facing * 0.12, 0, 0), { tint: '#3a4a64' })
}

function office(c: NCtx): void {
  // 受付カウンター（白い天板＋紺の腰）とロゴの壁
  boxAB(c, -14.6, -12.2, 0.025, 1.0, 12.7, 13.3, c.m.paint, { tint: NAVY, collide: true })
  boxAB(c, -14.7, -12.1, 1.0, 1.06, 12.62, 13.38, c.m.woodPlain, { tint: '#f2ede4' })
  decal(c, c.inner.get('reception'), -13.4, 0.72, 12.69, Math.PI, 1.9, 0.36, c.innerMat)
  boxAB(c, -15.3, -11.6, 0.025, 2.8, 13.9, 14.12, c.m.wall, { tint: '#f8f6f2', texM: 2, collide: true })
  decal(c, c.inner.get('logo_wall'), -13.45, 1.75, 13.885, Math.PI, 3.2, 1.6, c.innerMat)
  box(c, -13.4, 1.12, 13.0, 0.36, 0.03, 0.26, c.m.plastic, { tint: '#e8eaee', cast: false })
  // 会議室（ガラスの壁）とホワイトボード
  const mx0 = NM.x0 + 0.3
  const mx1 = -15.6
  const mz1 = 15.3
  glassWall(c, mx1, NM.z0 + 0.3, mx1, mz1, [14.3, 15.2])
  glassWall(c, mx0, mz1, mx1, mz1)
  boxAB(c, -18.1, -16.1, 0.72, 0.77, 12.6, 14.0, c.m.woodPlain, { tint: '#f0e6d6', collide: true })
  for (const sx of [-17.9, -16.3]) for (const sz of [12.8, 13.8]) boxAB(c, sx - 0.03, sx + 0.03, 0.025, 0.72, sz - 0.03, sz + 0.03, c.m.metal, { tint: '#c8ccd2' })
  for (const [cx, cz, f] of [
    [-17.6, 12.1, -1],
    [-16.6, 12.1, -1],
    [-17.6, 14.5, 1],
    [-16.6, 14.5, 1],
  ] as const)
    chair(c, cx, cz, f)
  boxAB(c, mx0 + 0.02, mx0 + 0.06, 0.85, 2.3, 12.2, 14.6, c.m.metal, { tint: '#c8ccd2' })
  decal(c, c.inner.get('meeting_board'), mx0 + 0.07, 1.57, 13.4, Math.PI / 2, 2.3, 1.36, c.innerMat)
  // カフェコーナー（ロゴの壁の裏）
  boxAB(c, -15.3, -11.4, 0.025, 0.95, 16.45, 17.05, c.m.woodPlain, { tint: '#d8c0a0', collide: true })
  boxAB(c, -15.35, -11.35, 0.95, 1.0, 16.4, 17.1, c.m.stone, { tint: '#f4f0ea', texM: 1 })
  box(c, -14.6, 1.25, 16.8, 0.36, 0.5, 0.36, c.m.metal, { tint: '#2a2d33' })
  box(c, -14.6, 1.12, 16.6, 0.1, 0.04, 0.12, c.m.metal, { tint: '#c8ccd2', cast: false })
  for (let i = 0; i < 4; i++) cyl(c, -13.6 + i * 0.22, 1.0, 1.12, 16.75, 0.045, c.m.plastic, { tint: ['#ffffff', '#e85a4a', '#4a8ae8', '#f2c84b'][i], seg: 10 })
  box(c, -11.95, 0.95, 16.8, 0.6, 1.9, 0.55, c.m.metal, { tint: '#e8ecf0', collide: true })
  decal(c, c.inner.get('cafe_menu'), -13.1, 1.7, 17.06 - 0.12, Math.PI, 0.9, 0.68, c.innerMat)
  cyl(c, -13.1, 0.025, 1.0, 15.6, 0.04, c.m.metal, { tint: '#3a3f48', seg: 8 })
  cyl(c, -13.1, 1.0, 1.04, 15.6, 0.38, c.m.woodPlain, { tint: '#e8d8c0', seg: 20 })
  c.col.box(-13.1, 0.5, 15.6, 0.7, 1.0, 0.7)
  for (const sx of [-13.8, -12.4]) {
    cyl(c, sx, 0.025, 0.72, 15.6, 0.025, c.m.metal, { tint: '#3a3f48', seg: 8 })
    cyl(c, sx, 0.72, 0.78, 15.6, 0.18, c.m.fabric, { tint: '#c86a3a', seg: 14 })
  }
  decal(c, c.inner.get('poster_1'), -14.4, 1.85, 14.125, 0, 0.7, 0.98, c.innerMat)
  decal(c, c.inner.get('poster_0'), -12.5, 1.85, 14.125, 0, 0.7, 0.98, c.innerMat)
  // 島型のデスク（向かい合わせ 2 列 × 3）
  let s = 0
  for (const x of [-7.0, -5.0, -3.0]) {
    desk(c, x, 12.85, -1, s++ % 4)
    desk(c, x, 14.05, 1, s++ % 4)
  }
  // 本棚（東の壁）
  const bx = NM.x1 - 0.3 - 0.22
  for (const z0 of [11.8, 13.8]) {
    boxAB(c, bx - 0.2, bx + 0.2, 0.025, 2.2, z0, z0 + 1.9, c.m.woodPlain, { tint: '#d8c4a6', collide: true })
    for (let k = 0; k < 4; k++) decal(c, c.inner.get('books'), bx - 0.205, 0.45 + k * 0.5, z0 + 0.95, -Math.PI / 2, 1.8, 0.36, c.innerMat)
  }
  decal(c, c.inner.get('poster_0'), NM.x1 - 0.35, 2.8, 16.2, -Math.PI / 2, 0.55, 0.75, c.innerMat)
  // 観葉植物
  plant(c, NM.door0 - 0.6, 11.7, 1.1)
  plant(c, NM.door1 + 0.6, 11.7, 1.0)
  plant(c, -1.95, 16.6, 1.2)
  plant(c, -15.0, 11.7, 0.9)
  plant(c, -8.6, 16.6, 0.9)
}

/** ガラスの壁（下と上の枠・縦の方立て）。door=[a,b] は開けておく区間（壁に沿った座標） */
function glassWall(c: NCtx, x0: number, z0: number, x1: number, z1: number, door?: [number, number]): void {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0)
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1)
  const a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1)
  const fixed = alongX ? z0 : x0
  const segs: Array<[number, number]> = door ? [[a0, door[0]], [door[1], a1]] : [[a0, a1]]
  const top = NM.ceil - 0.02
  for (const [s0, s1] of segs) {
    if (s1 - s0 < 0.05) continue
    const mid = (s0 + s1) / 2
    const len = s1 - s0
    const px = alongX ? mid : fixed
    const pz = alongX ? fixed : mid
    const rot = alongX ? 0 : Math.PI / 2
    c.b.add(new THREE.PlaneGeometry(len, top - 0.06), c.m.glass, M(px, (top + 0.06) / 2, pz, 0, rot, 0), { cast: false })
    // 目隠しのすりガラスの帯
    c.b.add(new THREE.PlaneGeometry(len, 0.35), c.m.glassFrost, M(px, 1.2, pz, 0, rot, 0), { cast: false })
    for (let k = 0; k <= Math.ceil(len / 1.4); k++) {
      const a = Math.min(s1, s0 + k * (len / Math.max(1, Math.ceil(len / 1.4))))
      const qx = alongX ? a : fixed
      const qz = alongX ? fixed : a
      boxAB(c, qx - 0.03, qx + 0.03, 0.02, top, qz - 0.03, qz + 0.03, c.m.metal, { tint: '#2a2f38' })
    }
    if (alongX) {
      boxAB(c, s0, s1, 0.02, 0.07, fixed - 0.04, fixed + 0.04, c.m.metal, { tint: '#2a2f38' })
      boxAB(c, s0, s1, top - 0.06, top, fixed - 0.04, fixed + 0.04, c.m.metal, { tint: '#2a2f38' })
      c.col.box(mid, 1.8, fixed, len, 3.6, 0.12)
    } else {
      boxAB(c, fixed - 0.04, fixed + 0.04, 0.02, 0.07, s0, s1, c.m.metal, { tint: '#2a2f38' })
      boxAB(c, fixed - 0.04, fixed + 0.04, top - 0.06, top, s0, s1, c.m.metal, { tint: '#2a2f38' })
      c.col.box(fixed, 1.8, mid, 0.12, 3.6, len)
    }
  }
}

// ------------------------------------------------------------------ 仕切り（オフィス｜ラボ）

function partition(c: NCtx): void {
  glassWall(c, NM.x0 + 0.3, NM.part, NM.x1 - 0.3, NM.part, [NM.lab0, NM.lab1])
  // 「LAB ラボ」の看板（両側から読める）
  const cx = (NM.lab0 + NM.lab1) / 2
  boxAB(c, NM.lab0 - 0.1, NM.lab1 + 0.1, 2.55, 2.95, NM.part - 0.05, NM.part + 0.05, c.m.paint, { tint: NAVY })
  sign(c, 'lab_door', cx, 2.75, NM.part - 0.06, Math.PI, 1.7, 0.42, { glow: true, depth: 0.02, inner: true })
  sign(c, 'lab_door', cx, 2.75, NM.part + 0.06, 0, 1.7, 0.42, { glow: true, depth: 0.02, inner: true })
  // 床の境目の金物
  boxAB(c, NM.lab0, NM.lab1, 0.02, 0.04, NM.part - 0.06, NM.part + 0.06, c.m.metal, { tint: '#b8bcc2', cast: false })
}

// ------------------------------------------------------------------ ラボ

function workbench(c: NCtx, x0: number, x1: number, z0: number, z1: number): void {
  boxAB(c, x0, x1, 0.92, 0.98, z0, z1, c.m.woodPlain, { tint: '#c8a070' })
  for (const sx of [x0 + 0.08, x1 - 0.08]) for (const sz of [z0 + 0.08, z1 - 0.08]) boxAB(c, sx - 0.04, sx + 0.04, 0.025, 0.92, sz - 0.04, sz + 0.04, c.m.metal, { tint: '#3a3f48' })
  boxAB(c, x0 + 0.1, x1 - 0.1, 0.25, 0.29, z0 + 0.06, z1 - 0.06, c.m.metal, { tint: '#5a6068' })
  c.col.box((x0 + x1) / 2, 0.5, (z0 + z1) / 2, x1 - x0, 1.0, z1 - z0)
}

function pendant(c: NCtx, x: number, z: number): void {
  cyl(c, x, 2.62, NM.ceil, z, 0.008, c.m.metal, { tint: '#1a1c20', seg: 4, cast: false })
  c.b.add(new THREE.ConeGeometry(0.22, 0.2, 16, 1, true), c.m.metal, M(x, 2.55, z), { tint: '#2a2d33', cast: false })
  c.b.add(new THREE.SphereGeometry(0.07, 10, 6), c.m.lightWarm, M(x, 2.47, z), { cast: false })
}

function lab(c: NCtx): THREE.Group {
  const bz0 = NM.z1 - 0.34 - 0.75
  const bz1 = NM.z1 - 0.34
  workbench(c, -16.6, -11.8, bz0, bz1)
  workbench(c, -10.9, -7.4, bz0, bz1)
  workbench(c, -6.6, -2.4, bz0, bz1)
  // 有孔ボード（工具）
  decal(c, c.inner.get('pegboard'), -14.2, 1.85, bz1 - 0.005, Math.PI, 4.2, 1.2, c.innerMat)
  decal(c, c.inner.get('pegboard'), -4.5, 1.85, bz1 - 0.005, Math.PI, 3.6, 1.2, c.innerMat)
  for (const x of [-14.2, -9.15, -4.5]) pendant(c, x, bz0 + 0.3)
  // 作業台の上の物：工具箱・部品・ケーブル・はんだ付け台・オシロスコープ・3D プリンタ
  const top = 0.98
  box(c, -15.6, top + 0.12, bz0 + 0.35, 0.5, 0.24, 0.3, c.m.paint, { tint: '#d83a2a' })
  box(c, -15.6, top + 0.26, bz0 + 0.35, 0.46, 0.04, 0.26, c.m.metal, { tint: '#c8ccd2' })
  for (let i = 0; i < 6; i++) box(c, -14.4 + i * 0.32, top + 0.03, bz0 + 0.3 + (i % 2) * 0.12, 0.18, 0.06, 0.12, c.m.plastic, { tint: ['#3a8ae2', '#f2c84b', '#4ab86a', '#e8eaee', '#e24a3a', '#2a2d33'][i], cast: false })
  // オシロスコープ（佐伯の作業台の左）
  box(c, -10.3, top + 0.2, bz0 + 0.4, 0.5, 0.36, 0.34, c.m.paint, { tint: '#d8dce2' })
  decal(c, c.inner.get('scope'), -10.36, top + 0.22, bz0 + 0.225, Math.PI, 0.3, 0.19, c.innerGlow)
  for (let k = 0; k < 4; k++) cyl(c, -10.12, top + 0.12 + k * 0.06, top + 0.14 + k * 0.06, bz0 + 0.22, 0.015, c.m.plastic, { tint: '#2a2d33', seg: 8 })
  // はんだ付け台（台・こて台・拡大鏡のアーム）
  box(c, -8.1, top + 0.05, bz0 + 0.35, 0.36, 0.1, 0.24, c.m.paint, { tint: '#2a6ad8' })
  c.b.add(new THREE.TorusGeometry(0.05, 0.012, 6, 14), c.m.metal, M(-7.9, top + 0.16, bz0 + 0.35, 0.4, 0, 0), { tint: '#c8ccd2', cast: false })
  cyl(c, -8.35, top, top + 0.35, bz0 + 0.5, 0.012, c.m.metal, { tint: '#8a8e94', seg: 6 })
  c.b.add(new THREE.TorusGeometry(0.09, 0.015, 8, 20), c.m.metal, M(-8.25, top + 0.38, bz0 + 0.4, Math.PI / 2 - 0.5, 0, 0), { tint: '#2a2d33', cast: false })
  // 3D プリンタ（フレーム・光る造形台・フィラメント）
  const px = -5.4
  const pz = bz0 + 0.4
  boxAB(c, px - 0.3, px + 0.3, top, top + 0.08, pz - 0.3, pz + 0.3, c.m.metal, { tint: '#2a2d33' })
  for (const sx of [-0.27, 0.27]) for (const sz of [-0.27, 0.27]) boxAB(c, px + sx - 0.02, px + sx + 0.02, top, top + 0.62, pz + sz - 0.02, pz + sz + 0.02, c.m.metal, { tint: '#3a3f48' })
  boxAB(c, px - 0.3, px + 0.3, top + 0.6, top + 0.66, pz - 0.3, pz + 0.3, c.m.metal, { tint: '#2a2d33' })
  boxAB(c, px - 0.2, px + 0.2, top + 0.14, top + 0.16, pz - 0.2, pz + 0.2, c.m.lightWarm, { tint: '#ffb070', cast: false })
  box(c, px, top + 0.24, pz, 0.12, 0.16, 0.1, c.m.plastic, { tint: '#8ccbf5', cast: false })
  c.b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 18), c.m.plastic, M(px + 0.5, top + 0.18, pz, Math.PI / 2, 0, 0), { tint: '#f28a2a' })
  // 大きい 3D プリンタ（台車の上）
  const qx = -2.3
  const qz = 19.4
  boxAB(c, qx - 0.55, qx + 0.55, 0.025, 0.8, qz - 0.45, qz + 0.45, c.m.paint, { tint: '#e8ecf0', collide: true })
  boxAB(c, qx - 0.5, qx + 0.5, 0.8, 1.9, qz - 0.42, qz + 0.42, c.m.paint, { tint: '#f4f6f8' })
  c.b.add(new THREE.PlaneGeometry(0.8, 0.8), c.m.glass, M(qx - 0.51, 1.35, qz, 0, -Math.PI / 2, 0), { cast: false })
  boxAB(c, qx - 0.45, qx - 0.44, 1.0, 1.05, qz - 0.3, qz + 0.3, c.m.lightWarm, { cast: false })
  box(c, qx - 0.3, 1.18, qz, 0.18, 0.22, 0.18, c.m.plastic, { tint: '#f2c84b', cast: false })
  c.col.box(qx, 1.0, qz, 1.1, 2.0, 0.9)
  // 部品棚（色とりどりの小箱）
  const rx = NM.x1 - 0.3 - 0.25
  boxAB(c, rx - 0.22, rx + 0.22, 0.025, 2.2, 17.8, 21.0, c.m.metal, { tint: '#9aa0a8', collide: true })
  for (let r = 0; r < 6; r++) {
    for (let k = 0; k < 7; k++) {
      box(c, rx - 0.24, 0.3 + r * 0.32, 18.05 + k * 0.43, 0.08, 0.22, 0.36, c.m.plastic, { tint: ['#3a8ae2', '#f2c84b', '#e24a3a', '#4ab86a', '#f08a2a'][(r + k) % 5], cast: false })
    }
  }
  // 試験台（試作の腕：玉をつないだ水色の腕）
  const tx = -4.3
  const tz = 19.3
  boxAB(c, tx - 0.6, tx + 0.6, 0.025, 0.8, tz - 0.4, tz + 0.4, c.m.metal, { tint: '#5a6068', collide: true })
  boxAB(c, tx - 0.04, tx + 0.04, 0.8, 1.75, tz - 0.04, tz + 0.04, c.m.metal, { tint: '#3a3f48' })
  boxAB(c, tx - 0.04, tx + 0.45, 1.7, 1.76, tz - 0.04, tz + 0.04, c.m.metal, { tint: '#3a3f48' })
  for (let k = 0; k < 5; k++) {
    const r = k % 2 ? 0.045 : 0.06
    c.b.add(new THREE.SphereGeometry(r, 14, 10), c.m.plastic, M(tx + 0.42, 1.62 - k * 0.12, tz), { tint: '#8ccbf5' })
  }
  sag(c, new THREE.Vector3(tx + 0.42, 1.0, tz), new THREE.Vector3(tx + 0.2, 0.82, tz + 0.2), 0.05, 0.012, c.m.rubber, '#e24a3a')
  // 床のケーブル
  sag(c, new THREE.Vector3(-10.2, 0.98, bz0 + 0.1), new THREE.Vector3(-8.0, 0.98, bz0 + 0.1), 0.85, 0.012, c.m.rubber, '#2a2d33')
  // 構想ボード（西の壁）：マツイ社長の手描きのネクマックス
  const wx = NM.x0 + 0.34
  boxAB(c, wx, wx + 0.05, 0.85, 2.65, 18.55, 21.25, c.m.metal, { tint: '#c8ccd2' })
  decal(c, c.inner.get('concept_board'), wx + 0.055, 1.75, 19.9, Math.PI / 2, 2.6, 1.52, c.innerMat)
  // ロボットアーム（台座の上でゆっくり動く）
  const arm = robotArm(c)
  arm.position.set(-13.4, 0, 19.4)
  c.root.add(arm)
  c.col.box(-13.4, 0.5, 19.4, 0.8, 1.0, 0.8)
  boxAB(c, -13.8, -13.0, 0.025, 0.7, 19.0, 19.8, c.m.paint, { tint: '#3a3f48' })
  return arm
}

/** ロボットアーム（橙と白）。arm.children[0] が台の回転、j1・j2 が関節 */
function robotArm(c: NCtx): THREE.Group {
  const orange = new THREE.MeshStandardMaterial({ color: '#f28a2a', roughness: 0.4 })
  const white = new THREE.MeshStandardMaterial({ color: '#eef0f2', roughness: 0.4 })
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.5, metalness: 0.4 })
  void c
  const g = new THREE.Group()
  g.name = 'robot_arm'
  const turn = new THREE.Group()
  turn.position.y = 0.7
  g.add(turn)
  const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, m)
    o.position.set(x, y, z)
    o.castShadow = true
    o.receiveShadow = true
    return o
  }
  turn.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.16, 20), white, 0, 0.08, 0))
  const j1 = new THREE.Group()
  j1.name = 'j1'
  j1.position.y = 0.22
  turn.add(j1)
  j1.add(mesh(new THREE.SphereGeometry(0.11, 16, 12), dark))
  const up = mesh(new THREE.BoxGeometry(0.14, 0.62, 0.14), orange, 0, 0.32, 0)
  j1.add(up)
  const j2 = new THREE.Group()
  j2.name = 'j2'
  j2.position.y = 0.64
  j1.add(j2)
  j2.add(mesh(new THREE.SphereGeometry(0.09, 16, 12), dark))
  j2.add(mesh(new THREE.BoxGeometry(0.11, 0.5, 0.11), white, 0, 0.26, 0))
  const hand = new THREE.Group()
  hand.position.y = 0.52
  j2.add(hand)
  hand.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 14), dark))
  for (const s of [-1, 1]) {
    const f = mesh(new THREE.BoxGeometry(0.025, 0.12, 0.05), orange, s * 0.04, 0.09, 0)
    f.rotation.z = s * -0.25
    hand.add(f)
  }
  return g
}

/** 佐伯の小さな固定具（NMClaw の取り付け部に合う、歯止めの爪つきの金具） */
function buildFixture(): THREE.Group {
  const g = new THREE.Group()
  g.name = 'saeki_fixture'
  const steel = new THREE.MeshStandardMaterial({ color: '#c8ccd2', metalness: 0.85, roughness: 0.28 })
  const accent = new THREE.MeshStandardMaterial({ color: '#f2a03a', metalness: 0.2, roughness: 0.4, emissive: new THREE.Color('#5a3008'), emissiveIntensity: 0.6 })
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 10, 24), steel)
  ring.rotation.x = Math.PI / 2
  ring.position.y = 0.03
  g.add(ring)
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.06), steel)
  plate.position.set(0.08, 0.03, 0)
  g.add(plate)
  const pawl = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.06, 4), accent)
  pawl.rotation.z = -Math.PI / 2
  pawl.position.set(0.17, 0.03, 0)
  g.add(pawl)
  for (const m of g.children) {
    m.castShadow = true
  }
  return g
}
