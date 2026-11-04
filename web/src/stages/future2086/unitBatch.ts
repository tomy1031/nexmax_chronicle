// 量産型NEXMAX の体の部品（頭・腕・手・脚・足。同じ「本体」の材質）を、全員まとめて 1 回で描く（THREE.BatchedMesh）。
// 1 体は部品ごとに 19 回ほど描いていて、2086 年の広場では 8 体で描く回数の 4 分の 1 近くになっていた。
// 動き（ポーズ・歩き）は今までどおり部品の Object3D が受け持ち、毎フレーム、部品の位置と向きを BatchedMesh の 1 つ 1 つへ写す。
// もとの部品は描かない層（31）へ移す。手は握る・開くで形が入れかわるので、そのたびに形の番号を差しかえる。
// カメラから遠い量産型は、分割を半分にした軽い形（nexmaxModel の productionLod）で描く（影も同じ形）。
import * as THREE from 'three'
import { prepareProductionLods, productionLod, type NexmaxCharacter } from '../../world/nexmax/nexmaxModel'

/** 描かない層（カメラも影も層 0 だけを見る） */
const HIDDEN_LAYER = 31
const BODY_KEY = 'nxOutline-body'

/** カメラからこれより遠い（m）量産型は軽い形に。NEAR より近づいたら戻す（境目でちらちら切りかわらないように） */
export const UNIT_LOD_FAR = 9
export const UNIT_LOD_NEAR = 8

/** 遠いかどうか（今の状態から、行き過ぎた方だけ切りかえる） */
export function unitIsFar(wasFar: boolean, dist: number): boolean {
  return wasFar ? dist > UNIT_LOD_NEAR : dist > UNIT_LOD_FAR
}

type Item = { src: THREE.Mesh; inst: number; geo: THREE.BufferGeometry; unit: number }
/** まとめて描かない部品（胴・顔の板など）は、メッシュの形をそのまま差しかえる */
type Swap = { mesh: THREE.Mesh; hi: THREE.BufferGeometry; lo: THREE.BufferGeometry; unit: number }

export class UnitBodyBatch {
  readonly mesh: THREE.BatchedMesh
  private readonly items: Item[] = []
  private readonly swaps: Swap[] = []
  private readonly geoIds = new Map<THREE.BufferGeometry, number>()
  private readonly far: boolean[]
  private readonly eye = new THREE.Vector3()
  private hasEye = false

  /** 体の部品が無ければ null */
  static create(chars: readonly NexmaxCharacter[]): UnitBodyBatch | null {
    const parts: { mesh: THREE.Mesh; unit: number }[] = []
    const swaps: Swap[] = []
    let mat: THREE.Material | null = null
    prepareProductionLods()
    chars.forEach((ch, unit) =>
      ch.root.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh || Array.isArray(m.material)) return
        if (m.material.customProgramCacheKey?.() === BODY_KEY) {
          parts.push({ mesh: m, unit })
          mat ??= m.material
          return
        }
        const lo = (m as THREE.InstancedMesh).isInstancedMesh ? null : productionLod(m.geometry)
        if (lo && lo !== m.geometry) swaps.push({ mesh: m, hi: m.geometry, lo, unit })
      }),
    )
    return parts.length && mat ? new UnitBodyBatch(parts, mat, swaps, chars.length) : null
  }

  private constructor(parts: { mesh: THREE.Mesh; unit: number }[], mat: THREE.Material, swaps: Swap[], units: number) {
    // 量産型は全員で同じ形を使い回す（nexmaxModel）。BatchedMesh へ入れるのも、ちがう形 1 つにつき 1 回（遠く用の軽い形も）
    const geos = new Set<THREE.BufferGeometry>()
    for (const { mesh } of parts) {
      geos.add(mesh.geometry)
      const lo = productionLod(mesh.geometry)
      if (lo) geos.add(lo)
    }
    let verts = 0
    let index = 0
    for (const g of geos) {
      verts += g.attributes.position.count
      index += g.index?.count ?? 0
    }
    // 手は握る・開くの 2 つの形がある。あとから足すぶんの余り（手のぶんよりじゅうぶん多め）
    this.mesh = new THREE.BatchedMesh(parts.length, Math.ceil(verts * 1.6), Math.ceil(index * 1.6), mat)
    this.mesh.name = 'unitBodies'
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    this.mesh.customDepthMaterial = parts[0].mesh.customDepthMaterial
    for (const { mesh: p, unit } of parts) {
      const inst = this.mesh.addInstance(this.geoId(p.geometry))
      this.items.push({ src: p, inst, geo: p.geometry, unit })
      p.layers.set(HIDDEN_LAYER)
    }
    this.swaps = swaps
    this.far = new Array<boolean>(units).fill(false)
    // 画面を描くカメラの位置を覚える（影を描くときは scene が null で呼ばれるので、そのときは見ない）
    const base = this.mesh.onBeforeRender
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    this.mesh.onBeforeRender = function (renderer, scene, camera, geometry, material, group) {
      if (scene) {
        self.eye.setFromMatrixPosition(camera.matrixWorld)
        self.hasEye = true
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

  /** 毎フレーム（体を動かしたあと）：部品の位置・向き・形を写す。遠い量産型は軽い形に */
  sync(chars: readonly NexmaxCharacter[]): void {
    chars.forEach((ch, i) => {
      ch.root.updateMatrixWorld(true)
      if (!this.hasEye) return
      _p.setFromMatrixPosition(ch.root.matrixWorld)
      this.far[i] = unitIsFar(this.far[i], _p.distanceTo(this.eye))
    })
    for (const it of this.items) {
      const p = it.src
      const want = (this.far[it.unit] && productionLod(p.geometry)) || p.geometry
      if (want !== it.geo) {
        it.geo = want
        this.mesh.setGeometryIdAt(it.inst, this.geoId(want))
      }
      this.mesh.setVisibleAt(it.inst, isShown(p))
      this.mesh.setMatrixAt(it.inst, p.matrixWorld)
    }
    for (const s of this.swaps) {
      const want = this.far[s.unit] ? s.lo : s.hi
      if (s.mesh.geometry !== want) s.mesh.geometry = want
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.dispose()
  }
}

const _p = new THREE.Vector3()

/** 部品と、その親がみな見えているか（visible の切りかえはそのまま効かせる） */
function isShown(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false
  return true
}
