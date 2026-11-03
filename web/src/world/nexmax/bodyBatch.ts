// 主人公ネクマックスの体の部品（頭・腕・手・脚・足。同じ「本体」の材質の 13 個）を 1 回で描く（THREE.BatchedMesh）。
// 画面と影で、それぞれ 13 回 → 1 回。動き（ポーズ）は今までどおり部品の Object3D が受け持ち、描く直前に
// 部品の位置・向き・形（手の握る・開く）・見えるかどうかを写す。もとの部品は描かない層（31）へ移す。
// 写すのは、そのフレームで最初に描くとき（影 → 画面の順。どちらも renderer.render の中で、場面の行列を更新したあと）
import * as THREE from 'three'

const HIDDEN_LAYER = 31
const BODY_KEY = 'nxOutline-body'

type Item = { src: THREE.Mesh; inst: number; geo: THREE.BufferGeometry }

export class NexmaxBodyBatch {
  readonly mesh: THREE.BatchedMesh
  private readonly items: Item[] = []
  private readonly geoIds = new Map<THREE.BufferGeometry, number>()
  private frame = -1

  /** 体の部品が無ければ null */
  static create(root: THREE.Object3D): NexmaxBodyBatch | null {
    const parts: THREE.Mesh[] = []
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !Array.isArray(m.material) && m.material.customProgramCacheKey?.() === BODY_KEY) parts.push(m)
    })
    return parts.length ? new NexmaxBodyBatch(parts) : null
  }

  private constructor(parts: THREE.Mesh[]) {
    let verts = 0
    let index = 0
    for (const g of new Set(parts.map((p) => p.geometry))) {
      verts += g.attributes.position.count
      index += g.index?.count ?? 0
    }
    // 手は握る・開くの形が別にある（あとで足す。手のぶんよりじゅうぶん多めの余り）
    this.mesh = new THREE.BatchedMesh(parts.length, Math.ceil(verts * 1.6), Math.ceil(index * 1.6), parts[0].material as THREE.Material)
    this.mesh.name = 'nexmaxBody'
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.customDepthMaterial = parts[0].customDepthMaterial
    for (const p of parts) {
      this.items.push({ src: p, inst: this.mesh.addInstance(this.geoId(p.geometry)), geo: p.geometry })
      p.layers.set(HIDDEN_LAYER)
    }
    const base = this.mesh.onBeforeRender
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    this.mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      if (renderer.info.render.frame !== self.frame) {
        self.frame = renderer.info.render.frame
        self.sync()
      }
      base.call(this, renderer, scene, camera, geometry, material, group)
    }
  }

  private geoId(g: THREE.BufferGeometry): number {
    let id = this.geoIds.get(g)
    if (id === undefined) {
      id = this.mesh.addGeometry(g)
      this.geoIds.set(g, id)
    }
    return id
  }

  /** 部品の位置・向き・形・見えるかどうかを写す（行列は renderer.render が場面を更新したあとのもの） */
  sync(): void {
    // 部品が batch と同じ場面にいないとき（外されたとき）は描かない
    const scene = top(this.mesh)
    for (const it of this.items) {
      const p = it.src
      if (p.geometry !== it.geo) {
        it.geo = p.geometry
        this.mesh.setGeometryIdAt(it.inst, this.geoId(p.geometry))
      }
      this.mesh.setVisibleAt(it.inst, isShown(p) && top(p) === scene)
      this.mesh.setMatrixAt(it.inst, p.matrixWorld)
    }
  }

  dispose(): void {
    for (const it of this.items) it.src.layers.set(0)
    this.mesh.removeFromParent()
    this.mesh.dispose()
  }
}

function top(o: THREE.Object3D): THREE.Object3D {
  let p = o
  while (p.parent) p = p.parent
  return p
}

/** 部品と、その親がみな見えているか */
function isShown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}
