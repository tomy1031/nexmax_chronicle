// 見た目の縦切り試作：1726年 大坂・仕掛け横丁（からくり水門）。
// 読み込み → シーン構築 → 物理 → キャラクター → シェーダ事前コンパイル → ループ。
import * as THREE from 'three'
import { readParams } from '../../render/quality'
import { createRenderer, createSunRig, AdaptiveResolution } from '../../render/renderer'
import { createPost } from '../../render/post'
import { createMaterialLibrary, uTime } from '../../render/materials'
import { EDO_SKY, createSkyDome, createSkyEnvironment, loadHDRIEnvironment } from '../../render/sky'
import { buildEdoScene } from './scene'
import { createPhysics } from '../../player/physics'
import { PlayerController } from '../../player/controller'
import { CameraRig } from '../../player/cameraRig'
import { createInput } from '../../player/input'
import { ClawBeam } from '../../player/claw'
import { loadCharacter, type Character } from '../characters'
import { Hud, LoadingOverlay } from '../../ui/hud'
import { SHOTS, GATE_GENBEI, GATE_OHARU, faceYaw, type Placement, type Shot } from './shots'

/** 読み込み表示を更新するために 1 フレーム譲る（非表示タブで rAF が止まっても進むよう setTimeout も併用） */
const nextFrame = () =>
  new Promise<void>((r) => {
    let done = false
    const fin = () => {
      if (!done) {
        done = true
        r()
      }
    }
    requestAnimationFrame(fin)
    setTimeout(fin, 60)
  })

declare global {
  interface Window {
    __sliceReady?: boolean
    __slice?: unknown
  }
}

