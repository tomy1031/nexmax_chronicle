// 会話ウィンドウの話者アイコン。GLB の登場人物（public/models/*.glb）を loadCharacter で読み、
// 頭を正面やや斜めから柔らかい光で 1 回だけ描いて data URL の画像にし、覚えておく（1 人 1 回）。
// ネクマックスはポートレートの静止画、システムは鉱石のしるし、知らない話者は色付きの人影。
import * as THREE from 'three'
import { loadCharacter, type CharacterName } from '../../world/characters'
import type { MiniRenderer } from './miniRenderer'

export type SpeakerModel = Exclude<CharacterName, 'nexmax'>

export type SpeakerStyle = {
  /** CSS 用の短い名前 */
  key: string
  /** 名札・顔の枠の色 */
  color: string
  /** 顔を作るもと：GLB の人物、ネクマックス、システム、なし（人影） */
  source: SpeakerModel | 'nexmax' | 'system' | null
}

const KNOWN: Array<[RegExp, SpeakerStyle]> = [
  [/^源兵衛/, { key: 'genbei', color: '#ffc94d', source: 'genbei' }],
  [/^おはる/, { key: 'oharu', color: '#ff8fb6', source: 'oharu' }],
  [/^マツイ/, { key: 'matsui', color: '#ffb057', source: 'matsui' }],
  // 1970年の佐伯ミチ（玲奈とは別人。顔は人影のまま）
  [/^ミチ|^佐伯ミチ/, { key: 'michi', color: '#ffb066', source: null }],
  // 物語 v7：年をとった佐伯さんの声（顔はイラスト。chronicle/art.ts）
  [/^佐伯（2068年）/, { key: 'saeki_old', color: '#9fe8ff', source: null }],
  [/^佐伯/, { key: 'saeki', color: '#7fe6ff', source: 'saeki' }],
  [/^ソラ/, { key: 'sora', color: '#c8a6ff', source: 'sora' }],
  // 物語 v7 の人物（顔は chronicle/visuals/person.ts の手続きの人物から）
  [/^トワ（小さいころ）/, { key: 'towa_child', color: '#9fd8ff', source: null }],
  [/^トワ/, { key: 'towa', color: '#b99cff', source: 'towa' }],
  [/^チャンダのおばあさん|^守り手/, { key: 'elder', color: '#f2d27a', source: 'khmerElder' }],
  [/^チャンダ/, { key: 'chanda', color: '#ffb36b', source: 'chanda' }],
  [/^おふじ/, { key: 'ofuji', color: '#ffc6a8', source: 'ofuji' }],
  [/^ネクマックス|^NEXMAX/i, { key: 'nexmax', color: '#62d4ff', source: 'nexmax' }],
  [/^システム/, { key: 'system', color: '#9fe8ff', source: 'system' }],
]

/** 話者の見た目。知らない名前は名前から決まる色の人影 */
export function speakerStyle(name: string): SpeakerStyle {
  for (const [re, st] of KNOWN) if (re.test(name)) return st
  let h = 0
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const hue = h % 360
  return { key: 'other', color: `hsl(${hue} 80% 72%)`, source: null }
}

/**
 * 人物ごとの顔の切り出し（全高に対する割合）。down = 頭のてっぺんから写す中心までの距離、
 * size = 写す高さ、yaw = 正面から右へ回り込む角度（rad）
 */
const FRAMING: Record<SpeakerModel, { down: number; size: number; yaw: number }> = {
  genbei: { down: 0.2, size: 0.44, yaw: 0.2 },
  oharu: { down: 0.2, size: 0.45, yaw: 0.2 },
  matsui: { down: 0.165, size: 0.36, yaw: 0.2 },
  saeki: { down: 0.125, size: 0.28, yaw: 0.2 },
  sora: { down: 0.14, size: 0.31, yaw: 0.2 },
  michi: { down: 0.14, size: 0.3, yaw: 0.2 },
  towa: { down: 0.13, size: 0.3, yaw: 0.2 },
  chanda: { down: 0.15, size: 0.33, yaw: 0.2 },
  khmerElder: { down: 0.15, size: 0.33, yaw: 0.2 },
  ofuji: { down: 0.15, size: 0.34, yaw: 0.2 },
}

const MODEL_HEIGHT = 1.6

/**
 * 話者アイコンの置き場。get() は出来ていれば data URL（無ければ null）。
 * request() で作り始め、出来たら onReady の関数を呼ぶ。作るのは 1 人ずつ順番に。
 */
export class SpeakerIconCache {
  private readonly urls = new Map<string, string>()
  private readonly pending = new Map<SpeakerModel, Promise<string | null>>()
  private readonly failed = new Set<string>()
  private readonly listeners = new Set<(source: string, url: string) => void>()
  private chain: Promise<unknown> = Promise.resolve()
  private mini: MiniRenderer | null
  /** レンダラが出来る前に頼まれた人物 */
  private readonly wanted = new Set<SpeakerModel>()
  /** ネクマックスの静止画を作る関数（ポートレートから） */
  nexmaxSnapshot: (() => string | null) | null = null

