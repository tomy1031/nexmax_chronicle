// キャラクター読み込み：public/models/<name>.glb があれば GLTFLoader（+meshopt）で読み、
// 足元を原点・-Z 向きに正規化して影を有効化、アニメーションがあれば AnimationMixer で再生。
// 無ければ、コンセプトのシルエットに合わせた「なめらかな形の仮モデル」を組み立てる。
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { drawGear, makeCanvas } from '../render/textures'

export type CharacterName = 'nexmax' | 'genbei' | 'oharu'
export type Pose = 'idle' | 'walk' | 'hold' | 'crank' | 'wave'

export interface Character {
  name: CharacterName
  root: THREE.Group
  placeholder: boolean
  height: number
  /** ビームの始点（ネクマックスの手元） */
  handAnchor: THREE.Object3D
  setPose(p: Pose): void
  /** 腕を向けるワールド座標（hold 用）。null で解除 */
  setAim(target: THREE.Vector3 | null): void
  update(dt: number, moveSpeed: number): void
}

const loader = new GLTFLoader()
loader.setMeshoptDecoder(MeshoptDecoder)

export async function loadCharacter(name: CharacterName, targetHeightMeters: number): Promise<Character> {
  const url = `./models/${name}.glb`
  try {
    const head = await fetch(url, { method: 'HEAD' })
    const type = head.headers.get('content-type') ?? ''
    if (head.ok && !type.includes('text/html')) {
      const gltf = await loader.loadAsync(url)
      return fromGLTF(name, gltf.scene, gltf.animations, targetHeightMeters)
    }
  } catch (e) {
    console.warn(`[characters] ${url} を読めなかったので仮モデルを使います`, e)
  }
  return placeholder(name, targetHeightMeters)
}

// ------------------------------------------------------------------ GLB

function fromGLTF(name: CharacterName, scene: THREE.Object3D, clips: THREE.AnimationClip[], h: number): Character {
  const root = new THREE.Group()
  root.name = name
  const inner = new THREE.Group()
  // glTF は +Z が正面 → -Z 向きにそろえる
  inner.rotation.y = Math.PI
  inner.add(scene)
  root.add(inner)
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const s = size.y > 0 ? h / size.y : 1
  scene.scale.setScalar(s)
  scene.updateMatrixWorld(true)
  box.setFromObject(scene)
  const center = box.getCenter(new THREE.Vector3())
  scene.position.x -= center.x
  scene.position.z -= center.z
  scene.position.y -= box.min.y
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        const sm = mat as THREE.MeshStandardMaterial
        if (sm.map) sm.map.anisotropy = 8
      }
    }
  })
  const mixer = clips.length ? new THREE.AnimationMixer(scene) : null
  const find = (re: RegExp) => clips.find((c) => re.test(c.name.toLowerCase()))
  const idle = find(/idle|stand|breath/) ?? clips[0]
  const walk = find(/walk|run|move/)
  let current: THREE.AnimationAction | null = null
  const play = (clip: THREE.AnimationClip | undefined) => {
    if (!mixer || !clip) return
    const a = mixer.clipAction(clip)
    if (current === a) return
    a.reset().fadeIn(0.25).play()
    if (current) current.fadeOut(0.25)
    current = a
  }
  play(idle)
  const hand = new THREE.Object3D()
  hand.position.set(0.18 * (h / 1.05), 0.55 * (h / 1.05), -0.25 * (h / 1.05))
  root.add(hand)
  let t = 0
  let pose: Pose = 'idle'
  return {
    name,
    root,
    placeholder: false,
    height: h,
    handAnchor: hand,
    setPose(p) {
      pose = p
    },
    setAim() {},
    update(dt, speed) {
      t += dt
      if (mixer) {
        play(speed > 0.3 && walk ? walk : idle)
        if (current && walk && current.getClip() === walk) current.timeScale = Math.max(0.6, speed / 2.2)
        mixer.update(dt)
      } else {
        // クリップが無い場合の簡易な揺れ
        inner.position.y = Math.abs(Math.sin(t * 9)) * 0.04 * Math.min(1, speed / 3)
        inner.rotation.z = Math.sin(t * 2) * 0.02 + Math.sin(t * 9) * 0.03 * Math.min(1, speed / 3)
        if (pose === 'hold') inner.rotation.x = 0.08
      }
    },
  }
}

