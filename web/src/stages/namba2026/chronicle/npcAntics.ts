// 町の人（社長・佐伯さん）の大きな身ぶりと、頭の上の記号（物語 v7.1：社長がパラドックスに大さわぎする）。
// 人のモデル（GLB）は関節が無いので、体ごと動かす：とびあがる・ふるえる・頭をかかえる（前にかがんで左右にゆれる）・のけぞる・てれる。
// 頭の上には「！」「!?」「？」「ぐるぐる」「あせ」の記号（キャンバスの絵の Sprite）を出す。
// animate で人の update のあとに呼ぶ（root の高さ・傾きを上から書く。歩き・向きはそのまま）。
import * as THREE from 'three'
import { makeCanvas } from '../../../render/textures'

export type AnticKind = 'jump' | 'hop2' | 'shake' | 'headHold' | 'leanBack' | 'shy'
export type EmoteKind = 'bang' | 'bangq' | 'q' | 'swirl' | 'sweat' | 'note'

type Body = { root: THREE.Object3D; height: number }
type Active = { ch: Body; kind: AnticKind; t: number; dur: number }
type Emote = { ch: Body; sprite: THREE.Sprite; t: number; dur: number }

const ROUND = '"Hiragino Maru Gothic ProN","M PLUS Rounded 1c","Hiragino Sans",sans-serif'

