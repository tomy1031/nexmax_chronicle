// 町の人（モブ）の吹き出しと、F で話す短い会話（どの時代のステージでも使える）。
// ・近づくと、その人の頭の上に小さな吹き出しが出る（ワールド座標を毎フレーム画面へ投影。最大 2 つ。出し方は mobTalkLogic.ts）
// ・F：近くの人と 2〜3 行の会話（rt.dialogue）。ソラ・展示などステージ本来の相手を先に調べ、いなければ呼ぶこと
// ・会話中・演出中・一時停止中・時空移動中・HUD を隠しているときは出さない
//   （ステージの update が呼ばれないフレームは render で消える。HUD の会話・メニュー・撮影のクラスも見る）
// 見た目は mobTalk.css（HUD と同じ紺のガラス＋細い水色の線、白い字。大きさは HUD と同じ min(幅/1600, 高さ/900)）。
// DOM は吹き出し 2 つを最初に作って使い回し、位置は transform だけ、文字は変わったときだけ書き換える。
import * as THREE from 'three'
import type { Hint } from '../ui/hud'
import { MobTalkDirector, bubbleLinesFor, hasTalk, talkLinesFor, type MobDirectorConfig, type MobTable, type MobTalkLine } from './mobTalkLogic'
import './mobTalk.css'

export type MobSpeakerDef = {
  /** 台詞の表（MobTable.speakers）の ID */
  id: string
  /** 頭の上（吹き出しの付け根）のワールド位置を out に書く。いまいない（夜に帰った人など）なら false */
  anchor(out: THREE.Vector3): boolean
  /** 足元の高さ（高さの差の判定用。省略は anchor の y − 1.7） */
  footY?(): number
  /** 場面ごとの範囲：[吹き出しが出る水平距離, 高さの差の許容]（m）。省略は [2.6, 1.6] */
  range?(phase: string): readonly [number, number]
  /** F で話せる水平距離（m。省略は 2.1。0 なら話せない） */
  talkReach?: number
}

export type MobTalkOptions = {
  /** 吹き出しを置く要素（#ui）。null なら吹き出しは出さない（F の会話だけ） */
  host: HTMLElement | null
  camera: THREE.Camera
  table: MobTable
  speakers: MobSpeakerDef[]
  /** 色の組（'2086' 既定・'2026'・'1726'） */
  theme?: '2086' | '2026' | '1726' | '1970' | '1186'
  config?: Partial<MobDirectorConfig>
}

/** F の会話の相手（rt.dialogue と同じ形） */
export type MobDialogueRunner = { dialogue(lines: readonly MobTalkLine[]): Promise<void> }

const DEFAULT_RANGE: readonly [number, number] = [2.6, 1.6]
const TALK_HINT: Hint = { key: 'F', label: '話す' }

type View = {
  el: HTMLDivElement
  text: HTMLSpanElement
  shown: string
  on: boolean
  /** 最後に置いた話者（消えていく間も同じ人の上に置く） */
  who: number
  fade: number
  x: number
  y: number
  vis: boolean
}

export class MobTalk {
  readonly director: MobTalkDirector
  private readonly table: MobTable
  private readonly speakers: MobSpeakerDef[]
  private readonly ids: string[]
  private readonly camera: THREE.Camera
  private readonly dist: Float64Array
  private readonly reach: Float64Array
  private readonly vReach: Float64Array
  private readonly layer: HTMLDivElement | null = null
  private readonly views: View[] = []
  private readonly hudRoot: Element | null = null
  private readonly tmp = new THREE.Vector3()
  private readonly hintCache = new WeakMap<Hint[], Hint[]>()
  private phaseKey = ''
  /** update が呼ばれた（プレイ中のフレーム）。render で下ろす */
  private live = false
  private suspendedNow = false
  private vw = 1
  private vh = 1
  private readonly onResize = () => {
    this.vw = window.innerWidth || 1
    this.vh = window.innerHeight || 1
  }

