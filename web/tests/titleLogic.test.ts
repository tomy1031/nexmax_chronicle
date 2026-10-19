// タイトル画面とホーム画面への追加の案内の判断（src/ui/title/titleLogic.ts）。
import { describe, expect, it } from 'vitest'
import { GameSave } from '../src/core/gameSave'
import { StoryState } from '../src/core/storyFlags'
import { TimelineState } from '../src/core/timelineState'
import { detectInstallPlatform, formatSavedAt, shouldAutoShowInstall, shouldOfferInstall, shouldShowTitle, summarizeSave } from '../src/ui/title/titleLogic'
import { FakeStorage } from './helpers'

describe('タイトル画面を出すか', () => {
  it('ふつうに開いたら出す。開発用のパラメータ（?stage= ?continue など）があれば出さない', () => {
    expect(shouldShowTitle('')).toBe(true)
    expect(shouldShowTitle('?quality=low&fps=30')).toBe(true)
    expect(shouldShowTitle('?touch=1')).toBe(true)
    for (const q of ['?stage=2026', '?continue', '?newgame', '?shot=05', '?flags=met_matsui', '?spawn=booth', '?nohud']) expect(shouldShowTitle(q)).toBe(false)
  })
})

describe('つづきからの表示（セーブの要約）', () => {
  it('セーブが無ければ null', () => {
    expect(summarizeSave(new FakeStorage())).toBeNull()
    expect(summarizeSave(null)).toBeNull()
  })

  it('セーブした時代・到着地点・日時を返し、ゲームの状態は変えない', () => {
    const storage = new FakeStorage()
    const story = new StoryState(new TimelineState())
    story.set('met_matsui', true)
    new GameSave(storage).save(story, 2026, 'office', 1_760_000_000_000)
    const s = summarizeSave(storage)
    expect(s).toEqual({ stage: '2026', checkpoint: 'office', savedAt: 1_760_000_000_000 })
  })
})

describe('保存した日時の表示', () => {
  const now = new Date(2026, 9, 19, 9, 0).getTime()
  it('きょう・きのう・日付・去年', () => {
    expect(formatSavedAt(new Date(2026, 9, 19, 8, 5).getTime(), now)).toBe('きょう 8:05')
    expect(formatSavedAt(new Date(2026, 9, 18, 21, 30).getTime(), now)).toBe('きのう 21:30')
    expect(formatSavedAt(new Date(2026, 9, 2, 13, 0).getTime(), now)).toBe('10月2日 13:00')
    expect(formatSavedAt(new Date(2025, 11, 1, 13, 0).getTime(), now)).toBe('2025年12月1日')
    expect(formatSavedAt(0, now)).toBe('')
  })
})

describe('ホーム画面への追加の案内', () => {
  const ua = {
    iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    android: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
    line: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.3.0',
    androidWebView: 'Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  }

  it('端末の見分け（iPad は Mac を名乗るのでタッチ点で見分ける・LINE などの中のブラウザ）', () => {
    expect(detectInstallPlatform({ userAgent: ua.iphone, maxTouchPoints: 5, coarse: true })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: ua.ipad, maxTouchPoints: 5, coarse: true })).toBe('ios')
    expect(detectInstallPlatform({ userAgent: ua.android, maxTouchPoints: 5, coarse: true })).toBe('android')
    expect(detectInstallPlatform({ userAgent: ua.line, maxTouchPoints: 5, coarse: true })).toBe('inapp')
    expect(detectInstallPlatform({ userAgent: ua.androidWebView, maxTouchPoints: 5, coarse: true })).toBe('inapp')
    expect(detectInstallPlatform({ userAgent: ua.mac, maxTouchPoints: 0, coarse: false })).toBe('desktop')
  })

  it('最初の起動で自動で開くのは、スマホ・タブレットで、まだ追加していなくて、閉じたことがないとき', () => {
    expect(shouldAutoShowInstall({ standalone: false, platform: 'ios', dismissed: false })).toBe(true)
    expect(shouldAutoShowInstall({ standalone: false, platform: 'inapp', dismissed: false })).toBe(true)
    expect(shouldAutoShowInstall({ standalone: true, platform: 'ios', dismissed: false })).toBe(false)
    expect(shouldAutoShowInstall({ standalone: false, platform: 'android', dismissed: true })).toBe(false)
    expect(shouldAutoShowInstall({ standalone: false, platform: 'desktop', dismissed: false })).toBe(false)
  })

  it('タイトルの入口：ホーム画面から開いていれば出さない。PC はインストールできるときだけ', () => {
    expect(shouldOfferInstall({ standalone: false, platform: 'ios', dismissed: true, canPrompt: false })).toBe(true)
    expect(shouldOfferInstall({ standalone: true, platform: 'android', dismissed: false, canPrompt: true })).toBe(false)
    expect(shouldOfferInstall({ standalone: false, platform: 'desktop', dismissed: false, canPrompt: false })).toBe(false)
    expect(shouldOfferInstall({ standalone: false, platform: 'desktop', dismissed: false, canPrompt: true })).toBe(true)
  })
})
