// IDO 検索の画面（物語 v7 の 6 章。佐伯さんの端末）と、社長の絵のアップ。DOM だけ（見た目は chronicle2026.css）。
// HUD（.nx-hud）の中に置くので、IDO の歴史案内パネル（hud.showIdo）と同じ枠・色になる。キー操作はステージが受け持つ
// （この画面はクリックを受けない）。アニメーションは update(dt) で進める（一時停止中は dt = 0 で止まる）。
// 使い方：
//   const p = new IdoSearchPanel(ui)            // ui は #ui（中の .nx-hud を探して入る）
//   p.open(); await p.search(['時計'])          // 文字を打つ → さがす → 3 本が並ぶ（地図のピンも）
//   p.setChecked(['clock_shop']); p.focus('old_alley')
//   await p.search(['時計', '青い'])            // 「青い」を足す → 1 本にしぼられる
//   p.close()
import './chronicle2026.css'
import { FrameManager } from '../../../ui/future/frame'
import { IDO_RECORDS, CLOCK_CANDIDATES, matchedWords, searchRecords, type IdoRecord, type RecordImage } from './idoSearchLogic'
import { paintClockShopRecord, paintGenbeiPage, paintPresidentSketch, paintStationClockRecord, paintTownMap, SKETCH_CORNER, type MapPin } from './recordArt'

const GLASS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10" cy="10" r="6.5"/><path d="M15 15l6 6"/></svg>'

/** 記録の絵（1 回だけ描いて使い回す） */
const imageCache = new Map<RecordImage, HTMLCanvasElement>()
export function recordImage(kind: RecordImage): HTMLCanvasElement | null {
  if (kind === 'none') return null
  let c = imageCache.get(kind)
  if (!c) {
    c = kind === 'clockShop' ? paintClockShopRecord() : kind === 'stationClock' ? paintStationClockRecord() : paintGenbeiPage()
    imageCache.set(kind, c)
  }
  return c
}

