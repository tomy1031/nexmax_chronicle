// 1726年 大坂・仕掛け横丁（からくり水門）のステージ。中身は world/edo/* の組み立てをそのまま使う
// （縦切り試作 world/edo/slice.ts をステージの形に移したもの。見た目・操作・水門パズルは同じ）。
// 追加：物語 v2.3 のフラグ（源兵衛との出会い・水門修理・絵図の継承）と、修理後に開く帰還の光の輪（→ 2026年）。
import * as THREE from 'three'
import { createMaterialLibrary } from '../../render/materials'
import { EDO_SKY } from '../../render/sky'
import { buildEdoScene, type EdoScene } from '../../world/edo/scene'
import { SHOTS, GATE_GENBEI, GATE_OHARU, SPAWNS, faceYaw, type Placement, type Shot } from '../../world/edo/shots'
import { GateFlow } from '../../world/edo/clawTargets'
import { GatePhase, GateResult } from '../../core/gatePuzzleLogic'
import { PART_NAMES } from '../../player/equipment'
import type { WireEvent } from '../../player/clawLogic'
import type { ActionFrame } from '../../player/inputActions'
import type { Character } from '../../world/characters'
import type { Hint } from '../../ui/hud'
import { ERA_EDO, eraTintHex } from '../../core/eras'
import { edoObjective } from '../../core/storyDirector'
import { DialogueDB } from '../../core/dialogue'
import { skyEnvironment, type EnvTexture } from '../../game/env'
import type { SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageShots, StageWorld } from '../../game/stage'
import data1726 from '../../data/dialogue_1726.json'

const lines1726 = new DialogueDB(data1726)

// 夕方前の暖かい日差し（西北西・やや低め）
const SUN_YAW = (-148 * Math.PI) / 180
const SUN_EL = (34 * Math.PI) / 180
const SUN_DIR = new THREE.Vector3(Math.cos(SUN_EL) * Math.cos(SUN_YAW), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(SUN_YAW)).normalize()

/** 帰還の光の輪（水門の修理後に通りへ開く）。2026年の出発地点の記録に鉱石が反応する */
const RETURN_RING = new THREE.Vector3(-8.6, 0, 11.3)
const RETURN_REACH = 2.4

