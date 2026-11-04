// 動く部品（人形の胴・頭・腕・脚など、同じ材質の物）を、まとめて 1 回で描く（THREE.BatchedMesh）。
// 動き（ポーズ・歩き）は今までどおり部品の Object3D が受け持ち、そのフレームで最初に描く直前（影 → 画面の順。どちらも
// renderer.render の中で、場面の行列を更新したあと）に、部品の位置・向き・形（入れかわる形も）・見えるかどうかを写す。
// もとの部品は描かない層（31）へ移す（カメラも影も層 0・2 だけを見る）。
// 使う所：主人公ネクマックスの体（world/nexmax/bodyBatch.ts）・2086 年の VR のお客さん（vrFolk.ts）
import * as THREE from 'three'

const HIDDEN_LAYER = 31

type Item = { src: THREE.Mesh; inst: number; geo: THREE.BufferGeometry }

export class PartBatch {
  readonly mesh: THREE.BatchedMesh
  private readonly items: Item[] = []
  private readonly geoIds = new Map<THREE.BufferGeometry, number>()
  private frame = -1
  private readonly inv = new THREE.Matrix4()
  private readonly m = new THREE.Matrix4()

  /**
   * root の下の、pick が true の部品をまとめる（材質は最初の部品と同じ物だけ）。部品が無ければ null。
   * slack：あとで入れかわる形（手の握る・開くなど）のための余り（頂点・index の倍率）
   */
  static create(root: THREE.Object3D, pick: (m: THREE.Mesh) => boolean, name: string, slack = 1.6): PartBatch | null {
    const parts: THREE.Mesh[] = []
    let mat: THREE.Material | null = null
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || !pick(m)) return
      mat ??= m.material
      if (m.material === mat) parts.push(m)
    })
    return parts.length && mat ? new PartBatch(parts, mat, name, slack) : null
  }

  private constructor(parts: THREE.Mesh[], mat: THREE.Material, name: string, slack: number) {
    let verts = 0
    let index = 0
    for (const g of new Set(parts.map((p) => p.geometry))) {
      verts += g.attributes.position.count
      index += g.index?.count ?? 0
    }
    this.mesh = new THREE.BatchedMesh(parts.length, Math.ceil(verts * slack), Math.ceil(index * slack), mat)
    this.mesh.name = name
    this.mesh.castShadow = parts.some((p) => p.castShadow)
    this.mesh.receiveShadow = parts.some((p) => p.receiveShadow)
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
    this.inv.copy(this.mesh.matrixWorld).invert()
    for (const it of this.items) {
      const p = it.src
      if (p.geometry !== it.geo) {
        it.geo = p.geometry
        this.mesh.setGeometryIdAt(it.inst, this.geoId(p.geometry))
      }
      this.mesh.setVisibleAt(it.inst, isShown(p) && top(p) === scene)
      this.mesh.setMatrixAt(it.inst, this.m.multiplyMatrices(this.inv, p.matrixWorld))
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
