// 章のとびら（物語 v7）：章のはじめに、絵本のとびらのように絵・章の題・子ども向けの一行のあらすじを出す。
// 子どもが「いま何がおきているか」「何をすればいいか」を見失わないための区切り。F・Space・クリック・タップで早送り。
// 出し方：時代を移って着いたとき、章が進んでいればシェルが自動で出す（stage.revealed の前）。
// 同じ時代の中で章が変わるとき（2086 の 1→2→3…）は、ステージが場面の頭で `await rt.chapter()` を呼ぶ。
import { CHAPTER_TITLES, type Chapter } from './progress'
import { V7_ART } from './art'

/** 章の絵（0 と 13 は一枚絵を使い回す） */
export const CHAPTER_ART: Readonly<Record<Chapter, string>> = {
  0: V7_ART.prologue,
  1: './textures/story/v7/ch01.webp',
  2: './textures/story/v7/ch02.webp',
  3: './textures/story/v7/ch03.webp',
  4: './textures/story/v7/ch04.webp',
  5: './textures/story/v7/ch05.webp',
  6: './textures/story/v7/ch06.webp',
  7: './textures/story/v7/ch07.webp',
  8: './textures/story/v7/ch08.webp',
  9: './textures/story/v7/ch09.webp',
  10: './textures/story/v7/ch10.webp',
  11: './textures/story/v7/ch11.webp',
  12: './textures/story/v7/ch12.webp',
  13: V7_ART.epilogueMorning,
}

/** 子ども向けの一行のあらすじ（いま何がおきていて、何をするのか） */
export const CHAPTER_LEADS: Readonly<Record<Chapter, string>> = {
  0: 'ソラが、地下の倉庫で、ねむっている小さなロボットを見つけた。',
  1: 'お祭りの一日目。ソラの展示を手伝おう。夜は、いっしょにお祭りを回る約束。',
  2: '夜の空にひびが入る。黒い手が、ネクマックスの背中の石をねらってくる。',
  3: '気がつくと、また同じ朝。ネクマックスだけが、昨日を覚えている。',
  4: 'にげても、たたかっても、うまくいかない。仮面の男は、ネクマックスを知っているみたい。',
  5: 'ソラに全部話そう。手がかりは、背中の板の「NEXTMAKE」。',
  6: '60年前の大阪へ。ネクマックスの昔を知る人たちに会う。',
  7: '300年前の江戸へ。空の怪物を裂く「青い刃のかけら」を、たしかめに行く。',
  8: '帰ってきたら、爪をしまったほこらが消えていた。昔が変わると、今も変わる。',
  9: 'もう一度 2026年へ。マツイ社長に、ほこらを守ってとたのもう。',
  10: 'ほこらの箱には、360年分の朝日をあびた爪。とざされていた思い出も、ひらく。',
  11: '900年前のカンボジアへ。空の怪物と戦った人たちに、たおし方を教わる。',
  12: '最後の光のつぶ。ソラといっしょに、明日を取りもどす。',
  13: '10月19日の朝。新しい一日がはじまる。',
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
`

let styled = false

export class ChapterCard {
  private readonly host: HTMLElement
  private el: HTMLDivElement | null = null
  private resolve: (() => void) | null = null
  private t = 0
  private dur = 0
  private closing = false

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

  /** 章のとびらを出す（終わったら resolve）。seconds で自動で閉じる */
  show(ch: Chapter, seconds = 5.2): Promise<void> {
    this.finish()
    const el = document.createElement('div')
    el.className = 'nx-chapter'
    const no = ch === 0 ? 'はじめに' : ch === 13 ? 'おわりに' : `第 ${ch} 章`
    const title = CHAPTER_TITLES[ch].replace(/^(はじめに|おわりに|\d+)\s*　?/, '')
    el.innerHTML = `<div class="ncc-img"></div><div class="ncc-shade"></div><div class="ncc-text"><div class="ncc-no"></div><div class="ncc-title"></div><div class="ncc-lead"></div></div><div class="ncc-skip">F　つぎへ</div>`
    ;(el.querySelector('.ncc-img') as HTMLDivElement).style.backgroundImage = `url("${CHAPTER_ART[ch]}")`
    ;(el.querySelector('.ncc-no') as HTMLDivElement).textContent = no
    ;(el.querySelector('.ncc-title') as HTMLDivElement).textContent = title
    ;(el.querySelector('.ncc-lead') as HTMLDivElement).textContent = CHAPTER_LEADS[ch]
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      this.skip()
    })
    this.host.appendChild(el)
    void el.offsetWidth
    el.classList.add('on')
    this.el = el
    this.t = performance.now()
    this.dur = seconds
    this.closing = false
    return new Promise((r) => (this.resolve = r))
  }

  /** 早送り（出てすぐは効かない） */
  skip(): void {
    if (this.el && this.elapsed() > 0.8) this.close()
  }

  /** 毎フレーム。時間は実時間で数える（重い端末でフレームが落ちても、決まった秒数で閉じる） */
  update(): void {
    if (!this.el) return
    if (!this.closing && this.elapsed() >= this.dur) this.close()
  }

  private elapsed(): number {
    return (performance.now() - this.t) / 1000
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
    this.el?.remove()
    this.el = null
    this.closing = false
    const r = this.resolve
    this.resolve = null
    r?.()
  }
}
