// 2086年 ナンバタウン「時代博覧祭」の単体プレビュー（future-preview.html）。シェル（game/）に依存せず、
// 共有のレンダラ・後処理・HUD・主人公のリグ・ソラ・量産型ネクマックスだけで組み立てて撮影・確認する。
// クエリ：
//   time=morning|night         時間帯
//   cam=overview|street|booth|stalls|orum|portal|walkway|swing|units|night_street  固定カメラ
//   loop=1                     夜からループの演出を再生（fxAt=秒 でその瞬間に止める）
//   rift=0..1                  IDO の展示画面を裂け目に（ritfAnim=1 で開く動き）
//   orum=0..1                  夜のオルムの出現度（既定 1）、dissolve=0..1 遠景の溶け具合
//   debris=1                   夜に破片を落とす（撮影用）
//   play=1                     実際に操作して遊ぶ（物理・NMClaw・物語の状態機械）。step=ステップ ID で途中から
//   nohud / stats / quality=low / t=秒（シェーダの時刻を固定）
//   campos=x,y,z&look=x,y,z&fov=度   好きな位置から撮る
//   chronicle=1                物語 v7 の舞台を足して撮る（cam=clocktower など。chronicle/previewChronicle.ts）
import * as THREE from 'three'
import { readParams } from '../../render/quality'
import { createRenderer, createSunRig } from '../../render/renderer'
import { createPost } from '../../render/post'
import { createMaterialLibrary, uTime } from '../../render/materials'
import { createSkyDome, createSkyEnvironment, loadHDRIEnvironment } from '../../render/sky'
import { loadCharacter, type Character } from '../../world/characters'
import { createNexmax, type NexmaxCharacter } from '../../world/nexmax/nexmaxModel'
import { Hud, LoadingOverlay } from '../../ui/hud'
import { preloadFutureAssets } from './fmaterials'
import { buildFutureScene, type FutureScene, type SoraSpotId } from './scene'
import { FUTURE_ENVIRONMENTS, applyTimeOfDay, type TimeOfDay } from './environment'
import { LoopFx } from './loopFx'
import { F } from './layout'
import { Future2086Story, OBJECTIVES, type StoryStepId } from './future2086Story'
import { startPlay } from './previewPlay'
import { buildChronicleFuture, type ChronicleAdditions } from './chronicle/additions'
import { CHRONICLE_CAMS, setupChroniclePreview } from './chronicle/previewChronicle'
import { buildIntroProps } from './introProps2086'

const urlp = new URLSearchParams(location.search)
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

type CamPreset = { pos: THREE.Vector3; look: THREE.Vector3; fov: number; time?: TimeOfDay; nexmax?: { pos: THREE.Vector3; face: THREE.Vector3; pose?: string }; sora?: SoraSpotId; step?: StoryStepId }

const CAMS: Record<string, CamPreset> = {
  overview: { pos: v(5.0, 6.4, 16.8), look: v(-3.0, 4.2, -14), fov: 60, nexmax: { pos: v(1.5, 0, 15.2), face: v(-2, 0, 0) }, sora: 'booth', step: 'go_booth' },
  street: { pos: v(3.1, 1.45, 19.6), look: v(-1.0, 3.6, 2.0), fov: 58, nexmax: { pos: v(1.6, 0, 16.2), face: v(-1.5, 0, 6) }, sora: 'booth', step: 'go_booth' },
  booth: { pos: v(-3.0, 1.05, 2.9), look: v(-8.2, 1.75, -3.0), fov: 56, nexmax: { pos: v(-4.6, 0, 0.6), face: v(-6.6, 0, -3.1) }, sora: 'booth', step: 'talk_sora' },
  stalls: { pos: v(5.6, 1.6, 6.8), look: v(15.0, 1.6, -0.6), fov: 56, nexmax: { pos: v(10.2, 0, 3.4), face: v(14, 0, 2) }, step: 'fetch_lens' },
  units: { pos: v(10.9, 1.5, -3.6), look: v(15.3, 1.25, -6.7), fov: 52, nexmax: { pos: v(12.5, 0, -5.0), face: v(15, 0, -6.6) }, step: 'fetch_lens' },
  portal: { pos: v(-4.6, 1.25, 3.6), look: v(-9.6, 2.4, -2.6), fov: 58, nexmax: { pos: v(-7.6, F.BOOTH.h, 0.2), face: v(-9.4, 0, -2.6), pose: 'idle' }, sora: 'exhibit', step: 'ido_exhibit' },
  walkway: { pos: v(-13.0, 6.6, 9.0), look: v(-15.5, 5.2, -10), fov: 58, nexmax: { pos: v(-17.0, F.WALK_Y, 2.0), face: v(-17, 0, -8) }, step: 'swing_gap' },
  swing: { pos: v(-8.6, 6.4, -9.0), look: v(1.0, 8.0, -17.2), fov: 60, nexmax: { pos: v(-5.2, F.WALK_Y, -17.2), face: v(0, 0, -17.2) }, step: 'swing_gap' },
  orum: { pos: v(0.4, 1.2, 11.8), look: v(16, 46, -120), fov: 64, time: 'night', nexmax: { pos: v(0.9, 0, 7.4), face: v(30, 0, -60) }, sora: 'night', step: 'night_orum' },
  night_street: { pos: v(3.1, 1.6, 19.6), look: v(-1.0, 4.2, 2.0), fov: 60, time: 'night', nexmax: { pos: v(1.6, 0, 15.6), face: v(-1.5, 0, 6) }, sora: 'night', step: 'evade' },
}

