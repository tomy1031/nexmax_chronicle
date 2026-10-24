// IDO は VR（物語 v7.2）：かんばんの QR を読むと、ネクマックスの見ている景色が記録の町になる（ネクマックスはゴーグルなしで、目の光で読む）。
// ・見えるだけ：少し上から、見回すだけ（歩けない・つかめない・話せない）。見回すのは、ふだんのカメラと同じ操作
//   （← → ↑ ↓・マウス・スマホは画面の右側をなぞる）。CameraRig の yaw・pitch をそのまま「見ている向き」に使う
// ・カメラ：シェルの CameraRig がネクマックスのうしろにカメラを置いたあと（ステージの animate）で、目の位置と向きに置きなおす
// ・画面のふちに、見ている景色だとわかる薄い枠と、記録の名前の札（説明の台詞は出さない）
// ・5 章などで石が鳴る（tick）と、枠が光って、見ているだけだった景色が本物になる（setReal）→ ネクマックスがその中へ落ちていく
//   （watch：カメラが落ちていくネクマックスを追う。ステージが床を足して、プレイヤーを景色の上へ移す）
import * as THREE from 'three'
import type { CameraRig } from '../../../player/cameraRig'
import type { Physics } from '../../../player/physics'
import type { BoxCollider } from '../../../world/colliders'
import type { MaterialLibrary } from '../../../render/materials'
import type { QualitySettings } from '../../../render/quality'
import type { QrRecord } from './qrStand'
import { buildRecordView, type RecordView, type RecordViewKind } from './recordViews'

export type { RecordViewKind } from './recordViews'

/** 記録の QR から、見る町（1726 → 路地／1186 → 寺／それ以外 → NEXTMAKE のビルの前） */
export function recordViewOf(rec: QrRecord): RecordViewKind {
  if (rec.seed === 1726) return 'edo1726'
  if (rec.seed === 1186) return 'ruins1186'
  return 'nextmake2026'
}

/** 見ている間の画角（度） */
const VR_FOV = 64

export class IdoVr {
  /** いま見ている町（見ていなければ null） */
  active: RecordViewKind | null = null
  private readonly parent: THREE.Object3D
  private readonly bc: { mats: MaterialLibrary; quality: QualitySettings }
  private readonly views: Partial<Record<RecordViewKind, RecordView>> = {}
  private view: RecordView | null = null
  private saved: { yaw: number; pitch: number; fov: number } | null = null
  /** カメラが追う物（落ちていくネクマックス）。null なら見回す向き */
  private watchAt: THREE.Vector3 | null = null
  private watchK = 0
  private readonly eye = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private readonly look = new THREE.Vector3()
  private floor: { phys: Physics; item: BoxCollider } | null = null
  private overlay: VrOverlay | null = null

  constructor(parent: THREE.Object3D, mats: MaterialLibrary, quality: QualitySettings) {
    this.parent = parent
    this.bc = { mats, quality }
  }

  /** 画面の枠を出す所（#ui。シェルの HUD の下に重ねる） */
  attachUi(host: HTMLElement): void {
    this.overlay?.dispose()
    this.overlay = new VrOverlay(host)
  }

  /** 町を組む（はじめて見るとき。暗転の間に呼ぶ） */
  prepare(kind: RecordViewKind): RecordView {
    let v = this.views[kind]
    if (!v) {
      v = buildRecordView(kind, this.bc)
      v.group.visible = false
      this.parent.add(v.group)
      this.views[kind] = v
    }
    return v
  }

  /** 見はじめる：カメラの向きを町の見る向きにする（もどすときのために、今の向きを覚える） */
  enter(kind: RecordViewKind, caption: string, camRig: CameraRig, camera: THREE.PerspectiveCamera): void {
    const v = this.prepare(kind)
    if (this.view && this.view !== v) this.view.group.visible = false
    this.view = v
    v.group.visible = true
    this.active = kind
    if (!this.saved) this.saved = { yaw: camRig.yaw, pitch: camRig.pitch, fov: camera.fov }
    camRig.yaw = v.yaw
    camRig.pitch = v.pitch
    this.watchAt = null
    this.watchK = 0
    this.overlay?.show(caption)
  }

