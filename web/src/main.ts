// NEXMAX CHRONICLE ― three.js 版のエントリ。
// 1. ホーム画面のアプリ（PWA）の準備：Service Worker の登録。前に開いたときに新しい版の準備ができていれば、ここで切り替えて読み込み直す。
//    新しい版が出ていれば、タイトル画面でダウンロードして切り替える
// 2. タイトル画面（つづきから／はじめから・ホーム画面への追加の案内・更新の知らせ）。タイトルの曲（audio/）は最初のキー・タップで鳴り始め、
//    ゲームへそのまま引き継ぐ（読み込みの間も鳴っていて、時代の曲へ切り替わる）
// 3. ゲームのシェル（game/game.ts）を起動し、時代ごとのステージ（stages/*）を読み込む
// ?stage=1726|2026|2086 などの開発用のパラメータがあるときは、いままでどおりタイトルを出さずに始める（game/README.md）。
import './game/game.css'
import { defaultStorage } from './core/saveManager'
import { Pwa, isStandalone } from './pwa/pwa'
import { MusicPlayer } from './audio/music'
import { loadSavedPrefs, parsePrefs } from './render/quality'
import { INSTALL_DISMISSED_KEY, detectInstallPlatform, shouldAutoShowInstall, shouldOfferInstall, shouldShowTitle, summarizeSave, type TitleChoice } from './ui/title/titleLogic'
import { preloadTitleArt } from './ui/title/titleArt'

const app = document.getElementById('app') as HTMLDivElement
const ui = document.getElementById('ui') as HTMLDivElement

const pwa = new Pwa()
pwa.listen()

/** ゲームのシェル（物理・後処理などを含む大きいファイル）は、タイトルを出したら裏で読み込み始める */
let gameModule: Promise<typeof import('./game/game')> | null = null
const loadGame = () => (gameModule ??= import('./game/game'))

/** 起動直後の表示（index.html の #boot）を消す */
function hideBoot(): void {
  const b = document.getElementById('boot')
  if (!b) return
  b.classList.add('done')
  setTimeout(() => b.remove(), 400)
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1')
  } catch {
    // 保存できなくても続ける
  }
}

async function main(): Promise<void> {
  if (!shouldShowTitle(location.search)) {
    void pwa.register(false)
    const { startGame } = await loadGame()
    hideBoot()
    await startGame(app, ui)
    return
  }
  // タイトルの一枚絵は、Service Worker の確認と並べて先に読み込み始める
  preloadTitleArt()
  // 新しい版の準備ができていれば、タイトルを出す前に切り替える（遊んでいる途中では切り替えない）
  if ((await pwa.register(true)) === 'reloading') return
  // 公開した直後は、Service Worker がまず前の版を出す。新しい版が出ていないか確かめて、
  // 見つかればタイトル画面でダウンロードしてから切り替える（前の版で遊び始めないように）
  await pwa.checkForUpdate()

  // タイトルの曲（ブラウザの決まりで、最初のキー・タップまでは鳴らない）
  const music = new MusicPlayer(parsePrefs(loadSavedPrefs()).music ?? 2)
  music.installUnlock()
  music.play('title')

  const storage = defaultStorage()
  const save = summarizeSave(storage)
  const standalone = isStandalone()
  const platform = detectInstallPlatform({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    coarse: matchMedia('(pointer: coarse)').matches,
  })
  const ctx = () => ({ standalone: standalone || isStandalone(), platform, dismissed: readFlag(INSTALL_DISMISSED_KEY) })

  const { TitleScreen } = await import('./ui/title/titleScreen')
  const title = new TitleScreen(ui, {
    save,
    pwa,
    platform,
    standalone,
    autoGuide: shouldAutoShowInstall(ctx()),
    onGuideDismissed: () => writeFlag(INSTALL_DISMISSED_KEY),
    offerInstall: () => shouldOfferInstall({ ...ctx(), canPrompt: pwa.canPrompt }),
  })
  // タイトルを見ている間に、ゲームのシェルと、始める時代のステージを読み込んでおく
  setTimeout(() => {
    void loadGame()
      .then(() => import('./game/registry'))
      .then((r) => r.preloadStage(save?.stage ?? r.DEFAULT_STAGE))
      .catch(() => {})
  }, 600)
  const run = title.run()
  hideBoot()
  const choice: TitleChoice = await run
  const gameP = loadGame()
  await title.close()
  const { startGame } = await gameP
  await startGame(app, ui, { mode: choice, music })
}

void main()
