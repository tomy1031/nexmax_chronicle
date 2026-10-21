// 大きな人形・小物の輪郭線（背面法線押し出し）。人物（world/characters.ts）の細い茶色の線と同じ見え方にそろえる。
// 押し出しはメッシュの座標で thickness（拡大を打ち消す）。遠くで細くなりすぎないよう、描画の画素で最小の太さを足す
// （OUTLINE.minPx と画面の高さは シェルが world/nexmax/materials.ts に入れている値を使う）。
// 線のメッシュは元のメッシュの子にして、同じジオメトリを使う（メモリは増えない。描画は 1 回ずつ増える）。
import * as THREE from 'three'
import { OUTLINE } from '../../../world/nexmax/materials'

const cache = new Map<string, THREE.MeshBasicMaterial>()

/** 線の材質（太さと色ごとに 1 つ。解放はルートをたどるシェルにまかせるので、ステージごとに作り直す） */
function outlineMaterial(thickness: number, color: THREE.ColorRepresentation): THREE.MeshBasicMaterial {
  const t = thickness.toFixed(4)
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
  mat.onBeforeCompile = (s) => {
    s.uniforms.uOutlineMinPx = OUTLINE.minPx
    s.uniforms.uOutlineViewH = OUTLINE.viewportH
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlineMinPx;\nuniform float uOutlineViewH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${t};`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
 {
   vec3 nV = normalize(normalMatrix * normal);
   float sc = length(modelViewMatrix[0].xyz);
   float need = uOutlineMinPx * 0.75 * 2.0 * (-mvPosition.z) / (projectionMatrix[1][1] * max(uOutlineViewH, 1.0));
   mvPosition.xyz += nV * max(0.0, need - ${t} * sc);
   gl_Position = projectionMatrix * mvPosition;
 }`,
      )
  }
  mat.customProgramCacheKey = () => `edo7-outline-${t}`
  mat.name = 'outline'
  return mat
}

/**
 * root の下のメッシュに輪郭線を付ける。thickness はワールドの m（親の拡大を打ち消す）。
 * userData.noOutline のメッシュ・透明な材質・線そのものは飛ばす。
 */
export function addOutlines(root: THREE.Object3D, thickness: number, color: THREE.ColorRepresentation = '#2a1a12', filter?: (m: THREE.Mesh) => boolean): void {
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
    const key = `${local.toFixed(4)}|${new THREE.Color(color).getHexString()}`
    let mat = cache.get(key)
    if (!mat) {
      mat = outlineMaterial(local, color)
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
