// 主人公ネクマックスの体の部品（頭・腕・手・脚・足。同じ「本体」の材質の 13 個）を 1 回で描く（render/partBatch.ts）。
// 画面と影で、それぞれ 13 回 → 1 回。手の握る・開くの形の入れかわりも写す
import type * as THREE from 'three'
import { PartBatch } from '../../render/partBatch'

const BODY_KEY = 'nxOutline-body'

export const NexmaxBodyBatch = {
  /** 体の部品が無ければ null */
  create(root: THREE.Object3D): PartBatch | null {
    return PartBatch.create(root, (m) => !Array.isArray(m.material) && m.material.customProgramCacheKey?.() === BODY_KEY, 'nexmaxBody')
  },
}
