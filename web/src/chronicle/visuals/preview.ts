// v7 の共通の見た目の単体プレビュー（chronicle-preview.html）。シェル（game/）を使わず、レンダラ・後処理・空だけで並べて見る。
// クエリ：
//   view=people|lamp|hands|slit|fx|ura|heart|shade   見るもの（既定 people）
//   act=名前              はじめに 1 回うごかす（view ごとの動き。画面右上のボタンと同じ）
//   at=秒                 その秒まで進めてから止める（撮影用。t も固定）
//   walk=1                people：その場で歩く / pose=… people：全員のポーズ / only=preset 1 人だけ大きく
//   night=1|0             夜（既定は view ごと）
//   cam=x,y,z&look=x,y,z&fov=度    好きな位置から
//   quality=low|medium|high / nohud
// window.__cv：{ act(name), view, scene, camera, stats() }。準備ができたら window.__cvReady = true
import * as THREE from 'three'
import { readParams } from '../../render/quality'
import { createRenderer, createSunRig } from '../../render/renderer'
import { createPost } from '../../render/post'
import { uTime } from '../../render/materials'
import { createSkyDome, createSkyEnvironment, EDO_SKY, type SkyPalette } from '../../render/sky'
import { setOutlineViewport } from '../../world/nexmax/materials'
import { createNexmax } from '../../world/nexmax/nexmaxModel'
import { Lamp } from './lamp'
import { createPerson, createBed, type PersonCharacter, type PersonPose, type PersonPreset } from './person'

const urlp = new URLSearchParams(location.search)
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

export const NIGHT_SKY: SkyPalette = {
  zenith: '#04071a',
  upper: '#0b1638',
  horizon: '#2c3d70',
  warm: '#5a3a70',
  ground: '#0e0e16',
  haze: '#1c2648',
  cloudLit: '#3c4c80',
  cloudShade: '#141c34',
}

type Tag = { pos: THREE.Vector3; text: string; el?: HTMLDivElement }

export type ViewCtx = {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  /** view の物を入れる（毎回作り直す） */
  root: THREE.Group
  tag(pos: THREE.Vector3, text: string): void
  setNight(on: boolean): void
  ground: THREE.Mesh
  /** シェルの rt.sky・rt.sun・rt.post にあたるもの（環境の切りかえを試す） */
  env: { sky: THREE.Mesh; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; post: ReturnType<typeof createPost> }
}

export type View = {
  label: string
  cam: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number }
  night?: boolean
  update?(dt: number, t: number): void
  actions?: Record<string, () => void>
  /** 地面を出さない（裏側など） */
  noGround?: boolean
}

type ViewFactory = (c: ViewCtx) => View | Promise<View>

// 遅延viewからの循環importがViteの別URLで評価されても、登録先と起動を共有する。
const previewState = (window as Window & { __cvState?: { views: Record<string, ViewFactory>; started: boolean } })
const state = previewState.__cvState ??= { views: {}, started: false }
const VIEWS = state.views
VIEWS.people = peopleView
VIEWS.lineup = lineupView

/** あとから足す view（lamp・hands など）を登録する */
export function registerView(name: string, f: ViewFactory): void {
  VIEWS[name] = f
}

// ------------------------------------------------------------------ people

const NAMES: Record<PersonPreset, string> = {
  towa: 'トワ',
  towaChild: '小さなトワ',
  towaMother: 'トワの母',
  chanda: 'チャンダ',
  khmerElder: '守り手のおばあさん',
  khmerVillager: '村人',
  ofuji: 'おふじさん',
}