  constructor(o: MobTalkOptions) {
    this.table = o.table
    this.speakers = o.speakers
    this.ids = o.speakers.map((s) => s.id)
    this.camera = o.camera
    const n = o.speakers.length
    this.director = new MobTalkDirector(n, o.config)
    this.dist = new Float64Array(n).fill(Infinity)
    this.reach = new Float64Array(n)
    this.vReach = new Float64Array(n)
    if (o.host) {
      const layer = document.createElement('div')
      layer.className = `nx-mob-layer nx-mob-${o.theme ?? '2086'}`
      for (let k = 0; k < this.director.slots.length; k++) {
        const el = document.createElement('div')
        el.className = 'nx-mob-bubble'
        el.innerHTML = '<div class="nx-mob-card"><span class="nx-mob-text"></span></div><i class="nx-mob-stem"></i>'
        layer.appendChild(el)
        this.views.push({ el, text: el.querySelector('.nx-mob-text') as HTMLSpanElement, shown: '', on: false, who: -1, fade: 0, x: -1e4, y: -1e4, vis: false })
      }
      // HUD の下に敷く（HUD の会話ウィンドウ・メニューが上に来る）
      o.host.insertBefore(layer, o.host.firstChild)
      this.layer = layer
      this.hudRoot = o.host.querySelector('.nx-hud')
      this.onResize()
      window.addEventListener('resize', this.onResize)
    }
  }

  get phase(): string {
    return this.phaseKey
  }

  /** HUD が会話ウィンドウ・一時停止のパネル・撮影用の表示を出している */
  private hudBusy(): boolean {
    const r = this.hudRoot
    if (!r) return false
    const c = r.classList
    return c.contains('nx-talking') || c.contains('nx-panel-open') || c.contains('nx-no-play-ui')
  }

  private setPhase(phase: string): void {
    if (phase === this.phaseKey) return
    this.phaseKey = phase
    this.director.setLines(phase, bubbleLinesFor(this.table, this.ids, phase))
    for (let i = 0; i < this.speakers.length; i++) {
      const r = this.speakers[i].range?.(phase) ?? DEFAULT_RANGE
      this.reach[i] = r[0]
      this.vReach[i] = r[1]
    }
  }

  private footY(i: number): number {
    const s = this.speakers[i]
    return s.footY ? s.footY() : this.tmp.y - 1.7
  }

  /**
   * プレイ中の毎フレーム（ステージの update から）。phase は台詞の場面（例 morning / loop_morning / night）、
   * suspended はステージ側の「いまは出さない」（会話・選択肢・演出・操作の固定など）
   */
  update(dt: number, player: THREE.Vector3, phase: string, suspended: boolean): void {
    this.setPhase(phase)
    this.live = true
    for (let i = 0; i < this.speakers.length; i++) {
      if (!this.speakers[i].anchor(this.tmp)) {
        this.dist[i] = Infinity
        continue
      }
      const dy = Math.abs(this.footY(i) - player.y)
      this.dist[i] = dy <= this.vReach[i] ? Math.hypot(this.tmp.x - player.x, this.tmp.z - player.z) : Infinity
    }
    this.suspendedNow = suspended || this.hudBusy()
    this.director.update(dt, this.dist, this.reach, this.suspendedNow)
  }

