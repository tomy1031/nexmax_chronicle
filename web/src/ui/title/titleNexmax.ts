// タイトル画面のネクマックス（実際の 3D モデル createNexmax を、タイトル専用の小さな WebGL で全身で描く）。
// 最初に一度手を振り、あとは待機（まばたき・首振りはモデル自身の動き）。背中の鉱石の縁の光をゆっくり脈打たせる。
// ゲームを始めるときに dispose（WebGL のコンテキストも手放す）。アプリのアイコン作り（scripts/make-icons.mjs）にも使う。
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createNexmax, type NexmaxCharacter } from '../../world/nexmax/nexmaxModel'
import { setOutlineViewport } from '../../world/nexmax/materials'

export type TitleNexmaxFrame = 'full' | 'head'

export class TitleNexmax {
  readonly canvas: HTMLCanvasElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly cam = new THREE.PerspectiveCamera(24, 1, 0.05, 30)
  private readonly nx: NexmaxCharacter
  private readonly rim: THREE.DirectionalLight
  private readonly pmrem: THREE.PMREMGenerator
  private readonly env: THREE.Texture
  private raf = 0
  private last = 0
  private t = 0
  private waveLeft = 0
  private running = false
  private readonly reduced: boolean
  private frame: TitleNexmaxFrame

  /** 作れなければ例外（呼ぶ側で 2D の絵にする） */
  constructor(frame: TitleNexmaxFrame = 'full', opts: { preserve?: boolean } = {}) {
    this.frame = frame
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power', preserveDrawingBuffer: !!opts.preserve })
    this.canvas = this.renderer.domElement
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.setClearColor(0x000000, 0)
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

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
    this.scene.environment = this.env
    this.scene.environmentIntensity = 0.45

    this.nx = createNexmax(1.2)
    this.nx.autoExpression = false
    this.nx.setExpression('happy')
    this.nx.setPose('idle')
    this.nx.setOreGlow(1.2)
    // 少しだけメニューの方（右）を向く
    this.nx.root.rotation.y = frame === 'head' ? -0.28 : -0.42
    this.scene.add(this.nx.root)

    // 夜の会場の光：正面左上から白い主光、右から水色の補助、背中から鉱石色の縁の光
    this.scene.add(new THREE.HemisphereLight('#e8f4ff', '#3b4f8a', 0.9))
    const key = new THREE.DirectionalLight('#ffffff', 2.3)
    key.position.set(-1.6, 2.4, -2.6)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight('#bfe6ff', 0.7)
    fill.position.set(2.4, 0.6, -1.6)
    this.scene.add(fill)
    this.rim = new THREE.DirectionalLight('#59e6ff', 2.2)
    this.rim.position.set(0.8, 1.6, 2.6)
    this.scene.add(this.rim)
    this.place()
  }

  /** 表示の大きさ（CSS の px）。描画は端末の画素比（2 まで） */
  setSize(w: number, h: number): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    this.renderer.setPixelRatio(dpr)
    this.renderer.setSize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), false)
    this.cam.aspect = w / Math.max(1, h)
    this.place()
    this.render()
  }

  /** 手を振る（秒） */
  wave(sec = 2.4): void {
    if (this.reduced) return
    this.waveLeft = sec
    this.nx.setPose('wave')
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  /** いまの姿勢で 1 回描く */
  render(): void {
    // 輪郭線の最小の太さはこのキャンバスの解像度で（ゲームが始まると game.ts が入れ直す）
    setOutlineViewport(this.renderer.getDrawingBufferSize(this.tmp2).y)
    this.renderer.render(this.scene, this.cam)
  }

  /** モデルを t 秒ぶん進める（アイコン作りで、まばたきの途中にならない時刻にそろえる） */
  advance(sec: number, step = 1 / 30): void {
    for (let s = 0; s < sec; s += step) this.nx.update(step, 0)
  }

  dispose(): void {
    this.stop()
    this.nx.dispose()
    this.env.dispose()
    this.pmrem.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.canvas.remove()
  }

  private readonly tmp = new THREE.Vector3()
  private readonly tmp2 = new THREE.Vector2()

  /** カメラ：全身なら足もとから頭まで、頭なら顔のアップ（どちらもモデルの正面 -Z 側から） */
  private place(): void {
    if (this.frame === 'head') {
      this.cam.fov = 22
      const look = this.tmp.set(0, 0.9, 0)
      this.cam.position.set(0.12, 1.0, -2.05)
      this.cam.lookAt(look)
    } else {
      this.cam.fov = 24
      // 縦長の枠でも横長の枠でも、全身（高さ 1.2m ＋ 余白）が入る距離
      const vFit = 1.55 / (2 * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2))
      const dist = this.cam.aspect >= 0.8 ? vFit : vFit * (0.8 / this.cam.aspect)
      this.cam.position.set(0.18, 0.78, -dist)
      this.cam.lookAt(this.tmp.set(0, 0.6, 0))
    }
    this.cam.updateProjectionMatrix()
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.t += dt
    if (this.waveLeft > 0) {
      this.waveLeft -= dt
      if (this.waveLeft <= 0) this.nx.setPose('idle')
    }
    // 鉱石の縁の光：4 秒でゆっくり脈打つ
    this.rim.intensity = 1.8 + (this.reduced ? 0 : Math.sin(this.t * 1.6) * 0.5)
    this.nx.update(dt, 0)
    this.render()
  }
}
