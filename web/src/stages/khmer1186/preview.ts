// 1186年 クメールの都・アルンの寺と村の単体プレビュー（khmer-preview.html）。シェル（game/）を使わずに、
// 共有のレンダラ・後処理・主人公のリグだけで組み立てて、自由カメラで見る・撮る。
// クエリ：
//   time=afternoon|night|dawn       時間（T キーで切り替え）
//   cam=overview|temple|baray|bridge|tower_e|tower_n|tower_s|stairs|village|arrive|arun|relief|elephant|scar|top
//   campos=x,y,z&look=x,y,z&fov=度  好きな位置から
//   mirrors=nes（鏡を立てる）・beams=nes（光の筋）・arun=dead|crack|shard|scars|glow2・collapse=2,4（大階段をくずす）
//   stones=1（くずれた段の前で石が落ちる）・freeze=1（回る鏡の台・石を止める）・solved=1（回る鏡の台を解いた状態）
//   crack=0..1・open=0..1（空のひび）・nohud・label・t=秒（シェーダの時刻を固定）・quality=low|medium|high
//   play=1                          実際に歩いて試す（物理・NMClaw・象に乗る。G で近くの物を止める）。spawn=ID
// 自由カメラ：左ドラッグで回す・右ドラッグで動かす・ホイールで寄る。1〜9 で決まったカメラ、T で時間
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { readParams } from '../../render/quality'
import { createRenderer, createSunRig } from '../../render/renderer'
import { createPost } from '../../render/post'
import { uTime } from '../../render/materials'
import { createSkyDome, loadHDRIEnvironment } from '../../render/sky'
import { createNexmax } from '../../world/nexmax/nexmaxModel'
import { LoadingOverlay } from '../../ui/hud'
import { buildKhmerScene, type KhmerScene } from './sceneKhmer'
import { KHMER_ENVIRONMENTS, KhmerEnvMaps, applyKhmerTime, type TimeOfDay } from './environment'
import { K, SPAWNS, TOWER_IDS, type TowerId } from './layout'
import { createPhysics } from '../../player/physics'

const urlp = new URLSearchParams(location.search)
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

type CamPreset = { pos: THREE.Vector3; look: THREE.Vector3; fov: number; time?: TimeOfDay; nexmax?: { pos: THREE.Vector3; face: THREE.Vector3 } }

