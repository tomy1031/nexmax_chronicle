// ネクマックスの単体プレビュー（nexmax-preview.html）。スクリーンショット比較用。
// クエリ:
//   view=turnaround | poses | single | expressions | walk
//   pose=run など（single）、angle=度（single のカメラ角。0 = 正面）、t=秒（その時刻で止める）
//   light=studio | game、spin=1（ターンテーブル）、h=身長(m)、pr=ピクセル比、cam=behind|front|side（poses）
//   outline=輪郭の太さ（m @4m）、expr=表情
import * as THREE from 'three'
import { loadHDRIEnvironment } from '../../render/sky'
import { NX_COLORS, OUTLINE } from './materials'
import { createNexmax, type NexmaxCharacter, type NexmaxExpression, type NexmaxPose } from './nexmaxModel'

const q = new URLSearchParams(location.search)
const view = q.get('view') ?? 'turnaround'
const light = q.get('light') ?? (view === 'poses' || view === 'walk' ? 'game' : 'studio')
const H = Number(q.get('h') ?? 1.2)
const freezeT = q.has('t') ? Number(q.get('t')) : null
const spin = q.get('spin') === '1'
if (q.has('outline')) OUTLINE.width.value = Number(q.get('outline'))
if (q.has('body')) NX_COLORS.body = '#' + q.get('body')

const app = document.getElementById('app')!
const hud = document.getElementById('hud')!
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Number(q.get('pr') ?? Math.min(2, window.devicePixelRatio)))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
app.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(20, window.innerWidth / window.innerHeight, 0.05, 200)

// ------------------------------------------------------------------ 光

function setupLights(): void {
  if (light === 'game') {
    scene.background = new THREE.Color('#a9cdee')
    const sun = new THREE.DirectionalLight('#ffd09a', 4.0)
    sun.position.set(-6, 9, -5)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const c = sun.shadow.camera
    c.left = -7
    c.right = 7
    c.top = 5
    c.bottom = -5
    c.near = 1
    c.far = 40
    sun.shadow.bias = -0.0004
    sun.shadow.normalBias = 0.02
    scene.add(sun)
    scene.add(new THREE.HemisphereLight('#a9cdf5', '#a5744a', 0.4))
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: '#b9a58a', roughness: 0.95 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
  } else {
    scene.background = new THREE.Color('#dfdfe0')
    scene.add(new THREE.HemisphereLight('#e8f3ff', '#c4c4c8', 1.0))
    const key = new THREE.DirectionalLight('#ffffff', 2.3)
    key.position.set(3, 6, -6)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const c = key.shadow.camera
    c.left = -4
    c.right = 4
    c.top = 3
    c.bottom = -3
    c.near = 1
    c.far = 30
    key.shadow.bias = -0.0004
    key.shadow.normalBias = 0.02
    key.shadow.radius = 6
    scene.add(key)
    const fill = new THREE.DirectionalLight('#eef4ff', 0.9)
    fill.position.set(-5, 2, -4)
    scene.add(fill)
    const rim = new THREE.DirectionalLight('#ffffff', 0.9)
    rim.position.set(0, 4, 6)
    scene.add(rim)
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: '#30343a', opacity: 0.16 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
  }
}
setupLights()
loadHDRIEnvironment(renderer, './hdri/kloppenheim_06_puresky_1k.hdr').then((env) => {
  if (env) {
    scene.environment = env
    scene.environmentIntensity = light === 'game' ? 0.75 : 0.45
  }
  ready = true
})
let ready = false

// ------------------------------------------------------------------ 配置

type Inst = {
  ch: NexmaxCharacter
  pose: NexmaxPose
  aim?: THREE.Vector3
  swing?: boolean
  label?: string
  labelY?: number
  claw?: [number, number]
}
const insts: Inst[] = []

function add(pose: NexmaxPose, x: number, z: number, yaw: number, label?: string): Inst {
  const ch = createNexmax(H)
  ch.root.position.set(x, 0, z)
  ch.root.rotation.y = yaw
  ch.setPose(pose)
  if (q.has('expr')) ch.setExpression(q.get('expr') as NexmaxExpression)
  scene.add(ch.root)
  const inst: Inst = { ch, pose, label }
  insts.push(inst)
  return inst
}

