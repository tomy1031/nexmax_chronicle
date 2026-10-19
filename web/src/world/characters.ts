// キャラクター読み込み：public/models/<name>.glb があれば GLTFLoader（+meshopt）で読み、
// 足元を原点・-Z 向きに正規化して影を有効化、アニメーションがあれば AnimationMixer で再生。
// 無ければ、コンセプトのシルエットに合わせた「なめらかな形の仮モデル」を組み立てる。
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { drawGear, makeCanvas } from '../render/textures'
import { createNexmax } from './nexmax/nexmaxModel'
import { OUTLINE } from './nexmax/materials'

export type CharacterName = 'nexmax' | 'genbei' | 'oharu' | 'matsui' | 'saeki' | 'sora' | 'michi'
export type Pose = 'idle' | 'walk' | 'hold' | 'crank' | 'wave' | 'run' | 'jump' | 'fall' | 'land' | 'swing' | 'pulled' | 'fire' | 'dash'

/** 仮モデルが持つ基本のポーズへ寄せる（新しいポーズは近いものとして扱う） */
type BasePose = 'idle' | 'walk' | 'hold' | 'crank' | 'wave'
function basePose(p: Pose): BasePose {
  switch (p) {
    case 'run':
    case 'dash':
      return 'walk'
    case 'swing':
    case 'pulled':
    case 'fire':
      return 'hold'
    case 'jump':
    case 'fall':
    case 'land':
      return 'idle'
    default:
      return p
  }
}

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
  // 主人公は部品ごとに組み立てたモデル（関節で動かす）。GLB は使わない
  if (name === 'nexmax') return createNexmax(targetHeightMeters)
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

/**
 * Tripo のテクスチャは肌や髪の色が濃く、ゲームの色の処理（トーンマッピング）でさらにオレンジに寄る。
 * 読み込むときに彩度を少し落として明るくした絵に描き直す（顔をアニメ調のすっきりした色に）
 */
const softened = new WeakMap<THREE.Texture, THREE.Texture>()
function softenTexture(tex: THREE.Texture): THREE.Texture {
  const done = softened.get(tex)
  if (done) return done
  const img = tex.image as (CanvasImageSource & { width: number; height: number }) | undefined
  if (!img || !img.width || typeof document === 'undefined') return tex
  const cv = document.createElement('canvas')
  cv.width = img.width
  cv.height = img.height
  const g = cv.getContext('2d')
  if (!g) return tex
  g.filter = 'saturate(0.8) brightness(1.05)'
  g.drawImage(img, 0, 0)
  const out = new THREE.CanvasTexture(cv)
  out.flipY = tex.flipY
  out.wrapS = tex.wrapS
  out.wrapT = tex.wrapT
  out.channel = tex.channel
  softened.set(tex, out)
  tex.dispose()
  return out
}

/** トゥーンの明暗の段（暗い所でも 6 割の明るさ。顔が黒くつぶれない） */
let rampTex: THREE.DataTexture | null = null
function toonRamp(): THREE.DataTexture {
  if (rampTex) return rampTex
  const d = new Uint8Array([168, 168, 168, 255, 214, 214, 214, 255, 248, 248, 248, 255])
  rampTex = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat)
  rampTex.minFilter = rampTex.magFilter = THREE.NearestFilter
  rampTex.generateMipmaps = false
  rampTex.needsUpdate = true
  return rampTex
}

