// 2086年 ナンバタウン「時代博覧祭」の組み立て（EdoScene と同じ考え方：root・当たり判定・NMClaw の対象・毎フレームの更新）。
// ＋ 到着地点、環境（祭りの朝・夜）、NPC の立ち位置、調べられる場所、物語の範囲、オルム・落ちてくる破片・IDO の裂け目。
//
// 使い方（シェル側）：
//   await preloadFutureAssets(aniso)            // 任意：テクスチャとフォントを先に読む
//   const fs = buildFutureScene(mats, quality)  // mats は createMaterialLibrary() の結果
//   scene.add(fs.root); createPhysics(fs.colliders); new ClawSystem(phys, player, fs.claw.targets, fs.claw.movables)
//   fs.setTimeOfDay('night') → applyTimeOfDay(fs.environment, { scene, sky, sun, hemi, post, envMaps })
//   毎フレーム：fs.update(dt, uTime.value)、夜の避難中は fs.debris.update(dt, player.position)
import * as THREE from 'three'
import { Batch } from '../../render/batch'
import type { MaterialLibrary } from '../../render/materials'
import { uTime } from '../../render/materials'
import { mulberry32 } from '../../render/noise'
import type { QualitySettings } from '../../render/quality'
import type { Pose } from '../../world/characters'
import { ColliderList } from '../../world/colliders'
import type { Ctx, LightSpot } from '../../world/edo/kit'
import { Foliage, createPetals } from '../../world/edo/nature'
import { buildBooth, type BoothParts } from './booth'
import { buildCentralTower, buildDistrict, buildExpoGlobe, buildFarCity, buildSky, buildTraffic, type Traffic } from './buildings2086'
import { buildSkyTrain } from './skyTrain2086'
import { buildHoloAds } from './holoAds2086'
import { buildClawTargets2086, type FutureClawWorld } from './clawTargets2086'
import { FUTURE_ENVIRONMENTS, type FutureEnvironment } from './environment'
import { buildFestival, buildFountain, holoSign } from './festival'
import { buildCrowd, type Crowd } from './crowd'
import { createFutureMaterials, type FutureMaterials, type TimeOfDay } from './fmaterials'
import { AttrBatch, type FCtx } from './kit2086'
import { F, ZONES, yawTo, zoneAt, type Interactable, type Zone, type ZoneId } from './layout'
import { DebrisField, buildOrum, type OrumParts } from './orum'
import { buildUnits, type Units } from './units'

export type FutureSpawn = { pos: THREE.Vector3; facing: number; camYaw: number; camPitch: number }

/** NPC の立ち位置（足元・向き・ポーズ） */
export type NpcSpot = { pos: THREE.Vector3; yaw: number; pose: Pose }

export type SoraSpotId = 'booth' | 'exhibit' | 'night' | 'gate'

export type FutureNpcs = {
  sora: Record<SoraSpotId, NpcSpot>
  /** 夜、ソラが南の避難ゲートへ逃げる道すじ */
  soraEscape: THREE.Vector3[]
  /** ソラの身長（m） */
  soraHeight: number
}

export type OrumState = { show?: number; tomorrow?: number; swallow?: number; dissolve?: number }

