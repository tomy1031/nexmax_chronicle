// 導入編（intro2086Story）の演出をシーンで実行するところ。アダプタ（game/future2086Adapter.ts）が begin で作り、
// 物語の演出（IntroEffect）のうち新しいもの・ソラの動き・小物・画面の重ね物をここで受け持つ。
// ・回想（1-0）・街頭ビジョン・風船・レンズをリングへ・アンテナと大画面・紙吹雪・試みの一覧・避難（広場が空に）
//   ・町の外（白くかすんで広場へ）・立ち向かう（ワイヤーが本体をすり抜ける）・逃げた先から消える街・石標の QR → リングに記録
// ・ソラ：決まった立ち位置／プレイヤーの横を歩いてついてくる（follow）／その場で止まる（stop）／南のゲートへ逃げる（escape）
import * as THREE from 'three'
import type { StageRuntime, CineShot } from '../../game/stage'
import type { ActionFrame } from '../../player/inputActions'
import type { Character } from '../../world/characters'
import { MobTalk, type MobSpeakerDef } from '../../world/mobTalk'
import type { MobTable } from '../../world/mobTalkLogic'
import { INTRO_CROWD } from './crowd'
import type { FutureScene, SoraSpotId } from './scene'
import { F } from './layout'
import type { IntroEffect, IntroStep, Intro2086Story, RecordId } from './intro2086Story'
import { introSpawn, introStartStep } from './intro2086Story'
import type { IntroProps, StoneId } from './introProps2086'
import { INTRO_LAYOUT } from './introProps2086'
import { ArmCatch, LensMount, RingRecord, ScanBeam } from './recordFx2086'
import { AttemptsPanel, Flashback, Whiteout } from './introOverlay2086'
import { FOCUS_SHOTS } from './focusShots2086'
import mobLines from './intro_mobs_2086.json'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export type SoraMode = 'spot' | 'follow' | 'stop' | 'escape'

const STONE_OF: Record<RecordId, StoneId> = { expo1970: 'stone_1970', edo1726: 'stone_1726', namba2026: 'stone_2026' }

