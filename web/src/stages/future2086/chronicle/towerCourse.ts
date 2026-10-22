// 4 章の時計台のぼり（物語 v7.1：「ひたすらクローを押すだけ」をやめて、ジャンプ・タイミング・よける・クローのまぜあわせにする）。
// 配置は layoutChronicle.ts の COURSE。ここは形（足場・大歯車・大きな針・回る歯車の金具・予告の帯・がれき）と、動き。
// ・大歯車（水平に回る 3 枚）：当たり判定は動かない円柱（回っても形は同じ）。乗っている間は carry() で一緒に回す
// ・大きな針：軸のまわりを北 ⇔ 南に行き来して、両はしで止まる（キネマティックの板。乗ると一緒に回る）
// ・回る歯車の金具：壁の面で回る歯車のふちの金具。上に回ってきた時だけ金色に光って、ねらえる（ステージが enabled を決める）
// ・黒い手がはらう予告（渡り廊下 B の壁の帯と床の線）・がれき（赤い輪 → 落ちる）
// 動きの計算（角度・窓・どの足場の上か）は純粋な関数にして、tests/chronicle2086Additions.test.ts で確かめる。
import * as THREE from 'three'
import type RAPIER from '@dimforge/rapier3d-compat'
import { Batch, M, rbox } from '../../../render/batch'
import { uTime } from '../../../render/materials'
import type { ClawTargetDef } from '../../../player/clawLogic'
import type { Physics } from '../../../player/physics'
import type { PlayerController } from '../../../player/controller'
import { NEON, fbox, glowRailing, neon, type FCtx } from '../kit2086'
import { COURSE, type GearHookSpec, type GearSpec, type Ledge } from './layoutChronicle'
import { additive, softDotTexture } from './kitChronicle'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ------------------------------------------------------------------ 動きの計算（純粋）

export type HandState = 'north' | 'toSouth' | 'south' | 'toNorth'

/** 大きな針の向き（軸から針先への水平の角。方向は (cos θ, 0, sin θ)）。北 = -π/2、西を通って南 = -3π/2 */
export const HAND_NORTH = -Math.PI / 2
export const HAND_SOUTH = -Math.PI * 1.5

/** 時刻 t の大きな針の角度と状態（両はしで dwell 秒止まり、travel 秒でなめらかに回る） */
export function handAt(t: number, s: { dwell: number; travel: number } = COURSE.hand): { theta: number; state: HandState; left: number } {
  const cyc = 2 * (s.dwell + s.travel)
  const k = ((t % cyc) + cyc) % cyc
  const ease = (x: number) => x * x * (3 - 2 * x)
  if (k < s.dwell) return { theta: HAND_NORTH, state: 'north', left: s.dwell - k }
  if (k < s.dwell + s.travel) {
    const u = (k - s.dwell) / s.travel
    return { theta: HAND_NORTH + (HAND_SOUTH - HAND_NORTH) * ease(u), state: 'toSouth', left: s.dwell + s.travel - k }
  }
  if (k < 2 * s.dwell + s.travel) return { theta: HAND_SOUTH, state: 'south', left: 2 * s.dwell + s.travel - k }
  const u = (k - 2 * s.dwell - s.travel) / s.travel
  return { theta: HAND_SOUTH + (HAND_NORTH - HAND_SOUTH) * ease(u), state: 'toNorth', left: cyc - k }
}

/** 回る歯車の金具の角度（0 = てっぺん。-π..π） */
export function gearHookAngle(t: number, s: Pick<GearHookSpec, 'w'>): number {
  const a = s.w * t
  return Math.atan2(Math.sin(a), Math.cos(a))
}

/** 金具が「上」に来ているか（ねらえる窓） */
export function gearHookInWindow(angle: number, s: Pick<GearHookSpec, 'window'>): boolean {
  return Math.abs(angle) <= s.window
}

/** 金具の輪の、歯車のふちからの出っぱり（m） */
export const GEAR_HOOK_OUT = 0.18

