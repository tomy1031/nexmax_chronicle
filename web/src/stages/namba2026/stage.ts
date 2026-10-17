// 2026年 大阪・なんばのステージ（物語・裏設定 v2.3 §5・§7・§10 シーン6・7・10、操作マニュアル §4・§6）。
// 初回：2086年の IDO 展示から光の裂け目で NEXTMAKE の前へ落ちる → マツイ社長 → ラボの佐伯 → IDO の QR → 1726年へ（偶然）。
// 帰還：IDO の前へ戻る → 社長に源兵衛の話 → ラボで佐伯が固定具を試作 → IDO の光から 2086年へ。
import * as THREE from 'three'
import { ERA_PRESENT, eraTintHex } from '../../core/eras'
import { presentObjective } from '../../core/storyDirector'
import { DialogueDB } from '../../core/dialogue'
import type { ActionFrame } from '../../player/inputActions'
import type { Character } from '../../world/characters'
import type { Hint } from '../../ui/hud'
import { lineDuration } from '../../game/dialogueQueue'
import type { SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageShots, StageWorld } from '../../game/stage'
import type { SkyPalette } from '../../render/sky'
import data2026 from '../../data/dialogue_2026.json'
import { buildNambaScene, type NambaScene } from './scene'
import { N, NAMBA_SPAWNS, SPOTS } from './layout'
import { matsuiSpot, nambaArrivalSpawn, nambaBeat, type IdoPanelKind, type MatsuiSpot, type NambaActor, type NambaBeat } from './script'
import { paintIdoImage } from './artwork'
import { createSaekiPlaceholder } from './saeki'

const lines2026 = new DialogueDB(data2026)

const NAMBA_SKY: SkyPalette = {
  zenith: '#2a62cf',
  upper: '#4c90e6',
  horizon: '#bcd8f0',
  warm: '#ffc488',
  ground: '#7a6650',
  haze: '#dae2ec',
  cloudLit: '#fff2e0',
  cloudShade: '#a6b2cc',
}
// 夕方前の日差し：西からほぼ水路に沿って差し込む（遊歩道は明るく、影は東へ長く伸びる）
const SUN_YAW = (172 * Math.PI) / 180
const SUN_EL = (27 * Math.PI) / 180
const SUN_DIR = new THREE.Vector3(Math.cos(SUN_EL) * Math.cos(SUN_YAW), Math.sin(SUN_EL), Math.cos(SUN_EL) * Math.sin(SUN_YAW)).normalize()

/** IDO のパネルの中身 */
const IDO_PANELS: Record<IdoPanelKind, { title: string; sub: string; body: string; foot: string }> = {
  info: {
    title: '歴史案内',
    sub: 'なんば ― 水の町の記憶',
    body: 'QR を読むと、この場所の昔の写真や映像、歴史の記録を見ることができます。',
    foot: '※ 写真・資料をもとにした歴史案内サービスです',
  },
  karakuri: {
    title: '歴史案内 ― 大坂のからくり',
    sub: '江戸時代 ・ 川沿いの職人町',
    body: '江戸時代の大坂では、からくり細工が盛んだったと伝わる。このあたりの川沿いにも職人の工房が並び、茶を運ぶ人形や、水を操る仕掛けがあったという逸話が残っている。',
    foot: '※ 写真・資料をもとにした歴史案内です（再現イラスト）',
  },
  record: {
    title: '歴史案内 ― 更新された記録',
    sub: '「源兵衛の水門絵図」 弟子おはるの写し',
    body: 'からくり職人・源兵衛が描いた水門の絵図が、弟子おはるの手記とともに残っていた。歯止めで大歯車を止め、舟が通り過ぎてから離す手順が記されている。',
    foot: '※ 町の記録より',
  },
  return: {
    title: '歴史案内 ― なんば 300年の記録',
    sub: '水門の絵図と、いまの町',
    body: '源兵衛の絵図とおはるの手記は、のちの水門の改修にも生かされたという。……背中の石が、出発した場所の記録に反応している。',
    foot: '',
  },
}

