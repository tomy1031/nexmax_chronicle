// 物語 v7 の舞台を足すときの共通の部品：組み立ての文脈（Batch・当たり判定・光）を町と同じ形で作る・結合してぶら下げる、
// キャンバスの文字、夜に強く光る材質、変わる前の景色（ゴースト）の材質。
import * as THREE from 'three'
import { Batch } from '../../../render/batch'
import type { MaterialLibrary } from '../../../render/materials'
import { uTime } from '../../../render/materials'
import { mulberry32 } from '../../../render/noise'
import type { QualitySettings } from '../../../render/quality'
import { ColliderList } from '../../../world/colliders'
import { Foliage } from '../../../world/edo/nature'
import type { FutureMaterials } from '../fmaterials'
import { AttrBatch, type FCtx } from '../kit2086'
import type { LightSpot } from '../../../world/edo/kit'
import { ROUNDED } from '../textures2086'

export type CtxSource = {
  materials: FutureMaterials
  colliders: ColliderList
  lights: LightSpot[]
}

/** 町（buildFutureScene）と同じ形の組み立ての文脈。col を渡さなければ町の当たり判定（load のとき物理になる）へ積む */
export function makeCtx(src: CtxSource, root: THREE.Group, quality: QualitySettings, seed: number, col?: ColliderList): FCtx {
  const c = {
    b: new Batch(),
    bf: new Batch(),
    m: src.materials.lib as MaterialLibrary,
    col: col ?? src.colliders,
    rng: mulberry32(seed),
    lights: src.lights,
    root,
    updaters: [],
    quality,
    fm: src.materials,
    cloth: new AttrBatch(['aHang']),
    holo: new AttrBatch(),
    holoN: new AttrBatch(),
  } as unknown as FCtx
  c.foliage = new Foliage(c)
  return c
}

/** 文脈に積んだものを結合して group にぶら下げる。夜だけのホロ（holoN）は返すので、夜に見せる */
export function finishCtx(c: FCtx, group: THREE.Group, name: string): { holoNight: THREE.Mesh | null } {
  const stat = c.b.build(name)
  group.add(stat)
  const far = c.bf.build(name + '_far')
  far.traverse((o) => (o.castShadow = false))
  if (far.children.length) group.add(far)
  const fol = c.foliage.build()
  if (fol.children.length) group.add(fol)
  const cloth = c.cloth.build(c.fm.cloth, name + '_cloth')
  if (cloth) {
    cloth.castShadow = true
    group.add(cloth)
  }
  const holo = c.holo.build(c.fm.holo, name + '_holo')
  if (holo) {
    holo.renderOrder = 2
    group.add(holo)
  }
  const holoN = c.holoN.build(c.fm.holoNight, name + '_holoN')
  if (holoN) {
    holoN.renderOrder = 2
    holoN.visible = false
    group.add(holoN)
  }
  return { holoNight: holoN }
}

/** 別の当たり判定の入れ物（出し入れする組に使う） */
export function newColliders(): ColliderList {
  return new ColliderList()
}

// ------------------------------------------------------------------ キャンバス

export function font(weight: number | string, px: number, family = ROUNDED): string {
  return `${weight} ${px}px ${family}`
}

export function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, aniso = 4): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  draw(g, w, h)
  const t = new THREE.CanvasTexture(cv)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = aniso
  // フォントの読み込みが後から終わったら描き直す（丸ゴシックはウェブフォント）
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    void document.fonts.ready.then(() => {
      g.clearRect(0, 0, w, h)
      draw(g, w, h)
      t.needsUpdate = true
    })
  }
  return t
}

/** 縦書き（1 文字ずつ） */
export function verticalText(g: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, gap = 1.05): void {
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let yy = y + px / 2
  for (const ch of text) {
    g.fillText(ch, x, yy)
    yy += px * gap
  }
}

/** 板（PlaneGeometry）を pos に、正面の法線 yaw（0 = +Z）で立てる */
export function plane(w: number, h: number, mat: THREE.Material, pos: THREE.Vector3, yaw: number, name?: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat)
  m.position.copy(pos)
  m.rotation.y = yaw
  if (name) m.name = name
  return m
}

// ------------------------------------------------------------------ 光る材質

/** 光るもの（ブルームでにじむ）。color は HDR（1 を超えてよい） */
export function glowBasic(color: THREE.ColorRepresentation, opts: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color), toneMapped: false, fog: false, ...opts })
}

