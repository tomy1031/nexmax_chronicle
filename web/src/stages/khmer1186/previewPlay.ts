// プレビューの「遊ぶ」モード（khmer-preview.html?play=1）：物理・プレイヤー・カメラ・NMClaw をつないで、
// 北の塔への飛び移り・象に乗る・落ちてくる石を止めて足場にする、を実際に試す（物語は無し）。
// G：「止める」のまね（画面の中央に近い、止められる物を 4 秒止める。フェーズ 2 ではシェルの rt.chrono が受け持つ）
// シェルのステージ（フェーズ 2 の KhmerStage）での使い方の見本：begin で attachPhysics、update で carryPlayer
import * as THREE from 'three'
import { createPhysics } from '../../player/physics'
import { PlayerController } from '../../player/controller'
import { CameraRig } from '../../player/cameraRig'
import { createInput } from '../../player/input'
import { resolveActions } from '../../player/inputActions'
import { ClawSystem } from '../../player/clawSystem'
import { TARGET_CATEGORY, type ClawTargetType } from '../../player/clawLogic'
import { PART_NAMES } from '../../player/equipment'
import { applyPose, applyRigClaw, applyRigSwing, choosePose } from '../../player/poseDriver'
import { uTime } from '../../render/materials'
import type { PostChain } from '../../render/post'
import type { SunRig } from '../../render/renderer'
import type { NexmaxCharacter } from '../../world/nexmax/nexmaxModel'
import { Hud, type Hint, type LoadingOverlay } from '../../ui/hud'
import type { KhmerScene } from './sceneKhmer'
import type { TimeOfDay } from './environment'
import type { Freezable } from './mirrors'
import { SPAWNS } from './layout'

export type KhmerPlayCtx = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  post: PostChain
  ui: HTMLDivElement
  ks: KhmerScene
  nexmax: NexmaxCharacter
  rig: SunRig
  sky: THREE.Mesh
  setTime(t: TimeOfDay): void
  assignLights(center: THREE.Vector3): void
  label: HTMLDivElement
  loading: LoadingOverlay
  buildMs: number
}

const FIRE_VERB: Record<ClawTargetType, string> = {
  pull_object: 'つかむ',
  pull_player: '飛びつく',
  swing_anchor: 'ぶら下がる',
  hold_mechanism: '支える',
  enemy_pull: '引き寄せる',
  enemy_zip: '飛び込む',
  chrono_freeze: '止める',
  chrono_seam: '裂く',
  chrono_ura: '裂く',
}