declare global {
  interface Window {
    __futureReady?: boolean
    __future?: unknown
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
  const sora = loadCharacter('sora', 1.58)
  await preloadFutureAssets(aniso)
  const mats = await createMaterialLibrary(aniso)
  loading.set(0.45, 'ナンバタウンを組み立て中…')
  await nextFrame()
  const t0 = performance.now()
  const chronicle = urlp.get('chronicle') === '1'
  let ch: ChronicleAdditions | null = null
  let fs: FutureScene
  if (chronicle) {
    const built = buildChronicleFuture(mats, q, { aniso })
    fs = built.fs
    ch = built.ch
  } else fs = buildFutureScene(mats, q, { aniso })
  // 物語 v7 の確認では、街頭ビジョン・風船などの小物も置く
  const introProps = chronicle ? buildIntroProps(fs.root, fs.colliders) : null
  const buildMs = performance.now() - t0
  scene.add(fs.root)

  // 空・環境光・太陽
  const env0 = FUTURE_ENVIRONMENTS.morning
  const sky = createSkyDome(env0.sky, env0.sunDir)
  scene.add(sky)
  loading.set(0.6, '空と環境光を準備中…')
  await nextFrame()
  const morningEnv = (env0.hdri ? await loadHDRIEnvironment(renderer, env0.hdri) : null) ?? createSkyEnvironment(renderer, env0.sky, env0.sunDir)
  const nightEnv = createSkyEnvironment(renderer, FUTURE_ENVIRONMENTS.night.sky, env0.sunDir)
  const rig = createSunRig(scene, q, env0.sunDir)
  const post = createPost(renderer, scene, camera, q)
  const lanternLights: THREE.PointLight[] = []
  for (let i = 0; i < 6; i++) {
    const pl = new THREE.PointLight('#ffae5a', 0, 7, 2)
    scene.add(pl)
    lanternLights.push(pl)
  }
  const setTime = (mode: TimeOfDay) => {
    fs.setTimeOfDay(mode)
    ch?.setTimeOfDay(mode)
    applyTimeOfDay(fs.environment, { scene, sky, sun: rig.sun, hemi: rig.hemi, post, envMaps: { morning: morningEnv, night: nightEnv } })
  }

  // キャラクター
  loading.set(0.75, 'キャラクターを読み込み中…')
  const nexmax: NexmaxCharacter = createNexmax(1.05)
  scene.add(nexmax.root)
  const soraCh: Character = await sora
  scene.add(soraCh.root)
  const placeSora = (spot: SoraSpotId) => {
    const s = fs.npcs.sora[spot]
    soraCh.root.position.copy(s.pos)
    soraCh.root.rotation.y = s.yaw
    soraCh.setPose(s.pose)
  }

  const hud = new Hud(ui)
  hud.setEra('2086年　ナンバタウン')
  hud.setArms({ right: { name: 'つかむNMClaw', holding: null, selected: true, active: false }, left: { name: null, selected: false } })
  if (urlp.has('nohud')) ui.style.display = 'none'
  const fx = new LoopFx(camera, scene)

  const resize = () => {
    const { w, h } = size()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    post.setSize(w, h)
    fx.setAspect(w / h)
  }
  window.addEventListener('resize', resize)
  resize()

  const assignLights = (center: THREE.Vector3) => {
    const sorted = fs.lights
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
      pl.intensity = s.l.intensity * (fs.timeOfDay === 'night' ? 3.0 : 1.6)
      pl.distance = s.l.dist
    })
  }

  // ---------------------------------------------------------------- 遊ぶ（物理・NMClaw・物語）
  if (urlp.get('play') === '1') {
    loading.set(0.9, 'シェーダを準備中…')
    await startPlay({ renderer, scene, camera, post, hud, fs, nexmax, sora: soraCh, rig, setTime, assignLights, lanternLights, fx, sky, label, loading, buildMs })
    return
  }

  // ---------------------------------------------------------------- 撮影
  const camName = urlp.get('cam') ?? 'overview'
  const chCam = chronicle ? CHRONICLE_CAMS[camName] : undefined
  const preset: CamPreset = chCam
    ? { pos: chCam.pos.clone(), look: chCam.look.clone(), fov: chCam.fov, time: chCam.time, nexmax: chCam.nexmax, step: 'go_booth' }
    : (CAMS[camName] ?? CAMS.overview)
  const time: TimeOfDay = (urlp.get('time') as TimeOfDay) ?? preset.time ?? 'morning'
  setTime(time === 'night' ? 'night' : 'morning')
  if (time === 'night') {
    fs.setOrum({ show: Number(urlp.get('orum') ?? 1), tomorrow: Number(urlp.get('tomorrow') ?? 0.6), dissolve: Number(urlp.get('dissolve') ?? 0.45) })
  }
  // campos=x,y,z&look=x,y,z で好きな位置から撮る（検証用）
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
  if (preset.nexmax) {
    nexmax.root.position.copy(preset.nexmax.pos)
    nexmax.root.rotation.y = Math.atan2(-(preset.nexmax.face.x - preset.nexmax.pos.x), -(preset.nexmax.face.z - preset.nexmax.pos.z))
    nexmax.setPose((preset.nexmax.pose as 'idle') ?? 'idle')
  }
  placeSora(preset.sora ?? (time === 'night' ? 'night' : 'booth'))
  if (chCam && chCam.sora !== undefined) {
    if (chCam.sora === null) soraCh.root.visible = false
    else {
      soraCh.root.position.copy(chCam.sora.pos)
      soraCh.root.rotation.y = Math.atan2(-(chCam.sora.face.x - chCam.sora.pos.x), -(chCam.sora.face.z - chCam.sora.pos.z))
      soraCh.setPose((chCam.sora.pose as 'idle') ?? 'idle')
    }
  }
  const story = new Future2086Story({ start: preset.step ?? 'go_booth' })
  const stepParam = urlp.get('step') as StoryStepId | null
  const obj = OBJECTIVES[stepParam ?? story.step]
  hud.setObjective(obj.title, obj.sub)
  hud.setHints(story.hints())
  const rift = Number(urlp.get('rift') ?? 0)
  if (rift > 0) fs.openRift(rift)
  if (urlp.get('debris') === '1') fs.debris.setActive(true)
  if (urlp.has('label')) label.textContent = `${camName} / ${time}`
  else label.style.display = 'none'
  const chPreview = ch && chCam ? setupChroniclePreview({ urlp, fs, ch, hud, ui, nexmax, sora: soraCh, cam: chCam, camName, street: introProps?.street }) : null

  // 事前コンパイル
  loading.set(0.9, 'シェーダを準備中…')
  await nextFrame()
  assignLights(preset.look.clone().lerp(preset.pos, 0.5))
  rig.follow(preset.nexmax?.pos ?? preset.look)
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))])
  loading.hide()

  const fixedT = urlp.has('t') ? Number(urlp.get('t')) : null
  if (fixedT !== null) uTime.value = fixedT
  // ループの演出
  const loopParam = urlp.get('loop') === '1'
  const fxAt = urlp.has('fxAt') ? Number(urlp.get('fxAt')) : null
  let loopStarted = false
  const startLoop = () => {
    loopStarted = true
    fx.play({
      at: nexmax.root.position.clone().add(v(0, 0.55, 0.1)),
      onOre: (x) => nexmax.setOreGlow(x),
      onSwap: () => {
        setTime('morning')
        placeSora('booth')
      },
      onDone: () => nexmax.setOreGlow(1),
    })
    if (fxAt !== null) {
      // 指定の瞬間まで進めて止める（撮影用）
      for (let t = 0; t < fxAt; t += 1 / 60) {
        fx.update(1 / 60)
        nexmax.update(1 / 60, 0)
      }
    }
  }
  if (loopParam) {
    setTime('night')
    fs.setOrum({ show: 1, tomorrow: 0.3, dissolve: 0.6, swallow: 0.6 })
    placeSora('night')
    startLoop()
  }

  const timer = new THREE.Timer()
  timer.connect(document)
  let frames = 0
  let shake = 0
  const camBase = camera.position.clone()
  const stats = { calls: 0, tris: 0, frames: 0, buildMs }
  window.__future = {
    scene,
    camera,
    fs,
    ch,
    introProps,
    nexmax,
    sora: soraCh,
    setTime,
    startLoop,
    stats: () => ({ ...stats, textures: renderer.info.memory.textures, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0 }),
  }
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1)
    if (fixedT === null) uTime.value += dt
    renderer.info.reset()
    nexmax.update(dt, 0)
    soraCh.update(dt, 0)
    fs.update(dt, uTime.value)
    ch?.update(dt, uTime.value)
    introProps?.update(dt)
    chPreview?.update(dt)
    if (fs.debris.active) {
      const r = fs.debris.update(dt, nexmax.root.position)
      shake = r.shake
    }
    if (loopStarted && fxAt === null) fx.update(dt)
    camera.position.copy(camBase)
    if (shake > 0) camera.position.add(v((Math.random() - 0.5) * 0.06 * shake, (Math.random() - 0.5) * 0.06 * shake, 0))
    rig.follow(preset.nexmax?.pos ?? preset.look)
    sky.position.copy(camera.position)
    post.render(dt)
    stats.calls = renderer.info.render.calls
    stats.tris = renderer.info.render.triangles
    stats.frames = ++frames
    if (frames === 3) window.__futureReady = true
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
