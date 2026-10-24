// 物語 v7 の 2026年 なんばの単体プレビュー（namba-preview.html）。シェル（game/）を使わず、共有のレンダラ・後処理・HUD・
// 主人公の姿だけで、v7 で足した舞台と仕掛けの部品を撮って確かめる。
// クエリ：
//   cam=kanban|surge|lab|sketch|terminal|search|clock|station|alley|record|lot|shrine|shrine_new|armor|defense|overview
//   time=day|dusk|night|dawn（または 0〜3 の数）   proj=1（江戸の朝の映し出し）   aim=1（暗がりへ光を向ける）
//   damage=0..1（ほこらの欠け）  doors=0..1  glow=0..1（錠前の光）  sun=0..1（朝日が窓から）
//   surge=0..1（石標 A の光のゆがみ）  dark=1（影の獣のゆがみ）  strip=0,1（はがした板）  crack=0..1  mouths=1
//   record=clock|station|alley（IDO の記録のパネル）  words=青い石 / 青い石,コチコチ（検索の画面）  closeup=1|2（社長の絵のアップ）
//   campos=x,y,z&look=x,y,z&fov=  nohud  t=秒  quality=low|medium|high
// window.__namba.measure() で、後処理なしのシーンだけの描画呼び出しと三角形を数える。
import * as THREE from 'three'
import { readParams } from '../../../render/quality'
import { createRenderer, createSunRig } from '../../../render/renderer'
import { createPost } from '../../../render/post'
import { uTime } from '../../../render/materials'
import { createSkyDome, loadHDRIEnvironment, createSkyEnvironment } from '../../../render/sky'
import { loadCharacter, type Character } from '../../../world/characters'
import { createNexmax } from '../../../world/nexmax/nexmaxModel'
import { Hud, LoadingOverlay } from '../../../ui/hud'
import { EnemyModel } from '../../../combat/enemyModels'
import { createSaekiPlaceholder } from '../saeki'
import { IdoPanelFx } from '../idoPanelFx'
import { buildChronicleNamba } from './sceneV7'
import { AlleyTime, ALLEY_PALETTES, sunDirection, type AlleyPhase } from './alleyTime'
import { ArmorPlates } from './armorPlates'
import { buildShrine } from './shrine'
import { IdoSearchPanel, SketchCloseup, recordImage } from './idoSearch'
import { IDO_RECORDS } from './idoSearchLogic'
import { createOfujiPlaceholder } from './ofuji'
import { DEFENSE, SHRINE, SPOTS_V7 } from './layoutV7'

const urlp = new URLSearchParams(location.search)
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

type Place = { pos: THREE.Vector3; face: THREE.Vector3; pose?: string }
type Cam = { pos: THREE.Vector3; look: THREE.Vector3; fov: number; time?: AlleyPhase; nexmax?: Place; matsui?: Place; saeki?: Place; ofuji?: Place; brute?: Place }

