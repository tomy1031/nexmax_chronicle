// 量産型NEXMAX の体の部品（頭・腕・手・脚・足。同じ「本体」の材質）を、全員まとめて 1 回で描く（THREE.BatchedMesh）。
// 1 体は部品ごとに 19 回ほど描いていて、2086 年の広場では 8 体で描く回数の 4 分の 1 近くになっていた。
// 動き（ポーズ・歩き）は今までどおり部品の Object3D が受け持ち、毎フレーム、部品の位置と向きを BatchedMesh の 1 つ 1 つへ写す。
// もとの部品は描かない層（31）へ移す。手は握る・開くで形が入れかわるので、そのたびに形の番号を差しかえる。
import * as THREE from 'three'
import type { NexmaxCharacter } from '../../world/nexmax/nexmaxModel'

/** 描かない層（カメラも影も層 0 だけを見る） */
const HIDDEN_LAYER = 31
const BODY_KEY = 'nxOutline-body'

type Item = { src: THREE.Mesh; inst: number; geo: THREE.BufferGeometry }

export class UnitBodyBatch {
  readonly mesh: THREE.BatchedMesh
  private readonly items: Item[] = []
  private readonly geoIds = new Map<THREE.BufferGeometry, number>()

  /** 体の部品が無ければ null */
  static create(chars: readonly NexmaxCharacter[]): UnitBodyBatch | null {
    const parts: THREE.Mesh[] = []
    let mat: THREE.Material | null = null
    for (const ch of chars)
      ch.root.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || Array.isArray(m.material)) return
        if (m.material.customProgramCacheKey?.() !== BODY_KEY) return
        parts.push(m)
        mat ??= m.material
      })
    return parts.length && mat ? new UnitBodyBatch(parts, mat) : null
  }

  private constructor(parts: THREE.Mesh[], mat: THREE.Material) {
    let verts = 0
    let index = 0
    for (const p of parts) {
      verts += p.geometry.attributes.position.count
      index += p.geometry.index?.count ?? 0
    }
    // 手は握る・開くの 2 つの形がある。あとから足すぶんの余り（手のぶんよりじゅうぶん多め）
    this.mesh = new THREE.BatchedMesh(parts.length, Math.ceil(verts * 1.6), Math.ceil(index * 1.6), mat)
    this.mesh.name = 'unitBodies'
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.customDepthMaterial = parts[0].customDepthMaterial
    for (const p of parts) {
      const inst = this.mesh.addInstance(this.geoId(p.geometry))
      this.items.push({ src: p, inst, geo: p.geometry })
      p.layers.set(HIDDEN_LAYER)
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

  /** 毎フレーム（体を動かしたあと）：部品の位置・向き・形を写す */
  sync(chars: readonly NexmaxCharacter[]): void {
    for (const ch of chars) ch.root.updateMatrixWorld(true)
    for (const it of this.items) {
      const p = it.src
      if (p.geometry !== it.geo) {
        it.geo = p.geometry
        this.mesh.setGeometryIdAt(it.inst, this.geoId(p.geometry))
      }
      this.mesh.setVisibleAt(it.inst, isShown(p))
      this.mesh.setMatrixAt(it.inst, p.matrixWorld)
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.dispose()
  }
}

/** 部品と、その親がみな見えているか（visible の切りかえはそのまま効かせる） */
function isShown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}
