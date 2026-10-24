// 会話ウィンドウの話者アイコン。
// ・おもな登場人物は、イラストの顔（chronicle/art.ts の V7_PORTRAITS。シェルが起動時に setSpeakerIcon で渡す）。
//   source が 'art:…' の人は、GLB を読まない（絵が来るのを待つだけ）。
// ・それ以外で GLB のある人物（public/models/*.glb）は、loadCharacter で読み、頭を正面やや斜めから
//   柔らかい光で 1 回だけ描いて data URL の画像にし、覚えておく（1 人 1 回）。
// ・システムは鉱石のしるし、知らない話者は色付きの人影。
import * as THREE from 'three'
import { loadCharacter, type CharacterName } from '../../world/characters'
import type { MiniRenderer } from './miniRenderer'

export type SpeakerModel = Exclude<CharacterName, 'nexmax'>

/** イラストの顔（外から set() で渡される絵。作らない） */
export type ArtSource = `art:${string}`

export type SpeakerStyle = {
  /** CSS 用の短い名前 */
  key: string
  /** 名札・顔の枠の色 */
  color: string
  /** 顔を作るもと：イラスト、GLB の人物、ネクマックス（3D の顔）、システム、なし（人影） */
  source: ArtSource | SpeakerModel | 'nexmax' | 'system' | null
}

/** ネクマックスの会話の顔の表情（絵は chronicle/art.ts の V7_PORTRAITS の「ネクマックス#…」） */
export const NEXMAX_FACE_MOODS = ['normal', 'happy', 'surprised', 'worried'] as const
export type NexmaxFaceMood = (typeof NEXMAX_FACE_MOODS)[number]

const NEXMAX_STYLE: SpeakerStyle = { key: 'nexmax', color: '#62d4ff', source: 'art:nexmax' }

const KNOWN: Array<[RegExp, SpeakerStyle]> = [
  [/^源兵衛/, { key: 'genbei', color: '#ffc94d', source: 'art:genbei' }],
  [/^おはる/, { key: 'oharu', color: '#ff8fb6', source: 'art:oharu' }],
  [/^マツイ/, { key: 'matsui', color: '#ffb057', source: 'art:matsui' }],
  // 1970年の佐伯ミチ（玲奈とは別人。顔は人影のまま）
  [/^ミチ|^佐伯ミチ/, { key: 'michi', color: '#ffb066', source: null }],
  // 物語 v7：年をとった佐伯さんの声
  [/^佐伯（2068年）/, { key: 'saeki_old', color: '#9fe8ff', source: 'art:saeki_old' }],
  [/^佐伯/, { key: 'saeki', color: '#7fe6ff', source: 'art:saeki' }],
  // 8 さいのソラ（はじめに・2071 年）
  [/^ソラ（8歳）/, { key: 'sora', color: '#c8a6ff', source: 'art:sora_child' }],
  [/^ソラ/, { key: 'sora', color: '#c8a6ff', source: 'art:sora' }],
  [/^トワ（小さいころ）/, { key: 'towa_child', color: '#9fd8ff', source: 'art:towa_child' }],
  [/^トワのお母さん/, { key: 'towa_mother', color: '#ffd6a8', source: 'art:towa_mother' }],
  // 名のる前のトワ（物語 v7.2：2・4 章は「仮面の男」）。名のったあとの「トワ」は、結末で素顔に差しかわる
  [/^仮面の男/, { key: 'towa', color: '#b99cff', source: 'art:towa_mask' }],
  [/^トワ/, { key: 'towa', color: '#b99cff', source: 'art:towa' }],
  [/^チャンダのおばあさん|^守り手/, { key: 'elder', color: '#f2d27a', source: 'art:elder' }],
  [/^チャンダ/, { key: 'chanda', color: '#ffb36b', source: 'art:chanda' }],
  [/^おふじ/, { key: 'ofuji', color: '#ffc6a8', source: 'art:ofuji' }],
  // 2086 年の最新型（「量産型NEXMAX No.33」のような番号つきも同じ顔）
  [/^量産型/, { key: 'unit', color: '#8fb4ff', source: 'art:unit' }],
  // はじめに（2071 年）の、名前を思い出す前のネクマックス
  [/^ネクマックス|^NEXMAX|^小さなロボット/i, NEXMAX_STYLE],
  [/^システム/, { key: 'system', color: '#9fe8ff', source: 'system' }],
]

/** 話者の見た目。知らない名前は名前から決まる色の人影。「ネクマックス#happy」のように # のあとに表情を付けると、その表情の絵 */
export function speakerStyle(name: string): SpeakerStyle {
  const sharp = name.indexOf('#')
  if (sharp > 0) {
    const st = speakerStyle(name.slice(0, sharp))
    const mood = name.slice(sharp + 1) as NexmaxFaceMood
    if (st === NEXMAX_STYLE && NEXMAX_FACE_MOODS.includes(mood) && mood !== 'normal') return { ...st, source: `art:nexmax_${mood}` }
    return st
  }
  for (const [re, st] of KNOWN) if (re.test(name)) return st
  let h = 0
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
  const hue = h % 360
  return { key: 'other', color: `hsl(${hue} 80% 72%)`, source: null }
}

/** イラストの顔か */
export function isArtSource(s: SpeakerStyle['source']): s is ArtSource {
  return typeof s === 'string' && s.startsWith('art:')
}

/**
 * ネクマックスの台詞の表情（会話の顔の絵を選ぶ）。台詞に表情の情報が無いので、文から控えめに決める。
 * 迷ったら「ふつう」。心の声（ ）もそのまま見る。
 */
export function nexmaxMood(text: string): NexmaxFaceMood {
  const t = text.replace(/^[（(]|[）)]$/g, '')
  // 「えっと……」「あった！」は、おどろきではない
  if (/^(え(?!っと)[っ…？！。、]|ええ[っ…？！]|わっ|うわ|あっ(?!た)|ああっ|な、|な…|ま、まさか)|！？|!\?/.test(t)) return 'surprised'
  if (/(ごめん|どうしよう|こわい|こわかった|さびし|かなし|いたい|もどせなかった|まにあわ|だめだ|ダメだ|うそ……)/.test(t)) return 'worried'
  if (/(ありがとう|やった|よかった|うれしい|たのしい|楽しい|すごい|まかせて|がんばろう|わーい)/.test(t)) return 'happy'
  return 'normal'
}

/** 会話の顔に使う名前（ネクマックスは表情つき「ネクマックス#happy」。ほかの人は話者名のまま） */
export function dialogFaceName(speaker: string, text: string): string {
  if (speakerStyle(speaker) !== NEXMAX_STYLE) return speaker
  const m = nexmaxMood(text)
  return m === 'normal' ? speaker : `${speaker}#${m}`
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
    // イラストの顔は外から set() で来る（GLB は読まない）
    if (isArtSource(source)) return
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
