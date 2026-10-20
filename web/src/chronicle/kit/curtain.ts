// 画面の暗転・白転（場面の切り替え・回想の入り口）。#ui の上に 1 枚の div を重ねる。dispose で外す。

export class Curtain {
  private readonly el: HTMLDivElement

  constructor(host: HTMLElement = document.body) {
    this.el = document.createElement('div')
    this.el.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:6;transition:opacity 0.6s ease;'
    host.appendChild(this.el)
  }

  /** 暗く（on）・明るく（off）。sec 秒かけて。色は黒か白か任意の CSS 色 */
  set(on: boolean, sec = 0.6, color = '#000'): Promise<void> {
    this.el.style.background = color
    this.el.style.transition = `opacity ${sec}s ease`
    // 一度読ませてから変える（transition を効かせる）
    void this.el.offsetWidth
    this.el.style.opacity = on ? '1' : '0'
    return new Promise((r) => setTimeout(r, sec * 1000 + 30))
  }

  get covered(): boolean {
    return this.el.style.opacity === '1'
  }

  dispose(): void {
    this.el.remove()
  }
}