/** 加算で重ねる光（予告の帯・輪・後光など） */
export function additive(color: THREE.ColorRepresentation, opacity = 1, map?: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color),
    map: map ?? null,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  })
}

/**
 * ゆらぎ（裂ける所）の縦のすじ：ゆれる白青の線とまわりのにじみ（加算）。uK（0..1）で見え方。
 * 中庭の練習（nextmakeSite）と、12 章の時計台の上の大きなゆらぎで使う。color は芯の色（1 を超えてよい）。
 * billboard=true なら板がいつもカメラの方を向く（遠くの空に出すとき。板の大きさは形の寸法のまま）
 */
export function createSeamMaterial(color: THREE.Color = new THREE.Color(0.75, 1.1, 1.6), gain = 1.6, billboard = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: billboard
      ? /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy; gl_Position = projectionMatrix * mv; }`
      : /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uK; uniform vec3 uColor; uniform float uGain; varying vec2 vUv;
      void main() {
        float x = vUv.x - 0.5 + sin(vUv.y * 9.0 + uTime * 2.2) * 0.06 + sin(vUv.y * 23.0 - uTime * 3.1) * 0.025;
        float line = smoothstep(0.08, 0.0, abs(x));
        float halo = smoothstep(0.5, 0.0, abs(x)) * 0.25;
        float ends = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        float flick = 0.75 + 0.25 * sin(uTime * 7.0 + vUv.y * 5.0);
        float a = (line + halo) * ends * flick * uK;
        gl_FragColor = vec4(uColor * a * uGain, a);
      }`,
    uniforms: { uTime, uK: { value: 0.8 }, uColor: { value: color }, uGain: { value: gain } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  })
}

/** 透明なガラス（入口の屋根・ほこらの窓など）。モジュールで 1 つを使い回す（Batch で結合できる） */
let clearGlassMat: THREE.MeshStandardMaterial | null = null
export function clearGlass(): THREE.MeshStandardMaterial {
  if (clearGlassMat) return clearGlassMat
  clearGlassMat = new THREE.MeshStandardMaterial({ color: '#d6ecff', transparent: true, opacity: 0.3, roughness: 0.06, metalness: 0.15, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide })
  clearGlassMat.name = 'chronicle-clearGlass'
  return clearGlassMat
}

/** 中心が明るく外へ消える丸いぼかし（加算の板・後光に使う。モジュールで 1 枚を使い回す） */
let softDot: THREE.CanvasTexture | null = null
export function softDotTexture(): THREE.CanvasTexture {
  if (softDot && softDot.image) return softDot
  const cv = document.createElement('canvas')
  cv.width = cv.height = 128
  const g = cv.getContext('2d') as CanvasRenderingContext2D
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = gr
  g.fillRect(0, 0, 128, 128)
  softDot = new THREE.CanvasTexture(cv)
  return softDot
}

// ------------------------------------------------------------------ 変わる前の景色（ゴースト）

const ghostVert = /* glsl */ `
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`
const ghostFrag = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
uniform vec3 uColor;
uniform float uWipe;
varying vec3 vN;
varying vec3 vView;
varying vec3 vWorld;
float h(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
  float scan = 0.65 + 0.35 * sin(vWorld.y * 9.0 - uTime * 6.0);
  // 下から上へ、ほつれるように消える
  float n = h(vWorld * 2.5 + floor(uTime * 8.0) * 0.0);
  float edge = vWorld.y * 0.035 + n * 0.25;
  if (edge < uWipe) discard;
  float rim = smoothstep(uWipe + 0.08, uWipe, edge - 0.02);
  vec3 col = uColor * (0.35 + fres * 1.6) * scan + vec3(1.2, 1.6, 2.2) * rim * 1.5;
  gl_FragColor = vec4(col, uOpacity * (0.28 + fres * 0.6 + rim * 0.5));
}
`

/** 変わる前の景色を半透明の青い記憶として重ねる材質（ghostSwap が使う）。uOpacity・uWipe を動かす */
export function createGhostMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: ghostVert,
    fragmentShader: ghostFrag,
    uniforms: { uOpacity: { value: 1 }, uTime, uColor: { value: new THREE.Color(0.55, 0.85, 1.6) }, uWipe: { value: -1 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    fog: false,
  })
}