function fromGLTF(name: CharacterName, scene: THREE.Object3D, clips: THREE.AnimationClip[], h: number): Character {
  const root = new THREE.Group()
  root.name = name
  const inner = new THREE.Group()
  // モデル処理（scripts/process-model.mjs）で -Z 向きに焼き込み済みなので回さない
  inner.add(scene)
  root.add(inner)
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const s = size.y > 0 ? h / size.y : 1
  scene.scale.multiplyScalar(s)
  scene.updateMatrixWorld(true)
  box.setFromObject(scene)
  const center = box.getCenter(new THREE.Vector3())
  scene.position.x -= center.x
  scene.position.z -= center.z
  scene.position.y -= box.min.y
  scene.updateMatrixWorld(true)
  const meshes: THREE.Mesh[] = []
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) meshes.push(m)
  })
  for (const m of meshes) {
    m.castShadow = true
    // 体の凹凸に落ちる影（口のくぼみ・髪の影）が顔を暗く怖く見せるので、自分には影を落とさない
    m.receiveShadow = false
    // Tripo はアルベド（色）だけを焼いている。アニメ調に見えるよう、明暗 3 段のトゥーン材質にして、
    // 色を少し自分で光らせる（正面から見たテクスチャの色に近い、すっきりした顔になる）
    const conv = (mat: THREE.Material): THREE.Material => {
      const src = mat as THREE.MeshPhysicalMaterial
      const out = new THREE.MeshToonMaterial({
        name: src.name,
        map: src.map ?? null,
        normalMap: src.normalMap ?? null,
        color: src.color ? src.color.clone() : new THREE.Color('#ffffff'),
        vertexColors: src.vertexColors,
        gradientMap: toonRamp(),
      })
      if (out.map) {
        out.map = softenTexture(out.map)
        out.map.anisotropy = 8
        out.map.colorSpace = THREE.SRGBColorSpace
        // 明るさの半分は自分の色（テクスチャを正面から見たときの色に近い、平らなアニメ調）、半分を光で
        out.color.multiplyScalar(0.55)
        out.emissiveMap = out.map
        out.emissive.set('#ffffff')
        out.emissiveIntensity = 0.5
      }
      return out
    }
    m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material)
    // 細い輪郭線（濃い茶）：ワールドでおよそ 4mm になるよう、メッシュの拡大を打ち消す
    const ws = new THREE.Vector3()
    m.getWorldScale(ws)
    const k = Math.max(1e-6, (ws.x + ws.y + ws.z) / 3)
    addOutline(m, (0.004 * (h / 1.6)) / k, '#2a1a12', false, true)
  }
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
  let t = Math.random() * 10
  let pose: BasePose = 'idle'
  return {
    name,
    root,
    placeholder: false,
    height: h,
    handAnchor: hand,
    setPose(p) {
      pose = basePose(p)
    },
    setAim() {},
    update(dt, speed) {
      t += dt
      if (mixer) {
        play(speed > 0.3 && walk ? walk : idle)
        if (current && walk && current.getClip() === walk) current.timeScale = Math.max(0.6, speed / 2.2)
        mixer.update(dt)
        return
      }
      // リグの無い静的メッシュ：呼吸（Y に約 1%）と小さな揺れ。ポーズは向き・傾きで示す
      const walkK = Math.min(1, speed / 3)
      const breath = Math.sin(t * 2.1)
      inner.scale.set(1 - breath * 0.004, 1 + breath * 0.01, 1 - breath * 0.004)
      inner.position.y = Math.abs(Math.sin(t * 9)) * 0.04 * walkK
      inner.rotation.set(0, 0, Math.sin(t * 0.9) * 0.012 + Math.sin(t * 9) * 0.03 * walkK)
      if (pose === 'crank') {
        // ハンドルを回す：前へかがみ、押し引きのリズムで前後に揺れる
        const c = Math.sin(t * 1.6)
        inner.rotation.x = -0.1 - c * 0.04
        inner.rotation.y = c * 0.05
        inner.position.z = -0.03 * c
      } else if (pose === 'wave') {
        inner.rotation.z += Math.sin(t * 4) * 0.035
        inner.position.y += Math.abs(Math.sin(t * 4)) * 0.015
      } else if (pose === 'hold') {
        inner.rotation.x = -0.08
      } else if (pose === 'walk') {
        inner.rotation.x = -0.05 * walkK
      }
    },
  }
}

// ------------------------------------------------------------------ 仮モデル共通

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

/** 輪郭線の最小の画素数（ネクマックスの輪郭の何倍か。人の細い茶色の線は少し細めに） */
const NPC_OUTLINE_MIN_PX_SCALE = 0.75

/**
 * 背面法線押し出しの輪郭線。太さは thickness（メッシュの座標での長さ）だが、遠くや低い解像度で
 * 1 画素を切ると点線のように途切れるので、描画の画素で最小の太さ（OUTLINE.minPx）になるまで足す
 */