/** 金具の位置（壁の面の歯車のふちの外。少し手前＝西へ出す） */
export function gearHookPoint(s: Pick<GearHookSpec, 'c' | 'r'>, angle: number, out = new THREE.Vector3()): THREE.Vector3 {
  const r = s.r + GEAR_HOOK_OUT
  return out.set(s.c.x - 0.16, s.c.y + Math.cos(angle) * r, s.c.z + Math.sin(angle) * r)
}

/** 足もと p が足場の上か（上面の高さ ±dy） */
export function onLedge(p: { x: number; y: number; z: number }, L: Pick<Ledge, 'x0' | 'x1' | 'z0' | 'z1' | 'y'>, dy = 0.35, pad = 0.05): boolean {
  return p.x >= L.x0 - pad && p.x <= L.x1 + pad && p.z >= L.z0 - pad && p.z <= L.z1 + pad && Math.abs(p.y - L.y) <= dy
}

/** 足もと p が大歯車の上か（どの歯車か。無ければ -1） */
export function onGear(p: { x: number; y: number; z: number }, gears: readonly GearSpec[] = COURSE.gears): number {
  return gears.findIndex((g) => Math.hypot(p.x - g.c.x, p.z - g.c.z) <= g.r + 0.12 && Math.abs(p.y - g.c.y) <= 0.25)
}

/** 足もと p が大きな針の上か（針の角 theta のとき） */
export function onHand(p: { x: number; y: number; z: number }, theta: number, h = COURSE.hand): boolean {
  const dx = p.x - h.pivot.x
  const dz = p.z - h.pivot.z
  const along = dx * Math.cos(theta) + dz * Math.sin(theta)
  const across = -dx * Math.sin(theta) + dz * Math.cos(theta)
  return along >= -0.5 && along <= h.len + 0.12 && Math.abs(across) <= h.width / 2 + 0.08 && Math.abs(p.y - h.pivot.y) <= 0.25
}

// ------------------------------------------------------------------ 形

export type GearHookRuntime = {
  spec: GearHookSpec
  def: ClawTargetDef
  angle: number
  inWindow: boolean
}

export type TowerCourseParts = {
  group: THREE.Group
  /** 回る歯車の金具（つかめる対象。fs.claw.targets にも入れる） */
  gearHooks: GearHookRuntime[]
  /** 大きな針のいまの角度と状態 */
  readonly hand: ReturnType<typeof handAt>
  /** 時間を進めて、形と当たり判定を動かす（ステージの update で毎フレーム） */
  update(dt: number): void
  /** 動く足場に乗っているプレイヤーを、足場と一緒に動かす（update のあとで） */
  carry(player: PlayerController, dt: number): void
  /** 渡り廊下 B の黒い手の予告（0..1） */
  setSweepWarn(k: number): void
  /** がれきを落とす（at：落ちる所の足もと）。warn 秒の予告の輪のあと、落ちて当たる。当たった瞬間に onHit(at) */
  dropDebris(at: THREE.Vector3, onHit: (at: THREE.Vector3) => void, warn?: number): void
  clearDebris(): void
  setNight(on: boolean): void
  attachPhysics(phys: Physics): void
  dispose(): void
}

/** がれきの予告の秒（1.2 秒以上） */
export const DEBRIS_WARN = 1.45
const DEBRIS_FALL = 0.35

const warnVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const warnFrag = /* glsl */ `
uniform float uK;
uniform float uTime;
varying vec2 vUv;
void main() {
  float y = abs(vUv.y - 0.5) * 2.0;
  float band = (1.0 - smoothstep(0.2, 1.0, y));
  float sweep = 0.55 + 0.45 * sin(vUv.x * 18.0 + uTime * 12.0);
  float pulse = 0.6 + 0.4 * sin(uTime * 9.0);
  float a = band * uK * pulse * (0.6 + 0.4 * sweep);
  gl_FragColor = vec4(vec3(2.8, 0.25, 0.5) * a, a);
}
`
const ringFrag = /* glsl */ `
uniform float uFill;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  if (r > 1.0) discard;
  float edge = smoothstep(0.78, 0.9, r) * (1.0 - smoothstep(0.96, 1.0, r));
  float fill = (1.0 - smoothstep(uFill - 0.04, uFill, r)) * 0.45;
  float pulse = 0.7 + 0.3 * sin(uTime * 14.0);
  float a = (edge + fill) * pulse;
  gl_FragColor = vec4(vec3(2.8, 0.25, 0.35) * a, a);
}
`

