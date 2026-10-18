// 2026年 大阪・なんばのステージ（docs/シナリオ改訂案_導入編_v1.md の 6・8 章。背景は物語・裏設定 v2.3 §5・§7）。
// 初回：2086年の IDO 展示から光の裂け目で NEXTMAKE の前へ落ちる（右腕がぐらぐら）→ 電話中のマツイ社長が光に気づいて
//   歩いてきて、しゃがんで「もしかして……君、ネクマックス？」（操作なし・カメラの演出・タブレットの構想スケッチ）→
//   社長についてラボへ → 佐伯が右腕の取り付け部を締め直す → 社長は表で待つ（社内は自由：構想スケッチ・IDO のポスター・社員）→
//   表の社長に相談：「こっちの IDO が帰る手がかりになるかも」（カメラで石標 A・B・C を順に見せる）→ 社長がついて歩く →
//   石標 A・B は昔の町を見るだけ、C（古い路地の奥・江戸のからくりのうわさ）で鉱石が反応して 1726年へ。
// 帰還：石標 A の前へ戻る → 社長に源兵衛の話 → ラボで佐伯が固定具を試作 → 石標 A の光から 2086年へ。
import * as THREE from 'three'
import { ERA_PRESENT, eraTintHex } from '../../core/eras'
import { presentObjective, idoMarkersLeft } from '../../core/storyDirector'
import { DialogueDB } from '../../core/dialogue'
import type { ActionFrame } from '../../player/inputActions'
import type { Character } from '../../world/characters'
import type { Hint } from '../../ui/hud'
import { lineDuration, type DialogueLine } from '../../game/dialogueQueue'
import type { CineShot, ObjectiveMark, SpawnPoint, Stage, StageEnvironment, StageLoadContext, StageRuntime, StageShots, StageWorld } from '../../game/stage'
import type { SkyPalette } from '../../render/sky'
import data2026 from '../../data/dialogue_2026.json'
import { buildNambaScene, type NambaScene } from './scene'
import { N, NAMBA_SPAWNS, SPOTS } from './layout'
import { IDO_ACTOR, idoMarkerVisible, matsuiFollows, matsuiSpot, nambaArrivalSpawn, nambaBeat, type IdoMarkerId, type IdoPanelKind, type MatsuiSpot, type NambaActor, type NambaBeat } from './script'
import { paintIdoImage, paintSketchTablet } from './artwork'
import { createSaekiPlaceholder } from './saeki'
import { MobTalk2026 } from './mobTalk2026'
import { OfficeStaff } from './officeStaff'
import { IdoPanelFx } from './idoPanelFx'
import type { IdoMarker } from './ido'

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
    foot: '※ 写真・資料をもとにした歴史案内サービスです（テスト中）',
  },
  old1926: {
    title: '歴史案内 ― 100年前のなんば',
    sub: '1926年ごろ ・ 道頓堀の芝居町',
    body: '川沿いには芝居小屋や見世物小屋が建ち並び、役者の名前を染めた幟が風にはためいていた。夜になると提灯の明かりが水面に映り、多くの見物客でにぎわったという。',
    foot: '※ 写真・資料をもとにした歴史案内です（テスト中）',
  },
  expo1970: {
    title: '歴史案内 ― 万博のころの道頓堀',
    sub: '1970年 ・ 世界中から人が集まった年',
    body: '大阪で万国博覧会が開かれた年、道頓堀にも国内外から大勢の人が訪れた。色とりどりの看板が川面を照らし、橋の上は夜遅くまで人の波が絶えなかった。',
    foot: '※ 写真・資料をもとにした歴史案内です（テスト中）',
  },
  karakuri: {
    title: '歴史案内 ― 仕掛け横丁のうわさ',
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

/**
 * 石標のパネルの写真（生成画像。public/textures/story/）。読み込めたら手描きの絵の代わりに使う（無ければ手描きのまま）。
 * 幅 720 に縮め、高さは 16:9 まで（それより縦長なら上下を切る）
 */
const IDO_PHOTOS: Partial<Record<IdoPanelKind, string>> = {
  old1926: './textures/story/ido_marker_1926.webp',
  expo1970: './textures/story/ido_marker_1970.webp',
  karakuri: './textures/story/ido_marker_edo.webp',
}

function photoCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const W = 720
  const H = Math.min(405, Math.max(240, Math.round((W * img.naturalHeight) / Math.max(1, img.naturalWidth))))
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d') as CanvasRenderingContext2D
  // cover（中央を残して切る）
  const s = Math.max(W / img.naturalWidth, H / img.naturalHeight)
  const dw = img.naturalWidth * s
  const dh = img.naturalHeight * s
  g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
  return c
}

/** 見るだけの場所（F）：ラボの構想スケッチのボード・オフィスの IDO のポスター */
const LOOKS: Array<{ actor: 'board' | 'poster'; stand: THREE.Vector3; reach: number; look: THREE.Vector3; from: THREE.Vector3; label: string }> = [
  { actor: 'board', stand: new THREE.Vector3(-17.7, 0, 19.9), reach: 1.5, look: new THREE.Vector3(-18.66, 1.62, 19.9), from: new THREE.Vector3(-16.1, 1.55, 19.75), label: '構想スケッチを見る' },
  { actor: 'poster', stand: new THREE.Vector3(-12.5, 0, 14.95), reach: 1.25, look: new THREE.Vector3(-12.5, 1.8, 14.13), from: new THREE.Vector3(-12.2, 1.6, 15.9), label: 'ポスターを見る' },
]

const MARKER_IDS: readonly IdoMarkerId[] = ['a', 'b', 'c']

type IdoSeq = {
  kind: IdoPanelKind
  marker: IdoMarker
  t: number
  beat: NambaBeat
  /** 会話が終わった（パネルを閉じてよい） */
  talked: boolean
  said: Set<string>
}

