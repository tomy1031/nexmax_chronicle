// 大きな人形・小物の輪郭線（背面法線押し出し）。人物（world/characters.ts）の細い茶色の線と同じ見え方にそろえる。
// 太さは画面の画素で決める（人物の線と同じ考え方：近くでも遠くでも同じ太さ）。人物・操作する物は OUTLINE_PX.figure、
// 飾りの小物は OUTLINE_PX.prop。thickness（ワールドの m）は近くで線が消えないための最小の押し出しで、ふつうは画素の方が勝つ
// （画面の高さは シェルが world/nexmax/materials.ts の OUTLINE に入れている値を使う）。
// 線のメッシュは元のメッシュの子にして、同じジオメトリを使う（メモリは増えない。描画は 1 回ずつ増える）。
import * as THREE from 'three'
import { OUTLINE } from '../../../world/nexmax/materials'

/** 画面の上の線の太さ（画素）。人物と同じく、大きな画面では画面の高さの割合（OUTLINE.width）の方が勝つ */
export const OUTLINE_PX = {
  /** 人物・ボス・操作する物（人物の線 OUTLINE.minPx と同じ） */
  figure: 1.6,
  /** 飾りの小物 */
  prop: 1.1,
} as const

const cache = new Map<string, THREE.MeshBasicMaterial>()

/** 線の材質（太さと色ごとに 1 つ。解放はルートをたどるシェルにまかせるので、ステージごとに作り直す） */
function outlineMaterial(thickness: number, px: number, color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const t = thickness.toFixed(4)
  const k = (px / Math.max(0.01, OUTLINE.minPx.value)).toFixed(3)
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  mat.onBeforeCompile = (s) => {
    s.uniforms.uOutlineWidth = OUTLINE.width
    s.uniforms.uOutlineMinPx = OUTLINE.minPx
    s.uniforms.uOutlineViewH = OUTLINE.viewportH
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlineWidth;\nuniform float uOutlineMinPx;\nuniform float uOutlineViewH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${t};`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
 {
   vec3 nV = normalize(normalMatrix * normal);
   float sc = length(modelViewMatrix[0].xyz);
   float frac = ${k} * max(uOutlineWidth, uOutlineMinPx / max(uOutlineViewH, 1.0));
   float need = frac * 2.0 * (-mvPosition.z) / projectionMatrix[1][1];
   mvPosition.xyz += nV * max(0.0, need - ${t} * sc);
   gl_Position = projectionMatrix * mvPosition;
 }`,
      )
  }
  mat.customProgramCacheKey = () => `edo7-outline-${t}-${k}`
  mat.name = 'outline'
  return mat
}

/**
 * root の下のメッシュに輪郭線を付ける。thickness はワールドの m の最小の押し出し（親の拡大を打ち消す）、
 * px は画面の上の太さ（OUTLINE_PX）。userData.noOutline のメッシュ・透明な材質・線そのものは飛ばす。
 */
export function addOutlines(
  root: THREE.Object3D,
  thickness: number,
  color: THREE.ColorRepresentation = '#2a1a12',
  filter?: (m: THREE.Mesh) => boolean,
  px: number = OUTLINE_PX.prop,
): void {
  root.updateMatrixWorld(true)
  const list: THREE.Mesh[] = []
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || m.userData.noOutline || m.userData.isOutline) return
    const mat = m.material as THREE.Material
    if (Array.isArray(m.material) || mat.transparent || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return
    if (filter && !filter(m)) return
    list.push(m)
  })
  cache.clear()
  const ws = new THREE.Vector3()
  for (const m of list) {
    m.getWorldScale(ws)
    const k = Math.max(1e-6, (Math.abs(ws.x) + Math.abs(ws.y) + Math.abs(ws.z)) / 3)
    const local = thickness / k
    const key = `${local.toFixed(4)}|${px}|${new THREE.Color(color).getHexString()}`
    let mat = cache.get(key)
    if (!mat) {
      mat = outlineMaterial(local, px, color)
      cache.set(key, mat)
    }
    const o = new THREE.Mesh(m.geometry, mat)
    o.castShadow = false
    o.receiveShadow = false
    o.userData.isOutline = true
    o.userData.noOutline = true
    o.name = `${m.name || 'part'}_outline`
    m.add(o)
  }
  cache.clear()
}