export const KHMER_CAMS: Record<string, CamPreset> = {
  overview: { pos: v(-78, 62, 62), look: v(4, 0, -22), fov: 55 },
  top: { pos: v(-6, 190, 20), look: v(-6, 0, -12), fov: 60 },
  arrive: { pos: v(-34.4, 1.7, -27.6), look: v(26, 9, -4), fov: 60, nexmax: { pos: SPAWNS.arrive.pos, face: v(26, 0, -4) } },
  temple: { pos: v(-2, 5.5, 26), look: v(26, 11, -4), fov: 58, nexmax: { pos: v(4.6, 0, 16), face: v(26, 0, -4) } },
  baray: { pos: v(-37, 4.2, -33), look: v(2, 4, -66), fov: 58, nexmax: { pos: v(-33.6, 0, -35.4), face: v(0, 0, -66) } },
  bridge: { pos: v(-39, 2.4, -0.6), look: v(-8, 2.0, -4), fov: 56, nexmax: { pos: v(-31.2, 0, -3.8), face: v(0, 0, -4) } },
  tower_e: { pos: v(30.5, 4.6, 19.5), look: v(50, 5, -2), fov: 58, nexmax: { pos: SPAWNS.tower_e.pos, face: v(40, 0, 10) } },
  tower_n: { pos: v(-41.5, 4.4, -53), look: v(4, 3, -68), fov: 60, nexmax: { pos: SPAWNS.tower_n.pos, face: v(-25, 0, -64) } },
  tower_s: { pos: v(17.5, 3.6, 8.5), look: v(26, 5, 22), fov: 58, nexmax: { pos: SPAWNS.tower_s.pos, face: v(26, 0, 25) } },
  stairs: { pos: v(4.2, 2.2, 4.6), look: v(18, 8, -4), fov: 58, nexmax: { pos: SPAWNS.stairs.pos, face: v(26, 0, -4) } },
  village: { pos: v(-38, 3.2, 18), look: v(-58, 2.5, 3), fov: 58, nexmax: { pos: v(-47, 0, 12), face: v(-54, 0, 8) } },
  arun: { pos: v(17.9, 11.0, -4.0), look: v(26, 11.1, -4), fov: 54, nexmax: { pos: v(19.7, 9.6, -2.9), face: v(26, 0, -4) } },
  relief: { pos: v(-1.3, 1.7, 6.2), look: v(2, 1.8, 10.2), fov: 60, nexmax: { pos: v(-0.4, 0.25, 7.4), face: v(2, 0, 10) } },
  elephant: { pos: v(-12, 3.2, -30), look: v(-6, 1.6, -44), fov: 56, nexmax: { pos: v(-4.3, 2.4, -36.2), face: v(-7, 0, -36.6) } },
  scar: { pos: v(24, 13, -9), look: v(84, 0, -126), fov: 50 },
  night_stairs: { pos: v(3.8, 3.0, 6.4), look: v(18, 9, -4), fov: 58, time: 'night', nexmax: { pos: SPAWNS.stairs.pos, face: v(26, 0, -4) } },
  dawn_top: { pos: v(12.6, 16, 6), look: v(26, 14, -4), fov: 60, time: 'dawn' },
}

declare global {
  interface Window {
    __khmerReady?: boolean
    __khmer?: unknown
  }
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 30))