const CAMS: Record<string, Cam> = {
  kanban: { pos: v(-0.9, 1.75, 10.1), look: v(-4.9, 0.95, 6.2), fov: 54, nexmax: { pos: v(-4.6, 0, 7.3), face: v(-6, 0, 10) }, matsui: { ...SPOTS_V7.matsuiKanban }, saeki: { ...SPOTS_V7.saekiKanban } },
  surge: { pos: v(-2.3, 1.45, 10.2), look: v(-4.6, 1.15, 6.4), fov: 50, matsui: { pos: v(-2.4, 0, 8.6), face: v(-4.6, 0, 6.6) }, saeki: { pos: v(-6.6, 0, 8.7), face: v(-4.6, 0, 6.6) } },
  lab: { pos: v(-13.9, 1.65, 18.3), look: v(-18.6, 1.55, 20.3), fov: 56, nexmax: { pos: v(-17.3, 0, 19.7), face: v(-18.6, 0, 20.2) }, matsui: { ...SPOTS_V7.matsuiSketch }, saeki: { pos: v(-15.4, 0, 21.2), face: v(-17, 0, 20) } },
  sketch: { pos: v(-16.9, 1.7, 20.1), look: v(-18.6, 1.72, 20.15), fov: 52 },
  terminal: { pos: v(-9.0, 1.6, 19.9), look: v(-9.3, 1.25, 22.3), fov: 52, saeki: { pos: v(-9.9, 0, 21.15), face: v(-9.3, 0, 22.3) } },
  search: { pos: v(-7.6, 1.65, 18.9), look: v(-10.0, 1.15, 21.6), fov: 56, saeki: { pos: v(-9.6, 0, 21.15), face: v(-9.3, 0, 22.3) }, nexmax: { pos: v(-8.7, 0, 20.6), face: v(-9.3, 0, 22.3) } },
  clock: { pos: v(10.9, 1.55, 10.0), look: v(8.0, 2.0, 6.2), fov: 54, nexmax: { pos: v(9.0, 0, 7.2), face: v(9.0, 0, 5.8) } },
  station: { pos: v(6.6, 1.9, -6.6), look: v(-0.6, 2.3, -7.8), fov: 56, nexmax: { pos: v(0.4, 0, -7.0), face: v(0.1, 0, -5.8) } },
  alley: { pos: v(17.3, 1.65, 12.4), look: v(15.9, 1.1, 17.4), fov: 56, nexmax: { pos: v(16.85, 0, 16.0), face: v(15.68, 0, 16.6) }, matsui: { pos: v(17.2, 0, 17.6), face: v(15.68, 0, 16.6) } },
  record: { pos: v(17.3, 1.65, 12.4), look: v(15.9, 1.1, 17.4), fov: 56, nexmax: { pos: v(16.85, 0, 16.0), face: v(15.68, 0, 16.6) } },
  lot: { pos: v(19.9, 2.6, 21.0), look: v(13.0, 1.1, 24.6), fov: 60, nexmax: { pos: v(15.6, 0, 22.9), face: v(12.75, 0, 23.6) }, ofuji: { ...SPOTS_V7.ofujiWind, pose: 'crank' }, matsui: { ...SPOTS_V7.matsuiShrine }, saeki: { ...SPOTS_V7.saekiShrine } },
  shrine: { pos: v(15.6, 1.45, 22.3), look: v(12.8, 1.05, 23.75), fov: 44, ofuji: { ...SPOTS_V7.ofujiWind, pose: 'crank' } },
  shrine_new: { pos: v(15.6, 1.45, 22.3), look: v(12.8, 1.05, 23.75), fov: 44 },
  armor: { pos: v(-0.4, 2.0, 6.4), look: v(-3.7, 1.5, 8.5), fov: 52, nexmax: { pos: v(-1.7, 0, 7.0), face: v(-3.7, 0, 8.5) }, brute: { pos: v(-3.8, 0, 8.6), face: v(-1.7, 0, 7.0) } },
  defense: { pos: v(18.6, 1.7, 20.4), look: v(15.2, 3.6, 25.4), fov: 66, time: 'night', nexmax: { pos: v(15.2, 0, 23.4), face: v(19.5, 0, 26) }, matsui: { ...SPOTS_V7.matsuiProject } },
  overview: { pos: v(25.0, 17.0, 34.0), look: v(15.5, 0.0, 22.5), fov: 55 },
}

