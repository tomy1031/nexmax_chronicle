// 章のとびら（物語 v7）：大きな章のはじめに、絵本のとびらのように絵・章の題・子ども向けの一行のあらすじを出す。
// 子どもが「いま何がおきているか」「何をすればいいか」を見失わないための区切り。F・Space・クリック・タップで早送り。
// 12 の小さな章（場面）は 5 つの大きな章にまとめる（progress.ts の BIG_CHAPTER）。同じ大きな章の中の場面の変わり目は、
// 場面の題を小さく出すだけ（caption。止めない）。
// 出し方：時代を移って着いたとき、章が進んでいればシェルが自動で出す（画面を見せる前に、とびらで隠したまま）。
// 同じ時代の中で章が変わるとき（2086 の 1→2→3…）は、ステージが場面の頭で `await rt.chapter()` を呼ぶ。
import { BIG_CHAPTER_TITLES, bigChapterLabel, sceneTitle, type BigChapter, type Chapter } from './progress'
import { V7_ART } from './art'

/** 大きな章の絵 */
export const BIG_CHAPTER_ART: Readonly<Record<BigChapter, string>> = {
  0: V7_ART.prologue,
  1: './textures/story/v7/ch01.webp',
  2: './textures/story/v7/ch06.webp',
  3: './textures/story/v7/ch08.webp',
  4: './textures/story/v7/ch11.webp',
  5: './textures/story/v7/ch12.webp',
  6: V7_ART.epilogueMorning,
}

/** 子ども向けの一行のあらすじ（いま何がおきていて、何をするのか。先のことは言わない） */
export const BIG_CHAPTER_LEADS: Readonly<Record<BigChapter, string>> = {
  0: 'ソラが、地下の倉庫で、ねむっている小さなロボットを見つけた。',
  1: 'お祭りの一日目。ソラの展示を手伝おう。夜は、いっしょにお祭りを回る約束。',
  2: '60年前の大阪、そして300年前の江戸へ。背中の石と、空の怪物のなぞをたどる。',
  3: '帰ってきたら、爪をしまったほこらが消えていた。昔が変わると、今も変わる。',
  4: '900年前のカンボジアへ。空の怪物と戦った人たちに、たおし方を教わる。',
  5: '最後の光のつぶ。ソラといっしょに、明日を取りもどす。',
  6: '10月19日の朝。新しい一日がはじまる。',
}

const CSS = `
.nx-chapter { position: absolute; inset: 0; z-index: 30; display: grid; place-items: center; pointer-events: auto; opacity: 0; transition: opacity 0.7s ease; background: #05070f; font-family: var(--nx-jp, system-ui, sans-serif); }
.nx-chapter.on { opacity: 1; }
.nx-chapter .ncc-img { position: absolute; inset: 0; background-size: cover; background-position: center; transform: scale(1.06); transition: transform 6s ease-out; filter: saturate(1.05); }
.nx-chapter.on .ncc-img { transform: scale(1); }
.nx-chapter .ncc-shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(5,7,15,0) 40%, rgba(5,7,15,0.82) 78%, rgba(5,7,15,0.95) 100%); }
.nx-chapter .ncc-text { position: absolute; left: 0; right: 0; bottom: 7%; text-align: center; color: #fffaf0; padding: 0 6%; }
.nx-chapter .ncc-no { font-size: clamp(12px, 1.7vmin, 18px); letter-spacing: 0.4em; color: #ffd98a; opacity: 0.9; margin-bottom: 0.6em; }
.nx-chapter .ncc-title { font-size: clamp(22px, 4.6vmin, 48px); font-weight: 800; letter-spacing: 0.08em; text-shadow: 0 2px 12px rgba(0,0,0,0.7); }
.nx-chapter .ncc-lead { margin-top: 0.8em; font-size: clamp(14px, 2.4vmin, 24px); line-height: 1.6; color: #e9f2ff; text-shadow: 0 1px 8px rgba(0,0,0,0.8); }
.nx-chapter .ncc-skip { position: absolute; right: 2.5%; bottom: 2.5%; font-size: clamp(10px, 1.4vmin, 14px); color: rgba(255,255,255,0.55); letter-spacing: 0.1em; }
.nx-chapter.instant { transition: none; }
.nx-scene { position: absolute; left: 50%; top: 17%; transform: translate(-50%, -6px); z-index: 20; pointer-events: none; opacity: 0; transition: opacity 0.6s ease, transform 0.6s ease; text-align: center; color: #fffaf0; font-family: var(--nx-jp, system-ui, sans-serif); font-weight: 800; font-size: clamp(16px, 3vmin, 30px); letter-spacing: 0.14em; text-shadow: 0 2px 10px rgba(0,0,0,0.75); white-space: nowrap; }
.nx-scene::before, .nx-scene::after { content: ''; display: inline-block; width: 2.2em; height: 1px; margin: 0 0.7em; vertical-align: middle; background: linear-gradient(90deg, rgba(255,217,138,0), rgba(255,217,138,0.9)); }
.nx-scene::after { background: linear-gradient(90deg, rgba(255,217,138,0.9), rgba(255,217,138,0)); }
.nx-scene.on { opacity: 1; transform: translate(-50%, 0); }
`

