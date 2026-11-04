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

describe('影用の層の形も、影を描くときに入る', () => {
  it('影を描くあいだだけ画面のカメラの層に SHADOW_ONLY_LAYER を足し、終わったら戻す', async () => {
    const { includeShadowOnlyLayer } = await import('../src/render/renderer')
    const { SHADOW_ONLY_LAYER } = await import('../src/render/batch')
    const cam = new THREE.PerspectiveCamera()
    const seen: boolean[] = []
    const sm = { render: (_l: THREE.Light[], _s: THREE.Scene, c: THREE.Camera) => void seen.push(c.layers.isEnabled(SHADOW_ONLY_LAYER)) }
    includeShadowOnlyLayer(sm as unknown as THREE.WebGLShadowMap)
    sm.render([], new THREE.Scene(), cam)
    expect(seen).toEqual([true])
    expect(cam.layers.isEnabled(SHADOW_ONLY_LAYER)).toBe(false)
    expect(cam.layers.isEnabled(0)).toBe(true)
  })
})