declare global {
  interface Window {
    __nambaReady?: boolean
    __namba?: unknown
  }
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r, 30))
const vec = (k: string) => {
  const a = (urlp.get(k) ?? '').split(',').map(Number)
  return a.length === 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null
}
const num = (k: string, d: number) => (urlp.has(k) ? Number(urlp.get(k)) : d)

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
  const camName = urlp.get('cam') ?? 'kanban'
  const preset = CAMS[camName] ?? CAMS.kanban

  loading.set(0.1, 'なんばを組み立て中…')
  const t0 = performance.now()
  const ns = await buildChronicleNamba(q, aniso, (p, msg) => loading.set(0.1 + p * 0.5, msg), nextFrame)
  const buildMs = performance.now() - t0
  scene.add(ns.root)

  // 空・環境光・太陽（シェルと同じ作り）
  const day = ALLEY_PALETTES.day
  const sunDir = sunDirection(day.sunYaw, day.sunEl)
  const sky = createSkyDome(day.sky, sunDir)
  scene.add(sky)
  const ibl = (await loadHDRIEnvironment(renderer, './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr')) ?? createSkyEnvironment(renderer, day.sky, sunDir)
  scene.environment = ibl
  scene.fog = new THREE.FogExp2(new THREE.Color(day.fog.color), day.fog.density)
  const rig = createSunRig(scene, q, sunDir)
  const post = createPost(renderer, scene, camera, q)
  const time = new AlleyTime({ scene, sky, sun: rig, post }, ns.glowMats)
  ns.attachTime(time)
  const tp = urlp.get('time') ?? preset.time ?? 'day'
  if (/^[0-9.]+$/.test(tp)) time.setValue(Number(tp), true)
  else time.set(tp as AlleyPhase, true)
  time.apply()
  const lanternLights: THREE.PointLight[] = []
  for (let i = 0; i < 6; i++) {
    const pl = new THREE.PointLight('#ffae5a', 0, 7, 2)
    scene.add(pl)
    lanternLights.push(pl)
  }
  const assignLights = (center: THREE.Vector3) => {
    const sorted = ns.lights
      .map((l) => ({ l, d: l.pos.distanceToSquared(center) }))
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

  // 人
  loading.set(0.7, '人を読み込み中…')
  const place = (root: THREE.Object3D, p: Place) => {
    root.position.copy(p.pos)
    root.rotation.y = Math.atan2(-(p.face.x - p.pos.x), -(p.face.z - p.pos.z))
  }
  const nexmax = createNexmax(1.05)
  scene.add(nexmax.root)
  nexmax.root.visible = !!preset.nexmax
  if (preset.nexmax) {
    place(nexmax.root, preset.nexmax)
    nexmax.setPose((preset.nexmax.pose as 'idle') ?? 'idle')
  }
  const people: Array<{ ch: { root: THREE.Object3D; update(dt: number, s: number): void; setPose(p: never): void } }> = []
  const addPerson = (ch: Character | ReturnType<typeof createOfujiPlaceholder>, p?: Place) => {
    scene.add(ch.root)
    ch.root.visible = !!p
    if (p) {
      place(ch.root, p)
      ch.setPose((p.pose as 'idle') ?? 'idle')
    }
    people.push({ ch: ch as never })
  }
  const [matsui, saeki] = await Promise.all([loadCharacter('matsui', 1.72), loadCharacter('saeki', 1.6).catch(() => createSaekiPlaceholder(1.6))])
  addPerson(matsui, preset.matsui)
  addPerson(saeki, preset.saeki)
  addPerson(await loadCharacter('ofuji', 1.42).catch(() => createOfujiPlaceholder(1.42) as unknown as Character), preset.ofuji)

  // よろいの影獣（欠け重を影の色で）
  const brute = new EnemyModel('brute', { panel: '#1a1426', trim: '#8a3cff', eye: '#ffb02a', body: '#120c1a' })
  brute.root.scale.setScalar(1.4)
  scene.add(brute.root)
  brute.root.visible = !!preset.brute
  const armor = new ArmorPlates()
  scene.add(armor.group)
  if (preset.brute) {
    place(brute.root, preset.brute)
    armor.attach(brute.root)
    for (const i of (urlp.get('strip') ?? '').split(',').filter(Boolean).map(Number)) armor.strip(i, nexmax.root.position)
    if (urlp.has('hl')) armor.setHighlight(Number(urlp.get('hl')), true)
  }

  // ほこら：比べる用の新しい姿（1726）
  if (camName === 'shrine_new') {
    ns.shrine.root.visible = false
    const s0 = buildShrine({ age: 0 })
    s0.root.position.copy(SHRINE.pos)
    s0.root.rotation.y = SHRINE.yaw
    scene.add(s0.root)
    s0.setDoors(num('doors', 0))
    s0.setSun(num('sun', 0))
    ns.root.userData.newShrine = s0
  }
  const sh = ns.shrine
  sh.setDamage(num('damage', 0))
  sh.setDoors(num('doors', camName === 'shrine' ? 0.8 : 0))
  sh.setGlow(num('glow', camName === 'defense' ? 0.6 : 0.25))
  sh.setSun(num('sun', 0))
  sh.setKey(preset.ofuji?.pose === 'crank')
  if (urlp.get('proj') === '1') ns.morningProjection(true, true)
  if (urlp.get('aim') === '1') ns.projection.setAim(DEFENSE.darkCorners[0])
  const crack = num('crack', camName === 'defense' ? 1 : 0)
  if (crack > 0) ns.skyCrack.setCrack(crack, true)
  if (urlp.get('mouths') === '1' || camName === 'defense') {
    ns.mouths.setActive('north', 1, true)
    ns.mouths.setActive('south', 1, true)
    ns.mouths.setActive('roof', 1, true)
  }
  const surgeK = num('surge', camName === 'surge' ? 0.85 : 0)
  if (surgeK > 0) ns.surge.setLevel(surgeK, urlp.get('dark') === '1')

  // HUD・IDO の記録・検索の画面・社長の絵のアップ
  const hud = new Hud(ui)
  hud.setEra('2026年　大阪・なんば')
  hud.setTheme('2026')
  hud.setArms({ right: { name: 'つかむNMClaw', holding: null, selected: true, active: false }, left: { name: null, selected: false } })
  hud.setObjective(urlp.get('obj') ?? '60年前の大阪', urlp.get('objsub') ?? '物語 v7 の舞台のプレビュー')
  if (urlp.has('nohud')) ui.style.display = 'none'
  const panelFx = new IdoPanelFx()
  const recKind = urlp.get('record') ?? (camName === 'record' ? 'alley' : null)
  if (recKind) {
    const r = IDO_RECORDS.find((x) => x.id === (recKind === 'clock' ? 'clock_shop' : recKind === 'station' ? 'station_clock' : 'old_alley'))
    if (r) {
      const img = recordImage(r.image)
      if (img) panelFx.start(img)
      hud.showIdo({ ...r.panel, image: img ? panelFx.canvas : null })
    }
  }
  const search = new IdoSearchPanel(ui)
  const words = urlp.get('words') ?? (camName === 'search' ? '青い石' : null)
  if (words) {
    search.open()
    const w = words.split(',')
    if (w.length > 1) void search.search([w[0]], { perChar: 0, think: 0 }).then(() => search.search(w, { perChar: 0.05, think: 0.1 }))
    else void search.search(w, { perChar: 0.05, think: 0.1 })
    if (urlp.has('checked')) search.setChecked((urlp.get('checked') ?? '').split(','))
  }
  const closeup = new SketchCloseup(ui)
  const cu = urlp.get('closeup')
  if (cu) {
    closeup.show('絵のすみに、小さく「NEXTMAKE 001」')
    if (cu === '2') {
      closeup.markCorner(true)
      closeup.zoomCorner(true)
    }
  }

  // カメラ
  const cpos = vec('campos')
  const clook = vec('look')
  if (cpos) preset.pos.copy(cpos)
  if (clook) preset.look.copy(clook)
  camera.position.copy(preset.pos)
  camera.fov = num('fov', preset.fov)
  camera.updateProjectionMatrix()
  camera.lookAt(preset.look)
  const resize = () => {
    const { w, h } = size()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    post.setSize(w, h)
  }
  window.addEventListener('resize', resize)
  resize()
  if (urlp.has('label')) label.textContent = `${camName} / ${tp}`
  else label.style.display = 'none'

  loading.set(0.9, 'シェーダを準備中…')
  await nextFrame()
  assignLights(preset.look.clone().lerp(preset.pos, 0.5))
  rig.follow(preset.look)
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))])
  loading.hide()

  // 撮影用：検索の画面と記録の絵の組み上がりを先に進めておく（遅い描画でも結果が並んだ姿を撮れる）
  for (let i = 0; i < 120; i++) {
    search.update(0.1)
    panelFx.update(0.1)
    await Promise.resolve()
  }
  const fixedT = urlp.has('t') ? Number(urlp.get('t')) : null
  if (fixedT !== null) uTime.value = fixedT
  const timer = new THREE.Timer()
  timer.connect(document)
  let frames = 0
  let tt = fixedT ?? 0
  const stats = { calls: 0, tris: 0, frames: 0, buildMs }
  /** 1 つの部品の三角形と描画の数（メッシュの数） */
  const partStats = (o: THREE.Object3D) => {
    let tris = 0
    let meshes = 0
    o.traverse((x) => {
      const m = x as THREE.Mesh
      if (!m.isMesh || !m.visible) return
      meshes++
      const g = m.geometry
      const n = g.index ? g.index.count : g.attributes.position.count
      tris += (n / 3) * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1)
    })
    return { meshes, tris: Math.round(tris) }
  }
  const measure = () => {
    const auto = renderer.info.autoReset
    renderer.info.autoReset = false
    renderer.info.reset()
    renderer.render(scene, camera)
    const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0 }
    renderer.info.autoReset = auto
    return r
  }
  window.__namba = {
    scene,
    camera,
    ns,
    time,
    armor,
    brute,
    search,
    closeup,
    hud,
    nexmax,
    measure,
    parts: () => ({ shrine: partStats(ns.shrine.root), armor: partStats(armor.group), surge: partStats(ns.surge.group), projection: partStats(ns.projection.group), mouths: partStats(ns.mouths.mesh), crack: partStats(ns.skyCrack.mesh), armorSources: partStats(ns.armorSources.group), brute: partStats(brute.root) }),
    stats: () => ({ ...stats }),
    setTime: (p: AlleyPhase) => time.set(p),
  }
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1)
    if (fixedT === null) uTime.value += dt
    tt += fixedT === null ? dt : 0
    renderer.info.reset()
    nexmax.update(dt, 0)
    for (const p of people) p.ch.update(dt, 0)
    if (brute.root.visible) brute.animate(dt, tt, 'idle', tt, 0, 0, 0.9)
    armor.update(dt, tt)
    ns.update(dt, tt, camera)
    panelFx.update(dt)
    search.update(dt)
    rig.follow(preset.look)
    sky.position.copy(camera.position)
    post.render(dt)
    stats.calls = renderer.info.render.calls
    stats.tris = renderer.info.render.triangles
    stats.frames = ++frames
    if (frames === 3) window.__nambaReady = true
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