export async function startEdoSlice(app: HTMLDivElement, ui: HTMLDivElement): Promise<void> {
  const params = readParams()
  const q = params.quality
  const urlp = new URLSearchParams(location.search)
  const loading = new LoadingOverlay(ui)
  const t0 = performance.now()
  const step = (p: number, msg: string) => {
    loading.set(p, msg)
    if (urlp.has('debug')) console.info(`[slice] ${(performance.now() - t0).toFixed(0)}ms ${msg}`)
  }
  step(0.05, 'レンダラを準備中…')
  await nextFrame()

  const renderer = createRenderer(app, q)
  const size = () => ({ w: app.clientWidth || window.innerWidth, h: app.clientHeight || window.innerHeight })
  const camera = new THREE.PerspectiveCamera(52, size().w / size().h, 0.1, 2500)
  const scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(new THREE.Color(EDO_SKY.haze), 0.0028)
  // 夕方前の暖かい日差し（西北西・やや低め）
  const sunYaw = (-148 * Math.PI) / 180
  const sunEl = (34 * Math.PI) / 180
  const sunDir = new THREE.Vector3(Math.cos(sunEl) * Math.cos(sunYaw), Math.sin(sunEl), Math.cos(sunEl) * Math.sin(sunYaw)).normalize()
  const sky = createSkyDome(EDO_SKY, sunDir)
  scene.add(sky)

  // キャラクターは早めに読み込み開始（テクスチャ生成と並行）
  const charsPromise = Promise.all([loadCharacter('nexmax', 1.05), loadCharacter('genbei', 1.6), loadCharacter('oharu', 1.32)])
  step(0.12, 'テクスチャを生成中…')
  await nextFrame()
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  const mats = await createMaterialLibrary(aniso)

  step(0.4, '仕掛け横丁を組み立て中…')
  await nextFrame()
  const edo = buildEdoScene(mats, q)
  scene.add(edo.root)

  step(0.55, '物理と環境光を準備中…')
  await nextFrame()
  const [phys, env] = await Promise.all([createPhysics(edo.colliders), loadHDRIEnvironment(renderer, './hdri/kloppenheim_06_puresky_1k.hdr')])
  scene.environment = env ?? createSkyEnvironment(renderer, EDO_SKY, sunDir)
  scene.environmentIntensity = 0.75
  // 水面だけは彩度の高い空を映す（HDRI の白い地平が映ると水が白っぽくなるため）
  const waterEnv = createSkyEnvironment(renderer, { ...EDO_SKY, horizon: '#74b8e6', upper: '#3d8ce0', ground: '#2c7a84', cloudLit: '#e8f2fa' }, sunDir)
  ;(edo.water.material as THREE.MeshStandardMaterial).envMap = waterEnv

  const rig = createSunRig(scene, q, sunDir)
  // 提灯の点光源（数は固定：近い提灯へ毎回移す）
  const lanternLights: THREE.PointLight[] = []
  for (let i = 0; i < 6; i++) {
    const pl = new THREE.PointLight('#ffae5a', 0, 7, 2)
    scene.add(pl)
    lanternLights.push(pl)
  }

  step(0.68, 'キャラクターを読み込み中…')
  await nextFrame()
  const [nexmax, genbei, oharu] = await charsPromise
  for (const ch of [nexmax, genbei, oharu]) scene.add(ch.root)
  const claw = new ClawBeam()
  scene.add(claw.group)

  step(0.72, '後処理を準備中…')
  const post = createPost(renderer, scene, camera, q)
  step(0.75, 'HUD を準備中…')
  const hud = new Hud(ui)
  if (urlp.has('nohud')) ui.style.display = 'none'
  const input = createInput(renderer.domElement)
  const spawn = new THREE.Vector3(-11.5, 0, 9.8)
  const player = new PlayerController(phys, spawn)
  player.facing = -Math.PI / 2 - 0.3
  const camRig = new CameraRig(camera, phys, player.collider)
  camRig.yaw = -Math.PI / 2 + 0.45
  camRig.pitch = 0.28

  // ------------------------------------------------------------ モード
  let shotIndex = -1 // -1 = プレイ
  let holding = false
  const savedPlayer = new THREE.Vector3()
  const place = (ch: Character, p: Placement) => {
    ch.root.position.copy(p.pos)
    ch.root.rotation.y = faceYaw(p.pos, p.face)
    ch.setPose(p.pose)
  }
  const applyShot = (shot: Shot | null) => {
    if (shot) {
      camera.position.copy(shot.cam)
      camera.lookAt(shot.target)
      camera.fov = shot.fov
      camera.updateProjectionMatrix()
      place(nexmax, shot.nexmax)
      place(genbei, shot.genbei)
      place(oharu, shot.oharu)
      nexmax.setAim(shot.claw ? edo.gate.gearGrabPoint : null)
      claw.setActive(shot.claw)
      edo.gate.setGearSpeed(shot.claw ? 0 : 0.25)
      hud.setShot(shot.label)
      hud.setClawActive(shot.claw)
    } else {
      camera.fov = 55
      camera.updateProjectionMatrix()
      place(genbei, GATE_GENBEI)
      place(oharu, GATE_OHARU)
      nexmax.setPose('idle')
      nexmax.setAim(holding ? edo.gate.gearGrabPoint : null)
      claw.setActive(holding)
      edo.gate.setGearSpeed(holding ? 0 : 0.25)
      hud.setShot(null)
      hud.setClawActive(holding)
    }
  }
  const setMode = (idx: number) => {
    if (shotIndex === -1 && idx !== -1) savedPlayer.copy(player.position)
    shotIndex = idx
    if (idx === -1) {
      player.teleport(savedPlayer)
      camRig.syncFrom(camera, savedPlayer)
      applyShot(null)
    } else applyShot(SHOTS[idx])
  }
  const initialShot = params.shot ? SHOTS.findIndex((s) => s.id === params.shot) : -1
  savedPlayer.copy(spawn)
  if (initialShot >= 0) setMode(initialShot)
  else applyShot(null)

  // ------------------------------------------------------------ サイズ・解像度
  const resize = () => {
    const { w, h } = size()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    post.setSize(w, h)
  }
  window.addEventListener('resize', resize)
  const adaptive = new AdaptiveResolution(q.level === 'high' ? 0.85 : 0.7, Math.min(window.devicePixelRatio, q.maxPixelRatio), (r) => {
    renderer.setPixelRatio(r)
    resize()
  })

  // ------------------------------------------------------------ 点光源の割り当て
  const focus = new THREE.Vector3()
  const assignLights = (center: THREE.Vector3) => {
    const sorted = edo.lights
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

  // ------------------------------------------------------------ 事前コンパイル
  step(0.85, 'シェーダを準備中…')
  await nextFrame()
  resize()
  assignLights(initialShot >= 0 ? SHOTS[initialShot].focus : spawn)
  rig.follow(initialShot >= 0 ? SHOTS[initialShot].focus : spawn)
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 6000))])
  for (let i = 0; i < 2; i++) {
    renderer.info.reset()
    post.render(1 / 60)
  }
  step(1, '完了')
  loading.hide()

  // ------------------------------------------------------------ ループ
  const timer = new THREE.Timer()
  timer.connect(document)
  let fpsAcc = 0
  let fpsFrames = 0
  let fps = 60
  let lightTimer = 0
  const tmpA = new THREE.Vector3()
  const tmpB = new THREE.Vector3()
  window.__slice = { scene, camera, renderer, player, edo, camRig }

  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1)
    uTime.value += dt
    renderer.info.reset()
    // 入力
    if (input.pressed.has('KeyP')) setMode(shotIndex + 1 >= SHOTS.length ? -1 : shotIndex + 1)
    if (input.pressed.has('F3')) hud.toggleStats()
    if (input.pressed.has('Escape') && shotIndex >= 0) setMode(-1)
    if (shotIndex === -1) {
      if (input.pressed.has('KeyG')) {
        const near = player.position.distanceTo(edo.gate.gearCenter) < 6.5
        holding = near ? !holding : false
        applyShot(null)
      }
      player.enabled = !holding
      player.update(dt, input, camRig.yaw)
      camRig.update(dt, input, player.position)
      nexmax.root.position.copy(player.position)
      if (holding) {
        nexmax.root.rotation.y = faceYaw(player.position, edo.gate.gearGrabPoint) + 0.7
        nexmax.setPose('hold')
      } else {
        nexmax.root.rotation.y = player.facing
        nexmax.setPose(player.speed > 0.3 ? 'walk' : 'idle')
      }
      focus.copy(player.position)
    } else {
      focus.copy(SHOTS[shotIndex].focus)
    }
    nexmax.update(dt, shotIndex === -1 ? player.speed : SHOTS[shotIndex].nexmax.pose === 'walk' ? 3.2 : 0)
    genbei.update(dt, 0)
    oharu.update(dt, 0)
    edo.update(dt, uTime.value)
    // クロー
    if (claw.active) {
      nexmax.root.updateMatrixWorld(true)
      nexmax.handAnchor.getWorldPosition(tmpA)
      tmpB.copy(edo.gate.gearGrabPoint)
      claw.update(dt, tmpA, tmpB)
    }
    // 影と点光源
    rig.follow(focus)
    lightTimer -= dt
    if (lightTimer <= 0) {
      assignLights(shotIndex === -1 ? camera.position.clone().lerp(focus, 0.6) : focus)
      lightTimer = 0.4
    }
    sky.position.copy(camera.position)
    post.render(dt)
    input.endFrame()
    // 統計
    fpsAcc += dt
    fpsFrames++
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc
      if (!params.fixedRatio) adaptive.sample(fpsAcc / fpsFrames)
      fpsAcc = 0
      fpsFrames = 0
    }
    if (hud.statsOn) {
      hud.updateStats({
        fps,
        ms: 1000 / Math.max(1, fps),
        calls: renderer.info.render.calls,
        tris: renderer.info.render.triangles,
        ratio: renderer.getPixelRatio(),
        quality: q.level,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs?.length ?? 0,
      })
    }
  })
  if (urlp.has('stats')) hud.toggleStats(true)
  window.__sliceReady = true
}