function emoteCanvas(kind: EmoteKind): HTMLCanvasElement {
  const [c, g] = makeCanvas(128, 128)
  g.clearRect(0, 0, 128, 128)
  g.lineJoin = 'round'
  const text = (s: string, color: string, size = 92) => {
    g.font = `900 ${size}px ${ROUND}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineWidth = 12
    g.strokeStyle = '#ffffff'
    g.strokeText(s, 64, 68)
    g.fillStyle = color
    g.fillText(s, 64, 68)
  }
  switch (kind) {
    case 'bang':
      text('!', '#e8341c')
      break
    case 'bangq':
      text('!?', '#e8341c', 78)
      break
    case 'q':
      text('?', '#1d6fd8')
      break
    case 'note':
      text('♪', '#e85a9a')
      break
    case 'swirl': {
      // ぐるぐる（こんがらがった）
      g.lineCap = 'round'
      for (const [w, col] of [
        [14, '#ffffff'],
        [7, '#5a3ab8'],
      ] as const) {
        g.lineWidth = w
        g.strokeStyle = col
        g.beginPath()
        for (let a = 0; a < Math.PI * 6; a += 0.12) {
          const r = 6 + a * 4.2
          const x = 64 + Math.cos(a) * r
          const y = 64 + Math.sin(a) * r * 0.8
          if (a === 0) g.moveTo(x, y)
          else g.lineTo(x, y)
        }
        g.stroke()
      }
      break
    }
    case 'sweat':
      // あせ（水色のしずく 2 つ）
      for (const [x, y, s] of [
        [52, 54, 1],
        [84, 80, 0.7],
      ] as const) {
        g.beginPath()
        g.moveTo(x, y - 30 * s)
        g.quadraticCurveTo(x + 20 * s, y + 4 * s, x, y + 16 * s)
        g.quadraticCurveTo(x - 20 * s, y + 4 * s, x, y - 30 * s)
        g.lineWidth = 8
        g.strokeStyle = '#ffffff'
        g.stroke()
        g.fillStyle = '#5ac8f0'
        g.fill()
      }
      break
  }
  return c
}

export class NpcAntics {
  readonly group = new THREE.Group()
  private readonly active: Active[] = []
  private readonly emotes: Emote[] = []
  private readonly mats = new Map<EmoteKind, THREE.SpriteMaterial>()

  constructor() {
    this.group.name = 'npc_antics'
  }

  /** 身ぶりをする（同じ人の前の身ぶりは終わる） */
  play(ch: Body, kind: AnticKind, dur?: number): void {
    this.stopBody(ch)
    const d = dur ?? (kind === 'jump' ? 0.55 : kind === 'hop2' ? 1.0 : kind === 'shake' ? 0.8 : kind === 'leanBack' ? 0.9 : kind === 'shy' ? 2.2 : 2.6)
    this.active.push({ ch, kind, t: 0, dur: d })
  }

  /** 頭の上の記号（sec 秒） */
  emote(ch: Body, kind: EmoteKind, sec = 1.8): void {
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      if (this.emotes[i].ch !== ch) continue
      this.emotes[i].sprite.removeFromParent()
      this.emotes.splice(i, 1)
    }
    let mat = this.mats.get(kind)
    if (!mat) {
      const tex = new THREE.CanvasTexture(emoteCanvas(kind))
      tex.colorSpace = THREE.SRGBColorSpace
      mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false })
      this.mats.set(kind, mat)
    }
    const sprite = new THREE.Sprite(mat)
    sprite.renderOrder = 9
    sprite.scale.setScalar(0.01)
    this.group.add(sprite)
    this.emotes.push({ ch, sprite, t: 0, dur: sec })
  }

  /** 体の身ぶりをやめて、まっすぐにもどす */
  stopBody(ch: Body): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      if (this.active[i].ch !== ch) continue
      this.active.splice(i, 1)
      ch.root.position.y = 0
      ch.root.rotation.x = 0
      ch.root.rotation.z = 0
    }
  }

  clear(): void {
    for (const a of [...this.active]) this.stopBody(a.ch)
    for (const e of this.emotes) e.sprite.removeFromParent()
    this.emotes.length = 0
  }

  /** 人の update のあとに呼ぶ */
  update(dt: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i]
      a.t += dt
      const k = Math.min(1, a.t / a.dur)
      const r = a.ch.root
      switch (a.kind) {
        case 'jump':
          r.position.y = Math.sin(Math.PI * k) * 0.5
          r.rotation.x = -0.18 * Math.sin(Math.PI * k)
          break
        case 'hop2': {
          const q = (k * 2) % 1
          r.position.y = Math.sin(Math.PI * q) * 0.32
          r.rotation.z = 0.08 * Math.sin(k * Math.PI * 4)
          break
        }
        case 'shake':
          r.rotation.z = 0.13 * Math.sin(a.t * 38) * (1 - k)
          r.position.y = Math.abs(Math.sin(a.t * 38)) * 0.03 * (1 - k)
          break
        case 'headHold':
          // 前にかがんで、頭をかかえて左右にゆれる
          r.rotation.x = 0.26 * Math.min(1, a.t * 4) * (k > 0.85 ? (1 - k) / 0.15 : 1)
          r.rotation.z = 0.12 * Math.sin(a.t * 5)
          r.position.y = -0.04 * Math.min(1, a.t * 4)
          break
        case 'leanBack':
          r.rotation.x = -0.3 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (k < 0.7 ? 1 : (1 - k) / 0.3)
          break
        case 'shy':
          // てれる：小さく左右にゆれて、少しうつむく
          r.rotation.z = 0.07 * Math.sin(a.t * 7)
          r.rotation.x = 0.1 * Math.min(1, a.t * 3)
          break
      }
      if (k >= 1) {
        this.active.splice(i, 1)
        r.position.y = 0
        r.rotation.x = 0
        r.rotation.z = 0
      }
    }
    for (let i = this.emotes.length - 1; i >= 0; i--) {
      const e = this.emotes[i]
      e.t += dt
      const p = e.ch.root.position
      const pop = Math.min(1, e.t / 0.15)
      const out = Math.max(0, Math.min(1, (e.dur - e.t) / 0.25))
      e.sprite.position.set(p.x, p.y + e.ch.height + 0.42 + Math.sin(e.t * 6) * 0.04, p.z)
      e.sprite.scale.setScalar(0.5 * (pop < 1 ? 0.6 + pop * 0.5 : 1) * out + 0.001)
      e.sprite.material.rotation = 0
      if (e.t >= e.dur) {
        e.sprite.removeFromParent()
        this.emotes.splice(i, 1)
      }
    }
  }

  dispose(): void {
    this.clear()
    for (const m of this.mats.values()) {
      m.map?.dispose()
      m.dispose()
    }
    this.mats.clear()
    this.group.removeFromParent()
  }
}