async function main(): Promise<void> {
  const app = document.getElementById('app') as HTMLDivElement
  const ui = document.getElementById('ui') as HTMLDivElement
  const label = document.getElementById('preview-label') as HTMLDivElement
  const help = document.getElementById('preview-help') as HTMLDivElement
  const { quality: q } = readParams()
  const loading = new LoadingOverlay(ui)
  loading.set(0.05, 'レンダラを準備中…')
  const renderer = createRenderer(app, q)
  const size = () => ({ w: app.clientWidth || window.innerWidth, h: app.clientHeight || window.innerHeight })
  const camera = new THREE.PerspectiveCamera(55, size().w / size().h, 0.1, 2500)
  const scene = new THREE.Scene()
  scene.add(camera)
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  const t0 = performance.now()
  const ks: KhmerScene = await buildKhmerScene(q, aniso, (p, m) => loading.set(0.1 + p * 0.7, m), nextFrame)
  const buildMs = performance.now() - t0
  scene.add(ks.root)

  // 空・環境光・太陽
  const env0 = KHMER_ENVIRONMENTS.afternoon
  const sky = createSkyDome(env0.sky, env0.sunDir)
  scene.add(sky)
  loading.set(0.84, '空と環境光を準備中…')
  await nextFrame()
  const maps = new KhmerEnvMaps(renderer)
  maps.borrow('afternoon', env0.hdri ? await loadHDRIEnvironment(renderer, env0.hdri) : null)
  const rig = createSunRig(scene, q, env0.sunDir)
  const post = createPost(renderer, scene, camera, q)
  const pointLights: THREE.PointLight[] = []
  for (let i = 0; i < q.pointLights; i++) {
    const pl = new THREE.PointLight('#ffae5a', 0, 7, 2)
    scene.add(pl)
    pointLights.push(pl)
  }
  let time: TimeOfDay = 'afternoon'
  const setTime = (t: TimeOfDay) => {
    time = t
    ks.setTimeOfDay(t)
    applyKhmerTime(KHMER_ENVIRONMENTS[t], { scene, sky, sun: rig, post, envMap: maps.get(t) })
  }
  const assignLights = (center: THREE.Vector3) => {
    const sorted = ks.lights
      .filter((l) => l.intensity > 0.01)
      .map((l) => ({ l, d: l.pos.distanceToSquared(center) }))
      .sort((a, b) => a.d - b.d)
    pointLights.forEach((pl, i) => {
      const s = sorted[i]
      if (!s) {
        pl.intensity = 0
        return
      }
      pl.position.copy(s.l.pos)
      pl.color.set(s.l.color)
      pl.intensity = s.l.intensity * 2.2
      pl.distance = s.l.dist
    })
  }

  // ネクマックス（大きさの目安）
  const nexmax = createNexmax(1.05)
  scene.add(nexmax.root)
  nexmax.root.visible = false

  const resize = () => {
    const { w, h } = size()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    post.setSize(w, h)
  }
  window.addEventListener('resize', resize)
  resize()

  // 仕掛けの状態（クエリ）
  const towers = (s: string | null): TowerId[] => (s ?? '').split('').filter((x): x is TowerId => (TOWER_IDS as readonly string[]).includes(x))
  for (const id of towers(urlp.get('mirrors'))) ks.placeMirror(id, true)
  for (const id of towers(urlp.get('beams'))) ks.beamOn(id, true)
  const arunMode = urlp.get('arun')
  if (arunMode === 'dead') ks.arun.setDead(true)
  if (arunMode === 'glow2') ks.arun.setGlow(2, true)
  if (arunMode === 'scars') ks.arun.setScars(1)
  if (arunMode === 'crack') ks.arun.crack()
  if (arunMode === 'shard') void ks.arun.releaseShard({ to: K.SHARD_GROUND.clone() })
  for (const s of (urlp.get('collapse') ?? '').split(',').filter((x) => x !== '')) ks.collapseStep(Number(s), true)
  if (urlp.get('stones') === '1') ks.stairs.setStonesActive(true)
  if (urlp.get('solved') === '1') ks.turntable.setSolved(true)
  if (urlp.has('crack')) ks.skyCrack.setCrack(Number(urlp.get('crack')))
  if (urlp.has('open')) ks.skyCrack.setOpen(Number(urlp.get('open')))

  // 遊ぶ（物理・プレイヤー・NMClaw）
  if (urlp.get('play') === '1') {
    loading.set(0.9, 'シェーダを準備中…')
    const { startKhmerPlay } = await import('./previewPlay')
    const startTime = (urlp.get('time') as TimeOfDay) ?? 'afternoon'
    setTime(startTime)
    await startKhmerPlay({ renderer, scene, camera, post, ui, ks, nexmax, rig, sky, setTime, assignLights, label, loading, buildMs })
    return
  }

  // ---------------------------------------------------------------- 撮影・自由カメラ
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.12
  controls.maxDistance = 600
  const camNames = Object.keys(KHMER_CAMS)
  const goto = (name: string) => {
    const preset = KHMER_CAMS[name] ?? KHMER_CAMS.overview
    camera.position.copy(preset.pos)
    camera.fov = Number(urlp.get('fov') ?? preset.fov)
    camera.updateProjectionMatrix()
    controls.target.copy(preset.look)
    controls.update()
    if (preset.nexmax) {
      nexmax.root.visible = true
      nexmax.root.position.copy(preset.nexmax.pos)
      nexmax.root.rotation.y = Math.atan2(-(preset.nexmax.face.x - preset.nexmax.pos.x), -(preset.nexmax.face.z - preset.nexmax.pos.z))
      nexmax.setPose('idle')
    } else nexmax.root.visible = false
    if (preset.time && !urlp.has('time')) setTime(preset.time)
    label.textContent = `${name} / ${time}`
  }
  const camName = urlp.get('cam') ?? 'overview'
  setTime(((urlp.get('time') as TimeOfDay) ?? KHMER_CAMS[camName]?.time ?? 'afternoon') as TimeOfDay)
  goto(camName)
  const vec = (k: string) => {
    const a = (urlp.get(k) ?? '').split(',').map(Number)
    return a.length === 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null
  }
  const cpos = vec('campos')
  const clook = vec('look')
  if (cpos) camera.position.copy(cpos)
  if (clook) controls.target.copy(clook)
  controls.update()
  if (urlp.get('freeze') === '1') {
    ks.turntable.setFrozen(true)
    for (const s of [...ks.towerStones, ...ks.stairs.stones]) s.setFrozen(true)
  }
  if (!urlp.has('label')) label.style.display = urlp.has('nohud') ? 'none' : 'block'
  help.textContent = '左ドラッグ：回す　右ドラッグ：動かす　ホイール：寄る\n1〜9：決まったカメラ　T：時間　F：回る鏡を止める　C：大階段をくずす　M：鏡と光'
  if (urlp.has('nohud')) help.style.display = 'none'
  window.addEventListener('keydown', (e) => {
    const n = Number(e.key)
    if (n >= 1 && n <= 9 && camNames[n - 1]) goto(camNames[n - 1])
    if (e.key === 't' || e.key === 'T') setTime(time === 'afternoon' ? 'night' : time === 'night' ? 'dawn' : 'afternoon')
    if (e.key === 'f' || e.key === 'F') ks.turntable.setFrozen(!ks.turntable.frozen)
    if (e.key === 'c' || e.key === 'C') {
      const next = Array.from({ length: ks.stairs.segs }, (_, i) => i).find((i) => !ks.stairs.isCollapsed(i) && i % 2 === 1)
      if (next !== undefined) ks.collapseStep(next)
      ks.stairs.setStonesActive(true)
    }
    if (e.key === 'm' || e.key === 'M') for (const id of TOWER_IDS) ks.beamOn(id)
    label.textContent = `${camName} / ${time}`
  })

  loading.set(0.95, 'シェーダを準備中…')
  await nextFrame()
  assignLights(controls.target)
  rig.follow(controls.target)
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))])
  loading.hide()

  const fixedT = urlp.has('t') ? Number(urlp.get('t')) : null
  if (fixedT !== null) uTime.value = fixedT
  const timer = new THREE.Timer()
  timer.connect(document)
  let frames = 0
  let lightT = 0
  const stats = { calls: 0, tris: 0, frames: 0, buildMs }
  renderer.info.autoReset = false
  const physCheck = urlp.get('phys') === '1' ? await createPhysics(ks.colliders) : null
  if (physCheck) ks.attachPhysics(physCheck)
  window.__khmer = {
    ks,
    scene,
    camera,
    renderer,
    controls,
    setTime,
    goto,
    phys: physCheck,
    /** 真上から下へ当てて、立てる高さを調べる（phys=1 のとき） */
    groundAt: (x: number, z: number, from = 40) => {
      if (!physCheck) return null
      const d = physCheck.raycast(v(x, from, z), v(0, -1, 0), from + 5)
      return d === null ? null : from - d
    },
    stats: () => ({ ...stats, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0 }),
  }
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1)
    if (fixedT === null) uTime.value += dt
    renderer.info.reset()
    controls.update()
    ks.update(dt, uTime.value, camera)
    nexmax.update(dt, 0)
    lightT -= dt
    if (lightT <= 0) {
      assignLights(controls.target.clone().lerp(camera.position, 0.4))
      lightT = 0.4
    }
    rig.follow(controls.target)
    sky.position.copy(camera.position)
    post.render(dt)
    stats.calls = renderer.info.render.calls
    stats.tris = renderer.info.render.triangles
    stats.frames = ++frames
    if (frames === 3) window.__khmerReady = true
  })
}

main().catch((e) => {
  console.error(e)
  const el = document.getElementById('preview-label')
  if (el) {
    el.style.display = 'block'
    el.textContent = 'ERROR: ' + (e instanceof Error ? e.message : String(e))
  }
})