function peopleView(c: ViewCtx): View {
  const only = urlp.get('only') as PersonPreset | null
  const forcePose = urlp.get('pose') as PersonPose | null
  const walk = urlp.get('walk') === '1'
  type Entry = { p: PersonCharacter; name: string; pose: PersonPose; x: number; z?: number; mask?: boolean; expr?: string; blade?: string }
  const list: Entry[] = []
  const add = (preset: PersonPreset, x: number, pose: PersonPose, extra: Partial<Entry> & { variant?: number; female?: boolean; lite?: boolean } = {}) => {
    const p = createPerson(preset, { variant: extra.variant, female: extra.female, lite: extra.lite })
    list.push({ p, name: extra.name ?? NAMES[preset], pose, x, z: extra.z, mask: extra.mask, expr: extra.expr, blade: extra.blade })
  }
  if (only) {
    add(only, 0, forcePose ?? 'idle')
    if (only === 'towa') add('towa', 1.0, 'kneel', { mask: false, name: 'トワ（仮面なし）' })
    if (only === 'chanda') {
      add('chanda', 0.9, 'guard', { name: 'チャンダ（構える）' })
      add('chanda', -0.9, 'laugh', { name: 'チャンダ（笑う）' })
    }
  } else {
    add('towa', -5.2, 'raiseLamp')
    add('towa', -4.2, 'kneel', { mask: false, name: 'トワ（仮面なし）', expr: 'cry' })
    add('towaChild', -3.2, 'wave')
    add('towaMother', -2.0, 'sitBed', { z: 0.4 })
    add('chanda', -0.6, 'guard', { name: 'チャンダ（構える）' })
    add('chanda', 0.3, 'laugh', { name: 'チャンダ（笑う）' })
    add('chanda', 1.2, 'idle', { name: 'チャンダ（折れた刃）', blade: 'broken', expr: 'sad' })
    add('khmerElder', 2.2, 'cane')
    add('khmerVillager', 3.1, 'idle', { variant: 0, female: false })
    add('khmerVillager', 3.8, 'pray', { variant: 1, female: true })
    add('khmerVillager', 4.5, 'idle', { variant: 2, female: false, lite: true, name: '村人（軽い）' })
    add('khmerVillager', 5.2, 'wave', { variant: 3, female: true })
    add('ofuji', 6.2, 'crank')
  }
  const lamps: Lamp[] = []
  let bed: ReturnType<typeof createBed> | null = null
  for (const e of list) {
    c.root.add(e.p.root)
    e.p.root.position.set(e.x, 0, e.z ?? 0)
    e.p.setPose(forcePose ?? e.pose)
    if (e.p.preset === 'towa' && e.mask !== false) {
      const lamp = new Lamp(c.root, { scale: 1.3, light: true })
      e.p.holdLamp(lamp)
      lamps.push(lamp)
    }
    if (e.mask === false) e.p.setMask(false)
    if (e.expr) e.p.setExpression(e.expr as never)
    if (e.blade) e.p.setBlade(e.blade as never)
    if (e.p.preset === 'towaMother' && (forcePose ?? e.pose) === 'sitBed') {
      bed = createBed()
      bed.root.position.set(e.x, 0, (e.z ?? 0) + 0.0)
      c.root.add(bed.root)
      e.p.root.position.copy(bed.hipSpot).add(bed.root.position)
      e.p.setExpression('sad')
      e.p.lookAt(v3(e.x - 1.2, 1.15, -0.4))
    }
    c.tag(e.p.root.position.clone().setY(e.p.root.position.y + e.p.headTop + 0.12), e.name)
  }
  const nx = createNexmax(1.05)
  nx.root.position.set(only ? -1.1 : 7.2, 0, 0)
  if (!only) c.root.add(nx.root)
  const cam = only ? { pos: v3(0.2, 1.15, -3.6), look: v3(0, 0.95, 0), fov: 38 } : { pos: v3(0.6, 1.9, -15), look: v3(0.6, 0.85, 0), fov: 46 }
  return {
    label: `人の形：${list.map((e) => e.name).join('・')}`,
    cam,
    update(dt, t) {
      lamps.forEach(lamp => lamp.update(dt, t))
      for (const e of list) e.p.update(dt, walk ? 1.4 : 0)
      nx.update(dt, 0)
      void bed
    },
    actions: {
      walk: () => list.forEach((e) => e.p.setPose('walk')),
      mask: () => list.forEach((e) => e.p.setMask(!e.p.masked)),
      laugh: () => list.forEach((e) => e.p.setPose('laugh')),
    },
  }
}

/** 同じ足元・同じ奥行き・同じ画面内身長で材質と輪郭を比べる。distance=game で実プレイ距離。 */
function lineupView(c: ViewCtx): View {
  const presets: PersonPreset[] = ['towa', 'towaChild', 'towaMother', 'chanda', 'khmerElder', 'ofuji', 'khmerVillager']
  const selected = urlp.get('only') as PersonPreset | null
  const people = (selected ? [selected] : presets).map((preset, i) => {
    const p = createPerson(preset, { height: 1.5 })
    p.setPose('idle')
    p.update(1, 0)
    p.root.position.x = selected ? 0.55 : (i - 2.5) * 0.82
    c.root.add(p.root)
    c.tag(v3(p.root.position.x, 1.9, 0), NAMES[preset])
    return p
  })
  const nx = createNexmax(1.5)
  nx.root.position.x = selected ? -0.55 : -3.1
  c.root.add(nx.root)
  c.tag(v3(nx.root.position.x, 1.9, 0), 'ネクマックス')
  // 髪飾りを含む外形の高さも揃え、照明と材質を等条件で見る。
  for (const p of people) {
    const bounds = new THREE.Box3().setFromObject(p.root)
    const k = 1.5 / (bounds.max.y - bounds.min.y)
    p.root.scale.setScalar(k)
    p.root.position.y = -bounds.min.y * k
  }
  const game = urlp.get('distance') === 'game'
  return {
    label: '人物とネクマックス：同じ照明・奥行き・外形の高さ（1.5m） / distance=game',
    cam: { pos: v3(0, 1.5, game ? -11 : selected ? -3.8 : -8.5), look: v3(0, 0.85, 0), fov: 42 },
    update(dt) { people.forEach(p => p.update(dt, 0)); nx.update(dt, 0) },
  }
}

