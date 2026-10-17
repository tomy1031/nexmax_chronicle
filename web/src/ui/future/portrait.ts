// 左上のポートレート：主人公ネクマックスの実際の 3D モデル（createNexmax）の頭を、HUD 専用の小さな
// レンダラ（miniRenderer.ts）で 20fps 程度で描く。まばたき・待機の首振りはモデル自身の動き。
// 表情は HUD から setExpression（happy / determined / worried / surprised）。背中の鉱石は正面から
// 見えないので、鉱石の明るさは水色の縁の光（リムライト）の強さに映す。
// 費用：ドローコール約 21・三角形約 2.5 万を 1 辺 200px 前後に 20 回/秒。画面に出ていないとき・
// タブが裏のときは止まる（IntersectionObserver と requestAnimationFrame）。
import * as THREE from 'three'
import { createNexmax, type NexmaxCharacter } from '../../world/nexmax/nexmaxModel'
import type { MiniRenderer } from './miniRenderer'
import type { PortraitExpression } from './types'

/** 頭の首の付け根（モデル座標・全高 1.2m）から頭の中心までの高さ */
const HEAD_CENTER_ABOVE_PIVOT = 0.235
/** カメラの向き（モデルの正面 -Z から少し右上） */
const VIEW_DIR = new THREE.Vector3(0.16, 0.1, -1).normalize()

export class LivePortrait {
  readonly mini: MiniRenderer
  readonly el: HTMLCanvasElement
  private readonly nx: NexmaxCharacter
  private readonly scene = new THREE.Scene()
  private readonly cam = new THREE.PerspectiveCamera(21, 1, 0.05, 20)
  private readonly head: THREE.Object3D | null
  private readonly rim: THREE.DirectionalLight
  private readonly mirrors = new Set<CanvasRenderingContext2D>()
  private readonly tmpA = new THREE.Vector3()
  private readonly tmpB = new THREE.Vector3()
  private readonly tmpC = new THREE.Vector3()
  private readonly tmpQ = new THREE.Quaternion()
  private readonly io: IntersectionObserver | null = null
  private expr: PortraitExpression = 'happy'
  private oreLevel = 1
  private fps = 20
  private acc = 0
  private last = 0
  private raf = 0
  private visible = true
  private running = false
  private t = 0

  constructor(mini: MiniRenderer) {
    this.mini = mini
    this.el = mini.canvas
    this.el.classList.add('nx-portrait-canvas')
    this.nx = createNexmax(1.2)
    this.nx.autoExpression = false
    this.nx.setPose('idle')
    this.nx.setExpression('happy')
    this.scene.add(this.nx.root)
    this.head = this.nx.root.getObjectByName('head') ?? null
    this.scene.environment = mini.environment()
    this.scene.environmentIntensity = 0.5
    // スタジオの光（nexmax-preview の studio に近い）＋ 鉱石色の縁の光
    this.scene.add(new THREE.HemisphereLight('#eef7ff', '#5b7fae', 1.0))
    const key = new THREE.DirectionalLight('#ffffff', 2.2)
    key.position.set(-1.4, 2.2, -2.6)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight('#d6ecff', 0.75)
    fill.position.set(2.2, 0.4, -1.8)
    this.scene.add(fill)
    this.rim = new THREE.DirectionalLight('#59e6ff', 1.6)
    this.rim.position.set(0.6, 1.4, 2.6)
    this.scene.add(this.rim)
    mini.onRestore = () => this.renderNow()
    // 画面に出ていないときは描かない
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((es) => {
        for (const e of es) this.visible = e.isIntersecting
      })
      this.io.observe(this.el)
    }
    this.nx.update(0.016, 0)
    this.renderNow()
  }

  /** 1 秒あたりの描画回数（既定 20） */
  setFps(fps: number): void {
    this.fps = Math.max(4, Math.min(60, fps))
  }

  setExpression(e: PortraitExpression): void {
    if (e === this.expr) return
    this.expr = e
    this.nx.setExpression(e)
  }

  get expression(): PortraitExpression {
    return this.expr
  }

  /** 鉱石の明るさ（0 = 消灯、1 = 通常、2 以上 = 強く光る） */
  setOreGlow(v: number): void {
    this.oreLevel = Math.max(0, v)
    this.nx.setOreGlow(this.oreLevel)
  }

  /** 会話ウィンドウの顔など、同じ絵を写す 2D キャンバス */
  addMirror(ctx: CanvasRenderingContext2D): void {
    this.mirrors.add(ctx)
    this.copyTo(ctx)
  }

  removeMirror(ctx: CanvasRenderingContext2D): void {
    this.mirrors.delete(ctx)
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

  /** いまの絵を PNG の data URL に（ネクマックスの静止画アイコン用） */
  snapshot(): string | null {
    this.place()
    return this.mini.snapshot(this.scene, this.cam)
  }

  renderNow(): void {
    this.place()
    this.mini.render(this.scene, this.cam)
    for (const m of this.mirrors) this.copyTo(m)
  }

  dispose(): void {
    this.stop()
    this.io?.disconnect()
    this.mirrors.clear()
    this.nx.dispose()
  }

  private readonly loop = (now: number): void => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.loop)
    const dt = Math.min(0.25, (now - this.last) / 1000)
    this.last = now
    if (!this.visible || this.mini.lost) return
    this.acc += dt
    if (this.acc < 1 / this.fps) return
    const step = this.acc
    this.acc = 0
    this.t += step
    this.nx.update(step, 0)
    // 鉱石の光：ゆっくり脈打つ縁の光
    const pulse = 0.82 + 0.18 * Math.sin(this.t * 2.4)
    this.rim.intensity = (0.7 + 0.9 * Math.min(2.5, this.oreLevel)) * pulse
    this.renderNow()
  }

  /** カメラを頭の正面へ（首振りに半分だけついていく） */
  private place(): void {
    const target = this.tmpA
    if (this.head) {
      this.head.updateWorldMatrix(true, false)
      target.set(0, HEAD_CENTER_ABOVE_PIVOT, 0)
      this.head.localToWorld(target)
      this.head.getWorldQuaternion(this.tmpQ)
    } else {
      target.set(0, 0.94, 0)
      this.tmpQ.identity()
    }
    // 頭の前方（モデルの正面は -Z）と、少し右上からの固定の向きを混ぜる
    const headFwd = this.tmpB.set(0, 0, -1).applyQuaternion(this.tmpQ)
    const dir = this.tmpC.copy(VIEW_DIR).multiplyScalar(0.62).addScaledVector(headFwd, 0.38).normalize()
    this.cam.position.copy(target).addScaledVector(dir, 1.86)
    this.cam.lookAt(target.x, target.y - 0.045, target.z)
  }

  private copyTo(ctx: CanvasRenderingContext2D): void {
    const c = ctx.canvas
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(this.el, 0, 0, c.width, c.height)
  }
}
