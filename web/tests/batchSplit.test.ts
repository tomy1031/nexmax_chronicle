import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Batch, splitByCell } from '../src/render/batch'

const boxAt = (x: number, z: number, s = 1) => new THREE.BoxGeometry(s, s, s, 24, 24, 24).translate(x, 0, z)

describe('結合を区画に分ける', () => {
  it('頂点の少ない組は分けない', () => {
    expect(splitByCell([new THREE.BoxGeometry(), new THREE.BoxGeometry().translate(100, 0, 0)], 32)).toHaveLength(1)
  })
  it('大きい組は区画ごと。区画より大きい物は別の 1 組', () => {
    const geos = [boxAt(1, 1), boxAt(2, 3), boxAt(40, 1), boxAt(41, 2), boxAt(1, 70), new THREE.PlaneGeometry(200, 200, 40, 40).rotateX(-Math.PI / 2)]
    const groups = splitByCell(geos, 32)
    expect(groups).toHaveLength(4)
    expect(groups.find((g) => g.includes(geos[5]))).toHaveLength(1)
  })
  it('Batch.build は区画ごとのメッシュを返し、三角形の数は同じ', () => {
    const mat = new THREE.MeshStandardMaterial()
    const b = new Batch()
    const xs = [0, 5, 40, 45, 80, 85]
    for (const x of xs) b.add(new THREE.BoxGeometry(1, 1, 1, 24, 24, 24), mat, new THREE.Matrix4().makeTranslation(x, 0, 0))
    const g = b.build('t', 32)
    expect(g.children.length).toBe(3)
    const tris = g.children.reduce((s, m) => s + ((m as THREE.Mesh).geometry.index as THREE.BufferAttribute).count / 3, 0)
    expect(tris).toBe(new THREE.BoxGeometry(1, 1, 1, 24, 24, 24).index!.count / 3 * xs.length)
    expect(new Batch().build('e', 0).children.length).toBe(0)
  })
})