// ------------------------------------------------------------------ 本体

declare global {
  interface Window {
    __cvReady?: boolean
    __cv?: unknown
  }
}

async function main(): Promise<void> {
  const app = document.getElementById('app') as HTMLDivElement
  const label = document.getElementById('cv-label') as HTMLDivElement
  const tagsEl = document.getElementById('cv-tags') as HTMLDivElement
  const nav = document.getElementById('cv-nav') as HTMLDivElement
  const { quality: q } = readParams()
  const renderer = createRenderer(app, q)
  const size = () => ({ w: app.clientWidth || window.innerWidth, h: app.clientHeight || window.innerHeight })
  const camera = new THREE.PerspectiveCamera(50, size().w / size().h, 0.05, 2500)
  const scene = new THREE.Scene()
  scene.add(camera)
  const sunDir = v3(0.35, 0.85, -0.55).normalize()
  const sky = createSkyDome(EDO_SKY, sunDir)
  scene.add(sky)
  const dayEnv = createSkyEnvironment(renderer, EDO_SKY, sunDir)
  const nightEnv = createSkyEnvironment(renderer, NIGHT_SKY, sunDir)
  const rig = createSunRig(scene, q, sunDir)
  const post = createPost(renderer, scene, camera, q)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#9aa58a', roughness: 0.95 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const grid = new THREE.GridHelper(40, 40, '#6a7462', '#7d886e')
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.35
  grid.position.y = 0.002
  scene.add(grid)
  const setNight = (on: boolean) => {
    const pal = on ? NIGHT_SKY : EDO_SKY
    const u = (sky.material as THREE.ShaderMaterial).uniforms
    const set = (k: string, col: THREE.ColorRepresentation) => (u[k].value as THREE.Color).set(col)
    set('uZenith', pal.zenith)
    set('uUpper', pal.upper)
    set('uHorizon', pal.horizon)
    set('uWarm', pal.warm)
    set('uGround', pal.ground)
    set('uHaze', pal.haze)
    set('uCloudLit', pal.cloudLit)
    set('uCloudShade', pal.cloudShade)
    u.uSunStrength.value = on ? 0.05 : 1
    scene.environment = on ? nightEnv : dayEnv
    scene.environmentIntensity = on ? 0.35 : 0.75
    rig.sun.intensity = on ? 0.55 : 3.6
    rig.sun.color.set(on ? '#8aa0ff' : '#ffd09a')
    rig.hemi.intensity = on ? 0.55 : 0.45
    rig.hemi.color.set(on ? '#5a6ab0' : '#a9cdf5')
    rig.hemi.groundColor.set(on ? '#2a2038' : '#a5744a')
    ;(ground.material as THREE.MeshStandardMaterial).color.set(on ? '#3a3f4e' : '#9aa58a')
    post.grade.set('gExposure', on ? 1.15 : 1.0)
    scene.fog = on ? new THREE.FogExp2('#141a34', 0.012) : null
  }

  const viewName = urlp.get('view') ?? 'people'
  // 遅れて読み込む view
  if (!VIEWS[viewName]) {
    try {
      await import('./previewViews')
    } catch (e) {
      console.warn('[cv] previewViews を読めない', e)
    }
  }
  const root = new THREE.Group()
  root.name = 'view'
  scene.add(root)
  const tags: Tag[] = []
  const ctx: ViewCtx = {
    scene,
    camera,
    renderer,
    root,
    tag: (pos, text) => tags.push({ pos: pos.clone(), text }),
    setNight,
    ground,
    env: { sky, sun: rig.sun, hemi: rig.hemi, post },
  }
  const factory = VIEWS[viewName] ?? VIEWS.people
  // 夜の view は先に夜にしておく（view の中で環境を覚えるものがあるため）
  const preNight = urlp.has('night') ? urlp.get('night') === '1' : ['lamp', 'hands', 'slit', 'fx', 'ura', 'heart', 'shade'].includes(viewName)
  setNight(preNight)
  const view = await factory(ctx)
  const night = urlp.has('night') ? urlp.get('night') === '1' : (view.night ?? false)
  if (night !== preNight) setNight(night)
  if (view.noGround) {
    ground.visible = false
    grid.visible = false
  }
  const vec = (k: string) => {
    const a = (urlp.get(k) ?? '').split(',').map(Number)
    return a.length === 3 && a.every(Number.isFinite) ? new THREE.Vector3(a[0], a[1], a[2]) : null
  }
  camera.position.copy(vec('cam') ?? view.cam.pos)
  camera.fov = Number(urlp.get('fov') ?? view.cam.fov ?? 50)
  camera.updateProjectionMatrix()
  const look = vec('look') ?? view.cam.look
  camera.lookAt(look)
  rig.follow(look)
  label.textContent = view.label
  if (urlp.has('nohud')) {
    label.style.display = 'none'
    nav.style.display = 'none'
  }
  for (const name of Object.keys(view.actions ?? {})) {
    const b = document.createElement('button')
    b.textContent = name
    b.onclick = () => view.actions?.[name]()
    nav.appendChild(b)
  }
  for (const n of Object.keys(VIEWS).concat(['lamp', 'hands', 'slit', 'fx', 'ura', 'heart', 'shade']).filter((x, i, a) => a.indexOf(x) === i)) {
    const a = document.createElement('a')
    a.href = `?view=${n}`
    a.textContent = n
    nav.appendChild(a)
  }
  for (const t of tags) {
    const el = document.createElement('div')
    el.textContent = t.text
    tagsEl.appendChild(el)
    t.el = el
  }
  if (urlp.has('notag')) tagsEl.style.display = 'none'

  const resize = () => {
    const { w, h } = size()
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
    post.setSize(w, h)
    setOutlineViewport(renderer.getDrawingBufferSize(new THREE.Vector2()).y)
  }
  window.addEventListener('resize', resize)
  resize()

  const act = urlp.get('act')
  if (act) view.actions?.[act]?.()
  const at = urlp.has('at') ? Number(urlp.get('at')) : null
  let simT = 0
  const step = (dt: number) => {
    simT += dt
    uTime.value += dt
    view.update?.(dt, simT)
  }
  if (at !== null) for (let k = 0; k < at; k += 1 / 30) step(1 / 30)
  await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 8000))])

  const timer = new THREE.Timer()
  timer.connect(document)
  const stats = { calls: 0, tris: 0 }
  const tmp = new THREE.Vector3()
  window.__cv = {
    scene,
    camera,
    view,
    act: (n: string) => view.actions?.[n]?.(),
    step: (sec: number) => {
      for (let k = 0; k < sec; k += 1 / 30) step(1 / 30)
    },
    /** 本体だけを小さい描画先へ実描画する（影・後処理を除く）。持っている小道具も含める。 */
    personStats: () => {
      const result: { preset: string; calls: number; triangles: number }[] = []
      const target = new THREE.WebGLRenderTarget(8, 8)
      const previousTarget = renderer.getRenderTarget()
      const shadows = renderer.shadowMap.enabled
      const measure = new THREE.Scene()
      measure.add(rig.sun.clone(), rig.hemi.clone())
      renderer.shadowMap.enabled = false
      renderer.setRenderTarget(target)
      try {
        for (const person of root.children) {
          if (!(person.name in NAMES)) continue
          const copy = person.clone()
          copy.traverse(o => { o.frustumCulled = false })
          measure.add(copy)
          renderer.info.reset()
          renderer.render(measure, camera)
          result.push({ preset: person.name, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles })
          measure.remove(copy)
        }
      } finally {
        renderer.setRenderTarget(previousTarget)
        renderer.shadowMap.enabled = shadows
        target.dispose()
      }
      return result
    },
    stats: () => ({ ...stats, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0 }),
  }
  let frames = 0
  renderer.setAnimationLoop(() => {
    timer.update()
    const dt = Math.min(timer.getDelta(), 0.05)
    if (at === null) step(dt)
    renderer.info.reset()
    post.render(dt)
    stats.calls = renderer.info.render.calls
    stats.tris = renderer.info.render.triangles
    const { w, h } = size()
    for (const t of tags) {
      tmp.copy(t.pos).project(camera)
      if (!t.el) continue
      t.el.style.display = tmp.z < 1 ? '' : 'none'
      t.el.style.left = `${(tmp.x * 0.5 + 0.5) * w}px`
      t.el.style.top = `${(-tmp.y * 0.5 + 0.5) * h}px`
    }
    if (++frames === 3) {
      window.__cvReady = true
      if (at !== null) renderer.setAnimationLoop(null)
    }
  })
}

if (!state.started) {
  state.started = true
  void main()
}