  /** 毎フレーム（ステージの animate から。カメラが動いた後）。吹き出しを頭の上へ置く */
  render(dt: number): void {
    if (!this.layer) return
    const live = this.live
    this.live = false
    const slots = this.director.slots
    for (let k = 0; k < this.views.length; k++) {
      const v = this.views[k]
      const b = slots[k]
      const want = live && b.speaker >= 0
      if (want) {
        if (b.text !== v.shown) {
          v.text.textContent = b.text
          v.shown = b.text
        }
        v.who = b.speaker
        v.fade = 0.3
      } else v.fade = live ? Math.max(0, v.fade - dt) : 0
      // 消えていく間（0.3 秒）も同じ人の上に置く。プレイ中でないフレーム（一時停止・移動・撮影）はすぐ隠す
      if (v.who < 0 || (!want && v.fade <= 0) || !this.speakers[v.who].anchor(this.tmp)) {
        this.setVisible(v, false)
        continue
      }
      this.tmp.project(this.camera)
      // 画面の上に少しはみ出す人（上の回廊から下へ叫ぶ人など）は、上の端に寄せて出す。横にはみ出した人は出さない
      if (this.tmp.z > 1 || this.tmp.z < -1 || Math.abs(this.tmp.x) > 1.06 || this.tmp.y > 1.9 || this.tmp.y < -1.2) {
        this.setVisible(v, false)
        continue
      }
      const w = this.vw
      const h = this.vh
      let x = (this.tmp.x * 0.5 + 0.5) * w
      let y = (-this.tmp.y * 0.5 + 0.5) * h
      // 端で切れないように（吹き出しの半分の幅くらい内側へ）。上は目標の表示とかぶらない高さまで
      const m = Math.max(96, Math.min(w, h * 1.78) * 0.12)
      x = Math.min(w - m, Math.max(m, x))
      y = Math.min(h * 0.86, Math.max(h * 0.2, y))
      // 2 つ目が 1 つ目と重なるなら、1 つ目の上へ積む（吹き出し 2 行ぶん＋すき間。u は HUD と同じ倍率）
      if (k > 0) {
        const p = this.views[0]
        const u = Math.min(w / 1600, h / 900)
        const step = Math.max(62, 92 * u)
        const wide = Math.max(200, 340 * u)
        if (p.vis && Math.abs(p.x - x) < wide && Math.abs(p.y - y) < step) {
          if (p.y - step >= h * 0.17) y = p.y - step
          else x = Math.min(w - m, Math.max(m, p.x + (x >= p.x ? wide : -wide))) // 上が足りなければ横に並べる
        }
      }
      if (Math.abs(x - v.x) > 0.4 || Math.abs(y - v.y) > 0.4) {
        v.x = x
        v.y = y
        v.el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`
      }
      this.setVisible(v, true)
      if (want !== v.on) {
        v.on = want
        v.el.classList.toggle('on', want)
      }
    }
  }

  private setVisible(v: View, on: boolean): void {
    if (on === v.vis) return
    v.vis = on
    v.el.style.visibility = on ? 'visible' : 'hidden'
    if (!on) {
      // 次に出るときは消えた状態から（transition でふわっと出す）
      v.on = false
      v.el.classList.remove('on')
    }
  }

  /** F で話せるいちばん近い人（いなければ -1）。高さが合う人だけ */
  nearestTalker(player: THREE.Vector3): number {
    let best = -1
    let bd = Infinity
    for (let i = 0; i < this.speakers.length; i++) {
      const s = this.speakers[i]
      const tr = s.talkReach ?? 2.1
      if (tr <= 0 || !s.anchor(this.tmp)) continue
      if (Math.abs(this.footY(i) - player.y) > 1.4) continue
      const d = Math.hypot(this.tmp.x - player.x, this.tmp.z - player.z)
      if (d < tr && d < bd && hasTalk(this.table, s.id, this.phaseKey)) {
        bd = d
        best = i
      }
    }
    return best
  }

  /** いま F で話せる人がいる（キー案内用） */
  canTalk(player: THREE.Vector3): boolean {
    return !this.suspendedNow && this.nearestTalker(player) >= 0
  }

  /** キー案内に「F：話す」を足したもの（話せる人がいなければそのまま。配列は使い回す） */
  withTalkHint(base: Hint[], player: THREE.Vector3): Hint[] {
    if (!this.canTalk(player)) return base
    if (base.some((h) => h.key === 'F')) return base
    let h = this.hintCache.get(base)
    if (!h) {
      h = [...base, TALK_HINT]
      this.hintCache.set(base, h)
    }
    return h
  }

  /** F：近くの人と話す（話したら true）。ステージ本来の相手（ソラ・展示など）がいないときに呼ぶ */
  interact(rt: MobDialogueRunner, player: THREE.Vector3): boolean {
    if (this.suspendedNow) return false
    const i = this.nearestTalker(player)
    if (i < 0) return false
    const lines = talkLinesFor(this.table, this.ids[i], this.phaseKey, this.director.peek(i))
    if (!lines.length) return false
    this.director.clear()
    this.director.silence(i, 14)
    void rt.dialogue(lines)
    return true
  }

  /** 開発用（window.__slice.debug()） */
  debugInfo(): Record<string, unknown> {
    const shown = this.director.slots.filter((s) => s.speaker >= 0).map((s) => `${this.ids[s.speaker]}:${s.text}`)
    return { phase: this.phaseKey, speakers: this.ids.length, shown }
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize)
    this.layer?.remove()
    this.views.length = 0
  }
}