  /** 見るのをやめる（カメラの向き・画角をもどす。町は次のためにかくしておく） */
  exit(camRig: CameraRig, camera: THREE.PerspectiveCamera): void {
    if (this.view) this.view.group.visible = false
    this.view = null
    this.active = null
    this.watchAt = null
    if (this.saved) {
      camRig.yaw = this.saved.yaw
      camRig.pitch = this.saved.pitch
      camera.fov = this.saved.fov
      camera.updateProjectionMatrix()
    }
    this.saved = null
    this.overlay?.hide()
    this.removeFloor()
  }

  /** 毎フレーム（ステージの animate。シェルのカメラのあと）：目の位置と見ている向きにカメラを置く */
  apply(camera: THREE.PerspectiveCamera, camRig: CameraRig, dt: number): void {
    const v = this.view
    if (!v) return
    this.eye.copy(v.eye).add(v.group.position)
    // 見回す向き（CameraRig の yaw はカメラが置かれる側、pitch はカメラの高さの角。見る向きはその反対）
    const cp = Math.cos(camRig.pitch)
    this.dir.set(-Math.sin(camRig.yaw) * cp, -Math.sin(camRig.pitch), -Math.cos(camRig.yaw) * cp)
    this.look.copy(this.eye).add(this.dir)
    // 落ちていくネクマックスを追う（なめらかに向ける）
    this.watchK += ((this.watchAt ? 1 : 0) - this.watchK) * Math.min(1, dt * 4)
    if (this.watchAt && this.watchK > 0.001) this.look.lerp(this.watchAt, this.watchK)
    camera.position.copy(this.eye)
    camera.lookAt(this.look)
    if (Math.abs(camera.fov - VR_FOV) > 0.01) {
      camera.fov = VR_FOV
      camera.updateProjectionMatrix()
    }
  }

  /** 町の動き（人・鳥・旗）と、枠 */
  update(dt: number): void {
    if (this.view) this.view.update(dt)
    this.overlay?.update(dt)
  }

  /** 背中の石の音（コチ）。k は強さ（1 前後） */
  tick(k = 1): void {
    this.overlay?.tick(k)
  }

  /** 見ているだけだった景色が、本物になる（枠が光って消える） */
  setReal(): void {
    this.overlay?.real()
  }

  /** カメラが追う物（null で見回す向きへもどす） */
  watch(target: THREE.Vector3 | null): void {
    this.watchAt = target
  }

  /** 目の位置・下りる所（ワールド） */
  eyeWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const v = this.view
    return v ? out.copy(v.eye).add(v.group.position) : out.set(0, 0, 0)
  }

  landWorld(out = new THREE.Vector3()): THREE.Vector3 {
    const v = this.view
    return v ? out.copy(v.land).add(v.group.position) : out.set(0, 0, 0)
  }

  /** 見ている向き（水平・単位） */
  forward(camRig: CameraRig, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.sin(camRig.yaw), 0, -Math.cos(camRig.yaw))
  }

  /** 本当に入っていくときの床（下りる所のまわり。見るのをやめると外す） */
  addFloor(phys: Physics): void {
    const v = this.view
    if (!v || this.floor) return
    const c = this.landWorld()
    const item: BoxCollider = { kind: 'box', center: new THREE.Vector3(c.x, c.y - 0.5, c.z), half: new THREE.Vector3(14, 0.5, 14), rotY: 0 }
    phys.add(item)
    this.floor = { phys, item }
  }

  private removeFloor(): void {
    if (!this.floor) return
    this.floor.phys.remove(this.floor.item)
    this.floor = null
  }

  dispose(): void {
    this.removeFloor()
    this.overlay?.dispose()
    this.overlay = null
  }
}

// ------------------------------------------------------------------ 画面の枠（DOM）

/**
 * 見ている景色だとわかる、うすい枠：画面のふちの水色のかすみ・四すみのかぎ・上のまん中に記録の名前の札。
 * 石が鳴ると、下から水色の光の輪がひろがって「コチ」。本物になると、枠が白く光って消える
 */
class VrOverlay {
  private readonly el: HTMLDivElement
  private readonly cap: HTMLDivElement
  private readonly tickEl: HTMLDivElement
  private readonly glow: HTMLDivElement
  private tickT = -1
  private tickK = 1
  private realT = -1