// ------------------------------------------------------------------ 仮モデル共通

function plastic(color: string, rough = 0.32): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color, roughness: rough, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.18 })
}
function cloth(color: string, map?: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.88, map: map ?? null })
}
function skin(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: '#f2c4a0', roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffb59a') })
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx): THREE.Mesh {
  const o = new THREE.Mesh(g, m)
  o.position.set(x, y, z)
  o.scale.set(sx, sy, sz)
  o.castShadow = true
  o.receiveShadow = true
  return o
}

function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, seg = 28): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), m, x, y, z, sx, sy, sz)
}

function capsule(r: number, len: number, m: THREE.Material): THREE.Mesh {
  return mesh(new THREE.CapsuleGeometry(r, len, 6, 18), m)
}

function canvasTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

/** リグの各ノード直下のメッシュを、マテリアルごとに 1 つへ結合（ドローコール削減） */
function mergeRig(root: THREE.Object3D): void {
  const groups: THREE.Object3D[] = []
  root.traverse((o) => {
    if (o.children.some((ch) => (ch as THREE.Mesh).isMesh && ch.children.length === 0)) groups.push(o)
  })
  for (const g of groups) {
    const byMat = new Map<THREE.Material, THREE.Mesh[]>()
    for (const ch of g.children) {
      const m = ch as THREE.Mesh
      if (!m.isMesh || m.children.length) continue
      const mat = m.material as THREE.Material
      const list = byMat.get(mat) ?? []
      list.push(m)
      byMat.set(mat, list)
    }
    for (const [mat, list] of byMat) {
      if (list.length < 2) continue
      const geos = list.map((m) => {
        m.updateMatrix()
        let geo = m.geometry.clone()
        for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name)
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
        if (geo.index) geo = geo.toNonIndexed()
        geo.applyMatrix4(m.matrix)
        return geo
      })
      const merged = mergeGeometries(geos, false)
      if (!merged) continue
      const mm = new THREE.Mesh(merged, mat)
      mm.castShadow = true
      mm.receiveShadow = true
      for (const m of list) g.remove(m)
      g.add(mm)
    }
  }
}

