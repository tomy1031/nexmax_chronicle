// プレビューの「遊ぶ」モード（future-preview.html?play=1）：物理・プレイヤー・カメラ・NMClaw・物語の状態機械をつなぐ。
// シェル（game/）を使わずに、この時代の流れ（チュートリアル 1〜5 とシーン 2〜5）を通しで確かめるための最小のつなぎ。
// シェル側の実装の見本にもなるよう、物語の演出（StoryEffect）の受け取り方をここにまとめる。
import * as THREE from 'three'
import { createPhysics } from '../../player/physics'
import { PlayerController } from '../../player/controller'
import { CameraRig } from '../../player/cameraRig'
import { createInput } from '../../player/input'
import { resolveActions, type ActionFrame } from '../../player/inputActions'
import { ClawSystem } from '../../player/clawSystem'
import { TARGET_CATEGORY, type ClawTargetType } from '../../player/clawLogic'
import { PART_NAMES, clawArm, initialEquipment } from '../../player/equipment'
import { applyPose, applyRigClaw, applyRigSwing, choosePose } from '../../player/poseDriver'
import { uTime } from '../../render/materials'
import type { PostChain } from '../../render/post'
import type { SunRig } from '../../render/renderer'
import type { Character } from '../../world/characters'
import type { NexmaxCharacter } from '../../world/nexmax/nexmaxModel'
import type { Hint, Hud, LoadingOverlay } from '../../ui/hud'
import type { FutureScene, SoraSpotId } from './scene'
import type { TimeOfDay } from './environment'
import type { LoopFx } from './loopFx'
import { Future2086Story, spawnForStep, startStepFromFlags, type DialogueLine, type StoryEffect, type StoryStepId } from './future2086Story'
import type { ZoneId } from './layout'

export type PlayCtx = {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  post: PostChain
  hud: Hud
  fs: FutureScene
  nexmax: NexmaxCharacter
  sora: Character
  rig: SunRig
  setTime(mode: TimeOfDay): void
  assignLights(center: THREE.Vector3): void
  lanternLights: THREE.PointLight[]
  fx: LoopFx
  sky: THREE.Mesh
  label: HTMLDivElement
  loading: LoadingOverlay
  buildMs: number
}

const FIRE_VERB: Record<ClawTargetType, string> = {
  pull_object: 'つかむ',
  pull_player: '飛びつく',
  swing_anchor: 'ぶら下がる',
  hold_mechanism: '支える',
}

/** 会話を 1 行ずつ出す（F で次へ、放っておいても進む） */
class Talk {
  key: string | null = null
  private lines: readonly DialogueLine[] = []
  private idx = 0
  private timer = 0
  private readonly hud: Hud
  onDone: ((key: string) => void) | null = null

  constructor(hud: Hud) {
    this.hud = hud
  }

  get active(): boolean {
    return this.key !== null
  }

  start(key: string, lines: readonly DialogueLine[]): void {
    this.key = key
    this.lines = lines
    this.idx = 0
    this.show()
  }

  private show(): void {
    const l = this.lines[this.idx]
    this.timer = Math.max(2.4, l.text.length * 0.085)
    this.hud.say(l.speaker, l.text, this.timer + 0.3)
  }

  next(): void {
    if (!this.key) return
    this.idx++
    if (this.idx >= this.lines.length) {
      const k = this.key
      this.key = null
      this.onDone?.(k)
      return
    }
    this.show()
  }

  tick(dt: number): void {
    if (!this.key) return
    this.timer -= dt
    if (this.timer <= 0) this.next()
  }
}

/** 選択肢（↑↓ で選び、F／J／Enter で決定） */
class Choice {
  private el: HTMLDivElement | null = null
  private opts: Array<{ id: string; label: string }> = []
  private sel = 0
  id = ''
  onPick: ((id: string, option: string) => void) | null = null

  get open(): boolean {
    return this.el !== null
  }

  show(id: string, prompt: string, options: ReadonlyArray<{ id: string; label: string }>): void {
    this.id = id
    this.opts = [...options]
    this.sel = 0
    this.el = document.createElement('div')
    this.el.id = 'choice'
    document.body.appendChild(this.el)
    this.render(prompt)
  }

  private render(prompt: string): void {
    if (!this.el) return
    this.el.innerHTML = `<div class="ch-title">${prompt}</div>` + this.opts.map((o, i) => `<div class="ch-opt${i === this.sel ? ' on' : ''}">${i === this.sel ? '▶ ' : ''}${o.label}</div>`).join('') + `<div class="ch-title" style="margin-top:8px">↑↓：選ぶ　F：決定</div>`
  }