type IdoSeq = {
  kind: IdoPanelKind
  t: number
  beat: NambaBeat
  /** 会話が終わった（パネルを閉じてよい） */
  talked: boolean
  said: Set<string>
}

export class NambaStage implements Stage {
  readonly key = '2026' as const
  readonly era = ERA_PRESENT
  readonly label = '2026年　大阪・なんば'
  readonly subtitle = 'NEXTMAKE と IDO のはじまり'
  readonly environment: StageEnvironment = {
    sky: NAMBA_SKY,
    sunDir: SUN_DIR,
    sunColor: '#ffd29a',
    sunIntensity: 3.9,
    hemi: { sky: '#b4d2f2', ground: '#8a7058', intensity: 0.46 },
    hdri: './hdri/kloofendal_48d_partly_cloudy_puresky_1k.hdr',
    envIntensity: 0.72,
    fog: { color: NAMBA_SKY.haze, density: 0.003 },
    grade: { saturation: 1.22, contrast: 1.08 },
  }
  private scene!: NambaScene
  private matsui!: Character
  private saeki!: Character
  private spawnId = 'present_start'
  private from: string | null = null
  private matsuiAt: MatsuiSpot = 'entrance'
  private walk: { path: THREE.Vector3[]; i: number; face: THREE.Vector3; to: MatsuiSpot } | null = null
  private readonly matsuiFace = new THREE.Vector3()
  private busy = false
  private seq: IdoSeq | null = null
  private arrival: 'hover' | 'falling' | 'return' | null = null
  private arrivalT = 0
  private fixtureTimer = -1
  private crystalTaken = false
  private puff: THREE.Mesh | null = null
  private puffT = -1
  private readonly tmp = new THREE.Vector3()
  private readonly hand = new THREE.Vector3()

