import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Batch, SHADOW_ONLY_LAYER, splitByCell } from '../src/render/batch'

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
    const g = b.build('t', 32, 0)
    expect(g.children.length).toBe(3)
    const tris = g.children.reduce((s, m) => s + ((m as THREE.Mesh).geometry.index as THREE.BufferAttribute).count / 3, 0)
    expect(tris).toBe(new THREE.BoxGeometry(1, 1, 1, 24, 24, 24).index!.count / 3 * xs.length)
    expect(new Batch().build('e', 0).children.length).toBe(0)
  })
  it('影用の形：画面に描く物は 1 つのまま（影は落とさない）、影は区画ごとの位置だけの形が、影の層で落とす', () => {
    const mat = new THREE.MeshStandardMaterial()
    const b = new Batch()
    for (const x of [0, 5, 40, 45, 80, 85]) b.add(new THREE.BoxGeometry(1, 1, 1, 24, 24, 24), mat, new THREE.Matrix4().makeTranslation(x, 0, 0))
    const g = b.build('t')
    const main = g.children.filter((m) => m.name !== 'shadowCaster') as THREE.Mesh[]
    const casters = g.children.filter((m) => m.name === 'shadowCaster') as THREE.Mesh[]
    expect(main).toHaveLength(1)
    expect(main[0].castShadow).toBe(false)
    expect(casters).toHaveLength(3)
    for (const c of casters) {
      expect(c.castShadow).toBe(true)
      expect(c.layers.isEnabled(SHADOW_ONLY_LAYER)).toBe(true)
      expect(c.layers.isEnabled(0)).toBe(false)
      expect(Object.keys(c.geometry.attributes)).toEqual(['position'])
    }
  })
  it('透かしの無い材質の影は、材質に関係なく区画ごとに 1 つにまとめる（透かしのある材質は別）', () => {
    const red = new THREE.MeshStandardMaterial({ color: 'red' })
    const blue = new THREE.MeshStandardMaterial({ color: 'blue' })
    const leaf = new THREE.MeshStandardMaterial({ alphaTest: 0.5 })
    const b = new Batch()
    for (const x of [0, 5, 40, 45, 80, 85]) {
      b.add(new THREE.BoxGeometry(1, 1, 1, 24, 24, 24), red, new THREE.Matrix4().makeTranslation(x, 0, 0))
      b.add(new THREE.BoxGeometry(1, 1, 1, 4, 4, 4), blue, new THREE.Matrix4().makeTranslation(x, 0, 2))
    }
    b.add(new THREE.PlaneGeometry(1, 1), leaf, new THREE.Matrix4().makeTranslation(0, 0, 4))
    const g = b.build('t')
    const main = g.children.filter((m) => m.name !== 'shadowCaster') as THREE.Mesh[]
    const casters = g.children.filter((m) => m.name === 'shadowCaster') as THREE.Mesh[]
    expect(main).toHaveLength(3)
    // 赤と青は影を落とさず、区画（3 つ）ごとの影用の形が落とす。透かしのある葉は小さいので、自分で落とす
    expect(main.filter((m) => m.castShadow).map((m) => m.material)).toEqual([leaf])
    expect(casters).toHaveLength(3)
    const verts = casters.reduce((s, c) => s + c.geometry.attributes.position.count, 0)
    const one = new THREE.BoxGeometry(1, 1, 1, 24, 24, 24).attributes.position.count + new THREE.BoxGeometry(1, 1, 1, 4, 4, 4).attributes.position.count
    expect(verts).toBe(one * 6)
  })
  it('同じ材質は「影を落とす・落とさない」に関係なく、画面に描く形を 1 つにまとめる（影は影用の形が落とす）', () => {
    const mat = new THREE.MeshStandardMaterial()
    const b = new Batch()
    for (const x of [0, 5, 40, 45, 80, 85]) b.add(new THREE.BoxGeometry(1, 1, 1, 24, 24, 24), mat, new THREE.Matrix4().makeTranslation(x, 0, 0))
    b.add(new THREE.BoxGeometry(1, 1, 1), mat, new THREE.Matrix4().makeTranslation(0, 0, 3), { cast: false })
    const g = b.build('t')
    const main = g.children.filter((m) => m.name !== 'shadowCaster') as THREE.Mesh[]
    expect(main).toHaveLength(1)
    expect(main[0].castShadow).toBe(false)
    // shadows = false：影用の形も作らず、どれも影を落とさない
    const b2 = new Batch()
    b2.add(new THREE.BoxGeometry(1, 1, 1, 30, 30, 30), mat)
    b2.add(new THREE.BoxGeometry(1, 1, 1), mat, undefined, { cast: false })
    const g2 = b2.build('far', undefined, 0, false)
    expect(g2.children).toHaveLength(1)
    expect((g2.children[0] as THREE.Mesh).castShadow).toBe(false)
  })
  it('影を落とさない組・小さい組は、影用の形を作らない', () => {
    const mat = new THREE.MeshStandardMaterial()
    const b = new Batch()
    for (const x of [0, 50]) b.add(new THREE.BoxGeometry(1, 1, 1, 30, 30, 30), mat, new THREE.Matrix4().makeTranslation(x, 0, 0), { cast: false })
    b.add(new THREE.BoxGeometry(), mat)
    const g = b.build('t')
    expect(g.children.every((m) => m.name !== 'shadowCaster')).toBe(true)
  })
})

describe('遠い量産型NEXMAX を軽い形にする境目', () => {
  it('FAR より遠くなったら軽く、NEAR より近づいたら戻す（あいだは今のまま）', async () => {
    const { unitIsFar, UNIT_LOD_FAR, UNIT_LOD_NEAR } = await import('../src/stages/future2086/unitBatch')
    expect(UNIT_LOD_NEAR).toBeLessThan(UNIT_LOD_FAR)
    expect(unitIsFar(false, UNIT_LOD_FAR - 0.1)).toBe(false)
    expect(unitIsFar(false, UNIT_LOD_FAR + 0.1)).toBe(true)
    const mid = (UNIT_LOD_FAR + UNIT_LOD_NEAR) / 2
    expect(unitIsFar(true, mid)).toBe(true)
    expect(unitIsFar(false, mid)).toBe(false)
    expect(unitIsFar(true, UNIT_LOD_NEAR - 0.1)).toBe(false)
  })
})
