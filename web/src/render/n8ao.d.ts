// n8ao には型定義が無いので最小限を宣言する。
declare module 'n8ao' {
  import type { Camera, Color, Scene } from 'three'
  import type { Pass } from 'postprocessing'

  export class N8AOPostPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number)
    configuration: {
      aoRadius: number
      distanceFalloff: number
      intensity: number
      color: Color
      halfRes: boolean
      gammaCorrection: boolean
      screenSpaceRadius: boolean
      aoSamples: number
      denoiseSamples: number
      denoiseRadius: number
      depthAwareUpsampling: boolean
      transparencyAware: boolean
      accumulate: boolean
    }
    /** シーンに半透明の物があれば transparencyAware を自動で入れる（既定 true） */
    autoDetectTransparency: boolean
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra' | 'Neural-Low' | 'Neural-Medium' | 'Neural-High'): void
    setSize(width: number, height: number): void
  }
}