export function buildTowerCourse(c: FCtx, root: THREE.Group): TowerCourseParts {
  const group = new THREE.Group()
  group.name = 'tower_course'
  root.add(group)
  const C = COURSE

  // ---- 動かない足場（A・B）と、支え
  const ledge = (L: Ledge, supports: Array<[number, number]>) => {
    const cx = (L.x0 + L.x1) / 2
    const cz = (L.z0 + L.z1) / 2
    fbox(c, c.fm.panel, cx, L.y - 0.15, cz, L.x1 - L.x0, 0.3, L.z1 - L.z0, { r: 0.07, tint: '#ffffff' })
    c.col.box(cx, L.y - 0.15, cz, L.x1 - L.x0, 0.3, L.z1 - L.z0)
    neon(c, v(L.x0 - 0.01, L.y - 0.2, L.z0), v(L.x0 - 0.01, L.y - 0.2, L.z1), 0.045, NEON.cyan)
    neon(c, v(L.x0, L.y - 0.2, L.z1 + 0.01), v(L.x1, L.y - 0.2, L.z1 + 0.01), 0.045, NEON.cyan)
    neon(c, v(L.x0, L.y - 0.2, L.z0 - 0.01), v(L.x1, L.y - 0.2, L.z0 - 0.01), 0.045, NEON.cyan)
    for (const [x, z] of supports) {
      c.b.add(new THREE.CylinderGeometry(0.12, 0.14, L.y - 0.3, 10), c.fm.darkMetal, M(x, (L.y - 0.3) / 2, z))
    }
  }
  ledge(C.A, [
    [2.8, -31.9],
    [2.8, -30.1],
  ])
  ledge(C.B, [])
  // B は建物の壁から腕で支える（下の A の上を空けて、金具が見えるように）
  for (const z of [C.B.z0 + 0.3, C.B.z1 - 0.3]) c.b.add(rbox(0.12, 1.6, 0.12, 0.02), c.fm.darkMetal, M(5.7, C.B.y - 0.9, z, 0, 0, 0.75))
  // B の手すり（西＝通りの側。南の端は針が来るので開けておく）。当たり判定は見えない壁（カメラが寄りすぎないように）
  glowRailing(c, C.B.x0 + 0.05, C.B.z0 + 0.05, C.B.x0 + 0.05, C.B.z1 - 0.05, C.B.y, { h: 0.85, collider: false })
  c.col.wall(C.B.x0 + 0.05, C.B.z0 + 0.05, C.B.x0 + 0.05, C.B.z1 - 0.05, C.B.y, C.B.y + 1.2, 0.2)
  glowRailing(c, C.B.x0 + 0.05, C.B.z0 + 0.05, C.B.x1 - 0.05, C.B.z0 + 0.05, C.B.y, { h: 0.85, collider: false })
  c.col.wall(C.B.x0 + 0.05, C.B.z0 + 0.05, C.B.x1 - 0.05, C.B.z0 + 0.05, C.B.y, C.B.y + 1.2, 0.2)
  // 足もとの印（着いたらそこがやり直しの所）：A・B の上の、うすく光る輪
  for (const p of [v(3.2, C.A.y, -31.0), v(5.4, C.B.y, -32.4)]) c.b.add(new THREE.RingGeometry(0.3, 0.37, 28), c.fm.glow, M(p.x, p.y + 0.012, p.z, -Math.PI / 2, 0, 0), { tint: new THREE.Color(0.25, 0.7, 1.0), cast: false, receive: false })

  // ---- 大歯車（水平に回る 3 枚）。足の柱は動かない
  const gearMeshes: THREE.Group[] = []
  for (const g of C.gears) {
    c.b.add(new THREE.CylinderGeometry(0.28, 0.34, g.c.y - 0.32, 14), c.fm.darkMetal, M(g.c.x, (g.c.y - 0.32) / 2, g.c.z))
    c.b.add(new THREE.CylinderGeometry(0.5, 0.6, 0.12, 18), c.fm.metal, M(g.c.x, 0.06, g.c.z))
    const b = new Batch()
    b.add(new THREE.CylinderGeometry(g.r, g.r, 0.3, 48), c.fm.plastic, M(0, -0.15, 0), { tint: '#f4f6fb' })
    b.add(new THREE.CylinderGeometry(g.r * 0.62, g.r * 0.62, 0.02, 40), c.fm.navyGloss, M(0, 0.005, 0))
    b.add(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 20), c.m.brass, M(0, 0.02, 0))
    const teeth = 16
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2
      b.add(rbox(0.26, 0.24, 0.22, 0.03), c.fm.darkMetal, M(Math.cos(a) * (g.r + 0.06), -0.15, Math.sin(a) * (g.r + 0.06), 0, -a, 0))
    }
    // 4 本の光る線（回っているのが分かるように）
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2
      b.add(new THREE.BoxGeometry(g.r * 0.62, 0.025, 0.07), c.fm.glow, M(Math.cos(a) * g.r * 0.5, 0.012, Math.sin(a) * g.r * 0.5, 0, -a, 0), { tint: NEON.cyan, cast: false, receive: false })
    }
    b.add(new THREE.TorusGeometry(g.r - 0.04, 0.025, 6, 48), c.fm.glow, M(0, 0.005, 0, Math.PI / 2, 0, 0), { tint: NEON.cyan, cast: false, receive: false })
    const m = b.build('tower_gear')
    m.position.copy(g.c)
    group.add(m)
    gearMeshes.push(m)
  }

  // ---- 大きな針（軸の柱は動かない。針は軸のまわりを回る）
  const H = C.hand
  c.b.add(new THREE.CylinderGeometry(0.22, 0.3, H.pivot.y - 0.4, 14), c.fm.darkMetal, M(H.pivot.x, (H.pivot.y - 0.4) / 2, H.pivot.z))
  c.b.add(new THREE.CylinderGeometry(0.55, 0.65, 0.14, 20), c.fm.metal, M(H.pivot.x, 0.07, H.pivot.z))
  const handMesh = (() => {
    const b = new Batch()
    const w = H.width
    // 紺の針（上面は足場と同じ高さ）と金のふち、先の矢じり、根もとの丸い飾り
    b.add(rbox(H.len, 0.24, w, 0.05), c.fm.navyGloss, M(H.len / 2, -0.12, 0))
    for (const s of [-1, 1]) b.add(rbox(H.len - 0.2, 0.06, 0.06, 0.02), c.m.gold, M(H.len / 2, -0.01, s * (w / 2 - 0.03)))
    const tip = new THREE.CylinderGeometry(0, w * 0.75, 0.24, 3, 1)
    b.add(tip, c.m.gold, M(H.len + 0.02, -0.12, 0, 0, Math.PI / 2, -Math.PI / 2))
    b.add(new THREE.CylinderGeometry(0.62, 0.62, 0.26, 28), c.m.gold, M(0, -0.13, 0))
    b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20), c.fm.navyGloss, M(0, 0.01, 0))
    b.add(new THREE.BoxGeometry(H.len - 0.7, 0.02, 0.08), c.fm.glow, M(H.len / 2 + 0.25, 0.005, 0), { tint: NEON.warm, cast: false, receive: false })
    const g = b.build('tower_hand')
    g.position.copy(H.pivot)
    group.add(g)
    return g
  })()

  // ---- 回る歯車の金具（壁の面の歯車。軸は X）
  const GOLD = new THREE.Color('#ffd36b')
  const gearHooks: GearHookRuntime[] = []
  const hookParts: Array<{ wheel: THREE.Group; ring: THREE.Mesh; halo: THREE.Mesh; haloMat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial; back: THREE.Mesh }> = []
  for (const s of [C.hook1, C.hook2]) {
    const b = new Batch()
    b.add(new THREE.CylinderGeometry(s.r, s.r, 0.16, 48), c.fm.plastic, M(0, 0, 0, 0, 0, Math.PI / 2), { tint: '#eef2f8' })
    b.add(new THREE.CylinderGeometry(s.r * 0.55, s.r * 0.55, 0.18, 32), c.fm.navyGloss, M(-0.01, 0, 0, 0, 0, Math.PI / 2))
    const teeth = 18
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2
      b.add(rbox(0.16, 0.24, 0.2, 0.03), c.fm.darkMetal, M(0, Math.cos(a) * (s.r + 0.08), Math.sin(a) * (s.r + 0.08), -a, 0, 0))
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2
      b.add(new THREE.BoxGeometry(0.03, s.r * 0.9, 0.07), c.fm.glow, M(-0.1, Math.cos(a) * s.r * 0.45, Math.sin(a) * s.r * 0.45, -a, 0, 0), { tint: NEON.cyan, cast: false, receive: false })
    }
    // 金具の腕（ふち → 金具）
    b.add(rbox(0.12, 0.3, 0.1, 0.02), c.fm.darkMetal, M(-0.1, s.r - 0.05, 0))
    const wheel = b.build('gear_hook_wheel')
    wheel.position.copy(s.c)
    group.add(wheel)
    // 軸の飾り（壁に止める）
    c.b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.3, 16), c.m.brass, M(s.c.x - 0.05, s.c.y, s.c.z, 0, 0, Math.PI / 2))
    // 金具の輪（真鍮）と、ねらえる時の金色の輪・後光。歯車の子にして一緒に回す
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#8a7a52'), toneMapped: false, fog: false })
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 10, 28), ringMat)
    ring.rotation.y = Math.PI / 2
    ring.position.set(-0.16, s.r + GEAR_HOOK_OUT, 0)
    wheel.add(ring)
    const haloMat = additive(GOLD, 0)
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 36), haloMat)
    halo.rotation.y = -Math.PI / 2
    halo.position.copy(ring.position).add(v(-0.02, 0, 0))
    halo.renderOrder = 8
    ;(halo.material as THREE.Material).depthTest = false
    wheel.add(halo)
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), additive(GOLD, 0, softDotTexture()))
    back.rotation.y = -Math.PI / 2
    back.position.copy(ring.position).add(v(0.03, 0, 0))
    back.renderOrder = 7
    wheel.add(back)
    hookParts.push({ wheel, ring, halo, haloMat, ringMat, back })
    const def: ClawTargetDef = {
      id: s.id,
      type: 'pull_player',
      label: '回る歯車の金具',
      point: gearHookPoint(s, 0).clone(),
      radius: 0.45,
      enabled: false,
      noLineOfSight: true,
      landing: s.landing.clone(),
      via: s.via.clone(),
    }
    gearHooks.push({ spec: s, def, angle: 0, inWindow: false })
  }

  // ---- 黒い手がはらう予告（B の壁の帯と、床の赤い線）
  const sweepMat = new THREE.ShaderMaterial({ vertexShader: warnVert, fragmentShader: warnFrag, uniforms: { uK: { value: 0 }, uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })
  const SW = C.sweep
  const sweepLen = SW.z1 - SW.z0
  const sweepWall = new THREE.Mesh(new THREE.PlaneGeometry(sweepLen + 0.4, 1.3), sweepMat)
  sweepWall.position.set(SW.x - 0.03, SW.y + 0.6, (SW.z0 + SW.z1) / 2)
  sweepWall.rotation.y = -Math.PI / 2
  sweepWall.renderOrder = 5
  const sweepFloor = new THREE.Mesh(new THREE.PlaneGeometry(sweepLen, 1.3), sweepMat)
  sweepFloor.position.set((C.B.x0 + C.B.x1) / 2, SW.y + 0.02, (SW.z0 + SW.z1) / 2)
  sweepFloor.rotation.set(-Math.PI / 2, 0, Math.PI / 2)
  sweepFloor.renderOrder = 5
  sweepWall.visible = sweepFloor.visible = false
  group.add(sweepWall, sweepFloor)

  // ---- がれき（予告の輪と、落ちてくるかけら）。3 つを使い回す
  type Rock = { ring: THREE.Mesh; ringU: { uFill: { value: number }; uTime: { value: number } }; rock: THREE.Mesh; at: THREE.Vector3; t: number; warn: number; hit: ((at: THREE.Vector3) => void) | null; on: boolean }
  const rocks: Rock[] = []
  const rockGeo = rbox(0.62, 0.42, 0.5, 0.06)
  const rockMat = new THREE.MeshStandardMaterial({ color: '#cdd3dc', roughness: 0.7, metalness: 0.1 })
  for (let i = 0; i < 3; i++) {
    const ringU = { uFill: { value: 0 }, uTime }
    const ring = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.7),
      new THREE.ShaderMaterial({ vertexShader: warnVert, fragmentShader: ringFrag, uniforms: ringU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.renderOrder = 6
    ring.visible = false
    const rock = new THREE.Mesh(rockGeo, rockMat)
    rock.castShadow = true
    rock.visible = false
    group.add(ring, rock)
    rocks.push({ ring, ringU, rock, at: new THREE.Vector3(), t: 0, warn: DEBRIS_WARN, hit: null, on: false })
  }

  // ---- 当たり判定（begin で）
  let handBody: RAPIER.RigidBody | null = null
  const q = new THREE.Quaternion()
  const Y = v(0, 1, 0)

  let t = 0
  let hand = handAt(0)
  let lastTheta = hand.theta
  const gearAngles = C.gears.map(() => 0)
  let night = false

  const syncHand = () => {
    handMesh.rotation.y = -hand.theta
    if (handBody) {
      q.setFromAxisAngle(Y, -hand.theta)
      handBody.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
    }
  }

  const parts: TowerCourseParts = {
    group,
    gearHooks,
    get hand() {
      return hand
    },
    update(dt: number) {
      t += dt
      lastTheta = hand.theta
      hand = handAt(t)
      syncHand()
      C.gears.forEach((g, i) => {
        gearAngles[i] = g.w * t
        gearMeshes[i].rotation.y = -gearAngles[i]
      })
      const now = uTime.value
      gearHooks.forEach((h, i) => {
        h.angle = gearHookAngle(t, h.spec)
        h.inWindow = gearHookInWindow(h.angle, h.spec)
        gearHookPoint(h.spec, h.angle, h.def.point)
        // 金具の輪が歯車の子なので、歯車を回す（金具が角 angle の所に来る）
        hookParts[i].wheel.rotation.x = h.angle
        const p = hookParts[i]
        const on = h.inWindow ? 1 : 0
        const k = (now * 1.2) % 1
        p.halo.scale.setScalar(1 + k * 0.8)
        p.haloMat.opacity = on * 0.9 * (1 - k) * (1 - k)
        ;(p.back.material as THREE.MeshBasicMaterial).opacity = on * 0.55
        p.ringMat.color.copy(h.inWindow ? GOLD.clone().multiplyScalar(1.8) : new THREE.Color(night ? '#b0a070' : '#8a7a52'))
      })
      for (const r of rocks) {
        if (!r.on) continue
        r.t += dt
        if (r.t < r.warn) {
          r.ring.visible = true
          r.ringU.uFill.value = r.t / r.warn
          r.rock.visible = r.t > r.warn - DEBRIS_FALL
          if (r.rock.visible) {
            const u = (r.t - (r.warn - DEBRIS_FALL)) / DEBRIS_FALL
            r.rock.position.set(r.at.x, r.at.y + 0.21 + (1 - u * u) * 7, r.at.z)
            r.rock.rotation.set(u * 3, u * 2, 0)
          }
        } else if (r.hit) {
          const f = r.hit
          r.hit = null
          r.rock.position.set(r.at.x, r.at.y + 0.21, r.at.z)
          f(r.at)
        } else if (r.t > r.warn + 0.9) {
          r.on = false
          r.ring.visible = r.rock.visible = false
        } else {
          r.ring.visible = false
          // 落ちたかけらは少し沈んで消える
          r.rock.position.y -= dt * 0.6
        }
      }
    },
    carry(player: PlayerController, dt: number) {
      if (!player.grounded || player.isExternal) return
      const p = player.position
      let da = 0
      let cx = 0
      let cz = 0
      const gi = onGear(p)
      if (gi >= 0) {
        da = C.gears[gi].w * dt
        cx = C.gears[gi].c.x
        cz = C.gears[gi].c.z
      } else if (onHand(p, lastTheta) || onHand(p, hand.theta)) {
        da = hand.theta - lastTheta
        cx = H.pivot.x
        cz = H.pivot.z
      }
      if (Math.abs(da) < 1e-6) return
      // 回転の向き：角 a は (cos a, sin a) の向き。歯車の見た目は rotation.y = -a（上から見て反時計回りが正）
      const dx = p.x - cx
      const dz = p.z - cz
      const cs = Math.cos(da)
      const sn = Math.sin(da)
      const nx = cx + dx * cs - dz * sn
      const nz = cz + dx * sn + dz * cs
      const vel = player.velocity.clone()
      player.teleport(new THREE.Vector3(nx, p.y, nz))
      player.velocity.copy(vel)
      player.facing -= da
    },
    setSweepWarn(k: number) {
      sweepMat.uniforms.uK.value = k
      sweepWall.visible = sweepFloor.visible = k > 0.001
    },
    dropDebris(at: THREE.Vector3, onHit: (at: THREE.Vector3) => void, warn = DEBRIS_WARN) {
      const r = rocks.find((x) => !x.on)
      if (!r) return
      r.on = true
      r.t = 0
      r.warn = warn
      r.at.copy(at)
      r.hit = onHit
      r.ring.position.set(at.x, at.y + 0.03, at.z)
      r.rock.visible = false
    },
    clearDebris() {
      for (const r of rocks) {
        r.on = false
        r.hit = null
        r.ring.visible = r.rock.visible = false
      }
    },
    setNight(on: boolean) {
      night = on
    },
    attachPhysics(ph: Physics) {
      const R = ph.R
      const fixed = ph.world.createRigidBody(R.RigidBodyDesc.fixed())
      for (const g of C.gears) {
        ph.world.createCollider(R.ColliderDesc.cylinder(0.15, g.r).setTranslation(g.c.x, g.c.y - 0.15, g.c.z).setFriction(0.9), fixed)
      }
      // 針の軸の丸い台（針と同じ高さ）
      ph.world.createCollider(R.ColliderDesc.cylinder(0.13, 0.62).setTranslation(H.pivot.x, H.pivot.y - 0.13, H.pivot.z), fixed)
      handBody = ph.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(H.pivot.x, H.pivot.y - 0.12, H.pivot.z))
      ph.world.createCollider(R.ColliderDesc.cuboid(H.len / 2, 0.12, H.width / 2).setTranslation(H.len / 2, 0, 0).setFriction(0.9), handBody)
      q.setFromAxisAngle(Y, -hand.theta)
      handBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    },
    dispose() {
      // Rapier の世界はシェルがまとめて解放する
      handBody = null
      rockGeo.dispose()
      rockMat.dispose()
    },
  }
  return parts
}
