// 縦切り試作：1726年 大坂・仕掛け横丁（からくり水門）。
// 読み込み → シーン構築 → 物理 → キャラクター → シェーダ事前コンパイル → ループ。
// 操作はキーボードだけで完結（操作マニュアル v1.1）。入力 → アクション（inputActions）→ ゲーム処理。
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
import { resolveActions, type ActionFrame } from '../../player/inputActions'
import { ClawSystem } from '../../player/clawSystem'
import { TARGET_CATEGORY, type ClawTargetType } from '../../player/clawLogic'
import { PART_NAMES, canOpenHub, clawArm, initialEquipment, selectArm } from '../../player/equipment'
import { applyPose, applyRigClaw, applyRigOreGlow, applyRigSwing, choosePose } from '../../player/poseDriver'
import { loadCharacter, type Character } from '../characters'
import { Hud, LoadingOverlay, type Hint } from '../../ui/hud'
import { SHOTS, GATE_GENBEI, GATE_OHARU, SPAWNS, faceYaw, type Placement, type Shot } from './shots'
import { GateFlow } from './clawTargets'
import { GatePhase, GateResult } from '../../core/gatePuzzleLogic'

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

/** 照準が合っているときのキー案内（J の後の言葉） */
const FIRE_VERB: Record<ClawTargetType, string> = {
  pull_object: 'つかむ',
  pull_player: '飛びつく',
  swing_anchor: 'ぶら下がる',
  hold_mechanism: '歯車をつかむ',
}