/** HUD の中に入る（.nx-hud があればその中。無ければ host のまま） */
function hudRoot(host: HTMLElement | null): HTMLElement {
  const h = host ?? document.body
  return (h.querySelector('.nx-hud') as HTMLElement | null) ?? h
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

type Job = { t: number; run: () => void }

export class IdoSearchPanel {
  readonly el: HTMLDivElement
  private readonly frames = new FrameManager()
  private readonly list: HTMLOListElement
  private readonly words: HTMLSpanElement
  private readonly typing: HTMLSpanElement
  private readonly btn: HTMLSpanElement
  private readonly count: HTMLDivElement
  private readonly foot: HTMLDivElement
  private readonly map: HTMLCanvasElement
  private readonly mapCap: HTMLDivElement
  private jobs: Job[] = []
  private clock = 0
  private shown: string[] = []
  private query: string[] = []
  private readonly checked = new Set<string>()
  private focusId: string | null = null
  private mapT = 0
  private open_ = false

  constructor(host: HTMLElement | null) {
    const el = document.createElement('div')
    el.className = 'nx-idos'
    el.hidden = true
    el.innerHTML = `
      <div class="nx-idos-card">
        <div class="nx-frame-host" data-frame="panel"></div>
        <div class="nx-idos-head"><span class="nx-idos-logo">IDO</span><span class="nx-idos-title">かんばんの記録さがし</span><span class="nx-idos-who">佐伯さんの端末</span></div>
        <div class="nx-idos-search"><span class="nx-idos-glass">${GLASS_SVG}</span><span class="nx-idos-words"></span><span class="nx-idos-typing"></span><span class="nx-idos-caret"></span><span class="nx-idos-btn">さがす</span></div>
        <div class="nx-idos-count"></div>
        <div class="nx-idos-body">
          <ol class="nx-idos-list"></ol>
          <div class="nx-idos-map"><canvas width="236" height="212"></canvas><div class="nx-idos-map-cap">町の地図（上が北）</div></div>
        </div>
        <div class="nx-idos-foot"></div>
      </div>`
    this.el = el
    hudRoot(host).appendChild(el)
    const q = <T extends Element>(s: string) => el.querySelector(s) as T
    this.list = q('.nx-idos-list')
    this.words = q('.nx-idos-words')
    this.typing = q('.nx-idos-typing')
    this.btn = q('.nx-idos-btn')
    this.count = q('.nx-idos-count')
    this.foot = q('.nx-idos-foot')
    this.map = q('.nx-idos-map canvas')
    this.mapCap = q('.nx-idos-map-cap')
    this.drawMap()
  }

  get visible(): boolean {
    return this.open_
  }

  /** いまの結果（画面に並んでいる記録の id） */
  get results(): readonly string[] {
    return this.shown
  }

  open(): void {
    this.open_ = true
    this.el.hidden = false
    this.el.classList.remove('out')
    this.el.classList.remove('show')
    void this.el.offsetWidth
    this.el.classList.add('show')
    // 枠は見えてから描く（大きさが決まってから）
    requestAnimationFrame(() => this.frames.attachAll(this.el))
    if (!this.foot.textContent) this.setFoot('言葉で、町じゅうのかんばんの記録をさがせます')
  }

  close(): void {
    if (!this.open_) return
    this.open_ = false
    this.el.classList.add('out')
    this.jobs.length = 0
    setTimeout(() => {
      if (!this.open_) this.el.hidden = true
    }, 320)
  }

  /** 下の一行（キー案内の [F] を前につける） */
  setFoot(text: string, key: string | null = null): void {
    this.foot.innerHTML = (key ? `<span class="nx-key">${esc(key)}</span>` : '') + `<span>${esc(text)}</span>`
  }

  /**
   * 言葉でさがす。前の言葉に足すときは、足した言葉だけを打つ。打ち終わると「さがす」→ 結果が 1 行ずつ並ぶ。
   * 並び終わると resolve（結果の記録を返す）
   */
  search(words: readonly string[], opts: { perChar?: number; think?: number } = {}): Promise<IdoRecord[]> {
    const perChar = opts.perChar ?? 0.22
    const think = opts.think ?? 0.7
    const keep = words.filter((w, i) => this.query[i] === w)
    const add = words.slice(keep.length)
    this.query = [...words]
    // 足す言葉より後ろの古い言葉は消す
    while (this.words.children.length > keep.length) this.words.lastElementChild?.remove()
    const res = searchRecords(words)
    return new Promise((resolve) => {
      let t = this.clock + 0.25
      for (const w of add) {
        const chars = [...w]
        chars.forEach((_, k) => {
          this.at(t, () => (this.typing.textContent = chars.slice(0, k + 1).join('')))
          t += perChar
        })
        this.at(t + 0.12, () => {
          this.typing.textContent = ''
          const chip = document.createElement('span')
          chip.className = 'nx-idos-word pop' + (w === '青い' ? ' blue' : '')
          chip.textContent = w
          this.words.appendChild(chip)
        })
        t += 0.3
      }
      // さがす
      this.at(t, () => {
        this.btn.classList.add('busy')
        this.btn.textContent = 'さがしています'
        this.count.textContent = ''
      })
      t += think
      this.at(t, () => {
        this.btn.classList.remove('busy')
        this.btn.textContent = 'さがす'
        this.count.innerHTML = res.length ? `<b>${res.length}</b>本のかんばんが 見つかりました` : '見つかりませんでした'
        this.showResults(res, words)
      })
      t += 0.12 * Math.max(1, res.length) + 0.4
      this.at(t, () => resolve(res))
    })
  }

  /** 結果を並べる（前に並んでいて今回しぼられた行は薄くしてから消す） */
  private showResults(res: readonly IdoRecord[], words: readonly string[]): void {
    const keepIds = new Set(res.map((r) => r.id))
    const old = [...this.list.children] as HTMLElement[]
    const narrowing = old.length > 0
    for (const li of old) {
      if (!keepIds.has(li.dataset.id ?? '')) li.classList.add('gone')
    }
    const render = () => {
      this.list.innerHTML = ''
      res.forEach((r, i) => this.list.appendChild(this.row(r, words, i, res.length === 1 && words.length > 1)))
      this.shown = res.map((r) => r.id)
      this.drawMap()
    }
    if (narrowing) this.at(this.clock + 0.55, render)
    else render()
  }

  private row(r: IdoRecord, words: readonly string[], i: number, only: boolean): HTMLLIElement {
    const li = document.createElement('li')
    li.className = 'nx-idos-item' + (this.checked.has(r.id) ? ' done' : '') + (this.focusId === r.id ? ' focus' : '') + (only ? ' only' : '')
    li.dataset.id = r.id
    li.style.animationDelay = `${i * 0.12}s`
    const hits = matchedWords(r, words)
      .map((w) => `<span class="${w === '青い' ? 'blue' : ''}">${esc(w)}</span>`)
      .join('')
    li.innerHTML = `<span class="nx-idos-num">${i + 1}</span><span class="nx-idos-thumb"></span><div class="nx-idos-text"><div class="nx-idos-name">${esc(r.name)}</div><div class="nx-idos-place">${esc(r.place)}</div><div class="nx-idos-hit">${hits}</div></div><span class="nx-idos-state">${this.checked.has(r.id) ? 'しらべた' : 'まだ'}</span>`
    const th = li.querySelector('.nx-idos-thumb') as HTMLElement
    const src = recordImage(r.image)
    const c = document.createElement('canvas')
    c.width = 208
    c.height = 96
    const g = c.getContext('2d') as CanvasRenderingContext2D
    if (src) {
      const s = Math.max(c.width / src.width, c.height / src.height)
      g.drawImage(src, (c.width - src.width * s) / 2, (c.height - src.height * s) / 2, src.width * s, src.height * s)
    } else {
      g.fillStyle = '#0c2a34'
      g.fillRect(0, 0, c.width, c.height)
    }
    th.appendChild(c)
    return li
  }

  /** 町で調べた記録（行に「しらべた」・地図のピンを緑に） */
  setChecked(ids: Iterable<string>): void {
    this.checked.clear()
    for (const id of ids) this.checked.add(id)
    for (const li of [...this.list.children] as HTMLElement[]) {
      const done = this.checked.has(li.dataset.id ?? '')
      li.classList.toggle('done', done)
      const st = li.querySelector('.nx-idos-state')
      if (st) st.textContent = done ? 'しらべた' : 'まだ'
    }
    this.drawMap()
  }

  /** 1 本を目立たせる（行の枠と地図のピン） */
  focus(id: string | null): void {
    this.focusId = id
    for (const li of [...this.list.children] as HTMLElement[]) li.classList.toggle('focus', li.dataset.id === id)
    this.drawMap()
  }

  /** 何も無い状態へ戻す（もう一度さがすとき） */
  reset(): void {
    this.query = []
    this.shown = []
    this.words.innerHTML = ''
    this.typing.textContent = ''
    this.list.innerHTML = ''
    this.count.textContent = ''
    this.jobs.length = 0
    this.drawMap()
  }

  private at(t: number, run: () => void): void {
    this.jobs.push({ t, run })
  }

  private drawMap(): void {
    const shown = new Set(this.shown)
    const pins: MapPin[] = []
    let n = 0
    for (const r of IDO_RECORDS) {
      if (!r.kanban) continue
      const hit = shown.has(r.id)
      if (hit) n++
      pins.push({
        id: r.id,
        x: r.at[0],
        z: r.at[1],
        label: hit ? String(this.shown.indexOf(r.id) + 1) : '',
        state: this.checked.has(r.id) && hit ? 'done' : this.focusId === r.id ? 'focus' : hit ? 'hit' : 'off',
      })
    }
    paintTownMap(this.map, pins, this.mapT)
    this.mapCap.textContent = n ? `オレンジの ${n} 本が 見つかったかんばん` : '町の地図（上が北）'
  }

  update(dt: number): void {
    if (!this.open_) return
    this.clock += dt
    if (this.jobs.length) {
      const due = this.jobs.filter((j) => j.t <= this.clock)
      if (due.length) {
        this.jobs = this.jobs.filter((j) => j.t > this.clock)
        for (const j of due) j.run()
      }
    }
    // ピンの光（ゆっくり点滅）：10 回/秒で描き直す
    this.mapT += dt
    if (this.shown.length && Math.floor(this.mapT * 10) !== Math.floor((this.mapT - dt) * 10)) this.drawMap()
  }

  dispose(): void {
    this.frames.dispose()
    this.el.remove()
    this.jobs.length = 0
  }
}

/** 「時計」で出た候補のうち、まだ調べていない物（目標の表示用） */
export function candidatesLeft(checked: ReadonlySet<string>): string[] {
  return CLOCK_CANDIDATES.filter((id) => !checked.has(id))
}

// ------------------------------------------------------------------ 社長の絵のアップ

/**
 * 社長の絵のアップ（F で調べたとき）。紙がふわっと出て、すみの「NEXTMAKE 001」に目印 → そこへ寄る。
 *   const s = new SketchCloseup(ui); s.show(); s.markCorner(true); s.zoomCorner(true); s.hide()
 */
export class SketchCloseup {
  readonly el: HTMLDivElement
  private readonly paper: HTMLDivElement
  private readonly mark: HTMLDivElement
  private readonly cap: HTMLDivElement
  private open_ = false

  constructor(host: HTMLElement | null) {
    const el = document.createElement('div')
    el.className = 'nx-sketch'
    el.hidden = true
    el.innerHTML = `<div class="nx-sketch-paper"><div class="nx-sketch-mark"></div><div class="nx-sketch-cap"></div></div>`
    this.el = el
    this.paper = el.querySelector('.nx-sketch-paper') as HTMLDivElement
    this.mark = el.querySelector('.nx-sketch-mark') as HTMLDivElement
    this.cap = el.querySelector('.nx-sketch-cap') as HTMLDivElement
    const c = paintPresidentSketch(1024, 724)
    this.paper.prepend(c)
    for (const [x, y] of [
      [3, 3],
      [97, 3],
    ]) {
      const pin = document.createElement('div')
      pin.className = 'nx-sketch-pin'
      pin.style.left = `calc(${x}% - 9px)`
      pin.style.top = `calc(${y}% - 9px)`
      this.paper.appendChild(pin)
    }
    const k = SKETCH_CORNER
    this.mark.style.left = `${(k.x - 0.012) * 100}%`
    this.mark.style.top = `${(k.y - 0.018) * 100}%`
    this.mark.style.width = `${(k.w + 0.024) * 100}%`
    this.mark.style.height = `${(k.h + 0.036) * 100}%`
    hudRoot(host).appendChild(el)
  }

  get visible(): boolean {
    return this.open_
  }

  show(caption = ''): void {
    this.open_ = true
    this.el.hidden = false
    this.el.classList.remove('out', 'show')
    void this.el.offsetWidth
    this.el.classList.add('show')
    this.cap.textContent = caption
    this.markCorner(false)
    this.zoomCorner(false)
  }

  /** すみの「NEXTMAKE 001」に光る枠 */
  markCorner(on: boolean): void {
    this.mark.classList.toggle('on', on)
  }

  /** すみへ寄る（紙を大きくして右下を画面の真ん中へ） */
  zoomCorner(on: boolean): void {
    const k = SKETCH_CORNER
    const cx = (k.x + k.w / 2 - 0.5) * 100
    const cy = (k.y + k.h / 2 - 0.5) * 100
    this.paper.style.transform = on ? `scale(2.3) translate(${-cx}%, ${-cy}%) rotate(-1.2deg)` : ''
  }

  setCaption(text: string): void {
    this.cap.textContent = text
  }

  hide(): void {
    if (!this.open_) return
    this.open_ = false
    this.el.classList.add('out')
    setTimeout(() => {
      if (!this.open_) this.el.hidden = true
    }, 320)
  }

  dispose(): void {
    this.el.remove()
  }
}
