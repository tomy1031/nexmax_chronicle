// 7 章の書・看板に使う筆文字の「足りない字」だけを、同じ書体名（Yuji Boku / Yuji Syuku）に足す。
// 共有のサブセット（public/fonts/Yuji*-subset.woff2）に無い字（裂・爪・鐘・鳴・怪 など）を、unicode-range を絞った
// 別のフォント（public/fonts/Yuji*-edo7.woff2、SIL OFL。Google Fonts の css2 API の text= で同じ書体から切り出した）で補う。
// 範囲を絞ってあるので、ほかの字は今までどおり共有のサブセットで描かれる。キャンバスに字を描く前に await する。
import { loadLetteringFonts } from '../../../render/textures'

/** 足した字（public/fonts/Yuji*-edo7.woff2 に入っている字） */
export const EDO7_EXTRA_CHARS = '裂爪鳴怪鐘広刻巻朝陽暁夜宝預約灯鈴狐守祈願奉納'

const RANGE = [...EDO7_EXTRA_CHARS].map((ch) => `U+${(ch.codePointAt(0) as number).toString(16)}`).join(', ')

let loading: Promise<boolean> | null = null

export function loadEdo7Fonts(timeoutMs = 8000): Promise<boolean> {
  if (loading) return loading
  const load = async (): Promise<boolean> => {
    await loadLetteringFonts()
    if (typeof FontFace === 'undefined' || !document.fonts) return false
    const faces: Array<[string, string]> = [
      ['Yuji Boku', './fonts/YujiBoku-edo7.woff2'],
      ['Yuji Syuku', './fonts/YujiSyuku-edo7.woff2'],
    ]
    const r = await Promise.allSettled(
      faces.map(async ([family, url]) => {
        const f = new FontFace(family, `url(${url}) format('woff2')`, { style: 'normal', weight: '400', display: 'block', unicodeRange: RANGE })
        await f.load()
        document.fonts.add(f)
      }),
    )
    return r.every((x) => x.status === 'fulfilled')
  }
  loading = Promise.race([load().catch(() => false), new Promise<boolean>((res) => setTimeout(() => res(false), timeoutMs))])
  return loading
}