export class EdoStage implements Stage {
  readonly key = '1726' as const
  readonly era = ERA_EDO
  readonly label = '1726年　大坂・仕掛け横丁'
  readonly subtitle = '享保11年 ― からくり職人の町'
  readonly environment: StageEnvironment = {
    sky: EDO_SKY,
    sunDir: SUN_DIR,
    hdri: './hdri/kloppenheim_06_puresky_1k.hdr',
    envIntensity: 0.75,
    fog: { color: EDO_SKY.haze, density: 0.0028 },
  }
  private edo!: EdoScene
  private genbei!: Character
  private oharu!: Character
  private gateFlow!: GateFlow
  private waterEnv: EnvTexture | null = null
  private from: string | null = null
  private ringOpen = false
  private drawingTimer = -1

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    this.from = ctx.from
    // キャラクターは早めに読み込み開始（テクスチャ生成と並行）
    const charsPromise = Promise.all([ctx.loadNpc('genbei', 1.6), ctx.loadNpc('oharu', 1.32)])
    ctx.progress(0.12, 'テクスチャを生成中…')
    await ctx.yieldFrame()
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    const mats = await createMaterialLibrary(aniso)
    ctx.progress(0.4, '仕掛け横丁を組み立て中…')
    await ctx.yieldFrame()
    this.edo = buildEdoScene(mats, ctx.quality)
    // 水面だけは彩度の高い空を映す（HDRI の白い地平が映ると水が白っぽくなるため）
    this.waterEnv = skyEnvironment(ctx.renderer, { ...EDO_SKY, horizon: '#74b8e6', upper: '#3d8ce0', ground: '#2c7a84', cloudLit: '#e8f2fa' }, SUN_DIR)
    ;(this.edo.water.material as THREE.MeshStandardMaterial).envMap = this.waterEnv.texture
    ctx.progress(0.68, 'キャラクターを読み込み中…')
    await ctx.yieldFrame()
    const [genbei, oharu] = await charsPromise
    this.genbei = genbei
    this.oharu = oharu
    this.edo.root.add(genbei.root, oharu.root)
    return { root: this.edo.root, colliders: this.edo.colliders, claw: { targets: this.edo.claw.targets, movables: this.edo.claw.movables }, lights: this.edo.lights }
  }

  spawn(id: string | null): SpawnPoint {
    const key = id === 'arrive' || id === 'edo_arrive' ? 'street' : (id ?? 'street')
    return SPAWNS[key] ?? SPAWNS.street
  }

  begin(rt: StageRuntime): void {
    const hud = rt.hud
    this.gateFlow = new GateFlow(this.edo.gate, this.edo.claw.boats, this.edo.claw.gearTarget, (speaker, text) => hud.say(speaker, text))
    // セーブ・?flags= で水門を直したあとから始めるとき
    if (rt.story.get('gate_repaired')) {
      this.gateFlow.logic.phase = GatePhase.DONE
      this.gateFlow.logic.progress = 1
      this.gateFlow.resultTime = 999
      this.edo.claw.gearTarget.enabled = false
      this.openReturnRing(rt, false)
    }
    rt.save(this.from ? 'edo_arrive' : 'street')
  }

  revealed(rt: StageRuntime): void {
    if (this.from === '2026') void rt.dialogue(lines1726.lines('arrive_from_2026'))
  }

  // ---------------------------------------------------------------- 会話（F）

  private nearNpc(rt: StageRuntime): { ch: Character; place: Placement; reach: number } | null {
    const npcs = [
      { ch: this.genbei, place: GATE_GENBEI, reach: 2.6 },
      { ch: this.oharu, place: GATE_OHARU, reach: 3.4 },
    ]
    let best: (typeof npcs)[number] | null = null
    let bd = Infinity
    const p = rt.player.position
    for (const n of npcs) {
      const d = Math.hypot(n.place.pos.x - p.x, n.place.pos.z - p.z)
      if (d < n.reach && d < bd) {
        best = n
        bd = d
      }
    }
    return best
  }

  private nearRing(rt: StageRuntime): boolean {
    const p = rt.player.position
    return this.ringOpen && Math.hypot(p.x - RETURN_RING.x, p.z - RETURN_RING.z) < RETURN_REACH
  }

  private talk(who: Character, rt: StageRuntime): void {
    const hud = rt.hud
    const ph = this.gateFlow.logic.phase
    if (who === this.genbei) {
      // 物語 v2.3：源兵衛はネクマックスを知っている（「お前、また来たんか！」）
      if (!rt.story.get('met_genbei')) {
        rt.story.set('met_genbei', true)
        void rt.dialogue(lines1726.lines('genbei_first_meet')).then(() => this.talk(who, rt))
        return
      }
      if (ph === GatePhase.DONE) hud.say('源兵衛', '助かったわ。仕掛けは使う人と一緒に作るもんやな。')
      else if (ph === GatePhase.WAIT_SIGNAL) hud.say('源兵衛', '歯止めは入っとる。おはるの合図で離すんやで。')
      else if (this.gateFlow.logic.holding) hud.say('源兵衛', '今やっとる！ 離さんといてや！')
      else hud.say('源兵衛', 'おまえさん、その腕で大歯車をつかめるか？ 桟橋から狙うとええ。')
    } else {
      if (ph === GatePhase.DONE) hud.say('おはる', '絵図の写し、ちゃんと残しとくからね。')
      else if (ph === GatePhase.WAIT_SIGNAL) hud.say('おはる', this.gateFlow.logic.isDanger() ? '待って！ そこに人がいる！' : '今は離して！ もう大丈夫や！')
      else hud.say('おはる', 'うちは見張り台から水路を見とくね！ 舟が来たら教えるから！')
    }
  }

  interact(rt: StageRuntime): boolean {
    if (this.nearRing(rt)) {
      void rt.dialogue(lines1726.lines('return_ring'))
      rt.oreGlow(2)
      const v = rt.travel({ to: '2026', cause: 'return', spawn: 'present_ido' })
      if (!v.ok) rt.hud.toast(v.reason)
      return true
    }
    const n = this.nearNpc(rt)
    if (n) {
      this.talk(n.ch, rt)
      return true
    }
    return false
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.nearRing(rt)) return [{ key: 'F', label: '光の輪で2026年へ帰る' }]
    if (this.nearNpc(rt)) return [{ key: 'F', label: '話す' }]
    return null
  }

  objective(rt: StageRuntime): { title: string; sub: string } {
    if (this.ringOpen) return edoObjective((n) => rt.story.get(n))
    return this.gateFlow.objective()
  }

  objectiveTarget(): THREE.Vector3 | null {
    if (this.ringOpen) return RETURN_RING
    return this.gateFlow.done ? null : this.edo.gate.gearCenter
  }

  // ---------------------------------------------------------------- クロー・水門パズル

  onClawEvent(e: WireEvent, rt: StageRuntime): void {
    switch (e.kind) {
      case 'connected':
        if (e.target.type === 'hold_mechanism') this.gateFlow.onGrab()
        break
      case 'released':
        if (e.target.type === 'hold_mechanism') {
          const hud = rt.hud
          const r = this.gateFlow.onRelease()
          if (r === GateResult.TOO_EARLY) {
            hud.banner('まだ早い！', 'fail', 1.6)
            rt.story.timeline.addMetric('release_too_early')
          } else if (r === GateResult.PERSON_IN_DANGER) {
            hud.flash('danger')
            hud.banner('危ない！ 舟が下にいる', 'fail', 2.0)
            rt.story.timeline.addMetric('release_person_danger')
          } else if (r === GateResult.SUCCESS) {
            hud.flash('success')
            hud.banner('水門 修理完了！', 'success', 3.2)
            rt.oreGlow(1)
            rt.story.set('gate_repaired', true)
            // 成功の台詞のあと、源兵衛が絵図を託す
            this.drawingTimer = 4.2
          }
        }
        break
    }
  }

  private openReturnRing(rt: StageRuntime, announce: boolean): void {
    this.ringOpen = true
    rt.rift.openAt(RETURN_RING, eraTintHex(2026), 1.55, 0.8)
    if (announce) rt.save('edo_return')
  }

  update(dt: number, _frame: ActionFrame, rt: StageRuntime): void {
    this.gateFlow.tick(dt)
    if (this.drawingTimer > 0) {
      this.drawingTimer -= dt
      if (this.drawingTimer <= 0) {
        rt.story.set('genbei_drawing_found', true)
        void rt.dialogue(lines1726.lines('gate_drawing')).then(() => {
          rt.oreGlow(1.6)
          this.openReturnRing(rt, true)
        })
      }
    }
    // 仲間のポーズ（源兵衛は調整中に小車を回す・おはるは危ないと「止まれ」、安全なら手を振る）
    const gs = this.gateFlow.hudState()
    this.genbei.setPose(gs.phase === GatePhase.DONE ? 'wave' : 'crank')
    this.oharu.setPose(gs.signal === 'wait' ? 'hold' : gs.phase === GatePhase.ADJUSTING && this.gateFlow.logic.holding ? 'idle' : 'wave')
    if (gs.signal === 'wait') this.oharu.setAim(null)
    rt.hud.setGate(gs.visible ? { progress: gs.progress, signal: gs.signal, signalText: gs.signalText, adjusting: gs.phase === GatePhase.ADJUSTING && this.gateFlow.logic.holding } : null)
  }

  animate(dt: number, t: number): void {
    this.genbei.update(dt, 0)
    this.oharu.update(dt, 0)
    this.edo.update(dt, t)
  }

  onRespawn(): void {
    // 水に落ちたときは特に何もしない（クローの解除はシェル）
  }

  // ---------------------------------------------------------------- 撮影用ショット（?shot=05 / 04 / overview、P キー）

  readonly shots: StageShots = {
    ids: SHOTS.map((s) => s.id),
    apply: (index, rt) => this.applyShot(index >= 0 ? SHOTS[index] : null, rt),
    update: (index, dt, hand, rt) => {
      if (index >= 0 && rt.claw.beam.active) rt.claw.beam.update(dt, hand, this.tmp.copy(this.edo.gate.gearGrabPoint), { open: 0, thickness: 1 })
    },
    focus: (index) => SHOTS[index].focus,
    nexmaxSpeed: (index) => (SHOTS[index].nexmax.pose === 'walk' ? 3.2 : 0),
  }
  private readonly tmp = new THREE.Vector3()

  private place(ch: Character, p: Placement): void {
    ch.root.position.copy(p.pos)
    ch.root.rotation.y = faceYaw(p.pos, p.face)
    ch.setPose(p.pose)
  }

  private applyShot(shot: Shot | null, rt: StageRuntime): void {
    const { camera, claw, hud, nexmax } = rt
    if (shot) {
      claw.reset()
      this.gateFlow.forceRelease()
      camera.position.copy(shot.cam)
      camera.lookAt(shot.target)
      camera.fov = shot.fov
      camera.updateProjectionMatrix()
      this.place(nexmax, shot.nexmax)
      // 大歯車を支えるショットでは、体ごと歯車の掴み位置へまっすぐ向ける（爪が正面から出る）
      if (shot.claw) nexmax.root.rotation.y = faceYaw(shot.nexmax.pos, this.edo.gate.gearGrabPoint)
      this.place(this.genbei, shot.genbei)
      this.place(this.oharu, shot.oharu)
      nexmax.setAim(shot.claw ? this.edo.gate.gearGrabPoint : null)
      claw.beam.setActive(shot.claw)
      this.edo.gate.setGearSpeed(shot.claw ? 0 : 0.25)
      hud.setShot(shot.label)
      hud.setPlayUiVisible(false)
      hud.setArms({ right: { name: PART_NAMES.grapple_claw, holding: shot.claw ? '支えている：大歯車' : null, selected: true, active: shot.claw }, left: { name: null, selected: false } })
      if (shot.claw) hud.setObjective('歯車を動かないように支えよう', '源兵衛が水門を調整中')
      hud.setGate(null)
    } else {
      camera.fov = 55
      camera.updateProjectionMatrix()
      this.place(this.genbei, GATE_GENBEI)
      this.place(this.oharu, GATE_OHARU)
      nexmax.setPose('idle')
      nexmax.setAim(null)
      claw.beam.setActive(false)
      hud.setShot(null)
      hud.setPlayUiVisible(true)
    }
  }

  debug(): Record<string, unknown> {
    const g = this.gateFlow
    return {
      gatePhase: g.logic.phase,
      gateProgress: +g.logic.progress.toFixed(2),
      danger: g.logic.isDanger(),
      lastResult: g.lastResult,
      boats: g.logic.boats.map((x) => +x.toFixed(1)),
      returnRing: this.ringOpen,
    }
  }

  dispose(): void {
    this.waterEnv?.dispose()
    this.waterEnv = null
  }
}