/** ワイヤー系のポーズの小道具（狙い・爪・振り子）。狙いはキャラの向きに合わせたローカル座標で決める */
function rigProps(inst: Inst): void {
  const r = inst.ch.root
  r.updateMatrixWorld(true)
  switch (inst.pose) {
    case 'hold':
    case 'fire':
      inst.aim = r.localToWorld(new THREE.Vector3(0.4, 1.3, -4))
      inst.claw = [inst.pose === 'hold' ? 0 : 1, 1]
      break
    case 'pulled':
      inst.aim = r.localToWorld(new THREE.Vector3(0.2, 3.2, -4))
      inst.claw = [0, 1]
      break
    case 'swing':
      inst.aim = r.localToWorld(new THREE.Vector3(0, 3.4, 0.6))
      inst.swing = true
      inst.claw = [0, 1]
      break
  }
  if (inst.aim) inst.ch.setAim(inst.aim)
  if (inst.claw) inst.ch.setClaw(inst.claw[0], inst.claw[1])
}

const labels: { el: HTMLDivElement; inst: Inst }[] = []
function addLabel(inst: Inst): void {
  if (!inst.label) return
  const el = document.createElement('div')
  el.className = 'label'
  el.textContent = inst.label
  document.body.appendChild(el)
  labels.push({ el, inst })
}

const target = new THREE.Vector3()
if (view === 'turnaround') {
  // 見本（1672×941）と同じ並び・縮尺：左から正面・側面（顔が右）・背面。
  // カメラは -Z 側から +Z を見る（画面の右 = -X）。全高 1.2m が画像の高さの 731/941 になる画角。
  const gap = 506 * (1.2 / 731)
  const cx = (333 + 1346) / 2 - 1672 / 2
  const shift = cx * (1.2 / 731)
  add('idle', gap - shift, 0, 0)
  add('idle', -shift, 0, Math.PI / 2)
  add('idle', -gap - shift, 0, Math.PI)
  const yc = (848 - 941 / 2) * (1.2 / 731)
  target.set(0, yc, 0)
  camera.fov = 12
  const visH = 1.2 * (941 / 731)
  camera.position.set(0, yc, -(visH / 2) / Math.tan(THREE.MathUtils.degToRad(6)))
} else if (view === 'poses' || view === 'walk') {
  const list = (q.get('list') ?? (view === 'walk' ? 'idle,walk,run,dash' : 'run,jump,swing,pulled,hold,fire,dash,fall,land,wave')).split(',') as NexmaxPose[]
  const gap = 1.25
  const cam = q.get('cam') ?? 'behind'
  list.forEach((p, i) => {
    const x = (i - (list.length - 1) / 2) * gap * (cam === 'behind' ? 1 : -1)
    // side：カメラは正面側のまま、キャラを右向き（画面の右 = -X）に回して横顔を見せる
    const inst = add(p, x, 0, cam === 'side' ? Math.PI / 2 : 0, p)
    rigProps(inst)
    addLabel(inst)
  })
  const span = list.length * gap
  target.set(0, 0.55, 0)
  camera.fov = 24
  const dist = Math.max(5, span * 1.45)
  if (cam === 'front' || cam === 'side') camera.position.set(0, 1.3, -dist)
  else camera.position.set(0, 2.4, dist)
} else if (view === 'expressions') {
  const list: NexmaxExpression[] = ['happy', 'determined', 'worried', 'surprised']
  list.forEach((e, i) => {
    const inst = add('idle', (1.5 - i) * 0.85, 0, 0, e)
    inst.ch.setExpression(e)
    inst.ch.autoExpression = false
    inst.labelY = 0.62
    addLabel(inst)
  })
  target.set(0, 0.84, 0)
  camera.fov = 16
  camera.position.set(0, 0.95, -4.8)
} else {
  const pose = (q.get('pose') ?? 'idle') as NexmaxPose
  const inst = add(pose, 0, 0, 0)
  rigProps(inst)
  const ang = THREE.MathUtils.degToRad(Number(q.get('angle') ?? 0))
  const dist = Number(q.get('dist') ?? 5.2)
  const camY = Number(q.get('camy') ?? 0.75)
  target.set(0, Number(q.get('ty') ?? 0.6), 0)
  camera.fov = 22
  // angle=0 で正面（キャラは -Z を向くのでカメラは -Z 側）
  camera.position.set(-Math.sin(ang) * dist, camY, -Math.cos(ang) * dist)
}
camera.lookAt(target)
camera.updateProjectionMatrix()

// ------------------------------------------------------------------ ループ