export type FutureScene = {
  root: THREE.Group
  colliders: ColliderList
  /** 点光源の候補（シェルが近いものから点光源を割り当てる） */
  lights: LightSpot[]
  claw: FutureClawWorld
  spawns: Record<string, FutureSpawn>
  /** いまの時間帯の環境 */
  environment: FutureEnvironment
  environments: Record<TimeOfDay, FutureEnvironment>
  readonly timeOfDay: TimeOfDay
  npcs: FutureNpcs
  interactables: Interactable[]
  zones: Zone[]
  zoneAt(p: THREE.Vector3): ZoneId | null
  /** 目標マーカーなどに使う位置 */
  markers: Record<'booth' | 'lens' | 'hook' | 'swing' | 'far_platform' | 'south_gate' | 'exhibit', THREE.Vector3>
  booth: BoothParts
  orum: OrumParts
  debris: DebrisField
  units: Units
  /** 祭りの人出（立っている人の一覧 crowd.standing を町の人のおしゃべり mobTalk2086.ts が読む） */
  crowd: Crowd
  materials: FutureMaterials
  update(dt: number, t: number): void
  setTimeOfDay(mode: TimeOfDay): void
  setOrum(s: OrumState): void
  /** IDO の展示画面を裂け目へ（0..1） */
  openRift(v: number): void
  /** 古い腕のパーツを落とす（祭りの朝・ソラとの会話の小さな演出） */
  dropArmPart(at: THREE.Vector3): void
  dispose(): void
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export function buildFutureScene(mats: MaterialLibrary, quality: QualitySettings, opts: { aniso?: number } = {}): FutureScene {
  const root = new THREE.Group()
  root.name = 'future2086'
  const fm = createFutureMaterials(mats, opts.aniso ?? 8)
  const base: Ctx = {
    b: new Batch(),
    bf: new Batch(),
    m: mats,
    col: new ColliderList(),
    rng: mulberry32(2086),
    lights: [],
    root,
    updaters: [],
    quality,
  }
  const c = { ...base, fm, cloth: new AttrBatch(['aHang']), holo: new AttrBatch(), holoN: new AttrBatch() } as FCtx
  c.foliage = new Foliage(c)
  const cf: FCtx = { ...c, b: c.bf, col: new ColliderList() }
  const farFoliage = new Foliage(cf)
  cf.foliage = farFoliage

  buildFestival(c)
  buildDistrict(c)
  buildFarCity(c)
  buildCentralTower(c, root)
  buildExpoGlobe(c, root)
  buildSky(c, root, farFoliage)
  buildSkyTrain(c, root)
  buildHoloAds(c, root)
  const traffic: Traffic = buildTraffic(root)
  const booth = buildBooth(c, root)
  const claw = buildClawTargets2086(c)
  buildFountain(c, root)
  const crowd = buildCrowd(root, c.col)
  const orum = buildOrum(fm, root)
  const debris = new DebrisField(fm, root)
  const units = buildUnits(root)

  // 夜だけの緊急表示（ホロ・点滅）
  holoSign(c, 'emergency', 12.6, 6.6, -12.2, 5.6, -0.55, true)
  holoSign(c, 'emergency', F.PLAZA.x1 - 0.1, 10.6, -10.5, 5.2, -Math.PI / 2, true)
  holoSign(c, 'emergency', -10.6, 7.0, -7.4, 3.8, 0.45, true)
  holoSign(c, 'emergency', -F.PLAZA.x1 + 0.4, 9.6, 10.5, 4.4, Math.PI / 2, true)

  // ---- 結合
  const stat = c.b.build('static')
  root.add(stat)
  const far = c.bf.build('far')
  far.traverse((o) => {
    o.castShadow = false
  })
  root.add(far)
  root.add(c.foliage.build())
  const farF = farFoliage.build()
  farF.traverse((o) => {
    o.castShadow = false
  })
  root.add(farF)
  const cloth = c.cloth.build(fm.cloth, 'cloth')
  if (cloth) {
    cloth.castShadow = true
    cloth.receiveShadow = true
    root.add(cloth)
  }
  const holo = c.holo.build(fm.holo, 'holo')
  if (holo) {
    holo.renderOrder = 2
    root.add(holo)
  }
  const holoN = c.holoN.build(fm.holoNight, 'holoNight')
  if (holoN) {
    holoN.renderOrder = 2
    holoN.visible = false
    root.add(holoN)
  }
  // 桜の花びら（朝だけ）
  const petals = createPetals(quality.level === 'high' ? 420 : 160, v(1, 5, 4), v(42, 10, 34))
  root.add(petals)
  // 星（夜だけ）
  const stars = makeStars()
  stars.visible = false
  root.add(stars)
  // 古い腕のパーツ（落とす演出用）
  const arm = makeArmPart()
  arm.visible = false
  root.add(arm)
  const armAnim = { t: -1, from: new THREE.Vector3(), vel: new THREE.Vector3() }
  c.updaters.push((dt) => {
    if (armAnim.t < 0) return
    armAnim.t += dt
    armAnim.vel.y -= 14 * dt
    arm.position.addScaledVector(armAnim.vel, dt)
    if (arm.position.y < 0.05) {
      arm.position.y = 0.05
      if (Math.abs(armAnim.vel.y) > 0.8) armAnim.vel.y *= -0.35
      else armAnim.vel.y = 0
      armAnim.vel.x *= 0.6
      armAnim.vel.z *= 0.6
    }
    arm.rotation.z += dt * (armAnim.vel.length() * 2)
    if (armAnim.t > 6) armAnim.t = -1
  })

  // ---- 立ち位置・到着地点・調べる場所
  // 操作卓の向こう側（広場を向いて作業する）
  const soraBooth = v(F.CONSOLE.x + Math.sin(F.CONSOLE.rot) * 1.0, F.BOOTH.h, F.CONSOLE.z + Math.cos(F.CONSOLE.rot) * 1.0)
  const soraExhibit = v(F.CONSOLE.x + 0.9, F.BOOTH.h, F.CONSOLE.z + 0.6)
  const npcs: FutureNpcs = {
    sora: {
      booth: { pos: soraBooth, yaw: yawTo(soraBooth, v(F.CONSOLE.x, 0, F.CONSOLE.z)), pose: 'crank' },
      exhibit: { pos: soraExhibit, yaw: yawTo(soraExhibit, v(2, 0, 6)), pose: 'idle' },
      night: { pos: v(2.6, 0, 6.6), yaw: yawTo(v(2.6, 0, 6.6), v(F.ORUM.x, 0, F.ORUM.z)), pose: 'idle' },
      gate: { pos: v(-1.4, 0, 18.4), yaw: Math.PI, pose: 'wave' },
    },
    soraEscape: [v(2.6, 0, 6.6), v(2.2, 0, 9.5), v(0.8, 0, 13.5), v(-1.4, 0, 18.4)],
    soraHeight: 1.58,
  }
  const portalFront = booth.center.clone().addScaledVector(booth.normal, 2.2).setY(F.BOOTH.h)
  const face = (from: THREE.Vector3, to: THREE.Vector3) => yawTo(from, to)
  const spawn = (pos: THREE.Vector3, facing: number, camPitch = 0.24): FutureSpawn => ({ pos, facing, camYaw: facing, camPitch })
  const spawns: Record<string, FutureSpawn> = {
    // 祭りの朝：南の入口から会場を見る
    start: spawn(v(1.5, 0, 15.2), 0, 0.2),
    loop_morning: spawn(v(1.5, 0, 15.2), 0, 0.2),
    // ブースの前（ソラの横）
    booth: spawn(v(-4.4, 0, 2.4), face(v(-4.4, 0, 2.4), v(F.PORTAL.x, 0, F.PORTAL.z)), 0.26),
    // 部品箱の山の前（共鳴レンズを見上げる）
    lens: spawn(v(-9.6, 0, -3.4), face(v(-9.6, 0, -3.4), v(F.CRATE_STACK.x, 0, F.CRATE_STACK.z)), -0.18),
    // 金具の下（回廊を見上げる）
    hook: spawn(v(-10.6, 0, 3.6), face(v(-10.6, 0, 3.6), v(-14.7, 0, 2.2)), -0.3),
    // 西の回廊の上
    walkway: spawn(v(-17.2, F.WALK_Y, -2), Math.PI * 0, 0.22),
    // 途切れた北の回廊の西の端（吊り輪を見上げる）
    swing: spawn(v(-5.4, F.WALK_Y, -17.2), face(v(-5.4, 0, -17.2), v(3, 0, -17.2)), -0.15),
    // 北の回廊の東側（渡り終えたところ）
    far_platform: spawn(v(6.8, F.WALK_Y, -16.4), face(v(6.8, 0, -16.4), v(0, 0, 0)), 0.3),
    // 夜：広場の中央（北東の空にオルム）
    night_plaza: spawn(v(0.9, 0, 6.4), face(v(0.9, 0, 6.4), v(F.ORUM.x * 0.2, 0, F.ORUM.z * 0.2)), -0.1),
    // IDO 展示の前
    exhibit: spawn(portalFront.clone().add(v(0.8, 0, 0.8)), face(portalFront, booth.center), 0.18),
    // 2026年から戻ってきた（記録の石標の列の外側で、ブース＝ソラの方を向く。カメラがリングや石標に入らないように）
    arrive_from_2026: spawn(portalFront.clone().addScaledVector(booth.normal, 3.6), face(portalFront.clone().addScaledVector(booth.normal, 3.6), booth.center), 0.18),
  }
  const interactables: Interactable[] = [
    { id: 'sora', pos: soraBooth.clone(), reach: 2.6, label: '話す' },
    { id: 'ido_exhibit', pos: portalFront.clone(), reach: 2.4, label: 'IDO展示' },
    { id: 'parts_table', pos: v(F.PARTS_TABLE.x, 0, F.PARTS_TABLE.z), reach: 1.8, label: '調べる' },
  ]
  const markers = {
    booth: v(F.BOOTH.x, 0, F.BOOTH.z),
    lens: claw.movables[0].home.clone(),
    hook: claw.targets.find((t) => t.id === claw.ids.hook)!.point.clone(),
    swing: claw.targets.find((t) => t.id === claw.ids.swing)!.point.clone(),
    far_platform: v(8, F.WALK_Y, -17.2),
    south_gate: v(0, 0, 18.2),
    exhibit: portalFront.clone(),
  }

  let timeOfDay: TimeOfDay = 'morning'
  const fsc: FutureScene = {
    root,
    colliders: c.col,
    lights: c.lights,
    claw,
    spawns,
    environment: FUTURE_ENVIRONMENTS.morning,
    environments: FUTURE_ENVIRONMENTS,
    get timeOfDay() {
      return timeOfDay
    },
    npcs,
    interactables,
    zones: ZONES,
    zoneAt,
    markers,
    booth,
    orum,
    debris,
    units,
    crowd,
    materials: fm,
    update(dt: number, t: number) {
      for (const u of c.updaters) u(dt, t)
      traffic.update(dt)
      units.update(dt)
      crowd.update(dt)
      orum.update(dt)
    },
    setTimeOfDay(mode: TimeOfDay) {
      timeOfDay = mode
      const night = mode === 'night'
      fm.setTimeOfDay(mode)
      fsc.environment = FUTURE_ENVIRONMENTS[mode]
      if (holoN) holoN.visible = night
      stars.visible = night
      petals.visible = !night
      units.setNight(night)
      crowd.setNight(night)
      if (!night) {
        fsc.setOrum({ show: 0, tomorrow: 1, swallow: 0, dissolve: 0 })
        debris.setActive(false)
        booth.setRift(0)
      }
    },
    setOrum(s: OrumState) {
      if (s.show !== undefined) orum.setShow(s.show)
      if (s.tomorrow !== undefined) orum.setTomorrow(s.tomorrow)
      if (s.swallow !== undefined) orum.setSwallow(s.swallow)
      if (s.dissolve !== undefined) orum.setDissolve(s.dissolve)
    },
    openRift(x: number) {
      booth.setRift(x)
    },
    dropArmPart(at: THREE.Vector3) {
      arm.visible = true
      arm.position.copy(at)
      armAnim.t = 0
      armAnim.vel.set(0.6, 1.6, 0.4)
    },
    dispose() {
      units.dispose()
      for (const t of fm.textures) t.dispose()
      orum.setDissolve(0)
    },
  }
  return fsc
}

// ------------------------------------------------------------------ 星

function makeStars(): THREE.Points {
  const N = 1400
  const rng = mulberry32(31)
  const pos = new Float32Array(N * 3)
  const seed = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const u = rng()
    const y = 0.08 + Math.pow(u, 0.7) * 0.92
    const a = rng() * Math.PI * 2
    const r = Math.sqrt(1 - y * y)
    pos[i * 3] = Math.cos(a) * r * 820
    pos[i * 3 + 1] = y * 820
    pos[i * 3 + 2] = Math.sin(a) * r * 820
    seed[i] = rng()
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  const m = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aSeed;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = 1.2 + aSeed * 2.2;
        vA = (0.45 + 0.55 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 40.0)) * (0.4 + aSeed * 0.6);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.2) * vA * 1.6, vA);
      }`,
    uniforms: { uTime },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  })
  const p = new THREE.Points(g, m)
  p.frustumCulled = false
  p.renderOrder = -5
  return p
}

/** 古い腕のパーツ（水色の玉の関節 3 つ＋前腕） */
function makeArmPart(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: '#6fb4ec', roughness: 0.55 })
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.05 - i * 0.006, 14, 10), mat)
    s.position.x = -0.12 + i * 0.09
    s.castShadow = true
    g.add(s)
  }
  const cap = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.14, 4, 10), mat)
  cap.rotation.z = Math.PI / 2
  cap.position.x = 0.12
  cap.castShadow = true
  g.add(cap)
  return g
}
