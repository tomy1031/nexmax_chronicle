// 7 章の 1726年の舞台の単体プレビュー（edo-preview.html）。シェル（game/）に依存せず、共有のレンダラ・後処理・
// 空・太陽・主人公のリグ・源兵衛・おはるだけで組み立てて、工房の中・時の鐘人形・ほこら・夜・夜明けを撮って確かめる。
// クエリ：
//   cam=overview|alley|arrive|court|shrine|shrine_dawn|workshop|workshop_night|box|book|arm|plaza|doll|doll_night|doll_swing|
//       doll_bell|doll_kneel|doll_down|dawn|night_street   固定カメラ（場面の準備も）
//   time=day|dusk|night|predawn|dawn|morning   時間帯の上書き、dawn=0..1 夜明けの目盛り
//   sim=秒   撮る前に動きを進める（人形の攻撃・実演など）、t=秒（シェーダの時刻を固定）
//   campos=x,y,z&look=x,y,z&fov=度   好きな位置から撮る、quality=low|medium|high、nohud、label
import * as THREE from 'three'
import { readParams } from '../../../render/quality'
import { createRenderer, createSunRig } from '../../../render/renderer'
import { createPost } from '../../../render/post'
import { createMaterialLibrary, uTime } from '../../../render/materials'
import { EDO_SKY, createSkyDome, loadHDRIEnvironment, createSkyEnvironment } from '../../../render/sky'
import { loadCharacter, type Character, type Pose } from '../../../world/characters'
import { createNexmax } from '../../../world/nexmax/nexmaxModel'
import { LoadingOverlay } from '../../../ui/hud'
import { TeaDoll } from '../karakuri'
import { buildChronicleEdo, type ChronicleEdoWorld } from './scene'
import { C, WORKSHOP_SPOTS, ARRIVE_RING } from './layout'
import { EDO_LOOKS, type EdoTime, type EdoSkyCycle } from './skyCycle'

const urlp = new URLSearchParams(location.search)
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

type Place = { pos: THREE.Vector3; face: THREE.Vector3; pose?: Pose }
type Preset = {
  pos: THREE.Vector3
  look: THREE.Vector3
  fov: number
  time?: EdoTime
  dawn?: number
  nexmax?: Place
  genbei?: Place
  oharu?: Place
  /** 場面の準備（人形・本・箱など） */
  setup?: (w: ChronicleEdoWorld) => void
  sim?: number
}

const DOLL = v(C.DOLL.x, 0, C.DOLL.z)
const front = v(C.DOLL.x, 0, C.DOLL.z - 4.4)

