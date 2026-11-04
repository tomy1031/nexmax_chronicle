import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PartBatch } from '../src/render/partBatch'
import { disposeObject3D } from '../src/game/dispose'

function doll(mat: THREE.Material, x: number): THREE.Group {
  const root = new THREE.Group()
  root.position.x = x
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 0.3), mat)
  body.castShadow = true
  const arm = new THREE.Group()
  arm.position.y = 0.6
  arm.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3), mat))
  root.add(body, arm)
  // ちがう材質の物はまとめない
  root.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial()))
  return root
}

describe('動く部品をまとめて描く（PartBatch）', () => {
  it('同じ材質の部品だけを集め、もとの部品は描かない層へ。位置・見えるかどうかを写す', () => {
    const scene = new THREE.Scene()
    const mat = new THREE.MeshStandardMaterial()
    const group = new THREE.Group()
    group.position.set(5, 0, 0)
    const a = doll(mat, 0)
    const b = doll(mat, 2)
    group.add(a, b)
    scene.add(group)
    const batch = PartBatch.create(group, (m) => m.material === mat, 't')!
    expect(batch).not.toBeNull()
    group.add(batch.mesh)
    expect(batch.mesh.castShadow).toBe(true)
    let hidden = 0
    group.traverse((o) => {
      if (o !== batch.mesh && (o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === mat) {
        expect(o.layers.isEnabled(0)).toBe(false)
        hidden++
      }
    })
    expect(hidden).toBe(4)
    a.rotation.y = 1
    b.visible = false
    scene.updateMatrixWorld(true)
    batch.sync()
    // batch は group の下なので、行列は group から見た位置（a の胴は group の原点）
    const m = new THREE.Matrix4()
    batch.mesh.getMatrixAt(0, m)
    const p = new THREE.Vector3().setFromMatrixPosition(m)
    expect(p.x).toBeCloseTo(0)
    expect(batch.mesh.getVisibleAt(0)).toBe(true)
    expect(batch.mesh.getVisibleAt(2)).toBe(false)
    // 場面から外した人形は描かない
    a.removeFromParent()
    batch.sync()
    expect(batch.mesh.getVisibleAt(0)).toBe(false)
  })

  it('ステージを片づけるとき、BatchedMesh の中のテクスチャも解放する（2 回解放しても止まらない）', () => {
    const mat = new THREE.MeshStandardMaterial()
    const group = new THREE.Group()
    group.add(doll(mat, 0))
    const batch = PartBatch.create(group, (m) => m.material === mat, 't')!
    group.add(batch.mesh)
    expect(() => disposeObject3D(group)).not.toThrow()
    expect(() => disposeObject3D(group)).not.toThrow()
  })
})