export async function startKhmerPlay(p: KhmerPlayCtx): Promise<void> {
  const { renderer, scene, camera, post, ks, nexmax, rig, sky } = p
  const urlp = new URLSearchParams(location.search)
  const phys = await createPhysics(ks.colliders)
  ks.attachPhysics(phys)
  const input = createInput(renderer.domElement)
  const sp = SPAWNS[urlp.get('spawn') ?? 'arrive'] ?? SPAWNS.arrive
  const player = new PlayerController(phys, sp.pos.clone())
  player.facing = sp.facing
  const camRig = new CameraRig(camera, phys, player.collider)
  camRig.yaw = sp.camYaw
  camRig.pitch = sp.camPitch
  const claw = new ClawSystem(phys, player, ks.claw.targets, ks.claw.movables)
  scene.add(claw.beam.group)
  nexmax.root.visible = true
  const hud = new Hud(p.ui)
  hud.setEra('1186年　アルンの寺と村（プレビュー）')
  hud.setObjective('北の塔へ', '小屋の軒の金具に J で飛びつこう')
  if (urlp.has('nohud')) p.ui.style.display = 'none'

  // 「止める」のまね（G）
  const freezables: Freezable[] = ks.freezables()
  let frozen: { f: Freezable; t: number } | null = null
  const tmp = new THREE.Vector3()
  const pickFreezable = (): Freezable | null => {
    let best: Freezable | null = null
    let bs = Infinity
    camera.getWorldDirection(tmp)
    for (const f of freezables) {
      if (!f.canFreeze()) continue
      const d = f.point.clone().sub(camera.position)
      const dist = d.length()
      if (dist > 22) continue
      const ang = d.normalize().angleTo(tmp)
      if (ang > 0.5) continue
      const s = ang * 10 + dist * 0.1
      if (s < bs) {
        bs = s
        best = f
      }
    }
    return best
  }

  claw.onEvent = (e) => {
    if (e.kind === 'arrived' && e.target.facing) camRig.turnTo(Math.atan2(e.target.facing.x, e.target.facing.z), 0.5)
  }

  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))])
  p.loading.hide()

  const hand = new THREE.Vector3()
  const timer = new THREE.Timer()
  timer.connect(document)
  let lightTimer = 0
  let frames = 0
  let airTime = 0
  let landTimer = 0
  let fireTimer = 0
  let riding: string | null = null
  window.__khmer = {
    ks,
    player,
    claw,
    camRig,
    scene,
    camera,
    renderer,
    phys,
    setTime: p.setTime,
    tp: (x: number, y: number, z: number, yaw?: number) => {
      claw.reset()
      player.teleport(new THREE.Vector3(x, y, z), yaw)
      if (yaw !== undefined) camRig.yaw = yaw
    },
    freeze: () => {
      const f = pickFreezable()
      if (f) {
        frozen?.f.setFrozen(false)
        f.setFrozen(true)
        frozen = { f, t: 4 }
      }
      return f?.id ?? null
    },
    /** 描画せずに、seconds 秒ぶん歩く（テスト用。move は {x,y}、jumpAt は跳ぶ時刻（秒）の一覧） */
    sim: (seconds: number, move = { x: 0, y: 1 }, jumpAt: number[] = [], dash = false) => {
      const dt = 1 / 60
      const jumps = [...jumpAt]
      const empty = { pressed: new Set<string>(), held: new Set<string>(), move: { x: 0, y: 0 }, look: { x: 0, y: 0 } } as unknown as ReturnType<typeof resolveActions>
      for (let t = 0; t < seconds; t += dt) {
        const jump = jumps.length > 0 && t >= jumps[0]
        if (jump) jumps.shift()
        player.update(dt, { move, jump, dash }, camRig.yaw)
        claw.update(dt, empty, camRig.yaw)
        ks.update(dt, uTime.value, camera)
        ks.carryPlayer(player)
      }
      return { pos: player.position.toArray().map((x) => +x.toFixed(2)), grounded: player.grounded }
    },
    debug: () => ({
      player: player.position.toArray().map((x) => +x.toFixed(2)),
      grounded: player.grounded,
      wire: claw.wire.phase,
      selected: claw.selectedTarget?.id ?? null,
      riding,
      frozen: frozen?.f.id ?? null,
      calls: renderer.info.render.calls,
    }),
  }
  renderer.info.autoReset = false
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1)
    uTime.value += dt
    renderer.info.reset()
    const frame = resolveActions(input)
    if (input.pressed.has('KeyG')) (window.__khmer as { freeze: () => void }).freeze()
    if (input.pressed.has('KeyT')) p.setTime(ks.time === 'afternoon' ? 'night' : ks.time === 'night' ? 'dawn' : 'afternoon')
    if (frozen) {
      frozen.t -= dt
      if (frozen.t <= 0) {
        frozen.f.setFrozen(false)
        frozen = null
      }
    }
    claw.aim(camera)
    const { jumpConsumed } = claw.handleInput(frame, true, camera)
    player.update(dt, { move: frame.move, jump: frame.pressed.has('jump') && !jumpConsumed, dash: frame.held.has('dash') }, camRig.yaw)
    claw.update(dt, frame, camRig.yaw)
    ks.update(dt, uTime.value, camera)
    // 動く足場（象の背中）に乗っていたら運ぶ
    const r = ks.carryPlayer(player)
    riding = r ? 'elephant' : null
    camRig.update(dt, frame.look, player.position, input.mouseDX, input.mouseDY)
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
    nexmax.setAim(pose === 'fire' || pose === 'pulled' || pose === 'swing' ? (w.target?.point ?? claw.end) : null)
    applyRigClaw(nexmax, w.phase === 'firing' || w.phase === 'miss', w.phase !== 'idle')
    applyRigSwing(nexmax, claw.swingAngle())
    nexmax.setOreGlow(1)
    nexmax.update(dt, player.speed)
    nexmax.root.updateMatrixWorld(true)
    nexmax.handAnchor.getWorldPosition(hand)
    claw.updateVisuals(dt, hand)
    const u = claw.uiState(camera, window.innerWidth, window.innerHeight)
    const s = u.selected ?? u.far
    if (s) hud.setReticle({ mode: u.selected ? 'target' : 'far', x: s.x, y: s.y, r: s.r, category: TARGET_CATEGORY[s.def.type], label: s.def.label, candidates: u.candidates, locked: u.locked, connected: u.connectedType !== null })
    else hud.setReticle({ mode: 'idle' })
    hud.setArms({ right: { name: PART_NAMES.grapple_claw, holding: u.holdingLabel, selected: true, active: u.phase !== 'idle' }, left: { name: null, selected: false } })
    const hints: Hint[] = []
    const sel = claw.selectedTarget
    if (sel && w.phase === 'idle') hints.push({ key: 'J', label: FIRE_VERB[sel.type] })
    if (w.phase === 'swinging') hints.push({ key: 'WASD', label: '揺らす' }, { key: 'Space', label: '離脱' })
    hints.push({ key: 'G', label: '止める（まね）' }, { key: 'T', label: '時間' })
    hud.setHints(hints)
    hud.tick(dt)
    rig.follow(player.position)
    lightTimer -= dt
    if (lightTimer <= 0) {
      p.assignLights(camera.position.clone().lerp(player.position, 0.6))
      lightTimer = 0.4
    }
    sky.position.copy(camera.position)
    post.render(dt)
    input.endFrame()
    if (++frames === 3) window.__khmerReady = true
  })
}
