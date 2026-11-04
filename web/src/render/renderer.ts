// レンダラ・太陽光（影はプレイヤー／注目点に追従）・半球光・適応ピクセル比。
import * as THREE from 'three'
import { SHADOW_ONLY_LAYER } from './batch'
import type { QualitySettings } from './quality'

export function createRenderer(container: HTMLElement, q: QualitySettings): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: false, // SMAA を後段で使う
    powerPreference: 'high-performance',
    stencil: false,
    depth: true,
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping // トーンマップは後処理（GradeEffect）で行う
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.maxPixelRatio))
  renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight)
  renderer.info.autoReset = false
  // 公開版では、シェーダを作るたびのエラー確認（getShaderInfoLog など）をしない。確認の呼び出しは作り終わるまで待つので、
  // 裏で並行して作る仕組み（KHR_parallel_shader_compile・compileAsync）が活きず、読みこみの CPU 時間の大半を占めていた
  renderer.debug.checkShaderErrors = import.meta.env.DEV
  includeShadowOnlyLayer(renderer.shadowMap)
  container.appendChild(renderer.domElement)
  return renderer
}

/**
 * three の影は、影のカメラではなく「画面のカメラ」の層で、影を落とす物を選ぶ（WebGLShadowMap の renderObject）。
 * そのままでは影用の形（SHADOW_ONLY_LAYER。render/batch.ts の区画ごとの影の形・影用の葉のカード）が影に入らない。
 * 影を描くあいだだけ、画面のカメラの層に SHADOW_ONLY_LAYER を足す（画面に描く物は、その前に選び終わっている）
 */
export function includeShadowOnlyLayer(sm: Pick<THREE.WebGLShadowMap, 'render'>): void {
  const render = sm.render.bind(sm)
  sm.render = (lights, scene, camera) => {
    const mask = camera.layers.mask
    camera.layers.enable(SHADOW_ONLY_LAYER)
    try {
      render(lights, scene, camera)
    } finally {
      camera.layers.mask = mask
    }
  }
}

export type SunRig = {
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  sunDir: THREE.Vector3
  /** 影カメラを注目点へ（テクセル単位でスナップしてチラつきを防ぐ） */
  follow(focus: THREE.Vector3): void
  /** 画質を変える（影の解像度・ぼかし。影のテクスチャは次の描画で作り直される） */
  setQuality(q: QualitySettings): void
}

export function createSunRig(scene: THREE.Scene, q: QualitySettings, sunDir: THREE.Vector3): SunRig {
  const dir = sunDir.clone().normalize()
  const sun = new THREE.DirectionalLight('#ffd09a', 4.0)
  sun.castShadow = true
  const ext = 17
  sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize)
  const cam = sun.shadow.camera
  cam.left = -ext
  cam.right = ext
  cam.top = ext
  cam.bottom = -ext
  cam.near = 1
  cam.far = 140
  sun.shadow.bias = -0.0004
  sun.shadow.normalBias = 0.03
  sun.shadow.radius = q.shadowRadius
  scene.add(sun, sun.target)

  const hemi = new THREE.HemisphereLight('#a9cdf5', '#a5744a', 0.4)
  scene.add(hemi)

  // ライト空間の基底
  const fwd = dir.clone().negate()
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize()
  let texel = (ext * 2) / q.shadowMapSize
  const f = new THREE.Vector3()

  return {
    sun,
    hemi,
    sunDir: dir,
    follow(focus: THREE.Vector3) {
      const r = focus.dot(right)
      const u = focus.dot(up)
      const sr = Math.round(r / texel) * texel
      const su = Math.round(u / texel) * texel
      f.copy(focus)
        .addScaledVector(right, sr - r)
        .addScaledVector(up, su - u)
      sun.target.position.copy(f)
      sun.position.copy(f).addScaledVector(dir, 70)
      sun.target.updateMatrixWorld()
      sun.updateMatrixWorld()
    },
    setQuality(q: QualitySettings) {
      sun.shadow.radius = q.shadowRadius
      if (sun.shadow.mapSize.x === q.shadowMapSize) return
      sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      texel = (ext * 2) / q.shadowMapSize
    },
  }
}

/**
 * フレーム時間に応じてピクセル比を上下させる。目標はフレームレートの上限（30 か 60）。
 * 上限で間引いているときは「速すぎる」は測れないので、上限どおりに描けている状態が続いたら少しずつ戻す
 */
/** 適応解像度のはじめの比（上限がこれより高いときは、余裕を見て上げていく） */
export const ADAPTIVE_START = 1.0

