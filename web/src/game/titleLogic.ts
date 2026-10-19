// タイトル画面の決まり（DOM なし・tests/title.test.ts）。
// 「キーを押す・タップ」→ メニュー（はじめから／つづきから）→ 記録があるのに「はじめから」なら確かめる → 決定。
// 記録が無いときの「つづきから」は選べない（カーソルも止まらない）。

export type TitleChoice = 'new' | 'continue'
export const TITLE_ITEMS: readonly TitleChoice[] = ['new', 'continue']

export type TitleState = {
  mode: 'press' | 'menu' | 'confirm' | 'done'
  /** メニューで選んでいる項目（TITLE_ITEMS の番号） */
  sel: number
  /** 確かめ：0 = いいえ・1 = はい */
  confirmSel: 0 | 1
  hasSave: boolean
  result: TitleChoice | null
}

export function titleInit(hasSave: boolean): TitleState {
  // 記録があれば「つづきから」を先に選んでおく
  return { mode: 'press', sel: hasSave ? 1 : 0, confirmSel: 0, hasSave, result: null }
}

export function itemEnabled(s: TitleState, i: number): boolean {
  return TITLE_ITEMS[i] !== 'continue' || s.hasSave
}

const UP = new Set(['ArrowUp', 'KeyW'])
const DOWN = new Set(['ArrowDown', 'KeyS'])
const LEFT = new Set(['ArrowLeft', 'KeyA'])
const RIGHT = new Set(['ArrowRight', 'KeyD'])
const OK = new Set(['Enter', 'NumpadEnter', 'Space', 'KeyF', 'KeyJ'])
const BACK = new Set(['Escape', 'Backspace', 'KeyK'])

/** 項目を選んで決める（クリック・タップも同じ） */
export function titleActivate(s: TitleState, i: number): TitleState {
  if (s.mode !== 'menu' || !itemEnabled(s, i)) return s
  const item = TITLE_ITEMS[i]
  if (item === 'new' && s.hasSave) return { ...s, sel: i, mode: 'confirm', confirmSel: 0 }
  return { ...s, sel: i, mode: 'done', result: item }
}

/** 確かめの答え（クリック・タップも同じ） */
export function titleConfirm(s: TitleState, yes: boolean): TitleState {
  if (s.mode !== 'confirm') return s
  return yes ? { ...s, mode: 'done', result: 'new' } : { ...s, mode: 'menu', confirmSel: 0 }
}

/** キーを押した（code は KeyboardEvent.code）。'press' の間はどのキーでもメニューへ */
export function titleKey(s: TitleState, code: string): TitleState {
  switch (s.mode) {
    case 'press':
      return { ...s, mode: 'menu' }
    case 'menu': {
      const step = UP.has(code) ? -1 : DOWN.has(code) ? 1 : 0
      if (step) {
        let i = s.sel
        for (let k = 0; k < TITLE_ITEMS.length; k++) {
          i = (i + step + TITLE_ITEMS.length) % TITLE_ITEMS.length
          if (itemEnabled(s, i)) break
        }
        return { ...s, sel: i }
      }
      if (OK.has(code)) return titleActivate(s, s.sel)
      return s
    }
    case 'confirm': {
      if (LEFT.has(code) || RIGHT.has(code) || UP.has(code) || DOWN.has(code)) return { ...s, confirmSel: s.confirmSel ? 0 : 1 }
      if (BACK.has(code)) return titleConfirm(s, false)
      if (OK.has(code)) return titleConfirm(s, s.confirmSel === 1)
      return s
    }
    default:
      return s
  }
}

/** 記録の日時の表示（例「10月19日 10:05」） */
export function formatSavedAt(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`
}