  constructor(host: HTMLElement) {
    this.el = document.createElement('div')
    this.el.className = 'ido-vr'
    this.el.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 0.4s ease;display:none;'
    const vig = document.createElement('div')
    vig.style.cssText =
      'position:absolute;inset:0;background:radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(40,150,210,0.18) 82%, rgba(10,40,80,0.55) 100%);' +
      'box-shadow:inset 0 0 0 2px rgba(140,230,255,0.35);'
    const scan = document.createElement('div')
    scan.style.cssText = 'position:absolute;inset:0;opacity:0.10;background:repeating-linear-gradient(0deg, rgba(180,240,255,0.9) 0px, rgba(180,240,255,0.9) 1px, transparent 1px, transparent 4px);'
    this.glow = document.createElement('div')
    this.glow.style.cssText = 'position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 108%, rgba(120,220,255,0.95) 0%, rgba(80,180,255,0.35) 32%, rgba(0,0,0,0) 60%);'
    const corners = ['top:3.2%;left:2.4%;border-width:3px 0 0 3px', 'top:3.2%;right:2.4%;border-width:3px 3px 0 0', 'bottom:3.2%;left:2.4%;border-width:0 0 3px 3px', 'bottom:3.2%;right:2.4%;border-width:0 3px 3px 0'].map((pos) => {
      const c = document.createElement('div')
      c.style.cssText = `position:absolute;${pos};width:7vmin;height:7vmin;border-style:solid;border-color:rgba(150,235,255,0.75);border-radius:6px;filter:drop-shadow(0 0 6px rgba(80,200,255,0.8));`
      return c
    })
    this.cap = document.createElement('div')
    this.cap.style.cssText =
      'position:absolute;left:50%;top:12%;transform:translateX(-50%);padding:0.35em 1.1em;border-radius:999px;white-space:nowrap;' +
      'background:rgba(8,28,64,0.62);border:2px solid rgba(140,230,255,0.7);color:#eaf9ff;font-weight:800;' +
      "font-family:var(--ui-font,'M PLUS Rounded 1c',sans-serif);font-size:clamp(12px,2.2vmin,20px);letter-spacing:0.04em;text-shadow:0 0 8px rgba(80,200,255,0.8);"
    this.tickEl = document.createElement('div')
    this.tickEl.textContent = 'コチ'
    this.tickEl.style.cssText =
      'position:absolute;left:50%;bottom:22%;transform:translate(-50%,0) scale(1);opacity:0;color:#bff2ff;font-weight:900;' +
      "font-family:var(--ui-font,'M PLUS Rounded 1c',sans-serif);font-size:clamp(20px,5vmin,44px);text-shadow:0 0 14px rgba(80,200,255,1),0 0 4px #fff;"
    this.el.append(vig, scan, this.glow, ...corners, this.cap, this.tickEl)
    host.insertBefore(this.el, host.firstChild)
  }

  show(caption: string): void {
    this.cap.textContent = caption
    this.el.style.display = 'block'
    this.el.style.transition = 'opacity 0.4s ease'
    void this.el.offsetWidth
    this.el.style.opacity = '1'
    this.realT = -1
    this.glow.style.opacity = '0'
  }

  hide(): void {
    this.el.style.opacity = '0'
    this.el.style.display = 'none'
    this.tickT = -1
    this.realT = -1
  }

  tick(k: number): void {
    this.tickT = 0
    this.tickK = k
  }

  real(): void {
    this.realT = 0
  }

  update(dt: number): void {
    if (this.tickT >= 0) {
      this.tickT += dt
      const t = this.tickT / 0.45
      if (t >= 1) {
        this.tickT = -1
        this.tickEl.style.opacity = '0'
        if (this.realT < 0) this.glow.style.opacity = '0'
      } else {
        this.tickEl.style.opacity = (Math.sin(t * Math.PI) * Math.min(1, this.tickK)).toFixed(3)
        this.tickEl.style.transform = `translate(-50%,${(-t * 30).toFixed(1)}px) scale(${(1 + t * 0.25 * this.tickK).toFixed(3)})`
        if (this.realT < 0) this.glow.style.opacity = (Math.sin(t * Math.PI) * 0.5 * Math.min(1.6, this.tickK)).toFixed(3)
      }
    }
    if (this.realT >= 0) {
      // 枠が白く光って、ゆっくり消える（見ているだけの景色が、本物になった）
      this.realT += dt
      const t = this.realT
      this.glow.style.opacity = (t < 0.3 ? t / 0.3 : Math.max(0, 1 - (t - 0.3) / 0.8)).toFixed(3)
      this.el.style.opacity = Math.max(0, 1 - Math.max(0, t - 0.5) / 0.6).toFixed(3)
      if (t > 1.2) {
        this.realT = -1
        this.el.style.display = 'none'
      }
    }
  }

  dispose(): void {
    this.el.remove()
  }
}
