// シーングラフ配下の GPU 資源（ジオメトリ・マテリアル・テクスチャ・シェーダの uniform のテクスチャ）を解放する。
// three.js は解放後に同じオブジェクトが再び描画されると自動で作り直すので、キャッシュされた共有テクスチャを
// 解放しても壊れない（次に使われたときに再アップロードされる）。
import * as THREE from 'three'

export type DisposeStats = { geometries: number; materials: number; textures: number }

function texturesOf(mat: THREE.Material, out: Set<THREE.Texture>): void {
  const rec = mat as unknown as Record<string, unknown>
  for (const k of Object.keys(rec)) {
    const v = rec[k]
    if (v && (v as THREE.Texture).isTexture) out.add(v as THREE.Texture)
  }
  const sm = mat as THREE.ShaderMaterial
  if (sm.uniforms) {
    for (const u of Object.values(sm.uniforms)) {
      const v = u?.value as unknown
      if (v && (v as THREE.Texture).isTexture) out.add(v as THREE.Texture)
      if (Array.isArray(v)) for (const x of v) if (x && (x as THREE.Texture).isTexture) out.add(x as THREE.Texture)
    }
  }
}

/** root 配下をすべて解放する（root はシーンから外しておくこと） */
export function disposeObject3D(root: THREE.Object3D, extraTextures: Iterable<THREE.Texture> = []): DisposeStats {
  const geos = new Set<THREE.BufferGeometry>()
  const mats = new Set<THREE.Material>()
  const texs = new Set<THREE.Texture>(extraTextures)
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) geos.add(m.geometry)
    const mat = (m as { material?: THREE.Material | THREE.Material[] }).material
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) mats.add(x)
    const l = o as THREE.Light
    if (l.isLight) {
      const sh = (l as THREE.DirectionalLight).shadow
      sh?.dispose?.()
    }
  })
  for (const m of mats) texturesOf(m, texs)
  for (const g of geos) g.dispose()
  for (const m of mats) m.dispose()
  for (const t of texs) t.dispose()
  return { geometries: geos.size, materials: mats.size, textures: texs.size }
}