const CAMS: Record<string, Preset> = {
  overview: { pos: v(4, 34, 12), look: v(-22, 0, 32), fov: 50 },
  alley: { pos: v(-10.6, 1.6, 9.6), look: v(-10.9, 1.4, 24), fov: 56, nexmax: { pos: v(-10.9, 0, 15.6), face: v(-10.9, 0, 22) } },
  arrive: { pos: v(-9.2, 1.5, 27.0), look: v(-11.0, 1.2, 18.0), fov: 54, nexmax: { pos: ARRIVE_RING, face: v(-10.9, 0, 14) }, oharu: { pos: v(-10.8, 0, 17.6), face: v(-10.9, 0, 23), pose: 'run' } },
  court: { pos: v(-1.2, 2.6, 22.2), look: v(-10.6, 0.8, 27.0), fov: 54, nexmax: { pos: v(-7.6, 0, 26.0), face: v(-11, 0, 26.2) } },
  shrine: { pos: v(-7.4, 1.35, 24.9), look: v(-11.6, 1.05, 26.3), fov: 48, nexmax: { pos: v(-8.9, 0, 26.6), face: v(-11, 0, 26.2) } },
  // 正面から：まんなかに箱と錠前、人物は左右へ（背中で目的物を隠さない）
  shrine_dawn: {
    pos: v(-6.6, 1.65, 26.2),
    look: v(-11.2, 1.1, 26.2),
    fov: 50,
    time: 'dawn',
    nexmax: { pos: v(-9.1, 0, 24.8), face: v(-11, 0, 26.2) },
    oharu: { pos: v(-9.8, 0, 28.0), face: v(-11, 0, 26.2) },
    setup: (w) => {
      w.shrine.placeBox(true)
      w.shrine.setMorningLight(1, true)
    },
  },
  workshop: { pos: v(-16.9, 1.7, 14.4), look: v(-16.4, 1.0, 19.6), fov: 60, nexmax: { pos: v(-16.6, 0.06, 16.0), face: v(-16.6, 0, 20) }, genbei: { pos: WORKSHOP_SPOTS.genbei, face: v(-16.6, 0, 15) }, oharu: { pos: WORKSHOP_SPOTS.oharu, face: v(-16.6, 0, 16) } },
  workshop_night: {
    pos: v(-13.4, 2.2, 15.0),
    look: v(-17.6, 0.9, 19.6),
    fov: 60,
    time: 'night',
    genbei: { pos: v(-15.6, 0.06, 18.9), face: v(-15.9, 0, 17.5), pose: 'crank' },
    setup: (w) => w.workshop.book.setClawPage(1),
  },
  box: {
    pos: v(-16.0, 1.25, 19.4),
    look: v(-16.6, 0.9, 21.15),
    fov: 46,
    nexmax: { pos: v(-16.9, 0.06, 20.1), face: v(-16.6, 0, 21.2) },
    setup: (w) => w.workshop.box.setResonance(1, true),
    sim: 0.75,
  },
  book: { pos: v(-14.4, 1.32, 16.25), look: v(-14.4, 0.78, 16.95), fov: 44, setup: (w) => void w.workshop.book.drawClawPage(4), sim: 2.6 },
  arm: {
    pos: v(-15.0, 1.5, 15.2),
    look: v(-16.3, 1.25, 16.8),
    fov: 50,
    genbei: { pos: v(-15.3, 0.06, 18.6), face: v(-16.3, 0, 17.6), pose: 'crank' },
    nexmax: { pos: v(-17.6, 0.06, 15.8), face: v(-16.4, 0, 16.6) },
    setup: (w) => void w.workshop.arm.demoSlit(),
    sim: 5.2,
  },
  plaza: { pos: v(-19.5, 1.7, 23.4), look: v(-28.6, 5.0, 40), fov: 56, nexmax: { pos: v(-21.5, 0.03, 26.2), face: DOLL } },
  doll: { pos: v(-25.2, 1.2, 31.5), look: v(-28.6, 6.0, 41.2), fov: 58, nexmax: { pos: v(-26.6, 0.03, 34.0), face: DOLL }, setup: (w) => w.doll.chime(), sim: 1.0 },
  doll_night: {
    pos: v(-22.0, 1.4, 25.0),
    look: v(-28.0, 5.0, 36.0),
    fov: 58,
    time: 'night',
    nexmax: { pos: v(-24.4, 0.03, 28.6), face: front },
    setup: (w) => {
      w.kagaribi.setLit(true, true)
      w.doll.setPossessed(true, true)
      w.doll.placeOnGround()
    },
    sim: 1.5,
  },
  doll_swing: {
    pos: v(-20.6, 1.6, 26.0),
    look: v(-28.0, 4.0, 35.0),
    fov: 60,
    time: 'night',
    nexmax: { pos: v(-25.0, 0.03, 30.6), face: front },
    setup: (w) => {
      w.kagaribi.setLit(true, true)
      w.doll.setPossessed(true, true)
      w.doll.placeOnGround()
      w.doll.setGearHighlight(0)
      w.doll.swing('right')
    },
    sim: 0.9,
  },
  doll_slam: {
    pos: v(-19.8, 1.8, 27.0),
    look: v(-28.0, 3.0, 34.0),
    fov: 60,
    time: 'night',
    nexmax: { pos: v(-22.0, 0.03, 30.0), face: front },
    setup: (w) => {
      w.kagaribi.setLit(true, true)
      w.doll.setPossessed(true, true)
      w.doll.placeOnGround()
      w.doll.swing('right')
    },
    sim: 1.55,
  },
  doll_bell: {
    pos: v(-16.5, 3.2, 27.0),
    look: v(-28.0, 2.0, 35.0),
    fov: 62,
    time: 'night',
    nexmax: { pos: v(-22.5, 0.03, 30.5), face: front },
    setup: (w) => {
      w.kagaribi.setLit(true, true)
      w.doll.setPossessed(true, true)
      w.doll.placeOnGround()
      w.doll.bellWave()
    },
    sim: 1.9,
  },
  doll_kneel: {
    pos: v(-23.0, 1.3, 29.0),
    look: v(-28.4, 3.4, 36.0),
    fov: 58,
    time: 'night',
    nexmax: { pos: v(-25.6, 0.03, 31.6), face: front },
    setup: (w) => {
      w.kagaribi.setLit(true, true)
      w.doll.setPossessed(true, true)
      w.doll.placeOnGround()
      w.doll.setGearStopped(0)
      w.doll.setGearStopped(1)
      w.doll.setGearHighlight(2)
    },
    sim: 2.0,
  },
  doll_down: {
    pos: v(-21.5, 1.6, 27.4),
    look: v(-28.4, 2.6, 36.0),
    fov: 56,
    dawn: 0.62,
    nexmax: { pos: v(-25.0, 0.03, 31.0), face: front },
    oharu: { pos: v(-22.8, 0.03, 30.6), face: front },
    genbei: { pos: v(-23.6, 0.03, 31.8), face: front },
    setup: (w) => {
      w.doll.setPossessed(true, true)
      w.doll.placeOnGround()
      w.doll.setGearStopped(0)
      w.doll.setGearStopped(1)
      w.doll.setGearStopped(2)
      void w.doll.collapse()
    },
    sim: 3.6,
  },
  dawn: { pos: v(-11.8, 1.6, 27.6), look: v(30, 6, 24), fov: 60, dawn: 0.66, nexmax: { pos: v(-8.0, 0, 26.4), face: v(20, 0, 26) } },
  predawn: { pos: v(-11.8, 1.6, 27.6), look: v(30, 6, 24), fov: 60, dawn: 0.36, nexmax: { pos: v(-8.0, 0, 26.4), face: v(20, 0, 26) } },
  night_street: { pos: v(-27.0, 1.5, 10.6), look: v(-12, 2.6, 11.4), fov: 58, time: 'night', nexmax: { pos: v(-23.0, 0, 10.8), face: v(-16, 0, 12) } },
}