export class AdaptiveResolution {
  private acc = 0
  /** この区間の 1 フレームごとの時間（中央値をとる） */
  private readonly times: number[] = []
  private cooldown = 0
  ratio: number
  private min: number
  private max: number
  private target: number
  private readonly apply: (ratio: number) => void
  /** 下げた直後は、下げる前の少し手前までしか戻さない（上げ下げをくり返して引っかからないように） */
  private ceiling = Infinity
  private ceilingT = 0

  constructor(min: number, max: number, apply: (ratio: number) => void, targetFps = 60) {
    this.min = min
    this.max = max
    this.apply = apply
    // はじめは 1.0 まで（上限が高いときに、弱い GPU で最初の数秒が重くならないように）。余裕があれば 0.1 ずつ上限まで上げる
    this.ratio = Math.min(max, ADAPTIVE_START)
    this.target = targetFps
  }

  private fastWindows = 0

  /** 上限・下限・目標を変える（画質の設定から）。いまの比が範囲の外なら合わせる */
  configure(min: number, max: number, targetFps: number): void {
    this.min = min
    this.max = max
    this.target = targetFps
    this.ceiling = Infinity
    this.ceilingT = 0
    this.fastWindows = 0
    this.hold(2)
    const next = Math.round(Math.min(max, Math.max(min, this.ratio)) * 100) / 100
    if (next !== this.ratio) {
      this.ratio = next
      this.apply(next)
    }
  }

  /**
   * しばらく判断しない（ステージを読みこんだ直後など。最初の数秒はシェーダを作る・画像を送るなどの一度きりの引っかかりが多く、
   * それを「重い」と見て解像度を下げると、上限まで戻るのに 45 秒以上かかっていた）
   */
  hold(seconds: number): void {
    this.cooldown = Math.max(this.cooldown, seconds)
    this.acc = 0
    this.times.length = 0
  }

  /**
   * 1.5 秒ごとの、1 フレームの時間の中央値で解像度を上下させる（平均だと、数回の引っかかりで下げてしまう）。
   * 解像度を変えるとレンダーターゲットを作り直すため一瞬止まる。何度も上げ下げして引っかからないよう、
   * 下げるのは素早く（大きく）、上げるのは「余裕のある状態が続いたとき」だけにする。
   */
  sample(dt: number): void {
    this.acc += dt
    this.times.push(dt)
    this.cooldown -= dt
    this.ceilingT -= dt
    if (this.acc < 1.5) return
    const sorted = this.times.slice().sort((a, b) => a - b)
    const avg = sorted[sorted.length >> 1]
    this.acc = 0
    this.times.length = 0
    if (this.cooldown > 0) return
    const iv = 1 / this.target
    let next = this.ratio
    if (avg > iv * 1.5) {
      next = Math.max(this.min, this.ratio - 0.25)
      this.fastWindows = 0
    } else if (avg > iv * 1.2) {
      next = Math.max(this.min, this.ratio - 0.1)
      this.fastWindows = 0
    } else if (avg < iv * 1.04) {
      this.fastWindows++
      const cap = this.ceilingT > 0 ? Math.min(this.max, this.ceiling) : this.max
      if (this.fastWindows >= 4 && this.ratio < cap) {
        next = Math.min(cap, this.ratio + 0.1)
        this.fastWindows = 0
      }
    } else this.fastWindows = 0
    next = Math.round(next * 100) / 100
    if (next !== this.ratio) {
      if (next < this.ratio) {
        this.ceiling = Math.max(this.min, this.ratio - 0.05)
        this.ceilingT = 45
      }
      this.ratio = next
      this.cooldown = 4
      this.apply(next)
    }
  }
}

/**
 * シェーダの事前の準備（renderer.compile）は、層に関係なく場面の全部の形の材質から作る。
 * 影だけの形（SHADOW_ONLY_LAYER。法線を持たない）や描かない層へ移した部品は画面には描かないのに、
 * 「法線なし」の版などが別に作られていた（2086 年で 8 本）。準備のあいだだけ、カメラに見えない形の材質を外す。
 * 戻す関数を返す（compileAsync は呼んだその場で材質を集めるので、呼んだ直後に戻してよい）
 */
export function hideUnseenFromCompile(scene: THREE.Object3D, camera: THREE.Camera): () => void {
  const held: [THREE.Mesh, THREE.Mesh['material']][] = []
  scene.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.material || m.layers.test(camera.layers)) return
    held.push([m, m.material])
    ;(m as { material: THREE.Mesh['material'] | null }).material = null
  })
  return () => {
    for (const [m, mat] of held) m.material = mat
  }
}