  constructor(mini: MiniRenderer | null = null) {
    this.mini = mini
  }

  /** あとからレンダラを渡す（それまでに頼まれた分を作り始める） */
  setRenderer(mini: MiniRenderer | null): void {
    this.mini = mini
    if (!mini) return
    const list = [...this.wanted]
    this.wanted.clear()
    for (const n of list) this.request(n)
  }

  onReady(fn: (source: string, url: string) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** 外から画像を渡す（イラストの顔などがあるとき） */
  set(source: string, url: string): void {
    this.urls.set(source, url)
    for (const l of this.listeners) l(source, url)
  }

  get(source: string): string | null {
    if (source === 'nexmax' && !this.urls.has('nexmax') && this.nexmaxSnapshot) {
      const u = this.nexmaxSnapshot()
      if (u) this.urls.set('nexmax', u)
    }
    return this.urls.get(source) ?? null
  }

  request(source: SpeakerStyle['source']): void {
    if (!source || source === 'system' || source === 'nexmax') return
    if (this.urls.has(source) || this.pending.has(source) || this.failed.has(source)) return
    if (!this.mini) {
      this.wanted.add(source)
      return
    }
    const p = (this.chain = this.chain.then(() => this.build(source)).catch(() => null)) as Promise<string | null>
    this.pending.set(source, p)
    void p.then((url) => {
      this.pending.delete(source)
      if (url) this.set(source, url)
      else this.failed.add(source)
    })
  }

  /** 先に作っておく（ステージの読み込み時など） */
  preload(names: string[]): void {
    for (const n of names) this.request(speakerStyle(n).source)
  }

  private async build(name: SpeakerModel): Promise<string | null> {
    const mini = this.mini
    if (!mini || mini.lost) return null
    // 少し待って、ゲームの描画の合間に作る
    await idle()
    const ch = await loadCharacter(name, MODEL_HEIGHT)
    if (ch.placeholder) {
      disposeTree(ch.root)
      return null
    }
    const scene = new THREE.Scene()
    scene.environment = mini.environment()
    scene.environmentIntensity = 0.55
    scene.add(new THREE.HemisphereLight('#f4f8ff', '#6a7f9e', 1.1))
    const key = new THREE.DirectionalLight('#fff4e6', 2.3)
    key.position.set(-1.2, 2.4, -2.4)
    scene.add(key)
    const fill = new THREE.DirectionalLight('#dbeaff', 0.7)
    fill.position.set(2, 0.6, -1.6)
    scene.add(fill)
    const rim = new THREE.DirectionalLight('#7fe8ff', 1.3)
    rim.position.set(0.4, 1.8, 2.4)
    scene.add(rim)
    scene.add(ch.root)
    ch.update(0.016, 0)
    ch.root.updateMatrixWorld(true)
    const f = FRAMING[name]
    const top = new THREE.Box3().setFromObject(ch.root).max.y
    const center = headCenter(ch.root, top - f.down * MODEL_HEIGHT)
    const cam = new THREE.PerspectiveCamera(20, 1, 0.05, 30)
    const dist = (f.size * MODEL_HEIGHT * 0.5) / Math.tan(THREE.MathUtils.degToRad(10))
    // モデルの正面は -Z。少し右上から
    const dir = new THREE.Vector3(Math.sin(f.yaw), 0.02, -Math.cos(f.yaw)).normalize()
    cam.position.copy(center).addScaledVector(dir, dist)
    cam.lookAt(center)
    const url = mini.snapshot(scene, cam)
    scene.remove(ch.root)
    disposeTree(ch.root)
    return url
  }
}

/** 顔の中心：指定の高さあたりの頂点の左右・前後の中ほど（T ポーズの腕に引っ張られないよう、高さの帯で測る） */
function headCenter(root: THREE.Object3D, y: number): THREE.Vector3 {
  const band = 0.08 * MODEL_HEIGHT
  const v = new THREE.Vector3()
  let n = 0
  let sx = 0
  let minZ = Infinity
  let maxZ = -Infinity
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.geometry?.attributes?.position) return
    if ((m.material as THREE.Material & { side?: number }).side === THREE.BackSide) return
    const pos = m.geometry.attributes.position
    const step = Math.max(1, Math.floor(pos.count / 6000))
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)
      if (Math.abs(v.y - y) > band) continue
      sx += v.x
      minZ = Math.min(minZ, v.z)
      maxZ = Math.max(maxZ, v.z)
      n++
    }
  })
  if (!n) return new THREE.Vector3(0, y, 0)
  return new THREE.Vector3(sx / n, y, (minZ + maxZ) / 2)
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry?.dispose()
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    for (const mat of mats) {
      const mm = mat as THREE.MeshStandardMaterial
      mm.map?.dispose()
      mm.normalMap?.dispose()
      mm.dispose()
    }
  })
}

function idle(): Promise<void> {
  return new Promise((res) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(() => res(), { timeout: 600 })
    else setTimeout(res, 60)
  })
}
