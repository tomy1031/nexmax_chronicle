// 近未来 HUD の時代テーマ・一律の拡大縮小・小さな決まり（ui/future/themes.ts・frame.ts・hudLogic.ts）
import { describe, expect, it } from 'vitest'
import { DESIGN_H, DESIGN_W, FRAME_SPECS, framePolygon, frameMarkup, hudScale, lineWidth } from '../src/ui/future/frame'
import { PAUSE_DEFAULT_TAB, filterHintsForArms, nextPauseTab } from '../src/ui/future/hudLogic'
import { DEFAULT_THEME, HUD_THEMES, PATTERNS, asanohaTile, normalizeTheme, patternDataUri, seigaihaTile, themeClass, themeFromText } from '../src/ui/future/themes'

describe('時代テーマ', () => {
  it('呼ばれないときの既定は 2086', () => {
    expect(DEFAULT_THEME).toBe('2086')
    expect(normalizeTheme(undefined)).toBe('2086')
    expect(normalizeTheme('')).toBe('2086')
  })

  it('ステージの番号（StageKey）をそのまま受け付ける', () => {
    for (const k of HUD_THEMES) expect(normalizeTheme(k)).toBe(k)
  })

  it('年を含む文・別名も受け付け、わからない値は既定に戻す', () => {
    expect(normalizeTheme('1726年　大坂・仕掛け横丁')).toBe('1726')
    expect(normalizeTheme('edo')).toBe('1726')
    expect(normalizeTheme('EDO')).toBe('1726')
    expect(normalizeTheme('present')).toBe('2026')
    expect(normalizeTheme('future')).toBe('2086')
    expect(normalizeTheme('1999')).toBe('2086')
  })

  it('時代の文から年を見つける（読み込み画面の自動切り替え用）', () => {
    expect(themeFromText('2026年　大阪・なんば')).toBe('2026')
    expect(themeFromText('2086年　ナンバタウン')).toBe('2086')
    expect(themeFromText('準備中…')).toBeNull()
    expect(themeFromText(null)).toBeNull()
  })

  it('ルート要素のクラス名', () => {
    expect(themeClass('1726')).toBe('nx-theme-1726')
  })
})

describe('一律の拡大縮小（どの画面でも配置の比率が同じ）', () => {
  it('1600×900 が基準（倍率 1）', () => {
    expect(hudScale(DESIGN_W, DESIGN_H)).toBe(1)
  })

  it('16:9 なら HUD の幅は画面の幅とちょうど同じ（上限・下限なし）', () => {
    for (const [w, h] of [
      [1280, 720],
      [1920, 1080],
      [2560, 1440],
      [640, 360],
    ]) {
      expect(hudScale(w, h) * DESIGN_W).toBeCloseTo(w, 6)
      expect(hudScale(w, h) * DESIGN_H).toBeCloseTo(h, 6)
    }
    expect(hudScale(2560, 1440)).toBeCloseTo(1.6, 6)
  })

  it('16:9 でない画面は小さいほうに合わせる（はみ出さない）', () => {
    // スマホ横（844×390）：高さに合わせる
    expect(hudScale(844, 390)).toBeCloseTo(390 / 900, 6)
    expect(hudScale(844, 390) * DESIGN_W).toBeLessThanOrEqual(844)
    // スマホ縦（390×844）：幅に合わせる
    expect(hudScale(390, 844)).toBeCloseTo(390 / 1600, 6)
    expect(hudScale(390, 844) * DESIGN_H).toBeLessThanOrEqual(844)
    // 4:3
    expect(hudScale(1024, 768)).toBeCloseTo(0.64, 6)
  })

  it('大きさが取れないときは 1', () => {
    expect(hudScale(0, 0)).toBe(1)
    expect(hudScale(Number.NaN, 900)).toBe(1)
  })

  it('枠の形は倍率に比例する（2 倍の画面では 2 倍の位置）', () => {
    const spec = FRAME_SPECS.objective
    const a = framePolygon(400, 90, spec, 1)
    const b = framePolygon(800, 180, spec, 2)
    expect(b.length).toBe(a.length)
    a.forEach(([x, y], i) => {
      expect(b[i][0]).toBeCloseTo(x * 2, 6)
      expect(b[i][1]).toBeCloseTo(y * 2, 6)
    })
  })

  it('線は細め（デザイン 1〜1.5px）で倍率に比例し、消えないよう下限だけある', () => {
    expect(lineWidth(1.25, 1)).toBeCloseTo(1.25, 6)
    expect(lineWidth(1.25, 2)).toBeCloseTo(2.5, 6)
    expect(lineWidth(1.25, 0.2)).toBe(0.75)
  })

  it('枠の SVG に時代の模様の層が入る', () => {
    const m = frameMarkup(800, 128, FRAME_SPECS.dialog, 1)
    expect(m).toContain('class="nx-f-pat"')
    expect(m).toContain('data-slot="band"')
    expect(m).toContain('mask="url(#nxm-r)"')
  })
})

describe('和柄などの模様のタイル', () => {
  it('麻の葉は正三角形の格子（幅 a、高さ a√3）', () => {
    const t = asanohaTile(20)
    expect(t.w).toBe(20)
    expect(t.h).toBeCloseTo(20 * Math.sqrt(3), 6)
    expect(t.lines?.length ?? 0).toBeGreaterThan(50)
  })

  it('青海波は塗りで下の段を隠す（塗り→線の順）', () => {
    const t = seigaihaTile(10)
    expect(t.w).toBe(20)
    expect(t.h).toBe(10)
    expect(t.markup).toContain('pt-fill')
    expect(t.markup!.indexOf('pt-fill')).toBeLessThan(t.markup!.indexOf('pt-line'))
  })

  it('すべての模様が CSS の背景（data URI）にできる', () => {
    for (const name of Object.keys(PATTERNS) as Array<keyof typeof PATTERNS>) {
      const uri = patternDataUri(name, '#f3c865')
      expect(uri.startsWith('url("data:image/svg+xml,')).toBe(true)
      expect(decodeURIComponent(uri)).toContain('stroke="#f3c865"')
    }
  })
})

describe('左腕・キー案内・一時停止のタブ', () => {
  const hints = [
    { key: 'J', label: 'つかむ' },
    { key: 'Q', label: '左腕を選ぶ' },
    { key: 'Space', label: 'ジャンプ' },
  ]

  it('左腕に装備が無いときは Q の案内を出さない', () => {
    expect(filterHintsForArms(hints, false).map((h) => h.key)).toEqual(['J', 'Space'])
  })

  it('左腕に装備があれば Q も出す', () => {
    expect(filterHintsForArms(hints, true).map((h) => h.key)).toEqual(['J', 'Q', 'Space'])
  })

  it('一時停止は「装備・記録」から開き、← → で切り替える', () => {
    expect(PAUSE_DEFAULT_TAB).toBe('equip')
    expect(nextPauseTab('equip', 'ArrowRight')).toBe('controls')
    expect(nextPauseTab('controls', 'ArrowRight')).toBe('equip')
    expect(nextPauseTab('equip', 'ArrowLeft')).toBe('controls')
    expect(nextPauseTab('controls', 'ArrowLeft')).toBe('equip')
    expect(nextPauseTab('controls', 'KeyA')).toBe('controls')
  })
})
