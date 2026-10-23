// 目標の目印：いまやることの相手（ソラ・風船・共鳴レンズのケース・中継アンテナ など）の頭の上に、上下に弾む金色の「！」と名前の札を出す。
// ステージの objectiveMarkers(rt) が返す位置（目印の先端を置くワールド座標）を毎フレーム画面へ映す。
// 画面の外・カメラの後ろにあるときは、edge の目印だけ画面の縁に寄せて、向きを矢印で示す（名前の札は隠す）。
// 会話・カメラの演出・操作を止めている間・一時停止中はシェルが隠す。DOM だけ（3D の資源は持たない）。見た目は game.css の .obj-mark。
import * as THREE from 'three'
import { toTouchText } from '../player/touchLogic'

export type ObjectiveMark = {
  /** 目印の先端（▼の先）を置くワールド座標。頭の少し上・物の少し上 */
  pos: THREE.Vector3
  /** 名前の札（「ソラ」「風船」など）。無ければ札なし */
  label?: string
  /** 画面の外にあるとき縁に寄せて向きを示すか（既定 true）。候補を並べるとき（試みの一覧）は false */
  edge?: boolean
}

export type MarkerPlacement = { x: number; y: number; edge: boolean; angle: number }

/**
 * 目印を置く画面の位置（px）。cam はカメラ座標（-Z が前）、ndc は射影した位置（cam.z < 0 のときだけ意味がある）。
 * 画面の内側（縁から margin/2 より内）ならそのまま、そうでなければ画面の中心から目標の方向へ、縁から margin の所に寄せる。
 * angle は縁に寄せたときの矢印の向き（画面の右 = 0、下 = +π/2）
 */
export function placeMarker(cam: { x: number; y: number; z: number }, ndc: { x: number; y: number }, w: number, h: number, margin = 56): MarkerPlacement {
  const front = cam.z < -0.05
  if (front && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1) {
    const x = (ndc.x * 0.5 + 0.5) * w
    const y = (-ndc.y * 0.5 + 0.5) * h
    const m = margin * 0.5
    if (x >= m && x <= w - m && y >= m && y <= h - m) return { x, y, edge: false, angle: Math.PI / 2 }
  }
  // 画面の上の向き：前にある点は射影の向き（カメラ座標の x, -y に比例）、後ろの点もカメラ座標の x, -y で左右・上下を決める
  let dx = cam.x
  let dy = -cam.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-4) {
    // 真後ろ：下の縁
    dx = 0
    dy = 1
  } else {
    dx /= len
    dy /= len
  }
  const hx = Math.max(1, w / 2 - margin)
  const hy = Math.max(1, h / 2 - margin)
  const t = Math.min(Math.abs(dx) > 1e-6 ? hx / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hy / Math.abs(dy) : Infinity)
  return { x: w / 2 + dx * t, y: h / 2 + dy * t, edge: true, angle: Math.atan2(dy, dx) }
}

/** 遠いほど少し小さく（近くで 1.1、40m で 0.75） */
export function markerScale(distance: number): number {
  return Math.min(1.1, Math.max(0.75, 1.15 - distance / 90))
}

const MAX_MARKS = 4

type MarkEl = { root: HTMLDivElement; label: HTMLDivElement; arrow: HTMLDivElement; text: string; shown: boolean }

export class ObjectiveMarkerFx {
  private readonly host: HTMLDivElement
  private readonly els: MarkEl[] = []
  private readonly cam = new THREE.Vector3()
  private readonly ndc = new THREE.Vector3()

  constructor(ui: HTMLElement) {
    this.host = document.createElement('div')
    this.host.className = 'obj-marks'
    // 会話ウィンドウ・HUD より後ろ（#ui のいちばん下の黒帯のすぐ上）
    ui.insertBefore(this.host, ui.firstChild?.nextSibling ?? null)
  }

  private el(i: number): MarkEl {
    let e = this.els[i]
    if (!e) {
      const root = document.createElement('div')
      root.className = 'obj-mark'
      root.innerHTML = '<div class="om-bob"><div class="om-badge"><span>!</span></div><div class="om-tip"></div></div><div class="om-arrow"></div><div class="om-label"></div>'
      root.hidden = true
      this.host.appendChild(root)
      e = { root, label: root.querySelector('.om-label') as HTMLDivElement, arrow: root.querySelector('.om-arrow') as HTMLDivElement, text: '', shown: false }
      this.els[i] = e
    }
    return e
  }

  /** 毎フレーム：marks を画面に置く（null・空なら隠す）。camera の行列は呼ぶ側で新しくしておく */
  update(camera: THREE.PerspectiveCamera, marks: readonly ObjectiveMark[] | null, w: number, h: number): void {
    const n = marks ? Math.min(MAX_MARKS, marks.length) : 0
    for (let i = 0; i < Math.max(n, this.els.length); i++) {
      const m = i < n && marks ? marks[i] : null
      if (!m) {
        const e = this.els[i]
        if (e?.shown) {
          e.shown = false
          e.root.hidden = true
        }
        continue
      }
      const e = this.el(i)
      this.cam.copy(m.pos).applyMatrix4(camera.matrixWorldInverse)
      this.ndc.copy(m.pos).project(camera)
      const p = placeMarker(this.cam, this.ndc, w, h)
      const visible = !p.edge || m.edge !== false
      if (!visible) {
        if (e.shown) {
          e.shown = false
          e.root.hidden = true
        }
        continue
      }
      if (!e.shown) {
        e.shown = true
        e.root.hidden = false
      }
      const text = m.label ?? ''
      if (text !== e.text) {
        e.text = text
        // スマホでは、キーの言い方（「J でつかむ」など）をボタンの言い方に
        e.label.textContent = document.documentElement.classList.contains('touch-ui') ? toTouchText(text) : text
        e.label.hidden = !text
      }
      e.root.classList.toggle('edge', p.edge)
      const s = p.edge ? 0.85 : markerScale(-this.cam.z)
      e.root.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${s.toFixed(3)})`
      if (p.edge) e.arrow.style.transform = `rotate(${p.angle.toFixed(3)}rad)`
    }
  }

  hide(): void {
    for (const e of this.els) {
      if (!e.shown) continue
      e.shown = false
      e.root.hidden = true
    }
  }

  dispose(): void {
    this.host.remove()
    this.els.length = 0
  }
}
