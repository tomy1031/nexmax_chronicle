// URL パラメータ：?quality=low|high、?shot=05|04|overview、?ready（読み込み完了まで描画しない）
export type QualityLevel = 'high' | 'low'

export type QualitySettings = {
  level: QualityLevel
  shadowMapSize: number
  maxPixelRatio: number
  ao: boolean
  aoHalfRes: boolean
  bloom: boolean
  petals: number
}

export function readParams(): { quality: QualitySettings; shot: string | null; fixedRatio: boolean } {
  const p = new URLSearchParams(location.search)
  const level: QualityLevel = p.get('quality') === 'low' ? 'low' : 'high'
  const quality: QualitySettings =
    level === 'high'
      ? { level, shadowMapSize: 2048, maxPixelRatio: 1.5, ao: true, aoHalfRes: false, bloom: true, petals: 700 }
      : { level, shadowMapSize: 1024, maxPixelRatio: 1.0, ao: true, aoHalfRes: true, bloom: true, petals: 250 }
  const shot = p.get('shot')
  return { quality, shot, fixedRatio: shot !== null || p.has('fixed') }
}