  input(frame: ActionFrame, raw: ReadonlySet<string>): void {
    if (!this.el) return
    const prompt = (this.el.querySelector('.ch-title') as HTMLDivElement).textContent ?? ''
    if (raw.has('ArrowUp') || raw.has('KeyW')) {
      this.sel = (this.sel + this.opts.length - 1) % this.opts.length
      this.render(prompt)
    } else if (raw.has('ArrowDown') || raw.has('KeyS')) {
      this.sel = (this.sel + 1) % this.opts.length
      this.render(prompt)
    } else if (frame.pressed.has('interact') || frame.pressed.has('claw_fire') || raw.has('Enter')) {
      const o = this.opts[this.sel]
      this.el.remove()
      this.el = null
      this.onPick?.(this.id, o.id)
    }
  }
}

export async function startPlay(p: PlayCtx): Promise<void> {
  const { renderer, scene, camera, post, hud, fs, nexmax, sora, rig, fx, sky } = p
  const urlp = new URLSearchParams(location.search)
  const phys = await createPhysics(fs.colliders)
  const input = createInput(renderer.domElement)
  const stepParam = urlp.get('step') as StoryStepId | null
  const story = new Future2086Story({ start: stepParam ?? startStepFromFlags(() => false) })
  const sp = fs.spawns[urlp.get('spawn') ?? spawnForStep(story.step)] ?? fs.spawns.start
  const player = new PlayerController(phys, sp.pos.clone())
  player.facing = sp.facing
  const camRig = new CameraRig(camera, phys, player.collider)
  camRig.yaw = sp.camYaw
  camRig.pitch = sp.camPitch
  const equipment = initialEquipment()
  const claw = new ClawSystem(phys, player, fs.claw.targets, fs.claw.movables)
  scene.add(claw.beam.group)
  const talk = new Talk(hud)
  const choice = new Choice()
  talk.onDone = (key) => story.send({ kind: 'dialogue_done', key })
  choice.onPick = (id, option) => story.send({ kind: 'choice', id, option })

  // 暗転用の幕（夜への切り替え・移動）
  const curtain = document.createElement('div')
  curtain.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:none;'
  document.body.appendChild(curtain)

  // ---------------------------------------------------------------- 状態
  let locked = false
  let oreGlow = 1
  let fireTimer = 0
  let airTime = 0
  let landTimer = 0
  let soraSpot: SoraSpotId | 'escape' = 'booth'
  let soraPathT = 0
  const soraPos = new THREE.Vector3()
  let orumAnim: { t: number; mode: 'appear' | 'swallow' } | null = null
  let riftT = -1
  let curtainAnim: { t: number; onBlack: () => void; done: () => void; fired: boolean } | null = null
  let lastZone: ZoneId | null = null
  const toastFlag = (s: string) => hud.toast(s, 2.4)

  const placeSora = (spot: SoraSpotId) => {
    soraSpot = spot
    const s = fs.npcs.sora[spot]
    soraPos.copy(s.pos)
    sora.root.position.copy(s.pos)
    sora.root.rotation.y = s.yaw
    sora.setPose(s.pose)
  }
  const teleport = (id: string) => {
    const s = fs.spawns[id] ?? fs.spawns.start
    claw.reset()
    player.teleport(s.pos.clone(), s.facing)
    player.facing = s.facing
    // syncFrom は今のカメラ位置から yaw を逆算するので、先に呼んでから到着地点の向きで上書きする
    camRig.syncFrom(camera, s.pos)
    camRig.yaw = s.camYaw
    camRig.pitch = s.camPitch
  }

  // ---------------------------------------------------------------- 物語の演出を受け取る
  const onEffect = (e: StoryEffect) => {
    switch (e.kind) {
      case 'step':
        p.label.textContent = `step: ${e.step}`
        break
      case 'dialogue':
        talk.start(e.key, e.lines)
        break
      case 'say':
        hud.say(e.speaker, e.text, 2.2)
        break
      case 'lock':
        locked = e.on
        break
      case 'transition':
        curtainAnim = {
          t: 0,
          fired: false,
          onBlack: () => {
            p.setTime('night')
            fs.setOrum({ show: 0, tomorrow: 1, swallow: 0, dissolve: 0 })
            teleport(e.spawn)
            placeSora(e.sora)
            hud.banner('― その夜 ―', 'success', 2.2)
          },
          done: () => story.send({ kind: 'fx_done', fx: 'night' }),
        }
        break
      case 'sora':
        if (e.spot === 'escape') {
          soraSpot = 'escape'
          soraPathT = 0
          sora.setPose('walk')
        } else placeSora(e.spot)
        break
      case 'orum':
        orumAnim = { t: 0, mode: e.action }
        break
      case 'debris':
        fs.debris.setActive(e.active)
        break
      case 'loop_fx':
        fx.play({
          at: nexmax.root.position.clone().add(new THREE.Vector3(0, 0.55, 0.12)),
          onOre: (x) => (oreGlow = x),
          onSwap: () => {
            p.setTime('morning')
            orumAnim = null
            teleport(e.spawn)
            placeSora(e.sora)
          },
          onDone: () => story.send({ kind: 'fx_done', fx: 'loop' }),
        })
        break
      case 'ore_glow':
        oreGlow = e.level
        break
      case 'rift':
        riftT = e.open ? 0 : -1
        if (!e.open) fs.openRift(0)
        break
      case 'choice':
        choice.show(e.id, e.prompt, e.options)
        break
      case 'drop_arm':
        fs.dropArmPart(nexmax.root.position.clone().add(new THREE.Vector3(0.25, 0.55, -0.1)))
        break
      case 'flag':
        toastFlag(`フラグ：${e.name}`)
        break
      case 'loop_count':
        toastFlag(`ループ ${e.value} 回目`)
        break
      case 'travel':
        hud.banner('2026年・なんばへ……', 'success', 4)
        p.label.textContent = `onRequestTravel('2026', 'arrive_from_2086')`
        break
    }
  }
  story.onEffect = onEffect
  story.onRequestTravel = (era, spawn) => console.info('[future2086] travel', era, spawn)

  claw.onEvent = (e) => {
    if (e.kind === 'fired') fireTimer = 0.25
    if (e.kind === 'missed') fireTimer = 0.32
    if (e.kind === 'arrived' && e.target.facing) camRig.turnTo(Math.atan2(e.target.facing.x, e.target.facing.z), 0.5)
    if ('target' in e) story.send({ kind: 'claw', event: e.kind, targetId: e.target.id })
  }

  // ---------------------------------------------------------------- 開始
  const isNight = ['night_orum', 'evade'].includes(story.step)
  p.setTime(isNight ? 'night' : 'morning')
  if (isNight) fs.setOrum({ show: 1, tomorrow: 0.5, dissolve: 0.4 })
  placeSora(story.step === 'loop_morning' || story.step === 'go_booth' ? 'booth' : isNight ? 'night' : story.step === 'ido_exhibit' ? 'exhibit' : 'booth')
  story.begin()
  if (story.step === 'evade') story.send({ kind: 'dialogue_done', key: 'orum_appear' })

  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))])
  p.loading.hide()

  // ---------------------------------------------------------------- 毎フレーム
  const nearInteract = (): 'sora' | 'ido_exhibit' | 'parts_table' | null => {
    let best: 'sora' | 'ido_exhibit' | 'parts_table' | null = null
    let bd = Infinity
    for (const it of fs.interactables) {
      const pos = it.id === 'sora' ? sora.root.position : it.pos
      const d = Math.hypot(pos.x - player.position.x, pos.z - player.position.z)
      if (d < it.reach && d < bd && Math.abs(pos.y - player.position.y) < 1.5 && story.canInteract(it.id)) {
        best = it.id
        bd = d
      }
    }
    return best
  }
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
      case 'carrying':
      case 'reeling':
        return [
          { key: 'J', label: '置く' },
          { key: 'WASD', label: '運ぶ' },
        ]
      case 'firing':
      case 'retracting':
      case 'miss':
      case 'holding':
        return []
    }
    if (talk.active) return [{ key: 'F', label: '次へ' }]
    const sel = claw.selectedTarget
    if (sel) {
      const list: Hint[] = [{ key: 'J', label: FIRE_VERB[sel.type] }]
      if (claw.candidateCount > 1) list.push({ key: 'R', label: '対象を切替' })
      return list
    }
    const n = nearInteract()
    if (n) return [{ key: 'F', label: n === 'sora' ? '話す' : '調べる' }]
    return story.hints()
  }

  const hand = new THREE.Vector3()
  const timer = new THREE.Timer()
  timer.connect(document)
  let lightTimer = 0
  let frames = 0
  window.__future = {
    story,
    player,
    claw,
    fs,
    teleport,
    send: (ev: Parameters<typeof story.send>[0]) => story.send(ev),
    debug: () => ({
      step: story.step,
      zone: lastZone,
      player: player.position.toArray().map((x) => +x.toFixed(2)),
      wire: claw.wire.phase,
      selected: claw.selectedTarget?.id ?? null,
      talking: talk.key,
      choice: choice.open,
      loop: story.loopCount,
      hits: story.debrisHits,
      calls: renderer.info.render.calls,
    }),
  }
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.1)
    uTime.value += dt
    renderer.info.reset()
    const frame = resolveActions(input)
    const blocked = locked || choice.open || fx.playing || curtainAnim !== null
    if (choice.open) choice.input(frame, input.pressed)
    else if (frame.pressed.has('interact')) {
      if (talk.active) talk.next()
      else if (!blocked) {
        const n = nearInteract()
        if (n) story.send({ kind: 'interact', target: n })
      }
    }
    talk.tick(dt)
    story.send({ kind: 'tick', dt })

    // プレイヤー
    claw.aim(camera)
    const { jumpConsumed } = blocked ? { jumpConsumed: false } : claw.handleInput(frame, clawArm(equipment) !== null, camera)
    const move = blocked ? { x: 0, y: 0 } : frame.move
    player.update(dt, { move, jump: !blocked && frame.pressed.has('jump') && !jumpConsumed, dash: !blocked && frame.held.has('dash') }, camRig.yaw)
    claw.update(dt, frame, camRig.yaw)
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
    if (!fx.playing) oreGlow += (1 - oreGlow) * Math.min(1, dt * 0.4)
    nexmax.setOreGlow(oreGlow)
    nexmax.update(dt, player.speed)

    // 範囲（地面に立っているときだけ。振り子・引き寄せの途中では判定しない）
    const z = player.grounded && !player.isExternal && claw.wire.phase === 'idle' ? fs.zoneAt(player.position) : lastZone
    if (z !== lastZone) {
      lastZone = z
      if (z) story.send({ kind: 'zone', zone: z })
    }

    // ソラ
    if (soraSpot === 'escape') {
      const path = fs.npcs.soraEscape
      soraPathT = Math.min(path.length - 1, soraPathT + dt * 0.55)
      const i = Math.min(path.length - 2, Math.floor(soraPathT))
      const k = soraPathT - i
      soraPos.lerpVectors(path[i], path[i + 1], k)
      sora.root.position.copy(soraPos)
      sora.root.position.y = Math.abs(Math.sin(uTime.value * 9)) * 0.05
      sora.root.rotation.y = Math.atan2(-(path[i + 1].x - path[i].x), -(path[i + 1].z - path[i].z))
      if (soraPathT >= path.length - 1) placeSora('gate')
    } else if (talk.active && story.step !== 'night_orum') {
      // 話している間はネクマックスの方を向く
      const want = Math.atan2(-(player.position.x - sora.root.position.x), -(player.position.z - sora.root.position.z))
      let d = want - sora.root.rotation.y
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      sora.root.rotation.y += d * Math.min(1, dt * 5)
      sora.setPose('idle')
    }
    sora.update(dt, soraSpot === 'escape' ? 3 : 0)

    // オルム・破片・裂け目
    if (orumAnim) {
      orumAnim.t += dt
      const t = orumAnim.t
      if (orumAnim.mode === 'appear') fs.setOrum({ show: Math.min(1, t / 5), tomorrow: Math.max(0.15, 1 - t / 14), dissolve: Math.min(0.62, t / 22) })
      else fs.setOrum({ show: 1, swallow: Math.min(1, t / 2.6), dissolve: Math.min(0.9, 0.62 + t / 8) })
    }
    if (fs.debris.active) {
      const r = fs.debris.update(dt, player.position)
      if (r.hit && r.hitDir) {
        player.velocity.x += r.hitDir.x * 5
        player.velocity.z += r.hitDir.z * 5
        player.velocity.y = Math.max(player.velocity.y, 3.5)
        hud.flash('danger')
        story.send({ kind: 'debris_hit' })
      }
      if (r.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * 0.07 * r.shake, (Math.random() - 0.5) * 0.07 * r.shake, 0))
    } else fs.debris.update(dt, null)
    if (riftT >= 0) {
      riftT += dt
      fs.openRift(Math.min(1, riftT / 3.2))
    }
    if (curtainAnim) {
      curtainAnim.t += dt
      const t = curtainAnim.t
      curtain.style.opacity = String(t < 0.8 ? t / 0.8 : t < 1.6 ? 1 : Math.max(0, 1 - (t - 1.6) / 0.9))
      if (t >= 0.8 && !curtainAnim.fired) {
        curtainAnim.fired = true
        curtainAnim.onBlack()
      }
      if (t >= 2.5) {
        const done = curtainAnim.done
        curtainAnim = null
        curtain.style.opacity = '0'
        done()
      }
    }
    fx.update(dt)
    fs.update(dt, uTime.value)

    // クロー（右手首から）と HUD
    nexmax.root.updateMatrixWorld(true)
    nexmax.handAnchor.getWorldPosition(hand)
    claw.updateVisuals(dt, hand)
    const u = claw.uiState(camera, window.innerWidth, window.innerHeight)
    const s = u.selected ?? u.far
    if (s && !blocked) {
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
      left: { name: null, selected: false },
    })
    const obj = story.objective()
    hud.setObjective(obj.title, obj.sub)
    hud.setHints(fx.playing ? [] : computeHints())
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
    if (++frames === 3) window.__futureReady = true
  })
}