/** 背面法線押し出しの輪郭線 */
function addOutline(root: THREE.Object3D, thickness: number, color: string, recursive = true, self = false): void {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${thickness.toFixed(4)};`)
  }
  mat.customProgramCacheKey = () => `outline-${thickness}`
  const list: THREE.Mesh[] = []
  const visit = (o: THREE.Object3D) => {
    const m = o as THREE.Mesh
    if (m.isMesh && !m.userData.noOutline) list.push(m)
  }
  if (self) visit(root)
  else if (recursive) root.traverse(visit)
  else root.children.forEach(visit)
  for (const m of list) {
    const o = new THREE.Mesh(m.geometry, mat)
    o.castShadow = false
    o.receiveShadow = false
    o.userData.noOutline = true
    // 親の拡大に合わせて押し出し量を補正（非等方の拡大はおおよそ）
    m.add(o)
  }
}

type Rig = {
  root: THREE.Group
  body: THREE.Group
  head: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  hand: THREE.Object3D
  baseY: number
}

function placeholder(name: CharacterName, h: number): Character {
  const rig = name === 'nexmax' ? buildNexmax() : name === 'genbei' ? buildGenbei() : buildOharu()
  const root = new THREE.Group()
  root.name = name
  const natural = name === 'nexmax' ? 1.05 : name === 'genbei' ? 1.6 : 1.25
  rig.root.scale.setScalar(h / natural)
  root.add(rig.root)
  let pose: Pose = name === 'genbei' ? 'crank' : name === 'oharu' ? 'wave' : 'idle'
  let t = Math.random() * 10
  let walkPhase = 0
  let aim: THREE.Vector3 | null = null
  rig.armL.rotation.order = 'YXZ'
  rig.armR.rotation.order = 'YXZ'
  const tmp = new THREE.Vector3()
  const inv = new THREE.Matrix4()
  const aimAngles = (arm: THREE.Group): [number, number] => {
    if (!aim) return [0, 0]
    root.updateMatrixWorld(true)
    arm.parent?.updateMatrixWorld(true)
    inv.copy((arm.parent as THREE.Object3D).matrixWorld).invert()
    tmp.copy(aim).applyMatrix4(inv).sub(arm.position)
    const yaw = Math.max(-1.3, Math.min(1.3, Math.atan2(-tmp.x, -tmp.z)))
    const pitch = Math.atan2(tmp.y, Math.hypot(tmp.x, tmp.z))
    return [yaw, pitch]
  }
  return {
    name,
    root,
    placeholder: true,
    height: h,
    handAnchor: rig.hand,
    setPose(p) {
      pose = p
    },
    setAim(target) {
      aim = target ? target.clone() : null
    },
    update(dt, speed) {
      t += dt
      const moving = speed > 0.3 && pose !== 'hold'
      const k = Math.min(1, speed / 4)
      walkPhase += dt * (moving ? 6 + speed * 1.6 : 0)
      const s = Math.sin(walkPhase)
      const breath = Math.sin(t * 2.2)
      rig.body.position.y = rig.baseY + (moving ? Math.abs(Math.cos(walkPhase)) * 0.035 * (0.5 + k) : breath * 0.006)
      rig.body.rotation.set(0, 0, 0)
      rig.head.rotation.set(0, 0, 0)
      rig.armL.rotation.set(0, 0, -0.12)
      rig.armR.rotation.set(0, 0, 0.12)
      rig.legL.rotation.set(0, 0, 0)
      rig.legR.rotation.set(0, 0, 0)
      if (pose === 'hold') {
        // 両腕を対象へ突き出して踏ん張る
        const [yl, pl] = aimAngles(rig.armL)
        const [yr, pr] = aimAngles(rig.armR)
        const shake = Math.sin(t * 14) * 0.015
        rig.armL.rotation.set(Math.PI / 2 + pl + shake, yl + 0.12, 0)
        rig.armR.rotation.set(Math.PI / 2 + pr + shake, yr - 0.08, 0)
        rig.legL.rotation.set(0.5, 0, -0.12)
        rig.legR.rotation.set(-0.55, 0, 0.12)
        rig.body.rotation.x = 0.1
        rig.body.position.y = rig.baseY - 0.05 + Math.sin(t * 14) * 0.004
        rig.head.rotation.set(-0.05, -0.38, 0.06)
      } else if (pose === 'crank') {
        const c = Math.sin(t * 1.6)
        rig.armL.rotation.set(1.3 + c * 0.2, 0.2, 0)
        rig.armR.rotation.set(1.15 - c * 0.2, -0.2, 0)
        rig.body.rotation.x = -0.32 - c * 0.04
        rig.body.position.y = rig.baseY - 0.16
        rig.legL.rotation.set(0.75, 0, -0.1)
        rig.legR.rotation.set(-0.55, 0, 0.1)
        rig.head.rotation.x = 0.25
      } else if (pose === 'wave') {
        rig.armR.rotation.set(-0.2, 0, 2.6 + Math.sin(t * 4) * 0.3)
        rig.armL.rotation.set(0.6, -0.3, -0.4)
        rig.body.rotation.z = Math.sin(t * 2) * 0.04
        rig.head.rotation.z = Math.sin(t * 2 + 0.5) * 0.08
      } else if (moving) {
        rig.legL.rotation.x = s * 0.75 * (0.6 + k)
        rig.legR.rotation.x = -s * 0.75 * (0.6 + k)
        rig.armL.rotation.x = -s * 0.7 * (0.6 + k)
        rig.armR.rotation.x = s * 0.7 * (0.6 + k)
        rig.body.rotation.x = -0.08 - k * 0.1
        rig.body.rotation.z = s * 0.04
      } else {
        rig.head.rotation.y = Math.sin(t * 0.7) * 0.15
        rig.head.rotation.x = Math.sin(t * 0.9) * 0.04
        rig.armL.rotation.x = breath * 0.03
        rig.armR.rotation.x = -breath * 0.03
      }
    },
  }
}

// ------------------------------------------------------------------ ネクマックス

function nexmaxFace(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512)
  // 角丸の白いフェイスプレート（周囲は透明）
  ctx.clearRect(0, 0, 512, 512)
  ctx.fillStyle = '#ffffff'
  const r = 150
  ctx.beginPath()
  ctx.moveTo(40 + r, 30)
  ctx.lineTo(472 - r, 30)
  ctx.quadraticCurveTo(472, 30, 472, 30 + r)
  ctx.lineTo(472, 482 - r)
  ctx.quadraticCurveTo(472, 482, 472 - r, 482)
  ctx.lineTo(40 + r, 482)
  ctx.quadraticCurveTo(40, 482, 40, 482 - r)
  ctx.lineTo(40, 30 + r)
  ctx.quadraticCurveTo(40, 30, 40 + r, 30)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#2a3550'
  ctx.lineWidth = 8
  ctx.stroke()
  // 頬のほんのりした陰
  const g = ctx.createRadialGradient(256, 300, 80, 256, 300, 280)
  g.addColorStop(0, 'rgba(255,255,255,0)')
  g.addColorStop(1, 'rgba(170,190,215,0.35)')
  ctx.fillStyle = g
  ctx.fill()
  // 目（縦長の黒い楕円＋ハイライト）
  for (const ex of [196, 316]) {
    ctx.fillStyle = '#111522'
    ctx.beginPath()
    ctx.ellipse(ex, 225, 25, 44, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(ex + 7, 208, 8, 12, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 口（開いた笑顔）
  ctx.fillStyle = '#7a1d24'
  ctx.beginPath()
  ctx.moveTo(206, 318)
  ctx.quadraticCurveTo(256, 330, 306, 314)
  ctx.quadraticCurveTo(300, 392, 256, 394)
  ctx.quadraticCurveTo(212, 392, 206, 318)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#e8606c'
  ctx.beginPath()
  ctx.ellipse(258, 374, 28, 15, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#2a1a1e'
  ctx.lineWidth = 6
  ctx.beginPath()
  ctx.moveTo(206, 318)
  ctx.quadraticCurveTo(256, 330, 306, 314)
  ctx.stroke()
  return canvasTex(c)
}

function buildNexmax(): Rig {
  const blue = plastic('#3d9cf0', 0.3)
  const blueDark = plastic('#2f7fd0', 0.35)
  const grey = new THREE.MeshPhysicalMaterial({ color: '#8f9aa8', roughness: 0.35, metalness: 0.55, clearcoat: 0.3 })
  const white = plastic('#f7f8fa', 0.35)
  const black = new THREE.MeshStandardMaterial({ color: '#15171c', roughness: 0.4 })
  const faceMat = new THREE.MeshPhysicalMaterial({ map: nexmaxFace(), alphaTest: 0.5, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 })
  const root = new THREE.Group()
  const body = new THREE.Group()
  const baseY = 0.36
  body.position.y = baseY
  root.add(body)
  // 胴（丸い）
  const torso = mesh(new RoundedBoxGeometry(0.3, 0.24, 0.22, 4, 0.1), blue, 0, 0.1, 0)
  body.add(torso)
  // 胸の V
  const vShape = new THREE.Shape()
  vShape.moveTo(-0.07, 0.05)
  vShape.lineTo(0, -0.04)
  vShape.lineTo(0.07, 0.05)
  vShape.lineTo(0.045, 0.05)
  vShape.lineTo(0, -0.005)
  vShape.lineTo(-0.045, 0.05)
  vShape.closePath()
  const vm = mesh(new THREE.ExtrudeGeometry(vShape, { depth: 0.01, bevelEnabled: false }), plastic('#9fd2ff', 0.3), 0, 0.13, -0.116)
  vm.rotation.y = Math.PI
  body.add(vm)
  // 腰の関節
  body.add(sphere(0.075, grey, 0, -0.02, 0))
  // 首
  body.add(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 16), grey, 0, 0.245, 0))
  // 頭
  const head = new THREE.Group()
  head.position.set(0, 0.44, 0)
  body.add(head)
  head.add(sphere(0.25, blue, 0, 0, 0, 1.0, 0.95, 0.94, 40))
  const face = mesh(new THREE.SphereGeometry(0.252, 40, 30, Math.PI * 1.5 - 0.95, 1.9, 0.62, 1.75), faceMat, 0, -0.005, -0.004, 1.0, 0.95, 0.95)
  head.add(face)
  // 耳（円筒）
  for (const e of [-1, 1]) {
    const ear = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.1, 28), blue, e * 0.235, 0.0, 0.02)
    ear.rotation.z = Math.PI / 2
    head.add(ear)
    const cap = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 24), blueDark, e * 0.29, 0.0, 0.02)
    cap.rotation.z = Math.PI / 2
    head.add(cap)
    const ring = mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 28), grey, e * 0.287, 0.0, 0.02)
    ring.rotation.y = Math.PI / 2
    head.add(ring)
    // 触角
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(e * 0.05, 0.22, -0.06), new THREE.Vector3(e * 0.07, 0.33, -0.08), new THREE.Vector3(e * 0.12, 0.33, -0.17))
    head.add(mesh(new THREE.TubeGeometry(curve, 12, 0.007, 6), black))
    head.add(sphere(0.016, black, e * 0.12, 0.33, -0.17, 1, 1, 1, 10))
  }
  // 腕
  const arm = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.17, 0.17, 0)
    g.add(sphere(0.05, grey, 0, 0, 0))
    const upper = capsule(0.048, 0.07, blue)
    upper.position.set(e * 0.02, -0.08, 0)
    g.add(upper)
    g.add(sphere(0.038, grey, e * 0.025, -0.155, 0))
    const fore = capsule(0.05, 0.06, blue)
    fore.position.set(e * 0.028, -0.22, 0)
    g.add(fore)
    g.add(sphere(0.066, white, e * 0.03, -0.3, 0, 1, 0.95, 1))
    return g
  }
  const armL = arm(-1)
  const armR = arm(1)
  body.add(armL, armR)
  // 脚
  const leg = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.09, -0.04, 0)
    const thigh = capsule(0.055, 0.06, blue)
    thigh.position.set(0, -0.07, 0)
    g.add(thigh)
    g.add(sphere(0.04, grey, 0, -0.15, 0))
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12), grey, 0, -0.2, 0))
    const boot = mesh(new RoundedBoxGeometry(0.16, 0.13, 0.25, 4, 0.06), blue, 0, -0.26, -0.035)
    g.add(boot)
    g.add(mesh(new RoundedBoxGeometry(0.165, 0.03, 0.255, 2, 0.012), blueDark, 0, -0.315, -0.035))
    return g
  }
  const legL = leg(-1)
  const legR = leg(1)
  body.add(legL, legR)
  // 手元（ビームの始点）
  const hand = new THREE.Object3D()
  hand.position.set(0.03, -0.33, -0.02)
  armR.add(hand)
  mergeRig(root)
  // 輪郭線は頭と胴の青い部分だけ（ドローコール節約）
  for (const m of [...head.children, ...body.children]) {
    const mesh = m as THREE.Mesh
    if (mesh.isMesh && mesh.material === blue) addOutline(mesh, 0.005, '#16203a', false, true)
  }
  return { root, body, head, armL, armR, legL, legR, hand, baseY }
}

// ------------------------------------------------------------------ 源兵衛

function genbeiFace(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256)
  ctx.fillStyle = '#f2c4a0'
  ctx.fillRect(0, 0, 256, 256)
  // 目（にっこり）
  ctx.strokeStyle = '#2a1a12'
  ctx.lineWidth = 7
  ctx.lineCap = 'round'
  for (const ex of [98, 158]) {
    ctx.beginPath()
    ctx.arc(ex, 116, 13, Math.PI * 1.1, Math.PI * 1.9)
    ctx.stroke()
  }
  // 頬
  ctx.fillStyle = 'rgba(230,120,100,0.35)'
  for (const ex of [78, 178]) {
    ctx.beginPath()
    ctx.ellipse(ex, 150, 18, 11, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  return canvasTex(c)
}

function apronTex(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256)
  ctx.fillStyle = '#efe8d8'
  ctx.fillRect(0, 0, 256, 256)
  drawGear(ctx, 128, 140, 52, '#3a4a70', 9)
  return canvasTex(c)
}

function buildGenbei(): Rig {
  const indigo = cloth('#2f3f6c')
  const indigoDark = cloth('#243256')
  const sk = skin()
  const hair = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9 })
  const leather = cloth('#7a4e2c')
  const brass = new THREE.MeshStandardMaterial({ color: '#c79a48', metalness: 0.9, roughness: 0.3 })
  const lens = new THREE.MeshPhysicalMaterial({ color: '#3a5a6a', roughness: 0.05, metalness: 0.2, clearcoat: 1 })
  const band = cloth('#3c5fa0')
  const apron = cloth('#ffffff', apronTex())
  const sandal = cloth('#c9a46a')
  const faceMat = new THREE.MeshPhysicalMaterial({ map: genbeiFace(), roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#ffb59a') })
  const root = new THREE.Group()
  const body = new THREE.Group()
  const baseY = 0.78
  body.position.y = baseY
  root.add(body)
  // 胴（ずんぐり）
  body.add(sphere(0.27, indigo, 0, 0.32, 0, 1.0, 1.15, 0.85))
  body.add(sphere(0.25, indigo, 0, 0.12, 0, 1.0, 0.8, 0.9))
  // 前掛け
  const ap = mesh(new THREE.CylinderGeometry(0.255, 0.27, 0.5, 24, 1, true, Math.PI * 0.62, Math.PI * 0.76), apron, 0, 0.12, -0.012, 1, 1, 0.9)
  ap.rotation.y = Math.PI
  body.add(ap)
  // 帯と道具袋
  body.add(mesh(new THREE.CylinderGeometry(0.262, 0.262, 0.07, 24), leather, 0, 0.17, 0, 1, 1, 0.88))
  for (const [x, z] of [
    [-0.2, -0.1],
    [0.22, -0.06],
    [0.05, 0.22],
  ] as const) {
    body.add(mesh(new RoundedBoxGeometry(0.1, 0.11, 0.06, 2, 0.02), leather, x, 0.1, z))
  }
  // 頭
  const head = new THREE.Group()
  head.position.set(0, 0.72, -0.02)
  body.add(head)
  head.add(sphere(0.165, faceMat, 0, 0, 0, 1, 1.02, 1))
  ;(head.children[0] as THREE.Mesh).rotation.y = Math.PI / 2
  head.add(sphere(0.045, sk, 0, -0.02, -0.165, 1, 0.9, 0.9))
  // 白い眉・髭・髪
  for (const e of [-1, 1]) {
    head.add(sphere(0.04, hair, e * 0.06, 0.06, -0.15, 1.3, 0.6, 0.6))
    head.add(sphere(0.055, hair, e * 0.05, -0.075, -0.15, 1.4, 0.75, 0.8))
    head.add(sphere(0.085, hair, e * 0.13, 0.02, 0.03, 0.8, 1.1, 1.1))
  }
  head.add(sphere(0.1, hair, 0, -0.14, -0.08, 1.2, 1.0, 0.9))
  head.add(sphere(0.13, hair, 0, 0.06, 0.06, 1.1, 0.9, 1.0))
  // 鉢巻
  const hb = mesh(new THREE.TorusGeometry(0.163, 0.022, 8, 32), band, 0, 0.07, 0)
  hb.rotation.x = Math.PI / 2
  head.add(hb)
  // ゴーグル（額）
  for (const e of [-1, 1]) {
    const ring = mesh(new THREE.TorusGeometry(0.042, 0.012, 8, 20), brass, e * 0.055, 0.115, -0.13)
    ring.rotation.x = -0.5
    head.add(ring)
    const l = mesh(new THREE.CircleGeometry(0.04, 20), lens, e * 0.055, 0.115, -0.131)
    l.rotation.x = -0.5
    l.rotation.y = Math.PI
    head.add(l)
  }
  // 腕
  const arm = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.27, 0.48, 0)
    g.add(sphere(0.09, indigo, 0, 0, 0))
    const up = capsule(0.075, 0.14, indigo)
    up.position.set(e * 0.02, -0.12, 0)
    g.add(up)
    const fore = capsule(0.062, 0.14, sk)
    fore.position.set(e * 0.03, -0.3, 0)
    g.add(fore)
    g.add(sphere(0.07, sk, e * 0.035, -0.42, 0))
    return g
  }
  const armL = arm(-1)
  const armR = arm(1)
  body.add(armL, armR)
  const leg = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.12, 0.0, 0)
    const th = capsule(0.1, 0.2, indigoDark)
    th.position.y = -0.18
    g.add(th)
    const sh = capsule(0.075, 0.2, indigoDark)
    sh.position.y = -0.48
    g.add(sh)
    g.add(mesh(new RoundedBoxGeometry(0.13, 0.05, 0.25, 2, 0.02), sandal, 0, -0.74, -0.04))
    g.add(mesh(new RoundedBoxGeometry(0.11, 0.08, 0.2, 2, 0.035), cloth('#e9e6df'), 0, -0.69, -0.03))
    return g
  }
  const legL = leg(-1)
  const legR = leg(1)
  body.add(legL, legR)
  const hand = new THREE.Object3D()
  armR.add(hand)
  mergeRig(root)
  return { root, body, head, armL, armR, legL, legR, hand, baseY }
}

// ------------------------------------------------------------------ おはる

function oharuFace(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 256)
  ctx.fillStyle = '#f6d2b6'
  ctx.fillRect(0, 0, 256, 256)
  for (const ex of [100, 156]) {
    ctx.fillStyle = '#2b1810'
    ctx.beginPath()
    ctx.ellipse(ex, 128, 11, 16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(ex + 4, 121, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = 'rgba(240,120,130,0.45)'
  for (const ex of [82, 174]) {
    ctx.beginPath()
    ctx.ellipse(ex, 152, 15, 9, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#b8323e'
  ctx.beginPath()
  ctx.moveTo(114, 160)
  ctx.quadraticCurveTo(128, 180, 142, 160)
  ctx.closePath()
  ctx.fill()
  return canvasTex(c)
}

function kimonoTex(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(512, 512)
  ctx.fillStyle = '#f19ab4'
  ctx.fillRect(0, 0, 512, 512)
  for (let i = 0; i < 40; i++) {
    const x = (i * 97) % 512
    const y = (i * 151) % 512
    ctx.fillStyle = i % 3 === 0 ? '#ffffff' : '#ffd3e2'
    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2
      ctx.beginPath()
      ctx.ellipse(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 6, 9, a + Math.PI / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = '#e0607e'
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  }
  const t = canvasTex(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(2, 1.5)
  return t
}

function buildOharu(): Rig {
  const kim = cloth('#ffffff', kimonoTex())
  const obi = cloth('#d8423a')
  const obiCord = cloth('#f2c14e')
  const sk = skin()
  const hairM = new THREE.MeshStandardMaterial({ color: '#3a2216', roughness: 0.6 })
  const ribbon = cloth('#e23a4a')
  const fanM = new THREE.MeshStandardMaterial({ color: '#f2dcb0', roughness: 0.8, side: THREE.DoubleSide })
  const wood = cloth('#8a5a34')
  const faceMat = new THREE.MeshPhysicalMaterial({ map: oharuFace(), roughness: 0.5, sheen: 0.3 })
  const root = new THREE.Group()
  const body = new THREE.Group()
  const baseY = 0.0
  root.add(body)
  // 着物（裾広がり）
  const prof = [
    new THREE.Vector2(0.0, 0.06),
    new THREE.Vector2(0.17, 0.06),
    new THREE.Vector2(0.165, 0.3),
    new THREE.Vector2(0.15, 0.55),
    new THREE.Vector2(0.16, 0.7),
    new THREE.Vector2(0.12, 0.82),
    new THREE.Vector2(0.05, 0.86),
    new THREE.Vector2(0.0, 0.86),
  ]
  body.add(mesh(new THREE.LatheGeometry(prof, 28), kim, 0, 0, 0, 1, 1, 0.82))
  body.add(mesh(new THREE.CylinderGeometry(0.158, 0.155, 0.13, 24), obi, 0, 0.62, 0, 1, 1, 0.84))
  body.add(mesh(new THREE.TorusGeometry(0.157, 0.008, 6, 28), obiCord, 0, 0.62, 0, 1, 0.84, 1).rotateX(Math.PI / 2))
  body.add(mesh(new RoundedBoxGeometry(0.22, 0.12, 0.08, 2, 0.03), obi, 0, 0.64, 0.14))
  // 足元
  for (const e of [-1, 1]) body.add(mesh(new RoundedBoxGeometry(0.07, 0.05, 0.13, 2, 0.015), wood, e * 0.05, 0.025, -0.03))
  // 頭
  const head = new THREE.Group()
  head.position.set(0, 0.98, 0)
  body.add(head)
  const fs = sphere(0.135, faceMat, 0, 0, 0)
  fs.rotation.y = Math.PI / 2
  head.add(fs)
  head.add(sphere(0.142, hairM, 0, 0.03, 0.02, 1.02, 0.98, 1.0))
  ;(head.children[1] as THREE.Mesh).geometry = new THREE.SphereGeometry(0.142, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55)
  head.add(sphere(0.075, hairM, 0, 0.15, 0.05))
  head.add(sphere(0.06, hairM, 0, 0.0, 0.11))
  for (const e of [-1, 1]) {
    head.add(sphere(0.04, ribbon, e * 0.06, 0.19, 0.06, 1.2, 0.8, 0.6))
    head.add(sphere(0.022, cloth('#ffd0de'), e * 0.09, 0.12, -0.04))
  }
  // 腕（袖）
  const arm = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.15, 0.76, 0)
    const sl = capsule(0.06, 0.16, kim)
    sl.position.set(e * 0.02, -0.12, 0)
    g.add(sl)
    g.add(sphere(0.042, sk, e * 0.03, -0.26, 0))
    return g
  }
  const armL = arm(-1)
  const armR = arm(1)
  body.add(armL, armR)
  // 団扇
  const fan = new THREE.Group()
  fan.position.set(0.03, -0.3, 0)
  fan.add(mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6), wood, 0, -0.06, 0))
  const disc = mesh(new THREE.CircleGeometry(0.1, 24), fanM, 0, -0.2, 0)
  disc.rotation.y = Math.PI / 2
  fan.add(disc)
  armR.add(fan)
  const legL = new THREE.Group()
  const legR = new THREE.Group()
  const hand = new THREE.Object3D()
  armR.add(hand)
  mergeRig(root)
  return { root, body, head, armL, armR, legL, legR, hand, baseY }
}