const stats = insts[0].ch.stats()
if (q.get('debug') === '1') {
  const rows: string[] = []
  insts[0].ch.root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    const g = m.geometry
    const n = (g.index ? g.index.count : g.attributes.position.count) / 3
    rows.push(`${m.name}: ${n}`)
  })
  console.log('[nexmax] meshes\n' + rows.join('\n'))
}
let simT = 0
const STEP = 1 / 60

function step(dt: number): void {
  simT += dt
  for (const inst of insts) {
    if (inst.swing) inst.ch.setSwing(Math.sin(simT * 2.2) * 0.45)
    const sp = inst.pose === 'walk' ? 2.4 : inst.pose === 'run' ? 5.0 : inst.pose === 'dash' ? 6.4 : 0
    inst.ch.update(dt, sp)
  }
  if (spin) for (const inst of insts) inst.ch.root.rotation.y += dt * 0.6
}

if (freezeT !== null) {
  const n = Math.round(freezeT / STEP)
  for (let i = 0; i < n; i++) step(STEP)
}

// ------------------------------------------------------------------ 狙いの確認（?aimline=1）
// 射出口（handAnchor）から前腕の軸（ローカル -Y）方向へ伸ばした線（水色）と、射出口→狙いの線（橙）、狙いの印（赤）。
// 2 本の線が重なれば、爪は狙いへまっすぐ出ている。window.__aimCheck() で角度（度）を返す。
const aimLines: Array<{ inst: Inst; axis: THREE.Line; toAim: THREE.Line }> = []
if (q.get('aimline') === '1') {
  for (const inst of insts) {
    if (!inst.aim) continue
    const mk = (color: string) => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, depthTest: false }))
      l.renderOrder = 999
      l.frustumCulled = false
      scene.add(l)
      return l
    }
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3040' }))
    marker.position.copy(inst.aim)
    scene.add(marker)
    aimLines.push({ inst, axis: mk('#38e8ff'), toAim: mk('#ff9a30') })
  }
}
function muzzleRay(inst: Inst): { pos: THREE.Vector3; dir: THREE.Vector3 } {
  const a = inst.ch.handAnchor
  a.updateWorldMatrix(true, false)
  const pos = new THREE.Vector3().setFromMatrixPosition(a.matrixWorld)
  const dir = new THREE.Vector3(0, -1, 0).transformDirection(a.matrixWorld)
  return { pos, dir }
}
function updateAimLines(): void {
  for (const { inst, axis, toAim } of aimLines) {
    const { pos, dir } = muzzleRay(inst)
    const len = inst.aim ? pos.distanceTo(inst.aim) : 1
    const pa = axis.geometry.attributes.position as THREE.BufferAttribute
    pa.setXYZ(0, pos.x, pos.y, pos.z)
    pa.setXYZ(1, pos.x + dir.x * len, pos.y + dir.y * len, pos.z + dir.z * len)
    pa.needsUpdate = true
    const pb = toAim.geometry.attributes.position as THREE.BufferAttribute
    pb.setXYZ(0, pos.x, pos.y, pos.z)
    if (inst.aim) pb.setXYZ(1, inst.aim.x, inst.aim.y, inst.aim.z)
    pb.needsUpdate = true
  }
}
;(window as unknown as { __aimCheck: () => unknown }).__aimCheck = () =>
  insts
    .filter((i) => i.aim)
    .map((inst) => {
      const { pos, dir } = muzzleRay(inst)
      const want = inst.aim!.clone().sub(pos).normalize()
      return { pose: inst.pose, deg: +THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.max(-1, dir.dot(want))))).toFixed(1) }
    })

function placeLabels(): void {
  const v = new THREE.Vector3()
  for (const { el, inst } of labels) {
    v.copy(inst.ch.root.position)
    v.y = inst.labelY ?? -0.12
    v.project(camera)
    el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`
    el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`
  }
}

let last = performance.now()
let frames = 0
renderer.setAnimationLoop(() => {
  const now = performance.now()
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (freezeT === null) step(dt)
  updateAimLines()
  renderer.render(scene, camera)
  placeLabels()
  frames++
  if (frames % 15 === 1 || !ready) {
    const s = insts[0].ch.stats()
    hud.textContent = `Nexmax 1体: ${s.drawCalls} draw calls / ${s.triangles.toLocaleString()} tris（初期 ${stats.drawCalls}/${stats.triangles.toLocaleString()}）\n画面全体: ${renderer.info.render.calls} calls / ${renderer.info.render.triangles.toLocaleString()} tris（影パス込み）  env:${ready ? 'ok' : '…'}`
  }
  if (ready && frames > 30) document.title = 'ready'
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})