declare global {
  interface Window {
    __edo7Ready?: boolean
    __edo7?: unknown
  }
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 30))

async function main(): Promise<void> {
  const app = document.getElementById('app') as HTMLDivElement
  const ui = document.getElementById('ui') as HTMLDivElement
  const label = document.getElementById('preview-label') as HTMLDivElement
  const { quality: q } = readParams()
  const loading = new LoadingOverlay(ui)
  loading.set(0.05, 'レンダラを準備中…')
  const renderer = createRenderer(app, q)
  const size = () => ({ w: app.clientWidth || window.innerWidth, h: app.clientHeight || window.innerHeight })
  const camera = new THREE.PerspectiveCamera(55, size().w / size().h, 0.1, 2500)
  const scene = new THREE.Scene()
  scene.add(camera)
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  loading.set(0.15, 'テクスチャとフォントを読み込み中…')
  await nextFrame()
  const chars = Promise.all([loadCharacter('genbei', 1.6), loadCharacter('oharu', 1.32)])
  const mats = await createMaterialLibrary(aniso)
  loading.set(0.45, '仕掛け横丁を組み立て中…')
  await nextFrame()
  const t0 = performance.now()
  const w = await buildChronicleEdo(mats, q)
  const buildMs = performance.now() - t0
  scene.add(w.root)
  // 空・環境光・太陽（シェルの applyEnvironment と同じ）
  const day = EDO_LOOKS.day
  scene.fog = new THREE.FogExp2(new THREE.Color(day.fog.color), day.fog.density)
  const sky = createSkyDome(EDO_SKY, day.sunDir)
  scene.add(sky)
  loading.set(0.6, '空と環境光を準備中…')
  await nextFrame()
  scene.environment = (await loadHDRIEnvironment(renderer, './hdri/kloppenheim_06_puresky_1k.hdr')) ?? createSkyEnvironment(renderer, EDO_SKY, day.sunDir)
  scene.environmentIntensity = 0.75
  const rig = createSunRig(scene, q, day.sunDir)
  const post = createPost(renderer, scene, camera, q)
  const cycle: EdoSkyCycle = w.createSky({ renderer, scene, sky, sun: rig, post })
  const lanternLights: THREE.PointLight[] = []
  for (let i = 0; i < 6; i++) {
    const pl = new THREE.PointLight('#ffae5a', 0, 7, 2)
    pl.visible = i < q.pointLights
    scene.add(pl)
    lanternLights.push(pl)
  }
  // キャラクター
  loading.set(0.75, 'キャラクターを読み込み中…')
  const nexmax = createNexmax(1.05)
  scene.add(nexmax.root)
  const [genbei, oharu] = (await chars) as [Character, Character]
  scene.add(genbei.root, oharu.root)
  const tea = new TeaDoll()
  w.root.add(tea.root)
  tea.root.visible = false
  const place = (ch: { root: THREE.Object3D; setPose(p: Pose): void }, p: Place | undefined) => {
    ch.root.visible = !!p
    if (!p) return
    ch.root.position.copy(p.pos)
    ch.root.rotation.y = Math.atan2(-(p.face.x - p.pos.x), -(p.face.z - p.pos.z))
    ch.setPose(p.pose ?? 'idle')
  }

  const resize = () => {
    const { w: ww, h } = size()
    camera.aspect = ww / h
    camera.updateProjectionMatrix()
    renderer.setSize(ww, h)
    post.setSize(ww, h)
  }
  window.addEventListener('resize', resize)
  resize()

  const assignLights = (center: THREE.Vector3) => {
    const sorted = w.lights
      .map((l) => ({ l, d: l.pos.distanceToSquared(center) }))
      .filter((x) => x.l.intensity > 0)
      .sort((a, b) => a.d - b.d)
      .slice(0, lanternLights.length)
    lanternLights.forEach((pl, i) => {
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

  // ---------------------------------------------------------------- 撮影
  const camName = urlp.get('cam') ?? 'overview'
  const preset = CAMS[camName] ?? CAMS.overview
  const time = (urlp.get('time') as EdoTime | null) ?? preset.time ?? 'day'
  const dawnK = urlp.has('dawn') ? Number(urlp.get('dawn')) : preset.dawn
  if (dawnK !== undefined) cycle.dawn(dawnK)
  else cycle.set(time)
  if (time === 'night' || (dawnK !== undefined && dawnK < 0.5)) w.kagaribi.setLit(true, true)
  const vec = (k: string) => {
    const a = (urlp.get(k) ?? '').split(',').map(Number)
    return a.length === 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null
  }
  const cpos = vec('campos')
  const clook = vec('look')
  if (cpos) preset.pos.copy(cpos)
  if (clook) preset.look.copy(clook)
  camera.position.copy(preset.pos)
  camera.fov = Number(urlp.get('fov') ?? preset.fov)
  camera.updateProjectionMatrix()
  camera.lookAt(preset.look)
  place(nexmax, preset.nexmax)
  place(genbei, preset.genbei)
  place(oharu, preset.oharu)
  preset.setup?.(w)
  if (urlp.has('label')) label.textContent = `${camName} / ${dawnK !== undefined ? 'dawn ' + dawnK : time}`
  else label.style.display = 'none'
  if (urlp.has('nohud')) ui.style.display = 'none'

  // 撮る前に動きを進める
  const sim = urlp.has('sim') ? Number(urlp.get('sim')) : (preset.sim ?? 0)
  for (let s = 0; s < sim; s += 1 / 30) {
    uTime.value += 1 / 30
    w.update(1 / 30, uTime.value, camera)
  }
  loading.set(0.9, 'シェーダを準備中…')
  await nextFrame()
  const focus = preset.nexmax?.pos ?? preset.look
  assignLights(preset.look.clone().lerp(preset.pos, 0.5))
  rig.follow(focus)
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))])
  loading.hide()

  const fixedT = urlp.has('t') ? Number(urlp.get('t')) : null
  if (fixedT !== null) uTime.value = fixedT
  const freeze = urlp.has('freeze')
  const timer = new THREE.Timer()
  timer.connect(document)
  let frames = 0
  const stats = { calls: 0, tris: 0, frames: 0, buildMs, lights: w.lights.length }
  window.__edo7 = {
    scene,
    camera,
    w,
    cycle,
    nexmax,
    genbei,
    oharu,
    stats: () => ({ ...stats, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0 }),
  }
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = freeze ? 0 : Math.min(timer.getDelta(), 0.1)
    if (fixedT === null) uTime.value += dt
    renderer.info.reset()
    nexmax.update(dt, 0)
    genbei.update(dt, 0)
    oharu.update(dt, 0)
    w.update(dt, uTime.value, camera)
    rig.follow(focus)
    sky.position.copy(camera.position)
    post.render(dt)
    stats.calls = renderer.info.render.calls
    stats.tris = renderer.info.render.triangles
    stats.frames = ++frames
    if (frames === 3) window.__edo7Ready = true
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
