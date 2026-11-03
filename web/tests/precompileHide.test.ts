import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { hideUnseenFromCompile } from '../src/render/renderer'

describe('シェーダの事前の準備で、カメラに見えない形を外す', () => {
  it('カメラの層に無い形だけ材質を外し、戻す関数で元にもどす', () => {
    const scene = new THREE.Scene()
    const cam = new THREE.PerspectiveCamera()
    const mat = new THREE.MeshStandardMaterial()
    const seen = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    const shadowOnly = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    shadowOnly.layers.set(2)
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
    hidden.layers.set(31)
    const both = new THREE.Mesh(new THREE.BoxGeometry(), mat)
    both.layers.enable(2)
    scene.add(seen, shadowOnly, hidden, both)
    const hiddenMat = hidden.material
    const restore = hideUnseenFromCompile(scene, cam)
    expect(seen.material).toBe(mat)
    expect(both.material).toBe(mat)
    expect(shadowOnly.material).toBeNull()
    expect(hidden.material).toBeNull()
    restore()
    expect(shadowOnly.material).toBe(mat)
    expect(hidden.material).toBe(hiddenMat)
  })
})