function addOutline(root: THREE.Object3D, thickness: number, color: string, recursive = true, self = false): void {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  const t = thickness.toFixed(5)
  mat.onBeforeCompile = (s) => {
    s.uniforms.uOutlineMinPx = OUTLINE.minPx
    s.uniforms.uOutlineViewH = OUTLINE.viewportH
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlineMinPx;\nuniform float uOutlineViewH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${t};`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
 {
   vec3 nV = normalize(normalMatrix * normal);
   float sc = length(modelViewMatrix[0].xyz);
   float need = uOutlineMinPx * ${NPC_OUTLINE_MIN_PX_SCALE.toFixed(2)} * 2.0 * (-mvPosition.z) / (projectionMatrix[1][1] * max(uOutlineViewH, 1.0));
   mvPosition.xyz += nV * max(0.0, need - ${t} * sc);
   gl_Position = projectionMatrix * mvPosition;
 }`,
      )
  }
  mat.customProgramCacheKey = () => `outline-${t}`
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
  let pose: BasePose = name === 'genbei' ? 'crank' : name === 'oharu' ? 'wave' : 'idle'
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
      pose = basePose(p)
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
        // NMClaw は右腕だけ：右腕を対象へ突き出し、左手は右の前腕に添えて踏ん張る
        const [yr, pr] = aimAngles(rig.armR)
        const shake = Math.sin(t * 14) * 0.015
        rig.armR.rotation.set(Math.PI / 2 + pr + shake, yr - 0.08, 0)
        rig.armL.rotation.set(Math.PI / 2 + pr - 0.35 + shake, yr - 0.55, 0)
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
// 原画（assets_src/reference/nexmax_original.png）準拠：パステルの空色・大きな丸い頭・上辺が中央でくぼむ白い顔プレート・
// ヘルメットに描いた眉・黒い丸目・小さく開いたオレンジの口・楕円の耳パッド・アンテナなし・
// 玉をつないだ細い手足・指のある小さな手・半球の足・胸の青い山形ロゴ・黒い輪郭線。
// 右腕の前腕に NMClaw（ワイヤー射出の爪）を収納：手首に小さな射出リングだけ見せる。

/** 原画（2000px 四方、表示 1932px）上の寸法 → m（全高 1230px = 1.05m） */
const NX = {
  k: 1.05 / 1230,
  headCx: 960,
  headCy: 715,
  headRx: 462,
  headRy: 345,
}
const NX_HEAD = { rx: 0.395, ry: 0.295, rz: 0.34 }
/** 顔パッチ（頭の楕円体の前面）の範囲 */
const NX_PATCH = { ph: 1.1, t0: 0.45, t1: 2.55 }

function nexmaxFace(): THREE.CanvasTexture {
  const W = 1024
  const H = 736
  const [c, ctx] = makeCanvas(W, H)
  ctx.clearRect(0, 0, W, H)
  // 原画の正面図の座標 → 楕円体の前面パッチの UV（キャンバス座標）
  const P = (X: number, Y: number): [number, number] => {
    const nx = (X - NX.headCx) / NX.headRx
    const ny = Math.max(-0.999, Math.min(0.999, (NX.headCy - Y) / NX.headRy))
    const th = Math.acos(ny)
    const a = Math.asin(Math.max(-1, Math.min(1, nx / Math.sin(th))))
    return [((a + NX_PATCH.ph) / (2 * NX_PATCH.ph)) * W, ((th - NX_PATCH.t0) / (NX_PATCH.t1 - NX_PATCH.t0)) * H]
  }
  type Pt = [number, number]
  const quad = (out: Pt[], a: Pt, ctl: Pt, b: Pt, n = 16) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n
      const u = 1 - t
      out.push([u * u * a[0] + 2 * u * t * ctl[0] + t * t * b[0], u * u * a[1] + 2 * u * t * ctl[1] + t * t * b[1]])
    }
  }
  const path = (pts: Pt[], close: boolean) => {
    ctx.beginPath()
    pts.forEach(([x, y], i) => {
      const [u, v] = P(x, y)
      if (i === 0) ctx.moveTo(u, v)
      else ctx.lineTo(u, v)
    })
    if (close) ctx.closePath()
  }
  // 顔プレート：上辺は中央でなだらかにくぼむ。下の角は大きく丸い。
  const Lx = 648
  const Rx = 1338
  const T = 500
  const r = 72
  const plate: Pt[] = [[Lx + r, T]]
  for (let X = Lx + r; X <= Rx - r; X += 6) plate.push([X, T + 50 * Math.exp(-(((X - 960) / 58) ** 2))])
  quad(plate, [Rx - r, T], [Rx, T], [Rx, T + r])
  plate.push([Rx, 790])
  quad(plate, [Rx, 790], [Rx, 925], [1180, 932])
  quad(plate, [1180, 932], [960, 950], [740, 927])
  quad(plate, [740, 927], [Lx, 920], [Lx, 790])
  plate.push([Lx, T + r])
  quad(plate, [Lx, T + r], [Lx, T], [Lx + r, T])
  path(plate, true)
  const g = ctx.createLinearGradient(0, P(0, 520)[1], 0, P(0, 940)[1])
  g.addColorStop(0, '#ffffff')
  g.addColorStop(1, '#eef2f6')
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = '#11131a'
  ctx.lineWidth = 13
  ctx.stroke()
  // 目（少し縦長の黒い丸）
  for (const [ex, ey] of [
    [885, 722],
    [1110, 727],
  ] as const) {
    const pts: Pt[] = []
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2
      pts.push([ex + Math.cos(a) * 50, ey + Math.sin(a) * 57])
    }
    path(pts, true)
    ctx.fillStyle = '#0d0f14'
    ctx.fill()
  }
  // 口（小さく開いた、角の丸い逆三角形）
  const mouth: Pt[] = [[946, 848]]
  quad(mouth, [946, 848], [994, 858], [1042, 850], 10)
  quad(mouth, [1042, 850], [1036, 892], [994, 906], 10)
  quad(mouth, [994, 906], [952, 890], [946, 848], 10)
  path(mouth, true)
  ctx.fillStyle = '#f26f50'
  ctx.fill()
  ctx.lineWidth = 7
  ctx.stroke()
  // 眉（ヘルメットの上に描いた短い弧）
  ctx.lineWidth = 15
  for (const [a, ctl, b] of [
    [
      [815, 448],
      [852, 404],
      [905, 432],
    ],
    [
      [1092, 464],
      [1140, 418],
      [1182, 456],
    ],
  ] as Array<[Pt, Pt, Pt]>) {
    const pts: Pt[] = [a]
    quad(pts, a, ctl, b, 14)
    path(pts, false)
    ctx.stroke()
  }
  return canvasTex(c)
}