let styled = false

export class ChapterCard {
  private readonly host: HTMLElement
  private el: HTMLDivElement | null = null
  private resolve: (() => void) | null = null
  private t = 0
  private dur = 0
  private closing = false
  private caption_: { el: HTMLDivElement; t: number; dur: number } | null = null

  constructor(host: HTMLElement) {
    this.host = host
    if (!styled) {
      styled = true
      const s = document.createElement('style')
      s.textContent = CSS
      document.head.appendChild(s)
    }
  }

  get active(): boolean {
    return this.el !== null
  }

  /**
   * 大きな章のとびらを出す（終わったら resolve）。seconds で自動で閉じる。
   * instant：はじめから全部おおった形で出す（時代を移って着いたとき、画面を見せる前に）
   */
  show(big: BigChapter, seconds = 5.2, instant = false): Promise<void> {
    this.finish()
    const el = document.createElement('div')
    el.className = instant ? 'nx-chapter instant' : 'nx-chapter'
    el.innerHTML = `<div class="ncc-img"></div><div class="ncc-shade"></div><div class="ncc-text"><div class="ncc-no"></div><div class="ncc-title"></div><div class="ncc-lead"></div></div><div class="ncc-skip">F　つぎへ</div>`
    ;(el.querySelector('.ncc-img') as HTMLDivElement).style.backgroundImage = `url("${BIG_CHAPTER_ART[big]}")`
    ;(el.querySelector('.ncc-no') as HTMLDivElement).textContent = bigChapterLabel(big)
    ;(el.querySelector('.ncc-title') as HTMLDivElement).textContent = BIG_CHAPTER_TITLES[big]
    ;(el.querySelector('.ncc-lead') as HTMLDivElement).textContent = BIG_CHAPTER_LEADS[big]
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.skip()
    })
    this.host.appendChild(el)
    void el.offsetWidth
    el.classList.add('on')
    // 閉じるときはふつうにフェードする
    if (instant) requestAnimationFrame(() => el.classList.remove('instant'))
    this.el = el
    this.t = 0
    this.dur = seconds
    this.closing = false
    return new Promise((r) => (this.resolve = r))
  }

  /** 場面の題を、画面の上に小さく出す（止めない。数秒で消える） */
  caption(ch: Chapter, seconds = 3.2): void {
    this.caption_?.el.remove()
    const el = document.createElement('div')
    el.className = 'nx-scene'
    el.textContent = sceneTitle(ch)
    this.host.appendChild(el)
    void el.offsetWidth
    el.classList.add('on')
    this.caption_ = { el, t: 0, dur: seconds }
  }

  /** 早送り（出てすぐは効かない） */
  skip(): void {
    if (this.el && this.elapsed() > 0.8) this.close()
  }

  /**
   * 毎フレーム（dt は実時間の秒）。1 フレームは 0.1 秒までしか数えない
   * （着いた直後の読み込みで画面が止まっている間に、とびらが見えないまま時間が過ぎないように）
   */
  update(dt: number): void {
    const step = Math.min(Math.max(dt, 0), 0.1)
    const c = this.caption_
    if (c) {
      c.t += step
      if (c.t >= c.dur) c.el.classList.remove('on')
      if (c.t >= c.dur + 0.7) {
        c.el.remove()
        this.caption_ = null
      }
    }
    if (!this.el) return
    this.t += step
    if (!this.closing && this.elapsed() >= this.dur) this.close()
  }

  private elapsed(): number {
    return this.t
  }

  private close(): void {
    if (!this.el || this.closing) return
    this.closing = true
    const el = this.el
    el.classList.remove('on')
    setTimeout(() => {
      if (this.el === el) this.finish()
    }, 700)
  }

  /** すぐ消す（時空移動・ステージの解放） */
  finish(): void {
    this.caption_?.el.remove()
    this.caption_ = null
    this.el?.remove()
    this.el = null
    this.closing = false
    const r = this.resolve
    this.resolve = null
    r?.()
  }
}