type Walk = { path: THREE.Vector3[]; i: number; face: THREE.Vector3; speed: number; done: (() => void) | null }

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
  private staff: OfficeStaff | null = null
  private spawnId = 'present_start'
  private from: string | null = null
  private matsuiAt: MatsuiSpot = 'entrance'
  private walk: Walk | null = null
  private readonly matsuiFace = new THREE.Vector3()
  /** 社長が見る相手（null なら近ければネクマックス、遠ければ定位置の向き） */
  private matsuiLook: THREE.Vector3 | null = null
  /** 社長がしゃがんで顔をのぞきこむ（0〜1） */
  private crouch = 0
  private crouchTarget = 0
  /** 社長がネクマックスについて歩く（表で相談したあと） */
  private following = false
  private busy = false
  /** マツイ社長が近づいてくる演出の段階 */
  private intro: 'none' | 'wait' | 'running' | 'done' = 'none'
  private seq: IdoSeq | null = null
  private arrival: 'hover' | 'falling' | 'return' | null = null
  private arrivalT = 0
  private fixtureTimer = -1
  private crystalTaken = false
  private puff: THREE.Mesh | null = null
  private puffT = -1
  /** 右腕のぐらつき（1 = 佐伯が直す前） */
  private armLoose = 0
  private shoulderR: THREE.Object3D | null = null
  private eyes: THREE.Object3D | null = null
  /** マツイ社長のタブレット（構想スケッチ） */
  private tablet: THREE.Group | null = null
  private tabletK = 0
  private tabletOn = false
  private readonly panelFx = new IdoPanelFx()
  private readonly panelImages = new Map<IdoPanelKind, HTMLCanvasElement>()
  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector3()
  private readonly eye = new THREE.Vector3()
  /** カメラの演出で毎フレーム動かす点（社長の頭など） */
  private readonly cineLook = new THREE.Vector3()
  /** 通行人・社員のおしゃべり（吹き出し・F の会話。mobTalk2026.ts） */
  private mobs: MobTalk2026 | null = null

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
    matsui.root.rotation.order = 'YXZ'
    this.scene.root.add(matsui.root, saeki.root)
    this.scene.obstacles.push(matsui.root.position)
    // オフィスの社員
    this.staff = new OfficeStaff()
    this.scene.root.add(this.staff.group)
    // 着地の砂ぼこり（白い輪）
    const puff = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.9, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }))
    puff.rotation.x = -Math.PI / 2
    puff.visible = false
    this.scene.root.add(puff)
    this.puff = puff
    this.tablet = this.buildTablet()
    this.scene.root.add(this.tablet)
    return { root: this.scene.root, colliders: this.scene.colliders, claw: { targets: this.scene.claw.targets, movables: this.scene.claw.movables }, lights: this.scene.lights }
  }

  /** マツイ社長のタブレット：薄い黒い板に構想スケッチ、ふちに淡い水色の光 */
  private buildTablet(): THREE.Group {
    const g = new THREE.Group()
    g.name = 'matsui_tablet'
    const tex = new THREE.CanvasTexture(paintSketchTablet())
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.27, 0.012), new THREE.MeshStandardMaterial({ color: '#1a1c22', roughness: 0.35, metalness: 0.4 }))
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.245), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
    screen.position.z = 0.007
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.44, 0.35),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.2, 1.8), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    )
    glow.position.z = -0.004
    g.add(glow, body, screen)
    g.visible = false
    return g
  }

  spawn(id: string | null): SpawnPoint {
    return NAMBA_SPAWNS[id ?? this.spawnId] ?? NAMBA_SPAWNS[this.spawnId] ?? NAMBA_SPAWNS.present_start
  }

  /** 生成した写真を先に読み込む（読めたら手描きの絵と差し替える。失敗しても何もしない） */
  private preloadPhotos(): void {
    for (const [kind, url] of Object.entries(IDO_PHOTOS) as Array<[IdoPanelKind, string]>) {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => {
        if (this.disposed || !img.naturalWidth) return
        this.panelImages.set(kind, photoCanvas(img))
      }
      img.onerror = () => {}
      img.src = url
    }
  }
  private disposed = false

  begin(rt: StageRuntime): void {
    const f = (n: string) => rt.story.get(n)
    this.preloadPhotos()
    this.scene.obstacles.push(rt.player.position)
    this.mobs = new MobTalk2026(this.scene.pedestrians, rt.renderer.domElement.ownerDocument.getElementById('ui'), rt.camera, this.staff)
    this.shoulderR = rt.nexmax.root.getObjectByName('shoulderR') ?? null
    this.eyes = rt.nexmax.root.getObjectByName('eyeballs') ?? rt.nexmax.root.getObjectByName('head') ?? null
    const spot = matsuiSpot(f)
    if (spot === 'entrance') this.placeAt(this.matsui, SPOTS.matsuiPhone.pos, SPOTS.matsuiPhone.face, 'entrance')
    else this.placeMatsui(spot)
    this.following = matsuiFollows(f)
    this.place(this.saeki, SPOTS.saeki.pos, SPOTS.saeki.face)
    this.saeki.setPose('idle')
    this.scene.nextmake.fixture.visible = f('fixture_made')
    this.crystalTaken = rt.story.timeline.crystals.has('namba_balcony')
    this.scene.claw.crystal.group.visible = !this.crystalTaken
    this.armLoose = !f('gate_repaired') && !f('met_saeki') ? 1 : 0
    // 到着の演出
    if (this.spawnId === 'present_start' && !f('met_matsui')) {
      // 光の裂け目から落ちてくる（時代カードが消えるまで空中で待つ）
      this.arrival = 'hover'
      const p = rt.player.position.clone()
      rt.player.beginExternal()
      rt.player.moveExternal(this.tmp.copy(p).setY(2.7), 1 / 60)
      rt.rift.openAt(p.clone().setY(1.6), eraTintHex(2026), 1.9, 3)
      rt.oreGlow(2)
      this.intro = 'wait'
    } else if (this.from === '1726') {
      this.arrival = 'return'
      rt.rift.openAt(rt.player.position.clone(), eraTintHex(1726), 1.6, 3)
    }
    // セーブ・?flags= から：社長にまだ会っていなければ、近づくと社長のほうから来る
    if (!f('met_matsui') && !f('gate_repaired') && this.intro === 'none') this.intro = 'wait'
    rt.save(this.spawnId)
    if (rt.params.has('debug')) {
      ;(window as unknown as { __nambaDev?: unknown }).__nambaDev = {
        tp: (x: number, z: number, facing?: number) => rt.player.teleport(new THREE.Vector3(x, 0, z), facing),
        stage: this,
      }
    }
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
        // 石標 A の前で待っていた社長に話す
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

  private placeAt(ch: Character, pos: THREE.Vector3, face: THREE.Vector3, s: MatsuiSpot): void {
    this.place(ch, pos, face)
    this.matsuiAt = s
    this.matsuiFace.copy(face)
    this.matsui.setPose('idle')
  }

  private placeMatsui(s: MatsuiSpot): void {
    const sp = this.spotOf(s)
    this.placeAt(this.matsui, sp.pos, sp.face, s)
  }

  /** 社長が道を歩く（終わると resolve） */
  private walkPath(path: THREE.Vector3[], face: THREE.Vector3, speed = 1.7): Promise<void> {
    this.walk?.done?.()
    return new Promise((resolve) => {
      this.walk = { path: path.map((p) => p.clone()), i: 1, face: face.clone(), speed, done: resolve }
    })
  }

  /** 社長が歩いて移る（着地点の前 → ラボ、ラボ ⇄ 石標 A） */
  private walkMatsui(to: MatsuiSpot): void {
    const from = this.matsuiAt
    if (from === to && !this.following) return
    const here = this.matsui.root.position.clone()
    let path: THREE.Vector3[]
    if (to === 'lab' && from !== 'lab') {
      // 着地点の前から（または途中から）ラボへ
      path = from === 'ido' ? SPOTS.pathIdoToLab : [here, ...SPOTS.pathToLab.slice(1)]
    } else if (from === 'lab' && to === 'ido') path = [...SPOTS.pathIdoToLab].reverse()
    else path = [here, this.spotOf(to).pos]
    this.matsuiAt = to
    void this.walkPath(path, this.spotOf(to).face)
  }

  /** 社長がついて歩ける場所（南岸の遊歩道と古い路地）にネクマックスがいるか */
  private inFollowZone(p: THREE.Vector3): boolean {
    if (p.y > 1.2) return false
    const A = N.ALLEY
    if (p.x > A.x0 && p.x < A.x1 && p.z > A.z0 - 0.5 && p.z < A.z1) return true
    return p.z > N.CANAL_S && p.z < N.FACADE_S - 0.2 && p.x > N.X0 + 1 && p.x < N.X1 - 1
  }

  /** ついて歩く：2 m ほど後ろを保つ。遊歩道では柵や街灯に寄りすぎない帯の中を歩く */
  private updateFollow(dt: number, rt: StageRuntime): boolean {
    const m = this.matsui.root.position
    const p = rt.player.position
    if (!this.inFollowZone(p) || this.seq) return false
    const d = Math.hypot(p.x - m.x, p.z - m.z)
    // カメラとネクマックスのあいだ（画面の手前）に立たないように：カメラから見た奥行きの向き c
    const cam = rt.camera.position
    let cx = p.x - cam.x
    let cz = p.z - cam.z
    const cl = Math.hypot(cx, cz) || 1
    cx /= cl
    cz /= cl
    // 社長の位置をネクマックスから見た向き
    const ux = (m.x - p.x) / (d || 1)
    const uz = (m.z - p.z) / (d || 1)
    const blocking = -(ux * cx + uz * cz) > 0.55 && d < cl + 0.5
    if (d < 2.4 && !blocking) return false
    const A = N.ALLEY
    const inAlley = (q: THREE.Vector3) => q.x > A.x0 && q.x < A.x1 && q.z > A.z0 - 0.4
    // 目標：ネクマックスから社長の側へ 2 m。画面の手前に入るときは、横（斜め後ろ）へずらす
    if (blocking) {
      const side = ux * -cz + uz * cx >= 0 ? 1 : -1
      this.tmp.set(p.x + -cz * side * 1.7 - cx * 0.8, 0, p.z + cx * side * 1.7 - cz * 0.8)
    } else this.tmp.set(m.x - p.x, 0, m.z - p.z).normalize().multiplyScalar(2.0).add(p)
    if (inAlley(p)) {
      // 路地の中：入口から路地の真ん中の線に沿って
      if (!inAlley(m)) this.tmp.set((A.x0 + A.x1) / 2, 0, Math.min(A.z0 + 0.6, p.z - 1.2))
      this.tmp.x = Math.min(A.x1 - 0.5, Math.max(A.x0 + 0.5, this.tmp.x))
    } else {
      if (inAlley(m)) this.tmp.set((A.x0 + A.x1) / 2, 0, A.z0 - 1.2)
      else this.tmp.z = Math.min(9.0, Math.max(6.9, this.tmp.z))
    }
    this.tmp.sub(m)
    this.tmp.y = 0
    const len = this.tmp.length()
    if (len < 0.05) return false
    const speed = Math.min(3.6, 1.5 + (d - 2.4) * 0.7)
    const step = Math.min(len, speed * dt)
    m.addScaledVector(this.tmp, step / len)
    this.turn(this.matsui, this.tmp.x, this.tmp.z, dt, 8)
    this.followSpeed = speed
    return true
  }
  private followSpeed = 0
  private matsuiMoving = false

  private updateNpcs(dt: number, rt: StageRuntime): void {
    const m = this.matsui
    this.matsuiMoving = false
    if (this.walk) {
      const w = this.walk
      const target = w.path[w.i]
      this.tmp.subVectors(target, m.root.position)
      this.tmp.y = 0
      const d = this.tmp.length()
      const step = w.speed * dt
      this.matsuiMoving = true
      this.followSpeed = w.speed
      if (d <= step) {
        m.root.position.copy(target)
        w.i++
        if (w.i >= w.path.length) {
          this.walk = null
          this.matsuiFace.copy(w.face)
          w.done?.()
        }
      } else {
        m.root.position.addScaledVector(this.tmp, step / d)
        this.turn(m, this.tmp.x, this.tmp.z, dt, 8)
      }
    } else if (this.following && !this.busy && this.updateFollow(dt, rt)) {
      this.matsuiMoving = true
    } else {
      // 見る相手（演出中の指定・近ければネクマックス・石標を読んでいれば石標）
      const p = rt.player.position
      const dp = Math.hypot(p.x - m.root.position.x, p.z - m.root.position.z)
      const look = this.matsuiLook ?? (this.seq && this.following ? this.seq.marker.plate : dp < 5 ? p : this.matsuiFace)
      this.turn(m, look.x - m.root.position.x, look.z - m.root.position.z, dt, 4)
    }
    // しゃがむ（前へ傾いて顔をのぞきこむ）
    this.crouch += (this.crouchTarget - this.crouch) * Math.min(1, dt * 3)
    m.root.rotation.x = -0.24 * this.crouch
    m.root.position.y = -0.03 * this.crouch
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

  // ---------------------------------------------------------------- 6-2：マツイ社長が近づいてくる（操作なし）

  private matsuiHead(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.matsui.root.position).setY(1.45 - 0.25 * this.crouch)
  }

  private async runApproach(rt: StageRuntime): Promise<void> {
    if (this.intro === 'running' || this.intro === 'done') return
    this.intro = 'running'
    this.busy = true
    rt.setControlLocked(true)
    const L = lines2026.lines('matsui_phone')
    const P = rt.player.position
    // 電話中の社長を見せる（社長の頭を追う）
    this.matsuiHead(this.cineLook)
    void rt.cinematic({ look: this.cineLook, hold: Infinity, inSec: 1.6, fov: 46 })
    await rt.dialogue(L.slice(0, 1))
    this.matsuiLook = P
    await rt.dialogue(L.slice(1))
    // 歩いてくる → しゃがむ。二人を横から（ゆっくり寄る）
    const meet = SPOTS.matsuiMeet
    const mid = this.tmp2.copy(P).lerp(meet.pos, 0.5).setY(0.95)
    // 水路の側（北）から、NEXTMAKE を背に二人を横から
    const perp = this.tmp.set(-(meet.pos.z - P.z), 0, meet.pos.x - P.x).normalize()
    if (perp.z > 0) perp.negate()
    const two: CineShot = {
      look: mid.clone(),
      // 柵の柱（高さ 0.9 m）越しにネクマックスが隠れないよう、少し上から見下ろす
      from: new THREE.Vector3(mid.x + perp.x * 4.3 - 1.2, 2.15, mid.z + perp.z * 4.3),
      fromTo: new THREE.Vector3(mid.x + perp.x * 3.3 - 1.0, 1.9, mid.z + perp.z * 3.3),
      hold: Infinity,
      inSec: 2.4,
      panSec: 16,
      fov: 38,
    }
    this.matsuiLook = null
    const walking = this.walkPath([this.matsui.root.position.clone(), meet.pos], P, 1.5)
    void rt.cinematic(two)
    await walking
    this.matsuiLook = P
    this.crouchTarget = 1
    rt.player.turnToward(meet.pos.x - P.x, meet.pos.z - P.z, 1, 1)
    const M = lines2026.lines('matsui_first')
    await rt.dialogue(M.slice(0, 4))
    // 「絵もある」：タブレットの構想スケッチ（ネクマックスの肩越しに）
    // タブレットはネクマックスと水路の側（カメラ）のあいだへ向けて差し出す
    const showTo = new THREE.Vector3(P.x - 0.2, 1.1, P.z - 1.3)
    this.showTablet(true, rt, showTo)
    const tab = this.tablet as THREE.Group
    const toCam = this.tmp.copy(showTo).sub(tab.position).normalize()
    void rt.cinematic({
      // 会話の窓にかからないよう、タブレットが画面の中ほどより上に来るように少し下を見る
      look: new THREE.Vector3(tab.position.x + 0.05, 0.84, tab.position.z + 0.05),
      from: new THREE.Vector3(tab.position.x + toCam.x * 1.8, tab.position.y + toCam.y * 1.8 + 0.3, tab.position.z + toCam.z * 1.8),
      hold: Infinity,
      inSec: 1.3,
      fov: 32,
      arc: 0,
    })
    await rt.dialogue(M.slice(4, 6))
    this.showTablet(false, rt)
    void rt.cinematic({ ...two, from: two.fromTo, fromTo: undefined, inSec: 1.4 })
    await rt.dialogue(M.slice(6, 11))
    this.crouchTarget = 0
    await rt.dialogue(M.slice(11))
    rt.endCinematic()
    this.matsuiLook = null
    rt.story.set('met_matsui', true)
    rt.save(this.spawnId)
    this.intro = 'done'
    this.busy = false
    rt.setControlLocked(false)
    this.walkMatsui('lab')
  }

  private showTablet(on: boolean, rt: StageRuntime, faceTo?: THREE.Vector3): void {
    const t = this.tablet
    if (!t) return
    this.tabletOn = on
    if (on) {
      // 社長の胸の前、ネクマックスへ向けて
      const m = this.matsui.root.position
      const p = rt.player.position
      const dir = this.tmp.copy(p).sub(m).setY(0).normalize()
      t.position.set(m.x + dir.x * 0.42, 0.98, m.z + dir.z * 0.42)
      if (faceTo) t.lookAt(faceTo)
      else t.lookAt(p.x, 1.05, p.z)
      t.visible = true
    }
  }

  // ---------------------------------------------------------------- 話す・調べる（F）

  private nearMarker(p: THREE.Vector3): { id: IdoMarkerId; d: number } | null {
    let best: { id: IdoMarkerId; d: number } | null = null
    for (const id of MARKER_IDS) {
      const mk = this.scene.idos[id]
      const sx = mk.base.x + mk.front.x
      const sz = mk.base.z + mk.front.z
      const d = Math.hypot(p.x - sx, p.z - sz)
      const ahead = (p.x - mk.base.x) * mk.front.x + (p.z - mk.base.z) * mk.front.z
      if (d < 1.5 && ahead > 0.3 && (!best || d < best.d)) best = { id, d }
    }
    return best
  }

  private nearActor(rt: StageRuntime): NambaActor | null {
    const p = rt.player.position
    if (p.y > 1.5) return null
    const cands: Array<[NambaActor, number]> = []
    const dm = this.walk ? Infinity : Math.hypot(p.x - this.matsui.root.position.x, p.z - this.matsui.root.position.z)
    if (dm < 2.4) cands.push(['matsui', dm])
    const ds = Math.hypot(p.x - this.saeki.root.position.x, p.z - this.saeki.root.position.z)
    if (ds < 2.7) cands.push(['saeki', ds])
    const mk = this.nearMarker(p)
    if (mk) cands.push([IDO_ACTOR[mk.id], mk.d])
    for (const l of LOOKS) {
      const d = Math.hypot(p.x - l.stand.x, p.z - l.stand.z)
      if (d < l.reach) cands.push([l.actor, d + 0.3])
    }
    if (!cands.length) return null
    cands.sort((a, b) => a[1] - b[1])
    return cands[0][0]
  }

  interact(rt: StageRuntime): boolean {
    if (this.busy || this.seq || this.arrival === 'hover' || this.arrival === 'falling' || this.intro === 'running') return true
    const a = this.nearActor(rt)
    if (!a) return this.mobs?.interact(rt) ?? false // 通行人・社員（社長・佐伯・石標などが近くにいないときだけ）
    if (a === 'matsui' && !rt.story.get('met_matsui') && !rt.story.get('gate_repaired')) {
      void this.runApproach(rt)
      return true
    }
    void this.runBeat(a, rt)
    return true
  }

  private async runBeat(actor: NambaActor, rt: StageRuntime): Promise<void> {
    const f = (n: string) => rt.story.get(n)
    const beat = nambaBeat(actor, f)
    if (beat.panel) {
      this.startIdo(beat, actor, rt)
      return
    }
    this.busy = true
    const lines = lines2026.lines(beat.dialogue)
    if (beat.dialogue === 'saeki_fixture') this.fixtureTimer = lines.slice(0, 2).reduce((s, l) => s + lineDuration(l.text), 0) + 0.3
    if (beat.dialogue === 'saeki_first') await this.playFixArm(lines, rt)
    else if (beat.dialogue === 'matsui_ido_hint') await this.playIdoHint(lines, rt)
    else if (actor === 'board' || actor === 'poster') await this.playLook(actor, lines, rt)
    else await rt.dialogue(lines)
    for (const fl of beat.set ?? []) rt.story.set(fl, true)
    if (beat.confirmDrawing) rt.story.timeline.confirmDrawing()
    if (beat.follow) this.following = true
    if (beat.matsuiTo) this.walkMatsui(beat.matsuiTo)
    if (beat.set?.length) rt.save(this.spawnId)
    this.busy = false
  }

  /** 6-4：佐伯が右腕の取り付け部を締め直す（肩へ寄るカメラ） */
  private async playFixArm(L: readonly DialogueLine[], rt: StageRuntime): Promise<void> {
    rt.oreGlow(0.6)
    await rt.dialogue(L.slice(0, 2))
    const sh = this.tmp.set(0, 0.95, 0)
    if (this.shoulderR) {
      rt.nexmax.root.updateMatrixWorld(true)
      this.shoulderR.getWorldPosition(sh)
    }
    const p = rt.player.position
    const s = this.saeki.root.position
    const back = this.tmp2.copy(s).sub(p).setY(0).normalize()
    // 佐伯の肩越しに、ネクマックスの右腕の付け根を
    void rt.cinematic({ look: sh.clone(), from: new THREE.Vector3(s.x + back.x * 0.55 - back.z * 0.75, 1.5, s.z + back.z * 0.55 + back.x * 0.75), hold: Infinity, inSec: 1.4, fov: 40 })
    await rt.dialogue(L.slice(2, 5))
    // 締め直した
    this.armLoose = 0
    rt.hud.flash('success')
    rt.oreGlow(1.1)
    await rt.dialogue(L.slice(5, 7))
    rt.endCinematic()
    await rt.dialogue(L.slice(7))
  }

  /** 6-6：表の社長に相談 → カメラで石標 A・B、路地の入口、石標 C を順に見せる */
  private async playIdoHint(L: readonly DialogueLine[], rt: StageRuntime): Promise<void> {
    const { a, b, c } = this.scene.idos
    this.matsuiLook = rt.player.position
    await rt.dialogue(L.slice(0, 1))
    void rt.cinematic({
      look: a.plate.clone(),
      from: new THREE.Vector3(a.base.x - 1.7, 1.6, a.base.z + 3.0),
      hold: Infinity,
      inSec: 1.5,
      fov: 46,
      marker: { pos: a.plate.clone().setY(1.1), label: '石標 A ― NEXTMAKE の前' },
    })
    this.matsuiLook = a.plate
    await rt.dialogue(L.slice(1, 2))
    void rt.cinematic({
      look: b.plate.clone(),
      from: new THREE.Vector3(b.base.x - 3.4, 2.2, b.base.z + 1.95),
      hold: Infinity,
      inSec: 2.0,
      fov: 46,
      marker: { pos: b.plate.clone().setY(1.1), label: '石標 B ― 橋のたもと' },
    })
    this.matsuiLook = b.plate
    await rt.dialogue(L.slice(2, 3))
    // うわさ：古い路地の入口を見せ、そのまま奥の石標 C へ
    const A = N.ALLEY
    const ax = (A.x0 + A.x1) / 2
    void rt.cinematic({
      look: new THREE.Vector3(ax, 2.2, A.z0),
      from: new THREE.Vector3(ax - 4.6, 2.6, 7.0),
      hold: Infinity,
      inSec: 2.0,
      fov: 50,
    })
    await rt.dialogue(L.slice(3, 4))
    void rt.cinematic({
      look: c.plate.clone(),
      from: new THREE.Vector3(ax, 2.5, 8.6),
      hold: Infinity,
      inSec: 1.8,
      fov: 38,
      marker: { pos: c.plate.clone().setY(1.1), label: '石標 C ― 古い路地の奥', color: '#ffd08a' },
    })
    await rt.dialogue(L.slice(4, 5))
    rt.endCinematic()
    this.matsuiLook = rt.player.position
    await rt.dialogue(L.slice(5))
    this.matsuiLook = null
  }

  /** 構想スケッチ・ポスターを見る（少し寄るカメラ） */
  private async playLook(actor: 'board' | 'poster', L: readonly DialogueLine[], rt: StageRuntime): Promise<void> {
    const l = LOOKS.find((x) => x.actor === actor)
    if (l) void rt.cinematic({ look: l.look, from: l.from, hold: Infinity, inSec: 1.2, fov: 48, arc: 0 })
    await rt.dialogue(L)
    if (l) rt.endCinematic()
  }

  /** 石標の QR を読む：目から板へ光、パネルの絵が組み上がる →（C なら）鉱石の反応・パネルのゆがみ・光の裂け目 → 時空移動 */
  private startIdo(beat: NambaBeat, actor: NambaActor, rt: StageRuntime): void {
    const kind = beat.panel as IdoPanelKind
    const c = IDO_PANELS[kind]
    const id: IdoMarkerId = actor === 'ido_b' ? 'b' : actor === 'ido_c' ? 'c' : 'a'
    const marker = this.scene.idos[id]
    let src = this.panelImages.get(kind)
    if (!src && kind !== 'info') {
      src = paintIdoImage(kind === 'return' ? 'record' : kind)
      this.panelImages.set(kind, src)
    }
    if (src) this.panelFx.start(src)
    rt.hud.showIdo({ ...c, image: src ? this.panelFx.canvas : null })
    this.seq = { kind, marker, t: 0, beat, talked: false, said: new Set() }
    rt.story.timeline.markMetricTime('ido_found_time')
    rt.setControlLocked(true)
    // 見るだけのパネルは、すぐフラグを立てる（離れて閉じても読んだことにする）
    if (!beat.travel) for (const fl of beat.set ?? []) rt.story.set(fl, true)
    void rt.dialogue(lines2026.lines(beat.dialogue)).then(() => {
      if (this.seq) this.seq.talked = true
    })
  }

  private updateIdo(dt: number, rt: StageRuntime): void {
    const s = this.seq
    if (!s) return
    s.t += dt
    const mk = s.marker
    this.panelFx.update(dt)
    // 目の位置（スキャンの光の始点）
    if (this.eyes) {
      rt.nexmax.root.updateMatrixWorld(true)
      this.eyes.getWorldPosition(this.eye)
    } else this.eye.copy(rt.player.position).setY(1.0)
    const once = (k: string, at: number, fn: () => void) => {
      if (s.t >= at && !s.said.has(k)) {
        s.said.add(k)
        fn()
      }
    }
    if (s.beat.travel) {
      // 標識の方を向いて、目から板へスキャンの光
      rt.player.turnToward(mk.plate.x - rt.player.position.x, mk.plate.z - rt.player.position.z, dt, 8)
      const scan = Math.min(1, s.t / 0.5) * (s.t < 4.8 ? 1 : Math.max(0, 1 - (s.t - 4.8) * 3))
      mk.setScan(this.eye, scan)
      const near = Math.hypot(this.matsui.root.position.x - rt.player.position.x, this.matsui.root.position.z - rt.player.position.z) < 9
      const ore = lines2026.lines(near ? 'ido_ore' : 'ido_ore_alone')
      once('ore', 3.0, () => rt.say(ore[0].speaker, ore[0].text, 4))
      once('shout', 4.4, () => rt.say(ore[1].speaker, ore[1].text, 4))
      if (s.t > 3.0) {
        const k = Math.min(1, (s.t - 3.0) / 1.8)
        rt.oreGlow(1 + k * 1.6)
        mk.setSurge(k)
        rt.hud.setIdoGlitch(k)
        if (k > 0.2) rt.shake(0.15 * k)
        if (near && !this.walk) {
          this.matsui.setPose('wave')
          this.matsuiLook = rt.player.position
        }
      }
      once('rift', 4.9, () => {
        const tint = eraTintHex(s.beat.travel?.to === '1726' ? 1726 : 2086)
        const p = rt.player.position.clone().lerp(mk.base, 0.35)
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
        mk.setScan(null, 0)
        mk.setSurge(0)
        this.seq = null
      })
      return
    }
    // 見るだけのパネル：読み取る間（1.3 秒）は止まって石標を見る。会話が終わって少ししたら、または離れたら閉じる
    if (s.t < 1.3) rt.player.turnToward(mk.plate.x - rt.player.position.x, mk.plate.z - rt.player.position.z, dt, 8)
    once('unlock', 1.3, () => rt.setControlLocked(false))
    mk.setScan(s.t < 1.5 ? this.eye : null, s.t < 1.5 ? Math.min(1, s.t / 0.35) * Math.min(1, (1.5 - s.t) / 0.25) : 0)
    const p = rt.player.position
    const away = Math.hypot(p.x - mk.base.x, p.z - mk.base.z) > 3.4
    if ((s.talked && s.t > 2.5) || (away && s.t > 1.3) || s.t > 18) {
      rt.hud.hideIdo()
      mk.setScan(null, 0)
      rt.setControlLocked(false)
      this.seq = null
      if (rt.story.get('ido_a_seen') || rt.story.get('ido_b_seen')) rt.save(this.spawnId)
    }
  }

  hints(rt: StageRuntime): Hint[] | null {
    if (this.seq || this.busy || this.arrival === 'hover' || this.intro === 'running') return []
    const a = this.nearActor(rt)
    if (a === 'ido' || a === 'ido_b' || a === 'ido_c') return [{ key: 'F', label: 'IDO の QR を読む' }]
    if (a === 'board' || a === 'poster') return [{ key: 'F', label: (LOOKS.find((l) => l.actor === a) as (typeof LOOKS)[number]).label }]
    if (a) return [{ key: 'F', label: '話す' }]
    return this.mobs?.hints(rt) ?? null // 通行人・社員が近ければ「F：話す」
  }

  objective(rt: StageRuntime): { title: string; sub: string } {
    const o = presentObjective((n) => rt.story.get(n))
    return { title: o.title, sub: o.sub }
  }

  objectiveTarget(rt: StageRuntime): THREE.Vector3 | null {
    const f = (n: string) => rt.story.get(n)
    const o = presentObjective(f)
    if (o.target === 'matsui') return this.matsui.root.position
    if (o.target === 'saeki') return this.saeki.root.position
    if (o.target === 'ido') return this.scene.ido.base
    if (o.target === 'ido_markers') {
      // まだ読んでいない石標のうち、いちばん近いもの
      const p = rt.player.position
      let best: THREE.Vector3 | null = null
      let bd = Infinity
      for (const id of idoMarkersLeft(f)) {
        const b = this.scene.idos[id].base
        const d = Math.hypot(b.x - p.x, b.z - p.z)
        if (d < bd) {
          bd = d
          best = b
        }
      }
      return best
    }
    return null
  }

  private readonly markAt = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  private readonly marks: ObjectiveMark[] = []

  /** 目標の目印（頭の上の「！」と名前）：社長・佐伯・IDO の石標（まだ読んでいない石標はすべて。近いものだけ画面の縁にも） */
  objectiveMarkers(rt: StageRuntime): readonly ObjectiveMark[] | null {
    const f = (n: string) => rt.story.get(n)
    const o = presentObjective(f)
    const out = this.marks
    out.length = 0
    const head = (c: Character, label: string) => out.push({ pos: this.markAt[0].copy(c.root.position).setY(c.root.position.y + c.height + 0.3), label })
    if (o.target === 'matsui') head(this.matsui, 'マツイ社長')
    else if (o.target === 'saeki') head(this.saeki, '佐伯')
    else if (o.target === 'ido') out.push({ pos: this.markAt[0].copy(this.scene.ido.base).setY(1.75), label: 'IDO の石標' })
    else if (o.target === 'ido_markers') {
      const near = this.objectiveTarget(rt)
      for (const id of idoMarkersLeft(f)) {
        if (!idoMarkerVisible(id, f) || out.length >= this.markAt.length) continue
        const b = this.scene.idos[id].base
        out.push({ pos: this.markAt[out.length].copy(b).setY(1.75), label: `石標 ${id.toUpperCase()}`, edge: b === near })
      }
    }
    return out
  }

  // ---------------------------------------------------------------- 毎フレーム

  update(dt: number, _frame: ActionFrame, rt: StageRuntime): void {
    const f = (n: string) => rt.story.get(n)
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
        rt.setControlLocked(true)
        void rt.dialogue(lines2026.lines('arrive_first')).then(() => this.runApproach(rt))
      }
    }
    // セーブから：社長にまだ会っていないなら、近づくと社長のほうから
    if (this.intro === 'wait' && !this.arrival && !rt.talking && !f('met_matsui')) {
      const p = rt.player.position
      if (Math.hypot(p.x - this.matsui.root.position.x, p.z - this.matsui.root.position.z) < 6.5) void this.runApproach(rt)
    }
    this.updateNpcs(dt, rt)
    this.updateIdo(dt, rt)
    this.staff?.update(dt)
    this.mobs?.update(dt, rt, this.busy || this.seq !== null || this.arrival !== null || this.intro === 'running') // 吹き出し
    // 石標の光の輪（近いほど明るい）と、教わった石標の弱い光
    const p = rt.player.position
    for (const id of MARKER_IDS) {
      const mk = this.scene.idos[id]
      const di = Math.hypot(p.x - (mk.base.x + mk.front.x), p.z - (mk.base.z + mk.front.z))
      mk.setNear(this.seq?.marker === mk ? 1 : Math.max(0, Math.min(1, (4.5 - di) / 3)))
      mk.setBeacon(idoMarkerVisible(id, f) ? 1 : 0)
    }
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
    // 演出で追う点（電話中の社長の頭）
    if (this.intro === 'running') this.matsuiHead(this.cineLook)
  }

  animate(dt: number, t: number, rt: StageRuntime): void {
    this.scene.update(dt, t)
    this.mobs?.render(dt) // 吹き出しを頭の上へ
    const mv = this.matsuiMoving ? this.followSpeed : 0
    this.matsui.update(dt, mv)
    if (!this.matsuiMoving && this.matsuiLook === null && !this.seq) this.matsui.setPose('idle')
    this.saeki.update(dt, 0)
    // 右腕のぐらつき（2086年で外れて、落ちた衝撃でさらに緩んだ取り付け部。佐伯が直すまで）
    if (this.armLoose > 0.01 && this.shoulderR) {
      const k = this.armLoose * (0.6 + Math.min(1, rt.player.speed / 3) * 0.8)
      this.shoulderR.rotation.x += Math.sin(t * 8.3) * 0.07 * k + Math.sin(t * 13.1) * 0.025 * k
      this.shoulderR.rotation.z += Math.sin(t * 6.1 + 1.2) * 0.045 * k
    }
    // タブレット（ふわっと出る）
    if (this.tablet) {
      this.tabletK += ((this.tabletOn ? 1 : 0) - this.tabletK) * Math.min(1, dt * 6)
      this.tablet.visible = this.tabletK > 0.02
      this.tablet.scale.setScalar(0.6 + 0.4 * this.tabletK)
    }
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

  // ---------------------------------------------------------------- 撮影用ショット（?stage=2026&shot=ido|board|office|lab|street|alley）

  private readonly SHOTS = [
    { id: 'ido', cam: new THREE.Vector3(-6.1, 0.62, 8.15), target: new THREE.Vector3(-3.7, 0.95, 5.6), fov: 50, nex: [new THREE.Vector3(-4.75, 0, 6.85), new THREE.Vector3(-4.6, 0, 5.8)] as const, mat: [new THREE.Vector3(-3.35, 0, 7.45), new THREE.Vector3(-4.5, 0, 6.0)] as const, pose: 'fire' as const, focus: new THREE.Vector3(-4, 0, 6) },
    { id: 'board', cam: new THREE.Vector3(-16.4, 1.55, 18.4), target: new THREE.Vector3(-18.6, 1.6, 20.2), fov: 55, nex: [new THREE.Vector3(-17.2, 0, 19.0), new THREE.Vector3(-18.6, 0, 19.9)] as const, mat: [new THREE.Vector3(-17.4, 0, 21.0), new THREE.Vector3(-16.4, 0, 18.4)] as const, pose: 'idle' as const, focus: new THREE.Vector3(-17, 0, 20) },
    { id: 'office', cam: new THREE.Vector3(-11.2, 1.55, 11.55), target: new THREE.Vector3(-7.2, 1.25, 16.8), fov: 60, nex: [new THREE.Vector3(-9.7, 0, 13.6), new THREE.Vector3(-6.5, 0, 17)] as const, mat: [new THREE.Vector3(-9.6, 0, 15.6), new THREE.Vector3(-9.7, 0, 13.6)] as const, pose: 'walk' as const, focus: new THREE.Vector3(-9, 0, 14) },
    { id: 'lab', cam: new THREE.Vector3(-5.6, 1.6, 17.9), target: new THREE.Vector3(-14.5, 1.25, 20.8), fov: 58, nex: [new THREE.Vector3(-11.6, 0, 19.3), new THREE.Vector3(-9.3, 0, 20.9)] as const, mat: [new THREE.Vector3(-15.8, 0, 20.3), new THREE.Vector3(-11.6, 0, 19.3)] as const, pose: 'idle' as const, focus: new THREE.Vector3(-12, 0, 20) },
    { id: 'street', cam: new THREE.Vector3(17.5, 3.6, 7.6), target: new THREE.Vector3(-6, 3.2, 1.0), fov: 56, nex: [new THREE.Vector3(9.5, 0, 7.4), new THREE.Vector3(0, 0, 6)] as const, mat: [new THREE.Vector3(-8.3, 0, 9.7), new THREE.Vector3(-10.4, 0, 7.6)] as const, pose: 'walk' as const, focus: new THREE.Vector3(4, 0, 4) },
    { id: 'alley', cam: new THREE.Vector3(16.5, 1.7, 9.0), target: new THREE.Vector3(16.5, 1.1, 17.6), fov: 52, nex: [new THREE.Vector3(16.6, 0, 15.6), new THREE.Vector3(16.5, 0, 17.6)] as const, mat: [new THREE.Vector3(15.7, 0, 13.4), new THREE.Vector3(16.5, 0, 16.6)] as const, pose: 'idle' as const, focus: new THREE.Vector3(16.5, 0, 14) },
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
        hud.setObjective('IDOの石標を調べよう', '石標 A・B・C の QR を F で読む（順番は自由）')
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
      matsuiFollowing: this.following,
      matsuiPos: this.matsui.root.position.toArray().map((x) => +x.toFixed(2)),
      intro: this.intro,
      busy: this.busy,
      ido: this.seq ? { kind: this.seq.kind, t: +this.seq.t.toFixed(2) } : null,
      arrival: this.arrival,
      armLoose: this.armLoose,
      crystal: this.crystalTaken,
      fixture: this.scene.nextmake.fixture.visible,
    }
  }

  dispose(): void {
    this.disposed = true
    this.mobs?.dispose()
    this.mobs = null
    this.seq = null
    // 歩きの続き（演出の await）は再開させない
    this.walk = null
    const w = window as unknown as { __nambaDev?: unknown }
    if (w.__nambaDev) delete w.__nambaDev
  }
}
