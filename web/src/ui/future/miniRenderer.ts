// HUD 専用の小さな WebGL レンダラ（1 つだけ）。ゲーム本体のレンダラ・ポストエフェクトとは独立。
// ・キャンバス自体が左上のポートレートとして画面に出る（ネクマックスの頭を 20fps 程度で描く）
// ・話者アイコンを作るときは、同じキャンバスへ一瞬だけ別のシーンを描いて画像にし、すぐポートレートを描き直す
//   （同じ処理の中で描き直すので画面には出ない）
// 作れなかった・失われたときは null / lost になり、HUD は SVG の絵に切り替える。
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

export class MiniRenderer {
  readonly renderer: THREE.WebGLRenderer
  readonly canvas: HTMLCanvasElement
  size: number
  lost = false
  /** スナップショットでキャンバスを上書きしたあとに呼ぶ（ポートレートの描き直し） */
  onRestore: (() => void) | null = null
  /** コンテキストが失われたとき */
  onLost: (() => void) | null = null
  private env: THREE.Texture | null = null
  private pmrem: THREE.PMREMGenerator | null = null

  private constructor(renderer: THREE.WebGLRenderer, size: number) {
    this.renderer = renderer
    this.canvas = renderer.domElement
    this.size = size
    renderer.setPixelRatio(1)
    renderer.setSize(size, size, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.setClearColor(0x000000, 0)
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
      this.onLost?.()
    })
  }

  /** 作れなければ null（WebGL が使えない・コンテキストの上限など） */
  static create(size: number): MiniRenderer | null {
    try {
      const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false })
      return new MiniRenderer(r, size)
    } catch (e) {
      console.warn('[hudFuture] ポートレート用のレンダラを作れませんでした', e)
      return null
    }
  }

  setSize(px: number): void {
    const s = Math.round(px)
    if (s === this.size) return
    this.size = s
    this.renderer.setSize(s, s, false)
  }

  /** 部屋の照り返し（PBR の材質がくすまないように）。初回だけ作る */
  environment(): THREE.Texture {
    if (!this.env) {
      this.pmrem = new THREE.PMREMGenerator(this.renderer)
      const room = new RoomEnvironment()
      this.env = this.pmrem.fromScene(room, 0.04).texture
      room.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.geometry.dispose()
          ;(m.material as THREE.Material).dispose()
        }
      })
    }
    return this.env
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.lost) return
    this.renderer.render(scene, camera)
  }

  /** 一度だけ描いて PNG の data URL にする（その後ポートレートを描き直す） */
  snapshot(scene: THREE.Scene, camera: THREE.Camera): string | null {
    if (this.lost) return null
    let url: string | null = null
    try {
      this.renderer.render(scene, camera)
      url = this.canvas.toDataURL('image/png')
    } catch (e) {
      console.warn('[hudFuture] アイコンを作れませんでした', e)
    }
    this.onRestore?.()
    return url
  }

  dispose(): void {
    this.env?.dispose()
    this.pmrem?.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }
}