/** 胸の山形ロゴ（濃淡 2 色の青） */
function nexmaxLogo(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 200)
  ctx.clearRect(0, 0, 256, 200)
  const poly = (pts: Array<[number, number]>, col: string) => {
    ctx.fillStyle = col
    ctx.beginPath()
    pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.fill()
  }
  poly([[8, 190], [8, 86], [92, 190]], '#1d5fab')
  poly([[8, 190], [52, 70], [128, 190]], '#2c79c6')
  poly([[70, 190], [150, 92], [214, 190]], '#3b93dc')
  poly([[132, 190], [248, 10], [248, 190]], '#1d5fab')
  poly([[180, 190], [248, 96], [248, 190]], '#2c79c6')
  return canvasTex(c)
}

function buildNexmax(): Rig {
  const sky = new THREE.MeshPhysicalMaterial({ color: '#7cbdf0', roughness: 0.52, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.45, envMapIntensity: 0.6 })
  const ringMat = new THREE.MeshPhysicalMaterial({ color: '#5aa4dc', roughness: 0.35, metalness: 0.2, clearcoat: 0.5, clearcoatRoughness: 0.25 })
  const nozzle = new THREE.MeshStandardMaterial({ color: '#1b2a3c', roughness: 0.4, metalness: 0.4 })
  const faceMat = new THREE.MeshStandardMaterial({ map: nexmaxFace(), alphaTest: 0.5, roughness: 0.42, envMapIntensity: 0.5 })
  const logoMat = new THREE.MeshStandardMaterial({ map: nexmaxLogo(), alphaTest: 0.5, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2 })
  const root = new THREE.Group()
  const body = new THREE.Group()
  const baseY = 0.23 // 腰の高さ
  body.position.y = baseY
  root.add(body)
  // 胴（上が広い丸い台形）
  const torsoProf = [
    [0.0, -0.006],
    [0.06, 0.0],
    [0.092, 0.02],
    [0.105, 0.06],
    [0.13, 0.12],
    [0.14, 0.163],
    [0.126, 0.19],
    [0.08, 0.205],
    [0.0, 0.211],
  ].map(([x, y]) => new THREE.Vector2(x, y))
  body.add(mesh(new THREE.LatheGeometry(torsoProf, 28), sky, 0, 0, 0, 1, 1, 0.72))
  // 胸のロゴ
  const logo = mesh(new THREE.PlaneGeometry(0.088, 0.069), logoMat, 0, 0.118, -0.0935)
  logo.rotation.y = Math.PI
  logo.rotation.x = 0.12
  logo.castShadow = false
  logo.userData.noOutline = true
  body.add(logo)
  // 首（短い）
  body.add(mesh(new THREE.CylinderGeometry(0.04, 0.046, 0.075, 18), sky, 0, 0.215, 0))
  // 頭（首を支点に回す）
  const head = new THREE.Group()
  head.position.set(0, 0.2, 0)
  body.add(head)
  const hc = 0.756 - baseY - 0.2 // 首から頭の中心まで
  head.add(sphere(1, sky, 0, hc, 0, NX_HEAD.rx, NX_HEAD.ry, NX_HEAD.rz, 48))
  // 顔プレート（楕円体の前面パッチに原画の顔を投影したテクスチャ）
  const face = mesh(
    new THREE.SphereGeometry(1, 56, 40, Math.PI * 1.5 - NX_PATCH.ph, NX_PATCH.ph * 2, NX_PATCH.t0, NX_PATCH.t1 - NX_PATCH.t0),
    faceMat,
    0,
    hc,
    0,
    NX_HEAD.rx + 0.003,
    NX_HEAD.ry + 0.003,
    NX_HEAD.rz + 0.003,
  )
  face.userData.noOutline = true
  head.add(face)
  // 耳パッド（楕円）
  for (const e of [-1, 1]) head.add(sphere(1, sky, e * (NX_HEAD.rx - 0.012), hc - 0.005, 0.03, 0.066, 0.098, 0.082, 24))
  // 腕：玉をつないだ細い腕。右腕（+X）の前腕に NMClaw を収納
  const arm = (e: number) => {
    const right = e > 0
    const g = new THREE.Group()
    g.position.set(e * 0.145, 0.17, 0)
    g.add(sphere(0.034, sky, 0, 0, 0, 1, 1, 1, 20))
    g.add(sphere(0.032, sky, e * 0.008, -0.062, 0, 1, 1.35, 1, 20))
    g.add(sphere(0.022, sky, e * 0.012, -0.112, 0, 1, 1, 1, 16))
    g.add(sphere(right ? 0.044 : 0.04, sky, e * 0.016, -0.166, 0, 1, 1.3, 1, 22))
    g.add(sphere(0.02, sky, e * 0.018, -0.217, 0, 1, 1, 1, 14))
    // 手：手のひら＋指 3 本＋親指
    const hx = e * 0.02
    g.add(sphere(0.028, sky, hx, -0.248, 0, 0.9, 1.0, 0.78, 18))
    for (const [fx, tilt] of [
      [-0.012, -0.32],
      [0.0, 0.0],
      [0.012, 0.32],
    ] as const) {
      const f = capsule(0.0085, 0.022, sky)
      f.position.set(hx + fx, -0.282, -0.004)
      f.rotation.z = tilt
      g.add(f)
    }
    const th = capsule(0.008, 0.018, sky)
    th.position.set(hx - e * 0.016, -0.255, -0.02)
    th.rotation.set(0.9, 0, e * 0.4)
    g.add(th)
    if (right) {
      // 手首の射出リングと、前腕の先の小さな射出口
      const ring = mesh(new THREE.TorusGeometry(0.027, 0.0075, 10, 28), ringMat, e * 0.018, -0.214, 0)
      ring.rotation.x = Math.PI / 2
      ring.userData.noOutline = true
      g.add(ring)
      const port = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.006, 14), nozzle, e * 0.018, -0.2, -0.038)
      port.rotation.x = Math.PI / 2
      port.userData.noOutline = true
      g.add(port)
    }
    return g
  }
  const armL = arm(-1)
  const armR = arm(1)
  body.add(armL, armR)
  // 脚：玉をつないだ細い脚＋半球の足
  const leg = (e: number) => {
    const g = new THREE.Group()
    g.position.set(e * 0.075, 0, 0)
    g.add(sphere(0.028, sky, 0, -0.005, 0, 1, 1, 1, 16))
    g.add(sphere(0.03, sky, 0, -0.046, 0, 1, 1.3, 1, 18))
    g.add(sphere(0.02, sky, 0, -0.086, 0, 1, 1, 1, 14))
    g.add(sphere(0.029, sky, 0, -0.12, 0, 1, 1.25, 1, 18))
    g.add(mesh(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), sky, 0, -0.23, -0.012, 0.056, 0.085, 0.072))
    const sole = mesh(new THREE.CircleGeometry(1, 24), sky, 0, -0.2295, -0.012, 0.056, 0.072, 1)
    sole.rotation.x = Math.PI / 2
    g.add(sole)
    return g
  }
  const legL = leg(-1)
  const legR = leg(1)
  body.add(legL, legR)
  // 手元（NMClaw のワイヤーの射出点：右手首の射出口）
  const hand = new THREE.Object3D()
  hand.position.set(0.018, -0.205, -0.04)
  armR.add(hand)
  mergeRig(root)
  // 黒い輪郭線（原画の太い線）：空色の部分すべて
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh && m.material === sky && !m.userData.noOutline) addOutline(m, m.parent === head ? 0.0075 : 0.0048, '#11131a', false, true)
  })
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