/** 開始直後に出す操作案内（秒） */
const START_HINT_TIME = 14

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

  step(0.72, '後処理を準備中…')
  const post = createPost(renderer, scene, camera, q)
  step(0.75, 'HUD を準備中…')
  const hud = new Hud(ui)
  if (urlp.has('nohud')) ui.style.display = 'none'
  const input = createInput(renderer.domElement)
  const spawnInfo = SPAWNS[urlp.get('spawn') ?? 'street'] ?? SPAWNS.street
  const spawn = spawnInfo.pos.clone()
  const player = new PlayerController(phys, spawn)
  player.facing = spawnInfo.facing
  const camRig = new CameraRig(camera, phys, player.collider)
  camRig.yaw = spawnInfo.camYaw
  camRig.pitch = spawnInfo.camPitch

  // ------------------------------------------------------------ 装備・クロー・協力パズル
  const equipment = initialEquipment()
  const claw = new ClawSystem(phys, player, edo.claw.targets, edo.claw.movables)
  scene.add(claw.beam.group)
  const gateFlow = new GateFlow(edo.gate, edo.claw.boats, edo.claw.gearTarget, (speaker, text) => hud.say(speaker, text))
  let fireTimer = 0
  let oreGlow = 0
  claw.onEvent = (e) => {
    switch (e.kind) {
      case 'fired':
        fireTimer = 0.25
        break
      case 'missed':
        fireTimer = 0.32
        break
      case 'connected':
        if (e.target.type === 'hold_mechanism') gateFlow.onGrab()
        break
      case 'arrived':
        // 金具の正面側（開けた側）の少し上へカメラを回す（壁際・手すりでカメラが詰まらないように）
        if (e.target.facing) camRig.turnTo(Math.atan2(e.target.facing.x, e.target.facing.z), 0.62)
        break
      case 'released':
        if (e.target.type === 'hold_mechanism') {
          const r = gateFlow.onRelease()
          if (r === GateResult.TOO_EARLY) hud.banner('まだ早い！', 'fail', 1.6)
          else if (r === GateResult.PERSON_IN_DANGER) {
            hud.flash('danger')
            hud.banner('危ない！ 舟が下にいる', 'fail', 2.0)
          } else if (r === GateResult.SUCCESS) {
            hud.flash('success')
            hud.banner('水門 修理完了！', 'success', 3.2)
            oreGlow = 1
          }
        }
        break
    }
  }
  player.onRespawn = () => {
    claw.reset()
    hud.toast('水に落ちた！ 近くのチェックポイントから再開')
  }

  // ------------------------------------------------------------ モード
  let shotIndex = -1 // -1 = プレイ
  let paused = false
  let menuOpen = false
  let playTime = 0
  let airTime = 0
  let landTimer = 0
  let attackToastCooldown = 0
  const savedPlayer = new THREE.Vector3()
  const place = (ch: Character, p: Placement) => {
    ch.root.position.copy(p.pos)
    ch.root.rotation.y = faceYaw(p.pos, p.face)
    ch.setPose(p.pose)
  }
  const applyShot = (shot: Shot | null) => {
    if (shot) {
      claw.reset()
      gateFlow.forceRelease()
      camera.position.copy(shot.cam)
      camera.lookAt(shot.target)
      camera.fov = shot.fov
      camera.updateProjectionMatrix()
      place(nexmax, shot.nexmax)
      place(genbei, shot.genbei)
      place(oharu, shot.oharu)
      nexmax.setAim(shot.claw ? edo.gate.gearGrabPoint : null)
      claw.beam.setActive(shot.claw)
      edo.gate.setGearSpeed(shot.claw ? 0 : 0.25)
      hud.setShot(shot.label)
      hud.setPlayUiVisible(false)
      hud.setArms({ right: { name: PART_NAMES.grapple_claw, holding: shot.claw ? '支えている：大歯車' : null, selected: true, active: shot.claw }, left: { name: null, selected: false } })
      if (shot.claw) hud.setObjective('歯車を動かないように支えよう', '源兵衛が水門を調整中')
      hud.setGate(null)
    } else {
      camera.fov = 55
      camera.updateProjectionMatrix()
      place(genbei, GATE_GENBEI)
      place(oharu, GATE_OHARU)
      nexmax.setPose('idle')
      nexmax.setAim(null)
      claw.beam.setActive(false)
      hud.setShot(null)
      hud.setPlayUiVisible(true)
    }
  }
  const setMode = (idx: number) => {
    if (shotIndex === -1 && idx !== -1) savedPlayer.copy(player.position)
    paused = false
    menuOpen = false
    hud.setPaused(false)
    hud.setMenu(false)
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

  // ------------------------------------------------------------ 事前コンパイル（クローの見た目も含める）
  step(0.85, 'シェーダを準備中…')
  await nextFrame()
  resize()
  assignLights(initialShot >= 0 ? SHOTS[initialShot].focus : spawn)
  rig.follow(initialShot >= 0 ? SHOTS[initialShot].focus : spawn)
  const beamWasActive = claw.beam.active
  claw.beam.setActive(true)
  claw.beam.update(0, spawn.clone().add(new THREE.Vector3(0, 0.6, 0)), spawn.clone().add(new THREE.Vector3(0, 0.6, -2)))
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 6000))])
  claw.beam.setActive(beamWasActive)
  for (let i = 0; i < 2; i++) {
    renderer.info.reset()
    post.render(1 / 60)
  }
  step(1, '完了')
  loading.hide()

  // ------------------------------------------------------------ 会話（F）
  const npcs = [
    { ch: genbei, place: GATE_GENBEI, reach: 2.6 },
    { ch: oharu, place: GATE_OHARU, reach: 3.4 },
  ]
  const nearNpc = () => {
    let best: (typeof npcs)[number] | null = null
    let bd = Infinity
    for (const n of npcs) {
      const d = Math.hypot(n.place.pos.x - player.position.x, n.place.pos.z - player.position.z)
      if (d < n.reach && d < bd) {
        best = n
        bd = d
      }
    }
    return best
  }
  const talk = (who: Character) => {
    const ph = gateFlow.logic.phase
    if (who === genbei) {
      if (ph === GatePhase.DONE) hud.say('源兵衛', '助かったわ。仕掛けは使う人と一緒に作るもんやな。')
      else if (ph === GatePhase.WAIT_SIGNAL) hud.say('源兵衛', '歯止めは入っとる。おはるの合図で離すんやで。')
      else if (gateFlow.logic.holding) hud.say('源兵衛', '今やっとる！ 離さんといてや！')
      else hud.say('源兵衛', 'おまえさん、その腕で大歯車をつかめるか？ 桟橋から狙うとええ。')
    } else {
      if (ph === GatePhase.DONE) hud.say('おはる', '絵図の写し、ちゃんと残しとくからね。')
      else if (ph === GatePhase.WAIT_SIGNAL) hud.say('おはる', gateFlow.logic.isDanger() ? '待って！ そこに人がいる！' : '今は離して！ もう大丈夫や！')
      else hud.say('おはる', 'うちは見張り台から水路を見とくね！ 舟が来たら教えるから！')
    }
  }

  // ------------------------------------------------------------ キー案内（必要なときだけ）
  const computeHints = (): Hint[] => {
    const w = claw.wire
    switch (w.phase) {
      case 'swinging':
        return [
          { key: 'WASD', label: '揺らす' },
          { key: 'Space', label: '離脱' },
          { key: 'J', label: '離す' },
        ]
      case 'zipping':
        return [{ key: 'Space', label: '離脱' }]
      case 'holding':
        return [{ key: 'J', label: '離す' }, { key: '↑↓←→', label: 'カメラ' }]
      case 'carrying':
      case 'reeling':
        return [{ key: 'J', label: '置く' }, { key: 'WASD', label: '運ぶ' }]
      case 'firing':
      case 'retracting':
      case 'miss':
        return []
    }
    const sel = claw.selectedTarget
    if (sel) {
      const list: Hint[] = [{ key: 'J', label: FIRE_VERB[sel.type] }]
      if (claw.candidateCount > 1) list.push({ key: 'R', label: '対象を切替' })
      return list
    }
    if (nearNpc()) return [{ key: 'F', label: '話す' }]
    if (playTime < START_HINT_TIME) {
      return [
        { key: 'WASD', label: '移動' },
        { key: '↑↓←→', label: 'カメラ' },
        { key: 'Space', label: 'ジャンプ' },
        { key: 'Shift', label: 'ダッシュ' },
        { key: 'J', label: 'つかむ' },
        { key: 'Esc', label: '操作一覧' },
      ]
    }
    return []
  }

  // ------------------------------------------------------------ 1 フレームのゲーム処理
  const hand = new THREE.Vector3()
  const gameplay = (frame: ActionFrame, dt: number) => {
    playTime += dt
    claw.aim(camera)
    if (frame.pressed.has('select_left')) {
      hud.toast(selectArm(equipment, 'left').message)
      hud.pulseArm('left')
    }
    if (frame.pressed.has('select_right')) {
      hud.toast(selectArm(equipment, 'right').message)
      hud.pulseArm('right')
    }
    if (frame.pressed.has('open_hub')) {
      const r = canOpenHub({ unlocked: false, atSafePoint: false, wireMoving: claw.wire.isWireMoving(), airborne: !player.grounded && !player.isExternal, inCombat: false })
      hud.toast(r.message)
    }
    attackToastCooldown -= dt
    if (frame.pressed.has('attack') && attackToastCooldown <= 0) {
      hud.toast('基本攻撃は戦闘の実装後に使えます')
      attackToastCooldown = 2
    }
    if (frame.pressed.has('interact')) {
      const n = nearNpc()
      if (n) talk(n.ch)
    }
    const { jumpConsumed } = claw.handleInput(frame, clawArm(equipment) !== null, camera)
    player.update(dt, { move: frame.move, jump: frame.pressed.has('jump') && !jumpConsumed, dash: frame.held.has('dash') }, camRig.yaw)
    claw.update(dt, frame, camRig.yaw)
    gateFlow.tick(dt)
    camRig.update(dt, frame.look, player.position, input.mouseDX, input.mouseDY)

    // ネクマックスの位置・向き・ポーズ
    nexmax.root.position.copy(player.position)
    nexmax.root.rotation.y = player.facing
    if (!player.grounded && !player.isExternal) airTime += dt
    else {
      if (player.grounded && airTime > 0.3) landTimer = 0.2
      airTime = 0
    }
    landTimer = Math.max(0, landTimer - dt)
    fireTimer = Math.max(0, fireTimer - dt)
    const w = claw.wire
    const pose = choosePose({
      wirePhase: w.phase,
      targetType: w.target?.type ?? null,
      grounded: player.isExternal ? false : player.grounded || airTime < 0.12,
      vy: player.velocity.y,
      speed: player.speed,
      dash: frame.held.has('dash'),
      landTimer,
      fireTimer,
    })
    applyPose(nexmax, pose, player.speed)
    const aimAt = pose === 'fire' || pose === 'hold' || pose === 'pulled' || pose === 'swing' ? (w.target?.point ?? claw.end) : null
    nexmax.setAim(aimAt)
    applyRigClaw(nexmax, w.phase === 'firing' || w.phase === 'miss', w.phase !== 'idle')
    applyRigSwing(nexmax, claw.swingAngle())
    oreGlow = Math.max(0, oreGlow - dt * 0.5)
    applyRigOreGlow(nexmax, oreGlow)

    // 仲間のポーズ（源兵衛は調整中に小車を回す・おはるは危ないと「止まれ」、安全なら手を振る）
    const gs = gateFlow.hudState()
    genbei.setPose(gs.phase === GatePhase.DONE ? 'wave' : 'crank')
    oharu.setPose(gs.signal === 'wait' ? 'hold' : gs.phase === GatePhase.ADJUSTING && gateFlow.logic.holding ? 'idle' : 'wave')
    if (gs.signal === 'wait') oharu.setAim(null)

    // HUD
    hud.setHints(computeHints())
    const o = gateFlow.objective()
    hud.setObjective(o.title, o.sub)
    hud.setGate(gs.visible ? { progress: gs.progress, signal: gs.signal, signalText: gs.signalText, adjusting: gs.phase === GatePhase.ADJUSTING && gateFlow.logic.holding } : null)
  }

  // ------------------------------------------------------------ ループ
  const timer = new THREE.Timer()
  timer.connect(document)
  let fpsAcc = 0
  let fpsFrames = 0
  let fps = 60
  let lightTimer = 0
  const tmpA = new THREE.Vector3()
  let lastFrame: ActionFrame | null = null
  window.__slice = {
    scene,
    camera,
    renderer,
    player,
    edo,
    camRig,
    claw,
    gateFlow,
    equipment,
    debug: () => ({
      phase: claw.wire.phase,
      target: claw.wire.target?.id ?? null,
      selected: claw.selectedTarget?.id ?? null,
      candidates: claw.candidateCount,
      player: player.position.toArray().map((x) => +x.toFixed(2)),
      grounded: player.grounded,
      external: player.isExternal,
      gatePhase: gateFlow.logic.phase,
      gateProgress: +gateFlow.logic.progress.toFixed(2),
      danger: gateFlow.logic.isDanger(),
      lastResult: gateFlow.lastResult,
      boats: gateFlow.logic.boats.map((x) => +x.toFixed(1)),
      paused,
      menuOpen,
      camYaw: +camRig.yaw.toFixed(2),
      camPitch: +camRig.pitch.toFixed(2),
      move: lastFrame ? lastFrame.move : null,
      movables: edo.claw.movables.map((m) => ({ id: m.def.id, pos: m.object.position.toArray().map((x) => +x.toFixed(2)) })),
    }),
  }

  // 開発用：?slowmo=0.3 でゲーム時間をゆっくりにする（速い動きの確認・撮影用）
  const timeScale = Math.min(1, Math.max(0.05, Number(urlp.get('slowmo') ?? 1) || 1))
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1) * timeScale
    uTime.value += dt
    renderer.info.reset()
    const frame = resolveActions(input)
    lastFrame = frame
    // 開発用（操作案内には出さない）
    if (input.pressed.has('KeyP')) setMode(shotIndex + 1 >= SHOTS.length ? -1 : shotIndex + 1)
    if (input.pressed.has('F3')) hud.toggleStats()
    if (shotIndex >= 0) {
      if (frame.pressed.has('pause')) setMode(-1)
      focus.copy(SHOTS[shotIndex].focus)
    } else {
      if (frame.pressed.has('pause')) {
        if (menuOpen) menuOpen = false
        else paused = !paused
      } else if (frame.pressed.has('menu') && !paused) menuOpen = !menuOpen
      hud.setPaused(paused)
      hud.setMenu(menuOpen)
      if (!paused && !menuOpen) gameplay(frame, dt)
      focus.copy(player.position)
    }
    const frozen = shotIndex === -1 && (paused || menuOpen)
    const ndt = frozen ? 0 : dt
    nexmax.update(ndt, shotIndex === -1 ? player.speed : SHOTS[shotIndex].nexmax.pose === 'walk' ? 3.2 : 0)
    genbei.update(ndt, 0)
    oharu.update(ndt, 0)
    edo.update(ndt, uTime.value)
    // クロー（右手首の発射口から）
    nexmax.root.updateMatrixWorld(true)
    nexmax.handAnchor.getWorldPosition(hand)
    if (shotIndex >= 0) {
      if (claw.beam.active) claw.beam.update(dt, hand, tmpA.copy(edo.gate.gearGrabPoint), { open: 0, thickness: 1 })
    } else {
      claw.updateVisuals(ndt, hand)
      const { w, h } = size()
      const u = claw.uiState(camera, w, h)
      const s = u.selected ?? u.far
      if (s && !frozen) {
        hud.setReticle({
          mode: u.selected ? 'target' : 'far',
          x: s.x,
          y: s.y,
          r: s.r,
          category: TARGET_CATEGORY[s.def.type],
          label: s.def.label,
          candidates: u.candidates,
          locked: u.locked,
          connected: u.connectedType !== null,
        })
      } else hud.setReticle({ mode: 'idle' })
      hud.setArms({
        right: { name: PART_NAMES.grapple_claw, holding: u.holdingLabel, selected: equipment.selected === 'right', active: u.phase !== 'idle' },
        left: { name: equipment.left ? PART_NAMES[equipment.left] : null, selected: equipment.selected === 'left' },
      })
      if (frozen) hud.setHints([])
    }
    hud.tick(dt)
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
