// アプリのアイコン作り用のページ（icon-render.html。scripts/make-icons.mjs が開いて PNG を取り出す）。
// タイトル画面と同じ 3D のネクマックスの顔を、背景なしで 1024px 四方に描く。
import { TitleNexmax } from '../ui/title/titleNexmax'

declare global {
  interface Window {
    __iconPng?: string
  }
}

const size = Number(new URLSearchParams(location.search).get('size') ?? 1024)
const nx = new TitleNexmax('head', { preserve: true })
document.body.appendChild(nx.canvas)
// 画素比 1 で描く（setSize は端末の画素比を使うので、CSS の大きさを割って合わせる）
const dpr = Math.min(2, window.devicePixelRatio || 1)
nx.setSize(size / dpr, size / dpr)
// まばたきの途中にならない時刻まで進めてから描く
nx.advance(0.4)
nx.render()
window.__iconPng = nx.canvas.toDataURL('image/png')