export class IntroDirector {
  readonly props: IntroProps
  private readonly fs: FutureScene
  private readonly sora: Character
  private readonly story: Intro2086Story
  private readonly ring: RingRecord
  private readonly scan: ScanBeam
  private readonly lens: LensMount
  private readonly arm: ArmCatch
  private readonly whiteout = new Whiteout()
  private readonly panel: AttemptsPanel
  private readonly mobs: MobTalk
  private flashback: Flashback | null = null
  /** ソラの動き */
  soraMode: SoraMode = 'spot'
  soraSpeed = 0
  private escapePath: THREE.Vector3[] = []
  private escapeT = 0
  /** 共鳴レンズをはめたか（この周） */
  private lensIn = false
  /** 避難で広場が空（町の人の吹き出しを止める） */
  evacuated = false
  /** 立ち向かう夜：J を撃てる */
  confrontOn = false
  private wire: { mesh: THREE.Mesh; t: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null
  private unravel = -1
  private qr: { t: number; record: RecordId; stone: StoneId; phase: 0 | 1 | 2 | 3; sent: boolean } | null = null
  private alarmReset = false
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly hand = new THREE.Vector3()

  constructor(fs: FutureScene, props: IntroProps, sora: Character, story: Intro2086Story, ui: HTMLElement | null, camera: THREE.Camera) {
    this.fs = fs
    this.props = props
    this.sora = sora
    this.story = story
    this.ring = new RingRecord(fs.root)
    this.scan = new ScanBeam(fs.root)
    this.lens = new LensMount(fs.root)
    this.arm = new ArmCatch(fs.root)
    this.panel = new AttemptsPanel(ui)
    // 足した人の吹き出し（リングの中の客・列の先頭・運営本部）
    const at = (tag: string) => INTRO_CROWD.find((c) => c.tag === tag)!
    const anchorOf = (tag: string, hidden: () => boolean): MobSpeakerDef['anchor'] => {
      const c = at(tag)
      return (out) => {
        if (hidden() || fs.timeOfDay === 'night' || this.evacuated) return false
        out.set(c.x, c.y + 1.85, c.z)
        return true
      }
    }
    this.mobs = new MobTalk({
      host: ui,
      camera,
      table: mobLines as unknown as MobTable,
      theme: '2086',
      speakers: [
        { id: 'ring_visitor', anchor: anchorOf('ring_visitor', () => this.visitorHidden), footY: () => 0.72, range: () => [4.2, 2.2], talkReach: 0 },
        { id: 'queue_head', anchor: anchorOf('queue', () => false), footY: () => 0, range: () => [2.8, 1.6], talkReach: 0 },
        { id: 'hq_staff', anchor: anchorOf('hq_staff', () => false), footY: () => 0, range: () => [3.0, 1.6], talkReach: 0 },
      ],
    })
  }

  private visitorHidden = false

  // ---------------------------------------------------------------- ソラ

  placeSora(spot: SoraSpotId): void {
    this.soraMode = 'spot'
    const s = this.fs.npcs.sora[spot]
    this.sora.root.position.copy(s.pos)
    this.sora.root.rotation.y = s.yaw
    this.sora.setPose(s.pose)
  }

  private setSoraMode(spot: string): void {
    switch (spot) {
      case 'follow':
        this.soraMode = 'follow'
        break
      case 'stop':
        this.soraMode = 'stop'
        this.sora.setPose('idle')
        break
      case 'escape': {
        this.soraMode = 'escape'
        this.escapeT = 0
        const path = this.fs.npcs.soraEscape
        this.escapePath = [this.sora.root.position.clone(), ...path.slice(1).map((p) => p.clone())]
        this.sora.setPose('walk')
        break
      }
      default:
        this.placeSora(spot as SoraSpotId)
    }
  }

  private turnSora(x: number, z: number, dt: number, rate = 6): void {
    const want = Math.atan2(-(x - this.sora.root.position.x), -(z - this.sora.root.position.z))
    let d = want - this.sora.root.rotation.y
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    this.sora.root.rotation.y += d * Math.min(1, dt * rate)
  }

  updateSora(dt: number, rt: StageRuntime, talking: boolean): void {
    const s = this.sora.root.position
    const p = rt.player.position
    this.soraSpeed = 0
    switch (this.soraMode) {
      case 'follow': {
        // プレイヤーの右うしろ、少し離れて歩く
        const f = rt.player.facing
        const fx = -Math.sin(f)
        const fz = -Math.cos(f)
        this.tmp.set(p.x + fz * -1.15 - fx * 0.5, 0, p.z - fx * -1.15 - fz * 0.5)
        const dx = this.tmp.x - s.x
        const dz = this.tmp.z - s.z
        const d = Math.hypot(dx, dz)
        if (d > 0.35) {
          const sp = Math.min(3.6, d * 2.2)
          const k = Math.min(1, (sp * dt) / d)
          s.x += dx * k
          s.z += dz * k
          this.soraSpeed = sp
          this.turnSora(this.tmp.x, this.tmp.z, dt, 8)
          this.sora.setPose(sp > 0.5 ? 'walk' : 'idle')
        } else {
          this.sora.setPose('idle')
          this.turnSora(p.x, p.z, dt, 3)
        }
        s.y = this.groundY(s)
        break
      }
      case 'escape': {
        const path = this.escapePath
        if (path.length < 2) break
        this.escapeT += dt * 2.4
        let left = this.escapeT
        let i = 0
        while (i < path.length - 1) {
          const seg = path[i].distanceTo(path[i + 1])
          if (left <= seg) break
          left -= seg
          i++
        }
        if (i >= path.length - 1) {
          this.placeSora('gate')
          break
        }
        const seg = Math.max(0.001, path[i].distanceTo(path[i + 1]))
        s.lerpVectors(path[i], path[i + 1], left / seg)
        this.turnSora(path[i + 1].x, path[i + 1].z, dt, 10)
        this.soraSpeed = 3
        break
      }
      case 'stop':
        this.turnSora(F.ORUM.x, F.ORUM.z, dt, 2)
        break
      case 'spot':
        if (talking) this.turnSora(p.x, p.z, dt, 5)
        break
    }
  }

  private groundY(p: THREE.Vector3): number {
    const B = F.BOOTH
    return Math.hypot(p.x - B.x, p.z - B.z) < B.r ? B.h : 0
  }

  // ---------------------------------------------------------------- 演出

  /** 新しい演出を受け持ったら true（アダプタは残りを従来どおり実行する） */
  handle(e: IntroEffect, rt: StageRuntime, startFocusAt: (target: 'exhibit' | 'screen', shot: CineShot) => void): boolean {
    switch (e.kind) {
      case 'sora':
        this.setSoraMode(e.spot)
        return true
      case 'flashback': {
        const l = this.story.lines('flashback')[0]
        this.flashback?.dispose()
        this.flashback = new Flashback(l?.speaker ?? 'ソラ（8歳）', l?.text ?? '')
        this.flashback.onDone = () => {
          this.flashback = null
          rt.hud.showEraCard('2086年', 'ナンバタウン', '時代博覧祭', 3.4, '#bfa8ff')
          this.story.send({ kind: 'fx_done', fx: 'flashback' })
        }
        return true
      }
      case 'install_lens': {
        const mv = this.lensMovable()
        // 持っている・置いたケースは元の場所へ戻して（当たり判定ごと）隠す
        rt.claw.sendHomeById(this.fs.claw.ids.lens)
        if (mv) {
          mv.def.enabled = false
          mv.object.visible = false
        }
        this.lensIn = true
        this.lens.set(true, true)
        this.ring.setWobble(0)
        rt.oreGlow(0.3)
        return true
      }
      case 'antenna_fixed':
        this.props.antenna.setFixed(true)
        this.props.screen.setOn(true)
        this.later(1.2, () => this.props.confetti.play())
        return true
      case 'announce':
        this.props.street.pulse()
        return true
      case 'balloon':
        this.props.balloon.play()
        return true
      case 'attempts_ui':
        this.panel.set(e.items)
        return true
      case 'evacuate':
        this.evacuated = e.on
        this.fs.crowd.setNight(e.on || this.fs.timeOfDay === 'night')
        return true
      case 'whiteout':
        this.whiteout.play(
          () => {
            // 広場の真ん中へ戻される（南のゲートを向いて）
            const at = v(0.9, 0, 7.6)
            rt.claw.reset()
            rt.player.teleport(at, Math.PI)
            rt.camRig.yaw = Math.PI
            rt.camRig.pitch = 0.22
            this.sora.root.position.set(2.3, 0, 7.3)
            this.sora.root.rotation.y = Math.PI
            this.soraMode = 'spot'
            this.sora.setPose('idle')
          },
          () => this.story.send({ kind: 'fx_done', fx: 'whiteout' }),
        )
        return true
      case 'confront':
        this.confrontOn = e.on
        return true
      case 'confront_shot':
        this.shootThrough(rt)
        return true
      case 'city_unravel':
        this.unravel = 0
        return true
      case 'qr_scan': {
        const stone = STONE_OF[e.record]
        this.qr = { t: 0, record: e.record, stone, phase: 0, sent: false }
        const shot = FOCUS_SHOTS.exhibit({ player: rt.player.position.clone(), lens: v(0, 0, 0), short: false, stone: INTRO_LAYOUT.stones[stone].clone() })
        startFocusAt('exhibit', shot)
        return true
      }
      case 'exhibit':
        this.visitorHidden = e.mode === 'idle'
        this.fs.crowd.setHidden('ring_visitor', this.visitorHidden)
        if (e.mode === 'visitor') this.ring.showVisitor()
        else this.ring.hide()
        this.ring.setWobble(this.lensIn ? 0 : this.story.loopCount > 0 ? 0.35 : 1)
        return true
      case 'arm_catch': {
        const p = rt.player.position
        const f = rt.player.facing
        this.tmp.set(p.x + Math.cos(f) * 0.28, p.y + 0.66, p.z - Math.sin(f) * 0.28)
        this.arm.play(this.tmp)
        // 受け止める手もとを、正面の斜めから短く見せる
        const fx = -Math.sin(f)
        const fz = -Math.cos(f)
        void rt.cinematic({
          from: v(p.x + fx * 1.7 + Math.cos(f) * 0.9, p.y + 0.95, p.z + fz * 1.7 - Math.sin(f) * 0.9),
          look: v(p.x + Math.cos(f) * 0.15, p.y + 0.6, p.z - Math.sin(f) * 0.15),
          inSec: 0.45,
          hold: 1.6,
          outSec: 0.7,
          fov: 46,
          letterbox: true,
        })
        return true
      }
      case 'save':
        rt.save(introSpawn(introStartStep((n) => rt.story.get(n))))
        return true
    }
    return false
  }

  private readonly timers: Array<{ t: number; run: () => void }> = []
  private later(t: number, run: () => void): void {
    this.timers.push({ t, run })
  }

  private lensMovable() {
    return this.fs.claw.movables.find((m) => m.def.id === this.fs.claw.ids.lens) ?? null
  }

  /** ソラに渡せる共鳴レンズのケースを持っているか（持っている・ソラの足元に置いた） */
  hasLens(rt: StageRuntime): boolean {
    if (this.lensIn) return false
    const w = rt.claw.wire
    if ((w.phase === 'carrying' || w.phase === 'reeling') && w.target?.id === this.fs.claw.ids.lens) return true
    const mv = this.lensMovable()
    if (!mv || !mv.object.visible) return false
    return mv.object.position.distanceTo(this.sora.root.position) < 2.4 && mv.object.position.distanceTo(mv.home) > 0.5
  }

  /** ループの朝へ戻した（setTime('morning') の後） */
  resetMorning(rt: StageRuntime | null): void {
    this.props.resetMorning(false)
    this.lensIn = false
    this.lens.set(false)
    if (rt) rt.claw.sendHomeById(this.fs.claw.ids.lens)
    const mv = this.lensMovable()
    if (mv) {
      mv.object.visible = true
      mv.def.enabled = true
    }
    this.evacuated = false
    this.confrontOn = false
    this.unravel = -1
    this.wire && (this.wire.mesh.visible = false)
    this.fs.crowd.setHidden('hq_staff', false)
    this.fs.crowd.setHidden('queue', false)
  }

  // ---------------------------------------------------------------- 毎フレーム

  /** プレイ中の毎フレーム（ステージの update から） */
  update(dt: number, frame: ActionFrame, rt: StageRuntime): void {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]
      t.t -= dt
      if (t.t <= 0) {
        this.timers.splice(i, 1)
        t.run()
      }
    }
    if (this.flashback) {
      if (frame.pressed.has('interact') || frame.pressed.has('jump') || frame.pressed.has('claw_fire')) this.flashback.skip()
      this.flashback.update(dt)
    }
    this.whiteout.update(dt)
    // 非常警報の柱：試みの間だけ狙える。引いたら柱を作動させてワイヤーを戻す
    const alarm = this.props.alarm
    if (this.alarmReset) {
      this.alarmReset = false
      rt.claw.reset()
      alarm.setOn(true)
    }
    alarm.def.enabled = this.story.alarmEnabled()
    // 石標の足元の光（読めるとき・近いとき）
    for (const id of Object.keys(this.props.stones) as StoneId[]) {
      const st = this.props.stones[id]
      const near = this.story.step === 'records' ? Math.max(0, 1 - st.stand.distanceTo(rt.player.position) / 3) : 0
      st.setNear(near)
    }
    // 逃げた先の街から消えていく（避難した夜）
    if (this.unravel >= 0) {
      this.unravel += dt
      const k = Math.min(1, this.unravel / 4.5)
      this.fs.setOrum({ dissolve: 0.23 + k * 0.7, tomorrow: Math.max(0, 0.64 - k * 0.64) })
    }
    this.updateQr(dt, rt)
    this.mobs.update(dt, rt.player.position, this.lensIn ? 'stable' : this.story.loopCount > 0 ? 'loop' : 'unstable', rt.talking || rt.inCinematic || this.story.busy)
    this.panel.setHidden(rt.inCinematic || this.flashback !== null)
  }

  /** NMClaw の出来事（アダプタの onClawEvent から、物語へ送った後） */
  onClaw(kind: string, targetId: string | null): void {
    if (targetId === this.props.alarm.def.id && kind === 'connected') this.alarmReset = true
  }

  private updateQr(dt: number, rt: StageRuntime): void {
    const q = this.qr
    if (!q) return
    q.t += dt
    const st = this.props.stones[q.stone]
    // 目の位置（頭の少し前）
    const p = rt.player.position
    const f = rt.player.facing
    this.tmp.set(p.x - Math.sin(f) * 0.12, p.y + 0.86, p.z - Math.cos(f) * 0.12)
    rt.player.turnToward(st.plate.x - p.x, st.plate.z - p.z, dt, 8)
    if (q.t > 0.7 && q.t < 2.2) {
      this.scan.set(this.tmp, st.plate, Math.min(1, (q.t - 0.7) / 0.2))
      st.setScan(1)
    } else {
      this.scan.set(this.tmp, st.plate, 0)
      st.setScan(q.t < 2.2 ? 0 : Math.max(0, 1 - (q.t - 2.2) * 2))
    }
    if (q.phase === 0 && q.t >= 2.2) {
      q.phase = 1
      this.ring.show(q.record, q.record === 'namba2026' ? 3.0 : 2.4)
      this.fs.booth.setPower(0.12)
      this.ring.setWobble(q.record === 'namba2026' ? 0.15 : 0)
    }
    if (q.phase === 1 && q.t >= (q.record === 'namba2026' ? 5.4 : 4.8)) {
      q.phase = 2
      q.sent = true
      this.story.send({ kind: 'fx_done', fx: 'qr' })
    }
    if (q.phase === 2) {
      if (q.record === 'namba2026') {
        // 鉱石が共鳴して、リングの映像がゆがみ、本物の穴へ
        const r = this.fs.booth.rift
        this.ring.setRift(r)
        this.ring.setWobble(0.15 + r * 0.8)
        if (r > 0.2) rt.shake(0.15 * r)
      } else if (!rt.talking && q.t > 5.4) {
        q.phase = 3
        rt.endCinematic()
        this.later(1.6, () => this.fs.booth.setPower(1))
        this.qr = null
      }
    }
  }

  /** クローが空の存在をすり抜ける：手から空へ光のワイヤーが伸び、本体を抜けて消える */
  private shootThrough(rt: StageRuntime): void {
    const from = rt.nexmax.handAnchor.getWorldPosition(new THREE.Vector3())
    const to = v(F.ORUM.x, F.ORUM.y, F.ORUM.z)
    if (!this.wire) {
      const g = new THREE.CylinderGeometry(0.16, 0.16, 1, 6, 1, true)
      g.translate(0, 0.5, 0)
      g.rotateX(Math.PI / 2)
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 2.6, 3.4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }))
      m.frustumCulled = false
      m.renderOrder = 3
      this.fs.root.add(m)
      this.wire = { mesh: m, t: 0, from, to }
    }
    this.wire.t = 0
    this.wire.from.copy(from)
    this.wire.to.copy(to)
    this.wire.mesh.visible = true
    // カメラ：うしろから空の存在を見上げる（揺れ）
    const p = rt.player.position
    const dir = this.tmp2.set(to.x - p.x, 0, to.z - p.z).normalize()
    void rt.cinematic({
      from: v(p.x - dir.x * 3.0 + dir.z * 0.8, 1.2, p.z - dir.z * 3.0 - dir.x * 0.8),
      look: v(to.x, to.y * 0.85, to.z),
      inSec: 0.7,
      hold: 2.4,
      outSec: 1.2,
      fov: 58,
      shake: 0.25,
    })
    rt.shake(0.5)
  }

  /** 見た目（ステージの animate から。一時停止中は dt = 0） */
  animate(dt: number, rt: StageRuntime): void {
    this.props.update(dt)
    this.ring.update(dt)
    this.lens.update(dt)
    rt.nexmax.handAnchor.getWorldPosition(this.hand)
    this.arm.update(dt, this.hand)
    this.mobs.render(dt)
    const w = this.wire
    if (w && w.mesh.visible) {
      w.t += dt
      // 伸びる（0.35 秒）→ 本体を抜けて先へ → 細くなって消える
      const len = w.from.distanceTo(w.to)
      const out = Math.min(1, w.t / 0.35) * 1.25
      w.mesh.position.copy(w.from)
      w.mesh.lookAt(w.to)
      w.mesh.scale.set(1 + Math.sin(w.t * 50) * 0.3, 1, Math.max(0.01, len * out))
      const m = w.mesh.material as THREE.MeshBasicMaterial
      m.opacity = w.t < 1.2 ? 0.95 : Math.max(0, 0.95 - (w.t - 1.2) / 1.4)
      if (w.t > 2.8) w.mesh.visible = false
    }
  }

  /** 目標の位置（HUD の方位磁針） */
  objectiveTarget(step: IntroStep, lens: THREE.Vector3, hook: THREE.Vector3, swing: THREE.Vector3): THREE.Vector3 | null {
    switch (step) {
      case 'go_booth':
      case 'talk_sora':
      case 'deliver_lens':
      case 'return_booth':
      case 'loop_cues':
      case 'returned':
        return this.sora.root.position
      case 'attempts':
        return this.story.cancelAsked || this.story.despaired ? this.sora.root.position : null
      case 'fetch_lens':
        return lens
      case 'climb_hook':
        return hook
      case 'swing_gap':
        return swing
      case 'fix_antenna':
        return INTRO_LAYOUT.antenna
      case 'evade':
      case 'escape_walk':
        return this.fs.markers.south_gate
      case 'records':
        return INTRO_LAYOUT.stones.stone_2026
    }
    return null
  }

  get flashbackPlaying(): boolean {
    return this.flashback !== null
  }

  dispose(): void {
    this.flashback?.dispose()
    this.flashback = null
    this.whiteout.dispose()
    this.panel.dispose()
    this.mobs.dispose()
    this.ring.dispose()
  }
}
