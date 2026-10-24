// 佐伯さん（saeki.glb）のジャケットの胸の、前の NEXTMAKE の印（白い三角）を、新しい印（三つの三角で「M」）に描きかえる。
// 読みこんだ人の色のテクスチャは、キャンバス（world/characters.ts の softenTexture）なので、その上に直接かく。
// 印の場所は saeki.glb のテクスチャ（1024 四方）で決まっている（白い三角の輪郭：x 888〜910・y 811〜841。とがった先が左＝服の上）。
import * as THREE from 'three'
import type { Character } from '../../../world/characters'
import { drawMark } from './brandArt'

/** 前の印の場所（テクスチャ 1024 px の座標）と、服の「上」がテクスチャのどちらか（左 = -x） */
const SAEKI_MARK = { x0: 886, y0: 809, x1: 912, y1: 843, cx: 899.5, cy: 826, w: 25, navyAt: [893, 803] as const }

/** 佐伯さんのジャケットの印を描きかえる。描いたら true */
export function repaintSaekiMark(ch: Character): boolean {
  if (ch.placeholder || typeof document === 'undefined') return false
  let done = false
  ch.root.traverse((o) => {
    const m = o as THREE.Mesh
    if (done || !m.isMesh || m.userData.noOutline) return
    const mat = m.material as THREE.MeshToonMaterial
    if (!mat || Array.isArray(mat) || !mat.map) return
    const cv = mat.map.image as HTMLCanvasElement | undefined
    if (!cv || typeof (cv as HTMLCanvasElement).getContext !== 'function') return
    const g = cv.getContext('2d')
    if (!g) return
    const s = cv.width / 1024
    const K = SAEKI_MARK
    // まわりの紺で前の印をぬりつぶす
    const px = g.getImageData(Math.round(K.navyAt[0] * s), Math.round(K.navyAt[1] * s), 1, 1).data
    g.fillStyle = `rgb(${px[0]},${px[1]},${px[2]})`
    g.beginPath()
    g.ellipse(((K.x0 + K.x1) / 2) * s, ((K.y0 + K.y1) / 2) * s, ((K.x1 - K.x0) / 2) * s, ((K.y1 - K.y0) / 2) * s, 0, 0, Math.PI * 2)
    g.fill()
    // 新しい印（白。服の上 = テクスチャの左なので、-90° 回して）
    g.save()
    g.translate(K.cx * s, K.cy * s)
    g.rotate(-Math.PI / 2)
    drawMark(g, 0, 0, K.w * s, '#ffffff', 'rgba(205,230,255,0.95)')
    g.restore()
    mat.map.needsUpdate = true
    if (mat.emissiveMap && mat.emissiveMap !== mat.map) mat.emissiveMap.needsUpdate = true
    done = true
  })
  return done
}