  async load(ctx: StageLoadContext): Promise<StageWorld> {
    this.from = ctx.from
    const f = (n: string) => ctx.story.get(n)
    this.spawnId = ctx.spawnId && NAMBA_SPAWNS[ctx.spawnId] ? ctx.spawnId : nambaArrivalSpawn(f)
    const npcs = Promise.all([ctx.loadNpc('matsui', 1.72), ctx.loadNpc('saeki', 1.6, () => createSaekiPlaceholder(1.6))])
    ctx.progress(0.1, 'テクスチャを読み込み中…')
    await ctx.yieldFrame()
    const aniso = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    this.scene = await buildNambaScene(ctx.quality, aniso, ctx.progress, ctx.yieldFrame)
    ctx.progress(0.66, 'マツイ社長と佐伯さんを読み込み中…')
    await ctx.yieldFrame()
    const [matsui, saeki] = await npcs
    this.matsui = matsui
    this.saeki = saeki
    this.scene.root.add(matsui.root, saeki.root)
    this.scene.obstacles.push(matsui.root.position)
    // 着地の砂ぼこり（白い輪）
    const puff = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.9, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }))
    puff.rotation.x = -Math.PI / 2
    puff.visible = false
    this.scene.root.add(puff)
    this.puff = puff
    return { root: this.scene.root, colliders: this.scene.colliders, claw: { targets: this.scene.claw.targets, movables: this.scene.claw.movables }, lights: this.scene.lights }
  }

  spawn(id: string | null): SpawnPoint {
    return NAMBA_SPAWNS[id ?? this.spawnId] ?? NAMBA_SPAWNS[this.spawnId] ?? NAMBA_SPAWNS.present_start
  }

  begin(rt: StageRuntime): void {
    const f = (n: string) => rt.story.get(n)
    this.scene.obstacles.push(rt.player.position)
    this.placeMatsui(matsuiSpot(f))
    this.place(this.saeki, SPOTS.saeki.pos, SPOTS.saeki.face)
    this.saeki.setPose('idle')
    this.scene.nextmake.fixture.visible = f('fixture_made')
    this.crystalTaken = rt.story.timeline.crystals.has('namba_balcony')
    this.scene.claw.crystal.group.visible = !this.crystalTaken
    // 到着の演出
    if (this.spawnId === 'present_start' && !f('met_matsui')) {
      // 光の裂け目から落ちてくる（時代カードが消えるまで空中で待つ）
      this.arrival = 'hover'
      const p = rt.player.position.clone()
      rt.player.beginExternal()
      rt.player.moveExternal(this.tmp.copy(p).setY(2.7), 1 / 60)
      rt.rift.openAt(p.clone().setY(1.6), eraTintHex(2026), 1.9, 3)
      rt.oreGlow(2)
    } else if (this.from === '1726') {
      this.arrival = 'return'
      rt.rift.openAt(rt.player.position.clone(), eraTintHex(1726), 1.6, 3)
    }
    rt.save(this.spawnId)
  }

  revealed(rt: StageRuntime): void {
    if (this.arrival === 'hover') {
      this.arrival = 'falling'
      this.arrivalT = 0
      rt.player.endExternal(new THREE.Vector3(0, -0.5, 0))
    } else if (this.arrival === 'return') {
      this.arrival = null
      rt.rift.close(0.8)
      void rt.dialogue(lines2026.lines('arrive_return')).then(() => {
        // IDO の前で待っていた社長が駆け寄る
        if (!rt.story.get('genbei_story_told')) void this.runBeat('matsui', rt)
      })
    }
  }

  // ---------------------------------------------------------------- 人物の配置・歩き

  private place(ch: Character, pos: THREE.Vector3, face: THREE.Vector3): void {
    ch.root.position.copy(pos)
    ch.root.rotation.y = Math.atan2(-(face.x - pos.x), -(face.z - pos.z))
  }

  private spotOf(s: MatsuiSpot): { pos: THREE.Vector3; face: THREE.Vector3 } {
    return s === 'entrance' ? SPOTS.matsuiEntrance : s === 'lab' ? SPOTS.matsuiLab : SPOTS.matsuiIdo
  }

  private placeMatsui(s: MatsuiSpot): void {
    const sp = this.spotOf(s)
    this.matsuiAt = s
    this.place(this.matsui, sp.pos, sp.face)
    this.matsuiFace.copy(sp.face)
    this.matsui.setPose('idle')
  }

  /** 社長が歩いて移る（入口 → ラボ、IDO ⇄ ラボ） */
  private walkMatsui(to: MatsuiSpot): void {
    const from = this.matsuiAt
    if (from === to) return
    let path: THREE.Vector3[]
    if (from === 'entrance' && to === 'lab') path = SPOTS.pathToLab
    else if (from === 'lab' && to === 'ido') path = [...SPOTS.pathIdoToLab].reverse()
    else if (from === 'ido' && to === 'lab') path = SPOTS.pathIdoToLab
    else if (from === 'entrance' && to === 'ido') path = [SPOTS.matsuiEntrance.pos, SPOTS.matsuiIdo.pos]
    else path = [this.matsui.root.position.clone(), this.spotOf(to).pos]
    this.walk = { path: path.map((p) => p.clone()), i: 1, face: this.spotOf(to).face, to }
    this.matsuiAt = to
  }

  private updateNpcs(dt: number, rt: StageRuntime): void {
    const m = this.matsui
    if (this.walk) {
      const w = this.walk
      const target = w.path[w.i]
      this.tmp.subVectors(target, m.root.position)
      this.tmp.y = 0
      const d = this.tmp.length()
      const step = 1.7 * dt
      if (d <= step) {
        m.root.position.copy(target)
        w.i++
        if (w.i >= w.path.length) {
          this.walk = null
          this.matsuiFace.copy(w.face)
        }
      } else {
        m.root.position.addScaledVector(this.tmp, step / d)
        this.turn(m, this.tmp.x, this.tmp.z, dt, 8)
      }
    } else {
      // 近くにいればネクマックスの方を向く
      const p = rt.player.position
      const dp = Math.hypot(p.x - m.root.position.x, p.z - m.root.position.z)
      const look = dp < 5 ? p : this.matsuiFace
      this.turn(m, look.x - m.root.position.x, look.z - m.root.position.z, dt, 4)
    }
    const s = this.saeki
    const p = rt.player.position
    const ds = Math.hypot(p.x - s.root.position.x, p.z - s.root.position.z)
    const lookS = ds < 4.5 ? p : SPOTS.saeki.face
    this.turn(s, lookS.x - s.root.position.x, lookS.z - s.root.position.z, dt, 3)
  }

  private turn(ch: Character, vx: number, vz: number, dt: number, rate: number): void {
    if (Math.hypot(vx, vz) < 0.05) return
    const want = Math.atan2(-vx, -vz)
    let d = want - ch.root.rotation.y
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    ch.root.rotation.y += d * Math.min(1, rate * dt)
  }

  // ---------------------------------------------------------------- 話す・調べる（F）

  private nearActor(rt: StageRuntime): NambaActor | null {
    const p = rt.player.position
    if (p.y > 1.5) return null
    const dm = this.walk ? Infinity : Math.hypot(p.x - this.matsui.root.position.x, p.z - this.matsui.root.position.z)
    const ds = Math.hypot(p.x - this.saeki.root.position.x, p.z - this.saeki.root.position.z)
    const ido = N.IDO
    const di = Math.hypot(p.x - ido.x, p.z - (ido.z + 1.0))
    const best = Math.min(dm < 2.4 ? dm : Infinity, ds < 2.7 ? ds : Infinity, di < 1.5 && p.z > ido.z + 0.3 ? di : Infinity)
    if (best === Infinity) return null
    return best === dm ? 'matsui' : best === ds ? 'saeki' : 'ido'
  }

  interact(rt: StageRuntime): boolean {
    if (this.busy || this.seq || this.arrival === 'hover' || this.arrival === 'falling') return this.busy || this.seq !== null
    const a = this.nearActor(rt)
    if (!a) return false
    void this.runBeat(a, rt)
    return true
  }

  private async runBeat(actor: NambaActor, rt: StageRuntime): Promise<void> {
    const f = (n: string) => rt.story.get(n)
    const beat = nambaBeat(actor, f)
    if (beat.panel) {
      this.startIdo(beat, rt)
      return
    }
    this.busy = true
    const lines = lines2026.lines(beat.dialogue)
    if (beat.dialogue === 'saeki_fixture') this.fixtureTimer = lines.slice(0, 2).reduce((s, l) => s + lineDuration(l.text), 0) + 0.3
    if (beat.dialogue === 'saeki_first') rt.oreGlow(0.6)
    await rt.dialogue(lines)
    for (const fl of beat.set ?? []) rt.story.set(fl, true)
    if (beat.confirmDrawing) rt.story.timeline.confirmDrawing()
    if (beat.matsuiTo) this.walkMatsui(beat.matsuiTo)
    if (beat.set?.length) rt.save(this.spawnId)
    this.busy = false
  }

  /** IDO：パネル → （移動するとき）鉱石の反応・パネルのゆがみ・光の裂け目 → 時空移動 */
  private startIdo(beat: NambaBeat, rt: StageRuntime): void {
    const kind = beat.panel as IdoPanelKind
    const c = IDO_PANELS[kind]
    rt.hud.showIdo({ ...c, image: kind === 'info' ? null : paintIdoImage(kind === 'karakuri' ? 'karakuri' : 'record') })
    this.seq = { kind, t: 0, beat, talked: false, said: new Set() }
    rt.story.timeline.markMetricTime('ido_found_time')
    if (beat.travel) rt.setControlLocked(true)
    void rt.dialogue(lines2026.lines(beat.dialogue)).then(() => {
      if (this.seq) this.seq.talked = true
    })
  }

  private updateIdo(dt: number, rt: StageRuntime): void {
    const s = this.seq
    if (!s) return
    s.t += dt
    const ido = this.scene.ido
    rt.nexmax.root.updateMatrixWorld(true)
    rt.nexmax.handAnchor.getWorldPosition(this.hand)
    if (s.beat.travel) {
      // 標識の方を向いて、手から板へスキャンの光
      rt.player.turnToward(ido.plate.x - rt.player.position.x, ido.plate.z - rt.player.position.z, dt, 8)
      const scan = Math.min(1, s.t / 0.6) * (s.t < 4.8 ? 1 : Math.max(0, 1 - (s.t - 4.8) * 3))
      ido.setScan(this.hand, scan)
      rt.nexmax.setAim(ido.plate)
      const once = (k: string, at: number, fn: () => void) => {
        if (s.t >= at && !s.said.has(k)) {
          s.said.add(k)
          fn()
        }
      }
      if (s.kind === 'karakuri') {
        const ore = lines2026.lines('ido_ore')
        once('ore', 3.0, () => rt.say(ore[0].speaker, ore[0].text, 4))
        once('shout', 4.4, () => rt.say(ore[1].speaker, ore[1].text, 4))
      }
      if (s.t > 3.0) {
        const k = Math.min(1, (s.t - 3.0) / 1.8)
        rt.oreGlow(1 + k * 1.6)
        ido.setSurge(k)
        rt.hud.setIdoGlitch(k)
        if (this.matsuiAt === 'ido' && !this.walk) this.matsui.setPose('wave')
      }
      once('rift', 4.9, () => {
        const tint = eraTintHex(s.beat.travel?.to === '1726' ? 1726 : 2086)
        const p = rt.player.position.clone().lerp(ido.base, 0.35)
        rt.rift.openAt(p, tint, 1.5, 2.2)
        rt.hud.hideIdo()
      })
      once('travel', 5.4, () => {
        for (const fl of s.beat.set ?? []) rt.story.set(fl, true)
        rt.setControlLocked(false)
        const v = rt.travel(s.beat.travel as NonNullable<NambaBeat['travel']>)
        if (!v.ok) {
          rt.hud.toast(v.reason)
          rt.rift.close()
        }
        ido.setScan(null, 0)
        this.seq = null
      })
      return
    }
    // 見るだけのパネル：会話が終わって少ししたら、または離れたら閉じる
    ido.setScan(s.t < 1.6 ? this.hand : null, s.t < 1.6 ? Math.min(1, s.t / 0.4) : 0)
    for (const fl of s.beat.set ?? []) rt.story.set(fl, true)
    const p = rt.player.position
    const away = Math.hypot(p.x - N.IDO.x, p.z - N.IDO.z) > 3.2
    if ((s.talked && s.t > 6) || away || s.t > 14) {
      rt.hud.hideIdo()
      ido.setScan(null, 0)
      this.seq = null
    }
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.seq || this.busy || this.arrival === 'hover') return []
    const a = this.nearActor(rt)
    if (a === 'ido') return [{ key: 'F', label: 'IDO の QR を読む' }]
    if (a) return [{ key: 'F', label: '話す' }]
    return null
  }

  objective(rt: StageRuntime): { title: string; sub: string } {
    const o = presentObjective((n) => rt.story.get(n))
    return { title: o.title, sub: o.sub }
  }

  objectiveTarget(rt: StageRuntime): THREE.Vector3 | null {
    const o = presentObjective((n) => rt.story.get(n))
    if (o.target === 'matsui') return this.matsui.root.position
    if (o.target === 'saeki') return this.saeki.root.position
    if (o.target === 'ido') return this.scene.ido.base
    return null
  }

  // ---------------------------------------------------------------- 毎フレーム

  update(dt: number, _frame: ActionFrame, rt: StageRuntime): void {
    // 到着：光の裂け目の中で待つ → 落ちて着地
    if (this.arrival === 'hover') {
      rt.player.moveExternal(this.tmp.copy(rt.player.position).setY(2.7), dt)
    } else if (this.arrival === 'falling') {
      this.arrivalT += dt
      if (rt.player.grounded && this.arrivalT > 0.15) {
        this.arrival = null
        rt.rift.close(0.9)
        if (this.puff) {
          this.puff.position.copy(rt.player.position).setY(0.04)
          this.puff.visible = true
          this.puffT = 0
        }
        rt.hud.flash('success')
        void rt.dialogue(lines2026.lines('arrive_first'))
      }
    }
    this.updateNpcs(dt, rt)
    this.updateIdo(dt, rt)
    // IDO の光の輪（近いほど明るい）
    const p = rt.player.position
    const di = Math.hypot(p.x - N.IDO.x, p.z - (N.IDO.z + 1.0))
    this.scene.ido.setNear(this.seq ? 1 : Math.max(0, Math.min(1, (4.5 - di) / 3)))
    // 固定具ができあがる
    if (this.fixtureTimer > 0) {
      this.fixtureTimer -= dt
      if (this.fixtureTimer <= 0) {
        this.scene.nextmake.fixture.visible = true
        rt.hud.flash('success')
      }
    }
    // クリスタル
    if (!this.crystalTaken) {
      const cp = this.scene.claw.crystal.pos
      if (p.distanceTo(this.tmp.copy(cp).setY(cp.y - 0.55)) < 0.9) {
        this.crystalTaken = true
        rt.story.timeline.collectCrystal('namba_balcony')
        this.scene.claw.crystal.group.visible = false
        rt.hud.flash('success')
        rt.hud.toast('クリスタルを手に入れた！')
        rt.oreGlow(1.2)
      }
    }
  }

  animate(dt: number, t: number): void {
    this.scene.update(dt, t)
    this.matsui.update(dt, this.walk ? 1.7 : 0)
    this.saeki.update(dt, 0)
    const cr = this.scene.claw.crystal.group
    if (cr.visible) {
      cr.rotation.y += dt * 1.4
      cr.position.y = this.scene.claw.crystal.pos.y + Math.sin(t * 2.2) * 0.06
    }
    if (this.puff && this.puffT >= 0) {
      this.puffT += dt
      const k = this.puffT / 0.7
      this.puff.scale.setScalar(1 + k * 2.2)
      ;(this.puff.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 * (1 - k))
      if (k >= 1) {
        this.puff.visible = false
        this.puffT = -1
      }
    }
  }

  // ---------------------------------------------------------------- 撮影用ショット（?stage=2026&shot=ido|office|lab|street）

  private readonly SHOTS = [
    { id: 'ido', cam: new THREE.Vector3(-6.1, 0.62, 8.15), target: new THREE.Vector3(-3.7, 0.95, 5.6), fov: 50, nex: [new THREE.Vector3(-4.75, 0, 6.85), new THREE.Vector3(-4.6, 0, 5.8)] as const, mat: [new THREE.Vector3(-3.35, 0, 7.45), new THREE.Vector3(-4.5, 0, 6.0)] as const, pose: 'fire' as const, focus: new THREE.Vector3(-4, 0, 6) },
    { id: 'board', cam: new THREE.Vector3(-16.4, 1.55, 18.4), target: new THREE.Vector3(-18.6, 1.6, 20.2), fov: 55, nex: [new THREE.Vector3(-17.2, 0, 19.0), new THREE.Vector3(-18.6, 0, 19.9)] as const, mat: [new THREE.Vector3(-17.4, 0, 21.0), new THREE.Vector3(-16.4, 0, 18.4)] as const, pose: 'idle' as const, focus: new THREE.Vector3(-17, 0, 20) },
    { id: 'office', cam: new THREE.Vector3(-11.2, 1.55, 11.55), target: new THREE.Vector3(-7.2, 1.25, 16.8), fov: 60, nex: [new THREE.Vector3(-9.7, 0, 13.6), new THREE.Vector3(-6.5, 0, 17)] as const, mat: [new THREE.Vector3(-9.6, 0, 15.6), new THREE.Vector3(-9.7, 0, 13.6)] as const, pose: 'walk' as const, focus: new THREE.Vector3(-9, 0, 14) },
    { id: 'lab', cam: new THREE.Vector3(-5.6, 1.6, 17.9), target: new THREE.Vector3(-14.5, 1.25, 20.8), fov: 58, nex: [new THREE.Vector3(-11.6, 0, 19.3), new THREE.Vector3(-9.3, 0, 20.9)] as const, mat: [new THREE.Vector3(-15.8, 0, 20.3), new THREE.Vector3(-11.6, 0, 19.3)] as const, pose: 'idle' as const, focus: new THREE.Vector3(-12, 0, 20) },
    { id: 'street', cam: new THREE.Vector3(17.5, 3.6, 7.6), target: new THREE.Vector3(-6, 3.2, 1.0), fov: 56, nex: [new THREE.Vector3(9.5, 0, 7.4), new THREE.Vector3(0, 0, 6)] as const, mat: [new THREE.Vector3(-8.3, 0, 9.7), new THREE.Vector3(-10.4, 0, 7.6)] as const, pose: 'walk' as const, focus: new THREE.Vector3(4, 0, 4) },
  ]

  readonly shots: StageShots = {
    ids: this.SHOTS.map((s) => s.id),
    apply: (index, rt) => {
      const { camera, hud, nexmax, claw } = rt
      if (index < 0) {
        camera.fov = 55
        camera.updateProjectionMatrix()
        nexmax.setPose('idle')
        nexmax.setAim(null)
        hud.setShot(null)
        hud.setPlayUiVisible(true)
        this.placeMatsui(this.matsuiAt)
        this.scene.pedestrians.group.visible = true
        return
      }
      const s = this.SHOTS[index]
      claw.reset()
      // 撮影では到着の演出・歩く人・光の裂け目を止める
      if (this.arrival === 'hover' || this.arrival === 'falling') rt.player.endExternal()
      this.arrival = null
      rt.rift.hide()
      this.scene.pedestrians.group.visible = false
      hud.setObjective(...(() => {
        const o = presentObjective((n) => rt.story.get(n))
        return [o.title, o.sub] as [string, string]
      })())
      camera.position.copy(s.cam)
      camera.lookAt(s.target)
      camera.fov = s.fov
      camera.updateProjectionMatrix()
      this.place(nexmax, s.nex[0], s.nex[1])
      nexmax.setPose(s.pose)
      nexmax.setAim(s.id === 'ido' ? this.scene.ido.plate : null)
      this.place(this.matsui, s.mat[0], s.mat[1])
      hud.setShot(`2026 ― ${s.id}`)
      hud.setPlayUiVisible(false)
      if (s.id === 'ido') {
        hud.setObjective('IDOマーカーを調べよう', '水路沿いの石の標識で F')
        this.scene.ido.setNear(1)
      }
    },
    update: (index, _dt, hand) => {
      if (this.SHOTS[index]?.id === 'ido') this.scene.ido.setScan(hand, 1)
      else this.scene.ido.setScan(null, 0)
    },
    focus: (index) => this.SHOTS[index].focus,
    nexmaxSpeed: (index) => (this.SHOTS[index].pose === 'walk' ? 3.0 : 0),
  }

  debug(): Record<string, unknown> {
    return {
      matsuiAt: this.matsuiAt,
      matsuiWalking: this.walk !== null,
      matsuiPos: this.matsui.root.position.toArray().map((x) => +x.toFixed(2)),
      busy: this.busy,
      ido: this.seq ? { kind: this.seq.kind, t: +this.seq.t.toFixed(2) } : null,
      arrival: this.arrival,
      crystal: this.crystalTaken,
      fixture: this.scene.nextmake.fixture.visible,
    }
  }

  dispose(): void {
    this.seq = null
    this.walk = null
  }
}
