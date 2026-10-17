// レンダラ・太陽光（影はプレイヤー／注目点に追従）・半球光・適応ピクセル比。
import * as THREE from 'three'
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
  container.appendChild(renderer.domElement)
  return renderer
}

export type SunRig = {
  sun: THREE.DirectionalLight
  hemi: THREE.HemisphereLight
  sunDir: THREE.Vector3
  /** 影カメラを注目点へ（テクセル単位でスナップしてチラつきを防ぐ） */
  follow(focus: THREE.Vector3): void
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
  sun.shadow.radius = q.level === 'high' ? 3 : 2
  scene.add(sun, sun.target)

  const hemi = new THREE.HemisphereLight('#a9cdf5', '#a5744a', 0.4)
  scene.add(hemi)

  // ライト空間の基底
  const fwd = dir.clone().negate()
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize()
  const texel = (ext * 2) / q.shadowMapSize
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
  }
}

/** フレーム時間に応じてピクセル比を上下させる */
export class AdaptiveResolution {
  private acc = 0
  private frames = 0
  private cooldown = 0
  ratio: number
  private readonly min: number
  private readonly max: number
  private readonly apply: (ratio: number) => void

  constructor(min: number, max: number, apply: (ratio: number) => void) {
    this.min = min
    this.max = max
    this.apply = apply
    this.ratio = max
  }

  sample(dt: number): void {
    this.acc += dt
    this.frames++
    this.cooldown -= dt
    if (this.acc < 1.5) return
    const avg = this.acc / this.frames
    this.acc = 0
    this.frames = 0
    if (this.cooldown > 0) return
    let next = this.ratio
    if (avg > 1 / 45) next = Math.max(this.min, this.ratio - 0.15)
    else if (avg < 1 / 58 && this.ratio < this.max) next = Math.min(this.max, this.ratio + 0.1)
    if (next !== this.ratio) {
      this.ratio = next
      this.cooldown = 2
      this.apply(next)
    }
  }
}
