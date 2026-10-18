// 手続きで組んだ人物・敵の「同じ関節にぶら下がった、同じ材質の部品」を 1 つのメッシュにまとめる（描画の回数を減らす）。
// 関節（Group）ごとにまとめるので、関節を回す動きはそのまま。個別に動かす・色を変える部品は keep に入れて残す。
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export function mergeChildMeshes(root: THREE.Object3D, o: { keep?: ReadonlySet<THREE.Object3D>; disposeOriginals?: boolean } = {}): void {
  const parents: THREE.Object3D[] = []
  root.traverse((n) => {
    if (n.children.length > 1) parents.push(n)
  })
  for (const p of parents) {
    const buckets = new Map<string, THREE.Mesh[]>()
    for (const c of p.children) {
      const m = c as THREE.Mesh
      if (!m.isMesh || m.children.length || o.keep?.has(m) || Array.isArray(m.material) || !m.geometry.index) continue
      const key = `${(m.material as THREE.Material).uuid}|${m.castShadow ? 1 : 0}|${m.visible ? 1 : 0}`
      const list = buckets.get(key)
      if (list) list.push(m)
      else buckets.set(key, [m])
    }
    for (const list of buckets.values()) {
      if (list.length < 2) continue
      const geos = list.map((m) => {
        m.updateMatrix()
        const g = new THREE.BufferGeometry()
        g.setIndex(m.geometry.index!.clone())
        for (const name of ['position', 'normal', 'uv']) {
          const a = m.geometry.getAttribute(name)
          if (a) g.setAttribute(name, (a as THREE.BufferAttribute).clone())
        }
        g.applyMatrix4(m.matrix)
        return g
      })
      const merged = mergeGeometries(geos, false)
      for (const g of geos) g.dispose()
      if (!merged) continue
      const first = list[0]
      const mesh = new THREE.Mesh(merged, first.material)
      mesh.castShadow = first.castShadow
      mesh.receiveShadow = first.receiveShadow
      mesh.name = `${first.name || 'part'}_merged`
      for (const m of list) {
        p.remove(m)
        if (o.disposeOriginals) m.geometry.dispose()
      }
      p.add(mesh)
    }
  }
}
